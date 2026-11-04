import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi, RefreshCw } from 'lucide-react';

export default function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [showRestored, setShowRestored] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState(null);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowRestored(true);
      const timer = setTimeout(() => setShowRestored(false), 3500);
      return () => clearTimeout(timer);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowRestored(false);
    };

    const handleUpdate = (e) => {
      const reg = e.detail?.registration;
      if (reg && reg.waiting) {
        setWaitingWorker(reg.waiting);
        setUpdateAvailable(true);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('monipack:pwa-update-available', handleUpdate);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('monipack:pwa-update-available', handleUpdate);
    };
  }, []);

  const handleApplyUpdate = () => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    } else {
      window.location.reload();
    }
  };

  // If a new app version is ready to be installed
  if (updateAvailable) {
    return (
      <div
        role="alert"
        aria-live="polite"
        className="w-full bg-[#18181B] text-white px-3 sm:px-4 py-2 flex items-center justify-between text-xs sm:text-sm font-medium z-50 shadow-md border-b border-red-600/40 select-none animate-in slide-in-from-top duration-200"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-ping shrink-0" />
          <span className="truncate">
            A new version of <span className="font-monipack lowercase font-bold">monipack</span> CRM is ready.
          </span>
        </div>
        <button
          type="button"
          onClick={handleApplyUpdate}
          className="ml-2 px-2.5 py-1 bg-[#CC1A22] hover:bg-red-700 text-white font-semibold text-xs rounded-md shadow-xs transition active:scale-95 flex items-center gap-1.5 shrink-0 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Update Now</span>
        </button>
      </div>
    );
  }

  // If currently offline
  if (!isOnline) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="w-full bg-amber-500 text-slate-950 px-3 sm:px-4 py-1.5 flex items-center justify-between text-xs sm:text-sm font-semibold z-50 shadow-md select-none animate-in slide-in-from-top duration-200"
      >
        <div className="flex items-center gap-2 min-w-0">
          <WifiOff className="w-4 h-4 shrink-0 text-slate-950 animate-pulse" />
          <span className="truncate">
            Offline Mode — Viewing cached <span className="font-monipack lowercase">monipack</span> data. Changes sync when online.
          </span>
        </div>
        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-black/10 shrink-0 font-bold">
          CACHED
        </span>
      </div>
    );
  }

  // If reconnected briefly
  if (showRestored) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="w-full bg-emerald-600 text-white px-3 sm:px-4 py-1.5 flex items-center justify-center gap-2 text-xs sm:text-sm font-semibold z-50 shadow-md select-none animate-in slide-in-from-top duration-200"
      >
        <Wifi className="w-4 h-4 shrink-0 text-white" />
        <span>Connection Restored — All Monipack systems online.</span>
      </div>
    );
  }

  return null;
}
