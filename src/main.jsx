import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import CustomerLink from './pages/CustomerLink.jsx';
import ViewLink from './pages/ViewLink.jsx';
import SponsorshipLink from './pages/SponsorshipLink.jsx';
import SponsorshipUpload from './pages/SponsorshipUpload.jsx';
import './index.css';
import { registerServiceWorker } from './pwa/registerServiceWorker.js';
import { initTheme } from './utils/theme.js';
import { installGlobalSounds } from './utils/soundService.js';
import { installRipples } from './utils/ripple.js';
import { installFieldNames } from './utils/fieldNames.js';

// The test copy (test-crm.monipack.com) says so on every page, and asks search engines to stay away
if (/^(test|staging)[-.]/i.test(window.location.hostname)) {
  const tag = document.createElement('div');
  tag.textContent = 'TEST SYSTEM · not the live CRM';
  tag.setAttribute('role', 'note');
  tag.style.cssText = 'position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:9999;background:#F59E0B;color:#111;font:700 11px/1 system-ui,sans-serif;letter-spacing:.06em;padding:4px 12px;border-radius:0 0 8px 8px;pointer-events:none';
  document.body.appendChild(tag);
  const m = document.createElement('meta'); m.name = 'robots'; m.content = 'noindex, nofollow'; document.head.appendChild(m);
}

// Theme before the first paint (no white flash in dark mode), and one listener for tactile sounds
initTheme();
installGlobalSounds();
installRipples();
installFieldNames();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* Salesman customer links (/c/...) open without a CRM login */}
    {/* Read-only links from WhatsApp alerts (/v/...) also open without a login */}
    {/* Sponsorship approval links (/s/...) open with their PIN */}
    {window.location.pathname.startsWith('/c/') ? <CustomerLink /> : window.location.pathname.startsWith('/v/') ? <ViewLink /> : window.location.pathname.startsWith('/s/') ? <SponsorshipLink /> : window.location.pathname.startsWith('/u/') ? <SponsorshipUpload /> : <App />}
  </React.StrictMode>
);

// Register Monipack PWA Service Worker
registerServiceWorker();
