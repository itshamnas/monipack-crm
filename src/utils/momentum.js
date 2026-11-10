/**
 * Personal momentum: how much each person got done today, and how many days in a row they have worked in the CRM.
 * Kept in this browser only (localStorage, per user). It never changes business data.
 *
 * Psychology used (honestly, no dark patterns):
 *  - goal gradient: a daily goal ring that fills as you work, people speed up as they near a goal
 *  - streaks / consistency: "5 days in a row" makes opening the CRM every working day a habit
 *  - immediate feedback: every saved action counts right away
 * Fridays are skipped when counting streaks (Oman weekend), so a weekend never breaks a streak.
 */
const KEY = (uid) => `mp_momentum_${uid || 'anon'}`;
const listeners = new Set();

export const DAILY_GOAL = { super_admin: 5, manager: 8, customer_care: 15, salesman: 8 };
export const goalFor = (role) => DAILY_GOAL[role] || 8;

const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function read(uid) {
  try {
    const v = JSON.parse(localStorage.getItem(KEY(uid)) || '{}');
    return { days: v.days && typeof v.days === 'object' ? v.days : {}, best: Number(v.best) || 0, goalHit: v.goalHit || '' };
  } catch { return { days: {}, best: 0, goalHit: '' }; }
}
function write(uid, data) {
  // keep 60 days only
  const keys = Object.keys(data.days).sort();
  while (keys.length > 60) delete data.days[keys.shift()];
  try { localStorage.setItem(KEY(uid), JSON.stringify(data)); } catch { /* private mode */ }
}

function streakOf(days) {
  let n = 0;
  const d = new Date();
  if (!days[dayKey(d)]) d.setDate(d.getDate() - 1); // today not started yet: count up to yesterday
  for (let i = 0; i < 400; i++) {
    if (d.getDay() === 5 && !days[dayKey(d)]) { d.setDate(d.getDate() - 1); continue; } // Friday off
    if (!days[dayKey(d)]) break;
    n++; d.setDate(d.getDate() - 1);
  }
  return n;
}

export function getMomentum(uid, role) {
  const data = read(uid);
  const today = data.days[dayKey()] || 0;
  const streak = streakOf(data.days);
  const week = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return { day: d.toLocaleDateString('en-GB', { weekday: 'narrow' }), n: data.days[dayKey(d)] || 0 }; });
  return { today, goal: goalFor(role), streak, best: Math.max(data.best, streak), week };
}

/** Count one finished action. Returns { today, goal, reachedGoal } so the caller can celebrate the moment the goal is reached. */
export function recordAction(uid, role) {
  if (!uid) return null;
  const data = read(uid);
  const k = dayKey();
  data.days[k] = (data.days[k] || 0) + 1;
  const streak = streakOf(data.days);
  data.best = Math.max(data.best, streak);
  const goal = goalFor(role);
  const reachedGoal = data.days[k] >= goal && data.goalHit !== k;
  if (reachedGoal) data.goalHit = k;
  write(uid, data);
  listeners.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
  return { today: data.days[k], goal, streak, reachedGoal };
}

export function onMomentumChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
