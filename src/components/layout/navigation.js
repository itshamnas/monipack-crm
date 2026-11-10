// One place that defines the menu:
// Home · Inbox · Pipeline · Customers · Quotations · Tasks · Settings
// Inbox = new enquiries to call; Pipeline = deals in progress.
// Settings pages are grouped (Team / Catalogue / Company / Security) and shown as two rows of tabs.

const has = (user, perm) => !perm || Boolean(user?.permissions?.includes(perm));
const allowed = (user, item) => has(user, item.perm) && (!item.role || user?.role === item.role);

export const NAV_SECTIONS = [
  { id: 'home', label: 'Home', pages: [
    { id: 'dashboard', label: 'Overview' },
    { id: 'analytics', label: 'Reports' },
  ] },
  { id: 'inbox', label: 'Inbox', pages: [
    { id: 'customercare', label: 'Inbox' },
  ] },
  { id: 'leads', label: 'Pipeline', pages: [
    { id: 'leads', label: 'Pipeline' },
  ] },
  { id: 'customers', label: 'Customers', perm: 'customers.view', pages: [
    { id: 'customers', label: 'Customers', perm: 'customers.view' },
  ] },
  { id: 'quotations', label: 'Quotations', pages: [
    { id: 'quotations', label: 'Quotations' },
  ] },
  { id: 'tasks', label: 'Tasks', perm: 'tasks.use', pages: [
    { id: 'tasks', label: 'Tasks', perm: 'tasks.use' },
  ] },
  { id: 'settings', label: 'Settings', pages: [
    { id: 'settings-links', group: 'Team', label: 'Salesmen & links', perm: 'customers.manage' },
    { id: 'settings-staff', group: 'Team', label: 'Staff logins', perm: 'settings.manage' },
    { id: 'settings-targets', group: 'Team', label: 'Sales targets', perm: 'settings.manage' },
    { id: 'products', group: 'Catalogue', label: 'Products' },
    { id: 'settings-catalogue', group: 'Catalogue', label: 'Categories', perm: 'settings.manage' },
    { id: 'settings-fields', group: 'Catalogue', label: 'Customer form', perm: 'customers.manage' },
    { id: 'branches', group: 'Company', label: 'Branches' },
    { id: 'settings-stages', group: 'Company', label: 'Pipeline stages', perm: 'settings.manage' },
    { id: 'settings', group: 'Company', label: 'Company details', perm: 'settings.manage' },
    { id: 'settings-security', group: 'Security', label: 'Security & audit', perm: 'settings.manage' },
    { id: 'settings-vault', group: 'Security', label: 'Audit vault', role: 'super_admin' },
    { id: 'settings-cleanup', group: 'Security', label: 'Data cleanup', role: 'super_admin' },
  ] },
];

/** Settings pages that are parts of the big Settings screen: page id -> its inner tab */
export const SETTINGS_SUBPAGES = {
  'settings-staff': 'users',
  'settings-catalogue': 'categories',
  'settings-stages': 'stages',
  settings: 'company',
  'settings-security': 'audit',
};

/** Sections and pages this user may open */
export function navFor(user) {
  return NAV_SECTIONS
    .filter((s) => has(user, s.perm))
    .map((s) => ({ ...s, pages: s.pages.filter((p) => allowed(user, p)) }))
    .filter((s) => s.pages.length > 0);
}

/** Which main section a page belongs to */
export function sectionOf(pageId, user) {
  return navFor(user).find((s) => s.pages.some((p) => p.id === pageId)) || null;
}
