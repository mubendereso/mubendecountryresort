import type { MetadataRoute } from 'next';
import { getSiteOrigin } from '@/lib/env';

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteOrigin();

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/'
      }
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl
  };
}
