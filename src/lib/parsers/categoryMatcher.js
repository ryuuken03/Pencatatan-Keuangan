/**
 * Mesin Pencocokan Kategori Dinamis (Digunakan oleh Scan Struk OCR & Input Suara)
 *
 * Urutan Prioritas (4 Lapis):
 * 1. Kata Kunci Kustom & Nama Kategori Aktif (`cat.keywords` & `cat.name`) — mendukung penuh kategori baru buatan user.
 * 2. Auto-Learning dari Riwayat Transaksi & Item Produk (`allTransactions` + `tx.items`) —
 *    otomatis belajar dari kebiasaan user (nama toko/vendor, nama produk di `transaction_items`, dan catatan).
 *    Kategori lama yang sudah dihapus otomatis diabaikan karena hanya mengecek kategori aktif (`candidates`).
 * 3. Kamus Sinonim Kontekstual Bahasa Indonesia (Fallback jika belum ada riwayat).
 * 4. Kategori Aktif Pertama (`candidates[0].id`).
 */

const STOPWORDS = new Set([
  'dan', 'atau', 'yang', 'untuk', 'dari', 'pada', 'dengan', 'ke', 'di',
  'ini', 'itu', 'ada', 'beli', 'bayar', 'uang', 'kas', 'dana', 'nota',
  'struk', 'bukti', 'total', 'harga', 'jumlah', 'item', 'produk', 'pcs',
  'pak', 'sak', 'box', 'botol', 'bungkus', 'unit', 'biaya', 'lain',
  'lainnya', 'masuk', 'keluar', 'transaksi', 'pribadi', 'usaha', 'kopdes'
]);

/**
 * Ekstrak daftar kata bermakna (panjang >= 3 karakter, bukan angka murni & bukan stopword)
 */
