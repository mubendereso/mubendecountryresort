import type { Metadata } from 'next';
import { Manrope, Playfair_Display } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { getSiteOrigin } from '@/lib/env';

const heading = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-heading'
});

const body = Manrope({
  subsets: ['latin'],
  variable: '--font-body'
});

const siteOrigin = getSiteOrigin();
const siteDescription = 'A warm and elegant resort escape in Mubende, Uganda.';
const logoPath = '/icons/mcr-official-logo.png';

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: {
    default: 'Mubende Country Resort',
    template: '%s | Mubende Country Resort'
  },
  description: siteDescription,
  applicationName: 'Mubende Country Resort',
  alternates: {
    canonical: '/'
  },
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: logoPath, type: 'image/png' }],
    shortcut: logoPath,
    apple: logoPath
  },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'Mubende Country Resort',
    title: 'Mubende Country Resort',
    description: siteDescription,
    images: [
      {
        url: logoPath,
        width: 2000,
        height: 2000,
        alt: 'Mubende Country Resort official logo'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Mubende Country Resort',
    description: siteDescription,
    images: [logoPath]
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1
    }
  }
};

const resortStructuredData = {
  '@context': 'https://schema.org',
  '@type': 'Resort',
  '@id': `${siteOrigin}/#resort`,
  name: 'Mubende Country Resort',
  url: siteOrigin,
  logo: `${siteOrigin}${logoPath}`,
  image: `${siteOrigin}${logoPath}`,
  description: siteDescription,
  slogan: 'Discover, Stay, Belong',
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'Mubende',
    addressRegion: 'Central Region',
    addressCountry: 'UG'
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(resortStructuredData) }}
        />
      </head>
      <body className={`${heading.variable} ${body.variable} font-body bg-canvas-light text-zinc-800 dark:bg-canvas-dark dark:text-zinc-100`}>
        {/* Global site chrome */}
        <Navbar />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
