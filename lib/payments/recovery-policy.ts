export const PAYMENT_RECOVERY_MAX_REENQUEUED_ATTEMPTS = 500;
export const PAYMENT_RECOVERY_MIN_RETRY_DELAY_SECONDS = 5 * 60;
export const PAYMENT_RECOVERY_MAX_DELAY_SECONDS = 24 * 60 * 60;

export type PaymentRecoveryWakeupState = {
  status: "pending" | "processing" | "retrying" | "completed" | "failed";
  wakeAt: string;
  attemptCount: number;
  maxAttempts: number;
  bookingId: string;
  reference: string;
  orderTrackingId: string;
  paymentAttemptId: string | null;
};

export type PaymentRecoveryQueueDecision =
  | { kind: "complete"; reason: "missing" | "completed" | "failed" }
  | { kind: "retry_current"; reason: "attempts_exhausted" }
  | { kind: "schedule_next"; delaySeconds: number };

export function decidePaymentRecoveryQueueAction(input: {
  state: PaymentRecoveryWakeupState | null;
  messageAttempt: number;
  claimed: number;
  hadErrors: boolean;
  nowMs?: number;
}): PaymentRecoveryQueueDecision {
  const { state } = input;
  if (!state) return { kind: "complete", reason: "missing" };
  if (state.status === "completed") return { kind: "complete", reason: "completed" };
  if (state.status === "failed") return { kind: "complete", reason: "failed" };

  if (
    input.messageAttempt >= PAYMENT_RECOVERY_MAX_REENQUEUED_ATTEMPTS ||
    state.attemptCount >= state.maxAttempts
  ) {
    return { kind: "retry_current", reason: "attempts_exhausted" };
  }

  const nowMs = input.nowMs ?? Date.now();
  const wakeAtMs = Date.parse(state.wakeAt);
  const requestedDelay = Number.isFinite(wakeAtMs)
    ? Math.ceil((wakeAtMs - nowMs) / 1000)
    : PAYMENT_RECOVERY_MIN_RETRY_DELAY_SECONDS;
  const minimumDelay =
    input.hadErrors || input.claimed === 0
      ? PAYMENT_RECOVERY_MIN_RETRY_DELAY_SECONDS
      : 1;

  return {
    kind: "schedule_next",
    delaySeconds: Math.min(
      PAYMENT_RECOVERY_MAX_DELAY_SECONDS,
      Math.max(minimumDelay, requestedDelay)
    )
  };
}
