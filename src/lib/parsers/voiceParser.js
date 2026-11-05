import { KOPDES_UNITS } from '../db.js';
import { matchBestCategory } from './categoryMatcher.js';

/**
 * Kamus kata bilangan Bahasa Indonesia ke nilai numerik
 */
const BASIC_NUMBERS = {
  nol: 0,
  satu: 1,
  se: 1,
  dua: 2,
  tiga: 3,
  empat: 4,
  lima: 5,
  enam: 6,
  tujuh: 7,
  delapan: 8,
  sembilan: 9,
  sepuluh: 10,
  sebelas: 11,
  seratus: 100,
  seribu: 1000,
  sejuta: 1000000
};

const MULTIPLIERS = {
  belas: 10, // spesial: ditambah 10 (misal lima belas = 5 + 10 = 15)
  puluh: 10,
  ratus: 100,
  ribu: 1000,
  rb: 1000,
  k: 1000,
  juta: 1000000,
  jt: 1000000,
  miliar: 1000000000,
  milyar: 1000000000
};

// Slang nominal populer di Indonesia
const SLANG_AMOUNTS = {
  seceng: 1000,
  goceng: 5000,
  ceban: 10000,
  noban: 20000,
  goban: 50000,
  gocap: 50000,
  cepek: 100000,
  nopek: 200000,
  gopek: 500000,
  setengahjuta: 500000
};

const NUMBER_TOKENS_SET = new Set([
  ...Object.keys(BASIC_NUMBERS),
  ...Object.keys(MULTIPLIERS),
  ...Object.keys(SLANG_AMOUNTS),
  'setengah',
  'koma',
  'titik',
  'rupiah',
  'rp',
  'perak'
]);

/**
 * Mengubah deretan token angka/terbilang Bahasa Indonesia menjadi angka bulat Rupiah.
 * Mendukung kombinasi seperti:
 * - "seratus dua puluh lima ribu" -> 125000
 * - "dua setengah juta" -> 2500000
 * - "satu juta lima ratus ribu" -> 1500000
 * - "150 ribu" / "150rb" / "2,5 juta" -> 150000 / 2500000
 * - "setengah juta" -> 500000
 * - "dua puluh tujuh ribu lima ratus" -> 27500
 */
