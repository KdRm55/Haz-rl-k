/**
 * Oturum: kişisel hesapla (yönetici ve hoca e-postayla, öğrenci öğrenci numarasıyla) giriş yapılınca hesap kimliği
 * imzalı ve httpOnly bir çereze yazılır. Her istekte hesap veritabanından okunur: kapatılan hesap ya da değişen şifre
 * eski oturumları hemen geçersiz kılar.
 */
import 'server-only';
import { cache } from 'react';
import { SignJWT, jwtVerify } from 'jose';
import { cookies, headers } from 'next/headers';
import { and, count, eq, gt, inArray, lt, sql } from 'drizzle-orm';
import { vt, schema } from '@/db';
import { KullaniciHatasi, YetkiHatasi } from './hata';
import { adSoyadNorm, epostaNorm, sifreDenetle, TC_HANE, type HesapTuru } from './hesap-kurallari';
import { kodDogru, kodOzeti } from './kod';
import { KVKK_SURUM } from './kvkk';
import { basNorm } from './metin';
import { tcOzeti } from './tc-ozeti';

export type Rol = HesapTuru;
export type Sayfa = 'hoca' | 'yonetim' | 'ogrenci';

const CEREZ = 'hz_oturum';
const OTURUM_SURE_SN = 12 * 60 * 60;   // 12 saat
const HATA_SURE_MS = 10 * 60 * 1000;
const ADRES_LIMIT = 30;                 // 10 dk içinde bir adresten izin verilen hatalı deneme
const KIMLIK_LIMIT = 8;                 // 10 dk içinde bir hesap (e-posta / öğrenci no) için hatalı deneme

export const SAYFA_ROLLERI: Record<Sayfa, Rol[]> = { yonetim: ['admin'], hoca: ['admin', 'hoca'], ogrenci: ['ogrenci'] };
const SAYFA_ADI: Record<Sayfa, string> = { yonetim: 'Yönetim paneli', hoca: 'Hoca ekranı', ogrenci: 'Öğrenci ekranı' };

export type Oturum = {
  id: number; tur: Rol; adSoyad: string; eposta: string; ogrenciNo: string; hocaAdi: string; sifreDegistirmeli: boolean;
  kvkkOnayli: boolean;   // öğrenci güncel KVKK metnini onayladı mı (diğer hesaplar için her zaman true)
  dersler: string[];     // öğretim elemanına atanan dersler (boş: ders programındaki bütün dersleri)
};

function anahtar() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET en az 32 karakter olmalı. .env.example dosyasına bakın.');
  return new TextEncoder().encode(s);
}

export async function istemciAdresi(): Promise<string> {
  const h = await headers();
  return (h.get('x-forwarded-for') || '').split(',')[0].trim() || h.get('x-real-ip') || 'yerel';
}

/** Geçerli oturumun hesabı (istek başına bir kez okunur). */
export const oturum = cache(async (): Promise<Oturum | null> => {
  const c = (await cookies()).get(CEREZ)?.value;
  if (!c) return null;
  try {
    const { payload } = await jwtVerify(c, anahtar());
    const id = Number(payload.k), surum = Number(payload.s);
    if (!Number.isInteger(id)) return null;
    const [u] = await vt().select().from(schema.kullanicilar).where(eq(schema.kullanicilar.id, id));
    if (!u || u.durum !== 'aktif' || u.oturumSurumu !== surum) return null;
    return { id: u.id, tur: u.tur as Rol, adSoyad: u.adSoyad, eposta: u.eposta ?? '', ogrenciNo: u.ogrenciNo ?? '', hocaAdi: u.hocaAdi, sifreDegistirmeli: u.sifreDegistirmeli,
      kvkkOnayli: u.tur !== 'ogrenci' || u.kvkkSurum === KVKK_SURUM, dersler: u.dersler ?? [] };
  } catch {
    return null;
  }
});

/** Giriş yapılmış, şifresi geçerli (geçici değil) ve KVKK onayı tamam olan hesabın türü. */
export async function oturumRolu(): Promise<Rol | null> {
  const o = await oturum();
  return o && !o.sifreDegistirmeli && o.kvkkOnayli ? o.tur : null;
}

/** Sunucu işlemlerinin başında çağrılır; yetki yoksa hata fırlatır. KVKK onayı vermemiş öğrenci hiçbir işlem yapamaz. */
export async function oturumGerekli(roller: Rol[]): Promise<Oturum> {
  const o = await oturum();
  if (!o || o.sifreDegistirmeli || !o.kvkkOnayli || !roller.includes(o.tur)) throw new YetkiHatasi();
  return o;
}
export async function yetkiGerekli(roller: Rol[]): Promise<Rol> {
  return (await oturumGerekli(roller)).tur;
}

