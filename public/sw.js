// Monipack CRM Production Service Worker
// Morooj Nizwa International LLC (Sultanate of Oman)

const CACHE_VERSION = 'monipack-v2';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DATA_CACHE = `${CACHE_VERSION}-data`;

// Core static assets to pre-cache on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/assets/logo.png',
  '/fonts/NadianneBold.ttf',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/icon-maskable-192x192.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon-32x32.png',
  '/icons/favicon-16x16.png'
];

// Install: pre-cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      // Use catch for individual items to avoid entire install failing if a dev asset is missing
      return Promise.allSettled(
        PRECACHE_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn(`[SW] Precache failed for ${url}:`, err.message);
          })
        )
      );
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// Activate: clean up outdated caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('monipack-') && name !== STATIC_CACHE && name !== DATA_CACHE)
          .map((name) => {
            console.log(`[SW] Removing old cache: ${name}`);
            return caches.delete(name);
          })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Fetch: smart caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignore non-HTTP(S) and unsupported methods
  if (!url.protocol.startsWith('http')) return;
  if (request.method !== 'GET') return;

  // Ignore Vite internal development requests
  if (url.pathname.includes('/@vite/') || url.pathname.includes('/@react-refresh')) {
    return;
  }

  // Customer data, salesman links and uploaded documents are never stored in the offline cache
  if (/^\/api\/(link|customers|customer-links|customer-fields)(\/|$)/.test(url.pathname)) return;

  // 1. API Calls: Network-First with Cache Fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // If valid response, clone and cache
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(DATA_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          // Network failed: attempt to retrieve from cache
          const cachedResponse = await caches.match(request);
          if (cachedResponse) {
            return cachedResponse;
          }
          // If not in cache, return an offline JSON payload
          return new Response(
            JSON.stringify({
              error: 'Offline Mode: You are disconnected from the Monipack server.',
              offline: true,
              timestamp: new Date().toISOString()
            }),
            {
              status: 503,
              statusText: 'Service Unavailable (Offline)',
              headers: { 'Content-Type': 'application/json' }
            }
          );
        })
    );
    return;
  }

  // 2. Brand Font (Nadianne Bold): Cache-First strategy
  if (url.pathname.includes('/fonts/NadianneBold.ttf')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // 3. Navigation Requests (HTML / SPA routing): Network-First, fallback to cached /index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cachedIndex = await caches.match('/index.html');
        if (cachedIndex) return cachedIndex;
        const cachedRoot = await caches.match('/');
        if (cachedRoot) return cachedRoot;
        return new Response(
          '<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:50px;"><h2>Monipack CRM Offline</h2><p>Please check your internet connection.</p></body></html>',
          { headers: { 'Content-Type': 'text/html' } }
        );
      })
    );
    return;
  }

  // 4. Static Assets (Scripts, CSS, Images, Icons): Cache-First with Network fallback and dynamic caching
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          // Cache successful GET responses for same-origin static assets
          if (response && response.status === 200 && url.origin === self.location.origin) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          // If offline and request is an image, could return fallback or 404
          return new Response(null, { status: 404, statusText: 'Offline Asset Not Found' });
        });
    })
  );
});

// Handle explicit messages (e.g., skip waiting)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
