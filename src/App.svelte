<script>
  import { onMount } from 'svelte';
  import {
    seedDatabase,
    loadAppData,
    computeAccountBalances,
    saveTransaction,
    softDeleteTransaction,
    settleReimbursement,
    saveAccount,
    softDeleteAccount,
    saveCategory,
    softDeleteCategory
  } from './lib/db.js';
  import WorkspaceSwitcher from './components/WorkspaceSwitcher.svelte';
  import TransactionList from './components/TransactionList.svelte';
  import TransactionForm from './components/TransactionForm.svelte';
  import ManageWalletCategoryModal from './components/ManageWalletCategoryModal.svelte';
  import VoiceInputModal from './components/VoiceInputModal.svelte';
  import ReceiptScannerModal from './components/ReceiptScannerModal.svelte';
  import ReceiptPreviewModal from './components/ReceiptPreviewModal.svelte';

  let activeWorkspace = $state('personal');
  let allAccounts = $state([]);
  let allCategories = $state([]);
  let allTransactions = $state([]);
  let isReady = $state(false);

  // Modal states
  let isTxModalOpen = $state(false);
  let editingTx = $state(null);
  let isManageModalOpen = $state(false);
  let isVoiceModalOpen = $state(false);
  let isReceiptModalOpen = $state(false);
  let previewReceiptTx = $state(null);

  async function refreshData() {
    const data = await loadAppData();
    allAccounts = data.accounts;
    allCategories = data.categories;
    allTransactions = data.transactions;
  }

  onMount(async () => {
    await seedDatabase();
    await refreshData();
    isReady = true;
  });

  // Lookup Maps
  let accountsMap = $derived(
    Object.fromEntries(allAccounts.map((a) => [a.id, a]))
  );
  let categoriesMap = $derived(
    Object.fromEntries(allCategories.map((c) => [c.id, c]))
  );

  // Saldo per Akun (Lintas Buku termasuk efek Dana Talangan / Reimburse)
  let accountBalances = $derived(
    computeAccountBalances(allAccounts, allTransactions)
  );

  // Akun & Kategori khusus Workspace aktif
  let activeAccounts = $derived(
    allAccounts.filter((a) => a.workspace_id === activeWorkspace)
  );
  let activeCategories = $derived(
    allCategories.filter((c) => c.workspace_id === activeWorkspace)
  );

  // Transaksi untuk Workspace aktif
  let activeTransactions = $derived(
    allTransactions.filter((tx) => {
      if (tx.workspace_id === activeWorkspace) return true;
      if (
        activeWorkspace === 'personal' &&
        tx.metadata?.reimburse_from_account_id &&
        accountsMap[tx.metadata.reimburse_from_account_id]?.workspace_id === 'personal'
      ) {
        return true;
      }
      return false;
    })
  );

  // Ringkasan (Summary) untuk Workspace aktif
  let workspaceSummary = $derived.by(() => {
    let totalBalance = 0;
    for (const acc of activeAccounts) {
      totalBalance += accountBalances[acc.id] ?? 0;
    }

    let income = 0;
    let expense = 0;
    let pendingReimburseCount = 0;
    let pendingReimburseTotal = 0;

    for (const tx of allTransactions) {
      const amt = Number(tx.amount) || 0;
      const isPendingReimburse = tx.metadata?.reimburse_status === 'pending';

      if (tx.workspace_id === activeWorkspace) {
        if (tx.type === 'income') income += amt;
        if (tx.type === 'expense') expense += amt;
        if (isPendingReimburse) {
          pendingReimburseCount += 1;
          pendingReimburseTotal += amt;
        }
      } else if (
        activeWorkspace === 'personal' &&
        isPendingReimburse &&
        tx.metadata?.reimburse_from_account_id
      ) {
        pendingReimburseCount += 1;
        pendingReimburseTotal += amt;
      }
    }

    return {
      totalBalance,
      income,
      expense,
      pendingReimburseCount,
      pendingReimburseTotal
    };
  });

  let mobileBtnCls = $derived(
    activeWorkspace === 'business'
      ? 'bg-teal-900 hover:bg-teal-800'
      : activeWorkspace === 'kopdes'
        ? 'bg-emerald-900 hover:bg-emerald-800'
        : 'bg-indigo-950 hover:bg-indigo-900'
  );

  // Handlers CRUD Transaksi
  function openNewTransaction() {
    editingTx = null;
    isTxModalOpen = true;
  }

  function openEditTransaction(tx) {
    editingTx = tx;
    isTxModalOpen = true;
  }

  function handleApplySmartInput(parsedData) {
    isVoiceModalOpen = false;
    isReceiptModalOpen = false;
    editingTx = parsedData;
    isTxModalOpen = true;
  }

  async function handleSaveTransaction(payload) {
    await saveTransaction(payload);
    isTxModalOpen = false;
    editingTx = null;
    if (payload.workspace_id && payload.workspace_id !== activeWorkspace) {
      activeWorkspace = payload.workspace_id;
    }
    await refreshData();
  }

  async function handleDeleteTransaction(id) {
    if (!confirm('Hapus transaksi ini?')) return;
    await softDeleteTransaction(id);
    await refreshData();
  }

  async function handleSettleReimburse(txId) {
    await settleReimbursement(txId);
    await refreshData();
  }

  // Handlers CRUD Dompet & Kategori
  async function handleSaveAccount(accData) {
    await saveAccount(accData);
    await refreshData();
  }

  async function handleDeleteAccount(id) {
    if (!confirm('Hapus dompet/rekening ini?')) return;
    await softDeleteAccount(id);
    await refreshData();
  }

  async function handleSaveCategory(catData) {
    await saveCategory(catData);
    await refreshData();
  }

  async function handleDeleteCategory(id) {
    if (!confirm('Hapus kategori ini?')) return;
    await softDeleteCategory(id);
    await refreshData();
  }
