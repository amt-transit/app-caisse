/**
 * SAUVEGARDE (lecture seule) — copie complète des collections de factures
 * AVANT le backfill. Écrit un fichier JSON horodaté (id + toutes les données).
 * Sert de point de restauration (voir restore-transactions.cjs).
 *
 * Usage : depuis functions/ avec GOOGLE_APPLICATION_CREDENTIALS défini.
 *   node ../scripts/backup-transactions.cjs
 * Dossier de sortie : OUTDIR=... (défaut : Bureau de l'utilisateur).
 */
'use strict';
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'caisse-amt-perso' });
const db = admin.firestore();
const PAGE = 500;
const COLLECTIONS = ['transactions', 'transactions_aerien'];
const OUTDIR = process.env.OUTDIR || path.join(require('os').homedir(), 'Desktop');

async function dump(col) {
  const out = [];
  let last = null;
  while (true) {
    let q = db.collection(col).orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE);
    if (last) q = q.startAfter(last);
    let snap;
    try { snap = await q.get(); } catch (e) { return out; }
    if (snap.empty) break;
    for (const d of snap.docs) out.push({ id: d.id, data: d.data() });
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE) break;
  }
  return out;
}

(async () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const payload = { project: 'caisse-amt-perso', date: new Date().toISOString(), collections: {} };
  let total = 0;
  for (const col of COLLECTIONS) {
    process.stdout.write(`Sauvegarde ${col} ... `);
    const docs = await dump(col);
    payload.collections[col] = docs;
    total += docs.length;
    console.log(`${docs.length} documents`);
  }
  const file = path.join(OUTDIR, `sauvegarde-factures-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(payload), 'utf8');
  const sizeMo = (fs.statSync(file).size / 1048576).toFixed(1);
  console.log(`\n✅ Sauvegarde écrite : ${file}`);
  console.log(`   ${total} factures au total (${sizeMo} Mo).`);
  process.exit(0);
})().catch(e => { console.error('Erreur sauvegarde :', e); process.exit(1); });
