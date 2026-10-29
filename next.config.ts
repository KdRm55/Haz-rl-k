import type { NextConfig } from 'next';

const config: NextConfig = {
  poweredByHeader: false,
  // Öğrenci listesi yüklemede dosya satırları sunucuya gönderilir (Vercel'in istek sınırı 4,5 MB)
  experimental: { serverActions: { bodySizeLimit: '4mb' } },
  // Eski Apps Script adres düzeni (…?sayfa=hoca, …?sayfa=yonetim) yeni sayfalara yönlenir.
  async redirects() {
    const eski = (deger: string, hedef: string) => ({
      source: '/', has: [{ type: 'query' as const, key: 'sayfa', value: deger }], destination: hedef, permanent: false
    });
    return [eski('(?:hoca|imza)', '/hoca'), eski('(?:yonetim|liste)', '/yonetim')];
  },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' }
      ]
    }];
  }
};

export default config;
