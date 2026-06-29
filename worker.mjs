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

const RECOVERY_ROUTE = "/api/internal/payment-recovery/queue";
const RECOVERY_DLQ_ROUTE = "/api/internal/payment-recovery/dlq";
const RECOVERY_SECRET_HEADER = "x-payment-recovery-queue-secret";

function getSiteUrl(env) {
  return (
    env.SITE_URL ||
    env.NEXT_PUBLIC_SITE_URL ||
    "https://mubendecountryresort.mubendecountryresort.workers.dev"
  ).replace(/\/+$/, "");
}

async function dispatchPaymentRecoveryMessage(message, env, ctx) {
  const secret = env.PAYMENT_RECOVERY_QUEUE_SECRET;
  if (!secret) {
    throw new Error("Missing PAYMENT_RECOVERY_QUEUE_SECRET.");
  }

  const url = new URL(RECOVERY_ROUTE, getSiteUrl(env));
  const response = await openNextWorker.fetch(
    new Request(url.toString(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [RECOVERY_SECRET_HEADER]: secret
      },
      body: JSON.stringify(message.body)
    }),
    env,
    ctx
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Payment recovery route failed (${response.status}): ${detail}`);
  }
}

async function dispatchPaymentRecoveryDeadLetter(message, env, ctx) {
  const secret = env.PAYMENT_RECOVERY_QUEUE_SECRET;
  if (!secret) {
    throw new Error("Missing PAYMENT_RECOVERY_QUEUE_SECRET.");
  }

  const url = new URL(RECOVERY_DLQ_ROUTE, getSiteUrl(env));
  const response = await openNextWorker.fetch(
    new Request(url.toString(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [RECOVERY_SECRET_HEADER]: secret
      },
      body: JSON.stringify({
        message: message.body,
        messageId: message.id,
        attempts: message.attempts,
        queue: PAYMENT_RECOVERY_DLQ_NAME
      })
    }),
    env,
    ctx
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Payment recovery DLQ route failed (${response.status}): ${detail}`);
  }
}

const worker = {
  fetch(request, env, ctx) {
    return openNextWorker.fetch(request, env, ctx);
  },

  async queue(batch, env, ctx) {
    await consumePaymentRecoveryBatch(batch, {
      dispatchRecovery: (message) => dispatchPaymentRecoveryMessage(message, env, ctx),
      dispatchDeadLetter: (message) => dispatchPaymentRecoveryDeadLetter(message, env, ctx),
      logError: (entry) => console.error(entry)
    });
  }
};

export default worker;
