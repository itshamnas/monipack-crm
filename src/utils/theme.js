/**
 * Light / dark theme. Preference in localStorage ('monipack_theme_v3' = 'light' | 'dark'); no choice = white glass (light).
 * toggleTheme(event) sweeps the new theme across the screen as a circle growing from the click point
 * (View Transitions API, 650 ms). Browsers without it, or users who asked for reduced motion, switch instantly.
 */
const KEY = 'monipack_theme_v3'; // v3: white glass is the default look, navy optional

export function getThemeChoice() {
  try { return localStorage.getItem(KEY) || 'system'; } catch { return 'system'; }
}

export function resolvedTheme(choice = getThemeChoice()) {
  if (choice === 'dark' || choice === 'light') return choice;
  return 'light'; // white glass is the default for everyone
}

export function applyTheme(theme = resolvedTheme()) {
  const html = document.documentElement;
  html.classList.toggle('dark', theme === 'dark');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#070B1A' : '#FFFFFF');
}

/** Call once at start-up: applies the theme and follows the device while the user has not chosen. */
export function initTheme() {
  applyTheme();
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (getThemeChoice() === 'system') applyTheme();
    });
  } catch { /* old browsers */ }
}

export function toggleTheme(event) {
  const next = resolvedTheme() === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(KEY, next); } catch { /* private mode */ }
  const reduced = (() => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } })();
  if (!document.startViewTransition || reduced) {
    applyTheme(next);
    return next;
  }
  const x = event?.clientX ?? window.innerWidth - 40;
  const y = event?.clientY ?? 32;
  const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const t = document.startViewTransition(() => applyTheme(next));
  t.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: 650, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', pseudoElement: '::view-transition-new(root)' }
    );
  }).catch(() => {});
  return next;
}
