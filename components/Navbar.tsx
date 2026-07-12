'use client';

import Image from '@/components/StorefrontImage';
import Link from 'next/link';
import { useState } from 'react';

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/rooms', label: 'Rooms & Rates' },
  { href: '/gallery', label: 'Gallery' },
  { href: '/amenities', label: 'Amenities' },
  { href: '/contact', label: 'Contact' }
];

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-stoneWarm-200/70 bg-canvas-light/95 backdrop-blur dark:border-zinc-800 dark:bg-canvas-dark/95">
      <nav className="section-shell flex h-20 items-center justify-between">
        <Link href="/" className="flex items-center gap-3 text-oliveMuted-600 dark:text-stoneWarm-100">
          <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl border border-stoneWarm-200 bg-white shadow-sm">
            <Image
              src="/icons/mcr-official-logo.png"
              alt=""
              fill
              sizes="48px"
              className="scale-[1.65] object-contain"
              priority
            />
          </span>
          <span className="font-heading text-xl tracking-wide sm:text-2xl">Mubende Country Resort</span>
        </Link>

        {/* Desktop navigation */}
        <div className="hidden items-center gap-2 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-stoneWarm-100 hover:text-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/book"
            className="rounded-full bg-oliveMuted-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-oliveMuted-600"
          >
            Book Now
          </Link>
        </div>

        <button
          aria-label="Toggle menu"
          onClick={() => setOpen((prev) => !prev)}
          className="inline-flex items-center rounded-full border border-stoneWarm-300 px-3 py-2 text-sm md:hidden"
        >
          Menu
        </button>
      </nav>

      {/* Mobile menu */}
      {open && (
        <div className="section-shell border-t border-stoneWarm-200 py-4 md:hidden dark:border-zinc-800">
          <div className="flex flex-col gap-2">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-2xl px-4 py-3 text-sm font-medium text-zinc-800 transition hover:bg-stoneWarm-100 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/book"
              onClick={() => setOpen(false)}
              className="rounded-full bg-oliveMuted-500 px-4 py-3 text-center text-sm font-semibold text-white"
            >
              Book Now
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
