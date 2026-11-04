import React, { useState, useEffect } from 'react';
import { Download, Smartphone, CheckCircle, Share } from 'lucide-react';

export default function InstallPromptButton({ variant = 'sidebar', className = '' }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    // 1. Detect if already running standalone
    const isStandalone =
      (typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches) ||
      (typeof navigator !== 'undefined' && navigator.standalone === true);

    if (isStandalone) {
      setIsInstalled(true);
    }

    // 2. Detect iOS device
    const userAgent = typeof window !== 'undefined' ? window.navigator.userAgent : '';
    const isIosDevice = /iphone|ipad|ipod/i.test(userAgent);
    setIsIOS(isIosDevice);

    // 3. Listen for native PWA beforeinstallprompt event
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      console.log('[Monipack PWA] Application successfully installed.');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        console.log('[Monipack PWA] User accepted installation prompt');
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
    } else if (isIOS) {
      setShowIOSGuide(true);
    }
  };

  // If already running standalone, display a subtle installed status in sidebar
  if (isInstalled) {
    if (variant === 'sidebar') {
      return (
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200/60 ${className}`}>
          <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span className="truncate">Installed Application</span>
        </div>
      );
    }
    return null;
  }

  // If neither prompt is available nor iOS, hide on desktop header unless prompt is ready
  if (!deferredPrompt && !isIOS && variant === 'header') {
    return null;
  }

  // Sidebar Variant
  if (variant === 'sidebar') {
    return (
      <>
        <button
          type="button"
          onClick={handleInstallClick}
          className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs font-bold text-[#CC1A22] bg-red-50 hover:bg-red-100/80 border border-red-200/70 transition shadow-xs active:scale-[0.98] cursor-pointer group ${className}`}
          title="Install Monipack CRM Progressive Web App"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Smartphone className="w-4 h-4 text-[#CC1A22] group-hover:scale-110 transition-transform shrink-0" />
            <span className="truncate">Install Monipack App</span>
          </div>
          <Download className="w-3.5 h-3.5 text-[#CC1A22] shrink-0" />
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-sm w-full p-5 text-slate-800 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150">
              <div className="flex items-center gap-2 mb-3 text-red-600 font-bold text-base">
                <Share className="w-5 h-5" />
                <span>Install on iOS Safari</span>
              </div>
              <p className="text-xs text-slate-600 mb-3 leading-relaxed">
                To install <strong>Monipack CRM</strong> on your iPhone or iPad:
              </p>
              <ol className="text-xs text-slate-700 list-decimal pl-5 space-y-1.5 mb-4">
                <li>Tap the <strong>Share</strong> button (square with arrow up) at the bottom of Safari.</li>
                <li>Scroll down and select <strong>"Add to Home Screen"</strong>.</li>
                <li>Tap <strong>Add</strong> in the top-right corner.</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2 bg-[#CC1A22] hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-xs transition"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // Header Variant (Compact)
  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-[#CC1A22] bg-red-50 hover:bg-red-100 rounded-lg border border-red-200/80 transition active:scale-95 shadow-xs cursor-pointer ${className}`}
        title="Install Monipack App to Home Screen / Desktop"
      >
        <Download className="w-3.5 h-3.5 text-[#CC1A22]" />
        <span className="hidden sm:inline">Install App</span>
      </button>

      {showIOSGuide && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 text-slate-800 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2 mb-3 text-red-600 font-bold text-base">
              <Share className="w-5 h-5" />
              <span>Install on iOS Safari</span>
            </div>
            <p className="text-xs text-slate-600 mb-3 leading-relaxed">
              To install <strong>Monipack CRM</strong> on your iPhone or iPad:
            </p>
            <ol className="text-xs text-slate-700 list-decimal pl-5 space-y-1.5 mb-4">
              <li>Tap the <strong>Share</strong> button at the bottom of Safari.</li>
              <li>Scroll down and select <strong>"Add to Home Screen"</strong>.</li>
              <li>Tap <strong>Add</strong> in the top-right corner.</li>
            </ol>
            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="w-full py-2 bg-[#CC1A22] hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-xs transition"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
}
