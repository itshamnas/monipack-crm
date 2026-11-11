/**
 * Every form field gets an id (and, when it has no label at all, an aria-label), so the browser can
 * autofill properly and screen readers can announce it. Fields that already have an id or name are left alone.
 * Runs once at start-up and again whenever React adds new fields.
 */
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
let n = 0;

function hasLabel(el) {
  if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.title) return true;
  if (el.closest('label')) return true;
  return Boolean(el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`));
}

function fix(el) {
  if (el.type === 'hidden' || el.dataset.mpNamed) return;
  el.dataset.mpNamed = '1';
  const text = el.getAttribute('aria-label') || el.placeholder || (el.tagName === 'SELECT' && el.options[0]?.text) || el.closest('label')?.textContent || '';
  // An id, not a name: React clears a `name` it did not set when it re-renders an input
  if (!el.id && !el.name) el.id = `f-${slug(text) || el.tagName.toLowerCase()}-${++n}`;
  if (!hasLabel(el) && text) el.setAttribute('aria-label', text.trim().slice(0, 80));
}

function scan(root) {
  if (root.nodeType !== 1) return;
  if (root.matches?.('input, select, textarea')) fix(root);
  root.querySelectorAll?.('input:not([data-mp-named]), select:not([data-mp-named]), textarea:not([data-mp-named])').forEach(fix);
}

export function installFieldNames() {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
  scan(document.body);
  new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach(scan))).observe(document.body, { childList: true, subtree: true });
}
