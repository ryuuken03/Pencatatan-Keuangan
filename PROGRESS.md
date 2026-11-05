# Tracker Progress & Panduan Prompt Hemat Token
> **Acuan Utama:** [PRD.md](./PRD.md) & [GEMINI.md](./GEMINI.md)  
> **Status Saat Ini:** `90% (Fase 1 & Fase 2 Selesai 100% — Siap Eksekusi Fase 3)`  
> **Update Terakhir:** 5 November 2026

---

## 1. Strategi Eksekusi Hemat Token & Hasil Maksimal

Proyek ini telah dilengkapi dengan **Workspace Rules Otomatis** di [`GEMINI.md`](./GEMINI.md) dan [`.agents/rules/anti-ai-slop.md`](./.agents/rules/anti-ai-slop.md). Dengan demikian, setiap kali Anda membuka sesi/chat baru:
- Prinsip desain **Anti AI-Slop**, **Tipografi `tabular-nums`**, **Warna Solid Multi-Workspace**, **Bottom Navbar Mobile**, serta **Aturan Skema Database & Excel `.xlsx`** langsung aktif secara otomatis tanpa perlu dijelaskan ulang di prompt.

**Aturan Emas Hemat Token:**
- Selalu mulai **Chat Baru** (atau gunakan `/compact`) setiap pindah Fase/Modul.
- Cukup lampirkan `@PRD.md` dan `@PROGRESS.md` saat memulai Fase berikutnya.
- Minta AI langsung eksekusi dan meng-update checklist di `PROGRESS.md` setiap selesai 1 modul.

---

## 2. Status Progress Keseluruhan

### Status Saat Ini
- [x] Perancangan Arsitektur & Pemilihan Tech Stack (`Svelte 5 + Vite + Tailwind CSS + Dexie.js`)
- [x] Pembuatan Dokumen Spesifikasi [PRD.md](./PRD.md) & Rules Permanen [GEMINI.md](./GEMINI.md)
- [x] Pembuatan Dokumen Tracker & Prompt [PROGRESS.md](./PROGRESS.md)
- [x] **Modul 1A:** Pondasi Project, Database Dexie.js, Dynamic Multi-Workspace (`Buku Pribadi` default tunggal, penambahan manual `Buku Usaha` & `Buku Pekerjaan` dengan nama kustom), Form CRUD Utama & Reimburse
- [x] **Modul 1B:** Smart Input (Voice-to-Text Parser Bahasa Indonesia & Kamera Kompresi WebP + OCR Struk Mandiri Self-Learning Typo Bigram Matcher & Editor Instan)
- [x] **Modul 1C:** Laporan Rekapitulasi, Export & Import Excel (`.xlsx`), Backup JSON Terenkripsi (WebCrypto `AES-GCM 256-bit`), PIN Lock 6 Digit, Mobile Bottom Navbar & PWA Offline Manifest
- [x] **Fase 2:** Integrasi Sinkronisasi Database Online (Supabase Delta Sync & RLS)
- [ ] **Fase 2.5 (Optimasi Kinerja & DX Maintainability):**
  - [x] P1: Code-Splitting, Lazy-Loading Modals & Bundle Optimization (Eliminasi Monolith > 500 kB)
  - [ ] P2: Modularisasi Komponen Raksasa (`TransactionForm`, `TransactionList`, `db.js`)
  - [ ] P3: Setup Vitest & Unit Test Logika Akuntansi & Parser Inti
  - [ ] P4: Type Definition (`src/types.d.ts`) & Developer Autocomplete (DX)
  - [ ] P5: Optimasi Memori Blob Gambar di IndexedDB & Adaptive Sync Polling
- [ ] **Fase 3:** Backend API Go (Golang) untuk Home Server (Intel Celeron, RAM 4GB, SSD 128GB)

---

## 3. Rincian Modul & Template Prompt Siap Pakai

Gunakan prompt di bawah ini satu per satu pada setiap sesi pengerjaan.

---

### MODUL 1A: Pondasi, Database Lokal & Core CRUD Multi-Workspace (SELESAI)
**Target Sesi Ini:** Aplikasi jalan di browser, pindah-pindah buku (`Pribadi`, `Usaha`, `Kopdes`), kelola Dompet & Kategori, input transaksi manual dengan kalkulator nominal, fitur Dana Talangan/Reimburse, dan tampilan responsif (HP Card View & Desktop Table View).

