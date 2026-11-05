// Display names for user roles (must match server/auth/permissions.js)
export const ROLE_LABELS = {
  super_admin: 'Super Admin',
  manager: 'Manager',
  customer_care: 'Customer Care',
  salesman: 'Salesman',
};

export const roleLabel = (role) => ROLE_LABELS[role] || ROLE_LABELS[role === 'admin' ? 'manager' : ''] || 'User';
