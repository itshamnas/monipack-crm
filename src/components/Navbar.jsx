import React, { useEffect, useRef, useState } from 'react';
import { roleLabel } from '../auth/roles.js';
import BrandLogo from './BrandLogo';
import BrandWordmark from './BrandWordmark';
import InstallPromptButton from './pwa/InstallPromptButton.jsx';
import HeaderToggles from './ui/HeaderToggles.jsx';
import MomentumChip from './ui/MomentumChip.jsx';
import { 
  Search, 
  RefreshCw, 
  LogOut, 
  ShieldCheck, 
  ShieldAlert, 
  User, 
  Menu, 
  X 
} from 'lucide-react';

export default function Navbar({ 
  title, 
  shortTitle,
  subtitle, 
  searchQuery, 
  setSearchQuery, 
  onRefresh, 
  loading, 
  stats, 
  currentUser, 
  onLogout,
  onOpenMobileDrawer
}) {
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const searchRef = useRef(null);
  // Ctrl/Cmd + K jumps to search (like Linear / Slack)
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (searchRef.current && searchRef.current.offsetParent) searchRef.current.focus();
        else setIsMobileSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const userName = currentUser?.name || 'monipack user';
  const userInitials = userName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  return (
    <div 
      className="relative h-16 px-3 sm:px-6 border-b border-surface-silver flex items-center justify-between shrink-0 shadow-xs z-20 select-none"
      style={{
        borderColor: 'var(--color-surface-silver, #E5E7EB)'
      }}
    >
      {/* Left: Mobile Drawer Trigger + Brand Logo (mobile) + Responsive Page Title */}
      <div className="flex items-center gap-2 sm:gap-3.5 min-w-0 pr-2 sm:pr-4">
        {/* Hamburger Toggle (mobile only) */}
        {onOpenMobileDrawer && (
          <button
            type="button"
            onClick={onOpenMobileDrawer}
            className="hidden w-9 h-9 flex items-center justify-center text-slate-700 bg-white/80 hover:bg-slate-100 rounded-xl border border-slate-200 transition active:scale-95 cursor-pointer shrink-0 shadow-xs"
            aria-label="Open Navigation Drawer"
            title="Open Menu"
          >
            <Menu className="w-4 h-4 text-slate-700" />
          </button>
        )}

        {/* Brand Logo: Shown on mobile (on desktop, sidebar already displays the brand logo) */}
        <BrandLogo sizeClass="h-7 w-7 lg:hidden aspect-square object-contain drop-shadow-xs shrink-0" />

        <div className="min-w-0">
          <h2 
            className="text-sm sm:text-[15px] font-bold text-slate-900 leading-tight truncate mp-display"
          >
            <span className="sm:hidden">{shortTitle || title}</span>
            <span className="hidden sm:inline">{title}</span>
          </h2>
          <p 
            className="text-[10px] sm:text-xs text-slate-500 truncate leading-none mt-0.5"
          >
            <span className="sm:hidden"><span className="font-monipack lowercase">monipack</span> CRM</span>
            <span className="hidden sm:inline">{subtitle || 'Morooj Nizwa International LLC'}</span>
          </p>
        </div>
      </div>

      {/* Right: Search, Refresh, Pipeline Pill, and User Profile */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        
        {/* Desktop Search Input (hidden on mobile) */}
        <div className="relative hidden lg:block w-40 xl:w-56 2xl:w-72">
          <Search 
            className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" 
          />
          <input
            ref={searchRef}
            type="text"
            placeholder="Search leads, phone, quotes…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-[13px] rounded-xl pl-9 pr-14 h-10 bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 transition-all placeholder:text-slate-400 text-slate-800 focus:outline-none focus:ring-4 focus:ring-red-500/10 focus:border-red-500"
          />
          {!searchQuery && <kbd className="mp-kbd absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none hidden xl:block">Ctrl K</kbd>}
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold p-1 cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        {/* Mobile Search Icon Toggle (visible only on mobile) */}
        <button
          type="button"
          onClick={() => setIsMobileSearchOpen(!isMobileSearchOpen)}
          className="lg:hidden w-10 h-10 flex items-center justify-center text-slate-600 hover:text-slate-900 bg-white/80 hover:bg-slate-100 rounded-xl border border-slate-200 transition active:scale-95 cursor-pointer shadow-xs"
          title={isMobileSearchOpen ? 'Close Search' : 'Search Leads'}
        >
          {isMobileSearchOpen ? (
            <X className="w-4 h-4 text-red-600" />
          ) : (
            <Search className="w-4 h-4 text-slate-600" />
          )}
        </button>

        {/* Today's progress + streak */}
        <MomentumChip currentUser={currentUser} />

        {/* PWA Install Button (Header) */}
        <InstallPromptButton variant="header" />

        {/* Sound + theme switches (on phones they live in the Menu) */}
        <div className="hidden sm:flex items-center gap-1.5 sm:gap-2.5">
          <HeaderToggles />
        </div>

        {/* Sync / Refresh Button */}
        <button
          onClick={onRefresh}
          title="Refresh Data"
          disabled={loading}
          className="w-10 h-10 sm:w-9 sm:h-9 flex items-center justify-center text-slate-600 hover:text-slate-900 bg-white/80 hover:bg-slate-100 rounded-xl border border-slate-200 transition active:scale-95 disabled:opacity-50 cursor-pointer shadow-xs"
        >
          <RefreshCw 
            className={`w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-600 ${loading ? 'animate-spin text-red-600' : ''}`}
          />
        </button>

        {/* Commercial Pipeline Snapshot Pill (Large screens only) */}
        <div 
          className="hidden 2xl:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border bg-red-500/[0.04] border-red-500/20"
        >
          <span className="font-medium text-red-600">
            Pipeline:
          </span>
          <span className="font-extrabold text-slate-900">
            OMR {(stats?.totalPipelineValueOMR || 0).toLocaleString('en-US', { minimumFractionDigits: 3 })}
          </span>
        </div>

        {/* User Profile & Role Info */}
        <div 
          className="flex items-center gap-2 sm:gap-3 pl-1 sm:pl-2.5 sm:border-l sm:border-slate-200"
        >
          {/* User Avatar (On mobile, tap triggers sign out prompt/action) */}
          <button
            type="button"
            onClick={() => (onOpenMobileDrawer && window.innerWidth < 1024 ? onOpenMobileDrawer() : onLogout())}
            className="w-10 h-10 sm:w-9 sm:h-9 rounded-full bg-red-600 text-white flex items-center justify-center font-bold text-xs shadow-xs hover:ring-2 hover:ring-red-400/50 transition cursor-pointer shrink-0"
            title={`${userName} • Menu and sign out`}
          >
            {userInitials || <User className="w-3.5 h-3.5 text-white" />}
          </button>

          <div className="hidden sm:flex lg:hidden xl:flex flex-col text-left">
            <span 
              className="text-xs font-bold leading-tight truncate max-w-[120px] text-slate-900"
            >
              <BrandWordmark>{userName}</BrandWordmark>
            </span>
            <div className="flex items-center gap-1 mt-0.5">
              {isSuperAdmin ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded-full border border-emerald-200">
                  <ShieldCheck className="w-3 h-3 text-emerald-600" />
                  Super Admin
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded-full border border-amber-200">
                  <ShieldAlert className="w-3 h-3 text-amber-600" />
                  {roleLabel(currentUser?.role)}
                </span>
              )}
            </div>
          </div>

          {/* Sign Out Action Button (Desktop only) */}
          <button
            onClick={onLogout}
            title="Sign Out of monipack CRM"
            className="hidden sm:flex p-1.5 sm:p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl border border-slate-200 transition active:scale-95 cursor-pointer shadow-xs"
          >
            <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>
      </div>

      {/* Mobile Collapsible Search Bar Overlay */}
      {isMobileSearchOpen && (
        <div 
          className="absolute top-16 left-0 right-0 p-3 bg-white border-b border-surface-silver shadow-md z-30 lg:hidden animate-in slide-in-from-top-2 duration-150"
          style={{ borderColor: 'var(--color-surface-silver, #E5E7EB)' }}
        >
          <div className="relative">
            <Search 
              className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" 
              style={{ color: 'var(--color-text-muted, #6B7280)' }}
            />
            <input
              type="text"
              autoFocus
              placeholder="Search leads, phone, wilayat, quotes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-base sm:text-sm rounded-xl pl-9 pr-8 py-3 border transition-all placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20"
              style={{
                backgroundColor: 'var(--color-app-bg, #F3F4F6)',
                borderColor: 'var(--color-surface-silver, #E5E7EB)',
                color: 'var(--color-text-main, #111827)'
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
