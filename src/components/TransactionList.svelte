<script>
  import { formatIDR, formatDateShort } from "../lib/utils.js";

  let {
    activeWorkspace = "personal",
    transactions = [],
    accountsMap = {},
    categoriesMap = {},
    onEdit,
    onDelete,
    onSettleReimburse,
    onPreviewReceipt,
  } = $props();

  let searchQuery = $state("");
  let filterType = $state("all");
  let filterReimburseOnly = $state(false);

  let activeFilterBtnCls = $derived(
    activeWorkspace === "business"
      ? "bg-teal-900 text-white border-teal-900 shadow-2xs"
      : activeWorkspace === "kopdes"
        ? "bg-emerald-900 text-white border-emerald-900 shadow-2xs"
        : "bg-indigo-950 text-white border-indigo-950 shadow-2xs",
  );

  let filteredTransactions = $derived(
    transactions.filter((tx) => {
      if (filterType !== "all" && tx.type !== filterType) return false;
      if (filterReimburseOnly && tx.metadata?.reimburse_status !== "pending")
        return false;

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
        const itemsMatch = Array.isArray(tx.items)
          ? tx.items.some((it) => (it.name || "").toLowerCase().includes(q))
          : false;
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
  <!-- Filter & Bar Pencarian Cepat -->
  <div
    class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3.5"
  >
    <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
      {#each [{ id: "all", label: "Semua" }, { id: "expense", label: "Pengeluaran" }, { id: "income", label: "Pemasukan" }, { id: "transfer", label: "Transfer" }] as f}
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
        onclick={() => (filterReimburseOnly = !filterReimburseOnly)}
        class="px-3 py-1.5 text-xs font-bold rounded-xl border shrink-0 transition-all cursor-pointer {filterReimburseOnly
          ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
          : 'bg-amber-50/70 text-amber-800 border-amber-200 hover:bg-amber-100/80'}"
      >
        Talangan Pending
      </button>
    </div>

    <div class="relative w-full sm:w-72">
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
        type="search"
        placeholder="Cari catatan, kategori, no bukti..."
        bind:value={searchQuery}
        class="w-full pl-9 pr-3 py-1.5 text-xs font-medium bg-white border border-slate-200/90 rounded-xl shadow-2xs focus:outline-none focus:border-slate-500 transition-colors"
      />
    </div>
  </div>

  {#if filteredTransactions.length === 0}
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
      <p class="text-xs font-bold text-slate-700">
        Belum ada transaksi tercatat
      </p>
      <p class="text-[11px] text-slate-400 mt-0.5">
        Klik tombol "+ Catat Transaksi" untuk mulai menambahkan data.
      </p>
    </div>
  {:else}
    <!-- 1. MOBILE CARD VIEW (< 768px) -->
    <div class="md:hidden space-y-2">
      {#each filteredTransactions as tx (tx.id)}
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

        <div
          class="bg-white border border-slate-200/90 rounded-2xl p-3.5 shadow-2xs"
        >
          <div class="flex items-start justify-between gap-2.5">
            <div class="min-w-0">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span
                  class="px-2 py-0.5 text-[10px] font-extrabold border rounded-md {badge.cls}"
                >
                  {badge.label}
                </span>
                <span class="text-xs font-extrabold text-slate-900 truncate"
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
                <p class="text-xs font-medium text-slate-700 mt-1 break-words">
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

              <!-- Info Dompet & Tanggal -->
              <div
                class="flex items-center flex-wrap gap-1.5 mt-2 text-[11px] text-slate-400 font-medium tabular-nums"
              >
                <span>{formatDateShort(tx.date)}</span>
                <span>•</span>
                <span class="text-slate-600 font-semibold">{accName}</span>
                {#if tx.items?.length > 0}
                  <button
                    type="button"
                    onclick={() => onPreviewReceipt?.(tx)}
                    class="ml-1 inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-md text-[10px] font-extrabold cursor-pointer transition-colors"
                    title="Lihat Rincian Item Produk"
                  >
                    <span>🧾 {tx.items.length} Produk</span>
                  </button>
                {/if}
                {#if tx.attachment_blob}
                  <button
                    type="button"
                    onclick={() => onPreviewReceipt?.(tx)}
                    class="ml-1 inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-md text-[10px] font-extrabold cursor-pointer transition-colors"
                    title="Lihat Lampiran Foto Struk"
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
                  </button>
                {/if}
              </div>
            </div>

            <div class="text-right shrink-0">
              <div
                class="text-sm font-extrabold tabular-nums {getAmountColor(
                  tx.type,
                )}"
              >
                {getAmountPrefix(tx.type)}{formatIDR(tx.amount)}
              </div>

              <!-- Aksi Cepat Mobile -->
              <div class="flex items-center justify-end gap-2.5 mt-2.5">
                <button
                  type="button"
                  onclick={() => onEdit(tx)}
                  class="text-[11px] font-bold text-slate-500 hover:text-slate-900 cursor-pointer"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onclick={() => onDelete(tx.id)}
                  class="text-[11px] font-bold text-rose-600 hover:text-rose-800 cursor-pointer"
                >
                  Hapus
                </button>
              </div>
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
                onclick={() => onSettleReimburse(tx.id)}
                class="px-2.5 py-1 bg-amber-700 text-white text-[11px] font-bold rounded-lg hover:bg-amber-800 shrink-0 cursor-pointer shadow-2xs"
              >
                Tandai Diganti
              </button>
            </div>
          {:else if tx.metadata?.reimburse_status === "settled"}
            <div
              class="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-emerald-700 font-bold"
            >
              <span>✓ Reimburse Selesai (Diganti ke {reimburseFromName})</span>
            </div>
          {/if}
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
          {#each filteredTransactions as tx (tx.id)}
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

            <tr class="hover:bg-slate-50/80 transition-colors">
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
                  {#if tx.items?.length > 0}
                    <button
                      type="button"
                      onclick={() => onPreviewReceipt?.(tx)}
                      class="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-md text-[10px] font-extrabold tabular-nums cursor-pointer transition-colors"
                      title="Lihat Rincian Item Produk"
                    >
                      <span>🧾 {tx.items.length} Produk</span>
                    </button>
                  {/if}
                  {#if tx.attachment_blob}
                    <button
                      type="button"
                      onclick={() => onPreviewReceipt?.(tx)}
                      class="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-md text-[10px] font-extrabold tabular-nums cursor-pointer transition-colors"
                      title="Lihat Lampiran Struk"
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
                    </button>
                  {/if}
                </div>
                {#if tx.metadata?.reimburse_status === "pending"}
                  <div
                    class="mt-1.5 inline-flex items-center gap-2 px-2.5 py-1 bg-amber-50 border border-amber-300 text-amber-900 rounded-lg text-[11px] font-semibold"
                  >
                    <span>Pending Talangan ({reimburseFromName})</span>
                    <button
                      type="button"
                      onclick={() => onSettleReimburse(tx.id)}
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

              <td class="py-3 px-4 whitespace-nowrap text-right">
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
      </table>
    </div>
  {/if}
</section>
