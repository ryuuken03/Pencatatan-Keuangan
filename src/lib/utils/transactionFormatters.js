import { formatDateShort } from '../utils.js';

/**
 * Format jam transaksi (HH:mm) dalam format lokal Indonesia.
 */
export function formatTimeOnly(isoString) {
  if (!isoString) return "-";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return formatDateShort(isoString);
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/**
 * Kembalikan badge label dan CSS class solid berdasarkan jenis transaksi.
 */
export function getTypeBadge(type) {
  switch (type) {
    case "income":
      return {
        label: "MASUK",
        cls: "bg-emerald-100/80 text-emerald-800 border-emerald-200",
      };
    case "expense":
      return {
        label: "KELUAR",
        cls: "bg-rose-100/80 text-rose-800 border-rose-200",
      };
    case "transfer":
      return {
        label: "TRANSFER",
        cls: "bg-sky-100/80 text-sky-800 border-sky-200",
      };
    case "receivable":
      return {
        label: "PIUTANG",
        cls: "bg-amber-100/80 text-amber-800 border-amber-200",
      };
    case "debt":
      return {
        label: "UTANG",
        cls: "bg-purple-100/80 text-purple-800 border-purple-200",
      };
    default:
      return {
        label: type,
        cls: "bg-slate-100 text-slate-700 border-slate-200",
      };
  }
}

/**
 * Warna teks nominal sesuai jenis transaksi.
 */
export function getAmountColor(type) {
  if (type === "income" || type === "debt") return "text-emerald-700";
  if (type === "expense" || type === "receivable") return "text-rose-700";
  return "text-sky-700";
}

/**
 * Prefix tanda (+ / - / ⇄) sesuai jenis transaksi.
 */
export function getAmountPrefix(type) {
  if (type === "income" || type === "debt") return "+";
  if (type === "expense" || type === "receivable") return "-";
  return "⇄ ";
}

/**
 * Ambil daftar rincian item produk (tabel terpisah transaction_items atau metadata.items).
 */
export function getTxItems(tx) {
  if (Array.isArray(tx?.items) && tx.items.length > 0) return tx.items;
  if (Array.isArray(tx?.metadata?.items) && tx.metadata.items.length > 0)
    return tx.metadata.items;
  return [];
}

