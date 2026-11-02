# Tracker Progress & Panduan Prompt Hemat Token
> **Acuan Utama:** [PRD.md](./PRD.md)  
> **Status Saat Ini:** `50% (Modul 1A & Modul 1B Selesai — Siap Eksekusi Modul 1C)`  
> **Update Terakhir:** 2 November 2026

---

## 1. Strategi Eksekusi Hemat Token & Hasil Maksimal

Jika **Fase 1** dikerjakan sekaligus dalam **1 chat panjang**, riwayat percakapan (*context window*) akan membengkak di tengah jalan. Akibatnya:
1. **Boros Token:** Setiap balasan baru akan membaca ulang seluruh kode dari awal chat.
2. **Kualitas Turun:** AI cenderung menyingkat kode (`// ... kode lainnya`) ketika tugas dalam 1 prompt terlalu banyak.

### Rekomendasi Terbaik: **"Sistem Modular (1 Modul = 1 Chat Baru) + State File"**
Kita membagi keseluruhan proyek menjadi **5 Sesi Chat Terfokus** (Fase 1 dibagi menjadi 3 modul kecil: **1A, 1B, 1C**, lalu **Fase 2**, dan **Fase 3**).

**Aturan Emas Hemat Token:**
- Selalu mulai **Chat Baru** (atau gunakan `/compact`) setiap pindah Modul.
- Di awal chat baru, cukup lampirkan `@PRD.md` dan `@PROGRESS.md` (jangan copy-paste teks panjang).
- Minta AI langsung eksekusi tanpa penjelasan teori panjang, dan wajib meng-update checklist di `PROGRESS.md` setiap selesai 1 modul.

---

## 2. Status Progress Keseluruhan

### Status Saat Ini
- [x] Perancangan Arsitektur & Pemilihan Tech Stack (`Svelte 5 + Vite + Tailwind CSS + Dexie.js`)
- [x] Pembuatan Dokumen Spesifikasi [PRD.md](./PRD.md)
- [x] Pembuatan Dokumen Tracker & Prompt [PROGRESS.md](./PROGRESS.md)
- [x] **Modul 1A:** Pondasi Project, Database Dexie.js, Multi-Workspace (`Pribadi`, `Usaha`, `Kopdes`), Form CRUD Utama & Reimburse
- [x] **Modul 1B:** Smart Input (Voice-to-Text Parser Bahasa Indonesia & Kamera Kompresi WebP + OCR Struk)
- [ ] **Modul 1C:** Laporan, Export CSV/Excel, Backup JSON Terenkripsi (WebCrypto), PIN Lock & PWA Offline Manifest
- [ ] **Fase 2:** Integrasi Sinkronisasi Database Online (Supabase Delta Sync)
- [ ] **Fase 3:** Backend API Go (Golang) untuk Home Server (Intel Celeron, RAM 4GB, SSD 128GB)

---

## 3. Rincian Modul & Template Prompt Siap Pakai

Gunakan prompt di bawah ini satu per satu pada setiap sesi pengerjaan.

---

### MODUL 1A: Pondasi, Database Lokal & Core CRUD Multi-Workspace
**Target Sesi Ini:** Aplikasi sudah bisa jalan di browser, pindah-pindah buku (`Pribadi`, `Usaha`, `Kopdes`), kelola Dompet & Kategori, input transaksi manual dengan kalkulator nominal, fitur Dana Talangan/Reimburse, dan tampilan responsif (HP Card View & Desktop Table View).

