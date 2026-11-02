import Dexie from 'dexie';
import { uuidv7 } from './utils.js';

export const db = new Dexie('AplikasiKeuanganDB');

// Skema Bagian 5 PRD.md
db.version(1).stores({
  workspaces: 'id, name, currency',
  accounts: 'id, workspace_id, name, type, updated_at, deleted_at, sync_status',
  categories: 'id, workspace_id, name, type, updated_at, deleted_at, sync_status',
  transactions: 'id, workspace_id, account_id, to_account_id, category_id, type, date, created_at, updated_at, deleted_at, sync_status'
});

export const KOPDES_UNITS = [
  'Unit Simpan Pinjam (USP)',
  'Unit Toko/Ritel',
  'Unit Pertanian/Pupuk',
  'Jasa/Lainnya',
  'Umum/Sekretariat'
];

export async function seedDatabase() {
  const wsCount = await db.workspaces.count();
  if (wsCount > 0) return;

  const now = new Date().toISOString();

  await db.transaction('rw', db.workspaces, db.accounts, db.categories, async () => {
    // 1. Seed Workspaces
    await db.workspaces.bulkPut([
      { id: 'personal', name: 'Pribadi', currency: 'IDR' },
      { id: 'business', name: 'Usaha', currency: 'IDR' },
      { id: 'kopdes', name: 'Kopdes', currency: 'IDR' }
    ]);

    // 2. Seed Accounts
    const accounts = [
      // Pribadi
      { id: uuidv7(), workspace_id: 'personal', name: 'Dompet Tunai', type: 'cash', initial_balance: 500000, updated_at: now, deleted_at: null, sync_status: 'pending' },
      { id: uuidv7(), workspace_id: 'personal', name: 'Bank Pribadi', type: 'bank', initial_balance: 5000000, updated_at: now, deleted_at: null, sync_status: 'pending' },
      { id: uuidv7(), workspace_id: 'personal', name: 'E-Wallet', type: 'ewallet', initial_balance: 250000, updated_at: now, deleted_at: null, sync_status: 'pending' },
      // Usaha
      { id: uuidv7(), workspace_id: 'business', name: 'Kas Tunai Usaha', type: 'cash', initial_balance: 1500000, updated_at: now, deleted_at: null, sync_status: 'pending' },
      { id: uuidv7(), workspace_id: 'business', name: 'Rekening Usaha', type: 'bank', initial_balance: 10000000, updated_at: now, deleted_at: null, sync_status: 'pending' },
      // Kopdes
      { id: uuidv7(), workspace_id: 'kopdes', name: 'Kas Kecil Kopdes', type: 'cash', initial_balance: 2000000, updated_at: now, deleted_at: null, sync_status: 'pending' },
      { id: uuidv7(), workspace_id: 'kopdes', name: 'BRI Kopdes', type: 'bank', initial_balance: 25000000, updated_at: now, deleted_at: null, sync_status: 'pending' }
    ];
    await db.accounts.bulkPut(accounts);

    // 3. Seed Categories
    const categoriesData = [
      // Pribadi - Income
      { workspace_id: 'personal', name: 'Gaji & Pendapatan', type: 'income' },
      { workspace_id: 'personal', name: 'Hasil Investasi / Bagi Hasil', type: 'income' },
      { workspace_id: 'personal', name: 'Pemasukan Lainnya', type: 'income' },
      // Pribadi - Expense
      { workspace_id: 'personal', name: 'Makan & Kebutuhan Rumah', type: 'expense' },
      { workspace_id: 'personal', name: 'Transportasi & BBM', type: 'expense' },
      { workspace_id: 'personal', name: 'Tagihan & Komunikasi', type: 'expense' },
      { workspace_id: 'personal', name: 'Kesehatan & Pendidikan', type: 'expense' },
      { workspace_id: 'personal', name: 'Pengeluaran Pribadi Lainnya', type: 'expense' },

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

    const categories = categoriesData.map((c) => ({
      id: uuidv7(),
      workspace_id: c.workspace_id,
      name: c.name,
      type: c.type,
      updated_at: now,
      deleted_at: null,
      sync_status: 'pending'
    }));

    await db.categories.bulkPut(categories);
  });
}

/**
 * Helper ambil semua data aktif (deleted_at === null)
 */
export async function loadAppData() {
  const [workspaces, allAccounts, allCategories, allTransactions] = await Promise.all([
    db.workspaces.toArray(),
    db.accounts.filter((a) => !a.deleted_at).toArray(),
    db.categories.filter((c) => !c.deleted_at).toArray(),
    db.transactions.filter((t) => !t.deleted_at).toArray()
  ]);

  // Urutkan transaksi dari terbaru ke terlama
  allTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    workspaces,
    accounts: allAccounts,
    categories: allCategories,
    transactions: allTransactions
  };
}

/**
 * Hitung saldo aktual tiap akun (Dompet) berdasarkan transaksi aktif, termasuk logika Dana Talangan / Reimburse
 * PRD 3.4:
 * - Pengeluaran Kopdes/Usaha dengan reimburse_status === 'pending' dan reimburse_from_account_id:
 *   1. Tercatat sebagai pengeluaran di buku Kopdes/Usaha (namun belum memotong kas Kopdes/Usaha karena ditalangi pribadi).
 *   2. Mengurangi saldo dompet di buku Pribadi (reimburse_from_account_id).
 * - Ketika ditandai 'settled' (Sudah Diganti):
 *   1. Saldo kas Kopdes/Usaha (tx.account_id) berkurang sebesar amount.
 *   2. Saldo dompet Pribadi (reimburse_from_account_id) kembali utuh (tidak lagi terpotong oleh talangan ini).
 */
