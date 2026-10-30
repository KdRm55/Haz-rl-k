/**
 * Yönetim paneli sunucu işlemleri: duyurular, öğrenci ekranı görünürlüğü, öğrenciler, sınıflar,
 * ders programı, ayarlar ve işlem kaydı. E-tabloda elle yapılan düzenlemelerin yerini alır.
 */
import 'server-only';
import { asc, count, desc, eq, inArray, isNotNull, ne } from 'drizzle-orm';
import { vt, schema } from '@/db';
import { ayarYaz } from './ayar';
import { AYAR_TANIMLARI, GIZLI_AYAR, OG_BOLUM_TANIMLARI } from './ayar-tanimlari';
import { KullaniciHatasi } from './hata';
import { KOD_EN_AZ, kodDogru, kodOzeti } from './kod';
import { basNorm, cinsiyetKod, hazirlikMi, sinifAnahtari, sinifTuru, TR_GUN_SIRA } from './metin';
import { ayarlarOku, ogrenciAra } from './ogrenci';
import { duyuruGecerli, gorunum, HEDEF } from './ogrenci-kurallari';
import { tcSon6 } from './hesap-kurallari';
import { tcOzeti } from './tc-ozeti';
import { islemKaydet, yetkiGerekli } from './oturum';
import { taslaktaSabitle } from './siniflandirma';

const TZ = 'Europe/Istanbul';
const bugunISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const tarihSaat = (d: Date) => new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' }).format(d);
const isoTR = (iso: string | null) => (iso ? iso.split('-').reverse().join('.') : '');
const yonetici = () => yetkiGerekli(['admin']);

/* =================== DUYURULAR =================== */
async function aktifSinifAdlari() {
  return (await vt().select({ ad: schema.siniflar.ad }).from(schema.siniflar).where(eq(schema.siniflar.aktif, true)).orderBy(asc(schema.siniflar.anahtar))).map(s => s.ad);
}

export async function duyuruDurumu() {
  await yonetici();
  const bugun = bugunISO();
  const [hedefler, liste] = await Promise.all([
    aktifSinifAdlari().then(s => [HEDEF.HERKES, HEDEF.HAZIRLIK, HEDEF.MUAF, HEDEF.BELIRSIZ, ...s]),
    vt().select().from(schema.duyurular).orderBy(desc(schema.duyurular.olusturma), desc(schema.duyurular.id))
  ]);
  return {
    hedefler,
    duyurular: liste.map(d => ({
      id: d.id, baslik: d.baslik, metin: d.metin, kime: d.kime, aktif: d.aktif,
      baslangic: isoTR(d.baslangic), bitis: isoTR(d.bitis), olusturma: tarihSaat(d.olusturma),
      durum: !d.aktif ? 'Kapalı' : d.baslangic && bugun < d.baslangic ? 'Başlangıcı bekleniyor' : d.bitis && bugun > d.bitis ? 'Süresi doldu' : duyuruGecerli(d, bugun) ? 'Yayında' : 'Kapalı'
    }))
  };
}
export type DuyuruDurumu = Awaited<ReturnType<typeof duyuruDurumu>>;

export async function duyuruEkle(v: { baslik?: string; metin?: string; kime?: string; baslangic?: string; bitis?: string }) {
  await yonetici();
  const baslik = String(v?.baslik ?? '').trim(), metin = String(v?.metin ?? '').trim(), kime = String(v?.kime ?? '').trim();
  const iso = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  const bas = iso(v?.baslangic), bit = iso(v?.bitis);
  if (!baslik) throw new KullaniciHatasi('Başlık yazın.');
  if (baslik.length > 120) throw new KullaniciHatasi('Başlık en fazla 120 karakter olabilir.');
  if (metin.length > 2000) throw new KullaniciHatasi('Metin en fazla 2000 karakter olabilir.');
  const hedefler = [HEDEF.HERKES, HEDEF.HAZIRLIK, HEDEF.MUAF, HEDEF.BELIRSIZ, ...(await aktifSinifAdlari())];
  if (!hedefler.includes(kime)) throw new KullaniciHatasi('Duyurunun kime gösterileceğini seçin.');
  if (v?.baslangic && !bas) throw new KullaniciHatasi('Başlangıç tarihi anlaşılamadı.');
  if (v?.bitis && !bit) throw new KullaniciHatasi('Bitiş tarihi anlaşılamadı.');
  if (bas && bit && bit < bas) throw new KullaniciHatasi('Bitiş tarihi başlangıçtan önce olamaz.');
  await vt().insert(schema.duyurular).values({ baslik, metin, kime, baslangic: bas, bitis: bit, aktif: true });
  await islemKaydet('Duyuru', `"${baslik}" eklendi (${kime})`);
  return duyuruDurumu();
}

