import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getCompany } from '../utils/pdfReport.js';
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
// ---- helpers for the printed sheet ----
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function niceDate(value) {
  const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return value || '';
  return `${Number(m[3])} ${MONTHS.at(Number(m[2]) - 1)} ${m[1]}`;
}
function addDays(value, days) {
  const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + Number(days || 0)));
  return d.toISOString().slice(0, 10);
}
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function words(n) {
  n = Math.floor(n);
  if (n === 0) return 'Zero';
  const chunk = (x) => {
    const h = Math.floor(x / 100), r = x % 100;
    const parts = [];
    if (h) parts.push(`${ONES.at(h)} Hundred`);
    if (r) parts.push(r < 20 ? ONES.at(r) : `${TENS.at(Math.floor(r / 10))}${r % 10 ? `-${ONES.at(r % 10)}` : ''}`);
    return parts.join(' and ');
  };
  const units = [[1e9, 'Billion'], [1e6, 'Million'], [1e3, 'Thousand']];
  const out = [];
  for (const [size, name] of units) {
    if (n >= size) { out.push(`${chunk(Math.floor(n / size))} ${name}`); n %= size; }
  }
  if (n) out.push(chunk(n));
  return out.join(' ');
}
/** 152.250 -> "Omani Rials One Hundred and Fifty-Two and Baisa Two Hundred and Fifty Only" */
function omrInWords(amount) {
  const baisaTotal = Math.round(Number(amount || 0) * 1000);
  const rials = Math.floor(baisaTotal / 1000), baisa = baisaTotal % 1000;
  return `Omani Rials ${words(rials)}${baisa ? ` and Baisa ${words(baisa)}` : ''} Only`;
}

