import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Reveal from '@/components/Reveal';
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

  return (
    <section className="section-space">
      <div className="section-shell">
        {/* Room hero */}
        <Reveal className="relative min-h-[380px] overflow-hidden rounded-[2rem]">
          <Image src={room.image} alt={room.title} fill className="object-cover" priority />
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative p-8 text-white sm:p-12">
            <p className="text-xs uppercase tracking-[0.2em] text-stoneWarm-100">Room Details</p>
            <h1 className="mt-3 max-w-3xl font-heading text-4xl sm:text-5xl">{room.title}</h1>
            <p className="mt-4 max-w-2xl text-sm text-stoneWarm-100 sm:text-base">{room.description}</p>
            <p className="mt-4 inline-block rounded-full bg-white/20 px-4 py-2 text-sm font-semibold">{room.price}</p>
          </div>
        </Reveal>

        {/* Room details */}
        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          <Reveal className="rounded-3xl border border-stoneWarm-200 bg-white p-6 shadow-soft dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="font-heading text-3xl">About This Room</h2>
            <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-300 sm:text-base">{room.overview}</p>

            <h3 className="mt-6 font-heading text-2xl">Highlights</h3>
            <ul className="mt-3 space-y-2 text-sm text-zinc-700 dark:text-zinc-300 sm:text-base">
              {room.details.map((detail) => (
                <li key={detail}>• {detail}</li>
              ))}
            </ul>

            <h3 className="mt-6 font-heading text-2xl">In-Room Amenities</h3>
            <ul className="mt-3 grid gap-2 text-sm text-zinc-700 dark:text-zinc-300 sm:grid-cols-2 sm:text-base">
              {room.amenities.map((amenity) => (
                <li key={amenity}>• {amenity}</li>
              ))}
            </ul>

            <h3 className="mt-6 font-heading text-2xl">Dining Times</h3>
            <ul className="mt-3 space-y-2 text-sm text-zinc-700 dark:text-zinc-300 sm:text-base">
              {room.diningHours.map((time) => (
                <li key={time}>• {time}</li>
              ))}
            </ul>

            <a
              href="https://wa.me/256700000000"
              className="mt-6 inline-flex rounded-full bg-oliveMuted-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-oliveMuted-600"
            >
              Book a Stay
            </a>
          </Reveal>

          <Reveal>
            <h2 className="font-heading text-3xl">Room Gallery</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {room.gallery.map((image, index) => (
                <div
                  key={`${room.slug}-${index}`}
                  className={`relative overflow-hidden rounded-2xl ${index === 0 ? 'sm:col-span-2 min-h-[220px]' : 'min-h-[180px]'}`}
                >
                  <Image
                    src={image}
                    alt={`${room.title} gallery ${index + 1}`}
                    fill
                    className="object-cover transition duration-500 hover:scale-105"
                  />
                </div>
              ))}
            </div>
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
