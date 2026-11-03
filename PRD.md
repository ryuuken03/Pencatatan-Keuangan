# Product Requirements Document (PRD)
## Aplikasi Pencatatan Keuangan Multi-Workspace (`Buku Kas` — Pribadi, Usaha, Kopdes)

| Informasi Dokumen | Detail |
| :--- | :--- |
| **Versi Dokumen** | 1.2 (Fase 1 & Fase 2 Selesai — Siap Fase 3) |
| **Tanggal Update** | 3 November 2026 |
| **Arsitektur Utama** | Offline-First PWA (Progressive Web App) |
| **Tech Stack Frontend** | Svelte 5 + Vite 6 + Tailwind CSS v4 + Dexie.js (IndexedDB) |
| **Aturan Permanen AI** | [`GEMINI.md`](./GEMINI.md) & [`.agents/rules/anti-ai-slop.md`](./.agents/rules/anti-ai-slop.md) |
| **Target Backend (Bertahap)** | Fase 1: Offline Lokal $\rightarrow$ Fase 2: Supabase (Selesai) $\rightarrow$ Fase 3: Home Server (Go + SQLite/Postgres) |

---

## 1. Tujuan Produk (Product Vision)
Membangun aplikasi pencatatan keuangan yang **sangat ringan, aman, responsif (HP & Laptop), dan bekerja 100% offline secara default**, dengan kemampuan memisahkan secara tegas pencatatan uang **Pribadi**, **Usaha**, dan **Kerja (Manager Kopdes)** tanpa tercampur, namun tetap mendukung transaksi silang seperti **Dana Talangan / Reimburse**.

---

## 2. Prinsip Desain & Pengalaman Pengguna (Anti "AI Slop")
1. **Zero Fluff / Tanpa Basa-basi:** Tidak ada kalimat sapaan panjang, kutipan motivasi, atau sub-teks penjelas yang tidak perlu di bawah judul menu.
2. **Tipografi Angka Presisi:** Menggunakan font **Plus Jakarta Sans** dengan seluruh nominal wajib memakai `tabular-nums` (lebar angka sejajar) agar deretan ribuan dan jutaan lurus vertikal seperti laporan akuntansi.
3. **Dynamic Workspace Theme (Solid Flat Color — Tanpa Gradient):**
   - **Buku Pribadi (`personal`):** Solid Deep Indigo (`bg-indigo-950`)
   - **Buku Usaha (`business`):** Solid Deep Teal (`bg-teal-900`)
   - **Manager Kopdes (`kopdes`):** Solid Forest Emerald (`bg-emerald-900`)
   - Indikator fungsional: Hijau Tua (Pemasukan), Merah Tua (Pengeluaran), Biru (Transfer), Amber (Dana Talangan / Reimburse).
   - Ikon garis tipis (`16px–18px`) hanya digunakan sebagai penanda navigasi dan aksi, bukan hiasan.
4. **Adaptive Layout (Responsif Sesuai Perangkat):**
   - **Mobile View (`< 768px` & Layar Kecil iPhone SE):** Fokus pada kecepatan satu tangan (*Thumb Zone*):
     - **Top Toolbar Ringkas:** Menampilkan ikon & nama aplikasi **`Buku Kas`**, nama buku kas aktif, indikator PIN, serta badge `Offline Ready`.
     - **Hero Balance Card & 3 Kartu Metrik:** Menampilkan total saldo aktif (dengan tombol *Lihat Detail* untuk membuka modal rincian saldo per dompet) serta metrik *Pemasukan*, *Pengeluaran*, dan *Talangan*.
     - **Swipeable Daily Transaction Cards:** Daftar transaksi dikelompokkan per hari; kartu dapat digeser ke kanan maupun ke kiri (*slide*) untuk membuka tombol **Edit** & **Hapus**, atau diketuk untuk membuka modal detail.
     - **Bottom Navigation Bar 3-Kolom (Ikon di atas, Teks `10px` di bawah):**
       1. `WorkspaceSwitcher` (*Buku Pribadi* | *Buku Usaha* | *Kopdes*) dengan pop-up *bottom sheet* ringkasan saldo tiap buku.
       2. `Catat Transaksi` dengan pop-up *bottom sheet* 3 metode input (*Tambah Transaksi*, *Foto*, *Record Voice*).
       3. `Pengaturan` dengan pop-up *bottom sheet* 5 menu (*Sinkronisasi Cloud*, *Laporan & Excel*, *Back Up & PIN*, *Kategori*, *Dompet*).
   - **Desktop/Laptop View ($\ge$ 768px):** Header horizontal (*Segmented Workspace Switcher* & deretan tombol aksi), tampilan *Spreadsheet/Table View* dengan filter lanjutan multi-kolom, rekap cepat per kategori/unit, serta fitur **Export & Import Excel (`.xlsx` Multi-Sheet)**.

