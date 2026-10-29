import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { baslikBul } from '@/lib/aktarim-kurallari';
import { SABLON_B64 } from '@/lib/sablon-veri';
import { sablonXmlDoldur } from '@/lib/sablon-xml';
import { xlsxOku } from '@/lib/xlsx-oku';

describe('xlsx okuyucu', () => {
  it('öğrenci listesi şablonunu okur (sütun açıklamalı, exceljs okuyamıyordu)', async () => {
    const k = await xlsxOku(Buffer.from(SABLON_B64, 'base64'));
    const s = k.satirlar(k.sayfalar[0]);
    expect(s[0].slice(0, 3)).toEqual(['Öğrenci No', 'Adı', 'Soyadı']);
    expect(baslikBul(s, null).basSatir).toBe(0);
  });

  it('dolu şablon: yazılan öğrenciler satır numarasıyla okunur', async () => {
    const zip = await JSZip.loadAsync(Buffer.from(SABLON_B64, 'base64'));
    const ad = Object.keys(zip.files).find(n => /xl\/worksheets\/sheet1\.xml$/.test(n))!;
    zip.file(ad, sablonXmlDoldur(await zip.file(ad)!.async('string'), [['2024001', 'Ayşe', 'Yılmaz', 'K', '', 'İlahiyat', '', ''], ['0123', 'Ali & Can', 'Öz', 'E', '', '', '', '']]));
    const k = await xlsxOku(await zip.generateAsync({ type: 'uint8array' }));
    const s = k.satirlar(k.sayfalar[0]);
    expect(s[1].slice(0, 4)).toEqual(['2024001', 'Ayşe', 'Yılmaz', 'K']);
    expect(s[2].slice(0, 3)).toEqual(['0123', 'Ali & Can', 'Öz']);   // baştaki sıfır korunur
  });

  it('sayı, tarih, zengin metin, boş satır ve birden fazla sayfa', async () => {
    const wb = new ExcelJS.Workbook();
    const w = wb.addWorksheet('Liste');
    w.getCell('A1').value = 'No'; w.getCell('B1').value = 'Puan'; w.getCell('C1').value = 'Tarih'; w.getCell('D1').value = 'Not';
    w.getCell('A2').value = 2024001; w.getCell('B2').value = 72.5;
    w.getCell('C2').value = new Date(Date.UTC(2026, 9, 29)); w.getCell('C2').numFmt = 'dd.mm.yyyy';
    w.getCell('D2').value = { richText: [{ text: 'Kalın ' }, { text: 'metin' }] };
    w.getCell('A4').value = 10000000146;   // 3. satır boş
    wb.addWorksheet('İkinci').getCell('B2').value = 'x';
    const k = await xlsxOku(new Uint8Array(await wb.xlsx.writeBuffer()));
    expect(k.sayfalar).toEqual(['Liste', 'İkinci']);
    const s = k.satirlar('Liste');
    expect(s[1]).toEqual(['2024001', '72.5', '29.10.2026', 'Kalın metin']);
    expect(s[2]).toEqual(['', '', '', '']);
    expect(s[3][0]).toBe('10000000146');
    expect(k.satirlar('İkinci')).toEqual([[], ['', 'x']].map(r => [...r, ...Array(2 - r.length).fill('')]));
  });
});
