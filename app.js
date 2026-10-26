// L'app : affichage, gestes et enregistrement. La logique pure est dans logique.js.
import * as L from './logique.js';

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
  boucle: svg('<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.7 5.6L4 15.5M4 20v-4.5h4.5"/>', 1.9),
  liste: svg('<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.5" cy="6.5" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="17.5" r="1"/>', 1.9),
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
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { dire('Enregistrement impossible : télécharge une copie de tes données (Profil › ⚙ › Aide et avis).'); }
}
// Après chaque changement : on enregistre, on redessine, et on annonce l'XP gagnée (avec un petit son).
let dernier = null;
function maj() {
  for (const s of Object.values(data.semaines)) s.slots = L.trajets(s.slots);   // V1.10.32
  L.retenirXp(data);
  const st = L.stats(data, new Date());
  if (st.xpGarde !== (data.xpGarde || 0)) data.xpGarde = st.xpGarde;   // la réserve qui garde les niveaux gagnés
  const avant = data.compagnon?.stade;
  if (data.compagnon?.id) data.compagnon = L.grandir(data.compagnon, st.joursValides);
  sauver();
  rendre();
  if (data.compagnon?.id && data.compagnon.stade > (avant || 0) && actif('compagnon')) setTimeout(() => dire(`Ton compagnon grandit : stade ${data.compagnon.stade} !`), 1200);
  if (dernier && st.total > dernier.total && actif('motivation')) {
    if (toast.hidden) gainAffiche = 0;
    gainAffiche += st.total - dernier.total;
    reagirBalade(st.niveau.n > dernier.niveau.n ? 'fete' : 'content');
    dire(`+${gainAffiche} XP`);
    son();
  }
  if (dernier && !dernier.valides.has(aujIso()) && st.valides.has(aujIso())) { document.querySelectorAll('.flamme').forEach(f => f.classList.add('allume')); if (actif('motivation')) setTimeout(() => dire('Journée validée : ta flamme est allumée'), 600); }
  // Un succès débloqué ou un tirage gagné : on le dit, on le fête (V1.10.3).
  if (dernier && actif('motivation')) {
    const nouveaux = L.succesObtenus(st).filter(n => !L.succesObtenus(dernier).includes(n));
    if (nouveaux.length) { feter(); if (!feteCompagnon('Succès !', nouveaux[0])) setTimeout(() => dire(`Succès : ${nouveaux[0]} !`), 900); }
    else if (L.droitsTirage(data, st).length > L.droitsTirage(data, dernier).length) setTimeout(() => dire('Un tirage t’attend dans Profil'), 900);
  }
  verifierNiveau(st);
  majPastille(st);
  if (tape) { document.querySelectorAll(`[data-act="${tape[0]}"][data-id="${CSS.escape(tape[1])}"]`).forEach(x => x.classList.add('tape')); tape = null; }
  dernier = st;
  planifierSynchro();
  planifierSauvegarde();
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

// Modules : il n'y a plus de réglage (V1.10.15) ; seuls le sport et le travail suivent le profil (Régler par catégories).
const actif = m => m in data.modules ? data.modules[m] : m !== 'travail';
// La catégorie Travail (distincte de « Révisions ») n'existe que si le module est actif.
function catTravail() {
  let c = data.cats.find(x => x.id === 'job') || data.cats.find(x => x.nom.trim().toLowerCase() === 'travail');
  if (!c && actif('travail')) { c = { id: 'job', nom: 'Travail', couleur: '#8C6A4F' }; data.cats.push(c); sauver(); }
  return c;
}
const sportsDuProfil = () => data.profil.sports || [];
// La dernière sauvegarde, fichier exporté ou copie automatique, la plus récente des deux.
const joursDepuisExport = () => { const d = [data.dernierExport, sauvAuto()?.quand].filter(Boolean).sort().at(-1); return d ? Math.floor((Date.now() - new Date(d)) / 864e5) : null; };
// Le compte : identifiant, clé de chiffrement et date de la dernière copie, à part des données.
const CLE_SAUV = KEY + '-sauvegarde';
const sauvAuto = () => { try { const s = JSON.parse(localStorage.getItem(CLE_SAUV)); return s?.cle ? s : null; } catch { return null; } };   // l'ancien code de récupération (1.9.7) est ignoré
const ecrireSauvAuto = s => { try { s ? localStorage.setItem(CLE_SAUV, JSON.stringify(s)) : localStorage.removeItem(CLE_SAUV); } catch {} };
// Ce qui a servi aujourd'hui (jour logique : avant 1 h, c'est encore la veille).
const aujIso = () => L.isoJour(L.momentLogique(new Date()).date);
const noterUsage = cle => L.noter(data, aujIso(), cle);
const dateDuSlot = (cle, j) => L.isoJour(L.ajouterJours(L.deIso(cle), j));
// Un créneau déjà commencé (V1.10.22) : on ne valide pas à l'avance ce qui n'a pas encore eu lieu.
const commence = (cle, x) => { const { date, h } = L.momentLogique(new Date()), iso = dateDuSlot(cle, x.j), auj = L.isoJour(date); return iso < auj || (iso === auj && x.s <= h); };

// Relecture d'une journée : chaque créneau se coche un par un ; ceux déjà validés arrivent cochés.
// Seuls les créneaux cochés rapportent de l'XP ; la relecture seule ne fait pas compter la journée.
function relecture(jour) {
  const d = L.deIso(jour), cle = cleSem(d), j = L.jourSemaine(d), sem = semaineDe(cle);
  const slots = sem.slots.filter(x => x.j === j && !L.auto(x));
  const hier = jour !== aujIso(), aVenir = x => !commence(cle, x);
  const servi = L.utiliseEnJournee(data, jour);
  ouvrirDlg(`<form><h2>${hier ? 'Relire hier' : 'Relire ta journée'}</h2>
    <p class="muted">Coche ce que tu as vraiment fait, puis confirme. ${servi ? 'Cette journée a servi pendant la journée : validée, elle comptera dans l’essai.' : 'Aucun créneau n’a été touché pendant cette journée : validée, elle ne comptera pas dans l’essai.'}</p>
    <ul class="list">${slots.map(x => `<li${aVenir(x) ? ' class="pas-encore"' : ''}><input type="checkbox" class="chk" name="fait" value="${x.id}" ${x.fait ? 'checked' : ''} ${aVenir(x) ? 'disabled' : ''} aria-label="${esc(x.titre)} ${aVenir(x) ? 'à venir' : 'fait'}"><span class="dot" style="${teinte(x.cat)}"></span><div class="txt"><b>${esc(x.titre)}</b><small>${L.hhmm(x.s)} – ${L.hhmm(x.e)}</small></div></li>`).join('')}</ul>
    <div class="rangee"><button type="button" class="btn gris" data-fermer>Annuler</button><button class="btn plein">Confirmer</button></div></form>`, (choix, f) => {
    const faits = new Set(f.getAll('fait'));
    for (const x of slots) {
      if (aVenir(x)) continue;   // à venir : il se validera quand il aura eu lieu
      const avant = !!x.fait;
      x.fait = faits.has(x.id) ? true : null;
      const t = x.fait && !avant && x.tache && data.taches.find(y => y.id === x.tache);
      if (t && !t.fait) Object.assign(t, L.cocher(t, new Date()));
    }
    dire(L.journeeValidee(slots) ? (L.utiliseEnJournee(data, jour) ? 'Journée validée' : 'Journée validée, hors essai') : `Validés : ${faits.size} sur ${slots.length}`);
    maj();
  });
}
const pl = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;
const radios = (nom, valeurs, sel) => `<div class="cats">${Object.entries(valeurs).map(([v, n]) => `<label><input type="radio" name="${nom}" value="${v}" ${String(sel) === v ? 'checked' : ''}><span class="sans">${esc(n)}</span></label>`).join('')}</div>`;

function cocherTache(t) {
  Object.assign(t, L.cocher(t, new Date()));
  dire(t.fait ? 'Tâche faite' : `Prochaine fois : ${L.deIso(t.echeance).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`);
}
function pillEcheance(t) {
  const j = L.joursAvant(t.echeance, new Date()), h = typeof t.heure === 'number' ? ` ${L.hhmm(t.heure)}` : '';
  const txt = j < 0 ? 'En retard' : j === 0 ? `Auj.${h}` : j === 1 ? `Demain${h}` : t.fac || j > 6 ? `J-${j}` : `${JOURS[L.jourSemaine(L.deIso(t.echeance))].replace(/^./, c => c.toUpperCase()).slice(0, 3)}.${h}`;
  return `<span class="pill${j < 0 ? ' retard' : ''}">${txt}</span>`;
}
const tacheHtml = t => {
  const ns = (t.sous || []).length, nf = (t.sous || []).filter(s => s.fait).length, rep = L.repDe(t);
  const sous = [t.fac && 'Fac', t.travail && 'Travail', ns && `${nf}/${ns} étapes`, rep.length && `Revient : ${L.horairesTexte(rep)}`].filter(Boolean).join(' · ');
  const pasEncore = !t.fait && !L.cochable(t, new Date());
  return `<li${pasEncore ? ' class="pas-encore"' : ''}><input type="checkbox" class="chk" data-act="tache" data-id="${t.id}" ${t.fait ? 'checked' : ''} ${pasEncore ? 'disabled' : ''} aria-label="${pasEncore ? 'Pas encore : revient plus tard' : 'Fait'}">
    <div class="txt" data-act="editer-tache" data-id="${t.id}" role="button" tabindex="0"><b>${t.priorite === 1 ? '<span class="prio" title="Priorité haute"></span>' : ''}${esc(t.titre)}</b>${sous ? `<small>${esc(sous)}</small>` : ''}</div>
    ${t.echeance && !t.fait ? pillEcheance(t) : ''}</li>`;
};
// Des jours, chacun avec son heure (facultative) : pour les tâches qui reviennent et les habitudes.
const horaireLigne = (x = { j: L.jourSemaine(new Date()), h: null }) => `<div class="horaire" data-ligne><select name="hj" aria-label="Jour">${JOURS.map((n, j) => `<option value="${j}" ${j === x.j ? 'selected' : ''}>${n}</option>`).join('')}</select><input type="time" name="hh" value="${x.h != null ? L.hhmm(x.h) : ''}" aria-label="Heure (facultatif)"><button type="button" class="x" data-retirer aria-label="Retirer ce jour">${I.x}</button></div>`;
const horairesChamp = (titre, liste, aide) => `<div class="champ">${titre}<div class="horaires" data-horaires>${L.trierHoraires(liste).map(horaireLigne).join('')}</div>
  <div class="rangee"><button type="button" class="btn gris petit" data-ajout-horaire>Ajouter un jour</button><button type="button" class="btn gris petit" data-tous-jours>Tous les jours</button></div>
  <p class="aide">${aide}</p></div>`;
// Heures après minuit comptées comme la fin de la journée (00:30 = 24,5) ; les autres telles quelles.
const lireHoraires = f => f.getAll('hj').map((j, i) => { const h = L.versHeure(f.getAll('hh')[i], 1); return { j: +j, h: Number.isNaN(h) ? null : h }; })
  .filter((x, i, l) => l.findIndex(y => y.j === x.j && y.h === x.h) === i);

// Entraînements du club : les créneaux Sport marqués « club » et validés.
function clubFaits() {
  return Object.entries(data.semaines).flatMap(([cle, s]) => s.slots.filter(x => x.club && x.fait)
    .map(x => ({ date: L.isoJour(L.ajouterJours(L.deIso(cle), x.j)), nom: x.titre, duree: x.e - x.s })));
}
// Petite fête quand on termine quelque chose.
// Une liste à envoyer : son nom, puis une ligne par élément (✓ pour ce qui est déjà fait).
async function partagerListe(l) {
  if (!l) return;
  const texte = [l.nom, ...[...l.items].sort((a, b) => a.fait - b.fait).map(i => `${i.fait ? '✓' : '•'} ${i.txt}`)].join('\n');
  try { if (navigator.share) { await navigator.share({ title: l.nom, text: texte }); return; } } catch (e) { if (e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(texte); dire('Liste copiée : colle-la dans un message'); } catch { dire('Partage impossible sur ce téléphone.'); }
}
// V1.10.11 : le dernier niveau fêté est gardé ; tout niveau gagné depuis (même au lancement) a sa fête.
function verifierNiveau(st = L.stats(data, new Date())) {
  if (!actif('motivation')) return;
  const n = st.niveau.n;
  if (data.niveauVu == null) { data.niveauVu = n; sauver(); return; }
  if (n <= data.niveauVu) return;
  data.niveauVu = n; sauver();
  setTimeout(() => feterNiveau(n), 700);
}
const monCompagnon = () => actif('compagnon') && data.compagnon?.id && L.CREATURES.find(x => x.id === data.compagnon.id);
// V1.10.16 : pour un succès, le compagnon surgit au milieu de l'écran, bondit, tourne et annonce la nouvelle.
function feteCompagnon(titre, texte) {
  const c = monCompagnon();
  if (!c || matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  const el = Object.assign(document.createElement('div'), { className: 'fete-compagnon' });
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<div class="fete-bulle"><b>${esc(titre)}</b>${texte ? `<small>${esc(texte)}</small>` : ''}</div><div class="fete-saut">${compagnonFig(c, data.compagnon.stade || 0)}</div>`;
  (dlg.open ? dlg : document.body).append(el);
  setTimeout(() => el.remove(), 3400);
  return true;
}
function feterNiveau(n) {
  navigator.vibrate?.([30, 60, 30, 60, 80]);
  reagirBalade('fete');
  const c = monCompagnon();
  // V1.10.20 : la fenêtre d'avant (badge, compagnon, texte, bouton du tirage), mais elle se ferme toute seule au bout de
  // 6 secondes, ou d'un tap n'importe où ; « Ouvrir mon tirage » reste là pour qui veut.
  ouvrirDlg(`<form class="niveau-fete">${c ? `<div class="niveau-compagnon">${compagnonFig(c, data.compagnon.stade || 0)}</div>` : ''}<div class="badge-niveau"><small>Niveau</small><b>${n}</b></div>
    <h2>Niveau ${n} !</h2><p>${n % 5 ? `Bravo, tu montes d’un niveau. Prochain tirage au niveau ${Math.ceil(n / 5) * 5}.` : 'Bravo ! Tous les 5 niveaux, un tirage : une nouvelle créature pour ta collection.'}</p>
    ${n % 5 ? '' : '<button type="button" class="btn plein" data-choix="tirage">Ouvrir mon tirage</button>'}<p class="aide">Touche n’importe où pour fermer.</p></form>`, choix => {
    if (choix === 'tirage') { setTimeout(ouvrirTirage); }
  });
  const form = dlg.querySelector('form.niveau-fete');
  form.addEventListener('click', e => { if (!e.target.closest('button')) dlg.close(); });
  setTimeout(() => { if (dlg.open && dlg.contains(form)) dlg.close(); }, 6000);
  feter(); setTimeout(feter, 700);
  // Une vraie notification aussi, si les notifications sont autorisées (elle reste dans le centre de notifications).
  try { if (Notification.permission === 'granted') navigator.serviceWorker.ready.then(r => r.showNotification(`Niveau ${n} !`, { body: n % 5 ? 'Bravo, tu montes d’un niveau.' : 'Un tirage t’attend dans Profil.', icon: 'icone-180.png', tag: 'niveau-' + n })); } catch {}
}
function feter() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = Object.assign(document.createElement('div'), { className: 'confettis' });
  box.setAttribute('aria-hidden', 'true');
  const couleurs = data.cats.map(c => L.couleurSure(c.couleur));
  box.innerHTML = Array.from({ length: 60 }, (_, i) => `<i style="left:${Math.random() * 100}%;background:${couleurs[i % couleurs.length]};--d:${(.9 + Math.random() * .8).toFixed(2)}s;--r:${Math.round(Math.random() * 720 - 360)}deg;animation-delay:${(Math.random() * .25).toFixed(2)}s"></i>`).join('');
  (dlg.open ? dlg : document.body).append(box);   // au-dessus d'une fenêtre ouverte
  setTimeout(() => box.remove(), 2200);
}

// ---------- Petits outils d'interface ----------

const toast = $('#toast');
let tt;
// Le message reste assez longtemps pour être lu : 2,2 s, plus pour un long message (une erreur à corriger, par exemple).
function dire(msg) { const ici = dlg.open ? dlg : document.body; if (toast.parentNode !== ici) ici.append(toast); toast.textContent = msg; toast.hidden = false; clearTimeout(tt); tt = setTimeout(() => { toast.hidden = true; gainAffiche = 0; }, Math.min(4000, Math.max(2200, msg.length * 60))); }
let gainAffiche = 0;   // les XP additionnées tant que la bulle reste à l'écran (V1.10.22)

const dlg = $('#dlg');
// Ouvre une fenêtre du bas. onChoix(choix, champs) ; renvoyer false la garde ouverte.
// collant : ne se ferme pas d'un tap à côté (séance en cours).
function ouvrirDlg(html, onChoix, { collant = false } = {}) {
  if (dlg.open) dlg.close();
  if (toast.parentNode === dlg) document.body.append(toast);   // le message ne part pas avec l'ancien contenu
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
  if (b.matches('[data-vider]')) { const c = dlg.querySelector(`[name="${b.dataset.vider}"]`); if (c) { c.value = ''; c.dispatchEvent(new Event('input', { bubbles: true })); } }
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
  if (b.matches('[data-ajout-horaire]')) {
    const zone = b.closest('.champ').querySelector('[data-horaires]'), der = zone.lastElementChild;
    // le jour d'après la dernière ligne, à la même heure
    zone.insertAdjacentHTML('beforeend', horaireLigne(der ? { j: (+der.querySelector('select').value + 1) % 7, h: L.versHeure(der.querySelector('input').value, 1) || null } : undefined));
  }
  if (b.matches('[data-tous-jours]')) {
    const zone = b.closest('.champ').querySelector('[data-horaires]'), h = L.versHeure(zone.querySelector('input')?.value, 1);
    zone.innerHTML = [0, 1, 2, 3, 4, 5, 6].map(j => horaireLigne({ j, h: Number.isNaN(h) ? null : h })).join('');
  }
});
// Une heure choisie sur une ligne vaut aussi pour les lignes encore sans heure (V1.10.27).
dlg.addEventListener('input', e => {
  // « Chaque jour » coche tous les jours ; « 3 fois par semaine » les décoche s'ils l'étaient tous, pour choisir les siens.
  if (e.target.name !== 'freq') return;
  const cases = [...dlg.querySelectorAll('[name="jr"]')];
  if (e.target.value === 'jour') cases.forEach(c => c.checked = true);
  else if (cases.every(c => c.checked)) cases.forEach(c => c.checked = false);
});
dlg.addEventListener('click', e => {
  if (!e.target.closest('[data-par-jour-ouvrir]')) return;
  const f = e.target.closest('form'), h = L.versHeure(f.elements.heure.value, 1);
  f.querySelector('[data-par-jour] [data-horaires]').innerHTML = [...f.querySelectorAll('[name="jr"]:checked')].map(c => horaireLigne({ j: +c.value, h: Number.isNaN(h) ? null : h })).join('');
  f.querySelector('[data-simple]').hidden = true;
  f.querySelector('[data-par-jour]').hidden = false;
});
dlg.addEventListener('change', e => {
  if (e.target.name !== 'hh' || !e.target.value) return;
  for (const i of e.target.closest('[data-horaires]')?.querySelectorAll('input[name="hh"]') || []) if (!i.value) i.value = e.target.value;
});
dlg.addEventListener('cancel', e => { if (dlg.dataset.collant) e.preventDefault(); });

const bienvenue = () => `<div class="card bientot"><b>Bienvenue</b>
  <p>Règle tes catégories une par une (sommeil, repas, cours, sport…) et ta semaine se remplit. Tu peux aussi partir d’une semaine d’exemple, ou de zéro.</p>
  <button class="btn plein" data-act="assistant">Construire mon app</button>
  <div class="rangee"><button class="btn gris" data-act="depart-exemple">Semaine d’exemple</button><button class="btn gris" data-act="depart-vide">Partir de zéro</button></div>
  ${L.sauvegardePossible() && !sauvAuto() ? '<button class="btn gris" data-act="connexion">J’ai déjà un compte</button>' : ''}</div>`;

// ---------- Aujourd'hui ----------

function vueAujourdhui() {
  const { date, h } = L.momentLogique(new Date());
  const st = L.stats(data, new Date());
  let html = `<header class="top"><div><h1>Aujourd’hui</h1><p>${date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p></div>
    ${actif('motivation') ? `<div class="chips"><button class="chip" data-act="ouvrir-profil" aria-label="Série de ${st.serie} jours">${flamme(st.valides.has(aujIso()))}${st.serie}</button><button class="chip" data-act="ouvrir-profil" aria-label="Niveau ${st.niveau.n}">Niv. ${st.niveau.n}</button></div>` : ''}</header>`;
  const jExport = joursDepuisExport();
  if (jExport === null || jExport > 7) {
    if (sauvAuto()) html += `<div class="card type alerte-export"><div class="txt"><b>Dernière sauvegarde il y a ${jExport} jours</b><small>La copie automatique n’a pas pu partir : ouvre l’app avec du réseau.</small></div></div>`;
    else if (L.sauvegardePossible()) html += `<div class="card type alerte-export"><div class="txt"><b>Tes données ne sont pas sauvegardées</b><small>Elles ne sont que sur ce téléphone : crée ton compte pour les garder.</small></div><button class="btn plein petit" data-act="compte">Créer</button></div>`;
  }
  if (peutActiverRappels() && !data.notifs.plusTard) {
    html += `<div class="card type"><div class="txt"><b>Activer les rappels ?</b><small>Avant chaque créneau de ta journée, à l’heure de tes habitudes, et le bilan avant le dîner</small></div><div class="rangee" style="flex:0 0 auto"><button class="btn gris petit" data-act="rappels-plus-tard">Plus tard</button><button class="btn plein petit" data-act="rappels-activer">Activer</button></div></div>`;
  }
  if (!data.types.length) { $('#aujourdhui').innerHTML = html + bienvenue(); return; }

  // Hier pas validé : on le relit le lendemain (la veille ne compte dans l'essai que si elle a servi pendant la journée).
  const hier = L.ajouterJours(date, -1), semHier = data.semaines[cleSem(hier)];
  const slotsHier = semHier ? semHier.slots.filter(x => x.j === L.jourSemaine(hier)) : [];
  if (slotsHier.some(x => !L.auto(x)) && !L.journeeValidee(slotsHier)) {
    html += `<div class="card type"><div class="txt"><b>Hier n’est pas validé</b><small>${pl(slotsHier.filter(x => !x.fait && !L.auto(x)).length, 'créneau', 'créneaux')} à relire pour garder ta série</small></div><button class="btn gris petit" data-act="relecture" data-jour="${L.isoJour(hier)}">Valider hier</button></div>`;
  }
  if (actif('sport')) {
    const regle = L.regleCompetition(data.competitions, L.isoJour(date));
    const prochaine = data.competitions.filter(c => c.date >= L.isoJour(date)).sort((a, b) => a.date.localeCompare(b.date))[0];
    if (regle) html += `<div class="card type"><div class="txt"><b>${{ veille: 'Veille de compétition', jour: 'Jour de compétition', lendemain: 'Lendemain de compétition' }[regle.regle]} · ${esc(regle.competition.nom)}</b><small>${{ veille: 'Séance raccourcie de moitié, sans nouvel exercice.', jour: 'Pas de renfo aujourd’hui. Bonne compétition !', lendemain: 'Récupération (mobilité, étirements) ou repos.' }[regle.regle]}</small></div></div>`;
    else if (prochaine && L.joursAvant(prochaine.date, date) <= 30) html += `<div class="card type"><div class="txt"><b>${esc(prochaine.nom)}</b><small>${esc([prochaine.sport, prochaine.lieu].filter(Boolean).join(' · '))}</small></div><span class="pill">J-${L.joursAvant(prochaine.date, date)}</span></div>`;
  }
  const aBilan = bilanAFaire();
  if (aBilan) html += `<button class="card kv appel" data-act="bilan" data-cle="${aBilan}"><span class="txt"><b>C’est l’heure du bilan</b><small>Objectifs, tâches à reporter, heures de la semaine</small></span><span class="pill">+${L.XP.bilan} XP</span></button>`;
  // V1.10.6 : plus de carte du compagnon dans Aujourd'hui ; il se promène en bas de l'écran.
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

  const passes = slots.filter(x => x.e <= h && !L.auto(x)), hBilan = L.heureBilan(slots);
  html += `<div class="sec"><h2>La journée <span>${passes.length ? `${pl(passes.filter(x => x.fait).length, 'validé', 'validés')} sur ${pl(passes.length, 'passé', 'passés')}` : ''}</span></h2>`;
  // La journée en forme d'emploi du temps : la grille d'un seul jour, un bouton de validation sur chaque créneau passé.
  const [p0, p1] = data.plage;
  html += slots.length ? `<div class="wk seul jour-edt" style="--n:1;--rows:${(p1 - p0) * 2}"><div class="wk-body">
    <div class="wk-hours">${Array.from({ length: p1 - p0 - 1 }, (_, i) => `<span style="--s:${i + 1}">${(p0 + i + 1) % 24}</span>`).join('')}</div>
    <div class="wk-col">${slots.filter(x => x.e > p0 && x.s < p1).map(x => {
      const s = Math.max(x.s, p0), e = Math.min(x.e, p1), passe = x.e <= h, actuel = x.s <= h && h < x.e, liees = notesLiees(x.titre).length;
      const sous = [`${L.hhmm(x.s)} – ${L.hhmm(x.e)}`, infos(x), liees ? `${liees} note${liees > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ');
      return `<div class="blk${actuel ? ' actuel' : ''}${x.fait ? ' fait' : ''}" data-act="slot" data-id="${x.id}" style="${teinte(x.cat)};--s:${s - p0};--d:${e - s}">${esc(x.titre)}<small>${esc(sous)}</small>
        ${passe && !L.auto(x) ? `<button class="valid" data-act="valider" data-id="${x.id}" aria-pressed="${!!x.fait}" aria-label="Valider ${esc(x.titre)}">${I.check}</button>` : ''}</div>`;
    }).join('')}${actif('habitudes') ? L.habitudesAHeure(data.habitudes, L.jourSemaine(date)).map(hb => habBlocHtml(hb, p0, p1, L.isoJour(date))).join('') : ''}${h >= p0 && h < p1 ? `<div class="nowline" style="--s:${h - p0}"></div>` : ''}</div></div></div>`
    : '<p class="vide">Rien de prévu aujourd’hui. Ajoute un créneau avec le bouton +.</p>';
  // Dès l'heure du bilan (avant le dîner, sinon 20 h), la relecture : chaque créneau se coche un par un.
  const iso = L.isoJour(date), servi = L.utiliseEnJournee(data, iso);
  if (L.rienACocher(slots)) {
    html += '<p class="vide">Rien à cocher aujourd’hui : sommeil, cours et repas se valident tout seuls, et la journée aussi.</p>';
  } else if (L.journeeValidee(slots)) {
    html += `<p class="vide">${servi ? `Journée validée, elle compte dans l’essai${actif('motivation') ? ` : +${L.XP.jour} XP de bonus` : ''}.` : 'Journée validée, mais elle ne compte pas dans l’essai : aucun créneau touché pendant la journée.'}</p>`;
  } else if (h >= hBilan && slots.some(x => !L.auto(x))) {
    html += `<button class="btn plein" data-act="relecture" data-jour="${iso}">Relire et valider la journée</button>`;
  } else if (slots.length) {
    html += `<p class="aide">Valide chaque créneau avec son bouton peu après sa fin${servi ? '' : ' : c’est ce qui fait compter la journée'}. Sommeil, cours et repas se valident tout seuls. Le bilan de la journée ouvre à ${L.hhmm(hBilan)}.</p>`;
  }
  html += '</div>';

  // Seulement les tâches du jour, et celles en retard (retour des testeurs, 24/10) : la suite est dans Notes.
  const af = L.aFaire(data.taches, date, 0);
  if (actif('taches')) html += `<div class="sec"><h2>À faire aujourd’hui</h2>${af.length ? `<ul class="list">${af.map(tacheHtml).join('')}</ul>` : '<p class="vide">Rien pour aujourd’hui. Les tâches des jours suivants sont dans Notes.</p>'}</div>`;
  const habsJour = data.habitudes.filter(hb => L.habitudeDuJour(hb, L.jourSemaine(date)));
  if (habsJour.length && actif('habitudes')) {
    const iso = L.isoJour(date);
    html += `<div class="sec"><h2>Habitudes</h2><div class="habits">${habsJour.map(hb => `<button class="habit" data-act="habitude" data-id="${hb.id}" data-jour="${iso}" aria-pressed="${hb.faits.includes(iso)}">${I.check}${esc(hb.nom)}${hb.freq === 'jour' ? '' : ` <small>${L.faitsSemaine(hb, L.lundiDe(date))}/${hb.freq}</small>`}</button>`).join('')}</div></div>`;
  }

  const os = objectifs('semaine', L.periode('semaine', date));
  if (actif('objectifs')) html += `<div class="sec"><h2>Objectifs de la semaine <span>${os.filter(o => o.fait).length} sur ${os.length}</span></h2>${os.length ? objectifsHtml('semaine', L.periode('semaine', date), false) : '<p class="vide">Aucun objectif cette semaine : ajoute-les dans Notes.</p>'}</div>`;
  $('#aujourdhui').innerHTML = html;
}

// ---------- Semaine ----------

function habBlocHtml(hb, p0, p1, iso) {
  const s = Math.max(hb.heure, p0), e = Math.min(hb.heure + (hb.duree || .5), p1);
  if (e <= s) return '';
  const fait = iso && hb.faits.includes(iso);
  return `<div class="blk hab${fait ? ' fait' : ''}" style="--c:#FF8AC1;--t:#15171C;--s:${s - p0};--d:${e - s}">${iso || e - s >= 1 || ui.seul !== null ? esc(hb.nom) : ''}${iso ? `<button class="valid" data-act="habitude" data-id="${hb.id}" data-jour="${iso}" aria-pressed="${fait}" aria-label="Habitude tenue : ${esc(hb.nom)}">${I.check}</button>` : ''}</div>`;
}
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

  const sem = semaineDe(cle), nRec = data.recurrents.length;
  html += `<div class="card type"><div class="txt"><b>Créneaux types</b><small>${nRec ? `${pl(nRec, 'créneau revient', 'créneaux reviennent')} chaque semaine` : 'Rien ne revient encore chaque semaine'}</small></div><button class="btn gris petit" data-act="sem-actions">Modifier</button></div>`;

  const [p0, p1] = data.plage;
  const { date, h } = L.momentLogique(new Date());
  const jNow = cleSem(date) === cle ? L.jourSemaine(date) : -1;
  const jAuj = cleSem(new Date()) === cle ? L.jourSemaine(new Date()) : -1;
  const jours = ui.seul === null ? [0, 1, 2, 3, 4, 5, 6] : [ui.seul];
  html += `<div class="wk${ui.seul !== null ? ' seul' : ''}" style="--n:${jours.length};--rows:${(p1 - p0) * 2}">
    <div class="wk-head"><span></span>${jours.map(j => `<button data-act="jour" data-j="${j}" class="${j === jAuj ? 'auj' : ''}" aria-label="${ui.seul === null ? `Voir le ${JOURS[j]} seul` : 'Revenir à la semaine'}"><small>${ui.seul === null ? 'LMMJVSD'[j] : JOURS[j]}</small>${L.ajouterJours(lundi, j).getDate()}</button>`).join('')}</div>
    <div class="wk-body"><div class="wk-hours">${Array.from({ length: p1 - p0 - 1 }, (_, i) => `<span style="--s:${i + 1}">${(p0 + i + 1) % 24}</span>`).join('')}</div>
    ${jours.map(j => `<div class="wk-col" data-j="${j}">${sem.slots.filter(x => x.j === j && x.e > p0 && x.s < p1).map(x => blocHtml(x, p0, p1)).join('')}${actif('habitudes') ? L.habitudesAHeure(data.habitudes, j).map(hb => habBlocHtml(hb, p0, p1)).join('') : ''}${j === jNow && h >= p0 && h < p1 ? `<div class="nowline" style="--s:${h - p0}"></div>` : ''}</div>`).join('')}
    </div></div>
    <p class="aide">Touche une case vide pour ajouter un créneau, un créneau pour le modifier. Appui long puis glisse : sur du vide pour remplir plusieurs demi-heures, sur un créneau pour le déplacer, sur son bas pour l’étirer. Touche un jour pour le voir seul. Glisse vers la gauche ou la droite pour changer de semaine.</p>
    <ul class="legend">${data.cats.map(c => `<li><span class="dot" style="${teinte(c.id)}"></span>${esc(c.nom)}</li>`).join('')}</ul>`;
  // Les réglages de la grille vivent ici, à côté d'elle (retour des testeurs, 24/10).
  const opt = (vals, sel) => vals.map(x => `<option value="${x}" ${x === sel ? 'selected' : ''}>${L.hhmm(x)}</option>`).join('');
  html += `<div class="sec">${groupe('grille', 'Réglages de la grille', 'Heures affichées, couleurs et noms des catégories', `
    <div class="champ">Heures affichées<div class="reglage"><span>De</span><select data-act="plage" data-i="0" aria-label="Début">${opt([5, 6, 7, 8, 9], data.plage[0])}</select><span>à</span><select data-act="plage" data-i="1" aria-label="Fin">${opt([22, 23, 24, 25], data.plage[1])}</select></div></div>
    <div class="champ">Catégories<p class="aide">La couleur et le nom de chaque sorte de créneau (cours, sport, repas…).</p><ul class="list">${data.cats.map(c => `<li class="reglage"><input type="color" value="${L.couleurSure(c.couleur)}" data-act="cat-couleur" data-id="${c.id}" aria-label="Couleur de ${esc(c.nom)}"><input type="text" value="${esc(c.nom)}" data-act="cat-nom" data-id="${c.id}" aria-label="Nom de la catégorie"><button class="x" data-act="suppr-cat" data-id="${c.id}" aria-label="Supprimer ${esc(c.nom)}">${I.x}</button></li>`).join('')}</ul>
      <form class="ajout" data-form="cat"><input name="nom" placeholder="Nouvelle catégorie" aria-label="Nouvelle catégorie" autocomplete="off"><button aria-label="Ajouter">${I.plus}</button></form></div>`)}</div>`;
  $('#semaine').innerHTML = html;
}

const nouveauSlot = (j, s, e) => ({ id: L.uid(), j, s, e, cat: ui.derniereCat || data.cats[0]?.id, titre: '', salle: '', affaires: '', notes: '', fait: null, neuf: true });

const occupe = x => `Ce moment est déjà pris : ${x.titre} (${L.hhmm(x.s)} – ${L.hhmm(x.e)}). Déplace-le ou raccourcis-le d’abord.`;
// Ni lieu ni affaires à prendre pour dormir, manger ou faire le ménage (V1.10.10).
const SANS_LIEU = ['sommeil', 'repas', 'menage', 'trajet'];
// Trajet avant et après un créneau (V1.10.32), en minutes ; 0 = aucun.
const DUREES_TRAJET = [0, 5, 10, 15, 20, 30, 45, 60, 90];
const champsTrajet = v => `<div class="champs" style="grid-template-columns: 1fr 1fr">${[['avant', 'Trajet avant'], ['apres', 'Trajet après']].map(([k, n]) =>
  `<label class="champ">${n}<select name="${k}">${[...new Set([...DUREES_TRAJET, v[k] || 0])].sort((a, b) => a - b).map(m => `<option value="${m}" ${m === (v[k] || 0) ? 'selected' : ''}>${m ? m + ' min' : 'Aucun'}</option>`).join('')}</select></label>`).join('')}</div>`;
const lireTrajets = (f, c) => { for (const k of ['avant', 'apres']) c[k] = SANS_LIEU.includes(c.cat) ? 0 : +f.get(k) || 0; };
const suivreLieu = () => dlg.querySelectorAll('input[name="cat"]').forEach(r => r.addEventListener('change', () => { const z = dlg.querySelector('.zone-lieu'); if (z) z.hidden = SANS_LIEU.includes(r.value); }));
// Le moment est déjà pris (V1.10.12) : raccourcir, décaler ou remplacer ce qui est là, ou annuler.
function conflit(slots, c, gene, suite) {
  const n = `« ${esc(gene.titre)} »`, raccourci = gene.s < c.s || gene.e > c.e;
  ouvrirDlg(`<form><h2>Ce moment est déjà pris</h2>
    <p class="muted">${n} est prévu de ${L.hhmm(gene.s)} à ${L.hhmm(gene.e)}. Que faire pour poser « ${esc(c.titre)} » de ${L.hhmm(c.s)} à ${L.hhmm(c.e)} ?</p>
    ${raccourci ? `<button type="button" class="btn plein" data-choix="raccourcir">Raccourcir ${n}</button>` : ''}
    <button type="button" class="btn ${raccourci ? 'gris' : 'plein'}" data-choix="decaler">Décaler ${n} juste après</button>
    <button type="button" class="btn rouge" data-choix="remplacer">Remplacer ${n}</button>
    <button type="button" class="btn gris" data-fermer>Annuler</button></form>`, choix => {
    const r = L.resoudre(slots, c, choix);
    if (r.gene) { dire(`Impossible : ${occupe(r.gene)}`); return false; }
    suite(r.slots);
  });
}
function editerSlot(slot, cle) {
  const neuf = !!slot.neuf;
  const sem = semaineDe(cle), rec = !neuf && L.recurrentDe(data, slot.src);
  // V1.10.13 : un créneau coupé autour des repas ou du sommeil se modifie d'un seul tenant.
  const morceaux = slot.groupe ? sem.slots.filter(x => x.groupe === slot.groupe).sort((a, b) => a.j - b.j || a.s - b.s) : [];
  const jfInit = morceaux.length > 1 && morceaux.at(-1).j !== morceaux[0].j ? morceaux.at(-1).j : null;
  if (morceaux.length > 1) slot = { ...slot, j: morceaux[0].j, s: morceaux[0].s, e: morceaux.at(-1).e };
  // Les trajets ajoutés par les créneaux ne gênent rien : ils sont refaits après.
  const sansMorceaux = L.sansTrajets(sem.slots).filter(x => !(slot.groupe && x.groupe === slot.groupe && x.id !== slot.id));
  const [p0, p1] = data.plage;
  const heure = (nom, h) => `<input type="time" name="${nom}" value="${L.hhmm(h)}" required>`;
  const liees = slot.titre ? notesLiees(slot.titre) : [];
  ouvrirDlg(`<form><h2>${neuf ? 'Nouveau créneau' : 'Créneau'}</h2>
    <label class="champ">Titre<input name="titre" value="${esc(slot.titre)}" placeholder="${esc(cat(slot.cat).nom)}" autocomplete="off"></label>
    <div class="cats" role="radiogroup" aria-label="Catégorie">${data.cats.map(c => `<label><input type="radio" name="cat" value="${c.id}" ${c.id === slot.cat ? 'checked' : ''}><span style="${teinte(c.id)}">${esc(c.nom)}</span></label>`).join('')}</div>
    <div class="champs">
      <label class="champ">Jour<select name="j">${JOURS.map((n, j) => `<option value="${j}" ${j === slot.j ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="champ">Début${heure('s', slot.s)}</label>
      <label class="champ">Fin${heure('e', slot.e)}</label>
    </div>
    <label class="champ">Finit le<select name="jf"><option value="">même jour</option>${JOURS.map((n, j) => `<option value="${j}" ${j === jfInit ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    ${morceaux.length > 1 ? `<p class="aide">Ce créneau est en ${morceaux.length} morceaux autour des repas et du sommeil : tout se modifie ensemble.</p>` : ''}
    <div class="zone-lieu" ${SANS_LIEU.includes(slot.cat) ? 'hidden' : ''}><label class="champ">Lieu<input name="salle" value="${esc(slot.salle)}" autocomplete="off"></label>
    <label class="champ">Affaires à prendre<input name="affaires" value="${esc(slot.affaires)}" autocomplete="off"></label>
    ${champsTrajet(slot)}</div>
    ${slot.lien ? '<p class="aide">Trajet ajouté par son créneau. Le changer ici le détache : il reste tel quel.</p>' : ''}
    <label class="champ">Notes<textarea name="notes">${esc(slot.notes)}</textarea></label>
    ${liees.length ? `<div class="champ">Notes liées<div class="liens">${liees.map(n => `<button type="button" data-act="note" data-id="${n.id}">${esc(n.titre || 'Sans titre')}</button>`).join('')}</div></div>` : ''}
    <div class="champ" id="zone-sport" ${slot.cat === 'sport' ? '' : 'hidden'}>
      <label class="champ">Séance prévue<select name="seance"><option value="">Aucune</option>${data.seances.map(s => `<option value="${s.id}" ${s.id === slot.seance ? 'selected' : ''}>${esc(s.nom)}</option>`).join('')}</select></label>
      <label class="coche"><input type="checkbox" class="chk" name="club" ${slot.club ? 'checked' : ''}>Entraînement ou match du club</label>
    </div>
    <label class="champ" id="zone-travail" ${slot.cat === catTravail()?.id ? '' : 'hidden'}>Collègue<input name="collegue" value="${esc(slot.collegue)}" autocomplete="off"></label>
    ${slot.tache ? `<p class="muted">Tâche planifiée : valider ce créneau la coche.</p>` : ''}
    ${neuf || !commence(cle, slot) ? '' : `<label class="coche"><input type="checkbox" class="chk" name="fait" ${slot.fait ? 'checked' : ''}>Réalisé comme prévu</label>`}
    ${rec ? `<label class="coche"><input type="checkbox" class="chk" name="type">Modifier aussi le créneau type (${esc(L.joursTexte(rec.jours))})</label>` : ''}
    <div class="rangee">${neuf ? '' : '<button type="button" class="btn rouge" data-choix="suppr">Supprimer</button>'}<button type="button" class="btn gris" data-fermer>Annuler</button><button class="btn plein">Enregistrer</button></div>
  </form>`, (choix, f) => {
    if (slot.lien) L.detacherTrajet(sansMorceaux, slot);   // touché à la main, il n'est plus refait par son créneau
    const versType = !!f.get('type');
    if (choix === 'suppr') {
      sem.slots = sansMorceaux.filter(x => x.id !== slot.id);
      // Supprimé aussi du créneau type : ce jour-là ne revient plus (et le créneau type disparaît s'il n'a plus de jour).
      if (versType && rec) {
        rec.jours = rec.jours.filter(j => j !== slot.j);
        if (!rec.jours.length) data.recurrents = data.recurrents.filter(x => x !== rec);
        L.regenerer(data); L.propager(data, [rec.id]);
      }
      maj(); dire('Créneau supprimé'); return;
    }
    const c = { id: slot.id, j: +f.get('j'), s: L.versHeure(f.get('s'), p0), e: L.versHeure(f.get('e'), p0), cat: f.get('cat') || slot.cat,
      salle: f.get('salle').trim(), affaires: f.get('affaires').trim(), notes: f.get('notes').trim(), fait: f.get('fait') ? true : null };
    c.titre = f.get('titre').trim() || cat(c.cat).nom;
    lireTrajets(f, c);
    // Sur plusieurs jours (V1.10.4) : coupé jour par jour autour des repas et du sommeil, jamais répété.
    const jf = f.get('jf') === '' ? c.j : +f.get('jf');
    if (jf < c.j) { dire('Le jour de fin doit être après le jour de début (même semaine).'); return false; }
    if (jf > c.j) {
      if (versType) { dire('Un créneau sur plusieurs jours ne change pas le créneau type : décoche « Modifier aussi le créneau type ».'); return false; }
      if (c.cat === 'sport') { c.seance = f.get('seance') || null; c.club = !!f.get('club'); }
      if (c.cat === catTravail()?.id) c.collegue = (f.get('collegue') || '').trim();
      if (slot.groupe) c.groupe = slot.groupe;
      const { morceaux: m2, gene } = L.morceauxMultiJours(sansMorceaux, { ...c, e: c.e }, jf, data.plage);
      if (gene) { dire(occupe(gene)); return false; }
      if (!m2.length) { dire('Il ne reste aucun moment libre entre ces deux heures.'); return false; }
      sem.slots = sansMorceaux.filter(x => x.id !== slot.id);
      m2.forEach((m, i) => { sem.slots = L.placer(sem.slots, L.morceau(c, m, i, m2.length)); });
      noterUsage(neuf ? 'creneau-ajout' : 'creneau-deplace');
      ui.derniereCat = c.cat;
      maj(); dire(`Créneau posé en ${m2.length} morceaux, autour des repas et du sommeil`); return;
    }
    if (!(c.e > c.s) || c.e > 26) { dire('La fin doit être après le début.'); return false; }
    if (slot.src) c.src = slot.src;
    if (slot.tache) c.tache = slot.tache;
    if (c.cat === 'sport') { c.seance = f.get('seance') || null; c.club = !!f.get('club'); }
    if (c.cat === catTravail()?.id) c.collegue = (f.get('collegue') || '').trim();
    if (slot.groupe) c.groupe = slot.groupe;
    let courant = sansMorceaux;
    const pris = L.poser(courant, c).gene;
    if (pris) { setTimeout(() => conflit(courant, c, pris, s => { courant = s; finir(); })); return; }
    finir();
    function finir() {
    if (c.fait && c.tache) { const t = data.taches.find(x => x.id === c.tache); if (t && !t.fait) cocherTache(t); }
    // Le créneau type suit (heures, titre, catégorie, salle ; un jour déplacé remplace l'ancien), ou il est créé.
    let recId = null;
    if (versType && rec) {
      Object.assign(rec, { titre: c.titre, cat: c.cat, s: c.s, e: c.e, salle: c.salle, affaires: c.affaires, avant: c.avant, apres: c.apres });
      if (c.j !== slot.j) rec.jours = [...new Set([...rec.jours.filter(j => j !== slot.j), c.j])];
      delete rec.exemple;
      recId = rec.id;
    }
    if (recId) c.src = `${recId}-${c.j}`;
    // Ce qui a servi : ajouté, déplacé (jour ou heures), corrigé (le reste), décoché.
    if (neuf) noterUsage(slot.tache ? 'tache-planifiee' : 'creneau-ajout');
    if (neuf && slot.tache) noterUsage('creneau-ajout');
    if (!neuf && (c.j !== slot.j || c.s !== slot.s || c.e !== slot.e)) noterUsage('creneau-deplace');
    else if (!neuf && (c.cat !== slot.cat || c.titre !== slot.titre || c.salle !== (slot.salle || '') || c.affaires !== (slot.affaires || '') || c.notes !== (slot.notes || ''))) noterUsage('creneau-corrige');
    if (!neuf && slot.fait && !c.fait) noterUsage('creneau-decoche');
    sem.slots = L.poser(courant, c).slots || courant;
    if (recId) { L.regenerer(data); L.propager(data, [recId]); }
    ui.derniereCat = c.cat;
    maj();
    }
  });
  dlg.querySelectorAll('input[name="cat"]').forEach(r => r.addEventListener('change', () => { $('#zone-sport').hidden = r.value !== 'sport'; $('#zone-travail').hidden = r.value !== catTravail()?.id; }));
  suivreLieu();
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

// « Ta semaine » : les créneaux types (ce qui revient chaque semaine), et les copies de semaine ou de jour.
// V1.10.5 : les créneaux types se règlent jour par jour (le lundi type, le mardi type…).
function actionsSemaine(jt = ui.jourType ?? L.jourSemaine(new Date())) {
  ui.jourType = jt;
  const cle = L.isoJour(ui.lundi), sem = semaineDe(cle);
  const recs = data.recurrents.filter(r => r.jours.includes(jt)).sort((a, b) => a.s - b.s);
  const autres = r => r.jours.filter(j => j !== jt);
  ouvrirDlg(`<form><h2>Ta semaine</h2>
    <div class="champ">Journées types : ce qui revient chaque semaine
      <div class="jours-type">${JOURS.map((n, j) => `<button type="button" data-choix="jt:${j}" aria-pressed="${j === jt}">${n.slice(0, 3)}</button>`).join('')}</div>
      ${recs.length ? `<ul class="list">${recs.map(r => `<li><button type="button" class="txt gauche" data-choix="r:${r.id}"><b><span class="dot" style="${teinte(r.cat)}"></span> ${esc(r.titre)}</b><small>${L.hhmm(r.s)} – ${L.hhmm(r.e)}${autres(r).length ? ` · aussi ${esc(L.joursTexte(autres(r)))}` : ' · seulement ce jour-là'}</small></button></li>`).join('')}</ul>` : `<p class="aide">Rien le ${JOURS[jt]} pour l’instant.</p>`}
      <button type="button" class="btn gris" data-choix="nouveau">Ajouter au ${JOURS[jt]} type</button>
      <button type="button" class="btn gris" data-choix="construire">Régler par catégories</button></div>
    <button type="button" class="btn gris" data-choix="precedente">Copier la semaine précédente</button>
    <button type="button" class="btn plein" data-fermer>Fermer</button>
  </form>`, (choix, f) => {
    if (choix.startsWith('jt:')) { setTimeout(() => actionsSemaine(+choix.slice(3))); return; }
    if (choix.startsWith('r:')) { editerRecurrent(data.recurrents.find(r => r.id === choix.slice(2)), jt); return false; }
    if (choix === 'nouveau') { editerRecurrent(null, jt); return false; }
    if (choix === 'construire') { construire(); return false; }
    if (choix === 'precedente') {
      const prec = data.semaines[L.isoJour(L.ajouterJours(ui.lundi, -7))];
      if (!prec || !prec.slots.length) { dire('La semaine précédente est vide.'); return false; }
      sem.slots = prec.slots.map(x => { const y = { ...x, id: L.uid(), fait: null }; delete y.xpDonne; if (y.groupe) y.groupe = 'c' + y.groupe; return y; });
      maj(); dire('Semaine précédente copiée'); return;
    }
  });
}

const joursChoix = (nom, sel = []) => `<div class="jours-choix">${JOURS.map((n, j) => `<label><input type="checkbox" name="${nom}" value="${j}" ${sel.includes(j) ? 'checked' : ''}><span>${n.slice(0, 2)}</span></label>`).join('')}</div>`;

// Un créneau type : ce qui revient chaque semaine, les jours cochés.
function editerRecurrent(r, jt = null) {
  const neuf = !r, v = r || { titre: '', cat: ui.derniereCat || data.cats[0]?.id, s: 8, e: 9, jours: [jt ?? L.jourSemaine(new Date())], salle: '', affaires: '' };
  // V1.10.9 : on coche les jours ; un ancien jour décoché garde l'ancien réglage (le créneau type se sépare en deux).
  ouvrirDlg(`<form><h2>${neuf ? (jt !== null ? `Nouveau, le ${JOURS[jt]}` : 'Nouveau créneau type') : 'Créneau type'}</h2>
    <p class="muted">Il revient chaque semaine, les jours cochés. Le changer met à jour ta semaine à partir d’aujourd’hui ; le passé et ce qui est déjà validé ne bougent pas.</p>
    <label class="champ">Titre<input name="titre" value="${esc(v.titre)}" placeholder="${esc(cat(v.cat).nom)}" autocomplete="off"></label>
    <div class="cats" role="radiogroup" aria-label="Catégorie">${data.cats.map(c => `<label><input type="radio" name="cat" value="${c.id}" ${c.id === v.cat ? 'checked' : ''}><span style="${teinte(c.id)}">${esc(c.nom)}</span></label>`).join('')}</div>
    <div class="champ">Jours${joursChoix('jours', v.jours)}${neuf ? '' : '<p class="aide">Un jour décoché garde son réglage d’avant.</p>'}</div>
    <div class="champs" style="grid-template-columns: 1fr 1fr"><label class="champ">Début<input type="time" name="s" value="${L.hhmm(v.s)}" required></label><label class="champ">Fin<input type="time" name="e" value="${L.hhmm(v.e)}" required></label></div>
    <div class="zone-lieu" ${SANS_LIEU.includes(v.cat) ? 'hidden' : ''}><label class="champ">Lieu<input name="salle" value="${esc(v.salle)}" autocomplete="off"></label>
    <label class="champ">Affaires à prendre<input name="affaires" value="${esc(v.affaires)}" autocomplete="off"></label>
    ${champsTrajet(v)}</div>
    <div class="rangee">${neuf ? '' : '<button type="button" class="btn rouge" data-choix="suppr" data-confirmer="Confirmer">Supprimer</button>'}<button type="button" class="btn gris" data-fermer>Annuler</button><button class="btn plein">Enregistrer</button></div></form>`, (choix, f) => {
    if (choix === 'suppr') {
      data.recurrents = data.recurrents.filter(x => x !== r);
      L.regenerer(data); L.propager(data, [r.id]);
      maj(); dire('Créneau type supprimé, à partir d’aujourd’hui'); return;
    }
    const p0 = data.plage[0];
    const c = { cat: f.get('cat') || v.cat, s: L.versHeure(f.get('s'), p0), e: L.versHeure(f.get('e'), p0), jours: f.getAll('jours').map(Number), salle: f.get('salle').trim(), affaires: f.get('affaires').trim() };
    c.titre = f.get('titre').trim() || cat(c.cat).nom;
    lireTrajets(f, c);
    if (!(c.e > c.s) || c.e > 26) { dire('La fin doit être après le début.'); return false; }
    if (!c.jours.length) { dire('Coche au moins un jour.'); return false; }
    // Un cours peut passer sur le déjeuner (il se coupera autour) ; deux créneaux types ordinaires, ou deux repas, non.
    const gene = data.recurrents.find(y => y !== r && y.jours.some(j => c.jours.includes(j)) && y.s < c.e && y.e > c.s && L.GARDES.includes(y.cat) === L.GARDES.includes(c.cat));
    // Entièrement sous le sommeil ou un repas, il ne resterait rien à poser.
    const couvert = !L.GARDES.includes(c.cat) && data.recurrents.find(y => y !== r && L.GARDES.includes(y.cat) && y.jours.some(j => c.jours.includes(j)) && y.s <= c.s && y.e >= c.e);
    if (couvert) { dire(`Ce moment est pris par « ${couvert.titre} » (${L.hhmm(couvert.s)} – ${L.hhmm(couvert.e)}, ${L.joursTexte(couvert.jours.filter(j => c.jours.includes(j)))}).`); return false; }
    if (gene) { dire(`Ce moment est déjà pris par le créneau type « ${gene.titre} » (${L.hhmm(gene.s)} – ${L.hhmm(gene.e)}, ${L.joursTexte(gene.jours.filter(j => c.jours.includes(j)))}).`); return false; }
    let x = r;
    const gardes = neuf ? [] : r.jours.filter(j => !c.jours.includes(j));
    if (gardes.length) { r.jours = gardes; x = { id: L.uid(), ...c }; data.recurrents.push(x); }
    else if (neuf) { x = { id: L.uid(), ...c }; data.recurrents.push(x); } else { Object.assign(r, c); delete r.exemple; }
    L.regenerer(data); L.propager(data, gardes.length ? [r.id, x.id] : [x.id]);
    ui.derniereCat = c.cat;
    noterUsage('creneau-type');
    maj(); dire(neuf ? 'Créneau type ajouté' : 'Créneau type modifié');
  });
  suivreLieu();
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
  // Étirer s'arrête au créneau voisin (V1.10.5) : on ne recouvre jamais un autre créneau.
  const voisins = data.semaines[L.isoJour(ui.lundi)].slots.filter(x => x.j === g.slot?.j && x.id !== g.slot?.id && (L.GARDES.includes(g.slot.cat) || !L.GARDES.includes(x.cat)));
  if (g.mode === 'etirer') return { col, j: g.slot.j, s: g.slot.s, e: Math.min(Math.max(g.slot.s + .5, h + .5), ...voisins.filter(x => x.s >= g.slot.e).map(x => x.s), p1) };
  if (g.mode === 'etirer-haut') return { col, j: g.slot.j, s: Math.max(Math.min(g.slot.e - .5, h), ...voisins.filter(x => x.e <= g.slot.s).map(x => x.e), p0), e: g.slot.e };
  const d = g.slot.e - g.slot.s;
  const s = Math.min(Math.max(g.slot.s + h - g.h0, p0), p1 - d);
  return { col, j: +col.dataset.j, s, e: s + d };
}
function apercu() {
  const c = cible(geste), f = geste.fantome;
  f.style.cssText = `${teinte(geste.slot ? geste.slot.cat : ui.derniereCat || data.cats[0]?.id)};--s:${c.s - data.plage[0]};--d:${c.e - c.s}`;
  const pris = geste.mode === 'deplacer' && L.poser(L.sansTrajets(data.semaines[L.isoJour(ui.lundi)].slots), { ...geste.slot, j: c.j, s: c.s, e: c.e }).gene;
  f.classList.toggle('refus', !!pris);
  f.textContent = pris ? `Sur : ${pris.titre}` : `${L.hhmm(c.s)}–${L.hhmm(c.e)}`;
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
    slot, blk, bas: !!blk && e.clientY > blk.getBoundingClientRect().bottom - 14, haut: !!blk && e.clientY < blk.getBoundingClientRect().top + 14, pid: e.pointerId };
  geste.timer = setTimeout(() => {
    if (!geste) return;
    geste.mode = slot ? (geste.bas ? 'etirer' : geste.haut ? 'etirer-haut' : 'deplacer') : 'creer';
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
  finDernierGeste = Date.now();
  if (g.mode === 'creer') return editerSlot(nouveauSlot(c.j, c.s, c.e), cle);
  const sem = data.semaines[cle];
  // Un morceau glissé seul se détache de son créneau.
  const deplace = { ...g.slot, j: c.j, s: c.s, e: c.e }; delete deplace.groupe;
  const base = L.sansTrajets(sem.slots);
  const detacher = () => { if (g.slot.lien) L.detacherTrajet(base, g.slot); };
  delete deplace.lien; delete deplace.cote;
  const pose = L.poser(base, deplace);
  if (pose.gene) { rendre(); return conflit(base, deplace, pose.gene, s => { detacher(); sem.slots = s; noterUsage('creneau-deplace'); maj(); }); }
  detacher();
  sem.slots = pose.slots;
  noterUsage('creneau-deplace');
  maj();
});
vueSem.addEventListener('pointercancel', finGeste);
// Glisser vers la gauche ou la droite change de semaine (retour des testeurs, 24/10), sauf juste après un geste sur la grille.
let glisse = null, finDernierGeste = 0;
vueSem.addEventListener('touchstart', e => {
  if (e.touches.length !== 1) { glisse = null; return; }
  glisse = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
}, { passive: true });
// V1.10.6 : la semaine suit le doigt pendant le glissement, puis part d'un côté (ou revient si le geste est trop court).
vueSem.addEventListener('touchmove', e => {
  if (!glisse || (geste && geste.mode !== 'attente') || e.target.closest('input, select, textarea, .groupe')) return;
  const t = e.touches[0], dx = t.clientX - glisse.x, dy = t.clientY - glisse.y;
  if (glisse.horizontal === undefined && Math.hypot(dx, dy) > 10) glisse.horizontal = Math.abs(dx) > Math.abs(dy) * 1.3;
  const wk = glisse.horizontal && $('#semaine .wk');
  if (!wk) return;
  wk.style.transition = 'none';
  wk.style.transform = `translateX(${dx}px)`;
  wk.style.opacity = 1 - Math.min(Math.abs(dx) / 700, .35);
}, { passive: true });
vueSem.addEventListener('touchend', e => {
  if (!glisse) return;
  const t = e.changedTouches[0], dx = t.clientX - glisse.x, vite = Math.abs(dx) / (Date.now() - glisse.t) > .5;
  const horizontal = glisse.horizontal;
  glisse = null;
  const wk = $('#semaine .wk');
  if (!horizontal || !wk || (geste && geste.mode !== 'attente') || Date.now() - finDernierGeste < 400) return;
  if (Math.abs(dx) > 70 || (vite && Math.abs(dx) > 30)) {
    wk.style.transition = 'transform .16s ease-in, opacity .16s';
    wk.style.transform = `translateX(${dx < 0 ? -110 : 110}%)`; wk.style.opacity = '0';
    setTimeout(() => changerSemaine(dx < 0 ? 1 : -1), 150);
  } else {
    wk.style.transition = 'transform .22s cubic-bezier(.2, .9, .3, 1.2), opacity .22s';
    wk.style.transform = ''; wk.style.opacity = '';
  }
});
function changerSemaine(sens) {
  ui.lundi = L.ajouterJours(ui.lundi, 7 * sens);
  vueSemaine();
  $('#semaine .wk')?.classList.add(sens > 0 ? 'vient-droite' : 'vient-gauche');
}
vueSem.addEventListener('contextmenu', e => { if (e.target.closest('.wk')) e.preventDefault(); });
document.addEventListener('touchmove', e => { if (geste && geste.mode !== 'attente') e.preventDefault(); }, { passive: false });

// ---------- Notes ----------

function objectifsHtml(horizon, per, gestion) {
  const os = objectifs(horizon, per);
  return `<ul class="list">${os.map(o => {
    const enfants = data.objectifs.filter(x => x.parent === o.id);
    const parent = o.parent && data.objectifs.find(x => x.id === o.parent);
    const sous = enfants.length ? `${enfants.filter(x => x.fait).length} sur ${enfants.length} sous-objectifs` : parent ? `Pour : ${parent.txt}` : '';
    return `<li><input type="checkbox" class="chk" data-act="objectif" data-id="${o.id}" ${o.fait ? 'checked' : ''} aria-label="Atteint">
      <div class="txt"${gestion ? ` data-act="editer-objectif" data-id="${o.id}" role="button" tabindex="0"` : ''}><b>${esc(o.txt)}</b>${sous ? `<small>${esc(sous)}</small>` : ''}</div></li>`;
  }).join('')}</ul>`;
}

// Un groupe repliable : titre, résumé, contenu (Réglages, Sport, Notes).
const groupe = (id, titre, resume, corps) => `<details class="liste groupe" data-id="r-${id}" ${ui.ouvertes.has('r-' + id) ? 'open' : ''}><summary><span class="txt"><b>${titre}</b><small>${resume}</small></span></summary><div class="groupe-corps">${corps}</div></details>`;

const listeHtml = l => {
  const items = [...l.items].sort((a, b) => a.fait - b.fait);
  return `<details class="liste" data-id="${l.id}" ${ui.ouvertes.has(l.id) ? 'open' : ''}><summary>${esc(l.nom)}<span class="pill">${l.items.filter(i => !i.fait).length}</span></summary>
    <ul class="list">${items.map(i => `<li><input type="checkbox" class="chk" data-act="item" data-liste="${l.id}" data-id="${i.id}" ${i.fait ? 'checked' : ''} aria-label="Fait"><div class="txt"><b>${esc(i.txt)}</b></div><button class="x" data-act="suppr-item" data-liste="${l.id}" data-id="${i.id}" aria-label="Supprimer">${I.x}</button></li>`).join('')}</ul>
    <div class="pied"><form class="ajout" data-form="item" data-id="${l.id}"><input name="txt" placeholder="Ajouter à la liste" aria-label="Ajouter à ${esc(l.nom)}" autocomplete="off"><button aria-label="Ajouter">${I.plus}</button></form>
    <div class="rangee">${l.items.some(i => i.fait) ? `<button class="btn gris petit" data-act="vider-liste" data-id="${l.id}">Retirer les cochés</button>` : ''}<button class="btn gris petit" data-act="partager-liste" data-id="${l.id}">Partager</button><button class="btn gris petit" data-act="liste" data-id="${l.id}">Renommer, étiquettes</button></div></div></details>`;
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
  data.objectifs.filter(o => m(o.txt)).forEach(o => r.push(`<li><div class="txt"><b>${esc(o.txt)}</b><small>Objectif ${nomHorizon[o.horizon]}</small></div></li>`));
  data.semaines[cleSem(new Date())]?.slots.filter(x => m(x.titre) || m(x.salle) || m(x.affaires) || m(x.notes))
    .forEach(x => r.push(`<li data-act="slot" data-id="${x.id}"><div class="txt"><b>${esc(x.titre)}</b><small>Créneau · ${JOURS[x.j]} ${L.hhmm(x.s)}</small></div></li>`));
  return r.length ? `<ul class="list">${r.join('')}</ul>` : `<p class="vide">Rien ne correspond à « ${esc(q)} ».</p>`;
}

function vueNotes() {
  $('#notes').innerHTML = `<header class="top"><div><h1>Notes</h1><p>Tâches, habitudes, objectifs et listes</p></div></header>
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
  const os = objectifs('semaine', pS), faits = os.filter(o => o.fait).length, lundiH = L.lundiDe(L.momentLogique(now).date);
  // Moins dense (retour des testeurs, 24/10) : on ajoute avec le bouton +, chaque élément s'ouvre pour ses réglages.
  let h = tags.length ? `<div class="tags">${['', ...tags].map(t => `<button data-act="tag" data-tag="${esc(t)}" aria-pressed="${(ui.tag || '') === t}">${t ? esc(t) : 'Tout'}</button>`).join('')}</div>` : '';

  const ouvertes = data.taches.filter(t => !t.fait).sort((a, b) => (a.echeance || '9999').localeCompare(b.echeance || '9999') || (a.heure ?? 99) - (b.heure ?? 99) || (a.priorite || 2) - (b.priorite || 2));
  const faites = data.taches.filter(t => t.fait).sort((a, b) => (b.faitLe || '').localeCompare(a.faitLe || '')).slice(0, 20);
  if (actif('taches')) h += `<div class="sec"><h2>Tâches <span>${pl(ouvertes.length, 'à faire', 'à faire')}<button class="plus-sec" data-act="ajouter" data-id="tache" aria-label="Ajouter une tâche">${I.plus}</button></span></h2>${ouvertes.length ? `<ul class="list">${ouvertes.map(tacheHtml).join('')}</ul>` : '<p class="vide">Aucune tâche. Ajoute-en avec le + à côté du titre.</p>'}
    ${faites.length ? `<details class="liste" data-id="faites" ${ui.ouvertes.has('faites') ? 'open' : ''}><summary>Faites récemment<span class="pill">${faites.length}</span></summary><ul class="list">${faites.map(tacheHtml).join('')}</ul></details>` : ''}</div>`;

  if (actif('habitudes')) h += `<div class="sec"><h2>Habitudes <span>cette semaine<button class="plus-sec" data-act="ajouter" data-id="habitude" aria-label="Ajouter une habitude">${I.plus}</button></span></h2>${data.habitudes.length ? `<ul class="list">${data.habitudes.map(hb => `<li class="colonne">
      <div class="txt" data-act="editer-habitude" data-id="${hb.id}" role="button" tabindex="0"><b>${esc(hb.nom)}</b><small>${esc([hb.freq === 'jour' ? 'Chaque jour' : `${L.faitsSemaine(hb, lundiH)}/${hb.freq} cette semaine`, L.horairesTexte(hb.horaires)].filter(Boolean).join(' · '))}</small></div>
      ${regulariteHtml(hb, lundiH)}</li>`).join('')}</ul>` : '<p class="vide">Aucune habitude. Ajoute-en avec le + à côté du titre.</p>'}</div>`;

  if (actif('objectifs')) {
    const om = objectifs('mois', pM), oa = objectifs('annee', pA);
    h += `<div class="sec"><h2>Objectifs <span><button class="plus-sec" data-act="ajouter" data-id="objectif" aria-label="Ajouter un objectif">${I.plus}</button></span></h2>
      ${groupe('obj-semaine', 'Objectifs de la semaine', `${faits} sur ${os.length} atteints`, os.length ? `<div class="bar"><i style="width:${faits / os.length * 100}%"></i></div>${objectifsHtml('semaine', pS, true)}` : '<p class="vide">Aucun pour cette semaine.</p>')}
      ${groupe('obj-mois', 'Objectifs du mois', `${now.toLocaleDateString('fr-FR', { month: 'long' })} · ${om.filter(o => o.fait).length} sur ${om.length}`, om.length ? objectifsHtml('mois', pM, true) : '<p class="vide">Aucun pour ce mois.</p>')}
      ${groupe('obj-annee', 'Objectifs de l’année', `${pA.replace('-', '–')} · ${oa.filter(o => o.fait).length} sur ${oa.length}`, oa.length ? objectifsHtml('annee', pA, true) : '<p class="vide">Aucun pour cette année.</p>')}</div>`;
  }
  if (actif('listes')) h += `<div class="sec"><h2>Listes <span><button class="plus-sec" data-act="ajouter" data-id="liste" aria-label="Ajouter une liste">${I.plus}</button></span></h2>${data.listes.filter(garde).map(listeHtml).join('') || '<p class="vide">Aucune liste. Ajoute-en avec le + à côté du titre.</p>'}</div>`;
  const notes = data.notes.filter(garde).sort((a, b) => (b.epingle ? 1 : 0) - (a.epingle ? 1 : 0) || (b.maj || 0) - (a.maj || 0));
  if (actif('notes')) h += `<div class="sec"><h2>Notes libres <span><button class="plus-sec" data-act="ajouter" data-id="note" aria-label="Ajouter une note">${I.plus}</button></span></h2>${notes.length ? `<div class="notes">${notes.map(noteHtml).join('')}</div>` : '<p class="vide">Aucune note. Ajoute-en avec le + à côté du titre.</p>'}</div>`;
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
  const v = t || { titre: '', echeance: '', heure: null, priorite: 2, fac: false, rep: [], projet: null, sous: [], ...defaut };
  const repAvant = JSON.stringify(L.repDe(v));
  ouvrirDlg(`<form><h2>${neuf ? 'Nouvelle tâche' : 'Tâche'}</h2>
    <label class="champ">Titre<input name="titre" value="${esc(v.titre)}" autocomplete="off"></label>
    <div class="champs" style="grid-template-columns: 1fr 1fr">
      <label class="champ">${L.repDe(v).length ? 'Prochaine fois' : 'Échéance'}<input type="date" name="echeance" value="${v.echeance || ''}"></label>
      <label class="champ">Heure (facultatif)<input type="time" name="heure" value="${typeof v.heure === 'number' ? L.hhmm(v.heure) : ''}"></label>
    </div>
    <div class="rangee"><button type="button" class="btn gris petit" data-vider="echeance">Retirer l’échéance</button><button type="button" class="btn gris petit" data-vider="heure">Retirer l’heure</button></div>
    ${horairesChamp('Revient chaque semaine', L.repDe(v), 'Plusieurs jours possibles, chacun avec son heure. Cochée, la tâche passe toute seule à la fois suivante.')}
    <div class="champ">Priorité${radios('priorite', { 1: 'Haute', 2: 'Normale', 3: 'Basse' }, v.priorite || 2)}</div>
    ${data.profil.etudes === false && !v.fac ? '' : `<label class="coche"><input type="checkbox" class="chk" name="fac" ${v.fac ? 'checked' : ''}>Rendu ou partiel de fac (compte à rebours)</label>`}
    ${actif('travail') ? `<label class="coche"><input type="checkbox" class="chk" name="travail" ${v.travail ? 'checked' : ''}>Tâche du travail</label>` : ''}
    <div class="champ">Étapes<div class="etapes">${(v.sous || []).map(etapeHtml).join('')}</div>
      <div class="ajout"><input data-nouvelle-etape placeholder="Nouvelle étape" aria-label="Nouvelle étape" autocomplete="off"><button type="button" data-ajout-etape aria-label="Ajouter l’étape">${I.plus}</button></div></div>
    <div class="rangee">${neuf ? '' : '<button type="button" class="btn rouge" data-choix="suppr" data-confirmer="Confirmer">Supprimer</button>'}<button type="button" class="btn gris" data-choix="planifier">Planifier un créneau</button></div>
    <div class="rangee"><button type="button" class="btn gris" data-fermer>Annuler</button><button class="btn plein">Enregistrer</button></div>
  </form>`, (choix, f) => {
    if (choix === 'suppr') { data.taches = data.taches.filter(x => x !== t); maj(); dire('Tâche supprimée'); return; }
    const faits = new Set(f.getAll('sf'));
    const h = L.versHeure(f.get('heure'), 1), rep = lireHoraires(f);
    const champs = { titre: f.get('titre').trim(), echeance: f.get('echeance') || null, heure: Number.isNaN(h) ? null : h, priorite: +f.get('priorite') || 2, fac: !!f.get('fac'), travail: !!f.get('travail'),
      rep, projet: v.projet || null,
      sous: f.getAll('st').map((txt, i) => ({ txt: txt.trim(), fait: faits.has(String(i)) })).filter(s => s.txt) };
    if (!champs.titre) { dire('Donne un titre à la tâche.'); return false; }
    // Répétition nouvelle ou changée, ou pas de date : la prochaine fois se calcule à partir d'aujourd'hui.
    if (rep.length && (!champs.echeance || JSON.stringify(rep) !== repAvant)) {
      const n = L.prochaineOccurrence(rep, L.isoJour(L.momentLogique(new Date()).date), -1, true);
      Object.assign(champs, { echeance: n.iso, heure: n.h });
    }
    let tache = t;
    if (neuf) { tache = { id: L.uid(), fait: false, ...champs }; data.taches.push(tache); } else { Object.assign(t, champs); delete t.recurrence; }
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
// Une liste et non un objet : un objet range les clés chiffrées avant « jour ».
const FREQS = [['jour', 'Chaque jour'], ...[1, 2, 3, 4, 5, 6].map(n => [String(n), `${n} fois par semaine`])];

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

// La semaine en cours d'une habitude : un rond par jour, à toucher pour cocher (les jours à venir sont grisés).
function regulariteHtml(hb, lundi) {
  const auj = L.isoJour(L.momentLogique(new Date()).date);
  return `<div class="reg7">${Array.from({ length: 7 }, (_, i) => {
    const d = L.ajouterJours(lundi, i), iso = L.isoJour(d), lettre = 'LMMJVSD'[i];
    if (iso > auj) return `<span class="futur">${lettre}</span>`;
    const on = hb.faits.includes(iso);
    return `<button class="${on ? 'on' : ''}" data-act="habitude" data-id="${hb.id}" data-jour="${iso}" aria-pressed="${on}" aria-label="${esc(hb.nom)}, ${d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}">${lettre}</button>`;
  }).join('')}</div>`;
}

function vueSport() {
  const { date, h } = L.momentLogique(new Date());
  const lundi = L.lundiDe(date), deLundi = L.isoJour(lundi), j = L.jourSemaine(date);
  const club = clubFaits();
  const nbPerso = data.journal.filter(e => e.date >= deLundi).length, nbClub = club.filter(c => c.date >= deLundi).length;
  // La prochaine séance : cette semaine, sinon la semaine d'après.
  const sem = data.types.length ? semaineDe(cleSem(date)) : null, suiv = data.types.length ? semaineDe(L.isoJour(L.ajouterJours(lundi, 7))) : null;
  const p = sem?.slots.filter(x => x.cat === 'sport' && (x.j > j || (x.j === j && x.e > h))).sort((a, b) => a.j - b.j || a.s - b.s)[0]
    || suiv?.slots.filter(x => x.cat === 'sport').sort((a, b) => a.j - b.j || a.s - b.s)[0];
  const pSuiv = p && !sem.slots.includes(p);
  const st = p && data.seances.find(s => s.id === p.seance);
  let html = `<header class="top"><div><h1>Sport</h1><p>${nbPerso + nbClub} séance${nbPerso + nbClub > 1 ? 's' : ''} cette semaine${nbClub ? `, dont ${nbClub} au club` : ''}</p></div></header>`;
  if (!actif('sport')) { $('#sport').innerHTML = html; return; }

  // En haut, seulement la prochaine séance ; le reste est rangé dans des groupes repliables (retour des testeurs, 24/10).
  html += `<div class="sec"><h2>Prochaine séance ${p ? `<span>${JOURS[p.j]}${pSuiv ? ' prochain' : ''} · ${L.hhmm(p.s)}</span>` : ''}</h2><div class="card seance">
    ${p ? `<b>${esc(p.titre)}${p.club ? ' · club' : ''}</b>` : '<p class="muted">Aucun créneau Sport prévu : ajoute-en un dans Semaine.</p>'}
    ${st ? `<table>${st.exos.filter(x => exo(x.exo)).map(x => `<tr><td>${esc(exo(x.exo).nom)}</td><td>${x.series} × ${cibleTxt(exo(x.exo), x.cible)}</td></tr>`).join('')}</table>`
      : p && !p.club ? '<p class="muted">Pas de séance prévue sur ce créneau : touche-le dans Semaine pour en choisir une.</p>' : ''}
    <button class="btn plein" data-act="seance" data-seance="${st ? st.id : ''}" data-slot="${p && !pSuiv && p.j === j ? p.id : ''}">${st ? 'Commencer cette séance' : 'Commencer une séance libre'}</button></div></div>`;

  const groupes = [];
  const avecProg = data.exos.filter(e => L.progression(data.journal, e.id, e.type).length);
  if (avecProg.length) {
    if (!avecProg.some(e => e.id === ui.progExo)) ui.progExo = avecProg[0].id;
    const e = exo(ui.progExo), pts = L.progression(data.journal, e.id, e.type), u = UNITE[e.type] === ' reps' ? ' kg' : UNITE[e.type];
    groupes.push(groupe('s-prog', 'Progression', `Record ${esc(e.nom)} : ${Math.max(...pts.map(x => x.val))}${u}`, `<div class="chart">
      <select class="choix" data-act="prog-exo" aria-label="Exercice">${avecProg.map(x => `<option value="${x.id}" ${x.id === e.id ? 'selected' : ''}>${esc(x.nom)}</option>`).join('')}</select>
      ${courbe(pts, u)}</div>`));
  }
  const entrees = [...data.journal.map(e => ({ ...e, club: false })), ...club.map(c => ({ ...c, club: true }))].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  groupes.push(groupe('s-journal', 'Journal', entrees.length ? `${pl(entrees.length, 'séance récente', 'séances récentes')}` : 'Vide pour l’instant', entrees.length ? `<ul class="list">${entrees.map(e => {
    const quand = L.deIso(e.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
    const sous = e.club ? `Club · ${L.heures(e.duree)}` : `${e.series.length} exercice${e.series.length > 1 ? 's' : ''} · ${e.series.reduce((k, x) => k + x.sets.length, 0)} séries${e.ressenti ? ` · ressenti ${e.ressenti}/5` : ''}`;
    return `<li ${e.club ? '' : `data-act="journal" data-id="${e.id}" role="button" tabindex="0"`}><div class="txt"><b>${esc(e.nom)}</b><small>${esc(sous)}</small></div><span class="pill">${quand}</span></li>`;
  }).join('')}</ul>` : '<p class="vide">Tes séances terminées et tes entraînements du club validés s’afficheront ici.</p>'));
  groupes.push(groupe('s-types', 'Séances types', pl(data.seances.length, 'séance', 'séances'), `${data.seances.length ? `<ul class="list">${data.seances.map(s => `<li data-act="seance-type" data-id="${s.id}" role="button" tabindex="0"><div class="txt"><b>${esc(s.nom)}</b><small>${s.exos.length} exercice${s.exos.length > 1 ? 's' : ''}</small></div></li>`).join('')}</ul>` : '<p class="vide">Une séance type, c’est une liste d’exercices avec les séries prévues.</p>'}
    <button class="btn gris" data-act="seance-type">Nouvelle séance type</button>`));
  groupes.push(groupe('s-exos', 'Exercices', pl(data.exos.length, 'exercice', 'exercices'), `${data.exos.length ? `<ul class="list">${data.exos.map(e => `<li data-act="exo" data-id="${e.id}" role="button" tabindex="0"><div class="txt"><b>${esc(e.nom)}</b><small>${L.TYPES_EXO[e.type]}${e.notes ? ` · ${esc(e.notes)}` : ''}</small></div></li>`).join('')}</ul>` : ''}
    <form class="ajout" data-form="exo"><input name="txt" placeholder="Nouvel exercice" aria-label="Nouvel exercice" autocomplete="off"><select name="type" aria-label="Type">${Object.entries(L.TYPES_EXO).map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</select><button aria-label="Ajouter">${I.plus}</button></form>`));

  const auj = L.isoJour(date), sports = sportsDuProfil();
  groupes.push(groupe('s-sports', 'Mes sports', sports.length ? esc(sports.join(' · ')) : 'Aucun choisi', `
    ${sports.length ? `<div class="cats">${sports.map(sp => `<span class="theme" style="--c:var(--ink)">${esc(sp)}<button class="x" data-act="retirer-sport" data-sport="${esc(sp)}" aria-label="Retirer ${esc(sp)}">${I.x}</button></span>`).join('')}</div>` : '<p class="aide">Choisis ton sport : l’app te propose ses exercices et des séances prêtes.</p>'}
    <form class="ajout" data-form="sport"><input name="txt" list="sports-suggestions" maxlength="40" placeholder="N’importe quel sport : escrime, judo…" aria-label="Ajouter un sport" autocomplete="off"><datalist id="sports-suggestions">${L.SPORTS.filter(x => !sports.includes(x)).map(x => `<option value="${x}">`).join('')}</datalist><button aria-label="Ajouter">${I.plus}</button></form>
    ${sports.map(sp => `<button class="btn gris" data-act="sport-depart" data-sport="${esc(sp)}">${L.conseilsPour(sp) ? `Ajouter les exercices et séances de ${esc(sp.toLowerCase())}` : `Séances de départ pour ${esc(sp.toLowerCase())} (gainage, récupération)`}</button>`).join('')}
    <p class="aide">Marque tes entraînements et tes matchs comme « club » dans leur créneau : validés, ils comptent dans le journal. Les exercices proposés sont du renforcement courant, à adapter avec ton coach.</p>`));
  const avenir = data.competitions.filter(c => c.date >= auj).sort((a, b) => a.date.localeCompare(b.date));
  const passees = data.competitions.filter(c => c.date < auj).sort((a, b) => b.date.localeCompare(a.date));
  const compHtml = c => `<li data-act="competition" data-id="${c.id}" role="button" tabindex="0"><div class="txt"><b>${esc(c.nom)}</b><small>${[c.sport, c.lieu, c.categorie, c.resultat && `Résultat : ${c.resultat}`].filter(Boolean).map(esc).join(' · ')}</small></div><span class="pill${c.date < auj && !c.resultat ? ' retard' : ''}">${c.date >= auj ? `J-${L.joursAvant(c.date, date)}` : c.resultat ? L.deIso(c.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : 'Résultat ?'}</span></li>`;
  groupes.push(groupe('s-comp', 'Compétitions', avenir.length ? `Prochaine : ${esc(avenir[0].nom)}, J-${L.joursAvant(avenir[0].date, date)}` : 'Aucune à venir', `
    ${avenir.length || passees.length ? `<ul class="list">${[...avenir, ...passees.slice(0, 5)].map(compHtml).join('')}</ul>` : '<p class="vide">Ajoute tes matchs et tournois : compte à rebours sur Aujourd’hui, et une séance adaptée la veille.</p>'}
    <button class="btn gris" data-act="competition">Nouvelle compétition</button>
    <p class="aide">Veille : séance raccourcie de moitié, sans nouvel exercice. Jour J : pas de renfo. Lendemain : récupération ou repos. Des repères d’organisation, pas un conseil médical.</p>`));
  groupes.push(groupe('s-repos', 'Minuteur de repos', `${Math.floor(data.repos / 60)}:${String(data.repos % 60).padStart(2, '0')} entre deux séries`, `<div class="reglage"><span class="txt">Entre deux séries</span><select data-act="repos" aria-label="Durée du repos">${[30, 45, 60, 90, 120, 180].map(s => `<option value="${s}" ${s === data.repos ? 'selected' : ''}>${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}</option>`).join('')}</select></div>`));
  html += `<div class="sec groupes">${groupes.join('')}</div>
    <button class="btn gris" data-act="masquer-sport">Je ne fais pas de sport : masquer cet onglet</button>`;
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

function editerExo(e, neuf = false) {
  ouvrirDlg(`<form><h2>${neuf ? 'Nouvel exercice' : esc(e.nom)}</h2>
    <label class="champ">Nom<input name="nom" value="${esc(e.nom)}" autocomplete="off"></label>
    <div class="champ">Ce qu’on note${radios('type', L.TYPES_EXO, e.type)}</div>
    <label class="champ">Notes<input name="notes" value="${esc(e.notes)}" placeholder="Consignes, réglage de la machine…" autocomplete="off"></label>
    <div class="rangee">${neuf ? '' : '<button type="button" class="btn rouge" data-choix="suppr" data-confirmer="Confirmer">Supprimer</button>'}<button type="button" class="btn gris" data-fermer>Annuler</button><button class="btn plein">Enregistrer</button></div></form>`, (choix, f) => {
    if (choix === 'suppr') {
      data.exos = data.exos.filter(x => x !== e);
      data.seances.forEach(s => { s.exos = s.exos.filter(x => x.exo !== e.id); });
      maj(); return;
    }
    if (!f.get('nom').trim()) { dire('Donne un nom à l’exercice.'); return false; }
    Object.assign(e, { nom: f.get('nom').trim(), type: f.get('type'), notes: f.get('notes').trim() });
    if (neuf) data.exos.push(e);
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

function editerHabitude(hb, neuf = false) {
  // V1.10.30 : des jours cochés à la même heure (ou sans heure) se règlent simplement ; sinon, jour par jour.
  const hs = L.horairesDe(hb), heures = [...new Set(hs.map(x => x.h))], jours = [...new Set(hs.map(x => x.j))];
  const simple = heures.length <= 1 && jours.length === hs.length;
  const sel = simple && hs.length ? jours : simple && hb.freq === 'jour' ? [0, 1, 2, 3, 4, 5, 6] : [];
  const heure = simple && typeof heures[0] === 'number' ? L.hhmm(heures[0]) : '';
  ouvrirDlg(`<form><h2>${neuf ? 'Nouvelle habitude' : esc(hb.nom)}</h2>
    <label class="champ">Nom<input name="nom" value="${esc(hb.nom)}" autocomplete="off" required></label>
    <div class="champs" style="grid-template-columns: 1fr 1fr">
      <label class="champ">À tenir<select name="freq">${FREQS.map(([v, n]) => `<option value="${v}" ${String(hb.freq) === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="champ">Durée<select name="duree">${[15, 30, 45, 60, 90, 120].map(m => `<option value="${m}" ${m === Math.round((hb.duree || .5) * 60) ? 'selected' : ''}>${m < 60 ? m + ' min' : L.heures(m / 60)}</option>`).join('')}</select></label>
    </div>
    <div data-simple ${simple ? '' : 'hidden'}>
      <div class="champ">Les jours${joursChoix('jr', sel)}</div>
      <label class="champ">À (facultatif)<input type="time" name="heure" value="${heure}"><span class="aide">Avec une heure, l’habitude apparaît ces jours-là dans Semaine et Aujourd’hui, avec un rappel.</span></label>
      <button type="button" class="btn gris petit" data-par-jour-ouvrir>Une heure différente selon le jour</button>
    </div>
    <div data-par-jour ${simple ? 'hidden' : ''}>${horairesChamp('Jour par jour', simple ? [] : hs, 'Chaque jour avec une heure apparaît dans Semaine et Aujourd’hui, avec un rappel. Plusieurs fois le même jour : ajoute ce jour deux fois.')}</div>
    ${neuf ? '' : `<p class="muted">${hb.faits.length} jour${hb.faits.length > 1 ? 's' : ''} tenu${hb.faits.length > 1 ? 's' : ''} en tout.</p>`}
    <div class="rangee">${neuf ? '' : '<button type="button" class="btn rouge" data-choix="suppr" data-confirmer="Confirmer">Supprimer</button>'}<button type="button" class="btn gris" data-fermer>Annuler</button><button class="btn plein">Enregistrer</button></div></form>`, (choix, f) => {
    if (choix === 'suppr') { data.habitudes = data.habitudes.filter(x => x !== hb); maj(); return; }
    if (!f.get('nom').trim()) { dire('Donne un nom à l’habitude.'); return false; }
    hb.nom = f.get('nom').trim();
    hb.freq = f.get('freq') === 'jour' ? 'jour' : +f.get('freq');
    hb.duree = +f.get('duree') / 60;
    const h = f.get('heure') ? L.versHeure(f.get('heure'), 1) : NaN;
    hb.horaires = dlg.querySelector('[data-simple]').hidden ? lireHoraires(f) : f.getAll('jr').map(j => ({ j: +j, h: Number.isNaN(h) ? null : h }));
    delete hb.heure; delete hb.jours;
    if (neuf) data.habitudes.push(hb);
    noterUsage('habitudes');
    maj();
  });
}

// Thème (V1.10.7) : deux couleurs choisies comme dans une app de dessin. La barre choisit la teinte ; le carré, la nuance :
// de gauche à droite, du gris à la couleur vive ; de haut en bas, du clair au foncé. Le gris, le blanc et le noir y sont.
// Fond « Auto » : l'app suit l'iPhone, clair ou sombre ; la couleur des boutons et de la flamme s'y applique quand même.
// Les anciens thèmes (avant la 1.10.5) donnent leurs couleurs : clair et sombre deviennent un fond.
const couleursTheme = () => data.couleurs || (data.theme === 'nuit' ? { fond: '#0B0D11' } : data.theme === 'clair' ? { fond: '#F4F5F8' } : {});
function appliquerTheme(c = couleursTheme()) {
  const r = document.documentElement, p = c.fond && L.paletteTheme(c.fond, c.accent || '#FF9600');
  r.removeAttribute('style'); delete r.dataset.theme;
  if (p) for (const [k, v] of Object.entries(p)) r.style.setProperty(k, v);
  else if (c.accent) {
    r.style.setProperty('--accent', c.accent); r.style.setProperty('--flamme', c.accent);
    r.style.setProperty('--on-accent', L.texteSur(c.accent) === 'light' ? '#ffffff' : '#15171c');
  }
  // La barre d'état de l'iPhone prend la couleur du fond.
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => { m.content = p ? p['--bg'] : m.media.includes('dark') ? '#0B0D11' : '#E8EAF0'; });
}
const versHsv = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255), max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  const h = !d ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, max ? d / max : 0, max];
};
const depuisHsv = (h, s, v) => '#' + [5, 3, 1].map(n => { const k = (n + h / 60) % 6; return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1)))).toString(16).padStart(2, '0'); }).join('');
// La fenêtre du choix de couleur : la couleur change en direct ; Annuler remet celle d'avant.
function choisirCouleur(id) {
  const avant = { ...couleursTheme() };
  const val = avant[id] || (id === 'accent' ? '#FF9600' : matchMedia('(prefers-color-scheme: dark)').matches ? '#0B0D11' : '#E8EAF0');
  ouvrirDlg(`<form><h2>${id === 'fond' ? 'Fond et bulles' : 'Boutons et flamme'}</h2>${choixCouleur(id, val)}
    <p class="aide">La barre choisit la teinte, le carré la nuance : à gauche les gris, en haut le clair, en bas le foncé.</p>
    <div class="rangee"><button type="button" class="btn gris" data-choix="annuler">Annuler</button><button class="btn plein">OK</button></div></form>`, choix => {
    if (choix === 'annuler') { data.couleurs = avant; maj(); }
  });
}
const choixCouleur = (id, val) => {
  const [h, s, v] = versHsv(L.couleurSure(val));
  return `<div class="choix-couleur" data-couleur="${id}" data-h="${h}" data-s="${s}" data-v="${v}" style="--h:${h};--sx:${s * 100}%;--vy:${(1 - v) * 100}%;--hx:${h / 3.6}%;--c:${L.couleurSure(val)}">
    <div class="nuances" data-zone="sv"><i></i></div><div class="teintes" data-zone="h"><i></i></div></div>`;
};
document.addEventListener('pointerdown', e => {
  const zone = e.target.closest('[data-zone]'), boite = zone?.closest('[data-couleur]');
  if (!boite) return;
  e.preventDefault();
  try { zone.setPointerCapture(e.pointerId); } catch {}
  const id = boite.dataset.couleur;
  let { h, s, v } = boite.dataset, couleur = null;
  [h, s, v] = [+h, +s, +v];
  const bouge = ev => {
    const r = zone.getBoundingClientRect(), x = Math.min(Math.max((ev.clientX - r.left) / r.width, 0), 1), y = Math.min(Math.max((ev.clientY - r.top) / r.height, 0), 1);
    if (zone.dataset.zone === 'h') h = x * 360; else { s = x; v = 1 - y; }
    couleur = depuisHsv(h, s, v);
    Object.assign(boite.dataset, { h, s, v });
    for (const [k, val] of [['--h', h], ['--sx', s * 100 + '%'], ['--vy', (1 - v) * 100 + '%'], ['--hx', h / 3.6 + '%'], ['--c', couleur]]) boite.style.setProperty(k, val);
    appliquerTheme({ ...couleursTheme(), [id]: couleur });   // aperçu en direct, rien n'est redessiné pendant le geste
  };
  const fin = () => {
    zone.removeEventListener('pointermove', bouge);
    if (couleur) { data.couleurs = { ...couleursTheme(), [id]: couleur }; data.theme = 'perso'; maj(); }
  };
  bouge(e);
  zone.addEventListener('pointermove', bouge);
  zone.addEventListener('pointerup', fin, { once: true });
  zone.addEventListener('pointercancel', fin, { once: true });
});
const SOURCES = { creneaux: ['Créneaux', '#35C6DF'], taches: ['Tâches', '#EC4A46'], sport: ['Sport', '#B5DF2B'],
  habitudes: ['Habitudes', '#FF8AC1'], objectifs: ['Objectifs', '#6766F0'], bonus: ['Journées et bilans', '#FFD447'] };
const RARETE = { commune: 'Commune', rare: 'Rare', epique: 'Épique', legendaire: 'Légendaire' };
const slug = t => String(t || '').toLowerCase().normalize('NFD').replace(/[^a-z]+/g, '-');
const creaHtml = (c, sport) => `<div class="crea forme-${c.forme} ${c.rarete}${sport ? ` acc acc-${slug(sport)}` : ''}" style="--c:${c.couleur}"${sport ? ` title="Version ${esc(sport)}"` : ''}><b></b><i></i></div>`;
const flamme = allumee => `<svg class="flamme${allumee ? '' : ' eteinte'}" viewBox="0 0 24 24" aria-hidden="true"><path class="f-ext" d="M12 1.8c.7 2.9 2.6 4.6 4.3 6.5 1.9 2.1 3.7 4.2 3.7 7.4 0 4.3-3.5 7-8 7s-8-2.7-8-7c0-2.8 1.3-4.9 2.9-6.4.3 1.5 1.2 2.6 2.4 3-.5-3.9.8-7.5 2.7-10.5z"/><path class="f-int" d="M12.2 11.2c.4 1.6 1.5 2.6 2.4 3.6 1 1.1 1.6 2 1.6 3.4 0 2.2-1.8 3.5-4.2 3.5S7.8 20.4 7.8 18.2c0-1.6.8-2.8 1.9-3.6.1.9.6 1.5 1.3 1.7-.2-1.9.3-3.6 1.2-5.1z"/></svg>`;

// Le bilan est dû le dimanche dès 16 h, et encore le lundi et le mardi pour la semaine passée.
function bilanAFaire() {
  const { date, h } = L.momentLogique(new Date()), j = L.jourSemaine(date), cle = cleSem(date);
  const prec = L.isoJour(L.ajouterJours(L.lundiDe(date), -7));
  if (j === 6 && h >= 16 && !data.bilans[cle]) return cle;
  if (j <= 1 && data.semaines[prec]?.slots.length && !data.bilans[prec]) return prec;
  return null;
}

const ENGRENAGE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';

// Profil : ta progression (niveau, série, compagnon, collection, succès, semaine, stats). Les réglages sont à part.
function vueProfil() {
  if (ui.reglages) return vueReglages();
  const st = L.stats(data, new Date()), nv = st.niveau;
  const droits = L.droitsTirage(data, st), possedes = new Set(data.collection.map(c => c.id));
  const aBilan = bilanAFaire();
  const sources = Object.entries(st.sources).filter(([, v]) => v);
  const obtenus = L.SUCCES.filter(([, k, c]) => st[k] >= c).length;
  $('#profil').innerHTML = `<header class="top"><div><h1>${esc(data.profil.prenom || 'Profil')}</h1><p>Ta progression</p></div>
      <button class="chip reglages-bouton" data-act="reglages" aria-label="Réglages">${ENGRENAGE}</button></header>
    <div class="card niveau" data-module="motivation">
      <div class="kv"><span class="num big">Niveau ${nv.n}</span><span class="num">${st.total - nv.de} / ${nv.a - nv.de} XP</span></div>
      <div class="xp"><div style="width:${(st.total - nv.de) / (nv.a - nv.de) * 100}%">${sources.map(([k, v]) => `<i style="--c:${SOURCES[k][1]};flex:${v}"></i>`).join('')}</div></div>
      ${sources.length ? `<div class="xp-leg">${sources.map(([k, v]) => `<span><i style="--c:${SOURCES[k][1]}"></i>${SOURCES[k][0]} ${v}</span>`).join('')}</div>` : '<p class="muted">L’XP se gagne en validant tes créneaux, tes tâches, tes séances, tes habitudes et tes objectifs.</p>'}
      <small class="muted">${st.total} XP au total</small></div>
    <div class="card serie" data-module="motivation">${flamme(st.valides.has(aujIso()))}<div><span class="num">${st.serie} jour${st.serie > 1 ? 's' : ''}</span><br><small class="muted">de journées validées · record ${st.record}</small></div><div class="jokers"><b>${st.jokers}</b>joker${st.jokers > 1 ? 's' : ''}</div></div>
    ${aBilan ? `<button class="card kv appel" data-act="bilan" data-cle="${aBilan}"><span class="txt"><b>C’est l’heure du bilan</b><small>Objectifs, tâches à reporter, heures de la semaine</small></span><span class="pill">+${L.XP.bilan} XP</span></button>` : ''}
    ${compagnonHtml(st)}
    ${droits.length ? `<button class="btn plein" data-act="tirage" data-module="motivation">Ouvrir ${droits.length > 1 ? `tes ${droits.length} tirages` : 'ton tirage'}</button>` : ''}
    <details class="liste groupe" data-id="collection" data-module="motivation" ${ui.ouvertes.has('collection') ? 'open' : ''}><summary><span class="txt"><b>Collection</b><small>${possedes.size} sur ${L.CREATURES.length} créatures</small></span></summary><div class="groupe-corps">
      <div class="collec">${L.creaturesRangees().map(c => possedes.has(c.id) ? `<button class="fig" data-act="creature" data-id="${c.id}">${creaHtml(c, data.collection.find(x => x.id === c.id).sport)}<span>${esc(c.nom)}</span></button>` : '<div class="fig"><div class="crea lock">?</div><span>À gagner</span></div>').join('')}</div>
      <p class="aide">Un tirage tous les 5 niveaux (niveau 5, 10, 15…).</p></div></details>
    <details class="liste" data-id="succes" data-module="motivation" ${ui.ouvertes.has('succes') ? 'open' : ''}><summary>Succès<span class="pill">${obtenus} sur ${L.SUCCES.length}</span></summary><ul class="list">${L.SUCCES.map(([nom, k, cible]) => {
      const ok = st[k] >= cible;
      return `<li><span class="medal${ok ? '' : ' en-cours'}">${ok ? I.check : `${st[k]}/${cible}`}</span><div class="txt"><b>${nom}</b>${ok ? '<small>Obtenu</small>' : ''}</div></li>`;
    }).join('')}</ul></details>
    ${statsHtml()}
    <button class="btn gris" data-act="bilan">Faire le bilan de la semaine</button>
    ${travailHtml()}`;
  $('#profil').querySelectorAll('[data-module]').forEach(e => { e.hidden = !actif(e.dataset.module); });
  appliquerTheme();
}

// Réglages : rangés par thème, chaque groupe se replie.
function vueReglages() {
  const jours = joursDepuisExport();
  const sa = sauvAuto();
  const etat = sa ? `${esc(sa.ident)} · ${jours === 0 ? 'sauvegardé aujourd’hui' : `dernière copie il y a ${jours} jour${jours > 1 ? 's' : ''}`}` : 'Pas de compte : rien n’est sauvegardé';
  $('#profil').innerHTML = `<header class="top"><div><button class="retour" data-act="reglages-fermer">${I.gauche}Profil</button><h1>Réglages</h1></div></header>
    ${groupe('profil', 'Ton profil', esc([data.profil.prenom, data.profil.etudes !== false && 'études', data.profil.travail && 'travail', ...(data.profil.sports || [])].filter(Boolean).join(' · ') || 'Rien de renseigné'),
      `<button class="btn gris" data-act="assistant">Régler par catégories</button>
       <p class="aide">Pour un nouveau semestre, un nouveau job ou un nouveau sport : seules les catégories que tu règles changent, à partir d’aujourd’hui.</p>`)}
    ${groupe('notifs', 'Notifications', data.notifs?.actif ? 'Activées' : 'Désactivées', rappelsHtml(true))}
    ${groupe('sauvegarde', 'Compte et sauvegarde', `<span class="${!sa || jours > 7 ? 'alerte' : ''}">${etat}</span>`,
      `${sa ? `<p>Compte : <b>${esc(sa.ident)}</b>. Une copie chiffrée part toute seule quand tu utilises l’app, au plus une fois par heure.${sa.quand ? ` Dernière copie : ${new Date(sa.quand).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}.` : ''}</p>
         <button class="btn gris" data-act="deconnexion">Me déconnecter ou supprimer mon compte</button>`
       : L.sauvegardePossible() ? `<p>Avec un compte, tes données sont sauvegardées toutes seules, chiffrées : personne d’autre que toi ne peut les lire. Sur un nouveau téléphone, tu te connectes et tout revient.</p>
         <div class="rangee"><button class="btn plein" data-act="compte">Créer mon compte</button><button class="btn gris" data-act="connexion">Me connecter</button></div>`
       : '<p>Pas possible sur ce téléphone (iPhone : iOS 16.4 ou plus).</p>'}
       ${avantImport() ? '<button class="btn gris" data-act="revenir-avant">Revenir à avant l’import</button>' : ''}
       <button class="btn rouge" data-act="tout-effacer">Effacer toutes mes données</button>`)}
    ${groupe('apparence', 'Apparence et son', couleursTheme().fond ? 'Tes couleurs' : 'Automatique',
      `<div class="ligne-couleur"><button type="button" class="pastille-couleur" data-act="choisir-couleur" data-id="fond" style="--c:${couleursTheme().fond || 'linear-gradient(135deg, #F4F5F8 50%, #0B0D11 50%)'}"><i></i><span><b>Fond et bulles</b><small>${couleursTheme().fond ? 'Toucher pour changer' : 'Auto : suit l’iPhone'}</small></span></button><button type="button" class="btn gris petit" data-act="couleur" data-id="fond" data-c="" aria-pressed="${!couleursTheme().fond}">Auto</button></div>
       <div class="ligne-couleur"><button type="button" class="pastille-couleur" data-act="choisir-couleur" data-id="accent" style="--c:${couleursTheme().accent || '#FF9600'}"><i></i><span><b>Boutons et flamme</b><small>Toucher pour changer</small></span></button><button type="button" class="btn gris petit" data-act="couleur" data-id="accent" data-c="" aria-pressed="${!couleursTheme().accent}">Par défaut</button></div>
       <label class="coche"><input type="checkbox" class="chk" data-act="son" ${data.son ? 'checked' : ''}>Petit son quand je coche quelque chose</label>`)}
    ${groupe('aide', 'Aide et avis', 'Tutoriel, avis, notice, conditions',
      `<div class="rangee"><button class="btn gris" data-act="tutoriel">Revoir le tutoriel</button><button class="btn gris" data-act="avis">Donner mon avis</button></div>
       <button class="btn gris" data-act="exporter">Télécharger une copie de mes données</button>
       <p><a href="installer.html">Notice d’installation à envoyer</a> · <a href="conditions.html">Conditions d’utilisation</a> · <a href="confidentialite.html">Confidentialité et mentions légales</a></p>`)}
    <p class="aide version">App d’organisation · version ${L.VERSION}</p>`;
  appliquerTheme();
}

// Toutes les catégories, même à 0 h (retour des testeurs, 24/10) : les plus remplies d'abord.
function statsListe(prevu, fait, max) {
  const ids = [...new Set([...data.cats.map(c => c.id), ...Object.keys(prevu)])].sort((a, b) => (prevu[b] || 0) - (prevu[a] || 0));
  return `<ul class="stats">${ids.map(c => `<li><span>${esc(cat(c).nom)}</span><span class="track duo" style="${teinte(c)}"><i style="width:${(prevu[c] || 0) / max * 100}%"></i><i style="width:${(fait[c] || 0) / max * 100}%"></i></span><b>${L.heures(fait[c] || 0)}<small> / ${L.heures(prevu[c] || 0)}</small></b></li>`).join('')}</ul>`;
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
      ${statsListe(prevu, fait, max)}</div>`
      : `<div class="card">${statsListe(prevu, fait, max)}</div>`}</div>`;
}

// Compagnon : choisi parmi les créatures gagnées dans la collection ; il grandit avec les journées validées et ne régresse jamais.
const TAILLES = ['54%', '66%', '78%', '90%', '100%'];
const compagnonFig = (c, stade) => `<div class="compagnon stade-${stade}" style="--taille:${TAILLES[stade]}">${creaHtml(c, data.collection.find(x => x.id === c.id)?.sport)}</div>`;
function compagnonHtml(st) {
  if (!actif('compagnon')) return '';
  if (!data.compagnon?.id) {
    const gagnees = L.creaturesRangees().filter(c => data.collection.some(x => x.id === c.id));
    return `<div class="sec"><h2>Compagnon</h2><div class="card bientot"><p>Ton compagnon se gagne dans la collection : choisis une de tes créatures. Elle grandit à chaque journée validée (1, 5, 10 et 20) et ne rapetisse jamais, même si ta série casse.</p>
    ${gagnees.length ? `<div class="collec">${gagnees.map(c => `<button class="fig" data-act="choisir-compagnon" data-id="${c.id}">${creaHtml(c, data.collection.find(x => x.id === c.id).sport)}<span>${esc(c.nom)}</span></button>`).join('')}</div>`
      : '<p class="muted">Tu n’as pas encore de créature : ouvre ton tirage de bienvenue juste au-dessus, puis un tirage tous les 5 niveaux.</p>'}</div></div>`;
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
const RAISON = k => { const [type, v] = k.split(':'); return { bienvenue: 'Cadeau de bienvenue', succes: `Succès : ${v}`, niveau: `Niveau ${v} atteint`, tache: 'Tâche importante faite', projet: 'Projet terminé', semaine: 'Semaine réussie', seances: `${v} séances de sport`, competition: 'Compétition notée' }[type]; };
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
  ['taches', 'Tâches'], ['objectifs', 'Objectifs'], ['listes', 'Listes'], ['notes', 'Notes libres'],
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
  const nom = 'orga-sauvegarde.json';   // toujours le même nom : la nouvelle copie remplace l'ancienne
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
// ce qui va changer, et on garde une copie des données d'avant (Réglages › Sauvegarde › Revenir à avant l'import).
const CLE_AVANT = KEY + '-avant-import';
function garderAvant() { try { localStorage.setItem(CLE_AVANT, JSON.stringify({ quand: new Date().toISOString(), data })); } catch {} }
function avantImport() { try { return JSON.parse(localStorage.getItem(CLE_AVANT)); } catch { return null; } }

function proposerProfil(p, titre = 'Importer ce profil ?') {
  const essai = structuredClone(data), lignes = L.appliquerProfil(essai, p);
  if (!lignes.length) return dire('Ce profil n’ajoute rien de nouveau.');
  const premier = !data.types.length;
  ouvrirDlg(`<form><h2>${esc(titre)}</h2><p class="muted">Ce qui va être ajouté (rien n’est effacé) :</p>
    <ul class="list">${lignes.map(l => `<li><div class="txt"><b>${esc(l)}</b></div></li>`).join('')}</ul>
    <div class="rangee"><button type="button" class="btn gris" data-fermer>Annuler</button><button class="btn plein">Ajouter</button></div></form>`, () => {
    garderAvant();
    L.appliquerProfil(data, p);
    marquerDebut();
    noterUsage('profil');
    maj(); dire('Profil ajouté'); feter();
    if (premier) tutoApresDepart();
  });
}
// Le premier jour d'usage : avant le lendemain, sommeil, cours et repas ne comptent pas tout seuls dans les heures.
function marquerDebut() { if (!data.debut) data.debut = L.isoJour(L.momentLogique(new Date()).date); }
// Juste après avoir construit son app, le tutoriel (une seule fois), le temps de voir sa semaine.
function tutoApresDepart() { if (!data.tutoVu && data.types.length) setTimeout(() => { if (!dlg.open) tutoriel(); }, 2000); }

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
  proposerSauvegarde(o);
});
function proposerSauvegarde(o, apres) {
  try { o = L.validerImport(o); } catch (err) { return dire(err.message); }
  const nb = Object.values(o.semaines).reduce((k, x) => k + x.slots.length, 0);
  ouvrirDlg(`<form><h2>Remplacer par cette sauvegarde ?</h2>
    <p class="muted">Sauvegarde${o.dernierExport ? ` du ${new Date(o.dernierExport).toLocaleDateString('fr-FR')}` : ''} : ${nb} créneaux, ${o.taches.length} tâches, ${o.notes.length} notes, ${o.journal.length} séances.
    Elle remplace les données actuelles, qui restent récupérables dans Profil › ⚙ › Compte et sauvegarde › Revenir à avant l’import.</p>
    <div class="rangee"><button type="button" class="btn gris" data-fermer>Annuler</button><button class="btn plein">Remplacer</button></div></form>`,
  () => { garderAvant(); data = o; apres?.(); maj(); dire('Sauvegarde importée'); });
}

// Droit à l'effacement : tout ce que l'app garde sur ce téléphone disparaît (données, copies, cache).
function toutEffacer() {
  ouvrirDlg(`<form><h2>Effacer toutes tes données ?</h2>
    <p class="muted">Ton emploi du temps, tes tâches, tes notes, ton sport et ta progression seront effacés de ce téléphone, et ton compte du serveur. On ne peut pas revenir en arrière.</p>
    <div class="rangee"><button type="button" class="btn gris" data-fermer>Annuler</button></div>
    <button type="button" class="btn rouge" data-choix="effacer" data-confirmer="Oui, tout effacer">Effacer</button></form>`, async choix => {
    if (choix !== 'effacer') return;
    // Sans réseau, on n'efface rien : la clé du compte disparaîtrait avec le téléphone, et la copie resterait sur le serveur.
    if (!(await effacerCompte())) { dire('Pas de réseau : rien n’a été effacé. Réessaie avec du réseau.'); return; }
    try { Object.keys(localStorage).filter(k => k.startsWith('orga-')).forEach(k => localStorage.removeItem(k)); } catch {}
    try { for (const k of await caches.keys()) await caches.delete(k); } catch {}
    if (data.notifs?.actif) await desactiverRappels(true);
    data = L.vide(); dernier = null;
    location.reload();
  });
}

// ---------- Compte et sauvegarde chiffrée ----------
// Une copie chiffrée part au plus une fois par heure, quand l'app sert. Le mot de passe n'est jamais gardé.
let sauvEnCours = null;
function planifierSauvegarde() {
  const s = sauvAuto();
  if (!s?.cle || !L.SERVEUR_RAPPELS || Date.now() - Date.parse(s.quand || 0) < 36e5) return;
  clearTimeout(sauvEnCours);
  sauvEnCours = setTimeout(() => sauvegarderAuto().catch(() => {}), 5000);
}
const envoyer = async (chemin, corps, type = 'text/plain') => fetch(L.SERVEUR_RAPPELS + chemin, { method: 'POST', headers: { 'Content-Type': type }, body: corps });
async function sauvegarderAuto() {
  const s = sauvAuto();
  if (!s?.cle) return;
  // Rien n'a changé depuis la dernière copie : on ne la renvoie pas (sauf au bout de 30 jours, pour qu'elle ne soit pas effacée).
  const emp = L.empreinte(JSON.stringify(data));
  const maintenant = new Date().toISOString();
  if (emp === s.emp && Date.now() - Date.parse(s.envoye || s.quand || 0) < 30 * 864e5) { ecrireSauvAuto({ ...s, quand: maintenant }); return; }
  const r = await envoyer('/sauvegarde', await L.chiffrerCopie(data, s));
  if (!r.ok) throw new Error('serveur ' + r.status);
  ecrireSauvAuto({ ...s, quand: maintenant, envoye: maintenant, emp });
}
// Renvoie false si le serveur n'a pas confirmé : la clé est alors gardée, pour pouvoir réessayer avec du réseau.
async function effacerCompte() {
  const s = sauvAuto();
  if (!s?.cle) return true;
  try { if (!(await envoyer('/sauvegarde-effacer', JSON.stringify({ id: s.id }), 'application/json')).ok) return false; } catch { return false; }
  ecrireSauvAuto(null);
  return true;
}
// Créer un compte ou s'y connecter : le même formulaire, deux boutons.
function compte(mode = 'creer', apres) {
  const creer = mode === 'creer';
  ouvrirDlg(`<form><h2>${creer ? 'Crée ton compte' : 'Connecte-toi'}</h2>
    <p class="muted">${creer ? 'Tes données sont alors sauvegardées toutes seules, chiffrées sur ce téléphone : personne d’autre que toi ne peut les lire. Sur un nouveau téléphone, tu te connectes et tout revient.' : 'Tes données reviennent sur ce téléphone.'}</p>
    <label class="champ">Identifiant<input name="ident" autocomplete="username" autocapitalize="none" spellcheck="false" required></label>
    <label class="champ">Mot de passe<input name="mdp" type="password" autocomplete="${creer ? 'new-password' : 'current-password'}" required${creer ? ` minlength="${L.MDP_MIN}"` : ''}></label>
    ${creer ? `<label class="champ">Encore une fois<input name="mdp2" type="password" autocomplete="new-password" required></label>
    <p class="aide">Au moins ${L.MDP_MIN} caractères, sans ton identifiant. Retiens-le bien : s’il est oublié, personne ne peut récupérer tes données, pas même l’autrice de l’app.</p>` : ''}
    <button class="btn plein">${creer ? 'Créer mon compte' : 'Me connecter'}</button>
    <button type="button" class="btn gris" data-choix="${creer ? 'connexion' : 'creation'}">${creer ? 'J’ai déjà un compte' : 'Créer un compte'}</button>
    <button type="button" class="btn gris" data-choix="plus-tard">Plus tard</button></form>`, (choix, f) => {
    if (choix === 'plus-tard') { apres?.(); return; }
    if (choix === 'connexion' || choix === 'creation') { setTimeout(() => compte(choix === 'connexion' ? 'connexion' : 'creer', apres)); return; }
    const ident = L.normIdent(f.get('ident')), mdp = f.get('mdp');
    if (!L.identValide(ident)) { dire('Identifiant : 3 à 40 lettres, chiffres, points ou tirets'); return false; }
    if (creer && mdp !== f.get('mdp2')) { dire('Les deux mots de passe ne sont pas pareils'); return false; }
    if (creer && L.mdpTropSimple(mdp, ident)) { dire('Mot de passe trop simple : mélange plus de caractères différents, sans ton identifiant.'); return false; }
    dire(creer ? 'Création du compte…' : 'Connexion…');
    (creer ? creerCompte : seConnecter)(ident, mdp, apres).catch(() => { dire('Pas de réseau : réessaie plus tard.'); apres?.(); });
  });
}
async function creerCompte(ident, mdp, apres) {
  const cles = await L.clesDuCompte(ident, mdp);
  const r = await envoyer('/compte-creer', await L.chiffrerCopie(data, cles));
  // Refus sans dire pourquoi : on n'apprend jamais qu'un compte existe déjà.
  if (r.status === 409) { dire('Impossible de créer ce compte : choisis un autre identifiant ou un autre mot de passe.'); setTimeout(() => compte('creer', apres), 2200); return; }
  if (!r.ok) throw new Error('serveur ' + r.status);
  ecrireSauvAuto({ ident, ...cles, quand: new Date().toISOString() });
  dire('Compte créé : tes données sont sauvegardées');
  maj(); apres?.();
}
async function seConnecter(ident, mdp, apres) {
  const cles = await L.clesDuCompte(ident, mdp);
  const r = await envoyer('/restauration', JSON.stringify({ id: cles.id }), 'application/json');
  if (r.status === 404) { dire('Identifiant ou mot de passe incorrect'); setTimeout(() => compte('connexion', apres), 2200); return; }
  if (!r.ok) throw new Error('serveur ' + r.status);
  const o = await L.dechiffrerCopie(await r.text(), cles);
  const lier = () => { ecrireSauvAuto({ ident, ...cles, quand: new Date().toISOString() }); apres?.(); };
  // Sur un téléphone vide, les données reviennent tout de suite ; sinon on demande avant de remplacer.
  if (!data.types.length) { data = L.validerImport(o); lier(); maj(); dire('Connexion réussie : tes données sont revenues'); }
  else proposerSauvegarde(o, lier);
}
function deconnecter() {
  ouvrirDlg(`<form><h2>Te déconnecter ?</h2>
    <p class="muted">Les copies automatiques s’arrêtent. Tes données restent sur ce téléphone, et ton compte sur le serveur.</p>
    <div class="rangee"><button type="button" class="btn gris" data-fermer>Annuler</button><button class="btn plein">Me déconnecter</button></div>
    <button type="button" class="btn rouge" data-choix="supprimer" data-confirmer="Oui, supprimer mon compte">Supprimer mon compte</button></form>`, choix => {
    if (choix === 'supprimer') { effacerCompte().then(ok => { dire(ok ? 'Compte supprimé du serveur' : 'Pas de réseau : ton compte n’est pas supprimé. Réessaie avec du réseau.'); maj(); }); return; }
    ecrireSauvAuto(null); dire('Déconnexion faite'); maj();
  });
}

// ---------- Rappels (notifications) ----------
// Le serveur ne reçoit que l'adresse d'abonnement de ce téléphone et les heures des rappels ;
// les textes (cours, salle, affaires) restent ici, dans le cache « orga-rappels » que lit le service worker.
const peutActiverRappels = () => !!L.SERVEUR_RAPPELS && pushPossible() && enApp() && Notification.permission !== 'denied' && !data.notifs?.actif;
const pushPossible = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const enApp = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const aleatoire = () => b64url(crypto.getRandomValues(new Uint8Array(24)));
function b64url(u) { return btoa(String.fromCharCode(...u)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
const deB64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), c => c.charCodeAt(0));

function rappelsHtml(dansReglages) {
  const n = data.notifs;
  let corps;
  if (!L.SERVEUR_RAPPELS) corps = '<p>Bientôt : le serveur des rappels n’est pas encore en ligne.</p>';
  else if (!pushPossible() || !enApp()) corps = '<p>Pour recevoir des rappels, ouvre l’app depuis son icône sur l’écran d’accueil (iPhone : iOS 16.4 ou plus).</p>';
  else if (!n.actif) corps = `<p>Un rappel avant chaque créneau de ta journée, à l’heure de tes habitudes, avant le dîner pour le bilan de ta journée, le dimanche pour le bilan.</p>
    <button class="btn plein" data-act="rappels-activer">Activer les rappels</button>`;
  else corps = `<label class="champ">Combien de temps avant<select data-act="rappel" data-id="delai">${[5, 10, 15, 20, 30, 45, 60].map(m => `<option value="${m}" ${m === n.delai ? 'selected' : ''}>${m} min avant</option>`).join('')}</select></label>
    <label class="coche"><input type="checkbox" class="chk" data-act="rappel" data-id="creneaux" ${n.creneaux ? 'checked' : ''}>Avant chaque créneau de ma journée</label>
    <label class="coche"><input type="checkbox" class="chk" data-act="rappel" data-id="habitudes" ${n.habitudes !== false ? 'checked' : ''}>À l’heure de mes habitudes</label>
    <label class="coche"><input type="checkbox" class="chk" data-act="rappel" data-id="taches" ${n.taches !== false ? 'checked' : ''}>À l’heure de mes tâches</label>
    <label class="coche"><input type="checkbox" class="chk" data-act="rappel" data-id="soir" ${n.soir ? 'checked' : ''}>Avant le dîner, le bilan de ma journée</label>
    <label class="coche"><input type="checkbox" class="chk" data-act="rappel" data-id="bilan" ${n.bilan ? 'checked' : ''}>Le dimanche à 17 h, le bilan</label>
    <div class="rangee"><button class="btn gris" data-act="rappels-essai">Rappel d’essai</button><button class="btn gris" data-act="rappels-desactiver">Désactiver</button></div>`;
  const bas = `${corps}
    <p>Seules les heures des rappels partent vers le serveur, jamais le nom de tes cours ni tes salles. <a href="confidentialite.html">En savoir plus</a></p>`;
  return dansReglages ? bas : `<div class="sec"><h2>Notifications</h2><div class="card bientot">${bas}</div></div>`;
}

async function activerRappels() {
  try {
    if (await Notification.requestPermission() !== 'granted') return dire('Notifications refusées : tu peux les autoriser dans les réglages de l’iPhone.');
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: deB64url(L.VAPID_PUBLIQUE) });
    data.notifs.id ||= aleatoire();
    data.notifs.actif = true;
    await synchroRappels(true, sub, true);
    noterUsage('notifications');
    dire('Rappels activés : une notification d’essai arrive dans 2 minutes');
    maj();
  } catch (e) { data.notifs.actif = false; dire('Activation impossible : réessaie avec du réseau.'); }
}

async function desactiverRappels(silencieux) {
  const id = data.notifs.id;
  data.notifs.actif = false;
  try { (await (await navigator.serviceWorker.ready).pushManager.getSubscription())?.unsubscribe(); } catch {}
  try { await fetch(L.SERVEUR_RAPPELS + '/desabonnement', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }); } catch {}
  try { await caches.delete('orga-rappels'); } catch {}
  data.notifs.dernier = '';
  if (!silencieux) { dire('Rappels désactivés, et effacés du serveur'); maj(); }
}

// Recalcule les rappels ; n'écrit sur le serveur que si les heures ont changé (l'offre gratuite limite les écritures).
let synchroEnCours = null;
async function synchroRappels(forcer, sub, essai) {
  if (!data.notifs?.actif || !L.SERVEUR_RAPPELS) return;
  const rappels = L.calculerRappels(data, Date.now(), data.notifs);
  const empreinte = rappels.map(r => r.t).join(',');
  // Le rappel d'essai part au prochain passage du serveur (toutes les 2 minutes).
  if (essai) rappels.unshift({ t: Math.floor(Date.now() / 1000) + 30, titre: 'Les rappels marchent', corps: 'Tu recevras tes rappels ici.' });
  try { await (await caches.open('orga-rappels')).put('rappels.json', new Response(JSON.stringify(rappels), { headers: { 'Content-Type': 'application/json' } })); } catch {}
  const heures = rappels.map(r => r.t);
  if (!forcer && !L.rappelsChanges(data.notifs.dernier, rappels.map(r => r.t), Math.floor(Date.now() / 1000))) return;
  sub ||= await (await navigator.serviceWorker.ready).pushManager.getSubscription();
  if (!sub) { data.notifs.actif = false; sauver(); return; }
  const r = await fetch(L.SERVEUR_RAPPELS + '/abonnement', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: data.notifs.id, abonnement: sub.toJSON(), rappels: heures }) });
  if (!r.ok) throw new Error('serveur ' + r.status);
  data.notifs.dernier = empreinte;
  sauver();
}
function planifierSynchro() {
  if (!data.notifs?.actif) return;
  clearTimeout(synchroEnCours);
  synchroEnCours = setTimeout(() => synchroRappels(false).catch(() => {}), 4000);
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

// Construire son app catégorie par catégorie (remplace le questionnaire, retour des testeurs du 24/10) :
// chaque étape explique une catégorie et règle ses créneaux types de base. « Passer » laisse la catégorie telle quelle.
function construire(etape = 0, r = {}) {
  const hm = (nom, h) => `<input type="time" name="${nom}" value="${L.hhmm(h)}">`;
  const titre = (id, nom) => `<span class="dot" style="${teinte(id)}"></span> ${nom}`;
  const ouiNon = (nom, oui, question) => `<div class="champ">${question}${radios(nom, { oui: 'Oui', non: 'Non' }, oui ? 'oui' : 'non')}</div>`;
  const deux = (a, b) => `<div class="champs" style="grid-template-columns: 1fr 1fr">${a}${b}</div>`;
  const pr = data.profil, sp = r.sport || {};
  // Mêmes horaires tous les jours, ou une ligne par jour (V1.10.4) ; la case « Mêmes horaires » bascule entre les deux.
  const memes = (cle, html, champs, defauts, avecCoche) => {
    const pj = r[cle]?.parJour;
    return `<label class="coche"><input type="checkbox" class="chk" name="memes" ${pj ? '' : 'checked'}>Les mêmes horaires tous les jours</label>
      <div data-memes>${html}</div>
      <div data-par-jour class="par-jour">${JOURS.map((n, j) => `<div class="ligne-jour">${avecCoche ? `<label class="coche"><input type="checkbox" class="chk" name="pj${j}" ${(pj ? pj[j] : defauts.jours?.includes(j)) ? 'checked' : ''}>${n.slice(0, 3)}</label>` : `<span>${n.slice(0, 3)}</span>`}
        ${champs.map(([nom, etiquette, def]) => `<label class="champ">${etiquette}${hm(nom + j, pj?.[j]?.[nom] ?? def(j))}</label>`).join('')}</div>`).join('')}</div>`;
  };
  const lirePJ = (f, champs, avecCoche, bas) => JOURS.map((_, j) => avecCoche && !f.get('pj' + j) ? null
    : Object.fromEntries(champs.map(([nom]) => [nom, L.versHeure(f.get(nom + j), bas[nom] ?? 4)])));
  const ETAPES = [
    { cle: null, titre: 'Construire ton app', corps: `<p>Ton emploi du temps est fait de <b>catégories</b>, chacune avec sa couleur. Pour chacune, tu règles ses <b>créneaux de base</b> : ils reviendront chaque semaine.</p>
      <ul class="legend">${data.cats.map(c => `<li><span class="dot" style="${teinte(c.id)}"></span>${esc(c.nom)}</li>`).join('')}</ul>
      <p class="aide">Une catégorie ne te concerne pas ? Passe-la. Tout se change ensuite dans Semaine › Modifier, et le reste s’ajoute au doigt dans la grille.</p>` },
    { cle: 'sommeil', titre: titre('sommeil', 'Sommeil'), corps: `<p class="muted">Tes nuits, en semaine et le week-end.</p>
      ${memes('sommeil', `${deux(`<label class="champ">Couché à${hm('coucher', r.sommeil?.coucher ?? 23.5)}</label>`, `<label class="champ">Levé à${hm('lever', r.sommeil?.lever ?? 7)}</label>`)}
      <label class="champ">Le week-end, levé à${hm('leverWe', r.sommeil?.leverWe ?? 9.5)}</label>`,
        [['lever', 'Levé à', j => j >= 5 ? 9.5 : 7], ['coucher', 'Couché à', () => 23.5]], {}, false)}
      <p class="aide">Le coucher d’un jour, c’est le soir de ce jour-là.</p>`,
      lire: f => f.get('memes') ? { coucher: L.versHeure(f.get('coucher'), 12), lever: L.versHeure(f.get('lever'), 4), leverWe: L.versHeure(f.get('leverWe'), 4) }
        : { parJour: lirePJ(f, [['lever'], ['coucher']], false, { coucher: 12 }) } },
    { cle: 'repas', titre: titre('repas', 'Repas'), corps: `<p class="muted">Tes repas valident tout seuls ; ils coupent les cours s’ils tombent dessus.</p>
      <label class="coche"><input type="checkbox" class="chk" name="pdj" checked>Petit-déjeuner à</label>${hm('pdjH', r.repas?.petitDej ?? 7)}
      <label class="coche"><input type="checkbox" class="chk" name="dej" checked>Déjeuner</label>${deux(`<label class="champ">De${hm('dejS', r.repas?.dej?.[0] ?? 12)}</label>`, `<label class="champ">À${hm('dejE', r.repas?.dej?.[1] ?? 13)}</label>`)}
      <label class="coche"><input type="checkbox" class="chk" name="din" checked>Dîner</label>${deux(`<label class="champ">De${hm('dinS', r.repas?.diner?.[0] ?? 19.5)}</label>`, `<label class="champ">À${hm('dinE', r.repas?.diner?.[1] ?? 20.5)}</label>`)}`,
      lire: f => ({ petitDej: f.get('pdj') ? L.versHeure(f.get('pdjH'), 4) : null, dej: f.get('dej') ? [L.versHeure(f.get('dejS'), 4), L.versHeure(f.get('dejE'), 4)] : null, diner: f.get('din') ? [L.versHeure(f.get('dinS'), 4), L.versHeure(f.get('dinE'), 4)] : null }) },
    { cle: 'cours', titre: titre('cours', 'Cours et trajets'), corps: `${ouiNon('oui', pr.etudes !== false, 'Tu as des cours ?')}
      <div data-si-oui>${memes('cours', `<div class="champ">Les jours de cours${joursChoix('jours', r.cours?.jours ?? [0, 1, 2, 3, 4])}</div>
      ${deux(`<label class="champ">Début${hm('debut', r.cours?.debut ?? 8.5)}</label>`, `<label class="champ">Fin${hm('fin', r.cours?.fin ?? 17)}</label>`)}`,
        [['debut', 'Début', () => 8.5], ['fin', 'Fin', () => 17]], { jours: r.cours?.jours ?? [0, 1, 2, 3, 4] }, true)}
      <label class="champ">Trajet, à l’aller comme au retour<select name="trajet">${[0, 15, 30, 45, 60].map(m => `<option value="${m}" ${m === (r.cours?.trajet ?? 30) ? 'selected' : ''}>${m ? m + ' min' : 'Aucun'}</option>`).join('')}</select></label>
      <p class="aide">Une journée de base : tu ajusteras chaque cours dans la grille.</p></div>`,
      lire: f => f.get('oui') === 'non' ? { jours: [] } : f.get('memes') ? { jours: f.getAll('jours').map(Number), debut: L.versHeure(f.get('debut'), 4), fin: L.versHeure(f.get('fin'), 4), trajet: +f.get('trajet') }
        : { parJour: lirePJ(f, [['debut'], ['fin']], true, {}), trajet: +f.get('trajet') } },
    { cle: 'job', titre: titre(catTravailId(), 'Job'), corps: `${ouiNon('oui', !!pr.travail, 'Tu as un job (étudiant, alternance, extras) ?')}
      <div data-si-oui>${memes('job', `<div class="champ">Les jours de travail${joursChoix('jours', r.job?.jours ?? [5])}</div>
      ${deux(`<label class="champ">Début${hm('debut', r.job?.debut ?? 9)}</label>`, `<label class="champ">Fin${hm('fin', r.job?.fin ?? 13)}</label>`)}`,
        [['debut', 'Début', () => 9], ['fin', 'Fin', () => 13]], { jours: r.job?.jours ?? [5] }, true)}
      <p class="aide">Horaires variables ? Mets les plus fréquents, puis ajuste chaque semaine dans la grille.</p></div>`,
      lire: f => f.get('oui') === 'non' ? { jours: [] } : f.get('memes') ? { jours: f.getAll('jours').map(Number), debut: L.versHeure(f.get('debut'), 4), fin: L.versHeure(f.get('fin'), 4) }
        : { parJour: lirePJ(f, [['debut'], ['fin']], true, {}) } },
    { cle: 'sport', titre: titre('sport', 'Sport'), corps: `${ouiNon('oui', actif('sport') && (sportsDuProfil().length > 0 || !!sp.nom), 'Tu fais du sport ?')}
      <div data-si-oui><label class="champ">Ton sport<input name="nom" list="sports-construire" value="${esc(sp.nom || sportsDuProfil()[0] || '')}" maxlength="40" placeholder="Basket, sabre laser, natation…" autocomplete="off"><datalist id="sports-construire">${L.SPORTS.map(x => `<option value="${x}">`).join('')}</datalist></label>
      ${memes('sport', `<div class="champ">Les jours d’entraînement${joursChoix('jours', sp.jours ?? [])}</div>
      <label class="champ">À${hm('heure', sp.heure ?? 18)}</label>`, [['heure', 'À', () => 18]], { jours: sp.jours ?? [] }, true)}
      ${deux('', `<label class="champ">Durée<select name="duree">${[1, 1.5, 2, 2.5, 3].map(d => `<option value="${d}" ${d === (sp.duree ?? 1.5) ? 'selected' : ''}>${L.heures(d)}</option>`).join('')}</select></label>`)}</div>
      <p class="aide">Pas de sport : l’onglet Sport disparaît (réponds Oui ici plus tard pour le remettre).</p>`,
      lire: f => f.get('oui') === 'non' ? { non: true, jours: [] } : f.get('memes') ? { nom: f.get('nom').trim(), jours: f.getAll('jours').map(Number), heure: L.versHeure(f.get('heure'), 4), duree: +f.get('duree') }
        : { nom: f.get('nom').trim(), parJour: lirePJ(f, [['heure']], true, {}), duree: +f.get('duree') } },
    { cle: null, titre: 'Le reste', corps: `<p><b>Révisions</b>, <b>loisirs</b>, <b>ménage</b> : ajoute-les au doigt dans Semaine, ou en créneaux types dans Semaine › Modifier.</p>
      <p class="aide">Une tâche qui revient (lessive, poubelles) ? Bouton + › Tâche, puis « Revient chaque semaine ».</p>` },
  ];
  const e = ETAPES[etape], dernier = etape === ETAPES.length - 1;
  ouvrirDlg(`<form class="construire"><h2>${e.titre}</h2>${e.corps}
    <p class="aide">${etape + 1} sur ${ETAPES.length}</p>
    <div class="rangee">${etape ? '<button type="button" class="btn gris" data-choix="retour">Retour</button>' : ''}${e.cle ? '<button type="button" class="btn gris" data-choix="passer">Passer</button>' : ''}<button class="btn plein">${dernier ? 'Créer mon emploi du temps' : 'Suivant'}</button></div>
    ${data.types.length ? '<button type="button" class="btn gris" data-choix="quitter">Quitter sans rien changer</button>' : ''}
    ${dernier && data.types.length ? '<p class="aide">Ce que tu as déjà posé à la main dans tes semaines reste en place : un créneau de base ne le recouvre jamais.</p>' : ''}</form>`, (choix, f) => {
    if (choix === 'quitter') return;
    if (choix === 'retour') { construire(etape - 1, r); return false; }
    if (choix === 'passer') delete r[e.cle];
    else if (e.lire) {
      const v = e.lire(f);
      const manque = o => Object.values(o || {}).some(x => typeof x === 'number' ? Number.isNaN(x) : x && typeof x === 'object' && manque(x));
      if (manque(v)) { dire('Une heure manque.'); return false; }
      r[e.cle] = v;
    }
    if (!dernier) { construire(etape + 1, r); return false; }
    appliquerConstruction(r);
  }, { collant: true });
  // « Non » cache les réglages de la catégorie.
  const cacher = () => dlg.querySelectorAll('[data-si-oui]').forEach(z => { z.hidden = dlg.querySelector('input[name="oui"]:checked')?.value === 'non'; });
  dlg.querySelectorAll('input[name="oui"]').forEach(i => i.addEventListener('change', cacher));
  cacher();
  // « Mêmes horaires » coché : un seul réglage ; décoché : une ligne par jour.
  const bascule = () => { const m = !!dlg.querySelector('input[name="memes"]')?.checked; dlg.querySelectorAll('[data-memes]').forEach(z => { z.hidden = !m; }); dlg.querySelectorAll('[data-par-jour]').forEach(z => { z.hidden = m; }); };
  dlg.querySelector('input[name="memes"]')?.addEventListener('change', bascule);
  bascule();
}
const catTravailId = () => data.cats.find(x => x.id === 'job')?.id || 'travail';
function appliquerConstruction(r) {
  const origines = Object.keys(r);
  if (r.cours) data.profil.etudes = r.cours.jours.length > 0;
  if (r.job) { data.profil.travail = r.job.jours.length > 0; data.modules.travail = data.profil.travail; }
  const catJob = r.job?.jours.length ? catTravail()?.id : 'job';
  if (r.sport) {
    data.modules.sport = !r.sport.non;
    const nom = r.sport.nom;
    if (nom && !sportsDuProfil().some(x => x.toLowerCase() === nom.toLowerCase())) data.profil.sports = [...sportsDuProfil(), nom];
    // Ses exercices et séances de départ, sans rien effacer.
    if (nom) { const p = L.seancesDeDepart(nom); L.appliquerProfil(data, L.lireProfil({ format: 'orga-profil', version: 1, exercices: p.exercices, seances: p.seances })); }
  }
  L.appliquerBase(data, L.creneauxDeBase(r, catJob), origines);
  marquerDebut();
  noterUsage('profil');
  maj();
  ouvrir('semaine');
  dire('Ton emploi du temps est prêt : ajuste-le dans la grille');
  feter();
  tutoApresDepart();
}

const TUTO = [
  ['Bienvenue', 'Ton emploi du temps à la minute près, tes tâches, tes notes et ton sport, au même endroit. Tout reste sur ton téléphone ; avec un compte, une copie chiffrée que personne d’autre que toi ne peut lire.'],
  ['Les onglets', 'Aujourd’hui : le créneau en cours et ta journée. Semaine : la grille ; glisse vers la gauche ou la droite pour changer de semaine. Notes : tâches, habitudes, objectifs, listes et notes. Sport, puis Profil pour ta progression et les Réglages (la roue).'],
  ['La grille', 'Touche une case vide pour ajouter un créneau. Appui long puis glisse : sur du vide pour en remplir plusieurs, au milieu d’un créneau pour le déplacer, sur son haut ou son bas pour changer l’heure. Deux créneaux ne se chevauchent pas ; le sommeil et les repas passent en premier et coupent le reste.'],
  ['Ta semaine type', 'Semaine › Modifier : ce qui revient chaque semaine, jour par jour (le lundi type, le mardi type…). Coche les jours d’un créneau type ; « Régler par catégories » remplit le sommeil, les repas, les cours et le sport en quelques questions.'],
  ['Ajouter', 'Le bouton + d’Aujourd’hui et de Semaine ajoute un créneau ou une tâche. Dans Notes, chaque rubrique a son propre +. Une liste se partage avec son bouton Partager.'],
  ['Valider tes créneaux', 'Valide chaque créneau avec son bouton peu après sa fin : c’est ce qui fait compter ta journée et allume ta flamme. Sommeil, cours et repas se valident tout seuls. Avant le dîner, une notification fait le bilan.'],
  ['Ta progression', 'Chaque chose faite rapporte de l’XP. Tous les 5 niveaux, un tirage : une créature pour ta collection. Choisis-en une comme compagnon : il se promène en bas de l’écran, grandit avec tes journées validées, et réagit quand tu le touches.'],
  ['Ta sauvegarde', 'Avec un compte, une copie chiffrée de tes données part toute seule : sur un nouveau téléphone, tu te connectes et tout revient. Sans compte, elles ne sont que sur ce téléphone : crée-le dans Profil › ⚙ › Compte et sauvegarde. Et ne supprime pas l’icône : ça peut effacer tes données.'],
  ['Les rappels', 'Un rappel avant tes cours et tes séances, à l’heure de tes habitudes et de tes tâches, avant le dîner pour le bilan de ta journée, le dimanche pour le bilan. Seules les heures partent vers le serveur, jamais tes cours.'],
];
// Les conditions d'utilisation : acceptées une fois, et de nouveau quand leur version change.
const CGU = 3;   // 2 : la sauvegarde automatique ; 3 : le compte (24/10)
function conditions() {
  ouvrirDlg(`<form><h2>Avant de commencer</h2>
    <p>L’app est gratuite. Ce que tu écris reste sur ton téléphone ; avec un compte, une copie chiffrée que personne d’autre que toi ne peut lire est gardée sur le serveur. Si tu oublies ton mot de passe, personne ne peut la récupérer. Les rappels peuvent arriver en retard ou pas du tout.</p>
    <p><a href="conditions.html">Conditions d’utilisation</a> · <a href="confidentialite.html">Confidentialité</a></p>
    <button class="btn plein">J’ai lu et j’accepte</button></form>`, () => {
    data.cgu = CGU; sauver();
    // Le tutoriel attend que l'app soit construite : d'abord ta semaine, ensuite l'explication.
    const suite = () => { if (!data.tutoVu && data.types.length) setTimeout(tutoriel); };
    if (!sauvAuto() && L.sauvegardePossible() && !data.types.length) setTimeout(() => compte('creer', suite)); else suite();
  }, { collant: true });
}
function tutoriel(i = 0) {
  const [titre, texte] = TUTO[i];
  const rappels = titre === 'Les rappels';
  ouvrirDlg(`<form><h2>${titre}</h2><p>${texte}</p>${rappels ? (peutActiverRappels() ? '<button type="button" class="btn plein" data-choix="rappels">Activer les rappels</button>' : '<p class="aide">Tu pourras les activer dans Profil › Réglages › Notifications, en ouvrant l’app depuis son icône.</p>') : ''}<p class="aide">${i + 1} sur ${TUTO.length}</p>
    <div class="rangee"><button type="button" class="btn gris" data-choix="passer">${i === TUTO.length - 1 ? 'Fermer' : 'Passer'}</button>${i < TUTO.length - 1 ? '<button class="btn plein">Suivant</button>' : ''}</div></form>`, choix => {
    data.tutoVu = true; sauver();
    if (choix === 'rappels') { activerRappels(); return; }
    if (choix === 'ok' && i < TUTO.length - 1) { tutoriel(i + 1); return false; }
  });
}

// Donner mon avis : de 1 à 5 étoiles et un texte libre, envoyés au serveur (retour des testeurs, 24/10).
// Rien d'autre ne part : ni nom, ni données ; seulement la version de l'app. Seule l'autrice peut les lire.
function donnerAvis() {
  ouvrirDlg(`<form><h2>Donner mon avis</h2>
    <div class="champ">Ta note<div class="etoiles" role="radiogroup" aria-label="Note sur 5">${[1, 2, 3, 4, 5].map(n => `<label><input type="radio" name="note" value="${n}" aria-label="${n} sur 5"><span aria-hidden="true">★</span></label>`).join('')}</div></div>
    <label class="champ">Ton avis (ce qui t’a servi, ce qui manque ou bugue)<textarea name="texte" maxlength="2000" placeholder="Écris librement…"></textarea></label>
    <p class="aide">Envoyé à l’autrice de l’app, sans ton nom ni tes données. N’y mets pas d’informations personnelles.</p>
    <div class="rangee"><button type="button" class="btn gris" data-fermer>Annuler</button><button class="btn plein">Envoyer</button></div></form>`, (choix, f) => {
    const note = +f.get('note'), texte = f.get('texte').trim();
    if (!note && !texte) { dire('Mets une note ou écris un mot.'); return false; }
    dire('Envoi…');
    fetch(L.SERVEUR_RAPPELS + '/avis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: note || null, texte, version: L.VERSION }) })
      .then(r => { if (!r.ok) throw new Error(r.status); if (dlg.open) dlg.close(); dire('Merci, ton avis est envoyé !'); })
      .catch(() => dire('Pas de réseau : ton avis n’est pas parti. Réessaie plus tard.'));
    return false;
  });
  const zone = dlg.querySelector('.etoiles');
  zone.addEventListener('change', e => { zone.dataset.note = e.target.value; });
}

// ---------- Bouton + et navigation ----------

function plus() {
  const o = (choix, icone, titre, aide) => `<button type="button" data-choix="${choix}">${icone}<b>${titre}</b><small>${aide}</small></button>`;
  // V1.10.3 : seulement ce qui va avec l'onglet ouvert (Aujourd'hui et Semaine : créneaux et tâches ; Notes : le reste).
  const pour = { aujourdhui: ['slot', 'tache'], semaine: ['slot', 'tache'], notes: ['tache', 'habitude', 'objectif', 'liste', 'note'], sport: ['slot', 'exo', 'competition'] }[ui.onglet]
    || ['slot', 'tache', 'habitude', 'objectif', 'liste', 'note'];
  const si = (cle, module, html) => pour.includes(cle) && (!module || actif(module)) ? html : '';
  ouvrirDlg(`<form><h2>Ajouter</h2><div class="opts">
    ${si('slot', null, o('slot', I.agenda, 'Créneau', 'Dans l’emploi du temps'))}
    ${si('tache', 'taches', o('tache', I.check, 'Tâche', 'Un jour, une heure, ou chaque semaine'))}
    ${si('habitude', 'habitudes', o('habitude', I.boucle, 'Habitude', 'À tenir, à heure fixe si tu veux'))}
    ${si('objectif', 'objectifs', o('objectif', I.cible, 'Objectif', 'Semaine, mois ou année'))}
    ${si('liste', 'listes', o('liste', I.liste, 'Liste', 'Courses, à lire, à regarder…'))}
    ${si('note', 'notes', o('note', I.note, 'Note', 'Une idée, une consigne'))}
    ${si('exo', 'sport', o('exo', I.boucle, 'Exercice', 'Pompes, gainage, course…'))}
    ${si('competition', 'sport', o('competition', I.cible, 'Compétition', 'Avec son compte à rebours'))}
    </div><button type="button" class="btn gris" data-fermer>Fermer</button></form>`, choix => {
    if (choix === 'slot') {
      if (!data.types.length) { dire('Choisis d’abord comment commencer, dans Aujourd’hui.'); return; }
      const { date, h } = L.momentLogique(new Date());
      const s = Math.min(Math.max(Math.ceil(h * 2) / 2, data.plage[0]), data.plage[1] - 1);
      editerSlot(nouveauSlot(L.jourSemaine(date), s, s + 1), cleSem(date));
      return false;
    }
    const ouvrirEditeur = { note: () => editerNote(), tache: () => editerTache(), objectif: () => editerObjectif(), liste: () => editerListe(), competition: () => editerCompetition(),
      exo: () => editerExo({ id: L.uid(), nom: '', type: 'reps', notes: '' }, true),
      habitude: () => editerHabitude({ id: L.uid(), nom: '', freq: 'jour', faits: [], horaires: [] }, true) }[choix];
    if (ouvrirEditeur) { ouvrirEditeur(); return false; }
  });
}

// Un objectif : sa période, et à quoi il sert (un objectif du mois ou de l'année).
function editerObjectif(o) {
  const neuf = !o, v = o || { txt: '', horizon: 'semaine', parent: null };
  const now = new Date();
  const parents = [...objectifs('mois', L.periode('mois', now)), ...objectifs('annee', L.periode('annee', now))].filter(x => x.id !== v.id);
  ouvrirDlg(`<form><h2>${neuf ? 'Nouvel objectif' : 'Objectif'}</h2>
    <label class="champ">Objectif<input name="txt" value="${esc(v.txt)}" autocomplete="off" required></label>
    <div class="champ">Pour${radios('horizon', { semaine: 'Cette semaine', mois: 'Ce mois-ci', annee: 'Cette année' }, v.horizon)}</div>
    ${parents.length ? `<label class="champ">Il sert à (facultatif)<select name="parent"><option value="">—</option>${parents.map(p => `<option value="${p.id}" ${p.id === v.parent ? 'selected' : ''}>${esc(p.txt)} (${p.horizon === 'mois' ? 'mois' : 'année'})</option>`).join('')}</select></label>` : ''}
    <div class="rangee">${neuf ? '' : '<button type="button" class="btn rouge" data-choix="suppr" data-confirmer="Confirmer">Supprimer</button>'}<button type="button" class="btn gris" data-fermer>Annuler</button><button class="btn plein">Enregistrer</button></div></form>`, (choix, f) => {
    if (choix === 'suppr') {
      data.objectifs = data.objectifs.filter(x => x !== o);
      data.objectifs.forEach(x => { if (x.parent === o.id) x.parent = null; });
      maj(); return;
    }
    const txt = f.get('txt').trim(), horizon = f.get('horizon') || 'semaine';
    if (!txt) { dire('Écris ton objectif.'); return false; }
    // Un objectif ne sert qu'à un objectif plus long que lui.
    const ordre = { semaine: 0, mois: 1, annee: 2 }, par = data.objectifs.find(x => x.id === f.get('parent'));
    const parent = par && ordre[par.horizon] > ordre[horizon] ? par.id : null;
    if (neuf) data.objectifs.push({ id: L.uid(), txt, horizon, periode: L.periode(horizon, now), fait: false, parent });
    else Object.assign(o, { txt, horizon, parent, periode: o.horizon === horizon ? o.periode : L.periode(horizon, now) });
    noterUsage('objectifs');
    maj();
  });
}

// Un onglet dont tous les modules sont masqués disparaît de la barre.
const ONGLETS_MODULES = { sport: ['sport'] };
const ongletVisible = v => !ONGLETS_MODULES[v] || ONGLETS_MODULES[v].some(actif);
// Une pastille sur Profil tant qu'un tirage attend.
function majPastille(st = L.stats(data, new Date())) {
  const t = document.querySelector('.tab[data-v="profil"]');
  if (t) t.classList.toggle('pastille', actif('motivation') && L.droitsTirage(data, st).length > 0);
}
function majOnglets() {
  document.querySelectorAll('.tab').forEach(t => { t.hidden = !ongletVisible(t.dataset.v); });
  $('.tabs').style.gridTemplateColumns = `repeat(${[...document.querySelectorAll('.tab')].filter(t => !t.hidden).length}, 1fr)`;
}
function ouvrir(id) {
  if (!ongletVisible(id)) id = 'aujourdhui';
  ui.onglet = id;
  document.body.dataset.onglet = id;
  document.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-selected', t.dataset.v === id));
  document.querySelectorAll('main > .view').forEach(v => v.hidden = v.id !== id);
  const v = document.getElementById(id);
  v.classList.remove('apparait'); void v.offsetWidth; v.classList.add('apparait');
  clearTimeout(ouvrir.fin); ouvrir.fin = setTimeout(() => v.classList.remove('apparait'), 700);
  requestAnimationFrame(ajusterBalade);
  scrollTo(0, 0);
  try { localStorage.setItem('orga-onglet', id); } catch {}
}
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => ouvrir(t.dataset.v)));

function rendre() { majOnglets(); vueAujourdhui(); vueSemaine(); vueNotes(); vueSport(); vueProfil(); majBalade(); if (!ongletVisible(ui.onglet)) ouvrir('aujourdhui'); }
// Le compagnon choisi se promène en bas de l'écran, au-dessus des onglets (retour des testeurs, 24/10).
// Décoratif : il ne bloque aucun tap, et il reste caché si l'iPhone demande moins d'animations.
function majBalade() {
  let el = document.getElementById('balade');
  const c = actif('compagnon') && data.compagnon?.id && L.CREATURES.find(x => x.id === data.compagnon.id);
  if (!c) { el?.remove(); return; }
  const cle = `${c.id}-${data.compagnon.stade || 0}`;
  if (!el) { el = Object.assign(document.createElement('div'), { id: 'balade', className: 'balade' }); el.setAttribute('aria-hidden', 'true'); document.body.append(el); }
  if (el.dataset.cle !== cle) {
    el.innerHTML = `<span class="bulle"></span><div class="sens"><div class="pas">${compagnonFig(c, data.compagnon.stade || 0)}</div></div>`;
    el.dataset.cle = cle;
    animerBalade(el, c);
  }
}
// Chaque créature a ses habitudes (V1.10.5) : ce qu'elle fait le plus souvent, avec un poids.
const COMPORTEMENTS = {
  ronfleur: { dormir: 6, marcher: 2, bailler: 2 }, gratte: { ecrire: 5, marcher: 2, regarder: 2 }, sprintou: { courir: 6, sauter: 3, marcher: 1 },
  grignote: { manger: 5, marcher: 2, sauter: 1 }, plumette: { flotter: 4, marcher: 2, danser: 2 }, flanou: { flaner: 5, regarder: 2, dormir: 1 },
  bricolo: { bricoler: 5, marcher: 2, sauter: 1 }, caillou: { rouler: 4, dormir: 3 }, brindille: { marcher: 3, danser: 3, regarder: 1 },
  mirabelle: { sauter: 4, danser: 3, marcher: 2 }, tourbillon: { tourner: 5, courir: 2 }, pepite: { briller: 4, marcher: 2, sauter: 1 },
  nuage: { flotter: 5, dormir: 2 }, cactou: { flaner: 3, regarder: 3, sauter: 1 }, lumino: { briller: 4, flotter: 3, sauter: 1 },
  zephyr: { flotter: 3, courir: 3, tourner: 2 },
  moufle: { dormir: 3, flaner: 3, bailler: 2 }, bulle: { flotter: 4, sauter: 2, regarder: 1 }, pistache: { manger: 4, sauter: 2, marcher: 2 },
  gribouille: { ecrire: 4, danser: 2, marcher: 2 }, noisette: { manger: 3, courir: 3, regarder: 2 }, brume: { voleter: 4, dormir: 2, regarder: 1 },
  corniche: { courir: 3, sauter: 3, bricoler: 1 }, papilla: { voleter: 5, danser: 2 }, grelot: { danser: 4, sauter: 3 }, frimas: { voleter: 3, briller: 2, flaner: 2 },
  draconet: { voleter: 3, courir: 2, briller: 2, sauter: 1 }, astro: { regarder: 3, briller: 3, flotter: 2 }, vortex: { tourner: 4, courir: 3 }, sylphe: { voleter: 4, danser: 3 },
  phenix: { voleter: 4, briller: 3, tourner: 1 }, comete: { courir: 4, briller: 3, tourner: 2 },
};
const VITESSES = { marcher: 45, flaner: 22, courir: 150, rouler: 70, flotter: 30, voleter: 60 };   // pixels par seconde ; les autres restent sur place
const BULLES = { dormir: 'z z z', bailler: 'Ouaaah', ecrire: '✎', manger: 'miam', bricoler: '♪', regarder: '?', danser: '♪ ♫', briller: '✦', voleter: '~' };
let baladeMinuteur = null, balade = null;
// Ce que dit chaque créature quand on la touche (V1.10.7).
const REPLIQUES = {
  ronfleur: ['Hein ? Je dormais…', 'Encore cinq minutes…'], gratte: ['Je note, je note !', 'Tu as vu mon carnet ?'], sprintou: ['On fait la course ?', 'Trop lent !'],
  grignote: ['T’as un goûter ?', 'Miam !'], plumette: ['Hihi, ça chatouille !', 'Je m’envole !'], flanou: ['Rien ne presse…', 'Oh, salut.'],
  bricolo: ['Je répare un truc !', 'Passe-moi le marteau !'], caillou: ['…', 'Je suis solide.'], brindille: ['Doucement, je suis fragile !', 'Le vent se lève !'],
  mirabelle: ['On danse ?', 'Youpi !'], tourbillon: ['Ça tourne !', 'Wouhou !'], pepite: ['Je brille, hein ?', 'Précieuse !'],
  nuage: ['Pfiou…', 'Je flotte…'], cactou: ['Attention, ça pique !', 'Câlin ? Non.'], lumino: ['Tadaa !', 'Je m’allume !'], zephyr: ['Fiouuu !', 'Attrape-moi !'],
  moufle: ['Ronron…', 'Encore une caresse !'], bulle: ['Plop !', 'Je vais éclater de rire !'], pistache: ['Croc !', 'C’est l’heure du goûter ?'],
  gribouille: ['Regarde mon dessin !', 'Zigzag !'], noisette: ['Je fais des réserves !', 'Tu as vu un gland ?'], brume: ['Bouh !', 'Tu m’as vu ?'],
  corniche: ['Attention, je fonce !', 'Cornes en avant !'], papilla: ['Je virevolte !', 'Tout doux, mes ailes !'], grelot: ['Ding ding !', 'On fait de la musique ?'],
  frimas: ['Brrr, il fait frais !', 'Un flocon pour toi.'], draconet: ['Grrr… je suis un vrai dragon !', 'Pfff, de la fumée !'], astro: ['Je capte des étoiles…', 'Bip bip !'],
  vortex: ['Accroche-toi !', 'Tout tourne !'], sylphe: ['Le vent me porte…', 'Légère comme l’air !'],
  phenix: ['Je renais toujours !', 'Regarde mes flammes !'], comete: ['Je passe en coup de vent !', 'Fais un vœu !'],
};
// Ce qu'il fait quand toi tu fais quelque chose.
const REACTIONS = { touche: null, content: ['Bravo !', 'Bien joué !', 'Yes !', 'Trop fort !'], fete: ['Wouhou !!', 'Incroyable !', 'Champion·ne !'], surpris: ['Oh !', 'Tiens ?'] };
const auHasard = t => t[Math.floor(Math.random() * t.length)];
const positionBalade = el => { const m = getComputedStyle(el).transform; if (!m || m === 'none') return { x: 0, y: 0 }; const d = new DOMMatrix(m); return { x: d.m41, y: d.m42 }; };
// V1.10.16 : il marche sur le bouton + quand il passe dessus (il le gravit, le traverse par le haut, puis redescend).
function hauteurBalade(el, x) {
  const fab = document.querySelector('.fab');
  if (!fab || getComputedStyle(fab).display === 'none') return 0;
  const f = fab.getBoundingClientRect(), centre = x + 48;
  if (centre < f.left - 6 || centre > f.right + 6) return 0;
  const sol = innerHeight - parseFloat(getComputedStyle(el).bottom);   // le bas du compagnon quand il est par terre (sans son déplacement)
  return Math.min(0, Math.round(f.top - sol + 10));
}
// Un trajet qui suit le relief : par terre, puis sur le +, puis par terre ; la montée et la descente prennent leur temps.
function trajetBalade(el, x1, vitesse) {
  const x0 = balade.x, pts = [[x0, balade.y || 0]], n = Math.max(1, Math.ceil(Math.abs(x1 - x0) / 6));
  for (let k = 1; k <= n; k++) {
    const x = x0 + (x1 - x0) * k / n, y = hauteurBalade(el, x), [px, py] = pts.at(-1);
    if (y !== py) pts.push([px, y]);
    pts.push([x, y]);
  }
  const couts = pts.map((p, i) => i ? Math.abs(p[0] - pts[i - 1][0]) + 1.8 * Math.abs(p[1] - pts[i - 1][1]) : 0);
  const total = couts.reduce((a, b) => a + b, 0) || 1;
  let cumul = 0;
  const images = pts.map((p, i) => { cumul += couts[i]; return { transform: `translate(${p[0]}px, ${p[1]}px)`, offset: cumul / total }; });
  const duree = Math.max(700, total / vitesse * 1000), fin = pts.at(-1);
  balade.anim?.cancel();
  el.style.transition = 'none';
  el.style.transform = `translate(${fin[0]}px, ${fin[1]}px)`;
  balade.anim = el.animate(images, { duration: duree, easing: 'linear' });
  balade.x = fin[0]; balade.y = fin[1];
  el.classList.toggle('perche', fin[1] < 0);
  return duree;
}
// Si le + disparaît (autre onglet) pendant qu'il est perché dessus, il redescend.
function ajusterBalade() {
  if (!balade?.el.isConnected) return;
  const el = balade.el, y = hauteurBalade(el, balade.x), y0 = balade.y || 0;
  if (y === y0) return;
  if (y < y0) { trajetBalade(el, balade.x, 80); return; }   // le + revient : il remonte dessus
  // V1.10.18 : une petite chute, comme si le sol s'était dérobé.
  clearTimeout(baladeMinuteur);
  balade.anim?.cancel();
  el.style.transform = `translate(${balade.x}px, ${y}px)`;
  balade.anim = el.animate([{ transform: `translate(${balade.x}px, ${y0}px)` }, { transform: `translate(${balade.x}px, ${y}px)` }], { duration: 420, easing: 'cubic-bezier(.55, 0, 1, .45)' });
  balade.y = y;
  el.className = 'balade tombe';
  el.querySelector('.bulle').textContent = auHasard(['Aïe !', 'Oups !', 'Waaah !', 'Hé !']);
  baladeMinuteur = setTimeout(() => { el.className = 'balade atterrit'; baladeMinuteur = setTimeout(balade.etape, 1300); }, 420);
}
function animerBalade(el, c) {
  clearTimeout(baladeMinuteur);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const poids = { ...(COMPORTEMENTS[c.id] || { marcher: 1 }), visiter: 1.5 };
  const total = Object.values(poids).reduce((a, b) => a + b, 0);
  const choisir = () => { let t = Math.random() * total; for (const [k, p] of Object.entries(poids)) if ((t -= p) <= 0) return k; return 'marcher'; };
  balade = { el, c, x: Math.round(innerWidth * .3), y: 0 };
  el.style.transform = `translate(${balade.x}px, 0px)`;
  const aller = (x1, vitesse, classe) => {
    el.style.setProperty('--sens', x1 < balade.x ? -1 : 1);
    el.className = `balade ${classe}`;
    return trajetBalade(el, x1, vitesse);
  };
  const etape = () => {
    if (!el.isConnected) return;
    const action = choisir(), v = VITESSES[action];
    el.querySelector('.bulle').textContent = BULLES[action] || '';
    let duree = 2500 + Math.random() * 3500;
    if (action === 'visiter') {
      // Il va taquiner quelque chose de l'app : un onglet ou le bouton +. Il le fait bouger, sans jamais l'actionner.
      const fab = document.querySelector('.fab'), cibles = [...document.querySelectorAll('.tab:not([hidden]) svg'), ...(fab && getComputedStyle(fab).display !== 'none' ? [fab] : [])];
      const cible = auHasard(cibles), r = cible.getBoundingClientRect();
      const arrivee = aller(Math.round(Math.min(Math.max(r.left + r.width / 2 - 48, -10), innerWidth - 86)), 60, 'marcher');
      baladeMinuteur = setTimeout(() => {
        el.className = 'balade pousser';
        el.querySelector('.bulle').textContent = cible === fab ? 'Toc toc !' : auHasard(['Coucou !', 'Hop !', '?']);
        cible.classList.remove('bouscule'); void cible.getBoundingClientRect(); cible.classList.add('bouscule');
        setTimeout(() => cible.classList.remove('bouscule'), 700);
        baladeMinuteur = setTimeout(etape, 1800);
      }, arrivee);
      return;
    }
    if (v) {
      // Il reste surtout sur les bords du téléphone, un peu caché, et traverse de temps en temps (V1.10.6).
      const w = innerWidth, bords = [-22, w - 74];
      duree = aller(Math.round(Math.random() < .8 ? bords[Math.random() < .5 ? 0 : 1] + (Math.random() * 30 - 15) : 20 + Math.random() * (w - 136)), v, action);
    } else { el.className = `balade ${action}${balade.y < 0 ? ' perche' : ''}`; }
    baladeMinuteur = setTimeout(etape, duree + 300 + Math.random() * 700);
  };
  balade.etape = etape;
  etape();
}
// Une réaction : il s'arrête où il est, fait sa petite scène, puis reprend sa vie.
function reagirBalade(type) {
  const b = balade;
  if (!b?.el.isConnected || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  clearTimeout(baladeMinuteur);
  const p = positionBalade(b.el);
  b.anim?.cancel();
  b.x = p.x; b.y = p.y;
  b.el.style.transition = 'none';
  b.el.style.transform = `translate(${b.x}px, ${b.y}px)`;
  b.el.className = `balade reagit-${type}${b.y < 0 ? ' perche' : ''}`;
  b.el.querySelector('.bulle').textContent = type === 'touche' ? auHasard(REPLIQUES[b.c.id] || ['♥']) : auHasard(REACTIONS[type]);
  baladeMinuteur = setTimeout(b.etape, type === 'fete' ? 2600 : 1900);
}
document.addEventListener('pointerdown', e => { if (e.target.closest('#balade .compagnon')) { navigator.vibrate?.(12); reagirBalade('touche'); } });

// Ce qu'on vient de cocher, pour le faire rebondir une fois redessiné.
let tape = null;
const REBONDS = ['valider', 'habitude', 'tache', 'item', 'objectif'];
document.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (el && REBONDS.includes(el.dataset.act) && el.dataset.id) tape = [el.dataset.act, el.dataset.id]; }, true);
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.matches('input, select')) return;
  const { act, id } = el.dataset;
  const liste = () => data.listes.find(l => l.id === (el.dataset.liste || id));
  switch (act) {
    case 'plus': return plus();
    case 'partager-liste': return partagerListe(data.listes.find(l => l.id === id));
    case 'ajouter': return ({ tache: () => editerTache(), habitude: () => editerHabitude({ id: L.uid(), nom: '', freq: 'jour', faits: [], horaires: [] }, true),
      objectif: () => editerObjectif(), liste: () => editerListe(), note: () => editerNote() })[id]?.();
    case 'depart-exemple': case 'depart-vide': {
      data.recurrents = act === 'depart-exemple' ? L.recurrentsExemple() : [];
      L.regenerer(data);
      L.propager(data, data.recurrents.map(r => r.id));
      marquerDebut();
      maj();
      tutoApresDepart();
      return dire(act === 'depart-exemple' ? 'Semaine d’exemple prête : modifie-la dans Semaine' : 'C’est parti : remplis ta semaine');
    }
    case 'slot': { const r = trouverSlot(id); if (r) editerSlot(r.slot, r.cle); return; }
    case 'valider': {
      const r = trouverSlot(id);
      if (!r || (!r.slot.fait && !commence(r.cle, r.slot))) return rendre();
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
    case 'choisir-couleur': return choisirCouleur(id);
    case 'couleur': data.couleurs = { ...couleursTheme(), [id]: el.dataset.c || null }; data.theme = 'perso'; return maj();
    case 'editer-tache': return editerTache(data.taches.find(t => t.id === id));
    case 'habitude': {
      const hb = data.habitudes.find(x => x.id === id), jour = el.dataset.jour;
      if (!hb || !jour || jour > aujIso()) return rendre();
      hb.faits = hb.faits.includes(jour) ? hb.faits.filter(d => d !== jour) : [...hb.faits, jour].sort();
      noterUsage('habitudes');
      return maj();
    }
    case 'editer-habitude': return editerHabitude(data.habitudes.find(x => x.id === id));
    case 'editer-objectif': return editerObjectif(data.objectifs.find(x => x.id === id));
    case 'masquer-sport': data.modules.sport = false; maj(); return dire('Onglet Sport masqué. Pour le remettre : Profil › ⚙ › Régler par catégories › Sport.');
    case 'seance': return commencerSeance(el.dataset.seance || (trouverSlot(el.dataset.slot)?.slot.seance), el.dataset.slot || null);
    case 'seance-type': return editerSeanceType(data.seances.find(s => s.id === id));
    case 'exo': return editerExo(exo(id));
    case 'journal': return voirJournal(data.journal.find(e => e.id === id));
    case 'sem-prec': return changerSemaine(-1);
    case 'sem-suiv': return changerSemaine(1);
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
      const n = [...Object.values(data.semaines), ...data.types].reduce((k, s) => k + s.slots.filter(x => x.cat === id).length, 0) + data.recurrents.filter(r => r.cat === id).length;
      if (n) return dire(`${cat(id).nom} sert dans ${pl(n, 'créneau', 'créneaux')} : change-les d’abord de catégorie.`);
      if (data.cats.length === 1) return dire('Garde au moins une catégorie.');
      data.cats = data.cats.filter(c => c.id !== id);
      return maj();
    }
    case 'exporter': return exporter();
    case 'reglages': ui.reglages = true; vueProfil(); return scrollTo(0, 0);
    case 'reglages-fermer': ui.reglages = false; vueProfil(); return scrollTo(0, 0);
    case 'rappels-activer': return activerRappels();
    case 'rappels-plus-tard': data.notifs.plusTard = true; return maj();
    case 'rappels-desactiver': return desactiverRappels();
    case 'compte': return compte('creer');
    case 'connexion': return compte('connexion');
    case 'deconnexion': return deconnecter();
    case 'rappels-essai': return synchroRappels(true, null, true).then(() => dire('Notification d’essai dans 2 minutes, même app fermée')).catch(() => dire('Envoi impossible : réessaie avec du réseau.'));
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
    case 'assistant': return construire();
    case 'tutoriel': return tutoriel();
    case 'avis': return donnerAvis();
    case 'importer': return $('#fichier').click();
  }
});

