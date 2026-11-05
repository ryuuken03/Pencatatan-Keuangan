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
    workspaceBalances = {},
    workspaceAccountCounts = {},
    isPinEnabled = false,
    syncPendingCount = 0,
    isSyncAuthenticated = false,
    isSyncing = false,
    onOpenNewTransaction,
    onOpenReceiptModal,
    onOpenVoiceModal,
    onOpenReportModal,
    onOpenSecurityModal,
    onOpenManageWallets,
    onOpenManageCategories,
    onOpenSyncModal,
  } = $props();

  // State pop-up sheet aktif: null | 'workspace' | 'catat' | 'pengaturan'
  let activeSheet = $state(null);
  let isAddWsModalOpen = $state(false);

  function toggleSheet(sheetName) {
    activeSheet = activeSheet === sheetName ? null : sheetName;
  }

  function closeSheet() {
    activeSheet = null;
  }

  let effectiveWorkspaces = $derived(
    workspaces && workspaces.length > 0
      ? workspaces
      : [{ id: "personal", name: "Buku Pribadi", type: "personal" }],
  );

  let currentWs = $derived(
    effectiveWorkspaces.find((w) => w.id === activeWorkspace) ||
      effectiveWorkspaces[0],
  );

  let currentTheme = $derived(
    getWorkspaceTheme(activeWorkspace, effectiveWorkspaces),
  );

  let currentWsName = $derived(
    currentWs?.name || getWorkspaceName(activeWorkspace, effectiveWorkspaces),
  );

  let primaryBtnCls = $derived(currentTheme.primaryBtn);
  let sheetHeaderBg = $derived(currentTheme.heroBg);

  function getWorkspaceDescription(type) {
    if (type === "business")
      return "Modal, omzet penjualan & operasional usaha";
    if (type === "pekerjaan")
      return "Gaji, honor proyek, SPJ dinas & operasional kantor";
    return "Kas harian, tabungan & rumah tangga";
  }
</script>

