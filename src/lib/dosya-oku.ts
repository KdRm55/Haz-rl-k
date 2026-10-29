/**
 * Tarayıcıda Excel (.xlsx) ve CSV okuma. Dosya sunucuya gönderilmez; yalnızca tablo içeriği gider.
 * Satır numaraları Excel ile birebir örtüşür (boş satırlar korunur).
 */
export type OkunanDosya = { ad: string; sayfalar: string[]; satirlar: (sayfa: string) => string[][] };

export function csvAyristir(metin: string): string[][] {
  const ilk = metin.split(/\r?\n/, 1)[0] ?? '';
  const ayrac = [';', ',', '\t'].map(a => [a, ilk.split(a).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const out: string[][] = [];
  let satir: string[] = [], hucre = '', tirnak = false;
  for (let i = 0; i < metin.length; i++) {
    const c = metin[i];
    if (tirnak) {
      if (c === '"' && metin[i + 1] === '"') { hucre += '"'; i++; }
      else if (c === '"') tirnak = false;
      else hucre += c;
    } else if (c === '"') tirnak = true;
    else if (c === ayrac) { satir.push(hucre); hucre = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && metin[i + 1] === '\n') i++;
      satir.push(hucre); out.push(satir); satir = []; hucre = '';
    } else hucre += c;
  }
  if (hucre || satir.length) { satir.push(hucre); out.push(satir); }
  return out;
}

export async function dosyaOku(f: File): Promise<OkunanDosya> {
  if (/\.csv$/i.test(f.name)) {
    const tampon = await f.arrayBuffer();
    let metin = new TextDecoder('utf-8').decode(tampon);
    // UTF-8 değilse Türkçe Windows kodlamasıyla yeniden okunur
    if (metin.includes('�')) metin = new TextDecoder('windows-1254').decode(tampon);
    const satirlar = csvAyristir(metin.replace(/^﻿/, ''));
    return { ad: f.name, sayfalar: ['CSV'], satirlar: () => satirlar };
  }
  if (/\.xls$/i.test(f.name)) throw new Error('Eski Excel biçimi (.xls) okunamıyor. Dosyayı Excel\'de açıp "Farklı kaydet → Excel Çalışma Kitabı (.xlsx)" ile kaydedin.');
  const { xlsxOku } = await import('./xlsx-oku');
  const kitap = await xlsxOku(await f.arrayBuffer());
  return { ad: f.name, sayfalar: kitap.sayfalar, satirlar: kitap.satirlar };
}

/** Tabloyu Excel'in Türkçe ayarlarıyla açılabilecek CSV olarak indirir (UTF-8 BOM, noktalı virgül). */
export function csvIndir(ad: string, basliklar: string[], satirlar: (string | number)[][]) {
  const k = (v: string | number) => { const s = String(v ?? ''); return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const metin = '﻿' + [basliklar, ...satirlar].map(r => r.map(k).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([metin], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = ad;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
