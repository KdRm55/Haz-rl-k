'use server';

import * as aktarim from '@/lib/aktarim';
import * as ds from '@/lib/donem-sinav';
import { ogrenciAra } from '@/lib/ogrenci';
import * as sye from '@/lib/sinav-yeri';
import { sar } from '@/lib/islem-sonucu';
import { sistemKontrolu } from '@/lib/kontrol';
import * as sy from '@/lib/sinav-yonetim';
import * as sn from '@/lib/siniflandirma';
import * as y from '@/lib/yonetim';
import * as hs from '@/lib/hesaplar';
import * as yk from '@/lib/yoklama';
import { yedekOzeti } from '@/lib/yedek';

/* Öğrenci listesi yükleme */
export async function aktarimOnizleIslemi(satirlar: string[][], basSatir: number | null) { return sar(() => aktarim.aktarimOnizle(satirlar, basSatir)); }
export async function aktarimFarkIslemi(veri: aktarim.AktarimVerisi) { return sar(() => aktarim.aktarimFark(veri)); }
export async function aktarimUygulaIslemi(veri: aktarim.AktarimVerisi) { return sar(() => aktarim.aktarimUygula(veri)); }
export async function aktarimGecmisiIslemi() { return sar(() => aktarim.aktarimGecmisi()); }

/* Öğrenciler */
export async function ogrenciListesiIslemi() { return sar(() => y.ogrenciListesi()); }
export async function disaAktarimIslemi() { return sar(() => y.disaAktarimListesi()); }
export async function ogrenciGuncelleIslemi(no: string, v: Parameters<typeof y.ogrenciGuncelle>[1]) { return sar(() => y.ogrenciGuncelle(no, v)); }
export async function ogrenciEkleIslemi(v: y.OgrenciEklemeGirdisi) { return sar(() => y.ogrenciEkle(v)); }
export async function ogrenciGecmisiIslemi(no: string) { return sar(() => y.ogrenciGecmisi(no)); }

/* Sınıflar ve ders programı */
export async function sinifListesiIslemi() { return sar(() => y.sinifListesi()); }
export async function sinifKaydetIslemi(v: Parameters<typeof y.sinifKaydet>[0]) { return sar(() => y.sinifKaydet(v)); }
export async function sinifSilIslemi(id: number) { return sar(() => y.sinifSil(id)); }
export async function programListesiIslemi() { return sar(() => y.programListesi()); }
export async function programKaydetIslemi(satirlar: y.ProgramGirdisi[]) { return sar(() => y.programKaydet(satirlar)); }

/* Duyurular ve öğrenci ekranı */
export async function duyuruDurumuIslemi() { return sar(() => y.duyuruDurumu()); }
export async function duyuruEkleIslemi(v: Parameters<typeof y.duyuruEkle>[0]) { return sar(() => y.duyuruEkle(v)); }
export async function duyuruAktiflikIslemi(id: number, aktif: boolean) { return sar(() => y.duyuruAktiflik(id, aktif)); }
export async function duyuruSilIslemi(id: number) { return sar(() => y.duyuruSil(id)); }
export async function gorunumDurumuIslemi() { return sar(() => y.gorunumDurumu()); }
export async function gorunumKaydetIslemi(ad: string, acik: boolean) { return sar(() => y.gorunumKaydet(ad, acik)); }
export async function gorunumOnizleIslemi(no: string) { return sar(() => y.gorunumOnizle(no)); }

/* Ayarlar, erişim kodları, kayıtlar, kontrol */
export async function ayarListesiIslemi() { return sar(() => y.ayarListesi()); }
export async function ayarlarKaydetIslemi(d: Record<string, string>) { return sar(() => y.ayarlarKaydet(d)); }
export async function islemKaydiIslemi() { return sar(() => y.islemKaydiListesi()); }
export async function sistemKontroluIslemi() { return sar(() => sistemKontrolu()); }
export async function panelOzetiIslemi() { return sar(() => y.panelOzeti()); }

/* Muafiyet sınavı */
export async function sinavDurumuIslemi() { return sar(() => sy.sinavDurumu()); }
export async function sinavListesiIslemi() { return sar(() => sy.sinavListesi()); }
export async function sinavListesiniGuncelleIslemi() { return sar(() => sy.sinavListesiniGuncelle()); }
export async function sinavSatirGuncelleIslemi(no: string, v: Parameters<typeof sy.sinavSatirGuncelle>[1]) { return sar(() => sy.sinavSatirGuncelle(no, v)); }
export async function sinavYerYazIslemi(nolar: string[], yer: string) { return sar(() => sy.sinavYerYaz(nolar, yer)); }
export async function sinavSatirSilIslemi(no: string) { return sar(() => sy.sinavSatirSil(no)); }
export async function kuralOnizleIslemi(k: Record<string, unknown>, ornek?: { yazili?: string; sozlu?: string }) { return sar(() => sy.kuralOnizle(k, ornek)); }
export async function kuralKaydetIslemi(k: Record<string, unknown>) { return sar(() => sy.kuralKaydet(k)); }
export async function asamaIsaretleIslemi(asama: 'yazili' | 'sozlu', tamam: boolean) { return sar(() => sy.asamaIsaretle(asama, tamam)); }
export async function yayinlaIslemi(ac: boolean) { return sar(() => sy.yayinla(ac)); }
export async function puanOnizleIslemi(satirlar: string[][], bas: number | null) { return sar(() => sy.puanOnizle(satirlar, bas)); }
export async function puanFarkIslemi(v: sy.PuanVerisi) { return sar(() => sy.puanFark(v)); }
export async function puanUygulaIslemi(v: sy.PuanVerisi) { return sar(() => sy.puanUygula(v)); }

