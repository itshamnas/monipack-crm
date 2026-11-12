import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Users, Link2, Copy, RefreshCw, MessageCircle, Power, KeyRound, Upload, Download, Search, CheckCircle2,
  AlertTriangle, FileText, SlidersHorizontal, Printer, ArrowRightLeft, Plus, X, Eye, EyeOff, Archive, Loader2, Lock, Unlock, Trash2, Check, CheckSquare, ChevronRight,
} from 'lucide-react';
import CustomerFieldInput, { asList, fieldApplies } from '../components/customers/CustomerFieldInput.jsx';
import SlidingTabs from '../components/ui/SlidingTabs.jsx';
import Sheet from '../components/ui/Sheet.jsx';
import MoreMenu from '../components/ui/MoreMenu.jsx';
import { useAddButton } from '../hooks/useMedia.js';
import Avatar from '../components/ui/Avatar.jsx';
import PhotoPicker from '../components/ui/PhotoPicker.jsx';
import BranchTypeBadge from '../components/ui/BranchTypeBadge.jsx';
import { sendPhoto } from '../utils/photo.js';
import { FILE_LABEL_NAMES, prepareUpload } from '../utils/fileUpload.js';
import { openPrintable, openPendingWindow, chipsHtml, tableHtml, kvHtml, noteHtml, esc } from '../utils/pdfReport.js';
import { pdfToImages } from '../utils/pdfPages.js';