async function duyuruBul(id: number) {
  const [d] = await vt().select().from(schema.duyurular).where(eq(schema.duyurular.id, Number(id)));
  if (!d) throw new KullaniciHatasi('Duyuru bulunamadı. Listeyi yenileyin.');
  return d;
}
export async function duyuruAktiflik(id: number, aktif: boolean) {
  await yonetici();
  const d = await duyuruBul(id);
  await vt().update(schema.duyurular).set({ aktif: !!aktif }).where(eq(schema.duyurular.id, d.id));
  await islemKaydet('Duyuru', `"${d.baslik}" ${aktif ? 'yayına alındı' : 'yayından kaldırıldı'}`);
  return duyuruDurumu();
}
export async function duyuruSil(id: number) {
  await yonetici();
  const d = await duyuruBul(id);
  await vt().delete(schema.duyurular).where(eq(schema.duyurular.id, d.id));
  await islemKaydet('Duyuru', `"${d.baslik}" silindi`);
  return duyuruDurumu();
}

/* =================== ÖĞRENCİ EKRANI GÖRÜNÜRLÜĞÜ =================== */
export async function gorunumDurumu() {
  await yonetici();
  const a = await ayarlarOku();
  const g = gorunum(a);
  return {
    bolumler: OG_BOLUM_TANIMLARI.map(b => ({ ad: b.ad, baslik: b.baslik, aciklama: b.aciklama, acik: g[b.ad] })),
    muafiyet: basNorm(a.SINAV_SONUCLARI_YAYINDA) === 'EVET'
  };
}
export type GorunumDurumu = Awaited<ReturnType<typeof gorunumDurumu>>;

export async function gorunumKaydet(ad: string, acik: boolean) {
  await yonetici();
  if (ad === '__muafiyet') {
    await ayarYaz('SINAV_SONUCLARI_YAYINDA', acik ? 'Evet' : 'Hayır');
    await islemKaydet('Sınav sonuçları', acik ? 'Öğrencilere açıldı' : 'Öğrencilerden gizlendi');
    return gorunumDurumu();
  }
  const b = OG_BOLUM_TANIMLARI.find(x => x.ad === ad);
  if (!b) throw new KullaniciHatasi('Bilinmeyen bölüm: ' + ad);
  await ayarYaz(b.anahtar, acik ? 'Evet' : 'Hayır');
  await islemKaydet('Öğrenci ekranı', b.baslik + (acik ? ' öğrencilere açıldı' : ' öğrencilere kapatıldı'));
  return gorunumDurumu();
}

/** Yönetici önizlemesi: bir öğrencinin bu ayarlarla ne gördüğü (doğrulama sorulmaz). */
export async function gorunumOnizle(numara: string) {
  await yonetici();
  return ogrenciAra(String(numara ?? ''), '', true, true);
}