#### Checklist Modul 1A:
- [x] Inisialisasi project `Svelte 5 + Vite + Tailwind CSS` di direktori workspace.
- [x] Setup `src/lib/db.js` (Dexie.js) sesuai skema Bagian 5 `PRD.md` + Seed data awal ber-ID UUID v7 deterministik (`workspaces`, `accounts` dengan saldo awal seluruh kas `Rp 0`, serta `categories` untuk Pribadi, Usaha, dan Kopdes) dan tabel terpisah `transaction_items` (0..N item produk per transaksi).
- [x] Utilitas `UUID v7`, format Rupiah (`Intl.NumberFormat`), dan evaluasi matematika nominal (`25000+15000`).
- [x] Header `WorkspaceSwitcher` (`Pribadi` | `Usaha` | `Kopdes`) dengan tema warna solid per buku kas (Indigo, Teal, Emerald — tanpa gradient) + Hero Balance Card (dengan modal *Lihat Detail* saldo dompet) & Kartu Metrik.
- [x] Komponen `TransactionForm` (Form CRUD Utama) dengan input nominal auto-format ribuan, tombol pecahan cepat (`+10rb`, `+50rb`, `+100rb`), kalkulator mini, Smart Picker Dompet/Kategori hemat ruang, atribut khusus Kopdes (`unit_usaha`, `no_bukti`, `pic_pihak`), dan toggle Dana Talangan/Reimburse.
- [x] Daftar Transaksi Adaptif: Swipeable Card list harian di Mobile (`<768px`, slide kanan/kiri untuk Edit & Hapus) & Tabel Spreadsheet di Desktop (`>=768px`) dengan font `Plus Jakarta Sans` + `tabular-nums`.
- [x] Halaman/Modal kelola Akun (Dompet) & Kategori per Workspace (mendukung tampilan Card khusus layar kecil iPhone SE & Tabel di Desktop).

---

### MODUL 1B: Smart Input — Voice-to-Text & Foto Struk OCR (SELESAI)
**Target Sesi Ini:** Menambahkan 2 jalur input pintar yang langsung mengisi Form CRUD Utama dari Modul 1A.

#### Checklist Modul 1B:
- [x] Parser kalimat Bahasa Indonesia (`src/lib/parsers/voiceParser.js`): Konversi teks angka/terbilang (*"seratus lima puluh ribu"*, *"150rb"*, *"2,5 juta"*), deteksi tipe pemasukan/pengeluaran, deteksi kategori/workspace, dan catatan.
- [x] Komponen `VoiceInputModal` menggunakan `Web Speech API (id-ID)` + fallback ketik kalimat cepat $\rightarrow$ hasil langsung mengisi `TransactionForm`.
- [x] Utilitas kompresi gambar (`src/lib/utils/imageCompressor.js`) menggunakan `<canvas>` ke format **WebP < 80 KB** (maks 1000px) + mode *High-Contrast* + toggle *"Jangan simpan foto"*.
- [x] Ekstraksi teks struk (OCR) & Regex Parser (`src/lib/parsers/receiptParser.js`) untuk membedakan metadata nota (`No. Nota`, `Kasir`, `Waktu`) vs daftar produk, mendeteksi Nominal Total, Tanggal, Nama Toko, serta tampilan adaptif **List Produk (Checklist Interaktif)** vs **Single Total** di `ReceiptScannerModal.svelte` $\rightarrow$ langsung mengisi `TransactionForm`.
- [x] Indikator & Preview lampiran foto struk WebP beserta tabel rincian produk (`transaction_items`) pada daftar & detail transaksi (`ReceiptPreviewModal.svelte`).
- [x] Self-Learning Receipt Scanner (`docs/SMART_RECEIPT_LEARNING_DESIGN.md`): seluruh regex nama produk/merek dihapus dari `receiptParser.js` (parser murni heuristik struktural + `normalizeItemNameTypography`). Dilengkapi tabel Dexie v3 `item_aliases` (kapasitas tetap maks 2000 alias tanpa auto-delete berbasis umur) + fuzzy Sørensen–Dice native (`src/lib/utils/fuzzyMatcher.js`), pencegahan memory leak (cleanup index saat modal tutup), serta antarmuka edit langsung (nama & harga produk, tanggal, dompet, kategori) dan tombol simpan transaksi instan di `ReceiptScannerModal.svelte`.

