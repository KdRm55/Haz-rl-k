/**
 * Tam yedekten (yönetim paneli → Sistem kontrolü → "Tam yedek indir") geri yükleme.
 *
 * Kullanım:
 *   npm run geri-yukle -- "C:\yol\Hazirlik_Yedek_….json"          (önce yalnızca rapor; hiçbir şey yazılmaz)
 *   npm run geri-yukle -- "C:\yol\Hazirlik_Yedek_….json" --yaz    (veritabanındaki bütün kayıtları siler, yedeği yazar)
 *
 * İşlem tek seferde yapılır; hata olursa hiçbir şey değişmez. Yedekte tarama görüntüleri yoksa mevcut görüntüler korunur.
 */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import { GORSEL_TABLOSU, satirlariHazirla, sayacKolonlari, YEDEK_TABLOLARI, yedekDogrula } from '../src/lib/yedek-kurallari';

const dosya = process.argv.slice(2).find(a => !a.startsWith('--'));
const yaz = process.argv.includes('--yaz');
if (!dosya) { console.error('Kullanım: npm run geri-yukle -- "<yedek.json>" [--yaz]'); process.exit(1); }
if (!process.env.DATABASE_URL) { console.error('.env içinde DATABASE_URL yok.'); process.exit(1); }

const y = yedekDogrula(JSON.parse(await readFile(dosya, 'utf8')));
console.log(`Yedek: ${new Date(y.zaman).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })} · sürüm ${y.surum}${y.gorseller ? ' · tarama görüntüleri dahil' : ''}`);
for (const { ad } of YEDEK_TABLOLARI) {
  const n = y.tablolar[ad]?.length;
  console.log(`  ${ad.padEnd(26)} ${n == null ? '(yedekte yok — dokunulmaz)' : n + ' kayıt'}`);
}
if (!yaz) { console.log('\nYalnızca rapor. Yazmak için komutun sonuna --yaz ekleyin.'); process.exit(0); }

const baglanti = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
const db = drizzle(baglanti);
try {
  await db.transaction(async tx => {
    const yazilacak = YEDEK_TABLOLARI.filter(t => y.tablolar[t.ad] != null && !(t.ad === GORSEL_TABLOSU && !y.gorseller));
    for (const { tablo } of [...yazilacak].reverse()) await tx.delete(tablo);
    for (const { ad, tablo } of yazilacak) {
      const satirlar = satirlariHazirla(tablo, y.tablolar[ad]);
      for (let i = 0; i < satirlar.length; i += 500) await tx.insert(tablo).values(satirlar.slice(i, i + 500) as never);
      for (const k of sayacKolonlari(tablo)) {
        await tx.execute(sql.raw(`select setval(pg_get_serial_sequence('"${ad}"', '${k}'), coalesce((select max("${k}") from "${ad}"), 0) + 1, false)`));
      }
    }
  });
  console.log('\nGeri yükleme tamamlandı.');
} catch (e) {
  console.error('\nGeri yükleme yapılamadı; veritabanı değişmedi:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await baglanti.end();
}