/* =================== ÖĞRENCİLER =================== */
export async function ogrenciListesi() {
  await yonetici();
  const db = vt();
  const [ogr, siniflar] = await Promise.all([
    db.select().from(schema.ogrenciler).orderBy(asc(schema.ogrenciler.no)),
    db.select().from(schema.siniflar).orderBy(asc(schema.siniflar.anahtar))
  ]);
  const sinifAd = new Map(siniflar.map(s => [s.id, s]));
  return {
    siniflar: siniflar.map(s => ({ id: s.id, ad: s.ad, aktif: s.aktif, tur: s.tur })),
    ogrenciler: ogr.map(o => ({
      no: o.no, adi: o.adi, soyadi: o.soyadi, cinsiyet: o.cinsiyet, bolum: o.bolum, durum: o.durum, kayitli: o.kayitli, not: o.not,
      tc4Var: !!o.tc4, sinifId: o.sinifId, sinifSira: o.sinifSira, sinif: o.sinifId ? sinifAd.get(o.sinifId)?.ad ?? '' : ''
    }))
  };
}
export type OgrenciListesi = Awaited<ReturnType<typeof ogrenciListesi>>;

/** Eski "Öğrenci listesi" dışa aktarma biçimi: OGR_NO, ADI_SOYADI, CINSIYET, SUBE, SINIF (aktif sınıflar, sınıf sırasıyla). */
export async function disaAktarimListesi() {
  await yonetici();
  const db = vt();
  const [siniflar, ogr] = await Promise.all([
    db.select().from(schema.siniflar).where(eq(schema.siniflar.aktif, true)).orderBy(asc(schema.siniflar.anahtar)),
    db.select().from(schema.ogrenciler).where(isNotNull(schema.ogrenciler.sinifId)).orderBy(asc(schema.ogrenciler.sinifSira), asc(schema.ogrenciler.no))
  ]);
  const liste = siniflar.flatMap(s => {
    const sube = s.ad.split(' ').pop() + ' ŞUBESİ';
    return ogr.filter(o => o.sinifId === s.id && /^\d+$/.test(o.no)).map(o => ({
      ogrNo: o.no, adSoyad: (o.adi + ' ' + o.soyadi).trim().toLocaleUpperCase('tr-TR'),
      cinsiyet: cinsiyetKod(o.cinsiyet) || (s.tur === 'K' || s.tur === 'E' ? s.tur : ''), sube, sinif: 'HAZIRLIK'
    }));
  });
  await islemKaydet('Öğrenci listesi', liste.length + ' kayıt görüntülendi');
  return liste;
}