#### Checklist Modul 1A:
- [x] Inisialisasi project `Svelte 5 + Vite + Tailwind CSS` di direktori workspace.
- [x] Setup `src/lib/db.js` (Dexie.js) sesuai skema Bagian 5 `PRD.md` + Seed data awal (`workspaces`, `accounts`, `categories` untuk Pribadi, Usaha, dan Kopdes).
- [x] Utilitas `UUID v7`, format Rupiah (`Intl.NumberFormat`), dan evaluasi matematika nominal (`25000+15000`).
- [x] Header `WorkspaceSwitcher` (`Pribadi` | `Usaha` | `Kopdes`) dengan tema warna solid per buku kas (Indigo, Teal, Emerald — tanpa gradient) + Hero Balance Card & Mini Wallet Cards.
- [x] Komponen `TransactionForm` (Form CRUD Utama) dengan input nominal auto-format ribuan, tombol pecahan cepat (`+10rb`, `+50rb`, `+100rb`), kalkulator mini, Smart Picker Dompet/Kategori hemat ruang, atribut khusus Kopdes (`unit_usaha`, `no_bukti`, `pic_pihak`), dan toggle Dana Talangan/Reimburse.
- [x] Daftar Transaksi Adaptif: Card list di Mobile (`<768px`) & Tabel Spreadsheet di Desktop (`>=768px`) dengan font `Plus Jakarta Sans` + `tabular-nums`.
- [x] Halaman/Modal kelola Akun (Dompet) & Kategori per Workspace (mendukung tampilan Card khusus layar kecil iPhone SE & Tabel di Desktop).

#### 📋 Prompt Modul 1A (Copy & Paste untuk Mulai Eksekusi):
```text
Acuan kita adalah @PRD.md dan @PROGRESS.md.
Kerjakan MODUL 1A secara tuntas:
1. Inisialisasi project Svelte 5 + Vite + Tailwind CSS + Dexie.js di folder ini.
2. Buat database Dexie.js sesuai skema Bagian 5 PRD.md beserta data awal (seed) untuk buku Pribadi, Usaha, dan Kopdes.
3. Bangun UI utama dengan prinsip desain Bagian 2 PRD.md (anti AI-slop, font angka tabular-nums, kontras tegas, zero fluff, responsif Mobile Card & Desktop Table).
4. Buat fitur pindah Workspace, Form CRUD Utama (Create, Edit, Soft-Delete, Kalkulator di kolom nominal, atribut khusus Kopdes, dan logika Dana Talangan/Reimburse), serta manajemen Dompet/Kategori.
5. Pastikan build berjalan tanpa error, lalu centang checklist Modul 1A di @PROGRESS.md. Buat penjelasan akhir sesingkat mungkin.
```

---

### MODUL 1B: Smart Input (Voice-to-Text & Foto Struk OCR)
**Target Sesi Ini:** Menambahkan 2 jalur input pintar yang langsung mengisi Form CRUD Utama dari Modul 1A.

#### Checklist Modul 1B:
- [x] Parser kalimat Bahasa Indonesia (`src/lib/parsers/voiceParser.js`): Konversi teks angka/terbilang (*"seratus lima puluh ribu"*, *"150rb"*, *"2,5 juta"*), deteksi tipe pemasukan/pengeluaran, deteksi kategori/workspace, dan catatan.
- [x] Komponen `VoiceInputModal` menggunakan `Web Speech API (id-ID)` + fallback ketik kalimat cepat $\rightarrow$ hasil langsung mengisi `TransactionForm`.
- [x] Utilitas kompresi gambar (`src/lib/utils/imageCompressor.js`) menggunakan `<canvas>` ke format **WebP < 80 KB** (maks 1000px) + mode *High-Contrast* + toggle *"Jangan simpan foto"*.
- [x] Ekstraksi teks struk (OCR) & Regex Parser (`src/lib/parsers/receiptParser.js`) untuk membedakan metadata nota (`No. Nota`, `Kasir`, `Waktu`) vs daftar produk, mendeteksi Nominal Total, Tanggal, Nama Toko, serta tampilan adaptif **List Produk (Checklist Interaktif)** vs **Single Total** di `ReceiptScannerModal.svelte` $\rightarrow$ langsung mengisi `TransactionForm`.
- [x] Indikator & Preview lampiran foto struk WebP beserta tabel rincian produk (`metadata.items`) pada daftar & detail transaksi (`ReceiptPreviewModal.svelte`).

#### 📋 Prompt Modul 1B (Gunakan di Chat Baru setelah 1A selesai):
```text
Acuan kita adalah @PRD.md dan @PROGRESS.md. Modul 1A sudah selesai.
Sekarang kerjakan MODUL 1B secara tuntas:
1. Buat Smart Voice-to-Text (Web Speech API id-ID + Natural Language Rule-Based Parser Bahasa Indonesia untuk nominal ribuan/jutaan, tipe, kategori, dan catatan) yang langsung mengisi Form CRUD Utama.
2. Buat fitur Input Foto Struk/Nota: kompresi otomatis via Canvas ke WebP (<80KB, max 1000px), opsi tanpa simpan gambar, serta OCR & Regex Parser (deteksi Total, Tanggal, Toko) yang langsung mengisi Form CRUD Utama.
3. Tampilkan indikator & preview lampiran struk di daftar/detail transaksi.
4. Uji coba dan update checklist Modul 1B di @PROGRESS.md. Jawab dengan ringkas.
```

