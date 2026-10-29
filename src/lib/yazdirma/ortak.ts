/** Yazdırma ve PDF için tarayıcı yardımcıları. */

export const YAZI_TIPI = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,600;8..60,700&display=swap';
export const LOGO = '/logo.png';

export function esc(s: unknown): string {
  return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]!);
}

export function dosyaAdi(s: string, yedek = 'Belge'): string {
  return String(s || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || yedek;
}

export function blobIndir(blob: Blob, ad: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = ad;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export const bekle = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Logo dosyası yoksa yazdırılan belgede kırık resim görünmesin diye bir kez denetlenir. */
let logoVar: Promise<boolean> | null = null;
export function logoAdresi(): Promise<string> {
  logoVar ??= fetch(LOGO, { method: 'HEAD' }).then(r => r.ok && (r.headers.get('content-type') || '').startsWith('image/')).catch(() => false);
  return logoVar.then(v => (v ? new URL(LOGO, location.href).href : ''));
}

/** Belgeyi ekran dışındaki bir çerçevede açıp yazdırma penceresini getirir. */
export function cerceveYazdir(html: string, genislik: string, yukseklik: string) {
  const f = document.createElement('iframe');
  f.style.cssText = `position:fixed; left:-12000px; top:0; border:0; width:${genislik}; height:${yukseklik};`;
  document.body.appendChild(f);
  const d = f.contentDocument!;
  d.open(); d.write(html); d.close();
  setTimeout(() => f.remove(), 60000);
}

/** PDF araçları yalnızca gerektiğinde yüklenir (sayfanın ilk açılışı hızlı kalır). */
export async function pdfAraclari() {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  return { html2canvas, jsPDF };
}
