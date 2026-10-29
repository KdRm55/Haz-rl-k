/** Öğrenci ekranı "Sınavlarım" listesi (saf, test edilebilir). Kaynak: Index.html sinavListesi. */
import type { DonemSinaviBilgisi, SinavBilgisi, SinavYeriBilgisi, SorguSonucu } from '@/lib/tipler';
import { trAnahtar } from './program';

export type Bulunan = Extract<SorguSonucu, { bulundu: true }>;
export type SinavOgesi =
  | { tip: 'donem'; ad: string; s: DonemSinaviBilgisi; yer: SinavYeriBilgisi | null; t: number | null; gecti: boolean }
  | { tip: 'yer'; ad: string; yer: SinavYeriBilgisi; sv?: SinavBilgisi; t: number | null; gecti: boolean }
  | { tip: 'muafiyet'; ad: string; sv: SinavBilgisi; t: null; gecti: boolean };

const sinavTarihi = (t: string) => { const m = String(t || '').match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/); return m ? new Date(+m[3], +m[2] - 1, +m[1]).getTime() : null; };

const muafiyetGosterilir = (sv: SinavBilgisi | null, tur: Bulunan['tur']) =>
  !!sv && !!((sv.sonuc && sv.sonuc !== 'Bekliyor') || (sv.yer && tur !== 'sinif') || sv.sonuc === 'Bekliyor');

/** Öğrencinin bütün sınavları tek listede: dönem sınavları (bağlı sınav yeriyle), bağımsız sınav yeri listeleri, muafiyet sınavı. */
export function sinavListesi(r: Bulunan): SinavOgesi[] {
  if (r.gorunum.sinavlar === false) return [];
  const sy = r.sinavYerleri ?? [], liste: SinavOgesi[] = [], bagli = new Set<string>();
  const d = r.tur === 'sinif' ? r.donemSinavlari : null;
  d?.sinavlar.forEach(s => {
    const yer = sy.find(y => y.donemKod && y.donemKod === s.kod) ?? null;
    if (yer) bagli.add(s.kod);
    const tarihler = s.dersler.map(x => sinavTarihi(x.tarih)).filter((t): t is number => t != null);
    liste.push({ tip: 'donem', ad: s.ad, s, yer, t: tarihler.length ? Math.min(...tarihler) : null, gecti: !!s.dersler.length && s.dersler.every(x => x.gecti) });
  });
  sy.forEach(y => { if (!(y.donemKod && bagli.has(y.donemKod))) liste.push({ tip: 'yer', ad: y.ad, yer: y, t: sinavTarihi(y.tarih), gecti: y.gecti }); });
  const sv = r.sinav;
  if (sv && muafiyetGosterilir(sv, r.tur)) {
    // Adında "muafiyet" geçen sınav yeri listesi varsa muafiyet sonucu o kartta gösterilir (yer + puan tek yerde)
    const muafYer = liste.find((x): x is Extract<SinavOgesi, { tip: 'yer' }> => x.tip === 'yer' && trAnahtar(x.ad).includes('MUAFIYET'));
    if (muafYer) muafYer.sv = sv;
    else liste.push({ tip: 'muafiyet', ad: 'Muafiyet sınavı', sv, t: null, gecti: !!(sv.sonuc && sv.sonuc !== 'Bekliyor') });
  }
  // Önce yaklaşanlar (tarih sırasıyla), sonra tamamlananlar
  return liste.sort((a, b) => Number(a.gecti) - Number(b.gecti) || (a.t ?? 9e15) - (b.t ?? 9e15));
}
