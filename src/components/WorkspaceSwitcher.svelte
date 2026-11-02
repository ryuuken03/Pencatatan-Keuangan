<script>
  import { formatIDR } from "../lib/utils.js";

  let {
    activeWorkspace = "personal",
    onSelectWorkspace,
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
  } = $props();

  const workspaceTabs = [
    {
      id: "personal",
      label: "Buku Pribadi",
      shortLabel: "Pribadi",
      activeTabCls: "bg-indigo-950 text-white shadow-sm",
      dotCls: "bg-indigo-400",
    },
    {
      id: "business",
      label: "Buku Usaha",
      shortLabel: "Usaha",
      activeTabCls: "bg-teal-900 text-white shadow-sm",
      dotCls: "bg-teal-400",
    },
    {
      id: "kopdes",
      label: "Manager Kopdes",
      shortLabel: "Kopdes",
      activeTabCls: "bg-emerald-900 text-white shadow-sm",
      dotCls: "bg-emerald-400",
    },
  ];

  // Tema visual dinamis per Buku Kas (Solid Flat Color, Tanpa Gradient)
  let theme = $derived.by(() => {
    if (activeWorkspace === "business") {
      return {
        heroBg: "bg-teal-900",
        heroBorder: "border-teal-800",
        badgeBg: "bg-teal-800 text-teal-100 border-teal-700",
        badgeText: "BUKU KAS USAHA",
        primaryBtn: "bg-teal-800 hover:bg-teal-700 text-white shadow-sm",
        walletAccent: "border-l-teal-600",
      };
    }
    if (activeWorkspace === "kopdes") {
      return {
        heroBg: "bg-emerald-900",
        heroBorder: "border-emerald-800",
        badgeBg: "bg-emerald-800 text-emerald-100 border-emerald-700",
        badgeText: "BUKU KAS MANAGER KOPDES",
        primaryBtn: "bg-emerald-800 hover:bg-emerald-700 text-white shadow-sm",
        walletAccent: "border-l-emerald-600",
      };
    }
    return {
      heroBg: "bg-indigo-950",
      heroBorder: "border-indigo-900",
      badgeBg: "bg-indigo-900 text-indigo-100 border-indigo-800",
      badgeText: "BUKU KAS PRIBADI",
      primaryBtn: "bg-indigo-950 hover:bg-indigo-900 text-white shadow-sm",
      walletAccent: "border-l-indigo-600",
    };
  });
</script>

<header
  class="bg-white/95 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-20"
>
  <div class="max-w-7xl mx-auto px-3.5 sm:px-6 py-3">
    <!-- Baris 1: Segmented Workspace Switcher & Tombol Aksi -->
    <div class="flex items-center justify-between gap-2">
      <!-- Segmented Control -->
      <nav
        aria-label="Pilih Buku Kas"
        class="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200/80 flex-1 sm:flex-initial"
      >
        {#each workspaceTabs as tab}
          <button
            type="button"
            onclick={() => onSelectWorkspace(tab.id)}
            class="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-bold rounded-lg transition-all cursor-pointer {activeWorkspace ===
            tab.id
              ? tab.activeTabCls
              : 'text-slate-600 hover:text-slate-900'}"
          >
            <span
              class="w-1.5 h-1.5 rounded-full {activeWorkspace === tab.id
                ? tab.dotCls
                : 'bg-slate-300'}"
            ></span>
            <span>{tab.label}</span>
          </button>
        {/each}
      </nav>

      <!-- Tombol Dompet & Catat (Desktop & Mobile Icon) -->
      <div class="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onclick={onOpenManageModal}
          class="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 shadow-2xs transition-colors cursor-pointer"
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
          <span class="hidden sm:inline">Dompet & Kategori</span>
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
          title="Scan Foto Struk / Nota (WebP + OCR)"
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
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-2.5 mt-3">
      <!-- Hero Saldo Utama -->
      <div
        class="lg:col-span-5 {theme.heroBg} border {theme.heroBorder} rounded-2xl p-4 text-white shadow-sm flex flex-col justify-between relative overflow-hidden"
      >
        <div class="flex items-center justify-between gap-2">
          <span
            class="text-[11px] font-bold uppercase tracking-wider text-slate-300"
            >Total Saldo Aktif</span
          >
          <span
            class="px-2 py-0.5 text-[10px] font-extrabold tracking-wider uppercase rounded-full border {theme.badgeBg}"
          >
            {theme.badgeText}
          </span>
        </div>
        <div
          class="text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums mt-1.5"
        >
          {formatIDR(summary.totalBalance)}
        </div>
      </div>

      <!-- 3 Kartu Metrik Pendamping (Pemasukan, Pengeluaran, Reimburse) -->
      <div class="lg:col-span-7 grid grid-cols-3 gap-2">
        <!-- Pemasukan -->
        <div
          class="bg-slate-50/90 border border-slate-200/80 rounded-2xl p-3 flex flex-col justify-between"
        >
          <div class="flex items-center gap-1.5">
            <!-- <span class="w-5 h-5 rounded-md bg-emerald-100 text-emerald-700 inline-flex items-center justify-center shrink-0">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M12 19V5M5 12l7-7 7 7" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span> -->
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
          class="bg-slate-50/90 border border-slate-200/80 rounded-2xl p-3 flex flex-col justify-between"
        >
          <div class="flex items-center gap-1.5">
            <!-- <span
              class="w-5 h-5 rounded-md bg-rose-100 text-rose-700 inline-flex items-center justify-center shrink-0"
            >
              <svg
                class="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
              >
                <path
                  d="M12 5v14M19 12l-7 7-7-7"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </span> -->
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
          class="rounded-2xl p-3 flex flex-col justify-between border {summary.pendingReimburseTotal >
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

    <!-- Baris 3: Mini Wallet Cards (Tanpa Scrollbar Kasar) -->
    {#if accounts.length > 0}
      <div
        class="flex items-center gap-2 overflow-x-auto no-scrollbar pt-2.5 mt-2.5 border-t border-slate-100"
      >
        {#each accounts as acc (acc.id)}
          <button
            type="button"
            onclick={onOpenManageModal}
            class="inline-flex items-center gap-2.5 px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200/90 border-l-4 {theme.walletAccent} rounded-xl shrink-0 transition-colors cursor-pointer text-left"
          >
            <div>
              <div
                class="text-[10px] font-bold uppercase tracking-wider text-slate-400 leading-none"
              >
                {acc.name}
              </div>
              <div
                class="text-xs font-extrabold text-slate-800 tabular-nums mt-1"
              >
                {formatIDR(accountBalances[acc.id] ?? 0)}
              </div>
            </div>
          </button>
        {/each}
        <button
          type="button"
          onclick={onOpenManageModal}
          class="inline-flex items-center gap-1 px-2.5 py-2 text-[11px] font-bold text-slate-500 hover:text-slate-800 bg-slate-100/70 hover:bg-slate-100 rounded-xl shrink-0 cursor-pointer"
        >
          <span>+ Kelola</span>
        </button>
      </div>
    {/if}
  </div>
</header>
