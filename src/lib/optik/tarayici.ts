/**
 * Tarayıcıda optik dosyası okuma: görüntü çözülür, QR okunur, baloncuklar okunur ve öğrenciye gösterilecek küçültülmüş
 * görüntü (JPEG) hazırlanır. Tam boyutlu tarama sunucuya gönderilmez.
 */
import jsQR from 'jsqr';
import { griYap, optikOku, type Okuma } from './okuyucu';

export type DosyaOkumasi = {
  dosya: string;
  karekod: string;           // QR metni; okunamazsa ''
  okuma: Okuma;
  gorsel: string;            // küçültülmüş JPEG (data URL); kâğıt baş aşağı ise düzeltilmiş
  uyari: string;             // çoklu / zayıf işaret açıklaması
};

const GORSEL_GENISLIK = 1100;

function tuvaleCiz(bmp: ImageBitmap, ters = false, genislik = bmp.width) {
  const o = genislik / bmp.width, c = document.createElement('canvas');
  c.width = Math.round(bmp.width * o); c.height = Math.round(bmp.height * o);
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  if (ters) { x.translate(c.width, c.height); x.rotate(Math.PI); }
  x.drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}

/** RGBA'yı siyah-beyaza çevirir (en parlak kanal: renkli tarayıcı çizgileri beyaz olur; esik=0 ise yalnızca griye çevirir). */
function ikiliYap(d: Uint8ClampedArray, esik: number): Uint8ClampedArray {
  const o = new Uint8ClampedArray(d.length);
  for (let i = 0; i < d.length; i += 4) {
    let g = Math.max(d[i], d[i + 1], d[i + 2]);
    if (esik) g = g < esik ? 0 : 255;
    o[i] = o[i + 1] = o[i + 2] = g; o[i + 3] = 255;
  }
  return o;
}

/**
 * QR'ı sırayla çeşitli yöntemlerle arar: ham görüntü, farklı eşiklerle siyah-beyaz, sol üst köşe büyütülmüş.
 * Silik ya da hafif bozuk karekodlar eşikleme ile okunur.
 */
function karekodOku(bmp: ImageBitmap): string {
  const tam = tuvaleCiz(bmp);
  const v = tam.getContext('2d')!.getImageData(0, 0, tam.width, tam.height);
  const dene = (data: Uint8ClampedArray, w: number, h: number) => jsQR(data, w, h)?.data?.trim() ?? '';
  let k = dene(v.data, v.width, v.height);
  if (k) return k;
  for (const esik of [0, 128, 90, 160, 110, 70]) {
    k = dene(ikiliYap(v.data, esik), v.width, v.height);
    if (k) return k;
  }
  // sol üst köşe 2 kat büyütülüp denenir
  const w = Math.round(bmp.width * 0.4), h = Math.round(bmp.height * 0.3);
  const kes = document.createElement('canvas');
  kes.width = w * 2; kes.height = h * 2;
  const kx = kes.getContext('2d', { willReadFrequently: true })!;
  kx.imageSmoothingQuality = 'high';
  kx.drawImage(tam, 0, 0, w, h, 0, 0, w * 2, h * 2);
  const d2 = kx.getImageData(0, 0, kes.width, kes.height);
  for (const esik of [-1, 0, 128, 90, 160]) {
    k = dene(esik < 0 ? d2.data : ikiliYap(d2.data, esik), d2.width, d2.height);
    if (k) return k;
  }
  return '';
}

/** Dosyayı base64 parçalara böler (her parça 1,5 MB ham = 3'ün katı, parçalar art arda eklenince geçerli base64 olur). */
export async function* base64Parcalari(f: Blob, parcaBayt = 1_500_000): AsyncGenerator<string> {
  for (let bas = 0; bas < f.size; bas += parcaBayt) {
    const url = await new Promise<string>((coz, red) => {
      const r = new FileReader();
      r.onload = () => coz(String(r.result)); r.onerror = () => red(r.error);
      r.readAsDataURL(f.slice(bas, bas + parcaBayt));
    });
    yield url.slice(url.indexOf(',') + 1);
  }
}

/** Elle girilen kayıtlara eklenecek görüntüyü küçültüp JPEG (data URL) yapar. */
export async function optikGorseliHazirla(f: File): Promise<string> {
  const bmp = await createImageBitmap(f);
  try { return tuvaleCiz(bmp, false, Math.min(GORSEL_GENISLIK, bmp.width)).toDataURL('image/jpeg', 0.72); }
  finally { bmp.close(); }
}

export async function optikDosyasiOku(f: File): Promise<DosyaOkumasi> {
  const bmp = await createImageBitmap(f);
  try {
    const tam = tuvaleCiz(bmp);
    const veri = tam.getContext('2d')!.getImageData(0, 0, tam.width, tam.height);
    const okuma = optikOku(griYap(veri.data, veri.width, veri.height));
    const karekod = karekodOku(bmp);
    const kucuk = tuvaleCiz(bmp, okuma.ok && !!okuma.ters180, GORSEL_GENISLIK);
    const gorsel = kucuk.toDataURL('image/jpeg', 0.72);
    const uyari: string[] = [];
    if (okuma.ok) {
      if (okuma.coklu.length) uyari.push('Birden fazla işaret: ' + okuma.coklu.map(q => 'S' + q).join(', '));
      if (okuma.zayif.length) uyari.push('Silik işaret: ' + okuma.zayif.map(q => 'S' + q).join(', '));
    }
    return { dosya: f.name, karekod, okuma, gorsel, uyari: uyari.join('; ') };
  } finally {
    bmp.close();
  }
}
