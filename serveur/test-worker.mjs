// Vérifie le serveur des rappels avec un faux stockage et un faux service de notifications : node serveur/test-worker.mjs
import assert from 'node:assert/strict';
import { traiter, tourner, lireInscription, lireReponse, personnalite, COMPAGNON_PAR_JOUR, ENVOIS_MAX } from './worker.js';
import { b64 } from './webpush.js';

// Faux stockage KV de Cloudflare.
const stock = new Map(), ops = { put: 0, get: 0, delete: 0, list: 0 };
const KV = {
  put: async (k, v) => { ops.put++; stock.set(k, v); }, get: async (k, type) => { ops.get++; return stock.has(k) ? (type === 'json' ? JSON.parse(stock.get(k)) : stock.get(k)) : null; },
  delete: async k => { ops.delete++; stock.delete(k); }, list: async ({ prefix }) => { ops.list++; return { keys: [...stock.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true }; },
};
const abonnes = () => [...stock.keys()].filter(k => k.startsWith('a:'));
const index = () => JSON.parse(stock.get('index:a') ?? 'null');
// Clés VAPID et clés d'un téléphone, générées pour le test.
const vapid = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
const vj = await crypto.subtle.exportKey('jwk', vapid.privateKey);
const env = { RAPPELS: KV, VAPID_PUBLIQUE: b64.vers(await crypto.subtle.exportKey('raw', vapid.publicKey)), VAPID_PRIVEE: vj.d };
const tel = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const auth = crypto.getRandomValues(new Uint8Array(16));
const abonnement = { endpoint: 'https://web.push.apple.com/QGv1abc', keys: { p256dh: b64.vers(await crypto.subtle.exportKey('raw', tel.publicKey)), auth: b64.vers(auth) } };

const T0 = Date.UTC(2026, 9, 26, 7, 0), s0 = T0 / 1000;
const requete = (chemin, corps, origine = 'https://emmajeuch.github.io') => new Request('https://orga-rappels.exemple.workers.dev' + chemin, { method: 'POST', headers: { Origin: origine, 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
const id = 'abcdefghijklmnopqrstuvwxyz012345';

// Refus : autre site, adresse qui n'est pas un service de notifications (pas d'appel vers n'importe où), mauvais identifiant.
assert.equal((await traiter(requete('/abonnement', { id, abonnement, rappels: [] }, 'https://pirate.exemple'), env, T0)).status, 403);
assert.equal((await traiter(requete('/abonnement', { id, abonnement: { ...abonnement, endpoint: 'https://169.254.169.254/latest' }, rappels: [] }), env, T0)).status, 422);
assert.equal((await traiter(requete('/abonnement', { id: 'court', abonnement, rappels: [] }), env, T0)).status, 422);
assert.equal(lireInscription({ id, abonnement, rappels: [s0 + 60, 'x', s0 - 999, s0 + 99 * 86400, s0 + 60] }, T0).rappels.length, 1);

// Inscription : seules l'adresse d'abonnement et les heures sont gardées, sous l'empreinte de l'identifiant.
assert.equal((await traiter(requete('/abonnement', { id, abonnement, rappels: [s0 + 600, s0 + 3600], titre: 'Cours de stats' }), env, T0)).status, 204);
const [cle] = abonnes();
assert.deepEqual(index(), [cle]);
assert.ok(cle.startsWith('a:') && !cle.includes(id));
assert.ok(!stock.get(cle).includes('stats'));
assert.deepEqual(JSON.parse(stock.get(cle)).rappels, [s0 + 600, s0 + 3600]);

// Passage du minuteur 10 minutes plus tard : un message chiffré part vers Apple, sans aucune écriture.
const envois = [];
const faux = async (url, init) => { envois.push({ url, init }); return { status: 201 }; };
const ecrituresAvant = ops.put + ops.delete;
assert.equal(await tourner(env, T0 + 600_000, faux), 1);
assert.equal(ops.put + ops.delete, ecrituresAvant);
assert.equal(await tourner(env, T0 + 720_000, faux), 0);           // le passage suivant ne le renvoie pas
assert.equal(envois[0].url, abonnement.endpoint);
assert.match(envois[0].init.headers.Authorization, /^vapid t=.+, k=/);
assert.deepEqual(JSON.parse(stock.get(cle)).rappels, [s0 + 600, s0 + 3600]);
// Le téléphone déchiffre et ne lit que l'heure du rappel.
const corps = envois[0].init.body, sel = corps.slice(0, 16), asPublic = corps.slice(21, 86);
const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []) }, tel.privateKey, 256));
const hk = async (salt, ikm, info, n) => new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: new TextEncoder().encode(info) }, await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), n * 8));
const uaPublic = b64.de(abonnement.keys.p256dh);
const keyInfo = new Uint8Array([...new TextEncoder().encode('WebPush: info\0'), ...uaPublic, ...asPublic]);
const ikm = new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: auth, info: keyInfo }, await crypto.subtle.importKey('raw', ecdh, 'HKDF', false, ['deriveBits']), 256));
const cek = await hk(sel, ikm, 'Content-Encoding: aes128gcm\0', 16), nonce = await hk(sel, ikm, 'Content-Encoding: nonce\0', 12);
const clair = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), corps.slice(86)));
assert.deepEqual(JSON.parse(new TextDecoder().decode(clair.slice(0, -1))), { t: s0 + 600 });

