// Monipack CRM - Centralized API Configuration
// Supports same-origin (cPanel/Localhost) and cross-origin (Render.com/Cloud Backend)

/**
 * Priority:
 * 1. window.__MONIPACK_API_URL__ (runtime override, can be edited directly in cPanel index.html without rebuild)
 * 2. localStorage.getItem('monipack_backend_url') (browser runtime override)
 * 3. import.meta.env.VITE_API_URL (baked at build time via .env.production / .env.development)
 */
export function getBaseUrl() {
  if (typeof window !== 'undefined') {
    if (window.__MONIPACK_API_URL__ && typeof window.__MONIPACK_API_URL__ === 'string' && window.__MONIPACK_API_URL__.trim()) {
      return window.__MONIPACK_API_URL__.trim().replace(/\/+$/, '');
    }
    const localOverride = localStorage.getItem('monipack_backend_url');
    if (localOverride) {
      return localOverride.trim().replace(/\/+$/, '');
    }
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || hostname.startsWith('10.')) {
      return '';
    }
  }
  return (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');
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
