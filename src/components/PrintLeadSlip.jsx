import React, { useEffect, useState } from 'react';
import { getCompany } from '../utils/pdfReport.js';
import { createPortal } from 'react-dom';
import { Printer, X, MapPin, Phone, Building2, UserCheck, Calendar, Clock, CheckCircle2, ShieldCheck, ArrowRight } from 'lucide-react';

/**
 * monipack Enterprise CRM - Executive Lead Inquiry & Regional Dispatch Slip Print Engine
 * Morooj Nizwa International LLC (Sultanate of Oman)
 * 
 * Features:
 * - Rendered in React Portal to document.body for 100% leak-proof printing (hides #root in print)
 * - Zero application bleed: headers and CRM buttons never leak into the printed document
 * - Clean pure-white A4 portrait sizing with 12mm/15mm page margins
 * - Repeating thead on every page and row break-inside protection
 * - Official corporate layout: MNI letterhead, client specs, assigned salesman, SLA checklist, stamp box, 4-brand footer
 */
export default function PrintLeadSlip({ lead, branches = [], onClose }) {
  const [company, setCompany] = useState(null);
  useEffect(() => { getCompany().then(setCompany); }, []);
  // Close on Escape key - must be called unconditionally above any early return
  useEffect(() => {
    if (!lead) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lead, onClose]);

  if (!lead) return null;

  const handlePrint = () => {
    setTimeout(() => {
      window.print();
    }, 100);
  };

  const branchObj = (branches && branches.length > 0)
    ? (branches.find((b) => lead.branchId && b.id === lead.branchId) ||
       branches.find((b) => b.name === lead.branch && b.salesman === lead.salesman) ||
       branches.find((b) => b.name === lead.branch) ||
       null)
    : null;
  const branchPhone = branchObj?.phone || '+968 79062219';
  const assignedSalesman = lead.salesman || branchObj?.salesman || 'Shamnas Acheerakath';

  const cleanMobileDigits = (lead.mobile || '').replace(/\D/g, '').replace(/^968/, '');
  const fullPhone = lead.phone || (cleanMobileDigits ? `+968 ${cleanMobileDigits}` : 'Not Specified');
  const dateFormatted = lead.date
    ? new Date(lead.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeFormatted = lead.date
    ? new Date(lead.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const dealVal = Number(lead.dealValue || 0);
  const dealValFormatted = dealVal > 0
    ? dealVal.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
    : '0.000';

  const cleanLocation = (lead.customerLocation && !lead.customerLocation.includes('Needs Intake'))
    ? lead.customerLocation
    : (lead.branch || 'Muscat, Oman');
  const cleanCategory = (!lead.category || lead.category.includes('Needs Intake'))
    ? 'Packaging Products'
    : lead.category;
  const cleanQuantity = (lead.quantity && !lead.quantity.includes('Needs Intake'))
    ? lead.quantity
    : ((lead.notes && !lead.notes.includes('Needs Intake')) ? lead.notes : 'Inquiry details to be confirmed on call.');
  const cleanNotes = (!lead.notes || lead.notes.includes('Needs Intake'))
    ? 'Customer contacted via marketing campaign. Awaiting initial field sales consultation.'
    : lead.notes;

  return createPortal(
    <div 
      className="lead-slip-modal-overlay fixed inset-0 z-50 mp-overlay bg-slate-950 sm:bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-start overflow-y-auto p-2 sm:p-4 md:p-6 pb-20 sm:pb-8"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
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
          .lead-slip-modal-overlay {
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
          .lead-slip-sheet {
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

          .print\\:break-inside-avoid {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          img {
            max-width: 100% !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>

      {/* Floating Action Bar */}
      <div className="sticky top-0 left-0 right-0 z-50 w-full bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-3 py-2 sm:px-4 sm:py-2.5 flex items-center justify-between shadow-xl sm:fixed sm:top-4 sm:right-4 sm:w-auto sm:rounded-xl sm:border sm:border-slate-700 sm:shadow-2xl sm:border-b-0 no-print shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold text-red-400 bg-red-950/60 border border-red-800 px-2.5 py-1 rounded">
            {lead.id}
          </span>
          <span className="text-xs text-slate-300 font-semibold hidden md:inline">
            Official Lead Dispatch Slip (A4)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 sm:py-2 bg-[#CC1A22] hover:bg-red-700 text-white text-xs font-bold rounded-lg shadow-md transition cursor-pointer active:scale-95"
            title="Print or Save as PDF"
          >
            <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Print / Save as PDF</span>
          </button>
          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
            title="Close Preview (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* The Printable A4 Sheet */}
      <div 
        className="lead-slip-sheet shrink-0 bg-white w-full max-w-[850px] min-h-fit h-auto p-4 sm:p-8 md:p-10 pb-8 sm:pb-10 rounded-xl shadow-2xl border border-slate-200 text-slate-900 relative my-2 sm:my-8 print:my-0 print:p-0 print:border-none print:shadow-none print:max-w-none print:min-h-0 print:w-full print:rounded-none"
        onClick={(e) => e.stopPropagation()}
      >
        <img className="mp-sheet-wm" src="/brands/watermark.png" alt="" aria-hidden="true" />
        {/* ==========================================================================
            Header: 3D Ribbon Logo + Ghala Address (Left) & SLIP TITLE + Ref (Right)
            ========================================================================== */}
        <div className="flex items-start justify-between mb-5 pb-3 border-b-2 border-slate-900">
          <div className="flex items-center gap-3.5">
            <div className="w-24 sm:w-28 shrink-0">
              <img
                src="/brands/monipack-cropped.png"
                alt="monipack"
                className="w-full h-auto object-contain block drop-shadow-xs"
              />
            </div>
            <div className="text-slate-800 text-xs leading-tight">
              <div className="font-extrabold text-slate-950 text-sm">{company?.companyName || 'Morooj Nizwa International LLC'}</div>
              <div className="text-[11px] font-arabic font-bold text-slate-700">{company?.companyNameAr || 'شركة مروج نزوى العالمية ش.م.م'}</div>
              <div className="text-[11px] text-slate-600 mt-0.5">{company?.headquarters || 'Ghala Industrial Area, Muscat, Sultanate of Oman'}{company?.poBox ? ` · ${company.poBox}` : ''}</div>
              <div className="text-[10px] font-mono text-slate-500">{[company?.phone || '+968 79062219', company?.email || 'info@monipack.com'].join(' | ')}</div>
              {(company?.crNumber || company?.vatNumber) && (
                <div className="text-[10px] font-semibold text-slate-600">{[company.crNumber && `CR No. ${company.crNumber}`, company.vatNumber && `VATIN ${company.vatNumber}`].filter(Boolean).join(' · ')}</div>
              )}
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className="inline-block bg-[#CC1A22] text-white text-[10px] font-black uppercase px-2.5 py-0.5 rounded tracking-wider mb-1">
              Commercial Sales Dossier
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 uppercase">
              LEAD INQUIRY SLIP
            </h1>
            <div className="text-xs font-bold text-slate-700 font-arabic mt-0.5">
              بطاقة إحالة واستفسار عميل
            </div>
            <div className="text-xs font-mono font-bold text-red-700 mt-1">
              REF: #{lead.id}
            </div>
          </div>
        </div>

        {/* ==========================================================================
            Metadata Bar (Date, Wilayat, Assigned Rep, Status)
            ========================================================================== */}
        <div className="grid grid-cols-4 gap-2 bg-slate-100 p-2.5 rounded-lg border border-slate-200 text-xs mb-5">
          <div>
            <span className="text-[9px] uppercase font-bold text-slate-500 block">Inquiry Date & Time</span>
            <span className="font-bold text-slate-900 font-mono text-[11px]">{dateFormatted} • {timeFormatted}</span>
          </div>
          <div>
            <span className="text-[9px] uppercase font-bold text-slate-500 block">Fulfillment Branch</span>
            <span className="font-bold text-slate-900">{lead.branch || 'Ghala HQ'}</span>
          </div>
          <div>
            <span className="text-[9px] uppercase font-bold text-slate-500 block">Assigned Sales Rep</span>
            <span className="font-black text-emerald-800 bg-emerald-50 px-1 rounded">{assignedSalesman}</span>
          </div>
          <div>
            <span className="text-[9px] uppercase font-bold text-slate-500 block">Pipeline Stage</span>
            <span className="font-black uppercase text-[10px] text-blue-700">{lead.status || 'Active'}</span>
          </div>
        </div>

        {/* ==========================================================================
            Dual Section Grid: Customer Profile (Left) & Requirement Details (Right)
            ========================================================================== */}
        <div className="grid grid-cols-2 gap-4 mb-5 text-xs">
          {/* Customer Profile Box */}
          <div className="border border-slate-300 rounded-lg p-3.5 bg-white space-y-2">
            <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
              <span className="font-black uppercase tracking-wider text-slate-900 text-[11px] flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-[#CC1A22]" />
                Customer Profile (معلومات العميل)
              </span>
              <span className="text-[9px] font-bold text-slate-400 font-mono">CLIENT</span>
            </div>

            <div className="space-y-1.5 pt-0.5">
              <div>
                <span className="text-[10px] text-slate-500 block font-semibold">Company / Client Name:</span>
                <span className="text-sm font-black text-slate-950 capitalize">{lead.name || 'Valued Customer'}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <span className="text-[10px] text-slate-500 block font-semibold">Direct Phone / Mobile:</span>
                  <span className="font-mono font-black text-xs text-slate-900">{fullPhone}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block font-semibold">Delivery Wilayat:</span>
                  <span className="font-bold text-slate-900">{cleanLocation}</span>
                </div>
              </div>

              {lead.email && (
                <div className="pt-0.5">
                  <span className="text-[10px] text-slate-500 block font-semibold">Email Address:</span>
                  <span className="font-mono text-[11px] text-slate-800">{lead.email}</span>
                </div>
              )}
            </div>
          </div>

          {/* Commercial Requirement Box */}
          <div className="border border-slate-300 rounded-lg p-3.5 bg-white space-y-2">
            <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
              <span className="font-black uppercase tracking-wider text-slate-900 text-[11px] flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Inquiry Requirements (الطلب والكمية)
              </span>
              <span className="text-[9px] font-bold text-slate-400 font-mono">SPECS</span>
            </div>

            <div className="space-y-1.5 pt-0.5">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-slate-500 block font-semibold">Product Category:</span>
                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
                    {cleanCategory}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block font-semibold">Estimated Budget:</span>
                  <span className="font-mono font-black text-sm text-[#CC1A22]">OMR {dealValFormatted}</span>
                </div>
              </div>

              <div className="pt-1">
                <span className="text-[10px] text-slate-500 block font-semibold">Requested Volume / Quantity:</span>
                <div className="p-2 bg-slate-50 rounded border border-slate-200 font-semibold text-slate-900 text-xs mt-0.5">
                  {cleanQuantity}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ==========================================================================
            Intake Discussion Log & Call Notes
            ========================================================================== */}
        <div className="border border-slate-300 rounded-lg p-3.5 bg-slate-50/70 mb-5 text-xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-1 mb-2">
            <span className="font-black uppercase tracking-wider text-slate-900 text-[11px]">
              Customer Care Intake Notes & Discussion History
            </span>
            <span className="text-[10px] text-slate-500 italic">Call Verification Record</span>
          </div>
          <p className="whitespace-pre-wrap font-sans text-slate-700 leading-relaxed text-[11px]">
            {cleanNotes}
          </p>
        </div>

        {/* ==========================================================================
            Sales Action SLA Protocol (Checklist for the Sales Rep)
            ========================================================================== */}
        <div className="border-2 border-dashed border-slate-300 rounded-lg p-3 mb-6 bg-white text-xs">
          <div className="font-black uppercase tracking-wider text-slate-900 text-[11px] mb-2 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[#CC1A22]" />
            <span>Sales Representative SLA Protocol (خطة عمل مندوب المبيعات)</span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-[11px]">
            <div className="flex items-start gap-2 bg-slate-50 p-2 rounded border border-slate-200">
              <span className="w-4 h-4 rounded-full bg-slate-200 font-bold text-center text-[10px] shrink-0">1</span>
              <div>
                <strong className="block text-slate-900">Call Within 2 Hours</strong>
                <span className="text-slate-500 text-[10px]">Contact client to introduce Monipack and confirm volume.</span>
              </div>
            </div>
            <div className="flex items-start gap-2 bg-slate-50 p-2 rounded border border-slate-200">
              <span className="w-4 h-4 rounded-full bg-slate-200 font-bold text-center text-[10px] shrink-0">2</span>
              <div>
                <strong className="block text-slate-900">Provide Sample & Catalog</strong>
                <span className="text-slate-500 text-[10px]">Deliver sample pack to client premises or office.</span>
              </div>
            </div>
            <div className="flex items-start gap-2 bg-slate-50 p-2 rounded border border-slate-200">
              <span className="w-4 h-4 rounded-full bg-slate-200 font-bold text-center text-[10px] shrink-0">3</span>
              <div>
                <strong className="block text-slate-900">Issue Quotation (5% VAT)</strong>
                <span className="text-slate-500 text-[10px]">Generate official A4 proposal in CRM.monipack.com.</span>
              </div>
            </div>
          </div>
        </div>

        {/* ==========================================================================
            Signatures & Authorization Box
            ========================================================================== */}
        <div className="print:break-inside-avoid grid grid-cols-3 gap-6 mb-5 pt-3 border-t border-slate-300 text-xs">
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-500 mb-10">
              Customer Care Intake Coordinator:
            </div>
            <div className="border-b border-slate-400"></div>
            <div className="text-[10px] text-slate-600 mt-1 font-medium">Signature & Date</div>
          </div>

          <div>
            <div className="text-[10px] uppercase font-bold text-slate-500 mb-10">
              Assigned Regional Representative:
            </div>
            <div className="border-b border-slate-400"></div>
            <div className="text-[10px] text-slate-600 mt-1 font-medium">{assignedSalesman} ({lead.branch || 'Ghala'})</div>
          </div>

          <div className="text-center">
            <div className="text-[10px] uppercase font-bold text-slate-500 mb-2">
              Official Branch Verification Stamp:
            </div>
            <div className="border-2 border-slate-300 rounded-lg h-16 flex items-center justify-center text-slate-400 text-[10px] italic">
              [ Official Stamp ]
            </div>
          </div>
        </div>

        {/* ==========================================================================
            4-Brand Footer Strip
            ========================================================================== */}
        <div className="print:break-inside-avoid border-t border-slate-300 pt-3">
          <div className="grid grid-cols-4 gap-2 items-center justify-items-center sm:flex sm:items-center sm:justify-between px-2 py-1">
            <div className="flex items-center justify-center h-7 w-24">
              <img src="/brands/monipack-cropped.png" alt="monipack" className="max-h-6 max-w-full object-contain" />
            </div>
            <div className="flex items-center justify-center h-7 w-24">
              <img src="/brands/moniclean-cropped.png" alt="moniclean" className="max-h-6 max-w-full object-contain" />
            </div>
            <div className="flex items-center justify-center h-7 w-24">
              <img src="/brands/kohe-cropped.png" alt="KOHE" className="max-h-5 max-w-full object-contain" />
            </div>
            <div className="flex items-center justify-center h-7 w-24">
              <img src="/brands/monifood-cropped.png" alt="monifood" className="max-h-5 max-w-full object-contain" />
            </div>
          </div>

          <div className="text-center text-[9px] text-slate-500 font-medium mt-1">
            Commercial Distribution division of Morooj Nizwa International LLC • Sultanate of Oman • Generated by monipack CRM
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
