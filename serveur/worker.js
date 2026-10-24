// Serveur des rappels et des sauvegardes (Cloudflare Workers, offre gratuite).
// Il ne connaît que deux choses par appareil : l'adresse d'abonnement fournie par le service de
// notifications (Apple, Google…) et les HEURES des rappels à venir. Jamais le titre d'un cours, une
// salle ou un texte : c'est le téléphone qui écrit la notification au moment de l'afficher.
// La sauvegarde automatique, si on l'active, est chiffrée sur le téléphone avec une clé tirée du code de
// récupération ; le serveur ne garde que la dernière copie, illisible pour lui, sous l'empreinte d'un identifiant.
import { envoyer } from './webpush.js';

const ORIGINE = 'https://emmajeuch.github.io';
// Seuls les services de notifications officiels sont acceptés : le serveur n'appelle jamais une autre adresse.
const SERVICES = ['web.push.apple.com', 'fcm.googleapis.com', 'updates.push.services.mozilla.com'];
const serviceConnu = url => { try { const u = new URL(url); return u.protocol === 'https:' && (SERVICES.includes(u.hostname) || u.hostname.endsWith('.notify.windows.com')); } catch { return false; } };
const TAILLE_MAX = 16_000, RAPPELS_MAX = 300, GARDE = 30 * 864e2; // 30 jours sans nouvelle : l'abonnement est oublié
const SAUV_MAX = 4_000_000, GARDE_SAUV = 180 * 864e2;              // une copie de 4 Mo au plus, oubliée après 180 jours sans nouvelle
const B64URL = /^[A-Za-z0-9_-]+$/;

const cors = { 'Access-Control-Allow-Origin': ORIGINE, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' };
const repondre = (statut, corps = '') => new Response(statut === 204 ? null : corps, { status: statut, headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

// La clé de stockage est l'empreinte de l'identifiant : même avec une copie du stockage, on ne peut pas se faire passer pour un appareil.
async function cleDe(id, prefixe = 'a:') {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id)));
  return prefixe + [...h].map(x => x.toString(16).padStart(2, '0')).join('');
}
const idValide = id => typeof id === 'string' && id.length >= 22 && id.length <= 64 && B64URL.test(id);
const B64 = /^[A-Za-z0-9+/=]+$/;

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
  if (chemin === '/sauvegarde') {
    if (texte.length > SAUV_MAX) return repondre(413);
    const [id, iv, d, reste] = texte.split('\n');
    if (!idValide(id) || !iv || iv.length > 32 || !B64.test(iv) || !d || reste !== undefined) return repondre(422);
    await env.RAPPELS.put(await cleDe(id, 's:'), `${iv}\n${d}`, { expirationTtl: GARDE_SAUV });
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
  if (chemin === '/abonnement') {
    const ins = lireInscription(o, maintenant);
    if (!ins) return repondre(422);
    await env.RAPPELS.put(await cleDe(ins.id), JSON.stringify({ abonnement: ins.abonnement, rappels: ins.rappels }), { expirationTtl: GARDE });
    return repondre(204);
  }
  if (chemin === '/desabonnement') {
    if (typeof o.id !== 'string' || !B64URL.test(o.id) || o.id.length > 64) return repondre(422);
    await env.RAPPELS.delete(await cleDe(o.id));
    return repondre(204);
  }
  return repondre(404);
}

// Toutes les 2 minutes : envoie les rappels arrivés à échéance, puis les retire.
export async function tourner(env, maintenant = Date.now(), faireFetch = fetch) {
  const s = Math.floor(maintenant / 1000), cles = { publique: env.VAPID_PUBLIQUE.trim(), privee: env.VAPID_PRIVEE.trim(), sujet: 'https://emmajeuch.github.io/app-organisation/' };
  let curseur, envoyes = 0;
  do {
    const page = await env.RAPPELS.list({ prefix: 'a:', cursor: curseur });
    for (const { name } of page.keys) {
      const entree = await env.RAPPELS.get(name, 'json');
      if (!entree) continue;
      const dus = entree.rappels.filter(t => t <= s);
      if (!dus.length) continue;
      const restants = entree.rappels.filter(t => t > s);
      // Un seul message par passage : le plus récent ; un rappel de plus de 15 minutes de retard est abandonné.
      const t = dus.at(-1);
      if (s - t <= 900) {
        const statut = await envoyer(entree.abonnement, JSON.stringify({ t }), cles, faireFetch);
        envoyes++;
        console.log('envoi', statut); // seul le code de réponse du service, pour savoir si Apple accepte
        if (statut === 404 || statut === 410) { await env.RAPPELS.delete(name); continue; }
      }
      await env.RAPPELS.put(name, JSON.stringify({ abonnement: entree.abonnement, rappels: restants }), { expirationTtl: GARDE });
    }
    curseur = page.list_complete ? undefined : page.cursor;
  } while (curseur);
  return envoyes;
}

export default {
  fetch: (req, env) => traiter(req, env),
  scheduled: (evt, env, ctx) => ctx.waitUntil(tourner(env)),
};
