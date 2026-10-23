// Le questionnaire en ligne : les réponses deviennent un fichier de profil, rien n'est envoyé.
if (window.top !== window.self) throw new Error('Le questionnaire ne s’ouvre pas dans le cadre d’un autre site.');
import { formulaireHtml, brancher, lireReponses } from './assistant.js';
import { construireProfil } from './logique.js';

const form = document.getElementById('q');
form.innerHTML = formulaireHtml();
brancher(form);
form.addEventListener('submit', async e => {
  e.preventDefault();
  const r = lireReponses(form);
  const nom = `orga-profil-${(r.prenom || 'moi').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
  const blob = new Blob([JSON.stringify(construireProfil(r), null, 1)], { type: 'application/json' });
  const fichier = new File([blob], nom, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [fichier] })) await navigator.share({ files: [fichier], title: nom });
    else Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: nom }).click();
    document.getElementById('fini').hidden = false;
  } catch (err) {
    if (err.name !== 'AbortError') { const t = document.getElementById('toast'); t.textContent = 'Le fichier n’a pas pu être créé : réessaie.'; t.hidden = false; }
  }
});
