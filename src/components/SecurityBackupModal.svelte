<script>
  import {
    exportDatabasePayload,
    restoreDatabasePayload,
    compactDatabase,
    getDatabaseStats,
  } from "../lib/db.js";
  import {
    encryptBackupPayload,
    decryptBackupPayload,
    hasPinLock,
    savePinLock,
    verifyPinLock,
    disablePinLock,
  } from "../lib/utils/cryptoBackup.js";
  import { downloadBlobFile } from "../lib/utils/csvExporter.js";
  import { getWorkspaceTheme } from "../lib/utils.js";
  import { registerModalHistory } from "../lib/utils/modalHistory.js";

  let {
    isOpen = false,
    workspaces = [],
    activeWorkspace = "personal",
    onDataRestored,
    onLockAppNow,
    onPinStateChange,
    onClose,
  } = $props();

  $effect(() => {
    if (isOpen) {
      return registerModalHistory("security-backup", () => {
        onClose?.();
      });
    }
  });

  let activeSection = $state("backup"); // 'backup' | 'restore' | 'security'
  let dbStats = $state({
    activeAccounts: 0,
    activeCategories: 0,
    activeTransactions: 0,
    activeItems: 0,
    attachmentCount: 0,
    attachmentKB: 0,
    softDeletedCount: 0,
  });

  // State Backup
  let useEncryption = $state(true);
  let includeAttachments = $state(true);
  let backupPassword = $state("");
  let backupPasswordConfirm = $state("");
  let isExporting = $state(false);

  // State Restore
  let selectedFile = $state(null);
  let parsedBackupRaw = $state(null);
  let isFileEncrypted = $state(false);
  let restorePassword = $state("");
  let restoreMode = $state("merge"); // 'merge' | 'replace'
  let isRestoring = $state(false);

  // State PIN Lock 6 Digit
  let pinEnabled = $state(false);
  let currentPinInput = $state("");
  let newPinInput = $state("");
  let confirmPinInput = $state("");
  let pinActionMode = $state("setup"); // 'setup' | 'change' | 'disable'

  // Pesan status / alert
  let statusMsg = $state("");
  let errorMsg = $state("");

  async function refreshStats() {
    dbStats = await getDatabaseStats();
    pinEnabled = hasPinLock();
    pinActionMode = pinEnabled ? "change" : "setup";
  }

  $effect(() => {
    if (isOpen) {
      statusMsg = "";
      errorMsg = "";
      refreshStats();
    }
  });

  let effectiveWorkspaces = $derived(
    workspaces && workspaces.length > 0
      ? workspaces
      : [{ id: "personal", name: "Buku Pribadi", type: "personal" }]
  );

  let theme = $derived(
    getWorkspaceTheme(activeWorkspace, effectiveWorkspaces)
  );

  async function handleExportBackup() {
    statusMsg = "";
    errorMsg = "";

    if (useEncryption) {
      if (backupPassword.length < 4) {
        errorMsg = "Password enkripsi minimal 4 karakter.";
        return;
      }
      if (backupPassword !== backupPasswordConfirm) {
        errorMsg = "Konfirmasi password enkripsi tidak cocok.";
        return;
      }
    }

    isExporting = true;
    try {
      const payload = await exportDatabasePayload({ includeAttachments });
      let finalObj = payload;

      if (useEncryption) {
        finalObj = await encryptBackupPayload(payload, backupPassword);
      }

      const jsonStr = JSON.stringify(finalObj, null, 2);
      const dateStr = new Date().toISOString().slice(0, 10);
      const suffix = useEncryption ? "AES256.enc.json" : "plain.json";
      const filename = `Backup_BukuKas_${dateStr}_${suffix}`;

      downloadBlobFile(jsonStr, filename, "application/json;charset=utf-8;");
      statusMsg = `Backup berhasil diunduh (${filename}). Simpan file & password di tempat aman.`;
      backupPassword = "";
      backupPasswordConfirm = "";
    } catch (err) {
      errorMsg = err?.message || "Gagal membuat file backup.";
    } finally {
      isExporting = false;
    }
  }

  async function handleFileSelect(e) {
    statusMsg = "";
    errorMsg = "";
    const file = e.target.files?.[0];
    if (!file) {
      selectedFile = null;
      parsedBackupRaw = null;
      return;
    }

    selectedFile = file;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      parsedBackupRaw = json;
      isFileEncrypted = Boolean(json && json.encrypted && json.ciphertext);
    } catch {
      selectedFile = null;
      parsedBackupRaw = null;
      errorMsg = "File bukan format JSON yang valid.";
    }
  }

  async function handleRestoreBackup() {
    statusMsg = "";
    errorMsg = "";

    if (!parsedBackupRaw) {
      errorMsg = "Pilih file backup (.json) terlebih dahulu.";
      return;
    }

    if (isFileEncrypted && !restorePassword) {
      errorMsg =
        "File backup terenkripsi AES-GCM 256-bit. Masukkan password dekripsi.";
      return;
    }

    if (
      restoreMode === "replace" &&
      !confirm(
        "Mode Ganti Total akan menghapus data lokal saat ini dan menggantinya dengan isi file backup. Lanjutkan?",
      )
    ) {
      return;
    }

    isRestoring = true;
    try {
      let plainPayload = parsedBackupRaw;
      if (isFileEncrypted) {
        plainPayload = await decryptBackupPayload(
          parsedBackupRaw,
          restorePassword,
        );
      }

      const result = await restoreDatabasePayload(plainPayload, {
        mode: restoreMode,
      });
      await refreshStats();
      await onDataRestored?.();

      statusMsg = `Restore berhasil! (${result.transactions} transaksi, ${result.accounts} dompet, ${result.categories} kategori dipulihkan).`;
      restorePassword = "";
      selectedFile = null;
      parsedBackupRaw = null;
    } catch (err) {
      errorMsg = err?.message || "Gagal memulihkan database.";
    } finally {
      isRestoring = false;
    }
  }

  async function handleCompactDatabase() {
    statusMsg = "";
    errorMsg = "";
    const purged = await compactDatabase();
    await refreshStats();
    statusMsg = `Database Compaction selesai: ${purged} record sampah (soft-deleted) dibersihkan permanen.`;
  }

  async function handleSavePin() {
    statusMsg = "";
    errorMsg = "";

    if (pinEnabled) {
      const ok = await verifyPinLock(currentPinInput);
      if (!ok) {
        errorMsg = "PIN saat ini salah.";
        return;
      }
    }

    if (pinActionMode === "disable") {
      disablePinLock();
      pinEnabled = false;
      currentPinInput = "";
      newPinInput = "";
      confirmPinInput = "";
      onPinStateChange?.(false);
      statusMsg = "Kunci PIN 6 digit berhasil dinonaktifkan.";
      return;
    }

    if (!/^\d{6}$/.test(newPinInput)) {
      errorMsg = "PIN baru wajib terdiri dari tepat 6 digit angka (0-9).";
      return;
    }

    if (newPinInput !== confirmPinInput) {
      errorMsg = "Konfirmasi PIN 6 digit tidak sama.";
      return;
    }

    try {
      await savePinLock(newPinInput);
      pinEnabled = true;
      pinActionMode = "change";
      currentPinInput = "";
      newPinInput = "";
      confirmPinInput = "";
      onPinStateChange?.(true);
      statusMsg =
        "PIN Lock 6 digit berhasil diaktifkan dan disimpan dengan hash SHA-256.";
    } catch (err) {
      errorMsg = err?.message || "Gagal menyimpan PIN.";
    }
  }
