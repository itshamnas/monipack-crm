import React, { useEffect, useRef, useState } from 'react';

/**
 * Counts a figure up to its value, keeping its exact format ("OMR 622.688", "18%", "1,250").
 * Display only: the final text is always exactly the value passed in. Non-numbers render as-is.
 * Reduced-motion users see the final value immediately.
 */
const NUM = /-?\d[\d,]*(?:\.\d+)?/;

function parse(value) {
  const text = String(value ?? '');
  const m = text.match(NUM);
  if (!m) return null;
  const raw = m[0];
  const decimals = raw.includes('.') ? raw.split('.')[1].length : 0;
  return { text, raw, n: Number(raw.replace(/,/g, '')), decimals, commas: raw.includes(','), before: text.slice(0, m.index), after: text.slice(m.index + raw.length) };
}

function format(p, n) {
  let s = n.toFixed(p.decimals);
  if (p.commas) {
    const [i, d] = s.split('.');
    s = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (d ? '.' + d : '');
  }
  return p.before + s + p.after;
}

const reduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

export default function CountUp({ value, duration = 900, className = '' }) {
  const [shown, setShown] = useState(() => {
    const p = parse(value);
    return p && !reduced() ? format(p, 0) : String(value ?? '');
  });
  const from = useRef(0);

  useEffect(() => {
    const p = parse(value);
    if (!p || reduced() || !Number.isFinite(p.n)) { setShown(String(value ?? '')); return undefined; }
    const start = performance.now();
    const a = from.current;
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const e = 1 - Math.pow(2, -10 * t); // ease-out expo
      if (t < 1) { setShown(format(p, a + (p.n - a) * e)); raf = requestAnimationFrame(tick); }
      else { setShown(p.text); from.current = p.n; }
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); from.current = p.n; };
  }, [value, duration]);

  return <span className={`tabular-nums ${className}`}>{shown}</span>;
}
