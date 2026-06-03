"use client";

import { useTransition, useState } from "react";
import { initiateBookingAction } from "@/lib/bookings/create";
import { resetTurnstileWidget, TurnstileWidget } from "@/components/TurnstileWidget";

type BookRoom = {
  slug: string;
  title: string;
  description: string;
  priceUgx: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function addDays(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().split("T")[0];
}

function countNights(checkIn: string, checkOut: string) {
  if (!checkIn || !checkOut || checkOut <= checkIn) return 0;

  const checkInTime = Date.parse(`${checkIn}T00:00:00Z`);
  const checkOutTime = Date.parse(`${checkOut}T00:00:00Z`);

  if (!Number.isFinite(checkInTime) || !Number.isFinite(checkOutTime)) return 0;
  return Math.max(0, Math.round((checkOutTime - checkInTime) / MS_PER_DAY));
}

export default function BookForm({
  roomTypes,
  initialSlug,
  turnstileSiteKey
}: {
  roomTypes: BookRoom[];
  initialSlug?: string;
  turnstileSiteKey: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const today = new Date().toISOString().split("T")[0];
  const tomorrow = addDays(today, 1);
  const [selectedSlug, setSelectedSlug] = useState(
    initialSlug && roomTypes.some((r) => r.slug === initialSlug)
      ? initialSlug
      : roomTypes[0]?.slug ?? ""
  );
  const [checkIn, setCheckIn] = useState(today);
  const [checkOut, setCheckOut] = useState(tomorrow);
  const selectedRoom = roomTypes.find((r) => r.slug === selectedSlug);
  const minCheckOut = addDays(checkIn || today, 1);
  const nights = countNights(checkIn, checkOut);
  const estimatedTotal = selectedRoom ? selectedRoom.priceUgx * nights : 0;

  function fmtUgx(n: number) {
    return new Intl.NumberFormat("en-UG").format(n) + " UGX";
  }

  function handleCheckInChange(value: string) {
    setCheckIn(value);

    if (!value) return;
    const nextMinimumCheckOut = addDays(value, 1);
    if (!checkOut || checkOut <= value) {
      setCheckOut(nextMinimumCheckOut);
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await initiateBookingAction(formData);
      if (!result.ok) {
        setError(result.error);
        resetTurnstileWidget();
        return;
      }
      window.location.href = result.redirectUrl;
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 grid gap-6">
      {/* Honeypot: hidden from humans; bots that fill it are rejected server-side. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />

      {/* Room selection */}
      <div className="grid gap-2">
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Room Type</label>
        <select
          name="roomTypeSlug"
          value={selectedSlug}
          onChange={(e) => setSelectedSlug(e.target.value)}
          className="w-full rounded-2xl border border-stoneWarm-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-oliveMuted-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          required
        >
          {roomTypes.map((r) => (
            <option key={r.slug} value={r.slug}>
              {r.title} — {fmtUgx(r.priceUgx)} / night
            </option>
          ))}
        </select>
        {selectedRoom?.description && (
          <p className="text-xs text-zinc-500">{selectedRoom.description}</p>
        )}
      </div>

      {/* Dates */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <label htmlFor="checkIn" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Check-in
          </label>
          <input
            id="checkIn"
            name="checkIn"
            type="date"
            min={today}
            value={checkIn}
            onChange={(e) => handleCheckInChange(e.target.value)}
            required
            className="w-full rounded-2xl border border-stoneWarm-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-oliveMuted-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
        <div className="grid gap-2">
          <label htmlFor="checkOut" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Check-out
          </label>
          <input
            id="checkOut"
            name="checkOut"
            type="date"
            min={minCheckOut}
            value={checkOut}
            onChange={(e) => setCheckOut(e.target.value)}
            required
            className="w-full rounded-2xl border border-stoneWarm-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-oliveMuted-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
      </div>

      {/* Guests */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <label htmlFor="guestsAdults" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Adults
          </label>
          <input
            id="guestsAdults"
            name="guestsAdults"
            type="number"
            min={1}
            max={10}
            defaultValue={1}
            required
            className="w-full rounded-2xl border border-stoneWarm-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-oliveMuted-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
        <div className="grid gap-2">
          <label htmlFor="guestsChildren" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Children
          </label>
          <input
            id="guestsChildren"
            name="guestsChildren"
            type="number"
            min={0}
            max={10}
            defaultValue={0}
            className="w-full rounded-2xl border border-stoneWarm-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-oliveMuted-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
      </div>

      <hr className="border-stoneWarm-200 dark:border-zinc-700" />

      {/* Guest details */}
      <div className="grid gap-4">
        <div className="grid gap-2">
          <label htmlFor="guestFullName" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Full Name
          </label>
          <input
            id="guestFullName"
            name="guestFullName"
            type="text"
            autoComplete="name"
            maxLength={120}
            required
            placeholder="Your full name"
            className="w-full rounded-2xl border border-stoneWarm-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-oliveMuted-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <label htmlFor="guestEmail" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Email Address
            </label>
            <input
              id="guestEmail"
              name="guestEmail"
              type="email"
              autoComplete="email"
              maxLength={200}
              required
              placeholder="you@example.com"
              className="w-full rounded-2xl border border-stoneWarm-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-oliveMuted-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="guestPhone" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Phone / WhatsApp
            </label>
            <input
              id="guestPhone"
              name="guestPhone"
              type="tel"
              autoComplete="tel"
              maxLength={40}
              placeholder="+256 …"
              className="w-full rounded-2xl border border-stoneWarm-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-oliveMuted-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>
        </div>
        <div className="grid gap-2">
          <label htmlFor="specialRequests" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Special Requests{" "}
            <span className="font-normal text-zinc-400">(optional)</span>
          </label>
          <textarea
            id="specialRequests"
            name="specialRequests"
            rows={3}
            maxLength={1000}
            placeholder="Dietary needs, accessibility requirements, celebrations…"
            className="w-full rounded-2xl border border-stoneWarm-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-oliveMuted-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
      </div>

      {/* Stay total */}
      {selectedRoom && (
        <div className="rounded-2xl border border-stoneWarm-100 bg-stoneWarm-50 px-5 py-4 text-sm dark:border-zinc-700 dark:bg-zinc-800">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">
                Stay total
              </p>
              <p className="mt-1 text-zinc-600 dark:text-zinc-300">
                {fmtUgx(selectedRoom.priceUgx)} / night
                {nights > 0 ? ` x ${nights} ${nights === 1 ? "night" : "nights"}` : ""}
              </p>
            </div>
            <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
              {nights > 0 ? fmtUgx(estimatedTotal) : "--"}
            </p>
          </div>
          <p className="mt-3 text-xs text-zinc-400">
            {nights > 0
              ? "This is the amount you should expect before Pesapal opens."
              : "Select valid check-in and check-out dates to see your total."}
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <TurnstileWidget siteKey={turnstileSiteKey} />

      <button
        type="submit"
        disabled={pending || !selectedRoom || nights <= 0}
        className="w-full rounded-full bg-oliveMuted-600 px-8 py-4 text-sm font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-oliveMuted-700 disabled:opacity-60"
      >
        {pending ? "Processing…" : "Proceed to Payment"}
      </button>

      <p className="text-center text-xs text-zinc-400">
        You will be redirected to Pesapal to complete payment securely. Your room is reserved
        only once payment succeeds.
      </p>
    </form>
  );
}
