import "server-only";

import { getSql } from "@/lib/db/client";
import {
  getPesapalTransactionStatus,
  type PesapalTransactionStatus
} from "@/lib/pesapal/client";

type PaymentBindingRow = {
  booking_id: string;
  reference: string;
  status: string;
  booking_order_tracking_id: string | null;
  quoted_total_ugx: string;
  active_payment_attempt_id: string | null;
  attempt_id: string | null;
  attempt_provider_reference: string | null;
  attempt_merchant_reference: string | null;
  attempt_amount_ugx: string | null;
};

export type VerifiedBookingPayment = {
  bookingId: string;
  reference: string;
  currentStatus: string;
  orderTrackingId: string;
  attemptId: string;
  amountUgx: string;
  transaction: PesapalTransactionStatus;
};

export class PaymentBindingError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PaymentBindingError";
    this.code = code;
  }
}

function requireSame(label: string, actual: string | null | undefined, expected: string): void {
  if ((actual ?? "").trim() !== expected) {
    throw new PaymentBindingError(`${label}_mismatch`, `${label} does not match the stored payment.`);
  }
}

function parseUgxAmount(value: string | number | null): bigint | null {
  if (value === null) return null;

  const normalized = String(value).trim().replace(/[,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;

  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) return null;

  const rounded = Math.round(numeric);
  if (Math.abs(numeric - rounded) > 0.000001) return null;

  return BigInt(rounded);
}

async function loadPaymentBinding(input: {
  bookingId?: string;
  merchantReference?: string;
}): Promise<PaymentBindingRow> {
  const sql = getSql();
  const rows = input.bookingId
    ? ((await sql`
        SELECT
          b.id::text AS booking_id,
          b.reference,
          b.status,
          b.order_tracking_id AS booking_order_tracking_id,
          b.quoted_total_ugx::text AS quoted_total_ugx,
          b.active_payment_attempt_id::text AS active_payment_attempt_id,
          pa.id::text AS attempt_id,
          pa.provider_reference AS attempt_provider_reference,
          pa.merchant_reference AS attempt_merchant_reference,
          pa.amount_ugx::text AS attempt_amount_ugx
        FROM bookings b
        LEFT JOIN payment_attempts pa ON pa.id = b.active_payment_attempt_id
        WHERE b.id = ${input.bookingId}::uuid
        LIMIT 1
      `) as PaymentBindingRow[])
    : ((await sql`
        SELECT
          b.id::text AS booking_id,
          b.reference,
          b.status,
          b.order_tracking_id AS booking_order_tracking_id,
          b.quoted_total_ugx::text AS quoted_total_ugx,
          b.active_payment_attempt_id::text AS active_payment_attempt_id,
          pa.id::text AS attempt_id,
          pa.provider_reference AS attempt_provider_reference,
          pa.merchant_reference AS attempt_merchant_reference,
          pa.amount_ugx::text AS attempt_amount_ugx
        FROM bookings b
        LEFT JOIN payment_attempts pa ON pa.id = b.active_payment_attempt_id
        WHERE b.reference = ${input.merchantReference}
        LIMIT 1
      `) as PaymentBindingRow[]);

  const row = rows[0];
  if (!row) {
    throw new PaymentBindingError("booking_not_found", "Booking not found for payment reference.");
  }

  return row;
}

export async function verifyPesapalPaymentForBooking(input: {
  orderTrackingId: string;
  bookingId?: string;
  merchantReference?: string;
  transaction?: PesapalTransactionStatus;
}): Promise<VerifiedBookingPayment> {
  const expectedTrackingId = input.orderTrackingId.trim();
  const expectedReference = input.merchantReference?.trim();

  if (!expectedTrackingId) {
    throw new PaymentBindingError("missing_tracking_id", "Missing Pesapal tracking id.");
  }
  if (!input.bookingId && !expectedReference) {
    throw new PaymentBindingError("missing_reference", "Missing booking payment reference.");
  }

  const row = await loadPaymentBinding({
    bookingId: input.bookingId,
    merchantReference: expectedReference
  });
  const reference = expectedReference ?? row.reference;

  requireSame("booking_tracking_id", row.booking_order_tracking_id, expectedTrackingId);
  requireSame("attempt_tracking_id", row.attempt_provider_reference, expectedTrackingId);
  requireSame("attempt_merchant_reference", row.attempt_merchant_reference, reference);

  if (!row.active_payment_attempt_id || !row.attempt_id) {
    throw new PaymentBindingError("missing_active_attempt", "Booking has no active payment attempt.");
  }
  if (row.active_payment_attempt_id !== row.attempt_id) {
    throw new PaymentBindingError("active_attempt_mismatch", "Active payment attempt mismatch.");
  }
  if (!row.attempt_amount_ugx) {
    throw new PaymentBindingError("missing_attempt_amount", "Payment attempt has no amount.");
  }
  if (BigInt(row.attempt_amount_ugx) !== BigInt(row.quoted_total_ugx)) {
    throw new PaymentBindingError("quoted_amount_mismatch", "Payment attempt amount does not match booking total.");
  }

  const transaction = input.transaction ?? (await getPesapalTransactionStatus(expectedTrackingId));
  if (transaction.providerOrderTrackingId) {
    requireSame("provider_tracking_id", transaction.providerOrderTrackingId, expectedTrackingId);
  }
  requireSame("provider_merchant_reference", transaction.merchantReference, reference);

  const providerAmount = parseUgxAmount(transaction.amount);
  if (transaction.paymentStatus === "paid" && providerAmount === null) {
    throw new PaymentBindingError("missing_provider_amount", "Pesapal did not return a verifiable amount.");
  }
  if (providerAmount !== null && providerAmount !== BigInt(row.attempt_amount_ugx)) {
    throw new PaymentBindingError("provider_amount_mismatch", "Pesapal amount does not match payment attempt.");
  }
  if (transaction.currency && transaction.currency.trim().toUpperCase() !== "UGX") {
    throw new PaymentBindingError("provider_currency_mismatch", "Pesapal currency is not UGX.");
  }

  return {
    bookingId: row.booking_id,
    reference: row.reference,
    currentStatus: row.status,
    orderTrackingId: expectedTrackingId,
    attemptId: row.attempt_id,
    amountUgx: row.attempt_amount_ugx,
    transaction
  };
}
