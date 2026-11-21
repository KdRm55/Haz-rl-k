/**
 * Optik cevap kâğıdı okuyucu (saf TypeScript; tarayıcıda ve Node'da çalışır, DOM gerektirmez).
 * Form: üstte QR, altta kalın siyah çerçeve içinde 5 sütun × 10 satır = 50 soru, her soruda A–E baloncukları.
 * Çerçeve bulunur, tarama eğikse düzeltilir; baloncuklar çerçeveye göre oransal yerlerinden ölçülür.
 * Çıktı: 50 karakter — "A"–"E", işaretsiz "-", birden fazla işaret "X".
 */

export type Gri = { g: ArrayLike<number>; w: number; h: number };

export const SORU_SAYISI = 50;
export const SECENEKLER = 'ABCDE';

/** Çerçevenin iç alanına oranla baloncuk düzeni (kâğıt şablonundan ölçüldü). */
const DUZEN = { ilkX: 0.050, secenekAraligi: 0.0325, sutunAraligi: 0.1965, ilkY: 0.075, satirAraligi: 0.0900, yaricap: 0.0095 };
const KOYU = 110;

export type Cerceve = { x0: number; x1: number; y0: number; y1: number };
export type Okuma =
  | { ok: true; cevaplar: string; bos: number; coklu: number[]; zayif: number[]; acilar: number; cerceve: Cerceve; taban: number; ters180?: boolean }
  | { ok: false; neden: string };

/**
 * RGBA (canvas/jpeg çözücü çıktısı) → gri. En parlak kanal alınır: kurşun kalem ve siyah çerçeve nötr olduğundan koyu kalır,
 * tarayıcının bıraktığı renkli (mavi/pembe) çizgiler ise parlak çıkar ve işaret sanılmaz.
 */
export function griYap(rgba: ArrayLike<number>, w: number, h: number): Gri {
  const g = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = Math.max(rgba[j], rgba[j + 1], rgba[j + 2]);
  return { g, w, h };
}

/** Çerçevenin dört kenarı boyunca koyu piksel oranı (0–1): gerçek çerçeve ~1, yanlış dikdörtgen düşük. */
function cerceveKalitesi(r: Gri, c: Cerceve): number {
  const oran = (n: number, deger: (i: number) => number) => { let k = 0; for (let i = 0; i < n; i++) if (deger(i) < KOYU) k++; return k / n; };
  const fw = c.x1 - c.x0, fh = c.y1 - c.y0;
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < r.w && y < r.h ? r.g[Math.round(y) * r.w + Math.round(x)] : 255);
  const en = (f: (d: number) => number) => Math.max(f(2), f(3), f(4), f(5));   // çerçeve kalınlığı ~7 px: en koyu şeridi al
  return (en(d => oran(fw, i => at(c.x0 + i, c.y0 - d))) + en(d => oran(fw, i => at(c.x0 + i, c.y1 + d)))
    + en(d => oran(fh, i => at(c.x0 - d, c.y0 + i))) + en(d => oran(fh, i => at(c.x1 + d, c.y0 + i)))) / 4;
}

function ters(r: Gri): Gri {
  const g = new Uint8Array(r.w * r.h);
  for (let i = 0; i < g.length; i++) g[i] = r.g[g.length - 1 - i];
  return { g, w: r.w, h: r.h };
}

/** Eğiklik açısını (derece) bulur: çerçevenin yatay kenarları en keskin satır profilini verdiği açı. Küçük kopyada çalışır. */
function aciBul(r: Gri): number {
  const k = Math.max(1, Math.floor(Math.max(r.w, r.h) / 600));
  const w = Math.floor(r.w / k), h = Math.floor(r.h / k);
  const koyu: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (r.g[y * k * r.w + x * k] < KOYU) koyu.push(x, y);
  let enIyi = 0, enSkor = -1;
  for (let a = -30; a <= 30; a++) {   // −3°…+3°, 0,1° adım
    const aci = a / 10 * Math.PI / 180, sin = Math.sin(aci), cos = Math.cos(aci);
    const profil = new Float64Array(h * 2);
    for (let i = 0; i < koyu.length; i += 2) {
      const y = Math.round(koyu[i + 1] * cos - koyu[i] * sin + h / 2);
      if (y >= 0 && y < profil.length) profil[y]++;
    }
    let skor = 0;
    for (let i = 0; i < profil.length; i++) skor += profil[i] * profil[i];
    if (skor > enSkor) { enSkor = skor; enIyi = a / 10; }
  }
  return enIyi;
}

