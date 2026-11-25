import React from 'react';
import { Users, MapPin, Phone, Clock, Megaphone, Package, Wallet, ExternalLink, ScrollText } from 'lucide-react';
import { getApiUrl } from '../../api/config.js';

/** The approval document: what the MD and the partner brands read and approve. Also used for the super admin's preview. */
const TZ = 'Asia/Muscat';
export const fmtDate = (d, opt = {}) => (d ? new Date(d).toLocaleString('en-GB', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric', ...opt }) : '');
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
export const omr = (n, cur = 'OMR') => `${cur} ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;

export function duration(a, b) {
  if (!a || !b) return '';
  const ms = new Date(b) - new Date(a);
  if (ms <= 0) return '';
  const days = Math.floor(ms / 86400000); const hrs = Math.round((ms % 86400000) / 3600000);
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'}${hrs ? ` ${hrs} h` : ''}`;
  return `${Math.max(1, Math.round(ms / 3600000))} hour${Math.round(ms / 3600000) === 1 ? '' : 's'}`;
}

export function whenText(doc) {
  if (!doc.startsAt) return doc.timeNote || 'To be confirmed';
  const sameDay = doc.endsAt && fmtDate(doc.startsAt) === fmtDate(doc.endsAt);
  const end = doc.endsAt ? (sameDay ? new Date(doc.endsAt).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }) : fmtDateTime(doc.endsAt)) : '';
  return `${fmtDateTime(doc.startsAt)}${end ? ` to ${end}` : ''}`;
}

/** Terms: "# " lines are headings; "12. Title. Text" clauses get a bold title. */
export function TermsText({ text }) {
  const blocks = String(text || '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="space-y-3 text-[14.5px] leading-relaxed text-slate-700">
      {blocks.map((b, i) => {
        if (b.startsWith('# ')) return <h4 key={i} className="text-[16px] font-bold text-slate-900 pt-1">{b.slice(2)}</h4>;
        const m = /^(\d+)\.\s+([^.]{2,80}\.)\s*([\s\S]*)$/.exec(b);
        if (m) return <p key={i} className="flex gap-3"><span className="font-bold text-slate-900 tabular-nums w-6 shrink-0 text-right">{m[1]}.</span><span><b className="text-slate-900">{m[2]}</b> {m[3]}</span></p>;
        return <p key={i} className="whitespace-pre-line">{b}</p>;
      })}
    </div>
  );
}

const Row = ({ icon: Icon, label, children }) => (
  <div className="flex gap-3 py-3.5 border-b border-slate-100 last:border-0">
    <span className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 grid place-items-center shrink-0"><Icon className="w-[18px] h-[18px]" /></span>
    <div className="min-w-0 flex-1">
      <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-[15px] text-slate-900 mt-0.5 break-words">{children}</div>
    </div>
  </div>
);

