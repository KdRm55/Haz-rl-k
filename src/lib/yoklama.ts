/** Yoklama, evrak (QR) ve tarama — Apps Script Yoklama.gs ve YoklamaTarama.gs karşılığı. */
import 'server-only';
import { randomInt } from 'node:crypto';
import { and, asc, count, eq, gte, inArray, sql, sum, type SQL } from 'drizzle-orm';
import { vt, schema } from '@/db';
import { ayarYaz } from './ayar';
import { KullaniciHatasi } from './hata';
import { aktifSiniflar, program } from './hoca';
import { basNorm } from './metin';
import { ayarlarOku } from './ogrenci';
import { ogrenciAyarlari } from './ogrenci-kurallari';
import { hocaKapsami, islemKaydet, kimAdi, oturumGerekli, yetkiGerekli, type Oturum, type Rol } from './oturum';
import type { SinifOgrencili } from './sirku-kurallari';
import {
  devamsizlikHesapla, eksikOturumlar, evrakNoUret, gelmeyenSayisi, gunAdi, haftalikDersSaatleri, isoEkle, isoGecerli, isoTr, noListesi,
  ogrenciYoklamaDegistir, oturumAnahtari, ozet, pazartesi, programdaVar, programOturumlari, sinirHesapla, trIso, yokAyarCoz, yoklamaBirlestir,
  YOK_DURUM, YOK_TUR, type YokDurum, type YoklamaKaydi, type YokTur
} from './yoklama-kurallari';

type Vt = ReturnType<typeof vt>;
type Db = Vt | Parameters<Parameters<Vt['transaction']>[0]>[0];
const HOCA_ROLLERI: Rol[] = ['admin', 'hoca'];
const yonetici = () => yetkiGerekli(['admin']);
const TZ = 'Europe/Istanbul';
export const bugunIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const zamanYaz = (d: Date) => new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'medium' }).format(d);
const GORSEL_EN_COK = 3_500_000;   // base64 uzunluğu (sunucu işlemi gövde sınırı 4 MB)

function kayitCoz(r: typeof schema.yoklamalar.$inferSelect): YoklamaKaydi & { kaydeden: string; zaman: string; surum: number } {
  return {
    anahtar: r.anahtar, iso: r.tarih, saat: r.saat, ders: r.ders, sinif: r.sinif, hoca: r.hoca,
    tur: r.tur === YOK_TUR.TELAFI ? YOK_TUR.TELAFI : YOK_TUR.PROGRAM, durum: r.durum === YOK_DURUM.YAPILMADI ? YOK_DURUM.YAPILMADI : YOK_DURUM.YAPILDI,
    liste: r.liste, yok1: r.yok1, yok2: r.yok2, izinli: r.izinli, kaynak: r.kaynak, aciklama: r.aciklama,
    kaydeden: r.kaydeden, zaman: zamanYaz(r.zaman), surum: r.surum
  };
}
type Kayit = ReturnType<typeof kayitCoz>;

async function kayitlar(db: Db, where?: SQL) {
  return (await db.select().from(schema.yoklamalar).where(where)).map(kayitCoz);
}

/** Programdaki ve sınıflardaki adlar için kısa özet. */
const ozetler = (siniflar: SinifOgrencili[]) => siniflar.map(s => ({ ad: s.ad, anahtar: s.anahtar, derslik: s.derslik }));

function oturumOzeti<T extends object>(o: T, k: Kayit | undefined) {
  if (!k) return { ...o, kayitli: false as const };
  return { ...o, kayitli: true as const, durum: k.durum, gelmeyen: gelmeyenSayisi(k), izinli: k.izinli.length, kaydeden: k.kaydeden, zaman: k.zaman, kaynak: k.kaynak, tur: k.tur };
}

/* ---------- Hoca ekranı ---------- */
/** Bir öğretim elemanının haftalık oturumları ve yoklama durumları (programdakiler + o haftaya girilmiş telafiler). */
export async function yoklamaHaftasi(teacher: string, haftaIso: string) {
  const ot = await oturumGerekli(HOCA_ROLLERI);
  if (!teacher?.trim()) throw new KullaniciHatasi('Öğretim elemanı seçilmedi.');
  hocaKapsami(ot, teacher);
  if (!isoGecerli(haftaIso)) throw new KullaniciHatasi('Hafta seçilmedi.');
  const bas = pazartesi(haftaIso), bit = isoEkle(bas, 6);
  const [siniflar, p, k] = await Promise.all([aktifSiniflar(), program(), vt().select().from(schema.yoklamalar)
    .where(and(gte(schema.yoklamalar.tarih, bas), sql`${schema.yoklamalar.tarih} <= ${bit}`))]);
  const harita = new Map(k.map(r => [r.anahtar, kayitCoz(r)]));
  const liste = programOturumlari(bas, p, ozetler(siniflar), { hoca: teacher }).map(o => oturumOzeti(o, harita.get(o.anahtar)));
  const var_ = new Set(liste.map(o => o.anahtar)), hn = basNorm(teacher);
  for (const x of harita.values()) {
    if (var_.has(x.anahtar) || basNorm(x.hoca) !== hn) continue;
    liste.push(oturumOzeti({ anahtar: x.anahtar, iso: x.iso, tarih: isoTr(x.iso), gun: gunAdi(x.iso), saat: x.saat, ders: x.ders, sinif: x.sinif, hoca: x.hoca, derslik: '', tur: x.tur as YokTur }, x));
  }
  liste.sort((a, b) => a.iso.localeCompare(b.iso) || a.saat.localeCompare(b.saat, 'tr') || a.sinif.localeCompare(b.sinif, 'tr'));
  return { teacher: teacher.trim(), weekStart: isoTr(bas), bugun: bugunIso(), oturumlar: liste };
}
export type YoklamaHaftasi = Awaited<ReturnType<typeof yoklamaHaftasi>>;

