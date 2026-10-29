/**
 * Taranan imza sirkülerini okuma motoru (tarayıcıda çalışır; dosya sunucuya gönderilmez).
 * Apps Script YoklamaTaramaMotor.html karşılığı: QR → evrak numarası; QR ve 4 köşe işaretiyle sayfa düzeltilir;
 * her imza hücresinde mürekkep ölçülür. PDF sayfaları pdf.js ile (uygulamanın kendi paketinden) görüntüye çevrilir.
 */
import jsQR from 'jsqr';
import { QR_ON_EK } from '../yoklama-kurallari';

const MMPX = 5;                 // düzeltilmiş sayfa çözünürlüğü (piksel / mm)
const SAYFA_W = 210, SAYFA_H = 297;
const QR_KENAR = 8 / 100;       // QR görüntüsündeki boşluk oranı (createDataURL(4, 8): 21 modül × 4 px + 2 × 8 px)
export const ESIK = { alt: 0.004, ust: 0.012, cizgiY: 0.24, cizgiX: 0.30, cekirdek: 0.0025 };
const QR_DESEN = new RegExp('^' + QR_ON_EK + '[A-Z0-9]{8}$');

type Kaynak = HTMLCanvasElement | ImageBitmap | HTMLImageElement;
type Nokta = [number, number];
type Mat = number[];
type Gri = { g: Uint8ClampedArray; w: number; h: number };
type Duz = Gri & { m?: Uint8ClampedArray };
type Parca = { n: number; u: Nokta | null; a: Nokta | null; s: Nokta | null; g: Nokta | null };
type Olcum = { oran: number; zayif: number; alan: number; parcalar: Parca[]; sapma: number; kapsamY: number; kapsamX: number; zayifY: number };
type Yon = 'u' | 'a' | 's' | 'g';

export type EvrakKaydi = {
  no: string; hoca: string; sinif: string; tur: string; hafta: string; sayfa: number; toplam: number;
  sutunlar: { tarih: string; saat: string; ders: string }[]; ogrenciler: string[]; satir: number;
  yerlesim: { hiza?: number[][]; qr?: number[] | null; satir?: number[][]; sutun?: number[][] };
  oturumlar: (string | null)[];
};
export type Hucre = { i: number; no: string; d: number; k: 1 | 2; s: 'P' | 'A' | '?'; neden: string; oran: number; kutu: number[] };
export type SayfaSonucu =
  | { durum: 'tamam'; no: string; evrak: EvrakKaydi; hucreler: Hucre[]; ekSatirlar: { i: number; kutu: number[] }[]; guven: 'yuksek' | 'orta' | 'dusuk'; isaret: number; hataMm: number; qr: boolean; gorsel: string }
  | { durum: 'bos' | 'qr'; onizleme: string; no?: undefined }
  | { durum: 'evrak'; no: string; neden?: string; onizleme: string }
  | { durum: 'isaret'; no: string; bulunan: number; onizleme: string };

const tuval = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const boyut = (k: Kaynak) => ({ w: k.width, h: k.height });

/* ---------- Görüntü yardımcıları ---------- */
function griYap(img: Kaynak, w: number, h: number): Gri {
  const c = tuval(w, h), x = c.getContext('2d', { willReadFrequently: true })!;
  x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
  x.drawImage(img, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data, g = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (d[j] * 299 + d[j + 1] * 587 + d[j + 2] * 114) / 1000;
  return { g, w, h };
}
function olcekle(k: Kaynak, enCok: number) {
  const { w, h } = boyut(k), o = Math.min(1, enCok / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * o)), h: Math.max(1, Math.round(h * o)), k: o };
}

