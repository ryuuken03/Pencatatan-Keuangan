/**
 * Modul Kalkulasi Saldo Dompet / Akun (Buku Kas Multi-Workspace)
 * Menghitung saldo aktual tiap akun berdasarkan transaksi aktif,
 * termasuk penanganan logika Dana Talangan / Reimburse lintas buku (PRD 3.4).
 */

/**
 * Hitung saldo aktual tiap akun (Dompet) berdasarkan transaksi aktif, termasuk logika Dana Talangan / Reimburse.
 * PRD 3.4:
 * - Pengeluaran Kopdes/Usaha dengan reimburse_status === 'pending' dan reimburse_from_account_id:
 *   1. Tercatat sebagai pengeluaran di buku Kopdes/Usaha (namun belum memotong kas Kopdes/Usaha karena ditalangi pribadi).
 *   2. Mengurangi saldo dompet di buku Pribadi (reimburse_from_account_id).
 * - Ketika ditandai 'settled' (Sudah Diganti):
 *   1. Saldo kas Kopdes/Usaha (tx.account_id) berkurang sebesar amount.
 *   2. Saldo dompet Pribadi (reimburse_from_account_id) kembali utuh (tidak lagi terpotong oleh talangan ini).
 *
 * @param {Array<Object>} accounts - Daftar akun/dompet aktif
 * @param {Array<Object>} transactions - Seluruh transaksi (sebelum/sesudah filter)
 * @returns {Record<string, number>} Peta accountId -> saldo Rupiah bulat (Integer)
 */
export function computeAccountBalances(accounts = [], transactions = []) {
  const balances = {};
  for (const acc of accounts) {
    balances[acc.id] = Number(acc.initial_balance) || 0;
  }

  for (const tx of transactions) {
    if (tx.deleted_at) continue;
    const amt = Number(tx.amount) || 0;
    const meta = tx.metadata || {};

    if (tx.type === 'income') {
      if (balances[tx.account_id] !== undefined) {
        balances[tx.account_id] += amt;
      }
    } else if (tx.type === 'expense') {
      if (meta.reimburse_status === 'pending' && meta.reimburse_from_account_id) {
        // Ditalangi oleh dompet pribadi -> kurangi dompet pribadi
        if (balances[meta.reimburse_from_account_id] !== undefined) {
          balances[meta.reimburse_from_account_id] -= amt;
        }
      } else {
        // Normal expense atau reimburse 'settled' -> kurangi akun di buku terkait
        if (balances[tx.account_id] !== undefined) {
          balances[tx.account_id] -= amt;
        }
      }
    } else if (tx.type === 'transfer') {
      if (balances[tx.account_id] !== undefined) {
        balances[tx.account_id] -= amt;
      }
      if (tx.to_account_id && balances[tx.to_account_id] !== undefined) {
        balances[tx.to_account_id] += amt;
      }
    } else if (tx.type === 'debt') {
      // Kasbon/Utang Masuk (terima pinjaman menambah kas)
      if (balances[tx.account_id] !== undefined) {
        balances[tx.account_id] += amt;
      }
    } else if (tx.type === 'receivable') {
      // Kasbon/Piutang Keluar (memberi kasbon mengurangi kas)
      if (balances[tx.account_id] !== undefined) {
        balances[tx.account_id] -= amt;
      }
    }
  }

  return balances;
}

