<script>
  import { formatIDR, formatDateShort } from "../lib/utils.js";
  import {
    getTypeBadge,
    getAmountColor,
    getAmountPrefix,
    getTxItems
  } from "../lib/utils/transactionFormatters.js";

  /**
   * TransactionDesktopTable.svelte
   * Tampilan tabel spreadsheet transaksi khusus layar Desktop (>= 768px).
   */
  let {
    transactions = [],
    accountsMap = {},
    categoriesMap = {},
    activeWorkspace = "personal",
    isPekerjaan = false,
    isBusiness = false,
    filteredSummary = { count: 0, totalIn: 0, totalOut: 0, net: 0 },
    onPreviewReceipt,
    onEdit,
    onDelete,
    onSettleReimburse
  } = $props();
</script>

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
        {#if isPekerjaan}
          <th class="py-3 px-4">Unit / Divisi</th>
          <th class="py-3 px-4">No. Bukti & PIC</th>
        {:else if isBusiness}
          <th class="py-3 px-4">No. Nota & Pihak</th>
        {/if}
        <th class="py-3 px-4">Catatan & Status Reimburse</th>
        <th class="py-3 px-4 text-right">Nominal (Rp)</th>
        <th class="py-3 px-4 text-right">Aksi</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-slate-200/70">
      {#each transactions as tx (tx.id)}
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

        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
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

          {#if isPekerjaan}
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
          {:else if isBusiness}
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
                    onSettleReimburse?.(tx.id);
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

          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <td
            onclick={(e) => e.stopPropagation()}
            class="py-3 px-4 whitespace-nowrap text-right"
          >
            <div class="inline-flex items-center gap-3">
              <button
                type="button"
                onclick={() => onEdit?.(tx)}
                class="text-slate-600 hover:text-slate-900 font-bold cursor-pointer"
              >
                Edit
              </button>
              <button
                type="button"
                onclick={() => onDelete?.(tx.id)}
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
          colspan={isPekerjaan
            ? 7
            : isBusiness
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
          {filteredSummary.net >= 0 ? "+" : ""}{formatIDR(filteredSummary.net)}
        </td>
        <td></td>
      </tr>
    </tfoot>
  </table>
</div>

