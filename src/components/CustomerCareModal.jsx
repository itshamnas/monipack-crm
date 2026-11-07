import React, { useState, useEffect } from 'react';
import { 
  X, 
  Phone, 
  MessageSquare, 
  MapPin, 
  Building2, 
  UserCheck, 
  CheckCircle, 
  Tag, 
  DollarSign, 
  FileText, 
  Headphones, 
  ArrowRight, 
  XCircle,
  AlertTriangle,
  Send,
  Trash2,
  Edit3,
  Share2
} from 'lucide-react';

const LOST_REASONS = [
  { id: 'price', label: 'Price too high / Budget mismatch' },
  { id: 'quantity', label: 'Quantity / MOQ requirement mismatch' },
  { id: 'availability', label: 'Product availability / Out of stock' },
  { id: 'postponed', label: 'Project postponed / Delayed purchasing' },
  { id: 'competitor', label: 'Chose competitor supplier' },
  { id: 'logistics', label: 'Logistics / Delivery timeline mismatch' },
  { id: 'no_response', label: 'No response / Invalid phone number' },
  { id: 'other', label: 'Other commercial reason' },
];

const REQUIREMENT_CHIPS = [
  'Catalog & Price List',
  'Sample Request',
  '10–50 Cartons',
  '50+ Cartons Wholesale',
  'Custom Printing',
];

const OMAN_WILAYAT_MAP = {
  'ghala': 'Ghala',
  'muscat': 'Ghala',
  'ruwi': 'Ghala',
  'muttrah': 'Ghala',
  'bousher': 'Ghala',
  'bowsher': 'Ghala',
  'azaiba': 'Ghala',
  'al khoud': 'Al Khoud',
  'khoud': 'Al Khoud',
  'seeb': 'Al Khoud',
  'al seeb': 'Al Khoud',
  'mabela': 'Mabela',
  'maabela': 'Mabela',
  'amarath': 'Amarath',
  'al amerat': 'Amarath',
  'amerat': 'Amarath',
  'quriyat': 'Amarath',
  'nizwa': 'Nizwa',
  'bahla': 'Bahla',
  'izki': 'Nizwa',
  'adam': 'Nizwa',
  'manah': 'Nizwa',
  'al hamra': 'Bahla',
  'musannah': 'Musannah',
  'al musannah': 'Musannah',
  'barka': 'Musannah',
  'rustaq': 'Musannah',
  'sohar': 'Musannah',
  'suwayq': 'Musannah',
  'saham': 'Musannah',
  'liwa': 'Musannah',
  'shinas': 'Musannah',
  'ibri': 'Ibri',
  'yanqul': 'Ibri',
  'dhank': 'Ibri',
  'ibra': 'Ibra',
  'jalan': 'Jalan Bani Buali',
  'jalan bani buali': 'Jalan Bani Buali',
  'sur': 'Jalan Bani Buali',
  'bidbid': 'Nizwa',
  'samail': 'Nizwa',
};

