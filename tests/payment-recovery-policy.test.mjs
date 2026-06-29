import assert from "node:assert/strict";
import test from "node:test";
import {
  decidePaymentRecoveryQueueAction,
  PAYMENT_RECOVERY_MIN_RETRY_DELAY_SECONDS
} from "../lib/payments/recovery-policy.ts";

const nowMs = Date.parse("2026-06-29T12:00:00Z");
const activeState = {
  status: "retrying",
  wakeAt: "2026-06-29T12:10:00Z",
  attemptCount: 3,
  maxAttempts: 500,
  bookingId: "booking-id",
  reference: "MCR-TEST",
  orderTrackingId: "tracking-id",
  paymentAttemptId: "attempt-id"
};

test("active recovery schedules its canonical next wake-up", () => {
  assert.deepEqual(
    decidePaymentRecoveryQueueAction({
      state: activeState,
      messageAttempt: 3,
      claimed: 1,
      hadErrors: false,
      nowMs
    }),
    { kind: "schedule_next", delaySeconds: 600 }
  );
});

test("an early or failed wake-up cannot be acknowledged without a replacement", () => {
  const dueNow = { ...activeState, wakeAt: "2026-06-29T12:00:00Z" };
  assert.deepEqual(
    decidePaymentRecoveryQueueAction({
      state: dueNow,
      messageAttempt: 3,
      claimed: 0,
      hadErrors: false,
      nowMs
    }),
    { kind: "schedule_next", delaySeconds: PAYMENT_RECOVERY_MIN_RETRY_DELAY_SECONDS }
  );
  assert.deepEqual(
    decidePaymentRecoveryQueueAction({
      state: dueNow,
      messageAttempt: 3,
      claimed: 1,
      hadErrors: true,
      nowMs
    }),
    { kind: "schedule_next", delaySeconds: PAYMENT_RECOVERY_MIN_RETRY_DELAY_SECONDS }
  );
});

test("terminal or missing recovery rows can be acknowledged", () => {
  assert.deepEqual(
    decidePaymentRecoveryQueueAction({
      state: null,
      messageAttempt: 0,
      claimed: 0,
      hadErrors: false,
      nowMs
    }),
    { kind: "complete", reason: "missing" }
  );
  assert.deepEqual(
    decidePaymentRecoveryQueueAction({
      state: { ...activeState, status: "completed" },
      messageAttempt: 4,
      claimed: 1,
      hadErrors: false,
      nowMs
    }),
    { kind: "complete", reason: "completed" }
  );
});

test("exhausted application attempts force the current message toward the DLQ", () => {
  assert.deepEqual(
    decidePaymentRecoveryQueueAction({
      state: { ...activeState, attemptCount: 500 },
      messageAttempt: 500,
      claimed: 0,
      hadErrors: false,
      nowMs
    }),
    { kind: "retry_current", reason: "attempts_exhausted" }
  );
});