/** Hoca yalnızca kendi adına (ders programındaki adı) işlem yapar; yönetici herkes adına. */
export function hocaKapsami(o: Oturum, teacher: string) {
  if (o.tur === 'hoca' && basNorm(teacher) !== basNorm(o.hocaAdi)) {
    throw new KullaniciHatasi('Yalnızca kendi derslerinizle ilgili işlem yapabilirsiniz.');
  }
}
/**
 * Öğretim elemanı bu dersin işlemlerini yapabilir mi: hesaba ders atanmışsa yalnızca atanan dersler, atanmamışsa
 * ders programında kendi adıyla verdiği bütün dersler (program eşleşmesi ayrıca denetlenir). Yönetici her ders.
 */
export const dersAtanmis = (o: Pick<Oturum, 'tur' | 'dersler'>, ders: string) =>
  o.tur !== 'hoca' || !o.dersler.length || o.dersler.some(d => basNorm(d) === basNorm(ders));
export const kimAdi = (o: Pick<Oturum, 'adSoyad' | 'eposta' | 'ogrenciNo'>) => o.adSoyad || o.eposta || o.ogrenciNo;

export async function islemKaydet(islem: string, ayrinti = '', kullanici?: string) {
  try {
    if (kullanici == null) { const o = await oturum().catch(() => null); kullanici = o ? kimAdi(o) : '-'; }
    await vt().insert(schema.islemKaydi).values({ kullanici, islem, ayrinti });
  } catch { /* kayıt başarısız olsa da işlem devam eder */ }
}

/* ---------- Hatalı deneme sınırı ---------- */
async function denemeSiniri(kimlik: string) {
  const db = vt(), ip = await istemciAdresi(), sinir = new Date(Date.now() - HATA_SURE_MS);
  const say = async (k: string) => (await db.select({ n: count() }).from(schema.girisDenemeleri)
    .where(and(eq(schema.girisDenemeleri.anahtar, k), gt(schema.girisDenemeleri.zaman, sinir))))[0].n;
  if (await say('ip:' + ip) >= ADRES_LIMIT || await say('id:' + kimlik) >= KIMLIK_LIMIT) {
    throw new KullaniciHatasi('Çok fazla hatalı deneme yapıldı. 10 dakika sonra tekrar deneyin.');
  }
  return {
    hatali: async () => {
      await db.insert(schema.girisDenemeleri).values([{ anahtar: 'ip:' + ip }, { anahtar: 'id:' + kimlik }]);
      if (Math.random() < 0.05) await db.delete(schema.girisDenemeleri).where(lt(schema.girisDenemeleri.zaman, sinir));
    },
    temizle: () => db.delete(schema.girisDenemeleri).where(eq(schema.girisDenemeleri.anahtar, 'id:' + kimlik))
  };
}

async function cerezYaz(id: number, surum: number) {
  const jwt = await new SignJWT({ k: id, s: surum }).setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt().setExpirationTime(OTURUM_SURE_SN + 's').sign(anahtar());
  (await cookies()).set(CEREZ, jwt, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: OTURUM_SURE_SN
  });
}

// Hesap yokken de şifre karşılaştırması yapılır: yanıt süresinden hesabın varlığı anlaşılmasın
const SAHTE_OZET = kodOzeti('sahte-sifre-karsilastirma');

/* ---------- Giriş ---------- */
export type GirisSonucu = { ok: true; rol: Rol } | { ok: false; mesaj: string };

