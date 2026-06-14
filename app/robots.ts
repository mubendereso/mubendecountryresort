import type { MetadataRoute } from 'next';
import { getSiteOrigin } from '@/lib/env';

export default function robots(): MetadataRoute.Robots {
  const siteOrigin = getSiteOrigin();

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/']
    },
    sitemap: `${siteOrigin}/sitemap.xml`,
    host: siteOrigin
  };
}