/** Görüntüyü merkez etrafında döndürür (çift doğrusal değil, en yakın komşu; baloncuk ortalaması için yeterli). */
function dondur(r: Gri, derece: number): Gri {
  if (Math.abs(derece) < 0.05) return r;
  const a = derece * Math.PI / 180, sin = Math.sin(a), cos = Math.cos(a), cx = r.w / 2, cy = r.h / 2;
  const g = new Uint8Array(r.w * r.h).fill(255);
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    const sx = Math.round((x - cx) * cos + (y - cy) * sin + cx), sy = Math.round(-(x - cx) * sin + (y - cy) * cos + cy);
    if (sx >= 0 && sx < r.w && sy >= 0 && sy < r.h) g[y * r.w + x] = r.g[sy * r.w + sx];
  }
  return { g, w: r.w, h: r.h };
}

function enUzunKosu(deger: (i: number) => number, n: number): number {
  let en = 0, su = 0;
  for (let i = 0; i < n; i++) { if (deger(i) < KOYU) { su++; if (su > en) en = su; } else su = 0; }
  return en;
}
function gruplar(a: number[]): [number, number][] {
  const o: [number, number][] = [];
  if (!a.length) return o;
  let b = a[0], p = a[0];
  for (const v of a.slice(1)) { if (v - p > 3) { o.push([b, p]); b = v; } p = v; }
  o.push([b, p]);
  return o;
}

/** Kalın siyah çerçevenin iç sınırları (eksenlere hizalı görüntüde). */
export function cerceveBul(r: Gri): Cerceve | null {
  const yatay: number[] = [], dikey: number[] = [];
  for (let y = 0; y < r.h; y++) if (enUzunKosu(x => r.g[y * r.w + x], r.w) > r.w * 0.4) yatay.push(y);
  for (let x = 0; x < r.w; x++) if (enUzunKosu(y => r.g[y * r.w + x], r.h) > r.h * 0.12) dikey.push(x);
  const yb = gruplar(yatay), xb = gruplar(dikey);
  // Adaylar: iki yatay + iki dikey bant; en/boy oranı formun oranına (~2.75) yakın olmalı. Tablo çizgileri gibi sahte bantlara karşı
  // dört kenarı da koyu olan (gerçek çerçeve) aday seçilir.
  let en: Cerceve | null = null, enSkor = 0;
  for (let i = 0; i < yb.length; i++) for (let j = yb.length - 1; j > i; j--) for (let a = 0; a < xb.length; a++) for (let b = xb.length - 1; b > a; b--) {
    const w = xb[b][0] - xb[a][1], h = yb[j][0] - yb[i][1];
    if (!(h > 0 && w / h > 2.3 && w / h < 3.3 && w > r.w * 0.5)) continue;
    const c = { x0: xb[a][1] + 1, x1: xb[b][0] - 1, y0: yb[i][1] + 1, y1: yb[j][0] - 1 };
    const skor = cerceveKalitesi(r, c) - Math.abs(w / h - 2.75) * 0.1;
    if (skor > enSkor) { enSkor = skor; en = c; }
  }
  return en;
}

function ortalama(r: Gri, cx: number, cy: number, rad: number): number {
  let s = 0, n = 0;
  for (let y = Math.round(cy - rad); y <= cy + rad; y++) for (let x = Math.round(cx - rad); x <= cx + rad; x++) {
    if ((x - cx) ** 2 + (y - cy) ** 2 <= rad * rad && x >= 0 && y >= 0 && x < r.w && y < r.h) { s += r.g[y * r.w + x]; n++; }
  }
  return n ? s / n : 255;
}

