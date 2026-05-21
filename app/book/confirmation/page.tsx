import Link from "next/link";
import { getSql } from "@/lib/db/client";

export const dynamic = "force-dynamic";

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
  searchParams: Promise<{ ref?: string; cancelled?: string }>;
}) {
  const { ref, cancelled } = await searchParams;

  if (!ref) {
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

  const sql = getSql();
  const rows = (await sql`
    SELECT
      b.reference,
      b.status,
      b.check_in::text AS check_in,
      b.check_out::text AS check_out,
      b.guest_full_name,
      b.guests_adults,
      b.guests_children,
      b.quoted_total_ugx,
      rt.title AS room_title
    FROM bookings b
    JOIN room_types rt ON rt.id = b.room_type_id
    WHERE b.reference = ${ref}
    LIMIT 1
  `) as {
    reference: string;
    status: string;
    check_in: string;
    check_out: string;
    guest_full_name: string;
    guests_adults: number;
    guests_children: number;
    quoted_total_ugx: string;
    room_title: string;
  }[];

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
  const isConfirmed = ["confirmed", "checked_in", "checked_out"].includes(b.status);
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
        ) : isPending && cancelled === "1" ? (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-900 dark:bg-amber-950">
            <p className="text-sm font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Payment Cancelled
            </p>
            <h1 className="mt-2 font-heading text-3xl text-zinc-800 dark:text-zinc-100">
              Payment was not completed
            </h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              Your booking is held for 15 minutes. Contact us to pay by alternative means.
            </p>
          </div>
        ) : isPending ? (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-900 dark:bg-amber-950">
            <p className="text-sm font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Payment Pending
            </p>
            <h1 className="mt-2 font-heading text-3xl text-zinc-800 dark:text-zinc-100">
              Awaiting confirmation
            </h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              Your booking is held while we confirm your payment. This usually resolves within
              a few minutes.
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
          <dl className="grid gap-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Reference</dt>
              <dd className="font-mono font-semibold">{b.reference}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Room</dt>
              <dd className="text-right font-medium">{b.room_title}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Check-in</dt>
              <dd>{fmtDate(b.check_in)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Check-out</dt>
              <dd>{fmtDate(b.check_out)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Guests</dt>
              <dd>
                {b.guests_adults} adult{b.guests_adults !== 1 ? "s" : ""}
                {b.guests_children > 0
                  ? `, ${b.guests_children} child${b.guests_children !== 1 ? "ren" : ""}`
                  : ""}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-stoneWarm-100 pt-3 dark:border-zinc-700">
              <dt className="font-semibold">Total</dt>
              <dd className="font-semibold">{fmtUgx(Number(b.quoted_total_ugx))}</dd>
            </div>
          </dl>
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
