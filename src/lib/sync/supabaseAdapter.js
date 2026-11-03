/**
 * Supabase Adapter — Native Zero-Bloat HTTP Client (PostgREST & GoTrue REST)
 * Menerapkan prinsip Anti-Supply-Chain & Zero External Dependency menggunakan standard browser `fetch`.
 */

const STORAGE_KEYS = {
  URL: 'buku_kas_supabase_url',
  ANON_KEY: 'buku_kas_supabase_anon_key',
  AUTH_TOKEN: 'buku_kas_supabase_token',
  REFRESH_TOKEN: 'buku_kas_supabase_refresh_token',
  EXPIRES_AT: 'buku_kas_supabase_expires_at',
  USER: 'buku_kas_supabase_user',
  AUTO_SYNC: 'buku_kas_auto_sync_enabled',
  LAST_SYNC: 'buku_kas_last_sync_timestamp'
};

export class SupabaseAdapter {
  constructor() {
    const envUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) || '';
    const envAnonKey = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) || '';

    this.url = (envUrl || localStorage.getItem(STORAGE_KEYS.URL) || '').trim().replace(/\/+$/, '');
    this.anonKey = (envAnonKey || localStorage.getItem(STORAGE_KEYS.ANON_KEY) || '').trim();
    this.isFromEnv = Boolean(envUrl && envAnonKey);

    this.token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) || null;
    this.refreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN) || null;
    this.expiresAt = Number(localStorage.getItem(STORAGE_KEYS.EXPIRES_AT)) || 0;

    const savedUser = localStorage.getItem(STORAGE_KEYS.USER);
    this.user = savedUser ? JSON.parse(savedUser) : null;
  }

  isConfigured() {
    return Boolean(this.url && this.anonKey);
  }

  isAuthenticated() {
    return Boolean(this.token && this.user?.id);
  }

  getUser() {
    return this.user;
  }

  getConfig() {
    return {
      url: this.url,
      anonKey: this.anonKey,
      isFromEnv: this.isFromEnv,
      isConfigured: this.isConfigured(),
      isAuthenticated: this.isAuthenticated(),
      user: this.user,
      autoSync: localStorage.getItem(STORAGE_KEYS.AUTO_SYNC) === 'true',
      lastSyncedAt: this.getLastSyncedAt()
    };
  }

  saveConfig({ autoSync } = {}) {
    if (autoSync !== undefined) {
      localStorage.setItem(STORAGE_KEYS.AUTO_SYNC, autoSync ? 'true' : 'false');
    }
  }

  // Cursor delta-pull dipisah per user agar login akun lain / akun sama di sesi baru tetap full-pull sekali
  _lastSyncKey(userId) {
    const uid = userId || this.user?.id;
    return uid ? `${STORAGE_KEYS.LAST_SYNC}:${uid}` : null;
  }

  setLastSyncedAt(timestamp, userId) {
    const key = this._lastSyncKey(userId);
    if (key) localStorage.setItem(key, timestamp);
  }

  getLastSyncedAt(userId) {
    const key = this._lastSyncKey(userId);
    return key ? localStorage.getItem(key) : null;
  }

  _saveAuthSession(session) {
    if (!session) {
      this.token = null;
      this.refreshToken = null;
      this.expiresAt = 0;
      this.user = null;
      localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.EXPIRES_AT);
      localStorage.removeItem(STORAGE_KEYS.USER);
      return;
    }

    this.token = session.access_token || null;
    this.refreshToken = session.refresh_token || null;
    this.expiresAt = session.expires_at ? Number(session.expires_at) * 1000 : Date.now() + 3600 * 1000;
    this.user = session.user || null;

    if (this.token) localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, this.token);
    if (this.refreshToken) localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, this.refreshToken);
    localStorage.setItem(STORAGE_KEYS.EXPIRES_AT, String(this.expiresAt));
    if (this.user) localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(this.user));
  }

  async testConnection() {
    if (!this.isConfigured()) {
      throw new Error('Supabase URL dan Anon Key belum diisi.');
    }

    const testUrl = `${this.url}/rest/v1/?apikey=${this.anonKey}`;
    try {
      const res = await fetch(testUrl, {
        method: 'GET',
        headers: {
          apikey: this.anonKey,
          Accept: 'application/json'
        }
      });

      if (!res.ok && res.status !== 401 && res.status !== 404) {
        throw new Error(`HTTP Error: ${res.status} ${res.statusText}`);
      }

      return { success: true, message: 'Koneksi ke Supabase Project berhasil.' };
    } catch (err) {
      throw new Error(`Gagal terhubung ke Supabase: ${err.message || 'Periksa URL dan koneksi internet.'}`);
    }
  }

  async ensureValidToken() {
    if (!this.token) return null;
    // Jika sisa masa berlaku token < 60 detik, refresh token
    if (this.refreshToken && Date.now() > this.expiresAt - 60000) {
      try {
        const refreshUrl = `${this.url}/auth/v1/token?grant_type=refresh_token`;
        const res = await fetch(refreshUrl, {
          method: 'POST',
          headers: {
            apikey: this.anonKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ refresh_token: this.refreshToken })
        });
        if (res.ok) {
          const session = await res.json();
          this._saveAuthSession(session);
        }
      } catch (e) {
        console.warn('Gagal me-refresh token auth Supabase:', e);
      }
    }
    return this.token;
  }

  async signUp(email, password) {
    if (!this.isConfigured()) throw new Error('Supabase URL & Anon Key belum dikonfigurasi di file .env.');

    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPassword = String(password || '');

    const res = await fetch(`${this.url}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        apikey: this.anonKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email: cleanEmail, password: cleanPassword })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error_description || data.msg || data.message || 'Gagal mendaftar akun Supabase.');
    }

    return data;
  }

  async signIn(email, password) {
    if (!this.isConfigured()) throw new Error('Supabase URL & Anon Key belum dikonfigurasi.');

    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPassword = String(password || '');

    const res = await fetch(`${this.url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: this.anonKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email: cleanEmail, password: cleanPassword })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error_description || data.msg || data.message || 'Login gagal. Periksa email & password.');
    }

    this._saveAuthSession(data);
    return data;
  }

  async signOut() {
    if (this.token && this.url) {
      try {
        await fetch(`${this.url}/auth/v1/logout`, {
          method: 'POST',
          headers: {
            apikey: this.anonKey,
            Authorization: `Bearer ${this.token}`
          }
        });
      } catch (e) {
        // Abaikan jika offline
      }
    }
    this._saveAuthSession(null);
  }

  /**
   * PUSH BATCH (Delta Sync ke Server via PostgREST Upsert)
   * Menggunakan HTTP Header: `Prefer: resolution=merge-duplicates,return=minimal`
   */
  async pushBatch(tableName, records = [], userId) {
    if (!this.isConfigured()) throw new Error('Supabase belum dikonfigurasi.');
    if (!userId) throw new Error('User ID wajib ada untuk RLS.');
    if (!records.length) return 0;

    await this.ensureValidToken();
    const authToken = this.token || this.anonKey;

    const CHUNK_SIZE = 50;
    let pushed = 0;

    for (let i = 0; i < records.length; i += CHUNK_SIZE) {
      const chunk = records.slice(i, i + CHUNK_SIZE).map((r) => ({
        ...r,
        user_id: userId,
        sync_status: 'synced'
      }));

      const endpoint = `${this.url}/rest/v1/${tableName}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          apikey: this.anonKey,
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify(chunk)
      });

      if (!res.ok) {
        let errMsg = `HTTP ${res.status}`;
        try {
          const errObj = await res.json();
          errMsg = errObj.message || errObj.hint || errMsg;
        } catch {
          errMsg = await res.text();
        }
        throw new Error(`Gagal push ke tabel '${tableName}': ${errMsg}`);
      }

      pushed += chunk.length;
    }

    return pushed;
  }

  /**
   * PULL CHANGES (Delta Sync dari Server)
   * Menarik baris yang berubah setelah `sinceTimestamp`
   */
  async pullChanges(tableName, sinceTimestamp = null, userId) {
    if (!this.isConfigured()) throw new Error('Supabase belum dikonfigurasi.');
    if (!userId) throw new Error('User ID wajib ada.');

    await this.ensureValidToken();
    const authToken = this.token || this.anonKey;

    const PAGE_SIZE = 1000;
    const all = [];
    let offset = 0;

    // Paginasi agar data > 1000 baris tetap tertarik semua
    while (true) {
      let query = `user_id=eq.${userId}&order=updated_at.asc,id.asc&limit=${PAGE_SIZE}&offset=${offset}`;
      if (sinceTimestamp) {
        query += `&updated_at=gt.${encodeURIComponent(sinceTimestamp)}`;
      }

      const endpoint = `${this.url}/rest/v1/${tableName}?${query}`;
      const res = await fetch(endpoint, {
        method: 'GET',
        headers: {
          apikey: this.anonKey,
          Authorization: `Bearer ${authToken}`,
          Accept: 'application/json'
        }
      });

      if (!res.ok) {
        let errMsg = `HTTP ${res.status}`;
        try {
          const errObj = await res.json();
          errMsg = errObj.message || errObj.hint || errMsg;
        } catch {
          errMsg = await res.text();
        }
        throw new Error(`Gagal pull dari tabel '${tableName}': ${errMsg}`);
      }

      const items = await res.json();
      const page = Array.isArray(items) ? items : [];
      all.push(...page);
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    return all;
  }
}

export const supabaseAdapter = new SupabaseAdapter();