/** Öğrenci ekranında kimlik öğrenci numarasıdır; hoca ekranı ve yönetim panelinde e-posta. */
export async function girisYap(sayfa: Sayfa, kimlikHam: string, sifre: string): Promise<GirisSonucu> {
  const ogr = sayfa === 'ogrenci';
  const kimlik = ogr ? String(kimlikHam ?? '').replace(/\s+/g, '').slice(0, 20) : String(kimlikHam ?? '').trim().toLowerCase().slice(0, 200);
  if (!kimlik || !sifre) return { ok: false, mesaj: ogr ? 'Öğrenci numaranı ve şifreni yaz.' : 'E-posta adresinizi ve şifrenizi yazın.' };
  let sinir;
  try { sinir = await denemeSiniri(kimlik); } catch (e) { return { ok: false, mesaj: (e as Error).message }; }
  const k = schema.kullanicilar;
  const [u] = await vt().select().from(k).where(and(ogr ? eq(k.ogrenciNo, kimlik) : eq(k.eposta, kimlik), inArray(k.tur, SAYFA_ROLLERI[sayfa])));
  const dogru = kodDogru(String(sifre).slice(0, 200), u?.sifreOzeti ?? SAHTE_OZET);
  if (!u || !dogru) {
    await sinir.hatali();
    return { ok: false, mesaj: ogr ? 'Öğrenci numarası ya da şifre hatalı. Hesabın yoksa önce "Hesap oluştur"u kullan.' : 'E-posta ya da şifre hatalı.' };
  }
  await sinir.temizle();
  if (u.durum === 'bekliyor') return { ok: false, mesaj: 'Hesabınız yönetici onayı bekliyor. Onaylandığında giriş yapabilirsiniz.' };
  if (u.durum !== 'aktif') return { ok: false, mesaj: 'Bu hesap kapatılmış. Yöneticiyle görüşün.' };
  await vt().update(k).set({ sonGiris: new Date() }).where(eq(k.id, u.id));
  await cerezYaz(u.id, u.oturumSurumu);
  await islemKaydet('Giriş', SAYFA_ADI[sayfa], u.adSoyad || kimlik);
  return { ok: true, rol: u.tur as Rol };
}

/* ---------- Hesap oluşturma ---------- */
/**
 * Öğrenci: numarası, TC kimlik numarasının son 6 hanesi ve kendi şifresiyle hesap açar.
 * Öğrenci numarası sistemde kayıtlı olan her öğrenci hesap oluşturabilir.
 * Yazılan TC son 6 hanesi öğrencinin kaydına işlenir. KVKK aydınlatma metni onaylanmadan hesap açılmaz.
 */
export async function ogrenciKayit(noHam: string, tcHam: string, sifre: string, tekrar: string, kvkk: boolean): Promise<GirisSonucu> {
  const no = String(noHam ?? '').replace(/\s+/g, '').slice(0, 20);
  const tc = String(tcHam ?? '').replace(/\D/g, '');
  if (!no) return { ok: false, mesaj: 'Öğrenci numaranı yaz.' };
  if (tc.length !== TC_HANE) return { ok: false, mesaj: `TC kimlik numaranın son ${TC_HANE} hanesini yaz.` };
  try { sifreDenetle(sifre, tekrar); } catch (e) { return { ok: false, mesaj: (e as Error).message }; }
  if (!kvkk) return { ok: false, mesaj: 'Hesabını oluşturmak için kişisel verilerin hakkındaki metni okuyup onay kutusunu işaretlemelisin.' };
  let sinir;
  try { sinir = await denemeSiniri('kayit:' + no); } catch (e) { return { ok: false, mesaj: (e as Error).message }; }
  const db = vt();
  const [o] = await db.select().from(schema.ogrenciler).where(eq(schema.ogrenciler.no, no));
  if (!o || o.durum !== 'aktif') {
    await sinir.hatali();
    return { ok: false, mesaj: 'Bu öğrenci numarası sistemde bulunamadı. Numaranı kontrol et; sorun sürerse idareye başvur.' };
  }
  await sinir.temizle();
  const [var_] = await db.select({ id: schema.kullanicilar.id }).from(schema.kullanicilar).where(eq(schema.kullanicilar.ogrenciNo, no));
  if (var_) return { ok: false, mesaj: 'Bu numarayla zaten bir hesap açılmış. Şifreni unuttuysan idareye başvur.' };
  let tcOz: string;
  try { tcOz = tcOzeti(tc); } catch (e) { return { ok: false, mesaj: (e as Error).message }; }
  const u = await db.transaction(async tx => {
    const [yeni] = await tx.insert(schema.kullanicilar).values({
      tur: 'ogrenci', ogrenciNo: no, adSoyad: (o.adi + ' ' + o.soyadi).trim(), sifreOzeti: kodOzeti(sifre), durum: 'aktif', sonGiris: new Date(),
      kvkkOnay: new Date(), kvkkSurum: KVKK_SURUM
    }).returning();
    // Öğrencinin yazdığı TC son 6 hanesi kaydına özet olarak işlenir
    await tx.update(schema.ogrenciler).set({ tc6: tcOz, tc4: tc.slice(-4), guncellendi: new Date() }).where(eq(schema.ogrenciler.no, no));
    return yeni;
  });
  await cerezYaz(u.id, u.oturumSurumu);
  await islemKaydet('Hesap oluşturma', `Öğrenci ${no} (KVKK onayı ${KVKK_SURUM})`, u.adSoyad);
  return { ok: true, rol: 'ogrenci' };
}

