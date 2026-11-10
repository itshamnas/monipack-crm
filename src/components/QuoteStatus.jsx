import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Loader2, Trophy, X } from 'lucide-react';

/**
 * Quotation status pill + menu: Draft, Sent, Accepted, Rejected. "Expired" is shown automatically
 * when a sent quotation passes its validity. Accepting can mark the linked lead as Won at the quote total.
 */
export const QUOTE_STATUS = {
  draft: { label: 'Draft', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  sent: { label: 'Sent', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  accepted: { label: 'Accepted', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected: { label: 'Rejected', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  expired: { label: 'Expired', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
};

export function effectiveQuoteStatus(q) {
  const s = QUOTE_STATUS[q?.status] ? q.status : 'sent';
  if (s !== 'sent' || !q?.date) return s;
  const end = new Date(`${q.date}T23:59:59`);
  end.setDate(end.getDate() + Number(q.validityDays || 30));
  return end < new Date() ? 'expired' : 'sent';
}

const REJECT_REASONS = ['Price too high', 'Bought from a competitor', 'Quantity / minimum order', 'Delivery time', 'Customer postponed', 'Other'];

export default function QuoteStatus({ quote, onSetStatus }) {
  const [open, setOpen] = useState(false);
  const [ask, setAsk] = useState(null); // 'accepted' | 'rejected'
  const [busy, setBusy] = useState(false);
  const [won, setWon] = useState(true);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [pos, setPos] = useState(null);
  const btn = useRef(null);
  const eff = effectiveQuoteStatus(quote);
  const meta = QUOTE_STATUS[eff];

  useEffect(() => {
    if (!open) return undefined;
    const r = btn.current?.getBoundingClientRect();
    if (r) setPos({ left: Math.min(r.left, window.innerWidth - 200), top: r.bottom + 6 });
    const close = (e) => { if (!e.target.closest?.('.mp-qs-menu') && e.target !== btn.current && !btn.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', esc);
    window.addEventListener('scroll', () => setOpen(false), { once: true, capture: true });
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const choose = async (s) => {
    setOpen(false);
    if (s === quote.status) return;
    if (s === 'accepted' || s === 'rejected') { setAsk(s); setWon(Boolean(quote.leadId)); setReason(''); setNote(''); setErr(''); return; }
    setBusy(true); try { await onSetStatus(quote, s, {}); } catch { /* toast shown by parent */ } setBusy(false);
  };
  const confirm = async (e) => {
    e.preventDefault();
    if (ask === 'rejected' && !reason) { setErr('Choose a reason.'); return; }
    setBusy(true);
    try {
      await onSetStatus(quote, ask, ask === 'rejected' ? { reason: note ? `${reason}: ${note}` : reason } : { markLeadWon: won });
      setAsk(null);
    } catch (ex) { setErr(ex.message || 'Could not save.'); }
    setBusy(false);
  };

  return (
    <>
      <button ref={btn} type="button" onClick={() => setOpen((v) => !v)} disabled={busy || !onSetStatus} aria-haspopup="menu" aria-expanded={open}
        className={`inline-flex items-center gap-1 h-7 pl-2.5 pr-1.5 rounded-full border text-[11.5px] font-semibold whitespace-nowrap disabled:opacity-70 ${meta.cls}`}
        title={eff === 'expired' ? 'Validity has passed. Send a new quote or mark the result.' : 'Change status'}>
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : null}{meta.label}{onSetStatus && <ChevronDown className="w-3.5 h-3.5 opacity-60" />}
      </button>
      {open && pos && createPortal(
        <div className="mp-qs-menu fixed z-[80] w-[190px] rounded-xl border border-slate-200 bg-white shadow-xl p-1" style={{ left: pos.left, top: pos.top }} role="menu">
          {['draft', 'sent', 'accepted', 'rejected'].map((s) => (
            <button key={s} type="button" role="menuitem" onClick={() => choose(s)} className="w-full flex items-center gap-2 px-2.5 h-9 rounded-lg text-[13px] hover:bg-slate-50 text-left">
              <i className={`w-2 h-2 rounded-full border ${QUOTE_STATUS[s].cls}`} />{QUOTE_STATUS[s].label}
              {quote.status === s && <Check className="w-4 h-4 ml-auto text-emerald-600" />}
            </button>
          ))}
        </div>, document.body)}
      {ask && createPortal(
        <div className="fixed inset-0 z-[80] mp-overlay bg-slate-900/50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={ask === 'accepted' ? 'Quotation accepted' : 'Quotation rejected'}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setAsk(null); }}>
          <form onSubmit={confirm} className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${ask === 'accepted' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{ask === 'accepted' ? <Trophy className="w-5 h-5" /> : <X className="w-5 h-5" />}</span>
              <div className="min-w-0">
                <h2 className="text-[17px] font-semibold">{ask === 'accepted' ? 'Customer accepted the quotation' : 'Customer rejected the quotation'}</h2>
                <p className="text-[13px] text-slate-500">{quote.code} · {quote.customerName} · OMR {Number(quote.grandTotalOMR || 0).toFixed(3)}</p>
              </div>
            </div>
            {ask === 'accepted' ? (
              quote.leadId ? (
                <label className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-[13.5px] cursor-pointer">
                  <input type="checkbox" checked={won} onChange={(e) => setWon(e.target.checked)} className="mt-0.5" />
                  <span>Also mark the lead as <b>Won</b> with a deal value of <b>OMR {Number(quote.grandTotalOMR || 0).toFixed(3)}</b></span>
                </label>
              ) : <p className="text-[13px] text-slate-500">This quotation is not linked to a lead, so only the quotation is marked.</p>
            ) : (
              <>
                <div className="grid gap-1.5">
                  {REJECT_REASONS.map((r) => (
                    <label key={r} className={`flex items-center gap-3 px-3 min-h-[42px] rounded-xl border cursor-pointer text-[13.5px] ${reason === r ? 'border-rose-400 bg-rose-50/70' : 'border-slate-200'}`}>
                      <input type="radio" name="qr" checked={reason === r} onChange={() => { setReason(r); setErr(''); }} />{r}
                    </label>
                  ))}
                </div>
                <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={150} placeholder="Note (optional)" className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm" />
                <p className="text-[12px] text-slate-500">The lead stays open so you can send a new quotation.</p>
              </>
            )}
            {err && <p className="text-sm text-rose-700" role="alert">{err}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setAsk(null)} className="h-11 px-4 rounded-full text-sm font-semibold hover:bg-slate-100">Cancel</button>
              <button type="submit" disabled={busy} className={`h-11 px-5 rounded-full text-sm font-semibold text-white inline-flex items-center gap-2 ${ask === 'accepted' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}>
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}{ask === 'accepted' ? 'Mark accepted' : 'Mark rejected'}
              </button>
            </div>
          </form>
        </div>, document.body)}
    </>
  );
}
