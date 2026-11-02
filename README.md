# Aplikasi Pencatatan Keuangan Multi-Workspace (Pribadi, Usaha, Manager Kopdes)

Aplikasi pencatatan keuangan **Offline-First** yang ringan, cepat, dan responsif (mulai dari layar kecil iPhone SE hingga layar lebar Laptop/Desktop). Dirancang khusus untuk memisahkan secara tegas pencatatan uang **Pribadi**, **Usaha**, dan **Kerja (Manager Kopdes)** tanpa tercampur, namun tetap mendukung transaksi lintas buku seperti **Dana Talangan / Reimburse**.

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
Setelah perintah dijalankan, buka alamat yang muncul di terminal menggunakan browser:
👉 **`http://localhost:5173`**

*(Catatan: Jangan membuka file `index.html` secara langsung lewat klik dua kali / `file:///`, karena browser memblokir ES Modules tanpa local web server).*

### 3. Build untuk Produksi & Preview
```bash
npm run build
npm run preview
```
Hasil build statis siap pakai akan berada di dalam folder `dist/`.

---

## ✨ Fitur Utama Saat Ini (Modul 1A & Modul 1B)

### 1. Multi-Workspace dengan Identitas Warna Solid (Tanpa Gradient)
Ganti buku kas secara instan melalui *Segmented Switcher* di bagian atas layar. Setiap buku memiliki tema warna solid tersendiri agar tidak salah kamar saat menginput transaksi:
- **Buku Pribadi (`personal`):** Tema *Deep Indigo* (`bg-indigo-950`) — untuk gaji, kebutuhan rumah tangga, tabungan, dan pengeluaran harian.
- **Buku Usaha (`business`):** Tema *Deep Teal* (`bg-teal-900`) — untuk modal, omzet penjualan, HPP/belanja bahan, operasional usaha, dan nota/pelanggan.
- **Manager Kopdes (`kopdes`):** Tema *Forest Emerald* (`bg-emerald-900`) — untuk arus kas operasional & manajerial Koperasi Desa.

### 2. Fitur Lintas Buku: Dana Talangan & Reimburse (`reimbursement`)
Mengatasi kasus nyata ketika uang **Pribadi** dipakai menalangi pengeluaran **Kopdes** atau **Usaha** terlebih dahulu:
1. Saat mencatat pengeluaran di buku **Kopdes** atau **Usaha**, centang opsi **"Dibayar pakai Dana Talangan (Uang Pribadi / Reimburse)"** lalu pilih dompet pribadi yang menalangi.
2. Sistem otomatis mencatat pengeluaran di buku Kopdes/Usaha, memotong saldo dompet di buku Pribadi, dan memberi penanda **Pending Talangan**.
3. Di buku **Pribadi**, transaksi talangan tersebut juga ditampilkan secara transparan agar Anda tahu ke mana saldo pribadi Anda terpakai.
4. Saat bendahara/kas Kopdes mengganti uang tersebut, cukup klik tombol **"Tandai Sudah Diganti"** pada transaksi $\rightarrow$ saldo kas Kopdes otomatis berkurang dan saldo dompet Pribadi kembali utuh.

### 3. Tiga Jalur Input Pintar ke Form CRUD Utama
Seluruh metode pencatatan bermuara ke **1 Form Verifikasi CRUD Utama** agar pengguna selalu memegang kendali penuh sebelum data disimpan:
1. **Input Suara Pintar (`Web Speech API id-ID` + NLP Parser Bahasa Indonesia):**
   - Mengubah ucapan kalimat maupun angka terbilang Bahasa Indonesia menjadi data transaksi terstruktur (contoh: *"Beli pupuk kopdes satu juta tujuh ratus lima puluh ribu pakai dana talangan"* atau *"Terima omzet usaha dua setengah juta"*).
   - Otomatis mendeteksi **Buku Kas**, **Tipe Transaksi**, **Nominal (Rp)**, **Dompet**, **Kategori**, **Unit Usaha Kopdes**, status **Dana Talangan**, dan merapikan **Catatan**.
