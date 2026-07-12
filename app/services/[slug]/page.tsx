import type { Metadata } from 'next';
import Image from '@/components/StorefrontImage';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Reveal from '@/components/Reveal';
import { services } from '@/app/services/data';

type ServicePageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return services.map((service) => ({
    slug: service.slug
  }));
}

export async function generateMetadata({ params }: ServicePageProps): Promise<Metadata> {
  const { slug } = await params;
  const service = services.find((item) => item.slug === slug);

  if (!service) {
    return {
      title: 'Service Not Found | Mubende Country Resort'
    };
  }

  return {
    title: `${service.title} | Mubende Country Resort`,
    description: service.summary
  };
}

export default async function ServicePage({ params }: ServicePageProps) {
  const { slug } = await params;
  const service = services.find((item) => item.slug === slug);

  if (!service) {
    notFound();
  }

  return (
    <section className="section-space">
      <div className="section-shell">
        {/* Service hero */}
        <Reveal className="relative min-h-[380px] overflow-hidden rounded-[2rem]">
          <Image src={service.image} alt={service.title} fill className="object-cover" priority />
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative p-8 text-white sm:p-12">
            <p className="text-xs uppercase tracking-[0.2em] text-stoneWarm-100">Service</p>
            <h1 className="mt-3 max-w-3xl font-heading text-4xl sm:text-5xl">{service.title}</h1>
            <p className="mt-4 max-w-2xl text-sm text-stoneWarm-100 sm:text-base">{service.summary}</p>
          </div>
        </Reveal>

        {/* Service details */}
        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          <Reveal className="rounded-3xl border border-stoneWarm-200 bg-white p-6 shadow-soft dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="font-heading text-3xl">What To Expect</h2>
            <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-300 sm:text-base">{service.overview}</p>
            <ul className="mt-5 space-y-2 text-sm text-zinc-700 dark:text-zinc-300 sm:text-base">
              {service.details.map((detail) => (
                <li key={detail}>• {detail}</li>
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
            <h2 className="font-heading text-3xl">Gallery</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {service.gallery.map((image, index) => (
                <div
                  key={`${service.slug}-${index}`}
                  className={`relative overflow-hidden rounded-2xl ${index === 0 ? 'sm:col-span-2 min-h-[220px]' : 'min-h-[180px]'}`}
                >
                  <Image
                    src={image}
                    alt={`${service.title} gallery ${index + 1}`}
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
            href="/#services"
            className="mt-10 inline-flex rounded-full border border-oliveMuted-500 px-5 py-2 text-sm font-semibold text-oliveMuted-600 transition hover:bg-oliveMuted-500 hover:text-white"
          >
            Back to Home
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
