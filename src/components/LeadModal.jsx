import React, { useState, useEffect } from 'react';
import { X, Save, Building, Phone, Mail, MapPin, Tag, DollarSign, FileText, Trash2, UserCheck } from 'lucide-react';
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
}) {
  const [customer, setCustomer] = useState(null); // existing customer this enquiry belongs to
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
      });
    }
  }, [lead, isOpen, branches]);

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