export default function CustomerCareModal({
  isOpen,
  onClose,
  lead,
  branches = [],
  categories = [],
  onTransferToPipeline,
  onMarkNotConverted,
  onOpenWhatsApp,
  onDeleteLead,
  onShareLead,
  onSaveAndShare,
  onSaveAndQuote,
}) {
  const [customerName, setCustomerName] = useState('');
  const [countryCode, setCountryCode] = useState('+968');
  const [mobileNumber, setMobileNumber] = useState('');
  const [category, setCategory] = useState('');
  const [productDetails, setProductDetails] = useState('');
  const [quantity, setQuantity] = useState('');
  const [location, setLocation] = useState('');
  const [branchId, setBranchId] = useState('');
  const [branch, setBranch] = useState('Ghala');
  const [salesman, setSalesman] = useState('');
  const [dealValue, setDealValue] = useState('');
  const [callNotes, setCallNotes] = useState('');
  
  // Not converted state
  const [showLostSection, setShowLostSection] = useState(false);
  const [lostReason, setLostReason] = useState('price');
  const [lostNotes, setLostNotes] = useState('');

  // Sync state when lead changes
  useEffect(() => {
    if (lead) {
      setCustomerName(lead.name || '');
      
      // Smart extraction of mobile number and country code (strip duplicated +968)
      let initMobile = lead.mobile || '';
      let initCode = lead.countryCode || '+968';
      if (!initMobile && lead.phone) {
        initMobile = String(lead.phone);
      }
      let cleaned = String(initMobile).replace(/[^\d+]/g, '');
      while (cleaned.startsWith('+968')) {
        cleaned = cleaned.slice(4);
      }
      while (cleaned.startsWith('968') && cleaned.length > 8) {
        cleaned = cleaned.slice(3);
      }
      if (cleaned.startsWith('0') && cleaned.length === 9) {
        cleaned = cleaned.slice(1);
      }
      setCountryCode(initCode);
      setMobileNumber(cleaned);

      setCategory(lead.category && !lead.category.includes('Needs Intake') ? lead.category : (categories[0] || 'Packaging Products'));
      setProductDetails(lead.productDetails || '');
      
      const initialQty = lead.quantity && !lead.quantity.includes('Needs Intake') ? lead.quantity : '';
      const initialLoc = lead.customerLocation && !lead.customerLocation.includes('Needs Intake') ? lead.customerLocation : '';
      setQuantity(initialQty);
      setLocation(initialLoc);
      
      const matched = (branches && branches.length > 0)
        ? (branches.find((b) => lead.branchId && b.id === lead.branchId) ||
           branches.find((b) => b.name === lead.branch && b.salesman === lead.salesman) ||
           branches.find((b) => b.name === lead.branch) ||
           branches[0])
        : null;

      setBranchId(lead.branchId || matched?.id || '');
      setBranch(lead.branch || matched?.name || 'Ghala');
      setSalesman(lead.salesman || matched?.salesman || 'Customer Care');
      
      setDealValue(lead.dealValue ? String(lead.dealValue) : '');
      setCallNotes('');
      setShowLostSection(false);
      setLostReason('price');
      setLostNotes('');
    }
  }, [lead?.id, isOpen, branches]);

  // When branch changes, update both branchId and salesman
  const handleBranchSelect = (selectedId) => {
    const b = branches.find((item) => String(item.id) === String(selectedId)) ||
              branches.find((item) => item.name === selectedId);
    if (b) {
      setBranchId(b.id);
      setBranch(b.name);
      if (b.salesman) {
        setSalesman(b.salesman);
      }
    }
  };

  // Wilayat to Branch Auto-Routing
  const handleLocationChange = (val) => {
    setLocation(val);
    const normalized = val.toLowerCase().trim();
    for (const [wilayatKey, targetBranchName] of Object.entries(OMAN_WILAYAT_MAP)) {
      if (normalized.includes(wilayatKey)) {
        const match = branches.find((b) => b.name.toLowerCase() === targetBranchName.toLowerCase());
        if (match) {
          setBranchId(match.id);
          setBranch(match.name);
          if (match.salesman) setSalesman(match.salesman);
          break;
        }
      }
    }
  };

  // Quick requirement chip toggle/add
  const handleAddRequirementChip = (chip) => {
    setQuantity((prev) => {
      const trimmed = prev.trim();
      if (!trimmed || trimmed === 'General Inquiry' || trimmed === 'Needs Intake') {
        return chip;
      }
      if (trimmed.includes(chip)) return trimmed;
      return `${trimmed}, ${chip}`;
    });
  };

  // Build clean payload with smart fallbacks (no native required traps)
  const buildPayload = () => {
    const triageNote = callNotes ? callNotes.trim() : '';
    const dateStamp = new Date().toLocaleDateString('en-GB');
    const existingNotes = lead.notes ? lead.notes.trim() : '';
    let finalNotes = existingNotes;
    if (triageNote) {
      finalNotes = existingNotes ? `${existingNotes}\n[${dateStamp}] ${triageNote}` : `[${dateStamp}] ${triageNote}`;
    }

    let cleanMobile = mobileNumber.replace(/[^\d+]/g, '');
    while (cleanMobile.startsWith('+968')) cleanMobile = cleanMobile.slice(4);
    while (cleanMobile.startsWith('968') && cleanMobile.length > 8) cleanMobile = cleanMobile.slice(3);
    if (cleanMobile.startsWith('0') && cleanMobile.length === 9) cleanMobile = cleanMobile.slice(1);

    const foundBranch = branches.find((b) => b.id === branchId) ||
                        branches.find((b) => b.name === branch);

    // Preserve existing advanced stage instead of demoting to contacted
    const preservedStatus = (lead.status && ['quotation_sent', 'sample_sent', 'won', 'lost'].includes(lead.status))
      ? lead.status
      : 'contacted';

    return {
      ...lead,
      id: lead.id,
      name: customerName.trim() || lead.name,
      countryCode,
      mobile: cleanMobile,
      phone: cleanMobile ? `${countryCode} ${cleanMobile}` : (lead.phone || ''),
      category: category || 'Packaging Products',
      productDetails: productDetails || '',
      quantity: quantity.trim() || 'General Inquiry',
      customerLocation: location.trim() || (foundBranch?.city ? `${foundBranch.city}, Oman` : 'Muscat, Oman'),
      branchId: branchId || foundBranch?.id || '',
      branch: branch || foundBranch?.name || 'Ghala',
      salesman: salesman.trim() || foundBranch?.salesman || 'Customer Care',
      dealValue: Number(dealValue) || 0,
      notes: finalNotes,
      status: preservedStatus,
      intakeCompleted: true,
      lastContactedAt: new Date().toISOString(),
    };
  };

  if (!isOpen || !lead) return null;

  const currentFullPhone = mobileNumber 
    ? `${countryCode} ${mobileNumber.trim()}`
    : (lead.phone || '');

  const handleCompleteIntake = (e) => {
    e.preventDefault();
    onTransferToPipeline(buildPayload());
  };

  const handleConfirmLost = () => {
    const triageNote = callNotes ? callNotes.trim() : '';
    const dateStamp = new Date().toLocaleDateString('en-GB');
    const lostInfo = `Lost reason: ${lostReason}${lostNotes ? ` (${lostNotes.trim()})` : ''}`;
    const entry = triageNote ? `${triageNote} | ${lostInfo}` : lostInfo;
    const existingNotes = lead.notes ? lead.notes.trim() : '';
    const finalNotes = existingNotes ? `${existingNotes}\n[${dateStamp}] ${entry}` : `[${dateStamp}] ${entry}`;

    onMarkNotConverted({
      id: lead.id,
      name: customerName.trim() || lead.name,
      countryCode,
      mobile: mobileNumber.trim(),
      phone: mobileNumber.trim() ? `${countryCode} ${mobileNumber.trim()}` : lead.phone,
      status: 'lost',
      lostReason,
      lostNotes,
      notes: finalNotes,
      lastContactedAt: new Date().toISOString()
    });
  };

  const handleDeleteCurrentLead = () => {
    if (window.confirm(`Are you sure you want to permanently delete lead "${customerName || lead.name}"? This action cannot be undone.`)) {
      if (onDeleteLead) {
        onDeleteLead(lead.id);
        onClose();
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 mp-overlay bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-hidden">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92vh] sm:max-h-[88vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header with Call Toolbar */}
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-red-950 text-white p-5 border-b border-slate-800">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5 flex-1 mr-4">
              <div className="w-10 h-10 rounded-xl bg-red-600/30 border border-red-500/40 flex items-center justify-center text-red-400 shrink-0">
                <Headphones className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-red-500 text-white">
                    Step 1 & 2 Workflow
                  </span>
                  <span className="text-xs text-slate-400 font-medium">Customer Care Intake Desk</span>
                </div>
                {/* Editable Customer Name */}
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Customer / Company Name"
                  className="text-lg font-black text-white mt-1 tracking-tight bg-white/10 hover:bg-white/15 focus:bg-white/20 border border-white/20 rounded-lg px-2.5 py-1 w-full focus:outline-none focus:ring-1 focus:ring-red-400"
                  title="Click to edit customer name"
                />
              </div>
            </div>
            
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Call & Editable Phone Banner */}
          <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 bg-white/5 p-3 rounded-xl border border-white/10">
            <div className="flex-1 min-w-[200px]">
              <label className="text-[10px] uppercase font-bold text-slate-300 tracking-wider flex items-center gap-1 mb-1">
                <Phone className="w-3 h-3 text-red-400" />
                Customer Phone Number (Edit if Mistaken)
              </label>
              <div className="flex items-center gap-1.5">
                <span className="px-2.5 py-1.5 rounded-lg bg-white/10 border border-white/20 text-xs font-mono font-bold text-slate-200">
                  {countryCode}
                </span>
                <input
                  type="text"
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value)}
                  placeholder="e.g. 91386771"
                  className="flex-1 bg-white/15 hover:bg-white/20 focus:bg-white/25 border border-white/25 rounded-lg px-3 py-1.5 text-sm font-black font-mono text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0">
              {currentFullPhone && (
                <a
                  href={`tel:${currentFullPhone.replace(/\s+/g, '')}`}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-xs"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>Call Now</span>
                </a>
              )}
              <button
                type="button"
                onClick={() => onOpenWhatsApp({ ...lead, phone: currentFullPhone, mobile: mobileNumber })}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-500 hover:bg-green-600 text-white text-xs font-bold transition shadow-xs cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>WhatsApp</span>
              </button>
              {onShareLead && (
                <button
                  type="button"
                  onClick={() => onShareLead({
                    ...lead,
                    name: customerName.trim() || lead.name,
                    phone: currentFullPhone,
                    mobile: mobileNumber,
                    countryCode,
                    branch,
                    salesman,
                    category,
                    quantity,
                    customerLocation: location,
                    dealValue: Number(dealValue) || 0,
                    notes: callNotes ? `${lead.notes || ''}\n${callNotes}`.trim() : lead.notes
                  })}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-xs cursor-pointer"
                  title="Share Lead Briefing & A4 PDF with Salesman"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Share Lead</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Process Roadmap Banner */}
        <div className="bg-slate-50 px-6 py-2.5 border-b border-slate-200 flex items-center justify-between text-[11px] font-semibold text-slate-600">
          <div className="flex items-center gap-2 text-blue-700">
            <span className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center font-bold text-[10px]">1</span>
            <span>Contact & Understand</span>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
          <div className="flex items-center gap-2 text-emerald-700">
            <span className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center font-bold text-[10px]">2</span>
            <span>Analyze & Assign</span>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
          <div className="flex items-center gap-2 text-slate-500">
            <span className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center font-bold text-[10px]">3</span>
            <span>Quotation Follow-up</span>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleCompleteIntake} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto flex-1">
            {/* STEP 1: Understand Customer Requirement */}
          <div className="bg-blue-50/40 p-4 rounded-xl border border-blue-100 space-y-3">
            <div className="flex items-center gap-2 text-xs font-black text-blue-900 uppercase tracking-wider">
              <span className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">1</span>
              <span>Customer Requirements (What do they need?)</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Product Category *
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                >
                  {(() => {
                    const list = Array.isArray(categories) && categories.length > 0
                      ? [...categories]
                      : ['Packaging Products', 'Disposable Products', 'Kohe Products', 'Cleaning Products', 'Food Products'];
                    if (category && !list.includes(category)) {
                      list.push(category);
                    }
                    return list.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ));
                  })()}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Estimated Quantity / Volume
                </label>
                <input
                  type="text"
                  placeholder="e.g. 50 cartons, 2,000 pcs, or pick below"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                />
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {REQUIREMENT_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => handleAddRequirementChip(chip)}
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition cursor-pointer"
                    >
                      + {chip}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Customer Wilayat / Delivery Location in Oman
                </label>
                <div className="relative">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="e.g. Nizwa, Seeb, Sohar, Salalah, Ghala"
                    value={location}
                    onChange={(e) => handleLocationChange(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                  />
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {['Muscat / Seeb', 'Nizwa', 'Sohar', 'Ibri', 'Ibra', 'Salalah'].map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => handleLocationChange(w)}
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 transition cursor-pointer"
                    >
                      📍 {w}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Estimated Deal Budget (OMR)
                </label>
                <div className="relative">
                  <span className="text-xs font-mono font-bold text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    OMR
                  </span>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    placeholder="0.000"
                    value={dealValue}
                    onChange={(e) => setDealValue(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg pl-12 pr-3 py-2 font-mono font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* STEP 2: Analyze & Assign to Oman Branch */}
          <div className="bg-emerald-50/40 p-4 rounded-xl border border-emerald-100 space-y-3">
            <div className="flex items-center gap-2 text-xs font-black text-emerald-900 uppercase tracking-wider">
              <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">2</span>
              <span>Regional Assignment (Which Oman Branch will fulfill this?)</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Nearest Oman Fulfillment Branch
                </label>
                <select
                  value={branchId || branches.find((b) => b.name === branch)?.id || branch}
                  onChange={(e) => handleBranchSelect(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                >
                  {branches.map((b) => (
                    <option key={b.id || `${b.name}-${b.salesman}`} value={b.id}>
                      {b.name}{b.city ? ` (${b.city})` : ''}{b.salesman ? ` - Sales: ${b.salesman}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Assigned Sales Representative
                </label>
                <div className="relative">
                  <UserCheck className="w-3.5 h-3.5 text-emerald-600 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    list="customercare-salesmen"
                    value={salesman}
                    onChange={(e) => setSalesman(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-2 text-slate-800 font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    placeholder="e.g. AFSAL, ANAS, JAMSHID"
                  />
                  <datalist id="customercare-salesmen">
                    {Array.from(new Set(branches.map((b) => b.salesman).filter(Boolean))).map((sm) => (
                      <option key={sm} value={sm} />
                    ))}
                  </datalist>
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-bold text-slate-700">
                  Call Intake Notes & Specific Discussion Points
                </label>
                {lead.notes && (
                  <span className="text-[10px] text-slate-500 font-medium">History preserved automatically</span>
                )}
              </div>
              {lead.notes && (
                <div className="mb-2 p-2.5 bg-white/80 border border-slate-200 rounded-lg text-xs max-h-24 overflow-y-auto">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">Existing Log / Notes:</span>
                  <p className="whitespace-pre-wrap font-mono text-[11px] text-slate-700">{lead.notes}</p>
                </div>
              )}
              <textarea
                rows={2}
                placeholder="Discussed sample delivery next Tuesday; customer requires greaseproof liner, quotation by tomorrow 10 AM..."
                value={callNotes}
                onChange={(e) => setCallNotes(e.target.value)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Lost / Not Converted Toggle */}
          {showLostSection ? (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-rose-900">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  <span>Step 5: Record "Not Converted" Reason</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowLostSection(false)}
                  className="text-[11px] text-slate-500 hover:text-slate-800 underline"
                >
                  Cancel
                </button>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Specific Reason *
                </label>
                <select
                  value={lostReason}
                  onChange={(e) => setLostReason(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-medium"
                >
                  {LOST_REASONS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Reason Explanation & Details
                </label>
                <input
                  type="text"
                  placeholder="e.g. Budget was 50 OMR, customer needed delivery within 2 hours, etc."
                  value={lostNotes}
                  onChange={(e) => setLostNotes(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
                />
              </div>

              <button
                type="button"
                onClick={handleConfirmLost}
                className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition"
              >
                Confirm Not Converted & Close Lead
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between text-xs pt-1">
              <button
                type="button"
                onClick={() => setShowLostSection(true)}
                className="text-slate-400 hover:text-rose-600 flex items-center gap-1 transition"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Customer not interested? Mark Not Converted</span>
              </button>
            </div>
          )}
          </div>

          {/* Action Footer */}
          <div className="p-3.5 sm:p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
              >
                Cancel
              </button>

              {onDeleteLead && (
                <button
                  type="button"
                  onClick={handleDeleteCurrentLead}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                  title="Delete accidental or invalid lead"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Lead</span>
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {onSaveAndShare && (
                <button
                  type="button"
                  onClick={() => onSaveAndShare(buildPayload())}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition active:scale-95 cursor-pointer"
                  title="Save intake data and open dossier share dialog"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Save & Share with Salesman</span>
                </button>
              )}

              {onSaveAndQuote && (
                <button
                  type="button"
                  onClick={() => onSaveAndQuote(buildPayload())}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition active:scale-95 cursor-pointer"
                  title="Save intake data and draft official quotation"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Save & Create Quote</span>
                </button>
              )}

              <button
                type="submit"
                className="flex items-center gap-2 px-5 sm:px-6 py-2.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white text-xs font-bold rounded-xl shadow-md shadow-red-900/30 transition active:scale-95 cursor-pointer"
              >
                <CheckCircle className="w-4 h-4 text-white" />
                <span>Complete Intake & Move to Pipeline</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </form>

      </div>
    </div>
  );
}
