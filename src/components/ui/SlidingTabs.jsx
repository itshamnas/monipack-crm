import React, { useLayoutEffect, useRef, useState } from 'react';

/**
 * Tabs with a floating capsule that glides to the active tab (spring easing).
 * The capsule follows the active tab's box (tabRect − parentRect) and re-measures on resize,
 * so it stays right when labels or counts change. Keyboard: ← → move between tabs.
 *
 * props: tabs [{ id, label, count? }], value, onChange(id), ariaLabel, size ('md' | 'sm'), tone ('dark' | 'light')
 */
export default function SlidingTabs({ tabs, value, onChange, ariaLabel, size = 'md', tone = 'dark', className = '' }) {
  const wrap = useRef(null);
  const refs = useRef({});
  const [pill, setPill] = useState({ left: 0, width: 0, ready: false });

  useLayoutEffect(() => {
    const measure = () => {
      const parent = wrap.current;
      const el = refs.current[value];
      if (!parent || !el) return;
      const p = parent.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      setPill({ left: r.left - p.left + parent.scrollLeft, width: r.width, ready: true });
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ro && wrap.current) {
      ro.observe(wrap.current);
      Object.values(refs.current).forEach((el) => el && ro.observe(el));
    }
    window.addEventListener('resize', measure);
    return () => { ro?.disconnect(); window.removeEventListener('resize', measure); };
  }, [value, tabs]);

  const onKey = (e) => {
    const i = tabs.findIndex((t) => t.id === value);
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = tabs.at((i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length);
      onChange(next.id);
      refs.current[next.id]?.focus();
    }
  };

  const h = size === 'sm' ? 'min-h-[34px] px-3 text-[11px]' : 'min-h-[40px] px-4 text-xs';
  const activeText = tone === 'dark' ? 'text-white' : 'text-slate-900';
  const pillBg = tone === 'dark' ? 'bg-slate-900 shadow-[0_6px_16px_-6px_rgba(15,23,42,0.55)]' : 'bg-white shadow-[0_2px_10px_-2px_rgba(15,23,42,0.18)]';

  return (
    <div
      ref={wrap}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKey}
      className={`mp-tabs relative flex gap-1 p-1 rounded-full border border-slate-200/80 bg-white/80 backdrop-blur w-fit max-w-full overflow-x-auto ${className}`}
    >
      <span
        aria-hidden="true"
        className={`mp-tabs-pill absolute top-1 bottom-1 rounded-full ${pillBg}`}
        style={{ left: pill.left, width: pill.width, opacity: pill.ready ? 1 : 0 }}
      />
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => { refs.current[t.id] = el; }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={`relative z-[1] rounded-full font-bold whitespace-nowrap inline-flex items-center gap-2 transition-colors duration-200 ${h} ${active ? activeText : 'text-slate-600 hover:text-slate-900'}`}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={`tabular-nums text-[10.5px] px-1.5 rounded-full transition-colors ${active ? (tone === 'dark' ? 'bg-white/20' : 'bg-slate-100') : t.highlight && t.count ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'}`}>
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
