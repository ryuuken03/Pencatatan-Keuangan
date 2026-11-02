<script>
  import {
    formatIDR,
    formatNumber,
    evaluateNominalExpression,
  } from "../lib/utils.js";

  let {
    isOpen = false,
    activeWorkspace = "personal",
    accounts = [],
    categories = [],
    accountBalances = {},
    onSaveAccount,
    onDeleteAccount,
    onSaveCategory,
    onDeleteCategory,
    onClose,
  } = $props();

  let activeTab = $state("accounts");

  let editingAccId = $state(null);
  let accName = $state("");
  let accType = $state("cash");
  let accInitialBalance = $state("");

  let editingCatId = $state(null);
  let catName = $state("");
  let catType = $state("expense");
  let catKeywords = $state("");

  const workspaceLabel = $derived(
    activeWorkspace === "personal"
      ? "Buku Pribadi"
      : activeWorkspace === "business"
        ? "Buku Usaha"
        : "Manager Kopdes",
  );

  const headerBgCls = $derived(
    activeWorkspace === "business"
      ? "bg-teal-900"
      : activeWorkspace === "kopdes"
        ? "bg-emerald-900"
        : "bg-indigo-950",
  );

  const primaryBtnCls = $derived(
    activeWorkspace === "business"
      ? "bg-teal-900 hover:bg-teal-800 text-white"
      : activeWorkspace === "kopdes"
        ? "bg-emerald-900 hover:bg-emerald-800 text-white"
        : "bg-indigo-950 hover:bg-indigo-900 text-white",
  );

  function resetAccForm() {
    editingAccId = null;
    accName = "";
    accType = "cash";
    accInitialBalance = "";
  }

  function startEditAcc(acc) {
    editingAccId = acc.id;
    accName = acc.name;
    accType = acc.type;
    accInitialBalance = formatNumber(acc.initial_balance || 0);
  }

  async function handleAccSubmit(e) {
    e.preventDefault();
    if (!accName.trim()) return;
    await onSaveAccount({
      id: editingAccId,
      workspace_id: activeWorkspace,
      name: accName.trim(),
      type: accType,
      initial_balance: evaluateNominalExpression(accInitialBalance),
    });
    resetAccForm();
  }

  function resetCatForm() {
    editingCatId = null;
    catName = "";
    catType = "expense";
    catKeywords = "";
  }

  function startEditCat(cat) {
    editingCatId = cat.id;
    catName = cat.name;
    catType = cat.type;
    catKeywords = cat.keywords || "";
  }

  async function handleCatSubmit(e) {
    e.preventDefault();
    if (!catName.trim()) return;
    await onSaveCategory({
      id: editingCatId,
      workspace_id: activeWorkspace,
      name: catName.trim(),
      type: catType,
      keywords: catKeywords.trim(),
    });
    resetCatForm();
  }
</script>

