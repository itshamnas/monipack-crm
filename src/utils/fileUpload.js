import { pdfToImages } from './pdfPages.js';

// Prepares a photo or PDF for upload to the CRM.
// Every upload is turned into a standard PDF on the server (company header, document name, number on file):
// - a photo becomes that PDF directly;
// - a PDF is kept as the original, and its pages are also sent as images so the standard PDF can be made.
// - PDF and JPEG up to 10 MB are sent unchanged (original quality).
// - Other images (PNG, WebP, HEIC on iPhone, very large JPEGs) are converted to a high-quality JPEG in the browser.

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_SIDE = 3000;

const readAsDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('Could not read the file.'));
    r.readAsDataURL(blob);
  });

const loadImage = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This photo format cannot be opened. Please take a new photo or use JPG.')); };
    img.src = url;
  });

async function toJpeg(file) {
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  if (!blob) throw new Error('Could not convert the photo.');
  return blob;
}

/** @returns {Promise<{ base64: string, name: string, previewUrl: string|null, isPdf: boolean }>} */
export async function prepareUpload(file) {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (isPdf) {
    if (file.size > MAX_UPLOAD_BYTES) throw new Error('This PDF is larger than 10 MB.');
    let pages = [];
    try { pages = (await pdfToImages(file, { maxPages: 10, scale: 1.4, quality: 0.82 })).images; } catch { pages = []; }
    return { base64: await readAsDataUrl(file), name: file.name, previewUrl: pages[0] || null, isPdf: true, pages };
  }
  if (!file.type.startsWith('image/') && !/\.(jpe?g|png|heic|heif|webp)$/i.test(file.name)) {
    throw new Error('Please choose a photo or a PDF.');
  }
  const isJpeg = file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name);
  const blob = isJpeg && file.size <= MAX_UPLOAD_BYTES ? file : await toJpeg(file);
  if (blob.size > MAX_UPLOAD_BYTES) throw new Error('This photo is larger than 10 MB.');
  return {
    base64: await readAsDataUrl(blob),
    name: file.name.replace(/\.[^.]+$/, '') + '.jpg',
    previewUrl: URL.createObjectURL(blob),
    isPdf: false,
  };
}

export const FILE_LABEL_NAMES = {
  cr_certificate: 'CR paper',
  vat_certificate: 'VAT certificate',
  shop_front: 'Shop front',
  other: 'Other',
};
