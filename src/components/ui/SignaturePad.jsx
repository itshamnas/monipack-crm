import React, { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import { Eraser } from 'lucide-react';

/**
 * Draw-your-signature box (finger, pen or mouse). Sharp on high-density screens.
 * ref.current.toDataURL() gives a PNG; onChange(hasInk) tells the parent when something is drawn.
 */
const SignaturePad = forwardRef(function SignaturePad({ onChange, height = 180, label = 'Sign here' }, ref) {
  const canvas = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);
  const ink = useRef(0);
  const [has, setHas] = useState(false);

  const setup = () => {
    const c = canvas.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const prev = ink.current ? c.toDataURL() : null;
    c.width = Math.round(r.width * dpr);
    c.height = Math.round(r.height * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#0F1E4A'; g.lineWidth = 2.6;
    if (prev) { const im = new Image(); im.onload = () => g.drawImage(im, 0, 0, r.width, r.height); im.src = prev; }
  };
  useEffect(() => {
    setup();
    const ro = new ResizeObserver(() => setup());
    ro.observe(canvas.current);
    return () => ro.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pos = (e) => { const r = canvas.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const down = (e) => { e.preventDefault(); canvas.current.setPointerCapture?.(e.pointerId); drawing.current = true; last.current = pos(e); dot(last.current); };
  const dot = (p) => { const g = canvas.current.getContext('2d'); g.beginPath(); g.arc(p.x, p.y, 1.3, 0, Math.PI * 2); g.fillStyle = '#0F1E4A'; g.fill(); };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const p = pos(e); const g = canvas.current.getContext('2d');
    g.beginPath(); g.moveTo(last.current.x, last.current.y); g.lineTo(p.x, p.y); g.stroke();
    ink.current += Math.hypot(p.x - last.current.x, p.y - last.current.y);
    last.current = p;
    const now = ink.current > 60; // a real signature, not a tap
    if (now !== has) { setHas(now); onChange?.(now); }
  };
  const up = () => { drawing.current = false; };
  const clear = () => {
    const c = canvas.current; c.getContext('2d').clearRect(0, 0, c.width, c.height);
    ink.current = 0; setHas(false); onChange?.(false);
  };
  useImperativeHandle(ref, () => ({ toDataURL: () => canvas.current.toDataURL('image/png'), clear, hasInk: () => ink.current > 60 }));

  return (
    <div>
      <div className="relative rounded-2xl border-2 border-dashed border-slate-300 bg-white overflow-hidden" style={{ height }}>
        <canvas ref={canvas} className="absolute inset-0 w-full h-full touch-none cursor-crosshair" aria-label={label} role="img"
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} />
        {!has && <span className="pointer-events-none absolute inset-0 grid place-items-center text-slate-400 text-[15px]">{label}</span>}
        <span className="pointer-events-none absolute left-5 right-5 bottom-10 border-b border-slate-300" />
      </div>
      <button type="button" onClick={clear} className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-600 min-h-[40px] px-2 rounded-lg hover:bg-slate-100">
        <Eraser className="w-4 h-4" /> Clear signature
      </button>
    </div>
  );
});
export default SignaturePad;
