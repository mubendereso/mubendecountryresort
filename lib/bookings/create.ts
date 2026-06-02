"use server";

import { headers } from "next/headers";
import { getSql } from "@/lib/db/client";
import { getSiteOrigin } from "@/lib/env";
import { consumeRateLimit, getClientIp } from "@/lib/rate-limit";
import { enqueuePendingPaymentRecoverySafely } from "@/lib/payments/recovery";
import { submitPesapalOrder, PesapalInitiationError } from "@/lib/pesapal/client";

// MCR-SEC-09: cap public booking initiations per IP. Each call fans out to
// Neon (booking + payment_attempt rows) and Pesapal (token + order + IPN
// registration), so an unthrottled bot is a cost/availability risk. Generous
// enough for a guest booking several rooms.
const BOOKING_IP_MAX_ATTEMPTS = 10;
const BOOKING_IP_WINDOW_SECONDS = 600; // 10 minutes

export type InitiateBookingResult =
  | { ok: true; redirectUrl: string; reference: string }
  | { ok: false; error: string };

export async function initiateBookingAction(formData: FormData): Promise<InitiateBookingResult> {
  // MCR-SEC-09: honeypot — humans never fill the hidden `website` field.
  if (String(formData.get("website") ?? "").trim().length > 0) {
    return { ok: false, error: "Your booking could not be processed. Please try again." };
  }

  // MCR-SEC-09: per-IP throttle before any DB / Pesapal work.
  const clientIp = getClientIp(await headers());
  const allowed = await consumeRateLimit(
    `booking:ip:${clientIp}`,
    BOOKING_IP_MAX_ATTEMPTS,
    BOOKING_IP_WINDOW_SECONDS,
    { failOpen: false }
  );
  if (!allowed) {
    return {
      ok: false,
      error: "Too many booking attempts. Please wait a few minutes and try again."
    };
  }

  const roomTypeSlug = String(formData.get("roomTypeSlug") ?? "").trim();
  const checkIn = String(formData.get("checkIn") ?? "").trim();
  const checkOut = String(formData.get("checkOut") ?? "").trim();
  const guestsAdults = Math.max(1, parseInt(String(formData.get("guestsAdults") ?? "1"), 10) || 1);
  const guestsChildren = Math.max(0, parseInt(String(formData.get("guestsChildren") ?? "0"), 10) || 0);
  const guestFullName = String(formData.get("guestFullName") ?? "").trim();
  const guestEmail = String(formData.get("guestEmail") ?? "").trim().toLowerCase();
  const guestPhone = String(formData.get("guestPhone") ?? "").trim() || null;
  const specialRequests = String(formData.get("specialRequests") ?? "").trim() || null;

  if (!roomTypeSlug) return { ok: false, error: "Please select a room type." };
  if (!checkIn || !checkOut) return { ok: false, error: "Please select check-in and check-out dates." };
  if (checkIn >= checkOut) return { ok: false, error: "Check-out must be after check-in." };
  if (!guestFullName || guestFullName.length < 2) return { ok: false, error: "Please enter your full name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) return { ok: false, error: "Please enter a valid email address." };

  const sql = getSql();

  // Step 1: Create booking via RPC (informational availability check, no inventory hold)
  let bookingId: string;
  let reference: string;
  let quotedTotalUgx: number;

  try {
    const rows = (await sql`
      SELECT booking_id, reference, quoted_total_ugx
      FROM create_online_booking(
        ${roomTypeSlug}::text,
        ${checkIn}::date,
        ${checkOut}::date,
        ${guestsAdults}::int,
        ${guestsChildren}::int,
        ${guestFullName}::text,
        ${guestEmail}::text,
        ${guestPhone}::text,
        ${specialRequests}::text
      )
    `) as { booking_id: string; reference: string; quoted_total_ugx: string }[];

    if (!rows[0]) return { ok: false, error: "Booking could not be created. Please try again." };
    bookingId = rows[0].booking_id;
    reference = rows[0].reference;
    quotedTotalUgx = Number(rows[0].quoted_total_ugx);
  } catch (err) {
    const msg = err instanceof Error ? err.message.toLowerCase() : "";
    if (msg.includes("availability") || msg.includes("available")) {
      return { ok: false, error: "Sorry, this room is not available for the selected dates." };
    }
    if (msg.includes("past")) {
      return { ok: false, error: "Check-in date cannot be in the past." };
    }
    console.error("create_booking RPC failed:", err);
    return { ok: false, error: "Booking could not be created. Please try again." };
  }

  // Step 2: Record and attach the payment attempt before contacting Pesapal.
  // If this local binding cannot be persisted, do not create a provider order:
  // a later paid callback/IPN must be able to prove it belongs to this booking.
  let attemptId: string | null = null;
  try {
    const [attempt] = (await sql`
      INSERT INTO payment_attempts (booking_id, merchant_reference, amount_ugx, provider_request_started_at)
      VALUES (${bookingId}::uuid, ${reference}, ${quotedTotalUgx}, now())
      RETURNING id
    `) as { id: string }[];
    if (!attempt?.id) {
      throw new Error("payment_attempt insert returned no id");
    }
    attemptId = attempt.id;

    await sql`
      UPDATE bookings SET
        payment_provider = 'pesapal',
        active_payment_attempt_id = ${attemptId}::uuid,
        payment_initiation_attempted_at = now()
      WHERE id = ${bookingId}::uuid
    `;
  } catch (err) {
    const failureMessage = err instanceof Error ? err.message : "Unknown error";

    try {
      await sql`
        UPDATE bookings SET
          status = 'cancelled',
          payment_initiation_failure_code = 'pre_provider',
          payment_initiation_failure_message = ${failureMessage},
          payment_initiation_failed_at = now()
        WHERE id = ${bookingId}::uuid AND status = 'pending_payment'
      `;

      if (attemptId) {
        await sql`
          UPDATE payment_attempts SET
            status = 'failed',
            failure_message = ${failureMessage},
            failure_phase = 'pre_provider'
          WHERE id = ${attemptId}::uuid
        `;
      }
    } catch (logErr) {
      console.error("Failed to cancel pre-provider payment binding failure:", logErr);
    }

    console.error("Payment attempt binding failed before Pesapal order:", err);
    return { ok: false, error: "Payment could not be prepared. Please try again." };
  }

  // Step 3: Use the pinned canonical origin for Pesapal callback + IPN URLs.
  // MCR-SEC-08: never derive these from the request Host header — a forged
  // Host could register attacker-controlled callback/IPN URLs with Pesapal.
  const requestOrigin = getSiteOrigin();

  // Step 4: Submit order to Pesapal
  let orderTrackingId: string;
  let redirectUrl: string;

  try {
    const result = await submitPesapalOrder({
      reference,
      amountUGX: quotedTotalUgx,
      description: `Mubende Country Resort — ${reference}`,
      guestName: guestFullName,
      email: guestEmail,
      phone: guestPhone,
      requestOrigin
    });

    orderTrackingId = result.order_tracking_id!;
    redirectUrl = result.redirect_url!;
  } catch (err) {
    const msg = err instanceof PesapalInitiationError
      ? err.message
      : "Payment could not be initiated. Please try again.";
    const failureMessage = err instanceof Error ? err.message : "Unknown error";

    // Pesapal rejected initiation: no tracking id was ever issued, so this
    // booking can never be paid, verified, or recovered. Cancel it now
    // (terminal — no payment_expired_at) instead of stranding it in
    // pending_payment with no tracking id. Runs regardless of attemptId.
    try {
      await sql`
        UPDATE bookings SET
          status = 'cancelled',
          payment_initiation_failure_code = 'provider_rejected',
          payment_initiation_failure_message = ${failureMessage},
          payment_initiation_failed_at = now()
        WHERE id = ${bookingId}::uuid AND status = 'pending_payment'
      `;

      await sql`
        UPDATE payment_attempts SET
          status = 'rejected',
          failure_message = ${failureMessage},
          failure_phase = 'provider_rejected'
        WHERE id = ${attemptId}::uuid
      `;
    } catch (logErr) {
      console.error("Failed to cancel rejected booking initiation:", logErr);
    }

    console.error("Pesapal order submission failed:", err);
    return { ok: false, error: msg };
  }

  // Step 5: Persist tracking ID before redirecting the guest. This is not
  // best-effort: IPN/callback confirmation requires the stored booking and
  // active payment attempt to match the Pesapal transaction exactly.
  try {
    await sql`
      UPDATE bookings SET
        order_tracking_id = ${orderTrackingId},
        active_payment_attempt_id = ${attemptId}::uuid,
        payment_redirect_url = ${redirectUrl}
      WHERE id = ${bookingId}::uuid
    `;

    await sql`
      UPDATE payment_attempts SET
        status = 'initiated',
        provider_reference = ${orderTrackingId},
        redirect_url = ${redirectUrl},
        response_received_at = now()
      WHERE id = ${attemptId}::uuid
    `;
  } catch (err) {
    const failureMessage = err instanceof Error ? err.message : "Unknown error";

    try {
      await sql`
        UPDATE bookings SET
          payment_initiation_failure_code = 'post_provider_unknown',
          payment_initiation_failure_message = ${failureMessage},
          payment_initiation_failed_at = now()
        WHERE id = ${bookingId}::uuid
      `;

      await sql`
        UPDATE payment_attempts SET
          status = 'failed',
          failure_message = ${failureMessage},
          failure_phase = 'post_provider_unknown'
        WHERE id = ${attemptId}::uuid
      `;
    } catch (logErr) {
      console.error("Failed to record post-initiation bookkeeping failure:", logErr);
    }

    console.error("Post-initiation bookkeeping failed; refusing Pesapal redirect:", err);
    return {
      ok: false,
      error: "Payment was created but could not be linked safely. Please contact the resort before paying."
    };
  }

  // Durably track this payment so a dropped/late Pesapal IPN is still
  // reconciled by the recovery loop. Best-effort; never blocks the redirect.
  await enqueuePendingPaymentRecoverySafely({
    bookingId,
    orderTrackingId,
    reason: "Booking payment initiated."
  });

  return { ok: true, redirectUrl, reference };
}
