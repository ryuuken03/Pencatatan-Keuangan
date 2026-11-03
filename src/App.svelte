<script>
  import { onMount, onDestroy } from 'svelte';
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
  import ReportExportModal from './components/ReportExportModal.svelte';
  import SecurityBackupModal from './components/SecurityBackupModal.svelte';
  import SyncSettingsModal from './components/SyncSettingsModal.svelte';
  import PinLockScreen from './components/PinLockScreen.svelte';
  import MobileBottomNav from './components/MobileBottomNav.svelte';
  import { syncEngine } from './lib/sync/syncEngine.js';
  import {
    hasPinLock,
    isSessionUnlocked,
    setSessionUnlocked
  } from './lib/utils/cryptoBackup.js';

  let activeWorkspace = $state('personal');
  let allAccounts = $state([]);
  let allCategories = $state([]);
  let allTransactions = $state([]);
  let isReady = $state(false);
  let isPinEnabled = $state(false);
  let isAppLocked = $state(false);

  // Sync state
  let syncState = $state({
    isSyncing: false,
    totalPending: 0,
    isConfigured: false,
    isAuthenticated: false
  });
  let isSyncModalOpen = $state(false);
  let unsubscribeSync = null;
  let unsubscribeSyncData = null;

  // Modal states
  let isTxModalOpen = $state(false);
  let editingTx = $state(null);
  let isManageModalOpen = $state(false);
  let manageModalInitialTab = $state('accounts');
  let isVoiceModalOpen = $state(false);
  let isReceiptModalOpen = $state(false);
  let isReportModalOpen = $state(false);
  let isSecurityModalOpen = $state(false);
  let previewReceiptTx = $state(null);

  async function refreshData() {
    const data = await loadAppData();
    allAccounts = data.accounts;
    allCategories = data.categories;
    allTransactions = data.transactions;
  }

  onMount(async () => {
    isPinEnabled = hasPinLock();
    isAppLocked = isPinEnabled && !isSessionUnlocked();
    await seedDatabase();
    await refreshData();

    unsubscribeSync = syncEngine.subscribe((state) => {
      syncState = state;
    });
    unsubscribeSyncData = syncEngine.onDataChange(() => {
      refreshData();
    });
    syncEngine.start();

    isReady = true;
  });

  onDestroy(() => {
    if (unsubscribeSync) unsubscribeSync();
    if (unsubscribeSyncData) unsubscribeSyncData();
    syncEngine.stop();
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

  // Total Saldo & Jumlah Dompet per Buku Kas (untuk Mobile WorkspaceSwitcher Sheet)
  let workspaceBalances = $derived.by(() => {
    const totals = { personal: 0, business: 0, kopdes: 0 };
    for (const acc of allAccounts) {
      if (totals[acc.workspace_id] !== undefined) {
        totals[acc.workspace_id] += accountBalances[acc.id] ?? 0;
      }
    }
    return totals;
  });

  let workspaceAccountCounts = $derived.by(() => {
    const counts = { personal: 0, business: 0, kopdes: 0 };
    for (const acc of allAccounts) {
      if (counts[acc.workspace_id] !== undefined) {
        counts[acc.workspace_id] += 1;
      }
    }
    return counts;
  });

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

  let pageTitle = $derived(
    activeWorkspace === 'business'
      ? 'Buku Usaha — Buku Kas Multi-Workspace'
      : activeWorkspace === 'kopdes'
        ? 'Manager Kopdes — Buku Kas Multi-Workspace'
        : 'Buku Pribadi — Buku Kas Multi-Workspace'
  );

  let themeColorHex = $derived(
    activeWorkspace === 'business'
      ? '#134e4a'
      : activeWorkspace === 'kopdes'
        ? '#064e3b'
        : '#1e1b4b'
  );

  $effect(() => {
    const meta = document.getElementById('theme-color-meta');
    if (meta) {
      meta.setAttribute('content', themeColorHex);
    }
  });

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
    if (!confirm('Hapus transaksi ini?')) return false;
    await softDeleteTransaction(id);
    if (previewReceiptTx?.id === id) {
      previewReceiptTx = null;
    }
    await refreshData();
    return true;
  }

  async function handleSettleReimburse(txId) {
    await settleReimbursement(txId);
    await refreshData();
    if (previewReceiptTx?.id === txId) {
      previewReceiptTx = allTransactions.find((t) => t.id === txId) || null;
    }
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

<svelte:head>
  <title>{pageTitle}</title>
</svelte:head>

<div class="min-h-screen flex flex-col bg-slate-50 text-slate-900">
  {#if !isReady}
    <div class="flex-1 flex items-center justify-center p-6">
      <span class="text-xs font-bold uppercase tracking-wider text-slate-400">Memuat Database Lokal...</span>
    </div>
  {:else}
    {#if isAppLocked}
      <PinLockScreen onUnlocked={() => (isAppLocked = false)} />
    {/if}

    <WorkspaceSwitcher
      {activeWorkspace}
      onSelectWorkspace={(ws) => (activeWorkspace = ws)}
      accounts={activeAccounts}
      {accountBalances}
      summary={workspaceSummary}
      onOpenManageModal={() => {
        manageModalInitialTab = 'accounts';
        isManageModalOpen = true;
      }}
      onOpenNewTransaction={openNewTransaction}
      onOpenVoiceModal={() => (isVoiceModalOpen = true)}
      onOpenReceiptModal={() => (isReceiptModalOpen = true)}
      onOpenReportModal={() => (isReportModalOpen = true)}
      onOpenSecurityModal={() => (isSecurityModalOpen = true)}
      onOpenSyncModal={() => (isSyncModalOpen = true)}
      {syncState}
      {isPinEnabled}
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
        onOpenReportModal={() => (isReportModalOpen = true)}
      />
    </main>

    <!-- Bottom Navigation Bar Khusus Mobile (< 768px) -->
    <MobileBottomNav
      {activeWorkspace}
      onSelectWorkspace={(ws) => (activeWorkspace = ws)}
      {workspaceBalances}
      {workspaceAccountCounts}
      {isPinEnabled}
      syncPendingCount={syncState.totalPending}
      isSyncing={syncState.isSyncing}
      onOpenNewTransaction={openNewTransaction}
      onOpenReceiptModal={() => (isReceiptModalOpen = true)}
      onOpenVoiceModal={() => (isVoiceModalOpen = true)}
      onOpenReportModal={() => (isReportModalOpen = true)}
      onOpenSecurityModal={() => (isSecurityModalOpen = true)}
      onOpenSyncModal={() => (isSyncModalOpen = true)}
      onOpenManageWallets={() => {
        manageModalInitialTab = 'accounts';
        isManageModalOpen = true;
      }}
      onOpenManageCategories={() => {
        manageModalInitialTab = 'categories';
        isManageModalOpen = true;
      }}
    />

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
      {allTransactions}
      onApply={handleApplySmartInput}
      onClose={() => (isVoiceModalOpen = false)}
    />

    <!-- Modal Scan Foto Struk / Nota (Kompresi WebP < 80KB + OCR Regex Parser) -->
    <ReceiptScannerModal
      isOpen={isReceiptModalOpen}
      {activeWorkspace}
      {allAccounts}
      {allCategories}
      {allTransactions}
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
      onDelete={handleDeleteTransaction}
      onSettleReimburse={handleSettleReimburse}
      onClose={() => (previewReceiptTx = null)}
    />

    <!-- Modal Kelola Dompet & Kategori -->
    <ManageWalletCategoryModal
      isOpen={isManageModalOpen}
      initialTab={manageModalInitialTab}
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

    <!-- Modal Rekap Laporan, Export & Import Excel (.xlsx) -->
    <ReportExportModal
      isOpen={isReportModalOpen}
      {activeWorkspace}
      transactions={activeTransactions}
      {allTransactions}
      {accountsMap}
      {categoriesMap}
      onSettleReimburse={handleSettleReimburse}
      onPreviewReceipt={(tx) => (previewReceiptTx = tx)}
      onDataImported={refreshData}
      onClose={() => (isReportModalOpen = false)}
    />

    <!-- Modal Backup JSON Terenkripsi AES-GCM 256-Bit & PIN Lock 6 Digit -->
    <SecurityBackupModal
      isOpen={isSecurityModalOpen}
      {activeWorkspace}
      onDataRestored={refreshData}
      onLockAppNow={() => {
        setSessionUnlocked(false);
        isAppLocked = true;
      }}
      onPinStateChange={(enabled) => {
        isPinEnabled = enabled;
      }}
      onClose={() => (isSecurityModalOpen = false)}
    />

    <!-- Modal Pengaturan Sinkronisasi Cloud (Supabase Delta Sync) -->
    {#if isSyncModalOpen}
      <SyncSettingsModal
        isOpen={isSyncModalOpen}
        {activeWorkspace}
        onDataSynced={refreshData}
        onClose={() => (isSyncModalOpen = false)}
      />
    {/if}
  {/if}
</div>
