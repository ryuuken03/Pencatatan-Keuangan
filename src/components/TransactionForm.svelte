<script>
  import { untrack, onDestroy } from "svelte";
  import {
    evaluateNominalExpression,
    formatNumber,
    formatIDR,
    toDatetimeLocal,
    getWorkspaceName,
    getWorkspaceTheme,
    getWorkspaceType
  } from "../lib/utils.js";
  import { KOPDES_UNITS } from "../lib/db.js";
  import { compressReceiptImage } from "../lib/utils/imageCompressor.js";

  let {
    isOpen = false,
    initialData = null,
    workspaces = [],
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

  // Rincian Produk / Item Opsional (Tabel `transaction_items`)
  let txItems = $state([]);
  let itemsSubtotal = $derived(
    txItems.reduce((acc, it) => acc + (Math.round(Number(it.amount)) || 0), 0),
  );

  let errorMsg = $state("");
  let showAllCategories = $state(false);
  let categorySearch = $state("");
  let mobileStep = $state(1); // 1 = Slide Utama, 2 = Slide Rincian & Struk (Mobile < 768px)
  let showCalcPad = $state(false);

  // Indikator jumlah rincian opsional yang terisi di Slide 2 / Kolom Kanan
  let detailFilledCount = $derived(
    (txItems.length > 0 ? 1 : 0) +
      (attachment_blob ? 1 : 0) +
      (useReimburse ? 1 : 0) +
      (no_bukti.trim() || pic_pihak.trim() ? 1 : 0),
  );

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

  let effectiveWorkspaces = $derived(
    workspaces && workspaces.length > 0
      ? workspaces
      : [{ id: "personal", name: "Buku Pribadi", type: "personal" }]
  );

  let currentWsTheme = $derived(
    getWorkspaceTheme(workspace_id, effectiveWorkspaces)
  );

  let headerBgCls = $derived(currentWsTheme.heroBg);
  let activePillCls = $derived(currentWsTheme.primaryBtn);

  let isPekerjaanWorkspace = $derived(
    getWorkspaceType(workspace_id, effectiveWorkspaces) === "pekerjaan" ||
      workspace_id === "kopdes" ||
      workspace_id === "pekerjaan"
  );

  let isNonPersonal = $derived(
    workspace_id !== "personal"
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
        mobileStep = 1;
        showCalcPad = false;
        const sourceItems = Array.isArray(init?.items)
          ? init.items
          : Array.isArray(init?.metadata?.items)
            ? init.metadata.items
            : [];
        txItems = sourceItems.map((it, idx) => {
          const amt = Math.round(Number(it?.amount) || 0);
          return {
            id: String(it?.id || `item-${idx + 1}`),
            name: String(it?.name || ""),
            amount: amt,
            amountInput: amt > 0 ? formatNumber(amt) : "",
          };
        });

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
              c.type ===
                (type === "income" || type === "debt" ? "income" : "expense"),
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

  function addTxItem() {
    txItems = [
      ...txItems,
      {
        id: `item-${Date.now()}-${txItems.length + 1}`,
        name: "",
        amount: 0,
        amountInput: "",
      },
    ];
  }

  function removeTxItem(index) {
    txItems = txItems.filter((_, i) => i !== index);
    const nextSubtotal = txItems.reduce(
      (acc, it) => acc + (Math.round(Number(it.amount)) || 0),
      0,
    );
    if (nextSubtotal > 0) {
      amountInput = formatNumber(nextSubtotal);
    }
  }

  function clearAllTxItems() {
    txItems = [];
  }

  function handleItemAmountInput(index, e) {
    const digits = String(e.target.value || "").replace(/\D/g, "");
    const num = digits ? parseInt(digits, 10) : 0;
    txItems[index].amount = num;
    txItems[index].amountInput = num > 0 ? formatNumber(num) : "";

    const nextSubtotal = txItems.reduce(
      (acc, it) => acc + (Math.round(Number(it.amount)) || 0),
      0,
    );
    if (nextSubtotal > 0) {
      amountInput = formatNumber(nextSubtotal);
    }
  }

  function syncAmountFromItems() {
    if (itemsSubtotal > 0) {
      amountInput = formatNumber(itemsSubtotal);
    }
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
      isNonPersonal &&
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

    const cleanedItems = txItems
      .map((it) => ({
        id: it?.id ? String(it.id) : undefined,
        name: String(it?.name || "").trim(),
        amount: Math.round(Number(it?.amount) || 0),
      }))
      .filter((it) => it.name !== "" || it.amount > 0);

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
      items: cleanedItems,
      metadata: {
        no_bukti: isNonPersonal ? no_bukti.trim() : "",
        unit_usaha: isPekerjaanWorkspace ? unit_usaha : "",
        pic_pihak: pic_pihak.trim(),
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
      class="bg-white w-full max-w-xl md:max-w-4xl rounded-t-2xl sm:rounded-2xl border border-slate-200 shadow-2xl overflow-hidden max-h-[95vh] flex flex-col"
    >
      <!-- Header Modal -->
      <div
        class="flex items-center justify-between px-4 py-3 {headerBgCls} text-white shrink-0"
      >
        <div class="flex items-center gap-2">
          <h2 class="text-sm font-extrabold tracking-wide uppercase">
            {initialData?.id ? "Edit Transaksi" : "Catat Transaksi"}
          </h2>
          {#if initialData && !initialData.id && initialData.amount}
            <span
              class="px-2 py-0.5 bg-white/20 rounded-md text-[10px] font-bold"
            >
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

      <!-- Navigasi Slide 1 & Slide 2 (Khusus Mobile < 768px) -->
      <div
        class="md:hidden bg-slate-100 border-b border-slate-200 px-3.5 py-2 shrink-0"
      >
        <div class="grid grid-cols-2 gap-1.5 bg-slate-200/80 p-1 rounded-xl">
          <button
            type="button"
            onclick={() => (mobileStep = 1)}
            class="py-1.5 px-2.5 rounded-lg text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 cursor-pointer {mobileStep ===
            1
              ? 'bg-white text-slate-900 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'}"
          >
            <span>1. Inti Transaksi</span>
          </button>
          <button
            type="button"
            onclick={() => (mobileStep = 2)}
            class="py-1.5 px-2.5 rounded-lg text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 cursor-pointer {mobileStep ===
            2
              ? 'bg-white text-slate-900 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'}"
          >
            <span>2. Rincian & Struk</span>
            {#if detailFilledCount > 0}
              <span
                class="px-1.5 py-0.2 bg-emerald-600 text-white rounded-full text-[10px] font-extrabold tabular-nums"
              >
                {detailFilledCount}
              </span>
            {/if}
          </button>
        </div>
      </div>

      <!-- Body Form: Mobile 2-Slide | Desktop 2-Kolom Berdampingan -->
      <form
        onsubmit={handleSubmit}
        class="flex-1 flex flex-col min-h-0 text-xs sm:text-sm"
      >
        <div class="flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-3.5">
          {#if errorMsg}
            <div
              class="p-2.5 bg-rose-50 border border-rose-300 text-rose-800 rounded-xl text-xs font-bold"
            >
              {errorMsg}
            </div>
          {/if}

          <!-- Pintasan Smart Input (Suara & Foto Struk OCR) saat Buat Transaksi Baru -->
          {#if !initialData?.id && (onOpenVoice || onOpenReceiptScanner)}
            <div
              class="{mobileStep === 2
                ? 'hidden md:grid'
                : 'grid'} grid-cols-2 gap-2 p-2 bg-slate-100/90 border border-slate-200/90 rounded-2xl"
            >
              {#if onOpenVoice}
                <button
                  type="button"
                  onclick={onOpenVoice}
                  class="py-1.5 px-3 bg-white hover:bg-slate-50 border border-slate-200/90 rounded-xl text-xs font-extrabold text-slate-800 flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                >
                  <svg
                    class="w-3.5 h-3.5 text-rose-600 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.2"
                  >
                    <path
                      d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                    <path
                      d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
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
                  <svg
                    class="w-3.5 h-3.5 text-emerald-700 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.2"
                  >
                    <path
                      d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                    <circle cx="12" cy="13" r="3" />
                  </svg>
                  <span>Scan Foto Struk</span>
                </button>
              {/if}
            </div>
          {/if}

          <div class="md:grid md:grid-cols-12 md:gap-5 items-start">
            <!-- ========================================================================= -->
            <!-- SLIDE 1 (MOBILE) / KOLOM KIRI (DESKTOP): INTI TRANSAKSI (WAJIB & CEPAT)   -->
            <!-- ========================================================================= -->
            <div
              class="{mobileStep === 1
                ? 'block'
                : 'hidden md:block'} md:col-span-7 space-y-3"
            >
              <!-- 1. Pilih Buku Kas & Tipe Transaksi -->
              <div class="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                <div class="sm:col-span-5">
                  <span
                    class="block text-[11px] font-bold uppercase text-slate-500 mb-1"
                  >
                    Buku Kas
                  </span>
                  <div
                    class="flex flex-wrap gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200"
                  >
                    {#each effectiveWorkspaces as ws (ws.id)}
                      {@const wsTheme = getWorkspaceTheme(ws.id, effectiveWorkspaces)}
                      <button
                        type="button"
                        onclick={() => handleWorkspaceChange(ws.id)}
                        class="flex-1 min-w-[70px] py-1 px-2 text-xs font-bold rounded-lg transition-colors cursor-pointer truncate {workspace_id ===
                        ws.id
                          ? wsTheme.activeTabCls
                          : 'text-slate-600 hover:text-slate-900'}"
                      >
                        {ws.name || getWorkspaceName(ws.id, effectiveWorkspaces)}
                      </button>
                    {/each}
                  </div>
                </div>

                <div class="sm:col-span-7">
                  <span
                    class="block text-[11px] font-bold uppercase text-slate-500 mb-1"
                  >
                    Tipe Transaksi
                  </span>
                  <div class="grid grid-cols-3 sm:grid-cols-5 gap-1">
                    {#each [{ id: "expense", label: "Keluar", activeClass: "bg-rose-700 text-white border-rose-700 shadow-2xs" }, { id: "income", label: "Masuk", activeClass: "bg-emerald-700 text-white border-emerald-700 shadow-2xs" }, { id: "transfer", label: "Transfer", activeClass: "bg-sky-700 text-white border-sky-700 shadow-2xs" }, { id: "receivable", label: "Piutang", activeClass: "bg-amber-700 text-white border-amber-700 shadow-2xs" }, { id: "debt", label: "Utang", activeClass: "bg-purple-700 text-white border-purple-700 shadow-2xs" }] as t}
                      <button
                        type="button"
                        onclick={() => handleTypeChange(t.id)}
                        class="px-1.5 py-1.5 text-[11px] font-bold border rounded-xl text-center cursor-pointer transition-all {type ===
                        t.id
                          ? t.activeClass
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}"
                      >
                        {t.label}
                      </button>
                    {/each}
                  </div>
                </div>
              </div>

              <!-- 2. Input Nominal + Kalkulator Pintar (Hemat Ruang di Mobile) -->
              <div
                class="bg-slate-50 p-3 rounded-2xl border border-slate-200/90 space-y-2"
              >
                <div class="flex items-center justify-between gap-2">
                  <label
                    for="tx-amount"
                    class="text-[11px] font-bold uppercase text-slate-500"
                  >
                    Nominal Transaksi
                  </label>
                  <div class="flex items-center gap-2">
                    {#if /[+\-*/]/.test(amountInput)}
                      <span
                        class="px-2 py-0.5 bg-amber-100 text-amber-900 rounded-md text-xs font-extrabold tabular-nums"
                      >
                        = {formatIDR(evaluatedAmount)}
                      </span>
                    {:else if evaluatedAmount > 0}
                      <span
                        class="text-xs font-extrabold text-slate-700 tabular-nums"
                      >
                        {formatIDR(evaluatedAmount)}
                      </span>
                    {/if}
                    <button
                      type="button"
                      onclick={() => (showCalcPad = !showCalcPad)}
                      class="md:hidden px-2 py-0.5 bg-white border border-slate-300 rounded-lg text-[10px] font-bold text-slate-700 cursor-pointer"
                    >
                      {showCalcPad ? "Tutup Kalkulator ▲" : "🧮 Kalkulator ▼"}
                    </button>
                  </div>
                </div>

                <!-- Field Input dengan Prefix Rp & Tombol Clear -->
                <div class="relative flex items-center">
                  <span
                    class="absolute left-3.5 text-sm sm:text-base font-extrabold text-slate-400 pointer-events-none select-none"
                  >
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
                    onfocus={() => (showCalcPad = true)}
                    oninput={handleAmountInput}
                    onblur={handleAmountBlur}
                    onkeydown={handleAmountKeydown}
                    required
                    class="w-full pl-10 pr-9 py-2 bg-white border border-slate-300 rounded-xl text-lg sm:text-xl font-extrabold tabular-nums text-slate-900 focus:outline-none focus:border-slate-900 shadow-2xs"
                  />
                  {#if amountInput}
                    <button
                      type="button"
                      onclick={clearAmount}
                      class="absolute right-2.5 p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
                      aria-label="Hapus nominal"
                      title="Reset nominal"
                    >
                      <svg
                        class="w-4 h-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.2"
                      >
                        <circle
                          cx="12"
                          cy="12"
                          r="10"
                          class="fill-slate-100 stroke-slate-300"
                        />
                        <path d="m15 9-6 6M9 9l6 6" stroke-linecap="round" />
                      </svg>
                    </button>
                  {/if}
                </div>

                <!-- Tombol Kalkulator: Selalu tampil di Desktop, Collapsible/Auto-Focus di Mobile -->
                <div
                  class="{showCalcPad
                    ? 'block'
                    : 'hidden md:block'} space-y-1.5 pt-0.5"
                >
                  <div class="grid grid-cols-4 gap-1.5">
                    {#each [{ label: "+10rb", val: 10000 }, { label: "+50rb", val: 50000 }, { label: "+100rb", val: 100000 }, { label: ".000", op: "000" }] as item}
                      <button
                        type="button"
                        onclick={() =>
                          item.op
                            ? appendQuickMath(item.op)
                            : addPresetAmount(item.val)}
                        class="py-1.5 bg-white hover:bg-slate-100 active:bg-slate-200 border border-slate-200/90 rounded-lg text-[11px] font-extrabold text-slate-700 tabular-nums cursor-pointer transition-colors"
                      >
                        {item.label}
                      </button>
                    {/each}
                  </div>

                  <div class="grid grid-cols-5 gap-1.5">
                    {#each [{ label: "+", op: "+" }, { label: "−", op: "-" }, { label: "×", op: "*" }, { label: "÷", op: "/" }] as calc}
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
              </div>

              <!-- 3. Pilih Dompet Kas -->
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
                      <span class="text-xs font-extrabold truncate w-full"
                        >{acc.name}</span
                      >
                      <span
                        class="text-[11px] opacity-85 tabular-nums font-semibold truncate w-full mt-0.5"
                      >
                        {formatIDR(accountBalances[acc.id] ?? 0)}
                      </span>
                    </button>
                  {/each}
                </div>
              </div>

              <!-- Jika Transfer: Pilih Akun Tujuan -->
              {#if type === "transfer"}
                <div>
                  <span
                    class="block text-[11px] font-bold uppercase text-slate-500 mb-1"
                  >
                    Ke Dompet Tujuan
                  </span>
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
                        <span class="text-xs font-extrabold truncate w-full"
                          >{acc.name}</span
                        >
                        <span
                          class="text-[11px] opacity-85 tabular-nums font-semibold truncate w-full mt-0.5"
                        >
                          {formatIDR(accountBalances[acc.id] ?? 0)}
                        </span>
                      </button>
                    {/each}
                  </div>
                </div>
              {/if}

              <!-- 4. Pilih Kategori -->
              {#if type !== "transfer"}
                <div>
                  <div class="flex items-center justify-between mb-1">
                    <span
                      class="text-[11px] font-bold uppercase text-slate-500"
                    >
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
                        {showAllCategories
                          ? "Tutup Daftar ▲"
                          : `Lihat Semua (${filteredCategories.length}) ▼`}
                      </button>
                    {/if}
                  </div>

                  {#if !showAllCategories}
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
                  {:else}
                    <div
                      class="p-2.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2"
                    >
                      {#if filteredCategories.length > 6}
                        <input
                          type="search"
                          placeholder="Cari nama kategori..."
                          bind:value={categorySearch}
                          class="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:border-slate-900"
                        />
                      {/if}
                      <div
                        class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-40 overflow-y-auto pr-0.5"
                      >
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

              <!-- 5. Catatan Singkat -->
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

              <!-- Ringkasan Cepat ke Slide 2 pada Mobile -->
              <div class="md:hidden pt-1">
                <button
                  type="button"
                  onclick={() => (mobileStep = 2)}
                  class="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 rounded-xl flex items-center justify-between text-xs font-bold text-slate-700 cursor-pointer transition-colors"
                >
                  <span class="truncate">
                    {#if txItems.length > 0 || attachment_blob || useReimburse || no_bukti}
                      ✓ {txItems.length > 0
                        ? `${txItems.length} Produk`
                        : "Rincian"}
                      {attachment_blob
                        ? ` • Struk (${attachmentSizeKB} KB)`
                        : ""}
                      {useReimburse ? " • Talangan" : ""}
                      {no_bukti ? ` • #${no_bukti}` : ""}
                    {:else}
                      Rincian (Opsional)
                    {/if}
                  </span>
                  <span class="text-indigo-700 font-extrabold shrink-0 ml-2"
                    >Slide 2 →</span
                  >
                </button>
              </div>
            </div>

            <!-- ========================================================================= -->
            <!-- SLIDE 2 (MOBILE) / KOLOM KANAN (DESKTOP): RINCIAN & LAMPIRAN (OPSIONAL)   -->
            <!-- ========================================================================= -->
            <div
              class="{mobileStep === 2
                ? 'block'
                : 'hidden md:block'} md:col-span-5 space-y-3 mt-3 md:mt-0"
            >
              <!-- 6. Tanggal & Jam -->
              <div
                class="p-3 bg-slate-50 border border-slate-200/90 rounded-2xl"
              >
                <label
                  for="tx-date"
                  class="block text-[11px] font-bold uppercase text-slate-500 mb-1"
                >
                  Tanggal & Jam Transaksi
                </label>
                <input
                  id="tx-date"
                  type="datetime-local"
                  bind:value={dateInput}
                  required
                  class="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold tabular-nums focus:outline-none focus:border-slate-900"
                />
              </div>

              <!-- 7. Rincian Produk / Item Opsional (Tabel `transaction_items`) -->
              <div
                class="p-3 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-2.5"
              >
                <div class="flex items-center justify-between gap-2">
                  <div>
                    <span
                      class="block text-[11px] font-bold uppercase text-slate-500"
                    >
                      Rincian Produk ({txItems.length} item)
                    </span>
                    <span class="text-[10px] text-slate-400"> Opsional</span>
                  </div>
                  <div class="flex items-center gap-1.5">
                    {#if txItems.length > 0}
                      <button
                        type="button"
                        onclick={clearAllTxItems}
                        class="px-2 py-1 text-[11px] font-bold text-rose-600 hover:text-rose-800 cursor-pointer"
                      >
                        Reset
                      </button>
                    {/if}
                    <button
                      type="button"
                      onclick={addTxItem}
                      class="px-2.5 py-1 text-[11px] font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg cursor-pointer"
                    >
                      + Produk
                    </button>
                  </div>
                </div>

                {#if txItems.length > 0}
                  <div class="space-y-1.5 max-h-44 overflow-y-auto pr-0.5">
                    {#each txItems as item, idx (item.id || idx)}
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
                            oninput={(e) => handleItemAmountInput(idx, e)}
                            class="w-full pl-6 pr-2 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-extrabold tabular-nums text-right focus:outline-none focus:border-slate-900"
                          />
                        </div>
                        <button
                          type="button"
                          onclick={() => removeTxItem(idx)}
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
                      Subtotal ({txItems.length} item):
                    </span>
                    <div class="flex items-center gap-1.5">
                      <span class="font-extrabold tabular-nums text-slate-900">
                        {formatIDR(itemsSubtotal)}
                      </span>
                      {#if itemsSubtotal > 0 && itemsSubtotal !== evaluatedAmount}
                        <button
                          type="button"
                          onclick={syncAmountFromItems}
                          class="px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-md text-[10px] font-extrabold cursor-pointer"
                        >
                          Samakan Total
                        </button>
                      {/if}
                    </div>
                  </div>
                {/if}
              </div>

              <!-- 8. Lampiran Foto Nota / Struk (WebP < 80 KB) -->
              <div
                class="p-3 bg-slate-50 border border-slate-200/90 rounded-2xl"
              >
                <input
                  bind:this={directFileInputEl}
                  type="file"
                  accept="image/*"
                  onchange={handleDirectAttachmentChange}
                  class="hidden"
                />
                <div class="flex items-center justify-between gap-2">
                  <div>
                    <span
                      class="block text-[11px] font-bold uppercase text-slate-500"
                    >
                      Lampiran Foto Struk
                    </span>
                    <span class="text-[10px] text-slate-400">
                      {#if attachment_blob}
                        WebP • {attachmentSizeKB} KB (&lt; 80 KB)
                      {:else}
                        Opsional
                      {/if}
                    </span>
                  </div>

                  <div class="flex items-center gap-1.5">
                    {#if attachment_blob}
                      <button
                        type="button"
                        onclick={() => updateAttachmentPreview(null)}
                        class="px-2 py-1 text-[11px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg cursor-pointer"
                      >
                        Hapus
                      </button>
                    {/if}
                    <button
                      type="button"
                      onclick={() => directFileInputEl?.click()}
                      class="px-2.5 py-1 text-[11px] font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg cursor-pointer"
                    >
                      {isCompressingImg
                        ? "Kompres..."
                        : attachment_blob
                          ? "Ganti Foto"
                          : "+ Foto"}
                    </button>
                  </div>
                </div>

                {#if attachmentPreviewUrl}
                  <div
                    class="mt-2 pt-2 border-t border-slate-200/80 flex items-center gap-2.5"
                  >
                    <img
                      src={attachmentPreviewUrl}
                      alt="Lampiran Struk"
                      class="w-12 h-12 object-cover rounded-lg border border-slate-300 bg-white shrink-0"
                    />
                    <div class="text-[11px] text-slate-600 min-w-0">
                      <div class="font-extrabold text-emerald-800 tabular-nums">
                        ✓ Struk Siap Disimpan ({attachmentSizeKB} KB)
                      </div>
                      <p class="text-[10px] text-slate-400 truncate">
                        Tersimpan lokal di IndexedDB.
                      </p>
                    </div>
                  </div>
                {/if}
              </div>

              <!-- 9. Opsi Dana Talangan / Reimburse -->
              {#if isNonPersonal && type === "expense"}
                <div
                  class="p-3 rounded-2xl border {useReimburse
                    ? 'bg-amber-50/90 border-amber-300'
                    : 'bg-slate-50 border-slate-200'}"
                >
                  <label
                    class="flex items-center gap-2 cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      bind:checked={useReimburse}
                      onchange={() => {
                        if (useReimburse && reimburse_status === "none") {
                          reimburse_status = "pending";
                        }
                      }}
                      class="w-4 h-4 accent-amber-700 rounded cursor-pointer shrink-0"
                    />
                    <span class="text-xs font-extrabold text-slate-900">
                      Dana Talangan Pribadi (Reimburse)
                    </span>
                  </label>

                  {#if useReimburse}
                    <div
                      class="mt-2.5 pt-2.5 border-t border-amber-200 space-y-2"
                    >
                      <div>
                        <span
                          class="block text-[10px] font-bold uppercase text-amber-900 mb-1"
                        >
                          Dompet Pribadi yang Menalangi:
                        </span>
                        <div class="flex flex-wrap gap-1">
                          {#each personalAccounts as pAcc (pAcc.id)}
                            <button
                              type="button"
                              onclick={() =>
                                (reimburse_from_account_id = pAcc.id)}
                              class="px-2 py-1 rounded-lg border text-[11px] font-bold cursor-pointer {reimburse_from_account_id ===
                              pAcc.id
                                ? 'bg-amber-800 text-white border-amber-800'
                                : 'bg-white text-slate-800 border-amber-300 hover:bg-amber-100'}"
                            >
                              {pAcc.name}
                            </button>
                          {/each}
                        </div>
                      </div>

                      <div
                        class="flex items-center justify-between text-[11px] text-amber-900 bg-amber-100/70 px-2.5 py-1.5 rounded-xl"
                      >
                        <span class="font-semibold">Status:</span>
                        <div class="inline-flex gap-1">
                          <button
                            type="button"
                            onclick={() => (reimburse_status = "pending")}
                            class="px-2 py-0.5 rounded-lg font-bold cursor-pointer {reimburse_status !==
                            'settled'
                              ? 'bg-amber-700 text-white'
                              : 'text-amber-900 hover:bg-amber-200'}"
                          >
                            Belum Diganti
                          </button>
                          <button
                            type="button"
                            onclick={() => (reimburse_status = "settled")}
                            class="px-2 py-0.5 rounded-lg font-bold cursor-pointer {reimburse_status ===
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

              <!-- 10. Atribut Khusus Pekerjaan / Usaha -->
              {#if isPekerjaanWorkspace}
                <div
                  class="p-3 bg-emerald-50/40 border border-emerald-200/80 rounded-2xl space-y-2"
                >
                  <div
                    class="text-[11px] font-extrabold uppercase tracking-wider text-emerald-900"
                  >
                    Atribut Pekerjaan & Dinas
                  </div>
                  <div>
                    <span
                      class="block text-[10px] font-bold text-slate-600 mb-1"
                      >Divisi / Unit Kerja</span
                    >
                    <div class="grid grid-cols-2 gap-1">
                      {#each KOPDES_UNITS as unit}
                        <button
                          type="button"
                          onclick={() => (unit_usaha = unit)}
                          title={unit}
                          class="px-2 py-1.5 rounded-lg border text-[11px] font-semibold text-left truncate cursor-pointer {unit_usaha ===
                          unit
                            ? 'bg-emerald-900 text-white border-emerald-900'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'}"
                        >
                          {unit}
                        </button>
                      {/each}
                    </div>
                  </div>
                  <div class="grid grid-cols-2 gap-2">
                    <div>
                      <label
                        for="tx-nobukti"
                        class="block text-[10px] font-bold text-slate-600 mb-1"
                      >
                        No. Bukti / SPJ
                      </label>
                      <input
                        id="tx-nobukti"
                        type="text"
                        placeholder="SPJ-2026/11/001"
                        bind:value={no_bukti}
                        class="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:border-emerald-800"
                      />
                    </div>
                    <div>
                      <label
                        for="tx-pic"
                        class="block text-[10px] font-bold text-slate-600 mb-1"
                      >
                        Pihak Terkait / PIC
                      </label>
                      <input
                        id="tx-pic"
                        type="text"
                        placeholder="Nama rekan/vendor"
                        bind:value={pic_pihak}
                        class="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:border-emerald-800"
                      />
                    </div>
                  </div>
                </div>
              {:else if isNonPersonal}
                <div
                  class="p-3 bg-slate-50 border border-slate-200/90 rounded-2xl grid grid-cols-2 gap-2"
                >
                  <div>
                    <label
                      for="tx-nobukti-biz"
                      class="block text-[10px] font-bold uppercase text-slate-500 mb-1"
                    >
                      No. Nota / Invoice
                    </label>
                    <input
                      id="tx-nobukti-biz"
                      type="text"
                      placeholder="INV-001"
                      bind:value={no_bukti}
                      class="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:border-teal-800"
                    />
                  </div>
                  <div>
                    <label
                      for="tx-pic-biz"
                      class="block text-[10px] font-bold uppercase text-slate-500 mb-1"
                    >
                      Pelanggan / Suplier
                    </label>
                    <input
                      id="tx-pic-biz"
                      type="text"
                      placeholder="Nama pihak"
                      bind:value={pic_pihak}
                      class="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:border-teal-800"
                    />
                  </div>
                </div>
              {/if}
            </div>
          </div>
        </div>

        <!-- Sticky Footer Aksi (Selalu Terlihat di Slide 1, Slide 2, maupun Desktop) -->
        <div
          class="px-4 py-3 bg-white border-t border-slate-200 flex items-center justify-between gap-2 shrink-0"
        >
          <div class="flex items-center gap-1.5">
            <button
              type="button"
              onclick={onClose}
              class="px-3.5 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 cursor-pointer"
            >
              Batal
            </button>

            <!-- Tombol Pindah Slide Cepat di Mobile -->
            <button
              type="button"
              onclick={() => (mobileStep = mobileStep === 1 ? 2 : 1)}
              class="md:hidden px-3 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
            >
              {mobileStep === 1 ? "Rincian (2) →" : "← Utama (1)"}
            </button>
          </div>

          <button
            type="submit"
            class="px-5 py-2 text-xs font-extrabold text-white rounded-xl cursor-pointer {activePillCls}"
          >
            Simpan
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
