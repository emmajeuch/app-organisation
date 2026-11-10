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

// Le compagnon : la question part vers Workers AI ; rien n'est gardé, sauf le compteur du jour, sous l'empreinte d'un identifiant tiré au hasard.
const MODELE = '@cf/google/gemma-4-26b-a4b-it', QUESTION_MAX = 500;
export const COMPAGNON_PAR_JOUR = 30;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
// Une personnalité par créature : le ton change, pas l'exactitude.
const PERSONNALITES = {
  ronfleur: 'Parle au ralenti, bâille, voudrait retourner dormir ; rappelle toujours de se coucher à l\'heure.',
  gratte: 'Note tout, cite son carnet, numérote même les broutilles.',
  sprintou: 'Phrases très courtes, toujours pressé, tout est une course.',
  grignote: 'Ramène tout à la nourriture, négocie avec des goûters.',
  plumette: 'Légère, rit facilement, dédramatise, s\'éparpille un peu.',
  flanou: 'Répète que rien ne presse, puis avoue qu\'il faudra s\'y mettre.',
  bricolo: 'Voit chaque souci comme une panne, parle outils et réparations.',
  caillou: 'Jamais plus de six mots par phrase. Jamais ému, toujours fiable.',
  brindille: 'S\'inquiète, demande d\'y aller doucement, a peur qu\'on casse.',
  mirabelle: 'Enthousiasme excessif, tout est une fête.',
  tourbillon: 'Parle vite, saute d\'une idée à l\'autre, finit sur une seule action claire.',
  pepite: 'Se vante sans arrêt, mais trouve l\'autre précieux aussi.',
  nuage: 'Rêveur, soupire, semble toujours un peu ailleurs.',
  cactou: 'Piquant et franc sur la situation, jamais sur la personne. Refuse les câlins, conseils justes.',
  lumino: 'Théâtral, annonce tout comme un spectacle.',
  zephyr: 'Joueur, insaisissable, lance des défis.',
  moufle: 'Câline, réclame de l\'attention, console avant de conseiller.',
  bulle: 'Rit de ses propres blagues, perd parfois le fil.',
  pistache: 'Découpe tout en petites bouchées.',
  gribouille: 'Distrait, propose toujours de dessiner ou de faire un schéma.',
  noisette: 'Prévoyante, pense toujours à demain, parle de réserves.',
  brume: 'Timide, chuchote, s\'excuse de déranger.',
  corniche: 'Fonce tête baissée, attaque le plus dur d\'abord.',
  papilla: 'Douce, virevolte, conseille d\'alterner.',
  grelot: 'Parle en rythme, compte les temps, adore minuter.',
  frimas: 'Calme glacial, garde la tête froide, frileux.',
  draconet: 'Se prend pour un grand dragon, fanfaronne.',
  astro: 'Parle comme un tableau de bord, mission et décollage.',
  vortex: 'Intense, ramène tout à une seule chose à la fois.',
  sylphe: 'Sereine, posée, parle de souffle et de rythme.',
  phenix: 'A tout vécu, rappelle qu\'on se relève d\'un échec.',
  comete: 'Passe en coup de vent, très brève, parle de vœux.',
};
export const personnalite = c => typeof c === 'string' && Object.hasOwn(PERSONNALITES, c) ? PERSONNALITES[c] : '';
// Le contexte d'une question de sport, vérifié : des champs courts, rien de plus.
export function lireSport(s) {
  if (!s || typeof s !== 'object' || typeof s.nom !== 'string' || !s.nom.trim()) return null;
  const court = (v, n) => typeof v === 'string' ? v.trim().slice(0, n) : '';
  const officielle = s.origine === 'officielle', fiche = court(s.fiche, 1000);
  // Une fiche d'origine inconnue est traitée comme écrite par l'utilisateur : jamais présentée comme officielle.
  return { nom: court(s.nom, 40), role: court(s.role, 60), mode: ['combat', 'artistique', 'les deux'].includes(s.mode) ? s.mode : '', officielle: officielle ? fiche : '', perso: court(s.perso, 1000) || (officielle ? '' : fiche) };
}
const contexteSport = s => `\nQuestion sur le sport : ${s.nom}.${s.role ? ` Poste ou rôle : ${s.role}.` : ''}${s.mode ? ` Pratique : ${s.mode}.` : ''}
${s.officielle ? `Repères tirés du règlement officiel : ${s.officielle}\n` : ''}${s.perso ? `Repères écrits par l'utilisateur, non vérifiés (ne les présente pas comme officiels, signale s'ils te semblent faux) : ${s.perso}\n` : ''}Propose des exercices et des stratégies courants. Si la question porte sur une règle absente des repères, dis que tu n'es pas sûr et renvoie au règlement de la fédération. Pas de charge imposée ; en cas de douleur, arrête et parles-en à un professionnel.`;
const consigne = (date, creature, sport) => `Tu es le compagnon d'une app d'organisation sur téléphone. Tu réponds en français, en tutoyant, en ${sport ? 'quatre' : 'deux'} phrases au plus. Tu ne parles que d'organisation, de tâches, d'habitudes, de sport courant et de l'app ; sinon, dis gentiment que ce n'est pas ton rôle. N'invente aucune fonction de l'app : si tu ne sais pas, dis-le.
${personnalite(creature) ? `Ton caractère : ${personnalite(creature)} Il change ton ton, jamais l'exactitude de tes conseils. Jamais de moquerie blessante.\n` : ''}Aujourd'hui : ${['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][new Date(date + 'T12:00:00Z').getUTCDay()]} ${date}.
L'app : Aujourd'hui montre la journée ; Semaine montre la grille, Semaine › Modifier règle ce qui revient chaque semaine. On valide chaque créneau après sa fin, ce qui allume la flamme et donne de l'XP. Notes regroupe tâches, habitudes, objectifs, listes et notes. Sport : un bloc par sport, avec la fiche des règles, les questions, les séances, les exercices et les compétitions ; on y écrit la fiche d'un sport (« Écrire la fiche de ce sport ») ou on suggère une correction (« Suggérer une correction »). Profil montre la progression et les Réglages (la roue). Un avis, un bug ou une idée : Profil › ⚙ › Aide et avis › Donner mon avis. On parle au compagnon en le touchant deux fois.
Réponds uniquement par un objet JSON : {"reponse": "ton texte", "action": null}.
Seulement si on te demande d'ajouter ou de déplacer quelque chose, "action" vaut l'un de ceux-ci (heures en nombre décimal, 18.5 pour 18 h 30) :
{"type":"creneau","titre":"…","date":"AAAA-MM-JJ","s":18,"e":19}
{"type":"tache","titre":"…","date":"AAAA-MM-JJ ou vide","heure":null}
{"type":"deplacer","titre":"…","date":"AAAA-MM-JJ ou null","s":18}${sport ? contexteSport(sport) : ''}`;
// Ce que renvoie l'IA n'est pas fiable : seuls des champs vérifiés repartent vers le téléphone.
function lireAction(a) {
  if (!a || typeof a !== 'object') return null;
  const titre = typeof a.titre === 'string' ? a.titre.trim().slice(0, 80) : '', date = DATE.test(a.date) ? a.date : '', h = x => typeof x === 'number' && x >= 0 && x <= 26 ? x : null;
  if (!titre) return null;
  const s = h(a.s), e = h(a.e);
  if (a.type === 'creneau' && date && s !== null) return { type: 'creneau', titre, date, s, e: e > s ? e : s + 1 };
  if (a.type === 'tache') return { type: 'tache', titre, echeance: date, heure: h(a.heure) };
  if (a.type === 'deplacer' && (date || s !== null)) return { type: 'deplacer', titre, source: null, date: date || null, s };
  return null;
}
export function lireReponse(brut) {
  let o = brut;
  if (typeof o === 'string') { try { o = JSON.parse(o.slice(o.indexOf('{'), o.lastIndexOf('}') + 1)); } catch { return null; } }
  const reponse = typeof o?.reponse === 'string' ? o.reponse.trim().slice(0, 600) : '';
  return reponse ? { reponse, action: lireAction(o.action) } : null;
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
  if (chemin === '/compagnon') {
    const q = typeof o.q === 'string' ? o.q.trim().slice(0, QUESTION_MAX) : '';
    if (!idValide(o.id) || !q || !DATE.test(o.date)) return repondre(422);
    // ponytail: une écriture KV par message (1 000 par jour pour tout le serveur) ; à revoir au-delà d'une cinquantaine d'utilisateurs.
    const cle = await cleDe(o.id, `c:${new Date(maintenant).toISOString().slice(0, 10)}:`);
    const deja = +(await env.RAPPELS.get(cle)) || 0;
    if (deja >= COMPAGNON_PAR_JOUR) return repondre(429);
    let sortie;
    try {
      const r = await env.AI.run(MODELE, { messages: [{ role: 'system', content: consigne(o.date, o.creature, lireSport(o.sport)) }, { role: 'user', content: q }], max_completion_tokens: 300, response_format: { type: 'json_object' }, chat_template_kwargs: { enable_thinking: false } });   // sans ça, le modèle use tous ses jetons à réfléchir
      sortie = lireReponse(r.choices?.[0]?.message?.content ?? r.response);
    } catch (e) { console.log('IA', e?.name); return repondre(503); }   // quota du jour épuisé ou modèle indisponible ; la question n'est jamais écrite dans les journaux
    if (!sortie) return repondre(502);
    try { await env.RAPPELS.put(cle, String(deja + 1), { expirationTtl: 2 * 864e2 }); } catch { console.log('écriture refusée'); }
    return new Response(JSON.stringify(sortie), { status: 200, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
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
const PAS = 120;                  // un passage toutes les 2 minutes (crons de wrangler.toml)
const REPORT = 'index:report';    // les envois en trop d'un passage, pour le suivant

// Toutes les 2 minutes : envoie les rappels tombés depuis le passage précédent, sans rien réécrire (une écriture
// par rappel coûtait la moitié du quota gratuit). Un rappel ne tombe que dans un seul passage, il ne part donc
// qu'une fois. ponytail: si Cloudflare saute un passage, les rappels de ces 2 minutes ne partent pas ; garder
// l'heure du dernier passage coûterait 720 écritures par jour.
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
  const perdus = [], enTrop = [];
  const envoyerA = async (name, abonnement, t) => {
    if (envoyes >= ENVOIS_MAX) { enTrop.push([name, t]); return; }
    const statut = await envoyer(abonnement, JSON.stringify({ t }), cles, faireFetch);
    envoyes++;
    console.log('envoi', statut); // seul le code de réponse du service, pour savoir si Apple accepte
    if (statut === 404 || statut === 410) { await env.RAPPELS.delete(name); perdus.push(name); }
  };
  // D'abord ce qui n'a pas pu partir au passage précédent ; abandonné après 15 minutes de retard.
  const report = await env.RAPPELS.get(REPORT, 'json') || [];
  for (const [name, t] of report) {
    if (s - t > 900) continue;
    try { const entree = await env.RAPPELS.get(name, 'json'); if (entree) await envoyerA(name, entree.abonnement, t); }
    catch (e) { console.log('échec', e?.name); }
  }
  for (const name of index) {
    try {
      const entree = await env.RAPPELS.get(name, 'json');
      if (!entree) { if (liste && !liste.includes(name)) perdus.push(name); continue; }
      // Un seul message par passage : le plus récent des rappels tombés depuis le passage précédent.
      const dus = entree.rappels.filter(t => t > s - PAS && t <= s);
      if (dus.length) await envoyerA(name, entree.abonnement, dus.at(-1));
    } catch (e) { console.log('échec', e?.name); } // un abonnement en panne n'arrête pas les autres
  }
  // Une écriture seulement s'il y a eu trop d'envois, ou pour vider la liste du passage précédent.
  try {
    if (enTrop.length) await env.RAPPELS.put(REPORT, JSON.stringify(enTrop));
    else if (report.length) await env.RAPPELS.delete(REPORT);
  } catch { console.log('écriture refusée'); }
  // Les abonnements morts sortent de l'index en une seule écriture.
  if (perdus.length) { try { await changerIndex(env, l => l.filter(k => !perdus.includes(k))); } catch { console.log('écriture refusée'); } }
  return envoyes;
}

export default {
  fetch: (req, env) => traiter(req, env),
  scheduled: (evt, env, ctx) => ctx.waitUntil(tourner(env, evt.scheduledTime)),
};
