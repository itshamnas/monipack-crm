// Display names for user roles (must match server/auth/permissions.js)
export const ROLE_LABELS = {
  super_admin: 'Super Admin',
  manager: 'General Manager',
  b2b_manager: 'B2B Manager',
  retail_manager: 'Retail Manager',
  customer_care: 'Customer Care',
  salesman: 'Salesman',
};

export const roleLabel = (role) => ROLE_LABELS[role] || ROLE_LABELS[role === 'admin' ? 'manager' : ''] || 'User';

/** Plain description of what each role can see (shown when adding a staff login). */
export const ROLE_HELP = {
  super_admin: 'Everything, including settings, staff, backups and the audit vault.',
  manager: 'Every department. No settings, staff logins or vault.',
  b2b_manager: 'Only B2B branches: their leads, salesmen, quotations and reports.',
  retail_manager: 'Only Retail shops: their leads, salesmen, quotations and reports.',
  customer_care: 'Every enquiry: add, assign, follow up, quote. No settings and no exporting.',
  salesman: 'Only his own leads and quotations.',
};

/** Department of a role ('b2b' | 'retail') or null. */
export const roleSegment = (role) => (role === 'b2b_manager' ? 'b2b' : role === 'retail_manager' ? 'retail' : null);
