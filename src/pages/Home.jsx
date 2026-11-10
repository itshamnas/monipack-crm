import { lostReasonLabel } from '../utils/lostReasons.js';
import { effectiveQuoteStatus } from '../components/QuoteStatus.jsx';
import CountUp from '../components/ui/CountUp.jsx';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { openPrintable, chipsHtml, tableHtml } from '../utils/pdfReport.js';
import {
  AlertTriangle, CheckCircle2, ChevronRight, ContactRound, FileText, Link2, Plus, Upload, Phone, Clock, ShieldCheck, FileWarning,
  Users, Filter, TrendingUp, Trophy, PieChart, CalendarClock, Target, ListChecks, Building2, Store, Truck,
} from 'lucide-react';
import Avatar from '../components/ui/Avatar.jsx';

/**
 * Super admin / manager home page: what needs attention today, then one row per salesman.
 * Built from data the app already has (leads, quotations) plus the customer summary.
 */

const DAY = 24 * 60 * 60 * 1000;
const card = 'bg-white rounded-[20px] border border-slate-200/90 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.06)]';
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

export default function Home({ authFetch, leads = [], quotations = [], pipelineStages = [], currentUser, onNavigate, onOpenCustomers, onNewLead, canManageCustomers, taskDue = 0, branches = [] }) {
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    let alive = true;
    authFetch('/api/customers/summary')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setSummary(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, [authFetch]);

  // Monthly sales targets (managers and super admin)
  const [targets, setTargets] = useState(null);
  useEffect(() => {
    if (!canManageCustomers) return undefined;
    let alive = true;
    authFetch('/api/sales-targets').then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive) setTargets(d); }).catch(() => {});
    return () => { alive = false; };
  }, [authFetch, canManageCustomers]);
  const targetBy = useMemo(() => Object.fromEntries((targets?.rows || []).map((t) => [String(t.salesmanId), t])), [targets]);
  const hasTargets = (targets?.rows || []).some((t) => t.targetOmr > 0);

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
      followUps: openLeads.filter((l) => { if (!l.nextFollowUpAt) return false; const end = new Date(); end.setHours(23, 59, 59, 999); return new Date(l.nextFollowUpAt) <= end; }).length,
      pipeline: openLeads.reduce((s, l) => s + Number(l.dealValue || 0), 0),
      wonMonth: leads.filter((l) => l.status === 'won' && new Date(l.updatedAt || l.date) >= monthStart).reduce((s, l) => s + Number(l.dealValue || 0), 0),
    };
  }, [leads, quotations, now]);

  const missingCr = summary?.missing?.find((m) => m.key === 'cr_paper')?.count || 0;
  const pending = summary?.totals?.pending_approval || 0;
  const linksOff = (summary?.salesmen || []).filter((s) => s.assigned > 0 && !s.linkEnabled).length;

  const todoBase = [
    { n: pending, icon: ShieldCheck, text: 'customers waiting for your approval', sub: 'New customers or possible duplicates sent by salesmen', go: () => onOpenCustomers({ status: 'pending_approval' }), show: canManageCustomers },
    { n: taskDue, icon: ListChecks, text: 'of your tasks are due today or overdue', sub: 'Open your task list', go: () => onNavigate('tasks'), show: true },
    { n: stats.followUps, icon: CalendarClock, text: 'follow-ups due today or overdue', sub: 'Open the pipeline showing only these', go: () => { try { sessionStorage.setItem('mp_followups', '1'); } catch { /* ignore */ } onNavigate('leads'); }, show: true },
    { n: stats.newEnquiries, icon: Phone, text: 'new enquiries not called yet', sub: 'Call them and assign to a salesman', go: () => onNavigate('customercare'), show: true },
    { n: stats.stale, icon: Clock, text: 'open leads with no update for 7+ days', sub: 'Follow up with the salesman', go: () => onNavigate('leads'), show: true },
    { n: stats.quotesWaiting, icon: FileText, text: 'quotations sent 7+ days ago, no answer yet', sub: 'Call the customer', go: () => onNavigate('quotations'), show: true },
    { n: missingCr, icon: FileWarning, text: 'customers without CR paper', sub: 'Ask the salesman to upload it', go: () => onOpenCustomers({ missing: 'cr_paper' }), show: Boolean(summary) },
    { n: linksOff, icon: Link2, text: 'salesmen with customers but their link is off', sub: 'Switch on and send the link', go: () => onNavigate('settings-links'), show: canManageCustomers },
  ];

  // One row per salesman: customer data + leads + quotations
  const rows = useMemo(() => {
    const map = new Map();
    (summary?.salesmen || []).forEach((s) => map.set(String(s.salesmanId), {
      id: String(s.salesmanId), name: s.name, type: s.type, photoUrl: s.photoUrl, branchName: s.branchName, customers: s.assigned, percent: s.percent ?? 0,
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

  // Retail (shops) vs B2B (route / wholesale): by the lead's branch, else by the salesman's type
  const split = useMemo(() => {
    const byBranch = new Map(branches.map((b) => [String(b.name || '').trim().toLowerCase(), b.type]));
    const bySm = new Map((summary?.salesmen || []).map((s) => [String(s.salesmanId), s.branchType || (s.type === 'route_b2b' ? 'b2b' : s.type === 'branch' ? 'retail' : null)]));
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const z = () => ({ open: 0, pipeline: 0, wonMonth: 0, won: 0, closed: 0 });
    const seg = { retail: z(), b2b: z() };
    let unknown = 0;
    leads.forEach((l) => {
      const k = byBranch.get(String(l.branch || '').trim().toLowerCase()) || (l.salesmanId ? bySm.get(String(l.salesmanId)) : null);
      if (!seg[k]) { unknown++; return; }
      const g = seg[k];
      if (open(l)) { g.open++; g.pipeline += Number(l.dealValue || 0); }
      if (l.status === 'won') { g.won++; g.closed++; if (new Date(l.updatedAt || l.date) >= monthStart) g.wonMonth += Number(l.dealValue || 0); }
      if (l.status === 'lost') g.closed++;
    });
    return { seg, unknown, any: seg.retail.open + seg.retail.closed + seg.b2b.open + seg.b2b.closed > 0 };
  }, [branches, summary, leads]);

  // Coaching nudge: salesmen with open leads who have gone quiet for 3+ days
  const quietReps = rows.filter((r) => r.openLeads > 0 && (!r.last || Date.now() - new Date(r.last).getTime() > 3 * 86400000)).length;
  const todo = [
    { n: 1, icon: ShieldCheck, text: 'turn on 2-step login for your super admin account', sub: 'Protects the account that can change everything', go: () => onNavigate('settings-security'), show: currentUser?.role === 'super_admin' && currentUser?.twoFactorEnabled === false },
    ...todoBase,
    { n: quietReps, icon: Users, text: 'salesmen with open leads but no update for 3+ days', sub: 'A quick call keeps the team moving', go: () => onNavigate('leads'), show: true },
  ].filter((x) => x.show && x.n > 0);

  // Why deals are lost (last 90 days) and how quotations end
  const lostWhy = useMemo(() => {
    const from = Date.now() - 90 * 86400000; const m = new Map(); let n = 0;
    leads.forEach((l) => {
      if (l.status !== 'lost' || new Date(l.updatedAt || l.date || 0).getTime() < from) return;
      n++; const k = lostReasonLabel(l.lostReason); m.set(k, (m.get(k) || 0) + 1);
    });
    const rowsL = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    return { n, rows: rowsL.map(([k, v]) => ({ k, v, w: n ? (v / n) * 100 : 0 })) };
  }, [leads]);
  const quoteRes = useMemo(() => {
    const c = { draft: 0, sent: 0, expired: 0, accepted: 0, rejected: 0 }; let value = 0;
    quotations.forEach((q) => { const s = effectiveQuoteStatus(q); c[s] = (c[s] || 0) + 1; if (s === 'accepted') value += Number(q.grandTotalOMR || 0); });
    const decided = c.accepted + c.rejected;
    return { c, value, rate: decided ? (c.accepted / decided) * 100 : null };
  }, [quotations]);

  // Team today (shown in the header line)
  const teamToday = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0); const s0 = start.getTime();
    let added = 0; let won = 0;
    leads.forEach((l) => {
      if (new Date(l.createdAt || l.date || 0).getTime() >= s0) added++;
      if (l.status === 'won' && new Date(l.updatedAt || 0).getTime() >= s0) won++;
    });
    return { added, won };
  }, [leads]);

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

  // ---- Command-centre analytics (all from the same leads data) ----
  const [period, setPeriod] = useState('30');
  const [channel, setChannel] = useState('all');
  const [stepSel, setStepSel] = useState(1);
  const [cohRow, setCohRow] = useState(null);
  const [bdBy, setBdBy] = useState('source');

  const leadTime = (l) => new Date(l.date || l.createdAt || 0).getTime();
  const sources = useMemo(() => {
    const m = new Map();
    leads.forEach((l) => { const k = (l.source || '').trim() || 'Other'; m.set(k, (m.get(k) || 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k], i) => ({ id: k, color: ['#5B7CFA', '#34D399', '#FBBF24', '#F472B6', '#A78BFA'][i] }));
  }, [leads]);
  const inChannel = (l) => channel === 'all' || ((l.source || '').trim() || 'Other') === channel;

  const conv = useMemo(() => {
    const order = (pipelineStages.length ? pipelineStages.map((x) => x.id) : ['new', 'contacted', 'quoted', 'negotiation', 'won']).filter((id) => id !== 'lost');
    if (!order.includes('won')) order.push('won');
    const label = (id) => pipelineStages.find((x) => x.id === id)?.label || String(id).replace(/[_-]+/g, ' ').replace(/^./, (c) => c.toUpperCase());
    const days = period === 'all' ? null : Number(period);
    const nowT = Date.now();
    const curFrom = days ? nowT - days * DAY : -Infinity;
    const prevFrom = days ? nowT - 2 * days * DAY : null;
    const cur = []; const prev = [];
    leads.forEach((l) => {
      if (!inChannel(l)) return;
      const t = leadTime(l);
      if (t >= curFrom) cur.push(l); else if (prevFrom !== null && t >= prevFrom) prev.push(l);
    });
    const reach = (list) => {
      const r = order.map(() => 0);
      list.forEach((l) => { if (l.status === 'lost') return; const i = order.indexOf(l.status); for (let k = 0; k <= Math.max(0, i); k++) r[k]++; });
      return r;
    };
    const rc = reach(cur); const rp = reach(prev);
    const start = rc[0] || 0; const pstart = rp[0] || 0;
    const won = cur.filter((l) => l.status === 'won').length;
    const pwon = prev.filter((l) => l.status === 'won').length;
    return {
      order, cur,
      steps: order.map((id, i) => ({ id, label: label(id), n: rc[i], pct: start ? (rc[i] / start) * 100 : 0, prevPct: pstart ? (rp[i] / pstart) * 100 : null })),
      overall: cur.length ? (won / cur.length) * 100 : 0,
      prevOverall: prev.length ? (pwon / prev.length) * 100 : null,
      total: cur.length, prevTotal: prev.length,
    };
  }, [leads, pipelineStages, period, channel]); // eslint-disable-line react-hooks/exhaustive-deps

  const sel = Math.min(stepSel, conv.steps.length - 1);
  const breakdown = useMemo(() => {
    const step = conv.steps[sel]; if (!step) return [];
    const idxOf = (l) => conv.order.indexOf(l.status);
    const reached = conv.cur.filter((l) => l.status !== 'lost' && idxOf(l) >= sel);
    const m = new Map();
    reached.forEach((l) => { const k = bdBy === 'source' ? ((l.source || '').trim() || 'Other') : (l.salesman || 'Not assigned'); m.set(k, (m.get(k) || 0) + 1); });
    const max = Math.max(1, ...m.values());
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7).map(([k, n]) => ({ k, n, w: (n / max) * 100 }));
  }, [conv, sel, bdBy]);

  const cohort = useMemo(() => {
    const nowD = new Date(); const curKey = nowD.getFullYear() * 12 + nowD.getMonth();
    const rowsC = [];
    for (let i = 11; i >= 0; i--) {
      const key = curKey - i;
      rowsC.push({ key, label: new Date(Math.floor(key / 12), key % 12, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }), n: 0, wonAt: [] });
    }
    const byKey = new Map(rowsC.map((r) => [r.key, r]));
    leads.forEach((l) => {
      if (!inChannel(l)) return;
      const d = new Date(leadTime(l)); const r = byKey.get(d.getFullYear() * 12 + d.getMonth()); if (!r) return;
      r.n++;
      if (l.status === 'won') { const w = new Date(l.updatedAt || l.date); r.wonAt.push(Math.max(0, w.getFullYear() * 12 + w.getMonth() - r.key)); }
    });
    rowsC.forEach((r) => {
      r.cells = Array.from({ length: 12 }, (_, k) => (r.key + k > curKey || !r.n ? null : (r.wonAt.filter((x) => x <= k).length / r.n) * 100));
    });
    const avgAt = (k) => { const v = rowsC.map((r) => r.cells[k]).filter((x) => x !== null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; };
    const best = rowsC.filter((r) => r.n >= 3).map((r) => ({ r, v: r.cells.filter((x) => x !== null).slice(-1)[0] ?? 0 })).sort((a, b) => b.v - a.v)[0];
    const maxV = Math.max(1, ...rowsC.flatMap((r) => r.cells.filter((x) => x !== null)));
    return { rows: rowsC, m1: avgAt(0), m3: avgAt(2), m6: avgAt(5), best, maxV };
  }, [leads, channel]); // eslint-disable-line react-hooks/exhaustive-deps

  const monthStartT = (() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime(); })();
  const prevMonthStartT = (() => { const d = new Date(monthStartT); d.setMonth(d.getMonth() - 1); return d.getTime(); })();
  const wonPrevMonth = useMemo(() => leads.filter((l) => { if (l.status !== 'won') return false; const t = new Date(l.updatedAt || l.date).getTime(); return t >= prevMonthStartT && t < monthStartT; }).reduce((s, l) => s + Number(l.dealValue || 0), 0), [leads, prevMonthStartT, monthStartT]);
  const delta = (cur, prev) => {
    if (prev === null || prev === undefined) return null;
    if (!prev) return cur ? { dir: 'up', t: 'new' } : { dir: 'flat', t: '0%' };
    const d = ((cur - prev) / prev) * 100;
    return { dir: d > 0.5 ? 'up' : d < -0.5 ? 'down' : 'flat', t: `${d > 0 ? '+' : ''}${d.toFixed(1)}%` };
  };
  const plural = (n, text) => (n === 1 ? text.replace(/^(customers|enquiries|leads|quotations|salesmen)/, (w) => ({ customers: 'customer', enquiries: 'enquiry', leads: 'lead', quotations: 'quotation', salesmen: 'salesman' }[w])).replace('enquiries', 'enquiry').replace('open leads', 'open lead').replace('quotations sent', 'quotation sent').replace('customers without', 'customer without').replace('salesmen with', 'salesman with').replace('their link is off', 'his link is off').replace('follow-ups due', 'follow-up due') : text);
  const periodLabel = period === 'all' ? 'all time' : `the last ${period} days`;
  const omrShort = (n) => { const v = Number(n || 0); return v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v >= 1e4 ? `${(v / 1e3).toFixed(1)}k` : v.toLocaleString('en-US', { maximumFractionDigits: 3 }); };

  const KPI = [
    { label: 'Open pipeline', pre: 'OMR', value: omrShort(stats.pipeline), title: omr(stats.pipeline), go: () => onNavigate('leads'), icon: TrendingUp, hero: true,
      foot: <span>{stats.openCount} open leads</span> },
    { label: 'Won this month', pre: 'OMR', value: omrShort(stats.wonMonth), title: omr(stats.wonMonth), go: () => onNavigate('leads'), icon: Trophy,
      foot: <><span>vs last month</span>{(() => { const d = delta(stats.wonMonth, wonPrevMonth); return d && <span className={`mpd-delta ${d.dir}`}>{d.t}</span>; })()}</> },
    { label: 'New enquiries', value: conv.total, go: () => onNavigate('leads'), icon: Filter,
      foot: <><Spark values={week.days.map((x) => x.n)} color="#8FA6FF" />{(() => { const d = delta(conv.total, period === 'all' ? null : conv.prevTotal); return d && <span className={`mpd-delta ${d.dir}`}>{d.t}</span>; })()}</> },
    { label: 'Customers', value: t ? t.total : '…', go: () => onOpenCustomers({}), icon: Users,
      foot: <span>{t?.pending_approval ? `${t.pending_approval} waiting approval` : 'all approved'}</span> },
    { label: 'Data complete', value: t ? `${t.percentComplete ?? 0}%` : '…', go: () => onOpenCustomers({}), icon: ShieldCheck,
      foot: <span className="mpd-track" style={{ flex: 1 }}><i style={{ width: `${Math.max(2, ringPct)}%`, background: 'linear-gradient(90deg,#34D399,#A7F3D0)' }} /></span> },
  ];

  return (
    <div className="p-0 sm:p-3 lg:p-4 min-h-full">
      <div className="mpd">
        <div className="mpd-wrap space-y-4">
          {/* Header */}
          <div className="flex flex-wrap items-end gap-3 mpd-in">
            <div className="mr-auto min-w-0">
              <div className="mpd-crumb">Home <ChevronRight className="w-3 h-3" /> <b>Command centre</b> <span className="mpd-live ml-2"><i />Live</span></div>
              <h1 className="mpd-title mt-2">{hello}{currentUser?.name ? `, ${currentUser.name.split(' ')[0]}` : ''}</h1>
              <p className="mpd-sub">
                {conv.total.toLocaleString()} enquiries in {periodLabel} · enquiry to won <span className="mpd-hl">{conv.overall.toFixed(2)}%</span>
                {todo.length ? <> · <b>{todo.length}</b> thing{todo.length === 1 ? '' : 's'} need{todo.length === 1 ? 's' : ''} you</> : ' · nothing waiting'}
                {(teamToday.added > 0 || teamToday.won > 0) && <> · today <b>{teamToday.added}</b> new{teamToday.won ? <>, <b>{teamToday.won}</b> won</> : null}</>}
              </p>
            </div>
            <div className="flex gap-2 overflow-x-auto max-w-full mpd-chips">
              <Seg value={period} onChange={setPeriod} options={[['30', '30 days'], ['90', '90 days'], ['all', 'All time']]} />
              <button type="button" onClick={exportPdf} className="mpd-btn"><FileText />PDF</button>
              {canManageCustomers && <button type="button" onClick={() => onOpenCustomers({ tab: 'import' })} className="mpd-btn"><Upload />Import</button>}
              <button type="button" onClick={() => onNavigate('quotations')} className="mpd-btn"><FileText />New quote</button>
              <button type="button" onClick={onNewLead} className="mpd-btn mpd-btn-pri"><Plus />New enquiry</button>
            </div>
          </div>

          {/* KPIs */}
          <div className="mpd-kpis mpd-in">
            {KPI.map(({ label, pre, value, title, go, icon: Icon, hero, foot }) => (
              <button key={label} type="button" onClick={go} className={`mpd-card mpd-kpi ${hero ? 'is-hero' : ''}`} title={title}>
                <span className="mpd-kpi-l"><Icon />{label}</span>
                <span className="mpd-kpi-v">{pre && <small>{pre}</small>}<CountUp value={value} /></span>
                <span className="mpd-kpi-f">{foot}</span>
              </button>
            ))}
          </div>

          <div className="mpd-grid">
            {/* Attention list (like saved funnels) */}
            <section className="mpd-card" aria-labelledby="att-h">
              <div className="mpd-card-h"><div className="flex-1"><p className="mpd-eyebrow" id="att-h">Needs your attention</p></div>{todo.length > 0 && <span className="mpd-delta down">{todo.length}</span>}</div>
              {todo.length === 0 ? (
                <p className="px-4 pb-5 pt-2 text-[12.5px] mpd-mute flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> All clear. Nothing is waiting for you.</p>
              ) : (
                <div className="mpd-list mpd-in">
                  {todo.map(({ n, icon: Icon, text, sub, go }, i) => (
                    <button key={text} type="button" onClick={go} className={`mpd-item ${i === 0 ? 'is-on' : ''}`}>
                      <span className="mpd-item-t"><span className="flex items-center gap-2 min-w-0"><Icon className="w-3.5 h-3.5 shrink-0 opacity-70" /><span className="truncate">{plural(n, text).replace(/^./, (c) => c.toUpperCase())}</span></span><b>{n}</b></span>
                      <span className="mpd-item-s block truncate">{sub}</span>
                      <span className="mpd-minibars" aria-hidden="true">{[0.9, 0.6, 0.75, 0.45, 0.55, 0.3].map((h, k) => <i key={k} style={{ height: `${Math.max(15, h * Math.min(100, 30 + n * 6))}%`, opacity: 1 - k * 0.12 }} />)}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* Conversion funnel */}
            <section className="mpd-card overflow-hidden" aria-labelledby="fn-h">
              <div className="mpd-card-h flex-wrap">
                <div className="flex-1 min-w-[180px]"><h2 id="fn-h">Enquiry to won</h2><p>Leads that reached each stage in {periodLabel}. Dashed line: previous period.</p></div>
                <button type="button" onClick={() => onNavigate('leads')} className="mpd-btn" style={{ height: 30 }}>Open pipeline <ChevronRight className="w-3.5 h-3.5" /></button>
              </div>
              <div className="px-4 pb-2">
                <div className="mpd-chips" role="group" aria-label="Lead source">
                  <button type="button" className="mpd-chip" aria-pressed={channel === 'all'} onClick={() => setChannel('all')}>All sources</button>
                  {sources.map((s) => <button key={s.id} type="button" className="mpd-chip" aria-pressed={channel === s.id} onClick={() => setChannel(s.id)}><i style={{ background: s.color }} />{s.id}</button>)}
                </div>
              </div>
              <div className="mpd-fn">
                {conv.steps.map((s, i) => (
                  <button key={s.id} type="button" className={`mpd-step ${sel === i ? 'is-on' : ''}`} onClick={() => setStepSel(i)} aria-pressed={sel === i}>
                    <span className="mpd-step-n block">{i + 1}. {s.label}</span>
                    <span className="mpd-step-v block"><CountUp value={s.n} /></span>
                    <span className="mpd-step-p block">{s.pct.toFixed(i ? 1 : 0)}% of start</span>
                    <span className="mpd-col block">
                      <i className="mpd-col-fill" style={{ height: `${Math.max(s.n ? 3 : 0, s.pct)}%`, animationDelay: `${i * 70}ms` }} />
                      {s.prevPct !== null && <i className="mpd-col-tick" style={{ bottom: `${s.prevPct}%` }} title={`Previous period: ${s.prevPct.toFixed(1)}%`} />}
                    </span>
                  </button>
                ))}
              </div>
              <div className="mpd-fn-foot">
                <span>Overall <b>{conv.overall.toFixed(2)}%</b></span>
                {conv.prevOverall !== null && period !== 'all' && <span>Last period <b>{conv.prevOverall.toFixed(2)}%</b></span>}
                <span className="mpd-dim">Click a stage for its breakdown</span>
              </div>
            </section>
          </div>

          <div className="mpd-grid2">
            {/* Breakdown of selected stage */}
            <section className="mpd-card" aria-labelledby="bd-h">
              <div className="mpd-card-h flex-wrap">
                <div className="flex-1 min-w-[160px]"><h2 id="bd-h">{sel + 1}. {conv.steps[sel]?.label}</h2><p>{(conv.steps[sel]?.n || 0).toLocaleString()} leads reached this stage</p></div>
                <Seg value={bdBy} onChange={setBdBy} options={[['source', 'By source'], ['salesman', 'By salesman']]} small />
              </div>
              <div className="mpd-bd" key={`${sel}-${bdBy}-${channel}-${period}`}>
                {breakdown.length === 0 && <p className="text-[12.5px] mpd-mute py-4">No leads reached this stage in {periodLabel}.</p>}
                {breakdown.map((b, i) => (
                  <div key={b.k} className="mpd-bd-row"><span title={b.k}>{b.k}</span><span className="mpd-track"><i style={{ width: `${Math.max(2, b.w)}%`, animationDelay: `${i * 50}ms` }} /></span><b>{b.n.toLocaleString()}</b></div>
                ))}
              </div>
            </section>

            {/* Customer data ring + week */}
            <section className="mpd-card" aria-labelledby="ring-h">
              <div className="grid sm:grid-cols-2">
                <div>
                  <div className="mpd-card-h"><div><h2 id="ring-h">Customer data</h2><p>{t ? `All ${t.total} customers` : 'Loading…'}</p></div></div>
                  <div className="flex flex-wrap items-center gap-4 px-4 pb-4 pt-1">
                    <button type="button" onClick={() => onOpenCustomers({})} className="relative w-[104px] h-[104px] shrink-0 grid place-items-center" aria-label={`${ringPct}% complete`}>
                      <svg width="104" height="104" viewBox="0 0 120 120" className="-rotate-90" aria-hidden="true">
                        <defs><linearGradient id="mpd-ring-g" x1="0" x2="1"><stop offset="0" stopColor="#8FA6FF" /><stop offset="1" stopColor="#3D5AF0" /></linearGradient></defs>
                        <circle cx="60" cy="60" r={R} className="mpd-ring-track" strokeWidth="11" fill="none" />
                        <circle cx="60" cy="60" r={R} stroke="url(#mpd-ring-g)" strokeWidth="11" fill="none" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - ringPct / 100)} className="mp-ring" style={{ '--mp-ring-c': C }} />
                      </svg>
                      <span className="absolute text-center"><b className="block text-[24px] leading-none font-medium"><CountUp value={ringPct} />%</b><small className="text-[10.5px] mpd-mute">complete</small></span>
                    </button>
                    <div className="flex-1 grid gap-1.5 text-[11.5px] min-w-[150px]">
                      {[['Complete', t?.complete, '#34D399', { stage: 'complete' }], ['In progress', t?.in_progress, '#FBBF24', { stage: 'in_progress' }], ['Not started', t?.not_started, '#64748B', { stage: 'not_started' }], ['Waiting approval', t?.pending_approval, '#A78BFA', { status: 'pending_approval' }]].map(([l, n, c, f]) => (
                        <button key={l} type="button" onClick={() => onOpenCustomers(f)} className="w-full min-w-0 flex items-center gap-2 text-left hover:text-white">
                          <i className="w-2 h-2 rounded-full shrink-0" style={{ background: c }} /><span className="flex-1 mpd-mute truncate">{l}</span><b className="tabular-nums font-semibold">{n ?? 0}</b>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="sm:border-l" style={{ borderColor: 'var(--d-line)' }}>
                  <div className="mpd-card-h"><div><h2>This week</h2><p>New enquiries per day · {week.total}</p></div></div>
                  <div className="mpd-week">
                    {week.days.map((x, i) => (
                      <div key={x.label + i} title={`${x.n} on ${x.label}`}>
                        <span className="tabular-nums">{x.n || ''}</span>
                        <i className={i === 6 ? 'today' : ''} style={{ height: `${Math.max(x.n ? 8 : 4, (x.n / week.max) * 100)}%`, animationDelay: `${i * 60}ms` }} />
                        <span>{i === 6 ? 'Today' : x.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Lost reasons + quotation results */}
          <div className="mpd-grid2">
            <section className="mpd-card" aria-labelledby="lost-h">
              <div className="mpd-card-h"><div className="flex-1"><h2 id="lost-h">Why deals are lost</h2><p>{lostWhy.n ? `${lostWhy.n} lost in the last 90 days` : 'No lost deals in the last 90 days'}</p></div></div>
              <div className="mpd-bd">
                {lostWhy.rows.length === 0 && <p className="text-[12.5px] mpd-mute py-3">When a deal is lost, the reason shows here so you can fix the cause.</p>}
                {lostWhy.rows.map((b, i) => (
                  <div key={b.k} className="mpd-bd-row"><span title={b.k}>{b.k}</span><span className="mpd-track"><i style={{ width: `${Math.max(2, b.w)}%`, background: 'linear-gradient(90deg,#E1222B,#FF8A8F)', animationDelay: `${i * 50}ms` }} /></span><b>{b.v}</b></div>
                ))}
              </div>
            </section>
            <section className="mpd-card" aria-labelledby="qr-h">
              <div className="mpd-card-h flex-wrap">
                <div className="flex-1 min-w-[160px]"><h2 id="qr-h">Quotation results</h2><p>{quoteRes.rate === null ? 'Mark quotations accepted or rejected to see your win rate' : <>Win rate <b className="mpd-hl">{quoteRes.rate.toFixed(0)}%</b> · OMR {quoteRes.value.toLocaleString('en-US', { maximumFractionDigits: 0 })} accepted</>}</p></div>
                <button type="button" onClick={() => onNavigate('quotations')} className="mpd-btn" style={{ height: 30 }}>Open quotations <ChevronRight className="w-3.5 h-3.5" /></button>
              </div>
              <div className="grid grid-cols-5 gap-2 px-4 pb-4 pt-1">
                {[['Draft', quoteRes.c.draft, '#94A3B8'], ['Sent', quoteRes.c.sent, '#3D5AF0'], ['Expired', quoteRes.c.expired, '#F59E0B'], ['Accepted', quoteRes.c.accepted, '#10B981'], ['Rejected', quoteRes.c.rejected, '#E1222B']].map(([l, v, c]) => (
                  <div key={l} className="text-center rounded-xl py-2.5" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid var(--d-line)' }}>
                    <b className="block text-[20px] font-medium tabular-nums" style={{ color: c }}><CountUp value={v} /></b>
                    <span className="text-[11px] mpd-mute">{l}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Retail vs B2B */}
          {(split.any || branches.some((b) => b.type)) && (
            <section className="mpd-card" aria-labelledby="seg-h">
              <div className="mpd-card-h"><div className="flex-1"><h2 id="seg-h">Retail vs B2B</h2><p>Shops compared with route and wholesale{split.unknown ? ` · ${split.unknown} leads have no branch yet` : ''}</p></div><Building2 className="w-4 h-4 mpd-dim" /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-4 pb-4 pt-1">
                {[['retail', 'Retail', 'Shops', Store, '#10B981'], ['b2b', 'B2B', 'Route / wholesale', Truck, '#3D5AF0']].map(([k, label, sub, Icon, c]) => {
                  const g = split.seg[k];
                  const rate = g.closed ? Math.round((g.won / g.closed) * 100) : null;
                  return (
                    <div key={k} className="rounded-xl p-3.5" style={{ border: '1px solid var(--d-line)', background: 'rgba(255,255,255,.04)' }}>
                      <div className="flex items-center gap-2"><span className="grid place-items-center rounded-lg" style={{ width: 30, height: 30, background: `${c}1A`, color: c }}><Icon className="w-4 h-4" /></span><span><b className="block text-[13.5px] font-semibold">{label}</b><span className="text-[10.5px] mpd-dim">{sub}</span></span></div>
                      <div className="grid grid-cols-3 gap-2 mt-3">
                        <div><b className="block text-[18px] font-medium tabular-nums"><CountUp value={g.open} /></b><span className="text-[10.5px] mpd-mute">open leads</span></div>
                        <div><b className="block text-[18px] font-medium tabular-nums"><CountUp value={Math.round(g.pipeline)} /></b><span className="text-[10.5px] mpd-mute">OMR open</span></div>
                        <div><b className="block text-[18px] font-medium tabular-nums">{rate === null ? '—' : `${rate}%`}</b><span className="text-[10.5px] mpd-mute">win rate</span></div>
                      </div>
                      <p className="text-[11px] mpd-mute mt-2">Won this month: <b className="tabular-nums">OMR {g.wonMonth.toLocaleString('en-US', { maximumFractionDigits: 0 })}</b></p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Cohorts */}
          <section className="mpd-card" aria-labelledby="coh-h">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-4 pb-1">
              {[['Won in month 1', cohort.m1, 'after the first enquiry'], ['By month 3', cohort.m3, 'average across months'], ['By month 6', cohort.m6, 'half a year in']].map(([l, v, s2]) => (
                <div key={l} className="mpd-card px-3.5 py-3" style={{ background: 'rgba(255,255,255,.03)' }}>
                  <p className="text-[11px] mpd-mute">{l}</p><p className="text-[22px] font-medium mt-0.5 tabular-nums">{v.toFixed(1)}%</p><p className="text-[10.5px] mpd-dim">{s2}</p>
                </div>
              ))}
              <div className="mpd-card px-3.5 py-3" style={{ background: 'rgba(255,255,255,.03)' }}>
                <p className="text-[11px] mpd-mute">Strongest month</p><p className="text-[22px] font-medium mt-0.5">{cohort.best ? cohort.best.r.label : '—'}</p><p className="text-[10.5px] mpd-dim">{cohort.best ? `${cohort.best.v.toFixed(0)}% of its enquiries won` : 'not enough data yet'}</p>
              </div>
            </div>
            <div className="mpd-card-h flex-wrap">
              <div className="flex-1 min-w-[200px]"><h2 id="coh-h">Enquiry months: share won</h2><p>Rows are the month the enquiry came in, columns are months since. Click a row to highlight it.</p></div>
              <span className="mpd-legend">0%<i />{cohort.maxV.toFixed(0)}%</span>
            </div>
            <div className="mpd-coh-wrap">
              <table className="mpd-coh mp-doc">
                <thead><tr><th>Month</th><th className="text-right">Leads</th>{Array.from({ length: 12 }, (_, k) => <th key={k}>M{k}</th>)}</tr></thead>
                <tbody>
                  {cohort.rows.map((r, ri) => (
                    <tr key={r.key} className={cohRow === r.key ? 'is-on' : ''} onClick={() => setCohRow(cohRow === r.key ? null : r.key)} style={{ cursor: 'pointer' }}>
                      <td className="lbl">{r.label}</td>
                      <td className="cnt">{r.n.toLocaleString()}</td>
                      {r.cells.map((v, k) => (
                        <td key={k}>
                          <span className={`mpd-cell ${v === null ? 'empty' : ''}`} title={v === null ? '' : `${r.label}: ${v.toFixed(1)}% won by month ${k}`}
                            style={v === null ? undefined : { background: `rgba(91,124,250,${0.1 + 0.85 * (v / cohort.maxV)})`, color: v / cohort.maxV > 0.35 ? '#fff' : '#A9B6EC', animationDelay: `${(ri + k) * 18}ms` }}>
                            {v === null ? '' : v >= 10 ? v.toFixed(0) : v.toFixed(1)}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Salesmen */}
          <section className="mpd-card overflow-hidden" aria-labelledby="team-h">
            <div className="mpd-card-h"><div className="flex-1"><h2 id="team-h">Salesmen</h2><p>Open leads, customers, targets and how complete their customer data is</p></div><ContactRound className="w-4 h-4 mpd-dim" /></div>
            <ul className="sm:hidden mpd-in">
              {rows.length === 0 && <li className="px-4 py-6 text-center text-[12.5px] mpd-mute">No salesman activity yet.</li>}
              {rows.map((r) => (
                <li key={r.id} className="px-4 py-3 flex items-center gap-3" style={{ borderTop: '1px solid var(--d-line)' }}>
                  <Avatar name={r.name} photoUrl={r.photoUrl} size={34} />
                  <span className="flex-1 min-w-0">
                    <span className="flex items-baseline justify-between gap-2"><b className="text-[13px] font-semibold truncate">{r.name}</b><span className="text-[10.5px] mpd-dim shrink-0">{ago(r.last)}</span></span>
                    <span className="block text-[11px] mpd-mute">{r.customers} customers · {r.openLeads} open · {r.quotes} quotes</span>
                    {r.customers > 0 && <span className="mpd-pbar mt-1.5"><span className="mpd-track"><i style={{ width: `${Math.max(2, r.percent)}%` }} /></span><b>{r.percent}%</b></span>}
                    {targetBy[r.id]?.targetOmr > 0 && <span className="block mt-1 text-[10.5px] mpd-mute"><Target className="inline w-3 h-3 mr-1 -mt-0.5" />{targetBy[r.id].wonOmr.toFixed(0)} / {targetBy[r.id].targetOmr.toFixed(0)} OMR</span>}
                  </span>
                  {canManageCustomers && <button type="button" onClick={() => onOpenCustomers({ salesmanId: r.id })} className="mpd-btn" style={{ width: 34, height: 34, padding: 0, justifyContent: 'center' }} aria-label={`${r.name}'s customers`}><ChevronRight /></button>}
                </li>
              ))}
            </ul>
            <div className="hidden sm:block overflow-x-auto">
              <table className="mpd-table mp-doc">
                <thead><tr>{['Salesman', 'Customers', 'Customer data', 'Open leads', 'Quotes', ...(hasTargets ? ['Target this month'] : []), 'Won (OMR)', 'Last activity', ''].map((h) => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {rows.length === 0 && <tr><td colSpan={9} className="text-center mpd-mute">No salesman activity yet.</td></tr>}
                  {rows.map((r) => {
                    const tg = targetBy[r.id]; const tp = tg?.targetOmr > 0 ? Math.round((tg.wonOmr / tg.targetOmr) * 100) : null;
                    return (
                      <tr key={r.id}>
                        <td><span className="flex items-center gap-2.5"><Avatar name={r.name} photoUrl={r.photoUrl} size={32} /><span><b className="font-semibold">{r.name}</b>{(r.type || r.branchName) && <span className="block text-[10.5px] mpd-dim">{[r.branchName, r.type === 'branch' ? 'Retail' : r.type ? 'B2B' : ''].filter(Boolean).join(' · ')}</span>}</span></span></td>
                        <td className="tabular-nums">{r.customers}</td>
                        <td>{r.customers ? <span className="mpd-pbar"><span className="mpd-track"><i style={{ width: `${Math.max(2, r.percent)}%`, background: r.percent === 100 ? 'linear-gradient(90deg,#10B981,#6EE7B7)' : undefined }} /></span><b>{r.percent}%</b></span> : <span className="mpd-dim">—</span>}</td>
                        <td>{r.openLeads ? <span className="mpd-tag">{r.openLeads}</span> : <span className="mpd-dim">0</span>}</td>
                        <td className="tabular-nums">{r.quotes}</td>
                        {hasTargets && <td>{tp !== null ? <span className="block min-w-[140px]" title={`Won OMR ${tg.wonOmr.toFixed(3)} of OMR ${tg.targetOmr.toFixed(3)}`}><span className="mpd-pbar"><span className="mpd-track"><i style={{ width: `${Math.max(2, Math.min(100, tp))}%`, background: tp >= 100 ? 'linear-gradient(90deg,#10B981,#6EE7B7)' : 'linear-gradient(90deg,#C8102E,#F0414A)' }} /></span><b>{tp}%</b></span><span className="block text-[10.5px] mpd-dim tabular-nums mt-0.5">{tg.wonOmr.toFixed(0)} / {tg.targetOmr.toFixed(0)} OMR</span></span> : <span className="text-[11px] mpd-dim">No target</span>}</td>}
                        <td className="tabular-nums">{r.won ? r.won.toFixed(3) : <span className="mpd-dim">—</span>}</td>
                        <td className="text-[11.5px] mpd-mute">{ago(r.last)}</td>
                        <td className="text-right">{canManageCustomers && <button type="button" onClick={() => onOpenCustomers({ salesmanId: r.id })} className="mpd-btn" style={{ height: 30 }}>Customers</button>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/** Segmented control with a sliding pill: the leading edge moves first, the trailing edge catches up. */
function Seg({ options, value, onChange, small }) {
  const box = useRef(null); const btns = useRef({}); const prev = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    const place = () => {
      const b = btns.current[value]; const el = box.current; if (!b || !el) return;
      const l = b.offsetLeft; const r = el.offsetWidth - (b.offsetLeft + b.offsetWidth);
      const fwd = prev.current ? l > prev.current.l : true;
      setPos({ l, r, dur: prev.current ? (fwd ? '0.55s, 0.36s' : '0.36s, 0.55s') : '0s, 0s' });
      prev.current = { l, r };
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [value]);
  return (
    <div ref={box} className="mpd-seg shrink-0" role="group">
      {pos && <span className="mpd-pill" style={{ left: pos.l, right: pos.r, transitionDuration: pos.dur }} aria-hidden="true" />}
      {options.map(([id, label]) => (
        <button key={id} ref={(n) => { btns.current[id] = n; }} type="button" aria-pressed={value === id} onClick={() => onChange(id)} style={small ? { height: 26, fontSize: 11.5 } : undefined}>{label}</button>
      ))}
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