/* ---------- QR ---------- */
function qrDene(kaynak: Kaynak, enCok: number, kirp?: number[]) {
  const { w: sw, h: sh } = boyut(kaynak);
  const kx = kirp ? kirp[0] * sw : 0, ky = kirp ? kirp[1] * sh : 0, kw = kirp ? kirp[2] * sw : sw, kh = kirp ? kirp[3] * sh : sh;
  const k = Math.min(1, enCok / Math.max(kw, kh)), w = Math.round(kw * k), h = Math.round(kh * k);
  const c = tuval(w, h), x = c.getContext('2d', { willReadFrequently: true })!;
  x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
  x.drawImage(kaynak, kx, ky, kw, kh, 0, 0, w, h);
  const r = jsQR(x.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
  if (!r || !QR_DESEN.test(r.data)) return null;
  const geri = (p: { x: number; y: number }) => ({ x: kx + p.x / k, y: ky + p.y / k });
  const L = r.location;
  return { no: r.data.slice(QR_ON_EK.length), koseler: [geri(L.topLeftCorner), geri(L.topRightCorner), geri(L.bottomRightCorner), geri(L.bottomLeftCorner)] };
}
function qrBul(kaynak: Kaynak) {
  const r = qrDene(kaynak, 1400) || qrDene(kaynak, 2400);
  if (r) return r;
  const parcalar = [[0.5, 0, 0.5, 0.35], [0, 0, 0.5, 0.35], [0.5, 0.65, 0.5, 0.35], [0, 0.65, 0.5, 0.35],
    [0.65, 0, 0.35, 0.5], [0, 0.5, 0.35, 0.5], [0, 0, 0.35, 0.5], [0.65, 0.5, 0.35, 0.5]];
  for (const p of parcalar) { const q = qrDene(kaynak, 1600, p); if (q) return q; }
  return null;
}

/* ---------- Homografi (normalize DLT, en küçük kareler) ---------- */
function normalizeEt(p: Nokta[]) {
  let mx = 0, my = 0; p.forEach(q => { mx += q[0]; my += q[1]; }); mx /= p.length; my /= p.length;
  let d = 0; p.forEach(q => { d += Math.hypot(q[0] - mx, q[1] - my); }); d = d / p.length || 1;
  const s = Math.SQRT2 / d;
  return { T: [s, 0, -s * mx, 0, s, -s * my, 0, 0, 1], p: p.map(q => [s * (q[0] - mx), s * (q[1] - my)] as Nokta) };
}
function cozGauss(A: number[][], b: number[]) {
  const n = b.length, M = A.map((r, i) => r.concat([b[i]]));
  for (let c = 0; c < n; c++) {
    let m = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[m][c])) m = r;
    [M[c], M[m]] = [M[m], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) return null;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}
function carp3(A: Mat, B: Mat) { const C: Mat = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { let s = 0; for (let k = 0; k < 3; k++) s += A[i * 3 + k] * B[k * 3 + j]; C.push(s); } return C; }
function ters3(m: Mat): Mat {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, D = a * A + b * B + c * C;
  return [A / D, -(b * i - c * h) / D, (b * f - c * e) / D, B / D, (a * i - c * g) / D, -(a * f - c * d) / D, C / D, -(a * h - b * g) / D, (a * e - b * d) / D];
}
/** src (mm) → dst (piksel) */
export function homografi(src: Nokta[], dst: Nokta[]): Mat | null {
  if (src.length < 4) return null;
  const ns = normalizeEt(src), nd = normalizeEt(dst);
  const ATA = Array.from({ length: 8 }, () => [0, 0, 0, 0, 0, 0, 0, 0]), ATb = [0, 0, 0, 0, 0, 0, 0, 0];
  for (let k = 0; k < src.length; k++) {
    const [x, y] = ns.p[k], [u, v] = nd.p[k];
    const satirlar: [number[], number][] = [[[x, y, 1, 0, 0, 0, -u * x, -u * y], u], [[0, 0, 0, x, y, 1, -v * x, -v * y], v]];
    for (const [r, t] of satirlar) for (let a = 0; a < 8; a++) { ATb[a] += r[a] * t; for (let b = 0; b < 8; b++) ATA[a][b] += r[a] * r[b]; }
  }
  const h = cozGauss(ATA, ATb); if (!h) return null;
  return carp3(ters3(nd.T), carp3([h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1], ns.T));
}
/** Benzerlik (dönme + ölçek + kaydırma), en küçük kareler. */
function benzerlik(src: Nokta[], dst: Nokta[]): Mat | null {
  if (src.length < 2) return null;
  const A = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], b = [0, 0, 0, 0];
  for (let i = 0; i < src.length; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    const satirlar: [number[], number][] = [[[x, -y, 1, 0], u], [[y, x, 0, 1], v]];
    for (const [r, t] of satirlar) for (let p = 0; p < 4; p++) { b[p] += r[p] * t; for (let q = 0; q < 4; q++) A[p][q] += r[p] * r[q]; }
  }
  const h = cozGauss(A, b); if (!h) return null;
  return [h[0], -h[1], h[2], h[1], h[0], h[3], 0, 0, 1];
}
/** Afin, en küçük kareler. */
function afin(src: Nokta[], dst: Nokta[]): Mat | null {
  if (src.length < 3) return null;
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], bx = [0, 0, 0], by = [0, 0, 0];
  for (let i = 0; i < src.length; i++) { const r = [src[i][0], src[i][1], 1]; for (let p = 0; p < 3; p++) { bx[p] += r[p] * dst[i][0]; by[p] += r[p] * dst[i][1]; for (let q = 0; q < 3; q++) A[p][q] += r[p] * r[q]; } }
  const hx = cozGauss(A, bx), hy = cozGauss(A, by); if (!hx || !hy) return null;
  return [hx[0], hx[1], hx[2], hy[0], hy[1], hy[2], 0, 0, 1];
}
/** Bulunan köşe işareti sayısına göre en uygun model: 0–1 benzerlik, 2–3 afin, 4 perspektif. */
function modelUydur(src: Nokta[], dst: Nokta[], isaretSayisi: number) {
  if (isaretSayisi >= 4) return homografi(src, dst) || afin(src, dst);
  if (isaretSayisi >= 2) return afin(src, dst) || benzerlik(src, dst);
  return benzerlik(src, dst);
}
export function uygula(H: Mat, x: number, y: number): Nokta { const w = H[6] * x + H[7] * y + H[8]; return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w]; }
function yerelOlcek(H: Mat, x: number, y: number) { const a = uygula(H, x, y), b = uygula(H, x + 1, y), c = uygula(H, x, y + 1); return (Math.hypot(b[0] - a[0], b[1] - a[1]) + Math.hypot(c[0] - a[0], c[1] - a[1])) / 2; }

