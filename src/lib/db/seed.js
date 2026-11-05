import { deterministicUuidV7 } from '../utils.js';

export const KOPDES_UNITS = [
  'Unit Simpan Pinjam (USP)',
  'Unit Toko/Ritel',
  'Unit Pertanian/Pupuk',
  'Jasa/Lainnya',
  'Umum/Sekretariat'
];

export const DEFAULT_ACCOUNTS = [
  // Pribadi
  { workspace_id: 'personal', name: 'Dompet Tunai', type: 'cash', initial_balance: 0 },
  { workspace_id: 'personal', name: 'Bank Pribadi', type: 'bank', initial_balance: 0 },
  { workspace_id: 'personal', name: 'E-Wallet', type: 'ewallet', initial_balance: 0 },
  // Usaha
  { workspace_id: 'business', name: 'Kas Tunai Usaha', type: 'cash', initial_balance: 0 },
  { workspace_id: 'business', name: 'Rekening Usaha', type: 'bank', initial_balance: 0 },
  // Kopdes
  { workspace_id: 'kopdes', name: 'Kas Kecil Kopdes', type: 'cash', initial_balance: 0 },
  { workspace_id: 'kopdes', name: 'BRI Kopdes', type: 'bank', initial_balance: 0 }
];

export const DEFAULT_CATEGORIES = [
  // Pribadi - Expense
  { workspace_id: 'personal', name: 'Pengeluaran Pribadi', type: 'expense' },
  { workspace_id: 'personal', name: 'Kesehatan & Pendidikan', type: 'expense' },
  { workspace_id: 'personal', name: 'Makan & Minuman', type: 'expense' },
  { workspace_id: 'personal', name: 'Transportasi & BBM', type: 'expense' },
  { workspace_id: 'personal', name: 'Tagihan & Komunikasi', type: 'expense' },
  // Pribadi - Income
  { workspace_id: 'personal', name: 'Pemasukan Lainnya', type: 'income' },
  { workspace_id: 'personal', name: 'Investasi / Bagi Hasil', type: 'income' },
  { workspace_id: 'personal', name: 'Gaji & Pendapatan', type: 'income' },

  // Usaha - Income
  { workspace_id: 'business', name: 'Omzet Penjualan', type: 'income' },
  { workspace_id: 'business', name: 'Suntikan Modal', type: 'income' },
  { workspace_id: 'business', name: 'Pelunasan Piutang Pelanggan', type: 'income' },
  // Usaha - Expense
  { workspace_id: 'business', name: 'HPP / Pembelian Bahan', type: 'expense' },
  { workspace_id: 'business', name: 'Operasional & Listrik Usaha', type: 'expense' },
  { workspace_id: 'business', name: 'Upah Karyawan / Tenaga', type: 'expense' },
  { workspace_id: 'business', name: 'Pemasaran & Distribusi', type: 'expense' },

  // Kopdes - Income (Sesuai PRD 3.3)
  { workspace_id: 'kopdes', name: 'Setoran Unit Usaha', type: 'income' },
  { workspace_id: 'kopdes', name: 'Simpanan Pokok/Wajib/Sukarela', type: 'income' },
  { workspace_id: 'kopdes', name: 'Angsuran Masuk', type: 'income' },
  { workspace_id: 'kopdes', name: 'Dana Hibah/Penyertaan', type: 'income' },
  { workspace_id: 'kopdes', name: 'Lain-lain', type: 'income' },
  // Kopdes - Expense (Sesuai PRD 3.3)
  { workspace_id: 'kopdes', name: 'Belanja Barang Unit', type: 'expense' },
  { workspace_id: 'kopdes', name: 'Biaya Operasional Kantor (ATK/Listrik/Konsumsi)', type: 'expense' },
  { workspace_id: 'kopdes', name: 'Honor/Gaji Pengurus & Staf', type: 'expense' },
  { workspace_id: 'kopdes', name: 'Pencairan Pinjaman', type: 'expense' },
  { workspace_id: 'kopdes', name: 'Perjalanan Dinas/Rapat', type: 'expense' },
  { workspace_id: 'kopdes', name: 'Lain-lain', type: 'expense' }
];

/**
 * Seed default memakai ID deterministik + `updated_at` epoch lama:
 * - ID sama di semua perangkat -> upsert Supabase tidak menggandakan baris.
 * - `updated_at` lama -> versi remote (hasil edit user) selalu menang saat pull (LWW).
 */
export const SEED_EPOCH_ISO = '2024-01-01T00:00:00.000Z';
export const SEED_EPOCH_MS = Date.parse(SEED_EPOCH_ISO);

