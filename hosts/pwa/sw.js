const CACHE_NAME = 'zebra-pwa-26072201';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './host.js',
  './markdown-it.min.js',
  './src/styles.css',
  './src/app.js',
  './src/templates.js',
  './src/icon/icon48.png',
  './src/icon/icon144.png',
  './src/icon/icon192.png',
  './src/icon/icon512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

// Cache-first for the app shell; everything else (e.g. font files) falls
// back to the network and is cached opportunistically as it's fetched.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
