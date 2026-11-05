/**
 * Modal & Sheet Back-Button / Swipe-Gesture Handler untuk Mobile PWA
 * Mencegah aplikasi PWA di HP tertutup saat pengguna menekan tombol Back fisik
 * atau melakukan swipe tepi layar, melainkan menutup modal/sheet yang sedang aktif.
 */

const modalStack = [];
let isPopstateHandling = false;
let ignoreNextPopstate = false;

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    // Abaikan jika popstate dipicu secara programatis saat user menutup modal via tombol UI
    if (ignoreNextPopstate) {
      ignoreNextPopstate = false;
      return;
    }

    if (modalStack.length > 0) {
      isPopstateHandling = true;
      const topModal = modalStack.pop();
      try {
        topModal.onClose?.();
      } catch (err) {
        console.error('[ModalHistory] Gagal menutup modal via back button:', err);
      } finally {
        isPopstateHandling = false;
      }
    }
  });
}

/**
 * Daftarkan modal ke riwayat browser.
 * @param {string} id - Identifier unik modal
 * @param {() => void} onClose - Callback saat tombol back ditekan
 * @returns {() => void} Cleanup function saat modal ditutup dari UI
 */
export function registerModalHistory(id, onClose) {
  if (typeof window === 'undefined') return () => {};

  const existingIdx = modalStack.findIndex((m) => m.id === id);
  if (existingIdx !== -1) {
    modalStack[existingIdx].onClose = onClose;
    return () => unregisterModalHistory(id);
  }

  try {
    window.history.pushState({ modalId: id }, '');
  } catch {
    // Fallback jika environment membatasi history API
  }

  modalStack.push({ id, onClose });

  return () => unregisterModalHistory(id);
}

/**
 * Hapus modal dari stack saat ditutup dari interaksi UI (X, Batal, Simpan, Backdrop).
 * @param {string} id - Identifier modal
 */
export function unregisterModalHistory(id) {
  const index = modalStack.findIndex((m) => m.id === id);
  if (index === -1) return;

  modalStack.splice(index, 1);

  // Jika modal ditutup bukan oleh event popstate (tombol back HP),
  // mundurkan riwayat browser 1 langkah agar history stack tetap sinkron.
  if (!isPopstateHandling && typeof window !== 'undefined') {
    ignoreNextPopstate = true;
    try {
      window.history.back();
    } catch {
      ignoreNextPopstate = false;
    }
  }
}

