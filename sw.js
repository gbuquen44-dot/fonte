const CACHE = 'fonte-cc1983f33f61';
const FILES = ["./","./assets/brain-C40fiLfT.js","./assets/error-CJi2sQ9A.js","./assets/index-Cj-UjuVL.css","./assets/index-DSI8PrBV.js","./assets/node.browser-BGposN4V.js","./assets/node.browser-CPJp0j3I.js","./icon-180.png","./icon-192.png","./icon-512.png","./index.html","./manifest.webmanifest"];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (e.request.mode === 'navigate') {
    e.respondWith(
      Promise.race([
        fetch(e.request).then((r) => {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put('./', copy));
          return r;
        }),
        new Promise((resolve) => setTimeout(() => caches.match('./').then((m) => m && resolve(m)), 1500)),
      ]).catch(() => caches.match('./')),
    );
    return;
  }
  e.respondWith(caches.match(e.request).then((m) => m ?? fetch(e.request)));
});
