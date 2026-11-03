# Tracker Progress & Panduan Prompt Hemat Token
> **Acuan Utama:** [PRD.md](./PRD.md) & [GEMINI.md](./GEMINI.md)  
> **Status Saat Ini:** `90% (Fase 1 & Fase 2 Selesai 100% — Siap Eksekusi Fase 3)`  
> **Update Terakhir:** 3 November 2026

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
- [x] **Modul 1A:** Pondasi Project, Database Dexie.js, Multi-Workspace (`Pribadi`, `Usaha`, `Kopdes`), Form CRUD Utama & Reimburse
- [x] **Modul 1B:** Smart Input (Voice-to-Text Parser Bahasa Indonesia & Kamera Kompresi WebP + OCR Struk)
- [x] **Modul 1C:** Laporan Rekapitulasi, Export & Import Excel (`.xlsx`), Backup JSON Terenkripsi (WebCrypto `AES-GCM 256-bit`), PIN Lock 6 Digit, Mobile Bottom Navbar & PWA Offline Manifest
- [x] **Fase 2:** Integrasi Sinkronisasi Database Online (Supabase Delta Sync & RLS)
- [ ] **Fase 3:** Backend API Go (Golang) untuk Home Server (Intel Celeron, RAM 4GB, SSD 128GB)

---

## 3. Rincian Modul & Template Prompt Siap Pakai

Gunakan prompt di bawah ini satu per satu pada setiap sesi pengerjaan.

---

### MODUL 1A: Pondasi, Database Lokal & Core CRUD Multi-Workspace (SELESAI)
**Target Sesi Ini:** Aplikasi jalan di browser, pindah-pindah buku (`Pribadi`, `Usaha`, `Kopdes`), kelola Dompet & Kategori, input transaksi manual dengan kalkulator nominal, fitur Dana Talangan/Reimburse, dan tampilan responsif (HP Card View & Desktop Table View).

#### Checklist Modul 1A:
- [x] Inisialisasi project `Svelte 5 + Vite + Tailwind CSS` di direktori workspace.
- [x] Setup `src/lib/db.js` (Dexie.js) sesuai skema Bagian 5 `PRD.md` + Seed data awal (`workspaces`, `accounts`, `categories` untuk Pribadi, Usaha, dan Kopdes) serta tabel terpisah `transaction_items` (0..N item produk per transaksi).
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
