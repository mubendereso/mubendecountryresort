import { after, type NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db/client";
import {
  PaymentBindingError,
  verifyPesapalPaymentForBooking
} from "@/lib/payments/binding";
import { consumeRateLimit } from "@/lib/rate-limit";
import { scheduleDuePendingPaymentRecovery } from "@/lib/payments/recovery";

// MCR-SEC-11: cap how often a single payment's IPN is processed. Genuine
// Pesapal notifications for one tracking id are few; this stops repeated hits
// from growing pesapal_ipn_events or amplifying outbound status calls. We
// still ACK 200 when throttled so Pesapal does not treat it as an error and
// retry-storm.
const IPN_MAX_EVENTS = 15;
const IPN_WINDOW_SECONDS = 600; // 10 minutes

function isDedupeSupportMissing(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("dedupe_key") ||
    error.message.includes("pesapal_ipn_events_dedupe_uidx")
  );
}

async function logIpnEvent(
  sql: ReturnType<typeof getSql>,
  {
    orderTrackingId,
    merchantReference,
    notificationType
  }: { orderTrackingId: string; merchantReference: string; notificationType: string }
): Promise<string | null> {
  const rawPayload = JSON.stringify({ orderTrackingId, merchantReference, notificationType });
  const ipnDedupeKey = [
    orderTrackingId.trim(),
    merchantReference.trim(),
    notificationType.trim()
  ].join(":");

  try {
    const [event] = (await sql`
      INSERT INTO pesapal_ipn_events (
        order_tracking_id,
        notification_type,
        dedupe_key,
        raw_payload
      )
      VALUES (
        ${orderTrackingId},
        ${notificationType},
        ${ipnDedupeKey},
        ${rawPayload}::jsonb
      )
      ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL
      DO NOTHING
      RETURNING id
    `) as { id: string }[];

    if (event?.id) return event.id;

    const [existing] = (await sql`
      SELECT id
      FROM pesapal_ipn_events
      WHERE dedupe_key = ${ipnDedupeKey}
      LIMIT 1
    `) as { id: string }[];
    return existing?.id ?? null;
  } catch (error) {
    if (!isDedupeSupportMissing(error)) throw error;

    const [event] = (await sql`
      INSERT INTO pesapal_ipn_events (order_tracking_id, notification_type, raw_payload)
      VALUES (
        ${orderTrackingId},
        ${notificationType},
        ${rawPayload}::jsonb
      )
      RETURNING id
    `) as { id: string }[];
    return event?.id ?? null;
  }
}

// Pesapal calls this endpoint (GET) after each payment event.
// We must respond within seconds with the IPN acknowledgement JSON.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const orderTrackingId = searchParams.get("OrderTrackingId") ?? "";
  const merchantReference = searchParams.get("OrderMerchantReference") ?? "";
  const notificationType = searchParams.get("OrderNotificationType") ?? "";

  // Always respond 200 HTTP; Pesapal status field conveys success/failure.
  const ack = {
    orderNotificationType: "IPNCHANGE",
    orderTrackingId,
    orderMerchantReference: merchantReference,
    status: 200 as 200 | 500
  };

  if (!orderTrackingId || !merchantReference) {
    ack.status = 500;
    return NextResponse.json(ack);
  }

  // MCR-SEC-11 / MCR-NEW-07: throttle per tracking id before any DB write or
  // outbound Pesapal call. The merchant reference is attacker-controlled, so it
  // must not be part of the limiter key.
  const ipnAllowed = await consumeRateLimit(
    `ipn:${orderTrackingId}`,
    IPN_MAX_EVENTS,
    IPN_WINDOW_SECONDS,
    { failOpen: false }
  );
  if (!ipnAllowed) {
    return NextResponse.json(ack);
  }

  const sql = getSql();

  // Log the raw IPN event first (idempotent insert)
  let ipnEventId: string | null = null;
  try {
    ipnEventId = await logIpnEvent(sql, { orderTrackingId, merchantReference, notificationType });
  } catch (err) {
    console.error("IPN: failed to log event:", err);
    ack.status = 500;
    return NextResponse.json(ack);
  }

  let verifiedPayment: Awaited<ReturnType<typeof verifyPesapalPaymentForBooking>>;
  try {
    verifiedPayment = await verifyPesapalPaymentForBooking({
      orderTrackingId,
      merchantReference
    });
  } catch (err) {
    if (err instanceof PaymentBindingError) {
      console.error("IPN: payment binding rejected:", err.code, merchantReference, orderTrackingId);
    } else {
      console.error("IPN: payment verification failed:", err);
    }
    ack.status = 500;
    return NextResponse.json(ack);
  }

  const { bookingId, currentStatus, transaction } = verifiedPayment;
  const paymentStatus = transaction.paymentStatus;
  const confirmationCode = transaction.confirmationCode;

  try {
    // Confirm on paid from pending_payment OR a soft-cancelled booking (a late
    // IPN reviving a forgotten-tab payment). confirm_booking_payment is
    // idempotent and only revives timeout soft-cancels (payment_expired_at set),
    // so an explicitly/terminally cancelled booking is rejected harmlessly.
    if (paymentStatus === "paid" && (currentStatus === "pending_payment" || currentStatus === "cancelled")) {
      // Atomically check availability and confirm. On race condition the
      // booking is placed into awaiting_confirmation for manual review.
      const [result] = (await sql`
        SELECT success, requires_review, error_code
        FROM confirm_booking_payment(
          ${bookingId}::uuid,
          ${orderTrackingId},
          ${confirmationCode},
          ${verifiedPayment.amountUgx}::bigint
        )
      `) as { success: boolean; requires_review: boolean; error_code: string | null }[];

      if (result?.requires_review) {
        console.warn(
          "IPN: availability conflict for booking",
          merchantReference,
          "— placed in awaiting_confirmation for manual review"
        );
      } else if (!result?.success) {
        console.error("IPN: confirm_booking_payment failed:", result?.error_code, "for", merchantReference);
      }

      // Update the payment attempt record
      await sql`
        UPDATE payment_attempts SET
          verified_payment_status = 'paid',
          verified_at = now(),
          last_verification_response = ${JSON.stringify(transaction.rawResponse)}::jsonb
        WHERE id = ${verifiedPayment.attemptId}::uuid
      `;
    }

    if (ipnEventId) {
      await sql`UPDATE pesapal_ipn_events SET processed_at = now() WHERE id = ${ipnEventId}::uuid`;
    }
  } catch (err) {
    console.error("IPN: booking update failed:", err);
    ack.status = 500;
    return NextResponse.json(ack);
  }

  // An IPN means payment activity is happening — drain the recovery queue so any
  // other stuck bookings get reconciled too. Runs after the ack is returned.
  after(() => scheduleDuePendingPaymentRecovery("ipn"));

  return NextResponse.json(ack);
}