---

### MODUL 1C: Laporan, Export/Import Excel (`.xlsx`), Backup Terenkripsi & Offline PWA (SELESAI)
**Target Sesi Ini:** Melengkapi fitur manajerial Kopdes/Usaha/Pribadi, ergonomi Mobile Bottom Navbar, keamanan lokal, dan konfigurasi PWA agar bisa di-install di HP & Laptop secara offline penuh.

#### Checklist Modul 1C:
- [x] Filter transaksi lanjutan (Rentang Tanggal, Kategori, Akun, Unit Usaha Kopdes, Status Reimburse, dan Pencarian Kata Kunci/No. Bukti).
- [x] Ringkasan Laporan Arus Kas per Kategori, per Unit Usaha Kopdes, dan Daftar Reimburse (`ReportExportModal.svelte`).
- [x] Fitur **Export & Import Excel (`.xlsx` Multi-Sheet)** menggunakan engine native (`src/lib/utils/xlsxEngine.js`) dengan lebar kolom otomatis dan format angka `#,##0` untuk laporan pertanggungjawaban Kopdes/Usaha/Pribadi.
- [x] Fitur Backup & Restore Database penuh (`.json`) dengan opsi enkripsi password menggunakan **WebCrypto API (`PBKDF2-SHA256` + `AES-GCM 256-bit`)** serta fitur *Database Compaction* (`SecurityBackupModal.svelte`).
- [x] Fitur Keamanan Lokal: **PIN Lock 6 Digit** (`PinLockScreen.svelte`) saat membuka aplikasi + Strict Content Security Policy (CSP) di `index.html`.
- [x] Navigasi Mobile Ergonomis (`MobileBottomNav.svelte` + Top Toolbar `Buku Kas`): 3 tab utama dengan ikon di atas & teks di bawah (`WorkspaceSwitcher`, `Catat Transaksi`, `Pengaturan`).
- [x] Konfigurasi `vite-plugin-pwa` (Service Worker & Web Manifest) agar bekerja 100% offline dan bisa di-install di HP/Desktop.

---

### FASE 2: Integrasi Sinkronisasi Online (Supabase) (SELESAI)
**Target Sesi Ini:** Menghubungkan aplikasi offline ke database PostgreSQL Supabase menggunakan sistem antrean sinkronisasi hemat kuota (*Delta Sync*).

#### Checklist Fase 2:
- [x] File SQL Migration (`supabase/schema.sql`) berisi tabel PostgreSQL (`workspaces`, `accounts`, `categories`, `transactions`, `transaction_items`) + kebijakan Row Level Security (RLS).
- [x] Implementasi `SyncEngine` & `SupabaseAdapter`: hanya mengirim data `sync_status = 'pending'` dan menarik data berdasarkan `updated_at` terakhir (Delta Sync).
- [x] Modal Pengaturan Sync (`SyncSettingsModal.svelte`: Konfigurasi otomatis via `.env`, alur pendaftaran hemat kuota tanpa konfirmasi email, tampilan bersih hanya Logout & Sinkronisasi saat sesi aktif) serta indikator status sync di Header Desktop & Mobile.
- [x] Anti-duplikat Dompet/Kategori lintas perangkat: seed default ber-ID UUID v7 deterministik (saldo awal seluruh kas default `Rp 0`), urutan sync Pull → Dedupe → Push, merge duplikat (`merged_into`) + remap referensi transaksi, cursor sync per user, paginasi pull > 1000 baris (migrasi `supabase/migrations/20261103_merged_into.sql`).
- [x] Auto-Sync Dua Arah (Push Offline $\rightarrow$ Online & Pull Online $\rightarrow$ Offline): deteksi otomatis perubahan lokal via Dexie `liveQuery` (debounce 2 detik), re-sync otomatis saat kembali online (`window.online`), saat login, saat pindah tab (`visibilitychange`), dan polling berkala 30 detik dengan auto-refresh UI reaktif.

