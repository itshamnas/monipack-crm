import React, { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Camera, Link2, Copy, MessageCircle, QrCode, Ban, KeyRound, Download, Trash2, X, Loader2, ImagePlus, ChevronLeft, ChevronRight, Lock, Images } from 'lucide-react';
import { getApiUrl } from '../../api/config.js';
import DateField from '../ui/DateField.jsx';
import { photoPair } from '../../utils/imageShrink.js';
import { fmtDateTime } from './SponsorDoc.jsx';

/**
 * Super admin → a sponsorship event → Event photos.
 * Make an upload link (with a QR code to print at the event, PIN optional), see every photo as it arrives,
 * open, download one or all (ZIP), add your own, or delete.
 */
const btn = 'inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-[40px] px-4 rounded-full text-[13px] font-bold transition active:scale-[0.97] disabled:opacity-50';
const card = 'bg-white rounded-3xl border border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.04)]';
const mb = (b) => (b > 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)} GB` : `${Math.max(0.1, b / 1024 ** 2).toFixed(1)} MB`);
const pad = (n) => String(n).padStart(2, '0');
const localStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function LinkDialog({ info, title, onClose, showToast }) {
  const full = `${window.location.origin}${info.path}`;
  const [qr, setQr] = useState('');
  useEffect(() => { QRCode.toDataURL(full, { width: 720, margin: 1, errorCorrectionLevel: 'M' }).then(setQr).catch(() => {}); }, [full]);
  const copy = async (t, w) => { try { await navigator.clipboard.writeText(t); showToast(`${w} copied`); } catch { showToast('Could not copy', 'error'); } };
  const wa = `https://wa.me/?text=${encodeURIComponent(`Please share your photos from "${title}" here:\n${full}${info.pin ? '\n\n(The PIN is sent separately.)' : ''}`)}`;
  const printQr = () => {
    const w = window.open('', '_blank');
    if (!w) { showToast('Allow pop-ups to print', 'error'); return; }
    w.document.write(`<!doctype html><title>Event photos QR</title><body style="font-family:system-ui,sans-serif;text-align:center;padding:40px">
      <h1 style="margin:0 0 6px">Share your photos</h1><h2 style="margin:0 0 24px;font-weight:500;color:#475569">${title.replace(/</g, '&lt;')}</h2>
      <img src="${qr}" style="width:70%;max-width:420px"><p style="font-size:18px;margin-top:18px">Scan with your phone camera</p>
      <p style="color:#64748b">Monipack · www.monipack.com</p><script>onload=()=>setTimeout(()=>print(),300)</script></body>`);
    w.document.close();
  };
  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/55 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Upload link">
      <div className="bg-white rounded-[28px] p-6 w-full max-w-md max-h-[94vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div><h3 className="text-[19px] font-extrabold">Photo upload link ready</h3><p className="text-[13.5px] text-slate-500">{info.label} · open until {new Date(info.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p></div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-10 h-10 grid place-items-center rounded-xl hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>
        {qr && <img src={qr} alt="QR code for the upload link" className="mt-4 mx-auto w-52 h-52" />}
        <div className="mt-3 p-3 rounded-2xl bg-slate-50 text-[13px] break-all font-mono">{full}</div>
        {info.pin && (
          <div className="mt-3 p-4 rounded-2xl bg-slate-900 text-white text-center">
            <span className="block text-[12px] text-slate-300 font-semibold">PIN (shown only now)</span>
            <span className="block text-[32px] font-extrabold tracking-[0.3em] tabular-nums select-all">{info.pin}</span>
          </div>
        )}
        <p className="mt-3 text-[13px] text-slate-600">Share it with your event team, the brand or guests. Print the QR code and place it at the stand so people can scan it.</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" className={`${btn} bg-white border border-slate-200`} onClick={() => copy(full, 'Link')}><Copy className="w-4 h-4" /> Copy link</button>
          <a className={`${btn} bg-emerald-600 text-white`} href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle className="w-4 h-4" /> WhatsApp</a>
          <button type="button" className={`${btn} bg-white border border-slate-200`} onClick={printQr} disabled={!qr}><QrCode className="w-4 h-4" /> Print QR</button>
          {qr && <a className={`${btn} bg-white border border-slate-200`} href={qr} download="event-photos-qr.png"><Download className="w-4 h-4" /> Save QR</a>}
        </div>
      </div>
    </div>
  );
}

