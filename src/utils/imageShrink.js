/**
 * Shrink a photo on the phone before uploading: quicker on mobile data, and the server stores sensible sizes.
 * Keeps the photo's rotation (browsers apply the camera's orientation when decoding).
 */
export async function shrinkImage(file, max = 2560, quality = 0.86) {
  const src = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('unreadable')); i.src = src; });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k)); const h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
    return { dataUrl: c.toDataURL('image/jpeg', quality), width: w, height: h };
  } finally { URL.revokeObjectURL(src); }
}
/** Full photo (max 2560 px) + small preview (max 480 px). */
export async function photoPair(file) {
  const full = await shrinkImage(file, 2560, 0.86);
  const thumb = await shrinkImage(file, 480, 0.8);
  return { full: full.dataUrl, thumb: thumb.dataUrl, width: full.width, height: full.height };
}
