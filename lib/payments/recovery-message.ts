export type PaymentRecoveryQueueMessage = {
  kind: "payment_recovery_check";
  bookingId: string;
  reference: string;
  orderTrackingId: string;
  paymentAttemptId: string;
  queuedAt: string;
  attempt: number;
};

export function isPaymentRecoveryQueueMessage(
  value: unknown
): value is PaymentRecoveryQueueMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PaymentRecoveryQueueMessage>;
  return (
    candidate.kind === "payment_recovery_check" &&
    typeof candidate.bookingId === "string" &&
    candidate.bookingId.length > 0 &&
    typeof candidate.reference === "string" &&
    candidate.reference.length > 0 &&
    typeof candidate.orderTrackingId === "string" &&
    candidate.orderTrackingId.length > 0 &&
    typeof candidate.paymentAttemptId === "string" &&
    candidate.paymentAttemptId.length > 0 &&
    typeof candidate.queuedAt === "string" &&
    typeof candidate.attempt === "number" &&
    Number.isInteger(candidate.attempt) &&
    candidate.attempt >= 0
  );
}