<!-- Backdrop + Pop-up Bottom Sheet Mobile (< 768px) -->
{#if activeSheet}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    onclick={closeSheet}
    class="md:hidden fixed inset-0 z-40 bg-slate-950/55 backdrop-blur-xs flex items-end justify-center pb-[56px]"
  >
    <div
      onclick={(e) => e.stopPropagation()}
      class="bg-white w-full rounded-t-2xl border-t border-slate-200 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-3 duration-150"
    >
      <!-- 1. BOTTOM SHEET: WORKSPACE SWITCHER -->
      {#if activeSheet === "workspace"}
        <div
          class="px-4 py-3 {sheetHeaderBg} text-white flex items-center justify-between"
        >
          <div>
            <!-- <span class="block text-[10px] font-extrabold uppercase tracking-wider text-white/75">
              PILIH RUANG KERJA
            </span> -->
            <h3 class="text-xs font-extrabold uppercase tracking-wide">
              Pindah Buku Kas
            </h3>
          </div>
          <button
            type="button"
            onclick={closeSheet}
            aria-label="Tutup pilihan buku"
            class="p-1 text-white/75 hover:text-white cursor-pointer"
          >
            <svg
              class="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
            >
              <path
                d="M18 6 6 18M6 6l12 12"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
        </div>

        <div class="p-3.5 space-y-2">
          {#each effectiveWorkspaces as ws (ws.id)}
            {@const wsType = getWorkspaceType(ws.id, effectiveWorkspaces)}
            {@const tabTheme = getWorkspaceTheme(ws.id, effectiveWorkspaces)}
            {@const isSelected = activeWorkspace === ws.id}
            <button
              type="button"
              onclick={() => {
                onSelectWorkspace?.(ws.id);
                closeSheet();
              }}
              class="w-full p-3.5 rounded-xl border text-left flex items-center justify-between gap-3 transition-all cursor-pointer {isSelected
                ? `${tabTheme.heroBg} text-white ${tabTheme.heroBorder}`
                : `bg-slate-50 hover:bg-slate-100 text-slate-900 border-slate-200 border-l-4 ${tabTheme.walletAccent}`}"
            >
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <span
                    class="w-2 h-2 rounded-full shrink-0 {isSelected
                      ? 'bg-white'
                      : tabTheme.dotCls}"
                  ></span>
                  <span class="text-xs font-extrabold uppercase tracking-wide">
                    {ws.name || getWorkspaceName(ws.id, effectiveWorkspaces)}
                  </span>
                  {#if isSelected}
                    <span
                      class="px-1.5 py-0.5 text-[9px] font-extrabold uppercase bg-white/20 text-white rounded"
                    >
                      Aktif
                    </span>
                  {/if}
                </div>
                <p
                  class="text-[11px] mt-0.5 truncate {isSelected
                    ? 'text-white/80'
                    : 'text-slate-500'}"
                >
                  <!-- {getWorkspaceDescription(wsType)} -->
                </p>
              </div>

              <div class="text-right shrink-0">
                <div
                  class="text-xs font-extrabold tabular-nums {isSelected
                    ? 'text-white'
                    : 'text-slate-900'}"
                >
                  {formatIDR(workspaceBalances[ws.id] ?? 0)}
                </div>
                <div
                  class="text-[10px] tabular-nums {isSelected
                    ? 'text-white/75'
                    : 'text-slate-400'}"
                >
                  {workspaceAccountCounts[ws.id] ?? 0} Dompet
                </div>
              </div>
            </button>
          {/each}

          {#if onCreateWorkspace}
            <button
              type="button"
              onclick={() => {
                closeSheet();
                isAddWsModalOpen = true;
              }}
              class="w-full py-2.5 px-3 rounded-xl border border-dashed border-slate-300 hover:border-slate-400 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer mt-1"
            >
              <svg
                class="w-4 h-4 text-slate-500"
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
              <span>Tambah Buku Usaha atau Pekerjaan</span>
            </button>
          {/if}
        </div>

        <!-- 2. BOTTOM SHEET: CATAT TRANSAKSI (TAMBAH, FOTO, RECORD VOICE) -->
      {:else if activeSheet === "catat"}
        <div
          class="px-4 py-3 {sheetHeaderBg} text-white flex items-center justify-between"
        >
          <div>
            <!-- <span
              class="block text-[10px] font-extrabold uppercase tracking-wider text-white/75"
            >
              METODE INPUT • {currentWs.name.toUpperCase()}
            </span> -->
            <h3 class="text-xs font-extrabold uppercase tracking-wide">
              Pilih Cara Catat Transaksi
            </h3>
          </div>
          <button
            type="button"
            onclick={closeSheet}
            aria-label="Tutup menu catat"
            class="p-1 text-white/75 hover:text-white cursor-pointer"
          >
            <svg
              class="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
            >
              <path
                d="M18 6 6 18M6 6l12 12"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
        </div>

        <div class="p-3.5 space-y-2.5">
          <!-- Aksi 1: Tambah Transaksi Manual -->
          <button
            type="button"
            onclick={() => {
              closeSheet();
              onOpenNewTransaction?.();
            }}
            class="w-full p-3.5 rounded-xl border {primaryBtnCls} flex items-center justify-between gap-3 shadow-sm active:scale-[0.99] transition-all cursor-pointer text-left"
          >
            <div class="flex items-center gap-3 min-w-0">
              <div
                class="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0"
              >
                <svg
                  class="w-5 h-5 text-white"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.4"
                >
                  <path
                    d="M12 5v14M5 12h14"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </div>
              <div class="min-w-0">
                <div
                  class="text-xs font-extrabold uppercase tracking-wide text-white"
                >
                  Tambah Transaksi
                </div>
                <!-- <div class="text-[11px] text-white/80 truncate">
                  Input form manual, kalkulator nominal & dana talangan
                </div> -->
              </div>
            </div>
            <svg
              class="w-4 h-4 text-white/80 shrink-0"
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

          <div class="grid grid-cols-2 gap-2.5">
            <!-- Aksi 2: Foto Struk / Nota -->
            <button
              type="button"
              onclick={() => {
                closeSheet();
                onOpenReceiptModal?.();
              }}
              class="p-3.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 flex flex-col items-start gap-2 active:scale-[0.99] transition-all cursor-pointer text-left"
            >
              <div
                class="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center"
              >
                <svg
                  class="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.2"
                >
                  <path
                    d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                  <circle cx="12" cy="13" r="3" />
                </svg>
              </div>
              <div>
                <div class="text-xs font-extrabold text-slate-900">
                  Foto Struk
                </div>
                <!-- <div class="text-[10px] text-slate-500 mt-0.5">
                  Scan struk/nota (WebP + OCR)
                </div> -->
              </div>
            </button>

            <!-- Aksi 3: Record Voice -->
            <button
              type="button"
              onclick={() => {
                closeSheet();
                onOpenVoiceModal?.();
              }}
              class="p-3.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 flex flex-col items-start gap-2 active:scale-[0.99] transition-all cursor-pointer text-left"
            >
              <div
                class="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center"
              >
                <svg
                  class="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.2"
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
              </div>
              <div>
                <div class="text-xs font-extrabold text-slate-900">
                  Rekam Suara
                </div>
                <!-- <div class="text-[10px] text-slate-500 mt-0.5">
                  Catat suara Bahasa Indonesia
                </div> -->
              </div>
            </button>
          </div>
        </div>

        <!-- 3. BOTTOM SHEET: PENGATURAN (LAPORAN & EXCEL, BACK UP & PIN, KATEGORI, DOMPET) -->
      {:else if activeSheet === "pengaturan"}
        <div
          class="px-4 py-3 {sheetHeaderBg} text-white flex items-center justify-between"
        >
          <div>
            <!-- <span
              class="block text-[10px] font-extrabold uppercase tracking-wider text-white/75"
            >
              MANAJEMEN & KEAMANAN • {currentWs.name.toUpperCase()}
            </span> -->
            <h3 class="text-xs font-extrabold uppercase tracking-wide">
              Menu Pengaturan
            </h3>
          </div>
          <button
            type="button"
            onclick={closeSheet}
            aria-label="Tutup menu pengaturan"
            class="p-1 text-white/75 hover:text-white cursor-pointer"
          >
            <svg
              class="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
            >
              <path
                d="M18 6 6 18M6 6l12 12"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
        </div>

        <div class="p-3.5 space-y-2.5">
          <!-- Aksi Utama: Sinkronisasi Cloud (Supabase Delta Sync) -->
          <button
            type="button"
            onclick={() => {
              closeSheet();
              onOpenSyncModal?.();
            }}
            class="w-full p-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center justify-between gap-3 shadow-2xs active:scale-[0.99] transition-all cursor-pointer text-left"
          >
            <div class="flex items-center gap-2.5 min-w-0">
              <div
                class="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-900 flex items-center justify-center shrink-0"
              >
                {#if isSyncing}
                  <svg
                    class="w-4 h-4 animate-spin text-indigo-700"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.2"
                  >
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                {:else}
                  <svg
                    class="w-4 h-4 text-indigo-700"
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
              </div>
              <div class="min-w-0">
                <div
                  class="text-xs font-extrabold text-slate-900 flex items-center gap-1.5"
                >
                  <span>Sinkronisasi</span>
                  {#if !isSyncAuthenticated}
                    <span
                      class="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-md"
                    >
                      Sinkronisasi
                    </span>
                  {:else if syncPendingCount > 0}
                    <span
                      class="px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-md tabular-nums"
                    >
                      {syncPendingCount} pending
                    </span>
                  {:else}
                    <span
                      class="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-md"
                    >
                      Tersinkron
                    </span>
                  {/if}
                </div>
                <!-- <div class="text-[10px] text-slate-500 truncate">
                  Delta Sync PostgreSQL Supabase & RLS
                </div> -->
              </div>
            </div>
            <svg
              class="w-4 h-4 text-slate-400 shrink-0"
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

          <div class="grid grid-cols-2 gap-2.5">
            <!-- Menu 1: Laporan & Excel -->
            <button
              type="button"
              onclick={() => {
                closeSheet();
                onOpenReportModal?.();
              }}
              class="p-3.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 flex flex-col items-start gap-2 active:scale-[0.99] transition-all cursor-pointer text-left"
            >
              <div
                class="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center"
              >
                <svg
                  class="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.1"
                >
                  <path
                    d="M18 20V10M12 20V4M6 20v-6"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </div>
              <div>
                <div class="text-xs font-extrabold text-slate-900">
                  Laporan & Excel
                </div>
                <!-- <div class="text-[10px] text-slate-500 mt-0.5">
                Rekap kas, Export & Import .xlsx
              </div> -->
              </div>
            </button>

            <!-- Menu 2: Back Up & PIN -->
            <button
              type="button"
              onclick={() => {
                closeSheet();
                onOpenSecurityModal?.();
              }}
              class="p-3.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 flex flex-col items-start gap-2 active:scale-[0.99] transition-all cursor-pointer text-left"
            >
              <div
                class="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-900 flex items-center justify-center relative"
              >
                <svg
                  class="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.1"
                >
                  <path
                    d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
                {#if isPinEnabled}
                  <span
                    class="w-2 h-2 rounded-full bg-emerald-500 absolute -top-0.5 -right-0.5"
                  ></span>
                {/if}
              </div>
              <div>
                <div class="text-xs font-extrabold text-slate-900">
                  Back Up & PIN
                </div>
                <!-- <div class="text-[10px] text-slate-500 mt-0.5">
                Backup AES-256 & PIN 6 digit
              </div> -->
              </div>
            </button>

            <!-- Menu 3: Kategori -->
            <button
              type="button"
              onclick={() => {
                closeSheet();
                onOpenManageCategories?.();
              }}
              class="p-3.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 flex flex-col items-start gap-2 active:scale-[0.99] transition-all cursor-pointer text-left"
            >
              <div
                class="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center"
              >
                <svg
                  class="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.1"
                >
                  <path
                    d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                  <line
                    x1="7"
                    y1="7"
                    x2="7.01"
                    y2="7"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </div>
              <div>
                <div class="text-xs font-extrabold text-slate-900">
                  Kategori
                </div>
                <!-- <div class="text-[10px] text-slate-500 mt-0.5">
                Kelola kategori masuk & keluar
              </div> -->
              </div>
            </button>

            <!-- Menu 4: Dompet -->
            <button
              type="button"
              onclick={() => {
                closeSheet();
                onOpenManageWallets?.();
              }}
              class="p-3.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 flex flex-col items-start gap-2 active:scale-[0.99] transition-all cursor-pointer text-left"
            >
              <div
                class="w-8 h-8 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center"
              >
                <svg
                  class="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.1"
                >
                  <path
                    d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5Z"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                  <path
                    d="M16 12h5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </div>
              <div>
                <div class="text-xs font-extrabold text-slate-900">Dompet</div>
                <!-- <div class="text-[10px] text-slate-500 mt-0.5">
                Kelola kas tunai & rekening bank
              </div> -->
              </div>
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<!-- Bottom Navigation Bar Utama Mobile (< 768px) — Ikon di Atas, Teks di Bawah -->
<nav
  aria-label="Navigasi Utama Mobile"
  class="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 px-2 h-14 grid grid-cols-3 items-stretch select-none"
>
  <!-- 1. Tab WorkspaceSwitcher (Buku Pribadi / Buku Usaha / Kopdes) -->
  <button
    type="button"
    onclick={() => toggleSheet("workspace")}
    class="flex flex-col items-center justify-center gap-0.5 px-1 rounded-xl transition-colors cursor-pointer {activeSheet ===
    'workspace'
      ? 'text-slate-950 bg-slate-100'
      : 'text-slate-600 hover:text-slate-900 active:bg-slate-100/70'}"
  >
    <div class="relative flex items-center justify-center h-5">
      <svg
        class="w-[18px] h-[18px] shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path
          d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <span
        class="w-2 h-2 rounded-full ring-2 ring-white absolute -top-0.5 -right-1.5 {currentTheme.dotCls}"
      ></span>
    </div>
    <span
      class="text-[10px] font-bold leading-tight tracking-tight truncate max-w-full"
    >
      {currentWsName}
    </span>
  </button>

  <!-- 2. Tombol Tengah: Catat Transaksi -->
  <button
    type="button"
    onclick={() => toggleSheet("catat")}
    class="flex flex-col items-center justify-center gap-0.5 px-1 rounded-xl transition-colors cursor-pointer group"
  >
    <div
      class="w-9 h-5 rounded-full {primaryBtnCls} flex items-center justify-center shadow-2xs group-active:scale-95 transition-transform"
    >
      <svg
        class="w-3.5 h-3.5 text-white shrink-0 transition-transform {activeSheet ===
        'catat'
          ? 'rotate-45'
          : ''}"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.6"
      >
        <path
          d="M12 5v14M5 12h14"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </div>
    <span
      class="text-[10px] font-extrabold leading-tight tracking-tight text-slate-900 truncate max-w-full"
    >
      Catat Transaksi
    </span>
  </button>

  <!-- 3. Tab Pengaturan -->
  <button
    type="button"
    onclick={() => toggleSheet("pengaturan")}
    class="flex flex-col items-center justify-center gap-0.5 px-1 rounded-xl transition-colors cursor-pointer {activeSheet ===
    'pengaturan'
      ? 'text-slate-950 bg-slate-100'
      : 'text-slate-600 hover:text-slate-900 active:bg-slate-100/70'}"
  >
    <div class="relative flex items-center justify-center h-5">
      <svg
        class="w-[18px] h-[18px] shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <circle cx="12" cy="12" r="3" />
        <path
          d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      {#if isSyncAuthenticated && syncPendingCount > 0}
        <span
          class="w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white absolute -top-0.5 -right-1.5"
        ></span>
      {:else if isPinEnabled}
        <span
          class="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white absolute -top-0.5 -right-1.5"
        ></span>
      {/if}
    </div>
    <span
      class="text-[10px] font-bold leading-tight tracking-tight truncate max-w-full"
    >
      Pengaturan
    </span>
  </button>
</nav>

<AddWorkspaceModal
  isOpen={isAddWsModalOpen}
  {onCreateWorkspace}
  onClose={() => (isAddWsModalOpen = false)}
/>
