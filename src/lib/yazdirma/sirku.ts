/**
 * İmza sirküsü (A4 dikey) — Apps Script Hoca.html'deki evrak üretimi, sayfaya sığdırma, yazdırma ve PDF.
 * Evrak HTML'i metin olarak üretilir; ekran, yazdırma penceresi ve PDF aynı HTML'i kullanır.
 */
import { sirkuBol, tarihSirala, type SirkuDuzen, type SirkuSubesi } from '../sirku-kurallari';
import { bekle, blobIndir, cerceveYazdir, dosyaAdi, esc, pdfAraclari } from './ortak';

const KURUM = 'Sinop İlahiyat Fakültesi';
const BELGE = 'Ders Yoklama Evrakı';
// Evrak QR kutusu: numara yazdırma / PDF öncesinde doldurulur (evrak-qr.ts)
const EVRAK_QR_KUTU = '<div class="evrak-qr" aria-hidden="true"><div class="eq-kod"></div><div class="eq-no"></div></div>';
const HIZA = '<div class="hiza h-ss"></div><div class="hiza h-sg"></div><div class="hiza h-as"></div><div class="hiza h-ag"></div>';

export type EvrakKarti = {
  anahtar: string;
  hoca: string;
  sinif: string;
  dersler: string;
  ogrenciSayisi: number;
  sayfaSayisi: number;
  tur: 'Program' | 'Telafi';
  hafta: string;
  sutunlar: { tarih: string; saat: string; ders: string }[];   // her tarih sütunu (evrak kaydı ve tarama için)
  html: string;   // .paper öğeleri
};

type BaslikBilgisi = {
  subeName: string; lessonsText: string; teacher: string; weekStart: string; isManual: boolean;
  origDate?: string; origTime?: string; manualTime?: string;
};

function ustBaslik(p: BaslikBilgisi, sayfa: number, toplam: number, logo: string) {
  const tur = p.isManual ? 'İmza Sirküsü (Telafi)' : 'İmza Sirküsü';
  const hucre = (l: string, v: string, genis = false) =>
    `<div class="di${genis ? ' wide' : ''}"><div class="di-l">${l}</div><div class="di-v" title="${esc(v)}">${esc(v)}</div></div>`;
  let bilgi = hucre('Şube', p.subeName) + hucre('Öğretim elemanı', p.teacher || '—', true) + hucre('Ders', p.lessonsText, true);
  bilgi += p.isManual
    ? hucre('Asıl ders', [p.origDate, p.origTime].filter(Boolean).join(' / ') || '—') + hucre('Telafi', [p.weekStart, p.manualTime].filter(Boolean).join(' / ') || '—')
    : hucre('Hafta başı', p.weekStart || '—');
  return `<div class="doc-head">${logo ? `<img class="doc-logo" src="${esc(logo)}" alt="">` : ''}
      <div class="doc-titles"><div class="doc-inst">T.C. Sinop Üniversitesi</div><div class="doc-fac">${esc(KURUM)}</div><div class="doc-name">${esc(BELGE)}</div></div>
      <div class="doc-type"><span class="dt-label${p.isManual ? ' is-manual' : ''}">${tur}</span><div class="dt-date">${esc(p.weekStart || '')}</div>
        ${toplam > 1 ? `<div class="dt-sayfa">Sayfa ${sayfa}/${toplam} · ${toplam === 2 ? 'devamı arkada' : 'devamı sonraki sayfada'}</div>` : ''}</div>
      ${EVRAK_QR_KUTU}</div><div class="doc-rule"></div><div class="doc-info">${bilgi}</div>`;
}

/** 2. ve sonraki sayfaların kısa başlığı. */
function devamBasligi(p: BaslikBilgisi, sayfa: number, toplam: number) {
  const parca = [p.subeName, p.lessonsText, p.teacher, (p.isManual ? 'Telafi ' : 'Hafta başı ') + (p.weekStart || '—')];
  return `<div class="doc-devam"><div class="dd-sol" title="${esc(parca.join(' · '))}">${parca.map(esc).join(' · ')}</div>
      <div class="doc-type"><span class="dt-label${p.isManual ? ' is-manual' : ''}">${p.isManual ? 'İmza Sirküsü (Telafi)' : 'İmza Sirküsü'} · devam</span><span class="dd-sayfa">Sayfa ${sayfa}/${toplam}</span></div>
      ${EVRAK_QR_KUTU}</div><div class="doc-rule"></div>`;
}