{#if isOpen}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-3 sm:p-4"
  >
    <div
      class="bg-white w-full max-w-2xl rounded-2xl border border-slate-200 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
    >
      <!-- Header -->
      <div
        class="flex items-center justify-between px-4 py-3.5 {headerBgCls} text-white shrink-0"
      >
        <h2 class="text-xs sm:text-sm font-extrabold uppercase tracking-wide">
          Kelola Dompet & Kategori — {workspaceLabel}
        </h2>
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

      <!-- Tab Switcher -->
      <div
        class="grid grid-cols-2 border-b border-slate-200 bg-slate-100 p-1.5 shrink-0"
      >
        <button
          type="button"
          onclick={() => (activeTab = "accounts")}
          class="py-1.5 text-xs font-extrabold rounded-xl cursor-pointer transition-all {activeTab ===
          'accounts'
            ? 'bg-white text-slate-900 shadow-xs'
            : 'text-slate-600 hover:text-slate-900'}"
        >
          Daftar Dompet ({accounts.length})
        </button>
        <button
          type="button"
          onclick={() => (activeTab = "categories")}
          class="py-1.5 text-xs font-extrabold rounded-xl cursor-pointer transition-all {activeTab ===
          'categories'
            ? 'bg-white text-slate-900 shadow-xs'
            : 'text-slate-600 hover:text-slate-900'}"
        >
          Daftar Kategori ({categories.length})
        </button>
      </div>

      <!-- Content -->
      <div class="p-4 overflow-y-auto space-y-4 text-xs">
        {#if activeTab === "accounts"}
          <!-- Form Tambah / Edit Dompet -->
          <form
            onsubmit={handleAccSubmit}
            class="p-3.5 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-2.5"
          >
            <div class="font-extrabold text-slate-700 uppercase text-[11px]">
              {editingAccId ? "Edit Dompet" : "Tambah Dompet"}
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                placeholder="Nama Dompet"
                bind:value={accName}
                required
                class="px-3 py-1.5 bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-slate-900"
              />
              <select
                bind:value={accType}
                class="px-3 py-1.5 bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-slate-900"
              >
                <option value="cash">Kas Tunai (Cash)</option>
                <option value="bank">Rekening Bank</option>
                <option value="ewallet">E-Wallet</option>
              </select>
              <input
                type="text"
                placeholder="Saldo Awal (Rp)"
                bind:value={accInitialBalance}
                class="px-3 py-1.5 bg-white border border-slate-300 rounded-xl tabular-nums focus:outline-none focus:border-slate-900"
              />
            </div>
            <div class="flex items-center justify-end gap-2">
              {#if editingAccId}
                <button
                  type="button"
                  onclick={resetAccForm}
                  class="px-3 py-1.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-700 cursor-pointer"
                >
                  Batal Edit
                </button>
              {/if}
              <button
                type="submit"
                class="px-4 py-1.5 rounded-xl font-extrabold cursor-pointer {primaryBtnCls}"
              >
                {editingAccId ? "Simpan Perubahan" : "+ Tambah Dompet"}
              </button>
            </div>
          </form>

          <!-- Daftar Dompet: Mobile Card View (<640px / iPhone SE) & Desktop Table (>=640px) -->
          <!-- 1. Mobile Card View -->
          <div class="sm:hidden space-y-2">
            {#each accounts as acc (acc.id)}
              <div
                class="p-3 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-2"
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <div class="font-extrabold text-slate-900 text-xs truncate">
                      {acc.name}
                    </div>
                    <span
                      class="inline-block mt-0.5 px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-bold uppercase"
                    >
                      {acc.type}
                    </span>
                  </div>
                  <div class="flex items-center gap-2.5 shrink-0">
                    <button
                      type="button"
                      onclick={() => startEditAcc(acc)}
                      class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-[11px] cursor-pointer"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onclick={() => onDeleteAccount(acc.id)}
                      class="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg font-bold text-[11px] cursor-pointer"
                    >
                      Hapus
                    </button>
                  </div>
                </div>

                <div
                  class="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-[11px]"
                >
                  <div>
                    <div
                      class="text-slate-400 font-semibold uppercase text-[10px]"
                    >
                      Saldo Awal
                    </div>
                    <div class="tabular-nums font-bold text-slate-600 mt-0.5">
                      {formatIDR(acc.initial_balance)}
                    </div>
                  </div>
                  <div class="text-right">
                    <div
                      class="text-slate-400 font-semibold uppercase text-[10px]"
                    >
                      Saldo Saat Ini
                    </div>
                    <div
                      class="tabular-nums font-extrabold text-slate-900 mt-0.5"
                    >
                      {formatIDR(accountBalances[acc.id] ?? 0)}
                    </div>
                  </div>
                </div>
              </div>
            {/each}
          </div>

          <!-- 2. Desktop / Tablet Table View (>=640px) -->
          <div
            class="hidden sm:block border border-slate-200 rounded-2xl overflow-hidden"
          >
            <table class="w-full text-left border-collapse">
              <thead>
                <tr
                  class="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold uppercase text-slate-500"
                >
                  <th class="py-2.5 px-3">Nama Dompet</th>
                  <th class="py-2.5 px-3">Tipe</th>
                  <th class="py-2.5 px-3 text-right">Saldo Awal</th>
                  <th class="py-2.5 px-3 text-right">Saldo Saat Ini</th>
                  <th class="py-2.5 px-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200/70">
                {#each accounts as acc (acc.id)}
                  <tr class="hover:bg-slate-50">
                    <td class="py-2.5 px-3 font-bold text-slate-900"
                      >{acc.name}</td
                    >
                    <td
                      class="py-2.5 px-3 uppercase text-[11px] text-slate-500 font-semibold"
                      >{acc.type}</td
                    >
                    <td
                      class="py-2.5 px-3 text-right tabular-nums text-slate-600"
                      >{formatIDR(acc.initial_balance)}</td
                    >
                    <td
                      class="py-2.5 px-3 text-right tabular-nums font-extrabold text-slate-900"
                    >
                      {formatIDR(accountBalances[acc.id] ?? 0)}
                    </td>
                    <td class="py-2.5 px-3 text-right space-x-2">
                      <button
                        type="button"
                        onclick={() => startEditAcc(acc)}
                        class="text-slate-600 hover:text-slate-900 font-bold cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onclick={() => onDeleteAccount(acc.id)}
                        class="text-rose-600 hover:text-rose-800 font-bold cursor-pointer"
                      >
                        Hapus
                      </button>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else}
          <!-- Form Tambah / Edit Kategori -->
          <form
            onsubmit={handleCatSubmit}
            class="p-3.5 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-2.5"
          >
            <div class="font-extrabold text-slate-700 uppercase text-[11px]">
              {editingCatId ? "Edit Kategori" : "Tambah Kategori Baru"}
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                placeholder="Nama Kategori (misal: Jajan & Kafe)"
                bind:value={catName}
                required
                class="sm:col-span-2 px-3 py-1.5 bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-slate-900"
              />
              <select
                bind:value={catType}
                class="px-3 py-1.5 bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-slate-900"
              >
                <option value="expense">Pengeluaran</option>
                <option value="income">Pemasukan</option>
              </select>
            </div>
            <div>
              <input
                type="text"
                placeholder="Kata Kunci OCR/Suara Opsional (pisahkan koma, misal: kopi, mie, es teler, dairy)"
                bind:value={catKeywords}
                class="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-[11px] focus:outline-none focus:border-slate-900"
              />
            </div>
            <div class="flex items-center justify-end gap-2">
              {#if editingCatId}
                <button
                  type="button"
                  onclick={resetCatForm}
                  class="px-3 py-1.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-700 cursor-pointer"
                >
                  Batal Edit
                </button>
              {/if}
              <button
                type="submit"
                class="px-4 py-1.5 rounded-xl font-extrabold cursor-pointer {primaryBtnCls}"
              >
                {editingCatId ? "Simpan Perubahan" : "+ Tambah Kategori"}
              </button>
            </div>
          </form>

          <!-- Daftar Kategori -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <!-- Kategori Pengeluaran -->
            <div class="border border-slate-200 rounded-2xl overflow-hidden">
              <div
                class="bg-rose-50 border-b border-rose-200 px-3 py-2 font-extrabold text-rose-900 uppercase text-[11px]"
              >
                Kategori Pengeluaran
              </div>
              <div class="divide-y divide-slate-200/70">
                {#each categories.filter((c) => c.type === "expense") as cat (cat.id)}
                  <div
                    class="flex items-center justify-between gap-2 px-3 py-2 hover:bg-slate-50"
                  >
                    <div class="min-w-0">
                      <span class="font-semibold text-slate-800 block truncate">{cat.name}</span>
                      {#if cat.keywords}
                        <span class="text-[10px] text-slate-400 block truncate">Kata kunci: {cat.keywords}</span>
                      {/if}
                    </div>
                    <div class="flex items-center gap-2.5 shrink-0">
                      <button
                        type="button"
                        onclick={() => startEditCat(cat)}
                        class="text-slate-600 hover:text-slate-900 font-bold cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onclick={() => onDeleteCategory(cat.id)}
                        class="text-rose-600 hover:text-rose-800 font-bold cursor-pointer"
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                {/each}
              </div>
            </div>

            <!-- Kategori Pemasukan -->
            <div class="border border-slate-200 rounded-2xl overflow-hidden">
              <div
                class="bg-emerald-50 border-b border-emerald-200 px-3 py-2 font-extrabold text-emerald-900 uppercase text-[11px]"
              >
                Kategori Pemasukan
              </div>
              <div class="divide-y divide-slate-200/70">
                {#each categories.filter((c) => c.type === "income") as cat (cat.id)}
                  <div
                    class="flex items-center justify-between gap-2 px-3 py-2 hover:bg-slate-50"
                  >
                    <div class="min-w-0">
                      <span class="font-semibold text-slate-800 block truncate">{cat.name}</span>
                      {#if cat.keywords}
                        <span class="text-[10px] text-slate-400 block truncate">Kata kunci: {cat.keywords}</span>
                      {/if}
                    </div>
                    <div class="flex items-center gap-2.5 shrink-0">
                      <button
                        type="button"
                        onclick={() => startEditCat(cat)}
                        class="text-slate-600 hover:text-slate-900 font-bold cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onclick={() => onDeleteCategory(cat.id)}
                        class="text-rose-600 hover:text-rose-800 font-bold cursor-pointer"
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