#### 📋 Prompt Fase 2:
```text
Acuan kita adalah @PRD.md dan @PROGRESS.md. Fase 1 (Offline PWA) sudah selesai.
Sekarang kerjakan FASE 2 (Supabase Sync):
1. Buatkan file SQL skema PostgreSQL + RLS di `supabase/schema.sql` yang cocok 1:1 dengan skema Dexie.js v2 kita (termasuk tabel `transaction_items`).
2. Buat Sync Engine & SupabaseAdapter dengan metode Delta Sync (`sync_status = 'pending'` dan `updated_at`) tanpa merusak fungsi offline-first.
3. Tambahkan menu Pengaturan Sinkronisasi & indikator status sync di header/pengaturan.
4. Update checklist Fase 2 di @PROGRESS.md.
```

---

### FASE 2.5: Optimasi Kinerja, Refactoring Arsitektur & DX (Maintainability)

---

#### PRIORITAS 1 (P1): Code-Splitting & Bundle Optimization (< 500 kB)
**Target Sesi Ini:** Menghilangkan warning chunk Vite (> 500 kB), menerapkan lazy-loading modal berat (`ReportExportModal`, `ReceiptScannerModal`, `SecurityBackupModal`, `SyncSettingsModal`, `VoiceInputModal`) dan chunking terpisah untuk `xlsxEngine.js` serta `receiptParser.js`.

##### Checklist P1:
- [x] Konfigurasi `manualChunks` di `vite.config.js` untuk memecah vendor dan modul berat (`xlsxEngine.js`, `receiptParser.js`, `cryptoBackup.js`, `vendor-dexie`).
- [x] Implementasi dynamic import / lazy load pada modal-modal non-kritis di `src/App.svelte` (hanya dimuat saat tombol modal ditekan pengguna: `ReportExportModal`, `ReceiptScannerModal`, `SecurityBackupModal`, `SyncSettingsModal`, `VoiceInputModal`).
- [x] Verifikasi `npm run build` sukses tanpa warning chunk > 500 kB dan periksa bundle size reduction (Entry chunk turun dari 508.07 kB ke 202.76 kB, reduksi 60%, PWA precache 21 entri 100% offline).

##### 📋 Prompt Siap Pakai — P1 (Chat Baru):
```text
Acuan kita adalah @PRD.md, @GEMINI.md, dan @PROGRESS.md.
Kerjakan FASE 2.5 PRIORITAS 1 (P1: Code-Splitting & Bundle Optimization):
1. Konfigurasikan `manualChunks` pada `vite.config.js` dan terapkan lazy-loading (dynamic import) di `src/App.svelte` untuk modal berat (`ReportExportModal`, `ReceiptScannerModal`, `SecurityBackupModal`, `SyncSettingsModal`, `VoiceInputModal`).
2. Pastikan `xlsxEngine.js` dan `receiptParser.js` tidak ikut terbundle di entry chunk utama `index.js`.
3. Jalankan `npm run build` dan pastikan warning chunk > 500 kB hilang serta PWA tetap bekerja normal 100% offline.
4. Update checklist P1 di @PROGRESS.md.
```

---

#### PRIORITAS 2 (P2): Modularisasi Komponen Raksasa & Dekomposisi File
**Target Sesi Ini:** Memecah komponen raksasa (`TransactionForm.svelte` 1.370 baris & `TransactionList.svelte` 1.332 baris) dan `src/lib/db.js` (1.185 baris) menjadi modul-modul kecil yang kohesif agar mudah dipelihara dan dipahami developer lain.

##### Checklist P2:
- [x] Dekomposisi `TransactionForm.svelte` ke sub-komponen: `CalculatorKeypad.svelte`, `TransactionItemsTable.svelte`, dan `ReceiptAttachmentField.svelte`.
- [x] Dekomposisi `TransactionList.svelte` ke sub-komponen: `TransactionFilterDrawer.svelte`, `TransactionMobileCard.svelte` (isolasi touch swipe gestures), dan `TransactionDesktopTable.svelte`.
- [x] Refactor `src/lib/db.js` dengan memisahkan modul pembantu: `src/lib/db/balances.js` (`computeAccountBalances`), `src/lib/db/dedupe.js` (`planMerge`), dan `src/lib/db/seed.js`.
- [x] Verifikasi seluruh alur input, edit, swipe kartu, dan kalkulasi saldo tetap berfungsi presisi dan `npm run build` lolos.

