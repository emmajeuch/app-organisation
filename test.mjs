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
// Un tirage de bienvenue tant que la collection est vide, un par succès (V1.10.3), un par tâche de fac faite.
assert.deepEqual(L.droitsTirage(mo, st), ['bienvenue']);   // V1.10.21 : seulement tous les 5 niveaux, plus la bienvenue
mo.tirages.push('bienvenue');
mo.collection.push({ id: 'ronfleur' });
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
plein.taches.push({ id: 'k1', titre: 'Rendu', echeance: '2026-12-13', heure: 18, priorite: 1, fac: true, travail: false, rep: [{ j: 3, h: null }, { j: 5, h: 10.5 }], projet: 'p1', sous: [{ txt: 'a', fait: true }], fait: false, faitLe: '2026-10-22', faits: ['2026-10-22'] });
plein.projets.push({ id: 'p1', nom: 'App', type: 'projet', statut: 'en-cours', etape: 'V1.4', notes: '' });
plein.exos.push({ id: 'e1', nom: 'Gainage', type: 'duree', notes: '', sport: 'Basket' });
plein.seances.push({ id: 'q1', nom: 'Renfo', sport: 'Basket', exos: [{ exo: 'e1', series: 3, cible: 45 }, { exo: 'e1', series: 2, cible: '' }] });
plein.journal.push({ id: 'j1', date: '2026-10-22', seance: 'q1', nom: 'Renfo', slot: 's1', ressenti: 4, notes: 'ok', series: [{ exo: 'e1', sets: [{ sec: 40 }, { kg: 10, reps: 8 }] }] });
plein.habitudes.push({ id: 'h1', nom: 'Lire', freq: 3, faits: ['2026-10-22'], horaires: [{ j: 0, h: 22 }, { j: 3, h: 7.5 }], duree: .5 });
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
assert.ok(base.cats.some(c => c.nom === 'Travail') && base.cats.some(c => c.nom === 'Révisions'));
const semType = base.types.at(-1);
assert.ok(semType.slots.some(x => x.j === 5 && x.titre === 'Travail' && x.cat === base.cats.find(c => c.nom === 'Travail').id));
assert.ok(semType.slots.some(x => x.j === 0 && x.titre === 'Déjeuner' && x.s === 12));  // le déjeuner coupe les cours
assert.ok(base.seances.some(s => s.nom === 'Renfo basket'));
assert.equal(base.profil.travail, true);
assert.ok(ajoute.length > 5);

// V1.5 : préparation de compétition par règles.
const comps = [{ id: 'c', date: '2026-11-14', nom: 'Tournoi' }];
assert.equal(L.regleCompetition(comps, '2026-11-13').regle, 'veille');
assert.equal(L.regleCompetition(comps, '2026-11-14').regle, 'jour');
assert.equal(L.regleCompetition(comps, '2026-11-15').regle, 'lendemain');
assert.equal(L.regleCompetition(comps, '2026-11-20'), null);
assert.deepEqual([1, 3, 4, 5].map(L.seriesVeille), [1, 2, 2, 3]);
// Records battus, séances de départ, tirages du sport, ancien sport en club repris dans le profil.
const sp = L.vide();
sp.exos.push({ id: 'p', nom: 'Pompes', type: 'reps' });
sp.journal.push({ date: '2026-10-01', series: [{ exo: 'p', sets: [{ reps: 8 }] }] }, { date: '2026-10-08', series: [{ exo: 'p', sets: [{ reps: 10 }] }] }, { date: '2026-10-15', series: [{ exo: 'p', sets: [{ reps: 9 }] }] });
assert.equal(L.recordsBattus(sp), 1);
const dep = L.seancesDeDepart('Sabre laser');
assert.equal(dep.seances[0].nom, 'Renfo sabre laser');
assert.ok(dep.seances.some(s => s.nom === 'Récupération'));
assert.equal(new Set(dep.exercices.map(e => e.nom)).size, dep.exercices.length);
for (let i = 0; i < 3; i++) sp.journal.push({ date: '2026-10-2' + i, series: [] });
assert.ok(!L.droitsTirage(sp, L.stats(sp, new Date(2026, 9, 23))).some(k => k.startsWith('seances:')));
assert.deepEqual(L.migrer({ ...L.vide(), club: 'Basket', profil: {} }).profil.sports, ['Basket']);
// Heures sur une période : jour par jour, jamais au-delà d'aujourd'hui.
const hp = L.vide();
hp.semaines['2026-10-19'] = { slots: [{ j: 0, s: 8, e: 10, cat: 'travail', fait: true }, { j: 4, s: 8, e: 9, cat: 'travail' }, { j: 6, s: 8, e: 9, cat: 'travail', fait: true }] };
const per = L.heuresPeriode(hp, new Date(2026, 9, 19), new Date(2026, 9, 25), new Date(2026, 9, 23));
assert.deepEqual([per.prevu.travail, per.fait.travail], [3, 2]);   // le dimanche 25 n'est pas encore vécu

// Bonus. Compagnon : stades sur des journées simulées, et il ne régresse jamais.
const sim = n => { const x = L.vide(); for (let i = 0; i < n; i++) { const d = L.ajouterJours(new Date(2026, 9, 26), i), cle = L.isoJour(L.lundiDe(d));
  (x.semaines[cle] ||= { slots: [] }).slots.push({ id: 'z' + i, j: L.jourSemaine(d), s: 8, e: 9, fait: true }); } return L.stats(x, new Date(2026, 11, 31)).joursValides; };
assert.deepEqual([0, 1, 4, 5, 9, 10, 19, 20, 40].map(n => L.stadeCompagnon(sim(n))), [0, 1, 1, 2, 2, 3, 3, 4, 4]);
assert.equal(L.prochainSeuil(sim(6)), 10);
assert.equal(L.grandir({ id: 'nuage', stade: 3 }, sim(2)).stade, 3);
// Stats : la semaine vaut la somme de ses jours, calculés un par un.
const st7 = L.vide();
st7.semaines['2026-10-19'] = { slots: [{ j: 2, s: 8, e: 10, cat: 'cours', fait: true }, { j: 3, s: 9, e: 12, cat: 'cours', fait: true }, { j: 4, s: 14, e: 15, cat: 'sport', fait: true }, { j: 4, s: 16, e: 17, cat: 'sport' }] };
const auj7 = new Date(2026, 9, 25), semaine7 = L.heuresPeriode(st7, new Date(2026, 9, 19), new Date(2026, 9, 25), auj7);
const jours7 = [0, 1, 2, 3, 4, 5, 6].map(j => L.heuresPeriode(st7, L.ajouterJours(new Date(2026, 9, 19), j), L.ajouterJours(new Date(2026, 9, 19), j), auj7));
for (const c of ['cours', 'sport']) assert.equal(jours7.reduce((k, p) => k + (p.fait[c] || 0), 0), semaine7.fait[c]);
assert.equal(L.heuresPeriode(st7, new Date(2026, 0, 1), new Date(2026, 11, 31), auj7).fait.cours, 5);   // année civile

