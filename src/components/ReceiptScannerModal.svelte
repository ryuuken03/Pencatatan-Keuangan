<script>
  import { onDestroy } from "svelte";
  import { compressReceiptImage } from "../lib/utils/imageCompressor.js";
  import {
    extractTextFromReceiptImage,
    parseReceiptText,
    buildReceiptNote,
    SAMPLE_RECEIPTS,
    generateSampleReceiptFile,
  } from "../lib/parsers/receiptParser.js";
  import { formatIDR, formatDateShort } from "../lib/utils.js";

  let {
    isOpen = false,
    activeWorkspace = "personal",
    allAccounts = [],
    allCategories = [],
    allTransactions = [],
    onApply,
    onClose,
  } = $props();

  let selectedFile = $state(null);
  let compressedResult = $state(null);
  let previewUrl = $state("");
  let rawReceiptText = $state("");
  let ocrEngineName = $state("");
  let isProcessing = $state(false);
  let progressText = $state("");
  let errorMsg = $state("");

  // State checklist item produk & toggle teks mentah OCR
  let selectedItemIds = $state([]);
  let showRawOcr = $state(false);

  // Opsi PRD 4.2
  let skipSavingImage = $state(false);
  let highContrastMode = $state(true);

  let cameraInputEl = $state(null);
  let galleryInputEl = $state(null);

  let parsedPreview = $derived(
    parseReceiptText(rawReceiptText, {
      activeWorkspace,
      allAccounts,
      allCategories,
      allTransactions,
    }),
  );

  // Sinkronkan default checklist (centang semua item) setiap kali daftar item dari struk berubah
  $effect(() => {
    const items = parsedPreview.items || [];
    selectedItemIds = items.map((it) => it.id);
  });

  let selectedItems = $derived(
    (parsedPreview.items || []).filter((it) => selectedItemIds.includes(it.id)),
  );

  // Jika ada list produk & user memilih sebagian item, hitung total dari item terpilih saja
  let effectiveAmount = $derived.by(() => {
    const allItems = parsedPreview.items || [];
    if (allItems.length === 0) {
      return parsedPreview.amount;
    }
    if (selectedItems.length === allItems.length) {
      const sumAll = allItems.reduce((acc, it) => acc + it.amount, 0);
      return parsedPreview.amount > 0 ? parsedPreview.amount : sumAll;
    }
    return selectedItems.reduce((acc, it) => acc + it.amount, 0);
  });

  let effectiveNote = $derived(
    buildReceiptNote(parsedPreview.merchant, selectedItems),
  );

  let categoriesMap = $derived(
    Object.fromEntries(allCategories.map((c) => [c.id, c])),
  );

  let headerBgCls = $derived(
    parsedPreview.workspace_id === "business"
      ? "bg-teal-900"
      : parsedPreview.workspace_id === "kopdes"
        ? "bg-emerald-900"
        : "bg-indigo-950",
  );

  function revokePreview() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = "";
    }
  }

  onDestroy(() => {
    revokePreview();
  });

  function toggleItemSelection(itemId) {
    if (selectedItemIds.includes(itemId)) {
      selectedItemIds = selectedItemIds.filter((id) => id !== itemId);
    } else {
      selectedItemIds = [...selectedItemIds, itemId];
    }
  }

  function selectAllItems() {
    selectedItemIds = (parsedPreview.items || []).map((it) => it.id);
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
        ocrEngineName = "Simulasi Struk Otomatis";
      } else {
        const ocrRes = await extractTextFromReceiptImage(comp.canvas, (msg) => {
          progressText = msg;
        });
        ocrEngineName = ocrRes.engine;
        if (ocrRes.text) {
          rawReceiptText = ocrRes.text;
        } else if (!rawReceiptText) {
          errorMsg =
            "Foto berhasil dikompres ke WebP (<80KB). Teks tidak terdeteksi otomatis — Anda tetap bisa melanjutkan dengan lampiran foto ini ke Form Verifikasi.";
        }
      }
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
      await processFile(selectedFile, rawReceiptText);
    }
  }

  async function loadSampleReceipt(sample) {
    isProcessing = true;
    errorMsg = "";
    progressText = "Membuat & memindai contoh struk...";
    try {
      const sampleFile = await generateSampleReceiptFile(sample);
      await processFile(sampleFile, sample.lines.join("\n"));
    } finally {
      isProcessing = false;
      progressText = "";
    }
  }

  function resetScanner() {
    revokePreview();
    selectedFile = null;
    compressedResult = null;
    rawReceiptText = "";
    ocrEngineName = "";
    selectedItemIds = [];
    showRawOcr = false;
    errorMsg = "";
  }

  function handleConfirm() {
    if (!compressedResult && !rawReceiptText.trim()) {
      errorMsg = "Pilih foto struk atau klik simulasi struk terlebih dahulu.";
      return;
    }

    const plainSelectedItems = selectedItems.map((it, idx) => ({
      id: String(it.id || `item-${idx + 1}`),
      name: String(it.name || ""),
      amount: Math.round(Number(it.amount) || 0),
    }));

    const payload = {
      ...parsedPreview,
      amount: effectiveAmount,
      note: effectiveNote,
      items: plainSelectedItems,
      metadata: {
        ...parsedPreview.metadata,
        items: plainSelectedItems,
      },
      attachment_blob: skipSavingImage ? null : compressedResult?.blob || null,
    };

    onApply(payload);
    resetScanner();
  }
