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
  check_in: string | null;
  check_out: string | null;
  guest_full_name: string | null;
  guests_adults: number | null;
  guests_children: number | null;
  quoted_total_ugx: string | null;
  room_title: string | null;
};

function fmtUgx(n: number): string {
  return new Intl.NumberFormat("en-UG").format(n) + " UGX";
}

function fmtDate(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  return new Intl.DateTimeFormat("en-UG", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(y, m - 1, day));
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
        <div className="section-shell max-w-lg">
          <h1 className="font-heading text-3xl">Booking not found</h1>
          <p className="mt-4 text-sm text-zinc-600">
            Please check your email or contact us for assistance.
          </p>
          <Link href="/" className="mt-6 inline-block text-sm text-oliveMuted-600 hover:underline">
            ← Return to home
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
        <div className="section-shell max-w-lg">
          <h1 className="font-heading text-3xl">Please wait a moment</h1>
          <p className="mt-4 text-sm text-zinc-600">
            Too many booking lookups were attempted. Please wait a few minutes and try again.
          </p>
          <Link href="/" className="mt-6 inline-block text-sm text-oliveMuted-600 hover:underline">
            ← Return to home
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
        <div className="section-shell max-w-lg">
          <h1 className="font-heading text-3xl">Booking not found</h1>
          <p className="mt-4 text-sm text-zinc-600">
            This booking reference could not be found.
          </p>
          <Link href="/" className="mt-6 inline-block text-sm text-oliveMuted-600 hover:underline">
            ← Return to home
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

  return (
    <section className="section-space">
      <div className="section-shell max-w-lg">
        {isConfirmed ? (
          <div className="rounded-3xl border border-green-200 bg-green-50 p-6 dark:border-green-900 dark:bg-green-950">
            <p className="text-sm font-semibold uppercase tracking-wider text-green-600 dark:text-green-400">
              Booking Confirmed
            </p>
            <h1 className="mt-2 font-heading text-3xl text-zinc-800 dark:text-zinc-100">
              You&apos;re all set!
            </h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              Your booking is confirmed. We look forward to welcoming you at Mubende Country Resort.
            </p>
          </div>
        ) : isUnderReview ? (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-900 dark:bg-amber-950">
            <p className="text-sm font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Under Review
            </p>
            <h1 className="mt-2 font-heading text-3xl text-zinc-800 dark:text-zinc-100">
              Payment received
            </h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              We have received your payment and our team will confirm your booking shortly.
              Please contact us if you need immediate assistance.
            </p>
          </div>
        ) : isPending && cancelled === "1" ? (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-900 dark:bg-amber-950">
            <p className="text-sm font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Payment Cancelled
            </p>
            <h1 className="mt-2 font-heading text-3xl text-zinc-800 dark:text-zinc-100">
              Payment was not completed
            </h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              Your payment was cancelled. Please try again or contact us to book by alternative means.
            </p>
          </div>
        ) : isPending ? (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-900 dark:bg-amber-950">
            <p className="text-sm font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Payment Pending
            </p>
            <h1 className="mt-2 font-heading text-3xl text-zinc-800 dark:text-zinc-100">
              Awaiting payment confirmation
            </h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              Your payment is being processed. This usually resolves within a few minutes.
              Contact us if you have already paid and this message persists.
            </p>
          </div>
        ) : isCancelledOrFailed ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-6 dark:border-red-900 dark:bg-red-950">
            <p className="text-sm font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">
              Booking Cancelled
            </p>
            <h1 className="mt-2 font-heading text-3xl text-zinc-800 dark:text-zinc-100">
              This booking has been cancelled
            </h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              Please contact us to make a new reservation.
            </p>
          </div>
        ) : null}

        <div className="mt-6 rounded-3xl border border-stoneWarm-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900">
          {proofVerified ? (
            <dl className="grid gap-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Reference</dt>
                <dd className="font-mono font-semibold">{b.reference}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Guest</dt>
                <dd className="text-right font-medium">{b.guest_full_name}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Room</dt>
                <dd className="text-right font-medium">{b.room_title}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Check-in</dt>
                <dd>{b.check_in ? fmtDate(b.check_in) : ""}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Check-out</dt>
                <dd>{b.check_out ? fmtDate(b.check_out) : ""}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Guests</dt>
                <dd>
                  {b.guests_adults} adult{b.guests_adults !== 1 ? "s" : ""}
                  {(b.guests_children ?? 0) > 0
                    ? `, ${b.guests_children} child${b.guests_children !== 1 ? "ren" : ""}`
                    : ""}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-stoneWarm-100 pt-3 dark:border-zinc-700">
                <dt className="font-semibold">Total</dt>
                <dd className="font-semibold">{fmtUgx(Number(b.quoted_total_ugx))}</dd>
              </div>
            </dl>
          ) : (
            <div>
              <div className="flex justify-between gap-4 text-sm">
                <span className="text-zinc-500">Reference</span>
                <span className="font-mono font-semibold">{b.reference}</span>
              </div>
              <div className="mt-5 border-t border-stoneWarm-100 pt-5 dark:border-zinc-700">
                <h2 className="font-heading text-2xl">Verify booking details</h2>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                  Enter the booking email address or the last 4 digits of the guest phone number
                  to view stay dates, guest name, room, and amount.
                </p>
                {proofProvided && (
                  <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    That email or phone proof did not match this booking.
                  </p>
                )}
                <form method="get" className="mt-4 grid gap-3">
                  <input type="hidden" name="ref" value={b.reference} />
                  {cancelled === "1" && <input type="hidden" name="cancelled" value="1" />}
                  <label htmlFor="proof" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Email or phone suffix
                  </label>
                  <input
                    id="proof"
                    name="proof"
                    type="text"
                    autoComplete="off"
                    required
                    className="w-full rounded-2xl border border-stoneWarm-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-oliveMuted-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                  <button
                    type="submit"
                    className="rounded-full bg-oliveMuted-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-oliveMuted-700"
                  >
                    View Details
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>

        <p className="mt-4 text-sm text-zinc-500">
          Questions? Call or WhatsApp us directly.
        </p>

        <Link href="/" className="mt-6 inline-block text-sm text-oliveMuted-600 hover:underline">
          ← Back to home
        </Link>
      </div>
    </section>
  );
}
