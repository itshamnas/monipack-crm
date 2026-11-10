import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Lock, ShieldCheck, ShieldAlert, Search, Loader2, KeyRound, LogOut, RefreshCw, FileText, Download, ChevronDown, X } from 'lucide-react';
import { openPrintable, tableHtml, chipsHtml } from '../utils/pdfReport.js';

/**
 * Audit vault (super admin only, second password).
 * Shows every change made in the CRM by anyone, super admin included. Read-only.
 * The vault token lives in memory only: leaving the page or 15 minutes locks it again.
 */
const CATS = [
  ['', 'Everything'], ['danger', 'Deletions & cleanup'], ['security', 'Sign-ins & security'], ['export', 'Downloads & exports'],
  ['leads', 'Leads'], ['customers', 'Customers'], ['quotations', 'Quotations'], ['tasks', 'Tasks'], ['salesmen', 'Salesmen'],
  ['staff', 'Staff logins'], ['settings', 'Settings'], ['link', 'Salesman links'], ['other', 'Other'],
];
const CAT_TONE = {
  danger: 'bg-rose-50 text-rose-700', security: 'bg-amber-50 text-amber-800', export: 'bg-violet-50 text-violet-700',
  leads: 'bg-blue-50 text-blue-700', customers: 'bg-sky-50 text-sky-700', quotations: 'bg-emerald-50 text-emerald-700',
  tasks: 'bg-indigo-50 text-indigo-700', salesmen: 'bg-orange-50 text-orange-700', staff: 'bg-fuchsia-50 text-fuchsia-700',
  settings: 'bg-slate-100 text-slate-700', link: 'bg-teal-50 text-teal-700', other: 'bg-slate-100 text-slate-600',
};
const ROLE = { super_admin: 'Super admin', manager: 'Manager', customer_care: 'Customer care', salesman: 'Salesman', salesman_link: 'Salesman link' };
const when = (d) => new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const PAGE = 200;

export default function AuditVault({ authFetch, showToast }) {
  const [token, setToken] = useState(null);
  const [expires, setExpires] = useState(0);
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(0);

  // Lock when the 15 minutes run out
  useEffect(() => {
    if (!token) return undefined;
    const t = setInterval(() => {
      const s = Math.max(0, Math.round((expires - Date.now()) / 1000));
      setLeft(s);
      if (!s) { setToken(null); showToast?.('The vault locked itself after 15 minutes.'); }
    }, 1000);
    return () => clearInterval(t);
  }, [token, expires, showToast]);

  const unlock = async (e) => {
    e.preventDefault();
    if (!pw) { setErr('Enter the vault password.'); return; }
    setBusy(true); setErr('');
    try {
      const r = await authFetch('/api/vault/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not open the vault.');
      setToken(d.token); setExpires(Date.now() + d.expiresInSec * 1000); setPw('');
    } catch (ex) { setErr(ex.message); }
    setBusy(false);
  };

  if (!token) {
    return (
      <div className="min-h-[70vh] grid place-items-center px-4">
        <form onSubmit={unlock} className="w-full max-w-sm bg-white rounded-3xl border border-slate-200 shadow-xl p-6 sm:p-7 text-center mp-enter">
          <div className="mx-auto w-14 h-14 rounded-2xl grid place-items-center text-white bg-gradient-to-b from-slate-700 to-slate-900 shadow-lg"><Lock className="w-6 h-6" /></div>
          <h2 className="mt-4 text-xl font-bold">Audit vault</h2>
          <p className="mt-1 text-sm text-slate-500">Every change made in the CRM, by everyone. Enter the vault password to open it.</p>
          <label htmlFor="vault-pw" className="sr-only">Vault password</label>
          <input id="vault-pw" type="password" inputMode="numeric" autoComplete="off" autoFocus value={pw} onChange={(e) => { setPw(e.target.value); setErr(''); }}
            placeholder="Vault password" className="mt-5 w-full h-12 px-4 rounded-2xl border border-slate-300 text-center text-lg tracking-[0.3em] focus:outline-none" aria-invalid={Boolean(err)} />
          {err && <p className="mt-2 text-sm text-rose-700" role="alert">{err}</p>}
          <button type="submit" disabled={busy} className="mt-4 w-full h-12 rounded-2xl mp-btn mp-btn-dark text-sm inline-flex items-center justify-center gap-2 disabled:opacity-60">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />} Open vault
          </button>
          <p className="mt-4 text-[11.5px] text-slate-400">Opening the vault and every wrong password are recorded too. 5 wrong tries lock it for 15 minutes.</p>
        </form>
      </div>
    );
  }
  return <VaultView token={token} left={left} authFetch={authFetch} showToast={showToast} onLock={() => setToken(null)} />;
}

