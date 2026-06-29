import type { PaymentRecoveryQueueMessage } from "./recovery-queue.ts";
import {
  decidePaymentRecoveryQueueAction,
  type PaymentRecoveryWakeupState
} from "./recovery-policy.ts";

type RecoveryStats = {
  trigger: string;
  claimed: number;
  completed: number;
  rescheduled: number;
  errors: string[];
};

type RecoveryQueueHandlerDependencies = {
  getWakeupState(input: {
    bookingId: string;
    orderTrackingId: string;
  }): Promise<PaymentRecoveryWakeupState | null>;
  reconcile(
    trigger: string,
    options: { limit: number; bookingId: string }
  ): Promise<RecoveryStats>;
  enqueue(
    input: {
      bookingId: string;
      reference: string;
      orderTrackingId: string;
      paymentAttemptId: string;
    },
    options: { attempt: number; delaySeconds: number; reason: string }
  ): Promise<void>;
  nowMs?: () => number;
};

export type RecoveryQueueHandlerResult = {
  status: 200 | 202 | 503;
  body: Record<string, unknown>;
};

export async function handlePaymentRecoveryQueueMessage(
  message: PaymentRecoveryQueueMessage,
  dependencies: RecoveryQueueHandlerDependencies
): Promise<RecoveryQueueHandlerResult> {
  const before = await dependencies.getWakeupState({
    bookingId: message.bookingId,
    orderTrackingId: message.orderTrackingId
  });

  if (!before || before.status === "completed" || before.status === "failed") {
    return { status: 200, body: { ok: true, disposition: "terminal_or_stale" } };
  }

  const stats = await dependencies.reconcile("queue", {
    limit: 1,
    bookingId: message.bookingId
  });
  const state = await dependencies.getWakeupState({
    bookingId: message.bookingId,
    orderTrackingId: message.orderTrackingId
  });
  const decision = decidePaymentRecoveryQueueAction({
    state,
    messageAttempt: message.attempt,
    claimed: stats.claimed,
    hadErrors: stats.errors.length > 0,
    nowMs: dependencies.nowMs?.()
  });

  if (decision.kind === "retry_current") {
    return {
      status: 503,
      body: { ok: false, error: decision.reason, stats }
    };
  }

  if (decision.kind === "schedule_next" && state) {
    await dependencies.enqueue(
      {
        bookingId: state.bookingId,
        reference: state.reference,
        orderTrackingId: state.orderTrackingId,
        paymentAttemptId: state.paymentAttemptId ?? message.paymentAttemptId
      },
      {
        attempt: message.attempt + 1,
        delaySeconds: decision.delaySeconds,
        reason: "Payment recovery remains active after queue processing."
      }
    );
    return {
      status: 202,
      body: {
        ok: true,
        disposition: "replacement_scheduled",
        delaySeconds: decision.delaySeconds,
        stats
      }
    };
  }

  if (decision.kind === "complete") {
    return {
      status: 200,
      body: { ok: true, disposition: decision.reason, stats }
    };
  }

  return {
    status: 503,
    body: { ok: false, error: "active_recovery_state_missing", stats }
  };
}
