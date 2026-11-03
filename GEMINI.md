# Project Rules — Aplikasi Pencatatan Keuangan Multi-Workspace (`Buku Kas`)

Aturan ini wajib dipatuhi secara otomatis di setiap prompt/sesi tanpa perlu diinisiasi ulang oleh pengguna:

## 1. Prinsip Desain & UI/UX (Anti "AI Slop")
1. **Zero Fluff / Tanpa Basa-basi:**
   - Dilarang menambahkan kalimat sapaan panjang, kutipan motivasi, atau sub-teks penjelas yang bertele-tele di bawah judul menu/komponen maupun di dalam respons chat.
2. **Tipografi Angka Akuntansi Presisi:**
   - Gunakan font **Plus Jakarta Sans** dan wajib menerapkan `tabular-nums` pada seluruh nominal uang (`Rp`), tanggal, persentase, dan angka statistik agar sejajar lurus secara vertikal.
3. **Dynamic Workspace Theme (Solid Flat Color — Dilarang Pakai Gradient):**
   - **Buku Pribadi (`personal`):** Solid Deep Indigo (`bg-indigo-950`)
   - **Buku Usaha (`business`):** Solid Deep Teal (`bg-teal-900`)
   - **Manager Kopdes (`kopdes`):** Solid Forest Emerald (`bg-emerald-900`)
   - **Indikator Fungsional:** Hijau Tua (`emerald-700` untuk Pemasukan), Merah Tua (`rose-700` untuk Pengeluaran), Biru (`sky-700` untuk Transfer), Amber (`amber-600/800` untuk Dana Talangan / Reimburse).
   - **Ikon:** Gunakan SVG garis tipis (`16px–18px`) murni sebagai penanda navigasi dan aksi, bukan dekorasi.
4. **Adaptive Layout (Mobile vs Desktop):**
   - **Mobile View (`< 768px`, termasuk layar sempit iPhone SE):**
     - Top Toolbar ringkas menampilkan nama aplikasi **`Buku Kas`** + buku aktif + status `Offline Ready` / PIN.
     - *Hero Balance Card* (dengan tombol *Lihat Detail* untuk membuka modal rincian saldo dompet) + 3 kartu metrik (*Pemasukan*, *Pengeluaran*, *Talangan*).
     - Daftar transaksi harian menggunakan *Swipeable Card View* (geser kanan/kiri untuk tombol *Edit* & *Hapus*, ketuk kartu untuk melihat detail).
     - Navigasi utama berada di **Bottom Navbar 3-Kolom (Ikon di atas, Teks `10px` di bawah)**:
       1. `WorkspaceSwitcher` (*Buku Pribadi* | *Buku Usaha* | *Kopdes*)
       2. `Catat Transaksi` (*Tambah Transaksi*, *Foto*, *Record Voice*)
       3. `Pengaturan` (*Laporan & Excel*, *Back Up & PIN*, *Kategori*, *Dompet*)
   - **Desktop View (`>= 768px`):**
     - Top Header dengan *Segmented Workspace Switcher* & deretan tombol aksi cepat.
     - *Spreadsheet Table View* multi-kolom dengan filter lanjutan, rekapitulasi, serta Export & Import **Excel (`.xlsx` Multi-Sheet)**.

## 2. Arsitektur Teknis & Keamanan
1. **Tech Stack:** Svelte 5 (Runes `$state`, `$derived`, `$effect`, `$props`) + Vite 6 + Tailwind CSS v4 + Dexie.js (IndexedDB).
2. **Zero External Bloat / Supply-Chain Safety:**
   - Gunakan *native browser APIs* (`Intl.NumberFormat`, `Intl.DateTimeFormat`, `WebCrypto API`, `<canvas>`, `Web Speech API`).
   - Export & Import laporan wajib menggunakan format **Microsoft Excel asli (`.xlsx`)** via engine native `src/lib/utils/xlsxEngine.js`, bukan CSV.
3. **Skema Data Siap-Sinkronisasi (Dexie.js $\rightarrow$ Supabase $\rightarrow$ Go Home Server):**
   - Seluruh entitas (`workspaces`, `accounts`, `categories`, `transactions`, `transaction_items`) wajib mempertahankan `UUID v7`, `updated_at`, `deleted_at` (*Soft Delete*), dan `sync_status` (`'pending'` | `'synced'`).
   - Nominal disimpan sebagai **Integer Rupiah bulat** (tanpa floating-point desimal).
   - Foto struk selalu dikompresi ke **WebP `< 80 KB`** (maksimal `1000px`).

## 3. Gaya Komunikasi Agent
- Jawab selalu dengan **ringkas, padat, dan langsung ke teknis eksekusi** tanpa penjelasan teori panjang.
- Selalu pastikan `npm run build` sukses tanpa error setelah melakukan perubahan kode, dan perbarui checklist di `PROGRESS.md` bila menyelesaikan modul/tahap roadmap.

