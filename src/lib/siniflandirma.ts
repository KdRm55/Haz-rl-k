/** Sınıf oluşturma ve sınıf değişikliği — Apps Script Siniflandirma.gs panel işlemleri karşılığı. */
import 'server-only';
import { createHash } from 'node:crypto';
import { and, asc, desc, eq, like, sql } from 'drizzle-orm';
import { vt, schema } from '@/db';
import { KullaniciHatasi } from './hata';
import { basNorm, sinifAnahtari } from './metin';
import { ayarlarOku } from './ogrenci';
import { islemKaydet, yetkiGerekli } from './oturum';
import { puanOku, SONUC, sinavKurali, sinavSonucu } from './sinav';
import {
  alfabetik, dagitDengeli, dagitSeviyeli, degisiklikleriDenetle, duzenDogrula, plandanSiniflar, taslakDenetle,
  type DagitimSinifi, type Duzen, type SinifDegisikligi, type Tur, type YerlestirmeBilgisi
} from './siniflandirma-kurallari';
import { ayarYaz } from './ayar';

type Vt = ReturnType<typeof vt>;
type Db = Vt | Parameters<Parameters<Vt['transaction']>[0]>[0];
const yonetici = () => yetkiGerekli(['admin']);
const zamanKodu = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul', dateStyle: 'short', timeStyle: 'medium' })
  .format(new Date()).replace(/\D/g, '').slice(2, 14).replace(/^(\d{6})/, '$1-');

/* ---------- Plan ve veri toplama (hepsi verilen bağlantıyla; işlem içinden de çağrılır) ---------- */
function sinifPlani(a: Record<string, string>): Duzen | null {
  const d = basNorm(a.SINIF_DUZENI);
  if (!d) return null;
  const n = (v?: string) => { const x = parseInt(v ?? '', 10); return isNaN(x) || x < 0 ? 0 : Math.min(x, 20); };
  return { duzen: d.includes('KARMA') ? 'KARMA' : 'AYRI', kiz: n(a.KIZ_SINIF_SAYISI), erkek: n(a.ERKEK_SINIF_SAYISI), karma: n(a.KARMA_SINIF_SAYISI), yontem: dagitimYontemi(a) };
}
const dagitimYontemi = (a: Record<string, string>) => (basNorm(a.DAGITIM_YONTEMI).includes('DENGELI') ? 'DENGELI' : 'SEVIYELI') as Duzen['yontem'];

async function veriTopla(db: Db) {
  const [a, siniflar, ogrenciler, sinav, taslak] = await Promise.all([
    ayarlarOku(db),
    db.select().from(schema.siniflar).orderBy(asc(schema.siniflar.anahtar)),
    db.select().from(schema.ogrenciler).orderBy(asc(schema.ogrenciler.no)),
    db.select().from(schema.sinavSonuclari),
    db.select().from(schema.sinifTaslagi).orderBy(asc(schema.sinifTaslagi.sira), asc(schema.sinifTaslagi.no))
  ]);
  const plan = sinifPlani(a);
  const tabloAd = new Map(siniflar.map(s => [s.anahtar, s]));
  // Yerleştirme sınıfları: kayıtlı plan varsa plandan, yoksa aktif sınıflardan
  const yerlestirme: DagitimSinifi[] = plan
    ? plandanSiniflar(plan).map(s => { const r = tabloAd.get(sinifAnahtari(s.ad)); return { ad: s.ad, tur: s.tur, kapasite: r?.kapasite ?? 0, derslik: r?.derslik ?? '' }; })
    : siniflar.filter(s => s.aktif).map(s => ({ ad: s.ad, tur: (s.tur || 'Karma') as Tur, kapasite: s.kapasite, derslik: s.derslik }));
  const kural = sinavKurali(a);
  const sinavHarita = new Map(sinav.map(s => [s.no, s]));
  const bilgi: Record<string, YerlestirmeBilgisi> = {};
  for (const o of ogrenciler) {
    if (!o.kayitli || o.durum !== 'aktif') continue;
    const s = sinavHarita.get(o.no);
    const y = s ? puanOku(s.yazili) : null;
    bilgi[o.no] = { no: o.no, adi: o.adi, soyadi: o.soyadi, cinsiyet: o.cinsiyet, puan: typeof y === 'number' ? y : null,
      yazili: s?.yazili ?? '', sozlu: s?.sozlu ?? '', sonuc: s ? sinavSonucu(s.yazili, s.sozlu, kural).sonuc : '', sinavdaVar: !!s };
  }
  const aktifId = new Map(siniflar.filter(s => s.aktif).map(s => [s.id, s.ad]));
  const yayin: Record<string, string> = {};
  ogrenciler.forEach(o => { if (o.sinifId && aktifId.has(o.sinifId)) yayin[o.no] = aktifId.get(o.sinifId)!; });
  return { a, plan, siniflar, ogrenciler, yerlestirme, bilgi, yayin, taslak, kural };
}

