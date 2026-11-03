<script>
  import { verifyPinLock } from '../lib/utils/cryptoBackup.js';

  let { onUnlocked } = $props();

  let pinDigits = $state('');
  let errorMsg = $state('');
  let isChecking = $state(false);

  async function checkPinNow(pinValue) {
    if (pinValue.length !== 6 || isChecking) return;
    isChecking = true;
    errorMsg = '';

    const ok = await verifyPinLock(pinValue);
    isChecking = false;

    if (ok) {
      pinDigits = '';
      onUnlocked?.();
    } else {
      errorMsg = 'PIN 6 digit tidak sesuai.';
      pinDigits = '';
    }
  }

  function appendDigit(d) {
    if (pinDigits.length >= 6 || isChecking) return;
    errorMsg = '';
    const next = pinDigits + String(d);
    pinDigits = next;
    if (next.length === 6) {
      checkPinNow(next);
    }
  }

  function removeLastDigit() {
    if (pinDigits.length === 0 || isChecking) return;
    errorMsg = '';
    pinDigits = pinDigits.slice(0, -1);
  }

  function clearDigits() {
    if (isChecking) return;
    errorMsg = '';
    pinDigits = '';
  }

  function handleKeydown(e) {
    if (e.key >= '0' && e.key <= '9') {
      e.preventDefault();
      appendDigit(e.key);
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      removeLastDigit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      clearDigits();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="fixed inset-0 z-[100] bg-indigo-950 text-white flex flex-col items-center justify-center p-4 select-none">
  <div class="w-full max-w-xs space-y-6 text-center">
    <!-- Ikon Kunci & Header -->
    <div class="space-y-2">
      <div class="w-12 h-12 rounded-2xl bg-indigo-900 border border-indigo-800 mx-auto flex items-center justify-center">
        <svg class="w-6 h-6 text-indigo-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>
      <h1 class="text-base font-extrabold uppercase tracking-wider">Buku Kas Terkunci</h1>
      <p class="text-xs text-indigo-200/80 font-medium">
        Masukkan 6 digit PIN keamanan lokal
      </p>
    </div>

    <!-- Indikator 6 Titik PIN -->
    <div class="flex items-center justify-center gap-3 py-1">
      {#each [0, 1, 2, 3, 4, 5] as idx}
        <div
          class="w-3.5 h-3.5 rounded-full border-2 transition-all {pinDigits.length > idx
            ? 'bg-white border-white scale-110'
            : 'bg-transparent border-indigo-400/60'}"
        ></div>
      {/each}
    </div>

    {#if errorMsg}
      <div class="px-3 py-1.5 bg-rose-900/90 border border-rose-700 rounded-xl text-xs font-bold text-rose-100">
        {errorMsg}
      </div>
    {/if}

    <!-- Keypad Angka 3x4 -->
    <div class="grid grid-cols-3 gap-2.5 pt-1">
      {#each [1, 2, 3, 4, 5, 6, 7, 8, 9] as num}
        <button
          type="button"
          onclick={() => appendDigit(num)}
          class="py-3.5 rounded-2xl bg-indigo-900/80 hover:bg-indigo-800 active:scale-95 border border-indigo-800/80 text-lg font-extrabold tabular-nums transition-all cursor-pointer"
        >
          {num}
        </button>
      {/each}

      <button
        type="button"
        onclick={clearDigits}
        class="py-3.5 rounded-2xl bg-indigo-900/40 hover:bg-indigo-800/70 active:scale-95 border border-indigo-800/60 text-xs font-extrabold uppercase tracking-wider text-indigo-200 transition-all cursor-pointer"
      >
        Reset
      </button>

      <button
        type="button"
        onclick={() => appendDigit(0)}
        class="py-3.5 rounded-2xl bg-indigo-900/80 hover:bg-indigo-800 active:scale-95 border border-indigo-800/80 text-lg font-extrabold tabular-nums transition-all cursor-pointer"
      >
        0
      </button>

      <button
        type="button"
        onclick={removeLastDigit}
        aria-label="Hapus 1 Digit"
        class="py-3.5 rounded-2xl bg-indigo-900/40 hover:bg-indigo-800/70 active:scale-95 border border-indigo-800/60 flex items-center justify-center text-indigo-200 transition-all cursor-pointer"
      >
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
          <line x1="18" y1="9" x2="12" y2="15" />
          <line x1="12" y1="9" x2="18" y2="15" />
        </svg>
      </button>
    </div>
  </div>
</div>

