import "server-only";

import { getSql } from "@/lib/db/client";

// Storefront room content is sourced from the shared `room_types` table, which
// the admin app manages (titles, copy, pricing, cover image, gallery). Keeping
// this the single source of truth means edits in admin reflect on the
// storefront. Pages that consume these helpers render with `force-dynamic` so a
// fresh DB read happens per request (no stale static cache).

export type Room = {
  slug: string;
  title: string;
  description: string;
  price: string;
  priceUgx: number;
  image: string;
};

export type DetailedRoom = Room & {
  overview: string;
  details: string[];
  amenities: string[];
  diningHours: string[];
  gallery: string[];
};

// Shown when a room has no cover image set yet, so cards/heroes never break.
const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1566665797739-1674de7a421a?auto=format&fit=crop&w=1400&q=80";

const FALLBACK_GALLERY_IMAGES = [
  "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1400&q=80",
  "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1519823551278-64ac92734fb1?auto=format&fit=crop&w=1400&q=80",
  "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1400&q=80",
  "https://images.unsplash.com/photo-1445019980597-93fa8acb246c?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1400&q=80",
  "https://images.unsplash.com/photo-1470246973918-29a93221c455?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?auto=format&fit=crop&w=1400&q=80"
];

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

// price_ugx is a Postgres bigint, returned by the driver as a string.
type RoomTypeRow = {
  slug: string;
  title: string;
  description: string | null;
  overview: string | null;
  price_ugx: string | number;
  cover_image_url: string | null;
  details: string[] | null;
  amenities: string[] | null;
  dining_hours: string[] | null;
  gallery: string[] | null;
};

function formatPrice(priceUgx: number): string {
  return `${new Intl.NumberFormat("en-UG").format(priceUgx)} UGX / night`;
}

function toRoom(row: RoomTypeRow): Room {
  const priceUgx = Number(row.price_ugx);
  return {
    slug: row.slug,
    title: row.title,
    description: row.description ?? "",
    priceUgx,
    price: formatPrice(priceUgx),
    image: row.cover_image_url ?? FALLBACK_IMAGE
  };
}

function toDetailedRoom(row: RoomTypeRow): DetailedRoom {
  const base = toRoom(row);
  const gallery = row.gallery ?? [];
  return {
    ...base,
    overview: row.overview ?? "",
    details: row.details ?? [],
    amenities: row.amenities ?? [],
    diningHours: row.dining_hours ?? [],
    // Fall back to the cover image so the gallery section is never empty.
    gallery: gallery.length > 0 ? gallery : [base.image]
  };
}

export async function getRooms(): Promise<Room[]> {
  const sql = getSql();
  const rows = (await sql`
    select slug, title, description, overview, price_ugx, cover_image_url,
           details, amenities, dining_hours, gallery
    from room_types
    where is_published = true
    order by sort_order asc, title asc
  `) as RoomTypeRow[];
  return rows.map(toRoom);
}

export async function getDetailedRooms(): Promise<DetailedRoom[]> {
  const sql = getSql();
  const rows = (await sql`
    select slug, title, description, overview, price_ugx, cover_image_url,
           details, amenities, dining_hours, gallery
    from room_types
    where is_published = true
    order by sort_order asc, title asc
  `) as RoomTypeRow[];
  return rows.map(toDetailedRoom);
}

export async function getRoomBySlug(slug: string): Promise<DetailedRoom | null> {
  const sql = getSql();
  const rows = (await sql`
    select slug, title, description, overview, price_ugx, cover_image_url,
           details, amenities, dining_hours, gallery
    from room_types
    where slug = ${slug} and is_published = true
    limit 1
  `) as RoomTypeRow[];
  return rows[0] ? toDetailedRoom(rows[0]) : null;
}

export async function getRoomSlugs(): Promise<string[]> {
  const sql = getSql();
  const rows = (await sql`
    select slug from room_types where is_published = true order by sort_order asc
  `) as { slug: string }[];
  return rows.map((r) => r.slug);
}

function getKampalaWeekIndex(date = new Date()): number {
  const kampalaDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kampala" }).format(date);
  const utcMidnight = Date.parse(`${kampalaDate}T00:00:00Z`);
  return Math.floor(utcMidnight / MS_PER_WEEK);
}

function rotateForCurrentWeek(images: string[]): string[] {
  if (images.length <= 1) return images;
  const offset = getKampalaWeekIndex() % images.length;
  return [...images.slice(offset), ...images.slice(0, offset)];
}

function compactImagePool(images: string[]): string[] {
  return Array.from(new Set(images.map((image) => image.trim()).filter(Boolean)));
}

export async function getResortGalleryImages(limit?: number): Promise<string[]> {
  const sql = getSql();
  const rows = (await sql`
    select image_url
    from (
      select rt.sort_order * 1000 as sort_key, rt.cover_image_url as image_url
      from room_types rt
      where rt.is_published = true and rt.cover_image_url is not null

      union all

      select rt.sort_order * 1000 + g.ordinality::int as sort_key, g.image_url
      from room_types rt
      cross join lateral unnest(rt.gallery) with ordinality as g(image_url, ordinality)
      where rt.is_published = true

      union all

      select 100000 + gi.sort_order as sort_key, gi.image_url
      from gallery_images gi
      where gi.is_published = true
    ) pooled
    where image_url is not null and btrim(image_url) <> ''
    order by sort_key asc, image_url asc
  `) as { image_url: string }[];

  const pooled = compactImagePool(rows.map((row) => row.image_url));
  const rotated = rotateForCurrentWeek(pooled.length > 0 ? pooled : FALLBACK_GALLERY_IMAGES);
  return typeof limit === "number" ? rotated.slice(0, limit) : rotated;
}