// V1.8 : n'importe quel sport, et ses propres listes et habitudes dès le profil.
assert.equal(L.conseilsPour('  basket ')[0][0], L.CONSEILS.Basket[0][0]);
assert.equal(L.conseilsPour('Escrime'), undefined);
const escrime = L.lireProfil(JSON.parse(JSON.stringify(L.construireProfil({ ...rep, sport: 'Escrime', listes: ['Courses', 'Jeux à finir'], habitudes: ['Méditer 5 min'] }))));
assert.deepEqual(escrime.sports, ['Escrime']);
assert.ok(escrime.semaineType.creneaux.some(c => c.titre === 'Entraînement · Escrime'));
assert.equal(escrime.exercices, undefined);
const bE = L.vide(); L.appliquerProfil(bE, escrime);
assert.ok(bE.listes.some(l => l.nom === 'Jeux à finir') && bE.habitudes.some(h => h.nom === 'Méditer 5 min'));
assert.equal(L.seancesDeDepart('Escrime').seances.length, 2);   // gainage et récupération, sans renfo propre

// Rappels : un cours à 8 h 30 un lundi donne un rappel à 8 h 15, la relecture à 20 h 30 ; rien n'est dans le passé.
const rp = L.vide();
rp.semaines['2026-10-26'] = { slots: [{ j: 0, s: 8, e: 8.5, cat: 'cours', titre: 'Trajet' }, { j: 0, s: 8.5, e: 10.5, cat: 'cours', titre: 'TD', salle: 'B' }, { j: 0, s: 12, e: 13, cat: 'repas', titre: 'Déjeuner' }] };
const lundi7h = new Date(2026, 9, 26, 7, 0).getTime();
const rs = L.calculerRappels(rp, lundi7h, { ...L.REGLAGES_RAPPELS });
assert.equal(rs[0].t, new Date(2026, 9, 26, 7, 45).getTime() / 1000);
assert.equal(rs[0].titre, 'Dans 15 min : Trajet');
assert.equal(rs[1].titre, 'Dans 15 min : TD');
assert.equal(rs[1].corps, '08:30 · B');
assert.ok(rs.some(x => x.titre === 'Bilan de ta journée' && x.t === new Date(2026, 9, 26, 20, 0).getTime() / 1000));   // pas de dîner prévu : 20 h
assert.ok(rs.some(x => x.titre === 'Dans 15 min : Déjeuner' && x.t === new Date(2026, 9, 26, 11, 45).getTime() / 1000));
assert.ok(rs.every(x => x.t > lundi7h / 1000));
assert.equal(L.calculerRappels(rp, new Date(2026, 9, 26, 12, 0).getTime(), { ...L.REGLAGES_RAPPELS, soir: false, bilan: false }).length, 0);
// Une sauvegarde importée ne garde pas l'abonnement d'un autre téléphone.
assert.equal(L.validerImport({ ...JSON.parse(JSON.stringify(L.vide())), notifs: { actif: true, id: 'x' } }).notifs.actif, false);

// Le profil remplace la semaine d'exemple ; une semaine où quelque chose a été validé est gardée.
const ex = L.vide();
ex.types.push({ id: 'ex', nom: 'Semaine d’exemple', exemple: true, slots: L.slotsExemple() }); ex.typeDefaut = 'ex';
L.semaine(ex, '2026-10-26');
ex.semaines['2026-10-19'] = { type: 'ex', slots: [{ id: 'v', j: 0, s: 8, e: 9, fait: true }] };
const lignesEx = L.appliquerProfil(ex, escrime);
assert.ok(!ex.types.some(x => x.exemple) && ex.types.length === 1 && ex.typeDefaut === ex.types[0].id);
assert.ok(!ex.semaines['2026-10-26'] && ex.semaines['2026-10-19']);
assert.ok(lignesEx.includes('Semaine d’exemple retirée'));
assert.equal(L.lireProfil({ format: 'orga-profil', version: 1, semaineType: { creneaux: [{ jour: 0, debut: 8.25, fin: 9.75, titre: 'TD' }] } }).semaineType.creneaux[0].debut, 8.25);

// Horaires à la minute près ; après minuit, c'est encore la journée (jusqu'à 1 h = 25 h).
assert.equal(L.versHeure('08:20'), 8 + 20 / 60);
assert.equal(L.versHeure('00:30'), 24.5);
assert.equal(L.versHeure('01:00'), 25);
assert.ok(Number.isNaN(L.versHeure('bonjour')));
assert.equal(L.hhmm(L.versHeure('13:45')), '13:45');

// Habitudes à heure : seulement les jours choisis, ou tous les jours si aucun.
{
  const hs = [{ nom: 'Lire', heure: 22, jours: [] }, { nom: 'Yoga', heure: 7.5, jours: [0, 2] }, { nom: 'Eau', heure: null }];
  assert.deepEqual(L.habitudesAHeure(hs, 0).map(h => h.nom), ['Lire', 'Yoga']);
  assert.deepEqual(L.habitudesAHeure(hs, 1).map(h => h.nom), ['Lire']);
}

// Rappels d'habitude : à l'heure exacte, pas si l'habitude est déjà cochée, fusionnés avec le bilan de 20 h.
{
  const d = L.vide();
  d.habitudes = [{ id: 'h1', nom: 'Lire', freq: 'jour', faits: ['2026-10-27'], heure: 22, jours: [] }, { id: 'h2', nom: 'Étirements', freq: 'jour', faits: [], heure: 20, jours: [0] }];
  d.semaines['2026-10-26'] = { slots: [{ j: 0, s: 9, e: 10, cat: 'repas', titre: 'Brunch' }] };
  const rs = L.calculerRappels(d, new Date(2026, 9, 26, 7, 0).getTime(), { ...L.REGLAGES_RAPPELS });
  const a = (j, h, m = 0) => new Date(2026, 9, j, h, m).getTime() / 1000;
  assert.ok(rs.some(x => x.t === a(26, 22) && x.titre === 'Lire'));
  assert.ok(!rs.some(x => x.t === a(27, 22)));                       // déjà cochée le 27
  assert.equal(rs.find(x => x.t === a(26, 20)).titre, 'Bilan de ta journée · Étirements');
  assert.ok(!L.calculerRappels(d, new Date(2026, 9, 26, 7, 0).getTime(), { ...L.REGLAGES_RAPPELS, habitudes: false }).some(x => x.titre.includes('Lire')));
}

