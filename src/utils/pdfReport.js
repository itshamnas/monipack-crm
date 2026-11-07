/**
 * Branded printable pages: opens a clean A4 page and the print dialog, where the user picks
 * "Save as PDF". Works for Arabic names too (the browser's own fonts are used).
 */
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

const STYLE = `
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, 'Cairo', sans-serif; color: #0f172a; font-size: 12px; margin: 0; }
  header { display: flex; align-items: center; gap: 12px; border-bottom: 3px solid #CC1A22; padding-bottom: 10px; margin-bottom: 14px; }
  header img { height: 42px; }
  header .co { flex: 1; }
  header .co b { font-size: 15px; display: block; }
  header .co span, header .when { color: #475569; font-size: 11px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 18px 0 6px; }
  p.sub { color: #475569; margin: 0 0 12px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; vertical-align: top; }
  thead th { background: #0f172a; color: #fff; font-size: 11px; text-transform: uppercase; letter-spacing: .03em; }
  tbody tr:nth-child(even) td { background: #f8fafc; }
  table.kv th { width: 34%; background: #f8fafc; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 6px 0 12px; }
  .chip { border: 1px solid #e2e8f0; border-radius: 10px; padding: 6px 10px; }
  .chip b { display: block; font-size: 15px; }
  .num { text-align: right; white-space: nowrap; }
  figure { page-break-before: always; margin: 0; text-align: center; }
  figure img { max-width: 100%; max-height: 245mm; }
  figcaption { color: #475569; margin-top: 6px; }
  footer { margin-top: 16px; color: #94a3b8; font-size: 10px; text-align: center; }
  @media print { thead { display: table-header-group; } tr { page-break-inside: avoid; } }
`;

/** Open the page and the print dialog. bodyHtml is trusted HTML built with esc(). */
export function openPrintable({ title, subtitle = '', bodyHtml, win }) {
  const w = win || window.open('', '_blank');
  if (!w) return false;
  w.document.open();
  const when = new Date().toLocaleString();
  w.document.write(`<!doctype html><html dir="auto"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${STYLE}</style></head><body>
    <header><img src="${window.location.origin}/assets/logo.png" alt=""><div class="co"><b>Morooj Nizwa International LLC</b><span>monipack CRM</span></div><div class="when">${esc(when)}</div></header>
    <h1>${esc(title)}</h1>${subtitle ? `<p class="sub">${esc(subtitle)}</p>` : ''}
    ${bodyHtml}
    <footer>monipack CRM · Morooj Nizwa International LLC · ${esc(when)}</footer>
    <script>window.onload = () => setTimeout(() => window.print(), 400);<\/script>
  </body></html>`);
  w.document.close();
  return true;
}

/** Summary boxes: [[label, value], …] */
export const chipsHtml = (items) => `<div class="chips">${items.map(([l, v]) => `<div class="chip">${esc(l)}<b>${esc(v)}</b></div>`).join('')}</div>`;

/** Table: columns [{ label, num? }], rows [[cell, …]] (cells are plain text) */
export function tableHtml(columns, rows) {
  return `<table><thead><tr>${columns.map((c) => `<th${c.num ? ' class="num"' : ''}>${esc(c.label)}</th>`).join('')}</tr></thead>
    <tbody>${rows.length ? rows.map((r) => `<tr>${r.map((v, i) => `<td${columns[i]?.num ? ' class="num"' : ''}>${esc(v ?? '') || '—'}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${columns.length}">Nothing to show.</td></tr>`}</tbody></table>`;
}

/** Two-column details table: [[label, value], …] */
export const kvHtml = (pairs) => `<table class="kv"><tbody>${pairs.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v ?? '') || '—'}</td></tr>`).join('')}</tbody></table>`;

/** Open the tab right away (pop-up blockers allow it only during the click), fill it later. */
export function openPendingWindow() {
  const w = window.open('', '_blank');
  if (w) w.document.write('<p style="font-family:Arial;padding:24px">Preparing your PDF…</p>');
  return w;
}
