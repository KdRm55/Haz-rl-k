/** Şablonun çalışma sayfası XML'ine öğrenci satırlarını yazma (saf, test edilebilir). Kaynak: Sablon.gs. */

function xmlKacis(s: unknown) {
  return String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Şablonun çalışma sayfası XML'ine satırları yazar (satirlar[0] → Excel 2. satır, sütunlar A..H). */
export function sablonXmlDoldur(xml: string, satirlar: string[][]): string {
  const HARF = 'ABCDEFGH';
  const hucre = (ref: string, s: string, v: string) => `<c r="${ref}"${s || ''} t="inlineStr"><is><t xml:space="preserve">${xmlKacis(v)}</t></is></c>`;
  let enSon = 1;
  xml = xml.replace(/<row r="(\d+)"([^>]*)>([\s\S]*?)<\/row>/g, (m, n: string, attr: string, govde: string) => {
    enSon = Math.max(enSon, Number(n));
    const r = satirlar[Number(n) - 2];
    if (!r) return m;
    const yeni = govde.replace(/<c r="([A-H])(\d+)"( s="\d+")?(?: t="\w+")?\s*(?:\/>|><\/c>)/g, (cm, kol: string, rn: string, s: string) => {
      const v = r[HARF.indexOf(kol)];
      return v === '' || v == null ? cm : hucre(kol + rn, s, v);
    });
    return `<row r="${n}"${attr}>${yeni}</row>`;
  });
  if (satirlar.length + 1 > enSon) {   // şablondaki hazır satırlardan fazla öğrenci varsa
    let ek = '';
    for (let i = enSon - 1; i < satirlar.length; i++) {
      const rn = i + 2;
      ek += `<row r="${rn}">` + satirlar[i].map((v, k) => (v === '' || v == null ? '' : hucre(HARF[k] + rn, '', v))).join('') + '</row>';
    }
    xml = xml.replace('</sheetData>', ek + '</sheetData>').replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:H${satirlar.length + 1}"/>`);
  }
  return xml;
}
