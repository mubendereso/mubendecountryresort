import assert from "node:assert/strict";
import test from "node:test";
import { isPaymentRecoveryQueueMessage } from "../lib/payments/recovery-message.ts";
import {
  isActiveRecoveryStatus,
  normalizeProviderPaymentStatus,
  parseUgxAmount,
  replacementDelaySeconds
} from "../workers/payment-reconciler-policy.ts";

const validMessage = {
  kind: "payment_recovery_check",
  bookingId: "booking-id",
  reference: "MCR-TEST",
  orderTrackingId: "tracking-id",
  paymentAttemptId: "attempt-id",
  queuedAt: "2026-06-30T12:00:00Z",
  attempt: 0
};

test("reconciler accepts only complete payment recovery messages", () => {
  assert.equal(isPaymentRecoveryQueueMessage(validMessage), true);
  assert.equal(isPaymentRecoveryQueueMessage({ ...validMessage, bookingId: "" }), false);
  assert.equal(isPaymentRecoveryQueueMessage({ ...validMessage, attempt: -1 }), false);
  assert.equal(isPaymentRecoveryQueueMessage({ ...validMessage, attempt: 1.5 }), false);
});

test("provider status normalization is fail-closed for paid authority", () => {
  assert.equal(normalizeProviderPaymentStatus("COMPLETED"), "paid");
  assert.equal(normalizeProviderPaymentStatus("FAILED"), "failed");
  assert.equal(normalizeProviderPaymentStatus("REVERSED"), "failed");
  assert.equal(normalizeProviderPaymentStatus("mystery"), "pending");
  assert.equal(normalizeProviderPaymentStatus(null), "pending");
});

test("UGX parser accepts only non-negative whole-unit amounts", () => {
  assert.equal(parseUgxAmount("150,000"), 150000n);
  assert.equal(parseUgxAmount(150000), 150000n);
  assert.equal(parseUgxAmount("150000.25"), null);
  assert.equal(parseUgxAmount("-1"), null);
  assert.equal(parseUgxAmount("not-money"), null);
  assert.equal(parseUgxAmount(null), null);
});

test("replacement wakeups are bounded to Cloudflare Queue delay limits", () => {
  const now = Date.parse("2026-06-30T12:00:00Z");
  assert.equal(replacementDelaySeconds("2026-06-30T12:10:00Z", now), 600);
  assert.equal(replacementDelaySeconds("2026-06-30T11:00:00Z", now), 30);
  assert.equal(replacementDelaySeconds("2026-07-01T12:00:00Z", now), 43_200);
  assert.equal(replacementDelaySeconds("invalid", now), 30);
});

test("only nonterminal recovery states schedule replacements", () => {
  assert.equal(isActiveRecoveryStatus("pending"), true);
  assert.equal(isActiveRecoveryStatus("processing"), true);
  assert.equal(isActiveRecoveryStatus("retrying"), true);
  assert.equal(isActiveRecoveryStatus("completed"), false);
  assert.equal(isActiveRecoveryStatus("failed"), false);
});
