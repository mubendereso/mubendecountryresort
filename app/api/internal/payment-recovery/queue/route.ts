import { NextRequest, NextResponse } from "next/server";
import { reconcileDuePendingPayments } from "@/lib/payments/recovery";
import {
  enqueuePaymentRecoveryCheckSafely,
  isPaymentRecoveryQueueMessage,
  PAYMENT_RECOVERY_RETRY_DELAY_SECONDS
} from "@/lib/payments/recovery-queue";

const QUEUE_SECRET_HEADER = "x-payment-recovery-queue-secret";
const MAX_REENQUEUED_ATTEMPTS = 500;

function getQueueSecret(): string {
  return process.env.PAYMENT_RECOVERY_QUEUE_SECRET?.trim() ?? "";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const queueSecret = getQueueSecret();
  if (!queueSecret || request.headers.get(QUEUE_SECRET_HEADER) !== queueSecret) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!isPaymentRecoveryQueueMessage(body)) {
    return NextResponse.json({ ok: false, error: "invalid_message" }, { status: 400 });
  }

  const stats = await reconcileDuePendingPayments("queue", {
    limit: 1,
    bookingId: body.bookingId
  });

  if (stats.rescheduled > 0 && body.attempt < MAX_REENQUEUED_ATTEMPTS) {
    await enqueuePaymentRecoveryCheckSafely(
      {
        bookingId: body.bookingId,
        reference: body.reference,
        orderTrackingId: body.orderTrackingId,
        paymentAttemptId: body.paymentAttemptId
      },
      {
        attempt: body.attempt + 1,
        delaySeconds: PAYMENT_RECOVERY_RETRY_DELAY_SECONDS,
        reason: "Payment still pending after queue recovery check."
      }
    );
  }

  return NextResponse.json({ ok: true, stats });
}
