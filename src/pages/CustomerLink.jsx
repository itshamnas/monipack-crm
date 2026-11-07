import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Plus, ChevronRight, X, Camera, FileText, CheckCircle2, AlertCircle, Loader2, Lock, Trash2, RefreshCw, Inbox, Phone, MessageCircle, Users, Briefcase } from 'lucide-react';
import { getApiUrl } from '../api/config.js';
import CustomerFieldInput, { asList, fieldApplies } from '../components/customers/CustomerFieldInput.jsx';
import { prepareUpload } from '../utils/fileUpload.js';

/**
 * Public page a salesman opens from his personal link: /c/<name>-<token>
 * Shows only his customers with how complete each one is. Saved values are locked for him;
 * he can come back to fill what is still empty and upload the CR paper / VAT certificate.
 */

const tokenFromPath = () => {
  const m = window.location.pathname.match(/([a-f0-9]{32})\/?$/);
  return m ? m[1] : '';
};

const sessionKey = (token) => `monipack_link_session_${token}`;
const readSession = (token) => { try { return sessionStorage.getItem(sessionKey(token)) || ''; } catch { return ''; } };
const writeSession = (token, value) => { try { sessionStorage.setItem(sessionKey(token), value); } catch { /* private mode */ } };

const isRequired = (field, type) => (type === 'branch' ? field.requiredBranch : field.requiredRouteB2b);

