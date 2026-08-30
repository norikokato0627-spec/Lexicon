/* Tasha's Lexicon — offline cache.
   Serves the app from the device first, then quietly checks for a newer copy.
   This file rarely changes; upload it once alongside index.html. */

const CACHE = 'lexicon-v1';
const ASSETS = ['./', './index.html'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function tellClients(type) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  for (const c of clients) c.postMessage({ type });
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return; // outside links go straight out

  // Fetch in the background whether or not we answer from cache.
  const fromNetwork = fetch(req).then(async res => {
    if (!res || !res.ok) return res;
    const cache = await caches.open(CACHE);
    const old = await cache.match(req, { ignoreSearch: true });
    await cache.put(req, res.clone());
    if (old) {
      const [a, b] = await Promise.all([old.clone().arrayBuffer(), res.clone().arrayBuffer()]);
      if (a.byteLength !== b.byteLength) tellClients('update');
    }
    return res;
  }).catch(() => null);

  event.waitUntil(fromNetwork);

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    const net = await fromNetwork;
    return net || new Response('オフラインです。', {
      status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  })());
});