---

## 3. Ruang Kerja (Multi-Workspace Architecture)

Aplikasi memiliki **3 Buku Kas Utama (Workspace)** yang dapat diganti secara instan melalui *Segmented Switcher* (Desktop) atau *Bottom Navbar* (Mobile):

### 3.1. Buku Pribadi (`personal`)
- Fokus: Kebutuhan rumah tangga, gaji/pendapatan pribadi, tabungan, investasi, dan pengeluaran harian.
- Contoh Akun/Dompet: Dompet Tunai, Bank Pribadi, E-Wallet.

### 3.2. Buku Usaha (`business`)
- Fokus: Arus kas usaha sampingan/pribadi, modal, HPP/pembelian bahan, omzet penjualan, biaya operasional usaha, serta piutang pelanggan.
- Contoh Akun/Dompet: Kas Tunai Usaha, Rekening Usaha.

### 3.3. Buku Kerja - Manager Kopdes (`kopdes`)
- Fokus: Pencatatan arus kas operasional dan manajerial Koperasi Desa yang berada di bawah tanggung jawab Manager.
- **Atribut Tambahan Khusus Buku Kopdes (Opsional/Fleksibel saat input):**
  - `unit_usaha`: Unit Simpan Pinjam (USP), Unit Toko/Ritel, Unit Pertanian/Pupuk, Jasa/Lainnya, atau Umum/Sekretariat.
  - `no_bukti`: Nomor Kwitansi / Nota / Bukti Kas Masuk (BKM) / Bukti Kas Keluar (BKK).
  - `pic_pihak`: Nama anggota, staf, atau suplier terkait.
- **Kategori Default Kopdes:**
  - *Pemasukan:* Setoran Unit Usaha, Simpanan Pokok/Wajib/Sukarela, Angsuran Masuk, Dana Hibah/Penyertaan, Lain-lain.
  - *Pengeluaran:* Belanja Barang Unit, Biaya Operasional Kantor (ATK/Listrik/Konsumsi), Honor/Gaji Pengurus & Staf, Pencairan Pinjaman, Perjalanan Dinas/Rapat, Lain-lain.

### 3.4. Fitur Lintas Buku: Dana Talangan & Reimburse (`reimbursement`)
Mengatasi kasus nyata ketika uang **Pribadi** dipakai menalangi pengeluaran **Kopdes** atau **Usaha** terlebih dahulu:
- Saat input pengeluaran di buku **Kopdes** atau **Usaha**, tersedia opsi **"Dibayar pakai Dana Talangan (Uang Pribadi)"**.
- Sistem otomatis:
  1. Mencatat pengeluaran pada buku **Kopdes/Usaha**.
  2. Mengurangi saldo dompet di buku **Pribadi**.
  3. Menandai transaksi tersebut dengan status `Belum Diganti (Pending Reimburse)`.
- Ketika uang diganti oleh bendahara/kas Kopdes, cukup klik **"Tandai Sudah Diganti"** $\rightarrow$ saldo kas Kopdes berkurang dan saldo dompet Pribadi kembali bertambah.

---

## 4. Spesifikasi 3 Sumber Input ke Form CRUD

Semua metode input bermuara ke **1 Komponen Form CRUD Utama** agar pengguna selalu memegang kendali penuh (verifikasi akhir) sebelum data disimpan ke database.