/* ---------- Köşe işareti arama (şablon: koyu kare + açık halka, integral görüntüyle) ---------- */
function isaretAra(G: Gri, tx: number, ty: number, olcek: number, yaricapMm: number, kenarMm: number) {
  const R = Math.round(yaricapMm * olcek), x0 = Math.max(0, Math.round(tx - R)), y0 = Math.max(0, Math.round(ty - R));
  const x1 = Math.min(G.w - 1, Math.round(tx + R)), y1 = Math.min(G.h - 1, Math.round(ty + R));
  const w = x1 - x0 + 1, h = y1 - y0 + 1; if (w < 10 || h < 10) return null;
  const I = new Float64Array((w + 1) * (h + 1)), I2 = new Float64Array((w + 1) * (h + 1)), hist = new Uint32Array(256);
  for (let y = 0; y < h; y++) { let sat = 0, sat2 = 0; for (let x = 0; x < w; x++) { const v = G.g[(y0 + y) * G.w + x0 + x]; hist[v]++; sat += v; sat2 += v * v; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + sat; I2[(y + 1) * (w + 1) + x + 1] = I2[y * (w + 1) + x + 1] + sat2; } }
  const top = w * h; let say = 0, med = 255; for (let v = 0; v < 256; v++) { say += hist[v]; if (say >= top * 0.5) { med = v; break; } }
  const toplam = (ax: number, ay: number, bx: number, by: number, T: Float64Array = I): [number, number] => {
    ax = Math.max(0, ax); ay = Math.max(0, ay); bx = Math.min(w, bx); by = Math.min(h, by);
    if (bx <= ax || by <= ay) return [0, 0];
    return [T[by * (w + 1) + bx] - T[ay * (w + 1) + bx] - T[by * (w + 1) + ax] + T[ay * (w + 1) + ax], (bx - ax) * (by - ay)];
  };
  const s = Math.max(3, Math.round(kenarMm * olcek)), hs = s / 2, ic = Math.max(1, Math.round(0.25 * olcek)), dis = Math.max(2, Math.round(1.4 * olcek));
  let en: { puan: number; x: number; y: number; ic: number; halka: number } | null = null;
  const adim = Math.max(1, Math.round(olcek / 3));
  for (let cy = Math.round(hs); cy < h - hs; cy += adim) for (let cx = Math.round(hs); cx < w - hs; cx += adim) {
    const a = toplam(Math.round(cx - hs + ic), Math.round(cy - hs + ic), Math.round(cx + hs - ic), Math.round(cy + hs - ic));
    if (!a[1]) continue; const icOrt = a[0] / a[1]; if (icOrt > med * 0.5) continue;
    const a2 = toplam(Math.round(cx - hs + ic), Math.round(cy - hs + ic), Math.round(cx + hs - ic), Math.round(cy + hs - ic), I2);
    if (Math.sqrt(Math.max(0, a2[0] / a2[1] - icOrt * icOrt)) > med * 0.16) continue;   // içi düzgün koyu değil (QR, yazı)
    const b = toplam(Math.round(cx - hs - dis), Math.round(cy - hs - dis), Math.round(cx + hs + dis), Math.round(cy + hs + dis));
    const c = toplam(Math.round(cx - hs - ic), Math.round(cy - hs - ic), Math.round(cx + hs + ic), Math.round(cy + hs + ic));
    const halkaN = b[1] - c[1]; if (halkaN <= 0) continue; const halka = (b[0] - c[0]) / halkaN;
    const puan = (halka - icOrt) - 0.02 * Math.hypot(x0 + cx - tx, y0 + cy - ty) / olcek;
    if (halka - icOrt < med * 0.3) continue;
    if (!en || puan > en.puan) en = { puan, x: x0 + cx, y: y0 + cy, ic: icOrt, halka };
  }
  if (!en) return null;
  // ağırlık merkeziyle inceltme (kare içindeki koyu pikseller)
  const esik = (en.ic + en.halka) / 2, r2 = Math.round(hs + ic);
  let sx = 0, sy = 0, n = 0;
  for (let yy = Math.round(en.y - r2); yy <= en.y + r2; yy++) for (let xx = Math.round(en.x - r2); xx <= en.x + r2; xx++) {
    if (xx < 0 || yy < 0 || xx >= G.w || yy >= G.h) continue; if (G.g[yy * G.w + xx] < esik) { sx += xx; sy += yy; n++; }
  }
  if (n < s * s * 0.35) return null;
  return { x: sx / n, y: sy / n };
}

