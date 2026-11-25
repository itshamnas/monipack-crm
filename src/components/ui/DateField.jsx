import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight, X, Clock } from 'lucide-react';
import Sheet from './Sheet.jsx';

/**
 * Friendly date / date-and-time picker that looks the same on every phone, tablet and computer.
 * Drop-in for <input type="date"> and <input type="datetime-local">: value and onChange use the same text
 * ("2026-12-20" or "2026-12-20T16:00", local time), so each page keeps its own conversions.
 * Phones: a bottom sheet. Bigger screens: a calendar under the field.
 */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(String(v || ''));
  return m ? { y: +m[1], mo: +m[2] - 1, d: +m[3], h: m[4] != null ? +m[4] : null, mi: m[5] != null ? +m[5] : null } : null;
};
const label12 = (h, mi) => `${((h + 11) % 12) + 1}:${pad(mi)} ${h < 12 ? 'AM' : 'PM'}`;
export function prettyDate(v, withTime) {
  const p = parse(v);
  if (!p) return '';
  const d = new Date(p.y, p.mo, p.d);
  const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  return withTime && p.h != null ? `${day} · ${label12(p.h, p.mi)}` : day;
}
const QUICK_TIMES = [[9, 0], [10, 0], [12, 0], [14, 0], [16, 0], [18, 0], [20, 0]];

function Calendar({ value, withTime, min, max, onPick, onClose, onClear, allowClear }) {
  const now = new Date();
  const p = parse(value);
  const [view, setView] = useState(() => (p ? { y: p.y, m: p.mo } : { y: now.getFullYear(), m: now.getMonth() }));
  const [day, setDay] = useState(p ? ymd(new Date(p.y, p.mo, p.d)) : '');
  const [h, setH] = useState(p?.h ?? 10);
  const [mi, setMi] = useState(p?.mi ?? 0);
  const minD = min ? String(min).slice(0, 10) : ''; const maxD = max ? String(max).slice(0, 10) : '';
  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1);
    const start = new Date(view.y, view.m, 1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }, [view]);
  const today = ymd(now);
  const out = (d) => (withTime ? `${d}T${pad(h)}:${pad(mi)}` : d);
  const choose = (d) => { setDay(d); if (!withTime) { onPick(d); onClose(); } };
  const shift = (n) => setView((v) => { const d = new Date(v.y, v.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const quick = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); const s = ymd(d); setView({ y: d.getFullYear(), m: d.getMonth() }); choose(s); };
  const grid = useRef(null);
  const onKey = (e) => {
    if (!day) return;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!step) return;
    e.preventDefault();
    const p2 = parse(day); const d = new Date(p2.y, p2.mo, p2.d + step); setDay(ymd(d)); setView({ y: d.getFullYear(), m: d.getMonth() });
    setTimeout(() => grid.current?.querySelector('[aria-selected="true"]')?.focus(), 0);
  };

  return (
    <div className="mp-cal">
      <div className="flex flex-wrap gap-1.5 mb-3">
        {[['Today', 0], ['Tomorrow', 1], ['In a week', 7]].map(([l, o]) => (
          <button key={l} type="button" onClick={() => quick(o)} className="mp-cal-chip">{l}</button>
        ))}
      </div>
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={() => shift(-1)} className="mp-cal-nav" aria-label="Previous month"><ChevronLeft className="w-5 h-5" /></button>
        <b className="text-[15px]" aria-live="polite">{MONTHS[view.m]} {view.y}</b>
        <button type="button" onClick={() => shift(1)} className="mp-cal-nav" aria-label="Next month"><ChevronRight className="w-5 h-5" /></button>
      </div>
      <div className="grid grid-cols-7 text-center text-[11.5px] font-bold text-slate-400 mb-1" aria-hidden="true">{DAYS.map((d) => <span key={d}>{d}</span>)}</div>
      <div ref={grid} className="grid grid-cols-7 gap-1" role="grid" aria-label={`${MONTHS[view.m]} ${view.y}`} onKeyDown={onKey}>
        {cells.map((c) => {
          const s = ymd(c);
          const off = c.getMonth() !== view.m;
          const dis = (minD && s < minD) || (maxD && s > maxD);
          const sel = s === day;
          return (
            <button key={s} type="button" role="gridcell" aria-selected={sel} disabled={dis} tabIndex={sel || (!day && s === today) ? 0 : -1}
              aria-label={c.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              onClick={() => choose(s)}
              className={`mp-cal-day ${off ? 'off' : ''} ${s === today ? 'today' : ''} ${sel ? 'sel' : ''}`}>{c.getDate()}</button>
          );
        })}
      </div>
      {withTime && (
        <div className="mt-4">
          <span className="flex items-center gap-1.5 text-[12.5px] font-bold text-slate-600 mb-2"><Clock className="w-4 h-4" /> Time</span>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_TIMES.map(([qh, qm]) => (
              <button key={qh} type="button" onClick={() => { setH(qh); setMi(qm); }} aria-pressed={h === qh && mi === qm} className="mp-cal-chip">{label12(qh, qm)}</button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <label className="sr-only" htmlFor="mp-cal-h">Hour</label>
            <select id="mp-cal-h" value={h} onChange={(e) => setH(+e.target.value)} className="mp-cal-sel">
              {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{((i + 11) % 12) + 1} {i < 12 ? 'AM' : 'PM'}</option>)}
            </select>
            <span className="font-bold">:</span>
            <label className="sr-only" htmlFor="mp-cal-m">Minutes</label>
            <select id="mp-cal-m" value={mi} onChange={(e) => setMi(+e.target.value)} className="mp-cal-sel">
              {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => <option key={m} value={m}>{pad(m)}</option>)}
            </select>
          </div>
        </div>
      )}
      <div className="mt-4 flex gap-2">
        {allowClear && <button type="button" onClick={() => { onClear(); onClose(); }} className="mp-cal-btn ghost">Clear</button>}
        <button type="button" onClick={onClose} className="mp-cal-btn ghost">Cancel</button>
        {withTime && <button type="button" disabled={!day} onClick={() => { onPick(out(day)); onClose(); }} className="mp-cal-btn">Done</button>}
      </div>
    </div>
  );
}