```mermaid
flowchart LR
    A["1. Tombol Tambah Manual"] --> D["Form CRUD Utama (Verifikasi & Simpan)"]
    B["2. Input Foto Nota/Struk"] --> B1["Kompresi WebP (<80KB) + OCR & Regex Parser"] --> D
    C["3. Input Voice-to-Text"] --> C1["Speech API + Smart Kalimat Parser"] --> D
```

### 4.1. Sumber 1: Form CRUD Biasa (Quick Manual Entry)
- **Operasi CRUD Penuh:** Create, Read/Detail, Update (Edit transaksi), dan Soft-Delete.
- **Input Nominal & Kalkulator Responsif:**
  - Otomatis menampilkan keyboard angka di HP (`inputmode="decimal"`) dan memformat titik ribuan secara *real-time* saat mengetik.
  - Dilengkapi tombol pecahan cepat (`+10rb`, `+50rb`, `+100rb`, `.000`) dan tombol operator kalkulator (`+`, `−`, `×`, `÷`, `=`) dalam grid proporsional.
- **Field Form CRUD:**
  - `Workspace` (Otomatis sesuai tab aktif, bisa diubah).
  - `Tipe Transaksi`: Pemasukan | Pengeluaran | Transfer Antar Akun | Kasbon/Piutang | Utang Masuk.
  - `Nominal (Rp)` *(Wajib)*.
  - `Tanggal & Jam` *(Default: Sekarang)*.
  - `Dompet Kas` *(Compact Grid 2-3 kolom lengkap dengan info saldo)*.
  - `Kategori` *(Smart Quick Grid 4 kategori utama + Expandable Search Picker untuk memilih/mencari kategori lainnya tanpa membuat form memanjang)*.
  - `Catatan / Deskripsi Singkat`.
  - `Rincian Item / Produk (Opsional)` *(Bisa ditambah/edit manual maupun otomatis dari hasil scan struk)*.
  - `Atribut Kopdes` *(Muncul khusus jika Workspace = Kopdes: Unit Usaha dalam Grid 2 kolom, No. Bukti, Pihak Terkait)*.
  - `Lampiran Foto Nota` *(Opsional, hasil kompresi WebP)*.

### 4.2. Sumber 2: Input Foto Nota / Struk (Camera / Gallery $\rightarrow$ Form CRUD)
1. **Akuisisi & Optimasi Memori/Storage:**
   - Foto dari kamera/galeri langsung diproses di memori browser menggunakan `<canvas>`.
   - Diubah ukurannya ke maksimal lebar/tinggi `1000px`, mode *grayscale/high-contrast* opsional, dan dikompres ke format **WebP kualitas 0.6 (Ukuran akhir hanya ~40 KB – 80 KB)** sehingga ribuan struk tidak membuat penuh storage HP atau SSD 128 GB nantinya.
   - Opsi hemat ekstrem: Toggle *"Hanya ambil teks, jangan simpan gambar"*.
2. **Ekstraksi Teks (OCR) & Smart Parser:**
   - Mengekstrak teks dari gambar struk (mendukung mode offline via *TextDetector API* bawaan browser atau Tesseract WASM).
   - **Parser Otomatis & Tampilan Adaptif (List Produk vs Single Total):**
     - Memisahkan secara tegas baris metadata struk (`No. Nota`, `Waktu`, `Kasir`, `Jenis/Nama Order`) dari baris produk.
     - **Mode List Produk (Checklist Interaktif):** Jika struk memiliki rincian produk, menampilkan daftar produk dengan *checkbox* sehingga pengguna dapat memilih seluruh item (Grand Total) atau mencentang item tertentu saja (misal memisahkan belanjaan Kopdes/Usaha dari barang pribadi).
     - **Mode Single Total:** Jika nota/kwitansi hanya berisi 1 nilai total tanpa rincian produk, menampilkan kartu ringkasan total tunggal yang bersih.
     - Mencari kata kunci `TOTAL`, `GRAND TOTAL`, `TOTAL BAYAR`, `SUBTOTAL`, atau jumlah item terpilih $\rightarrow$ mengisi kolom **Nominal**.
     - Mencari pola tanggal (`DD/MM/YYYY`, `DD-MM-YYYY`, atau `DD MMM YY HH:mm`) $\rightarrow$ mengisi kolom **Tanggal**.
     - Mengambil nama toko/vendor beserta rangkuman produk terpilih $\rightarrow$ mengisi kolom **Catatan**, **No. Bukti**, **Pihak Terkait**, dan menyimpan rincian produk ke tabel `transaction_items`.
