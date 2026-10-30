/**
 * Hocanın yoklama dökümü (A4 yatay PDF): her sınıf için öğrenci listesi, ders sütunları ve geldi/gelmedi işaretleri.
 * Çok ders ya da çok öğrenci varsa sütunlar ve satırlar sayfalara bölünür; her sayfa html2canvas ile görüntülenip PDF'e eklenir.
 */
import type { DokumHucre, HocaYoklamaDokumu } from '../yoklama';
import { blobIndir, dosyaAdi, esc, pdfAraclari } from './ortak';

const DERS_SAYFA = 12;     // bir sayfadaki en çok ders sütunu (her biri 1. ve 2. ders)
const SATIR_SAYFA = 30;    // bir sayfadaki en çok öğrenci satırı
const GUN_KISA: Record<string, string> = { Pazartesi: 'Pzt', Salı: 'Sal', Çarşamba: 'Çar', Perşembe: 'Per', Cuma: 'Cum', Cumartesi: 'Cmt', Pazar: 'Paz' };

const CSS = `
.yd{width:297mm; height:210mm; box-sizing:border-box; padding:9mm 10mm 7mm; background:#fff; color:#1c1d3a; display:flex; flex-direction:column;
  font-family:'IBM Plex Sans','Segoe UI',Roboto,Arial,sans-serif; overflow:hidden;}
.yd *{box-sizing:border-box;}
.yd-ust{display:flex; align-items:center; gap:4mm;}
.yd-logo{width:15mm; height:15mm; object-fit:contain;}
.yd-kurum{flex:1; min-width:0;}
.yd-k1{font-size:7.5pt; color:#5f6283;}
.yd-k2{font-family:'Source Serif 4',Georgia,serif; font-weight:700; font-size:14pt; color:#2f318d; line-height:1.1;}
.yd-k3{font-size:8.5pt; font-weight:600; margin-top:.4mm;}
.yd-sag{text-align:right;}
.yd-tur{display:inline-block; background:#2f318d; color:#fff; border-radius:1.5mm; padding:1mm 3mm; font-size:7.5pt; font-weight:700; letter-spacing:.4px; text-transform:uppercase;}
.yd-kim{font-size:12pt; font-weight:700; margin-top:1.2mm;}
.yd-alt{font-size:8pt; color:#5f6283; margin-top:.4mm;}
.yd-serit{height:1mm; margin:3mm 0 2.6mm; border-radius:1mm; background:linear-gradient(90deg,#2f318d 0 60%,#669a7a 60% 80%,#e9993f 80% 100%);}
.yd-ozet{display:flex; gap:2mm; flex-wrap:wrap; margin-bottom:2.4mm; align-items:center;}
.yd-cip{background:#eeeff8; color:#2f318d; border-radius:10mm; padding:.9mm 3mm; font-size:8pt; font-weight:600;}
.yd-cip.sinif{background:#2f318d; color:#fff; font-size:9pt;}
.yd-cip.kirmizi{background:#fdecea; color:#b42318;}
.yd-tablo-kap{flex:1; min-height:0;}
.yd table{width:100%; border-collapse:separate; border-spacing:0; table-layout:fixed; font-size:7.6pt;}
.yd th, .yd td{border-right:.25mm solid #e3e5ef; border-bottom:.25mm solid #e3e5ef; padding:0 1mm; height:4.6mm; text-align:center; vertical-align:middle; white-space:nowrap; overflow:hidden;}
.yd thead th{background:#f3f4fa; color:#2f318d; font-weight:700; border-bottom-color:#cfd3e6;}
.yd thead tr:first-child th{border-top:.25mm solid #cfd3e6;}
.yd th:first-child, .yd td:first-child{border-left:.25mm solid #e3e5ef;}
.yd thead tr:first-child th:first-child{border-top-left-radius:2mm;}
.yd thead tr:first-child th:last-child{border-top-right-radius:2mm;}
.yd th.ders{height:auto; padding:1mm .6mm; line-height:1.2; white-space:normal;}
.yd th.ders b{display:block; font-size:7.8pt;}
.yd th.ders span{display:block; font-weight:500; color:#5f6283; font-size:6.6pt;}
.yd th.ders.yapilmadi{background:#eceef3; color:#8a8da8;}
.yd th.alt{font-size:6.6pt; font-weight:600; color:#5f6283; height:4.2mm;}
.yd td.ad{text-align:left; font-weight:500; text-overflow:ellipsis;}
.yd td.no{font-variant-numeric:tabular-nums; color:#4b4e6d;}
.yd td.sira{color:#8a8da8;}
.yd tbody tr:nth-child(even) td{background:#fafbfd;}
.yd td.ayrac, .yd th.ayrac{border-left:.5mm solid #cfd3e6;}
.yd td.top{font-weight:700;}
.yd td.top.var{color:#b42318;}
.m{display:inline-flex; align-items:center; justify-content:center; width:3.7mm; height:3.7mm; border-radius:50%; font-size:7pt; font-weight:700; line-height:1;}
.m.G{background:#e3f3e9; color:#1f6b43;}
.m.Y{background:#b42318; color:#fff;}
.m.I{background:#fdf0dc; color:#9a5a12;}
.m.T{border:.35mm solid #2f318d;}
.m.Y.T{background:#fbe1de; color:#b42318;}
.yd .tasindi-not{font-size:6pt; font-weight:600; color:#2f318d; margin-left:1.2mm;}
.yd td.yok-ders{background:#e6e8ef !important;}
.yd td.liste-disi{background:#f6f7fa !important;}
.yd-ayak{display:flex; justify-content:space-between; align-items:center; gap:6mm; margin-top:2.4mm; font-size:7pt; color:#8a8da8;}
.yd-lejant{display:flex; gap:4mm; align-items:center;}
.yd-lejant span{display:inline-flex; align-items:center; gap:1.2mm;}
.yd-lejant i{display:inline-block; width:4mm; height:3mm; border-radius:.6mm;}
`;