// Changement d'heure (dimanche 25/10/2026) : le bilan reste à 17 h, heure locale.
{
  const d = L.vide();
  const rs = L.calculerRappels(d, new Date(2026, 9, 24, 12, 0).getTime(), { ...L.REGLAGES_RAPPELS });
  assert.equal(rs.find(x => x.titre === 'C’est l’heure du bilan').t, new Date(2026, 9, 25, 17, 0).getTime() / 1000);
}

// Sommeil, cours et repas se valident tout seuls ; le bilan part 15 min avant le dîner et dit ce qui reste.
{
  const jour = [{ j: 0, s: 7, e: 8, cat: 'sommeil', titre: 'Sommeil' }, { j: 0, s: 9, e: 11, cat: 'cours', titre: 'TD' },
    { j: 0, s: 14, e: 16, cat: 'travail', titre: 'Révisions', fait: true }, { j: 0, s: 16, e: 17, cat: 'sport', titre: 'Renfo' },
    { j: 0, s: 19, e: 20, cat: 'repas', titre: 'Dîner' }, { j: 0, s: 20, e: 22, cat: 'loisirs', titre: 'Série' }];
  assert.equal(L.heureBilan(jour), 18.75);
  assert.equal(L.heureBilan(jour.filter(x => x.titre !== 'Dîner')), 20);
  assert.equal(L.journeeValidee(jour), false);
  assert.equal(L.journeeValidee(jour.map(x => L.auto(x) ? x : { ...x, fait: true })), true);
  const d = L.vide(); d.semaines['2026-10-26'] = { slots: jour };
  const b = L.calculerRappels(d, new Date(2026, 9, 26, 7, 0).getTime(), { ...L.REGLAGES_RAPPELS }).find(x => x.titre.startsWith('Bilan de ta journée'));
  assert.equal(b.t, new Date(2026, 9, 26, 18, 45).getTime() / 1000);
  assert.equal(b.corps, 'Validé : Révisions · À valider : Renfo');
}

// Compte : identifiant et mot de passe donnent toujours le même identifiant de copie ; un autre mot de passe ne lit rien.
{
  const c1 = await L.clesDuCompte(' Emma ', 'un mot de passe long'), c2 = await L.clesDuCompte('emma', 'un mot de passe long');
  assert.deepEqual(c1, c2);
  assert.notEqual((await L.clesDuCompte('emma', 'un autre mot de passe')).id, c1.id);
  assert.notEqual((await L.clesDuCompte('lea', 'un mot de passe long')).id, c1.id);
  assert.ok(L.identValide('emma.j') && !L.identValide('a') && !L.identValide('emma jeu'));
  const d = L.vide(); d.notes.push({ id: 'n1', titre: 'Secret', texte: 'à ne pas lire' });
  const corps = await L.chiffrerCopie(d, c1);
  const [id, iv, chiffre] = corps.split('\n');
  assert.equal(id, c1.id);
  assert.ok(!atob(chiffre).includes('Secret'));
  assert.deepEqual((await L.dechiffrerCopie(`${iv}\n${chiffre}`, c1)).notes, d.notes);
  await assert.rejects(L.dechiffrerCopie(`${iv}\n${chiffre}`, await L.clesDuCompte('emma', 'un autre mot de passe')));
}

// Sommeil, cours et repas : comptés comme faits seulement après le premier jour d'usage, et une fois terminés.
// Une journée qui n'a que ça se valide toute seule une fois passée (Emma, 24/10).
{
  const d = L.vide(), lundi = '2026-10-26';
  d.semaines[lundi] = { slots: [
    { j: 0, s: 8, e: 12, cat: 'cours', titre: 'Cours' }, { j: 0, s: 12, e: 13, cat: 'repas', titre: 'Déjeuner' },
    { j: 1, s: 8, e: 17, cat: 'cours', titre: 'Cours' }, { j: 1, s: 17, e: 18, cat: 'sport', titre: 'Renfo' },
    { j: 2, s: 8, e: 12, cat: 'cours', titre: 'Cours' }, { j: 3, s: 8, e: 12, cat: 'cours', titre: 'Cours' }] };
  const mer = new Date(2026, 9, 28, 10, 0), lun = new Date(2026, 9, 26), dim = new Date(2026, 10, 1);
  // sans premier jour d'usage : rien ne compte tout seul (l'ami qui vient d'installer)
  assert.equal(L.heuresPeriode(d, lun, dim, mer, mer).fait.cours, undefined);
  assert.equal(L.joursValides(d, mer).size, 0);
  // premier jour d'usage le lundi : le lundi lui-même ne compte pas, le mardi oui, le mercredi seulement ce qui est fini à 10 h
  d.debut = '2026-10-26';
  assert.equal(L.heuresPeriode(d, lun, dim, mer, mer).fait.cours, 9);
  assert.equal(L.heuresPeriode(d, lun, dim, new Date(2026, 9, 28, 13), new Date(2026, 9, 28, 13)).fait.cours, 13);
  // mardi a un créneau à cocher : pas validé tout seul ; jeudi (que des cours) pas encore passé
  assert.deepEqual([...L.joursValides(d, mer)], []);
  assert.deepEqual([...L.joursValides(d, new Date(2026, 9, 30, 9))], ['2026-10-28', '2026-10-29']);
  assert.ok(L.rienACocher(d.semaines[lundi].slots.filter(x => x.j === 2)) && !L.rienACocher([]));
  // sans « debut », le premier jour où l'app a servi en tient lieu ; « debut » survit à une sauvegarde
  const e = L.vide(); e.usage['2026-10-27'] = { notes: 1 };
  assert.equal(L.debutDe(e), '2026-10-27');
  assert.equal(L.validerImport({ ...d }).debut, '2026-10-26');
}

