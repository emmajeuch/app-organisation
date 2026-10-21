// L'app : affichage, gestes et enregistrement. La logique pure est dans logique.js.
import * as L from './logique.js';

const KEY = 'orga-v1';
const ROW = 14; // hauteur d'une demi-heure en px, comme --row dans index.html
const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const svg = (d, w = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const I = {
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 2.6),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>', 2.2),
  plus: svg('<path d="M12 5v14M5 12h14"/>', 2.4),
  gauche: svg('<path d="M15 5l-7 7 7 7"/>', 2.2),
  droite: svg('<path d="M9 5l7 7-7 7"/>', 2.2),
  loupe: svg('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>'),
  agenda: svg('<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>', 1.9),
  note: svg('<path d="M6 3.5h8.5L18 7v13.5H6z"/><path d="M9 11h6M9 14.5h6"/>', 1.9),
  cible: svg('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8"/>', 1.9),
};

// ---------- Données ----------

function charger() {
  let brut = null;
  try { brut = localStorage.getItem(KEY); } catch {}
  if (!brut) return L.vide();
  try { return L.valider(JSON.parse(brut)); } catch {
    // Données illisibles : on en garde une copie avant de repartir, pour ne rien perdre.
    try { localStorage.setItem(`${KEY}-illisible-${Date.now()}`, brut); } catch {}
    return L.vide();
  }
}
let data = charger();
navigator.storage?.persist?.().catch(() => {});

function sauver() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { dire('Enregistrement impossible : exporte tes données depuis Profil.'); }
}
const maj = () => { sauver(); rendre(); };

const ui = { onglet: 'aujourdhui', lundi: L.lundiDe(new Date()), seul: null, tag: null, q: '', ouvertes: new Set(), derniereCat: null };
try { ui.onglet = localStorage.getItem('orga-onglet') || ui.onglet; } catch {}

const cat = id => data.cats.find(c => c.id === id) || { id, nom: 'Sans catégorie', couleur: '#9aa1ae' };
const teinte = id => { const c = L.couleurSure(cat(id).couleur); return `--c:${c};--t:var(--t-${L.texteSur(c)})`; };
const cleSem = d => L.isoJour(L.lundiDe(d));
function semaineDe(cle) {
  const neuve = !data.semaines[cle];
  const s = L.semaine(data, cle);
  if (neuve) sauver();
  return s;
}
function trouverSlot(id) {
  for (const [cle, s] of Object.entries(data.semaines)) {
    const slot = s.slots.find(x => x.id === id);
    if (slot) return { cle, slot };
  }
}
// ponytail: lien note ↔ créneau par le titre du créneau, pour qu'il suive un cours d'une semaine à l'autre.
const notesLiees = titre => data.notes.filter(n => n.lien && n.lien.toLowerCase() === String(titre).toLowerCase());
const infos = x => [x.salle, x.affaires].filter(Boolean).join(' · ');
const objectifs = (horizon, per) => data.objectifs.filter(o => o.horizon === horizon && o.periode === per);
const tagsDe = s => [...new Set(String(s).split(',').map(t => t.trim()).filter(Boolean))];

// ---------- Petits outils d'interface ----------

const toast = $('#toast');
let tt;
function dire(msg) { toast.textContent = msg; toast.hidden = false; clearTimeout(tt); tt = setTimeout(() => toast.hidden = true, 2200); }

const dlg = $('#dlg');
// Ouvre une fenêtre du bas. onChoix(choix, champs) ; renvoyer false la garde ouverte.
function ouvrirDlg(html, onChoix) {
  if (dlg.open) dlg.close();
  dlg.innerHTML = html;
  const form = dlg.querySelector('form');
  const fin = choix => { if (onChoix(choix, new FormData(form)) !== false && dlg.open) dlg.close(); };
  form.addEventListener('submit', e => { e.preventDefault(); fin('ok'); });
  dlg.querySelectorAll('button[data-choix]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.confirmer && !b.dataset.arme) { b.dataset.arme = '1'; b.textContent = b.dataset.confirmer; return; }
    fin(b.dataset.choix);
  }));
  dlg.showModal();
  // Le focus va au titre, pas au premier champ : sinon le clavier de l'iPhone s'ouvre à chaque fois.
  const titre = dlg.querySelector('h2');
  titre.tabIndex = -1;
  titre.focus();
}
dlg.addEventListener('click', e => { if (e.target === dlg || e.target.closest('[data-fermer]')) dlg.close(); });

const bienvenue = () => `<div class="card bientot"><b>Bienvenue</b>
  <p>Pour commencer, prends la semaine d’exemple et modifie-la, ou pars d’un emploi du temps vide.</p>
  <div class="rangee"><button class="btn plein" data-act="depart-exemple">Semaine d’exemple</button><button class="btn gris" data-act="depart-vide">Partir de zéro</button></div></div>`;

// ---------- Aujourd'hui ----------

