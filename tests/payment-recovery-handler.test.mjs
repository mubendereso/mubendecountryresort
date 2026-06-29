import assert from "node:assert/strict";
import test from "node:test";
import { handlePaymentRecoveryQueueMessage } from "../lib/payments/recovery-queue-handler.ts";

const message = {
  kind: "payment_recovery_check",
  bookingId: "booking-id",
  reference: "MCR-TEST",
  orderTrackingId: "tracking-id",
  paymentAttemptId: "attempt-id",
  queuedAt: "2026-06-29T12:00:00Z",
  attempt: 2
};
const active = {
  status: "retrying",
  wakeAt: "2026-06-29T12:10:00Z",
  attemptCount: 3,
  maxAttempts: 500,
  bookingId: "booking-id",
  reference: "MCR-TEST",
  orderTrackingId: "tracking-id",
  paymentAttemptId: "attempt-id"
};
const stats = {
  trigger: "queue",
  claimed: 1,
  completed: 0,
  rescheduled: 1,
  errors: ["Pesapal temporarily unavailable"]
};

test("transient reconciliation error schedules a replacement before success", async () => {
  const enqueued = [];
  const result = await handlePaymentRecoveryQueueMessage(message, {
    getWakeupState: async () => active,
    reconcile: async () => stats,
    enqueue: async (...args) => { enqueued.push(args); },
    nowMs: () => Date.parse("2026-06-29T12:00:00Z")
  });

  assert.equal(result.status, 202);
  assert.equal(result.body.disposition, "replacement_scheduled");
  assert.equal(enqueued.length, 1);
  assert.equal(enqueued[0][1].delaySeconds, 600);
});

test("replacement send failure propagates so the current Queue message retries", async () => {
  await assert.rejects(
    handlePaymentRecoveryQueueMessage(message, {
      getWakeupState: async () => active,
      reconcile: async () => stats,
      enqueue: async () => { throw new Error("Queue send failed"); },
      nowMs: () => Date.parse("2026-06-29T12:00:00Z")
    }),
    /Queue send failed/
  );
});

test("completed recovery is acknowledged without another message", async () => {
  let reconciled = false;
  let enqueued = false;
  const result = await handlePaymentRecoveryQueueMessage(message, {
    getWakeupState: async () => ({ ...active, status: "completed" }),
    reconcile: async () => { reconciled = true; return stats; },
    enqueue: async () => { enqueued = true; }
  });

  assert.equal(result.status, 200);
  assert.equal(reconciled, false);
  assert.equal(enqueued, false);
});
