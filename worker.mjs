import openNextWorker from "./.open-next/worker.js";

export {
  BucketCachePurge,
  DOQueueHandler,
  DOShardedTagCache
} from "./.open-next/worker.js";

const RECOVERY_ROUTE = "/api/internal/payment-recovery/queue";
const RECOVERY_SECRET_HEADER = "x-payment-recovery-queue-secret";
const QUEUE_ERROR_RETRY_SECONDS = 5 * 60;

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

export default {
  fetch(request, env, ctx) {
    return openNextWorker.fetch(request, env, ctx);
  },

  async queue(batch, env, ctx) {
    for (const message of batch.messages) {
      try {
        await dispatchPaymentRecoveryMessage(message, env, ctx);
      } catch (error) {
        console.error("payment_recovery_queue_message_failed", {
          error: error instanceof Error ? error.message : "unknown_error"
        });
        if (typeof message.retry === "function") {
          message.retry({ delaySeconds: QUEUE_ERROR_RETRY_SECONDS });
        }
      }
    }
  }
};
