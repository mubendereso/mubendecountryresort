import assert from "node:assert/strict";
import test from "node:test";
import {
  consumePaymentRecoveryBatch,
  PAYMENT_RECOVERY_DLQ_NAME,
  PAYMENT_RECOVERY_QUEUE_NAME,
  PAYMENT_RECOVERY_QUEUE_RETRY_SECONDS
} from "../lib/payments/queue-consumer.mjs";

function fakeMessage(id) {
  const calls = [];
  return {
    id,
    attempts: 1,
    body: { bookingId: id },
    calls,
    ack() { calls.push(["ack"]); },
    retry(options) { calls.push(["retry", options]); }
  };
}

test("successful messages are acknowledged individually", async () => {
  const first = fakeMessage("first");
  const second = fakeMessage("second");
  await consumePaymentRecoveryBatch(
    { queue: PAYMENT_RECOVERY_QUEUE_NAME, messages: [first, second] },
    {
      dispatchRecovery: async () => undefined,
      dispatchDeadLetter: async () => undefined,
      logError: () => undefined
    }
  );
  assert.deepEqual(first.calls, [["ack"]]);
  assert.deepEqual(second.calls, [["ack"]]);
});

test("one failed message retries without replaying successful batch peers", async () => {
  const first = fakeMessage("first");
  const second = fakeMessage("second");
  await consumePaymentRecoveryBatch(
    { queue: PAYMENT_RECOVERY_QUEUE_NAME, messages: [first, second] },
    {
      dispatchRecovery: async (message) => {
        if (message.id === "second") throw new Error("transient");
      },
      dispatchDeadLetter: async () => undefined,
      logError: () => undefined
    }
  );
  assert.deepEqual(first.calls, [["ack"]]);
  assert.deepEqual(second.calls, [["retry", { delaySeconds: PAYMENT_RECOVERY_QUEUE_RETRY_SECONDS }]]);
});

test("DLQ messages are only acknowledged after incident dispatch succeeds", async () => {
  const message = fakeMessage("dead-letter");
  await consumePaymentRecoveryBatch(
    { queue: PAYMENT_RECOVERY_DLQ_NAME, messages: [message] },
    {
      dispatchRecovery: async () => undefined,
      dispatchDeadLetter: async () => { throw new Error("incident write failed"); },
      logError: () => undefined
    }
  );
  assert.deepEqual(message.calls, [["retry", { delaySeconds: PAYMENT_RECOVERY_QUEUE_RETRY_SECONDS }]]);
});

test("unexpected Queue bindings are never dispatched as payment recovery", async () => {
  const message = fakeMessage("unexpected");
  let dispatched = false;
  await consumePaymentRecoveryBatch(
    { queue: "some-other-queue", messages: [message] },
    {
      dispatchRecovery: async () => { dispatched = true; },
      dispatchDeadLetter: async () => { dispatched = true; },
      logError: () => undefined
    }
  );
  assert.equal(dispatched, false);
  assert.deepEqual(message.calls, [["retry", { delaySeconds: PAYMENT_RECOVERY_QUEUE_RETRY_SECONDS }]]);
});
