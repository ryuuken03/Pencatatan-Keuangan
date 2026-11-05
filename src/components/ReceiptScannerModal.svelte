<script>
  import { onDestroy } from "svelte";
  import { db, recordItemAliases } from "../lib/db.js";
  import { compressReceiptImage } from "../lib/utils/imageCompressor.js";
  import {
    extractTextFromReceiptImage,
    parseReceiptText,
    buildReceiptNote,
    buildItemHistoryIndex,
    buildItemAliasesIndex,
    SAMPLE_RECEIPTS,
    generateSampleReceiptFile,
  } from "../lib/parsers/receiptParser.js";
  import {
    formatIDR,
    formatDateShort,
    toDatetimeLocal,
    getWorkspaceName,
    getWorkspaceTheme,
    getWorkspaceType
  } from "../lib/utils.js";

  let {
    isOpen = false,
    workspaces = [],
    activeWorkspace = "personal",
    allAccounts = [],
    allCategories = [],
    allTransactions = [],
    onApply,
    onSave,
    onClose,
  } = $props();

  let selectedFile = $state(null);
  let compressedResult = $state(null);
  let previewUrl = $state("");
  let rawReceiptText = $state("");
  let ocrEngineName = $state("");
  let isProcessing = $state(false);
  let isSaving = $state(false);
  let progressText = $state("");
  let errorMsg = $state("");

  // Opsi Penghematan Memori & Mode Kamera
  let skipSavingImage = $state(false);
  let highContrastMode = $state(false);
  let showRawOcr = $state(false);
  let showImageZoom = $state(false);

  let cameraInputEl = $state(null);
  let galleryInputEl = $state(null);

  // Kamus Indeks Fuzzy (Dibersihkan saat modal tutup)
  let itemHistoryIndex = $state.raw([]);
  let itemAliasesIndex = $state.raw(null);

  // State Form Transaksi yang dapat diedit langsung di modal
  let formWorkspaceId = $state("personal");
  let formDate = $state(toDatetimeLocal());
  let formAccountId = $state("");
  let formCategoryId = $state("");
  let formMerchant = $state("");
  let formNote = $state("");
  let formSingleAmount = $state(0);
  let lastParsedMetadata = $state({});

  // Daftar item produk yang dapat diedit secara inline
  let editableItems = $state([]);
  let selectedItemIds = $state([]);

  // Muat riwayat database & kamus alias dari Dexie saat modal dibuka
  async function loadIndexes() {
    try {
      const [historyRows, aliasRows] = await Promise.all([
        db.transaction_items
          .filter((it) => !it.deleted_at && Boolean(it.name))
          .toArray(),
        db.item_aliases.filter((al) => !al.deleted_at).toArray(),
      ]);

      historyRows.sort((a, b) =>
        String(b.updated_at || "").localeCompare(String(a.updated_at || "")),
      );

      return {
        history: buildItemHistoryIndex(historyRows.map((r) => r.name)),
        aliases: buildItemAliasesIndex(aliasRows),
      };
    } catch {
      return { history: [], aliases: null };
    }
  }

  function revokePreview() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = "";
    }
  }

  // Bersihkan seluruh referensi memori saat modal ditutup
  function cleanupMemory() {
    revokePreview();
    selectedFile = null;
    compressedResult = null;
    rawReceiptText = "";
    ocrEngineName = "";
    errorMsg = "";
    progressText = "";
    isProcessing = false;
    isSaving = false;
    showRawOcr = false;
    showImageZoom = false;
    editableItems = [];
    selectedItemIds = [];
    itemHistoryIndex = [];
    itemAliasesIndex = null;
    lastParsedMetadata = {};
  }

  $effect(() => {
    if (!isOpen) {
      cleanupMemory();
      return;
    }

    formWorkspaceId = activeWorkspace;

    let isMounted = true;
    loadIndexes().then((res) => {
      if (!isMounted) return;
      itemHistoryIndex = res.history;
      itemAliasesIndex = res.aliases;
    });

    return () => {
      isMounted = false;
      revokePreview();
    };
  });

  onDestroy(() => {
    cleanupMemory();
  });

  // Terapkan hasil parse ke state form (Hanya dipanggil SEKALI saat OCR selesai, bukan di $effect siklik)
  function applyParsedDataToForm(rawText) {
    if (!rawText) return;

    const parsed = parseReceiptText(rawText, {
      activeWorkspace,
      allAccounts,
      allCategories,
      allTransactions,
      itemHistory: itemHistoryIndex,
      itemAliases: itemAliasesIndex,
    });

    formWorkspaceId = parsed.workspace_id || activeWorkspace;
    formDate = toDatetimeLocal(parsed.date);
    formMerchant = parsed.merchant || "";
    formCategoryId = parsed.category_id || "";
    lastParsedMetadata = parsed.metadata || {};

    const wsAccounts = allAccounts.filter(
      (a) => a.workspace_id === formWorkspaceId,
    );
    formAccountId =
      parsed.account_id &&
      wsAccounts.some((a) => a.id === parsed.account_id)
        ? parsed.account_id
        : wsAccounts[0]?.id || "";

    const rawItems = parsed.items || [];
    if (rawItems.length > 0) {
      editableItems = rawItems.map((it, idx) => ({
        id: it.id || `item-${idx + 1}`,
        name: it.name || "",
        amount: Math.round(Number(it.amount) || 0),
        original_ocr_name: it.original_ocr_name || it.name,
        matched_from_alias: Boolean(it.matched_from_alias),
        matched_from_history: Boolean(it.matched_from_history),
        match_score: it.match_score || 0,
        match_source: it.match_source || "ocr",
      }));
      selectedItemIds = editableItems.map((it) => it.id);
      formSingleAmount = 0;
    } else {
      editableItems = [];
      selectedItemIds = [];
      formSingleAmount = parsed.amount || 0;
    }

    formNote = buildReceiptNote(formMerchant, editableItems);
  }

  // Filter akun dan kategori berdasarkan workspace aktif struk
  let availableAccounts = $derived(
    allAccounts.filter((a) => a.workspace_id === formWorkspaceId),
  );
  let availableCategories = $derived(
    allCategories.filter(
      (c) =>
        c.workspace_id === formWorkspaceId &&
        (c.type === "expense" || !c.type),
    ),
  );

  // Hitung total terpilih dari item yang dicentang
  let activeSelectedItems = $derived(
    editableItems.filter((it) => selectedItemIds.includes(it.id)),
  );

  let effectiveAmount = $derived.by(() => {
    if (editableItems.length === 0) {
      return Math.round(Number(formSingleAmount) || 0);
    }
    return activeSelectedItems.reduce(
      (acc, it) => acc + (Math.round(Number(it.amount)) || 0),
      0,
    );
  });

  let effectiveWorkspaces = $derived(
    workspaces && workspaces.length > 0
      ? workspaces
      : [{ id: "personal", name: "Buku Pribadi", type: "personal" }]
  );

  let headerBgCls = $derived(
    getWorkspaceTheme(formWorkspaceId, effectiveWorkspaces).heroBg
  );

  function toggleItemSelection(itemId) {
    if (selectedItemIds.includes(itemId)) {
      selectedItemIds = selectedItemIds.filter((id) => id !== itemId);
    } else {
      selectedItemIds = [...selectedItemIds, itemId];
    }
  }

  function selectAllItems() {
    selectedItemIds = editableItems.map((it) => it.id);
  }

  function revertItemToOcr(itemId) {
    editableItems = editableItems.map((it) => {
      if (it.id === itemId && it.original_ocr_name) {
        return {
          ...it,
          name: it.original_ocr_name,
          matched_from_alias: false,
          matched_from_history: false,
          match_score: 0,
        };
      }
      return it;
    });
  }

  function removeItem(itemId) {
    editableItems = editableItems.filter((it) => it.id !== itemId);
    selectedItemIds = selectedItemIds.filter((id) => id !== itemId);
  }

  function addNewItem() {
    const newId = `item-${Date.now()}`;
    editableItems = [
      ...editableItems,
      {
        id: newId,
        name: "Item Baru",
        amount: 0,
        original_ocr_name: "Item Baru",
        matched_from_alias: false,
        matched_from_history: false,
        match_score: 0,
      },
    ];
    selectedItemIds = [...selectedItemIds, newId];
  }

  async function processFile(file, simulatedText = "") {
    if (!file) return;
    errorMsg = "";
    isProcessing = true;
    progressText = "Mengompres foto ke WebP (< 80 KB)...";
    selectedFile = file;

    try {
      const comp = await compressReceiptImage(file, {
        maxDimension: 1000,
        initialQuality: 0.6,
        highContrast: highContrastMode,
      });

      revokePreview();
      compressedResult = comp;
      previewUrl = URL.createObjectURL(comp.blob);

      if (simulatedText || file.__simulatedReceiptText) {
        rawReceiptText = simulatedText || file.__simulatedReceiptText;
        ocrEngineName = "Simulasi Struk";
      } else {
        const primaryOcrTarget = highContrastMode
          ? comp.ocrCanvas || comp.canvas
          : comp.rawOcrCanvas || comp.canvas;
        const secondaryOcrTarget = highContrastMode
          ? comp.rawOcrCanvas
          : comp.ocrCanvas;

        const ocrRes = await extractTextFromReceiptImage(
          primaryOcrTarget,
          (msg) => {
            progressText = msg;
          },
          secondaryOcrTarget,
        );
        ocrEngineName = ocrRes.engine;
        if (ocrRes.text) {
          rawReceiptText = ocrRes.text;
        } else if (!rawReceiptText) {
          errorMsg =
            "Foto berhasil dikompres ke WebP (<80KB). Teks struk tidak terbaca jelas — Anda bisa mengisi rincian transaksi secara manual di bawah.";
        }
      }

      // Terapkan hasil ke form sekali saja
      applyParsedDataToForm(rawReceiptText);
    } catch (err) {
      errorMsg = err?.message || "Gagal memproses foto struk.";
    } finally {
      isProcessing = false;
      progressText = "";
    }
  }

  async function handleFileInputChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(file);
    e.target.value = "";
  }

  async function handleToggleHighContrast() {
    if (selectedFile) {
      await processFile(selectedFile);
    }
  }

  function buildTransactionPayload() {
    const finalItems = activeSelectedItems.map((it, idx) => ({
      id: String(it.id || `item-${idx + 1}`),
      name: String(it.name || "").trim() || `Produk ${idx + 1}`,
      amount: Math.round(Number(it.amount) || 0),
    }));

    return {
      workspace_id: formWorkspaceId || activeWorkspace,
      type: "expense",
      amount: effectiveAmount,
      date: formDate ? new Date(formDate).toISOString() : new Date().toISOString(),
      account_id: formAccountId,
      category_id: formCategoryId || null,
      note: formNote || buildReceiptNote(formMerchant, finalItems),
      merchant: formMerchant,
      items: finalItems,
      metadata: {
        no_bukti: lastParsedMetadata.no_bukti || "",
        unit_usaha: lastParsedMetadata.unit_usaha || "",
        pic_pihak: formMerchant || "",
        items: finalItems,
        reimburse_status: "none",
        reimburse_from_account_id: null,
      },
      attachment_blob: skipSavingImage ? null : compressedResult?.blob || null,
    };
  }

  // Rekam alias produk yang dikoreksi (Self-Learning Loop)
  async function saveItemAliasesLearning() {
    const aliasesToRecord = [];
    for (const it of activeSelectedItems) {
      const ocrRaw = String(it.original_ocr_name || "").trim();
      const finalName = String(it.name || "").trim();
      if (
        ocrRaw &&
        finalName &&
        ocrRaw.toLowerCase() !== finalName.toLowerCase()
      ) {
        aliasesToRecord.push({
          ocrKey: ocrRaw,
          canonicalName: finalName,
          merchant: formMerchant,
          workspaceId: formWorkspaceId,
        });
      }
    }
    if (aliasesToRecord.length > 0) {
      await recordItemAliases(aliasesToRecord);
    }
  }

  // 1. Aksi Simpan Langsung (Tanpa Masuk Form Lagi)
  async function handleDirectSave() {
    errorMsg = "";
    if (effectiveAmount <= 0) {
      errorMsg = "Nominal total struk harus lebih dari Rp 0.";
      return;
    }
    if (!formAccountId) {
      errorMsg = "Pilih akun/dompet pembayaran terlebih dahulu.";
      return;
    }

    isSaving = true;
    try {
      await saveItemAliasesLearning();
      const payload = buildTransactionPayload();

      if (onSave) {
        await onSave(payload);
      } else if (onApply) {
        onApply(payload);
      }
      cleanupMemory();
      onClose();
    } catch (err) {
      errorMsg = err?.message || "Gagal menyimpan transaksi langsung.";
    } finally {
      isSaving = false;
    }
  }

  // 2. Aksi Buka ke Form Lengkap
  async function handleProceedToForm() {
    errorMsg = "";
    if (!compressedResult && !rawReceiptText.trim()) {
      errorMsg = "Pilih foto struk atau klik simulasi struk terlebih dahulu.";
      return;
    }

    await saveItemAliasesLearning();
    const payload = buildTransactionPayload();
    onApply(payload);
    cleanupMemory();
    onClose();
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
        class="flex items-center justify-between px-4 py-3.5 {headerBgCls} text-white shrink-0"
      >
        <div class="flex items-center gap-2">
          <svg
            class="w-4 h-4"
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
          <h2 class="text-sm font-extrabold tracking-wide uppercase">
            Scan Foto Struk / Nota
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

      <!-- Body Modal -->
      <div class="p-4 space-y-3.5 overflow-y-auto text-xs sm:text-sm">
        {#if errorMsg}
          <div
            class="p-2.5 bg-rose-50 border border-rose-300 text-rose-800 rounded-xl text-xs font-bold"
          >
            {errorMsg}
          </div>
        {/if}

        <!-- Hidden File Inputs -->
        <input
          bind:this={cameraInputEl}
          type="file"
          accept="image/*"
          capture="environment"
          onchange={handleFileInputChange}
          class="hidden"
        />
        <input
          bind:this={galleryInputEl}
          type="file"
          accept="image/*"
          onchange={handleFileInputChange}
          class="hidden"
        />

        <!-- Baris Tombol Akuisisi Foto & Opsi -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            type="button"
            onclick={() => cameraInputEl?.click()}
            class="py-2.5 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-extrabold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-2xs transition-colors"
          >
            <svg
              class="w-4 h-4 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <circle cx="12" cy="13" r="3" />
            </svg>
            <span>Kamera</span>
          </button>

          <button
            type="button"
            onclick={() => galleryInputEl?.click()}
            class="py-2.5 px-3 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-xl font-extrabold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-2xs transition-colors"
          >
            <svg
              class="w-4 h-4 shrink-0 text-slate-600"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
              <circle cx="9" cy="9" r="2" />
              <path
                d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            <span>Pilih Galeri</span>
          </button>

          <!-- Toggle Kontras Tinggi -->
          <label class="flex items-center justify-center gap-1.5 px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer select-none text-[11px] font-bold text-slate-700">
            <input
              type="checkbox"
              bind:checked={highContrastMode}
              onchange={handleToggleHighContrast}
              class="w-3.5 h-3.5 accent-slate-900 rounded cursor-pointer shrink-0"
            />
            <span>Kontras Tinggi</span>
          </label>

          <!-- Toggle Hemat Tanpa Foto -->
          <label class="flex items-center justify-center gap-1.5 px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer select-none text-[11px] font-bold text-slate-700">
            <input
              type="checkbox"
              bind:checked={skipSavingImage}
              class="w-3.5 h-3.5 accent-amber-700 rounded cursor-pointer shrink-0"
            />
            <span>Jangan Simpan</span>
          </label>
        </div>

        {#if isProcessing}
          <div class="p-3 bg-slate-100 border border-slate-200 rounded-xl text-center">
            <span class="text-xs font-extrabold text-slate-700 animate-pulse">
              {progressText || "Memproses foto & membaca teks struk..."}
            </span>
          </div>
        {/if}

        <!-- KONTEN UTAMA: PREVIEW GAMBAR STRUK + FORM EDIT LANGSUNG -->
        {#if rawReceiptText || compressedResult}
          <div class="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-start">
            
            <!-- KOLOM KIRI: PREVIEW FOTO STRUK WEBP -->
            {#if previewUrl}
              <div class="md:col-span-5 bg-slate-100 border border-slate-200 rounded-xl p-2.5 flex flex-col items-center">
                <div class="w-full flex items-center justify-between mb-1.5">
                  <span class="text-[10px] font-extrabold uppercase text-slate-500">
                    Foto Struk (WebP)
                  </span>
                  {#if compressedResult}
                    <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 tabular-nums">
                      {compressedResult.sizeKB} KB
                    </span>
                  {/if}
                </div>

                <div class="relative w-full flex items-center justify-center bg-slate-900/5 rounded-lg border border-slate-200 overflow-hidden">
                  <button
                    type="button"
                    onclick={() => (showImageZoom = true)}
                    class="p-0 border-0 bg-transparent cursor-zoom-in flex items-center justify-center w-full"
                    title="Klik untuk memperbesar foto struk"
                  >
                    <img
                      src={previewUrl}
                      alt="Foto Struk Asli"
                      class="max-h-64 md:max-h-96 w-auto object-contain"
                    />
                  </button>
                </div>

                {#if ocrEngineName}
                  <div class="w-full mt-1.5 text-center">
                    <span class="text-[9px] font-semibold text-slate-400">
                      Mesin: {ocrEngineName}
                    </span>
                  </div>
                {/if}
              </div>
            {/if}

            <!-- KOLOM KANAN: FORM METADATA & DAFTAR PRODUK EDITABLE -->
            <div class="{previewUrl ? 'md:col-span-7' : 'md:col-span-12'} space-y-3">
              <!-- Form Field Transaksi -->
              <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label for="receipt-date-input" class="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">
                      Tanggal
                    </label>
                    <input
                      id="receipt-date-input"
                      type="datetime-local"
                      bind:value={formDate}
                      class="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 tabular-nums focus:outline-none focus:ring-1 focus:ring-slate-900"
                    />
                  </div>

                  <div>
                    <label for="receipt-account-select" class="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">
                      Bayar Pakai Dompet
                    </label>
                    <select
                      id="receipt-account-select"
                      bind:value={formAccountId}
                      class="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900"
                    >
                      {#each availableAccounts as acc (acc.id)}
                        <option value={acc.id}>{acc.name} ({acc.type})</option>
                      {/each}
                    </select>
                  </div>

                  <div>
                    <label for="receipt-category-select" class="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">
                      Kategori
                    </label>
                    <select
                      id="receipt-category-select"
                      bind:value={formCategoryId}
                      class="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900"
                    >
                      <option value="">-- Tanpa Kategori --</option>
                      {#each availableCategories as cat (cat.id)}
                        <option value={cat.id}>{cat.name}</option>
                      {/each}
                    </select>
                  </div>

                  <div>
                    <label for="receipt-merchant-input" class="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">
                      Toko / Merchant
                    </label>
                    <input
                      id="receipt-merchant-input"
                      type="text"
                      bind:value={formMerchant}
                      placeholder="Nama Toko"
                      class="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900"
                    />
                  </div>
                </div>

                <div>
                  <label for="receipt-note-input" class="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">
                    Catatan
                  </label>
                  <input
                    id="receipt-note-input"
                    type="text"
                    bind:value={formNote}
                    placeholder="Catatan transaksi..."
                    class="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900"
                  />
                </div>
              </div>

              <!-- Rincian Produk (Editable Inline) -->
              {#if editableItems.length > 0}
                <div class="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
                  <div class="flex items-center justify-between px-3 py-2 bg-slate-100 border-b border-slate-200">
                    <span class="text-[11px] font-extrabold uppercase text-slate-600">
                      Rincian Produk ({activeSelectedItems.length}/{editableItems.length})
                    </span>
                    <div class="flex items-center gap-2">
                      {#if activeSelectedItems.length < editableItems.length}
                        <button
                          type="button"
                          onclick={selectAllItems}
                          class="text-[11px] font-bold text-indigo-700 hover:text-indigo-900 cursor-pointer"
                        >
                          Pilih Semua
                        </button>
                      {/if}
                      <button
                        type="button"
                        onclick={addNewItem}
                        class="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 cursor-pointer"
                      >
                        + Tambah Baris
                      </button>
                    </div>
                  </div>

                  <div class="divide-y divide-slate-200/80 max-h-56 overflow-y-auto p-1.5 space-y-1">
                    {#each editableItems as item (item.id)}
                      {@const isChecked = selectedItemIds.includes(item.id)}
                      <div
                        class="flex items-center gap-2 p-1.5 rounded-lg border transition-colors {isChecked
                          ? 'bg-white border-slate-200'
                          : 'bg-slate-100/60 border-transparent opacity-60'}"
                      >
                        <!-- Checkbox -->
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onchange={() => toggleItemSelection(item.id)}
                          class="w-3.5 h-3.5 accent-slate-900 rounded cursor-pointer shrink-0"
                        />

                        <!-- Nama Barang -->
                        <div class="flex-1 min-w-0">
                          <input
                            type="text"
                            bind:value={item.name}
                            class="w-full px-1.5 py-0.5 bg-transparent border-b border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:border-slate-800"
                            placeholder="Nama Produk"
                          />
                          {#if item.matched_from_alias || item.matched_from_history}
                            <div class="flex items-center gap-1.5 mt-0.5">
                              <span
                                class="text-[9px] font-bold px-1 py-px rounded border tabular-nums {item.matched_from_alias
                                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                  : 'bg-slate-100 border-slate-200 text-slate-600'}"
                              >
                                {item.matched_from_alias
                                  ? "Kamus Alias"
                                  : `Riwayat ${Math.round(item.match_score * 100)}%`}
                              </span>
                              {#if item.name !== item.original_ocr_name}
                                <button
                                  type="button"
                                  onclick={() => revertItemToOcr(item.id)}
                                  title="Kembalikan teks OCR asli"
                                  class="text-[9px] font-semibold text-slate-400 hover:text-rose-600 cursor-pointer truncate"
                                >
                                  OCR: "{item.original_ocr_name}" ↺
                                </button>
                              {/if}
                            </div>
                          {/if}
                        </div>

                        <!-- Nominal -->
                        <div class="w-24 shrink-0">
                          <input
                            type="number"
                            bind:value={item.amount}
                            class="w-full px-1.5 py-0.5 bg-transparent border-b border-slate-200 text-xs font-extrabold text-slate-900 tabular-nums text-right focus:outline-none focus:border-slate-800"
                            placeholder="0"
                          />
                        </div>

                        <!-- Hapus -->
                        <button
                          type="button"
                          onclick={() => removeItem(item.id)}
                          class="p-1 text-slate-300 hover:text-rose-600 cursor-pointer shrink-0"
                          title="Hapus baris"
                        >
                          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" />
                          </svg>
                        </button>
                      </div>
                    {/each}
                  </div>

                  <!-- Rekap Total -->
                  <div class="px-3 py-2 bg-slate-100 border-t border-slate-200 flex items-center justify-between">
                    <span class="text-[11px] font-extrabold uppercase text-slate-600">
                      Total ({activeSelectedItems.length} produk)
                    </span>
                    <span class="text-sm font-extrabold tabular-nums text-emerald-800">
                      {formatIDR(effectiveAmount)}
                    </span>
                  </div>
                </div>
              {:else}
                <!-- Kwitansi Tunggal (1 Total Saja) -->
                <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                  <span class="text-[10px] font-bold uppercase text-slate-500 block">
                    Total Nominal
                  </span>
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-bold text-slate-500">Rp</span>
                    <input
                      type="number"
                      bind:value={formSingleAmount}
                      class="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-extrabold text-slate-900 tabular-nums focus:outline-none focus:ring-1 focus:ring-slate-900"
                      placeholder="0"
                    />
                  </div>
                </div>
              {/if}

              <!-- Toggle Teks Asli OCR -->
              {#if rawReceiptText}
                <div>
                  <button
                    type="button"
                    onclick={() => (showRawOcr = !showRawOcr)}
                    class="text-[11px] font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    {showRawOcr ? "Sembunyikan Teks Asli ▲" : "Lihat Teks Asli OCR ▼"}
                  </button>
                  {#if showRawOcr}
                    <textarea
                      rows="3"
                      value={rawReceiptText}
                      readonly
                      class="mt-1 w-full px-2.5 py-1.5 bg-slate-50 text-slate-600 border border-slate-200 rounded-lg text-[10px] font-mono leading-relaxed focus:outline-none resize-none"
                    ></textarea>
                  {/if}
                </div>
              {/if}
            </div>
          </div>
        {:else}
          <!-- State Kosong Sebelum Scan -->
          <div class="p-8 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-center">
            <p class="text-xs font-bold text-slate-600">Belum ada struk yang dipindai</p>
            <p class="text-[11px] text-slate-400 mt-1">
              Ambil foto struk dari Kamera atau Galeri untuk mulai memindai.
            </p>
          </div>
        {/if}

        <!-- Footer Tombol Aksi -->
        <div class="flex items-center justify-between pt-2 border-t border-slate-200 gap-2">
          <button
            type="button"
            onclick={onClose}
            class="px-3.5 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 cursor-pointer"
          >
            Batal
          </button>

          <div class="flex items-center gap-2">
            {#if rawReceiptText || compressedResult}
              <button
                type="button"
                onclick={handleProceedToForm}
                class="px-3 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl cursor-pointer"
              >
                Form Lengkap →
              </button>
            {/if}

            <button
              type="button"
              disabled={isSaving || isProcessing || effectiveAmount <= 0}
              onclick={handleDirectSave}
              class="px-4 py-2 text-xs font-extrabold text-white rounded-xl cursor-pointer shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed {headerBgCls}"
            >
              {isSaving ? "Menyimpan..." : "✓ Simpan Transaksi"}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Modal Zoom Gambar Penuh Jika Diklik -->
  {#if showImageZoom && previewUrl}
    <button
      type="button"
      aria-label="Tutup foto diperbesar"
      class="fixed inset-0 z-60 flex items-center justify-center bg-black/85 p-4 cursor-zoom-out border-0"
      onclick={() => (showImageZoom = false)}
    >
      <img
        src={previewUrl}
        alt="Foto Struk Diperbesar"
        class="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
      />
    </button>
  {/if}
{/if}
