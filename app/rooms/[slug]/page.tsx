import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Reveal from '@/components/Reveal';
import RoomGallery from '@/components/RoomGallery';
import { getRoomBySlug } from '@/lib/rooms/data';

export const dynamic = 'force-dynamic';

type RoomPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: RoomPageProps): Promise<Metadata> {
  const { slug } = await params;
  const room = await getRoomBySlug(slug);

  if (!room) {
    return {
      title: 'Room Not Found | Mubende Country Resort'
    };
  }

  return {
    title: `${room.title} | Mubende Country Resort`,
    description: room.description
  };
}

export default async function RoomPage({ params }: RoomPageProps) {
  const { slug } = await params;
  const room = await getRoomBySlug(slug);

  if (!room) {
    notFound();
  }

  // Cover first, then the rest of the gallery, de-duplicated.
  const images = Array.from(new Set([room.image, ...room.gallery]));

  return (
    <section className="section-space">
      <div className="section-shell">
        {/* Title + price */}
        <Reveal>
          <p className="text-xs uppercase tracking-[0.2em] text-oliveMuted-500">Accommodation</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <h1 className="font-heading text-4xl sm:text-5xl">{room.title}</h1>
            <p className="text-sm font-semibold text-oliveMuted-600 dark:text-stoneWarm-200">{room.price}</p>
          </div>
          <p className="mt-3 max-w-2xl text-sm text-zinc-700 dark:text-zinc-300 sm:text-base">{room.description}</p>
        </Reveal>

        {/* Photo gallery */}
        <Reveal className="mt-6">
          <RoomGallery images={images} title={room.title} />
        </Reveal>

        {/* Details + booking */}
        <div className="mt-10 grid gap-8 lg:grid-cols-[1.6fr_1fr]">
          <Reveal className="rounded-3xl border border-stoneWarm-200 bg-white p-6 shadow-soft dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="font-heading text-3xl">About This Room</h2>
            <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-300 sm:text-base">{room.overview}</p>

            {room.details.length > 0 && (
              <>
                <h3 className="mt-6 font-heading text-2xl">Highlights</h3>
                <ul className="mt-3 space-y-2 text-sm text-zinc-700 dark:text-zinc-300 sm:text-base">
                  {room.details.map((detail) => (
                    <li key={detail}>• {detail}</li>
                  ))}
                </ul>
              </>
            )}

            {room.amenities.length > 0 && (
              <>
                <h3 className="mt-6 font-heading text-2xl">In-Room Amenities</h3>
                <ul className="mt-3 grid gap-2 text-sm text-zinc-700 dark:text-zinc-300 sm:grid-cols-2 sm:text-base">
                  {room.amenities.map((amenity) => (
                    <li key={amenity}>• {amenity}</li>
                  ))}
                </ul>
              </>
            )}

            {room.diningHours.length > 0 && (
              <>
                <h3 className="mt-6 font-heading text-2xl">Dining Times</h3>
                <ul className="mt-3 space-y-2 text-sm text-zinc-700 dark:text-zinc-300 sm:text-base">
                  {room.diningHours.map((time) => (
                    <li key={time}>• {time}</li>
                  ))}
                </ul>
              </>
            )}
          </Reveal>

          {/* Booking summary */}
          <Reveal className="h-fit rounded-3xl border border-stoneWarm-200 bg-white p-6 shadow-soft lg:sticky lg:top-24 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="font-heading text-2xl">{room.price}</p>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              Reserve your stay securely online or reach us directly.
            </p>
            <Link
              href={`/book?room=${room.slug}`}
              className="mt-5 inline-flex w-full justify-center rounded-full bg-oliveMuted-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-oliveMuted-600"
            >
              Book a Stay
            </Link>
            <a
              href="https://wa.me/256700000000"
              className="mt-3 inline-flex w-full justify-center rounded-full border border-oliveMuted-500 px-6 py-3 text-sm font-semibold text-oliveMuted-600 transition hover:bg-oliveMuted-500 hover:text-white"
            >
              Book on WhatsApp
            </a>
          </Reveal>
        </div>

        {/* Back navigation */}
        <Reveal>
          <Link
            href="/rooms"
            className="mt-10 inline-flex rounded-full border border-oliveMuted-500 px-5 py-2 text-sm font-semibold text-oliveMuted-600 transition hover:bg-oliveMuted-500 hover:text-white"
          >
            Back to Rooms & Rates
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
