import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Plus, ChevronRight, X, Camera, FileText, CheckCircle2, AlertCircle, Loader2, Lock, Trash2, RefreshCw, Inbox } from 'lucide-react';
import { getApiUrl } from '../api/config.js';
import CustomerFieldInput from '../components/customers/CustomerFieldInput.jsx';
import { prepareUpload, FILE_LABEL_NAMES } from '../utils/fileUpload.js';

/**
 * Public page a salesman opens from his personal link: /c/<name>-<token>
 * Shows only his customers that still need details; submitted ones disappear and the counter goes down.
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
  const [list, setList] = useState({ total: 0, remaining: 0, customers: [] });
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null); // customer object, or { isNew: true }
  const [toast, setToast] = useState(null);

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
    const [f, c] = await Promise.all([api('/fields'), api('/customers')]);
    if (f.ok) setFields(f.body);
    if (c.ok) setList(c.body);
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

  const done = list.total - list.remaining;
  const pct = list.total ? Math.round((done / list.total) * 100) : 0;

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
            {list.remaining} <span className="text-base font-semibold text-slate-300">remaining of {list.total}</span>
          </p>
          <div className="mt-3 h-2 rounded-full bg-white/15 overflow-hidden" aria-hidden="true">
            <div className="h-2 rounded-full bg-[#CC1A22] transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="relative">
          <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <label htmlFor="link-search" className="sr-only">Search customers</label>
          <input id="link-search" type="search" placeholder="Search customer or number" value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-12 pl-12 pr-4 rounded-2xl border border-slate-300 bg-white text-base focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-[#CC1A22]" />
        </div>
      </header>

      <main className="px-5 space-y-2.5">
        {list.total === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-6 text-center space-y-2">
            <Inbox className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="font-bold">No customers in your list yet</p>
            <p className="text-sm text-slate-500">Your office will add them. Tap refresh above, or add a new customer with the button below.</p>
          </div>
        ) : list.remaining === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-6 text-center space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
            <p className="font-bold">All your customers are done. Thank you!</p>
            <p className="text-sm text-slate-500">You can still add a new customer with the button below.</p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-slate-500 py-8">No customer matches “{search}”.</p>
        ) : (
          <ul className="space-y-2.5">
            {filtered.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => setEditing(c)}
                  className="w-full min-h-[64px] text-left bg-white rounded-2xl border border-slate-200 px-4 py-3 flex items-center gap-3 active:scale-[0.99] transition shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                  <span className="flex-1 min-w-0">
                    <span className="block font-bold truncate">{c.name}</span>
                    <span className="block text-xs text-slate-500 truncate">{c.mobile || 'No details yet'}</span>
                  </span>
                  <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>

      <button type="button" onClick={() => setEditing({ isNew: true, data: {} })}
        className="fixed right-5 bottom-6 z-20 h-14 px-5 rounded-full bg-[#CC1A22] hover:bg-[#A3141B] text-white font-bold flex items-center gap-2 shadow-[0_10px_24px_-8px_rgba(204,26,34,0.6)]">
        <Plus className="w-5 h-5" /> Add new customer
      </button>

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

function CustomerForm({ customer, fields, salesmanType, api, onClose, onSaved }) {
  const isNew = Boolean(customer.isNew);
  const [name, setName] = useState(isNew ? '' : customer.name);
  const [values, setValues] = useState(() => ({
    mobile: customer.mobile || '',
    cr_number: customer.crNumber || '',
    vat_number: customer.vatNumber || '',
    ...(customer.data || {}),
  }));
  const [noCr, setNoCr] = useState(false);
  const [noCrReason, setNoCrReason] = useState('');
  const [photos, setPhotos] = useState([]); // { label, base64, name, previewUrl, isPdf }
  const [photoLabel, setPhotoLabel] = useState('cr_certificate');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState('');

  const formFields = fields.filter((f) => f.type !== 'photo' && !f.isHidden);
  const photoField = fields.find((f) => f.type === 'photo' && !f.isHidden);
  const set = (key, v) => setValues((prev) => ({ ...prev, [key]: v }));

  const addFiles = async (fileList) => {
    for (const file of Array.from(fileList || [])) {
      try {
        const prepared = await prepareUpload(file);
        setPhotos((prev) => [...prev, { ...prepared, label: photoLabel }]);
      } catch (err) {
        setErrors((prev) => ({ ...prev, photos: err.message }));
      }
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setErrors({});
    if (photoField && isRequired(photoField, salesmanType) && photos.length === 0) {
      setErrors({ photos: 'Please add at least one photo.' });
      return;
    }
    setSaving(true);
    setProgress('Saving details…');
    const data = {};
    formFields.forEach((f) => {
      if (!['mobile', 'cr_number', 'vat_number'].includes(f.key) && values[f.key] !== undefined && values[f.key] !== '') data[f.key] = values[f.key];
    });
    const payload = {
      name, mobile: values.mobile, crNumber: noCr ? '' : values.cr_number, vatNumber: values.vat_number,
      noCr, noCrReason, data,
    };
    const res = isNew
      ? await api('/customers', { method: 'POST', body: JSON.stringify(payload) })
      : await api(`/customers/${customer.id}/submit`, { method: 'POST', body: JSON.stringify(payload) });

    if (!res.ok) {
      setSaving(false);
      setProgress('');
      setErrors(res.body.fields || { form: res.body.error || 'Could not save. Please try again.' });
      return;
    }

    const id = res.body.customer.id;
    let failed = 0;
    for (let i = 0; i < photos.length; i++) {
      setProgress(`Uploading photo ${i + 1} of ${photos.length}…`);
      const p = photos[i];
      const up = await api(`/customers/${id}/files`, {
        method: 'POST',
        body: JSON.stringify({ base64: p.base64, label: p.label, name: p.name }),
      });
      if (!up.ok) failed++;
    }
    setSaving(false);
    photos.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl));
    onSaved(
      failed ? `Details saved, but ${failed} photo(s) failed. Please send them to the administrator.` : res.body.message,
      failed ? 'error' : 'success'
    );
  };

  return (
    <div className="fixed inset-0 z-40 bg-slate-900/50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="cf-title">
      <form onSubmit={submit} className="w-full sm:max-w-lg max-h-[94vh] overflow-y-auto bg-[#F5F6F8] rounded-t-3xl sm:rounded-3xl">
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between">
          <h2 id="cf-title" className="text-lg font-bold truncate pr-3">{isNew ? 'New customer' : customer.name}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
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
            if (f.key === 'cr_number') {
              return (
                <div key={f.key} className="space-y-2">
                  {!noCr && (
                    <CustomerFieldInput field={f} value={values[f.key]} onChange={(v) => set(f.key, v)} error={errors[f.key]} required />
                  )}
                  {salesmanType === 'branch' && (
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
            return (
              <CustomerFieldInput key={f.key} field={f} value={values[f.key]} onChange={(v) => set(f.key, v)}
                error={errors[f.key]} required={isRequired(f, salesmanType)} />
            );
          })}

          {photoField && (
            <fieldset className="space-y-3 bg-white rounded-3xl border border-slate-200 p-4">
              <legend className="text-sm font-semibold text-slate-800 px-1">
                {photoField.label} {isRequired(photoField, salesmanType) && <span className="text-[#CC1A22]">*</span>}
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(FILE_LABEL_NAMES).map(([k, label]) => (
                  <button key={k} type="button" onClick={() => setPhotoLabel(k)} aria-pressed={photoLabel === k}
                    className={`min-h-[44px] rounded-full text-xs font-bold border transition ${photoLabel === k ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300'}`}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="min-h-[48px] rounded-2xl bg-[#CC1A22] text-white font-bold text-sm flex items-center justify-center gap-2 cursor-pointer">
                  <Camera className="w-4 h-4" /> Take photo
                  <input type="file" accept="image/*" capture="environment" className="sr-only"
                    onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
                </label>
                <label className="min-h-[48px] rounded-2xl bg-white border border-slate-300 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer">
                  <FileText className="w-4 h-4" /> Gallery / PDF
                  <input type="file" accept="image/*,application/pdf" multiple className="sr-only"
                    onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
                </label>
              </div>
              {errors.photos && <p className="text-xs font-semibold text-rose-700">{errors.photos}</p>}
              {photos.length > 0 && (
                <ul className="grid grid-cols-3 gap-2">
                  {photos.map((p, i) => (
                    <li key={i} className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50 aspect-square">
                      {p.previewUrl ? (
                        <img src={p.previewUrl} alt={FILE_LABEL_NAMES[p.label]} className="w-full h-full object-cover" />
                      ) : (
                        <span className="w-full h-full flex items-center justify-center text-xs font-bold text-slate-600">PDF</span>
                      )}
                      <span className="absolute left-1 bottom-1 right-1 text-[10px] font-bold bg-white/90 rounded px-1 truncate">{FILE_LABEL_NAMES[p.label]}</span>
                      <button type="button" aria-label="Remove" onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                        className="absolute top-1 right-1 w-8 h-8 rounded-full bg-white/95 flex items-center justify-center">
                        <Trash2 className="w-4 h-4 text-rose-700" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </fieldset>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-slate-200 p-4">
          <button type="submit" disabled={saving}
            className="w-full h-14 rounded-full bg-[#CC1A22] hover:bg-[#A3141B] text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60">
            {saving && <Loader2 className="w-5 h-5 animate-spin" />}
            {saving ? progress : isNew ? 'Send new customer' : 'Save customer'}
          </button>
          {!isNew && <p className="mt-2 text-center text-xs text-slate-500">After saving you cannot edit this customer again.</p>}
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
