// Fonctions pures de l'app (sans page) : dates, créneaux, sauvegarde. Vérifiées par test.mjs.

export const VERSION = '1.10.17';
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

export function versHeure(texte, debutPlage = 6) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(texte || '').trim());
  if (!m) return NaN;
  let h = +m[1] + +m[2] / 60;
  if (h < debutPlage) h += 24;
  return Math.round(h * 60) / 60;
}
export const hhmm = h => { const m = Math.round(h * 60); return `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`; };
export const duree = m => m >= 60 ? `${Math.floor(m / 60)} h ${pad(m % 60)}` : `${m} min`;
export const heures = v => `${Math.floor(v)} h${v % 1 ? ' 30' : ''}`;

// Texte noir ou blanc sur une couleur : celui qui contraste le plus.
export function texteSur(hex) {
  const lin = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  const L = .2126 * lin[0] + .7152 * lin[1] + .0722 * lin[2];
  return 1.05 / (L + .05) > (L + .05) / .059 ? 'light' : 'dark';
}
export const couleurSure = c => /^#[0-9a-f]{6}$/i.test(c) ? c : '#9aa1ae';


// ---------- Thème à deux couleurs (V1.10.2, repris en V1.10.5 avec des pastilles) ----------
// Emma choisit le fond (et les bulles) et l'accent (boutons, flamme). Tout le reste s'en déduit, avec des
// contrastes vérifiés : textes à 4,5:1 au moins sur le fond, les bulles et les zones grises (7:1 visé pour le texte principal).
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const versHex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
export const melange = (a, b, t) => { const x = rgb(a), y = rgb(b); return versHex(x.map((v, i) => v + (y[i] - v) * t)); };
const lum = h => { const l = rgb(h).map(c => c / 255).map(c => c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4); return .2126 * l[0] + .7152 * l[1] + .0722 * l[2]; };
export const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
// Rapproche c de la cible (noir ou blanc) juste assez pour être lisible sur tous les fonds donnés.
const lisible = (c, cible, fonds, min = 4.5) => {
  for (let t = 0; t <= 1.001; t += .05) { const x = melange(c, cible, Math.min(t, 1)); if (fonds.every(f => contraste(x, f) >= min)) return x; }
  return cible;
};
export function paletteTheme(fond, accent) {
  fond = couleurSure(fond).toLowerCase(); accent = couleurSure(accent).toLowerCase();
  const sombre = texteSur(fond) === 'light', extreme = sombre ? '#ffffff' : '#000000';
  // Un fond presque blanc s'assombrit un peu, pour que les bulles blanches s'en détachent.
  let bg = !sombre && contraste(fond, '#ffffff') < 1.12 ? melange(fond, '#000000', .08) : fond, fonds;
  const bulles = bg => [bg, sombre ? melange(bg, '#ffffff', .1) : melange(bg, '#ffffff', .75), sombre ? melange(bg, '#ffffff', .2) : melange(bg, '#000000', .1)];
  // Un fond « moyen » (gris, magenta…) s'éloigne du texte juste assez pour qu'il ressorte partout.
  for (let k = 0; k < 12 && bulles(bg).some(f => contraste(extreme, f) < 6); k++) bg = melange(bg, sombre ? '#000000' : '#ffffff', .12);
  fonds = bulles(bg);
  const [, surface, surface2] = fonds;
  return {
    '--bg': bg, '--surface': surface, '--surface-2': surface2,
    '--ink': lisible(melange(bg, extreme, .85), extreme, fonds, 7),
    '--ink-2': lisible(melange(bg, extreme, .55), extreme, fonds),
    '--line': melange(bg, extreme, sombre ? .3 : .25),
    '--on-ink': sombre ? bg : '#ffffff',
    '--accent': accent, '--on-accent': texteSur(accent) === 'light' ? '#ffffff' : '#15171c',
    '--accent-txt': lisible(accent, extreme, [bg, surface]),
    '--flamme': accent,
    '--danger': lisible(sombre ? '#ff8a80' : '#c42b27', extreme, [bg, surface]),
    '--shadow': sombre ? '0 8px 24px rgb(0 0 0 / .6)' : '0 8px 24px rgb(0 0 0 / .18)',
    'color-scheme': sombre ? 'dark' : 'light',
  };
}

// Pose un créneau sur sa journée. Comme sur l'EDT papier, chaque moment n'a qu'une
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
// Le créneau déjà posé qui recouvre c, s'il y en a un (V1.10.3 : deux créneaux ne partagent plus un moment).
export const chevauche = (slots, c) => slots.find(x => x.id !== c.id && x.j === c.j && x.s < c.e && x.e > c.s) || null;
// Un créneau sur plusieurs jours (samedi 16 h › dimanche 17 h) : coupé jour par jour, il laisse la place aux repas et au
// sommeil déjà posés. Rend les morceaux, ou le créneau qui gêne (tout autre créneau sur le chemin).
export const GARDES = ['sommeil', 'repas'];
export function morceauxMultiJours(slots, c, jFin, [p0, p1]) {
  const morceaux = [];
  for (let j = c.j; j <= jFin; j++) {
    const a = j === c.j ? c.s : p0, b = j === jFin ? c.e : p1;
    let libres = [[a, b]];
    for (const x of slots.filter(x => x.j === j && x.id !== c.id && GARDES.includes(x.cat) && x.s < b && x.e > a)) {
      libres = libres.flatMap(([s, e]) => x.e <= s || x.s >= e ? [[s, e]] : [[s, x.s], [x.e, e]].filter(([u, v]) => v - u >= .25));
    }
    for (const [s, e] of libres) {
      const m = { j, s, e };
      const gene = slots.find(x => x.id !== c.id && !GARDES.includes(x.cat) && x.j === j && x.s < e && x.e > s);
      if (gene) return { gene };
      morceaux.push(m);
    }
  }
  return { morceaux };
}
// Un moment déjà pris (V1.10.12) : on remplace ce qui gêne, on le raccourcit autour du nouveau créneau, ou on le décale
// juste après. Rend les créneaux, ou { gene } si le décalage tombe à son tour sur autre chose.
export function resoudre(slots, c, mode) {
  const garde = GARDES.includes(c.cat);
  const gene = x => x.id !== c.id && x.j === c.j && x.s < c.e && x.e > c.s && GARDES.includes(x.cat) === garde;
  const genants = slots.filter(gene).sort((a, b) => a.s - b.s);
  let res = slots.filter(x => !gene(x));
  if (mode === 'raccourcir') res.push(...genants.flatMap(x => { const t = [[x.s, Math.min(x.e, c.s)], [Math.max(x.s, c.e), x.e]].filter(([s, e]) => e - s >= .25); return t.map(([s, e], i) => morceau(x, { s, e }, i, t.length)); }));
  if (mode === 'decaler') {
    let t = c.e;
    for (const x of genants) {
      const m = { ...x, s: t, e: t + x.e - x.s };
      if (m.e > 26) return { gene: x };
      const p = poser([...res, c], m);
      if (p.gene) return { gene: p.gene };
      res = p.slots.filter(y => y.id !== c.id);
      t = m.e;
    }
  }
  const p = poser(res, c);
  return p.gene ? { gene: p.gene } : { slots: p.slots };
}
// Un morceau d'un créneau coupé : le premier garde l'identifiant ; tous partagent « groupe » s'il y en a plusieurs.
export function morceau(c, m, i, n) {
  const x = { ...c, ...m, id: i ? uid() : c.id };
  if (n > 1) x.groupe = c.groupe || c.id;
  return x;
}
// Poser un créneau (V1.10.9). Le sommeil et les repas passent en premier : ils coupent ce qu'ils recouvrent, et un autre
// créneau posé sur eux se coupe autour (des cours de 9 h 30 à 17 h laissent la place au déjeuner). Deux créneaux qui ne
// sont ni sommeil ni repas, ou deux repas, ne se partagent pas un moment : rend { gene } sans rien changer.
export function poser(slots, c) {
  const garde = GARDES.includes(c.cat);
  const dessous = slots.filter(x => x.id !== c.id && x.j === c.j && x.s < c.e && x.e > c.s);
  const gene = dessous.find(x => GARDES.includes(x.cat) === garde);
  if (gene) return { gene };
  if (garde) {
    const res = slots.flatMap(x => {
      if (x.id === c.id) return [];
      if (x.j !== c.j || x.e <= c.s || x.s >= c.e) return [x];
      const t = [[x.s, c.s], [c.e, x.e]].filter(([s, e]) => e - s >= .25);
      return t.map(([s, e], i) => morceau(x, { s, e }, i, t.length));
    });
    return { slots: [...res, c].sort((a, b) => a.j - b.j || a.s - b.s) };
  }
  const { morceaux } = morceauxMultiJours(slots, c, c.j, [c.s, c.e]);
  if (!morceaux?.length) return { gene: dessous[0] };
  const res = slots.filter(x => x.id !== c.id);
  morceaux.forEach((m, i) => res.push(morceau(c, m, i, morceaux.length)));
  return { slots: res.sort((a, b) => a.j - b.j || a.s - b.s) };
}

