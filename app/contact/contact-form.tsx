"use client";

import { useActionState, useEffect, useRef } from "react";
import { resetTurnstileWidget, TurnstileWidget } from "@/components/TurnstileWidget";
import { submitContactFormAction, type ContactFormState } from "./actions";

const initialState: ContactFormState = {
  status: "idle",
  message: ""
};

export function ContactForm({ turnstileSiteKey }: { turnstileSiteKey: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState(submitContactFormAction, initialState);

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
      resetTurnstileWidget();
    } else if (state.status === "error") {
      resetTurnstileWidget();
    }
  }, [state.status]);

  return (
    <form ref={formRef} action={formAction} className="mt-5 space-y-4">
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />

      <div>
        <label htmlFor="fullName" className="mb-2 block text-sm font-medium">
          Name
        </label>
        <input
          id="fullName"
          name="fullName"
          type="text"
          maxLength={120}
          required
          placeholder="Your full name"
          className="w-full rounded-2xl border border-stoneWarm-300 bg-stoneWarm-100/50 px-4 py-3 text-sm outline-none focus:border-oliveMuted-500 dark:border-zinc-700 dark:bg-zinc-800"
        />
      </div>

      <div>
        <label htmlFor="email" className="mb-2 block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          maxLength={200}
          required
          placeholder="you@example.com"
          className="w-full rounded-2xl border border-stoneWarm-300 bg-stoneWarm-100/50 px-4 py-3 text-sm outline-none focus:border-oliveMuted-500 dark:border-zinc-700 dark:bg-zinc-800"
        />
      </div>

      <div>
        <label htmlFor="phone" className="mb-2 block text-sm font-medium">
          Phone
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          maxLength={40}
          placeholder="+256..."
          className="w-full rounded-2xl border border-stoneWarm-300 bg-stoneWarm-100/50 px-4 py-3 text-sm outline-none focus:border-oliveMuted-500 dark:border-zinc-700 dark:bg-zinc-800"
        />
      </div>

      <div>
        <label htmlFor="subject" className="mb-2 block text-sm font-medium">
          Subject
        </label>
        <input
          id="subject"
          name="subject"
          type="text"
          maxLength={200}
          placeholder="Reservation, event, or general enquiry"
          className="w-full rounded-2xl border border-stoneWarm-300 bg-stoneWarm-100/50 px-4 py-3 text-sm outline-none focus:border-oliveMuted-500 dark:border-zinc-700 dark:bg-zinc-800"
        />
      </div>

      <div>
        <label htmlFor="message" className="mb-2 block text-sm font-medium">
          Message
        </label>
        <textarea
          id="message"
          name="message"
          required
          rows={5}
          maxLength={4000}
          placeholder="Tell us about your stay or event plans"
          className="w-full rounded-2xl border border-stoneWarm-300 bg-stoneWarm-100/50 px-4 py-3 text-sm outline-none focus:border-oliveMuted-500 dark:border-zinc-700 dark:bg-zinc-800"
        />
      </div>

      {state.message && (
        <p
          className={`rounded-2xl px-4 py-3 text-sm ${
            state.status === "success"
              ? "bg-oliveMuted-50 text-oliveMuted-700"
              : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200"
          }`}
        >
          {state.message}
        </p>
      )}

      <div className="rounded-2xl border border-stoneWarm-100 bg-stoneWarm-50 px-5 py-4 dark:border-zinc-700 dark:bg-zinc-800">
        <div className="mb-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-400">
            Verification
          </p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Confirm you&apos;re human before sending your message.
          </p>
        </div>
        <TurnstileWidget siteKey={turnstileSiteKey} />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="rounded-full bg-oliveMuted-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-oliveMuted-600 disabled:cursor-wait disabled:opacity-70"
      >
        {isPending ? "Sending..." : "Submit Inquiry"}
      </button>
    </form>
  );
}
