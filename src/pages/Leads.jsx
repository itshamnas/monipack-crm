import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Users, 
  Kanban, 
  Table as TableIcon, 
  Plus, 
  Download, 
  Phone, 
  Mail, 
  MessageSquare, 
  FileText, 
  MoreVertical, 
  ChevronRight, 
  Tag, 
  MapPin, 
  DollarSign, 
  Calendar, 
  Edit2, 
  Trash2, 
  Filter,
  CheckCircle,
  Clock,
  Sparkles,
  Lock,
  Headphones,
  UserCheck,
  ArrowRight,
  ChevronDown,
  FileSpreadsheet,
  Share2,
  Printer
} from 'lucide-react';
import { openPrintable, chipsHtml, tableHtml } from '../utils/pdfReport.js';
import CustomerCareModal from '../components/CustomerCareModal';
import LeadImportModal from '../components/LeadImportModal';
import ShareModal from '../components/ShareModal';
import PrintLeadSlip from '../components/PrintLeadSlip';
import { getApiUrl } from '../api/config.js';

const STAGES = [
  { id: 'new', label: 'STEP 1: Qualification & Intake', sublabel: 'Customer Care Call Queue', color: 'border-t-2 border-blue-500 bg-blue-50/20' },
  { id: 'contacted', label: 'STEP 2: Analyze & Assign', sublabel: 'Assigned to Oman Branch & Sales', color: 'border-t-2 border-indigo-500 bg-indigo-50/20' },
  { id: 'quotation_sent', label: 'STEP 3: Quotation Follow-Up', sublabel: 'monipack OMR Quote Sent', color: 'border-t-2 border-amber-500 bg-amber-50/20' },
  { id: 'sample_sent', label: 'STEP 4: Sample & Negotiation', sublabel: 'Negotiation & Samples', color: 'border-t-2 border-purple-500 bg-purple-50/20' },
  { id: 'won', label: 'STEP 5: Converted (Won)', sublabel: 'Sales Confirmed', color: 'border-t-2 border-emerald-500 bg-emerald-50/20' },
  { id: 'lost', label: 'STEP 6: Lost / Closed', sublabel: 'Lost with Reason', color: 'border-t-2 border-rose-500 bg-rose-50/20' },
];

const CATEGORIES = [
  'All Categories',
  'Packaging Products',
  'Disposable Products',
  'Kohe Products',
  'Cleaning Products',
  'Food Products',
  'Other / Custom Wholesale Requirement',
];

