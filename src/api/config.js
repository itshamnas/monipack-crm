// Monipack CRM - Centralized API Configuration
// Production uses same-origin relative URLs (""). Development supports Vite proxy or VITE_API_URL.

export function getBaseUrl() {
  if (import.meta.env.DEV) {
    return (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');
  }
  // In production, the API base URL is always the relative path "" (same origin, calls go to /api)
  return '';
}

export const API_BASE_URL = getBaseUrl();

/**
 * Resolves an API endpoint against the configured base URL.
 * e.g., getApiUrl('/api/auth/login') -> 'https://monipack-crm-backend.onrender.com/api/auth/login'
 *       or '/api/auth/login' (if base URL is empty / relative)
 */
export function getApiUrl(endpoint) {
  const base = getBaseUrl();
  if (!endpoint) return base;
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint;
  }
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${base}${cleanEndpoint}`;
}
