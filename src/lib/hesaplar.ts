/** Hesap yönetimi (yalnızca yönetici): hoca onayı, hesap ekleme, geçici şifre, hesabı kapatma / silme. */
import 'server-only';
import { randomInt } from 'node:crypto';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { vt, schema } from '@/db';
import { KullaniciHatasi } from './hata';
import { adSoyadNorm, epostaNorm, geciciSifre, type HesapDurumu } from './hesap-kurallari';
import { benzersiz } from './sirku-kurallari';
import { kodOzeti } from './kod';
import { islemKaydet, kimAdi, oturumGerekli, type Oturum } from './oturum';

const k = schema.kullanicilar;
const yonetici = () => oturumGerekli(['admin']);
const tarihSaat = (d: Date | null) => d ? new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'short', timeStyle: 'short' }).format(d) : '';
const yeniSifre = () => geciciSifre(n => randomInt(0, n));

async function hesapBul(id: number) {
  const [u] = await vt().select().from(k).where(eq(k.id, Number(id)));
  if (!u) throw new KullaniciHatasi('Hesap bulunamadı. Listeyi yenileyin.');
  return u;
}

/** Son etkin yönetici kapatılamaz, silinemez, yetkisi düşürülemez; kişi kendi hesabını kapatamaz. */
async function yoneticiKorumasi(ben: Oturum, u: typeof k.$inferSelect) {
  if (u.id === ben.id) throw new KullaniciHatasi('Kendi hesabınız üzerinde bu işlem yapılamaz.');
  if (u.tur === 'admin' && u.durum === 'aktif') {
    const [{ n }] = await vt().select({ n: sql<number>`count(*)::int` }).from(k).where(and(eq(k.tur, 'admin'), eq(k.durum, 'aktif'), ne(k.id, u.id)));
    if (!n) throw new KullaniciHatasi('Sistemde en az bir etkin yönetici kalmalı.');
  }
}

export async function hesapListesi() {
  const ben = await yonetici();
  const db = vt();
  const [hesaplar, program, ogr] = await Promise.all([
    db.select().from(k).orderBy(asc(k.tur), asc(k.adSoyad)),
    db.select({ hoca: schema.hocaProgrami.hoca }).from(schema.hocaProgrami),
    db.select({ n: sql<number>`count(*)::int`, tc: sql<number>`count(*) filter (where ${schema.ogrenciler.tc6} <> '')::int` })
      .from(schema.ogrenciler).where(eq(schema.ogrenciler.durum, 'aktif'))
  ]);
  return {
    benId: ben.id,
    hocaAdlari: benzersiz(program.map(p => p.hoca)).sort((a, b) => a.localeCompare(b, 'tr')),
    ogrenci: { aktif: ogr[0].n, tcVar: ogr[0].tc },
    hesaplar: hesaplar.map(u => ({
      id: u.id, tur: u.tur, adSoyad: u.adSoyad, eposta: u.eposta ?? '', ogrenciNo: u.ogrenciNo ?? '', hocaAdi: u.hocaAdi, durum: u.durum as HesapDurumu,
      sifreDegistirmeli: u.sifreDegistirmeli, olusturma: tarihSaat(u.olusturma), sonGiris: tarihSaat(u.sonGiris)
    }))
  };
}
export type HesapListesi = Awaited<ReturnType<typeof hesapListesi>>;

/** Bekleyen hoca hesabını onaylar; hocanın ders programındaki adı seçilmelidir. */
export async function hocaOnayla(id: number, hocaAdiHam: string) {
  await yonetici();
  const u = await hesapBul(id);
  if (u.tur !== 'hoca') throw new KullaniciHatasi('Yalnızca öğretim elemanı hesapları onaylanır.');
  const hocaAdi = String(hocaAdiHam ?? '').trim();
  if (!hocaAdi) throw new KullaniciHatasi('Hocanın ders programındaki adını seçin; sirküler ve yoklamalar bu adla eşleşir.');
  await vt().update(k).set({ durum: 'aktif', hocaAdi }).where(eq(k.id, u.id));
  await islemKaydet('Hesap onayı', `${u.adSoyad} (${u.eposta}) → ${hocaAdi}`);
  return true;
}

