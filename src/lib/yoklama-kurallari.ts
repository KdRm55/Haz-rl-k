/**
 * Yoklama ve devamsızlık kuralları (saf, test edilebilir). Kaynak: Apps Script Yoklama.gs.
 * - Her yoklama bir ders oturumudur (tarih + sınıf + saat + ders) ve 2 ders saatidir (sirküdeki "1. DERS / 2. DERS").
 * - Gelmeyenler ve izinliler öğrenci numarasıyla tutulur.
 * - Devamsızlık sınırı ders bazındadır: haftalık ders saati × dönem hafta sayısı × sınır yüzdesi (aşağı yuvarlanır).
 */
import { KullaniciHatasi } from './hata';
import { basNorm, sinifAnahtari, subeEslestir, TR_GUN_SIRA } from './metin';

export const YOK_SAAT = 2;   // bir oturum = 2 ders saati
export const YOK_DURUM = { YAPILDI: 'Yapıldı', YAPILMADI: 'Yapılmadı' } as const;
export const YOK_TUR = { PROGRAM: 'Program', TELAFI: 'Telafi' } as const;
export type YokDurum = (typeof YOK_DURUM)[keyof typeof YOK_DURUM];
export type YokTur = (typeof YOK_TUR)[keyof typeof YOK_TUR];
export type YokKaynak = 'Manuel' | 'Tarama' | 'Karma';
export const GUN_ADLARI = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
export const QR_ON_EK = 'HZY1:';
export const EVRAK_ALFABE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // karışan harfler (I, O, 0, 1) yok

/* ---------- Tarih (takvim günleri UTC üzerinden; saat dilimi kayması olmaz) ---------- */
export const isoGecerli = (s: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? '')) && !isNaN(Date.parse(String(s)));
export const isoTr = (iso: string) => { const p = String(iso).split('-'); return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : ''; };
export function trIso(tr: string) {
  const m = String(tr || '').trim().match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  return m ? m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0') : '';
}
const isoGun = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const gunIso = (d: Date) => d.toISOString().slice(0, 10);
export const isoEkle = (iso: string, gun: number) => gunIso(new Date(isoGun(iso).getTime() + gun * 86400000));
export const gunAdi = (iso: string) => GUN_ADLARI[(isoGun(iso).getUTCDay() + 6) % 7];
/** Haftanın pazartesisi. */
export const pazartesi = (iso: string) => isoEkle(iso, -((isoGun(iso).getUTCDay() + 6) % 7));

/** "1, 2;3 2" → ["1", "2", "3"] (tekrarsız, sırası korunur). */
export function noListesi(v: unknown): string[] {
  const dizi = Array.isArray(v) ? v.map(String) : String(v ?? '').split(/[,;\s]+/);
  return [...new Set(dizi.map(x => x.trim()).filter(Boolean))];
}

export function oturumAnahtari(iso: string, sinifAd: string, saat: string, ders: string) {
  return [iso, sinifAnahtari(sinifAd), basNorm(saat).replace(/\s+/g, ''), basNorm(ders)].join('|');
}