/** Panelden tek öğrencinin sınıfı, durumu, cinsiyeti ya da notu değiştirilir; her değişiklik iz bırakır. */
export async function ogrenciGuncelle(no: string, v: { adi?: string; soyadi?: string; sinifId?: number | null; durum?: string; cinsiyet?: string; not?: string }) {
  await yonetici();
  const db = vt();
  const [o] = await db.select().from(schema.ogrenciler).where(eq(schema.ogrenciler.no, String(no)));
  if (!o) throw new KullaniciHatasi('Öğrenci bulunamadı. Listeyi yenileyin.');
  const siniflar = await db.select().from(schema.siniflar);
  const adi = (id: number | null) => (id ? siniflar.find(s => s.id === id)?.ad ?? '' : '');
  const set: Partial<typeof schema.ogrenciler.$inferInsert> = {};
  const log: [string, string, string][] = [];
  const isim = (x: unknown, et: string) => {
    const t = String(x ?? '').trim().replace(/\s+/g, ' ').slice(0, 100);
    if (!t) throw new KullaniciHatasi(et + ' boş bırakılamaz.');
    return t;
  };
  if (v.adi !== undefined && isim(v.adi, 'Adı') !== o.adi) { set.adi = isim(v.adi, 'Adı'); log.push(['Adı', o.adi, set.adi]); }
  if (v.soyadi !== undefined && isim(v.soyadi, 'Soyadı') !== o.soyadi) { set.soyadi = isim(v.soyadi, 'Soyadı'); log.push(['Soyadı', o.soyadi, set.soyadi]); }
  if (v.sinifId !== undefined && (v.sinifId ?? null) !== o.sinifId) {
    const yeni = v.sinifId == null ? null : siniflar.find(s => s.id === Number(v.sinifId));
    if (v.sinifId != null && !yeni) throw new KullaniciHatasi('Sınıf bulunamadı.');
    set.sinifId = yeni?.id ?? null;
    if (yeni) {
      const [{ n }] = await db.select({ n: count() }).from(schema.ogrenciler).where(eq(schema.ogrenciler.sinifId, yeni.id));
      set.sinifSira = n + 1;   // sınıf listesinin sonuna eklenir
    } else set.sinifSira = null;
    log.push(['Sınıf', adi(o.sinifId), yeni?.ad ?? '']);
  }
  if (v.durum !== undefined && v.durum !== o.durum) {
    if (v.durum !== 'aktif' && v.durum !== 'silindi') throw new KullaniciHatasi('Geçersiz durum.');
    set.durum = v.durum;
    log.push(['Kayıt durumu', o.durum === 'aktif' ? 'Aktif' : 'Kaydı silindi', v.durum === 'aktif' ? 'Aktif' : 'Kaydı silindi']);
  }
  if (v.cinsiyet !== undefined && cinsiyetKod(v.cinsiyet) !== o.cinsiyet) {
    set.cinsiyet = cinsiyetKod(v.cinsiyet);
    log.push(['Cinsiyet', o.cinsiyet, set.cinsiyet]);
  }
  if (v.not !== undefined && String(v.not).trim().slice(0, 500) !== o.not) {
    set.not = String(v.not).trim().slice(0, 500);
    log.push(['Not', o.not, set.not]);
  }
  if (!log.length) return { degisti: false };
  const ad = (o.adi + ' ' + o.soyadi).trim();
  await db.transaction(async tx => {
    await tx.update(schema.ogrenciler).set({ ...set, guncellendi: new Date() }).where(eq(schema.ogrenciler.no, o.no));
    // Sınıfı elle değişen öğrenci taslakta da sabitlenir; sonraki "Yeniden dağıt" yerini bozmaz
    if (set.sinifId !== undefined) await taslaktaSabitle(tx, o.no, siniflar.find(s => s.id === set.sinifId)?.ad ?? '');
    // Öğrencinin hesabı varsa hesaptaki ad da güncellenir (Kullanıcılar sekmesi, işlem kaydı)
    if (set.adi !== undefined || set.soyadi !== undefined) {
      await tx.update(schema.kullanicilar).set({ adSoyad: ((set.adi ?? o.adi) + ' ' + (set.soyadi ?? o.soyadi)).trim() }).where(eq(schema.kullanicilar.ogrenciNo, o.no));
    }
    await tx.insert(schema.ogrenciDegisiklikleri).values(log.map(([alan, eski, yeni]) => ({ kaynak: 'Elle', ogrenciNo: o.no, adSoyad: ad, alan, eski, yeni })));
  });
  await islemKaydet('Öğrenci düzenleme', `${o.no} ${ad}: ${log.map(l => l[0]).join(', ')}`);
  return { degisti: true };
}

export type OgrenciEklemeGirdisi = { no: string; adi: string; soyadi: string; cinsiyet?: string; tc?: string; bolum?: string; sinifId?: number | null; not?: string };

/**
 * Panelden tek öğrenci ekler (liste yüklemeden). TC kimlik numarasının tamamı saklanmaz: son 6 hanesi (hesap açma) ve son 4 hanesi.
 * Öğrenci, öğrenci listesinin bir parçası sayılır; sonraki liste yüklemesinde dosyada yoksa "listeden çıkan" olarak raporlanır.
 */
