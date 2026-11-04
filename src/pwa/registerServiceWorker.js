// Monipack CRM - PWA Service Worker Registration & Lifecycle Manager
// Morooj Nizwa International LLC

export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        console.log('[Monipack PWA] Service Worker registered successfully with scope:', registration.scope);

        // Check for updates periodically (every 1 hour)
        setInterval(() => {
          registration.update().catch((err) => {
            console.warn('[Monipack PWA] Background update check failed:', err);
          });
        }, 60 * 60 * 1000);

        // Track updates to the service worker
        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing;
          if (!installingWorker) return;

          installingWorker.addEventListener('statechange', () => {
            if (installingWorker.state === 'installed') {
              if (navigator.serviceWorker.controller) {
                // New update available
                console.log('[Monipack PWA] New update available! Ready to refresh.');
                window.dispatchEvent(
                  new CustomEvent('monipack:pwa-update-available', {
                    detail: { registration }
                  })
                );
              } else {
                // Content cached for offline use
                console.log('[Monipack PWA] App content cached for offline use.');
              }
            }
          });
        });
      })
      .catch((error) => {
        console.error('[Monipack PWA] Service Worker registration failed:', error);
      });

    // Ensure page refresh upon active worker switch
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  });
}

export function unregisterServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.unregister();
      })
      .catch((error) => {
        console.error(error.message);
      });
  }
}
