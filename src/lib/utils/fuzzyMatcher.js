/**
 * Local Fuzzy Matcher — Sørensen–Dice Coefficient (Bigram Matching).
 * 100% native, offline, tanpa dependency eksternal.
 *
 * Similarity(S1, S2) = 2 × |B(S1) ∩ B(S2)| / (|B(S1)| + |B(S2)|)
 * B(S) = multiset bigram karakter dari string ternormalisasi (huruf kecil, tanpa spasi/simbol).
 */

export const DEFAULT_FUZZY_THRESHOLD = 0.7;

/**
 * Normalisasi teks ke bentuk perbandingan: huruf kecil, buang diakritik & simbol, rapatkan spasi.
 */
export function normalizeForMatch(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenize(normalized) {
  return normalized ? normalized.split(' ').filter(Boolean) : [];
}

/**
 * Multiset bigram (Map<bigram, jumlah>) dari string ringkas tanpa spasi.
 */
function buildBigrams(compact) {
  const map = new Map();
  for (let i = 0; i < compact.length - 1; i++) {
    const bg = compact.slice(i, i + 2);
    map.set(bg, (map.get(bg) || 0) + 1);
  }
  return map;
}

function diceFromBigrams(mapA, sizeA, mapB, sizeB) {
  if (sizeA === 0 || sizeB === 0) return 0;
  const [small, large] = mapA.size <= mapB.size ? [mapA, mapB] : [mapB, mapA];
  let overlap = 0;
  for (const [bg, countSmall] of small) {
    const countLarge = large.get(bg);
    if (countLarge) overlap += Math.min(countSmall, countLarge);
  }
  return (2 * overlap) / (sizeA + sizeB);
}

function prepareEntry(name) {
  const normalized = normalizeForMatch(name);
  const compact = normalized.replace(/ /g, '');
  const tokens = tokenize(normalized);
  return {
    name,
    key: compact,
    bigrams: buildBigrams(compact),
    bigramCount: Math.max(0, compact.length - 1),
    // Token bermakna (>= 3 karakter & mengandung huruf) untuk validasi cakupan kata
    keyTokens: tokens.filter((t) => t.length >= 3 && /[a-z]/.test(t)),
    allTokens: tokens,
    digits: (normalized.match(/\d+/g) || []).sort().join('|')
  };
}

/**
 * Skor kemiripan Dice Coefficient antara dua string (0..1).
 */
export function calculateDiceSimilarity(str1, str2) {
  const a = normalizeForMatch(str1).replace(/ /g, '');
  const b = normalizeForMatch(str2).replace(/ /g, '');
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  return diceFromBigrams(buildBigrams(a), a.length - 1, buildBigrams(b), b.length - 1);
}

function tokenCounterpartExists(token, otherTokens) {
  for (const other of otherTokens) {
    if (other === token) return true;
    // Terpotong OCR / singkatan: "jasmin" ↔ "jasmine", "b" ↔ "boom"
    if (other.startsWith(token) || token.startsWith(other)) return true;
    if (calculateDiceSimilarity(token, other) >= 0.5) return true;
  }
  return false;
}

/**
 * Setiap kata bermakna di kedua sisi wajib punya padanan di sisi lain.
 * Mencegah "BREAD KASUR CKLT" tercocok ke "MR. BREAD KASUR" (varian rasa hilang).
 */
function hasMutualTokenCoverage(a, b) {
  return (
    a.keyTokens.every((t) => tokenCounterpartExists(t, b.allTokens)) &&
    b.keyTokens.every((t) => tokenCounterpartExists(t, a.allTokens))
  );
}

/**
 * Bangun indeks referensi (bigram pra-hitung) dari daftar nama.
 * Duplikat (setelah normalisasi) dibuang — kemunculan pertama dipertahankan,
 * jadi urutkan input dari yang paling baru agar koreksi terakhir pengguna menang.
 */
export function buildFuzzyIndex(names = []) {
  const seen = new Set();
  const index = [];
  for (const raw of names) {
    const name = String(raw || '').trim();
    if (!name) continue;
    const entry = prepareEntry(name);
    if (entry.key.length < 3 || seen.has(entry.key)) continue;
    seen.add(entry.key);
    index.push(entry);
  }
  index.__fuzzyIndex = true;
  return index;
}

/**
 * Cari nama referensi paling mirip dengan kandidat (hasil OCR).
 * @param {string} candidate
 * @param {Array<string>|ReturnType<typeof buildFuzzyIndex>} referenceList
 * @param {number} threshold Ambang batas kemiripan (default 0.70)
 * @returns {{ match: string, score: number } | null}
 */
export function findBestFuzzyMatch(candidate, referenceList, threshold = DEFAULT_FUZZY_THRESHOLD) {
  if (!candidate || !Array.isArray(referenceList) || referenceList.length === 0) return null;

  const index = referenceList.__fuzzyIndex ? referenceList : buildFuzzyIndex(referenceList);
  const cand = prepareEntry(candidate);
  if (cand.key.length < 3) return null;

  let best = null;
  for (const ref of index) {
    if (ref.key === cand.key) return { match: ref.name, score: 1 };

    // Batas atas Dice dari selisih panjang — lewati tanpa menghitung irisan
    const maxPossible = (2 * Math.min(cand.bigramCount, ref.bigramCount)) / (cand.bigramCount + ref.bigramCount || 1);
    if (maxPossible < threshold || (best && maxPossible <= best.score)) continue;

    // Angka (ukuran/varian: 2pcs vs 3pcs, 500ml vs 1l) wajib identik bila keduanya memuat angka
    if (cand.digits && ref.digits && cand.digits !== ref.digits) continue;

    const score = diceFromBigrams(cand.bigrams, cand.bigramCount, ref.bigrams, ref.bigramCount);
    if (score < threshold || (best && score <= best.score)) continue;
    if (!hasMutualTokenCoverage(cand, ref)) continue;

    best = { match: ref.name, score };
  }

  return best;
}

/**
 * Bangun indeks alias dari daftar objek item_aliases ({ ocr_key, canonical_name, hit_count, merchant })
 */
export function buildAliasIndex(aliases = []) {
  const exactMap = new Map();
  const list = [];
  const seenFuzzy = new Set();

  // Urutkan berdasarkan hit_count tertinggi lalu update terbaru
  const sorted = [...(aliases || [])].sort((a, b) => {
    if ((b.hit_count || 1) !== (a.hit_count || 1)) {
      return (b.hit_count || 1) - (a.hit_count || 1);
    }
    return String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
  });

  for (const item of sorted) {
    const rawKey = String(item.ocr_key || '').trim();
    const canonical = String(item.canonical_name || '').trim();
    if (!rawKey || !canonical) continue;
    const cleanKey = normalizeForMatch(rawKey).replace(/ /g, '');
    if (cleanKey.length < 2) continue;

    if (!exactMap.has(cleanKey)) {
      exactMap.set(cleanKey, canonical);
    }

    if (!seenFuzzy.has(cleanKey)) {
      seenFuzzy.add(cleanKey);
      const entry = prepareEntry(rawKey);
      entry.canonical_name = canonical;
      entry.hit_count = item.hit_count || 1;
      list.push(entry);
    }
  }

  list.__aliasIndex = true;
  return { exactMap, list };
}

/**
 * Cari padanan terbaik dengan urutan prioritas:
 * 1. Alias Exact Match (100%)
 * 2. Alias Fuzzy Match (>= threshold)
 * 3. History Fuzzy Match (>= threshold)
 */
export function findMatchWithAliases(candidate, { aliasIndex = null, historyIndex = null, threshold = DEFAULT_FUZZY_THRESHOLD } = {}) {
  if (!candidate) return null;
  const cand = prepareEntry(candidate);
  if (cand.key.length < 2) return null;

  // 1. Cek Exact Match di Kamus Alias
  if (aliasIndex?.exactMap && aliasIndex.exactMap.has(cand.key)) {
    return {
      match: aliasIndex.exactMap.get(cand.key),
      score: 1.0,
      source: 'alias_exact'
    };
  }

  // 2. Cek Fuzzy Match di Kamus Alias (jika OCR memiliki sedikit variasi dari alias yang tersimpan)
  if (aliasIndex?.list && aliasIndex.list.length > 0) {
    let bestAlias = null;
    for (const ref of aliasIndex.list) {
      if (ref.key === cand.key) {
        return { match: ref.canonical_name, score: 1.0, source: 'alias_exact' };
      }
      const maxPossible = (2 * Math.min(cand.bigramCount, ref.bigramCount)) / (cand.bigramCount + ref.bigramCount || 1);
      if (maxPossible < threshold || (bestAlias && maxPossible <= bestAlias.score)) continue;
      if (cand.digits && ref.digits && cand.digits !== ref.digits) continue;

      const score = diceFromBigrams(cand.bigrams, cand.bigramCount, ref.bigrams, ref.bigramCount);
      if (score < threshold || (bestAlias && score <= bestAlias.score)) continue;
      if (!hasMutualTokenCoverage(cand, ref)) continue;

      bestAlias = { match: ref.canonical_name, score, source: 'alias_fuzzy' };
    }
    if (bestAlias) return bestAlias;
  }

  // 3. Fallback: Fuzzy Match di Riwayat transaction_items
  if (historyIndex && historyIndex.length > 0) {
    const histResult = findBestFuzzyMatch(candidate, historyIndex, threshold);
    if (histResult) {
      return {
        match: histResult.match,
        score: histResult.score,
        source: 'history'
      };
    }
  }

  return null;
}

