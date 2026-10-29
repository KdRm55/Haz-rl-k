/**
 * Yönetici hesabı ekler ya da var olan bir hesabı yönetici yapıp şifresini değiştirir.
 * İlk kurulumda ve bütün yöneticiler şifresini unuttuğunda kullanılır; diğer hesaplar yönetim panelinin "Kullanıcılar" sekmesinden yönetilir.
 * Kullanım: npm run yonetici
 */
import 'dotenv/config';
import { createInterface } from 'node:readline';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, sql as dsql } from 'drizzle-orm';
import * as s from '../src/db/schema';
import { adSoyadNorm, epostaNorm, sifreDenetle } from '../src/lib/hesap-kurallari';
import { kodOzeti } from '../src/lib/kod';

if (!process.env.DATABASE_URL) { console.error('DATABASE_URL tanımlı değil (.env dosyası).'); process.exit(1); }
const baglanti = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
const db = drizzle(baglanti, { schema: s });
const rl = createInterface({ input: process.stdin, terminal: false });
const satirlar = rl[Symbol.asyncIterator]();
// question() yerine satır satır okunur; böylece değerler bir dosyadan/borudan da verilebilir
async function soru(metin: string) {
  process.stdout.write(metin);
  const r = await satirlar.next();
  if (!process.stdin.isTTY) process.stdout.write('\n');
  return r.done ? '' : String(r.value).trim();
}
async function gecerli<T>(metin: string, f: (v: string) => T): Promise<T> {
  for (;;) {
    try { return f(await soru(metin)); } catch (e) { console.log('  ' + (e as Error).message); }
  }
}

try {
  const eposta = await gecerli('E-posta: ', epostaNorm);
  const [var_] = await db.select().from(s.kullanicilar).where(eq(s.kullanicilar.eposta, eposta));
  if (var_) console.log(`Bu e-postayla bir hesap var (${var_.adSoyad}); yönetici yapılıp şifresi değiştirilecek.`);
  const adSoyad = var_ ? var_.adSoyad : await gecerli('Ad soyad: ', adSoyadNorm);
  const sifre = await gecerli('Şifre (en az 8 karakter): ', v => sifreDenetle(v));
  await gecerli('Şifre (tekrar): ', v => sifreDenetle(sifre, v));
  rl.close();
  const deger = { tur: 'admin', adSoyad, sifreOzeti: kodOzeti(sifre), durum: 'aktif', sifreDegistirmeli: false };
  if (var_) await db.update(s.kullanicilar).set({ ...deger, oturumSurumu: dsql`${s.kullanicilar.oturumSurumu} + 1` }).where(eq(s.kullanicilar.id, var_.id));
  else await db.insert(s.kullanicilar).values({ ...deger, eposta });
  await db.insert(s.islemKaydi).values({ kullanici: 'yönetici komutu', islem: var_ ? 'Yönetici güncelleme' : 'Yönetici ekleme', ayrinti: `${adSoyad} (${eposta})` });
  console.log(`\n${adSoyad} (${eposta}) yönetici olarak ${var_ ? 'güncellendi' : 'eklendi'}. Yönetim paneline bu e-posta ve şifreyle girebilirsiniz.`);
} finally {
  rl.close();
  await baglanti.end();
}
