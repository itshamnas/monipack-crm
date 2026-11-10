// One place that defines the simplified menu: Home · Customers · Leads · Quotations · Settings.
// Each main item can hold several pages, shown as tabs at the top of the page.

const has = (user, perm) => !perm || Boolean(user?.permissions?.includes(perm));
const allowed = (user, item) => has(user, item.perm) && (!item.role || user?.role === item.role);

export const NAV_SECTIONS = [
  { id: 'home', label: 'Home', pages: [
    { id: 'dashboard', label: 'Home' },
    { id: 'analytics', label: 'Charts' },
  ] },
  { id: 'customers', label: 'Customers', perm: 'customers.view', pages: [
    { id: 'customers', label: 'Customers', perm: 'customers.view' },
  ] },
  { id: 'leads', label: 'Leads', pages: [
    { id: 'leads', label: 'Pipeline' },
    { id: 'customercare', label: 'New enquiries (call queue)' },
  ] },
  { id: 'tasks', label: 'Tasks', perm: 'tasks.use', pages: [
    { id: 'tasks', label: 'Tasks', perm: 'tasks.use' },
  ] },
  { id: 'quotations', label: 'Quotations', pages: [
    { id: 'quotations', label: 'Quotations' },
  ] },
  { id: 'settings', label: 'Settings', pages: [
    { id: 'settings-links', label: 'Salesmen & links', perm: 'customers.manage' },
    { id: 'settings-fields', label: 'Customer form', perm: 'customers.manage' },
    { id: 'products', label: 'Products' },
    { id: 'branches', label: 'Branches' },
    { id: 'settings-targets', label: 'Sales targets', perm: 'settings.manage' },
    { id: 'settings', label: 'Staff & system', perm: 'settings.manage' },
    { id: 'settings-cleanup', label: 'Data cleanup', role: 'super_admin' },
    { id: 'settings-vault', label: 'Audit vault', role: 'super_admin' },
  ] },
];

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
