import { KOPDES_UNITS } from '../db.js';

const INDONESIAN_MONTHS = {
  jan: 1, januari: 1,
  feb: 2, februari: 2, pebruari: 2,
  mar: 3, maret: 3,
  apr: 4, april: 4,
  mei: 5, may: 5,
  jun: 6, juni: 6,
  jul: 7, juli: 7,
  agu: 8, agustus: 8, aug: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oktober: 10, oct: 10,
  nov: 11, nop: 11, november: 11, nopember: 11,
  des: 12, desember: 12, dec: 12
};

/**
 * Ekstraksi angka Rupiah dari potongan teks baris struk.
 * Menangani format:
 * - "Rp 125.500" -> 125500
 * - "125,500" -> 125500
 * - "125.500,00" -> 125500
 * - "125.500,-" -> 125500
 * - "45000" -> 45000
 */
export function parseReceiptCurrencyValue(rawStr) {
  if (!rawStr || typeof rawStr !== 'string') return 0;

  let s = rawStr
    .trim()
    .replace(/[,.-]+$/, '')
    .replace(/[.,]00$/, '');

  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) {
    return parseInt(s.replace(/[.,]/g, ''), 10);
  }

  if (/^\d{3,9}$/.test(s)) {
    return parseInt(s, 10);
  }

  return 0;
}

/**
 * Cari seluruh kandidat angka nominal pada satu baris teks struk
 */
function extractAmountsFromLine(line) {
  const cleanedLine = line
    // Hapus kode nomor nota/invoice yang mengandung garis miring atau tanda hubung (misal CS/24/261101/0105, IDM-20261102-089, (0-3))
    .replace(/\b[A-Za-z0-9]*[\/\-][A-Za-z0-9\/\-]+\b/g, ' ')
    // Hapus nomor telepon / reservasi (misal 087763253489 atau +628...)
    .replace(/\b(?:\+?62|08)\d{7,13}\b/g, ' ')
    // Hapus pola tanggal & jam
    .replace(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, ' ')
    .replace(/\b\d{4}[/-]\d{1,2}[/-]\d{1,2}\b/g, ' ')
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ');

  const matches = cleanedLine.match(/(?:rp\.?\s*)?(\d{1,3}(?:[.,]\d{3})+(?:[.,]00|,-)?|\d{4,9})/gi) || [];
  const values = [];

  for (const m of matches) {
    const numPart = m.replace(/^rp\.?\s*/i, '').trim();
    const val = parseReceiptCurrencyValue(numPart);

    // Harga di struk Indonesia selalu kelipatan Rp 50 atau Rp 100 (mencegah kode tanggal/nota seperti 261101 atau 88412 dianggap harga)
    if (val % 50 !== 0) {
      continue;
    }

    if (val >= 500 && val < 1000000000) {
      values.push(val);
    }
  }
  return values;
}

/**
 * Deteksi Nominal Total dari teks struk
 */
export function extractReceiptTotal(lines) {
  if (!lines || lines.length === 0) return 0;

  const ignorePattern = /\b(kembali|kembalian|change|hemat|diskon|disc|potongan|poin|point|telp|npwp|member|kasir|item|qty)\b/i;
  const strongTotalPattern = /\b(grand\s*total|total\s*bayar|total\s*belanja|total\s*pembayaran|total\s*tagihan|total\s*harga|jumlah\s*bayar|harga\s*jual|nominal\s*bayar|total)\b/i;
  const subTotalPattern = /\b(sub\s*total|subtotal|jumlah)\b/i;
  const paymentPattern = /\b(tunai|cash|debit|qris|gopay|ovo|dana|transfer|bayar)\b/i;

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (ignorePattern.test(line) || subTotalPattern.test(line)) continue;

    if (strongTotalPattern.test(line)) {
      const amounts = extractAmountsFromLine(line);
      if (amounts.length > 0) {
        return Math.max(...amounts);
      }
      if (i + 1 < lines.length) {
        const nextAmounts = extractAmountsFromLine(lines[i + 1]);
        if (nextAmounts.length > 0) {
          return Math.max(...nextAmounts);
        }
      }
    }
  }

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (ignorePattern.test(line)) continue;
    if (subTotalPattern.test(line)) {
      const amounts = extractAmountsFromLine(line);
      if (amounts.length > 0) {
        return Math.max(...amounts);
      }
    }
  }

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (ignorePattern.test(line)) continue;
    if (paymentPattern.test(line)) {
      const amounts = extractAmountsFromLine(line);
      if (amounts.length > 0) {
        return Math.max(...amounts);
      }
    }
  }

  let maxCandidate = 0;
  for (const line of lines) {
    if (ignorePattern.test(line)) continue;
    const amounts = extractAmountsFromLine(line);
    for (const a of amounts) {
      if (a > maxCandidate) maxCandidate = a;
    }
  }

  return maxCandidate;
}

