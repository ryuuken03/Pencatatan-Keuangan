---
trigger: always_on
description: Prinsip desain Anti AI-Slop, arsitektur Multi-Workspace Buku Kas, dan aturan teknis proyek.
---

# Anti AI-Slop & Architecture Rules (`Buku Kas`)

1. **Zero Fluff / Tanpa Basa-basi:** Jangan gunakan sapaan panjang, kutipan motivasi, atau sub-teks dekoratif di UI maupun di balasan chat.
2. **Tipografi Akuntansi Presisi:** Gunakan font **Plus Jakarta Sans** dan class `tabular-nums` pada setiap nominal Rupiah, angka, dan tanggal.
3. **Solid Flat Color (Tanpa Gradient):**
   - `personal` (Buku Pribadi): `bg-indigo-950`
   - `business` (Buku Usaha): `bg-teal-900`
   - `kopdes` (Manager Kopdes): `bg-emerald-900`
4. **Adaptive Mobile & Desktop UX:**
   - Mobile (`< 768px`): Top Toolbar nama aplikasi `Buku Kas`, Hero Card dengan modal rincian dompet, daftar transaksi harian *Swipeable Card* (slide kanan/kiri untuk Edit/Hapus), dan **Bottom Navbar 3-Kolom (Ikon di atas, Teks di bawah)**: `WorkspaceSwitcher`, `Catat Transaksi`, `Pengaturan`.
   - Desktop (`>= 768px`): Segmented header switcher & *Spreadsheet Table View*.
5. **Laporan Excel (`.xlsx`) & Keamanan Lokal:**
   - Export dan Import laporan/transaksi wajib berformat `.xlsx` (bukan CSV) menggunakan `src/lib/utils/xlsxEngine.js`.
   - Backup & Restore JSON menggunakan enkripsi WebCrypto API (`AES-GCM 256-bit` + `PBKDF2-SHA256`).
   - Pertahankan skema Dexie.js v2 (`workspaces`, `accounts`, `categories`, `transactions`, dan tabel terpisah `transaction_items`) dengan `UUID v7`, `updated_at`, `deleted_at`, dan `sync_status`.

