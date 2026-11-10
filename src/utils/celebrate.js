/**
 * Celebrations: a short confetti burst + a banner for real wins (deal won, task done, daily goal).
 * Rendered by <Celebration /> (components/ui/Celebration.jsx). Respects reduced motion.
 * kind: 'won' (big), 'goal' (medium), 'task' (small)
 */
export function celebrate(kind, title, sub) {
  try { window.dispatchEvent(new CustomEvent('mp:celebrate', { detail: { kind, title, sub } })); } catch { /* old browsers */ }
}
