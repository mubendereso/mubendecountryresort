import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { PaymentRecoveryQueueMessage } from "@/lib/payments/recovery-message";

export { isPaymentRecoveryQueueMessage } from "@/lib/payments/recovery-message";

export const PAYMENT_RECOVERY_INITIAL_DELAY_SECONDS = 7 * 60;
export const PAYMENT_RECOVERY_RETRY_DELAY_SECONDS = 5 * 60;

type PaymentRecoveryQueueBinding = {
  send(
    message: PaymentRecoveryQueueMessage,
    options?: { delaySeconds?: number }
  ): Promise<void>;
};

type CloudflareEnvWithRecoveryQueue = CloudflareEnv & {
  PAYMENT_RECOVERY_QUEUE?: PaymentRecoveryQueueBinding;
};

type EnqueuePaymentRecoveryInput = {
  bookingId: string;
  reference: string;
  orderTrackingId: string;
  paymentAttemptId: string;
};

type EnqueuePaymentRecoveryOptions = {
  delaySeconds?: number;
  attempt?: number;
  reason?: string;
};

function getPaymentRecoveryQueue(): PaymentRecoveryQueueBinding | null {
  try {
    const { env } = getCloudflareContext();
    return (env as CloudflareEnvWithRecoveryQueue).PAYMENT_RECOVERY_QUEUE ?? null;
  } catch {
    return null;
  }
}

export async function enqueuePaymentRecoveryCheck(
  input: EnqueuePaymentRecoveryInput,
  options?: EnqueuePaymentRecoveryOptions
): Promise<void> {
  const queue = getPaymentRecoveryQueue();
  if (!queue) {
    throw new Error("PAYMENT_RECOVERY_QUEUE binding is unavailable.");
  }

  await queue.send(
    {
      kind: "payment_recovery_check",
      bookingId: input.bookingId,
      reference: input.reference,
      orderTrackingId: input.orderTrackingId,
      paymentAttemptId: input.paymentAttemptId,
      queuedAt: new Date().toISOString(),
      attempt: options?.attempt ?? 0
    },
    { delaySeconds: options?.delaySeconds ?? PAYMENT_RECOVERY_INITIAL_DELAY_SECONDS }
  );
}

export async function enqueuePaymentRecoveryCheckSafely(
  input: EnqueuePaymentRecoveryInput,
  options?: EnqueuePaymentRecoveryOptions
): Promise<void> {
  try {
    await enqueuePaymentRecoveryCheck(input, options);
  } catch (error) {
    console.error("payment_recovery_queue_send_failed", {
      bookingId: input.bookingId,
      reference: input.reference,
      error: error instanceof Error ? error.message : "unknown_error"
    });
  }
}
