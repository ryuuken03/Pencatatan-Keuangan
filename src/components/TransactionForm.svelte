<script>
  import { untrack, onDestroy } from "svelte";
  import {
    evaluateNominalExpression,
    formatNumber,
    formatIDR,
    toDatetimeLocal,
  } from "../lib/utils.js";
  import { KOPDES_UNITS } from "../lib/db.js";
  import { compressReceiptImage } from "../lib/utils/imageCompressor.js";

  let {
    isOpen = false,
    initialData = null,
    activeWorkspace = "personal",
    allAccounts = [],
    allCategories = [],
    accountBalances = {},
    onSave,
    onClose,
    onOpenVoice,
    onOpenReceiptScanner,
  } = $props();

  let workspace_id = $state("personal");
  let type = $state("expense");
  let amountInput = $state("");
  let evaluatedAmount = $derived(evaluateNominalExpression(amountInput));
  let dateInput = $state(toDatetimeLocal());
  let account_id = $state("");
  let to_account_id = $state("");
  let category_id = $state("");
  let note = $state("");

  // Metadata Kopdes / Usaha
  let no_bukti = $state("");
  let unit_usaha = $state("");
  let pic_pihak = $state("");

  // Reimburse (Dana Talangan Pribadi untuk Kopdes/Usaha)
  let useReimburse = $state(false);
  let reimburse_status = $state("none");
  let reimburse_from_account_id = $state("");

  // Lampiran Struk WebP (< 80 KB)
  let attachment_blob = $state(null);
  let attachmentPreviewUrl = $state("");
  let attachmentSizeKB = $state(0);
  let isCompressingImg = $state(false);
  let directFileInputEl = $state(null);

  let errorMsg = $state("");
  let showAllCategories = $state(false);
  let categorySearch = $state("");

  function updateAttachmentPreview(blob) {
    if (attachmentPreviewUrl) {
      URL.revokeObjectURL(attachmentPreviewUrl);
      attachmentPreviewUrl = "";
    }
    attachment_blob = blob || null;
    if (blob) {
      attachmentPreviewUrl = URL.createObjectURL(blob);
      attachmentSizeKB = Math.round(((blob.size || 0) / 1024) * 10) / 10;
    } else {
      attachmentSizeKB = 0;
    }
  }

  onDestroy(() => {
    if (attachmentPreviewUrl) URL.revokeObjectURL(attachmentPreviewUrl);
  });

  async function handleDirectAttachmentChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    isCompressingImg = true;
    errorMsg = "";
    try {
      const comp = await compressReceiptImage(file, {
        maxDimension: 1000,
        initialQuality: 0.6,
        highContrast: false,
      });
      updateAttachmentPreview(comp.blob);
    } catch (err) {
      errorMsg = err?.message || "Gagal mengompres foto lampiran.";
    } finally {
      isCompressingImg = false;
      e.target.value = "";
    }
  }

  let headerBgCls = $derived(
    workspace_id === "business"
      ? "bg-teal-900"
      : workspace_id === "kopdes"
        ? "bg-emerald-900"
        : "bg-indigo-950",
  );

  let activePillCls = $derived(
    workspace_id === "business"
      ? "bg-teal-900 text-white border-teal-900 shadow-2xs"
      : workspace_id === "kopdes"
        ? "bg-emerald-900 text-white border-emerald-900 shadow-2xs"
        : "bg-indigo-950 text-white border-indigo-950 shadow-2xs",
  );

  // Filter akun & kategori sesuai workspace yang dipilih di form
  let workspaceAccounts = $derived(
    allAccounts.filter((a) => a.workspace_id === workspace_id),
  );

  let personalAccounts = $derived(
    allAccounts.filter((a) => a.workspace_id === "personal"),
  );

  let filteredCategories = $derived(
    allCategories.filter((c) => {
      if (c.workspace_id !== workspace_id) return false;
      if (type === "income" || type === "debt") return c.type === "income";
      if (type === "expense" || type === "receivable")
        return c.type === "expense";
      return false;
    }),
  );

  // Kategori yang ditampilkan di Quick Grid (maksimal 4 item pertama + item terpilih jika berada di luar 4 pertama)
  let quickCategories = $derived.by(() => {
    if (filteredCategories.length <= 4) return filteredCategories;
    const top4 = filteredCategories.slice(0, 4);
    const selected = filteredCategories.find((c) => c.id === category_id);
    if (selected && !top4.some((c) => c.id === selected.id)) {
      return [...top4.slice(0, 3), selected];
    }
    return top4;
  });

  let searchedCategories = $derived(
    categorySearch.trim() === ""
      ? filteredCategories
      : filteredCategories.filter((c) =>
          c.name.toLowerCase().includes(categorySearch.toLowerCase()),
        ),
  );

  // Inisialisasi ulang nilai HANYA saat modal dibuka (isOpen) atau initialData berubah
  // Gunakan untrack() agar perubahan state internal (seperti klik Tipe Transaksi atau ganti Buku Kas) tidak me-reset form kembali ke awal
  $effect(() => {
    const open = isOpen;
    const init = initialData;
    if (open) {
      untrack(() => {
        errorMsg = "";
        showAllCategories = false;
        categorySearch = "";
        if (init && init.id) {
          workspace_id = init.workspace_id || activeWorkspace;
          type = init.type || "expense";
          amountInput = formatNumber(init.amount || 0);
          dateInput = toDatetimeLocal(init.date);
          account_id = init.account_id || "";
          to_account_id = init.to_account_id || "";
          category_id = init.category_id || "";
          note = init.note || "";

          const meta = init.metadata || {};
          no_bukti = meta.no_bukti || "";
          unit_usaha = meta.unit_usaha || "";
          pic_pihak = meta.pic_pihak || "";
          reimburse_status = meta.reimburse_status || "none";
          useReimburse =
            reimburse_status === "pending" || reimburse_status === "settled";
          reimburse_from_account_id =
            meta.reimburse_from_account_id || (personalAccounts[0]?.id ?? "");
          updateAttachmentPreview(init.attachment_blob || null);
        } else {
          workspace_id = init?.workspace_id || activeWorkspace;
          type = init?.type || "expense";
          amountInput = init?.amount ? formatNumber(init.amount) : "";
          dateInput = toDatetimeLocal(init?.date);
          note = init?.note || "";
          no_bukti = init?.metadata?.no_bukti || "";
          unit_usaha =
            init?.metadata?.unit_usaha ||
            (workspace_id === "kopdes" ? KOPDES_UNITS[0] : "");
          pic_pihak = init?.metadata?.pic_pihak || "";
          reimburse_status = init?.metadata?.reimburse_status || "none";
          useReimburse =
            reimburse_status === "pending" || reimburse_status === "settled";

          const wsAccs = allAccounts.filter(
            (a) => a.workspace_id === workspace_id,
          );
          account_id =
            init?.account_id && wsAccs.some((a) => a.id === init.account_id)
              ? init.account_id
              : wsAccs[0]?.id || "";
          to_account_id = wsAccs[1]?.id || wsAccs[0]?.id || "";

          const pAccs = allAccounts.filter(
            (a) => a.workspace_id === "personal",
          );
          reimburse_from_account_id =
            init?.metadata?.reimburse_from_account_id || pAccs[0]?.id || "";

          const wsCats = allCategories.filter(
            (c) =>
              c.workspace_id === workspace_id &&
              c.type === (type === "income" || type === "debt" ? "income" : "expense"),
          );
          category_id =
            init?.category_id && wsCats.some((c) => c.id === init.category_id)
              ? init.category_id
              : wsCats[0]?.id || "";

          updateAttachmentPreview(init?.attachment_blob || null);
        }
      });
    }
  });

  function handleWorkspaceChange(newWs) {
    workspace_id = newWs;
    const wsAccs = allAccounts.filter((a) => a.workspace_id === newWs);
    account_id = wsAccs[0]?.id || "";
    to_account_id = wsAccs[1]?.id || wsAccs[0]?.id || "";

    const catType = type === "income" || type === "debt" ? "income" : "expense";
    const wsCats = allCategories.filter(
      (c) => c.workspace_id === newWs && c.type === catType,
    );
    category_id = wsCats[0]?.id || "";

    if (newWs === "personal") {
      useReimburse = false;
      reimburse_status = "none";
    } else if (newWs === "kopdes" && !unit_usaha) {
      unit_usaha = KOPDES_UNITS[0];
    }
  }

  function handleTypeChange(newType) {
    type = newType;
    const catType =
      newType === "income" || newType === "debt" ? "income" : "expense";
    const wsCats = allCategories.filter(
      (c) => c.workspace_id === workspace_id && c.type === catType,
    );
    if (!wsCats.some((c) => c.id === category_id)) {
      category_id = wsCats[0]?.id || "";
    }
    if (newType !== "expense") {
      useReimburse = false;
    }
  }

  let amountInputEl = $state(null);

  function handleAmountInput(e) {
    const raw = e.target.value;
    // Jika hanya angka dan titik (tanpa operator matematika), otomatis beri titik ribuan saat mengetik
    if (!/[+\-*/()a-zA-Z]/.test(raw)) {
      const digits = raw.replace(/\D/g, "");
      amountInput = digits ? formatNumber(parseInt(digits, 10)) : "";
    } else {
      amountInput = raw;
    }
  }

  function handleAmountBlur() {
    const val = evaluateNominalExpression(amountInput);
    if (val > 0) {
      amountInput = formatNumber(val);
    }
  }

  function handleAmountKeydown(e) {
    if (e.key === "Enter") {
      const hasOperator = /[+\-*/]/.test(amountInput);
      if (hasOperator) {
        e.preventDefault();
        handleAmountBlur();
      }
    }
  }

  function appendQuickMath(op) {
    const current = String(amountInput || "").trim();
    if (!current && ["+", "-", "*", "/"].includes(op)) return;
    // Cegah operator ganda berurutan (misal 25.000++ menjadi ganti operator terakhir)
    if (["+", "-", "*", "/"].includes(op) && /[+\-*/]$/.test(current)) {
      amountInput = current.slice(0, -1) + op;
    } else {
      const nextVal = current + op;
      if (!/[+\-*/()a-zA-Z]/.test(nextVal)) {
        const digits = nextVal.replace(/\D/g, "");
        amountInput = digits ? formatNumber(parseInt(digits, 10)) : "";
      } else {
        amountInput = nextVal;
      }
    }
    amountInputEl?.focus();
  }

  function addPresetAmount(addVal) {
    const currentVal = evaluateNominalExpression(amountInput);
    const nextVal = currentVal + addVal;
    amountInput = formatNumber(nextVal);
    amountInputEl?.focus();
  }

  function clearAmount() {
    amountInput = "";
    amountInputEl?.focus();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    errorMsg = "";

    const finalAmount = evaluateNominalExpression(amountInput);
    if (finalAmount <= 0) {
      errorMsg = "Nominal harus lebih dari Rp 0.";
      return;
    }
    if (!account_id) {
      errorMsg = "Pilih akun/dompet terlebih dahulu.";
      return;
    }
    if (type === "transfer") {
      if (!to_account_id || to_account_id === account_id) {
        errorMsg = "Pilih akun tujuan transfer yang berbeda dari akun asal.";
        return;
      }
    } else if (!category_id) {
      errorMsg = "Pilih kategori transaksi.";
      return;
    }

    const isReimburseActive =
      (workspace_id === "kopdes" || workspace_id === "business") &&
      type === "expense" &&
      useReimburse;

    if (isReimburseActive && !reimburse_from_account_id) {
      errorMsg = "Pilih dompet Pribadi yang menalangi transaksi ini.";
      return;
    }

    const finalReimburseStatus = isReimburseActive
      ? reimburse_status === "settled"
        ? "settled"
        : "pending"
      : "none";

    const payload = {
      id: initialData?.id || undefined,
      created_at: initialData?.created_at || undefined,
      workspace_id,
      type,
      amount: finalAmount,
      date: new Date(dateInput).toISOString(),
      account_id,
      to_account_id: type === "transfer" ? to_account_id : null,
      category_id: type === "transfer" ? null : category_id,
      note,
      metadata: {
        no_bukti:
          workspace_id === "kopdes" || workspace_id === "business"
            ? no_bukti.trim()
            : "",
        unit_usaha: workspace_id === "kopdes" ? unit_usaha : "",
        pic_pihak: pic_pihak.trim(),
        items: Array.isArray(initialData?.metadata?.items)
          ? initialData.metadata.items
          : [],
        reimburse_status: finalReimburseStatus,
        reimburse_from_account_id: isReimburseActive
          ? reimburse_from_account_id
          : null,
        reimburse_settled_at:
          finalReimburseStatus === "settled"
            ? initialData?.metadata?.reimburse_settled_at ||
              new Date().toISOString()
            : null,
      },
      attachment_blob: attachment_blob || null,
    };

    await onSave(payload);
  }
