/**
 * Google E-Tablo → PostgreSQL tek seferlik aktarım.
 *
 * Kullanım:
 *   1) E-tabloda Dosya → İndir → Microsoft Excel (.xlsx)
 *   2) npm run aktar -- "C:\yol\Hazirlik.xlsx"            (önce yalnızca rapor; hiçbir şey yazılmaz)
 *   3) npm run aktar -- "C:\yol\Hazirlik.xlsx" --yaz      (veritabanındaki aktarılan tabloları siler ve yeniden doldurur)
 *
 * Erişim kodları aktarılmaz (yeni sistemde kişisel hesaplar var): ilk yönetici `npm run yonetici` ile eklenir.
 */
import 'dotenv/config';
import ExcelJS from 'exceljs';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as s from '../src/db/schema';
import { basNorm, cinsiyetKod, evetMi, hazirlikMi, sinifAnahtari, sinifTuru } from '../src/lib/metin';
import { programTablosuOku } from '../src/lib/program-kurallari';
import { isoGecerli, noListesi, oturumAnahtari, trIso } from '../src/lib/yoklama-kurallari';

const dosya = process.argv.slice(2).find(a => !a.startsWith('--'));
const yaz = process.argv.includes('--yaz');
if (!dosya) { console.error('Kullanım: npm run aktar -- "<dosya.xlsx>" [--yaz]'); process.exit(1); }

const SAYFA = {
  PROGRAM: 'Hoca Programları', SINIFLAR: 'Sınıflar', YETKILILER: 'Yetkililer', AYARLAR: 'Ayarlar', LOG: 'İşlem Kaydı',
  OGRENCILER: 'Öğrenciler', SINAV: 'Sınav Sonuçları', DUYURU: 'Duyurular', YOKLAMA: 'Yoklama', EVRAK: 'Yoklama Evrakları'
};
const BASLIK_ALIAS = {
  no: ['OGRENCI NO', 'OGRENCI NUMARASI', 'OGR NO', 'OGRNO', 'NUMARA', 'NO'],
  adi: ['ADI', 'AD'], soyadi: ['SOYADI', 'SOYAD'], adSoyad: ['ADI SOYADI', 'AD SOYAD', 'ADSOYAD'], cinsiyet: ['CINSIYET', 'CINSIYETI']
};

const uyarilar: string[] = [];
const uyar = (m: string) => uyarilar.push(m);

/* ---------- Excel okuma ---------- */
type Hucre = string | number | Date | null;
const tarihISO = (d: Date) => d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');

/** Sayfayı satır dizisine çevirir: metin hücreleri görünen metniyle, sayılar sayı, tarihler Date olarak. */
function tablo(ws: ExcelJS.Worksheet | undefined): Hucre[][] {
  if (!ws) return [];
  const out: Hucre[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, r) => {
    const satir: Hucre[] = [];
    for (let c = 1; c <= ws.columnCount; c++) {
      const cell = row.getCell(c);
      const v = cell.value as unknown;
      if (v == null) satir.push(null);
      else if (v instanceof Date) satir.push(v);
      else if (typeof v === 'number') satir.push(v);
      else satir.push(cell.text ?? String(v));
    }
    out[r - 1] = satir;
  });
  return Array.from(out, x => x ?? []);
}
const metin = (v: Hucre | undefined) => v == null ? '' : v instanceof Date ? tarihISO(v) : String(v).trim();
const sayfaBul = (wb: ExcelJS.Workbook, ad: string) => wb.worksheets.find(w => basNorm(w.name) === basNorm(ad));
const kolonBul = (satir: string[], aliaslar: string[]) => { for (const a of aliaslar) { const i = satir.indexOf(a); if (i > -1) return i; } return -1; };

/** Başlık satırının altındaki kayıtları {başlık: değer} nesnelerine çevirir. */
function kayitlar(vals: Hucre[][]): Record<string, Hucre>[] {
  const [bas, ...gov] = vals;
  if (!bas) return [];
  const anahtar = bas.map(basNorm);
  return gov.filter(r => r.some(v => metin(v))).map(r => Object.fromEntries(anahtar.map((k, i) => [k, r[i] ?? null])));
}

