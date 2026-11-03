# Buku Kas — Aplikasi Pencatatan Keuangan Multi-Workspace (Pribadi, Usaha, Manager Kopdes)

Aplikasi pencatatan keuangan **Offline-First PWA (Progressive Web App)** yang ringan, aman, dan responsif (mulai dari layar sempit sekelas iPhone SE hingga layar lebar Laptop/Desktop). Dirancang khusus untuk memisahkan secara tegas pencatatan uang **Buku Pribadi**, **Buku Usaha**, dan **Manager Kopdes** tanpa tercampur, namun tetap mendukung transaksi lintas buku seperti **Dana Talangan / Reimburse**.

---

## 🚀 Cara Menjalankan Aplikasi

Pastikan **Node.js** sudah terpasang di komputer Anda.

### 1. Instalasi Dependency (Hanya sekali di awal)
```bash
npm install
```

### 2. Menjalankan Mode Development (Gunakan sehari-hari di lokal)
```bash
npm run dev
```
Buka alamat yang muncul di terminal menggunakan browser:
👉 **`http://localhost:5173`**

*(Catatan: Jangan membuka file `index.html` secara langsung lewat klik dua kali / `file:///`, karena browser memblokir ES Modules & Service Worker tanpa local web server).*

### 3. Build untuk Produksi & Preview PWA Offline
```bash
npm run build
npm run preview
```
Hasil build statis siap pakai (lengkap dengan *Service Worker* `sw.js` & `manifest.webmanifest`) akan berada di dalam folder `dist/`.

---

## ✨ Fitur Lengkap Saat Ini (Fase 1 & Fase 2 Selesai 100%)

### 1. Multi-Workspace dengan Identitas Warna Solid (Anti AI-Slop)
Setiap buku kas memiliki tema warna solid tersendiri agar tidak salah kamar saat mencatat transaksi (seluruh dompet kas bawaan memiliki saldo awal **`Rp 0`** saat pertama kali dijalankan):
- **Buku Pribadi (`personal`):** Tema *Deep Indigo* (`bg-indigo-950`) — gaji, kebutuhan rumah tangga, tabungan, dan pengeluaran harian.
- **Buku Usaha (`business`):** Tema *Deep Teal* (`bg-teal-900`) — modal, omzet penjualan, HPP/belanja bahan, operasional usaha, dan piutang pelanggan.
- **Manager Kopdes (`kopdes`):** Tema *Forest Emerald* (`bg-emerald-900`) — arus kas operasional & manajerial Koperasi Desa per Unit Usaha (`USP`, `Toko/Ritel`, `Pertanian/Pupuk`, `Jasa/Lainnya`, `Umum/Sekretariat`), lengkap dengan `No. Bukti (BKM/BKK)` dan `PIC/Pihak Terkait`.

### 2. Fitur Lintas Buku: Dana Talangan & Reimburse (`reimbursement`)
Mengatasi kasus nyata ketika uang **Pribadi** dipakai menalangi pengeluaran **Kopdes** atau **Usaha** terlebih dahulu:
1. Saat mencatat pengeluaran di buku **Kopdes** atau **Usaha**, aktifkan opsi **"Dibayar pakai Dana Talangan (Uang Pribadi / Reimburse)"** lalu pilih dompet pribadi yang menalangi.
2. Sistem otomatis mencatat pengeluaran di buku Kopdes/Usaha, memotong saldo dompet di buku Pribadi, dan memberi penanda **Pending Talangan**.
3. Saat bendahara/kas Kopdes mengganti uang tersebut, klik tombol **"Tandai Sudah Diganti"** $\rightarrow$ saldo kas Kopdes otomatis berkurang dan saldo dompet Pribadi kembali utuh.

### 3. Tiga Jalur Input Pintar ke Form CRUD Utama
Seluruh metode pencatatan bermuara ke **1 Form Verifikasi CRUD Utama**:
1. **Input Manual + Kalkulator Nominal Responsif (`TransactionForm.svelte`):**
   - Otomatis memformat titik ribuan secara *real-time* dan mendukung perhitungan langsung (`25.000+15.000`, `50rb*3`), tombol pecahan cepat (`+10rb`, `+50rb`, `+100rb`, `.000`), serta operator matematika (`+`, `−`, `×`, `÷`, `=`).
   - Mendukung penambahan/pengeditan rincian item produk (`transaction_items`) secara opsional.
2. **Scan Foto Struk / Nota (`ReceiptScannerModal.svelte`):**
   - Kompresi otomatis via `<canvas>` ke format **WebP `< 80 KB`** (maksimal `1000px`) dengan opsi *High-Contrast* dan toggle *"Jangan simpan gambar"*.
   - Ekstraksi teks OCR + Smart Regex Parser dengan tampilan adaptif **List Produk (Checklist Interaktif)** maupun **Single Total**.
