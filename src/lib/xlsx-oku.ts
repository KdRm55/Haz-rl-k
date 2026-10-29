/**
 * Yalın .xlsx okuyucu: yalnızca hücre değerlerini satır × sütun olarak çıkarır (biçim, açıklama, formül yok sayılır).
 * Tarayıcıda ve Node'da çalışır; dış kütüphane olarak yalnızca JSZip kullanır.
 * Sayılar Excel'in gösterdiği gibi yazılır (tarih biçimli hücreler gg.aa.yyyy); satır numaraları Excel ile örtüşür.
 */
import JSZip from 'jszip';

const VARLIK: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const cozum = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, k: string) =>
  k[0] === '#' ? String.fromCodePoint(k[1] === 'x' || k[1] === 'X' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10)) : VARLIK[k] ?? m);

/** <si> ya da <is> içindeki metin (zengin metin parçaları birleştirilir, fonetik ekler atlanır). */
const metinParcasi = (xml: string) =>
  [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(m => cozum(m[1])).join('');

const sutunNo = (ref: string) => { let n = 0; for (const c of ref.replace(/\d+$/, '')) n = n * 26 + (c.charCodeAt(0) - 64); return n - 1; };
const nitelik = (etiket: string, ad: string) => new RegExp(`\\b${ad}="([^"]*)"`).exec(etiket)?.[1];

/** Excel tarih seri numarası → gg.aa.yyyy (saat varsa ss:dd eklenir). */
function tarihMetni(seri: number): string {
  const ms = Math.round((seri - 25569) * 86400000);
  const d = new Date(ms), p = (n: number) => String(n).padStart(2, '0');
  const gun = `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
  const saat = d.getUTCHours() || d.getUTCMinutes() ? ` ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` : '';
  return seri < 1 ? `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` : gun + saat;
}
const sayiMetni = (x: number) => (Number.isInteger(x) ? String(x) : String(Number(x.toPrecision(15))));

const TARIH_KIMLIK = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
const tarihBicimiMi = (kod: string) => /[dmyhs]/i.test(kod.replace(/"[^"]*"|\[[^\]]*\]|\\./g, '')) && !/^(General|0|#)/i.test(kod);

export type XlsxKitap = { sayfalar: string[]; satirlar: (sayfa: string) => string[][] };

export async function xlsxOku(veri: ArrayBuffer | Uint8Array): Promise<XlsxKitap> {
  const zip = await JSZip.loadAsync(veri);
  const oku = async (yol: string) => (await zip.file(yol)?.async('string')) ?? '';

  const paylasilan = [...(await oku('xl/sharedStrings.xml')).matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(m => metinParcasi(m[1]));

  // Tarih biçimli stiller
  const stil = await oku('xl/styles.xml');
  const ozelBicim = new Map([...stil.matchAll(/<numFmt\b[^>]*>/g)].map(m => [Number(nitelik(m[0], 'numFmtId')), cozum(nitelik(m[0], 'formatCode') ?? '')]));
  const cellXfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stil)?.[1] ?? '';
  const tarihStili = [...cellXfs.matchAll(/<xf\b[^>]*\/?>/g)].map(m => {
    const id = Number(nitelik(m[0], 'numFmtId') ?? 0);
    return TARIH_KIMLIK.has(id) || (ozelBicim.has(id) && tarihBicimiMi(ozelBicim.get(id)!));
  });

  // Sayfa adları ve dosyaları
  const kitap = await oku('xl/workbook.xml');
  const iliski = await oku('xl/_rels/workbook.xml.rels');
  const hedef = new Map([...iliski.matchAll(/<Relationship\b[^>]*>/g)].map(m => [nitelik(m[0], 'Id'), nitelik(m[0], 'Target') ?? '']));
  const sayfalar = [...kitap.matchAll(/<sheet\b[^>]*>/g)].map(m => {
    const t = hedef.get(nitelik(m[0], 'r:id')) ?? '';
    return { ad: cozum(nitelik(m[0], 'name') ?? ''), yol: t.startsWith('/') ? t.slice(1) : 'xl/' + t.replace(/^\.\//, '') };
  });
  const xmller = new Map(await Promise.all(sayfalar.map(async s => [s.ad, await oku(s.yol)] as const)));

  return {
    sayfalar: sayfalar.map(s => s.ad),
    satirlar: (ad: string) => {
      const xml = xmller.get(ad) ?? '';
      const out: string[][] = [];
      let sonSatir = 0;
      for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
        const rn = Number(nitelik(rm[1], 'r')) || sonSatir + 1;
        sonSatir = rn;
        const hucreler: string[] = [];
        let sonSutun = -1;
        for (const cm of (rm[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
          const ref = nitelik(cm[1], 'r');
          const c = ref ? sutunNo(ref) : sonSutun + 1;
          sonSutun = c;
          const t = nitelik(cm[1], 't'), ic = cm[2] ?? '';
          const v = /<v>([\s\S]*?)<\/v>/.exec(ic)?.[1];
          let deger = '';
          if (t === 's') deger = paylasilan[Number(v)] ?? '';
          else if (t === 'inlineStr') deger = metinParcasi(ic);
          else if (t === 'b') deger = v === '1' ? 'DOĞRU' : 'YANLIŞ';
          else if (t === 'str' || t === 'e') deger = cozum(v ?? '');
          else if (v != null && v !== '') {
            const x = Number(v);
            deger = isNaN(x) ? cozum(v) : tarihStili[Number(nitelik(cm[1], 's') ?? 0)] ? tarihMetni(x) : sayiMetni(x);
          }
          while (hucreler.length < c) hucreler.push('');
          hucreler[c] = deger;
        }
        while (out.length < rn - 1) out.push([]);
        out[rn - 1] = hucreler;
      }
      const genislik = out.reduce((m, r) => Math.max(m, r.length), 0);
      return out.map(r => { const k = r.slice(); while (k.length < genislik) k.push(''); return k; });
    }
  };
}
