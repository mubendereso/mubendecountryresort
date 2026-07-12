import Image from '@/components/StorefrontImage';
import Link from 'next/link';
import Reveal from '@/components/Reveal';
import { amenities } from '@/app/amenities/data';

export default function AmenitiesPage() {
  return (
    <section className="section-space bg-stoneWarm-100/40 dark:bg-zinc-900/30">
      <div className="section-shell">
        {/* Amenities heading */}
        <Reveal>
          <p className="text-xs uppercase tracking-[0.2em] text-oliveMuted-500">Comfort & Convenience</p>
          <h1 className="mt-2 font-heading text-4xl sm:text-5xl">Amenities</h1>
          <p className="mt-4 max-w-2xl text-sm text-zinc-700 dark:text-zinc-300 sm:text-base">
            Every stay includes thoughtful amenities to make your time with us effortless and memorable.
          </p>
        </Reveal>

        {/* Amenity cards */}
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {amenities.map((amenity) => (
            <Reveal
              key={amenity.title}
              className="relative min-h-64 overflow-hidden rounded-3xl border border-stoneWarm-200 shadow-soft dark:border-zinc-800"
            >
              <Image
                src={amenity.gallery[0]}
                alt={amenity.title}
                fill
                className="object-cover blur-[2px] scale-105"
              />
              <div className="absolute inset-0 bg-black/20" />
              <Link href={`/amenities/${amenity.slug}`} className="relative block p-6 text-white">
                <span
                  className="inline-flex rounded-full bg-white/20 px-3 py-1 text-xs font-bold tracking-wide text-stoneWarm-100"
                  aria-hidden
                >
                  {amenity.icon}
                </span>
                <h2 className="mt-4 font-heading text-2xl">{amenity.title}</h2>
                <p className="mt-2 text-sm text-stoneWarm-100">{amenity.description}</p>
                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-stoneWarm-100/90">
                  Tap to view details
                </p>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
