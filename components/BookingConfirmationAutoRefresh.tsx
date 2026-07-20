"use client";

import { useEffect, useState } from "react";

const POLL_INTERVAL_MS = 2_000;
const MAX_POLL_ATTEMPTS = 25;

type ConfirmationStatusResponse = {
  status?: string;
};

export default function BookingConfirmationAutoRefresh({ reference }: { reference: string }) {
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let timeout: number | null = null;

    const scheduleNextCheck = () => {
      if (cancelled || attempts >= MAX_POLL_ATTEMPTS) {
        if (!cancelled) setIsChecking(false);
        return;
      }
      timeout = window.setTimeout(() => void checkStatus(), POLL_INTERVAL_MS);
    };

    const checkStatus = async () => {
      attempts += 1;
      try {
        const response = await fetch(
          `/book/confirmation/status?ref=${encodeURIComponent(reference)}`,
          { cache: "no-store" }
        );
        const payload = (await response.json().catch(() => null)) as ConfirmationStatusResponse | null;

        if (!cancelled && response.ok && payload?.status && payload.status !== "pending_payment") {
          window.location.reload();
          return;
        }
      } catch {
        // The server-rendered page remains authoritative; a transient polling
        // error must not be shown as a payment failure to the guest.
      }

      scheduleNextCheck();
    };

    timeout = window.setTimeout(() => void checkStatus(), 750);

    return () => {
      cancelled = true;
      if (timeout) window.clearTimeout(timeout);
    };
  }, [reference]);

  if (!isChecking) return null;

  return (
    <p aria-live="polite" className="mt-3 text-sm font-medium text-oliveMuted-700 dark:text-oliveMuted-300">
      Checking your secure payment confirmation automatically…
    </p>
  );
}
