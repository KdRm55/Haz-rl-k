/**
 * Sistem kontrolü — Apps Script kontrolRaporu_ / prolizCaprazKontrol_ / sinavCaprazKontrol_ karşılığı.
 * Yeni düzende sınıf listeleri ile öğrenci listesi tek tabloda olduğu için "mükerrer kayıt", "başlık bulunamadı"
 * ve "ad farklı yazılmış" denetimleri artık gereksiz; bunların yerine kayıt tutarlılığı denetlenir.
 */
import 'server-only';
import { asc } from 'drizzle-orm';
import { vt, schema } from '@/db';
import { AYAR_TANIMLARI } from './ayar-tanimlari';
import { dsKontrol } from './donem-sinav';
import { basNorm, subeEslestir, TR_GUN_SIRA } from './metin';
import { ayarlarOku } from './ogrenci';
import { yetkiGerekli } from './oturum';
import { SONUC, sinavKurali, sinavSonucu } from './sinav';

export type Seviye = 'hata' | 'uyari' | 'bilgi';
export type Sorun = { seviye: Seviye; konu: string; ayrinti: string };

const kisalt = (a: string[], n = 10) => a.slice(0, n).join(', ') + (a.length > n ? ` … (toplam ${a.length})` : '');

export async function sistemKontrolu() {
  await yetkiGerekli(['admin']);
  const db = vt();
  const [a, siniflar, ogrenciler, program, sinav, kodlar] = await Promise.all([
    ayarlarOku(),
    db.select().from(schema.siniflar).orderBy(asc(schema.siniflar.anahtar)),
    db.select().from(schema.ogrenciler).orderBy(asc(schema.ogrenciler.sinifSira), asc(schema.ogrenciler.no)),
    db.select().from(schema.hocaProgrami).orderBy(asc(schema.hocaProgrami.sira)),
    db.select().from(schema.sinavSonuclari),
    db.select({ rol: schema.erisimKodlari.rol }).from(schema.erisimKodlari)
  ]);
  const sorunlar: Sorun[] = [];
  const ekle = (seviye: Seviye, konu: string, ayrinti: string) => sorunlar.push({ seviye, konu, ayrinti });

  // Erişim
  if (!kodlar.some(k => k.rol === 'admin')) ekle('uyari', 'Erişim', 'Yönetim erişim kodu tanımlı değil.');
  if (!kodlar.some(k => k.rol === 'hoca')) ekle('uyari', 'Erişim', 'Hoca erişim kodu tanımlı değil; öğretim elemanları imza ekranına giremez.');

  // Sınav sonuçları (muaf öğrenciler aşağıda kullanılır)
  const kural = sinavKurali(a);
  const sinavSonuc = new Map(sinav.map(s => [s.no, sinavSonucu(s.yazili, s.sozlu, kural)]));
  const muaf = (no: string) => sinavSonuc.get(no)?.sonuc === SONUC.MUAF;

  // Sınıflar
  const aktifler = siniflar.filter(s => s.aktif);
  if (!aktifler.length) ekle('hata', 'Sınıflar', 'Hiç aktif sınıf yok. "Sınıflar" sekmesinden sınıf ekleyin.');
  const dogrulamaEski = !!a.DOGRULAMA_SUTUNU && basNorm(a.OGRENCI_DOGRULAMA) !== 'EVET';
  for (const s of siniflar) {
    const liste = ogrenciler.filter(o => o.sinifId === s.id);
    if (!s.aktif) { ekle('bilgi', s.ad, `Pasif; hiçbir ekranda görünmüyor${liste.length ? ` (${liste.length} öğrencisi var)` : ''}.`); continue; }
    if (!s.derslik) ekle('uyari', s.ad, 'Derslik bilgisi boş; öğrencilere "-" görünür.');
    if (s.kapasite && liste.length > s.kapasite) ekle('uyari', s.ad, `Öğrenci sayısı (${liste.length}) kapasiteyi (${s.kapasite}) aşıyor.`);
    let eksikDog = 0;
    for (const o of liste) {
      const kisi = `${o.no} ${(o.adi + ' ' + o.soyadi).trim()}`;
      if (o.durum === 'silindi') ekle('hata', s.ad, `${kisi} — öğrenci listesinde kaydı silinmiş ama sınıfta duruyor.`);
      if ((s.tur === 'K' || s.tur === 'E') && o.cinsiyet && o.cinsiyet !== s.tur) ekle('hata', s.ad, `${kisi} ${o.cinsiyet === 'K' ? 'kız' : 'erkek'}, sınıf türü ${s.tur}.`);
      if (muaf(o.no)) ekle('hata', s.ad, `${kisi} muafiyet sınavını geçmiş ama sınıfta duruyor.`);
      if (dogrulamaEski && !o.dogrulamaDegeri) eksikDog++;
    }
    if (eksikDog) ekle('uyari', s.ad, `${eksikDog} öğrencinin doğrulama bilgisi boş; bu öğrenciler sorgulama yapamaz.`);
  }

  // Öğrenci listesi
  const kayitli = ogrenciler.filter(o => o.kayitli);
  if (!kayitli.length) ekle('bilgi', 'Öğrenci listesi', 'Henüz öğrenci listesi yüklenmemiş.');
  const yalnizSinifta = ogrenciler.filter(o => !o.kayitli && o.sinifId);
  if (kayitli.length && yalnizSinifta.length) ekle('uyari', 'Öğrenci listesi', 'Sınıfa yerleştirilmiş ama yüklenen öğrenci listesinde olmayan öğrenciler: ' + kisalt(yalnizSinifta.map(o => o.no)) + '.');
  const aktifSinifId = new Set(aktifler.map(s => s.id));
  const yerlesmemis = kayitli.filter(o => o.durum === 'aktif' && !(o.sinifId && aktifSinifId.has(o.sinifId)) && !muaf(o.no));
  if (yerlesmemis.length) ekle('bilgi', 'Yerleştirme', `${yerlesmemis.length} kayıtlı öğrenci henüz hiçbir sınıfta değil: ${kisalt(yerlesmemis.map(o => o.no))}.`);
  // Öğrenci hesabı TC son 6 haneyle açılır
  const tcsiz = kayitli.filter(o => o.durum === 'aktif' && !o.tc6);
  if (tcsiz.length) ekle('bilgi', 'Öğrenci hesapları', `${tcsiz.length} aktif öğrencinin TC son 6 hanesi sistemde yok; bu öğrenciler hesap açarken yazdıkları haneler kaydedilir: ${kisalt(tcsiz.map(o => o.no))}.`);
  const hk = await db.select({ tur: schema.kullanicilar.tur, durum: schema.kullanicilar.durum }).from(schema.kullanicilar);
  if (!hk.some(h => h.tur === 'admin' && h.durum === 'aktif')) ekle('hata', 'Hesaplar', 'Etkin yönetici hesabı yok. Bilgisayardan "npm run yonetici" ile ekleyin.');
  const bekleyen = hk.filter(h => h.durum === 'bekliyor').length;
  if (bekleyen) ekle('bilgi', 'Hesaplar', `${bekleyen} öğretim elemanı hesabı onay bekliyor ("Kullanıcılar" sekmesi).`);

  // Sınav ayarları ve sonuçları
  for (const t of AYAR_TANIMLARI.filter(x => x.grup === 'Muafiyet sınavı' && x.tur === 'sayi')) {
    const v = a[t.anahtar];
    const x = Number(String(v ?? '').replace(',', '.'));
    if (v !== undefined && v !== '' && (isNaN(x) || x < 0 || x > 100)) ekle('hata', 'Sınav ayarları', `${t.anahtar} değeri 0–100 arasında bir sayı olmalı ("${v}"). Varsayılan ${t.varsayilan} kullanılıyor.`);
  }
  const hatali = sinav.filter(s => sinavSonuc.get(s.no)?.sonuc === SONUC.HATA);
  if (hatali.length) ekle('hata', 'Sınav sonuçları', `${hatali.length} öğrencinin puanı hatalı: ${kisalt(hatali.map(s => s.no), 8)}.`);
  const ogrHarita = new Map(ogrenciler.map(o => [o.no, o]));
  const sinavKayitsiz = sinav.filter(s => !ogrHarita.get(s.no)?.kayitli);
  if (kayitli.length && sinavKayitsiz.length) ekle('uyari', 'Sınav sonuçları', 'Öğrenci listesinde olmayan numaralar: ' + kisalt(sinavKayitsiz.map(s => s.no)) + '.');
  const sinavSilik = sinav.filter(s => ogrHarita.get(s.no)?.durum === 'silindi');
  if (sinavSilik.length) ekle('bilgi', 'Sınav sonuçları', `${sinavSilik.length} öğrencinin kaydı silinmiş ama sınav listesinde duruyor: ${kisalt(sinavSilik.map(s => s.no))}.`);

  // Dönem sınavları
  await dsKontrol(db, ekle);

  // Ders programı
  if (!program.length) ekle('uyari', 'Ders programı', 'Ders programı boş; imza sirküleri oluşturulamaz.');
  const eslesmeyen = new Map<string, number[]>(), gunHata = new Map<string, number[]>();
  program.forEach((r, i) => {
    if (!subeEslestir(r.sube, aktifler)) eslesmeyen.set(r.sube || '(boş)', [...(eslesmeyen.get(r.sube || '(boş)') ?? []), i + 1]);
    if (TR_GUN_SIRA[basNorm(r.gun)] == null) gunHata.set(r.gun || '(boş)', [...(gunHata.get(r.gun || '(boş)') ?? []), i + 1]);
  });
  const sat = (a: number[]) => a.slice(0, 6).join(', ') + (a.length > 6 ? ' …' : '');
  eslesmeyen.forEach((v, k) => ekle('uyari', 'Ders programı', `Şube "${k}" hiçbir aktif sınıfla eşleşmiyor (satır ${sat(v)}). Bu dersler imza sirküsüne düşmez.`));
  gunHata.forEach((v, k) => ekle('uyari', 'Ders programı', `Gün "${k}" tanınmadı (satır ${sat(v)}). Pazartesi…Pazar yazılmalı.`));

  const sira: Record<Seviye, number> = { hata: 0, uyari: 1, bilgi: 2 };
  sorunlar.sort((x, y) => sira[x.seviye] - sira[y.seviye]);
  return {
    zaman: new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'short', timeStyle: 'short' }).format(new Date()),
    ozet: {
      sinif: aktifler.length,
      ogrenci: ogrenciler.filter(o => o.sinifId && aktifSinifId.has(o.sinifId)).length,
      hata: sorunlar.filter(s => s.seviye === 'hata').length,
      uyari: sorunlar.filter(s => s.seviye === 'uyari').length
    },
    siniflar: siniflar.map(s => ({ ad: s.ad, derslik: s.derslik || '-', tur: s.tur || '-', kapasite: s.kapasite || '-', sayi: ogrenciler.filter(o => o.sinifId === s.id).length, aktif: s.aktif })),
    sorunlar
  };
}
export type KontrolRaporu = Awaited<ReturnType<typeof sistemKontrolu>>;
