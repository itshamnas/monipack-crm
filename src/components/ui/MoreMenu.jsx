import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import Sheet from './Sheet.jsx';

/**
 * The ⋯ button that holds a page's less-used actions.
 * Phones: an action sheet from the bottom. Bigger screens: a small menu under the button.
 * items: [{ label, icon: LucideIcon, onClick, note, danger, hidden }]
 */
export default function MoreMenu({ items = [], label = 'More actions', className = '' }) {
  const list = items.filter((i) => i && !i.hidden);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btn = useRef(null);
  const phone = typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
  useEffect(() => {
    if (!open || phone) return undefined;
    const r = btn.current.getBoundingClientRect();
    setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
    const off = (e) => { if (!btn.current?.contains(e.target) && !e.target.closest?.('.mp-more-pop')) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', off); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc); };
  }, [open, phone]);
  if (!list.length) return null;
  const run = (it) => { setOpen(false); setTimeout(() => it.onClick?.(), 10); };
  const rows = list.map((it) => {
    const Icon = it.icon;
    return (
      <button key={it.label} type="button" role="menuitem" onClick={() => run(it)} className={`mp-more-item ${it.danger ? 'danger' : ''}`}>
        {Icon && <Icon className="w-5 h-5 shrink-0" aria-hidden="true" />}
        <span className="flex-1 text-left">{it.label}</span>
        {it.note && <span className="mp-more-note">{it.note}</span>}
      </button>
    );
  });
  return (
    <>
      <button ref={btn} type="button" className={`mp-more-btn ${className}`} aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <MoreHorizontal className="w-5 h-5" />
      </button>
      {phone ? (
        <Sheet open={open} onClose={() => setOpen(false)} label={label}>
          <div role="menu" className="-mx-1">{rows}</div>
          <button type="button" className="mp-more-cancel" onClick={() => setOpen(false)}>Cancel</button>
        </Sheet>
      ) : open && pos && createPortal(
        <div role="menu" className="mp-more-pop" style={{ top: pos.top, right: pos.right }}>{rows}</div>, document.body
      )}
    </>
  );
}