// V1.10 : une tâche revient plusieurs fois par semaine, à des jours et heures différents.
{
  const rep = [{ j: 0, h: 10 }, { j: 3, h: 18 }, { j: 3, h: 8 }];          // lundi 10 h, jeudi 8 h et 18 h
  assert.deepEqual(L.prochaineOccurrence(rep, '2026-10-26', 10), { iso: '2026-10-29', h: 8 });
  assert.deepEqual(L.prochaineOccurrence(rep, '2026-10-29', 8), { iso: '2026-10-29', h: 18 });
  assert.deepEqual(L.prochaineOccurrence(rep, '2026-10-29', 18), { iso: '2026-11-02', h: 10 });
  assert.deepEqual(L.prochaineOccurrence(rep, '2026-10-26', -1, true), { iso: '2026-10-26', h: 10 });
  // cochée le jeudi à 9 h pour la fois de 8 h : la suivante est jeudi 18 h ; en retard d'une semaine : pas avant maintenant
  const t = { id: 't', titre: 'Sport', echeance: '2026-10-29', heure: 8, rep, fait: false, sous: [] };
  assert.deepEqual([L.cocher(t, new Date(2026, 9, 29, 9)).echeance, L.cocher(t, new Date(2026, 9, 29, 9)).heure], ['2026-10-29', 18]);
  assert.deepEqual([L.cocher(t, new Date(2026, 10, 5, 12)).echeance, L.cocher(t, new Date(2026, 10, 5, 12)).heure], ['2026-11-05', 18]);
  assert.equal(L.horairesTexte(rep), 'jeu à 08:00 · lun à 10:00 · jeu à 18:00');
  assert.equal(L.horairesTexte([0, 1, 2, 3, 4, 5, 6].map(j => ({ j, h: 22 })).concat({ j: 0, h: 7 })), 'lun à 07:00 · tous les jours à 22:00');
  assert.equal(L.horairesTexte([{ j: 5, h: null }, { j: 6, h: null }]), 'le week-end');
  // anciennes données : une seule journée de répétition, une habitude à heure unique
  const m = L.migrer({ ...L.vide(), taches: [{ id: 'a', recurrence: 2 }], habitudes: [{ id: 'h', nom: 'Lire', heure: 22, jours: [0, 4], faits: [] }] });
  assert.deepEqual(m.taches[0].rep, [{ j: 2, h: null }]);
  assert.deepEqual(m.habitudes[0].horaires, [{ j: 0, h: 22 }, { j: 4, h: 22 }]);
  assert.deepEqual(L.habitudesAHeure(m.habitudes, 4).map(h => h.heure), [22]);
  // habitude à deux heures le même jour
  assert.deepEqual(L.habitudesAHeure([{ id: 'x', nom: 'Eau', faits: [], horaires: [{ j: 1, h: 9 }, { j: 1, h: 15 }] }], 1).map(h => h.heure), [9, 15]);
  // rappels : la prochaine fois d'une tâche à heure, et les suivantes de la semaine
  const d = L.vide(); d.taches.push({ ...t, titre: 'Sport' });
  const rr = L.calculerRappels(d, new Date(2026, 9, 26, 7).getTime(), { ...L.REGLAGES_RAPPELS, creneaux: false, soir: false, bilan: false });
  assert.deepEqual(rr.map(x => new Date(x.t * 1000).getDate() + ' ' + new Date(x.t * 1000).getHours()), ['29 8', '29 18']);
}

// V1.10 : les créneaux types remplacent les semaines types.
{
  // migration : la semaine type par défaut devient des créneaux types, les semaines gardent le lien
  const v = L.vide();
  v.types = [{ id: 't1', nom: 'Cours', slots: [{ id: 'a', j: 0, s: 8, e: 10, cat: 'cours', titre: 'TD', salle: 'B' }, { id: 'b', j: 2, s: 8, e: 10, cat: 'cours', titre: 'TD', salle: 'B' }, { id: 'c', j: 1, s: 23, e: 25, cat: 'sommeil', titre: 'Sommeil' }] }];
  v.typeDefaut = 't1';
  v.semaines['2026-10-26'] = { type: 't1', slots: [{ id: 'w1', src: 'a', j: 0, s: 8, e: 10, cat: 'cours', titre: 'TD', salle: 'B' }] };
  delete v.recurrents;
  const m = L.migrer(v);
  assert.equal(m.recurrents.length, 2);
  const td = m.recurrents.find(r => r.titre === 'TD');
  assert.deepEqual(td.jours, [0, 2]);
  assert.equal(m.semaines['2026-10-26'].slots[0].src, `${td.id}-0`);
  assert.deepEqual([m.types.length, m.typeDefaut, m.types[0].slots.length], [1, 'base', 3]);
  // une nouvelle semaine se remplit des créneaux types
  assert.equal(L.semaine(m, '2026-11-02').slots.length, 3);
  // changer un créneau type : les semaines ouvertes suivent à partir d'aujourd'hui, le passé et le validé restent
  const mer = new Date(2026, 9, 28, 12);
  m.semaines['2026-10-26'] = { slots: [{ id: 'p', src: `${td.id}-0`, j: 0, s: 8, e: 10, cat: 'cours', titre: 'TD' }, { id: 'q', src: `${td.id}-2`, j: 2, s: 8, e: 10, cat: 'cours', titre: 'TD', fait: true }] };
  td.s = 9; td.e = 11; td.jours = [0, 2, 4];
  L.regenerer(m); L.propager(m, [td.id], mer);
  const s1 = m.semaines['2026-10-26'].slots;
  assert.deepEqual(s1.map(x => [x.j, x.s, !!x.fait]), [[0, 8, false], [2, 8, true], [4, 9, false]]);
  assert.deepEqual(m.semaines['2026-11-02'].slots.filter(x => x.titre === 'TD').map(x => [x.j, x.s]), [[0, 9], [2, 9], [4, 9]]);
  // construire par catégories : sommeil, cours avec trajets, repas qui coupent les cours, sport du club
  const base = L.creneauxDeBase({ sommeil: { coucher: 23.5, lever: 7.5, leverWe: 9.5 }, cours: { jours: [0, 1, 2, 3, 4], debut: 8.5, fin: 17, trajet: 30 },
    repas: { petitDej: 7.5, dej: [12, 13], diner: [19.5, 20.5] }, sport: { nom: 'Basket', jours: [1, 3], heure: 18, duree: 1.5 } });
  const n = L.vide(); n.recurrents = L.recurrentsExemple(); L.regenerer(n);
  L.appliquerBase(n, base, ['sommeil', 'cours', 'repas', 'sport'], mer);
  assert.ok(n.recurrents.every(r => !r.exemple));
  const lundi = L.semaine(n, '2026-11-02').slots.filter(x => x.j === 0).map(x => `${L.hhmm(x.s)} ${x.titre}`);
  assert.deepEqual(lundi, ['06:00 Sommeil', '07:30 Petit-déjeuner', '08:00 Trajet', '08:30 Cours', '12:00 Déjeuner', '13:00 Cours', '17:00 Trajet', '19:30 Dîner', '23:30 Sommeil']);
  assert.ok(L.semaine(n, '2026-11-02').slots.some(x => x.j === 1 && x.club && x.titre === 'Entraînement · Basket'));
  // refaire une catégorie remplace seulement ses créneaux types
  L.appliquerBase(n, L.creneauxDeBase({ sommeil: { coucher: 22, lever: 6.5 } }), ['sommeil'], mer);
  assert.deepEqual(n.recurrents.filter(r => r.origine === 'sommeil').map(r => [r.s, r.e]), [[6, 6.5], [22, 25]]);
  assert.equal(n.recurrents.filter(r => r.origine === 'cours').length, 3);
  // les créneaux types survivent à une sauvegarde
  assert.deepEqual(L.validerImport(JSON.parse(JSON.stringify(n))).recurrents, n.recurrents);
}

