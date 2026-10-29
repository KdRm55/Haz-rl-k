/**
 * Evrak numarası ve QR (yazdırma / PDF öncesi) — Apps Script Hoca.html evrakHazirla karşılığı.
 * Her sirkü sayfası sunucuya kaydedilir (sütunlar, öğrenci sırası, hücrelerin mm cinsinden yeri); dönen 8 karakterlik
 * numara QR olarak sayfaya basılır. Taranan sayfa bu kayıtla okunur. Aynı sayfa yeniden basılınca aynı numara gelir.
 */
import qrcode from 'qrcode-generator';
import { QR_ON_EK } from '../yoklama-kurallari';
import type { EvrakSayfasi } from '../yoklama';
import { blobIndir, pdfAraclari } from './ortak';
import { kartYerlesim, sayfaGorseli, sirkuYerlesim } from './sirku';

const mmYuvarla = (v: number) => Math.round(v * 10) / 10;

export type Yerlesim = { v: 1; sayfa: [number, number]; hiza: number[][]; qr: number[] | null; satir: number[][]; sutun: number[][] };

/**
 * Sayfadaki hücrelerin yeri (mm, sayfanın sol üst köşesine göre). Ölçüm ekran dışındaki tam A4 boyutlu bir kopyada yapılır:
 * dar ekranda önizleme sıkıştırıldığı için ekrandaki ölçü baskıdakiyle aynı değildir.
 */
export function evrakYerlesim(sayfa: HTMLElement): Yerlesim {
  const kap = document.createElement('div');
  kap.style.cssText = 'position:fixed; left:-12000px; top:0; width:210mm; height:297mm; background:#fff; overflow:hidden;';
  const page = sayfa.cloneNode(true) as HTMLElement;
  kap.appendChild(page);
  document.body.appendChild(kap);
  try {
    sirkuYerlesim(page);
    return olc(page);
  } finally {
    kap.remove();
  }
}

function olc(page: HTMLElement): Yerlesim {
  const pr = page.getBoundingClientRect(), k = pr.width / 210;
  const mm = (r: DOMRect) => [mmYuvarla((r.left - pr.left) / k), mmYuvarla((r.top - pr.top) / k), mmYuvarla(r.width / k), mmYuvarla(r.height / k)];
  const satirlar = Array.from(page.querySelectorAll<HTMLTableRowElement>('table.roster tbody tr'));
  const qr = page.querySelector('.evrak-qr .eq-kod');
  return {
    v: 1, sayfa: [210, 297],
    hiza: Array.from(page.querySelectorAll('.hiza')).map(h => mm(h.getBoundingClientRect())),
    qr: qr ? mm(qr.getBoundingClientRect()) : null,
    satir: satirlar.map(tr => { const r = mm(tr.getBoundingClientRect()); return [r[1], mmYuvarla(r[1] + r[3])]; }),
    sutun: satirlar[0] ? Array.from(satirlar[0].cells).map(td => { const r = mm(td.getBoundingClientRect()); return [r[0], mmYuvarla(r[0] + r[2])]; }) : []
  };
}

/** QR görüntüsü: 21 modül × 4 px + 2 × 8 px kenar (tarama motoru bu oranı bilir). */
export function qrAdresi(no: string) {
  const q = qrcode(0, 'M');
  q.addData(QR_ON_EK + no, 'Alphanumeric');
  q.make();
  return q.createDataURL(4, 8);
}

function qrYaz(page: HTMLElement, no: string) {
  const kutu = page.querySelector('.evrak-qr');
  if (!kutu) return;
  kutu.querySelector('.eq-kod')!.innerHTML = `<img alt="" src="${qrAdresi(no)}">`;
  kutu.querySelector('.eq-no')!.textContent = no;
  kutu.classList.add('dolu');
  page.dataset.evrak = no;
}

const rosterNolari = (page: HTMLElement) =>
  Array.from(page.querySelectorAll<HTMLTableRowElement>('table.roster tbody tr')).map(tr => (tr.cells[0]?.textContent || '').trim());

/** Kartların numarası olmayan sayfalarını kaydeder ve QR'ları yerleştirir. */
export async function evrakHazirla(kartlar: HTMLElement[], kaydet: (s: EvrakSayfasi[]) => Promise<string[]>) {
  const eksik: { kart: HTMLElement; page: HTMLElement }[] = [];
  kartlar.forEach(kart => kart.querySelectorAll<HTMLElement>('.page').forEach(page => { if (!page.dataset.evrak) eksik.push({ kart, page }); }));
  if (!eksik.length) return;
  kartlar.forEach(kartYerlesim);
  const yuk: EvrakSayfasi[] = eksik.map(({ kart, page }) => {
    let sutunlar: EvrakSayfasi['sutunlar'] = [];
    try { sutunlar = JSON.parse(kart.dataset.sutunlar || '[]'); } catch { /* yok say */ }
    const tablo = page.querySelector('table.roster');
    return {
      hoca: kart.dataset.hoca || '', sinif: kart.dataset.sinif || '', tur: kart.dataset.tur || 'Program', hafta: kart.dataset.hafta || '',
      sayfa: Number(page.dataset.sayfa) || 1, toplam: Number(page.dataset.toplam) || 1,
      satir: tablo ? Number(tablo.getAttribute('data-rows')) || 0 : 0,
      sutunlar, ogrenciler: rosterNolari(page).filter(Boolean), yerlesim: evrakYerlesim(page)
    };
  });
  const numaralar: string[] = [];
  for (let i = 0; i < yuk.length; i += 200) numaralar.push(...await kaydet(yuk.slice(i, i + 200)));
  eksik.forEach(({ page }, i) => { if (numaralar[i]) qrYaz(page, numaralar[i]); });
}

