import React, { useEffect, useRef, useState } from 'react';
import { Trophy, CheckCircle2, Flame } from 'lucide-react';
import { playSuccess } from '../../utils/soundService.js';

const COLORS = ['#E1222B', '#3D5AF0', '#F5B301', '#10B981', '#8FA6FF', '#FF8A8F'];
const SIZE = { won: 160, goal: 110, task: 46 };

/** Listens for celebrate() events: confetti burst + a short banner. Pure UI, nothing is saved. */
export default function Celebration() {
  const canvas = useRef(null);
  const [banner, setBanner] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    const reduced = (() => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } })();
    const onEvent = (e) => {
      const { kind = 'task', title, sub } = e.detail || {};
      try { playSuccess(); } catch { /* sound off */ }
      if (title) {
        clearTimeout(timer.current);
        setBanner({ kind, title, sub, key: Date.now() });
        timer.current = setTimeout(() => setBanner(null), kind === 'won' ? 3200 : 2400);
      }
      if (!reduced) burst(canvas.current, SIZE[kind] || 60, kind === 'task');
    };
    window.addEventListener('mp:celebrate', onEvent);
    return () => { window.removeEventListener('mp:celebrate', onEvent); clearTimeout(timer.current); };
  }, []);

  const Icon = banner?.kind === 'won' ? Trophy : banner?.kind === 'goal' ? Flame : CheckCircle2;
  return (
    <>
      <canvas ref={canvas} className="mp-confetti" aria-hidden="true" />
      {banner && (
        <div key={banner.key} className={`mp-cele mp-cele-${banner.kind}`} role="status" aria-live="polite">
          <span className="mp-cele-ic"><Icon className="w-5 h-5" /></span>
          <span className="min-w-0">
            <b className="block truncate">{banner.title}</b>
            {banner.sub && <small className="block truncate">{banner.sub}</small>}
          </span>
        </div>
      )}
    </>
  );
}

function burst(cv, count, small) {
  if (!cv) return;
  const ctx = cv.getContext('2d'); if (!ctx) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = window.innerWidth; const H = window.innerHeight;
  cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const ox = W / 2; const oy = small ? H * 0.55 : H * 0.32;
  const parts = Array.from({ length: count }, () => {
    const a = Math.random() * Math.PI * 2; const s = (small ? 4 : 7) + Math.random() * (small ? 4 : 9);
    return { x: ox, y: oy, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (small ? 3 : 6), r: 3 + Math.random() * 4, c: COLORS[(Math.random() * COLORS.length) | 0], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, shape: Math.random() > 0.5 };
  });
  const start = performance.now(); const life = small ? 900 : 1700;
  const step = (now) => {
    const t = now - start;
    ctx.clearRect(0, 0, W, H);
    if (t > life) return;
    const fade = 1 - Math.max(0, (t - life * 0.6) / (life * 0.4));
    parts.forEach((p) => {
      p.vy += 0.32; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.save(); ctx.globalAlpha = fade; ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c;
      if (p.shape) ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); else { ctx.beginPath(); ctx.arc(0, 0, p.r * 0.7, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    });
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
