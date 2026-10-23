// Hors ligne : réseau d'abord (pour recevoir les mises à jour), copie en cache si pas de réseau.
const CACHE = 'orga-1.8.1';
const FICHIERS = ['./', 'index.html', 'app.css', 'app.js', 'logique.js', 'assistant.js', 'questionnaire.html', 'questionnaire.js', 'confidentialite.html', 'manifest.json', 'icone-180.png', 'icone-512.png'];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FICHIERS)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  // Seuls les fichiers du site passent par le cache ; tout le reste (un futur serveur, par exemple) va directement au réseau.
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  // GitHub Pages fait garder ses fichiers 10 min en cache : on revérifie toujours nos propres fichiers.
  const nous = true;
  e.respondWith(fetch(nous ? e.request.url : e.request, nous ? { cache: 'no-cache' } : undefined).then(r => {
    const copie = r.clone();
    caches.open(CACHE).then(c => c.put(e.request, copie));
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
