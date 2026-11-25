import React, { useEffect, useRef, useState } from 'react';
import { Lock, Loader2, CheckCircle2, AlertTriangle, PenLine, MessageSquareWarning, ShieldCheck, Printer, Clock3, X } from 'lucide-react';
import { getApiUrl } from '../api/config.js';
import SponsorDocument, { fmtDateTime, omr } from '../components/sponsorship/SponsorDoc.jsx';
import SignaturePad from '../components/ui/SignaturePad.jsx';
import { printSponsorship } from '../utils/sponsorPdf.js';

/**
 * /s/<token>: the personal approval page for the Monipack MD or a partner brand's representative.
 * No CRM login: the link + a 6-digit PIN. Approve = tick + typed full name + signature + "Are you sure?".
 */
const token = window.location.pathname.split('/')[2] || '';
const KEY = `mp-sp-${token.slice(0, 12)}`;
const api = async (path, opts = {}) => {
  const session = sessionStorage.getItem(KEY);
  const res = await fetch(getApiUrl(`/api/sp/${encodeURIComponent(token)}${path}`), {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session}` } : {}), ...(opts.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
};

function Banner({ url }) {
  return url ? (
    <div className="w-full bg-slate-900">
      <img src={getApiUrl(url)} alt="" className="block w-full max-h-[220px] sm:max-h-[260px] object-cover mx-auto" />
    </div>
  ) : (
    <div className="w-full bg-[#0F172A] text-white">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between text-[13px]">
        <b className="text-[16px] tracking-tight">monipack</b>
        <span className="text-slate-300">www.monipack.com · www.shop.monipack.com</span>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <footer className="max-w-6xl mx-auto px-4 py-8 text-center text-[12.5px] text-slate-500">
      Morooj Nizwa International LLC · www.monipack.com · www.shop.monipack.com
    </footer>
  );
}

function PinScreen({ info, onOpen }) {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e?.preventDefault();
    if (pin.length !== 6) { setErr('Enter all 6 digits.'); return; }
    setBusy(true); setErr('');
    const r = await api('/unlock', { method: 'POST', body: JSON.stringify({ pin }) });
    setBusy(false);
    if (!r.ok) { setErr(r.body.error || 'Could not open. Try again.'); setPin(''); return; }
    sessionStorage.setItem(KEY, r.body.session);
    onOpen(r.body);
  };
  useEffect(() => { if (pin.length === 6) submit(); }, [pin]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <main className="max-w-md mx-auto px-4 py-10">
      <form onSubmit={submit} className="bg-white rounded-3xl border border-slate-200 shadow-[0_20px_50px_-20px_rgba(15,23,42,.25)] p-6 sm:p-8 text-center">
        <span className="mx-auto w-14 h-14 rounded-2xl bg-slate-900 text-white grid place-items-center"><Lock className="w-6 h-6" /></span>
        <h1 className="mt-4 text-[22px] font-extrabold">Hello {info.name}</h1>
        {info.designation && <p className="text-slate-500 text-[14px]">{info.designation}</p>}
        <p className="mt-3 text-[14.5px] text-slate-600">This sponsorship confirmation is for you only. Enter the 6-digit PIN Monipack sent you.</p>
        <label htmlFor="sp-pin" className="sr-only">PIN</label>
        <input id="sp-pin" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" autoFocus
          className="mt-5 w-full h-16 text-center text-[30px] tracking-[0.5em] font-bold rounded-2xl border-2 border-slate-300 focus:border-[#2F5BEA] focus:outline-none tabular-nums" placeholder="••••••" disabled={busy} />
        {err && <p role="alert" className="mt-3 text-[14px] font-semibold text-rose-700">{err}</p>}
        <button type="submit" disabled={busy || pin.length !== 6} className="mt-5 w-full h-12 rounded-2xl bg-[#2F5BEA] text-white font-bold text-[15px] disabled:opacity-50 inline-flex items-center justify-center gap-2">
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />} Open
        </button>
        <p className="mt-4 text-[12.5px] text-slate-500">5 wrong PINs lock this link for 15 minutes.</p>
      </form>
    </main>
  );
}

function Confetti() {
  const bits = Array.from({ length: 28 }, (_, i) => i);
  const colors = ['#CC1A22', '#2F5BEA', '#10B981', '#F59E0B', '#8B5CF6'];
  return (
    <div className="mp-sp-confetti" aria-hidden="true">
      {bits.map((i) => <span key={i} style={{ left: `${(i * 37) % 100}%`, background: colors[i % colors.length], animationDelay: `${(i % 7) * 0.08}s`, transform: `rotate(${i * 29}deg)` }} />)}
    </div>
  );
}

function SuccessPop({ name, done, onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/55 grid place-items-center p-4 mp-sp-fade" role="dialog" aria-modal="true" aria-label="Approved">
      <div className="relative bg-white rounded-[28px] p-8 w-full max-w-sm text-center overflow-hidden mp-sp-pop">
        <Confetti />
        <svg viewBox="0 0 80 80" className="w-24 h-24 mx-auto" aria-hidden="true">
          <circle cx="40" cy="40" r="36" fill="#ECFDF5" stroke="#10B981" strokeWidth="4" className="mp-sp-ring" />
          <path d="M24 41 l11 11 l22 -24" fill="none" stroke="#10B981" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" className="mp-sp-tick" />
        </svg>
        <h2 className="mt-4 text-[24px] font-extrabold">Approved</h2>
        <p className="mt-1 text-slate-600 text-[15px]">Thank you, {name}. Your approval has been recorded{done ? ' and the agreement is now complete.' : '.'}</p>
        <button type="button" onClick={onClose} className="mt-6 w-full h-12 rounded-2xl bg-slate-900 text-white font-bold">Done</button>
      </div>
    </div>
  );
}

function StatusChip({ decision }) {
  if (decision === 'approved') return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[12.5px] font-bold"><CheckCircle2 className="w-3.5 h-3.5" /> Approved</span>;
  if (decision === 'changes_requested') return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 text-[12.5px] font-bold"><MessageSquareWarning className="w-3.5 h-3.5" /> Asked for changes</span>;
  return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-[12.5px] font-bold"><Clock3 className="w-3.5 h-3.5" /> Waiting</span>;
}

function ActionPanel({ data, onDone, onStale }) {
  const [mode, setMode] = useState('approve');
  const [agree, setAgree] = useState(false);
  const [typed, setTyped] = useState('');
  const [hasSig, setHasSig] = useState(false);
  const [comment, setComment] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const sig = useRef(null);
  const ready = agree && typed.trim().length >= 3 && hasSig;
  const myParty = data.doc.parties.find((p) => data.me.company && p.company === data.me.company);

  const send = async (decision) => {
    setBusy(true); setErr('');
    const payload = decision === 'approved'
      ? { decision, agree, typedName: typed.trim(), signature: sig.current.toDataURL(), fingerprint: data.doc.fingerprint }
      : { decision, comment: comment.trim(), fingerprint: data.doc.fingerprint };
    const r = await api('/decide', { method: 'POST', body: JSON.stringify(payload) });
    setBusy(false); setConfirm(false);
    if (r.status === 401) { sessionStorage.removeItem(KEY); window.location.reload(); return; }
    if (!r.ok) { if (r.body.code === 'stale') onStale(); setErr(r.body.error || 'Could not save. Try again.'); return; }
    onDone(r.body, decision);
  };

  return (
    <section className="bg-white rounded-3xl border-2 border-slate-900 p-5 sm:p-6" aria-label="Your decision">
      <h2 className="text-[20px] font-extrabold">Your decision</h2>
      <p className="text-[14px] text-slate-600 mt-0.5">{data.me.name} · {data.me.designation}{data.me.company ? ` · ${data.me.company}` : ''}</p>
      <div className="mt-4 grid grid-cols-2 gap-2 p-1 rounded-2xl bg-slate-100" role="tablist">
        {[['approve', 'Approve', PenLine], ['changes', 'Request changes', MessageSquareWarning]].map(([id, label, Icon]) => (
          <button key={id} type="button" role="tab" aria-selected={mode === id} onClick={() => setMode(id)}
            className={`h-12 rounded-xl text-[14.5px] font-bold inline-flex items-center justify-center gap-2 ${mode === id ? 'bg-white shadow text-slate-900' : 'text-slate-600'}`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {mode === 'approve' ? (
        <div className="mt-5 space-y-5">
          {myParty && (
            <div className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-slate-50">
              <span className="text-[14px] text-slate-600">Your share ({myParty.sharePct}%)</span>
              <b className="text-[18px] tabular-nums">{omr(myParty.amount, data.doc.currency)}</b>
            </div>
          )}
          <button type="button" onClick={() => document.getElementById('sp-terms')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="text-[14px] font-semibold text-[#2F5BEA] underline underline-offset-2 min-h-[40px]">Read the terms and conditions</button>
          <label className="flex items-start gap-3 p-4 rounded-2xl border border-slate-200 cursor-pointer has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-50/50">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 w-6 h-6 accent-emerald-600 shrink-0" />
            <span className="text-[14.5px] leading-snug">I have read this sponsorship confirmation and <b>agree to the terms and conditions</b>. I am authorised to approve it{data.me.company ? ` for ${data.me.company}` : ''}.</span>
          </label>
          <div>
            <label htmlFor="sp-typed" className="block text-[13px] font-bold text-slate-700 mb-1.5">Type your full name</label>
            <input id="sp-typed" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="name" placeholder={data.me.name}
              className="w-full h-12 px-4 rounded-2xl border border-slate-300 text-[16px] focus:outline-none focus:border-[#2F5BEA]" />
          </div>
          <div>
            <span className="block text-[13px] font-bold text-slate-700 mb-1.5">Draw your signature</span>
            <SignaturePad ref={sig} onChange={setHasSig} label="Sign here with your finger or mouse" />
          </div>
          {err && <p role="alert" className="text-[14px] font-semibold text-rose-700">{err}</p>}
          <button type="button" disabled={!ready || busy} onClick={() => setConfirm(true)}
            className="w-full h-14 rounded-2xl bg-emerald-600 text-white text-[16px] font-extrabold disabled:opacity-40 inline-flex items-center justify-center gap-2">
            <CheckCircle2 className="w-5 h-5" /> Approve
          </button>
          {!ready && <p className="text-[13px] text-slate-500 text-center">Tick the box, type your name and sign to approve.</p>}
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <label htmlFor="sp-comment" className="block text-[13px] font-bold text-slate-700">What should be changed?</label>
          <textarea id="sp-comment" rows={5} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="e.g. Please make the split 60/40, and add one more roll-up at the entrance."
            className="w-full p-4 rounded-2xl border border-slate-300 text-[15px] focus:outline-none focus:border-[#2F5BEA]" />
          {err && <p role="alert" className="text-[14px] font-semibold text-rose-700">{err}</p>}
          <button type="button" disabled={comment.trim().length < 5 || busy} onClick={() => send('changes_requested')}
            className="w-full h-14 rounded-2xl bg-amber-500 text-white text-[16px] font-extrabold disabled:opacity-40 inline-flex items-center justify-center gap-2">
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <MessageSquareWarning className="w-5 h-5" />} Send to Monipack
          </button>
          <p className="text-[13px] text-slate-500">Monipack will update the details. You will review the new version on this same link.</p>
        </div>
      )}

      {confirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/55 grid place-items-center p-4 mp-sp-fade" role="alertdialog" aria-modal="true" aria-labelledby="sp-confirm-t">
          <div className="bg-white rounded-[28px] p-6 w-full max-w-sm mp-sp-pop">
            <div className="flex items-start gap-3">
              <span className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-700 grid place-items-center shrink-0"><AlertTriangle className="w-6 h-6" /></span>
              <div>
                <h2 id="sp-confirm-t" className="text-[19px] font-extrabold">Are you sure?</h2>
                <p className="mt-1 text-[14.5px] text-slate-600">Once you approve, it <b>cannot be undone</b>. You are approving <b>{data.doc.title}</b> with your share of the sponsorship and all the terms.</p>
              </div>
            </div>
            <div className="mt-4 p-3 rounded-2xl bg-slate-50 flex items-center gap-3">
              <img src={sig.current?.toDataURL()} alt="Your signature" className="h-14 w-32 object-contain bg-white rounded-lg border border-slate-200" />
              <span className="text-[13.5px]"><b className="block">{typed.trim()}</b><span className="text-slate-500">{data.me.designation}</span></span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setConfirm(false)} className="h-12 rounded-2xl border border-slate-300 font-bold" disabled={busy}>Go back</button>
              <button type="button" onClick={() => send('approved')} className="h-12 rounded-2xl bg-emerald-600 text-white font-extrabold inline-flex items-center justify-center gap-2" disabled={busy}>
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />} Yes, approve
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default function SponsorshipLink() {
  const [state, setState] = useState({ loading: true });
  const [pop, setPop] = useState(null);
  const load = async () => {
    const r = await api('');
    if (!r.ok) { setState({ error: r.body.error || 'This link is not valid.' }); return; }
    setState(r.body);
  };
  useEffect(() => { document.title = 'Sponsorship confirmation · Monipack'; load(); }, []);

  if (state.loading) return <div className="min-h-screen grid place-items-center bg-slate-50"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>;
  if (state.error) return (
    <div className="min-h-screen bg-slate-50"><Banner />
      <main className="max-w-md mx-auto px-4 py-16 text-center"><AlertTriangle className="w-10 h-10 mx-auto text-amber-500" /><p className="mt-3 text-[16px] font-semibold">{state.error}</p></main>
      <Footer /></div>
  );
  if (!state.unlocked) return (
    <div className="min-h-screen bg-slate-50"><Banner url={state.bannerUrl} /><PinScreen info={state} onOpen={(d) => setState(d)} /><Footer /></div>
  );

  const d = state;
  return (
    <div className="min-h-screen bg-slate-50 mp-sp-page">
      <Banner url={d.doc.bannerUrl} />
      <main className="max-w-6xl mx-auto px-3 sm:px-5 py-5 sm:py-8 space-y-5">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <p className="text-[13.5px] text-slate-600">For <b className="text-slate-900">{d.me.name}</b>{d.me.designation ? `, ${d.me.designation}` : ''}{d.me.company ? ` · ${d.me.company}` : ''}</p>
          <button type="button" onClick={() => { if (!printSponsorship(d.doc, d.approvals, { kind: 'copy', forName: d.me.name })) alert('Please allow pop-ups to save the PDF.'); }} className="no-print inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-full border border-slate-300 bg-white text-[13px] font-semibold"><Printer className="w-4 h-4" /> Save a copy (PDF)</button>
        </div>

        {d.doc.status === 'approved' && (
          <div className="p-4 rounded-2xl bg-emerald-600 text-white flex items-center gap-3"><CheckCircle2 className="w-6 h-6 shrink-0" /><span className="text-[15px] font-semibold">Approved by everyone{d.doc.approvedAt ? ` on ${fmtDateTime(d.doc.approvedAt)}` : ''}. This agreement is final.</span></div>
        )}
        {d.waiting && d.doc.status !== 'approved' && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex items-center gap-3"><Clock3 className="w-5 h-5 shrink-0" /><span className="text-[14.5px] font-semibold">{d.waiting}</span></div>
        )}

        <SponsorDocument doc={d.doc} myCompany={d.me.company} />

        <section className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6">
          <h2 className="text-[18px] font-bold">Approvals</h2>
          <ul className="mt-2 divide-y divide-slate-100">
            {d.approvals.map((a, i) => (
              <li key={i} className="py-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="flex-1 min-w-[180px]"><b className="block text-[15px]">{a.name}</b><span className="text-[13px] text-slate-500">{a.designation}{a.company ? ` · ${a.company}` : ''}</span></span>
                <StatusChip decision={a.decision} />
                {a.at && <span className="text-[12.5px] text-slate-500 w-full sm:w-auto">{fmtDateTime(a.at)}</span>}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12px] text-slate-400 break-all">Version {d.doc.version} · Reference {String(d.doc.fingerprint || '').slice(0, 16).toUpperCase()}</p>
        </section>

        {d.myDecision && (
          <div className={`p-4 rounded-2xl border flex items-start gap-3 ${d.myDecision.decision === 'approved' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
            {d.myDecision.decision === 'approved' ? <CheckCircle2 className="w-6 h-6 shrink-0" /> : <MessageSquareWarning className="w-6 h-6 shrink-0" />}
            <span className="text-[14.5px]">
              {d.myDecision.decision === 'approved'
                ? <>You approved this as <b>{d.myDecision.typedName}</b> on {fmtDateTime(d.myDecision.at)}. An approval cannot be undone.</>
                : <>You asked for changes on {fmtDateTime(d.myDecision.at)}: “{d.myDecision.comment}”. Monipack will update it and you will review the new version here.</>}
            </span>
          </div>
        )}

        {d.canAct && <div className="no-print"><ActionPanel data={d} onStale={load} onDone={(next, decision) => { setState({ ...next, unlocked: true }); if (decision === 'approved') setPop({ done: next.status === 'approved' }); }} /></div>}
      </main>
      <Footer />
      {pop && <SuccessPop name={d.me.name} done={pop.done} onClose={() => setPop(null)} />}
    </div>
  );
}
