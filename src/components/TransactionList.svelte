<script>
  import {
    formatIDR,
    getWorkspaceName,
    getWorkspaceTheme,
    getWorkspaceType
  } from "../lib/utils.js";
  import { KOPDES_UNITS } from "../lib/db.js";
  import { getTxItems } from "../lib/utils/transactionFormatters.js";
  import TransactionFilterDrawer from "./TransactionFilterDrawer.svelte";
  import TransactionMobileCard from "./TransactionMobileCard.svelte";
  import TransactionDesktopTable from "./TransactionDesktopTable.svelte";

  let {
    workspaces = [],
    activeWorkspace = "personal",
    transactions = [],
    accountsMap = {},
    categoriesMap = {},
    onEdit,
    onDelete,
    onSettleReimburse,
    onPreviewReceipt,
    onOpenReportModal,
  } = $props();

  const PAGE_SIZE = 50;

  let searchQuery = $state("");
  let filterType = $state("all");
  let filterAccountId = $state("all");
  let filterCategoryId = $state("all");
  let filterUnitUsaha = $state("all");
  let filterReimburseStatus = $state("all"); // 'all' | 'pending' | 'settled'
  let filterDateFrom = $state("");
  let filterDateTo = $state("");
  let isAdvancedFilterOpen = $state(false);
  let visibleLimit = $state(PAGE_SIZE);

  // State untuk Swipe Card di Mobile (mendukung slide kanan & kiri)
  let swipedTxId = $state(null);
  let swipedOffset = $state(0); // +132 (slide kanan) atau -132 (slide kiri)

  function openSwipe(txId, offset) {
    swipedTxId = txId;
    swipedOffset = offset;
  }

  function closeSwipe() {
    swipedTxId = null;
    swipedOffset = 0;
  }

  // Reset filter spesifik & batas paginasi ketika berganti workspace
  $effect(() => {
    activeWorkspace;
    filterAccountId = "all";
    filterCategoryId = "all";
    filterUnitUsaha = "all";
    visibleLimit = PAGE_SIZE;
    closeSwipe();
  });

  // Reset batas paginasi ketika filter atau pencarian berubah
  $effect(() => {
    searchQuery;
    filterType;
    filterAccountId;
    filterCategoryId;
    filterUnitUsaha;
    filterReimburseStatus;
    filterDateFrom;
    filterDateTo;
    visibleLimit = PAGE_SIZE;
    closeSwipe();
  });

  let effectiveWorkspaces = $derived(
    workspaces && workspaces.length > 0
      ? workspaces
      : [{ id: "personal", name: "Buku Pribadi", type: "personal" }]
  );

  let currentWsType = $derived(
    getWorkspaceType(activeWorkspace, effectiveWorkspaces)
  );

  let isPekerjaan = $derived(
    currentWsType === "pekerjaan" ||
      activeWorkspace === "kopdes" ||
      activeWorkspace === "pekerjaan"
  );

  let isBusiness = $derived(
    currentWsType === "business" || activeWorkspace === "business"
  );

  let currentWsTheme = $derived(
    getWorkspaceTheme(activeWorkspace, effectiveWorkspaces)
  );

  let activeFilterBtnCls = $derived(currentWsTheme.primaryBtn);

  // Daftar akun & kategori yang relevan pada workspace aktif untuk dropdown filter
  let workspaceAccounts = $derived(
    Object.values(accountsMap).filter(
      (a) => a && !a.deleted_at && a.workspace_id === activeWorkspace,
    ),
  );

  let workspaceCategories = $derived(
    Object.values(categoriesMap).filter(
      (c) => c && !c.deleted_at && c.workspace_id === activeWorkspace,
    ),
  );

  // Hitung jumlah talangan pending di daftar saat ini
  let pendingReimburseCount = $derived(
    transactions.filter((tx) => tx.metadata?.reimburse_status === "pending")
      .length,
  );


  let hasActiveFilter = $derived(
    filterType !== "all" ||
      filterAccountId !== "all" ||
      filterCategoryId !== "all" ||
      filterUnitUsaha !== "all" ||
      filterReimburseStatus !== "all" ||
      filterDateFrom !== "" ||
      filterDateTo !== "" ||
      searchQuery.trim() !== "",
  );

  function resetFilters() {
    searchQuery = "";
    filterType = "all";
    filterAccountId = "all";
    filterCategoryId = "all";
    filterUnitUsaha = "all";
    filterReimburseStatus = "all";
    filterDateFrom = "";
    filterDateTo = "";
  }

  function toYMD(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, "0");
    const d = String(dateObj.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  async function handleQuickExportXLSX() {
    const periodLabel =
      filterDateFrom || filterDateTo
        ? `${filterDateFrom || "Awal"} s/d ${filterDateTo || "Sekarang"}`
        : "Semua Periode";
    const { exportTransactionsToXLSX } = await import("../lib/utils/xlsxEngine.js");
    exportTransactionsToXLSX({
      transactions: filteredTransactions,
      accountsMap,
      categoriesMap,
      activeWorkspace,
      periodLabel,
    });
  }

  let filteredTransactions = $derived(
    transactions.filter((tx) => {
      if (filterType !== "all") {
        if (filterType === "debt_receivable") {
          if (tx.type !== "debt" && tx.type !== "receivable") return false;
        } else if (tx.type !== filterType) {
          return false;
        }
      }

      if (filterAccountId !== "all") {
        const matchSource = tx.account_id === filterAccountId;
        const matchDest = tx.to_account_id === filterAccountId;
        const matchReimburse =
          tx.metadata?.reimburse_from_account_id === filterAccountId;
        if (!matchSource && !matchDest && !matchReimburse) return false;
      }

      if (filterCategoryId !== "all" && tx.category_id !== filterCategoryId) {
        return false;
      }

      if (
        isPekerjaan &&
        filterUnitUsaha !== "all" &&
        (tx.metadata?.unit_usaha || "") !== filterUnitUsaha
      ) {
        return false;
      }

      if (filterReimburseStatus !== "all") {
        if ((tx.metadata?.reimburse_status || "none") !== filterReimburseStatus) {
          return false;
        }
      }

      if (filterDateFrom || filterDateTo) {
        const d = tx.date ? new Date(tx.date) : null;
        if (!d || isNaN(d.getTime())) return false;
        const txYMD = toYMD(d);
        if (filterDateFrom && txYMD < filterDateFrom) return false;
        if (filterDateTo && txYMD > filterDateTo) return false;
      }

      if (searchQuery.trim() !== "") {
        const q = searchQuery.toLowerCase();
        const noteMatch = (tx.note || "").toLowerCase().includes(q);
        const catName = (
          categoriesMap[tx.category_id]?.name || ""
        ).toLowerCase();
        const accName = (accountsMap[tx.account_id]?.name || "").toLowerCase();
        const buktiMatch = (tx.metadata?.no_bukti || "")
          .toLowerCase()
          .includes(q);
        const picMatch = (tx.metadata?.pic_pihak || "")
          .toLowerCase()
          .includes(q);
        const unitMatch = (tx.metadata?.unit_usaha || "")
          .toLowerCase()
          .includes(q);
        const items = getTxItems(tx);
        const itemsMatch = items.some((it) =>
          (it.name || "").toLowerCase().includes(q),
        );
        return (
          noteMatch ||
          catName.includes(q) ||
          accName.includes(q) ||
          buktiMatch ||
          picMatch ||
          unitMatch ||
          itemsMatch
        );
      }
      return true;
    }),
  );

  // Rekap Cepat dari Transaksi Terfilter (PRD 2.4)
  let filteredSummary = $derived.by(() => {
    let totalIn = 0;
    let totalOut = 0;
    for (const tx of filteredTransactions) {
      const amt = Number(tx.amount) || 0;
      if (tx.type === "income" || tx.type === "debt") {
        totalIn += amt;
      } else if (tx.type === "expense" || tx.type === "receivable") {
        totalOut += amt;
      }
    }
    return {
      count: filteredTransactions.length,
      totalIn,
      totalOut,
      net: totalIn - totalOut,
    };
  });

  // Paginasi ringan untuk menjaga performa DOM (PRD 6.2.1)
  let paginatedTransactions = $derived(
    filteredTransactions.slice(0, visibleLimit),
  );
  let remainingCount = $derived(
    Math.max(0, filteredTransactions.length - visibleLimit),
  );

  // Pengelompokan transaksi harian khusus Mobile Card View (PRD 2.4)
  let groupedMobileTransactions = $derived.by(() => {
    const groups = [];
    const map = new Map();

    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const yest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const yesterdayKey = `${yest.getFullYear()}-${String(yest.getMonth() + 1).padStart(2, "0")}-${String(yest.getDate()).padStart(2, "0")}`;

    for (const tx of paginatedTransactions) {
      const d = tx.date ? new Date(tx.date) : null;
      const isValid = d && !isNaN(d.getTime());
      const dateKey = isValid
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
        : "unknown";

      let group = map.get(dateKey);
      if (!group) {
        let label = "Tanggal Tidak Diketahui";
        if (isValid) {
          const formattedDate = new Intl.DateTimeFormat("id-ID", {
            weekday: "short",
            day: "2-digit",
            month: "short",
            year: "numeric",
          }).format(d);
          if (dateKey === todayKey) label = `Hari Ini — ${formattedDate}`;
          else if (dateKey === yesterdayKey)
            label = `Kemarin — ${formattedDate}`;
          else label = formattedDate;
        }
        group = {
          dateKey,
          label,
          items: [],
          dayIn: 0,
          dayOut: 0,
        };
        map.set(dateKey, group);
        groups.push(group);
      }

      group.items.push(tx);
      const amt = Number(tx.amount) || 0;
      if (tx.type === "income" || tx.type === "debt") group.dayIn += amt;
      else if (tx.type === "expense" || tx.type === "receivable")
        group.dayOut += amt;
    }

    return groups;
  });


</script>

<section class="max-w-7xl mx-auto px-3.5 sm:px-6 py-4 pb-24 md:pb-12">
  <!-- Baris 1: Filter Tipe & Pencarian Cepat -->
  <div
    class="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 mb-2.5"
  >
    <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
      {#each [
        { id: "all", label: "Semua" },
        { id: "expense", label: "Pengeluaran" },
        { id: "income", label: "Pemasukan" },
        { id: "transfer", label: "Transfer" },
        { id: "debt_receivable", label: "Piutang/Utang" },
      ] as f}
        <button
          type="button"
          onclick={() => (filterType = f.id)}
          class="px-3 py-1.5 text-xs font-bold rounded-xl border shrink-0 transition-all cursor-pointer {filterType ===
          f.id
            ? activeFilterBtnCls
            : 'bg-white text-slate-600 border-slate-200/90 hover:bg-slate-100 hover:text-slate-900'}"
        >
          {f.label}
        </button>
      {/each}

      <button
        type="button"
        onclick={() =>
          (filterReimburseStatus =
            filterReimburseStatus === "pending" ? "all" : "pending")}
        class="px-3 py-1.5 text-xs font-bold rounded-xl border shrink-0 transition-all cursor-pointer inline-flex items-center gap-1.5 {filterReimburseStatus ===
        'pending'
          ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
          : 'bg-amber-50/70 text-amber-800 border-amber-200 hover:bg-amber-100/80'}"
      >
        <span>Talangan Pending</span>
        {#if pendingReimburseCount > 0}
          <span
            class="px-1.5 py-0.2 rounded-md text-[10px] font-extrabold tabular-nums {filterReimburseStatus ===
            'pending'
              ? 'bg-amber-800 text-white'
              : 'bg-amber-200/80 text-amber-950'}"
          >
            {pendingReimburseCount}
          </span>
        {/if}
      </button>

      <button
        type="button"
        onclick={() => (isAdvancedFilterOpen = !isAdvancedFilterOpen)}
        class="px-3 py-1.5 text-xs font-bold rounded-xl border shrink-0 transition-all cursor-pointer inline-flex items-center gap-1.5 {isAdvancedFilterOpen ||
        filterCategoryId !== 'all' ||
        filterDateFrom !== '' ||
        filterDateTo !== '' ||
        filterReimburseStatus === 'settled'
          ? 'bg-slate-800 text-white border-slate-800'
          : 'bg-white text-slate-600 border-slate-200/90 hover:bg-slate-100'}"
      >
        <svg
          class="w-3.5 h-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
        <span>Filter Lanjutan</span>
      </button>
    </div>

    <!-- Filter Multi-Kolom (Dompet, Unit Kopdes) & Input Search -->
    <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
      <div class="flex items-center gap-2">
        <!-- Filter Dompet -->
        <select
          bind:value={filterAccountId}
          aria-label="Filter Dompet atau Akun"
          class="flex-1 sm:flex-initial px-2.5 py-1.5 text-xs font-semibold bg-white text-slate-700 border border-slate-200/90 rounded-xl shadow-2xs focus:outline-none focus:border-slate-500 cursor-pointer"
        >
          <option value="all">Semua Dompet</option>
          {#each workspaceAccounts as acc (acc.id)}
            <option value={acc.id}>{acc.name}</option>
          {/each}
        </select>

        <!-- Filter Unit Usaha Khusus Buku Pekerjaan -->
        {#if isPekerjaan}
          <select
            bind:value={filterUnitUsaha}
            aria-label="Filter Unit Usaha atau Kerja"
            class="flex-1 sm:flex-initial px-2.5 py-1.5 text-xs font-semibold bg-white text-slate-700 border border-slate-200/90 rounded-xl shadow-2xs focus:outline-none focus:border-slate-500 cursor-pointer"
          >
            <option value="all">Semua Unit</option>
            {#each KOPDES_UNITS as unit}
              <option value={unit}>{unit}</option>
            {/each}
          </select>
        {/if}
      </div>

      <!-- Input Pencarian -->
      <div class="relative w-full sm:w-64">
        <svg
          class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="11" cy="11" r="8" /><path
            d="m21 21-4.3-4.3"
            stroke-linecap="round"
          />
        </svg>
        <input
          type="text"
          placeholder="Cari catatan, kategori, no bukti..."
          bind:value={searchQuery}
          class="w-full pl-9 pr-8 py-1.5 text-xs font-medium bg-white border border-slate-200/90 rounded-xl shadow-2xs focus:outline-none focus:border-slate-500 transition-colors"
        />
        {#if searchQuery.trim() !== ""}
          <button
            type="button"
            onclick={() => (searchQuery = "")}
            aria-label="Hapus pencarian"
            class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
          >
            <svg
              class="w-3.5 h-3.5"
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
        {/if}
      </div>
    </div>
  </div>

  <!-- Panel Filter Lanjutan (Rentang Tanggal, Kategori, Status Reimburse) -->
  <TransactionFilterDrawer
    isOpen={isAdvancedFilterOpen}
    categories={workspaceCategories}
    {filterCategoryId}
    {filterReimburseStatus}
    {filterDateFrom}
    {filterDateTo}
    onCategoryChange={(val) => (filterCategoryId = val)}
    onReimburseStatusChange={(val) => (filterReimburseStatus = val)}
    onDateFromChange={(val) => (filterDateFrom = val)}
    onDateToChange={(val) => (filterDateTo = val)}
  />

  <!-- Baris 2: Bar Rekap Cepat & Aksi Export (Muncul saat ada transaksi) -->
  {#if filteredTransactions.length > 0}
    <div
      class="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 mb-3 bg-white border border-slate-200/80 rounded-xl text-[11px] shadow-2xs"
    >
      <div class="flex items-center gap-2 text-slate-600 font-semibold">
        <span class="tabular-nums font-extrabold text-slate-900"
          >{filteredSummary.count}</span
        >
        <span>Transaksi{hasActiveFilter ? " (Terfilter)" : ""}</span>
        {#if hasActiveFilter}
          <button
            type="button"
            onclick={resetFilters}
            class="ml-1 text-rose-600 hover:text-rose-800 font-bold underline cursor-pointer"
          >
            Reset Filter
          </button>
        {/if}
      </div>

      <div class="flex items-center flex-wrap gap-3 tabular-nums font-bold">
        <span class="text-emerald-700">
          Masuk: +{formatIDR(filteredSummary.totalIn)}
        </span>
        <span class="text-slate-300">|</span>
        <span class="text-rose-700">
          Keluar: -{formatIDR(filteredSummary.totalOut)}
        </span>
        <span class="hidden sm:inline text-slate-300">|</span>
        <span
          class="hidden sm:inline {filteredSummary.net >= 0
            ? 'text-slate-900'
            : 'text-rose-700'}"
        >
          Selisih: {filteredSummary.net >= 0 ? "+" : ""}{formatIDR(
            filteredSummary.net,
          )}
        </span>

        <div class="flex items-center gap-1.5 ml-1">
          {#if onOpenReportModal}
            <button
              type="button"
              onclick={onOpenReportModal}
              class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-[10px] font-extrabold uppercase tracking-wider cursor-pointer transition-colors"
            >
              Rekap Laporan
            </button>
          {/if}
          <button
            type="button"
            onclick={handleQuickExportXLSX}
            class="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-[10px] font-extrabold uppercase tracking-wider cursor-pointer transition-colors"
          >
            Export .XLSX
          </button>
        </div>
      </div>
    </div>
  {/if}

  {#if filteredTransactions.length === 0}
    <!-- Empty State Adaptif -->
    <div
      class="bg-white border border-slate-200/80 rounded-2xl p-10 text-center shadow-2xs"
    >
      <div
        class="w-10 h-10 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center mb-2.5"
      >
        <svg
          class="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
        >
          <path
            d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"
            stroke-linecap="round"
          />
          <rect width="6" height="4" x="9" y="3" rx="1" />
          <path d="M9 12h6M9 16h4" stroke-linecap="round" />
        </svg>
      </div>
      {#if hasActiveFilter && transactions.length > 0}
        <p class="text-xs font-bold text-slate-700">
          Tidak ada transaksi yang cocok dengan filter
        </p>
        <p class="text-[11px] text-slate-400 mt-0.5 mb-3">
          Coba ubah kata kunci pencarian atau tampilkan semua tipe transaksi.
        </p>
        <button
          type="button"
          onclick={resetFilters}
          class="px-3.5 py-1.5 text-xs font-bold bg-slate-900 text-white rounded-xl hover:bg-slate-800 cursor-pointer transition-colors"
        >
          Reset Semua Filter
        </button>
      {:else}
        <p class="text-xs font-bold text-slate-700">
          Belum ada transaksi tercatat
        </p>
        <p class="text-[11px] text-slate-400 mt-0.5">
          Klik tombol "+ Catat Transaksi" untuk mulai menambahkan data.
        </p>
      {/if}
    </div>
  {:else}
    <!-- 1. MOBILE CARD VIEW DENGAN PENGELOMPOKAN HARIAN & SWIPE ACTION (< 768px) -->
    <div class="md:hidden space-y-4">
      {#each groupedMobileTransactions as group (group.dateKey)}
        <div class="space-y-2">
          <!-- Header Tanggal Harian -->
          <div
            class="flex items-center justify-between px-1 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider"
          >
            <span>{group.label}</span>
            <div class="flex items-center gap-2 tabular-nums">
              {#if group.dayIn > 0}
                <span class="text-emerald-700">+{formatIDR(group.dayIn)}</span>
              {/if}
              {#if group.dayOut > 0}
                <span class="text-rose-700">-{formatIDR(group.dayOut)}</span>
              {/if}
            </div>
          </div>

          {#each group.items as tx (tx.id)}
            <TransactionMobileCard
              {tx}
              {accountsMap}
              {categoriesMap}
              {activeWorkspace}
              {swipedTxId}
              {swipedOffset}
              onSwipeOpen={openSwipe}
              onSwipeClose={closeSwipe}
              {onPreviewReceipt}
              {onEdit}
              {onDelete}
              {onSettleReimburse}
            />
          {/each}
        </div>
      {/each}
    </div>

    <!-- 2. DESKTOP SPREADSHEET TABLE VIEW (>= 768px) -->
    <TransactionDesktopTable
      transactions={paginatedTransactions}
      {accountsMap}
      {categoriesMap}
      {activeWorkspace}
      {isPekerjaan}
      {isBusiness}
      {filteredSummary}
      {onPreviewReceipt}
      {onEdit}
      {onDelete}
      {onSettleReimburse}
    />

    <!-- Tombol Load More Pagination (PRD 6.2.1 Optimasi Memori) -->
    {#if remainingCount > 0}
      <div class="mt-4 text-center">
        <button
          type="button"
          onclick={() => (visibleLimit += PAGE_SIZE)}
          class="px-4 py-2 bg-white hover:bg-slate-100 text-slate-800 border border-slate-200/90 rounded-xl text-xs font-extrabold shadow-2xs cursor-pointer transition-colors tabular-nums"
        >
          Tampilkan Lebih Banyak ({remainingCount} transaksi lagi)
        </button>
      </div>
    {/if}
  {/if}
</section>