// Mot de passe trop simple : peu de caractères différents, ou l'identifiant dedans.
{
  assert.ok(L.mdpTropSimple('aaaaaaaaaa', 'lea') && L.mdpTropSimple('1212121212', 'lea') && L.mdpTropSimple('Camille2026!', 'camille'));
  assert.ok(!L.mdpTropSimple('un mot de passe long', 'emma') && !L.mdpTropSimple('Tournesol42', 'lea'));
}

// Rappels : rien à réécrire si seules des heures sont passées ; une heure nouvelle ou changée, si.
{
  const s = 1_000_000;
  assert.equal(L.rappelsChanges(`${s - 60},${s + 600},${s + 3600}`, [s + 600, s + 3600], s), false);
  assert.equal(L.rappelsChanges(`${s + 600}`, [s + 600, s + 7200], s), true);
  assert.equal(L.rappelsChanges(`${s + 600}`, [s + 900], s), true);
  assert.equal(L.rappelsChanges('', [], s), false);
  assert.equal(L.empreinte('abc'), L.empreinte('abc'));
  assert.notEqual(L.empreinte('abc'), L.empreinte('abd'));
}

// Deux créneaux ne partagent plus un moment ; un créneau type ne recouvre jamais ce qu'on a posé à la main.
{
  const s = [{ id: 'a', j: 0, s: 9, e: 10 }];
  assert.equal(L.chevauche(s, { id: 'b', j: 0, s: 9.5, e: 11 })?.id, 'a');
  assert.equal(L.chevauche(s, { id: 'b', j: 0, s: 10, e: 11 }), null);
  assert.equal(L.chevauche(s, { id: 'a', j: 0, s: 9.5, e: 11 }), null);   // lui-même ne compte pas
  const d = L.vide();
  d.recurrents = [{ id: 'r1', titre: 'Cours', cat: 'cours', s: 8, e: 12, jours: [0, 1, 2, 3, 4] }];
  const lun = L.isoJour(L.lundiDe(L.ajouterJours(new Date(), 7)));
  d.semaines[lun] = { type: 'base', slots: [{ id: 'm', j: 1, s: 9, e: 10, cat: 'loisirs', titre: 'Dentiste' }] };
  L.propager(d, ['r1']);
  const sl = d.semaines[lun].slots;
  assert.ok(sl.some(x => x.id === 'm' && x.s === 9 && x.e === 10));   // le créneau posé à la main reste entier
  assert.ok(!sl.some(x => x.j === 1 && x.titre === 'Cours'));          // le cours de ce jour-là saute
  assert.equal(sl.filter(x => x.titre === 'Cours').length, 4);
}

// Horaires jour par jour : réveil à 6 h le lundi, 8 h le mardi et le mercredi.
{
  const pj = [6, 8, 8, 7, 7, 9, 9].map(lever => ({ lever, coucher: 23 }));
  const b = L.creneauxDeBase({ sommeil: { parJour: pj } });
  const matin = b.filter(x => x.s === 6).map(x => [x.e, x.jours]);
  assert.deepEqual(matin.find(([e]) => e === 8)[1], [1, 2]);
  assert.ok(!matin.some(([e]) => e === 6));                         // levé à 6 h : pas de sommeil le matin
  assert.deepEqual(b.filter(x => x.s === 23).map(x => x.jours), [[0, 1, 2, 3, 4, 5, 6]]);
  const c = L.creneauxDeBase({ cours: { parJour: [{ debut: 8, fin: 12 }, null, { debut: 14, fin: 18 }, null, null, null, null], trajet: 0 } });
  assert.deepEqual(c.map(x => [x.s, x.e, x.jours]), [[8, 12, [0]], [14, 18, [2]]]);
}
// Un créneau du samedi 16 h au dimanche 17 h garde les repas et le sommeil ; tout autre créneau sur le chemin le bloque.
{
  const s = [{ id: 'd', j: 5, s: 19, e: 20, cat: 'repas' }, { id: 'n', j: 5, s: 23, e: 25, cat: 'sommeil' }, { id: 'm', j: 6, s: 6, e: 9, cat: 'sommeil' }, { id: 'dj', j: 6, s: 12, e: 13, cat: 'repas' }];
  const { morceaux } = L.morceauxMultiJours(s, { id: 'x', j: 5, s: 16, e: 17 }, 6, [6, 25]);
  assert.deepEqual(morceaux.map(m => [m.j, m.s, m.e]), [[5, 16, 19], [5, 20, 23], [6, 9, 12], [6, 13, 17]]);
  assert.equal(L.morceauxMultiJours([...s, { id: 'b', j: 6, s: 10, e: 11, cat: 'loisirs' }], { id: 'x', j: 5, s: 16, e: 17 }, 6, [6, 25]).gene.id, 'b');
}

