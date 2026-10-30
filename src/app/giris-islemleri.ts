'use server';

import { revalidatePath } from 'next/cache';
import { cikisYap, girisYap, hocaKayit, kvkkOnayla, ogrenciKayit, sifreDegistir, type Sayfa } from '@/lib/oturum';

export type GirisDurumu = { mesaj: string; ok?: boolean };
const YOL: Record<Sayfa, string> = { ogrenci: '/', hoca: '/hoca', yonetim: '/yonetim' };
const al = (f: FormData, k: string) => String(f.get(k) ?? '');

async function guvenli(f: () => Promise<GirisDurumu>): Promise<GirisDurumu> {
  try { return await f(); } catch (e) {
    console.error(e);
    return { mesaj: 'Sunucuya ulaşılamadı. Birkaç saniye sonra tekrar deneyin.' };
  }
}

/** Giriş: öğrenci ekranında "kimlik" öğrenci numarası, diğerlerinde e-posta. */
export async function girisIslemi(sayfa: Sayfa, _onceki: GirisDurumu, form: FormData): Promise<GirisDurumu> {
  const r = await guvenli(async () => {
    const x = await girisYap(sayfa, al(form, 'kimlik'), al(form, 'sifre'));
    return x.ok ? { mesaj: '', ok: true } : { mesaj: x.mesaj };
  });
  if (r.ok) revalidatePath(YOL[sayfa]);
  return r;
}

export async function ogrenciKayitIslemi(_onceki: GirisDurumu, form: FormData): Promise<GirisDurumu> {
  const r = await guvenli(async () => {
    const x = await ogrenciKayit(al(form, 'no'), al(form, 'tc'), al(form, 'sifre'), al(form, 'tekrar'), al(form, 'kvkk') === 'evet');
    return x.ok ? { mesaj: '', ok: true } : { mesaj: x.mesaj };
  });
  if (r.ok) revalidatePath('/');
  return r;
}

export async function hocaKayitIslemi(_onceki: GirisDurumu, form: FormData): Promise<GirisDurumu> {
  return guvenli(() => hocaKayit({ adSoyad: al(form, 'adSoyad'), eposta: al(form, 'eposta'), hocaAdi: al(form, 'hocaAdi'), sifre: al(form, 'sifre'), tekrar: al(form, 'tekrar') }));
}

export async function sifreDegistirIslemi(sayfa: Sayfa, _onceki: GirisDurumu, form: FormData): Promise<GirisDurumu> {
  const r = await guvenli(() => sifreDegistir(al(form, 'eski'), al(form, 'yeni'), al(form, 'tekrar')));
  if (r.ok) revalidatePath(YOL[sayfa]);
  return r;
}

export async function kvkkOnayIslemi(_onceki: GirisDurumu, form: FormData): Promise<GirisDurumu> {
  const r = await guvenli(() => kvkkOnayla(al(form, 'kvkk') === 'evet'));
  if (r.ok) revalidatePath('/');
  return r;
}

export async function cikisIslemi(sayfa: Sayfa) {
  await cikisYap();
  revalidatePath(YOL[sayfa]);
}