/* ---------- Sayfayı düzeltme (perspektif + eğiklik) ---------- */
function duzelt(G: Gri, H: Mat): Duz {
  const W = SAYFA_W * MMPX, Hh = SAYFA_H * MMPX, out = new Uint8ClampedArray(W * Hh), gw = G.w, gh = G.h, g = G.g;
  for (let v = 0; v < Hh; v++) {
    const my = (v + 0.5) / MMPX;
    for (let u = 0; u < W; u++) {
      const mx = (u + 0.5) / MMPX, ww = H[6] * mx + H[7] * my + H[8];
      const px = (H[0] * mx + H[1] * my + H[2]) / ww - 0.5, py = (H[3] * mx + H[4] * my + H[5]) / ww - 0.5;
      const x0 = Math.floor(px), y0 = Math.floor(py);
      if (x0 < 0 || y0 < 0 || x0 >= gw - 1 || y0 >= gh - 1) { out[v * W + u] = 255; continue; }
      const fx = px - x0, fy = py - y0, i = y0 * gw + x0;
      out[v * W + u] = (g[i] * (1 - fx) + g[i + 1] * fx) * (1 - fy) + (g[i + gw] * (1 - fx) + g[i + gw + 1] * fx) * fy;
    }
  }
  return { g: out, w: W, h: Hh };
}

