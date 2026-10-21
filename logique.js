// Fonctions pures de l'app (sans page) : dates, créneaux, sauvegarde. Vérifiées par test.mjs.

export const uid = () => Math.random().toString(36).slice(2, 10);
const pad = n => String(n).padStart(2, '0');

// Dates : une semaine est repérée par la date de son lundi, « 2026-10-19 ».
export const isoJour = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const deIso = s => { const [y, m, j] = s.split('-').map(Number); return new Date(y, m - 1, j); };
export const ajouterJours = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const jourSemaine = d => (d.getDay() + 6) % 7; // 0 = lundi
export const lundiDe = d => ajouterJours(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -jourSemaine(d));

// Entre minuit et 1 h, on est encore dans la journée de la veille : la plage va jusqu'à 25 h.
export function momentLogique(now) {
  let date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let h = now.getHours() + now.getMinutes() / 60;
  if (h < 1) { date = ajouterJours(date, -1); h += 24; }
  return { date, h };
}

// Période d'un objectif : semaine (son lundi), mois, ou année universitaire (septembre à août).
export function periode(horizon, d) {
  if (horizon === 'semaine') return isoJour(lundiDe(d));
  if (horizon === 'mois') return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const y = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${y + 1}`;
}

export const hhmm = h => `${pad(Math.floor(h) % 24)}:${pad(Math.round(h % 1 * 60))}`;
export const duree = m => m >= 60 ? `${Math.floor(m / 60)} h ${pad(m % 60)}` : `${m} min`;
export const heures = v => `${Math.floor(v)} h${v % 1 ? ' 30' : ''}`;

// Texte noir ou blanc sur une couleur : celui qui contraste le plus.
export function texteSur(hex) {
  const lin = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  const L = .2126 * lin[0] + .7152 * lin[1] + .0722 * lin[2];
  return 1.05 / (L + .05) > (L + .05) / .059 ? 'light' : 'dark';
}
export const couleurSure = c => /^#[0-9a-f]{6}$/i.test(c) ? c : '#9aa1ae';

// Pose un créneau sur sa journée. Comme sur l'EDT papier, chaque demi-heure n'a qu'une
// catégorie : le nouveau créneau rogne, coupe en deux ou remplace ce qu'il recouvre.
export function placer(slots, c) {
  const res = [];
  for (const x of slots) {
    if (x.id === c.id) continue;
    if (x.j !== c.j || x.e <= c.s || x.s >= c.e) { res.push(x); continue; }
    if (x.s < c.s) res.push({ ...x, e: c.s });
    if (x.e > c.e) res.push({ ...x, id: x.s < c.s ? uid() : x.id, s: c.e });
  }
  res.push(c);
  return res.sort((a, b) => a.j - b.j || a.s - b.s);
}

const copieDe = slots => slots.map(s => ({ ...s, id: uid(), src: s.id, fait: null }));

// Une semaine pas encore ouverte reçoit une copie de la semaine type par défaut.
export function semaine(data, cle) {
  if (!data.semaines[cle]) {
    const t = data.types.find(t => t.id === data.typeDefaut) || data.types[0];
    data.semaines[cle] = { type: t ? t.id : null, slots: t ? copieDe(t.slots) : [] };
  }
  return data.semaines[cle];
}
export function appliquerType(data, cle, typeId) {
  const t = data.types.find(t => t.id === typeId);
  data.semaines[cle] = { type: typeId, slots: copieDe(t.slots) };
}
export function copierJour(slots, de, vers) {
  const copies = slots.filter(s => s.j === de).map(s => ({ ...s, id: uid(), j: vers, fait: null }));
  return [...slots.filter(s => s.j !== vers), ...copies].sort((a, b) => a.j - b.j || a.s - b.s);
}

export function heuresParCat(slots) {
  const t = {};
  for (const s of slots) t[s.cat] = (t[s.cat] || 0) + s.e - s.s;
  return t;
}

// Garde-fou de l'import : on ne remplace les données que par une vraie sauvegarde de l'app.
export function valider(o) {
  const ok = o && o.version === 1 && Array.isArray(o.cats) && Array.isArray(o.types) && o.semaines && typeof o.semaines === 'object'
    && Array.isArray(o.notes) && Array.isArray(o.listes) && Array.isArray(o.objectifs) && Array.isArray(o.plage);
  if (!ok) throw new Error('Ce fichier n’est pas une sauvegarde de l’app.');
  return migrer(o);
}
// Les sauvegardes d'avant la V1.2 n'ont pas encore ces rubriques.
export function migrer(o) {
  for (const k of ['taches', 'projets', 'exos', 'seances', 'journal', 'habitudes']) if (!Array.isArray(o[k])) o[k] = [];
  if (typeof o.repos !== 'number') o.repos = 90;
  if (typeof o.club !== 'string') o.club = '';
  return o;
}

// ---------- Tâches ----------

export const joursAvant = (iso, auj) => Math.round((deIso(iso) - new Date(auj.getFullYear(), auj.getMonth(), auj.getDate())) / 864e5);

// Cocher une tâche récurrente la repousse à sa prochaine date au lieu de la terminer.
export function cocher(t, auj) {
  if (!t.recurrence && t.recurrence !== 0) return { ...t, fait: true, faitLe: isoJour(auj) };
  let d = t.echeance ? deIso(t.echeance) : new Date(auj.getFullYear(), auj.getMonth(), auj.getDate());
  do d = ajouterJours(d, 1); while (jourSemaine(d) !== t.recurrence || d <= auj);
  return { ...t, fait: false, echeance: isoJour(d), sous: (t.sous || []).map(s => ({ ...s, fait: false })) };
}

// À faire bientôt : en retard, aujourd'hui, ou dans les 7 jours ; puis par date et priorité.
export function aFaire(taches, auj, horizon = 7) {
  return taches.filter(t => !t.fait && t.echeance && joursAvant(t.echeance, auj) <= horizon)
    .sort((a, b) => a.echeance.localeCompare(b.echeance) || (a.priorite || 2) - (b.priorite || 2));
}

// ---------- Sport ----------

export const TYPES_EXO = { reps: 'Répétitions', duree: 'Durée', distance: 'Distance', charge: 'Charge' };
// La valeur qui compte pour la progression : répétitions, secondes, kilomètres ou kilos.
export const valeur = (type, s) => +({ reps: s.reps, duree: s.sec, distance: s.km, charge: s.kg }[type] || 0);
export function progression(journal, exo, type) {
  return journal.filter(e => e.series?.some(x => x.exo === exo))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => ({ date: e.date, val: Math.max(...e.series.filter(x => x.exo === exo).flatMap(x => x.sets.map(s => valeur(type, s)))) }))
    .filter(p => p.val > 0);
}
export const dernieresSeries = (journal, exo) => [...journal].sort((a, b) => b.date.localeCompare(a.date)).find(e => e.series?.some(x => x.exo === exo))?.series.find(x => x.exo === exo).sets;

export const faitsSemaine = (h, lundi) => {
  const de = isoJour(lundi), a = isoJour(ajouterJours(lundi, 6));
  return h.faits.filter(d => d >= de && d <= a).length;
};

// Renfo conseillé par sport : des exercices classiques, à adapter avec son coach.
export const CONSEILS = {
  'Volley': [['Squats sautés', 'reps', 10], ['Fentes avant', 'reps', 12], ['Gainage', 'duree', 45], ['Pompes', 'reps', 10], ['Mollets debout', 'reps', 20], ['Rotations d’épaule à l’élastique', 'reps', 15]],
  'Basket': [['Squats sautés', 'reps', 10], ['Fentes latérales', 'reps', 12], ['Gainage', 'duree', 45], ['Mollets debout', 'reps', 20], ['Pompes', 'reps', 10], ['Sauts latéraux', 'duree', 30]],
  'Football': [['Fentes avant', 'reps', 12], ['Squats', 'reps', 15], ['Gainage latéral', 'duree', 30], ['Nordic ischios', 'reps', 6], ['Mollets debout', 'reps', 20], ['Sauts latéraux', 'duree', 30]],
  'Handball': [['Pompes', 'reps', 12], ['Squats sautés', 'reps', 10], ['Gainage', 'duree', 45], ['Rotations d’épaule à l’élastique', 'reps', 15], ['Fentes avant', 'reps', 12], ['Tirage à l’élastique', 'reps', 15]],
  'Natation': [['Pompes', 'reps', 10], ['Tirage à l’élastique', 'reps', 15], ['Gainage', 'duree', 45], ['Superman', 'reps', 12], ['Squats', 'reps', 15], ['Rotations d’épaule à l’élastique', 'reps', 15]],
  'Course à pied': [['Squats', 'reps', 15], ['Fentes avant', 'reps', 12], ['Mollets debout', 'reps', 20], ['Gainage', 'duree', 45], ['Pont fessier', 'reps', 15], ['Montées de genoux', 'duree', 30]],
  'Tennis': [['Fentes latérales', 'reps', 12], ['Rotations d’épaule à l’élastique', 'reps', 15], ['Gainage', 'duree', 45], ['Squats', 'reps', 15], ['Pompes', 'reps', 10], ['Mollets debout', 'reps', 20]],
  'Badminton': [['Fentes avant', 'reps', 12], ['Squats sautés', 'reps', 10], ['Rotations d’épaule à l’élastique', 'reps', 15], ['Gainage', 'duree', 45], ['Mollets debout', 'reps', 20], ['Sauts latéraux', 'duree', 30]],
  'Escalade': [['Tractions', 'reps', 5], ['Suspension à la barre', 'duree', 20], ['Gainage', 'duree', 45], ['Pompes', 'reps', 10], ['Rotations d’épaule à l’élastique', 'reps', 15], ['Superman', 'reps', 12]],
  'Danse': [['Pont fessier', 'reps', 15], ['Gainage', 'duree', 45], ['Mollets debout', 'reps', 20], ['Squats', 'reps', 15], ['Fentes avant', 'reps', 12], ['Équilibre sur une jambe', 'duree', 30]],
  'Rugby': [['Squats', 'charge', 8], ['Pompes', 'reps', 15], ['Tractions', 'reps', 6], ['Gainage', 'duree', 60], ['Fentes avant', 'reps', 12], ['Soulevé de terre', 'charge', 6]],
};

export const CATS_DEPART = [
  ['cours', 'Transport et cours', '#EC4A46'], ['sommeil', 'Sommeil', '#FF9B3D'], ['detente', 'Détente', '#FFD447'],
  ['repas', 'Repas', '#34BD67'], ['travail', 'Travail perso', '#35C6DF'], ['loisirs', 'Loisirs', '#6766F0'],
  ['menage', 'Ménage', '#FF8AC1'], ['sport', 'Sport', '#B5DF2B'],
].map(([id, nom, couleur]) => ({ id, nom, couleur }));

export const vide = () => migrer({
  version: 1,
  cats: CATS_DEPART.map(c => ({ ...c })),
  plage: [6, 25],
  types: [], typeDefaut: null, semaines: {},
  notes: [],
  listes: ['Courses', 'À acheter', 'À regarder', 'À lire', 'Matériel'].map(nom => ({ id: uid(), nom, tags: [], items: [] })),
  objectifs: [],
  dernierExport: null,
});

// Semaine d'exemple proposée au premier lancement : [début, fin, catégorie, titre, salle].
const matin = [[6, 7.5, 'sommeil', 'Sommeil'], [7.5, 8, 'repas', 'Petit-déjeuner']];
const soir = [[19, 20, 'repas', 'Dîner'], [20, 22, 'loisirs', 'Écriture'], [22, 23, 'detente', 'Série'], [23, 25, 'sommeil', 'Sommeil']];
const EXEMPLE = [
  [...matin, [8, 8.5, 'cours', 'Trajet'], [8.5, 10.5, 'cours', 'Base de données', 'Salle 204'], [10.5, 12.5, 'cours', 'Finance d’entreprise', 'Amphi B'], [12.5, 13.5, 'repas', 'Déjeuner'], [13.5, 15.5, 'cours', 'Algorithmique', 'Salle info 3'], [15.5, 16, 'cours', 'Trajet'], [16, 18, 'travail', 'Révisions'], [18, 19, 'sport', 'Course à pied'], ...soir],
  [...matin, [8, 8.5, 'cours', 'Trajet'], [8.5, 10.5, 'cours', 'Contrôle de gestion', 'Salle 204'], [10.5, 12.5, 'cours', 'Anglais', 'Salle 112'], [12.5, 13.5, 'repas', 'Déjeuner'], [13.5, 15.5, 'cours', 'Ethics of IT', 'Amphi A'], [15.5, 16, 'cours', 'Trajet'], [16, 17.5, 'travail', 'TD'], [17.5, 19, 'loisirs', 'Lecture'], ...soir],
  [...matin, [8, 8.5, 'cours', 'Trajet'], [8.5, 10.5, 'cours', 'Algorithmique', 'Salle info 3'], [10.5, 12.5, 'travail', 'Travail perso'], [12.5, 13.5, 'repas', 'Déjeuner'], [13.5, 15.5, 'cours', 'Base de données', 'Salle 204'], [15.5, 16, 'cours', 'Trajet'], [16, 17, 'detente', 'Pause'], [17, 18.5, 'sport', 'Renfo'], [18.5, 19, 'menage', 'Rangement'], ...soir],
  [...matin, [8, 8.5, 'cours', 'Trajet'], [8.5, 10.5, 'cours', 'Finance d’entreprise', 'Amphi B'], [10.5, 12.5, 'cours', 'Atelier Numérique et Management', 'Salle 015'], [12.5, 13.5, 'repas', 'Déjeuner'], [13.5, 15.5, 'cours', 'Manager responsable', 'Amphi C'], [15.5, 16, 'cours', 'Trajet'], [16, 18, 'travail', 'Révisions'], [18, 19, 'menage', 'Ménage'], ...soir],
  [...matin, [8, 9.5, 'detente', 'Matinée calme'], [9.5, 10, 'cours', 'Trajet'], [10, 12, 'cours', 'Contrôle de gestion', 'Salle 204'], [12, 13, 'repas', 'Déjeuner'], [13, 14, 'cours', 'Développement pro', 'Salle 112'], [14, 14.5, 'cours', 'Trajet'], [14.5, 16, 'travail', 'Projet Atelier'], [16, 17, 'sport', 'Course à pied'], [17, 19, 'loisirs', 'Loisirs'], ...soir],
  [[6, 10, 'sommeil', 'Sommeil'], [10, 11, 'repas', 'Brunch'], [11, 12.5, 'menage', 'Courses et lessive'], [12.5, 13.5, 'repas', 'Déjeuner'], [13.5, 17, 'loisirs', 'Écriture'], [17, 18, 'sport', 'Renfo'], [18, 19, 'detente', 'Pause'], ...soir],
  [[6, 10, 'sommeil', 'Sommeil'], [10, 11, 'repas', 'Brunch'], [11, 12.5, 'detente', 'Balade'], [12.5, 13.5, 'repas', 'Déjeuner'], [13.5, 16, 'travail', 'Révisions'], [16, 16.5, 'travail', 'Bilan de la semaine'], [16.5, 19, 'loisirs', 'Loisirs'], ...soir],
];
export const slotsExemple = () => EXEMPLE.flatMap((jour, j) => jour.map(([s, e, cat, titre, salle = '']) =>
  ({ id: uid(), j, s, e, cat, titre, salle, affaires: '', notes: '' })));
