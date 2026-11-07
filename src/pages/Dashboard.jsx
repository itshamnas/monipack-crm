import CountUp from '../components/ui/CountUp.jsx';
import React, { useState, useMemo } from 'react';
import { 
  Users, 
  TrendingUp, 
  FileText, 
  CheckCircle2, 
  Clock, 
  ArrowUpRight, 
  AlertCircle,
  Building,
  Package,
  Layers,
  ChevronRight,
  Trophy,
  LogIn,
  ShieldCheck,
  Headphones,
  Sparkles,
  ExternalLink
} from 'lucide-react';

export default function Dashboard({ stats, onNavigate, onSelectCategory, onSelectBranch }) {
  const cards = [
    {
      title: 'Total Active Leads',
      value: stats?.totalLeads || 0,
      subtext: stats?.newLeads ? `${stats.newLeads} new awaiting qualification` : 'Active commercial pipeline',
      icon: Users,
      color: 'bg-blue-500',
      accent: 'border-blue-200 text-blue-700 bg-blue-50',
      action: () => onNavigate('leads'),
    },
    {
      title: 'Pipeline Deal Value',
      value: `OMR ${(stats?.totalPipelineValueOMR || 0).toLocaleString('en-US', { minimumFractionDigits: 3 })}`,
      subtext: 'Estimated qualified orders',
      icon: TrendingUp,
      color: 'bg-red-600',
      accent: 'border-red-200 text-red-700 bg-red-50',
      action: () => onNavigate('leads'),
    },
    {
      title: 'Quotations Created',
      value: stats?.totalQuotations || 0,
      subtext: 'MNI official price bids',
      icon: FileText,
      color: 'bg-amber-500',
      accent: 'border-amber-200 text-amber-700 bg-amber-50',
      action: () => onNavigate('quotations'),
    },
    {
      title: 'Won / Converted Deals',
      value: stats?.wonLeads || 0,
      subtext: `${stats?.conversionRate || 0}% closed-won conversion`,
      icon: CheckCircle2,
      color: 'bg-emerald-600',
      accent: 'border-emerald-200 text-emerald-700 bg-emerald-50',
      action: () => onNavigate('leads'),
    },
  ];

  const categoryEntries = Object.entries(stats?.categoryCounts || {}).sort((a, b) => b[1] - a[1]);
  const branchEntries = Object.entries(stats?.branchCounts || {}).sort((a, b) => b[1] - a[1]);

  const stages = [
    { name: 'New Leads', count: stats?.newLeads || 0, color: 'bg-sky-500' },
    { name: 'Contacted', count: stats?.contactedLeads || 0, color: 'bg-indigo-500' },
    { name: 'Quotation Sent', count: stats?.quoteSentLeads || 0, color: 'bg-amber-500' },
    { name: 'Sample Sent', count: stats?.sampleSentLeads || 0, color: 'bg-purple-500' },
    { name: 'Won Deals', count: stats?.wonLeads || 0, color: 'bg-emerald-500' },
    { name: 'Lost / Dormant', count: stats?.lostLeads || 0, color: 'bg-slate-400' },
  ];

  const [activityTab, setActivityTab] = useState('all'); // 'all' | 'sales' | 'leads' | 'system'

  const allActivities = useMemo(() => {
    return stats?.recentActivities || [];
  }, [stats?.recentActivities]);

  const getActivityMeta = (act) => {
    const type = act.type || 'system';
    switch (type) {
      case 'quotation':
        return {
          label: 'Quotation',
          icon: FileText,
          bg: 'bg-blue-50 text-blue-700 border-blue-200/60',
          dot: 'bg-blue-500',
          category: 'sales',
          isNavigable: true,
        };
      case 'won':
        return {
          label: 'Deal Won',
          icon: Trophy,
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
          dot: 'bg-emerald-500',
          category: 'sales',
          isNavigable: true,
        };
      case 'status_change':
      case 'lead_created':
        return {
          label: 'Pipeline',
          icon: TrendingUp,
          bg: 'bg-amber-50 text-amber-700 border-amber-200/60',
          dot: 'bg-amber-500',
          category: 'leads',
          isNavigable: true,
        };
      case 'lead_import':
        return {
          label: 'Lead Import',
          icon: Users,
          bg: 'bg-teal-50 text-teal-700 border-teal-200/60',
          dot: 'bg-teal-500',
          category: 'leads',
          isNavigable: true,
        };
      case 'call':
      case 'whatsapp':
      case 'note':
        return {
          label: 'Care Desk',
          icon: Headphones,
          bg: 'bg-purple-50 text-purple-700 border-purple-200/60',
          dot: 'bg-purple-500',
          category: 'leads',
          isNavigable: true,
        };
      case 'login':
        return {
          label: 'Staff Sign-In',
          icon: LogIn,
          bg: 'bg-slate-100 text-slate-700 border-slate-200',
          dot: 'bg-slate-400',
          category: 'system',
          isNavigable: false,
        };
      case 'security':
      case 'security_alert':
        return {
          label: 'Security & Auth',
          icon: ShieldCheck,
          bg: 'bg-rose-50 text-rose-700 border-rose-200/60',
          dot: 'bg-rose-500',
          category: 'system',
          isNavigable: false,
        };
      default:
        return {
          label: 'System Log',
          icon: Clock,
          bg: 'bg-slate-50 text-slate-600 border-slate-200',
          dot: 'bg-slate-400',
          category: 'system',
          isNavigable: false,
        };
    }
  };

  const filteredActivities = useMemo(() => {
    if (activityTab === 'all') return allActivities;
    return allActivities.filter((act) => {
      const meta = getActivityMeta(act);
      return meta.category === activityTab;
    });
  }, [allActivities, activityTab]);

  const activityCounts = useMemo(() => {
    let sales = 0;
    let leads = 0;
    let system = 0;
    allActivities.forEach((act) => {
      const meta = getActivityMeta(act);
      if (meta.category === 'sales') sales++;
      else if (meta.category === 'leads') leads++;
      else system++;
    });
    return { all: allActivities.length, sales, leads, system };
  }, [allActivities]);

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 max-w-7xl mx-auto pb-32 sm:pb-36 md:pb-12">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-slate-800 to-red-950 text-white rounded-3xl p-4 sm:p-6 lg:p-8 shadow-xl border border-slate-800">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/20 text-red-300 text-xs font-bold border border-red-500/30 mb-3 shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse"></span>
            <span className="inline-flex items-center gap-1.5">
              <svg className="w-4 h-2.5 rounded-[2px] overflow-hidden shadow-xs shrink-0 border border-white/20" viewBox="0 0 24 16" fill="none">
                <rect width="24" height="16" fill="#ffffff" />
                <rect y="10.66" width="24" height="5.34" fill="#007a3d" />
                <rect y="5.33" width="24" height="5.34" fill="#da121a" />
                <rect width="8" height="16" fill="#da121a" />
                <path d="M4 2.5v5M2.5 4h3M2.8 6l2.4-2.4M5.2 6L2.8 3.6" stroke="#ffffff" strokeWidth="0.75" strokeLinecap="round" />
              </svg>
              <span className="inline-flex items-center gap-1">
                <span className="font-monipack lowercase text-[11px] tracking-normal text-white">monipack</span>
                <span>B2B COMMERCIAL SUITE</span>
              </span>
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-black tracking-tight">
            <span className="font-monipack lowercase tracking-normal">monipack</span> Enterprise Operations
          </h1>
          <p className="mt-2 text-slate-300 text-xs sm:text-sm leading-relaxed max-w-2xl">
            Centralized intelligence for lead pipelines, client quotations, and sales execution across all Sultanate of Oman packaging divisions.
          </p>
          <div className="mt-4 sm:mt-5 flex flex-wrap items-center gap-2.5 sm:gap-3">
            <button
              onClick={() => onNavigate('leads')}
              className="px-3.5 py-2 bg-gradient-to-r from-[#9E0A22] to-[#C8102E] hover:brightness-110 text-white text-xs font-bold rounded-full shadow-md transition flex items-center gap-1.5 active:scale-95 cursor-pointer"
            >
              <span>View Active Pipeline</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onNavigate('quotations')}
              className="px-3.5 py-2 bg-white/10 hover:bg-white/15 text-slate-100 text-xs font-bold rounded-full border border-slate-700 transition flex items-center gap-1.5 active:scale-95 cursor-pointer"
            >
              <span>Issue New Quotation</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Decorative background shape */}
        <div className="absolute right-0 top-0 w-96 h-96 bg-red-600/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
      </div>

      {/* KPI Cards (2x2 on mobile, 4-cols on lg) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 mp-stagger">
        {cards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div
              key={idx}
              onClick={card.action}
              className="bg-white rounded-3xl p-3.5 sm:p-5 border border-slate-200/80 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.04)] hover:border-slate-300 mp-lift cursor-pointer group flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider truncate mr-1">
                  {card.title}
                </span>
                <div className={`w-7 h-7 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center shrink-0 ${card.accent}`}>
                  <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </div>
              </div>
              <div className="mt-2 sm:mt-3">
                <p className="text-[13px] sm:text-xl lg:text-2xl font-black font-mono text-slate-900 tracking-tight group-hover:text-red-600 transition-colors">
                  <CountUp value={card.value} />
                </p>
                <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5 sm:mt-1 truncate">
                  {card.subtext}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pipeline Stages Funnel */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.04)]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">Sales Pipeline Stage Funnel</h3>
            <p className="text-xs text-slate-500">Live distribution of leads through the sales conversion journey</p>
          </div>
          <button
            onClick={() => onNavigate('leads')}
            className="text-xs font-bold text-red-600 hover:text-red-700 flex items-center gap-1"
          >
            <span>Open Pipeline</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {stages.map((stage, i) => (
            <div key={i} className="bg-slate-50 rounded-xl p-3.5 border border-slate-100 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${stage.color}`}></span>
                <span className="text-xs font-semibold text-slate-600">{stage.name}</span>
              </div>
              <p className="text-2xl font-black text-slate-900">{stage.count}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {stats?.totalLeads ? `${((stage.count / stats.totalLeads) * 100).toFixed(0)}%` : '0%'}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Two Column Section: Category Distribution & Oman Branches */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Category Breakdown */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Package className="w-4 h-4 text-red-600" />
                Product Divisions & Leads
              </h3>
              <p className="text-xs text-slate-500">Breakdown by customer product interest</p>
            </div>
          </div>

          <div className="space-y-3.5">
            {categoryEntries.map(([category, count]) => {
              const total = stats?.totalLeads || 1;
              const pct = Math.round((count / total) * 100);

              let barColor = 'bg-red-600';
              if (category.includes('Disposable')) barColor = 'bg-orange-500';
              else if (category.includes('Kohe')) barColor = 'bg-emerald-600';
              else if (category.includes('Cleaning')) barColor = 'bg-cyan-500';
              else if (category.includes('Food')) barColor = 'bg-amber-500';

              return (
                <div 
                  key={category} 
                  className="space-y-1.5 cursor-pointer hover:opacity-85 transition"
                  onClick={() => {
                    if (onSelectCategory) onSelectCategory(category);
                    onNavigate('leads');
                  }}
                >
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-slate-800">{category}</span>
                    <span className="font-mono text-slate-600 font-bold">
                      {count} ({pct}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full mp-bar ${barColor}`}
                      style={{ width: `${pct}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Oman Branches Breakdown */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Building className="w-4 h-4 text-red-600" />
                Regional Distribution across Oman
              </h3>
              <p className="text-xs text-slate-500">
                Leads assigned to <span className="font-monipack lowercase font-bold text-slate-700">monipack</span> regional branch hubs
              </p>
            </div>
            <button
              onClick={() => onNavigate('branches')}
              className="text-xs font-bold text-red-600 hover:text-red-700 flex items-center gap-1"
            >
              <span>All Branches</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {branchEntries.slice(0, 8).map(([branch, count]) => (
              <div
                key={branch}
                onClick={() => {
                  if (onSelectBranch) onSelectBranch(branch);
                  onNavigate('leads');
                }}
                className="p-3 bg-slate-50 hover:bg-red-50/50 border border-slate-200/80 rounded-lg cursor-pointer transition flex items-center justify-between"
              >
                <div>
                  <p className="text-xs font-bold text-slate-800">{branch}</p>
                  <p className="text-[10px] text-slate-500">Branch Office</p>
                </div>
                <span className="px-2 py-0.5 bg-white font-mono font-bold text-xs text-red-700 rounded-md border border-slate-200/80 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.04)]">
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Modernized Recent Activity Feed Center */}
      <div className="bg-white rounded-3xl p-4 sm:p-6 border border-slate-200/80 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.04)]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-red-600" />
              <span>Recent Sales & System Activities</span>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                {allActivities.length} Events
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Live updates, quotation tracking, pipeline advances, and security logs
            </p>
          </div>

          {/* Touch-Friendly Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            {[
              { id: 'all', label: 'All', count: activityCounts.all },
              { id: 'sales', label: 'Sales & Quotes', count: activityCounts.sales },
              { id: 'leads', label: 'Leads & Pipeline', count: activityCounts.leads },
              { id: 'system', label: 'System & Auth', count: activityCounts.system },
            ].map((tab) => {
              const isActive = activityTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActivityTab(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition active:scale-95 cursor-pointer flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200/80 text-slate-600'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                    isActive ? 'bg-white/20 text-white' : 'bg-white text-slate-600 shadow-2xs'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Activity List */}
        <div className="divide-y divide-slate-100">
          {filteredActivities.length > 0 ? (
            filteredActivities.map((act) => {
              const meta = getActivityMeta(act);
              const Icon = meta.icon;
              const isClickable = meta.isNavigable && onNavigate;

              return (
                <div
                  key={act.id}
                  onClick={() => {
                    if (isClickable) {
                      if (act.type === 'quotation') onNavigate('quotations');
                      else onNavigate('leads');
                    }
                  }}
                  className={`py-3 px-2 rounded-xl flex items-start justify-between gap-3 text-xs transition-colors ${
                    isClickable ? 'hover:bg-slate-50/90 cursor-pointer group' : ''
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    {/* Contextual Icon Badge */}
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border shadow-2xs ${meta.bg}`}>
                      <Icon className="w-4 h-4" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${meta.bg}`}>
                          {meta.label}
                        </span>
                        {act.leadName && (
                          <span className="font-bold text-slate-900 text-xs truncate">
                            {act.leadName}
                          </span>
                        )}
                      </div>

                      <p className="text-xs font-medium text-slate-800 mt-1 leading-snug break-words">
                        {act.description}
                      </p>
                    </div>
                  </div>

                  {/* Timestamp & Deep Link Arrow */}
                  <div className="flex flex-col items-end shrink-0 pl-2">
                    <span className="text-[11px] text-slate-500 font-mono font-semibold">
                      {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {isClickable && (
                      <span className="text-[10px] text-red-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 mt-1">
                        <span>View</span>
                        <ChevronRight className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-8 text-center space-y-2">
              <Clock className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs text-slate-500 font-medium">
                No activities found under the "{activityTab}" category.
              </p>
              {activityTab !== 'all' && (
                <button
                  type="button"
                  onClick={() => setActivityTab('all')}
                  className="text-xs font-bold text-red-600 hover:text-red-700 underline cursor-pointer"
                >
                  View All Activities
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
