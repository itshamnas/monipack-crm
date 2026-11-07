import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Download, Trash2, ShieldCheck, CheckCircle2, Loader2, Lock } from 'lucide-react';

/**
 * Data cleanup (super admin only).
 * Step 1 download a backup, step 2 choose what to delete, step 3 confirm with DELETE + password.
 * Kept always: super admin logins, company settings, customer form fields, pipeline stages, security log.
 */
const card = 'bg-white rounded-3xl border border-slate-200/80 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.04)]';

async function download(authFetch, url, filename) {
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

export default function DataCleanup({ authFetch, showToast, onDone }) {
  const [groups, setGroups] = useState(null);
  const [picked, setPicked] = useState(() => new Set());
  const [resetNumbers, setResetNumbers] = useState(true);
  const [confirm, setConfirm] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [backedUp, setBackedUp] = useState(false);
  const [result, setResult] = useState(null);
  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    const res = await authFetch('/api/admin/cleanup');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Could not load');
    setGroups(data.groups);
  }, [authFetch]);

  useEffect(() => { load().catch((e) => setError(e.message)); }, [load]);

  const total = useMemo(() => (groups || []).filter((g) => picked.has(g.id)).reduce((n, g) => n + g.count + (g.extra || 0), 0), [groups, picked]);
  const allIds = (groups || []).map((g) => g.id);
  const everything = groups && picked.size === allIds.length;
  const toggle = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const ready = picked.size > 0 && confirm === 'DELETE' && password.length > 0 && !busy;

  const backup = async (kind) => {
    try {
      if (kind === 'xlsx') await download(authFetch, '/api/data-centre.xlsx', `monipack_backup_${today}.xlsx`);
      else await download(authFetch, '/api/backup', `monipack_full_backup_${today}.json`);
      setBackedUp(true);
      showToast?.('Backup downloaded');
    } catch (e) {
      showToast?.(e.message, 'error');
    }
  };

  const run = async () => {
    setError('');
    setBusy(true);
    try {
      const res = await authFetch('/api/admin/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groups: [...picked], confirm, password, resetQuotationNumbers: resetNumbers }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Cleanup failed');
      setResult(data);
      setGroups(data.groups);
      setPicked(new Set());
      setConfirm('');
      setPassword('');
      showToast?.('Data deleted');
      onDone?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Warning */}
      <div className="rounded-3xl p-5 sm:p-6 text-white bg-gradient-to-br from-[#9E0A22] to-[#C8102E] shadow-[0_14px_30px_-14px_rgba(200,16,46,0.6)]">
        <div className="flex items-start gap-3">
          <span className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center shrink-0"><AlertTriangle className="w-5 h-5" /></span>
          <div>
            <h2 className="text-lg font-extrabold">Delete data permanently</h2>
            <p className="text-sm text-white/85 mt-1 max-w-2xl">
              Use this to clear test data before going live, or to start fresh. Deleted data cannot be brought back, so download a backup first.
              Your super admin login, company details, customer form and pipeline stages are always kept.
            </p>
          </div>
        </div>
      </div>

      {result && (
        <div className={`${card} p-4 sm:p-5 border-emerald-200`} role="status">
          <p className="font-bold text-emerald-700 flex items-center gap-2"><CheckCircle2 className="w-5 h-5" /> Done. The data below was deleted.</p>
          <ul className="mt-2 text-sm text-slate-600 grid sm:grid-cols-2 gap-x-6">
            {Object.entries(result.deleted).map(([id, n]) => (
              <li key={id} className="flex justify-between border-b border-slate-100 py-1.5"><span>{(groups || []).find((g) => g.id === id)?.label || id}</span><b className="tabular-nums">{n}</b></li>
            ))}
            {result.filesRemoved > 0 && <li className="flex justify-between border-b border-slate-100 py-1.5"><span>Document files</span><b className="tabular-nums">{result.filesRemoved}</b></li>}
          </ul>
        </div>
      )}

      {/* Step 1: backup */}
      <section className={`${card} p-4 sm:p-5`}>
        <h3 className="font-bold flex items-center gap-2"><span className="mp-label text-slate-400">Step 1</span> Download a backup</h3>
        <p className="text-sm text-slate-500 mt-1">Keep a copy on your computer before deleting anything.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => backup('xlsx')} className="mp-btn mp-btn-dark min-h-[44px]"><Download className="w-4 h-4" /> Customers & leads (Excel)</button>
          <button type="button" onClick={() => backup('json')} className="mp-btn mp-btn-soft min-h-[44px]"><Download className="w-4 h-4" /> Full system backup (JSON)</button>
          {backedUp && <span className="self-center text-xs font-bold text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Backup downloaded</span>}
        </div>
      </section>

      {/* Step 2: choose */}
      <section className={`${card} p-4 sm:p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold flex items-center gap-2"><span className="mp-label text-slate-400">Step 2</span> Choose what to delete</h3>
          {groups && (
            <button type="button" onClick={() => setPicked(everything ? new Set() : new Set(allIds))} className="mp-btn mp-btn-soft min-h-[40px]">
              {everything ? 'Clear selection' : 'Select everything'}
            </button>
          )}
        </div>
        {!groups && !error && <p className="mt-4 text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Counting…</p>}
        {groups && (
          <ul className="mt-3 grid sm:grid-cols-2 gap-2 mp-stagger">
            {groups.map((g) => {
              const on = picked.has(g.id);
              return (
                <li key={g.id}>
                  <label className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition ${on ? 'border-red-300 bg-red-50/70' : 'border-slate-200 hover:border-slate-300'}`}>
                    <input type="checkbox" checked={on} onChange={() => toggle(g.id)} className="mt-0.5 w-5 h-5 accent-[#CC1A22]" />
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-bold text-sm">{g.label}</span>
                        <span className={`text-xs font-bold tabular-nums px-2 py-0.5 rounded-full ${g.count ? 'bg-slate-100 text-slate-700' : 'bg-slate-50 text-slate-400'}`}>
                          {g.count}{g.extra !== undefined ? ` + ${g.extra}` : ''}
                        </span>
                      </span>
                      <span className="block text-xs text-slate-500 mt-0.5">{g.note}</span>
                      {g.id === 'quotations' && on && (
                        <span className="mt-2 flex items-center gap-2 text-xs text-slate-600" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={resetNumbers} onChange={(e) => setResetNumbers(e.target.checked)} className="w-4 h-4 accent-[#CC1A22]" />
                          Restart quotation numbering
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {groups && <p className="mt-3 text-xs text-slate-500">"+" counts are linked items deleted with them (customer documents, product categories).</p>}
      </section>

      {/* Step 3: confirm */}
      <section className={`${card} p-4 sm:p-5`}>
        <h3 className="font-bold flex items-center gap-2"><span className="mp-label text-slate-400">Step 3</span> Confirm</h3>
        <div className="mt-3 grid sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="cleanup-confirm" className="text-xs font-bold text-slate-600">Type <b className="text-red-700">DELETE</b> to confirm</label>
            <input id="cleanup-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" spellCheck={false}
              className="mt-1 w-full h-11 px-4 rounded-full border border-slate-300 text-sm font-bold tracking-widest focus:border-red-500 focus:outline-none" placeholder="DELETE" />
          </div>
          <div>
            <label htmlFor="cleanup-password" className="text-xs font-bold text-slate-600">Your password</label>
            <div className="relative mt-1">
              <Lock className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input id="cleanup-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
                className="w-full h-11 pl-10 pr-4 rounded-full border border-slate-300 text-sm focus:border-red-500 focus:outline-none" />
            </div>
          </div>
        </div>
        {error && <p className="mt-3 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-2xl px-3 py-2" role="alert">{error}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" disabled={!ready} onClick={run} className="mp-btn mp-btn-red min-h-[48px] px-6 disabled:opacity-40 disabled:cursor-not-allowed">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            {picked.size === 0 ? 'Choose what to delete' : everything ? `Delete everything (${total})` : `Delete ${total} item${total === 1 ? '' : 's'}`}
          </button>
          {!backedUp && picked.size > 0 && <span className="text-xs text-amber-700 font-bold">You haven't downloaded a backup yet.</span>}
        </div>
        <p className="mt-3 text-xs text-slate-500 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Every cleanup is recorded in the security log with your name.</p>
      </section>
    </div>
  );
}