export function computeAccountBalances(accounts, transactions) {
  const balances = {};
  for (const acc of accounts) {
    balances[acc.id] = Number(acc.initial_balance) || 0;
  }

  for (const tx of transactions) {
    if (tx.deleted_at) continue;
    const amt = Number(tx.amount) || 0;
    const meta = tx.metadata || {};

    if (tx.type === 'income') {
      if (balances[tx.account_id] !== undefined) {
        balances[tx.account_id] += amt;
      }
    } else if (tx.type === 'expense') {
      if (meta.reimburse_status === 'pending' && meta.reimburse_from_account_id) {
        // Ditalangi oleh dompet pribadi -> kurangi dompet pribadi
        if (balances[meta.reimburse_from_account_id] !== undefined) {
          balances[meta.reimburse_from_account_id] -= amt;
        }
      } else {
        // Normal expense atau reimburse 'settled' -> kurangi akun di buku terkait
        if (balances[tx.account_id] !== undefined) {
          balances[tx.account_id] -= amt;
        }
      }
    } else if (tx.type === 'transfer') {
      if (balances[tx.account_id] !== undefined) {
        balances[tx.account_id] -= amt;
      }
      if (tx.to_account_id && balances[tx.to_account_id] !== undefined) {
        balances[tx.to_account_id] += amt;
      }
    } else if (tx.type === 'debt') {
      // Kasbon/Utang Masuk (terima pinjaman menambah kas)
      if (balances[tx.account_id] !== undefined) {
        balances[tx.account_id] += amt;
      }
    } else if (tx.type === 'receivable') {
      // Kasbon/Piutang Keluar (memberi kasbon mengurangi kas)
      if (balances[tx.account_id] !== undefined) {
        balances[tx.account_id] -= amt;
      }
    }
  }

  return balances;
}

/**
 * CRUD Transaksi
 */
export async function saveTransaction(txData) {
  const now = new Date().toISOString();
  const isNew = !txData.id;
  const record = {
    id: txData.id || uuidv7(),
    workspace_id: txData.workspace_id,
    account_id: txData.account_id,
    to_account_id: txData.type === 'transfer' ? txData.to_account_id : null,
    category_id: txData.type === 'transfer' ? null : txData.category_id,
    type: txData.type,
    amount: Math.round(Number(txData.amount) || 0),
    date: txData.date || now,
    note: (txData.note || '').trim(),
    metadata: {
      no_bukti: txData.metadata?.no_bukti || '',
      unit_usaha: txData.metadata?.unit_usaha || '',
      pic_pihak: txData.metadata?.pic_pihak || '',
      items: Array.isArray(txData.metadata?.items) ? txData.metadata.items : [],
      reimburse_status: txData.metadata?.reimburse_status || 'none',
      reimburse_from_account_id: txData.metadata?.reimburse_from_account_id || null,
      reimburse_settled_at: txData.metadata?.reimburse_settled_at || null
    },
    attachment_blob: txData.attachment_blob || null,
    created_at: isNew ? now : (txData.created_at || now),
    updated_at: now,
    deleted_at: null,
    sync_status: 'pending'
  };

  await db.transactions.put(record);
  return record;
}

export async function softDeleteTransaction(id) {
  const now = new Date().toISOString();
  await db.transactions.update(id, {
    deleted_at: now,
    updated_at: now,
    sync_status: 'pending'
  });
}

/**
 * Tandai Dana Talangan Sudah Diganti (Settled)
 * PRD 3.4: Ketika uang diganti oleh bendahara/kas Kopdes, klik "Tandai Sudah Diganti" ->
 * saldo kas Kopdes (account_id) berkurang dan saldo dompet Pribadi kembali bertambah.
 */
export async function settleReimbursement(txId, targetWorkspaceAccountId = null) {
  const tx = await db.transactions.get(txId);
  if (!tx) return;
  const now = new Date().toISOString();
  const updatedMetadata = {
    ...(tx.metadata || {}),
    reimburse_status: 'settled',
    reimburse_settled_at: now
  };
  const updates = {
    metadata: updatedMetadata,
    updated_at: now,
    sync_status: 'pending'
  };
  if (targetWorkspaceAccountId) {
    updates.account_id = targetWorkspaceAccountId;
  }
  await db.transactions.update(txId, updates);
}

/**
 * CRUD Dompet
 */
export async function saveAccount(accData) {
  const now = new Date().toISOString();
  const record = {
    id: accData.id || uuidv7(),
    workspace_id: accData.workspace_id,
    name: accData.name.trim(),
    type: accData.type || 'cash',
    initial_balance: Math.round(Number(accData.initial_balance) || 0),
    updated_at: now,
    deleted_at: null,
    sync_status: 'pending'
  };
  await db.accounts.put(record);
  return record;
}

export async function softDeleteAccount(id) {
  const now = new Date().toISOString();
  await db.accounts.update(id, {
    deleted_at: now,
    updated_at: now,
    sync_status: 'pending'
  });
}

/**
 * CRUD Kategori
 */
export async function saveCategory(catData) {
  const now = new Date().toISOString();
  const record = {
    id: catData.id || uuidv7(),
    workspace_id: catData.workspace_id,
    name: catData.name.trim(),
    type: catData.type || 'expense',
    updated_at: now,
    deleted_at: null,
    sync_status: 'pending'
  };
  await db.categories.put(record);
  return record;
}

export async function softDeleteCategory(id) {
  const now = new Date().toISOString();
  await db.categories.update(id, {
    deleted_at: now,
    updated_at: now,
    sync_status: 'pending'
  });
}

