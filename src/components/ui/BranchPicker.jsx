import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, Check, ChevronsUpDown, MapPin } from 'lucide-react';
import { photoOf, usePeopleVersion } from '../../utils/people.js';
import { getApiUrl } from '../../api/config.js';

/**
 * Searchable branch & sales-rep picker (replaces the long native dropdown).
 * Same value/onChange contract as the <select> it replaces: value is a branch id (or name), 'all' for all branches.
 * Desktop: popover under the button. Phones: bottom sheet. Keyboard: ↑ ↓ Enter Esc.
 */
const initials = (s = '') => s.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '—';
const hue = (s = '') => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
export const avatarStyle = (s) => ({ background: `linear-gradient(135deg, hsl(${hue(s)} 62% 52%), hsl(${(hue(s) + 30) % 360} 58% 38%))` });
/** The salesman's photo when there is one, else coloured initials */
const face = (name) => {
  const url = photoOf(name);
  return url
    ? <img className="mp-bp-av object-cover" src={getApiUrl(url)} alt="" aria-hidden="true" />
    : <span className="mp-bp-av" style={avatarStyle(name || '')}>{initials(name)}</span>;
};
const keyOf = (b) => String(b.id ?? b.name);

export default function BranchPicker({
  value,
  onChange,
  branches = [],
  allowAll = true,
  allLabel = 'All branches & reps',
  variant = 'light', // 'dark' = sidebar trigger, 'light' = form field
  placeholder = 'Choose branch / hub',
  id,
  disabled = false,
}) {
  usePeopleVersion();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [act, setAct] = useState(0);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const selected = branches.find((b) => keyOf(b) === String(value));
  const isAll = allowAll && (value === 'all' || value === undefined || value === null || value === '');

  // Flat option list (grouped by city / governorate) filtered by the search text
  const options = useMemo(() => {
    const t = q.trim().toLowerCase();
    const out = [];
    if (allowAll && (!t || allLabel.toLowerCase().includes(t) || 'all'.includes(t))) out.push({ all: true });
    const groups = new Map();
    for (const b of branches) {
      const hay = `${b.name || ''} ${b.city || ''} ${b.salesman || ''}`.toLowerCase();
      if (t && !hay.includes(t)) continue;
      const g = b.type === 'b2b' ? 'B2B branches (route / wholesale)' : 'Retail branches (shops)';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(b);
    }
    for (const [g, list] of groups) {
      out.push({ group: g, count: list.length });
      for (const b of list) out.push({ b });
    }
    return out;
  }, [branches, q, allowAll, allLabel]);
  const choices = options.filter((o) => !o.group);

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const w = Math.min(420, window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    const below = window.innerHeight - r.bottom - 12;
    const maxH = Math.min(520, Math.max(260, below));
    const top = below >= 260 ? r.bottom + 8 : Math.max(8, r.top - maxH - 8);
    setPos({ left, top, width: w, maxH });
  };

  useLayoutEffect(() => { if (open) place(); }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const onWin = () => place();
    window.addEventListener('resize', onWin);
    window.addEventListener('scroll', onWin, true);
    const t = setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 30);
    return () => { window.removeEventListener('resize', onWin); window.removeEventListener('scroll', onWin, true); clearTimeout(t); };
  }, [open]);
  useEffect(() => { setAct(0); }, [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${act}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [act]);

  const close = () => { setOpen(false); setQ(''); btnRef.current?.focus({ preventScroll: true }); };
  const pick = (o) => { onChange(o.all ? 'all' : keyOf(o.b)); close(); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAct((a) => (a + 1) % Math.max(1, choices.length)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAct((a) => (a - 1 + choices.length) % Math.max(1, choices.length)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (choices[act]) pick(choices[act]); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  };

  const label = isAll ? allLabel : selected ? `${selected.name}${selected.city ? ` (${selected.city})` : ''}` : placeholder;
  const sub = isAll ? `${branches.length} hubs across Oman` : selected?.salesman ? `Rep: ${selected.salesman}` : '';
  const who = isAll ? 'ALL' : initials(selected?.salesman || selected?.name);

  let ci = -1;
  return (
    <>
      <button
        ref={btnRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={variant === 'dark' ? 'mp-bp-trigger mp-bp-dark' : 'mp-bp-trigger mp-bp-light'}
      >
        {isAll ? <span className="mp-bp-av">{who}</span> : face(selected?.salesman || selected?.name || '')}
        <span className="mp-bp-txt"><b>{label}</b>{sub && <small>{sub}</small>}</span>
        <ChevronsUpDown className="mp-bp-chev" aria-hidden="true" />
      </button>

      {open && pos && createPortal(
        <div className="mp-bp-layer" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div className="mp-bp-pop" role="dialog" aria-label="Choose branch and sales rep" style={{ left: pos.left, top: pos.top, width: pos.width, maxHeight: pos.maxH }}>
            <div className="mp-bp-search">
              <Search className="w-4 h-4" aria-hidden="true" />
              <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Search branch, area or rep…" aria-label="Search branch, area or rep" data-sound="off" />
              <kbd>Esc</kbd>
            </div>
            <div className="mp-bp-list" ref={listRef} role="listbox">
              {options.map((o) => {
                if (o.group) return <div key={`g-${o.group}`} className="mp-bp-group"><span>{o.group}</span><span>{o.count}</span></div>;
                ci += 1;
                const i = ci;
                const on = o.all ? isAll : keyOf(o.b) === String(value);
                return (
                  <button
                    key={o.all ? 'all' : keyOf(o.b)}
                    type="button"
                    role="option"
                    aria-selected={on}
                    data-i={i}
                    className={`mp-bp-opt${i === act ? ' act' : ''}${on ? ' sel' : ''}`}
                    onMouseEnter={() => setAct(i)}
                    onClick={() => pick(o)}
                  >
                    {o.all ? (
                      <><span className="mp-bp-av mp-bp-all">ALL</span><span className="mp-bp-txt"><b>{allLabel}</b><small>{branches.length} hubs across Oman</small></span></>
                    ) : (
                      <>{face(o.b.salesman || o.b.name)}
                        <span className="mp-bp-txt"><b>{o.b.name}</b><small>{[o.b.city, o.b.salesman ? `Rep: ${o.b.salesman}` : ''].filter(Boolean).join(' · ')}</small></span></>
                    )}
                    <Check className="mp-bp-ok" aria-hidden="true" />
                  </button>
                );
              })}
              {!choices.length && <div className="mp-bp-empty"><MapPin className="w-5 h-5" />No branch or rep matches “{q}”</div>}
            </div>
            <div className="mp-bp-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> move</span><span><kbd>Enter</kbd> choose</span><span className="ml-auto">{branches.length} hubs</span></div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
