<script>
  /**
   * CalculatorKeypad.svelte
   * Keypad kalkulator pintasan cepat untuk input nominal transaksi:
   * - Preset penambahan nominal (+10rb, +50rb, +100rb, .000)
   * - Operasi aritmatika cepat (+, -, *, /) & tombol evaluasi (=)
   */
  let {
    show = false,
    onAppend,
    onAddPreset,
    onEvaluate
  } = $props();

  const presets = [
    { label: "+10rb", val: 10000 },
    { label: "+50rb", val: 50000 },
    { label: "+100rb", val: 100000 },
    { label: ".000", op: "000" }
  ];

  const operators = [
    { label: "+", op: "+" },
    { label: "−", op: "-" },
    { label: "×", op: "*" },
    { label: "÷", op: "/" }
  ];
</script>

<div class="{show ? 'block' : 'hidden md:block'} space-y-1.5 pt-0.5">
  <!-- Baris 1: Preset Nominal Cepat -->
  <div class="grid grid-cols-4 gap-1.5">
    {#each presets as item}
      <button
        type="button"
        onclick={() => item.op ? onAppend?.(item.op) : onAddPreset?.(item.val)}
        class="py-1.5 bg-white hover:bg-slate-100 active:bg-slate-200 border border-slate-200/90 rounded-lg text-[11px] font-extrabold text-slate-700 tabular-nums cursor-pointer transition-colors"
      >
        {item.label}
      </button>
    {/each}
  </div>

  <!-- Baris 2: Operator Aritmatika & Evaluasi -->
  <div class="grid grid-cols-5 gap-1.5">
    {#each operators as calc}
      <button
        type="button"
        onclick={() => onAppend?.(calc.op)}
        class="py-1.5 bg-white hover:bg-slate-100 active:bg-slate-200 border border-slate-300 rounded-lg text-sm font-extrabold text-slate-800 tabular-nums cursor-pointer transition-colors"
      >
        {calc.label}
      </button>
    {/each}
    <button
      type="button"
      onclick={() => onEvaluate?.()}
      class="py-1.5 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white rounded-lg text-xs font-extrabold tabular-nums cursor-pointer transition-colors"
    >
      =
    </button>
  </div>
</div>