// ---------- Créneaux types (V1.10) ----------
// Ce qui revient chaque semaine (sommeil de 23 h à 7 h, repas, cours…) : data.recurrents, une ligne par créneau type
// et ses jours. Ils forment le modèle (le seul « type », id « base ») qui remplit chaque nouvelle semaine.
// Un créneau de semaine venu d'un créneau type garde son origine dans src : « <id du créneau type>-<jour> ».
export const ID_BASE = 'base';
const slotDe = (r, j) => ({ j, s: r.s, e: r.e, cat: r.cat, titre: r.titre, salle: r.salle || '', affaires: r.affaires || '', notes: '', ...(r.club ? { club: true } : {}) });
export function modele(recurrents) {
  let slots = [];
  for (const r of recurrents) for (const j of [...new Set(r.jours)].sort()) { const p = poser(slots, { id: `${r.id}-${j}`, ...slotDe(r, j) }); if (p.slots) slots = p.slots; }
  return slots;
}
export function regenerer(data) {
  data.types = [{ id: ID_BASE, nom: 'Créneaux types', slots: modele(data.recurrents || []) }];
  data.typeDefaut = ID_BASE;
}
export const recurrentDe = (data, src) => data.recurrents.find(r => String(src || '').startsWith(r.id + '-'));
// Après un changement de créneaux types : les semaines déjà ouvertes suivent, à partir d'aujourd'hui.
// Le passé ne bouge pas ; un créneau déjà validé non plus.
export function propager(data, ids, maintenant = new Date()) {
  const auj = momentLogique(maintenant).date, lundiAuj = isoJour(lundiDe(auj)), jAuj = jourSemaine(auj);
  const de = (x, id) => String(x.src || '').startsWith(id + '-');
  // V1.10.5 : rien n'est recouvert, ni ce qu'on a posé à la main ni les autres créneaux types : le créneau type saute ce jour-là.
  // Seuls ceux qu'on repose ensemble peuvent se couper entre eux (les repas coupent les cours de la base).
  const autre = x => !ids.some(id => de(x, id));
  for (const [cle, sem] of Object.entries(data.semaines)) {
    if (cle < lundiAuj) continue;
    const ouvert = j => cle > lundiAuj || j >= jAuj;
    let slots = sem.slots.filter(x => !(ouvert(x.j) && !x.fait && ids.some(id => de(x, id))));
    for (const r of data.recurrents.filter(r => ids.includes(r.id))) for (const j of [...new Set(r.jours)].sort()) {
      if (!ouvert(j) || slots.some(x => x.j === j && x.fait && de(x, r.id))) continue;
      const c = { id: uid(), src: `${r.id}-${j}`, ...slotDe(r, j), fait: null };
      // V1.10.14 : un repas ou le sommeil type passe devant tout le reste (il ne saute que sur un autre repas ou sommeil) ;
      // un autre créneau type se coupe autour des repas et du sommeil, et saute s'il tombe sur autre chose.
      const horsLot = slots.filter(autre);
      if (chevauche(horsLot.filter(x => GARDES.includes(x.cat) === GARDES.includes(c.cat)), c)) continue;
      const p = poser(slots, c);
      if (p.gene) continue;
      slots = p.slots;
    }
    sem.slots = rearranger(slots, data.plage || [6, 25]);
  }
}
// Un créneau en morceaux (un événement du samedi au dimanche, des cours coupés par le déjeuner) se refait d'un seul tenant
// autour des repas et du sommeil tels qu'ils sont maintenant : du début du premier morceau à la fin du dernier.
// Le trou laissé par un repas déplacé se rebouche, le nouveau repas trouve sa place. S'il gêne autre chose, il reste tel quel.
export function rearranger(slots, plage) {
  const groupes = [...new Set(slots.filter(x => x.groupe && !GARDES.includes(x.cat)).map(x => x.groupe))];
  for (const g of groupes) {
    const ms = slots.filter(x => x.groupe === g).sort((a, b) => a.j - b.j || a.s - b.s);
    if (ms.some(x => x.fait)) continue;   // ce qui est déjà validé ne bouge pas
    const base = slots.filter(x => x.groupe !== g), premier = ms[0], dernier = ms.at(-1);
    const { morceaux, gene } = morceauxMultiJours(base, { ...premier, e: dernier.e, id: premier.id }, dernier.j, plage);
    if (gene || !morceaux.length) continue;
    slots = [...base, ...morceaux.map((m, i) => ({ ...morceau({ ...premier, groupe: g }, m, i, morceaux.length), groupe: g }))].sort((a, b) => a.j - b.j || a.s - b.s);
  }
  return slots;
}
// Des créneaux de semaine regroupés en créneaux types : même titre, catégorie, heures et salle = un créneau type et ses jours.
export function recurrentsDepuis(slots, exemple = false) {
  const groupes = new Map(), correspondance = {};
  for (const x of slots) {
    const k = [x.titre, x.cat, x.s, x.e, x.salle || '', x.affaires || '', !!x.club].join('|');
    if (!groupes.has(k)) groupes.set(k, { id: uid(), titre: x.titre, cat: x.cat, s: x.s, e: x.e, jours: [], salle: x.salle || '', affaires: x.affaires || '', ...(x.club ? { club: true } : {}), ...(exemple ? { exemple: true } : {}) });
    const r = groupes.get(k);
    if (!r.jours.includes(x.j)) r.jours.push(x.j);
    correspondance[x.id] = `${r.id}-${x.j}`;
  }
  return { recurrents: [...groupes.values()], correspondance };
}
// Construire son app par catégories : chaque catégorie réglée donne ses créneaux types (origine = la catégorie).
// r = { sommeil: { coucher, lever, leverWe }, repas: { petitDej, dej: [s, e], diner: [s, e] }, cours: { jours, debut, fin, trajet },
//       job: { jours, debut, fin }, sport: { nom, jours, heure, duree } } ; une rubrique absente n'est pas réglée.
const TOUS = [0, 1, 2, 3, 4, 5, 6], SEMAINE = [0, 1, 2, 3, 4], WEEKEND = [5, 6];
// V1.10.4 : chaque rubrique peut aussi donner ses horaires jour par jour (parJour : 7 cases, null = pas ce jour-là) ;
// les jours aux mêmes horaires forment un seul créneau type.
const parJourDe = (jours = [], v) => TOUS.map(j => jours.includes(j) ? v : null);
function grouper(parJour, cle) {
  const g = new Map();
  parJour.forEach((v, j) => { if (!v) return; const k = cle(v); if (k === null) return; if (!g.has(k)) g.set(k, { v, jours: [] }); g.get(k).jours.push(j); });
  return [...g.values()];
}
export function creneauxDeBase(r, catJob = 'job') {
  const out = [], aj = (origine, cat, titre, s, e, jours, plus = {}) => { if (e > s && jours.length) out.push({ id: uid(), titre, cat, s, e, jours: [...jours], salle: '', affaires: '', origine, ...plus }); };
  if (r.sommeil) {
    const { coucher, lever, leverWe = lever } = r.sommeil;
    const pj = r.sommeil.parJour || TOUS.map(j => ({ coucher, lever: WEEKEND.includes(j) ? leverWe : lever }));
    for (const { v, jours } of grouper(pj, v => v.lever > 6 ? v.lever : null)) aj('sommeil', 'sommeil', 'Sommeil', 6, v.lever, jours);
    for (const { v, jours } of grouper(pj, v => v.coucher < 25 ? v.coucher : null)) aj('sommeil', 'sommeil', 'Sommeil', v.coucher, 25, jours);
  }
  if (r.cours) {
    const t = (r.cours.trajet || 0) / 60;
    for (const { v, jours } of grouper(r.cours.parJour || parJourDe(r.cours.jours, r.cours), v => `${v.debut}-${v.fin}`)) {
      if (t) { aj('cours', 'cours', 'Trajet', v.debut - t, v.debut, jours); aj('cours', 'cours', 'Trajet', v.fin, v.fin + t, jours); }
      aj('cours', 'cours', 'Cours', v.debut, v.fin, jours);
    }
  }
  if (r.job) for (const { v, jours } of grouper(r.job.parJour || parJourDe(r.job.jours, r.job), v => `${v.debut}-${v.fin}`)) aj('job', catJob, 'Travail', v.debut, v.fin, jours);
  if (r.sport) for (const { v, jours } of grouper(r.sport.parJour || parJourDe(r.sport.jours, r.sport), v => v.heure)) aj('sport', 'sport', `Entraînement · ${r.sport.nom || 'sport'}`, v.heure, v.heure + r.sport.duree, jours, { club: true });
  if (r.repas) {
    const { petitDej, dej, diner } = r.repas;
    if (petitDej != null) aj('repas', 'repas', 'Petit-déjeuner', petitDej, petitDej + .5, TOUS);
    if (dej) aj('repas', 'repas', 'Déjeuner', dej[0], dej[1], TOUS);
    if (diner) aj('repas', 'repas', 'Dîner', diner[0], diner[1], TOUS);
  }
  return out;
}
// Remplace les créneaux types des catégories réglées (et ceux de la semaine d'exemple), puis met les semaines à jour.
export function appliquerBase(data, nouveaux, origines, maintenant = new Date()) {
  const partent = data.recurrents.filter(r => r.exemple || origines.includes(r.origine)).map(r => r.id);
  data.recurrents = [...data.recurrents.filter(r => !partent.includes(r.id)), ...nouveaux];
  regenerer(data);
  propager(data, [...partent, ...nouveaux.map(r => r.id)], maintenant);
}

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
// ---------- Import contrôlé (V1.4) ----------
// Un fichier importé est reconstruit champ par champ : bon type ou rien, champs inconnus ignorés,
// identifiants et dates au format attendu (ils finissent dans des attributs HTML), textes bornés.
export const TAILLE_MAX = 5e6;
const ID = v => typeof v === 'string' && /^[\w-]{1,40}$/.test(v) ? v : undefined;
const DATE = v => typeof v === 'string' && /^\d{4}(-\d{2}){0,2}(-\d{4})?$/.test(v) ? v : undefined;
const TXT = v => typeof v === 'string' ? v.slice(0, 5000) : undefined;
const NUM = v => typeof v === 'number' && Number.isFinite(v) ? v : undefined;
const BOOL = v => typeof v === 'boolean' ? v : undefined;
const ENTRE = (a, b) => v => NUM(v) !== undefined && v >= a && v <= b ? v : undefined;
const UN_DE = (...ok) => v => ok.includes(v) ? v : undefined;
const NUM_OU_VIDE = v => v === '' ? '' : NUM(v);
const HEURE_OU_RIEN = v => v === null ? null : ENTRE(0, 26)(v);
const SLOT = { id: ID, groupe: ID, j: ENTRE(0, 6), s: ENTRE(0, 26), e: ENTRE(0, 26), cat: ID, titre: TXT, salle: TXT, affaires: TXT, notes: TXT,
  fait: BOOL, src: ID, tache: ID, seance: ID, club: BOOL, collegue: TXT };
