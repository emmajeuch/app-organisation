// Serveur des rappels et des sauvegardes (Cloudflare Workers, offre gratuite).
// Il ne connaît que deux choses par appareil : l'adresse d'abonnement fournie par le service de
// notifications (Apple, Google…) et les HEURES des rappels à venir. Jamais le titre d'un cours, une
// salle ou un texte : c'est le téléphone qui écrit la notification au moment de l'afficher.
// Avec un compte, une copie est chiffrée sur le téléphone avec une clé tirée de l'identifiant et du mot de passe ;
// le serveur ne garde que la dernière copie, illisible pour lui, sous l'empreinte d'un identifiant dérivé.
import { envoyer } from './webpush.js';

const ORIGINE = 'https://emmajeuch.github.io';
// Seuls les services de notifications officiels sont acceptés : le serveur n'appelle jamais une autre adresse.
const SERVICES = ['web.push.apple.com', 'fcm.googleapis.com', 'updates.push.services.mozilla.com'];
const serviceConnu = url => { try { const u = new URL(url); return u.protocol === 'https:' && (SERVICES.includes(u.hostname) || u.hostname.endsWith('.notify.windows.com')); } catch { return false; } };
const TAILLE_MAX = 16_000, RAPPELS_MAX = 300, GARDE = 30 * 864e2; // 30 jours sans nouvelle : l'abonnement est oublié
const SAUV_MAX = 4_000_000, GARDE_SAUV = 180 * 864e2;              // une copie de 4 Mo au plus, oubliée après 180 jours sans nouvelle
const B64URL = /^[A-Za-z0-9_-]+$/;

const cors = { 'Access-Control-Allow-Origin': ORIGINE, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '86400', Vary: 'Origin' };
const GARDE_AVIS = 365 * 864e2;   // un avis est gardé un an
const repondre = (statut, corps = '') => new Response(statut === 204 ? null : corps, { status: statut, headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

// La clé de stockage est l'empreinte de l'identifiant : même avec une copie du stockage, on ne peut pas se faire passer pour un appareil.
async function cleDe(id, prefixe = 'a:') {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id)));
  return prefixe + [...h].map(x => x.toString(16).padStart(2, '0')).join('');
}
// Comparaison en temps constant, pour ne pas laisser deviner la clé des avis caractère par caractère.
const egal = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
const idValide = id => typeof id === 'string' && id.length >= 22 && id.length <= 64 && B64URL.test(id);
const B64 = /^[A-Za-z0-9+/=]+$/;

// La liste des abonnements tient dans une seule clé : le minuteur la lit (une lecture) au lieu de lister
// le stockage à chaque passage (720 « list » par jour, sur 1 000 permis par l'offre gratuite).
const INDEX = 'index:a';
async function listerAbonnements(env) {
  const cles = [];
  let curseur;
  do {
    const page = await env.RAPPELS.list({ prefix: 'a:', cursor: curseur });
    cles.push(...page.keys.map(k => k.name));
    curseur = page.list_complete ? undefined : page.cursor;
  } while (curseur);
  return cles;
}
const memes = (a, b) => a.length === b.length && a.every(k => b.includes(k));
// L'index n'est réécrit que s'il change : chaque écriture compte (1 000 par jour).
async function changerIndex(env, changer) {
  const avant = await env.RAPPELS.get(INDEX, 'json');
  const apres = changer(avant ?? await listerAbonnements(env));
  if (!avant || !memes(apres, avant)) await env.RAPPELS.put(INDEX, JSON.stringify(apres));
}
const ajouterIndex = (env, cle) => changerIndex(env, l => l.includes(cle) ? l : [...l, cle]);
const retirerIndex = (env, cle) => changerIndex(env, l => l.filter(k => k !== cle));

