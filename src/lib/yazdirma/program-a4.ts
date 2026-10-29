/**
 * A4 haftalık ders programı sayfası (Apps Script ProgramA4.html karşılığı).
 * Hem öğrenci hem hoca ekranı kullanır: önizleme, yazdırma ve PDF aynı HTML'den üretilir.
 */
import { PRG_CSS } from './program-a4-stil';
import { cerceveYazdir, dosyaAdi, blobIndir, esc, pdfAraclari, YAZI_TIPI } from './ortak';

export type Yon = 'yatay' | 'dikey';
export type ProgramDersi = { gun: string; saat: string; ders: string; hoca?: string; sube?: string; derslik?: string };
export type ProgramSecenek = {
  tur: 'sinif' | 'hoca';
  yon?: Yon;
  kim: string;
  alt?: string;
  program: ProgramDersi[];
  logo?: string;
  ozet?: string[];
  tekDerslik?: string;
};

export { PRG_CSS };

const GUN_SIRA = ['PAZARTESI', 'SALI', 'CARSAMBA', 'PERSEMBE', 'CUMA', 'CUMARTESI', 'PAZAR'];
const GUN_ADI: Record<string, string> = { PAZARTESI: 'Pazartesi', SALI: 'Salı', CARSAMBA: 'Çarşamba', PERSEMBE: 'Perşembe', CUMA: 'Cuma', CUMARTESI: 'Cumartesi', PAZAR: 'Pazar' };
const RENK = [
  { bg: '#eef0fb', k: '#2f318d' }, { bg: '#e9f4ee', k: '#669a7a' }, { bg: '#fdf1e3', k: '#e9993f' }, { bg: '#f3eefb', k: '#7c5cc4' },
  { bg: '#e7f3f8', k: '#2b8cb3' }, { bg: '#fbeef0', k: '#c2566b' }, { bg: '#f1f4e4', k: '#8a9a3b' }, { bg: '#eef1f5', k: '#5b6b82' }
];

const anahtar = (s: string) => String(s || '').toLocaleUpperCase('tr-TR').replace(/İ/g, 'I').replace(/Ş/g, 'S').replace(/Ç/g, 'C')
  .replace(/Ğ/g, 'G').replace(/Ü/g, 'U').replace(/Ö/g, 'O').replace(/\s+/g, ' ').trim();
