/**
 * Veritabanında açık yazılmış TC son 6 hanelerini VERI_ANAHTARI ile özete çevirir (bir kez; eski kayıtlar ve
 * özetlemeden önce alınmış bir yedekten geri yükleme sonrası). Özetlenmiş kayıtlara dokunulmaz.
 *
 * Kullanım:
 *   npm run tc-ozetle            (önce yalnızca rapor; hiçbir şey yazılmaz)
 *   npm run tc-ozetle -- --yaz   (açık kayıtları özetler)
 *
 * VERI_ANAHTARI, Vercel'dekiyle aynı olmalı; yoksa öğrenciler hesap açarken eşleşme bozulur.
 */
import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq, ne, not, like } from 'drizzle-orm';
import * as s from '../src/db/schema';
import { TC_OZET_ONEK } from '../src/lib/hesap-kurallari';
import { tcOzeti } from '../src/lib/tc-ozeti';

const yaz = process.argv.includes('--yaz');
if (!process.env.DATABASE_URL) { console.error('.env içinde DATABASE_URL yok.'); process.exit(1); }
try { tcOzeti('000000'); } catch (e) { console.error((e as Error).message); process.exit(1); }

const baglanti = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
const db = drizzle(baglanti, { schema: s });
try {
  const acik = await db.select({ no: s.ogrenciler.no, tc6: s.ogrenciler.tc6 }).from(s.ogrenciler)
    .where(and(ne(s.ogrenciler.tc6, ''), not(like(s.ogrenciler.tc6, TC_OZET_ONEK + '%'))));
  const gecerli = acik.filter(o => /^\d{6}$/.test(o.tc6)), bozuk = acik.length - gecerli.length;
  console.log(`Açık yazılmış TC son 6: ${gecerli.length} öğrenci${bozuk ? ` · 6 rakam olmayan ${bozuk} kayıt (boşaltılacak)` : ''}`);
  if (!yaz) { console.log('Yalnızca rapor. Yazmak için: npm run tc-ozetle -- --yaz'); process.exit(0); }
  await db.transaction(async tx => {
    for (const o of acik) {
      await tx.update(s.ogrenciler).set({ tc6: /^\d{6}$/.test(o.tc6) ? tcOzeti(o.tc6) : '' }).where(eq(s.ogrenciler.no, o.no));
    }
    await tx.insert(s.islemKaydi).values({ kullanici: 'yönetici komutu', islem: 'TC özetleme', ayrinti: `${acik.length} öğrencinin TC son 6 hanesi özetlendi` });
  });
  console.log(`${acik.length} kayıt özetlendi.`);
} finally {
  await baglanti.end();
}