// Un créneau type ne découpe plus les autres créneaux types : il saute le jour où il les recouvrirait.
{
  const d = L.vide();
  d.recurrents = [{ id: 'dodo', titre: 'Sommeil', cat: 'sommeil', s: 6, e: 8, jours: [0, 1, 2, 3, 4, 5, 6] }];
  const lun = L.isoJour(L.lundiDe(L.ajouterJours(new Date(), 7)));
  d.semaines[lun] = { type: 'base', slots: [] };
  L.propager(d, ['dodo']);
  d.recurrents.push({ id: 'yoga', titre: 'Yoga', cat: 'sport', s: 7, e: 9, jours: [0] });
  L.propager(d, ['yoga']);
  const sl = d.semaines[lun].slots;
  assert.ok(sl.some(x => x.j === 0 && x.titre === 'Sommeil' && x.s === 6 && x.e === 8));   // le sommeil reste entier
  assert.deepEqual(sl.filter(x => x.titre === 'Yoga').map(x => [x.s, x.e]), [[8, 9]]);    // le yoga se coupe autour (V1.10.9)
}
// Palette des couleurs : textes lisibles sur tous les fonds proposés, avec toutes les couleurs de boutons.
for (const fond of ['#F4F5F8', '#F3EAD9', '#FFE3EE', '#E9E3FF', '#DDF5E8', '#DDEEFF', '#0B0D11', '#1E2430', '#0B1630', '#1B0B33', '#07170F', '#220811']) {
  for (const accent of ['#FF9600', '#EC4A46', '#FF4D8D', '#B04CFF', '#6236E8', '#1D7BFF', '#00B3C7', '#16A34A', '#A6E35F', '#FFD447', '#8B5E3C', '#9AA1AE']) {
    const p = L.paletteTheme(fond, accent);
    for (const f of [p['--bg'], p['--surface'], p['--surface-2']]) assert.ok(L.contraste(p['--ink'], f) >= 4.5 && L.contraste(p['--ink-2'], f) >= 4.5, `texte sur ${fond}`);
    for (const f of [p['--bg'], p['--surface']]) assert.ok(L.contraste(p['--accent-txt'], f) >= 4.5, `accent ${accent} sur ${fond}`);
  }
}

// Poser : un cours de 9 h 30 à 17 h laisse la place au déjeuner ; deux cours ne se chevauchent pas ; un repas coupe un cours.
{
  const s = [{ id: 'dej', j: 0, s: 12, e: 13, cat: 'repas', titre: 'Déjeuner' }];
  assert.deepEqual(L.poser(s, { id: 'c', j: 0, s: 9.5, e: 17, cat: 'cours', titre: 'Cours' }).slots.filter(x => x.cat === 'cours').map(x => [x.s, x.e]), [[9.5, 12], [13, 17]]);
  const s2 = [{ id: 'td', j: 0, s: 9, e: 11, cat: 'cours', titre: 'TD' }];
  assert.equal(L.poser(s2, { id: 'tp', j: 0, s: 10, e: 12, cat: 'cours', titre: 'TP' }).gene.id, 'td');
  assert.deepEqual(L.poser(s2, { id: 'pdj', j: 0, s: 10, e: 10.5, cat: 'repas', titre: 'Goûter' }).slots.map(x => [x.titre, x.s, x.e]), [['TD', 9, 10], ['Goûter', 10, 10.5], ['TD', 10.5, 11]]);
  assert.equal(L.poser([...s], { id: 'd2', j: 0, s: 12.5, e: 13.5, cat: 'repas' }).gene.id, 'dej');
}

// Plus de Détente : ses créneaux passent en Loisirs ; « Travail perso » s'appelle « Révisions ».
{
  const o = L.migrer({ cats: [{ id: 'detente', nom: 'Détente' }, { id: 'loisirs', nom: 'Loisirs' }, { id: 'travail', nom: 'Travail perso' }],
    semaines: { '2026-10-26': { slots: [{ id: 'a', j: 0, s: 20, e: 22, cat: 'detente' }] } }, recurrents: [{ id: 'r', cat: 'detente', s: 22, e: 23, jours: [0] }] });
  assert.deepEqual(o.cats.map(c => c.nom), ['Loisirs', 'Révisions']);
  assert.equal(o.semaines['2026-10-26'].slots[0].cat, 'loisirs');
  assert.equal(o.recurrents[0].cat, 'loisirs');
  assert.ok(!L.CATS_DEPART.some(c => c.id === 'detente'));
}

// Moment déjà pris : raccourcir, décaler juste après, ou remplacer.
{
  const s = [{ id: 'rev', j: 0, s: 14, e: 16, cat: 'travail', titre: 'Révisions' }, { id: 'din', j: 0, s: 19, e: 20, cat: 'repas', titre: 'Dîner' }];
  const c = { id: 'sp', j: 0, s: 15, e: 16.5, cat: 'sport', titre: 'Sport' };
  const voir = r => r.slots.map(x => [x.titre, x.s, x.e]);
  assert.deepEqual(voir(L.resoudre(s, c, 'raccourcir')), [['Révisions', 14, 15], ['Sport', 15, 16.5], ['Dîner', 19, 20]]);
  assert.deepEqual(voir(L.resoudre(s, c, 'decaler')), [['Sport', 15, 16.5], ['Révisions', 16.5, 18.5], ['Dîner', 19, 20]]);
  assert.deepEqual(voir(L.resoudre(s, c, 'remplacer')), [['Sport', 15, 16.5], ['Dîner', 19, 20]]);
  const plein = [...s, { id: 'lo', j: 0, s: 17, e: 18, cat: 'loisirs', titre: 'Loisirs' }];
  assert.equal(L.resoudre(plein, c, 'decaler').gene.id, 'lo');   // décaler tomberait sur les loisirs
}

// Les morceaux d'un créneau coupé partagent un groupe ; un seul morceau n'en a pas.
{
  const s = [{ id: 'dej', j: 0, s: 12, e: 13, cat: 'repas', titre: 'Déjeuner' }];
  const r = L.poser(s, { id: 'ev', j: 0, s: 10, e: 15, cat: 'loisirs', titre: 'Sortie' }).slots.filter(x => x.titre === 'Sortie');
  assert.equal(r.length, 2);
  assert.ok(r.every(x => x.groupe === 'ev'));
}

// Déplacer le dîner type : il reste là le samedi malgré l'événement du week-end, qui se réarrange autour.
{
  const d = L.vide();
  const lun = L.isoJour(L.lundiDe(L.ajouterJours(new Date(), 7)));
  d.recurrents = [{ id: 'din', titre: 'Dîner', cat: 'repas', s: 19, e: 20, jours: [5, 6] }];
  d.semaines[lun] = { type: 'base', slots: [] };
  L.propager(d, ['din']);
  // L'événement du samedi 16 h au dimanche 17 h, coupé autour des deux dîners (ici, il finit avant celui du dimanche).
  const ev = { id: 'ev', j: 5, s: 16, e: 17, cat: 'loisirs', titre: 'Week-end' };
  const { morceaux } = L.morceauxMultiJours(d.semaines[lun].slots, ev, 6, [6, 25]);
  morceaux.forEach((m, i) => { d.semaines[lun].slots = L.placer(d.semaines[lun].slots, L.morceau(ev, m, i, morceaux.length)); });
  d.recurrents[0].s = 20; d.recurrents[0].e = 21;
  L.propager(d, ['din']);
  const sl = d.semaines[lun].slots;
  assert.deepEqual(sl.filter(x => x.titre === 'Dîner').map(x => [x.j, x.s, x.e]), [[5, 20, 21], [6, 20, 21]]);
  assert.deepEqual(sl.filter(x => x.titre === 'Week-end').map(x => [x.j, x.s, x.e]), [[5, 16, 20], [5, 21, 25], [6, 6, 17]]);
  assert.ok(sl.filter(x => x.titre === 'Week-end').every(x => x.groupe === 'ev'));
}