function vueAujourdhui() {
  const { date, h } = L.momentLogique(new Date());
  let html = `<header class="top"><div><h1>Aujourd’hui</h1><p>${date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p></div></header>`;
  if (!data.types.length) { $('#aujourdhui').innerHTML = html + bienvenue(); return; }

  const j = L.jourSemaine(date);
  const slots = semaineDe(cleSem(date)).slots.filter(x => x.j === j);
  const duJour = [...(data.plage[0] > 1 ? [{ s: 1, e: data.plage[0], cat: 'sommeil', titre: 'Nuit' }] : []), ...slots];
  const enCours = duJour.find(x => x.s <= h && h < x.e);
  const suivant = duJour.find(x => x.s >= (enCours ? enCours.e : h));
  const ensuite = suivant ? `Ensuite ${L.hhmm(suivant.s)} · ${esc(suivant.titre)}` : 'Ensuite : la nuit';
  if (enCours) {
    const inf = infos(enCours);
    html += `<div class="now" style="${teinte(enCours.cat)}" ${enCours.id ? `data-act="slot" data-id="${enCours.id}"` : ''}>
      <div class="now-label">Maintenant · ${L.hhmm(enCours.s)} – ${L.hhmm(enCours.e)} · ${esc(cat(enCours.cat).nom)}</div>
      <div class="now-title">${esc(enCours.titre)}</div>${inf ? `<div class="now-info">${esc(inf)}</div>` : ''}
      <div class="now-left"><span class="num">${L.duree(Math.round((enCours.e - h) * 60))}</span>restantes</div>
      <div class="bar"><i style="width:${(h - enCours.s) / (enCours.e - enCours.s) * 100}%"></i></div>
      <div class="next">${ensuite}</div></div>`;
  } else {
    html += `<div class="now"><div class="now-label">Maintenant</div><div class="now-title">Créneau libre</div><div class="next">${ensuite}</div></div>`;
  }

  const passes = slots.filter(x => x.e <= h);
  html += `<div class="sec"><h2>La journée <span>${passes.length ? `${passes.filter(x => x.fait).length} validés sur ${passes.length} passés` : ''}</span></h2>`;
  html += slots.length ? `<ol class="list day">${slots.map(x => {
    const passe = x.e <= h, actuel = x.s <= h && h < x.e, liees = notesLiees(x.titre).length;
    const sous = [infos(x), liees ? `${liees} note${liees > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ');
    return `<li class="${actuel ? 'actuel' : passe ? 'passe' : ''}" data-act="slot" data-id="${x.id}"><time>${L.hhmm(x.s)}</time><span class="dot" style="${teinte(x.cat)}"></span>
      <div class="txt"><b>${esc(x.titre)}</b>${sous ? `<small>${esc(sous)}</small>` : ''}</div>
      ${passe ? `<button class="valid" data-act="valider" data-id="${x.id}" aria-pressed="${!!x.fait}" aria-label="Valider ${esc(x.titre)}">${I.check}</button>` : ''}</li>`;
  }).join('')}</ol>` : '<p class="vide">Rien de prévu aujourd’hui. Ajoute un créneau avec le bouton +.</p>';
  html += '</div>';

  const os = objectifs('semaine', L.periode('semaine', date));
  html += `<div class="sec"><h2>Objectifs de la semaine <span>${os.filter(o => o.fait).length} sur ${os.length}</span></h2>${os.length ? objectifsHtml('semaine', L.periode('semaine', date), false) : '<p class="vide">Aucun objectif cette semaine : ajoute-les dans Notes.</p>'}</div>`;
  $('#aujourdhui').innerHTML = html;
}

// ---------- Semaine ----------

function blocHtml(x, p0, p1) {
  const s = Math.max(x.s, p0), e = Math.min(x.e, p1);
  const titre = e - s >= 1 || ui.seul !== null ? esc(x.titre) : '';
  return `<div class="blk" data-id="${x.id}" style="${teinte(x.cat)};--s:${s - p0};--d:${e - s}">${titre}<small>${L.hhmm(x.s)} – ${L.hhmm(x.e)}${x.salle ? ` · ${esc(x.salle)}` : ''}</small></div>`;
}

function vueSemaine() {
  const lundi = ui.lundi, cle = L.isoJour(lundi);
  const f = d => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  let html = `<header class="top"><div><h1>Semaine</h1><p>Du ${f(lundi)} au ${f(L.ajouterJours(lundi, 6))}</p></div>
    <div class="navsem"><button data-act="sem-prec" aria-label="Semaine précédente">${I.gauche}</button><button data-act="sem-auj">Auj.</button><button data-act="sem-suiv" aria-label="Semaine suivante">${I.droite}</button></div></header>`;
  if (!data.types.length) { $('#semaine').innerHTML = html + bienvenue(); return; }

  const sem = semaineDe(cle);
  const type = data.types.find(t => t.id === sem.type);
  html += `<div class="card type"><div class="txt"><b>${type ? esc(type.nom) : 'Semaine sans type'}</b><small>Semaine type appliquée, puis ajustée</small></div><button class="btn gris petit" data-act="sem-actions">Modifier</button></div>`;

  const [p0, p1] = data.plage;
  const { date, h } = L.momentLogique(new Date());
  const jNow = cleSem(date) === cle ? L.jourSemaine(date) : -1;
  const jAuj = cleSem(new Date()) === cle ? L.jourSemaine(new Date()) : -1;
  const jours = ui.seul === null ? [0, 1, 2, 3, 4, 5, 6] : [ui.seul];
  html += `<div class="wk${ui.seul !== null ? ' seul' : ''}" style="--n:${jours.length};--rows:${(p1 - p0) * 2}">
    <div class="wk-head"><span></span>${jours.map(j => `<button data-act="jour" data-j="${j}" class="${j === jAuj ? 'auj' : ''}" aria-label="${ui.seul === null ? `Voir le ${JOURS[j]} seul` : 'Revenir à la semaine'}"><small>${ui.seul === null ? 'LMMJVSD'[j] : JOURS[j]}</small>${L.ajouterJours(lundi, j).getDate()}</button>`).join('')}</div>
    <div class="wk-body"><div class="wk-hours">${Array.from({ length: p1 - p0 - 1 }, (_, i) => `<span style="--s:${i + 1}">${(p0 + i + 1) % 24}</span>`).join('')}</div>
    ${jours.map(j => `<div class="wk-col" data-j="${j}">${sem.slots.filter(x => x.j === j && x.e > p0 && x.s < p1).map(x => blocHtml(x, p0, p1)).join('')}${j === jNow && h >= p0 && h < p1 ? `<div class="nowline" style="--s:${h - p0}"></div>` : ''}</div>`).join('')}
    </div></div>
    <p class="aide">Touche une case vide pour ajouter un créneau, un créneau pour le modifier. Appui long puis glisse : sur du vide pour remplir plusieurs demi-heures, sur un créneau pour le déplacer, sur son bas pour l’étirer. Touche un jour pour le voir seul.</p>
    <ul class="legend">${data.cats.map(c => `<li><span class="dot" style="${teinte(c.id)}"></span>${esc(c.nom)}</li>`).join('')}</ul>`;
  $('#semaine').innerHTML = html;
}

const nouveauSlot = (j, s, e) => ({ id: L.uid(), j, s, e, cat: ui.derniereCat || data.cats[0]?.id, titre: '', salle: '', affaires: '', notes: '', fait: null, neuf: true });

function editerSlot(slot, cle) {
  const neuf = !!slot.neuf;
  const sem = semaineDe(cle), type = data.types.find(t => t.id === sem.type);
  const [p0, p1] = data.plage;
  const options = (de, a, sel) => { let o = ''; for (let x = de; x <= a; x += .5) o += `<option value="${x}" ${x === sel ? 'selected' : ''}>${L.hhmm(x)}</option>`; return o; };
  const liees = slot.titre ? notesLiees(slot.titre) : [];
  ouvrirDlg(`<form><h2>${neuf ? 'Nouveau créneau' : 'Créneau'}</h2>
    <label class="champ">Titre<input name="titre" value="${esc(slot.titre)}" placeholder="${esc(cat(slot.cat).nom)}" autocomplete="off"></label>
    <div class="cats" role="radiogroup" aria-label="Catégorie">${data.cats.map(c => `<label><input type="radio" name="cat" value="${c.id}" ${c.id === slot.cat ? 'checked' : ''}><span style="${teinte(c.id)}">${esc(c.nom)}</span></label>`).join('')}</div>
    <div class="champs">
      <label class="champ">Jour<select name="j">${JOURS.map((n, j) => `<option value="${j}" ${j === slot.j ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="champ">Début<select name="s">${options(p0, p1 - .5, slot.s)}</select></label>
      <label class="champ">Fin<select name="e">${options(p0 + .5, p1, slot.e)}</select></label>
    </div>
    <label class="champ">Salle, bâtiment<input name="salle" value="${esc(slot.salle)}" autocomplete="off"></label>
    <label class="champ">Affaires à prendre<input name="affaires" value="${esc(slot.affaires)}" autocomplete="off"></label>
    <label class="champ">Notes<textarea name="notes">${esc(slot.notes)}</textarea></label>
    ${liees.length ? `<div class="champ">Notes liées<div class="liens">${liees.map(n => `<button type="button" data-act="note" data-id="${n.id}">${esc(n.titre || 'Sans titre')}</button>`).join('')}</div></div>` : ''}
    ${neuf ? '' : `<label class="coche"><input type="checkbox" class="chk" name="fait" ${slot.fait ? 'checked' : ''}>Réalisé comme prévu</label>`}
    ${type ? `<label class="coche"><input type="checkbox" class="chk" name="type" ${neuf ? 'checked' : ''}>${neuf ? 'Répéter chaque semaine' : 'Modifier aussi la semaine type'} (${esc(type.nom)})</label>` : ''}
    <div class="rangee">${neuf ? '' : '<button type="button" class="btn rouge" data-choix="suppr">Supprimer</button>'}<button type="button" class="btn gris" data-fermer>Annuler</button><button class="btn plein">Enregistrer</button></div>
  </form>`, (choix, f) => {
    const versType = f.get('type') && type;
    if (choix === 'suppr') {
      sem.slots = sem.slots.filter(x => x.id !== slot.id);
      if (versType && slot.src) type.slots = type.slots.filter(x => x.id !== slot.src);
      maj(); dire('Créneau supprimé'); return;
    }
    const c = { id: slot.id, j: +f.get('j'), s: +f.get('s'), e: +f.get('e'), cat: f.get('cat') || slot.cat,
      salle: f.get('salle').trim(), affaires: f.get('affaires').trim(), notes: f.get('notes').trim(), fait: f.get('fait') ? true : null };
    c.titre = f.get('titre').trim() || cat(c.cat).nom;
    if (c.e <= c.s) { dire('La fin doit être après le début.'); return false; }
    if (slot.src) c.src = slot.src;
    if (versType) {
      const { fait, ...modele } = c;
      modele.id = c.src || L.uid();
      c.src = modele.id;
      delete modele.src;
      type.slots = L.placer(type.slots, modele);
    }
    sem.slots = L.placer(sem.slots, c);
    ui.derniereCat = c.cat;
    maj();
  });
}

