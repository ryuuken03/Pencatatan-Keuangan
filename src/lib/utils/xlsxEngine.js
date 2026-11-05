/**
 * Native OOXML (.xlsx) Reader & Writer Engine (Zero External Dependency)
 * Menghasilkan & membaca file Microsoft Excel (.xlsx) asli:
 * - Mendukung Multi-Worksheet, lebar kolom otomatis (<cols>), tipe angka asli, dan format ribuan (#,##0).
 * - Membaca file .xlsx (baik yang dibuat oleh aplikasi ini maupun disimpan dari Microsoft Excel / Google Sheets).
 */

import { formatDateShort } from '../utils.js';

/* ==========================================================================
   1. UTILITAS ZIP & CRC-32 UNTUK OOXML (.XLSX)
   ========================================================================== */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Buat arsip ZIP (.xlsx) dari daftar file [{ name, data (Uint8Array | string) }]
 * Menggunakan metode STORE (0) yang 100% standar ZIP/OOXML, cepat, dan kompatibel di semua versi Excel.
 */
export function createZipArchive(files) {
  const encoder = new TextEncoder();
  const entries = files.map((f) => {
    const nameBytes = encoder.encode(f.name);
    const dataBytes = typeof f.data === 'string' ? encoder.encode(f.data) : f.data;
    const crc = crc32(dataBytes);
    return {
      nameBytes,
      dataBytes,
      crc,
      size: dataBytes.length,
      offset: 0
    };
  });

  let localTotalSize = 0;
  let centralTotalSize = 0;
  for (const e of entries) {
    e.offset = localTotalSize;
    localTotalSize += 30 + e.nameBytes.length + e.size;
    centralTotalSize += 46 + e.nameBytes.length;
  }

  const totalSize = localTotalSize + centralTotalSize + 22;
  const out = new Uint8Array(totalSize);
  const view = new DataView(out.buffer);
  let pos = 0;

  // Local File Headers + Data
  for (const e of entries) {
    view.setUint32(pos, 0x04034b50, true); // signature
    view.setUint16(pos + 4, 20, true); // version needed (2.0)
    view.setUint16(pos + 6, 0x0800, true); // general purpose bit flag (UTF-8)
    view.setUint16(pos + 8, 0, true); // compression method: 0 (STORE)
    view.setUint16(pos + 10, 0, true); // mod time
    view.setUint16(pos + 12, 0x5421, true); // mod date
    view.setUint32(pos + 14, e.crc, true);
    view.setUint32(pos + 18, e.size, true); // compressed size
    view.setUint32(pos + 22, e.size, true); // uncompressed size
    view.setUint16(pos + 26, e.nameBytes.length, true);
    view.setUint16(pos + 28, 0, true); // extra field length
    pos += 30;

    out.set(e.nameBytes, pos);
    pos += e.nameBytes.length;

    out.set(e.dataBytes, pos);
    pos += e.size;
  }

  const centralDirOffset = pos;

  // Central Directory Headers
  for (const e of entries) {
    view.setUint32(pos, 0x02014b50, true); // signature
    view.setUint16(pos + 4, 20, true); // version made by
    view.setUint16(pos + 6, 20, true); // version needed
    view.setUint16(pos + 8, 0x0800, true); // UTF-8 flag
    view.setUint16(pos + 10, 0, true); // compression method: 0
    view.setUint16(pos + 12, 0, true);
    view.setUint16(pos + 14, 0x5421, true);
    view.setUint32(pos + 16, e.crc, true);
    view.setUint32(pos + 20, e.size, true);
    view.setUint32(pos + 24, e.size, true);
    view.setUint16(pos + 28, e.nameBytes.length, true);
    view.setUint16(pos + 30, 0, true); // extra length
    view.setUint16(pos + 32, 0, true); // comment length
    view.setUint16(pos + 34, 0, true); // disk number
    view.setUint16(pos + 36, 0, true); // internal attrs
    view.setUint32(pos + 38, 0, true); // external attrs
    view.setUint32(pos + 42, e.offset, true); // local header offset
    pos += 46;

    out.set(e.nameBytes, pos);
    pos += e.nameBytes.length;
  }

  // End of Central Directory Record (EOCD)
  view.setUint32(pos, 0x06054b50, true);
  view.setUint16(pos + 4, 0, true);
  view.setUint16(pos + 6, 0, true);
  view.setUint16(pos + 8, entries.length, true);
  view.setUint16(pos + 10, entries.length, true);
  view.setUint32(pos + 12, centralTotalSize, true);
  view.setUint32(pos + 16, centralDirOffset, true);
  view.setUint16(pos + 20, 0, true);

  return out;
}

/**
 * Decompress raw deflate bytes menggunakan DecompressionStream bawaan browser/Node
 */
async function inflateRawBytes(compressedBytes) {
  if (typeof DecompressionStream !== 'undefined') {
    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    writer.write(compressedBytes);
    writer.close();
    const response = new Response(ds.readable);
    const ab = await response.arrayBuffer();
    return new Uint8Array(ab);
  }
  throw new Error('Browser tidak mendukung DecompressionStream untuk membaca file ZIP terkompresi.');
}

/**
 * Ekstrak seluruh file teks dari arsip ZIP (.xlsx)
 * Mengembalikan Map<filename, stringContent>
 */
