import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

type Vt = ReturnType<typeof drizzle<typeof schema>>;
const globalIcin = globalThis as unknown as { __vt?: Vt };

/**
 * Sunucusuz ortamda (Vercel) Supabase'e "Transaction pooler" (6543) üzerinden bağlanılır.
 * "Session pooler" (5432) ücretsiz planda en çok 15 eşzamanlı bağlantıya izin verir; Vercel'in açtığı her örnek bir bağlantı
 * tuttuğu için havuz dolar ve istekler sırada bekler (sayfa donar). Adres 5432 ile verilmişse aynı sunucunun 6543'üne geçilir.
 * Bilgisayardaki komutlar (geçiş, aktarım) NODE_ENV=production olmadığı için verilen adresi olduğu gibi kullanır.
 */
function baglantiAdresi(url: string) {
  try {
    const u = new URL(url);
    // SSL aşağıda açıkça kurulur; adresteki sslmode (Vercel'in Supabase entegrasyonu ekler) pg'de sertifika doğrulamasını zorlar
    ['sslmode', 'sslrootcert', 'sslcert', 'sslkey'].forEach(k => u.searchParams.delete(k));
    if (process.env.NODE_ENV === 'production' && u.hostname.endsWith('.pooler.supabase.com') && u.port === '5432') u.port = '6543';
    return u.toString();
  } catch { return url; }   // adres çözümlenemezse olduğu gibi kullanılır
}

const yerelMi = (url: string) => { try { return ['localhost', '127.0.0.1', '::1'].includes(new URL(url).hostname); } catch { return false; } };

/**
 * Veritabanı bağlantısı ilk kullanımda kurulur; derleme sırasında DATABASE_URL gerekmez.
 * Sürücü node-postgres (pg): her bağlantıda aynı anda tek sorgu çalışır, fazlası havuzda sırasını bekler.
 * "postgres" (postgres.js) sürücüsü bağlantılar doluyken sorguları aynı bağlantıya yığar (pipelining); Supabase'in
 * Transaction pooler'ı bunda takılıyor ve panel birkaç işlemden sonra kilitleniyordu.
 */
export function vt(): Vt {
  if (globalIcin.__vt) return globalIcin.__vt;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL tanımlı değil. .env.example dosyasına bakın.');
  const pool = new pg.Pool({
    connectionString: baglantiAdresi(url),
    // Supabase sertifikası kendi kök sertifikasıyla imzalı; bağlantı şifrelenir, sertifika zinciri doğrulanmaz
    ssl: yerelMi(url) ? undefined : { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 20_000,          // art arda işlemlerde bağlantı yeniden kurulmasın (yeni bağlantı ~0,8 sn sürüyor)
    connectionTimeoutMillis: 10_000,    // bağlantı alınamazsa sonsuza dek beklemek yerine hata verir
    query_timeout: 30_000,              // takılan bir sorgu bütün işlemleri kilitlemesin
    maxLifetimeSeconds: 600
  });
  // Boştaki bir bağlantı koparsa (sunucu kapattı, örnek uyutuldu) süreç çökmesin; havuz yenisini açar
  pool.on('error', e => console.error('Veritabanı bağlantısı koptu:', e.message));
  globalIcin.__vt = drizzle(pool, { schema });
  return globalIcin.__vt;
}

export { schema };