const STATUS = {
  pending_approval: { label: 'Needs approval', cls: 'bg-blue-50 text-blue-800 border-blue-200' },
  not_started: { label: 'Not started', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  in_progress: { label: 'In progress', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  complete: { label: 'Complete', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  submitted: { label: 'In progress', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
};
const TYPE_LABEL = { branch: 'Branch', route_b2b: 'Route / B2B' };
const STAGE_NAMES = { new: 'New', contacted: 'Assigned', quotation_sent: 'Quote sent', sample_sent: 'Sample / negotiation', won: 'Won', lost: 'Lost' };

const card = 'bg-white rounded-3xl border border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.04)]';
const btn = 'inline-flex items-center justify-center gap-1.5 min-h-[40px] sm:min-h-[36px] px-3 rounded-full text-xs font-bold transition active:scale-[0.97] disabled:opacity-50';
const btnDark = `${btn} bg-slate-900 text-white hover:bg-slate-800`;
const btnRed = `${btn} bg-[#CC1A22] text-white hover:bg-[#A3141B]`;
const btnLight = `${btn} bg-white text-slate-800 border border-slate-200 shadow-[0_1px_2px_rgba(16,24,40,0.05)] hover:bg-slate-50 hover:border-slate-300`;

const slug = (s) => String(s || 'salesman').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'salesman';
const linkUrl = (l) => (l.linkToken ? `${window.location.origin}/c/${slug(l.name)}-${l.linkToken}` : '');
const fmt = (d) => (d ? new Date(d).toLocaleString() : '—');
const TYPE_NAMES = {
  text: 'Text', number: 'Number', phone: 'Phone', email: 'Email', dropdown: 'Dropdown (one choice)', multiselect: 'Multiple choice',
  yesno: 'Yes / No', date: 'Date', textarea: 'Long text', location: 'Map location', governorate: 'Governorate (Oman)',
  city: 'City (wilayat)', document: 'Document upload', photo: 'Photos',
};

function PercentBar({ value, width = 'w-24' }) {
  const v = Math.max(0, Math.min(100, value || 0));
  const color = v === 100 ? 'bg-emerald-500' : v >= 50 ? 'bg-amber-500' : 'bg-[#CC1A22]';
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`${width} h-1.5 rounded-full bg-slate-100 overflow-hidden`} aria-hidden="true">
        <span className={`block h-1.5 rounded-full mp-bar ${color}`} style={{ width: `${v}%` }} />
      </span>
      <span className="text-xs font-bold tabular-nums">{v}%</span>
    </span>
  );
}

function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.not_started;
  return <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${s.cls}`}>{s.label}</span>;
}

async function downloadBlob(authFetch, url, filename) {
  const res = await authFetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Download failed');
  }
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export default function Customers({ authFetch, showToast, canManage, canExport = false, initialFilter, onOpenSettings }) {
  const { tab: initialTab, ...initialListFilter } = initialFilter || {};
  const [importing, setImporting] = useState(initialTab === 'import');
  const [fields, setFields] = useState([]);
  const [salesmen, setSalesmen] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const loadMeta = useCallback(async () => {
    const [f, s] = await Promise.all([authFetch('/api/customer-fields'), authFetch('/api/salesmen')]);
    if (f.ok) setFields(await f.json());
    if (s.ok) setSalesmen((await s.json()).map((x) => ({ id: String(x.id), name: x.name, type: x.type })));
  }, [authFetch]);
  useEffect(() => { loadMeta().catch(() => showToast('Could not load customer data', 'error')); }, [loadMeta]);
  const changed = () => setReloadKey((k) => k + 1);
  const [busy, setBusy] = useState('');

  // ---- Duplicates: find customers that are probably the same business and merge them ----
  const d8 = (m) => String(m || '').replace(/\D/g, '').slice(-8);
  const nn = (n) => String(n || '').toLowerCase().replace(/\b(llc|l\.l\.c|spc|s\.p\.c|co|company|trading|est|establishment)\b/g, '').replace(/[^a-z0-9\u0600-\u06ff]+/g, ' ').trim();
  const matchWhy = (a, c) => {
    const why = [];
    if (d8(a.mobile).length === 8 && d8(a.mobile) === d8(c.mobile)) why.push('same mobile');
    if (a.crNumber && a.crNumber !== 'NO CR' && a.crNumber.toLowerCase() === String(c.crNumber || '').toLowerCase()) why.push('same CR');
    if (nn(a.name).length >= 4 && nn(a.name) === nn(c.name)) why.push('same name');
    return why;
  };
  const [dupMerge, setDupMerge] = useState({}); // `${group}:${id}` -> true/false (default: direct match with the kept one)
  const isMerging = (i, g, c) => { const k = `${i}:${c.id}`; if (dupMerge[k] !== undefined) return dupMerge[k]; const keep = g.customers.find((x) => x.id === (dupKeep[i] || g.customers[0].id)); return c.id !== keep.id && matchWhy(keep, c).includes('same name'); };
  const [dupOpen, setDupOpen] = useState(false);
  const [dups, setDups] = useState(null);
  const [dupKeep, setDupKeep] = useState({}); // groupIndex -> id to keep
  const [dupBusy, setDupBusy] = useState('');
  const loadDups = async () => {
    setDups(null);
    try {
      const r = await authFetch('/api/customers/duplicates');
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not check for duplicates');
      setDups(d);
      setDupMerge({});
      setDupKeep(Object.fromEntries(d.map((g, i) => {
        const best = [...g.customers].sort((a, b) => g.customers.filter((c) => c !== b && matchWhy(b, c).length).length - g.customers.filter((c) => c !== a && matchWhy(a, c).length).length)[0];
        return [i, best.id];
      })));
    } catch (e) { showToast(e.message, 'error'); setDups([]); }
  };
  const toggleDups = () => { setDupOpen((v) => !v); if (!dupOpen) loadDups(); };
  const mergeGroup = async (g, i) => {
    const keepId = dupKeep[i] || g.customers[0].id;
    const keep = g.customers.find((c) => c.id === keepId);
    const others = g.customers.filter((c) => c.id !== keepId && isMerging(i, g, c));
    if (!others.length) { showToast('Tick at least one customer to merge', 'error'); return; }
    if (!window.confirm(`Merge ${others.map((c) => `"${c.name}"`).join(', ')} into "${keep.name}"?\n\nTheir enquiries and documents move to "${keep.name}", empty details are filled in, and the others are removed. This cannot be undone.`)) return;
    setDupBusy(String(i));
    try {
      const r = await authFetch('/api/customers/merge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keepId, mergeIds: others.map((c) => c.id) }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not merge');
      showToast(`Merged into ${keep.name}: ${d.moved.enquiries} enquiries, ${d.moved.documents} documents moved`);
      changed();
      await loadDups();
    } catch (e) { showToast(e.message, 'error'); }
    setDupBusy('');
  };

  // ---- Download centre: pick any sections, get Excel or PDF (watermarked) ----
  const [dlOpen, setDlOpen] = useState(false);
  const [sections, setSections] = useState([]); // [{ id, name, count }]
  const [picked, setPicked] = useState(() => new Set());
  const [pdfDetail, setPdfDetail] = useState(true);
  const openDownloads = async () => {
    setDlOpen((v) => !v);
    if (sections.length) return;
    try {
      const res = await authFetch('/api/data-centre?list=1');
      if (!res.ok) throw new Error('Could not list the sections');
      const list = await res.json();
      setSections(list);
      setPicked(new Set(list.map((x) => x.id)));
    } catch (e) { showToast(e.message, 'error'); }
  };
  const onlyQuery = () => (picked.size && picked.size !== sections.length ? `only=${[...picked].join(',')}` : '');
  const today = new Date().toISOString().slice(0, 10);

  const downloadExcel = async () => {
    setBusy('excel');
    try {
      const q = onlyQuery();
      const tag = picked.size === sections.length || !sections.length ? 'everything' : [...picked].join('_');
      await downloadBlob(authFetch, `/api/data-centre.xlsx${q ? `?${q}` : ''}`, `monipack_data_centre_${tag}_${today}.xlsx`);
    } catch (e) { showToast(e.message, 'error'); }
    setBusy('');
  };

  // PDF: every chosen section. Narrow sections as tables; wide ones (e.g. customers) as one detail block per record.
  const downloadPdf = async () => {
    const win = openPendingWindow();
    if (!win) { showToast('Allow pop-ups to download the PDF', 'error'); return; }
    setBusy('pdf');
    try {
      const q = onlyQuery();
      const res = await authFetch(`/api/data-centre${q ? `?${q}` : ''}`);
      if (!res.ok) throw new Error('Could not prepare the report');
      const sheets = await res.json();
      const fmt = (col, v) => {
        if (v === null || v === undefined || v === '') return '';
        if (col?.type === 'percent') return `${Math.round(v * 100)}%`;
        if (col?.type === 'date') { const d = new Date(v); return isNaN(d) ? String(v) : d.toLocaleDateString('en-GB'); }
        if (col?.type === 'number' && /OMR/.test(col.label)) return Number(v).toFixed(3);
        return v;
      };
      const MAX_TABLE_COLS = 9;
      let body = chipsHtml(sheets.map((sh) => [sh.name, sh.rows.length]));
      for (const sh of sheets) {
        body += `<h2>${sh.name} <span style="font-weight:400;color:#64748b">(${sh.rows.length})</span></h2>`;
        if (sh.columns.length <= MAX_TABLE_COLS || !pdfDetail) {
          const cols = sh.columns.slice(0, pdfDetail ? sh.columns.length : MAX_TABLE_COLS);
          body += tableHtml(cols.map((c) => ({ label: c.label, num: ['number', 'percent'].includes(c.type) })), sh.rows.map((r) => cols.map((c, ci) => fmt(c, r[ci]))));
        } else {
          // one detail block per record, showing every filled-in field
          body += sh.rows.map((r) => {
            const pairs = sh.columns.map((c, ci) => [c.label, fmt(c, r[ci])]).filter(([, v]) => v !== '' && v !== null && v !== undefined);
            const title = r[1] || r[0];
            return `<div style="page-break-inside:avoid;margin:10px 0 14px"><h3 style="margin:0 0 4px;font-size:12.5px">${String(title).replace(/[<&>]/g, '')}</h3>${kvHtml(pairs)}</div>`;
          }).join('') || '<p>Nothing to show.</p>';
        }
      }
      openPrintable({
        win,
        docType: 'Data report',
        title: 'Customer Data Centre',
        subtitle: picked.size === sections.length || !sections.length ? 'Everything in the CRM' : sheets.map((sh) => sh.name).join(' · '),
        meta: sheets.slice(0, 3).map((sh) => [sh.name, sh.rows.length]),
        bodyHtml: body,
      });
    } catch (e) { win.close(); showToast(e.message, 'error'); }
    setBusy('');
  };

  return (
    <div className={`p-3 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-4 pb-24 md:pb-8 ${openId ? 'mp-dock-open' : ''}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] leading-tight font-extrabold text-slate-900">Customer Data Centre</h1>
          <p className="hidden sm:block text-sm text-slate-500 mt-0.5">Every customer with their details, documents, enquiries and quotations. Tap a customer to open it.</p>
        </div>
        {canManage && (
          <div className="hidden sm:flex sm:flex-wrap sm:justify-end gap-2">
            {onOpenSettings && (
              <button type="button" className={`${btnLight} shrink-0`} onClick={() => onOpenSettings('settings-links')}><Link2 className="w-4 h-4" /> Salesman links</button>
            )}
            <button type="button" className={`${btnLight} shrink-0 ${dupOpen ? 'ring-2 ring-red-500/20 border-red-300' : ''}`} onClick={toggleDups} aria-expanded={dupOpen}>
              <Users className="w-4 h-4 text-amber-600" /> Duplicates
            </button>
            <button type="button" className={`${btnLight} shrink-0 ${dlOpen ? 'ring-2 ring-red-500/20 border-red-300' : ''}`} onClick={openDownloads} aria-expanded={dlOpen}>
              <Download className="w-4 h-4 text-emerald-600" /> Download data
            </button>
            <button type="button" className={`${btnDark} shrink-0`} onClick={() => setImporting((v) => !v)}><Upload className="w-4 h-4" /> Import list</button>
          </div>
        )}
      </div>

      {canManage && dupOpen && (
        <section className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-5 animate-in fade-in slide-in-from-top-2" aria-label="Duplicate customers">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex-1 min-w-0">
              <h2 className="text-[15px] font-bold">Possible duplicates</h2>
              <p className="text-xs text-slate-500">Customers with the same mobile, CR number or name. Pick the one to keep and tick the ones to merge into it; their enquiries and documents move to it. Only same-name matches are ticked for you.</p>
            </div>
            <button type="button" className={btnLight} onClick={loadDups}>Check again</button>
          </div>
          {!dups ? (
            <p className="mt-4 text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Checking all customers…</p>
          ) : !dups.length ? (
            <p className="mt-4 text-sm text-emerald-700 font-semibold">No duplicates found. Every customer looks unique.</p>
          ) : (
            <ul className="mt-3 space-y-3 mp-stagger">
              {dups.map((g, i) => (
                <li key={g.customers.map((c) => c.id).join('-')} className="rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="px-3 py-2 bg-slate-50 flex flex-wrap items-center gap-2 text-xs">
                    {g.reasons.map((r) => <span key={r} className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold">{r}</span>)}
                    <span className="text-slate-500">{g.customers.length} customers</span>
                    <button type="button" className={`${btnRed} ml-auto`} disabled={dupBusy === String(i)} onClick={() => mergeGroup(g, i)}>
                      {dupBusy === String(i) ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Merge ticked into the kept one
                    </button>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {g.customers.map((c) => (
                      <div key={c.id} className={`flex flex-wrap sm:flex-nowrap items-center gap-3 px-3 py-2.5 ${dupKeep[i] === c.id ? 'bg-emerald-50/60' : isMerging(i, g, c) ? 'bg-red-50/40' : ''}`}>
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 cursor-pointer" title="Keep this customer">
                          <input type="radio" name={`keep-${i}`} className="w-4 h-4" checked={dupKeep[i] === c.id} onChange={() => { setDupKeep((k) => ({ ...k, [i]: c.id })); setDupMerge((m) => Object.fromEntries(Object.entries(m).filter(([k]) => !k.startsWith(`${i}:`)))); }} /> Keep
                        </label>
                        {dupKeep[i] !== c.id && (
                          <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 cursor-pointer" title="Merge this customer into the kept one">
                            <input type="checkbox" className="w-4 h-4" checked={isMerging(i, g, c)} onChange={(e) => setDupMerge((m) => ({ ...m, [`${i}:${c.id}`]: e.target.checked }))} /> Merge
                          </label>
                        )}
                        <span className="flex-1 min-w-[160px]">
                          <b className="text-sm">{c.name}</b>
                          {dupKeep[i] !== c.id && (() => { const keep = g.customers.find((x) => x.id === dupKeep[i]); const why = keep ? matchWhy(keep, c) : []; return why.length
                            ? <span className={`ml-2 text-[11px] font-bold ${why.includes('same name') ? 'text-amber-700' : 'text-rose-600'}`}>{why.join(' · ')}{why.includes('same name') ? '' : ' · different name, check first'}</span>
                            : <span className="ml-2 text-[11px] font-bold text-slate-400">no direct match with the kept one</span>; })()}
                          <span className="block text-[11.5px] text-slate-500">{c.mobile || 'No mobile'} · CR {c.crNumber || '—'} · {c.salesmanName || 'No salesman'}</span>
                        </span>
                        <span className="flex gap-1.5 text-[11px] font-semibold text-slate-600">
                          <span className="px-2 py-0.5 rounded-full bg-slate-100">{c.leadCount} enquiries</span>
                          <span className="px-2 py-0.5 rounded-full bg-slate-100">{c.fileCount} documents</span>
                          <span className="px-2 py-0.5 rounded-full bg-slate-100">{c.filled} details</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {canManage && dlOpen && (
        <section className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-5 animate-in fade-in slide-in-from-top-2" aria-label="Download data">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex-1 min-w-0">
              <h2 className="text-[15px] font-bold">Download data</h2>
              <p className="text-xs text-slate-500">Tick what you need. Excel has one sheet per section; the PDF has every detail. Both carry the <span className="font-monipack lowercase">monipack</span> watermark.</p>
            </div>
            <button type="button" className={btnLight} onClick={() => setPicked(picked.size === sections.length ? new Set() : new Set(sections.map((x) => x.id)))}>
              {picked.size === sections.length ? 'Clear all' : 'Select everything'}
            </button>
          </div>
          {!sections.length ? (
            <p className="mt-4 text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Counting…</p>
          ) : (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mp-stagger">
              {sections.map((sec) => {
                const on = picked.has(sec.id);
                return (
                  <label key={sec.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl border cursor-pointer transition ${on ? 'border-red-300 bg-red-50/60' : 'border-slate-200 hover:border-slate-300'}`}>
                    <input type="checkbox" className="w-4 h-4" checked={on} onChange={() => setPicked((p) => { const n = new Set(p); n.has(sec.id) ? n.delete(sec.id) : n.add(sec.id); return n; })} />
                    <span className="flex-1 text-sm font-semibold">{sec.name}</span>
                    <span className="text-[11.5px] font-bold tabular-nums px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{sec.count.toLocaleString()}</span>
                  </label>
                );
              })}
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" className={btnDark} disabled={!picked.size || busy === 'excel'} onClick={downloadExcel}>
              {busy === 'excel' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Excel ({picked.size})
            </button>
            <button type="button" className={btnRed} disabled={!picked.size || busy === 'pdf'} onClick={downloadPdf}>
              {busy === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} PDF ({picked.size})
            </button>
            <label className="flex items-center gap-2 text-xs text-slate-600 ml-1 cursor-pointer">
              <input type="checkbox" className="w-4 h-4" checked={pdfDetail} onChange={(e) => setPdfDetail(e.target.checked)} />
              PDF with every detail (longer)
            </label>
          </div>
        </section>
      )}

      {importing && canManage && (
        <ImportTab authFetch={authFetch} showToast={showToast} onDone={() => { setImporting(false); changed(); }} />
      )}

      <CustomerList key={reloadKey} authFetch={authFetch} showToast={showToast} canManage={canManage} canExport={canExport} initialFilter={initialListFilter}
        pageActions={canManage ? [
          onOpenSettings && { label: 'Salesman links', icon: Link2, onClick: () => onOpenSettings('settings-links') },
          { label: dupOpen ? 'Hide duplicates' : 'Find duplicates', icon: Users, onClick: toggleDups },
          { label: dlOpen ? 'Hide download data' : 'Download data', icon: Download, onClick: openDownloads },
          { label: importing ? 'Close import' : 'Import a list', icon: Upload, onClick: () => setImporting((v) => !v) },
        ].filter(Boolean) : []}
        salesmen={salesmen} fields={fields} onOpen={setOpenId} onChanged={changed} docked={openId} />

      {openId && (
        <CustomerDetail key={openId} id={openId} authFetch={authFetch} showToast={showToast} canManage={canManage}
          fields={fields} salesmen={salesmen} onClose={() => setOpenId(null)} onChanged={changed} />
      )}
    </div>
  );
}

// ---------------- Pages shown under Settings ----------------

/** Settings → Salesmen & links */
export function SalesmanLinksPage({ authFetch, showToast, canDelete = false }) {
  const [links, setLinks] = useState([]);
  const [summary, setSummary] = useState(null);
  const load = useCallback(async () => {
    const [l, s] = await Promise.all([authFetch('/api/customer-links'), authFetch('/api/customers/summary')]);
    if (l.ok) setLinks(await l.json());
    if (s.ok) setSummary(await s.json());
  }, [authFetch]);
  useEffect(() => { load().catch(() => showToast('Could not load salesmen', 'error')); }, [load]);
  return <LinksTab authFetch={authFetch} showToast={showToast} links={links} summary={summary} onChanged={load} canDelete={canDelete} />;
}

/** Settings → Customer form fields */
export function CustomerFieldsPage({ authFetch, showToast }) {
  const [fields, setFields] = useState([]);
  const load = useCallback(async () => {
    const res = await authFetch('/api/customer-fields');
    if (res.ok) setFields(await res.json());
  }, [authFetch]);
  useEffect(() => { load().catch(() => showToast('Could not load fields', 'error')); }, [load]);
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">These are the details salesmen fill in on their link. Set which are required, hide fields you don't need, and edit the dropdown choices (for example your <strong>routes</strong>).</p>
      <FieldsTab authFetch={authFetch} showToast={showToast} fields={fields} onChanged={load} />
    </div>
  );
}

// ---------------- Customer list ----------------
const STAGE_CHIPS = [
  ['all', 'All'],
  ['pending_approval', 'Needs approval'],
  ['not_started', 'Not started'],
  ['in_progress', 'In progress'],
  ['complete', 'Complete'],
];

function CustomerList({ authFetch, showToast, canManage, canExport = false, initialFilter = {}, salesmen, fields, onOpen, onChanged, pageActions = [], docked = null }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(initialFilter.search || '');
  const [salesmanId, setSalesmanId] = useState(initialFilter.salesmanId || 'all');
  const [stage, setStage] = useState(initialFilter.status === 'pending_approval' ? 'pending_approval' : initialFilter.stage || 'all');
  const [missing, setMissing] = useState(initialFilter.missing || '');
  const [selected, setSelected] = useState([]);
  const [transferTo, setTransferTo] = useState('');
  const [adding, setAdding] = useState(false);
  const [selecting, setSelecting] = useState(false); // phones: tick boxes only in select mode
  const [filterOpen, setFilterOpen] = useState(false);
  const openAdd = useCallback(() => { if (canManage) setAdding(true); }, [canManage]);
  useAddButton('customers', openAdd);
  const fieldLabel = useMemo(() => Object.fromEntries(fields.map((f) => [f.key, f.label])), [fields]);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (salesmanId !== 'all') qs.set('salesmanId', salesmanId);
    if (search.trim()) qs.set('search', search.trim());
    const res = await authFetch(`/api/customers?${qs.toString()}`);
    if (res.ok) setRows(await res.json());
    setLoading(false);
    setSelected([]);
  }, [authFetch, salesmanId, search]);

  useEffect(() => {
    const t = setTimeout(() => load().catch(() => setLoading(false)), 250);
    return () => clearTimeout(t);
  }, [load]);

  const counts = useMemo(() => {
    const c = { all: rows.length, pending_approval: 0, not_started: 0, in_progress: 0, complete: 0 };
    rows.forEach((r) => { c[r.stage] = (c[r.stage] || 0) + 1; });
    return c;
  }, [rows]);

  // "Missing" filter: how many started customers are missing each detail
  const missingCounts = useMemo(() => {
    const m = {};
    rows.filter((r) => r.stage !== 'not_started').forEach((r) => r.missing.forEach((k) => { m[k] = (m[k] || 0) + 1; }));
    return fields.filter((f) => m[f.key]).map((f) => ({ key: f.key, label: f.label, count: m[f.key] }));
  }, [rows, fields]);

  const filterCount = (salesmanId !== 'all' ? 1 : 0) + (missing ? 1 : 0);
  const shown = rows.filter((r) => (stage === 'all' || r.stage === stage) && (!missing || (r.stage !== 'not_started' && r.missing.includes(missing))));

  const transfer = async () => {
    if (!transferTo || !selected.length) return;
    const res = await authFetch('/api/customers/transfer', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: selected, toSalesmanId: transferTo }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) { showToast(`${body.moved} customer(s) transferred.`); load(); onChanged(); } else showToast(body.error || 'Transfer failed', 'error');
  };

  const allChecked = shown.length > 0 && shown.every((r) => selected.includes(r.id));

  const exportPdf = () => {
    const sm = salesmen.find((x) => x.id === salesmanId)?.name;
    const filters = [STAGE_CHIPS.find(([id]) => id === stage)?.[1], sm || (salesmanId === 'unassigned' ? 'No salesman' : 'All salesmen'),
      missing ? `Missing ${fieldLabel[missing] || missing}` : '', search ? `Search “${search}”` : ''].filter(Boolean).join(' · ');
    const ok = openPrintable({
      docType: 'Customer list',
      title: 'Customers',
      subtitle: filters,
      meta: [['Records', shown.length]],
      bodyHtml: chipsHtml(STAGE_CHIPS.map(([id, label]) => [label, counts[id] || 0]))
        + tableHtml(
          [{ label: 'Customer' }, { label: 'Mobile' }, { label: 'CR' }, { label: 'Salesman' }, { label: 'Status' }, { label: '%', num: true }, { label: 'Still missing' }],
          shown.map((c) => [c.name, c.mobile, c.noCr ? 'No CR' : c.crNumber, c.salesmanName || 'No salesman', STATUS[c.stage]?.label || c.stage,
            c.stage === 'not_started' ? '' : `${c.percent}%`, c.stage === 'not_started' ? 'Waiting for salesman' : c.missing.map((k) => fieldLabel[k] || k).join(', ')])
        ),
    });
    if (!ok) showToast('Allow pop-ups to download the PDF', 'error');
  };

  return (
    <div className="space-y-3">
      <div className="hidden sm:block">
        <SlidingTabs ariaLabel="Filter by status" value={stage} onChange={setStage}
          tabs={STAGE_CHIPS.map(([id, label]) => ({ id, label, count: counts[id] || 0, highlight: id === 'pending_approval' }))} />
      </div>
      {/* Phones: search + Filter + ⋯ on one row, statuses in one sideways-scrolling row */}
      <div className="sm:hidden space-y-2.5">
        <div className="mp-ptool">
          <div className="mp-psearch">
            <Search className="w-4 h-4" aria-hidden="true" />
            <label htmlFor="cust-search-p" className="sr-only">Search</label>
            <input id="cust-search-p" type="search" placeholder="Search name, mobile, CR" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <button type="button" className="mp-filter-btn" onClick={() => setFilterOpen(true)} aria-label={`Filters${filterCount ? `, ${filterCount} on` : ''}`}>
            <SlidersHorizontal className="w-4 h-4" /> Filter{filterCount > 0 && <b>{filterCount}</b>}
          </button>
          <MoreMenu label="More customer actions" items={[
            canManage && { label: selecting ? 'Stop selecting' : 'Select customers to move', icon: CheckSquare, onClick: () => { setSelecting((v) => !v); setSelected([]); } },
            canExport && { label: 'PDF of this list', icon: FileText, onClick: exportPdf, hidden: !shown.length },
            ...pageActions,
          ].filter(Boolean)} />
        </div>
        <div className="mp-chiprow" role="radiogroup" aria-label="Filter by status">
          {STAGE_CHIPS.map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={stage === id} onClick={() => setStage(id)} className={`mp-chip ${stage === id ? 'on' : ''}`}>
              {label} <span className={`n ${id === 'pending_approval' && counts[id] && stage !== id ? '!text-amber-700' : ''}`}>{counts[id] || 0}</span>
            </button>
          ))}
        </div>
        {selecting && (
          <p className="text-[13px] text-slate-600 flex items-center justify-between">Tap customers to select them.
            <button type="button" className="font-semibold text-[#2F5BEA] min-h-[44px] px-2" onClick={() => { setSelecting(false); setSelected([]); }}>Done</button></p>
        )}
      </div>
      <Sheet open={filterOpen} onClose={() => setFilterOpen(false)} title="Filter customers"
        footer={<>
          <button type="button" className="mp-btn-ghost" onClick={() => { setSalesmanId('all'); setMissing(''); }}>Clear</button>
          <button type="button" className="mp-btn-wide" onClick={() => setFilterOpen(false)}>Show {shown.length} customer{shown.length === 1 ? '' : 's'}</button>
        </>}>
        <label className="mp-sheet-label" htmlFor="cust-sm-p">Salesman</label>
        <select id="cust-sm-p" value={salesmanId} onChange={(e) => setSalesmanId(e.target.value)} className="w-full h-12 px-3 rounded-xl border border-slate-300 text-[15px] bg-white">
          <option value="all">All salesmen</option>
          <option value="unassigned">No salesman</option>
          {salesmen.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <label className="mp-sheet-label" htmlFor="cust-missing-p">Missing detail</label>
        <select id="cust-missing-p" value={missing} onChange={(e) => setMissing(e.target.value)} className="w-full h-12 px-3 rounded-xl border border-slate-300 text-[15px] bg-white">
          <option value="">Any</option>
          {missingCounts.map((m) => <option key={m.key} value={m.key}>Missing {m.label} ({m.count})</option>)}
        </select>
      </Sheet>

      <div className={`${card} p-3 hidden sm:flex sm:flex-wrap sm:items-center gap-2`}>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <label htmlFor="cust-search" className="sr-only">Search</label>
          <input id="cust-search" type="search" placeholder="Search name, mobile, CR or VAT" value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-11 sm:h-10 pl-9 pr-3 rounded-full border border-slate-300 text-[15px] sm:text-sm" />
        </div>
        <label className="sr-only" htmlFor="cust-sm">Salesman</label>
        <select id="cust-sm" value={salesmanId} onChange={(e) => setSalesmanId(e.target.value)}
          className="w-full sm:w-auto min-w-0 h-11 sm:h-10 px-3 rounded-full border border-slate-300 text-sm bg-white">
          <option value="all">All salesmen</option>
          <option value="unassigned">No salesman</option>
          {salesmen.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <label className="sr-only" htmlFor="cust-missing">Missing detail</label>
        <select id="cust-missing" value={missing} onChange={(e) => setMissing(e.target.value)}
          className="w-full sm:w-auto min-w-0 h-11 sm:h-10 px-3 rounded-full border border-slate-300 text-sm bg-white">
          <option value="">Missing: any</option>
          {missingCounts.map((m) => <option key={m.key} value={m.key}>Missing {m.label} ({m.count})</option>)}
        </select>
        {canExport && <button type="button" className={btnLight} onClick={exportPdf} disabled={!shown.length}><FileText className="w-4 h-4" /> PDF of this list</button>}
        {canManage && (
          <span className="hidden lg:contents"><button type="button" className={btnRed} onClick={() => setAdding(true)}><Plus className="w-4 h-4" /> Add customer</button></span>
        )}
      </div>

      {canManage && selected.length > 0 && (
        <div className="sticky bottom-[calc(5.25rem+env(safe-area-inset-bottom))] lg:bottom-4 z-20 flex flex-wrap items-center gap-2 p-3 rounded-2xl bg-slate-900 text-white shadow-xl">
          <span className="text-sm font-bold">{selected.length} selected</span>
          <label htmlFor="cust-transfer" className="sr-only">Transfer to</label>
          <select id="cust-transfer" value={transferTo} onChange={(e) => setTransferTo(e.target.value)}
            className="h-9 px-3 rounded-full text-sm text-slate-900 bg-white">
            <option value="">Move to salesman…</option>
            {salesmen.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button type="button" className={btnRed} disabled={!transferTo} onClick={transfer}><ArrowRightLeft className="w-4 h-4" /> Move</button>
          <button type="button" className={`${btn} text-white hover:bg-white/10`} onClick={() => setSelected([])}>Clear</button>
        </div>
      )}

      {/* Phones: one card per customer, whole card is the tap target */}
      <ul className={`${docked ? '' : 'sm:hidden'} space-y-2`} aria-label="Customers">
        {loading && <li className={`${card} p-6 text-center text-slate-500 text-sm`}><Loader2 className="w-5 h-5 animate-spin inline" /> Loading…</li>}
        {!loading && shown.length === 0 && <li className={`${card} p-6 text-center text-slate-500 text-sm`}>No customers here.</li>}
        {!loading && shown.map((c) => {
          const isSel = selected.includes(c.id);
          const toggle = () => setSelected((s) => (s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id]));
          return (
            <li key={c.id}>
              <button type="button" onClick={() => (selecting ? toggle() : onOpen(c.id))} aria-pressed={selecting ? isSel : undefined}
                aria-current={docked === c.id ? 'true' : undefined}
                className={`w-full text-left ${card} rounded-2xl px-4 py-3.5 flex items-start gap-3 active:scale-[0.99] transition ${isSel ? 'ring-2 ring-[#CC1A22]/40 border-red-200 bg-red-50/40' : ''} ${docked === c.id ? 'ring-2 ring-[#2F5BEA] border-[#2F5BEA]' : ''}`}>
                {selecting && (
                  <span className={`mt-0.5 w-6 h-6 shrink-0 rounded-lg border-2 grid place-items-center ${isSel ? 'bg-[#CC1A22] border-[#CC1A22] text-white' : 'border-slate-300'}`} aria-hidden="true">
                    {isSel && <Check className="w-4 h-4" />}
                  </span>
                )}
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-[15px] leading-snug text-slate-900 break-words">{c.name}{c.locked && <Lock className="w-3.5 h-3.5 inline ml-1 -mt-0.5 text-slate-400" aria-label="Locked" />}</span>
                  <span className="block text-[13px] text-slate-500 tabular-nums mt-0.5">
                    {[c.mobile, c.noCr ? 'No CR' : c.crNumber && `CR ${c.crNumber}`].filter(Boolean).join(' · ') || 'No details yet'}
                  </span>
                  <span className="flex items-center gap-1.5 text-[12.5px] text-slate-600 mt-0.5">{c.salesmanName && <Avatar name={c.salesmanName} size={18} />}{c.salesmanName || 'No salesman'}</span>
                  {(c.leadCount > 0 || c.quoteCount > 0) && (
                    <span className="block text-[12px] text-slate-500 mt-0.5">
                      {c.leadCount} enquir{c.leadCount === 1 ? 'y' : 'ies'}{c.quoteCount ? ` · ${c.quoteCount} quote${c.quoteCount === 1 ? '' : 's'}` : ''}{c.wonValue ? ` · OMR ${c.wonValue.toFixed(3)} won` : ''}
                    </span>
                  )}
                  {c.stage !== 'not_started' && c.missing.length > 0 && (
                    <span className="block text-[12px] text-rose-700 mt-1 line-clamp-1">Missing: {c.missing.slice(0, 3).map((k) => fieldLabel[k] || k).join(', ')}{c.missing.length > 3 ? '…' : ''}</span>
                  )}
                </span>
                <span className="shrink-0 flex flex-col items-end gap-1.5">
                  <StatusBadge status={c.stage} />
                  {c.stage !== 'not_started' && <PercentBar value={c.percent} width="w-16" />}
                  {!selecting && <ChevronRight className="w-4 h-4 text-slate-300 mt-auto" aria-hidden="true" />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className={`${card} overflow-hidden hidden ${docked ? '' : 'sm:block'}`}>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              {canManage && (
                <th className="pl-4 pr-1 py-2.5 w-8">
                  <input type="checkbox" aria-label="Select all shown" checked={allChecked}
                    onChange={() => setSelected(allChecked ? [] : shown.map((r) => r.id))} />
                </th>
              )}
              <th className="text-left font-bold px-3 py-2.5">Customer</th>
              <th className="text-left font-bold px-3 py-2.5 hidden md:table-cell">Salesman</th>
              <th className="text-left font-bold px-3 py-2.5">Progress</th>
              <th className="text-left font-bold px-3 py-2.5 hidden lg:table-cell">Still missing</th>
            </tr>
          </thead>
          <tbody className="mp-stagger divide-y divide-slate-100">
            {loading && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500"><Loader2 className="w-5 h-5 animate-spin inline" /> Loading…</td></tr>}
            {!loading && shown.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No customers here.</td></tr>}
            {!loading && shown.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => onOpen(c.id)}>
                {canManage && (
                  <td className="pl-4 pr-1 py-3" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" aria-label={`Select ${c.name}`} checked={selected.includes(c.id)}
                      onChange={() => setSelected((s) => (s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id]))} />
                  </td>
                )}
                <td className="px-3 py-3">
                  <button type="button" className="font-semibold text-slate-900 hover:text-[#CC1A22] text-left" onClick={(e) => { e.stopPropagation(); onOpen(c.id); }}>{c.name}</button>
                  <span className="block text-xs text-slate-500 tabular-nums">
                    {[c.mobile, c.noCr ? 'No CR' : c.crNumber && `CR ${c.crNumber}`].filter(Boolean).join(' · ') || 'No details yet'}
                    {c.locked && <Lock className="w-3 h-3 inline ml-1" aria-label="Locked" />}
                  </span>
                  {(c.leadCount > 0 || c.quoteCount > 0) && (
                    <span className="block text-[11px] text-slate-600">
                      {c.leadCount} enquir{c.leadCount === 1 ? 'y' : 'ies'}{c.openLeads ? ` (${c.openLeads} open)` : ''}{c.quoteCount ? ` · ${c.quoteCount} quote${c.quoteCount === 1 ? '' : 's'}` : ''}{c.wonValue ? ` · OMR ${c.wonValue.toFixed(3)} won` : ''}
                    </span>
                  )}
                  <span className="block md:hidden text-[11px] text-slate-500">{c.salesmanName || 'No salesman'}</span>
                </td>
                <td className="px-3 py-3 text-slate-600 whitespace-nowrap hidden md:table-cell">{c.salesmanName ? <span className="inline-flex items-center gap-2"><Avatar name={c.salesmanName} size={22} />{c.salesmanName}</span> : 'No salesman'}</td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <StatusBadge status={c.stage} />
                  {c.stage !== 'not_started' && <span className="block mt-1"><PercentBar value={c.percent} width="w-16" /></span>}
                </td>
                <td className="px-3 py-3 hidden lg:table-cell text-xs text-slate-600 max-w-[280px]">
                  {c.stage === 'not_started' ? <span className="text-slate-400">Waiting for salesman</span>
                    : c.missing.length === 0 ? <span className="text-emerald-700 font-semibold">Nothing missing</span>
                    : <span className="line-clamp-2"><strong className="text-rose-700">{c.missing.length}</strong> · {c.missing.slice(0, 3).map((k) => fieldLabel[k] || k).join(', ')}{c.missing.length > 3 ? '…' : ''}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {adding && (
        <AddCustomerModal authFetch={authFetch} showToast={showToast} salesmen={salesmen}
          onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); onChanged(); }} />
      )}
    </div>
  );
}

function AddCustomerModal({ authFetch, showToast, salesmen, onClose, onSaved }) {
  const [name, setName] = useState('');
  const [salesmanId, setSalesmanId] = useState('');
  const [mobile, setMobile] = useState('');
  const [error, setError] = useState('');
  const save = async (e) => {
    e.preventDefault();
    setError('');
    const res = await authFetch('/api/customers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, salesmanId, mobile }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) { showToast(`${body.name} added to ${body.salesmanName}'s list.`); onSaved(); }
    else setError(body.fields ? Object.values(body.fields).join(' ') : body.error || 'Could not add customer');
  };
  return (
    <Modal title="Add customer" onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <TextInput id="ac-name" label="Customer name" value={name} onChange={setName} required />
        <div className="space-y-1">
          <label htmlFor="ac-sm" className="block text-sm font-semibold">Salesman</label>
          <select id="ac-sm" required value={salesmanId} onChange={(e) => setSalesmanId(e.target.value)}
            className="w-full h-11 px-3 rounded-xl border border-slate-300 bg-white text-sm">
            <option value="">Choose…</option>
            {salesmen.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <TextInput id="ac-mobile" label="Mobile (optional)" value={mobile} onChange={setMobile} type="tel" />
        {error && <p role="alert" className="text-sm font-semibold text-rose-700">{error}</p>}
        <button type="submit" className={`${btnRed} w-full min-h-[44px]`}>Add to salesman's list</button>
      </form>
    </Modal>
  );
}

// ---------------- Customer detail ----------------
function CustomerDetail({ id, authFetch, showToast, canManage, fields, salesmen, onClose, onChanged }) {
  const [c, setC] = useState(null);
  const [values, setValues] = useState({});
  const [noCr, setNoCr] = useState(false);
  const [noCrReason, setNoCrReason] = useState('');
  const [name, setName] = useState('');
  const [errors, setErrors] = useState({});
  const [thumbs, setThumbs] = useState({});
  const [busy, setBusy] = useState(false);
  const [transferTo, setTransferTo] = useState('');

  const load = useCallback(async () => {
    const res = await authFetch(`/api/customers/${id}`);
    if (!res.ok) { showToast('Customer not found', 'error'); onClose(); return; }
    const data = await res.json();
    setC(data);
    setName(data.name);
    setNoCr(data.noCr);
    setNoCrReason(data.noCrReason);
    const v = { mobile: data.mobile, cr_number: data.crNumber, vat_number: data.vatNumber, ...data.data };
    fields.filter((f) => f.type === 'multiselect').forEach((f) => { v[f.key] = asList(v[f.key]); });
    setValues(v);
  }, [authFetch, id, fields]);

  useEffect(() => { load(); }, [load]);

  // Load photo thumbnails with the login token (files are never public)
  useEffect(() => {
    if (!c) return undefined;
    let alive = true;
    const urls = [];
    c.files.filter((f) => f.mime === 'image/jpeg').forEach(async (f) => {
      const res = await authFetch(`/api/customers/${c.id}/files/${f.id}`);
      if (!res.ok || !alive) return;
      const url = URL.createObjectURL(await res.blob());
      urls.push(url);
      setThumbs((t) => ({ ...t, [f.id]: url }));
    });
    return () => { alive = false; urls.forEach((u) => URL.revokeObjectURL(u)); };
  }, [c, authFetch]);

  if (!c) return <Modal title="Customer" onClose={onClose} wide side><p className="text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin inline" /> Loading…</p></Modal>;

  const type = c.salesmanType || 'branch';
  const editFields = fields.filter((f) => f.type !== 'photo' && f.type !== 'document' && !f.isHidden && fieldApplies(f, values));
  const docFields = fields.filter((f) => f.type === 'document' && !f.isHidden && fieldApplies(f, values));
  const setValue = (key, v) => setValues((prev) => {
    const next = { ...prev, [key]: v };
    if (key === 'governorate' && prev.governorate !== v) next.city = '';
    return next;
  });

  const save = async () => {
    setBusy(true);
    setErrors({});
    const data = {};
    editFields.forEach((f) => {
      const v = values[f.key];
      if (!['mobile', 'cr_number', 'vat_number'].includes(f.key) && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)) data[f.key] = v;
    });
    const res = await authFetch(`/api/customers/${c.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mobile: values.mobile, crNumber: noCr ? '' : values.cr_number, vatNumber: values.vat_number, noCr, noCrReason, data }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) { showToast('Customer saved.'); load(); onChanged(); }
    else { setErrors(body.fields || {}); showToast(body.error || 'Could not save', 'error'); }
  };

  const action = async (path, method = 'POST', bodyObj, okMsg) => {
    const res = await authFetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: bodyObj ? JSON.stringify(bodyObj) : undefined });
    const body = await res.json().catch(() => ({}));
    if (res.ok) { showToast(okMsg); onChanged(); return true; }
    showToast(body.error || 'Something went wrong', 'error');
    return false;
  };

  const uploadAdminFile = async (file, label) => {
    try {
      const p = await prepareUpload(file);
      if (await action(`/api/customers/${c.id}/files`, 'POST', { base64: p.base64, label, name: p.name, pages: p.pages || [] }, 'Document added.')) load();
    } catch (err) { showToast(err.message, 'error'); }
  };

  // Customer PDF: details + every uploaded document (photos and PDFs), each document on its own page
  // under a header that shows the number on file (CR / VAT) so the paper can be checked against it.
  const printProfile = async (version) => {
    const win = openPendingWindow();
    if (!win) { showToast('Allow pop-ups to download the PDF', 'error'); return; }
    const snap = c.submissions[c.submissions.length - 1]?.snapshot; // first (original) submission
    const src = version === 'submitted' && snap
      ? { name: snap.name || c.name, mobile: snap.mobile, crNumber: snap.crNumber, noCr: snap.noCr, noCrReason: snap.noCrReason, vatNumber: snap.vatNumber, data: snap.data || {} }
      : { name: c.name, mobile: c.mobile, crNumber: c.crNumber, noCr: c.noCr, noCrReason: c.noCrReason, vatNumber: c.vatNumber, data: c.data };
    const value = (f) => {
      let v = f.key === 'mobile' ? src.mobile : f.key === 'cr_number' ? (src.noCr ? `No CR – ${src.noCrReason}` : src.crNumber) : f.key === 'vat_number' ? src.vatNumber : src.data[f.key];
      return Array.isArray(v) ? v.join(', ') : v;
    };
    // What each document should be checked against
    const onFile = {
      cr_certificate: c.noCr ? `No CR (${c.noCrReason || 'no reason given'})` : (c.crNumber ? `CR No. on file: ${c.crNumber}` : 'CR No. not entered yet'),
      vat_certificate: c.data?.vat_registered === 'No' ? 'Customer says: not VAT registered' : (c.vatNumber ? `VAT No. on file: ${c.vatNumber}` : 'VAT No. not entered yet'),
      shop_front: [c.data?.shop_name, c.data?.address, c.data?.city].filter(Boolean).join(', ') || '',
      other: '',
    };
    const by = (f) => (f.uploadedVia === 'link' ? `${c.salesmanName || 'salesman'} (salesman link)` : 'office');
    const ORDER = ['cr_certificate', 'vat_certificate', 'shop_front', 'other'];
    const files = [...c.files].sort((a, b) => ORDER.indexOf(a.label) - ORDER.indexOf(b.label));

    let pages = '';
    let failed = 0;
    for (const f of files) {
      try {
        const res = await authFetch(`/api/customers/${c.id}/files/${f.id}`);
        if (!res.ok) throw new Error('download failed');
        const blob = await res.blob();
        const imgs = f.mime === 'application/pdf'
          ? (await pdfToImages(blob)).images
          : [await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(blob); })];
        imgs.forEach((img, i) => {
          pages += `<div class="docpage"><div class="dochead"><div><b>${esc(FILE_LABEL_NAMES[f.label] || f.label)}</b>${imgs.length > 1 ? ` <span>page ${i + 1} of ${imgs.length}</span>` : ''}<br><span class="match">${esc(onFile[f.label] || '')}</span></div><span>${esc(src.name)}<br>Uploaded ${esc(fmt(f.uploadedAt))} by ${esc(by(f))}</span></div><div class="docimg"><img src="${img}" alt=""></div></div>`;
        });
      } catch { failed++; }
    }

    const docRows = docFields.map((f) => {
      const have = c.files.filter((x) => x.label === f.docLabel);
      return [f.label, onFile[f.docLabel] || '', have.length ? `${have.length} file${have.length > 1 ? 's' : ''} (attached)` : 'Missing', have.length ? fmt(have.at(-1).uploadedAt) : '', have.length ? by(have.at(-1)) : ''];
    });
    const otherCount = c.files.filter((x) => !docFields.some((f) => f.docLabel === x.label)).length;
    if (otherCount) docRows.push(['Other photos', '', `${otherCount} file${otherCount > 1 ? 's' : ''} (attached)`, '', '']);

    openPrintable({
      win,
      docType: 'Customer profile',
      meta: [['Customer No.', c.id], ['Salesman', c.salesmanName || '—'], ['Status', STATUS[c.stage]?.label || c.status], ['Complete', `${c.percent}%`]],
      title: src.name,
      subtitle: version === 'submitted' && snap
        ? `As first submitted by ${snap.submittedBy || c.salesmanName} on ${fmt(c.submissions[c.submissions.length - 1].submittedAt)}`
        : `Customer #${c.id} · Salesman: ${c.salesmanName || '—'} · ${STATUS[c.stage]?.label || c.status} · ${c.percent}% complete`,
      bodyHtml: (version !== 'submitted' && (c.missing || []).length ? noteHtml(`<b>Still missing:</b> ${esc(c.missing.map((k) => fields.find((f) => f.key === k)?.label || k).join(', '))}`) : '')
        + '<h2>Details</h2>' + kvHtml(editFields.map((f) => [f.label, value(f)]))
        + (docRows.length ? '<h2>Documents</h2>' + tableHtml([{ label: 'Document' }, { label: 'Check against' }, { label: 'Status' }, { label: 'Uploaded' }, { label: 'By' }], docRows) : '')
        + (failed ? noteHtml(`${failed} document(s) could not be added. Download them from the customer page.`) : '')
        + (version !== 'submitted' ? '<h2>Enquiries</h2>' + tableHtml([{ label: 'Date' }, { label: 'Product' }, { label: 'Quantity' }, { label: 'Stage' }, { label: 'Salesman' }, { label: 'OMR', num: true }],
          (c.leads || []).map((l) => [fmt(l.date), l.category, l.quantity, STAGE_NAMES[l.status] || l.status, l.salesman, l.dealValue ? l.dealValue.toFixed(3) : '']))
          + '<h2>Quotations</h2>' + tableHtml([{ label: 'Date' }, { label: 'Number' }, { label: 'Status' }, { label: 'OMR', num: true }],
          (c.quotations || []).map((q) => [fmt(q.date), q.number, q.status, q.total.toFixed(3)])) : '')
        + pages,
    });
  };

  return (
    <Modal title={c.name} onClose={onClose} wide side>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={c.stage || c.status} />
          <PercentBar value={c.percent} />
          <span className="text-xs text-slate-500">Salesman: <strong>{c.salesmanName || 'Unassigned'}</strong> ({TYPE_LABEL[type]}) · Source: {c.source} · Submitted: {fmt(c.submittedAt)}</span>
          {canManage && c.status !== 'not_started' && (
            <button type="button" className={`${btnLight} ml-auto`}
              onClick={async () => { if (await action(`/api/customers/${c.id}/lock`, 'POST', { locked: !c.locked }, c.locked ? 'Unlocked: the salesman can add details again.' : 'Locked: the salesman can no longer add details.')) load(); }}>
              {c.locked ? <><Unlock className="w-4 h-4" /> Unlock for salesman</> : <><Lock className="w-4 h-4" /> Lock</>}
            </button>
          )}
        </div>
        {c.locked && <p className="p-3 rounded-2xl bg-slate-100 text-slate-700 text-sm"><Lock className="w-4 h-4 inline mr-1" />Locked. The salesman can see this customer but can't add details or documents.</p>}
        {c.status !== 'not_started' && (c.missing || []).length > 0 && (
          <p className="p-3 rounded-2xl bg-rose-50 text-rose-900 text-sm">
            <strong>Still missing ({c.missing.length}):</strong> {c.missing.map((k) => fields.find((f) => f.key === k)?.label || k).join(', ')}
          </p>
        )}

        <section className="grid grid-cols-3 gap-2 mp-stagger" aria-label="Business with this customer">
          {[['Enquiries', (c.leads || []).length], ['Quotations', (c.quotations || []).length], ['Won (OMR)', Number(c.wonValue || 0).toFixed(3)]].map(([label, v]) => (
            <div key={label} className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
              <span className="block text-lg font-extrabold tabular-nums">{v}</span>
            </div>
          ))}
        </section>
        {((c.leads || []).length > 0 || (c.quotations || []).length > 0) && (
          <section className="grid lg:grid-cols-2 gap-3">
            <div className="rounded-2xl border border-slate-200 overflow-hidden">
              <h3 className="px-4 py-2.5 bg-slate-50 text-sm font-bold">Enquiries</h3>
              <ul className="mp-stagger divide-y divide-slate-100">
                {(c.leads || []).map((l) => (
                  <li key={l.id} className="px-4 py-2.5 text-sm flex items-center gap-2">
                    <span className="flex-1 min-w-0">
                      <span className="block font-semibold truncate">{l.category || 'Enquiry'}{l.quantity ? ` · ${l.quantity}` : ''}</span>
                      <span className="block text-[11px] text-slate-500">{fmt(l.date)} · {l.salesman || 'No salesman'}</span>
                    </span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100">{STAGE_NAMES[l.status] || l.status}</span>
                    {l.dealValue > 0 && <span className="text-xs font-bold tabular-nums">{l.dealValue.toFixed(3)}</span>}
                  </li>
                ))}
                {(c.leads || []).length === 0 && <li className="px-4 py-3 text-sm text-slate-500">No enquiries yet.</li>}
              </ul>
            </div>
            <div className="rounded-2xl border border-slate-200 overflow-hidden">
              <h3 className="px-4 py-2.5 bg-slate-50 text-sm font-bold">Quotations</h3>
              <ul className="mp-stagger divide-y divide-slate-100">
                {(c.quotations || []).map((q) => (
                  <li key={q.id} className="px-4 py-2.5 text-sm flex items-center gap-2">
                    <span className="flex-1 font-semibold">{q.number}<span className="block text-[11px] font-normal text-slate-500">{fmt(q.date)}</span></span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100">{q.status}</span>
                    <span className="text-xs font-bold tabular-nums">OMR {q.total.toFixed(3)}</span>
                  </li>
                ))}
                {(c.quotations || []).length === 0 && <li className="px-4 py-3 text-sm text-slate-500">No quotations yet.</li>}
              </ul>
            </div>
          </section>
        )}
        {c.status === 'pending_approval' ? (
          <div className="p-4 rounded-2xl border border-blue-200 bg-blue-50 space-y-3">
            <p className="text-sm text-blue-950">
              <AlertTriangle className="w-4 h-4 inline mr-1" />
              <strong>Needs your approval.</strong> {c.reviewNote || 'Added by the salesman.'}
            </p>
            <p className="text-xs text-blue-900">Check the details below. If it is a real, separate customer, approve it. If it is the same shop as an existing customer, archive this one.</p>
            {canManage ? (
              <div className="flex flex-wrap gap-2">
                <button type="button" className={btnRed} onClick={async () => { if (await action(`/api/customers/${c.id}/approve`, 'POST', null, 'Approved. The salesman can continue with this customer.')) load(); }}>
                  <CheckCircle2 className="w-4 h-4" /> Approve – it's a real customer
                </button>
                <button type="button" className={btnLight} onClick={async () => { if (window.confirm(`Archive ${c.name}? Use this when it is a duplicate of an existing customer.`) && await action(`/api/customers/${c.id}`, 'DELETE', null, 'Archived as duplicate.')) onClose(); }}>
                  <Archive className="w-4 h-4" /> Archive – it's a duplicate
                </button>
              </div>
            ) : <p className="text-xs text-blue-900">Only the super admin can approve.</p>}
          </div>
        ) : c.reviewNote ? <p className="p-3 rounded-2xl bg-slate-50 text-slate-700 text-sm">{c.reviewNote}</p> : null}

        <section className="grid md:grid-cols-2 gap-4">
          {canManage && <TextInput id="cd-name" label="Customer name" value={name} onChange={setName} />}
          {editFields.map((f) => {
            if (f.key === 'cr_number') {
              return (
                <div key={f.key} className="space-y-2">
                  {!noCr && <CustomerFieldInput field={f} value={values[f.key]} onChange={(v) => setValue(f.key, v)} error={errors[f.key]} required />}
                  {type === 'branch' && (
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={noCr} onChange={(e) => setNoCr(e.target.checked)} disabled={!canManage} /> No CR</label>
                  )}
                  {noCr && <TextInput id="cd-nocr" label="Reason for no CR" value={noCrReason} onChange={setNoCrReason} />}
                  {errors.no_cr_reason && <p className="text-xs text-rose-700">{errors.no_cr_reason}</p>}
                </div>
              );
            }
            return (
              <div key={f.key} className={f.adminOnly ? 'p-3 rounded-2xl bg-slate-50 border border-dashed border-slate-300' : ''}>
                <CustomerFieldInput field={f} value={values[f.key]} values={values} onChange={(v) => setValue(f.key, v)}
                  error={errors[f.key]} required={type === 'branch' ? f.requiredBranch : f.requiredRouteB2b} readOnly={!canManage} />
                {f.adminOnly && <p className="mt-1 text-[11px] text-slate-500">Only you see this field. Salesmen don't.</p>}
              </div>
            );
          })}
        </section>
        {canManage && <button type="button" className={btnDark} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save changes'}</button>}

        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold">Documents & photos ({c.files.length})</h3>
            <div className="flex flex-wrap gap-2">
              {c.files.length > 0 && (
                <button type="button" className={btnLight}
                  onClick={() => downloadBlob(authFetch, `/api/customers/${c.id}/documents.pdf`, `${slug(c.name)}_documents.pdf`).catch((e) => showToast(e.message, 'error'))}>
                  <FileText className="w-4 h-4" /> All documents as one PDF
                </button>
              )}
              {canManage && (
                <label className={`${btnLight} cursor-pointer`}>
                  <Upload className="w-4 h-4" /> Add document
                  <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => { if (e.target.files[0]) uploadAdminFile(e.target.files[0], 'other'); e.target.value = ''; }} />
                </label>
              )}
            </div>
          </div>
          {docFields.length > 0 && (
            <div className="grid sm:grid-cols-2 gap-2">
              {docFields.map((f) => {
                const have = c.files.filter((x) => x.label === f.docLabel);
                return (
                  <div key={f.key} className={`flex flex-wrap items-center gap-2 p-3 rounded-2xl border ${have.length ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
                    <span className="flex-1 text-sm font-semibold">
                      {have.length ? <CheckCircle2 className="w-4 h-4 inline mr-1 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 inline mr-1 text-rose-600" />}
                      {f.label}: {have.length ? `${have.length} file${have.length > 1 ? 's' : ''}` : 'missing'}
                      <span className="block text-[11px] font-normal text-slate-600">
                        {f.docLabel === 'cr_certificate' ? (c.noCr ? 'Customer has no CR' : `Check against CR No. ${c.crNumber || '(not entered)'}`)
                          : f.docLabel === 'vat_certificate' ? `Check against VAT No. ${c.vatNumber || '(not entered)'}` : ''}
                      </span>
                    </span>
                    {have.length > 0 && (
                      <button type="button" className={btnDark}
                        onClick={() => downloadBlob(authFetch, `/api/customers/${c.id}/files/${have[0].id}/pdf`, `${slug(c.name)}_${f.key}.pdf`).catch((e) => showToast(e.message, 'error'))}>
                        <Download className="w-3.5 h-3.5" /> PDF
                      </button>
                    )}
                    {canManage && (
                      <label className={`${btnLight} cursor-pointer`}>
                        <Upload className="w-3.5 h-3.5" /> Upload
                        <input type="file" accept="image/*,application/pdf" className="sr-only"
                          onChange={(e) => { if (e.target.files[0]) uploadAdminFile(e.target.files[0], f.docLabel); e.target.value = ''; }} />
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {c.files.length === 0 ? <p className="text-sm text-slate-500">No documents yet.</p> : (
            <ul className="mp-stagger grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {c.files.map((f) => (
                <li key={f.id} className="rounded-2xl border border-slate-200 overflow-hidden bg-white">
                  <div className="aspect-[4/3] bg-slate-50 flex items-center justify-center">
                    {thumbs[f.id] ? <img src={thumbs[f.id]} alt={FILE_LABEL_NAMES[f.label]} className="w-full h-full object-cover" /> : <FileText className="w-8 h-8 text-slate-400" />}
                  </div>
                  <div className="p-2 space-y-1.5">
                    <p className="text-xs font-bold">{FILE_LABEL_NAMES[f.label]}</p>
                    <p className="text-[10px] text-slate-500">{fmt(f.uploadedAt)} · {f.uploadedVia}</p>
                    <button type="button" className={`${btnDark} w-full`}
                      onClick={() => downloadBlob(authFetch, `/api/customers/${c.id}/files/${f.id}/pdf`, `${slug(c.name)}_${f.label}.pdf`).catch((e) => showToast(e.message, 'error'))}>
                      <Download className="w-3.5 h-3.5" /> PDF
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
          <button type="button" className={btnLight} onClick={() => printProfile('current')}><FileText className="w-4 h-4" /> Customer PDF (details + documents)</button>
          {c.submissions.length > 0 && (
            <button type="button" className={btnLight} onClick={() => printProfile('submitted')}><Printer className="w-4 h-4" /> PDF as first submitted</button>
          )}
        </section>

        {canManage && (
          <section className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
            <label htmlFor="cd-transfer" className="text-sm font-semibold">Transfer to</label>
            <select id="cd-transfer" value={transferTo} onChange={(e) => setTransferTo(e.target.value)} className="h-10 px-3 rounded-full border border-slate-300 text-sm bg-white">
              <option value="">Choose salesman…</option>
              {salesmen.filter((s) => s.id !== c.salesmanId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button type="button" className={btnDark} disabled={!transferTo}
              onClick={async () => { if (await action('/api/customers/transfer', 'POST', { ids: [c.id], toSalesmanId: transferTo }, 'Customer transferred.')) load(); }}>
              <ArrowRightLeft className="w-4 h-4" /> Transfer
            </button>
            <button type="button" className={`${btn} text-rose-700 hover:bg-rose-50 ml-auto`}
              onClick={async () => { if (window.confirm(`Archive ${c.name}?`) && await action(`/api/customers/${c.id}`, 'DELETE', null, 'Customer archived.')) onClose(); }}>
              <Archive className="w-4 h-4" /> Archive
            </button>
          </section>
        )}

        {c.transfers.length > 0 && (
          <section className="text-xs text-slate-500 space-y-1">
            <h3 className="font-bold text-slate-700 text-sm">Transfer history</h3>
            {c.transfers.map((t, i) => <p key={i}>{fmt(t.at)}: {t.from || 'Unassigned'} → {t.to} (by {t.by || '—'})</p>)}
          </section>
        )}
      </div>
    </Modal>
  );
}

// ---------------- Salesman links ----------------
function LinksTab({ authFetch, showToast, links, summary, onChanged, canDelete = false }) {
  const [pinFor, setPinFor] = useState(null);
  const [delFor, setDelFor] = useState(null);
  const [pin, setPin] = useState('');
  const [creating, setCreating] = useState(false);
  const progress = useMemo(() => Object.fromEntries((summary?.salesmen || []).map((s) => [s.salesmanId, s])), [summary]);
  const isSuper = canDelete; // only the super admin may delete, change photos or set branches
  const [photoFor, setPhotoFor] = useState(null);
  const [branchList, setBranchList] = useState([]);
  useEffect(() => {
    let alive = true;
    authFetch('/api/config').then((r) => (r.ok ? r.json() : {})).then((c) => { if (alive && Array.isArray(c.branches)) setBranchList(c.branches); }).catch(() => {});
    return () => { alive = false; };
  }, [authFetch]);

  const setBranch = async (l, branchId) => {
    const res = await authFetch(`/api/salesmen/${l.salesmanId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branchId: branchId || null }) });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      const b = branchList.find((x) => String(x.id) === String(branchId));
      showToast(b ? `${l.name} is now in ${b.name} (${b.type === 'b2b' ? 'B2B' : 'Retail'}).` : `${l.name} has no branch now.`);
      onChanged();
    } else showToast(body.error || 'Could not change branch', 'error');
  };
  const savePhone = async (l, v) => {
    if (v === (l.phone || '')) return;
    const res = await authFetch(`/api/salesmen/${l.salesmanId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: v }) });
    if (res.ok) { showToast(v ? `WhatsApp number saved for ${l.name}.` : `WhatsApp number removed for ${l.name}.`); onChanged(); }
    else showToast('Could not save the number', 'error');
  };
  const phoneInput = (l, idSuffix = '') => (
    <input id={`ph-${l.salesmanId}${idSuffix}`} type="tel" inputMode="tel" aria-label={`WhatsApp number for ${l.name}`} placeholder="+ WhatsApp number"
      defaultValue={l.phone || ''} onBlur={(e) => savePhone(l, e.target.value.trim())}
      className="mt-0.5 w-40 text-[11.5px] font-normal border border-transparent hover:border-slate-300 focus:border-blue-500 rounded px-1.5 py-0.5 bg-transparent focus:bg-white outline-none" />
  );
  const savePhoto = async (l, dataUrl) => {
    await sendPhoto(authFetch, `/api/salesmen/${l.salesmanId}/photo`, dataUrl);
    showToast(dataUrl ? `Photo updated for ${l.name}.` : `Photo removed for ${l.name}.`);
    onChanged();
  };
  const face = (l, size = 36) => (isSuper ? (
    <button type="button" onClick={() => setPhotoFor(l)} className="rounded-full shrink-0 hover:ring-2 hover:ring-blue-400/50 transition" title={`Change photo for ${l.name}`} aria-label={`Change photo for ${l.name}`}>
      <Avatar name={l.name} photoUrl={l.photoUrl} size={size} />
    </button>
  ) : <Avatar name={l.name} photoUrl={l.photoUrl} size={size} />);
  const branchSelect = (l, idSuffix = '') => (
    <select id={`branch-${l.salesmanId}${idSuffix}`} aria-label={`Branch for ${l.name}`} value={l.branchId || ''} disabled={!isSuper}
      onChange={(e) => setBranch(l, e.target.value)} className="h-10 px-3 rounded-full border border-slate-300 text-xs bg-white max-w-[180px] disabled:opacity-70">
      <option value="">No branch</option>
      {['retail', 'b2b'].map((t) => {
        const list = branchList.filter((b) => b.type === t);
        return list.length ? (
          <optgroup key={t} label={t === 'b2b' ? 'B2B branches' : 'Retail branches'}>
            {list.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </optgroup>
        ) : null;
      })}
    </select>
  );

  const call = async (l, body, msg) => {
    const res = await authFetch(`/api/salesmen/${l.salesmanId}/link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (res.ok) { showToast(msg); onChanged(); return data; }
    showToast(data.error || 'Could not update link', 'error');
    return null;
  };

  const setType = async (l, type) => {
    const res = await authFetch(`/api/salesmen/${l.salesmanId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type }) });
    if (res.ok) { showToast(`${l.name} is now ${TYPE_LABEL[type]}.`); onChanged(); } else showToast('Could not change type', 'error');
  };

  const copy = async (l) => {
    try { await navigator.clipboard.writeText(linkUrl(l)); showToast('Link copied.'); } catch { window.prompt('Copy this link:', linkUrl(l)); }
  };

  const whatsapp = (l) => {
    const p = progress[l.salesmanId];
    const text = `Hello ${l.name}, please complete your customer details in Monipack CRM${p ? ` (${p.remaining} remaining)` : ''}: ${linkUrl(l)}`;
    const phone = String(l.phone || '').replace(/\D/g, '');
    window.open(`https://api.whatsapp.com/send?${phone ? `phone=${phone}&` : ''}text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  const actions = (l) => (
    <div className="flex flex-wrap gap-1.5">
      {!l.linkEnabled && <button type="button" className={btnRed} onClick={() => call(l, { action: 'enable' }, `Link switched on for ${l.name}.`)}><Power className="w-3.5 h-3.5" /> Switch on</button>}
      {l.linkEnabled && (
        <>
          <button type="button" className={btnDark} onClick={() => copy(l)}><Copy className="w-3.5 h-3.5" /> Copy</button>
          <button type="button" className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`} onClick={() => whatsapp(l)}><MessageCircle className="w-3.5 h-3.5" /> WhatsApp</button>
          <button type="button" className={btnLight} onClick={() => window.confirm(`Reset ${l.name}'s link? The old link stops working immediately.`) && call(l, { action: 'regenerate' }, 'New link created. Send it to the salesman.')}><RefreshCw className="w-3.5 h-3.5" /> Reset</button>
          <button type="button" className={btnLight} onClick={() => { setPinFor(l); setPin(''); }}><KeyRound className="w-3.5 h-3.5" /> PIN</button>
          <button type="button" className={`${btn} text-rose-700 hover:bg-rose-50`} onClick={() => call(l, { action: 'disable' }, `Link switched off for ${l.name}.`)}><Power className="w-3.5 h-3.5" /> Off</button>
        </>
      )}
      {canDelete && <button type="button" className={`${btn} text-slate-500 hover:text-rose-700 hover:bg-rose-50`} onClick={() => setDelFor(l)} aria-label={`Delete ${l.name}`} title="Delete salesman (super admin only)"><Trash2 className="w-3.5 h-3.5" /> Delete</button>}
    </div>
  );
  const typeSelect = (l, idSuffix = '') => (l.branchId ? (
    <span className="inline-flex flex-col gap-0.5" title="Type follows the branch">
      <BranchTypeBadge type={l.branchType} />
      <small className="text-[10px] text-slate-500">follows branch</small>
    </span>
  ) : (
    <select id={`type-${l.salesmanId}${idSuffix}`} aria-label={`Type for ${l.name}`} value={l.type} onChange={(e) => setType(l, e.target.value)} className="h-10 px-3 rounded-full border border-slate-300 text-xs bg-white">
      <option value="branch">Branch</option>
      <option value="route_b2b">Route / B2B</option>
    </select>
  ));

  return (
    <div className="space-y-3">
      <div className={`${card} p-4 text-sm text-slate-600 flex flex-wrap items-center justify-between gap-3`}>
        <p className="max-w-2xl">
          Each salesman gets a <strong>secret link</strong> that shows only his customers. <strong>Reset</strong> makes the old link stop working at once.
          A <strong>PIN</strong> (4–6 digits) adds protection. Only <strong>Branch</strong> salesmen may tick “No CR”.
        </p>
        <button type="button" className={btnRed} onClick={() => setCreating(true)}><Plus className="w-4 h-4" /> New salesman</button>
      </div>
      <ul className="md:hidden space-y-2 mp-stagger" aria-label="Salesmen">
        {links.map((l) => (
          <li key={l.salesmanId} className={`${card} p-4 space-y-3`}>
            <div className="flex items-start justify-between gap-3">
              {face(l, 40)}
              <div className="min-w-0 flex-1">
                <p className="font-bold truncate">{l.name}</p>
                {l.branchName && <p className="text-xs text-slate-600 truncate">{l.branchName}</p>}
                {phoneInput(l, '-m')}
                <p className="text-xs text-slate-500 mt-0.5">
                  {l.linkEnabled ? <span className="text-emerald-700 font-bold">Link on</span> : 'Link off'} · PIN {l.hasPin ? 'set' : 'none'} · opened {fmt(l.linkLastUsedAt)}
                </p>
              </div>
              {typeSelect(l, '-m')}
            </div>
            {(isSuper || l.branchId) && <div className="flex items-center gap-2 text-xs"><span className="text-slate-500">Branch</span>{branchSelect(l, '-m')}</div>}
            {actions(l)}
          </li>
        ))}
      </ul>
      <div className={`${card} overflow-x-auto hidden md:block`}>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
            <tr>{['Salesman', 'Branch', 'Type', 'Link', 'PIN', 'Last opened', 'Actions'].map((h) => <th key={h} className="text-left font-bold px-4 py-2.5">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {links.map((l) => (
              <tr key={l.salesmanId}>
                <td className="px-4 py-3 font-semibold whitespace-nowrap"><span className="inline-flex items-center gap-2.5">{face(l)}<span className="flex flex-col">{l.name}{phoneInput(l)}</span></span></td>
                <td className="px-4 py-3">{branchSelect(l)}</td>
                <td className="px-4 py-3">
                  {typeSelect(l)}
                </td>
                <td className="px-4 py-3">
                  {l.linkEnabled ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-xs"><Link2 className="w-3.5 h-3.5" /> On</span>
                  ) : <span className="text-xs text-slate-500">Off</span>}
                </td>
                <td className="px-4 py-3 text-xs">{l.hasPin ? 'Set' : '—'}</td>
                <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{fmt(l.linkLastUsedAt)}</td>
                <td className="px-4 py-3">{actions(l)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {photoFor && (
        <PhotoPicker name={photoFor.name} photoUrl={photoFor.photoUrl} title={`Photo for ${photoFor.name}`}
          onSave={(d) => savePhoto(photoFor, d)} onRemove={() => savePhoto(photoFor, null)} onClose={() => setPhotoFor(null)} />
      )}

      {delFor && (
        <DeleteSalesmanModal salesman={delFor} others={links.filter((x) => x.salesmanId !== delFor.salesmanId)} authFetch={authFetch} showToast={showToast}
          onClose={() => setDelFor(null)} onDone={() => { setDelFor(null); onChanged(); }} />
      )}

      {pinFor && (
        <Modal title={`PIN for ${pinFor.name}`} onClose={() => setPinFor(null)}>
          <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); if (await call(pinFor, { pin }, pin ? 'PIN set. Tell the salesman his PIN.' : 'PIN removed.')) setPinFor(null); }}>
            <TextInput id="pin-input" label="New PIN (4–6 digits). Leave empty to remove the PIN." value={pin} onChange={(v) => setPin(v.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" />
            <button type="submit" className={`${btnRed} w-full min-h-[44px]`}>{pin ? 'Save PIN' : 'Remove PIN'}</button>
          </form>
        </Modal>
      )}
      {creating && <NewSalesmanModal authFetch={authFetch} showToast={showToast} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); onChanged(); }} />}
    </div>
  );
}

function NewSalesmanModal({ authFetch, showToast, onClose, onSaved }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [type, setType] = useState('route_b2b');
  const save = async (e) => {
    e.preventDefault();
    const res = await authFetch('/api/salesmen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, phone, type }) });
    const body = await res.json().catch(() => ({}));
    if (res.ok) { showToast(`${body.name} added.`); onSaved(); } else showToast(body.error || 'Could not add salesman', 'error');
  };
  return (
    <Modal title="New salesman" onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <TextInput id="ns-name" label="Name" value={name} onChange={setName} required />
        <TextInput id="ns-phone" label="WhatsApp number (for sending the link)" value={phone} onChange={setPhone} type="tel" />
        <div className="space-y-1">
          <label htmlFor="ns-type" className="block text-sm font-semibold">Type</label>
          <select id="ns-type" value={type} onChange={(e) => setType(e.target.value)} className="w-full h-11 px-3 rounded-xl border border-slate-300 bg-white text-sm">
            <option value="branch">Branch (retail outlet) – may tick “No CR”</option>
            <option value="route_b2b">Route / B2B – CR always required</option>
          </select>
        </div>
        <button type="submit" className={`${btnRed} w-full min-h-[44px]`}>Add salesman</button>
      </form>
    </Modal>
  );
}

// ---------------- Import ----------------
const TEMPLATE = '﻿Customer Name,Salesman,Mobile,CR Number,VAT Number,Route,Segment,Address\nAl Noor Catering,Salim Al Hadhrami,91234567,,,,Restaurant,\n';

function ImportTab({ authFetch, showToast, onDone }) {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const readFile = async (file) => {
    if (!file) return;
    if (!/\.(csv|txt)$/i.test(file.name)) {
      showToast('Save the sheet as CSV first: Excel → Save As → CSV UTF-8, or Google Sheets → File → Download → CSV.', 'error');
      return;
    }
    setBusy(true);
    const text = await file.text();
    const res = await authFetch('/api/customers/import/parse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csvData: text }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) setResult(body); else showToast(body.error || 'Could not read the file', 'error');
  };

  const doImport = async () => {
    setBusy(true);
    const res = await authFetch('/api/customers/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: result.rows.filter((r) => r.valid) }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) { showToast(`${body.added} customers imported. ${body.skippedDuplicate} duplicates skipped.`); onDone(); }
    else showToast(body.error || 'Import failed', 'error');
  };

  const valid = result?.rows.filter((r) => r.valid).length || 0;

  return (
    <div className="space-y-3">
      <div className={`${card} p-5 space-y-3`}>
        <h2 className="font-bold">Import customer list</h2>
        <ol className="list-decimal pl-5 text-sm text-slate-600 space-y-1">
          <li>Columns needed: <strong>Customer Name</strong> and <strong>Salesman</strong> (exactly as the salesman's name in the CRM). Other columns are optional: Mobile, CR Number, VAT Number, Route, Segment, Address…</li>
          <li>From Google Sheets: <em>File → Download → Comma-separated values (.csv)</em>. From Excel: <em>Save As → CSV UTF-8</em>.</li>
          <li>Upload the CSV, check the preview, then click Import. Customers already in the CRM (same name for the same salesman, or same mobile / CR / VAT) are skipped.</li>
        </ol>
        <div className="flex flex-wrap gap-2">
          <a className={btnLight} href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`} download="monipack_customer_import_template.csv">
            <Download className="w-4 h-4" /> Download template
          </a>
          <label className={`${btnRed} cursor-pointer`}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Choose CSV file
            <input type="file" accept=".csv,text/csv,.txt" className="sr-only" onChange={(e) => { readFile(e.target.files[0]); e.target.value = ''; }} />
          </label>
        </div>
      </div>

      {result && (
        <div className={`${card} p-5 space-y-3`}>
          {result.errors.length > 0 ? (
            <p role="alert" className="text-sm font-semibold text-rose-700">{result.errors.join(' ')}</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm"><strong className="text-emerald-700">{valid} ready</strong> · <strong className="text-rose-700">{result.rows.length - valid} with problems</strong> (these will be skipped)</p>
                <button type="button" className={btnRed} disabled={!valid || busy} onClick={doImport}>Import {valid} customers</button>
              </div>
              <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0"><tr>{['Line', 'Customer', 'Salesman', 'Mobile', 'CR', 'Problem'].map((h) => <th key={h} className="text-left px-3 py-2">{h}</th>)}</tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {result.rows.map((r) => (
                      <tr key={r.line} className={r.valid ? '' : 'bg-rose-50'}>
                        <td className="px-3 py-1.5 tabular-nums">{r.line}</td>
                        <td className="px-3 py-1.5">{r.name}</td>
                        <td className="px-3 py-1.5">{r.salesmanName}</td>
                        <td className="px-3 py-1.5 tabular-nums">{r.mobile}</td>
                        <td className="px-3 py-1.5 tabular-nums">{r.crNumber}</td>
                        <td className="px-3 py-1.5 text-rose-700">{r.problems.join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------- Field manager ----------------
function FieldsTab({ authFetch, showToast, fields, onChanged }) {
  const [newField, setNewField] = useState({ label: '', type: 'text', options: '' });
  const [optionDrafts, setOptionDrafts] = useState({});

  const patch = async (f, body, msg) => {
    const res = await authFetch(`/api/customer-fields/${f.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (res.ok) { showToast(msg); onChanged(); } else showToast(data.error || 'Could not save', 'error');
  };

  const add = async (e) => {
    e.preventDefault();
    const options = ['dropdown', 'multiselect'].includes(newField.type) ? newField.options.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const res = await authFetch('/api/customer-fields', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...newField, options }) });
    const data = await res.json().catch(() => ({}));
    if (res.ok) { showToast(`Field "${data.label}" added.`); setNewField({ label: '', type: 'text', options: '' }); onChanged(); }
    else showToast(data.error || 'Could not add field', 'error');
  };

  return (
    <div className="space-y-3">
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
            <tr>{['Field', 'Type', 'Required: Branch', 'Required: Route/B2B', 'Shown', 'Only super admin', 'Choices'].map((h) => <th key={h} className="text-left font-bold px-4 py-2.5 whitespace-nowrap">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {fields.map((f) => {
              const locked = f.key === 'mobile' || f.key === 'cr_number';
              return (
                <tr key={f.id} className={f.isHidden ? 'opacity-60' : ''}>
                  <td className="px-4 py-3 font-semibold">{f.label}{locked && <span className="ml-1 text-[10px] text-slate-500">(always required)</span>}</td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{TYPE_NAMES[f.type] || f.type}{f.showIf && <span className="block text-[10px] text-slate-500">only when {f.showIf.key.replace(/_/g, ' ')} = {f.showIf.equals}</span>}</td>
                  <td className="px-4 py-3"><input type="checkbox" aria-label={`${f.label} required for branch`} checked={f.requiredBranch} disabled={locked} onChange={() => patch(f, { requiredBranch: !f.requiredBranch }, 'Saved.')} /></td>
                  <td className="px-4 py-3"><input type="checkbox" aria-label={`${f.label} required for route/B2B`} checked={f.requiredRouteB2b} disabled={locked} onChange={() => patch(f, { requiredRouteB2b: !f.requiredRouteB2b }, 'Saved.')} /></td>
                  <td className="px-4 py-3">
                    <button type="button" disabled={locked} className={btnLight} onClick={() => patch(f, { isHidden: !f.isHidden }, f.isHidden ? `${f.label} shown again.` : `${f.label} hidden (data kept).`)}>
                      {f.isHidden ? <><EyeOff className="w-3.5 h-3.5" /> Hidden</> : <><Eye className="w-3.5 h-3.5" /> Shown</>}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <input type="checkbox" aria-label={`${f.label} only for super admin`} checked={Boolean(f.adminOnly)} disabled={locked}
                      onChange={() => patch(f, { adminOnly: !f.adminOnly }, f.adminOnly ? `Salesmen now see ${f.label}.` : `${f.label} is now only for you.`)} />
                  </td>
                  <td className="px-4 py-3">
                    {f.type === 'dropdown' || f.type === 'multiselect' ? (
                      <div className="flex gap-1.5 items-center min-w-[260px]">
                        <label htmlFor={`opt-${f.id}`} className="sr-only">Options for {f.label}</label>
                        <input id={`opt-${f.id}`} type="text" className="flex-1 h-9 px-3 rounded-full border border-slate-300 text-xs"
                          value={optionDrafts[f.id] ?? f.options.join(', ')} onChange={(e) => setOptionDrafts({ ...optionDrafts, [f.id]: e.target.value })} placeholder="Option 1, Option 2" />
                        <button type="button" className={btnDark} onClick={() => patch(f, { options: (optionDrafts[f.id] ?? f.options.join(', ')).split(',').map((s) => s.trim()).filter(Boolean) }, 'Options saved.')}>Save</button>
                      </div>
                    ) : <span className="text-xs text-slate-400">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <form onSubmit={add} className={`${card} p-5 flex flex-wrap items-end gap-3`}>
        <TextInput id="nf-label" label="New field name" value={newField.label} onChange={(v) => setNewField({ ...newField, label: v })} required />
        <div className="space-y-1">
          <label htmlFor="nf-type" className="block text-sm font-semibold">Type</label>
          <select id="nf-type" value={newField.type} onChange={(e) => setNewField({ ...newField, type: e.target.value })} className="h-11 px-3 rounded-xl border border-slate-300 bg-white text-sm">
            {['text', 'number', 'phone', 'email', 'dropdown', 'multiselect', 'yesno', 'date', 'textarea'].map((t) => <option key={t} value={t}>{TYPE_NAMES[t]}</option>)}
          </select>
        </div>
        {(newField.type === 'dropdown' || newField.type === 'multiselect') && (
          <TextInput id="nf-options" label="Options (comma separated)" value={newField.options} onChange={(v) => setNewField({ ...newField, options: v })} />
        )}
        <button type="submit" className={`${btnRed} min-h-[44px]`}><Plus className="w-4 h-4" /> Add field</button>
      </form>
    </div>
  );
}

// ---------------- Small shared pieces ----------------
/** Super admin only: delete a salesman after typing his name. His work moves to another salesman or becomes "Not assigned". */
function DeleteSalesmanModal({ salesman, others, authFetch, showToast, onClose, onDone }) {
  const [info, setInfo] = useState(null);
  const [moveTo, setMoveTo] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    authFetch(`/api/salesmen/${salesman.salesmanId}/delete-preview`).then(async (r) => {
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not check this salesman');
      setInfo(d);
    }).catch((e) => { showToast(e.message, 'error'); onClose(); });
  }, [salesman.salesmanId]); // eslint-disable-line react-hooks/exhaustive-deps
  const match = typed.trim().toLowerCase() === String(salesman.name).trim().toLowerCase();
  const del = async () => {
    if (!match) { setErr(`Type "${salesman.name}" to confirm.`); return; }
    setBusy(true); setErr('');
    try {
      const r = await authFetch(`/api/salesmen/${salesman.salesmanId}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmName: typed, moveToId: moveTo || null }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not delete the salesman');
      showToast(`${d.name} deleted. ${d.customers} customers, ${d.openLeads} open leads and ${d.openTasks} tasks moved to ${d.movedTo || 'Not assigned'}.`);
      onDone();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const work = info ? info.customers + info.openLeads + info.openTasks : 0;
  return (
    <Modal title={`Delete ${salesman.name}?`} onClose={onClose}>
      <div className="p-5 space-y-4">
        {!info ? <p className="text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Checking his work…</p> : (
          <>
            <div className="rounded-2xl bg-rose-50 border border-rose-200 p-3.5 text-sm text-rose-800 flex gap-2.5">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>He is removed from every list and <b>his link stops working at once</b>{info.logins ? <>, and <b>{info.logins} staff login{info.logins === 1 ? '' : 's'}</b> linked to him {info.logins === 1 ? 'is' : 'are'} switched off</> : null}. Won and lost deals keep his name as history. This is recorded in the audit vault.</span>
            </div>
            <ul className="grid grid-cols-3 gap-2 text-center">
              {[['Customers', info.customers], ['Open leads', info.openLeads], ['Open tasks', info.openTasks]].map(([l, n]) => (
                <li key={l} className="rounded-2xl border border-slate-200 p-3"><b className="block text-xl tabular-nums">{n}</b><span className="text-xs text-slate-500">{l}</span></li>
              ))}
            </ul>
            {work > 0 && (
              <label className="block">
                <span className="block text-sm font-semibold mb-1.5">Give his customers, open leads and tasks to</span>
                <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} className="w-full h-11 px-3 rounded-xl border border-slate-300 bg-white text-sm">
                  <option value="">Nobody (mark as Not assigned)</option>
                  {others.map((o) => <option key={o.salesmanId} value={o.salesmanId}>{o.name}</option>)}
                </select>
              </label>
            )}
            <label className="block">
              <span className="block text-sm font-semibold mb-1.5">Type <b className="select-all">{salesman.name}</b> to confirm</span>
              <input value={typed} onChange={(e) => { setTyped(e.target.value); setErr(''); }} autoComplete="off" className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm" aria-invalid={Boolean(err)} />
            </label>
            {err && <p className="text-sm text-rose-700" role="alert">{err}</p>}
            <div className="flex gap-2 justify-end pt-1">
              <button type="button" onClick={onClose} className="h-11 px-4 rounded-full text-sm font-semibold hover:bg-slate-100">Cancel</button>
              <button type="button" onClick={del} disabled={busy} className="h-11 px-5 rounded-full text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-60 inline-flex items-center gap-2">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Delete salesman
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, children, wide, side }) {
  // side: on PCs and landscape tablets (>= 1024 px) the window docks on the right, so the list stays visible beside it
  return (
    <div className={`fixed inset-0 z-50 mp-overlay bg-slate-900/50 flex items-end sm:items-center justify-center p-0 sm:p-4 ${side ? 'mp-dock' : ''}`} role="dialog" aria-modal={side ? undefined : 'true'} aria-label={title}>
      <div className={`w-full ${wide ? 'sm:max-w-4xl' : 'sm:max-w-md'} max-h-[94vh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl mp-dock-box`}>
        <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold truncate pr-3">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function TextInput({ id, label, value, onChange, type = 'text', required, inputMode }) {
  return (
    <div className="space-y-1 flex-1 min-w-[180px]">
      <label htmlFor={id} className="block text-sm font-semibold">{label}</label>
      <input id={id} type={type} inputMode={inputMode} required={required} value={value ?? ''} onChange={(e) => onChange(e.target.value)}
        className="w-full h-11 px-3 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-[#CC1A22]" />
    </div>
  );
}