export type OturumGirdisi = { iso: string; sinif: string; saat?: string; ders?: string; hoca?: string; tur?: string };

/** Bir oturumun öğrenci listesi ve kayıtlı yoklaması (yoksa herkes "geldi"). */
async function getirIc(db: Db, o: OturumGirdisi, rol: Rol, siniflar: SinifOgrencili[], kayit?: Kayit | null) {
  if (!isoGecerli(o.iso)) throw new KullaniciHatasi('Oturumun tarihi geçersiz.');
  const s = siniflar.find(x => x.ad === o.sinif);
  if (!s) throw new KullaniciHatasi(`"${o.sinif || ''}" sınıfı bulunamadı. Sayfayı yenileyin.`);
  const anahtar = oturumAnahtari(o.iso, s.ad, o.saat || '', o.ders || '');
  if (kayit === undefined) kayit = (await kayitlar(db, eq(schema.yoklamalar.anahtar, anahtar)))[0] ?? null;
  const isim = new Map(s.ogrenciler.map(x => [x.no, x]));
  const sira = s.ogrenciler.map(x => x.no).filter(Boolean);
  if (kayit) kayit.liste.forEach(n => { if (!sira.includes(n)) sira.push(n); });
  const disari = sira.filter(n => !isim.has(n));
  if (disari.length) {
    (await db.select({ no: schema.ogrenciler.no, adi: schema.ogrenciler.adi, soyadi: schema.ogrenciler.soyadi })
      .from(schema.ogrenciler).where(inArray(schema.ogrenciler.no, disari))).forEach(x => isim.set(x.no, x));
  }
  return {
    anahtar, rol,
    oturum: { iso: o.iso, tarih: isoTr(o.iso), gun: gunAdi(o.iso), saat: o.saat || '', ders: o.ders || '', sinif: s.ad,
      hoca: kayit?.hoca || o.hoca || '', tur: (kayit?.tur || (o.tur === YOK_TUR.TELAFI ? YOK_TUR.TELAFI : YOK_TUR.PROGRAM)) as YokTur },
    kayitli: !!kayit, durum: (kayit?.durum ?? YOK_DURUM.YAPILDI) as YokDurum, aciklama: kayit?.aciklama ?? '',
    kaydeden: kayit?.kaydeden ?? '', zaman: kayit?.zaman ?? '', kaynak: kayit?.kaynak ?? '', surum: kayit?.surum ?? 0,
    gelecek: o.iso > bugunIso(),
    ogrenciler: sira.map(n => {
      const a = isim.get(n);
      return { no: n, adi: a?.adi ?? '', soyadi: a?.soyadi ?? '', sinifta: s.ogrenciler.some(x => x.no === n),
        yok1: !!kayit?.yok1.includes(n), yok2: !!kayit?.yok2.includes(n), izinli: !!kayit?.izinli.includes(n) };
    })
  };
}
export type YoklamaEditoru = Awaited<ReturnType<typeof getirIc>>;

export async function yoklamaGetir(o: OturumGirdisi) {
  const ot = await oturumGerekli(HOCA_ROLLERI);
  hocaKapsami(ot, o?.hoca ?? '');
  return getirIc(vt(), o ?? {} as OturumGirdisi, ot.tur, await aktifSiniflar());
}

export type KayitGirdisi = OturumGirdisi & {
  durum?: string; liste?: string[]; yok1?: string[]; yok2?: string[]; izinli?: string[]; aciklama?: string; oncekiSurum?: number;
};

