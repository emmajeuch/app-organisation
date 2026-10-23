// Vérifie le serveur des rappels avec un faux stockage et un faux service de notifications : node serveur/test-worker.mjs
import assert from 'node:assert/strict';
import { traiter, tourner, lireInscription } from './worker.js';
import { b64 } from './webpush.js';

// Faux stockage KV de Cloudflare.
const stock = new Map();
const KV = {
  put: async (k, v) => { stock.set(k, v); }, get: async (k, type) => stock.has(k) ? (type === 'json' ? JSON.parse(stock.get(k)) : stock.get(k)) : null,
  delete: async k => { stock.delete(k); }, list: async ({ prefix }) => ({ keys: [...stock.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true }),
};
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
const [cle] = [...stock.keys()];
assert.ok(cle.startsWith('a:') && !cle.includes(id));
assert.ok(!stock.get(cle).includes('stats'));
assert.deepEqual(JSON.parse(stock.get(cle)).rappels, [s0 + 600, s0 + 3600]);

// Passage du minuteur 10 minutes plus tard : un message chiffré part vers Apple, le rappel est retiré.
const envois = [];
const faux = async (url, init) => { envois.push({ url, init }); return { status: 201 }; };
assert.equal(await tourner(env, T0 + 600_000, faux), 1);
assert.equal(envois[0].url, abonnement.endpoint);
assert.match(envois[0].init.headers.Authorization, /^vapid t=.+, k=/);
assert.deepEqual(JSON.parse(stock.get(cle)).rappels, [s0 + 3600]);
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
assert.equal(stock.size, 0);
await traiter(requete('/abonnement', { id, abonnement, rappels: [s0 + 7200] }), env, T0);
assert.equal((await traiter(requete('/desabonnement', { id }), env, T0)).status, 204);
assert.equal(stock.size, 0);
console.log('ok');
