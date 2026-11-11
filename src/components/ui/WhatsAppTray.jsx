import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageCircle, X, Check, AlertCircle } from 'lucide-react';

/**
 * One-tap WhatsApp: after you assign a lead or a task, the alert for the other person waits here.
 * Tap "Send" → your WhatsApp opens with the message ready → press send there.
 * (When the official WhatsApp Business number is connected, messages go automatically and this stays empty.)
 */
const KIND = { lead_salesman: 'New lead', lead_manager: 'Manager alert', task: 'Task' };

export default function WhatsAppTray({ authFetch, refreshKey }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await authFetch('/api/outbox/mine');
      if (!r.ok) return;
      const b = await r.json();
      setItems((b.items || []).filter((x) => x.status === 'manual' || (x.status === 'skipped' && x.error && Date.now() - new Date(x.at) < 3600000)));
    } catch { /* offline */ }
  }, [authFetch]);

  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load, refreshKey]);

  const done = async (m, skip = false) => {
    setItems((list) => list.filter((x) => x.id !== m.id));
    try { await authFetch(`/api/outbox/${m.id}/done`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ skip }) }); } catch { /* ignore */ }
  };
  const send = (m) => {
    window.open(`https://wa.me/${m.toPhone}?text=${encodeURIComponent(m.body)}`, '_blank', 'noopener');
    done(m);
  };

  const toSend = items.filter((x) => x.status === 'manual');
  const noNumber = items.filter((x) => x.status === 'skipped');
  if (!items.length) return null;

  return createPortal(
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed z-[60] right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] lg:bottom-6 inline-flex items-center gap-2 h-11 pl-3 pr-4 rounded-full text-white font-semibold text-[13px] shadow-lg"
        style={{ background: '#128C4A' }}
        aria-label={toSend.length ? `${toSend.length} WhatsApp messages to send` : 'WhatsApp alerts that could not be sent'}
      >
        <MessageCircle className="w-5 h-5" aria-hidden="true" />
        {toSend.length ? `${toSend.length} to send` : `${noNumber.length} need a number`}
      </button>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="wa-h" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="w-full sm:max-w-lg max-h-[85vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl">
            <div className="sticky top-0 bg-white flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h2 id="wa-h" className="font-bold text-[16px]">WhatsApp alerts to send</h2>
                <p className="text-[12px] text-slate-500">Tap Send, then press send in WhatsApp.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="w-9 h-9 grid place-items-center rounded-full hover:bg-slate-100" aria-label="Close"><X className="w-5 h-5" /></button>
            </div>
            <ul className="divide-y divide-slate-100">
              {toSend.map((m) => (
                <li key={m.id} className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <b className="text-[14px]">{m.toName || m.toPhone}</b>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">{KIND[m.kind] || 'Alert'}</span>
                  </div>
                  <pre className="mt-2 text-[12px] text-slate-600 whitespace-pre-wrap font-sans bg-slate-50 rounded-lg p-2.5 max-h-36 overflow-y-auto">{m.body}</pre>
                  <div className="flex gap-2 mt-2.5">
                    <button type="button" onClick={() => send(m)} className="flex-1 h-10 rounded-xl text-white font-semibold text-[13px] inline-flex items-center justify-center gap-1.5" style={{ background: '#128C4A' }}><MessageCircle className="w-4 h-4" /> Send</button>
                    <button type="button" onClick={() => done(m, true)} className="h-10 px-4 rounded-xl border border-slate-200 text-[13px] font-semibold text-slate-600">Skip</button>
                  </div>
                </li>
              ))}
              {noNumber.map((m) => (
                <li key={m.id} className="p-4 flex items-start gap-2.5 text-[12.5px]">
                  <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" aria-hidden="true" />
                  <span className="flex-1">No WhatsApp number for <b>{m.toName || 'this person'}</b>. Add it in Settings → Staff logins (or Salesmen &amp; links).</span>
                  <button type="button" onClick={() => setItems((l) => l.filter((x) => x.id !== m.id))} className="text-slate-500" aria-label="Dismiss"><Check className="w-4 h-4" /></button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}