// Abonnement mort (410) : il est effacé. Désabonnement : effacé aussi.
await traiter(requete('/abonnement', { id, abonnement, rappels: [s0 + 3600] }), env, T0);
assert.equal(await tourner(env, T0 + 3600_000, async () => ({ status: 410 })), 1);
assert.equal(abonnes().length, 0); assert.deepEqual(index(), []);
await traiter(requete('/abonnement', { id, abonnement, rappels: [s0 + 7200] }), env, T0);
assert.equal((await traiter(requete('/desabonnement', { id }), env, T0)).status, 204);
assert.equal(abonnes().length, 0); assert.deepEqual(index(), []);
// Beaucoup de rappels à la même minute : au plus ENVOIS_MAX par passage, les autres au passage suivant, aucun en double.
{
  const ids = Array.from({ length: ENVOIS_MAX + 3 }, (_, i) => `appareil-numero-${String(i).padStart(10, '0')}`);
  for (const x of ids) await traiter(requete('/abonnement', { id: x, abonnement, rappels: [s0 + 600] }), env, T0);
  const vus = [];
  const compte = async (url, init) => { vus.push(init.body); return { status: 201 }; };
  assert.equal(await tourner(env, T0 + 600_000, compte), ENVOIS_MAX);
  assert.equal(JSON.parse(stock.get('index:report')).length, 3);    // les 3 en trop, gardés pour le passage suivant
  assert.equal(await tourner(env, T0 + 720_000, compte), 3);
  assert.ok(!stock.has('index:report'));
  assert.equal(await tourner(env, T0 + 840_000, compte), 0);
  // Une écriture refusée (quota) : le rappel part une seule fois, au premier passage, puis plus jamais.
  const kvPlein = { ...KV, put: async () => { throw new Error('quota'); } };
  await traiter(requete('/abonnement', { id, abonnement, rappels: [s0 + 1800] }), env, T0);
  let n = 0;
  const un = async () => { n++; return { status: 201 }; };
  await tourner({ ...env, RAPPELS: kvPlein }, T0 + 1800_000, un);
  await tourner({ ...env, RAPPELS: kvPlein }, T0 + 1920_000, un);
  assert.equal(n, 1);
  // Un service qui plante n'empêche pas les autres de recevoir le leur.
  await traiter(requete('/abonnement', { id: 'appareil-numero-0000000001', abonnement, rappels: [s0 + 3000] }), env, T0);
  await traiter(requete('/abonnement', { id: 'appareil-numero-0000000002', abonnement, rappels: [s0 + 3000] }), env, T0);
  let essais = 0;
  const panne = async () => { if (essais++ === 0) throw new Error('réseau'); return { status: 201 }; };
  assert.equal(await tourner(env, T0 + 3000_000, panne), 1);
  stock.clear();
}

