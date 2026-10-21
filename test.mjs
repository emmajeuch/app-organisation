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

// Une ancienne sauvegarde reçoit les rubriques de la V1.2.
const ancienne = JSON.parse(JSON.stringify(data));
delete ancienne.taches; delete ancienne.repos;
assert.deepEqual(L.valider(ancienne).taches, []);
assert.equal(ancienne.repos, 90);

// Tâche récurrente du jeudi cochée le jeudi 22/10 : elle revient le jeudi 29/10, sous-tâches décochées.
const jeudi = new Date(2026, 9, 22, 18, 0);
const t = L.cocher({ id: 't', echeance: '2026-10-22', recurrence: 3, fait: false, sous: [{ txt: 'a', fait: true }] }, jeudi);
assert.equal(t.echeance, '2026-10-29');
assert.equal(t.fait, false);
assert.equal(t.sous[0].fait, false);
// Une tâche simple est terminée ; une tâche du lundi (récurrence 0) n'est pas prise pour « sans récurrence ».
assert.equal(L.cocher({ id: 'u', echeance: '2026-10-22' }, jeudi).fait, true);
assert.equal(L.cocher({ id: 'v', echeance: '2026-10-19', recurrence: 0 }, jeudi).echeance, '2026-10-26');
assert.equal(L.joursAvant('2026-12-13', jeudi), 52);
assert.deepEqual(L.aFaire([{ id: 1, echeance: '2026-11-30' }, { id: 2, echeance: '2026-10-20' }, { id: 3, echeance: '2026-10-25', fait: true }, { id: 4 }], jeudi).map(x => x.id), [2]);

// Progression : le meilleur de chaque séance, dans l'ordre des dates.
const journal = [
  { date: '2026-10-20', series: [{ exo: 'p', sets: [{ reps: 10 }, { reps: 12 }] }] },
  { date: '2026-10-13', series: [{ exo: 'p', sets: [{ reps: 8 }] }, { exo: 'g', sets: [{ sec: 40 }] }] },
];
assert.deepEqual(L.progression(journal, 'p', 'reps').map(x => x.val), [8, 12]);
assert.deepEqual(L.dernieresSeries(journal, 'p'), [{ reps: 10 }, { reps: 12 }]);
assert.equal(L.faitsSemaine({ faits: ['2026-10-18', '2026-10-19', '2026-10-25'] }, new Date(2026, 9, 19)), 2);

console.log('ok');
