/**
 * Monipack CRM - Role & Permission Matrix (single source of truth).
 * Every API route is protected by requirePermission(...) using these names.
 */

export const ROLES = ['super_admin', 'manager', 'b2b_manager', 'retail_manager', 'customer_care', 'salesman'];

/** Department managers only see their own department ('b2b' or 'retail'). */
export const ROLE_SEGMENT = { b2b_manager: 'b2b', retail_manager: 'retail' };

export const ROLE_LABELS = {
  super_admin: 'Super Admin',
  manager: 'General Manager',
  b2b_manager: 'B2B Manager',
  retail_manager: 'Retail Manager',
  customer_care: 'Customer Care',
  salesman: 'Salesman',
};

const ALL_PERMISSIONS = [
  'dashboard.view',
  'leads.view_all',
  'leads.view_own',
  'leads.view_dept',
  'leads.create',
  'leads.update',
  'leads.assign',
  'leads.archive',
  'leads.import',
  'leads.export',
  'leads.purge',
  'quotations.view',
  'quotations.create',
  'quotations.update',
  'quotations.status',
  'quotations.archive',
  'products.view',
  'products.manage',
  'branches.view',
  'settings.manage',
  'users.manage',
  'audit.view',
  'reports.view',
  'reports.export',
  'customers.export',
  'backup.download',
  'customers.view',
  'customers.manage',
  'tasks.use',
  'tasks.assign',
  'tasks.manage',
];

const MANAGER_BASE = [
  'dashboard.view',
  'leads.create', 'leads.update', 'leads.assign', 'leads.archive', 'leads.import',
  // 'leads.export' / 'reports.export' / 'customers.export' are added only when the user has can_export = true
  'quotations.view', 'quotations.create', 'quotations.update', 'quotations.status', 'quotations.archive',
  'products.view',
  'branches.view',
  'reports.view',
  'customers.view',
  'tasks.use', 'tasks.assign',
];

const ROLE_PERMISSIONS = {
  super_admin: ALL_PERMISSIONS,
  // General Manager: sees every department; no settings, staff or vault
  manager: [...MANAGER_BASE, 'leads.view_all', 'products.manage', 'audit.view', 'tasks.manage'],
  // Department managers: everything a manager does, but only inside their department
  // (no bulk import: imports are company-wide)
  b2b_manager: [...MANAGER_BASE.filter((p) => p !== 'leads.import'), 'leads.view_dept'],
  retail_manager: [...MANAGER_BASE.filter((p) => p !== 'leads.import'), 'leads.view_dept'],
  // Customer care: full day-to-day control of every enquiry; no settings and no exporting
  customer_care: [
    'dashboard.view',
    'leads.view_all', 'leads.create', 'leads.update', 'leads.assign', 'leads.archive', 'leads.import',
    'quotations.view', 'quotations.create', 'quotations.update', 'quotations.status', 'quotations.archive',
    'products.view',
    'branches.view',
    'reports.view',
    'customers.view',
    'tasks.use', 'tasks.assign', // gives and follows tasks; other people's private tasks stay private
  ],
  salesman: [
    'dashboard.view',
    'leads.view_own', 'leads.create', 'leads.update',
    'quotations.view', 'quotations.create', 'quotations.update', 'quotations.status',
    'products.view',
    'branches.view',
    'reports.view', // his own figures only
    'tasks.use',
  ],
};

export function normalizeRole(role) {
  if (role === 'admin') return 'manager'; // legacy role name
  return ROLES.includes(role) ? role : null;
}

/**
 * Permissions for a user object { role, canExport | can_export }.
 */
export function permissionsFor(user) {
  if (!user) return [];
  const role = normalizeRole(user.role);
  if (!role) return [];
  const perms = new Set(ROLE_PERMISSIONS[role] || []);
  const canExport = user.canExport === true || user.can_export === true;
  if (['manager', 'b2b_manager', 'retail_manager'].includes(role) && canExport) {
    perms.add('leads.export');
    perms.add('reports.export');
    perms.add('customers.export');
  }
  return [...perms];
}

export function hasPermission(user, permission) {
  if (!user) return false;
  const perms = user.permissions || permissionsFor(user);
  return perms.includes(permission);
}

/** True when the user may only see leads assigned to their own salesman record. */
export function isOwnScopeOnly(user) {
  return !hasPermission(user, 'leads.view_all') && !hasPermission(user, 'leads.view_dept') && hasPermission(user, 'leads.view_own');
}

/** 'b2b' / 'retail' for department managers, otherwise null. */
export function segmentOf(user) {
  if (!user || hasPermission(user, 'leads.view_all')) return null;
  return hasPermission(user, 'leads.view_dept') ? (ROLE_SEGMENT[normalizeRole(user.role)] || 'none') : null;
}

/**
 * What part of the data this user may see:
 *   {}                      everything
 *   { segment: 'b2b' }      one department
 *   { salesmanId: '12' }    own leads only
 */
export function dataScope(user) {
  const seg = segmentOf(user);
  if (seg) return { segment: seg };
  if (isOwnScopeOnly(user)) return { salesmanId: user.salesmanId ?? -1 };
  return {};
}

export const PASSWORD_MIN_LENGTH = 10;

export function validatePassword(password) {
  if (!password || typeof password !== 'string') return 'Password is required.';
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`;
  }
  if (password.length > 200) return 'Password is too long.';
  return null;
}
