<script>
  import { registerModalHistory } from "../lib/utils/modalHistory.js";

  let {
    isOpen = false,
    onCreateWorkspace,
    onClose
  } = $props();

  $effect(() => {
    if (isOpen) {
      return registerModalHistory("add-workspace", () => {
        handleClose();
      });
    }
  });

  let wsType = $state('business'); // 'business' | 'pekerjaan'
  let wsName = $state('');
  let errorMsg = $state('');
  let isSubmitting = $state(false);

  function resetForm() {
    wsType = 'business';
    wsName = '';
    errorMsg = '';
    isSubmitting = false;
  }

  function handleClose() {
    resetForm();
    onClose?.();
  }

  async function handleSubmit(e) {
    e?.preventDefault();
    errorMsg = '';
    const trimmed = wsName.trim();
    if (!trimmed) {
      errorMsg = wsType === 'business'
        ? 'Nama usaha / toko wajib diisi.'
        : 'Nama pekerjaan / instansi wajib diisi.';
      return;
    }

    isSubmitting = true;
    try {
      if (onCreateWorkspace) {
        await onCreateWorkspace({ name: trimmed, type: wsType });
      }
      handleClose();
    } catch (err) {
      errorMsg = err.message || 'Gagal membuat buku kas.';
    } finally {
      isSubmitting = false;
    }
  }

  function handleKeydown(e) {
    if (e.key === 'Escape' && isOpen) {
      handleClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    onclick={handleClose}
    class="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
  >
    <div
      onclick={(e) => e.stopPropagation()}
      class="bg-white w-full max-w-md rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col"
    >
      <!-- Header Modal -->
      <div
        class="px-5 py-4 text-white flex items-center justify-between transition-colors {wsType === 'business'
          ? 'bg-teal-900'
          : 'bg-emerald-900'}"
      >
        <div class="flex items-center gap-2">
          {#if wsType === 'business'}
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
          {:else}
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect width="20" height="14" x="2" y="7" rx="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
          {/if}
          <h2 class="text-sm font-extrabold uppercase tracking-wide">
            {wsType === 'business' ? 'Tambah Buku Usaha' : 'Tambah Buku Pekerjaan'}
          </h2>
        </div>
        <button
          type="button"
          onclick={handleClose}
          aria-label="Tutup Modal"
          class="p-1 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer"
        >
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <path d="M18 6 6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>

      <!-- Form Body -->
      <form onsubmit={handleSubmit} class="p-5 space-y-4">
        <!-- 1. Pilihan Tipe Buku Kas -->
        <div>
          <span class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            Pilih Jenis Buku Kas
          </span>
          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              onclick={() => (wsType = 'business')}
              class="p-3 rounded-xl border text-left transition-all cursor-pointer {wsType === 'business'
                ? 'bg-teal-50 border-teal-700 ring-2 ring-teal-700/20 text-teal-950'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}"
            >
              <div class="flex items-center gap-2 mb-1">
                <span class="w-2.5 h-2.5 rounded-full {wsType === 'business' ? 'bg-teal-700' : 'bg-slate-300'}"></span>
                <span class="text-xs font-extrabold uppercase tracking-wide">Buku Usaha</span>
              </div>
              <p class="text-[11px] text-slate-500 leading-snug">
                Omzet, modal, HPP, operasional & karyawan usaha.
              </p>
            </button>

            <button
              type="button"
              onclick={() => (wsType = 'pekerjaan')}
              class="p-3 rounded-xl border text-left transition-all cursor-pointer {wsType === 'pekerjaan'
                ? 'bg-emerald-50 border-emerald-700 ring-2 ring-emerald-700/20 text-emerald-950'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}"
            >
              <div class="flex items-center gap-2 mb-1">
                <span class="w-2.5 h-2.5 rounded-full {wsType === 'pekerjaan' ? 'bg-emerald-700' : 'bg-slate-300'}"></span>
                <span class="text-xs font-extrabold uppercase tracking-wide">Buku Pekerjaan</span>
              </div>
              <p class="text-[11px] text-slate-500 leading-snug">
                Gaji, honor proyek, SPJ dinas & dana talangan.
              </p>
            </button>
          </div>
        </div>

        <!-- 2. Input Nama Buku Kas -->
        <div>
          <label for="ws-name-input" class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            {wsType === 'business' ? 'Nama Usaha / Toko' : 'Nama Pekerjaan / Instansi'} <span class="text-rose-500">*</span>
          </label>
          <input
            id="ws-name-input"
            type="text"
            bind:value={wsName}
            required
            placeholder={wsType === 'business'
              ? 'misal: Warung Kopi Berkah, Toko Sembako'
              : 'misal: Kantor Desa, CV Maju Jaya, Proyek IT'}
            class="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition-all font-medium"
          />
          <p class="text-[11px] text-slate-500 mt-1">
            {wsType === 'business'
              ? 'Otomatis dibuatkan dompet kas usaha dan kategori pendapatan/pengeluaran usaha.'
              : 'Otomatis dibuatkan dompet operasional dan kategori gaji, SPJ serta dana talangan.'}
          </p>
        </div>

        {#if errorMsg}
          <div class="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-medium">
            {errorMsg}
          </div>
        {/if}

        <!-- Tombol Aksi -->
        <div class="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
          <button
            type="button"
            onclick={handleClose}
            disabled={isSubmitting}
            class="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            class="px-5 py-2 text-xs font-extrabold text-white rounded-xl shadow-2xs transition-colors cursor-pointer inline-flex items-center gap-1.5 {wsType === 'business'
              ? 'bg-teal-900 hover:bg-teal-800'
              : 'bg-emerald-900 hover:bg-emerald-800'}"
          >
            {#if isSubmitting}
              <svg class="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              <span>Menyimpan...</span>
            {:else}
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                <path d="M20 6 9 17l-5-5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <span>Simpan Buku Kas</span>
            {/if}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
