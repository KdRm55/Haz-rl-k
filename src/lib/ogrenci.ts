/** Öğrenci sorgulama — Apps Script ogrenciAra / ogrenciAraIc_ karşılığı. */
import 'server-only';
import { asc, desc, eq } from 'drizzle-orm';
import { vt, schema } from '@/db';
import { soyadMaskele } from './metin';
import { puanGoster, SONUC, sinavKurali, sinavSonucu } from './sinav';
import {
  dogrulamaEslesir, duyuruGecerli, duyuruHedefUyar, gorunum, gorunumUygula, HEDEF, ogrenciAyarlari, sinifProgrami
} from './ogrenci-kurallari';
import { basNorm } from './metin';
import type { Duyuru, SinavBilgisi, SorguSonucu } from './tipler';
import { dsOgrenciBilgi } from './donem-sinav';
import { bagliYerBulucu, kayitsizAd, syOgrenciBilgi } from './sinav-yeri';
import { yoklamaOgrenci } from './yoklama';

const TZ = 'Europe/Istanbul';
const bugunISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const tarihTR = (d: Date) => new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);

/** db: bir veritabanı işleminin içinden çağrılıyorsa o işlemin bağlantısı verilmeli (tek bağlantılı havuzda kilitlenmeyi önler). */
export async function ayarlarOku(db: Pick<ReturnType<typeof vt>, 'select'> = vt()): Promise<Record<string, string>> {
  const satirlar = await db.select().from(schema.ayarlar);
  return Object.fromEntries(satirlar.map(s => [s.anahtar.trim().toUpperCase(), s.deger.trim()]));
}

export async function ogrenciEkranAyarlari() {
  return ogrenciAyarlari(await ayarlarOku());
}

async function yayindakiDuyurular() {
  const bugun = bugunISO();
  const liste = await vt().select().from(schema.duyurular).orderBy(desc(schema.duyurular.olusturma), desc(schema.duyurular.id));
  return liste.filter(d => (d.baslik || d.metin) && duyuruGecerli(d, bugun));
}
const duyuruCikti = (d: typeof schema.duyurular.$inferSelect): Duyuru => ({ baslik: d.baslik, metin: d.metin, tarih: tarihTR(d.olusturma) });

/** Sorgulama ekranı açılışındaki genel duyurular (giriş gerekmez). */
export async function genelDuyurular(): Promise<Duyuru[]> {
  return (await yayindakiDuyurular()).filter(d => basNorm(d.kime) === basNorm(HEDEF.HERKES)).slice(0, 10).map(duyuruCikti);
}

async function ogrenciDuyurulari(tur: 'sinif' | 'muaf' | 'bekliyor', sinif: string): Promise<Duyuru[]> {
  return (await yayindakiDuyurular())
    .filter(d => basNorm(d.kime) !== basNorm(HEDEF.HERKES) && duyuruHedefUyar(d.kime, tur, sinif))
    .slice(0, 10).map(duyuruCikti);
}

async function sinavBilgisi(no: string, a: Record<string, string>): Promise<SinavBilgisi | null> {
  const [s] = await vt().select().from(schema.sinavSonuclari).where(eq(schema.sinavSonuclari.no, no));
  if (!s) return null;
  const k = sinavKurali(a);
  const x = sinavSonucu(s.yazili, s.sozlu, k);
  const out: SinavBilgisi = { yer: s.yer, yayinda: k.yayinda };
  if (k.yayinda && x.sonuc !== SONUC.HATA) {
    Object.assign(out, { yazili: puanGoster(s.yazili), sozlu: puanGoster(s.sozlu), ortalama: x.ortalama, sonuc: x.sonuc, aciklama: x.aciklama });
  }
  return out.yer || out.sonuc ? out : null;
}

/**
 * dogrulamaAtla yalnızca sunucu içinden kullanılır (yönetim önizlemesi, öğrenci hesabı).
 * hesap: öğrenci kendi hesabıyla girmiştir; ad soyad kısaltılmaz, devamsızlık gösterilir.
 */
