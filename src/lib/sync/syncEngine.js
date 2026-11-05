/**
 * Sync Engine — Delta Sync Coordinator antara Dexie.js (IndexedDB) dan Supabase
 *
 * Prinsip Kerja:
 * 1. 100% Offline-First: Semua aktivitas baca/tulis selalu ke IndexedDB lokal terlebih dahulu.
 * 2. Auto-Push (Offline -> Online): Perubahan lokal (`sync_status = 'pending'`) terdeteksi otomatis
 *    via Dexie `liveQuery` -> langsung di-push dengan debounce 2 detik saat online, atau otomatis
 *    begitu perangkat kembali online (`window` online event).
 * 3. Auto-Pull (Online -> Offline): Menarik perubahan remote otomatis saat aplikasi dibuka, saat login,
 *    setiap 30 detik (saat tab aktif), dan saat pengguna kembali ke tab aplikasi (`visibilitychange`).
 * 4. Dedupe: Gabungkan Dompet/Kategori duplikat (nama sama per buku) + remap referensi transaksi.
 * 5. Resolusi Konflik: Last-Write-Wins (LWW) berdasarkan `updated_at`.
 *
 * Urutan Pull -> Dedupe -> Push mencegah seed default perangkat baru menimpa / menggandakan data remote.
 */

import { liveQuery } from 'dexie';
import { db, dedupeAccountsAndCategories, isUntouchedSeed, SEED_EPOCH_ISO } from '../db.js';
import { supabaseAdapter } from './supabaseAdapter.js';
import { blobToSerializable, serializableToBlob } from '../utils/cryptoBackup.js';

const PUSH_DEBOUNCE_MS = 2000;
const PULL_INTERVAL_MS = 30000;
const FOCUS_MIN_GAP_MS = 10000;
const CLOCK_SKEW_BUFFER_MS = 60000;

const toTime = (iso) => {
  const t = new Date(iso || 0).getTime();
  return Number.isFinite(t) ? t : 0;
};

const resolvePushTimestamp = (row, syncStartTime) => {
  if (isUntouchedSeed(row)) return SEED_EPOCH_ISO;
  return toTime(row.updated_at) > toTime(syncStartTime) ? row.updated_at : syncStartTime;
};

class SyncEngine {
  constructor() {
    this.isSyncing = false;
    this.lastError = null;
    this.lastRunAt = 0;
    this.listeners = new Set();
    this.dataListeners = new Set();
    this.pendingCounts = null;

    this._started = false;
    this._pollTimer = null;
    this._pushTimer = null;
    this._pendingSub = null;

    this._onOnline = () => {
      this.triggerSync('online');
    };
    this._onVisible = () => {
      if (
        typeof document !== 'undefined' &&
        document.visibilityState === 'visible' &&
        Date.now() - this.lastRunAt > FOCUS_MIN_GAP_MS
      ) {
        this.triggerSync('focus');
      }
    };
  }

  /* ---------------------------- Listener State ---------------------------- */

  subscribe(listener) {
    this.listeners.add(listener);
    this._notify();
    return () => this.listeners.delete(listener);
  }

  /** Dipanggil setiap kali data remote masuk / dedupe mengubah data lokal agar UI me-refresh otomatis. */
  onDataChange(listener) {
    this.dataListeners.add(listener);
    return () => this.dataListeners.delete(listener);
  }

  notify() {
    this._notify();
  }