const taslakImzasi = (t: { no: string; sinif: string }[]) =>
  createHash('sha256').update(JSON.stringify(t.map(r => [r.no, r.sinif]))).digest('base64url');

/** Formu doldurmak için geçerli düzen: kayıtlı plan, yoksa aktif sınıflardan çıkarılır. */
function gecerliDuzen(v: Awaited<ReturnType<typeof veriTopla>>): Duzen {
  if (v.plan) return v.plan;
  const akt = v.siniflar.filter(s => s.aktif);
  const say = (t: string) => akt.filter(s => (s.tur || 'Karma') === t).length;
  const kiz = say('K'), erkek = say('E'), karma = say('Karma');
  return { duzen: kiz || erkek ? 'AYRI' : 'KARMA', kiz, erkek, karma, yontem: dagitimYontemi(v.a) };
}

function durumHesapla(v: Awaited<ReturnType<typeof veriTopla>>) {
  const nolar = Object.keys(v.bilgi);
  const hazirlik = nolar.filter(no => v.bilgi[no].sonuc !== SONUC.MUAF);
  const ozet = {
    aktif: nolar.length, muaf: nolar.length - hazirlik.length, yerlesecek: hazirlik.length,
    kiz: hazirlik.filter(no => v.bilgi[no].cinsiyet === 'K').length, erkek: hazirlik.filter(no => v.bilgi[no].cinsiyet === 'E').length,
    cinsiyetsiz: hazirlik.filter(no => !v.bilgi[no].cinsiyet).length, puansiz: hazirlik.filter(no => v.bilgi[no].puan == null).length,
    sonucuBelirsiz: hazirlik.filter(no => v.bilgi[no].sonuc === SONUC.BEKLIYOR || v.bilgi[no].sonuc === SONUC.HATA).length
  };
  const siniflarTanim = { K: v.yerlestirme.filter(s => s.tur === 'K').map(s => s.ad), E: v.yerlestirme.filter(s => s.tur === 'E').map(s => s.ad), Karma: v.yerlestirme.filter(s => s.tur === 'Karma').map(s => s.ad) };
  const temel = { ozet, siniflarTanim, sinifAdlari: v.yerlestirme.map(s => s.ad), duzen: gecerliDuzen(v), planKayitli: !!v.plan, yontem: dagitimYontemi(v.a),
    derssiz: v.yerlestirme.filter(s => !s.derslik).map(s => s.ad) };
  if (!v.taslak.length) return { ...temel, taslakVar: false as const };
  const d = taslakDenetle(v.taslak, v.bilgi, v.yerlestirme, v.yayin);
  const ogrHarita = new Map(v.ogrenciler.map(o => [o.no, o]));
  return {
    ...temel, taslakVar: true as const, imza: taslakImzasi(v.taslak), sabit: v.taslak.filter(r => r.sabit).length,
    sorunlar: d.sorunlar, hata: d.hata, uyari: d.uyari, metrik: d.metrik, degisim: d.degisim,
    satirlar: v.taslak.map(r => {
      const b = v.bilgi[r.no], o = ogrHarita.get(r.no);
      return { no: r.no, adi: b?.adi ?? o?.adi ?? '', soyadi: b?.soyadi ?? o?.soyadi ?? '', cinsiyet: b?.cinsiyet ?? '', yazili: b?.yazili ?? '', sozlu: b?.sozlu ?? '',
        sonuc: b ? b.sonuc || (b.sinavdaVar ? '' : 'Sınav listesinde yok') : 'Aktif değil', sinif: r.sinif, sabit: r.sabit, yayindaki: v.yayin[r.no] ?? '' };
    })
  };
}
export type TaslakDurumu = ReturnType<typeof durumHesapla>;

export async function taslakDurumu() {
  await yonetici();
  return durumHesapla(await veriTopla(vt()));
}

