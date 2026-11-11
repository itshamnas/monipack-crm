import React, { useState, useMemo, useEffect } from 'react';
import { QUOTE_STATUS, effectiveQuoteStatus } from '../components/QuoteStatus.jsx';
import { createPortal } from 'react-dom';
import Sheet from '../components/ui/Sheet.jsx';
import MoreMenu from '../components/ui/MoreMenu.jsx';
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
  Search,
  SlidersHorizontal,
  Columns3,
  LayoutList,
  FileSpreadsheet,
  Share2,
  Printer,
  CalendarClock, PhoneCall, CheckCircle2, Check, X
} from 'lucide-react';
import { openPrintable, chipsHtml, tableHtml } from '../utils/pdfReport.js';
import CustomerCareModal from '../components/CustomerCareModal';
import LeadImportModal from '../components/LeadImportModal';
import ShareModal from '../components/ShareModal';
import PrintLeadSlip from '../components/PrintLeadSlip';
import { getApiUrl } from '../api/config.js';
import { avatarStyle } from '../components/ui/BranchPicker.jsx';

// Enterprise pipeline helpers (display only)
const STAGE_COLORS = ['#64748B', '#2563EB', '#7C3AED', '#D97706', '#0E9F6E', '#D0121B', '#0891B2', '#DB2777'];
const stageColor = (stage, i) => (stage?.id === 'won' ? '#0E9F6E' : stage?.id === 'lost' ? '#94A3B8' : STAGE_COLORS[i % STAGE_COLORS.length]);
const stageName = (label = '') => String(label).replace(/^STEP\s*\d+\s*:\s*/i, '');
const initialsOf = (n = '') => n.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const DAY_MS = 86400000;
// Follow-up state: 'overdue' | 'today' | 'later' | null
const followUpState = (l) => {
  if (!l.nextFollowUpAt || ['won', 'lost'].includes(l.status)) return null;
  const t = new Date(l.nextFollowUpAt); const end = new Date(); end.setHours(23, 59, 59, 999);
  const start = new Date(); start.setHours(0, 0, 0, 0);
  return t < start ? 'overdue' : t <= end ? 'today' : 'later';
};
const followUpLabel = (l) => {
  const st = followUpState(l); if (!st) return '';
  const t = new Date(l.nextFollowUpAt);
  if (st === 'overdue') { const d = Math.max(1, Math.floor((Date.now() - t.getTime()) / DAY_MS)); return `Overdue ${d}d`; }
  if (st === 'today') return `Today ${t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  return t.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};
const ageOf = (d) => { const t = new Date(d).getTime(); if (!t) return null; return Math.max(0, Math.floor((Date.now() - t) / DAY_MS)); };
const omr3 = (v) => { const n = Number(v); return (!isNaN(n) && n > 0 ? n : 0).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 }); };
const CAT_TONE = (c = '') => (/packag/i.test(c) ? 'bg-red-50 text-red-700' : /dispos/i.test(c) ? 'bg-orange-50 text-orange-700' : /kohe/i.test(c) ? 'bg-emerald-50 text-emerald-700' : /clean/i.test(c) ? 'bg-sky-50 text-sky-700' : /food/i.test(c) ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700');

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
  authFetch,
  quotations = [],
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
  // "Follow-ups due" filter (Home can switch it on before opening the pipeline)
  const [followUpOnly, setFollowUpOnly] = useState(() => { try { const v = sessionStorage.getItem('mp_followups') === '1'; sessionStorage.removeItem('mp_followups'); return v; } catch { return false; } });
  const [segment, setSegment] = useState('all'); // all | retail | b2b (by the lead's branch)
  const branchTypeOf = useMemo(() => {
    const byId = new Map((branches || []).map((b) => [String(b.id), b.type]));
    const byName = new Map((branches || []).map((b) => [String(b.name || '').trim().toLowerCase(), b.type]));
    return (l) => (l.branchId && byId.get(String(l.branchId))) || byName.get(String(l.branch || '').trim().toLowerCase()) || null;
  }, [branches]);
  const hasTypes = new Set((branches || []).map((b) => b.type).filter(Boolean)).size > 1; // department managers see one type only
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
  const [filterOpen, setFilterOpen] = useState(false);

  const getNextStage = (currentStatus) => {
    const currentIndex = activeStages.findIndex((s) => s.id === currentStatus);
    if (currentIndex >= 0 && currentIndex < activeStages.length - 1) {
      return activeStages[currentIndex + 1];
    }
    return null;
  };

  // Filter leads
  const baseFilteredLeads = useMemo(() => {
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

      // Retail / B2B
      if (segment !== 'all' && branchTypeOf(l) !== segment) return false;

      // Stage (if filtered in table mode)
      if (selectedStage !== 'all' && selectedStage !== 'All Stages') {
        if (l.status !== selectedStage) return false;
      }

      return true;
    });
  }, [leads, branches, searchQuery, selectedCategory, selectedBranch, selectedStage, segment, branchTypeOf]);
  const dueCount = useMemo(() => baseFilteredLeads.filter((l) => ['overdue', 'today'].includes(followUpState(l))).length, [baseFilteredLeads]);
  const filteredLeads = useMemo(
    () => (followUpOnly
      ? baseFilteredLeads.filter((l) => ['overdue', 'today'].includes(followUpState(l))).sort((a, b) => new Date(a.nextFollowUpAt) - new Date(b.nextFollowUpAt))
      : baseFilteredLeads),
    [baseFilteredLeads, followUpOnly]
  );

  // Group once per change (fast with very large pipelines): { stageId: { leads, total } }
  const byStage = useMemo(() => {
    const m = {};
    for (const l of filteredLeads) {
      const g = m[l.status] || (m[l.status] = { leads: [], total: 0 });
      g.leads.push(l);
      const v = Number(l.dealValue);
      if (!isNaN(v)) g.total += v;
    }
    return m;
  }, [filteredLeads]);
  const stageGroup = (id) => byStage[id] || { leads: [], total: 0 };
  // Phones: open on the first stage that has leads (not an empty first column), until the person picks a stage
  const pickedStage = React.useRef(false);
  useEffect(() => {
    if (pickedStage.current || stageGroup(mobileFocusStage).leads.length) return;
    const first = activeStages.find((st) => stageGroup(st.id).leads.length);
    if (first) setMobileFocusStage(first.id);
  }, [byStage]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { // keep the chosen stage chip in view in the sideways row
    const el = typeof document !== 'undefined' && document.querySelector(`[data-stage-chip="${mobileFocusStage}"]`);
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [mobileFocusStage]);
  const openTotalOMR = useMemo(() => filteredLeads.reduce((t, l) => (['won', 'lost'].includes(l.status) ? t : t + (Number(l.dealValue) || 0)), 0), [filteredLeads]);
  const scrollToStage = (id) => {
    const el = document.getElementById(`mp-col-${id}`);
    if (el && el.offsetParent) el.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    else { setMobileFocusStage(id); setMobileViewStyle('focus'); }
  };
  // Load the next 30 cards when a column is scrolled near its end
  const loadMoreOnScroll = (stageId, total, limit) => (e) => {
    const el = e.currentTarget;
    if (total > limit && el.scrollTop + el.clientHeight > el.scrollHeight - 160) {
      setStageLimits((prev) => (prev[stageId] === limit + 30 ? prev : { ...prev, [stageId]: limit + 30 }));
    }
  };

  // Export to CSV - Authenticated via Backend Export Endpoint
  const handleExportCSV = async (scope = 'filtered') => {
    if (!currentUser?.permissions?.includes('leads.export')) {
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

  // Latest quotation of each lead (shown on its card)
  const quoteByLead = useMemo(() => {
    const m = new Map();
    (quotations || []).forEach((q) => {
      if (!q.leadId) return;
      const k = String(q.leadId);
      const prev = m.get(k);
      const newer = !prev || String(q.createdAt || q.date) > String(prev.createdAt || prev.date);
      m.set(k, { ...(newer ? q : prev), count: (prev?.count || 0) + 1 });
    });
    return m;
  }, [quotations]);

  const renderLeadCard = (lead, isMobileFocus = false) => {
    const quote = quoteByLead.get(String(lead.id));
    const qs = quote ? effectiveQuoteStatus(quote) : null;
    const nextStage = getNextStage(lead.status);
    const age = ageOf(lead.date);
    const needsIntake = lead.status === 'new' || lead.quantity === 'Needs Intake' || lead.notes?.includes('Needs Intake');
    const detail = (lead.quantity || lead.notes || '').replace(/Needs Intake/g, '').trim();

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
        className={`mp-lc group ${isMobileFocus ? 'w-full' : 'cursor-grab active:cursor-grabbing'} ${draggedLeadId === lead.id ? 'is-dragging' : ''} ${activeMenuLeadId === lead.id ? 'z-30' : 'z-10'}`}
      >
        {/* Row 1: category · branch · age · menu */}
        <div className="flex items-center gap-1.5 pr-[78px] min-w-0">
          <span className={`max-w-[140px] truncate text-[11px] font-semibold px-2 py-0.5 rounded-full ${CAT_TONE(lead.category)}`} title={lead.category}>
            {lead.category || 'Packaging'}
          </span>
          <span className="flex items-center gap-0.5 text-[11px] text-slate-500 truncate min-w-0" title={lead.customerLocation ? `Wilayat: ${lead.customerLocation}` : undefined}>
            <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
            <span className="truncate">{lead.branch || 'Ghala'}{lead.customerLocation ? ` · ${lead.customerLocation}` : ''}</span>
          </span>
        </div>
        <div className="absolute top-2 right-2 flex items-center gap-1">
          {age !== null && <span className={`text-[10.5px] font-semibold tabular-nums ${age > 7 && !['won', 'lost'].includes(lead.status) ? 'text-amber-600' : 'text-slate-400'}`} title={`${age} days since enquiry`}>{age === 0 ? 'new' : `${age}d`}</span>}
          <button
            type="button"
            onClick={(e) => handleToggleMenu(e, lead)}
            title="Lead actions"
            aria-label="Lead actions"
            className={`w-8 h-8 grid place-items-center rounded-lg transition cursor-pointer ${
              activeMenuLeadId === lead.id ? 'text-[#CC1A22] bg-red-50 ring-1 ring-red-200' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
            }`}
          >
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>

        {/* Name + phone */}
        <h4 className="mt-2 text-[13.5px] font-bold text-slate-900 leading-snug group-hover:text-[#CC1A22] transition-colors capitalize mp-display">{lead.name}</h4>
        {lead.phone && (
          <a href={`tel:${lead.phone.replace(/\s+/g, '')}`} onClick={(e) => e.stopPropagation()} className="block mt-0.5 text-[12px] font-medium text-slate-500 hover:text-[#CC1A22] tabular-nums">
            {lead.phone}
          </a>
        )}
        {followUpState(lead) && (
          <div className={`mt-2 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${followUpState(lead) === 'overdue' ? 'bg-red-50 text-red-700' : followUpState(lead) === 'today' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`} title={lead.followUpNote ? `Follow-up: ${lead.followUpNote}` : 'Next follow-up'}>
            <CalendarClock className="w-3 h-3" />{followUpLabel(lead)}{lead.followUpNote ? <span className="font-normal truncate max-w-[120px]">· {lead.followUpNote}</span> : null}
          </div>
        )}
        {(() => {
          if (lead.status === 'won' || lead.status === 'lost') return null;
          const quietDays = Math.floor((Date.now() - new Date(lead.updatedAt || lead.date || Date.now()).getTime()) / DAY_MS);
          if (quietDays < 7) return null;
          return <span className={`mp-quiet ${quietDays >= 14 ? 'cold' : ''}`} title={`No update for ${quietDays} days`}>{quietDays >= 14 ? `Going cold · ${quietDays}d` : `Quiet ${quietDays}d`}</span>;
        })()}
        {detail && <p className="mt-1.5 text-[12px] text-slate-600 line-clamp-2" title={detail}>{detail}</p>}

        {lead.status === 'lost' && lead.lostReason && (
          <div className="mt-2 inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700">Reason: {lead.lostReason}</div>
        )}

        {needsIntake && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setIntakeModalLead(lead); }}
            className="w-full mt-2.5 min-h-[32px] px-2 bg-red-50 hover:bg-red-100 text-[#CC1A22] text-[11.5px] font-bold rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            <Headphones className="w-3.5 h-3.5" />
            <span>Customer intake & assignment</span>
          </button>
        )}

        {/* Footer: salesman · quick actions · value */}
        <div className="mt-3 pt-2.5 border-t border-dashed border-slate-200 flex items-center gap-2">
          {lead.salesman ? (
            <span className="w-6 h-6 rounded-full grid place-items-center text-[9px] font-bold text-white shrink-0" style={avatarStyle(lead.salesman)} title={`Salesman: ${lead.salesman}`}>{initialsOf(lead.salesman)}</span>
          ) : (
            <span className="w-6 h-6 rounded-full grid place-items-center shrink-0 border border-dashed border-slate-300 text-slate-300" title="No salesman yet"><UserCheck className="w-3 h-3" /></span>
          )}
          <div className="flex items-center gap-1">
            {(lead.phone || lead.mobile) && (
              <a
                href={`tel:${(lead.phone || `${lead.countryCode || '+968'}${lead.mobile}`).replace(/\s+/g, '')}`}
                onClick={(e) => e.stopPropagation()}
                title="Call"
                aria-label="Call"
                className="mp-lc-act text-blue-600"
              >
                <Phone className="w-3.5 h-3.5" />
              </a>
            )}
            <button type="button" onClick={(e) => { e.stopPropagation(); onOpenWhatsApp(lead); }} title="WhatsApp" aria-label="WhatsApp" className="mp-lc-act text-emerald-600">
              <MessageSquare className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); setShareModalLead(lead); }} title="Share lead & PDF slip" aria-label="Share" className="mp-lc-act text-[#CC1A22]">
              <Share2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <span className="ml-auto whitespace-nowrap text-[12.5px] font-bold text-slate-900 tabular-nums">OMR {omr3(lead.dealValue)}</span>
        </div>
        {quote && (
          <div className={`mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${QUOTE_STATUS[qs]?.cls || ''}`} title={`Latest quotation ${quote.code}`}>
            <FileText className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{quote.code} · {QUOTE_STATUS[qs]?.label}{quote.count > 1 ? ` · ${quote.count} quotes` : ''}</span>
          </div>
        )}

        {/* 1-tap next stage (phones) */}
        {isMobileFocus && nextStage && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onUpdateStatus(lead.id, nextStage.id);
              if (showToast) showToast(`Moved to ${nextStage.label}`);
            }}
            className="mt-2.5 w-full min-h-[40px] px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] transition cursor-pointer"
          >
            <span>Move to {stageName(nextStage.label)}</span><ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
    );
  };

  const exportLeadsPdf = () => {
    authFetch?.('/api/reports/export-log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: `Pipeline PDF (${filteredLeads.length} leads)` }) }).catch(() => {});
                      const stageName = (id) => (activeStages.find((st) => st.id === id)?.label || id).replace(/^STEP \d+:\s*/, '');
                      const open = filteredLeads.filter((l) => !['won', 'lost'].includes(l.status));
                      const ok = openPrintable({
                        docType: 'Leads report',
                        meta: [['Records', filteredLeads.length]],
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
  };
  const canExportLeads = currentUser?.permissions?.includes('leads.export');
  const branchOn = selectedBranch && selectedBranch !== 'all' && selectedBranch !== 'All Oman Branches';
  const catOn = selectedCategory && selectedCategory !== 'All Categories';
  const filterCount = (followUpOnly ? 1 : 0) + (segment !== 'all' ? 1 : 0) + (catOn ? 1 : 0) + (branchOn ? 1 : 0) + (selectedStage !== 'all' ? 1 : 0);
  const resetFilters = () => { setSelectedCategory('All Categories'); setSelectedBranch('all'); setSelectedStage('all'); setFollowUpOnly(false); setSegment('all'); };

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 max-w-[1600px] mx-auto pb-24 md:pb-8">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 mr-auto">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[24px] leading-tight font-extrabold text-slate-900">Sales pipeline</h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11.5px] font-bold bg-red-50 text-[#A3141C] tabular-nums">{filteredLeads.length.toLocaleString()} lead{filteredLeads.length === 1 ? "" : "s"}</span>
            <span className="px-2.5 py-0.5 rounded-full text-[11.5px] font-bold bg-white border border-slate-200 text-slate-600 tabular-nums">OMR {omr3(openTotalOMR)} open</span>
          </div>
          <p className="hidden sm:block text-xs text-slate-500 mt-1">From first enquiry to confirmed order: drag cards between stages.</p>
        </div>

        <div className="hidden lg:flex items-center gap-2 flex-wrap">
          {/* View switch */}
          <div className="flex p-1 rounded-xl bg-slate-100 border border-slate-200" role="tablist" aria-label="Pipeline view">
            {[['kanban', Kanban, 'Board'], ['table', TableIcon, 'Table']].map(([v, Icon, label]) => (
              <button
                key={v}
                role="tab"
                aria-selected={viewMode === v}
                onClick={() => setViewMode(v)}
                className={`flex items-center gap-1.5 px-3 min-h-[34px] rounded-lg text-xs font-bold transition cursor-pointer ${viewMode === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
              >
                <Icon className="w-3.5 h-3.5" /><span>{label}</span>
              </button>
            ))}
          </div>

          {/* Export (admin) */}
          {currentUser?.permissions?.includes('leads.export') ? (
            <div className="relative">
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="mp-btn mp-btn-line min-h-[40px]"
                aria-expanded={showExportMenu}
              >
                <Download className="w-4 h-4 text-slate-500" />
                <span className="hidden sm:inline">Export</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
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
                    onClick={() => { setShowExportMenu(false); exportLeadsPdf(); }}
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
            <div title="Confidential data export is restricted to Administrator role only." className="mp-btn min-h-[40px] bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed select-none">
              <Lock className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export restricted</span>
            </div>
          )}

          {canImport && (
            <button onClick={() => setShowImportModal(true)} className="mp-btn mp-btn-line min-h-[40px]" title="Bulk import leads from CSV/Excel template">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span className="hidden sm:inline">Import</span>
            </button>
          )}

          <button onClick={onNewLead} className="mp-btn mp-btn-red min-h-[40px] flex-1 sm:flex-none">
            <Plus className="w-4 h-4" />
            <span>New lead</span>
          </button>
        </div>
      </div>

      {/* Phones & tablets: search + Filter + ⋯ in one row (the red + in the bottom bar adds a lead) */}
      <div className="lg:hidden space-y-2.5">
        <div className="mp-ptool">
          <div className="mp-psearch">
            <Search className="w-4 h-4" aria-hidden="true" />
            <label htmlFor="lead-search-p" className="sr-only">Search leads</label>
            <input id="lead-search-p" type="search" placeholder="Search name or phone" value={searchQuery || ''} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <button type="button" className="mp-filter-btn" onClick={() => setFilterOpen(true)} aria-label={`Filters${filterCount ? `, ${filterCount} on` : ''}`}>
            <SlidersHorizontal className="w-4 h-4" /> Filter{filterCount > 0 && <b>{filterCount}</b>}
          </button>
          <MoreMenu label="More pipeline actions" items={[
            { label: viewMode === 'table' ? 'Show as board' : 'Show as table', icon: viewMode === 'table' ? Kanban : TableIcon, onClick: () => setViewMode(viewMode === 'table' ? 'kanban' : 'table') },
            viewMode === 'kanban' && { label: mobileViewStyle === 'focus' ? 'Show all columns' : 'Show one stage at a time', icon: mobileViewStyle === 'focus' ? Columns3 : LayoutList, onClick: () => setMobileViewStyle(mobileViewStyle === 'focus' ? 'columns' : 'focus') },
            canExportLeads && { label: 'PDF report of this view', icon: FileText, onClick: exportLeadsPdf },
            canExportLeads && { label: `Excel: this view (${filteredLeads.length})`, icon: Download, onClick: () => handleExportCSV('filtered') },
            canExportLeads && { label: `Excel: all leads (${leads.length})`, icon: Download, onClick: () => handleExportCSV('all') },
            canImport && { label: 'Import leads from Excel', icon: FileSpreadsheet, onClick: () => setShowImportModal(true) },
          ].filter(Boolean)} />
        </div>
        {(dueCount > 0 || followUpOnly) && (
          <button type="button" onClick={() => setFollowUpOnly((v) => !v)} aria-pressed={followUpOnly}
            className={`w-full min-h-[44px] px-4 rounded-xl flex items-center gap-2 text-[14px] font-semibold border ${followUpOnly ? 'bg-amber-500 text-white border-amber-500' : 'bg-amber-50 text-amber-900 border-amber-200'}`}>
            <CalendarClock className="w-4 h-4" />
            <span className="flex-1 text-left">{followUpOnly ? 'Showing follow-ups due only' : `${dueCount} follow-up${dueCount === 1 ? '' : 's'} due`}</span>
            <span className="text-[13px] underline underline-offset-2">{followUpOnly ? 'Show all' : 'Show'}</span>
          </button>
        )}
      </div>
      <Sheet open={filterOpen} onClose={() => setFilterOpen(false)} title="Filter leads"
        footer={<>
          <button type="button" className="mp-btn-ghost" onClick={resetFilters}>Clear</button>
          <button type="button" className="mp-btn-wide" onClick={() => setFilterOpen(false)}>Show {filteredLeads.length.toLocaleString()} lead{filteredLeads.length === 1 ? '' : 's'}</button>
        </>}>
        <label className="flex items-center gap-3 min-h-[48px] text-[15px] font-medium">
          <input type="checkbox" className="w-5 h-5" checked={followUpOnly} onChange={(e) => setFollowUpOnly(e.target.checked)} />
          Follow-ups due only <span className="ml-auto text-[13px] text-amber-700 font-semibold tabular-nums">{dueCount}</span>
        </label>
        {hasTypes && (<>
          <span className="mp-sheet-label">Department</span>
          <div className="mp-opt" role="radiogroup" aria-label="Retail or B2B">
            {[['all', 'All'], ['retail', 'Retail'], ['b2b', 'B2B']].map(([v, l]) => (
              <button key={v} type="button" aria-pressed={segment === v} onClick={() => setSegment(v)}>{l}</button>
            ))}
          </div>
        </>)}
        <label className="mp-sheet-label" htmlFor="lead-cat-p">Product category</label>
        <select id="lead-cat-p" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="w-full h-12 px-3 rounded-xl border border-slate-300 text-[15px] bg-white">
          {activeCategories.map((c) => (<option key={c} value={c}>{c}</option>))}
        </select>
        {viewMode === 'table' && (<>
          <label className="mp-sheet-label" htmlFor="lead-stage-p">Stage</label>
          <select id="lead-stage-p" value={selectedStage} onChange={(e) => setSelectedStage(e.target.value)} className="w-full h-12 px-3 rounded-xl border border-slate-300 text-[15px] bg-white">
            <option value="all">All stages</option>
            {activeStages.map((st) => (<option key={st.id} value={st.id}>{stageName(st.label)}</option>))}
          </select>
        </>)}
        {branchOn && (
          <button type="button" onClick={() => setSelectedBranch('all')} className="mt-4 w-full min-h-[48px] rounded-xl border border-slate-200 flex items-center gap-2 px-3 text-[14px]">
            <MapPin className="w-4 h-4" /> <span className="flex-1 text-left truncate">Branch: <b>{((branches || []).find((b) => String(b.id ?? b.name) === String(selectedBranch))?.name) || selectedBranch}</b></span> <X className="w-4 h-4" /> Remove
          </button>
        )}
      </Sheet>

      {/* Toolbar: filters (PC and landscape tablets) */}
      <div className="hidden lg:flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setFollowUpOnly((v) => !v)} className={`mp-fchip ${followUpOnly ? 'on' : ''}`} aria-pressed={followUpOnly}>
          <CalendarClock className="w-3.5 h-3.5" />
          <span>Follow-ups due</span>
          <span className={`text-[11px] px-1.5 rounded-full tabular-nums ${dueCount ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'}`}>{dueCount}</span>
        </button>
        <label className={`mp-fchip ${selectedCategory && selectedCategory !== 'All Categories' ? 'on' : ''}`}>
          <Filter className="w-3.5 h-3.5" />
          <span className="sr-only">Category</span>
          <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} aria-label="Category">
            {activeCategories.map((c) => (<option key={c} value={c}>{c}</option>))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 opacity-60" />
        </label>

        {hasTypes && (
          <span className="mp-seg" role="radiogroup" aria-label="Retail or B2B">
            {[['all', 'All'], ['retail', 'Retail'], ['b2b', 'B2B']].map(([v, l]) => (
              <button key={v} type="button" role="radio" aria-checked={segment === v} onClick={() => setSegment(v)} className={`mp-fchip ${segment === v ? 'on' : ''}`}>{l}</button>
            ))}
          </span>
        )}

        {viewMode === 'table' && (
          <label className={`mp-fchip ${selectedStage !== 'all' ? 'on' : ''}`}>
            <span className="sr-only">Stage</span>
            <select value={selectedStage} onChange={(e) => setSelectedStage(e.target.value)} aria-label="Stage">
              <option value="all">All stages</option>
              {activeStages.map((st) => (<option key={st.id} value={st.id}>{stageName(st.label)}</option>))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 opacity-60" />
          </label>
        )}

        {selectedBranch && selectedBranch !== 'all' && selectedBranch !== 'All Oman Branches' && (
          <span className="mp-fchip on">
            <MapPin className="w-3.5 h-3.5" />
            <span>Branch: <strong>{((branches || []).find((b) => String(b.id ?? b.name) === String(selectedBranch))?.name) || selectedBranch}</strong></span>
            <button onClick={() => setSelectedBranch('all')} className="ml-0.5 w-5 h-5 grid place-items-center rounded-full hover:bg-red-100 cursor-pointer" title="Show all branches" aria-label="Clear branch filter"><X className="w-3 h-3" aria-hidden="true" /></button>
          </span>
        )}

        {searchQuery && (
          <span className="mp-fchip on">
            <span>Search: <strong>“{searchQuery}”</strong></span>
            <button onClick={() => setSearchQuery('')} className="ml-0.5 w-5 h-5 grid place-items-center rounded-full hover:bg-red-100 cursor-pointer" aria-label="Clear search"><X className="w-3 h-3" aria-hidden="true" /></button>
          </span>
        )}

        {(followUpOnly || segment !== 'all' || searchQuery || (selectedCategory && selectedCategory !== 'All Categories') || (selectedBranch && selectedBranch !== 'all' && selectedBranch !== 'All Oman Branches') || selectedStage !== 'all') && (
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('All Categories');
              setSelectedBranch('all');
              setSelectedStage('all');
              setFollowUpOnly(false);
              setSegment('all');
            }}
            className="text-xs text-[#CC1A22] hover:text-red-700 font-bold ml-auto cursor-pointer px-2 min-h-[32px]"
          >
            Reset filters
          </button>
        )}
      </div>

      {/* Stage strip: every stage at a glance, click to jump */}
      {viewMode === 'kanban' && filteredLeads.length > 0 && (
        <div className="hidden lg:block">
          <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5" role="list" aria-label="Leads per stage">
            {activeStages.map((st, i) => {
              const n = stageGroup(st.id).leads.length;
              return n ? (
                <button key={st.id} role="listitem" type="button" onClick={() => scrollToStage(st.id)} title={`${stageName(st.label)}: ${n}`} className="mp-bar hover:brightness-110 transition" style={{ flex: n, background: stageColor(st, i), animationDelay: `${i * 50}ms` }} />
              ) : null;
            })}
          </div>
          <div className="mt-2 hidden lg:flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-slate-500">
            {activeStages.map((st, i) => (
              <button key={st.id} type="button" onClick={() => scrollToStage(st.id)} className="inline-flex items-center gap-1.5 hover:text-slate-900">
                <i className="w-2 h-2 rounded-[3px]" style={{ background: stageColor(st, i) }} />
                {stageName(st.label)} <b className="text-slate-900 tabular-nums">{stageGroup(st.id).leads.length.toLocaleString()}</b>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* KANBAN PIPELINE VIEW */}
      {viewMode === 'kanban' && (() => {
        const focusIdx = Math.max(0, activeStages.findIndex((st) => st.id === mobileFocusStage));
        const focusedStageObj = activeStages[focusIdx] || activeStages[0];
        const focusedGroup = stageGroup(focusedStageObj.id);
        const focusedLeads = focusedGroup.leads;
        const focusedLimit = stageLimits[focusedStageObj.id] || 35;
        const visibleFocusedLeads = focusedLeads.slice(0, focusedLimit);

        return (
          <div className="space-y-3">
            {/* Phones & tablets: stage tabs + one stage at a time */}
            <div className="lg:hidden space-y-2.5">
              <div className="flex items-center gap-2 overflow-x-auto mp-noscrollbar pb-1 -mx-3 px-3 sm:-mx-6 sm:px-6 snap-x">
                {activeStages.map((stage, i) => {
                  const n = stageGroup(stage.id).leads.length;
                  const isSelected = mobileFocusStage === stage.id;
                  return (
                    <button
                      key={stage.id}
                      type="button"
                      data-stage-chip={stage.id}
                      onClick={() => { pickedStage.current = true; setMobileFocusStage(stage.id); setMobileViewStyle('focus'); }}
                      className={`snap-start shrink-0 flex items-center gap-2 pl-2.5 pr-2 min-h-[38px] rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer border ${
                        isSelected ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <i className="w-2 h-2 rounded-[3px]" style={{ background: stageColor(stage, i) }} />
                      <span>{stageName(stage.label)}</span>
                      <span className={`text-[10.5px] px-1.5 rounded-full tabular-nums ${isSelected ? 'bg-white/20' : 'bg-slate-100 text-slate-600'}`}>{n.toLocaleString()}</span>
                    </button>
                  );
                })}
              </div>

              {mobileViewStyle === 'focus' && (
                <div className="mp-col-head bg-white rounded-2xl border border-slate-200 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <i className="w-2.5 h-2.5 rounded-[3px]" style={{ background: stageColor(focusedStageObj, focusIdx) }} />
                    <h3 className="text-[13px] font-bold text-slate-900 flex-1 truncate">{stageName(focusedStageObj.label)}</h3>
                    <span className="text-[11.5px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 tabular-nums">{focusedLeads.length.toLocaleString()}</span>
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-slate-500"><span>{focusedStageObj.sublabel || 'Current stage'}</span><span>OMR <b className="text-slate-900 tabular-nums">{omr3(focusedGroup.total)}</b></span></div>
                </div>
              )}
            </div>

            {mobileViewStyle === 'focus' && (
              <div className="lg:hidden space-y-2.5 mp-stagger">
                {visibleFocusedLeads.length > 0 ? (
                  visibleFocusedLeads.map((lead) => renderLeadCard(lead, true))
                ) : (
                  <div className="bg-white rounded-2xl p-8 text-center text-xs text-slate-400 font-medium border border-dashed border-slate-300">No leads in this stage</div>
                )}
                {focusedLeads.length > focusedLimit && (
                  <button
                    type="button"
                    onClick={() => setStageLimits((prev) => ({ ...prev, [focusedStageObj.id]: (prev[focusedStageObj.id] || 35) + 30 }))}
                    className="mp-more w-full"
                  >
                    Showing {focusedLimit} of {focusedLeads.length.toLocaleString()} · load 30 more
                  </button>
                )}
              </div>
            )}

            {/* Board: fills the screen; each column scrolls on its own and loads more as you scroll */}
            <div className={`${mobileViewStyle === 'focus' ? 'hidden lg:flex' : 'flex'} mp-board`}>
              {activeStages.map((stage, i) => {
                const g = stageGroup(stage.id);
                const stageLeads = g.leads;
                const stageLimit = stageLimits[stage.id] || 35;
                const visibleStageLeads = stageLeads.slice(0, stageLimit);
                const share = filteredLeads.length ? Math.round((stageLeads.length / filteredLeads.length) * 100) : 0;
                const color = stageColor(stage, i);

                return (
                  <section
                    key={stage.id}
                    id={`mp-col-${stage.id}`}
                    aria-label={stageName(stage.label)}
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
                    className={`mp-col ${dragOverStageId === stage.id ? 'is-over' : ''}`}
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    <header className="mp-col-head">
                      <div className="flex items-center gap-2">
                        <i className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: color }} />
                        <h3 className="text-[12.5px] font-bold text-slate-900 flex-1 truncate" title={stage.label}>{stageName(stage.label)}</h3>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600 tabular-nums">{stageLeads.length.toLocaleString()}</span>
                      </div>
                      <div className="mt-1.5 mb-2 flex justify-between text-[11.5px] text-slate-500">
                        <span>OMR <b className="text-slate-900 tabular-nums">{omr3(g.total)}</b></span>
                        <span className="tabular-nums">{share}% of leads</span>
                      </div>
                      <span className="block h-1 rounded-full bg-slate-200/70 overflow-hidden"><i className="block h-full rounded-full mp-bar" style={{ width: `${Math.max(stageLeads.length ? 3 : 0, share)}%`, background: color }} /></span>
                    </header>

                    <div className="mp-col-body mp-stagger" onScroll={loadMoreOnScroll(stage.id, stageLeads.length, stageLimit)}>
                      {visibleStageLeads.length > 0 ? (
                        visibleStageLeads.map((lead) => renderLeadCard(lead, false))
                      ) : (
                        <div className="mp-col-empty">{dragOverStageId === stage.id ? 'Drop here' : 'No leads in this stage'}</div>
                      )}
                      {stageLeads.length > stageLimit && (
                        <button
                          type="button"
                          onClick={() => setStageLimits((prev) => ({ ...prev, [stage.id]: (prev[stage.id] || 35) + 30 }))}
                          className="mp-more"
                        >
                          Showing {stageLimit} of {stageLeads.length.toLocaleString()} · load 30 more
                        </button>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* TABLE LIST VIEW */}
      {viewMode === 'table' && (
        <div className="bg-white rounded-[20px] border border-slate-200/90 shadow-[0_1px_3px_rgba(16,24,40,0.06)] overflow-hidden">
          {/* Mobile Card Feed for Table Mode (< md only) */}
          <div className="mp-stagger lg:hidden divide-y divide-slate-100">
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
          <div className="hidden lg:block overflow-auto max-h-[calc(100dvh-300px)]">
            <table className="w-full text-left text-[12.5px]">
              <thead className="bg-slate-50/90 text-slate-400 uppercase text-[10.5px] tracking-[0.08em] border-b border-slate-200 sticky top-0 z-10 backdrop-blur">
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
              <tbody className="mp-stagger divide-y divide-slate-100">
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
                {filteredLeads.length <= 2000 && <button
                  type="button"
                  onClick={() => setTableLimit(filteredLeads.length)}
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded-md font-bold transition cursor-pointer"
                >
                  Show All ({filteredLeads.length})
                </button>}
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
                    className={`bg-white rounded-3xl p-4 border shadow-2xs hover:shadow-md transition-all flex flex-col justify-between ${
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
                          {isNew ? <><PhoneCall className="inline w-3 h-3 -mt-0.5 mr-1" aria-hidden="true" />Needs a call</> : <><CheckCircle2 className="inline w-3 h-3 -mt-0.5 mr-1" aria-hidden="true" />Assigned</>}
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
              {menuAnchor.lead.status === s.id && <Check className="w-4 h-4 text-emerald-600 shrink-0" aria-label="Current stage" />}
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