/** Yönetici ya da hoca hesabı ekler; geçici şifre bir kez gösterilir, ilk girişte değiştirilir. */
export async function hesapEkle(v: { tur: 'admin' | 'hoca'; adSoyad: string; eposta: string; hocaAdi?: string }) {
  await yonetici();
  const tur = v.tur === 'admin' ? 'admin' : 'hoca';
  const adSoyad = adSoyadNorm(v.adSoyad), eposta = epostaNorm(v.eposta), hocaAdi = String(v.hocaAdi ?? '').trim();
  if (tur === 'hoca' && !hocaAdi) throw new KullaniciHatasi('Hocanın ders programındaki adını seçin.');
  const [var_] = await vt().select({ id: k.id }).from(k).where(eq(k.eposta, eposta));
  if (var_) throw new KullaniciHatasi('Bu e-posta adresiyle zaten bir hesap var.');
  const sifre = yeniSifre();
  await vt().insert(k).values({ tur, eposta, adSoyad, hocaAdi: tur === 'hoca' ? hocaAdi : '', sifreOzeti: kodOzeti(sifre), durum: 'aktif', sifreDegistirmeli: true });
  await islemKaydet('Hesap ekleme', `${tur === 'admin' ? 'Yönetici' : 'Öğretim elemanı'} ${adSoyad} (${eposta})`);
  return { geciciSifre: sifre };
}

/** Ad, ders programı adı ve tür (yönetici ↔ hoca) düzenleme. */
export async function hesapGuncelle(id: number, v: { adSoyad?: string; hocaAdi?: string; tur?: 'admin' | 'hoca' }) {
  const ben = await yonetici();
  const u = await hesapBul(id);
  const set: Partial<typeof k.$inferInsert> = {};
  if (v.adSoyad != null) set.adSoyad = adSoyadNorm(v.adSoyad);
  if (v.hocaAdi != null) set.hocaAdi = String(v.hocaAdi).trim();
  if (v.tur && v.tur !== u.tur) {
    if (u.tur === 'ogrenci') throw new KullaniciHatasi('Öğrenci hesabının türü değiştirilemez.');
    if (u.tur === 'admin') await yoneticiKorumasi(ben, u);
    set.tur = v.tur;
    set.oturumSurumu = u.oturumSurumu + 1;   // yetkisi değişen kişi yeniden giriş yapar
  }
  if ((set.tur ?? u.tur) === 'hoca' && !(set.hocaAdi ?? u.hocaAdi) && u.durum === 'aktif') throw new KullaniciHatasi('Hocanın ders programındaki adını seçin.');
  if (Object.keys(set).length) await vt().update(k).set(set).where(eq(k.id, u.id));
  await islemKaydet('Hesap düzenleme', `${u.adSoyad || u.ogrenciNo}`);
  return true;
}

export async function hesapDurumu(id: number, durum: 'aktif' | 'pasif') {
  const ben = await yonetici();
  const u = await hesapBul(id);
  if (durum === 'pasif') await yoneticiKorumasi(ben, u);
  if (durum === 'aktif' && u.tur === 'hoca' && !u.hocaAdi) throw new KullaniciHatasi('Önce hocanın ders programındaki adını seçip onaylayın.');
  await vt().update(k).set({ durum, oturumSurumu: u.oturumSurumu + 1 }).where(eq(k.id, u.id));
  await islemKaydet(durum === 'pasif' ? 'Hesap kapatma' : 'Hesap açma', u.adSoyad || u.ogrenciNo || '');
  return true;
}

/** Geçici şifre verir; kişi ilk girişte kendi şifresini belirler. Açık oturumları kapanır. */
export async function sifreSifirla(id: number) {
  const ben = await yonetici();
  const u = await hesapBul(id);
  if (u.id === ben.id) throw new KullaniciHatasi('Kendi şifrenizi "Şifremi değiştir" bölümünden değiştirin.');
  const sifre = yeniSifre();
  await vt().update(k).set({ sifreOzeti: kodOzeti(sifre), sifreDegistirmeli: true, oturumSurumu: u.oturumSurumu + 1 }).where(eq(k.id, u.id));
  await islemKaydet('Şifre sıfırlama', `${u.adSoyad || u.ogrenciNo} için geçici şifre verildi (${kimAdi(ben)})`);
  return { geciciSifre: sifre };
}

/** Hesabı siler (reddedilen hoca kaydı; öğrenci hesabı silinirse öğrenci TC son 6 haneyle yeniden açabilir). */
export async function hesapSil(id: number) {
  const ben = await yonetici();
  const u = await hesapBul(id);
  await yoneticiKorumasi(ben, u);
  await vt().delete(k).where(eq(k.id, u.id));
  await islemKaydet('Hesap silme', `${u.adSoyad || ''} ${u.eposta || u.ogrenciNo || ''}`.trim());
  return true;
}