// L'index des abonnements : le minuteur le lit au lieu de lister le stockage.
{
  stock.clear();
  for (const k in ops) ops[k] = 0;
  await traiter(requete('/abonnement', { id, abonnement, rappels: [s0 + 600] }), env, T0);
  assert.equal(ops.list, 1);                                  // l'index n'existait pas : construit une fois
  const ecritures = ops.put;
  await traiter(requete('/abonnement', { id, abonnement, rappels: [s0 + 900] }), env, T0);
  assert.equal(ops.put, ecritures + 1);                       // l'abonnement seulement : l'index n'a pas changé
  for (let k = 1; k <= 30; k++) await tourner(env, T0 + k * 120_000, async () => ({ status: 201 }));
  assert.equal(ops.list, 1);                                  // une heure de passages : aucun « list »
  // L'index perdu est reconstruit une fois, au passage suivant.
  stock.delete('index:a');
  await tourner(env, T0 + 4000_000, async () => ({ status: 201 }));
  await tourner(env, T0 + 4120_000, async () => ({ status: 201 }));
  assert.equal(ops.list, 2);
  assert.equal(index().length, 1);
  // Réparation de 3 h UTC : un abonnement absent de l'index (deux arrivés en même temps) y entre ; un expiré en sort ;
  // un tout neuf que la liste ne montre pas encore reste.
  const neuf = 'a:' + 'f'.repeat(64);
  stock.set('a:' + '0'.repeat(64), JSON.stringify({ abonnement, rappels: [] }));
  stock.set('index:a', JSON.stringify([...index(), 'a:' + 'e'.repeat(64), neuf]));
  stock.set(neuf, JSON.stringify({ abonnement, rappels: [] }));
  const kvLent = { ...KV, list: async o => { const r = await KV.list(o); return { ...r, keys: r.keys.filter(k => k.name !== neuf) }; } };
  const trois = Date.UTC(2026, 9, 27, 3, 0);
  await tourner({ ...env, RAPPELS: kvLent }, trois, async () => ({ status: 201 }));
  assert.deepEqual(new Set(index()), new Set([...abonnes()]));
  assert.ok(index().includes(neuf) && !index().includes('a:' + 'e'.repeat(64)));
  const listes = ops.list;
  await tourner(env, trois + 120_000, async () => ({ status: 201 }));
  assert.equal(ops.list, listes);                             // une seule réparation par jour
  stock.clear();
}

// Sauvegarde chiffrée : rangée telle quelle sous l'empreinte, rendue au même identifiant, effacée à la demande.
{
  const brut = (chemin, corps, origine = 'https://emmajeuch.github.io') => new Request('https://orga-rappels.exemple.workers.dev' + chemin, { method: 'POST', headers: { Origin: origine, 'Content-Type': 'text/plain' }, body: corps });
  assert.equal((await traiter(brut('/sauvegarde', `${id}\nAAAA\nQkJCQg==`, 'https://pirate.exemple'), env, T0)).status, 403);
  assert.equal((await traiter(brut('/sauvegarde', `court\nAAAA\nQkJCQg==`), env, T0)).status, 422);
  assert.equal((await traiter(brut('/sauvegarde', `${id}\nAAAA\nQkJCQg==\nen trop`), env, T0)).status, 422);
  assert.equal((await traiter(brut('/compte-creer', `${id}\nAAAA\nQkJCQg==`), env, T0)).status, 204);
  assert.equal((await traiter(brut('/compte-creer', `${id}\nBBBB\nQkJCQg==`), env, T0)).status, 409);   // existe déjà : refusé, rien d'écrasé
  assert.equal((await traiter(brut('/sauvegarde', `${id}\nAAAA\nQkJCQg==`), env, T0)).status, 204);
  const cleS = [...stock.keys()].find(k => k.startsWith('s:'));
  assert.ok(cleS && !cleS.includes(id));
  const r = await traiter(requete('/restauration', { id }), env, T0);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), 'AAAA\nQkJCQg==');
  assert.equal((await traiter(requete('/restauration', { id: 'zyxwvutsrqponmlkjihgfedcba543210' }), env, T0)).status, 404);
  assert.equal((await traiter(requete('/sauvegarde-effacer', { id }), env, T0)).status, 204);
  assert.equal((await traiter(requete('/restauration', { id }), env, T0)).status, 404);
}

