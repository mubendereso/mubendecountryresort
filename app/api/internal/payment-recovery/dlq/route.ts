import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db/client";
import { isPaymentRecoveryQueueMessage } from "@/lib/payments/recovery-queue";

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

  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "invalid_message" }, { status: 400 });
  }

  const candidate = body as {
    message?: unknown;
    messageId?: unknown;
    attempts?: unknown;
    queue?: unknown;
  };
  if (
    !isPaymentRecoveryQueueMessage(candidate.message) ||
    typeof candidate.messageId !== "string" ||
    candidate.messageId.length === 0 ||
    candidate.messageId.length > 200 ||
    typeof candidate.attempts !== "number" ||
    !Number.isInteger(candidate.attempts) ||
    candidate.attempts < 0 ||
    candidate.queue !== "mcr-payment-recovery-dlq"
  ) {
    return NextResponse.json({ ok: false, error: "invalid_message" }, { status: 400 });
  }

  const sql = getSql();
  await sql`
    select public.record_payment_recovery_dlq_incident(
      ${candidate.message.bookingId}::uuid,
      ${candidate.message.orderTrackingId},
      ${candidate.messageId},
      ${candidate.attempts},
      ${JSON.stringify(candidate.message)}::jsonb
    )
  `;

  console.error({
    event: "payment_recovery_dead_lettered",
    bookingId: candidate.message.bookingId,
    reference: candidate.message.reference,
    orderTrackingId: candidate.message.orderTrackingId,
    messageId: candidate.messageId,
    attempts: candidate.attempts
  });

  return NextResponse.json({ ok: true, recorded: true });
}