/** Basit özet (FNV-1a, 2 × 32 bit): evrak yeniden basılınca aynı numarayı alsın diye. */
export function ozet(s: string) {
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

/** 8 karakterlik evrak numarası; rastgele: 0 ≤ r < 1 üreten fonksiyon (sunucuda kriptografik). */
export function evrakNoUret(mevcut: Set<string>, rastgele: () => number) {
  for (let d = 0; d < 50; d++) {
    let s = '';
    for (let i = 0; i < 8; i++) s += EVRAK_ALFABE.charAt(Math.floor(rastgele() * EVRAK_ALFABE.length));
    if (!mevcut.has(s)) { mevcut.add(s); return s; }
  }
  throw new KullaniciHatasi('Evrak numarası üretilemedi. Tekrar deneyin.');
}

/* ---------- Ayarlar ---------- */
export type YokAyar = { yuzde: number; hafta: number; baslangic: string };   // baslangic: iso ya da ''
export function yokAyarCoz(a: Record<string, string>): YokAyar {
  const ham = (k: string, v: string) => (a[k] == null || a[k] === '' ? v : a[k]);
  const yuzde = parseFloat(ham('YOKLAMA_SINIR_YUZDE', '20').replace(',', '.'));
  const hafta = parseInt(ham('YOKLAMA_DONEM_HAFTA', '14'), 10);
  return { yuzde: isNaN(yuzde) || yuzde < 0 ? 0 : yuzde, hafta: isNaN(hafta) || hafta < 0 ? 0 : hafta, baslangic: trIso(a.YOKLAMA_DONEM_BASLANGIC || '') };
}
export const sinirHesapla = (haftalikSaat: number, ayar: YokAyar) => {
  const toplam = haftalikSaat * (ayar.hafta || 0);
  return toplam && ayar.yuzde ? Math.floor(toplam * ayar.yuzde / 100 + 1e-9) : null;
};

/* ---------- Program ---------- */
export type ProgramSatiri = { hoca: string; ders: string; gun: string; saat: string; sube: string; derslik: string };
export type SinifOzet = { ad: string; anahtar: string; derslik: string };
export type ProgramOturumu = { anahtar: string; iso: string; tarih: string; gun: string; saat: string; ders: string; sinif: string; hoca: string; derslik: string; tur: YokTur };

/** Programdan, pazartesisi verilen haftanın oturumları. filtre: hoca ve/veya sınıf adı. */
export function programOturumlari(haftaIso: string, program: ProgramSatiri[], siniflar: SinifOzet[], filtre: { hoca?: string; sinif?: string } = {}): ProgramOturumu[] {
  const hn = filtre.hoca ? basNorm(filtre.hoca) : '';
  const out: ProgramOturumu[] = [];
  for (const p of program) {
    if (hn && basNorm(p.hoca) !== hn) continue;
    const off = TR_GUN_SIRA[basNorm(p.gun)];
    if (off == null) continue;
    const s = subeEslestir(p.sube, siniflar);
    if (!s || (filtre.sinif && s.ad !== filtre.sinif)) continue;
    const iso = isoEkle(haftaIso, off);
    out.push({ anahtar: oturumAnahtari(iso, s.ad, p.saat, p.ders), iso, tarih: isoTr(iso), gun: p.gun, saat: p.saat, ders: p.ders,
      sinif: s.ad, hoca: p.hoca, derslik: p.derslik || s.derslik || '', tur: YOK_TUR.PROGRAM });
  }
  return out.sort((a, b) => a.iso.localeCompare(b.iso) || a.saat.localeCompare(b.saat, 'tr') || a.sinif.localeCompare(b.sinif, 'tr'));
}

/** Bir oturum programda var mı (program dışı ders "Telafi" olarak girilmeli). */
export function programdaVar(iso: string, sinif: SinifOzet, saat: string, ders: string, program: ProgramSatiri[]) {
  const gun = basNorm(gunAdi(iso)), anahtar = oturumAnahtari(iso, sinif.ad, saat, ders);
  return program.some(r => subeEslestir(r.sube, [sinif]) && basNorm(r.gun) === gun && oturumAnahtari(iso, sinif.ad, r.saat, r.ders) === anahtar);
}

/** Bir sınıfın programındaki haftalık ders saatleri: { DERS_NORM: saat }. */
export function haftalikDersSaatleri(sinifAd: string, program: ProgramSatiri[], siniflar: SinifOzet[]) {
  const out: Record<string, number> = {};
  for (const p of program) {
    const s = subeEslestir(p.sube, siniflar);
    if (!s || s.ad !== sinifAd || TR_GUN_SIRA[basNorm(p.gun)] == null || !p.ders) continue;
    const k = basNorm(p.ders);
    out[k] = (out[k] || 0) + YOK_SAAT;
  }
  return out;
}

/* ---------- Kayıt ---------- */
export type YoklamaKaydi = {
  anahtar: string; iso: string; saat: string; ders: string; sinif: string; hoca: string; tur: YokTur; durum: YokDurum;
  liste: string[]; yok1: string[]; yok2: string[]; izinli: string[]; kaynak: string; aciklama: string;
};

/** Gelmeyen (izinsiz) öğrenci sayısı. */
export function gelmeyenSayisi(k: Pick<YoklamaKaydi, 'yok1' | 'yok2' | 'izinli'>) {
  return new Set([...k.yok1, ...k.yok2].filter(n => !k.izinli.includes(n))).size;
}

export type YoklamaGirdisi = {
  liste: string[]; yok1: string[]; yok2: string[]; izinli: string[]; durum: YokDurum; kaynak: 'Manuel' | 'Tarama'; aciklama: string; birlestir: boolean;
};

/**
 * Kaydedilecek listeler. İzni yalnızca yönetim değiştirir (hocanın gönderdiği izinli listesi yok sayılır, mevcut korunur).
 * birlestir: yalnızca girdideki öğrenciler güncellenir; kayıttaki diğer öğrenciler korunur
 * (çok sayfalı sirkünün sayfaları ayrı ayrı taranabilsin diye).
 */
export function yoklamaBirlestir(g: YoklamaGirdisi, mevcut: Pick<YoklamaKaydi, 'liste' | 'yok1' | 'yok2' | 'izinli' | 'durum' | 'kaynak' | 'aciklama'> | null, admin: boolean) {
  const liste = noListesi(g.liste);
  if (!liste.length) throw new KullaniciHatasi('Öğrenci listesi boş.');
  const icinde = (n: string) => liste.includes(n);
  let yok1 = noListesi(g.yok1).filter(icinde), yok2 = noListesi(g.yok2).filter(icinde);
  let izinli = admin ? noListesi(g.izinli).filter(icinde) : (mevcut ? mevcut.izinli.filter(icinde) : []);
  if (g.durum === YOK_DURUM.YAPILMADI) { yok1 = []; yok2 = []; izinli = []; }
  let tumListe = liste, kaynak: string = g.kaynak, aciklama = g.aciklama;
  if (g.birlestir && mevcut && g.durum === YOK_DURUM.YAPILDI) {
    // "ders yapılmadı" kaydının üzerine tarama yazılırsa ders yapılmış sayılır
    const disari = (n: string) => !icinde(n);
    const korunan = mevcut.durum === YOK_DURUM.YAPILMADI ? { y1: [], y2: [], iz: [] } as Record<string, string[]>
      : { y1: mevcut.yok1.filter(disari), y2: mevcut.yok2.filter(disari), iz: mevcut.izinli.filter(disari) };
    tumListe = noListesi([...mevcut.liste, ...liste]);
    yok1 = noListesi([...korunan.y1, ...yok1]);
    yok2 = noListesi([...korunan.y2, ...yok2]);
    izinli = noListesi([...korunan.iz, ...izinli]);
    if (mevcut.kaynak && mevcut.kaynak !== g.kaynak) kaynak = 'Karma';
    if (!aciklama) aciklama = mevcut.aciklama || '';
  }
  return { liste: tumListe, yok1, yok2, izinli, kaynak, aciklama: aciklama.slice(0, 500) };
}

/* ---------- Devamsızlık ---------- */
export type DersDevamsizligi = {
  ders: string; yokSaat: number; izinliSaat: number; oturum: number; haftalikSaat: number; toplamSaat: number; sinir: number | null;
  durum: '' | 'yakin' | 'asti';
  /** y1, y2: o gün 1. / 2. derste yok (izinliyse izinli olduğu saat); ders yapılmadıysa ikisi de false. */
  kayitlar: { iso: string; tarih: string; saat: string; durum: 'yok' | 'geldi' | 'izinli' | 'yapilmadi'; yokSaat: number; tur: string; y1: boolean; y2: boolean }[];
};

/** Öğrencinin ders ders devamsızlığı. haftalik: haftalikDersSaatleri() (sınır için). */
export function devamsizlikHesapla(no: string, oturumlar: YoklamaKaydi[], ayar: YokAyar, haftalik: Record<string, number> | null): DersDevamsizligi[] {
  const dersler: Record<string, Omit<DersDevamsizligi, 'haftalikSaat' | 'toplamSaat' | 'sinir' | 'durum'>> = {};
  for (const k of oturumlar) {
    if (ayar.baslangic && k.iso < ayar.baslangic) continue;
    const izinli = k.izinli.includes(no), y1 = k.yok1.includes(no), y2 = k.yok2.includes(no);
    if (!k.liste.includes(no) && !y1 && !y2 && !izinli) continue;
    const dk = basNorm(k.ders);
    const d = (dersler[dk] ??= { ders: k.ders, yokSaat: 0, izinliSaat: 0, oturum: 0, kayitlar: [] });
    let durum: DersDevamsizligi['kayitlar'][number]['durum'], saat = 0;
    if (k.durum === YOK_DURUM.YAPILMADI) durum = 'yapilmadi';
    else {
      d.oturum++;
      saat = (y1 ? 1 : 0) + (y2 ? 1 : 0);
      if (saat && izinli) { d.izinliSaat += saat; durum = 'izinli'; }
      else if (izinli) durum = 'geldi';
      else { d.yokSaat += saat; durum = saat ? 'yok' : 'geldi'; }
    }
    const yapildi = durum !== 'yapilmadi';
    d.kayitlar.push({ iso: k.iso, tarih: isoTr(k.iso), saat: k.saat, durum, yokSaat: saat, tur: k.tur, y1: yapildi && y1, y2: yapildi && y2 });
  }
  return Object.entries(dersler).map(([dk, d]) => {
    const hs = haftalik ? haftalik[dk] || 0 : 0;
    const sinir = sinirHesapla(hs, ayar);
    d.kayitlar.sort((a, b) => b.iso.localeCompare(a.iso) || b.saat.localeCompare(a.saat, 'tr'));
    const durum: DersDevamsizligi['durum'] = sinir == null ? '' : d.yokSaat > sinir ? 'asti' : d.yokSaat > 0 && d.yokSaat >= Math.ceil(sinir * 0.75) ? 'yakin' : '';
    return { ...d, haftalikSaat: hs, toplamSaat: hs * (ayar.hafta || 0), sinir, durum };
  }).sort((a, b) => a.ders.localeCompare(b.ders, 'tr'));
}

/** Programda olup bugüne kadar yoklaması girilmemiş oturumlar (en fazla 60 hafta). */
export function eksikOturumlar(program: ProgramSatiri[], siniflar: SinifOzet[], girilen: Set<string>, ayar: YokAyar, bugun: string) {
  const bas = ayar.baslangic ? pazartesi(ayar.baslangic) : isoEkle(pazartesi(bugun), -28);
  const eksik: ProgramOturumu[] = [];
  for (let w = 0; w < 60; w++) {
    const ws = isoEkle(bas, 7 * w);
    if (ws > bugun) break;
    for (const o of programOturumlari(ws, program, siniflar)) {
      if (o.iso > bugun || (ayar.baslangic && o.iso < ayar.baslangic) || girilen.has(o.anahtar)) continue;
      eksik.push(o);
    }
  }
  return { baslangic: bas, eksik };
}

/**
 * Tek öğrencinin bir yoklamadaki 1. ve 2. ders durumunu değiştirir (hoca ekranı → öğrenci arama).
 * Listede yoksa listeye eklenir; izinli işareti ve diğer öğrenciler olduğu gibi kalır.
 */
export function ogrenciYoklamaDegistir(k: Pick<YoklamaKaydi, 'liste' | 'yok1' | 'yok2'>, no: string, yok1: boolean, yok2: boolean) {
  const ayarla = (l: string[], var_: boolean) => (var_ ? (l.includes(no) ? l : [...l, no]) : l.filter(n => n !== no));
  return { liste: k.liste.includes(no) ? k.liste : [...k.liste, no], yok1: ayarla(k.yok1, yok1), yok2: ayarla(k.yok2, yok2) };
}

/**
 * Sınıf değiştiren öğrenci için yeni sınıfın bir oturumuna karşılık gelen eski sınıf kaydı: aynı haftanın aynı sıradaki dersi
 * (sınıfların ders günleri farklı olduğundan tarih eşleşmez; ör. A'nın haftadaki 1. dersi → B'nin haftadaki 1. dersi).
 */
export function tasinanKayit<T extends { iso: string; saat: string }>(hedef: T, hedefler: T[], eskiler: T[]): T | null {
  const h = pazartesi(hedef.iso);
  const sirala = (l: T[]) => l.filter(x => pazartesi(x.iso) === h).sort((a, b) => a.iso.localeCompare(b.iso) || a.saat.localeCompare(b.saat, 'tr'));
  const i = sirala(hedefler).indexOf(hedef);
  return i < 0 ? null : sirala(eskiler)[i] ?? null;
}
