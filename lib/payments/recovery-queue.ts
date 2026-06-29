import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

export const PAYMENT_RECOVERY_INITIAL_DELAY_SECONDS = 7 * 60;
export const PAYMENT_RECOVERY_RETRY_DELAY_SECONDS = 5 * 60;

export type PaymentRecoveryQueueMessage = {
  kind: "payment_recovery_check";
  bookingId: string;
  reference: string;
  orderTrackingId: string;
  paymentAttemptId: string;
  queuedAt: string;
  attempt: number;
};

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

export function isPaymentRecoveryQueueMessage(value: unknown): value is PaymentRecoveryQueueMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PaymentRecoveryQueueMessage>;
  return (
    candidate.kind === "payment_recovery_check" &&
    typeof candidate.bookingId === "string" &&
    typeof candidate.reference === "string" &&
    typeof candidate.orderTrackingId === "string" &&
    typeof candidate.paymentAttemptId === "string" &&
    typeof candidate.queuedAt === "string" &&
    typeof candidate.attempt === "number" &&
    Number.isInteger(candidate.attempt) &&
    candidate.attempt >= 0
  );
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
