import React, { useLayoutEffect, useRef, useState } from 'react';
import { roleLabel } from '../auth/roles.js';
import BrandWordmark from './BrandWordmark';
import InstallPromptButton from './pwa/InstallPromptButton.jsx';
import HeaderToggles from './ui/HeaderToggles.jsx';
import BranchPicker from './ui/BranchPicker.jsx';
import { navFor } from './layout/navigation.js';
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
  ContactRound,
  ListChecks,
  Inbox,
  Kanban
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
  onLogout,
  taskDue = 0
}) {
  // Simplified menu: Home · Customers · Leads · Quotations · Settings
  const ICONS = { home: LayoutDashboard, inbox: Inbox, leads: Kanban, customers: ContactRound, quotations: FileText, tasks: ListChecks, settings: Settings };
  const BADGES = { inbox: stats?.newLeads || 0, quotations: 0, tasks: taskDue || 0 };
  const mainItems = navFor(currentUser).map((sec) => ({
    id: sec.pages[0].id,
    pages: sec.pages.map((p) => p.id),
    label: sec.label,
    icon: ICONS[sec.id] || LayoutDashboard,
    badge: BADGES[sec.id],
    highlight: sec.id === 'inbox' || sec.id === 'tasks',
  }));

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
    const isActive = item.pages ? item.pages.includes(activeTab) : activeTab === item.id;
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => handleSelectTab(item.id)}
        className={`mp-nav-item${isActive ? ' on' : ''}`}
        title={item.label}
        aria-current={isActive ? 'page' : undefined}
      >
        <Icon className={`mp-nav-ic${isActive ? ' mp-hop' : ''}`} key={isActive ? 'on' : 'off'} aria-hidden="true" />
        <span className="mp-nav-label">{item.label}</span>
        {item.badge !== undefined && item.badge > 0 && (
          <em className={`mp-nav-ct${item.highlight ? ' hot' : ''}`}>{item.badge}</em>
        )}
      </button>
    );
  };

  // One highlight that glides to the active menu item
  const navRef = useRef(null);
  const [glide, setGlide] = useState(null);
  useLayoutEffect(() => {
    const place = () => {
      const on = navRef.current?.querySelector('.mp-nav-item.on');
      setGlide(on ? { top: on.offsetTop, height: on.offsetHeight } : null);
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [activeTab]);

  const initials = currentUser?.name ? currentUser.name.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase() : 'MP';

  return (
    <div className="mp-side">
      {/* Brand */}
      <div className="mp-side-brand">
        <a href="/" className="mp-side-logo" title="monipack Home">
          <img src="/assets/logo.png" alt="monipack" onError={(e) => { e.target.src = '/assets/logo.svg'; }} />
          <span className="mp-side-name">
            <b><span className="font-monipack">monipack</span><i>CRM</i></b>
            <small>Morooj Nizwa Int. LLC</small>
          </span>
        </a>
        {onCloseMobileDrawer && (
          <button type="button" onClick={onCloseMobileDrawer} className="mp-side-close lg:hidden" title="Close menu" aria-label="Close menu">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Branch & rep switcher */}
      <div className="mp-side-ws">
        <span className="mp-side-h"><MapPin className="w-3 h-3" /> Active branch</span>
        <BranchPicker variant="dark" value={selectedBranch} onChange={handleSelectBranch} branches={branches} allLabel="All branches & reps" />
      </div>

      {/* Quick create */}
      <div className="mp-side-create">
        <button
          type="button"
          onClick={() => { onNewLead(); if (onCloseMobileDrawer) onCloseMobileDrawer(); }}
          className="mp-side-new"
          title="New enquiry"
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          <span>New enquiry</span>
        </button>
        <button
          type="button"
          onClick={() => { onNewQuote(); if (onCloseMobileDrawer) onCloseMobileDrawer(); }}
          className="mp-side-quote"
          title="New quote"
        >
          <FileText className="w-4 h-4" />
          <span>New quote</span>
        </button>
      </div>

      {/* Navigation */}
      <nav ref={navRef} className={`mp-side-nav${glide ? ' has-glider' : ''}`} aria-label="Main">
        {glide && <span className="mp-nav-glider" style={{ top: glide.top, height: glide.height }} aria-hidden="true" />}
        <span className="mp-side-h">Workspace</span>
        {mainItems.map(renderNavItem)}

        <div className="mp-side-eco">
          <span className="mp-side-h"><span className="font-monipack">monipack</span> ecosystem</span>
          <a href="https://www.monipack.com" target="_blank" rel="noreferrer">
            <i style={{ background: '#22c55e' }} /><span><span className="font-monipack">monipack</span>.com</span><ExternalLink className="w-3 h-3" />
          </a>
          <a href="https://www.shop.monipack.com" target="_blank" rel="noreferrer">
            <i style={{ background: '#3b82f6' }} /><span>shop.<span className="font-monipack">monipack</span>.com</span><ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </nav>

      {/* Footer */}
      <div className="mp-side-foot">
        {/* Sound + theme switches (phones; on bigger screens they sit in the header) */}
        <div className="sm:hidden flex items-center gap-2 mb-2.5 mp-side-toggles">
          <HeaderToggles labels />
        </div>

        <InstallPromptButton variant="sidebar" className="mb-2.5 mp-side-install" />

        {currentUser && (
          <div className="mp-side-me">
            <span className="mp-side-av">{initials}</span>
            <span className="mp-side-me-txt">
              <b title={currentUser.name}><BrandWordmark>{currentUser.name || 'monipack user'}</BrandWordmark></b>
              <small>{roleLabel(currentUser.role)}</small>
            </span>
            {onLogout && (
              <button
                type="button"
                onClick={() => { if (onCloseMobileDrawer) onCloseMobileDrawer(); onLogout(); }}
                className="mp-side-out"
                title="Sign out of monipack CRM"
                aria-label="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        <div className="mp-side-hq">
          <span><i /> Ghala HQ</span>
          <a href="tel:+96879062219" title="Call Monipack HQ">+968 79062219</a>
        </div>
      </div>
    </div>
  );
}