export async function ogrenciEkle(v: OgrenciEklemeGirdisi) {
  await yonetici();
  const no = String(v?.no ?? '').replace(/\s+/g, '');
  const adi = String(v?.adi ?? '').trim().replace(/\s+/g, ' ').slice(0, 100);
  const soyadi = String(v?.soyadi ?? '').trim().replace(/\s+/g, ' ').slice(0, 100);
  if (!/^\d{3,20}$/.test(no)) throw new KullaniciHatasi('Öğrenci numarası yalnızca rakamlardan oluşmalı.');
  if (!adi || !soyadi) throw new KullaniciHatasi('Adı ve soyadı yazın.');
  const tcHam = String(v?.tc ?? '').replace(/\D/g, '');
  if (tcHam && tcHam.length < 6) throw new KullaniciHatasi('TC kimlik numarasını ya da en az son 6 hanesini yazın (boş bırakılabilir).');
  const tc6 = tcSon6(tcHam);
  const cinsiyet = cinsiyetKod(v?.cinsiyet);
  const db = vt();
  const [var_] = await db.select().from(schema.ogrenciler).where(eq(schema.ogrenciler.no, no));
  if (var_) {
    throw new KullaniciHatasi(var_.durum === 'silindi'
      ? `${no} numaralı öğrenci zaten kayıtlı (${var_.adi} ${var_.soyadi}), kaydı silinmiş. "Kaydı silinenler" filtresinden bulup durumunu "Aktif" yapın.`
      : `${no} numaralı öğrenci zaten kayıtlı: ${var_.adi} ${var_.soyadi}.`);
  }
  const siniflar = await db.select().from(schema.siniflar);
  const sinif = v?.sinifId != null ? siniflar.find(s => s.id === Number(v.sinifId)) : undefined;
  if (v?.sinifId != null && !sinif) throw new KullaniciHatasi('Sınıf bulunamadı. Listeyi yenileyin.');
  const simdi = new Date(), ad = adi + ' ' + soyadi;
  await db.transaction(async tx => {
    let sinifSira: number | null = null;
    if (sinif) {
      const [{ n }] = await tx.select({ n: count() }).from(schema.ogrenciler).where(eq(schema.ogrenciler.sinifId, sinif.id));
      sinifSira = n + 1;   // sınıf listesinin sonuna eklenir
    }
    await tx.insert(schema.ogrenciler).values({
      no, adi, soyadi, cinsiyet, tc6: tcOzeti(tc6), tc4: tc6.slice(-4), bolum: String(v?.bolum ?? '').trim().slice(0, 150), not: String(v?.not ?? '').trim().slice(0, 500),
      durum: 'aktif', kayitli: true, sinifId: sinif?.id ?? null, sinifSira, ilkGorulme: simdi, guncellendi: simdi
    });
    // Sınıfı elle verilen öğrenci taslakta da sabitlenir; sonraki "Yeniden dağıt" yerini bozmaz
    if (sinif) await taslaktaSabitle(tx, no, sinif.ad);
    await tx.insert(schema.ogrenciDegisiklikleri).values([
      { kaynak: 'Elle', ogrenciNo: no, adSoyad: ad, alan: 'Kayıt durumu', eski: '', yeni: 'Yeni kayıt (panelden eklendi)' },
      ...(sinif ? [{ kaynak: 'Elle', ogrenciNo: no, adSoyad: ad, alan: 'Sınıf', eski: '', yeni: sinif.ad }] : [])
    ]);
  });
  await islemKaydet('Öğrenci ekleme', `${no} ${ad}${sinif ? ' → ' + sinif.ad : ''}${tc6 ? '' : ' (TC yok)'}`);
  return { no, ad, sinif: sinif?.ad ?? '', tcVar: !!tc6 };
}

export async function ogrenciGecmisi(no: string) {
  await yonetici();
  const l = await vt().select().from(schema.ogrenciDegisiklikleri).where(eq(schema.ogrenciDegisiklikleri.ogrenciNo, String(no)))
    .orderBy(desc(schema.ogrenciDegisiklikleri.id)).limit(100);
  return l.map(r => ({ tarih: tarihSaat(r.tarih), kaynak: r.kaynak, alan: r.alan, eski: r.eski, yeni: r.yeni }));
}

/* =================== SINIFLAR =================== */
export async function sinifListesi() {
  await yonetici();
  const db = vt();
  const [siniflar, sayilar] = await Promise.all([
    db.select().from(schema.siniflar).orderBy(asc(schema.siniflar.anahtar)),
    db.select({ sinifId: schema.ogrenciler.sinifId, n: count() }).from(schema.ogrenciler).where(isNotNull(schema.ogrenciler.sinifId)).groupBy(schema.ogrenciler.sinifId)
  ]);
  return siniflar.map(s => ({ ...s, ogrenci: sayilar.find(x => x.sinifId === s.id)?.n ?? 0 }));
}
export type SinifSatiri = Awaited<ReturnType<typeof sinifListesi>>[number];

