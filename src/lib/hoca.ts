/** Hoca ekranının sunucu işlemleri — Code.gs getTeachers … getManualAttendance karşılığı. */
import 'server-only';
import { asc, eq, isNotNull } from 'drizzle-orm';
import { vt, schema } from '@/db';
import { KullaniciHatasi } from './hata';
import { basNorm, subeEslestir, TR_GUN_SIRA } from './metin';
import { hocaKapsami, islemKaydet, oturumGerekli, type Rol } from './oturum';
import {
  benzersiz, haftaBasi, haftalikSirku, tarihTR, telafiSirkusu,
  type HaftalikSirku, type SinifOgrencili, type TelafiGirdisi, type TopluSirku
} from './sirku-kurallari';

const HOCA_ROLLERI: Rol[] = ['admin', 'hoca'];

export async function program() {
  return vt().select().from(schema.hocaProgrami).orderBy(asc(schema.hocaProgrami.sira), asc(schema.hocaProgrami.id));
}

/** Aktif sınıflar, öğrencileri sınıf listesindeki sırayla. */
export async function aktifSiniflar(): Promise<SinifOgrencili[]> {
  const db = vt();
  const [siniflar, ogrenciler] = await Promise.all([
    db.select().from(schema.siniflar).where(eq(schema.siniflar.aktif, true)),
    db.select({ no: schema.ogrenciler.no, adi: schema.ogrenciler.adi, soyadi: schema.ogrenciler.soyadi, sinifId: schema.ogrenciler.sinifId })
      .from(schema.ogrenciler).where(isNotNull(schema.ogrenciler.sinifId))
      .orderBy(asc(schema.ogrenciler.sinifSira), asc(schema.ogrenciler.no))
  ]);
  return siniflar
    .sort((a, b) => a.anahtar.localeCompare(b.anahtar, 'tr'))
    .map(s => ({
      ad: s.ad, anahtar: s.anahtar, derslik: s.derslik,
      ogrenciler: ogrenciler.filter(o => o.sinifId === s.id).map(o => ({ no: o.no, adi: o.adi, soyadi: o.soyadi }))
    }));
}

/** Hesap oluşturma ekranı için ders programındaki öğretim elemanı adları (giriş gerekmez). */
export async function hocaAdlari() {
  return benzersiz((await program()).map(x => x.hoca)).sort((a, b) => a.localeCompare(b, 'tr'));
}

export type HocaBaslangic = { rol: Rol; hocalar: string[]; saatler: string[]; dersler: string[]; subeler: { key: string; name: string }[] };

/** Ekran açılışında gereken listeler (eski getTeachers + getTimes + getLessons + getSubeler tek çağrıda). */
export async function hocaBaslangic(): Promise<HocaBaslangic> {
  const o = await oturumGerekli(HOCA_ROLLERI);
  const [p, siniflar] = await Promise.all([program(), vt().select().from(schema.siniflar).where(eq(schema.siniflar.aktif, true))]);
  const tum = benzersiz(p.map(x => x.hoca)).sort((a, b) => a.localeCompare(b, 'tr'));
  return {
    rol: o.tur,
    // Hoca yalnızca kendi adını görür (programda henüz yoksa da kendi adıyla telafi evrakı hazırlayabilir)
    hocalar: o.tur === 'hoca' ? [tum.find(h => basNorm(h) === basNorm(o.hocaAdi)) ?? o.hocaAdi].filter(Boolean) : tum,
    saatler: benzersiz(p.map(x => x.saat)).sort(),
    dersler: benzersiz(p.map(x => x.ders)).sort((a, b) => a.localeCompare(b, 'tr')),
    subeler: siniflar.sort((a, b) => a.anahtar.localeCompare(b.anahtar, 'tr')).map(s => ({ key: s.anahtar, name: s.ad }))
  };
}

export async function hocaHaftalik(teacher: string, haftaISO: string): Promise<HaftalikSirku> {
  const o = await oturumGerekli(HOCA_ROLLERI);
  if (!teacher?.trim()) throw new KullaniciHatasi('Öğretim elemanı seçilmedi.');
  hocaKapsami(o, teacher);
  const bas = haftaBasi(haftaISO);
  const [siniflar, p] = await Promise.all([aktifSiniflar(), program()]);
  if (!siniflar.length) throw new KullaniciHatasi('Hiç aktif sınıf yok. Yönetim panelinden sınıfları kontrol edin.');
  return { teacher: teacher.trim(), weekStart: tarihTR(bas), sections: haftalikSirku(teacher, bas, siniflar, p) };
}

/** Tüm öğretim elemanlarının haftalık sirküleri; yalnızca o hafta dersi olan şubeler döner. */
export async function topluHaftalik(haftaISO: string): Promise<TopluSirku> {
  await oturumGerekli(['admin']);
  const bas = haftaBasi(haftaISO);
  const [siniflar, p] = await Promise.all([aktifSiniflar(), program()]);
  if (!siniflar.length) throw new KullaniciHatasi('Hiç aktif sınıf yok. Yönetim panelinden sınıfları kontrol edin.');
  const hocalar = benzersiz(p.map(x => x.hoca)).sort((a, b) => a.localeCompare(b, 'tr'));
  const out: TopluSirku['hocalar'] = [];
  for (const h of hocalar) {
    const sec = haftalikSirku(h, bas, siniflar, p);
    const dolu = Object.fromEntries(Object.entries(sec).filter(([, v]) => Object.keys(v.dates).length));
    if (Object.keys(dolu).length) out.push({ teacher: h, sections: dolu });
  }
  await islemKaydet('Toplu imza sirküsü', tarihTR(bas) + ' haftası, ' + out.length + ' öğretim elemanı');
  return { weekStart: tarihTR(bas), hocalar: out };
}

export async function telafi(teacher: string, veri: Record<string, TelafiGirdisi>): Promise<HaftalikSirku> {
  const o = await oturumGerekli(HOCA_ROLLERI);
  if (!teacher?.trim()) throw new KullaniciHatasi('Öğretim elemanı seçilmedi.');
  hocaKapsami(o, teacher);
  return telafiSirkusu(teacher, veri ?? {}, await aktifSiniflar());
}

export type HocaProgramSatiri = { gun: string; saat: string; ders: string; sube: string; derslik: string };

/** Bir öğretim elemanının haftalık ders programı ("Ders programım" sekmesi). */
export async function hocaProgrami(teacher: string): Promise<{ teacher: string; program: HocaProgramSatiri[] }> {
  const o = await oturumGerekli(HOCA_ROLLERI);
  if (!teacher?.trim()) throw new KullaniciHatasi('Öğretim elemanı seçilmedi.');
  hocaKapsami(o, teacher);
  const [p, siniflar] = await Promise.all([program(), vt().select().from(schema.siniflar).where(eq(schema.siniflar.aktif, true))]);
  const hn = basNorm(teacher);
  const out = p
    .filter(x => basNorm(x.hoca) === hn && TR_GUN_SIRA[basNorm(x.gun)] != null)
    .map(x => {
      const s = subeEslestir(x.sube, siniflar);
      return { sira: TR_GUN_SIRA[basNorm(x.gun)], gun: x.gun, saat: x.saat, ders: x.ders, sube: s ? s.ad : x.sube, derslik: x.derslik || s?.derslik || '' };
    })
    .sort((a, b) => a.sira - b.sira || a.saat.localeCompare(b.saat, 'tr'))
    .map(({ sira: _s, ...x }) => x);
  return { teacher: teacher.trim(), program: out };
}