---

### MODUL 1C: Laporan, Export, Backup Terenkripsi & Offline PWA
**Target Sesi Ini:** Melengkapi fitur manajerial Kopdes/Usaha/Pribadi, keamanan lokal, dan konfigurasi PWA agar bisa di-install di HP & Laptop secara offline penuh.

#### Checklist Modul 1C:
- [ ] Filter transaksi lanjutan (Rentang Tanggal, Kategori, Akun, Unit Usaha Kopdes, Status Reimburse, dan Pencarian Kata Kunci/No. Bukti).
- [ ] Ringkasan Laporan Arus Kas per Kategori & per Unit Usaha Kopdes.
- [ ] Fitur Export ke **CSV / Excel-ready** (dengan format kolom rapi untuk laporan pertanggungjawaban Kopdes).
- [ ] Fitur Backup & Restore Database penuh (`.json`) dengan opsi enkripsi password menggunakan **WebCrypto API (`AES-GCM 256-bit`)**.
- [ ] Fitur Keamanan Lokal: **PIN Lock 6 Digit** saat membuka aplikasi + Strict Content Security Policy (CSP) di `index.html`.
- [ ] Konfigurasi `vite-plugin-pwa` (Service Worker & Web Manifest) agar bekerja 100% offline dan bisa di-install di HP/Desktop.

#### 📋 Prompt Modul 1C (Gunakan di Chat Baru setelah 1B selesai):
```text
Acuan kita adalah @PRD.md dan @PROGRESS.md. Modul 1A dan 1B sudah selesai.
Sekarang kerjakan MODUL 1C secara tuntas:
1. Buat fitur Filter Lanjutan & Rekap Laporan (termasuk rekap per Unit Usaha Kopdes dan daftar Reimburse).
2. Buat fitur Export CSV/Excel-ready untuk transaksi dan laporan Kopdes.
3. Buat fitur Backup & Restore JSON dengan enkripsi WebCrypto API (AES-GCM 256-bit) serta fitur App PIN Lock 6 digit dan Strict CSP di index.html.
4. Pasang dan konfigurasi PWA (Service Worker & Manifest) agar aplikasi 100% berjalan offline dan bisa di-install.
5. Pastikan build production (`npm run build`) sukses tanpa error, lalu update checklist Modul 1C di @PROGRESS.md. Jawab dengan ringkas.
```

---

### FASE 2: Integrasi Sinkronisasi Online (Supabase)
**Target Sesi Ini:** Menghubungkan aplikasi offline ke database PostgreSQL Supabase menggunakan sistem antrean sinkronisasi hemat kuota (*Delta Sync*).

#### Checklist Fase 2:
- [ ] File SQL Migration (`supabase/schema.sql`) berisi tabel PostgreSQL + kebijakan Row Level Security (RLS).
- [ ] Implementasi `SyncEngine` & `SupabaseAdapter`: hanya mengirim data `sync_status = 'pending'` dan menarik data berdasarkan `updated_at` terakhir.
- [ ] Halaman Pengaturan Sync (Input Supabase URL, Anon Key, Login Auth, tombol Sync Manual & Auto-Sync saat online).

#### 📋 Prompt Fase 2:
```text
Acuan kita adalah @PRD.md dan @PROGRESS.md. Fase 1 (Offline PWA) sudah selesai.
Sekarang kerjakan FASE 2 (Supabase Sync):
1. Buatkan file SQL skema PostgreSQL + RLS di `supabase/schema.sql` yang cocok 1:1 dengan skema Dexie.js kita.
2. Buat Sync Engine & SupabaseAdapter dengan metode Delta Sync (`sync_status = 'pending'` dan `updated_at`) tanpa merusak fungsi offline-first.
3. Tambahkan menu Pengaturan Sinkronisasi & indikator status sync di header.
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

