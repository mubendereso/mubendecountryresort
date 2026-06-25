import Link from "next/link";
import { headers } from "next/headers";
import { getSql } from "@/lib/db/client";
import { consumeRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const CONFIRMATION_LOOKUP_IP_MAX_ATTEMPTS = 20;
const CONFIRMATION_LOOKUP_IP_WINDOW_SECONDS = 600; // 10 minutes

type ConfirmationRow = {
  reference: string;
  status: string;
  proof_verified: boolean;
  check_in: string | Date | null;
  check_out: string | Date | null;
  guest_full_name: string | null;
  guests_adults: number | null;
  guests_children: number | null;
  quoted_total_ugx: string | null;
  room_title: string | null;
};

type HeroTone = "success" | "warning" | "danger";

function fmtUgx(n: number): string {
  return new Intl.NumberFormat("en-UG").format(n) + " UGX";
}

function dateParts(d: string | Date): [number, number, number] {
  if (d instanceof Date) {
    return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
  }

  const [y, m, day] = d.split("-").map(Number);
  return [y, m, day];
}

function fmtDate(d: string | Date): string {
  const [y, m, day] = dateParts(d);
  return new Intl.DateTimeFormat("en-UG", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(y, m - 1, day));
}

function getNights(checkIn: string | Date | null, checkOut: string | Date | null): number | null {
  if (!checkIn || !checkOut) return null;
  const [inYear, inMonth, inDay] = dateParts(checkIn);
  const [outYear, outMonth, outDay] = dateParts(checkOut);
  const start = Date.UTC(inYear, inMonth - 1, inDay);
  const end = Date.UTC(outYear, outMonth - 1, outDay);
  const nights = Math.round((end - start) / 86_400_000);
  return nights > 0 ? nights : null;
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending_payment: "Payment pending",
    awaiting_confirmation: "Awaiting review",
    confirmed: "Confirmed",
    checked_in: "Checked in",
    checked_out: "Checked out",
    cancelled: "Cancelled",
    refunded: "Refunded"
  };
  return labels[status] ?? status.replace(/_/g, " ");
}

function paymentStatusLabel(status: string): string {
  if (["confirmed", "checked_in", "checked_out"].includes(status)) return "Confirmed";
  if (status === "awaiting_confirmation") return "Under review";
  if (status === "pending_payment") return "Pending";
  if (status === "refunded") return "Refunded";
  if (status === "cancelled") return "Not completed";
  return statusLabel(status);
}

function HeroIcon({ tone }: { tone: HeroTone }) {
  const toneClass =
    tone === "success"
      ? "border-green-200 bg-green-50 text-green-700"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-red-200 bg-red-50 text-red-700";

  return (
    <span
      aria-hidden="true"
      className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border text-3xl ${toneClass}`}
    >
      {tone === "success" ? "✓" : tone === "warning" ? "!" : "×"}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  accent = false
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 shadow-sm ${
        accent
          ? "border-oliveMuted-400/40 bg-oliveMuted-600 text-white"
          : "border-stoneWarm-200 bg-white text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      }`}
    >
      <dt className={`text-xs font-semibold uppercase tracking-[0.18em] ${accent ? "text-white/70" : "text-zinc-500"}`}>
        {label}
      </dt>
      <dd className="mt-2 text-base font-semibold leading-snug sm:text-lg">{value}</dd>
    </div>
  );
}

function VerificationForm({
  reference,
  cancelled,
  proofProvided,
  proofVerified
}: {
  reference: string;
  cancelled?: string;
  proofProvided: boolean;
  proofVerified: boolean;
}) {
  return (
    <section
      aria-labelledby="retrieve-booking-heading"
      className="rounded-3xl border border-stoneWarm-200 bg-white/80 p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/80 sm:p-6"
    >
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-oliveMuted-600">
          Booking retrieval
        </p>
        <h2 id="retrieve-booking-heading" className="mt-2 font-heading text-2xl text-zinc-900 dark:text-zinc-100">
          Need to retrieve this booking later?
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          You can retrieve your reservation at any time using your booking reference together with
          your email address or the last four digits of your phone number.
        </p>
      </div>

      {!proofVerified && proofProvided && (
        <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          That email or phone proof did not match this booking.
        </p>
      )}

      <form method="get" className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <input type="hidden" name="ref" value={reference} />
        {cancelled === "1" && <input type="hidden" name="cancelled" value="1" />}
        <div>
          <label htmlFor="proof" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Email or phone suffix
          </label>
          <input
            id="proof"
            name="proof"
            type="text"
            autoComplete="off"
            required
            className="mt-2 w-full rounded-2xl border border-stoneWarm-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-oliveMuted-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
        <button
          type="submit"
          className="rounded-full bg-oliveMuted-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-oliveMuted-500 focus:outline-none focus:ring-2 focus:ring-oliveMuted-400 focus:ring-offset-2 dark:focus:ring-offset-zinc-900"
        >
          View Details
        </button>
      </form>
    </section>
  );
}

