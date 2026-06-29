import { NextRequest, NextResponse } from "next/server";
import {
  getPaymentRecoveryWakeupState,
  reconcileDuePendingPayments
} from "@/lib/payments/recovery";
import {
  enqueuePaymentRecoveryCheck,
  isPaymentRecoveryQueueMessage
} from "@/lib/payments/recovery-queue";
import { handlePaymentRecoveryQueueMessage } from "@/lib/payments/recovery-queue-handler";

const QUEUE_SECRET_HEADER = "x-payment-recovery-queue-secret";

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

  const result = await handlePaymentRecoveryQueueMessage(body, {
    getWakeupState: getPaymentRecoveryWakeupState,
    reconcile: reconcileDuePendingPayments,
    enqueue: enqueuePaymentRecoveryCheck
  });
  return NextResponse.json(result.body, { status: result.status });
}
