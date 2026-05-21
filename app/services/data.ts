export type Service = {
  slug: string;
  title: string;
  image: string;
  summary: string;
  overview: string;
  details: string[];
  gallery: string[];
};

export const services: Service[] = [
  {
    slug: 'poolside-leisure',
    title: 'Poolside Leisure',
    image: 'https://images.unsplash.com/photo-1564501049412-61c2a3083791?auto=format&fit=crop&w=900&q=80',
    summary: 'Unwind by the water with calm views, lounge seating, and all-day relaxation.',
    overview:
      'Our poolside setting is designed for restful afternoons and easy social moments, with shaded seats and drinks available nearby.',
    details: [
      'Comfortable seating and shaded areas.',
      'Refreshing drinks and light bites available.',
      'Ideal for both solo and family downtime.'
    ],
    gallery: [
      'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1400&q=80',
      'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1400&q=80',
      'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=1400&q=80'
    ]
  },
  {
    slug: 'signature-dining',
    title: 'Signature Dining',
    image: 'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=900&q=80',
    summary: 'Fresh menus, warm ambiance, and curated meals from morning to evening.',
    overview:
      'Signature Dining combines local ingredients with refined presentation, giving guests a memorable food experience throughout their stay.',
    details: [
      'Breakfast, lunch, and dinner service.',
      'Local and continental menu options.',
      'Private table arrangements available on request.'
    ],
    gallery: [
      'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1400&q=80',
      'https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=1400&q=80',
      'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1400&q=80'
    ]
  },
  {
    slug: 'garden-escapes',
    title: 'Garden Escapes',
    image: 'https://images.unsplash.com/photo-1463936575829-25148e1db1b8?auto=format&fit=crop&w=900&q=80',
    summary: 'Step into peaceful greenery and quiet corners across the resort grounds.',
    overview:
      'Garden Escapes offers scenic paths, restful benches, and open-air spaces for reading, walking, and gentle reflection.',
    details: [
      'Landscaped walkways and relaxation spots.',
      'Photo-friendly scenery and natural light.',
      'Perfect for morning walks and evening unwinding.'
    ],
    gallery: [
      'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1400&q=80',
      'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1400&q=80',
      'https://images.unsplash.com/photo-1470246973918-29a93221c455?auto=format&fit=crop&w=1400&q=80'
    ]
  }
];
