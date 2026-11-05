<script>
  import { formatIDR } from "../lib/utils.js";
  import {
    formatTimeOnly,
    getTypeBadge,
    getAmountColor,
    getAmountPrefix,
    getTxItems
  } from "../lib/utils/transactionFormatters.js";

  /**
   * TransactionMobileCard.svelte
   * Kartu transaksi khusus tampilan Mobile (< 768px) dengan touch gesture:
   * - Slide Kanan: memunculkan tombol Edit & Hapus di sisi kiri
   * - Slide Kiri: memunculkan tombol Edit & Hapus di sisi kanan
   * - Ketuk kartu: melihat rincian / preview struk
   */
  let {
    tx,
    accountsMap = {},
    categoriesMap = {},
    activeWorkspace = "personal",
    swipedTxId = null,
    swipedOffset = 0,
    onSwipeOpen,
    onSwipeClose,
    onPreviewReceipt,
    onEdit,
    onDelete,
    onSettleReimburse
  } = $props();

  const SWIPE_OPEN_WIDTH = 132;

  let isDragging = $state(false);
  let dragStartX = 0;
  let dragStartY = 0;
  let dragBaseOffset = 0;
  let dragCurrentOffset = $state(0);
  let isHorizontalSwipe = $state(false);
  let didSwipeMove = false;

  let isThisSwiped = $derived(swipedTxId === tx.id);
  let currentOffset = $derived(
    isDragging && isHorizontalSwipe
      ? dragCurrentOffset
      : isThisSwiped
        ? swipedOffset
        : 0
  );

  let badge = $derived(getTypeBadge(tx.type));
  let accName = $derived(accountsMap[tx.account_id]?.name || "-");
  let toAccName = $derived(
    tx.to_account_id ? accountsMap[tx.to_account_id]?.name : null
  );
  let catName = $derived(
    tx.type === "transfer"
      ? `Transfer ke ${toAccName || "-"}`
      : categoriesMap[tx.category_id]?.name || "Tanpa Kategori"
  );
  let reimburseFromName = $derived(
    tx.metadata?.reimburse_from_account_id
      ? accountsMap[tx.metadata.reimburse_from_account_id]?.name
      : "Dompet Pribadi"
  );
  let itemsList = $derived(getTxItems(tx));

  function handleTouchStart(e) {
    const touch = e.touches?.[0];
    if (!touch) return;

    if (swipedTxId && swipedTxId !== tx.id) {
      onSwipeClose?.();
    }

    isDragging = true;
    dragStartX = touch.clientX;
    dragStartY = touch.clientY;
    dragBaseOffset = isThisSwiped ? swipedOffset : 0;
    dragCurrentOffset = dragBaseOffset;
    isHorizontalSwipe = false;
    didSwipeMove = false;
  }

  function handleTouchMove(e) {
    if (!isDragging) return;
    const touch = e.touches?.[0];
    if (!touch) return;

    const dx = touch.clientX - dragStartX;
    const dy = touch.clientY - dragStartY;

    if (!isHorizontalSwipe) {
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) {
        isDragging = false;
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
        Math.min(SWIPE_OPEN_WIDTH + 16, dragBaseOffset + dx)
      );
      dragCurrentOffset = next;
    }
  }

  function handleTouchEnd() {
    if (!isDragging) return;

    if (isHorizontalSwipe) {
      if (dragCurrentOffset > 45) {
        onSwipeOpen?.(tx.id, SWIPE_OPEN_WIDTH);
      } else if (dragCurrentOffset < -45) {
        onSwipeOpen?.(tx.id, -SWIPE_OPEN_WIDTH);
      } else {
        onSwipeClose?.();
      }
    }

    isDragging = false;
    dragCurrentOffset = 0;
    isHorizontalSwipe = false;
  }

  function handleCardClick() {
    if (didSwipeMove) {
      didSwipeMove = false;
      return;
    }
    if (isThisSwiped) {
      onSwipeClose?.();
      return;
    }
    if (swipedTxId) {
      onSwipeClose?.();
    }
    onPreviewReceipt?.(tx);
  }
</script>

<div class="relative overflow-hidden rounded-2xl select-none">
  <!-- Layer Belakang: Tombol Edit & Hapus saat Slide Kanan (muncul di sisi kiri) -->
  <div
    class="absolute inset-y-0 left-0 flex items-stretch w-[132px] bg-slate-100 rounded-l-2xl overflow-hidden"
  >
    <button
      type="button"
      onclick={(e) => {
        e.stopPropagation();
        onSwipeClose?.();
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
        onSwipeClose?.();
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
        onSwipeClose?.();
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
        onSwipeClose?.();
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

  <!-- Layer Depan: Kartu Transaksi -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    ontouchstart={handleTouchStart}
    ontouchmove={handleTouchMove}
    ontouchend={handleTouchEnd}
    ontouchcancel={handleTouchEnd}
    onclick={handleCardClick}
    style="transform: translateX({currentOffset}px);"
    class="relative z-10 bg-white active:bg-slate-50 border border-slate-200/90 rounded-2xl p-3.5 shadow-2xs cursor-pointer {isDragging
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
          class="text-sm font-extrabold tabular-nums {getAmountColor(tx.type)}"
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
            onSettleReimburse?.(tx.id);
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
        <span>✓ Reimburse Selesai (Diganti ke {reimburseFromName})</span>
      </div>
    {/if}
  </div>
</div>

