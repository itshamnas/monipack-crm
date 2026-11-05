import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import CustomerLink from './pages/CustomerLink.jsx';
import './index.css';
import { registerServiceWorker } from './pwa/registerServiceWorker.js';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* Salesman customer links (/c/...) open without a CRM login */}
    {window.location.pathname.startsWith('/c/') ? <CustomerLink /> : <App />}
  </React.StrictMode>
);

// Register Monipack PWA Service Worker
registerServiceWorker();