/* ---------- Hücre ölçümü ---------- */
/** Yerel ortalama (kutu bulanıklığı). Mürekkep, hemen çevresindeki kâğıttan koyu pikseldir; gölge ve ışık farkı mürekkep sayılmaz. */
function yerelOrtalama(D: Gri, r: number) {
  const W = D.w, H = D.h, I = new Float64Array((W + 1) * (H + 1)), M = new Uint8ClampedArray(W * H);
  for (let y = 0; y < H; y++) { let sat = 0; for (let x = 0; x < W; x++) { sat += D.g[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + sat; } }
  for (let y = 0; y < H; y++) {
    const ay = Math.max(0, y - r), by = Math.min(H, y + r + 1);
    for (let x = 0; x < W; x++) {
      const ax = Math.max(0, x - r), bx = Math.min(W, x + r + 1);
      M[y * W + x] = (I[by * (W + 1) + bx] - I[ay * (W + 1) + bx] - I[by * (W + 1) + ax] + I[ay * (W + 1) + ax]) / ((bx - ax) * (by - ay));
    }
  }
  return M;
}
function hucreOlc(D: Duz, kutu: number[]): Olcum {   // kutu: [x0, y0, x1, y1] mm
  const w = kutu[2] - kutu[0], h = kutu[3] - kutu[1];
  const ix = Math.max(0.7, w * 0.10), iy = Math.max(0.6, h * 0.12);
  const X0 = Math.round((kutu[0] + ix) * MMPX), X1 = Math.round((kutu[2] - ix) * MMPX), Y0 = Math.round((kutu[1] + iy) * MMPX), Y1 = Math.round((kutu[3] - iy) * MMPX);
  const n = Math.max(0, X1 - X0) * Math.max(0, Y1 - Y0);
  if (!n) return { oran: 0, zayif: 0, alan: 0, parcalar: [], sapma: 99, kapsamY: 0, kapsamX: 0, zayifY: 0 };
  let koyu = 0, zayif = 0;
  const satirlar = new Set<number>(), sutunlar = new Set<number>(), zSatir = new Set<number>();
  const CW = X1 - X0, CH = Y1 - Y0, maske = new Uint8Array(CW * CH), sutY = new Float64Array(CW), sutN = new Uint16Array(CW);
  const m = D.m!;
  for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
    const j = y * D.w + x, ort = m[j], fark = ort - D.g[j];
    if (fark > Math.max(20, ort * 0.1)) { zayif++; zSatir.add(y); }
    if (fark > Math.max(36, ort * 0.24)) { koyu++; satirlar.add(y); sutunlar.add(x); maske[(y - Y0) * CW + x - X0] = 1; sutY[x - X0] += y; sutN[x - X0]++; }
  }
  // bağlı parçalar: hangi kenarlara değiyor ve kenar boyunca kapladığı aralık (mm, sayfa koordinatı)
  const parcalar: Parca[] = [], etiket = new Int32Array(CW * CH), yigin: number[] = [];
  for (let b0 = 0; b0 < maske.length; b0++) {
    if (!maske[b0] || etiket[b0]) continue;
    const p: Parca = { n: 0, u: null, a: null, s: null, g: null };
    etiket[b0] = parcalar.length + 1; yigin.push(b0);
    const araliga = (k: Yon, v: number) => { const r = p[k]; if (!r) p[k] = [v, v]; else { if (v < r[0]) r[0] = v; if (v > r[1]) r[1] = v; } };
    while (yigin.length) {
      const t = yigin.pop()!, ty = (t / CW) | 0, tx = t - ty * CW; p.n++;
      const amx = (X0 + tx) / MMPX, amy = (Y0 + ty) / MMPX;
      if (ty < 2) araliga('u', amx); if (ty >= CH - 2) araliga('a', amx); if (tx < 2) araliga('s', amy); if (tx >= CW - 2) araliga('g', amy);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = tx + dx, ny = ty + dy; if (nx < 0 || ny < 0 || nx >= CW || ny >= CH) continue;
        const q = ny * CW + nx; if (maske[q] && !etiket[q]) { etiket[q] = parcalar.length + 1; yigin.push(q); }
      }
    }
    parcalar.push(p);
  }
  // düzlük: sütun sütun mürekkep merkezinin doğrudan sapması (mm)
  const xs: number[] = [], ys: number[] = [];
  for (let c = 0; c < CW; c++) if (sutN[c]) { xs.push(c); ys.push(sutY[c] / sutN[c]); }
  let sapma = 99;
  if (xs.length >= 5) {
    let mx = 0, my = 0; xs.forEach((v, i) => { mx += v; my += ys[i]; }); mx /= xs.length; my /= xs.length;
    let sxy = 0, sxx = 0; xs.forEach((v, i) => { sxy += (v - mx) * (ys[i] - my); sxx += (v - mx) * (v - mx); });
    const eg = sxx ? sxy / sxx : 0; let ss = 0; xs.forEach((v, i) => { const r = ys[i] - (my + eg * (v - mx)); ss += r * r; });
    sapma = Math.sqrt(ss / xs.length) / MMPX;
  }
  return { oran: koyu / n, zayif: zayif / n, alan: koyu / (MMPX * MMPX), parcalar, sapma,
    kapsamY: satirlar.size / (Y1 - Y0), kapsamX: sutunlar.size / (X1 - X0), zayifY: zSatir.size / (Y1 - Y0) };
}