export async function extractZipArchive(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder('utf-8');

  // Cari End of Central Directory (0x06054b50) dari belakang
  let eocdOffset = -1;
  const minEocd = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= minEocd; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error('File bukan format Excel (.xlsx) yang valid.');
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralDirOffset = view.getUint32(eocdOffset + 16, true);

  const fileMap = new Map();
  let ptr = centralDirOffset;

  for (let i = 0; i < totalEntries; i++) {
    if (ptr + 46 > bytes.length || view.getUint32(ptr, true) !== 0x02014b50) {
      break;
    }
    const compressionMethod = view.getUint16(ptr + 10, true);
    const compressedSize = view.getUint32(ptr + 20, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localHeaderOffset = view.getUint32(ptr + 42, true);

    const nameBytes = bytes.subarray(ptr + 46, ptr + 46 + nameLen);
    const fileName = decoder.decode(nameBytes);

    ptr += 46 + nameLen + extraLen + commentLen;

    // Baca Local File Header untuk mendapatkan posisi data
    if (localHeaderOffset + 30 <= bytes.length && view.getUint32(localHeaderOffset, true) === 0x04034b50) {
      const localNameLen = view.getUint16(localHeaderOffset + 26, true);
      const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
      const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
      const rawSlice = bytes.subarray(dataStart, dataStart + compressedSize);

      let uncompressedBytes;
      if (compressionMethod === 0) {
        uncompressedBytes = rawSlice;
      } else if (compressionMethod === 8) {
        uncompressedBytes = await inflateRawBytes(rawSlice);
      } else {
        continue;
      }

      if (fileName.endsWith('.xml') || fileName.endsWith('.rels')) {
        fileMap.set(fileName, decoder.decode(uncompressedBytes));
      }
    }
  }

  return fileMap;
}

/* ==========================================================================
   2. GENERATOR WORKBOOK OOXML (.XLSX) MULTI-SHEET
   ========================================================================== */

function escapeXml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // Bersihkan karakter kontrol XML ilegal
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

function colIndexToLetter(colIdx) {
  let temp = colIdx + 1;
  let letter = '';
  while (temp > 0) {
    const rem = (temp - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    temp = Math.floor((temp - 1) / 26);
  }
  return letter;
}

/**
 * Style Index di styles.xml:
 * 0 = Default Normal
 * 1 = Title (Bold 12pt)
 * 2 = Table Header (Bold, Putih di atas Biru/Slate Gelap, Border)
 * 3 = Data Teks Normal dengan Border Tipis
 * 4 = Data Angka/Rupiah (#,##0) dengan Border Tipis
 * 5 = Baris Total Teks (Bold, Background Abu Muda, Border Atas/Bawah)
 * 6 = Baris Total Angka (#,##0, Bold, Background Abu Muda, Border Atas/Bawah)
 * 7 = Section Subtitle (Bold 10pt, Background Slate Muda)
 */
function buildStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1">
    <numFmt numFmtId="164" formatCode="#,##0"/>
  </numFmts>
  <fonts count="4">
    <font><sz val="10"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="12"/><color rgb="FF0F172A"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="10"/><color rgb="FF0F172A"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="5">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1E293B"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE2E8F0"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="3">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFCBD5E1"/></left>
      <right style="thin"><color rgb="FFCBD5E1"/></right>
      <top style="thin"><color rgb="FFCBD5E1"/></top>
      <bottom style="thin"><color rgb="FFCBD5E1"/></bottom>
      <diagonal/>
    </border>
    <border>
      <left style="thin"><color rgb="FF94A3B8"/></left>
      <right style="thin"><color rgb="FF94A3B8"/></right>
      <top style="medium"><color rgb="FF475569"/></top>
      <bottom style="double"><color rgb="FF475569"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="8">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1">
      <alignment vertical="center"/>
    </xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <xf numFmtId="0" fontId="3" fillId="3" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="center"/>
    </xf>
    <xf numFmtId="164" fontId="3" fillId="3" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="center"/>
    </xf>
  </cellXfs>
</styleSheet>`;
}

/**
 * Bangun XML untuk 1 Worksheet dari array 2D `rows`
 * Tiap baris dapat berupa array nilai primitif atau objek `{ v, s }` (v = value, s = style index)
 */
function buildWorksheetXml(rows, colWidths = []) {
  // Hitung lebar kolom otomatis jika tidak disediakan
  const maxCols = rows.reduce((m, r) => Math.max(m, Array.isArray(r) ? r.length : 0), 0);
  const computedWidths = [];

  for (let c = 0; c < maxCols; c++) {
    if (colWidths[c]) {
      computedWidths[c] = colWidths[c];
      continue;
    }
    let maxLen = 10;
    for (const r of rows) {
      if (!Array.isArray(r) || r[c] === undefined || r[c] === null) continue;
      const raw = typeof r[c] === 'object' && r[c] !== null && 'v' in r[c] ? r[c].v : r[c];
      const strLen = typeof raw === 'number' ? raw.toLocaleString('id-ID').length + 3 : String(raw).length;
      if (strLen > maxLen) maxLen = strLen;
    }
    computedWidths[c] = Math.min(48, Math.max(10, maxLen + 3));
  }

  let colsXml = '';
  if (computedWidths.length > 0) {
    const colItems = computedWidths
      .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
      .join('');
    colsXml = `<cols>${colItems}</cols>`;
  }

  const sheetRowsXml = [];

  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    const row = rows[rIdx];
    if (!Array.isArray(row) || row.length === 0) continue;

    const rowNum = rIdx + 1;
    const cellsXml = [];

    for (let cIdx = 0; cIdx < row.length; cIdx++) {
      const item = row[cIdx];
      if (item === undefined || item === null || item === '') {
        // Tetap gambar border jika ada style eksplisit
        if (typeof item === 'object' && item !== null && item.s !== undefined) {
          const ref = `${colIndexToLetter(cIdx)}${rowNum}`;
          cellsXml.push(`<c r="${ref}" s="${item.s}" t="inlineStr"><is><t></t></is></c>`);
        }
        continue;
      }

      const isObj = typeof item === 'object' && item !== null && 'v' in item;
      const val = isObj ? item.v : item;
      const ref = `${colIndexToLetter(cIdx)}${rowNum}`;

      if (typeof val === 'number' && Number.isFinite(val)) {
        const styleIdx = isObj && item.s !== undefined ? item.s : 4;
        cellsXml.push(`<c r="${ref}" s="${styleIdx}"><v>${val}</v></c>`);
      } else {
        const styleIdx = isObj && item.s !== undefined ? item.s : 3;
        const rawStr = String(val ?? '');
        // Cegah formula injection jika string diawali =, +, -, @
        const safeStr = /^[=+\-@]/.test(rawStr) ? `'${rawStr}` : rawStr;
        cellsXml.push(
          `<c r="${ref}" s="${styleIdx}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(safeStr)}</t></is></c>`
        );
      }
    }

    sheetRowsXml.push(`<row r="${rowNum}">${cellsXml.join('')}</row>`);
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  ${colsXml}
  <sheetData>${sheetRowsXml.join('')}</sheetData>