const saatAnahtar = (s: string) => String(s || '').replace(/\s+/g, '').replace(/[–—−]/g, '-');
const dakika = (s: string) => { const m = String(s || '').match(/(\d{1,2})[.:](\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : 9999; };
function saatParca(s: string) {
  const m = String(s || '').match(/(\d{1,2}[.:]\d{2})\s*[-–—−]\s*(\d{1,2}[.:]\d{2})/);
  return m ? { bas: m[1], bit: m[2] } : { bas: String(s || ''), bit: '' };
}
const bugun = () => new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());

/** Programı gün × saat ızgarasına çevirir; her derse (öğrenci) ya da şubeye (hoca) sabit bir renk verir. */
function duzenle(p: ProgramDersi[], renkAlan: 'ders' | 'sube') {
  const gunler: string[] = [], slotlar: string[] = [], slotAd: Record<string, string> = {}, hucre: Record<string, ProgramDersi[]> = {}, dersler: string[] = [];
  for (const x of p) {
    const g = anahtar(x.gun), sl = saatAnahtar(x.saat);
    if (!GUN_SIRA.includes(g)) continue;
    if (!gunler.includes(g)) gunler.push(g);
    if (!(sl in slotAd)) { slotAd[sl] = x.saat; slotlar.push(sl); }
    (hucre[g + '|' + sl] ??= []).push(x);
    const d = anahtar(x[renkAlan] ?? '');
    if (!dersler.includes(d)) dersler.push(d);
  }
  GUN_SIRA.slice(0, 5).forEach(g => { if (!gunler.includes(g)) gunler.push(g); });
  gunler.sort((a, b) => GUN_SIRA.indexOf(a) - GUN_SIRA.indexOf(b));
  slotlar.sort((a, b) => dakika(a) - dakika(b) || a.localeCompare(b));
  dersler.sort((a, b) => a.localeCompare(b, 'tr'));
  const renk: Record<string, (typeof RENK)[number]> = {};
  dersler.forEach((d, i) => { renk[d] = RENK[i % RENK.length]; });
  return { gunler, slotlar, slotAd, hucre, renk, renkAlan };
}

function dersKutusu(x: ProgramDersi, o: ProgramSecenek, r: (typeof RENK)[number]) {
  let h = `<div class="prg-hucre" style="background:${r.bg};border-left-color:${r.k}"><div class="prg-ders">${esc(x.ders || 'Ders')}</div>`;
  if (o.tur === 'hoca') {
    if (x.sube) h += `<div class="prg-etiket" style="color:${r.k}">${esc(x.sube)}</div>`;
    if (x.derslik) h += `<div class="prg-ek">Derslik ${esc(x.derslik)}</div>`;
  } else {
    if (x.hoca) h += `<div class="prg-ek">${esc(x.hoca)}</div>`;
    if (x.derslik && x.derslik !== o.tekDerslik) h += `<div class="prg-etiket" style="color:${r.k}">${esc(x.derslik)}</div>`;
  }
  return h + '</div>';
}

export function sayfaHtml(o: ProgramSecenek): string {
  const d = duzenle(o.program, o.tur === 'hoca' ? 'sube' : 'ders');
  const dikey = o.yon === 'dikey';
  const ust = '<div class="prg-ust">' + (o.logo ? `<img class="prg-logo" src="${esc(o.logo)}" alt="">` : '') +
    '<div class="prg-kurum"><div class="prg-k1">T.C. Sinop Üniversitesi</div><div class="prg-k2">Sinop İlahiyat Fakültesi</div><div class="prg-k3">Arapça Hazırlık Programı</div></div>' +
    `<div class="prg-sag"><span class="prg-tur">Haftalık Ders Programı</span><div class="prg-kim">${esc(o.kim)}</div>` +
    (o.alt ? `<div class="prg-altyazi">${esc(o.alt)}</div>` : '') + '</div></div><div class="prg-serit"></div>';
  const ozet = o.ozet?.length ? '<div class="prg-ozet">' + o.ozet.map(c => `<span class="prg-cip">${esc(c)}</span>`).join('') + '</div>' : '';
  let govde: string;
  if (!d.slotlar.length) {
    govde = '<div class="prg-yok">Programda ders bulunamadı.</div>';
  } else {
    const kolon = `grid-template-columns:${dikey ? '15mm' : '20mm'} repeat(${d.gunler.length}, minmax(0,1fr)); grid-template-rows:9mm repeat(${d.slotlar.length}, minmax(0,1fr));`;
    const boy = d.slotlar.length <= 4 ? ' prg-buyuk' : d.slotlar.length <= 6 ? ' prg-orta' : '';
    govde = `<div class="prg-izgara${boy}" style="${kolon}"><div class="prg-kose">Saat</div>` + d.gunler.map(g => `<div class="prg-gun">${GUN_ADI[g]}</div>`).join('');
    for (const sl of d.slotlar) {
      const s = saatParca(d.slotAd[sl]);
      govde += `<div class="prg-saat"><b>${esc(s.bas)}</b>${s.bit ? `<span>${esc(s.bit)}</span>` : ''}</div>`;
      for (const g of d.gunler) {
        const l = d.hucre[g + '|' + sl];
        govde += l ? '<div class="prg-kutu">' + l.map(x => dersKutusu(x, o, d.renk[anahtar(x[d.renkAlan] ?? '')])).join('') + '</div>' : '<div class="prg-bos"></div>';
      }
    }
    govde += '</div>';
  }
  const alt = `<div class="prg-altbilgi"><span>Sinop İlahiyat Fakültesi · Arapça Hazırlık Programı</span><span>Oluşturma: ${bugun()}</span></div>`;
  return `<div class="prg-sayfa${dikey ? ' prg-dikey' : ''}">${ust}${ozet}${govde}${alt}</div>`;
}

export function yazdir(o: ProgramSecenek) {
  const dikey = o.yon === 'dikey';
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Haftalık Ders Programı</title><link rel="stylesheet" href="${YAZI_TIPI}">` +
    `<style>${PRG_CSS}@page{size:A4 ${dikey ? 'portrait' : 'landscape'}; margin:0} html,body{margin:0; padding:0; background:#fff}</style></head><body>${sayfaHtml(o)}` +
    '<script>(function(){var t=false;function y(){if(t)return;t=true;setTimeout(function(){window.focus();window.print();},200);}' +
    'var r=[].slice.call(document.images).map(function(i){return i.complete?Promise.resolve():new Promise(function(ok){i.onload=i.onerror=ok;});});' +
    'Promise.all(r).then(function(){return (document.fonts&&document.fonts.ready)?document.fonts.ready:null;}).then(y,y);' +
    'setTimeout(y,4000);})();</scr' + 'ipt></body></html>';
  cerceveYazdir(html, dikey ? '210mm' : '297mm', dikey ? '297mm' : '210mm');
}

/** Programı A4 PDF olarak indirir. */
export async function pdf(o: ProgramSecenek, ad: string) {
  const { html2canvas, jsPDF } = await pdfAraclari();
  if (document.fonts?.ready) await document.fonts.ready;
  const dikey = o.yon === 'dikey';
  const kap = document.createElement('div');
  kap.style.cssText = `position:fixed; left:-12000px; top:0; background:#fff; overflow:hidden; ${dikey ? 'width:210mm; height:297mm;' : 'width:297mm; height:210mm;'}`;
  kap.innerHTML = sayfaHtml(o);
  document.body.appendChild(kap);
  try {
    const c = await html2canvas(kap.firstElementChild as HTMLElement, { scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: true });
    const belge = new jsPDF({ unit: 'mm', format: 'a4', orientation: dikey ? 'portrait' : 'landscape', compress: true });
    belge.addImage(c.toDataURL('image/jpeg', 0.93), 'JPEG', 0, 0, dikey ? 210 : 297, dikey ? 297 : 210);
    blobIndir(belge.output('blob'), dosyaAdi(ad, 'Ders Programi') + '.pdf');
  } finally {
    kap.remove();
  }
}

/** Kayıtlı yön tercihi (tarayıcı hatırlar; kullanılamazsa yatay). */
export function yonTercihi(): Yon {
  try { return localStorage.getItem('prgYon') === 'dikey' ? 'dikey' : 'yatay'; } catch { return 'yatay'; }
}
export function yonKaydet(y: Yon) {
  try { localStorage.setItem('prgYon', y); } catch { /* özel pencere vb. */ }
}