/** Hazırlık sayfasındaki öğrenciler (Code.gs ogrenciBasliklari_ / sayfaOgrencileri_ ile aynı kurallar). */
function sinifOgrencileri(vals: Hucre[][], dogrulamaBaslik: string) {
  let k = { satir: -1, no: 1, adi: 2, soyadi: 3, adSoyad: -1, cinsiyet: -1, dogrulama: -1, varsayilan: true };
  for (let r = 0; r < Math.min(vals.length, 15); r++) {
    const row = (vals[r] ?? []).map(basNorm);
    const no = kolonBul(row, BASLIK_ALIAS.no);
    if (no === -1) continue;
    const adi = kolonBul(row, BASLIK_ALIAS.adi), soyadi = kolonBul(row, BASLIK_ALIAS.soyadi), adSoyad = kolonBul(row, BASLIK_ALIAS.adSoyad);
    if (!((adi > -1 && soyadi > -1) || adSoyad > -1)) continue;
    k = { satir: r, no, adi, soyadi, adSoyad, cinsiyet: kolonBul(row, BASLIK_ALIAS.cinsiyet),
      dogrulama: dogrulamaBaslik ? row.indexOf(basNorm(dogrulamaBaslik)) : -1, varsayilan: false };
    break;
  }
  const out: { no: string; adi: string; soyadi: string; cinsiyet: string; dogrulama: string }[] = [];
  for (let r = k.satir + 1; r < vals.length; r++) {
    const row = vals[r] ?? [];
    const g = (i: number) => (i > -1 ? metin(row[i]) : '');
    let adi = g(k.adi), soyadi = g(k.soyadi);
    if (k.adSoyad > -1 && !adi && !soyadi) {
      const p = g(k.adSoyad).split(/\s+/).filter(Boolean);
      soyadi = p.length > 1 ? p.pop()! : '';
      adi = p.join(' ');
    }
    const no = g(k.no).replace(/\s+/g, '');
    if (!no && !adi && !soyadi) continue;
    if (k.varsayilan && !/^\d+$/.test(no)) continue;
    out.push({ no, adi, soyadi, cinsiyet: g(k.cinsiyet), dogrulama: g(k.dogrulama) });
  }
  return { ogrenciler: out, varsayilan: k.varsayilan };
}

/* ---------- Ana akış ---------- */
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(dosya);

// Ayarlar
const ayarlar = tablo(sayfaBul(wb, SAYFA.AYARLAR)).slice(1)
  .map(r => ({ anahtar: metin(r[0]).toUpperCase(), deger: metin(r[1]), aciklama: metin(r[2]) }))
  .filter(a => a.anahtar);
const ayar = Object.fromEntries(ayarlar.map(a => [a.anahtar, a.deger]));
const dogrulamaSutunu = ayar.DOGRULAMA_SUTUNU || '';
const hane = Math.max(0, parseInt(ayar.DOGRULAMA_HANE || '4', 10) || 0);

// Sınıflar: önce "Sınıflar" sayfası, sonra tabloda olmayan "Hazırlık X" sayfaları
const sinifSatirlari = new Map<string, typeof s.siniflar.$inferInsert>();
for (const r of tablo(sayfaBul(wb, SAYFA.SINIFLAR)).slice(1)) {
  const ad = metin(r[0]);
  if (!ad) continue;
  if (!hazirlikMi(ad)) { uyar(`Sınıflar sayfasındaki "${ad}" "Hazırlık X" biçiminde değil; atlandı.`); continue; }
  const kap = parseInt(metin(r[3]), 10);
  sinifSatirlari.set(basNorm(ad), { ad, anahtar: sinifAnahtari(ad), derslik: metin(r[1]), tur: sinifTuru(r[2]), kapasite: isNaN(kap) ? 0 : kap, aktif: evetMi(metin(r[4])) });
}
const hazirlikSayfalari = wb.worksheets.filter(w => hazirlikMi(w.name.trim()));
for (const w of hazirlikSayfalari) {
  const ad = w.name.trim();
  if (!sinifSatirlari.has(basNorm(ad))) {
    uyar(`"${ad}" sayfası Sınıflar tablosunda yok; derslik boş, tür Karma olarak eklendi.`);
    sinifSatirlari.set(basNorm(ad), { ad, anahtar: sinifAnahtari(ad), derslik: '', tur: 'Karma', kapasite: 0, aktif: true });
  }
}