/** Kaydın çekirdeği (manuel giriş ve tarama ortak). */
async function kaydetIc(ot: Oturum, p: KayitGirdisi, kaynak: 'Manuel' | 'Tarama', birlestir: boolean, siniflar: SinifOgrencili[], prg: Awaited<ReturnType<typeof program>>) {
  if (!isoGecerli(p.iso)) throw new KullaniciHatasi('Tarih geçersiz.');
  if (p.iso > bugunIso()) throw new KullaniciHatasi('İleri tarihli bir derse yoklama girilemez.');
  const s = siniflar.find(x => x.ad === p.sinif);
  if (!s) throw new KullaniciHatasi('Sınıf bulunamadı.');
  const ders = String(p.ders || '').trim(), saat = String(p.saat || '').trim(), hoca = String(p.hoca || '').trim();
  if (!ders) throw new KullaniciHatasi('Ders seçilmedi.');
  if (!hoca) throw new KullaniciHatasi('Öğretim elemanı seçilmedi.');
  hocaKapsami(ot, hoca);
  const rol = ot.tur;
  const tur: YokTur = p.tur === YOK_TUR.TELAFI ? YOK_TUR.TELAFI : YOK_TUR.PROGRAM;
  const durum: YokDurum = p.durum === YOK_DURUM.YAPILMADI ? YOK_DURUM.YAPILMADI : YOK_DURUM.YAPILDI;
  if (tur === YOK_TUR.PROGRAM && !programdaVar(p.iso, s, saat, ders, prg)) {
    throw new KullaniciHatasi('Bu ders programda yok. Program dışı bir ders için "Telafi dersi" seçeneğini kullanın.');
  }
  const anahtar = oturumAnahtari(p.iso, s.ad, saat, ders);
  const kaydeden = kimAdi(ot) + (rol === 'admin' ? ' (yönetici)' : '');

  const sonuc = await vt().transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(7308)`);
    const mevcut = (await kayitlar(tx, eq(schema.yoklamalar.anahtar, anahtar)))[0] ?? null;
    const onceki = Number(p.oncekiSurum) || 0;
    if (mevcut && mevcut.surum !== onceki) {
      throw new KullaniciHatasi(`Bu yoklama, siz açtıktan sonra başka biri tarafından değiştirildi (${mevcut.kaydeden}, ${mevcut.zaman}). Yoklamayı yeniden açıp tekrar kaydedin.`);
    }
    if (!mevcut && onceki) throw new KullaniciHatasi('Bu yoklama siz açtıktan sonra silindi. Yeniden açın.');
    const b = yoklamaBirlestir({ liste: p.liste ?? [], yok1: p.yok1 ?? [], yok2: p.yok2 ?? [], izinli: p.izinli ?? [], durum, kaynak, aciklama: String(p.aciklama ?? ''), birlestir }, mevcut, rol === 'admin');
    const deger = { tarih: p.iso, saat, ders, sinif: s.ad, hoca, tur, durum, ...b, kaydeden, zaman: new Date() };
    const [r] = await tx.insert(schema.yoklamalar).values({ anahtar, ...deger, surum: 1 })
      .onConflictDoUpdate({ target: schema.yoklamalar.anahtar, set: { ...deger, surum: sql`${schema.yoklamalar.surum} + 1` } }).returning();
    return { anahtar, zaman: zamanYaz(r.zaman), kaydeden, gelmeyen: gelmeyenSayisi(b), durum, izinli: b.izinli.length, ogrenci: b.liste.length, guncelleme: !!mevcut };
  });
  // İşlem kaydı veritabanı işleminin dışında yazılır (tek bağlantılı havuzda kilitlenmesin)
  await islemKaydet('Yoklama', `${sonuc.guncelleme ? 'Güncellendi' : 'Girildi'}: ${s.ad} · ${ders} · ${isoTr(p.iso)} ${saat} · ` +
    (durum === YOK_DURUM.YAPILMADI ? 'ders yapılmadı' : sonuc.gelmeyen + ' öğrenci gelmedi') + (kaynak === 'Tarama' ? ' (tarama)' : ''));
  return sonuc;
}

/** Yoklamayı kaydeder (varsa günceller). İzinli işaretini yalnızca yönetim değiştirebilir. */
export async function yoklamaKaydet(p: KayitGirdisi) {
  const ot = await oturumGerekli(HOCA_ROLLERI);
  const [siniflar, prg] = await Promise.all([aktifSiniflar(), program()]);
  return kaydetIc(ot, p ?? {} as KayitGirdisi, 'Manuel', false, siniflar, prg);
}

/** Yanlış girilmiş bir oturumu siler (yalnızca yönetim). */
export async function yoklamaSil(anahtar: string) {
  await yonetici();
  const [k] = await vt().delete(schema.yoklamalar).where(eq(schema.yoklamalar.anahtar, String(anahtar))).returning();
  if (!k) throw new KullaniciHatasi('Silinecek yoklama bulunamadı.');
  await islemKaydet('Yoklama', `Silindi: ${k.sinif} · ${k.ders} · ${isoTr(k.tarih)} ${k.saat}`);
  return true;
}

/* ---------- Öğrenciye göre yoklama (hoca ekranı) ---------- */
/** Numara ya da ad soyadla öğrenci arama (aktif öğrenciler, en çok 20). */
export async function yoklamaOgrenciAra(qHam: string) {
  await oturumGerekli(HOCA_ROLLERI);
  const q = basNorm(String(qHam ?? '')).trim(), qNo = String(qHam ?? '').replace(/\s+/g, '');
  if (q.length < 2) throw new KullaniciHatasi('Aramak için en az 2 karakter yazın.');
  const [ogr, siniflar] = await Promise.all([
    vt().select({ no: schema.ogrenciler.no, adi: schema.ogrenciler.adi, soyadi: schema.ogrenciler.soyadi, sinifId: schema.ogrenciler.sinifId })
      .from(schema.ogrenciler).where(eq(schema.ogrenciler.durum, 'aktif')),
    vt().select({ id: schema.siniflar.id, ad: schema.siniflar.ad }).from(schema.siniflar)
  ]);
  const sinifAd = new Map(siniflar.map(s => [s.id, s.ad]));
  return ogr.filter(o => (/^\d+$/.test(qNo) && o.no.includes(qNo)) || basNorm(o.adi + ' ' + o.soyadi).includes(q))
    .sort((a, b) => (a.adi + ' ' + a.soyadi).localeCompare(b.adi + ' ' + b.soyadi, 'tr') || a.no.localeCompare(b.no))
    .slice(0, 20)
    .map(o => ({ no: o.no, ad: (o.adi + ' ' + o.soyadi).trim(), sinif: o.sinifId ? sinifAd.get(o.sinifId) ?? '' : '' }));
}
export type YoklamaOgrenciBulunan = Awaited<ReturnType<typeof yoklamaOgrenciAra>>[number];

/**
 * Öğrencinin sınıfına ait (ya da listesinde bulunduğu) bütün yoklama günleri, yeniden eskiye.
 * Hoca yalnızca kendi derslerini değiştirebilir; diğerleri bilgi olarak görünür.
 */
export async function yoklamaOgrenciKayitlari(noHam: string) {
  const ot = await oturumGerekli(HOCA_ROLLERI);
  const no = String(noHam ?? '').trim();
  const [o] = await vt().select().from(schema.ogrenciler).where(eq(schema.ogrenciler.no, no));
  if (!o) throw new KullaniciHatasi('Öğrenci bulunamadı.');
  const sinif = o.sinifId ? (await vt().select({ ad: schema.siniflar.ad }).from(schema.siniflar).where(eq(schema.siniflar.id, o.sinifId)))[0]?.ad ?? '' : '';
  const y = schema.yoklamalar;
  const kosul = sql`${y.liste} @> ${JSON.stringify([no])}::jsonb`;
  const k = await kayitlar(vt(), sinif ? sql`(${y.sinif} = ${sinif} or ${kosul})` : kosul);
  const hn = basNorm(ot.hocaAdi), bugun = bugunIso();
  k.sort((a, b) => b.iso.localeCompare(a.iso) || a.saat.localeCompare(b.saat, 'tr') || a.ders.localeCompare(b.ders, 'tr'));
  return {
    no, ad: (o.adi + ' ' + o.soyadi).trim(), sinif,
    gunler: k.map(x => ({
      anahtar: x.anahtar, iso: x.iso, tarih: isoTr(x.iso), gun: gunAdi(x.iso), saat: x.saat, ders: x.ders, sinif: x.sinif, hoca: x.hoca, tur: x.tur,
      durum: x.durum, listede: x.liste.includes(no), yok1: x.yok1.includes(no), yok2: x.yok2.includes(no), izinli: x.izinli.includes(no),
      kaydeden: x.kaydeden, zaman: x.zaman, surum: x.surum,
      duzenlenebilir: x.durum === YOK_DURUM.YAPILDI && x.iso <= bugun && (ot.tur === 'admin' || (!!hn && basNorm(x.hoca) === hn))
    }))
  };
}
export type YoklamaOgrenciKayitlari = Awaited<ReturnType<typeof yoklamaOgrenciKayitlari>>;

/** Tek öğrencinin bir yoklamadaki durumunu günceller (hoca kendi dersinde, yönetim hepsinde). */
export async function yoklamaOgrenciGuncelle(p: { anahtar: string; no: string; yok1: boolean; yok2: boolean; surum: number }) {
  const ot = await oturumGerekli(HOCA_ROLLERI);
  const no = String(p?.no ?? '').trim();
  const [o] = await vt().select({ adi: schema.ogrenciler.adi, soyadi: schema.ogrenciler.soyadi }).from(schema.ogrenciler).where(eq(schema.ogrenciler.no, no));
  if (!o) throw new KullaniciHatasi('Öğrenci bulunamadı.');
  const kaydeden = kimAdi(ot) + (ot.tur === 'admin' ? ' (yönetici)' : '');
  const sonuc = await vt().transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(7308)`);
    const k = (await kayitlar(tx, eq(schema.yoklamalar.anahtar, String(p?.anahtar ?? ''))))[0];
    if (!k) throw new KullaniciHatasi('Yoklama bulunamadı; silinmiş olabilir. Listeyi yenileyin.');
    hocaKapsami(ot, k.hoca);
    if (k.surum !== Number(p.surum)) throw new KullaniciHatasi(`Bu yoklama siz açtıktan sonra değişti (${k.kaydeden}, ${k.zaman}). Listeyi yenileyip tekrar deneyin.`);
    if (k.durum !== YOK_DURUM.YAPILDI) throw new KullaniciHatasi('Bu ders "yapılmadı" olarak kayıtlı; devamsızlık girilemez.');
    if (k.iso > bugunIso()) throw new KullaniciHatasi('İleri tarihli bir derse yoklama girilemez.');
    const d = ogrenciYoklamaDegistir(k, no, !!p.yok1, !!p.yok2);
    const kaynak = k.kaynak && k.kaynak !== 'Manuel' ? 'Karma' : 'Manuel';
    const [r] = await tx.update(schema.yoklamalar).set({ ...d, kaynak, kaydeden, zaman: new Date(), surum: sql`${schema.yoklamalar.surum} + 1` })
      .where(eq(schema.yoklamalar.anahtar, k.anahtar)).returning({ surum: schema.yoklamalar.surum, zaman: schema.yoklamalar.zaman });
    return { k, surum: r.surum, zaman: zamanYaz(r.zaman) };
  });
  const durum = (y: boolean) => (y ? 'yok' : 'geldi');
  await islemKaydet('Yoklama', `Öğrenci güncellendi: ${no} ${(o.adi + ' ' + o.soyadi).trim()} · ${sonuc.k.sinif} · ${sonuc.k.ders} · ${isoTr(sonuc.k.iso)} ${sonuc.k.saat} · 1. ders ${durum(!!p.yok1)}, 2. ders ${durum(!!p.yok2)}`);
  return { surum: sonuc.surum, zaman: sonuc.zaman, kaydeden };
}