export default async function ConfirmationPage({
  searchParams
}: {
  searchParams: Promise<{ ref?: string; cancelled?: string; proof?: string }>;
}) {
  const { ref, cancelled, proof } = await searchParams;
  const reference = Array.isArray(ref) ? ref[0] : ref;
  const proofValue = Array.isArray(proof) ? proof[0] : proof;

  if (!reference) {
    return (
      <section className="section-space">
        <div className="mx-4 max-w-lg sm:mx-auto sm:px-6 lg:px-8">
          <h1 className="font-heading text-3xl">Booking not found</h1>
          <p className="mt-4 text-sm text-zinc-600">
            Please check your email or contact us for assistance.
          </p>
          <Link href="/" className="mt-6 inline-block text-sm text-oliveMuted-600 hover:underline">
            Return to home
          </Link>
        </div>
      </section>
    );
  }

  const clientIp = getClientIp(await headers());
  const lookupAllowed = await consumeRateLimit(
    `confirmation:ip:${clientIp}`,
    CONFIRMATION_LOOKUP_IP_MAX_ATTEMPTS,
    CONFIRMATION_LOOKUP_IP_WINDOW_SECONDS,
    { failOpen: false }
  );

  if (!lookupAllowed) {
    return (
      <section className="section-space">
        <div className="mx-4 max-w-lg sm:mx-auto sm:px-6 lg:px-8">
          <h1 className="font-heading text-3xl">Please wait a moment</h1>
          <p className="mt-4 text-sm text-zinc-600">
            Too many booking lookups were attempted. Please wait a few minutes and try again.
          </p>
          <Link href="/" className="mt-6 inline-block text-sm text-oliveMuted-600 hover:underline">
            Return to home
          </Link>
        </div>
      </section>
    );
  }

  const sql = getSql();
  const rows = (await sql`
    SELECT *
    FROM get_public_booking_confirmation(${reference}, ${proofValue ?? null})
  `) as ConfirmationRow[];

  if (!rows[0]) {
    return (
      <section className="section-space">
        <div className="mx-4 max-w-lg sm:mx-auto sm:px-6 lg:px-8">
          <h1 className="font-heading text-3xl">Booking not found</h1>
          <p className="mt-4 text-sm text-zinc-600">
            This booking reference could not be found.
          </p>
          <Link href="/" className="mt-6 inline-block text-sm text-oliveMuted-600 hover:underline">
            Return to home
          </Link>
        </div>
      </section>
    );
  }

  const b = rows[0];
  const proofProvided = Boolean(proofValue?.trim());
  const proofVerified = b.proof_verified;
  const isConfirmed = ["confirmed", "checked_in", "checked_out"].includes(b.status);
  const isUnderReview = b.status === "awaiting_confirmation";
  const isPending = b.status === "pending_payment";
  const isCancelledOrFailed = b.status === "cancelled" || b.status === "refunded";
  const nights = getNights(b.check_in, b.check_out);
  const guestsTotal = (b.guests_adults ?? 0) + (b.guests_children ?? 0);
  const summaryItems = [
    proofVerified && b.guest_full_name ? { label: "Guest name", value: b.guest_full_name } : null,
    proofVerified && b.room_title ? { label: "Room type", value: b.room_title } : null,
    proofVerified && b.check_in ? { label: "Check-in", value: fmtDate(b.check_in) } : null,
    proofVerified && b.check_out ? { label: "Check-out", value: fmtDate(b.check_out) } : null,
    proofVerified && guestsTotal > 0
      ? { label: "Guests", value: `${guestsTotal} guest${guestsTotal === 1 ? "" : "s"}` }
      : null,
    proofVerified && nights
      ? { label: "Nights", value: `${nights} night${nights === 1 ? "" : "s"}` }
      : null,
    proofVerified && b.quoted_total_ugx
      ? { label: "Total amount", value: fmtUgx(Number(b.quoted_total_ugx)), accent: true }
      : null,
    { label: "Payment status", value: paymentStatusLabel(b.status) },
    { label: "Booking status", value: statusLabel(b.status) }
  ].filter(Boolean) as { label: string; value: string; accent?: boolean }[];
  const heroTone: HeroTone = isConfirmed ? "success" : isCancelledOrFailed ? "danger" : "warning";
  const heroEyebrow = isConfirmed
    ? "Booking Confirmed"
    : isUnderReview
      ? "Under Review"
      : isPending && cancelled === "1"
        ? "Payment Cancelled"
        : isPending
          ? "Payment Pending"
          : "Booking Cancelled";
  const heroHeading = isConfirmed
    ? "You're all set!"
    : isUnderReview
      ? "Payment received"
      : isPending && cancelled === "1"
        ? "Payment was not completed"
        : isPending
          ? "Awaiting payment confirmation"
          : "This booking has been cancelled";
  const heroCopy = isConfirmed
    ? "Your booking has been confirmed. We look forward to welcoming you to Mubende Country Resort."
    : isUnderReview
      ? "We have received your payment and our team will confirm your booking shortly. Please contact us if you need immediate assistance."
      : isPending && cancelled === "1"
        ? "Your payment was cancelled. Please try again or contact us to book by alternative means."
        : isPending
          ? "Your payment is being processed. This usually resolves within a few minutes. Contact us if you have already paid and this message persists."
          : "Please contact us to make a new reservation.";

  return (
    <section className="section-space bg-canvas-light dark:bg-canvas-dark">
      <div className="mx-4 max-w-5xl sm:mx-auto sm:px-6 lg:px-8">
        <div className="min-w-0 rounded-[2rem] border border-stoneWarm-200 bg-white p-6 shadow-soft dark:border-zinc-700 dark:bg-zinc-900 sm:p-8 lg:p-10">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="flex min-w-0 max-w-2xl flex-col gap-5 sm:flex-row sm:items-start">
              <HeroIcon tone={heroTone} />
              <div className="min-w-0">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-oliveMuted-600">
                  {heroEyebrow}
                </p>
                <h1 className="mt-3 font-heading text-4xl leading-tight text-zinc-900 dark:text-zinc-100 sm:text-5xl">
                  {heroHeading}
                </h1>
                <p className="mt-4 max-w-xl text-base leading-7 text-zinc-600 dark:text-zinc-300">
                  {heroCopy}
                </p>
              </div>
            </div>

            <div className="min-w-0 rounded-3xl border border-stoneWarm-200 bg-stoneWarm-100/60 p-5 dark:border-zinc-700 dark:bg-zinc-800/70 md:min-w-72">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                Reference
              </p>
              <p className="mt-3 break-words font-mono text-xl font-bold tracking-wide text-zinc-900 [overflow-wrap:anywhere] dark:text-zinc-50 sm:text-2xl">
                {b.reference}
              </p>
              <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
                Keep this reference for check-in.
              </p>
            </div>
          </div>
        </div>

        <section aria-labelledby="booking-summary-heading" className="mt-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-oliveMuted-600">
                Booking summary
              </p>
              <h2 id="booking-summary-heading" className="mt-2 font-heading text-3xl text-zinc-900 dark:text-zinc-100">
                Reservation details
              </h2>
            </div>
            {!proofVerified && (
              <p className="max-w-md text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                To protect your privacy, stay details are shown after verification.
              </p>
            )}
          </div>

          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {summaryItems.map((item) => (
              <SummaryCard key={item.label} label={item.label} value={item.value} accent={item.accent} />
            ))}
          </dl>
        </section>

        <section
          aria-label="Booking actions"
          className="mt-6 rounded-3xl border border-stoneWarm-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 sm:p-6"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <a
              href="#booking-summary-heading"
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-oliveMuted-600 px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-oliveMuted-500 focus:outline-none focus:ring-2 focus:ring-oliveMuted-400 focus:ring-offset-2 dark:focus:ring-offset-zinc-900"
            >
              View Booking Details
            </a>
            <button
              type="button"
              disabled
              title="Receipt download is not available on this page yet."
              aria-label="Download receipt is not available yet"
              className="inline-flex min-h-12 cursor-not-allowed items-center justify-center rounded-full border border-stoneWarm-200 bg-stoneWarm-100 px-5 py-3 text-center text-sm font-semibold text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
            >
              Download Receipt
            </button>
            <a
              href="https://wa.me/256700000000"
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-stoneWarm-200 bg-white px-5 py-3 text-center text-sm font-semibold text-zinc-800 transition hover:border-oliveMuted-400 hover:text-oliveMuted-600 focus:outline-none focus:ring-2 focus:ring-oliveMuted-400 focus:ring-offset-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:ring-offset-zinc-900"
            >
              WhatsApp Reception
            </a>
            <a
              href="tel:+256700000000"
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-stoneWarm-200 bg-white px-5 py-3 text-center text-sm font-semibold text-zinc-800 transition hover:border-oliveMuted-400 hover:text-oliveMuted-600 focus:outline-none focus:ring-2 focus:ring-oliveMuted-400 focus:ring-offset-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:ring-offset-zinc-900"
            >
              Call Reception
            </a>
            <Link
              href="/"
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-stoneWarm-200 bg-white px-5 py-3 text-center text-sm font-semibold text-zinc-800 transition hover:border-oliveMuted-400 hover:text-oliveMuted-600 focus:outline-none focus:ring-2 focus:ring-oliveMuted-400 focus:ring-offset-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:ring-offset-zinc-900"
            >
              Back to Home
            </Link>
          </div>
        </section>

        <div className="mt-6">
          <VerificationForm
            reference={b.reference}
            cancelled={cancelled}
            proofProvided={proofProvided}
            proofVerified={proofVerified}
          />
        </div>
      </div>
    </section>
  );
}