export default function DateField({ value, onChange, withTime = false, min, max, placeholder, className = '', id, disabled, allowClear = true, 'aria-label': ariaLabel }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btn = useRef(null);
  const phone = typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
  useEffect(() => {
    if (!open || phone) return undefined;
    const place = () => {
      const r = btn.current.getBoundingClientRect();
      const w = 320; const hgt = withTime ? 560 : 430;
      const left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
      const below = r.bottom + 6 + hgt < window.innerHeight;
      setPos({ left, top: below ? r.bottom + 6 : Math.max(8, r.top - hgt - 6) });
    };
    place();
    const off = (e) => { if (!btn.current?.contains(e.target) && !e.target.closest?.('.mp-cal-pop')) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    document.addEventListener('mousedown', off); document.addEventListener('keydown', esc);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc); };
  }, [open, phone, withTime]);
  const text = prettyDate(value, withTime);
  const cal = <Calendar value={value} withTime={withTime} min={min} max={max} allowClear={allowClear && !!value} onPick={onChange} onClear={() => onChange('')} onClose={() => { setOpen(false); btn.current?.focus(); }} />;
  return (
    <>
      <button ref={btn} id={id} type="button" disabled={disabled} onClick={() => setOpen((v) => !v)} aria-haspopup="dialog" aria-expanded={open} aria-label={ariaLabel ? `${ariaLabel}: ${text || 'not set'}` : undefined}
        className={`mp-datefield ${className}`}>
        <CalendarDays className="w-4 h-4 shrink-0 text-slate-500" aria-hidden="true" />
        <span className={`flex-1 text-left truncate ${text ? '' : 'text-slate-400'}`}>{text || placeholder || (withTime ? 'Choose date and time' : 'Choose a date')}</span>
        {allowClear && value && !disabled && (
          <span role="button" tabIndex={-1} aria-label="Clear" onClick={(e) => { e.stopPropagation(); onChange(''); }} className="w-6 h-6 grid place-items-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"><X className="w-3.5 h-3.5" /></span>
        )}
      </button>
      {open && (phone
        ? <Sheet open onClose={() => setOpen(false)} title={withTime ? 'Date and time' : 'Choose a date'}>{cal}</Sheet>
        : pos && createPortal(<div className="mp-cal-pop" role="dialog" aria-label={withTime ? 'Choose date and time' : 'Choose a date'} style={{ left: pos.left, top: pos.top }}>{cal}</div>, document.body))}
    </>
  );
}