/** komsu(yon) → komşu hücrenin ölçümü ('u' üst, 'a' alt, 's' sol, 'g' sağ) ya da null */
export function sinifla(m: Olcum, komsu?: (y: Yon) => Olcum | null): { s: 'P' | 'A' | '?'; neden?: string } {
  if (m.oran < ESIK.alt) {
    // açık renkli iz (kurşun kalem, soluk mürekkep)
    if (m.zayif >= ESIK.ust * 2 && m.zayifY >= 0.3 && m.zayif < 0.2) return { s: 'P' };
    if (m.zayif >= ESIK.ust) return { s: '?', neden: 'Açık renkli iz var (kurşun kalem ya da soluk mürekkep olabilir)' };
    return { s: 'A' };
  }
  // Taşma: bir parça kenardan çıkıp komşu hücrede, kenarın aynı noktasında devam ediyorsa ve komşudaki parça daha büyükse
  // bu parça komşunun imzasının ucudur. Hücrede kendine ait en az 1 mm² mürekkep yoksa belirsiz sayılır.
  const kars: Record<Yon, Yon> = { u: 'a', a: 'u', s: 'g', g: 's' };
  let kendi = 0, tasan = 0;
  for (const p of m.parcalar) {
    let uc = false;
    if (komsu) for (const yon of ['u', 'a', 's', 'g'] as Yon[]) {
      const r0 = p[yon]; if (uc || !r0) continue;
      const k = komsu(yon); if (!k) continue;
      let karsiN = 0;   // kenarın aynı noktalarından geçen komşu parçaların toplamı (U biçimli imzada iki kol ayrı parçadır)
      for (const kp of k.parcalar) { const r = kp[kars[yon]]; if (r && r[0] <= r0[1] + 1.2 && r[1] >= r0[0] - 1.2) karsiN += kp.n; }
      if (karsiN > p.n) uc = true;
    }
    if (uc) tasan += p.n; else kendi += p.n;
  }
  if (tasan && kendi / (MMPX * MMPX) < 1.0) return { s: '?', neden: 'İz komşu hücredeki imzadan taşmış olabilir' };
  if (m.kapsamY < 0.3 && m.kapsamX > ESIK.cizgiX && m.sapma < 0.18) return { s: '?', neden: 'Düz çizgi gibi görünüyor (tire / çizik olabilir)' };
  if (m.alan < 1.0 || m.oran < ESIK.ust) return { s: '?', neden: 'Çok az iz var (nokta ya da leke olabilir)' };
  return { s: 'P' };
}

