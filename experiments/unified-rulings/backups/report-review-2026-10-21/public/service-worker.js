const CACHE_NAME = 'riftassi-v0.1.3-ui2b';
const APP_SHELL = ['/', '/styles-ui2.css?v=2b', '/reports.css', '/card-composer-ui2.js', '/evidence-view.js', '/app-ui2.js', '/reports.js', '/manifest.webmanifest', '/icon.svg'];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL.map((url) => new Request(url, { cache: 'reload' })))));
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  // Retain the previous shell for already-open pages. Do not reload clients.
  event.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(caches.open(CACHE_NAME).then(async (cache) => {
    const cached = await cache.match(event.request);
    return cached || fetch(event.request);
  }));
});
