import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, ImagePlus, Trash2, Loader2, X, ZoomIn } from 'lucide-react';
import { loadImage, squareDataUrl } from '../../utils/photo.js';
import Avatar from './Avatar.jsx';

/**
 * Choose a profile photo: camera or gallery on phones, file on PC. Drag to move, slider to zoom.
 * onSave(dataUrl) and onRemove() should return promises; errors are shown in the dialog.
 */
export default function PhotoPicker({ name, photoUrl, title = 'Profile photo', onSave, onRemove, onClose }) {
  const [img, setImg] = useState(null);
  const [crop, setCrop] = useState({ zoom: 1, x: 0, y: 0 });
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const fileRef = useRef(null);
  const camRef = useRef(null);
  const drag = useRef(null);
  const PREVIEW = 220;

  useEffect(() => () => { if (img?.url) URL.revokeObjectURL(img.url); }, [img]);
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const pick = async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    setErr('');
    try { const r = await loadImage(f); setImg(r); setCrop({ zoom: 1, x: 0, y: 0 }); } catch (ex) { setErr(ex.message); }
  };

  // Preview geometry: the picture is scaled so its short side fills the circle at zoom 1
  const geo = (() => {
    if (!img) return null;
    const { naturalWidth: w, naturalHeight: h } = img.img;
    const scale = (PREVIEW / Math.min(w, h)) * crop.zoom;
    const dw = w * scale; const dh = h * scale;
    const maxX = (dw - PREVIEW) / 2; const maxY = (dh - PREVIEW) / 2;
    return { dw, dh, left: -maxX - crop.x * maxX, top: -maxY - crop.y * maxY, maxX, maxY };
  })();

  const onDown = (e) => { if (!geo) return; e.currentTarget.setPointerCapture?.(e.pointerId); drag.current = { px: e.clientX, py: e.clientY, x: crop.x, y: crop.y }; };
  const onMove = (e) => {
    if (!drag.current || !geo) return;
    const dx = e.clientX - drag.current.px; const dy = e.clientY - drag.current.py;
    const nx = geo.maxX ? drag.current.x - dx / geo.maxX : 0; const ny = geo.maxY ? drag.current.y - dy / geo.maxY : 0;
    setCrop((c) => ({ ...c, x: Math.max(-1, Math.min(1, nx)), y: Math.max(-1, Math.min(1, ny)) }));
  };
  const onUp = () => { drag.current = null; };

  const save = async () => {
    if (!img) { fileRef.current?.click(); return; }
    setBusy('save'); setErr('');
    try { await onSave(squareDataUrl(img.img, crop)); onClose(); } catch (ex) { setErr(ex.message || 'Could not save the photo.'); }
    setBusy('');
  };
  const remove = async () => {
    setBusy('remove'); setErr('');
    try { await onRemove(); onClose(); } catch (ex) { setErr(ex.message || 'Could not remove the photo.'); }
    setBusy('');
  };

  return createPortal(
    <div className="fixed inset-0 z-[90] mp-overlay bg-slate-900/50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={title}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="w-10 h-10 grid place-items-center rounded-xl hover:bg-slate-100" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-[13px] text-slate-500 -mt-1">{name}</p>

        <div className="mt-4 grid place-items-center">
          {img && geo ? (
            <div className="relative rounded-full overflow-hidden bg-slate-100 touch-none cursor-grab active:cursor-grabbing ring-4 ring-slate-100"
              style={{ width: PREVIEW, height: PREVIEW }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
              <img src={img.url} alt="" draggable={false} className="absolute max-w-none select-none pointer-events-none" style={{ width: geo.dw, height: geo.dh, left: geo.left, top: geo.top }} />
            </div>
          ) : (
            <Avatar name={name} photoUrl={photoUrl} size={PREVIEW} />
          )}
        </div>

        {img && (
          <label className="mt-4 flex items-center gap-3 text-sm text-slate-600">
            <ZoomIn className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="sr-only">Zoom</span>
            <input type="range" min="1" max="3" step="0.01" value={crop.zoom} onChange={(e) => setCrop((c) => ({ ...c, zoom: Number(e.target.value) }))} className="flex-1 accent-blue-600" aria-label="Zoom" />
          </label>
        )}
        {img && <p className="mt-1 text-center text-[12px] text-slate-500">Drag the photo to move it inside the circle.</p>}

        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pick} />
        <input ref={camRef} type="file" accept="image/*" capture="user" className="hidden" onChange={pick} />

        <div className="mt-4 grid grid-cols-2 gap-2">
          <span className="contents sm:hidden"><button type="button" onClick={() => camRef.current?.click()} className="mp-btn mp-btn-line justify-center min-h-[44px]"><Camera className="w-4 h-4" /> Take photo</button></span>
          <button type="button" onClick={() => fileRef.current?.click()} className="mp-btn mp-btn-line justify-center min-h-[44px] col-span-1 sm:col-span-2"><ImagePlus className="w-4 h-4" /> {img ? 'Choose another' : 'Choose photo'}</button>
        </div>

        {err && <p className="mt-3 text-sm text-rose-700" role="alert">{err}</p>}

        <div className="mt-4 flex items-center gap-2">
          {photoUrl && onRemove && !img && (
            <button type="button" onClick={remove} disabled={Boolean(busy)} className="h-11 px-3 rounded-full text-sm font-semibold text-rose-600 hover:bg-rose-50 inline-flex items-center gap-1.5">
              {busy === 'remove' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Remove
            </button>
          )}
          <button type="button" onClick={onClose} className="ml-auto h-11 px-4 rounded-full text-sm font-semibold hover:bg-slate-100">Cancel</button>
          <button type="button" onClick={save} disabled={Boolean(busy) || !img} className="h-11 px-5 rounded-full mp-btn mp-btn-dark text-sm disabled:opacity-50">
            {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Save photo
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
