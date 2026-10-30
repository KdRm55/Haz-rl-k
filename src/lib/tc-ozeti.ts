/**
 * TC kimlik numarasının son 6 hanesi veritabanına açık yazılmaz: sunucudaki gizli anahtarla (VERI_ANAHTARI) HMAC-SHA256
 * özeti alınır. Anahtar veritabanında değil Vercel ortam değişkenlerinde durduğundan, veritabanı ele geçirilse bile
 * 1 milyon olasılığın denenmesiyle haneler bulunamaz. Anahtar değişirse kayıtlı özetler geçersiz olur.
 * Betikler de kullandığı için 'server-only' içe aktarılmaz.
 */
import { createHmac } from 'node:crypto';
import { KullaniciHatasi } from './hata';
import { TC_OZET_ONEK } from './hesap-kurallari';

export function tcOzetHesapla(son6: string, anahtar: string): string {
  return TC_OZET_ONEK + createHmac('sha256', anahtar).update('tc6:' + son6).digest('base64url');
}

function anahtar() {
  const k = process.env.VERI_ANAHTARI;
  if (!k || k.length < 32) throw new KullaniciHatasi('Sunucuda VERI_ANAHTARI tanımlı değil (en az 32 karakter); TC bilgisi kaydedilemez. .env.example dosyasına bakın.');
  return k;
}

/** Son 6 hanenin özeti; boşsa ''. */
export const tcOzeti = (son6: string) => (son6 ? tcOzetHesapla(son6, anahtar()) : '');