</script>

<div class="min-h-screen flex flex-col bg-slate-50 text-slate-900">
  {#if !isReady}
    <div class="flex-1 flex items-center justify-center p-6">
      <span class="text-xs font-bold uppercase tracking-wider text-slate-400">Memuat Database Lokal...</span>
    </div>
  {:else}
    <WorkspaceSwitcher
      {activeWorkspace}
      onSelectWorkspace={(ws) => (activeWorkspace = ws)}
      accounts={activeAccounts}
      {accountBalances}
      summary={workspaceSummary}
      onOpenManageModal={() => (isManageModalOpen = true)}
      onOpenNewTransaction={openNewTransaction}
      onOpenVoiceModal={() => (isVoiceModalOpen = true)}
      onOpenReceiptModal={() => (isReceiptModalOpen = true)}
    />

    <main class="flex-1">
      <TransactionList
        {activeWorkspace}
        transactions={activeTransactions}
        {accountsMap}
        {categoriesMap}
        onEdit={openEditTransaction}
        onDelete={handleDeleteTransaction}
        onSettleReimburse={handleSettleReimburse}
        onPreviewReceipt={(tx) => (previewReceiptTx = tx)}
      />
    </main>

    <!-- Bottom Floating Action Bar Khusus Mobile (< 768px) -->
    <div class="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200/80 px-3.5 py-2.5 flex items-center gap-2">
      <button
        type="button"
        onclick={() => (isVoiceModalOpen = true)}
        class="p-3 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 rounded-xl shadow-2xs flex items-center justify-center active:scale-[0.98] transition-all cursor-pointer"
        aria-label="Catat via Suara"
        title="Catat Cepat via Suara (id-ID)"
      >
        <svg class="w-4 h-4 text-rose-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

      <button
        type="button"
        onclick={() => (isReceiptModalOpen = true)}
        class="p-3 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 rounded-xl shadow-2xs flex items-center justify-center active:scale-[0.98] transition-all cursor-pointer"
        aria-label="Scan Foto Struk"
        title="Scan Foto Struk / Nota (WebP + OCR)"
      >
        <svg class="w-4 h-4 text-emerald-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="12" cy="13" r="3"/>
        </svg>
      </button>

      <button
        type="button"
        onclick={openNewTransaction}
        class="flex-1 py-3 {mobileBtnCls} text-white text-xs font-extrabold uppercase tracking-wider rounded-xl shadow-lg flex items-center justify-center gap-2 active:scale-[0.99] transition-all cursor-pointer"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M12 5v14M5 12h14" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>Catat Transaksi</span>
      </button>
    </div>

    <!-- Modal Form CRUD Transaksi -->
    <TransactionForm
      isOpen={isTxModalOpen}
      initialData={editingTx}
      {activeWorkspace}
      {allAccounts}
      {allCategories}
      {accountBalances}
      onSave={handleSaveTransaction}
      onClose={() => {
        isTxModalOpen = false;
        editingTx = null;
      }}
      onOpenVoice={() => {
        isTxModalOpen = false;
        isVoiceModalOpen = true;
      }}
      onOpenReceiptScanner={() => {
        isTxModalOpen = false;
        isReceiptModalOpen = true;
      }}
    />

    <!-- Modal Input Suara Pintar (Web Speech API + NLP Parser Bahasa Indonesia) -->
    <VoiceInputModal
      isOpen={isVoiceModalOpen}
      {activeWorkspace}
      {allAccounts}
      {allCategories}
      onApply={handleApplySmartInput}
      onClose={() => (isVoiceModalOpen = false)}
    />

    <!-- Modal Scan Foto Struk / Nota (Kompresi WebP < 80KB + OCR Regex Parser) -->
    <ReceiptScannerModal
      isOpen={isReceiptModalOpen}
      {activeWorkspace}
      {allAccounts}
      {allCategories}
      onApply={handleApplySmartInput}
      onClose={() => (isReceiptModalOpen = false)}
    />

    <!-- Modal Preview Lampiran Struk & Detail Transaksi -->
    <ReceiptPreviewModal
      isOpen={Boolean(previewReceiptTx)}
      transaction={previewReceiptTx}
      {accountsMap}
      {categoriesMap}
      onEdit={openEditTransaction}
      onClose={() => (previewReceiptTx = null)}
    />

    <!-- Modal Kelola Dompet & Kategori -->
    <ManageWalletCategoryModal
      isOpen={isManageModalOpen}
      {activeWorkspace}
      accounts={activeAccounts}
      categories={activeCategories}
      {accountBalances}
      onSaveAccount={handleSaveAccount}
      onDeleteAccount={handleDeleteAccount}
      onSaveCategory={handleSaveCategory}
      onDeleteCategory={handleDeleteCategory}
      onClose={() => (isManageModalOpen = false)}
    />
  {/if}
</div>
