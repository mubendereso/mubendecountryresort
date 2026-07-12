'use client';

import Image from '@/components/StorefrontImage';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

// Airbnb-style room gallery. Desktop shows an adaptive mosaic (1–5 tiles laid
// out to fill cleanly at any count); mobile shows a single cover with a
// "show all" affordance. Tapping any photo opens a true fullscreen lightbox
// (portaled to <body> so it sits above the sticky navbar).
// `images` should be de-duplicated and non-empty.

// Tailwind span for tile `i` given the visible-tile `count` (1–5), chosen so
// the 4×2 grid always fills with no empty cells.
function tileClass(count: number, i: number): string {
  if (count === 1) return 'col-span-4 row-span-2';
  if (count === 2) return 'col-span-2 row-span-2';
  if (count === 3) return i === 0 ? 'col-span-2 row-span-2' : 'col-span-2 row-span-1';
  if (count === 4) {
    if (i === 0) return 'col-span-2 row-span-2';
    if (i === 1) return 'col-span-2 row-span-1';
    return 'col-span-1 row-span-1';
  }
  return i === 0 ? 'col-span-2 row-span-2' : 'col-span-1 row-span-1';
}

const emptySubscribe = () => () => {};
const clientMountedSnapshot = () => true;
const serverMountedSnapshot = () => false;

export default function RoomGallery({ images, title }: { images: string[]; title: string }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const mounted = useSyncExternalStore(
    emptySubscribe,
    clientMountedSnapshot,
    serverMountedSnapshot
  );
  const overlayRef = useRef<HTMLDivElement>(null);

  const isOpen = lightboxIndex !== null;
  const open = (index: number) => setLightboxIndex(index);
  const close = useCallback(() => setLightboxIndex(null), []);
  const prev = useCallback(
    () => setLightboxIndex((i) => (i === null ? i : (i - 1 + images.length) % images.length)),
    [images.length]
  );
  const next = useCallback(
    () => setLightboxIndex((i) => (i === null ? i : (i + 1) % images.length)),
    [images.length]
  );

  // Scroll lock + keyboard (arrows / escape) + focus trap while open.
  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    // Move focus into the modal once it renders.
    const focusTimer = window.setTimeout(() => overlayRef.current?.focus(), 0);

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        close();
        return;
      }
      if (e.key === 'ArrowLeft') {
        prev();
        return;
      }
      if (e.key === 'ArrowRight') {
        next();
        return;
      }
      if (e.key === 'Tab') {
        // Trap focus among the modal's interactive controls.
        const focusable = overlayRef.current?.querySelectorAll<HTMLElement>('button');
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === overlayRef.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.();
    };
  }, [isOpen, close, prev, next]);

  const visible = images.slice(0, 5);
  const tileCount = visible.length;
  const hasMore = images.length > 1;

  const showAllButton = hasMore && (
    <button
      type="button"
      onClick={() => open(0)}
      className="absolute bottom-4 right-4 rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-zinc-900 shadow-soft transition hover:bg-white"
    >
      Show all {images.length} photos
    </button>
  );

  return (
    <>
      {/* Mobile: single cover */}
      <div className="relative overflow-hidden rounded-3xl sm:hidden">
        <button type="button" onClick={() => open(0)} className="block h-[300px] w-full">
          <Image src={images[0]} alt={title} fill className="object-cover" priority />
        </button>
        {showAllButton}
      </div>

      {/* Desktop: adaptive mosaic */}
      <div className="relative hidden overflow-hidden rounded-3xl sm:block">
        <div className="grid h-[460px] grid-cols-4 grid-rows-2 gap-2">
          {visible.map((src, i) => {
            const isLast = i === visible.length - 1;
            const extra = images.length - 5;
            return (
              <button
                key={`${src}-${i}`}
                type="button"
                onClick={() => open(i)}
                className={`group relative overflow-hidden ${tileClass(tileCount, i)}`}
              >
                <Image
                  src={src}
                  alt={`${title} photo ${i + 1}`}
                  fill
                  className="object-cover transition duration-500 group-hover:scale-105"
                  priority={i === 0}
                />
                {isLast && extra > 0 && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-lg font-semibold text-white">
                    +{extra} more
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {showAllButton}
      </div>

      {/* Fullscreen lightbox — portaled to <body> to clear the sticky navbar */}
      {mounted && isOpen &&
        createPortal(
          <div
            ref={overlayRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={`${title} photo gallery`}
            onClick={close}
            className="fixed inset-0 flex items-center justify-center bg-black/85 backdrop-blur-md outline-none"
            style={{ zIndex: 9999 }}
          >
            {/* Close — fixed to the viewport corner, not the image */}
            <button
              type="button"
              onClick={close}
              aria-label="Close gallery"
              className="fixed right-4 top-4 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white text-2xl leading-none text-zinc-900 shadow-lg transition hover:scale-105 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white sm:right-6 sm:top-6"
            >
              ✕
            </button>

            {/* Counter */}
            <p className="fixed bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/50 px-4 py-1.5 text-sm font-medium text-white/90">
              {lightboxIndex + 1} / {images.length}
            </p>

            {images.length > 1 && (
              <button
                type="button"
                aria-label="Previous photo"
                onClick={(e) => {
                  e.stopPropagation();
                  prev();
                }}
                className="fixed left-3 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-3xl leading-none text-white backdrop-blur transition hover:bg-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-white sm:left-6 sm:h-14 sm:w-14"
              >
                ‹
              </button>
            )}

            {/* Image — centered, up to 90vw × 90vh, aspect preserved */}
            <div
              className="relative h-[90vh] w-[90vw]"
              onClick={(e) => e.stopPropagation()}
            >
              <Image
                src={images[lightboxIndex]}
                alt={`${title} photo ${lightboxIndex + 1}`}
                fill
                sizes="90vw"
                className="object-contain"
                priority
              />
            </div>

            {images.length > 1 && (
              <button
                type="button"
                aria-label="Next photo"
                onClick={(e) => {
                  e.stopPropagation();
                  next();
                }}
                className="fixed right-3 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-3xl leading-none text-white backdrop-blur transition hover:bg-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-white sm:right-6 sm:h-14 sm:w-14"
              >
                ›
              </button>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
