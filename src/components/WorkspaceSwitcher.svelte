<script>
  import {
    formatIDR,
    getWorkspaceName,
    getWorkspaceTheme,
    getWorkspaceType,
  } from "../lib/utils.js";
  import AddWorkspaceModal from "./AddWorkspaceModal.svelte";

  let {
    workspaces = [],
    activeWorkspace = "personal",
    onSelectWorkspace,
    onCreateWorkspace,
    onUpdateWorkspace,
    onDeleteWorkspace,
    accounts = [],
    accountBalances = {},
    summary = {
      totalBalance: 0,
      income: 0,
      expense: 0,
      pendingReimburseCount: 0,
      pendingReimburseTotal: 0,
    },
    onOpenManageModal,
    onOpenNewTransaction,
    onOpenVoiceModal,
    onOpenReceiptModal,
    onOpenReportModal,
    onOpenSecurityModal,
    onOpenSyncModal,
    syncState = {
      isSyncing: false,
      totalPending: 0,
      isConfigured: false,
      isAuthenticated: false,
    },
    isPinEnabled = false,
  } = $props();

  let isWalletDetailOpen = $state(false);
  let isAddWsModalOpen = $state(false);

  function getAccountTypeLabel(type) {
    if (type === "bank") return "Rekening Bank";
    if (type === "ewallet") return "E-Wallet";
    return "Kas Tunai";
  }

  // Daftar workspace aktif (minimal Buku Pribadi selalu tersedia)
  let effectiveWorkspaces = $derived(
    workspaces && workspaces.length > 0
      ? workspaces
      : [{ id: "personal", name: "Buku Pribadi", type: "personal" }],
  );

  // Tema visual dinamis per Buku Kas (Solid Flat Color, Tanpa Gradient)
  let theme = $derived(getWorkspaceTheme(activeWorkspace, effectiveWorkspaces));
</script>

<header
  class="bg-white/95 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-20"