function tokenizeMeaningfulWords(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];
  return rawText
    .toLowerCase()
    .split(/[\s/&(),.:;\-+*#@!?"'[\]{}|\\]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !STOPWORDS.has(w));
}

/**
 * Kamus sinonim kontekstual untuk pengguna baru yang belum punya riwayat transaksi
 */
const CONTEXTUAL_SYNONYM_GROUPS = [
  {
    triggerWords: [
      'makan', 'minum', 'warung', 'resto', 'restoran', 'rm', 'rumah makan', 'kafe', 'cafe',
      'coffee', 'kopi', 'teh', 'tea', 'es', 'teler', 'jus', 'juice', 'milk', 'dairy',
      'nasi', 'mie', 'bakmie', 'ayam', 'bebek', 'soto', 'bakso', 'sate', 'gado', 'pecel',
      'roti', 'bakery', 'kue', 'martabak', 'gorengan', 'cemilan', 'snack', 'jajan', 'kuliner',
      'sembako', 'beras', 'minyak', 'gula', 'telur', 'galon', 'gas', 'lpg', 'dapur', 'sayur',
      'buah', 'daging', 'ikan', 'indomaret', 'alfamart', 'alfamidi', 'superindo', 'minimarket',
      'supermarket', 'pasar', 'belanja bulanan'
    ],
    categoryHints: ['makan', 'minum', 'konsumsi', 'kuliner', 'jajan', 'kebutuhan', 'rumah', 'dapur', 'sembako', 'belanja']
  },
  {
    triggerWords: [
      'bensin', 'pertalite', 'pertamax', 'solar', 'biosolar', 'dexlite', 'spbu', 'pertamina',
      'shell', 'bbm', 'parkir', 'tol', 'e-toll', 'flazz', 'ojek', 'gojek', 'grab', 'maxim',
      'taksi', 'kereta', 'tiket', 'travel', 'bus', 'servis', 'bengkel', 'oli', 'ban', 'sparepart',
      'cuci motor', 'cuci mobil', 'transport', 'transportasi', 'ongkos'
    ],
    categoryHints: ['transport', 'bbm', 'bensin', 'kendaraan', 'perjalanan', 'dinas', 'jalan']
  },
  {
    triggerWords: [
      'listrik', 'token', 'pln', 'wifi', 'internet', 'indihome', 'biznet', 'orbit', 'pulsa',
      'kuota', 'paket data', 'telkomsel', 'indosat', 'xl', 'smartfren', 'pdam', 'air', 'bpjs',
      'tagihan', 'langganan', 'netflix', 'spotify', 'youtube', 'iuran', 'sampah', 'keamanan'
    ],
    categoryHints: ['tagihan', 'komunikasi', 'listrik', 'air', 'internet', 'pulsa', 'operasional', 'bulanan']
  },
  {
    triggerWords: [
      'obat', 'apotek', 'kimia farma', 'k24', 'dokter', 'klinik', 'puskesmas', 'rs', 'rumah sakit',
      'lab', 'vitamin', 'medis', 'kesehatan', 'sekolah', 'spp', 'kuliah', 'ukt', 'buku', 'alat tulis',
      'kursus', 'les', 'pendidikan', 'seragam'
    ],
    categoryHints: ['kesehatan', 'medis', 'obat', 'pendidikan', 'sekolah', 'anak']
  },
  {
    triggerWords: [
      'atk', 'kertas', 'hvs', 'fotokopi', 'jilid', 'tinta', 'toner', 'printer', 'pulpen', 'spidol',
      'map', 'ordner', 'amplop', 'stempel', 'materai', 'kantor', 'sekretariat', 'rapat', 'konsumsi rapat'
    ],
    categoryHints: ['atk', 'kantor', 'operasional', 'sekretariat', 'administrasi']
  },
  {
    triggerWords: [
      'pupuk', 'urea', 'npk', 'phonska', 'za', 'organik', 'bibit', 'benih', 'pestisida', 'herbisida',
      'insektisida', 'fungisida', 'tani', 'pertanian', 'kulakan', 'grosir', 'suplier', 'supplier',
      'bahan baku', 'kemasan', 'pouch', 'botol', 'kardus', 'plastik', 'produksi', 'stok', 'barang dagangan', 'hpp'
    ],
    categoryHints: ['belanja barang', 'hpp', 'bahan', 'kulakan', 'stok', 'unit', 'produksi', 'dagang']
  },
  {
    triggerWords: [
      'gaji', 'honor', 'upah', 'tukang', 'buruh', 'karyawan', 'staf', 'pengurus', 'thr',
      'bonus', 'insentif', 'komisi', 'lembur'
    ],
    categoryHints: ['gaji', 'honor', 'upah', 'pendapatan', 'karyawan', 'pengurus', 'sdm']
  },
  {
    triggerWords: [
      'omzet', 'penjualan', 'laku', 'order', 'orderan', 'pesanan', 'setoran', 'hasil usaha', 'laba', 'bagi hasil'
    ],
    categoryHints: ['omzet', 'penjualan', 'setoran', 'usaha', 'investasi', 'bagi hasil', 'pendapatan']
  },
  {
    triggerWords: [
      'simpanan pokok', 'simpanan wajib', 'simpanan sukarela', 'tabungan anggota', 'iuran anggota'
    ],
    categoryHints: ['simpanan', 'anggota']
  },
  {
    triggerWords: [
      'angsuran', 'cicilan', 'pelunasan', 'bayar pinjaman', 'bayar utang', 'bayar kasbon'
    ],
    categoryHints: ['angsuran', 'pelunasan', 'piutang', 'pinjaman']
  },
  {
    triggerWords: [
      'pencairan', 'cairkan', 'pinjaman anggota', 'kredit anggota', 'usp'
    ],
    categoryHints: ['pencairan', 'pinjaman']
  },
  {
    triggerWords: [
      'dinas', 'sppd', 'rapat', 'rat', 'koordinasi', 'kunjungan', 'pelatihan', 'seminar'
    ],
    categoryHints: ['perjalanan dinas', 'rapat', 'dinas', 'kegiatan']
  }
];

/**
 * Cari `category_id` terbaik secara dinamis.
 *
 * @param {Object} params
 * @param {string} params.text - Teks gabungan (nama toko, daftar produk, catatan, atau transkrip suara)
 * @param {string} params.workspaceId - 'personal' | 'business' | 'kopdes'
 * @param {string} params.txType - 'expense' | 'income' | 'transfer' | 'receivable' | 'debt'
 * @param {Array} params.allCategories - Daftar semua kategori aktif di DB
 * @param {Array} [params.allTransactions=[]] - Daftar riwayat transaksi aktif di DB (beserta `tx.items`)
 * @returns {string} ID kategori yang paling cocok
 */
export function matchBestCategory({
  text = '',
  workspaceId = 'personal',
  txType = 'expense',
  allCategories = [],
  allTransactions = []
}) {
  if (txType === 'transfer') return '';

  const catType = txType === 'income' || txType === 'debt' ? 'income' : 'expense';
  const candidates = allCategories.filter(
    (c) => !c.deleted_at && c.workspace_id === workspaceId && c.type === catType
  );

  if (candidates.length === 0) return '';

  const lowerText = (text || '').toLowerCase().trim();
  if (!lowerText) return candidates[0].id;

  const inputWords = tokenizeMeaningfulWords(lowerText);
  const candidatesMap = new Map(candidates.map((c) => [c.id, c]));

  // =========================================================================
  // LAPIS 1: Kecocokan Langsung dengan Kata Kunci Kustom (`cat.keywords`) & Nama Kategori (`cat.name`)
  // Mendukung penuh kategori baru yang dibuat oleh user!
  // =========================================================================
  let bestDirectCatId = '';
  let bestDirectScore = 0;

  for (const cat of candidates) {
    let score = 0;

    // 1a. Cek kata kunci kustom kategori (jika diisi user saat buat/edit kategori)
    if (cat.keywords && typeof cat.keywords === 'string') {
      const customKwList = cat.keywords
        .toLowerCase()
        .split(/[,;]+/)
        .map((k) => k.trim())
        .filter((k) => k.length >= 2);

      for (const kw of customKwList) {
        if (lowerText.includes(kw)) {
          score += 10 + kw.length; // Prioritas tertinggi untuk kata kunci kustom
        }
      }
    }

    // 1b. Cek kata-kata di dalam nama kategori itu sendiri
    const catWords = tokenizeMeaningfulWords(cat.name);
    for (const cw of catWords) {
      if (inputWords.includes(cw)) {
        score += 6;
      } else if (cw.length >= 4 && lowerText.includes(cw)) {
        score += 4;
      }
    }

    if (score > bestDirectScore) {
      bestDirectScore = score;
      bestDirectCatId = cat.id;
    }
  }

  if (bestDirectScore > 0 && bestDirectCatId) {
    return bestDirectCatId;
  }

  // =========================================================================
  // LAPIS 2: Auto-Learning dari Riwayat Transaksi User (`allTransactions` & `tx.items`)
  // Jika user pernah menyimpan toko/produk/catatan serupa ke suatu kategori aktif,
  // gunakan kategori tersebut secara otomatis!
  // =========================================================================
  if (allTransactions && allTransactions.length > 0 && inputWords.length > 0) {
    const scoreByCatId = {};

    for (const tx of allTransactions) {
      if (tx.deleted_at) continue;
      if (tx.workspace_id !== workspaceId) continue;
      if (!tx.category_id || !candidatesMap.has(tx.category_id)) continue; // Abaikan jika kategori lama sudah dihapus!

      const historyParts = [
        tx.note || '',
        tx.metadata?.pic_pihak || '',
        ...(Array.isArray(tx.items) ? tx.items.map((it) => it.name || '') : [])
      ].join(' ');

      const historyLower = historyParts.toLowerCase();
      if (!historyLower) continue;

      const historyWords = new Set(tokenizeMeaningfulWords(historyLower));
      let matchCount = 0;

      for (const iw of inputWords) {
        if (historyWords.has(iw)) {
          matchCount += iw.length >= 5 ? 3 : 2;
        }
      }

      if (matchCount > 0) {
        scoreByCatId[tx.category_id] = (scoreByCatId[tx.category_id] || 0) + matchCount;
      }
    }

    let bestHistoryCatId = '';
    let bestHistoryScore = 0;
    for (const [catId, sc] of Object.entries(scoreByCatId)) {
      if (sc > bestHistoryScore) {
        bestHistoryScore = sc;
        bestHistoryCatId = catId;
      }
    }

    if (bestHistoryScore >= 2 && bestHistoryCatId) {
      return bestHistoryCatId;
    }
  }

  // =========================================================================
  // LAPIS 3: Kamus Sinonim Kontekstual Bahasa Indonesia
  // =========================================================================
  for (const group of CONTEXTUAL_SYNONYM_GROUPS) {
    const hasTrigger = group.triggerWords.some((tw) => {
      if (tw.includes(' ')) return lowerText.includes(tw);
      return inputWords.includes(tw) || new RegExp(`\\b${tw}\\b`, 'i').test(lowerText);
    });

    if (hasTrigger) {
      const matchedCat = candidates.find((c) => {
        const cName = c.name.toLowerCase();
        const cKw = (c.keywords || '').toLowerCase();
        return group.categoryHints.some((hint) => cName.includes(hint) || cKw.includes(hint));
      });
      if (matchedCat) {
        return matchedCat.id;
      }
    }
  }

  // =========================================================================
  // LAPIS 4: Default ke Kategori Aktif Pertama di Workspace Tersebut
  // =========================================================================
  return candidates[0].id;
}