function actionsSemaine() {
  const cle = L.isoJour(ui.lundi), sem = semaineDe(cle);
  const jours = JOURS.map((n, j) => `<option value="${j}">${n}</option>`).join('');
  ouvrirDlg(`<form><h2>Modifier la semaine</h2>
    <div class="champ">Appliquer une semaine type (remplace les créneaux de cette semaine)
      <div class="liens">${data.types.map(t => `<button type="button" data-choix="type:${t.id}">${esc(t.nom)}${t.id === sem.type ? ' · actuelle' : ''}</button>`).join('')}</div></div>
    <button type="button" class="btn gris" data-choix="precedente">Copier la semaine précédente</button>
    <div class="champs" style="grid-template-columns: 1fr 1fr auto; align-items: end">
      <label class="champ">Copier le<select name="de">${jours}</select></label>
      <label class="champ">vers le<select name="vers">${jours}</select></label>
      <button type="button" class="btn gris" data-choix="jour">Copier</button>
    </div>
    <label class="champ">Enregistrer cette semaine comme semaine type<input name="nom" placeholder="Ex. Partiels, Vacances" autocomplete="off"></label>
    <div class="rangee"><button type="button" class="btn gris" data-fermer>Fermer</button><button class="btn plein">Enregistrer le type</button></div>
  </form>`, (choix, f) => {
    if (choix.startsWith('type:')) { L.appliquerType(data, cle, choix.slice(5)); maj(); dire('Semaine type appliquée'); return; }
    if (choix === 'precedente') {
      const prec = data.semaines[L.isoJour(L.ajouterJours(ui.lundi, -7))];
      if (!prec || !prec.slots.length) { dire('La semaine précédente est vide.'); return false; }
      sem.slots = prec.slots.map(x => ({ ...x, id: L.uid(), fait: null }));
      sem.type = prec.type;
      maj(); dire('Semaine précédente copiée'); return;
    }
    if (choix === 'jour') {
      const de = +f.get('de'), vers = +f.get('vers');
      if (de === vers) { dire('Choisis deux jours différents.'); return false; }
      sem.slots = L.copierJour(sem.slots, de, vers);
      maj(); dire(`${JOURS[de]} copié vers ${JOURS[vers]}`); return;
    }
    const nom = f.get('nom').trim();
    if (!nom) { dire('Donne un nom à la semaine type.'); return false; }
    const t = { id: L.uid(), nom, slots: sem.slots.map(x => { const id = L.uid(); x.src = id; const { fait, src, ...m } = x; return { ...m, id }; }) };
    data.types.push(t);
    sem.type = t.id;
    maj(); dire(`Semaine type « ${nom} » enregistrée`);
  });
}

