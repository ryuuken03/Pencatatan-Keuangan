<script>
  import { formatIDR, formatDateShort } from "../lib/utils.js";
  import { KOPDES_UNITS } from "../lib/db.js";
  import { exportTransactionsToXLSX } from "../lib/utils/xlsxEngine.js";

  let {
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
  const SWIPE_OPEN_WIDTH = 132; // Lebar panel tombol Edit + Hapus (px)

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
  let activeDragTxId = $state(null);
  let dragStartX = 0;
  let dragStartY = 0;
  let dragBaseOffset = 0;
  let dragCurrentOffset = $state(0);
  let isHorizontalSwipe = $state(false);
  let didSwipeMove = false;

  function closeSwipe() {
    swipedTxId = null;
    swipedOffset = 0;
    activeDragTxId = null;
    dragCurrentOffset = 0;
    isHorizontalSwipe = false;
  }

  function handleTouchStart(e, txId) {
    const touch = e.touches?.[0];
    if (!touch) return;

    if (swipedTxId && swipedTxId !== txId) {
      swipedTxId = null;
      swipedOffset = 0;
    }

    activeDragTxId = txId;
    dragStartX = touch.clientX;
    dragStartY = touch.clientY;
    dragBaseOffset = swipedTxId === txId ? swipedOffset : 0;
    dragCurrentOffset = dragBaseOffset;
    isHorizontalSwipe = false;
    didSwipeMove = false;
  }

  function handleTouchMove(e, txId) {
    if (activeDragTxId !== txId) return;
    const touch = e.touches?.[0];
    if (!touch) return;

    const dx = touch.clientX - dragStartX;
    const dy = touch.clientY - dragStartY;

    if (!isHorizontalSwipe) {
      // Jika gerakan vertikal lebih dominan, biarkan halaman scroll normal
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) {
        activeDragTxId = null;
        return;
      }
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        isHorizontalSwipe = true;
        didSwipeMove = true;
      }
    }

    if (isHorizontalSwipe) {
      if (e.cancelable) e.preventDefault();
      const next = Math.max(
        -SWIPE_OPEN_WIDTH - 16,
        Math.min(SWIPE_OPEN_WIDTH + 16, dragBaseOffset + dx),
      );
      dragCurrentOffset = next;
    }
  }

  function handleTouchEnd(txId) {
    if (activeDragTxId !== txId) return;

    if (isHorizontalSwipe) {
      if (dragCurrentOffset > 45) {
        // Slide Kanan terbuka
        swipedTxId = txId;
        swipedOffset = SWIPE_OPEN_WIDTH;
      } else if (dragCurrentOffset < -45) {
        // Slide Kiri terbuka
        swipedTxId = txId;
        swipedOffset = -SWIPE_OPEN_WIDTH;
      } else {
        swipedTxId = null;
        swipedOffset = 0;
      }
    }

    activeDragTxId = null;
    dragCurrentOffset = 0;
    isHorizontalSwipe = false;
  }

  function getCardOffset(txId) {
    if (activeDragTxId === txId && isHorizontalSwipe) {
      return dragCurrentOffset;
    }
    if (swipedTxId === txId) {
      return swipedOffset;
    }
    return 0;
  }

  function handleCardClick(tx) {
    if (didSwipeMove) {
      didSwipeMove = false;
      return;
    }
    if (swipedTxId === tx.id) {
      closeSwipe();
      return;
    }
    if (swipedTxId) {
      closeSwipe();
    }
    onPreviewReceipt?.(tx);
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

  let activeFilterBtnCls = $derived(
    activeWorkspace === "business"
      ? "bg-teal-900 text-white border-teal-900 shadow-2xs"
      : activeWorkspace === "kopdes"
        ? "bg-emerald-900 text-white border-emerald-900 shadow-2xs"
        : "bg-indigo-950 text-white border-indigo-950 shadow-2xs",
  );

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

  function getTxItems(tx) {
    if (Array.isArray(tx?.items) && tx.items.length > 0) return tx.items;
    if (Array.isArray(tx?.metadata?.items) && tx.metadata.items.length > 0)
      return tx.metadata.items;
    return [];
  }

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

  function handleQuickExportXLSX() {
    const periodLabel =
      filterDateFrom || filterDateTo
        ? `${filterDateFrom || "Awal"} s/d ${filterDateTo || "Sekarang"}`
        : "Semua Periode";
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
        activeWorkspace === "kopdes" &&
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

  function formatTimeOnly(isoString) {
    if (!isoString) return "-";
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return formatDateShort(isoString);
    return new Intl.DateTimeFormat("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  }

  function getTypeBadge(type) {
    switch (type) {
      case "income":
        return {
          label: "MASUK",
          cls: "bg-emerald-100/80 text-emerald-800 border-emerald-200",
        };
      case "expense":
        return {
          label: "KELUAR",
          cls: "bg-rose-100/80 text-rose-800 border-rose-200",
        };
      case "transfer":
        return {
          label: "TRANSFER",
          cls: "bg-sky-100/80 text-sky-800 border-sky-200",
        };
      case "receivable":
        return {
          label: "PIUTANG",
          cls: "bg-amber-100/80 text-amber-800 border-amber-200",
        };
      case "debt":
        return {
          label: "UTANG",
          cls: "bg-purple-100/80 text-purple-800 border-purple-200",
        };
      default:
        return {
          label: type,
          cls: "bg-slate-100 text-slate-700 border-slate-200",
        };
    }
  }

  function getAmountColor(type) {
    if (type === "income" || type === "debt") return "text-emerald-700";
    if (type === "expense" || type === "receivable") return "text-rose-700";
    return "text-sky-700";
  }

  function getAmountPrefix(type) {
    if (type === "income" || type === "debt") return "+";
    if (type === "expense" || type === "receivable") return "-";
    return "⇄ ";
  }
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

        <!-- Filter Unit Usaha Khusus Buku Kopdes -->
        {#if activeWorkspace === "kopdes"}
          <select
            bind:value={filterUnitUsaha}
            aria-label="Filter Unit Usaha Kopdes"
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
  {#if isAdvancedFilterOpen}
    <div
      class="p-3 mb-2.5 bg-white border border-slate-200/90 rounded-xl shadow-2xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs"
    >
      <div>
        <label
          for="filter-category"
          class="block text-[10px] font-extrabold uppercase text-slate-500 mb-1"
          >Kategori</label
        >
        <select
          id="filter-category"
          bind:value={filterCategoryId}
          class="w-full px-2.5 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-500 cursor-pointer"
        >
          <option value="all">Semua Kategori</option>
          {#each workspaceCategories as cat (cat.id)}
            <option value={cat.id}
              >{cat.name} ({cat.type === "income" ? "Masuk" : "Keluar"})</option
            >
          {/each}
        </select>
      </div>

      <div>
        <label
          for="filter-reimburse-status"
          class="block text-[10px] font-extrabold uppercase text-slate-500 mb-1"
          >Status Dana Talangan</label
        >
        <select
          id="filter-reimburse-status"
          bind:value={filterReimburseStatus}
          class="w-full px-2.5 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-500 cursor-pointer"
        >
          <option value="all">Semua Transaksi</option>
          <option value="pending">Belum Diganti (Pending)</option>
          <option value="settled">Sudah Diganti (Selesai)</option>
        </select>
      </div>

      <div>
        <label
          for="filter-date-from"
          class="block text-[10px] font-extrabold uppercase text-slate-500 mb-1"
          >Dari Tanggal</label
        >
        <input
          id="filter-date-from"
          type="date"
          bind:value={filterDateFrom}
          class="w-full px-2.5 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg tabular-nums focus:outline-none focus:border-slate-500"
        />
      </div>

      <div>
        <label
          for="filter-date-to"
          class="block text-[10px] font-extrabold uppercase text-slate-500 mb-1"
          >Sampai Tanggal</label
        >
        <input
          id="filter-date-to"
          type="date"
          bind:value={filterDateTo}
          class="w-full px-2.5 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg tabular-nums focus:outline-none focus:border-slate-500"
        />
      </div>
    </div>
  {/if}

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
            {@const badge = getTypeBadge(tx.type)}
            {@const accName = accountsMap[tx.account_id]?.name || "-"}
            {@const toAccName = tx.to_account_id
              ? accountsMap[tx.to_account_id]?.name
              : null}
            {@const catName =
              tx.type === "transfer"
                ? `Transfer ke ${toAccName || "-"}`
                : categoriesMap[tx.category_id]?.name || "Tanpa Kategori"}
            {@const reimburseFromName = tx.metadata?.reimburse_from_account_id
              ? accountsMap[tx.metadata.reimburse_from_account_id]?.name
              : "Dompet Pribadi"}
            {@const itemsList = getTxItems(tx)}
            {@const offset = getCardOffset(tx.id)}

            <!-- Container Swipeable Card -->
            <div class="relative overflow-hidden rounded-2xl select-none">
              <!-- Layer Belakang: Tombol Edit & Hapus saat Slide Kanan (muncul di sisi kiri) -->
              <div
                class="absolute inset-y-0 left-0 flex items-stretch w-[132px] bg-slate-100 rounded-l-2xl overflow-hidden"
              >
                <button
                  type="button"
                  onclick={(e) => {
                    e.stopPropagation();
                    closeSwipe();
                    onEdit?.(tx);
                  }}
                  class="flex-1 flex flex-col items-center justify-center gap-1 bg-slate-800 hover:bg-slate-900 text-white text-[10px] font-extrabold cursor-pointer transition-colors"
                >
                  <svg
                    class="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path
                      d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                  <span>Edit</span>
                </button>
                <button
                  type="button"
                  onclick={(e) => {
                    e.stopPropagation();
                    closeSwipe();
                    onDelete?.(tx.id);
                  }}
                  class="flex-1 flex flex-col items-center justify-center gap-1 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-extrabold cursor-pointer transition-colors"
                >
                  <svg
                    class="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path
                      d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                  <span>Hapus</span>
                </button>
              </div>

              <!-- Layer Belakang: Tombol Edit & Hapus saat Slide Kiri (muncul di sisi kanan) -->
              <div
                class="absolute inset-y-0 right-0 flex items-stretch w-[132px] bg-slate-100 rounded-r-2xl overflow-hidden"
              >
                <button
                  type="button"
                  onclick={(e) => {
                    e.stopPropagation();
                    closeSwipe();
                    onEdit?.(tx);
                  }}
                  class="flex-1 flex flex-col items-center justify-center gap-1 bg-slate-800 hover:bg-slate-900 text-white text-[10px] font-extrabold cursor-pointer transition-colors"
                >
                  <svg
                    class="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path
                      d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                  <span>Edit</span>
                </button>
                <button
                  type="button"
                  onclick={(e) => {
                    e.stopPropagation();
                    closeSwipe();
                    onDelete?.(tx.id);
                  }}
                  class="flex-1 flex flex-col items-center justify-center gap-1 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-extrabold cursor-pointer transition-colors"
                >
                  <svg
                    class="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path
                      d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                  <span>Hapus</span>
                </button>
              </div>

              <!-- Layer Depan: Kartu Transaksi (Klik untuk Buka Modal Detail, Geser untuk Aksi) -->
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                ontouchstart={(e) => handleTouchStart(e, tx.id)}
                ontouchmove={(e) => handleTouchMove(e, tx.id)}
                ontouchend={() => handleTouchEnd(tx.id)}
                ontouchcancel={() => handleTouchEnd(tx.id)}
                onclick={() => handleCardClick(tx)}
                style="transform: translateX({offset}px);"
                class="relative z-10 bg-white active:bg-slate-50 border border-slate-200/90 rounded-2xl p-3.5 shadow-2xs cursor-pointer {activeDragTxId ===
                tx.id
                  ? ''
                  : 'transition-transform duration-200 ease-out'}"
              >
                <div class="flex items-start justify-between gap-2.5">
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1.5 flex-wrap">
                      <span
                        class="px-2 py-0.5 text-[10px] font-extrabold border rounded-md {badge.cls}"
                      >
                        {badge.label}
                      </span>
                      <span
                        class="text-xs font-extrabold text-slate-900 truncate"
                        >{catName}</span
                      >
                      {#if tx.workspace_id !== activeWorkspace}
                        <span
                          class="px-1.5 py-0.5 text-[10px] font-bold bg-slate-800 text-white rounded-md uppercase"
                        >
                          Talangan {tx.workspace_id}
                        </span>
                      {/if}
                    </div>

                    {#if tx.note}
                      <p
                        class="text-xs font-medium text-slate-700 mt-1 break-words"
                      >
                        {tx.note}
                      </p>
                    {/if}

                    <!-- Metadata Kopdes / Usaha -->
                    {#if tx.metadata?.unit_usaha || tx.metadata?.no_bukti || tx.metadata?.pic_pihak}
                      <div
                        class="flex flex-wrap items-center gap-1.5 mt-1.5 text-[11px] text-slate-500"
                      >
                        {#if tx.metadata.unit_usaha}
                          <span
                            class="px-1.5 py-0.5 bg-slate-100 font-semibold text-slate-700 rounded"
                            >{tx.metadata.unit_usaha}</span
                          >
                        {/if}
                        {#if tx.metadata.no_bukti}
                          <span class="tabular-nums font-semibold text-slate-600"
                            >#{tx.metadata.no_bukti}</span
                          >
                        {/if}
                        {#if tx.metadata.pic_pihak}
                          <span>• PIC: {tx.metadata.pic_pihak}</span>
                        {/if}
                      </div>
                    {/if}

                    <!-- Info Jam, Dompet & Indikator Lampiran -->
                    <div
                      class="flex items-center flex-wrap gap-1.5 mt-2 text-[11px] text-slate-400 font-medium tabular-nums"
                    >
                      <span>{formatTimeOnly(tx.date)}</span>
                      <span>•</span>
                      <span class="text-slate-600 font-semibold">{accName}</span>

                      {#if itemsList.length > 0}
                        <span
                          class="ml-0.5 inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-800 border border-indigo-200 rounded-md text-[10px] font-extrabold tabular-nums"
                        >
                          <svg
                            class="w-3 h-3 text-indigo-700 shrink-0"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2.2"
                          >
                            <path
                              d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                            />
                          </svg>
                          <span>{itemsList.length} Produk</span>
                        </span>
                      {/if}

                      {#if tx.attachment_blob}
                        <span
                          class="ml-0.5 inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-800 border border-slate-300 rounded-md text-[10px] font-extrabold tabular-nums"
                        >
                          <svg
                            class="w-3 h-3 text-emerald-700 shrink-0"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2.2"
                          >
                            <path
                              d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                            />
                            <polyline
                              points="14 2 14 8 20 8"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                            />
                          </svg>
                          <span
                            >Struk ({Math.max(
                              1,
                              Math.round((tx.attachment_blob.size || 0) / 1024),
                            )} KB)</span
                          >
                        </span>
                      {/if}
                    </div>
                  </div>

                  <!-- Nominal & Indikator Detail -->
                  <div class="text-right shrink-0 flex flex-col items-end">
                    <div
                      class="text-sm font-extrabold tabular-nums {getAmountColor(
                        tx.type,
                      )}"
                    >
                      {getAmountPrefix(tx.type)}{formatIDR(tx.amount)}
                    </div>
                    <span
                      class="mt-2 inline-flex items-center gap-0.5 text-[10px] font-semibold text-slate-400"
                    >
                      <span>Detail</span>
                      <svg
                        class="w-3 h-3"
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
                    </span>
                  </div>
                </div>

                <!-- Banner Status Dana Talangan / Reimburse -->
                {#if tx.metadata?.reimburse_status === "pending"}
                  <div
                    class="mt-2.5 pt-2 border-t border-amber-200/80 flex items-center justify-between gap-2 bg-amber-50 px-3 py-2 rounded-xl"
                  >
                    <span class="text-[11px] font-medium text-amber-900">
                      Belum Diganti • Ditalangi: <strong class="font-bold"
                        >{reimburseFromName}</strong
                      >
                    </span>
                    <button
                      type="button"
                      onclick={(e) => {
                        e.stopPropagation();
                        onSettleReimburse(tx.id);
                      }}
                      class="px-2.5 py-1 bg-amber-700 text-white text-[11px] font-bold rounded-lg hover:bg-amber-800 shrink-0 cursor-pointer shadow-2xs"
                    >
                      Tandai Diganti
                    </button>
                  </div>
                {:else if tx.metadata?.reimburse_status === "settled"}
                  <div
                    class="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-emerald-700 font-bold"
                  >
                    <span
                      >✓ Reimburse Selesai (Diganti ke {reimburseFromName})</span
                    >
                  </div>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/each}
    </div>

    <!-- 2. DESKTOP SPREADSHEET TABLE VIEW (>= 768px) -->
    <div
      class="hidden md:block bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-x-auto"
    >
      <table class="w-full text-left border-collapse text-xs">
        <thead>
          <tr
            class="bg-slate-50/90 border-b border-slate-200/90 text-[11px] font-extrabold uppercase text-slate-500 tracking-wider"
          >
            <th class="py-3 px-4">Tanggal</th>
            <th class="py-3 px-4">Tipe</th>
            <th class="py-3 px-4">Dompet / Akun</th>
            <th class="py-3 px-4">Kategori</th>
            {#if activeWorkspace === "kopdes"}
              <th class="py-3 px-4">Unit Usaha</th>
              <th class="py-3 px-4">No. Bukti & PIC</th>
            {:else if activeWorkspace === "business"}
              <th class="py-3 px-4">No. Nota & Pihak</th>
            {/if}
            <th class="py-3 px-4">Catatan & Status Reimburse</th>
            <th class="py-3 px-4 text-right">Nominal (Rp)</th>
            <th class="py-3 px-4 text-right">Aksi</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200/70">
          {#each paginatedTransactions as tx (tx.id)}
            {@const badge = getTypeBadge(tx.type)}
            {@const accName = accountsMap[tx.account_id]?.name || "-"}
            {@const toAccName = tx.to_account_id
              ? accountsMap[tx.to_account_id]?.name
              : null}
            {@const catName =
              tx.type === "transfer"
                ? `Ke: ${toAccName || "-"}`
                : categoriesMap[tx.category_id]?.name || "-"}
            {@const reimburseFromName = tx.metadata?.reimburse_from_account_id
              ? accountsMap[tx.metadata.reimburse_from_account_id]?.name
              : "Dompet Pribadi"}
            {@const itemsList = getTxItems(tx)}

            <tr
              onclick={() => onPreviewReceipt?.(tx)}
              class="hover:bg-slate-50/80 transition-colors cursor-pointer"
            >
              <td
                class="py-3 px-4 whitespace-nowrap tabular-nums text-slate-500 font-medium"
              >
                {formatDateShort(tx.date)}
              </td>
              <td class="py-3 px-4 whitespace-nowrap">
                <span
                  class="px-2 py-0.5 text-[10px] font-extrabold border rounded-md {badge.cls}"
                >
                  {badge.label}
                </span>
              </td>
              <td
                class="py-3 px-4 whitespace-nowrap font-semibold text-slate-800"
              >
                {accName}
                {#if tx.workspace_id !== activeWorkspace}
                  <span
                    class="ml-1 px-1.5 py-0.5 text-[10px] font-bold bg-slate-800 text-white rounded uppercase"
                  >
                    Buku {tx.workspace_id}
                  </span>
                {/if}
              </td>
              <td class="py-3 px-4 font-bold text-slate-900">
                {catName}
              </td>

              {#if activeWorkspace === "kopdes"}
                <td class="py-3 px-4 text-slate-700 font-medium">
                  {tx.metadata?.unit_usaha || "-"}
                </td>
                <td class="py-3 px-4 text-slate-600 tabular-nums">
                  {#if tx.metadata?.no_bukti}
                    <span class="font-bold text-slate-800"
                      >{tx.metadata.no_bukti}</span
                    >
                  {/if}
                  {#if tx.metadata?.pic_pihak}
                    <div class="text-[11px] text-slate-500">
                      PIC: {tx.metadata.pic_pihak}
                    </div>
                  {/if}
                  {#if !tx.metadata?.no_bukti && !tx.metadata?.pic_pihak}-{/if}
                </td>
              {:else if activeWorkspace === "business"}
                <td class="py-3 px-4 text-slate-600 tabular-nums">
                  {#if tx.metadata?.no_bukti}
                    <span class="font-bold text-slate-800"
                      >{tx.metadata.no_bukti}</span
                    >
                  {/if}
                  {#if tx.metadata?.pic_pihak}
                    <div class="text-[11px] text-slate-500">
                      {tx.metadata.pic_pihak}
                    </div>
                  {/if}
                  {#if !tx.metadata?.no_bukti && !tx.metadata?.pic_pihak}-{/if}
                </td>
              {/if}

              <td class="py-3 px-4 text-slate-700 max-w-xs">
                <div class="flex items-center flex-wrap gap-1.5">
                  <span class="font-medium">{tx.note || "-"}</span>
                  {#if itemsList.length > 0}
                    <span
                      class="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-800 border border-indigo-200 rounded-md text-[10px] font-extrabold tabular-nums"
                    >
                      <svg
                        class="w-3 h-3 text-indigo-700 shrink-0"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.2"
                      >
                        <path
                          d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                      </svg>
                      <span>{itemsList.length} Produk</span>
                    </span>
                  {/if}
                  {#if tx.attachment_blob}
                    <span
                      class="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-800 border border-slate-300 rounded-md text-[10px] font-extrabold tabular-nums"
                    >
                      <svg
                        class="w-3 h-3 text-emerald-700 shrink-0"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.2"
                      >
                        <path
                          d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                        <polyline
                          points="14 2 14 8 20 8"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                      </svg>
                      <span
                        >Struk ({Math.max(
                          1,
                          Math.round((tx.attachment_blob.size || 0) / 1024),
                        )} KB)</span
                      >
                    </span>
                  {/if}
                </div>
                {#if tx.metadata?.reimburse_status === "pending"}
                  <div
                    class="mt-1.5 inline-flex items-center gap-2 px-2.5 py-1 bg-amber-50 border border-amber-300 text-amber-900 rounded-lg text-[11px] font-semibold"
                  >
                    <span>Pending Talangan ({reimburseFromName})</span>
                    <button
                      type="button"
                      onclick={(e) => {
                        e.stopPropagation();
                        onSettleReimburse(tx.id);
                      }}
                      class="px-2 py-0.5 bg-amber-700 text-white rounded-md text-[10px] font-bold hover:bg-amber-800 cursor-pointer"
                    >
                      Tandai Sudah Diganti
                    </button>
                  </div>
                {:else if tx.metadata?.reimburse_status === "settled"}
                  <div class="mt-1 text-[11px] text-emerald-700 font-bold">
                    ✓ Sudah Diganti ke {reimburseFromName}
                  </div>
                {/if}
              </td>

              <td
                class="py-3 px-4 whitespace-nowrap text-right font-extrabold tabular-nums text-sm {getAmountColor(
                  tx.type,
                )}"
              >
                {getAmountPrefix(tx.type)}{formatIDR(tx.amount)}
              </td>

              <td
                onclick={(e) => e.stopPropagation()}
                class="py-3 px-4 whitespace-nowrap text-right"
              >
                <div class="inline-flex items-center gap-3">
                  <button
                    type="button"
                    onclick={() => onEdit(tx)}
                    class="text-slate-600 hover:text-slate-900 font-bold cursor-pointer"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onclick={() => onDelete(tx.id)}
                    class="text-rose-600 hover:text-rose-800 font-bold cursor-pointer"
                  >
                    Hapus
                  </button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
        <tfoot
          class="bg-slate-50/90 border-t border-slate-200/90 text-xs font-extrabold"
        >
          <tr>
            <td
              colspan={activeWorkspace === "kopdes"
                ? 7
                : activeWorkspace === "business"
                  ? 6
                  : 5}
              class="py-3 px-4 text-slate-600"
            >
              Total Selisih ({filteredSummary.count} Transaksi)
            </td>
            <td
              class="py-3 px-4 text-right tabular-nums text-sm {filteredSummary.net >=
              0
                ? 'text-emerald-700'
                : 'text-rose-700'}"
            >
              {filteredSummary.net >= 0 ? "+" : ""}{formatIDR(
                filteredSummary.net,
              )}
            </td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>

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
