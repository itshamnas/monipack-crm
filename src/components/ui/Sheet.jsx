import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * Bottom sheet for phones (slides up from the bottom, thumb-friendly); a centred dialog on bigger screens.
 * Closes on the scrim, Escape, or the X. Keeps focus inside while open.
 */
export default function Sheet({ open, onClose, title, children, footer, label }) {
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.activeElement;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => box.current?.querySelector('button, [href], input, select, textarea')?.focus(), 30);
    const y = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); clearTimeout(t); document.body.style.overflow = y; prev?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="mp-sheet-wrap" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div ref={box} className="mp-sheet2" role="dialog" aria-modal="true" aria-label={label || title}>
        <div className="mp-sheet2-handle" aria-hidden="true" />
        {title && (
          <div className="mp-sheet2-head">
            <h2>{title}</h2>
            <button type="button" className="mp-sheet2-x" onClick={onClose} aria-label="Close"><X className="w-5 h-5" /></button>
          </div>
        )}
        <div className="mp-sheet2-body">{children}</div>
        {footer && <div className="mp-sheet2-foot">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