// Avis : une note et un texte gardés ; lus seulement avec la clé.
{
  const lire = (cle) => new Request('https://orga-rappels.exemple.workers.dev/avis-liste', { method: 'POST', headers: { Origin: 'https://emmajeuch.github.io', 'Content-Type': 'application/json', ...(cle ? { Authorization: `Bearer ${cle}` } : {}) }, body: '{}' });
  assert.equal((await traiter(requete('/avis', { note: 4, texte: 'Super app', version: '1.10.0', nom: 'Léa' }), env, T0)).status, 204);
  assert.equal((await traiter(requete('/avis', { note: null, texte: 'Sans note' }), env, T0 + 1000)).status, 204);
  assert.equal((await traiter(requete('/avis', { note: 9, texte: 'x' }), env, T0)).status, 422);
  assert.equal((await traiter(requete('/avis', { note: null, texte: '  ' }), env, T0)).status, 422);
  assert.equal((await traiter(lire('mauvaise'), { ...env, AVIS_CLE: 'secret-avis' }, T0)).status, 401);
  assert.equal((await traiter(lire(), { ...env, AVIS_CLE: 'secret-avis' }, T0)).status, 401);
  assert.equal((await traiter(lire('x'), env, T0)).status, 503);
  const r = await traiter(lire('secret-avis'), { ...env, AVIS_CLE: 'secret-avis' }, T0);
  const avis = await r.json();
  assert.deepEqual(avis.map(a => [a.note, a.texte]), [[null, 'Sans note'], [4, 'Super app']]);
  assert.ok(!JSON.stringify(avis).includes('Léa'));
}

