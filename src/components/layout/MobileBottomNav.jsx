import React from 'react';
import { LayoutDashboard, ContactRound, Users, FileText, Menu } from 'lucide-react';
import { sectionOf } from './navigation.js';

/**
 * monipack Enterprise CRM - Mobile Bottom Navigation Bar
 * Fixed thumb-zone navigation optimized for mobile viewports (< 768px).
 * Supports iOS Safe Area insets and live unread notification counters.
 */
export default function MobileBottomNav({
  activeTab,
  onTabChange,
  onOpenDrawer,
  stats,
  currentUser,
}) {
  const newLeadsBadge = stats?.newLeads ?? 0;

  const canCustomers = Boolean(currentUser?.permissions?.includes('customers.view'));
  const navItems = [
    { id: 'dashboard', section: 'home', label: 'Home', icon: LayoutDashboard, badge: null },
    ...(canCustomers ? [{ id: 'customers', section: 'customers', label: 'Customers', icon: ContactRound, badge: null }] : []),
    {
      id: 'leads', section: 'leads', label: 'Leads', icon: Users,
      badge: newLeadsBadge > 0 ? (newLeadsBadge > 99 ? '99+' : newLeadsBadge) : null,
      badgeColor: 'bg-[#CC1A22] text-white',
    },
    { id: 'quotations', section: 'quotations', label: 'Quotes', icon: FileText, badge: null },
  ];
  const activeSection = sectionOf(activeTab, currentUser)?.id;

  return (
    <nav
      id="monipack-mobile-bottom-nav"
      aria-label="Mobile Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-surface-silver shadow-lg select-none"
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: 'var(--color-surface-silver, #E5E7EB)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="flex items-center justify-around h-16 px-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.section;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange(item.id)}
              className={`flex-1 flex flex-col items-center justify-center h-full py-1 relative transition-colors duration-150 active:scale-95 cursor-pointer ${
                isActive
                  ? 'text-[#CC1A22] font-black'
                  : 'text-slate-500 hover:text-slate-900 font-semibold'
              }`}
            >
              {/* Badge indicator */}
              {item.badge && (
                <span
                  className={`absolute top-1.5 right-[24%] sm:right-[30%] min-w-4 h-4 px-1 rounded-full text-[9px] font-black flex items-center justify-center leading-none shadow-xs ${
                    item.badgeColor || 'bg-[#CC1A22] text-white'
                  }`}
                >
                  {item.badge}
                </span>
              )}

              <Icon
                className={`w-5 h-5 transition-transform ${
                  isActive ? 'scale-110 stroke-[2.5]' : 'stroke-2'
                }`}
                style={isActive ? { color: 'var(--color-primary, #CC1A22)' } : undefined}
              />
              <span className="text-[10px] tracking-tight mt-0.5 leading-none">
                {item.label}
              </span>

              {/* Active bottom pip indicator */}
              {isActive && (
                <span
                  className="absolute bottom-1 w-6 h-0.5 rounded-full bg-[#CC1A22]"
                  style={{ backgroundColor: 'var(--color-primary, #CC1A22)' }}
                />
              )}
            </button>
          );
        })}

        {/* 5th Tab: Menu / Drawer Trigger */}
        <button
          type="button"
          onClick={onOpenDrawer}
          className="flex-1 flex flex-col items-center justify-center h-full py-1 text-slate-500 hover:text-slate-900 font-semibold transition-colors duration-150 active:scale-95 cursor-pointer"
        >
          <Menu className="w-5 h-5 stroke-2" />
          <span className="text-[10px] tracking-tight mt-0.5 leading-none">
            Menu
          </span>
        </button>
      </div>
    </nav>
  );
}
