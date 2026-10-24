// Les questions de départ, communes à l'assistant de l'app et au questionnaire en ligne.
import { hhmm, CONSEILS, versHeure } from './logique.js';

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MENAGE = ['Ménage', 'Lessive', 'Courses', 'Vaisselle', 'Sortir les poubelles'];
const LISTES = ['Courses', 'À acheter', 'À regarder', 'À lire', 'Matériel', 'Cadeaux'];
const HABITUDES = ['Boire 1,5 L d’eau', 'Lire 20 min', 'Étirements', 'Coucher avant minuit'];
export const SPORTS = [...new Set(['Sabre laser', ...Object.keys(CONSEILS)])];

// Heures à la minute près (de 5 en 5 minutes au clavier de l'iPhone).
const heures = (nom, de, a, sel) => `<input type="time" name="${nom}" value="${hhmm(sel)}" step="300" required>`;
const jours = (nom, sel = []) => `<div class="cats">${JOURS.map((n, j) => `<label><input type="checkbox" name="${nom}" value="${j}" ${sel.includes(j) ? 'checked' : ''}><span class="sans">${n}</span></label>`).join('')}</div>`;

export function formulaireHtml() {
  return `
  <fieldset class="etape-q"><legend>1. Toi</legend>
    <label class="champ">Prénom ou pseudo<input name="prenom" maxlength="40" autocomplete="off"></label>
    <label class="coche"><input type="checkbox" class="chk" name="etudes" checked data-montre="q-cours">Je fais des études</label>
    <label class="coche"><input type="checkbox" class="chk" name="travail" data-montre="q-travail">Je travaille (job, alternance, extras)</label>
  </fieldset>
  <fieldset class="etape-q"><legend>2. Tes journées</legend>
    <div class="champs" style="grid-template-columns: 1fr 1fr"><label class="champ">Lever${heures('lever', 5, 11, 7)}</label><label class="champ">Coucher${heures('coucher', 21, 25, 23)}</label></div>
    <label class="coche"><input type="checkbox" class="chk" name="repas" checked>Mettre les repas dans l’emploi du temps</label>
  </fieldset>
  <fieldset class="etape-q" id="q-cours"><legend>3. Tes cours</legend>
    <div class="champ">Les jours de cours${jours('coursJours', [0, 1, 2, 3, 4])}</div>
    <div class="champs" style="grid-template-columns: 1fr 1fr"><label class="champ">Début${heures('coursDebut', 7, 12, 8)}</label><label class="champ">Fin${heures('coursFin', 11, 21, 17)}</label></div>
    <p class="aide">Une journée type : tu ajusteras chaque cours ensuite dans la grille.</p>
  </fieldset>
  <fieldset class="etape-q" id="q-travail" hidden><legend>4. Ton travail</legend>
    <div class="champ">Les jours de travail${jours('travailJours')}</div>
    <div class="champs" style="grid-template-columns: 1fr 1fr"><label class="champ">Début${heures('travailDebut', 5, 22, 9)}</label><label class="champ">Fin${heures('travailFin', 6, 25, 17)}</label></div>
    <label class="champ">Taux horaire en € (facultatif, pour estimer ta paie)<input name="taux" inputmode="decimal" autocomplete="off"></label>
  </fieldset>
  <fieldset class="etape-q"><legend>5. Ton sport</legend>
    <label class="champ">Ton sport (n’importe lequel, laisse vide si aucun)<input name="sport" list="q-sports" maxlength="40" placeholder="Ex. escrime, judo, natation…" autocomplete="off"></label>
    <datalist id="q-sports">${SPORTS.map(s => `<option value="${s}">`).join('')}</datalist>
    <div id="q-club" hidden>
      <div class="champ">Les jours d’entraînement${jours('clubJours')}</div>
      <div class="champs" style="grid-template-columns: 1fr 1fr"><label class="champ">Heure${heures('clubDebut', 6, 22, 18)}</label>
        <label class="champ">Durée<select name="clubDuree">${[1, 1.5, 2, 2.5, 3].map(d => `<option value="${d}" ${d === 1.5 ? 'selected' : ''}>${hhmm(d).replace(':', ' h ').replace(/^0/, '')}</option>`).join('')}</select></label></div>
    </div>
  </fieldset>
  <fieldset class="etape-q"><legend>6. La maison</legend>
    <ul class="list">${MENAGE.map((m, i) => `<li><label class="coche" style="flex:1"><input type="checkbox" class="chk" name="menage" value="${i}">${m}</label><select name="menageJour${i}" aria-label="Jour : ${m}">${JOURS.map((n, j) => `<option value="${j}" ${j === 5 ? 'selected' : ''}>${n}</option>`).join('')}</select></li>`).join('')}</ul>
  </fieldset>
  <fieldset class="etape-q"><legend>7. Listes et habitudes</legend>
    <div class="champ">Tes listes${'<div class="cats">' + LISTES.map(l => `<label><input type="checkbox" name="listes" value="${l}" ${l === 'Courses' ? 'checked' : ''}><span class="sans">${l}</span></label>`).join('') + '</div>'}</div>
    <label class="champ">Tes propres listes, séparées par des virgules<input name="listesPerso" maxlength="400" placeholder="Ex. Idées de sorties, Jeux à finir" autocomplete="off"></label>
    <div class="champ">Des habitudes à suivre${'<div class="cats">' + HABITUDES.map(h => `<label><input type="checkbox" name="habitudes" value="${h}"><span class="sans">${h}</span></label>`).join('') + '</div>'}</div>
    <label class="champ">Tes propres habitudes, séparées par des virgules<input name="habitudesPerso" maxlength="400" placeholder="Ex. Méditer 5 min, Écrire une page" autocomplete="off"></label>
  </fieldset>`;
}