// Le compagnon : question vers l'IA, sortie vérifiée, limite par jour, rien de la question gardé.
{
  let appels = [], sortie = JSON.stringify({ reponse: 'Cale tes révisions le matin.', action: null });
  const AI = { run: async (m, o) => { appels.push({ m, o }); if (sortie instanceof Error) throw sortie; return { choices: [{ message: { content: sortie } }] }; } };
  const envIA = { ...env, AI }, idC = 'zyxwvutsrqponmlkjihgfedcba012345';
  const poser = (corps, e = envIA, t = T0) => traiter(requete('/compagnon', corps, undefined), e, t);
  const q = 'Comment caser mes révisions de Marie Curie ?', date = '2026-10-26';
  assert.equal((await traiter(requete('/compagnon', { id: idC, q, date }, 'https://pirate.exemple'), envIA, T0)).status, 403);
  for (const c of [{ id: 'court', q, date }, { id: idC, q: '  ', date }, { id: idC, q, date: 'hier' }, { id: idC, q: 5, date }]) assert.equal((await poser(c)).status, 422);
  assert.equal(appels.length, 0);
  let r = await poser({ id: idC, q: q + 'x'.repeat(900), date, titre: 'Secret' });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { reponse: 'Cale tes révisions le matin.', action: null });
  assert.equal(appels[0].o.chat_template_kwargs.enable_thinking, false);
  const [sys, usr] = appels[0].o.messages;
  assert.equal(sys.role, 'system'); assert.ok(sys.content.includes('lundi 2026-10-26'));
  assert.equal(usr.content.length, 500); assert.ok(!JSON.stringify(appels[0].o).includes('Secret'));
  const gardes = [...stock.entries()].filter(([k]) => k.startsWith('c:'));
  assert.equal(gardes.length, 1); assert.equal(gardes[0][1], '1'); assert.ok(!gardes[0][0].includes(idC));
  assert.ok(![...stock.values()].some(v => String(v).includes('Marie Curie')));
  // limite du jour : plus d'appel à l'IA ; le lendemain, ça repart
  stock.set(gardes[0][0], String(COMPAGNON_PAR_JOUR));
  const n = appels.length;
  assert.equal((await poser({ id: idC, q, date })).status, 429);
  assert.equal(appels.length, n);
  assert.equal((await poser({ id: idC, q, date }, envIA, T0 + 864e5)).status, 200);
  // quota épuisé ou modèle indisponible : 503, sans compter le message
  const avant = [...stock.keys()].filter(k => k.startsWith('c:')).length;
  sortie = new Error('quota');
  assert.equal((await poser({ id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', q, date })).status, 503);
  assert.equal([...stock.keys()].filter(k => k.startsWith('c:')).length, avant);
  sortie = 'pas du json';
  assert.equal((await poser({ id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', q, date })).status, 502);
  // une personnalité par créature ; une créature inconnue donne le ton neutre
  sortie = JSON.stringify({ reponse: 'Ok', action: null });
  const sysDe = async creature => { const avantN = appels.length; assert.equal((await poser({ id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', q, date, creature })).status, 200); assert.equal(appels.length, avantN + 1); return appels.at(-1).o.messages[0].content; };
  assert.ok((await sysDe('caillou')).includes('Ton caractère : Jamais plus de six mots'));
  assert.ok((await sysDe('cactou')).includes('jamais l\'exactitude'));
  for (const c of [undefined, 'inconnue', '__proto__', 'constructor', 5, { a: 1 }]) assert.ok(!(await sysDe(c)).includes('Ton caractère'));
  assert.equal(personnalite('astro').length > 0, true);
  // question de sport : contexte vérifié, quatre phrases, rien sans sport
  const avecSport = async sport => { assert.equal((await poser({ id: 'cccccccccccccccccccccccccccccccc', q, date, sport })).status, 200); return appels.at(-1).o.messages[0].content; };
  const perso = await avecSport({ nom: 'Curling', fiche: 'Huit pierres par manche.', origine: 'utilisateur' });
  assert.ok(perso.includes('Repères écrits par l\'utilisateur, non vérifiés') && !perso.includes('règlement officiel :'));
  assert.ok((await avecSport({ nom: 'Curling', fiche: 'X', origine: 'pirate' })).includes('non vérifiés'));   // origine inconnue : jamais officielle
  let sp = await avecSport({ nom: 'Sabre laser', role: 'Duelliste', mode: 'combat', fiche: 'Points : tête 5.', origine: 'officielle', club: 'Club secret' });
  assert.ok(sp.includes('quatre phrases') && sp.includes('Question sur le sport : Sabre laser.') && sp.includes('Poste ou rôle : Duelliste.') && sp.includes('Pratique : combat.') && sp.includes('Repères tirés du règlement officiel : Points : tête 5.'));
  assert.ok(!sp.includes('Club secret'));
  sp = await avecSport({ nom: 'Curling', mode: 'pirate', fiche: 'x'.repeat(5000) });
  assert.ok(!sp.includes('pirate') && !sp.includes('x'.repeat(1001)));
  for (const s of [undefined, 'volley', { nom: '  ' }, { role: 'X' }]) { const c = await avecSport(s); assert.ok(c.includes('deux phrases') && !c.includes('Question sur le sport')); }
  // ce que renvoie l'IA est filtré
  assert.deepEqual(lireReponse('Voici : {"reponse":"Ok","action":{"type":"creneau","titre":" Dentiste ","date":"2026-11-09","s":18,"x":"<b>"}} fin'), { reponse: 'Ok', action: { type: 'creneau', titre: 'Dentiste', date: '2026-11-09', s: 18, e: 19 } });
  assert.deepEqual(lireReponse({ reponse: 'Ok', action: { type: 'tache', titre: 'Pain', date: '', heure: 40 } }).action, { type: 'tache', titre: 'Pain', echeance: '', heure: null });
  assert.deepEqual(lireReponse({ reponse: 'Ok', action: { type: 'deplacer', titre: 'Sport', date: null, s: 17 } }).action, { type: 'deplacer', titre: 'Sport', source: null, date: null, s: 17 });
  for (const a of [{ type: 'supprimer', titre: 'Tout' }, { type: 'creneau', titre: 'X', date: 'demain', s: 18 }, { type: 'creneau', date: '2026-11-09', s: 18 }, { type: 'deplacer', titre: 'X', date: null, s: null }, 'x']) assert.equal(lireReponse({ reponse: 'Ok', action: a }).action, null);
  assert.equal(lireReponse({ reponse: '' }), null);
  assert.equal(lireReponse(null), null);
}

console.log('ok');