const SCHEMA = {
  version: UN_DE(1), debut: DATE, plage: [ENTRE(0, 26)], typeDefaut: ID,
  recurrents: [{ id: ID, titre: TXT, cat: ID, s: ENTRE(0, 26), e: ENTRE(0, 26), jours: [ENTRE(0, 6)], salle: TXT, affaires: TXT, club: BOOL, origine: ID, exemple: BOOL }], dernierExport: TXT, repos: ENTRE(5, 600), club: TXT,
  bonusXp: ENTRE(0, 1e7), son: BOOL, theme: ID, niveauVu: ENTRE(1, 1000), couleurs: { fond: TXT, accent: TXT }, tutoVu: BOOL, cgu: ENTRE(0, 100), taux: ENTRE(0, 1000),
  cats: [{ id: ID, nom: TXT, couleur: TXT }],
  types: [{ id: ID, nom: TXT, exemple: BOOL, slots: [SLOT] }],
  semaines: { '*': { type: ID, slots: [SLOT] } },
  notes: [{ id: ID, titre: TXT, texte: TXT, couleur: TXT, epingle: BOOL, tags: [TXT], lien: TXT, maj: NUM }],
  listes: [{ id: ID, nom: TXT, tags: [TXT], items: [{ id: ID, txt: TXT, fait: BOOL }] }],
  objectifs: [{ id: ID, txt: TXT, horizon: UN_DE('semaine', 'mois', 'annee'), periode: DATE, fait: BOOL, parent: ID }],
  taches: [{ id: ID, titre: TXT, echeance: DATE, heure: ENTRE(0, 26), priorite: UN_DE(1, 2, 3), fac: BOOL, travail: BOOL, recurrence: ENTRE(0, 6), rep: [{ j: ENTRE(0, 6), h: HEURE_OU_RIEN }], projet: ID,
    sous: [{ txt: TXT, fait: BOOL }], fait: BOOL, faitLe: DATE, faits: [DATE] }],
  projets: [{ id: ID, nom: TXT, type: UN_DE('projet', 'divertissement'), statut: UN_DE('idee', 'en-cours', 'pause', 'termine'), etape: TXT, notes: TXT }],
  exos: [{ id: ID, nom: TXT, type: UN_DE('reps', 'duree', 'distance', 'charge'), notes: TXT, sport: TXT }],
  seances: [{ id: ID, nom: TXT, sport: TXT, exos: [{ exo: ID, series: ENTRE(1, 50), cible: NUM_OU_VIDE }] }],
  journal: [{ id: ID, date: DATE, seance: ID, nom: TXT, slot: ID, ressenti: ENTRE(1, 5), notes: TXT,
    series: [{ exo: ID, sets: [{ reps: NUM, sec: NUM, km: NUM, kg: NUM }] }] }],
  habitudes: [{ id: ID, nom: TXT, freq: v => v === 'jour' ? v : ENTRE(1, 6)(v), faits: [DATE], horaires: [{ j: ENTRE(0, 6), h: HEURE_OU_RIEN }], heure: ENTRE(0, 26), duree: ENTRE(.25, 4), jours: [ENTRE(0, 6)] }],
  tirages: [TXT], collection: [{ id: ID, date: DATE, raison: TXT, sport: TXT }],
  bilans: { '*': { date: DATE, ailleurs: ENTRE(0, 7), ailleursNote: TXT, comptent: ENTRE(0, 7), validees: TXT, usage: { '*': NUM } } },
  usage: { '*': { '*': NUM } }, modules: { '*': BOOL },
  profil: { prenom: TXT, etudes: BOOL, travail: BOOL, sports: [TXT] },
  competitions: [{ id: ID, sport: TXT, nom: TXT, date: DATE, lieu: TXT, categorie: TXT, resultat: TXT }],
  compagnon: { id: ID, stade: ENTRE(0, 4) },
};
export function nettoyer(v, sch) {
  if (typeof sch === 'function') return sch(v);
  if (Array.isArray(sch)) return Array.isArray(v) ? v.slice(0, 20000).map(x => nettoyer(x, sch[0])).filter(x => x !== undefined) : undefined;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const o = {};
  if (sch['*']) {
    for (const [k, x] of Object.entries(v).slice(0, 5000)) if (/^[\w-]{1,40}$/.test(k)) { const y = nettoyer(x, sch['*']); if (y !== undefined) o[k] = y; }
    return o;
  }
  for (const [k, s] of Object.entries(sch)) { const y = nettoyer(v[k], s); if (y !== undefined) o[k] = y; }
  return o;
}
// Une sauvegarde importée : vérifiée, nettoyée, puis complétée.
export function validerImport(o) {
  valider(o);
  return migrer(nettoyer(o, SCHEMA));
}

