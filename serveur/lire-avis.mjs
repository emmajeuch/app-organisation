// Lire les avis depuis le PC : node serveur/lire-avis.mjs (ajouter --fiches pour ne voir que les fiches sport proposées).
// La clé n'est jamais dans le dépôt : elle se lit dans la variable AVIS_CLE, ou dans le fichier .orga-avis-cle du dossier personnel.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const lireFichier = () => { try { return readFileSync(join(homedir(), '.orga-avis-cle'), 'utf8'); } catch { return ''; } };
const cle = (process.env.AVIS_CLE || lireFichier()).trim();
if (!cle) { console.error('Clé absente : crée le fichier .orga-avis-cle dans ton dossier personnel, avec la clé des avis pour seul contenu.'); process.exit(1); }
const r = await fetch('https://orga-rappels.orgadevie.workers.dev/avis-liste', {
  method: 'POST', body: '{}', headers: { Origin: 'https://emmajeuch.github.io', 'Content-Type': 'application/json', Authorization: `Bearer ${cle}` },
});
if (!r.ok) { console.error(`Refusé par le serveur : ${r.status}`); process.exit(1); }
const seulementFiches = process.argv.includes('--fiches');
const avis = (await r.json()).filter(a => !seulementFiches || /^\[(Fiche proposée|Correction de fiche)\]/.test(a.texte || ''));
for (const a of avis) console.log(`--- ${a.date} · ${a.note ?? 'sans note'} · v${a.version || '?'}\n${a.texte}\n`);
console.log(`${avis.length} ${seulementFiches ? 'fiche(s)' : 'avis'}.`);