function tablo(tarihler: string[], dersler: SirkuSubesi['dates'], ogr: SirkuSubesi['students'], satir: number) {
  const sag = Math.max(1, 2 * tarihler.length);
  const toplamMM = 190, solMM = [26, 32, 32], solToplam = solMM.reduce((a, b) => a + b, 0);
  const sagYuzde = ((toplamMM - solToplam) / toplamMM * 100) / sag;
  let colgroup = solMM.map(mm => `<col style="width:${(mm / toplamMM) * 100}%;">`).join('');
  for (let i = 0; i < sag; i++) colgroup += `<col style="width:${sagYuzde}%;">`;
  const bas1 = '<tr><th rowspan="2" class="center">NO</th><th rowspan="2">Adı</th><th rowspan="2">Soyadı</th>' +
    tarihler.map(d => `<th colspan="2" class="center">${esc(d)}${dersler[d][0]?.saat ? ` / <span style="font-weight:500">${esc(dersler[d][0].saat)}</span>` : ''}</th>`).join('') + '</tr>';
  const bas2 = '<tr>' + tarihler.map(() => '<th class="center">1. DERS</th><th class="center">2. DERS</th>').join('') + '</tr>';
  const n = Math.max(ogr.length, satir || 20);
  let govde = '';
  for (let i = 0; i < n; i++) {
    const o = ogr[i] ?? { no: '', adi: '', soyadi: '' };
    govde += `<tr><td class="center">${esc(o.no)}</td><td>${esc(o.adi)}</td><td>${esc(o.soyadi)}</td>${tarihler.map(() => '<td></td><td></td>').join('')}</tr>`;
  }
  return `<table class="roster" data-rows="${n}"><colgroup>${colgroup}</colgroup><thead>${bas1}${bas2}</thead><tbody>${govde}</tbody></table>`;
}

/** Bir öğretim elemanının şube evrakları (yalnızca dersi olan şubeler). */
export function evrakKartlari(teacher: string, weekStart: string, sections: Record<string, SirkuSubesi>, isManual: boolean, duzen: SirkuDuzen, logo: string): EvrakKarti[] {
  const out: EvrakKarti[] = [];
  for (const sube of Object.keys(sections).sort()) {
    const sec = sections[sube];
    const tarihler = tarihSirala(Object.keys(sec.dates || {}));
    if (!tarihler.length) continue;
    const lessonsText = sec.lessonNames.filter(Boolean).join(', ') || '—';
    const p: BaslikBilgisi = {
      subeName: sec.name, lessonsText, teacher,
      weekStart: isManual ? sec.manualDate ?? '' : weekStart, isManual,
      origDate: sec.origDate, origTime: sec.origTime, manualTime: sec.manualTime
    };
    const parcalar = sirkuBol(sec.students, duzen);
    const toplam = parcalar.length;
    const altBilgi = `<div class="doc-foot"><div>${esc(KURUM)} ${esc(BELGE)}</div><div class="sign"><div class="sign-line">Öğretim Elemanı: ${esc(teacher)}</div></div></div>`;
    const html = parcalar.map((pr, k) =>
      `<div class="paper"><div class="page" data-sayfa="${k + 1}" data-toplam="${toplam}">${HIZA}<div class="content">
        ${k === 0 ? ustBaslik(p, 1, toplam, logo) : devamBasligi(p, k + 1, toplam)}
        <div class="table-wrap">${tablo(tarihler, sec.dates, pr.ogrenciler, pr.satir)}</div>
        ${k === toplam - 1 ? altBilgi : ''}</div></div></div>`).join('');
    const sutunlar = tarihler.map(d => ({ tarih: d, saat: sec.dates[d][0]?.saat || '', ders: sec.dates[d][0]?.ders || '' }));
    out.push({ anahtar: teacher + '|' + sube, hoca: teacher, sinif: sec.name, dersler: lessonsText, ogrenciSayisi: sec.students.length, sayfaSayisi: toplam,
      tur: isManual ? 'Telafi' : 'Program', hafta: p.weekStart || '', sutunlar, html });
  }
  return out;
}

