import { KOPDES_UNITS } from '../db.js';
import { matchBestCategory } from './categoryMatcher.js';
import {
  buildFuzzyIndex,
  findBestFuzzyMatch,
  buildAliasIndex,
  findMatchWithAliases,
  DEFAULT_FUZZY_THRESHOLD
} from '../utils/fuzzyMatcher.js';

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
 * Normalisasi artefak OCR umum pada angka struk dot-matrix / thermal:
 * - Spasi di sekitar pemisah ribuan: "48, 400" -> "48,400", "16. 000" -> "16.000"
 * - Huruf O/o yang terbaca di tengah/akhir digit angka: "16.00O" -> "16.000", "9,2OO" -> "9,200"
 * - Huruf l/I di awal angka ribuan: "l6.000" -> "16.000"
 */
export function normalizeOcrLineNumbers(line) {
  if (!line || typeof line !== 'string') return '';
  return line
    .replace(/\b[lI|](\d{1,2}[.,]\d{3})\b/g, '1$1')
    .replace(/(\d)[Oo](\d)/g, '$10$2')
    .replace(/(\d)[Oo]([Oo]?)\b/g, (_, d, o2) => `${d}0${o2 ? '0' : ''}`)
    .replace(/(\b\d{1,3})\s*([.,])\s*(\d{3}\b)/g, '$1$2$3');
}

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

  let s = normalizeOcrLineNumbers(rawStr)
    .trim()
    .replace(/^[(\-+\s]+|[)\s]+$/g, '')
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
  const normLine = normalizeOcrLineNumbers(line);
  const cleanedLine = normLine
    // Hapus NPWP (misal 001.337.994.6-092.000 atau 0312582299612000)
    .replace(/\b\d{2,3}[.\-]?\d{3}[.\-]?\d{3}[.\-]?\d[.\-]?\d{3}[.\-]?\d{3}\b/g, ' ')
    // Hapus kode nomor nota/invoice yang mengandung garis miring atau tanda hubung (misal 03.11.26-20:48/4.5.3/TCM7-36335/ADITY/02)
    .replace(/\b[A-Za-z0-9_.]*[\/\-][A-Za-z0-9_.\/\-]+\b/g, ' ')
    // Hapus nomor telepon / call center / nomor pesanan panjang (>= 10 digit tanpa pemisah ribuan)
    .replace(/\b(?:\+?62|08)\d[\d.\-\s]{6,15}\b/g, ' ')
    .replace(/\b\d{10,24}\b/g, ' ')
    .replace(/\b1500\d{3}\b/g, ' ')
    // Hapus kode pos 5 digit setelah nama kota/kabupaten (misal GRESIK, 61153)
    .replace(/,\s*\b\d{5}\b/g, ' ')
    // Hapus pola tanggal & jam
    .replace(/\b\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\b/g, ' ')
    .replace(/\b\d{4}[\/.\-]\d{1,2}[\/.\-]\d{1,2}\b/g, ' ')
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ');

  const matches = cleanedLine.match(/(?:rp\.?\s*)?(\d{1,3}(?:[.,]\d{3})+(?:[.,]00|,-)?|\d{4,9})/gi) || [];
  const values = [];

  for (const m of matches) {
    const numPart = m.replace(/^rp\.?\s*/i, '').trim();
    const val = parseReceiptCurrencyValue(numPart);

    // Harga di struk Indonesia selalu kelipatan Rp 50 atau Rp 100 (mencegah kode tanggal/nota/DPP/PPN ganjil seperti 51,081 atau 8,288 dianggap harga)
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
export function extractReceiptTotal(lines, items = []) {
  if (!lines || lines.length === 0) return 0;

  // Abaikan baris kembalian, diskon/hemat/voucher, pajak DPP/PPN/Harga Jual pajak, serta baris jumlah item/pesanan
  const ignorePattern =
    /\b(kembali|kembalian|change|uang\s*kecil|hemat|diskon|disc|potongan|voucher|poin|point|telp|sms|wa|npwp|member|kasir|operator|total\s*(?:item|qty|barang|pesanan|produk|diskon|hemat)|dpp|ppn|harga\s*jual)\b/i;

  // Prioritas 1: Kata kunci Grand Total / Total Belanja / Total Harga / Pembayaran Sebenarnya / Purchase
  const explicitTotalPattern =
    /\b(grand\s*total|total\s*belanja|total\s*bayar|total\s*pembayaran|total\s*tagihan|total\s*harga|pembayaran\s*sebenarnya|nominal\s*pendapatan|jumlah\s*bayar|nominal\s*bayar|purchase)\b/i;

  // Prioritas 2: Kata kunci Total / Subtotal umum (bukan header tabel)
  const genericTotalPattern = /\b(total|sub\s*total|subtotal)\b/i;
  const tableHeaderPattern = /\b(nama\s*produk|nama\s*barang|deskripsi)\b|\b(harga)\b.*\b(jumlah|qty|subtotal)\b/i;

  const nonCashPaymentPattern = /\b(non\s*tunai|qris|debit|kredit|gopay|ovo|dana|shopeepay|transfer)\b/i;
  const cashTenderedPattern = /\b(tunai|cash|bayar\s*jumlah|jumlah\s*uang|bayar)\b/i;
  const changeLinePattern = /\b(kembali|kembalian|change|uang\s*kecil)\b/i;

  // 1. Cari dari bawah ke atas untuk Explicit Total (TOTAL BELANJA, Total Harga, Pembayaran Sebenarnya, PURCHASE)
  let explicitTotal = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (ignorePattern.test(line) || tableHeaderPattern.test(line)) continue;

    if (explicitTotalPattern.test(line)) {
      const amounts = extractAmountsFromLine(line);
      if (amounts.length > 0) {
        explicitTotal = amounts[amounts.length - 1];
        break;
      }
      // Jika angka berada di baris tepat di bawahnya (karena pemisahan blok OCR)
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        if (!ignorePattern.test(nextLine) && !cashTenderedPattern.test(nextLine)) {
          const nextAmounts = extractAmountsFromLine(nextLine);
          if (nextAmounts.length > 0) {
            explicitTotal = nextAmounts[nextAmounts.length - 1];
            break;
          }
        }
      }
    }
  }

  // 2. Cari Generic Total / Subtotal (dari bawah ke atas)
  let genericTotal = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (ignorePattern.test(line) || tableHeaderPattern.test(line)) continue;
    if (genericTotalPattern.test(line)) {
      const amounts = extractAmountsFromLine(line);
      if (amounts.length > 0) {
        genericTotal = amounts[amounts.length - 1];
        break;
      }
    }
  }

  // 3. Cek pembayaran Non-Tunai / Purchase (biasanya pas sesuai tagihan, misal "NON TUNAI : 9,200" atau "PURCHASE:9,200")
  let nonCashAmount = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (ignorePattern.test(line)) continue;
    if (nonCashPaymentPattern.test(line)) {
      const amounts = extractAmountsFromLine(line);
      if (amounts.length > 0) {
        nonCashAmount = amounts[amounts.length - 1];
        break;
      }
    }
  }

  // 4. Jika ada baris Tunai/Bayar DAN Kembalian, hitung selisihnya (Bayar - Kembali = Total Belanja)
  let tenderedAmount = 0;
  let changeAmount = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!changeAmount && changeLinePattern.test(line)) {
      const amounts = extractAmountsFromLine(line);
      if (amounts.length > 0) changeAmount = amounts[amounts.length - 1];
    } else if (!tenderedAmount && !ignorePattern.test(line) && cashTenderedPattern.test(line)) {
      const amounts = extractAmountsFromLine(line);
      if (amounts.length > 0) tenderedAmount = amounts[amounts.length - 1];
    }
  }
  let cashDiff = 0;
  if (tenderedAmount > 0 && changeAmount > 0 && tenderedAmount > changeAmount) {
    cashDiff = tenderedAmount - changeAmount;
  }

  const itemsSum = items && items.length > 0
    ? items.reduce((acc, it) => acc + (Number(it.amount) || 0), 0)
    : 0;

  // 5. Rekonsiliasi & Koreksi Artefak Titik Dua (Colon Artifact) pada Total:
  // Pada printer thermal dot-matrix, tanda titik dua ": 9,200" sering terbaca OCR sebagai "19,200" (titik dua menyatu menjadi angka 1)
  const candidateTotal = explicitTotal || genericTotal;
  if (candidateTotal > 0) {
    // Koreksi jika angka berawalan '1' dan berakhiran persis dengan itemsSum atau nonCashAmount
    if (itemsSum > 0 && candidateTotal > itemsSum && String(candidateTotal) === '1' + String(itemsSum)) {
      return itemsSum;
    }
    if (nonCashAmount > 0 && candidateTotal > nonCashAmount && String(candidateTotal) === '1' + String(nonCashAmount)) {
      return nonCashAmount;
    }
    // Jika ada items yang valid dan nonCash sama persis dengan itemsSum, gunakan itemsSum
    if (itemsSum > 0 && nonCashAmount === itemsSum && candidateTotal !== itemsSum) {
      return itemsSum;
    }
    return candidateTotal;
  }

  if (nonCashAmount > 0) return nonCashAmount;
  if (cashDiff > 0) return cashDiff;
  if (itemsSum > 0) return itemsSum;
  if (tenderedAmount > 0) return tenderedAmount;

  // 7. Fallback terakhir: angka terbesar yang bukan baris terlarang
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
 * Normalisasi tipografi generik nama produk (independen dari merek dagang apa pun):
 * - Huruf S terbaca di depan angka volume/berat: "S00ML" -> "500ML", "S00GR" -> "500GR"
 * - Typo akhiran kuantitas: "2pcg" / "2pca" / "2pcq" -> "2pcs"
 * - Spasi ganda dirapatkan
 * Koreksi leksikal nama barang ditangani fuzzyMatcher berbasis riwayat transaction_items.
 */