2. **Scan Foto Struk / Nota (Kompresi WebP `< 80 KB` + OCR & Smart Parser):**
   - Mengompres foto kamera/galeri secara otomatis di memori browser menggunakan `<canvas>` ke format **WebP `< 80 KB`** (maksimal `1000px`) dengan opsi *High-Contrast* dan toggle *"Hanya ambil teks, jangan simpan gambar"*.
   - Memisahkan baris metadata (`No. Nota`, `Waktu`, `Kasir`, `Order`) dari baris produk, serta menampilkan preview adaptif:
     - **Mode List Produk (Checklist Interaktif):** Jika struk memiliki rincian produk, pengguna dapat memilih semua atau mencentang item tertentu saja (nominal total & catatan otomatis menyesuaikan item yang dipilih).
     - **Mode Single Total:** Jika kwitansi hanya memiliki 1 nilai total tanpa rincian produk, langsung menampilkan ringkasan total tunggal.
3. **Input Manual + Kalkulator Nominal Responsif:**
   - Otomatis memunculkan *numpad* angka di HP (`inputmode="decimal"`) dan memformat titik ribuan secara *real-time* saat mengetik.
   - Mendukung pengetikan rumus matematika langsung (`25.000+15.000`, `50000*3`), tombol pecahan cepat (`+10rb`, `+50rb`, `+100rb`, `.000`), dan tombol operator (`+`, `−`, `×`, `÷`, `=`).
   - Dilengkapi *Smart Picker* Dompet & Kategori hemat ruang, atribut khusus Kopdes (`unit_usaha`, `no_bukti`, `pic_pihak`), serta lampiran & preview foto struk.

### 4. Manajemen Dompet (Rekening) & Kategori
- Tambah, edit, dan hapus (*soft-delete*) Dompet/Rekening (`Cash`, `Bank`, `E-Wallet`) beserta pengaturan Saldo Awal per Buku Kas.
- Tambah, edit, dan hapus Kategori Pemasukan & Pengeluaran secara terpisah di tiap Buku Kas.
- Dilengkapi tampilan *Adaptive*: otomatis berbentuk **Card** di layar sempit (seperti iPhone SE) dan berbentuk **Tabel** di layar Tablet/Laptop.

### 5. Desain Responsif, Preview Struk & Tipografi Akuntansi Presisi
- Menggunakan font **Plus Jakarta Sans** dengan fitur angka sejajar vertikal (`tabular-nums`) di seluruh nominal Rupiah.
- **Indikator & Modal Detail Struk:** Transaksi yang memiliki lampiran foto struk menampilkan badge `Struk (XX KB)` untuk melihat foto nota ukuran penuh, rincian item produk (`metadata.items`), dan mengunduh file `.webp`.
- **Mobile View (`< 768px`):** *Hero Balance Card*, *Mini Wallet Cards* tanpa scrollbar kasar, *Transaction Card List*, dan *Floating Bottom Action Bar* (lengkap dengan pintasan Suara, Scan Struk, dan Catat Manual).
- **Desktop View (`>= 768px`):** Tampilan *Spreadsheet Table View* multi-kolom lengkap dengan filter tipe transaksi, filter khusus *Talangan Pending*, dan pencarian instan.

---

## 🛠️ Tech Stack & Arsitektur Database
- **Frontend:** Svelte 5 (Runes) + Vite 6 + Tailwind CSS v4
- **Database Lokal:** Dexie.js (IndexedDB) — bekerja 100% *offline* di browser perangkat.
- **Kesiapan Sinkronisasi:** Seluruh tabel (`workspaces`, `accounts`, `categories`, `transactions`) telah menggunakan `UUID v7` (berurutan waktu), `updated_at`, `deleted_at` (*Soft Delete*), dan `sync_status` (`pending` / `synced`) yang siap dihubungkan ke **Supabase (Fase 2)** maupun **Home Server Go + SQLite/Postgres (Fase 3)**.

---

## 📄 Referensi Dokumen Proyek
- [PRD.md](./PRD.md) — Dokumen Spesifikasi Produk & Arsitektur Data.
- [PROGRESS.md](./PROGRESS.md) — Tracker Progress & Roadmap Modul (1A, 1B, 1C, Fase 2, Fase 3).