/** Taslağı oluşturur ya da yeniden dağıtır. sabitleriKoru: işaretli öğrencilerin yeri korunur. */
export async function taslakOlustur(sabitleriKoru: boolean, duzenHam?: Record<string, unknown>) {
  await yonetici();
  const sonuc = await vt().transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(7305)`);
    if (duzenHam) {
      const d = duzenDogrula(duzenHam);
      await ayarYaz('SINIF_DUZENI', d.duzen === 'KARMA' ? 'Karma' : 'Kız ve erkek ayrı', tx);
      await ayarYaz('KIZ_SINIF_SAYISI', String(d.kiz), tx);
      await ayarYaz('ERKEK_SINIF_SAYISI', String(d.erkek), tx);
      await ayarYaz('KARMA_SINIF_SAYISI', String(d.karma), tx);
      await ayarYaz('DAGITIM_YONTEMI', d.yontem === 'DENGELI' ? 'Dengeli' : 'Seviyeli', tx);
    }
    const v = await veriTopla(tx);
    if (!v.yerlestirme.length) throw new KullaniciHatasi('Tanımlı sınıf yok. Sınıf düzenini (kaç kız, kaç erkek sınıfı) belirleyin.');
    const ogr = Object.values(v.bilgi).filter(b => b.sonuc !== SONUC.MUAF);
    if (!ogr.length) throw new KullaniciHatasi('Yerleştirilecek öğrenci yok. Öğrenci listesini yükleyip sınav sonuçlarını kontrol edin.');
    const adlar = new Set(v.yerlestirme.map(s => s.ad));
    const sabit: Record<string, string> = {};
    if (sabitleriKoru) v.taslak.forEach(r => { if (r.sabit && r.sinif && adlar.has(r.sinif) && v.bilgi[r.no]) sabit[r.no] = r.sinif; });
    const girdi = ogr.map(b => ({ no: b.no, cinsiyet: b.cinsiyet, puan: b.puan }));
    const d = dagitimYontemi(v.a) === 'DENGELI' ? dagitDengeli(girdi, v.yerlestirme, sabit) : dagitSeviyeli(girdi, v.yerlestirme, sabit);
    const sinifSira = new Map(v.yerlestirme.map((s, i) => [s.ad, i]));
    const sirali = ogr.slice().sort((a, b) => (sinifSira.get(d.atama[a.no]) ?? 9999) - (sinifSira.get(d.atama[b.no]) ?? 9999) || (b.puan ?? -1) - (a.puan ?? -1) || a.no.localeCompare(b.no));
    await tx.delete(schema.sinifTaslagi);
    const satirlar = sirali.map((b, i) => ({ no: b.no, sinif: d.atama[b.no] ?? '', sabit: !!sabit[b.no], sira: i + 1 }));
    for (let i = 0; i < satirlar.length; i += 500) await tx.insert(schema.sinifTaslagi).values(satirlar.slice(i, i + 500));
    return {
      sayi: ogr.length, sabitKorunan: Object.keys(sabit).length,
      yerlesemeyen: d.yerlesemeyen.map(x => ({ no: x.no, ad: (v.bilgi[x.no].adi + ' ' + v.bilgi[x.no].soyadi).trim(), neden: x.neden })),
      durum: durumHesapla(await veriTopla(tx))
    };
  });
  await islemKaydet('Sınıf taslağı', `${sonuc.sayi} öğrenci dağıtıldı${sonuc.sabitKorunan ? ` (${sonuc.sabitKorunan} sabit korundu)` : ''}${sonuc.yerlesemeyen.length ? `, ${sonuc.yerlesemeyen.length} yerleştirilemedi` : ''}`);
  return sonuc;
}

/** Taslakta bir öğrencinin sınıfı ya da sabit işareti değiştirilir; sınıfı elle değişen öğrenci sabitlenir. */
export async function taslakSatirGuncelle(no: string, v: { sinif?: string; sabit?: boolean }) {
  await yonetici();
  const db = vt();
  const [r] = await db.select().from(schema.sinifTaslagi).where(eq(schema.sinifTaslagi.no, String(no)));
  if (!r) throw new KullaniciHatasi('Öğrenci taslakta bulunamadı. Taslağı yenileyin.');
  const set: Partial<typeof schema.sinifTaslagi.$inferInsert> = {};
  if (v.sinif !== undefined && v.sinif !== r.sinif) { set.sinif = String(v.sinif); set.sabit = !!v.sinif || r.sabit; }
  if (v.sabit !== undefined && set.sabit === undefined) set.sabit = !!v.sabit;
  if (Object.keys(set).length) await db.update(schema.sinifTaslagi).set(set).where(eq(schema.sinifTaslagi.no, r.no));
  return durumHesapla(await veriTopla(db));
}

type OgrenciGuncellemesi = { no: string; sinifId: number | null; sinifSira: number | null };
/** Çok sayıda öğrencinin sınıfını tek sorguyla günceller. */
async function siniflariYaz(db: Db, l: OgrenciGuncellemesi[]) {
  for (let i = 0; i < l.length; i += 500) {
    const p = l.slice(i, i + 500);
    const degerler = sql.join(p.map(x => sql`(${x.no}, ${x.sinifId}::integer, ${x.sinifSira}::integer)`), sql`, `);
    await db.execute(sql`update ogrenciler set sinif_id = v.sid, sinif_sira = v.sira, guncellendi = now() from (values ${degerler}) as v(no, sid, sira) where ogrenciler.no = v.no`);
  }
}

/** Taslağı yayınlar: sınıf listeleri taslaktan yeniden kurulur; her değişiklik öğrenci geçmişine yazılır. */
export async function taslakYayinla(imza: string) {
  await yonetici();
  const ozet = await vt().transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(7305)`);
    const v = await veriTopla(tx);
    const d = durumHesapla(v);
    if (!d.taslakVar) throw new KullaniciHatasi('Yayınlanacak taslak yok.');
    if (d.imza !== imza) throw new KullaniciHatasi('Taslak, siz inceledikten sonra değişti. Taslağı yenileyip değişiklikleri yeniden kontrol edin.');
    if (d.hata) throw new KullaniciHatasi(`Taslakta ${d.hata} hata var. Hatalar giderilmeden yayınlanamaz.`);

    // Düzen panelden belirlendiyse sınıf tablosuna işlenir; düzende olmayan aktif sınıflar kapatılır
    const kapanan: string[] = [];
    const planAnahtar = new Set(v.yerlestirme.map(s => sinifAnahtari(s.ad)));
    if (v.plan) {
      for (const s of v.yerlestirme) {
        const mevcut = v.siniflar.find(x => x.anahtar === sinifAnahtari(s.ad));
        if (mevcut) await tx.update(schema.siniflar).set({ tur: s.tur, aktif: true }).where(eq(schema.siniflar.id, mevcut.id));
        else await tx.insert(schema.siniflar).values({ ad: s.ad, anahtar: sinifAnahtari(s.ad), tur: s.tur, aktif: true });
      }
      for (const s of v.siniflar.filter(x => x.aktif && !planAnahtar.has(x.anahtar))) {
        await tx.update(schema.siniflar).set({ aktif: false }).where(eq(schema.siniflar.id, s.id));
        kapanan.push(s.ad);
      }
    }
    const siniflar = await tx.select().from(schema.siniflar);
    const idAd = new Map(siniflar.map(s => [s.anahtar, s.id]));

    // Yeni listeler: her sınıf alfabetik sıralanır
    const grup = new Map<string, YerlestirmeBilgisi[]>(v.yerlestirme.map(s => [s.ad, []]));
    v.taslak.forEach(r => { if (r.sinif && grup.has(r.sinif) && v.bilgi[r.no]) grup.get(r.sinif)!.push(v.bilgi[r.no]); });
    const yeniYer = new Map<string, { ad: string; sira: number }>();
    grup.forEach((l, ad) => l.sort(alfabetik).forEach((o, i) => yeniYer.set(o.no, { ad, sira: i + 1 })));
    const guncel: OgrenciGuncellemesi[] = [];
    const log: (typeof schema.ogrenciDegisiklikleri.$inferInsert)[] = [];
    const kaynak = 'Y-' + zamanKodu();
    const etkilenenId = new Set([...v.siniflar.filter(s => s.aktif).map(s => s.id), ...[...planAnahtar].map(k => idAd.get(k)!).filter(Boolean)]);
    for (const o of v.ogrenciler) {
      const y = yeniYer.get(o.no);
      const eskiAd = o.sinifId ? siniflar.find(s => s.id === o.sinifId)?.ad ?? '' : '';
      if (y) {
        const sid = idAd.get(sinifAnahtari(y.ad))!;
        if (o.sinifId !== sid || o.sinifSira !== y.sira) guncel.push({ no: o.no, sinifId: sid, sinifSira: y.sira });
        if (o.sinifId !== sid) log.push({ kaynak, ogrenciNo: o.no, adSoyad: (o.adi + ' ' + o.soyadi).trim(), alan: 'Sınıf', eski: eskiAd || '(sınıfsız)', yeni: y.ad });
      } else if (o.sinifId && etkilenenId.has(o.sinifId)) {
        guncel.push({ no: o.no, sinifId: null, sinifSira: null });
        log.push({ kaynak, ogrenciNo: o.no, adSoyad: (o.adi + ' ' + o.soyadi).trim(), alan: 'Sınıf', eski: eskiAd, yeni: '(sınıfsız)' });
      }
    }
    await siniflariYaz(tx, guncel);
    for (let i = 0; i < log.length; i += 500) await tx.insert(schema.ogrenciDegisiklikleri).values(log.slice(i, i + 500));
    const toplam = [...grup.values()].reduce((t, l) => t + l.length, 0);
    return { kaynak, ogrenci: toplam, sinif: v.yerlestirme.length, tasinan: d.degisim.tasinanSayi, yeni: d.degisim.yeniSayi, cikan: d.degisim.cikanSayi, kapanan };
  });
  await islemKaydet('Sınıf listeleri yayınlandı', `${ozet.kaynak}: ${ozet.ogrenci} öğrenci, ${ozet.sinif} sınıf; ${ozet.tasinan} öğrencinin sınıfı değişti, ${ozet.yeni} yeni yerleşti, ${ozet.cikan} listeden çıktı`);
  return { ozet, durum: await taslakDurumu() };
}