// Montre les parties qui dépendent d'une réponse (cours, travail, club).
export function brancher(form) {
  const maj = () => {
    form.querySelectorAll('[data-montre]').forEach(c => { form.querySelector('#' + c.dataset.montre).hidden = !c.checked; });
    form.querySelector('#q-club').hidden = !form.elements.sport.value.trim();
  };
  form.addEventListener('change', maj);
  form.addEventListener('input', maj);
  maj();
}

export function lireReponses(form) {
  const f = new FormData(form), js = k => f.getAll(k).map(Number);
  const n = k => k === 'clubDuree' ? +f.get(k) : versHeure(f.get(k), 5);
  // Ce que la personne écrit elle-même : séparé par des virgules, 10 au plus, 60 caractères chacun.
  const perso = k => String(f.get(k) || '').split(',').map(x => x.trim().slice(0, 60)).filter(Boolean).slice(0, 10);
  const sport = String(f.get('sport') || '').trim().slice(0, 40);
  return {
    prenom: String(f.get('prenom') || '').trim().slice(0, 40), etudes: !!f.get('etudes'), travail: !!f.get('travail'),
    lever: n('lever'), coucher: n('coucher'), repas: !!f.get('repas'),
    coursJours: js('coursJours'), coursDebut: n('coursDebut'), coursFin: n('coursFin'),
    travailJours: js('travailJours'), travailDebut: n('travailDebut'), travailFin: n('travailFin'),
    taux: parseFloat(String(f.get('taux') || '').replace(',', '.')) || 0,
    sport, clubJours: js('clubJours'), clubDebut: n('clubDebut'), clubDuree: n('clubDuree'),
    menage: f.getAll('menage').map(i => ({ titre: MENAGE[+i], jour: +f.get(`menageJour${i}`) })),
    listes: [...new Set([...f.getAll('listes'), ...perso('listesPerso')])], habitudes: [...new Set([...f.getAll('habitudes'), ...perso('habitudesPerso')])],
  };
}