// Un niveau gagné reste : décocher retire l'XP, jamais sous le plus haut niveau atteint.
{
  const d = L.vide(); d.bonusXp = 650; d.niveauVu = L.stats(d, new Date()).niveau.n;
  d.bonusXp = 0;
  assert.equal(L.stats(d, new Date()).niveau.n, d.niveauVu);
}
// 32 créatures, quatre raretés.
assert.equal(L.CREATURES.length, 32);
assert.equal(L.tirer([], () => .1).rarete, 'epique');
assert.deepEqual([...new Set(L.CREATURES.map(c => c.rarete))].sort(), ['commune', 'epique', 'legendaire', 'rare']);

// Sous un niveau gagné, refaire une tâche rapporte à nouveau ; décocher puis recocher ne rapporte rien de plus.
{
  const d = L.vide(); d.niveauVu = 4;                         // 600 XP pour le niveau 4
  let st = L.stats(d, new Date()); assert.equal(st.total, 600); d.xpGarde = st.xpGarde;
  d.bonusXp = 20; st = L.stats(d, new Date()); assert.equal(st.total, 620); d.xpGarde = st.xpGarde;
  d.bonusXp = 0; st = L.stats(d, new Date()); assert.equal(st.total, 600); d.xpGarde = st.xpGarde;
  d.bonusXp = 20; assert.equal(L.stats(d, new Date()).total, 620);
}

// Un tirage tous les 5 niveaux ; la collection rangée des communes aux légendaires.
{
  const d = L.vide(); d.collection = [{ id: 'ronfleur' }]; d.bonusXp = L.seuil(11);
  assert.deepEqual(L.droitsTirage(d, L.stats(d, new Date())), ['niveau:5', 'niveau:10']);
  const r = L.creaturesRangees().map(c => L.RANG_RARETE[c.rarete]);
  assert.deepEqual(r, [...r].sort((a, b) => a - b));
}

// Une tâche qui revient ne se coche pas en boucle : à son jour, puis plus avant la fois suivante.
{
  const d = L.vide(), auj = new Date();
  const t = { id: 'lessive', titre: 'Lessive', rep: [{ j: L.jourSemaine(L.momentLogique(auj).date), h: null }], echeance: L.isoJour(L.momentLogique(auj).date), faits: [], priorite: 2, sous: [] };
  let x = L.cocher(t, auj);
  assert.equal(x.faits.length, 1);
  assert.ok(x.echeance > t.echeance);                     // la fois suivante, dans une semaine
  for (let k = 0; k < 20; k++) x = L.cocher(x, auj);      // cocher en boucle : rien de plus
  assert.equal(x.faits.length, 1);
  assert.equal(L.joursAvant(x.echeance, auj), 7);
  assert.ok(!L.cochable(x, auj));
  d.taches.push(x);
  assert.equal(L.stats(d, auj).sources.taches, 20);
}
// La réserve d'XP ne fait pas gagner en boucle : cocher et décocher sous un niveau gagné revient toujours au même.
{
  const d = L.vide(); d.niveauVu = 4;
  d.taches = [{ id: 'a', titre: 'A', fait: true, faits: ['2026-10-25'] }, { id: 'b', titre: 'B', fait: true, faits: ['2026-10-25'] }];
  const tour = () => { const st = L.stats(d, new Date()); d.xpGarde = st.xpGarde; return st.total; };
  const totaux = [];
  for (let k = 0; k < 6; k++) {
    d.taches.forEach(t => { t.fait = false; t.faits = []; }); tour();
    d.taches.forEach(t => { t.fait = true; t.faits = ['2026-10-25']; }); totaux.push(tour());
  }
  assert.ok(totaux.every(x => x === totaux[0]), 'le total ne grimpe pas à chaque tour : ' + totaux);
}
// Séances : au plus deux par jour comptent.
{
  const d = L.vide();
  for (let k = 0; k < 6; k++) d.journal.push({ id: 's' + k, date: '2026-10-25', series: [{ exo: 'p', sets: [{ reps: 1 }] }] });
  d.journal.push({ id: 'z', date: '2026-10-24', series: [] });
  assert.equal(L.stats(d, new Date(2026, 9, 25)).sources.sport, 3 * L.XP.seance);
}

// Une sauvegarde se réimporte sans rien perdre : créneaux types, morceaux reliés, niveaux, réserve d'XP, couleurs, répétitions.
{
  const d = L.vide();
  d.recurrents = [{ id: 'din', titre: 'Dîner', cat: 'repas', s: 19, e: 20, jours: [0, 1], salle: '', affaires: '' }];
  d.semaines['2026-10-26'] = { type: 'base', slots: [{ id: 'a', groupe: 'a', j: 5, s: 16, e: 19, cat: 'loisirs', titre: 'Tournoi' }, { id: 'b', groupe: 'a', j: 5, s: 20, e: 25, cat: 'loisirs', titre: 'Tournoi' }] };
  Object.assign(d, { niveauVu: 6, xpGarde: 120, couleurs: { fond: '#1b0b33', accent: '#ff9600' } });
  d.taches.push({ id: 't', titre: 'Lessive', rep: [{ j: 6, h: 10 }], echeance: '2026-11-01', heure: 10, faits: ['2026-10-25'], priorite: 2, sous: [] });
  d.habitudes.push({ id: 'h', nom: 'Lire', freq: 'jour', faits: ['2026-10-25'], horaires: [{ j: 0, h: 22 }] });
  const o = L.validerImport(JSON.parse(JSON.stringify(d)));
  assert.deepEqual(o.recurrents[0].jours, [0, 1]);
  assert.deepEqual(o.semaines['2026-10-26'].slots.map(x => x.groupe), ['a', 'a']);
  assert.deepEqual([o.niveauVu, o.xpGarde, o.couleurs.fond], [6, 120, '#1b0b33']);
  assert.deepEqual(o.taches[0].rep, [{ j: 6, h: 10 }]);
  assert.deepEqual(o.habitudes[0].horaires, [{ j: 0, h: 22 }]);
  assert.equal(o.notifs.actif, false);   // jamais l'abonnement d'un autre téléphone
}

