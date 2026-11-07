import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Target, Loader2, Save, Copy, ChevronLeft, ChevronRight } from 'lucide-react';
import { avatarStyle } from '../components/ui/BranchPicker.jsx';

/**
 * Monthly sales targets per salesman (Settings → Sales targets).
 * Progress = value of leads moved to "Won" during the month. Shown on Home in the salesmen table.
 */
const card = 'bg-white rounded-3xl border border-slate-200 shadow-[0_1px_3px_rgba(16,24,40,0.06)]';
const ymOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const shift = (ym, n) => { const [y, m] = ym.split('-').map(Number); return ymOf(new Date(y, m - 1 + n, 1)); };
const monthName = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }); };
const initials = (s = '') => s.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export default function SalesTargets({ authFetch, showToast }) {
  const [month, setMonth] = useState(() => ymOf(new Date()));
  const [rows, setRows] = useState(null);
  const [edits, setEdits] = useState({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (ym) => {
    setRows(null); setEdits({});
    try {
      const r = await authFetch(`/api/sales-targets?month=${ym}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not load targets');
      setRows(d.rows);
    } catch (e) { showToast?.(e.message, 'error'); setRows([]); }
  }, [authFetch, showToast]);
  useEffect(() => { load(month); }, [month, load]);

  const value = (r) => (edits[r.salesmanId] !== undefined ? edits[r.salesmanId] : r.targetOmr ? String(r.targetOmr) : '');
  const dirty = Object.keys(edits).length > 0;
  const totals = useMemo(() => (rows || []).reduce((t, r) => ({ target: t.target + (Number(value(r)) || 0), won: t.won + r.wonOmr }), { target: 0, won: 0 }), [rows, edits]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setBusy(true);
    try {
      const targets = Object.entries(edits).map(([salesmanId, v]) => ({ salesmanId, targetOmr: Number(v) || 0 }));
      const r = await authFetch('/api/sales-targets', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month, targets }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not save');
      setRows(d.rows); setEdits({});
      showToast?.('Targets saved');
    } catch (e) { showToast?.(e.message, 'error'); }
    setBusy(false);
  };

  const copyLastMonth = async () => {
    try {
      const r = await authFetch(`/api/sales-targets?month=${shift(month, -1)}`);
      const d = await r.json();
      const next = {};
      d.rows.forEach((x) => { if (x.targetOmr > 0) next[x.salesmanId] = String(x.targetOmr); });
      if (!Object.keys(next).length) { showToast?.('Last month has no targets', 'error'); return; }
      setEdits(next);
    } catch { showToast?.('Could not copy last month', 'error'); }
  };

  const pct = totals.target ? Math.round((totals.won / totals.target) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-[24px] leading-tight font-extrabold text-slate-900 flex items-center gap-2"><Target className="w-6 h-6 text-[#CC1A22]" /> Sales targets</h1>
          <p className="text-sm text-slate-500 mt-0.5">A monthly OMR target for each salesman. Progress counts leads moved to “Won” in that month.</p>
        </div>
        <div className="flex items-center gap-1 p-1 rounded-xl bg-white border border-slate-200">
          <button type="button" onClick={() => setMonth(shift(month, -1))} className="w-9 h-9 grid place-items-center rounded-lg hover:bg-slate-100" aria-label="Previous month"><ChevronLeft className="w-4 h-4" /></button>
          <span className="px-2 text-sm font-bold min-w-[130px] text-center">{monthName(month)}</span>
          <button type="button" onClick={() => setMonth(shift(month, 1))} className="w-9 h-9 grid place-items-center rounded-lg hover:bg-slate-100" aria-label="Next month"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      <div className={`${card} p-4 sm:p-5 grid grid-cols-3 gap-3`}>
        <div><span className="block text-[10.5px] font-bold uppercase tracking-[0.09em] text-slate-400">Team target</span><b className="text-xl mp-display tabular-nums">OMR {totals.target.toLocaleString('en-US', { maximumFractionDigits: 0 })}</b></div>
        <div><span className="block text-[10.5px] font-bold uppercase tracking-[0.09em] text-slate-400">Won so far</span><b className="text-xl mp-display tabular-nums">OMR {totals.won.toLocaleString('en-US', { maximumFractionDigits: 0 })}</b></div>
        <div>
          <span className="block text-[10.5px] font-bold uppercase tracking-[0.09em] text-slate-400">Progress</span>
          <b className="text-xl mp-display tabular-nums">{pct}%</b>
          <span className="block mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden"><i className="block h-full rounded-full bg-gradient-to-r from-[#F04A51] to-[#C8102E] mp-bar" style={{ width: `${Math.min(100, Math.max(pct ? 2 : 0, pct))}%` }} /></span>
        </div>
      </div>

      <section className={`${card} overflow-hidden`}>
        <div className="px-4 sm:px-5 py-3 flex flex-wrap items-center gap-2 border-b border-slate-100">
          <h2 className="text-[15px] font-bold flex-1">Salesmen</h2>
          <button type="button" onClick={copyLastMonth} className="mp-btn mp-btn-line min-h-[36px] text-xs"><Copy className="w-3.5 h-3.5" /> Copy last month</button>
          <button type="button" onClick={save} disabled={!dirty || busy} className="mp-btn mp-btn-red min-h-[36px] text-xs disabled:opacity-40">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save targets
          </button>
        </div>
        {!rows ? (
          <p className="p-6 text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</p>
        ) : !rows.length ? (
          <p className="p-6 text-sm text-slate-500">No salesmen yet. Add them under Settings → Salesmen & links.</p>
        ) : (
          <ul className="divide-y divide-slate-100 mp-stagger">
            {rows.map((r) => {
              const t = Number(value(r)) || 0;
              const p = t ? Math.round((r.wonOmr / t) * 100) : 0;
              return (
                <li key={r.salesmanId} className="px-4 sm:px-5 py-3 grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_180px_220px] items-center gap-x-3 gap-y-2">
                  <span className="w-9 h-9 rounded-full grid place-items-center text-[11px] font-bold text-white" style={avatarStyle(r.name)}>{initials(r.name)}</span>
                  <span className="min-w-0"><b className="block text-sm truncate">{r.name}</b><small className="text-xs text-slate-500">{r.wonDeals} won deal{r.wonDeals === 1 ? '' : 's'} · OMR {r.wonOmr.toFixed(3)}</small></span>
                  <label className="col-span-2 sm:col-span-1 flex h-10 rounded-xl border border-slate-200 bg-white overflow-hidden focus-within:border-red-500">
                    <span className="inline-flex items-center px-2.5 text-[11px] font-bold text-slate-500 bg-slate-50 border-r border-slate-200">OMR</span>
                    <input type="number" inputMode="decimal" min="0" step="1" placeholder="No target" value={value(r)} aria-label={`Target for ${r.name}`}
                      onChange={(e) => setEdits((x) => ({ ...x, [r.salesmanId]: e.target.value }))} className="flex-1 min-w-0 px-2.5 text-sm outline-none bg-transparent tabular-nums" />
                  </label>
                  <span className="col-span-2 sm:col-span-1 flex items-center gap-2">
                    <span className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden"><i className={`block h-full rounded-full mp-bar bg-gradient-to-r ${p >= 100 ? 'from-emerald-400 to-emerald-600' : p >= 50 ? 'from-amber-300 to-amber-600' : 'from-[#F04A51] to-[#C8102E]'}`} style={{ width: `${t ? Math.min(100, Math.max(2, p)) : 0}%` }} /></span>
                    <b className="w-11 text-right text-xs tabular-nums">{t ? `${p}%` : '—'}</b>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
