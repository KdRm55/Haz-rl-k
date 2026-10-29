/** Ayar yazma. db: bir veritabanı işleminin içinden çağrılıyorsa o işlemin bağlantısı verilmeli. */
import 'server-only';
import { vt, schema } from '@/db';
import { AYAR_TANIMLARI, OG_BOLUM_TANIMLARI } from './ayar-tanimlari';

export async function ayarYaz(anahtar: string, deger: string, db: Pick<ReturnType<typeof vt>, 'insert'> = vt()) {
  const tanim = AYAR_TANIMLARI.find(t => t.anahtar === anahtar) ?? OG_BOLUM_TANIMLARI.find(t => t.anahtar === anahtar);
  await db.insert(schema.ayarlar).values({ anahtar, deger, aciklama: tanim?.aciklama ?? '' })
    .onConflictDoUpdate({ target: schema.ayarlar.anahtar, set: { deger } });
}