/* ---------- Sayfaya sığdırma ---------- */
/**
 * Satır yüksekliklerini sayfaya tam sığacak şekilde eşit dağıtır; sığmazsa yazıyı kademeli küçültür.
 * Sığmayan (dolu) satır sayısını page[data-gizli]'ye yazar. Yazdırma penceresine toString() ile
 * aktarıldığı için dış değişken kullanmaz ve ES5 ile yazılmıştır.
 */
// prettier-ignore
export const sirkuYerlesim = function (page: HTMLElement): number {
  var tw = page.querySelector('.table-wrap') as HTMLElement | null, table = page.querySelector('table.roster') as HTMLTableElement | null;
  if (!table || !tw) return 0;
  var satirlar = table.tBodies[0] ? Array.prototype.slice.call(table.tBodies[0].rows) as HTMLTableRowElement[] : [];
  var seviyeler = ['', 'sikis-1', 'sikis-2'];
  var gizli = 0, olculdu = false, s: number;
  var baslangic = Math.min(seviyeler.length - 1, parseInt(table.getAttribute('data-sikis-min') || '0', 10) || 0);
  for (s = baslangic; s < seviyeler.length; s++) {
    table.classList.remove('sikis-1', 'sikis-2');
    if (seviyeler[s]) table.classList.add(seviyeler[s]);
    satirlar.forEach(function (tr) {
      tr.style.height = '';
      Array.prototype.forEach.call(tr.cells, function (td: HTMLElement) { td.style.height = ''; td.style.maxHeight = ''; });
    });
    var twH = tw.getBoundingClientRect().height;
    olculdu = twH >= 100;
    if (!olculdu) twH = 840;
    var hThead = table.tHead ? table.tHead.getBoundingClientRect().height : 0;
    var avail = Math.max(0, twH - hThead - 4);
    var n = parseInt(table.getAttribute('data-rows') || '0', 10) || satirlar.length || 1;
    var h = Math.floor((avail / n) * 10) / 10;
    satirlar.forEach(function (tr) {
      tr.style.height = h + 'px';
      Array.prototype.forEach.call(tr.cells, function (td: HTMLElement) { td.style.height = h + 'px'; td.style.maxHeight = h + 'px'; });
    });
    if (!olculdu) break;
    var alt = tw.getBoundingClientRect().bottom + 0.5;
    gizli = 0;
    satirlar.forEach(function (tr) { if ((tr.textContent || '').trim() && tr.getBoundingClientRect().bottom > alt) gizli++; });
    var son = satirlar[satirlar.length - 1];
    if (!son || son.getBoundingClientRect().bottom <= alt) break;
  }
  if (olculdu) page.setAttribute('data-gizli', String(gizli)); else page.removeAttribute('data-gizli');
  table.setAttribute('data-sikis', String(s < seviyeler.length ? s : seviyeler.length - 1));
  return gizli;
};

/** Bir evrakın bütün sayfaları aynı yazı boyuyla çizilir; sığmayan öğrenci sayısını döndürür. */
export function kartYerlesim(kart: HTMLElement): number {
  const sayfalar = Array.from(kart.querySelectorAll<HTMLElement>('.page'));
  const tablolar = sayfalar.map(p => p.querySelector('table.roster')).filter((t): t is HTMLTableElement => !!t);
  tablolar.forEach(t => t.removeAttribute('data-sikis-min'));
  sayfalar.forEach(sirkuYerlesim);
  if (tablolar.length > 1) {
    const enCok = Math.max(...tablolar.map(t => parseInt(t.getAttribute('data-sikis') || '0', 10) || 0));
    if (enCok) { tablolar.forEach(t => t.setAttribute('data-sikis-min', String(enCok))); sayfalar.forEach(sirkuYerlesim); }
  }
  return sayfalar.reduce((t, p) => t + (parseInt(p.getAttribute('data-gizli') || '0', 10) || 0), 0);
}

/* ---------- Yazdırma ---------- */
/**
 * Birden fazla evrak basılırken tek sayıda sayfalı evraktan sonra boş bir arka sayfa eklenir;
 * böylece çift taraflı baskıda her evrak yeni bir kâğıttan başlar.
 */
