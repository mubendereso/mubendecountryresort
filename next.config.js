/** @type {import('next').NextConfig} */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- this config is intentionally CommonJS
const { buildStorefrontContentSecurityPolicy } = require('./lib/security/csp.cjs');

const contentSecurityPolicy = buildStorefrontContentSecurityPolicy({
  isDevelopment: process.env.NODE_ENV === 'development',
  r2PublicHostname: process.env.R2_PUBLIC_HOSTNAME
});

const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com'
      },
      {
        // R2 public bucket hosting admin-uploaded room images. Overridable via
        // env for a custom CDN domain; defaults to the bucket's r2.dev host.
        protocol: 'https',
        hostname: process.env.R2_PUBLIC_HOSTNAME ?? '*.r2.dev'
      }
    ]
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
          },
          {
            key: 'Content-Security-Policy',
            value: contentSecurityPolicy
          }
        ]
      }
    ];
  }
};

module.exports = nextConfig;

if (!process.env.VERCEL) {
  import('@opennextjs/cloudflare').then((m) => m.initOpenNextCloudflareForDev());
}
