import "server-only";

import { getSql } from "@/lib/db/client";
import { getPesapalTransactionStatus } from "@/lib/pesapal/client";

// Durable pending-payment recovery (ported in shape from
// thesmokehouse/lib/payments/order-payments.ts). The DB plumbing already exists
// in the shared Neon schema (admin db/0001_init.sql): the
// `pending_payment_recoveries` queue + `enqueue_pending_payment_recovery` and
// `claim_pending_payment_recoveries` RPCs. This module wires the application
// side: enqueue on initiation, then claim → re-verify with Pesapal → confirm or
// reschedule. It mirrors the IPN handler's confirm path so a dropped/late IPN
// is eventually reconciled.

const PROCESS_LIMIT = 10;
const BACKOFF_BASE_SECONDS = 30;
const BACKOFF_MAX_SECONDS = 3600; // 1 hour

type RecoveryRow = {
  id: string;
  booking_id: string;
  order_tracking_id: string;
  attempt_count: number;
};

type RecoveryOutcome = "completed" | "rescheduled";

export type PendingPaymentRecoveryStats = {
  trigger: string;
  claimed: number;
  completed: number;
  rescheduled: number;
  errors: string[];
};

/**
 * Enqueue a booking's tracked payment for recovery. Best-effort: failures are
 * logged but never block the booking/payment flow that calls it.
 */
export async function enqueuePendingPaymentRecoverySafely(input: {
  bookingId: string;
  orderTrackingId: string;
  reason?: string;
}): Promise<void> {
  try {
    const sql = getSql();
    await sql`
      select public.enqueue_pending_payment_recovery(
        ${input.bookingId}::uuid,
        ${input.orderTrackingId},
        'pesapal',
        ${input.reason ?? null}
      )
    `;
  } catch (error) {
    console.error("enqueue_pending_payment_recovery_failed", {
      bookingId: input.bookingId,
      error: error instanceof Error ? error.message : "unknown_error"
    });
  }
}

function backoffSeconds(attemptCount: number): number {
  const exponent = Math.min(Math.max(attemptCount, 0), 12);
  return Math.min(BACKOFF_MAX_SECONDS, BACKOFF_BASE_SECONDS * 2 ** exponent);
}

async function completeRecovery(id: string): Promise<void> {
  const sql = getSql();
  await sql`
    update public.pending_payment_recoveries
    set status = 'completed', completed_at = now(), last_verified_at = now(), locked_at = null
    where id = ${id}::uuid
  `;
}

async function rescheduleRecovery(row: RecoveryRow, reason: string): Promise<void> {
  const sql = getSql();
  await sql`
    update public.pending_payment_recoveries
    set
      status = 'retrying',
      next_attempt_at = now() + make_interval(secs => ${backoffSeconds(row.attempt_count)}),
      last_verified_at = now(),
      last_error = ${reason},
      locked_at = null
    where id = ${row.id}::uuid
  `;
}

async function processClaimedRecovery(row: RecoveryRow): Promise<RecoveryOutcome> {
  const sql = getSql();

  const [booking] = (await sql`
    select id::text, status, order_tracking_id
    from bookings
    where id = ${row.booking_id}::uuid
    limit 1
  `) as { id: string; status: string; order_tracking_id: string | null }[];

  // Booking gone, or already past pending_payment (confirmed/awaiting/cancelled):
  // nothing left to recover.
  if (!booking || booking.status !== "pending_payment") {
    await completeRecovery(row.id);
    return "completed";
  }

  const trackingId = row.order_tracking_id || booking.order_tracking_id;
  if (!trackingId) {
    await rescheduleRecovery(row, "Booking has no Pesapal tracking id yet.");
    return "rescheduled";
  }

  const status = await getPesapalTransactionStatus(trackingId);

  if (status.paymentStatus === "paid") {
    // Same idempotent confirm path the IPN uses.
    await sql`
      select success, requires_review, error_code
      from confirm_booking_payment(
        ${row.booking_id}::uuid,
        ${trackingId},
        ${status.confirmationCode}
      )
    `;
    await completeRecovery(row.id);
    return "completed";
  }

  if (status.paymentStatus === "failed") {
    // Terminal at the provider (FAILED/REVERSED). Stop polling; leave the
    // booking unconfirmed (it was never reserved — see booking-reservation rule).
    await completeRecovery(row.id);
    return "completed";
  }

  await rescheduleRecovery(row, "Provider still reports pending.");
  return "rescheduled";
}

/**
 * Claim a batch of due recoveries and re-verify each against Pesapal. Safe to
 * run concurrently across isolates — the claim RPC uses FOR UPDATE SKIP LOCKED.
 */
export async function reconcileDuePendingPayments(
  trigger: string,
  options?: { limit?: number }
): Promise<PendingPaymentRecoveryStats> {
  const stats: PendingPaymentRecoveryStats = {
    trigger,
    claimed: 0,
    completed: 0,
    rescheduled: 0,
    errors: []
  };

  try {
    const sql = getSql();
    const claimed = (await sql`
      select id::text, booking_id::text, order_tracking_id, attempt_count
      from claim_pending_payment_recoveries(${options?.limit ?? PROCESS_LIMIT}, ${trigger}, null)
    `) as RecoveryRow[];
    stats.claimed = claimed.length;

    for (const row of claimed) {
      try {
        const outcome = await processClaimedRecovery(row);
        if (outcome === "completed") {
          stats.completed += 1;
        } else {
          stats.rescheduled += 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "recovery_failed";
        stats.errors.push(message);
        // Release the claim so it retries later rather than staying locked.
        await rescheduleRecovery(row, message).catch((rescheduleError) => {
          stats.errors.push(
            rescheduleError instanceof Error ? rescheduleError.message : "reschedule_failed"
          );
        });
      }
    }
  } catch (error) {
    stats.errors.push(error instanceof Error ? error.message : "claim_failed");
  }

  if (stats.errors.length > 0) {
    console.warn("pending_payment_recovery_completed_with_errors", stats);
  }

  return stats;
}

// Singleton guard so overlapping triggers within one isolate coalesce into a
// single in-flight drain instead of stacking.
let inFlight: Promise<PendingPaymentRecoveryStats> | null = null;

export function scheduleDuePendingPaymentRecovery(trigger: string): Promise<PendingPaymentRecoveryStats> {
  if (inFlight) {
    return inFlight;
  }
  inFlight = reconcileDuePendingPayments(trigger).finally(() => {
    inFlight = null;
  });
  return inFlight;
}
