"use server";

import { headers } from "next/headers";
import { getSql } from "@/lib/db/client";
import { submitPesapalOrder, PesapalInitiationError } from "@/lib/pesapal/client";

export type InitiateBookingResult =
  | { ok: true; redirectUrl: string; reference: string }
  | { ok: false; error: string };

export async function initiateBookingAction(formData: FormData): Promise<InitiateBookingResult> {
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

  // Step 2: Record payment attempt
  let attemptId: string | null = null;
  try {
    const [attempt] = (await sql`
      INSERT INTO payment_attempts (booking_id, merchant_reference, amount_ugx, provider_request_started_at)
      VALUES (${bookingId}::uuid, ${reference}, ${quotedTotalUgx}, now())
      RETURNING id
    `) as { id: string }[];
    attemptId = attempt?.id ?? null;

    if (attemptId) {
      await sql`
        UPDATE bookings SET
          payment_provider = 'pesapal',
          active_payment_attempt_id = ${attemptId}::uuid,
          payment_initiation_attempted_at = now()
        WHERE id = ${bookingId}::uuid
      `;
    }
  } catch (err) {
    console.error("payment_attempt insert failed (non-fatal):", err);
  }

  // Step 3: Derive request origin for Pesapal callback + IPN URLs
  const hdrs = await headers();
  const host = hdrs.get("host") ?? "mubendecountryresort.workers.dev";
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const requestOrigin = `${proto}://${host}`;

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

    if (attemptId) {
      try {
        await sql`
          UPDATE payment_attempts SET
            status = 'rejected',
            failure_message = ${err instanceof Error ? err.message : "Unknown error"},
            failure_phase = 'provider_rejected'
          WHERE id = ${attemptId}::uuid
        `;
        await sql`
          UPDATE bookings SET
            payment_initiation_failure_message = ${err instanceof Error ? err.message : "Unknown error"},
            payment_initiation_failed_at = now()
          WHERE id = ${bookingId}::uuid
        `;
      } catch (logErr) {
        console.error("Failed to log payment initiation failure:", logErr);
      }
    }

    console.error("Pesapal order submission failed:", err);
    return { ok: false, error: msg };
  }

  // Step 5: Persist tracking ID and enqueue recovery
  try {
    await sql`
      UPDATE bookings SET
        order_tracking_id = ${orderTrackingId},
        payment_redirect_url = ${redirectUrl}
      WHERE id = ${bookingId}::uuid
    `;

    if (attemptId) {
      await sql`
        UPDATE payment_attempts SET
          status = 'initiated',
          provider_reference = ${orderTrackingId},
          redirect_url = ${redirectUrl},
          response_received_at = now()
        WHERE id = ${attemptId}::uuid
      `;
    }
  } catch (err) {
    console.error("Post-initiation bookkeeping failed (non-fatal):", err);
  }

  return { ok: true, redirectUrl, reference };
}
