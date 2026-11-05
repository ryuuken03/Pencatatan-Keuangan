import { accountKey, categoryKey, isUntouchedSeed, toTime } from './seed.js';

/**
 * Rencana merge duplikat dalam satu tabel berdasarkan natural key.
 * Kanonik = record aktif non-seed-asli dengan ID terkecil (deterministik di semua perangkat).
 * Nilai field diambil dari record yang paling baru diubah. Duplikat -> soft delete + `merged_into`.
 */
export function planMerge(records, keyFn, fields, referencedIds, now) {
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

export function resolveMergedId(map, id) {
  let cur = id;
  let guard = 0;
  while (cur && map.has(cur) && guard++ < 32) cur = map.get(cur);
  return cur;
}

/**
 * Gabungkan Dompet & Kategori duplikat (nama sama dalam buku yang sama),
 * lalu remap seluruh referensi transaksi ke ID kanonik.
 */
export async function dedupeAccountsAndCategories(db) {
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