export default function EventPhotos({ ev, authFetch, showToast }) {
  const [data, setData] = useState(null);
  const [making, setMaking] = useState(false);
  const [form, setForm] = useState({ label: 'Event team', expires: '', withPin: false });
  const [dialog, setDialog] = useState(null);
  const [view, setView] = useState(null); // index of the open photo
  const [adding, setAdding] = useState(null); // { done, total }
  const [zipping, setZipping] = useState(false);

  const load = useCallback(async () => {
    const r = await authFetch(`/api/sponsorships/${ev.id}/photos`);
    if (r.ok) setData(await r.json());
  }, [ev.id, authFetch]);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  const defaultExpiry = () => { const d = ev.endsAt ? new Date(new Date(ev.endsAt).getTime() + 7 * 86400000) : new Date(Date.now() + 30 * 86400000); return localStr(d); };
  const make = async () => {
    const r = await authFetch(`/api/sponsorships/${ev.id}/upload-links`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: form.label, withPin: form.withPin, expiresAt: (form.expires || defaultExpiry()) ? new Date(`${form.expires || defaultExpiry()}T23:59:00+04:00`).toISOString() : null }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { showToast(d.error || 'Could not make the link', 'error'); return; }
    setMaking(false); setDialog(d); load();
  };
  const revoke = async (l) => {
    if (!window.confirm(`Close the link "${l.label}"? Nobody can upload with it any more. Photos already uploaded stay.`)) return;
    const r = await authFetch(`/api/sponsorship-upload-links/${l.id}/revoke`, { method: 'POST' });
    if (r.ok) { showToast('Link closed.'); load(); } else showToast('Could not close the link', 'error');
  };
  const newPin = async (l) => {
    const r = await authFetch(`/api/sponsorship-upload-links/${l.id}/pin`, { method: 'POST' });
    const d = await r.json().catch(() => ({}));
    if (r.ok) setDialog({ ...l, pin: d.pin }); else showToast(d.error || 'Could not make a PIN', 'error');
  };
  const del = async (p) => {
    if (!window.confirm('Delete this photo? This cannot be undone.')) return;
    const r = await authFetch(`/api/sponsorship-photos/${p.id}`, { method: 'DELETE' });
    if (r.ok) { showToast('Photo deleted.'); setView(null); load(); } else showToast('Could not delete', 'error');
  };
  const addOwn = async (files) => {
    const list = [...files]; if (!list.length) return;
    setAdding({ done: 0, total: list.length });
    let ok = 0;
    for (const f of list) {
      try {
        const pair = await photoPair(f);
        const r = await authFetch(`/api/sponsorships/${ev.id}/photos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pair) });
        if (r.ok) ok += 1;
      } catch { /* counted as failed */ }
      setAdding((a) => ({ ...a, done: a.done + 1 }));
    }
    setAdding(null); load();
    showToast(ok === list.length ? `${ok} photo${ok === 1 ? '' : 's'} added.` : `${ok} of ${list.length} added; some could not be read.`, ok === list.length ? 'success' : 'error');
  };
  const zip = async () => {
    setZipping(true);
    try {
      const r = await authFetch(`/api/sponsorships/${ev.id}/photos.zip`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not make the ZIP');
      const blob = await r.blob();
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `${ev.title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'event'}-photos.zip`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) { showToast(e.message, 'error'); }
    setZipping(false);
  };

  const photos = data?.photos || [];
  const open = view != null ? photos[view] : null;
  useEffect(() => {
    if (view == null) return undefined;
    const k = (e) => { if (e.key === 'Escape') setView(null); if (e.key === 'ArrowRight') setView((v) => Math.min(photos.length - 1, v + 1)); if (e.key === 'ArrowLeft') setView((v) => Math.max(0, v - 1)); };
    document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k);
  }, [view, photos.length]);

  return (
    <section className={`${card} p-5`} aria-label="Event photos">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[16px] font-bold mr-auto flex items-center gap-2"><Camera className="w-5 h-5 text-slate-500" /> Event photos {data && <span className="text-[13px] font-semibold text-slate-500">· {photos.length} photo{photos.length === 1 ? '' : 's'}{photos.length ? ` · ${mb(data.totalBytes)}` : ''}</span>}</h3>
        {ev.status !== 'cancelled' && <button type="button" onClick={() => setMaking((v) => !v)} className={`${btn} bg-slate-900 text-white`}><Link2 className="w-4 h-4" /> Make upload link</button>}
        <label className={`${btn} bg-white border border-slate-200 cursor-pointer`}><ImagePlus className="w-4 h-4" /> Add photos<input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { addOwn(e.target.files); e.target.value = ''; }} /></label>
        {photos.length > 0 && <button type="button" onClick={zip} disabled={zipping} className={`${btn} bg-white border border-slate-200`}>{zipping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Download all (ZIP)</button>}
      </div>

      {making && (
        <div className="mt-3 p-3 rounded-2xl bg-slate-50 grid sm:grid-cols-[1fr_200px] gap-2">
          <label className="block"><span className="block text-[12.5px] font-bold text-slate-600 mb-1">Who is it for?</span>
            <input className="w-full h-11 px-3.5 rounded-xl border border-slate-300 bg-white text-[14.5px]" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Event team, Al Fair Foods, Guests" /></label>
          <label className="block"><span className="block text-[12.5px] font-bold text-slate-600 mb-1">Open until</span>
            <DateField value={form.expires || defaultExpiry()} min={localStr(new Date())} allowClear={false} onChange={(v) => setForm({ ...form, expires: v })} className="h-11 bg-white" aria-label="Open until" /></label>
          <label className="sm:col-span-2 flex items-center gap-3 min-h-[44px] text-[14px]">
            <input type="checkbox" className="w-5 h-5" checked={form.withPin} onChange={(e) => setForm({ ...form, withPin: e.target.checked })} />
            <span><b>Ask for a PIN</b> <span className="text-slate-500">(for a private team. Leave off so anyone who scans the QR can upload.)</span></span>
          </label>
          <div className="sm:col-span-2 flex justify-end gap-2">
            <button type="button" onClick={() => setMaking(false)} className={`${btn} bg-white border border-slate-200`}>Cancel</button>
            <button type="button" onClick={make} className={`${btn} bg-[#2F5BEA] text-white`}><Link2 className="w-4 h-4" /> Make link</button>
          </div>
        </div>
      )}

      {data?.links?.length > 0 && (
        <ul className="mt-3 space-y-2">
          {data.links.map((l) => (
            <li key={l.id} className={`p-3 rounded-2xl border ${l.active ? 'border-slate-200' : 'border-dashed border-slate-200 opacity-70'} flex flex-wrap items-center gap-x-3 gap-y-2`}>
              <span className="flex-1 min-w-[180px]">
                <b className="text-[14.5px] flex items-center gap-1.5">{l.label}{l.hasPin && <Lock className="w-3.5 h-3.5 text-slate-500" aria-label="Needs a PIN" />}</b>
                <span className="text-[12.5px] text-slate-500">{l.photos} photo{l.photos === 1 ? '' : 's'} · {l.active ? `open until ${new Date(l.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : l.revokedAt ? 'closed' : 'expired'}</span>
              </span>
              {l.active && (
                <span className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setDialog(l)} className={`${btn} bg-white border border-slate-200`}><QrCode className="w-4 h-4" /> Link and QR</button>
                  {l.hasPin && <button type="button" onClick={() => newPin(l)} className={`${btn} bg-white border border-slate-200`}><KeyRound className="w-4 h-4" /> New PIN</button>}
                  <button type="button" onClick={() => revoke(l)} className={`${btn} bg-white border border-rose-200 text-rose-700`}><Ban className="w-4 h-4" /> Close link</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding && <p className="mt-3 text-[13.5px] font-semibold text-[#2F5BEA] flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Adding photos {adding.done} of {adding.total}…</p>}

      {data && !photos.length && (
        <div className="mt-4 p-6 rounded-2xl bg-slate-50 text-center text-slate-500">
          <Images className="w-8 h-8 mx-auto text-slate-300" />
          <p className="mt-2 text-[14px]">No photos yet. Make an upload link and share it, or add photos yourself.</p>
        </div>
      )}
      {photos.length > 0 && (
        <ul className="mt-4 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          {photos.map((p, i) => (
            <li key={p.id}>
              <button type="button" onClick={() => setView(i)} className="relative block w-full aspect-square rounded-xl overflow-hidden bg-slate-100 group" aria-label={`Photo by ${p.uploaderName}`}>
                <img src={getApiUrl(p.thumbUrl)} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition" />
                <span className="absolute left-0 right-0 bottom-0 px-1.5 py-1 bg-gradient-to-t from-black/60 to-transparent text-white text-[10.5px] font-semibold truncate text-left">{p.uploaderName}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="fixed inset-0 z-[80] bg-slate-950/90 flex flex-col" role="dialog" aria-modal="true" aria-label="Photo">
          <div className="flex items-center gap-2 p-3 text-white">
            <span className="flex-1 min-w-0 text-[13.5px]"><b className="block truncate">{open.uploaderName}{open.uploaderPhone ? ` · ${open.uploaderPhone}` : ''}</b><span className="text-slate-300">{fmtDateTime(open.createdAt)} · {view + 1} of {photos.length}</span></span>
            <a href={getApiUrl(open.url)} download className="w-11 h-11 grid place-items-center rounded-xl hover:bg-white/10" aria-label="Download this photo"><Download className="w-5 h-5" /></a>
            <button type="button" onClick={() => del(open)} className="w-11 h-11 grid place-items-center rounded-xl hover:bg-white/10 text-rose-300" aria-label="Delete this photo"><Trash2 className="w-5 h-5" /></button>
            <button type="button" onClick={() => setView(null)} className="w-11 h-11 grid place-items-center rounded-xl hover:bg-white/10" aria-label="Close"><X className="w-6 h-6" /></button>
          </div>
          <div className="relative flex-1 min-h-0 grid place-items-center px-2 pb-4">
            <img src={getApiUrl(open.url)} alt={`Photo by ${open.uploaderName}`} className="max-w-full max-h-full object-contain rounded-lg" />
            {view > 0 && <button type="button" onClick={() => setView(view - 1)} className="absolute left-2 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/15 text-white grid place-items-center" aria-label="Previous photo"><ChevronLeft className="w-6 h-6" /></button>}
            {view < photos.length - 1 && <button type="button" onClick={() => setView(view + 1)} className="absolute right-2 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/15 text-white grid place-items-center" aria-label="Next photo"><ChevronRight className="w-6 h-6" /></button>}
          </div>
        </div>
      )}
      {dialog && <LinkDialog info={dialog} title={ev.title} onClose={() => setDialog(null)} showToast={showToast} />}
    </section>
  );
}
