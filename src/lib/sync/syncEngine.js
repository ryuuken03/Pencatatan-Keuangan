/**
 * Sync Engine — Delta Sync Coordinator antara Dexie.js (IndexedDB) dan Supabase
 *
 * Prinsip Kerja:
 * 1. 100% Offline-First: Semua aktivitas baca/tulis selalu ke IndexedDB lokal terlebih dahulu.
 * 2. Delta Push: Hanya mengirim baris lokal yang memiliki `sync_status = 'pending'`.
 * 3. Delta Pull: Hanya menarik baris remote yang memiliki `updated_at > last_synced_at`.
 * 4. Resolusi Konflik: Last-Write-Wins (LWW) berdasarkan `updated_at`.
 */

import { db } from '../db.js';
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
   * Jalankan Siklus Delta Sync Penuh (Push Pending Local -> Pull Remote Changes)
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
    let totalPushed = 0;
    let totalPulled = 0;

    try {
      // -------------------------------------------------------------
      // 1. PUSH: Pastikan 3 Workspaces Default Tersedia di Remote
      // -------------------------------------------------------------
      const localWorkspaces = await db.workspaces.toArray();
      const remoteWorkspacesPayload = localWorkspaces.map((w) => ({
        id: w.id,
        name: w.name,
        currency: w.currency || 'IDR',
        updated_at: syncStartTime,
        sync_status: 'synced'
      }));
      await supabaseAdapter.pushBatch('workspaces', remoteWorkspacesPayload, userId);

      // -------------------------------------------------------------
      // 2. PUSH: Kirim Akun (Dompet) yang Berstatus 'pending'
      // -------------------------------------------------------------
      const pendingAccounts = await db.accounts.where('sync_status').equals('pending').toArray();
      if (pendingAccounts.length > 0) {
        const payload = pendingAccounts.map((a) => ({
          id: a.id,
          workspace_id: a.workspace_id,
          name: a.name,
          type: a.type || 'cash',
          initial_balance: Number(a.initial_balance) || 0,
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

      // -------------------------------------------------------------
      // 3. PUSH: Kirim Kategori yang Berstatus 'pending'
      // -------------------------------------------------------------
      const pendingCategories = await db.categories.where('sync_status').equals('pending').toArray();
      if (pendingCategories.length > 0) {
        const payload = pendingCategories.map((c) => ({
          id: c.id,
          workspace_id: c.workspace_id,
          name: c.name,
          type: c.type || 'expense',
          keywords: c.keywords || '',
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

      // -------------------------------------------------------------
      // 4. PUSH: Kirim Transaksi yang Berstatus 'pending' (Termasuk serialisasi struk WebP)
      // -------------------------------------------------------------
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

      // -------------------------------------------------------------
      // 5. PUSH: Kirim Rincian Produk (transaction_items) yang 'pending'
      // -------------------------------------------------------------
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

      // =============================================================
      // PULL: Delta Pull Perubahan dari Remote ke IndexedDB Lokal
      // =============================================================
      const lastSyncedAt = forcePullAll ? null : supabaseAdapter.getLastSyncedAt();

      // Pull Accounts
      const remoteAccounts = await supabaseAdapter.pullChanges('accounts', lastSyncedAt, userId);
      for (const rAcc of remoteAccounts) {
        const local = await db.accounts.get(rAcc.id);
        const remoteTime = new Date(rAcc.updated_at).getTime();
        const localTime = local ? new Date(local.updated_at).getTime() : 0;

        if (!local || local.sync_status === 'synced' || remoteTime > localTime) {
          await db.accounts.put({
            id: rAcc.id,
            workspace_id: rAcc.workspace_id,
            name: rAcc.name,
            type: rAcc.type,
            initial_balance: Number(rAcc.initial_balance) || 0,
            created_at: rAcc.created_at,
            updated_at: rAcc.updated_at,
            deleted_at: rAcc.deleted_at || null,
            sync_status: 'synced'
          });
          totalPulled += 1;
        }
      }

      // Pull Categories
      const remoteCategories = await supabaseAdapter.pullChanges('categories', lastSyncedAt, userId);
      for (const rCat of remoteCategories) {
        const local = await db.categories.get(rCat.id);
        const remoteTime = new Date(rCat.updated_at).getTime();
        const localTime = local ? new Date(local.updated_at).getTime() : 0;

        if (!local || local.sync_status === 'synced' || remoteTime > localTime) {
          await db.categories.put({
            id: rCat.id,
            workspace_id: rCat.workspace_id,
            name: rCat.name,
            type: rCat.type,
            keywords: rCat.keywords || '',
            created_at: rCat.created_at,
            updated_at: rCat.updated_at,
            deleted_at: rCat.deleted_at || null,
            sync_status: 'synced'
          });
          totalPulled += 1;
        }
      }

      // Pull Transactions
      const remoteTxs = await supabaseAdapter.pullChanges('transactions', lastSyncedAt, userId);
      for (const rTx of remoteTxs) {
        const local = await db.transactions.get(rTx.id);
        const remoteTime = new Date(rTx.updated_at).getTime();
        const localTime = local ? new Date(local.updated_at).getTime() : 0;

        if (!local || local.sync_status === 'synced' || remoteTime > localTime) {
          const blob = rTx.attachment_data
            ? serializableToBlob(rTx.attachment_data)
            : local?.attachment_blob || null;

          await db.transactions.put({
            id: rTx.id,
            workspace_id: rTx.workspace_id,
            account_id: rTx.account_id,
            to_account_id: rTx.to_account_id || null,
            category_id: rTx.category_id || null,
            type: rTx.type,
            amount: Number(rTx.amount) || 0,
            date: rTx.date,
            note: rTx.note || '',
            metadata: rTx.metadata || {},
            attachment_blob: blob,
            created_at: rTx.created_at,
            updated_at: rTx.updated_at,
            deleted_at: rTx.deleted_at || null,
            sync_status: 'synced'
          });
          totalPulled += 1;
        }
      }

      // Pull Transaction Items
      const remoteItems = await supabaseAdapter.pullChanges('transaction_items', lastSyncedAt, userId);
      for (const rIt of remoteItems) {
        const local = await db.transaction_items.get(rIt.id);
        const remoteTime = new Date(rIt.updated_at).getTime();
        const localTime = local ? new Date(local.updated_at).getTime() : 0;

        if (!local || local.sync_status === 'synced' || remoteTime > localTime) {
          await db.transaction_items.put({
            id: rIt.id,
            transaction_id: rIt.transaction_id,
            workspace_id: rIt.workspace_id,
            name: rIt.name,
            amount: Number(rIt.amount) || 0,
            sort_order: Number(rIt.sort_order) || 0,
            created_at: rIt.created_at,
            updated_at: rIt.updated_at,
            deleted_at: rIt.deleted_at || null,
            sync_status: 'synced'
          });
          totalPulled += 1;
        }
      }

      supabaseAdapter.setLastSyncedAt(syncStartTime);
      this.lastError = null;
      return {
        success: true,
        totalPushed,
        totalPulled,
        syncedAt: syncStartTime,
        message: `Sinkronisasi sukses: ${totalPushed} dikirim, ${totalPulled} diterima.`
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

