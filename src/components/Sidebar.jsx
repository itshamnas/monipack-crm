import React from 'react';
import { roleLabel } from '../auth/roles.js';
import BrandWordmark from './BrandWordmark';
import InstallPromptButton from './pwa/InstallPromptButton.jsx';
import { 
  LayoutDashboard, 
  Users, 
  FileText, 
  Package, 
  Building2, 
  ExternalLink,
  MapPin,
  Plus,
  Settings,
  Headphones,
  X,
  LogOut,
  ChevronDown,
  ContactRound
} from 'lucide-react';

/**
 * monipack Enterprise CRM - Unified Navigation Sidebar & Mobile Drawer
 * Morooj Nizwa International LLC - Sultanate of Oman
 * Modern B2B SaaS Design System
 */
export default function Sidebar({ 
  activeTab, 
  setActiveTab, 
  stats, 
  selectedBranch, 
  setSelectedBranch, 
  branches = [],
  currentUser,
  onNewLead,
  onNewQuote,
  onCloseMobileDrawer,
  onLogout
}) {
  const canOpenSettings = Boolean(currentUser?.permissions?.includes('settings.manage'));

  const coreOperations = [
    { id: 'dashboard', label: 'Executive Dashboard', icon: LayoutDashboard },
    { 
      id: 'customercare', 
      label: 'Customer Care Desk', 
      icon: Headphones, 
      badge: stats?.newLeads || 0,
      highlight: true
    },
    { 
      id: 'leads', 
      label: 'Leads & Pipeline', 
      icon: Users, 
      badge: stats?.totalLeads || 0 
    },
    { 
      id: 'quotations', 
      label: 'Official Quotations', 
      icon: FileText,
      badge: stats?.totalQuotations || 0
    },
  ];

  const canViewCustomers = Boolean(currentUser?.permissions?.includes('customers.view'));

  const networkOperations = [
    ...(canViewCustomers ? [{ id: 'customers', label: 'Customer Data', icon: ContactRound }] : []),
    { id: 'products', label: 'Product Catalog', icon: Package },
    { 
      id: 'branches', 
      label: 'Oman Branches', 
      icon: Building2,
      badge: branches?.length > 0 ? branches.length : 10
    },
  ];

  const systemOperations = canOpenSettings
    ? [{ id: 'settings', label: 'System Settings', icon: Settings }]
    : [];

  const handleSelectTab = (tabId) => {
    setActiveTab(tabId);
    if (onCloseMobileDrawer) onCloseMobileDrawer();
  };

  const handleSelectBranch = (branchVal) => {
    setSelectedBranch(branchVal);
    if (onCloseMobileDrawer) onCloseMobileDrawer();
  };

  const renderNavItem = (item) => {
    const Icon = item.icon;
    const isActive = activeTab === item.id;
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => handleSelectTab(item.id)}
        className={`group w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 active:scale-98 cursor-pointer ${
          isActive
            ? 'bg-red-50 text-[#CC1A22] font-bold shadow-xs border border-red-200/60'
            : 'text-slate-600 hover:text-slate-950 hover:bg-slate-100/70'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <Icon className={`w-4 h-4 shrink-0 transition-transform duration-150 ${
            isActive ? 'text-[#CC1A22] stroke-[2.5]' : 'text-slate-400 group-hover:text-slate-700 stroke-2'
          }`} />
          <span className="truncate">{item.label}</span>
        </div>
        {item.badge !== undefined && item.badge > 0 && (
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-bold font-mono shrink-0 transition-colors ${
              isActive
                ? 'bg-red-100 text-[#CC1A22]'
                : item.highlight
                ? 'bg-red-50 text-[#CC1A22] border border-red-200/50'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            {item.badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <div 
      className="w-full h-full flex flex-col bg-white border-r border-surface-silver select-none shrink-0"
      style={{
        backgroundColor: 'var(--color-component-bg, #FFFFFF)',
        borderColor: 'var(--color-surface-silver, #E5E7EB)'
      }}
    >
      {/* 1. Header: Monipack Logo, B2B CRM Badge, & Mobile Close */}
      <div 
        className="p-4 border-b border-surface-silver bg-white"
        style={{ borderColor: 'var(--color-surface-silver, #E5E7EB)' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a 
              href="/"
              className="shrink-0 transition-transform hover:scale-105 active:scale-95 block focus:outline-hidden"
              title="monipack Home"
            >
              <img 
                src="/assets/logo.png" 
                alt="monipack" 
                className="w-10 h-10 max-h-[40px] max-w-[40px] aspect-square object-contain drop-shadow-xs"
                onError={(e) => {
                  e.target.src = '/assets/logo.svg';
                }} 
              />
            </a>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-monipack text-lg tracking-tight text-slate-900 leading-none">
                  monipack
                </span>
                <span 
                  className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-red-50 text-[#CC1A22] border border-red-200/60 uppercase tracking-wider"
                >
                  CRM
                </span>
              </div>
              <p className="text-[11px] font-medium text-slate-500 truncate">
                Morooj Nizwa Int. LLC
              </p>
            </div>
          </div>

          {/* Mobile Close Button (< md only) */}
          {onCloseMobileDrawer && (
            <button
              type="button"
              onClick={onCloseMobileDrawer}
              className="p-2 md:hidden text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition active:scale-95 cursor-pointer"
              title="Close Navigation Drawer"
              aria-label="Close Navigation Drawer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Modern Oman Branch Switcher */}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1.5 px-0.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <MapPin className="w-3 h-3 text-[#CC1A22]" />
              <span>Active Oman Branch</span>
            </label>
            <span className="text-[9px] font-mono font-bold text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded">
              {branches.length || 10} Hubs
            </span>
          </div>
          <div className="relative">
            <select
              value={selectedBranch}
              onChange={(e) => handleSelectBranch(e.target.value)}
              className="w-full appearance-none bg-slate-50 hover:bg-slate-100/80 text-xs font-semibold text-slate-800 rounded-xl pl-3 pr-8 py-2 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-[#CC1A22] transition cursor-pointer shadow-2xs"
            >
              <option value="all">All Oman Branches & Reps ({branches.length || 10})</option>
              {branches.map((b) => (
                <option key={b.id || b.name} value={b.id || b.name}>
                  {b.name}{b.city ? ` (${b.city})` : ''}{b.salesman ? ` — Rep: ${b.salesman}` : ''}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" />
          </div>
        </div>
      </div>

      {/* 2. Quick Action Buttons */}
      <div 
        className="p-3 grid grid-cols-2 gap-2 border-b border-surface-silver bg-white"
        style={{ borderColor: 'var(--color-surface-silver, #E5E7EB)' }}
      >
        <button
          type="button"
          onClick={() => {
            onNewLead();
            if (onCloseMobileDrawer) onCloseMobileDrawer();
          }}
          className="flex items-center justify-center gap-1.5 py-2.5 px-2.5 bg-[#CC1A22] hover:bg-[#b0161d] text-white text-xs font-bold rounded-xl shadow-xs transition active:scale-95 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>New Lead</span>
        </button>
        <button
          type="button"
          onClick={() => {
            onNewQuote();
            if (onCloseMobileDrawer) onCloseMobileDrawer();
          }}
          className="flex items-center justify-center gap-1.5 py-2.5 px-2.5 bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-bold rounded-xl border border-slate-200 transition active:scale-95 cursor-pointer shadow-2xs"
        >
          <FileText className="w-3.5 h-3.5 text-[#CC1A22]" />
          <span>New Quote</span>
        </button>
      </div>

      {/* 3. Grouped Navigation Menu */}
      <nav className="flex-1 py-3 px-3 space-y-4 overflow-y-auto">
        {/* Core Operations */}
        <div>
          <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
            Core Operations
          </p>
          <div className="space-y-1">
            {coreOperations.map(renderNavItem)}
          </div>
        </div>

        {/* Inventory & Network */}
        <div>
          <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
            Network & Catalog
          </p>
          <div className="space-y-1">
            {networkOperations.map(renderNavItem)}
          </div>
        </div>

        {/* System Settings (Super Admin Only) */}
        {systemOperations.length > 0 && (
          <div>
            <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              System Admin
            </p>
            <div className="space-y-1">
              {systemOperations.map(renderNavItem)}
            </div>
          </div>
        )}

        {/* Monipack Ecosystem Portals Card */}
        <div className="pt-1">
          <div className="bg-slate-50/80 rounded-xl p-2.5 border border-slate-200/70 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1 mb-1 flex items-center gap-1">
              <span className="font-monipack lowercase text-[11px] tracking-normal text-slate-500">monipack</span>
              <span>Ecosystem</span>
            </p>
            <a
              href="https://www.monipack.com"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-950 hover:bg-white transition shadow-none hover:shadow-2xs group"
            >
              <span className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span><span className="font-monipack lowercase text-[13px]">monipack</span>.com</span>
              </span>
              <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-slate-700" />
            </a>
            <a
              href="https://www.shop.monipack.com"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-950 hover:bg-white transition shadow-none hover:shadow-2xs group"
            >
              <span className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                <span>shop.<span className="font-monipack lowercase text-[13px]">monipack</span>.com</span>
              </span>
              <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-slate-700" />
            </a>
          </div>
        </div>
      </nav>

      {/* 4. Unified Executive User Profile & System Status Footer */}
      <div 
        className="p-3 border-t border-surface-silver bg-slate-50/80 shrink-0"
        style={{ borderColor: 'var(--color-surface-silver, #E5E7EB)' }}
      >
        {/* PWA Install Action */}
        <InstallPromptButton variant="sidebar" className="mb-2.5" />

        {currentUser && (
          <div className="flex items-center justify-between gap-2.5 mb-2.5">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-600 to-rose-700 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-xs tracking-tight">
                {currentUser.name ? currentUser.name.split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase() : 'MP'}
              </div>
              <div className="min-w-0 flex-1">
                <p 
                  className="text-xs font-bold text-slate-900 truncate leading-snug"
                  title={currentUser.name}
                >
                  <BrandWordmark>{currentUser.name || 'monipack user'}</BrandWordmark>
                </p>
                <p className="text-[10px] font-semibold text-slate-400 capitalize truncate">
                  {roleLabel(currentUser.role)}
                </p>
              </div>
            </div>
            {onLogout && (
              <button
                type="button"
                onClick={() => {
                  if (onCloseMobileDrawer) onCloseMobileDrawer();
                  onLogout();
                }}
                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl border border-transparent hover:border-red-200 transition active:scale-95 cursor-pointer shrink-0"
                title="Sign Out of monipack CRM"
                aria-label="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Integrated HQ Status & Hotline */}
        <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-400 font-medium">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-slate-600 font-semibold">Ghala HQ</span>
          </span>
          <a 
            href="tel:+96879062219" 
            className="hover:text-red-700 transition font-mono font-semibold"
            title="Call Monipack HQ"
          >
            +968 79062219
          </a>
        </div>
      </div>
    </div>
  );
}
