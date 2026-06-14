import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Mubende Country Resort',
    short_name: 'MCR',
    description: 'A warm and elegant resort escape in Mubende, Uganda.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f8f4ec',
    theme_color: '#646b54',
    categories: ['travel', 'lodging'],
    icons: [
      {
        src: '/icons/mcr-official-logo.png',
        sizes: '2000x2000',
        type: 'image/png',
        purpose: 'any'
      }
    ]
  };
}