  _emitDataChange() {
    for (const listener of this.dataListeners) {
      try {
        listener();
      } catch (e) {
        console.error('Error notifying data listener:', e);
      }
    }
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

  async _countPending() {
    const [pendingAccounts, pendingCategories, pendingTransactions, pendingItems, pendingAliases] =
      await Promise.all([
        db.accounts.where('sync_status').equals('pending').count(),
        db.categories.where('sync_status').equals('pending').count(),
        db.transactions.where('sync_status').equals('pending').count(),
        db.transaction_items.where('sync_status').equals('pending').count(),
        db.item_aliases.where('sync_status').equals('pending').count()
      ]);

    return {
      pendingAccounts,
      pendingCategories,
      pendingTransactions,
      pendingItems,
      pendingAliases,
      totalPending:
        pendingAccounts + pendingCategories + pendingTransactions + pendingItems + pendingAliases
    };
  }

  async getSyncStats() {
    const config = supabaseAdapter.getConfig();
    const counts = this.pendingCounts || (await this._countPending());

    return {
      isConfigured: config.isConfigured,
      isAuthenticated: config.isAuthenticated,
      user: config.user,
      userEmail: config.user?.email || null,
      autoSync: config.autoSync,
      lastSyncedAt: config.lastSyncedAt,
      ...counts
    };
  }

  /* ------------------------------ Auto Sync ------------------------------- */

  _canAutoSync() {
    const config = supabaseAdapter.getConfig();
    return (
      config.autoSync &&
      config.isConfigured &&
      config.isAuthenticated &&
      (typeof navigator === 'undefined' || navigator.onLine)
    );
  }

  /** Aktifkan siklus Auto-Sync (Push perubahan lokal + Pull berkala dari cloud). */
  start(intervalMs = PULL_INTERVAL_MS) {
    if (this._started || typeof window === 'undefined') return;
    this._started = true;

    // 1. Watcher perubahan lokal (IndexedDB) -> jadwalkan Auto-Push saat ada baris 'pending'
    this._pendingSub = liveQuery(() => this._countPending()).subscribe({
      next: (counts) => {
        this.pendingCounts = counts;
        this._notify();
        if (counts.totalPending > 0 && !this.isSyncing) {
          this.schedulePush();
        }
      },
      error: (err) => console.error('LiveQuery pending watcher error:', err)
    });

    // 2. Interval Auto-Pull & Push saat tab aktif
    this._pollTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      this.triggerSync('poll');
    }, intervalMs);

    // 3. Re-sync segera saat perangkat kembali online atau tab kembali dibuka
    window.addEventListener('online', this._onOnline);
    document.addEventListener('visibilitychange', this._onVisible);

