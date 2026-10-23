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

// Motivation. Série : 7 jours validés → 1 joker ; un jour manqué le consomme ; aujourd'hui non validé ne casse rien.
const jours = n => Array.from({ length: n }, (_, i) => L.isoJour(L.ajouterJours(new Date(2026, 9, 5), i)));
const v = new Set(jours(7));                       // du 5 au 11/10
v.add('2026-10-13'); v.add('2026-10-14');          // le 12 manqué
let s = L.serie(v, new Date(2026, 9, 15, 10), new Date(2026, 9, 5));
assert.deepEqual([s.serie, s.jokers, s.record], [9, 0, 9]);
s = L.serie(new Set(['2026-10-13', '2026-10-15']), new Date(2026, 9, 16), new Date(2026, 9, 13));
assert.equal(s.serie, 1);                          // le 14 manqué sans joker : la série repart au 15 ; le 16 pas encore fini
assert.equal(L.serie(new Set(['2026-10-15']), new Date(2026, 9, 16), new Date(2026, 9, 15)).serie, 1);

assert.deepEqual([1, 2, 3, 4].map(L.seuil), [0, 100, 300, 600]);
assert.deepEqual(L.niveau(299), { n: 2, de: 100, a: 300 });

// L'XP vient de ce qui est fait ; une tâche récurrente compte chaque fois qu'elle est faite.
const mo = L.vide();
mo.semaines['2026-10-19'] = { type: null, slots: [{ id: 'a', j: 0, s: 8, e: 9, fait: true }, { id: 'b', j: 0, s: 9, e: 10, fait: true }, { id: 'c', j: 1, s: 8, e: 9, fait: null }] };
mo.taches.push({ id: 'r', recurrence: 3, faits: ['2026-10-15', '2026-10-22'], fait: false, priorite: 2 });
mo.taches.push({ id: 'f', fac: true, fait: true, faits: ['2026-10-20'] });
const st = L.stats(mo, new Date(2026, 9, 21));
assert.equal(st.sources.creneaux, 10);
assert.equal(st.sources.taches, 2 * 20 + 30);
assert.equal(st.sources.bonus, 15);               // le lundi 19 est validé, pas le mardi
assert.equal(st.joursValides, 1);
assert.deepEqual(L.droitsTirage(mo, st), ['tache:f']);
mo.tirages.push('tache:f');
assert.deepEqual(L.droitsTirage(mo, st), []);
assert.equal(L.cocher({ id: 'x' }, new Date(2026, 9, 21)).faits.length, 1);

// Tirage : 0,9 → commune ; 0,01 → légendaire ; on évite les doublons quand c'est possible.
assert.equal(L.tirer([], () => .9).rarete, 'commune');
assert.equal(L.tirer([], () => .01).rarete, 'legendaire');
assert.equal(L.tirer(['lumino'], (() => { let k = 0; return () => [.01, 0][k++]; })()).id, 'zephyr');

// V1.3.1 : une journée validée ne compte dans l'essai qu'avec une action pendant la journée.
const u = L.vide();
u.semaines['2026-10-26'] = { type: null, slots: [{ id: 'a', j: 0, s: 8, e: 9, fait: true }, { id: 'b', j: 1, s: 8, e: 9, fait: true }] };
L.noter(u, '2026-10-26', 'creneau-valide');
L.noter(u, '2026-10-27', 'notes');                // une note ne suffit pas
const vu = L.joursValides(u);
assert.deepEqual(L.joursQuiComptent(u, '2026-10-26', vu), ['2026-10-26']);
assert.equal(L.usageSemaine(u, '2026-10-26').notes, 1);
assert.equal(L.delaiValidation(17), 19);
assert.equal(L.delaiValidation(23), 24);           // créneau du soir : jusqu'à minuit
// Les anciens bilans (une date) deviennent des objets ; la semaine d'exemple n'a plus de matière réelle.
assert.deepEqual(L.migrer({ ...L.vide(), bilans: { '2026-10-19': '2026-10-21' } }).bilans['2026-10-19'], { date: '2026-10-21' });
assert.ok(!L.slotsExemple().some(x => /données|Finance|Algorithm|gestion|Anglais|Ethics|Atelier/.test(x.titre)));

// V1.4 : une sauvegarde complète traverse l'import contrôlé sans rien perdre…
const plein = L.vide();
Object.assign(plein, { typeDefaut: 't1', dernierExport: '2026-10-23T10:00:00.000Z', club: 'Basket', bonusXp: 50, theme: 'menthe', tutoVu: true, taux: 11.5,
  profil: { prenom: 'Léa', etudes: true, travail: false, sports: ['Basket'] }, modules: { sport: false }, usage: { '2026-10-26': { 'creneau-ajout': 2 } },
  compagnon: { id: 'nuage', stade: 2 }, tirages: ['niveau:2'], collection: [{ id: 'nuage', date: '2026-10-21', raison: 'niveau:2', sport: 'Basket' }],
  bilans: { '2026-10-19': { date: '2026-10-25', ailleurs: 1, ailleursNote: 'papier', comptent: 5, validees: '6/7', usage: { notes: 3 } } } });
