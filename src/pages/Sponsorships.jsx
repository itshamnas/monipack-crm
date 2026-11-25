import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, ArrowLeft, Loader2, Image as ImageIcon, Trash2, Save, Link2, Copy, MessageCircle, KeyRound, Ban, CheckCircle2, Clock3,
  MessageSquareWarning, Eye, Printer, Pencil, CalendarDays, MapPin, Users, Megaphone, Wallet, ScrollText, Package, Upload, X, Lock, RotateCcw, Split,
} from 'lucide-react';
import { getApiUrl } from '../api/config.js';
import SponsorDocument, { fmtDate, fmtDateTime, omr, whenText } from '../components/sponsorship/SponsorDoc.jsx';
import { printSponsorship } from '../utils/sponsorPdf.js';
import { useAddButton } from '../hooks/useMedia.js';
import DateField from '../components/ui/DateField.jsx';

/**
 * Super admin → Sponsorships: prepare a co-sponsored event, send personal PIN links to the Monipack MD and then
 * to each partner brand, follow every approval, and print the approval certificate.
 */
const STATUS = {
  draft: ['Draft', 'bg-slate-100 text-slate-700'],
  md_pending: ['Waiting for MD', 'bg-blue-50 text-blue-700'],
  changes_requested: ['Changes requested', 'bg-amber-50 text-amber-800'],
  brand_pending: ['Waiting for brand', 'bg-violet-50 text-violet-700'],
  approved: ['Approved', 'bg-emerald-50 text-emerald-700'],
  cancelled: ['Cancelled', 'bg-rose-50 text-rose-700'],
};
const Chip = ({ s }) => { const [l, c] = STATUS[s] || STATUS.draft; return <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-bold whitespace-nowrap ${c}`}>{l}</span>; };
const card = 'bg-white rounded-3xl border border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.04)]';
const btn = 'inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-[40px] px-4 rounded-full text-[13px] font-bold transition active:scale-[0.97] disabled:opacity-50';
const input = 'w-full h-11 px-3.5 rounded-xl border border-slate-300 text-[14.5px] bg-white focus:outline-none focus:border-[#2F5BEA]';
const MONIPACK = 'Monipack (Morooj Nizwa International LLC)';

// Oman is UTC+4 all year
const toLocal = (iso) => (iso ? new Date(new Date(iso).getTime() + 4 * 3600000).toISOString().slice(0, 16) : '');
const fromLocal = (v) => (v ? new Date(`${v}:00+04:00`).toISOString() : null);

async function resizeImage(file, max = 1800) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.86);
  } finally { URL.revokeObjectURL(url); }
}

const blank = (terms = '') => ({
  title: '', audience: '', audienceNote: '', venue: '', venueAddress: '', mapUrl: '', coordinatorName: '', coordinatorPhone: '',
  startsAt: null, endsAt: null, timeNote: '', promotion: '', totalAmount: '', terms,
  parties: [{ kind: 'monipack', company: MONIPACK, sharePct: 50 }, { kind: 'brand', company: '', sharePct: 50 }],
  materials: [{ name: 'Roll-up banner', qty: 2, providedBy: 'Each brand provides its own', note: '' }],
});

// ---------------------------------------------------------------- editor
function Editor({ initial, meta, authFetch, showToast, onSaved, onCancel }) {
  const [f, setF] = useState(initial);
  const [poster, setPoster] = useState(null); // new image data URL waiting to upload
  const [banner, setBanner] = useState(null);
  const [busy, setBusy] = useState(false);
  const isNew = !initial.id;
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const sum = f.parties.reduce((s, p) => s + (Number(p.sharePct) || 0), 0);
  const amounts = useMemo(() => {
    const t = Number(f.totalAmount) || 0; let used = 0;
    return f.parties.map((p, i) => { const a = i === f.parties.length - 1 ? Math.round((t - used) * 1000) / 1000 : Math.round(t * (Number(p.sharePct) || 0) * 10) / 1000; used += a; return a; });
  }, [f.parties, f.totalAmount]);
  const hadDecisions = (initial.decisions || []).some((d) => d.version === initial.version);

  const splitEqually = () => {
    const n = f.parties.length; const base = Math.floor((100 / n) * 1000) / 1000;
    set('parties', f.parties.map((p, i) => ({ ...p, sharePct: i === n - 1 ? Math.round((100 - base * (n - 1)) * 1000) / 1000 : base })));
  };
  const setParty = (i, k, v) => set('parties', f.parties.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
  const addBrand = () => {
    const next = [...f.parties, { kind: 'brand', company: '', sharePct: 0 }];
    const n = next.length; const base = Math.floor((100 / n) * 1000) / 1000;
    set('parties', next.map((p, i) => ({ ...p, sharePct: i === n - 1 ? Math.round((100 - base * (n - 1)) * 1000) / 1000 : base })));
  };
  const setMat = (i, k, v) => set('materials', f.materials.map((m, j) => (j === i ? { ...m, [k]: v } : m)));
  const pick = async (e, which) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    try { const d = await resizeImage(file, which === 'banner' ? 2400 : 1800); (which === 'banner' ? setBanner : setPoster)(d); }
    catch { showToast('Could not read that picture.', 'error'); }
  };

  const save = async () => {
    if (Math.abs(sum - 100) > 0.01) { showToast(`The shares add up to ${Math.round(sum * 1000) / 1000}%. Make them 100%.`, 'error'); return; }
    setBusy(true);
    try {
      const body = { ...f, totalAmount: Number(f.totalAmount) || 0, parties: f.parties.map((p) => ({ ...p, sharePct: Number(p.sharePct) || 0 })) };
      const r = await authFetch(isNew ? '/api/sponsorships' : `/api/sponsorships/${initial.id}`, { method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      let d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not save');
      for (const [kind, dataUrl] of [['poster', poster], ['banner', banner]]) {
        if (!dataUrl) continue;
        const ri = await authFetch(`/api/sponsorships/${d.id}/image`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, dataUrl }) });
        const di = await ri.json().catch(() => ({}));
        if (!ri.ok) throw new Error(di.error || `Saved, but the ${kind} picture failed`);
        d = di;
      }
      showToast(isNew ? 'Event saved. Now make the Managing Director\'s link.' : (d.version > initial.version ? `Saved as version ${d.version}: approvals are needed again.` : 'Saved.'));
      onSaved(d);
    } catch (e) { showToast(e.message, 'error'); }
    setBusy(false);
  };
  const removeImage = async (kind) => {
    if (isNew) { (kind === 'banner' ? setBanner : setPoster)(null); return; }
    const r = await authFetch(`/api/sponsorships/${initial.id}/image`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, dataUrl: null }) });
    const d = await r.json().catch(() => ({}));
    if (r.ok) { (kind === 'banner' ? setBanner : setPoster)(null); setF((x) => ({ ...x, [kind === 'banner' ? 'bannerUrl' : 'posterUrl']: null })); showToast('Picture removed.'); } else showToast(d.error || 'Could not remove', 'error');
  };
  const saveDefaultTerms = async () => {
    const r = await authFetch('/api/sponsorships/meta/terms', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: f.terms }) });
    showToast(r.ok ? 'Saved as the default terms for new events.' : 'Could not save the default.', r.ok ? 'success' : 'error');
  };

  const posterShown = poster || (f.posterUrl ? getApiUrl(f.posterUrl) : null);
  const bannerShown = banner || (f.bannerUrl ? getApiUrl(f.bannerUrl) : null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onCancel} className={`${btn} bg-white border border-slate-200`}><ArrowLeft className="w-4 h-4" /> Back</button>
        <h2 className="text-[20px] font-extrabold mr-auto">{isNew ? 'New sponsorship event' : `Edit: ${initial.title}`}</h2>
        <button type="button" onClick={save} disabled={busy} className={`${btn} bg-[#CC1A22] text-white`}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save</button>
      </div>
      {hadDecisions && (
        <p className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-[14px]">
          Someone has already responded to version {initial.version}. Saving a change to the agreement makes <b>version {initial.version + 1}</b>, and everyone approves it again on the same links. (Changing only the header banner does not.)
        </p>
      )}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-4">
        <div className="space-y-4 min-w-0">
          {/* Plain inputs (not components) so typing never loses focus */}
          <section className={`${card} p-5 sm:p-6`}>
            <h3 className="flex items-center gap-2 text-[16px] font-bold"><CalendarDays className="w-5 h-5 text-slate-500" />Event</h3>
            <div className="mt-4 grid sm:grid-cols-2 gap-3">
              <label className="block sm:col-span-2"><span className="block text-[12.5px] font-bold text-slate-600 mb-1">Event name</span>
                <input className={input} value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Nizwa Winter Festival 2026" /></label>
              <label className="block"><span className="block text-[12.5px] font-bold text-slate-600 mb-1">Starts (Oman time)</span>
                <DateField withTime aria-label="Starts" className={input} value={toLocal(f.startsAt)} onChange={(v) => set('startsAt', fromLocal(v))} /></label>
              <label className="block"><span className="block text-[12.5px] font-bold text-slate-600 mb-1">Ends (Oman time)</span>
                <DateField withTime aria-label="Ends" className={input} min={toLocal(f.startsAt)} value={toLocal(f.endsAt)} onChange={(v) => set('endsAt', fromLocal(v))} /></label>
              <label className="block sm:col-span-2"><span className="block text-[12.5px] font-bold text-slate-600 mb-1">Time note (optional)</span>
                <input className={input} value={f.timeNote} onChange={(e) => set('timeNote', e.target.value)} placeholder="e.g. Daily 4 pm to 11 pm" /></label>
              <label className="block"><span className="block text-[12.5px] font-bold text-slate-600 mb-1">Approximate audience</span>
                <input className={input} value={f.audience} onChange={(e) => set('audience', e.target.value)} placeholder="e.g. 3,000 visitors" /></label>
              <label className="block"><span className="block text-[12.5px] font-bold text-slate-600 mb-1">Audience note (optional)</span>
                <input className={input} value={f.audienceNote} onChange={(e) => set('audienceNote', e.target.value)} placeholder="e.g. Families, 3 days" /></label>
            </div>
          </section>

          <section className={`${card} p-5 sm:p-6`}>
            <h3 className="flex items-center gap-2 text-[16px] font-bold"><MapPin className="w-5 h-5 text-slate-500" />Place and coordinator</h3>
            <div className="mt-4 grid sm:grid-cols-2 gap-3">
              <label className="block"><span className="block text-[12.5px] font-bold text-slate-600 mb-1">Place of event</span>
                <input className={input} value={f.venue} onChange={(e) => set('venue', e.target.value)} placeholder="e.g. Nizwa Grand Mall" /></label>
              <label className="block"><span className="block text-[12.5px] font-bold text-slate-600 mb-1">Address (optional)</span>
                <input className={input} value={f.venueAddress} onChange={(e) => set('venueAddress', e.target.value)} placeholder="Area, wilayat" /></label>
              <label className="block sm:col-span-2"><span className="block text-[12.5px] font-bold text-slate-600 mb-1">Google Maps link</span>
                <input className={input} value={f.mapUrl} onChange={(e) => set('mapUrl', e.target.value.trim())} placeholder="https://maps.app.goo.gl/..." inputMode="url" /></label>
              <label className="block"><span className="block text-[12.5px] font-bold text-slate-600 mb-1">Event coordinator name</span>
                <input className={input} value={f.coordinatorName} onChange={(e) => set('coordinatorName', e.target.value)} /></label>
              <label className="block"><span className="block text-[12.5px] font-bold text-slate-600 mb-1">Coordinator phone</span>
                <input className={input} value={f.coordinatorPhone} onChange={(e) => set('coordinatorPhone', e.target.value)} placeholder="+968 9..." inputMode="tel" /></label>
            </div>
          </section>

          <section className={`${card} p-5 sm:p-6`}>
            <h3 className="flex items-center gap-2 text-[16px] font-bold"><Wallet className="w-5 h-5 text-slate-500" />Sponsorship amount and split</h3>
            <p className="text-[13px] text-slate-500 mt-0.5">Equal shares by default. Change any share (e.g. 30%); they must add up to 100%.</p>
            <div className="mt-4 grid sm:grid-cols-[200px_1fr] gap-3 items-end">
              <label className="block"><span className="block text-[12.5px] font-bold text-slate-600 mb-1">Total amount (OMR)</span>
                <input className={`${input} tabular-nums`} inputMode="decimal" value={f.totalAmount} onChange={(e) => set('totalAmount', e.target.value.replace(/[^\d.]/g, ''))} placeholder="100.000" /></label>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                <button type="button" onClick={splitEqually} className={`${btn} bg-white border border-slate-200`}><Split className="w-4 h-4" /> Split equally</button>
                <button type="button" onClick={addBrand} className={`${btn} bg-white border border-slate-200`}><Plus className="w-4 h-4" /> Add partner brand</button>
              </div>
            </div>
            <ul className="mt-3 space-y-2">
              {f.parties.map((p, i) => (
                <li key={i} className="grid grid-cols-[1fr_92px_auto] sm:grid-cols-[1fr_110px_130px_auto] gap-2 items-center p-2.5 rounded-2xl bg-slate-50">
                  <input className={input} value={p.company} onChange={(e) => setParty(i, 'company', e.target.value)} placeholder={p.kind === 'monipack' ? 'Monipack' : 'Partner brand company name'} aria-label="Company" />
                  <label className="relative"><input className={`${input} pr-7 text-right tabular-nums`} inputMode="decimal" value={p.sharePct} onChange={(e) => setParty(i, 'sharePct', e.target.value.replace(/[^\d.]/g, ''))} aria-label="Share %" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">%</span></label>
                  <span className="hidden sm:block text-right font-bold tabular-nums text-[14px]">{omr(amounts[i])}</span>
                  {p.kind === 'monipack'
                    ? <span className="w-10 text-center text-[11px] font-bold text-slate-500">Us</span>
                    : <button type="button" aria-label="Remove brand" onClick={() => set('parties', f.parties.filter((_, j) => j !== i))} className="w-10 h-10 grid place-items-center rounded-xl text-rose-600 hover:bg-rose-50"><Trash2 className="w-4 h-4" /></button>}
                  <span className="sm:hidden col-span-3 -mt-1 text-[12.5px] text-slate-600">= {omr(amounts[i])}</span>
                </li>
              ))}
            </ul>
            <p className={`mt-2 text-[13px] font-semibold ${Math.abs(sum - 100) > 0.01 ? 'text-rose-700' : 'text-emerald-700'}`}>Shares total {Math.round(sum * 1000) / 1000}%{Math.abs(sum - 100) > 0.01 ? ': must be 100%' : ' ✓'}</p>
          </section>

          <section className={`${card} p-5 sm:p-6`}>
            <h3 className="flex items-center gap-2 text-[16px] font-bold"><Package className="w-5 h-5 text-slate-500" />Marketing materials</h3>
            <p className="text-[13px] text-slate-500 mt-0.5">Roll-up, video screening, kiosk, counter, anything.</p>
            <datalist id="sp-mats">{(meta?.materials || []).map((m) => <option key={m} value={m} />)}</datalist>
            <ul className="mt-3 space-y-2">
              {f.materials.map((m, i) => (
                <li key={i} className="grid grid-cols-[1fr_76px_auto] sm:grid-cols-[1.2fr_80px_1fr_1fr_auto] gap-2 items-center p-2.5 rounded-2xl bg-slate-50">
                  <input className={input} list="sp-mats" value={m.name} onChange={(e) => setMat(i, 'name', e.target.value)} placeholder="Item" aria-label="Item" />
                  <input className={`${input} text-right`} inputMode="numeric" value={m.qty} onChange={(e) => setMat(i, 'qty', e.target.value.replace(/\D/g, ''))} aria-label="Quantity" />
                  <input className={`${input} col-span-3 sm:col-span-1 order-last sm:order-none`} value={m.providedBy} onChange={(e) => setMat(i, 'providedBy', e.target.value)} placeholder="Provided by" aria-label="Provided by" />
                  <input className={`${input} col-span-3 sm:col-span-1 order-last sm:order-none`} value={m.note} onChange={(e) => setMat(i, 'note', e.target.value)} placeholder="Note (size, place…)" aria-label="Note" />
                  <button type="button" aria-label="Remove item" onClick={() => set('materials', f.materials.filter((_, j) => j !== i))} className="w-10 h-10 grid place-items-center rounded-xl text-rose-600 hover:bg-rose-50"><Trash2 className="w-4 h-4" /></button>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => set('materials', [...f.materials, { name: '', qty: 1, providedBy: '', note: '' }])} className={`${btn} mt-3 bg-white border border-slate-200`}><Plus className="w-4 h-4" /> Add item</button>
            <label className="block mt-5"><span className="flex items-center gap-1.5 text-[12.5px] font-bold text-slate-600 mb-1"><Megaphone className="w-4 h-4" /> How the brands will be promoted</span>
              <textarea rows={4} className={`${input} h-auto py-3`} value={f.promotion} onChange={(e) => set('promotion', e.target.value)} placeholder="e.g. Both brands' roll-ups at the main entrance, a 30-second video every 15 minutes on the stage screen, brand names announced at the opening, and posts on the organiser's Instagram." /></label>
          </section>

          <section className={`${card} p-5 sm:p-6`}>
            <h3 className="flex items-center gap-2 text-[16px] font-bold"><ScrollText className="w-5 h-5 text-slate-500" />Terms and conditions</h3>
            <p className="text-[13px] text-slate-500 mt-0.5">Blank line between clauses. Start a clause with its number ("3. Payment. …"). A line starting with "# " is a heading.</p>
            <textarea rows={18} className={`${input} h-auto py-3 mt-3 font-mono text-[13px] leading-relaxed`} value={f.terms} onChange={(e) => set('terms', e.target.value)} />
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => set('terms', meta?.defaultTerms || '')} className={`${btn} bg-white border border-slate-200`}><RotateCcw className="w-4 h-4" /> Use my default</button>
              <button type="button" onClick={() => set('terms', meta?.builtInTerms || '')} className={`${btn} bg-white border border-slate-200`}><RotateCcw className="w-4 h-4" /> Use the original draft</button>
              <button type="button" onClick={saveDefaultTerms} className={`${btn} bg-white border border-slate-200`}><Save className="w-4 h-4" /> Save as my default</button>
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className={`${card} p-5`}>
            <h3 className="text-[15px] font-bold">Event image</h3>
            <p className="text-[12.5px] text-slate-500">Shown on the right of the approval page.</p>
            {posterShown ? <img src={posterShown} alt="" className="mt-3 w-full rounded-2xl border border-slate-200 max-h-[360px] object-contain bg-slate-50" />
              : <div className="mt-3 h-40 rounded-2xl border-2 border-dashed border-slate-300 grid place-items-center text-slate-400"><ImageIcon className="w-8 h-8" /></div>}
            <div className="mt-3 flex gap-2">
              <label className={`${btn} bg-slate-900 text-white cursor-pointer flex-1`}><Upload className="w-4 h-4" /> {posterShown ? 'Change' : 'Upload'}<input type="file" accept="image/*" className="sr-only" onChange={(e) => pick(e, 'poster')} /></label>
              {posterShown && <button type="button" onClick={() => removeImage('poster')} className={`${btn} bg-white border border-slate-200`} aria-label="Remove event image"><Trash2 className="w-4 h-4" /></button>}
            </div>
          </section>
          <section className={`${card} p-5`}>
            <h3 className="text-[15px] font-bold">Header banner (advert strip)</h3>
            <p className="text-[12.5px] text-slate-500">Wide image across the top of the link page, e.g. 1600 × 400.</p>
            {bannerShown ? <img src={bannerShown} alt="" className="mt-3 w-full rounded-xl border border-slate-200 aspect-[4/1] object-cover" />
              : <div className="mt-3 aspect-[4/1] rounded-xl border-2 border-dashed border-slate-300 grid place-items-center text-slate-400"><ImageIcon className="w-6 h-6" /></div>}
            <div className="mt-3 flex gap-2">
              <label className={`${btn} bg-slate-900 text-white cursor-pointer flex-1`}><Upload className="w-4 h-4" /> {bannerShown ? 'Change' : 'Upload'}<input type="file" accept="image/*" className="sr-only" onChange={(e) => pick(e, 'banner')} /></label>
              {bannerShown && <button type="button" onClick={() => removeImage('banner')} className={`${btn} bg-white border border-slate-200`} aria-label="Remove banner"><Trash2 className="w-4 h-4" /></button>}
            </div>
          </section>
        </aside>
      </div>
      <div className="flex justify-end">
        <button type="button" onClick={save} disabled={busy} className={`${btn} bg-[#CC1A22] text-white min-w-[160px]`}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- link maker + PIN dialog
function PinDialog({ info, onClose, showToast }) {
  const url = `${window.location.origin}${info.path}`;
  const first = String(info.personName || '').split(' ')[0];
  const copy = async (t, what) => { try { await navigator.clipboard.writeText(t); showToast(`${what} copied`); } catch { showToast('Could not copy', 'error'); } };
  const phone = String(info.phone || '').replace(/\D/g, '');
  const wa = (text) => `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  const linkText = `Dear ${first}, please review and approve the Monipack sponsorship confirmation for "${info.title}":\n${url}\n\nThe PIN to open it is sent in a separate message.`;
  const pinText = `Your PIN for the Monipack sponsorship confirmation: ${info.pin}`;
  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/55 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Link and PIN">
      <div className="bg-white rounded-[28px] p-6 w-full max-w-md">
        <div className="flex items-start justify-between gap-3">
          <div><h3 className="text-[19px] font-extrabold">Link ready for {info.personName}</h3><p className="text-[13.5px] text-slate-500">{info.designation}</p></div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-10 h-10 grid place-items-center rounded-xl hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="mt-4 p-3 rounded-2xl bg-slate-50 text-[13px] break-all font-mono">{url}</div>
        <div className="mt-3 p-4 rounded-2xl bg-slate-900 text-white text-center">
          <span className="block text-[12px] text-slate-300 font-semibold">PIN (shown only now)</span>
          <span className="block text-[34px] font-extrabold tracking-[0.3em] tabular-nums select-all">{info.pin}</span>
        </div>
        <p className="mt-3 text-[13px] text-slate-600">Send the link and the PIN in <b>two separate messages</b>, or tell the PIN by phone. If it is lost, make a new PIN any time.</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" className={`${btn} bg-white border border-slate-200`} onClick={() => copy(url, 'Link')}><Copy className="w-4 h-4" /> Copy link</button>
          <button type="button" className={`${btn} bg-white border border-slate-200`} onClick={() => copy(info.pin, 'PIN')}><Copy className="w-4 h-4" /> Copy PIN</button>
          {phone && <a className={`${btn} bg-emerald-600 text-white`} href={wa(linkText)} target="_blank" rel="noopener noreferrer"><MessageCircle className="w-4 h-4" /> Send link</a>}
          {phone && <a className={`${btn} bg-emerald-700 text-white`} href={wa(pinText)} target="_blank" rel="noopener noreferrer"><MessageCircle className="w-4 h-4" /> Send PIN</a>}
        </div>
      </div>
    </div>
  );
}

function LinkMaker({ role, party, ev, authFetch, showToast, onMade, disabled, disabledText }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ personName: '', designation: role === 'md' ? 'Managing Director' : '', phone: '' });
  const [busy, setBusy] = useState(false);
  const make = async () => {
    setBusy(true);
    const r = await authFetch(`/api/sponsorships/${ev.id}/links`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role, partyId: party?.id, ...v }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { showToast(d.error || 'Could not make the link', 'error'); return; }
    setOpen(false);
    onMade(d.event, { ...v, pin: d.pin, path: d.path, title: ev.title });
  };
  if (disabled) return <p className="text-[13px] text-slate-500 flex items-center gap-1.5"><Lock className="w-4 h-4" /> {disabledText}</p>;
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={`${btn} bg-slate-900 text-white`}><Link2 className="w-4 h-4" /> Make {role === 'md' ? "the MD's" : 'their'} link</button>;
  return (
    <div className="grid sm:grid-cols-3 gap-2 p-3 rounded-2xl bg-slate-50">
      <input className={input} placeholder="Full name" value={v.personName} onChange={(e) => setV({ ...v, personName: e.target.value })} aria-label="Full name" />
      <input className={input} placeholder="Designation" value={v.designation} onChange={(e) => setV({ ...v, designation: e.target.value })} aria-label="Designation" />
      <input className={input} placeholder="WhatsApp (optional)" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} inputMode="tel" aria-label="WhatsApp number" />
      <div className="sm:col-span-3 flex gap-2 justify-end">
        <button type="button" onClick={() => setOpen(false)} className={`${btn} bg-white border border-slate-200`}>Cancel</button>
        <button type="button" onClick={make} disabled={busy || v.personName.trim().length < 2 || v.designation.trim().length < 2} className={`${btn} bg-[#2F5BEA] text-white`}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />} Make link + PIN</button>
      </div>
    </div>
  );
}

function LinkRow({ l, ev, authFetch, showToast, onChanged, onPin }) {
  const url = `${window.location.origin}${l.path}`;
  const latest = [...(ev.decisions || [])].reverse().find((d) => d.linkId === l.id && d.version === ev.version);
  const st = l.status === 'approved' ? ['Approved', 'text-emerald-700 bg-emerald-50', CheckCircle2] : l.status === 'changes_requested' ? ['Asked for changes', 'text-amber-800 bg-amber-50', MessageSquareWarning] : [l.openedAt ? 'Opened, not decided' : 'Not opened yet', 'text-slate-600 bg-slate-100', Clock3];
  const Icon = st[2];
  const newPin = async () => {
    const r = await authFetch(`/api/sponsorship-links/${l.id}/pin`, { method: 'POST' });
    const d = await r.json().catch(() => ({}));
    if (r.ok) onPin({ ...l, pin: d.pin, title: ev.title }); else showToast(d.error || 'Could not make a PIN', 'error');
  };
  const revoke = async () => {
    if (!window.confirm(`Remove ${l.personName}'s link? It will stop working. Their earlier responses stay on record.`)) return;
    const r = await authFetch(`/api/sponsorship-links/${l.id}/revoke`, { method: 'POST' });
    const d = await r.json().catch(() => ({}));
    if (r.ok) { onChanged(d); showToast('Link removed.'); } else showToast(d.error || 'Could not remove', 'error');
  };
  const locked = ev.status === 'approved' || ev.status === 'cancelled';
  return (
    <div className="p-3.5 rounded-2xl border border-slate-200">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="flex-1 min-w-[160px]"><b className="block text-[15px]">{l.personName}</b><span className="text-[12.5px] text-slate-500">{l.designation}{l.phone ? ` · ${l.phone}` : ''}</span></span>
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-bold ${st[1]}`}><Icon className="w-3.5 h-3.5" />{st[0]}</span>
      </div>
      {latest?.comment && <p className="mt-2 p-2.5 rounded-xl bg-amber-50 text-amber-900 text-[13.5px]">“{latest.comment}”</p>}
      {l.lockedUntil && <p className="mt-2 text-[12.5px] font-semibold text-rose-700">Locked after wrong PINs until {fmtDateTime(l.lockedUntil)}. Make a new PIN to unlock now.</p>}
      {!locked && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button type="button" className={`${btn} bg-white border border-slate-200`} onClick={async () => { try { await navigator.clipboard.writeText(url); showToast('Link copied'); } catch { showToast(url); } }}><Copy className="w-4 h-4" /> Copy link</button>
          <a className={`${btn} bg-white border border-slate-200`} href={url} target="_blank" rel="noopener noreferrer"><Eye className="w-4 h-4" /> Open</a>
          <button type="button" className={`${btn} bg-white border border-slate-200`} onClick={newPin}><KeyRound className="w-4 h-4" /> New PIN</button>
          <button type="button" className={`${btn} bg-white border border-rose-200 text-rose-700`} onClick={revoke}><Ban className="w-4 h-4" /> Remove</button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- certificate
const deviceOf = (ua = '') => {
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iPhone/iPad' : /Windows/i.test(ua) ? 'Windows' : /Mac OS/i.test(ua) ? 'Mac' : 'Other';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${br} on ${os}`;
};
function printCertificate(ev) {
  const live = ev.links.filter((l) => !l.revokedAt || l.status === 'approved');
  const approvals = live.map((l) => {
    const d = [...ev.decisions].reverse().find((x) => x.linkId === l.id && x.version === ev.version);
    const company = l.role === 'md' ? (ev.parties.find((p) => p.kind === 'monipack')?.company || 'Monipack') : (ev.parties.find((p) => p.id === l.partyId)?.company || '');
    return { name: l.personName, designation: l.designation, company, decision: d?.decision || 'pending', at: d?.createdAt, typedName: d?.typedName, signature: d?.signature, ip: d?.ip, device: d ? deviceOf(d.userAgent) : '', version: d?.version };
  });
  return printSponsorship(ev, approvals, { kind: 'certificate' });
}

// ---------------------------------------------------------------- detail
function Detail({ id, authFetch, showToast, onBack, onEdit, onOpen }) {
  const [ev, setEv] = useState(null);
  const [pin, setPin] = useState(null);
  const [preview, setPreview] = useState(false);
  const load = useCallback(async () => {
    const r = await authFetch(`/api/sponsorships/${id}`);
    const d = await r.json().catch(() => ({}));
    if (r.ok) setEv(d); else { showToast(d.error || 'Could not load', 'error'); onBack(); }
  }, [id, authFetch, showToast, onBack]);
  useEffect(() => { load(); }, [load]);
  if (!ev) return <div className="py-20 grid place-items-center"><Loader2 className="w-7 h-7 animate-spin text-slate-400" /></div>;

  const live = ev.links.filter((l) => !l.revokedAt);
  const md = live.find((l) => l.role === 'md');
  const mdApproved = md?.status === 'approved';
  const brands = ev.parties.filter((p) => p.kind === 'brand');
  const locked = ev.status === 'approved' || ev.status === 'cancelled';
  const cancel = async () => {
    const note = window.prompt('Cancel this event? Links stop working (approvals stay on record). Reason (optional):', '');
    if (note === null) return;
    const r = await authFetch(`/api/sponsorships/${ev.id}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note }) });
    const d = await r.json().catch(() => ({}));
    if (r.ok) { setEv(d); showToast('Event cancelled.'); } else showToast(d.error || 'Could not cancel', 'error');
  };
  const remove = async () => {
    if (!window.confirm('Delete this draft? This cannot be undone.')) return;
    const r = await authFetch(`/api/sponsorships/${ev.id}`, { method: 'DELETE' });
    const d = await r.json().catch(() => ({}));
    if (r.ok) { showToast('Draft deleted.'); onBack(true); } else showToast(d.error || 'Could not delete', 'error');
  };
  const duplicate = async () => {
    const r = await authFetch(`/api/sponsorships/${ev.id}/duplicate`, { method: 'POST' });
    const d = await r.json().catch(() => ({}));
    if (r.ok) { showToast('Copy made. Change the name, date and brands, then make the links.'); onOpen(d.id); } else showToast(d.error || 'Could not copy', 'error');
  };
  const steps = [
    ['Prepared', true],
    ['MD approval', mdApproved],
    [brands.length > 1 ? 'Brand approvals' : 'Brand approval', ev.status === 'approved'],
    ['Locked', ev.status === 'approved'],
  ];
  const hasAnyDecision = ev.decisions.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => onBack()} className={`${btn} bg-white border border-slate-200`}><ArrowLeft className="w-4 h-4" /> All events</button>
        <div className="mr-auto min-w-0"><h2 className="text-[20px] font-extrabold truncate">{ev.title}</h2><p className="text-[13px] text-slate-500">Version {ev.version} · {omr(ev.totalAmount, ev.currency)}</p></div>
        <Chip s={ev.status} />
      </div>
      <div className="flex flex-wrap gap-2">
        {!locked && <button type="button" onClick={() => onEdit(ev)} className={`${btn} bg-slate-900 text-white`}><Pencil className="w-4 h-4" /> Edit details</button>}
        <button type="button" onClick={() => setPreview((v) => !v)} className={`${btn} bg-white border border-slate-200`}><Eye className="w-4 h-4" /> {preview ? 'Hide preview' : 'Preview what they see'}</button>
        {hasAnyDecision && <button type="button" onClick={() => { if (!printCertificate(ev)) showToast('Allow pop-ups to print', 'error'); }} className={`${btn} bg-white border border-slate-200`}><Printer className="w-4 h-4" /> Approval certificate (PDF)</button>}
        {ev.status !== 'cancelled' && ev.status !== 'approved' && <button type="button" onClick={cancel} className={`${btn} bg-white border border-rose-200 text-rose-700`}><Ban className="w-4 h-4" /> Cancel event</button>}
        <button type="button" onClick={duplicate} className={`${btn} bg-white border border-slate-200`}><Copy className="w-4 h-4" /> Make a copy</button>
        {!hasAnyDecision && <button type="button" onClick={remove} className={`${btn} bg-white border border-rose-200 text-rose-700`}><Trash2 className="w-4 h-4" /> Delete draft</button>}
      </div>

      <ol className={`${card} p-4 grid grid-cols-4 gap-2`} aria-label="Progress">
        {steps.map(([l, done], i) => (
          <li key={l} className="flex flex-col items-center text-center gap-1.5">
            <span className={`w-9 h-9 rounded-full grid place-items-center text-[13px] font-extrabold ${done ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{done ? <CheckCircle2 className="w-5 h-5" /> : i + 1}</span>
            <span className="text-[12px] font-semibold text-slate-700 leading-tight">{l}</span>
          </li>
        ))}
      </ol>

      {preview && <div className="p-3 sm:p-4 rounded-3xl bg-slate-100"><SponsorDocument doc={ev} /></div>}

      <div className="grid lg:grid-cols-2 gap-4">
        <section className={`${card} p-5 space-y-3`}>
          <h3 className="text-[16px] font-bold">1. Monipack Managing Director</h3>
          {md ? <LinkRow l={md} ev={ev} authFetch={authFetch} showToast={showToast} onChanged={setEv} onPin={setPin} />
            : <LinkMaker role="md" ev={ev} authFetch={authFetch} showToast={showToast} onMade={(e, info) => { setEv(e); setPin(info); }} disabled={locked} disabledText="This event is closed." />}
        </section>
        <section className={`${card} p-5 space-y-3`}>
          <h3 className="text-[16px] font-bold">2. Partner brand{brands.length > 1 ? 's' : ''}</h3>
          {!brands.length && <p className="text-[13.5px] text-slate-500">No partner brand on this event. Add one in Edit details.</p>}
          {brands.map((p) => {
            const l = live.find((x) => x.partyId === p.id);
            return (
              <div key={p.id} className="space-y-2">
                <p className="text-[13.5px] font-bold text-slate-700">{p.company} · {p.sharePct}% · {omr(p.amount, ev.currency)}</p>
                {l ? <LinkRow l={l} ev={ev} authFetch={authFetch} showToast={showToast} onChanged={setEv} onPin={setPin} />
                  : <LinkMaker role="brand" party={p} ev={ev} authFetch={authFetch} showToast={showToast} onMade={(e, info) => { setEv(e); setPin(info); }}
                      disabled={!mdApproved || locked} disabledText={locked ? 'This event is closed.' : 'Opens after the Managing Director approves.'} />}
              </div>
            );
          })}
        </section>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <section className={`${card} p-5`}>
          <h3 className="text-[16px] font-bold">Signatures and responses</h3>
          {!ev.decisions.length && <p className="mt-2 text-[13.5px] text-slate-500">Nobody has responded yet.</p>}
          <ul className="mt-2 space-y-2">
            {[...ev.decisions].reverse().map((d) => {
              const l = ev.links.find((x) => x.id === d.linkId) || {};
              return (
                <li key={d.id} className={`p-3 rounded-2xl border ${d.version === ev.version ? 'border-slate-200' : 'border-dashed border-slate-200 opacity-70'}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="text-[14px]">{l.personName}</b><span className="text-[12.5px] text-slate-500">{l.designation}</span>
                    <span className={`ml-auto text-[12px] font-bold ${d.decision === 'approved' ? 'text-emerald-700' : 'text-amber-800'}`}>{d.decision === 'approved' ? 'Approved' : 'Asked for changes'} · v{d.version}</span>
                  </div>
                  {d.signature && <div className="mt-2 flex items-center gap-3"><img src={d.signature} alt={`Signature of ${d.typedName}`} className="h-14 w-40 object-contain bg-white border border-slate-200 rounded-lg" /><span className="text-[13px]">Typed name: <b>{d.typedName}</b></span></div>}
                  {d.comment && <p className="mt-2 text-[13.5px] text-amber-900">“{d.comment}”</p>}
                  <p className="mt-1.5 text-[11.5px] text-slate-500">{fmtDateTime(d.createdAt)} · IP {d.ip}</p>
                </li>
              );
            })}
          </ul>
        </section>
        <section className={`${card} p-5`}>
          <h3 className="text-[16px] font-bold">Timeline</h3>
          <ul className="mt-2 space-y-2.5">
            {ev.activity.map((a, i) => (
              <li key={i} className="flex gap-3 text-[13.5px]"><span className="w-2 h-2 rounded-full bg-slate-300 mt-1.5 shrink-0" />
                <span><b>{a.actor}</b> {a.action.charAt(0).toLowerCase() + a.action.slice(1)}<span className="block text-[11.5px] text-slate-500">{fmtDateTime(a.at)}</span></span></li>
            ))}
          </ul>
        </section>
      </div>
      {pin && <PinDialog info={pin} onClose={() => setPin(null)} showToast={showToast} />}
    </div>
  );
}

// ---------------------------------------------------------------- page
export default function Sponsorships({ authFetch, showToast }) {
  const [list, setList] = useState(null);
  const [meta, setMeta] = useState(null);
  const [view, setView] = useState({ mode: 'list' });
  const load = useCallback(async () => {
    const [a, b] = await Promise.all([authFetch('/api/sponsorships'), authFetch('/api/sponsorships/meta')]);
    if (a.ok) setList(await a.json()); else setList([]);
    if (b.ok) setMeta(await b.json());
  }, [authFetch]);
  useEffect(() => { load(); }, [load]);
  const startNew = useCallback(() => setView({ mode: 'edit', initial: blank(meta?.defaultTerms || '') }), [meta]);
  useAddButton('sponsorships', startNew);

  if (view.mode === 'edit') {
    return <Editor initial={view.initial} meta={meta} authFetch={authFetch} showToast={showToast}
      onCancel={() => setView(view.initial.id ? { mode: 'detail', id: view.initial.id } : { mode: 'list' })}
      onSaved={(d) => { load(); setView({ mode: 'detail', id: d.id }); }} />;
  }
  if (view.mode === 'detail') {
    return <Detail key={view.id} id={view.id} authFetch={authFetch} showToast={showToast} onOpen={(nid) => { load(); setView({ mode: 'detail', id: nid }); }}
      onBack={() => { load(); setView({ mode: 'list' }); }}
      onEdit={(ev) => setView({ mode: 'edit', initial: { ...ev, materials: ev.materials.map(({ id: _i, ...m }) => m) } })} />;
  }

  const counts = (list || []).reduce((m, e) => ({ ...m, [e.status]: (m[e.status] || 0) + 1 }), {});
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h2 className="text-[22px] font-extrabold">Sponsorships</h2>
          <p className="text-[13.5px] text-slate-500">Events Monipack co-sponsors with partner brands. MD approves first, then each brand.</p>
        </div>
        <span className="hidden lg:contents"><button type="button" onClick={startNew} disabled={!meta} className={`${btn} bg-[#CC1A22] text-white`}><Plus className="w-4 h-4" /> New event</button></span>
      </div>
      {list && list.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(STATUS).filter(([k]) => counts[k]).map(([k, [l, c]]) => <span key={k} className={`px-3 py-1.5 rounded-full text-[12.5px] font-bold ${c}`}>{l}: {counts[k]}</span>)}
        </div>
      )}
      {!list ? <div className="py-20 grid place-items-center"><Loader2 className="w-7 h-7 animate-spin text-slate-400" /></div>
        : !list.length ? (
          <div className={`${card} p-10 text-center`}>
            <Megaphone className="w-10 h-10 mx-auto text-slate-300" />
            <p className="mt-3 text-[16px] font-bold">No sponsorship events yet</p>
            <p className="text-[14px] text-slate-500">Add the event, its poster, the money split and the materials. Then send the MD his link.</p>
            <button type="button" onClick={startNew} disabled={!meta} className={`${btn} mt-4 bg-[#CC1A22] text-white`}><Plus className="w-4 h-4" /> New event</button>
          </div>
        ) : (
          <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {list.map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => setView({ mode: 'detail', id: e.id })} className={`${card} w-full text-left overflow-hidden hover:shadow-md transition`}>
                  {e.posterUrl ? <img src={getApiUrl(e.posterUrl)} alt="" className="w-full h-40 object-cover bg-slate-100" /> : <div className="h-40 bg-slate-100 grid place-items-center text-slate-300"><ImageIcon className="w-10 h-10" /></div>}
                  <div className="p-4">
                    <div className="flex items-start gap-2"><b className="flex-1 text-[15.5px] leading-snug">{e.title}</b><Chip s={e.status} /></div>
                    <p className="mt-1 text-[13px] text-slate-500">{[e.startsAt && fmtDate(e.startsAt), e.venue].filter(Boolean).join(' · ') || 'Date and place to be added'}</p>
                    <p className="mt-2 text-[13.5px]"><b className="tabular-nums">{omr(e.totalAmount, e.currency)}</b> · {e.parties.map((p) => `${p.kind === 'monipack' ? 'Monipack' : p.company} ${p.sharePct}%`).join(' / ')}</p>
                    {e.links.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {e.links.map((l, i) => (
                          <span key={i} className={`text-[11.5px] font-bold px-2 py-0.5 rounded-full ${l.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : l.status === 'changes_requested' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
                            {l.role === 'md' ? 'MD' : l.name}: {l.status === 'approved' ? '✓' : l.status === 'changes_requested' ? 'changes' : 'waiting'}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