export async function ogrenciAra(numaraHam: string, dogrulamaHam: string, dogrulamaAtla = false, hesap = false): Promise<SorguSonucu> {
  const numara = String(numaraHam || '').replace(/\s+/g, '');
  const girilen = String(dogrulamaHam || '').trim();
  if (!numara) return { bulundu: false, mesaj: 'Öğrenci numaranızı yazın.' };

  const db = vt();
  const a = await ayarlarOku();
  const ay = ogrenciAyarlari(a);
  const genelHata = ay.dogrulama
    ? 'Öğrenci numarası ile ' + ay.etiket.toLocaleLowerCase('tr-TR') + ' eşleşmedi. Bilgileri kontrol edip tekrar deneyin.'
    : 'Bu numaraya ait öğrenci bulunamadı. Numarayı kontrol edin; sorun sürerse idareye başvurun.';
  const dogrula = ay.dogrulama && !dogrulamaAtla;
  if (dogrula && !girilen) return { bulundu: false, mesaj: ay.etiket + ' alanını doldurun.' };

  const [[o], sy] = await Promise.all([db.select().from(schema.ogrenciler).where(eq(schema.ogrenciler.no, numara)), syOgrenciBilgi(db, numara)]);
  // Sistemde kaydı olmayan (ya da aktif olmayan) öğrenci: yalnızca yayındaki bir listede varsa sınav yeri döner
  const sinavYeriSonucu = (): SorguSonucu => sy.yerler.length
    ? gorunumUygula({ bulundu: true, tur: 'sinavyeri', numara, adSoyad: kayitsizAd(sy.ad, sy.soyadi), maskeli: true, sinav: null, duyurular: [], gorunum: gorunum(a), sinavYerleri: sy.yerler })
    : { bulundu: false, mesaj: genelHata };
  if (!o) return sinavYeriSonucu();

  const tamAd = hesap || ay.dogrulama;
  const adSoyad = tamAd ? (o.adi + ' ' + o.soyadi).trim() : (o.adi + ' ' + soyadMaskele(o.soyadi)).trim();
  const ortak = { bulundu: true as const, numara, adSoyad, maskeli: !tamAd, gorunum: gorunum(a), sinavYerleri: sy.yerler };

  // 1) Bir sınıfa yerleştirilmiş öğrenci (sınıf aktifse)
  const sinif = o.sinifId != null
    ? (await db.select().from(schema.siniflar).where(eq(schema.siniflar.id, o.sinifId)))[0]
    : undefined;
  if (sinif?.aktif) {
    const kayit = ay.kaynak === 'proliz' ? o.tc4 : o.dogrulamaDegeri;
    if (dogrula && !dogrulamaEslesir(kayit, girilen, ay.hane)) return { bulundu: false, mesaj: genelHata };
    const [siniflar, program, sinav, duyurular, donemSinavlari, devamsizlik] = await Promise.all([
      db.select().from(schema.siniflar).where(eq(schema.siniflar.aktif, true)),
      db.select().from(schema.hocaProgrami).orderBy(asc(schema.hocaProgrami.sira)),
      sinavBilgisi(numara, a),
      ogrenciDuyurulari('sinif', sinif.ad),
      dsOgrenciBilgi(db, numara, bagliYerBulucu(sy.yerler)).catch(e => { console.error(e); return null; }),
      // Devamsızlık yalnızca kimliği doğrulanmış öğrenciye: kendi hesabıyla girmiş ya da doğrulama açık
      tamAd ? yoklamaOgrenci(db, a, numara, sinif.ad).catch(e => { console.error(e); return null; }) : null
    ]);
    return gorunumUygula({
      ...ortak, tur: 'sinif', sinif: sinif.ad, derslik: sinif.derslik || '-', sinav, duyurular, donemSinavlari, devamsizlik,
      program: sinifProgrami(sinif.ad, siniflar, program)
    });
  }

  // 2) Kayıtlı ama henüz sınıfı olmayan öğrenci (sınav bekleyen, muaf ya da yerleştirme bekleyen)
  if (o.kayitli && o.durum === 'aktif') {
    if (dogrula && (ay.kaynak !== 'proliz' || !dogrulamaEslesir(o.tc4, girilen, ay.hane))) return { bulundu: false, mesaj: genelHata };
    const sinav = await sinavBilgisi(numara, a);
    const tur = sinav?.sonuc === SONUC.MUAF ? 'muaf' : 'bekliyor';
    return gorunumUygula({ ...ortak, tur, sinav, duyurular: await ogrenciDuyurulari(tur, '') });
  }
  return sinavYeriSonucu();
}
