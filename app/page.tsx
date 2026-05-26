import Image from 'next/image';
import Link from 'next/link';
import Reveal from '@/components/Reveal';
import { experiences } from '@/app/experiences/data';
import { services } from '@/app/services/data';
import { getResortGalleryImages } from '@/lib/rooms/data';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const galleryPreview = await getResortGalleryImages(6);
  return (
    <>
      {/* Hero section */}
      <section className="relative min-h-[88vh] overflow-hidden">
        <Image
          src="https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=2200&q=80"
          alt="Mubende Country Resort hero"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/45 to-black/30" />
        <div className="section-shell relative flex min-h-[88vh] items-end pb-16 pt-24 sm:items-center sm:pb-0">
          <Reveal className="max-w-2xl text-white">
            <p className="text-sm uppercase tracking-[0.2em] text-stoneWarm-200">Mubende, Uganda</p>
            <h1 className="mt-3 font-heading text-4xl leading-tight sm:text-5xl lg:text-6xl">
              Country Calm, Refined Comfort
            </h1>
            <p className="mt-5 max-w-xl text-sm text-stoneWarm-100 sm:text-base">
              Discover a warm retreat surrounded by lush gardens, elegant rooms, and thoughtful service.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="https://wa.me/256700000000"
                className="rounded-full bg-bronze-400 px-6 py-3 text-sm font-semibold text-white transition hover:bg-bronze-500"
              >
                Book on WhatsApp
              </a>
              <a
                href="tel:+256700000000"
                className="rounded-full border border-white/80 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/20"
              >
                Call Resort
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Experiences / highlights cards */}
      <section id="experiences-highlights" className="section-space">
        <div className="section-shell">
          <Reveal>
            <h2 className="font-heading text-3xl sm:text-4xl">Experiences & Highlights</h2>
          </Reveal>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {experiences.map((item) => (
              <Reveal
                key={item.title}
                className="relative min-h-56 overflow-hidden rounded-3xl border border-stoneWarm-200 shadow-soft dark:border-zinc-800"
              >
                <Image src={item.image} alt={item.title} fill className="object-cover blur-[2px] scale-105" />
                <div className="absolute inset-0 bg-black/0" />
                <Link href={`/experiences/${item.slug}`} className="relative block p-5 text-white">
                  <h3 className="font-heading text-xl">{item.title}</h3>
                  <p className="mt-3 text-sm text-stoneWarm-100">{item.body}</p>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-[0.15em] text-stoneWarm-100/90">
                    Tap to view details
                  </p>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Circular service visuals */}
      <section id="services" className="section-space bg-stoneWarm-100/60 dark:bg-zinc-900/40">
        <div className="section-shell">
          <Reveal>
            <h2 className="font-heading text-3xl sm:text-4xl">Services</h2>
          </Reveal>
          <div className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((service) => (
              <Reveal key={service.title} className="text-center">
                <Link href={`/services/${service.slug}`} className="group block">
                  <div className="mx-auto h-52 w-52 overflow-hidden rounded-full border-4 border-stoneWarm-200 shadow-soft dark:border-zinc-700">
                    <Image
                      src={service.image}
                      alt={service.title}
                      width={600}
                      height={600}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                    />
                  </div>
                  <h3 className="mt-5 font-heading text-2xl">{service.title}</h3>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-[0.15em] text-oliveMuted-600">
                    Tap to view details
                  </p>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Split call-to-action block */}
      <section className="section-space">
        <div className="section-shell grid overflow-hidden rounded-[2rem] border border-stoneWarm-200 bg-white shadow-soft dark:border-zinc-800 dark:bg-zinc-900 lg:grid-cols-2">
          <Reveal className="relative min-h-[300px]">
            <Image
              src="https://images.unsplash.com/photo-1468824357306-a439d58ccb1c?auto=format&fit=crop&w=1500&q=80"
              alt="Evening terrace"
              fill
              className="object-cover"
            />
          </Reveal>
          <Reveal className="flex items-center p-8 sm:p-12">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-oliveMuted-500">Special Escape Offer</p>
              <h2 className="mt-3 font-heading text-3xl sm:text-4xl">Stay Longer, Unwind Deeper</h2>
              <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-300 sm:text-base">
                Enjoy extended-stay rates, breakfast inclusions, and curated nature experiences when you reserve direct.
              </p>
              <Link
                href="/rooms"
                className="mt-6 inline-flex rounded-full bg-oliveMuted-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-oliveMuted-600"
              >
                View Rooms & Rates
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* About section */}
      <section className="section-space bg-stoneWarm-100/60 dark:bg-zinc-900/40">
        <div className="section-shell grid items-center gap-10 lg:grid-cols-2">
          <Reveal className="relative min-h-[320px] overflow-hidden rounded-3xl">
            <Image
              src="https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1500&q=80"
              alt="Resort gardens"
              fill
              className="object-cover"
            />
          </Reveal>
          <Reveal>
            <h2 className="font-heading text-3xl sm:text-4xl">About Mubende Country Resort</h2>
            <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-300 sm:text-base">
              Mubende Country Resort blends countryside serenity with modern hospitality. From peaceful mornings in lush
              gardens to elegant evenings under warm lights, every detail is designed for rest, celebration, and meaningful
              connection.
            </p>
            <Link
              href="/contact"
              className="mt-6 inline-flex rounded-full border border-oliveMuted-500 px-6 py-3 text-sm font-semibold text-oliveMuted-600 transition hover:bg-oliveMuted-500 hover:text-white"
            >
              Plan Your Visit
            </Link>
          </Reveal>
        </div>
      </section>

      {/* Gallery preview grid */}
      <section className="section-space">
        <div className="section-shell">
          <Reveal className="flex items-end justify-between gap-4">
            <h2 className="font-heading text-3xl sm:text-4xl">Gallery Preview</h2>
            <Link href="/gallery" className="text-sm font-semibold text-oliveMuted-600 hover:underline">
              Explore Full Gallery
            </Link>
          </Reveal>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {galleryPreview.map((image, idx) => (
              <Reveal
                key={`${image}-${idx}`}
                className={`relative overflow-hidden rounded-2xl ${idx % 3 === 0 ? 'sm:col-span-2 sm:row-span-2' : ''} min-h-[150px]`}
              >
                <Image
                  src={image}
                  alt={`Resort gallery preview ${idx + 1}`}
                  fill
                  className="object-cover transition duration-500 hover:scale-105"
                />
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