// ---------- Profil de départ (V1.4) ----------
// Format d'un profil, à produire tel quel (par exemple avec Claude dans le chat) :
// {
//   "format": "orga-profil", "version": 1,
//   "prenom": "Léa", "etudes": true, "travail": false, "sports": ["Basket"], "taux": 11.88,
//   "categories": [{ "nom": "Travail", "couleur": "#8C6A4F" }],
//   "semaineType": { "nom": "Semaine de cours", "creneaux": [
//     { "jour": 0, "debut": 8.5, "fin": 10.5, "categorie": "Transport et cours", "titre": "Cours", "salle": "" } ] },
//   "taches": [{ "titre": "Ménage", "jour": 3 }],
//   "listes": ["Courses", "À lire"],
//   "habitudes": [{ "nom": "Lire", "frequence": "jour" }],
//   "objectifs": [{ "texte": "Valider le semestre", "horizon": "annee" }],
//   "exercices": [{ "nom": "Gainage", "type": "duree" }],
//   "seances": [{ "nom": "Renfo", "exercices": [{ "nom": "Gainage", "series": 3, "cible": 45 }] }]
// }
// jour : 0 = lundi … 6 = dimanche ; heures en décimales (8.5 = 8 h 30, 25 = 1 h du matin) ;
// categorie : le nom d'une catégorie existante ou de "categories" ; type : reps, duree, distance ou charge ;
// frequence : "jour" ou 1 à 6 (fois par semaine) ; horizon : semaine, mois ou annee. Tout est facultatif.
const PROFIL = {
  prenom: v => TXT(v)?.slice(0, 40), etudes: BOOL, travail: BOOL, sports: [v => TXT(v)?.slice(0, 40)], taux: ENTRE(0, 1000),
  categories: [{ nom: v => TXT(v)?.slice(0, 40), couleur: v => /^#[0-9a-f]{6}$/i.test(v) ? v : undefined }],
  semaineType: { nom: v => TXT(v)?.slice(0, 60), creneaux: [{ jour: ENTRE(0, 6), debut: ENTRE(0, 25.5), fin: ENTRE(0.5, 26), categorie: TXT, titre: v => TXT(v)?.slice(0, 80), salle: v => TXT(v)?.slice(0, 80) }] },
  taches: [{ titre: v => TXT(v)?.slice(0, 120), jour: ENTRE(0, 6) }],
  listes: [v => TXT(v)?.slice(0, 60)],
  habitudes: [{ nom: v => TXT(v)?.slice(0, 60), frequence: v => v === 'jour' ? v : ENTRE(1, 6)(v) }],
  objectifs: [{ texte: v => TXT(v)?.slice(0, 200), horizon: UN_DE('semaine', 'mois', 'annee') }],
  exercices: [{ nom: v => TXT(v)?.slice(0, 80), type: UN_DE('reps', 'duree', 'distance', 'charge') }],
  seances: [{ nom: v => TXT(v)?.slice(0, 80), exercices: [{ nom: v => TXT(v)?.slice(0, 80), series: ENTRE(1, 20), cible: NUM }] }],
};
export function lireProfil(o) {
  if (!o || o.format !== 'orga-profil' || o.version !== 1) throw new Error('Ce fichier n’est pas un profil de l’app.');
  const p = nettoyer(o, PROFIL);
  const demi = x => Math.round(x * 12) / 12; // à 5 minutes près
  if (p.semaineType) p.semaineType.creneaux = (p.semaineType.creneaux || []).filter(c => c.jour !== undefined && c.debut !== undefined && c.fin !== undefined)
    .map(c => ({ ...c, debut: demi(c.debut), fin: demi(c.fin) })).filter(c => c.fin > c.debut);
  return p;
}

const PALETTE = ['#8C6A4F', '#3C8CE7', '#2E9E6A', '#D9A520', '#A35BD6', '#E0703C'];
// Ajoute un profil aux données sans rien effacer ; renvoie la liste de ce qui a été ajouté.
export function appliquerProfil(data, p, auj = new Date()) {
  const fait = [], meme = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  if (p.prenom || p.etudes !== undefined || p.travail !== undefined || p.sports) {
    const pr = data.profil ||= {};
    if (p.prenom) pr.prenom = p.prenom;
    if (p.etudes !== undefined) pr.etudes = p.etudes;
    if (p.travail !== undefined) { pr.travail = p.travail; data.modules.travail = p.travail; }
    if (p.sports?.length) pr.sports = [...new Set([...(pr.sports || []), ...p.sports])];
  }
  if (p.taux !== undefined) data.taux = p.taux;
  const catPour = nom => {
    let c = data.cats.find(x => meme(x.nom, nom)) || data.cats.find(x => meme(x.id, nom));
    if (!c && nom) { c = { id: uid(), nom: nom.slice(0, 40), couleur: PALETTE[data.cats.length % PALETTE.length] }; data.cats.push(c); fait.push(`Catégorie « ${c.nom} »`); }
    return c;
  };
  for (const c of p.categories || []) if (c.nom && !data.cats.some(x => meme(x.nom, c.nom))) {
    data.cats.push({ id: uid(), nom: c.nom, couleur: c.couleur || PALETTE[data.cats.length % PALETTE.length] });
    fait.push(`Catégorie « ${c.nom} »`);
  }
  const creneaux = p.semaineType?.creneaux || [];
  if (creneaux.length) {
    let nom = p.semaineType.nom || 'Ma semaine', n = 2;
    while (data.types.some(t => meme(t.nom, nom))) nom = `${p.semaineType.nom || 'Ma semaine'} (${n++})`;
    let slots = [];
    for (const c of creneaux) {
      const k = catPour(c.categorie || 'Transport et cours') || data.cats[0];
      slots = placer(slots, { id: uid(), j: c.jour, s: c.debut, e: c.fin, cat: k.id, titre: c.titre || k.nom, salle: c.salle || '', affaires: '', notes: '' });
    }
    const t = { id: uid(), nom, slots };
    data.types.push(t);
    if (!data.typeDefaut || data.types.length === 1) data.typeDefaut = t.id;
    fait.push(`Semaine type « ${nom} » : ${slots.length} créneaux`);
    // Le profil remplace la semaine d'exemple : elle disparaît, et les semaines où rien n'a été validé repartent du profil.
    const exemples = data.types.filter(x => x.exemple).map(x => x.id);
    if (exemples.length) {
      data.types = data.types.filter(x => !x.exemple);
      for (const [cle, s] of Object.entries(data.semaines)) if (exemples.includes(s.type) && !s.slots.some(x => x.fait)) delete data.semaines[cle];
      if (!data.types.some(x => x.id === data.typeDefaut)) data.typeDefaut = t.id;
      fait.push('Semaine d’exemple retirée');
    }
  }
  for (const t of p.taches || []) if (t.titre && !data.taches.some(x => !x.fait && meme(x.titre, t.titre))) {
    let d = new Date(auj.getFullYear(), auj.getMonth(), auj.getDate());
    const rec = t.jour ?? null;
    if (rec !== null) while (jourSemaine(d) !== rec) d = ajouterJours(d, 1);
    data.taches.push({ id: uid(), titre: t.titre, echeance: rec !== null ? isoJour(d) : null, priorite: 2, fac: false, rep: rec !== null ? [{ j: rec, h: null }] : [], projet: null, sous: [], fait: false });
    fait.push(`Tâche « ${t.titre} »${rec !== null ? ' chaque semaine' : ''}`);
  }
  for (const nom of p.listes || []) if (nom && !data.listes.some(l => meme(l.nom, nom))) { data.listes.push({ id: uid(), nom, tags: [], items: [] }); fait.push(`Liste « ${nom} »`); }
  for (const h of p.habitudes || []) if (h.nom && !data.habitudes.some(x => meme(x.nom, h.nom))) {
    data.habitudes.push({ id: uid(), nom: h.nom, freq: h.frequence ?? 'jour', faits: [] });
    fait.push(`Habitude « ${h.nom} »`);
  }
  for (const o of p.objectifs || []) if (o.texte) {
    const horizon = o.horizon || 'semaine';
    data.objectifs.push({ id: uid(), txt: o.texte, horizon, periode: periode(horizon, auj), fait: false, parent: null });
    fait.push(`Objectif « ${o.texte} »`);
  }
  const exoPour = (nom, type = 'reps') => {
    let e = data.exos.find(x => meme(x.nom, nom));
    if (!e) { e = { id: uid(), nom, type, notes: '' }; data.exos.push(e); fait.push(`Exercice « ${nom} »`); }
    return e;
  };
  for (const e of p.exercices || []) if (e.nom) exoPour(e.nom, e.type);
  for (const s of p.seances || []) if (s.nom && !data.seances.some(x => meme(x.nom, s.nom))) {
    data.seances.push({ id: uid(), nom: s.nom, exos: (s.exercices || []).filter(x => x.nom).map(x => ({ exo: exoPour(x.nom).id, series: x.series || 3, cible: x.cible ?? '' })) });
    fait.push(`Séance « ${s.nom} »`);
  }
  if (p.sports?.length && !data.club) data.club = p.sports[0];
  return fait;
}

// Les réponses de l'assistant (ou du questionnaire en ligne) deviennent un profil.
export function construireProfil(r) {
  const creneaux = [], ajout = (jour, debut, fin, categorie, titre) => { if (fin > debut) creneaux.push({ jour, debut, fin, categorie, titre }); };
  const jours = [0, 1, 2, 3, 4, 5, 6];
  for (const j of jours) {
    if (r.lever > 6) ajout(j, 6, r.lever, 'Sommeil', 'Sommeil');
    if (r.etudes && r.coursJours?.includes(j)) ajout(j, r.coursDebut, r.coursFin, 'Transport et cours', 'Cours');
    if (r.travail && r.travailJours?.includes(j)) ajout(j, r.travailDebut, r.travailFin, 'Travail', 'Travail');
    if (r.sport && r.clubJours?.includes(j)) ajout(j, r.clubDebut, r.clubDebut + r.clubDuree, 'Sport', `Entraînement · ${r.sport}`);
    if (r.repas) { ajout(j, r.lever, r.lever + .5, 'Repas', 'Petit-déjeuner'); ajout(j, 12, 13, 'Repas', 'Déjeuner'); ajout(j, 19.5, 20.5, 'Repas', 'Dîner'); }
    ajout(j, r.coucher, 25, 'Sommeil', 'Sommeil');
  }
  const p = { format: 'orga-profil', version: 1, prenom: r.prenom || undefined, etudes: !!r.etudes, travail: !!r.travail,
    sports: r.sport ? [r.sport] : [], semaineType: { nom: r.etudes ? 'Semaine de cours' : 'Ma semaine', creneaux },
    taches: r.menage || [], listes: r.listes || [], habitudes: (r.habitudes || []).map(nom => ({ nom, frequence: 'jour' })) };
  if (r.travail) { p.categories = [{ nom: 'Travail', couleur: '#8C6A4F' }]; if (r.taux) p.taux = r.taux; }
  const conseils = conseilsPour(r.sport);
  if (conseils) {
    p.exercices = conseils.map(([nom, type]) => ({ nom, type }));
    p.seances = [{ nom: `Renfo ${r.sport.toLowerCase()}`, exercices: conseils.map(([nom, , cible]) => ({ nom, series: 3, cible })) }];
  }
  return p;
}

// Les sauvegardes d'avant la V1.2 n'ont pas encore ces rubriques.
export function migrer(o) {
  for (const k of ['taches', 'projets', 'exos', 'seances', 'journal', 'habitudes']) if (!Array.isArray(o[k])) o[k] = [];
  if (typeof o.repos !== 'number') o.repos = 90;
  if (typeof o.club !== 'string') o.club = '';
  for (const k of ['tirages', 'collection']) if (!Array.isArray(o[k])) o[k] = [];
  if (!o.bilans || typeof o.bilans !== 'object' || Array.isArray(o.bilans)) o.bilans = {};
  if (typeof o.bonusXp !== 'number') o.bonusXp = 0;
  if (typeof o.son !== 'boolean') o.son = true;
  if (typeof o.theme !== 'string') o.theme = 'classique';
  // V1.3.1 : usage du jour (ce qui a servi), modules masqués, bilans avec « suivi ailleurs ».
  for (const k of ['usage', 'modules']) if (!o[k] || typeof o[k] !== 'object' || Array.isArray(o[k])) o[k] = {};
  for (const [cle, b] of Object.entries(o.bilans)) if (typeof b === 'string') o.bilans[cle] = { date: b };
  // V1.4 : profil sur le téléphone ; V1.5 : compétitions.
  if (!o.profil || typeof o.profil !== 'object' || Array.isArray(o.profil)) o.profil = {};
  if (!Array.isArray(o.competitions)) o.competitions = [];
  // Rappels : réglages propres à ce téléphone (jamais importés d'une sauvegarde : l'abonnement est lié à l'appareil).
  if (!o.notifs || typeof o.notifs !== 'object') o.notifs = { ...REGLAGES_RAPPELS };
  if (o.club && !(o.profil.sports || []).length) o.profil.sports = [o.club];
  // V1.10 : une tâche se répète sur plusieurs jours, chacun avec son heure ; une habitude aussi.
  for (const t of o.taches) if (!Array.isArray(t.rep)) { t.rep = repDe(t); delete t.recurrence; }
  for (const h of o.habitudes) if (!Array.isArray(h.horaires)) { h.horaires = horairesDe(h); delete h.heure; delete h.jours; }
  // V1.10 : les semaines types deviennent des créneaux types (sommeil toujours de… à…, repas, cours…).
  if (!Array.isArray(o.recurrents)) {
    o.recurrents = [];
    const t = Array.isArray(o.types) && (o.types.find(x => x.id === o.typeDefaut) || o.types[0]);
    if (t) {
      const { recurrents, correspondance } = recurrentsDepuis(t.slots || [], !!t.exemple);
      o.recurrents = recurrents;
      for (const sem of Object.values(o.semaines || {})) for (const x of sem.slots || []) if (x.src && correspondance[x.src]) x.src = correspondance[x.src];
      regenerer(o);
    }
  }
  // V1.10.15 : plus de réglage Modules ; ce qui avait été masqué revient, sauf le sport et le travail, qui suivent le profil.
  if (o.modules && typeof o.modules === 'object') o.modules = Object.fromEntries(Object.entries(o.modules).filter(([k]) => k === 'sport' || k === 'travail'));
  // V1.10.10 : plus de catégorie Détente (ses créneaux passent en Loisirs) ; « Travail perso » s'appelle « Révisions ».
  if (Array.isArray(o.cats) && o.cats.some(c => c.id === 'detente')) {
    o.cats = o.cats.filter(c => c.id !== 'detente');
    const vers = o.cats.some(c => c.id === 'loisirs') ? 'loisirs' : o.cats[0]?.id;
    const tous = [...Object.values(o.semaines || {}).flatMap(x => x.slots || []), ...(o.recurrents || []), ...(o.types || []).flatMap(t => t.slots || [])];
    for (const s of tous) if (s.cat === 'detente') s.cat = vers;
  }
  const revisions = (o.cats || []).find(c => c.id === 'travail' && c.nom === 'Travail perso');
  if (revisions) revisions.nom = 'Révisions';
  return o;
}

// ---------- Ce qui a servi (V1.3.1) ----------
// data.usage['2026-10-26'] = { 'creneau-ajout': 2, notes: 1, … } : ce qui a été fait ce jour-là.
export function noter(data, jour, cle) {
  const u = data.usage[jour] ||= {};
  u[cle] = (u[cle] || 0) + 1;
}
// Une journée ne compte dans l'essai que si l'emploi du temps a servi pendant la journée :
// un créneau ajouté, déplacé ou décoché, ou validé par son bouton peu après sa fin.
export const ACTIONS_JOURNEE = ['creneau-ajout', 'creneau-deplace', 'creneau-decoche', 'creneau-valide'];
export const utiliseEnJournee = (data, jour) => ACTIONS_JOURNEE.some(k => data.usage[jour]?.[k] > 0);
// Validé « dans la journée » : dans les 2 h après la fin du créneau, et au plus tard à minuit.
export const delaiValidation = e => Math.min(e + 2, 24);
export function usageSemaine(data, cle) {
  const t = {};
  for (let j = 0; j < 7; j++) for (const [k, n] of Object.entries(data.usage[isoJour(ajouterJours(deIso(cle), j))] || {})) t[k] = (t[k] || 0) + n;
  return t;
}
export const joursQuiComptent = (data, cle, valides) =>
  [0, 1, 2, 3, 4, 5, 6].map(j => isoJour(ajouterJours(deIso(cle), j))).filter(d => valides.has(d) && utiliseEnJournee(data, d));

// ---------- Tâches ----------

export const joursAvant = (iso, auj) => Math.round((deIso(iso) - new Date(auj.getFullYear(), auj.getMonth(), auj.getDate())) / 864e5);

// Cocher une tâche récurrente la repousse à sa prochaine date au lieu de la terminer.
// Chaque fois qu'elle est faite, la date s'ajoute à t.faits : c'est ce qui compte pour l'XP.
// Les jours (et heures) où une tâche revient ; les tâches d'avant la 1.10 n'avaient qu'un jour, sans heure.
export const repDe = t => Array.isArray(t.rep) ? t.rep : Number.isInteger(t.recurrence) ? [{ j: t.recurrence, h: null }] : [];
// Les jours et heures d'une habitude ; celles d'avant la 1.10 avaient une seule heure et des jours (aucun = tous).
export const horairesDe = h => Array.isArray(h.horaires) ? h.horaires
  : typeof h.heure === 'number' ? (h.jours?.length ? h.jours : [0, 1, 2, 3, 4, 5, 6]).map(j => ({ j, h: h.heure })) : [];
const JOURS_COURTS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
// « du lundi au vendredi », « le week-end », « tous les jours », ou « lun, mer, ven ».
export function joursTexte(jours) {
  const j = [...new Set(jours)].sort().join();
  return j === '0,1,2,3,4,5,6' ? 'tous les jours' : j === '0,1,2,3,4' ? 'du lundi au vendredi' : j === '5,6' ? 'le week-end' : [...new Set(jours)].sort().map(x => JOURS_COURTS[x]).join(', ');
}
export const trierHoraires = l => [...l].sort((a, b) => a.j - b.j || (a.h ?? -1) - (b.h ?? -1));
// « lun 10:00, jeu 18:00 », ou « chaque jour à 22:00 ».
// Regroupé par heure : « tous les jours à 09:00 · lun à 15:00 », « du lundi au vendredi ».
export function horairesTexte(l) {
  if (!l?.length) return '';
  const parHeure = new Map();
  for (const x of l) parHeure.set(x.h ?? null, [...(parHeure.get(x.h ?? null) || []), x.j]);
  return [...parHeure].sort((a, b) => (a[0] ?? -1) - (b[0] ?? -1)).map(([h, js]) => joursTexte(js) + (h != null ? ` à ${hhmm(h)}` : '')).join(' · ');
}
// La prochaine fois d'une répétition, après le moment (iso, h) ; « inclus » garde ce moment lui-même.
// Une heure absente vaut le début de la journée.
export function prochaineOccurrence(rep, apresIso, apresH, inclus = false) {
  if (!rep?.length) return null;
  const d0 = deIso(apresIso);
  for (let k = 0; k < 15; k++) {
    const d = ajouterJours(d0, k), iso = isoJour(d);
    for (const x of trierHoraires(rep).filter(x => x.j === jourSemaine(d))) {
      const h = x.h ?? -1;
      if (iso > apresIso || h > apresH || (inclus && h === apresH)) return { iso, h: x.h ?? null };
    }
  }
  return null;
}
// Cocher une tâche : finie, ou, si elle se répète, reportée à sa prochaine fois après celle-ci et après maintenant.
export function cocher(t, auj) {
  const faits = [...(t.faits || []), isoJour(auj)], rep = repDe(t);
  if (!rep.length) return { ...t, fait: true, faitLe: isoJour(auj), faits };
  const cur = [t.echeance || isoJour(auj), t.echeance ? t.heure ?? -1 : -1], now = [isoJour(auj), auj.getHours() + auj.getMinutes() / 60];
  const [iso, h] = cur[0] > now[0] || (cur[0] === now[0] && cur[1] >= now[1]) ? cur : now;
  const n = prochaineOccurrence(rep, iso, h);
  return { ...t, fait: false, faits, echeance: n.iso, heure: n.h, sous: (t.sous || []).map(s => ({ ...s, fait: false })) };
}

// À faire bientôt : en retard, aujourd'hui, ou dans les 7 jours ; puis par date et priorité.
export function aFaire(taches, auj, horizon = 7) {
  return taches.filter(t => !t.fait && t.echeance && joursAvant(t.echeance, auj) <= horizon)
    .sort((a, b) => a.echeance.localeCompare(b.echeance) || (a.heure ?? 99) - (b.heure ?? 99) || (a.priorite || 2) - (b.priorite || 2));
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

// Les habitudes posées sur le jour j (0 = lundi), une fois par heure prévue ce jour-là.
export const habitudesAHeure = (habitudes, j) => habitudes.flatMap(hb => horairesDe(hb).filter(x => x.j === j && typeof x.h === 'number').map(x => ({ ...hb, heure: x.h })));
export const faitsSemaine = (h, lundi) => {
  const de = isoJour(lundi), a = isoJour(ajouterJours(lundi, 6));
  return h.faits.filter(d => d >= de && d <= a).length;
};

// ---------- Motivation ----------
// Tout se recalcule à partir de ce qui a été fait : ouvrir l'app sans rien faire ne rapporte rien,
// et décocher retire ce que cocher avait donné.

// Sommeil, cours (trajets compris) et repas se valident tout seuls (Emma, 24/10) : seuls les autres créneaux se cochent.
export const AUTO = ['sommeil', 'cours', 'repas'];
export const auto = x => AUTO.includes(x.cat);
export const journeeValidee = slots => { const v = slots.filter(x => !auto(x)); return v.length > 0 && v.every(x => x.fait); };
// Une journée faite seulement de sommeil, cours et repas n'a rien à cocher : elle se valide toute seule une fois passée (Emma, 24/10).
export const rienACocher = slots => slots.length > 0 && slots.every(auto);
// Le premier jour d'usage (posé quand on construit son app ; sinon le premier jour où l'app a servi).
// Ce jour-là et avant, rien ne se fait tout seul : pas d'heures « réalisées » ni de journée validée d'office.
export const debutDe = data => data.debut || Object.keys(data.usage || {}).sort()[0] || null;
const apresDebut = (data, iso) => { const d = debutDe(data); return !!d && iso > d; };
// Un créneau automatique compte comme fait une fois terminé, à partir du lendemain du premier jour d'usage.
export function autoFait(data, iso, x, maintenant = new Date()) {
  if (!auto(x) || !apresDebut(data, iso)) return false;
  const { date, h } = momentLogique(maintenant), auj = isoJour(date);
  return iso < auj || (iso === auj && x.e <= h);
}
// Le bilan du soir : 15 min avant le dîner (le premier repas qui commence à 17 h ou après), sinon 20 h.
export const heureBilan = slots => { const d = slots.filter(x => x.cat === 'repas' && x.s >= 17).sort((a, b) => a.s - b.s)[0]; return d ? d.s - .25 : 20; };
export function joursValides(data, maintenant = new Date()) {
  const v = new Set(), auj = isoJour(momentLogique(maintenant).date);
  for (const [cle, s] of Object.entries(data.semaines)) {
    for (let j = 0; j < 7; j++) {
      const iso = isoJour(ajouterJours(deIso(cle), j)), du = s.slots.filter(x => x.j === j);
      if (journeeValidee(du) || (rienACocher(du) && iso < auj && apresDebut(data, iso))) v.add(iso);
    }
  }
  return v;
}
const joursValidesSemaine = (valides, cle) => [0, 1, 2, 3, 4, 5, 6].filter(j => valides.has(isoJour(ajouterJours(deIso(cle), j)))).length;

// Série de journées validées. Tous les 7 jours d'affilée, un joker (3 au plus) ; un jour manqué
// en consomme un au lieu de casser la série. Aujourd'hui ne casse rien tant qu'il n'est pas fini.
export function serie(valides, auj, debut) {
  let s = 0, jokers = 0, record = 0;
  const fin = isoJour(auj);
  for (let d = new Date(debut.getFullYear(), debut.getMonth(), debut.getDate()); isoJour(d) <= fin; d = ajouterJours(d, 1)) {
    const iso = isoJour(d);
    if (valides.has(iso)) { s++; if (s % 7 === 0) jokers = Math.min(3, jokers + 1); }
    else if (iso === fin) break;
    else if (s > 0 && jokers > 0) jokers--;
    else s = 0;
    record = Math.max(record, s);
  }
  return { serie: s, jokers, record };
}

export const seuil = n => 50 * n * (n - 1); // XP pour atteindre le niveau n : 0, 100, 300, 600…
export function niveau(xp) {
  let n = 1;
  while (xp >= seuil(n + 1)) n++;
  return { n, de: seuil(n), a: seuil(n + 1) };
}

export const XP = { creneau: 5, tache: 20, tacheImportante: 30, seance: 30, habitude: 5, objectif: { semaine: 25, mois: 60, annee: 150 }, projet: 100, jour: 15, bilan: 50 };
const completions = t => t.faits?.length || (t.fait ? 1 : 0);
const important = t => t.priorite === 1 || t.fac;

export function stats(data, auj) {
  const slots = Object.values(data.semaines).flatMap(s => s.slots);
  const valides = joursValides(data, auj);
  const cles = Object.keys(data.semaines).sort();
  const se = cles.length ? serie(valides, auj, deIso(cles[0])) : { serie: 0, jokers: 0, record: 0 };
  const club = slots.filter(x => x.club && x.fait).length;
  const projets = data.projets.filter(p => p.statut === 'termine').length;
  const sources = {
    creneaux: slots.filter(x => x.fait).length * XP.creneau,
    taches: data.taches.reduce((k, t) => k + completions(t) * (important(t) ? XP.tacheImportante : XP.tache), 0),
    sport: (data.journal.length + club) * XP.seance,
    habitudes: data.habitudes.reduce((k, h) => k + h.faits.length, 0) * XP.habitude,
    objectifs: data.objectifs.filter(o => o.fait).reduce((k, o) => k + XP.objectif[o.horizon], 0) + projets * XP.projet,
    bonus: valides.size * XP.jour + Object.keys(data.bilans).length * XP.bilan + data.bonusXp,
  };
  const total = Object.values(sources).reduce((a, b) => a + b, 0);
  return {
    sources, total, niveau: niveau(total), ...se, valides, joursValides: valides.size,
    semainesCompletes: cles.filter(c => joursValidesSemaine(valides, c) === 7).length,
    seances: data.journal.length + club, taches: data.taches.reduce((k, t) => k + completions(t), 0), projets,
    objSemaine: data.objectifs.filter(o => o.fait && o.horizon === 'semaine').length,
    habitudeMax: Math.max(0, ...data.habitudes.map(h => h.faits.length)), bilans: Object.keys(data.bilans).length,
    entrainements: club, competitions: (data.competitions || []).filter(c => c.resultat).length, records: recordsBattus(data),
  };
}

// Tirages gagnés et pas encore ouverts : un par niveau, par grosse tâche, par projet terminé,
// et par semaine réussie (au moins 5 journées validées).
export const SUCCES = [
  ['Première journée validée', 'joursValides', 1], ['7 jours d’affilée', 'record', 7], ['30 jours d’affilée', 'record', 30],
  ['Première semaine complète', 'semainesCompletes', 1], ['10 séances de sport', 'seances', 10], ['50 séances de sport', 'seances', 50],
  ['10 tâches faites', 'taches', 10], ['100 tâches faites', 'taches', 100],
  ['5 objectifs de semaine atteints', 'objSemaine', 5], ['Une habitude tenue 21 jours', 'habitudeMax', 21], ['4 bilans de la semaine', 'bilans', 4],
  ['10 entraînements du club', 'entrainements', 10], ['Première compétition', 'competitions', 1], ['Un record battu', 'records', 1],
];
export const succesObtenus = st => SUCCES.filter(([, k, c]) => st[k] >= c).map(([nom]) => nom);
export function droitsTirage(data, st) {
  const d = [];
  // V1.10.3 : une première créature tout de suite, pour avoir un compagnon dès le début ; puis un tirage par succès.
  if (!data.collection.length) d.push('bienvenue');
  succesObtenus(st).forEach(nom => d.push(`succes:${nom}`));
  for (let n = 2; n <= st.niveau.n; n++) d.push(`niveau:${n}`);
  data.taches.forEach(t => { if (important(t) && completions(t)) d.push(`tache:${t.id}`); });
  data.projets.forEach(p => { if (p.statut === 'termine') d.push(`projet:${p.id}`); });
  Object.keys(data.semaines).forEach(c => { if (joursValidesSemaine(st.valides, c) >= 5) d.push(`semaine:${c}`); });
  // V1.5 : un tirage aux couleurs du sport toutes les 5 séances ou entraînements, et par compétition notée.
  for (let n = 5; n <= st.seances; n += 5) d.push(`seances:${n}`);
  (data.competitions || []).forEach(c => { if (c.resultat) d.push(`competition:${c.id}`); });
  return d.filter(k => !data.tirages.includes(k));
}

// Créatures originales de la collection : [id, nom, couleur, forme 0 à 3, rareté].
export const CREATURES = [
  ['ronfleur', 'Ronfleur', '#FF9B3D', 0, 'commune'], ['gratte', 'Gratte-papier', '#35C6DF', 1, 'commune'],
  ['sprintou', 'Sprintou', '#B5DF2B', 2, 'commune'], ['grignote', 'Grignote', '#34BD67', 0, 'commune'],
  ['plumette', 'Plumette', '#6766F0', 3, 'commune'], ['flanou', 'Flânou', '#FFD447', 1, 'commune'],
  ['bricolo', 'Bricolo', '#FF8AC1', 2, 'commune'], ['caillou', 'Caillou', '#9AA1AE', 3, 'commune'],
  ['brindille', 'Brindille', '#7FA35B', 1, 'commune'], ['mirabelle', 'Mirabelle', '#F2B33D', 0, 'commune'],
  ['tourbillon', 'Tourbillon', '#3C8CE7', 2, 'rare'], ['pepite', 'Pépite', '#D9A520', 3, 'rare'],
  ['nuage', 'Nuage', '#A9C4E8', 1, 'rare'], ['cactou', 'Cactou', '#2E9E6A', 0, 'rare'],
  ['lumino', 'Lumino', '#FFE066', 2, 'legendaire'], ['zephyr', 'Zéphyr', '#8E7CF0', 3, 'legendaire'],
].map(([id, nom, couleur, forme, rarete]) => ({ id, nom, couleur, forme, rarete }));

// Légendaire 5 %, rare 25 %, commune 70 % ; une créature pas encore possédée si possible.
export function tirer(possedes, rand = Math.random) {
  const r = rand();
  const rarete = r < .05 ? 'legendaire' : r < .3 ? 'rare' : 'commune';
  const pool = CREATURES.filter(c => c.rarete === rarete);
  const neuves = pool.filter(c => !possedes.includes(c.id));
  const liste = neuves.length ? neuves : pool;
  return liste[Math.floor(rand() * liste.length)];
}

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
  // Jeu de jambes et gainage, sans charge imposée.
  'Sabre laser': [['Fentes avant', 'reps', 10], ['Fentes arrière', 'reps', 10], ['Gainage', 'duree', 45], ['Rotations du tronc', 'reps', 15], ['Squats', 'reps', 15], ['Équilibre sur une jambe', 'duree', 30]],
};

// Les sports proposés à la saisie (n'importe quel autre se tape à la main).
export const SPORTS = [...new Set(['Sabre laser', ...Object.keys(CONSEILS)])];

export const CATS_DEPART = [
  ['cours', 'Transport et cours', '#EC4A46'], ['sommeil', 'Sommeil', '#FF9B3D'],
  ['repas', 'Repas', '#34BD67'], ['travail', 'Révisions', '#35C6DF'], ['loisirs', 'Loisirs', '#6261EE'],
  ['menage', 'Ménage', '#FF8AC1'], ['sport', 'Sport', '#B5DF2B'],
].map(([id, nom, couleur]) => ({ id, nom, couleur }));

export const vide = () => migrer({
  version: 1,
  cats: CATS_DEPART.map(c => ({ ...c })),
  plage: [6, 25],
  types: [], typeDefaut: null, semaines: {},
  notes: [],
  listes: [{ id: uid(), nom: 'Courses', tags: [], items: [] }],   // les autres listes se créent avec le bouton +
  objectifs: [],
  dernierExport: null,
});

// Semaine d'exemple proposée au premier lancement : [début, fin, catégorie, titre, salle].
const matin = [[6, 7.5, 'sommeil', 'Sommeil'], [7.5, 8, 'repas', 'Petit-déjeuner']];
const soir = [[19, 20, 'repas', 'Dîner'], [20, 22, 'loisirs', 'Loisirs'], [22, 23, 'loisirs', 'Série'], [23, 25, 'sommeil', 'Sommeil']];
const EXEMPLE = [
  [...matin, [8, 8.5, 'cours', 'Trajet'], [8.5, 10.5, 'cours', 'Cours magistral', 'Amphi'], [10.5, 12.5, 'cours', 'TD', 'Salle A'], [12.5, 13.5, 'repas', 'Déjeuner'], [13.5, 15.5, 'cours', 'TP', 'Salle info'], [15.5, 16, 'cours', 'Trajet'], [16, 18, 'travail', 'Révisions'], [18, 19, 'sport', 'Course à pied'], ...soir],
  [...matin, [8, 8.5, 'cours', 'Trajet'], [8.5, 10.5, 'cours', 'Cours magistral', 'Amphi'], [10.5, 12.5, 'cours', 'Langue vivante', 'Salle B'], [12.5, 13.5, 'repas', 'Déjeuner'], [13.5, 15.5, 'cours', 'TD', 'Salle A'], [15.5, 16, 'cours', 'Trajet'], [16, 17.5, 'travail', 'TD'], [17.5, 19, 'loisirs', 'Lecture'], ...soir],
  [...matin, [8, 8.5, 'cours', 'Trajet'], [8.5, 10.5, 'cours', 'TP', 'Salle info'], [10.5, 12.5, 'travail', 'Révisions'], [12.5, 13.5, 'repas', 'Déjeuner'], [13.5, 15.5, 'cours', 'Cours magistral', 'Amphi'], [15.5, 16, 'cours', 'Trajet'], [16, 17, 'loisirs', 'Pause'], [17, 18.5, 'sport', 'Renfo'], [18.5, 19, 'menage', 'Rangement'], ...soir],
  [...matin, [8, 8.5, 'cours', 'Trajet'], [8.5, 10.5, 'cours', 'TD', 'Salle A'], [10.5, 12.5, 'cours', 'Projet de groupe', 'Salle C'], [12.5, 13.5, 'repas', 'Déjeuner'], [13.5, 15.5, 'cours', 'Cours magistral', 'Amphi'], [15.5, 16, 'cours', 'Trajet'], [16, 18, 'travail', 'Révisions'], [18, 19, 'menage', 'Ménage'], ...soir],
  [...matin, [8, 9.5, 'loisirs', 'Matinée calme'], [9.5, 10, 'cours', 'Trajet'], [10, 12, 'cours', 'Cours magistral', 'Amphi'], [12, 13, 'repas', 'Déjeuner'], [13, 14, 'cours', 'TD', 'Salle B'], [14, 14.5, 'cours', 'Trajet'], [14.5, 16, 'travail', 'Projet de groupe'], [16, 17, 'sport', 'Course à pied'], [17, 19, 'loisirs', 'Loisirs'], ...soir],
  [[6, 10, 'sommeil', 'Sommeil'], [10, 11, 'repas', 'Brunch'], [11, 12.5, 'menage', 'Courses et lessive'], [12.5, 13.5, 'repas', 'Déjeuner'], [13.5, 17, 'loisirs', 'Loisirs'], [17, 18, 'sport', 'Renfo'], [18, 19, 'loisirs', 'Pause'], ...soir],
  [[6, 10, 'sommeil', 'Sommeil'], [10, 11, 'repas', 'Brunch'], [11, 12.5, 'loisirs', 'Balade'], [12.5, 13.5, 'repas', 'Déjeuner'], [13.5, 16, 'travail', 'Révisions'], [16, 16.5, 'travail', 'Bilan de la semaine'], [16.5, 19, 'loisirs', 'Loisirs'], ...soir],
];
// La semaine d'exemple, en créneaux types marqués « exemple » : la construction par catégories les remplace.
export const recurrentsExemple = () => recurrentsDepuis(slotsExemple(), true).recurrents;
export const slotsExemple = () => EXEMPLE.flatMap((jour, j) => jour.map(([s, e, cat, titre, salle = '']) =>
  ({ id: uid(), j, s, e, cat, titre, salle, affaires: '', notes: '' })));

// ---------- Mon sport et mon travail (V1.5) ----------

// Exercices conseillés d'un sport écrit librement (« basket » trouve « Basket »).
export const conseilsPour = sport => CONSEILS[Object.keys(CONSEILS).find(k => k.toLowerCase() === String(sport || '').trim().toLowerCase())];

// Séances prêtes pour un sport : son renfo, du gainage et de la mobilité, une récupération.
export function seancesDeDepart(sport) {
  const c = conseilsPour(sport);
  const seances = [{ nom: 'Gainage et mobilité', exercices: [{ nom: 'Gainage', series: 3, cible: 45 }, { nom: 'Gainage latéral', series: 2, cible: 30 }, { nom: 'Pont fessier', series: 3, cible: 15 }, { nom: 'Mobilité des hanches', series: 1, cible: 120 }] },
    { nom: 'Récupération', exercices: [{ nom: 'Mobilité des hanches', series: 1, cible: 120 }, { nom: 'Étirements', series: 1, cible: 300 }] }];
  if (c) seances.unshift({ nom: `Renfo ${sport.toLowerCase()}`, exercices: c.map(([nom, , cible]) => ({ nom, series: 3, cible })) });
  const exercices = [...(c || []).map(([nom, type]) => ({ nom, type })), { nom: 'Gainage', type: 'duree' }, { nom: 'Gainage latéral', type: 'duree' },
    { nom: 'Pont fessier', type: 'reps' }, { nom: 'Mobilité des hanches', type: 'duree' }, { nom: 'Étirements', type: 'duree' }];
  return { exercices: exercices.filter((e, i) => exercices.findIndex(x => x.nom === e.nom) === i), seances };
}

// Préparation de compétition, par règles écrites à l'avance (repères d'organisation, pas un avis médical) :
// la veille, séance raccourcie de moitié et sans nouvel exercice ; le jour J, pas de renfo ; le lendemain, récupération ou repos.
export function regleCompetition(competitions, iso) {
  for (const [ecart, regle] of [[0, 'jour'], [1, 'veille'], [-1, 'lendemain']]) {
    const c = (competitions || []).find(x => x.date && isoJour(ajouterJours(deIso(iso), ecart)) === x.date);
    if (c) return { regle, competition: c };
  }
  return null;
}
export const seriesVeille = n => Math.max(1, Math.ceil(n / 2));

// Records battus : séances où un exercice dépasse tout ce qui avait été fait avant.
export function recordsBattus(data) {
  let n = 0;
  for (const e of data.exos) {
    let meilleur = 0;
    for (const p of progression(data.journal, e.id, e.type)) { if (meilleur && p.val > meilleur) n++; meilleur = Math.max(meilleur, p.val); }
  }
  return n;
}

// Heures prévues et réalisées, jour par jour, entre deux dates (incluses), sans dépasser aujourd'hui.
export function heuresPeriode(data, de, a, auj = new Date(), maintenant = new Date()) {
  const fin = [isoJour(a), isoJour(auj)].sort()[0], prevu = {}, fait = {};
  for (let d = new Date(de.getFullYear(), de.getMonth(), de.getDate()); isoJour(d) <= fin; d = ajouterJours(d, 1)) {
    const sem = data.semaines[isoJour(lundiDe(d))];
    for (const x of sem ? sem.slots.filter(y => y.j === jourSemaine(d)) : []) {
      prevu[x.cat] = (prevu[x.cat] || 0) + x.e - x.s;
      if (x.fait || autoFait(data, isoJour(d), x, maintenant)) fait[x.cat] = (fait[x.cat] || 0) + x.e - x.s;
    }
  }
  return { prevu, fait };
}

// ---------- Bonus avant l'essai (V1.7) ----------

// Compagnon : une créature choisie, qui grandit avec le nombre total de journées validées
// (stades à 1, 5, 10 et 20) et ne régresse jamais, même si la série casse.
export const SEUILS_COMPAGNON = [1, 5, 10, 20];
export const stadeCompagnon = nbJours => SEUILS_COMPAGNON.filter(s => nbJours >= s).length;
export const prochainSeuil = nbJours => SEUILS_COMPAGNON.find(s => nbJours < s) ?? null;
export function grandir(compagnon, nbJours) {
  return { ...compagnon, stade: Math.max(compagnon.stade || 0, stadeCompagnon(nbJours)) };
}

// ---------- Rappels (notifications) ----------
// Adresse du serveur des rappels et sa clé publique VAPID : vides tant que le serveur n'est pas en ligne.
export const SERVEUR_RAPPELS = 'https://orga-rappels.orgadevie.workers.dev';
export const VAPID_PUBLIQUE = 'BBdg9PHUm5_4LI9Vv8k4_zOLL8dEcvF3sfzBgkdqVoGQd2TXT4sz9F8rGsiA7TzcD5Et29wzK3UWe5AU8FejD7o';
// Faut-il réécrire les heures sur le serveur ? Non si les heures à venir sont celles déjà envoyées :
// le serveur retire lui-même les rappels passés (l'offre gratuite limite les écritures à 1 000 par jour).
export function rappelsChanges(dernier, heures, maintenantS) {
  const futur = l => l.filter(t => t > maintenantS).join(',');
  return futur(String(dernier || '').split(',').filter(Boolean).map(Number)) !== futur(heures);
}
// Empreinte courte d'un texte (FNV-1a, 32 bits) : pour ne pas renvoyer une copie identique.
export function empreinte(texte) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) { h ^= texte.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16);
}
export const REGLAGES_RAPPELS = { actif: false, delai: 15, creneaux: true, habitudes: true, taches: true, soir: true, bilan: true };
const CATS_RAPPEL = ['cours', 'sport', 'job'];

