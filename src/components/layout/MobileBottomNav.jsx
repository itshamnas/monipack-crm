import React from 'react';
import { LayoutDashboard, Inbox, Kanban, Menu, Plus, ListChecks, FileText } from 'lucide-react';
import { sectionOf } from './navigation.js';

/**
 * Bottom bar for phones and upright tablets (< 1024 px).
 * Always 2 buttons · the red + · 2 buttons, in five equal columns, so the + sits in the exact centre
 * on every screen width. The four buttons depend on the person's job; everything else is under Menu.
 *
 * The + is contextual: on Customers it adds a customer, on Quotations a quotation, on Tasks a task;
 * anywhere else it adds a new enquiry. (Pages listen for the cancellable "mp:add" event.)
 */
const ITEMS = {
  dashboard: { section: 'home', label: 'Home', icon: LayoutDashboard },
  customercare: { section: 'inbox', label: 'Inbox', icon: Inbox },
  leads: { section: 'leads', label: 'Pipeline', icon: Kanban },
  quotations: { section: 'quotations', label: 'Quotes', icon: FileText },
  tasks: { section: 'tasks', label: 'Tasks', icon: ListChecks, perm: 'tasks.use' },
};

/** Four destinations per job: the last one is always Menu. */
export function bottomBarFor(user) {
  const role = user?.role;
  if (role === 'customer_care') return ['customercare', 'leads', 'quotations'];
  if (role === 'salesman') return ['dashboard', 'leads', 'tasks'];
  return ['dashboard', 'customercare', 'leads'];
}

export default function MobileBottomNav({
  activeTab,
  onTabChange,
  onOpenDrawer,
  stats,
  currentUser,
  onNewLead,
  taskDue = 0,
}) {
  const count = (n) => (n > 0 ? (n > 99 ? '99+' : n) : null);
  const badges = { customercare: count(stats?.newLeads ?? 0), tasks: count(taskDue) };
  const allowed = (id) => !ITEMS[id].perm || currentUser?.permissions?.includes(ITEMS[id].perm);
  const ids = bottomBarFor(currentUser).filter(allowed);
  // Always three destinations + Menu, so the + stays in the centre column
  for (const extra of ['dashboard', 'leads', 'quotations', 'customercare']) if (ids.length < 3 && !ids.includes(extra) && allowed(extra)) ids.push(extra);
  const activeSection = sectionOf(activeTab, currentUser)?.id;
  const tasksHidden = !ids.includes('tasks') && taskDue > 0;
  const menuActive = !ids.some((id) => ITEMS[id].section === activeSection);

  const add = () => {
    const ev = new CustomEvent('mp:add', { cancelable: true, detail: { tab: activeTab } });
    window.dispatchEvent(ev);
    if (!ev.defaultPrevented) onNewLead?.();
  };
  const addLabel = { customers: 'Add customer', quotations: 'New quotation', tasks: 'New task' }[activeTab] || 'New enquiry';

  const Tab = ({ id }) => {
    const it = ITEMS[id];
    const Icon = it.icon;
    const on = activeSection === it.section;
    return (
      <button type="button" onClick={() => onTabChange(id)} aria-current={on ? 'page' : undefined}
        className={`mp-bn-tab ${on ? 'on' : ''}`}>
        <span className="mp-bn-ic">
          <Icon key={on ? 'on' : 'off'} className={`w-[22px] h-[22px] ${on ? 'mp-hop' : ''}`} strokeWidth={on ? 2.4 : 1.9} />
          {badges[id] && <span className="mp-bn-badge">{badges[id]}</span>}
        </span>
        <span className="mp-bn-lbl">{it.label}</span>
      </button>
    );
  };
  const left = ids.slice(0, 2);
  const right = ids.slice(2, 3);

  return (
    <nav id="monipack-mobile-bottom-nav" aria-label="Main" className="lg:hidden mp-bn no-print">
      <div className="mp-bn-grid">
        {left.map((id) => <Tab key={id} id={id} />)}
        <span className="mp-bn-mid">
          <button type="button" onClick={add} className="mp-fab" aria-label={addLabel} title={addLabel}>
            <span><Plus className="w-6 h-6" strokeWidth={2.5} /></span>
          </button>
        </span>
        {right.map((id) => <Tab key={id} id={id} />)}
        <button type="button" onClick={onOpenDrawer} className={`mp-bn-tab ${menuActive ? 'on' : ''}`} aria-label={tasksHidden ? `Menu, ${taskDue} task${taskDue === 1 ? '' : 's'} due` : 'Menu'}>
          <span className="mp-bn-ic">
            <Menu className="w-[22px] h-[22px]" strokeWidth={menuActive ? 2.4 : 1.9} />
            {tasksHidden && <span className="mp-bn-dot" aria-hidden="true" />}
          </span>
          <span className="mp-bn-lbl">Menu</span>
        </button>
      </div>
    </nav>
  );
}