export function yazdir(kartlar: HTMLElement[], css: string) {
  if (!kartlar.length) return;
  kartlar.forEach(kartYerlesim);
  const bosArka = '<section class="sheet bos-arka"><div class="paper"><div class="page"></div></div></section>';
  const parcalar: string[] = [];
  kartlar.forEach((k, i) => {
    parcalar.push(k.outerHTML.replace(/<script[\s\S]*?<\/script>/gi, ''));
    const n = k.querySelectorAll('.page').length || 1;
    if (kartlar.length > 1 && i < kartlar.length - 1 && n % 2 === 1) parcalar.push(bosArka);
  });
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"/><title>${esc(KURUM)} - ${esc(BELGE)}</title><style>${css}</style></head><body>${parcalar.join('\n')}
    <script>(function(){
      var yerlesim = ${sirkuYerlesim.toString()};
      var bitti = false;
      function bas(){ if (bitti) return; bitti = true; document.querySelectorAll('.sheet .page').forEach(yerlesim); setTimeout(function(){ window.focus(); window.print(); }, 150); }
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(bas); else { window.addEventListener('load', bas, {once:true}); setTimeout(bas, 300); }
    })();</scr` + `ipt></body></html>`;
  cerceveYazdir(html, '210mm', '297mm');
}

/* ---------- Hoca başına PDF ---------- */
/** Bir evrak sayfasını ekran dışında tam A4 boyutunda kopyalayıp görüntüsünü alır. */
export async function sayfaGorseli(sayfa: HTMLElement, html2canvas: (e: HTMLElement, o: object) => Promise<HTMLCanvasElement>) {
  const kap = document.createElement('div');
  kap.style.cssText = 'position:fixed; left:-12000px; top:0; width:210mm; height:297mm; background:#fff; overflow:hidden;';
  const kopya = sayfa.cloneNode(true) as HTMLElement;
  kap.appendChild(kopya);
  document.body.appendChild(kap);
  try {
    sirkuYerlesim(kopya);
    return await html2canvas(kopya, { scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: true });
  } finally {
    kap.remove();
  }
}

/** Evrakları öğretim elemanına göre gruplayıp her biri için tek PDF üretir; ayrı ayrı ya da tek ZIP olarak indirir. */
export async function hocaPdfleri(kartlar: HTMLElement[], hafta: string, mod: 'ayri' | 'zip', yaz: (m: string) => void) {
  yaz('PDF araçları yükleniyor…');
  const { html2canvas, jsPDF } = await pdfAraclari();
  const JSZip = mod === 'zip' ? (await import('jszip')).default : null;
  if (document.fonts?.ready) await document.fonts.ready;
  const gruplar = hocaGruplari(kartlar);
  const zip = JSZip ? new JSZip() : null;
  const adlar: Record<string, number> = {};
  for (let i = 0; i < gruplar.length; i++) {
    const g = gruplar[i];
    yaz(`${i + 1} / ${gruplar.length}: ${g.hoca} hazırlanıyor…`);
    const belge = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    const sayfalar = g.kartlar.flatMap(k => Array.from(k.querySelectorAll<HTMLElement>('.page')));
    for (let k = 0; k < sayfalar.length; k++) {
      const c = await sayfaGorseli(sayfalar[k], html2canvas);
      if (k) belge.addPage();
      belge.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
    }
    let ad = dosyaAdi(g.hoca, 'Ogretim_Elemani') + ' - ' + hafta;
    if (adlar[ad]) ad += ' (' + ++adlar[ad] + ')'; else adlar[ad] = 1;
    const blob = belge.output('blob');
    if (zip) zip.file(ad + '.pdf', blob);
    else { blobIndir(blob, ad + '.pdf'); await bekle(700); }   // art arda indirmelerde tarayıcıya nefes aldır
  }
  if (zip) {
    yaz('ZIP dosyası hazırlanıyor…');
    blobIndir(await zip.generateAsync({ type: 'blob' }), 'Imza Sirkuleri - ' + hafta + '.zip');
  }
  yaz(`${gruplar.length} PDF ${zip ? 'tek ZIP dosyası içinde ' : ''}indirildi. İndirilenler klasörünüzü kontrol edin.`);
}

export function hocaGruplari(kartlar: HTMLElement[]) {
  const gruplar: { hoca: string; kartlar: HTMLElement[] }[] = [];
  for (const k of kartlar) {
    const h = k.dataset.hoca || 'Öğretim elemanı';
    let g = gruplar.find(x => x.hoca === h);
    if (!g) gruplar.push((g = { hoca: h, kartlar: [] }));
    g.kartlar.push(k);
  }
  return gruplar;
}