// Les rappels des 7 prochains jours, avec leur texte. Seules les heures (t, en secondes) partent vers
// le serveur ; les textes restent sur le téléphone, qui les affiche quand la notification arrive.
export function calculerRappels(data, maintenant, r = REGLAGES_RAPPELS) {
  const out = [], s = Math.floor(maintenant / 1000);
  const ajout = (t, titre, corps) => {
    if (t <= s) return;
    const meme = out.find(x => x.t === t);
    if (!meme) out.push({ t, titre, corps });
    else if (!meme.titre.includes(titre)) meme.titre += ` · ${titre}`;
  };
  const auj = new Date(maintenant);
  for (let i = 0; i < 7; i++) {
    const d = ajouterJours(new Date(auj.getFullYear(), auj.getMonth(), auj.getDate()), i);
    const cle = isoJour(lundiDe(d));
    const t = data.types.find(x => x.id === data.typeDefaut) || data.types[0];
    const slots = (data.semaines[cle]?.slots || t?.slots || []).filter(x => x.j === jourSemaine(d));
    // Heure locale du jour d, juste même les jours de changement d’heure (minuit + 17 h ne fait pas 17 h le 25/10).
    const a = h => Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, Math.round(h * 60)).getTime() / 1000);
    if (r.creneaux) for (const x of slots) if (CATS_RAPPEL.includes(x.cat) && x.titre !== 'Trajet') {
      ajout(a(x.s) - r.delai * 60, `Dans ${r.delai} min : ${x.titre}`, [hhmm(x.s), x.salle, x.affaires].filter(Boolean).join(' · '));
    }
    // Les habitudes à heure, à leur heure exacte, sauf si elles sont déjà cochées ce jour-là ; réglage absent = activé.
    if (r.habitudes !== false && data.modules?.habitudes !== false) for (const hb of habitudesAHeure(data.habitudes, jourSemaine(d))) {
      if (!hb.faits.includes(isoJour(d))) ajout(a(hb.heure), hb.nom, 'C’est l’heure de ton habitude.');
    }
    // Le bilan avant le dîner : pour aujourd'hui, ce qui est déjà validé et ce qui reste (écrit sur le téléphone, jamais envoyé).
    if (r.soir && slots.length) {
      const hb = heureBilan(slots), v = slots.filter(x => !auto(x) && x.e <= hb + .25);
      const ok = v.filter(x => x.fait).map(x => x.titre), reste = v.filter(x => !x.fait).map(x => x.titre);
      const resume = [ok.length && `Validé : ${ok.join(', ')}`, reste.length && `À valider : ${reste.join(', ')}`].filter(Boolean).join(' · ');
      ajout(a(hb), 'Bilan de ta journée', i === 0 && resume ? resume.slice(0, 180) : 'Avant de manger, valide ce que tu as fait aujourd’hui.');
    }
    if (r.bilan && jourSemaine(d) === 6) ajout(a(17), 'C’est l’heure du bilan', 'Objectifs, tâches à reporter, heures de la semaine.');
  }
  // Les tâches à heure : la prochaine fois, et pour une tâche qui se répète, les suivantes de la semaine.
  if (r.taches !== false && data.modules?.taches !== false) {
    const fin = isoJour(ajouterJours(auj, 6)), aIso = (iso, h) => { const d = deIso(iso); return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, Math.round(h * 60)).getTime() / 1000); };
    for (const t of data.taches) if (!t.fait && t.echeance && typeof t.heure === 'number') {
      let o = { iso: t.echeance, h: t.heure };
      for (let k = 0; o && o.iso <= fin && k < 30; k++) {
        if (typeof o.h === 'number') ajout(aIso(o.iso, o.h), t.titre, 'Tâche à faire');
        o = repDe(t).length ? prochaineOccurrence(repDe(t), o.iso, o.h ?? -1) : null;
      }
    }
  }
  return out.sort((x, y) => x.t - y.t).slice(0, 300);
}

