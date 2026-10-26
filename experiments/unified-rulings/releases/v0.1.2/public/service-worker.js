const CACHE_NAME = 'riftassi-v0.1.1-ui2';
const APP_SHELL = ['/', '/styles-r2.css', '/reports.css', '/card-composer-r2.js', '/evidence-view.js', '/app-r2.js', '/reports.js', '/manifest.webmanifest', '/icon.svg'];
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