export default function PrintQuotation({ quotation, onClose, onUpdateTerms, onUpdateVat }) {
  const [company, setCompany] = useState(null);
  useEffect(() => { getCompany().then(setCompany); }, []);
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
👤 *Sales Representative:* ${quotation.salesRep || 'Monipack sales team'}
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
👤 *Sales Representative:* ${quotation.salesRep || 'Monipack sales team'}
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
      className="quotation-modal-overlay fixed inset-0 z-50 mp-overlay bg-slate-950 sm:bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-start overflow-y-auto p-2 sm:p-4 md:p-6 pb-20 sm:pb-8"
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
        className="quotation-sheet shrink-0 bg-white w-full max-w-[850px] min-h-fit h-auto p-4 sm:p-10 rounded-xl shadow-2xl border border-slate-200 text-slate-900 relative my-2 sm:my-8 print:my-0 print:p-0 print:border-none print:shadow-none print:max-w-none print:min-h-0 print:w-full print:rounded-none"
        onClick={(e) => e.stopPropagation()}
        style={{ fontFamily: "Inter, Arial, 'Cairo', sans-serif" }}
      >
        <img className="mp-sheet-wm" src="/brands/watermark.png" alt="" aria-hidden="true" />
        {/* Letterhead */}
        <div className="flex items-start justify-between gap-6 pb-4 border-b-[3px] border-[#CC1A22]">
          <div className="flex items-start gap-4 min-w-0">
            <img src="/brands/monipack-cropped.png" alt="monipack" className="w-20 sm:w-24 h-auto object-contain shrink-0" />
            <div className="text-[11px] leading-snug text-slate-600 min-w-0">
              <div className="text-sm font-extrabold text-slate-900">{company?.companyName || 'Morooj Nizwa International LLC'}</div>
              {company?.companyNameAr && <div className="text-[12px] font-semibold text-slate-800" dir="rtl" style={{ fontFamily: "'Cairo', Arial, sans-serif", textAlign: 'left' }}>{company.companyNameAr}</div>}
              <div>{company?.headquarters || 'Ghala, Muscat, Sultanate of Oman'}{company?.poBox ? ` · ${company.poBox}` : ''}</div>
              <div>{[company?.phone, company?.email, company?.website].filter(Boolean).join(' · ')}</div>
              {(company?.crNumber || company?.vatNumber) && (
                <div className="font-semibold text-slate-700">
                  {[company?.crNumber && `CR No. ${company.crNumber}`, company?.vatNumber && `VATIN ${company.vatNumber}`].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <h1 className="text-2xl sm:text-3xl font-black tracking-[0.12em] text-slate-900 uppercase">Quotation</h1>
            <table className="mt-2 ml-auto text-[11px]">
              <tbody>
                <tr><td className="pr-3 text-slate-500 text-left">Quotation No.</td><td className="font-bold font-mono text-slate-900">{quotation.code}</td></tr>
                <tr><td className="pr-3 text-slate-500 text-left">Date</td><td className="font-semibold text-slate-900">{niceDate(quotation.date) || niceDate(new Date().toISOString())}</td></tr>
                <tr><td className="pr-3 text-slate-500 text-left">Valid until</td><td className="font-semibold text-slate-900">{niceDate(addDays(quotation.date, quotation.validityDays || 30))}</td></tr>
                {quotation.salesRep && <tr><td className="pr-3 text-slate-500 text-left">Sales rep</td><td className="font-semibold text-slate-900">{quotation.salesRep}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bill to */}
        <div className="grid grid-cols-2 gap-6 py-4 text-[12px]">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#CC1A22] mb-1">Quotation for</div>
            <div className="text-[15px] font-bold text-slate-950 break-words">{quotation.customerName || 'Valued Customer'}</div>
            {quotation.attn && <div className="text-slate-700">Attn: {quotation.attn}</div>}
            <div className="text-slate-600 break-words">{quotation.address || 'Muscat, Sultanate of Oman'}</div>
            {quotation.phone && !['+968', '+968 -'].includes(quotation.phone) && <div className="text-slate-600">Tel: {quotation.phone}</div>}
            {quotation.email && <div className="text-slate-600 break-words">{quotation.email}</div>}
          </div>
          <div className="text-slate-600 self-end text-[11px] leading-relaxed">
            Dear Sir / Madam,<br />
            Thank you for your enquiry. We are pleased to offer the following items at the prices and terms below.
          </div>
        </div>

        {/* Items */}
        <div className="quotation-table-wrapper overflow-x-auto print:overflow-visible">
          <table className="w-full min-w-[560px] sm:min-w-0 text-left text-[12px] border-collapse">
            <thead style={{ display: 'table-header-group' }}>
              <tr className="bg-slate-900 text-white text-[10px] uppercase tracking-wider" style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
                <th className="py-2 px-2 text-center w-[5%] font-bold">#</th>
                <th className="py-2 px-3 w-[47%] font-bold">Item &amp; description</th>
                <th className="py-2 px-2 text-center w-[9%] font-bold">Unit</th>
                <th className="py-2 px-2 text-right w-[9%] font-bold">Qty</th>
                <th className="py-2 px-3 text-right w-[14%] font-bold whitespace-nowrap">Unit price</th>
                <th className="py-2 px-3 text-right w-[16%] font-bold whitespace-nowrap">Amount (OMR)</th>
              </tr>
            </thead>
            <tbody>
              {items.length > 0 ? items.map((item, idx) => {
                const qty = Number(item.quantity || 1);
                const price = Number(item.unitPriceOMR || 0);
                const lineTotal = Number(item.totalOMR !== undefined ? item.totalOMR : qty * price);
                const desc = String(item.description || '').trim();
                return (
                  <tr key={idx} className={`border-b border-slate-200 ${idx % 2 ? 'bg-slate-50' : 'bg-white'}`} style={{ pageBreakInside: 'avoid', breakInside: 'avoid', printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
                    <td className="py-2.5 px-2 text-center text-slate-500 align-top">{idx + 1}</td>
                    <td className="py-2.5 px-3 align-top">
                      <div className="font-semibold text-slate-950">{item.item || 'Packaging item'}</div>
                      {desc && desc !== '-' && <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">{desc}</div>}
                    </td>
                    <td className="py-2.5 px-2 text-center text-slate-700 align-top">{item.unit || 'CTN'}</td>
                    <td className="py-2.5 px-2 text-right tabular-nums text-slate-900 align-top">{qty.toLocaleString('en-US')}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-slate-800 align-top">{price.toFixed(3)}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-slate-950 align-top">{lineTotal.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</td>
                  </tr>
                );
              }) : (
                <tr><td colSpan="6" className="text-center py-8 text-slate-400">No items in this quotation</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Totals + amount in words */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-start justify-between gap-4 mt-4 print:flex-row" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
          <div className="text-[11px] text-slate-600 sm:max-w-[55%]">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 mb-1">Amount in words</div>
            <div className="font-semibold text-slate-800">{omrInWords(grandTotal)}</div>
          </div>
          <table className="w-full sm:w-72 sm:max-w-[288px] text-[12px] print:w-72 print:max-w-[280px] shrink-0">
            <tbody>
              <tr><td className="py-1 text-slate-600">Subtotal</td><td className="py-1 text-right tabular-nums font-semibold">{subtotal.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</td></tr>
              <tr><td className="py-1 text-slate-600">{currentVatEnabled ? `VAT ${currentVatRate}%` : 'VAT (exempt)'}</td><td className="py-1 text-right tabular-nums font-semibold">{vatAmount.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</td></tr>
              <tr className="border-t-2 border-slate-900">
                <td className="pt-2 font-extrabold text-slate-950">Total (OMR)</td>
                <td className="pt-2 text-right tabular-nums font-black text-[16px] text-[#CC1A22]">{grandTotal.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Terms, bank details, signatures */}
        <div className="print-closing-block mt-6" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 print:grid-cols-2 text-[11px]">
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Terms &amp; conditions</div>
                <div className="flex items-center gap-1.5 no-print">
                  {saveSuccess && <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1"><Check className="w-3 h-3" /> Saved!</span>}
                  <button type="button" onClick={() => setIsEditingTerms((prev) => !prev)}
                    className="text-[10px] font-bold text-[#CC1A22] hover:text-red-800 bg-red-50 hover:bg-red-100 border border-red-200 px-2 py-0.5 rounded transition cursor-pointer">
                    {isEditingTerms ? 'Done' : 'Change terms'}
                  </button>
                </div>
              </div>
              {!isEditingTerms && (
                <ol className="list-decimal pl-4 space-y-0.5 text-slate-700 leading-snug">
                  {terms.map((term, i) => <li key={i}>{term}</li>)}
                  {terms.length === 0 && <li className="italic text-slate-400 list-none">No terms specified.</li>}
                </ol>
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
            <div>
              {(company?.bankName || company?.iban || company?.bankAccountNumber) && (
                <>
                  <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 mb-1">Bank details</div>
                  <table className="text-slate-700">
                    <tbody>
                      {company.bankName && <tr><td className="pr-3 text-slate-500">Bank</td><td className="font-semibold">{company.bankName}</td></tr>}
                      {company.bankAccountName && <tr><td className="pr-3 text-slate-500">Account name</td><td className="font-semibold">{company.bankAccountName}</td></tr>}
                      {company.bankAccountNumber && <tr><td className="pr-3 text-slate-500">Account no.</td><td className="font-semibold font-mono">{company.bankAccountNumber}</td></tr>}
                      {company.iban && <tr><td className="pr-3 text-slate-500">IBAN</td><td className="font-semibold font-mono">{company.iban}</td></tr>}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-10 mt-10 text-[11px]">
            <div>
              <div className="h-14 border-b border-slate-400" />
              <div className="mt-1.5 font-semibold text-slate-900">For {company?.companyName || 'Morooj Nizwa International LLC'}</div>
              <div className="text-slate-500">Authorized signature &amp; company stamp</div>
            </div>
            <div>
              <div className="h-14 border-b border-slate-400" />
              <div className="mt-1.5 font-semibold text-slate-900">Customer acceptance</div>
              <div className="text-slate-500">Name, signature, stamp &amp; date</div>
            </div>
          </div>

          <div className="mt-8 pt-3 border-t border-slate-200 flex items-center justify-between gap-4">
            <div className="flex items-center gap-5 opacity-90">
              <img src="/brands/monipack-cropped.png" alt="monipack" className="h-6 object-contain" />
              <img src="/brands/moniclean-cropped.png" alt="moniclean" className="h-6 object-contain" />
              <img src="/brands/kohe-cropped.png" alt="KOHE" className="h-4 object-contain" />
              <img src="/brands/monifood-cropped.png" alt="monifood" className="h-6 object-contain" />
            </div>
            <div className="text-[9px] text-slate-400 text-right leading-tight">
              {company?.companyName || 'Morooj Nizwa International LLC'}{company?.crNumber ? ` · CR ${company.crNumber}` : ''}<br />
              Prices in Omani Rials (OMR). E&amp;OE.
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