export default function Leads({
  leads,
  searchQuery,
  setSearchQuery,
  selectedCategory,
  setSelectedCategory,
  selectedBranch,
  setSelectedBranch,
  branches,
  categories: propCategories,
  pipelineStages: propStages,
  currentUser,
  token,
  onNewLead,
  onEditLead,
  onUpdateLead,
  onDeleteLead,
  canImport = true,
  onUpdateStatus,
  onOpenWhatsApp,
  onCreateQuoteFromLead,
  onRefresh,
  showToast,
}) {
  const [viewMode, setViewMode] = useState('kanban'); // 'kanban' or 'table'
  const [selectedStage, setSelectedStage] = useState('all');
  const [intakeModalLead, setIntakeModalLead] = useState(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [stageLimits, setStageLimits] = useState({});
  const [tableLimit, setTableLimit] = useState(100);
  const [shareModalLead, setShareModalLead] = useState(null);
  const [printSlipLead, setPrintSlipLead] = useState(null);

  // Drag and Drop & Card Action Menu state
  const [draggedLeadId, setDraggedLeadId] = useState(null);
  const [dragOverStageId, setDragOverStageId] = useState(null);
  const [menuAnchor, setMenuAnchor] = useState(null); // { lead, top, bottom, right }
  const activeMenuLeadId = menuAnchor?.lead?.id || null;

  useEffect(() => {
    if (!menuAnchor) return;
    const closeMenu = () => setMenuAnchor(null);
    window.addEventListener('click', closeMenu);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
    };
  }, [menuAnchor]);

  const handleToggleMenu = (e, lead) => {
    e.stopPropagation();
    if (menuAnchor && menuAnchor.lead.id === lead.id) {
      setMenuAnchor(null);
    } else {
      const rect = e.currentTarget.getBoundingClientRect();
      const menuEstimatedHeight = 350;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpwards = spaceBelow < menuEstimatedHeight && rect.top > menuEstimatedHeight;

      setMenuAnchor({
        lead,
        top: openUpwards ? undefined : rect.bottom + 6,
        bottom: openUpwards ? window.innerHeight - rect.top + 6 : undefined,
        right: Math.max(16, window.innerWidth - rect.right),
      });
    }
  };

  const activeCategories = propCategories && propCategories.length > 0 ? ['All Categories', ...propCategories] : CATEGORIES;
  const activeStages = propStages && propStages.length > 0 ? propStages : STAGES;

  // Mobile Focus Mode states
  const [mobileFocusStage, setMobileFocusStage] = useState('new');
  const [mobileViewStyle, setMobileViewStyle] = useState('focus'); // 'focus' or 'columns'

  const getNextStage = (currentStatus) => {
    const currentIndex = activeStages.findIndex((s) => s.id === currentStatus);
    if (currentIndex >= 0 && currentIndex < activeStages.length - 1) {
      return activeStages[currentIndex + 1];
    }
    return null;
  };

  // Filter leads
  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      // Search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const match =
          (l.name && l.name.toLowerCase().includes(q)) ||
          (l.phone && l.phone.includes(q)) ||
          (l.mobile && l.mobile.includes(q)) ||
          (l.email && l.email.toLowerCase().includes(q)) ||
          (l.notes && l.notes.toLowerCase().includes(q)) ||
          (l.quantity && l.quantity.toLowerCase().includes(q)) ||
          (l.customerLocation && l.customerLocation.toLowerCase().includes(q)) ||
          (l.salesman && l.salesman.toLowerCase().includes(q)) ||
          (l.branch && l.branch.toLowerCase().includes(q));
        if (!match) return false;
      }

      // Category
      if (selectedCategory && selectedCategory !== 'All Categories' && selectedCategory !== 'all') {
        if (l.category !== selectedCategory) return false;
      }

      // Branch
      if (selectedBranch && selectedBranch !== 'all' && selectedBranch !== 'All Oman Branches') {
        const bObj = branches?.find((b) => (b.id && b.id === selectedBranch) || b.name === selectedBranch);
        if (bObj) {
          const matchBranch = (l.branchId && bObj.id && l.branchId === bObj.id) ||
            (l.branch === bObj.name && (!bObj.salesman || l.salesman === bObj.salesman));
          if (!matchBranch) return false;
        } else if (l.branch !== selectedBranch && l.branchId !== selectedBranch) {
          return false;
        }
      }

      // Stage (if filtered in table mode)
      if (selectedStage !== 'all' && selectedStage !== 'All Stages') {
        if (l.status !== selectedStage) return false;
      }

      return true;
    });
  }, [leads, branches, searchQuery, selectedCategory, selectedBranch, selectedStage]);

  // Export to CSV - Authenticated via Backend Export Endpoint
  const handleExportCSV = async (scope = 'filtered') => {
    if (!currentUser?.canExport) {
      alert('Export Restricted: Only Administrator account has permission to export confidential customer leads.');
      return;
    }

    try {
      const catParam = selectedCategory && selectedCategory !== 'All Categories' && selectedCategory !== 'all' ? selectedCategory : '';
      const branchParam = selectedBranch && selectedBranch !== 'all' && selectedBranch !== 'All Oman Branches' ? selectedBranch : '';
      const stageParam = selectedStage && selectedStage !== 'all' && selectedStage !== 'All Stages' ? selectedStage : '';
      const searchParam = searchQuery ? searchQuery.trim() : '';

      const queryUrl = scope === 'all'
        ? '/api/leads/export?scope=all'
        : `/api/leads/export?category=${encodeURIComponent(catParam)}&branch=${encodeURIComponent(branchParam)}&status=${encodeURIComponent(stageParam)}&search=${encodeURIComponent(searchParam)}`;

      const res = await fetch(getApiUrl(queryUrl), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Export failed: Access Denied');
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const fileTag = scope === 'all' ? 'all_records' : (branchParam ? branchParam.replace(/\s+/g, '_') : 'filtered');
      link.setAttribute('download', `monipack_leads_${fileTag}_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Export error:', e);
      alert('Failed to export leads.');
    }
  };

  const renderLeadCard = (lead, isMobileFocus = false) => {
    const nextStage = getNextStage(lead.status);

    return (
      <div
        key={lead.id}
        draggable={!isMobileFocus}
        onDragStart={(e) => {
          if (isMobileFocus) return;
          e.dataTransfer.setData('text/plain', lead.id);
          e.dataTransfer.effectAllowed = 'move';
          setDraggedLeadId(lead.id);
        }}
        onDragEnd={() => {
          setDraggedLeadId(null);
          setDragOverStageId(null);
        }}
        className={`bg-white rounded-xl p-3.5 border border-slate-200 shadow-2xs hover:shadow-md transition-all group relative ${
          isMobileFocus ? 'w-full' : 'cursor-grab active:cursor-grabbing'
        } ${draggedLeadId === lead.id ? 'opacity-40 scale-95 ring-2 ring-[#CC1A22]' : ''} ${
          activeMenuLeadId === lead.id ? 'z-30' : 'z-10'
        }`}
      >
        {/* 3-Dot Action Menu Trigger (Absolute Top-3 Right-3) */}
        <div className="absolute top-3 right-3">
          <button
            type="button"
            onClick={(e) => handleToggleMenu(e, lead)}
            title="Lead Actions"
            className={`p-1 rounded-md transition cursor-pointer ${
              activeMenuLeadId === lead.id
                ? 'text-[#CC1A22] bg-red-50 ring-1 ring-red-200'
                : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
            }`}
          >
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>

        {/* Category & Branch Tag (with pr-7 to prevent overlap with 3-dot trigger) */}
        <div className="flex items-center justify-between gap-1 mb-2 pr-7">
          <span
            className={`max-w-[150px] truncate text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
              lead.category?.includes('Packaging')
                ? 'bg-red-50 text-red-700 border border-red-200'
                : lead.category?.includes('Disposable')
                ? 'bg-orange-50 text-orange-700 border border-orange-200'
                : lead.category?.includes('Kohe')
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-blue-50 text-blue-700 border border-blue-200'
            }`}
            title={lead.category}
          >
            {lead.category || 'Packaging'}
          </span>
          <div className="flex items-center gap-1 text-[10px] text-slate-500 font-medium shrink-0">
            <span className="flex items-center gap-0.5">
              <MapPin className="w-2.5 h-2.5 text-slate-400" />
              {lead.branch || 'Ghala'}
            </span>
            {lead.customerLocation && (
              <span className="text-slate-400 font-normal truncate max-w-[100px]" title={`Wilayat: ${lead.customerLocation}`}>
                • {lead.customerLocation}
              </span>
            )}
          </div>
        </div>

        {/* Client Name with capitalize typography normalization */}
        <h4 className="text-xs sm:text-sm font-black text-slate-900 leading-snug group-hover:text-[#CC1A22] transition-colors capitalize pr-6">
          {lead.name}
        </h4>

        {/* Phone / Mobile */}
        {lead.phone && (
          <div className="flex items-center gap-1.5 mt-1.5">
            <Phone className="w-3 h-3 text-[#CC1A22] shrink-0" />
            <a
              href={`tel:${lead.phone.replace(/\s+/g, '')}`}
              onClick={(e) => e.stopPropagation()}
              className="text-[11px] font-mono font-bold text-slate-800 hover:text-[#CC1A22] hover:underline"
            >
              {lead.phone}
            </a>
          </div>
        )}

        {/* Phone, WhatsApp, and Share Standalone Circular Quick-Action Icon Buttons */}
        <div className="flex items-center gap-2 mt-2">
          {(lead.phone || lead.mobile) && (
            <a
              href={`tel:${(lead.phone || `${lead.countryCode || '+968'}${lead.mobile}`).replace(/\s+/g, '')}`}
              onClick={(e) => e.stopPropagation()}
              title="Call Contact"
              className="w-8 h-8 rounded-full flex items-center justify-center border border-slate-200 hover:bg-slate-50 text-blue-600 transition active:scale-95 shadow-2xs"
            >
              <Phone className="w-3.5 h-3.5" />
            </a>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenWhatsApp(lead);
            }}
            title="WhatsApp Message"
            className="w-8 h-8 rounded-full flex items-center justify-center border border-slate-200 hover:bg-slate-50 text-emerald-600 transition active:scale-95 shadow-2xs cursor-pointer"
          >
            <MessageSquare className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShareModalLead(lead);
            }}
            title="Share Lead & PDF Slip (Salesman / WhatsApp / Print)"
            className="w-8 h-8 rounded-full flex items-center justify-center border border-slate-200 hover:bg-red-50 text-[#CC1A22] hover:border-red-200 transition active:scale-95 shadow-2xs cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {lead.salesman && (
          <div className="mt-2 flex items-center gap-1 text-[10px] text-emerald-800 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
            <UserCheck className="w-3 h-3 text-emerald-600 shrink-0" />
            <span className="truncate">Sales: {lead.salesman}</span>
          </div>
        )}

        {lead.status === 'lost' && lead.lostReason && (
          <div className="mt-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
            Reason: {lead.lostReason}
          </div>
        )}

        {(lead.status === 'new' || lead.quantity === 'Needs Intake' || lead.notes?.includes('Needs Intake')) && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIntakeModalLead(lead);
            }}
            className="w-full mt-2 py-1 px-2 bg-red-50 hover:bg-red-100 text-[#CC1A22] text-[10px] font-bold rounded flex items-center justify-center gap-1 border border-red-200 transition cursor-pointer"
          >
            <Headphones className="w-3 h-3 text-[#CC1A22]" />
            <span>Customer Intake & Assignment</span>
          </button>
        )}

        {/* Quantity / Inquiry Details */}
        {(lead.quantity || lead.notes) && (
          <p className="text-[11px] text-slate-600 mt-2 bg-slate-50 p-2 rounded border border-slate-100 italic line-clamp-2">
            "{lead.quantity || lead.notes}"
          </p>
        )}

        {/* Deal Value Block: horizontal flex container */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold whitespace-nowrap">
            Est. Value
          </span>
          <span className="whitespace-nowrap font-mono font-bold text-sm text-slate-900">
            OMR {(() => {
              const val = Number(lead.dealValue);
              return (!isNaN(val) && val > 0)
                ? val.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
                : '0.000';
            })()}
          </span>
        </div>

        {/* 1-Tap Stage Advancement Button on Mobile Focus View */}
        {isMobileFocus && nextStage && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onUpdateStatus(lead.id, nextStage.id);
                if (showToast) showToast(`Moved to ${nextStage.label}`);
              }}
              className="flex-1 py-2 px-3 bg-red-50 hover:bg-red-100 text-[#CC1A22] rounded-xl text-xs font-black flex items-center justify-center gap-1.5 border border-red-200 active:scale-95 transition cursor-pointer"
            >
              <span>➡️ Advance to {nextStage.label.replace(/^STEP \d+:\s*/, '')}</span>
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 max-w-7xl mx-auto pb-24 md:pb-8">
      {/* Header bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Commercial Sales Pipeline</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-200">
              {filteredLeads.length} Leads
            </span>
            {selectedBranch && selectedBranch !== 'all' && selectedBranch !== 'All Oman Branches' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">
                <MapPin className="w-3 h-3 text-[#CC1A22]" />
                {selectedBranch}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Comprehensive stage tracking: from initial qualification to deal conversion and delivery.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start md:self-auto flex-wrap">
          {/* View switcher: clean [Kanban Pipeline] | [Table View] */}
          <div className="flex bg-slate-200/80 p-0.5 rounded-lg border border-slate-300/80">
            <button
              onClick={() => setViewMode('kanban')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
                viewMode === 'kanban'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Kanban className="w-3.5 h-3.5" />
              <span>Kanban Pipeline</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>Table View</span>
            </button>
          </div>

          {/* Export CSV button - Restricted to Administrator */}
          {currentUser?.canExport ? (
            <div className="relative">
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 shadow-2xs transition active:scale-95 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span className="hidden sm:inline">Export</span>
                <ChevronDown className="w-3 h-3 text-slate-400 ml-0.5" />
              </button>

              {showExportMenu && (
                <div className="absolute right-0 mt-1 w-64 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95">
                  <div className="px-3 py-1.5 border-b border-slate-100 text-[10px] uppercase font-bold text-slate-400">
                    Export Options (Excel / Sheets)
                  </div>
                  <button
                    onClick={() => {
                      setShowExportMenu(false);
                      handleExportCSV('filtered');
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 text-xs flex items-center justify-between text-slate-700 transition cursor-pointer"
                  >
                    <div>
                      <span className="font-bold block text-slate-900">Current Filtered View</span>
                      <span className="text-[10px] text-slate-400 block">Export active list ({filteredLeads.length} leads)</span>
                    </div>
                    <span className="font-mono text-xs font-bold bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                      {filteredLeads.length}
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      setShowExportMenu(false);
                      handleExportCSV('all');
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 text-xs flex items-center justify-between text-slate-700 border-t border-slate-50 transition cursor-pointer"
                  >
                    <div>
                      <span className="font-bold block text-slate-900">
                        All <span className="font-monipack lowercase font-bold">monipack</span> Records
                      </span>
                      <span className="text-[10px] text-slate-400 block">Full database ({leads.length} records)</span>
                    </div>
                    <span className="font-mono text-xs font-bold bg-red-50 text-red-700 px-1.5 py-0.5 rounded">
                      {leads.length}
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      setShowExportMenu(false);
                      const stageName = (id) => (activeStages.find((st) => st.id === id)?.label || id).replace(/^STEP \d+:\s*/, '');
                      const open = filteredLeads.filter((l) => !['won', 'lost'].includes(l.status));
                      const ok = openPrintable({
                        title: 'Leads',
                        subtitle: [selectedCategory, selectedBranch, searchQuery && `Search “${searchQuery}”`].filter((x) => x && !/^All/.test(x)).join(' · ') || 'All leads',
                        bodyHtml: chipsHtml([
                          ['Leads', filteredLeads.length],
                          ['Open', open.length],
                          ['Open pipeline (OMR)', open.reduce((t, l) => t + Number(l.dealValue || 0), 0).toFixed(3)],
                          ['Won (OMR)', filteredLeads.filter((l) => l.status === 'won').reduce((t, l) => t + Number(l.dealValue || 0), 0).toFixed(3)],
                        ]) + tableHtml(
                          [{ label: 'Date' }, { label: 'Customer' }, { label: 'Mobile' }, { label: 'Product' }, { label: 'Quantity' }, { label: 'Salesman' }, { label: 'Stage' }, { label: 'OMR', num: true }],
                          filteredLeads.map((l) => [new Date(l.date).toLocaleDateString(), l.name, l.mobile ? `${l.countryCode || ''} ${l.mobile}` : l.phone, l.category,
                            /Needs Intake/.test(l.quantity || '') ? '' : l.quantity, l.salesman, stageName(l.status), l.dealValue ? Number(l.dealValue).toFixed(3) : ''])
                        ),
                      });
                      if (!ok && showToast) showToast('Allow pop-ups to download the PDF', 'error');
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 text-xs flex items-center justify-between text-slate-700 border-t border-slate-100 transition cursor-pointer"
                  >
                    <div>
                      <span className="font-bold block text-slate-900">PDF report (current view)</span>
                      <span className="text-[10px] text-slate-400 block">Printable list with totals</span>
                    </div>
                    <span className="font-mono text-xs font-bold bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">PDF</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div
              title="Confidential data export is restricted to Administrator role only."
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-400 text-xs font-medium rounded-lg border border-slate-200 cursor-not-allowed select-none"
            >
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden sm:inline">Export Restricted</span>
            </div>
          )}

          {/* Import Leads button */}
          {canImport && (
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs transition active:scale-95 cursor-pointer"
            title="Bulk import leads from CSV/Excel template"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Import Leads (CSV)</span>
          </button>
          )}

          {/* Single Consolidated Primary Action: + New Lead (bg-[#CC1A22]) */}
          <button
            onClick={onNewLead}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#CC1A22] hover:bg-[#b0161d] text-white text-xs font-bold rounded-lg shadow-sm shadow-red-950/20 transition active:scale-95 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ New Lead</span>
          </button>
        </div>
      </div>

      {/* Filter Bar (Synchronized with Sidebar Active Branch; redundant dropdown removed) */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
          <Filter className="w-4 h-4 text-[#CC1A22]" />
          <span>Filters:</span>
        </div>

        {/* Category filter */}
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-red-500 font-medium cursor-pointer"
        >
          {activeCategories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        {/* Stage Filter (for table view) */}
        {viewMode === 'table' && (
          <select
            value={selectedStage}
            onChange={(e) => setSelectedStage(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:bg-white focus:outline-none focus:ring-1 focus:ring-red-500 font-medium cursor-pointer"
          >
            <option value="all">All Stages</option>
            {activeStages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        )}

        {/* Synchronized Branch State Indicator (from Left Sidebar) */}
        {selectedBranch && selectedBranch !== 'all' && selectedBranch !== 'All Oman Branches' && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700">
            <MapPin className="w-3 h-3 text-[#CC1A22]" />
            <span>Region: <strong className="text-slate-900">{selectedBranch}</strong></span>
            <button
              onClick={() => setSelectedBranch('all')}
              className="ml-1 text-slate-400 hover:text-red-600 font-bold text-xs cursor-pointer"
              title="Clear branch filter (show all Oman branches)"
            >
              ✕
            </button>
          </div>
        )}

        {/* Active Filters Reset */}
        {(searchQuery || (selectedCategory && selectedCategory !== 'All Categories') || (selectedBranch && selectedBranch !== 'all' && selectedBranch !== 'All Oman Branches') || selectedStage !== 'all') && (
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('All Categories');
              setSelectedBranch('all');
              setSelectedStage('all');
            }}
            className="text-xs text-[#CC1A22] hover:text-red-700 font-bold ml-auto cursor-pointer"
          >
            Reset Filters
          </button>
        )}
      </div>

      {/* KANBAN PIPELINE VIEW */}
      {viewMode === 'kanban' && (() => {
        const focusedStageObj = activeStages.find((s) => s.id === mobileFocusStage) || activeStages[0];
        const focusedLeads = filteredLeads.filter((l) => l.status === focusedStageObj.id);
        const focusedTotalOMR = focusedLeads.reduce((acc, curr) => {
          const val = Number(curr.dealValue);
          return acc + (isNaN(val) ? 0 : val);
        }, 0);
        const focusedLimit = stageLimits[focusedStageObj.id] || 35;
        const visibleFocusedLeads = focusedLeads.slice(0, focusedLimit);

        return (
          <div className="space-y-4">
            {/* Mobile Stage Carousel Bar (< lg only) */}
            <div className="lg:hidden space-y-2.5">
              {/* View Switcher on Mobile: [📱 Single Stage Focus] | [➡️ All Columns] */}
              <div className="flex items-center justify-between text-xs px-1">
                <span className="font-bold text-slate-700">Mobile Funnel View:</span>
                <div className="flex bg-slate-200/80 p-0.5 rounded-lg border border-slate-300">
                  <button
                    type="button"
                    onClick={() => setMobileViewStyle('focus')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
                      mobileViewStyle === 'focus' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                    }`}
                  >
                    📱 Stage Focus
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileViewStyle('columns')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
                      mobileViewStyle === 'columns' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                    }`}
                  >
                    ➡️ All Columns
                  </button>
                </div>
              </div>

              {/* Horizontal Scrolling Stage Carousel Pills */}
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 -mx-3 px-3 sm:-mx-6 sm:px-6">
                {activeStages.map((stage) => {
                  const stageLeads = filteredLeads.filter((l) => l.status === stage.id);
                  const isSelected = mobileFocusStage === stage.id;
                  return (
                    <button
                      key={stage.id}
                      type="button"
                      onClick={() => {
                        setMobileFocusStage(stage.id);
                        setMobileViewStyle('focus');
                      }}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all shadow-xs cursor-pointer ${
                        isSelected
                          ? 'bg-[#CC1A22] text-white shadow-red-950/20'
                          : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <span>{stage.label}</span>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full font-black ${
                          isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {stageLeads.length}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Active Stage Header & Summary Card for Mobile Focus */}
              {mobileViewStyle === 'focus' && (
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                      {focusedStageObj.label}
                    </h3>
                    <p className="text-[11px] text-slate-500 font-medium">
                      {focusedStageObj.sublabel || 'Current Sales Stage'}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-black px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-mono">
                      {focusedLeads.length} Leads
                    </span>
                    <p className="font-mono text-xs font-bold text-slate-800 mt-0.5">
                      OMR {focusedTotalOMR.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Mobile Focus Stage Vertical Feed */}
            {mobileViewStyle === 'focus' && (
              <div className="lg:hidden space-y-3">
                {visibleFocusedLeads.length > 0 ? (
                  visibleFocusedLeads.map((lead) => renderLeadCard(lead, true))
                ) : (
                  <div className="bg-white rounded-xl p-8 text-center text-xs text-slate-400 font-medium border border-slate-200">
                    No leads in this stage
                  </div>
                )}

                {focusedLeads.length > focusedLimit && (
                  <div className="pt-2 pb-1">
                    <button
                      type="button"
                      onClick={() => setStageLimits((prev) => ({ ...prev, [focusedStageObj.id]: (prev[focusedStageObj.id] || 35) + 30 }))}
                      className="w-full py-2.5 px-3 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 rounded-xl border border-slate-200 transition cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
                    >
                      <span>Show More (+30 / {focusedLeads.length - focusedLimit} remaining)</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Multi-Column Board (Desktop & Tablets, or Mobile when toggled to 'columns') */}
            <div
              className={`${
                mobileViewStyle === 'focus' ? 'hidden lg:flex' : 'flex'
              } gap-4 overflow-x-auto pb-6 items-start scrollbar-thin scroll-smooth min-h-[750px]`}
            >
              {activeStages.map((stage) => {
                const stageLeads = filteredLeads.filter((l) => l.status === stage.id);
                const stageTotalOMR = stageLeads.reduce((acc, curr) => {
                  const val = Number(curr.dealValue);
                  return acc + (isNaN(val) ? 0 : val);
                }, 0);
                const stageLimit = stageLimits[stage.id] || 35;
                const visibleStageLeads = stageLeads.slice(0, stageLimit);

                return (
                  <div
                    key={stage.id}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (dragOverStageId !== stage.id) setDragOverStageId(stage.id);
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget)) {
                        if (dragOverStageId === stage.id) setDragOverStageId(null);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverStageId(null);
                      const leadId = e.dataTransfer.getData('text/plain') || draggedLeadId;
                      if (leadId) {
                        onUpdateStatus(leadId, stage.id);
                      }
                      setDraggedLeadId(null);
                    }}
                    className={`w-[320px] min-w-[290px] shrink-0 rounded-xl p-3.5 border flex flex-col max-h-[820px] transition-all ${
                      stage.color || 'border-t-2 border-slate-300 bg-slate-50/30'
                    } ${
                      dragOverStageId === stage.id
                        ? 'ring-2 ring-[#CC1A22] bg-red-50/40 shadow-md'
                        : 'border-slate-200/90'
                    }`}
                  >
                    {/* Stage Header */}
                    <div className="pb-3 mb-3 border-b border-slate-200">
                      <div className="flex items-center justify-between gap-1">
                        <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                          {stage.label}
                        </h3>
                        <span className="text-xs font-black px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-mono shrink-0">
                          {stageLeads.length}
                        </span>
                      </div>
                      <p className="font-mono text-xs font-semibold text-slate-700 mt-1">
                        OMR {stageTotalOMR.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                      </p>
                    </div>

                    {/* Cards Container */}
                    <div className="space-y-3 overflow-y-auto pr-1 flex-1">
                      {visibleStageLeads.length > 0 ? (
                        visibleStageLeads.map((lead) => renderLeadCard(lead, false))
                      ) : (
                        <div className="text-center py-8 text-xs text-slate-400 font-medium">
                          No leads in this stage
                        </div>
                      )}

                      {stageLeads.length > stageLimit && (
                        <div className="pt-2 pb-1">
                          <button
                            type="button"
                            onClick={() => setStageLimits((prev) => ({ ...prev, [stage.id]: (prev[stage.id] || 35) + 30 }))}
                            className="w-full py-2 px-3 text-[11px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 hover:text-slate-900 rounded-lg border border-slate-200 transition cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
                          >
                            <span>Show More (+30 / {stageLeads.length - stageLimit} remaining)</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* TABLE LIST VIEW */}
      {viewMode === 'table' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          {/* Mobile Card Feed for Table Mode (< md only) */}
          <div className="md:hidden divide-y divide-slate-100">
            {filteredLeads.slice(0, tableLimit).map((lead) => (
              <div key={lead.id} className="p-3.5 space-y-2 hover:bg-slate-50 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 truncate max-w-[140px]">
                    {lead.category || 'Packaging'}
                  </span>
                  <select
                    value={lead.status}
                    onChange={(e) => onUpdateStatus(lead.id, e.target.value)}
                    className="text-[10px] font-bold px-2 py-1 rounded-md border border-slate-200 bg-white cursor-pointer"
                  >
                    {activeStages.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <h4 className="font-black text-slate-900 text-sm capitalize">{lead.name}</h4>
                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                    <span>{lead.branch || 'Ghala'}</span>
                    {lead.phone && (
                      <a href={`tel:${lead.phone.replace(/\s+/g, '')}`} className="font-mono text-slate-700 font-semibold hover:text-red-600">
                        • {lead.phone}
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
                  <span className="font-mono font-bold text-slate-900">
                    OMR {Number(lead.dealValue || 0).toLocaleString('en-US', { minimumFractionDigits: 3 })}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setShareModalLead(lead)}
                      title="Share Lead & PDF Slip"
                      className="p-2 rounded-lg bg-red-50 text-[#CC1A22] hover:bg-red-100 transition active:scale-95"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onOpenWhatsApp(lead)}
                      title="WhatsApp"
                      className="p-2 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition active:scale-95"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onCreateQuoteFromLead(lead)}
                      title="Create Quotation"
                      className="p-2 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 transition active:scale-95"
                    >
                      <FileText className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onEditLead(lead)}
                      title="Edit"
                      className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition active:scale-95"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    {onDeleteLead && (
                    <button
                      onClick={() => onDeleteLead(lead.id)}
                      title="Delete"
                      className="p-2 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 transition active:scale-95"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table (hidden on mobile, visible md:) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 font-bold">Client / Company</th>
                  <th className="py-3 px-4 font-bold">Category</th>
                  <th className="py-3 px-4 font-bold">Phone / WhatsApp</th>
                  <th className="py-3 px-4 font-bold">Branch</th>
                  <th className="py-3 px-4 font-bold">Status</th>
                  <th className="py-3 px-4 font-bold text-right">Est. Value</th>
                  <th className="py-3 px-4 font-bold">Requirements / Notes</th>
                  <th className="py-3 px-4 font-bold text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLeads.slice(0, tableLimit).map((lead) => (
                  <tr key={lead.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-900 max-w-[200px] truncate capitalize">
                      {lead.name}
                      {lead.email && (
                        <span className="block text-[10px] font-normal text-slate-400 truncate">
                          {lead.email}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                        {lead.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono font-medium text-slate-700 whitespace-nowrap">
                      {lead.phone || '-'}
                    </td>
                    <td className="py-3 px-4 text-slate-600 font-medium whitespace-nowrap">
                      <div className="font-bold text-slate-800">{lead.branch || 'Ghala'}</div>
                      {lead.salesman && (
                        <div className="text-[10px] text-emerald-700 flex items-center gap-1 font-semibold">
                          <UserCheck className="w-2.5 h-2.5 shrink-0" />
                          <span>{lead.salesman}</span>
                        </div>
                      )}
                      {lead.customerLocation && (
                        <div className="text-[10px] text-slate-400 flex items-center gap-1 font-normal">
                          <MapPin className="w-2.5 h-2.5 shrink-0" />
                          <span>{lead.customerLocation}</span>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <select
                        value={lead.status}
                        onChange={(e) => onUpdateStatus(lead.id, e.target.value)}
                        className={`text-[10px] font-bold px-2 py-1 rounded-md border focus:outline-none cursor-pointer ${
                          lead.status === 'won'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            : lead.status === 'quotation_sent'
                            ? 'bg-amber-50 text-amber-800 border-amber-300'
                            : lead.status === 'contacted'
                            ? 'bg-indigo-50 text-indigo-800 border-indigo-300'
                            : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {activeStages.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                      OMR {(() => {
                        const val = Number(lead.dealValue);
                        return (!isNaN(val) && val > 0)
                          ? val.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
                          : '0.000';
                      })()}
                    </td>
                    <td className="py-3 px-4 text-slate-500 max-w-[220px]">
                      {(lead.quantity === 'Needs Intake' || lead.notes?.includes('Needs Intake')) ? (
                        <button
                          type="button"
                          onClick={() => setIntakeModalLead(lead)}
                          className="px-2 py-0.5 rounded bg-red-100 hover:bg-red-200 text-red-700 text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer transition"
                          title="Open Customer Intake & Assignment"
                        >
                          <Headphones className="w-3 h-3 text-red-600" />
                          <span>Needs Intake</span>
                        </button>
                      ) : (
                        <span className="truncate block">{lead.quantity || lead.notes || '-'}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setShareModalLead(lead)}
                          title="Share Lead & PDF Slip"
                          className="p-1 rounded bg-red-50 text-[#CC1A22] hover:bg-red-100 transition"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onOpenWhatsApp(lead)}
                          title="WhatsApp"
                          className="p-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onCreateQuoteFromLead(lead)}
                          title="Create Quotation"
                          className="p-1 rounded bg-amber-50 text-amber-700 hover:bg-amber-100 transition"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onEditLead(lead)}
                          title="Edit"
                          className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {onDeleteLead && (
                        <button
                          onClick={() => onDeleteLead(lead.id)}
                          title="Delete"
                          className="p-1 rounded text-red-500 hover:text-red-700 hover:bg-red-50 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredLeads.length > tableLimit && (
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
              <span>
                Showing {Math.min(tableLimit, filteredLeads.length)} of {filteredLeads.length} leads.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTableLimit((prev) => prev + 50)}
                  className="px-3 py-1 bg-white hover:bg-slate-100 border border-slate-300 rounded-md font-bold text-slate-700 transition cursor-pointer"
                >
                  Load More (+50)
                </button>
                <button
                  type="button"
                  onClick={() => setTableLimit(filteredLeads.length)}
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded-md font-bold transition cursor-pointer"
                >
                  Show All ({filteredLeads.length})
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CUSTOMER CARE CALL & INTAKE VIEW */}
      {viewMode === 'customercare' && (
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-blue-950 via-slate-900 to-red-950 text-white rounded-xl p-5 border border-slate-800 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Headphones className="w-5 h-5 text-red-400" />
                <h3 className="text-sm font-bold">Step 1 & 2: Customer Care Call Queue & Regional Handover</h3>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                Call inbound customers, understand their product needs, quantity, and Wilayat, then assign to the nearest Oman branch and sales representative.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono font-bold px-3 py-1.5 rounded-lg bg-red-600/30 text-red-300 border border-red-500/40">
                {leads.filter((l) => l.status === 'new').length} Awaiting Intake Call
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredLeads
              .filter((l) => (selectedStage === 'all' ? l.status === 'new' || l.status === 'contacted' : l.status === selectedStage))
              .map((lead) => {
                const fullPhone = lead.phone || (lead.mobile ? `${lead.countryCode || '+968'} ${lead.mobile}` : '');
                const isNew = lead.status === 'new';

                return (
                  <div
                    key={lead.id}
                    className={`bg-white rounded-xl p-4 border shadow-2xs hover:shadow-md transition-all flex flex-col justify-between ${
                      isNew ? 'border-red-200 ring-1 ring-red-100' : 'border-slate-200'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span
                          className={`text-[9px] font-extrabold uppercase px-2.5 py-0.5 rounded-full ${
                            isNew ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {isNew ? '● Needs Call & Intake' : '✓ Understood & Assigned'}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono bg-slate-100 px-2 py-0.5 rounded">
                          {lead.category?.split(' ')[0]}
                        </span>
                      </div>

                      <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 mb-2 flex items-center justify-between">
                        <div>
                          <span className="text-[9px] uppercase font-bold text-slate-400 block tracking-wider">
                            Phone Number
                          </span>
                          <span className="text-sm font-black font-mono text-slate-900">
                            {fullPhone || 'No Phone Number'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          {fullPhone && (
                            <a
                              href={`tel:${fullPhone.replace(/\s+/g, '')}`}
                              className="p-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 shadow-2xs"
                              title="Call"
                            >
                              <Phone className="w-3.5 h-3.5" />
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => onOpenWhatsApp(lead)}
                            className="p-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 shadow-2xs"
                            title="WhatsApp"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <h4 className="text-xs font-black text-slate-900 leading-snug">
                        {lead.name}
                      </h4>

                      <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-1">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        <span>Location: <strong>{lead.customerLocation || lead.branch || 'Oman'}</strong></span>
                      </div>

                      {(lead.quantity || lead.notes) && (
                        <p className="text-[11px] text-slate-600 mt-2 p-2 bg-slate-50 rounded border border-slate-100 italic line-clamp-2">
                          "{lead.quantity || lead.notes}"
                        </p>
                      )}

                      {lead.salesman && (
                        <div className="mt-2 text-[10px] text-emerald-800 font-semibold bg-emerald-50 px-2 py-1 rounded border border-emerald-100 flex items-center gap-1">
                          <UserCheck className="w-3 h-3 text-emerald-600" />
                          <span>Sales Rep: <strong>{lead.salesman}</strong> ({lead.branch})</span>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 pt-2.5 border-t border-slate-100">
                      <button
                        onClick={() => setIntakeModalLead(lead)}
                        className="w-full py-2 px-3 bg-slate-900 hover:bg-red-600 text-white text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 shadow-2xs group"
                      >
                        <Headphones className="w-3.5 h-3.5 text-red-400 group-hover:text-white" />
                        <span>Understand & Assign</span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-white" />
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Customer Care Intake Modal */}
      {intakeModalLead && (
        <CustomerCareModal
          isOpen={Boolean(intakeModalLead)}
          onClose={() => setIntakeModalLead(null)}
          lead={intakeModalLead}
          branches={branches}
          categories={activeCategories.filter((c) => c !== 'All Categories')}
          onTransferToPipeline={async (updated) => {
            if (onUpdateLead) {
              await onUpdateLead(updated.id, updated);
            } else {
              await onUpdateStatus(updated.id, updated.status);
            }
            setIntakeModalLead(null);
          }}
          onMarkNotConverted={async (lostData) => {
            if (onUpdateLead) {
              await onUpdateLead(lostData.id, lostData);
            } else {
              await onUpdateStatus(lostData.id, 'lost');
            }
            setIntakeModalLead(null);
          }}
          onOpenWhatsApp={onOpenWhatsApp}
          onDeleteLead={onDeleteLead}
          onShareLead={(l) => setShareModalLead(l)}
          onSaveAndShare={async (updated) => {
            if (onUpdateLead) {
              await onUpdateLead(updated.id, updated);
            }
            setIntakeModalLead(null);
            setShareModalLead(updated);
          }}
          onSaveAndQuote={async (updated) => {
            if (onUpdateLead) {
              await onUpdateLead(updated.id, updated);
            }
            setIntakeModalLead(null);
            if (onCreateQuoteFromLead) {
              onCreateQuoteFromLead(updated);
            }
          }}
        />
      )}

      {/* Leads CSV Bulk Import Modal */}
      <LeadImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        token={token}
        showToast={showToast}
        onImportSuccess={() => {
          if (onRefresh) onRefresh();
        }}
      />

      {/* Global Portal Dropdown Menu: immune to column clipping, scroll limits, and z-index traps */}
      {menuAnchor && createPortal(
        <div
          className="fixed w-56 bg-white rounded-xl shadow-2xl border border-slate-200 py-1.5 z-[9999] animate-in fade-in zoom-in-95 text-left text-slate-800"
          style={{
            top: menuAnchor.top,
            bottom: menuAnchor.bottom,
            right: menuAnchor.right,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-3.5 py-1.5 border-b border-slate-100 flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              <span className="font-monipack lowercase text-xs">monipack</span> Options
            </span>
            <span className="text-[10px] font-mono text-slate-400 font-semibold">#{menuAnchor.lead.id}</span>
          </div>

          <button
            type="button"
            onClick={() => {
              const targetLead = menuAnchor.lead;
              setMenuAnchor(null);
              setIntakeModalLead(targetLead);
            }}
            className="w-full text-left px-3.5 py-2 text-xs font-bold text-blue-700 bg-blue-50/70 hover:bg-blue-100/80 flex items-center gap-2.5 transition cursor-pointer"
          >
            <Headphones className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>Customer Care Intake</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const targetLead = menuAnchor.lead;
              setMenuAnchor(null);
              setShareModalLead(targetLead);
            }}
            className="w-full text-left px-3.5 py-2 text-xs font-bold text-red-700 bg-red-50/70 hover:bg-red-100/80 flex items-center gap-2.5 transition cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5 text-[#CC1A22] shrink-0" />
            <span>Share Lead & PDF Slip</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const targetLead = menuAnchor.lead;
              setMenuAnchor(null);
              setPrintSlipLead(targetLead);
            }}
            className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-slate-600 shrink-0" />
            <span>Print A4 Lead Slip (PDF)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const targetLead = menuAnchor.lead;
              setMenuAnchor(null);
              onCreateQuoteFromLead(targetLead);
            }}
            className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-amber-50 hover:text-amber-900 flex items-center gap-2.5 transition cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>Issue <span className="font-monipack lowercase text-xs">monipack</span> Quotation</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const targetLead = menuAnchor.lead;
              setMenuAnchor(null);
              onEditLead(targetLead);
            }}
            className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition cursor-pointer"
          >
            <Edit2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span>Edit Lead Details</span>
          </button>

          <div className="px-3.5 py-1.5 border-t border-slate-100 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
            Move to Stage
          </div>

          {activeStages.map((s) => (
            <button
              key={s.id}
              type="button"
              disabled={menuAnchor.lead.status === s.id}
              onClick={() => {
                const targetLead = menuAnchor.lead;
                setMenuAnchor(null);
                onUpdateStatus(targetLead.id, s.id);
              }}
              className={`w-full text-left px-3.5 py-1.5 text-[11px] font-medium flex items-center justify-between transition cursor-pointer ${
                menuAnchor.lead.status === s.id
                  ? 'bg-slate-100 text-slate-400 cursor-default'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span className="truncate pr-1">{s.label}</span>
              {menuAnchor.lead.status === s.id && <span className="text-[10px] text-emerald-600 font-bold shrink-0">✓</span>}
            </button>
          ))}

          {/* Delete Lead Button: Full Width at Menu Base (only for roles allowed to archive) */}
          {onDeleteLead && (
          <div className="border-t border-slate-100 mt-1 pt-1">
            <button
              type="button"
              onClick={() => {
                const targetLead = menuAnchor.lead;
                setMenuAnchor(null);
                if (window.confirm(`Are you sure you want to delete lead "${targetLead.name}"? This action cannot be undone.`)) {
                  onDeleteLead(targetLead.id);
                }
              }}
              className="w-full text-left px-3.5 py-2 text-xs font-bold text-red-600 hover:bg-red-50 flex items-center gap-2 transition cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-500 shrink-0" />
              <span>Delete Lead</span>
            </button>
          </div>
          )}
        </div>,
        document.body
      )}

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
