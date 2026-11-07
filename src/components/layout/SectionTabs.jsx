import React from 'react';

/** Tabs at the top of a main section (e.g. Settings → Salesmen & links / Customer form / Products …) */
export default function SectionTabs({ section, activeTab, onChange }) {
  if (!section || section.pages.length < 2) return null;
  return (
    <div className="px-3 sm:px-6 lg:px-8 pt-4 max-w-7xl mx-auto">
      <div role="tablist" aria-label={section.label} className="flex gap-1 p-1 bg-white border border-slate-200 rounded-full w-fit max-w-full overflow-x-auto">
        {section.pages.map((p) => (
          <button key={p.id} type="button" role="tab" aria-selected={activeTab === p.id} onClick={() => onChange(p.id)}
            className={`min-h-[40px] px-4 rounded-full text-xs font-bold whitespace-nowrap transition ${activeTab === p.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
