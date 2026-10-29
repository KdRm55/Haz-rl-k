'use server';

import { donemSonuclari } from '@/lib/donem-sinav';
import { YetkiHatasi } from '@/lib/hata';
import type { DonemSonucu } from '@/lib/tipler';

/** Giriş yapmış öğrencinin dönem sınavı puanları. */
export async function donemSonuclariIslemi(): Promise<DonemSonucu> {
  try {
    return await donemSonuclari();
  } catch (e) {
    if (e instanceof YetkiHatasi) return { ok: false, mesaj: 'Oturumun kapanmış. Sayfayı yenileyip yeniden giriş yap.' };
    console.error(e);
    return { ok: false, mesaj: 'Sunucuya ulaşılamadı. Birkaç saniye sonra tekrar dene.' };
  }
}
