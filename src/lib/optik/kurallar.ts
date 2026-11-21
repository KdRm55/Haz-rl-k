/**
 * Optik cevap kâğıdı kuralları (saf, test edilebilir): cevap anahtarı şablonu ve okunması, elle kayıt satırları,
 * kitapçık türü, notlandırma. Sunucu ve tarayıcı ortak kullanır.
 */
import { alanNorm } from '../aktarim-kurallari';
import { KullaniciHatasi } from '../hata';
import { basNorm } from '../metin';
import { notla, SORU_SAYISI } from './okuyucu';

export const KITAPCIKLAR = ['A', 'B', 'C', 'D'] as const;
export const EN_COK_SORU = SORU_SAYISI;

/** QR metninin ilk iki hanesi kitapçık numarasıdır (11→A, 12→B, 13→C, 14→D). */
export function karekodKitapcigi(karekod: string): string {
  const n = parseInt(String(karekod ?? '').slice(0, 2), 10);
  return n >= 11 && n <= 14 ? 'ABCD'[n - 11] : '';
}

/** Cevap anahtarı şablonu: üstte başlık, altında her kitapçık için boş satır, en altta açıklama. */
export function anahtarSablonSatirlari(soru = 20): (string | number)[][] {
  const baslik = ['Kitapçık', ...Array.from({ length: soru }, (_, i) => 'S' + (i + 1))];
  return [
    baslik,
    ...KITAPCIKLAR.map(k => [k]),
    [],
    ['Açıklama: Her kitapçık satırına soruların doğru cevabını (A, B, C, D ya da E) yazın; her soru kendi sütunundadır.'],
    ['Bir soru iptal edilirse o hücreye "-" yazın: iptal soru herkese doğru sayılır. Kullanılmayan kitapçık satırını boş bırakın.'],
    ['Soru sayısı için S1, S2 … sütun başlıklarını artırıp azaltabilirsiniz (en çok ' + EN_COK_SORU + ').']
  ];
}

/** Hücre → "A"–"E" ya da "-" (iptal); anlaşılmazsa null. */
function anahtarHucresi(v: unknown): string | null {
  const s = basNorm(v).replace(/\s/g, '');   // alanNorm "-" işaretini siler; iptal işareti korunmalı
  if (/^[A-E]$/.test(s)) return s;
  if (s === '-' || s === 'IPTAL' || s === 'X') return '-';
  return null;
}

/** Yüklenen şablonu doğrular: kitapçık → cevap dizisi ("-" iptal) ve soru sayısı. Hatalıysa anlaşılır mesajla durur. */
export function anahtarCoz(satirlar: string[][]): { anahtar: Record<string, string>; soruSayisi: number } {
  const bas = satirlar.findIndex(r => alanNorm(r?.[0]) === 'KITAPCIK');
  if (bas < 0) throw new KullaniciHatasi('Başlık satırı bulunamadı: ilk sütunun başlığı "Kitapçık" olmalı. Şablonu indirip onu doldurun.');
  const baslik = satirlar[bas];
  const sutunlar: number[] = [];   // S1, S2 … sütunlarının dizin sırası
  for (let i = 1; i < baslik.length; i++) {
    const m = alanNorm(baslik[i]).match(/^S\s*(\d+)$/);
    if (!m) { if (alanNorm(baslik[i])) throw new KullaniciHatasi(`Başlık anlaşılamadı: "${baslik[i]}". Soru sütunları S1, S2, S3 … biçiminde olmalı.`); continue; }
    if (Number(m[1]) !== sutunlar.length + 1) throw new KullaniciHatasi(`Soru sütunları sırayla S1, S2, S3 … olmalı ("${baslik[i]}" yanlış sırada).`);
    sutunlar.push(i);
  }
  const n = sutunlar.length;
  if (!n) throw new KullaniciHatasi('Soru sütunu bulunamadı (S1, S2, S3 …).');
  if (n > EN_COK_SORU) throw new KullaniciHatasi(`En çok ${EN_COK_SORU} soru olabilir (optik kâğıdında ${EN_COK_SORU} satır var).`);
  const anahtar: Record<string, string> = {}, hatalar: string[] = [];
  for (let r = bas + 1; r < satirlar.length; r++) {
    const satir = satirlar[r] ?? [];
    const etiket = alanNorm(satir[0]).replace(/\s*KITAPCIGI?$/, '').replace(/\s/g, '');
    if (!/^[A-E]$/.test(etiket)) continue;   // boş ya da açıklama satırı
    if (anahtar[etiket] !== undefined) { hatalar.push(`${etiket} kitapçığı birden fazla satırda var.`); continue; }
    const hucreler = sutunlar.map(c => String(satir[c] ?? '').trim());
    if (hucreler.every(h => !h)) continue;   // kullanılmayan kitapçık
    let dizi = '';
    hucreler.forEach((h, i) => {
      const k = anahtarHucresi(h);
      if (k === null) hatalar.push(`${etiket} kitapçığı, S${i + 1}: ${h ? `"${h}" anlaşılamadı (A–E ya da iptal için -)` : 'boş bırakılmış'}.`);
      else dizi += k;
    });
    if (dizi.length === n) anahtar[etiket] = dizi;
  }
  if (hatalar.length) throw new KullaniciHatasi('Cevap anahtarı kaydedilmedi:\n' + hatalar.slice(0, 15).join('\n') + (hatalar.length > 15 ? `\n… ve ${hatalar.length - 15} sorun daha.` : ''));
  if (!Object.keys(anahtar).length) throw new KullaniciHatasi('Hiçbir kitapçık satırında cevap yok. A, B, C, D satırlarını doldurun.');
  return { anahtar, soruSayisi: n };
}