export function parseIndonesianWordsToNumber(tokens) {
  if (!tokens || tokens.length === 0) return 0;

  let total = 0; // Akumulator grup besar (jutaan, ribuan)
  let currentGroup = 0; // Akumulator ratusan/puluhan/satuan dalam grup saat ini
  let lastUnitValue = 0; // Nilai satuan terakhir sebelum kata pengali

  for (let i = 0; i < tokens.length; i++) {
    let t = tokens[i].toLowerCase().trim();
    if (!t || t === 'rupiah' || t === 'rp' || t === 'perak') continue;

    // Cek slang langsung
    if (SLANG_AMOUNTS[t] !== undefined) {
      currentGroup += SLANG_AMOUNTS[t];
      continue;
    }

    // Cek pola gabungan angka + suffix seperti "125rb", "125ribu", "2.5jt", "2,5juta", "50k"
    const attachedMatch = t.match(/^(\d+(?:[.,]\d+)?)(ribu|rb|k|juta|jt|ratus|puluh)$/);
    if (attachedMatch) {
      const numVal = parseFloat(attachedMatch[1].replace(',', '.'));
      const unit = attachedMatch[2];
      const mult = MULTIPLIERS[unit] || 1;
      if (mult >= 1000) {
        total += (currentGroup + lastUnitValue + numVal) * mult;
        currentGroup = 0;
      } else {
        currentGroup += (lastUnitValue + numVal) * mult;
      }
      lastUnitValue = 0;
      continue;
    }

    // Cek angka digit murni atau format ribuan/desimal ("125.000", "2,5", "150")
    if (/^\d+(?:[.,]\d+)*$/.test(t)) {
      let numVal = 0;
      // Jika format ribuan titik (misal 125.000 atau 1.500.000)
      if (/^\d{1,3}(?:\.\d{3})+$/.test(t)) {
        // Namun perhatikan kasus "2.500" diikuti kata "ribu"? Biasanya "125.000" sudah utuh.
        numVal = parseInt(t.replace(/\./g, ''), 10);
      } else {
        numVal = parseFloat(t.replace(',', '.'));
      }

      // Cek apakah token berikutnya adalah "koma" + digit (misal "2" "koma" "5" "juta")
      if (i + 2 < tokens.length && (tokens[i + 1] === 'koma' || tokens[i + 1] === 'titik') && /^\d+$/.test(tokens[i + 2])) {
        numVal = parseFloat(`${Math.floor(numVal)}.${tokens[i + 2]}`);
        i += 2;
      }

      currentGroup += lastUnitValue;
      lastUnitValue = numVal;
      continue;
    }

    // Cek kata "koma" di antara kata bilangan (misal "dua koma lima juta")
    if ((t === 'koma' || t === 'titik') && lastUnitValue > 0 && i + 1 < tokens.length) {
      const nextTok = tokens[i + 1];
      const nextDigit = BASIC_NUMBERS[nextTok] ?? (/^\d+$/.test(nextTok) ? parseInt(nextTok, 10) : null);
      if (nextDigit !== null && nextDigit < 10) {
        lastUnitValue = parseFloat(`${lastUnitValue}.${nextDigit}`);
        i += 1;
        continue;
      }
    }

    // Cek kata "setengah" (0.5)
    if (t === 'setengah') {
      // Contoh: "dua setengah juta" -> lastUnitValue = 2 -> menjadi 2.5
      // Contoh: "setengah juta" -> lastUnitValue = 0 -> menjadi 0.5
      if (lastUnitValue > 0) {
        lastUnitValue += 0.5;
      } else {
        lastUnitValue = 0.5;
      }
      continue;
    }

    // Kata bilangan dasar (satu..sebelas, seratus, seribu, sejuta)
    if (BASIC_NUMBERS[t] !== undefined) {
      const val = BASIC_NUMBERS[t];
      if (val === 1000 || val === 1000000) {
        total += val;
        lastUnitValue = 0;
      } else if (val === 100) {
        currentGroup += 100;
        lastUnitValue = 0;
      } else {
        currentGroup += lastUnitValue;
        lastUnitValue = val;
      }
      continue;
    }

    // Kata pengali (belas, puluh, ratus, ribu, juta)
    if (MULTIPLIERS[t] !== undefined) {
      const mult = MULTIPLIERS[t];
      if (t === 'belas') {
        currentGroup += (lastUnitValue || 1) + 10;
        lastUnitValue = 0;
      } else if (mult === 10 || mult === 100) {
        currentGroup += (lastUnitValue || 1) * mult;
        lastUnitValue = 0;
      } else if (mult >= 1000) {
        const groupVal = currentGroup + (lastUnitValue || 0);
        total += (groupVal > 0 ? groupVal : 1) * mult;
        currentGroup = 0;
        lastUnitValue = 0;
      }
      continue;
    }
  }

  const finalAmount = Math.round(total + currentGroup + lastUnitValue);
  return finalAmount > 0 ? finalAmount : 0;
}

/**
 * Mengecek apakah sebuah token adalah bagian dari ekspresi nominal
 */
function isNumberToken(rawToken) {
  const t = rawToken.toLowerCase().replace(/[.,!?]+$/, '');
  if (!t) return false;
  if (NUMBER_TOKENS_SET.has(t)) return true;
  if (/^\d+(?:[.,]\d+)*(?:ribu|rb|k|juta|jt|ratus|puluh)?$/.test(t)) return true;
  if (/^rp\d+/.test(t)) return true;
  return false;
}

/**
 * Ekstrak nominal (Rp) dan kembalikan sisa kalimat yang sudah bersih dari frasa nominal
 */
