import React from 'react';
import SlidingTabs from '../ui/SlidingTabs.jsx';

/**
 * Tabs at the top of a main section.
 * Grouped sections (Settings) show the groups first (Team / Catalogue / Company / Security)
 * and the pages of the chosen group underneath.
 */
export default function SectionTabs({ section, activeTab, onChange }) {
  if (!section || section.pages.length < 2) return null;
  const grouped = section.pages.some((p) => p.group);
  if (!grouped) {
    return (
      <div className="px-3 sm:px-6 lg:px-8 pt-4 max-w-7xl mx-auto">
        <SlidingTabs ariaLabel={section.label} tabs={section.pages.map((p) => ({ id: p.id, label: p.label }))} value={activeTab} onChange={onChange} />
      </div>
    );
  }
  const groups = [...new Set(section.pages.map((p) => p.group || 'Other'))];
  const current = section.pages.find((p) => p.id === activeTab)?.group || groups[0];
  const pagesIn = section.pages.filter((p) => (p.group || 'Other') === current);
  return (
    <div className="px-3 sm:px-6 lg:px-8 pt-4 max-w-7xl mx-auto space-y-2">
      <SlidingTabs ariaLabel={`${section.label} groups`} tabs={groups.map((g) => ({ id: g, label: g }))} value={current}
        onChange={(g) => { const first = section.pages.find((p) => (p.group || 'Other') === g); if (first) onChange(first.id); }} />
      {pagesIn.length > 1 && (
        <nav className="mp-subtabs flex gap-1 overflow-x-auto mp-noscrollbar" aria-label={`${current} pages`}>
          {pagesIn.map((p) => (
            <button key={p.id} type="button" onClick={() => onChange(p.id)} aria-current={p.id === activeTab ? 'page' : undefined}
              className={`relative h-9 px-3 text-[13px] whitespace-nowrap rounded-lg transition-colors ${p.id === activeTab ? 'font-semibold text-slate-900' : 'text-slate-500 hover:text-slate-900 hover:bg-white/60'}`}>
              {p.label}
              {p.id === activeTab && <span className="absolute left-3 right-3 -bottom-0.5 h-0.5 rounded bg-[#3D5AF0] mp-bar" />}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