    // 4. Jalankan sinkronisasi awal saat aplikasi pertama kali siap
    this.triggerSync('startup');
  }

  stop() {
    if (!this._started) return;
    this._started = false;
    if (this._pendingSub) {
      this._pendingSub.unsubscribe();
      this._pendingSub = null;
    }
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    if (this._pushTimer) {
      clearTimeout(this._pushTimer);
      this._pushTimer = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this._onOnline);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this._onVisible);
    }
  }

  // Alias kompatibilitas
  startAutoSyncInterval(intervalMs = PULL_INTERVAL_MS) {
    this.start(intervalMs);
  }

  stopAutoSyncInterval() {
    this.stop();
  }

  schedulePush() {
    if (!this._canAutoSync()) return;
    if (this._pushTimer) clearTimeout(this._pushTimer);
    this._pushTimer = setTimeout(() => {
      this.triggerSync('local-change');
    }, PUSH_DEBOUNCE_MS);
  }

  async triggerSync(reason = 'auto') {
    if (!this._canAutoSync() || this.isSyncing) return null;
    return this.runSync({ reason });
  }

  /* ------------------------------ Siklus Sync ----------------------------- */

  /**
   * Jalankan Siklus Delta Sync Penuh (Pull Remote -> Dedupe -> Push Pending Local)
   */
  async runSync({ forcePullAll = false } = {}) {
    if (this.isSyncing) {
      return {
        success: false,
        reason: 'already_syncing',
        message: 'Sinkronisasi sedang berlangsung.'
      };
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.lastError = 'Perangkat sedang offline.';
      this._notify();
      return { success: false, reason: 'offline', message: 'Perangkat sedang offline.' };
    }

    const config = supabaseAdapter.getConfig();
    if (!config.isConfigured) {
      return {
        success: false,
        reason: 'unconfigured',
        message: 'Supabase URL dan Anon Key belum diisi.'
      };
    }

    if (!config.isAuthenticated || !config.user?.id) {
      return {
        success: false,
        reason: 'unauthenticated',
        message: 'Silakan login ke akun Supabase terlebih dahulu.'
      };
    }

    const userId = config.user.id;
    if (this._pushTimer) {
      clearTimeout(this._pushTimer);
      this._pushTimer = null;
    }

    this.isSyncing = true;
    this.lastError = null;
    this.lastRunAt = Date.now();
    this._notify();

    const syncStartTime = new Date().toISOString();
    let result;

    try {
      const rawLastSyncedAt = forcePullAll ? null : supabaseAdapter.getLastSyncedAt(userId);

      // 1. Pastikan 3 Workspaces Default tersedia di Remote (cukup saat sync perdana / full pull)
      if (!rawLastSyncedAt) {
        const localWorkspaces = await db.workspaces.toArray();
        const remoteWorkspacesPayload = localWorkspaces.map((w) => ({
          id: w.id,
          name: w.name,
          currency: w.currency || 'IDR',
          updated_at: syncStartTime,
          sync_status: 'synced'
        }));
        await supabaseAdapter.pushBatch('workspaces', remoteWorkspacesPayload, userId);
      }

      // 2. PULL lebih dulu (dengan buffer clock-skew 60 detik untuk delta pull)
      const sinceTimestamp = rawLastSyncedAt
        ? new Date(Math.max(0, toTime(rawLastSyncedAt) - CLOCK_SKEW_BUFFER_MS)).toISOString()
        : null;
      const totalPulled = await this._pullAll(userId, sinceTimestamp);

      // 3. DEDUPE: gabungkan Dompet/Kategori kembar + remap transaksi ke ID kanonik
      const { merged, remapped } = await dedupeAccountsAndCategories();

      // 4. PUSH semua baris lokal berstatus 'pending'
      const totalPushed = await this._pushPending(userId, syncStartTime);

      supabaseAdapter.setLastSyncedAt(syncStartTime, userId);
      this.lastError = null;

      if (totalPulled > 0 || merged > 0 || remapped > 0) {
        this._emitDataChange();
      }

      const mergedText = merged > 0 ? `, ${merged} duplikat digabung` : '';
      result = {
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
      result = {
        success: false,
        reason: 'error',
        message: this.lastError
      };
    } finally {
      this.isSyncing = false;
      this.pendingCounts = await this._countPending().catch(() => null);
      this._notify();
    }

    // Jika ada perubahan lokal baru saat sync tadi berlangsung, jadwalkan push berikutnya
    if (result.success && this.pendingCounts?.totalPending > 0) {
      this.schedulePush();
    }

    return result;
  }

  /**
   * Tandai 'synced' hanya bila baris lokal belum diedit lagi selama request jaringan berlangsung.
   */
  async _markSynced(table, originalRows, pushedTimestamps) {
    await db.transaction('rw', table, async () => {
      const currentRows = await table.bulkGet(originalRows.map((r) => r.id));
      const updates = [];
      currentRows.forEach((cur, i) => {
        if (cur && cur.sync_status === 'pending' && cur.updated_at === originalRows[i].updated_at) {
          updates.push({
            key: cur.id,
            changes: {
              sync_status: 'synced',
              updated_at: pushedTimestamps[i]
            }
          });
        }
      });
      if (updates.length > 0) {
        await table.bulkUpdate(updates);
      }
    });
  }

  async _pushPending(userId, syncStartTime) {
    let totalPushed = 0;

    // Akun (Dompet)
    const pendingAccounts = await db.accounts.where('sync_status').equals('pending').toArray();
    if (pendingAccounts.length > 0) {
      const pushedTimestamps = pendingAccounts.map((a) => resolvePushTimestamp(a, syncStartTime));
      const payload = pendingAccounts.map((a, i) => ({
        id: a.id,
        workspace_id: a.workspace_id,
        name: a.name,
        type: a.type || 'cash',
        initial_balance: Math.round(Number(a.initial_balance) || 0),
        merged_into: a.merged_into || null,
        created_at: a.created_at || a.updated_at || syncStartTime,
        updated_at: pushedTimestamps[i],
        deleted_at: a.deleted_at || null
      }));
      await supabaseAdapter.pushBatch('accounts', payload, userId);
      await this._markSynced(db.accounts, pendingAccounts, pushedTimestamps);
      totalPushed += pendingAccounts.length;
    }

    // Kategori
    const pendingCategories = await db.categories.where('sync_status').equals('pending').toArray();
    if (pendingCategories.length > 0) {
      const pushedTimestamps = pendingCategories.map((c) => resolvePushTimestamp(c, syncStartTime));
      const payload = pendingCategories.map((c, i) => ({
        id: c.id,
        workspace_id: c.workspace_id,
        name: c.name,
        type: c.type || 'expense',
        keywords: c.keywords || '',
        merged_into: c.merged_into || null,
        created_at: c.created_at || c.updated_at || syncStartTime,
        updated_at: pushedTimestamps[i],
        deleted_at: c.deleted_at || null
      }));
      await supabaseAdapter.pushBatch('categories', payload, userId);
      await this._markSynced(db.categories, pendingCategories, pushedTimestamps);
      totalPushed += pendingCategories.length;
    }

    // Transaksi (termasuk serialisasi struk WebP)
    const pendingTxs = await db.transactions.where('sync_status').equals('pending').toArray();
    if (pendingTxs.length > 0) {
      const pushedTimestamps = pendingTxs.map((tx) => resolvePushTimestamp(tx, syncStartTime));
      const payload = await Promise.all(
        pendingTxs.map(async (tx, i) => {
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
            amount: Math.round(Number(tx.amount) || 0),
            date: tx.date || syncStartTime,
            note: tx.note || '',
            metadata: tx.metadata || {},
            attachment_data: attachmentData,
            created_at: tx.created_at || syncStartTime,
            updated_at: pushedTimestamps[i],
            deleted_at: tx.deleted_at || null
          };
        })
      );
      await supabaseAdapter.pushBatch('transactions', payload, userId);
      await this._markSynced(db.transactions, pendingTxs, pushedTimestamps);
      totalPushed += pendingTxs.length;
    }

    // Rincian Produk (transaction_items)
    const pendingItems = await db.transaction_items.where('sync_status').equals('pending').toArray();
    if (pendingItems.length > 0) {
      const pushedTimestamps = pendingItems.map((it) => resolvePushTimestamp(it, syncStartTime));
      const payload = pendingItems.map((it, i) => ({
        id: it.id,
        transaction_id: it.transaction_id,
        workspace_id: it.workspace_id,
        name: it.name,
        amount: Math.round(Number(it.amount) || 0),
        sort_order: Number(it.sort_order) || 0,
        created_at: it.created_at || syncStartTime,
        updated_at: pushedTimestamps[i],
        deleted_at: it.deleted_at || null
      }));
      await supabaseAdapter.pushBatch('transaction_items', payload, userId);
      await this._markSynced(db.transaction_items, pendingItems, pushedTimestamps);
      totalPushed += pendingItems.length;
    }

    // Kamus Koreksi OCR (item_aliases)
    const pendingAliases = await db.item_aliases.where('sync_status').equals('pending').toArray();
    if (pendingAliases.length > 0) {
      const pushedTimestamps = pendingAliases.map((al) => resolvePushTimestamp(al, syncStartTime));
      const payload = pendingAliases.map((al, i) => ({
        id: al.id,
        ocr_key: al.ocr_key,
        canonical_name: al.canonical_name,
        merchant: al.merchant || '',
        hit_count: Number(al.hit_count) || 1,
        workspace_id: al.workspace_id || 'personal',
        created_at: al.created_at || syncStartTime,
        updated_at: pushedTimestamps[i],
        deleted_at: al.deleted_at || null
      }));
      await supabaseAdapter.pushBatch('item_aliases', payload, userId);
      await this._markSynced(db.item_aliases, pendingAliases, pushedTimestamps);
      totalPushed += pendingAliases.length;
    }

    return totalPushed;
  }

  /**
   * Terapkan baris remote ke tabel lokal dengan aturan LWW.
   * Lokal ditimpa jika: belum ada, sudah 'synced' (dan versi berbeda), atau remote lebih baru.
   */
  async _applyRemote(table, remoteRows, mapRow) {
    if (!remoteRows.length) return 0;
    const locals = await table.bulkGet(remoteRows.map((r) => r.id));
    const toPut = [];

    remoteRows.forEach((r, i) => {
      const local = locals[i];
      const remoteTime = toTime(r.updated_at);
      const localTime = local ? toTime(local.updated_at) : 0;

      if (!local) {
        const mapped = mapRow(r, local);
        toPut.push({ sync_status: 'synced', ...mapped });
      } else if (local.sync_status === 'synced') {
        if (remoteTime !== localTime) {
          const mapped = mapRow(r, local);
          toPut.push({ sync_status: 'synced', ...mapped });
        }
      } else if (remoteTime > localTime) {
        const mapped = mapRow(r, local);
        toPut.push({ sync_status: 'synced', ...mapped });
      }
    });

    if (toPut.length > 0) {
      await table.bulkPut(toPut);
    }
    return toPut.length;
  }

  async _pullAll(userId, sinceTimestamp) {
    let totalPulled = 0;

    const remoteAccounts = await supabaseAdapter.pullChanges('accounts', sinceTimestamp, userId);
    totalPulled += await this._applyRemote(db.accounts, remoteAccounts, (r) => {
      // Dompet seed default yang belum pernah diubah user (masih bertimestamp SEED_EPOCH) wajib bersaldo 0
      const isSeed = isUntouchedSeed(r);
      const remoteBal = Math.round(Number(r.initial_balance) || 0);
      return {
        id: r.id,
        workspace_id: r.workspace_id,
        name: r.name,
        type: r.type,
        initial_balance: isSeed ? 0 : remoteBal,
        merged_into: r.merged_into || null,
        created_at: r.created_at,
        updated_at: r.updated_at,
        deleted_at: r.deleted_at || null,
        sync_status: isSeed && remoteBal !== 0 ? 'pending' : 'synced'
      };
    });

    const remoteCategories = await supabaseAdapter.pullChanges('categories', sinceTimestamp, userId);
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

    const remoteTxs = await supabaseAdapter.pullChanges('transactions', sinceTimestamp, userId);
    totalPulled += await this._applyRemote(db.transactions, remoteTxs, (r, local) => ({
      id: r.id,
      workspace_id: r.workspace_id,
      account_id: r.account_id,
      to_account_id: r.to_account_id || null,
      category_id: r.category_id || null,
      type: r.type,
      amount: Math.round(Number(r.amount) || 0),
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

    const remoteItems = await supabaseAdapter.pullChanges('transaction_items', sinceTimestamp, userId);
    totalPulled += await this._applyRemote(db.transaction_items, remoteItems, (r) => ({
      id: r.id,
      transaction_id: r.transaction_id,
      workspace_id: r.workspace_id,
      name: r.name,
      amount: Math.round(Number(r.amount) || 0),
      sort_order: Number(r.sort_order) || 0,
      created_at: r.created_at,
      updated_at: r.updated_at,
      deleted_at: r.deleted_at || null
    }));

    const remoteAliases = await supabaseAdapter.pullChanges('item_aliases', sinceTimestamp, userId);
    totalPulled += await this._applyRemote(db.item_aliases, remoteAliases, (r) => ({
      id: r.id,
      ocr_key: r.ocr_key,
      canonical_name: r.canonical_name,
      merchant: r.merchant || '',
      hit_count: Number(r.hit_count) || 1,
      workspace_id: r.workspace_id || 'personal',
      created_at: r.created_at,
      updated_at: r.updated_at,
      deleted_at: r.deleted_at || null
    }));

    return totalPulled;
  }
}

export const syncEngine = new SyncEngine();
