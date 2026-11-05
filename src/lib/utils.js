/**
 * Generate UUID v7 (Time-ordered UUID) using native WebCrypto API
 */
export function uuidv7() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  const timestamp = BigInt(Date.now());
  bytes[0] = Number((timestamp >> 40n) & 0xffn);
  bytes[1] = Number((timestamp >> 32n) & 0xffn);
  bytes[2] = Number((timestamp >> 24n) & 0xffn);
  bytes[3] = Number((timestamp >> 16n) & 0xffn);
  bytes[4] = Number((timestamp >> 8n) & 0xffn);
  bytes[5] = Number(timestamp & 0xffn);

  // Version 7
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  // Variant 10xx
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Hash 128-bit deterministik (cyrb128) — sinkron, tanpa WebCrypto (aman di http LAN)
 */
function cyrb128(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/**
 * UUID v7 deterministik: timestamp tetap + bit acak dari hash `key`.
 * Dipakai untuk data default (seed) agar ID identik di semua perangkat.
 */
export function deterministicUuidV7(key, timestampMs) {
  const bytes = new Uint8Array(16);
  const words = cyrb128(String(key));
  words.forEach((w, i) => {
    bytes[i * 4] = (w >>> 24) & 0xff;
    bytes[i * 4 + 1] = (w >>> 16) & 0xff;
    bytes[i * 4 + 2] = (w >>> 8) & 0xff;
    bytes[i * 4 + 3] = w & 0xff;
  });

  const timestamp = BigInt(Math.max(0, Math.floor(Number(timestampMs) || 0)));
  bytes[0] = Number((timestamp >> 40n) & 0xffn);
  bytes[1] = Number((timestamp >> 32n) & 0xffn);
  bytes[2] = Number((timestamp >> 24n) & 0xffn);
  bytes[3] = Number((timestamp >> 16n) & 0xffn);
  bytes[4] = Number((timestamp >> 8n) & 0xffn);
  bytes[5] = Number(timestamp & 0xffn);
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const idrFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

const numberFormatter = new Intl.NumberFormat('id-ID', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

/**
 * Format angka bulat ke "Rp 1.250.000" atau "-Rp 1.250.000"
 */
export function formatIDR(amount) {
  const n = Number(amount) || 0;
  return idrFormatter.format(n);
}

/**
 * Format angka dengan titik ribuan saja ("1.250.000")
 */
export function formatNumber(amount) {
  const n = Number(amount) || 0;
  return numberFormatter.format(n);
}

/**
 * Evaluasi ekspresi matematika nominal (misal "25.000 + 15000" -> 40000, "50rb*3" -> 150000)
 * Aman tanpa eval()
 */
export function evaluateNominalExpression(input) {
  if (typeof input === 'number') return Math.round(input);
  if (!input || typeof input !== 'string') return 0;

  // Normalisasi: hapus Rp, spasi, titik ribuan, ubah rb/k/jt
  let expr = input
    .toLowerCase()
    .replace(/rp/g, '')
    .replace(/\s+/g, '')
    .replace(/ribu|rb|k/g, '*1000')
    .replace(/juta|jt/g, '*1000000');

  // Hapus titik yang berfungsi sebagai pemisah ribuan (diikuti 3 digit)
  expr = expr.replace(/\.(?=\d{3}(?:[^\d]|$))/g, '');
  // Ubah koma desimal jadi titik (misal 2,5*1000000)
  expr = expr.replace(/,/g, '.');

  // Hanya izinkan angka, titik desimal, dan operator + - * / ( )
  if (!/^[0-9+\-*/().]+$/.test(expr)) {
    const digitsOnly = input.replace(/[^\d]/g, '');
    return digitsOnly ? parseInt(digitsOnly, 10) : 0;
  }

  try {
    const tokens = expr.match(/(\d+(?:\.\d+)?|[+\-*/()])/g);
    if (!tokens) return 0;

    // Shunting-yard parser sederhana agar 100% aman dari code injection
    const precedence = { '+': 1, '-': 1, '*': 2, '/': 2 };
    const values = [];
    const ops = [];

    const applyOp = () => {
      const op = ops.pop();
      const b = values.pop() ?? 0;
      const a = values.pop() ?? 0;
      if (op === '+') values.push(a + b);
      else if (op === '-') values.push(a - b);
      else if (op === '*') values.push(a * b);
      else if (op === '/') values.push(b !== 0 ? a / b : 0);
    };

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (!isNaN(t)) {
        values.push(parseFloat(t));
      } else if (t === '(') {
        ops.push(t);
      } else if (t === ')') {
        while (ops.length && ops[ops.length - 1] !== '(') applyOp();
        ops.pop();
      } else if (['+', '-', '*', '/'].includes(t)) {
        while (
          ops.length &&
          ops[ops.length - 1] !== '(' &&
          precedence[ops[ops.length - 1]] >= precedence[t]
        ) {
          applyOp();
        }
        ops.push(t);
      }
    }

    while (ops.length) applyOp();
    const res = values[0];
    return Number.isFinite(res) && res >= 0 ? Math.round(res) : 0;
  } catch {
    const digitsOnly = input.replace(/[^\d]/g, '');
    return digitsOnly ? parseInt(digitsOnly, 10) : 0;
  }
}

/**
 * Format ISO date string ke tampilan singkat Indonesia (contoh: "02 Nov 2026, 11:04")
 */
export function formatDateShort(isoString) {
  if (!isoString) return '-';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return isoString;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(d);
}

/**
 * Ambil nilai datetime-local untuk input HTML ("YYYY-MM-DDTHH:mm")
 */
export function toDatetimeLocal(isoString) {
  const d = isoString ? new Date(isoString) : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Deteksi tipe buku kas ('personal' | 'business' | 'pekerjaan')
 */
export function getWorkspaceType(workspaceId, workspaces = []) {
  if (workspaceId === 'personal') return 'personal';
  if (workspaceId === 'business') return 'business';
  if (workspaceId === 'kopdes' || workspaceId === 'pekerjaan') return 'pekerjaan';
  const found = workspaces.find((w) => w.id === workspaceId);
  if (found?.type) return found.type;
  return 'personal';
}

/**
 * Ambil nama resmi Buku Kas
 */
export function getWorkspaceName(workspaceId, workspaces = []) {
  const found = workspaces.find((w) => w.id === workspaceId);
  if (found?.name) return found.name;
  if (workspaceId === 'personal') return 'Buku Pribadi';
  if (workspaceId === 'business') return 'Buku Usaha';
  if (workspaceId === 'kopdes' || workspaceId === 'pekerjaan') return 'Buku Pekerjaan';
  return 'Buku Kas';
}

/**
 * Tema visual Solid Flat Color (Anti AI-Slop) per Buku Kas
 */
export function getWorkspaceTheme(workspaceId, workspaces = []) {
  const type = getWorkspaceType(workspaceId, workspaces);
  if (type === 'business') {
    return {
      type: 'business',
      heroBg: 'bg-teal-900',
      heroBorder: 'border-teal-800',
      badgeBg: 'bg-teal-800 text-teal-100 border-teal-700',
      badgeText: 'BUKU KAS USAHA',
      primaryBtn: 'bg-teal-900 hover:bg-teal-800 text-white shadow-2xs',
      walletAccent: 'border-l-teal-600',
      dotCls: 'bg-teal-400',
      activeTabCls: 'bg-teal-900 text-white shadow-sm'
    };
  }
  if (type === 'pekerjaan') {
    return {
      type: 'pekerjaan',
      heroBg: 'bg-emerald-900',
      heroBorder: 'border-emerald-800',
      badgeBg: 'bg-emerald-800 text-emerald-100 border-emerald-700',
      badgeText: 'BUKU KAS PEKERJAAN',
      primaryBtn: 'bg-emerald-900 hover:bg-emerald-800 text-white shadow-2xs',
      walletAccent: 'border-l-emerald-600',
      dotCls: 'bg-emerald-400',
      activeTabCls: 'bg-emerald-900 text-white shadow-sm'
    };
  }
  return {
    type: 'personal',
    heroBg: 'bg-indigo-950',
    heroBorder: 'border-indigo-900',
    badgeBg: 'bg-indigo-900 text-indigo-100 border-indigo-800',
    badgeText: 'BUKU KAS PRIBADI',
    primaryBtn: 'bg-indigo-950 hover:bg-indigo-900 text-white shadow-2xs',
    walletAccent: 'border-l-indigo-600',
    dotCls: 'bg-indigo-400',
    activeTabCls: 'bg-indigo-950 text-white shadow-sm'
  };
}