/* ---------- Bir sayfayı oku ---------- */
/** evrakAl(no) → evrak kaydı ya da null. elleNo: QR okunamadığında kullanıcının yazdığı numara. */
export async function sayfaOku(kaynak: Kaynak, evrakAl: (no: string) => Promise<EvrakKaydi | null>, elleNo?: string): Promise<SayfaSonucu> {
  const q = elleNo ? null : qrBul(kaynak);
  const b = olcekle(kaynak, 2400), G = griYap(kaynak, b.w, b.h), k = b.k;
  if (!q && !elleNo) {
    // boş arka sayfa mı?
    let koyu = 0; for (let i = 0; i < G.g.length; i += 7) if (G.g[i] < 110) koyu++;
    return { durum: koyu / (G.g.length / 7) < 0.004 ? 'bos' : 'qr', onizleme: kucukOnizleme(kaynak) };
  }
  const no = elleNo ? String(elleNo).trim().toUpperCase() : q!.no;
  const e = await evrakAl(no);
  if (!e) return { durum: 'evrak', no, onizleme: kucukOnizleme(kaynak) };
  const Y = e.yerlesim || {};
  if (!Y.hiza?.length || !Y.satir?.length || !Y.sutun?.length) return { durum: 'evrak', no, neden: 'Evrak kaydında yerleşim bilgisi yok', onizleme: kucukOnizleme(kaynak) };
  const hiza = Y.hiza, satirY = Y.satir, sutunY = Y.sutun;
  const mm: Nokta[] = [], px: Nokta[] = [];
  if (q && Y.qr) {
    const qx = Y.qr[0] + Y.qr[2] * QR_KENAR, qy = Y.qr[1] + Y.qr[3] * QR_KENAR, qs = Y.qr[2] * (1 - 2 * QR_KENAR);
    mm.push([qx, qy], [qx + qs, qy], [qx + qs, qy + qs], [qx, qy + qs]);
    q.koseler.forEach(c => px.push([c.x * k, c.y * k]));
  }
  const merkez: Nokta[] = hiza.map(h => [h[0] + h[2] / 2, h[1] + h[3] / 2]);
  // QR'a yakından uzağa: sağ üst, sol üst, sağ alt, sol alt
  const sira = [1, 0, 3, 2], bulunan: { ix: number; x: number; y: number }[] = [];
  let H = mm.length ? benzerlik(mm, px) : null;
  if (!H) {
    // QR yok (elle numara): köşeleri sayfanın köşelerinde ara
    const tahmini = [[0.03, 0.03], [0.97, 0.03], [0.03, 0.97], [0.97, 0.97]];
    for (const ix of sira) {
      const t = tahmini[ix], o = Math.min(G.w / SAYFA_W, G.h / SAYFA_H) * 0.9;
      const f = isaretAra(G, t[0] * G.w, t[1] * G.h, o, 45, hiza[ix][2]);
      if (f) bulunan.push({ ix, ...f });
    }
  } else {
    for (const ix of sira) {
      const Hs = bulunan.length ? (modelUydur(mm.concat(bulunan.map(f => merkez[f.ix])), px.concat(bulunan.map(f => [f.x, f.y] as Nokta)), bulunan.length) || H) : H;
      const t = uygula(Hs, merkez[ix][0], merkez[ix][1]), o = yerelOlcek(Hs, merkez[ix][0], merkez[ix][1]);
      const f = isaretAra(G, t[0], t[1], o, bulunan.length >= 2 ? 18 : 34, hiza[ix][2]);
      if (f) bulunan.push({ ix, ...f });
    }
  }
  const tumMm = mm.concat(bulunan.map(f => merkez[f.ix])), tumPx = px.concat(bulunan.map(f => [f.x, f.y] as Nokta));
  if (bulunan.length < (q ? 2 : 3)) return { durum: 'isaret', no, bulunan: bulunan.length, onizleme: kucukOnizleme(kaynak) };
  const isaretN = bulunan.length;
  H = modelUydur(tumMm, tumPx, isaretN);
  if (!H) return { durum: 'isaret', no, bulunan: bulunan.length, onizleme: kucukOnizleme(kaynak) };
  // hata denetimi: en kötü noktayı at, yeniden hesapla
  const hata = (Hx: Mat) => tumMm.map((m, j) => { const p = uygula(Hx, m[0], m[1]); return Math.hypot(p[0] - tumPx[j][0], p[1] - tumPx[j][1]) / yerelOlcek(Hx, m[0], m[1]); });
  let hs = hata(H), enKotu = Math.max(...hs);
  if (enKotu > 1.5 && tumMm.length > 5) {
    const j = hs.indexOf(enKotu); tumMm.splice(j, 1); tumPx.splice(j, 1);
    H = modelUydur(tumMm, tumPx, isaretN) ?? H; hs = hata(H); enKotu = Math.max(...hs);
  }
  const guven = isaretN === 4 && enKotu < 1.2 ? 'yuksek' : isaretN >= 3 && enKotu < 2 ? 'orta' : 'dusuk';
  const D = duzelt(G, H);
  D.m = yerelOrtalama(D, 8);
  const ogr = e.ogrenciler || [], ns = (e.sutunlar || []).length, hucreler: Hucre[] = [], ek: { i: number; d: number; kutu: number[] }[] = [];
  // önce bütün imza hücrelerini ölç (komşu karşılaştırması için), sonra sınıfla
  const sonSut = 3 + ns * 2, olcum: (Olcum | null)[][] = [];
  for (let r0 = 0; r0 < satirY.length; r0++) {
    olcum.push([]);
    for (let c0 = 3; c0 < sonSut; c0++) { const u0 = sutunY[c0]; olcum[r0][c0] = u0 ? hucreOlc(D, [u0[0], satirY[r0][0], u0[1], satirY[r0][1]]) : null; }
  }
  const komsuFn = (r1: number, c1: number) => (yon: Yon) => {
    const rr = r1 + (yon === 'u' ? -1 : yon === 'a' ? 1 : 0), cc = c1 + (yon === 's' ? -1 : yon === 'g' ? 1 : 0);
    return rr >= 0 && rr < olcum.length && cc >= 3 && cc < sonSut ? olcum[rr][cc] : null;
  };
  for (let r = 0; r < satirY.length; r++) {
    const sat = satirY[r];
    for (let d = 0; d < ns; d++) for (let kk = 0; kk < 2; kk++) {
      const sut = sutunY[3 + d * 2 + kk], m = olcum[r][3 + d * 2 + kk]; if (!sut || !m) continue;
      if (r < ogr.length) {
        let c = sinifla(m, komsuFn(r, 3 + d * 2 + kk));
        if (guven === 'dusuk' && c.s !== '?' && m.oran > ESIK.alt * 0.5 && m.oran < ESIK.ust * 2) c = { s: '?', neden: 'Sayfa hizalaması zayıf; lütfen kontrol edin' };
        hucreler.push({ i: r, no: ogr[r], d, k: (kk + 1) as 1 | 2, s: c.s, neden: c.neden || '', oran: Math.round(m.oran * 10000) / 100, kutu: [sut[0], sat[0], sut[1], sat[1]] });
      } else if (m.oran >= ESIK.ust && sinifla(m, komsuFn(r, 3 + d * 2 + kk)).s === 'P') ek.push({ i: r, d, kutu: [sut[0], sat[0], sut[1], sat[1]] });
    }
    if (r >= ogr.length && sutunY[1]) {   // boş satıra elle yazılmış ad var mı
      const adK = sutunY[1], adM = hucreOlc(D, [adK[0], sat[0], adK[1], sat[1]]);
      if (adM.oran >= ESIK.ust && !ek.some(x => x.i === r)) ek.push({ i: r, d: -1, kutu: [adK[0], sat[0], adK[1], sat[1]] });
    }
  }
  const ekSatir = new Map<number, { i: number; kutu: number[] }>();
  ek.forEach(x => { if (!ekSatir.has(x.i)) ekSatir.set(x.i, { i: x.i, kutu: [sutunY[0][0], satirY[x.i][0], sutunY[sutunY.length - 1][1], satirY[x.i][1]] }); });
  return { durum: 'tamam', no, evrak: e, hucreler, ekSatirlar: [...ekSatir.values()], guven, isaret: bulunan.length,
    hataMm: Math.round(enKotu * 10) / 10, qr: !!q, gorsel: gorselUret(D, 4, 0.82) };
}

