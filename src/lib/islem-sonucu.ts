/** Sunucu işlemlerinin ortak sonucu: hata mesajı tarayıcıya güvenli biçimde taşınır. */
import { KullaniciHatasi, YetkiHatasi } from './hata';

export type Sonuc<T> = { ok: true; veri: T } | { ok: false; hata: string; yetkisiz?: boolean };

export async function sar<T>(f: () => Promise<T>): Promise<Sonuc<T>> {
  try {
    return { ok: true, veri: await f() };
  } catch (e) {
    if (e instanceof YetkiHatasi) return { ok: false, hata: e.message, yetkisiz: true };
    if (e instanceof KullaniciHatasi) return { ok: false, hata: e.message };
    console.error(e);
    return { ok: false, hata: 'Beklenmeyen bir hata oluştu. Birkaç saniye sonra tekrar deneyin.' };
  }
}
