import React, { useState, useEffect } from 'react';
import { X, Send, MessageSquare, Check, Sparkles, Copy } from 'lucide-react';

const buildTemplates = (lead) => {
  const name = lead?.name || 'there';
  const arName = lead?.name || 'العزيز';
  const cleanCat = (!lead?.category || lead.category.includes('Needs Intake')) 
    ? 'Packaging & Disposable products' 
    : lead.category;
  const cleanCatAr = (!lead?.category || lead.category.includes('Needs Intake')) 
    ? 'التغليف والمواد الاستهلاكية' 
    : lead.category;
  const cleanQty = (!lead?.quantity || lead.quantity.includes('Needs Intake')) 
    ? '' 
    : lead.quantity;
  const productMention = cleanQty || cleanCat || 'packaging supplies';

  return [
    {
      id: 'horeca_en',
      title: 'HORECA Expo Follow-up (EN)',
      text: `Hello ${name},\n\nThank you for visiting Monipack (Morooj Nizwa International LLC) at HORECA Oman 2026!\n\nRegarding your interest in our ${cleanCat}, we would be delighted to assist you with wholesale pricing, free samples, and fast delivery across Oman.\n\nPlease let us know your required quantities or if you'd like our updated catalog.\n\nBest regards,\nMonipack Sales Team\nTel: +968 79062219 | www.monipack.com`,
    },
    {
      id: 'horeca_ar',
      title: 'متابعة معرض هوريكا (عربي)',
      text: `مرحباً بك ${arName}،\n\nنشكركم على زيارة جناح شركة مروج نزوى العالمية (موني باك) في معرض هوريكا عُمان 2026!\n\nبخصوص اهتمامكم بمنتجات ${cleanCatAr}، يسعدنا تزويدكم بعروض الأسعار الخاصة بالكميات والتوصيل لكافة فروعكم في السلطنة.\n\nهل تودون استلام عينات تجريبية أو كاتالوج المنتجات الكامل؟\n\nتحياتنا،\nفريق مبيعات موني باك\nهاتف: 79062219 | www.monipack.com`,
    },
    {
      id: 'quote_intro',
      title: 'Quotation Follow-up (EN)',
      text: `Dear ${name},\n\nFollowing our discussion regarding ${productMention}, we have prepared your official Monipack quotation.\n\nOur team is ready to schedule delivery or provide samples upon your confirmation.\n\nBest regards,\nMonipack Sales Team\nMorooj Nizwa International LLC`,
    },
    {
      id: 'sample_dispatch',
      title: 'Sample Ready / Dispatch (EN)',
      text: `Hello ${name},\n\nYour requested samples from Monipack are ready for pickup or dispatch to your location.\n\nPlease confirm your preferred delivery address and contact person.\n\nThank you,\nMonipack Logistics Team`,
    },
  ];
};

export default function WhatsAppModal({ isOpen, onClose, lead, onLogActivity }) {
  const [selectedTemplate, setSelectedTemplate] = useState('horeca_en');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);

  // Sync templates and message unconditionally above any return
  useEffect(() => {
    if (lead && isOpen) {
      const templates = buildTemplates(lead);
      const activeTpl = templates.find((t) => t.id === selectedTemplate) || templates[0];
      setMessage(activeTpl.text);
    }
  }, [lead?.id, lead?.name, lead?.category, lead?.quantity, lead?.notes, isOpen, selectedTemplate]);

  if (!isOpen || !lead) return null;

  const templates = buildTemplates(lead);

  const phoneRaw = lead.mobile || lead.phone || '';
  let cleanPhone = phoneRaw.replace(/\D/g, '');
  while (cleanPhone.startsWith('968') && cleanPhone.length > 8) {
    cleanPhone = cleanPhone.slice(3);
  }
  // Ensure starts with 968 for Oman if 8 digits
  const fullPhone = cleanPhone.length === 8 ? `968${cleanPhone}` : cleanPhone;

  const handleSelectTemplate = (tpl) => {
    setSelectedTemplate(tpl.id);
    setMessage(tpl.text);
  };

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      alert('Message copied to clipboard.');
    }
  };

  const handleSend = (target = 'web') => {
    if (!fullPhone) {
      alert('This lead does not have a valid mobile number.');
      return;
    }

    // In Oman/GCC, wa.me is blocked/reset by ISPs (ERR_CONNECTION_RESET).
    // Use web.whatsapp.com for desktop and api.whatsapp.com for mobile app.
    const encodedText = encodeURIComponent(message);
    const url = target === 'app'
      ? `https://api.whatsapp.com/send?phone=${fullPhone}&text=${encodedText}`
      : `https://web.whatsapp.com/send?phone=${fullPhone}&text=${encodedText}`;

    window.open(url, '_blank', 'noopener,noreferrer');

    if (onLogActivity) {
      onLogActivity(lead.id, {
        type: 'whatsapp',
        description: `Sent WhatsApp message: "${message.slice(0, 60)}..."`,
      });
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 mp-overlay bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 bg-emerald-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-emerald-800 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-emerald-200" />
            </div>
            <div>
              <h3 className="text-base font-bold">WhatsApp Direct Message</h3>
              <p className="text-xs text-emerald-100">
                To: {lead.name} (+{fullPhone || 'No Phone'})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-emerald-200 hover:text-white hover:bg-emerald-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              Quick Templates
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {templates.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => handleSelectTemplate(tpl)}
                  className={`text-left text-xs p-2.5 rounded-xl border transition cursor-pointer ${
                    selectedTemplate === tpl.id
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-bold shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-slate-50'
                  }`}
                >
                  <p className="truncate font-semibold">{tpl.title}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Message Content
            </label>
            <textarea
              rows="7"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg p-3 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition leading-relaxed"
            />
          </div>

          <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleCopyMessage}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition cursor-pointer ${
                copied
                  ? 'bg-emerald-50 border-emerald-500 text-emerald-700 font-bold'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy Text'}</span>
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSend('web')}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm shadow-emerald-900/30 transition active:scale-95 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Open WhatsApp Web</span>
              </button>
              <button
                type="button"
                onClick={() => handleSend('app')}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-emerald-800 hover:bg-emerald-900 text-white rounded-lg shadow-sm transition active:scale-95 cursor-pointer"
                title="Opens WhatsApp Mobile / Desktop App gateway"
              >
                <span>WhatsApp App</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
