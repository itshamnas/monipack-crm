import React, { useEffect, useRef, useState } from 'react';
import { XCircle, X } from 'lucide-react';
import { LOST_REASONS } from '../utils/lostReasons.js';

/** Asks why a deal was lost. Opened by App whenever a lead is moved to Lost without a reason. */
export default function LostReasonModal({ leadName, onConfirm, onCancel }) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const first = useRef(null);
  useEffect(() => {
    first.current?.focus();
    const esc = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onCancel]);
  const save = (e) => {
    e.preventDefault();
    if (!reason) { setErr('Choose a reason.'); return; }
    if (reason === 'other' && !note.trim()) { setErr('Write a short note for "Other reason".'); return; }
    onConfirm(reason, note.trim());
  };
  return (
    <div className="fixed inset-0 z-[70] mp-overlay bg-slate-900/50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Why was this deal lost?"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <form onSubmit={save} className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 space-y-4">
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 grid place-items-center shrink-0"><XCircle className="w-5 h-5" /></span>
          <div className="flex-1 min-w-0">
            <h2 className="text-[17px] font-semibold">Why was this deal lost?</h2>
            <p className="text-[13px] text-slate-500 truncate">{leadName}</p>
          </div>
          <button type="button" onClick={onCancel} className="w-10 h-10 grid place-items-center rounded-xl hover:bg-slate-100" aria-label="Cancel"><X className="w-5 h-5" /></button>
        </div>
        <fieldset className="grid gap-1.5">
          <legend className="sr-only">Reason</legend>
          {LOST_REASONS.map((r, i) => (
            <label key={r.id} className={`flex items-center gap-3 px-3 min-h-[44px] rounded-xl border cursor-pointer text-[13.5px] transition ${reason === r.id ? 'border-rose-400 bg-rose-50/70 text-rose-900' : 'border-slate-200 hover:border-slate-300'}`}>
              <input ref={i === 0 ? first : undefined} type="radio" name="lost-reason" value={r.id} checked={reason === r.id} onChange={() => { setReason(r.id); setErr(''); }} />
              {r.label}
            </label>
          ))}
        </fieldset>
        <label className="block">
          <span className="block text-[13px] font-semibold mb-1.5">Note {reason === 'other' ? '' : '(optional)'}</span>
          <input value={note} onChange={(e) => { setNote(e.target.value); setErr(''); }} maxLength={200} placeholder="e.g. Al Hamra offered 8% less" className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm" />
        </label>
        {err && <p className="text-sm text-rose-700" role="alert">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="h-11 px-4 rounded-full text-sm font-semibold hover:bg-slate-100">Keep the deal open</button>
          <button type="submit" className="h-11 px-5 rounded-full text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700">Mark as lost</button>
        </div>
      </form>
    </div>
  );
}