/**
 * Ekstraksi Daftar Produk / Item Belanja dari baris-baris struk.
 * Mengembalikan array [{ id, name, amount }] jika struk memiliki rincian produk,
 * atau [] jika struk hanya berisi 1 nilai total (kwitansi tunggal).
 */
export function extractReceiptItems(lines, merchant = '') {
  if (!lines || lines.length === 0) return [];

  // Kata kunci metadata/header struk (tidak boleh masuk ke daftar produk)
  const metadataLinePattern =
    /\b(no\s*nota|no\.?\s*nota|nota\s*[:#]|no\.?\s*struk|no\.?\s*transaksi|no\.?\s*trx|no\.?\s*bukti|no\.?\s*bon|no\.?\s*inv|no\.?\s*kwitansi|no\.?\s*ref|no\.?\s*order|waktu|tanggal|tgl|jam|kasir|cashier|jenis\s*order|tipe\s*order|nama\s*order|free\s*table|pelanggan|customer|member|meja|table|reservasi|dicetak|dibayar|npwp|telp|tlp|hp|wa|fax|jl\.|jln\.|jalan|pasar|kec\.|kab\.|kota|shift|untuk|kepada|suplier|supplier|dairy\.co)\b/i;

  const stopFooterPattern =
    /\b(grand\s*total|total\s*bayar|total\s*belanja|total\s*pembayaran|total\s*tagihan|total\s*harga|jumlah\s*bayar|harga\s*jual|sub\s*total|subtotal|total)\b/i;

  const nonItemLinePattern =
    /\b(tunai|cash|kartu|debit|kredit|qris|bca|bri|mandiri|bni|bsi|statis|gopay|ovo|dana|transfer|bayar|kembali|kembalian|change|ppn|pajak|tax|diskon|disc|hemat|potongan|status|pembayaran|terima\s*kasih|thank\s*you|lunas|nominal|nota|struk|kwitansi|faktur|invoice)\b/i;

  const items = [];
  let pendingItemName = '';

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;

    // Berhenti memindai item ketika sudah mencapai baris SUBTOTAL / TOTAL
    if (stopFooterPattern.test(rawLine)) {
      break;
    }

    // Lewati garis pemisah (---, ===)
    if (/^[\-=*_#.\s]+$/.test(rawLine)) {
      pendingItemName = '';
      continue;
    }

    // Lewati baris Nama Toko utama di bagian atas (2 baris pertama yang hanya berisi nama toko/cabang)
    if (i <= 1 && !/\d/.test(rawLine)) {
      continue;
    }
    if (merchant && i <= 2 && rawLine.toLowerCase() === merchant.toLowerCase()) {
      continue;
    }

    // Lewati baris metadata/header (No Nota, Waktu, Kasir, Jenis Order, dll) atau baris "Key : Value"
    if (metadataLinePattern.test(rawLine) || nonItemLinePattern.test(rawLine) || /\s*:\s*/.test(rawLine)) {
      pendingItemName = '';
      continue;
    }

    // Lewati baris yang memiliki pola tanggal (01/11/2026 atau 01 Nov 26) atau jam (19:57)
    if (
      /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/.test(rawLine) ||
      /\b\d{1,2}\s+(?:jan|feb|mar|apr|mei|jun|jul|agu|sep|okt|nov|des)[a-z]*\s+\d{2,4}\b/i.test(rawLine) ||
      /\b([01]?\d|2[0-3]):[0-5]\d\b/.test(rawLine)
    ) {
      pendingItemName = '';
      continue;
    }

    // Kasus A: Baris berisi angka nominal saja (ketika OCR memisahkan kolom nama produk di baris atas dan harga di baris bawah)
    const standalonePriceMatch = rawLine.match(
      /^(?:rp\.?\s*)?(\d{1,3}(?:[.,]\d{3})+(?:[.,]00|,-)?|\d{4,8})$/i
    );
    if (standalonePriceMatch && pendingItemName) {
      const itemAmount = parseReceiptCurrencyValue(standalonePriceMatch[1]);
      if (itemAmount >= 500 && itemAmount % 50 === 0) {
        items.push({
          id: `item-${items.length + 1}`,
          name: pendingItemName,
          amount: itemAmount
        });
        pendingItemName = '';
        continue;
      }
    }

    // Kasus B: Baris produk lengkap (Nama Produk di kiri + Harga di ujung kanan baris)
    const endPriceMatch = rawLine.match(
      /^(.+?)\s+(?:rp\.?\s*)?(\d{1,3}(?:[.,]\d{3})+(?:[.,]00|,-)?|\d{4,8})\s*$/i
    );

    if (endPriceMatch) {
      const leftText = endPriceMatch[1].trim();
      const rawPriceStr = endPriceMatch[2].trim();
      const itemAmount = parseReceiptCurrencyValue(rawPriceStr);

      // Harga produk wajib >= 500, kelipatan Rp 50, dan bagian nama produk bukan kode nomor nota ('/')
      if (itemAmount >= 500 && itemAmount % 50 === 0 && !/[\/]/.test(leftText)) {
        // Cek apakah bagian kiri adalah "2 x 15.000" (format 2 baris minimarket)
        const isQtyMultiplierLine = /^\d+\s*[xX@*]\s*[\d.,]+$/.test(leftText);
        if (isQtyMultiplierLine && pendingItemName) {
          const qtyMatch = leftText.match(/^(\d+)\s*[xX@*]/);
          const qtyPrefix = qtyMatch ? `${qtyMatch[1]}x ` : '';
          items.push({
            id: `item-${items.length + 1}`,
            name: `${qtyPrefix}${pendingItemName}`,
            amount: itemAmount
          });
          pendingItemName = '';
          continue;
        }

        const cleanedName = leftText
          .replace(/\s{2,}/g, ' ')
          .replace(/[:\-.,]+$/, '')
          .trim();

        if (cleanedName && /[a-zA-Z]{2,}/.test(cleanedName)) {
          items.push({
            id: `item-${items.length + 1}`,
            name: cleanedName,
            amount: itemAmount
          });
        }
        pendingItemName = '';
        continue;
      }
    }

    // Jika baris diawali tanda '+' tanpa harga di kanan (misal "+ 1 Level 1" pada struk resto/kafe),
    // gabungkan sebagai keterangan tambahan ke produk terakhir di atasnya
    if (/^\+\s*\S+/.test(rawLine) && items.length > 0) {
      items[items.length - 1].name += ` (${rawLine.replace(/\s{2,}/g, ' ')})`;
      continue;
    }

    // Baris teks produk tanpa harga (simpan sementara jika harga ada di baris bawahnya)
    if (/[a-zA-Z]{3,}/.test(rawLine) && !/[\/:]/.test(rawLine) && i > 1) {
      pendingItemName = rawLine;
    }
  }

  return items;
}

/**
 * Bangun teks Catatan (Note) otomatis dari nama toko & daftar item terpilih
 */
export function buildReceiptNote(merchant, selectedItems = []) {
  if (selectedItems && selectedItems.length > 0) {
    const itemNames = selectedItems.map((it) => it.name).join(', ');
    return merchant ? `${merchant} — ${itemNames}` : itemNames;
  }
  return merchant ? `Nota ${merchant}` : 'Transaksi dari foto struk';
}

/**
 * Deteksi Tanggal & Jam dari teks struk, kembalikan ISO Date String
 */
export function extractReceiptDate(rawText) {
  if (!rawText) return new Date().toISOString();

  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  let day = now.getDate();
  let hours = now.getHours();
  let minutes = now.getMinutes();
  let foundDate = false;

  const timeMatch = rawText.match(/\b([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\b/);
  if (timeMatch) {
    hours = parseInt(timeMatch[1], 10);
    minutes = parseInt(timeMatch[2], 10);
  }

  const dmyMatch = rawText.match(/\b(0?[1-9]|[12]\d|3[01])[\/\-.](0?[1-9]|1[0-2])[\/\-.](20\d{2}|\d{2})\b/);
  if (dmyMatch) {
    day = parseInt(dmyMatch[1], 10);
    month = parseInt(dmyMatch[2], 10);
    let y = parseInt(dmyMatch[3], 10);
    year = y < 100 ? 2000 + y : y;
    foundDate = true;
  }

  if (!foundDate) {
    const ymdMatch = rawText.match(/\b(20\d{2})[\/\-.](0?[1-9]|1[0-2])[\/\-.](0?[1-9]|[12]\d|3[01])\b/);
    if (ymdMatch) {
      year = parseInt(ymdMatch[1], 10);
      month = parseInt(ymdMatch[2], 10);
      day = parseInt(ymdMatch[3], 10);
      foundDate = true;
    }
  }

  if (!foundDate) {
    const namedMonthRegex = /\b(0?[1-9]|[12]\d|3[01])[\s\-]+([A-Za-z]{3,9})[\s\-,]+(20\d{2}|\d{2})\b/i;
    const nmMatch = rawText.match(namedMonthRegex);
    if (nmMatch) {
      const mKey = nmMatch[2].toLowerCase();
      if (INDONESIAN_MONTHS[mKey]) {
        day = parseInt(nmMatch[1], 10);
        month = INDONESIAN_MONTHS[mKey];
        let y = parseInt(nmMatch[3], 10);
        year = y < 100 ? 2000 + y : y;
        foundDate = true;
      }
    }
  }

  const parsedDate = new Date(year, month - 1, day, hours, minutes);
  return isNaN(parsedDate.getTime()) ? now.toISOString() : parsedDate.toISOString();
}

/**
 * Deteksi Nama Toko / Vendor dari baris-baris awal struk
 */
export function extractReceiptMerchant(lines) {
  if (!lines || lines.length === 0) return '';

  const skipHeaderPattern =
    /^(struk|nota|kwitansi|bukti|faktur|invoice|receipt|copy|selamat\s+datang|terima\s+kasih|thank\s+you|npwp|telp|tlp|hp|wa|fax|jl\.|jln\.|jalan|kec\.|kab\.|kota|tanggal|tgl|kasir|no\.|shift|---|\*\*\*|===)/i;

  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    const clean = lines[i]
      .replace(/^[*=\-#\s]+|[*=\-#\s]+$/g, '')
      .trim();

    if (clean.length < 3) continue;
    if (skipHeaderPattern.test(clean)) continue;
    if (!/[a-zA-Z]{2,}/.test(clean)) continue;
    if (/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/.test(clean)) continue;

    return clean;
  }

  return lines[0]?.trim() || '';
}

/**
 * Deteksi Nomor Bukti / Nomor Nota dari teks struk
 */
export function extractReceiptNumber(rawText) {
  if (!rawText) return '';
  const match = rawText.match(
    /\b(?:no\.?\s*(?:nota|struk|transaksi|trx|bukti|bon|inv|kwitansi|ref)|inv|bkk|bkm)\s*[:#.\-]?\s*([A-Z0-9\/.\-]{3,24})/i
  );
  if (match && match[1]) {
    return match[1].trim();
  }
  return '';
}

/**
 * Parse teks hasil OCR struk menjadi objek siap pakai untuk TransactionForm
 */
export function parseReceiptText(
  rawText,
  { activeWorkspace = 'personal', allAccounts = [], allCategories = [] } = {}
) {
  const cleanRaw = (rawText || '').trim();
  const lines = cleanRaw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const amount = extractReceiptTotal(lines);
  const date = extractReceiptDate(cleanRaw);
  const merchant = extractReceiptMerchant(lines);
  const no_bukti = extractReceiptNumber(cleanRaw);
  const items = extractReceiptItems(lines, merchant);

  const lower = cleanRaw.toLowerCase();

  let workspace_id = activeWorkspace;
  if (/\b(kopdes|koperasi|unit simpan pinjam|unit toko|unit pertanian|bkk|bkm)\b/.test(lower)) {
    workspace_id = 'kopdes';
  }

  const type = /\b(bukti kas masuk|bkm|setoran|terima dari)\b/i.test(cleanRaw)
    ? 'income'
    : 'expense';

  const wsAccounts = allAccounts.filter((a) => a.workspace_id === workspace_id);
  let account_id = wsAccounts[0]?.id || '';
  if (/\b(qris|gopay|ovo|dana|shopeepay|ewallet)\b/.test(lower)) {
    const ew = wsAccounts.find((a) => a.type === 'ewallet');
    if (ew) account_id = ew.id;
  } else if (/\b(debit|transfer|bri|bca|mandiri|bni)\b/.test(lower)) {
    const bk = wsAccounts.find((a) => a.type === 'bank');
    if (bk) account_id = bk.id;
  }

  const catType = type === 'income' ? 'income' : 'expense';
  const wsCategories = allCategories.filter(
    (c) => c.workspace_id === workspace_id && c.type === catType
  );
  let category_id = wsCategories[0]?.id || '';

  if (/\b(pertamina|spbu|pertalite|pertamax|solar|bbm|bensin|parkir|tol)\b/.test(lower)) {
    const c = wsCategories.find((cat) => /transport|bbm|perjalanan/i.test(cat.name));
    if (c) category_id = c.id;
  } else if (/\b(atk|fotokopi|kertas|tinta|pln|token|listrik|wifi|pdam)\b/.test(lower)) {
    const c = wsCategories.find((cat) => /tagihan|operasional|atk|listrik/i.test(cat.name));
    if (c) category_id = c.id;
  } else if (/\b(pupuk|bibit|urea|npk|pestisida|kulakan|grosir|hpp)\b/.test(lower)) {
    const c = wsCategories.find((cat) => /belanja barang|hpp|bahan/i.test(cat.name));
    if (c) category_id = c.id;
  } else if (/\b(apotek|klinik|obat|rs|rumah sakit)\b/.test(lower)) {
    const c = wsCategories.find((cat) => /kesehatan/i.test(cat.name));
    if (c) category_id = c.id;
  } else if (/\b(indomaret|alfamart|superindo|warung|rm\.|resto|makan|minum|sembako|beras|minyak|gula|kopi)\b/.test(lower)) {
    const c = wsCategories.find((cat) => /makan|kebutuhan|konsumsi|belanja/i.test(cat.name));
    if (c) category_id = c.id;
  }

  let unit_usaha = workspace_id === 'kopdes' ? KOPDES_UNITS[0] : '';
  if (workspace_id === 'kopdes') {
    if (/\b(pupuk|urea|npk|bibit|tani|pertanian)\b/.test(lower)) {
      unit_usaha = KOPDES_UNITS[2];
    } else if (/\b(atk|listrik|kantor|rapat|konsumsi|sekretariat)\b/.test(lower)) {
      unit_usaha = KOPDES_UNITS[4];
    } else if (/\b(toko|sembako|ritel|grosir)\b/.test(lower)) {
      unit_usaha = KOPDES_UNITS[1];
    }
  }

  const note = buildReceiptNote(merchant, items);

  return {
    workspace_id,
    type,
    amount,
    date,
    account_id,
    category_id,
    note,
    merchant,
    items,
    metadata: {
      no_bukti,
      unit_usaha,
      pic_pihak: merchant || '',
      items,
      reimburse_status: 'none',
      reimburse_from_account_id: null
    }
  };
}

/**
 * Ekstraksi Teks (OCR) dari Canvas / Blob Gambar Struk
 */
export async function extractTextFromReceiptImage(canvasOrBlob, onProgress = () => {}) {
  if (!canvasOrBlob) return { text: '', engine: 'none' };

  if (canvasOrBlob.__simulatedReceiptText) {
    onProgress('Membaca teks struk...');
    return {
      text: canvasOrBlob.__simulatedReceiptText,
      engine: 'Built-in Receipt Scanner'
    };
  }

  if (typeof window !== 'undefined' && 'TextDetector' in window) {
    try {
      onProgress('Mengekstrak teks via Browser TextDetector API...');
      // @ts-ignore
      const detector = new window.TextDetector();
      const bitmap =
        canvasOrBlob instanceof HTMLCanvasElement
          ? canvasOrBlob
          : await createImageBitmap(canvasOrBlob);
      const detectedBlocks = await detector.detect(bitmap);
      if (detectedBlocks && detectedBlocks.length > 0) {
        // Urutkan berdasar Y, lalu kelompokkan blok yang sejajar secara horizontal (kolom kiri & kanan struk)
        const sortedByY = [...detectedBlocks].sort(
          (a, b) => (a.boundingBox?.y || 0) - (b.boundingBox?.y || 0)
        );
        const rows = [];
        for (const block of sortedByY) {
          const by = block.boundingBox?.y || 0;
          const bh = block.boundingBox?.height || 18;
          const lastRow = rows[rows.length - 1];
          if (lastRow && Math.abs(by - lastRow.y) <= Math.max(10, bh * 0.55)) {
            lastRow.blocks.push(block);
          } else {
            rows.push({ y: by, blocks: [block] });
          }
        }
        const text = rows
          .map((r) => {
            r.blocks.sort((a, b) => (a.boundingBox?.x || 0) - (b.boundingBox?.x || 0));
            return r.blocks.map((b) => b.rawValue).join('   ');
          })
          .join('\n');
        if (text.trim()) {
          return { text: text.trim(), engine: 'Browser TextDetector (Offline)' };
        }
      }
    } catch {
      // Lanjut ke fallback berikutnya
    }
  }

  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      onProgress('Memuat modul OCR (Tesseract WASM)...');
      const tesseractPromise = (async () => {
        const mod = await import(
          /* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js'
        );
        const createWorker = mod.createWorker || mod.default?.createWorker;
        if (!createWorker) return null;
        const worker = await createWorker('ind+eng');
        onProgress('Memindai baris angka & teks struk...');
        const ret = await worker.recognize(canvasOrBlob);
        await worker.terminate();
        return ret?.data?.text || '';
      })();

      const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 9000));
      const ocrText = await Promise.race([tesseractPromise, timeoutPromise]);
      if (ocrText && ocrText.trim()) {
        return { text: ocrText.trim(), engine: 'Tesseract WASM OCR' };
      }
    } catch {
      // Abaikan jika offline atau diblokir CSP
    }
  }

  return {
    text: '',
    engine: 'Manual / Template'
  };
}

/**
 * Daftar contoh struk nyata untuk simulasi 1-klik (baik yang punya List Produk maupun yang 1 Total Saja)
 */
export const SAMPLE_RECEIPTS = [
  {
    id: 'indomaret',
    label: 'Struk Minimarket (3 Produk)',
    lines: [
      'INDOMARET CAB. RAYA DESA',
      'JL. MERDEKA NO. 45',
      '--------------------------------',
      'Tgl: 02/11/2026  Jam: 13:15',
      'No. Struk: IDM-20261102-089',
      '--------------------------------',
      'BERAS PREMIUM 5KG       72.500',
      'MINYAK GORENG 2L        36.000',
      'KOPI BUBUK 200G         16.500',
      '--------------------------------',
      'TOTAL BELANJA       Rp 125.000',
      'TUNAI               Rp 150.000',
      'KEMBALI              Rp 25.000',
      '--------------------------------',
      'TERIMA KASIH'
    ]
  },
  {
    id: 'kopdes_pupuk',
    label: 'Nota Pupuk Kopdes (2 Produk)',
    lines: [
      'TOKO TANI MAKMUR JAYA',
      'SUPLIER PUPUK & PERTANIAN',
      '--------------------------------',
      'Tanggal: 02-11-2026 09:40',
      'No. Bukti: BKK-2026/11/014',
      'Untuk: KOPDES UNIT PERTANIAN',
      '--------------------------------',
      '10 Sak Pupuk NPK      1.450.000',
      '5 Botol Pestisida       300.000',
      '--------------------------------',
      'GRAND TOTAL        Rp 1.750.000',
      'STATUS: LUNAS (TUNAI)',
      '--------------------------------'
    ]
  },
  {
    id: 'usaha_bahan',
    label: 'Nota Bahan Usaha (2 Produk)',
    lines: [
      'GROSIR KEMASAN & BAHAN BAKU',
      'PASAR BESAR BLOK B-12',
      '--------------------------------',
      'Tgl: 02/11/2026 11:20',
      'No. Nota: INV-88412',
      '--------------------------------',
      'Kemasan Standing Pouch  210.000',
      'Bahan Baku Produksi     440.000',
      '--------------------------------',
      'TOTAL BAYAR          Rp 650.000',
      'PEMBAYARAN: QRIS',
      '--------------------------------'
    ]
  },
  {
    id: 'kwitansi_tunggal',
    label: 'Kwitansi 1 Total (Tanpa List)',
    lines: [
      'PLN PERSERO / LOKET PPOB DESA',
      'BUKTI PEMBAYARAN TAGIHAN LISTRIK',
      '--------------------------------',
      'Tanggal: 02/11/2026 15:10',
      'No. Bukti: BKK-PLN-202611',
      'Untuk: KANTOR SEKRETARIAT KOPDES',
      '--------------------------------',
      'TOTAL TAGIHAN        Rp 385.000',
      'STATUS: LUNAS',
      '--------------------------------'
    ]
  }
];

/**
 * Buat File gambar struk realistis dari template teks menggunakan <canvas>
 */
export async function generateSampleReceiptFile(sample) {
  const canvas = document.createElement('canvas');
  const width = 480;
  const lineHeight = 26;
  const padding = 32;
  const height = padding * 2 + sample.lines.length * lineHeight + 20;

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#FAFAFA';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 2;
  ctx.strokeRect(8, 8, width - 16, height - 16);

  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 15px monospace';

  sample.lines.forEach((line, idx) => {
    if (idx === 0) {
      ctx.font = 'bold 17px monospace';
    } else if (/TOTAL/i.test(line)) {
      ctx.font = 'bold 16px monospace';
    } else {
      ctx.font = '14px monospace';
    }
    ctx.fillText(line, padding, padding + (idx + 1) * lineHeight);
  });

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  const file = new File([blob], `struk-${sample.id}.png`, { type: 'image/png' });
  file.__simulatedReceiptText = sample.lines.join('\n');
  return file;
}
