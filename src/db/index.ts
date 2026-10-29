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
  // prepare: false → havuzlu (pgbouncer) bağlantılarla uyumlu; sunucusuz ortamda tek bağlantı yeterli
  const sql = postgres(url, { prepare: false, max: process.env.NODE_ENV === 'production' ? 1 : 5 });
  globalIcin.__vt = drizzle(sql, { schema });
  return globalIcin.__vt;
}

export { schema };