3. **Verifikasi:** Membuka Form CRUD yang sudah terisi otomatis, menampilkan preview struk kecil di bawah, siap dikoreksi atau langsung klik **Simpan**.

### 4.3. Sumber 3: Voice-to-Text (Suara $\rightarrow$ Form CRUD)
1. **Akuisisi Suara:** Menggunakan `Web Speech API` (`SpeechRecognition` dengan bahasa `id-ID`).
2. **Natural Language Rule-Based Parser (Tanpa AI Berat):**
   - Mengubah kata bilangan bahasa Indonesia maupun angka menjadi nominal (contoh: *"seratus dua puluh lima ribu"* atau *"125 ribu"* $\rightarrow$ `125000`, *"dua setengah juta"* $\rightarrow$ `2500000`).
   - Mendeteksi kata kunci tipe transaksi:
     - Kata *"terima, masuk, jual, setoran, gajian"* $\rightarrow$ `Pemasukan`.
     - Kata *"beli, bayar, keluar, belanja, bensin, makan"* $\rightarrow$ `Pengeluaran`.
   - Mendeteksi kata kunci Workspace & Akun (contoh: ada kata *"koperasi / kopdes"* otomatis mengarahkan ke buku `Kopdes`).
   - Sisa kalimat bersih dimasukkan ke kolom **Catatan**.
3. **Verifikasi:** Langsung membuka Form CRUD dengan seluruh kolom terisi otomatis.

---

## 5. Arsitektur Data & Kesiapan Sinkronisasi (Offline $\rightarrow$ Supabase $\rightarrow$ Home Server)

Setiap entitas data di **Dexie.js (IndexedDB)** dirancang identik dengan skema **PostgreSQL / SQLite** agar migrasi berjalan mulus tanpa ubah struktur.

### 5.1. Skema Tabel Inti (Dexie v2)

#### A. Tabel `workspaces` (Buku Kas)
- `id` (UUID / String: `'personal'`, `'business'`, `'kopdes'`)
- `name` (String)
- `currency` (Default: `'IDR'`)

#### B. Tabel `accounts` (Dompet / Rekening Kas)
- `id` (UUID v7 — deterministik untuk 7 dompet bawaan)
- `workspace_id` (`'personal'` | `'business'` | `'kopdes'`)
- `name` (Contoh: `'Kas Kecil Kopdes'`, `'BRI Kopdes'`, `'Dompet Pribadi'`)
- `type` (`'cash'` | `'bank'` | `'ewallet'`)
- `initial_balance` (Integer - disimpan dalam satuan Rupiah bulat tanpa pecahan desimal floating-point; default seluruh dompet bawaan saat pertama kali dijalankan adalah **`0`** / `Rp 0`)
- `merged_into` (Nullable - ID kanonik jika baris ini merupakan duplikat yang telah digabung lintas perangkat)
- `created_at`, `updated_at`, `deleted_at`, `sync_status`

#### C. Tabel `categories` (Kategori)
- `id` (UUID v7 — deterministik untuk kategori bawaan)
- `workspace_id`
- `name` (Contoh: `'ATK & Fotokopi'`, `'Setoran Unit Toko'`)
- `type` (`'income'` | `'expense'`)
- `keywords` (String kata kunci opsional untuk auto-kategori cerdas)
- `merged_into` (Nullable - ID kanonik jika baris ini merupakan duplikat yang telah digabung lintas perangkat)
- `created_at`, `updated_at`, `deleted_at`, `sync_status`

