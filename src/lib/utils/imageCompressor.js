/**
 * Utilitas Kompresi Foto Struk / Nota di Memori Browser (PRD Bagian 4.2 & 6.2)
 * - Maksimal dimensi: 1000px (lebar atau tinggi)
 * - Mode Grayscale / High-Contrast opsional untuk memperjelas teks struk dan menghemat ukuran
 * - Output format: WebP (target ukuran < 80 KB, umumnya 25 KB - 65 KB)
 */

const MAX_DIMENSION_DEFAULT = 1000;
const TARGET_MAX_BYTES = 80 * 1024; // 80 KB

/**
 * Muat File / Blob gambar ke elemen HTMLImageElement
 */
function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(new Error('Gagal memuat file gambar. Pastikan format foto valid.'));
    };
    img.src = url;
  });
}

/**
 * Konversi Canvas ke Blob (dengan fallback jika browser lama)
 */
function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        resolve(blob);
      },
      mimeType,
      quality
    );
  });
}

/**
 * Terapkan filter Grayscale & peningkatan kontras ringan agar teks struk tajam dan ukuran WebP lebih kecil
 */
function applyHighContrastGrayscale(ctx, width, height) {
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  const contrast = 1.28; // tingkatkan kontras 28%
  const intercept = 128 * (1 - contrast);

  for (let i = 0; i < data.length; i += 4) {
    // Luminance standar
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    let adjusted = gray * contrast + intercept;
    if (adjusted < 0) adjusted = 0;
    else if (adjusted > 255) adjusted = 255;

    data[i] = adjusted;
    data[i + 1] = adjusted;
    data[i + 2] = adjusted;
  }

  ctx.putImageData(imgData, 0, 0);
}

/**
 * Kompres file gambar struk menjadi WebP < 80 KB
 * @param {File|Blob} file
 * @param {Object} options
 * @param {number} [options.maxDimension=1000]
 * @param {number} [options.initialQuality=0.6]
 * @param {boolean} [options.highContrast=false]
 * @returns {Promise<{
 *   blob: Blob,
 *   width: number,
 *   height: number,
 *   sizeBytes: number,
 *   sizeKB: number,
 *   originalSizeKB: number,
 *   mimeType: string,
 *   canvas: HTMLCanvasElement
 * }>}
 */
export async function compressReceiptImage(
  file,
  {
    maxDimension = MAX_DIMENSION_DEFAULT,
    initialQuality = 0.6,
    highContrast = false
  } = {}
) {
  if (!file) {
    throw new Error('Tidak ada file gambar yang dipilih.');
  }

  const originalSizeKB = Math.round((file.size / 1024) * 10) / 10;
  const img = await loadImageFromFile(file);

  let width = img.naturalWidth || img.width;
  let height = img.naturalHeight || img.height;

  if (width > maxDimension || height > maxDimension) {
    if (width >= height) {
      height = Math.round((height * maxDimension) / width);
      width = maxDimension;
    } else {
      width = Math.round((width * maxDimension) / height);
      height = maxDimension;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d', { willReadFrequently: highContrast });
  // Latar putih untuk berjaga-jaga jika gambar PNG transparan
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  if (highContrast) {
    applyHighContrastGrayscale(ctx, width, height);
  }

  // Coba kompres ke WebP mulai dari initialQuality (0.6)
  let quality = initialQuality;
  let blob = await canvasToBlob(canvas, 'image/webp', quality);

  // Fallback ke image/jpeg jika browser tidak mendukung encode image/webp
  const mimeType = blob && blob.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
  if (!blob) {
    blob = await canvasToBlob(canvas, mimeType, quality);
  }

  // Jika ukuran masih >= 80 KB, turunkan kualitas secara bertahap
  const qualitySteps = [0.5, 0.42, 0.35, 0.28, 0.22];
  for (const q of qualitySteps) {
    if (blob.size < TARGET_MAX_BYTES) break;
    quality = q;
    blob = await canvasToBlob(canvas, mimeType, quality);
  }

  // Jika pada resolusi 1000px masih >= 80 KB (misal foto sangat ramai), perkecil dimensi ke 800px lalu 650px
  const scaleSteps = [0.8, 0.65];
  for (const scale of scaleSteps) {
    if (blob.size < TARGET_MAX_BYTES) break;
    const scaledW = Math.max(320, Math.round(width * scale));
    const scaledH = Math.max(320, Math.round(height * scale));
    canvas.width = scaledW;
    canvas.height = scaledH;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, scaledW, scaledH);
    ctx.drawImage(img, 0, 0, scaledW, scaledH);
    if (highContrast) {
      applyHighContrastGrayscale(ctx, scaledW, scaledH);
    }
    blob = await canvasToBlob(canvas, mimeType, 0.45);
    width = scaledW;
    height = scaledH;
  }

  const sizeBytes = blob ? blob.size : 0;
  const sizeKB = Math.round((sizeBytes / 1024) * 10) / 10;

  return {
    blob,
    width,
    height,
    sizeBytes,
    sizeKB,
    originalSizeKB,
    mimeType: blob?.type || mimeType,
    canvas
  };
}