// Gestes sur la grille : appui long (320 ms) pour remplir, déplacer ou étirer ; sinon le doigt fait défiler.
let geste = null;
const heureA = (col, y) => data.plage[0] + Math.floor((y - col.getBoundingClientRect().top) / ROW) / 2;
function cible(g) {
  const [p0, p1] = data.plage;
  const sous = document.elementFromPoint(g.cx, g.cy)?.closest('.wk-col');
  const col = g.mode === 'deplacer' && sous ? sous : g.col;
  const h = Math.min(Math.max(heureA(col, g.cy), p0), p1 - .5);
  if (g.mode === 'creer') return { col, j: g.j, s: Math.min(g.h0, h), e: Math.max(g.h0, h) + .5 };
  if (g.mode === 'etirer') return { col, j: g.slot.j, s: g.slot.s, e: Math.max(g.slot.s + .5, h + .5) };
  const d = g.slot.e - g.slot.s;
  const s = Math.min(Math.max(g.slot.s + h - g.h0, p0), p1 - d);
  return { col, j: +col.dataset.j, s, e: s + d };
}
function apercu() {
  const c = cible(geste), f = geste.fantome;
  f.style.cssText = `${teinte(geste.slot ? geste.slot.cat : ui.derniereCat || data.cats[0]?.id)};--s:${c.s - data.plage[0]};--d:${c.e - c.s}`;
  f.textContent = `${L.hhmm(c.s)}–${L.hhmm(c.e)}`;
  if (f.parentNode !== c.col) c.col.append(f);
}
function finGeste() {
  if (!geste) return;
  clearTimeout(geste.timer);
  geste.fantome?.remove();
  geste.blk?.classList.remove('leve');
  geste = null;
}
const vueSem = $('#semaine');
vueSem.addEventListener('pointerdown', e => {
  const col = e.target.closest('.wk-col');
  if (!col || e.button > 0) return;
  const blk = e.target.closest('.blk');
  const slot = blk && data.semaines[L.isoJour(ui.lundi)].slots.find(x => x.id === blk.dataset.id);
  geste = { mode: 'attente', x: e.clientX, y: e.clientY, cx: e.clientX, cy: e.clientY, col, j: +col.dataset.j, h0: heureA(col, e.clientY),
    slot, blk, bas: !!blk && e.clientY > blk.getBoundingClientRect().bottom - 12, pid: e.pointerId };
  geste.timer = setTimeout(() => {
    if (!geste) return;
    geste.mode = slot ? (geste.bas ? 'etirer' : 'deplacer') : 'creer';
    try { col.setPointerCapture(geste.pid); } catch {}
    blk?.classList.add('leve');
    geste.fantome = Object.assign(document.createElement('div'), { className: 'blk fantome' });
    navigator.vibrate?.(10);
    apercu();
  }, 320);
});
vueSem.addEventListener('pointermove', e => {
  if (!geste) return;
  geste.cx = e.clientX; geste.cy = e.clientY;
  if (geste.mode === 'attente') { if (Math.hypot(e.clientX - geste.x, e.clientY - geste.y) > 8) finGeste(); return; }
  apercu();
});
vueSem.addEventListener('pointerup', () => {
  if (!geste) return;
  const g = geste, c = g.mode === 'attente' ? null : cible(g);
  finGeste();
  const cle = L.isoJour(ui.lundi);
  if (!c) return editerSlot(g.slot || nouveauSlot(g.j, g.h0, Math.min(g.h0 + 1, data.plage[1])), cle);
  if (g.mode === 'creer') return editerSlot(nouveauSlot(c.j, c.s, c.e), cle);
  const sem = data.semaines[cle];
  sem.slots = L.placer(sem.slots, { ...g.slot, j: c.j, s: c.s, e: c.e });
  maj();
});
vueSem.addEventListener('pointercancel', finGeste);
vueSem.addEventListener('contextmenu', e => { if (e.target.closest('.wk')) e.preventDefault(); });
document.addEventListener('touchmove', e => { if (geste && geste.mode !== 'attente') e.preventDefault(); }, { passive: false });

// ---------- Notes ----------

function objectifsHtml(horizon, per, ajout) {
  const os = objectifs(horizon, per);
  let html = `<ul class="list">${os.map(o => {
    const enfants = data.objectifs.filter(x => x.parent === o.id);
    const parent = o.parent && data.objectifs.find(x => x.id === o.parent);
    const sous = enfants.length ? `${enfants.filter(x => x.fait).length} sur ${enfants.length} objectifs de semaine` : parent ? `Pour : ${parent.txt}` : '';
    return `<li><input type="checkbox" class="chk" data-act="objectif" data-id="${o.id}" ${o.fait ? 'checked' : ''} aria-label="Atteint">
      <div class="txt"><b>${esc(o.txt)}</b>${sous ? `<small>${esc(sous)}</small>` : ''}</div>
      ${ajout ? `<button class="x" data-act="suppr-objectif" data-id="${o.id}" aria-label="Supprimer">${I.x}</button>` : ''}</li>`;
  }).join('')}</ul>`;
  if (ajout) {
    const now = new Date();
    const parents = horizon === 'semaine' ? [...objectifs('mois', L.periode('mois', now)), ...objectifs('annee', L.periode('annee', now))]
      : horizon === 'mois' ? objectifs('annee', L.periode('annee', now)) : [];
    html += `<form class="ajout" data-form="objectif" data-horizon="${horizon}" data-periode="${per}">
      <input name="txt" placeholder="Nouvel objectif" aria-label="Nouvel objectif" autocomplete="off">
      ${parents.length ? `<select name="parent" aria-label="Rattacher à"><option value="">Rattacher à…</option>${parents.map(p => `<option value="${p.id}">${esc(p.txt)}</option>`).join('')}</select>` : ''}
      <button aria-label="Ajouter">${I.plus}</button></form>`;
  }
  return html;
}

