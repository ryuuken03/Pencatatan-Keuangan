<script>
  import { onDestroy } from "svelte";
  import { parseVoiceInput } from "../lib/parsers/voiceParser.js";
  import {
    formatIDR,
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
    onClose,
  } = $props();

  let transcript = $state("");
  let interimTranscript = $state("");
  let isListening = $state(false);
  let speechSupported = $state(false);
  let statusMsg = $state("");
  let errorMsg = $state("");
  let recognition = null;

  const EXAMPLE_SENTENCES = [
    "Beli bensin dan makan siang seratus dua puluh lima ribu",
    "Terima omzet penjualan usaha dua setengah juta ke rekening usaha",
    "Belanja alat kantor dan dinas satu juta tujuh ratus ribu pakai dana talangan",
    "Terima honor proyek tiga juta lima ratus ribu",
  ];

  // Cek dukungan Web Speech API di browser
  $effect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      speechSupported = Boolean(SpeechRecognition);
    }
  });

  // Reset saat modal dibuka/ditutup
  $effect(() => {
    if (isOpen) {
      errorMsg = "";
      statusMsg = speechSupported
        ? "Klik tombol Mikrofon lalu ucapkan transaksi dalam Bahasa Indonesia."
        : "Browser ini tidak mendukung Web Speech API. Ketik atau pilih contoh kalimat di bawah.";
    } else {
      stopListening();
    }
  });

  onDestroy(() => {
    stopListening();
  });

  let combinedText = $derived(
    (transcript + (interimTranscript ? " " + interimTranscript : "")).trim(),
  );

  let parsedPreview = $derived(
    parseVoiceInput(combinedText, {
      activeWorkspace,
      allAccounts,
      allCategories,
      allTransactions,
    }),
  );

  let accountsMap = $derived(
    Object.fromEntries(allAccounts.map((a) => [a.id, a])),
  );
  let categoriesMap = $derived(
    Object.fromEntries(allCategories.map((c) => [c.id, c])),
  );

  let effectiveWorkspaces = $derived(
    workspaces && workspaces.length > 0
      ? workspaces
      : [{ id: "personal", name: "Buku Pribadi", type: "personal" }]
  );

  let headerBgCls = $derived(
    getWorkspaceTheme(parsedPreview.workspace_id, effectiveWorkspaces).heroBg
  );

  function startListening() {
    errorMsg = "";
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      errorMsg =
        "Web Speech API tidak tersedia di browser ini. Silakan ketik kalimat langsung.";
      return;
    }

    try {
      stopListening();
      recognition = new SpeechRecognition();
      recognition.lang = "id-ID";
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        isListening = true;
        interimTranscript = "";
        statusMsg =
          'Mendengarkan... Silakan bicara (contoh: "Beli ATK dinas lima puluh ribu")';
      };

      recognition.onresult = (event) => {
        let finalChunk = "";
        let interimChunk = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          if (res.isFinal) {
            finalChunk += res[0].transcript;
          } else {
            interimChunk += res[0].transcript;
          }
        }
        if (finalChunk) {
          transcript = (transcript ? transcript + " " : "") + finalChunk.trim();
        }
        interimTranscript = interimChunk;
      };

      recognition.onerror = (event) => {
        isListening = false;
        interimTranscript = "";
        if (event.error === "not-allowed") {
          errorMsg =
            "Izin mikrofon ditolak. Izinkan akses mikrofon di browser atau ketik kalimat di bawah.";
        } else if (event.error === "no-speech") {
          errorMsg = "Suara tidak terdengar. Silakan coba lagi.";
        } else {
          errorMsg = `Gagal mengenali suara (${event.error}). Anda tetap bisa mengetik kalimat di bawah.`;
        }
      };

      recognition.onend = () => {
        isListening = false;
        interimTranscript = "";
        statusMsg = "Rekaman selesai. Periksa hasil deteksi di bawah.";
      };

      recognition.start();
    } catch (err) {
      isListening = false;
      errorMsg = err?.message || "Gagal memulai perekaman suara.";
    }
  }

  function stopListening() {
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        // ignore
      }
      recognition = null;
    }
    isListening = false;
    interimTranscript = "";
  }

  function toggleListening() {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }

  function handleConfirm() {
    if (!combinedText) {
      errorMsg = "Ucapkan atau ketik kalimat transaksi terlebih dahulu.";
      return;
    }
    stopListening();
    onApply(parsedPreview);
    transcript = "";
  }

  function getWorkspaceLabel(ws) {
    return getWorkspaceName(ws, effectiveWorkspaces);
  }

  function getTypeLabel(t) {
    if (t === "income") return "Pemasukan";
    if (t === "transfer") return "Transfer";
    if (t === "receivable") return "Piutang / Kasbon";
    if (t === "debt") return "Utang Masuk";
    return "Pengeluaran";
  }

  function handleKeydown(event) {
    if (isOpen && event.key === "Escape") {
      event.preventDefault();
      stopListening();
      onClose?.();
    }
  }

  function handleBackdropClick(event) {
    if (event.target === event.currentTarget) {
      stopListening();
      onClose?.();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    role="presentation"
    onclick={handleBackdropClick}
    class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4 overflow-y-auto"
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="voice-modal-title"
      tabindex="-1"
      class="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl border border-slate-200 shadow-2xl overflow-hidden max-h-[95vh] flex flex-col"
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
          <h2
            id="voice-modal-title"
            class="text-sm font-extrabold tracking-wide uppercase"
          >
            Input Suara Pintar
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
            class="p-2.5 bg-rose-50 border border-rose-300 text-rose-800 rounded-xl text-xs font-bold"
          >
            {errorMsg}
          </div>
        {/if}

        <!-- Tombol Rekam Mikrofon -->
        <div
          class="flex flex-col items-center justify-center p-4 bg-slate-50 border border-slate-200 rounded-2xl text-center"
        >
          <button
            type="button"
            onclick={toggleListening}
            class="w-14 h-14 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-md {isListening
              ? 'bg-rose-600 text-white ring-4 ring-rose-200 animate-pulse'
              : `${headerBgCls} text-white hover:opacity-95`}"
            title={isListening ? "Berhenti Rekam" : "Mulai Bicara"}
          >
            {#if isListening}
              <svg class="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            {:else}
              <svg
                class="w-6 h-6"
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
            {/if}
          </button>

          <p class="text-xs font-bold text-slate-800 mt-2.5">
            {isListening
              ? "Sedang Mendengarkan Suara..."
              : "Tekan Mikrofon untuk Bicara"}
          </p>
          <!-- <p class="text-[11px] text-slate-500 mt-0.5">{statusMsg}</p> -->
        </div>

        <!-- Textarea Kalimat (Hasil Suara / Ketik Cepat) -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <label
              for="voice-transcript"
              class="text-[11px] font-bold uppercase text-slate-500"
            >
              Kalimat Transaksi (Bisa Diedit)
            </label>
            {#if transcript}
              <button
                type="button"
                onclick={() => {
                  transcript = "";
                  interimTranscript = "";
                }}
                class="text-[11px] font-bold text-rose-600 hover:text-rose-800 cursor-pointer"
              >
                Bersihkan
              </button>
            {/if}
          </div>
          <textarea
            id="voice-transcript"
            rows="2"
            bind:value={transcript}
            placeholder="Contoh: Beli bensin pertalite seratus dua puluh lima ribu..."
            class="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm font-medium focus:outline-none focus:border-slate-900"
          ></textarea>
          {#if interimTranscript}
            <p class="text-[11px] text-slate-400 italic mt-1">
              Mendengar: "{interimTranscript}..."
            </p>
          {/if}
        </div>

        <!-- Contoh Kalimat Cepat (1-Klik Uji Coba) -->
        <!-- <div>
          <span
            class="block text-[11px] font-bold uppercase text-slate-500 mb-1.5"
          >
            Coba Contoh Kalimat Cepat:
          </span>
          <div class="flex flex-wrap gap-1.5">
            {#each EXAMPLE_SENTENCES as sample}
              <button
                type="button"
                onclick={() => (transcript = sample)}
                class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200/80 border border-slate-200/90 rounded-lg text-[11px] font-semibold text-slate-700 text-left cursor-pointer transition-colors"
              >
                "{sample}"
              </button>
            {/each}
          </div>
        </div> -->

        <!-- Hasil Parsing Otomatis (Live Preview) -->
        <div
          class="p-3.5 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-2"
        >
          <div
            class="flex items-center justify-between border-b border-slate-200 pb-2"
          >
            <span
              class="text-[11px] font-extrabold uppercase tracking-wider text-slate-500"
            >
              Hasil Deteksi Otomatis
            </span>
            <span
              class="px-2 py-0.5 text-[10px] font-extrabold uppercase rounded-md text-white {headerBgCls}"
            >
              {getWorkspaceLabel(parsedPreview.workspace_id)}
            </span>
          </div>

          <div class="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span class="text-[10px] font-bold uppercase text-slate-400 block"
                >Nominal (Rp)</span
              >
              <span
                class="text-sm sm:text-base font-extrabold tabular-nums text-slate-900"
              >
                {formatIDR(parsedPreview.amount)}
              </span>
            </div>
            <div>
              <span class="text-[10px] font-bold uppercase text-slate-400 block"
                >Tipe Transaksi</span
              >
              <span class="font-extrabold text-slate-800">
                {getTypeLabel(parsedPreview.type)}
              </span>
            </div>
            <div>
              <span class="text-[10px] font-bold uppercase text-slate-400 block"
                >Kategori</span
              >
              <span class="font-bold text-slate-700 truncate block">
                {categoriesMap[parsedPreview.category_id]?.name || "-"}
              </span>
            </div>
            <div>
              <span class="text-[10px] font-bold uppercase text-slate-400 block"
                >Dompet Kas</span
              >
              <span class="font-bold text-slate-700 truncate block">
                {accountsMap[parsedPreview.account_id]?.name || "-"}
              </span>
            </div>
          </div>

          {#if (getWorkspaceType(parsedPreview.workspace_id, effectiveWorkspaces) === "pekerjaan" || parsedPreview.workspace_id === "kopdes") && parsedPreview.metadata?.unit_usaha}
            <div class="pt-1 text-[11px] text-emerald-900 font-semibold">
              Divisi / Unit: <strong class="font-extrabold"
                >{parsedPreview.metadata.unit_usaha}</strong
              >
            </div>
          {/if}

          {#if parsedPreview.metadata?.reimburse_status === "pending"}
            <div
              class="px-2.5 py-1 bg-amber-100 border border-amber-300 text-amber-900 rounded-lg text-[11px] font-bold"
            >
              ✓ Terdeteksi Dana Talangan (Uang Pribadi / Reimburse)
            </div>
          {/if}

          <div class="pt-1 border-t border-slate-200/80">
            <span class="text-[10px] font-bold uppercase text-slate-400 block"
              >Catatan Bersih</span
            >
            <span class="text-xs font-semibold text-slate-800">
              {parsedPreview.note || "-"}
            </span>
          </div>
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