// Une tâche simple, un objectif, un créneau : l'XP une seule fois. Cocher, décocher, recocher en boucle ne change plus rien.
{
  const d = L.vide(), auj = new Date();
  const t = { id: 't', titre: 'T', faits: [], priorite: 2, sous: [] };
  d.taches.push(t);
  d.objectifs.push({ id: 'o', txt: 'O', horizon: 'semaine', fait: false });
  d.semaines['2026-10-19'] = { slots: [{ id: 's', j: 0, s: 9, e: 10, cat: 'loisirs', titre: 'S' }] };
  const o = d.objectifs[0], s = d.semaines['2026-10-19'].slots[0];
  const total = () => { L.retenirXp(d); return L.stats(d, auj).total; };
  const base = total(), vus = [];
  for (let k = 0; k < 5; k++) {
    Object.assign(t, L.cocher(t, auj)); o.fait = true; s.fait = true; vus.push(total());
    t.fait = false; t.faits = t.faits.slice(0, -1); o.fait = false; s.fait = null; vus.push(total());
  }
  const gain = L.XP.tache + L.XP.objectif.semaine + L.XP.creneau + L.XP.jour;   // et le bonus de la journée validée
  assert.ok(vus.every(v => v === base + gain), 'toujours le même total : ' + vus);
}

// Habitude cochée et décochée en boucle : 5 XP une seule fois pour ce jour-là.
{
  const d = L.vide(), hb = { id: 'h', nom: 'Lire', freq: 'jour', faits: [], horaires: [] };
  d.habitudes.push(hb);
  const t = () => { L.retenirXp(d); return L.stats(d, new Date()).sources.habitudes; };
  const vus = [];
  for (let k = 0; k < 7; k++) { hb.faits = hb.faits.length ? [] : ['2026-10-25']; vus.push(t()); }
  assert.ok(vus.every(v => v === L.XP.habitude), 'habitude : ' + vus);
}

// Revue du 25/10 : une tâche qui revient ne se recoche pas le même jour en changeant ou en vidant l'échéance ;
// un créneau coupé en morceaux ne rapporte qu'une fois ; les entraînements du club entrent dans le plafond des séances.
{
  const auj = new Date(), iso = L.isoJour(auj), j = L.jourSemaine(auj);
  let t = L.cocher({ id: 't', titre: 'T', rep: [{ j, h: null }], echeance: iso, faits: [], priorite: 2, sous: [] }, auj);
  t = { ...t, echeance: iso };                       // l'échéance ramenée à aujourd'hui
  assert.ok(!L.cochable(t, auj));
  t = { ...t, echeance: null };                      // ou vidée
  assert.ok(!L.cochable(t, auj));
  assert.equal(L.cocher(t, auj).faits.length, 1);
  const d = L.vide();
  d.semaines['2026-10-19'] = { slots: [{ id: 'a', groupe: 'a', j: 0, s: 9, e: 12, cat: 'cours', fait: true }, { id: 'b', groupe: 'a', j: 0, s: 13, e: 17, cat: 'cours', fait: true }, { id: 'c', j: 1, s: 9, e: 10, cat: 'loisirs', fait: true }] };
  assert.equal(L.stats(d, new Date(2026, 9, 25)).sources.creneaux, 2 * L.XP.creneau);
  d.semaines['2026-10-19'].slots.push({ id: 'k1', j: 2, s: 18, e: 20, cat: 'sport', club: true, fait: true });
  for (let k = 0; k < 3; k++) d.journal.push({ id: 'j' + k, date: '2026-10-21', series: [] });
  assert.equal(L.stats(d, new Date(2026, 9, 25)).seances, 2);   // 3 séances + 1 entraînement le même jour : 2 comptent
}

// Une couleur qui n'est pas un code #rrggbb ne passe pas l'import (rien ne s'injecte dans le style).
{
  const d = L.vide();
  d.couleurs = { fond: '#112233', accent: 'red;background:url(x)' };
  const o = L.validerImport(JSON.parse(JSON.stringify(d)));
  assert.equal(o.couleurs.fond, '#112233');
  assert.equal(o.couleurs.accent, undefined);
}

// V1.10.27 : un rappel avant le sommeil (pas après minuit pour la suite de la nuit) et avant le dîner,
// fondu avec le bilan en une seule notification.
{
  const d = L.vide();
  d.semaines['2026-10-26'] = { slots: [{ j: 0, s: 19, e: 20, cat: 'repas', titre: 'Dîner' }, { j: 0, s: 23, e: 24, cat: 'sommeil', titre: 'Sommeil' }, { j: 1, s: 0, e: 7, cat: 'sommeil', titre: 'Sommeil' }] };
  const rs = L.calculerRappels(d, new Date(2026, 9, 26, 7, 0).getTime(), { ...L.REGLAGES_RAPPELS });
  const a = (j, h, m) => new Date(2026, 9, 26 + j, h, m).getTime() / 1000;
  assert.ok(rs.some(x => x.t === a(0, 22, 45) && x.titre === 'Dans 15 min : Sommeil'));
  assert.ok(!rs.some(x => x.t === a(0, 23, 45)));                     // la suite de la nuit, à minuit : pas de rappel
  const diner = rs.filter(x => x.t === a(0, 18, 45));
  assert.equal(diner.length, 1);
  assert.equal(diner[0].titre, 'Bilan de ta journée · Dans 15 min : Dîner');
}

// V1.10.29 : un rappel avant chaque créneau, quelle que soit sa catégorie.
{
  const d = L.vide();
  d.semaines['2026-10-26'] = { slots: [{ j: 0, s: 14, e: 16, cat: 'loisirs', titre: 'Piscine' }, { j: 0, s: 16, e: 17, cat: 'menage', titre: 'Ménage' }] };
  const rs = L.calculerRappels(d, new Date(2026, 9, 26, 7, 0).getTime(), { ...L.REGLAGES_RAPPELS, soir: false, bilan: false });
  assert.deepEqual(rs.map(x => x.titre), ['Dans 15 min : Piscine', 'Dans 15 min : Ménage']);
}

console.log('ok');