// Öğrenci listesi
type Ogr = typeof s.ogrenciler.$inferInsert;
const ogrenciler = new Map<string, Ogr>();
for (const k of kayitlar(tablo(sayfaBul(wb, SAYFA.OGRENCILER)))) {
  const no = metin(k['OGRENCI NO']).replace(/\s+/g, '');
  if (!no) continue;
  ogrenciler.set(no, {
    no, tc4: metin(k['TC SON 4']), adi: metin(k['ADI']), soyadi: metin(k['SOYADI']), cinsiyet: cinsiyetKod(k['CINSIYET']),
    bolum: metin(k['BOLUM / PROGRAM']), eposta: metin(k['E POSTA']), telefon: metin(k['TELEFON']),
    durum: basNorm(k['KAYIT DURUMU']).includes('SILIN') ? 'silindi' : 'aktif', not: metin(k['NOT']), kayitli: true
  });
}

// Sınıf listeleri: öğrenci → sınıf ataması (yalnızca aktif sınıflar okunur; Apps Script'teki gibi)
const atama = new Map<string, { sinif: string; sira: number }>();
for (const w of hazirlikSayfalari) {
  const ad = w.name.trim();
  if (!sinifSatirlari.get(basNorm(ad))!.aktif) continue;
  const { ogrenciler: liste, varsayilan } = sinifOgrencileri(tablo(w), dogrulamaSutunu);
  if (varsayilan) uyar(`"${ad}" sayfasında başlık satırı bulunamadı; eski düzen (B: numara, C: ad, D: soyad) varsayıldı.`);
  liste.forEach((o, i) => {
    if (!o.no) { uyar(`"${ad}" sayfasında numarası boş öğrenci: ${o.adi} ${o.soyadi}; atlandı.`); return; }
    const once = atama.get(o.no);
    if (once) uyar(`${o.no} numaralı öğrenci hem "${once.sinif}" hem "${ad}" listesinde; "${once.sinif}" esas alındı.`);
    else atama.set(o.no, { sinif: ad, sira: i + 1 });
    const kayit = ogrenciler.get(o.no);
    const dogrulama = hane > 0 ? o.dogrulama.replace(/\s+/g, '').slice(-hane) : o.dogrulama;
    if (kayit) {
      if (!once) kayit.dogrulamaDegeri = dogrulama;
      if (!kayit.cinsiyet) kayit.cinsiyet = cinsiyetKod(o.cinsiyet);
    } else {
      ogrenciler.set(o.no, { no: o.no, adi: o.adi, soyadi: o.soyadi, cinsiyet: cinsiyetKod(o.cinsiyet), dogrulamaDegeri: dogrulama, kayitli: false });
    }
  });
}

// Hoca programı
const programOkunan = programTablosuOku(tablo(sayfaBul(wb, SAYFA.PROGRAM)).map(r => r.map(metin)));
if (programOkunan.eksik) uyar('"Hoca Programları" sayfasında başlık satırı bulunamadı (eksik: ' + programOkunan.eksik.join(', ') + '); program aktarılmadı.');
const program: (typeof s.hocaProgrami.$inferInsert)[] = programOkunan.satirlar.map((r, i) => ({ ...r, sira: i + 1 }));

// Duyurular (Başlık, Metin, Kime, Başlangıç, Bitiş, Aktif, Oluşturma)
const trTarih = (v: Hucre): string | null => {
  if (v instanceof Date) return tarihISO(v);
  const t = metin(v);
  const m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null;
};
const duyurular = tablo(sayfaBul(wb, SAYFA.DUYURU)).slice(1)
  .filter(r => metin(r[0]) || metin(r[1]))
  .map(r => {
    const o = trTarih(r[6] ?? null);
    return { baslik: metin(r[0]), metin: metin(r[1]), kime: metin(r[2]) || 'Herkes', baslangic: trTarih(r[3] ?? null), bitis: trTarih(r[4] ?? null),
      aktif: evetMi(metin(r[5])), olusturma: o ? new Date(o + 'T12:00:00+03:00') : new Date() };
  });

// Sınav sonuçları (Öğrenci No, Adı, Soyadı, Sınav Yeri / Saati, Yazılı, Sözlü, …) — puanlar ham değerleriyle
const puan = (v: Hucre | undefined) => typeof v === 'number' ? String(v) : metin(v);
const sinav = tablo(sayfaBul(wb, SAYFA.SINAV)).slice(1)
  .map(r => ({ no: metin(r[0]).replace(/\s+/g, ''), adi: metin(r[1]), soyadi: metin(r[2]), yer: metin(r[3]), yazili: puan(r[4]), sozlu: puan(r[5]) }))
  .filter(x => x.no);
const sinavTekil = [...new Map(sinav.map(x => [x.no, x])).values()];
if (sinavTekil.length < sinav.length) uyar(`Sınav Sonuçları sayfasında ${sinav.length - sinavTekil.length} tekrarlanan numara var; son satır esas alındı.`);

