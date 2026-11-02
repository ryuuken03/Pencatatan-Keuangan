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

// Versi 2: Tabel terpisah `transaction_items` (Opsional 0..N item per transaksi)
db.version(2)
  .stores({
    workspaces: 'id, name, currency',
    accounts: 'id, workspace_id, name, type, updated_at, deleted_at, sync_status',
    categories: 'id, workspace_id, name, type, updated_at, deleted_at, sync_status',
    transactions: 'id, workspace_id, account_id, to_account_id, category_id, type, date, created_at, updated_at, deleted_at, sync_status',
    transaction_items: 'id, transaction_id, workspace_id, name, sort_order, updated_at, deleted_at, sync_status'
  })
  .upgrade(async (trans) => {
    const txs = await trans.table('transactions').toArray();
    const now = new Date().toISOString();
    const itemsToInsert = [];

    for (const tx of txs) {
      if (Array.isArray(tx.metadata?.items) && tx.metadata.items.length > 0) {
        tx.metadata.items.forEach((it, idx) => {
          const name = String(it?.name || '').trim();
          const amount = Math.round(Number(it?.amount) || 0);
          if (name || amount > 0) {
            itemsToInsert.push({
              id: uuidv7(),
              transaction_id: String(tx.id),
              workspace_id: String(tx.workspace_id || 'personal'),
              name: name || `Item ${idx + 1}`,
              amount,
              sort_order: idx,
              created_at: String(tx.created_at || now),
              updated_at: now,
              deleted_at: tx.deleted_at || null,
              sync_status: 'pending'
            });
          }
        });

        const cleanMeta = { ...tx.metadata };
        delete cleanMeta.items;
        await trans.table('transactions').update(tx.id, { metadata: cleanMeta });
      }
    }

    if (itemsToInsert.length > 0) {
      await trans.table('transaction_items').bulkPut(itemsToInsert);
    }
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
 * Helper ambil semua data aktif (deleted_at === null) beserta relasi opsional `transaction_items`
 */
export async function loadAppData() {
  const [workspaces, allAccounts, allCategories, allTransactions, allTxItems] = await Promise.all([
    db.workspaces.toArray(),
    db.accounts.filter((a) => !a.deleted_at).toArray(),
    db.categories.filter((c) => !c.deleted_at).toArray(),
    db.transactions.filter((t) => !t.deleted_at).toArray(),
    db.transaction_items.filter((it) => !it.deleted_at).toArray()
  ]);

  // Kelompokkan item produk berdasarkan transaction_id
  allTxItems.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const itemsByTxId = {};
  for (const item of allTxItems) {
    if (!itemsByTxId[item.transaction_id]) {
      itemsByTxId[item.transaction_id] = [];
    }
    itemsByTxId[item.transaction_id].push(item);
  }

  for (const tx of allTransactions) {
    tx.items = itemsByTxId[tx.id] || [];
  }

  // Urutkan transaksi dari terbaru ke terlama
  allTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    workspaces,
    accounts: allAccounts,
    categories: allCategories,
    transactions: allTransactions,
    transactionItems: allTxItems
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
 * CRUD Transaksi + Tabel Opsional `transaction_items` (0..N item produk)
 */
export async function saveTransaction(txData) {
  const now = new Date().toISOString();
  const isNew = !txData.id;
  const txId = String(txData.id || uuidv7());
  const wsId = String(txData.workspace_id || 'personal');

  const rawItems = Array.isArray(txData.items)
    ? txData.items
    : Array.isArray(txData.metadata?.items)
      ? txData.metadata.items
      : [];

  const validItems = rawItems
    .map((it, idx) => ({
      id: it?.id && String(it.id).length > 10 ? String(it.id) : uuidv7(),
      transaction_id: txId,
      workspace_id: wsId,
      name: String(it?.name || '').trim(),
      amount: Math.round(Number(it?.amount) || 0),
      sort_order: idx,
      created_at: String(it?.created_at || now),
      updated_at: now,
      deleted_at: null,
      sync_status: 'pending'
    }))
    .filter((it) => it.name !== '' || it.amount > 0)
    .map((it, idx) => ({
      ...it,
      name: it.name || `Produk ${idx + 1}`,
      sort_order: idx
    }));

  const rawBlob = txData.attachment_blob;
  const safeBlob =
    rawBlob instanceof Blob
      ? new Blob([rawBlob], { type: rawBlob.type || 'image/webp' })
      : null;

  const record = {
    id: txId,
    workspace_id: wsId,
    account_id: String(txData.account_id || ''),
    to_account_id: txData.type === 'transfer' && txData.to_account_id ? String(txData.to_account_id) : null,
    category_id: txData.type === 'transfer' || !txData.category_id ? null : String(txData.category_id),
    type: String(txData.type || 'expense'),
    amount: Math.round(Number(txData.amount) || 0),
    date: String(txData.date || now),
    note: String(txData.note || '').trim(),
    metadata: {
      no_bukti: String(txData.metadata?.no_bukti || ''),
      unit_usaha: String(txData.metadata?.unit_usaha || ''),
      pic_pihak: String(txData.metadata?.pic_pihak || ''),
      reimburse_status: String(txData.metadata?.reimburse_status || 'none'),
      reimburse_from_account_id: txData.metadata?.reimburse_from_account_id
        ? String(txData.metadata.reimburse_from_account_id)
        : null,
      reimburse_settled_at: txData.metadata?.reimburse_settled_at
        ? String(txData.metadata.reimburse_settled_at)
        : null
    },
    attachment_blob: safeBlob,
    created_at: String(isNew ? now : (txData.created_at || now)),
    updated_at: now,
    deleted_at: null,
    sync_status: 'pending'
  };

  await db.transaction('rw', db.transactions, db.transaction_items, async () => {
    await db.transactions.put(record);

    // Ambil item lama dari transaksi ini (jika edit transaksi)
    const existingItems = await db.transaction_items
      .where('transaction_id')
      .equals(txId)
      .toArray();

    const keptIds = new Set(validItems.map((it) => it.id));
    const toSoftDelete = existingItems
      .filter((oldIt) => !oldIt.deleted_at && !keptIds.has(oldIt.id))
      .map((oldIt) => ({
        ...oldIt,
        deleted_at: now,
        updated_at: now,
        sync_status: 'pending'
      }));

    if (toSoftDelete.length > 0) {
      await db.transaction_items.bulkPut(toSoftDelete);
    }

    if (validItems.length > 0) {
      await db.transaction_items.bulkPut(validItems);
    }
  });

  return {
    ...record,
    items: validItems
  };
}

export async function softDeleteTransaction(id) {
  const now = new Date().toISOString();
  await db.transaction('rw', db.transactions, db.transaction_items, async () => {
    await db.transactions.update(id, {
      deleted_at: now,
      updated_at: now,
      sync_status: 'pending'
    });

    const existingItems = await db.transaction_items
      .where('transaction_id')
      .equals(id)
      .toArray();

    if (existingItems.length > 0) {
      await db.transaction_items.bulkPut(
        existingItems.map((it) => ({
          ...it,
          deleted_at: now,
          updated_at: now,
          sync_status: 'pending'
        }))
      );
    }
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
    id: String(catData.id || uuidv7()),
    workspace_id: String(catData.workspace_id || 'personal'),
    name: String(catData.name || '').trim(),
    type: String(catData.type || 'expense'),
    keywords: String(catData.keywords || '').trim(),
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