</worksheet>`;
}

/**
 * Buat file binary .xlsx (Uint8Array) dari daftar sheets: `[{ name: 'Sheet1', rows: [...], colWidths: [...] }]`
 */
export function buildXlsxBinary(sheets) {
  const validSheets = sheets.map((s, idx) => {
    const cleanName = String(s.name || `Sheet${idx + 1}`)
      .replace(/[\\/?*[\]:]/g, ' ')
      .trim()
      .slice(0, 31);
    return {
      id: idx + 1,
      name: cleanName || `Sheet${idx + 1}`,
      xml: buildWorksheetXml(s.rows || [], s.colWidths || [])
    };
  });

  const contentTypesOverrides = validSheets
    .map(
      (s) =>
        `<Override PartName="/xl/worksheets/sheet${s.id}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    .join('');

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${contentTypesOverrides}
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookSheetsXml = validSheets
    .map((s) => `<sheet name="${escapeXml(s.name)}" sheetId="${s.id}" r:id="rId${s.id}"/>`)
    .join('');

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${workbookSheetsXml}</sheets>
</workbook>`;

  const wbRelsItems = validSheets
    .map(
      (s) =>
        `<Relationship Id="rId${s.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${s.id}.xml"/>`
    )
    .join('');

  const styleRelId = validSheets.length + 1;
  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${wbRelsItems}
  <Relationship Id="rId${styleRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const zipFiles = [
    { name: '[Content_Types].xml', data: contentTypesXml },
    { name: '_rels/.rels', data: rootRelsXml },
    { name: 'xl/workbook.xml', data: workbookXml },
    { name: 'xl/_rels/workbook.xml.rels', data: workbookRelsXml },
    { name: 'xl/styles.xml', data: buildStylesXml() },
    ...validSheets.map((s) => ({
      name: `xl/worksheets/sheet${s.id}.xml`,
      data: s.xml
    }))
  ];

  return createZipArchive(zipFiles);
}

/**
 * Trigger download file di browser
 */
export { downloadBlobFile } from './fileDownload.js';

/* ==========================================================================
   3. PARSER / READER FILE EXCEL (.XLSX) UNTUK IMPORT DATA
   ========================================================================== */

function decodeXmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function colLettersToIndex(letters) {
  let idx = 0;
  for (let i = 0; i < letters.length; i++) {
    idx = idx * 26 + (letters.charCodeAt(i) - 64);
  }
  return idx - 1;
}

function parseSharedStringsXml(xmlStr) {
  if (!xmlStr) return [];
  const strings = [];
  const siMatches = xmlStr.match(/<si[\s>][\s\S]*?<\/si>/g) || [];
  for (const si of siMatches) {
    const tMatches = si.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g) || [];
    const combined = tMatches
      .map((t) => decodeXmlEntities(t.replace(/<t(?:\s[^>]*)?>|<\/t>/g, '')))
      .join('');
    strings.push(combined);
  }
  return strings;
}

function parseSheetXmlToRows(xmlStr, sharedStrings = []) {
  const rows = [];
  const rowMatches = xmlStr.match(/<row[\s>][\s\S]*?<\/row>/g) || [];

  for (const rowXml of rowMatches) {
    const rowArr = [];
    // Tangkap baik self-closing <c .../> maupun <c ...>...</c>
    const cellRegex = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let match;
    let nextColIdx = 0;

    while ((match = cellRegex.exec(rowXml)) !== null) {
      const attrs = match[1] || '';
      const inner = match[2] || '';

      const refMatch = attrs.match(/\br="([A-Z]+)\d+"/);
      const colIdx = refMatch ? colLettersToIndex(refMatch[1]) : nextColIdx;
      nextColIdx = colIdx + 1;

      const typeMatch = attrs.match(/\bt="([^"]+)"/);
      const cellType = typeMatch ? typeMatch[1] : 'n';

      let cellValue = '';
      if (cellType === 'inlineStr') {
        const tMatches = inner.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g) || [];
        cellValue = tMatches
          .map((t) => decodeXmlEntities(t.replace(/<t(?:\s[^>]*)?>|<\/t>/g, '')))
          .join('');
      } else {
        const vMatch = inner.match(/<v>([\s\S]*?)<\/v>/);
        const rawV = vMatch ? decodeXmlEntities(vMatch[1]) : '';
        if (cellType === 's') {
          const sIdx = parseInt(rawV, 10);
          cellValue = !isNaN(sIdx) && sharedStrings[sIdx] !== undefined ? sharedStrings[sIdx] : rawV;
        } else if (cellType === 'str' || cellType === 'b') {
          cellValue = rawV;
        } else {
          // Number atau kosong
          if (rawV !== '' && !isNaN(Number(rawV))) {
            cellValue = Number(rawV);
          } else {
            cellValue = rawV;
          }
        }
      }

      rowArr[colIdx] = cellValue;
    }

    // Isi celah undefined dengan string kosong
    for (let i = 0; i < rowArr.length; i++) {
      if (rowArr[i] === undefined) rowArr[i] = '';
    }

    if (rowArr.some((cell) => cell !== '' && cell !== null && cell !== undefined)) {
      rows.push(rowArr);
    }
  }

  return rows;
}

/**
 * Baca seluruh sheet dari file ArrayBuffer .xlsx
 * Mengembalikan array `[{ name, rows }]`
 */
export async function readXlsxWorkbook(arrayBuffer) {
  const fileMap = await extractZipArchive(arrayBuffer);
  const sharedStrings = parseSharedStringsXml(fileMap.get('xl/sharedStrings.xml'));

  const workbookXml = fileMap.get('xl/workbook.xml') || '';
  const relsXml = fileMap.get('xl/_rels/workbook.xml.rels') || '';

  // Petakan rId -> target path
  const relMap = new Map();
  const relRegex = /<Relationship\b[^>]*?\bId="([^"]+)"[^>]*?\bTarget="([^"]+)"/g;
  let rMatch;
  while ((rMatch = relRegex.exec(relsXml)) !== null) {
    let target = rMatch[2].replace(/^\//, '');
    if (!target.startsWith('xl/')) target = `xl/${target}`;
    relMap.set(rMatch[1], target);
  }

  const sheets = [];
  const sheetRegex = /<sheet\b[^>]*?\bname="([^"]+)"[^>]*?\br:id="([^"]+)"/g;
  let sMatch;
  while ((sMatch = sheetRegex.exec(workbookXml)) !== null) {
    const sheetName = decodeXmlEntities(sMatch[1]);
    const rId = sMatch[2];
    const targetPath = relMap.get(rId);
    const xmlContent = targetPath ? fileMap.get(targetPath) : null;
    if (xmlContent) {
      sheets.push({
        name: sheetName,
        rows: parseSheetXmlToRows(xmlContent, sharedStrings)
      });
    }
  }

  // Fallback jika urutan atribut di workbook.xml berbeda
  if (sheets.length === 0) {
    for (const [path, xmlContent] of fileMap.entries()) {
      if (path.startsWith('xl/worksheets/sheet') && path.endsWith('.xml')) {
        sheets.push({
          name: path.replace('xl/worksheets/', '').replace('.xml', ''),
          rows: parseSheetXmlToRows(xmlContent, sharedStrings)
        });
      }
    }
  }

  return sheets;
}

/* ==========================================================================
   4. FUNGSI EXPORT & IMPORT LAPORAN TRANSAKSI (.XLSX)
   ========================================================================== */

function getWorkspaceLabel(wsId) {
  if (wsId === 'pekerjaan' || wsId === 'kopdes') return 'Buku Pekerjaan';
  if (wsId === 'business') return 'Buku Usaha';
  return 'Buku Pribadi';
}

function parseWorkspaceLabel(val, fallback = 'personal') {
  const s = String(val || '').toLowerCase().trim();
  if (
    s.includes('pekerjaan') ||
    s.includes('kerja') ||
    s.includes('kantor') ||
    s.includes('dinas') ||
    s.includes('kopdes') ||
    s.includes('koperasi')
  ) {
    return fallback === 'kopdes' ? 'kopdes' : 'pekerjaan';
  }
  if (s.includes('usaha') || s.includes('business') || s.includes('bisnis')) return 'business';
  if (s.includes('pribadi') || s.includes('personal')) return 'personal';
  return fallback;
}

function getTypeLabel(type) {
  switch (type) {
    case 'income':
      return 'Pemasukan';
    case 'expense':
      return 'Pengeluaran';
    case 'transfer':
      return 'Transfer Antar Akun';
    case 'debt':
      return 'Utang Masuk';
    case 'receivable':
      return 'Kasbon / Piutang';
    default:
      return type || 'Pengeluaran';
  }
}

function parseTypeLabel(val, inVal = 0, outVal = 0) {
  const s = String(val || '').toLowerCase().trim();
  if (s.includes('masuk') || s.includes('income') || s.includes('setoran')) return 'income';
  if (s.includes('keluar') || s.includes('expense') || s.includes('belanja')) return 'expense';
  if (s.includes('transfer') || s.includes('pindah')) return 'transfer';
  if (s.includes('utang') || s === 'debt') return 'debt';
  if (s.includes('piutang') || s.includes('kasbon') || s === 'receivable') return 'receivable';
  if (Number(inVal) > 0 && Number(outVal) === 0) return 'income';
  return 'expense';
}

function getReimburseLabel(status) {
  if (status === 'pending') return 'Belum Diganti (Pending)';
  if (status === 'settled') return 'Sudah Diganti (Selesai)';
  return '-';
}

function parseReimburseLabel(val) {
  const s = String(val || '').toLowerCase().trim();
  if (s.includes('belum') || s.includes('pending')) return 'pending';
  if (s.includes('sudah') || s.includes('settled') || s.includes('selesai')) return 'settled';
  return 'none';
}

function getItemsSummary(tx) {
  const items =
    Array.isArray(tx?.items) && tx.items.length > 0
      ? tx.items
      : Array.isArray(tx?.metadata?.items)
        ? tx.metadata.items
        : [];
  if (items.length === 0) return '';
  return items.map((it) => `${it.name} (${it.amount})`).join('; ');
}

function parseItemsSummary(str) {
  if (!str || typeof str !== 'string') return [];
  return str
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = part.match(/^(.*?)\s*\((\d+)\)\s*$/);
      if (m) {
        return { name: m[1].trim(), amount: parseInt(m[2], 10) || 0 };
      }
      return { name: part, amount: 0 };
    });
}

function buildTransactionSheetRows({
  transactions = [],
  accountsMap = {},
  categoriesMap = {},
  activeWorkspace = 'personal',
  periodLabel = 'Semua Periode'
}) {
  const wsTitle = getWorkspaceLabel(activeWorkspace).toUpperCase();
  const rows = [
    [{ v: `DAFTAR TRANSAKSI — ${wsTitle}`, s: 1 }],
    [{ v: `Periode: ${periodLabel} | Dicetak: ${formatDateShort(new Date().toISOString())}`, s: 0 }],
    [],
    [
      'No',
      'Tanggal ISO',
      'Tanggal & Jam',
      'Buku Kas',
      'No. Bukti',
      'Unit Usaha Kopdes',
      'PIC / Pihak',
      'Tipe Transaksi',
      'Kategori',
      'Dompet / Rekening',
      'Rekening Tujuan',
      'Pemasukan (Rp)',
      'Pengeluaran (Rp)',
      'Nominal (Rp)',
      'Status Reimburse',
      'Ditalangi Oleh',
      'Rincian Produk',
      'Catatan',
      'ID Transaksi'
    ].map((h) => ({ v: h, s: 2 }))
  ];

  const sorted = [...transactions].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  let totalIn = 0;
  let totalOut = 0;

  sorted.forEach((tx, idx) => {
    const amt = Math.round(Number(tx.amount) || 0);
    const isIn = tx.type === 'income' || tx.type === 'debt';
    const isOut = tx.type === 'expense' || tx.type === 'receivable';
    const inVal = isIn ? amt : 0;
    const outVal = isOut ? amt : 0;

    totalIn += inVal;
    totalOut += outVal;

    const accName = accountsMap[tx.account_id]?.name || '-';
    const toAccName = tx.to_account_id ? accountsMap[tx.to_account_id]?.name || '-' : '-';
    const catName =
      tx.type === 'transfer'
        ? `Transfer ke ${toAccName}`
        : categoriesMap[tx.category_id]?.name || 'Tanpa Kategori';

    const reimburseFrom = tx.metadata?.reimburse_from_account_id
      ? accountsMap[tx.metadata.reimburse_from_account_id]?.name || 'Dompet Pribadi'
      : '-';

    rows.push([
      { v: idx + 1, s: 3 },
      { v: tx.date ? String(tx.date).slice(0, 16).replace('T', ' ') : '', s: 3 },
      { v: formatDateShort(tx.date), s: 3 },
      { v: getWorkspaceLabel(tx.workspace_id), s: 3 },
      { v: tx.metadata?.no_bukti || '-', s: 3 },
      { v: tx.metadata?.unit_usaha || '-', s: 3 },
      { v: tx.metadata?.pic_pihak || '-', s: 3 },
      { v: getTypeLabel(tx.type), s: 3 },
      { v: catName, s: 3 },
      { v: accName, s: 3 },
      { v: toAccName, s: 3 },
      { v: inVal, s: 4 },
      { v: outVal, s: 4 },
      { v: amt, s: 4 },
      { v: getReimburseLabel(tx.metadata?.reimburse_status), s: 3 },
      { v: reimburseFrom, s: 3 },
      { v: getItemsSummary(tx), s: 3 },
      { v: tx.note || '', s: 3 },
      { v: tx.id || '', s: 3 }
    ]);
  });

  // Baris Grand Total
  rows.push([
    { v: '', s: 5 },
    { v: 'TOTAL REKAPITULASI', s: 5 },
    { v: periodLabel, s: 5 },
    { v: getWorkspaceLabel(activeWorkspace), s: 5 },
    { v: '', s: 5 },
    { v: '', s: 5 },
    { v: '', s: 5 },
    { v: '', s: 5 },
    { v: '', s: 5 },
    { v: '', s: 5 },
    { v: 'TOTAL:', s: 5 },
    { v: totalIn, s: 6 },
    { v: totalOut, s: 6 },
    { v: totalIn - totalOut, s: 6 },
    { v: '', s: 5 },
    { v: '', s: 5 },
    { v: '', s: 5 },
    { v: `Selisih Bersih: Rp ${(totalIn - totalOut).toLocaleString('id-ID')}`, s: 5 },
    { v: '', s: 5 }
  ]);

  return rows;
}

/**
 * Export Daftar Transaksi ke File Excel (.xlsx)
 */
export function exportTransactionsToXLSX({
  transactions = [],
  accountsMap = {},
  categoriesMap = {},
  activeWorkspace = 'personal',
  periodLabel = 'Semua Periode'
}) {
  const txRows = buildTransactionSheetRows({
    transactions,
    accountsMap,
    categoriesMap,
    activeWorkspace,
    periodLabel
  });

  const xlsxBytes = buildXlsxBinary([
    {
      name: 'Rincian Transaksi',
      rows: txRows
    }
  ]);

  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = `Transaksi_${activeWorkspace.toUpperCase()}_${dateStamp}.xlsx`;
  downloadBlobFile(xlsxBytes, filename);
  return filename;
}

/**
 * Export Laporan Pertanggungjawaban Lengkap Multi-Sheet ke File Excel (.xlsx)
 * Terdiri dari 4 Sheet:
 * 1. Ringkasan & Unit Kopdes
 * 2. Rekap Kategori
 * 3. Daftar Reimburse
 * 4. Rincian Transaksi (Sekaligus kompatibel untuk Import ulang)
 */
export function exportFullReportToXLSX({
  activeWorkspace = 'kopdes',
  periodLabel = 'Semua Periode',
  summary = {},
  unitRecap = [],
  categoryRecap = { income: [], expense: [] },
  reimburseList = [],
  transactions = [],
  accountsMap = {},
  categoriesMap = {}
}) {
  const wsName = getWorkspaceLabel(activeWorkspace).toUpperCase();
  const printedAt = formatDateShort(new Date().toISOString());

  // SHEET 1: Ringkasan Arus Kas & Unit Usaha Kopdes
  const sheet1Rows = [
    [{ v: `LAPORAN PERTANGGUNGJAWABAN ARUS KAS — ${wsName}`, s: 1 }],
    [{ v: `Periode: ${periodLabel} | Dicetak: ${printedAt}`, s: 0 }],
    [],
    [
      { v: 'I. RINGKASAN EKSEKUTIF ARUS KAS', s: 2 },
      { v: 'NOMINAL (Rp)', s: 2 },
      { v: 'KETERANGAN', s: 2 }
    ],
    [
      { v: 'Total Pemasukan', s: 3 },
      { v: summary.totalIncome || 0, s: 4 },
      { v: `${summary.incomeCount || 0} transaksi pemasukan`, s: 3 }
    ],
    [
      { v: 'Total Pengeluaran', s: 3 },
      { v: summary.totalExpense || 0, s: 4 },
      { v: `${summary.expenseCount || 0} transaksi pengeluaran`, s: 3 }
    ],
    [
      { v: 'Surplus / Defisit Bersih', s: 5 },
      { v: (summary.totalIncome || 0) - (summary.totalExpense || 0), s: 6 },
      { v: 'Pemasukan dikurangi Pengeluaran', s: 5 }
    ],
    [
      { v: 'Dana Talangan Belum Diganti (Pending Reimburse)', s: 3 },
      { v: summary.pendingReimburseTotal || 0, s: 4 },
      { v: `${summary.pendingReimburseCount || 0} transaksi menunggu penggantian`, s: 3 }
    ],
    [
      { v: 'Dana Talangan Sudah Diganti (Settled Reimburse)', s: 3 },
      { v: summary.settledReimburseTotal || 0, s: 4 },
      { v: `${summary.settledReimburseCount || 0} transaksi selesai diganti`, s: 3 }
    ],
    []
  ];

  if (unitRecap.length > 0) {
    sheet1Rows.push([
      { v: 'II. REKAPITULASI PER UNIT USAHA KOPDES', s: 2 },
      { v: 'JML TRANSAKSI', s: 2 },
      { v: 'PEMASUKAN (Rp)', s: 2 },
      { v: 'PENGELUARAN (Rp)', s: 2 },
      { v: 'SURPLUS / DEFISIT (Rp)', s: 2 }
    ]);

    let totUnitCount = 0;
    let totUnitIn = 0;
    let totUnitOut = 0;

    for (const u of unitRecap) {
      totUnitCount += u.count || 0;
      totUnitIn += u.income || 0;
      totUnitOut += u.expense || 0;
      sheet1Rows.push([
        { v: u.unit, s: 3 },
        { v: u.count || 0, s: 4 },
        { v: u.income || 0, s: 4 },
        { v: u.expense || 0, s: 4 },
        { v: u.net || 0, s: 4 }
      ]);
    }

    sheet1Rows.push([
      { v: 'TOTAL SELURUH UNIT', s: 5 },
      { v: totUnitCount, s: 6 },
      { v: totUnitIn, s: 6 },
      { v: totUnitOut, s: 6 },
      { v: totUnitIn - totUnitOut, s: 6 }
    ]);
  }

  // SHEET 2: Rekap Per Kategori
  const sheet2Rows = [
    [{ v: `REKAPITULASI PER KATEGORI — ${wsName}`, s: 1 }],
    [{ v: `Periode: ${periodLabel}`, s: 0 }],
    [],
    [
      { v: 'KATEGORI', s: 2 },
      { v: 'TIPE ARUS KAS', s: 2 },
      { v: 'JML TRANSAKSI', s: 2 },
      { v: 'TOTAL NOMINAL (Rp)', s: 2 },
      { v: 'PORSI (%)', s: 2 }
    ]
  ];

  for (const c of categoryRecap.income || []) {
    sheet2Rows.push([
      { v: c.name, s: 3 },
      { v: 'Pemasukan', s: 3 },
      { v: c.count, s: 4 },
      { v: c.total, s: 4 },
      { v: `${c.percentage.toFixed(1)}%`, s: 3 }
    ]);
  }
  for (const c of categoryRecap.expense || []) {
    sheet2Rows.push([
      { v: c.name, s: 3 },
      { v: 'Pengeluaran', s: 3 },
      { v: c.count, s: 4 },
      { v: c.total, s: 4 },
      { v: `${c.percentage.toFixed(1)}%`, s: 3 }
    ]);
  }

  // SHEET 3: Daftar Dana Talangan / Reimburse
  const sheet3Rows = [
    [{ v: `DAFTAR DANA TALANGAN & REIMBURSE — ${wsName}`, s: 1 }],
    [{ v: `Periode: ${periodLabel}`, s: 0 }],
    [],
    [
      { v: 'No', s: 2 },
      { v: 'Tanggal', s: 2 },
      { v: 'Buku Kas', s: 2 },
      { v: 'Unit Usaha / No. Bukti', s: 2 },
      { v: 'Kategori', s: 2 },
      { v: 'Catatan', s: 2 },
      { v: 'Ditalangi Oleh Dompet', s: 2 },
      { v: 'Nominal (Rp)', s: 2 },
      { v: 'Status Reimburse', s: 2 }
    ]
  ];

  reimburseList.forEach((tx, idx) => {
    const catName = categoriesMap[tx.category_id]?.name || 'Tanpa Kategori';
    const fromAcc = tx.metadata?.reimburse_from_account_id
      ? accountsMap[tx.metadata.reimburse_from_account_id]?.name || 'Dompet Pribadi'
      : 'Dompet Pribadi';
    const unitAndBukti =
      [tx.metadata?.unit_usaha, tx.metadata?.no_bukti].filter(Boolean).join(' / ') || '-';

    sheet3Rows.push([
      { v: idx + 1, s: 3 },
      { v: formatDateShort(tx.date), s: 3 },
      { v: getWorkspaceLabel(tx.workspace_id), s: 3 },
      { v: unitAndBukti, s: 3 },
      { v: catName, s: 3 },
      { v: tx.note || '-', s: 3 },
      { v: fromAcc, s: 3 },
      { v: Math.round(Number(tx.amount) || 0), s: 4 },
      { v: getReimburseLabel(tx.metadata?.reimburse_status), s: 3 }
    ]);
  });

  // SHEET 4: Rincian Transaksi
  const sheet4Rows = buildTransactionSheetRows({
    transactions,
    accountsMap,
    categoriesMap,
    activeWorkspace,
    periodLabel
  });

  const xlsxBytes = buildXlsxBinary([
    { name: 'Ringkasan & Unit Kopdes', rows: sheet1Rows },
    { name: 'Rekap Kategori', rows: sheet2Rows },
    { name: 'Daftar Reimburse', rows: sheet3Rows },
    { name: 'Rincian Transaksi', rows: sheet4Rows }
  ]);

  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = `Laporan_${activeWorkspace.toUpperCase()}_${dateStamp}.xlsx`;
  downloadBlobFile(xlsxBytes, filename);
  return filename;
}

export const DEFAULT_TEMPLATE_CATEGORIES = [
  // Buku Pribadi - Kategori Pengeluaran
  { workspace_id: 'personal', type: 'expense', name: 'Pengeluaran Pribadi' },
  { workspace_id: 'personal', type: 'expense', name: 'Kesehatan & Pendidikan' },
  { workspace_id: 'personal', type: 'expense', name: 'Makan & Minuman' },
  { workspace_id: 'personal', type: 'expense', name: 'Transportasi & BBM' },
  { workspace_id: 'personal', type: 'expense', name: 'Tagihan & Komunikasi' },
  // Buku Pribadi - Kategori Pemasukan
  { workspace_id: 'personal', type: 'income', name: 'Pemasukan Lainnya' },
  { workspace_id: 'personal', type: 'income', name: 'Investasi / Bagi Hasil' },
  { workspace_id: 'personal', type: 'income', name: 'Gaji & Pendapatan' },

  // Buku Usaha - Kategori Pengeluaran
  { workspace_id: 'business', type: 'expense', name: 'HPP / Pembelian Bahan' },
  { workspace_id: 'business', type: 'expense', name: 'Operasional & Listrik Usaha' },
  { workspace_id: 'business', type: 'expense', name: 'Upah Karyawan / Tenaga' },
  { workspace_id: 'business', type: 'expense', name: 'Pemasaran & Distribusi' },
  // Buku Usaha - Kategori Pemasukan
  { workspace_id: 'business', type: 'income', name: 'Omzet Penjualan' },
  { workspace_id: 'business', type: 'income', name: 'Suntikan Modal' },
  { workspace_id: 'business', type: 'income', name: 'Pelunasan Piutang Pelanggan' },

  // Kopdes - Kategori Pengeluaran
  { workspace_id: 'kopdes', type: 'expense', name: 'Belanja Barang Unit' },
  { workspace_id: 'kopdes', type: 'expense', name: 'Biaya Operasional Kantor (ATK/Listrik/Konsumsi)' },
  { workspace_id: 'kopdes', type: 'expense', name: 'Honor/Gaji Pengurus & Staf' },
  { workspace_id: 'kopdes', type: 'expense', name: 'Pencairan Pinjaman' },
  { workspace_id: 'kopdes', type: 'expense', name: 'Perjalanan Dinas/Rapat' },
  { workspace_id: 'kopdes', type: 'expense', name: 'Lain-lain' },
  // Kopdes - Kategori Pemasukan
  { workspace_id: 'kopdes', type: 'income', name: 'Setoran Unit Usaha' },
  { workspace_id: 'kopdes', type: 'income', name: 'Simpanan Pokok/Wajib/Sukarela' },
  { workspace_id: 'kopdes', type: 'income', name: 'Angsuran Masuk' },
  { workspace_id: 'kopdes', type: 'income', name: 'Dana Hibah/Penyertaan' },
  { workspace_id: 'kopdes', type: 'income', name: 'Lain-lain' }
];

export const DEFAULT_TEMPLATE_ACCOUNTS = [
  { workspace_id: 'personal', type: 'cash', name: 'Dompet Tunai' },
  { workspace_id: 'personal', type: 'bank', name: 'Bank Pribadi' },
  { workspace_id: 'personal', type: 'ewallet', name: 'E-Wallet' },
  { workspace_id: 'business', type: 'cash', name: 'Kas Tunai Usaha' },
  { workspace_id: 'business', type: 'bank', name: 'Rekening Usaha' },
  { workspace_id: 'kopdes', type: 'cash', name: 'Kas Kecil Kopdes' },
  { workspace_id: 'kopdes', type: 'bank', name: 'BRI Kopdes' }
];

export const DEFAULT_KOPDES_UNITS = [
  'Unit Simpan Pinjam (USP)',
  'Unit Toko/Ritel',
  'Unit Pertanian/Pupuk',
  'Jasa/Lainnya',
  'Umum/Sekretariat'
];

/**
 * Buat biner file Template Import Transaksi (.xlsx)
 * Terdiri dari 3 Sheet:
 * 1. Template Import Transaksi (Dilengkapi contoh baris siap pakai untuk Kopdes, Usaha, & Pribadi)
 * 2. Daftar Kategori & Dompet (Referensi lengkap Kategori Pengeluaran, Kategori Pemasukan, Dompet, & Unit Kopdes)
 * 3. Panduan & Referensi Kolom
 */
export function buildImportTemplateBytes({ categories = [], accounts = [] } = {}) {
  const activeCategories =
    Array.isArray(categories) && categories.length > 0 ? categories : DEFAULT_TEMPLATE_CATEGORIES;
  const activeAccounts =
    Array.isArray(accounts) && accounts.length > 0 ? accounts : DEFAULT_TEMPLATE_ACCOUNTS;

  const templateHeaders = [
    'Tanggal',
    'Buku Kas',
    'Tipe Transaksi',
    'Kategori',
    'Dompet / Rekening',
    'Nominal (Rp)',
    'Catatan',
    'Unit Usaha Kopdes',
    'No. Bukti',
    'PIC / Pihak',
    'Status Reimburse',
    'Ditalangi Oleh',
    'Rekening Tujuan',
    'Rincian Produk'
  ].map((h) => ({ v: h, s: 2 }));

  const sheet1Rows = [
    [{ v: 'TEMPLATE IMPORT DATA TRANSAKSI — BUKU KAS MULTI-WORKSPACE', s: 1 }],
    [
      {
        v: 'Petunjuk: Isi data mulai baris ke-5 di bawah header. Lihat daftar lengkap Kategori & Dompet pada Sheet "Daftar Kategori & Dompet".',
        s: 0
      }
    ],
    [],
    templateHeaders,
    // Contoh 1: Pemasukan Kopdes
    [
      { v: '2026-11-03 09:00', s: 3 },
      { v: 'Kopdes', s: 3 },
      { v: 'Pemasukan', s: 3 },
      { v: 'Setoran Unit Usaha', s: 3 },
      { v: 'BRI Kopdes', s: 3 },
      { v: 2500000, s: 4 },
      { v: 'Setoran hasil penjualan harian toko desa', s: 3 },
      { v: 'Unit Toko/Ritel', s: 3 },
      { v: 'BKM-2026/101', s: 3 },
      { v: 'Siti Aminah (Kasir Toko)', s: 3 },
      { v: '-', s: 3 },
      { v: '-', s: 3 },
      { v: '-', s: 3 },
      { v: '', s: 3 }
    ],
    // Contoh 2: Pengeluaran Kopdes dengan Dana Talangan Pribadi (Reimburse Pending) & Rincian Produk
    [
      { v: '2026-11-03 11:15', s: 3 },
      { v: 'Kopdes', s: 3 },
      { v: 'Pengeluaran', s: 3 },
      { v: 'Biaya Operasional Kantor (ATK/Listrik/Konsumsi)', s: 3 },
      { v: 'Kas Kecil Kopdes', s: 3 },
      { v: 185000, s: 4 },
      { v: 'Beli kertas HVS, tinta printer & konsumsi rapat pengurus', s: 3 },
      { v: 'Umum/Sekretariat', s: 3 },
      { v: 'BKK-2026/042', s: 3 },
      { v: 'Toko ATK Sejahtera', s: 3 },
      { v: 'Belum Diganti (Pending)', s: 3 },
      { v: 'Dompet Tunai', s: 3 },
      { v: '-', s: 3 },
      { v: 'Kertas HVS A4 2 Rim (110000); Konsumsi Rapat (75000)', s: 3 }
    ],
    // Contoh 3: Pengeluaran Kopdes Unit Pertanian
    [
      { v: '2026-11-03 13:30', s: 3 },
      { v: 'Kopdes', s: 3 },
      { v: 'Pengeluaran', s: 3 },
      { v: 'Belanja Barang Unit', s: 3 },
      { v: 'BRI Kopdes', s: 3 },
      { v: 1750000, s: 4 },
      { v: 'Kulakan pupuk organik & bibit jagung', s: 3 },
      { v: 'Unit Pertanian/Pupuk', s: 3 },
      { v: 'BKK-2026/043', s: 3 },
      { v: 'UD Tani Makmur', s: 3 },
      { v: '-', s: 3 },
      { v: '-', s: 3 },
      { v: '-', s: 3 },
      { v: 'Pupuk Organik 20 Sak (1200000); Bibit Jagung Hibrida (550000)', s: 3 }
    ],
    // Contoh 4: Pemasukan Buku Usaha
    [
      { v: '2026-11-03 15:00', s: 3 },
      { v: 'Buku Usaha', s: 3 },
      { v: 'Pemasukan', s: 3 },
      { v: 'Omzet Penjualan', s: 3 },
      { v: 'Rekening Usaha', s: 3 },
      { v: 1200000, s: 4 },
      { v: 'Penjualan pesanan pelanggan grosir', s: 3 },
      { v: '-', s: 3 },
      { v: 'INV-2026/088', s: 3 },
      { v: 'Toko Berkah Jaya', s: 3 },
      { v: '-', s: 3 },
      { v: '-', s: 3 },
      { v: '-', s: 3 },
      { v: '', s: 3 }
    ],
    // Contoh 5: Pengeluaran Buku Pribadi
    [
      { v: '2026-11-03 18:45', s: 3 },
      { v: 'Buku Pribadi', s: 3 },
      { v: 'Pengeluaran', s: 3 },
      { v: 'Makan & Minuman', s: 3 },
      { v: 'Dompet Tunai', s: 3 },
      { v: 125000, s: 4 },
      { v: 'Belanja sayur & lauk harian keluarga', s: 3 },
      { v: '-', s: 3 },
      { v: '-', s: 3 },
      { v: '-', s: 3 },
      { v: '-', s: 3 },
      { v: '-', s: 3 },
      { v: '-', s: 3 },
      { v: 'Beras 5kg (75000); Lauk & Sayur (50000)', s: 3 }
    ]
  ];

  // Kelompokkan kategori berdasarkan workspace & tipe
  const personalExpense = activeCategories
    .filter((c) => c.workspace_id === 'personal' && c.type === 'expense')
    .map((c) => c.name);
  const personalIncome = activeCategories
    .filter((c) => c.workspace_id === 'personal' && c.type === 'income')
    .map((c) => c.name);

  const businessExpense = activeCategories
    .filter((c) => c.workspace_id === 'business' && c.type === 'expense')
    .map((c) => c.name);
  const businessIncome = activeCategories
    .filter((c) => c.workspace_id === 'business' && c.type === 'income')
    .map((c) => c.name);

  const kopdesExpense = activeCategories
    .filter((c) => c.workspace_id === 'kopdes' && c.type === 'expense')
    .map((c) => c.name);
  const kopdesIncome = activeCategories
    .filter((c) => c.workspace_id === 'kopdes' && c.type === 'income')
    .map((c) => c.name);

  const maxCatRows = Math.max(
    personalExpense.length,
    personalIncome.length,
    businessExpense.length,
    businessIncome.length,
    kopdesExpense.length,
    kopdesIncome.length,
    1
  );

  const sideBySideCatRows = [];
  for (let i = 0; i < maxCatRows; i++) {
    sideBySideCatRows.push([
      { v: personalExpense[i] || '', s: 3 },
      { v: personalIncome[i] || '', s: 3 },
      { v: businessExpense[i] || '', s: 3 },
      { v: businessIncome[i] || '', s: 3 },
      { v: kopdesExpense[i] || '', s: 3 },
      { v: kopdesIncome[i] || '', s: 3 }
    ]);
  }

  const wsOrder = ['personal', 'business', 'kopdes'];
  const sortedCategories = [...activeCategories].sort((a, b) => {
    const wDiff = wsOrder.indexOf(a.workspace_id) - wsOrder.indexOf(b.workspace_id);
    if (wDiff !== 0) return wDiff;
    if (a.type !== b.type) return a.type === 'expense' ? -1 : 1;
    return 0;
  });

  const sortedAccounts = [...activeAccounts].sort(
    (a, b) => wsOrder.indexOf(a.workspace_id) - wsOrder.indexOf(b.workspace_id)
  );

  const accountTypeLabel = (t) => {
    if (t === 'bank') return 'Rekening Bank';
    if (t === 'ewallet') return 'E-Wallet';
    return 'Kas Tunai';
  };

  const sheet2CategoryRows = [
    [{ v: 'DAFTAR KATEGORI & DOMPET ACUAN IMPORT EXCEL (.XLSX)', s: 1 }],
    [
      {
        v: 'Salin (Copy-Paste) nama Kategori atau Dompet di bawah ini ke kolom "Kategori" dan "Dompet / Rekening" pada Sheet 1.',
        s: 0
      }
    ],
    [],
    [{ v: '1. TABEL RINGKASAN KATEGORI PER BUKU KAS (SIAP COPY-PASTE)', s: 1 }],
    [
      { v: 'BUKU PRIBADI — KATEGORI PENGELUARAN', s: 2 },
      { v: 'BUKU PRIBADI — KATEGORI PEMASUKAN', s: 2 },
      { v: 'BUKU USAHA — KATEGORI PENGELUARAN', s: 2 },
      { v: 'BUKU USAHA — KATEGORI PEMASUKAN', s: 2 },
      { v: 'KOPDES — KATEGORI PENGELUARAN', s: 2 },
      { v: 'KOPDES — KATEGORI PEMASUKAN', s: 2 }
    ],
    ...sideBySideCatRows,
    [],
    [{ v: '2. DAFTAR LENGKAP KATEGORI BESERTA BUKU KAS & TIPE TRANSAKSI', s: 1 }],
    [
      { v: 'NO', s: 2 },
      { v: 'BUKU KAS', s: 2 },
      { v: 'TIPE KATEGORI', s: 2 },
      { v: 'NAMA KATEGORI (ISI DI KOLOM KATEGORI)', s: 2 }
    ],
    ...sortedCategories.map((c, idx) => [
      { v: idx + 1, s: 4 },
      { v: getWorkspaceLabel(c.workspace_id), s: 3 },
      { v: c.type === 'income' ? 'KATEGORI PEMASUKAN' : 'KATEGORI PENGELUARAN', s: 3 },
      { v: c.name, s: 3 }
    ]),
    [],
    [{ v: '3. DAFTAR DOMPET / REKENING DEFAULT PER BUKU KAS', s: 1 }],
    [
      { v: 'NO', s: 2 },
      { v: 'BUKU KAS', s: 2 },
      { v: 'JENIS DOMPET', s: 2 },
      { v: 'NAMA DOMPET / REKENING (ISI DI KOLOM DOMPET)', s: 2 }
    ],
    ...sortedAccounts.map((a, idx) => [
      { v: idx + 1, s: 4 },
      { v: getWorkspaceLabel(a.workspace_id), s: 3 },
      { v: accountTypeLabel(a.type), s: 3 },
      { v: a.name, s: 3 }
    ]),
    [],
    [{ v: '4. DAFTAR UNIT USAHA KOPDES (KHUSUS BUKU KAS KOPDES)', s: 1 }],
    [
      { v: 'NO', s: 2 },
      { v: 'NAMA UNIT USAHA KOPDES (ISI DI KOLOM UNIT USAHA KOPDES)', s: 2 }
    ],
    ...DEFAULT_KOPDES_UNITS.map((u, idx) => [
      { v: idx + 1, s: 4 },
      { v: u, s: 3 }
    ])
  ];

  const sheet3GuideRows = [
    [{ v: 'PANDUAN PENGISIAN KOLOM TEMPLATE IMPORT EXCEL (.XLSX)', s: 1 }],
    [{ v: 'Gunakan panduan ini sebagai acuan pengisian kolom pada Sheet "Template Import Transaksi".', s: 0 }],
    [],
    [
      { v: 'NAMA KOLOM', s: 2 },
      { v: 'WAJIB / OPSIONAL', s: 2 },
      { v: 'FORMAT & PILIHAN NILAI YANG DIIZINKAN', s: 2 },
      { v: 'CONTOH PENGISIAN', s: 2 }
    ],
    [
      { v: 'Tanggal', s: 3 },
      { v: 'Wajib', s: 3 },
      { v: 'YYYY-MM-DD HH:mm atau DD/MM/YYYY', s: 3 },
      { v: '2026-11-03 09:00 atau 03/11/2026', s: 3 }
    ],
    [
      { v: 'Buku Kas', s: 3 },
      { v: 'Wajib', s: 3 },
      { v: 'Buku Pribadi | Buku Usaha | Kopdes', s: 3 },
      { v: 'Buku Pribadi', s: 3 }
    ],
    [
      { v: 'Tipe Transaksi', s: 3 },
      { v: 'Wajib', s: 3 },
      { v: 'Pemasukan | Pengeluaran | Transfer | Utang | Piutang', s: 3 },
      { v: 'Pengeluaran', s: 3 }
    ],
    [
      { v: 'Kategori', s: 3 },
      { v: 'Wajib (Selain Transfer)', s: 3 },
      { v: 'Pilih dari Sheet "Daftar Kategori & Dompet" (atau ketik baru untuk dibuat otomatis)', s: 3 },
      { v: 'Makan & Minuman / Pengeluaran Pribadi / Gaji & Pendapatan', s: 3 }
    ],
    [
      { v: 'Dompet / Rekening', s: 3 },
      { v: 'Wajib', s: 3 },
      { v: 'Pilih dari Sheet "Daftar Kategori & Dompet" (atau ketik baru untuk dibuat otomatis)', s: 3 },
      { v: 'Dompet Tunai / Bank Pribadi / BRI Kopdes', s: 3 }
    ],
    [
      { v: 'Nominal (Rp)', s: 3 },
      { v: 'Wajib', s: 3 },
      { v: 'Angka bulat positif dalam Rupiah (tanpa huruf)', s: 3 },
      { v: 1500000, s: 4 }
    ],
    [
      { v: 'Catatan', s: 3 },
      { v: 'Opsional', s: 3 },
      { v: 'Teks deskripsi singkat transaksi', s: 3 },
      { v: 'Belanja sayur & lauk harian keluarga', s: 3 }
    ],
    [
      { v: 'Unit Usaha Kopdes', s: 3 },
      { v: 'Opsional (Khusus Kopdes)', s: 3 },
      {
        v: 'Unit Simpan Pinjam (USP) | Unit Toko/Ritel | Unit Pertanian/Pupuk | Jasa/Lainnya | Umum/Sekretariat',
        s: 3
      },
      { v: 'Unit Toko/Ritel', s: 3 }
    ],
    [
      { v: 'No. Bukti', s: 3 },
      { v: 'Opsional', s: 3 },
      { v: 'Nomor Kwitansi / BKM / BKK / Invoice', s: 3 },
      { v: 'BKM-2026/101', s: 3 }
    ],
    [
      { v: 'PIC / Pihak', s: 3 },
      { v: 'Opsional', s: 3 },
      { v: 'Nama staf, anggota, pelanggan, atau vendor', s: 3 },
      { v: 'UD Tani Makmur', s: 3 }
    ],
    [
      { v: 'Status Reimburse', s: 3 },
      { v: 'Opsional', s: 3 },
      { v: 'Kosongkan / "-" jika kas normal, "Pending" jika ditalangi pribadi, "Selesai" jika sudah diganti', s: 3 },
      { v: 'Belum Diganti (Pending)', s: 3 }
    ],
    [
      { v: 'Ditalangi Oleh', s: 3 },
      { v: 'Opsional (Jika Reimburse)', s: 3 },
      { v: 'Nama dompet di Buku Pribadi yang menalangi pengeluaran Kopdes/Usaha', s: 3 },
      { v: 'Dompet Tunai / Bank Pribadi', s: 3 }
    ],
    [
      { v: 'Rekening Tujuan', s: 3 },
      { v: 'Opsional (Khusus Transfer)', s: 3 },
      { v: 'Nama dompet tujuan saat Tipe Transaksi = Transfer', s: 3 },
      { v: 'BRI Kopdes', s: 3 }
    ],
    [
      { v: 'Rincian Produk', s: 3 },
      { v: 'Opsional', s: 3 },
      { v: 'Format: Nama Produk 1 (Harga); Nama Produk 2 (Harga)', s: 3 },
      { v: 'Beras 5kg (75000); Lauk & Sayur (50000)', s: 3 }
    ]
  ];

  return buildXlsxBinary([
    { name: 'Template Import Transaksi', rows: sheet1Rows },
    { name: 'Daftar Kategori & Dompet', rows: sheet2CategoryRows },
    { name: 'Panduan & Referensi Kolom', rows: sheet3GuideRows }
  ]);
}

/**
 * Unduh file Template_Import_Buku_Kas.xlsx langsung di browser
 */
export function downloadImportTemplateXLSX(options = {}) {
  const bytes = buildImportTemplateBytes(options);
  const filename = 'Template_Import_Buku_Kas.xlsx';
  downloadBlobFile(bytes, filename);
  return filename;
}

/**
 * Normalisasi tanggal dari sel Excel (mendukung ISO string, DD/MM/YYYY, atau Excel Serial Date)
 */
function normalizeExcelDate(val) {
  if (!val && val !== 0) return new Date().toISOString();

  // Jika Excel Serial Date Number (misal 46328 -> tahun 2026)
  if (typeof val === 'number' && val > 25000 && val < 80000) {
    const utcDays = Math.floor(val - 25569);
    const utcValue = utcDays * 86400;
    const fractionalDay = val - Math.floor(val) + 0.0000001;
    let totalSeconds = Math.floor(86400 * fractionalDay);
    const seconds = totalSeconds % 60;
    totalSeconds -= seconds;
    const hours = Math.floor(totalSeconds / (60 * 60));
    const minutes = Math.floor(totalSeconds / 60) % 60;
    const d = new Date(utcValue * 1000);
    d.setUTCHours(hours, minutes, seconds, 0);
    return d.toISOString();
  }

  const str = String(val).trim();
  // Format YYYY-MM-DD HH:mm atau YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const isoCandidate = str.includes('T') ? str : str.replace(' ', 'T');
    const d = new Date(isoCandidate);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // Format DD/MM/YYYY atau DD-MM-YYYY
  const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (dmy) {
    const day = parseInt(dmy[1], 10);
    const month = parseInt(dmy[2], 10) - 1;
    let year = parseInt(dmy[3], 10);
    if (year < 100) year += 2000;
    const hr = dmy[4] ? parseInt(dmy[4], 10) : 12;
    const min = dmy[5] ? parseInt(dmy[5], 10) : 0;
    const d = new Date(year, month, day, hr, min);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  const fallback = new Date(str);
  if (!isNaN(fallback.getTime())) return fallback.toISOString();
  return new Date().toISOString();
}

function parseCleanNumber(val) {
  if (typeof val === 'number') return Math.round(Math.abs(val));
  if (!val) return 0;
  const cleaned = String(val)
    .replace(/rp/gi, '')
    .replace(/\s+/g, '')
    .replace(/\.(?=\d{3}(?:[^\d]|$))/g, '')
    .replace(/,/g, '.');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? Math.round(Math.abs(num)) : 0;
}

/**
 * Parse file .xlsx dan ekstrak daftar transaksi yang siap di-import ke Dexie.js
 */
export async function parseTransactionsFromXlsxBuffer(arrayBuffer, defaultWorkspace = 'personal') {
  const sheets = await readXlsxWorkbook(arrayBuffer);
  if (!sheets || sheets.length === 0) {
    throw new Error('Tidak ditemukan worksheet di dalam file .xlsx.');
  }

  // Cari sheet "Rincian Transaksi" atau gunakan sheet yang memiliki header tabel transaksi
  let targetSheet =
    sheets.find((s) => s.name.toLowerCase().includes('rincian') || s.name.toLowerCase().includes('transaksi')) ||
    sheets[sheets.length - 1];

  let headerRowIdx = -1;
  let colMap = {};

  for (const sheet of [targetSheet, ...sheets]) {
    for (let r = 0; r < Math.min(15, sheet.rows.length); r++) {
      const row = sheet.rows[r].map((c) => String(c || '').toLowerCase().trim());
      const hasDate = row.some((c) => c.includes('tanggal') || c === 'date');
      const hasAmountOrCat = row.some(
        (c) =>
          c.includes('nominal') ||
          c.includes('pemasukan') ||
          c.includes('pengeluaran') ||
          c.includes('kategori') ||
          c.includes('jumlah')
      );

      if (hasDate && hasAmountOrCat) {
        targetSheet = sheet;
        headerRowIdx = r;
        row.forEach((colName, idx) => {
          if (colName === 'tanggal iso' || (colName.includes('tanggal') && colMap.dateIso === undefined)) {
            if (colName.includes('iso')) colMap.dateIso = idx;
            else if (colMap.date === undefined) colMap.date = idx;
          }
          if (colName.includes('buku kas') || colName.includes('workspace')) colMap.workspace = idx;
          if (colName.includes('bukti') || colName.includes('nota')) colMap.noBukti = idx;
          if (colName.includes('unit usaha') || colName === 'unit') colMap.unitUsaha = idx;
          if (colName.includes('pic') || colName.includes('pihak')) colMap.picPihak = idx;
          if (colName.includes('tipe') || colName === 'jenis') colMap.type = idx;
          if (colName.includes('kategori')) colMap.category = idx;
          if (colName.includes('dompet') || colName.includes('rekening') || colName === 'akun') {
            if (colName.includes('tujuan')) colMap.toAccount = idx;
            else if (colName.includes('ditalangi')) colMap.reimburseFrom = idx;
            else if (colMap.account === undefined) colMap.account = idx;
          }
          if (colName.includes('tujuan')) colMap.toAccount = idx;
          if (colName.includes('pemasukan')) colMap.income = idx;
          if (colName.includes('pengeluaran')) colMap.expense = idx;
          if (colName.includes('nominal') || colName.includes('jumlah') || colName === 'amount') {
            colMap.amount = idx;
          }
          if (colName.includes('status reimburse')) colMap.reimburseStatus = idx;
          if (colName.includes('ditalangi')) colMap.reimburseFrom = idx;
          if (colName.includes('rincian produk') || colName.includes('item')) colMap.items = idx;
          if (colName.includes('catatan') || colName.includes('deskripsi') || colName.includes('keterangan')) {
            colMap.note = idx;
          }
          if (colName === 'id transaksi' || colName === 'id') colMap.id = idx;
        });
        break;
      }
    }
    if (headerRowIdx !== -1) break;
  }

  if (headerRowIdx === -1) {
    throw new Error(
      'Header tabel transaksi tidak ditemukan di file .xlsx. Pastikan terdapat kolom Tanggal dan Nominal/Kategori.'
    );
  }

  const parsedRows = [];
  for (let r = headerRowIdx + 1; r < targetSheet.rows.length; r++) {
    const row = targetSheet.rows[r];
    if (!row || row.length === 0) continue;

    // Lewati baris TOTAL REKAPITULASI di bagian bawah tabel
    const joinedText = row.slice(0, 5).map((x) => String(x || '').toUpperCase()).join(' ');
    if (joinedText.includes('TOTAL REKAPITULASI') || joinedText.includes('TOTAL SELURUH')) {
      continue;
    }

    const inAmount = colMap.income !== undefined ? parseCleanNumber(row[colMap.income]) : 0;
    const outAmount = colMap.expense !== undefined ? parseCleanNumber(row[colMap.expense]) : 0;
    const rawAmount = colMap.amount !== undefined ? parseCleanNumber(row[colMap.amount]) : 0;
    const finalAmount = rawAmount || inAmount || outAmount;

    if (finalAmount <= 0) continue;

    const rawDate =
      (colMap.dateIso !== undefined && row[colMap.dateIso]) ||
      (colMap.date !== undefined && row[colMap.date]) ||
      '';
    const dateIso = normalizeExcelDate(rawDate);

    const wsId =
      colMap.workspace !== undefined
        ? parseWorkspaceLabel(row[colMap.workspace], defaultWorkspace)
        : defaultWorkspace;

    const txType = parseTypeLabel(
      colMap.type !== undefined ? row[colMap.type] : '',
      inAmount,
      outAmount
    );

    const categoryName =
      colMap.category !== undefined ? String(row[colMap.category] || '').trim() : '';
    const accountName =
      colMap.account !== undefined ? String(row[colMap.account] || '').trim() : '';
    const toAccountName =
      colMap.toAccount !== undefined ? String(row[colMap.toAccount] || '').trim() : '';
    const noBukti =
      colMap.noBukti !== undefined ? String(row[colMap.noBukti] || '').trim() : '';
    const unitUsaha =
      colMap.unitUsaha !== undefined ? String(row[colMap.unitUsaha] || '').trim() : '';
    const picPihak =
      colMap.picPihak !== undefined ? String(row[colMap.picPihak] || '').trim() : '';
    const reimburseStatus =
      colMap.reimburseStatus !== undefined ? parseReimburseLabel(row[colMap.reimburseStatus]) : 'none';
    const reimburseFromName =
      colMap.reimburseFrom !== undefined ? String(row[colMap.reimburseFrom] || '').trim() : '';
    const itemsStr =
      colMap.items !== undefined ? String(row[colMap.items] || '').trim() : '';
    const note =
      colMap.note !== undefined ? String(row[colMap.note] || '').trim() : '';
    const txId =
      colMap.id !== undefined ? String(row[colMap.id] || '').trim() : '';

    parsedRows.push({
      id: txId.length >= 10 ? txId : null,
      workspace_id: wsId,
      type: txType,
      amount: finalAmount,
      date: dateIso,
      categoryName: categoryName === '-' ? '' : categoryName,
      accountName: accountName === '-' ? '' : accountName,
      toAccountName: toAccountName === '-' ? '' : toAccountName,
      note: note === '-' ? '' : note,
      items: parseItemsSummary(itemsStr),
      metadata: {
        no_bukti: noBukti === '-' ? '' : noBukti,
        unit_usaha: unitUsaha === '-' ? '' : unitUsaha,
        pic_pihak: picPihak === '-' ? '' : picPihak,
        reimburse_status: reimburseStatus,
        reimburseFromName: reimburseFromName === '-' ? '' : reimburseFromName
      }
    });
  }

  if (parsedRows.length === 0) {
    throw new Error('Tidak ditemukan baris transaksi dengan nominal > 0 pada file .xlsx.');
  }

  return {
    sheetName: targetSheet.name,
    rows: parsedRows
  };
}