// Yetkililer ve işlem kaydı
const yetkililer = tablo(sayfaBul(wb, SAYFA.YETKILILER)).slice(1)
  .map(r => ({ eposta: metin(r[0]).toLowerCase(), rol: basNorm(r[1]).toLowerCase(), adSoyad: metin(r[2]) }))
  .filter(y => y.eposta && (y.rol === 'admin' || y.rol === 'hoca'));
const islemler = tablo(sayfaBul(wb, SAYFA.LOG)).slice(1)
  .filter(r => r[0] instanceof Date && metin(r[2]))
  .map(r => ({ zaman: r[0] as Date, kullanici: metin(r[1]) || '-', islem: metin(r[2]), ayrinti: metin(r[3]) }));

// Yoklama (Yoklama.gs): sayfa yoksa veritabanındaki yoklamalara dokunulmaz
const isoDe = (v: Hucre | undefined) => { const t = metin(v); return isoGecerli(t) ? t : trIso(t); };
/** "dd.MM.yyyy HH:mm(:ss)" → Date (İstanbul saati) */
const zamanDe = (v: Hucre | undefined) => {
  if (v instanceof Date) return v;
  const m = metin(v).match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return new Date();
  const p = (x: string | undefined) => String(x ?? '0').padStart(2, '0');
  return new Date(`${m[3]}-${p(m[2])}-${p(m[1])}T${p(m[4])}:${p(m[5])}:${p(m[6])}+03:00`);
};
const yokSayfasi = sayfaBul(wb, SAYFA.YOKLAMA), evrakSayfasi = sayfaBul(wb, SAYFA.EVRAK);
const yoklamaHam = tablo(yokSayfasi).slice(1).map(r => {
  const iso = isoDe(r[1]), sinif = metin(r[5]), saat = metin(r[3]), ders = metin(r[4]);
  if (!iso || !sinif || !ders) return null;
  const liste = noListesi(metin(r[9])), icinde = (n: string) => liste.includes(n);
  return {
    anahtar: oturumAnahtari(iso, sinif, saat, ders), tarih: iso, saat, ders, sinif, hoca: metin(r[6]),
    tur: basNorm(r[7]) === 'TELAFI' ? 'Telafi' : 'Program', durum: basNorm(r[8]) === 'YAPILMADI' ? 'Yapılmadı' : 'Yapıldı',
    liste, yok1: noListesi(metin(r[10])).filter(icinde), yok2: noListesi(metin(r[11])).filter(icinde), izinli: noListesi(metin(r[12])).filter(icinde),
    kaynak: metin(r[13]) || 'Manuel', kaydeden: metin(r[14]), zaman: zamanDe(r[15]), aciklama: metin(r[16]).slice(0, 500)
  };
}).filter(x => x != null);
const yoklamaTekil = [...new Map(yoklamaHam.map(x => [x.anahtar, x])).values()];
if (yoklamaTekil.length < yoklamaHam.length) uyar(`Yoklama sayfasında aynı derse ait ${yoklamaHam.length - yoklamaTekil.length} tekrarlanan satır var; son satır esas alındı.`);
const jsonDe = <T>(v: Hucre | undefined, yedek: T): T => { try { return JSON.parse(metin(v) || 'null') ?? yedek; } catch { return yedek; } };
const evraklar = tablo(evrakSayfasi).slice(1).map(r => {
  const no = metin(r[0]).toUpperCase(), ozet = metin(r[12]);
  if (!/^[A-Z0-9]{8}$/.test(no) || !ozet) return null;
  const sp = metin(r[7] ?? '1/1').split('/');
  return { no, ozet, olusturma: zamanDe(r[1]), sonYazdirma: zamanDe(r[2]), hoca: metin(r[3]), sinif: metin(r[4]), tur: metin(r[5]) || 'Program', hafta: metin(r[6]),
    sayfa: parseInt(sp[0], 10) || 1, toplam: parseInt(sp[1], 10) || 1, sutunlar: jsonDe(r[8], []), ogrenciler: noListesi(metin(r[9])),
    satir: parseInt(metin(r[10]), 10) || 0, yerlesim: jsonDe(r[11], {}), tarama: metin(r[13]) };
}).filter(x => x != null);
const evrakTekil = [...new Map([...new Map(evraklar.map(x => [x.no, x])).values()].map(x => [x.ozet, x])).values()];

