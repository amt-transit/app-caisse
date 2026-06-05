/** DIAGNOSTIC (lecture seule) — état des colis d'un scan EN COURS.
 * Cherche des références de base dans livraisons (+ archives) : statut conteneur,
 * conteneur, quantité, historique de scan. N'écrit RIEN. */
'use strict';
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'caisse-amt-perso' });
const db = admin.firestore();
const PAGE = 500;
const U = (s) => String(s || '').toUpperCase().trim();
// Réfs de base tirées de l'image du scan :
const REFS = ['BA-210-E17','DD-153-E17','BA-204-E17','MD-095-E17','BA-201-E17','MD-086-E16','MJ-035-E15','BA-216-E17','KA-138-E17','DD-202-E17'];

async function scan(col, byRef) {
  let last = null;
  while (true) {
    let q = db.collection(col).orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE);
    if (last) q = q.startAfter(last);
    let snap; try { snap = await q.get(); } catch (e) { return; }
    if (snap.empty) break;
    for (const d of snap.docs) {
      const x = d.data() || {};
      const ref = U(x.ref);
      if (!REFS.includes(ref)) continue;
      (byRef[ref] = byRef[ref] || []).push({
        col, containerStatus: x.containerStatus || '-', conteneur: x.conteneur || '-',
        quantite: x.quantite, scanHistory: Array.isArray(x.scanHistory) ? x.scanHistory.length : 0,
        status: x.status || '-', dateAjout: (x.dateAjout || '').slice(0, 16)
      });
    }
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE) break;
  }
}

(async () => {
  const byRef = {};
  await scan('livraisons', byRef);
  await scan('livraisons_archives', byRef);
  console.log('\n=== État des réfs du scan EN COURS ===\n');
  for (const ref of REFS) {
    const rows = byRef[ref];
    if (!rows) { console.log(`${ref} : ❌ INTROUVABLE (ni livraisons ni archives)`); continue; }
    rows.forEach(r => console.log(`${ref} : [${r.col}] statutConteneur=${r.containerStatus} conteneur="${r.conteneur}" qté=${r.quantite} scans=${r.scanHistory} statut=${r.status} (${r.dateAjout})`));
  }
  console.log('');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
