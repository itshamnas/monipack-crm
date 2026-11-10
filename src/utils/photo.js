/**
 * Read an image file and return a square JPEG data URL (default 320x320, about 30-80 KB).
 * crop: { zoom >= 1, x, y } where x / y move the picture (-1..1) inside the square.
 */
export function loadImage(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) { reject(new Error('Choose a photo (JPG or PNG).')); return; }
    if (file.size > 25 * 1024 * 1024) { reject(new Error('That photo is too large.')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not open that photo. Try a JPG or PNG.')); };
    img.src = url;
  });
}

export function squareDataUrl(img, { zoom = 1, x = 0, y = 0 } = {}, size = 320) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
  const side = Math.min(img.naturalWidth, img.naturalHeight) / zoom;
  const maxX = (img.naturalWidth - side) / 2; const maxY = (img.naturalHeight - side) / 2;
  const sx = maxX + x * maxX; const sy = maxY + y * maxY;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  return c.toDataURL('image/jpeg', 0.86);
}

/** PUT (dataUrl) or DELETE (null) a photo endpoint; returns the new photoUrl or throws a readable error. */
export async function sendPhoto(fetcher, path, dataUrl) {
  const res = await fetcher(path, dataUrl
    ? { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photo: dataUrl }) }
    : { method: 'DELETE' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Could not save the photo.');
  return body.photoUrl || null;
}
