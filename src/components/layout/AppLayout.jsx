import React from 'react';
import OfflineBanner from '../pwa/OfflineBanner.jsx';

/**
 * monipack Enterprise CRM - Global Layout Wrapper
 * Morooj Nizwa International LLC
 * 
 * SaaS Structural Architecture with Full Mobile Responsiveness:
 * - Desktop: Fixed Left Sidebar (250px) + Sticky Top Header + Scrollable Canvas
 * - Mobile: Hidden desktop sidebar, Animated Slide-Over Drawer with backdrop,
 *   Sticky Top Header with hamburger button, and Fixed Mobile Bottom Navigation Bar.
 */
export default function AppLayout({
  sidebar,
  header,
  children,
  notifications,
  mobileBottomNav,
  isMobileDrawerOpen = false,
  onCloseMobileDrawer = () => {},
  className = '',
}) {
  return (
    <div
      id="monipack-enterprise-root"
      className={`flex flex-col h-screen w-screen overflow-hidden bg-app-bg text-text-main font-sans antialiased ${className}`}
      style={{
        backgroundColor: 'var(--color-app-bg, #F3F4F6)',
        color: 'var(--color-text-main, #111827)',
      }}
    >
      {/* PWA System Status Banner */}
      <OfflineBanner />

      {/* Toast Notifications Layer */}
      {notifications}

      <div className="flex flex-1 w-full min-h-0 overflow-hidden relative">
        {/* 1. Desktop Fixed Left Sidebar (hidden on mobile, visible from md:) */}
        {sidebar && (
          <aside
            id="monipack-sidebar-region"
            aria-label="monipack Sidebar Navigation"
            className="hidden lg:flex w-[260px] min-w-[260px] max-w-[260px] h-full flex-col bg-white border-r border-surface-silver shrink-0 select-none z-30 relative"
            style={{
              width: 'var(--sidebar-width, 260px)',
              backgroundColor: 'var(--color-component-bg, #FFFFFF)',
              borderColor: 'var(--color-surface-silver, #E5E7EB)',
            }}
          >
            {sidebar}
          </aside>
        )}

      {/* 2. Mobile Slide-Over Drawer & Backdrop */}
      {sidebar && (
        <div
          id="monipack-mobile-drawer-wrapper"
          className={`fixed inset-0 z-50 lg:hidden transition-all duration-300 ${
            isMobileDrawerOpen ? 'visible pointer-events-auto' : 'invisible pointer-events-none'
          }`}
          aria-hidden={!isMobileDrawerOpen}
        >
          {/* Backdrop Blur */}
          <div
            className={`fixed inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity duration-300 ${
              isMobileDrawerOpen ? 'opacity-100' : 'opacity-0'
            }`}
            onClick={onCloseMobileDrawer}
          />

          {/* Drawer Content Panel */}
          <div
            className={`fixed inset-y-0 left-0 w-[310px] sm:w-[320px] max-w-[88vw] h-full bg-white shadow-2xl flex flex-col z-50 transform transition-transform duration-300 ease-out ${
              isMobileDrawerOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
            style={{ backgroundColor: 'var(--color-component-bg, #FFFFFF)' }}
          >
            {sidebar}
          </div>
        </div>
      )}

      {/* 3. Dynamic Main Content Area */}
      <div
        id="monipack-viewport-region"
        className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-app-bg relative"
        style={{ backgroundColor: 'var(--color-app-bg, #F3F4F6)' }}
      >
        {/* Sticky Top Header inside Main Content Area */}
        {header && (
          <header
            id="monipack-header-region"
            aria-label="monipack Global Header"
            className="sticky top-0 z-20 shrink-0 bg-white border-b border-surface-silver"
            style={{
              backgroundColor: 'var(--color-component-bg, #FFFFFF)',
              borderColor: 'var(--color-surface-silver, #E5E7EB)',
            }}
          >
            {header}
          </header>
        )}

        {/* Dynamic Main Content Canvas (includes pb-20 on mobile to leave clearance for bottom nav) */}
        <main
          id="monipack-content-canvas"
          className="flex-1 overflow-y-auto bg-app-bg focus:outline-none mp-main-pad"
          tabIndex={-1}
          style={{ backgroundColor: 'var(--color-app-bg, #F3F4F6)' }}
        >
          {children}
        </main>

        {/* Mobile Bottom Navigation Bar (< md only) */}
        {mobileBottomNav}
      </div>
      </div>
    </div>
  );
}