>
  <div class="max-w-7xl mx-auto px-3.5 sm:px-6 py-2.5 sm:py-3">
    <!-- Top Toolbar Khusus Mobile (< 768px): Nama Aplikasi & Identitas Buku Aktif -->
    <div
      class="md:hidden flex items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-slate-200/80"
    >
      <div class="flex items-center gap-2 min-w-0">
        <div
          class="w-7 h-7 rounded-lg {theme.heroBg} text-white flex items-center justify-center shadow-2xs shrink-0"
        >
          <svg
            class="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
          >
            <path
              d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <path d="M8 7h8M8 11h5" stroke-linecap="round" />
          </svg>
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-1.5">
            <!-- <span class="text-xs font-extrabold tracking-tight text-slate-900">
              Buku Kas
            </span>
            <span class="text-slate-300">•</span> -->
            <span class="text-[11px] font-bold text-slate-600 truncate">
              {getWorkspaceName(activeWorkspace, effectiveWorkspaces)}
            </span>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-1.5 shrink-0">
        {#if onOpenSyncModal}
          <button
            type="button"
            onclick={onOpenSyncModal}
            class="p-1.5 rounded-lg border cursor-pointer relative {syncState.isSyncing
              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
              : !syncState.isAuthenticated
                ? 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                : syncState.totalPending > 0
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'}"
            title={syncState.isSyncing
              ? "Sedang Sinkronisasi..."
              : !syncState.isAuthenticated
                ? "Hubungkan Cloud"
                : syncState.totalPending > 0
                  ? `${syncState.totalPending} data pending sync`
                  : "Sinkronisasi Aktif"}
            aria-label="Status Sinkron"
          >
            {#if syncState.isSyncing}
              <svg
                class="w-3.5 h-3.5 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.2"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            {:else}
              <svg
                class="w-3.5 h-3.5"
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
            {/if}
            {#if syncState.isAuthenticated && syncState.totalPending > 0}
              <span
                class="w-2 h-2 rounded-full bg-amber-500 absolute -top-0.5 -right-0.5"
              ></span>
            {:else if syncState.isAuthenticated}
              <span
                class="w-1.5 h-1.5 rounded-full bg-emerald-500 absolute -top-0.5 -right-0.5"
              ></span>
            {/if}
          </button>
        {/if}

        {#if isPinEnabled}
          <button
            type="button"
            onclick={onOpenSecurityModal}
            class="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-pointer"
            title="PIN Keamanan Aktif"
            aria-label="PIN Keamanan Aktif"
          >
            <svg
              class="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
            >
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </button>
        {/if}
        <!-- <span
          class="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider rounded-md bg-slate-100 text-slate-600 border border-slate-200/80"
        >
          Offline Ready
        </span> -->
      </div>
    </div>

    <!-- Baris 1: Segmented Workspace Switcher & Tombol Aksi (Khusus Desktop >= 768px; Mobile menggunakan Bottom Navbar) -->
    <div class="hidden md:flex items-center justify-between gap-2 mb-3">
      <!-- Segmented Control Dinamis -->
      <nav
        aria-label="Pilih Buku Kas"
        class="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80 flex-wrap gap-1"
      >
        {#each effectiveWorkspaces as ws (ws.id)}
          {@const tabTheme = getWorkspaceTheme(ws.id, effectiveWorkspaces)}
          {@const isSelected = activeWorkspace === ws.id}
          <button
            type="button"
            onclick={() => onSelectWorkspace(ws.id)}
            class="inline-flex items-center justify-center gap-1.5 px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-bold rounded-lg transition-all cursor-pointer {isSelected
              ? tabTheme.activeTabCls
              : 'text-slate-600 hover:text-slate-900'}"
          >
            <span
              class="w-1.5 h-1.5 rounded-full {isSelected
                ? tabTheme.dotCls
                : 'bg-slate-300'}"
            ></span>
            <span
              >{ws.name || getWorkspaceName(ws.id, effectiveWorkspaces)}</span
            >
          </button>
        {/each}

        {#if onCreateWorkspace}
          <button
            type="button"
            onclick={() => (isAddWsModalOpen = true)}
            class="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 rounded-lg transition-colors cursor-pointer"
            title="Tambah Buku Usaha atau Pekerjaan"
          >
            <svg
              class="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <path
                d="M12 5v14M5 12h14"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            <span>Tambah</span>
          </button>
        {/if}
      </nav>

      <!-- Tombol Dompet, Laporan, Keamanan & Catat (Desktop & Mobile Icon) -->
      <div class="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {#if onOpenSyncModal}
          <button
            type="button"
            onclick={onOpenSyncModal}
            class="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 text-xs font-semibold border rounded-xl shadow-2xs transition-colors cursor-pointer {syncState.isSyncing
              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
              : !syncState.isAuthenticated
                ? 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                : syncState.totalPending > 0
                  ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'}"
            title={syncState.isSyncing
              ? "Sedang Sinkronisasi..."
              : !syncState.isAuthenticated
                ? "Hubungkan Cloud"
                : syncState.totalPending > 0
                  ? `${syncState.totalPending} data pending sinkronisasi`
                  : "Sinkronisasi Aktif"}
          >
            {#if syncState.isSyncing}
              <svg
                class="w-4 h-4 animate-spin text-indigo-600"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.2"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              <span class="hidden xl:inline">Syncing...</span>
            {:else}
              <svg
                class="w-4 h-4 {!syncState.isAuthenticated
                  ? 'text-slate-500'
                  : syncState.totalPending > 0
                    ? 'text-amber-600'
                    : 'text-emerald-600'}"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              {#if !syncState.isAuthenticated}
                <span class="font-bold text-slate-700">Sinkronisasi</span>
              {:else if syncState.totalPending > 0}
                <span class="tabular-nums font-bold text-amber-700"
                  >{syncState.totalPending} Pending</span
                >
              {:else}
                <span class="hidden xl:inline font-bold text-emerald-700"
                  >Tersinkron</span
                >
                <span class="xl:hidden font-bold text-emerald-700">Sync</span>
              {/if}
            {/if}
          </button>
        {/if}

        <button
          type="button"
          onclick={onOpenReportModal}
          class="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 shadow-2xs transition-colors cursor-pointer"
          title="Rekap Laporan, Export & Import Excel (.xlsx)"
        >
          <svg
            class="w-4 h-4 text-slate-600"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.9"
          >
            <path
              d="M18 20V10M12 20V4M6 20v-6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <span class="hidden lg:inline">Laporan & Excel</span>
        </button>

        <button
          type="button"
          onclick={onOpenSecurityModal}
          class="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 shadow-2xs transition-colors cursor-pointer"
          title="Backup AES-256 & Kunci PIN 6 Digit"
        >
          <svg
            class="w-4 h-4 {isPinEnabled
              ? 'text-emerald-700'
              : 'text-slate-500'}"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.9"
          >
            <path
              d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <span class="hidden xl:inline">Backup & PIN</span>
        </button>

        <button
          type="button"
          onclick={onOpenManageModal}
          class="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 shadow-2xs transition-colors cursor-pointer"
          title="Kelola Dompet & Kategori"
        >
          <svg
            class="w-4 h-4 text-slate-500"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
          >
            <path
              d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5Z"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <path d="M16 12h5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <span class="hidden sm:inline">Dompet</span>
        </button>

        <button
          type="button"
          onclick={onOpenVoiceModal}
          class="hidden md:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 shadow-2xs transition-colors cursor-pointer"
          title="Catat Cepat via Suara (id-ID)"
        >
          <svg
            class="w-4 h-4 text-rose-600"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <path
              d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <span>Suara</span>
        </button>

        <button
          type="button"
          onclick={onOpenReceiptModal}
          class="hidden md:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 shadow-2xs transition-colors cursor-pointer"
          title="Scan Foto Struk / Nota"
        >
          <svg
            class="w-4 h-4 text-emerald-700"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <circle cx="12" cy="13" r="3" />
          </svg>
          <span>Foto Struk</span>
        </button>

        <button
          type="button"
          onclick={onOpenNewTransaction}
          class="hidden md:inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-bold rounded-xl transition-colors cursor-pointer {theme.primaryBtn}"
        >
          <svg
            class="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
          >
            <path
              d="M12 5v14M5 12h14"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <span>Catat Transaksi</span>
        </button>
      </div>
    </div>

    <!-- Baris 2: Hero Balance Card + Metrik Arus Kas -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-2.5">
      <!-- Hero Saldo Utama -->
      <div
        class="lg:col-span-5 {theme.heroBg} border {theme.heroBorder} rounded-2xl p-4 text-white shadow-sm flex flex-col justify-between relative overflow-hidden"
      >
        <div class="flex items-center justify-between gap-2">
          <span
            class="text-[11px] font-bold uppercase tracking-wider text-slate-300"
            >Total Saldo Aktif</span
          >
          <!-- <span
            class="px-2 py-0.5 text-[10px] font-extrabold tracking-wider uppercase rounded-full border {theme.badgeBg}"
          >
            {theme.badgeText}
          </span> -->
          <button
            type="button"
            onclick={() => (isWalletDetailOpen = true)}
            class="px-2.5 py-1 text-[11px] font-extrabold rounded-xl border {theme.badgeBg} hover:bg-white/15 transition-colors cursor-pointer shrink-0 inline-flex items-center gap-1"
          >
            <span>Lihat Detail ({accounts.length})</span>
            <svg
              class="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
            >
              <path
                d="m9 18 6-6-6-6"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
        </div>
        <div class="flex items-end justify-between gap-2 mt-1.5">
          <div
            class="text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums truncate"
          >
            {formatIDR(summary.totalBalance)}
          </div>
        </div>
      </div>

      <!-- 3 Kartu Metrik Pendamping (Pemasukan, Pengeluaran, Reimburse) -->
      <div class="lg:col-span-7 grid grid-cols-3 gap-2">
        <!-- Pemasukan -->
        <div
          class="bg-slate-50/90 border border-slate-200/80 rounded-2xl p-2 flex flex-col justify-between"
        >
          <div class="flex items-center gap-1.5">
            <span
              class="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 truncate"
              >Pemasukan</span
            >
          </div>
          <div
            class="text-xs sm:text-base font-extrabold text-emerald-700 tabular-nums mt-2 truncate"
          >
            +{formatIDR(summary.income)}
          </div>
        </div>

        <!-- Pengeluaran -->
        <div
          class="bg-slate-50/90 border border-slate-200/80 rounded-2xl p-2 flex flex-col justify-between"
        >
          <div class="flex items-center gap-1.5">
            <span
              class="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 truncate"
              >Pengeluaran</span
            >
          </div>
          <div
            class="text-xs sm:text-base font-extrabold text-rose-700 tabular-nums mt-2 truncate"
          >
            -{formatIDR(summary.expense)}
          </div>
        </div>

        <!-- Reimburse Pending -->
        <div
          class="rounded-2xl p-2 flex flex-col justify-between border {summary.pendingReimburseTotal >
          0
            ? 'bg-amber-50 border-amber-300/90'
            : 'bg-slate-50/90 border-slate-200/80'}"
        >
          <div class="flex items-center justify-between gap-1">
            <span
              class="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider {summary.pendingReimburseTotal >
              0
                ? 'text-amber-900'
                : 'text-slate-500'} truncate"
            >
              Talangan
            </span>
            {#if summary.pendingReimburseCount > 0}
              <span
                class="px-1.5 py-0.2 bg-amber-600 text-white rounded-full text-[10px] font-extrabold tabular-nums"
              >
                {summary.pendingReimburseCount}
              </span>
            {/if}
          </div>
          <div
            class="text-xs sm:text-base font-extrabold {summary.pendingReimburseTotal >
            0
              ? 'text-amber-800'
              : 'text-slate-700'} tabular-nums mt-2 truncate"
          >
            {formatIDR(summary.pendingReimburseTotal)}
          </div>
        </div>
      </div>
    </div>
  </div>
</header>

<!-- Modal Detail Rincian Saldo per Dompet -->
{#if isWalletDetailOpen}
  <div
    class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4 overflow-y-auto"
  >
    <div
      class="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-slate-200 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
    >
      <!-- Header Modal -->
      <div
        class="flex items-center justify-between px-4 py-3.5 {theme.heroBg} text-white shrink-0"
      >
        <div>
          <span
            class="block text-[10px] font-extrabold uppercase tracking-wider text-white/75"
          >
            {theme.badgeText}
          </span>
          <h2 class="text-sm font-extrabold tracking-wide uppercase">
            Rincian Saldo Dompet ({accounts.length})
          </h2>
        </div>
        <button
          type="button"
          onclick={() => (isWalletDetailOpen = false)}
          class="p-1 text-white/70 hover:text-white cursor-pointer"
          aria-label="Tutup"
        >
          <svg
            class="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
          >
            <path
              d="M18 6L6 18M6 6l12 12"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </div>

      <!-- Body Daftar Dompet -->
      <div class="p-4 space-y-3 overflow-y-auto text-xs sm:text-sm">
        <!-- Total Saldo Card -->
        <div
          class="p-3.5 bg-slate-100 border border-slate-200 rounded-2xl flex items-center justify-between"
        >
          <span class="text-xs font-extrabold uppercase text-slate-600">
            Total Saldo Aktif
          </span>
          <span
            class="text-base sm:text-lg font-extrabold tabular-nums text-slate-900"
          >
            {formatIDR(summary.totalBalance)}
          </span>
        </div>

        {#if accounts.length === 0}
          <div
            class="p-6 text-center text-slate-400 text-xs bg-slate-50 rounded-2xl border border-slate-200"
          >
            Belum ada dompet pada buku kas ini.
          </div>
        {:else}
          <div class="space-y-2">
            {#each accounts as acc (acc.id)}
              <div
                class="p-3.5 bg-white border border-slate-200 border-l-4 {theme.walletAccent} rounded-xl shadow-2xs flex items-center justify-between gap-3"
              >
                <div class="min-w-0">
                  <div
                    class="text-xs sm:text-sm font-extrabold text-slate-900 truncate"
                  >
                    {acc.name}
                  </div>
                  <span
                    class="inline-block mt-0.5 px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] font-bold uppercase"
                  >
                    {getAccountTypeLabel(acc.type)}
                  </span>
                </div>
                <div class="text-right shrink-0">
                  <div
                    class="text-sm sm:text-base font-extrabold tabular-nums text-slate-900"
                  >
                    {formatIDR(accountBalances[acc.id] ?? 0)}
                  </div>
                  <div class="text-[10px] text-slate-400 tabular-nums mt-0.5">
                    Saldo awal: {formatIDR(acc.initial_balance ?? 0)}
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/if}

        <!-- Footer Modal -->
        <div
          class="flex items-center justify-between gap-2 pt-2 border-t border-slate-200"
        >
          <button
            type="button"
            onclick={() => {
              isWalletDetailOpen = false;
              onOpenManageModal?.();
            }}
            class="px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
          >
            Kelola Dompet & Kategori
          </button>
          <button
            type="button"
            onclick={() => (isWalletDetailOpen = false)}
            class="px-4 py-2 text-xs font-extrabold rounded-xl cursor-pointer {theme.primaryBtn}"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<AddWorkspaceModal
  isOpen={isAddWsModalOpen}
  {onCreateWorkspace}
  onClose={() => (isAddWsModalOpen = false)}
/>
