import React, { useState, useMemo, useEffect } from 'react';
import { 
  Headphones, 
  Phone, 
  MessageSquare, 
  Building2, 
  MapPin, 
  UserCheck, 
  Filter, 
  Search, 
  CheckCircle, 
  Clock, 
  ArrowRight, 
  FileText, 
  Sparkles,
  PhoneCall,
  SlidersHorizontal,
  ChevronRight,
  Plus,
  FileSpreadsheet,
  Edit2,
  Trash2,
  Share2,
  Printer,
  X
} from 'lucide-react';
import CustomerCareModal from '../components/CustomerCareModal';
import LeadImportModal from '../components/LeadImportModal';
import ShareModal from '../components/ShareModal';
import PrintLeadSlip from '../components/PrintLeadSlip';

export default function CustomerCare({
  leads,
  branches,
  categories,
  onUpdateLead,
  onOpenWhatsApp,
  onCreateQuoteFromLead,
  onNewLead,
  showToast,
  onNavigateToPipeline,
  onRefresh,
  token,
  onEditLead,
  onDeleteLead,
  canImport = true,
}) {
  const [search, setSearch] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [filterMode, setFilterMode] = useState('new'); // 'new' (awaiting intake), 'all', 'contacted'
  const [activeModalLead, setActiveModalLead] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [shareModalLead, setShareModalLead] = useState(null);
  const [printSlipLead, setPrintSlipLead] = useState(null);
  const [recentIntakeLead, setRecentIntakeLead] = useState(null);

  // Compute metrics
  const newLeadsCount = leads.filter((l) => l.status === 'new').length;
  const contactedCount = leads.filter((l) => l.status === 'contacted').length;
  const quoteCount = leads.filter((l) => l.status === 'quotation_sent').length;
  const wonCount = leads.filter((l) => l.status === 'won').length;

  // Filter leads for Customer Care queue
  const displayLeads = useMemo(() => {
    return leads.filter((l) => {
      // Filter mode
      if (filterMode === 'new' && l.status !== 'new') return false;
      if (filterMode === 'contacted' && l.status !== 'contacted') return false;

      // Search query
      if (search) {
        const q = search.toLowerCase();
        const match =
          (l.name && l.name.toLowerCase().includes(q)) ||
          (l.phone && l.phone.includes(q)) ||
          (l.mobile && l.mobile.includes(q)) ||
          (l.quantity && l.quantity.toLowerCase().includes(q)) ||
          (l.customerLocation && l.customerLocation.toLowerCase().includes(q)) ||
          (l.salesman && l.salesman.toLowerCase().includes(q)) ||
          (l.branch && l.branch.toLowerCase().includes(q)) ||
          (l.notes && l.notes.toLowerCase().includes(q));
        if (!match) return false;
      }

      // Branch
      if (selectedBranch !== 'all') {
        const bObj = branches.find((b) => (b.id && b.id === selectedBranch) || b.name === selectedBranch);
        if (bObj) {
          const matchBranch = (l.branchId && bObj.id && l.branchId === bObj.id) ||
            (l.branch === bObj.name && (!bObj.salesman || l.salesman === bObj.salesman));
          if (!matchBranch) return false;
        } else if (l.branch !== selectedBranch && l.branchId !== selectedBranch) {
          return false;
        }
      }

      // Category
      if (selectedCategory !== 'all' && l.category !== selectedCategory) {
        return false;
      }

      return true;
    });
  }, [leads, branches, filterMode, search, selectedBranch, selectedCategory]);

  const [visibleCount, setVisibleCount] = useState(24);

  // Reset pagination limit when filter changes
  useEffect(() => {
    setVisibleCount(24);
  }, [filterMode, search, selectedBranch, selectedCategory]);

  const visibleLeads = useMemo(() => {
    return displayLeads.slice(0, visibleCount);
  }, [displayLeads, visibleCount]);

  const handleTransferToPipeline = async (updatedData) => {
    try {
      await onUpdateLead(updatedData.id, updatedData);
      setActiveModalLead(null);
      setRecentIntakeLead(updatedData);
      showToast(`Lead "${updatedData.name || activeModalLead?.name}" assigned to ${updatedData.branch} (${updatedData.salesman}) & transferred to Pipeline!`);
    } catch (err) {
      console.error('Failed to transfer lead:', err);
      showToast('Error transferring lead.', 'error');
    }
  };

  const handleSaveAndShare = async (updatedData) => {
    try {
      await onUpdateLead(updatedData.id, updatedData);
      setActiveModalLead(null);
      setRecentIntakeLead(updatedData);
      setShareModalLead(updatedData);
      showToast(`Intake saved! Opening dispatch share sheet for ${updatedData.branch}...`);
    } catch (err) {
      console.error('Failed to save lead:', err);
      showToast('Error saving lead.', 'error');
    }
  };

  const handleSaveAndQuote = async (updatedData) => {
    try {
      await onUpdateLead(updatedData.id, updatedData);
      setActiveModalLead(null);
      setRecentIntakeLead(updatedData);
      if (onCreateQuoteFromLead) {
        onCreateQuoteFromLead(updatedData);
      }
      showToast(`Intake saved! Proceeding to quotation generator...`);
    } catch (err) {
      console.error('Failed to save lead:', err);
      showToast('Error saving lead.', 'error');
    }
  };

  const handleMarkNotConverted = async (lostData) => {
    try {
      await onUpdateLead(lostData.id, lostData);
      setActiveModalLead(null);
      showToast(`Lead "${activeModalLead?.name}" marked as Not Converted (${lostData.lostReason}).`);
    } catch (err) {
      console.error('Failed to mark lost:', err);
      showToast('Error updating lead status.', 'error');
    }
  };

  const handleDeleteLeadClick = (lead) => {
    if (window.confirm(`Are you sure you want to permanently delete lead "${lead.name}"? This action cannot be undone.`)) {
      if (onDeleteLead) {
        onDeleteLead(lead.id);
      }
    }
  };

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 max-w-7xl mx-auto pb-24 md:pb-8">
      {/* Top Banner: Step 1 & 2 Blueprint Guide */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-red-950 text-white rounded-3xl p-4 sm:p-6 border border-slate-700 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase bg-red-600 text-white shadow-xs">
                Inbound Command Center
              </span>
              <span className="text-xs text-slate-300 font-medium">Customer Care & Digital Marketing Desk</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Customer Intake & Commercial Handover
            </h2>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
              Step 1 & 2 Workflow: Dial incoming leads, capture specific product requirements, volume, and customer wilayat in Oman, then analyze and assign to the nearest <span className="font-monipack lowercase font-bold text-white">monipack</span> branch and sales rep.
            </p>
          </div>

          {/* Blueprint Steps Visualizer (hidden on mobile, visible sm:) */}
          <div className="hidden sm:flex items-center gap-3 bg-white/5 backdrop-blur-md p-3 rounded-xl border border-white/10 shrink-0">
            <div className="text-center px-3 py-1">
              <span className="text-[10px] font-extrabold uppercase text-sky-400 block">Step 1</span>
              <span className="text-xs font-bold text-white">Contact & Understand</span>
              <span className="text-[10px] text-slate-400 block">Inquiry & Quantity</span>
            </div>
            <ArrowRight className="w-4 h-4 text-red-400" />
            <div className="text-center px-3 py-1">
              <span className="text-[10px] font-extrabold uppercase text-emerald-400 block">Step 2</span>
              <span className="text-xs font-bold text-white">Analyze & Assign</span>
              <span className="text-[10px] text-slate-400 block">Branch & Salesman</span>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-500" />
            <div className="text-center px-3 py-1 opacity-70">
              <span className="text-[10px] font-extrabold uppercase text-amber-400 block">Step 3</span>
              <span className="text-xs font-bold text-slate-300">Quotation</span>
              <span className="text-[10px] text-slate-400 block">Sales Team</span>
            </div>
          </div>
        </div>

        {/* Counter KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 mt-4 sm:mt-6 pt-4 sm:pt-5 border-t border-white/10">
          <button
            onClick={() => setFilterMode('new')}
            className={`p-3 rounded-xl text-left transition ${
              filterMode === 'new'
                ? 'bg-red-600/30 border border-red-500/60 shadow-xs'
                : 'bg-white/5 hover:bg-white/10 border border-white/5'
            }`}
          >
            <span className="text-[10px] font-bold uppercase text-slate-400 block">
              Awaiting Call (New)
            </span>
            <span className="text-2xl font-black font-mono text-white mt-0.5 block">
              {newLeadsCount}
            </span>
          </button>

          <button
            onClick={() => setFilterMode('contacted')}
            className={`p-3 rounded-xl text-left transition ${
              filterMode === 'contacted'
                ? 'bg-emerald-600/30 border border-emerald-500/60 shadow-xs'
                : 'bg-white/5 hover:bg-white/10 border border-white/5'
            }`}
          >
            <span className="text-[10px] font-bold uppercase text-slate-400 block">
              Understood & Assigned
            </span>
            <span className="text-2xl font-black font-mono text-emerald-400 mt-0.5 block">
              {contactedCount}
            </span>
          </button>

          <div className="bg-white/5 p-3 rounded-xl border border-white/5">
            <span className="text-[10px] font-bold uppercase text-slate-400 block">
              Quotation Sent (Step 3)
            </span>
            <span className="text-2xl font-black font-mono text-amber-400 mt-0.5 block">
              {quoteCount}
            </span>
          </div>

          <div className="bg-white/5 p-3 rounded-xl border border-white/5">
            <span className="text-[10px] font-bold uppercase text-slate-400 block">
              Converted / Won (Step 5)
            </span>
            <span className="text-2xl font-black font-mono text-emerald-300 mt-0.5 block">
              {wonCount}
            </span>
          </div>
        </div>
      </div>

      {/* Toolbar: Filters & Actions */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.04)] flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search phone number, customer name, Wilayat..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </div>

          {/* Mode Pill Filter */}
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => setFilterMode('new')}
              className={`px-3 py-1.5 rounded-md transition ${
                filterMode === 'new'
                  ? 'bg-white text-red-600 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Call Queue ({newLeadsCount})
            </button>
            <button
              onClick={() => setFilterMode('contacted')}
              className={`px-3 py-1.5 rounded-md transition ${
                filterMode === 'contacted'
                  ? 'bg-white text-emerald-600 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Assigned ({contactedCount})
            </button>
            <button
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1.5 rounded-md transition ${
                filterMode === 'all'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Leads
            </button>
          </div>

          {/* Oman Branch filter */}
          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-red-500"
          >
            <option value="all">All Oman Branches & Reps</option>
            {branches.map((b) => (
              <option key={b.id || b.name} value={b.id || b.name}>
                {b.name}{b.city ? ` (${b.city})` : ''}{b.salesman ? ` — Rep: ${b.salesman}` : ''}
              </option>
            ))}
          </select>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-red-500"
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {canImport && (
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-2xs transition active:scale-95"
            title="Import marketing campaign leads into Step 1 queue"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Import Campaign Leads</span>
          </button>
          )}

          <button
            onClick={onNewLead}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-[#9E0A22] to-[#C8102E] hover:brightness-110 text-white text-xs font-bold rounded-full shadow-2xs transition active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Inbound Lead</span>
          </button>

          <button
            onClick={onNavigateToPipeline}
            className="flex items-center gap-1 px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
          >
            <span>View Full Pipeline</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Post-Intake Quick Action Banner */}
      {recentIntakeLead && (
        <div className="bg-emerald-50 border-2 border-emerald-500/40 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded">
                  Intake Complete
                </span>
                <h4 className="text-sm font-bold text-slate-900">
                  {recentIntakeLead.name} ({recentIntakeLead.phone || recentIntakeLead.mobile})
                </h4>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Assigned to <span className="font-bold text-slate-800">{recentIntakeLead.branch}</span> ({recentIntakeLead.salesman || 'Sales Team'}) • Wilayat: {recentIntakeLead.customerLocation || 'Not specified'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setShareModalLead(recentIntakeLead)}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs transition cursor-pointer"
              title="Share lead dossier to assigned salesman on WhatsApp"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>WhatsApp / Share with Salesman</span>
            </button>
            {onCreateQuoteFromLead && (
              <button
                type="button"
                onClick={() => onCreateQuoteFromLead(recentIntakeLead)}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg shadow-xs transition cursor-pointer"
                title="Create formal quotation for this inquiry"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Issue Monipack Quotation</span>
              </button>
            )}
            {onNavigateToPipeline && (
              <button
                type="button"
                onClick={onNavigateToPipeline}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs transition cursor-pointer"
                title="Navigate directly to Step 2 Pipeline"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span>View in Step 2 Pipeline</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setPrintSlipLead(recentIntakeLead)}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg shadow-xs transition cursor-pointer"
              title="Print official Monipack dispatch lead slip"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Slip</span>
            </button>
            <button
              type="button"
              onClick={() => setRecentIntakeLead(null)}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-lg transition cursor-pointer"
              title="Dismiss banner"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Leads Call Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibleLeads.map((lead) => {
          const fullPhone = lead.phone || (lead.mobile ? `${lead.countryCode || '+968'} ${lead.mobile}` : '');
          const isAwaitingCall = lead.status === 'new';

          return (
            <div
              key={lead.id}
              className={`bg-white rounded-3xl border p-5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between ${
                isAwaitingCall ? 'border-red-200 ring-1 ring-red-100' : 'border-slate-200'
              }`}
            >
              <div>
                {/* Status & Category Tag */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                  <span
                    className={`text-[9px] font-extrabold uppercase px-2.5 py-0.5 rounded-full whitespace-nowrap ${
                      isAwaitingCall
                        ? 'bg-red-100 text-red-800 border border-red-200 animate-pulse'
                        : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    }`}
                  >
                    {isAwaitingCall ? '● Needs Call & Intake' : '✓ Understood & Assigned'}
                  </span>
                  {isAwaitingCall && (() => {
                    const mins = Math.max(0, Math.round((Date.now() - new Date(lead.createdAt || lead.date || Date.now()).getTime()) / 60000));
                    const label = mins < 60 ? `${mins}m` : mins < 1440 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${Math.floor(mins / 1440)}d`;
                    return <span className={`mp-wait whitespace-nowrap ${mins >= 60 ? 'late' : 'ok'}`} title="Time since this enquiry came in. Calling within the first hour wins far more deals.">Waiting {label}</span>;
                  })()}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded whitespace-nowrap max-w-[110px] truncate">
                      {lead.category || 'General Inbound'}
                    </span>
                    <button
                      type="button"
                      onClick={() => onEditLead ? onEditLead(lead) : setActiveModalLead(lead)}
                      title="Edit Customer Details / Number"
                      className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    {onDeleteLead && (
                    <button
                      type="button"
                      onClick={() => handleDeleteLeadClick(lead)}
                      title="Delete Lead"
                      className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    )}
                  </div>
                </div>

                {/* Prominent Phone Number Display */}
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/80 mb-3 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                        Contact Number
                      </span>
                      <button
                        type="button"
                        onClick={() => onEditLead ? onEditLead(lead) : setActiveModalLead(lead)}
                        title="Edit Phone Number"
                        className="text-slate-400 hover:text-red-600 transition"
                      >
                        <Edit2 className="w-2.5 h-2.5" />
                      </button>
                    </div>
                    <span className="text-base font-black font-mono text-slate-900 tracking-wide">
                      {fullPhone || 'No Phone Number'}
                    </span>
                  </div>

                  {/* Immediate 1-Click Dial Buttons (Large mobile touch targets >= 44px) */}
                  <div className="flex items-center gap-2">
                    {fullPhone && (
                      <a
                        href={`tel:${fullPhone.replace(/\s+/g, '')}`}
                        title="Click to Call"
                        className="p-2.5 sm:p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition active:scale-95 cursor-pointer"
                      >
                        <Phone className="w-4 h-4" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => onOpenWhatsApp(lead)}
                      title="WhatsApp Chat"
                      className="p-2.5 sm:p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition active:scale-95 cursor-pointer"
                    >
                      <MessageSquare className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setShareModalLead(lead)}
                      title="Share Lead Briefing & A4 PDF with Salesman"
                      className="p-2.5 sm:p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-xs transition active:scale-95 cursor-pointer"
                    >
                      <Share2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Client Name */}
                <h3 className="text-sm font-black text-slate-900 leading-snug">
                  {lead.name}
                </h3>

                {/* Wilayat / Location */}
                <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  {(!lead.customerLocation || lead.customerLocation === 'Needs Intake') ? (
                    <span className="inline-flex items-center gap-1 text-amber-800 font-bold bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded text-[10px]">
                      📍 Wilayat: Needs Intake
                    </span>
                  ) : (
                    <span>Location: <strong className="text-slate-800">{lead.customerLocation}</strong></span>
                  )}
                </div>

                {/* Requirement / Quantity */}
                <div className="mt-2.5 p-2.5 bg-slate-50 rounded-lg border border-slate-100 text-xs text-slate-700 space-y-1">
                  {(!lead.quantity || lead.quantity === 'Needs Intake') ? (
                    <p className="text-[10px] font-bold text-blue-800 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded inline-block">
                      📦 Qty / Volume: Needs Intake
                    </p>
                  ) : (
                    <p className="font-semibold text-slate-800">
                      📦 Req: <span className="font-normal">{lead.quantity}</span>
                    </p>
                  )}
                  {lead.notes && lead.notes !== 'Imported inquiry. Awaiting call intake.' && (
                    <p className="text-[11px] text-slate-500 italic line-clamp-2">
                      "{lead.notes}"
                    </p>
                  )}
                </div>

                {/* Assigned Salesman if any */}
                {lead.salesman && (
                  <div className="mt-2.5 flex items-center gap-1.5 text-xs text-emerald-800 bg-emerald-50 px-2 py-1 rounded border border-emerald-100">
                    <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Assigned Salesman: <strong>{lead.salesman}</strong> ({lead.branch})</span>
                  </div>
                )}
              </div>

              {/* Card Footer: Call & Intake Action */}
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  onClick={() => setActiveModalLead(lead)}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-slate-900 hover:bg-red-600 text-white text-xs font-bold rounded-lg transition active:scale-98 shadow-2xs group"
                >
                  <Headphones className="w-3.5 h-3.5 text-red-400 group-hover:text-white transition-colors" />
                  <span>{isAwaitingCall ? 'Call & Complete Intake' : 'Understand & Assign'}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-white transition-colors" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination controls for high-volume leads */}
      {displayLeads.length > visibleCount && (
        <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.04)] flex flex-wrap items-center justify-between gap-3 mt-4">
          <p className="text-xs text-slate-500 font-medium">
            Showing <strong className="text-slate-900 font-mono">{visibleLeads.length}</strong> of{' '}
            <strong className="text-slate-900 font-mono">{displayLeads.length}</strong> inbound leads.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setVisibleCount((prev) => prev + 24)}
              className="px-4 py-2 bg-slate-900 hover:bg-[#CC1A22] text-white text-xs font-bold rounded-lg shadow-2xs transition active:scale-95 cursor-pointer"
            >
              Load More (+24 Leads)
            </button>
            <button
              type="button"
              onClick={() => setVisibleCount(displayLeads.length)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition cursor-pointer"
            >
              Show All ({displayLeads.length})
            </button>
          </div>
        </div>
      )}

      {displayLeads.length === 0 && (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
            <CheckCircle className="w-6 h-6 text-emerald-600" />
          </div>
          <h3 className="text-base font-bold text-slate-900">
            All Inbound Leads Contacted!
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            There are currently no new uncontacted leads matching your filter. Switch filter to "All Leads" or view the Commercial Pipeline.
          </p>
          <button
            onClick={() => setFilterMode('all')}
            className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-lg hover:bg-slate-800 transition"
          >
            Show All Leads
          </button>
        </div>
      )}

      {/* Customer Care Intake Modal */}
      {activeModalLead && (
        <CustomerCareModal
          isOpen={Boolean(activeModalLead)}
          onClose={() => setActiveModalLead(null)}
          lead={activeModalLead}
          branches={branches}
          categories={categories}
          onTransferToPipeline={handleTransferToPipeline}
          onMarkNotConverted={handleMarkNotConverted}
          onOpenWhatsApp={onOpenWhatsApp}
          onDeleteLead={onDeleteLead}
          onShareLead={(l) => setShareModalLead(l)}
          onSaveAndShare={handleSaveAndShare}
          onSaveAndQuote={handleSaveAndQuote}
        />
      )}

      {/* Campaign Leads Bulk Import Modal */}
      <LeadImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        token={token}
        showToast={showToast}
        onImportSuccess={() => {
          if (onRefresh) onRefresh();
        }}
      />

      {/* Universal Share Lead Modal */}
      {shareModalLead && (
        <ShareModal
          isOpen={Boolean(shareModalLead)}
          onClose={() => setShareModalLead(null)}
          lead={shareModalLead}
          branches={branches}
          onOpenPrintSlip={(leadToPrint) => setPrintSlipLead(leadToPrint)}
          showToast={showToast}
        />
      )}

      {/* Printable A4 Lead Inquiry & Regional Dispatch Slip */}
      {printSlipLead && (
        <PrintLeadSlip
          lead={printSlipLead}
          branches={branches}
          onClose={() => setPrintSlipLead(null)}
        />
      )}
    </div>
  );
}
