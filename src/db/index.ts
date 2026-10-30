import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

type Vt = ReturnType<typeof drizzle<typeof schema>>;
const globalIcin = globalThis as unknown as { __vt?: Vt };

/** Veritabanı bağlantısı ilk kullanımda kurulur; derleme sırasında DATABASE_URL gerekmez. */
export function vt(): Vt {
  if (globalIcin.__vt) return globalIcin.__vt;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL tanımlı değil. .env.example dosyasına bakın.');
  // Serverless ortamda (Vercel) her fonksiyon için max: 1 ve kısa idle_timeout (5sn)
  // Supabase havuzunun (15-20 bağlantı) dolmasını ve sayfaların kilitlenmesini önler.
  const isProd = process.env.NODE_ENV === 'production';
  const sql = postgres(url, {
    prepare: false,
    max: isProd ? 1 : 5,
    idle_timeout: isProd ? 5 : 20,
    connect_timeout: 10,
    max_lifetime: 300
  });
  globalIcin.__vt = drizzle(sql, { schema });
  return globalIcin.__vt;
}

export { schema };
