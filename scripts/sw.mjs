import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Lists the built files and writes a service worker that keeps them offline. */
const root = 'dist';
const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
const files = walk(root).map((f) => relative(root, f)).filter((f) => f !== 'sw.js' && !f.endsWith('.shortcut'));
const hash = createHash('sha256');
for (const f of files.sort()) hash.update(readFileSync(join(root, f)));
const version = hash.digest('hex').slice(0, 12);

const sw = `const CACHE = 'fonte-${version}';
const FILES = ${JSON.stringify(['./', ...files.map((f) => `./${f}`)])};

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
`;
writeFileSync(join(root, 'sw.js'), sw);
console.log(`sw.js: ${files.length} fichiers, version ${version}`);
