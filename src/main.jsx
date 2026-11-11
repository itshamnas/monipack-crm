import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import CustomerLink from './pages/CustomerLink.jsx';
import ViewLink from './pages/ViewLink.jsx';
import './index.css';
import { registerServiceWorker } from './pwa/registerServiceWorker.js';
import { initTheme } from './utils/theme.js';
import { installGlobalSounds } from './utils/soundService.js';
import { installRipples } from './utils/ripple.js';
import { installFieldNames } from './utils/fieldNames.js';

// Theme before the first paint (no white flash in dark mode), and one listener for tactile sounds
initTheme();
installGlobalSounds();
installRipples();
installFieldNames();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* Salesman customer links (/c/...) open without a CRM login */}
    {/* Read-only links from WhatsApp alerts (/v/...) also open without a login */}
    {window.location.pathname.startsWith('/c/') ? <CustomerLink /> : window.location.pathname.startsWith('/v/') ? <ViewLink /> : <App />}
  </React.StrictMode>
);

// Register Monipack PWA Service Worker
registerServiceWorker();