const IKON: Record<string, string> = { G: '✓', Y: '✕', I: 'İ' };
/** Küçük harf: önceki sınıfındaki yoklamadan taşındı (çerçeveli gösterilir). */
const isaret = (h: DokumHucre) => {
  if (!h) return '';
  const b = h.toUpperCase();
  return `<span class="m ${b}${h !== b ? ' T' : ''}">${IKON[b]}</span>`;
};
/** En çok n'lik eşit parçalar (31, n=30 → 16+15; 11, n=10 → 6+5). */
function parcala<T>(l: T[], n: number): T[][] {
  if (!l.length) return [[]];
  const adet = Math.ceil(l.length / n), taban = Math.floor(l.length / adet), artan = l.length % adet;
  const out: T[][] = [];
  for (let k = 0, i = 0; k < adet; k++) { const m = taban + (k < artan ? 1 : 0); out.push(l.slice(i, i + m)); i += m; }
  return out;
}

type Sayfa = { sinif: HocaYoklamaDokumu['siniflar'][number]; dersBas: number; dersler: HocaYoklamaDokumu['siniflar'][number]['oturumlar']; satirBas: number; satirlar: HocaYoklamaDokumu['siniflar'][number]['ogrenciler']; parca: string };

function sayfalar(d: HocaYoklamaDokumu): Sayfa[] {
  const out: Sayfa[] = [];
  for (const s of d.siniflar) {
    const dg = parcala(s.oturumlar, DERS_SAYFA), sg = parcala(s.ogrenciler, SATIR_SAYFA);
    const bas = <T,>(g: T[][], i: number) => g.slice(0, i).reduce((t, x) => t + x.length, 0);
    dg.forEach((dersler, i) => sg.forEach((satirlar, j) => out.push({
      sinif: s, dersBas: bas(dg, i), dersler, satirBas: bas(sg, j), satirlar,
      parca: dg.length * sg.length > 1 ? `Bölüm ${i * sg.length + j + 1}/${dg.length * sg.length}` : ''
    })));
  }
  return out;
}

