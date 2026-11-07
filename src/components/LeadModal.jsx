import React, { useState, useEffect } from 'react';
import { X, Save, Building, Phone, Mail, MapPin, Tag, DollarSign, FileText, Trash2, UserCheck } from 'lucide-react';
import CustomerPicker from './customers/CustomerPicker.jsx';

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

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[92vh] sm:max-h-[88vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div>
            <h3 className="text-base font-bold">
              {lead ? 'Edit Lead' : (
                <>Create New <span className="font-monipack lowercase text-lg font-normal">monipack</span> Lead</>
              )}
            </h3>
            <p className="text-xs text-slate-400">
              {lead ? `Updating: ${lead.name}` : 'Add client contact & product requirements'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {formError && (
            <div className="p-3 rounded-lg bg-red-50 text-red-700 text-xs font-semibold border border-red-200 animate-in fade-in">
              ⚠️ {formError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Company / Client Name *
            </label>
            <CustomerPicker
              authFetch={authFetch}
              name={formData.name}
              onNameChange={(v) => { setFormData((prev) => ({ ...prev, name: v })); if (formError) setFormError(''); }}
              customer={customer}
              onPick={pickCustomer}
              inputClass="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-3 py-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Product Category
              </label>
              <div className="relative">
                <Tag className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-3 py-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition"
                >
                  {(() => {
                    const cats = [...activeCategories];
                    if (formData.category && !cats.includes(formData.category)) {
                      cats.push(formData.category);
                    }
                    return cats.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ));
                  })()}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Assigned Oman Branch / Hub
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  value={formData.branchId || branches.find((b) => b.name === formData.branch)?.id || formData.branch}
                  onChange={(e) => handleBranchSelect(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-3 py-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition cursor-pointer"
                >
                  {branches.map((b) => (
                    <option key={b.id || `${b.name}-${b.salesman}`} value={b.id}>
                      {b.name}{b.city ? ` (${b.city})` : ''}{b.salesman ? ` - Sales: ${b.salesman}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Assigned Sales Representative
              </label>
              <div className="relative">
                <UserCheck className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  list="leadmodal-salesmen"
                  placeholder="e.g. AFSAL, ANAS, JAMSHID"
                  value={formData.salesman}
                  onChange={(e) => setFormData({ ...formData, salesman: e.target.value })}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-3 py-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition font-bold"
                />
                <datalist id="leadmodal-salesmen">
                  {Array.from(new Set(branches.map((b) => b.salesman).filter(Boolean))).map((sm) => (
                    <option key={sm} value={sm} />
                  ))}
                </datalist>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Customer Wilayat / Delivery Location in Oman
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="e.g. Muscat, Seeb, Nizwa, Sohar"
                  value={formData.customerLocation}
                  onChange={(e) => setFormData({ ...formData, customerLocation: e.target.value })}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-3 py-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mobile / WhatsApp (Oman) *
              </label>
              <div className="flex">
                <span className="inline-flex items-center px-3 text-xs bg-slate-100 border border-r-0 border-slate-300 rounded-l-lg text-slate-600 font-medium">
                  +968
                </span>
                <input
                  type="text"
                  required
                  minLength={7}
                  placeholder="e.g. 91386771"
                  value={formData.mobile}
                  onChange={(e) => {
                    setFormData({ ...formData, mobile: e.target.value });
                    if (formError) setFormError('');
                  }}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-r-lg px-3 py-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="email"
                  placeholder="purchasing@company.om"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-3 py-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Sales Pipeline Stage
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg px-3 py-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition"
              >
                {activeStages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Estimated Deal Value (OMR)
              </label>
              <div className="relative">
                <span className="text-[10px] font-bold text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  OMR
                </span>
                <input
                  type="number"
                  step="0.001"
                  placeholder="0.000"
                  value={formData.dealValue}
                  onChange={(e) => setFormData({ ...formData, dealValue: e.target.value })}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg pl-12 pr-3 py-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Quantity / Products Requested
            </label>
            <input
              type="text"
              placeholder="e.g. 50 Cartons 16oz PET cups, 20 Rolls cling film"
              value={formData.quantity}
              onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
              className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg px-3 py-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Notes & Meeting Discussion
            </label>
            <textarea
              rows="3"
              placeholder="Add key notes, delivery preferences, or quotation requests..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg p-3 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
            <div>
              {lead && onDeleteLead && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Are you sure you want to permanently delete lead "${formData.name || lead.name}"? This action cannot be undone.`)) {
                      onDeleteLead(lead.id);
                      onClose();
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Lead</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white rounded-lg shadow-sm transition active:scale-95 cursor-pointer"
                style={{ backgroundColor: 'var(--color-primary, #CC1A22)' }}
              >
                <Save className="w-4 h-4" />
                <span>{lead ? 'Update Lead' : 'Save Lead'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
