/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
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
            value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests"
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
