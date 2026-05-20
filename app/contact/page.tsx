import Reveal from '@/components/Reveal';
import { ContactForm } from './contact-form';

export default function ContactPage() {
  return (
    <section className="section-space">
      <div className="section-shell">
        {/* Contact page header */}
        <Reveal>
          <p className="text-xs uppercase tracking-[0.2em] text-oliveMuted-500">Reach Us</p>
          <h1 className="mt-2 font-heading text-4xl sm:text-5xl">Contact & Location</h1>
          <p className="mt-4 max-w-2xl text-sm text-zinc-700 dark:text-zinc-300 sm:text-base">
            For reservations, events, and custom experiences, send us a message or contact us directly.
          </p>
        </Reveal>

        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          {/* Contact form block */}
          <Reveal className="rounded-3xl border border-stoneWarm-200 bg-white p-6 shadow-soft dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="font-heading text-2xl">Send a Message</h2>
            <ContactForm />
          </Reveal>

          {/* Map + direct CTA block */}
          <Reveal className="space-y-6">
            <div className="overflow-hidden rounded-3xl border border-stoneWarm-200 shadow-soft dark:border-zinc-800">
              <div className="flex h-[320px] items-center justify-center bg-stoneWarm-100 text-center text-sm text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                Google Map Placeholder
                <br />
                Mubende Country Resort, Mubende, Uganda
              </div>
            </div>

            <div className="rounded-3xl border border-stoneWarm-200 bg-white p-6 shadow-soft dark:border-zinc-800 dark:bg-zinc-900">
              <h3 className="font-heading text-2xl">Direct Booking</h3>
              <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">Prefer a faster response? Contact us directly:</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <a
                  href="https://wa.me/256700000000"
                  className="rounded-full bg-bronze-400 px-6 py-3 text-sm font-semibold text-white transition hover:bg-bronze-500"
                >
                  WhatsApp Us
                </a>
                <a
                  href="tel:+256700000000"
                  className="rounded-full border border-oliveMuted-500 px-6 py-3 text-sm font-semibold text-oliveMuted-600 transition hover:bg-oliveMuted-500 hover:text-white"
                >
                  Call +256 700 000 000
                </a>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
