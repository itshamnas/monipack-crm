/**
 * Sponsorship PDF: the full agreement with the event image, for the approver's own copy and the super admin's
 * approval certificate (which adds the drawn signatures, devices and network addresses).
 * Uses the same Monipack letterhead as every other PDF.
 */
import { openPrintable, tableHtml, kvHtml, esc } from './pdfReport.js';
import { fmtDateTime, omr, whenText, duration } from '../components/sponsorship/SponsorDoc.jsx';

const abs = (u) => (u ? (/^https?:|^data:/.test(u) ? u : `${window.location.origin}${u}`) : '');

function termsHtml(text) {
  return String(text || '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).map((b) => {
    if (b.startsWith('# ')) return `<h3 style="margin:10px 0 4px">${esc(b.slice(2))}</h3>`;
    const m = /^(\d+)\.\s+([^.]{2,80}\.)\s*([\s\S]*)$/.exec(b);
    if (m) return `<p style="margin:0 0 6px"><b>${esc(m[1])}. ${esc(m[2])}</b> ${esc(m[3])}</p>`;
    return `<p style="margin:0 0 6px;white-space:pre-line">${esc(b)}</p>`;
  }).join('');
}

/**
 * ev: the event (doc fields). approvals: [{ name, designation, company, decision, at, typedName?, signature?, ip?, device?, version? }]
 * kind: 'copy' (approver) | 'certificate' (super admin)
 */
export function printSponsorship(ev, approvals = [], { kind = 'copy', forName = '' } = {}) {
  const poster = ev.posterUrl ? `<img src="${esc(abs(ev.posterUrl))}" alt="" style="width:100%;max-height:330px;object-fit:contain;border:1px solid #e2e8f0;border-radius:10px">` : '';
  const details = kvHtml([
    ['Event', ev.title],
    ['Date and time', whenText(ev)],
    ['Daily timing', ev.timeNote],
    ['Duration', duration(ev.startsAt, ev.endsAt)],
    ['Place of event', [ev.venue, ev.venueAddress].filter(Boolean).join(', ')],
    ['Google Maps', ev.mapUrl],
    ['Approximate audience', [ev.audience, ev.audienceNote].filter(Boolean).join(' · ')],
    ['Event coordinator', [ev.coordinatorName, ev.coordinatorPhone].filter(Boolean).join(' · ')],
  ].filter(([, v]) => v));
  const top = poster
    ? `<table style="width:100%;border-collapse:collapse;margin-bottom:8px"><tr><td style="vertical-align:top;padding-right:14px">${details}</td><td style="vertical-align:top;width:34%">${poster}</td></tr></table>`
    : details;

  const signs = approvals.map((a) => {
    const status = a.decision === 'approved' ? 'Approved' : a.decision === 'changes_requested' ? 'Asked for changes' : 'Waiting';
    const color = a.decision === 'approved' ? '#047857' : a.decision === 'changes_requested' ? '#B45309' : '#64748B';
    return `<div style="border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;margin:6px 0;break-inside:avoid;display:flex;gap:14px;align-items:center">
      ${a.signature ? `<img src="${a.signature}" alt="" style="width:190px;height:64px;object-fit:contain;border-bottom:1px solid #94a3b8">` : ''}
      <div style="flex:1"><b>${esc(a.typedName || a.name)}</b><br>${esc(a.designation || '')}${a.company ? ` · ${esc(a.company)}` : ''}
        <br><span style="color:${color};font-weight:700">${status}</span>${a.at ? ` · ${esc(fmtDateTime(a.at))} (Oman time)` : ''}
        ${a.ip ? `<br><span style="color:#64748b;font-size:10.5px">Version ${esc(a.version)} · IP ${esc(a.ip)}${a.device ? ` · ${esc(a.device)}` : ''}</span>` : ''}</div>
    </div>`;
  }).join('');

  const body = `
    ${top}
    <h2>Sponsorship amount: ${esc(omr(ev.totalAmount, ev.currency))}</h2>
    ${tableHtml([{ label: 'Party' }, { label: 'Share', num: true }, { label: 'Amount', num: true }], ev.parties.map((p) => [p.company, `${p.sharePct}%`, omr(p.amount, ev.currency)]))}
    <h2>Marketing materials</h2>
    ${tableHtml([{ label: 'Item' }, { label: 'Qty', num: true }, { label: 'Provided by' }, { label: 'Note' }], ev.materials.map((m) => [m.name, m.qty, m.providedBy, m.note]))}
    ${ev.promotion ? `<h2>How the brands will be promoted</h2><p style="white-space:pre-line">${esc(ev.promotion)}</p>` : ''}
    <h2>Approvals</h2>${signs || '<p>No responses yet.</p>'}
    <h2>Terms and conditions</h2><div style="font-size:11px;line-height:1.55">${termsHtml(ev.terms)}</div>
    <p style="margin-top:12px;color:#64748b;font-size:10px">Version ${esc(ev.version)} · Reference ${esc(String(ev.fingerprint || '').toUpperCase())}</p>`;

  const done = ev.status === 'approved';
  return openPrintable({
    docType: kind === 'certificate' ? 'Sponsorship approval' : 'Sponsorship confirmation',
    title: ev.title,
    subtitle: done ? `Approved by all parties on ${fmtDateTime(ev.approvedAt)}` : (kind === 'certificate' ? 'Approval record (not yet complete)' : `Copy for ${forName}`),
    meta: [['Total', omr(ev.totalAmount, ev.currency)], ['Status', done ? 'Approved' : 'In progress']],
    bodyHtml: body,
  });
}