const listeHtml = l => {
  const items = [...l.items].sort((a, b) => a.fait - b.fait);
  return `<details class="liste" data-id="${l.id}" ${ui.ouvertes.has(l.id) ? 'open' : ''}><summary>${esc(l.nom)}<span class="pill">${l.items.filter(i => !i.fait).length}</span></summary>
    <ul class="list">${items.map(i => `<li><input type="checkbox" class="chk" data-act="item" data-liste="${l.id}" data-id="${i.id}" ${i.fait ? 'checked' : ''} aria-label="Fait"><div class="txt"><b>${esc(i.txt)}</b></div><button class="x" data-act="suppr-item" data-liste="${l.id}" data-id="${i.id}" aria-label="Supprimer">${I.x}</button></li>`).join('')}</ul>
    <div class="pied"><form class="ajout" data-form="item" data-id="${l.id}"><input name="txt" placeholder="Ajouter à la liste" aria-label="Ajouter à ${esc(l.nom)}" autocomplete="off"><button aria-label="Ajouter">${I.plus}</button></form>
    <div class="rangee">${l.items.some(i => i.fait) ? `<button class="btn gris petit" data-act="vider-liste" data-id="${l.id}">Retirer les cochés</button>` : ''}<button class="btn gris petit" data-act="liste" data-id="${l.id}">Renommer, étiquettes</button></div></div></details>`;
};

const noteHtml = n => `<article class="note" role="button" tabindex="0" data-act="note" data-id="${n.id}" style="${n.couleur ? `--c:${L.couleurSure(n.couleur)}` : ''}">
  <b>${esc(n.titre || 'Sans titre')}</b>${n.texte ? `<p>${esc(n.texte)}</p>` : ''}
  <small>${[n.epingle && 'Épinglée', n.lien && `Liée à « ${n.lien} »`, ...(n.tags || [])].filter(Boolean).map(esc).join(' · ')}</small></article>`;

function resultats(q) {
  const m = s => String(s || '').toLowerCase().includes(q.toLowerCase());
  const nomHorizon = { semaine: 'de la semaine', mois: 'du mois', annee: 'de l’année' };
  const r = [];
  data.notes.filter(n => m(n.titre) || m(n.texte)).forEach(n => r.push(`<li data-act="note" data-id="${n.id}"><div class="txt"><b>${esc(n.titre || 'Sans titre')}</b><small>Note</small></div></li>`));
  data.listes.forEach(l => l.items.filter(i => m(i.txt)).forEach(i => r.push(`<li data-act="ouvrir-liste" data-id="${l.id}"><div class="txt"><b>${esc(i.txt)}</b><small>Liste ${esc(l.nom)}</small></div></li>`)));
  data.objectifs.filter(o => m(o.txt)).forEach(o => r.push(`<li><div class="txt"><b>${esc(o.txt)}</b><small>Objectif ${nomHorizon[o.horizon]}</small></div></li>`));
  data.semaines[cleSem(new Date())]?.slots.filter(x => m(x.titre) || m(x.salle) || m(x.affaires) || m(x.notes))
    .forEach(x => r.push(`<li data-act="slot" data-id="${x.id}"><div class="txt"><b>${esc(x.titre)}</b><small>Créneau · ${JOURS[x.j]} ${L.hhmm(x.s)}</small></div></li>`));
  return r.length ? `<ul class="list">${r.join('')}</ul>` : `<p class="vide">Rien ne correspond à « ${esc(q)} ».</p>`;
}

function vueNotes() {
  $('#notes').innerHTML = `<header class="top"><div><h1>Notes</h1><p>Objectifs, listes et idées</p></div></header>
    <label class="search">${I.loupe}<input type="search" id="recherche" value="${esc(ui.q)}" placeholder="Notes, listes, objectifs, créneaux…" aria-label="Rechercher" autocomplete="off"></label>
    <div id="notes-corps" class="view"></div>`;
  corpsNotes();
}
function corpsNotes() {
  const el = $('#notes-corps');
  if (ui.q.trim()) { el.innerHTML = resultats(ui.q.trim()); return; }
  const now = new Date(), pS = L.periode('semaine', now), pM = L.periode('mois', now), pA = L.periode('annee', now);
  const tags = [...new Set([...data.notes, ...data.listes].flatMap(x => x.tags || []))].sort();
  if (ui.tag && !tags.includes(ui.tag)) ui.tag = null;
  const garde = x => !ui.tag || (x.tags || []).includes(ui.tag);
  const os = objectifs('semaine', pS), faits = os.filter(o => o.fait).length;
  let h = tags.length ? `<div class="tags">${['', ...tags].map(t => `<button data-act="tag" data-tag="${esc(t)}" aria-pressed="${(ui.tag || '') === t}">${t ? esc(t) : 'Tout'}</button>`).join('')}</div>` : '';
  h += `<div class="sec"><h2>Objectifs de la semaine</h2>${os.length ? `<div class="card"><div class="goal-head"><b>${faits} sur ${os.length} atteints</b><span class="num">${Math.round(faits / os.length * 100)} %</span></div><div class="bar"><i style="width:${faits / os.length * 100}%"></i></div></div>` : ''}${objectifsHtml('semaine', pS, true)}</div>`;
  h += `<div class="sec"><h2>Objectifs du mois <span>${now.toLocaleDateString('fr-FR', { month: 'long' })}</span></h2>${objectifsHtml('mois', pM, true)}</div>`;
  h += `<div class="sec"><h2>Objectifs de l’année <span>${pA.replace('-', '–')}</span></h2>${objectifsHtml('annee', pA, true)}</div>`;
  h += `<div class="sec"><h2>Listes <button class="btn gris petit" data-act="nouvelle-liste">Nouvelle liste</button></h2>${data.listes.filter(garde).map(listeHtml).join('')}</div>`;
  const notes = data.notes.filter(garde).sort((a, b) => (b.epingle ? 1 : 0) - (a.epingle ? 1 : 0) || (b.maj || 0) - (a.maj || 0));
  h += `<div class="sec"><h2>Notes libres <button class="btn gris petit" data-act="nouvelle-note">Nouvelle note</button></h2>${notes.length ? `<div class="notes">${notes.map(noteHtml).join('')}</div>` : '<p class="vide">Aucune note pour l’instant.</p>'}</div>`;
  el.innerHTML = h;
}