3. **Record Voice Bahasa Indonesia (`VoiceInputModal.svelte`):**
   - Menggunakan `Web Speech API (id-ID)` + Natural Language Rule-Based Parser untuk mengubah kalimat ucapan menjadi nominal, tipe transaksi, kategori, buku kas, dan catatan.

### 4. Rekapitulasi Laporan, Export & Import Excel (`.xlsx` Multi-Sheet)
- **Filter Transaksi Lanjutan:** Filter berdasarkan Rentang Tanggal (`Dari` – `Sampai`), Kategori, Dompet/Akun, Unit Usaha Kopdes, Status Reimburse (`Pending` / `Settled`), serta pencarian kata kunci/No. Bukti/nama produk.
- **Modal Laporan Manajerial (`ReportExportModal.svelte`):**
  - **Rekap per Kategori:** Rincian pemasukan & pengeluaran per kategori lengkap dengan persentase bar dan nominal `tabular-nums`.
  - **Rekap per Unit Usaha Kopdes:** Tabel pertanggungjawaban pemasukan, pengeluaran, dan surplus/defisit per unit kerja Kopdes.
  - **Daftar Dana Talangan / Reimburse:** Pemantauan dan pelunasan transaksi talangan lintas buku.
- **Export & Import Microsoft Excel Asli (`.xlsx`):**
  - Menggunakan engine OOXML native (`src/lib/utils/xlsxEngine.js`) tanpa ketergantungan library eksternal.
  - **Export Laporan Lengkap (`.xlsx`):** Menghasilkan 1 file Excel dengan **4 Worksheet** (*Ringkasan & Unit Kopdes*, *Rekap Kategori*, *Daftar Reimburse*, dan *Rincian Transaksi*).
  - **Import Excel (`.xlsx`):** Membaca file `.xlsx`, menampilkan preview tabel transaksi, dan mengimpor ke database lokal Dexie.js secara otomatis.

### 5. Keamanan Lokal: Backup Terenkripsi `AES-GCM 256-bit` & PIN Lock 6 Digit
- **Backup & Restore JSON Terenkripsi (`SecurityBackupModal.svelte`):**
  - Mencadangkan seluruh database (termasuk foto struk WebP) ke file `.json` yang dienkripsi dengan password menggunakan **WebCrypto API (`PBKDF2-SHA256` 100.000 iterasi + `AES-GCM 256-bit`)**.
  - Mendukung pemulihan mode *Gabungkan (Merge)* atau *Ganti Total (Replace)* serta fitur *Database Compaction* untuk membersihkan data sampah (*soft-deleted*).
- **App PIN Lock 6 Digit (`PinLockScreen.svelte`):**
  - Mengunci aplikasi dengan PIN 6 digit (disimpan aman dengan hash `SHA-256` + salt), dilengkapi numpad layar sentuh & dukungan keyboard fisik.
- **Strict Content Security Policy (CSP):** Terpasang di `index.html` untuk mencegah XSS dan membatasi koneksi keluar.

### 6. Sinkronisasi Cloud Supabase (Fase 2: Auto-Sync Dua Arah, Delta Sync & RLS)
- **Konfigurasi Otomatis via `.env` (Zero Manual Form):**
  - Supabase Project URL dan Anon Key dibaca langsung dari berkas `.env` (`VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`) tanpa perlu input manual di UI aplikasi.
- **Pendaftaran Hemat Kuota (Tanpa Konfirmasi Email):**
  - Supabase mendukung registrasi instan tanpa verifikasi email (dengan mematikan *Confirm email* di dashboard *Authentication $\rightarrow$ Providers $\rightarrow$ Email*), sehingga tidak menghabiskan kuota pengiriman email bawaan Supabase.
  - Alur registrasi: pengguna mendaftar $\rightarrow$ akun langsung tersimpan $\rightarrow$ form otomatis beralih ke tab login dengan email terisi siap masuk.
- **Tampilan Bersih & Minimalis Saat Sesi Aktif:**
  - Begitu login berhasil, seluruh elemen form pendaftaran dan login dihilangkan total.
  - Antarmuka hanya menampilkan **Kartu Akun Cloud Aktif** (email akun) + tombol **Keluar (Logout)** dan **Panel Antrean Perubahan** + tombol **Sinkronkan Sekarang**.
- **Arsitektur 100% Offline-First:**
  - Seluruh operasi pencatatan, mutasi, dan edit transaksi selalu disimpan instan ke Dexie.js lokal tanpa menunggu respon jaringan internet.
