"use server";

import { headers } from "next/headers";
import { getSql } from "@/lib/db/client";
import { getSiteOrigin } from "@/lib/env";
import { consumeRateLimit, getClientIp } from "@/lib/rate-limit";
import { enqueuePaymentRecoveryCheckSafely } from "@/lib/payments/recovery-queue";
import { submitPesapalOrder, PesapalInitiationError } from "@/lib/pesapal/client";
import { verifyTurnstileFormData } from "@/lib/turnstile";

// MCR-SEC-09: cap public booking initiations per IP. Each call fans out to
// Neon (booking + payment_attempt rows) and Pesapal (token + order + IPN
// registration), so an unthrottled bot is a cost/availability risk. Generous
// enough for a guest booking several rooms.
const BOOKING_IP_MAX_ATTEMPTS = 10;
const BOOKING_IP_WINDOW_SECONDS = 600; // 10 minutes
const MAX_ROOM_TYPE_SLUG_LENGTH = 120;
const MAX_GUEST_NAME_LENGTH = 120;
const MAX_GUEST_EMAIL_LENGTH = 200;
const MAX_GUEST_PHONE_LENGTH = 40;
const MAX_SPECIAL_REQUESTS_LENGTH = 1000;

export type InitiateBookingResult =
  | { ok: true; redirectUrl: string; reference: string }
  | { ok: false; error: string };

export async function initiateBookingAction(formData: FormData): Promise<InitiateBookingResult> {
  // MCR-SEC-09: honeypot — humans never fill the hidden `website` field.
  if (String(formData.get("website") ?? "").trim().length > 0) {
    return { ok: false, error: "Your booking could not be processed. Please try again." };
  }

  const requestHeaders = await headers();
  const clientIp = getClientIp(requestHeaders);

  const verifiedHuman = await verifyTurnstileFormData(formData, clientIp);
  if (!verifiedHuman) {
    return {
      ok: false,
      error: "Please complete the verification and try again."
    };
  }

  // MCR-SEC-09: per-IP throttle before any DB / Pesapal work.
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
  if (roomTypeSlug.length > MAX_ROOM_TYPE_SLUG_LENGTH) {
    return { ok: false, error: "Please select a valid room type." };
  }
  if (guestFullName.length > MAX_GUEST_NAME_LENGTH) {
    return { ok: false, error: "Please enter a shorter full name." };
  }
  if (guestEmail.length > MAX_GUEST_EMAIL_LENGTH) {
    return { ok: false, error: "Please enter a shorter email address." };
  }
  if ((guestPhone?.length ?? 0) > MAX_GUEST_PHONE_LENGTH) {
    return { ok: false, error: "Please enter a shorter phone number." };
  }
  if ((specialRequests?.length ?? 0) > MAX_SPECIAL_REQUESTS_LENGTH) {
    return { ok: false, error: "Please keep special requests under 1000 characters." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) return { ok: false, error: "Please enter a valid email address." };

  const sql = getSql();

  // Step 1: Create booking via RPC (informational availability check, no inventory hold)
  let bookingId: string;
  let reference: string;
  let quotedTotalUgx: number;
  let paymentCapability: string;

  try {
    const rows = (await sql`
      SELECT booking_id, reference, quoted_total_ugx, payment_capability
      FROM create_online_booking_with_payment_capability(
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
    `) as {
      booking_id: string;
      reference: string;
      quoted_total_ugx: string;
      payment_capability: string;
    }[];

    if (!rows[0]) return { ok: false, error: "Booking could not be created. Please try again." };
    bookingId = rows[0].booking_id;
    reference = rows[0].reference;
    quotedTotalUgx = Number(rows[0].quoted_total_ugx);
    paymentCapability = rows[0].payment_capability;
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
      SELECT
        payment_attempt_id::text AS id,
        reference,
        amount_ugx::text
      FROM public.start_storefront_payment_attempt(
        ${bookingId}::uuid,
        ${paymentCapability}::uuid
      )
    `) as { id: string; reference: string; amount_ugx: string }[];
    if (
      !attempt?.id ||
      attempt.reference !== reference ||
      BigInt(attempt.amount_ugx) !== BigInt(quotedTotalUgx)
    ) {
      throw new Error("Guarded payment attempt returned an invalid binding");
    }
    attemptId = attempt.id;
  } catch (err) {
    const failureMessage = err instanceof Error ? err.message : "Unknown error";

    try {
      await sql`
        SELECT public.record_storefront_payment_initiation_failure(
          ${bookingId}::uuid,
          ${attemptId}::uuid,
          ${paymentCapability}::uuid,
          'pre_provider',
          ${failureMessage}
        )
      `;
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
        SELECT public.record_storefront_payment_initiation_failure(
          ${bookingId}::uuid,
          ${attemptId}::uuid,
          ${paymentCapability}::uuid,
          'provider_rejected',
          ${failureMessage}
        )
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
      SELECT public.record_storefront_payment_initiation_success(
        ${bookingId}::uuid,
        ${attemptId}::uuid,
        ${paymentCapability}::uuid,
        ${orderTrackingId},
        ${redirectUrl}
      )
    `;
  } catch (err) {
    const failureMessage = err instanceof Error ? err.message : "Unknown error";

    try {
      await sql`
        SELECT public.record_storefront_payment_initiation_failure(
          ${bookingId}::uuid,
          ${attemptId}::uuid,
          ${paymentCapability}::uuid,
          'post_provider_unknown',
          ${failureMessage}
        )
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
  await enqueuePaymentRecoveryCheckSafely(
    {
      bookingId,
      reference,
      orderTrackingId,
      paymentAttemptId: attemptId
    },
    { reason: "Booking payment initiated." }
  );

  return { ok: true, redirectUrl, reference };
}