function editerNote(n) {
  const neuf = !n;
  const v = n || { titre: '', texte: '', couleur: '', epingle: false, tags: [], lien: '' };
  const sem = data.semaines[cleSem(new Date())];
  const titres = [...new Set([...(sem?.slots || []), ...data.types.flatMap(t => t.slots)].map(x => x.titre))].sort();
  ouvrirDlg(`<form><h2>${neuf ? 'Nouvelle note' : 'Note'}</h2>
    <label class="champ">Titre<input name="titre" value="${esc(v.titre)}" autocomplete="off"></label>
    <label class="champ">Texte<textarea name="texte" rows="6">${esc(v.texte)}</textarea></label>
    <div class="champ">Couleur<div class="cats"><label><input type="radio" name="couleur" value="" ${v.couleur ? '' : 'checked'}><span class="sans">Aucune</span></label>${data.cats.map(c => `<label><input type="radio" name="couleur" value="${esc(c.couleur)}" ${v.couleur === c.couleur ? 'checked' : ''}><span style="${teinte(c.id)}">${esc(c.nom)}</span></label>`).join('')}</div></div>
    <label class="champ">Étiquettes, séparées par des virgules<input name="tags" value="${esc((v.tags || []).join(', '))}" placeholder="Fac, Écriture…" autocomplete="off"></label>
    <label class="champ">Liée au créneau<input name="lien" list="titres" value="${esc(v.lien)}" placeholder="Titre du créneau, ex. Base de données" autocomplete="off"><datalist id="titres">${titres.map(t => `<option value="${esc(t)}">`).join('')}</datalist></label>
    <label class="coche"><input type="checkbox" class="chk" name="epingle" ${v.epingle ? 'checked' : ''}>Épinglée en haut</label>
    <div class="rangee">${neuf ? '' : '<button type="button" class="btn rouge" data-choix="suppr" data-confirmer="Confirmer">Supprimer</button>'}<button type="button" class="btn gris" data-fermer>Annuler</button><button class="btn plein">Enregistrer</button></div>
  </form>`, (choix, f) => {
    if (choix === 'suppr') { data.notes = data.notes.filter(x => x !== n); maj(); dire('Note supprimée'); return; }
    const champs = { titre: f.get('titre').trim(), texte: f.get('texte').trim(), couleur: f.get('couleur') || '', epingle: !!f.get('epingle'),
      tags: tagsDe(f.get('tags')), lien: f.get('lien').trim(), maj: Date.now() };
    if (!champs.titre && !champs.texte) { dire('La note est vide.'); return false; }
    if (neuf) data.notes.push({ id: L.uid(), ...champs }); else Object.assign(n, champs);
    maj();
  });
}

function editerListe(l) {
  const neuf = !l;
  ouvrirDlg(`<form><h2>${neuf ? 'Nouvelle liste' : 'Liste'}</h2>
    <label class="champ">Nom<input name="nom" value="${esc(l?.nom)}" autocomplete="off"></label>
    <label class="champ">Étiquettes, séparées par des virgules<input name="tags" value="${esc((l?.tags || []).join(', '))}" placeholder="Achats, Fac…" autocomplete="off"></label>
    <div class="rangee">${neuf ? '' : '<button type="button" class="btn rouge" data-choix="suppr" data-confirmer="Confirmer">Supprimer la liste</button>'}<button type="button" class="btn gris" data-fermer>Annuler</button><button class="btn plein">Enregistrer</button></div>
  </form>`, (choix, f) => {
    if (choix === 'suppr') { data.listes = data.listes.filter(x => x !== l); maj(); dire('Liste supprimée'); return; }
    const nom = f.get('nom').trim();
    if (!nom) { dire('Donne un nom à la liste.'); return false; }
    if (neuf) { l = { id: L.uid(), nom, tags: [], items: [] }; data.listes.push(l); ui.ouvertes.add(l.id); }
    l.nom = nom;
    l.tags = tagsDe(f.get('tags'));
    maj();
  });
}

// ---------- Sport et Profil ----------

$('#sport').innerHTML = `<header class="top"><div><h1>Sport</h1><p>Arrive en V1.2</p></div></header>
  <div class="card bientot"><b>Ce qui arrive ici</b><p>Bibliothèque d’exercices, séances types, séance ouverte au début d’un créneau sport, journal, minuteur de repos, progression et records, habitudes. Et le sport en club : tes entraînements comptés et des exos conseillés pour ton sport.</p></div>
  <div class="card bientot"><b>Déjà possible</b><p>Les créneaux de la catégorie Sport de ton emploi du temps, comptés dans les heures de la semaine (onglet Profil).</p></div>`;

