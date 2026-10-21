// Vérification de la logique : node test.mjs
import assert from 'node:assert/strict';
import * as L from './logique.js';

const c = (id, j, s, e) => ({ id, j, s, e, cat: 'x' });

// Un créneau posé au milieu d'un autre le coupe en deux ; l'autre jour n'est pas touché.
let r = L.placer([c('a', 0, 8, 12), c('b', 1, 8, 12)], c('n', 0, 9, 10));
assert.deepEqual(r.filter(x => x.j === 0).map(x => [x.s, x.e]), [[8, 9], [9, 10], [10, 12]]);
assert.equal(r.find(x => x.j === 1).id, 'b');
// Il remplace ce qu'il recouvre entièrement, et se déplace sans se dédoubler.
r = L.placer([c('a', 0, 9, 10), c('n', 0, 14, 15)], c('n', 0, 8.5, 10.5));
assert.deepEqual(r.map(x => [x.id, x.s, x.e]), [['n', 8.5, 10.5]]);

// Minuit et demi le lundi appartient encore au dimanche, à 24 h 30.
const m = L.momentLogique(new Date(2026, 9, 26, 0, 30));
assert.equal(L.isoJour(m.date), '2026-10-25');
assert.equal(m.h, 24.5);
assert.equal(L.isoJour(L.lundiDe(new Date(2026, 9, 25))), '2026-10-19');
assert.equal(L.periode('annee', new Date(2027, 2, 1)), '2026-2027');
assert.equal(L.periode('annee', new Date(2026, 8, 1)), '2026-2027');
assert.equal(L.hhmm(25), '01:00');

// Texte lisible sur les couleurs des catégories.
assert.equal(L.texteSur('#FFD447'), 'dark');
assert.equal(L.texteSur('#6766F0'), 'light');

// Une semaine neuve copie la semaine type ; l'import refuse un fichier quelconque.
const data = L.vide();
data.types.push({ id: 't', nom: 'Cours', slots: [c('a', 0, 8, 9)] });
const sem = L.semaine(data, '2026-10-19');
assert.equal(sem.slots[0].src, 'a');
assert.notEqual(sem.slots[0].id, 'a');
assert.deepEqual(L.copierJour(sem.slots, 0, 2).map(x => x.j), [0, 2]);
assert.throws(() => L.valider({ hello: 1 }));
assert.equal(L.valider(JSON.parse(JSON.stringify(data))).version, 1);

console.log('ok');
