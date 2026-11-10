import React, { useState, useEffect, useCallback } from 'react';
import { X, Save, Building, Phone, Mail, MapPin, Tag, DollarSign, FileText, Trash2, UserCheck, CalendarClock, MessageSquare, PhoneCall, StickyNote, ArrowRightLeft, Send, AlertTriangle } from 'lucide-react';
import CustomerPicker from './customers/CustomerPicker.jsx';
import BranchPicker from './ui/BranchPicker.jsx';

const CATEGORIES = [
  'Packaging Products',
  'Disposable Products',
  'Kohe Products',
  'Cleaning Products',
  'Food Products',
  'Other / Custom Wholesale Requirement',
];

const STAGES = [
  { id: 'new', label: 'STEP 1: Qualification & Intake' },
  { id: 'contacted', label: 'STEP 2: Analyze & Assign' },
  { id: 'quotation_sent', label: 'STEP 3: Quotation Follow-Up' },
  { id: 'sample_sent', label: 'STEP 4: Sample & Negotiation' },
  { id: 'won', label: 'STEP 5: Converted (Won)' },
  { id: 'lost', label: 'STEP 6: Lost / Closed' },
];

// datetime-local <-> ISO (local time)
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);
const quickDate = (days, hour = 10) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hour, 0, 0, 0); return d.toISOString(); };
const whenText = (iso) => {
  const d = new Date(iso); const diff = Math.round((Date.now() - d.getTime()) / 60000);
  if (diff < 1) return 'just now'; if (diff < 60) return `${diff} min ago`; if (diff < 1440) return `${Math.round(diff / 60)} h ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
};
const TL_ICON = { note: StickyNote, call: PhoneCall, whatsapp: MessageSquare, status_change: ArrowRightLeft, stage: ArrowRightLeft };

// Form section card (defined at module level so inputs keep focus while typing)
function Section({ n, title, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 p-4 mp-sheet-sec">
      <h4 className="flex items-center gap-2 text-[13px] font-bold text-slate-900 mb-3 mp-display">
        <span className="w-6 h-6 rounded-lg grid place-items-center bg-slate-100 text-slate-500 text-[11px] font-bold">{n}</span>{title}
      </h4>
      {children}
    </section>
  );
}

export default function LeadModal({ 
  isOpen, 
  onClose, 
  onSave, 
  onDeleteLead,
  lead, 
  branches,
  categories: propCategories,
  pipelineStages: propStages,
  authFetch,
  onOpenExisting,
}) {
  const [customer, setCustomer] = useState(null); // existing customer this enquiry belongs to
  const [dupes, setDupes] = useState(null); // same mobile already in leads / customers
  const activeCategories = propCategories && propCategories.length > 0 ? propCategories : CATEGORIES;
  const activeStages = propStages && propStages.length > 0 ? propStages : STAGES;

  const [formData, setFormData] = useState({
    name: '',
    category: activeCategories[0] || 'Packaging Products',
    countryCode: '+968',
    mobile: '',
    email: '',
    branchId: '',
    branch: 'Ghala',
    salesman: '',
    customerLocation: '',
    status: 'new',
    dealValue: '',
    quantity: '',
    notes: '',
    nextFollowUpAt: null,
    followUpNote: '',
  });

  const [formError, setFormError] = useState('');

  const extractMobileAndCode = (targetLead) => {
    let initCode = targetLead?.countryCode || '+968';
    let raw = targetLead?.mobile || '';
    if (!raw && targetLead?.phone) {
      raw = String(targetLead.phone);
    }
    let cleaned = String(raw).replace(/[^\d+]/g, '');
    while (cleaned.startsWith('+968')) {
      cleaned = cleaned.slice(4);
    }
    while (cleaned.startsWith('968') && cleaned.length > 8) {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.startsWith('0') && cleaned.length === 9) {
      cleaned = cleaned.slice(1);
    }
    return { countryCode: initCode, mobile: cleaned };
  };

  useEffect(() => {
    setFormError('');
    setCustomer(lead?.customerId ? { id: lead.customerId, name: lead.name, mobile: lead.mobile } : null);
    if (lead) {
      const matched = (branches && branches.length > 0)
        ? (branches.find((b) => lead.branchId && b.id === lead.branchId) ||
           branches.find((b) => b.name === lead.branch && b.salesman === lead.salesman) ||
           branches.find((b) => b.name === lead.branch) ||
           branches[0])
        : null;
      const { countryCode, mobile } = extractMobileAndCode(lead);
      setFormData({
        name: lead.name || '',
        category: lead.category || activeCategories[0] || 'Packaging Products',
        countryCode,
        mobile,
        email: lead.email || '',
        branchId: lead.branchId || matched?.id || '',
        branch: lead.branch || matched?.name || 'Ghala',
        salesman: lead.salesman || matched?.salesman || '',
        customerLocation: (lead.customerLocation && !lead.customerLocation.includes('Needs Intake')) ? lead.customerLocation : '',
        status: lead.status || 'new',
        dealValue: lead.dealValue ? String(lead.dealValue) : '',
        quantity: (lead.quantity && !lead.quantity.includes('Needs Intake')) ? lead.quantity : '',
        notes: (lead.notes && !lead.notes.includes('Needs Intake')) ? lead.notes : '',
        nextFollowUpAt: lead.nextFollowUpAt || null,
        followUpNote: lead.followUpNote || '',
      });
    } else {
      const defaultB = branches && branches.length > 0 ? branches[0] : null;
      setFormData({
        name: '',
        category: activeCategories[0] || 'Packaging Products',
        countryCode: '+968',
        mobile: '',
        email: '',
        branchId: defaultB?.id || '',
        branch: defaultB?.name || 'Ghala',
        salesman: defaultB?.salesman || '',
        customerLocation: '',
        status: 'new',
        dealValue: '',
        quantity: '',
        notes: '',
        nextFollowUpAt: null,
        followUpNote: '',
      });
    }
  }, [lead, isOpen, branches]);

  // ---- Timeline (edit mode): notes, calls, stage changes ----
  const [timeline, setTimeline] = useState([]);
  const [tlLoading, setTlLoading] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);
  const loadTimeline = useCallback(async () => {
    if (!lead?.id || !authFetch) return;
    setTlLoading(true);
    try {
      const r = await authFetch(`/api/leads/${lead.id}/timeline`);
      if (r.ok) setTimeline(await r.json());
    } catch { /* timeline is optional */ }
    setTlLoading(false);
  }, [lead?.id, authFetch]);
  useEffect(() => { if (isOpen && lead?.id) { setNoteText(''); loadTimeline(); } else setTimeline([]); }, [isOpen, lead?.id, loadTimeline]);
  const addActivity = async (type, description) => {
    if (!lead?.id || !description.trim()) return;
    setNoteBusy(true);
    try {
      const r = await authFetch(`/api/leads/${lead.id}/activity`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, description: description.trim() }) });
      if (r.ok) { setNoteText(''); await loadTimeline(); }
    } catch { /* ignore */ }
    setNoteBusy(false);
  };

  const handleBranchSelect = (selectedVal) => {
    const b = branches.find((item) => String(item.id) === String(selectedVal)) ||
              branches.find((item) => item.name === selectedVal);
    if (b) {
      setFormData((prev) => ({
        ...prev,
        branchId: b.id,
        branch: b.name,
        salesman: b.salesman || prev.salesman,
      }));
    }
  };

  // Picking an existing customer fills the details we already know
  const pickCustomer = (c) => {
    setCustomer(c);
    if (!c) return;
    const branchMatch = (branches || []).find((b) => c.branchId && String(b.id) === String(c.branchId));
    setFormData((prev) => ({
      ...prev,
      name: c.name,
      mobile: c.mobile ? extractMobileAndCode({ mobile: c.mobile }).mobile : prev.mobile,
      customerLocation: prev.customerLocation || c.city || c.address || '',
      ...(branchMatch ? { branchId: branchMatch.id, branch: branchMatch.name } : {}),
      ...(c.salesmanName ? { salesman: c.salesmanName } : {}),
    }));
  };

  // Warn about the same mobile number already in the CRM (checked while typing)
  useEffect(() => {
    if (!isOpen || !authFetch) { setDupes(null); return undefined; }
    const digits = String(formData.mobile || '').replace(/\D/g, '');
    if (digits.length < 7) { setDupes(null); return undefined; }
    let stop = false;
    const t = setTimeout(async () => {
      try {
        const r = await authFetch(`/api/leads/check-duplicate?mobile=${digits}${lead?.id ? `&excludeId=${lead.id}` : ''}`);
        if (!stop && r.ok) setDupes(await r.json());
      } catch { /* the warning is only a help */ }
    }, 450);
    return () => { stop = true; clearTimeout(t); };
  }, [formData.mobile, isOpen, lead?.id, authFetch]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const cleanName = formData.name ? formData.name.trim() : '';
    if (cleanName.length < 3) {
      setFormError('Company / Client Name must be at least 3 characters long.');
      return;
    }

    const rawMobile = formData.mobile ? formData.mobile.trim() : '';
    let digitsOnly = rawMobile.replace(/[^\d+]/g, '');
    while (digitsOnly.startsWith('+968')) digitsOnly = digitsOnly.slice(4);
    while (digitsOnly.startsWith('968') && digitsOnly.length > 8) digitsOnly = digitsOnly.slice(3);
    if (digitsOnly.startsWith('0') && digitsOnly.length === 9) digitsOnly = digitsOnly.slice(1);

    if (!digitsOnly || digitsOnly.length < 7) {
      setFormError('A valid Phone / Mobile number is strictly required (minimum 7-8 digits).');
      return;
    }

    setFormError('');
    const foundBranch = branches.find((b) => b.id === formData.branchId) ||
                        branches.find((b) => b.name === formData.branch);
    const fullPhone = `${formData.countryCode} ${digitsOnly}`;
    onSave({
      ...formData,
      name: cleanName,
      mobile: digitsOnly,
      phone: fullPhone,
      branchId: formData.branchId || foundBranch?.id || '',
      branch: formData.branch || foundBranch?.name || 'Ghala',
      salesman: formData.salesman?.trim() || foundBranch?.salesman || '',
      customerLocation: formData.customerLocation?.trim() || '',
      dealValue: Number(formData.dealValue) || 0,
      ...(customer ? { customerId: customer.id } : (lead ? {} : { customerId: null })),
    });
  };

  const inp = 'w-full h-11 text-[13.5px] bg-white border border-slate-200 rounded-xl px-3 focus:outline-none focus:ring-4 focus:ring-red-500/10 focus:border-red-500 transition placeholder:text-slate-400';
  const lbl = 'block text-[12px] font-semibold text-slate-700 mb-1.5';
  const stepName = (l = '') => String(l).replace(/^STEP\s*\d+\s*:\s*/i, '');
  const branchValue = formData.branchId || branches.find((b) => b.name === formData.branch)?.id || '';



  return (
    <div className="mp-sheet-layer" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form
        onSubmit={handleSubmit}
        onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); e.currentTarget.requestSubmit(); } }}
        className="mp-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={lead ? 'Edit lead' : 'New enquiry'}
      >
        {/* Header */}
        <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-slate-200 flex items-start gap-3 shrink-0">
          <div className="flex-1 min-w-0">
            <h3 className="text-[19px] font-bold text-slate-900 mp-display">
              {lead ? 'Edit lead' : <>New <span className="font-monipack lowercase font-normal">monipack</span> enquiry</>}
            </h3>
            <p className="text-[12.5px] text-slate-500 truncate">{lead ? `Updating: ${lead.name}` : 'Customer, what they need, who follows up'}</p>
          </div>
          <button type="button" onClick={onClose} className="w-10 h-10 grid place-items-center rounded-xl border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition cursor-pointer" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-4 overscroll-contain">
          {formError && (
            <div className="p-3 rounded-xl bg-red-50 text-red-700 text-[12.5px] font-semibold border border-red-200 animate-in fade-in" role="alert">
              {formError}
            </div>
          )}

          <Section n="1" title="Customer">
            <label className={lbl}>Company / client name <span className="text-[#CC1A22]">*</span></label>
            <CustomerPicker
              authFetch={authFetch}
              name={formData.name}
              onNameChange={(v) => { setFormData((prev) => ({ ...prev, name: v })); if (formError) setFormError(''); }}
              customer={customer}
              onPick={pickCustomer}
              inputClass="w-full h-11 text-[13.5px] bg-white border border-slate-200 rounded-xl pl-9 pr-3 focus:outline-none focus:ring-4 focus:ring-red-500/10 focus:border-red-500 transition"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <div>
                <label className={lbl}>Mobile / WhatsApp <span className="text-[#CC1A22]">*</span></label>
                <div className="flex h-11 rounded-xl border border-slate-200 bg-white overflow-hidden focus-within:ring-4 focus-within:ring-red-500/10 focus-within:border-red-500 transition">
                  <span className="inline-flex items-center px-3 text-[12px] font-bold text-slate-500 border-r border-slate-200 bg-slate-50">+968</span>
                  <input
                    type="text"
                    inputMode="tel"
                    required
                    minLength={7}
                    placeholder="e.g. 91386771"
                    value={formData.mobile}
                    onChange={(e) => {
                      setFormData({ ...formData, mobile: e.target.value });
                      if (formError) setFormError('');
                    }}
                    className="flex-1 min-w-0 px-3 text-[13.5px] outline-none bg-transparent"
                  />
                </div>
              </div>
              {dupes && (dupes.leads.length > 0 || dupes.customers.length > 0) && (
                <div className="sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12.5px] text-amber-900" role="status">
                  <p className="font-semibold flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> This number is already in the CRM</p>
                  <ul className="mt-1.5 space-y-1">
                    {dupes.leads.map((d) => (
                      <li key={`l${d.id}`} className="flex flex-wrap items-center gap-x-2">
                        <span><b>{d.name}</b> · lead in <b>{d.status}</b>{d.salesman ? ` · ${d.salesman}` : ' · not assigned'}</span>
                        {onOpenExisting && <button type="button" onClick={() => onOpenExisting(d.id)} className="font-semibold text-blue-700 hover:underline">Open it</button>}
                      </li>
                    ))}
                    {dupes.customers.map((d) => <li key={`c${d.id}`}><b>{d.name}</b> · customer{d.salesman ? ` of ${d.salesman}` : ''}</li>)}
                  </ul>
                  <p className="mt-1.5 text-amber-800">Open the existing lead instead of adding it twice, or save anyway if it is a new requirement.</p>
                </div>
              )}
              <div>
                <label className={lbl}>Email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input type="email" placeholder="purchasing@company.om" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className={`${inp} pl-9`} />
                </div>
              </div>
            </div>
          </Section>

          <Section n="2" title="Requirement">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Product category</label>
                <div className="relative">
                  <Tag className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <select value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} className={`${inp} pl-9 cursor-pointer`}>
                    {(() => {
                      const cats = [...activeCategories];
                      if (formData.category && !cats.includes(formData.category)) cats.push(formData.category);
                      return cats.map((c) => (<option key={c} value={c}>{c}</option>));
                    })()}
                  </select>
                </div>
              </div>
              <div>
                <label className={lbl}>Delivery location (wilayat)</label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input type="text" placeholder="e.g. Muscat, Seeb, Nizwa, Sohar" value={formData.customerLocation} onChange={(e) => setFormData({ ...formData, customerLocation: e.target.value })} className={`${inp} pl-9`} />
                </div>
              </div>
            </div>
            <div className="mt-3">
              <label className={lbl}>Quantity / products requested</label>
              <input type="text" placeholder="e.g. 50 cartons 16oz PET cups, 20 rolls cling film" value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: e.target.value })} className={inp} />
            </div>
            <div className="mt-3">
              <label className={lbl}>Notes & meeting discussion</label>
              <textarea rows="3" placeholder="Delivery preferences, quotation requests…" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className={`${inp} h-auto py-2.5`} />
            </div>
          </Section>

          <Section n="3" title="Assign">
            <label className={lbl}>Branch / hub</label>
            <BranchPicker value={branchValue} onChange={handleBranchSelect} branches={branches || []} allowAll={false} variant="light" placeholder="Choose branch / hub" />
            <div className="mt-3">
              <label className={lbl}>Sales representative</label>
              <div className="relative">
                <UserCheck className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  list="leadmodal-salesmen"
                  placeholder="e.g. AFSAL, ANAS, JAMSHID"
                  value={formData.salesman}
                  onChange={(e) => setFormData({ ...formData, salesman: e.target.value })}
                  className={`${inp} pl-9 font-semibold`}
                />
                <datalist id="leadmodal-salesmen">
                  {Array.from(new Set(branches.map((b) => b.salesman).filter(Boolean))).map((sm) => (<option key={sm} value={sm} />))}
                </datalist>
              </div>
              <p className="text-[11.5px] text-slate-500 mt-1.5">Choosing a branch fills in its rep. You can change it.</p>
            </div>
          </Section>

          <Section n="4" title="Stage & value">
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Pipeline stage">
              {activeStages.map((st, i) => (
                <button
                  key={st.id}
                  type="button"
                  role="radio"
                  aria-checked={formData.status === st.id}
                  onClick={() => setFormData({ ...formData, status: st.id })}
                  className={`min-h-[34px] px-3 rounded-lg text-[12px] font-semibold border transition cursor-pointer ${formData.status === st.id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
                >
                  {i + 1}. {stepName(st.label)}
                </button>
              ))}
            </div>
            <div className="mt-3 max-w-xs">
              <label className={lbl}>Estimated deal value</label>
              <div className="flex h-11 rounded-xl border border-slate-200 bg-white overflow-hidden focus-within:ring-4 focus-within:ring-red-500/10 focus-within:border-red-500 transition">
                <span className="inline-flex items-center px-3 text-[11px] font-bold text-slate-500 border-r border-slate-200 bg-slate-50">OMR</span>
                <input type="number" inputMode="decimal" step="0.001" placeholder="0.000" value={formData.dealValue} onChange={(e) => setFormData({ ...formData, dealValue: e.target.value })} className="flex-1 min-w-0 px-3 text-[13.5px] outline-none bg-transparent tabular-nums" />
              </div>
            </div>
          </Section>

          <Section n="5" title="Next follow-up">
            <div className="flex flex-wrap gap-1.5">
              {[['Today', 0, 16], ['Tomorrow', 1, 10], ['In 3 days', 3, 10], ['Next week', 7, 10]].map(([label, d, h]) => (
                <button key={label} type="button" onClick={() => setFormData({ ...formData, nextFollowUpAt: quickDate(d, h) })}
                  className="min-h-[34px] px-3 rounded-lg text-[12px] font-semibold border border-slate-200 bg-white text-slate-600 hover:border-slate-300 transition cursor-pointer">
                  {label}
                </button>
              ))}
              {formData.nextFollowUpAt && (
                <button type="button" onClick={() => setFormData({ ...formData, nextFollowUpAt: null })} className="min-h-[34px] px-3 rounded-lg text-[12px] font-semibold text-rose-600 hover:bg-rose-50 cursor-pointer">
                  No follow-up
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <div>
                <label className={lbl}>Date & time</label>
                <div className="relative">
                  <CalendarClock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input type="datetime-local" value={toLocalInput(formData.nextFollowUpAt)} onChange={(e) => setFormData({ ...formData, nextFollowUpAt: fromLocalInput(e.target.value) })} className={`${inp} pl-9`} />
                </div>
              </div>
              <div>
                <label className={lbl}>What to do</label>
                <input type="text" maxLength={300} placeholder="e.g. Send price list, call back" value={formData.followUpNote} onChange={(e) => setFormData({ ...formData, followUpNote: e.target.value })} className={inp} />
              </div>
            </div>
            <p className="text-[11.5px] text-slate-500 mt-1.5">Shows as “Due today” or “Overdue” on Home and on the pipeline card.</p>
          </Section>

          {lead?.id && (
            <Section n="6" title="Activity & notes">
              <div className="flex gap-2">
                <input type="text" value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Add a note…"
                  onKeyDown={(e) => { if (e.key === 'Enter' && !(e.ctrlKey || e.metaKey)) { e.preventDefault(); addActivity('note', noteText); } }}
                  className={inp} maxLength={1000} />
                <button type="button" disabled={noteBusy || !noteText.trim()} onClick={() => addActivity('note', noteText)} className="shrink-0 w-11 h-11 grid place-items-center rounded-xl bg-slate-900 text-white disabled:opacity-40 cursor-pointer" aria-label="Add note">
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <button type="button" disabled={noteBusy} onClick={() => addActivity('call', 'Called the customer')} className="min-h-[32px] px-3 rounded-lg text-[12px] font-semibold border border-slate-200 text-slate-600 hover:border-slate-300 inline-flex items-center gap-1.5 cursor-pointer"><PhoneCall className="w-3.5 h-3.5 text-blue-600" /> Log a call</button>
                <button type="button" disabled={noteBusy} onClick={() => addActivity('whatsapp', 'Sent a WhatsApp message')} className="min-h-[32px] px-3 rounded-lg text-[12px] font-semibold border border-slate-200 text-slate-600 hover:border-slate-300 inline-flex items-center gap-1.5 cursor-pointer"><MessageSquare className="w-3.5 h-3.5 text-emerald-600" /> Log a WhatsApp</button>
              </div>
              <ol className="mt-4 space-y-0">
                {tlLoading && !timeline.length && <li className="text-[12.5px] text-slate-500">Loading…</li>}
                {!tlLoading && !timeline.length && <li className="text-[12.5px] text-slate-500">No activity yet.</li>}
                {timeline.map((it, i) => {
                  const Icon = TL_ICON[it.type] || StickyNote;
                  const text = it.kind === 'stage' ? `Stage: ${it.fromStatus || 'start'} → ${it.toStatus}${it.by ? ` (${it.by})` : ''}` : it.description;
                  return (
                    <li key={it.id || i} className="relative grid grid-cols-[28px_1fr] gap-2.5 pb-3">
                      {i < timeline.length - 1 && <span className="absolute left-[13.5px] top-8 bottom-0 w-px bg-slate-200" aria-hidden="true" />}
                      <span className={`w-7 h-7 rounded-lg grid place-items-center ${it.type === 'call' ? 'bg-blue-50 text-blue-600' : it.type === 'whatsapp' ? 'bg-emerald-50 text-emerald-600' : it.type === 'note' ? 'bg-amber-50 text-amber-600' : 'bg-violet-50 text-violet-600'}`}><Icon className="w-3.5 h-3.5" /></span>
                      <span className="min-w-0"><span className="block text-[12.5px] text-slate-800 break-words">{text}</span><span className="text-[11px] text-slate-400">{whenText(it.timestamp)}</span></span>
                    </li>
                  );
                })}
              </ol>
            </Section>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-3.5 border-t border-slate-200 flex items-center gap-2 shrink-0 bg-white mp-sheet-foot">
          {lead && onDeleteLead && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Are you sure you want to permanently delete lead "${formData.name || lead.name}"? This action cannot be undone.`)) {
                  onDeleteLead(lead.id);
                  onClose();
                }
              }}
              className="flex items-center gap-1.5 px-3 min-h-[42px] text-[12.5px] font-semibold text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Delete lead</span>
            </button>
          )}
          <span className="hidden md:inline text-[11.5px] text-slate-400 mr-auto"><kbd className="mp-kbd">Ctrl</kbd> + <kbd className="mp-kbd">Enter</kbd> to save</span>
          <button type="button" onClick={onClose} className="ml-auto md:ml-0 px-4 min-h-[42px] text-[13px] font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer">
            Cancel
          </button>
          <button type="submit" className="mp-btn mp-btn-red min-h-[42px] px-5 text-[13px]">
            <Save className="w-4 h-4" />
            <span>{lead ? 'Update lead' : 'Save lead'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
