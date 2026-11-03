<script>
  import { onMount, onDestroy } from "svelte";
  import { supabaseAdapter } from "../lib/sync/supabaseAdapter.js";
  import { syncEngine } from "../lib/sync/syncEngine.js";

  let {
    isOpen = false,
    activeWorkspace = "personal",
    onClose,
    onDataSynced,
  } = $props();

  let syncState = $state({
    isSyncing: false,
    lastError: null,
    totalPending: 0,
    pendingAccounts: 0,
    pendingCategories: 0,
    pendingTransactions: 0,
    pendingItems: 0,
    lastSyncedAt: null,
    isConfigured: supabaseAdapter.isConfigured(),
    isAuthenticated: supabaseAdapter.isAuthenticated(),
    user: supabaseAdapter.getUser(),
    autoSync: true,
  });

  let isUserLoggedIn = $derived(
    Boolean(syncState.isAuthenticated || syncState.user?.id || supabaseAdapter.isAuthenticated())
  );
  let currentUser = $derived(
    syncState.user || supabaseAdapter.getUser()
  );
  let isSupabaseConfigured = $derived(
    Boolean(syncState.isConfigured || supabaseAdapter.isConfigured())
  );
  let supabaseProjectUrl = $derived(
    supabaseAdapter.url
  );

  let inputAutoSync = $state(true);

  let authMode = $state("login"); // 'login' | 'register'
  let inputEmail = $state("");
  let inputPassword = $state("");

  let actionFeedback = $state(null); // { type: 'success' | 'error', message: '' }
  let isTesting = $state(false);
  let isSubmittingAuth = $state(false);

  let unsubscribe = null;

  onMount(() => {
    inputAutoSync = supabaseAdapter.getConfig().autoSync ?? true;
    unsubscribe = syncEngine.subscribe((state) => {
      syncState = state;
    });
  });

  onDestroy(() => {
    if (unsubscribe) unsubscribe();
  });

  let prevOpen = false;
  $effect(() => {
    if (isOpen && !prevOpen) {
      actionFeedback = null;
    }
    prevOpen = isOpen;
  });

  let headerTheme = $derived.by(() => {
    if (activeWorkspace === "business") {
      return {
        bg: "bg-teal-900",
        text: "text-white",
        border: "border-teal-800",
        badge: "bg-teal-800 text-teal-100",
        btnPrimary: "bg-teal-900 hover:bg-teal-800 text-white",
      };
    }
    if (activeWorkspace === "kopdes") {
      return {
        bg: "bg-emerald-900",
        text: "text-white",
        border: "border-emerald-800",
        badge: "bg-emerald-800 text-emerald-100",
        btnPrimary: "bg-emerald-900 hover:bg-emerald-800 text-white",
      };
    }
    return {
      bg: "bg-indigo-950",
      text: "text-white",
      border: "border-indigo-900",
      badge: "bg-indigo-900 text-indigo-100",
      btnPrimary: "bg-indigo-950 hover:bg-indigo-900 text-white",
    };
  });

  function formatTime(isoStr) {
    if (!isoStr) return "Belum pernah sinkron";
    try {
      const d = new Date(isoStr);
      return new Intl.DateTimeFormat("id-ID", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(d);
    } catch {
      return isoStr;
    }
  }

  function handleAutoSyncChange() {
    supabaseAdapter.saveConfig({ autoSync: inputAutoSync });
    syncEngine.notify();
  }

  async function handleTestConnection() {
    actionFeedback = null;
    isTesting = true;
    try {
      const res = await supabaseAdapter.testConnection();
      actionFeedback = {
        type: "success",
        message: res.message || "Koneksi ke Supabase berhasil.",
      };
    } catch (err) {
      actionFeedback = {
        type: "error",
        message: err.message || "Koneksi gagal.",
      };
    } finally {
      isTesting = false;
    }
  }

  async function handleAuthSubmit(e) {
    e?.preventDefault();
    actionFeedback = null;
    if (!inputEmail || !inputPassword) {
      actionFeedback = {
        type: "error",
        message: "Email dan password wajib diisi.",
      };
      return;
    }

    if (!isSupabaseConfigured) {
      actionFeedback = {
        type: "error",
        message: "Kredensial Supabase belum diset di file .env.",
      };
      return;
    }

    isSubmittingAuth = true;
    try {
      if (authMode === "register") {
        await supabaseAdapter.signUp(inputEmail, inputPassword);
        authMode = "login";
        inputPassword = "";
        actionFeedback = {
          type: "success",
          message:
            "Akun berhasil didaftarkan! Silakan masukkan password untuk masuk.",
        };
      } else {
        const session = await supabaseAdapter.signIn(inputEmail, inputPassword);
        inputPassword = "";
        syncState = {
          ...syncState,
          isAuthenticated: true,
          user: session?.user || supabaseAdapter.getUser(),
          userEmail: session?.user?.email || inputEmail,
        };
        actionFeedback = {
          type: "success",
          message: "Login berhasil! Sesi sinkronisasi aktif.",
        };
        syncEngine.notify();
      }
    } catch (err) {
      actionFeedback = {
        type: "error",
        message: err.message || "Autentikasi gagal.",
      };
    } finally {
      isSubmittingAuth = false;
    }
  }

  async function handleSignOut() {
    actionFeedback = null;
    try {
      await supabaseAdapter.signOut();
      syncState = {
        ...syncState,
        isAuthenticated: false,
        user: null,
        userEmail: null,
      };
      actionFeedback = {
        type: "success",
        message: "Berhasil keluar (logout) dari Supabase.",
      };
      syncEngine.notify();
    } catch (err) {
      actionFeedback = {
        type: "error",
        message: err.message || "Gagal logout.",
      };
    }
  }

  async function handleRunSync(forcePullAll = false) {
    actionFeedback = null;
    const res = await syncEngine.runSync({ forcePullAll });
    if (res.success) {
      actionFeedback = {
        type: "success",
        message: res.message || "Sinkronisasi berhasil.",
      };
      if (onDataSynced) {
        await onDataSynced();
      }
    } else {
      actionFeedback = {
        type: "error",
        message: res.message || "Sinkronisasi gagal.",
      };
    }
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs"
    onclick={onClose}
  >
    <div
      class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      onclick={(e) => e.stopPropagation()}
    >
      <!-- Header -->
      <div
        class="px-4 sm:px-6 py-3.5 {headerTheme.bg} {headerTheme.text} flex items-center justify-between shrink-0"
      >
        <div class="flex items-center gap-2.5">
          <div
            class="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0"
          >
            <svg
              class="w-4 h-4 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
            >
              <path
                d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </div>
          <div>
            <h2
              class="text-sm sm:text-base font-extrabold uppercase tracking-wide"
            >
              Sinkronisasi Cloud (Supabase)
            </h2>
            <p class="text-[11px] text-white/75">
              Delta Sync aman berbasis PostgreSQL & Row Level Security (RLS)
            </p>
          </div>
        </div>
        <button
          type="button"
          onclick={onClose}
          class="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          aria-label="Tutup modal"
        >
          <svg
            class="w-5 h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              d="M18 6 6 18M6 6l12 12"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </div>

      <!-- Feedback Banner -->
      {#if actionFeedback}
        <div
          class="px-4 py-2.5 text-xs font-semibold flex items-center justify-between border-b {actionFeedback.type ===
          'success'
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : 'bg-rose-50 text-rose-800 border-rose-200'}"
        >
          <span>{actionFeedback.message}</span>
          <button
            type="button"
            onclick={() => (actionFeedback = null)}
            class="text-xs font-bold hover:underline cursor-pointer ml-2"
          >
            Tutup
          </button>
        </div>
      {/if}

      <!-- Modal Body (Scrollable) -->
      <div class="p-4 sm:p-6 overflow-y-auto space-y-4 text-slate-800 text-xs">
        {#if isUserLoggedIn}
          <!-- TAMPILAN SETELAH LOGIN: HANYA TOMBOL LOGOUT & SINKRONISASI -->
          <div
            class="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-3"
          >
            <div class="min-w-0">
              <div class="flex items-center gap-1.5 mb-0.5">
                <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span
                  class="text-[10px] font-extrabold uppercase tracking-wider text-slate-500"
                  >Akun Cloud Aktif</span
                >
              </div>
              <div class="font-extrabold text-sm text-slate-900 truncate">
                {currentUser?.email || "Akun Supabase"}
              </div>
              {#if currentUser?.id}
                <div
                  class="text-[10px] text-slate-400 font-mono truncate max-w-[240px]"
                >
                  UID: {currentUser.id}
                </div>
              {/if}
            </div>
            <button
              type="button"
              onclick={handleSignOut}
              class="px-3 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded-lg cursor-pointer transition-colors shrink-0"
            >
              Keluar (Logout)
            </button>
          </div>

          <!-- Antrean Delta Sync & Kontrol Sync -->
          <div
            class="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-3"
          >
            <div class="flex items-center justify-between">
              <span
                class="text-[11px] font-extrabold uppercase tracking-wider text-slate-500"
                >Antrean Perubahan Lokal (Delta)</span
              >
              <span class="font-extrabold text-slate-700 tabular-nums">
                {syncState.totalPending} pending
              </span>
            </div>

            <div class="grid grid-cols-4 gap-2 text-center">
              <div class="p-2 bg-white rounded-lg border border-slate-200">
                <div class="text-[10px] text-slate-500 font-semibold">Akun</div>
                <div class="text-sm font-extrabold text-slate-800 tabular-nums">
                  {syncState.pendingAccounts}
                </div>
              </div>
              <div class="p-2 bg-white rounded-lg border border-slate-200">
                <div class="text-[10px] text-slate-500 font-semibold">
                  Kategori
                </div>
                <div class="text-sm font-extrabold text-slate-800 tabular-nums">
                  {syncState.pendingCategories}
                </div>
              </div>
              <div class="p-2 bg-white rounded-lg border border-slate-200">
                <div class="text-[10px] text-slate-500 font-semibold">
                  Transaksi
                </div>
                <div class="text-sm font-extrabold text-slate-800 tabular-nums">
                  {syncState.pendingTransactions}
                </div>
              </div>
              <div class="p-2 bg-white rounded-lg border border-slate-200">
                <div class="text-[10px] text-slate-500 font-semibold">Item</div>
                <div class="text-sm font-extrabold text-slate-800 tabular-nums">
                  {syncState.pendingItems}
                </div>
              </div>
            </div>

            <div
              class="flex items-center justify-between text-[11px] text-slate-600 pt-1"
            >
              <span>Sinkronisasi Terakhir:</span>
              <span class="font-semibold text-slate-800 tabular-nums"
                >{formatTime(syncState.lastSyncedAt)}</span
              >
            </div>

            <!-- Auto-Sync Toggle -->
            <label
              class="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200 cursor-pointer"
            >
              <span class="font-bold text-slate-700"
                >Sinkronisasi Otomatis saat Online</span
              >
              <input
                type="checkbox"
                bind:checked={inputAutoSync}
                onchange={handleAutoSyncChange}
                class="w-4 h-4 rounded text-indigo-600 cursor-pointer"
              />
            </label>

            <!-- Tombol Utama: Sinkronkan Sekarang -->
            <button
              type="button"
              onclick={() => handleRunSync(false)}
              disabled={syncState.isSyncing}
              class="w-full py-3 {headerTheme.btnPrimary} font-extrabold text-sm rounded-xl shadow-xs cursor-pointer flex items-center justify-center gap-2 transition-all disabled:opacity-50 active:scale-[0.99]"
            >
              {#if syncState.isSyncing}
                <svg
                  class="w-4 h-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                <span>Sedang Sinkronisasi...</span>
              {:else}
                <svg
                  class="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.2"
                >
                  <path
                    d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                  <path
                    d="M3 3v5h5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                  <path
                    d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                  <path
                    d="M16 21h5v-5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
                <span>Sinkronkan Sekarang (Delta Sync)</span>
              {/if}
            </button>

            <button
              type="button"
              onclick={() => handleRunSync(true)}
              disabled={syncState.isSyncing}
              class="w-full py-1.5 text-[11px] font-bold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 rounded-lg border border-slate-200 cursor-pointer transition-colors"
            >
              Tarik Ulang Semua Data Remote (Full Pull)
            </button>
          </div>
        {:else}
          <!-- TAMPILAN JIKA BELUM LOGIN: FORM MASUK / DAFTAR -->
          <div
            class="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-3"
          >
            <div
              class="flex rounded-lg bg-slate-200/70 p-0.5 text-[11px] font-bold"
            >
              <button
                type="button"
                onclick={() => (authMode = "login")}
                class="flex-1 py-1.5 rounded-md text-center transition-all cursor-pointer {authMode ===
                'login'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'}"
              >
                Masuk (Login)
              </button>
              <button
                type="button"
                onclick={() => (authMode = "register")}
                class="flex-1 py-1.5 rounded-md text-center transition-all cursor-pointer {authMode ===
                'register'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'}"
              >
                Daftar Akun Baru
              </button>
            </div>

            <form onsubmit={handleAuthSubmit} class="space-y-2.5">
              <div>
                <label
                  for="sync_email"
                  class="block text-[10px] font-extrabold text-slate-600 mb-1"
                  >EMAIL</label
                >
                <input
                  id="sync_email"
                  type="email"
                  bind:value={inputEmail}
                  placeholder="user@example.com"
                  required
                  class="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:outline-hidden focus:border-indigo-600"
                />
              </div>
              <div>
                <label
                  for="sync_password"
                  class="block text-[10px] font-extrabold text-slate-600 mb-1"
                  >PASSWORD</label
                >
                <input
                  id="sync_password"
                  type="password"
                  bind:value={inputPassword}
                  placeholder="Minimal 6 karakter"
                  required
                  class="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:outline-hidden focus:border-indigo-600"
                />
              </div>

              {#if authMode === "register"}
                <!-- <div
                  class="text-[10px] text-slate-600 leading-relaxed bg-amber-50 p-2.5 rounded-lg border border-amber-200"
                >
                  <span class="font-bold text-amber-800 block mb-0.5"
                    >Petunjuk Tanpa Kuota Email:</span
                  >
                  Pastikan opsi <strong>Confirm email</strong> di dashboard
                  Supabase (<em>Authentication &rarr; Providers &rarr; Email</em
                  >) sudah dinonaktifkan agar akun langsung aktif tanpa mengirim
                  email verifikasi.
                </div> -->
              {/if}

              <button
                type="submit"
                disabled={isSubmittingAuth}
                class="w-full py-2.5 {headerTheme.btnPrimary} font-bold rounded-lg cursor-pointer transition-colors disabled:opacity-50 text-xs"
              >
                {isSubmittingAuth
                  ? "Memproses..."
                  : authMode === "register"
                    ? "Daftar Akun"
                    : "Masuk & Aktifkan Sync"}
              </button>
            </form>
          </div>

          <!-- Indikator Endpoint .env -->
          {#if isSupabaseConfigured}
            <!-- <div class="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-3">
              <div class="min-w-0">
                <div class="flex items-center gap-1.5 mb-0.5">
                  <span class="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Endpoint Supabase</span>
                  <span class="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 text-[9px] font-bold rounded-sm">.env aktif</span>
                </div>
                <div class="font-mono text-xs font-bold text-slate-800 truncate">{config.url}</div>
              </div>
              <button
                type="button"
                onclick={handleTestConnection}
                disabled={isTesting}
                class="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-bold rounded-lg border border-slate-300 shadow-2xs cursor-pointer transition-colors disabled:opacity-50 shrink-0 text-xs"
              >
                {isTesting ? 'Menguji...' : 'Tes Koneksi'}
              </button>
            </div> -->
          {:else}
            <div
              class="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs space-y-1"
            >
              <div
                class="font-extrabold flex items-center gap-1.5 text-amber-800"
              >
                <svg
                  class="w-4 h-4 text-amber-600 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"
                  />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span>Kredensial .env Belum Terdeteksi</span>
              </div>
              <p class="text-[11px] text-amber-700 leading-relaxed">
                Konfigurasi Supabase dimuat dari berkas <code
                  class="px-1 py-0.5 bg-amber-100 rounded font-mono font-bold"
                  >.env</code
                >. Pastikan variabel
                <code
                  class="px-1 py-0.5 bg-amber-100 rounded font-mono font-bold"
                  >VITE_SUPABASE_URL</code
                >
                dan
                <code
                  class="px-1 py-0.5 bg-amber-100 rounded font-mono font-bold"
                  >VITE_SUPABASE_ANON_KEY</code
                > sudah terisi.
              </p>
            </div>
          {/if}
        {/if}
      </div>

      <!-- Footer -->
      <div
        class="px-4 sm:px-6 py-3 bg-slate-100 border-t border-slate-200 flex items-center justify-end"
      >
        <button
          type="button"
          onclick={onClose}
          class="px-4 py-2 bg-white hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl border border-slate-300 shadow-2xs cursor-pointer transition-colors"
        >
          Selesai
        </button>
      </div>
    </div>
  </div>
{/if}
