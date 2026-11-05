<script>
  /**
   * TransactionFilterDrawer.svelte
   * Panel laci / collapsible filter lanjutan untuk daftar transaksi:
   * Kategori, Status Dana Talangan, dan Rentang Tanggal.
   */
  let {
    isOpen = false,
    categories = [],
    filterCategoryId = "all",
    filterReimburseStatus = "all",
    filterDateFrom = "",
    filterDateTo = "",
    onCategoryChange,
    onReimburseStatusChange,
    onDateFromChange,
    onDateToChange
  } = $props();
</script>

{#if isOpen}
  <div
    class="p-3 mb-2.5 bg-white border border-slate-200/90 rounded-xl shadow-2xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs"
  >
    <!-- Filter Kategori -->
    <div>
      <label
        for="filter-category"
        class="block text-[10px] font-extrabold uppercase text-slate-500 mb-1"
      >
        Kategori
      </label>
      <select
        id="filter-category"
        value={filterCategoryId}
        onchange={(e) => onCategoryChange?.(e.target.value)}
        class="w-full px-2.5 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-500 cursor-pointer"
      >
        <option value="all">Semua Kategori</option>
        {#each categories as cat (cat.id)}
          <option value={cat.id}>
            {cat.name} ({cat.type === "income" ? "Masuk" : "Keluar"})
          </option>
        {/each}
      </select>
    </div>

    <!-- Filter Status Dana Talangan / Reimburse -->
    <div>
      <label
        for="filter-reimburse-status"
        class="block text-[10px] font-extrabold uppercase text-slate-500 mb-1"
      >
        Status Dana Talangan
      </label>
      <select
        id="filter-reimburse-status"
        value={filterReimburseStatus}
        onchange={(e) => onReimburseStatusChange?.(e.target.value)}
        class="w-full px-2.5 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-500 cursor-pointer"
      >
        <option value="all">Semua Transaksi</option>
        <option value="pending">Belum Diganti (Pending)</option>
        <option value="settled">Sudah Diganti (Selesai)</option>
      </select>
    </div>

    <!-- Filter Dari Tanggal -->
    <div>
      <label
        for="filter-date-from"
        class="block text-[10px] font-extrabold uppercase text-slate-500 mb-1"
      >
        Dari Tanggal
      </label>
      <input
        id="filter-date-from"
        type="date"
        value={filterDateFrom}
        oninput={(e) => onDateFromChange?.(e.target.value)}
        class="w-full px-2.5 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg tabular-nums focus:outline-none focus:border-slate-500"
      />
    </div>

    <!-- Filter Sampai Tanggal -->
    <div>
      <label
        for="filter-date-to"
        class="block text-[10px] font-extrabold uppercase text-slate-500 mb-1"
      >
        Sampai Tanggal
      </label>
      <input
        id="filter-date-to"
        type="date"
        value={filterDateTo}
        oninput={(e) => onDateToChange?.(e.target.value)}
        class="w-full px-2.5 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg tabular-nums focus:outline-none focus:border-slate-500"
      />
    </div>
  </div>
{/if}

