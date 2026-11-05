<script>
  import { formatIDR } from "../lib/utils.js";

  /**
   * TransactionItemsTable.svelte
   * Sub-komponen rincian item/produk belanja (tabel opsional `transaction_items`).
   */
  let {
    items = [],
    itemsSubtotal = 0,
    evaluatedAmount = 0,
    onAddItem,
    onRemoveItem,
    onClearAll,
    onItemAmountInput,
    onSyncAmount
  } = $props();
</script>

<div class="p-3 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-2.5">
  <div class="flex items-center justify-between gap-2">
    <div>
      <span class="block text-[11px] font-bold uppercase text-slate-500">
        Rincian Produk ({items.length} item)
      </span>
      <span class="text-[10px] text-slate-400"> Opsional</span>
    </div>
    <div class="flex items-center gap-1.5">
      {#if items.length > 0}
        <button
          type="button"
          onclick={onClearAll}
          class="px-2 py-1 text-[11px] font-bold text-rose-600 hover:text-rose-800 cursor-pointer"
        >
          Reset
        </button>
      {/if}
      <button
        type="button"
        onclick={onAddItem}
        class="px-2.5 py-1 text-[11px] font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg cursor-pointer"
      >
        + Produk
      </button>
    </div>
  </div>

  {#if items.length > 0}
    <div class="space-y-1.5 max-h-44 overflow-y-auto pr-0.5">
      {#each items as item, idx (item.id || idx)}
        <div class="flex items-center gap-1.5">
          <input
            type="text"
            placeholder="Nama produk..."
            bind:value={item.name}
            class="flex-1 min-w-0 px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-medium focus:outline-none focus:border-slate-900"
          />
          <div class="relative w-28 shrink-0 flex items-center">
            <span
              class="absolute left-2 text-[10px] font-bold text-slate-400 pointer-events-none"
            >
              Rp
            </span>
            <input
              type="text"
              inputmode="numeric"
              placeholder="0"
              value={item.amountInput}
              oninput={(e) => onItemAmountInput?.(idx, e)}
              class="w-full pl-6 pr-2 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-extrabold tabular-nums text-right focus:outline-none focus:border-slate-900"
            />
          </div>
          <button
            type="button"
            onclick={() => onRemoveItem?.(idx)}
            class="p-1 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer shrink-0"
            aria-label="Hapus item"
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
      {/each}
    </div>

    <div
      class="pt-2 border-t border-slate-200/80 flex items-center justify-between gap-2 text-xs"
    >
      <span class="text-[11px] font-bold text-slate-500">
        Subtotal ({items.length} item):
      </span>
      <div class="flex items-center gap-1.5">
        <span class="font-extrabold tabular-nums text-slate-900">
          {formatIDR(itemsSubtotal)}
        </span>
        {#if itemsSubtotal > 0 && itemsSubtotal !== evaluatedAmount}
          <button
            type="button"
            onclick={onSyncAmount}
            class="px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-md text-[10px] font-extrabold cursor-pointer"
          >
            Samakan Total
          </button>
        {/if}
      </div>
    </div>
  {/if}
</div>