document.addEventListener('change', e => {
  const t = e.target, { act, id } = t.dataset;
  if (!act) return;
  if (['objectif', 'item', 'tache'].includes(act)) noterUsage({ objectif: 'objectifs', item: 'listes', tache: 'taches' }[act]);
  if (act === 'objectif') { const o = data.objectifs.find(x => x.id === id); if (!o) return rendre(); o.fait = t.checked; if (t.checked) dire('Objectif atteint'); }
  if (act === 'item') data.listes.find(l => l.id === t.dataset.liste).items.find(i => i.id === id).fait = t.checked;
  if (act === 'tache') {
    const x = data.taches.find(y => y.id === id);
    if (t.checked) { if (!L.cochable(x, new Date())) return rendre(); cocherTache(x); } else { x.fait = false; x.faits = (x.faits || []).slice(0, -1); }
  }
  if (act === 'son') data.son = t.checked;
  if (act === 'rappel') data.notifs[id] = t.type === 'checkbox' ? t.checked : +t.value;
  if (act === 'taux') data.taux = Math.max(0, parseFloat(t.value.replace(',', '.')) || 0);
  if (act === 'prog-exo') ui.progExo = t.value;
  if (act === 'repos') data.repos = +t.value;
  if (act === 'cat-couleur') cat(id).couleur = t.value;
  if (act === 'cat-nom' && t.value.trim()) cat(id).nom = t.value.trim();
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
  if (k === 'habitude') return editerHabitude({ id: L.uid(), nom: txt, freq: f.elements.freq.value === 'jour' ? 'jour' : +f.elements.freq.value, faits: [] }, true);
  if (k === 'exo') data.exos.push({ id: L.uid(), nom: txt, type: f.elements.type.value, notes: '' });
  maj();
  // On garde le clavier ouvert pour enchaîner les ajouts.
  const sel = k === 'objectif' ? `form[data-horizon="${f.dataset.horizon}"] input` : k === 'item' ? `form[data-id="${f.dataset.id}"] input` : `form[data-form="${k}"] input`;
  document.querySelector(sel)?.focus();
});

document.addEventListener('input', e => {
  if (e.target.id === 'recherche') { ui.q = e.target.value; corpsNotes(); }
});
document.addEventListener('toggle', e => {
  if (!e.target.matches?.('details.liste')) return;
  ui.ouvertes[e.target.open ? 'add' : 'delete'](e.target.dataset.id);
}, true);
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="button"]')) { e.preventDefault(); e.target.click(); }
});

// L'écran Aujourd'hui suit l'heure ; tout se remet à jour au retour dans l'app.
setInterval(() => { if (!dlg.open && !geste) vueAujourdhui(); }, 60e3);
// Au retour dans l'app (l'iPhone la garde souvent en mémoire sans la relancer) : les rappels des 7 jours à venir et la copie suivent.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (!dlg.open) rendre();
  planifierSynchro();
  planifierSauvegarde();
});

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});

rendre();
dernier = L.stats(data, new Date());
verifierNiveau(dernier);
ouvrir(ui.onglet);
if (data.cgu !== CGU) conditions(); else if (!data.tutoVu && data.types.length) tutoriel();
if (data.notifs?.actif) synchroRappels(false);
majPastille();
planifierSauvegarde();
