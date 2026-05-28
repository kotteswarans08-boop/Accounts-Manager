// sw.js — Chit Accounts Manager Service Worker v2
const CACHE_NAME = 'chit-accounts-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './app-logo.png'
];

// Install: pre-cache all static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Use individual adds to avoid failing entire cache if one asset is missing
      return Promise.allSettled(ASSETS.map(asset => cache.add(asset)));
    }).then(() => self.skipWaiting())
  );
});

// Activate: remove old caches and claim clients immediately
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: cache-first strategy for app assets, with network fallback
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip cross-origin requests (e.g. external images like postimg.cc)
  if (url.origin !== location.origin) return;

  // Skip chrome-extension or other non-http schemes
  if (!url.protocol.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // Return from cache, then update cache in background (stale-while-revalidate)
        const fetchPromise = fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => {});
        return cached;
      }

      // Not in cache — fetch from network
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        // Cache the new resource
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => {
        // Offline fallback: return cached index.html for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        // For other requests, return a simple offline response
        return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
      });
    })
  );
});

// Handle messages from clients (e.g. force update)
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
