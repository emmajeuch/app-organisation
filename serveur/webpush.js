// Envoi d'une notification Web Push sans bibliothèque, avec l'API de chiffrement standard (WebCrypto) :
// contenu chiffré en aes128gcm (RFC 8291) et serveur identifié par une signature VAPID (RFC 8292).
// Le même fichier tourne dans Cloudflare Workers et dans Node (tests).

const enc = new TextEncoder();

export const b64 = {
  de: s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), c => c.charCodeAt(0)),
  vers: u => btoa(String.fromCharCode(...new Uint8Array(u))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
};
const concat = (...parts) => {
  const t = new Uint8Array(parts.reduce((k, x) => k + x.length, 0));
  let o = 0;
  for (const x of parts) { t.set(x, o); o += x.length; }
  return t;
};

async function hkdf(sel, ikm, info, octets) {
  const cle = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: sel, info }, cle, octets * 8));
}

// Une clé P-256 donnée par sa partie publique brute (65 octets) et sa partie privée (32 octets), en base64url.
export function jwk(publique, privee) {
  const p = b64.de(publique);
  return { kty: 'EC', crv: 'P-256', x: b64.vers(p.slice(1, 33)), y: b64.vers(p.slice(33, 65)), d: privee, ext: true };
}

// Chiffre le message pour un abonné (sa clé p256dh et son secret auth). salt et serveur ne servent qu'aux tests.
export async function chiffrer(texte, uaPublic, authSecret, { salt = crypto.getRandomValues(new Uint8Array(16)), serveur } = {}) {
  const as = serveur || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const ua = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: ua }, as.privateKey, 256));
  const ikm = await hkdf(authSecret, ecdh, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const cle = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // Un seul bloc : le message, puis l'octet 0x02 qui marque le dernier bloc.
  const chiffre = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cle, concat(enc.encode(texte), new Uint8Array([2]))));
  // En-tête : sel (16), taille de bloc 4096 (4), longueur de la clé (1), clé publique du serveur (65).
  return concat(salt, new Uint8Array([0, 0, 16, 0, asPublic.length]), asPublic, chiffre);
}

// En-tête Authorization VAPID : un jeton signé qui prouve au service de notifications qui envoie.
export async function enteteVapid(endpoint, sujet, publique, privee, maintenant = Date.now()) {
  const jeton = o => b64.vers(enc.encode(JSON.stringify(o)));
  const corps = `${jeton({ typ: 'JWT', alg: 'ES256' })}.${jeton({ aud: new URL(endpoint).origin, exp: Math.floor(maintenant / 1000) + 12 * 3600, sub: sujet })}`;
  const cle = await crypto.subtle.importKey('jwk', jwk(publique, privee), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, cle, enc.encode(corps));
  return `vapid t=${corps}.${b64.vers(sig)}, k=${publique}`;
}

// Envoie une notification ; renvoie le code HTTP du service (201 attendu, 404 ou 410 = abonnement mort).
export async function envoyer(abonnement, texte, { publique, privee, sujet }, faireFetch = fetch) {
  const corps = await chiffrer(texte, b64.de(abonnement.keys.p256dh), b64.de(abonnement.keys.auth));
  const r = await faireFetch(abonnement.endpoint, {
    method: 'POST',
    headers: {
      TTL: '900', Urgency: 'high', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream',
      Authorization: await enteteVapid(abonnement.endpoint, sujet, publique, privee),
    },
    body: corps,
  });
  return r.status;
}
