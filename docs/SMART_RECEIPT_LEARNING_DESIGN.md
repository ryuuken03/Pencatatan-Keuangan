# Smart Self-Learning Receipt Scanner & Fuzzy Matching Architecture
> **Dokumen Desain Sistem & Rekomendasi Solusi Arsitektural**  
> Menggantikan pendekatan hardcode regex nama produk spesifik menjadi sistem yang otomatis belajar secara lokal (*offline-first*) dari database Dexie.js.

---

## 1. Latar Belakang & Masalah Hardcode Regex

Saat ini, `src/lib/parsers/receiptParser.js` memuat beberapa regex yang menargetkan nama barang tertentu secara spesifik (contoh: `MR. BREAD`, `Strawberry Cheesecake`, `Jasmine Boom`). 

### Mengapa Pendekatan Tersebut Harus Dihentikan?
1. **Unbounded Catalog (Tidak Scalable):** Terdapat ratusan ribu SKU produk di pasar ritel dan F&B Indonesia. Menambahkan regex per produk menyebabkan kode terus membengkak (*code bloat*).
2. **False Positive & Fragility:** Regex nama produk spesifik rentan merusak teks produk lain yang memiliki potongan kata serupa.
3. **Pemisahan Peran (*Separation of Concerns*):**
   * **Parser Struk:** Bertanggung jawab atas **struktur sintaksis** (kolom harga, qty, subtotal, diskon, baris total, tanggal).
   * **Katalog & Kamus Produk:** Bertanggung jawab atas **makna leksikal** (nama barang yang benar). Kamus ini harus hidup di database dinamis, bukan di dalam kode logika parser.

---

## 2. Arsitektur 3 Pilar "Self-Learning Receipt Scanner"

```
┌────────────────────────────────────────────────────────┐
│ Foto Struk (Natural / High Contrast Canvas)            │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ 1. Generic Structural Parser (receiptParser.js)        │
│    - Ekstraksi Baris, Qty x @Harga, Diskon, Total      │
│    - Normalisasi Tipografi Angka & Satuan Umum         │
│      (S00ML -> 500ML, 2pcg -> 2pcs, f°. -> Rp.)        │
│    - TANPA regex merek spesifik sama sekali            │
└───────────────────────────┬────────────────────────────┘
                            │ Hasil OCR mentah (misal "Straub...")
                            ▼
┌────────────────────────────────────────────────────────┐
│ 2. Local Fuzzy Matcher (fuzzyMatcher.js)               │
│    - Dice Coefficient / Levenshtein Distance (Native)  │
│    - Mencocokkan teks OCR mentah dengan riwayat item   │
│      dari tabel `transaction_items` di Dexie.js        │
│    - Jika Similarity >= 75%, auto-suggest / normalkan │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ 3. Assistive UI & Self-Learning Feedback Loop          │
│    (ReceiptScannerModal.svelte)                        │
│    - Pengguna memeriksa & dapat mengedit dalam 1 klik  │
│    - Saat Transaksi Disimpan: Nama baru otomatis masuk │
│      ke Dexie.js -> scanner makin pintar di pemakaian  │
│      berikutnya tanpa perlu update kode!               │
└────────────────────────────────────────────────────────┘
```

---

### Pilar 1: Generic Structural & Typographic Heuristics
Menjaga aturan generik universal yang independen dari merek dagang apa pun:
* **Tipografi Karakter-Angka:**
  * Huruf `O/o` di tengah/akhir angka $\rightarrow$ `0`
  * Huruf `l/I` di awal angka ribuan $\rightarrow$ `1`
  * Angka terbalik pada volume: `S00ML` $\rightarrow$ `500ML`
  * Typo akhiran kuantitas: `pcg/pca/pcq` $\rightarrow$ `pcs`
  * Artefak simbol mata uang thermal: `f°.` / `fp` / `r°` $\rightarrow$ `Rp.`
* **Kalkulasi & Rekonsiliasi Matematika:**
  * Prioritaskan `Qty × HargaSatuan` untuk mengeliminasi salah baca digit tepi kanan printer.
  * Deteksi artefak titik dua thermal pada total (`: 9.200` terbaca `19.200`).
* **Hapus Seluruh Brand Regex:**
  * Hapus: `MR. BREAD`, `Strawberry Cheesecake`, `Jasmine Boom`, dll.

---

### Pilar 2: Local Fuzzy Matching Engine (`src/lib/utils/fuzzyMatcher.js`)
Pencocokan string cerdas offline menggunakan algoritma **Sørensen–Dice Coefficient (Bigram Matching)** yang sangat cepat ($O(N)$) dan akurat untuk typo OCR.

#### Formula Dice Coefficient:
$$\text{Similarity}(S_1, S_2) = \frac{2 \times |B(S_1) \cap B(S_2)|}{|B(S_1)| + |B(S_2)|}$$

* Contoh:
  * $S_1$ (Hasil OCR): `"7 Straub BI"`
  * $S_2$ (Riwayat Database): `"Strawberry Cheesecake"`
  * Bigram overlap mendeteksi kecocokan tinggi tanpa terpengaruh simbol noise tanda kurung atau spasi ganda.
* Nilai ambang batas (*threshold*): $\ge 0.70$ ($70\%$).

---

### Pilar 3: Self-Learning Feedback Loop di UI
1. Saat modal scanner terbuka, sistem mengambil daftar nama unik produk dari `db.transaction_items.toArray()`.
2. Setiap nama barang hasil ekstraksi OCR diuji ke `findBestFuzzyMatch(ocrItemName, pastItemsList)`.
3. Jika kecocokan $\ge 70\%$, ganti otomatis dengan nama resmi dari database dan beri tanda visual *(Auto-matched)*.
4. Jika tidak ada kecocokan, tampilkan hasil OCR asli.
5. Saat pengguna menekan tombol simpan, nama item yang tersimpan di transaksi langsung menjadi "kamus baru" untuk pemindaian berikutnya.

---

## 3. Rencana File & Komponen

1. **`src/lib/utils/fuzzyMatcher.js` (Baru):**
   * Fungsi `calculateDiceSimilarity(str1, str2)`.
   * Fungsi `findBestFuzzyMatch(candidate, referenceList, threshold = 0.70)`.
2. **`src/lib/parsers/receiptParser.js` (Refactor):**
   * Bersihkan semua regex nama produk spesifik (line 527–589).
   * Pertahankan normalisasi angka/satuan/diskon generik.
3. **`src/components/ReceiptScannerModal.svelte` (Update):**
   * Integrasikan riwayat nama item dari Dexie.js ke proses pemindaian.
   * Tambahkan indikator visual jika nama item berhasil dinormalkan via riwayat.