/* Sınıf oluşturma ve sınıf değişikliği */
export async function taslakDurumuIslemi() { return sar(() => sn.taslakDurumu()); }
export async function taslakOlusturIslemi(sabitleriKoru: boolean, duzen?: Record<string, unknown>) { return sar(() => sn.taslakOlustur(sabitleriKoru, duzen)); }
export async function taslakSatirIslemi(no: string, v: { sinif?: string; sabit?: boolean }) { return sar(() => sn.taslakSatirGuncelle(no, v)); }
export async function taslakYayinlaIslemi(imza: string) { return sar(() => sn.taslakYayinla(imza)); }
export async function sinifDegisimVerisiIslemi() { return sar(() => sn.sinifDegisimVerisi()); }
export async function sinifDegistirIslemi(istek: Parameters<typeof sn.sinifDegistir>[0]) { return sar(() => sn.sinifDegistir(istek)); }

/* Dönem sınavları */
export async function dsDurumIslemi() { return sar(() => ds.dsDurum()); }
export async function dsOlusturIslemi(v: Parameters<typeof ds.dsSinavOlustur>[0]) { return sar(() => ds.dsSinavOlustur(v)); }
export async function dsGuncelleIslemi(v: Parameters<typeof ds.dsSinavGuncelle>[0]) { return sar(() => ds.dsSinavGuncelle(v)); }
export async function dsOgrenciGuncelleIslemi(kod: string) { return sar(() => ds.dsOgrenciGuncelle(kod)); }
export async function dsYerKaydetIslemi(kod: string, yerler: Record<string, string>) { return sar(() => ds.dsYerKaydet(kod, yerler)); }
export async function dsYayinIslemi(kod: string, alan: 'yer' | 'sonuc', ders: string | null, ac: boolean) { return sar(() => ds.dsYayin(kod, alan, ders, ac)); }
export async function dsArsivIslemi(kod: string, arsiv: boolean) { return sar(() => ds.dsArsiv(kod, arsiv)); }
export async function dsPuanTablosuIslemi(kod: string) { return sar(() => ds.dsPuanTablosu(kod)); }
export async function dsPuanKaydetIslemi(kod: string, d: { no: string; ders: string; puan: string }[]) { return sar(() => ds.dsPuanKaydet(kod, d)); }
export async function dsPuanOnizleIslemi(kod: string, satirlar: string[][], bas: number | null) { return sar(() => ds.dsPuanOnizle(kod, satirlar, bas)); }
export async function dsPuanFarkIslemi(v: ds.DsPuanVerisi) { return sar(() => ds.dsPuanFark(v)); }
export async function dsPuanUygulaIslemi(v: ds.DsPuanVerisi) { return sar(() => ds.dsPuanUygula(v)); }

/* Sınav yeri listeleri */
export async function syDurumIslemi() { return sar(() => sye.syDurum()); }
export async function syOnizleIslemi(satirlar: string[][], bas: number | null) { return sar(() => sye.syOnizle(satirlar, bas)); }
export async function syFarkIslemi(v: sye.SyVerisi) { return sar(() => sye.syFark(v)); }
export async function syKaydetIslemi(v: sye.SyVerisi) { return sar(() => sye.syKaydet(v)); }
export async function syGuncelleIslemi(kod: string, meta: Parameters<typeof sye.syGuncelle>[1]) { return sar(() => sye.syGuncelle(kod, meta)); }
export async function syYayinIslemi(kod: string, ac: boolean) { return sar(() => sye.syYayin(kod, ac)); }
export async function sySilIslemi(kod: string) { return sar(() => sye.sySil(kod)); }
export async function syTaniIslemi(no: string) { return sar(() => sye.syTani(no, n => ogrenciAra(n, '', true))); }

/* Yoklama ve devamsızlık */
export async function yoklamaAyarlariIslemi() { return sar(() => yk.yoklamaAyarlari()); }
export async function yoklamaAyarKaydetIslemi(p: { yuzde: number; hafta: number; baslangic: string }) { return sar(() => yk.yoklamaAyarKaydet(p)); }
export async function yoklamaRaporuIslemi(sinif: string) { return sar(() => yk.yoklamaRaporu(String(sinif))); }
export async function yoklamaEksiklerIslemi() { return sar(() => yk.yoklamaEksikler()); }
export async function taramaArsiviIslemi() { return sar(() => yk.taramaArsivi()); }
export async function taramaArsiviSilIslemi() { return sar(() => yk.taramaArsiviSil()); }

/* Yedek */
export async function yedekOzetiIslemi() { return sar(() => yedekOzeti()); }

/* Kullanıcı hesapları */
export async function hesapListesiIslemi() { return sar(() => hs.hesapListesi()); }
export async function hocaOnaylaIslemi(id: number, hocaAdi: string) { return sar(() => hs.hocaOnayla(Number(id), String(hocaAdi))); }
export async function hesapEkleIslemi(v: Parameters<typeof hs.hesapEkle>[0]) { return sar(() => hs.hesapEkle(v)); }
export async function hesapGuncelleIslemi(id: number, v: Parameters<typeof hs.hesapGuncelle>[1]) { return sar(() => hs.hesapGuncelle(Number(id), v)); }
export async function hesapDurumuIslemi(id: number, durum: 'aktif' | 'pasif') { return sar(() => hs.hesapDurumu(Number(id), durum === 'pasif' ? 'pasif' : 'aktif')); }
export async function sifreSifirlaIslemi(id: number) { return sar(() => hs.sifreSifirla(Number(id))); }
export async function hesapSilIslemi(id: number) { return sar(() => hs.hesapSil(Number(id))); }
