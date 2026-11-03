/**
 * Utilitas Keamanan Lokal & Backup Terenkripsi (Modul 1C)
 * - Enkripsi & Dekripsi Backup JSON menggunakan WebCrypto API (PBKDF2 + AES-GCM 256-bit)
 * - Manajemen App PIN Lock 6 Digit (WebCrypto SHA-256 + Salt)
 * - Konversi Blob WebP <-> Base64 untuk serialisasi lampiran struk
 */

const PIN_STORAGE_KEY = 'buku_kas_pin_auth_v1';
const SESSION_UNLOCK_KEY = 'buku_kas_session_unlocked_v1';
const PBKDF2_ITERATIONS = 100000;

function bytesToBase64(bytes) {
  let binary = '';
  const len = bytes.byteLength;
  const chunkSize = 0x8000;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Konversi Blob (misal struk WebP) menjadi objek serializable { mime, data }
 */
export async function blobToSerializable(blob) {
  if (!blob || !(blob instanceof Blob)) return null;
  const buffer = await blob.arrayBuffer();
  return {
    __is_blob: true,
    mime: blob.type || 'image/webp',
    size: blob.size || buffer.byteLength,
    data: bytesToBase64(new Uint8Array(buffer))
  };
}

/**
 * Konversi kembali objek { __is_blob, mime, data } ke instance Blob
 */
export function serializableToBlob(obj) {
  if (!obj) return null;
  if (obj instanceof Blob) return obj;
  if (obj.__is_blob && typeof obj.data === 'string') {
    try {
      const bytes = base64ToBytes(obj.data);
      return new Blob([bytes], { type: obj.mime || 'image/webp' });
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Derive kunci AES-GCM 256-bit dari password menggunakan PBKDF2 (SHA-256)
 */
async function deriveAesGcmKey(password, saltBytes, keyUsage = ['encrypt', 'decrypt']) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    keyUsage
  );
}

/**
 * Enkripsi objek payload backup menjadi struktur JSON terenkripsi AES-GCM 256-bit
 */
export async function encryptBackupPayload(payloadObj, password) {
  if (!password || password.length < 4) {
    throw new Error('Password enkripsi minimal 4 karakter.');
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesGcmKey(password, salt, ['encrypt']);

  const enc = new TextEncoder();
  const plaintextBytes = enc.encode(JSON.stringify(payloadObj));

  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintextBytes
  );

  return {
    app: 'buku-kas-multi-workspace',
    version: 2,
    encrypted: true,
    cipher: 'AES-GCM-256',
    kdf: 'PBKDF2-SHA256',
    iterations: PBKDF2_ITERATIONS,
    exported_at: new Date().toISOString(),
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(cipherBuffer))
  };
}

/**
 * Dekripsi struktur JSON terenkripsi AES-GCM 256-bit kembali menjadi objek payload
 */
export async function decryptBackupPayload(encryptedWrapper, password) {
  if (!encryptedWrapper || !encryptedWrapper.encrypted) {
    return encryptedWrapper;
  }
  if (!password) {
    throw new Error('File backup ini terenkripsi. Masukkan password untuk membuka.');
  }

  try {
    const salt = base64ToBytes(encryptedWrapper.salt);
    const iv = base64ToBytes(encryptedWrapper.iv);
    const ciphertext = base64ToBytes(encryptedWrapper.ciphertext);

    const key = await deriveAesGcmKey(password, salt, ['decrypt']);
    const plainBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    const dec = new TextDecoder();
    const jsonStr = dec.decode(plainBuffer);
    return JSON.parse(jsonStr);
  } catch {
    throw new Error('Password salah atau file backup terenkripsi rusak.');
  }
}

/* ==========================================================================
   APP PIN LOCK 6 DIGIT (WebCrypto SHA-256 + Salt)
   ========================================================================== */

async function hashPinWithSalt(pin, saltBase64) {
  const enc = new TextEncoder();
  const data = enc.encode(`${saltBase64}:${String(pin).trim()}:buku_kas_pin_v1`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bytesToBase64(new Uint8Array(digest));
}

/**
 * Cek apakah pengguna mengaktifkan PIN Lock 6 digit
 */
export function hasPinLock() {
  try {
    const raw = localStorage.getItem(PIN_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Boolean(parsed && parsed.hash && parsed.salt);
  } catch {
    return false;
  }
}

/**
 * Cek apakah sesi saat ini sudah terbuka (unlocked)
 */
export function isSessionUnlocked() {
  if (!hasPinLock()) return true;
  try {
    return sessionStorage.getItem(SESSION_UNLOCK_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Set status sesi (unlocked / locked)
 */
export function setSessionUnlocked(unlocked) {
  try {
    if (unlocked) {
      sessionStorage.setItem(SESSION_UNLOCK_KEY, 'true');
    } else {
      sessionStorage.removeItem(SESSION_UNLOCK_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

/**
 * Simpan PIN 6 digit baru
 */
export async function savePinLock(pin) {
  const cleanPin = String(pin || '').trim();
  if (!/^\d{6}$/.test(cleanPin)) {
    throw new Error('PIN wajib terdiri dari 6 digit angka.');
  }
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = bytesToBase64(saltBytes);
  const hash = await hashPinWithSalt(cleanPin, salt);

  localStorage.setItem(
    PIN_STORAGE_KEY,
    JSON.stringify({
      salt,
      hash,
      updated_at: new Date().toISOString()
    })
  );
  setSessionUnlocked(true);
}

/**
 * Verifikasi PIN 6 digit
 */
export async function verifyPinLock(pin) {
  const cleanPin = String(pin || '').trim();
  if (!/^\d{6}$/.test(cleanPin)) return false;

  try {
    const raw = localStorage.getItem(PIN_STORAGE_KEY);
    if (!raw) return true;
    const parsed = JSON.parse(raw);
    if (!parsed?.salt || !parsed?.hash) return true;

    const computed = await hashPinWithSalt(cleanPin, parsed.salt);
    const isValid = computed === parsed.hash;
    if (isValid) {
      setSessionUnlocked(true);
    }
    return isValid;
  } catch {
    return false;
  }
}

/**
 * Nonaktifkan PIN Lock
 */
export function disablePinLock() {
  localStorage.removeItem(PIN_STORAGE_KEY);
  setSessionUnlocked(true);
}