</script>

{#if isOpen}
  <div
    class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4 overflow-y-auto"
  >
    <div
      class="bg-white w-full max-w-xl rounded-t-2xl sm:rounded-2xl border border-slate-200 shadow-2xl overflow-hidden max-h-[95vh] flex flex-col"
    >
      <!-- Header Modal -->
      <div
        class="flex items-center justify-between px-4 py-3.5 {headerBgCls} text-white shrink-0"
      >
        <div class="flex items-center gap-2">
          <h2 class="text-sm font-extrabold tracking-wide uppercase">
            {initialData?.id ? "Edit Transaksi" : "Catat Transaksi"}
          </h2>
          {#if initialData && !initialData.id && initialData.amount}
            <span class="px-2 py-0.5 bg-white/20 rounded-md text-[10px] font-bold">
              ✓ Terisi Otomatis
            </span>
          {/if}
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

      <!-- Body Form -->
      <form
        onsubmit={handleSubmit}
        class="p-4 space-y-3.5 overflow-y-auto text-xs sm:text-sm"
      >
        {#if errorMsg}
          <div
            class="p-2.5 bg-rose-50 border border-rose-300 text-rose-800 rounded-xl text-xs font-bold"
          >
            {errorMsg}
          </div>
        {/if}

        <!-- Pintasan Smart Input (Suara & Foto Struk OCR) saat Buat Transaksi Baru -->
        {#if !initialData?.id && (onOpenVoice || onOpenReceiptScanner)}
          <div class="grid grid-cols-2 gap-2 p-2 bg-slate-100/90 border border-slate-200/90 rounded-2xl">
            {#if onOpenVoice}
              <button
                type="button"
                onclick={onOpenVoice}
                class="py-1.5 px-3 bg-white hover:bg-slate-50 border border-slate-200/90 rounded-xl text-xs font-extrabold text-slate-800 flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
              >
                <svg class="w-3.5 h-3.5 text-rose-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span>Isi via Suara</span>
              </button>
            {/if}
            {#if onOpenReceiptScanner}
              <button
                type="button"
                onclick={onOpenReceiptScanner}
                class="py-1.5 px-3 bg-white hover:bg-slate-50 border border-slate-200/90 rounded-xl text-xs font-extrabold text-slate-800 flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
              >
                <svg class="w-3.5 h-3.5 text-emerald-700 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                  <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" stroke-linecap="round" stroke-linejoin="round"/>
                  <circle cx="12" cy="13" r="3"/>
                </svg>
                <span>Scan Foto Struk</span>
              </button>
            {/if}
          </div>
        {/if}

        <!-- 1. Pilih Workspace & Tanggal -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <span
              class="block text-[11px] font-bold uppercase text-slate-500 mb-1"
              >Buku Kas (Workspace)</span
            >
            <div
              class="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200"
            >
              {#each [{ id: "personal", label: "Pribadi" }, { id: "business", label: "Usaha" }, { id: "kopdes", label: "Kopdes" }] as ws}
                <button
                  type="button"
                  onclick={() => handleWorkspaceChange(ws.id)}
                  class="py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer {workspace_id ===
                  ws.id
                    ? activePillCls
                    : 'text-slate-600 hover:text-slate-900'}"
                >
                  {ws.label}
                </button>
              {/each}
            </div>
          </div>

          <div>
            <label
              for="tx-date"
              class="block text-[11px] font-bold uppercase text-slate-500 mb-1"
              >Tanggal & Jam</label
            >
            <input
              id="tx-date"
              type="datetime-local"
              bind:value={dateInput}
              required
              class="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm font-medium tabular-nums focus:outline-none focus:border-slate-900"
            />
          </div>
        </div>

        <!-- 2. Tipe Transaksi -->
        <div>
          <span
            class="block text-[11px] font-bold uppercase text-slate-500 mb-1"
            >Tipe Transaksi</span
          >
          <div class="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
            {#each [{ id: "expense", label: "Pengeluaran", activeClass: "bg-rose-700 text-white border-rose-700 shadow-2xs" }, { id: "income", label: "Pemasukan", activeClass: "bg-emerald-700 text-white border-emerald-700 shadow-2xs" }, { id: "transfer", label: "Transfer", activeClass: "bg-sky-700 text-white border-sky-700 shadow-2xs" }, { id: "receivable", label: "Piutang/Kasbon", activeClass: "bg-amber-700 text-white border-amber-700 shadow-2xs" }, { id: "debt", label: "Utang Masuk", activeClass: "bg-purple-700 text-white border-purple-700 shadow-2xs" }] as t}
              <button
                type="button"
                onclick={() => handleTypeChange(t.id)}
                class="px-2 py-1.5 text-xs font-bold border rounded-xl text-center cursor-pointer transition-all {type ===
                t.id
                  ? t.activeClass
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}"
              >
                {t.label}
              </button>
            {/each}
          </div>
        </div>

        <!-- 3. Input Nominal + Kalkulator Mini (Responsif HP & Desktop) -->
        <div class="bg-slate-50 p-3 sm:p-3.5 rounded-2xl border border-slate-200/90 space-y-2">
          <div class="flex items-center justify-between gap-2">
            <label
              for="tx-amount"
              class="text-[11px] font-bold uppercase text-slate-500"
            >
              Nominal Transaksi
            </label>
            {#if /[+\-*/]/.test(amountInput)}
              <span class="px-2 py-0.5 bg-amber-100 text-amber-900 rounded-md text-xs font-extrabold tabular-nums">
                = {formatIDR(evaluatedAmount)}
              </span>
            {:else if evaluatedAmount > 0}
              <span class="text-xs font-extrabold text-slate-700 tabular-nums">
                {formatIDR(evaluatedAmount)}
              </span>
            {/if}
          </div>

          <!-- Field Input dengan Prefix Rp & Tombol Clear -->
          <div class="relative flex items-center">
            <span class="absolute left-3.5 text-sm sm:text-base font-extrabold text-slate-400 pointer-events-none select-none">
              Rp
            </span>
            <input
              bind:this={amountInputEl}
              id="tx-amount"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              placeholder="0"
              value={amountInput}
              oninput={handleAmountInput}
              onblur={handleAmountBlur}
              onkeydown={handleAmountKeydown}
              required
              class="w-full pl-10 pr-9 py-2.5 bg-white border border-slate-300 rounded-xl text-lg sm:text-xl font-extrabold tabular-nums text-slate-900 focus:outline-none focus:border-slate-900 shadow-2xs"
            />
            {#if amountInput}
              <button
                type="button"
                onclick={clearAmount}
                class="absolute right-2.5 p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
                aria-label="Hapus nominal"
                title="Reset nominal"
              >
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                  <circle cx="12" cy="12" r="10" class="fill-slate-100 stroke-slate-300"/>
                  <path d="m15 9-6 6M9 9l6 6" stroke-linecap="round"/>
                </svg>
              </button>
            {/if}
          </div>

          <!-- Baris 1: Tambah Cepat Pecahan Rupiah (Grid 4 Kolom) -->
          <div class="grid grid-cols-4 gap-1.5">
            {#each [
              { label: "+10rb", val: 10000 },
              { label: "+50rb", val: 50000 },
              { label: "+100rb", val: 100000 },
              { label: ".000", op: "000" }
            ] as item}
              <button
                type="button"
                onclick={() => (item.op ? appendQuickMath(item.op) : addPresetAmount(item.val))}
                class="py-1.5 bg-white hover:bg-slate-100 active:bg-slate-200 border border-slate-200/90 rounded-lg text-[11px] font-extrabold text-slate-700 tabular-nums cursor-pointer transition-colors"
              >
                {item.label}
              </button>
            {/each}
          </div>

          <!-- Baris 2: Operator Kalkulator (Grid 5 Kolom Proporsional di Mobile & Desktop) -->
          <div class="grid grid-cols-5 gap-1.5">
            {#each [
              { label: "+", op: "+" },
              { label: "−", op: "-" },
              { label: "×", op: "*" },
              { label: "÷", op: "/" }
            ] as calc}
              <button
                type="button"
                onclick={() => appendQuickMath(calc.op)}
                class="py-1.5 bg-white hover:bg-slate-100 active:bg-slate-200 border border-slate-300 rounded-lg text-sm font-extrabold text-slate-800 tabular-nums cursor-pointer transition-colors"
              >
                {calc.label}
              </button>
            {/each}
            <button
              type="button"
              onclick={handleAmountBlur}
              class="py-1.5 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white rounded-lg text-xs font-extrabold tabular-nums cursor-pointer transition-colors"
            >
              =
            </button>
          </div>
        </div>

        <!-- 4. Pilih Dompet Kas (Grid 2 Kolom Kompak & Rapi di Semua Layar) -->
        <div>
          <span
            class="block text-[11px] font-bold uppercase text-slate-500 mb-1"
          >
            {type === "transfer" ? "Dari Dompet Asal" : "Dompet Kas"}
          </span>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {#each workspaceAccounts as acc (acc.id)}
              <button
                type="button"
                onclick={() => (account_id = acc.id)}
                class="px-3 py-2 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between min-w-0 {account_id ===
                acc.id
                  ? activePillCls
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}"
              >
                <span class="text-xs font-extrabold truncate w-full">{acc.name}</span>
                <span class="text-[11px] opacity-85 tabular-nums font-semibold truncate w-full mt-0.5"
                  >{formatIDR(accountBalances[acc.id] ?? 0)}</span
                >
              </button>
            {/each}
          </div>
        </div>

        <!-- Jika Transfer: Pilih Akun Tujuan -->
        {#if type === "transfer"}
          <div>
            <span
              class="block text-[11px] font-bold uppercase text-slate-500 mb-1"
              >Ke Dompet Tujuan</span
            >
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {#each workspaceAccounts as acc (acc.id)}
                <button
                  type="button"
                  onclick={() => (to_account_id = acc.id)}
                  class="px-3 py-2 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between min-w-0 {to_account_id ===
                  acc.id
                    ? 'bg-sky-700 text-white border-sky-700 shadow-2xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}"
                >
                  <span class="text-xs font-extrabold truncate w-full">{acc.name}</span>
                  <span class="text-[11px] opacity-85 tabular-nums font-semibold truncate w-full mt-0.5"
                    >{formatIDR(accountBalances[acc.id] ?? 0)}</span
                  >
                </button>
              {/each}
            </div>
          </div>
        {/if}

        <!-- 5. Pilih Kategori (Quick Grid 2 Kolom + Expandable Search Picker jika banyak) -->
        {#if type !== "transfer"}
          <div>
            <div class="flex items-center justify-between mb-1">
              <span class="text-[11px] font-bold uppercase text-slate-500">
                Kategori ({filteredCategories.length})
              </span>
              {#if filteredCategories.length > 4}
                <button
                  type="button"
                  onclick={() => {
                    showAllCategories = !showAllCategories;
                    if (!showAllCategories) categorySearch = "";
                  }}
                  class="text-[11px] font-extrabold text-indigo-700 hover:text-indigo-900 cursor-pointer"
                >
                  {showAllCategories ? "Tutup Daftar ▲" : `Lihat Semua (${filteredCategories.length}) ▼`}
                </button>
              {/if}
            </div>

            {#if !showAllCategories}
              <!-- Mode Ringkas: Maksimal 4 Kategori (Grid 2 Kolom) -->
              <div class="grid grid-cols-2 gap-1.5">
                {#each quickCategories as cat (cat.id)}
                  <button
                    type="button"
                    onclick={() => (category_id = cat.id)}
                    title={cat.name}
                    class="px-3 py-2 rounded-xl border text-xs font-bold text-left truncate cursor-pointer transition-all {category_id ===
                    cat.id
                      ? activePillCls
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}"
                  >
                    {cat.name}
                  </button>
                {/each}
              </div>
              {#if filteredCategories.length > 4}
                <button
                  type="button"
                  onclick={() => (showAllCategories = true)}
                  class="mt-1.5 w-full py-1.5 bg-slate-100 hover:bg-slate-200/80 border border-slate-200/90 rounded-xl text-[11px] font-bold text-slate-600 cursor-pointer transition-colors"
                >
                  + Pilih / Cari dari {filteredCategories.length - 4} kategori lainnya...
                </button>
              {/if}
            {:else}
              <!-- Mode Semua Kategori + Kolom Pencarian Cepat (Scrollable Max Height) -->
              <div class="p-2.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                {#if filteredCategories.length > 6}
                  <input
                    type="search"
                    placeholder="Cari nama kategori..."
                    bind:value={categorySearch}
                    class="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:border-slate-900"
                  />
                {/if}
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-44 overflow-y-auto pr-0.5">
                  {#each searchedCategories as cat (cat.id)}
                    <button
                      type="button"
                      onclick={() => {
                        category_id = cat.id;
                        showAllCategories = false;
                        categorySearch = "";
                      }}
                      class="px-3 py-2 rounded-xl border text-xs font-bold text-left cursor-pointer transition-all flex items-center justify-between gap-2 {category_id ===
                      cat.id
                        ? activePillCls
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'}"
                    >
                      <span class="truncate">{cat.name}</span>
                      {#if category_id === cat.id}
                        <span class="text-[10px] shrink-0">✓</span>
                      {/if}
                    </button>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        {/if}

        <!-- 6. Opsi Dana Talangan / Reimburse -->
        {#if (workspace_id === "kopdes" || workspace_id === "business") && type === "expense"}
          <div
            class="p-3.5 rounded-2xl border {useReimburse
              ? 'bg-amber-50/90 border-amber-300'
              : 'bg-slate-50 border-slate-200'}"
          >
            <label class="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                bind:checked={useReimburse}
                onchange={() => {
                  if (useReimburse && reimburse_status === "none") {
                    reimburse_status = "pending";
                  }
                }}
                class="w-4 h-4 accent-amber-700 rounded cursor-pointer"
              />
              <span class="text-xs font-extrabold text-slate-900">
                Dibayar pakai Dana Talangan (Uang Pribadi / Reimburse)
              </span>
            </label>

            {#if useReimburse}
              <div class="mt-2.5 pt-2.5 border-t border-amber-200 space-y-2.5">
                <div>
                  <span
                    class="block text-[11px] font-bold uppercase text-amber-900 mb-1"
                  >
                    Pilih Dompet Pribadi yang Menalangi:
                  </span>
                  <div class="flex flex-wrap gap-1.5">
                    {#each personalAccounts as pAcc (pAcc.id)}
                      <button
                        type="button"
                        onclick={() => (reimburse_from_account_id = pAcc.id)}
                        class="px-2.5 py-1 rounded-lg border text-xs font-bold cursor-pointer {reimburse_from_account_id ===
                        pAcc.id
                          ? 'bg-amber-800 text-white border-amber-800'
                          : 'bg-white text-slate-800 border-amber-300 hover:bg-amber-100'}"
                      >
                        {pAcc.name} ({formatIDR(accountBalances[pAcc.id] ?? 0)})
                      </button>
                    {/each}
                  </div>
                </div>

                <div
                  class="flex items-center justify-between text-[11px] text-amber-900 bg-amber-100/70 px-3 py-1.5 rounded-xl"
                >
                  <span class="font-semibold">Status Penggantian:</span>
                  <div class="inline-flex gap-1">
                    <button
                      type="button"
                      onclick={() => (reimburse_status = "pending")}
                      class="px-2.5 py-0.5 rounded-lg font-bold cursor-pointer {reimburse_status !==
                      'settled'
                        ? 'bg-amber-700 text-white'
                        : 'text-amber-900 hover:bg-amber-200'}"
                    >
                      Belum Diganti
                    </button>
                    <button
                      type="button"
                      onclick={() => (reimburse_status = "settled")}
                      class="px-2.5 py-0.5 rounded-lg font-bold cursor-pointer {reimburse_status ===
                      'settled'
                        ? 'bg-emerald-700 text-white'
                        : 'text-amber-900 hover:bg-amber-200'}"
                    >
                      Sudah Diganti
                    </button>
                  </div>
                </div>
              </div>
            {/if}
          </div>
        {/if}

        <!-- 7. Atribut Khusus Kopdes -->
        {#if workspace_id === "kopdes"}
          <div
            class="p-3.5 bg-emerald-50/40 border border-emerald-200/80 rounded-2xl space-y-2.5"
          >
            <div
              class="text-[11px] font-extrabold uppercase tracking-wider text-emerald-900"
            >
              Atribut Manajerial Kopdes
            </div>
            <div>
              <span class="block text-[11px] font-bold text-slate-600 mb-1"
                >Unit Usaha</span
              >
              <div class="grid grid-cols-2 gap-1.5">
                {#each KOPDES_UNITS as unit}
                  <button
                    type="button"
                    onclick={() => (unit_usaha = unit)}
                    title={unit}
                    class="px-2.5 py-1.5 rounded-lg border text-xs font-semibold text-left truncate cursor-pointer {unit_usaha ===
                    unit
                      ? 'bg-emerald-900 text-white border-emerald-900'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'}"
                  >
                    {unit}
                  </button>
                {/each}
              </div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label
                  for="tx-nobukti"
                  class="block text-[11px] font-bold text-slate-600 mb-1"
                >
                  No. Bukti (BKM / BKK / Nota)
                </label>
                <input
                  id="tx-nobukti"
                  type="text"
                  placeholder="Contoh: BKK-2026/11/001"
                  bind:value={no_bukti}
                  class="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:border-emerald-800"
                />
              </div>
              <div>
                <label
                  for="tx-pic"
                  class="block text-[11px] font-bold text-slate-600 mb-1"
                >
                  Pihak Terkait (Anggota / Staf / Vendor)
                </label>
                <input
                  id="tx-pic"
                  type="text"
                  placeholder="Nama staf / suplier / anggota"
                  bind:value={pic_pihak}
                  class="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:border-emerald-800"
                />
              </div>
            </div>
          </div>
        {:else if workspace_id === "business"}
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label
                for="tx-nobukti-biz"
                class="block text-[11px] font-bold uppercase text-slate-500 mb-1"
              >
                No. Nota / Invoice (Opsional)
              </label>
              <input
                id="tx-nobukti-biz"
                type="text"
                placeholder="INV-001"
                bind:value={no_bukti}
                class="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:border-teal-800"
              />
            </div>
            <div>
              <label
                for="tx-pic-biz"
                class="block text-[11px] font-bold uppercase text-slate-500 mb-1"
              >
                Pelanggan / Suplier (Opsional)
              </label>
              <input
                id="tx-pic-biz"
                type="text"
                placeholder="Nama pelanggan / vendor"
                bind:value={pic_pihak}
                class="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:border-teal-800"
              />
            </div>
          </div>
        {/if}

        <!-- 8. Catatan -->
        <div>
          <label
            for="tx-note"
            class="block text-[11px] font-bold uppercase text-slate-500 mb-1"
          >
            Catatan / Keterangan
          </label>
          <input
            id="tx-note"
            type="text"
            placeholder="Keterangan singkat transaksi..."
            bind:value={note}
            class="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm focus:outline-none focus:border-slate-900"
          />
        </div>

        <!-- 9. Lampiran Foto Nota / Struk (WebP < 80 KB) -->
        <div class="p-3 bg-slate-50 border border-slate-200/90 rounded-2xl">
          <input
            bind:this={directFileInputEl}
            type="file"
            accept="image/*"
            onchange={handleDirectAttachmentChange}
            class="hidden"
          />
          <div class="flex items-center justify-between gap-2">
            <div>
              <span class="block text-[11px] font-bold uppercase text-slate-500">
                Lampiran Foto Nota / Struk
              </span>
              <span class="text-[10px] text-slate-400">
                {#if attachment_blob}
                  Terkompresi otomatis ke format WebP ({attachmentSizeKB} KB &lt; 80 KB)
                {:else}
                  Opsional • Otomatis dikompres ke WebP &lt; 80 KB
                {/if}
              </span>
            </div>

            <div class="flex items-center gap-1.5">
              {#if attachment_blob}
                <button
                  type="button"
                  onclick={() => updateAttachmentPreview(null)}
                  class="px-2.5 py-1 text-[11px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg cursor-pointer"
                >
                  Hapus Foto
                </button>
              {/if}
              <button
                type="button"
                onclick={() => directFileInputEl?.click()}
                class="px-2.5 py-1 text-[11px] font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg cursor-pointer"
              >
                {isCompressingImg
                  ? "Mengompres..."
                  : attachment_blob
                    ? "Ganti Foto"
                    : "+ Lampirkan Foto"}
              </button>
            </div>
          </div>

          {#if attachmentPreviewUrl}
            <div class="mt-2.5 pt-2.5 border-t border-slate-200/80 flex items-center gap-3">
              <img
                src={attachmentPreviewUrl}
                alt="Lampiran Struk"
                class="w-16 h-16 object-cover rounded-lg border border-slate-300 bg-white shrink-0"
              />
              <div class="text-xs text-slate-700 min-w-0">
                <div class="font-extrabold text-emerald-800 tabular-nums">
                  ✓ Lampiran Struk Siap Disimpan ({attachmentSizeKB} KB)
                </div>
                <p class="text-[11px] text-slate-500 mt-0.5">
                  Foto struk akan tersimpan di database lokal dan dapat dilihat kembali di daftar transaksi.
                </p>
              </div>
            </div>
          {/if}
        </div>

        <!-- Footer Aksi -->
        <div
          class="flex items-center justify-end gap-2 pt-3 border-t border-slate-200"
        >
          <button
            type="button"
            onclick={onClose}
            class="px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 cursor-pointer"
          >
            Batal
          </button>
          <button
            type="submit"
            class="px-5 py-2 text-xs font-extrabold text-white rounded-xl cursor-pointer {activePillCls}"
          >
            Simpan Transaksi
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
