import { type NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db/client";
import { getPesapalTransactionStatus } from "@/lib/pesapal/client";

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

  const sql = getSql();

  // Log the raw IPN event first (idempotent insert)
  let ipnEventId: string | null = null;
  try {
    const [event] = (await sql`
      INSERT INTO pesapal_ipn_events (order_tracking_id, notification_type, raw_payload)
      VALUES (
        ${orderTrackingId},
        ${notificationType},
        ${JSON.stringify({ orderTrackingId, merchantReference, notificationType })}::jsonb
      )
      RETURNING id
    `) as { id: string }[];
    ipnEventId = event?.id ?? null;
  } catch (err) {
    console.error("IPN: failed to log event:", err);
    ack.status = 500;
    return NextResponse.json(ack);
  }

  // Look up booking by our merchant reference
  let bookingId: string | null = null;
  let currentStatus: string | null = null;
  try {
    const [booking] = (await sql`
      SELECT id, status FROM bookings WHERE reference = ${merchantReference} LIMIT 1
    `) as { id: string; status: string }[];
    bookingId = booking?.id ?? null;
    currentStatus = booking?.status ?? null;
  } catch (err) {
    console.error("IPN: booking lookup failed:", err);
    ack.status = 500;
    return NextResponse.json(ack);
  }

  if (!bookingId) {
    console.error("IPN: no booking found for reference:", merchantReference);
    ack.status = 500;
    return NextResponse.json(ack);
  }

  // Verify payment status with Pesapal
  let paymentStatus: "pending" | "paid" | "failed";
  let confirmationCode: string | null = null;
  try {
    const result = await getPesapalTransactionStatus(orderTrackingId);
    paymentStatus = result.paymentStatus;
    confirmationCode = result.confirmationCode;
  } catch (err) {
    console.error("IPN: getPesapalTransactionStatus failed:", err);
    ack.status = 500;
    return NextResponse.json(ack);
  }

  try {
    if (paymentStatus === "paid" && currentStatus === "pending_payment") {
      // Transition booking to confirmed (idempotent: WHERE status = 'pending_payment')
      await sql`
        UPDATE bookings SET
          status = 'confirmed',
          payment_reference = ${confirmationCode},
          paid_at = now()
        WHERE id = ${bookingId}::uuid AND status = 'pending_payment'
      `;

      // Update the payment attempt record
      await sql`
        UPDATE payment_attempts SET
          verified_payment_status = 'paid',
          verified_at = now(),
          last_verification_response = ${JSON.stringify({ paymentStatus, confirmationCode })}::jsonb
        WHERE booking_id = ${bookingId}::uuid
          AND (provider_reference = ${orderTrackingId} OR merchant_reference = ${merchantReference})
      `;

      // Mark the recovery queue item as completed
      await sql`
        UPDATE pending_payment_recoveries SET
          status = 'completed',
          completed_at = now()
        WHERE booking_id = ${bookingId}::uuid AND order_tracking_id = ${orderTrackingId}
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

  return NextResponse.json(ack);
}
