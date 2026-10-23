// Hors ligne : réseau d'abord (pour recevoir les mises à jour), copie en cache si pas de réseau.
const CACHE = 'orga-1.4';
const FICHIERS = ['./', 'index.html', 'app.css', 'app.js', 'logique.js', 'assistant.js', 'questionnaire.html', 'manifest.json', 'icone-180.png', 'icone-512.png'];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FICHIERS)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // GitHub Pages fait garder ses fichiers 10 min en cache : on revérifie toujours nos propres fichiers.
  const nous = new URL(e.request.url).origin === location.origin;
  e.respondWith(fetch(nous ? e.request.url : e.request, nous ? { cache: 'no-cache' } : undefined).then(r => {
    const copie = r.clone();
    caches.open(CACHE).then(c => c.put(e.request, copie));
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