export default function SponsorDocument({ doc, myCompany = '' }) {
  const poster = doc.posterUrl ? getApiUrl(doc.posterUrl) : null;
  return (
    <article className="space-y-5">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6 space-y-5 lg:space-y-0">
        {/* Left: the details */}
        <section className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 order-1">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#CC1A22]">Sponsorship confirmation</p>
          <h1 className="text-[26px] sm:text-[32px] leading-tight font-extrabold text-slate-900 mt-1">{doc.title}</h1>
          {poster && (
            <img src={poster} alt={`${doc.title} poster`} className="lg:hidden mt-4 w-full max-h-[420px] object-contain rounded-2xl bg-slate-50 border border-slate-200" />
          )}
          <div className="mt-3">
            <Row icon={Users} label="Approximate audience">{doc.audience || 'To be confirmed'}{doc.audienceNote && <span className="block text-[13.5px] text-slate-600">{doc.audienceNote}</span>}</Row>
            <Row icon={MapPin} label="Place of event">
              <b>{doc.venue || 'To be confirmed'}</b>
              {doc.venueAddress && <span className="block text-[13.5px] text-slate-600">{doc.venueAddress}</span>}
              {doc.mapUrl && (
                <a href={doc.mapUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-full bg-blue-50 text-blue-700 text-[13.5px] font-semibold hover:bg-blue-100">
                  <MapPin className="w-4 h-4" /> Open in Google Maps <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </Row>
            <Row icon={Phone} label="Event coordinator">
              {doc.coordinatorName || 'To be confirmed'}
              {doc.coordinatorPhone && <a href={`tel:${doc.coordinatorPhone.replace(/[^\d+]/g, '')}`} className="block text-blue-700 font-semibold tabular-nums">{doc.coordinatorPhone}</a>}
            </Row>
            <Row icon={Clock} label="Time of event">
              {whenText(doc)}
              {(doc.timeNote && doc.startsAt) && <span className="block text-[13.5px] text-slate-600">{doc.timeNote}</span>}
              {duration(doc.startsAt, doc.endsAt) && <span className="block text-[13px] text-slate-500">Duration: {duration(doc.startsAt, doc.endsAt)}</span>}
            </Row>
          </div>
        </section>
        {/* Right: the event image */}
        {poster && (
          <aside className="hidden lg:block order-2">
            <div className="sticky top-4">
              <img src={poster} alt={`${doc.title} poster`} className="w-full rounded-3xl border border-slate-200 bg-slate-50 object-contain max-h-[620px]" />
            </div>
          </aside>
        )}
      </div>

      <section className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-[18px] font-bold"><Package className="w-5 h-5 text-slate-500" /> Marketing materials</h2>
        {doc.materials.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead className="text-left text-[12px] uppercase tracking-wide text-slate-500"><tr><th className="py-2 pr-3">Item</th><th className="py-2 pr-3 text-right">Qty</th><th className="py-2 pr-3">Provided by</th><th className="py-2">Note</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {doc.materials.map((m) => <tr key={m.id}><td className="py-2.5 pr-3 font-semibold">{m.name}</td><td className="py-2.5 pr-3 text-right tabular-nums">{m.qty}</td><td className="py-2.5 pr-3">{m.providedBy}</td><td className="py-2.5 text-slate-600">{m.note}</td></tr>)}
              </tbody>
            </table>
          </div>
        ) : <p className="mt-2 text-slate-500">To be confirmed.</p>}
        {doc.promotion && (
          <div className="mt-5">
            <h3 className="flex items-center gap-2 text-[15px] font-bold"><Megaphone className="w-4 h-4 text-slate-500" /> How the brands will be promoted</h3>
            <p className="mt-1.5 text-[14.5px] text-slate-700 whitespace-pre-line leading-relaxed">{doc.promotion}</p>
          </div>
        )}
      </section>

      <section className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-[18px] font-bold"><Wallet className="w-5 h-5 text-slate-500" /> Sponsorship amount</h2>
        <div className="mt-3 flex items-baseline justify-between gap-3 p-4 rounded-2xl bg-slate-900 text-white">
          <span className="text-[14px] font-semibold text-slate-300">Total sponsorship</span>
          <span className="text-[24px] font-extrabold tabular-nums">{omr(doc.totalAmount, doc.currency)}</span>
        </div>
        <ul className="mt-3 divide-y divide-slate-100">
          {doc.parties.map((p) => {
            const mine = myCompany && p.company === myCompany;
            return (
              <li key={p.id} className={`flex items-center gap-3 py-3 ${mine ? 'bg-amber-50 -mx-3 px-3 rounded-xl' : ''}`}>
                <span className="flex-1 min-w-0">
                  <b className="block text-[15px] truncate">{p.company}</b>
                  <span className="text-[12.5px] text-slate-500">{p.kind === 'monipack' ? 'Monipack' : 'Partner brand'} · {p.sharePct}% share{mine ? ' · your share' : ''}</span>
                </span>
                <span className="text-[16px] font-bold tabular-nums">{omr(p.amount, doc.currency)}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6" id="sp-terms">
        <h2 className="flex items-center gap-2 text-[18px] font-bold mb-3"><ScrollText className="w-5 h-5 text-slate-500" /> Terms and conditions</h2>
        <TermsText text={doc.terms} />
      </section>
    </article>
  );
}