export function extractAmountAndCleanText(sentence) {
  if (!sentence || typeof sentence !== 'string') {
    return { amount: 0, cleanedText: '' };
  }

  // Normalisasi awal agar "Rp50.000" atau "125rb" mudah ditokenisasi
  const normalized = sentence
    .replace(/rp\.?\s*(\d)/gi, 'rp $1')
    .replace(/setengah\s+juta/gi, 'setengah juta')
    .trim();

  const rawWords = normalized.split(/\s+/);
  let bestAmount = 0;
  let bestSpan = null; // [startIndex, endIndex]

  // Cari rangkaian token angka terpanjang/terbesar di dalam kalimat
  let i = 0;
  while (i < rawWords.length) {
    const cleanWord = rawWords[i].toLowerCase().replace(/^[,.;:!?]+|[,.;:!?]+$/g, '');
    if (isNumberToken(cleanWord)) {
      let j = i;
      const seq = [];
      while (j < rawWords.length) {
        const w = rawWords[j].toLowerCase().replace(/^[,.;:!?]+|[,.;:!?]+$/g, '');
        if (isNumberToken(w)) {
          seq.push(w);
          j++;
        } else if (
          (w === 'dan' || w === 'lebih') &&
          j + 1 < rawWords.length &&
          isNumberToken(rawWords[j + 1].toLowerCase().replace(/^[,.;:!?]+|[,.;:!?]+$/g, ''))
        ) {
          j++;
        } else {
          break;
        }
      }

      const parsedVal = parseIndonesianWordsToNumber(seq);
      // Prioritaskan nominal yang lebih besar (karena angka kecil seperti "beli 2 galon 40 ribu" -> 40000 adalah harga)
      if (parsedVal > bestAmount) {
        bestAmount = parsedVal;
        bestSpan = [i, j - 1];
      }
      i = j;
    } else {
      i++;
    }
  }

  // Jika angka yang terdeteksi terlalu kecil (< 100, misal "50") tapi di konteks uang Indonesia tidak disebut "ribu",
  // biarkan apa adanya kecuali jika pengguna memang menyebut angka bulat.
  let remainingWords = rawWords;
  if (bestSpan) {
    remainingWords = rawWords.filter((_, idx) => idx < bestSpan[0] || idx > bestSpan[1]);
  }

  // Bersihkan kata penghubung yang menggantung di ujung kalimat (misal "sebesar", "senilai", "harga", "total")
  let cleanedText = remainingWords
    .join(' ')
    .replace(/\b(sebesar|senilai|seharga|totalnya|total|dengan harga|Rp|rupiah)\b\s*$/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return {
    amount: bestAmount,
    cleanedText
  };
}

/**
 * Deteksi Workspace (Buku Kas) dari kalimat
 */
function detectWorkspace(lowerText, fallbackWorkspace) {
  if (
    /\b(pekerjaan|kerja|kantor|dinas|proyek|kopdes|koperasi|usp|simpan pinjam|unit toko|unit pertanian|unit pupuk|bkm|bkk|bendahara|anggota koperasi|pengurus|rat)\b/.test(
      lowerText
    )
  ) {
    return fallbackWorkspace === 'kopdes' ? 'kopdes' : 'pekerjaan';
  }
  if (
    /\b(usaha|bisnis|dagang|omzet|hpp|kulakan|pelanggan|suplier|supplier|rekening usaha|kas usaha|toko usaha)\b/.test(
      lowerText
    )
  ) {
    return 'business';
  }
  if (/\b(pribadi|rumah tangga|dompet pribadi|uang pribadi|bank pribadi)\b/.test(lowerText)) {
    return 'personal';
  }
  return fallbackWorkspace || 'personal';
}

/**
 * Deteksi Tipe Transaksi dari kalimat
 */
function detectTransactionType(lowerText) {
  if (/\b(transfer|pindah dana|pindahkan|mutasi|tarik tunai|setor tunai|top up|topup)\b/.test(lowerText)) {
    return 'transfer';
  }
  if (/\b(kasbon|piutang|pinjamkan|dipinjam|ngebon)\b/.test(lowerText)) {
    return 'receivable';
  }
  if (/\b(utang masuk|hutang masuk|terima pinjaman|pinjam uang)\b/.test(lowerText)) {
    return 'debt';
  }
  if (
    /\b(terima|masuk|pemasukan|jual|penjualan|omzet|setoran|gajian|gaji|dapat|pendapatan|angsuran masuk|simpanan pokok|simpanan wajib|simpanan sukarela|hibah|bagi hasil|pelunasan)\b/.test(
      lowerText
    )
  ) {
    return 'income';
  }
  if (
    /\b(beli|bayar|keluar|pengeluaran|belanja|bensin|bbm|makan|minum|jajan|ongkos|listrik|atk|fotokopi|konsumsi|upah|honor|pencairan|dinas|rapat|tagihan|pulsa|kuota|sewa|biaya)\b/.test(
      lowerText
    )
  ) {
    return 'expense';
  }
  return 'expense';
}

/**
 * Deteksi Kategori paling cocok berdasarkan kata kunci kalimat & daftar kategori di Workspace
 */
function detectCategory(lowerText, workspaceId, txType, allCategories = []) {
  const catType = txType === 'income' || txType === 'debt' ? 'income' : 'expense';
  const candidates = allCategories.filter(
    (c) => c.workspace_id === workspaceId && c.type === catType
  );
  if (candidates.length === 0) return '';

  // 1. Cek kecocokan langsung nama kategori
  for (const cat of candidates) {
    const words = cat.name
      .toLowerCase()
      .split(/[\s/&(),.-]+/)
      .filter((w) => w.length >= 3 && !['dan', 'unit', 'biaya', 'lain', 'lainnya'].includes(w));
    for (const w of words) {
      if (lowerText.includes(w)) {
        return cat.id;
      }
    }
  }

  // 2. Kamus sinonim cerdas per kategori populer
  const synonymRules = [
    {
      keywords: ['makan', 'minum', 'warung', 'nasi', 'kopi', 'jajan', 'sembako', 'beras', 'galon', 'gas', 'dapur', 'sayur', 'belanja bulanan', 'indomaret', 'alfamart'],
      matchName: ['makan', 'kebutuhan rumah', 'konsumsi', 'toko']
    },
    {
      keywords: ['bensin', 'pertalite', 'pertamax', 'solar', 'bbm', 'parkir', 'tol', 'ojek', 'grab', 'gojek', 'servis motor', 'oli', 'transport'],
      matchName: ['transportasi', 'bbm', 'perjalanan']
    },
    {
      keywords: ['listrik', 'token', 'pln', 'wifi', 'internet', 'indihome', 'pulsa', 'paket data', 'pdam', 'air', 'bpjs'],
      matchName: ['tagihan', 'komunikasi', 'operasional', 'listrik']
    },
    {
      keywords: ['obat', 'dokter', 'apotek', 'klinik', 'rumah sakit', 'sekolah', 'spp', 'buku', 'kursus'],
      matchName: ['kesehatan', 'pendidikan']
    },
    {
      keywords: ['atk', 'kertas', 'fotokopi', 'tinta', 'printer', 'stempel', 'map', 'amplop', 'snack rapat'],
      matchName: ['atk', 'operasional kantor']
    },
    {
      keywords: ['pupuk', 'bibit', 'pestisida', 'sembako unit', 'barang toko', 'stok', 'kulakan', 'bahan baku', 'hpp'],
      matchName: ['belanja barang', 'hpp', 'pembelian bahan']
    },
    {
      keywords: ['gaji', 'honor', 'upah', 'thr', 'insentif', 'bonus', 'lembur'],
      matchName: ['gaji', 'honor', 'upah']
    },
    {
      keywords: ['setoran', 'omzet', 'penjualan', 'laku', 'dagangan'],
      matchName: ['setoran', 'omzet']
    },
    {
      keywords: ['simpanan pokok', 'simpanan wajib', 'simpanan sukarela', 'iuran anggota'],
      matchName: ['simpanan']
    },
    {
      keywords: ['angsuran', 'cicilan'],
      matchName: ['angsuran', 'pelunasan']
    },
    {
      keywords: ['pencairan', 'pinjaman anggota'],
      matchName: ['pencairan']
    },
    {
      keywords: ['dinas', 'rapat', 'rat', 'koordinasi', 'sppd'],
      matchName: ['perjalanan dinas', 'rapat']
    }
  ];

  for (const rule of synonymRules) {
    if (rule.keywords.some((kw) => lowerText.includes(kw))) {
      const found = candidates.find((c) =>
        rule.matchName.some((m) => c.name.toLowerCase().includes(m))
      );
      if (found) return found.id;
    }
  }

  return candidates[0]?.id || '';
}

/**
 * Deteksi Dompet/Akun dari kalimat
 */
function detectAccount(lowerText, workspaceId, allAccounts = []) {
  const wsAccounts = allAccounts.filter((a) => a.workspace_id === workspaceId);
  if (wsAccounts.length === 0) return '';

  // 1. Cek nama akun langsung (misal "BRI Kopdes", "Kas Kecil", "E-Wallet")
  for (const acc of wsAccounts) {
    const accLower = acc.name.toLowerCase();
    if (lowerText.includes(accLower)) return acc.id;
  }

  // 2. Cek kata kunci tipe akun
  if (/\b(bri|bca|mandiri|bni|bsi|bank|rekening|transfer)\b/.test(lowerText)) {
    const bankAcc = wsAccounts.find((a) => a.type === 'bank' || /bank|bri|rekening/i.test(a.name));
    if (bankAcc) return bankAcc.id;
  }
  if (/\b(ewallet|e-wallet|gopay|ovo|dana|shopeepay|qris)\b/.test(lowerText)) {
    const ewAcc = wsAccounts.find((a) => a.type === 'ewallet' || /wallet/i.test(a.name));
    if (ewAcc) return ewAcc.id;
  }
  if (/\b(tunai|cash|kas kecil|dompet)\b/.test(lowerText)) {
    const cashAcc = wsAccounts.find((a) => a.type === 'cash');
    if (cashAcc) return cashAcc.id;
  }

  return wsAccounts[0]?.id || '';
}

/**
 * Deteksi Unit Usaha Kopdes dari kalimat
 */
function detectKopdesUnit(lowerText) {
  if (/\b(usp|simpan pinjam|pinjaman|angsuran)\b/.test(lowerText)) {
    return KOPDES_UNITS[0]; // Unit Simpan Pinjam (USP)
  }
  if (/\b(toko|ritel|sembako|warung)\b/.test(lowerText)) {
    return KOPDES_UNITS[1]; // Unit Toko/Ritel
  }
  if (/\b(pupuk|pertanian|bibit|obat pertanian|tani)\b/.test(lowerText)) {
    return KOPDES_UNITS[2]; // Unit Pertanian/Pupuk
  }
  if (/\b(jasa|sewa)\b/.test(lowerText)) {
    return KOPDES_UNITS[3]; // Jasa/Lainnya
  }
  if (/\b(sekretariat|kantor|atk|rapat|pengurus|listrik)\b/.test(lowerText)) {
    return KOPDES_UNITS[4]; // Umum/Sekretariat
  }
  return KOPDES_UNITS[0];
}

/**
 * Rapikan kalimat sisa menjadi Catatan (Note) yang bersih dan sopan
 */
function formatCleanNote(cleanedText, rawText) {
  let note = cleanedText
    // Hapus instruksi pindah buku atau dana talangan agar catatan fokus ke substansi transaksi
    .replace(/\b(di buku pekerjaan|di buku kantor|di buku dinas|di buku kopdes|di buku usaha|di buku pribadi|masuk buku kopdes|masuk buku pekerjaan|untuk pekerjaan|untuk kantor|untuk kopdes|pakai dana talangan|dana talangan|pakai uang pribadi|ditalangi pribadi|reimburse)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[,.\-:\s]+|[,.\-:\s]+$/g, '')
    .trim();

  if (!note) {
    note = rawText.trim();
  }

  // Kapitalisasi huruf pertama
  return note.charAt(0).toUpperCase() + note.slice(1);
}

/**
 * Fungsi Utama: Parse kalimat suara/teks Bahasa Indonesia menjadi objek siap-isi ke TransactionForm
 */
export function parseVoiceInput(
  rawTranscript,
  { activeWorkspace = 'personal', allAccounts = [], allCategories = [], allTransactions = [] } = {}
) {
  const transcript = (rawTranscript || '').trim();
  if (!transcript) {
    return {
      workspace_id: activeWorkspace,
      type: 'expense',
      amount: 0,
      account_id: '',
      category_id: '',
      note: '',
      metadata: {
        unit_usaha:
          activeWorkspace === 'kopdes' || activeWorkspace === 'pekerjaan'
            ? KOPDES_UNITS[0]
            : '',
        no_bukti: '',
        pic_pihak: '',
        reimburse_status: 'none',
        reimburse_from_account_id: null
      }
    };
  }

  const lower = transcript.toLowerCase();
  const { amount, cleanedText } = extractAmountAndCleanText(transcript);

  const workspace_id = detectWorkspace(lower, activeWorkspace);
  const type = detectTransactionType(lower);
  const account_id = detectAccount(lower, workspace_id, allAccounts);
  const category_id = matchBestCategory({
    text: transcript,
    workspaceId: workspace_id,
    txType: type,
    allCategories,
    allTransactions
  });
  const note = formatCleanNote(cleanedText, transcript);

  // Deteksi Dana Talangan / Reimburse
  const isTalangan =
    workspace_id !== 'personal' &&
    type === 'expense' &&
    /\b(talangan|reimburse|uang pribadi|dompet pribadi|ditalangi)\b/.test(lower);

  const personalAccounts = allAccounts.filter((a) => a.workspace_id === 'personal');

  // Deteksi No Bukti jika disebutkan (contoh "nomor bukti BKK 05" atau "nomor bukti SPJ 12")
  let no_bukti = '';
  const buktiMatch = transcript.match(/\b(?:no\.?\s*bukti|bkm|bkk|spj|nota|inv)\s*[:#-]?\s*([A-Za-z0-9/.-]+)/i);
  if (buktiMatch) {
    no_bukti = buktiMatch[0].replace(/^no\.?\s*bukti\s*[:#-]?\s*/i, '').trim().toUpperCase();
  }

  const isPekerjaan = workspace_id === 'pekerjaan' || workspace_id === 'kopdes';
  const unit_usaha = isPekerjaan ? detectKopdesUnit(lower) : '';

  return {
    workspace_id,
    type,
    amount,
    account_id,
    category_id,
    note,
    metadata: {
      unit_usaha,
      no_bukti,
      pic_pihak: '',
      reimburse_status: isTalangan ? 'pending' : 'none',
      reimburse_from_account_id: isTalangan ? (personalAccounts[0]?.id || null) : null
    }
  };
}
