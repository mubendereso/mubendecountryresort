import type { Metadata } from 'next';
import { Manrope, Playfair_Display } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

const heading = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-heading'
});

const body = Manrope({
  subsets: ['latin'],
  variable: '--font-body'
});

export const metadata: Metadata = {
  title: 'Mubende Country Resort',
  description: 'A warm and elegant resort escape in Mubende, Uganda.'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className={`${heading.variable} ${body.variable} font-body bg-canvas-light text-zinc-800 dark:bg-canvas-dark dark:text-zinc-100`}>
        {/* Global site chrome */}
        <Navbar />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
