import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Aprende · Lectura y escritura', description: 'Prácticas de lectura y escritura con acompañamiento familiar.', icons: { icon: '/assets/icon.svg' }, manifest: '/manifest.webmanifest' };
export default function Layout({children}: {children: React.ReactNode}) { return <html lang="es"><head><meta name="viewport" content="width=device-width, initial-scale=1"/><link rel="stylesheet" href="/styles.css"/></head><body>{children}</body></html>; }
