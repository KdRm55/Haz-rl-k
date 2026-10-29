import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Sinop İlahiyat Fakültesi - Sınıf Sorgulama',
  description: 'Sinop İlahiyat Fakültesi Arapça Hazırlık Programı'
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