// Vérifie et réduit ce qu'envoie le téléphone ; tout le reste est ignoré.
export function lireInscription(o, maintenant) {
  if (!o || typeof o !== 'object') return null;
  const { id, abonnement, rappels } = o;
  if (typeof id !== 'string' || id.length < 22 || id.length > 64 || !B64URL.test(id)) return null;
  if (!abonnement || typeof abonnement.endpoint !== 'string' || abonnement.endpoint.length > 1000 || !serviceConnu(abonnement.endpoint)) return null;
  const k = abonnement.keys || {};
  if (typeof k.p256dh !== 'string' || !B64URL.test(k.p256dh) || k.p256dh.length !== 87) return null;
  if (typeof k.auth !== 'string' || !B64URL.test(k.auth) || k.auth.length !== 22) return null;
  if (!Array.isArray(rappels)) return null;
  const s = Math.floor(maintenant / 1000);
  const t = [...new Set(rappels.filter(x => Number.isInteger(x) && x > s - 60 && x < s + 15 * 86400))].sort((a, b) => a - b).slice(0, RAPPELS_MAX);
  return { id, abonnement: { endpoint: abonnement.endpoint, keys: { p256dh: k.p256dh, auth: k.auth } }, rappels: t };
}

export async function traiter(req, env, maintenant = Date.now()) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.headers.get('Origin') !== ORIGINE) return repondre(403, 'origine refusée');
  if (req.method !== 'POST') return repondre(405);
  const chemin = new URL(req.url).pathname;
  const texte = await req.text();
  // La copie chiffrée arrive en texte brut, « identifiant, vecteur, données » sur trois lignes : pas de JSON à
  // analyser (l'offre gratuite donne 10 ms de calcul par requête). Elle est rangée telle quelle, jamais lue.
  if (chemin === '/sauvegarde' || chemin === '/compte-creer') {
    if (texte.length > SAUV_MAX) return repondre(413);
    const [id, iv, d, reste] = texte.split('\n');
    if (!idValide(id) || !iv || iv.length > 32 || !B64.test(iv) || !d || reste !== undefined) return repondre(422);
    const cle = await cleDe(id, 's:');
    // ponytail: lire puis écrire n'est pas atomique ; deux créations à la même seconde avec les mêmes identifiant et mot de passe passeraient.
    if (chemin === '/compte-creer' && await env.RAPPELS.get(cle) !== null) return repondre(409);
    await env.RAPPELS.put(cle, `${iv}\n${d}`, { expirationTtl: GARDE_SAUV });
    return repondre(204);
  }
  if (texte.length > TAILLE_MAX) return repondre(413);
  let o;
  try { o = JSON.parse(texte); } catch { return repondre(400); }
  if (chemin === '/restauration' || chemin === '/sauvegarde-effacer') {
    if (!idValide(o.id)) return repondre(422);
    const cle = await cleDe(o.id, 's:');
    if (chemin === '/sauvegarde-effacer') { await env.RAPPELS.delete(cle); return repondre(204); }
    const copie = await env.RAPPELS.get(cle);
    return copie === null ? repondre(404) : repondre(200, copie);
  }
  // Les avis des testeurs : une note de 1 à 5 et un texte, sans rien qui identifie la personne.
  if (chemin === '/avis') {
    const note = o.note === null || o.note === undefined ? null : Number.isInteger(o.note) && o.note >= 1 && o.note <= 5 ? o.note : undefined;
    const texte = typeof o.texte === 'string' ? o.texte.slice(0, 2000) : '';
    const version = typeof o.version === 'string' ? o.version.slice(0, 20) : '';
    if (note === undefined || (note === null && !texte.trim())) return repondre(422);
    const date = new Date(maintenant).toISOString();
    await env.RAPPELS.put(`v:${date}:${crypto.randomUUID().slice(0, 8)}`, JSON.stringify({ date, note, texte, version }), { expirationTtl: GARDE_AVIS });
    return repondre(204);
  }
  // Lire les avis : seulement avec la clé d'Emma (secret Cloudflare AVIS_CLE), jamais affichée dans le code.
  if (chemin === '/avis-liste') {
    const cle = env.AVIS_CLE?.trim();
    if (!cle) return repondre(503, 'clé des avis absente : npx.cmd wrangler secret put AVIS_CLE');
    if (!egal(req.headers.get('Authorization') || '', `Bearer ${cle}`)) return repondre(401);
    const avis = [];
    const page = await env.RAPPELS.list({ prefix: 'v:', limit: 1000 });
    for (const { name } of page.keys) { const a = await env.RAPPELS.get(name, 'json'); if (a) avis.push(a); }
    avis.sort((a, b) => b.date.localeCompare(a.date));
    return new Response(JSON.stringify(avis), { status: 200, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  }
  if (chemin === '/abonnement') {
    const ins = lireInscription(o, maintenant);
    if (!ins) return repondre(422);
    const cle = await cleDe(ins.id);
    await env.RAPPELS.put(cle, JSON.stringify({ abonnement: ins.abonnement, rappels: ins.rappels }), { expirationTtl: GARDE });
    await ajouterIndex(env, cle);
    return repondre(204);
  }
  if (chemin === '/desabonnement') {
    if (typeof o.id !== 'string' || !B64URL.test(o.id) || o.id.length > 64) return repondre(422);
    const cle = await cleDe(o.id);
    await env.RAPPELS.delete(cle);
    await retirerIndex(env, cle);
    return repondre(204);
  }
  return repondre(404);
}

// Au plus ENVOIS_MAX messages par passage : l'offre gratuite donne 10 ms de calcul, et un envoi en coûte un peu
// plus d'une (chiffrement et signature). Les suivants partent au passage d'après, 2 minutes plus tard.
export const ENVOIS_MAX = 5;

// Toutes les 2 minutes : envoie les rappels arrivés à échéance, puis les retire.
// Le rappel est retiré AVANT l'envoi : si le passage s'arrête en route, il ne repart pas une deuxième fois.
export async function tourner(env, maintenant = Date.now(), faireFetch = fetch) {
  const s = Math.floor(maintenant / 1000), cles = { publique: env.VAPID_PUBLIQUE.trim(), privee: env.VAPID_PRIVEE.trim(), sujet: 'https://emmajeuch.github.io/app-organisation/' };
  // Une fois par jour (le passage de 3 h 00 UTC), l'index est complété par une liste du stockage : il rattrape deux
  // abonnements arrivés au même moment. Un abonnement expiré (30 jours sans nouvelle) en sort ce jour-là, s'il manque
  // à la fois dans la liste et à la lecture : le stockage peut mettre une minute à montrer un abonnement tout neuf.
  const h = new Date(maintenant), reparer = h.getUTCHours() === 3 && h.getUTCMinutes() < 2;
  const avant = await env.RAPPELS.get(INDEX, 'json');
  let index = avant, liste = null;
  if (!index || reparer) {
    liste = await listerAbonnements(env);
    index = [...new Set([...(avant || []), ...liste])];
    if (!avant || !memes(index, avant)) await env.RAPPELS.put(INDEX, JSON.stringify(index));
  }
  let envoyes = 0;
  const perdus = [];
  for (const name of index) {
    if (envoyes >= ENVOIS_MAX) break;
    try {
      const entree = await env.RAPPELS.get(name, 'json');
      if (!entree) { if (liste && !liste.includes(name)) perdus.push(name); continue; }
      const dus = entree.rappels.filter(t => t <= s);
      if (!dus.length) continue;
      const restants = entree.rappels.filter(t => t > s);
      // Un seul message par passage : le plus récent ; un rappel de plus de 15 minutes de retard est abandonné.
      const t = dus.at(-1);
      let retire = true;
      try { await env.RAPPELS.put(name, JSON.stringify({ abonnement: entree.abonnement, rappels: restants }), { expirationTtl: GARDE }); }
      catch { retire = false; console.log('écriture refusée'); } // quota du jour atteint, par exemple
      // Si le rappel n'a pas pu être retiré, il ne part qu'au premier passage après son heure, pour ne pas le répéter.
      if (s - t > 900 || (!retire && s - t >= 120)) continue;
      const statut = await envoyer(entree.abonnement, JSON.stringify({ t }), cles, faireFetch);
      envoyes++;
      console.log('envoi', statut); // seul le code de réponse du service, pour savoir si Apple accepte
      if (statut === 404 || statut === 410) { await env.RAPPELS.delete(name); perdus.push(name); }
    } catch (e) { console.log('échec', e?.name); } // un abonnement en panne n'arrête pas les autres
  }
  // Les abonnements morts sortent de l'index en une seule écriture.
  if (perdus.length) { try { await changerIndex(env, l => l.filter(k => !perdus.includes(k))); } catch { console.log('écriture refusée'); } }
  return envoyes;
}

export default {
  fetch: (req, env) => traiter(req, env),
  scheduled: (evt, env, ctx) => ctx.waitUntil(tourner(env, evt.scheduledTime)),
};