export async function sinifKaydet(v: { id?: number | null; ad: string; derslik: string; tur: string; kapasite: number | string; aktif: boolean }) {
  await yonetici();
  const ad = String(v?.ad ?? '').trim().replace(/\s+/g, ' ');
  if (!hazirlikMi(ad)) throw new KullaniciHatasi('Sınıf adı "Hazırlık A" biçiminde olmalı ("Hazırlık" ve ardından şube adı).');
  const kap = parseInt(String(v.kapasite ?? ''), 10);
  const deger = { ad, anahtar: sinifAnahtari(ad), derslik: String(v.derslik ?? '').trim(), tur: sinifTuru(v.tur), kapasite: isNaN(kap) || kap < 0 ? 0 : kap, aktif: !!v.aktif };
  const db = vt();
  const ayni = await db.select().from(schema.siniflar).where(eq(schema.siniflar.anahtar, deger.anahtar));
  if (ayni.some(s => s.id !== v.id)) throw new KullaniciHatasi(`"${ad}" adında bir sınıf zaten var.`);
  if (v.id) {
    await db.update(schema.siniflar).set(deger).where(eq(schema.siniflar.id, Number(v.id)));
    await islemKaydet('Sınıf', `${ad} güncellendi`);
  } else {
    await db.insert(schema.siniflar).values(deger);
    await islemKaydet('Sınıf', `${ad} eklendi`);
  }
  return sinifListesi();
}

export async function sinifSil(id: number) {
  await yonetici();
  const db = vt();
  const [s] = await db.select().from(schema.siniflar).where(eq(schema.siniflar.id, Number(id)));
  if (!s) throw new KullaniciHatasi('Sınıf bulunamadı.');
  const [{ n }] = await db.select({ n: count() }).from(schema.ogrenciler).where(eq(schema.ogrenciler.sinifId, s.id));
  if (n) throw new KullaniciHatasi(`${s.ad} sınıfında ${n} öğrenci var. Önce öğrencileri başka sınıfa taşıyın ya da sınıfı "Aktif değil" yapın.`);
  await db.delete(schema.siniflar).where(eq(schema.siniflar.id, s.id));
  await islemKaydet('Sınıf', `${s.ad} silindi`);
  return sinifListesi();
}

/* =================== DERS PROGRAMI =================== */
export type ProgramGirdisi = { hoca: string; ders: string; gun: string; saat: string; sube: string; derslik: string };

export async function programListesi() {
  await yonetici();
  const [p, siniflar] = await Promise.all([
    vt().select().from(schema.hocaProgrami).orderBy(asc(schema.hocaProgrami.sira), asc(schema.hocaProgrami.id)),
    aktifSinifAdlari()
  ]);
  return { satirlar: p.map(({ hoca, ders, gun, saat, sube, derslik }) => ({ hoca, ders, gun, saat, sube, derslik })), siniflar };
}

/** Programın tamamı tek işlemde değiştirilir (tablo düzenleme ve Excel'den yükleme ortak). */
export async function programKaydet(satirlarHam: ProgramGirdisi[]) {
  await yonetici();
  if (!Array.isArray(satirlarHam) || satirlarHam.length > 5000) throw new KullaniciHatasi('Program okunamadı.');
  const t = (s: unknown) => String(s ?? '').trim().replace(/\s+/g, ' ').slice(0, 200);
  const satirlar = satirlarHam.map(r => ({ hoca: t(r.hoca), ders: t(r.ders), gun: t(r.gun), saat: t(r.saat), sube: t(r.sube), derslik: t(r.derslik) }))
    .filter(r => r.hoca || r.ders || r.saat);
  const eksik = satirlar.findIndex(r => !r.hoca || !r.gun || !r.saat || !r.sube);
  if (eksik > -1) throw new KullaniciHatasi(`${eksik + 1}. satırda öğretim elemanı, gün, saat ve şube zorunlu.`);
  const gunHata = satirlar.findIndex(r => TR_GUN_SIRA[basNorm(r.gun)] == null);
  if (gunHata > -1) throw new KullaniciHatasi(`${gunHata + 1}. satırdaki gün ("${satirlar[gunHata].gun}") tanınmadı. Pazartesi…Pazar yazın.`);
  await vt().transaction(async tx => {
    await tx.delete(schema.hocaProgrami);
    if (satirlar.length) await tx.insert(schema.hocaProgrami).values(satirlar.map((r, i) => ({ ...r, sira: i + 1 })));
  });
  await islemKaydet('Ders programı', satirlar.length + ' satır kaydedildi');
  return programListesi();
}