/* ---------- Tek tek sınıf değişikliği ---------- */
async function degisimDurumu(db: Db) {
  const v = await veriTopla(db);
  const aktif = v.siniflar.filter(s => s.aktif);
  const sinifBilgi = aktif.map(s => ({ ad: s.ad, tur: (s.tur || 'Karma') as Tur, n: 0, K: 0, E: 0 }));
  const sb = new Map(sinifBilgi.map(x => [x.ad, x]));
  const ogrenciler: { no: string; ad: string; cinsiyet: string; sinif: string }[] = [];
  for (const o of v.ogrenciler) {
    const ad = v.yayin[o.no];
    if (ad) {
      const x = sb.get(ad)!; x.n++; if (o.cinsiyet === 'K') x.K++; else if (o.cinsiyet === 'E') x.E++;
      ogrenciler.push({ no: o.no, ad: (o.adi + ' ' + o.soyadi).trim(), cinsiyet: o.cinsiyet, sinif: ad });
    } else if (v.bilgi[o.no] && v.bilgi[o.no].sonuc !== SONUC.MUAF) {
      ogrenciler.push({ no: o.no, ad: (o.adi + ' ' + o.soyadi).trim(), cinsiyet: o.cinsiyet, sinif: '' });
    }
  }
  const g = await db.select().from(schema.ogrenciDegisiklikleri)
    .where(and(eq(schema.ogrenciDegisiklikleri.alan, 'Sınıf'), like(schema.ogrenciDegisiklikleri.kaynak, 'S-%')))
    .orderBy(desc(schema.ogrenciDegisiklikleri.id)).limit(20);
  const tarih = (d: Date) => new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'short', timeStyle: 'short' }).format(d);
  return {
    siniflar: sinifBilgi, ogrenciler,
    gecmis: g.map(r => { const [islem, ...neden] = r.kaynak.split(' · '); return { id: r.id, tarih: tarih(r.tarih), islem, neden: neden.join(' · '), no: r.ogrenciNo, ad: r.adSoyad, eski: r.eski, yeni: r.yeni }; })
  };
}
export type DegisimDurumu = Awaited<ReturnType<typeof degisimDurumu>>;

