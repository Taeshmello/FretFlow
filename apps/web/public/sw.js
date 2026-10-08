const CACHE = 'fretflow-shell-v2';
const SHELL = [
  '/',
  '/manifest.webmanifest',
  '/icons/fretflow-192.png',
  '/icons/fretflow-512.png',
  '/icons/fretflow-maskable-512.png',
];

/** Only complete, same-origin 200 responses go into the cache. */
function isCacheable(response) {
  return response.status === 200 && response.type === 'basic';
}

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  // Partial responses (206) cannot be stored, and /.well-known must stay live.
  if (request.headers.has('range') || url.pathname.startsWith('/.well-known/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (isCacheable(response)) {
            const copy = response.clone();
            void caches.open(CACHE).then(cache => cache.put('/', copy));
          }
          return response;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request).then(response => {
        if (isCacheable(response)) {
          const copy = response.clone();
          void caches.open(CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      });
      return cached ?? network;
    }),
  );
});