export function normalizeItemNameTypography(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .replace(/\b[sS](\d{2,3}(?:ml|gr|g)\b)/gi, '5$1')
    .replace(/\b(\d+)\s*pc[gaq]\b/gi, '$1pcs')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Pecah nama item hasil parser menjadi { prefix qty "2x ", nama inti, sufiks "(varian)" / "(-diskon)" }
 */
function splitItemName(name) {
  const s = String(name || '').trim();
  const qtyMatch = s.match(/^(\d{1,3}x\s+)/i);
  const qtyPrefix = qtyMatch ? qtyMatch[1] : '';
  const rest = s.slice(qtyPrefix.length);
  const suffixMatch = rest.match(/((?:\s*\([^()]*\))+)\s*$/);
  const suffix = suffixMatch ? suffixMatch[1] : '';
  const base = (suffix ? rest.slice(0, rest.length - suffix.length) : rest).trim();
  return { qtyPrefix, base: base || rest.trim(), suffix: base ? suffix : '' };
}

/**
 * Ambil nama inti (tanpa qty & sufiks varian/diskon) dari daftar nama item riwayat.
 * Nama default "Produk N" dibuang karena bukan nama barang nyata.
 */
export function extractItemHistoryNames(names = []) {
  const out = [];
  for (const n of names) {
    const { base } = splitItemName(n);
    if (base && !/^produk\s+\d+$/i.test(base)) out.push(base);
  }
  return out;
}

/**
 * Indeks fuzzy siap pakai dari nama item riwayat (urutkan terbaru dulu agar koreksi terakhir menang).
 */
export function buildItemHistoryIndex(names = []) {
  return buildFuzzyIndex(extractItemHistoryNames(names));
}

/**
 * Indeks alias OCR siap pakai
 */
export function buildItemAliasesIndex(aliases = []) {
  return buildAliasIndex(aliases);
}

/**
 * Cocokkan nama item OCR ke kamus alias & riwayat barang lokal.
 * Urutan prioritas:
 * 1. Alias Exact Match (100%)
 * 2. Alias Fuzzy Match (>= threshold)
 * 3. History Fuzzy Match (>= threshold)
 * Setiap item selalu memiliki `original_ocr_name` untuk memungkinkan feedback loop ke item_aliases saat diedit.
 */
export function matchItemsWithHistory(
  items = [],
  itemHistory = [],
  itemAliases = null,
  threshold = DEFAULT_FUZZY_THRESHOLD
) {
  if (!items || items.length === 0) return [];

  const historyIndex = itemHistory
    ? itemHistory.__fuzzyIndex
      ? itemHistory
      : buildFuzzyIndex(extractItemHistoryNames(itemHistory))
    : null;

  const aliasIndex = itemAliases
    ? itemAliases.exactMap && itemAliases.list
      ? itemAliases
      : buildAliasIndex(itemAliases)
    : null;

  return items.map((it) => {
    const rawName = String(it.name || '').trim();
    const { qtyPrefix, base, suffix } = splitItemName(rawName);

    // Default item jika tidak ada match
    const baseItem = {
      ...it,
      original_ocr_name: rawName,
      original_base_name: base,
      matched_from_alias: false,
      matched_from_history: false,
      match_score: 0,
      match_source: 'ocr'
    };

    if ((!historyIndex || historyIndex.length === 0) && (!aliasIndex || aliasIndex.exactMap.size === 0)) {
      return baseItem;
    }

    const result = findMatchWithAliases(base, {
      aliasIndex,
      historyIndex,
      threshold
    });

    if (!result) {
      return baseItem;
    }

    const isAlias = result.source.startsWith('alias');
    return {
      ...baseItem,
      name: `${qtyPrefix}${result.match}${suffix}`,
      original_ocr_name: rawName,
      matched_from_alias: isAlias,
      matched_from_history: !isAlias,
      match_score: Math.round(result.score * 100) / 100,
      match_source: result.source
    };
  });
}

/**
 * Validasi apakah nama kandidat produk adalah nama barang yang sah (bukan kode invoice, tanggal, atau noise OCR)
 */
export function isValidItemName(name) {
  if (!name || typeof name !== 'string') return false;
  const s = name.trim();
  if (s.length < 3) return false;

  // 1. Abaikan baris metadata/header/footer yang lolos
  if (/^(?:npwp|wp\b|jl\.?|jln\.?|jalan|faktur|nota|struk|kasir|cashier|trx|inv|no\.?)/i.test(s)) {
    return false;
  }

  // 2. Bersihkan penanda ukuran/volume (misal 500ml, 1kg, 250gr, 10pcs) sebelum validasi kata
  const withoutUnits = s.replace(/\b\d+(?:ml|gr|g|kg|l|cm|mm|pcs|pack|btl|cup)\b/gi, ' ');

  // 3. Nama barang harus memiliki setidaknya SATU kata nyata dengan >= 3 huruf murni tanpa angka
  // (misal "PENYEGAR" di "KAKI3 PENYEGAR 500ML", "BREAD" di "BREAD KASUR", "CFE" di "K/A B.CFE")
  const words = withoutUnits
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const hasValidWord = words.some((w) => /^[a-zA-Z]{3,}$/.test(w));
  if (!hasValidWord) return false;

  // 4. Jika memuat kode serial/invoice (kata yang berisi huruf bercampur >= 4 digit angka, misal H22935 atau F16D914330)
  if (/\b[a-zA-Z]+\d{4,}\b|\b\d{4,}[a-zA-Z]+\b/.test(withoutUnits)) {
    return false;
  }

  // 5. Rasio huruf alfanumerik harus wajar
  const alphaCount = (s.match(/[a-zA-Z0-9]/g) || []).length;
  if (alphaCount / s.length < 0.6) return false;

  return true;
}

/**
 * Ekstraksi Daftar Produk / Item Belanja dari baris-baris struk.
 * Mengembalikan array [{ id, name, amount }] jika struk memiliki rincian produk,
 * atau [] jika struk hanya berisi 1 nilai total (kwitansi tunggal).
 */
export function extractReceiptItems(lines, merchant = '') {
  if (!lines || lines.length === 0) return [];

  // Header kolom tabel (misal "Nama Produk  Harga  Jumlah  Subtotal" pada Momoyo) -> lewati, jangan break!
  const tableHeaderPattern =
    /\b([nk]ama\s*produk|[nk]ama\s*barang|[nk]ama\s*item|deskripsi|item\s*pembelian|item\s*penjualan|rincian\s*pembelian|daftar\s*pesanan|detail\s*order)\b|\b(harga)\b.*\b(jumlah|qty|subtota[lt]|total|luna)\b/i;

  // Kata kunci metadata/header struk (tidak boleh masuk ke daftar produk)
  const metadataLinePattern =
    /\b(no\s*nota|no\.?\s*nota|nota\s*[:#]|no\.?\s*struk|no\.?\s*transaksi|no\.?\s*trx|no\.?\s*bukti|no\.?\s*bon|no\.?\s*inv|no\.?\s*kwitansi|no\.?\s*ref|no\.?\s*order|nomor\s*pesanan|waktu|tanggal|tgl|jam|kasir|cashier|operator|saluran|toko\s*fisik|bawa\s*pulang|take\s*away|dine\s*in|jenis\s*order|tipe\s*order|nama\s*order|free\s*table|pelanggan|customer|member|meja|table|reservasi|dicetak|dibayar|npwp|telp|tlp|hp|wa|sms|fax|jl\.|jln\.|jalan|raya|daendles|kauman|raci|sidayu|sidomulyo|gresik|regency|jawa|timur|barat|tengah|jakarta|utara|selatan|gedung|menara|boulevard|pantai\s*indah|kapuk|indomarco|prismatama|alfaria|pasar|kec\.|kab\.|kota|shift|untuk|kepada|suplier|supplier|dairy\.co|layanan\s*konsumen|klikindomaret|gratis\s*ongkir)\b/i;

  // Penanda akhir bagian item produk (memasuki bagian ringkasan total di bawah)
  const stopFooterPattern =
    /\b(grand\s*total|total\s*bayar|total\s*belanja|total\s*pembayaran|total\s*tagihan|total\s*harga|total\s*pesanan|nominal\s*pendapatan|pembayaran\s*sebenarnya|jumlah\s*bayar|harga\s*jual|sub\s*total|subtotal)\b|^total\b/i;

  // Baris potongan/voucher langsung di bawah item (misal "VOUCHER : (2,900)")
  const itemDiscountPattern = /\b(voucher|diskon|disc|potongan|hemat\s*item)\b/i;

  const nonItemLinePattern =
    /\b(tunai|cash|kartu|debit|kredit|qris|bca|bri|mandiri|bni|bsi|wondr|trxid|purchase|statis|gopay|ovo|dana|transfer|bayar|kembali|kembalian|change|uang\s*kecil|ppn|dpp|pajak|tax|anda\s*hemat|status|pembayaran|terima\s*kasih|thank\s*you|lunas|nominal|nota|struk|kwitansi|faktur|invoice|pendapat\s*anda|kritik\s*dan\s*saran|kemitraan|partnership)\b/i;

  const variantModifierPattern =
    /\b(normal|less|more|extra|no\s+ice|ice|sugar|gula|level|spicy|pedas|size|regular|large|medium|small|hot|cold|hangat|dingin|topping|addon|norma)\b/i;

  const items = [];
  let pendingItemName = '';

  for (let i = 0; i < lines.length; i++) {
    const rawLine = normalizeOcrLineNumbers(lines[i]).trim();
    if (!rawLine) continue;

    // 1. Jika baris adalah header kolom tabel ("Nama Produk Harga Jumlah Subtotal"), lewati saja
    if (tableHeaderPattern.test(rawLine) && extractAmountsFromLine(rawLine).length === 0) {
      pendingItemName = '';
      continue;
    }

    // 2. Berhenti memindai item ketika sudah mencapai baris SUBTOTAL / TOTAL di bagian bawah struk
    if (stopFooterPattern.test(rawLine)) {
      break;
    }

    // 3. Tangani baris VOUCHER / DISKON per item (misal "VOUCHER : (2,900)" pada struk Indomaret)
    if (
      itemDiscountPattern.test(rawLine) &&
      !/\b(anda\s*hemat|total\s*hemat|total\s*diskon)\b/i.test(rawLine)
    ) {
      if (items.length > 0) {
        const discAmounts = extractAmountsFromLine(rawLine);
        if (discAmounts.length > 0) {
          const discVal = discAmounts[discAmounts.length - 1];
          const lastItem = items[items.length - 1];
          if (discVal > 0 && discVal < lastItem.amount) {
            lastItem.amount -= discVal;
            lastItem.name += ` (-${discVal.toLocaleString('id-ID')})`;
          }
        }
      }
      pendingItemName = '';
      continue;
    }

    // 4. Lewati garis pemisah (---, ===, ***)
    if (/^[\-=*_#.\s]+$/.test(rawLine)) {
      continue;
    }

    // 5. Lewati baris Nama Toko utama di bagian atas (2 baris pertama yang hanya berisi nama toko/cabang)
    if (i <= 1 && !/\d/.test(rawLine)) {
      continue;
    }
    if (merchant && i <= 3 && rawLine.toLowerCase() === merchant.toLowerCase()) {
      continue;
    }

    // 6. Lewati baris yang memiliki pola tanggal (03.11.26, 2026-11-03) atau jam (20:48)
    if (
      /\b\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\b/.test(rawLine) ||
      /\b20\d{2}[\/.\-]\d{1,2}[\/.\-]\d{1,2}\b/.test(rawLine) ||
      /\b\d{1,2}\s+(?:jan|feb|mar|apr|mei|jun|jul|agu|sep|okt|nov|des)[a-z]*\s+\d{2,4}\b/i.test(rawLine) ||
      /\b([01]?\d|2[0-3]):[0-5]\d\b/.test(rawLine)
    ) {
      pendingItemName = '';
      continue;
    }

    // 7. Lewati baris metadata/header (No Nota, Waktu, Kasir, Alamat, dll) atau baris "Key : Value"
    if (metadataLinePattern.test(rawLine) || nonItemLinePattern.test(rawLine) || /\s*:\s*/.test(rawLine)) {
      pendingItemName = '';
      continue;
    }

    // 8. Kasus A: Baris berisi angka harga / qty / subtotal saja di bawah nama produk
    // Menangani:
    // - "23,900" (1 angka harga)
    // - "1 23900 23,900" (format Indomaret: Qty HargaSatuan Subtotal saat terpisah baris)
    // - "16.000 1 16.000" atau "eee 16.000 116.000" (format Momoyo: HargaSatuan Qty Subtotal di bawah nama produk)
    // - "2 x 15.000 30.000" (format perkalian qty)
    // - "1 x @Rp. 14.000 f°. 14.400 4" (format perkalian qty + unit price + subtotal)
    const rowAmounts = extractAmountsFromLine(rawLine);
    const nonNumLetters = rawLine
      .replace(/(?:rp|fr|fp|ip)\.?|[fFrRiI][°oO\.]*|[°§©®™@]/gi, ' ')
      .replace(/[\d.,xX@*\-–—+:=()\/\\|#~`$'"”’“\s]/g, '')
      .trim();
    const isLettersOnlyNoise = !nonNumLetters || /^(.)\1+$/i.test(nonNumLetters) || nonNumLetters.length <= 3;
    const isExplicitQtyRow = /^\s*(\d{1,2})\s*[xX@*]/i.test(rawLine);
    const isNumericPriceRow =
      rowAmounts.length > 0 &&
      (
        /^(?:rp\.?\s*|\d|[.,xX@*\s\-])+$/i.test(rawLine) ||
        isExplicitQtyRow ||
        (pendingItemName && isLettersOnlyNoise)
      );

    if (isNumericPriceRow && pendingItemName) {
      let itemAmount = rowAmounts[rowAmounts.length - 1];
      let qty = 1;

      // Tangani format "Qty x @HargaSatuan [Subtotal]" (misal "1 x @Rp. 14.000 f°. 14.400 4")
      const qtyStartMatch = rawLine.match(/^(\d{1,2})\s*[xX@*]/);
      const atPriceMatch = rawLine.match(/@\s*(?:rp\.?\s*)?(\d{1,3}(?:[.,]\d{3})+|\d{4,9})/i);
      if (qtyStartMatch) {
        qty = parseInt(qtyStartMatch[1], 10) || 1;
        if (atPriceMatch) {
          const unitPrice = parseReceiptCurrencyValue(atPriceMatch[1]);
          if (unitPrice >= 500) {
            itemAmount = qty * unitPrice;
          }
        }
      }

      // Tangani kasus Momoyo / minimarket di mana kolom Qty dan Subtotal menyatu
      // Contoh: "16.000 [HargaSatuan]   116.000 [Qty 1 + Subtotal 16.000]"
      if (!atPriceMatch && rowAmounts.length >= 2) {
        const first = rowAmounts[0];
        const last = rowAmounts[rowAmounts.length - 1];
        if (String(last).endsWith(String(first)) && last > first) {
          const qtyStr = String(last).slice(0, String(last).length - String(first).length);
          qty = parseInt(qtyStr, 10) || 1;
          itemAmount = first;
        }
      }

      // Deteksi qty jika ditulis eksplisit terpisah (misal "1 16000 16.000" atau "2 x 15.000")
      if (qty === 1 && !qtyStartMatch) {
        const qtyMiddleMatch = rawLine.match(/^\d[\d.,]*\s+(\d{1,2})\s+\d[\d.,]*$/);
        const qtyIndoMatch = rawLine.match(/^(\d{1,2})\s+\d{3,}/);
        if (qtyMiddleMatch) {
          qty = parseInt(qtyMiddleMatch[1], 10) || 1;
        } else if (qtyIndoMatch) {
          qty = parseInt(qtyIndoMatch[1], 10) || 1;
        }
      }

      if (isValidItemName(pendingItemName)) {
        const finalName =
          qty > 1 && !/^\d+x\s/i.test(pendingItemName)
            ? `${qty}x ${pendingItemName}`
            : pendingItemName;

        items.push({
          id: `item-${items.length + 1}`,
          name: finalName,
          amount: itemAmount
        });
      }
      pendingItemName = '';
      continue;
    }

    // 9. Kasus B: Baris produk lengkap (Nama Produk di kiri + [Qty HargaSatuan] + Subtotal di ujung kanan baris)
    // Contoh: "SERASOFT SHP DT 170 1 23900 23,900" atau "BREAD KASUR CKLT 119000 19,000" atau "IR. BREAD KASUR 1 15000 io"
    let cleanedRow = rawLine;
    const trailingNoiseMatch = cleanedRow.match(/^(.*?)\s+([a-zA-Z]{1,3}|[^\w\s]{1,4})\s*$/);
    if (trailingNoiseMatch && /\d{3,}/.test(trailingNoiseMatch[1])) {
      cleanedRow = trailingNoiseMatch[1].trim();
    } else {
      const trailingDigitArtifact = cleanedRow.match(/^(.*?(?:\d{1,3}[.,]\d{3}|\d{4,8}))\s+\d{1,2}\s*$/);
      if (trailingDigitArtifact) {
        cleanedRow = trailingDigitArtifact[1].trim();
      }
    }

    const endPriceMatch = cleanedRow.match(
      /^(.+?)\s+(?:rp\.?\s*)?(\d{1,3}(?:[.,]\d{3})+(?:[.,]00|,-)?|\d{4,8})\s*$/i
    );

    if (endPriceMatch) {
      let leftText = endPriceMatch[1].trim();
      const rawPriceStr = endPriceMatch[2].trim();
      const itemAmount = parseReceiptCurrencyValue(rawPriceStr);

      const isInvoiceCodeLine = /\b\d+[\/]\d+\b|(?:\/.*\/)/.test(leftText);
      if (itemAmount >= 500 && itemAmount % 50 === 0 && !isInvoiceCodeLine) {
        // Cek apakah bagian kiri adalah "2 x 15.000" (format 2 baris minimarket)
        const isQtyMultiplierLine = /^\d+\s*[xX@*]\s*[\d.,]+$/.test(leftText);
        if (isQtyMultiplierLine && pendingItemName) {
          const qtyMatch = leftText.match(/^(\d+)\s*[xX@*]/);
          const qtyPrefix = qtyMatch && parseInt(qtyMatch[1], 10) > 1 ? `${qtyMatch[1]}x ` : '';
          items.push({
            id: `item-${items.length + 1}`,
            name: `${qtyPrefix}${pendingItemName}`,
            amount: itemAmount
          });
          pendingItemName = '';
          continue;
        }

        // Bersihkan ekor "Qty HargaSatuan" pada format 1 baris Indomaret/Alfamart
        let inlineQty = 1;
        const trailingQtyUnitMatch = leftText.match(
          /^(.+?)\s+(\d{1,3})\s*(?:[xX@*]|\s+)(?:rp\.?\s*)?(\d{1,3}(?:[.,]\d{3})+|\d{3,8})$/i
        );
        if (trailingQtyUnitMatch) {
          const candidateName = trailingQtyUnitMatch[1].trim();
          const candidateQty = parseInt(trailingQtyUnitMatch[2], 10) || 1;
          const candidateUnit = parseReceiptCurrencyValue(trailingQtyUnitMatch[3]);
          if (
            candidateName &&
            /[a-zA-Z]{2,}/.test(candidateName) &&
            candidateUnit >= 500 &&
            candidateUnit <= itemAmount
          ) {
            leftText = candidateName;
            inlineQty = candidateQty;
          }
        } else {
          // Format 1 angka di ekor leftText (misal "119000" saat itemAmount = 19000, atau barcode/unit price saja)
          const trailingSingleNumMatch = leftText.match(/^(.+?)\s+(\d{1,9})$/);
          if (trailingSingleNumMatch) {
            const candidateName = trailingSingleNumMatch[1].trim();
            const numStr = trailingSingleNumMatch[2];
            const numVal = parseInt(numStr, 10);

            if (candidateName && /[a-zA-Z]{2,}/.test(candidateName)) {
              if (numVal === itemAmount) {
                leftText = candidateName;
              } else if (numStr.endsWith(String(itemAmount)) && numStr.length > String(itemAmount).length) {
                const qtyPrefix = numStr.slice(0, numStr.length - String(itemAmount).length);
                inlineQty = parseInt(qtyPrefix, 10) || 1;
                leftText = candidateName;
              } else if (numVal <= 50) {
                inlineQty = numVal || 1;
                leftText = candidateName;
              } else if (numVal >= 500) {
                leftText = candidateName;
              }
            }
          }
        }

        const cleanedName = normalizeItemNameTypography(leftText).replace(/[:\-.,]+$/, '').trim();

        if (isValidItemName(cleanedName)) {
          const finalName =
            inlineQty > 1 && !/^\d+x\s/i.test(cleanedName)
              ? `${inlineQty}x ${cleanedName}`
              : cleanedName;

          items.push({
            id: `item-${items.length + 1}`,
            name: finalName,
            amount: itemAmount
          });
        }
        pendingItemName = '';
        continue;
      }
    }

    // 10. Jika baris diawali tanda '+' tanpa harga di kanan (misal "+ 1 Level 1"),
    // gabungkan sebagai keterangan tambahan ke produk terakhir
    if (/^\+\s*\S+/.test(rawLine) && items.length > 0) {
      items[items.length - 1].name += ` (${rawLine.replace(/\s{2,}/g, ' ')})`;
      continue;
    }

    // 11. Jika sudah ada pendingItemName dan baris ini adalah varian minuman/makanan (misal "Normal Ice/Normal Sugar"),
    // gabungkan ke pendingItemName jika teks bersih dari simbol artifact (jangan rusak nama utama jika baris berupa noise)
    if (pendingItemName && variantModifierPattern.test(rawLine) && !/\d{4,}/.test(rawLine)) {
      const cleanMod = rawLine.replace(/^[|\\/\s\-_=()]+|[|\\/\s\-_=()]+$/g, '').trim();
      if (cleanMod && !/[|\\{}[\]~=_^<>`$]/.test(cleanMod) && cleanMod.length <= 30) {
        pendingItemName = `${pendingItemName} (${cleanMod})`;
      }
      continue;
    }

    // 12. Baris teks nama produk tanpa harga (simpan sementara karena harganya ada di baris bawahnya)
    if (/[a-zA-Z]{3,}/.test(rawLine) && !/[\/:]/.test(rawLine) && i > 1) {
      // Buang ekor kolom noise yang terpisah >= 3 spasi (qty 1–2 digit / artefak 1–2 huruf), misal "7 Straub BI)   1   ul"
      const withoutColumnNoise = rawLine.replace(
        /\s{3,}(?:\d{1,2}|[a-zA-Z]{1,2}|[^\w\s]{1,3})(?:\s+(?:\d{1,2}|[a-zA-Z]{1,2}|[^\w\s]{1,3}))*\s*$/,
        ''
      );
      const candidate = normalizeItemNameTypography(withoutColumnNoise);
      if (isValidItemName(candidate)) {
        pendingItemName = candidate;
      }
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
 * Periksa apakah sebuah baris teks adalah artifact noise / logo rusak OCR
 * (misal logo Indomaret yang terbaca sebagai |--{sana.~=3 atau so” pPppT To. Ad 4)
 */
export function isNoiseOrSymbolGarbage(str) {
  if (!str || typeof str !== 'string') return true;
  const s = str.trim();
  if (s.length < 3) return true;

  // Jika mengandung tanda kutip, simbol artefak garis/kotak, atau karakter kontrol
  if (/[|\\{}[\]~=_^<>`$©®™#*+”'“"‘’]/.test(s)) {
    const alphaNumCount = (s.match(/[a-zA-Z0-9]/g) || []).length;
    if (alphaNumCount / s.length < 0.65) return true;
  }

  // Jika ada kata dengan case acak aneh (misal pPppT, sAa)
  if (/\b[a-z]+[A-Z]+[a-z]+\b/.test(s)) return true;

  // Jika berakhir dengan angka terisolasi tanpa konteks jalan (misal "... Ad    4")
  if (/\s+\d{1,2}$/.test(s) && !/^(?:jl\.?|jln\.?|jalan|gang|blok|no\.?)/i.test(s)) {
    const words = s.split(/\s+/);
    if (words.length <= 4 && !/\b(toko|pt|cv|ud|koperasi|minimarket|resto|cafe)\b/i.test(s)) {
      return true;
    }
  }

  // Baris dengan hanya kata-kata sangat pendek acak (misal "lati Ui Fl" atau "tp, :")
  const words = s.split(/\s+/).filter(Boolean);
  const longWords = words.filter((w) => w.length >= 3 && /[a-zA-Z]/.test(w));
  if (longWords.length === 0) return true;
  if (words.length >= 3 && longWords.length === 1 && words.some((w) => w.length <= 2 && /^[A-Z]/.test(w))) {
    return true;
  }

  return false;
}

/**
 * Deteksi Nama Toko / Vendor dari baris-baris awal struk
 */
export function extractReceiptMerchant(lines) {
  if (!lines || lines.length === 0) return '';

  const fullText = lines.join('\n');

  // Deteksi khusus jaringan minimarket via keyword langsung ATAU slogan khas Indomaret
  const isIndomaret =
    /(?:indomaret|indomarco|klikindomaret|kontak@indomaret|@indomaret)/i.test(fullText) ||
    (/\b(belanja\s+lebih\s+mu[od]ah|layanan\s+konsumen|gratis\s+ongkir|grais\s+on)\b/i.test(fullText) &&
      /\b(indomaret|indomarco|sidayu|gresik|alfamart)\b/i.test(fullText));

  if (isIndomaret) {
    // 1. Cek baris awal jika ada teks Indomaret eksplisit
    for (let i = 0; i < Math.min(lines.length, 3); i++) {
      if (/^indomaret\b/i.test(lines[i])) {
        return lines[i].trim();
      }
    }
    // 2. Cari nama gerai/cabang (misal "SIDAYU, KAB GRESIK" atau setelah NPWP/WP atau sebelum baris JL.)
    for (let i = 0; i < Math.min(lines.length, 12); i++) {
      const line = lines[i].trim();

      // Cek pola nama cabang sebelum ", KAB / KOTA" (misal "se SIDAYU, KAB GRESIK")
      const kabMatch = line.match(/\b([A-Za-z]{3,18})\s*,\s*(?:kab\.?|kota)\b/i);
      if (kabMatch && !/^(jawa|timur|barat|tengah|dki|daerah)$/i.test(kabMatch[1])) {
        return `Indomaret ${kabMatch[1].toUpperCase()}`;
      }

      if (/\b(?:npwp|wp)\b/i.test(line)) {
        for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
          const branchCandidate = lines[j]
            .replace(/^(?:npwp|wp)[\d.\-\s]+/i, '')
            .trim();
          if (
            branchCandidate &&
            !isNoiseOrSymbolGarbage(branchCandidate) &&
            branchCandidate.length >= 3 &&
            !/^(?:jl\.?|jln\.?|jalan|[0-9\s]*ul\.|kec\.|kab\.|kota|---|\*\*\*)/i.test(branchCandidate)
          ) {
            return `Indomaret ${branchCandidate}`;
          }
        }
      }

      // Baris nama cabang sebelum alamat jalan (contoh: "SIDAYU" tepat sebelum "JL. PAHLAWAN" atau "UL. PAKLAUAN")
      if (i + 1 < lines.length && /^(?:jl\.?|jln\.?|jalan|[0-9\s]*ul\.)\s+/i.test(lines[i + 1].trim())) {
        if (
          !isNoiseOrSymbolGarbage(line) &&
          line.length >= 3 &&
          !/\d/.test(line) &&
          !/^(?:cv|pt|ud)\b/i.test(line)
        ) {
          return `Indomaret ${line}`;
        }
      }
    }
    return 'Indomaret';
  }

  if (/\b(alfamart|sumber\s+alfaria\s+trijaya|alfagift)\b/i.test(fullText)) {
    for (let i = 0; i < Math.min(lines.length, 3); i++) {
      if (/^alfamart\b/i.test(lines[i])) {
        return lines[i].trim();
      }
    }
    return 'Alfamart';
  }

  const skipHeaderPattern =
    /^(struk|nota|kwitansi|bukti|faktur|invoice|receipt|copy|selamat\s+datang|terima\s+kasih|thank\s+you|npwp|wp\b|telp|tlp|hp|wa|fax|jl\.?|jln\.?|jalan|[0-9\s]*ul\.|kec\.|kab\.|kota|tanggal|tgl|kasir|no\.|nomor|shift|---|\*\*\*|===)/i;

  for (let i = 0; i < Math.min(lines.length, 8); i++) {
    const clean = lines[i]
      .replace(/^[*=\-#\s]+|[*=\-#\s]+$/g, '')
      .trim();

    if (clean.length < 3) continue;
    if (isNoiseOrSymbolGarbage(clean)) continue;
    if (skipHeaderPattern.test(clean)) continue;
    if (!/[a-zA-Z]{2,}/.test(clean)) continue;
    if (/\b\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\b/.test(clean)) continue;

    // Jika baris berikutnya memuat nama toko + nama cabang (misal baris 1 "MOMOYO", baris 2 "MOMOYO KAUMAN"), ambil yang lebih lengkap
    if (i + 1 < lines.length) {
      const nextClean = lines[i + 1]
        .replace(/^[*=\-#\s]+|[*=\-#\s]+$/g, '')
        .trim();
      if (
        nextClean.length > clean.length &&
        nextClean.toLowerCase().startsWith(clean.toLowerCase()) &&
        !skipHeaderPattern.test(nextClean) &&
        !isNoiseOrSymbolGarbage(nextClean)
      ) {
        return nextClean;
      }
    }

    return clean;
  }

  for (let i = 0; i < Math.min(lines.length, 4); i++) {
    const candidate = lines[i]?.trim() || '';
    if (candidate && !isNoiseOrSymbolGarbage(candidate)) {
      return candidate;
    }
  }

  return '';
}

/**
 * Deteksi Nomor Bukti / Nomor Nota dari teks struk
 */
export function extractReceiptNumber(rawText) {
  if (!rawText) return '';

  // 1. Format eksplisit "No. Nota / Nomor Pesanan / No. Struk / BKK / INV"
  const explicitMatch = rawText.match(
    /\b(?:(?:no\.?|nomor)\s*(?:nota|struk|pesanan|order|transaksi|trx|bukti|bon|inv|kwitansi|ref)|inv|bkk|bkm)\s*[:#.\-]?\s*([A-Z0-9\/.\-]{3,28})/i
  );
  if (explicitMatch && explicitMatch[1]) {
    return explicitMatch[1].trim();
  }

  // 2. Format baris kode struk Indomaret/Alfamart: "03.11.26-20:48/4.5.3/TCM7-36335/ADITY/02"
  const minimarketCodeMatch = rawText.match(
    /\b\d{2}[\/.\-]\d{2}[\/.\-]\d{2,4}[\-\s]+\d{2}:\d{2}\/[\d.]+\/([A-Z0-9]+-\d+)\b/i
  );
  if (minimarketCodeMatch && minimarketCodeMatch[1]) {
    return minimarketCodeMatch[1].trim();
  }

  return '';
}

/**
 * Parse teks hasil OCR struk menjadi objek siap pakai untuk TransactionForm
 */
export function parseReceiptText(
  rawText,
  {
    activeWorkspace = 'personal',
    allAccounts = [],
    allCategories = [],
    allTransactions = [],
    itemHistory = [],
    itemAliases = null
  } = {}
) {
  const cleanRaw = (rawText || '').trim();
  const lines = cleanRaw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const date = extractReceiptDate(cleanRaw);
  const merchant = extractReceiptMerchant(lines);
  const no_bukti = extractReceiptNumber(cleanRaw);
  const items = matchItemsWithHistory(extractReceiptItems(lines, merchant), itemHistory, itemAliases);
  const amount = extractReceiptTotal(lines, items);

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
  } else if (/\b(debit|transfer|bri|bca|mandiri|bni|wondr)\b/.test(lower)) {
    const bk = wsAccounts.find((a) => a.type === 'bank');
    if (bk) account_id = bk.id;
  }

  const note = buildReceiptNote(merchant, items);

  // Gunakan pencocokan kategori dinamis (Custom Keywords -> Riwayat Transaksi -> Sinonim -> Default)
  const categorySearchContext = [
    merchant,
    ...items.map((it) => it.name),
    cleanRaw
  ]
    .filter(Boolean)
    .join(' ');

  const category_id = matchBestCategory({
    text: categorySearchContext,
    workspaceId: workspace_id,
    txType: type,
    allCategories,
    allTransactions
  });

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
 * Susun blok-blok hasil deteksi TextDetector menjadi baris teks yang sejajar secara horizontal.
 * Memecah blok multi-baris menjadi baris individual berdasarkan estimasi koordinat Y tiap sub-baris,
 * sehingga kolom label di kiri dan kolom nominal di kanan tetap berada pada baris yang sama.
 */
function reconstructLinesFromDetectedBlocks(detectedBlocks) {
  if (!detectedBlocks || detectedBlocks.length === 0) return '';

  const visualLines = [];
  for (const block of detectedBlocks) {
    const raw = String(block.rawValue || '').trim();
    if (!raw) continue;
    const subLines = raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (subLines.length === 0) continue;

    const bx = block.boundingBox?.x || 0;
    const by = block.boundingBox?.y || 0;
    const bh = block.boundingBox?.height || subLines.length * 18;
    const lineH = Math.max(12, bh / subLines.length);

    for (let idx = 0; idx < subLines.length; idx++) {
      visualLines.push({
        rawValue: subLines[idx],
        x: bx,
        y: by + idx * lineH + lineH * 0.5,
        height: lineH
      });
    }
  }

  if (visualLines.length === 0) return '';

  visualLines.sort((a, b) => a.y - b.y);

  const rows = [];
  for (const vLine of visualLines) {
    // Cari baris terdekat yang masih sejajar secara vertikal
    let matchedRow = null;
    for (let rIdx = rows.length - 1; rIdx >= Math.max(0, rows.length - 4); rIdx--) {
      const candidateRow = rows[rIdx];
      const tolerance = Math.max(10, Math.min(vLine.height, candidateRow.avgHeight) * 0.62);
      if (Math.abs(vLine.y - candidateRow.y) <= tolerance) {
        matchedRow = candidateRow;
        break;
      }
    }

    if (matchedRow) {
      matchedRow.blocks.push(vLine);
      const n = matchedRow.blocks.length;
      matchedRow.y = (matchedRow.y * (n - 1) + vLine.y) / n;
      matchedRow.avgHeight = (matchedRow.avgHeight * (n - 1) + vLine.height) / n;
    } else {
      rows.push({
        y: vLine.y,
        avgHeight: vLine.height,
        blocks: [vLine]
      });
    }
  }

  rows.sort((a, b) => a.y - b.y);

  return rows
    .map((r) => {
      r.blocks.sort((a, b) => a.x - b.x);
      return r.blocks.map((b) => b.rawValue).join('   ');
    })
    .join('\n')
    .trim();
}

/**
 * Hitung skor kelengkapan hasil ekstraksi struk (untuk memilih hasil terbaik antara kanvas kontras vs asli)
 * Memberi bobot tinggi pada rincian item belanja & nama toko yang bersih dari artefak simbol.
 */
function scoreExtractedReceiptText(rawText) {
  if (!rawText || !rawText.trim()) return 0;
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const items = extractReceiptItems(lines);
  const total = extractReceiptTotal(lines, items);
  const merchant = extractReceiptMerchant(lines);
  const isMerchantClean = merchant && !isNoiseOrSymbolGarbage(merchant);

  let score = 0;
  if (total > 0) score += 80;
  score += items.length * 40;
  if (isMerchantClean) score += 35;
  score += Math.min(lines.length, 25);

  // Bonus jika total belanja cocok dengan akumulasi seluruh item (struk terbaca utuh & konsisten)
  const itemsSum = items.reduce((acc, it) => acc + (Number(it.amount) || 0), 0);
  if (items.length >= 2 && itemsSum > 0 && itemsSum === total) {
    score += 60;
  }

  return score;
}

/**
 * Ekstraksi Teks (OCR) dari Canvas / Blob Gambar Struk
 * Mendukung mode Offline via Browser TextDetector API & Cached Tesseract WASM
 */
export async function extractTextFromReceiptImage(
  canvasOrBlob,
  onProgress = () => {},
  secondaryCanvas = null
) {
  if (!canvasOrBlob) return { text: '', engine: 'none' };

  if (canvasOrBlob.__simulatedReceiptText) {
    onProgress('Membaca teks struk...');
    return {
      text: canvasOrBlob.__simulatedReceiptText,
      engine: 'Built-in Receipt Scanner'
    };
  }

  let bestText = '';
  let bestScore = 0;
  let bestEngine = 'Manual / Template';

  // 1. Engine Utama: Browser TextDetector API (100% Offline di Chrome Android / ML Kit)
  if (typeof window !== 'undefined' && 'TextDetector' in window) {
    try {
      onProgress('Mengekstrak teks via Browser TextDetector API (Offline)...');
      // @ts-ignore
      const detector = new window.TextDetector();
      const targets = [canvasOrBlob, secondaryCanvas].filter(Boolean);

      for (const target of targets) {
        const bitmap =
          target instanceof HTMLCanvasElement ? target : await createImageBitmap(target);
        const detectedBlocks = await detector.detect(bitmap);
        const candidateText = reconstructLinesFromDetectedBlocks(detectedBlocks);
        const score = scoreExtractedReceiptText(candidateText);

        if (score > bestScore || (!bestText && candidateText)) {
          bestText = candidateText;
          bestScore = score;
          bestEngine = 'Browser TextDetector (Offline)';
        }
      }

      // Jika TextDetector sudah berhasil mendapatkan nominal total dan rincian item/toko yang valid
      if (bestScore >= 120) {
        return { text: bestText, engine: bestEngine };
      }
    } catch {
      // Lanjut ke fallback Tesseract WASM
    }
  }

  // 2. Engine Cadangan: Tesseract WASM (Bisa berjalan Offline setelah ter-cache oleh PWA Service Worker / IndexedDB)
  try {
    onProgress('Memuat modul OCR (Tesseract WASM)...');
    const tesseractPromise = (async () => {
      const mod = await import(
        /* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js'
      );
      const createWorker = mod.createWorker || mod.default?.createWorker;
      if (!createWorker) return '';

      const worker = await createWorker('ind+eng');
      try {
        await worker.setParameters({
          tessedit_pageseg_mode: '6', // PSM 6: Pindai blok struk baris demi baris dari kiri ke kanan
          preserve_interword_spaces: '1'
        });
      } catch {
        // Abaikan jika parameter tidak didukung versi worker
      }

      onProgress('Memindai baris angka & teks struk...');
      const ret = await worker.recognize(canvasOrBlob);
      let candidateText = (ret?.data?.text || '').trim();
      let candidateScore = scoreExtractedReceiptText(candidateText);

      // Uji kanvas sekunder HANYA jika kanvas primer belum optimal (skor < 80)
      if (secondaryCanvas && candidateScore < 80) {
        onProgress('Menguji kanvas alternatif untuk hasil terbaik...');
        const retRaw = await worker.recognize(secondaryCanvas);
        const rawText = (retRaw?.data?.text || '').trim();
        const rawScore = scoreExtractedReceiptText(rawText);
        if (rawScore > candidateScore) {
          candidateText = rawText;
        }
      }

      await worker.terminate();
      return candidateText;
    })();

    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(''), 25000));
    const ocrText = await Promise.race([tesseractPromise, timeoutPromise]);
    if (ocrText && ocrText.trim()) {
      const tessScore = scoreExtractedReceiptText(ocrText);
      if (tessScore >= bestScore || !bestText) {
        return { text: ocrText.trim(), engine: 'Tesseract WASM OCR' };
      }
    }
  } catch (err) {
    console.warn('OCR error:', err);
  }

  if (bestText) {
    return { text: bestText, engine: bestEngine };
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
