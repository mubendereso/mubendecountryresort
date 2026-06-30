import { neon } from "@neondatabase/serverless";
import {
  isPaymentRecoveryQueueMessage,
  type PaymentRecoveryQueueMessage
} from "../lib/payments/recovery-message";
import {
  isActiveRecoveryStatus,
  normalizeProviderPaymentStatus,
  parseUgxAmount,
  replacementDelaySeconds,
  type NormalizedProviderPaymentStatus
} from "./payment-reconciler-policy";

const RECOVER_PATH = "/recover";
const DLQ_PATH = "/dlq";
const REQUEST_TIMEOUT_MS = 10_000;

type PesapalTokenResponse = {
  token?: string;
  message?: string | null;
  error?: { message?: string | null } | null;
};

type PesapalStatusResponse = {
  payment_status_description?: string | null;
  confirmation_code?: string | null;
  order_tracking_id?: string | null;
  merchant_reference?: string | null;
  amount?: string | number | null;
  currency?: string | null;
};

type ProviderOutcome = {
  status: NormalizedProviderPaymentStatus;
  providerTrackingId: string | null;
  merchantReference: string | null;
  amountUgx: bigint | null;
  currency: string | null;
  confirmationCode: string | null;
  rawResponse: PesapalStatusResponse;
};

type ClaimRow = {
  recovery_id: string;
  claimed: boolean;
  recovery_status: string;
  wake_at: string;
  attempt_count: number;
  max_attempts: number;
  booking_id: string;
  reference: string;
  order_tracking_id: string;
  payment_attempt_id: string;
};

type OutcomeRow = {
  recovery_status: string;
  wake_at: string;
  attempt_count: number;
  max_attempts: number;
  requires_review: boolean;
  error_code: string | null;
};

type RescheduleRow = {
  recovery_status: string;
  wake_at: string;
  attempt_count: number;
  max_attempts: number;
};

type DeadLetterBody = {
  message?: unknown;
  messageId?: unknown;
  attempts?: unknown;
  queue?: unknown;
};

async function fetchJson<T>(url: string, init: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`Pesapal request failed with HTTP ${response.status}.`);
    }
    return (raw ? JSON.parse(raw) : {}) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function required(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`Missing ${name}.`);
  return normalized;
}