#### D. Tabel `transactions` (Transaksi Utama)
- `id` (UUID v7)
- `workspace_id` (`'personal'` | `'business'` | `'kopdes'`)
- `account_id` (Relasi ke `accounts.id`)
- `to_account_id` (Nullable - untuk Transfer antar akun)
- `category_id` (Relasi ke `categories.id`)
- `type` (`'income'` | `'expense'` | `'transfer'` | `'debt'` | `'receivable'`)
- `amount` (Integer positif Rupiah bulat)
- `date` (ISO 8601 Date String)
- `note` (String)
- `metadata` (JSON Object untuk data fleksibel):
  - `no_bukti`: String (Khusus Kopdes/Usaha)
  - `unit_usaha`: String (Khusus Kopdes)
  - `pic_pihak`: String (Nama anggota/vendor)
  - `reimburse_status`: `'none'` | `'pending'` | `'settled'`
  - `reimburse_from_account_id`: UUID (Jika ditalangi dompet pribadi)
  - `reimburse_settled_at`: ISO Date String (Nullable)
- `attachment_blob` (Blob WebP terkompresi / Nullable)
- `created_at`, `updated_at`, `deleted_at` (Soft Delete)
- `sync_status` (`'pending'` | `'synced'`)

#### E. Tabel `transaction_items` (Rincian Produk Opsional 0..N per Transaksi)
- `id` (UUID v7)
- `transaction_id` (Relasi ke `transactions.id`)
- `workspace_id` (`'personal'` | `'business'` | `'kopdes'`)
- `name` (Nama produk/item)
- `amount` (Integer positif Rupiah bulat)
- `sort_order` (Integer urutan baris)
- `created_at`, `updated_at`, `deleted_at`, `sync_status`

### 5.2. Mekanisme Auto-Sync Dua Arah & Anti-Duplikat (`SyncEngine`)
1. **Urutan Siklus `Pull` $\rightarrow$ `Dedupe` $\rightarrow$ `Push`:**
   - Menarik perubahan remote terlebih dahulu (`_pullAll` dengan *buffer clock-skew* 60 detik dan paginasi `1000` baris per halaman), menggabungkan dompet/kategori kembar (`dedupeAccountsAndCategories` via `merged_into` + remap referensi transaksi), lalu mengirim antrean `pending` lokal (`_pushPending`).
   - Resolusi konflik menggunakan **Last-Write-Wins (LWW)** berdasarkan `updated_at`. Seed default menggunakan `SEED_EPOCH_ISO` (`2024-01-01T00:00:00.000Z`) sehingga selalu kalah dari perubahan hasil edit pengguna.
2. **Auto-Push (Offline $\rightarrow$ Online):**
   - Perubahan lokal (`sync_status = 'pending'`) dideteksi otomatis menggunakan Dexie `liveQuery` dan langsung di-push ke cloud setelah *debounce* `2 detik` saat online, atau otomatis dikirim begitu koneksi internet kembali menyala (`window.online`).
3. **Auto-Pull (Online $\rightarrow$ Offline):**
   - Menarik data dari cloud secara otomatis saat aplikasi dibuka (`startup`), sesaat setelah login, saat berpindah kembali ke tab aplikasi (`visibilitychange`), dan setiap `30 detik` ketika tab aktif, diikuti *auto-refresh* state UI secara reaktif.

---

## 6. Keamanan, Export/Import Excel (`.xlsx`), & Optimasi Resource

### 6.1. Keamanan (Mitigasi Celah Modern)
1. **100% Client-Side Static Build:** Tidak menggunakan SSR/Server Middleware yang rentan terhadap *Auth Bypass*.
2. **Minimal Dependency & Native `.xlsx` Engine:** Format mata uang (`Rp`), tanggal, kalkulasi, parser suara, dan pembaca/penulis file Excel (`.xlsx` Office Open XML Multi-Sheet) dibuat dengan *native JavaScript APIs* (`Intl`, `WebCrypto`, `DecompressionStream`, `RegExp`) untuk mencegah *Supply-Chain Attack*.
3. **App PIN Lock & Enkripsi Backup Lokal:**
   - Opsi mengunci aplikasi dengan **PIN 6 digit** (hash `SHA-256` + salt).
   - Mendukung enkripsi & dekripsi file backup JSON menggunakan **WebCrypto API (`PBKDF2-SHA256` 100.000 iterasi + `AES-GCM 256-bit`)**.
4. **Strict CSP (Content Security Policy):** Mencegah injeksi script (XSS) dan membatasi koneksi keluar hanya ke URL Supabase / Home Server yang diizinkan pengguna.