function vueProfil() {
  const sem = data.semaines[cleSem(new Date())];
  const tot = L.heuresParCat(sem ? sem.slots : []), max = Math.max(1, ...Object.values(tot));
  const jours = data.dernierExport ? Math.floor((Date.now() - new Date(data.dernierExport)) / 864e5) : null;
  const etat = jours === null ? 'Jamais exportée' : jours === 0 ? 'Exportée aujourd’hui' : `Dernier export il y a ${jours} jour${jours > 1 ? 's' : ''}`;
  const defaut = data.typeDefaut || data.types[0]?.id;
  const opt = (vals, sel) => vals.map(x => `<option value="${x}" ${x === sel ? 'selected' : ''}>${L.hhmm(x)}</option>`).join('');
  $('#profil').innerHTML = `<header class="top"><div><h1>Profil</h1><p>Réglages et sauvegarde</p></div></header>
    <div class="sec"><h2>Sauvegarde</h2><div class="card bientot">
      <b class="${jours === null || jours > 7 ? 'alerte' : ''}">${etat}</b>
      <p>Tes données ne sont que sur ce téléphone, et iOS peut les effacer s’il manque de place. Exporte-les chaque semaine dans Fichiers (iCloud Drive).</p>
      <div class="rangee"><button class="btn plein" data-act="exporter">Exporter</button><button class="btn gris" data-act="importer">Importer</button></div></div></div>
    <div class="sec"><h2>Heures prévues cette semaine</h2>${Object.keys(tot).length ? `<div class="card"><ul class="stats">${Object.entries(tot).sort((a, b) => b[1] - a[1]).map(([c, v]) =>
      `<li><span>${esc(cat(c).nom)}</span><span class="track"><i style="${teinte(c)};width:${v / max * 100}%"></i></span><b>${L.heures(v)}</b></li>`).join('')}</ul></div>` : '<p class="vide">Aucun créneau cette semaine.</p>'}</div>
    <div class="sec"><h2>Catégories</h2>
      <ul class="list">${data.cats.map(c => `<li class="reglage"><input type="color" value="${L.couleurSure(c.couleur)}" data-act="cat-couleur" data-id="${c.id}" aria-label="Couleur de ${esc(c.nom)}"><input type="text" value="${esc(c.nom)}" data-act="cat-nom" data-id="${c.id}" aria-label="Nom de la catégorie"><button class="x" data-act="suppr-cat" data-id="${c.id}" aria-label="Supprimer ${esc(c.nom)}">${I.x}</button></li>`).join('')}</ul>
      <form class="ajout" data-form="cat"><input name="nom" placeholder="Nouvelle catégorie" aria-label="Nouvelle catégorie" autocomplete="off"><button aria-label="Ajouter">${I.plus}</button></form></div>
    <div class="sec"><h2>Plage horaire de la semaine</h2><div class="card reglage"><span>De</span><select data-act="plage" data-i="0" aria-label="Début">${opt([5, 6, 7, 8, 9], data.plage[0])}</select><span>à</span><select data-act="plage" data-i="1" aria-label="Fin">${opt([22, 23, 24, 25], data.plage[1])}</select></div></div>
    <div class="sec"><h2>Semaines types</h2>
      <ul class="list">${data.types.map(t => `<li class="reglage"><input type="text" value="${esc(t.nom)}" data-act="type-nom" data-id="${t.id}" aria-label="Nom de la semaine type"><button class="btn ${t.id === defaut ? 'plein' : 'gris'} petit" data-act="type-defaut" data-id="${t.id}" aria-pressed="${t.id === defaut}">Par défaut</button><button class="x" data-act="suppr-type" data-id="${t.id}" aria-label="Supprimer ${esc(t.nom)}">${I.x}</button></li>`).join('')}</ul>
      <p class="aide">La semaine type par défaut remplit chaque nouvelle semaine. Pour en créer une : Semaine › Modifier.</p></div>
    <div class="card bientot"><b>Niveau, XP, collection et succès</b><p>Arrivent en V1.3, avec le bilan du dimanche.</p></div>`;
}

// ---------- Sauvegarde ----------

async function exporter() {
  const nom = `orga-sauvegarde-${L.isoJour(new Date())}.json`;
  const copie = { ...data, dernierExport: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(copie)], { type: 'application/json' });
  const fichier = new File([blob], nom, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [fichier] })) await navigator.share({ files: [fichier], title: nom });
    else {
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: nom });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
  } catch (e) { if (e.name !== 'AbortError') dire('Export impossible : réessaie.'); return; }
  data.dernierExport = copie.dernierExport;
  maj(); dire('Sauvegarde exportée');
}

$('#fichier').addEventListener('change', async e => {
  const fichier = e.target.files[0];
  e.target.value = '';
  if (!fichier) return;
  let o;
  try { o = L.valider(JSON.parse(await fichier.text())); } catch (err) { return dire(err instanceof SyntaxError ? 'Ce fichier est illisible.' : err.message); }
  ouvrirDlg(`<form><h2>Importer cette sauvegarde ?</h2>
    <p class="muted">Elle remplace toutes les données de l’app${o.dernierExport ? ` par celles du ${new Date(o.dernierExport).toLocaleDateString('fr-FR')}` : ''}. Exporte d’abord si tu veux garder les données actuelles.</p>
    <div class="rangee"><button type="button" class="btn gris" data-fermer>Annuler</button><button class="btn plein">Remplacer</button></div></form>`,
  () => { data = o; maj(); dire('Sauvegarde importée'); });
});

// ---------- Bouton + et navigation ----------

function plus() {
  ouvrirDlg(`<form><h2>Ajouter</h2><div class="opts">
    <button type="button" data-choix="slot">${I.agenda}<b>Créneau</b><small>Dans l’emploi du temps</small></button>
    <button type="button" data-choix="note">${I.note}<b>Note</b><small>Une idée, une consigne</small></button>
    <button type="button" data-choix="objectif">${I.cible}<b>Objectif</b><small>Semaine, mois ou année</small></button>
    </div><button type="button" class="btn gris" data-fermer>Fermer</button></form>`, choix => {
    if (choix === 'slot') {
      if (!data.types.length) { dire('Choisis d’abord comment commencer, dans Aujourd’hui.'); return; }
      const { date, h } = L.momentLogique(new Date());
      const s = Math.min(Math.max(Math.ceil(h * 2) / 2, data.plage[0]), data.plage[1] - 1);
      editerSlot(nouveauSlot(L.jourSemaine(date), s, s + 1), cleSem(date));
      return false;
    }
    if (choix === 'note') { editerNote(); return false; }
    ouvrir('notes');
    setTimeout(() => document.querySelector('form[data-horizon="semaine"] input')?.focus(), 50);
  });
}

