import Dexie from 'dexie';
import { uuidv7, deterministicUuidV7 } from './utils.js';
import { blobToSerializable, serializableToBlob } from './utils/cryptoBackup.js';
import { normalizeForMatch } from './utils/fuzzyMatcher.js';

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

// Versi 3: Tabel `item_aliases` (Kamus Koreksi OCR Typo -> Nama Resmi, Kapasitas Terbatas)
db.version(3).stores({
  workspaces: 'id, name, currency',
  accounts: 'id, workspace_id, name, type, updated_at, deleted_at, sync_status',
  categories: 'id, workspace_id, name, type, updated_at, deleted_at, sync_status',
  transactions: 'id, workspace_id, account_id, to_account_id, category_id, type, date, created_at, updated_at, deleted_at, sync_status',
  transaction_items: 'id, transaction_id, workspace_id, name, sort_order, updated_at, deleted_at, sync_status',
  item_aliases: 'id, ocr_key, canonical_name, merchant, hit_count, workspace_id, updated_at, deleted_at, sync_status'
});

export const MAX_ITEM_ALIASES = 2000;

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
const SEED_EPOCH_MS = Date.parse(SEED_EPOCH_ISO);

const normName = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
const accountKey = (a) => `${a.workspace_id}|${normName(a.name)}`;
const categoryKey = (c) => `${c.workspace_id}|${c.type}|${normName(c.name)}`;
const toTime = (iso) => {
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

export async function seedDatabase() {
  const wsCount = await db.workspaces.count();
  if (wsCount > 0) {
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
    await dedupeAccountsAndCategories();
    return;
  }

  await db.transaction('rw', db.workspaces, db.accounts, db.categories, async () => {
    // 1. Seed Workspaces
    await db.workspaces.bulkPut([
      { id: 'personal', name: 'Pribadi', currency: 'IDR' },
      { id: 'business', name: 'Usaha', currency: 'IDR' },
      { id: 'kopdes', name: 'Kopdes', currency: 'IDR' }
    ]);

    // 2. Seed Accounts (ID deterministik)
    const accounts = DEFAULT_ACCOUNTS.map((a) => ({
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
    await db.accounts.bulkPut(accounts);

    // 3. Seed Categories (ID deterministik)
    const categories = DEFAULT_CATEGORIES.map((c) => ({
      id: seedCategoryId(c),
      workspace_id: c.workspace_id,
      name: c.name,
      type: c.type,
      created_at: SEED_EPOCH_ISO,
      updated_at: SEED_EPOCH_ISO,
      deleted_at: null,
      sync_status: 'pending'
    }));

    await db.categories.bulkPut(categories);
  });
}

/**
 * Rencana merge duplikat dalam satu tabel berdasarkan natural key.
 * Kanonik = record aktif non-seed-asli dengan ID terkecil (deterministik di semua perangkat).
 * Nilai field diambil dari record yang paling baru diubah. Duplikat -> soft delete + `merged_into`.
 */
function planMerge(records, keyFn, fields, referencedIds, now) {
  const groups = new Map();
  for (const r of records) {
    if (r.merged_into) continue;
    const k = keyFn(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }

  const changes = [];
  for (const group of groups.values()) {
    const active = group.filter((r) => !r.deleted_at);
    if (active.length === 0) continue;

    if (active.length === 1) {
      // Default yang pernah dihapus user di perangkat lain jangan dihidupkan lagi oleh seed baru
      const only = active[0];
      if (isUntouchedSeed(only) && !referencedIds.has(only.id) && group.some((r) => r.deleted_at)) {
        changes.push({ ...only, deleted_at: now, updated_at: now, sync_status: 'pending' });
      }
      continue;
    }

    const sorted = [...active].sort((a, b) => {
      const sa = isUntouchedSeed(a) ? 1 : 0;
      const sb = isUntouchedSeed(b) ? 1 : 0;
      if (sa !== sb) return sa - sb;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    const canonical = sorted[0];
    const latest = active.reduce(
      (best, r) => (toTime(r.updated_at) > toTime(best.updated_at) ? r : best),
      canonical
    );

    if (latest !== canonical) {
      const patched = { ...canonical };
      let changed = false;
      for (const f of fields) {
        if (latest[f] !== undefined && latest[f] !== canonical[f]) {
          patched[f] = latest[f];
          changed = true;
        }
      }
      if (changed) changes.push({ ...patched, updated_at: now, sync_status: 'pending' });
    }

    for (const dup of sorted.slice(1)) {
      changes.push({
        ...dup,
        merged_into: canonical.id,
        deleted_at: now,
        updated_at: now,
        sync_status: 'pending'
      });
    }
  }
  return changes;
}

function resolveMergedId(map, id) {
  let cur = id;
  let guard = 0;
  while (cur && map.has(cur) && guard++ < 32) cur = map.get(cur);
  return cur;
}

/**
 * Gabungkan Dompet & Kategori duplikat (nama sama dalam buku yang sama),
 * lalu remap seluruh referensi transaksi ke ID kanonik.
 */
export async function dedupeAccountsAndCategories() {
  const now = new Date().toISOString();
  let merged = 0;
  let remapped = 0;

  await db.transaction('rw', db.accounts, db.categories, db.transactions, async () => {
    const [accounts, categories, txs] = await Promise.all([
      db.accounts.toArray(),
      db.categories.toArray(),
      db.transactions.toArray()
    ]);

    const referenced = new Set();
    for (const tx of txs) {
      if (tx.deleted_at) continue;
      if (tx.account_id) referenced.add(tx.account_id);
      if (tx.to_account_id) referenced.add(tx.to_account_id);
      if (tx.category_id) referenced.add(tx.category_id);
      if (tx.metadata?.reimburse_from_account_id) referenced.add(tx.metadata.reimburse_from_account_id);
    }

    const accChanges = planMerge(accounts, accountKey, ['name', 'type', 'initial_balance'], referenced, now);
    const catChanges = planMerge(categories, categoryKey, ['name', 'type', 'keywords'], referenced, now);

    if (accChanges.length) await db.accounts.bulkPut(accChanges);
    if (catChanges.length) await db.categories.bulkPut(catChanges);
    merged = accChanges.filter((r) => r.merged_into).length + catChanges.filter((r) => r.merged_into).length;

    // Peta remap (termasuk merge lama dari perangkat lain via `merged_into`)
    const accMap = new Map();
    const catMap = new Map();
    const accChangeById = new Map(accChanges.map((r) => [r.id, r]));
    const catChangeById = new Map(catChanges.map((r) => [r.id, r]));
    for (const a of accounts) {
      const cur = accChangeById.get(a.id) || a;
      if (cur.merged_into) accMap.set(cur.id, cur.merged_into);
    }
    for (const c of categories) {
      const cur = catChangeById.get(c.id) || c;
      if (cur.merged_into) catMap.set(cur.id, cur.merged_into);
    }
    if (accMap.size === 0 && catMap.size === 0) return;

    const txUpdates = [];
    for (const tx of txs) {
      if (tx.deleted_at) continue;
      const meta = tx.metadata || {};
      const accountId = resolveMergedId(accMap, tx.account_id);
      const toAccountId = tx.to_account_id ? resolveMergedId(accMap, tx.to_account_id) : tx.to_account_id;
      const categoryId = tx.category_id ? resolveMergedId(catMap, tx.category_id) : tx.category_id;
      const reimburseFrom = meta.reimburse_from_account_id
        ? resolveMergedId(accMap, meta.reimburse_from_account_id)
        : meta.reimburse_from_account_id;

      if (
        accountId !== tx.account_id ||
        toAccountId !== tx.to_account_id ||
        categoryId !== tx.category_id ||
        reimburseFrom !== meta.reimburse_from_account_id
      ) {
        txUpdates.push({
          ...tx,
          account_id: accountId,
          to_account_id: toAccountId,
          category_id: categoryId,
          metadata: { ...meta, reimburse_from_account_id: reimburseFrom ?? null },
          updated_at: now,
          sync_status: 'pending'
        });
      }
    }
    if (txUpdates.length) await db.transactions.bulkPut(txUpdates);
    remapped = txUpdates.length;
  });

  return { merged, remapped };
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
  const existing = accData.id ? await db.accounts.get(accData.id) : null;
  const record = {
    id: accData.id || uuidv7(),
    workspace_id: accData.workspace_id,
    name: accData.name.trim(),
    type: accData.type || 'cash',
    initial_balance: Math.round(Number(accData.initial_balance) || 0),
    created_at: existing?.created_at || now,
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
  const existing = catData.id ? await db.categories.get(String(catData.id)) : null;
  const record = {
    id: String(catData.id || uuidv7()),
    workspace_id: String(catData.workspace_id || 'personal'),
    name: String(catData.name || '').trim(),
    type: String(catData.type || 'expense'),
    keywords: String(catData.keywords || '').trim(),
    created_at: existing?.created_at || now,
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

/**
 * Rekam atau perbarui alias typo OCR -> Nama Barang Resmi (Kamus Mandiri OCR)
 * Batas maksimal MAX_ITEM_ALIASES terjaga tanpa auto-delete berbasis umur (hanya evict LFU/LRU jika kapasitas penuh).
 * @param {Array<{ ocrKey: string, canonicalName: string, merchant?: string, workspaceId?: string }>} rawAliases
 */
export async function recordItemAliases(rawAliases = []) {
  if (!Array.isArray(rawAliases) || rawAliases.length === 0) return 0;
  const now = new Date().toISOString();
  let recordedCount = 0;

  await db.transaction('rw', db.item_aliases, async () => {
    const existingList = await db.item_aliases.filter((a) => !a.deleted_at).toArray();
    const map = new Map(existingList.map((a) => [a.ocr_key, a]));

    for (const raw of rawAliases) {
      const ocrRaw = String(raw.ocrKey || raw.rawOcrText || '').trim();
      const canonical = String(raw.canonicalName || '').trim();
      const merchant = String(raw.merchant || '').trim();
      const wsId = String(raw.workspaceId || 'personal');

      if (!ocrRaw || !canonical) continue;
      const ocrKey = normalizeForMatch(ocrRaw).replace(/ /g, '');
      const canonicalKey = normalizeForMatch(canonical).replace(/ /g, '');

      // Abaikan jika terlalu pendek atau sama persis
      if (ocrKey.length < 3 || ocrKey === canonicalKey) continue;

      const existing = map.get(ocrKey);
      if (existing) {
        existing.canonical_name = canonical;
        if (merchant) existing.merchant = merchant;
        existing.hit_count = (Number(existing.hit_count) || 1) + 1;
        existing.workspace_id = wsId || existing.workspace_id || 'personal';
        existing.updated_at = now;
        existing.deleted_at = null;
        existing.sync_status = 'pending';
        recordedCount++;
      } else {
        const newRecord = {
          id: uuidv7(),
          ocr_key: ocrKey,
          canonical_name: canonical,
          merchant,
          hit_count: 1,
          workspace_id: wsId,
          created_at: now,
          updated_at: now,
          deleted_at: null,
          sync_status: 'pending'
        };
        map.set(ocrKey, newRecord);
        recordedCount++;
      }
    }

    const allEntries = Array.from(map.values());
    const toDeleteIds = [];

    if (allEntries.length > MAX_ITEM_ALIASES) {
      allEntries.sort((a, b) => {
        if ((a.hit_count || 1) !== (b.hit_count || 1)) {
          return (a.hit_count || 1) - (b.hit_count || 1);
        }
        return String(a.updated_at || '').localeCompare(String(b.updated_at || ''));
      });
      const overflowCount = allEntries.length - MAX_ITEM_ALIASES;
      for (let i = 0; i < overflowCount; i++) {
        toDeleteIds.push(allEntries[i].id);
      }
      allEntries.splice(0, overflowCount);
    }

    if (toDeleteIds.length > 0) {
      await db.item_aliases.bulkDelete(toDeleteIds);
    }
    await db.item_aliases.bulkPut(allEntries);
  });

  return recordedCount;
}

/**
 * Ambil seluruh kamus alias aktif dari Dexie
 */
export async function loadItemAliases() {
  return db.item_aliases.filter((a) => !a.deleted_at).toArray();
}

/**
 * Statistik Database & Storage (Modul 1C)
 */
export async function getDatabaseStats() {
  const [accounts, categories, transactions, txItems, aliases] = await Promise.all([
    db.accounts.toArray(),
    db.categories.toArray(),
    db.transactions.toArray(),
    db.transaction_items.toArray(),
    db.item_aliases.toArray()
  ]);

  let attachmentCount = 0;
  let attachmentBytes = 0;
  let softDeletedCount = 0;

  for (const a of accounts) if (a.deleted_at) softDeletedCount++;
  for (const c of categories) if (c.deleted_at) softDeletedCount++;
  for (const it of txItems) if (it.deleted_at) softDeletedCount++;
  for (const al of aliases) if (al.deleted_at) softDeletedCount++;

  for (const tx of transactions) {
    if (tx.deleted_at) {
      softDeletedCount++;
    } else if (tx.attachment_blob instanceof Blob) {
      attachmentCount++;
      attachmentBytes += tx.attachment_blob.size || 0;
    }
  }

  return {
    activeAccounts: accounts.filter((a) => !a.deleted_at).length,
    activeCategories: categories.filter((c) => !c.deleted_at).length,
    activeTransactions: transactions.filter((t) => !t.deleted_at).length,
    activeItems: txItems.filter((it) => !it.deleted_at).length,
    activeAliases: aliases.filter((al) => !al.deleted_at).length,
    attachmentCount,
    attachmentKB: Math.round(attachmentBytes / 1024),
    softDeletedCount
  };
}

/**
 * Database Compaction (PRD 6.2.3): Bersihkan secara permanen baris yang sudah di-soft-delete
 */
export async function compactDatabase() {
  let purged = 0;
  await db.transaction(
    'rw',
    db.accounts,
    db.categories,
    db.transactions,
    db.transaction_items,
    db.item_aliases,
    async () => {
      const delAccounts = await db.accounts.filter((a) => Boolean(a.deleted_at)).primaryKeys();
      const delCategories = await db.categories.filter((c) => Boolean(c.deleted_at)).primaryKeys();
      const delTxs = await db.transactions.filter((t) => Boolean(t.deleted_at)).primaryKeys();
      const delItems = await db.transaction_items.filter((it) => Boolean(it.deleted_at)).primaryKeys();
      const delAliases = await db.item_aliases.filter((al) => Boolean(al.deleted_at)).primaryKeys();

      if (delAccounts.length) await db.accounts.bulkDelete(delAccounts);
      if (delCategories.length) await db.categories.bulkDelete(delCategories);
      if (delTxs.length) await db.transactions.bulkDelete(delTxs);
      if (delItems.length) await db.transaction_items.bulkDelete(delItems);
      if (delAliases.length) await db.item_aliases.bulkDelete(delAliases);

      purged = delAccounts.length + delCategories.length + delTxs.length + delItems.length + delAliases.length;
    }
  );
  return purged;
}

/**
 * Ekspor seluruh isi database ke objek JSON-ready (termasuk serialisasi Blob struk WebP)
 */
export async function exportDatabasePayload({ includeAttachments = true } = {}) {
  const [workspaces, accounts, categories, transactions, transaction_items, item_aliases] = await Promise.all([
    db.workspaces.toArray(),
    db.accounts.toArray(),
    db.categories.toArray(),
    db.transactions.toArray(),
    db.transaction_items.toArray(),
    db.item_aliases.toArray()
  ]);

  const serializedTransactions = [];
  for (const tx of transactions) {
    const copy = { ...tx };
    if (includeAttachments && tx.attachment_blob instanceof Blob) {
      copy.attachment_blob = await blobToSerializable(tx.attachment_blob);
    } else {
      copy.attachment_blob = null;
    }
    serializedTransactions.push(copy);
  }

  return {
    app: 'buku-kas-multi-workspace',
    schema_version: 3,
    exported_at: new Date().toISOString(),
    data: {
      workspaces,
      accounts,
      categories,
      transactions: serializedTransactions,
      transaction_items,
      item_aliases
    }
  };
}

/**
 * Restore objek hasil backup ke dalam Dexie.js
 * @param {object} payload - Objek yang sudah didekripsi (memiliki properti `data`)
 * @param {object} options - `{ mode: 'merge' | 'replace' }`
 */
export async function restoreDatabasePayload(payload, { mode = 'merge' } = {}) {
  const data = payload?.data || payload;
  if (!data || (!Array.isArray(data.transactions) && !Array.isArray(data.accounts))) {
    throw new Error('Format file backup tidak valid atau tabel tidak ditemukan.');
  }

  const workspaces = Array.isArray(data.workspaces) ? data.workspaces : [];
  const accounts = Array.isArray(data.accounts) ? data.accounts : [];
  const categories = Array.isArray(data.categories) ? data.categories : [];
  const rawTransactions = Array.isArray(data.transactions) ? data.transactions : [];
  const transactionItems = Array.isArray(data.transaction_items) ? data.transaction_items : [];
  const itemAliases = Array.isArray(data.item_aliases) ? data.item_aliases : [];

  const hydratedTransactions = rawTransactions.map((tx) => ({
    ...tx,
    amount: Math.round(Number(tx.amount) || 0),
    attachment_blob: serializableToBlob(tx.attachment_blob)
  }));

  await db.transaction(
    'rw',
    db.workspaces,
    db.accounts,
    db.categories,
    db.transactions,
    db.transaction_items,
    db.item_aliases,
    async () => {
      if (mode === 'replace') {
        await Promise.all([
          db.workspaces.clear(),
          db.accounts.clear(),
          db.categories.clear(),
          db.transactions.clear(),
          db.transaction_items.clear(),
          db.item_aliases.clear()
        ]);
      }

      if (workspaces.length > 0) await db.workspaces.bulkPut(workspaces);
      if (accounts.length > 0) await db.accounts.bulkPut(accounts);
      if (categories.length > 0) await db.categories.bulkPut(categories);
      if (hydratedTransactions.length > 0) await db.transactions.bulkPut(hydratedTransactions);
      if (transactionItems.length > 0) await db.transaction_items.bulkPut(transactionItems);
      if (itemAliases.length > 0) await db.item_aliases.bulkPut(itemAliases);
    }
  );

  // Pastikan workspace default tetap ada jika kosong
  await seedDatabase();

  return {
    accounts: accounts.length,
    categories: categories.length,
    transactions: hydratedTransactions.length,
    items: transactionItems.length,
    aliases: itemAliases.length
  };
}

/**
 * Import daftar baris transaksi hasil baca file Excel (.xlsx) ke Dexie.js
 * Otomatis mencocokkan nama dompet & kategori atau membuatnya jika belum ada.
 */
export async function importTransactionsFromXlsxRows(parsedRows = []) {
  if (!Array.isArray(parsedRows) || parsedRows.length === 0) {
    throw new Error('Tidak ada baris transaksi untuk di-import.');
  }

  const now = new Date().toISOString();
  const [existingAccounts, existingCategories] = await Promise.all([
    db.accounts.filter((a) => !a.deleted_at).toArray(),
    db.categories.filter((c) => !c.deleted_at).toArray()
  ]);

  const accountsList = [...existingAccounts];
  const categoriesList = [...existingCategories];
  const newAccounts = [];
  const newCategories = [];

  function resolveAccountId(wsId, accName) {
    const clean = String(accName || '').trim();
    if (clean) {
      const found = accountsList.find(
        (a) => a.workspace_id === wsId && a.name.toLowerCase() === clean.toLowerCase()
      );
      if (found) return found.id;

      // Buat dompet baru jika belum ada
      const created = {
        id: uuidv7(),
        workspace_id: wsId,
        name: clean,
        type: clean.toLowerCase().includes('bank') || clean.toLowerCase().includes('bri') || clean.toLowerCase().includes('rekening')
          ? 'bank'
          : clean.toLowerCase().includes('wallet')
            ? 'ewallet'
            : 'cash',
        initial_balance: 0,
        updated_at: now,
        deleted_at: null,
        sync_status: 'pending'
      };
      accountsList.push(created);
      newAccounts.push(created);
      return created.id;
    }

    // Fallback ke dompet pertama pada workspace tersebut
    const fallback = accountsList.find((a) => a.workspace_id === wsId);
    return fallback ? fallback.id : '';
  }

  function resolveCategoryId(wsId, catName, txType) {
    if (txType === 'transfer') return null;
    const clean = String(catName || '').trim();
    const catType = txType === 'income' ? 'income' : 'expense';

    if (clean && !clean.toLowerCase().startsWith('transfer ke')) {
      const found = categoriesList.find(
        (c) => c.workspace_id === wsId && c.name.toLowerCase() === clean.toLowerCase()
      );
      if (found) return found.id;

      const created = {
        id: uuidv7(),
        workspace_id: wsId,
        name: clean,
        type: catType,
        keywords: '',
        updated_at: now,
        deleted_at: null,
        sync_status: 'pending'
      };
      categoriesList.push(created);
      newCategories.push(created);
      return created.id;
    }

    const fallback = categoriesList.find((c) => c.workspace_id === wsId && c.type === catType);
    return fallback ? fallback.id : null;
  }

  const txsToPut = [];
  const itemsToPut = [];

  for (const row of parsedRows) {
    const wsId = row.workspace_id || 'personal';
    const txId = row.id || uuidv7();
    const accountId = resolveAccountId(wsId, row.accountName);
    const toAccountId =
      row.type === 'transfer' && row.toAccountName
        ? resolveAccountId(wsId, row.toAccountName)
        : null;
    const categoryId = resolveCategoryId(wsId, row.categoryName, row.type);

    let reimburseFromId = null;
    if (
      (row.metadata?.reimburse_status === 'pending' || row.metadata?.reimburse_status === 'settled') &&
      wsId !== 'personal'
    ) {
      reimburseFromId = resolveAccountId('personal', row.metadata?.reimburseFromName || 'Dompet Tunai');
    }

    txsToPut.push({
      id: txId,
      workspace_id: wsId,
      account_id: accountId,
      to_account_id: toAccountId,
      category_id: categoryId,
      type: row.type || 'expense',
      amount: Math.round(Number(row.amount) || 0),
      date: row.date || now,
      note: row.note || '',
      metadata: {
        no_bukti: row.metadata?.no_bukti || '',
        unit_usaha: row.metadata?.unit_usaha || '',
        pic_pihak: row.metadata?.pic_pihak || '',
        reimburse_status: row.metadata?.reimburse_status || 'none',
        reimburse_from_account_id: reimburseFromId,
        reimburse_settled_at: row.metadata?.reimburse_status === 'settled' ? now : null
      },
      attachment_blob: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      sync_status: 'pending'
    });

    if (Array.isArray(row.items) && row.items.length > 0) {
      row.items.forEach((it, idx) => {
        if (it.name || it.amount > 0) {
          itemsToPut.push({
            id: uuidv7(),
            transaction_id: txId,
            workspace_id: wsId,
            name: String(it.name || `Produk ${idx + 1}`).trim(),
            amount: Math.round(Number(it.amount) || 0),
            sort_order: idx,
            created_at: now,
            updated_at: now,
            deleted_at: null,
            sync_status: 'pending'
          });
        }
      });
    }
  }

  await db.transaction(
    'rw',
    db.accounts,
    db.categories,
    db.transactions,
    db.transaction_items,
    async () => {
      if (newAccounts.length > 0) await db.accounts.bulkPut(newAccounts);
      if (newCategories.length > 0) await db.categories.bulkPut(newCategories);
      if (txsToPut.length > 0) await db.transactions.bulkPut(txsToPut);
      if (itemsToPut.length > 0) await db.transaction_items.bulkPut(itemsToPut);
    }
  );

  return {
    importedCount: txsToPut.length,
    newAccountsCount: newAccounts.length,
    newCategoriesCount: newCategories.length
  };
}