function VaultView({ token, left, authFetch, showToast, onLock }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [sum, setSum] = useState(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [actor, setActor] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [check, setCheck] = useState(null);
  const [open, setOpen] = useState(null);
  const [pwOpen, setPwOpen] = useState(false);
  const hdr = useMemo(() => ({ 'X-Vault-Token': token }), [token]);
  const reqId = useRef(0);

  const vfetch = useCallback(async (path, opts = {}) => {
    const r = await authFetch(path, { ...opts, headers: { ...(opts.headers || {}), ...hdr } });
    if (r.status === 423) { onLock(); throw new Error('The vault locked. Enter the password again.'); }
    return r;
  }, [authFetch, hdr, onLock]);

  const params = useCallback((offset = 0, limit = PAGE) => {
    const p = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (q.trim()) p.set('q', q.trim()); if (cat) p.set('category', cat); if (actor) p.set('actor', actor);
    if (from) p.set('from', from); if (to) p.set('to', to);
    return p.toString();
  }, [q, cat, actor, from, to]);

  const load = useCallback(async () => {
    const id = ++reqId.current; setLoading(true);
    try {
      const r = await vfetch(`/api/vault/log?${params()}`);
      const d = await r.json();
      if (id !== reqId.current) return;
      setRows(d.rows || []); setTotal(d.total || 0);
    } catch (e) { showToast?.(e.message, 'error'); }
    if (id === reqId.current) setLoading(false);
  }, [vfetch, params, showToast]);

  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);
  useEffect(() => { vfetch('/api/vault/summary').then((r) => r.json()).then(setSum).catch(() => {}); }, [vfetch]);

  const more = async () => {
    try { const r = await vfetch(`/api/vault/log?${params(rows.length)}`); const d = await r.json(); setRows((x) => [...x, ...(d.rows || [])]); } catch (e) { showToast?.(e.message, 'error'); }
  };
  const verify = async () => {
    setCheck({ busy: true });
    try { const r = await vfetch('/api/vault/verify'); setCheck(await r.json()); } catch (e) { setCheck(null); showToast?.(e.message, 'error'); }
  };
  const allRows = async () => { const r = await vfetch(`/api/vault/log?${params(0, 1000)}`); return (await r.json()).rows || []; };
  const csv = async () => {
    try {
      const list = await allRows();
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const lines = [['Time', 'Person', 'Role', 'What happened', 'Category', 'Result', 'IP', 'Device', 'Details'].map(esc).join(',')]
        .concat(list.map((r) => [when(r.at), r.actor_name, ROLE[r.actor_role] || r.actor_role || '', r.action, r.category, r.status, r.ip, r.device, r.details ? JSON.stringify(r.details) : ''].map(esc).join(',')));
      const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `monipack-audit-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) { showToast?.(e.message, 'error'); }
  };
  const pdf = async () => {
    try {
      const list = await allRows();
      openPrintable({
        docType: 'Audit report', title: 'Audit vault report', subtitle: `${list.length} entries${cat ? ` · ${CATS.find((c) => c[0] === cat)?.[1]}` : ''}${from || to ? ` · ${from || '…'} to ${to || 'today'}` : ''}`,
        meta: [['Total in vault', sum?.total ?? '']],
        bodyHtml: chipsHtml([['Today', sum?.today ?? 0], ['People today', sum?.people_today ?? 0], ['Failed sign-ins (7d)', sum?.failed_week ?? 0], ['Deletions & exports (7d)', sum?.sensitive_week ?? 0]])
          + tableHtml([{ label: 'Time' }, { label: 'Person' }, { label: 'What happened' }, { label: 'IP' }], list.map((r) => [when(r.at), `${r.actor_name || ''}${r.actor_role ? ` (${ROLE[r.actor_role] || r.actor_role})` : ''}`, r.action, r.ip || ''])),
      });
    } catch (e) { showToast?.(e.message, 'error'); }
  };

  const mm = Math.floor(left / 60); const ss = String(left % 60).padStart(2, '0');
  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-4 pb-24 md:pb-8">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-[24px] font-extrabold flex items-center gap-2"><ShieldCheck className="w-6 h-6 text-emerald-600" /> Audit vault</h1>
          <p className="text-sm text-slate-500 mt-0.5">Every change by everyone, including you. Entries cannot be edited or deleted. Locks in <b className="tabular-nums">{mm}:{ss}</b>.</p>
        </div>
        <button type="button" onClick={verify} className="mp-btn mp-btn-line min-h-[40px]">{check?.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Check nothing was changed</button>
        <button type="button" onClick={pdf} className="mp-btn mp-btn-line min-h-[40px]"><FileText className="w-4 h-4" /> PDF</button>
        <button type="button" onClick={csv} className="mp-btn mp-btn-line min-h-[40px]"><Download className="w-4 h-4" /> Excel (CSV)</button>
        <button type="button" onClick={() => setPwOpen(true)} className="mp-btn mp-btn-line min-h-[40px]"><KeyRound className="w-4 h-4" /> Vault password</button>
        <button type="button" onClick={onLock} className="mp-btn mp-btn-dark min-h-[40px]"><LogOut className="w-4 h-4" /> Lock</button>
      </div>

      {check && !check.busy && (
        <div role="status" className={`rounded-2xl border p-3.5 text-sm flex items-center gap-2.5 mp-enter ${check.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
          {check.ok ? <ShieldCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
          {check.ok ? <span><b>All {check.checked.toLocaleString()} entries are intact.</b> Nothing has been edited or removed.</span>
            : <span><b>Warning: the record was tampered with</b> at entry #{check.broken?.id} ({when(check.broken?.at)}). Someone changed the database directly.</span>}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mp-stagger">
        {[['Actions today', sum?.today], ['People active today', sum?.people_today], ['Failed sign-ins · 7 days', sum?.failed_week], ['Deletions & exports · 7 days', sum?.sensitive_week]].map(([l, v], i) => (
          <div key={l} className={`bg-white rounded-2xl border border-slate-200 p-4 ${i >= 2 && v ? 'ring-1 ring-amber-200' : ''}`}>
            <p className="text-xs text-slate-500">{l}</p>
            <p className="text-2xl font-bold tabular-nums mt-1">{v ?? '…'}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-3 flex flex-wrap gap-2 items-center">
        <label className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search person, action, IP…" className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 text-sm" aria-label="Search the vault" />
        </label>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white" aria-label="Category">
          {CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={actor} onChange={(e) => setActor(e.target.value)} className="h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white max-w-[220px]" aria-label="Person">
          <option value="">All people</option>
          {(sum?.actors || []).map((a) => <option key={a.key} value={a.key}>{a.name}{a.role ? ` · ${ROLE[a.role] || a.role}` : ''} ({a.n})</option>)}
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10 px-3 rounded-xl border border-slate-200 text-sm" aria-label="From date" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-10 px-3 rounded-xl border border-slate-200 text-sm" aria-label="To date" />
        <button type="button" onClick={load} className="h-10 w-10 grid place-items-center rounded-xl border border-slate-200" aria-label="Refresh"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
        {(q || cat || actor || from || to) && <button type="button" onClick={() => { setQ(''); setCat(''); setActor(''); setFrom(''); setTo(''); }} className="h-10 px-3 rounded-xl text-sm text-slate-600 hover:bg-slate-100 inline-flex items-center gap-1"><X className="w-4 h-4" /> Clear</button>}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-2.5 text-xs text-slate-500 border-b border-slate-100">{loading ? 'Loading…' : `${total.toLocaleString()} entr${total === 1 ? 'y' : 'ies'}`}</div>
        <ul className="divide-y divide-slate-100">
          {!loading && rows.length === 0 && <li className="p-8 text-center text-sm text-slate-500">Nothing matches these filters.</li>}
          {rows.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} className="w-full text-left px-4 py-3 flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1 hover:bg-slate-50" aria-expanded={open === r.id}>
                <span className="w-[170px] shrink-0 text-xs text-slate-500 tabular-nums">{when(r.at)}</span>
                <span className="min-w-[170px] sm:w-[220px] shrink-0">
                  <b className="block text-[13px] truncate">{r.actor_name || '—'}</b>
                  <small className="text-[11px] text-slate-500">{ROLE[r.actor_role] || (r.actor_kind === 'anonymous' ? 'Not signed in' : r.actor_role || '')}</small>
                </span>
                <span className="flex-1 min-w-[200px] text-[13px]">{r.action}</span>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${CAT_TONE[r.category] || CAT_TONE.other}`}>{CATS.find((c) => c[0] === r.category)?.[1] || r.category}</span>
                <span className="hidden md:block w-[120px] text-xs text-slate-500 truncate tabular-nums" title={r.ip}>{r.ip}</span>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open === r.id ? 'rotate-180' : ''}`} />
              </button>
              {open === r.id && (
                <div className="px-4 pb-4 grid sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-600 mp-enter">
                  <p><b>Entry</b> #{r.id}</p>
                  <p><b>Device</b> {r.device || '—'} · <b>IP</b> {r.ip || '—'}</p>
                  <p><b>Request</b> {r.method} {r.path}</p>
                  <p><b>Result</b> {r.status}</p>
                  {r.details && <pre className="sm:col-span-2 mt-1 p-3 rounded-xl bg-slate-50 border border-slate-200 whitespace-pre-wrap break-words text-[11.5px]">{JSON.stringify(r.details, null, 2)}</pre>}
                </div>
              )}
            </li>
          ))}
        </ul>
        {rows.length < total && !loading && (
          <div className="p-3 border-t border-slate-100 text-center"><button type="button" onClick={more} className="mp-btn mp-btn-line">Show more ({(total - rows.length).toLocaleString()} left)</button></div>
        )}
      </div>

      {pwOpen && <VaultPassword vfetch={vfetch} showToast={showToast} onClose={() => setPwOpen(false)} />}
    </div>
  );
}

function VaultPassword({ vfetch, showToast, onClose }) {
  const [cur, setCur] = useState(''); const [nw, setNw] = useState(''); const [nw2, setNw2] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    if (nw.length < 8) { setErr('New vault password must be at least 8 characters.'); return; }
    if (nw !== nw2) { setErr('The two new passwords are not the same.'); return; }
    setBusy(true); setErr('');
    try {
      const r = await vfetch('/api/vault/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ current: cur, next: nw }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not change the vault password.');
      showToast?.('Vault password changed.'); onClose();
    } catch (ex) { setErr(ex.message); }
    setBusy(false);
  };
  const inp = 'w-full h-11 px-3 rounded-xl border border-slate-300 text-sm';
  return (
    <div className="fixed inset-0 z-50 mp-overlay bg-slate-900/50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Change vault password">
      <form onSubmit={save} className="w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-5 space-y-3">
        <h2 className="text-lg font-bold">Change vault password</h2>
        <input type="password" autoComplete="off" placeholder="Current vault password" value={cur} onChange={(e) => setCur(e.target.value)} className={inp} aria-label="Current vault password" />
        <input type="password" autoComplete="new-password" placeholder="New vault password (8+ characters)" value={nw} onChange={(e) => setNw(e.target.value)} className={inp} aria-label="New vault password" />
        <input type="password" autoComplete="new-password" placeholder="Type the new password again" value={nw2} onChange={(e) => setNw2(e.target.value)} className={inp} aria-label="Repeat new vault password" />
        {err && <p className="text-sm text-rose-700" role="alert">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="h-11 px-4 rounded-full text-sm font-semibold hover:bg-slate-100">Cancel</button>
          <button type="submit" disabled={busy} className="h-11 px-5 rounded-full mp-btn mp-btn-dark text-sm disabled:opacity-60">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Save</button>
        </div>
      </form>
    </div>
  );
}
