// Hors ligne : réseau d'abord (pour recevoir les mises à jour), copie en cache si pas de réseau.
const CACHE = 'orga-v1.3';
const FICHIERS = ['./', 'index.html', 'app.js', 'logique.js', 'manifest.json', 'icone-180.png', 'icone-512.png'];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FICHIERS)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => {
    const copie = r.clone();
    caches.open(CACHE).then(c => c.put(e.request, copie));
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
