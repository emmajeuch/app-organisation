// Vérifie le chiffrement Web Push contre l'exemple officiel de la RFC 8291 (annexe A) : node serveur/test-webpush.mjs
import assert from 'node:assert/strict';
import { b64, chiffrer, jwk, enteteVapid } from './webpush.js';

const sans = s => s.replace(/\s+/g, '');
const as_public = sans('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIg Dll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8');
const as_private = 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw';
const ua_public = sans('BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV- JvLexhqUzORcx aOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4');
const attendu = sans(`DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml
  mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT
  pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN`);

const cle = jwk(as_public, as_private);
const serveur = {
  privateKey: await crypto.subtle.importKey('jwk', cle, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']),
  publicKey: await crypto.subtle.importKey('jwk', { ...cle, d: undefined }, { name: 'ECDH', namedCurve: 'P-256' }, true, []),
};
const corps = await chiffrer(new TextDecoder().decode(b64.de('V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24')),
  b64.de(ua_public), b64.de('BTBZMqHH6r4Tts7J_aSIgg'), { salt: b64.de('DGv6ra1nlYgDCS1FRnbzlw'), serveur });
assert.equal(b64.vers(corps), attendu);

// La signature VAPID se vérifie avec la clé publique, et vise bien le service de notifications.
const auth = await enteteVapid('https://web.push.apple.com/QGxyz', 'https://emmajeuch.github.io/app-organisation/', as_public, as_private, 0);
const [, t] = auth.match(/t=([^,]+)/);
const [h, p, s] = t.split('.');
assert.equal(JSON.parse(new TextDecoder().decode(b64.de(p))).aud, 'https://web.push.apple.com');
const verif = await crypto.subtle.importKey('jwk', { ...cle, d: undefined }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, verif, b64.de(s), new TextEncoder().encode(`${h}.${p}`)));
console.log('ok');