### 6.2. Optimasi Memori & Storage (HP & Laptop Celeron 4GB)
1. **Pagination Ringan:** Menampilkan transaksi dengan *pagination* (`50` transaksi per muatan) sehingga meski ada puluhan ribu transaksi, pemakaian RAM browser tetap di bawah `50 MB`.
2. **Kompresi Gambar Otomatis:** Setiap struk dipaksa turun ke `< 80 KB` (WebP). 1.000 foto struk hanya memakan `~80 MB` storage.
3. **Database Compaction:** Fitur pembersihan *soft-deleted records* permanen dan ekspor cadangan ke file lokal.

---

## 7. Roadmap Implementasi Bertahap

### Fase 1: Core Offline-First PWA (Selesai 100%)
- [x] Setup project **Svelte 5 + Vite + Tailwind CSS** (berjalan 100% lokal di browser).
- [x] Implementasi database lokal **Dexie.js** dengan skema siap-sinkronisasi (`UUID v7`, `updated_at`, `deleted_at`, `sync_status`, serta tabel terpisah `transaction_items`).
- [x] Pembuatan UI Multi-Workspace (`Pribadi`, `Usaha`, `Kopdes`) dengan tema warna solid per buku dan layout responsif (Mobile Top Toolbar + Swipeable Card View + 3-Tab Bottom Navbar & Desktop Table View).
- [x] Implementasi **Form CRUD Utama** + Kalkulator Nominal + Smart Picker Dompet/Kategori + Fitur Dana Talangan/Reimburse.
- [x] Implementasi **Smart Voice-to-Text Parser (Bahasa Indonesia)** $\rightarrow$ masuk ke Form CRUD.
- [x] Implementasi **Camera/Photo Compressor + OCR Struk Parser** $\rightarrow$ masuk ke Form CRUD.
- [x] Fitur **Laporan Rekapitulasi, Filter Tanggal/Unit Kopdes, Export & Import Excel (`.xlsx` Multi-Sheet), Backup/Restore JSON Terenkripsi (`AES-GCM 256-bit`), PIN Lock 6 Digit, & PWA Offline Manifest**.

### Fase 2: Cloud Database Sync (Supabase) (Selesai 100%)
- [x] Menambahkan `SupabaseAdapter` native zero-bloat via browser `fetch` (PostgREST & GoTrue Auth).
- [x] Sinkronisasi latar belakang (*Background Sync*): Hanya mengirim baris dengan `sync_status = 'pending'` dan menarik perubahan terbaru berdasarkan `updated_at` (*Delta Sync* hemat kuota & baterai).
- [x] Skema database PostgreSQL + Penerapan *Row Level Security (RLS)* di `supabase/schema.sql` (1:1 dengan Dexie v2 termasuk `transaction_items` dan `merged_into`).
- [x] Modal Pengaturan Sinkronisasi (`SyncSettingsModal.svelte`: Konfigurasi otomatis via `.env`, alur pendaftaran hemat kuota tanpa konfirmasi email, tampilan bersih hanya Logout & Sinkronisasi saat aktif) serta indikator status sync di Header Desktop & Mobile.
- [x] Anti-duplikat Dompet/Kategori lintas perangkat (seed UUID v7 deterministik dengan saldo awal seluruh kas default `Rp 0`, siklus `Pull` $\rightarrow$ `Dedupe` $\rightarrow$ `Push`, dan remap referensi transaksi).
- [x] Auto-Sync Dua Arah (Push Offline $\rightarrow$ Online via Dexie `liveQuery` + `window.online` & Pull Online $\rightarrow$ Offline saat startup, login, `visibilitychange`, dan polling 30 detik disertai *auto-refresh* UI).

### Fase 3: Migrasi ke Home Server (Laptop Intel Celeron, RAM 4GB, SSD 128GB)
- [ ] Pembuatan Backend REST API super ringan dengan **Go (Golang)** + **SQLite (WAL Mode) / PostgreSQL**.
- [ ] Migrasi data 1-klik dari Supabase/Backup JSON ke Home Server.
- [ ] Mengarahkan URL Sync di pengaturan PWA ke IP/Domain Home Server (via Tailscale atau Cloudflare Tunnel).
