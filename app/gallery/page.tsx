import Image from '@/components/StorefrontImage';
import Reveal from '@/components/Reveal';
import { getResortGalleryImages } from '@/lib/rooms/data';

export const dynamic = 'force-dynamic';

export default async function GalleryPage() {
  const galleryImages = await getResortGalleryImages();

  return (
    <section className="section-space">
      <div className="section-shell">
        {/* Gallery heading */}
        <Reveal>
          <p className="text-xs uppercase tracking-[0.2em] text-oliveMuted-500">Visual Tour</p>
          <h1 className="mt-2 font-heading text-4xl sm:text-5xl">Gallery</h1>
          <p className="mt-4 max-w-2xl text-sm text-zinc-700 dark:text-zinc-300 sm:text-base">
            A glimpse into the ambience, spaces, and moments that define your stay at Mubende Country Resort.
          </p>
        </Reveal>

        {/* Masonry-like column layout */}
        <div className="mt-10 columns-1 gap-4 sm:columns-2 lg:columns-3">
          {galleryImages.map((image, index) => (
            <Reveal key={`${image}-${index}`} className="mb-4 overflow-hidden rounded-3xl">
              <Image
                src={image}
                alt={`Resort gallery ${index + 1}`}
                width={900}
                height={1200}
                className="h-auto w-full object-cover transition duration-500 hover:scale-[1.03]"
              />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
