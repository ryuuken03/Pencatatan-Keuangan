<script>
  import {
    formatIDR,
    formatDateShort,
    getWorkspaceName,
    getWorkspaceTheme,
    getWorkspaceType
  } from "../lib/utils.js";
  import { KOPDES_UNITS, importTransactionsFromXlsxRows } from "../lib/db.js";
  import {
    exportTransactionsToXLSX,
    exportFullReportToXLSX,
    downloadImportTemplateXLSX,
    parseTransactionsFromXlsxBuffer,
  } from "../lib/utils/xlsxEngine.js";
  import { registerModalHistory } from "../lib/utils/modalHistory.js";

  let {
    isOpen = false,
    workspaces = [],
    activeWorkspace = "personal",
    transactions = [],
    allTransactions = [],
    accountsMap = {},
    categoriesMap = {},
    onSettleReimburse,
    onPreviewReceipt,
    onDataImported,
    onClose,
  } = $props();

  $effect(() => {
    if (isOpen) {
      return registerModalHistory("report-export", () => {
        onClose?.();
      });
    }
  });

  let activeTab = $state("category"); // 'category' | 'unit' | 'reimburse' | 'import_xlsx'
  let periodPreset = $state("this_month"); // 'all' | 'today' | 'this_week' | 'this_month' | 'last_month' | 'this_year' | 'custom'
  let customDateFrom = $state("");
  let customDateTo = $state("");
  let selectedUnit = $state("all");
  let reimburseFilter = $state("all"); // 'all' | 'pending' | 'settled'
  let exportFeedback = $state("");
  let errorFeedback = $state("");

  // State Import XLSX
  let importFileName = $state("");
  let importSheetName = $state("");
  let parsedImportRows = $state([]);
  let isParsingXlsx = $state(false);
  let isImportingXlsx = $state(false);

  $effect(() => {
    if (isOpen) {
      exportFeedback = "";
      errorFeedback = "";
      selectedUnit = "all";
    }
  });

  function toYMD(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, "0");
    const d = String(dateObj.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  let dateRange = $derived.by(() => {
    const now = new Date();
    if (periodPreset === "today") {
      const d = toYMD(now);
      return { from: d, to: d, label: `Hari Ini (${d})` };
    }
    if (periodPreset === "this_week") {
      const day = now.getDay() || 7;
      const start = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - day + 1,
      );
      const from = toYMD(start);
      const to = toYMD(now);
      return { from, to, label: `Minggu Ini (${from} s/d ${to})` };
    }
    if (periodPreset === "this_month") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const monthName = new Intl.DateTimeFormat("id-ID", {
        month: "long",
        year: "numeric",
      }).format(now);
      return {
        from: toYMD(start),
        to: toYMD(end),
        label: `Bulan ${monthName}`,
      };
    }
    if (periodPreset === "last_month") {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      const monthName = new Intl.DateTimeFormat("id-ID", {
        month: "long",
        year: "numeric",
      }).format(start);
      return {
        from: toYMD(start),
        to: toYMD(end),
        label: `Bulan ${monthName}`,
      };
    }
    if (periodPreset === "this_year") {
      const y = now.getFullYear();
      return { from: `${y}-01-01`, to: `${y}-12-31`, label: `Tahun ${y}` };
    }
    if (periodPreset === "custom") {
      return {
        from: customDateFrom || "",
        to: customDateTo || "",
        label:
          customDateFrom || customDateTo
            ? `${customDateFrom || "Awal"} s/d ${customDateTo || "Sekarang"}`
            : "Semua Periode",
      };
    }
    return { from: "", to: "", label: "Semua Periode" };
  });

  function isWithinDateRange(isoDateStr, fromYMD, toYMDVal) {
    if (!fromYMD && !toYMDVal) return true;
    if (!isoDateStr) return false;
    const d = new Date(isoDateStr);
    if (isNaN(d.getTime())) return false;
    const txYMD = toYMD(d);
    if (fromYMD && txYMD < fromYMD) return false;
    if (toYMDVal && txYMD > toYMDVal) return false;
    return true;
  }

  // Transaksi dalam periode & filter unit
  let periodTransactions = $derived(
    transactions.filter((tx) => {
      if (!isWithinDateRange(tx.date, dateRange.from, dateRange.to))
        return false;
      if (isPekerjaan && selectedUnit !== "all") {
        const txUnit = tx.metadata?.unit_usaha || "Tanpa Unit Spesifik";
        if (txUnit !== selectedUnit) return false;
      }
      return true;
    }),
  );

  // Ringkasan Arus Kas
  let reportSummary = $derived.by(() => {
    let totalIncome = 0;
    let totalExpense = 0;
    let incomeCount = 0;
    let expenseCount = 0;
    let pendingReimburseTotal = 0;
    let pendingReimburseCount = 0;
    let settledReimburseTotal = 0;
    let settledReimburseCount = 0;

    for (const tx of periodTransactions) {
      const amt = Number(tx.amount) || 0;
      const rStatus = tx.metadata?.reimburse_status;

      if (tx.workspace_id === activeWorkspace) {
        if (tx.type === "income") {
          totalIncome += amt;
          incomeCount++;
        } else if (tx.type === "expense") {
          totalExpense += amt;
          expenseCount++;
        }
      }

      if (rStatus === "pending") {
        pendingReimburseTotal += amt;
        pendingReimburseCount++;
      } else if (rStatus === "settled") {
        settledReimburseTotal += amt;
        settledReimburseCount++;
      }
    }

    return {
      totalIncome,
      totalExpense,
      netCashflow: totalIncome - totalExpense,
      incomeCount,
      expenseCount,
      pendingReimburseTotal,
      pendingReimburseCount,
      settledReimburseTotal,
      settledReimburseCount,
    };
  });

  // Rekap Per Kategori (Pemasukan & Pengeluaran)
  let categoryRecap = $derived.by(() => {
    const incomeMap = new Map();
    const expenseMap = new Map();

    for (const tx of periodTransactions) {
      if (tx.workspace_id !== activeWorkspace) continue;
      if (tx.type !== "income" && tx.type !== "expense") continue;

      const amt = Number(tx.amount) || 0;
      const catId = tx.category_id || "uncategorized";
      const catName = categoriesMap[tx.category_id]?.name || "Tanpa Kategori";
      const targetMap = tx.type === "income" ? incomeMap : expenseMap;

      const existing = targetMap.get(catId) || {
        id: catId,
        name: catName,
        count: 0,
        total: 0,
      };
      existing.count += 1;
      existing.total += amt;
      targetMap.set(catId, existing);
    }

    const totalInc = reportSummary.totalIncome || 1;
    const totalExp = reportSummary.totalExpense || 1;

    const incomeList = Array.from(incomeMap.values())
      .map((item) => ({
        ...item,
        percentage:
          reportSummary.totalIncome > 0 ? (item.total / totalInc) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);

    const expenseList = Array.from(expenseMap.values())
      .map((item) => ({
        ...item,
        percentage:
          reportSummary.totalExpense > 0 ? (item.total / totalExp) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);

    return {
      income: incomeList,
      expense: expenseList,
    };
  });

  // Rekap Per Unit Usaha Kopdes
  let unitRecap = $derived.by(() => {
    const map = new Map();
    for (const u of KOPDES_UNITS) {
      map.set(u, { unit: u, count: 0, income: 0, expense: 0, net: 0 });
    }

    const baseTxs = transactions.filter((tx) =>
      isWithinDateRange(tx.date, dateRange.from, dateRange.to),
    );

    for (const tx of baseTxs) {
      if (tx.workspace_id !== activeWorkspace) continue;
      if (tx.type !== "income" && tx.type !== "expense") continue;

      const unitName = tx.metadata?.unit_usaha?.trim() || "Tanpa Unit Spesifik";
      const entry = map.get(unitName) || {
        unit: unitName,
        count: 0,
        income: 0,
        expense: 0,
        net: 0,
      };

      const amt = Number(tx.amount) || 0;
      entry.count += 1;
      if (tx.type === "income") entry.income += amt;
      if (tx.type === "expense") entry.expense += amt;
      entry.net = entry.income - entry.expense;

      map.set(unitName, entry);
    }

    return Array.from(map.values()).filter(
      (u) => u.count > 0 || isPekerjaan,
    );
  });

  // Daftar Transaksi Reimburse (Lintas Buku atau Buku Aktif)
  let reimburseTransactions = $derived.by(() => {
    const sourceList =
      activeWorkspace === "personal" ? allTransactions : transactions;
    return sourceList.filter((tx) => {
      const rStatus = tx.metadata?.reimburse_status;
      if (rStatus !== "pending" && rStatus !== "settled") return false;
      if (!isWithinDateRange(tx.date, dateRange.from, dateRange.to))
        return false;
      if (reimburseFilter !== "all" && rStatus !== reimburseFilter)
        return false;
      return true;
    });
  });

  // Ringkasan Preview Import XLSX
  let importPreviewSummary = $derived.by(() => {
    let totalIn = 0;
    let totalOut = 0;
    for (const r of parsedImportRows) {
      if (r.type === "income" || r.type === "debt") totalIn += r.amount;
      else if (r.type === "expense" || r.type === "receivable")
        totalOut += r.amount;
    }
    return {
      count: parsedImportRows.length,
      totalIn,
      totalOut,
    };
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

  let theme = $derived.by(() => {
    const wsTheme = getWorkspaceTheme(activeWorkspace, effectiveWorkspaces);
    return {
      headerBg: wsTheme.heroBg,
      activeBtn: `${wsTheme.heroBg} text-white ${wsTheme.heroBorder}`,
      badge: wsTheme.badgeText,
    };
  });

  function handleExportTransactionsXLSX() {
    errorFeedback = "";
    const file = exportTransactionsToXLSX({
      transactions: periodTransactions,
      accountsMap,
      categoriesMap,
      activeWorkspace,
      periodLabel: dateRange.label,
    });
    exportFeedback = `Berhasil mengunduh file Excel: ${file}`;
    setTimeout(() => (exportFeedback = ""), 4500);
  }

  function handleExportFullReportXLSX() {
    errorFeedback = "";
    const file = exportFullReportToXLSX({
      activeWorkspace,
      periodLabel: dateRange.label,
      summary: reportSummary,
      unitRecap,
      categoryRecap,
      reimburseList: reimburseTransactions,
      transactions: periodTransactions,
      accountsMap,
      categoriesMap,
    });
    exportFeedback = `Berhasil mengunduh Laporan Excel Multi-Sheet: ${file}`;
    setTimeout(() => (exportFeedback = ""), 4500);
  }

  function handleDownloadTemplateXlsx() {
    errorFeedback = "";
    const file = downloadImportTemplateXLSX({
      categories: Object.values(categoriesMap),
      accounts: Object.values(accountsMap),
    });
    exportFeedback = `Berhasil mengunduh template: ${file} (Beserta Daftar Kategori & Dompet)`;
    setTimeout(() => (exportFeedback = ""), 4500);
  }

  async function handleSelectXlsxFile(e) {
    exportFeedback = "";
    errorFeedback = "";
    parsedImportRows = [];
    importSheetName = "";

    const file = e.target.files?.[0];
    if (!file) {
      importFileName = "";
      return;
    }

    importFileName = file.name;
    isParsingXlsx = true;

    try {
      const ab = await file.arrayBuffer();
      const result = await parseTransactionsFromXlsxBuffer(ab, activeWorkspace);
      importSheetName = result.sheetName;
      parsedImportRows = result.rows;
    } catch (err) {
      errorFeedback = err?.message || "Gagal membaca file Excel (.xlsx).";
      parsedImportRows = [];
    } finally {
      isParsingXlsx = false;
    }
  }

  async function handleConfirmImportXlsx() {
    if (parsedImportRows.length === 0 || isImportingXlsx) return;
    exportFeedback = "";
    errorFeedback = "";
    isImportingXlsx = true;

    try {
      const res = await importTransactionsFromXlsxRows(parsedImportRows);
      await onDataImported?.();
      exportFeedback = `Berhasil mengimpor ${res.importedCount} transaksi dari Excel (.xlsx)${
        res.newCategoriesCount > 0
          ? ` + ${res.newCategoriesCount} kategori baru`
          : ""
      }.`;
      parsedImportRows = [];
      importFileName = "";
      importSheetName = "";
    } catch (err) {
      errorFeedback =
        err?.message || "Gagal mengimpor data transaksi dari Excel.";
    } finally {
      isImportingXlsx = false;
    }
  }
</script>

{#if isOpen}
  <div
    class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4 overflow-y-auto"
  >
    <div
      class="bg-white w-full max-w-4xl rounded-t-2xl sm:rounded-2xl border border-slate-200 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
    >
      <!-- Header Modal -->
      <div
        class="flex items-center justify-between px-4 sm:px-5 py-3.5 {theme.headerBg} text-white shrink-0"
      >
        <div>
          <span
            class="block text-[10px] font-extrabold uppercase tracking-wider text-white/75"
          >
            {theme.badge} • {dateRange.label}
          </span>
          <h2
            class="text-sm sm:text-base font-extrabold tracking-wide uppercase"
          >
            Rekapitulasi Laporan
          </h2>
        </div>
        <button
          type="button"
          onclick={onClose}
          class="p-1.5 text-white/75 hover:text-white rounded-lg cursor-pointer"
          aria-label="Tutup Laporan"
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

      <!-- Bar Filter Periode & Tombol Export/Import XLSX -->
      <div
        class="px-4 sm:px-5 py-3 bg-slate-50 border-b border-slate-200 shrink-0 space-y-2.5"
      >
        {#if activeTab !== "import_xlsx"}
          <div class="flex flex-wrap items-center justify-between gap-2">
            <!-- Pilihan Periode Cepat -->
            <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {#each [{ id: "this_month", label: "Bulan Ini" }, { id: "last_month", label: "Bulan Lalu" }, { id: "this_week", label: "Minggu Ini" }, { id: "today", label: "Hari Ini" }, { id: "this_year", label: "Tahun Ini" }, { id: "all", label: "Semua" }, { id: "custom", label: "Rentang Tanggal" }] as p}
                <button
                  type="button"
                  onclick={() => (periodPreset = p.id)}
                  class="px-2.5 py-1 text-[11px] font-bold rounded-lg border shrink-0 transition-colors cursor-pointer {periodPreset ===
                  p.id
                    ? theme.activeBtn
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'}"
                >
                  {p.label}
                </button>
              {/each}
            </div>

            <!-- Filter Unit Usaha / Kerja -->
            {#if isPekerjaan}
              <select
                bind:value={selectedUnit}
                aria-label="Filter Unit Kerja Laporan"
                class="px-2.5 py-1 text-[11px] font-bold bg-white text-slate-700 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-500 cursor-pointer"
              >
                <option value="all">Semua Unit Kerja</option>
                {#each KOPDES_UNITS as u}
                  <option value={u}>{u}</option>
                {/each}
                <option value="Tanpa Unit Spesifik">Tanpa Unit Spesifik</option>
              </select>
            {/if}
          </div>

          {#if periodPreset === "custom"}
            <div class="flex flex-wrap items-center gap-2 pt-1">
              <div class="flex items-center gap-1.5 text-xs">
                <span class="font-bold text-slate-600">Dari:</span>
                <input
                  type="date"
                  bind:value={customDateFrom}
                  class="px-2.5 py-1 text-xs font-semibold bg-white border border-slate-300 rounded-lg tabular-nums"
                />
              </div>
              <div class="flex items-center gap-1.5 text-xs">
                <span class="font-bold text-slate-600">Sampai:</span>
                <input
                  type="date"
                  bind:value={customDateTo}
                  class="px-2.5 py-1 text-xs font-semibold bg-white border border-slate-300 rounded-lg tabular-nums"
                />
              </div>
            </div>
          {/if}
        {/if}

        <!-- Sub-Tab Navigasi Laporan & Import XLSX -->
        <div class="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div
            class="inline-flex flex-wrap bg-slate-200/80 p-0.5 rounded-xl border border-slate-300/60"
          >
            <button
              type="button"
              onclick={() => (activeTab = "category")}
              class="px-3 py-1.5 text-xs font-extrabold rounded-lg transition-colors cursor-pointer {activeTab ===
              'category'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'}"
            >
              Rekap Kategori
            </button>
            <button
              type="button"
              onclick={() => (activeTab = "unit")}
              class="px-3 py-1.5 text-xs font-extrabold rounded-lg transition-colors cursor-pointer {activeTab ===
              'unit'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'}"
            >
              Rekap Unit & Divisi
            </button>
            <button
              type="button"
              onclick={() => (activeTab = "reimburse")}
              class="px-3 py-1.5 text-xs font-extrabold rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5 {activeTab ===
              'reimburse'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'}"
            >
              <span>Daftar Reimburse</span>
              {#if reportSummary.pendingReimburseCount > 0}
                <span
                  class="px-1.5 py-0.2 bg-amber-600 text-white rounded-full text-[10px] font-extrabold tabular-nums"
                >
                  {reportSummary.pendingReimburseCount}
                </span>
              {/if}
            </button>
            <button
              type="button"
              onclick={() => (activeTab = "import_xlsx")}
              class="px-3 py-1.5 text-xs font-extrabold rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5 {activeTab ===
              'import_xlsx'
                ? 'bg-white text-emerald-900 shadow-2xs'
                : 'text-emerald-800 hover:text-emerald-950'}"
            >
              <svg
                class="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.2"
              >
                <path
                  d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              <span>Import Excel (.xlsx)</span>
            </button>
          </div>

          <!-- Tombol Export Cepat Desktop (.xlsx) -->
          <div class="hidden sm:flex items-center gap-1.5">
            <button
              type="button"
              onclick={handleExportTransactionsXLSX}
              class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-xl cursor-pointer transition-colors"
            >
              <svg
                class="w-3.5 h-3.5 text-emerald-700"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.2"
              >
                <path
                  d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              <span>Export Transaksi (.xlsx)</span>
            </button>
            <button
              type="button"
              onclick={handleExportFullReportXLSX}
              class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-extrabold bg-emerald-800 hover:bg-emerald-700 text-white rounded-xl cursor-pointer transition-colors"
            >
              <svg
                class="w-3.5 h-3.5"
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
                <path
                  d="M14 2v6h6M8 13h8M8 17h8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              <span>Export Laporan Lengkap (.xlsx)</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Body Konten Laporan -->
      <div class="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 text-xs">
        {#if exportFeedback}
          <div
            class="px-3.5 py-2.5 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl font-bold flex items-center justify-between"
          >
            <span>✓ {exportFeedback}</span>
            <button
              type="button"
              onclick={() => (exportFeedback = "")}
              class="text-emerald-700 font-extrabold cursor-pointer">✕</button
            >
          </div>
        {/if}

        {#if errorFeedback}
          <div
            class="px-3.5 py-2.5 bg-rose-50 border border-rose-300 text-rose-800 rounded-xl font-bold flex items-center justify-between"
          >
            <span>⚠ {errorFeedback}</span>
            <button
              type="button"
              onclick={() => (errorFeedback = "")}
              class="text-rose-700 font-extrabold cursor-pointer">✕</button
            >
          </div>
        {/if}

        {#if activeTab !== "import_xlsx"}
          <!-- 4 Kartu Metrik Utama Periode Ini -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div
              class="p-3 bg-emerald-50/70 border border-emerald-200/80 rounded-xl"
            >
              <span
                class="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800"
              >
                Total Pemasukan ({reportSummary.incomeCount})
              </span>
              <div
                class="text-sm sm:text-base font-extrabold text-emerald-700 tabular-nums mt-1"
              >
                +{formatIDR(reportSummary.totalIncome)}
              </div>
            </div>

            <div class="p-3 bg-rose-50/70 border border-rose-200/80 rounded-xl">
              <span
                class="text-[10px] font-extrabold uppercase tracking-wider text-rose-800"
              >
                Total Pengeluaran ({reportSummary.expenseCount})
              </span>
              <div
                class="text-sm sm:text-base font-extrabold text-rose-700 tabular-nums mt-1"
              >
                -{formatIDR(reportSummary.totalExpense)}
              </div>
            </div>

            <div class="p-3 bg-slate-100 border border-slate-200 rounded-xl">
              <span
                class="text-[10px] font-extrabold uppercase tracking-wider text-slate-600"
              >
                Surplus / Defisit
              </span>
              <div
                class="text-sm sm:text-base font-extrabold tabular-nums mt-1 {reportSummary.netCashflow >=
                0
                  ? 'text-slate-900'
                  : 'text-rose-700'}"
              >
                {reportSummary.netCashflow >= 0 ? "+" : ""}{formatIDR(
                  reportSummary.netCashflow,
                )}
              </div>
            </div>

            <div class="p-3 bg-amber-50/80 border border-amber-200 rounded-xl">
              <span
                class="text-[10px] font-extrabold uppercase tracking-wider text-amber-900"
              >
                Talangan Pending ({reportSummary.pendingReimburseCount})
              </span>
              <div
                class="text-sm sm:text-base font-extrabold text-amber-800 tabular-nums mt-1"
              >
                {formatIDR(reportSummary.pendingReimburseTotal)}
              </div>
            </div>
          </div>
        {/if}

        <!-- TAB 1: REKAP PER KATEGORI -->
        {#if activeTab === "category"}
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <!-- Kategori Pengeluaran -->
            <div
              class="border border-slate-200 rounded-2xl overflow-hidden bg-white"
            >
              <div
                class="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between"
              >
                <h3
                  class="text-xs font-extrabold uppercase tracking-wider text-slate-800"
                >
                  Rekap Pengeluaran per Kategori
                </h3>
                <span
                  class="text-[11px] font-extrabold text-rose-700 tabular-nums"
                >
                  {formatIDR(reportSummary.totalExpense)}
                </span>
              </div>

              {#if categoryRecap.expense.length === 0}
                <div class="p-6 text-center text-slate-400">
                  Tidak ada pengeluaran pada periode ini.
                </div>
              {:else}
                <div class="divide-y divide-slate-100">
                  {#each categoryRecap.expense as cat (cat.id)}
                    <div class="p-3 space-y-1.5">
                      <div class="flex items-center justify-between gap-2">
                        <div class="min-w-0">
                          <span class="font-bold text-slate-900"
                            >{cat.name}</span
                          >
                          <span
                            class="ml-1.5 text-[10px] font-semibold text-slate-400 tabular-nums"
                          >
                            ({cat.count}x • {cat.percentage.toFixed(1)}%)
                          </span>
                        </div>
                        <span
                          class="font-extrabold text-rose-700 tabular-nums shrink-0"
                        >
                          {formatIDR(cat.total)}
                        </span>
                      </div>
                      <div
                        class="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden"
                      >
                        <div
                          class="h-full bg-rose-600 rounded-full"
                          style="width: {Math.max(
                            2,
                            Math.min(100, cat.percentage),
                          )}%"
                        ></div>
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>

            <!-- Kategori Pemasukan -->
            <div
              class="border border-slate-200 rounded-2xl overflow-hidden bg-white"
            >
              <div
                class="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between"
              >
                <h3
                  class="text-xs font-extrabold uppercase tracking-wider text-slate-800"
                >
                  Rekap Pemasukan per Kategori
                </h3>
                <span
                  class="text-[11px] font-extrabold text-emerald-700 tabular-nums"
                >
                  {formatIDR(reportSummary.totalIncome)}
                </span>
              </div>

              {#if categoryRecap.income.length === 0}
                <div class="p-6 text-center text-slate-400">
                  Tidak ada pemasukan pada periode ini.
                </div>
              {:else}
                <div class="divide-y divide-slate-100">
                  {#each categoryRecap.income as cat (cat.id)}
                    <div class="p-3 space-y-1.5">
                      <div class="flex items-center justify-between gap-2">
                        <div class="min-w-0">
                          <span class="font-bold text-slate-900"
                            >{cat.name}</span
                          >
                          <span
                            class="ml-1.5 text-[10px] font-semibold text-slate-400 tabular-nums"
                          >
                            ({cat.count}x • {cat.percentage.toFixed(1)}%)
                          </span>
                        </div>
                        <span
                          class="font-extrabold text-emerald-700 tabular-nums shrink-0"
                        >
                          {formatIDR(cat.total)}
                        </span>
                      </div>
                      <div
                        class="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden"
                      >
                        <div
                          class="h-full bg-emerald-600 rounded-full"
                          style="width: {Math.max(
                            2,
                            Math.min(100, cat.percentage),
                          )}%"
                        ></div>
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>

          <!-- TAB 2: REKAP PER UNIT USAHA / DIVISI -->
        {:else if activeTab === "unit"}
          <div
            class="border border-slate-200 rounded-2xl overflow-hidden bg-white"
          >
            <div
              class="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between"
            >
              <div>
                <h3
                  class="text-xs font-extrabold uppercase tracking-wider text-slate-800"
                >
                  Rekapitulasi Arus Kas per Unit / Divisi
                </h3>
                <p class="text-[11px] text-slate-500 mt-0.5">
                  Ringkasan pertanggungjawaban pemasukan, pengeluaran, dan
                  selisih per unit kerja.
                </p>
              </div>
            </div>

            {#if unitRecap.length === 0}
              <div class="p-8 text-center text-slate-400">
                Belum ada transaksi dengan atribut Unit / Divisi pada periode ini.
              </div>
            {:else}
              <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr
                      class="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold uppercase text-slate-500"
                    >
                      <th class="py-2.5 px-4">Unit / Divisi</th>
                      <th class="py-2.5 px-4 text-center">Jml Transaksi</th>
                      <th class="py-2.5 px-4 text-right">Pemasukan (Rp)</th>
                      <th class="py-2.5 px-4 text-right">Pengeluaran (Rp)</th>
                      <th class="py-2.5 px-4 text-right"
                        >Surplus / Defisit (Rp)</th
                      >
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-200/70">
                    {#each unitRecap as u (u.unit)}
                      <tr class="hover:bg-slate-50">
                        <td class="py-3 px-4 font-extrabold text-slate-900"
                          >{u.unit}</td
                        >
                        <td
                          class="py-3 px-4 text-center tabular-nums font-semibold text-slate-600"
                        >
                          {u.count}
                        </td>
                        <td
                          class="py-3 px-4 text-right tabular-nums font-bold text-emerald-700"
                        >
                          +{formatIDR(u.income)}
                        </td>
                        <td
                          class="py-3 px-4 text-right tabular-nums font-bold text-rose-700"
                        >
                          -{formatIDR(u.expense)}
                        </td>
                        <td
                          class="py-3 px-4 text-right tabular-nums font-extrabold {u.net >=
                          0
                            ? 'text-slate-900'
                            : 'text-rose-700'}"
                        >
                          {u.net >= 0 ? "+" : ""}{formatIDR(u.net)}
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}
          </div>

          <!-- TAB 3: DAFTAR DANA TALANGAN / REIMBURSE -->
        {:else if activeTab === "reimburse"}
          <div class="space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-1.5">
                {#each [{ id: "all", label: "Semua Reimburse" }, { id: "pending", label: `Belum Diganti (${reportSummary.pendingReimburseCount})` }, { id: "settled", label: `Sudah Diganti (${reportSummary.settledReimburseCount})` }] as rf}
                  <button
                    type="button"
                    onclick={() => (reimburseFilter = rf.id)}
                    class="px-3 py-1.5 text-[11px] font-bold rounded-xl border cursor-pointer transition-colors {reimburseFilter ===
                    rf.id
                      ? 'bg-amber-700 text-white border-amber-700'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'}"
                  >
                    {rf.label}
                  </button>
                {/each}
              </div>

              <div class="text-[11px] font-bold text-slate-600 tabular-nums">
                Selesai Diganti: <span class="text-emerald-700"
                  >{formatIDR(reportSummary.settledReimburseTotal)}</span
                >
              </div>
            </div>

            {#if reimburseTransactions.length === 0}
              <div
                class="p-8 text-center text-slate-400 border border-slate-200 rounded-2xl bg-slate-50"
              >
                Tidak ada transaksi Dana Talangan / Reimburse untuk filter ini.
              </div>
            {:else}
              <div
                class="divide-y divide-slate-200 border border-slate-200 rounded-2xl overflow-hidden bg-white"
              >
                {#each reimburseTransactions as tx (tx.id)}
                  {@const isPending =
                    tx.metadata?.reimburse_status === "pending"}
                  {@const catName =
                    categoriesMap[tx.category_id]?.name || "Tanpa Kategori"}
                  {@const fromAccName = tx.metadata?.reimburse_from_account_id
                    ? accountsMap[tx.metadata.reimburse_from_account_id]
                        ?.name || "Dompet Pribadi"
                    : "Dompet Pribadi"}
                  {@const targetAccName =
                    accountsMap[tx.account_id]?.name || "-"}

                  <div
                    class="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50"
                  >
                    <div class="space-y-1 min-w-0">
                      <div class="flex items-center flex-wrap gap-1.5">
                        <span
                          class="px-2 py-0.5 text-[10px] font-extrabold uppercase rounded-md border {isPending
                            ? 'bg-amber-100 text-amber-900 border-amber-300'
                            : 'bg-emerald-100 text-emerald-900 border-emerald-300'}"
                        >
                          {isPending ? "BELUM DIGANTI" : "SUDAH DIGANTI"}
                        </span>
                        <span
                          class="px-1.5 py-0.5 text-[10px] font-bold uppercase bg-slate-800 text-white rounded"
                        >
                          Buku {tx.workspace_id}
                        </span>
                        <span class="font-extrabold text-slate-900"
                          >{catName}</span
                        >
                        {#if tx.metadata?.unit_usaha}
                          <span
                            class="px-1.5 py-0.5 bg-slate-100 text-slate-700 font-semibold rounded text-[10px]"
                          >
                            {tx.metadata.unit_usaha}
                          </span>
                        {/if}
                      </div>

                      {#if tx.note}
                        <p class="text-xs font-medium text-slate-700">
                          {tx.note}
                        </p>
                      {/if}

                      <div
                        class="text-[11px] text-slate-500 tabular-nums flex flex-wrap items-center gap-1.5"
                      >
                        <span>{formatDateShort(tx.date)}</span>
                        <span>•</span>
                        <span
                          >Ditalangi oleh: <strong class="text-slate-800"
                            >{fromAccName}</strong
                          ></span
                        >
                        <span>•</span>
                        <span
                          >Beban Kas: <strong class="text-slate-800"
                            >{targetAccName}</strong
                          ></span
                        >
                        {#if tx.metadata?.no_bukti}
                          <span>• #{tx.metadata.no_bukti}</span>
                        {/if}
                      </div>
                    </div>

                    <div
                      class="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0"
                    >
                      <span
                        class="text-sm font-extrabold tabular-nums text-rose-700"
                      >
                        {formatIDR(tx.amount)}
                      </span>
                      <div class="flex items-center gap-1.5">
                        {#if onPreviewReceipt}
                          <button
                            type="button"
                            onclick={() => onPreviewReceipt(tx)}
                            class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-[11px] cursor-pointer"
                          >
                            Detail
                          </button>
                        {/if}
                        {#if isPending && onSettleReimburse}
                          <button
                            type="button"
                            onclick={() => onSettleReimburse(tx.id)}
                            class="px-2.5 py-1 bg-amber-700 hover:bg-amber-800 text-white font-bold rounded-lg text-[11px] cursor-pointer"
                          >
                            Tandai Diganti
                          </button>
                        {/if}
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <!-- TAB 4: IMPORT TRANSAKSI / LAPORAN DARI FILE EXCEL (.XLSX) -->
        {:else if activeTab === "import_xlsx"}
          <div
            class="space-y-4 border border-slate-200 rounded-2xl p-4 bg-white"
          >
            <div
              class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100"
            >
              <div>
                <h3
                  class="text-xs font-extrabold uppercase tracking-wider text-slate-900"
                >
                  Import Data Transaksi & Laporan dari File Excel (.xlsx)
                </h3>
                <!-- <p class="text-[11px] text-slate-500 mt-0.5">
                  Gunakan <strong>Template_Import_Buku_Kas.xlsx</strong> (dilengkapi Sheet <strong>Daftar Kategori & Dompet</strong>) atau file <strong>.xlsx</strong> hasil Export aplikasi ini.
                </p> -->
              </div>

              <button
                type="button"
                onclick={handleDownloadTemplateXlsx}
                class="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-extrabold bg-slate-900 hover:bg-slate-800 text-white rounded-xl cursor-pointer shrink-0 transition-colors"
              >
                <svg
                  class="w-3.5 h-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.2"
                >
                  <path
                    d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
                <span>Unduh Template Excel (.xlsx)</span>
              </button>
            </div>

            <div>
              <label
                for="xlsx-import-input"
                class="block text-[11px] font-bold text-slate-700 mb-1.5"
              >
                Pilih File Microsoft Excel (.xlsx)
              </label>
              <input
                id="xlsx-import-input"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onchange={handleSelectXlsxFile}
                class="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl cursor-pointer file:mr-3 file:py-1.5 file:px-3.5 file:rounded-lg file:border-0 file:text-xs file:font-extrabold file:bg-emerald-800 file:text-white hover:file:bg-emerald-700"
              />
            </div>

            {#if isParsingXlsx}
              <div class="p-6 text-center text-slate-500 font-bold">
                Membaca struktur worksheet Excel (.xlsx)...
              </div>
            {:else if parsedImportRows.length > 0}
              <div class="space-y-3">
                <div
                  class="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex flex-wrap items-center justify-between gap-2"
                >
                  <div>
                    <span class="font-extrabold text-emerald-950 block">
                      Ditemukan {importPreviewSummary.count} Transaksi Siap Diimpor
                      (Sheet: {importSheetName})
                    </span>
                    <span class="text-[11px] text-emerald-800 tabular-nums">
                      Total Pemasukan: +{formatIDR(
                        importPreviewSummary.totalIn,
                      )} • Total Pengeluaran: -{formatIDR(
                        importPreviewSummary.totalOut,
                      )}
                    </span>
                  </div>

                  <button
                    type="button"
                    disabled={isImportingXlsx}
                    onclick={handleConfirmImportXlsx}
                    class="px-4 py-2 bg-emerald-800 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-xl cursor-pointer shadow-2xs disabled:opacity-50"
                  >
                    {isImportingXlsx
                      ? "Mengimpor ke Database..."
                      : `Simpan & Import (${importPreviewSummary.count} Transaksi)`}
                  </button>
                </div>

                <!-- Tabel Preview Baris Transaksi dari Excel -->
                <div
                  class="border border-slate-200 rounded-xl overflow-x-auto max-h-64"
                >
                  <table class="w-full text-left border-collapse text-[11px]">
                    <thead>
                      <tr
                        class="bg-slate-100 border-b border-slate-200 font-extrabold uppercase text-slate-600"
                      >
                        <th class="py-2 px-3">Tanggal</th>
                        <th class="py-2 px-3">Buku</th>
                        <th class="py-2 px-3">Tipe</th>
                        <th class="py-2 px-3">Kategori</th>
                        <th class="py-2 px-3">Dompet</th>
                        <th class="py-2 px-3">Unit / Bukti</th>
                        <th class="py-2 px-3">Catatan</th>
                        <th class="py-2 px-3 text-right">Nominal (Rp)</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                      {#each parsedImportRows.slice(0, 15) as r, idx (idx)}
                        <tr class="hover:bg-slate-50">
                          <td
                            class="py-2 px-3 tabular-nums whitespace-nowrap text-slate-500"
                          >
                            {formatDateShort(r.date)}
                          </td>
                          <td
                            class="py-2 px-3 font-bold uppercase text-slate-700"
                            >{r.workspace_id}</td
                          >
                          <td class="py-2 px-3 font-bold uppercase">
                            <span
                              class="px-1.5 py-0.5 rounded text-[10px] {r.type ===
                              'income'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'}"
                            >
                              {r.type}
                            </span>
                          </td>
                          <td class="py-2 px-3 font-semibold text-slate-900"
                            >{r.categoryName || "-"}</td
                          >
                          <td class="py-2 px-3 text-slate-700"
                            >{r.accountName || "Default"}</td
                          >
                          <td class="py-2 px-3 text-slate-500">
                            {[r.metadata?.unit_usaha, r.metadata?.no_bukti]
                              .filter(Boolean)
                              .join(" • ") || "-"}
                          </td>
                          <td
                            class="py-2 px-3 text-slate-600 truncate max-w-[160px]"
                            >{r.note || "-"}</td
                          >
                          <td
                            class="py-2 px-3 text-right font-extrabold tabular-nums text-slate-900"
                          >
                            {formatIDR(r.amount)}
                          </td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
                {#if parsedImportRows.length > 15}
                  <p class="text-[11px] text-slate-400 text-center">
                    Menampilkan 15 dari {parsedImportRows.length} baris transaksi.
                  </p>
                {/if}
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Footer Tombol Export (Mobile & Desktop) -->
      <div
        class="px-4 sm:px-5 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0"
      >
        <div class="flex sm:hidden items-center gap-2 w-full">
          <button
            type="button"
            onclick={handleExportTransactionsXLSX}
            class="flex-1 py-2 px-3 text-xs font-bold bg-white border border-slate-300 text-slate-800 rounded-xl cursor-pointer text-center"
          >
            Transaksi (.xlsx)
          </button>
          <button
            type="button"
            onclick={handleExportFullReportXLSX}
            class="flex-1 py-2 px-3 text-xs font-extrabold bg-emerald-800 text-white rounded-xl cursor-pointer text-center"
          >
            Laporan (.xlsx)
          </button>
        </div>

        <span class="hidden sm:inline text-[11px] text-slate-500 font-medium">
          Format Microsoft Excel asli (.xlsx) dengan Multi-Sheet, kolom otomatis
          rapi, dan siap di-import kembali.
        </span>

        <button
          type="button"
          onclick={onClose}
          class="w-full sm:w-auto px-4 py-2 text-xs font-extrabold bg-slate-900 hover:bg-slate-800 text-white rounded-xl cursor-pointer"
        >
          Tutup
        </button>
      </div>
    </div>
  </div>
{/if}
