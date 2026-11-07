import CountUp from '../components/ui/CountUp.jsx';
import React, { useEffect, useMemo, useState } from 'react';
import { openPrintable, chipsHtml, tableHtml } from '../utils/pdfReport.js';
import {
  AlertTriangle, CheckCircle2, ChevronRight, ContactRound, FileText, Link2, Plus, Upload, Phone, Clock, ShieldCheck, FileWarning,
  Users, Filter, TrendingUp, Trophy, PieChart,
} from 'lucide-react';
import { avatarStyle } from '../components/ui/BranchPicker.jsx';

/**
 * Super admin / manager home page: what needs attention today, then one row per salesman.
 * Built from data the app already has (leads, quotations) plus the customer summary.
 */

const DAY = 24 * 60 * 60 * 1000;
const card = 'bg-white rounded-[20px] border border-slate-200/90 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.06)]';
const initials = (s = '') => s.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const STAGE_FALLBACK = ['#64748B', '#2563EB', '#7C3AED', '#D97706', '#0E9F6E', '#D0121B'];
const omr = (n) => `OMR ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
const ago = (d) => {
  if (!d) return '—';
  const days = Math.floor((Date.now() - new Date(d).getTime()) / DAY);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
};

function Bar({ value }) {
  const v = Math.max(0, Math.min(100, value || 0));
  const color = v === 100 ? 'from-emerald-400 to-emerald-600' : v >= 50 ? 'from-amber-300 to-amber-600' : 'from-[#F04A51] to-[#C8102E]';
  return (
    <span className="flex items-center gap-2.5 min-w-[140px]">
      <span className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden" aria-hidden="true">
        <span className={`block h-1.5 rounded-full mp-bar bg-gradient-to-r ${color}`} style={{ width: `${Math.max(v, 2)}%` }} />
      </span>
      <span className="w-9 text-right text-xs font-bold tabular-nums">{v}%</span>
    </span>
  );
}

export default function Home({ authFetch, leads = [], quotations = [], pipelineStages = [], currentUser, onNavigate, onOpenCustomers, onNewLead, canManageCustomers }) {
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    let alive = true;
    authFetch('/api/customers/summary')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setSummary(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, [authFetch]);

  const now = Date.now();
  const open = (l) => !['won', 'lost'].includes(l.status);

  const stats = useMemo(() => {
    const openLeads = leads.filter(open);
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    return {
      newEnquiries: leads.filter((l) => l.status === 'new').length,
      stale: openLeads.filter((l) => l.status !== 'new' && now - new Date(l.updatedAt || l.date).getTime() > 7 * DAY).length,
      quotesWaiting: quotations.filter((q) => q.status === 'sent' && q.date && now - new Date(q.date).getTime() > 7 * DAY).length,
      openCount: openLeads.length,
      pipeline: openLeads.reduce((s, l) => s + Number(l.dealValue || 0), 0),
      wonMonth: leads.filter((l) => l.status === 'won' && new Date(l.updatedAt || l.date) >= monthStart).reduce((s, l) => s + Number(l.dealValue || 0), 0),
    };
  }, [leads, quotations, now]);

  const missingCr = summary?.missing?.find((m) => m.key === 'cr_paper')?.count || 0;
  const pending = summary?.totals?.pending_approval || 0;
  const linksOff = (summary?.salesmen || []).filter((s) => s.assigned > 0 && !s.linkEnabled).length;

  const todo = [
    { n: pending, icon: ShieldCheck, text: 'customers waiting for your approval', sub: 'New customers or possible duplicates sent by salesmen', go: () => onOpenCustomers({ status: 'pending_approval' }), show: canManageCustomers },
    { n: stats.newEnquiries, icon: Phone, text: 'new enquiries not called yet', sub: 'Call them and assign to a salesman', go: () => onNavigate('customercare'), show: true },
    { n: stats.stale, icon: Clock, text: 'open leads with no update for 7+ days', sub: 'Follow up with the salesman', go: () => onNavigate('leads'), show: true },
    { n: stats.quotesWaiting, icon: FileText, text: 'quotations sent 7+ days ago, no answer yet', sub: 'Call the customer', go: () => onNavigate('quotations'), show: true },
    { n: missingCr, icon: FileWarning, text: 'customers without CR paper', sub: 'Ask the salesman to upload it', go: () => onOpenCustomers({ missing: 'cr_paper' }), show: Boolean(summary) },
    { n: linksOff, icon: Link2, text: 'salesmen with customers but their link is off', sub: 'Switch on and send the link', go: () => onNavigate('settings-links'), show: canManageCustomers },
  ].filter((t) => t.show && t.n > 0);

  // One row per salesman: customer data + leads + quotations
  const rows = useMemo(() => {
    const map = new Map();
    (summary?.salesmen || []).forEach((s) => map.set(String(s.salesmanId), {
      id: String(s.salesmanId), name: s.name, type: s.type, customers: s.assigned, percent: s.percent ?? 0,
      openLeads: 0, won: 0, quotes: 0, last: s.lastActivity,
    }));
    leads.forEach((l) => {
      if (!l.salesmanId) return;
      const key = String(l.salesmanId);
      if (!map.has(key)) map.set(key, { id: key, name: l.salesman || 'Salesman', type: '', customers: 0, percent: 0, openLeads: 0, won: 0, quotes: 0, last: null });
      const r = map.get(key);
      if (open(l)) r.openLeads++;
      if (l.status === 'won') r.won += Number(l.dealValue || 0);
      const t = l.updatedAt || l.date;
      if (t && (!r.last || t > r.last)) r.last = t;
    });
    quotations.forEach((q) => {
      const r = [...map.values()].find((x) => x.name.trim().toLowerCase() === String(q.salesRep || '').trim().toLowerCase());
      if (r) r.quotes++;
    });
    return [...map.values()].sort((a, b) => b.openLeads - a.openLeads || b.customers - a.customers || a.name.localeCompare(b.name));
  }, [summary, leads, quotations]);

  const t = summary?.totals;

  // Charts (all from real data)
  const funnel = useMemo(() => {
    const ids = pipelineStages.length ? pipelineStages.map((st) => st.id) : [...new Set(leads.map((l) => l.status))];
    const list = ids.filter((id) => !['won', 'lost'].includes(id)).map((id, i) => {
      const st = pipelineStages.find((x) => x.id === id);
      const ls = leads.filter((l) => l.status === id);
      return { id, label: st?.label || String(id).replace(/[_-]+/g, ' ').replace(/^./, (c) => c.toUpperCase()), color: st?.color && /^#/.test(st.color) ? st.color : STAGE_FALLBACK[i % STAGE_FALLBACK.length], count: ls.length, value: ls.reduce((n, l) => n + Number(l.dealValue || 0), 0) };
    });
    const max = Math.max(1, ...list.map((x) => x.count));
    return { list, max };
  }, [leads, pipelineStages]);

  const week = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      days.push({ d, label: d.toLocaleDateString('en-GB', { weekday: 'short' }), n: 0 });
    }
    leads.forEach((l) => {
      const when = new Date(l.date || l.createdAt || 0); when.setHours(0, 0, 0, 0);
      const hit = days.find((x) => x.d.getTime() === when.getTime());
      if (hit) hit.n++;
    });
    const max = Math.max(1, ...days.map((x) => x.n));
    return { days, max, total: days.reduce((n, x) => n + x.n, 0) };
  }, [leads]);

  const ringPct = Math.max(0, Math.min(100, t?.percentComplete ?? 0));
  const R = 48, C = 2 * Math.PI * R;

  const exportPdf = () => {
    openPrintable({
      docType: 'Daily report',
      title: 'Sales & customer summary',
      subtitle: 'Customers, leads and salesmen as of today',
      meta: [['Open leads', stats.openCount]],
      bodyHtml: chipsHtml([
        ['Customers', t ? t.total : 0], ['Customer data complete', `${t?.percentComplete ?? 0}%`], ['Open leads', stats.openCount],
        ['Open pipeline (OMR)', stats.pipeline.toFixed(3)], ['Won this month (OMR)', stats.wonMonth.toFixed(3)],
      ])
        + '<h2>Needs attention</h2>' + tableHtml([{ label: 'Item' }, { label: 'Count', num: true }], todo.map((x) => [x.text, x.n]))
        + '<h2>Salesmen</h2>' + tableHtml(
          [{ label: 'Salesman' }, { label: 'Customers', num: true }, { label: 'Customer data', num: true }, { label: 'Open leads', num: true }, { label: 'Quotes', num: true }, { label: 'Won (OMR)', num: true }, { label: 'Last activity' }],
          rows.map((r) => [r.name, r.customers, r.customers ? `${r.percent}%` : '', r.openLeads, r.quotes, r.won ? r.won.toFixed(3) : '', ago(r.last)])
        ),
    });
  };
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const KPI = [
    { label: 'Customers', value: t ? t.total : '…', go: () => onOpenCustomers({}), icon: Users, tone: 'text-blue-600 bg-blue-50',
      foot: t && t.total ? (
        <span className="flex h-1.5 rounded-full overflow-hidden gap-0.5" title="Complete · in progress · not started · waiting approval">
          {[['complete', 'bg-emerald-500'], ['in_progress', 'bg-amber-400'], ['not_started', 'bg-slate-300'], ['pending_approval', 'bg-violet-500']].map(([k, c]) => (t[k] ? <i key={k} className={`${c} mp-bar`} style={{ flex: t[k] }} /> : null))}
        </span>
      ) : null },
    { label: 'Customer data complete', value: t ? `${t.percentComplete ?? 0}%` : '…', go: () => onOpenCustomers({}), icon: ShieldCheck, tone: 'text-amber-600 bg-amber-50',
      foot: <span className="block h-1.5 rounded-full bg-slate-100 overflow-hidden"><i className="block h-full rounded-full bg-gradient-to-r from-amber-300 to-amber-600 mp-bar" style={{ width: `${Math.max(2, ringPct)}%` }} /></span> },
    { label: 'Open leads', value: stats.openCount, go: () => onNavigate('leads'), icon: Filter, tone: 'text-violet-600 bg-violet-50',
      foot: <Spark values={week.days.map((x) => x.n)} color="#7C3AED" /> },
    { label: 'Open pipeline', value: omr(stats.pipeline), go: () => onNavigate('leads'), icon: TrendingUp, tone: 'text-[#D0121B] bg-red-50',
      foot: funnel.list.length ? (
        <span className="flex h-1.5 rounded-full overflow-hidden gap-0.5" title="Open value by stage">
          {funnel.list.filter((x) => x.value > 0).map((x) => <i key={x.id} className="mp-bar" style={{ flex: x.value, background: x.color }} />)}
          {!funnel.list.some((x) => x.value > 0) && <i className="flex-1 bg-slate-100" />}
        </span>
      ) : null },
    { label: 'Won this month', value: omr(stats.wonMonth), go: () => onNavigate('leads'), icon: Trophy, tone: 'text-emerald-600 bg-emerald-50', foot: null },
  ];

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-[1440px] mx-auto space-y-5 pb-24 md:pb-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] leading-tight font-extrabold text-slate-900">{hello}{currentUser?.name ? `, ${currentUser.name.split(' ')[0]}` : ''}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} · {todo.length ? `${todo.length} thing${todo.length === 1 ? '' : 's'} need${todo.length === 1 ? 's' : ''} you today` : 'nothing waiting for you'}
          </p>
        </div>
        <div className="flex gap-2 overflow-x-auto max-w-full pb-1 -mb-1">
          <button type="button" onClick={exportPdf} className="mp-btn mp-btn-line min-h-[40px] shrink-0"><FileText className="w-4 h-4" /> PDF report</button>
          {canManageCustomers && (
            <button type="button" onClick={() => onOpenCustomers({ tab: 'import' })} className="mp-btn mp-btn-line min-h-[40px] shrink-0"><Upload className="w-4 h-4" /> Import customers</button>
          )}
          <button type="button" onClick={() => onNavigate('quotations')} className="mp-btn mp-btn-line min-h-[40px] shrink-0"><FileText className="w-4 h-4" /> New quote</button>
          <button type="button" onClick={onNewLead} className="mp-btn mp-btn-red min-h-[40px] shrink-0"><Plus className="w-4 h-4" /> New enquiry</button>
        </div>
      </div>

      {/* KPI cards: horizontal swipe on phones */}
      <div className="flex sm:grid sm:grid-cols-3 lg:grid-cols-5 gap-3 overflow-x-auto sm:overflow-visible snap-x snap-mandatory -mx-3 px-3 sm:mx-0 sm:px-0 pb-1 mp-stagger mp-noscrollbar">
        {KPI.map(({ label, value, go, icon: Icon, tone, foot }) => (
          <button key={label} type="button" onClick={go} className={`${card} shrink-0 basis-[72%] sm:basis-auto snap-start p-4 text-left mp-lift`}>
            <span className="flex items-center gap-2">
              <span className={`w-7 h-7 rounded-lg grid place-items-center ${tone}`}><Icon className="w-4 h-4" /></span>
              <span className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-slate-400 truncate">{label}</span>
            </span>
            <span className={`block mt-2.5 leading-none font-extrabold tabular-nums truncate mp-display ${String(value).length > 16 ? 'text-[17px]' : String(value).length > 12 ? 'text-[20px]' : 'text-[24px]'}`} title={String(value)}><CountUp value={value} /></span>
            <span className="block mt-3 h-[30px]">{foot}</span>
          </button>
        ))}
      </div>

      <div className="mp-home-grid">
        <div className="space-y-5 min-w-0">
          {/* Priority inbox */}
          <section className={`${card} overflow-hidden`} aria-labelledby="todo-h">
            <div className="px-5 pt-4 pb-3 flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 text-[#CC1A22]" />
              <h2 id="todo-h" className="text-[15px] font-bold">Needs your attention</h2>
              {todo.length > 0 && <span className="text-[11.5px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-[#A3141C]">{todo.length} open</span>}
            </div>
            {todo.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-slate-600 flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-emerald-600" /> All clear. Nothing is waiting for you.</p>
            ) : (
              <ul className="mp-stagger">
                {todo.map(({ n, icon: Icon, text, sub, go }, i) => (
                  <li key={text} className="border-t border-slate-100">
                    <button type="button" onClick={go} className="group w-full px-5 py-3.5 flex items-center gap-4 text-left hover:bg-slate-50/80 transition">
                      <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${['bg-violet-50 text-violet-600', 'bg-amber-50 text-amber-600', 'bg-blue-50 text-blue-600', 'bg-red-50 text-[#CC1A22]', 'bg-emerald-50 text-emerald-600'][i % 5]}`}><Icon className="w-5 h-5" /></span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold"><strong className="text-[16px] font-extrabold tabular-nums mr-1 mp-display">{n}</strong>{n === 1 ? text.replace(/^(customers|enquiries|leads|quotations|salesmen)/, (w) => ({ customers: 'customer', enquiries: 'enquiry', leads: 'lead', quotations: 'quotation', salesmen: 'salesman' }[w])).replace('enquiries', 'enquiry').replace('open leads', 'open lead').replace('quotations sent', 'quotation sent').replace('customers without', 'customer without').replace('salesmen with', 'salesman with').replace('their link is off', 'his link is off') : text}</span>
                        <span className="block text-xs text-slate-500 mt-0.5">{sub}</span>
                      </span>
                      <span className="hidden sm:inline-flex items-center min-h-[32px] px-3.5 rounded-full text-xs font-bold bg-white border border-slate-200 shadow-xs group-hover:bg-slate-900 group-hover:text-white group-hover:border-slate-900 transition">Open</span>
                      <ChevronRight className="sm:hidden w-5 h-5 text-slate-400" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Pipeline by stage */}
          {funnel.list.length > 0 && (
            <section className={card} aria-labelledby="fn-h">
              <div className="px-5 pt-4 pb-2 flex items-center gap-2.5">
                <div className="flex-1 min-w-0"><h2 id="fn-h" className="text-[15px] font-bold">Pipeline by stage</h2><p className="text-xs text-slate-500">Open leads and value in each stage</p></div>
                <button type="button" onClick={() => onNavigate('leads')} className="mp-btn mp-btn-line min-h-[32px] text-xs">Open pipeline</button>
              </div>
              <div className="px-5 pb-5 pt-2 grid gap-2.5">
                {funnel.list.map((x, i) => (
                  <button key={x.id} type="button" onClick={() => onNavigate('leads')} className="mp-fn-row group">
                    <span className="flex items-center gap-2 text-[12.5px] font-semibold truncate"><i className="w-2 h-2 rounded-[3px] shrink-0" style={{ background: x.color }} />{x.label}</span>
                    <span className="relative h-7 rounded-lg bg-slate-50 overflow-hidden">
                      <i className="absolute inset-y-0 left-0 rounded-lg mp-bar group-hover:brightness-110 transition" style={{ width: `${Math.max(x.count ? 6 : 0, (x.count / funnel.max) * 100)}%`, background: `linear-gradient(90deg, ${x.color}cc, ${x.color})`, animationDelay: `${i * 70}ms` }} />
                      <span className={`absolute left-2.5 top-1/2 -translate-y-1/2 text-[11.5px] font-bold tabular-nums ${x.count ? 'text-white drop-shadow-sm' : 'text-slate-400'}`}>{x.count}</span>
                    </span>
                    <span className="text-right text-[12.5px] font-bold tabular-nums whitespace-nowrap">{omr(x.value)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-1 gap-5">
          {/* Customer data ring */}
          <section className={card} aria-labelledby="ring-h">
            <div className="px-5 pt-4"><h2 id="ring-h" className="text-[15px] font-bold">Customer data complete</h2><p className="text-xs text-slate-500">{t ? `All ${t.total} customers` : 'Loading…'}</p></div>
            <div className="flex items-center gap-5 px-5 pb-5 pt-3">
              <button type="button" onClick={() => onOpenCustomers({})} className="relative w-[120px] h-[120px] shrink-0 grid place-items-center" aria-label={`${ringPct}% complete`}>
                <svg width="120" height="120" className="-rotate-90" aria-hidden="true">
                  <defs><linearGradient id="mp-ring-g" x1="0" x2="1"><stop offset="0" stopColor="#F04A51" /><stop offset="1" stopColor="#9E0A22" /></linearGradient></defs>
                  <circle cx="60" cy="60" r={R} stroke="#EEF0F4" strokeWidth="12" fill="none" />
                  <circle cx="60" cy="60" r={R} stroke="url(#mp-ring-g)" strokeWidth="12" fill="none" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - ringPct / 100)} className="mp-ring" style={{ '--mp-ring-c': C }} />
                </svg>
                <span className="absolute text-center"><b className="block text-[28px] leading-none font-extrabold mp-display"><CountUp value={ringPct} /></b><small className="text-xs text-slate-500">% complete</small></span>
              </button>
              <div className="flex-1 grid gap-2 text-[12.5px] min-w-0">
                {[['Complete', t?.complete, 'from-emerald-400 to-emerald-600', { stage: 'complete' }], ['In progress', t?.in_progress, 'from-amber-300 to-amber-600', { stage: 'in_progress' }], ['Not started', t?.not_started, 'from-slate-300 to-slate-400', { stage: 'not_started' }], ['Waiting approval', t?.pending_approval, 'from-violet-400 to-violet-600', { status: 'pending_approval' }]].map(([l, n, g, f]) => (
                  <button key={l} type="button" onClick={() => onOpenCustomers(f)} className="text-left">
                    <span className="flex justify-between"><span>{l}</span><b className="tabular-nums">{n ?? 0}</b></span>
                    <span className="block mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden"><i className={`block h-full rounded-full bg-gradient-to-r ${g} mp-bar`} style={{ width: `${t?.total ? Math.max(n ? 3 : 0, ((n || 0) / t.total) * 100) : 0}%` }} /></span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Enquiries last 7 days */}
          <section className={card} aria-labelledby="wk-h">
            <div className="px-5 pt-4 flex items-start gap-2"><div className="flex-1"><h2 id="wk-h" className="text-[15px] font-bold">Enquiries this week</h2><p className="text-xs text-slate-500">New leads per day · {week.total} in 7 days</p></div><PieChart className="w-4 h-4 text-slate-300" /></div>
            <div className="flex items-end gap-2 h-[150px] px-5 pt-4 pb-4">
              {week.days.map((x, i) => (
                <div key={x.label + i} className="flex-1 h-full flex flex-col items-center justify-end gap-1.5 group">
                  <span className="text-[11px] font-bold tabular-nums text-slate-500 opacity-0 group-hover:opacity-100 transition">{x.n}</span>
                  <i className={`w-full max-w-[34px] rounded-t-lg rounded-b-sm mp-grow-y ${i === 6 ? 'bg-gradient-to-b from-[#F04A51] to-[#C8102E]' : 'bg-slate-200 group-hover:bg-slate-300'} transition-colors`} style={{ height: `${Math.max(x.n ? 8 : 3, (x.n / week.max) * 100)}%`, animationDelay: `${i * 60}ms` }} />
                  <span className={`text-[11px] font-semibold ${i === 6 ? 'text-slate-900' : 'text-slate-400'}`}>{i === 6 ? 'Today' : x.label}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* Salesmen leaderboard */}
      <section className={`${card} overflow-hidden`} aria-labelledby="team-h">
        <div className="px-5 pt-4 pb-3 flex items-center gap-2.5">
          <ContactRound className="w-5 h-5 text-slate-700" />
          <div className="flex-1"><h2 id="team-h" className="text-[15px] font-bold">Salesmen</h2><p className="text-xs text-slate-500">Open leads, customers and how complete their customer data is</p></div>
        </div>
        {/* phones: cards */}
        <ul className="sm:hidden divide-y divide-slate-100 border-t border-slate-100 mp-stagger">
          {rows.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-500">No salesman activity yet.</li>}
          {rows.map((r) => (
            <li key={r.id} className="px-4 py-3 flex items-center gap-3">
              <span className="w-9 h-9 rounded-full grid place-items-center text-[11px] font-bold text-white shrink-0" style={avatarStyle(r.name)}>{initials(r.name)}</span>
              <span className="flex-1 min-w-0">
                <span className="flex items-baseline justify-between gap-2"><b className="text-sm truncate">{r.name}</b><span className="text-[11px] text-slate-500 shrink-0">{ago(r.last)}</span></span>
                <span className="block text-[11.5px] text-slate-500">{r.customers} customers · {r.openLeads} open leads · {r.quotes} quotes</span>
                {r.customers > 0 && <span className="block mt-1.5"><Bar value={r.percent} /></span>}
              </span>
              {canManageCustomers && <button type="button" onClick={() => onOpenCustomers({ salesmanId: r.id })} className="w-9 h-9 grid place-items-center rounded-xl border border-slate-200 text-slate-500" aria-label={`${r.name}'s customers`}><ChevronRight className="w-4 h-4" /></button>}
            </li>
          ))}
        </ul>
        <div className="hidden sm:block overflow-x-auto border-t border-slate-100">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/80 text-[10.5px] uppercase tracking-[0.08em] text-slate-400">
              <tr>
                {['Salesman', 'Customers', 'Customer data', 'Open leads', 'Quotes', 'Won (OMR)', 'Last activity', ''].map((h) => (
                  <th key={h} className="text-left font-bold px-4 py-2.5 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="mp-stagger divide-y divide-slate-100">
              {rows.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-500">No salesman activity yet.</td></tr>}
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="flex items-center gap-2.5">
                      <span className="w-8 h-8 rounded-full grid place-items-center text-[11px] font-bold text-white shrink-0" style={avatarStyle(r.name)}>{initials(r.name)}</span>
                      <span><b className="font-semibold">{r.name}</b>{r.type && <span className="block text-[11px] font-normal text-slate-500">{r.type === 'branch' ? 'Branch' : 'Route / B2B'}</span>}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums font-semibold">{r.customers}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{r.customers ? <Bar value={r.percent} /> : <span className="text-xs text-slate-400">—</span>}</td>
                  <td className="px-4 py-3 tabular-nums">{r.openLeads ? <span className="text-[11.5px] font-bold px-2 py-0.5 rounded-full bg-violet-50 text-violet-700">{r.openLeads}</span> : <span className="text-slate-400">0</span>}</td>
                  <td className="px-4 py-3 tabular-nums">{r.quotes}</td>
                  <td className="px-4 py-3 tabular-nums whitespace-nowrap">{r.won ? r.won.toFixed(3) : '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{ago(r.last)}</td>
                  <td className="px-4 py-3 text-right">
                    {canManageCustomers && (
                      <button type="button" onClick={() => onOpenCustomers({ salesmanId: r.id })} className="mp-btn mp-btn-line min-h-[32px] text-xs">Customers</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/** Tiny area chart for KPI cards */
function Spark({ values = [], color = '#D0121B' }) {
  const w = 120, h = 30, max = Math.max(1, ...values), step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map((v, i) => [i * step, h - 3 - (v / max) * (h - 8)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const id = `sp${color.replace('#', '')}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-[30px]" aria-hidden="true">
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".22" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      {values.length > 1 && <path d={`${d} L${w} ${h} L0 ${h}Z`} fill={`url(#${id})`} />}
      {values.length > 1 && <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" className="mp-draw" />}
    </svg>
  );
}