/* ---------- Hocanın yoklama dökümü (PDF) ---------- */
/** Hücre: G geldi, Y yok, I izinli (yok ama izinli), '' o gün listede değil; ders yapılmadıysa oturumun durumu "Yapılmadı". */
export type DokumHucre = 'G' | 'Y' | 'I' | '';

/**
 * Bir öğretim elemanının tarih aralığında girilmiş bütün yoklamaları, sınıf sınıf (sınıf listesi sırasıyla).
 * Başlangıç verilmezse dönem başlangıcı (yoklama ayarı), bitiş verilmezse bugün.
 */
export async function hocaYoklamaDokumu(teacher: string, basHam?: string, bitHam?: string) {
  const ot = await oturumGerekli(HOCA_ROLLERI);
  if (!teacher?.trim()) throw new KullaniciHatasi('Öğretim elemanı seçilmedi.');
  hocaKapsami(ot, teacher);
  const ayar = yokAyarCoz(await ayarlarOku(vt()));
  const bugun = bugunIso();
  const bas = isoGecerli(basHam ?? '') ? basHam! : ayar.baslangic || isoEkle(bugun, -120);
  const bit = isoGecerli(bitHam ?? '') ? bitHam! : bugun;
  if (bas > bit) throw new KullaniciHatasi('Başlangıç tarihi bitişten sonra olamaz.');
  const hn = basNorm(teacher);
  const [siniflar, tum] = await Promise.all([aktifSiniflar(), kayitlar(vt(), and(gte(schema.yoklamalar.tarih, bas), sql`${schema.yoklamalar.tarih} <= ${bit}`))]);
  const k = tum.filter(x => basNorm(x.hoca) === hn)
    .sort((a, b) => a.iso.localeCompare(b.iso) || a.saat.localeCompare(b.saat, 'tr') || a.ders.localeCompare(b.ders, 'tr'));
  // Sınıf listesinde olmayıp yoklamada geçen öğrencilerin adları
  const bilinen = new Set(siniflar.flatMap(s => s.ogrenciler.map(o => o.no)));
  const disari = [...new Set(k.flatMap(x => x.liste).filter(n => !bilinen.has(n)))];
  const isim = new Map((disari.length ? await vt().select({ no: schema.ogrenciler.no, adi: schema.ogrenciler.adi, soyadi: schema.ogrenciler.soyadi })
    .from(schema.ogrenciler).where(inArray(schema.ogrenciler.no, disari)) : []).map(o => [o.no, o]));
  const sinifAdlari = [...new Set(k.map(x => x.sinif))].sort((a, b) => {
    const ia = siniflar.findIndex(s => s.ad === a), ib = siniflar.findIndex(s => s.ad === b);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.localeCompare(b, 'tr');
  });
  return {
    teacher: teacher.trim(), bas: isoTr(bas), bit: isoTr(bit), olusturma: zamanYaz(new Date()),
    siniflar: sinifAdlari.map(ad => {
      const ks = k.filter(x => x.sinif === ad), s = siniflar.find(z => z.ad === ad);
      const sira = (s?.ogrenciler ?? []).map(o => ({ no: o.no, adi: o.adi, soyadi: o.soyadi }));
      ks.forEach(x => x.liste.forEach(n => { if (!sira.some(o => o.no === n)) { const o = isim.get(n) ?? s?.ogrenciler.find(z => z.no === n); sira.push({ no: n, adi: o?.adi ?? '', soyadi: o?.soyadi ?? '' }); } }));
      const hucre = (x: Kayit, no: string, yok: string[]): DokumHucre => !x.liste.includes(no) ? '' : !yok.includes(no) ? 'G' : x.izinli.includes(no) ? 'I' : 'Y';
      const ogrenciler = sira.map(o => {
        const h = ks.map(x => (x.durum === YOK_DURUM.YAPILMADI ? ['', ''] as [DokumHucre, DokumHucre] : [hucre(x, o.no, x.yok1), hucre(x, o.no, x.yok2)] as [DokumHucre, DokumHucre]));
        return { ...o, h, yok: h.reduce((t, [a, b]) => t + Number(a === 'Y') + Number(b === 'Y'), 0) };
      });
      return {
        ad, oturumlar: ks.map(x => ({ tarih: isoTr(x.iso), gun: gunAdi(x.iso), saat: x.saat, ders: x.ders, tur: x.tur, yapilmadi: x.durum === YOK_DURUM.YAPILMADI })),
        ogrenciler, toplamYok: ogrenciler.reduce((t, o) => t + o.yok, 0)
      };
    })
  };
}
export type HocaYoklamaDokumu = Awaited<ReturnType<typeof hocaYoklamaDokumu>>;