##### 📋 Prompt Siap Pakai — P2 (Chat Baru):
```text
Acuan kita adalah @PRD.md, @GEMINI.md, dan @PROGRESS.md.
Kerjakan FASE 2.5 PRIORITAS 2 (P2: Modularisasi Komponen Raksasa):
1. Pecah `src/components/TransactionForm.svelte` menjadi sub-komponen terisolasi (`CalculatorKeypad.svelte`, `TransactionItemsTable.svelte`, `ReceiptAttachmentField.svelte`).
2. Pecah `src/components/TransactionList.svelte` menjadi `TransactionFilterDrawer.svelte`, `TransactionMobileCard.svelte`, dan `TransactionDesktopTable.svelte`.
3. Pindahkan kalkulasi saldo ke `src/lib/db/balances.js` dan deduplikasi ke `src/lib/db/dedupe.js` tanpa merusak export backward-compatibility di `src/lib/db.js`.
4. Jalankan `npm run build` untuk memastikan tidak ada broken props / imports dan update checklist P2 di @PROGRESS.md.
```

---

#### PRIORITAS 3 (P3): Automated Testing (Vitest) Logika Akuntansi & Core Utils
**Target Sesi Ini:** Memasang test runner `vitest` dan membuat unit test untuk fungsi-fungsi kritis (kalkulasi saldo dana talangan/reimburse, evaluasi matematika nominal, parser struk, dan integritas zip XLSX).

##### Checklist P3:
- [ ] Pasang `vitest` sebagai devDependencies dan buat script `"test": "vitest run"` di `package.json`.
- [ ] Buat unit test akuntansi `tests/balances.test.js`: pengujian saldo cross-workspace, reimbursement pending vs settled, dan transfer dompet.
- [ ] Buat unit test `tests/utils.test.js`: pengujian `evaluateNominalExpression`, `formatIDR`, `uuidv7`, dan `deterministicUuidV7`.
- [ ] Buat unit test `tests/xlsxEngine.test.js`: validasi integritas zip header dan sheet XML generation.
- [ ] Jalankan `npm run test` dan `npm run build` hingga seluruh test suites berstatus hijau (PASS).

##### 📋 Prompt Siap Pakai — P3 (Chat Baru):
```text
Acuan kita adalah @PRD.md, @GEMINI.md, dan @PROGRESS.md.
Kerjakan FASE 2.5 PRIORITAS 3 (P3: Automated Testing dengan Vitest):
1. Pasang `vitest` di devDependencies dan tambahkan script npm `test`.
2. Tulis automated unit test untuk logika krusial di folder `tests/`:
   - `balances.test.js`: kalkulasi saldo akun termasuk reimbursement lintas buku (Pribadi -> Kopdes/Usaha) status pending & settled.
   - `utils.test.js`: evaluasi nominal kalkulator, format Rupiah, dan deterministik UUID v7.
   - `xlsxEngine.test.js`: verifikasi generator ZIP OOXML native tidak menghasilkan file corrupt.
3. Jalankan `npm run test` dan pastikan seluruh test 100% lolos (PASS).
4. Update checklist P3 di @PROGRESS.md.
```

---

#### PRIORITAS 4 (P4): Type Safety Contract (`src/types.d.ts`) & Code Documentation
**Target Sesi Ini:** Menyediakan file definisi tipe TypeScript / JSDoc (`src/types.d.ts`) terpusat untuk seluruh entitas database dan event modal agar developer lain mendapatkan autocomplete presisi di editor.

##### Checklist P4:
- [ ] Buat berkas `src/types.d.ts` berisi tipe lengkap: `Workspace`, `Account`, `Category`, `Transaction`, `TransactionItem`, `ItemAlias`, `TransactionMetadata`, dan `SyncState`.
- [ ] Beri JSDoc type annotation pada fungsi-fungsi publik di `src/lib/db.js`, `src/lib/utils.js`, dan adapter sync.
- [ ] Verifikasi tidak ada error linting dan `npm run build` tetap bersih.

