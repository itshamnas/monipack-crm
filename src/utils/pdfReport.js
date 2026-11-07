/**
 * Branded printable documents (print → "Save as PDF") with the company letterhead and footer on every page.
 * Arabic names work too (the browser's own fonts are used).
 *
 * openPrintable({ docType, title, subtitle, meta: [[label, value], …], bodyHtml, win })
 *   docType  – what the document is ("Customer profile", "Daily report") shown top-right, like "QUOTATION"
 *   meta     – the reference block under it (Customer #, Date, Prepared by …); Ref, Date and Prepared by are added
 */
import { getApiUrl } from '../api/config.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

const FALLBACK = {
  companyName: 'Morooj Nizwa International LLC',
  companyNameAr: 'شركة مروج نزوى العالمية ش.م.م',
  headquarters: 'Ghala, Muscat, Sultanate of Oman',
  phone: '+968 79062219',
  email: 'info@monipack.com',
  website: 'www.monipack.com',
};

let companyPromise = null;
/** Company details from Settings (cached for the session). */
export function getCompany() {
  if (!companyPromise) {
    const token = (() => { try { return localStorage.getItem('monipack_auth_token') || ''; } catch { return ''; } })();
    companyPromise = fetch(getApiUrl('/api/company'), { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : {}))
      .then((c) => ({ ...FALLBACK, ...Object.fromEntries(Object.entries(c || {}).filter(([, v]) => v)) }))
      .catch(() => ({ ...FALLBACK }));
  }
  return companyPromise;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');
const niceNow = (d) => `${d.getDate()} ${MONTHS.at(d.getMonth())} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
const refFor = (docType, d) => `${String(docType || 'DOC').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'DOC'}-${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
const currentUserName = () => { try { return JSON.parse(localStorage.getItem('monipack_auth_user') || '{}').name || ''; } catch { return ''; } };

const STYLE = `
  @page {
    size: A4; margin: 12mm 12mm 16mm;
    @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 9px Arial, sans-serif; color: #94a3b8; }
  }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; }
  body { font-family: Inter, Arial, 'Cairo', sans-serif; color: #0f172a; font-size: 11.5px; line-height: 1.45; }
  .sheet { max-width: 186mm; margin: 0 auto; padding: 18px 0; }
  table.frame { width: 100%; border-collapse: collapse; }
  table.frame > thead > tr > td, table.frame > tfoot > tr > td, table.frame > tbody > tr > td { padding: 0; border: 0; }
  .lh { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; padding-bottom: 10px; border-bottom: 3px solid #CC1A22; margin-bottom: 14px; }
  .lh-left { display: flex; gap: 12px; align-items: flex-start; min-width: 0; }
  .lh-left img { width: 70px; height: auto; }
  .co b { display: block; font-size: 13.5px; }
  .co .ar { font-family: 'Cairo', Arial, sans-serif; font-weight: 700; font-size: 12px; color: #1e293b; }
  .co span { display: block; color: #475569; font-size: 10.5px; }
  .co .legal { color: #334155; font-weight: 600; }
  .lh-right { text-align: right; flex-shrink: 0; }
  .doctype { font-size: 19px; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; margin: 0 0 6px; }
  .meta { margin-left: auto; border-collapse: collapse; font-size: 10.5px; }
  .meta td { padding: 1px 0; text-align: right; }
  .meta td.k { color: #64748b; text-align: left; padding-right: 12px; }
  .meta td.v { font-weight: 700; }
  h1 { font-size: 17px; margin: 0 0 2px; }
  p.sub { color: #475569; margin: 0 0 12px; }
  h2 { font-size: 11px; margin: 18px 0 6px; text-transform: uppercase; letter-spacing: .14em; color: #CC1A22; }
  table.data { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  table.data th { background: #0f172a; color: #fff; font-size: 9.5px; text-transform: uppercase; letter-spacing: .05em; text-align: left; padding: 6px 7px; }
  table.data td { border-bottom: 1px solid #e2e8f0; padding: 5px 7px; vertical-align: top; }
  table.data tbody tr:nth-child(even) td { background: #f8fafc; }
  table.data .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  table.kv { width: 100%; border-collapse: collapse; font-size: 11px; }
  table.kv th { width: 34%; text-align: left; color: #475569; font-weight: 600; padding: 5px 8px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; }
  table.kv td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; }
  .chips { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; margin: 8px 0 12px; }
  .chip { border: 1px solid #e2e8f0; border-radius: 8px; padding: 7px 10px; font-size: 9.5px; color: #64748b; text-transform: uppercase; letter-spacing: .05em; }
  .chip b { display: block; font-size: 15px; color: #0f172a; letter-spacing: 0; text-transform: none; margin-top: 2px; }
  .note { padding: 8px 10px; border-left: 3px solid #CC1A22; background: #fef2f2; margin: 8px 0; }
  figure { page-break-before: always; margin: 0; text-align: center; }
  figure img { max-width: 100%; max-height: 225mm; }
  figcaption { color: #475569; margin-top: 6px; }
  .ft { margin-top: 18px; padding-top: 8px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: 8.5px; color: #94a3b8; }
  .ft .brands img { height: 16px; margin-right: 12px; vertical-align: middle; }
  thead { display: table-header-group; } tfoot { display: table-footer-group; }
  tr { page-break-inside: avoid; }
`;

function letterhead(c, docType, meta) {
  const legal = [c.crNumber && `CR No. ${esc(c.crNumber)}`, c.vatNumber && `VATIN ${esc(c.vatNumber)}`].filter(Boolean).join(' · ');
  return `<div class="lh">
    <div class="lh-left">
      <img src="${window.location.origin}/brands/monipack-cropped.png" alt="">
      <div class="co">
        <b>${esc(c.companyName)}</b>
        ${c.companyNameAr ? `<div class="ar" dir="rtl" style="text-align:left">${esc(c.companyNameAr)}</div>` : ''}
        <span>${esc(c.headquarters)}${c.poBox ? ` · ${esc(c.poBox)}` : ''}</span>
        <span>${[c.phone, c.email, c.website].filter(Boolean).map(esc).join(' · ')}</span>
        ${legal ? `<span class="legal">${legal}</span>` : ''}
      </div>
    </div>
    <div class="lh-right">
      <div class="doctype">${esc(docType)}</div>
      <table class="meta"><tbody>${meta.map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td class="v">${esc(v)}</td></tr>`).join('')}</tbody></table>
    </div>
  </div>`;
}

function footer(c, when) {
  const origin = window.location.origin;
  return `<div class="ft">
    <div class="brands">
      <img src="${origin}/brands/monipack-cropped.png" alt=""><img src="${origin}/brands/moniclean-cropped.png" alt=""><img src="${origin}/brands/kohe-cropped.png" alt="" style="height:11px"><img src="${origin}/brands/monifood-cropped.png" alt="">
    </div>
    <div style="text-align:right">${esc(c.companyName)}${c.crNumber ? ` · CR ${esc(c.crNumber)}` : ''} · Confidential<br>Generated by monipack CRM on ${esc(when)}</div>
  </div>`;
}

/** Open the tab right away (pop-up blockers allow it only during the click), fill it later. */
export function openPendingWindow() {
  const w = window.open('', '_blank');
  if (w) w.document.write('<p style="font-family:Arial;padding:24px;color:#475569">Preparing your PDF…</p>');
  return w;
}

/** Open the document and the print dialog. bodyHtml is trusted HTML built with esc(). Returns false if pop-ups are blocked. */
export function openPrintable({ docType = 'Report', title, subtitle = '', meta = [], bodyHtml, win }) {
  const w = win || openPendingWindow();
  if (!w) return false;
  const now = new Date();
  const when = niceNow(now);
  const by = currentUserName();
  const fullMeta = [['Ref', refFor(docType, now)], ...meta, ['Date', when], ...(by ? [['Prepared by', by]] : [])];
  getCompany().then((c) => {
    w.document.open();
    w.document.write(`<!doctype html><html dir="auto"><head><meta charset="utf-8"><title>${esc(title)} · ${esc(docType)}</title><style>${STYLE}</style></head><body><div class="sheet">
      <table class="frame">
        <thead><tr><td>${letterhead(c, docType, fullMeta)}</td></tr></thead>
        <tbody><tr><td>
          <h1>${esc(title)}</h1>${subtitle ? `<p class="sub">${esc(subtitle)}</p>` : ''}
          ${bodyHtml}
        </td></tr></tbody>
        <tfoot><tr><td>${footer(c, when)}</td></tr></tfoot>
      </table>
      <script>window.onload = () => setTimeout(() => window.print(), 500);<\/script>
    </div></body></html>`);
    w.document.close();
  });
  return true;
}

/** Summary boxes: [[label, value], …] */
export const chipsHtml = (items) => `<div class="chips">${items.map(([l, v]) => `<div class="chip">${esc(l)}<b>${esc(v)}</b></div>`).join('')}</div>`;

/** Table: columns [{ label, num? }], rows [[cell, …]] (cells are plain text) */
export function tableHtml(columns, rows) {
  return `<table class="data"><thead><tr>${columns.map((c) => `<th${c.num ? ' class="num"' : ''}>${esc(c.label)}</th>`).join('')}</tr></thead>
    <tbody>${rows.length ? rows.map((r) => `<tr>${r.map((v, i) => `<td${columns[i]?.num ? ' class="num"' : ''}>${esc(v ?? '') || '—'}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${columns.length}">Nothing to show.</td></tr>`}</tbody></table>`;
}

/** Two-column details table: [[label, value], …] */
export const kvHtml = (pairs) => `<table class="kv"><tbody>${pairs.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v ?? '') || '—'}</td></tr>`).join('')}</tbody></table>`;

/** Highlighted note line (e.g. "Still missing: …") */
export const noteHtml = (html) => `<div class="note">${html}</div>`;
