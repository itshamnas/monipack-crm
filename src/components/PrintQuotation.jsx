import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Printer, 
  X, 
  Edit3, 
  Plus, 
  Trash2, 
  RotateCcw, 
  Check, 
  Save, 
  Percent, 
  ArrowRight,
  Share2,
  Send,
  Copy,
  MessageSquare
} from 'lucide-react';

/**
 * monipack Enterprise CRM - Executive Quotation Print Engine
 * Morooj Nizwa International LLC
 * 
 * Features:
 * - Rendered in React Portal to document.body for 100% leak-proof printing (hides #root in print)
 * - Zero application bleed: "Official Quotations" header and buttons never leak into the PDF
 * - Clean pure-white A4 portrait sizing with 12mm/15mm page margins
 * - Repeating thead on every page (table-header-group) and row break-inside protection
 * - Grouped totals, terms, signature, and 4-brand logo footer block (print-closing-block)
 * - In-place customizable Commercial Terms with instant "Reset to Standard" option
 * - Professional formatting for customer names (capitalize), address, phone (no dangling hyphens), and OMR currency
 */
export default function PrintQuotation({ quotation, onClose, onUpdateTerms, onUpdateVat }) {
  if (!quotation) return null;

  const defaultStandardTerms = [
    'All prices are quoted in Omani Rial (OMR).',
    `Quotation validity: ${quotation.validityDays || 30} days from date of issue.`,
    'Payment terms: As per agreed commercial credit terms.',
    'Delivery: Fast delivery across all Oman Wilayats upon confirmed PO.',
  ];

  const isJunkTerm = (t) => {
    if (!t || typeof t !== 'string') return true;
    const lower = t.trim().toLowerCase();
    return ['test', 'testing', 'asdf', 'sample'].includes(lower) || lower.length < 2;
  };

  const parseInitialTerms = () => {
    let raw = [];
    if (Array.isArray(quotation.terms) && quotation.terms.length > 0) {
      raw = quotation.terms;
    } else if (typeof quotation.terms === 'string' && quotation.terms.trim().length > 0) {
      raw = quotation.terms.split('\n').map((s) => s.trim()).filter(Boolean);
    }
    const filtered = raw.filter((t) => !isJunkTerm(t));
    return filtered.length > 0 ? filtered : defaultStandardTerms;
  };

  const [terms, setTerms] = useState(parseInitialTerms);
  const [isEditingTerms, setIsEditingTerms] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [sharePhone, setSharePhone] = useState(
    quotation.phone && quotation.phone !== '+968 -' && quotation.phone !== '+968'
      ? quotation.phone.replace(/[^\d+]/g, '')
      : ''
  );
  const [quoteCopied, setQuoteCopied] = useState(false);

  // VAT State & Calculations
  const [currentVatEnabled, setCurrentVatEnabled] = useState(
    quotation.enableVat !== false
  );
  const [currentVatRate, setCurrentVatRate] = useState(
    quotation.vatRate !== undefined ? Number(quotation.vatRate) : 5
  );

  useEffect(() => {
    setCurrentVatEnabled(quotation.enableVat !== false);
    setCurrentVatRate(quotation.vatRate !== undefined ? Number(quotation.vatRate) : 5);
  }, [quotation.enableVat, quotation.vatRate]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isEditingTerms) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isEditingTerms]);

  const subtotal = Number(quotation.subtotalOMR || 0);
  const vatAmount = currentVatEnabled
    ? Number((subtotal * (currentVatRate / 100)).toFixed(3))
    : 0;
  const grandTotal = Number((subtotal + vatAmount).toFixed(3));

  const handleToggleVat = async () => {
    const nextEnabled = !currentVatEnabled;
    const nextAmount = nextEnabled ? Number((subtotal * (currentVatRate / 100)).toFixed(3)) : 0;
    const nextGrandTotal = Number((subtotal + nextAmount).toFixed(3));

    setCurrentVatEnabled(nextEnabled);
    if (onUpdateVat) {
      try {
        await onUpdateVat({
          enableVat: nextEnabled,
          vatRate: currentVatRate,
          vatAmountOMR: nextAmount,
          grandTotalOMR: nextGrandTotal
        });
      } catch (err) {
        console.error('Failed to update VAT on quotation', err);
      }
    }
  };

  const handlePrint = () => {
    setIsEditingTerms(false);
    setTimeout(() => {
      window.print();
    }, 100);
  };

  const handleAddTerm = () => {
    setTerms((prev) => [...prev, '']);
  };

  const handleTermChange = (index, value) => {
    setTerms((prev) => {
      const copy = [...prev];
      copy[index] = value;
      return copy;
    });
  };

  const handleRemoveTerm = (index) => {
    setTerms((prev) => prev.filter((_, i) => i !== index));
  };

  const handleResetTerms = () => {
    setTerms(defaultStandardTerms);
  };

  const handleSaveTermsToDb = async () => {
    const cleanTerms = terms.filter((t) => typeof t === 'string' && t.trim().length > 0 && !isJunkTerm(t));
    setTerms(cleanTerms.length > 0 ? cleanTerms : defaultStandardTerms);
    if (onUpdateTerms) {
      setIsSaving(true);
      try {
        await onUpdateTerms(cleanTerms.length > 0 ? cleanTerms : defaultStandardTerms);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2500);
      } catch (err) {
        console.error('Failed to save terms', err);
      } finally {
        setIsSaving(false);
      }
    }
    setIsEditingTerms(false);
  };

  const items = quotation.items || [];

  const handleSendQuoteWhatsApp = (target = 'web') => {
    const clean = sharePhone.replace(/\D/g, '');
    const full = clean.length === 8 ? `968${clean}` : clean;
    if (!full) {
      alert('Please enter a recipient mobile number (e.g. 91386771).');
      return;
    }
    const vatText = currentVatEnabled ? `(Incl. ${currentVatRate}% Oman VAT)` : '(Tax Exempt)';
    const text = 
`📄 *OFFICIAL PRICE QUOTATION — MONIPACK*
━━━━━━━━━━━━━━━━━━━━━━━━━
🏛️ *Company:* Morooj Nizwa International LLC
📜 *Quote Ref:* ${quotation.code || 'MNI-QTN'}
🏢 *Customer:* ${quotation.customerName || 'Valued Customer'}
📍 *Address:* ${quotation.address || 'Muscat, Sultanate of Oman'}
📅 *Date:* ${quotation.date || new Date().toISOString().split('T')[0]} (Valid 30 Days)
📦 *Total Line Items:* ${items.length} item(s)
💰 *Grand Total (OMR):* OMR ${grandTotal.toFixed(3)} ${vatText}
👤 *Sales Representative:* ${quotation.salesRep || 'Shamnas Acheerakath'}
━━━━━━━━━━━━━━━━━━━━━━━━━
View / Download Official A4 Specification: https://crm.monipack.com
Commercial Hotline: +968 79062219 | info@monipack.com`;

    const encoded = encodeURIComponent(text);
    const url = target === 'app'
      ? `https://api.whatsapp.com/send?phone=${full}&text=${encoded}`
      : `https://web.whatsapp.com/send?phone=${full}&text=${encoded}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    setShowShareModal(false);
  };

  const handleCopyQuoteSummary = async () => {
    const vatText = currentVatEnabled ? `(Incl. ${currentVatRate}% Oman VAT)` : '(Tax Exempt)';
    const text = 
`📄 *OFFICIAL PRICE QUOTATION — MONIPACK*
━━━━━━━━━━━━━━━━━━━━━━━━━
🏛️ *Company:* Morooj Nizwa International LLC
📜 *Quote Ref:* ${quotation.code || 'MNI-QTN'}
🏢 *Customer:* ${quotation.customerName || 'Valued Customer'}
📍 *Address:* ${quotation.address || 'Muscat, Sultanate of Oman'}
📅 *Date:* ${quotation.date || new Date().toISOString().split('T')[0]} (Valid 30 Days)
📦 *Total Line Items:* ${items.length} item(s)
💰 *Grand Total (OMR):* OMR ${grandTotal.toFixed(3)} ${vatText}
👤 *Sales Representative:* ${quotation.salesRep || 'Shamnas Acheerakath'}
━━━━━━━━━━━━━━━━━━━━━━━━━
Commercial Hotline: +968 79062219 | www.monipack.com`;
    try {
      await navigator.clipboard.writeText(text);
      setQuoteCopied(true);
      setTimeout(() => setQuoteCopied(false), 2500);
    } catch {
      alert('Quotation summary copied to clipboard.');
    }
  };

  return createPortal(
    <div 
      className="quotation-modal-overlay fixed inset-0 z-50 bg-slate-950 sm:bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-start overflow-y-auto p-2 sm:p-4 md:p-6 pb-20 sm:pb-8"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isEditingTerms) {
          onClose();
        }
      }}
    >
      {/* Embedded Print Engine Styles for Absolute Browser Fidelity */}
      <style>{`
        @page {
          size: A4 portrait;
          margin: 12mm 15mm;
        }
        @media print {
          /* 1. COMPLETELY HIDE THE APPLICATION ROOT AND NAVIGATION */
          #root,
          #monipack-enterprise-root,
          .no-print,
          aside,
          header,
          footer,
          nav {
            display: none !important;
            visibility: hidden !important;
          }

          /* 2. RESET BODY & HTML TO PRISTINE WHITE PAPER */
          html, body {
            background: #ffffff !important;
            color: #0f172a !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: auto !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* 3. MODAL OVERLAY BECOMES SEAMLESS FULL-PAGE PRINT WRAPPER */
          .quotation-modal-overlay {
            position: static !important;
            background: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
            display: block !important;
            width: 100% !important;
            height: auto !important;
            min-height: auto !important;
            z-index: auto !important;
            backdrop-filter: none !important;
          }

          /* 4. THE A4 SHEET EXPANDS NATURALLY WITHOUT BORDERS OR SHADOWS */
          .quotation-sheet {
            box-shadow: none !important;
            border: none !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            min-height: auto !important;
            height: auto !important;
            background: #ffffff !important;
          }

          /* 5. TABLE PAGINATION & HEADER REPETITION */
          .quotation-table-wrapper,
          .quotation-sheet div {
            overflow: visible !important; /* Critical: allows tables with 25 to 50+ items to paginate across pages without clipping */
          }
          table {
            width: 100% !important;
            border-collapse: collapse !important;
          }
          thead {
            display: table-header-group !important; /* Repeats table header on every new page */
          }
          tbody {
            display: table-row-group !important;
          }
          tfoot {
            display: table-footer-group !important;
          }
          tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important; /* Prevents rows from cutting across pages */
          }

          /* 6. CLOSING BLOCK INTEGRITY (TOTALS, TERMS, SIGNATURE, BRAND FOOTER) */
          .print-closing-block,
          .print\\:break-inside-avoid {
            page-break-inside: avoid !important;
            break-inside: avoid !important; /* Keeps totals, terms, signatures & brand logos together */
          }

          img {
            max-width: 100% !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>

      {/* Action Bar (Sticky pinned on mobile, floating glass on desktop, never printed) */}
      <div className="sticky top-0 left-0 right-0 z-50 w-full bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-3 py-2 sm:px-4 sm:py-2.5 flex items-center justify-between shadow-xl sm:fixed sm:top-4 sm:right-4 sm:w-auto sm:rounded-xl sm:border sm:border-slate-700 sm:shadow-2xl sm:border-b-0 no-print shrink-0">
        {/* Left: Mobile Close & Quote Code badge */}
        <div className="flex items-center gap-1.5 sm:hidden">
          <button
            onClick={onClose}
            className="p-1.5 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition cursor-pointer flex items-center gap-1 text-xs font-bold"
            title="Close Preview"
          >
            <X className="w-4 h-4" />
            <span>Close</span>
          </button>
          <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
            {quotation.code || 'MNI-QTN'}
          </span>
        </div>

        {/* Action Buttons: VAT, Terms, Print/PDF, Desktop Close */}
        <div className="flex items-center gap-1.5 sm:gap-2 ml-auto sm:ml-0">
          <button
            onClick={handleToggleVat}
            className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 sm:py-2 text-[11px] sm:text-xs font-bold rounded-lg shadow-md transition cursor-pointer active:scale-95 whitespace-nowrap ${
              currentVatEnabled 
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white' 
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
            }`}
            title="Toggle 5% Oman VAT on this quotation"
          >
            <Percent className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">{currentVatEnabled ? `VAT: ${currentVatRate}% (Active)` : 'VAT: Exempt (Off)'}</span>
            <span className="xs:hidden">{currentVatEnabled ? '5% VAT' : 'Exempt'}</span>
          </button>

          <button
            onClick={() => setIsEditingTerms((prev) => !prev)}
            className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 sm:py-2 text-[11px] sm:text-xs font-bold rounded-lg shadow-md transition cursor-pointer active:scale-95 whitespace-nowrap ${
              isEditingTerms 
                ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 font-black' 
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
            }`}
            title="Toggle editing terms and conditions"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">{isEditingTerms ? 'Close Terms' : 'Edit Terms'}</span>
            <span className="xs:hidden">Terms</span>
          </button>

          <button
            onClick={() => setShowShareModal((prev) => !prev)}
            className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 sm:py-2 text-[11px] sm:text-xs font-bold rounded-lg shadow-md transition cursor-pointer active:scale-95 whitespace-nowrap ${
              showShareModal
                ? 'bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black'
                : 'bg-emerald-700 hover:bg-emerald-800 text-white'
            }`}
            title="Share quotation via WhatsApp"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Share / WhatsApp</span>
            <span className="sm:hidden">Share</span>
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 bg-[#CC1A22] hover:bg-red-700 text-white text-[11px] sm:text-xs font-bold rounded-lg shadow-md transition cursor-pointer active:scale-95 whitespace-nowrap"
            title="Print or Save as PDF"
          >
            <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Print / Save as PDF</span>
            <span className="sm:hidden">Print PDF</span>
          </button>

          <button
            onClick={onClose}
            className="hidden sm:flex p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
            title="Close Preview (or press Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* WhatsApp Share Floating Dropdown Panel */}
      {showShareModal && (
        <div className="fixed top-14 sm:top-20 right-2 sm:right-6 z-50 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 p-4 text-xs space-y-3 no-print animate-in fade-in zoom-in-95 text-slate-800">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="font-extrabold text-slate-900 flex items-center gap-1.5">
              <Share2 className="w-4 h-4 text-emerald-600" />
              <span>Share Quotation via WhatsApp</span>
            </span>
            <button
              onClick={() => setShowShareModal(false)}
              className="text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">
              Recipient Mobile (Customer / Salesman)
            </label>
            <input
              type="text"
              value={sharePhone}
              onChange={(e) => setSharePhone(e.target.value)}
              placeholder="e.g. 91386771 or +968 91386771"
              className="w-full text-xs font-mono font-bold border border-slate-300 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="flex flex-col gap-1.5 pt-1">
            <button
              onClick={() => handleSendQuoteWhatsApp('web')}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer shadow-xs"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send WhatsApp Web</span>
            </button>
            <button
              onClick={() => handleSendQuoteWhatsApp('app')}
              className="w-full py-2 bg-emerald-800 hover:bg-emerald-900 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Send WhatsApp App</span>
            </button>
            <button
              onClick={handleCopyQuoteSummary}
              className="w-full py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              {quoteCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
              <span>{quoteCopied ? 'Copied Summary! ✓' : 'Copy Quote Text'}</span>
            </button>
          </div>
        </div>
      )}

      {/* The Printable A4 Sheet */}
      <div 
        className="quotation-sheet shrink-0 bg-white w-full max-w-[850px] min-h-fit h-auto p-3.5 sm:p-8 md:p-10 pb-8 sm:pb-10 rounded-xl shadow-2xl border border-slate-200 text-slate-900 relative my-2 sm:my-8 print:my-0 print:p-0 print:border-none print:shadow-none print:max-w-none print:min-h-0 print:w-full print:rounded-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ==========================================================================
            Header: 3D Ribbon Logo + Ghala Address (Left) & QUOTATION + Ref (Right)
            ========================================================================== */}
        <div className="flex items-start justify-between mb-6 pb-2">
          {/* Left: 3D Ribbon Logo & Address */}
          <div className="flex items-center gap-4">
            <div className="w-24 sm:w-28 shrink-0">
              <img
                src="/brands/monipack-cropped.png"
                alt="monipack"
                className="w-full h-auto object-contain block drop-shadow-xs"
              />
            </div>
            <div className="text-slate-800 text-[13px] font-medium leading-tight">
              <div className="font-bold text-slate-900">Ghala</div>
              <div>Muscat</div>
              <div>Sultanate of Oman</div>
            </div>
          </div>

          {/* Right: QUOTATION & QTN Code */}
          <div className="text-right">
            <h1 className="text-3xl font-black tracking-tight text-slate-900 font-sans uppercase">
              QUOTATION
            </h1>
            <div className="text-sm font-bold text-slate-700 font-mono mt-0.5 tracking-tight">
              {quotation.code || 'MNI-ITS-2026-1042'}
            </div>
          </div>
        </div>

        {/* ==========================================================================
            Customer & Quote Info Box (Clean dual-card with rounded border)
            ========================================================================== */}
        <div className="border border-slate-300 rounded-lg p-2.5 sm:p-3.5 mb-5 bg-white text-xs">
          <div className="grid grid-cols-2 divide-x divide-slate-300 gap-1 sm:gap-0">
            {/* Prepared For: */}
            <div className="pr-2 sm:pr-4 space-y-1 min-w-0">
              <div className="font-bold text-slate-900 text-[10px] sm:text-[11px] mb-0.5 sm:mb-1 uppercase tracking-wider">
                Prepared For:
              </div>
              <div className="font-bold text-slate-950 text-xs sm:text-sm capitalize truncate sm:whitespace-normal">
                {quotation.customerName || 'Valued Customer'}
              </div>
              <div className="text-slate-700 text-[11px] sm:text-xs break-words">
                {quotation.address || 'Muscat, Sultanate of Oman'}
              </div>
              {quotation.phone && quotation.phone !== '+968 -' && quotation.phone !== '+968' && (
                <div className="text-slate-700 text-[10px] sm:text-xs font-mono break-words">
                  <span className="font-semibold text-slate-800 font-sans">Contact:</span> {quotation.phone}
                </div>
              )}
              {quotation.attn && (
                <div className="text-slate-700 text-[10px] sm:text-xs break-words">
                  <span className="font-semibold text-slate-800">Attn:</span> {quotation.attn}
                </div>
              )}
              {quotation.email && (
                <div className="text-slate-700 text-[10px] sm:text-xs truncate sm:break-words">
                  <span className="font-semibold text-slate-800">Email:</span> {quotation.email}
                </div>
              )}
            </div>

            {/* Quote Info: */}
            <div className="pl-2 sm:pl-6 space-y-1 min-w-0">
              <div className="font-bold text-slate-900 text-[10px] sm:text-[11px] mb-0.5 sm:mb-1 uppercase tracking-wider">
                Quote Info:
              </div>
              <div className="text-slate-800 text-[11px] sm:text-xs flex items-center justify-between">
                <span className="font-semibold text-slate-700">Issue Date:</span>
                <span className="font-mono font-bold text-slate-900">{quotation.date || new Date().toISOString().split('T')[0]}</span>
              </div>
              <div className="text-slate-800 text-[11px] sm:text-xs flex items-center justify-between">
                <span className="font-semibold text-slate-700">Validity:</span>
                <span className="font-bold text-slate-900">{quotation.validityDays || 30} Days</span>
              </div>
              <div className="text-slate-800 text-[11px] sm:text-xs flex items-center justify-between">
                <span className="font-semibold text-slate-700">Sales Rep:</span>
                <span className="font-bold text-slate-900 truncate max-w-[110px] sm:max-w-none">{quotation.salesRep || 'Hamad Al Kindi'}</span>
              </div>
              {quotation.branch && (
                <div className="text-slate-800 text-[11px] sm:text-xs flex items-center justify-between">
                  <span className="font-semibold text-slate-700">Branch:</span>
                  <span className="font-bold text-slate-900 truncate max-w-[110px] sm:max-w-none">{quotation.branch}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ==========================================================================
            Items Table (Clean Grey Header, Vertical Dividers, table-header-group Pagination)
            ========================================================================== */}
        <div className="mb-4">
          <div className="sm:hidden flex items-center justify-between text-[10px] text-slate-500 font-semibold mb-1 px-1 no-print">
            <span className="uppercase tracking-wider text-slate-400 font-bold">Line Items</span>
            <span className="flex items-center gap-1 text-red-600 font-bold">
              Swipe table <ArrowRight className="w-3 h-3" />
            </span>
          </div>

          <div className="quotation-table-wrapper border border-slate-300 rounded-md overflow-x-auto print:overflow-visible print:border-none shadow-2xs">
            <table className="w-full min-w-[560px] sm:min-w-0 text-left text-xs border-collapse">
              <thead 
                className="bg-slate-100 text-slate-900 text-[11px] font-bold select-none border-b border-slate-300"
                style={{ display: 'table-header-group' }}
              >
              <tr>
                <th className="py-2.5 px-2 text-center border-r border-slate-300 w-[6%] font-black uppercase">#</th>
                <th className="py-2.5 px-3 border-r border-slate-300 w-[48%] font-black uppercase">Description</th>
                <th className="py-2.5 px-2 text-center border-r border-slate-300 w-[11%] font-black uppercase">Unit</th>
                <th className="py-2.5 px-2 text-center border-r border-slate-300 w-[10%] font-black uppercase">Qty</th>
                <th className="py-2.5 px-3 text-right border-r border-slate-300 w-[12%] font-black uppercase whitespace-nowrap">Price (OMR)</th>
                <th className="py-2.5 px-3 text-right w-[13%] font-black uppercase whitespace-nowrap">Total (OMR)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {items.length > 0 ? (
                items.map((item, idx) => {
                  const qty = Number(item.quantity || 1);
                  const price = Number(item.unitPriceOMR || 0);
                  const lineTotal = Number(item.totalOMR !== undefined ? item.totalOMR : (qty * price));

                  return (
                    <tr 
                      key={idx} 
                      className="border-b border-slate-200 bg-white"
                      style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}
                    >
                      <td className="py-2.5 px-2 text-center font-bold text-slate-600 border-r border-slate-200">
                        {idx + 1}.
                      </td>
                      <td className="py-2.5 px-3 border-r border-slate-200">
                        <div className="font-bold text-slate-950 text-xs">{item.item || 'Packaging Item'}</div>
                        {item.description && (
                          <div className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                            ({item.description})
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-center font-semibold text-slate-700 border-r border-slate-200">
                        {item.unit || 'CTN'}
                      </td>
                      <td className="py-2.5 px-2 text-center font-bold text-slate-900 border-r border-slate-200">
                        {qty}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-medium text-slate-800 border-r border-slate-200">
                        {price.toFixed(3)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-950">
                        {lineTotal.toFixed(3)}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="6" className="text-center py-8 text-slate-400">
                    No items in this quotation
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot style={{ display: 'table-footer-group' }}>
              <tr>
                <td colSpan="6" className="h-1"></td>
              </tr>
            </tfoot>
          </table>
          </div>
        </div>

        {/* Totals Block (Right Aligned, Elegant Omani OMR Currency Formatting) */}
        <div className="flex justify-end mb-6">
          <div className="w-72 text-xs space-y-1.5 bg-slate-50/60 p-3 rounded-lg border border-slate-200">
            <div className="flex justify-between items-center text-slate-700 px-1">
              <span className="font-semibold text-slate-600">Subtotal:</span>
              <span className="font-mono font-bold text-slate-900">
                OMR {subtotal.toFixed(3)}
              </span>
            </div>

            {currentVatEnabled ? (
              <div className="flex justify-between items-center text-slate-700 px-1">
                <span className="font-semibold text-slate-600">VAT ({currentVatRate}%):</span>
                <span className="font-mono font-bold text-slate-900">
                  OMR {vatAmount.toFixed(3)}
                </span>
              </div>
            ) : (
              <div className="flex justify-between items-center text-slate-500 italic text-[11px] px-1">
                <span>VAT:</span>
                <span>Tax Exempt (0%)</span>
              </div>
            )}

            <div className="border-t border-slate-300 pt-2 flex justify-between items-center px-1">
              <span className="font-black text-slate-950 text-sm">Grand Total:</span>
              <span className="font-mono font-black text-base text-[#CC1A22] tracking-tight">
                OMR {grandTotal.toFixed(3)}
              </span>
            </div>
          </div>
        </div>

        {/* ==========================================================================
            Closing Block Integrity: Terms, Signature, and Bottom Logos Bar
            ========================================================================== */}
        <div 
          className="print-closing-block print:break-inside-avoid"
          style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}
        >
          {/* Terms & Conditions (Left) and Authorized Signature (Right) */}
          <div className="flex flex-col gap-6 sm:grid sm:grid-cols-12 sm:gap-8 my-6 print:grid print:grid-cols-12 print:gap-8">
            {/* Left: Standard Terms & Conditions */}
            <div className="w-full sm:col-span-7 print:col-span-7 text-[11px] text-slate-700 space-y-1">
              <div className="flex items-center justify-between mb-1.5">
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                  Standard Terms & Conditions
                </h4>
                <div className="flex items-center gap-1.5 no-print">
                  {saveSuccess && (
                    <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                      <Check className="w-3 h-3" /> Saved!
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsEditingTerms((prev) => !prev)}
                    className="text-[10px] font-bold text-[#CC1A22] hover:text-red-800 bg-red-50 hover:bg-red-100 border border-red-200 px-2 py-0.5 rounded transition cursor-pointer"
                  >
                    {isEditingTerms ? 'Done' : 'Change Terms'}
                  </button>
                </div>
              </div>

              {/* Normal Read / Print View */}
              {!isEditingTerms && (
                <ul className="space-y-1 text-slate-600 leading-snug">
                  {terms.map((term, i) => (
                    <li key={i}>• {term}</li>
                  ))}
                  {terms.length === 0 && (
                    <li className="italic text-slate-400">No terms specified.</li>
                  )}
                </ul>
              )}

              {/* Interactive In-Place Terms Editor (Hidden in Print) */}
              {isEditingTerms && (
                <div className="no-print bg-slate-50 border border-slate-300 rounded-lg p-3 space-y-2 mt-2 shadow-xs">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-1.5 text-[10px]">
                    <span className="font-bold text-slate-700">Edit Commercial Terms</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleResetTerms}
                        className="text-slate-500 hover:text-slate-800 flex items-center gap-1 font-semibold cursor-pointer"
                        title="Reset to default Oman terms"
                      >
                        <RotateCcw className="w-2.5 h-2.5" />
                        <span>Reset Defaults</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleAddTerm}
                        className="text-[#CC1A22] hover:text-red-800 flex items-center gap-0.5 font-bold cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add Line</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {terms.map((term, idx) => (
                      <div key={idx} className="flex items-center gap-1.5">
                        <span className="text-[10px] text-slate-400 font-bold w-4">{idx + 1}.</span>
                        <input
                          type="text"
                          value={term}
                          onChange={(e) => handleTermChange(idx, e.target.value)}
                          placeholder="Commercial condition clause..."
                          className="flex-1 text-[11px] bg-white border border-slate-300 rounded px-2 py-1 focus:outline-none focus:border-[#CC1A22]"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveTerm(idx)}
                          className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                          title="Delete line"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                    <span className="text-[9px] text-slate-400">
                      Changes apply instantly to this print view.
                    </span>
                    <div className="flex items-center gap-2">
                      {onUpdateTerms && (
                        <button
                          type="button"
                          onClick={handleSaveTermsToDb}
                          disabled={isSaving}
                          className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] rounded transition active:scale-95 disabled:opacity-50 cursor-pointer"
                        >
                          <Save className="w-3 h-3" />
                          <span>{isSaving ? 'Saving...' : 'Save to CRM'}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsEditingTerms(false)}
                        className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-[10px] rounded transition cursor-pointer"
                      >
                        Apply & Close
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Signature & Stamp */}
            <div className="w-full sm:col-span-5 print:col-span-5 flex flex-col justify-end items-center mt-3 sm:mt-0">
              <div className="w-full max-w-[240px] sm:max-w-none border-b border-slate-400 mb-1.5 h-12 sm:h-14"></div>
              <div className="text-xs font-semibold text-slate-800 text-center">
                Authorized Signature & Stamp
              </div>
            </div>
          </div>

          {/* Divider Line */}
          <div className="border-t border-slate-300 my-4"></div>

          {/* 4 Brand Logos Strip (monipack, moniclean, KOHE, monifood) */}
          <div className="grid grid-cols-4 gap-2 items-center justify-items-center sm:flex sm:items-center sm:justify-between px-1 sm:px-6 py-2">
            <div className="flex items-center justify-center h-8 sm:h-12 w-full max-w-[75px] sm:w-28">
              <img
                src="/brands/monipack-cropped.png"
                alt="monipack"
                className="max-h-7 sm:max-h-11 max-w-full object-contain"
              />
            </div>
            <div className="flex items-center justify-center h-8 sm:h-12 w-full max-w-[75px] sm:w-28">
              <img
                src="/brands/moniclean-cropped.png"
                alt="moniclean"
                className="max-h-7 sm:max-h-11 max-w-full object-contain"
              />
            </div>
            <div className="flex items-center justify-center h-8 sm:h-12 w-full max-w-[75px] sm:w-28">
              <img
                src="/brands/kohe-cropped.png"
                alt="KOHE"
                className="max-h-6 sm:max-h-8 max-w-full object-contain"
              />
            </div>
            <div className="flex items-center justify-center h-8 sm:h-12 w-full max-w-[75px] sm:w-28">
              <img
                src="/brands/monifood-cropped.png"
                alt="monifood"
                className="max-h-6 sm:max-h-10 max-w-full object-contain"
              />
            </div>
          </div>

          {/* Legal Footer Line */}
          <div className="text-center text-[10px] text-slate-500 font-medium mt-1">
            A division of Morooj Nizwa International LLC. Generated by monipack CRM.
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
}