/** Öğretim elemanı: hesap açar, yönetici onaylayana kadar giriş yapamaz. */
export async function hocaKayit(v: { adSoyad: string; eposta: string; hocaAdi: string; sifre: string; tekrar: string }): Promise<{ ok: boolean; mesaj: string }> {
  try {
    const adSoyad = adSoyadNorm(v.adSoyad), eposta = epostaNorm(v.eposta);
    const sifre = sifreDenetle(v.sifre, v.tekrar);
    const hocaAdi = String(v.hocaAdi ?? '').trim().slice(0, 120);
    const sinir = await denemeSiniri('hkayit:' + (await istemciAdresi()));
    const [var_] = await vt().select({ id: schema.kullanicilar.id }).from(schema.kullanicilar).where(eq(schema.kullanicilar.eposta, eposta));
    if (var_) { await sinir.hatali(); return { ok: false, mesaj: 'Bu e-posta adresiyle zaten bir hesap var. Şifrenizi unuttuysanız yöneticiye başvurun.' }; }
    await vt().insert(schema.kullanicilar).values({ tur: 'hoca', eposta, adSoyad, hocaAdi, sifreOzeti: kodOzeti(sifre), durum: 'bekliyor' });
    await islemKaydet('Hesap oluşturma', `Öğretim elemanı ${eposta} (onay bekliyor)`, adSoyad);
    return { ok: true, mesaj: 'Hesabınız oluşturuldu. Yönetici onayladığında bu e-posta ve şifreyle giriş yapabilirsiniz.' };
  } catch (e) {
    if (e instanceof KullaniciHatasi) return { ok: false, mesaj: e.message };
    throw e;
  }
}

/** Öğrencinin KVKK aydınlatma metnini onaylaması (hesap açılırken onay vermemiş ya da metin güncellenmişse). */
export async function kvkkOnayla(onay: boolean): Promise<{ ok: boolean; mesaj: string }> {
  const o = await oturum();
  if (!o) throw new YetkiHatasi();
  if (o.kvkkOnayli) return { ok: true, mesaj: '' };
  if (!onay) return { ok: false, mesaj: 'Devam etmek için metni okuyup onay kutusunu işaretlemelisin.' };
  await vt().update(schema.kullanicilar).set({ kvkkOnay: new Date(), kvkkSurum: KVKK_SURUM }).where(eq(schema.kullanicilar.id, o.id));
  await islemKaydet('KVKK onayı', 'Sürüm ' + KVKK_SURUM, kimAdi(o));
  return { ok: true, mesaj: 'Teşekkürler, onayın kaydedildi.' };
}

/** Kendi şifresini değiştirme (geçici şifreyle girenler için zorunlu). Diğer cihazlardaki oturumlar kapanır. */
export async function sifreDegistir(eski: string, yeni: string, tekrar: string): Promise<{ ok: boolean; mesaj: string }> {
  const o = await oturum();
  if (!o) throw new YetkiHatasi();
  try { sifreDenetle(yeni, tekrar); } catch (e) { return { ok: false, mesaj: (e as Error).message }; }
  if (eski === yeni) return { ok: false, mesaj: 'Yeni şifre eskisiyle aynı olmamalı.' };
  const k = schema.kullanicilar;
  const [u] = await vt().select().from(k).where(eq(k.id, o.id));
  let sinir;
  try { sinir = await denemeSiniri('sifre:' + o.id); } catch (e) { return { ok: false, mesaj: (e as Error).message }; }
  if (!u || !kodDogru(String(eski ?? ''), u.sifreOzeti)) { await sinir.hatali(); return { ok: false, mesaj: 'Mevcut şifre hatalı.' }; }
  const [y] = await vt().update(k).set({ sifreOzeti: kodOzeti(yeni), sifreDegistirmeli: false, oturumSurumu: sql`${k.oturumSurumu} + 1` })
    .where(eq(k.id, o.id)).returning({ surum: k.oturumSurumu });
  await cerezYaz(o.id, y.surum);
  await islemKaydet('Şifre değiştirme', '', kimAdi(o));
  return { ok: true, mesaj: 'Şifreniz değiştirildi.' };
}

export async function cikisYap() {
  (await cookies()).delete(CEREZ);
}
