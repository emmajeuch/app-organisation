// L'app : affichage, gestes et enregistrement. La logique pure est dans logique.js.
import * as L from './logique.js';
import * as A from './assistant.js';

// Dans le cadre d'un autre site, l'app refuse de s'afficher (protection contre le « clickjacking »).
if (window.top !== window.self) {
  document.body.textContent = 'Ouvre l’app directement : emmajeuch.github.io/app-organisation';
  throw new Error('App affichée dans un cadre : arrêt.');
}

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
// Après chaque changement : on enregistre, on redessine, et on annonce l'XP gagnée (avec un petit son).
let dernier = null;
function maj() {
  const st = L.stats(data, new Date());
  const avant = data.compagnon?.stade;
  if (data.compagnon?.id) data.compagnon = L.grandir(data.compagnon, st.joursValides);
  sauver();
  rendre();
  if (data.compagnon?.id && data.compagnon.stade > (avant || 0) && actif('compagnon')) setTimeout(() => dire(`Ton compagnon grandit : stade ${data.compagnon.stade} !`), 1200);
  if (dernier && st.total > dernier.total && actif('motivation')) {
    const gain = `+${st.total - dernier.total} XP`;
    dire(toast.hidden ? gain : `${toast.textContent} · ${gain}`);
    son();
    if (st.niveau.n > dernier.niveau.n) { feter(); setTimeout(() => dire(`Niveau ${st.niveau.n} ! Un tirage t’attend dans Profil`), 2300); }
  }
  dernier = st;
}

const ui = { statsPer: 'semaine', onglet: 'aujourdhui', lundi: L.lundiDe(new Date()), seul: null, tag: null, q: '', ouvertes: new Set(), derniereCat: null };
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
const exo = id => data.exos.find(e => e.id === id);

// Modules masquables (Profil › Réglages › Modules) : masqués, ils gardent leurs données.
const MODULES = [['taches', 'Tâches'], ['projets', 'Projets et divertissements'], ['objectifs', 'Objectifs'], ['listes', 'Listes'],
  ['notes', 'Notes libres'], ['sport', 'Sport'], ['habitudes', 'Habitudes'], ['travail', 'Travail (job, extras)'], ['motivation', 'XP, niveaux, collection et succès'],
  ['stats', 'Statistiques (semaine, mois, année)'], ['compagnon', 'Compagnon']];
const actif = m => m in data.modules ? data.modules[m] : m !== 'travail';
// La catégorie Travail (distincte de « Travail perso », les révisions) n'existe que si le module est actif.
function catTravail() {
  let c = data.cats.find(x => x.id === 'job') || data.cats.find(x => x.nom.trim().toLowerCase() === 'travail');
  if (!c && actif('travail')) { c = { id: 'job', nom: 'Travail', couleur: '#8C6A4F' }; data.cats.push(c); sauver(); }
  return c;
}
const sportsDuProfil = () => data.profil.sports || [];
const joursDepuisExport = () => data.dernierExport ? Math.floor((Date.now() - new Date(data.dernierExport)) / 864e5) : null;
// Ce qui a servi aujourd'hui (jour logique : avant 1 h, c'est encore la veille).
const aujIso = () => L.isoJour(L.momentLogique(new Date()).date);
const noterUsage = cle => L.noter(data, aujIso(), cle);
const dateDuSlot = (cle, j) => L.isoJour(L.ajouterJours(L.deIso(cle), j));

// Relecture d'une journée : chaque créneau se coche un par un ; ceux déjà validés arrivent cochés.
// Seuls les créneaux cochés rapportent de l'XP ; la relecture seule ne fait pas compter la journée.
function relecture(jour) {
  const d = L.deIso(jour), cle = cleSem(d), j = L.jourSemaine(d), sem = semaineDe(cle);
  const slots = sem.slots.filter(x => x.j === j);
  const hier = jour !== aujIso();
  const servi = L.utiliseEnJournee(data, jour);
  ouvrirDlg(`<form><h2>${hier ? 'Relire hier' : 'Relire ta journée'}</h2>
    <p class="muted">Coche ce que tu as vraiment fait, puis confirme. ${servi ? 'Cette journée a servi pendant la journée : validée, elle comptera dans l’essai.' : 'Aucun créneau n’a été touché pendant cette journée : validée, elle ne comptera pas dans l’essai.'}</p>
    <ul class="list">${slots.map(x => `<li><input type="checkbox" class="chk" name="fait" value="${x.id}" ${x.fait ? 'checked' : ''} aria-label="${esc(x.titre)} fait"><span class="dot" style="${teinte(x.cat)}"></span><div class="txt"><b>${esc(x.titre)}</b><small>${L.hhmm(x.s)} – ${L.hhmm(x.e)}</small></div></li>`).join('')}</ul>
    <div class="rangee"><button type="button" class="btn gris" data-fermer>Annuler</button><button class="btn plein">Confirmer</button></div></form>`, (choix, f) => {
    const faits = new Set(f.getAll('fait'));
    for (const x of slots) {
      const avant = !!x.fait;
      x.fait = faits.has(x.id) ? true : null;
      const t = x.fait && !avant && x.tache && data.taches.find(y => y.id === x.tache);
      if (t && !t.fait) Object.assign(t, L.cocher(t, new Date()));
    }
    dire(L.journeeValidee(slots) ? (L.utiliseEnJournee(data, jour) ? 'Journée validée' : 'Journée validée, hors essai') : `${faits.size} créneaux sur ${slots.length} validés`);
    maj();
  });
}
const STATUTS = { idee: 'Idée', 'en-cours': 'En cours', pause: 'En pause', termine: 'Terminé' };
const radios = (nom, valeurs, sel) => `<div class="cats">${Object.entries(valeurs).map(([v, n]) => `<label><input type="radio" name="${nom}" value="${v}" ${String(sel) === v ? 'checked' : ''}><span class="sans">${esc(n)}</span></label>`).join('')}</div>`;

function cocherTache(t) {
  Object.assign(t, L.cocher(t, new Date()));
  dire(t.fait ? 'Tâche faite' : `Prochaine fois : ${L.deIso(t.echeance).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`);
}
function pillEcheance(t) {
  const j = L.joursAvant(t.echeance, new Date());
  const txt = j < 0 ? 'En retard' : j === 0 ? 'Aujourd’hui' : j === 1 ? 'Demain' : t.fac || j > 6 ? `J-${j}` : JOURS[L.jourSemaine(L.deIso(t.echeance))];
  return `<span class="pill${j < 0 ? ' retard' : ''}">${txt}</span>`;
}
const tacheHtml = t => {
  const p = data.projets.find(x => x.id === t.projet);
  const ns = (t.sous || []).length, nf = (t.sous || []).filter(s => s.fait).length;
  const sous = [t.fac && 'Fac', t.travail && 'Travail', p && p.nom, ns && `${nf}/${ns} étapes`, t.recurrence != null && `Chaque ${JOURS[t.recurrence]}`].filter(Boolean).join(' · ');
  return `<li><input type="checkbox" class="chk" data-act="tache" data-id="${t.id}" ${t.fait ? 'checked' : ''} aria-label="Fait">
    <div class="txt" data-act="editer-tache" data-id="${t.id}" role="button" tabindex="0"><b>${t.priorite === 1 ? '<span class="prio" title="Priorité haute"></span>' : ''}${esc(t.titre)}</b>${sous ? `<small>${esc(sous)}</small>` : ''}</div>
    ${t.echeance && !t.fait ? pillEcheance(t) : ''}</li>`;
};
// Entraînements du club : les créneaux Sport marqués « club » et validés.
function clubFaits() {
  return Object.entries(data.semaines).flatMap(([cle, s]) => s.slots.filter(x => x.club && x.fait)
    .map(x => ({ date: L.isoJour(L.ajouterJours(L.deIso(cle), x.j)), nom: x.titre, duree: x.e - x.s })));
}
// Petite fête quand on termine quelque chose.
function feter() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = Object.assign(document.createElement('div'), { className: 'confettis' });
  box.setAttribute('aria-hidden', 'true');
  const couleurs = data.cats.map(c => L.couleurSure(c.couleur));
  box.innerHTML = Array.from({ length: 60 }, (_, i) => `<i style="left:${Math.random() * 100}%;background:${couleurs[i % couleurs.length]};--d:${(.9 + Math.random() * .8).toFixed(2)}s;--r:${Math.round(Math.random() * 720 - 360)}deg;animation-delay:${(Math.random() * .25).toFixed(2)}s"></i>`).join('');
  document.body.append(box);
  setTimeout(() => box.remove(), 2200);
}

// ---------- Petits outils d'interface ----------

const toast = $('#toast');
let tt;
function dire(msg) { toast.textContent = msg; toast.hidden = false; clearTimeout(tt); tt = setTimeout(() => toast.hidden = true, 2200); }