##### 📋 Prompt Siap Pakai — P4 (Chat Baru):
```text
Acuan kita adalah @PRD.md, @GEMINI.md, dan @PROGRESS.md.
Kerjakan FASE 2.5 PRIORITAS 4 (P4: Type Safety & JSDoc Definition):
1. Buatkan berkas `src/types.d.ts` yang mendefinisikan seluruh struktur schema data Dexie.js (Workspaces, Accounts, Categories, Transactions, TransactionItems, ItemAliases) lengkap dengan atribut `metadata` (reimburse, unit_usaha, no_bukti).
2. Tambahkan JSDoc `@type` & `@param` pada modul database dan utils utama untuk memberikan DX autocomplete maksimal bagi developer lain.
3. Jalankan `npm run build` dan update checklist P4 di @PROGRESS.md.
```

---

#### PRIORITAS 5 (P5): Optimasi Memori Blob Gambar di IndexedDB & Adaptive Sync Polling
**Target Sesi Ini:** Mengurangi konsumsi RAM IndexedDB dengan memisahkan pemuatan blob foto struk dari query list transaksi harian, serta menerapkan adaptive throttling pada interval sync.

##### Checklist P5:
- [ ] Modifikasi `loadAppData()` di `src/lib/db.js` agar tidak me-load `attachment_blob` secara massal (hanya load metadata `has_attachment: Boolean`).
- [ ] Buat helper `getTransactionAttachment(txId)` untuk memuat blob hanya ketika `ReceiptPreviewModal` dibuka atau saat struk sedang diedit.
- [ ] Terapkan interval sync adaptif di `src/lib/sync/syncEngine.js` (tingkatkan interval dari 30s ke 60s atau gunakan backoff saat tidak ada perubahan).
- [ ] Verifikasi memory footprint berkurang dan `npm run build` sukses.

##### 📋 Prompt Siap Pakai — P5 (Chat Baru):
```text
Acuan kita adalah @PRD.md, @GEMINI.md, dan @PROGRESS.md.
Kerjakan FASE 2.5 PRIORITAS 5 (P5: Database Memory & Sync Throttling):
1. Optimalkan `loadAppData()` agar tidak menarik kolom `attachment_blob` ke RAM secara massal saat menampilkan daftar transaksi; sediakan pemanggilan lazy `getTransactionAttachment(txId)` khusus saat modal preview struk dibuka.
2. Perbarui interval polling `syncEngine.js` menjadi lebih hemat daya (60 detik dengan adaptive backoff saat idle) tanpa mengurangi reaktivitas online event.
3. Jalankan `npm run build`, uji preview struk, dan update checklist P5 di @PROGRESS.md.
```

---

### FASE 3: Backend API Home Server (Intel Celeron, RAM 4GB, SSD 128GB)
**Target Sesi Ini:** Membuat server API mandiri super ringan menggunakan Go (Golang) agar bisa menggantikan Supabase di laptop home server.

#### Checklist Fase 3:
- [ ] Pembuatan folder `server/` dengan **Go (Golang)** + **SQLite (WAL Mode) / PostgreSQL**.
- [ ] Endpoint REST API untuk autentikasi, push/pull delta sync, dan penyimpanan blob struk WebP.
- [ ] Konfigurasi `systemd` service / Docker ringan (pemakaian RAM < 50 MB).
- [ ] Implementasi `HomeServerAdapter` di PWA agar bisa berpindah dari Supabase ke URL Home Server hanya dengan mengganti pengaturan.

#### 📋 Prompt Fase 3:
```text
Acuan kita adalah @PRD.md dan @PROGRESS.md.
Sekarang kerjakan FASE 3 (Home Server Backend untuk Intel Celeron RAM 4GB):
1. Buat backend REST API super ringan menggunakan Go (Golang) + SQLite (mode WAL) di folder `server/` untuk menangani Delta Sync dari PWA kita.
2. Tambahkan `HomeServerAdapter` di pengaturan PWA agar pengguna bisa memilih sumber sync: Offline Saja, Supabase, atau Home Server URL.
3. Sertakan panduan singkat cara menjalankan binary Go tersebut di Linux Server hemat RAM.
4. Update checklist Fase 3 di @PROGRESS.md.
```