function kucukOnizleme(kaynak: Kaynak) {
  const b = olcekle(kaynak, 420), c = tuval(b.w, b.h), x = c.getContext('2d')!;
  x.fillStyle = '#fff'; x.fillRect(0, 0, b.w, b.h); x.drawImage(kaynak, 0, 0, b.w, b.h);
  return c.toDataURL('image/jpeg', 0.7);
}
/** Düzeltilmiş gri sayfadan JPEG (ön izleme, hücre görüntüleri ve arşiv için). */
function gorselUret(D: Gri, pxmm: number, kalite: number) {
  const W = Math.round(SAYFA_W * pxmm), Hh = Math.round(SAYFA_H * pxmm), c = tuval(W, Hh);
  const x = c.getContext('2d')!, id = x.createImageData(W, Hh), f = D.w / W;
  for (let v = 0; v < Hh; v++) for (let u = 0; u < W; u++) {
    const g = D.g[Math.min(D.h - 1, Math.floor((v + 0.5) * f)) * D.w + Math.min(D.w - 1, Math.floor((u + 0.5) * f))], j = (v * W + u) * 4;
    id.data[j] = id.data[j + 1] = id.data[j + 2] = g; id.data[j + 3] = 255;
  }
  x.putImageData(id, 0, 0);
  return c.toDataURL('image/jpeg', kalite);
}

/* ---------- Dosyalar → sayfa görüntüleri ---------- */
async function pdfSayfalari(dosya: File, her: (c: HTMLCanvasElement, n: number, top: number) => Promise<void>) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await dosya.arrayBuffer()) }).promise;
  for (let i = 1; i <= pdf.numPages; i++) {
    const s = await pdf.getPage(i), v1 = s.getViewport({ scale: 1 }), olc = Math.min(200 / 72, 2600 / Math.max(v1.width, v1.height));
    const vp = s.getViewport({ scale: olc }), c = tuval(Math.round(vp.width), Math.round(vp.height));
    const x = c.getContext('2d')!; x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    await s.render({ canvasContext: x, viewport: vp }).promise;
    await her(c, i, pdf.numPages);
    s.cleanup();
  }
  await pdf.destroy();
}
async function resimAc(dosya: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') { try { return await createImageBitmap(dosya, { imageOrientation: 'from-image' }); } catch { /* aşağıda dene */ } }
  return new Promise((ok, hata) => {
    const u = URL.createObjectURL(dosya), im = new Image();
    im.onload = () => ok(im);
    im.onerror = () => hata(new Error(dosya.name + ' açılamadı (HEIC gibi desteklenmeyen biçim olabilir; JPG olarak yükleyin).'));
    im.src = u;
  });
}
/** Dosyaları sırayla sayfa görüntülerine çevirir. */
export async function dosyalariGez(dosyalar: File[], her: (kaynak: Kaynak, etiket: string) => Promise<void>) {
  for (const f of dosyalar) {
    if (/pdf$/i.test(f.type) || /\.pdf$/i.test(f.name)) await pdfSayfalari(f, (c, n, top) => her(c, f.name + (top > 1 ? ' · sayfa ' + n : '')));
    else {
      const im = await resimAc(f);
      await her(im, f.name);
      if ('close' in im) im.close();
    }
  }
}
