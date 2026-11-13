const CACHE_NAME = 'riftassi-v0.2.0-runtime-notice-20261113';
const APP_SHELL = ['/', '/styles-ui5.css', '/reports.css', '/legal.css', '/privacy.html', '/terms.html', '/card-composer-ui3.js', '/evidence-view.js', '/app-ui5.js?v=20261113-runtime-notice', '/reports-ui3.js', '/manifest.webmanifest', '/icon.svg'];
self.addEventListener('install', (event) => {
  event.waitUntil((async()=>{
    const responses=await Promise.all(APP_SHELL.map(async url=>{const r=await fetch(new Request(url,{cache:'reload'}));if(!r.ok||r.headers.get('X-RiftAssist-Release')!=='v0.2.0')throw new Error('Release changed during shell installation');return[url,r];}));
    const cache=await caches.open(CACHE_NAME);await Promise.all(responses.map(([url,r])=>cache.put(url,r)));
  })());
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  // Retain the previous shell for already-open pages. Do not reload clients.
  event.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(caches.open(CACHE_NAME).catch(()=>null).then(async (cache) => {
    try {
      const response=await fetch(event.request,{cache:'no-store'});
      if(cache&&response.ok&&response.headers.get('X-RiftAssist-Release')==='v0.2.0'&&APP_SHELL.includes(url.pathname+url.search))await cache.put(event.request,response.clone()).catch(()=>{});
      return response; // A rolled-back server always supplies its own current shell/assets.
    } catch(error){const cached=await cache?.match(event.request);if(cached)return cached;throw error;}
  }));
});