/** İşaretler: "A"–"E", boş "-", çoklu "X" olarak normalleştirilir; geçersiz karakter varsa null. */
export function cevapNorm(s: unknown): string | null {
  const t = basNorm(s).replace(/[\s,;.]/g, '').replace(/[_0]/g, '-');
  return /^[A-EX-]*$/.test(t) ? t : null;
}

export type ElleSatir = { no: string; kitapcik: string; cevaplar: string };
/**
 * Elle kayıt metni: her satır "öğrenci no  kitapçık  cevaplar" (boşluk, sekme, virgül ya da noktalı virgülle ayrılmış).
 * Cevaplar bitişik ("ECEB…") ya da aralıklı ("E C E B …") yazılabilir; işaretsiz soru "-" ile gösterilir.
 */
export function elleSatirlari(metin: string, soruSayisi: number): { satirlar: ElleSatir[]; hatalar: string[] } {
  const satirlar: ElleSatir[] = [], hatalar: string[] = [];
  String(metin ?? '').split(/\r?\n/).forEach((ham, i) => {
    const t = ham.trim();
    if (!t) return;
    const p = t.split(/[\s,;\t]+/).filter(Boolean);
    const no = (p[0] ?? '').replace(/\D/g, '');
    const kitap = alanNorm(p[1] ?? '').replace(/\s/g, '');
    const cevap = cevapNorm(p.slice(2).join(''));
    if (!no) return void hatalar.push(`${i + 1}. satır: öğrenci numarası yok.`);
    if (!/^[A-D]$/.test(kitap)) return void hatalar.push(`${i + 1}. satır (${no}): kitapçık A, B, C ya da D olmalı.`);
    if (cevap === null) return void hatalar.push(`${i + 1}. satır (${no}): cevaplarda A–E, - ve X dışında karakter var.`);
    if (cevap.length !== soruSayisi) return void hatalar.push(`${i + 1}. satır (${no}): ${soruSayisi} soru için ${cevap.length} cevap yazılmış.`);
    satirlar.push({ no, kitapcik: kitap, cevaplar: cevap });
  });
  const goruldu = new Set<string>();
  for (const s of satirlar) { if (goruldu.has(s.no)) hatalar.push(`${s.no} numarası birden fazla satırda.`); goruldu.add(s.no); }
  return { satirlar, hatalar };
}

/** Kayıtlı cevapları 50 karaktere tamamlar. */
export const cevapTamamla = (c: string) => (c + '-'.repeat(EN_COK_SORU)).slice(0, EN_COK_SORU);

export type OptikNotu = { dogru: number; yanlis: number; bos: number; iptal: number; toplam: number; puan: number };
/** Öğrencinin cevaplarını kendi kitapçığının anahtarıyla notlar; çoklu işaret ("X") yanlıştır. */
export function optikNotu(cevaplar: string, anahtar: string, yanlisCezasi: number): OptikNotu {
  return notla(cevapTamamla(cevaplar).slice(0, anahtar.length), anahtar, yanlisCezasi);
}

export function cezaOku(v: unknown): number {
  const x = Number(String(v ?? '0').replace(',', '.'));
  if (!isFinite(x) || x < 0 || x > 1) throw new KullaniciHatasi('Yanlış cezası 0 ile 1 arasında olmalı (örn. 0,25: dört yanlış bir doğruyu götürür).');
  return x;
}
