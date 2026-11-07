import React from 'react';
import SlidingTabs from '../ui/SlidingTabs.jsx';

/** Tabs at the top of a main section (e.g. Settings → Salesmen & links / Customer form / Products …) */
export default function SectionTabs({ section, activeTab, onChange }) {
  if (!section || section.pages.length < 2) return null;
  return (
    <div className="px-3 sm:px-6 lg:px-8 pt-4 max-w-7xl mx-auto">
      <SlidingTabs ariaLabel={section.label} tabs={section.pages.map((p) => ({ id: p.id, label: p.label }))} value={activeTab} onChange={onChange} />
    </div>
  );
}