export default function CustomerLink() {
  const token = useMemo(tokenFromPath, []);
  const [info, setInfo] = useState(null); // { salesmanName, salesmanType, requiresPin }
  const [session, setSession] = useState(() => readSession(token));
  const [stage, setStage] = useState('loading'); // loading | invalid | pin | ready
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [fields, setFields] = useState([]);
  const [list, setList] = useState({ total: 0, remaining: 0, notStarted: 0, incomplete: 0, completed: 0, percent: 0, customers: [] });
  const [listState, setListState] = useState('loading'); // loading | ok | error
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null); // customer object, or { isNew: true }
  const [toast, setToast] = useState(null);
  const [tab, setTab] = useState('customers'); // customers | leads
  const [leadData, setLeadData] = useState({ stages: [], leads: [] });
  const [openLead, setOpenLead] = useState(null);

  const api = useCallback(async (path, options = {}) => {
    const res = await fetch(getApiUrl(`/api/link/${token}${path}`), {
      ...options,
      headers: { 'Content-Type': 'application/json', 'X-Link-Session': session || '', ...(options.headers || {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401 && body.code === 'LINK_SESSION_REQUIRED') {
      writeSession(token, '');
      setSession('');
      if (info?.requiresPin) setStage('pin');
      else startSession('');
    }
    return { ok: res.ok, status: res.status, body };
  }, [token, session, info]);

  // 1. Is the link valid?
  useEffect(() => {
    if (!token) { setStage('invalid'); return; }
    fetch(getApiUrl(`/api/link/${token}`))
      .then(async (res) => {
        if (!res.ok) { setStage('invalid'); return; }
        const data = await res.json();
        setInfo(data);
        if (session) setStage('ready');
        else if (data.requiresPin) setStage('pin');
        else startSession('');
      })
      .catch(() => setStage('invalid'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const startSession = async (pinValue) => {
    setPinError('');
    const res = await fetch(getApiUrl(`/api/link/${token}/session`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: pinValue }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 404) setStage('invalid');
      else { setPinError(body.error || 'Could not open your link.'); setStage('pin'); }
      return;
    }
    writeSession(token, body.session);
    setSession(body.session);
    setStage('ready');
  };

  const loadData = useCallback(async () => {
    try {
      const [f, c, l] = await Promise.all([api('/fields'), api('/customers'), api('/leads')]);
      if (f.ok) setFields(f.body);
      if (l.ok) setLeadData(l.body);
      if (c.ok) { setList(c.body); setListState('ok'); } else if (c.status !== 401) setListState('error');
    } catch {
      setListState('error');
    }
  }, [api]);

  useEffect(() => {
    if (stage === 'ready' && session) loadData();
  }, [stage, session, loadData]);

  // Keep the list fresh: when the admin imports or transfers customers, the salesman sees them
  // as soon as he comes back to the page (and every minute while it is open).
  useEffect(() => {
    if (stage !== 'ready' || !session) return undefined;
    const refresh = () => { if (document.visibilityState === 'visible') loadData(); };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    const timer = setInterval(refresh, 60 * 1000);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
      clearInterval(timer);
    };
  }, [stage, session, loadData]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4500);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list.customers;
    return list.customers.filter((c) => c.name.toLowerCase().includes(q) || (c.mobile || '').includes(q));
  }, [list.customers, search]);

  if (stage === 'loading') {
    return <CenterMessage icon={<Loader2 className="w-6 h-6 animate-spin text-slate-500" />} title="Opening your customer list…" />;
  }
  if (stage === 'invalid') {
    return (
      <CenterMessage
        icon={<AlertCircle className="w-7 h-7 text-[#CC1A22]" />}
        title="This link is not active"
        text="It may have been reset or switched off. Please ask your administrator for your current link."
      />
    );
  }
  if (stage === 'pin') {
    return (
      <div className="min-h-screen bg-[#F5F6F8] flex items-center justify-center p-5 font-sans">
        <form
          onSubmit={(e) => { e.preventDefault(); startSession(pin); }}
          className="w-full max-w-sm bg-white rounded-3xl border border-slate-200 shadow-lg p-6 space-y-4"
        >
          <Brand />
          <div className="flex items-center gap-2 text-slate-900">
            <Lock className="w-5 h-5 text-[#CC1A22]" />
            <h1 className="text-lg font-bold">Hello {info?.salesmanName}</h1>
          </div>
          <label htmlFor="link-pin" className="block text-sm font-semibold text-slate-700">Enter your PIN</label>
          <input id="link-pin" type="password" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
            value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            className="w-full h-14 text-center text-2xl tracking-[0.5em] rounded-2xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-[#CC1A22]" />
          {pinError && <p role="alert" className="text-sm font-semibold text-rose-700">{pinError}</p>}
          <button type="submit" className="w-full h-12 rounded-full bg-[#CC1A22] hover:bg-[#A3141B] text-white font-bold">Open my customers</button>
        </form>
      </div>
    );
  }

  const pct = list.percent || 0;
  const allDone = list.total > 0 && list.notStarted === 0 && list.incomplete === 0;

  return (
    <div className="min-h-screen bg-[#F5F6F8] font-sans text-slate-900 pb-28">
      <header className="sticky top-0 z-20 bg-[#F5F6F8]/95 backdrop-blur px-5 pt-5 pb-3 space-y-3">
        <div className="flex items-center justify-between">
          <Brand />
          <span className="text-xs font-semibold text-slate-500">{info?.salesmanType === 'branch' ? 'Branch' : 'Route / B2B'}</span>
        </div>
        <div className="bg-slate-900 text-white rounded-3xl p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-300">{info?.salesmanName} · my customers</p>
            <button type="button" onClick={() => loadData()} aria-label="Refresh list"
              className="w-10 h-10 -mr-2 rounded-full flex items-center justify-center text-slate-300 hover:bg-white/10">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          <p className="mt-1 text-3xl font-extrabold tabular-nums">
            {pct}% <span className="text-base font-semibold text-slate-300">complete · {list.total} customers</span>
          </p>
          <div className="mt-3 h-2 rounded-full bg-white/15 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Overall progress">
            <div className="h-2 rounded-full bg-[#CC1A22] transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {[['Not started', list.notStarted], ['To complete', list.incomplete], ['Done', list.completed]].map(([label, n]) => (
              <div key={label} className="rounded-2xl bg-white/10 py-2">
                <span className="block text-lg font-extrabold tabular-nums">{n}</span>
                <span className="block text-[11px] font-semibold text-slate-300">{label}</span>
              </div>
            ))}
          </div>
        </div>
        <div role="tablist" aria-label="My work" className="grid grid-cols-2 gap-1 p-1 bg-white border border-slate-200 rounded-full">
          {[['customers', 'My customers', Users, list.total], ['leads', 'My leads', Briefcase, leadData.leads.filter((x) => !['won', 'lost'].includes(x.status)).length]].map(([id, label, Icon, n]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              className={`min-h-[44px] rounded-full text-sm font-bold flex items-center justify-center gap-2 transition ${tab === id ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>
              <Icon className="w-4 h-4" /> {label}
              <span className={`text-[11px] px-1.5 rounded-full ${tab === id ? 'bg-white/20' : 'bg-slate-100'}`}>{n}</span>
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <label htmlFor="link-search" className="sr-only">Search customers</label>
          <input id="link-search" type="search" placeholder="Search customer or number" value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-12 pl-12 pr-4 rounded-2xl border border-slate-300 bg-white text-base focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-[#CC1A22]" />
        </div>
      </header>

      {tab === 'leads' ? (
        <LeadsList data={leadData} search={search} onOpen={setOpenLead} />
      ) : (
      <main className="px-5 space-y-2.5">
        {listState === 'loading' ? (
          <p className="text-center text-sm text-slate-500 py-8"><Loader2 className="w-5 h-5 animate-spin inline mr-1" /> Loading your customers…</p>
        ) : listState === 'error' ? (
          <div role="alert" className="bg-white rounded-3xl border border-rose-200 p-6 text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-rose-600 mx-auto" />
            <p className="font-bold">Could not load your customers</p>
            <p className="text-sm text-slate-500">Check your internet connection and try again.</p>
            <button type="button" onClick={() => loadData()} className="h-11 px-5 rounded-full bg-slate-900 text-white font-bold text-sm">Try again</button>
          </div>
        ) : list.total === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-6 text-center space-y-2">
            <Inbox className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="font-bold">No customers in your list yet</p>
            <p className="text-sm text-slate-500">Your office will add them. Tap refresh above, or add a new customer with the button below.</p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-slate-500 py-8">No customer matches “{search}”.</p>
        ) : (
          <>
          {allDone && !search && (
            <div className="bg-white rounded-3xl border border-emerald-200 p-5 text-center space-y-1">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
              <p className="font-bold">All your customers are 100% complete. Thank you!</p>
            </div>
          )}
          <ul className="space-y-2.5">
            {filtered.map((c) => {
              const started = c.status !== 'not_started';
              const full = started && c.percent === 100;
              return (
                <li key={c.id}>
                  <button type="button" onClick={() => setEditing(c)}
                    className="w-full min-h-[64px] text-left bg-white rounded-2xl border border-slate-200 px-4 py-3 flex items-center gap-3 active:scale-[0.99] transition shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                    <span className="flex-1 min-w-0">
                      <span className="block font-bold truncate">{c.name}</span>
                      {!started ? (
                        <span className="block text-xs font-semibold text-slate-500">Not started · tap to fill in</span>
                      ) : (
                        <span className="flex items-center gap-2 mt-1">
                          <span className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden" aria-hidden="true">
                            <span className={`block h-1.5 rounded-full ${full ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${c.percent}%` }} />
                          </span>
                          <span className={`text-xs font-bold tabular-nums ${full ? 'text-emerald-700' : 'text-amber-700'}`}>{c.percent}%</span>
                        </span>
                      )}
                      {started && !full && (
                        <span className="block text-[11px] text-slate-500 mt-0.5">
                          {c.locked ? 'Locked by office' : `${c.missing.length} detail${c.missing.length === 1 ? '' : 's'} missing`}
                        </span>
                      )}
                    </span>
                    {full ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" aria-label="Complete" />
                      : c.locked ? <Lock className="w-5 h-5 text-slate-400 shrink-0" aria-label="Locked" />
                      : <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>
          </>
        )}
      </main>
      )}

      {openLead && (
        <LeadSheet lead={openLead} stages={leadData.stages} api={api} onClose={() => setOpenLead(null)}
          onSaved={(message) => { setOpenLead(null); showToast(message); loadData(); }} />
      )}

      {tab === 'customers' && (
      <button type="button" onClick={() => setEditing({ isNew: true, data: {} })}
        className="fixed right-5 bottom-6 z-20 h-14 px-5 rounded-full bg-[#CC1A22] hover:bg-[#A3141B] text-white font-bold flex items-center gap-2 shadow-[0_10px_24px_-8px_rgba(204,26,34,0.6)]">
        <Plus className="w-5 h-5" /> Add new customer
      </button>
      )}

      {editing && (
        <CustomerForm
          customer={editing}
          fields={fields}
          salesmanType={info?.salesmanType}
          api={api}
          onClose={() => setEditing(null)}
          onSaved={(message, type) => { setEditing(null); showToast(message, type); loadData(); }}
        />
      )}

      {toast && (
        <div role="status" className={`fixed left-4 right-4 bottom-24 z-50 rounded-2xl px-4 py-3 text-sm font-semibold shadow-xl ${toast.type === 'error' ? 'bg-rose-700 text-white' : 'bg-slate-900 text-white'}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

const COLUMN = { mobile: 'mobile', cr_number: 'crNumber', vat_number: 'vatNumber' };
const blank = (v) => v === undefined || v === null || (Array.isArray(v) ? v.length === 0 : String(v).trim() === '');

/**
 * Three modes:
 *  - new:      salesman adds a customer who is not in his list
 *  - first:    customer not started yet; all fields editable, required ones must be filled
 *  - complete: customer already saved; saved values are locked, empty ones can be filled, documents uploaded
 *  (locked by the office, or 100% complete: view only)
 */
function CustomerForm({ customer, fields, salesmanType, api, onClose, onSaved }) {
  const isNew = Boolean(customer.isNew);
  const mode = isNew ? 'new' : customer.status === 'not_started' ? 'first' : 'complete';
  const viewOnly = mode === 'complete' && (customer.locked || customer.percent === 100);

  const saved = useMemo(() => {
    const out = {};
    if (mode !== 'complete') return out;
    Object.entries(COLUMN).forEach(([k, prop]) => { out[k] = customer[prop] || ''; });
    Object.assign(out, customer.data || {});
    return out;
  }, [customer, mode]);
  const isSaved = (key) => mode === 'complete' && (!blank(saved[key]) || (key === 'cr_number' && customer.noCr));

  const [name, setName] = useState(isNew ? '' : customer.name);
  const [values, setValues] = useState(() => {
    const v = { mobile: customer.mobile || '', cr_number: customer.crNumber || '', vat_number: customer.vatNumber || '', ...(customer.data || {}) };
    fields.filter((f) => f.type === 'multiselect').forEach((f) => { v[f.key] = asList(v[f.key]); });
    return v;
  });
  const [noCr, setNoCr] = useState(Boolean(customer.noCr));
  const [noCrReason, setNoCrReason] = useState(customer.noCrReason || '');
  const [files, setFiles] = useState([]); // { label, base64, name, previewUrl, isPdf }
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState('');

  const visible = fields.filter((f) => !f.isHidden && fieldApplies(f, values));
  const formFields = visible.filter((f) => f.type !== 'photo' && f.type !== 'document');
  const docFields = visible.filter((f) => f.type === 'document');
  const photoField = visible.find((f) => f.type === 'photo');
  const uploaded = new Set(customer.fileLabels || []);

  const set = (key, v) => setValues((prev) => {
    const next = { ...prev, [key]: v };
    if (key === 'governorate' && prev.governorate !== v) next.city = '';
    return next;
  });

  const addFiles = async (fileList, label) => {
    for (const file of Array.from(fileList || [])) {
      try {
        const prepared = await prepareUpload(file);
        setFiles((prev) => [...prev, { ...prepared, label }]);
      } catch (err) {
        setErrors((prev) => ({ ...prev, [`file_${label}`]: err.message }));
      }
    }
  };

  const uploadAll = async (id) => {
    let failed = 0;
    for (let i = 0; i < files.length; i++) {
      setProgress(`Uploading document ${i + 1} of ${files.length}…`);
      const p = files[i];
      const up = await api(`/customers/${id}/files`, { method: 'POST', body: JSON.stringify({ base64: p.base64, label: p.label, name: p.name }) });
      if (!up.ok) failed++;
    }
    files.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl));
    return failed;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (viewOnly) { onClose(); return; }
    setErrors({});
    const data = {};
    formFields.forEach((f) => {
      if (COLUMN[f.key] || isSaved(f.key)) return;
      if (!blank(values[f.key])) data[f.key] = values[f.key];
    });
    const fresh = (key) => (isSaved(key) ? undefined : values[key]);
    const payload = {
      name, mobile: fresh('mobile'), crNumber: noCr ? '' : fresh('cr_number'), vatNumber: fresh('vat_number'),
      noCr, noCrReason, data,
    };
    if (mode === 'complete' && !Object.keys(data).length && !files.length
      && blank(payload.mobile) && blank(payload.crNumber) && blank(payload.vatNumber)) {
      setErrors({ form: 'Fill at least one missing detail or add a document, then save.' });
      return;
    }

    setSaving(true);
    setProgress('Saving details…');
    const path = mode === 'new' ? '/customers' : mode === 'first' ? `/customers/${customer.id}/submit` : `/customers/${customer.id}/complete`;
    const res = await api(path, { method: 'POST', body: JSON.stringify(payload) });
    if (!res.ok) {
      setSaving(false);
      setProgress('');
      setErrors(res.body.fields || { form: res.body.error || 'Could not save. Please try again.' });
      return;
    }
    const failed = await uploadAll(res.body.customer.id);
    setSaving(false);
    onSaved(
      failed ? `Details saved, but ${failed} document(s) failed to upload. Please try again.` : res.body.message,
      failed ? 'error' : 'success'
    );
  };

  const required = (f) => mode !== 'complete' && isRequired(f, salesmanType);
  const filledCount = visible.filter((f) => (f.type === 'document' ? uploaded.has(f.docLabel) : isSaved(f.key))).length;

  return (
    <div className="fixed inset-0 z-40 bg-slate-900/50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="cf-title">
      <form onSubmit={submit} className="w-full sm:max-w-lg max-h-[94vh] overflow-y-auto bg-[#F5F6F8] rounded-t-3xl sm:rounded-3xl">
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between">
          <div className="min-w-0 pr-3">
            <h2 id="cf-title" className="text-lg font-bold truncate">{isNew ? 'New customer' : customer.name}</h2>
            {mode === 'complete' && (
              <p className="text-xs font-semibold text-slate-500">
                {customer.locked ? 'Locked by the office · view only' : `${customer.percent}% complete · ${filledCount} of ${visible.length} details saved`}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {mode === 'complete' && !viewOnly && (
            <p className="p-3 rounded-2xl bg-amber-50 text-amber-900 text-sm">Grey fields are saved and can only be changed by the office. Fill the empty ones and save.</p>
          )}
          {errors.form && <p role="alert" className="p-3 rounded-2xl bg-rose-50 text-rose-800 text-sm font-semibold">{errors.form}</p>}
          {Object.keys(errors).some((k) => k !== 'form') && !errors.form && (
            <p role="alert" className="p-3 rounded-2xl bg-rose-50 text-rose-800 text-sm font-semibold">Please check the fields marked in red.</p>
          )}

          {isNew && (
            <div className="space-y-1.5">
              <label htmlFor="cf-name" className="block text-sm font-semibold text-slate-800">Customer name <span className="text-[#CC1A22]">*</span></label>
              <input id="cf-name" type="text" value={name} onChange={(e) => setName(e.target.value)}
                className="w-full h-12 px-4 rounded-2xl border border-slate-300 bg-white text-base focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-[#CC1A22]" />
              {errors.name && <p className="text-xs font-semibold text-rose-700">{errors.name}</p>}
            </div>
          )}

          {formFields.map((f) => {
            const locked = viewOnly || isSaved(f.key);
            if (f.key === 'cr_number' && !locked) {
              return (
                <div key={f.key} className="space-y-2">
                  {!noCr && (
                    <CustomerFieldInput field={f} value={values[f.key]} onChange={(v) => set(f.key, v)} error={errors[f.key]} required={required(f)} />
                  )}
                  {salesmanType === 'branch' && mode !== 'complete' && (
                    <label className="flex items-center gap-3 min-h-[44px] text-sm font-semibold text-slate-700">
                      <input type="checkbox" checked={noCr} onChange={(e) => setNoCr(e.target.checked)} className="w-5 h-5 accent-[#CC1A22]" />
                      This customer has no CR
                    </label>
                  )}
                  {noCr && (
                    <div className="space-y-1.5">
                      <label htmlFor="cf-nocr" className="block text-sm font-semibold text-slate-800">Why no CR? <span className="text-[#CC1A22]">*</span></label>
                      <input id="cf-nocr" type="text" placeholder="e.g. home business, individual buyer" value={noCrReason}
                        onChange={(e) => setNoCrReason(e.target.value)}
                        className="w-full h-12 px-4 rounded-2xl border border-slate-300 bg-white text-base focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-[#CC1A22]" />
                      {(errors.no_cr_reason || errors.cr_number) && <p className="text-xs font-semibold text-rose-700">{errors.no_cr_reason || errors.cr_number}</p>}
                    </div>
                  )}
                </div>
              );
            }
            const shown = f.key === 'cr_number' && customer.noCr ? `No CR – ${customer.noCrReason}` : values[f.key];
            return (
              <CustomerFieldInput key={f.key} field={f} value={shown} values={values} onChange={(v) => set(f.key, v)}
                error={errors[f.key]} required={required(f)} readOnly={locked} />
            );
          })}

          {[...docFields, ...(photoField ? [{ ...photoField, docLabel: 'shop_front' }] : [])].map((f) => {
            const done = uploaded.has(f.docLabel);
            const queued = files.filter((p) => p.label === f.docLabel);
            return (
              <fieldset key={f.key} className="space-y-3 bg-white rounded-3xl border border-slate-200 p-4">
                <legend className="text-sm font-semibold text-slate-800 px-1">{f.label}</legend>
                {done && (
                  <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700"><CheckCircle2 className="w-4 h-4" /> Uploaded</p>
                )}
                {!viewOnly && (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="min-h-[48px] rounded-2xl bg-[#CC1A22] text-white font-bold text-sm flex items-center justify-center gap-2 cursor-pointer">
                      <Camera className="w-4 h-4" /> {done ? 'Add another' : 'Take photo'}
                      <input type="file" accept="image/*" capture="environment" className="sr-only"
                        onChange={(e) => { addFiles(e.target.files, f.docLabel); e.target.value = ''; }} />
                    </label>
                    <label className="min-h-[48px] rounded-2xl bg-white border border-slate-300 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer">
                      <FileText className="w-4 h-4" /> Gallery / PDF
                      <input type="file" accept="image/*,application/pdf" multiple className="sr-only"
                        onChange={(e) => { addFiles(e.target.files, f.docLabel); e.target.value = ''; }} />
                    </label>
                  </div>
                )}
                {errors[`file_${f.docLabel}`] && <p className="text-xs font-semibold text-rose-700">{errors[`file_${f.docLabel}`]}</p>}
                {queued.length > 0 && (
                  <ul className="grid grid-cols-3 gap-2">
                    {queued.map((p) => (
                      <li key={p.previewUrl || p.name} className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50 aspect-square">
                        {p.previewUrl ? <img src={p.previewUrl} alt={f.label} className="w-full h-full object-cover" />
                          : <span className="w-full h-full flex items-center justify-center text-xs font-bold text-slate-600">PDF</span>}
                        <button type="button" aria-label="Remove" onClick={() => setFiles((prev) => prev.filter((x) => x !== p))}
                          className="absolute top-1 right-1 w-8 h-8 rounded-full bg-white/95 flex items-center justify-center">
                          <Trash2 className="w-4 h-4 text-rose-700" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </fieldset>
            );
          })}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-slate-200 p-4">
          <button type="submit" disabled={saving}
            className="w-full h-14 rounded-full bg-[#CC1A22] hover:bg-[#A3141B] text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60">
            {saving && <Loader2 className="w-5 h-5 animate-spin" />}
            {saving ? progress : viewOnly ? 'Close' : mode === 'new' ? 'Send new customer' : mode === 'first' ? 'Save customer' : 'Save missing details'}
          </button>
          {mode === 'first' && <p className="mt-2 text-center text-xs text-slate-500">Saved details can only be changed by the office. You can add missing details later.</p>}
        </div>
      </form>
    </div>
  );
}

const STAGE_STYLE = {
  new: 'bg-blue-50 text-blue-800', contacted: 'bg-indigo-50 text-indigo-800', quotation_sent: 'bg-amber-50 text-amber-800',
  sample_sent: 'bg-purple-50 text-purple-800', won: 'bg-emerald-50 text-emerald-800', lost: 'bg-rose-50 text-rose-800',
};

function LeadsList({ data, search, onOpen }) {
  const label = (id) => data.stages.find((st) => st.id === id)?.label || id;
  const q = search.trim().toLowerCase();
  const leads = q ? data.leads.filter((l) => l.name.toLowerCase().includes(q) || String(l.mobile || '').includes(q)) : data.leads;
  return (
    <main className="px-5 space-y-2.5">
      {leads.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 text-center space-y-2">
          <Inbox className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="font-bold">{q ? `No lead matches “${search}”.` : 'No leads assigned to you yet'}</p>
          {!q && <p className="text-sm text-slate-500">New enquiries for your customers will appear here.</p>}
        </div>
      ) : (
        <ul className="space-y-2.5">
          {leads.map((l) => (
            <li key={l.id}>
              <button type="button" onClick={() => onOpen(l)}
                className="w-full min-h-[64px] text-left bg-white rounded-2xl border border-slate-200 px-4 py-3 flex items-center gap-3 active:scale-[0.99] transition">
                <span className="flex-1 min-w-0">
                  <span className="block font-bold truncate">{l.name}</span>
                  <span className="block text-xs text-slate-500 truncate">{[l.category, l.quantity].filter(Boolean).join(' · ') || 'Enquiry'}</span>
                </span>
                <span className="text-right shrink-0">
                  <span className={`block text-[11px] font-bold px-2 py-0.5 rounded-full ${STAGE_STYLE[l.status] || 'bg-slate-100 text-slate-700'}`}>{label(l.status)}</span>
                  {l.dealValue > 0 && <span className="block mt-1 text-xs font-bold tabular-nums">OMR {Number(l.dealValue).toFixed(3)}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function LeadSheet({ lead, stages, api, onClose, onSaved }) {
  const [status, setStatus] = useState(lead.status);
  const [dealValue, setDealValue] = useState(lead.dealValue ? String(lead.dealValue) : '');
  const [lostReason, setLostReason] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const phoneDigits = String(lead.mobile || '').replace(/\D/g, '');

  const save = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    const res = await api(`/leads/${lead.id}`, {
      method: 'POST',
      body: JSON.stringify({ status, dealValue, lostReason, note }),
    });
    setSaving(false);
    if (res.ok) onSaved(res.body.message || 'Lead updated.');
    else setError(res.body.error || 'Could not save. Please try again.');
  };

  return (
    <div className="fixed inset-0 z-40 bg-slate-900/50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="lead-title">
      <form onSubmit={save} className="w-full sm:max-w-lg max-h-[94vh] overflow-y-auto bg-[#F5F6F8] rounded-t-3xl sm:rounded-3xl">
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between">
          <div className="min-w-0 pr-3">
            <h2 id="lead-title" className="text-lg font-bold truncate">{lead.name}</h2>
            <p className="text-xs text-slate-500 truncate">{[lead.category, lead.quantity, lead.location].filter(Boolean).join(' · ')}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {phoneDigits && (
            <div className="grid grid-cols-2 gap-2">
              <a href={`tel:+${phoneDigits}`} className="min-h-[48px] rounded-2xl bg-white border border-slate-300 font-bold text-sm flex items-center justify-center gap-2"><Phone className="w-4 h-4" /> Call</a>
              <a href={`https://wa.me/${phoneDigits}`} target="_blank" rel="noopener noreferrer" className="min-h-[48px] rounded-2xl bg-emerald-600 text-white font-bold text-sm flex items-center justify-center gap-2"><MessageCircle className="w-4 h-4" /> WhatsApp</a>
            </div>
          )}
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-slate-800">Stage</legend>
            <div className="grid grid-cols-2 gap-2">
              {stages.map((st) => (
                <button key={st.id} type="button" aria-pressed={status === st.id} onClick={() => setStatus(st.id)}
                  className={`min-h-[44px] rounded-2xl text-sm font-bold border transition ${status === st.id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300'}`}>
                  {st.label}
                </button>
              ))}
            </div>
          </fieldset>
          {status === 'lost' && lead.status !== 'lost' && (
            <div className="space-y-1.5">
              <label htmlFor="lead-lost" className="block text-sm font-semibold text-slate-800">Why was it lost? <span className="text-[#CC1A22]">*</span></label>
              <input id="lead-lost" type="text" value={lostReason} onChange={(e) => setLostReason(e.target.value)} placeholder="e.g. price too high, bought elsewhere"
                className="w-full h-12 px-4 rounded-2xl border border-slate-300 bg-white text-base" />
            </div>
          )}
          <div className="space-y-1.5">
            <label htmlFor="lead-value" className="block text-sm font-semibold text-slate-800">Deal value (OMR)</label>
            <input id="lead-value" type="text" inputMode="decimal" value={dealValue} onChange={(e) => setDealValue(e.target.value)} placeholder="0.000"
              className="w-full h-12 px-4 rounded-2xl border border-slate-300 bg-white text-base" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="lead-note" className="block text-sm font-semibold text-slate-800">Add a note</label>
            <textarea id="lead-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened on this visit or call?"
              className="w-full px-4 py-3 rounded-2xl border border-slate-300 bg-white text-base" />
          </div>
          {lead.notes && (
            <details className="bg-white rounded-2xl border border-slate-200 p-3">
              <summary className="text-sm font-semibold cursor-pointer">Earlier notes</summary>
              <p className="mt-2 text-xs text-slate-600 whitespace-pre-wrap">{lead.notes}</p>
            </details>
          )}
          {error && <p role="alert" className="p-3 rounded-2xl bg-rose-50 text-rose-800 text-sm font-semibold">{error}</p>}
        </div>
        <div className="sticky bottom-0 bg-white border-t border-slate-200 p-4">
          <button type="submit" disabled={saving}
            className="w-full h-14 rounded-full bg-[#CC1A22] hover:bg-[#A3141B] text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60">
            {saving && <Loader2 className="w-5 h-5 animate-spin" />} Save
          </button>
        </div>
      </form>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <img src="/assets/logo.png" alt="monipack" className="h-9 w-auto" />
      <span className="font-monipack lowercase text-xl text-[#CC1A22]">monipack</span>
    </div>
  );
}

function CenterMessage({ icon, title, text }) {
  return (
    <div className="min-h-screen bg-[#F5F6F8] flex items-center justify-center p-6 font-sans">
      <div className="max-w-sm text-center space-y-3">
        <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 flex items-center justify-center mx-auto">{icon}</div>
        <h1 className="text-lg font-bold text-slate-900">{title}</h1>
        {text && <p className="text-sm text-slate-600">{text}</p>}
      </div>
    </div>
  );
}