</script>

{#if isOpen}
  <div
    class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4 overflow-y-auto"
  >
    <div
      class="bg-white w-full max-w-2xl rounded-t-2xl sm:rounded-2xl border border-slate-200 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
    >
      <!-- Header Modal -->
      <div
        class="flex items-center justify-between px-4 sm:px-5 py-3.5 {theme.headerBg} text-white shrink-0"
      >
        <div>
          <span
            class="block text-[10px] font-extrabold uppercase tracking-wider text-white/75"
          >
            KEAMANAN LOKAL & PENCADANGAN DATA
          </span>
          <h2
            class="text-sm sm:text-base font-extrabold tracking-wide uppercase"
          >
            Backup AES-GCM 256-Bit & PIN Lock
          </h2>
        </div>
        <button
          type="button"
          onclick={onClose}
          class="p-1.5 text-white/75 hover:text-white rounded-lg cursor-pointer"
          aria-label="Tutup Pengaturan Keamanan"
        >
          <svg
            class="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
          >
            <path
              d="M18 6 6 18M6 6l12 12"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </div>

      <!-- Sub-Tab Navigasi -->
      <div
        class="px-4 sm:px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0"
      >
        <div
          class="inline-flex bg-slate-200/80 p-0.5 rounded-xl border border-slate-300/60"
        >
          <button
            type="button"
            onclick={() => {
              activeSection = "backup";
              statusMsg = "";
              errorMsg = "";
            }}
            class="px-3 py-1.5 text-xs font-extrabold rounded-lg transition-colors cursor-pointer {activeSection ===
            'backup'
              ? 'bg-white text-slate-900 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'}"
          >
            Backup JSON
          </button>
          <button
            type="button"
            onclick={() => {
              activeSection = "restore";
              statusMsg = "";
              errorMsg = "";
            }}
            class="px-3 py-1.5 text-xs font-extrabold rounded-lg transition-colors cursor-pointer {activeSection ===
            'restore'
              ? 'bg-white text-slate-900 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'}"
          >
            Restore Data
          </button>
          <button
            type="button"
            onclick={() => {
              activeSection = "security";
              statusMsg = "";
              errorMsg = "";
            }}
            class="px-3 py-1.5 text-xs font-extrabold rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5 {activeSection ===
            'security'
              ? 'bg-white text-slate-900 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'}"
          >
            <span>PIN Lock 6 Digit</span>
            <span
              class="w-2 h-2 rounded-full {pinEnabled
                ? 'bg-emerald-500'
                : 'bg-slate-400'}"
            ></span>
          </button>
        </div>

        {#if pinEnabled}
          <button
            type="button"
            onclick={() => {
              onClose?.();
              onLockAppNow?.();
            }}
            class="px-3 py-1.5 text-xs font-extrabold bg-slate-900 hover:bg-slate-800 text-white rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
          >
            <svg
              class="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
            >
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>Kunci Sekarang</span>
          </button>
        {/if}
      </div>

      <!-- Body -->
      <div class="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 text-xs">
        {#if statusMsg}
          <div
            class="p-3 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl font-bold"
          >
            ✓ {statusMsg}
          </div>
        {/if}
        {#if errorMsg}
          <div
            class="p-3 bg-rose-50 border border-rose-300 text-rose-800 rounded-xl font-bold"
          >
            ⚠ {errorMsg}
          </div>
        {/if}

        <!-- Ringkasan Statistik Database Lokal -->
        <div
          class="grid grid-cols-3 gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl text-center"
        >
          <div>
            <div class="text-[10px] font-bold uppercase text-slate-500">
              Total Transaksi
            </div>
            <div
              class="text-sm font-extrabold text-slate-900 tabular-nums mt-0.5"
            >
              {dbStats.activeTransactions}
            </div>
          </div>
          <div>
            <div class="text-[10px] font-bold uppercase text-slate-500">
              Dompet & Kategori
            </div>
            <div
              class="text-sm font-extrabold text-slate-900 tabular-nums mt-0.5"
            >
              {dbStats.activeAccounts} / {dbStats.activeCategories}
            </div>
          </div>
          <div>
            <div class="text-[10px] font-bold uppercase text-slate-500">
              Lampiran Struk
            </div>
            <div
              class="text-sm font-extrabold text-slate-900 tabular-nums mt-0.5"
            >
              {dbStats.attachmentCount} ({dbStats.attachmentKB} KB)
            </div>
          </div>
        </div>

        <!-- SECTION 1: BACKUP DATABASE JSON (WEBCRYPTO AES-GCM 256-BIT) -->
        {#if activeSection === "backup"}
          <div class="space-y-3 border border-slate-200 rounded-2xl p-4">
            <div>
              <h3
                class="text-xs font-extrabold uppercase tracking-wider text-slate-900"
              >
                Ekspor Cadangan Database Lengkap (.json)
              </h3>
              <p class="text-[11px] text-slate-500 mt-0.5">
                Mencadangkan seluruh buku kas (Pribadi, Usaha, Pekerjaan), dompet,
                kategori, transaksi, dan rincian produk.
              </p>
            </div>

            <div class="space-y-2 pt-1">
              <label
                class="flex items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer"
              >
                <div>
                  <span class="font-bold text-slate-900 block">
                    Enkripsi dengan Password (WebCrypto AES-GCM 256-bit)
                  </span>
                  <span class="text-[11px] text-slate-500">
                    Melindungi isi file JSON dengan kunci PBKDF2 SHA-256
                    (100.000 iterasi).
                  </span>
                </div>
                <input
                  type="checkbox"
                  bind:checked={useEncryption}
                  class="w-4 h-4 accent-slate-900 rounded cursor-pointer"
                />
              </label>

              <label
                class="flex items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer"
              >
                <div>
                  <span class="font-bold text-slate-900 block">
                    Sertakan Foto Struk ({dbStats.attachmentCount} foto • ~{dbStats.attachmentKB}
                    KB)
                  </span>
                  <span class="text-[11px] text-slate-500">
                    Jika dicentang, gambar struk dikodekan ke dalam file backup.
                  </span>
                </div>
                <input
                  type="checkbox"
                  bind:checked={includeAttachments}
                  class="w-4 h-4 accent-slate-900 rounded cursor-pointer"
                />
              </label>
            </div>

            {#if useEncryption}
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label
                    for="backup-pass"
                    class="block text-[11px] font-bold text-slate-700 mb-1"
                  >
                    Password Enkripsi Backup
                  </label>
                  <input
                    id="backup-pass"
                    type="password"
                    placeholder="Minimal 4 karakter..."
                    bind:value={backupPassword}
                    class="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-slate-900"
                  />
                </div>
                <div>
                  <label
                    for="backup-pass-confirm"
                    class="block text-[11px] font-bold text-slate-700 mb-1"
                  >
                    Ulangi Password Enkripsi
                  </label>
                  <input
                    id="backup-pass-confirm"
                    type="password"
                    placeholder="Ketik ulang password..."
                    bind:value={backupPasswordConfirm}
                    class="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-slate-900"
                  />
                </div>
              </div>
            {/if}

            <div class="pt-2 flex items-center justify-between gap-2">
              {#if dbStats.softDeletedCount > 0}
                <button
                  type="button"
                  onclick={handleCompactDatabase}
                  class="px-3 py-2 text-[11px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer tabular-nums"
                >
                  Bersihkan {dbStats.softDeletedCount} Sampah DB
                </button>
              {:else}
                <span class="text-[11px] text-slate-400"
                  >Database bersih (0 sampah).</span
                >
              {/if}

              <button
                type="button"
                disabled={isExporting}
                onclick={handleExportBackup}
                class="px-4 py-2.5 text-xs font-extrabold rounded-xl cursor-pointer transition-colors {theme.primaryBtn} disabled:opacity-50"
              >
                {isExporting
                  ? "Memproses Backup..."
                  : useEncryption
                    ? "Unduh Backup Terenkripsi (.json)"
                    : "Unduh Backup Tanpa Enkripsi (.json)"}
              </button>
            </div>
          </div>

          <!-- SECTION 2: RESTORE DATABASE DARI JSON -->
        {:else if activeSection === "restore"}
          <div class="space-y-3 border border-slate-200 rounded-2xl p-4">
            <div>
              <h3
                class="text-xs font-extrabold uppercase tracking-wider text-slate-900"
              >
                Pulihkan Database dari File Backup (.json)
              </h3>
              <p class="text-[11px] text-slate-500 mt-0.5">
                Mendukung file backup terenkripsi AES-GCM 256-bit maupun file
                backup JSON standar.
              </p>
            </div>

            <div>
              <label
                for="restore-file-input"
                class="block text-[11px] font-bold text-slate-700 mb-1"
              >
                Pilih File Backup (.json)
              </label>
              <input
                id="restore-file-input"
                type="file"
                accept=".json,application/json"
                onchange={handleFileSelect}
                class="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl cursor-pointer file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-slate-900 file:text-white"
              />
            </div>

            {#if parsedBackupRaw}
              <div
                class="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2"
              >
                <div class="flex items-center justify-between">
                  <span class="font-bold text-slate-800">Status File:</span>
                  {#if isFileEncrypted}
                    <span
                      class="px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded text-[10px] font-extrabold"
                    >
                      TERENKRIPSI (AES-GCM 256-BIT)
                    </span>
                  {:else}
                    <span
                      class="px-2 py-0.5 bg-emerald-100 text-emerald-900 border border-emerald-300 rounded text-[10px] font-extrabold"
                    >
                      SIAP DIPULIHKAN (PLAIN JSON)
                    </span>
                  {/if}
                </div>

                {#if isFileEncrypted}
                  <div>
                    <label
                      for="restore-pass"
                      class="block text-[11px] font-bold text-slate-700 mb-1"
                    >
                      Masukkan Password Dekripsi Backup
                    </label>
                    <input
                      id="restore-pass"
                      type="password"
                      placeholder="Ketik password saat membuat backup..."
                      bind:value={restorePassword}
                      class="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-slate-900"
                    />
                  </div>
                {/if}

                <div class="pt-1">
                  <span
                    class="block text-[11px] font-bold text-slate-700 mb-1.5"
                    >Mode Pemulihan:</span
                  >
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label
                      class="p-2.5 border rounded-xl cursor-pointer flex items-start gap-2 {restoreMode ===
                      'merge'
                        ? 'border-slate-900 bg-white'
                        : 'border-slate-200 bg-slate-100/70'}"
                    >
                      <input
                        type="radio"
                        name="restoreMode"
                        value="merge"
                        bind:group={restoreMode}
                        class="mt-0.5 accent-slate-900"
                      />
                      <div>
                        <span class="font-bold text-slate-900 block"
                          >Gabungkan (Merge - Aman)</span
                        >
                        <span class="text-[10px] text-slate-500">
                          Menambahkan & memperbarui data tanpa menghapus
                          transaksi lokal lainnya.
                        </span>
                      </div>
                    </label>

                    <label
                      class="p-2.5 border rounded-xl cursor-pointer flex items-start gap-2 {restoreMode ===
                      'replace'
                        ? 'border-rose-700 bg-rose-50/40'
                        : 'border-slate-200 bg-slate-100/70'}"
                    >
                      <input
                        type="radio"
                        name="restoreMode"
                        value="replace"
                        bind:group={restoreMode}
                        class="mt-0.5 accent-rose-700"
                      />
                      <div>
                        <span class="font-bold text-rose-800 block"
                          >Ganti Total (Replace)</span
                        >
                        <span class="text-[10px] text-slate-500">
                          Menghapus seluruh data lokal dan menggantinya persis
                          dengan isi backup.
                        </span>
                      </div>
                    </label>
                  </div>
                </div>

                <div class="pt-2 text-right">
                  <button
                    type="button"
                    disabled={isRestoring}
                    onclick={handleRestoreBackup}
                    class="px-4 py-2.5 text-xs font-extrabold rounded-xl cursor-pointer {theme.primaryBtn} disabled:opacity-50"
                  >
                    {isRestoring
                      ? "Memulihkan Database..."
                      : "Mulai Restore Database"}
                  </button>
                </div>
              </div>
            {/if}
          </div>

          <!-- SECTION 3: PENGATURAN APP PIN LOCK 6 DIGIT -->
        {:else if activeSection === "security"}
          <div class="space-y-3 border border-slate-200 rounded-2xl p-4">
            <div class="flex items-center justify-between gap-2">
              <div>
                <h3
                  class="text-xs font-extrabold uppercase tracking-wider text-slate-900"
                >
                  Kunci Aplikasi dengan PIN 6 Digit
                </h3>
                <p class="text-[11px] text-slate-500 mt-0.5">
                  Mencegah akses tanpa izin saat perangkat dipinjam. PIN
                  disimpan menggunakan hash SHA-256 + Salt.
                </p>
              </div>
              <span
                class="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase {pinEnabled
                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                  : 'bg-slate-100 text-slate-600 border border-slate-200'}"
              >
                {pinEnabled ? "PIN AKTIF" : "BELUM AKTIF"}
              </span>
            </div>

            {#if pinEnabled}
              <div class="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onclick={() => (pinActionMode = "change")}
                  class="px-3 py-1.5 text-xs font-bold rounded-xl border cursor-pointer {pinActionMode ===
                  'change'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200'}"
                >
                  Ubah PIN 6 Digit
                </button>
                <button
                  type="button"
                  onclick={() => (pinActionMode = "disable")}
                  class="px-3 py-1.5 text-xs font-bold rounded-xl border cursor-pointer {pinActionMode ===
                  'disable'
                    ? 'bg-rose-700 text-white border-rose-700'
                    : 'bg-white text-rose-700 border-rose-200'}"
                >
                  Nonaktifkan PIN
                </button>
              </div>

              <div>
                <label
                  for="current-pin"
                  class="block text-[11px] font-bold text-slate-700 mb-1"
                >
                  PIN 6 Digit Saat Ini (Wajib untuk verifikasi)
                </label>
                <input
                  id="current-pin"
                  type="password"
                  inputmode="numeric"
                  maxlength="6"
                  placeholder="••••••"
                  bind:value={currentPinInput}
                  class="w-full sm:w-64 px-3 py-2 text-sm font-extrabold tracking-widest tabular-nums bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-slate-900"
                />
              </div>
            {/if}

            {#if pinActionMode !== "disable"}
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label
                    for="new-pin"
                    class="block text-[11px] font-bold text-slate-700 mb-1"
                  >
                    {pinEnabled ? "PIN 6 Digit Baru" : "Buat PIN 6 Digit"}
                  </label>
                  <input
                    id="new-pin"
                    type="password"
                    inputmode="numeric"
                    maxlength="6"
                    placeholder="6 digit angka (contoh: 123456)"
                    bind:value={newPinInput}
                    class="w-full px-3 py-2 text-sm font-extrabold tracking-widest tabular-nums bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-slate-900"
                  />
                </div>
                <div>
                  <label
                    for="confirm-pin"
                    class="block text-[11px] font-bold text-slate-700 mb-1"
                  >
                    Konfirmasi PIN 6 Digit
                  </label>
                  <input
                    id="confirm-pin"
                    type="password"
                    inputmode="numeric"
                    maxlength="6"
                    placeholder="Ulangi 6 digit angka"
                    bind:value={confirmPinInput}
                    class="w-full px-3 py-2 text-sm font-extrabold tracking-widest tabular-nums bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-slate-900"
                  />
                </div>
              </div>
            {/if}

            <div class="pt-2 text-right">
              <button
                type="button"
                onclick={handleSavePin}
                class="px-4 py-2.5 text-xs font-extrabold rounded-xl cursor-pointer {pinActionMode ===
                'disable'
                  ? 'bg-rose-700 hover:bg-rose-800 text-white'
                  : theme.primaryBtn}"
              >
                {pinActionMode === "disable"
                  ? "Matikan PIN Lock"
                  : pinEnabled
                    ? "Simpan PIN Baru"
                    : "Aktifkan PIN 6 Digit"}
              </button>
            </div>
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div
        class="px-4 sm:px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0"
      >
        <span class="text-[11px] text-slate-500 font-medium">
          100% berjalan lokal di perangkat Anda (WebCrypto API).
        </span>
        <button
          type="button"
          onclick={onClose}
          class="px-4 py-2 text-xs font-extrabold bg-slate-900 hover:bg-slate-800 text-white rounded-xl cursor-pointer"
        >
          Tutup
        </button>
      </div>
    </div>
  </div>
{/if}
