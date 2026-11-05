<script>
  import { compressReceiptImage } from "../lib/utils/imageCompressor.js";

  /**
   * ReceiptAttachmentField.svelte
   * Sub-komponen pemilihan dan kompresi foto struk lokal (WebP < 80 KB).
   */
  let {
    attachmentBlob = null,
    onAttachmentChange,
    onError
  } = $props();

  let previewUrl = $state("");
  let sizeKB = $state(0);
  let isCompressing = $state(false);
  let fileInputEl = $state(null);

  $effect(() => {
    const blob = attachmentBlob;
    if (blob) {
      const url = URL.createObjectURL(blob);
      previewUrl = url;
      sizeKB = Math.round(((blob.size || 0) / 1024) * 10) / 10;
      return () => {
        URL.revokeObjectURL(url);
      };
    } else {
      previewUrl = "";
      sizeKB = 0;
    }
  });

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    isCompressing = true;
    try {
      const comp = await compressReceiptImage(file, {
        maxDimension: 1000,
        initialQuality: 0.6,
        highContrast: false,
      });
      onAttachmentChange?.(comp.blob);
    } catch (err) {
      onError?.(err?.message || "Gagal mengompres foto lampiran.");
    } finally {
      isCompressing = false;
      e.target.value = "";
    }
  }
</script>

<div class="p-3 bg-slate-50 border border-slate-200/90 rounded-2xl">
  <input
    bind:this={fileInputEl}
    type="file"
    accept="image/*"
    onchange={handleFileChange}
    class="hidden"
  />
  <div class="flex items-center justify-between gap-2">
    <div>
      <span class="block text-[11px] font-bold uppercase text-slate-500">
        Lampiran Foto Struk
      </span>
      <span class="text-[10px] text-slate-400">
        {#if attachmentBlob}
          WebP • {sizeKB} KB (&lt; 80 KB)
        {:else}
          Opsional
        {/if}
      </span>
    </div>

    <div class="flex items-center gap-1.5">
      {#if attachmentBlob}
        <button
          type="button"
          onclick={() => onAttachmentChange?.(null)}
          class="px-2 py-1 text-[11px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg cursor-pointer"
        >
          Hapus
        </button>
      {/if}
      <button
        type="button"
        onclick={() => fileInputEl?.click()}
        class="px-2.5 py-1 text-[11px] font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg cursor-pointer"
      >
        {isCompressing
          ? "Kompres..."
          : attachmentBlob
            ? "Ganti Foto"
            : "+ Foto"}
      </button>
    </div>
  </div>

  {#if previewUrl}
    <div
      class="mt-2 pt-2 border-t border-slate-200/80 flex items-center gap-2.5"
    >
      <img
        src={previewUrl}
        alt="Lampiran Struk"
        class="w-12 h-12 object-cover rounded-lg border border-slate-300 bg-white shrink-0"
      />
      <div class="text-[11px] text-slate-600 min-w-0">
        <div class="font-extrabold text-emerald-800 tabular-nums">
          ✓ Struk Siap Disimpan ({sizeKB} KB)
        </div>
        <p class="text-[10px] text-slate-400 truncate">
          Tersimpan lokal di IndexedDB.
        </p>
      </div>
    </div>
  {/if}
</div>

