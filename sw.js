// Hors ligne : réseau d'abord (pour recevoir les mises à jour), copie en cache si pas de réseau.
const CACHE = 'orga-1.9.4';
const FICHIERS = ['./', 'index.html', 'app.css', 'app.js', 'logique.js', 'assistant.js', 'questionnaire.html', 'questionnaire.js', 'confidentialite.html', 'manifest.json', 'icone-180.png', 'icone-512.png'];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FICHIERS)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== 'orga-rappels').map(k => caches.delete(k)))).then(() => self.clients.claim())));
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

// Rappels : le message ne contient que l'heure du rappel ; le texte vient du cache « orga-rappels »,
// écrit par l'app sur ce téléphone. iOS exige qu'une notification s'affiche à chaque message reçu.
self.addEventListener('push', e => e.waitUntil((async () => {
  let t = null;
  try { t = e.data ? e.data.json().t : null; } catch {}
  let r = null;
  try {
    const liste = await (await (await caches.open('orga-rappels')).match('rappels.json'))?.json();
    r = (liste || []).find(x => t !== null && Math.abs(x.t - t) <= 180);
  } catch {}
  await self.registration.showNotification(r ? r.titre : 'Rappel', { body: r ? r.corps : 'Ouvre ton app d’organisation.', icon: 'icone-180.png', tag: 'orga-' + (t || Date.now()) });
})()));
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const fenetres = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (fenetres.length) return fenetres[0].focus();
    return self.clients.openWindow('./');
  })());
});
