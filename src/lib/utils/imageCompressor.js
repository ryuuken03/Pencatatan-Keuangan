/**
 * Utilitas Kompresi Foto Struk / Nota di Memori Browser (PRD Bagian 4.2 & 6.2)
 * - Maksimal dimensi: 1000px (lebar atau tinggi)
 * - Mode Grayscale / High-Contrast opsional untuk memperjelas teks struk dan menghemat ukuran
 * - Output format: WebP (target ukuran < 80 KB, umumnya 25 KB - 65 KB)
 */

const MAX_DIMENSION_DEFAULT = 1000;
const OCR_MAX_DIMENSION = 1600;
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
    img.onerror = () => {
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
 * Normalisasi iluminasi lokal (Integral Image Background Division) + peningkatan kontras.
 * Sangat efektif menghilangkan bayangan gelap pada separuh struk (seperti foto struk di bawah bayangan HP)
 * sekaligus menajamkan teks dot-matrix pudar tanpa merusak keterbacaan OCR.
 */
function applyHighContrastGrayscale(ctx, width, height) {
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  const pixelCount = width * height;
  const grayBuf = new Uint8Array(pixelCount);

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    grayBuf[p] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }

  // Bangun Integral Image (Summed-Area Table) dalam O(W * H) untuk menghitung rata-rata terang lokal
  const stride = width + 1;
  const integral = new Uint32Array((width + 1) * (height + 1));

  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    const rowOffset = y * width;
    const prevIntOffset = y * stride;
    const currIntOffset = (y + 1) * stride;
    for (let x = 0; x < width; x++) {
      rowSum += grayBuf[rowOffset + x];
      integral[currIntOffset + x + 1] = integral[prevIntOffset + x + 1] + rowSum;
    }
  }

  // Radius jendela lokal adaptif (~1/16 dari dimensi terkecil)
  const radius = Math.max(14, Math.round(Math.min(width, height) / 16));

  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height, y + radius + 1);
    const rowOffset = y * width;
    const iY0 = y0 * stride;
    const iY1 = y1 * stride;

    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width, x + radius + 1);
      const area = (x1 - x0) * (y1 - y0);

      const sum =
        integral[iY1 + x1] -
        integral[iY0 + x1] -
        integral[iY1 + x0] +
        integral[iY0 + x0];

      const localMean = Math.max(40, sum / area);
      const gray = grayBuf[rowOffset + x];

      // Rasio kecerahan piksel terhadap kertas di sekitarnya (menghilangkan efek bayangan)
      const ratio = gray / localMean;

      let adjusted;
      if (ratio >= 0.94) {
        // Area kertas (baik terang maupun di bawah bayangan) dibuat putih bersih
        adjusted = Math.min(255, Math.round(245 + (ratio - 0.94) * 160));
      } else if (ratio <= 0.60) {
        // Area tinta pekat
        adjusted = 15;
      } else {
        // Transisi halus (anti-aliased) agar lekukan kertas lecek tidak menjadi garis hitam pekat & dot-matrix tidak hancur
        const t = (ratio - 0.60) / 0.34;
        adjusted = Math.round(15 + t * 230);
      }

      const idx = (rowOffset + x) * 4;
      data[idx] = adjusted;
      data[idx + 1] = adjusted;
      data[idx + 2] = adjusted;
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

/**
 * Hitung dimensi proporsional dengan batas maksimum
 */
function calcScaledDimensions(origW, origH, maxDim) {
  let width = origW;
  let height = origH;
  if (width > maxDim || height > maxDim) {
    if (width >= height) {
      height = Math.round((height * maxDim) / width);
      width = maxDim;
    } else {
      width = Math.round((width * maxDim) / height);
      height = maxDim;
    }
  }
  return { width, height };
}

/**
 * Kompres file gambar struk menjadi WebP < 80 KB sekaligus menyiapkan kanvas resolusi tinggi untuk OCR
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
 *   canvas: HTMLCanvasElement,
 *   ocrCanvas: HTMLCanvasElement,
 *   rawOcrCanvas: HTMLCanvasElement
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

  const origW = img.naturalWidth || img.width;
  const origH = img.naturalHeight || img.height;

  // 1. Siapkan Kanvas khusus OCR pada resolusi lebih tinggi (maks 1600px) agar teks struk panjang tidak pecah
  const ocrDim = calcScaledDimensions(origW, origH, OCR_MAX_DIMENSION);
  const rawOcrCanvas = document.createElement('canvas');
  rawOcrCanvas.width = ocrDim.width;
  rawOcrCanvas.height = ocrDim.height;
  const rawOcrCtx = rawOcrCanvas.getContext('2d');
  rawOcrCtx.fillStyle = '#FFFFFF';
  rawOcrCtx.fillRect(0, 0, ocrDim.width, ocrDim.height);
  rawOcrCtx.drawImage(img, 0, 0, ocrDim.width, ocrDim.height);

  const ocrCanvas = document.createElement('canvas');
  ocrCanvas.width = ocrDim.width;
  ocrCanvas.height = ocrDim.height;
  const ocrCtx = ocrCanvas.getContext('2d', { willReadFrequently: true });
  ocrCtx.drawImage(rawOcrCanvas, 0, 0);
  applyHighContrastGrayscale(ocrCtx, ocrDim.width, ocrDim.height);

  // 2. Siapkan Kanvas untuk penyimpanan WebP (< 80 KB)
  let { width, height } = calcScaledDimensions(origW, origH, maxDimension);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d', { willReadFrequently: highContrast });
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

  // Jika pada resolusi 1000px masih >= 80 KB, perkecil dimensi simpan (tanpa mengubah ocrCanvas)
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
    canvas,
    ocrCanvas,
    rawOcrCanvas
  };
}

