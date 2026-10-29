/** Tam yedek: bütün tablolar tek JSON dosyası (yalnızca yönetim). Geri yükleme: scripts/yedekten-geri-yukle.ts */
import 'server-only';
import { count } from 'drizzle-orm';
import { vt } from '@/db';
import { islemKaydet, yetkiGerekli } from './oturum';
import { GORSEL_TABLOSU, YEDEK_SURUM, YEDEK_TABLOLARI, type Yedek } from './yedek-kurallari';

export async function yedekAl(gorseller: boolean): Promise<Yedek> {
  await yetkiGerekli(['admin']);
  const db = vt();
  const tablolar: Yedek['tablolar'] = {};
  // Tek bağlantılı havuzda sırayla okunur; tutarlı bir görüntü için tek işlem içinde (salt okuma)
  await db.transaction(async tx => {
    for (const { ad, tablo } of YEDEK_TABLOLARI) {
      if (ad === GORSEL_TABLOSU && !gorseller) continue;
      tablolar[ad] = await tx.select().from(tablo);
    }
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
  const toplam = Object.values(tablolar).reduce((t, l) => t + l.length, 0);
  await islemKaydet('Tam yedek', `${Object.keys(tablolar).length} tablo, ${toplam} kayıt${gorseller ? ' (tarama görüntüleri dahil)' : ''}`);
  return { uygulama: 'hazirlik-sistemi', surum: YEDEK_SURUM, zaman: new Date().toISOString(), gorseller, tablolar };
}

/** Panelde gösterilen tablo sayıları. */
export async function yedekOzeti() {
  await yetkiGerekli(['admin']);
  const db = vt();
  const out: { ad: string; sayi: number }[] = [];
  for (const { ad, tablo } of YEDEK_TABLOLARI) out.push({ ad, sayi: (await db.select({ n: count() }).from(tablo))[0].n });
  return out;
}