/* ---------- Rapor ---------- */
const siniflarListe = [...sinifSatirlari.values()];
const sinifSay = new Map<string, number>();
atama.forEach(a => sinifSay.set(a.sinif, (sinifSay.get(a.sinif) ?? 0) + 1));
const yalnizListede = [...ogrenciler.values()].filter(o => !o.kayitli).length;
console.log('\nE-tablo: ' + dosya);
console.log('  Sınıf          : ' + siniflarListe.length + ' (' + siniflarListe.map(x => `${x.ad}: ${sinifSay.get(x.ad) ?? 0}${x.aktif ? '' : ' pasif'}`).join(', ') + ')');
console.log('  Öğrenci        : ' + ogrenciler.size + ' (öğrenci listesinde ' + (ogrenciler.size - yalnizListede) + ', yalnızca sınıf listesinde ' + yalnizListede + ')');
console.log('  Sınıfa atanmış : ' + atama.size);
console.log('  Program satırı : ' + program.length);
console.log('  Duyuru         : ' + duyurular.length);
console.log('  Sınav sonucu   : ' + sinavTekil.length);
console.log('  Ayar           : ' + ayarlar.length + ' · Yetkili: ' + yetkililer.length + ' · İşlem kaydı: ' + islemler.length);
console.log('  Yoklama        : ' + (yokSayfasi ? yoklamaTekil.length + ' ders (veritabanındaki yoklamaların yerine yazılır)' : 'sayfa yok — veritabanındaki yoklamalara dokunulmaz'));
console.log('  Yoklama evrakı : ' + (evrakSayfasi ? evrakTekil.length + ' sayfa (QR’lı eski sirküler yeni sistemde taranabilir)' : 'sayfa yok — dokunulmaz'));
if (uyarilar.length) { console.log('\nUyarılar (' + uyarilar.length + '):'); uyarilar.forEach(u => console.log('  • ' + u)); }

if (!yaz) {
  console.log('\nHiçbir şey yazılmadı. Veritabanına aktarmak için komutu --yaz ile yeniden çalıştırın.');
  process.exit(0);
}

/* ---------- Yazma (tek işlem: hata olursa hiçbir şey değişmez) ---------- */
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL tanımlı değil (.env dosyası).'); process.exit(1); }
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
const db = drizzle(sql, { schema: s });
const parcala = <T>(d: T[], n = 500) => Array.from({ length: Math.ceil(d.length / n) }, (_, i) => d.slice(i * n, i * n + n));

await db.transaction(async tx => {
  for (const t of [s.sinifTaslagi, s.ogrenciler, s.siniflar, s.hocaProgrami, s.duyurular, s.sinavSonuclari, s.ayarlar, s.yetkililer, s.islemKaydi]) await tx.delete(t);
  const eklenen = siniflarListe.length ? await tx.insert(s.siniflar).values(siniflarListe).returning({ id: s.siniflar.id, ad: s.siniflar.ad }) : [];
  const sinifId = new Map(eklenen.map(x => [x.ad, x.id]));
  const ogrListe = [...ogrenciler.values()].map(o => {
    const a = atama.get(o.no);
    return { ...o, sinifId: a ? sinifId.get(a.sinif) ?? null : null, sinifSira: a?.sira ?? null };
  });
  for (const p of parcala(ogrListe)) await tx.insert(s.ogrenciler).values(p);
  for (const p of parcala(program)) await tx.insert(s.hocaProgrami).values(p);
  for (const p of parcala(duyurular)) await tx.insert(s.duyurular).values(p);
  for (const p of parcala(sinavTekil)) await tx.insert(s.sinavSonuclari).values(p);
  if (ayarlar.length) await tx.insert(s.ayarlar).values(ayarlar);
  if (yetkililer.length) await tx.insert(s.yetkililer).values(yetkililer);
  for (const p of parcala(islemler)) await tx.insert(s.islemKaydi).values(p);
  if (yokSayfasi) { await tx.delete(s.yoklamalar); for (const p of parcala(yoklamaTekil)) await tx.insert(s.yoklamalar).values(p); }
  if (evrakSayfasi) { await tx.delete(s.yoklamaEvraklari); for (const p of parcala(evrakTekil)) await tx.insert(s.yoklamaEvraklari).values(p); }
  await tx.insert(s.islemKaydi).values({ kullanici: 'aktarım betiği', islem: 'E-tablodan aktarım', ayrinti: `${ogrenciler.size} öğrenci, ${siniflarListe.length} sınıf` });
});
await sql.end();
console.log('\nAktarım tamamlandı.');