/* =================== AYARLAR, ERİŞİM KODLARI, İŞLEM KAYDI =================== */
export async function ayarListesi() {
  await yonetici();
  const db = vt();
  const kayitlar = await db.select().from(schema.ayarlar);
  const harita = new Map(kayitlar.map(k => [k.anahtar.toUpperCase(), k]));
  const bilinen = AYAR_TANIMLARI.map(t => ({ ...t, deger: harita.get(t.anahtar)?.deger ?? t.varsayilan, kayitli: harita.has(t.anahtar) }));
  const diger = kayitlar.filter(k => !GIZLI_AYAR(k.anahtar) && !AYAR_TANIMLARI.some(t => t.anahtar === k.anahtar.toUpperCase()))
    .map(k => ({ anahtar: k.anahtar, deger: k.deger, aciklama: k.aciklama }));
  return { bilinen, diger };
}
export type AyarListesi = Awaited<ReturnType<typeof ayarListesi>>;

export async function ayarlarKaydet(degerler: Record<string, string>) {
  await yonetici();
  const once = await ayarlarOku();
  const degisen: string[] = [];
  for (const [anahtar, hamDeger] of Object.entries(degerler ?? {})) {
    const t = AYAR_TANIMLARI.find(x => x.anahtar === anahtar);
    if (!t) continue;
    const deger = String(hamDeger ?? '').trim().slice(0, 500);
    if (t.tur === 'sayi' && deger !== '' && (isNaN(Number(deger.replace(',', '.'))) || Number(deger.replace(',', '.')) < 0 || Number(deger.replace(',', '.')) > 100)) {
      throw new KullaniciHatasi(`${anahtar} 0 ile 100 arasında bir sayı olmalı.`);
    }
    if (t.tur === 'secim' && !t.secenekler!.includes(deger)) throw new KullaniciHatasi(`${anahtar} için geçerli bir seçenek seçin.`);
    if (t.tur === 'evet-hayir' && deger !== 'Evet' && deger !== 'Hayır') throw new KullaniciHatasi(`${anahtar} Evet ya da Hayır olmalı.`);
    if ((once[anahtar] ?? t.varsayilan) === deger) continue;
    await ayarYaz(anahtar, deger);
    degisen.push(anahtar);
  }
  if (degisen.length) await islemKaydet('Ayarlar', degisen.join(', ') + ' değiştirildi');
  return ayarListesi();
}

export async function islemKaydiListesi() {
  await yonetici();
  const l = await vt().select().from(schema.islemKaydi).orderBy(desc(schema.islemKaydi.id)).limit(200);
  return l.map(r => ({ zaman: tarihSaat(r.zaman), kullanici: r.kullanici, islem: r.islem, ayrinti: r.ayrinti }));
}

/** Panel başlığındaki sayaç: aktif sınıflardaki öğrenci sayısı. */
export async function panelOzeti() {
  await yonetici();
  const db = vt();
  const aktif = await db.select({ id: schema.siniflar.id }).from(schema.siniflar).where(eq(schema.siniflar.aktif, true));
  if (!aktif.length) return { ogrenci: 0, sinif: 0 };
  const [{ n }] = await db.select({ n: count() }).from(schema.ogrenciler).where(inArray(schema.ogrenciler.sinifId, aktif.map(s => s.id)));
  return { ogrenci: n, sinif: aktif.length };
}
