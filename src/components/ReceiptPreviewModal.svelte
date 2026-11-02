<script>
  import { onDestroy } from 'svelte';
  import { formatIDR, formatDateShort } from '../lib/utils.js';

  let {
    isOpen = false,
    transaction = null,
    accountsMap = {},
    categoriesMap = {},
    onEdit,
    onClose
  } = $props();

  let blobUrl = $state('');
  let blobSizeKB = $state(0);

  $effect(() => {
    if (isOpen && transaction?.attachment_blob) {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      const blob = transaction.attachment_blob;
      blobUrl = URL.createObjectURL(blob);
      blobSizeKB = Math.round(((blob.size || 0) / 1024) * 10) / 10;
    } else {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        blobUrl = '';
      }
      blobSizeKB = 0;
    }
  });

  onDestroy(() => {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  });

  let headerBgCls = $derived(
    transaction?.workspace_id === 'business'
      ? 'bg-teal-900'
      : transaction?.workspace_id === 'kopdes'
        ? 'bg-emerald-900'
        : 'bg-indigo-950'
  );

  function downloadReceipt() {
    if (!blobUrl || !transaction) return;
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `struk-${transaction.metadata?.no_bukti || transaction.id.slice(0, 8)}.webp`;
    a.click();
  }
</script>

{#if isOpen && transaction}
  <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/70 backdrop-blur-xs p-0 sm:p-4 overflow-y-auto">
    <div class="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl border border-slate-200 shadow-2xl overflow-hidden max-h-[95vh] flex flex-col">
      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3.5 {headerBgCls} text-white shrink-0">
        <div class="flex items-center gap-2">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke-linecap="round" stroke-linejoin="round"/>
            <polyline points="14 2 14 8 20 8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <h2 class="text-sm font-extrabold tracking-wide uppercase">
            Detail & Lampiran Struk
          </h2>
        </div>
        <button
          type="button"
          onclick={onClose}
          class="p-1 text-white/70 hover:text-white cursor-pointer"
          aria-label="Tutup"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>

      <!-- Body -->
      <div class="p-4 space-y-3.5 overflow-y-auto text-xs sm:text-sm">
        <!-- Ringkasan Transaksi -->
        <div class="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="text-xs font-extrabold text-slate-900">
              {categoriesMap[transaction.category_id]?.name || 'Transaksi'}
            </div>
            {#if transaction.note}
              <p class="text-xs text-slate-700 font-medium mt-0.5">{transaction.note}</p>
            {/if}
            <div class="text-[11px] text-slate-500 tabular-nums mt-1">
              {formatDateShort(transaction.date)} • {accountsMap[transaction.account_id]?.name || '-'}
            </div>
            {#if transaction.metadata?.no_bukti || transaction.metadata?.unit_usaha || transaction.metadata?.pic_pihak}
              <div class="flex flex-wrap gap-1.5 mt-1.5 text-[11px] text-slate-600">
                {#if transaction.metadata?.unit_usaha}
                  <span class="px-1.5 py-0.5 bg-slate-200/80 rounded font-semibold">{transaction.metadata.unit_usaha}</span>
                {/if}
                {#if transaction.metadata?.no_bukti}
                  <span class="font-bold tabular-nums">#{transaction.metadata.no_bukti}</span>
                {/if}
                {#if transaction.metadata?.pic_pihak}
                  <span>• PIC: {transaction.metadata.pic_pihak}</span>
                {/if}
              </div>
            {/if}
          </div>

          <div class="text-right shrink-0">
            <div class="text-base font-extrabold tabular-nums text-slate-900">
              {formatIDR(transaction.amount)}
            </div>
            {#if blobSizeKB > 0}
              <span class="inline-block mt-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-md text-[10px] font-extrabold tabular-nums">
                WebP • {blobSizeKB} KB
              </span>
            {/if}
          </div>
        </div>

        <!-- Daftar Rincian Produk (Jika Ada di Metadata Struk) -->
        {#if Array.isArray(transaction.metadata?.items) && transaction.metadata.items.length > 0}
          <div class="bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden">
            <div class="px-3.5 py-2 bg-slate-100 border-b border-slate-200 text-[11px] font-extrabold uppercase text-slate-600">
              Rincian Produk Struk ({transaction.metadata.items.length} item)
            </div>
            <div class="divide-y divide-slate-200/70">
              {#each transaction.metadata.items as item}
                <div class="px-3.5 py-2 flex items-center justify-between text-xs">
                  <span class="font-semibold text-slate-800">{item.name}</span>
                  <span class="font-extrabold tabular-nums text-slate-900">{formatIDR(item.amount)}</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Gambar Lampiran Struk -->
        {#if blobUrl}
          <div class="bg-slate-900/5 border border-slate-200 rounded-2xl p-3 flex flex-col items-center justify-center">
            <img
              src={blobUrl}
              alt="Foto Nota / Struk"
              class="max-h-[55vh] w-auto object-contain rounded-xl border border-slate-300 bg-white shadow-sm"
            />
          </div>
        {:else}
          <div class="p-6 text-center text-slate-400 text-xs bg-slate-50 rounded-2xl border border-slate-200">
            Tidak ada lampiran gambar pada transaksi ini.
          </div>
        {/if}

        <!-- Footer Aksi -->
        <div class="flex items-center justify-between gap-2 pt-2 border-t border-slate-200">
          {#if blobUrl}
            <button
              type="button"
              onclick={downloadReceipt}
              class="px-3 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer inline-flex items-center gap-1.5"
            >
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span>Unduh WebP</span>
            </button>
          {:else}
            <div></div>
          {/if}

          <div class="flex items-center gap-2">
            {#if onEdit}
              <button
                type="button"
                onclick={() => {
                  const tx = transaction;
                  onClose();
                  onEdit(tx);
                }}
                class="px-3.5 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 cursor-pointer"
              >
                Edit Transaksi
              </button>
            {/if}
            <button
              type="button"
              onclick={onClose}
              class="px-4 py-2 text-xs font-extrabold text-white rounded-xl cursor-pointer {headerBgCls}"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

