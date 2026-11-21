'use server';

import { donemSonuclari } from '@/lib/donem-sinav';
import { YetkiHatasi } from '@/lib/hata';
import { optikOgrenci, type OgrenciOptigi } from '@/lib/optik-yonetim';
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

/** Giriş yapmış öğrencinin yayınlanmış optikleri ve cevap anahtarları (yalnızca kendi optiği). */
export async function optiklerimIslemi(): Promise<{ ok: true; optikler: OgrenciOptigi[] } | { ok: false; mesaj: string }> {
  try {
    return { ok: true, optikler: await optikOgrenci() };
  } catch (e) {
    if (e instanceof YetkiHatasi) return { ok: false, mesaj: 'Oturumun kapanmış. Sayfayı yenileyip yeniden giriş yap.' };
    console.error(e);
    return { ok: false, mesaj: 'Sunucuya ulaşılamadı. Birkaç saniye sonra tekrar dene.' };
  }
}
