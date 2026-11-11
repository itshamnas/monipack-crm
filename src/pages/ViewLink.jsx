import React, { useEffect, useMemo, useState } from 'react';
import { Phone, MessageCircle, Lock, Loader2, AlertCircle, Calendar, Flag, User, MapPin, Package, FileText, Search } from 'lucide-react';
import { getApiUrl } from '../api/config.js';

/**
 * Read-only page opened from a WhatsApp alert (/v/<token>):
 *  - a lead for the salesman it was given to
 *  - a department's open pipeline for its manager
 *  - a task for the person it was given to
 * Nothing here can be changed.
 */
const omr = (v) => `OMR ${Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 3 })}`;
const when = (d) => (d ? new Date(d).toLocaleString('en-GB', { timeZone: 'Asia/Muscat', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const day = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { timeZone: 'Asia/Muscat', day: 'numeric', month: 'short' }) : '');
const waDigits = (p) => { let d = String(p || '').replace(/\D/g, ''); if (d.startsWith('00')) d = d.slice(2); if (d.length === 8) d = `968${d}`; return d; };
const ago = (d) => { const n = Math.floor((Date.now() - new Date(d)) / 86400000); return n <= 0 ? 'today' : n === 1 ? '1 day' : `${n} days`; };

function Shell({ children, tag }) {
  return (
    <div className="min-h-screen bg-[#F5F6F8] font-sans text-slate-900">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <img src="/assets/logo.png" alt="" className="h-8 w-auto" />
            <span className="font-monipack lowercase text-lg text-[#CC1A22]">monipack</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 rounded-full px-2.5 py-1">
            <Lock className="w-3.5 h-3.5" aria-hidden="true" /> {tag || 'View only'}
          </span>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-5 pb-16 space-y-4">{children}</main>
    </div>
  );
}

const Card = ({ children, className = '' }) => <section className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${className}`}>{children}</section>;
const Row = ({ icon: Icon, label, children }) => (children ? (
  <div className="flex gap-3 py-2.5 border-t border-slate-100 first:border-t-0">
    <Icon className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" aria-hidden="true" />
    <div className="min-w-0"><span className="block text-[11px] text-slate-500">{label}</span><span className="block text-[14px] break-words whitespace-pre-wrap">{children}</span></div>
  </div>
) : null);

function LeadView({ data }) {
  const l = data.lead;
  const wa = waDigits(l.mobile);
  return (
    <>
      <Card className="p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Lead given to {l.salesman || 'you'}</p>
        <h1 className="text-[22px] font-bold leading-tight mt-1">{l.name}</h1>
        <div className="flex flex-wrap items-center gap-2 mt-2 text-[12px]">
          <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-semibold">{l.stage}</span>
          {l.value > 0 && <span className="px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 font-semibold">{omr(l.value)}</span>}
          {l.branch && <span className="text-slate-500">{l.branch}</span>}
        </div>
        {l.mobile && (
          <div className="grid grid-cols-2 gap-2 mt-4">
            <a href={`tel:${l.mobile.replace(/\s/g, '')}`} className="h-12 rounded-xl bg-[#2F5BEA] text-white font-semibold inline-flex items-center justify-center gap-2"><Phone className="w-4 h-4" /> Call</a>
            {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="h-12 rounded-xl bg-[#128C4A] text-white font-semibold inline-flex items-center justify-center gap-2"><MessageCircle className="w-4 h-4" /> WhatsApp</a>}
          </div>
        )}
      </Card>
      <Card className="px-4 py-2">
        <Row icon={Phone} label="Mobile">{l.mobile}</Row>
        <Row icon={User} label="Contact person">{l.contactPerson}</Row>
        <Row icon={Package} label="Product">{[l.category, l.quantity].filter(Boolean).join(' · ')}</Row>
        <Row icon={MapPin} label="Location">{l.location}</Row>
        <Row icon={FileText} label="Notes">{l.notes}</Row>
        <Row icon={Calendar} label="Enquiry date">{when(l.date)}</Row>
      </Card>
      {data.quotations.length > 0 && (
        <Card className="p-4">
          <h2 className="font-semibold text-[15px] mb-2">Quotations</h2>
          <ul className="divide-y divide-slate-100">
            {data.quotations.map((q) => (
              <li key={q.code} className="py-2 flex items-center justify-between gap-3 text-[13.5px]">
                <span><b className="font-semibold">{q.code}</b> <span className="text-slate-500">· {day(q.at)}{q.status ? ` · ${q.status}` : ''}</span></span>
                <span className="tabular-nums font-semibold">{omr(q.total)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card className="p-4">
        <h2 className="font-semibold text-[15px] mb-2">What happened so far</h2>
        {data.history.length === 0 && <p className="text-[13px] text-slate-500">Nothing yet.</p>}
        <ol className="space-y-3">
          {data.history.map((h, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-2 h-2 rounded-full bg-[#2F5BEA] mt-1.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0"><span className="block text-[13.5px] break-words">{h.text}</span><span className="block text-[11px] text-slate-500">{when(h.at)}</span></span>
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}

function PipelineView({ data }) {
  const [stage, setStage] = useState('all');
  const [q, setQ] = useState('');
  const counts = useMemo(() => Object.fromEntries(data.stages.map((s) => [s.key, data.leads.filter((l) => l.stage === s.key)])), [data]);
  const total = data.leads.reduce((s, l) => s + l.value, 0);
  const shown = data.leads.filter((l) => (stage === 'all' || l.stage === stage)
    && (!q.trim() || `${l.name} ${l.salesman} ${l.category} ${l.mobile}`.toLowerCase().includes(q.trim().toLowerCase())));
  const stageName = (k) => data.stages.find((s) => s.key === k)?.name || k;
  return (
    <>
      <Card className="p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{data.segmentName} department</p>
        <h1 className="text-[22px] font-bold leading-tight mt-1">Open pipeline</h1>
        <p className="text-[13px] text-slate-600 mt-1"><b>{data.leads.length}</b> open leads · <b>{omr(total)}</b></p>
      </Card>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" role="group" aria-label="Stage">
        {[{ key: 'all', name: 'All' }, ...data.stages].map((s) => {
          const list = s.key === 'all' ? data.leads : counts[s.key] || [];
          return (
            <button key={s.key} type="button" onClick={() => setStage(s.key)} aria-pressed={stage === s.key}
              className={`shrink-0 h-10 px-3.5 rounded-full border text-[13px] font-semibold ${stage === s.key ? 'bg-[#2F5BEA] text-white border-[#2F5BEA]' : 'bg-white border-slate-200 text-slate-700'}`}>
              {s.name} <span className="opacity-70 font-normal">{list.length}</span>
            </button>
          );
        })}
      </div>
      <label className="relative block">
        <span className="sr-only">Search</span>
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer, salesman, product" className="w-full h-11 pl-10 pr-3 rounded-xl border border-slate-200 bg-white text-[14px]" />
      </label>
      <Card>
        <ul className="divide-y divide-slate-100">
          {shown.length === 0 && <li className="p-6 text-center text-[13px] text-slate-500">No leads here.</li>}
          {shown.map((l, i) => (
            <li key={i} className="p-3.5 flex items-start justify-between gap-3">
              <span className="min-w-0">
                <b className="block font-semibold text-[14px] truncate">{l.name}</b>
                <span className="block text-[12px] text-slate-500 truncate">{stageName(l.stage)} · {l.salesman || 'Not assigned'}{l.category ? ` · ${l.category}` : ''}</span>
                <span className="block text-[11.5px] text-slate-400">{l.mobile}{l.mobile ? ' · ' : ''}in pipeline {ago(l.createdAt)}</span>
              </span>
              {l.value > 0 && <span className="shrink-0 text-[13px] font-semibold tabular-nums">{omr(l.value)}</span>}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

function TaskView({ data }) {
  const t = data.task;
  const PR = { urgent: 'Urgent', high: 'High', normal: 'Normal', low: 'Low' };
  const ST = { todo: 'To do', in_progress: 'In progress', done: 'Done' };
  return (
    <>
      <Card className="p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Task{t.by ? ` from ${t.by}` : ''}</p>
        <h1 className="text-[22px] font-bold leading-tight mt-1">{t.title}</h1>
        <div className="flex flex-wrap gap-2 mt-2 text-[12px]">
          <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-semibold">{ST[t.status] || t.status}</span>
          <span className="px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 font-semibold inline-flex items-center gap-1"><Flag className="w-3 h-3" aria-hidden="true" />{PR[t.priority] || t.priority}</span>
        </div>
      </Card>
      <Card className="px-4 py-2">
        <Row icon={Calendar} label="Due">{when(t.dueAt)}</Row>
        <Row icon={User} label="Lead">{t.lead}</Row>
        <Row icon={User} label="Customer">{t.customer}</Row>
        <Row icon={FileText} label="Details">{t.description}</Row>
      </Card>
      <p className="text-[12px] text-slate-500 text-center">To update this task, open the CRM or your salesman link.</p>
    </>
  );
}

export default function ViewLink() {
  const token = window.location.pathname.split('/')[2] || '';
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    document.title = 'Monipack · View only';
    const meta = document.createElement('meta'); meta.name = 'robots'; meta.content = 'noindex'; document.head.appendChild(meta);
    fetch(getApiUrl(`/api/view/${encodeURIComponent(token)}`))
      .then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => ({})) }))
      .then(({ ok, body }) => setState(ok ? { data: body } : { error: body.error || 'This link does not work.' }))
      .catch(() => setState({ error: 'No connection. Check your internet and try again.' }));
  }, [token]);

  if (state.loading) return <Shell><div className="py-24 grid place-items-center text-slate-500"><Loader2 className="w-6 h-6 animate-spin" aria-label="Loading" /></div></Shell>;
  if (state.error) {
    return (
      <Shell>
        <Card className="p-8 text-center">
          <AlertCircle className="w-10 h-10 mx-auto text-amber-500" aria-hidden="true" />
          <h1 className="text-lg font-bold mt-3">Link not available</h1>
          <p className="text-[14px] text-slate-600 mt-1">{state.error}</p>
        </Card>
      </Shell>
    );
  }
  const d = state.data;
  return (
    <Shell tag="View only">
      {d.kind === 'lead' && <LeadView data={d} />}
      {d.kind === 'pipeline' && <PipelineView data={d} />}
      {d.kind === 'task' && <TaskView data={d} />}
      <p className="text-[11px] text-slate-400 text-center">This page can't change anything. Link works until {day(d.expiresAt)}. Don't forward it.</p>
    </Shell>
  );
}
