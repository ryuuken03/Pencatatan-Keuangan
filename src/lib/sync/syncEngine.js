/**
 * Sync Engine — Delta Sync Coordinator antara Dexie.js (IndexedDB) dan Supabase
 *
 * Prinsip Kerja:
 * 1. 100% Offline-First: Semua aktivitas baca/tulis selalu ke IndexedDB lokal terlebih dahulu.
 * 2. Delta Pull: Hanya menarik baris remote yang memiliki `updated_at > last_synced_at` (cursor per user).
 * 3. Dedupe: Gabungkan Dompet/Kategori duplikat (nama sama per buku) + remap referensi transaksi.
 * 4. Delta Push: Hanya mengirim baris lokal yang memiliki `sync_status = 'pending'`.
 * 5. Resolusi Konflik: Last-Write-Wins (LWW) berdasarkan `updated_at`.
 *
 * Urutan Pull -> Dedupe -> Push mencegah seed default perangkat baru menimpa / menggandakan data remote.
 */

import { db, dedupeAccountsAndCategories } from '../db.js';
import { supabaseAdapter } from './supabaseAdapter.js';
import { blobToSerializable, serializableToBlob } from '../utils/cryptoBackup.js';

class SyncEngine {
  constructor() {
    this.isSyncing = false;
    this.lastError = null;
    this.listeners = new Set();
    this.autoSyncTimer = null;

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        const config = supabaseAdapter.getConfig();
        if (config.autoSync && config.isAuthenticated) {
          this.runSync().catch(() => {});
        }
      });
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    // Panggil langsung saat subscribe
    this._notify();
    return () => this.listeners.delete(listener);
  }

  notify() {
    this._notify();
  }

  _notify() {
    this.getSyncStats().then((stats) => {
      const state = {
        isSyncing: this.isSyncing,
        lastError: this.lastError,
        ...stats
      };
      for (const listener of this.listeners) {
        try {
          listener(state);
        } catch (e) {
          console.error('Error notifying sync listener:', e);
        }
      }
    });
  }

  async getSyncStats() {
    const config = supabaseAdapter.getConfig();

    const [pendingAccounts, pendingCategories, pendingTransactions, pendingItems] =
      await Promise.all([
        db.accounts.where('sync_status').equals('pending').count(),
        db.categories.where('sync_status').equals('pending').count(),
        db.transactions.where('sync_status').equals('pending').count(),
        db.transaction_items.where('sync_status').equals('pending').count()
      ]);

    const totalPending =
      pendingAccounts + pendingCategories + pendingTransactions + pendingItems;

    return {
      isConfigured: config.isConfigured,
      isAuthenticated: config.isAuthenticated,
      user: config.user,
      userEmail: config.user?.email || null,
      autoSync: config.autoSync,
      lastSyncedAt: config.lastSyncedAt,
      pendingAccounts,
      pendingCategories,
      pendingTransactions,
      pendingItems,
      totalPending
    };
  }

  /**
   * Jalankan Siklus Delta Sync Penuh (Pull Remote -> Dedupe -> Push Pending Local)
   */
  async runSync({ forcePullAll = false } = {}) {
    if (this.isSyncing) {
      return { success: false, reason: 'already_syncing', message: 'Sinkronisasi sedang berlangsung.' };
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.lastError = 'Perangkat sedang offline.';
      this._notify();
      return { success: false, reason: 'offline', message: 'Perangkat sedang offline.' };
    }

    const config = supabaseAdapter.getConfig();
    if (!config.isConfigured) {
      return { success: false, reason: 'unconfigured', message: 'Supabase URL dan Anon Key belum diisi.' };
    }

    if (!config.isAuthenticated || !config.user?.id) {
      return { success: false, reason: 'unauthenticated', message: 'Silakan login ke akun Supabase terlebih dahulu.' };
    }

    const userId = config.user.id;
    this.isSyncing = true;
    this.lastError = null;
    this._notify();

    const syncStartTime = new Date().toISOString();

    try {
      // 1. Pastikan 3 Workspaces Default Tersedia di Remote
      const localWorkspaces = await db.workspaces.toArray();
      const remoteWorkspacesPayload = localWorkspaces.map((w) => ({
        id: w.id,
        name: w.name,
        currency: w.currency || 'IDR',
        updated_at: syncStartTime,
        sync_status: 'synced'
      }));
      await supabaseAdapter.pushBatch('workspaces', remoteWorkspacesPayload, userId);

      // 2. PULL lebih dulu agar versi remote (LWW) masuk sebelum dedupe & push
      const lastSyncedAt = forcePullAll ? null : supabaseAdapter.getLastSyncedAt(userId);
      const totalPulled = await this._pullAll(userId, lastSyncedAt);

      // 3. DEDUPE: gabungkan Dompet/Kategori kembar + remap transaksi ke ID kanonik
      const { merged } = await dedupeAccountsAndCategories();

      // 4. PUSH semua baris lokal berstatus 'pending'
      const totalPushed = await this._pushPending(userId, syncStartTime);

      supabaseAdapter.setLastSyncedAt(syncStartTime, userId);
      this.lastError = null;
      const mergedText = merged > 0 ? `, ${merged} duplikat digabung` : '';
      return {
        success: true,
        totalPushed,
        totalPulled,
        totalMerged: merged,
        syncedAt: syncStartTime,
        message: `Sinkronisasi sukses: ${totalPushed} dikirim, ${totalPulled} diterima${mergedText}.`
      };
    } catch (err) {
      console.error('Delta Sync Error:', err);
      this.lastError = err.message || 'Terjadi kesalahan sinkronisasi.';
      return {
        success: false,
        reason: 'error',
        message: this.lastError
      };
    } finally {
      this.isSyncing = false;
      this._notify();
    }
  }

  async _pushPending(userId, syncStartTime) {
    let totalPushed = 0;

    // Akun (Dompet)
    const pendingAccounts = await db.accounts.where('sync_status').equals('pending').toArray();
    if (pendingAccounts.length > 0) {
      const payload = pendingAccounts.map((a) => ({
        id: a.id,
        workspace_id: a.workspace_id,
        name: a.name,
        type: a.type || 'cash',
        initial_balance: Number(a.initial_balance) || 0,
        merged_into: a.merged_into || null,
        created_at: a.created_at || a.updated_at || syncStartTime,
        updated_at: a.updated_at || syncStartTime,
        deleted_at: a.deleted_at || null
      }));
      await supabaseAdapter.pushBatch('accounts', payload, userId);
      await db.accounts.bulkUpdate(
        pendingAccounts.map((a) => ({ key: a.id, changes: { sync_status: 'synced' } }))
      );
      totalPushed += pendingAccounts.length;
    }

    // Kategori
    const pendingCategories = await db.categories.where('sync_status').equals('pending').toArray();
    if (pendingCategories.length > 0) {
      const payload = pendingCategories.map((c) => ({
        id: c.id,
        workspace_id: c.workspace_id,
        name: c.name,
        type: c.type || 'expense',
        keywords: c.keywords || '',
        merged_into: c.merged_into || null,
        created_at: c.created_at || c.updated_at || syncStartTime,
        updated_at: c.updated_at || syncStartTime,
        deleted_at: c.deleted_at || null
      }));
      await supabaseAdapter.pushBatch('categories', payload, userId);
      await db.categories.bulkUpdate(
        pendingCategories.map((c) => ({ key: c.id, changes: { sync_status: 'synced' } }))
      );
      totalPushed += pendingCategories.length;
    }

    // Transaksi (termasuk serialisasi struk WebP)
    const pendingTxs = await db.transactions.where('sync_status').equals('pending').toArray();
    if (pendingTxs.length > 0) {
      const payload = await Promise.all(
        pendingTxs.map(async (tx) => {
          let attachmentData = null;
          if (tx.attachment_blob instanceof Blob) {
            attachmentData = await blobToSerializable(tx.attachment_blob);
          }
          return {
            id: tx.id,
            workspace_id: tx.workspace_id,
            account_id: tx.account_id,
            to_account_id: tx.to_account_id || null,
            category_id: tx.category_id || null,
            type: tx.type,
            amount: Number(tx.amount) || 0,
            date: tx.date || syncStartTime,
            note: tx.note || '',
            metadata: tx.metadata || {},
            attachment_data: attachmentData,
            created_at: tx.created_at || syncStartTime,
            updated_at: tx.updated_at || syncStartTime,
            deleted_at: tx.deleted_at || null
          };
        })
      );
      await supabaseAdapter.pushBatch('transactions', payload, userId);
      await db.transactions.bulkUpdate(
        pendingTxs.map((t) => ({ key: t.id, changes: { sync_status: 'synced' } }))
      );
      totalPushed += pendingTxs.length;
    }

    // Rincian Produk (transaction_items)
    const pendingItems = await db.transaction_items.where('sync_status').equals('pending').toArray();
    if (pendingItems.length > 0) {
      const payload = pendingItems.map((it) => ({
        id: it.id,
        transaction_id: it.transaction_id,
        workspace_id: it.workspace_id,
        name: it.name,
        amount: Number(it.amount) || 0,
        sort_order: Number(it.sort_order) || 0,
        created_at: it.created_at || syncStartTime,
        updated_at: it.updated_at || syncStartTime,
        deleted_at: it.deleted_at || null
      }));
      await supabaseAdapter.pushBatch('transaction_items', payload, userId);
      await db.transaction_items.bulkUpdate(
        pendingItems.map((it) => ({ key: it.id, changes: { sync_status: 'synced' } }))
      );
      totalPushed += pendingItems.length;
    }

    return totalPushed;
  }

  /**
   * Terapkan baris remote ke tabel lokal dengan aturan LWW.
   * Lokal ditimpa jika: belum ada, sudah 'synced', atau remote lebih baru.
   */
  async _applyRemote(table, remoteRows, mapRow) {
    let applied = 0;
    for (const r of remoteRows) {
      const local = await table.get(r.id);
      const remoteTime = new Date(r.updated_at).getTime();
      const localTime = local ? new Date(local.updated_at).getTime() : 0;

      if (!local || local.sync_status === 'synced' || remoteTime > localTime) {
        await table.put({ ...mapRow(r, local), sync_status: 'synced' });
        applied += 1;
      }
    }
    return applied;
  }

  async _pullAll(userId, lastSyncedAt) {
    let totalPulled = 0;

    const remoteAccounts = await supabaseAdapter.pullChanges('accounts', lastSyncedAt, userId);
    totalPulled += await this._applyRemote(db.accounts, remoteAccounts, (r) => ({
      id: r.id,
      workspace_id: r.workspace_id,
      name: r.name,
      type: r.type,
      initial_balance: Number(r.initial_balance) || 0,
      merged_into: r.merged_into || null,
      created_at: r.created_at,
      updated_at: r.updated_at,
      deleted_at: r.deleted_at || null
    }));

    const remoteCategories = await supabaseAdapter.pullChanges('categories', lastSyncedAt, userId);
    totalPulled += await this._applyRemote(db.categories, remoteCategories, (r) => ({
      id: r.id,
      workspace_id: r.workspace_id,
      name: r.name,
      type: r.type,
      keywords: r.keywords || '',
      merged_into: r.merged_into || null,
      created_at: r.created_at,
      updated_at: r.updated_at,
      deleted_at: r.deleted_at || null
    }));

    const remoteTxs = await supabaseAdapter.pullChanges('transactions', lastSyncedAt, userId);
    totalPulled += await this._applyRemote(db.transactions, remoteTxs, (r, local) => ({
      id: r.id,
      workspace_id: r.workspace_id,
      account_id: r.account_id,
      to_account_id: r.to_account_id || null,
      category_id: r.category_id || null,
      type: r.type,
      amount: Number(r.amount) || 0,
      date: r.date,
      note: r.note || '',
      metadata: r.metadata || {},
      attachment_blob: r.attachment_data
        ? serializableToBlob(r.attachment_data)
        : local?.attachment_blob || null,
      created_at: r.created_at,
      updated_at: r.updated_at,
      deleted_at: r.deleted_at || null
    }));

    const remoteItems = await supabaseAdapter.pullChanges('transaction_items', lastSyncedAt, userId);
    totalPulled += await this._applyRemote(db.transaction_items, remoteItems, (r) => ({
      id: r.id,
      transaction_id: r.transaction_id,
      workspace_id: r.workspace_id,
      name: r.name,
      amount: Number(r.amount) || 0,
      sort_order: Number(r.sort_order) || 0,
      created_at: r.created_at,
      updated_at: r.updated_at,
      deleted_at: r.deleted_at || null
    }));

    return totalPulled;
  }

  startAutoSyncInterval(intervalMs = 60000) {
    if (this.autoSyncTimer) clearInterval(this.autoSyncTimer);
    this.autoSyncTimer = setInterval(() => {
      const config = supabaseAdapter.getConfig();
      if (config.autoSync && config.isAuthenticated && typeof navigator !== 'undefined' && navigator.onLine) {
        this.runSync().catch(() => {});
      }
    }, intervalMs);
  }

  stopAutoSyncInterval() {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }
  }
}

export const syncEngine = new SyncEngine();