/** Her baloncuğun ortalama parlaklığı: [soru][seçenek] (0 koyu … 255 beyaz). */
export function baloncukOlc(r: Gri, c: Cerceve): number[][] {
  const fw = c.x1 - c.x0, fh = c.y1 - c.y0, rad = fw * DUZEN.yaricap;
  const out: number[][] = [];
  for (let s = 0; s < 5; s++) for (let sat = 0; sat < 10; sat++) {
    const satir: number[] = [];
    for (let o = 0; o < 5; o++) {
      const cx = c.x0 + fw * (DUZEN.ilkX + o * DUZEN.secenekAraligi + s * DUZEN.sutunAraligi), cy = c.y0 + fh * (DUZEN.ilkY + sat * DUZEN.satirAraligi);
      satir.push(ortalama(r, cx, cy, rad));
    }
    out.push(satir);
  }
  return out;
}

/** Ölçümlerden cevap dizisi: işaretli = taban (boş baloncuk parlaklığı) − 60'tan koyu; 38–60 arası "zayıf" (elle kontrol). */
export function cevapCoz(olcum: number[][]) {
  const hepsi = olcum.flat().sort((a, b) => a - b);
  const taban = hepsi[Math.floor(hepsi.length * 0.75)];   // işaretliler azınlıkta: üst çeyrek boş baloncuk parlaklığıdır
  let cevaplar = '', bos = 0;
  const coklu: number[] = [], zayif: number[] = [];
  olcum.forEach((satir, i) => {
    const isaret = satir.map((v, k) => (v < taban - 60 ? k : -1)).filter(k => k > -1);
    if (satir.some(v => v >= taban - 60 && v < taban - 38)) zayif.push(i + 1);
    if (isaret.length === 0) { cevaplar += '-'; bos++; }
    else if (isaret.length === 1) cevaplar += SECENEKLER[isaret[0]];
    else { cevaplar += 'X'; coklu.push(i + 1); }
  });
  return { cevaplar, bos, coklu, zayif, taban };
}

/** Tek optik görüntüsünü okur. */
export function optikOku(ham: Gri): Okuma {
  const bulundu = hizala(ham);
  if (!bulundu) return { ok: false, neden: 'Cevap bölümünün siyah çerçevesi bulunamadı (kâğıt eğik, kırpılmış ya da çok soluk olabilir).' };
  let { r, c, acilar } = bulundu;
  let ters180 = false;
  // Form dik tutulduğunda çerçeve sayfanın alt yarısındadır; üst yarıdaysa kâğıt baş aşağı taranmıştır
  if ((c.y0 + c.y1) / 2 < r.h * 0.5) {
    const b2 = hizala(ters(ham));
    if (b2) { ({ r, c, acilar } = b2); ters180 = true; }
  }
  const x = cevapCoz(baloncukOlc(r, c));
  return { ok: true, ...x, acilar, cerceve: c, ters180 };
}

/** Eğikliği giderir ve çerçeveyi bulur. Açının işareti dönüşüm yönüne bağlı olduğundan her iki yön de denenir; en sağlam çerçeve seçilir. */
function hizala(ham: Gri) {
  const tahmin = aciBul(ham);
  let enIyi: { r: Gri; c: Cerceve; acilar: number } | null = null, enKalite = 0.6;   // 0.6 altı çerçeve sayılmaz
  for (const a of [tahmin, -tahmin, 0]) {
    const d = dondur(ham, a), cc = cerceveBul(d);
    if (!cc) continue;
    const k = cerceveKalitesi(d, cc);
    if (k > enKalite) { enKalite = k; enIyi = { r: d, c: cc, acilar: a }; }
  }
  return enIyi;
}

/** Doğru / yanlış / boş sayımı. anahtar: "ABCDE…" (uzunluğu soru sayısı); anahtardaki "-" iptal soruyu (herkese doğru) belirtir. */
export function notla(cevaplar: string, anahtar: string, yanlisCezasi = 0) {
  let dogru = 0, yanlis = 0, bos = 0, iptal = 0;
  for (let i = 0; i < anahtar.length; i++) {
    const a = anahtar[i], c = cevaplar[i] ?? '-';
    if (a === '-' || a === ' ') { iptal++; dogru++; continue; }   // iptal soru herkese doğru sayılır
    if (c === '-') bos++;
    else if (c === a) dogru++;
    else yanlis++;
  }
  const toplam = anahtar.length;
  const ham = Math.max(0, dogru - yanlis * yanlisCezasi);
  return { dogru, yanlis, bos, iptal, toplam, puan: toplam ? Math.round(ham / toplam * 10000) / 100 : 0 };
}
