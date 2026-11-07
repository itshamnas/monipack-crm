import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ChevronRight, ContactRound, FileText, Link2, Plus, Upload, Phone, Clock, ShieldCheck, FileWarning,
} from 'lucide-react';

/**
 * Super admin / manager home page: what needs attention today, then one row per salesman.
 * Built from data the app already has (leads, quotations) plus the customer summary.
 */

const DAY = 24 * 60 * 60 * 1000;
const card = 'bg-white rounded-3xl border border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.04)]';
const omr = (n) => `OMR ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
const ago = (d) => {
  if (!d) return '—';
  const days = Math.floor((Date.now() - new Date(d).getTime()) / DAY);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
};

function Bar({ value }) {
  const v = Math.max(0, Math.min(100, value || 0));
  const color = v === 100 ? 'bg-emerald-500' : v >= 50 ? 'bg-amber-500' : 'bg-[#CC1A22]';
  return (
    <span className="inline-flex items-center gap-2">
      <span className="w-20 h-1.5 rounded-full bg-slate-100 overflow-hidden" aria-hidden="true">
        <span className={`block h-1.5 rounded-full ${color}`} style={{ width: `${v}%` }} />
      </span>
      <span className="text-xs font-bold tabular-nums">{v}%</span>
    </span>
  );
}

export default function Home({ authFetch, leads = [], quotations = [], currentUser, onNavigate, onOpenCustomers, onNewLead, canManageCustomers }) {
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
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-5 pb-24 md:pb-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">{hello}{currentUser?.name ? `, ${currentUser.name.split(' ')[0]}` : ''}</h1>
          <p className="text-sm text-slate-500">Here is what needs attention today.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onNewLead} className="min-h-[40px] px-4 rounded-full bg-[#CC1A22] hover:bg-[#A3141B] text-white text-xs font-bold inline-flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> New enquiry
          </button>
          <button type="button" onClick={() => onNavigate('quotations')} className="min-h-[40px] px-4 rounded-full bg-white border border-slate-300 text-xs font-bold inline-flex items-center gap-1.5">
            <FileText className="w-4 h-4" /> New quote
          </button>
          {canManageCustomers && (
            <button type="button" onClick={() => onOpenCustomers({ tab: 'import' })} className="min-h-[40px] px-4 rounded-full bg-white border border-slate-300 text-xs font-bold inline-flex items-center gap-1.5">
              <Upload className="w-4 h-4" /> Import customers
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          ['Customers', t ? t.total : '…', () => onOpenCustomers({})],
          ['Customer data complete', t ? `${t.percentComplete ?? 0}%` : '…', () => onOpenCustomers({})],
          ['Open leads', stats.openCount, () => onNavigate('leads')],
          ['Open pipeline', omr(stats.pipeline), () => onNavigate('leads')],
          ['Won this month', omr(stats.wonMonth), () => onNavigate('leads')],
        ].map(([label, value, go]) => (
          <button key={label} type="button" onClick={go} className={`${card} p-4 text-left hover:border-slate-400 transition`}>
            <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
            <span className="block mt-1 text-xl font-extrabold tabular-nums truncate">{value}</span>
          </button>
        ))}
      </div>

      <section className={`${card} overflow-hidden`} aria-labelledby="todo-h">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-[#CC1A22]" />
          <h2 id="todo-h" className="text-base font-bold">Needs your attention</h2>
        </div>
        {todo.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-600 flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-emerald-600" /> All clear. Nothing is waiting for you.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {todo.map(({ n, icon: Icon, text, sub, go }) => (
              <li key={text}>
                <button type="button" onClick={go} className="w-full px-5 py-3.5 flex items-center gap-4 text-left hover:bg-slate-50 transition">
                  <span className="w-10 h-10 rounded-2xl bg-red-50 text-[#CC1A22] flex items-center justify-center shrink-0"><Icon className="w-5 h-5" /></span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm"><strong className="text-lg tabular-nums mr-1">{n}</strong>{n === 1 ? text.replace(/^(customers|enquiries|leads|quotations|salesmen)/, (w) => ({ customers: 'customer', enquiries: 'enquiry', leads: 'lead', quotations: 'quotation', salesmen: 'salesman' }[w])).replace('enquiries', 'enquiry').replace('open leads', 'open lead').replace('quotations sent', 'quotation sent').replace('customers without', 'customer without').replace('salesmen with', 'salesman with').replace('their link is off', 'his link is off') : text}</span>
                    <span className="block text-xs text-slate-500">{sub}</span>
                  </span>
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${card} overflow-hidden`} aria-labelledby="team-h">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <ContactRound className="w-5 h-5 text-slate-700" />
          <h2 id="team-h" className="text-base font-bold">Salesmen</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                {['Salesman', 'Customers', 'Customer data', 'Open leads', 'Quotes', 'Won (OMR)', 'Last activity', ''].map((h) => (
                  <th key={h} className="text-left font-bold px-4 py-2.5 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-500">No salesman activity yet.</td></tr>}
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold whitespace-nowrap">{r.name}{r.type && <span className="block text-[11px] font-normal text-slate-500">{r.type === 'branch' ? 'Branch' : 'Route / B2B'}</span>}</td>
                  <td className="px-4 py-3 tabular-nums">{r.customers}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{r.customers ? <Bar value={r.percent} /> : <span className="text-xs text-slate-400">—</span>}</td>
                  <td className="px-4 py-3 tabular-nums font-bold">{r.openLeads}</td>
                  <td className="px-4 py-3 tabular-nums">{r.quotes}</td>
                  <td className="px-4 py-3 tabular-nums whitespace-nowrap">{r.won ? r.won.toFixed(3) : '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{ago(r.last)}</td>
                  <td className="px-4 py-3">
                    {canManageCustomers && (
                      <button type="button" onClick={() => onOpenCustomers({ salesmanId: r.id })} className="min-h-[34px] px-3 rounded-full border border-slate-300 text-xs font-bold hover:bg-slate-50">Customers</button>
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
