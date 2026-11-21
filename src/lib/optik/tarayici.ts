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

/** QR'ı önce bütün sayfada, olmazsa sol üst köşeyi kırpıp büyüterek arar. */
function karekodOku(bmp: ImageBitmap): string {
  const tam = tuvaleCiz(bmp);
  const veri = tam.getContext('2d')!.getImageData(0, 0, tam.width, tam.height);
  const r = jsQR(veri.data, veri.width, veri.height);
  if (r?.data) return r.data.trim();
  const w = Math.round(bmp.width * 0.4), h = Math.round(bmp.height * 0.3);
  const kes = document.createElement('canvas');
  kes.width = w * 2; kes.height = h * 2;
  const kx = kes.getContext('2d', { willReadFrequently: true })!;
  kx.imageSmoothingQuality = 'high';
  kx.drawImage(tam, 0, 0, w, h, 0, 0, w * 2, h * 2);
  const d2 = kx.getImageData(0, 0, kes.width, kes.height);
  return jsQR(d2.data, d2.width, d2.height)?.data?.trim() ?? '';
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