/** Yazdırma ve PDF öncesi: numara alınamazsa kullanıcıya QR'sız devam etmeyi sorar. */
export async function evrakHazirlaSor(kartlar: HTMLElement[], kaydet: (s: EvrakSayfasi[]) => Promise<string[]>, yaz?: (m: string) => void) {
  try {
    yaz?.('Evrak numaraları alınıyor…');
    await evrakHazirla(kartlar, kaydet);
    yaz?.('');
    return true;
  } catch (e) {
    console.error(e);
    yaz?.('');
    return confirm('Evrak numarası (QR) alınamadı: ' + (e instanceof Error ? e.message : String(e)) +
      '\n\nQR olmadan devam edilsin mi? (Bu evraklar ileride taranarak otomatik okunamaz; yoklama elle girilir.)');
  }
}

/* ---------- Deneme taraması (yalnızca yönetim) ---------- */
/**
 * Ekrandaki sirkülere rastgele imzalar atılmış, taranmış gibi görünen bir PDF üretir.
 * Gerçek veri olmadan tarama okumasını uçtan uca denemek içindir.
 */
export async function denemeTaramasi(kartlar: HTMLElement[], kaydet: (s: EvrakSayfasi[]) => Promise<string[]>, dosyaAdi: string, yaz: (m: string) => void) {
  yaz('Evrak numaraları alınıyor…');
  await evrakHazirla(kartlar, kaydet);
  yaz('PDF araçları yükleniyor…');
  const { html2canvas, jsPDF } = await pdfAraclari();
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const sayfalar = kartlar.flatMap(k => Array.from(k.querySelectorAll<HTMLElement>('.page')));
  const renkler = ['#14141c', '#1c2a8c', '#121e5f', '#282828'];
  for (let i = 0; i < sayfalar.length; i++) {
    yaz(`Deneme sayfası ${i + 1} / ${sayfalar.length} hazırlanıyor…`);
    const page = sayfalar[i], yer = evrakYerlesim(page), nolar = rosterNolari(page);
    const c = await sayfaGorseli(page, html2canvas), x = c.getContext('2d')!, pxmm = c.width / 210;
    x.setTransform(1, 0, 0, 1, 0, 0);   // html2canvas tuvalde ölçek dönüşümü bırakabilir
    nolar.forEach((no, r) => {
      if (!no) return;
      const tumYok = Math.random() < 0.08;
      for (let s = 3; s < yer.sutun.length; s++) {
        if (tumYok || Math.random() < 0.04) continue;
        const x0 = yer.sutun[s][0] * pxmm, x1 = yer.sutun[s][1] * pxmm, y0 = yer.satir[r][0] * pxmm, y1 = yer.satir[r][1] * pxmm, w = x1 - x0, h = y1 - y0;
        x.strokeStyle = renkler[Math.floor(Math.random() * renkler.length)];
        x.lineWidth = (0.3 + Math.random() * 0.2) * pxmm; x.lineCap = 'round'; x.lineJoin = 'round';
        x.beginPath();
        const n = 4 + Math.floor(Math.random() * 4);
        let px = x0 + w * 0.15;
        x.moveTo(px, y0 + h * (0.3 + Math.random() * 0.4));
        for (let j = 1; j <= n; j++) {
          const nx = x0 + w * (0.15 + 0.7 * j / n), ny = y0 + h * (0.2 + Math.random() * 0.6);
          x.quadraticCurveTo((px + nx) / 2, y0 + h * Math.random(), nx, ny); px = nx;
        }
        x.stroke();
      }
    });
    // taranmış görünüm: hafif eğiklik ve kaydırma
    const t = document.createElement('canvas'); t.width = c.width; t.height = c.height;
    const tx = t.getContext('2d')!; tx.fillStyle = '#fbfbf9'; tx.fillRect(0, 0, t.width, t.height);
    tx.translate(t.width / 2 + (Math.random() - 0.5) * 4 * pxmm, t.height / 2 + (Math.random() - 0.5) * 4 * pxmm);
    tx.rotate((Math.random() - 0.5) * 2 * Math.PI / 180); tx.drawImage(c, -c.width / 2, -c.height / 2);
    if (i) pdf.addPage();
    pdf.addImage(t.toDataURL('image/jpeg', 0.72), 'JPEG', 0, 0, 210, 297);
  }
  blobIndir(pdf.output('blob'), dosyaAdi);
  yaz('Deneme PDF\'i indirildi. "Yoklama" sekmesindeki "Taranmış sirküleri yükle" alanına yükleyin.');
}
