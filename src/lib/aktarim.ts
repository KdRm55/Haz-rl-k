/** Öğrenci listesi yükleme — Apps Script Aktarim.gs aktarimOnizle / aktarimFark / aktarimUygula karşılığı. */
import 'server-only';
import { createHash } from 'node:crypto';
import { asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { vt, schema } from '@/db';
import {
  ALAN_ETIKET, baslikBul, degerEsit, dosyaKayitlari, eslenenAlanlar, eslesmeDogrula, eslesmeKaydi, ESLESME_ALANLARI, farkHesapla,
  LISTE_SINIRI, satirEslesmesi, satirlariTemizle, silmeEsigi, sutunHarfi, type KayitliEslesme, type MevcutKayit
} from './aktarim-kurallari';
import { KullaniciHatasi } from './hata';
import { islemKaydet, yetkiGerekli } from './oturum';
import { tcOzeti } from './tc-ozeti';

type Vt = ReturnType<typeof vt>;
type Islem = Parameters<Parameters<Vt['transaction']>[0]>[0];
const ESLESME_ANAHTARI = 'PROLIZ_ESLESME';   // son onaylanan sütun adları (ayarlar tablosunda, ekranda gösterilmez)

async function kayitliEslesme(db: Vt | Islem): Promise<KayitliEslesme | null> {
  const [r] = await db.select().from(schema.ayarlar).where(eq(schema.ayarlar.anahtar, ESLESME_ANAHTARI));
  try { return r ? JSON.parse(r.deger) : null; } catch { return null; }
}

export async function aktarimOnizle(satirlarHam: unknown, basSatirHam: unknown) {
  await yetkiGerekli(['admin']);
  const satirlar = satirlariTemizle(satirlarHam);
  if (!satirlar.length) throw new KullaniciHatasi('Dosyada veri bulunamadı.');
  const kayitli = await kayitliEslesme(vt());
  let bas: number, esl, otomatik: boolean;
  if (basSatirHam != null && basSatirHam !== '') {
    bas = Math.max(0, Math.min(parseInt(String(basSatirHam), 10) || 0, satirlar.length - 1));
    esl = satirEslesmesi(satirlar[bas], kayitli);
    otomatik = false;
  } else {
    const b = baslikBul(satirlar, kayitli);
    otomatik = b.basSatir > -1;
    bas = otomatik ? b.basSatir : 0;
    esl = b.eslesme ?? satirEslesmesi(satirlar[0], null);
  }
  const baslik = satirlar[bas] ?? [];
  const genislik = satirlar.slice(bas, bas + 50).reduce((m, r) => Math.max(m, r.length), 0);
  const sutunlar = Array.from({ length: genislik }, (_, i) => ({ i, ad: sutunHarfi(i) + ' — ' + (String(baslik[i] ?? '').trim() || '(başlıksız)') }));
  // Önizlemeye giden TC numaraları maskelenir
  const maske = (v: string) => (/^\d{11}$/.test(v.replace(/\s/g, '')) ? '*******' + v.replace(/\s/g, '').slice(-4) : v);
  const ornek = satirlar.slice(bas + 1).filter(r => r.some(v => v.trim())).slice(0, 3).map(r => r.map(maske));
  return {
    basSatir: bas, otomatikBulundu: otomatik, sutunlar, eslesme: esl, ornek, veriSatiri: satirlar.length - bas - 1,
    alanlar: ESLESME_ALANLARI.map(a => ({ alan: a, etiket: ALAN_ETIKET[a] }))
  };
}

export type AktarimVerisi = { satirlar: unknown; basSatir: unknown; eslesme: Record<string, unknown>; dosyaAdi?: string; imza?: string; silinenleriIsle?: boolean; silmeOnayi?: number };

/** Mevcut durum: öğrenci listesindeki kayıtlar (yalnızca sınıf listesinden gelenler "yeni" sayılır). */
async function mevcutDurum(db: Vt | Islem) {
  const tum = await db.select().from(schema.ogrenciler).orderBy(asc(schema.ogrenciler.no));
  const kayitli = tum.filter(o => o.kayitli);
  const imza = createHash('sha256').update(JSON.stringify(tum.map(o =>
    [o.no, o.kayitli, o.durum, o.tc4, o.tc6, o.adi, o.soyadi, o.cinsiyet, o.bolum, o.eposta, o.telefon]))).digest('base64url');
  return { tum, kayitli, imza };
}

async function hazirla(db: Vt | Islem, veri: AktarimVerisi) {
  const satirlar = satirlariTemizle(veri?.satirlar);
  if (!satirlar.length) throw new KullaniciHatasi('Dosyada veri bulunamadı.');
  const bas = Math.max(0, parseInt(String(veri.basSatir ?? ''), 10) || 0);
  const genislik = satirlar.reduce((m, r) => Math.max(m, r.length), 0);
  const esl = eslesmeDogrula(veri.eslesme, genislik);
  const dosya = dosyaKayitlari(satirlar, bas, esl);
  // TC son 6 hane veritabanındaki gibi özetlenir: karşılaştırma ve yazma özet üzerinden yapılır
  for (const d of Object.values(dosya.kayit)) d.tc6 = tcOzeti(d.tc6);
  if (!Object.keys(dosya.kayit).length) throw new KullaniciHatasi('Dosyada geçerli öğrenci kaydı bulunamadı. Sütun eşleştirmesini kontrol edin.');
  const m = await mevcutDurum(db);
  const alanlar = eslenenAlanlar(esl);
  const mevcut: MevcutKayit[] = m.kayitli.map(o => ({ ...o, durum: o.durum === 'silindi' ? 'silindi' : 'aktif' }));
  return {
    satirlar, bas, esl, dosya, alanlar, ...m,
    aktifSayi: m.kayitli.filter(o => o.durum !== 'silindi').length,
    fark: farkHesapla(mevcut, dosya.kayit, alanlar)
  };
}

/** 2. adım: seçilen eşleştirmeyle farkları hesaplar (hiçbir şey yazmaz). */
export async function aktarimFark(veri: AktarimVerisi) {
  await yetkiGerekli(['admin']);
  const h = await hazirla(vt(), veri);
  const k = <T,>(a: T[]) => a.slice(0, LISTE_SINIRI);
  return {
    imza: h.imza,
    dosyaKayit: Object.keys(h.dosya.kayit).length,
    aktifSayi: h.aktifSayi,
    esik: silmeEsigi(h.aktifSayi),
    ilkAktarim: h.kayitli.length === 0,
    sayilar: {
      yeni: h.fark.yeni.length, degisen: h.fark.degisen.length, silinen: h.fark.silinen.length,
      geriGelen: h.fark.geriGelen.length, ayni: h.fark.ayni, hata: h.dosya.hatalar.length, uyari: h.dosya.uyarilar.length
    },
    yeni: k(h.fark.yeni.map(d => ({ no: d.no, ad: (d.adi + ' ' + d.soyadi).trim(), bolum: d.bolum, cinsiyet: d.cinsiyet }))),
    degisen: k(h.fark.degisen), silinen: k(h.fark.silinen), geriGelen: k(h.fark.geriGelen),
    hatalar: k(h.dosya.hatalar), uyarilar: k(h.dosya.uyarilar),
    alanEtiket: ALAN_ETIKET, tcVar: h.esl.tc > -1
  };
}
export type AktarimFarki = Awaited<ReturnType<typeof aktarimFark>>;

/** 3. adım: onaylanan aktarımı tek veritabanı işleminde uygular. */
export async function aktarimUygula(veri: AktarimVerisi) {
  await yetkiGerekli(['admin']);
  const sonuc = await vt().transaction(async tx => {
    // Aynı anda iki aktarım çalışmasın
    await tx.execute(sql`select pg_advisory_xact_lock(7301)`);
    const h = await hazirla(tx, veri);
    if (h.imza !== veri.imza) throw new KullaniciHatasi('Farklar hesaplandıktan sonra öğrenci kayıtları değişti. Farkları yeniden hesaplayıp tekrar onaylayın.');
    const silinenleriIsle = !!veri.silinenleriIsle;
    const esik = silmeEsigi(h.aktifSayi);
    if (silinenleriIsle && h.fark.silinen.length > esik && Number(veri.silmeOnayi) !== h.fark.silinen.length) {
      throw new KullaniciHatasi(h.fark.silinen.length + ' öğrencinin kaydı silindi olarak işaretlenecek. Devam etmek için onay kutusunu işaretleyin.');
    }

    const [gecmis] = await tx.insert(schema.aktarimGecmisi).values({
      kullanici: '(erişim kodu ile)', dosya: String(veri.dosyaAdi ?? '').slice(0, 120), gecerli: Object.keys(h.dosya.kayit).length,
      yeni: h.fark.yeni.length, degisen: h.fark.degisen.length, silinen: silinenleriIsle ? h.fark.silinen.length : 0,
      geriGelen: h.fark.geriGelen.length, degismeyen: h.fark.ayni, hatali: h.dosya.hatalar.length
    }).returning({ id: schema.aktarimGecmisi.id });
    const kaynak = 'A-' + String(gecmis.id).padStart(4, '0');
    const simdi = new Date();
    const log: (typeof schema.ogrenciDegisiklikleri.$inferInsert)[] = [];
    // TC haneleri değişiklik geçmişine yazılmaz; yalnızca değiştiği kaydedilir
    const gizle = (alan: string, v: string) => (alan === 'tc4' || alan === 'tc6') && v ? '••••' : v;
    const logEkle = (no: string, ad: string, alan: string, eski: string, yeni: string) =>
      log.push({ tarih: simdi, kaynak, ogrenciNo: no, adSoyad: ad, alan: ALAN_ETIKET[alan] ?? alan, eski: gizle(alan, eski), yeni: gizle(alan, yeni) });
    const durumEtiket = { aktif: 'Aktif', silindi: 'Kaydı silindi' };

    const mevcutHarita = new Map(h.tum.map(o => [o.no, o]));
    const yeniKayitlar: (typeof schema.ogrenciler.$inferInsert)[] = [];
    for (const [no, d] of Object.entries(h.dosya.kayit)) {
      const x = mevcutHarita.get(no);
      const ad = (d.adi + ' ' + d.soyadi).trim();
      if (!x) {
        yeniKayitlar.push({ no, tc4: d.tc4, tc6: d.tc6, adi: d.adi, soyadi: d.soyadi, cinsiyet: d.cinsiyet, bolum: d.bolum, eposta: d.eposta, telefon: d.telefon,
          durum: 'aktif', kayitli: true, ilkGorulme: simdi, sonGorulme: simdi, guncellendi: simdi });
        logEkle(no, ad, 'durum', '', 'Yeni kayıt');
        continue;
      }
      const set: Partial<typeof schema.ogrenciler.$inferInsert> = {};
      if (!x.kayitli) {
        // Yalnızca sınıf listesinde olan öğrenci: öğrenci listesine katılır, sınıfı korunur
        Object.assign(set, { kayitli: true, tc4: d.tc4 || x.tc4, tc6: d.tc6 || x.tc6, adi: d.adi, soyadi: d.soyadi, cinsiyet: d.cinsiyet || x.cinsiyet, bolum: d.bolum, eposta: d.eposta, telefon: d.telefon, durum: 'aktif' });
        logEkle(no, ad, 'durum', '', 'Yeni kayıt (sınıf listesinde vardı)');
      } else {
        for (const a of h.alanlar) {
          if (d[a] === '' || degerEsit(a, x[a], d[a])) continue;
          logEkle(no, ad, a, x[a], d[a]);
          set[a] = d[a];
        }
        if (x.durum === 'silindi') { logEkle(no, ad, 'durum', durumEtiket.silindi, durumEtiket.aktif); set.durum = 'aktif'; }
      }
      if (Object.keys(set).length) await tx.update(schema.ogrenciler).set({ ...set, guncellendi: simdi }).where(eq(schema.ogrenciler.no, no));
    }
    if (silinenleriIsle && h.fark.silinen.length) {
      h.fark.silinen.forEach(s => logEkle(s.no, s.ad, 'durum', durumEtiket.aktif, durumEtiket.silindi));
      await tx.update(schema.ogrenciler).set({ durum: 'silindi', guncellendi: simdi }).where(inArray(schema.ogrenciler.no, h.fark.silinen.map(s => s.no)));
    }
    const parcala = <T,>(d: T[], n = 500) => Array.from({ length: Math.ceil(d.length / n) }, (_, i) => d.slice(i * n, i * n + n));
    for (const p of parcala(yeniKayitlar)) await tx.insert(schema.ogrenciler).values(p);
    for (const p of parcala(Object.keys(h.dosya.kayit))) await tx.update(schema.ogrenciler).set({ sonGorulme: simdi }).where(inArray(schema.ogrenciler.no, p));
    for (const p of parcala(log)) await tx.insert(schema.ogrenciDegisiklikleri).values(p);

    const esl = JSON.stringify(eslesmeKaydi(h.satirlar[h.bas] ?? [], h.esl));
    await tx.insert(schema.ayarlar).values({ anahtar: ESLESME_ANAHTARI, deger: esl, aciklama: 'Son öğrenci listesi yüklemesindeki sütun adları (otomatik)' })
      .onConflictDoUpdate({ target: schema.ayarlar.anahtar, set: { deger: esl } });
    return {
      aktarimNo: kaynak, yeni: h.fark.yeni.length, degisen: h.fark.degisen.length,
      silinen: silinenleriIsle ? h.fark.silinen.length : 0, silinenAtlanan: silinenleriIsle ? 0 : h.fark.silinen.length,
      geriGelen: h.fark.geriGelen.length, ayni: h.fark.ayni, degisiklikKaydi: log.length
    };
  });
  await islemKaydet('Liste yükleme', `${sonuc.aktarimNo}: ${sonuc.yeni} yeni, ${sonuc.degisen} değişen, ${sonuc.silinen} kaydı silinen`);
  return sonuc;
}

export async function aktarimGecmisi() {
  await yetkiGerekli(['admin']);
  const l = await vt().select().from(schema.aktarimGecmisi).orderBy(desc(schema.aktarimGecmisi.id)).limit(10);
  return l.map(r => ({ ...r, no: 'A-' + String(r.id).padStart(4, '0'), tarih: r.tarih.toISOString() }));
}