function ouvrir(id) {
  ui.onglet = id;
  document.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-selected', t.dataset.v === id));
  document.querySelectorAll('main > .view').forEach(v => v.hidden = v.id !== id);
  scrollTo(0, 0);
  try { localStorage.setItem('orga-onglet', id); } catch {}
}
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => ouvrir(t.dataset.v)));

function rendre() { vueAujourdhui(); vueSemaine(); vueNotes(); vueProfil(); }

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.matches('input, select')) return;
  const { act, id } = el.dataset;
  const liste = () => data.listes.find(l => l.id === (el.dataset.liste || id));
  switch (act) {
    case 'plus': return plus();
    case 'depart-exemple': case 'depart-vide': {
      const t = { id: L.uid(), nom: 'Semaine de cours', slots: act === 'depart-exemple' ? L.slotsExemple() : [] };
      data.types.push(t); data.typeDefaut = t.id;
      maj();
      return dire(act === 'depart-exemple' ? 'Semaine d’exemple prête : modifie-la dans Semaine' : 'C’est parti : remplis ta semaine');
    }
    case 'slot': { const r = trouverSlot(id); if (r) editerSlot(r.slot, r.cle); return; }
    case 'valider': {
      const r = trouverSlot(id);
      r.slot.fait = r.slot.fait ? null : true;
      maj();
      if (r.slot.fait) dire('Créneau validé');
      return;
    }
    case 'sem-prec': ui.lundi = L.ajouterJours(ui.lundi, -7); return vueSemaine();
    case 'sem-suiv': ui.lundi = L.ajouterJours(ui.lundi, 7); return vueSemaine();
    case 'sem-auj': ui.lundi = L.lundiDe(new Date()); return vueSemaine();
    case 'sem-actions': return actionsSemaine();
    case 'jour': ui.seul = ui.seul === null ? +el.dataset.j : null; return vueSemaine();
    case 'tag': ui.tag = el.dataset.tag || null; return corpsNotes();
    case 'nouvelle-liste': return editerListe();
    case 'liste': return editerListe(liste());
    case 'ouvrir-liste': {
      ui.q = ''; ui.tag = null; ui.ouvertes.add(id);
      vueNotes();
      return document.querySelector(`details[data-id="${id}"]`)?.scrollIntoView({ block: 'center' });
    }
    case 'vider-liste': { const l = liste(); l.items = l.items.filter(i => !i.fait); return maj(); }
    case 'suppr-item': { const l = liste(); l.items = l.items.filter(i => i.id !== id); return maj(); }
    case 'suppr-objectif':
      data.objectifs = data.objectifs.filter(o => o.id !== id);
      data.objectifs.forEach(o => { if (o.parent === id) o.parent = null; });
      return maj();
    case 'nouvelle-note': return editerNote();
    case 'note': return editerNote(data.notes.find(n => n.id === id));
    case 'suppr-cat': {
      const n = [...Object.values(data.semaines), ...data.types].reduce((k, s) => k + s.slots.filter(x => x.cat === id).length, 0);
      if (n) return dire(`${cat(id).nom} sert dans ${n} créneaux : change-les d’abord de catégorie.`);
      if (data.cats.length === 1) return dire('Garde au moins une catégorie.');
      data.cats = data.cats.filter(c => c.id !== id);
      return maj();
    }
    case 'type-defaut': data.typeDefaut = id; return maj();
    case 'suppr-type':
      if (data.types.length === 1) return dire('Garde au moins une semaine type.');
      data.types = data.types.filter(t => t.id !== id);
      if (data.typeDefaut === id) data.typeDefaut = data.types[0].id;
      return maj();
    case 'exporter': return exporter();
    case 'importer': return $('#fichier').click();
  }
});

document.addEventListener('change', e => {
  const t = e.target, { act, id } = t.dataset;
  if (!act) return;
  if (act === 'objectif') { data.objectifs.find(o => o.id === id).fait = t.checked; if (t.checked) dire('Objectif atteint'); }
  if (act === 'item') data.listes.find(l => l.id === t.dataset.liste).items.find(i => i.id === id).fait = t.checked;
  if (act === 'cat-couleur') cat(id).couleur = t.value;
  if (act === 'cat-nom' && t.value.trim()) cat(id).nom = t.value.trim();
  if (act === 'type-nom' && t.value.trim()) data.types.find(x => x.id === id).nom = t.value.trim();
  if (act === 'plage') data.plage[+t.dataset.i] = +t.value;
  maj();
});

document.addEventListener('submit', e => {
  const f = e.target, k = f.dataset.form;
  if (!k) return;
  e.preventDefault();
  const txt = (f.elements.txt || f.elements.nom).value.trim();
  if (!txt) return;
  if (k === 'objectif') data.objectifs.push({ id: L.uid(), txt, horizon: f.dataset.horizon, periode: f.dataset.periode, fait: false, parent: f.elements.parent?.value || null });
  if (k === 'item') data.listes.find(l => l.id === f.dataset.id).items.push({ id: L.uid(), txt, fait: false });
  if (k === 'cat') data.cats.push({ id: L.uid(), nom: txt, couleur: '#8a8f9c' });
  maj();
  // On garde le clavier ouvert pour enchaîner les ajouts.
  const sel = k === 'objectif' ? `form[data-horizon="${f.dataset.horizon}"] input` : k === 'item' ? `form[data-id="${f.dataset.id}"] input` : 'form[data-form="cat"] input';
  document.querySelector(sel)?.focus();
});

document.addEventListener('input', e => { if (e.target.id === 'recherche') { ui.q = e.target.value; corpsNotes(); } });
document.addEventListener('toggle', e => {
  if (!e.target.matches?.('details.liste')) return;
  ui.ouvertes[e.target.open ? 'add' : 'delete'](e.target.dataset.id);
}, true);
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="button"]')) { e.preventDefault(); e.target.click(); }
});

// L'écran Aujourd'hui suit l'heure ; tout se remet à jour au retour dans l'app.
setInterval(() => { if (!dlg.open && !geste) vueAujourdhui(); }, 60e3);
document.addEventListener('visibilitychange', () => { if (!document.hidden && !dlg.open) rendre(); });

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});

rendre();
ouvrir(ui.onglet);
