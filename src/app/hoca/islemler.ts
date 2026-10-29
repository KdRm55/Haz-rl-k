'use server';

import * as hoca from '@/lib/hoca';
import { sar } from '@/lib/islem-sonucu';
import type { TelafiGirdisi } from '@/lib/sirku-kurallari';
import * as yk from '@/lib/yoklama';

export async function baslangicIslemi() { return sar(() => hoca.hocaBaslangic()); }
export async function haftalikIslemi(teacher: string, hafta: string) { return sar(() => hoca.hocaHaftalik(String(teacher), String(hafta))); }
export async function topluIslemi(hafta: string) { return sar(() => hoca.topluHaftalik(String(hafta))); }
export async function telafiIslemi(teacher: string, veri: Record<string, TelafiGirdisi>) { return sar(() => hoca.telafi(String(teacher), veri)); }
export async function programIslemi(teacher: string) { return sar(() => hoca.hocaProgrami(String(teacher))); }

/* ---------- Yoklama (hoca ekranı ve yönetim panelindeki tarama ortak) ---------- */
export async function yoklamaHaftasiIslemi(teacher: string, hafta: string) { return sar(() => yk.yoklamaHaftasi(String(teacher), String(hafta))); }
export async function yoklamaGetirIslemi(o: yk.OturumGirdisi) { return sar(() => yk.yoklamaGetir(o)); }
export async function yoklamaKaydetIslemi(p: yk.KayitGirdisi) { return sar(() => yk.yoklamaKaydet(p)); }
export async function yoklamaSilIslemi(anahtar: string) { return sar(() => yk.yoklamaSil(String(anahtar))); }
export async function evrakKaydetIslemi(sayfalar: yk.EvrakSayfasi[]) { return sar(() => yk.evrakKaydet(sayfalar)); }
export async function taramaHazirlaIslemi(numaralar: string[]) { return sar(() => yk.taramaHazirla(numaralar)); }
export async function taramaKaydetIslemi(kayitlar: (yk.KayitGirdisi & { evraklar?: string[] })[]) { return sar(() => yk.taramaKaydet(kayitlar)); }
export async function taramaGorselIslemi(no: string, dataUrl: string) { return sar(() => yk.taramaGorselKaydet(String(no), String(dataUrl))); }