const sl = { id: 's1', j: 2, s: 8.5, e: 10, cat: 'cours', titre: 'TD', salle: 'B', affaires: 'cahier', notes: 'x', fait: true, src: 'm1', tache: 'k1', seance: 'q1', club: true, collegue: 'Sam' };
plein.types.push({ id: 't1', nom: 'Cours', slots: [{ ...sl, id: 'm1', fait: undefined }].map(({ fait, ...x }) => x) });
plein.semaines['2026-10-26'] = { type: 't1', slots: [sl] };
plein.notes.push({ id: 'n1', titre: 'A', texte: 'B', couleur: '#FFD447', epingle: true, tags: ['Fac'], lien: 'TD', maj: 5 });
plein.listes[0].items.push({ id: 'i1', txt: 'Lait', fait: true });
plein.objectifs.push({ id: 'o1', txt: 'Lire', horizon: 'mois', periode: '2026-10', fait: true, parent: 'o0' });
plein.taches.push({ id: 'k1', titre: 'Rendu', echeance: '2026-12-13', priorite: 1, fac: true, travail: false, recurrence: 3, projet: 'p1', sous: [{ txt: 'a', fait: true }], fait: false, faitLe: '2026-10-22', faits: ['2026-10-22'] });
plein.projets.push({ id: 'p1', nom: 'App', type: 'projet', statut: 'en-cours', etape: 'V1.4', notes: '' });
plein.exos.push({ id: 'e1', nom: 'Gainage', type: 'duree', notes: '', sport: 'Basket' });
plein.seances.push({ id: 'q1', nom: 'Renfo', sport: 'Basket', exos: [{ exo: 'e1', series: 3, cible: 45 }, { exo: 'e1', series: 2, cible: '' }] });
plein.journal.push({ id: 'j1', date: '2026-10-22', seance: 'q1', nom: 'Renfo', slot: 's1', ressenti: 4, notes: 'ok', series: [{ exo: 'e1', sets: [{ sec: 40 }, { kg: 10, reps: 8 }] }] });
plein.habitudes.push({ id: 'h1', nom: 'Lire', freq: 3, faits: ['2026-10-22'] });
plein.competitions.push({ id: 'c1', sport: 'Basket', nom: 'Tournoi', date: '2026-11-14', lieu: 'Gymnase', categorie: 'U21', resultat: '' });
const copie = JSON.parse(JSON.stringify(plein));
assert.deepEqual(L.validerImport(JSON.parse(JSON.stringify(plein))), copie);
// … mais retire ce qui pourrait casser la page ou n'a rien à faire là.
const piege = JSON.parse(JSON.stringify(plein));
piege.cats[0].id = '"><img src=x onerror=alert(1)>';
piege.objectifs[0].periode = '<script>';
piege.habitudes[0].freq = '<b>';
piege.inconnu = 'à ignorer';
const net = L.validerImport(piege);
assert.equal(net.cats[0].id, undefined);
assert.equal(net.objectifs[0].periode, undefined);
assert.equal(net.habitudes[0].freq, undefined);
assert.equal(net.inconnu, undefined);
assert.throws(() => L.validerImport({ version: 2 }));

// Profil : lu, nettoyé, puis ajouté sans rien écraser.
assert.throws(() => L.lireProfil({ version: 1 }));
const rep = { prenom: 'Sam', etudes: true, travail: true, lever: 7, coucher: 23, repas: true, coursJours: [0, 1], coursDebut: 8, coursFin: 17,
  travailJours: [5], travailDebut: 10, travailFin: 18, taux: 11.88, sport: 'Basket', clubJours: [2], clubDebut: 18, clubDuree: 1.5,
  menage: [{ titre: 'Ménage', jour: 3 }], listes: ['Courses', 'Films'], habitudes: ['Lire'] };
const prof = L.lireProfil(JSON.parse(JSON.stringify(L.construireProfil(rep))));
assert.equal(prof.prenom, 'Sam');
const base = L.vide();
base.taches.push({ id: 'x', titre: 'Ménage', fait: false });
const avant = base.listes.length;
const ajoute = L.appliquerProfil(base, prof, new Date(2026, 9, 23));
assert.equal(base.taches.filter(t => t.titre === 'Ménage').length, 1);   // déjà là : pas en double
assert.equal(base.listes.length, avant + 1);                              // « Films » ajoutée, « Courses » existait
assert.ok(base.cats.some(c => c.nom === 'Travail') && base.cats.some(c => c.nom === 'Travail perso'));
const semType = base.types.at(-1);
assert.ok(semType.slots.some(x => x.j === 5 && x.titre === 'Travail' && x.cat === base.cats.find(c => c.nom === 'Travail').id));
assert.ok(semType.slots.some(x => x.j === 0 && x.titre === 'Déjeuner' && x.s === 12));  // le déjeuner coupe les cours
assert.ok(base.seances.some(s => s.nom === 'Renfo basket'));
assert.equal(base.profil.travail, true);
assert.ok(ajoute.length > 5);

console.log('ok');
