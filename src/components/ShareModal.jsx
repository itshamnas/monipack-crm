import React, { useState, useEffect } from 'react';
import { 
  X, 
  Share2, 
  Send, 
  Printer, 
  Copy, 
  Check, 
  UserCheck, 
  Building2, 
  Phone, 
  MapPin, 
  Sparkles, 
  FileText, 
  Smartphone,
  ExternalLink
} from 'lucide-react';

export default function ShareModal({
  isOpen,
  onClose,
  lead,
  branches = [],
  onOpenPrintSlip,
  onLogActivity,
  showToast
}) {
  // Recipient modes: 'salesman' | 'branch' | 'customer' | 'custom'
  const [recipientType, setRecipientType] = useState('salesman');
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [customName, setCustomName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [activeTemplate, setActiveTemplate] = useState('salesman');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);

  // Initialize selected branch ID when lead or branches change
  useEffect(() => {
    if (lead && branches.length > 0) {
      const matched = branches.find((b) => lead.branchId && b.id === lead.branchId) ||
        branches.find((b) => b.name === lead.branch && b.salesman === lead.salesman) ||
        branches.find((b) => b.name === lead.branch) ||
        branches[0];
      if (matched) {
        setSelectedBranchId(matched.id);
      }
    }
  }, [lead?.id, lead?.branchId, lead?.branch, lead?.salesman, branches]);

  // Determine recipient details based on recipient mode
  useEffect(() => {
    if (!lead) return;
    const defaultBranchObj = (branches && branches.length > 0)
      ? (branches.find((b) => lead.branchId && b.id === lead.branchId) ||
         branches.find((b) => b.name === lead.branch && b.salesman === lead.salesman) ||
         branches.find((b) => b.name === lead.branch) ||
         branches[0])
      : null;
    const currentAssignedSalesman = lead.salesman || defaultBranchObj?.salesman || 'Shamnas Acheerakath';

    if (recipientType === 'salesman') {
      const bObj = branches.find((b) => lead.branchId && b.id === lead.branchId) ||
        branches.find((b) => b.salesman?.toLowerCase() === lead.salesman?.toLowerCase()) ||
        defaultBranchObj;
      const cleanPhone = bObj?.phone ? bObj.phone.replace(/[^\d+]/g, '') : '+96879062219';
      setRecipientPhone(cleanPhone);
      setRecipientName(currentAssignedSalesman);
    } else if (recipientType === 'branch') {
      const bObj = branches.find((b) => b.id === selectedBranchId) ||
        branches.find((b) => b.name === selectedBranchId) ||
        branches[0];
      const cleanPhone = bObj?.phone ? bObj.phone.replace(/[^\d+]/g, '') : '+96879062219';
      setRecipientPhone(cleanPhone);
      setRecipientName(bObj?.salesman || `${bObj?.name || 'Branch'} Hub`);
    } else if (recipientType === 'customer') {
      const custPhone = lead.phone || (lead.mobile ? `${lead.countryCode || '+968'}${lead.mobile}` : '');
      setRecipientPhone(custPhone ? custPhone.replace(/[^\d+]/g, '') : '');
      setRecipientName(lead.name || 'Valued Customer');
    } else if (recipientType === 'custom') {
      setRecipientName(customName || 'Sales Colleague');
    }
  }, [recipientType, selectedBranchId, lead, branches, customName]);

  // Build message templates with sanitized 'Needs Intake' placeholders
  useEffect(() => {
    if (!lead) return;

    const dealVal = Number(lead.dealValue || 0);
    const dealValFormatted = dealVal > 0
      ? dealVal.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
      : '0.000';

    const clientFullPhone = lead.phone || (lead.mobile ? `${lead.countryCode || '+968'} ${lead.mobile}` : 'Not Specified');
    const leadReq = (lead.quantity && !lead.quantity.includes('Needs Intake'))
      ? lead.quantity
      : ((lead.notes && !lead.notes.includes('Needs Intake')) ? lead.notes : 'Packaging Supplies');
    const leadLocation = (lead.customerLocation && !lead.customerLocation.includes('Needs Intake'))
      ? lead.customerLocation
      : (lead.branch || 'Muscat, Oman');
    const cleanCategory = (!lead.category || lead.category.includes('Needs Intake'))
      ? 'Packaging Products'
      : lead.category;
    const cleanNotes = (!lead.notes || lead.notes.includes('Needs Intake'))
      ? 'Inbound inquiry received via campaign.'
      : lead.notes;

    const templateSalesmanDispatch = 
`🔔 *NEW LEAD ASSIGNMENT — MONIPACK CRM*
━━━━━━━━━━━━━━━━━━━━━━━━━
🏢 *Client:* ${lead.name || 'Valued Customer'}
📱 *Contact:* ${clientFullPhone}
📍 *Wilayat:* ${leadLocation}
📦 *Requirement:* ${leadReq}
🏷️ *Category:* ${cleanCategory}
💰 *Est. Budget:* OMR ${dealValFormatted}
👤 *Assigned Rep:* ${recipientName} (${lead.branch || 'Ghala'})
📝 *Intake Notes:* ${cleanNotes}
━━━━━━━━━━━━━━━━━━━━━━━━━
🏢 *Morooj Nizwa International LLC (Sultanate of Oman)*
🌐 Track live: https://crm.monipack.com`;

    const templateCustomerAck = 
`مرحباً بك ${lead.name || 'العزيز'}،
نشكركم على تواصلكم مع شركة مروج نزوى العالمية (موني باك) في سلطنة عمان.
تم تحويل استفساركم بخصوص *${cleanCategory}* (${leadReq}) إلى مندوب المبيعات المسؤول في منطقتكم:
👤 *${recipientName}*
سيتواصل معكم قريباً لتزويدكم بعينات تجريبية وعروض الأسعار المناسبة.

Thank you for choosing Monipack Packaging.
Customer Care: +968 79062219 | www.monipack.com`;

    const templateQuickBrief = 
`📦 *Lead Handover:* ${lead.name || 'Lead'} | ${clientFullPhone} | ${leadLocation} | Needs: ${leadReq} | Est: OMR ${dealValFormatted} | Assigned: ${recipientName}`;

    if (activeTemplate === 'salesman') {
      setMessage(templateSalesmanDispatch);
    } else if (activeTemplate === 'customer') {
      setMessage(templateCustomerAck);
    } else {
      setMessage(templateQuickBrief);
    }
  }, [activeTemplate, recipientName, lead]);

  if (!isOpen || !lead) return null;

  const defaultBranchObj = (branches && branches.length > 0)
    ? (branches.find((b) => lead.branchId && b.id === lead.branchId) ||
       branches.find((b) => b.name === lead.branch && b.salesman === lead.salesman) ||
       branches.find((b) => b.name === lead.branch) ||
       branches[0])
    : null;
  const currentAssignedSalesman = lead.salesman || defaultBranchObj?.salesman || 'Shamnas Acheerakath';

  const dealVal = Number(lead.dealValue || 0);
  const dealValFormatted = dealVal > 0
    ? dealVal.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
    : '0.000';

  const clientMobileDigits = (lead.mobile || '').replace(/\D/g, '').replace(/^968/, '');
  const clientFullPhone = lead.phone || (clientMobileDigits ? `+968 ${clientMobileDigits}` : 'Not Specified');
  const leadReq = (lead.quantity && !lead.quantity.includes('Needs Intake'))
    ? lead.quantity
    : ((lead.notes && !lead.notes.includes('Needs Intake')) ? lead.notes : 'Packaging Supplies');
  const leadLocation = (lead.customerLocation && !lead.customerLocation.includes('Needs Intake'))
    ? lead.customerLocation
    : (lead.branch || 'Muscat, Oman');

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      if (showToast) showToast('Dispatch brief copied to clipboard! ✓');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      alert('Brief copied to clipboard.');
    }
  };

  let cleanTargetPhone = (recipientPhone || '').replace(/\D/g, '');
  while (cleanTargetPhone.startsWith('968') && cleanTargetPhone.length > 8) {
    cleanTargetPhone = cleanTargetPhone.slice(3);
  }
  if (cleanTargetPhone.startsWith('0') && cleanTargetPhone.length === 9) {
    cleanTargetPhone = cleanTargetPhone.slice(1);
  }
  const finalPhone = cleanTargetPhone.length === 8 ? `968${cleanTargetPhone}` : cleanTargetPhone;

  const handleSendWhatsApp = (target = 'web') => {
    if (!finalPhone) {
      alert('Please enter a valid mobile number for the recipient.');
      return;
    }

    const encoded = encodeURIComponent(message);
    const url = target === 'app'
      ? `https://api.whatsapp.com/send?phone=${finalPhone}&text=${encoded}`
      : `https://web.whatsapp.com/send?phone=${finalPhone}&text=${encoded}`;

    window.open(url, '_blank', 'noopener,noreferrer');

    if (onLogActivity) {
      onLogActivity(lead.id, {
        type: 'whatsapp',
        description: `Dispatched lead summary to ${recipientName} (${finalPhone}) via WhatsApp.`,
      });
    }

    onClose();
  };

  // Mobile Web Share API support
  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Monipack Lead: ${lead.name}`,
          text: message,
          url: 'https://crm.monipack.com',
        });
        if (showToast) showToast('Shared successfully!');
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Share error:', err);
        }
      }
    } else {
      handleCopyText();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-950 via-slate-900 to-red-950 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-600/30 border border-red-500/40 flex items-center justify-center text-red-400">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold tracking-tight">Share Lead & Dispatch Dossier</h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/10 text-slate-300 border border-white/10 font-bold">
                  #{lead.id}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Send inquiry briefing & A4 PDF slip to assigned salesman, branch, or client
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {/* Quick Lead Snapshot Banner */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Client / Inquirer</span>
              <span className="font-black text-slate-900 text-sm capitalize">{lead.name}</span>
              <span className="text-slate-500 font-mono text-[11px] block">{clientFullPhone}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Territory</span>
              <span className="font-bold text-slate-800 flex items-center gap-1">
                <MapPin className="w-3 h-3 text-[#CC1A22]" />
                {leadLocation}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Volume & Value</span>
              <span className="font-bold text-slate-800">{leadReq}</span>
              <span className="font-mono font-black text-red-700 block text-xs">OMR {dealValFormatted}</span>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Assigned Sales Rep</span>
              <span className="inline-flex items-center gap-1 text-emerald-800 font-black bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                <UserCheck className="w-3 h-3 text-emerald-600" />
                {currentAssignedSalesman}
              </span>
            </div>
          </div>

          {/* Recipient Selection Bar ("Whomever I Want") */}
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-2 uppercase tracking-wider">
              1. Choose Recipient (إرسال إلى)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setRecipientType('salesman')}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                  recipientType === 'salesman'
                    ? 'border-[#CC1A22] bg-red-50 text-red-900 font-bold shadow-xs'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs">
                  <UserCheck className="w-3.5 h-3.5 text-[#CC1A22]" />
                  <span className="truncate">Assigned Rep</span>
                </div>
                <div className="text-[10px] text-slate-500 truncate mt-0.5 font-medium">{currentAssignedSalesman}</div>
              </button>

              <button
                type="button"
                onClick={() => setRecipientType('branch')}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                  recipientType === 'branch'
                    ? 'border-[#CC1A22] bg-red-50 text-red-900 font-bold shadow-xs'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs">
                  <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                  <span className="truncate">Branch Hubs</span>
                </div>
                <div className="text-[10px] text-slate-500 truncate mt-0.5 font-medium">10 Oman Hubs</div>
              </button>

              <button
                type="button"
                onClick={() => setRecipientType('customer')}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                  recipientType === 'customer'
                    ? 'border-[#CC1A22] bg-red-50 text-red-900 font-bold shadow-xs'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs">
                  <Phone className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="truncate">Customer</span>
                </div>
                <div className="text-[10px] text-slate-500 truncate mt-0.5 font-medium">Inquiry Acknowledgment</div>
              </button>

              <button
                type="button"
                onClick={() => setRecipientType('custom')}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                  recipientType === 'custom'
                    ? 'border-[#CC1A22] bg-red-50 text-red-900 font-bold shadow-xs'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs">
                  <Smartphone className="w-3.5 h-3.5 text-amber-600" />
                  <span className="truncate">Custom Number</span>
                </div>
                <div className="text-[10px] text-slate-500 truncate mt-0.5 font-medium">Enter Any Mobile</div>
              </button>
            </div>
          </div>

          {/* Sub-selectors depending on recipient type */}
          {recipientType === 'branch' && (
            <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-100 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-bold text-indigo-950">Select Oman Fulfillment Branch:</span>
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="bg-white border border-indigo-200 rounded-lg px-3 py-1.5 font-bold text-slate-800 text-xs focus:outline-none cursor-pointer"
              >
                {branches.map((b) => (
                  <option key={b.id || `${b.name}-${b.salesman}`} value={b.id}>
                    {b.name}{b.city ? ` (${b.city})` : ''} — Rep: {b.salesman || 'Sales Team'}
                  </option>
                ))}
              </select>
            </div>
          )}

          {recipientType === 'custom' && (
            <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-700 mb-1">Colleague / Recipient Name</label>
                <input
                  type="text"
                  placeholder="e.g. Salim Manager"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="w-full bg-white border border-amber-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-700 mb-1">Mobile Number (Oman +968)</label>
                <input
                  type="text"
                  placeholder="e.g. 97023051 or +968 97023051"
                  value={recipientPhone}
                  onChange={(e) => setRecipientPhone(e.target.value)}
                  className="w-full bg-white border border-amber-300 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-slate-800"
                />
              </div>
            </div>
          )}

          {/* Target Phone Indicator */}
          <div className="flex items-center justify-between px-3 py-2 bg-slate-100 rounded-lg text-xs">
            <span className="text-slate-600 font-medium">
              Recipient: <strong className="text-slate-900">{recipientName}</strong>
            </span>
            <span className="font-mono font-bold text-slate-800">
              Target Phone: {recipientPhone || 'No Phone Number Set'}
            </span>
          </div>

          {/* Template Chooser & Message Preview */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                2. Message Content & Dispatch Preview
              </label>
              <div className="flex items-center gap-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setActiveTemplate('salesman')}
                  className={`px-2 py-0.5 rounded font-bold transition cursor-pointer ${
                    activeTemplate === 'salesman' ? 'bg-red-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Sales Dispatch
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTemplate('customer')}
                  className={`px-2 py-0.5 rounded font-bold transition cursor-pointer ${
                    activeTemplate === 'customer' ? 'bg-red-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Customer Ack
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTemplate('quick')}
                  className={`px-2 py-0.5 rounded font-bold transition cursor-pointer ${
                    activeTemplate === 'quick' ? 'bg-red-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Brief
                </button>
              </div>
            </div>

            <textarea
              rows={6}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg p-3 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition leading-relaxed"
            />
          </div>

          {/* Professional PDF Lead Slip Banner Card */}
          <div className="bg-gradient-to-r from-red-50 via-slate-50 to-blue-50 p-4 rounded-xl border border-red-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-red-100 border border-red-300 flex items-center justify-center text-red-700 shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-tight flex items-center gap-1.5">
                  <span>Official A4 Lead Inquiry & Dispatch Slip (PDF)</span>
                  <span className="text-[9px] bg-red-600 text-white px-1.5 py-0.2 rounded font-mono">A4 Ready</span>
                </h4>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Generate verified corporate A4 slip with MNI logo, customer specs, branch routing, and SLA checklist.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                onClose();
                if (onOpenPrintSlip) onOpenPrintSlip(lead);
              }}
              className="flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg shadow-sm transition active:scale-95 cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5 text-red-400" />
              <span>Generate & Print A4 PDF</span>
            </button>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyText}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg border transition cursor-pointer ${
                copied
                  ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied Brief! ✓' : 'Copy Text'}</span>
            </button>

            {navigator.share && (
              <button
                type="button"
                onClick={handleNativeShare}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                title="Share via device OS share sheet"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Device Share</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={() => handleSendWhatsApp('web')}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition active:scale-95 cursor-pointer"
              title="Opens WhatsApp Web (Desktop)"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send WhatsApp Web</span>
            </button>

            <button
              type="button"
              onClick={() => handleSendWhatsApp('app')}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold rounded-lg shadow-sm transition active:scale-95 cursor-pointer"
              title="Opens WhatsApp App directly"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>WhatsApp App</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
