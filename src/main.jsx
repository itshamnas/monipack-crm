import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import CustomerLink from './pages/CustomerLink.jsx';
import './index.css';
import { registerServiceWorker } from './pwa/registerServiceWorker.js';
import { initTheme } from './utils/theme.js';
import { installGlobalSounds } from './utils/soundService.js';
import { installRipples } from './utils/ripple.js';

// Theme before the first paint (no white flash in dark mode), and one listener for tactile sounds
initTheme();
installGlobalSounds();
installRipples();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* Salesman customer links (/c/...) open without a CRM login */}
    {window.location.pathname.startsWith('/c/') ? <CustomerLink /> : <App />}
  </React.StrictMode>
);

// Register Monipack PWA Service Worker
registerServiceWorker();