// ---------- Compte et sauvegarde chiffrée (V1.9.8) ----------
// L'identifiant et le mot de passe, choisis par l'utilisatrice, donnent sur le téléphone (PBKDF2, 600 000 tours)
// deux choses : l'identifiant de la copie sur le serveur et la clé AES-GCM qui la chiffre. Le mot de passe ne
// quitte jamais le téléphone et n'y est pas gardé ; seule la clé l'est, pour les copies automatiques.
export const MDP_MIN = 10;
// Trop simple : moins de 5 caractères différents (« aaaaaaaaaa », « 1212121212 »), ou l'identifiant dedans.
export const mdpTropSimple = (mdp, ident) => { const i = normIdent(ident); return new Set(String(mdp)).size < 5 || (i.length >= 3 && String(mdp).toLowerCase().includes(i)); };
export const normIdent = s => String(s || '').trim().toLowerCase().normalize('NFC');
export const identValide = s => /^[\p{L}\p{N}._-]{3,40}$/u.test(normIdent(s));
export const sauvegardePossible = () => typeof CompressionStream === 'function' && !!globalThis.crypto?.subtle;
const enc = new TextEncoder();
const versB64 = u => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const deB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const gzip = async (u, compresser) => new Uint8Array(await new Response(new Blob([u]).stream().pipeThrough(compresser ? new CompressionStream('gzip') : new DecompressionStream('gzip'))).arrayBuffer());
export async function clesDuCompte(ident, mdp) {
  const base = await crypto.subtle.importKey('raw', enc.encode(String(mdp).normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('orga-compte-v1:' + normIdent(ident)), iterations: 600_000 }, base, 512));
  return { id: versB64(bits.slice(0, 32)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), cle: versB64(bits.slice(32)) };
}
const cleAes = cle => crypto.subtle.importKey('raw', deB64(cle), 'AES-GCM', false, ['encrypt', 'decrypt']);
export async function chiffrerCopie(data, compte) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const c = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cleAes(compte.cle), await gzip(enc.encode(JSON.stringify(data)), true)));
  return `${compte.id}\n${versB64(iv)}\n${versB64(c)}`;
}
export async function dechiffrerCopie(texte, compte) {
  const [iv, d] = texte.split('\n');
  const clair = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(iv) }, await cleAes(compte.cle), deB64(d)));
  return JSON.parse(new TextDecoder().decode(await gzip(clair, false)));
}