export const normName = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
export const accountKey = (a) => `${a.workspace_id}|${normName(a.name)}`;
export const categoryKey = (c) => `${c.workspace_id}|${c.type}|${normName(c.name)}`;
export const toTime = (iso) => {
  const t = new Date(iso || 0).getTime();
  return Number.isFinite(t) ? t : 0;
};
export const isUntouchedSeed = (r) => toTime(r.updated_at) === SEED_EPOCH_MS;

export function seedAccountId(a) {
  return deterministicUuidV7(`seed:account:${accountKey(a)}`, SEED_EPOCH_MS);
}

export function seedCategoryId(c) {
  return deterministicUuidV7(`seed:category:${categoryKey(c)}`, SEED_EPOCH_MS);
}

export async function seedDatabase(db, dedupeFn) {
  const wsCount = await db.workspaces.count();
  if (wsCount > 0) {
    // Pastikan type dan label terkini ada pada tiap workspace yang sudah ada
    const existingWorkspaces = await db.workspaces.toArray();
    for (const ws of existingWorkspaces) {
      const updates = {};
      if (!ws.type) {
        if (ws.id === 'business') updates.type = 'business';
        else if (ws.id === 'kopdes' || ws.id === 'pekerjaan') updates.type = 'pekerjaan';
        else updates.type = 'personal';
      }
      if (ws.id === 'personal' && ws.name === 'Pribadi') updates.name = 'Buku Pribadi';
      if (ws.id === 'business' && ws.name === 'Usaha') updates.name = 'Buku Usaha';
      if (ws.id === 'kopdes' && (ws.name === 'Kopdes' || ws.name === 'Manager Kopdes')) updates.name = 'Buku Pekerjaan';
      if (Object.keys(updates).length > 0) {
        await db.workspaces.update(ws.id, updates);
      }
    }

    // Pastikan dompet seed default yang belum pernah diubah user bersaldo awal 0
    const existingAccounts = await db.accounts.toArray();
    for (const acc of existingAccounts) {
      if (!acc.deleted_at && isUntouchedSeed(acc) && Number(acc.initial_balance) !== 0) {
        await db.accounts.update(acc.id, {
          initial_balance: 0,
          sync_status: 'pending'
        });
      }
    }

    // Sinkronisasi nama kategori lama Buku Pribadi jika masih memakai label sebelumnya
    const renameMap = {
      'Makan & Kebutuhan Rumah': 'Makan & Minuman',
      'Hasil Investasi / Bagi Hasil': 'Investasi / Bagi Hasil',
      'Pengeluaran Pribadi Lainnya': 'Pengeluaran Pribadi'
    };
    const personalCats = await db.categories.where('workspace_id').equals('personal').toArray();
    const nowUpdate = new Date().toISOString();
    for (const cat of personalCats) {
      if (!cat.deleted_at && renameMap[cat.name]) {
        const targetName = renameMap[cat.name];
        const alreadyExists = personalCats.some(
          (c) => !c.deleted_at && c.id !== cat.id && c.name.toLowerCase() === targetName.toLowerCase()
        );
        if (!alreadyExists) {
          await db.categories.update(cat.id, {
            name: targetName,
            updated_at: nowUpdate,
            sync_status: 'pending'
          });
        }
      }
    }
    if (dedupeFn) {
      await dedupeFn();
    }
    return;
  }

  await db.transaction('rw', db.workspaces, db.accounts, db.categories, async () => {
    // 1. Seed Workspaces: HANYA Buku Pribadi saat pertama kali dibuka
    await db.workspaces.bulkPut([
      {
        id: 'personal',
        name: 'Buku Pribadi',
        type: 'personal',
        currency: 'IDR',
        created_at: SEED_EPOCH_ISO,
        updated_at: SEED_EPOCH_ISO,
        deleted_at: null,
        sync_status: 'pending'
      }
    ]);

    // 2. Seed Accounts: HANYA dompet bawaan Buku Pribadi
    const personalAccounts = DEFAULT_ACCOUNTS
      .filter((a) => a.workspace_id === 'personal')
      .map((a) => ({
        id: seedAccountId(a),
        workspace_id: a.workspace_id,
        name: a.name,
        type: a.type,
        initial_balance: a.initial_balance,
        created_at: SEED_EPOCH_ISO,
        updated_at: SEED_EPOCH_ISO,
        deleted_at: null,
        sync_status: 'pending'
      }));
    await db.accounts.bulkPut(personalAccounts);

    // 3. Seed Categories: HANYA kategori bawaan Buku Pribadi
    const personalCategories = DEFAULT_CATEGORIES
      .filter((c) => c.workspace_id === 'personal')
      .map((c) => ({
        id: seedCategoryId(c),
        workspace_id: c.workspace_id,
        name: c.name,
        type: c.type,
        created_at: SEED_EPOCH_ISO,
        updated_at: SEED_EPOCH_ISO,
        deleted_at: null,
        sync_status: 'pending'
      }));

    await db.categories.bulkPut(personalCategories);
  });
}

