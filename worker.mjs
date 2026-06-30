import openNextWorker from "./.open-next/worker.js";
import {
  consumePaymentRecoveryBatch,
  PAYMENT_RECOVERY_DLQ_NAME
} from "./lib/payments/queue-consumer.mjs";

export {
  BucketCachePurge,
  DOQueueHandler,
  DOShardedTagCache
} from "./.open-next/worker.js";

async function dispatchPaymentRecoveryMessage(message, env) {
  if (!env.PAYMENT_RECONCILER) {
    throw new Error("Missing PAYMENT_RECONCILER service binding.");
  }
  const response = await env.PAYMENT_RECONCILER.fetch("https://payment-reconciler.internal/recover", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(message.body)
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Payment recovery route failed (${response.status}): ${detail}`);
  }
}

async function dispatchPaymentRecoveryDeadLetter(message, env) {
  if (!env.PAYMENT_RECONCILER) {
    throw new Error("Missing PAYMENT_RECONCILER service binding.");
  }
  const response = await env.PAYMENT_RECONCILER.fetch("https://payment-reconciler.internal/dlq", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: message.body,
      messageId: message.id,
      attempts: message.attempts,
      queue: PAYMENT_RECOVERY_DLQ_NAME
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Payment recovery DLQ route failed (${response.status}): ${detail}`);
  }
}

const worker = {
  fetch(request, env, ctx) {
    return openNextWorker.fetch(request, env, ctx);
  },

  async queue(batch, env) {
    await consumePaymentRecoveryBatch(batch, {
      dispatchRecovery: (message) => dispatchPaymentRecoveryMessage(message, env),
      dispatchDeadLetter: (message) => dispatchPaymentRecoveryDeadLetter(message, env),
      logError: (entry) => console.error(entry)
    });
  }
};

export default worker;