/* ---------- Evrak kaydı (QR) ---------- */
export type EvrakSayfasi = {
  hoca: string; sinif: string; tur: string; hafta: string; sayfa: number; toplam: number; satir: number;
  sutunlar: { tarih: string; saat: string; ders: string }[]; ogrenciler: string[]; yerlesim: Record<string, unknown>;
};

/** Basılan sirkü sayfalarını kaydeder; aynı sayfa yeniden basılırsa aynı evrak numarasını döner. */
export async function evrakKaydet(sayfalar: EvrakSayfasi[]) {
  const ot = await oturumGerekli(HOCA_ROLLERI);
  if (!Array.isArray(sayfalar) || !sayfalar.length) return [];
  sayfalar.forEach(p => hocaKapsami(ot, String(p?.hoca ?? '')));
  if (sayfalar.length > 400) throw new KullaniciHatasi('Tek seferde en çok 400 sayfa kaydedilebilir.');
  const hazir = sayfalar.map(p => {
    const sutunlar = (Array.isArray(p.sutunlar) ? p.sutunlar : []).slice(0, 14).map(c => ({ tarih: String(c?.tarih ?? ''), saat: String(c?.saat ?? ''), ders: String(c?.ders ?? '') }));
    const ogrenciler = noListesi(p.ogrenciler).slice(0, 200);
    const yerlesim = p.yerlesim && typeof p.yerlesim === 'object' && JSON.stringify(p.yerlesim).length <= 45000 ? p.yerlesim : {};
    const v = { hoca: String(p.hoca ?? '').slice(0, 200), sinif: String(p.sinif ?? '').slice(0, 100), tur: p.tur === YOK_TUR.TELAFI ? YOK_TUR.TELAFI : YOK_TUR.PROGRAM,
      hafta: String(p.hafta ?? '').slice(0, 40), sayfa: Number(p.sayfa) || 1, toplam: Number(p.toplam) || 1, satir: Number(p.satir) || ogrenciler.length, sutunlar, ogrenciler, yerlesim };
    return { ...v, ozet: ozet(JSON.stringify([v.hoca, v.sinif, v.tur, sutunlar.map(c => [c.tarih, c.saat, c.ders].join(' / ')), ogrenciler, v.satir, v.sayfa, v.toplam])) };
  });
  const r = await vt().transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(7309)`);
    const ozetler = [...new Set(hazir.map(h => h.ozet))];
    const var_ = new Map((await tx.select({ no: schema.yoklamaEvraklari.no, ozet: schema.yoklamaEvraklari.ozet }).from(schema.yoklamaEvraklari)
      .where(inArray(schema.yoklamaEvraklari.ozet, ozetler))).map(r => [r.ozet, r.no]));
    const simdi = new Date();
    if (var_.size) await tx.update(schema.yoklamaEvraklari).set({ sonYazdirma: simdi }).where(inArray(schema.yoklamaEvraklari.no, [...var_.values()]));
    for (const h of hazir) {   // yerleşim yeniden basımda değişebilir (yazı tipi, ekran)
      const no = var_.get(h.ozet);
      if (no) await tx.update(schema.yoklamaEvraklari).set({ yerlesim: h.yerlesim }).where(eq(schema.yoklamaEvraklari.no, no));
    }
    const yeniler = hazir.filter((h, i) => !var_.has(h.ozet) && hazir.findIndex(x => x.ozet === h.ozet) === i);
    if (yeniler.length) {
      const mevcut = new Set((await tx.select({ no: schema.yoklamaEvraklari.no }).from(schema.yoklamaEvraklari)).map(r => r.no));
      const satirlar = yeniler.map(h => ({ ...h, no: evrakNoUret(mevcut, () => randomInt(0, 2 ** 32) / 2 ** 32), olusturma: simdi, sonYazdirma: simdi }));
      await tx.insert(schema.yoklamaEvraklari).values(satirlar);
      satirlar.forEach(s => var_.set(s.ozet, s.no));
    }
    return { numaralar: hazir.map(h => var_.get(h.ozet)!), yeni: yeniler.length };
  });
  if (r.yeni) await islemKaydet('Yoklama evrakı', r.yeni + ' yeni sayfa kaydedildi');
  return r.numaralar;
}

/* ---------- Tarama ---------- */
export type TaramaEvraki = Omit<typeof schema.yoklamaEvraklari.$inferSelect, 'ozet' | 'olusturma' | 'sonYazdirma'> & { oturumlar: (string | null)[] };

/** Okunan evrakların kayıtları ve her dersin şu anki yoklaması (tek çağrıda). */
export async function taramaHazirla(numaralarHam: string[]) {
  const ot = await oturumGerekli(HOCA_ROLLERI), rol = ot.tur;
  const numaralar = [...new Set((numaralarHam ?? []).map(n => String(n || '').trim().toUpperCase()).filter(Boolean))].slice(0, 500);
  const db = vt();
  const [satirlar, siniflar] = await Promise.all([
    numaralar.length ? db.select().from(schema.yoklamaEvraklari).where(inArray(schema.yoklamaEvraklari.no, numaralar)) : [],
    aktifSiniflar()
  ]);
  const evraklar: Record<string, TaramaEvraki | null> = {};
  const oturumlar: Record<string, YoklamaEditoru | { hata: string }> = {};
  const isimler: Record<string, string> = {};
  const sinifIsim = new Map(siniflar.flatMap(s => s.ogrenciler.map(o => [o.no, (o.adi + ' ' + o.soyadi).trim()] as const)));
  for (const no of numaralar) evraklar[no] = null;
  const istenen: { anahtar: string; o: OturumGirdisi }[] = [];
  for (const r of satirlar) {
    const { ozet: _o, olusturma: _ol, sonYazdirma: _s, ...e } = r;
    const x: TaramaEvraki = { ...e, oturumlar: [] };
    for (const c of e.sutunlar) {
      const iso = trIso(c.tarih), s = siniflar.find(z => z.ad === e.sinif);
      if (!iso || !s) { x.oturumlar.push(null); continue; }
      const anahtar = oturumAnahtari(iso, s.ad, c.saat, c.ders);
      x.oturumlar.push(anahtar);
      if (!istenen.some(i => i.anahtar === anahtar)) istenen.push({ anahtar, o: { iso, sinif: s.ad, saat: c.saat, ders: c.ders, hoca: e.hoca, tur: e.tur } });
    }
    evraklar[r.no] = x;
  }
  const mevcut = istenen.length ? new Map((await kayitlar(db, inArray(schema.yoklamalar.anahtar, istenen.map(i => i.anahtar)))).map(k => [k.anahtar, k])) : new Map<string, Kayit>();
  for (const i of istenen) {
    try { hocaKapsami(ot, i.o.hoca ?? ''); oturumlar[i.anahtar] = await getirIc(db, i.o, rol, siniflar, mevcut.get(i.anahtar) ?? null); }
    catch (e) { oturumlar[i.anahtar] = { hata: e instanceof KullaniciHatasi ? e.message : 'Ders okunamadı.' }; }
  }
  const eksikIsim = satirlar.flatMap(r => r.ogrenciler).filter(n => !sinifIsim.has(n));
  const disari = eksikIsim.length ? await db.select({ no: schema.ogrenciler.no, adi: schema.ogrenciler.adi, soyadi: schema.ogrenciler.soyadi })
    .from(schema.ogrenciler).where(inArray(schema.ogrenciler.no, [...new Set(eksikIsim)])) : [];
  disari.forEach(o => sinifIsim.set(o.no, (o.adi + ' ' + o.soyadi).trim()));
  satirlar.forEach(r => r.ogrenciler.forEach(n => { isimler[n] = sinifIsim.get(n) ?? ''; }));
  return { rol, bugun: bugunIso(), evraklar, oturumlar, isimler };
}
export type TaramaHazirligi = Awaited<ReturnType<typeof taramaHazirla>>;

/** Onaylanan tarama sonuçlarını kaydeder. Her ders bağımsızdır: biri hata verse de diğerleri kaydedilir. */
export async function taramaKaydet(kayitlarHam: (KayitGirdisi & { evraklar?: string[] })[]) {
  const ot = await oturumGerekli(HOCA_ROLLERI);
  if (!Array.isArray(kayitlarHam) || !kayitlarHam.length) throw new KullaniciHatasi('Kaydedilecek ders yok.');
  const [siniflar, prg] = await Promise.all([aktifSiniflar(), program()]);
  const sonuc: ({ ok: true; anahtar: string; zaman: string; gelmeyen: number; ogrenci: number } | { ok: false; hata: string })[] = [];
  const islenen = new Map<string, number>();
  for (const k of kayitlarHam.slice(0, 200)) {
    try {
      const evr = noListesi(k.evraklar ?? []).map(x => x.toUpperCase());
      const r = await kaydetIc(ot, { ...k, durum: YOK_DURUM.YAPILDI, aciklama: k.aciklama || (evr.length ? 'Tarama: ' + evr.join(', ') : '') }, 'Tarama', true, siniflar, prg);
      evr.forEach(no => islenen.set(no, (islenen.get(no) ?? 0) + 1));
      sonuc.push({ ok: true, anahtar: r.anahtar, zaman: r.zaman, gelmeyen: r.gelmeyen, ogrenci: r.ogrenci });
    } catch (e) {
      sonuc.push({ ok: false, hata: e instanceof KullaniciHatasi ? e.message : 'Beklenmeyen bir hata oluştu.' });
      if (!(e instanceof KullaniciHatasi)) console.error(e);
    }
  }
  const zaman = zamanYaz(new Date());
  for (const [no, n] of islenen) {
    await vt().update(schema.yoklamaEvraklari).set({ tarama: `${zaman} · ${n} ders kaydedildi` }).where(eq(schema.yoklamaEvraklari.no, no));
  }
  const basarili = sonuc.filter(x => x.ok).length;
  await islemKaydet('Yoklama taraması', basarili + ' ders kaydedildi' + (sonuc.length > basarili ? ', ' + (sonuc.length - basarili) + ' ders kaydedilemedi' : ''));
  return sonuc;
}

/** Bir sayfanın düzeltilmiş görüntüsünü (JPEG data URL) arşive kaydeder. */
export async function taramaGorselKaydet(evrakNo: string, dataUrl: string) {
  await yetkiGerekli(HOCA_ROLLERI);
  const no = String(evrakNo || '').trim().toUpperCase();
  const m = String(dataUrl || '').match(/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw new KullaniciHatasi('Görüntü biçimi geçersiz.');
  if (m[2].length > GORSEL_EN_COK) throw new KullaniciHatasi('Görüntü çok büyük.');
  const [e] = await vt().select({ no: schema.yoklamaEvraklari.no }).from(schema.yoklamaEvraklari).where(eq(schema.yoklamaEvraklari.no, no));
  if (!e) throw new KullaniciHatasi('Evrak bulunamadı: ' + no);
  const [r] = await vt().insert(schema.taramaGorselleri).values({ evrakNo: no, turu: 'image/' + m[1], boyut: Math.floor(m[2].length * 3 / 4), veri: m[2] }).returning({ id: schema.taramaGorselleri.id });
  return { id: r.id };
}

/* ---------- Yönetim paneli ---------- */
export async function yoklamaAyarlari() {
  await yonetici();
  const db = vt();
  const [a, siniflar, [n]] = await Promise.all([ayarlarOku(db), db.select({ ad: schema.siniflar.ad, anahtar: schema.siniflar.anahtar }).from(schema.siniflar).where(eq(schema.siniflar.aktif, true)),
    db.select({ n: count() }).from(schema.yoklamalar)]);
  const y = yokAyarCoz(a);
  return { ...y, dogrulamaAcik: ogrenciAyarlari(a).dogrulama, siniflar: siniflar.sort((x, z) => x.anahtar.localeCompare(z.anahtar, 'tr')).map(s => s.ad), oturumSayisi: n.n };
}
export type YoklamaAyarlari = Awaited<ReturnType<typeof yoklamaAyarlari>>;

export async function yoklamaAyarKaydet(p: { yuzde: number; hafta: number; baslangic: string }) {
  await yonetici();
  const yuzde = Number(p?.yuzde), hafta = Number(p?.hafta), bas = String(p?.baslangic ?? '');
  if (!(yuzde >= 0 && yuzde <= 100)) throw new KullaniciHatasi('Sınır yüzdesi 0 ile 100 arasında olmalı.');
  if (!(Number.isInteger(hafta) && hafta >= 0 && hafta <= 60)) throw new KullaniciHatasi('Hafta sayısı 0 ile 60 arasında bir tam sayı olmalı.');
  if (bas && !isoGecerli(bas)) throw new KullaniciHatasi('Dönem başlangıç tarihi geçersiz.');
  await ayarYaz('YOKLAMA_SINIR_YUZDE', String(yuzde));
  await ayarYaz('YOKLAMA_DONEM_HAFTA', String(hafta));
  await ayarYaz('YOKLAMA_DONEM_BASLANGIC', bas ? isoTr(bas) : '');
  await islemKaydet('Yoklama ayarları', `Sınır %${yuzde}, ${hafta} hafta, başlangıç ${bas ? isoTr(bas) : '(yok)'}`);
  return yoklamaAyarlari();
}

async function donemKayitlari(db: Db, baslangic: string) {
  return kayitlar(db, baslangic ? gte(schema.yoklamalar.tarih, baslangic) : undefined);
}

/** Bir sınıfın devamsızlık tablosu: öğrenci × ders. */
export async function yoklamaRaporu(sinifAd: string) {
  await yonetici();
  const db = vt();
  const [siniflar, prg, a] = await Promise.all([aktifSiniflar(), program(), ayarlarOku(db)]);
  const s = siniflar.find(x => x.ad === sinifAd);
  if (!s) throw new KullaniciHatasi('Sınıf bulunamadı.');
  const ayar = yokAyarCoz(a), haftalik = haftalikDersSaatleri(s.ad, prg, ozetler(siniflar)), oturumlar = await donemKayitlari(db, ayar.baslangic);
  const dersAdlari: Record<string, string> = {};
  Object.keys(haftalik).forEach(k => { dersAdlari[k] = prg.find(p => basNorm(p.ders) === k)?.ders ?? k; });
  const ogr = s.ogrenciler.filter(o => o.no).map(o => {
    const d = devamsizlikHesapla(o.no, oturumlar, ayar, haftalik);
    const m: Record<string, { yok: number; izinli: number; durum: string; oturum: number }> = {};
    d.forEach(x => { const k = basNorm(x.ders); m[k] = { yok: x.yokSaat, izinli: x.izinliSaat, durum: x.durum, oturum: x.oturum }; dersAdlari[k] ??= x.ders; });
    const durum = d.some(x => x.durum === 'asti') ? 'asti' : d.some(x => x.durum === 'yakin') ? 'yakin' : '';
    return { no: o.no, ad: (o.adi + ' ' + o.soyadi).trim(), dersler: m, toplam: d.reduce((t, x) => t + x.yokSaat, 0), durum };
  });
  const dersler = Object.keys(dersAdlari).map(k => ({
    anahtar: k, ad: dersAdlari[k], haftalikSaat: haftalik[k] || 0, sinir: sinirHesapla(haftalik[k] || 0, ayar),
    oturum: oturumlar.filter(x => x.sinif === s.ad && basNorm(x.ders) === k && x.durum === YOK_DURUM.YAPILDI).length
  })).sort((x, z) => x.ad.localeCompare(z.ad, 'tr'));
  return { sinif: s.ad, ayar, dersler, ogrenciler: ogr };
}
export type YoklamaRaporu = Awaited<ReturnType<typeof yoklamaRaporu>>;

/** Programda olup bugüne kadar yoklaması girilmemiş dersler. */
export async function yoklamaEksikler() {
  await yonetici();
  const db = vt();
  const [siniflar, prg, a] = await Promise.all([aktifSiniflar(), program(), ayarlarOku(db)]);
  const ayar = yokAyarCoz(a), bugun = bugunIso();
  const girilen = new Set((await db.select({ a: schema.yoklamalar.anahtar }).from(schema.yoklamalar)).map(r => r.a));
  const { baslangic, eksik } = eksikOturumlar(prg, ozetler(siniflar), girilen, ayar, bugun);
  const hocaSay = new Map<string, number>();
  eksik.forEach(e => hocaSay.set(e.hoca, (hocaSay.get(e.hoca) ?? 0) + 1));
  return {
    baslangic: isoTr(baslangic), varsayilanAralik: !ayar.baslangic, toplam: eksik.length,
    hocalar: [...hocaSay].sort((x, z) => z[1] - x[1] || x[0].localeCompare(z[0], 'tr')).map(([hoca, sayi]) => ({ hoca, sayi })),
    liste: eksik.sort((x, z) => z.iso.localeCompare(x.iso) || x.hoca.localeCompare(z.hoca, 'tr')).slice(0, 300)
      .map(e => ({ iso: e.iso, tarih: e.tarih, gun: e.gun, saat: e.saat, ders: e.ders, sinif: e.sinif, hoca: e.hoca }))
  };
}
export type YoklamaEksikleri = Awaited<ReturnType<typeof yoklamaEksikler>>;

/** Taranan sayfa görüntüleri arşivi. */
export async function taramaArsivi() {
  await yonetici();
  const [r] = await vt().select({ n: count(), boyut: sum(schema.taramaGorselleri.boyut) }).from(schema.taramaGorselleri);
  const son = await vt().select({ id: schema.taramaGorselleri.id, evrakNo: schema.taramaGorselleri.evrakNo, zaman: schema.taramaGorselleri.zaman, boyut: schema.taramaGorselleri.boyut })
    .from(schema.taramaGorselleri).orderBy(sql`${schema.taramaGorselleri.id} desc`).limit(50);
  return { sayi: r.n, boyut: Number(r.boyut ?? 0), son: son.map(x => ({ ...x, zaman: zamanYaz(x.zaman) })) };
}
export type TaramaArsivi = Awaited<ReturnType<typeof taramaArsivi>>;

/** Bütün tarama görüntülerini siler (yoklama kayıtları silinmez). */
export async function taramaArsiviSil() {
  await yonetici();
  const silinen = (await vt().delete(schema.taramaGorselleri).returning({ id: schema.taramaGorselleri.id })).length;
  await islemKaydet('Yoklama taraması', silinen + ' tarama görüntüsü silindi');
  return { silinen };
}

/** Arşivdeki bir görüntü (yönetim, ayrı adresten görüntülenir). */
export async function taramaGorseli(id: number) {
  await yonetici();
  const [r] = await vt().select().from(schema.taramaGorselleri).where(eq(schema.taramaGorselleri.id, id));
  return r ?? null;
}

/* ---------- Öğrenci ekranı ---------- */
export type DevamsizlikBilgisi = { dersler: ReturnType<typeof devamsizlikHesapla>; sinirYuzde: number; sinirVar: boolean; sonTarih: string };

/** Öğrencinin devamsızlığı (öğrenci sorgusu çağırır; yalnızca doğrulama açıkken). */
export async function yoklamaOgrenci(db: Db, a: Record<string, string>, no: string, sinifAd: string): Promise<DevamsizlikBilgisi> {
  const ayar = yokAyarCoz(a);
  const kosul = sql`${schema.yoklamalar.liste} @> ${JSON.stringify([no])}::jsonb`;
  const [rows, prg, siniflar] = await Promise.all([
    db.select().from(schema.yoklamalar).where(ayar.baslangic ? and(kosul, gte(schema.yoklamalar.tarih, ayar.baslangic)) : kosul),
    db.select().from(schema.hocaProgrami).orderBy(asc(schema.hocaProgrami.sira)),
    db.select({ ad: schema.siniflar.ad, anahtar: schema.siniflar.anahtar, derslik: schema.siniflar.derslik }).from(schema.siniflar).where(eq(schema.siniflar.aktif, true))
  ]);
  const dersler = devamsizlikHesapla(no, rows.map(kayitCoz), ayar, haftalikDersSaatleri(sinifAd, prg, siniflar));
  const son = dersler.flatMap(d => d.kayitlar.map(k => k.iso)).sort().pop() ?? '';
  return { dersler, sinirYuzde: ayar.yuzde, sinirVar: !!(ayar.hafta && ayar.yuzde), sonTarih: son ? isoTr(son) : '' };
}