async function getProviderOutcome(
  trackingId: string,
  env: PaymentReconcilerEnv
): Promise<ProviderOutcome> {
  const baseUrl = required(env.PESAPAL_BASE_URL, "PESAPAL_BASE_URL").replace(/\/+$/, "");
  const tokenResponse = await fetchJson<PesapalTokenResponse>(
    `${baseUrl}/api/Auth/RequestToken`,
    {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        consumer_key: required(env.PESAPAL_CONSUMER_KEY, "PESAPAL_CONSUMER_KEY"),
        consumer_secret: required(env.PESAPAL_CONSUMER_SECRET, "PESAPAL_CONSUMER_SECRET")
      })
    }
  );

  if (!tokenResponse.token) {
    throw new Error(
      tokenResponse.error?.message ?? tokenResponse.message ?? "Pesapal token request failed."
    );
  }

  const url = new URL(`${baseUrl}/api/Transactions/GetTransactionStatus`);
  url.searchParams.set("orderTrackingId", trackingId);
  const rawResponse = await fetchJson<PesapalStatusResponse>(url.toString(), {
    method: "GET",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${tokenResponse.token}`
    }
  });

  return {
    status: normalizeProviderPaymentStatus(rawResponse.payment_status_description),
    providerTrackingId: rawResponse.order_tracking_id ?? null,
    merchantReference: rawResponse.merchant_reference ?? null,
    amountUgx: parseUgxAmount(rawResponse.amount ?? null),
    currency: rawResponse.currency ?? null,
    confirmationCode: rawResponse.confirmation_code ?? null,
    rawResponse
  };
}

async function enqueueReplacement(
  env: PaymentReconcilerEnv,
  message: PaymentRecoveryQueueMessage,
  state: Pick<
    ClaimRow | OutcomeRow | RescheduleRow,
    "recovery_status" | "wake_at" | "attempt_count" | "max_attempts"
  >,
  binding?: Pick<ClaimRow, "booking_id" | "reference" | "order_tracking_id" | "payment_attempt_id">
): Promise<void> {
  if (!isActiveRecoveryStatus(state.recovery_status)) return;

  const authoritative = binding ?? {
    booking_id: message.bookingId,
    reference: message.reference,
    order_tracking_id: message.orderTrackingId,
    payment_attempt_id: message.paymentAttemptId
  };

  await env.PAYMENT_RECOVERY_QUEUE.send(
    {
      kind: "payment_recovery_check",
      bookingId: authoritative.booking_id,
      reference: authoritative.reference,
      orderTrackingId: authoritative.order_tracking_id,
      paymentAttemptId: authoritative.payment_attempt_id,
      queuedAt: new Date().toISOString(),
      attempt: message.attempt + 1
    },
    { delaySeconds: replacementDelaySeconds(state.wake_at) }
  );
}

async function processRecovery(
  message: PaymentRecoveryQueueMessage,
  env: PaymentReconcilerEnv
): Promise<Response> {
  const sql = neon(required(env.DATABASE_URL, "DATABASE_URL"));
  const [claim] = (await sql`
    select
      recovery_id::text,
      claimed,
      recovery_status,
      wake_at::text,
      attempt_count,
      max_attempts,
      booking_id::text,
      reference,
      order_tracking_id,
      payment_attempt_id::text
    from public.claim_payment_recovery_message(
      ${message.bookingId}::uuid,
      ${message.orderTrackingId},
      ${`queue:${message.attempt}`}
    )
  `) as ClaimRow[];

  if (!claim) {
    return Response.json({ ok: true, disposition: "stale_or_unbound" });
  }
  if (claim.recovery_status === "completed") {
    return Response.json({ ok: true, disposition: "completed" });
  }
  if (claim.recovery_status === "failed") {
    return Response.json({ ok: false, error: "attempts_exhausted" }, { status: 503 });
  }
  if (!claim.claimed) {
    await enqueueReplacement(env, message, claim, claim);
    return Response.json({ ok: true, disposition: "replacement_scheduled" }, { status: 202 });
  }

  try {
    const provider = await getProviderOutcome(claim.order_tracking_id, env);
    const [outcome] = (await sql`
      select
        recovery_status,
        wake_at::text,
        attempt_count,
        max_attempts,
        requires_review,
        error_code
      from public.apply_payment_recovery_outcome(
        ${claim.recovery_id}::uuid,
        ${claim.order_tracking_id},
        ${provider.providerTrackingId},
        ${provider.status},
        ${provider.merchantReference},
        ${provider.amountUgx}::bigint,
        ${provider.currency},
        ${provider.confirmationCode},
        ${JSON.stringify(provider.rawResponse)}::jsonb
      )
    `) as OutcomeRow[];

    if (!outcome) throw new Error("Payment outcome RPC returned no state.");
    if (outcome.recovery_status === "failed") {
      return Response.json({ ok: false, error: "attempts_exhausted" }, { status: 503 });
    }
    await enqueueReplacement(env, message, outcome, claim);

    console.log(JSON.stringify({
      event: "payment_recovery_processed",
      bookingId: claim.booking_id,
      providerStatus: provider.status,
      recoveryStatus: outcome.recovery_status,
      requiresReview: outcome.requires_review
    }));

    return Response.json({
      ok: true,
      disposition: outcome.recovery_status,
      requiresReview: outcome.requires_review,
      errorCode: outcome.error_code
    }, { status: outcome.recovery_status === "completed" ? 200 : 202 });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Payment recovery failed.";
    try {
      const [rescheduled] = (await sql`
        select recovery_status, wake_at::text, attempt_count, max_attempts
        from public.reschedule_claimed_payment_recovery(
          ${claim.recovery_id}::uuid,
          ${reason}
        )
      `) as RescheduleRow[];

      if (!rescheduled || rescheduled.recovery_status === "failed") {
        throw new Error("Payment recovery exhausted application attempts.");
      }
      await enqueueReplacement(env, message, rescheduled, claim);
      console.error(JSON.stringify({
        event: "payment_recovery_rescheduled",
        bookingId: claim.booking_id,
        error: reason,
        wakeAt: rescheduled.wake_at
      }));
      return Response.json({ ok: true, disposition: "replacement_scheduled" }, { status: 202 });
    } catch (rescheduleError) {
      console.error(JSON.stringify({
        event: "payment_recovery_failed",
        bookingId: claim.booking_id,
        error: reason,
        rescheduleError: rescheduleError instanceof Error
          ? rescheduleError.message
          : "unknown_error"
      }));
      return Response.json({ ok: false, error: "payment_recovery_failed" }, { status: 503 });
    }
  }
}

function parseDeadLetter(value: unknown): {
  message: PaymentRecoveryQueueMessage;
  messageId: string;
  attempts: number;
} | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as DeadLetterBody;
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
    return null;
  }
  return {
    message: candidate.message,
    messageId: candidate.messageId,
    attempts: candidate.attempts
  };
}

async function processDeadLetter(value: unknown, env: PaymentReconcilerEnv): Promise<Response> {
  const deadLetter = parseDeadLetter(value);
  if (!deadLetter) {
    return Response.json({ ok: false, error: "invalid_message" }, { status: 400 });
  }

  const sql = neon(required(env.DATABASE_URL, "DATABASE_URL"));
  await sql`
    select public.record_payment_recovery_dlq_incident(
      ${deadLetter.message.bookingId}::uuid,
      ${deadLetter.message.orderTrackingId},
      ${deadLetter.messageId},
      ${deadLetter.attempts},
      ${JSON.stringify(deadLetter.message)}::jsonb
    )
  `;

  console.error(JSON.stringify({
    event: "payment_recovery_dead_lettered",
    bookingId: deadLetter.message.bookingId,
    reference: deadLetter.message.reference,
    orderTrackingId: deadLetter.message.orderTrackingId,
    messageId: deadLetter.messageId,
    attempts: deadLetter.attempts
  }));
  return Response.json({ ok: true, recorded: true });
}

export default {
  async fetch(request: Request, env: PaymentReconcilerEnv): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Not found", { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }

    const pathname = new URL(request.url).pathname;
    if (pathname === RECOVER_PATH) {
      if (!isPaymentRecoveryQueueMessage(body)) {
        return Response.json({ ok: false, error: "invalid_message" }, { status: 400 });
      }
      return processRecovery(body, env);
    }
    if (pathname === DLQ_PATH) {
      return processDeadLetter(body, env);
    }
    return new Response("Not found", { status: 404 });
  }
} satisfies ExportedHandler<PaymentReconcilerEnv>;