</script>

{#if isOpen}
  <div
    class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4 overflow-y-auto"
  >
    <div
      class="bg-white w-full max-w-xl rounded-t-2xl sm:rounded-2xl border border-slate-200 shadow-2xl overflow-hidden max-h-[95vh] flex flex-col"
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
            Scan Foto Struk / Nota (WebP + OCR)
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
        {#if errorMsg}
          <div
            class="p-2.5 bg-amber-50 border border-amber-300 text-amber-900 rounded-xl text-xs font-bold"
          >
            {errorMsg}
          </div>
        {/if}

        <!-- Hidden File Inputs (Kamera & Galeri) -->
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

        <!-- 1. Tombol Akuisisi Foto (Kamera / Galeri) -->
        <div class="grid grid-cols-2 gap-2">
          <button
            type="button"
            onclick={() => cameraInputEl?.click()}
            class="py-3 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-extrabold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-2xs transition-colors"
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
            <span>Foto Kamera</span>
          </button>

          <button
            type="button"
            onclick={() => galleryInputEl?.click()}
            class="py-3 px-3 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-xl font-extrabold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-2xs transition-colors"
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
            <span>Pilih dari Galeri</span>
          </button>
        </div>

        <!-- Simulasi Struk Cepat (List Produk vs 1 Total) -->
        <!-- <div>
          <span
            class="block text-[11px] font-bold uppercase text-slate-500 mb-1"
          >
            Atau Uji Coba Simulasi Struk Otomatis:
          </span>
          <div class="grid grid-cols-2 gap-1.5">
            {#each SAMPLE_RECEIPTS as sample}
              <button
                type="button"
                onclick={() => loadSampleReceipt(sample)}
                class="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-700 text-left truncate cursor-pointer transition-colors"
              >
                🧾 {sample.label}
              </button>
            {/each}
          </div>
        </div> -->

        <!-- Opsi Optimasi Memori & Storage (PRD 4.2) -->
        <div
          class="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2"
        >
          <label
            class="flex items-center justify-between gap-2 cursor-pointer select-none"
          >
            <span class="text-xs font-bold text-slate-800">
              Mode Kontras Tinggi / Hitam-Putih (Tajam & Hemat KB)
            </span>
            <input
              type="checkbox"
              bind:checked={highContrastMode}
              onchange={handleToggleHighContrast}
              class="w-4 h-4 accent-slate-900 rounded cursor-pointer"
            />
          </label>

          <label
            class="flex items-center justify-between gap-2 cursor-pointer select-none border-t border-slate-200/80 pt-2"
          >
            <div>
              <span class="text-xs font-extrabold text-slate-900 block">
                Hanya ambil teks, jangan simpan gambar
              </span>
              <!-- <span class="text-[10px] text-slate-500 block">
                Opsi hemat ekstrem: ekstrak angka & tanggal ke form tanpa
                menyimpan foto struk di database.
              </span> -->
            </div>
            <input
              type="checkbox"
              bind:checked={skipSavingImage}
              class="w-4 h-4 accent-amber-700 rounded cursor-pointer shrink-0"
            />
          </label>
        </div>

        {#if isProcessing}
          <div
            class="p-4 bg-slate-100 border border-slate-200 rounded-2xl text-center"
          >
            <span class="text-xs font-extrabold text-slate-700 animate-pulse">
              {progressText || "Memproses gambar & mengekstrak teks..."}
            </span>
          </div>
        {/if}

        <!-- Preview Gambar Hasil Kompresi WebP + Tampilan Adaptif (List Produk vs Single Total) -->
        {#if compressedResult || rawReceiptText}
          <div class="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
            {#if compressedResult && previewUrl}
              <div
                class="sm:col-span-5 bg-slate-100 border border-slate-200 rounded-2xl p-2.5 flex flex-col items-center"
              >
                <div class="w-full flex items-center justify-between mb-1.5">
                  <!-- <span
                    class="px-2 py-0.5 bg-emerald-700 text-white rounded-md text-[10px] font-extrabold tabular-nums"
                  >
                    WebP • {compressedResult.sizeKB} KB
                  </span> -->
                  <!-- <span
                    class="text-[10px] font-semibold text-slate-500 tabular-nums"
                  >
                    {compressedResult.width}×{compressedResult.height}px
                  </span> -->
                </div>
                <img
                  src={previewUrl}
                  alt="Preview Struk WebP"
                  class="max-h-48 w-auto object-contain rounded-lg border border-slate-300 bg-white"
                />
                <div
                  class="w-full flex items-center justify-between mt-1.5 text-[10px] text-slate-500"
                >
                  <!-- <span>Asal: {compressedResult.originalSizeKB} KB</span>
                  {#if skipSavingImage}
                    <span class="text-amber-700 font-bold">Tidak Disimpan</span>
                  {:else}
                    <span class="text-emerald-700 font-bold"
                      >✓ &lt; 80 KB Aman</span
                    >
                  {/if} -->
                </div>
              </div>
            {/if}

            <!-- Kolom Kanan: Adaptif List Produk (jika ada item) ATAU Single Total (jika 1 nilai saja) -->
            <div
              class="{compressedResult && previewUrl
                ? 'sm:col-span-7'
                : 'sm:col-span-12'} space-y-2"
            >
              <div class="flex items-center justify-between">
                <span
                  class="text-[11px] font-extrabold uppercase text-slate-600"
                >
                  {#if (parsedPreview.items?.length || 0) > 0}
                    Daftar Produk Terdeteksi ({selectedItems.length}/{parsedPreview
                      .items.length})
                  {:else}
                    Ringkasan Nota (1 Total)
                  {/if}
                </span>

                <div class="flex items-center gap-2.5">
                  {#if (parsedPreview.items?.length || 0) > 1 && selectedItems.length < parsedPreview.items.length}
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
                    onclick={resetScanner}
                    class="text-[11px] font-bold text-rose-600 hover:text-rose-800 cursor-pointer"
                  >
                    Reset
                  </button>
                </div>
              </div>

              {#if (parsedPreview.items?.length || 0) > 0}
                <!-- MODE 1: ADA LIST PRODUK (Checklist Interaktif + Baris Total) -->
                <div
                  class="bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden"
                >
                  <div
                    class="divide-y divide-slate-200/80 max-h-44 overflow-y-auto"
                  >
                    {#each parsedPreview.items as item (item.id)}
                      {@const isChecked = selectedItemIds.includes(item.id)}
                      <label
                        class="flex items-center justify-between gap-2 px-3 py-2 cursor-pointer select-none transition-colors {isChecked
                          ? 'bg-white hover:bg-slate-50'
                          : 'bg-slate-100/70 text-slate-400'}"
                      >
                        <div class="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onchange={() => toggleItemSelection(item.id)}
                            class="w-3.5 h-3.5 accent-slate-900 rounded cursor-pointer shrink-0"
                          />
                          <span
                            class="text-xs font-bold truncate {isChecked
                              ? 'text-slate-800'
                              : 'line-through text-slate-400'}"
                          >
                            {item.name}
                          </span>
                        </div>
                        <span
                          class="text-xs font-extrabold tabular-nums shrink-0 {isChecked
                            ? 'text-slate-900'
                            : 'line-through text-slate-400'}"
                        >
                          {formatIDR(item.amount)}
                        </span>
                      </label>
                    {/each}
                  </div>

                  <!-- Footer Total dari List Produk -->
                  <div
                    class="px-3 py-2 bg-slate-100 border-t border-slate-200 flex items-center justify-between"
                  >
                    <span
                      class="text-[11px] font-extrabold uppercase text-slate-600"
                    >
                      Total Dipilih ({selectedItems.length} item)
                    </span>
                    <span
                      class="text-sm font-extrabold tabular-nums text-emerald-800"
                    >
                      {formatIDR(effectiveAmount)}
                    </span>
                  </div>
                </div>
              {:else}
                <!-- MODE 2: HANYA 1 TOTAL (Tanpa Rincian Produk / Kwitansi Tunggal) -->
                <div
                  class="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col justify-between space-y-2"
                >
                  <div>
                    <span
                      class="text-[10px] font-bold uppercase text-slate-400 block"
                    >
                      Toko / Penerbit Nota
                    </span>
                    <span
                      class="text-xs font-extrabold text-slate-800 block mt-0.5"
                    >
                      {parsedPreview.merchant || "Nota Tanpa Rincian Produk"}
                    </span>
                  </div>
                  <div
                    class="pt-2 border-t border-slate-200/80 flex items-baseline justify-between"
                  >
                    <span
                      class="text-[11px] font-extrabold uppercase text-slate-500"
                    >
                      Nominal Total
                    </span>
                    <span
                      class="text-lg font-extrabold tabular-nums text-emerald-800"
                    >
                      {formatIDR(effectiveAmount)}
                    </span>
                  </div>
                </div>
              {/if}

              <!-- Toggle Opsional: Lihat Teks Asli OCR (Read-Only) -->
              {#if rawReceiptText}
                <div>
                  <button
                    type="button"
                    onclick={() => (showRawOcr = !showRawOcr)}
                    class="text-[11px] font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    {showRawOcr
                      ? "Sembunyikan Teks Asli▲"
                      : `Lihat Teks Asli ▼`}
                  </button>
                  {#if showRawOcr}
                    <textarea
                      rows="4"
                      value={rawReceiptText}
                      readonly
                      class="mt-1.5 w-full px-3 py-2 bg-slate-50 text-slate-600 border border-slate-200 rounded-xl text-[11px] font-mono leading-relaxed focus:outline-none cursor-default resize-none"
                    ></textarea>
                  {/if}
                </div>
              {/if}
            </div>
          </div>
        {:else}
          <!-- State Kosong Sebelum Pilih Foto / Simulasi -->
          <div
            class="p-4 bg-slate-50 border border-dashed border-slate-300 rounded-2xl text-center"
          >
            <p class="text-xs font-bold text-slate-600">
              Belum ada struk yang dipindai
            </p>
            <!-- <p class="text-[11px] text-slate-400 mt-0.5">
              Ambil foto dari Kamera/Galeri atau klik salah satu tombol Simulasi
              Struk di atas.
            </p> -->
          </div>
        {/if}

        <!-- Ringkasan Hasil Ekstraksi yang Akan Masuk ke Form -->
        <div
          class="p-3.5 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-2"
        >
          <div
            class="flex items-center justify-between border-b border-slate-200 pb-2"
          >
            <span
              class="text-[11px] font-extrabold uppercase tracking-wider text-slate-500"
            >
              Ringkasan Data
            </span>
            <span
              class="text-[11px] font-extrabold tabular-nums text-emerald-800"
            >
              {effectiveAmount > 0 ? "✓" : ""}
            </span>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
            <div>
              <span class="text-[10px] font-bold uppercase text-slate-400 block"
                >Total Nominal</span
              >
              <span
                class="text-sm sm:text-base font-extrabold tabular-nums text-slate-900"
              >
                {formatIDR(effectiveAmount)}
              </span>
            </div>
            <div>
              <span class="text-[10px] font-bold uppercase text-slate-400 block"
                >Tanggal Struk</span
              >
              <span class="font-bold tabular-nums text-slate-800">
                {formatDateShort(parsedPreview.date)}
              </span>
            </div>
            <div>
              <span class="text-[10px] font-bold uppercase text-slate-400 block"
                >Toko / Vendor</span
              >
              <span class="font-bold text-slate-800 truncate block">
                {parsedPreview.merchant || "-"}
              </span>
            </div>
            <div>
              <span class="text-[10px] font-bold uppercase text-slate-400 block"
                >No. Nota / Bukti</span
              >
              <span
                class="font-bold tabular-nums text-slate-700 truncate block"
              >
                {parsedPreview.metadata?.no_bukti || "-"}
              </span>
            </div>
            <div>
              <span class="text-[10px] font-bold uppercase text-slate-400 block"
                >Kategori Cocok</span
              >
              <span class="font-bold text-slate-700 truncate block">
                {categoriesMap[parsedPreview.category_id]?.name || "-"}
              </span>
            </div>
            <div>
              <span class="text-[10px] font-bold uppercase text-slate-400 block"
                >Lampiran Foto</span
              >
              <span
                class="font-bold {skipSavingImage || !compressedResult
                  ? 'text-slate-500'
                  : 'text-emerald-700'}"
              >
                {#if skipSavingImage}
                  Tanpa Gambar (Teks Saja)
                {:else if compressedResult}
                  WebP ({compressedResult.sizeKB} KB)
                {:else}
                  Belum Ada Foto
                {/if}
              </span>
            </div>
          </div>

          {#if effectiveNote && (compressedResult || rawReceiptText)}
            <div class="pt-1.5 border-t border-slate-200/80">
              <span
                class="text-[10px] font-bold uppercase text-slate-400 block"
              >
                Catatan Otomatis
              </span>
              <span class="text-xs font-semibold text-slate-800">
                {effectiveNote}
              </span>
            </div>
          {/if}
        </div>

        <!-- Footer Aksi -->
        <div
          class="flex items-center justify-end gap-2 pt-2 border-t border-slate-200"
        >
          <button
            type="button"
            onclick={onClose}
            class="px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            onclick={handleConfirm}
            class="px-4 py-2 text-xs font-extrabold text-white rounded-xl cursor-pointer {headerBgCls}"
          >
            Isi ke Form →
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
