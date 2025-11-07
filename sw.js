// cache-first service worker
const CACHE_NAME = 'dds-contexto-v3.5.1';
const ASSETS = [ './', './index.html', './styles.css', './app.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png' ];
self.addEventListener('install', e=>{ e.waitUntil(caches.open(CACHE_NAME).then(c=> c.addAll(ASSETS))); });
self.addEventListener('activate', e=>{ e.waitUntil(caches.keys().then(keys=> Promise.all(keys.map(k=> k!==CACHE_NAME && caches.delete(k))))); });
self.addEventListener('fetch', e=>{ if (e.request.method !== 'GET') return; e.respondWith( caches.match(e.request).then(cached => cached || fetch(e.request).then(resp => { const copy=resp.clone(); caches.open(CACHE_NAME).then(c=> c.put(e.request, copy)).catch(()=>{}); return resp; }).catch(()=> cached) ) ); });