- **Auto-Sync Dua Arah (Aktif Secara Default):**
  - **Auto-Push (Offline $\rightarrow$ Online):** Setiap perubahan lokal (`sync_status = 'pending'`) pada transaksi, dompet, maupun kategori dipantau secara *real-time* via Dexie `liveQuery` dan langsung di-push ke Supabase setelah *debounce* `2 detik`. Transaksi yang dicatat saat **offline** otomatis dikirim begitu perangkat kembali **online** (`window.online`) dengan *push timestamp* yang menjamin perangkat lain ikut menarik perubahan tersebut.
  - **Auto-Pull (Online $\rightarrow$ Offline):** Menarik perubahan dari cloud secara otomatis saat aplikasi dibuka (`startup`), sesaat setelah login, saat berpindah kembali ke tab aplikasi (`visibilitychange`), serta melalui *polling* ringan setiap `30 detik` ketika tab aktif, lalu me-refresh daftar transaksi dan saldo secara reaktif tanpa perlu *reload* halaman.
- **Anti-Duplikat Dompet & Kategori Lintas Perangkat:**
  - Seed bawaan menggunakan **UUID v7 deterministik** (`SEED_EPOCH_ISO`) dengan saldo awal seluruh kas **`Rp 0`**.
  - Urutan siklus **`Pull` $\rightarrow$ `Dedupe` $\rightarrow$ `Push`** otomatis menggabungkan dompet/kategori kembar (nama sama dalam buku yang sama) melalui kolom `merged_into` dan me-remap seluruh referensi transaksi ke ID kanonik.
- **Delta Sync Berbasis Timestamp & Status:**
  - Hanya mengirimkan baris yang memiliki status `sync_status = 'pending'` dan menarik baris remote yang berubah setelah *cursor* sinkronisasi per-user (`updated_at` dengan *buffer clock-skew* 60 detik serta paginasi > 1.000 baris).
  - Serialisasi lampiran WebP otomatis ke JSON serializable sehingga struk foto ikut tersinkronisasi lintas perangkat (misal foto di HP, lihat di Laptop).
- **PostgreSQL & Row Level Security (RLS):**
  - Skema database di `supabase/schema.sql` (dan migrasi `supabase/migrations/20261103_merged_into.sql`) memproteksi data pengguna secara ketat: pengguna hanya dapat melihat dan memodifikasi data miliknya (`auth.uid() = user_id`).
- **Zero External Bloat:**
  - Menggunakan client native `fetch` (PostgREST & GoTrue REST) tanpa menambahkan library berat `@supabase/supabase-js`, menjaga build tetap super ringan dan aman dari supply-chain risk.
- **Kontrol Sinkronisasi & Indikator:**
  - Indikator status sync interaktif di Header Desktop (Pill status, jumlah pending, spin saat sync) dan Mobile Top Toolbar / Menu Pengaturan.

### 7. Ergonomi Mobile (`< 768px`) & Desktop (`>= 768px`)
- **Mobile View:**
  - **Top Toolbar:** Nama aplikasi **`Buku Kas`**, indikator buku aktif, status PIN, dan badge `Offline Ready` / status sinkronisasi.
  - **Swipeable Transaction Cards:** Geser kartu transaksi ke kanan atau kiri untuk membuka tombol cepat **Edit** & **Hapus**, atau ketuk untuk membuka modal detail.
  - **Bottom Navbar 3-Kolom (Ikon di atas, Teks di bawah):**
    1. `Buku Pribadi / Buku Usaha / Kopdes` (*WorkspaceSwitcher* + info saldo tiap buku).
    2. `Catat Transaksi` (*Tambah Transaksi*, *Foto*, *Record Voice*).
    3. `Pengaturan` (*Sinkronisasi Cloud*, *Laporan & Excel*, *Back Up & PIN*, *Kategori*, *Dompet*).
- **Desktop View:** Header *Segmented Switcher* horizontal & *Spreadsheet Table View* multi-kolom.

---

## 🛠️ Tech Stack & Dokumen Acuan
- **Frontend:** Svelte 5 (Runes) + Vite 6 + Tailwind CSS v4 + `vite-plugin-pwa`
- **Database Lokal:** Dexie.js v2 (IndexedDB: `workspaces`, `accounts`, `categories`, `transactions`, `transaction_items`)
- **Dokumen & Rules Proyek:**
  - [PRD.md](./PRD.md) — Spesifikasi Produk & Arsitektur Data.
  - [PROGRESS.md](./PROGRESS.md) — Tracker Progress & Roadmap Modul.
  - [GEMINI.md](./GEMINI.md) & [.agents/rules/anti-ai-slop.md](./.agents/rules/anti-ai-slop.md) — Aturan Permanen AI (Anti AI-Slop & Arsitektur) yang otomatis dimuat di setiap sesi.
