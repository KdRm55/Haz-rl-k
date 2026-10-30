import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
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
  if (process.env.NODE_ENV !== 'production') return url;
  try {
    const u = new URL(url);
    if (u.hostname.endsWith('.pooler.supabase.com') && u.port === '5432') { u.port = '6543'; return u.toString(); }
  } catch { /* adres çözümlenemezse olduğu gibi kullanılır */ }
  return url;
}

/** Veritabanı bağlantısı ilk kullanımda kurulur; derleme sırasında DATABASE_URL gerekmez. */
export function vt(): Vt {
  if (globalIcin.__vt) return globalIcin.__vt;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL tanımlı değil. .env.example dosyasına bakın.');
  const sql = postgres(baglantiAdresi(url), {
    prepare: false,        // havuzlu (transaction kipindeki) bağlantılarla uyumlu
    max: 3,                // bir istekteki paralel sorgular sıraya girmesin; transaction kipinde istemci bağlantısı veritabanı bağlantısı tutmaz
    idle_timeout: 30,      // art arda yapılan işlemlerde bağlantı yeniden kurulmasın (yeni bağlantı ~0,8 sn sürüyor)
    connect_timeout: 10,
    max_lifetime: 60 * 10
  });
  globalIcin.__vt = drizzle(sql, { schema });
  return globalIcin.__vt;
}

export { schema };
