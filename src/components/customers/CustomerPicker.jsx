import React, { useEffect, useRef, useState } from 'react';
import { Building, UserCheck, X, Loader2 } from 'lucide-react';

/**
 * "Company / Client Name" with live search of existing customers.
 * Picking one links the enquiry to that customer (and fills mobile, salesman, branch, location).
 * Typing a new name means a new customer is created when the enquiry is saved.
 *
 * props: authFetch, name, onNameChange(name), customer (picked customer or null), onPick(customer|null), inputClass
 */
export default function CustomerPicker({ authFetch, name, onNameChange, customer, onPick, inputClass = '' }) {
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (!authFetch || customer || String(name || '').trim().length < 2) { setResults([]); return undefined; }
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await authFetch(`/api/customer-lookup?q=${encodeURIComponent(name.trim())}`);
        setResults(res.ok ? await res.json() : []);
      } catch { setResults([]); }
      setLoading(false);
    }, 250);
    return () => clearTimeout(timer.current);
  }, [name, customer, authFetch]);

  if (customer) {
    return (
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-emerald-300 bg-emerald-50">
        <UserCheck className="w-4 h-4 text-emerald-700 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-slate-900 truncate">{customer.name}</p>
          <p className="text-[11px] text-emerald-800 truncate">
            Existing customer{customer.mobile ? ` · ${customer.mobile}` : ''}{customer.salesmanName ? ` · ${customer.salesmanName}` : ''}
            {customer.leadCount ? ` · ${customer.leadCount} earlier enquir${customer.leadCount === 1 ? 'y' : 'ies'}` : ''}
          </p>
        </div>
        <button type="button" onClick={() => onPick(null)} aria-label="Choose another customer"
          className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-emerald-100 text-slate-600">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Building className="w-4 h-4 text-slate-400 absolute left-3 top-[19px] -translate-y-1/2 pointer-events-none" />
      <input
        type="text"
        required
        minLength={3}
        placeholder="Type customer name or mobile to search"
        value={name}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls="customer-picker-list"
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { onNameChange(e.target.value); setOpen(true); }}
        className={inputClass}
      />
      {loading && <Loader2 className="w-4 h-4 text-slate-400 absolute right-3 top-[19px] -translate-y-1/2 animate-spin" />}
      {open && results.length > 0 && (
        <ul id="customer-picker-list" role="listbox"
          className="absolute z-20 left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-xl">
          {results.map((c) => (
            <li key={c.id} role="option" aria-selected="false">
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(c); setOpen(false); }}
                className="w-full text-left px-3 py-2.5 hover:bg-slate-50 border-b border-slate-100 last:border-0">
                <span className="block text-xs font-bold text-slate-900">{c.name}</span>
                <span className="block text-[11px] text-slate-500">
                  {[c.mobile, c.city || c.address, c.salesmanName, c.leadCount ? `${c.leadCount} enquir${c.leadCount === 1 ? 'y' : 'ies'}` : ''].filter(Boolean).join(' · ') || 'No details yet'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-[11px] text-slate-500">
        {results.length ? 'Pick the customer if they are in the list, or keep typing for a new customer.' : 'New name → a new customer is created when you save.'}
      </p>
    </div>
  );
}
