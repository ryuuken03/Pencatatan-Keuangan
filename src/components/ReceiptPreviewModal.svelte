<script>
  import { onDestroy } from "svelte";
  import {
    formatIDR,
    formatDateShort,
    getWorkspaceTheme
  } from "../lib/utils.js";

  let {
    isOpen = false,
    workspaces = [],
    transaction = null,
    accountsMap = {},
    categoriesMap = {},
    onEdit,
    onDelete,
    onSettleReimburse,
    onClose,
  } = $props();

  let blobUrl = $state("");
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
        blobUrl = "";
      }
      blobSizeKB = 0;
    }
  });

  onDestroy(() => {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  });

  let effectiveWorkspaces = $derived(
    workspaces && workspaces.length > 0
      ? workspaces
      : [{ id: "personal", name: "Buku Pribadi", type: "personal" }]
  );

  let headerBgCls = $derived(
    getWorkspaceTheme(transaction?.workspace_id, effectiveWorkspaces).heroBg
  );

  let txItems = $derived(
    Array.isArray(transaction?.items) && transaction.items.length > 0
      ? transaction.items
      : Array.isArray(transaction?.metadata?.items)
        ? transaction.metadata.items
        : [],
  );

  function getTypeBadge(type) {
    switch (type) {
      case "income":
        return {
          label: "PEMASUKAN",
          cls: "bg-emerald-100/90 text-emerald-800 border-emerald-200",
        };
      case "expense":
        return {
          label: "PENGELUARAN",
          cls: "bg-rose-100/90 text-rose-800 border-rose-200",
        };
      case "transfer":
        return {
          label: "TRANSFER",
          cls: "bg-sky-100/90 text-sky-800 border-sky-200",
        };
      case "receivable":
        return {
          label: "PIUTANG / KASBON",
          cls: "bg-amber-100/90 text-amber-800 border-amber-200",
        };
      case "debt":
        return {
          label: "UTANG MASUK",
          cls: "bg-purple-100/90 text-purple-800 border-purple-200",
        };
      default:
        return {
          label: type || "TRANSAKSI",
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

  function downloadReceipt() {
    if (!blobUrl || !transaction) return;
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `struk-${transaction.metadata?.no_bukti || transaction.id.slice(0, 8)}.webp`;
    a.click();
  }
</script>

{#if isOpen && transaction}
  {@const badge = getTypeBadge(transaction.type)}
  {@const accName = accountsMap[transaction.account_id]?.name || "-"}
  {@const toAccName = transaction.to_account_id
    ? accountsMap[transaction.to_account_id]?.name
    : null}
  {@const catName =
    transaction.type === "transfer"
      ? `Transfer ke ${toAccName || "-"}`
      : categoriesMap[transaction.category_id]?.name || "Tanpa Kategori"}
  {@const reimburseFromName = transaction.metadata?.reimburse_from_account_id
    ? accountsMap[transaction.metadata.reimburse_from_account_id]?.name
    : "Dompet Pribadi"}

  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    onclick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}
    class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/70 backdrop-blur-xs p-0 sm:p-4 overflow-y-auto"
  >
    <div
      class="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl border border-slate-200 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
    >
      <!-- Header -->
      <div
        class="flex items-center justify-between px-4 py-3.5 {headerBgCls} text-white shrink-0"
      >
        <div class="flex items-center gap-2">
          <svg
            class="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
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
          <h2 class="text-sm font-extrabold tracking-wide uppercase">
            Detail Transaksi
          </h2>
        </div>
        <button
          type="button"
          onclick={onClose}
          class="p-1 text-white/70 hover:text-white cursor-pointer"
          aria-label="Tutup"
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

      <!-- Body -->
      <div class="p-4 space-y-3.5 overflow-y-auto text-xs sm:text-sm">
        <!-- Ringkasan Transaksi -->
        <div
          class="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 space-y-1">
              <span
                class="inline-block px-2 py-0.5 text-[10px] font-extrabold border rounded-md {badge.cls}"
              >
                {badge.label}
              </span>
              <div class="text-sm font-extrabold text-slate-900">
                {catName}
              </div>
            </div>

            <div class="text-right shrink-0">
              <div
                class="text-base sm:text-lg font-extrabold tabular-nums {getAmountColor(
                  transaction.type,
                )}"
              >
                {getAmountPrefix(transaction.type)}{formatIDR(
                  transaction.amount,
                )}
              </div>
              {#if blobSizeKB > 0}
                <span
                  class="inline-block mt-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-md text-[10px] font-extrabold tabular-nums"
                >
                  Struk WebP • {blobSizeKB} KB
                </span>
              {/if}
            </div>
          </div>

          {#if transaction.note}
            <div
              class="pt-2 border-t border-slate-200/80 text-xs text-slate-800 font-medium break-words"
            >
              {transaction.note}
            </div>
          {/if}

          <!-- Grid Info Tanggal, Dompet, dan Metadata -->
          <div
            class="pt-2 border-t border-slate-200/80 grid grid-cols-2 gap-2 text-[11px]"
          >
            <div>
              <span class="text-slate-400 font-semibold block">Waktu</span>
              <span class="text-slate-700 font-bold tabular-nums"
                >{formatDateShort(transaction.date)}</span
              >
            </div>
            <div>
              <span class="text-slate-400 font-semibold block"
                >Dompet / Akun</span
              >
              <span class="text-slate-800 font-bold">
                {accName}{toAccName ? ` → ${toAccName}` : ""}
              </span>
            </div>

            {#if transaction.metadata?.unit_usaha}
              <div>
                <span class="text-slate-400 font-semibold block"
                  >Unit Usaha</span
                >
                <span class="text-slate-800 font-bold"
                  >{transaction.metadata.unit_usaha}</span
                >
              </div>
            {/if}

            {#if transaction.metadata?.no_bukti}
              <div>
                <span class="text-slate-400 font-semibold block"
                  >No. Bukti / Nota</span
                >
                <span class="text-slate-800 font-bold tabular-nums"
                  >#{transaction.metadata.no_bukti}</span
                >
              </div>
            {/if}

            {#if transaction.metadata?.pic_pihak}
              <div class="col-span-2">
                <span class="text-slate-400 font-semibold block"
                  >PIC / Pihak Terkait</span
                >
                <span class="text-slate-800 font-bold"
                  >{transaction.metadata.pic_pihak}</span
                >
              </div>
            {/if}
          </div>

          <!-- Status Reimburse / Dana Talangan -->
          {#if transaction.metadata?.reimburse_status === "pending"}
            <div
              class="pt-2 border-t border-amber-200/80 flex items-center justify-between gap-2 bg-amber-50 px-3 py-2 rounded-xl"
            >
              <span class="text-[11px] font-medium text-amber-900">
                Belum Diganti • Ditalangi: <strong class="font-bold"
                  >{reimburseFromName}</strong
                >
              </span>
              {#if onSettleReimburse}
                <button
                  type="button"
                  onclick={() => onSettleReimburse(transaction.id)}
                  class="px-2.5 py-1 bg-amber-700 text-white text-[11px] font-bold rounded-lg hover:bg-amber-800 shrink-0 cursor-pointer shadow-2xs"
                >
                  Tandai Diganti
                </button>
              {/if}
            </div>
          {:else if transaction.metadata?.reimburse_status === "settled"}
            <div
              class="pt-2 border-t border-slate-200/80 text-[11px] text-emerald-700 font-bold"
            >
              ✓ Reimburse Selesai (Sudah diganti ke {reimburseFromName})
            </div>
          {/if}
        </div>

        <!-- Daftar Rincian Produk (Tabel `transaction_items`) -->
        {#if txItems.length > 0}
          <div
            class="bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden"
          >
            <div
              class="px-3.5 py-2 bg-slate-100 border-b border-slate-200 text-[11px] font-extrabold uppercase text-slate-600 flex items-center justify-between"
            >
              <span>Rincian Produk ({txItems.length} item)</span>
            </div>
            <div class="divide-y divide-slate-200/70">
              {#each txItems as item (item.id || item.name)}
                <div
                  class="px-3.5 py-2 flex items-center justify-between text-xs"
                >
                  <span class="font-semibold text-slate-800">{item.name}</span>
                  <span class="font-extrabold tabular-nums text-slate-900"
                    >{formatIDR(item.amount)}</span
                  >
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Gambar Lampiran Struk -->
        {#if blobUrl}
          <div
            class="bg-slate-900/5 border border-slate-200 rounded-2xl p-3 flex flex-col items-center justify-center gap-2"
          >
            <img
              src={blobUrl}
              alt="Foto Nota / Struk"
              class="max-h-[50vh] w-auto object-contain rounded-xl border border-slate-300 bg-white shadow-sm"
            />
            <button
              type="button"
              onclick={downloadReceipt}
              class="px-3 py-1.5 text-[11px] font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl cursor-pointer inline-flex items-center gap-1.5 shadow-2xs"
            >
              <svg
                class="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              <span>Unduh Foto Struk ({blobSizeKB} KB)</span>
            </button>
          </div>
        {/if}

        <!-- Footer Aksi: Hapus, Edit, Tutup -->
        <div
          class="flex items-center justify-between gap-2 pt-3 border-t border-slate-200"
        >
          {#if onDelete}
            <button
              type="button"
              onclick={async () => {
                await onDelete(transaction.id);
              }}
              class="px-3.5 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl cursor-pointer inline-flex items-center gap-1.5 transition-colors"
            >
              <svg
                class="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              <span>Hapus</span>
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
                class="px-3.5 py-2 text-xs font-bold text-slate-800 bg-white border border-slate-300 rounded-xl hover:bg-slate-100 cursor-pointer inline-flex items-center gap-1.5 transition-colors"
              >
                <svg
                  class="w-3.5 h-3.5"
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
