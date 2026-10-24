// Lit les avis des testeurs sur le serveur, avec la clé d'Emma (jamais gardée sur la page).
import { SERVEUR_RAPPELS } from './logique.js';

if (window.top !== window.self) throw new Error('Cette page ne s’ouvre pas dans le cadre d’un autre site.');
const etat = document.getElementById('etat'), liste = document.getElementById('liste');
document.getElementById('f').addEventListener('submit', async e => {
  e.preventDefault();
  const cle = new FormData(e.target).get('cle').trim();
  etat.textContent = 'Chargement…';
  liste.replaceChildren();
  try {
    const r = await fetch(SERVEUR_RAPPELS + '/avis-liste', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cle}` }, body: '{}' });
    if (r.status === 401) { etat.textContent = 'Clé incorrecte.'; return; }
    if (!r.ok) { etat.textContent = `Le serveur répond ${r.status}.`; return; }
    const avis = await r.json();
    const notes = avis.filter(a => a.note).map(a => a.note);
    etat.textContent = `${avis.length} avis${notes.length ? ` · moyenne ${(notes.reduce((a, b) => a + b, 0) / notes.length).toFixed(1)} sur 5` : ''}`;
    // Tout est posé en texte (textContent) : un avis ne peut pas injecter de code dans la page.
    for (const a of avis) {
      const carte = document.createElement('div'), tete = document.createElement('b'), info = document.createElement('small'), p = document.createElement('p');
      carte.className = 'card';
      tete.textContent = a.note ? '★'.repeat(a.note) + '☆'.repeat(5 - a.note) : 'Sans note';
      info.textContent = ` · ${new Date(a.date).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })} · version ${a.version || '?'}`;
      p.textContent = a.texte || '(pas de texte)';
      carte.append(tete, info, p);
      liste.append(carte);
    }
  } catch { etat.textContent = 'Pas de réseau.'; }
});
