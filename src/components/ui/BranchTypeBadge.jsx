import React from 'react';
import { Store, Truck } from 'lucide-react';

/** Small "Retail" / "B2B" pill for a branch or salesman. */
export default function BranchTypeBadge({ type, className = '' }) {
  if (type !== 'retail' && type !== 'b2b') return null;
  const b2b = type === 'b2b';
  const Icon = b2b ? Truck : Store;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[9.5px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded-full border ${b2b ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'} ${className}`}
      title={b2b ? 'B2B branch (route / wholesale)' : 'Retail branch (shop)'}
    >
      <Icon className="w-3 h-3" aria-hidden="true" />
      {b2b ? 'B2B' : 'Retail'}
    </span>
  );
}
