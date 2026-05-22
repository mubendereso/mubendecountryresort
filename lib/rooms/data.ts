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