function sayfaHtml(d: HocaYoklamaDokumu, p: Sayfa, no: number, toplam: number, logo: string) {
  const s = p.sinif, sonDers = p.dersBas + p.dersler.length >= s.oturumlar.length;
  const solMM = [7, 19, 0], dersMM = p.dersler.length ? Math.min(22, 190 / p.dersler.length) : 22;
  const col = `<col style="width:${solMM[0]}mm"><col style="width:${solMM[1]}mm"><col>` +
    p.dersler.map(() => `<col style="width:${dersMM / 2}mm"><col style="width:${dersMM / 2}mm">`).join('') + (sonDers ? '<col style="width:13mm">' : '');
  const bas1 = '<tr><th rowspan="2">#</th><th rowspan="2">No</th><th rowspan="2" style="text-align:left">Adı Soyadı</th>' +
    p.dersler.map(o => `<th colspan="2" class="ders ayrac${o.yapilmadi ? ' yapilmadi' : ''}"><b>${esc(o.tarih.slice(0, 5))} ${esc(GUN_KISA[o.gun] ?? o.gun.slice(0, 3))}</b><span>${esc(o.ders)}${o.tur === 'Telafi' ? ' · Telafi' : ''}</span><span>${o.yapilmadi ? 'Ders yapılmadı' : esc(o.saat)}</span></th>`).join('') +
    (sonDers ? '<th rowspan="2" class="ayrac">Yok<br>(saat)</th>' : '') + '</tr>';
  const bas2 = '<tr>' + p.dersler.map(() => '<th class="alt ayrac">1</th><th class="alt">2</th>').join('') + '</tr>';
  const govde = p.satirlar.map((o, i) => '<tr>' +
    `<td class="sira">${p.satirBas + i + 1}</td><td class="no">${esc(o.no)}</td><td class="ad">${esc((o.adi + ' ' + o.soyadi).trim() || '—')}${o.tasindi ? '<span class="tasindi-not">sınıf değişti</span>' : ''}</td>` +
    p.dersler.map((x, k) => {
      const [a, b] = o.h[p.dersBas + k];
      const sinifi = (h: DokumHucre) => (x.yapilmadi ? ' yok-ders' : h === '' ? ' liste-disi' : '');
      return `<td class="ayrac${sinifi(a)}">${x.yapilmadi ? '' : isaret(a)}</td><td class="${sinifi(b).trim()}">${x.yapilmadi ? '' : isaret(b)}</td>`;
    }).join('') + (sonDers ? `<td class="ayrac top${o.yok ? ' var' : ''}">${o.yok || '–'}</td>` : '') + '</tr>').join('');
  const yapilan = s.oturumlar.filter(o => !o.yapilmadi).length;
  return `<div class="yd">
    <div class="yd-ust">${logo ? `<img class="yd-logo" src="${esc(logo)}" alt="">` : ''}
      <div class="yd-kurum"><div class="yd-k1">T.C. Sinop Üniversitesi</div><div class="yd-k2">Sinop İlahiyat Fakültesi</div><div class="yd-k3">Arapça Hazırlık Programı · Yoklama Dökümü</div></div>
      <div class="yd-sag"><span class="yd-tur">Yoklama dökümü</span><div class="yd-kim">${esc(d.teacher)}</div><div class="yd-alt">${esc(d.bas)} – ${esc(d.bit)}</div></div></div>
    <div class="yd-serit"></div>
    <div class="yd-ozet"><span class="yd-cip sinif">${esc(s.ad)}</span><span class="yd-cip">${s.ogrenciler.length} öğrenci</span>
      <span class="yd-cip">${yapilan} ders${s.oturumlar.length > yapilan ? ` · ${s.oturumlar.length - yapilan} yapılmadı` : ''}</span>
      <span class="yd-cip${s.toplamYok ? ' kirmizi' : ''}">${s.toplamYok} saat devamsızlık</span>${p.parca ? `<span class="yd-cip">${p.parca}</span>` : ''}</div>
    <div class="yd-tablo-kap"><table><colgroup>${col}</colgroup><thead>${bas1}${bas2}</thead><tbody>${govde}</tbody></table></div>
    <div class="yd-ayak"><div class="yd-lejant"><span><span class="m G">✓</span> Geldi</span><span><span class="m Y">✕</span> Gelmedi</span><span><span class="m I">İ</span> İzinli</span><span><span class="m G T">✓</span> Önceki sınıfındaki yoklamadan taşındı</span>
      <span><i style="background:#e6e8ef"></i> Ders yapılmadı</span><span><i style="background:#f6f7fa; border:.2mm solid #e3e5ef"></i> O gün listede değil</span></div>
      <div>Oluşturma: ${esc(d.olusturma)} · Sayfa ${no}/${toplam}</div></div>
  </div>`;
}

/** Dökümü PDF olarak indirir; ilerleme yaz() ile bildirilir. */
export async function yoklamaDokumuPdf(d: HocaYoklamaDokumu, logo: string, yaz: (m: string) => void) {
  const liste = sayfalar(d);
  yaz('PDF araçları yükleniyor…');
  const { html2canvas, jsPDF } = await pdfAraclari();
  if (document.fonts?.ready) await document.fonts.ready;
  const kap = document.createElement('div');
  kap.style.cssText = 'position:fixed; left:-12000px; top:0; width:297mm; height:210mm; background:#fff; overflow:hidden;';
  document.body.appendChild(kap);
  try {
    const belge = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape', compress: true });
    for (let i = 0; i < liste.length; i++) {
      yaz(`Sayfa ${i + 1} / ${liste.length} hazırlanıyor…`);
      kap.innerHTML = `<style>${CSS}</style>` + sayfaHtml(d, liste[i], i + 1, liste.length, logo);
      const img = kap.querySelector('img');
      if (img && !img.complete) await new Promise(r => { img.onload = img.onerror = r; });
      const c = await html2canvas(kap.querySelector('.yd') as HTMLElement, { scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: true });
      if (i) belge.addPage();
      belge.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 297, 210);
    }
    const ad = dosyaAdi(`Yoklama Dokumu - ${d.teacher} - ${d.bas}-${d.bit}`, 'Yoklama Dokumu') + '.pdf';
    blobIndir(belge.output('blob'), ad);
    yaz(`${ad} indirildi (${liste.length} sayfa).`);
  } finally {
    kap.remove();
  }
}