export async function sinifDegisimVerisi() {
  await yonetici();
  return degisimDurumu(vt());
}

/** istek.degisiklikler: [{no, eski, yeni}] — eski: panelde görülen sınıf ('' = sınıfsız); yeni: hedef ('' = sınıftan çıkar). */
export async function sinifDegistir(istek: { degisiklikler: SinifDegisikligi[]; neden?: string }) {
  await yonetici();
  const liste = (istek?.degisiklikler ?? []).map(d => ({ no: String(d.no ?? '').trim(), eski: String(d.eski ?? '').trim(), yeni: String(d.yeni ?? '').trim() }));
  if (!liste.length) throw new KullaniciHatasi('Uygulanacak değişiklik yok.');
  if (liste.length > 500) throw new KullaniciHatasi('Tek seferde en fazla 500 değişiklik uygulanabilir.');
  const neden = String(istek?.neden ?? '').trim().slice(0, 200);
  const sonuc = await vt().transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(7305)`);
    const v = await veriTopla(tx);
    const aktif = v.siniflar.filter(s => s.aktif);
    if (!aktif.length) throw new KullaniciHatasi('Yayında sınıf listesi yok. Önce "Sınıf oluşturma" sekmesinden listeleri yayınlayın.');
    const ogrenci = new Map(v.ogrenciler.map(o => [o.no, { ...o, durum: o.kayitli || o.sinifId ? o.durum : 'silindi', muaf: v.bilgi[o.no]?.sonuc === SONUC.MUAF }]));
    const hatalar = degisiklikleriDenetle(liste, ogrenci, v.yayin, new Map(aktif.map(s => [s.ad, { tur: s.tur }])));
    if (hatalar.length) throw new KullaniciHatasi('Hiçbir değişiklik uygulanmadı:\n' + hatalar.join('\n'));

    // Etkilenen sınıfların yeni listeleri alfabetik yeniden sıralanır
    const tasinan = new Map(liste.map(d => [d.no, d]));
    const etkilenen = new Set(liste.flatMap(d => [d.eski, d.yeni]).filter(Boolean));
    const guncel: OgrenciGuncellemesi[] = [];
    for (const ad of etkilenen) {
      const s = aktif.find(x => x.ad === ad)!;
      const uyeler = v.ogrenciler.filter(o => (v.yayin[o.no] === ad && !tasinan.has(o.no)) || tasinan.get(o.no)?.yeni === ad).sort(alfabetik);
      uyeler.forEach((o, i) => guncel.push({ no: o.no, sinifId: s.id, sinifSira: i + 1 }));
    }
    liste.filter(d => !d.yeni).forEach(d => guncel.push({ no: d.no, sinifId: null, sinifSira: null }));
    await siniflariYaz(tx, guncel);

    // Taslakta sabitle (sonraki yeniden dağıtım bozmasın)
    const taslakta = new Set(v.taslak.map(r => r.no));
    const sonSira = v.taslak.reduce((m, r) => Math.max(m, r.sira), 0);
    let ek = 0;
    for (const d of liste) {
      if (taslakta.has(d.no)) await tx.update(schema.sinifTaslagi).set({ sinif: d.yeni, sabit: !!d.yeni }).where(eq(schema.sinifTaslagi.no, d.no));
      else if (d.yeni && v.taslak.length) await tx.insert(schema.sinifTaslagi).values({ no: d.no, sinif: d.yeni, sabit: true, sira: sonSira + ++ek });
    }

    const kaynak = 'S-' + zamanKodu() + (neden ? ' · ' + neden : '');
    await tx.insert(schema.ogrenciDegisiklikleri).values(liste.map(d => {
      const o = ogrenci.get(d.no)!;
      return { kaynak, ogrenciNo: d.no, adSoyad: (o.adi + ' ' + o.soyadi).trim(), alan: 'Sınıf', eski: d.eski || '(sınıfsız)', yeni: d.yeni || '(sınıfsız)' };
    }));
    return { uygulanan: liste.length, durum: await degisimDurumu(tx) };
  });
  await islemKaydet('Sınıf değişikliği', liste.map(d => `${d.no}: ${d.eski || 'sınıfsız'} → ${d.yeni || 'sınıfsız'}`).join('; ') + (neden ? ' | Neden: ' + neden : ''));
  return sonuc;
}

/** Öğrenci listesinden tek öğrencinin sınıfı değiştirildiğinde taslakta da sabitlenir (yonetim.ts kullanır). */
export async function taslaktaSabitle(db: Db, no: string, sinifAd: string) {
  const [r] = await db.select().from(schema.sinifTaslagi).where(eq(schema.sinifTaslagi.no, no));
  if (r) await db.update(schema.sinifTaslagi).set({ sinif: sinifAd, sabit: !!sinifAd }).where(eq(schema.sinifTaslagi.no, no));
  else if (sinifAd) {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.sinifTaslagi);
    if (n) await db.insert(schema.sinifTaslagi).values({ no, sinif: sinifAd, sabit: true, sira: n + 1 });
  }
}
