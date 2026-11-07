/**
 * Monipack CRM - Role & Permission Matrix (single source of truth).
 * Every API route is protected by requirePermission(...) using these names.
 */

export const ROLES = ['super_admin', 'manager', 'customer_care', 'salesman'];

export const ROLE_LABELS = {
  super_admin: 'Super Admin',
  manager: 'Manager',
  customer_care: 'Customer Care',
  salesman: 'Salesman',
};

const ALL_PERMISSIONS = [
  'dashboard.view',
  'leads.view_all',
  'leads.view_own',
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
  'quotations.archive',
  'products.view',
  'products.manage',
  'branches.view',
  'settings.manage',
  'users.manage',
  'audit.view',
  'backup.download',
  'customers.view',
  'customers.manage',
  'tasks.use',
  'tasks.assign',
  'tasks.manage',
];

const ROLE_PERMISSIONS = {
  super_admin: ALL_PERMISSIONS,
  manager: [
    'dashboard.view',
    'leads.view_all', 'leads.create', 'leads.update', 'leads.assign', 'leads.archive', 'leads.import',
    // 'leads.export' is added only when the user has can_export = true
    'quotations.view', 'quotations.create', 'quotations.update', 'quotations.archive',
    'products.view', 'products.manage',
    'branches.view',
    'audit.view',
    'customers.view',
    'tasks.use', 'tasks.assign', 'tasks.manage',
  ],
  customer_care: [
    'dashboard.view',
    'leads.view_all', 'leads.create', 'leads.update', 'leads.assign', 'leads.import',
    'quotations.view', 'quotations.create',
    'products.view',
    'branches.view',
    'tasks.use', 'tasks.assign',
  ],
  salesman: [
    'dashboard.view',
    'leads.view_own', 'leads.create', 'leads.update',
    'quotations.view', 'quotations.create', 'quotations.update',
    'products.view',
    'branches.view',
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
  if (role === 'manager' && canExport) perms.add('leads.export');
  return [...perms];
}

export function hasPermission(user, permission) {
  if (!user) return false;
  const perms = user.permissions || permissionsFor(user);
  return perms.includes(permission);
}

/** True when the user may only see leads assigned to their own salesman record. */
export function isOwnScopeOnly(user) {
  return !hasPermission(user, 'leads.view_all') && hasPermission(user, 'leads.view_own');
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