const dlg = $('#dlg');
// Ouvre une fenêtre du bas. onChoix(choix, champs) ; renvoyer false la garde ouverte.
// collant : ne se ferme pas d'un tap à côté (séance en cours).
function ouvrirDlg(html, onChoix, { collant = false } = {}) {
  if (dlg.open) dlg.close();
  dlg.dataset.collant = collant ? '1' : '';
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
dlg.addEventListener('click', e => {
  if ((e.target === dlg && !dlg.dataset.collant) || e.target.closest('[data-fermer]')) return dlg.close();
  const b = e.target.closest('button');
  if (!b) return;
  if (b.matches('[data-retirer]')) b.closest('[data-ligne]').remove();
  if (b.matches('[data-fait]')) {
    const on = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', on);
    if (on) lancerRepos();
  }
  if (b.matches('[data-ajout-serie]')) {
    const bloc = b.closest('.exo-bloc'), n = bloc.querySelectorAll('.serie').length;
    const derniere = bloc.querySelector('.serie:last-of-type');
    b.insertAdjacentHTML('beforebegin', serieHtml(exo(bloc.dataset.exo), derniere ? lireSerie(derniere) : {}, n + 1));
  }
  if (b.matches('[data-ajout-exo]')) $('#exos').insertAdjacentHTML('beforeend', blocExo($('#ajout-exo').value));
  if (b.matches('[data-ajout-ligne]')) $('#lignes').insertAdjacentHTML('beforeend', ligneExo({ exo: data.exos[0].id, series: 3, cible: '' }));
  if (b.matches('[data-passer]')) arreterRepos();
});
dlg.addEventListener('cancel', e => { if (dlg.dataset.collant) e.preventDefault(); });

const bienvenue = () => `<div class="card bientot"><b>Bienvenue</b>
  <p>Réponds à quelques questions et l’app se construit avec toi. Tu peux aussi importer un profil préparé à l’avance, ou partir d’un exemple.</p>
  <button class="btn plein" data-act="assistant">Construire mon app</button>
  <div class="rangee"><button class="btn gris" data-act="importer">Importer un profil</button><button class="btn gris" data-act="depart-exemple">Semaine d’exemple</button></div>
  <button class="btn gris" data-act="depart-vide">Partir de zéro</button></div>`;

// ---------- Aujourd'hui ----------

function vueAujourdhui() {
  const { date, h } = L.momentLogique(new Date());
  const st = L.stats(data, new Date());
  let html = `<header class="top"><div><h1>Aujourd’hui</h1><p>${date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p></div>
    ${actif('motivation') ? `<div class="chips"><button class="chip" data-act="ouvrir-profil" aria-label="Série de ${st.serie} jours">${FLAMME}${st.serie}</button><button class="chip" data-act="ouvrir-profil" aria-label="Niveau ${st.niveau.n}">Niv. ${st.niveau.n}</button></div>` : ''}</header>`;
  const jExport = joursDepuisExport();
  if (jExport === null || jExport > 7) {
    html += `<div class="card type alerte-export"><div class="txt"><b>${jExport === null ? 'Tes données n’ont jamais été exportées' : `Dernier export il y a ${jExport} jours`}</b><small>Elles ne sont que sur ce téléphone : exporte-les dans Fichiers.</small></div><button class="btn plein petit" data-act="exporter">Exporter</button></div>`;
  }
  if (!data.types.length) { $('#aujourdhui').innerHTML = html + bienvenue(); return; }

  // Hier pas validé : on le relit le lendemain (la veille ne compte dans l'essai que si elle a servi pendant la journée).
  const hier = L.ajouterJours(date, -1), semHier = data.semaines[cleSem(hier)];
  const slotsHier = semHier ? semHier.slots.filter(x => x.j === L.jourSemaine(hier)) : [];
  if (slotsHier.length && !L.journeeValidee(slotsHier)) {
    html += `<div class="card type"><div class="txt"><b>Hier n’est pas validé</b><small>${slotsHier.filter(x => !x.fait).length} créneaux à relire pour garder ta série</small></div><button class="btn gris petit" data-act="relecture" data-jour="${L.isoJour(hier)}">Valider hier</button></div>`;
  }
  if (actif('sport')) {
    const regle = L.regleCompetition(data.competitions, L.isoJour(date));
    const prochaine = data.competitions.filter(c => c.date >= L.isoJour(date)).sort((a, b) => a.date.localeCompare(b.date))[0];
    if (regle) html += `<div class="card type"><div class="txt"><b>${{ veille: 'Veille de compétition', jour: 'Jour de compétition', lendemain: 'Lendemain de compétition' }[regle.regle]} · ${esc(regle.competition.nom)}</b><small>${{ veille: 'Séance raccourcie de moitié, sans nouvel exercice.', jour: 'Pas de renfo aujourd’hui. Bonne compétition !', lendemain: 'Récupération (mobilité, étirements) ou repos.' }[regle.regle]}</small></div></div>`;
    else if (prochaine && L.joursAvant(prochaine.date, date) <= 30) html += `<div class="card type"><div class="txt"><b>${esc(prochaine.nom)}</b><small>${esc([prochaine.sport, prochaine.lieu].filter(Boolean).join(' · '))}</small></div><span class="pill">J-${L.joursAvant(prochaine.date, date)}</span></div>`;
  }
  const aBilan = bilanAFaire();
  if (aBilan) html += `<button class="card kv appel" data-act="bilan" data-cle="${aBilan}"><span class="txt"><b>C’est l’heure du bilan</b><small>Objectifs, tâches à reporter, heures de la semaine</small></span><span class="pill">+${L.XP.bilan} XP</span></button>`;
  if (actif('compagnon') && data.compagnon?.id) {
    const c = L.CREATURES.find(x => x.id === data.compagnon.id);
    if (c) html += `<button class="card compagnon-carte petit" data-act="ouvrir-profil">${compagnonFig(c, data.compagnon.stade || 0)}<span class="txt"><b>${esc(c.nom)}</b><small>Stade ${data.compagnon.stade || 0} sur 4</small></span></button>`;
  }

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
      ${enCours.cat === 'sport' && enCours.id && !enCours.club ? `<button class="btn petit" data-act="seance" data-slot="${enCours.id}" data-seance="${enCours.seance || ''}">Commencer la séance</button>` : ''}
      <div class="next">${ensuite}</div></div>`;
  } else {
    html += `<div class="now"><div class="now-label">Maintenant</div><div class="now-title">Créneau libre</div><div class="next">${ensuite}</div></div>`;
  }

  const passes = slots.filter(x => x.e <= h);
  html += `<div class="sec"><h2>La journée <span>${passes.length ? `${passes.filter(x => x.fait).length} validés sur ${passes.length} passés` : ''}</span></h2>`;
  // La journée en forme d'emploi du temps : la grille d'un seul jour, un bouton de validation sur chaque créneau passé.
  const [p0, p1] = data.plage;
  html += slots.length ? `<div class="wk seul jour-edt" style="--n:1;--rows:${(p1 - p0) * 2}"><div class="wk-body">
    <div class="wk-hours">${Array.from({ length: p1 - p0 - 1 }, (_, i) => `<span style="--s:${i + 1}">${(p0 + i + 1) % 24}</span>`).join('')}</div>
    <div class="wk-col">${slots.filter(x => x.e > p0 && x.s < p1).map(x => {
      const s = Math.max(x.s, p0), e = Math.min(x.e, p1), passe = x.e <= h, actuel = x.s <= h && h < x.e, liees = notesLiees(x.titre).length;
      const sous = [`${L.hhmm(x.s)} – ${L.hhmm(x.e)}`, infos(x), liees ? `${liees} note${liees > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ');
      return `<div class="blk${actuel ? ' actuel' : ''}${x.fait ? ' fait' : ''}" data-act="slot" data-id="${x.id}" style="${teinte(x.cat)};--s:${s - p0};--d:${e - s}">${esc(x.titre)}<small>${esc(sous)}</small>
        ${passe ? `<button class="valid" data-act="valider" data-id="${x.id}" aria-pressed="${!!x.fait}" aria-label="Valider ${esc(x.titre)}">${I.check}</button>` : ''}</div>`;
    }).join('')}${h >= p0 && h < p1 ? `<div class="nowline" style="--s:${h - p0}"></div>` : ''}</div></div></div>`
    : '<p class="vide">Rien de prévu aujourd’hui. Ajoute un créneau avec le bouton +.</p>';
  // Dès 20 h, la relecture : chaque créneau se coche un par un (ceux validés dans la journée arrivent cochés).
  const iso = L.isoJour(date), servi = L.utiliseEnJournee(data, iso);
  if (L.journeeValidee(slots)) {
    html += `<p class="vide">${servi ? `Journée validée, elle compte dans l’essai${actif('motivation') ? ` : +${L.XP.jour} XP de bonus` : ''}.` : 'Journée validée, mais elle ne compte pas dans l’essai : aucun créneau touché pendant la journée.'}</p>`;
  } else if (h >= 20 && slots.length) {
    html += `<button class="btn plein" data-act="relecture" data-jour="${iso}">Relire et valider la journée</button>`;
  } else if (slots.length) {
    html += `<p class="aide">Valide chaque créneau avec son bouton peu après sa fin${servi ? '' : ' : c’est ce qui fait compter la journée'}. La relecture de la journée ouvre à 20 h.</p>`;
  }
  html += '</div>';

  const af = L.aFaire(data.taches, date);
  if (actif('taches')) html += `<div class="sec"><h2>À faire <span>7 prochains jours</span></h2>${af.length ? `<ul class="list">${af.map(tacheHtml).join('')}</ul>` : '<p class="vide">Rien d’urgent. Ajoute des tâches avec le bouton +.</p>'}</div>`;
  if (data.habitudes.length && actif('habitudes')) {
    const iso = L.isoJour(date);
    if (actif('habitudes')) html += `<div class="sec"><h2>Habitudes</h2><div class="habits">${data.habitudes.map(hb => `<button class="habit" data-act="habitude" data-id="${hb.id}" data-jour="${iso}" aria-pressed="${hb.faits.includes(iso)}">${I.check}${esc(hb.nom)}${hb.freq === 'jour' ? '' : ` <small>${L.faitsSemaine(hb, L.lundiDe(date))}/${hb.freq}</small>`}</button>`).join('')}</div></div>`;
  }

  const os = objectifs('semaine', L.periode('semaine', date));
  if (actif('objectifs')) html += `<div class="sec"><h2>Objectifs de la semaine <span>${os.filter(o => o.fait).length} sur ${os.length}</span></h2>${os.length ? objectifsHtml('semaine', L.periode('semaine', date), false) : '<p class="vide">Aucun objectif cette semaine : ajoute-les dans Notes.</p>'}</div>`;
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
    <div class="champ" id="zone-sport" ${slot.cat === 'sport' ? '' : 'hidden'}>
      <label class="champ">Séance prévue<select name="seance"><option value="">Aucune</option>${data.seances.map(s => `<option value="${s.id}" ${s.id === slot.seance ? 'selected' : ''}>${esc(s.nom)}</option>`).join('')}</select></label>
      <label class="coche"><input type="checkbox" class="chk" name="club" ${slot.club ? 'checked' : ''}>Entraînement ou match du club</label>
    </div>
    <label class="champ" id="zone-travail" ${slot.cat === catTravail()?.id ? '' : 'hidden'}>Collègue<input name="collegue" value="${esc(slot.collegue)}" autocomplete="off"></label>
    ${slot.tache ? `<p class="muted">Tâche planifiée : valider ce créneau la coche.</p>` : ''}
    ${neuf ? '' : `<label class="coche"><input type="checkbox" class="chk" name="fait" ${slot.fait ? 'checked' : ''}>Réalisé comme prévu</label>`}
    ${type ? `<label class="coche"><input type="checkbox" class="chk" name="type" ${neuf && !slot.tache ? 'checked' : ''}>${neuf ? 'Répéter chaque semaine' : 'Modifier aussi la semaine type'} (${esc(type.nom)})</label>` : ''}
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
    if (slot.tache) c.tache = slot.tache;
    if (c.cat === 'sport') { c.seance = f.get('seance') || null; c.club = !!f.get('club'); }
    if (c.cat === catTravail()?.id) c.collegue = (f.get('collegue') || '').trim();
    if (c.fait && c.tache) { const t = data.taches.find(x => x.id === c.tache); if (t && !t.fait) cocherTache(t); }
    if (versType) {
      const { fait, tache, ...modele } = c;
      modele.id = c.src || L.uid();
      c.src = modele.id;
      delete modele.src;
      type.slots = L.placer(type.slots, modele);
    }
    // Ce qui a servi : ajouté, déplacé (jour ou heures), corrigé (le reste), décoché.
    if (neuf) noterUsage(slot.tache ? 'tache-planifiee' : 'creneau-ajout');
    if (neuf && slot.tache) noterUsage('creneau-ajout');
    if (!neuf && (c.j !== slot.j || c.s !== slot.s || c.e !== slot.e)) noterUsage('creneau-deplace');
    else if (!neuf && (c.cat !== slot.cat || c.titre !== slot.titre || c.salle !== (slot.salle || '') || c.affaires !== (slot.affaires || '') || c.notes !== (slot.notes || ''))) noterUsage('creneau-corrige');
    if (!neuf && slot.fait && !c.fait) noterUsage('creneau-decoche');
    sem.slots = L.placer(sem.slots, c);
    ui.derniereCat = c.cat;
    maj();
  });
  dlg.querySelectorAll('input[name="cat"]').forEach(r => r.addEventListener('change', () => { $('#zone-sport').hidden = r.value !== 'sport'; $('#zone-travail').hidden = r.value !== catTravail()?.id; }));
}

// Une tâche se planifie en créneau ; valider le créneau coche la tâche.
function planifier(t) {
  if (!data.types.length) return dire('Choisis d’abord comment commencer, dans Aujourd’hui.');
  const { date, h } = L.momentLogique(new Date());
  const s = Math.min(Math.max(Math.ceil(h * 2) / 2, data.plage[0]), data.plage[1] - 1);
  const slot = Object.assign(nouveauSlot(L.jourSemaine(date), s, s + 1), { titre: t.titre, tache: t.id });
  if (data.cats.some(c => c.id === 'travail')) slot.cat = 'travail';
  editerSlot(slot, cleSem(date));
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
  noterUsage('creneau-deplace');
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
  data.taches.filter(t => m(t.titre) || (t.sous || []).some(s => m(s.txt))).forEach(t => r.push(`<li data-act="editer-tache" data-id="${t.id}"><div class="txt"><b>${esc(t.titre)}</b><small>Tâche${t.fait ? ' faite' : ''}</small></div></li>`));
  data.projets.filter(p => m(p.nom) || m(p.etape) || m(p.notes)).forEach(p => r.push(`<li data-act="projet" data-id="${p.id}"><div class="txt"><b>${esc(p.nom)}</b><small>${p.type === 'projet' ? 'Projet' : 'Divertissement'} · ${STATUTS[p.statut]}</small></div></li>`));
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

  const ouvertes = data.taches.filter(t => !t.fait).sort((a, b) => (a.echeance || '9999').localeCompare(b.echeance || '9999') || (a.priorite || 2) - (b.priorite || 2));
  const faites = data.taches.filter(t => t.fait).sort((a, b) => (b.faitLe || '').localeCompare(a.faitLe || '')).slice(0, 20);
  if (actif('taches')) h += `<div class="sec"><h2>Tâches <span>${ouvertes.length} à faire</span></h2><ul class="list">${ouvertes.map(tacheHtml).join('')}</ul>
    <form class="ajout" data-form="tache"><input name="txt" placeholder="Nouvelle tâche" aria-label="Nouvelle tâche" autocomplete="off"><input type="date" name="date" aria-label="Échéance"><button aria-label="Ajouter">${I.plus}</button></form>
    ${faites.length ? `<details class="liste" data-id="faites" ${ui.ouvertes.has('faites') ? 'open' : ''}><summary>Faites récemment<span class="pill">${faites.length}</span></summary><ul class="list">${faites.map(tacheHtml).join('')}</ul></details>` : ''}</div>`;

  const carte = p => {
    const nt = data.taches.filter(t => t.projet === p.id && !t.fait).length;
    const sous = [p.etape && `Prochaine étape : ${p.etape}`, nt && `${nt} tâche${nt > 1 ? 's' : ''}`].filter(Boolean).join(' · ');
    return `<li data-act="projet" data-id="${p.id}" role="button" tabindex="0"><div class="txt"><b>${esc(p.nom)}</b><small>${esc(sous || 'Pas encore de prochaine étape')}</small></div><span class="pill statut-${p.statut}">${STATUTS[p.statut]}</span></li>`;
  };
  for (const [type, titre] of actif('projets') ? [['projet', 'Projets'], ['divertissement', 'Divertissements']] : []) {
    const ps = data.projets.filter(p => p.type === type && p.statut !== 'termine');
    h += `<div class="sec"><h2>${titre} <button class="btn gris petit" data-act="nouveau-projet" data-type="${type}">Nouveau</button></h2>${ps.length ? `<ul class="list">${ps.map(carte).join('')}</ul>` : `<p class="vide">Aucun ${type} en cours.</p>`}</div>`;
  }
  const termines = data.projets.filter(p => p.statut === 'termine');
  if (termines.length && actif('projets')) h += `<details class="liste" data-id="termines" ${ui.ouvertes.has('termines') ? 'open' : ''}><summary>Terminés<span class="pill">${termines.length}</span></summary><ul class="list">${termines.map(carte).join('')}</ul></details>`;

  if (actif('objectifs')) h += `<div class="sec"><h2>Objectifs de la semaine</h2>${os.length ? `<div class="card"><div class="goal-head"><b>${faits} sur ${os.length} atteints</b><span class="num">${Math.round(faits / os.length * 100)} %</span></div><div class="bar"><i style="width:${faits / os.length * 100}%"></i></div></div>` : ''}${objectifsHtml('semaine', pS, true)}</div>`;
  if (actif('objectifs')) h += `<div class="sec"><h2>Objectifs du mois <span>${now.toLocaleDateString('fr-FR', { month: 'long' })}</span></h2>${objectifsHtml('mois', pM, true)}</div>`;
  if (actif('objectifs')) h += `<div class="sec"><h2>Objectifs de l’année <span>${pA.replace('-', '–')}</span></h2>${objectifsHtml('annee', pA, true)}</div>`;
  if (actif('listes')) h += `<div class="sec"><h2>Listes <button class="btn gris petit" data-act="nouvelle-liste">Nouvelle liste</button></h2>${data.listes.filter(garde).map(listeHtml).join('')}</div>`;
  const notes = data.notes.filter(garde).sort((a, b) => (b.epingle ? 1 : 0) - (a.epingle ? 1 : 0) || (b.maj || 0) - (a.maj || 0));
  if (actif('notes')) h += `<div class="sec"><h2>Notes libres <button class="btn gris petit" data-act="nouvelle-note">Nouvelle note</button></h2>${notes.length ? `<div class="notes">${notes.map(noteHtml).join('')}</div>` : '<p class="vide">Aucune note pour l’instant.</p>'}</div>`;
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
    <label class="champ">Étiquettes, séparées par des virgules<input name="tags" value="${esc((v.tags || []).join(', '))}" placeholder="Fac, Perso…" autocomplete="off"></label>
    <label class="champ">Liée au créneau<input name="lien" list="titres" value="${esc(v.lien)}" placeholder="Titre du créneau, ex. Cours magistral" autocomplete="off"><datalist id="titres">${titres.map(t => `<option value="${esc(t)}">`).join('')}</datalist></label>
    <label class="coche"><input type="checkbox" class="chk" name="epingle" ${v.epingle ? 'checked' : ''}>Épinglée en haut</label>
    <div class="rangee">${neuf ? '' : '<button type="button" class="btn rouge" data-choix="suppr" data-confirmer="Confirmer">Supprimer</button>'}<button type="button" class="btn gris" data-fermer>Annuler</button><button class="btn plein">Enregistrer</button></div>
  </form>`, (choix, f) => {
    if (choix === 'suppr') { data.notes = data.notes.filter(x => x !== n); maj(); dire('Note supprimée'); return; }
    const champs = { titre: f.get('titre').trim(), texte: f.get('texte').trim(), couleur: f.get('couleur') || '', epingle: !!f.get('epingle'),
      tags: tagsDe(f.get('tags')), lien: f.get('lien').trim(), maj: Date.now() };
    if (!champs.titre && !champs.texte) { dire('La note est vide.'); return false; }
    if (neuf) data.notes.push({ id: L.uid(), ...champs }); else Object.assign(n, champs);
    noterUsage('notes');
    maj();
  });
}

const etapeHtml = (s, i) => `<label class="coche etape"><input type="checkbox" class="chk" name="sf" value="${i}" ${s.fait ? 'checked' : ''} aria-label="Étape faite"><input name="st" value="${esc(s.txt)}" aria-label="Étape (vide pour la retirer)" autocomplete="off"></label>`;

function editerTache(t, defaut = {}) {
  const neuf = !t;
  const v = t || { titre: '', echeance: '', priorite: 2, fac: false, recurrence: null, projet: null, sous: [], ...defaut };
  ouvrirDlg(`<form><h2>${neuf ? 'Nouvelle tâche' : 'Tâche'}</h2>
    <label class="champ">Titre<input name="titre" value="${esc(v.titre)}" autocomplete="off"></label>
    <div class="champs" style="grid-template-columns: 1fr 1fr">
      <label class="champ">Échéance<input type="date" name="echeance" value="${v.echeance || ''}"></label>
      <label class="champ">Répéter<select name="recurrence"><option value="">Non</option>${JOURS.map((n, j) => `<option value="${j}" ${v.recurrence === j ? 'selected' : ''}>Chaque ${n}</option>`).join('')}</select></label>
    </div>
    <div class="champ">Priorité${radios('priorite', { 1: 'Haute', 2: 'Normale', 3: 'Basse' }, v.priorite || 2)}</div>
    <label class="champ">Projet ou divertissement<select name="projet"><option value="">Aucun</option>${data.projets.filter(p => p.statut !== 'termine').map(p => `<option value="${p.id}" ${v.projet === p.id ? 'selected' : ''}>${esc(p.nom)}</option>`).join('')}</select></label>
    ${data.profil.etudes === false && !v.fac ? '' : `<label class="coche"><input type="checkbox" class="chk" name="fac" ${v.fac ? 'checked' : ''}>Rendu ou partiel de fac (compte à rebours)</label>`}
    ${actif('travail') ? `<label class="coche"><input type="checkbox" class="chk" name="travail" ${v.travail ? 'checked' : ''}>Tâche du travail</label>` : ''}
    <div class="champ">Étapes<div class="etapes">${(v.sous || []).map(etapeHtml).join('')}</div>
      <div class="ajout"><input data-nouvelle-etape placeholder="Nouvelle étape" aria-label="Nouvelle étape" autocomplete="off"><button type="button" data-ajout-etape aria-label="Ajouter l’étape">${I.plus}</button></div></div>
    <div class="rangee">${neuf ? '' : '<button type="button" class="btn rouge" data-choix="suppr" data-confirmer="Confirmer">Supprimer</button>'}<button type="button" class="btn gris" data-choix="planifier">Planifier un créneau</button></div>
    <div class="rangee"><button type="button" class="btn gris" data-fermer>Annuler</button><button class="btn plein">Enregistrer</button></div>
  </form>`, (choix, f) => {
    if (choix === 'suppr') { data.taches = data.taches.filter(x => x !== t); maj(); dire('Tâche supprimée'); return; }
    const faits = new Set(f.getAll('sf'));
    const champs = { titre: f.get('titre').trim(), echeance: f.get('echeance') || null, priorite: +f.get('priorite') || 2, fac: !!f.get('fac'), travail: !!f.get('travail'),
      recurrence: f.get('recurrence') === '' ? null : +f.get('recurrence'), projet: f.get('projet') || null,
      sous: f.getAll('st').map((txt, i) => ({ txt: txt.trim(), fait: faits.has(String(i)) })).filter(s => s.txt) };
    if (!champs.titre) { dire('Donne un titre à la tâche.'); return false; }
    if (champs.recurrence !== null && !champs.echeance) {
      let d = L.momentLogique(new Date()).date;
      while (L.jourSemaine(d) !== champs.recurrence) d = L.ajouterJours(d, 1);
      champs.echeance = L.isoJour(d);
    }
    let tache = t;
    if (neuf) { tache = { id: L.uid(), fait: false, ...champs }; data.taches.push(tache); } else Object.assign(t, champs);
    noterUsage('taches');
    maj();
    if (choix === 'planifier') { planifier(tache); return false; }
  });
  const zone = dlg.querySelector('.etapes'), champ = dlg.querySelector('[data-nouvelle-etape]');
  const ajouter = () => {
    if (!champ.value.trim()) return;
    zone.insertAdjacentHTML('beforeend', etapeHtml({ txt: champ.value.trim(), fait: false }, zone.children.length));
    champ.value = '';
    champ.focus();
  };
  dlg.querySelector('[data-ajout-etape]').addEventListener('click', ajouter);
  champ.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ajouter(); } });
}

function editerProjet(p, type = 'projet') {
  const neuf = !p;
  const v = p || { nom: '', type, statut: 'en-cours', etape: '', notes: '' };
  const taches = p ? data.taches.filter(t => t.projet === p.id && !t.fait) : [];
  ouvrirDlg(`<form><h2>${neuf ? (type === 'projet' ? 'Nouveau projet' : 'Nouveau divertissement') : esc(v.nom)}</h2>
    <label class="champ">Nom<input name="nom" value="${esc(v.nom)}" autocomplete="off"></label>
    <div class="champ">Type${radios('type', { projet: 'Projet', divertissement: 'Divertissement' }, v.type)}</div>
    <div class="champ">Statut${radios('statut', STATUTS, v.statut)}</div>
    <label class="champ">Prochaine étape<input name="etape" value="${esc(v.etape)}" autocomplete="off"></label>
    <label class="champ">Notes<textarea name="notes">${esc(v.notes)}</textarea></label>
    ${taches.length ? `<div class="champ">Tâches<div class="liens">${taches.map(t => `<button type="button" data-act="editer-tache" data-id="${t.id}">${esc(t.titre)}</button>`).join('')}</div></div>` : ''}
    ${neuf ? '' : `<div class="rangee"><button type="button" class="btn rouge" data-choix="suppr" data-confirmer="Confirmer">Supprimer</button><button type="button" class="btn gris" data-choix="monter">Monter dans la liste</button>${v.statut === 'termine' ? '' : '<button type="button" class="btn gris" data-choix="termine">Terminé !</button>'}</div>`}
    <div class="rangee"><button type="button" class="btn gris" data-fermer>Annuler</button><button class="btn plein">Enregistrer</button></div>
  </form>`, (choix, f) => {
    if (choix === 'suppr') {
      data.projets = data.projets.filter(x => x !== p);
      data.taches.forEach(t => { if (t.projet === p.id) t.projet = null; });
      maj(); dire('Supprimé'); return;
    }
    const champs = { nom: f.get('nom').trim(), type: f.get('type'), statut: choix === 'termine' ? 'termine' : f.get('statut'), etape: f.get('etape').trim(), notes: f.get('notes').trim() };
    if (!champs.nom) { dire('Donne-lui un nom.'); return false; }
    if (neuf) data.projets.push({ id: L.uid(), ...champs }); else Object.assign(p, champs);
    noterUsage('projets');
    if (choix === 'monter') {
      const i = data.projets.indexOf(p);
      const j = data.projets.slice(0, i).map(x => x.type === p.type && x.statut !== 'termine').lastIndexOf(true);
      if (j >= 0) [data.projets[j], data.projets[i]] = [data.projets[i], data.projets[j]];
    }
    if (choix === 'termine') { dire(`${champs.nom} : terminé, bravo !`); feter(); }
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

const UNITE = { reps: '', duree: ' s', distance: ' km', charge: ' reps' };
const cibleTxt = (e, c) => c === '' || c == null ? '—' : `${c}${UNITE[e.type]}`;
const FREQS = { jour: 'Chaque jour', 1: '1 fois par semaine', 2: '2 fois par semaine', 3: '3 fois par semaine', 4: '4 fois par semaine', 5: '5 fois par semaine', 6: '6 fois par semaine' };

function courbe(points, unite) {
  const W = 300, H = 128, g = 28, d = 10, haut = 8, bas = 104;
  const top = Math.ceil(Math.max(...points.map(p => p.val)) / 5) * 5 || 5;
  const X = i => points.length > 1 ? g + i * (W - g - d) / (points.length - 1) : (g + W - d) / 2;
  const Y = v => bas - v / top * (bas - haut);
  const date = iso => L.deIso(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const der = points.at(-1);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="De ${points[0].val} à ${der.val}${unite} en ${points.length} séances">
    ${[0, top / 2, top].map(v => `<line class="ch-grid" x1="${g}" x2="${W - d}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ch-lab" x="0" y="${Y(v) + 4}">${v}</text>`).join('')}
    <polyline class="ch-line" points="${points.map((p, i) => `${X(i)},${Y(p.val)}`).join(' ')}"/>
    <circle class="ch-end" cx="${X(points.length - 1)}" cy="${Y(der.val)}" r="5"/>
    <text class="ch-lab" x="${g}" y="${H - 4}">${date(points[0].date)}</text><text class="ch-lab" x="${W - d}" y="${H - 4}" text-anchor="end">${date(der.date)} : ${der.val}${unite}</text></svg>`;
}

function regulariteHtml(hb, lundi) {
  const debut = L.ajouterJours(lundi, -28), auj = L.isoJour(L.momentLogique(new Date()).date);
  return `<div class="reg">${Array.from({ length: 35 }, (_, i) => {
    const iso = L.isoJour(L.ajouterJours(debut, i));
    if (iso > auj) return '<i class="futur"></i>';
    const on = hb.faits.includes(iso);
    return `<button class="${on ? 'on' : ''}" data-act="habitude" data-id="${hb.id}" data-jour="${iso}" aria-pressed="${on}" aria-label="${L.deIso(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}"></button>`;
  }).join('')}</div>`;
}

function vueSport() {
  const { date, h } = L.momentLogique(new Date());
  const lundi = L.lundiDe(date), deLundi = L.isoJour(lundi), j = L.jourSemaine(date);
  const club = clubFaits();
  const nbPerso = data.journal.filter(e => e.date >= deLundi).length, nbClub = club.filter(c => c.date >= deLundi).length;
  const sem = data.types.length ? semaineDe(cleSem(date)) : null;
  const p = sem?.slots.filter(x => x.cat === 'sport' && (x.j > j || (x.j === j && x.e > h))).sort((a, b) => a.j - b.j || a.s - b.s)[0];
  const st = p && data.seances.find(s => s.id === p.seance);
  let html = `<header class="top"><div><h1>Sport</h1><p>${nbPerso + nbClub} séance${nbPerso + nbClub > 1 ? 's' : ''} cette semaine${nbClub ? `, dont ${nbClub} au club` : ''}</p></div></header>`;

  if (actif('sport')) html += `<div class="sec"><h2>Prochaine séance ${p ? `<span>${JOURS[p.j]} · ${L.hhmm(p.s)}</span>` : ''}</h2><div class="card seance">
    ${p ? `<b>${esc(p.titre)}${p.club ? ' · club' : ''}</b>` : '<p class="muted">Aucun créneau Sport à venir cette semaine.</p>'}
    ${st ? `<table>${st.exos.filter(x => exo(x.exo)).map(x => `<tr><td>${esc(exo(x.exo).nom)}</td><td>${x.series} × ${cibleTxt(exo(x.exo), x.cible)}</td></tr>`).join('')}</table>`
      : p && !p.club ? '<p class="muted">Pas de séance prévue sur ce créneau : touche-le dans Semaine pour en choisir une.</p>' : ''}
    <button class="btn plein" data-act="seance" data-seance="${st ? st.id : ''}" data-slot="${p && p.j === j ? p.id : ''}">${st ? 'Commencer cette séance' : 'Commencer une séance libre'}</button></div></div>`;

  if (actif('habitudes')) html += `<div class="sec"><h2>Habitudes</h2>${data.habitudes.length ? `<div class="regs">${data.habitudes.map(hb => `<div class="card"><button class="kv" data-act="editer-habitude" data-id="${hb.id}"><b>${esc(hb.nom)}</b><small class="muted">${hb.freq === 'jour' ? 'chaque jour' : `${L.faitsSemaine(hb, lundi)}/${hb.freq} cette sem.`}</small></button>${regulariteHtml(hb, lundi)}</div>`).join('')}</div>` : ''}
    <form class="ajout" data-form="habitude"><input name="txt" placeholder="Nouvelle habitude" aria-label="Nouvelle habitude" autocomplete="off"><select name="freq" aria-label="Fréquence">${Object.entries(FREQS).map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</select><button aria-label="Ajouter">${I.plus}</button></form></div>`;

  const avecProg = data.exos.filter(e => L.progression(data.journal, e.id, e.type).length);
  if (avecProg.length && actif('sport')) {
    if (!avecProg.some(e => e.id === ui.progExo)) ui.progExo = avecProg[0].id;
    const e = exo(ui.progExo), pts = L.progression(data.journal, e.id, e.type);
    html += `<div class="sec"><h2>Progression</h2><div class="card chart">
      <select class="choix" data-act="prog-exo" aria-label="Exercice">${avecProg.map(x => `<option value="${x.id}" ${x.id === e.id ? 'selected' : ''}>${esc(x.nom)}</option>`).join('')}</select>
      ${courbe(pts, UNITE[e.type] === ' reps' ? ' kg' : UNITE[e.type])}
      <div class="kv"><span>Record</span><span class="num">${Math.max(...pts.map(x => x.val))}${UNITE[e.type] === ' reps' ? ' kg' : UNITE[e.type]}</span></div></div></div>`;
  }

  const entrees = [...data.journal.map(e => ({ ...e, club: false })), ...club.map(c => ({ ...c, club: true }))].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  if (actif('sport')) html += `<div class="sec"><h2>Journal</h2>${entrees.length ? `<ul class="list">${entrees.map(e => {
    const quand = L.deIso(e.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
    const sous = e.club ? `Club · ${L.heures(e.duree)}` : `${e.series.length} exercice${e.series.length > 1 ? 's' : ''} · ${e.series.reduce((k, x) => k + x.sets.length, 0)} séries${e.ressenti ? ` · ressenti ${e.ressenti}/5` : ''}`;
    return `<li ${e.club ? '' : `data-act="journal" data-id="${e.id}" role="button" tabindex="0"`}><div class="txt"><b>${esc(e.nom)}</b><small>${esc(sous)}</small></div><span class="pill">${quand}</span></li>`;
  }).join('')}</ul>` : '<p class="vide">Tes séances terminées et tes entraînements du club validés s’afficheront ici.</p>'}</div>`;

  if (actif('sport')) html += `<div class="sec"><h2>Séances types <button class="btn gris petit" data-act="seance-type">Nouvelle</button></h2>${data.seances.length ? `<ul class="list">${data.seances.map(s => `<li data-act="seance-type" data-id="${s.id}" role="button" tabindex="0"><div class="txt"><b>${esc(s.nom)}</b><small>${s.exos.length} exercice${s.exos.length > 1 ? 's' : ''}</small></div></li>`).join('')}</ul>` : '<p class="vide">Une séance type, c’est une liste d’exercices avec les séries prévues.</p>'}</div>`;

  if (actif('sport')) html += `<div class="sec"><h2>Exercices</h2><ul class="list">${data.exos.map(e => `<li data-act="exo" data-id="${e.id}" role="button" tabindex="0"><div class="txt"><b>${esc(e.nom)}</b><small>${L.TYPES_EXO[e.type]}${e.notes ? ` · ${esc(e.notes)}` : ''}</small></div></li>`).join('')}</ul>
    <form class="ajout" data-form="exo"><input name="txt" placeholder="Nouvel exercice" aria-label="Nouvel exercice" autocomplete="off"><select name="type" aria-label="Type">${Object.entries(L.TYPES_EXO).map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</select><button aria-label="Ajouter">${I.plus}</button></form></div>`;

  const auj = L.isoJour(date), sports = sportsDuProfil();
  const avenir = data.competitions.filter(c => c.date >= auj).sort((a, b) => a.date.localeCompare(b.date));
  const passees = data.competitions.filter(c => c.date < auj).sort((a, b) => b.date.localeCompare(a.date));
  const compHtml = c => `<li data-act="competition" data-id="${c.id}" role="button" tabindex="0"><div class="txt"><b>${esc(c.nom)}</b><small>${[c.sport, c.lieu, c.categorie, c.resultat && `Résultat : ${c.resultat}`].filter(Boolean).map(esc).join(' · ')}</small></div><span class="pill${c.date < auj && !c.resultat ? ' retard' : ''}">${c.date >= auj ? `J-${L.joursAvant(c.date, date)}` : c.resultat ? L.deIso(c.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : 'Résultat ?'}</span></li>`;
  if (actif('sport')) html += `<div class="sec"><h2>Mes sports</h2><div class="card bientot">
    ${sports.length ? `<div class="cats">${sports.map(sp => `<span class="theme" style="--c:var(--ink)">${esc(sp)}<button class="x" data-act="retirer-sport" data-sport="${esc(sp)}" aria-label="Retirer ${esc(sp)}">${I.x}</button></span>`).join('')}</div>` : '<p>Choisis ton sport : l’app te propose ses exercices et des séances prêtes.</p>'}
    <form class="ajout" data-form="sport"><input name="txt" list="sports-suggestions" maxlength="40" placeholder="N’importe quel sport : escrime, judo…" aria-label="Ajouter un sport" autocomplete="off"><datalist id="sports-suggestions">${A.SPORTS.filter(x => !sports.includes(x)).map(x => `<option value="${x}">`).join('')}</datalist><button aria-label="Ajouter">${I.plus}</button></form>
    ${sports.map(sp => `<button class="btn gris" data-act="sport-depart" data-sport="${esc(sp)}">${L.conseilsPour(sp) ? `Ajouter les exercices et séances de ${esc(sp.toLowerCase())}` : `Séances de départ pour ${esc(sp.toLowerCase())} (gainage, récupération)`}</button>`).join('')}
    <p>Marque tes entraînements et tes matchs comme « club » dans leur créneau : validés, ils comptent dans le journal. Les exercices proposés sont du renforcement courant, à adapter avec ton coach.</p>
  </div></div>
  <div class="sec"><h2>Compétitions <button class="btn gris petit" data-act="competition">Nouvelle</button></h2>
    ${avenir.length || passees.length ? `<ul class="list">${[...avenir, ...passees.slice(0, 5)].map(compHtml).join('')}</ul>` : '<p class="vide">Ajoute tes matchs et tournois : compte à rebours sur Aujourd’hui, et une séance adaptée la veille.</p>'}
    <p class="aide">Veille : séance raccourcie de moitié, sans nouvel exercice. Jour J : pas de renfo. Lendemain : récupération ou repos. Des repères d’organisation, pas un conseil médical.</p></div>`;

  if (actif('sport')) html += `<div class="sec"><h2>Minuteur de repos</h2><div class="card reglage"><span class="txt">Entre deux séries</span><select data-act="repos" aria-label="Durée du repos">${[30, 45, 60, 90, 120, 180].map(s => `<option value="${s}" ${s === data.repos ? 'selected' : ''}>${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}</option>`).join('')}</select></div></div>`;
  $('#sport').innerHTML = html;
}

// ----- Séance en cours -----

const defautSerie = (type, c) => ({ reps: { reps: c }, duree: { sec: c }, distance: { km: c }, charge: { reps: c, kg: '' } })[type];
const lireSerie = r => Object.fromEntries([...r.querySelectorAll('[data-k]')].map(i => [i.dataset.k, +String(i.value).replace(',', '.') || 0]));
function serieHtml(e, s, n) {
  const champ = (k, unite) => `<label class="unite"><input type="text" inputmode="decimal" data-k="${k}" value="${s[k] ?? ''}" aria-label="${unite}, série ${n}">${unite}</label>`;
  const champs = { reps: champ('reps', 'reps'), duree: champ('sec', 's'), distance: champ('km', 'km'), charge: champ('kg', 'kg') + champ('reps', 'reps') }[e.type];
  return `<div class="serie"><span class="num">${n}</span>${champs}<button type="button" class="valid" data-fait aria-pressed="false" aria-label="Série ${n} faite">${I.check}</button></div>`;
}
function blocExo(id, n = 3, cible = '') {
  const e = exo(id), der = L.dernieresSeries(data.journal, id) || [];
  const series = Array.from({ length: Math.max(n, 1) }, (_, i) => serieHtml(e, der[i] || defautSerie(e.type, cible), i + 1)).join('');
  return `<div class="exo-bloc" data-exo="${id}"><div class="kv"><b>${esc(e.nom)}</b><small class="muted">${der.length ? 'valeurs de la dernière fois' : L.TYPES_EXO[e.type]}</small></div>${series}<button type="button" class="btn gris petit" data-ajout-serie>Ajouter une série</button></div>`;
}

let repos = null, audio = null;
function lancerRepos() {
  try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); } catch {}
  arreterRepos();
  const box = $('#repos'), t = $('#repos-t');
  if (!box) return;
  const fin = Date.now() + data.repos * 1000;
  box.hidden = false;
  const tic = () => {
    const r = Math.max(0, Math.ceil((fin - Date.now()) / 1e3));
    t.textContent = `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`;
    if (!r) { bip(); arreterRepos(); dire('Repos fini'); }
  };
  tic();
  repos = setInterval(tic, 250);
}
function son() {
  if (!data.son) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume();
    const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime;
    o.type = 'triangle';
    o.frequency.setValueAtTime(660, t); o.frequency.exponentialRampToValueAtTime(1320, t + .08);
    g.gain.setValueAtTime(.12, t); g.gain.exponentialRampToValueAtTime(.001, t + .16);
    o.connect(g).connect(audio.destination);
    o.start(t); o.stop(t + .17);
  } catch {}
}
function arreterRepos() { clearInterval(repos); repos = null; const b = $('#repos'); if (b) b.hidden = true; }
function bip() {
  if (!audio) return;
  [0, .3].forEach(d => {
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = 880; g.gain.value = .25;
    o.connect(g).connect(audio.destination);
    o.start(audio.currentTime + d); o.stop(audio.currentTime + d + .18);
  });
}

function commencerSeance(seanceId, slotId) {
  const regle = L.regleCompetition(data.competitions, aujIso());
  if (regle?.regle === 'jour') {
    return ouvrirDlg(`<form><h2>Jour de compétition</h2><p>${esc(regle.competition.nom)} aujourd’hui : pas de renfo. Garde tes forces pour la compétition.</p><p class="aide">Des repères d’organisation, pas un conseil médical.</p><button class="btn plein">Compris</button></form>`, () => {});
  }
  const st = data.seances.find(s => s.id === seanceId);
  const veille = regle?.regle === 'veille';
  const blocs = (st ? st.exos : []).filter(x => exo(x.exo)).map(x => veille ? { ...x, series: L.seriesVeille(x.series) } : x);
  const recup = data.seances.find(s => s.nom === 'Récupération');
  ouvrirDlg(`<form><h2>${esc(st ? st.nom : 'Séance libre')}</h2>
    <div class="repos" id="repos" hidden><span>Repos</span><b class="num" id="repos-t"></b><button type="button" class="btn petit" data-passer>Passer</button></div>
    ${veille ? `<p class="aide">Veille de compétition (${esc(regle.competition.nom)}) : séance raccourcie de moitié, sans nouvel exercice.</p>` : ''}
    ${regle?.regle === 'lendemain' && st?.nom !== 'Récupération' ? `<p class="aide">Lendemain de compétition : plutôt récupération (mobilité, étirements) ou repos.${recup ? '' : ' Ajoute les séances de départ de ton sport pour en avoir une prête.'}</p>` : ''}
    <div id="exos" class="pile">${blocs.map(b => blocExo(b.exo, b.series, b.cible)).join('')}</div>
    ${data.exos.length && !veille ? `<div class="ajout"><select id="ajout-exo" aria-label="Exercice à ajouter">${data.exos.map(e => `<option value="${e.id}">${esc(e.nom)}</option>`).join('')}</select><button type="button" data-ajout-exo aria-label="Ajouter l’exercice">${I.plus}</button></div>`
      : '<p class="muted">Ajoute des exercices dans l’onglet Sport pour les noter ici.</p>'}
    <p class="aide">Coche chaque série faite : le minuteur de repos démarre tout seul.</p>
    <div class="champ">Ressenti${radios('ressenti', { 1: '1', 2: '2', 3: '3', 4: '4', 5: '5' }, '')}</div>
    <label class="champ">Notes<textarea name="notes"></textarea></label>
    <div class="rangee"><button type="button" class="btn gris" data-choix="abandon" data-confirmer="Abandonner ?">Annuler</button><button class="btn plein">Terminer la séance</button></div>
  </form>`, (choix, f) => {
    arreterRepos();
    if (choix === 'abandon') return;
    const series = [...dlg.querySelectorAll('.exo-bloc')].map(b => ({ exo: b.dataset.exo,
      sets: [...b.querySelectorAll('.serie')].filter(r => r.querySelector('[data-fait]').getAttribute('aria-pressed') === 'true').map(lireSerie) })).filter(x => x.sets.length);
    if (!series.length) { dire('Coche au moins une série faite, ou annule.'); return false; }
    data.journal.push({ id: L.uid(), date: L.isoJour(L.momentLogique(new Date()).date), seance: st ? st.id : null, nom: st ? st.nom : 'Séance libre', slot: slotId || null,
      series, ressenti: +f.get('ressenti') || null, notes: f.get('notes').trim() });
    const r = slotId && trouverSlot(slotId);
    if (r) r.slot.fait = true;
    noterUsage('seances');
    dire('Séance enregistrée'); maj(); feter();
  }, { collant: true });
}

function editerCompetition(c) {
  const neuf = !c, v = c || { sport: sportsDuProfil()[0] || '', nom: '', date: '', lieu: '', categorie: '', resultat: '' };
  ouvrirDlg(`<form><h2>${neuf ? 'Nouvelle compétition' : esc(v.nom)}</h2>
    <label class="champ">Nom<input name="nom" value="${esc(v.nom)}" placeholder="Ex. Tournoi régional" autocomplete="off"></label>
    <div class="champs" style="grid-template-columns: 1fr 1fr"><label class="champ">Date<input type="date" name="date" value="${v.date || ''}"></label>
      <label class="champ">Sport<input name="sport" value="${esc(v.sport)}" list="sports-liste" autocomplete="off"><datalist id="sports-liste">${sportsDuProfil().map(x => `<option value="${esc(x)}">`).join('')}</datalist></label></div>
    <label class="champ">Lieu<input name="lieu" value="${esc(v.lieu)}" autocomplete="off"></label>
    <label class="champ">Catégorie<input name="categorie" value="${esc(v.categorie)}" placeholder="Ex. U21, poule B" autocomplete="off"></label>
    <label class="champ">Résultat (après coup)<input name="resultat" value="${esc(v.resultat)}" placeholder="Ex. 2e, victoire 3-1" autocomplete="off"></label>
    <div class="rangee">${neuf ? '' : '<button type="button" class="btn rouge" data-choix="suppr" data-confirmer="Confirmer">Supprimer</button>'}<button type="button" class="btn gris" data-fermer>Annuler</button><button class="btn plein">Enregistrer</button></div></form>`, (choix, f) => {
    if (choix === 'suppr') { data.competitions = data.competitions.filter(x => x !== c); maj(); return; }
    const champs = { nom: f.get('nom').trim(), date: f.get('date'), sport: f.get('sport').trim(), lieu: f.get('lieu').trim(), categorie: f.get('categorie').trim(), resultat: f.get('resultat').trim() };
    if (!champs.nom || !champs.date) { dire('Il faut au moins un nom et une date.'); return false; }
    if (neuf) data.competitions.push({ id: L.uid(), ...champs }); else Object.assign(c, champs);
    noterUsage('competitions');
    maj();
  });
}

function voirJournal(e) {
  ouvrirDlg(`<form><h2>${esc(e.nom)}</h2><p class="muted">${L.deIso(e.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}${e.ressenti ? ` · ressenti ${e.ressenti}/5` : ''}</p>
    <ul class="list">${e.series.map(x => { const ex = exo(x.exo); return `<li><div class="txt"><b>${esc(ex ? ex.nom : 'Exercice supprimé')}</b><small>${x.sets.map(s => ex && ex.type === 'charge' ? `${s.kg} kg × ${s.reps}` : `${L.valeur(ex ? ex.type : 'reps', s)}${ex ? UNITE[ex.type] : ''}`).join(' · ')}</small></div></li>`; }).join('')}</ul>
    ${e.notes ? `<p>${esc(e.notes)}</p>` : ''}
    <div class="rangee"><button type="button" class="btn rouge" data-choix="suppr" data-confirmer="Confirmer">Supprimer</button><button type="button" class="btn gris" data-fermer>Fermer</button></div></form>`,
  choix => { if (choix === 'suppr') { data.journal = data.journal.filter(x => x !== e); maj(); } });
}

function editerExo(e) {
  ouvrirDlg(`<form><h2>${esc(e.nom)}</h2>
    <label class="champ">Nom<input name="nom" value="${esc(e.nom)}" autocomplete="off"></label>
    <div class="champ">Ce qu’on note${radios('type', L.TYPES_EXO, e.type)}</div>
    <label class="champ">Notes<input name="notes" value="${esc(e.notes)}" placeholder="Consignes, réglage de la machine…" autocomplete="off"></label>
    <div class="rangee"><button type="button" class="btn rouge" data-choix="suppr" data-confirmer="Confirmer">Supprimer</button><button type="button" class="btn gris" data-fermer>Annuler</button><button class="btn plein">Enregistrer</button></div></form>`, (choix, f) => {
    if (choix === 'suppr') {
      data.exos = data.exos.filter(x => x !== e);
      data.seances.forEach(s => { s.exos = s.exos.filter(x => x.exo !== e.id); });
      maj(); return;
    }
    if (!f.get('nom').trim()) { dire('Donne un nom à l’exercice.'); return false; }
    Object.assign(e, { nom: f.get('nom').trim(), type: f.get('type'), notes: f.get('notes').trim() });
    maj();
  });
}

const ligneExo = x => `<div class="ligne-exo" data-ligne><select name="exo" aria-label="Exercice">${data.exos.map(e => `<option value="${e.id}" ${e.id === x.exo ? 'selected' : ''}>${esc(e.nom)}</option>`).join('')}</select>
  <input name="series" inputmode="numeric" value="${x.series}" aria-label="Séries"><input name="cible" inputmode="decimal" value="${x.cible ?? ''}" placeholder="cible" aria-label="Cible : répétitions, secondes, km"><button type="button" class="x" data-retirer aria-label="Retirer">${I.x}</button></div>`;
function editerSeanceType(s) {
  if (!data.exos.length) return dire('Ajoute d’abord des exercices, plus bas dans Sport.');
  const neuf = !s;
  ouvrirDlg(`<form><h2>${neuf ? 'Nouvelle séance type' : esc(s.nom)}</h2>
    <label class="champ">Nom<input name="nom" value="${esc(s?.nom)}" placeholder="Ex. Renfo haut du corps" autocomplete="off"></label>
    <div class="champ">Exercices · séries · cible<div id="lignes" class="pile">${(s ? s.exos : [{ exo: data.exos[0].id, series: 3, cible: '' }]).map(ligneExo).join('')}</div></div>
    <button type="button" class="btn gris" data-ajout-ligne>Ajouter un exercice</button>
    <div class="rangee">${neuf ? '' : '<button type="button" class="btn rouge" data-choix="suppr" data-confirmer="Confirmer">Supprimer</button>'}<button type="button" class="btn gris" data-fermer>Annuler</button><button class="btn plein">Enregistrer</button></div></form>`, (choix, f) => {
    if (choix === 'suppr') { data.seances = data.seances.filter(x => x !== s); maj(); return; }
    const nom = f.get('nom').trim();
    if (!nom) { dire('Donne un nom à la séance.'); return false; }
    const series = f.getAll('series'), cibles = f.getAll('cible');
    const exos = f.getAll('exo').map((exo, i) => ({ exo, series: Math.max(1, parseInt(series[i], 10) || 3), cible: cibles[i].trim() === '' ? '' : +cibles[i].replace(',', '.') || '' }));
    if (neuf) data.seances.push({ id: L.uid(), nom, exos }); else Object.assign(s, { nom, exos });
    maj();
  });
}

function editerHabitude(hb) {
  ouvrirDlg(`<form><h2>${esc(hb.nom)}</h2>
    <label class="champ">Nom<input name="nom" value="${esc(hb.nom)}" autocomplete="off"></label>
    <label class="champ">Fréquence<select name="freq">${Object.entries(FREQS).map(([v, n]) => `<option value="${v}" ${String(hb.freq) === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <p class="muted">${hb.faits.length} jour${hb.faits.length > 1 ? 's' : ''} tenu${hb.faits.length > 1 ? 's' : ''} en tout.</p>
    <div class="rangee"><button type="button" class="btn rouge" data-choix="suppr" data-confirmer="Confirmer">Supprimer</button><button type="button" class="btn gris" data-fermer>Annuler</button><button class="btn plein">Enregistrer</button></div></form>`, (choix, f) => {
    if (choix === 'suppr') { data.habitudes = data.habitudes.filter(x => x !== hb); maj(); return; }
    if (!f.get('nom').trim()) return false;
    hb.nom = f.get('nom').trim();
    hb.freq = f.get('freq') === 'jour' ? 'jour' : +f.get('freq');
    maj();
  });
}

const THEMES = [['classique', 'Classique', 1, ''], ['ardoise', 'Ardoise', 3, '#4A6FA5'], ['menthe', 'Menthe', 5, '#2FB46E'],
  ['lavande', 'Lavande', 7, '#8E7CF0'], ['corail', 'Corail', 9, '#F06A5B'], ['or', 'Or', 12, '#D9A520']];
function appliquerTheme() {
  const t = THEMES.find(x => x[0] === data.theme);
  if (t && t[3]) document.documentElement.style.setProperty('--teinte', t[3]); else document.documentElement.style.removeProperty('--teinte');
}
const SOURCES = { creneaux: ['Créneaux', '#35C6DF'], taches: ['Tâches', '#EC4A46'], sport: ['Sport', '#B5DF2B'],
  habitudes: ['Habitudes', '#FF8AC1'], objectifs: ['Objectifs et projets', '#6766F0'], bonus: ['Journées et bilans', '#FFD447'] };
const SUCCES = [
  ['Première journée validée', 'joursValides', 1], ['7 jours d’affilée', 'record', 7], ['30 jours d’affilée', 'record', 30],
  ['Première semaine complète', 'semainesCompletes', 1], ['10 séances de sport', 'seances', 10], ['50 séances de sport', 'seances', 50],
  ['10 tâches faites', 'taches', 10], ['100 tâches faites', 'taches', 100], ['Premier projet terminé', 'projets', 1],
  ['5 objectifs de semaine atteints', 'objSemaine', 5], ['Une habitude tenue 21 jours', 'habitudeMax', 21], ['4 bilans de la semaine', 'bilans', 4],
  ['10 entraînements du club', 'entrainements', 10], ['Première compétition', 'competitions', 1], ['Un record battu', 'records', 1],
];
const RARETE = { commune: 'Commune', rare: 'Rare', legendaire: 'Légendaire' };
const slug = t => String(t || '').toLowerCase().normalize('NFD').replace(/[^a-z]+/g, '-');
const creaHtml = (c, sport) => `<div class="crea forme-${c.forme} ${c.rarete}${sport ? ` acc acc-${slug(sport)}` : ''}" style="--c:${c.couleur}"${sport ? ` title="Version ${esc(sport)}"` : ''}><i></i></div>`;
const FLAMME = '<svg viewBox="0 0 24 24" fill="#EC4A46" aria-hidden="true"><path d="M12 22c-4 0-7-2.7-7-6.6 0-3.3 2.1-5.3 3.4-8.6.9 1.7 2 2.6 3.2 2.9-.3-2.7.9-5.2 3-7.2.3 3.7 4.4 6.4 4.4 11.1 0 4.6-3 8.4-7 8.4z"/></svg>';

// Le bilan est dû le dimanche dès 16 h, et encore le lundi et le mardi pour la semaine passée.
function bilanAFaire() {
  const { date, h } = L.momentLogique(new Date()), j = L.jourSemaine(date), cle = cleSem(date);
  const prec = L.isoJour(L.ajouterJours(L.lundiDe(date), -7));
  if (j === 6 && h >= 16 && !data.bilans[cle]) return cle;
  if (j <= 1 && data.semaines[prec]?.slots.length && !data.bilans[prec]) return prec;
  return null;
}

function vueProfil() {
  const st = L.stats(data, new Date()), nv = st.niveau;
  const sem = data.semaines[cleSem(new Date())];
  const prevu = L.heuresParCat(sem ? sem.slots : []), fait = L.heuresParCat(sem ? sem.slots.filter(x => x.fait) : []);
  const max = Math.max(1, ...Object.values(prevu));
  const droits = L.droitsTirage(data, st), possedes = new Set(data.collection.map(c => c.id));
  const prochainTheme = THEMES.find(t => t[2] > nv.n), aBilan = bilanAFaire();
  const sources = Object.entries(st.sources).filter(([, v]) => v);
  const obtenus = SUCCES.filter(([, k, c]) => st[k] >= c).length;
  const motivation = `<header class="top"><div><h1>Profil</h1><p>Niveau, collection et réglages</p></div></header>
    <div class="card niveau" data-module="motivation">
      <div class="kv"><span class="num big">Niveau ${nv.n}</span><span class="num">${st.total - nv.de} / ${nv.a - nv.de} XP</span></div>
      <div class="xp"><div style="width:${(st.total - nv.de) / (nv.a - nv.de) * 100}%">${sources.map(([k, v]) => `<i style="--c:${SOURCES[k][1]};flex:${v}"></i>`).join('')}</div></div>
      ${sources.length ? `<div class="xp-leg">${sources.map(([k, v]) => `<span><i style="--c:${SOURCES[k][1]}"></i>${SOURCES[k][0]} ${v}</span>`).join('')}</div>` : '<p class="muted">L’XP se gagne en validant tes créneaux, tes tâches, tes séances, tes habitudes et tes objectifs.</p>'}
      <small class="muted">${st.total} XP au total${prochainTheme ? ` · niveau ${prochainTheme[2]} : thème ${prochainTheme[1]}` : ''}</small></div>
    <div class="card serie" data-module="motivation">${FLAMME}<div><span class="num">${st.serie} jour${st.serie > 1 ? 's' : ''}</span><br><small class="muted">de journées validées · record ${st.record}</small></div><div class="jokers"><b>${st.jokers}</b>joker${st.jokers > 1 ? 's' : ''}</div></div>
    ${aBilan ? `<button class="card kv appel" data-act="bilan" data-cle="${aBilan}"><span class="txt"><b>C’est l’heure du bilan</b><small>Objectifs, tâches à reporter, heures de la semaine</small></span><span class="pill">+${L.XP.bilan} XP</span></button>` : ''}
    <div class="sec" data-module="motivation"><h2>Collection <span>${possedes.size} sur ${L.CREATURES.length}</span></h2>
      ${droits.length ? `<button class="btn plein" data-act="tirage">Ouvrir ${droits.length > 1 ? `tes ${droits.length} tirages` : 'ton tirage'}</button>` : ''}
      <div class="collec">${L.CREATURES.map(c => possedes.has(c.id) ? `<button class="fig" data-act="creature" data-id="${c.id}">${creaHtml(c, data.collection.find(x => x.id === c.id).sport)}<span>${esc(c.nom)}</span></button>` : '<div class="fig"><div class="crea lock">?</div><span>À gagner</span></div>').join('')}</div>
      <p class="aide">Un tirage à chaque niveau, à chaque tâche importante ou de fac faite, à chaque projet terminé, et pour chaque semaine avec au moins 5 journées validées.</p></div>
    <div class="sec" data-module="motivation"><h2>Succès <span>${obtenus} sur ${SUCCES.length}</span></h2><ul class="list">${SUCCES.map(([nom, k, cible]) => {
      const ok = st[k] >= cible;
      return `<li><span class="medal${ok ? '' : ' en-cours'}">${ok ? I.check : `${st[k]}/${cible}`}</span><div class="txt"><b>${nom}</b>${ok ? '<small>Obtenu</small>' : ''}</div></li>`;
    }).join('')}</ul></div>
    <div class="sec"><h2>Cette semaine <span>réalisé / prévu</span></h2>${Object.keys(prevu).length ? `<div class="card"><ul class="stats">${Object.entries(prevu).sort((a, b) => b[1] - a[1]).map(([c, v]) =>
      `<li><span>${esc(cat(c).nom)}</span><span class="track duo" style="${teinte(c)}"><i style="width:${v / max * 100}%"></i><i style="width:${(fait[c] || 0) / max * 100}%"></i></span><b>${L.heures(fait[c] || 0)}<small> / ${L.heures(v)}</small></b></li>`).join('')}</ul></div>` : '<p class="vide">Aucun créneau cette semaine.</p>'}
      <button class="btn gris" data-act="bilan">Faire le bilan de la semaine</button></div>
    ${travailHtml()}
    ${statsHtml()}
    ${compagnonHtml(st)}
    <div class="sec" data-module="motivation"><h2>Thème</h2><div class="cats">${THEMES.map(([id, nom, n, c]) => n > nv.n ? `<span class="theme verrou">${nom} · niv. ${n}</span>`
      : `<button class="theme" data-act="theme" data-id="${id}" aria-pressed="${data.theme === id}" style="--c:${c || 'var(--ink)'}">${nom}</button>`).join('')}</div>
      <label class="coche"><input type="checkbox" class="chk" data-act="son" ${data.son ? 'checked' : ''}>Petit son quand je coche quelque chose</label></div>`;
  const jours = data.dernierExport ? Math.floor((Date.now() - new Date(data.dernierExport)) / 864e5) : null;
  const etat = jours === null ? 'Jamais exportée' : jours === 0 ? 'Exportée aujourd’hui' : `Dernier export il y a ${jours} jour${jours > 1 ? 's' : ''}`;
  const defaut = data.typeDefaut || data.types[0]?.id;
  const opt = (vals, sel) => vals.map(x => `<option value="${x}" ${x === sel ? 'selected' : ''}>${L.hhmm(x)}</option>`).join('');
  $('#profil').innerHTML = `${motivation}
    <div class="sec"><h2>Sauvegarde</h2><div class="card bientot">
      <b class="${jours === null || jours > 7 ? 'alerte' : ''}">${etat}</b>
      <p>Tes données ne sont que sur ce téléphone, et iOS peut les effacer s’il manque de place. Exporte-les chaque semaine dans Fichiers (iCloud Drive).</p>
      <div class="rangee"><button class="btn plein" data-act="exporter">Exporter</button><button class="btn gris" data-act="importer">Importer</button></div>
      ${avantImport() ? '<button class="btn gris" data-act="revenir-avant">Revenir à avant l’import</button>' : ''}
      <button class="btn rouge" data-act="tout-effacer">Effacer toutes mes données</button>
      <p><a href="confidentialite.html">Confidentialité et mentions légales</a></p></div></div>
    <div class="sec"><h2>Ton profil</h2><div class="card bientot">
      <b>${esc(data.profil.prenom || 'Sans prénom')}</b>
      <p>${[data.profil.etudes !== false && 'Études', data.profil.travail && 'Travail', ...(data.profil.sports || [])].filter(Boolean).map(esc).join(' · ') || 'Rien de renseigné'}</p>
      <div class="rangee"><button class="btn gris" data-act="assistant">Refaire le questionnaire</button><button class="btn gris" data-act="tutoriel">Revoir le tutoriel</button></div>
      <button class="btn gris" data-act="avis">Donner mon avis</button>
      <p>Pour un ami : envoie-lui le lien <b>emmajeuch.github.io/app-organisation/questionnaire.html</b> ; il répond et repart avec son fichier de profil.</p></div></div>
    <div class="sec"><h2>Catégories</h2>
      <ul class="list">${data.cats.map(c => `<li class="reglage"><input type="color" value="${L.couleurSure(c.couleur)}" data-act="cat-couleur" data-id="${c.id}" aria-label="Couleur de ${esc(c.nom)}"><input type="text" value="${esc(c.nom)}" data-act="cat-nom" data-id="${c.id}" aria-label="Nom de la catégorie"><button class="x" data-act="suppr-cat" data-id="${c.id}" aria-label="Supprimer ${esc(c.nom)}">${I.x}</button></li>`).join('')}</ul>
      <form class="ajout" data-form="cat"><input name="nom" placeholder="Nouvelle catégorie" aria-label="Nouvelle catégorie" autocomplete="off"><button aria-label="Ajouter">${I.plus}</button></form></div>
    <div class="sec"><h2>Plage horaire de la semaine</h2><div class="card reglage"><span>De</span><select data-act="plage" data-i="0" aria-label="Début">${opt([5, 6, 7, 8, 9], data.plage[0])}</select><span>à</span><select data-act="plage" data-i="1" aria-label="Fin">${opt([22, 23, 24, 25], data.plage[1])}</select></div></div>
    <div class="sec"><h2>Semaines types</h2>
      <ul class="list">${data.types.map(t => `<li class="reglage"><input type="text" value="${esc(t.nom)}" data-act="type-nom" data-id="${t.id}" aria-label="Nom de la semaine type"><button class="btn ${t.id === defaut ? 'plein' : 'gris'} petit" data-act="type-defaut" data-id="${t.id}" aria-pressed="${t.id === defaut}">Par défaut</button><button class="x" data-act="suppr-type" data-id="${t.id}" aria-label="Supprimer ${esc(t.nom)}">${I.x}</button></li>`).join('')}</ul>
      <p class="aide">La semaine type par défaut remplit chaque nouvelle semaine. Pour en créer une : Semaine › Modifier.</p></div>
    <div class="sec"><h2>Modules</h2><ul class="list">${MODULES.map(([id, nom]) => `<li><label class="coche" style="flex:1"><input type="checkbox" class="chk" data-act="module" data-id="${id}" ${actif(id) ? 'checked' : ''}>${nom}</label></li>`).join('')}</ul>
      <p class="aide">Un module masqué disparaît de l’app, mais ses données restent là : le réactiver les fait revenir.</p></div>
    <p class="aide version">App d’organisation · version ${L.VERSION}</p>`;
  $('#profil').querySelectorAll('[data-module]').forEach(e => { e.hidden = !actif(e.dataset.module); });
  appliquerTheme();
}

// Statistiques : lecture seule, calculées jour par jour sur les créneaux, jusqu'à aujourd'hui.
function statsHtml() {
  if (!actif('stats')) return '';
  const now = new Date(), y = now.getFullYear(), lundi = L.lundiDe(now);
  const per = { semaine: [lundi, L.ajouterJours(lundi, 6), 'Cette semaine'], mois: [new Date(y, now.getMonth(), 1), new Date(y, now.getMonth() + 1, 0), now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })], annee: [new Date(y, 0, 1), new Date(y, 11, 31), String(y)] }[ui.statsPer];
  const { prevu, fait } = L.heuresPeriode(data, per[0], per[1], now);
  const max = Math.max(1, ...Object.values(prevu)), totP = Object.values(prevu).reduce((a, b) => a + b, 0), totF = Object.values(fait).reduce((a, b) => a + b, 0);
  return `<div class="sec"><h2>Statistiques <span>${per[2]}</span></h2>
    <div class="tags">${[['semaine', 'Semaine'], ['mois', 'Mois'], ['annee', 'Année']].map(([k, n]) => `<button data-act="stats-per" data-id="${k}" aria-pressed="${ui.statsPer === k}">${n}</button>`).join('')}</div>
    ${totP ? `<div class="card"><div class="kv" style="margin-bottom:12px"><b>${L.heures(totF)} réalisées</b><span class="muted">sur ${L.heures(totP)} prévues, jusqu’à aujourd’hui</span></div>
      <ul class="stats">${Object.entries(prevu).sort((a, b) => b[1] - a[1]).map(([c, v]) => `<li><span>${esc(cat(c).nom)}</span><span class="track duo" style="${teinte(c)}"><i style="width:${v / max * 100}%"></i><i style="width:${(fait[c] || 0) / max * 100}%"></i></span><b>${L.heures(fait[c] || 0)}<small> / ${L.heures(v)}</small></b></li>`).join('')}</ul></div>`
      : '<p class="vide">Pas encore de créneau sur cette période.</p>'}</div>`;
}

// Compagnon : choisi parmi les créatures gagnées dans la collection ; il grandit avec les journées validées et ne régresse jamais.
const TAILLES = ['54%', '66%', '78%', '90%', '100%'];
const compagnonFig = (c, stade) => `<div class="compagnon stade-${stade}" style="--taille:${TAILLES[stade]}">${creaHtml(c, data.collection.find(x => x.id === c.id)?.sport)}</div>`;
function compagnonHtml(st) {
  if (!actif('compagnon')) return '';
  if (!data.compagnon?.id) {
    const gagnees = L.CREATURES.filter(c => data.collection.some(x => x.id === c.id));
    return `<div class="sec"><h2>Compagnon</h2><div class="card bientot"><p>Ton compagnon se gagne dans la collection : choisis une de tes créatures. Elle grandit à chaque journée validée (1, 5, 10 et 20) et ne rapetisse jamais, même si ta série casse.</p>
    ${gagnees.length ? `<div class="collec">${gagnees.map(c => `<button class="fig" data-act="choisir-compagnon" data-id="${c.id}">${creaHtml(c, data.collection.find(x => x.id === c.id).sport)}<span>${esc(c.nom)}</span></button>`).join('')}</div>`
      : '<p class="muted">Tu n’as pas encore de créature : ton premier tirage arrive au niveau 2, ou avec une tâche importante faite.</p>'}</div></div>`;
  }
  const c = L.CREATURES.find(x => x.id === data.compagnon.id), stade = data.compagnon.stade || 0, suivant = L.prochainSeuil(st.joursValides);
  return `<div class="sec"><h2>Compagnon <span>stade ${stade} sur 4</span></h2><div class="card compagnon-carte">
    ${compagnonFig(c, stade)}<div class="txt"><b>${esc(c.nom)}</b><small>${st.joursValides} journée${st.joursValides > 1 ? 's' : ''} validée${st.joursValides > 1 ? 's' : ''} en tout${suivant ? ` · il grandit à ${suivant}` : ' · stade maximal'}</small></div></div></div>`;
}

function travailHtml() {
  const c = actif('travail') && catTravail();
  if (!c) return '';
  const now = new Date(), lundi = L.lundiDe(now);
  const sem = L.heuresPeriode(data, lundi, L.ajouterJours(lundi, 6), L.ajouterJours(lundi, 6));
  const mois = L.heuresPeriode(data, new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 0), new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const fait = (p, k) => L.heures(p[k][c.id] || 0);
  const paie = h => data.taux ? ` · environ ${Math.round(h * data.taux)} €` : '';
  return `<div class="sec"><h2>Travail <span>réalisé / prévu</span></h2><div class="card bientot">
    <div class="kv"><span>Cette semaine</span><b>${fait(sem, 'fait')} / ${fait(sem, 'prevu')}${paie(sem.fait[c.id] || 0)}</b></div>
    <div class="kv"><span>Ce mois-ci</span><b>${fait(mois, 'fait')} / ${fait(mois, 'prevu')}${paie(mois.fait[c.id] || 0)}</b></div>
    <label class="champ">Taux horaire en €, pour estimer la paie<input data-act="taux" inputmode="decimal" value="${data.taux || ''}" autocomplete="off"></label>
    <p>Une estimation : heures validées × taux horaire, pas une fiche de paie.</p></div></div>`;
}
const RAISON = k => { const [type, v] = k.split(':'); return { niveau: `Niveau ${v} atteint`, tache: 'Tâche importante faite', projet: 'Projet terminé', semaine: 'Semaine réussie', seances: `${v} séances de sport`, competition: 'Compétition notée' }[type]; };
// Le tirage est enregistré avant d'être montré : fermer la fenêtre ne permet pas de retirer.
function ouvrirTirage() {
  const droits = L.droitsTirage(data, L.stats(data, new Date()));
  if (!droits.length) return;
  const [type, v] = droits[0].split(':');
  const sport = type === 'competition' ? data.competitions.find(x => x.id === v)?.sport || sportsDuProfil()[0] : type === 'seances' ? sportsDuProfil()[0] : undefined;
  const c = L.tirer(data.collection.filter(x => !sport || x.sport).map(x => x.id));
  const deja = data.collection.find(x => x.id === c.id);
  // Une créature déjà là gagne la version du sport ; sinon le doublon vaut 50 XP.
  const doublon = deja && (!sport || deja.sport);
  data.tirages.push(droits[0]);
  if (doublon) data.bonusXp += 50;
  else if (deja) deja.sport = sport;
  else data.collection.push({ id: c.id, date: L.isoJour(new Date()), raison: droits[0], ...(sport ? { sport } : {}) });
  maj();
  ouvrirDlg(`<form class="tirage"><h2>${esc(RAISON(droits[0]))}</h2><div class="revele">${creaHtml(c, doublon ? undefined : sport)}</div>
    <b class="nom">${esc(c.nom)}${sport && !doublon ? ` · version ${esc(sport.toLowerCase())}` : ''}</b><span class="pill ${c.rarete}">${RARETE[c.rarete]}</span>
    <p class="muted">${doublon ? 'Déjà dans ta collection : +50 XP à la place.' : 'Nouvelle venue dans ta collection !'}</p>
    <div class="rangee">${droits.length > 1 ? `<button type="button" class="btn gris" data-choix="encore">Tirage suivant (${droits.length - 1})</button>` : ''}<button class="btn plein">Super</button></div></form>`,
  choix => { if (choix === 'encore') { ouvrirTirage(); return false; } });
  feter();
}
function voirCreature(c) {
  const g = data.collection.find(x => x.id === c.id);
  ouvrirDlg(`<form class="tirage"><h2>${esc(c.nom)}</h2><div class="revele">${creaHtml(c)}</div><span class="pill ${c.rarete}">${RARETE[c.rarete]}</span>
    <p class="muted">Gagnée le ${L.deIso(g.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} · ${esc(RAISON(g.raison))}</p>
    ${actif('compagnon') && data.compagnon?.id !== c.id ? `<button type="button" class="btn gris" data-choix="compagnon">En faire mon compagnon</button>` : ''}
    <button class="btn plein">Fermer</button></form>`, choix => {
    if (choix !== 'compagnon') return;
    data.compagnon = L.grandir({ id: c.id, stade: data.compagnon?.stade || 0 }, L.stats(data, new Date()).joursValides);
    noterUsage('compagnon');
    dire(`${c.nom} est ton compagnon`);
    maj();
  });
}

// Ce que le bilan relève, module par module (V1.3.1).
const SERVI = [['creneau-ajout', 'Créneaux ajoutés'], ['creneau-deplace', 'Créneaux déplacés'], ['creneau-corrige', 'Créneaux corrigés'],
  ['creneau-decoche', 'Créneaux décochés'], ['creneau-valide', 'Créneaux validés dans la journée'], ['tache-planifiee', 'Tâches planifiées'],
  ['taches', 'Tâches'], ['projets', 'Projets et divertissements'], ['objectifs', 'Objectifs'], ['listes', 'Listes'], ['notes', 'Notes libres'],
  ['seances', 'Séances de sport'], ['sport', 'Exercices ajoutés'], ['habitudes', 'Habitudes']];
function faireBilan(cle) {
  cle = cle || bilanAFaire() || cleSem(L.momentLogique(new Date()).date);
  const lundi = L.deIso(cle), fin = L.isoJour(L.ajouterJours(lundi, 6)), suiv = L.isoJour(L.ajouterJours(lundi, 7));
  const sem = semaineDe(cle), prec = data.semaines[L.isoJour(L.ajouterJours(lundi, -7))];
  const st = L.stats(data, new Date());
  const dans = d => d >= cle && d <= fin;
  const objs = objectifs('semaine', cle), atteints = objs.filter(o => o.fait).length;
  const restes = data.taches.filter(t => !t.fait && t.echeance && t.echeance <= fin);
  const prevu = L.heuresParCat(sem.slots), fait = L.heuresParCat(sem.slots.filter(x => x.fait)), avant = L.heuresParCat((prec?.slots || []).filter(x => x.fait));
  const comptent = L.joursQuiComptent(data, cle, st.valides).length, usage = L.usageSemaine(data, cle), b = data.bilans[cle] || {};
  const chiffres = [
    [comptent + '/7', 'journées qui comptent dans l’essai'],
    [[0, 1, 2, 3, 4, 5, 6].filter(j => st.valides.has(L.isoJour(L.ajouterJours(lundi, j)))).length + '/7', 'journées validées'],
    [data.journal.filter(e => dans(e.date)).length + clubFaits().filter(e => dans(e.date)).length, 'séances de sport'],
    [data.taches.reduce((k, t) => k + (t.faits || []).filter(dans).length, 0), 'tâches faites'],
    [data.habitudes.reduce((k, hb) => k + hb.faits.filter(dans).length, 0), 'habitudes tenues'],
  ];
  const ecart = c => { if (!prec) return ''; const d = (fait[c] || 0) - (avant[c] || 0); return d > 0 ? `+${L.heures(d)}` : d < 0 ? `−${L.heures(-d)}` : '='; };
  const f = d => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  const reporter = (nom, id) => `<label class="coche petite"><input type="checkbox" class="chk" name="${nom}" value="${id}" checked>Reporter</label>`;
  ouvrirDlg(`<form><h2>Bilan de la semaine</h2><p class="muted">Du ${f(lundi)} au ${f(L.deIso(fin))}</p>
    <div class="chiffres">${chiffres.map(([n, t]) => `<div><span class="num">${n}</span><small>${t}</small></div>`).join('')}</div>
    <div class="champ">Objectifs : ${atteints} sur ${objs.length} atteints${objs.length ? `<ul class="list">${objs.map(o => `<li><div class="txt"><b>${o.fait ? '✓ ' : ''}${esc(o.txt)}</b></div>${o.fait ? '' : reporter('obj', o.id)}</li>`).join('')}</ul>` : ''}</div>
    <div class="champ">Tâches pas faites${restes.length ? `<ul class="list">${restes.map(t => `<li><div class="txt"><b>${esc(t.titre)}</b><small>prévue le ${f(L.deIso(t.echeance))}</small></div>${reporter('tache', t.id)}</li>`).join('')}</ul>` : '<p class="muted" style="font-weight:400">Aucune, bravo.</p>'}</div>
    <div class="champ">Heures réalisées${prec ? ', et l’écart avec la semaine d’avant' : ''}
      <table class="bilan-t"><tr><th>Catégorie</th><th>Réalisé</th><th>Prévu</th>${prec ? '<th>Écart</th>' : ''}</tr>
      ${Object.entries(prevu).sort((a, b) => b[1] - a[1]).map(([c, v]) => `<tr><td><span class="dot" style="${teinte(c)}"></span>${esc(cat(c).nom)}</td><td>${L.heures(fait[c] || 0)}</td><td>${L.heures(v)}</td>${prec ? `<td>${ecart(c)}</td>` : ''}</tr>`).join('')}</table></div>
    <div class="champ">Ce qui a servi cette semaine
      <table class="bilan-t">${SERVI.map(([k, nom]) => `<tr><td>${nom}</td><td>${usage[k] || 0}</td></tr>`).join('')}</table></div>
    <div class="champ">Suivi ailleurs cette semaine (papier, Calendrier, autre app)
      <select name="ailleurs">${[0, 1, 2, 3, 4, 5, 6, 7].map(n => `<option value="${n}" ${(b.ailleurs || 0) === n ? 'selected' : ''}>${n} jour${n > 1 ? 's' : ''}</option>`).join('')}</select>
      <input name="ailleursNote" value="${esc(b.ailleursNote)}" placeholder="Quoi, et pourquoi pas dans l’app ?" autocomplete="off"></div>
    <p class="aide">Ce qui reste coché « Reporter » passe à la semaine suivante.</p>
    <div class="rangee"><button type="button" class="btn gris" data-fermer>Plus tard</button><button class="btn plein">${data.bilans[cle] ? 'Mettre à jour' : 'Clore le bilan'}</button></div></form>`, (choix, fd) => {
    const objIds = new Set(fd.getAll('obj')), tIds = new Set(fd.getAll('tache'));
    objs.filter(o => objIds.has(o.id) && !objectifs('semaine', suiv).some(x => x.txt === o.txt))
      .forEach(o => data.objectifs.push({ ...o, id: L.uid(), periode: suiv, fait: false }));
    restes.filter(t => tIds.has(t.id)).forEach(t => {
      let d = L.deIso(t.echeance);
      while (L.isoJour(d) <= fin) d = L.ajouterJours(d, 7);
      t.echeance = L.isoJour(d);
    });
    const premier = !data.bilans[cle], n = objIds.size + tIds.size;
    data.bilans[cle] = { date: L.isoJour(new Date()), ailleurs: +fd.get('ailleurs') || 0, ailleursNote: fd.get('ailleursNote').trim(), comptent, validees: chiffres[1][0], usage };
    dire(`Bilan clos${n ? ` · ${n} reporté${n > 1 ? 's' : ''}` : ''}`);
    maj();
    if (premier) feter();
  });
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

// Import contrôlé : un profil s'ajoute, une sauvegarde remplace ; dans les deux cas on montre d'abord
// ce qui va changer, et on garde une copie des données d'avant (Profil › Revenir à avant l'import).
const CLE_AVANT = KEY + '-avant-import';
function garderAvant() { try { localStorage.setItem(CLE_AVANT, JSON.stringify({ quand: new Date().toISOString(), data })); } catch {} }
function avantImport() { try { return JSON.parse(localStorage.getItem(CLE_AVANT)); } catch { return null; } }

function proposerProfil(p, titre = 'Importer ce profil ?') {
  const essai = structuredClone(data), lignes = L.appliquerProfil(essai, p);
  if (!lignes.length) return dire('Ce profil n’ajoute rien de nouveau.');
  ouvrirDlg(`<form><h2>${esc(titre)}</h2><p class="muted">Ce qui va être ajouté (rien n’est effacé) :</p>
    <ul class="list">${lignes.map(l => `<li><div class="txt"><b>${esc(l)}</b></div></li>`).join('')}</ul>
    <div class="rangee"><button type="button" class="btn gris" data-fermer>Annuler</button><button class="btn plein">Ajouter</button></div></form>`, () => {
    garderAvant();
    L.appliquerProfil(data, p);
    noterUsage('profil');
    maj(); dire('Profil ajouté'); feter();
  });
}

$('#fichier').addEventListener('change', async e => {
  const fichier = e.target.files[0];
  e.target.value = '';
  if (!fichier) return;
  if (fichier.size > L.TAILLE_MAX) return dire('Ce fichier est trop gros pour être une sauvegarde de l’app.');
  let o;
  try { o = JSON.parse(await fichier.text()); } catch { return dire('Ce fichier est illisible.'); }
  if (o && o.format === 'orga-profil') {
    try { return proposerProfil(L.lireProfil(o)); } catch (err) { return dire(err.message); }
  }
  try { o = L.validerImport(o); } catch (err) { return dire(err.message); }
  const nb = Object.values(o.semaines).reduce((k, x) => k + x.slots.length, 0);
  ouvrirDlg(`<form><h2>Remplacer par cette sauvegarde ?</h2>
    <p class="muted">Sauvegarde${o.dernierExport ? ` du ${new Date(o.dernierExport).toLocaleDateString('fr-FR')}` : ''} : ${nb} créneaux, ${o.taches.length} tâches, ${o.notes.length} notes, ${o.journal.length} séances.
    Elle remplace les données actuelles, qui restent récupérables dans Profil › Revenir à avant l’import.</p>
    <div class="rangee"><button type="button" class="btn gris" data-fermer>Annuler</button><button class="btn plein">Remplacer</button></div></form>`,
  () => { garderAvant(); data = o; maj(); dire('Sauvegarde importée'); });
});

// Droit à l'effacement : tout ce que l'app garde sur ce téléphone disparaît (données, copies, cache).
function toutEffacer() {
  ouvrirDlg(`<form><h2>Effacer toutes tes données ?</h2>
    <p class="muted">Ton emploi du temps, tes tâches, tes notes, ton sport, ta progression et la copie d’avant import seront effacés de ce téléphone. On ne peut pas revenir en arrière : exporte d’abord si tu veux les garder.</p>
    <div class="rangee"><button type="button" class="btn gris" data-choix="exporter">Exporter d’abord</button><button type="button" class="btn gris" data-fermer>Annuler</button></div>
    <button type="button" class="btn rouge" data-choix="effacer" data-confirmer="Oui, tout effacer">Effacer</button></form>`, async choix => {
    if (choix === 'exporter') { exporter(); return; }
    if (choix !== 'effacer') return;
    try { Object.keys(localStorage).filter(k => k.startsWith('orga-')).forEach(k => localStorage.removeItem(k)); } catch {}
    try { for (const k of await caches.keys()) await caches.delete(k); } catch {}
    data = L.vide(); dernier = null;
    location.reload();
  });
}

function revenirAvant() {
  const a = avantImport();
  if (!a) return;
  ouvrirDlg(`<form><h2>Revenir à avant l’import ?</h2><p class="muted">Les données reviennent à leur état du ${new Date(a.quand).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}. Ce qui a été fait depuis est perdu.</p>
    <div class="rangee"><button type="button" class="btn gris" data-fermer>Annuler</button><button class="btn plein">Revenir</button></div></form>`, () => {
    try { data = L.validerImport(a.data); } catch (err) { dire(err.message); return; }
    try { localStorage.removeItem(CLE_AVANT); } catch {}
    maj(); dire('Données d’avant l’import remises');
  });
}

// ---------- Construire son app (V1.4) ----------

function assistant() {
  ouvrirDlg(`<form class="pile"><h2>Construire ton app</h2><p class="muted">Quelques questions : l’app crée ta semaine type, tes tâches de maison, tes listes et ton sport. Rien n’est effacé.</p>
    ${A.formulaireHtml()}
    <div class="rangee"><button type="button" class="btn gris" data-fermer>Annuler</button><button class="btn plein">Voir ce qui sera créé</button></div></form>`, () => {
    proposerProfil(L.lireProfil(L.construireProfil(A.lireReponses(dlg.querySelector('form')))), 'Voici ton app');
    return false;
  });
  A.brancher(dlg.querySelector('form'));
}

const TUTO = [
  ['Bienvenue', 'Ton emploi du temps par demi-heure, tes tâches, tes notes et ton sport, au même endroit. Tout reste sur ton téléphone.'],
  ['Les onglets', 'Aujourd’hui : le créneau en cours et ta journée. Semaine : la grille, à remplir au doigt (appui long puis glisser). Notes, Sport et Profil pour le reste.'],
  ['Le bouton +', 'Depuis n’importe quel écran, il ajoute un créneau, une tâche, une note ou un objectif.'],
  ['Valider tes créneaux', 'Valide chaque créneau avec son bouton peu après sa fin : c’est ce qui fait compter ta journée. Le soir, à partir de 20 h, tu relis la journée et tu coches ce que tu as fait.'],
  ['Ta sauvegarde', 'Tes données ne sont que sur ce téléphone. Exporte-les chaque semaine (Profil › Exporter). Et ne supprime pas l’icône : ça peut effacer tes données.'],
];
function tutoriel(i = 0) {
  const [titre, texte] = TUTO[i];
  ouvrirDlg(`<form><h2>${titre}</h2><p>${texte}</p><p class="aide">${i + 1} sur ${TUTO.length}</p>
    <div class="rangee"><button type="button" class="btn gris" data-choix="passer">${i === TUTO.length - 1 ? 'Fermer' : 'Passer'}</button>${i < TUTO.length - 1 ? '<button class="btn plein">Suivant</button>' : ''}</div></form>`, choix => {
    data.tutoVu = true; sauver();
    if (choix === 'ok' && i < TUTO.length - 1) { tutoriel(i + 1); return false; }
  });
}

// Donner mon avis : un message prêt à envoyer par le testeur lui-même ; rien n'est collecté.
function donnerAvis() {
  ouvrirDlg(`<form><h2>Donner mon avis</h2>
    <div class="champ">L’installation a marché ?${radios('install', { oui: 'Oui', difficile: 'Oui, mais difficilement', non: 'Non' }, 'oui')}</div>
    <label class="champ">Qu’est-ce qui t’a servi ?<textarea name="servi"></textarea></label>
    <label class="champ">Qu’est-ce qui manque ou ne marche pas ?<textarea name="manque"></textarea></label>
    <div class="champ">Ta note sur 5${radios('note', { 1: '1', 2: '2', 3: '3', 4: '4', 5: '5' }, '')}</div>
    <div class="rangee"><button type="button" class="btn gris" data-fermer>Annuler</button><button class="btn plein">Préparer le message</button></div></form>`, (choix, f) => {
    const inst = { oui: 'oui', difficile: 'oui, mais difficilement', non: 'non' }[f.get('install')];
    const texte = `Avis sur l’app d’organisation (version ${L.VERSION})\nInstallation : ${inst}\nCe qui a servi : ${f.get('servi').trim() || '—'}\nCe qui manque ou ne marche pas : ${f.get('manque').trim() || '—'}\nNote : ${f.get('note') || '—'}/5`;
    envoyerTexte(texte);
  });
}
async function envoyerTexte(texte) {
  try { if (navigator.share) { await navigator.share({ text: texte }); return; } } catch (e) { if (e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(texte); dire('Message copié : colle-le dans un SMS ou une messagerie'); }
  catch { ouvrirDlg(`<form><h2>Ton message</h2><p class="muted">Copie-le et envoie-le toi-même.</p><textarea class="copie" readonly>${esc(texte)}</textarea><button class="btn plein">Fermer</button></form>`, () => {}); }
}

// ---------- Bouton + et navigation ----------

function plus() {
  ouvrirDlg(`<form><h2>Ajouter</h2><div class="opts">
    <button type="button" data-choix="slot">${I.agenda}<b>Créneau</b><small>Dans l’emploi du temps</small></button>
    ${actif('taches') ? `<button type="button" data-choix="tache">${I.check}<b>Tâche</b><small>Avec une échéance</small></button>` : ''}
    ${actif('notes') ? `<button type="button" data-choix="note">${I.note}<b>Note</b><small>Une idée, une consigne</small></button>` : ''}
    ${actif('objectifs') ? `<button type="button" data-choix="objectif">${I.cible}<b>Objectif</b><small>Semaine, mois ou année</small></button>` : ''}
    </div><button type="button" class="btn gris" data-fermer>Fermer</button></form>`, choix => {
    if (choix === 'slot') {
      if (!data.types.length) { dire('Choisis d’abord comment commencer, dans Aujourd’hui.'); return; }
      const { date, h } = L.momentLogique(new Date());
      const s = Math.min(Math.max(Math.ceil(h * 2) / 2, data.plage[0]), data.plage[1] - 1);
      editerSlot(nouveauSlot(L.jourSemaine(date), s, s + 1), cleSem(date));
      return false;
    }
    if (choix === 'note') { editerNote(); return false; }
    if (choix === 'tache') { editerTache(); return false; }
    ouvrir('notes');
    setTimeout(() => document.querySelector('form[data-horizon="semaine"] input')?.focus(), 50);
  });
}

// Un onglet dont tous les modules sont masqués disparaît de la barre.
const ONGLETS_MODULES = { notes: ['taches', 'projets', 'objectifs', 'listes', 'notes'], sport: ['sport', 'habitudes'] };
const ongletVisible = v => !ONGLETS_MODULES[v] || ONGLETS_MODULES[v].some(actif);
function majOnglets() {
  document.querySelectorAll('.tab').forEach(t => { t.hidden = !ongletVisible(t.dataset.v); });
  $('.tabs').style.gridTemplateColumns = `repeat(${[...document.querySelectorAll('.tab')].filter(t => !t.hidden).length}, 1fr)`;
}
function ouvrir(id) {
  if (!ongletVisible(id)) id = 'aujourdhui';
  ui.onglet = id;
  document.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-selected', t.dataset.v === id));
  document.querySelectorAll('main > .view').forEach(v => v.hidden = v.id !== id);
  scrollTo(0, 0);
  try { localStorage.setItem('orga-onglet', id); } catch {}
}
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => ouvrir(t.dataset.v)));

function rendre() { majOnglets(); vueAujourdhui(); vueSemaine(); vueNotes(); vueSport(); vueProfil(); if (!ongletVisible(ui.onglet)) ouvrir('aujourdhui'); }

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
      // Validé par son bouton peu après sa fin, le jour même : la journée a servi.
      const { date, h } = L.momentLogique(new Date());
      if (!r.slot.fait) noterUsage('creneau-decoche');
      else if (dateDuSlot(r.cle, r.slot.j) === L.isoJour(date) && h <= L.delaiValidation(r.slot.e)) noterUsage('creneau-valide');
      const t = r.slot.fait && r.slot.tache && data.taches.find(x => x.id === r.slot.tache);
      if (t && !t.fait) cocherTache(t); else if (r.slot.fait) dire('Créneau validé');
      return maj();
    }
    case 'relecture': return relecture(el.dataset.jour);
    case 'ouvrir-profil': return ouvrir('profil');
    case 'tirage': return ouvrirTirage();
    case 'creature': return voirCreature(L.CREATURES.find(c => c.id === id));
    case 'bilan': return faireBilan(el.dataset.cle);
    case 'theme': data.theme = id; return maj();
    case 'editer-tache': return editerTache(data.taches.find(t => t.id === id));
    case 'projet': return editerProjet(data.projets.find(p => p.id === id));
    case 'nouveau-projet': return editerProjet(null, el.dataset.type);
    case 'habitude': {
      const hb = data.habitudes.find(x => x.id === id), jour = el.dataset.jour;
      hb.faits = hb.faits.includes(jour) ? hb.faits.filter(d => d !== jour) : [...hb.faits, jour].sort();
      noterUsage('habitudes');
      return maj();
    }
    case 'editer-habitude': return editerHabitude(data.habitudes.find(x => x.id === id));
    case 'seance': return commencerSeance(el.dataset.seance || (trouverSlot(el.dataset.slot)?.slot.seance), el.dataset.slot || null);
    case 'seance-type': return editerSeanceType(data.seances.find(s => s.id === id));
    case 'exo': return editerExo(exo(id));
    case 'journal': return voirJournal(data.journal.find(e => e.id === id));
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
    case 'tout-effacer': return toutEffacer();
    case 'stats-per': ui.statsPer = id; return vueProfil();
    case 'choisir-compagnon': if (!data.collection.some(x => x.id === id)) return; data.compagnon = L.grandir({ id, stade: 0 }, L.stats(data, new Date()).joursValides); noterUsage('compagnon'); return maj();
    case 'retirer-sport': data.profil.sports = sportsDuProfil().filter(x => x !== el.dataset.sport); return maj();
    case 'sport-depart': {
      const p = L.seancesDeDepart(el.dataset.sport);
      return proposerProfil(L.lireProfil({ format: 'orga-profil', version: 1, exercices: p.exercices, seances: p.seances }), `Pour le ${el.dataset.sport.toLowerCase()}`);
    }
    case 'competition': return editerCompetition(data.competitions.find(c => c.id === id));
    case 'revenir-avant': return revenirAvant();
    case 'assistant': return assistant();
    case 'tutoriel': return tutoriel();
    case 'avis': return donnerAvis();
    case 'importer': return $('#fichier').click();
  }
});

document.addEventListener('change', e => {
  const t = e.target, { act, id } = t.dataset;
  if (!act) return;
  if (['objectif', 'item', 'tache'].includes(act)) noterUsage({ objectif: 'objectifs', item: 'listes', tache: 'taches' }[act]);
  if (act === 'objectif') { data.objectifs.find(o => o.id === id).fait = t.checked; if (t.checked) dire('Objectif atteint'); }
  if (act === 'item') data.listes.find(l => l.id === t.dataset.liste).items.find(i => i.id === id).fait = t.checked;
  if (act === 'tache') {
    const x = data.taches.find(y => y.id === id);
    if (t.checked) cocherTache(x); else { x.fait = false; x.faits = (x.faits || []).slice(0, -1); }
  }
  if (act === 'son') data.son = t.checked;
  if (act === 'taux') data.taux = Math.max(0, parseFloat(t.value.replace(',', '.')) || 0);
  if (act === 'module') data.modules[id] = t.checked;
  if (act === 'prog-exo') ui.progExo = t.value;
  if (act === 'repos') data.repos = +t.value;
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
  if (k === 'sport') {
    const nom = f.elements.txt.value.trim().slice(0, 40);
    if (nom && !sportsDuProfil().some(x => x.toLowerCase() === nom.toLowerCase())) data.profil.sports = [...sportsDuProfil(), nom];
    noterUsage('sport');
    return maj();
  }
  const txt = (f.elements.txt || f.elements.nom).value.trim();
  if (!txt) return;
  const mod = { objectif: 'objectifs', item: 'listes', tache: 'taches', habitude: 'habitudes', exo: 'sport' }[k];
  if (mod) noterUsage(mod);
  if (k === 'objectif') data.objectifs.push({ id: L.uid(), txt, horizon: f.dataset.horizon, periode: f.dataset.periode, fait: false, parent: f.elements.parent?.value || null });
  if (k === 'item') data.listes.find(l => l.id === f.dataset.id).items.push({ id: L.uid(), txt, fait: false });
  if (k === 'cat') data.cats.push({ id: L.uid(), nom: txt, couleur: '#8a8f9c' });
  if (k === 'tache') data.taches.push({ id: L.uid(), titre: txt, echeance: f.elements.date.value || null, priorite: 2, fac: false, recurrence: null, projet: null, sous: [], fait: false });
  if (k === 'habitude') data.habitudes.push({ id: L.uid(), nom: txt, freq: f.elements.freq.value === 'jour' ? 'jour' : +f.elements.freq.value, faits: [] });
  if (k === 'exo') data.exos.push({ id: L.uid(), nom: txt, type: f.elements.type.value, notes: '' });
  maj();
  // On garde le clavier ouvert pour enchaîner les ajouts.
  const sel = k === 'objectif' ? `form[data-horizon="${f.dataset.horizon}"] input` : k === 'item' ? `form[data-id="${f.dataset.id}"] input` : `form[data-form="${k}"] input`;
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
dernier = L.stats(data, new Date());
ouvrir(ui.onglet);
if (!data.tutoVu) tutoriel();
