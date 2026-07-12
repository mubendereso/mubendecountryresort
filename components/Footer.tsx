import Image from '@/components/StorefrontImage';
import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="border-t border-stoneWarm-200 bg-stoneWarm-100/60 dark:border-zinc-800 dark:bg-zinc-900/50">
      {/* Footer content grid */}
      <div className="section-shell grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-stoneWarm-200 bg-white shadow-sm">
              <Image
                src="/icons/mcr-official-logo.png"
                alt=""
                fill
                sizes="56px"
                className="scale-[1.65] object-contain"
              />
            </span>
            <h3 className="font-heading text-xl text-oliveMuted-600 dark:text-stoneWarm-100">Mubende Country Resort</h3>
          </div>
          <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">
            A peaceful countryside retreat with elegant rooms, curated dining, and unforgettable experiences.
          </p>
        </div>

        <div>
          <h4 className="font-heading text-lg">Contact</h4>
          <p className="mt-3 text-sm">+256 700 000 000</p>
          <p className="text-sm">hello@mubendecountryresort.com</p>
          <p className="text-sm">Mubende, Central Uganda</p>
        </div>

        <div>
          <h4 className="font-heading text-lg">Quick Links</h4>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link href="/rooms" className="hover:underline">Rooms & Rates</Link></li>
            <li><Link href="/amenities" className="hover:underline">Amenities</Link></li>
            <li><Link href="/gallery" className="hover:underline">Gallery</Link></li>
            <li><Link href="/contact" className="hover:underline">Contact</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="font-heading text-lg">Social</h4>
          <ul className="mt-3 space-y-2 text-sm">
            <li><a href="#" className="hover:underline">Instagram</a></li>
            <li><a href="#" className="hover:underline">Facebook</a></li>
            <li><a href="#" className="hover:underline">X (Twitter)</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-stoneWarm-200/70 py-5 text-center text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
        (c) {new Date().getFullYear()} Mubende Country Resort. All rights reserved.
      </div>
    </footer>
  );
}
