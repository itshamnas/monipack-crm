/**
 * Soft ripple from the press point on the main buttons. Pure decoration:
 * no layout change (position is only set when the button is static), skipped for reduced motion.
 */
const SELECTOR = '.mp-btn, .mpd-btn, .mp-side-new, .mp-side-quote, .mp-focus-item';

export function installRipples() {
  if (typeof document === 'undefined' || window.__mpRipples) return;
  window.__mpRipples = true;
  const reduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || reduced()) return;
    const host = e.target.closest?.(SELECTOR);
    if (!host || host.disabled) return;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.classList.add('mp-ripple-host');
    const r = host.getBoundingClientRect();
    const d = Math.max(r.width, r.height);
    const s = document.createElement('span');
    s.className = 'mp-ripple';
    s.style.width = s.style.height = `${d}px`;
    s.style.left = `${e.clientX - r.left - d / 2}px`;
    s.style.top = `${e.clientY - r.top - d / 2}px`;
    host.appendChild(s);
    setTimeout(() => s.remove(), 600);
  }, { passive: true, capture: true });
}
