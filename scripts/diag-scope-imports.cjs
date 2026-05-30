/**
 * DIAGNOSTIC (lecture seule) — PÉRIMÈTRE des imports.
 * Compte : factures (transactions) totales + signature import ; livraisons
 * totales ; livraisons SANS facture (= importées mais pas encore visibles app).
 * N'écrit RIEN.
 */
'use strict';
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'caisse-amt-perso' });
const db = admin.firestore();
const PAGE = 500;
const nameKey = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const miss = (v) => v === undefined || v === null || String(v).trim() === '';
const U = (s) => String(s || '').toUpperCase().trim();

async function scan(col, fn) {
  let last = null;
  while (true) {
    let q = db.collection(col).orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE);
    if (last) q = q.startAfter(last);
    let snap;
    try { snap = await q.get(); } catch (e) { return; }
    if (snap.empty) break;
    for (const d of snap.docs) fn(d.data() || {});
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE) break;
  }
}

(async () => {
  // 1. Factures
  const transRefs = new Set();
  let trTotal = 0, trImport = 0;
  await scan('transactions', (t) => {
    if (t.isDeleted) return;
    trTotal++;
    if (t.reference) transRefs.add(U(t.reference));
    if (!miss(t.nomDestinataire) && nameKey(t.nom) === nameKey(t.nomDestinataire)) trImport++;
  });

  // 2. Livraisons (par statut conteneur) + lien vers facture
  let livDocs = 0;
  const livRefs = new Set();
  const byStatus = {};            // containerStatus -> nb docs
  const livRefNoTrans = new Set(); // refs de livraison SANS facture
  const statusNoTrans = {};        // statut des refs sans facture
  await scan('livraisons', (l) => {
    livDocs++;
    const ref = U(l.ref);
    if (!ref) return;
    livRefs.add(ref);
    const st = l.containerStatus || l.status || '(inconnu)';
    byStatus[st] = (byStatus[st] || 0) + 1;
    if (!transRefs.has(ref)) {
      livRefNoTrans.add(ref);
      statusNoTrans[st] = (statusNoTrans[st] || 0) + 1;
    }
  });

  console.log('\n=== PÉRIMÈTRE DES IMPORTS (lecture seule) ===\n');
  console.log(`FACTURES (transactions, non supprimées) : ${trTotal}`);
  console.log(`  • dont signature « import » (nom = destinataire) : ${trImport}`);
  console.log(`  • références de facture distinctes : ${transRefs.size}\n`);
  console.log(`LIVRAISONS : ${livDocs} docs  (${livRefs.size} références distinctes)`);
  console.log(`  • répartition par statut conteneur :`);
  Object.entries(byStatus).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`      - ${k} : ${v}`));
  console.log(`\nLIVRAISONS SANS FACTURE (importées, PAS encore visibles dans l'app) :`);
  console.log(`  • ${livRefNoTrans.size} références`);
  Object.entries(statusNoTrans).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`      - ${k} : ${v}`));
  console.log('');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
