export const PAYMENT_RECOVERY_QUEUE_NAME = "mcr-payment-recovery";
export const PAYMENT_RECOVERY_DLQ_NAME = "mcr-payment-recovery-dlq";
export const PAYMENT_RECOVERY_QUEUE_RETRY_SECONDS = 5 * 60;

export async function consumePaymentRecoveryBatch(
  batch,
  { dispatchRecovery, dispatchDeadLetter, logError = console.error }
) {
  const isRecoveryBatch = batch.queue === PAYMENT_RECOVERY_QUEUE_NAME;
  const isDeadLetterBatch = batch.queue === PAYMENT_RECOVERY_DLQ_NAME;

  for (const message of batch.messages) {
    if (!isRecoveryBatch && !isDeadLetterBatch) {
      logError({
        event: "unexpected_queue_batch",
        queue: batch.queue,
        messageId: message.id,
        attempts: message.attempts
      });
      message.retry({ delaySeconds: PAYMENT_RECOVERY_QUEUE_RETRY_SECONDS });
      continue;
    }

    try {
      if (isDeadLetterBatch) {
        await dispatchDeadLetter(message);
      } else {
        await dispatchRecovery(message);
      }
      message.ack();
    } catch (error) {
      logError({
        event: isDeadLetterBatch
          ? "payment_recovery_dlq_message_failed"
          : "payment_recovery_queue_message_failed",
        queue: batch.queue,
        messageId: message.id,
        attempts: message.attempts,
        error: error instanceof Error ? error.message : "unknown_error"
      });
      message.retry({ delaySeconds: PAYMENT_RECOVERY_QUEUE_RETRY_SECONDS });
    }
  }
}
