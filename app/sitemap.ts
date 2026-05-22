import { amenities } from '@/app/amenities/data';
import type { MetadataRoute } from 'next';
import { experiences } from '@/app/experiences/data';
import { getRoomSlugs } from '@/lib/rooms/data';
import { services } from '@/app/services/data';

// Generated at request time, not build time: room slugs come from the DB and
// DATABASE_URL is unavailable during the static build.
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl =
    process.env.SITE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    'https://kiasili-ventures.com';
  const now = new Date();

  const routes = ['', '/rooms', '/gallery', '/amenities', '/contact'];
  const amenityRoutes = amenities.map((item) => `/amenities/${item.slug}`);
  const experienceRoutes = experiences.map((item) => `/experiences/${item.slug}`);
  const roomRoutes = (await getRoomSlugs()).map((slug) => `/rooms/${slug}`);
  const serviceRoutes = services.map((item) => `/services/${item.slug}`);
  const allRoutes = [...routes, ...amenityRoutes, ...experienceRoutes, ...serviceRoutes, ...roomRoutes];

  return allRoutes.map((route) => ({
    url: `${siteUrl}${route}`,
    lastModified: now,
    changeFrequency: route === '' ? 'weekly' : 'monthly',
    priority: route === '' ? 1 : 0.8
  }));
}
