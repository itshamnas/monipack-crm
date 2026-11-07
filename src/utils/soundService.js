/**
 * Tactile UI sounds, synthesised with the Web Audio API (no audio files, no network).
 *
 * - playClick(): a short mechanical "pop" for buttons, tabs and switches
 * - playTick(): a tiny ratchet tick for sliders, steppers and quantity changes (throttled to one per 20 ms)
 * - playSuccess() / playError(): soft two-note cues for saves and failures
 * - isSoundOn() / setSoundOn() / toggleSound(): preference saved in localStorage ('monipack_sound')
 * - installGlobalSounds(): one listener for the whole app, so no component has to change
 *
 * Sounds are quiet by design, never play before the first user gesture (browser rule),
 * and stay silent when the user has asked the system for reduced motion and never chose sound.
 */

const KEY = 'monipack_sound';
let ctx = null;
let lastTick = 0;
const listeners = new Set();

function storedPref() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export function isSoundOn() {
  const v = storedPref();
  if (v === 'on') return true;
  if (v === 'off') return false;
  // No choice yet: on, unless the system asks for reduced motion
  try { return !window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return true; }
}

export function setSoundOn(on) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* private mode */ }
  listeners.forEach((fn) => fn(on));
  if (on) playClick(1000, 0.03);
}

export function toggleSound() {
  const next = !isSoundOn();
  setSoundOn(next);
  return next;
}

/** Subscribe to on/off changes (for the header toggle). Returns an unsubscribe function. */
export function onSoundChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function audio() {
  if (!isSoundOn()) return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function blip({ type = 'triangle', from, to, duration, gain = 0.05, delay = 0 }) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + duration);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.002);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(amp).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.01);
}

/** Mechanical switch pop: triangle wave falling from `freq` to 140 Hz. */
export function playClick(freq = 850, duration = 0.025) {
  blip({ type: 'triangle', from: freq, to: 140, duration, gain: 0.06 });
}

/** Ratchet tick for continuous controls, at most one per 20 ms. */
export function playTick(pitch = 1200) {
  const now = performance.now();
  if (now - lastTick < 20) return;
  lastTick = now;
  blip({ type: 'sine', from: pitch, to: 280, duration: 0.012, gain: 0.035 });
}

export function playSuccess() {
  blip({ type: 'sine', from: 880, to: 870, duration: 0.07, gain: 0.04 });
  blip({ type: 'sine', from: 1320, to: 1300, duration: 0.09, gain: 0.04, delay: 0.07 });
}

export function playError() {
  blip({ type: 'triangle', from: 320, to: 200, duration: 0.12, gain: 0.05 });
}

/**
 * One delegated listener for the whole app:
 * buttons, links styled as buttons, tabs, checkboxes, radios and selects click;
 * range sliders, number inputs and steppers tick.
 * Opt out on any element with data-sound="off".
 */
export function installGlobalSounds() {
  if (window.__monipackSounds) return;
  window.__monipackSounds = true;

  document.addEventListener('pointerdown', (e) => {
    const el = e.target.closest?.('button, [role="tab"], [role="radio"], [role="switch"], a[href], summary, label, input[type="checkbox"], input[type="radio"], select');
    if (!el || el.closest('[data-sound="off"]')) return;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    // Tabs and toggles a little higher than plain buttons
    const role = el.getAttribute('role');
    playClick(role === 'tab' || role === 'switch' ? 980 : 850);
  }, { capture: true, passive: true });

  document.addEventListener('input', (e) => {
    const t = e.target;
    if (!t || t.closest?.('[data-sound="off"]')) return;
    if (t.type === 'range' || t.type === 'number') playTick(t.type === 'range' ? 1200 : 1000);
  }, { capture: true, passive: true });
}
