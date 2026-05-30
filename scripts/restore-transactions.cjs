/**
 * RESTAURATION — remet les factures dans l'état d'une SAUVEGARDE JSON
 * produite par backup-transactions.cjs. À n'utiliser qu'en cas de problème.
 *
 * SÛRETÉ : DRY-RUN par défaut. APPLY=1 pour réécrire réellement.
 * Usage : depuis functions/ avec GOOGLE_APPLICATION_CREDENTIALS défini.
 *   set FILE=C:\Users\JEANAFFA\Desktop\sauvegarde-factures-XXXX.json
 *   node ../scripts/restore-transactions.cjs            (dry-run)
 *   set APPLY=1 & node ../scripts/restore-transactions.cjs   (réel)
 */
'use strict';
const admin = require('firebase-admin');
const fs = require('fs');

const FILE = process.env.FILE;
const APPLY = process.env.APPLY === '1';
const WRITE_BATCH = 400;

if (!FILE || !fs.existsSync(FILE)) {
  console.error('FILE manquant ou introuvable. Définissez FILE=chemin\\vers\\sauvegarde.json');
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'caisse-amt-perso' });
const db = admin.firestore();

(async () => {
  const payload = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  console.log(`\n=== RESTAURATION — mode: ${APPLY ? 'APPLY (réel)' : 'DRY-RUN'} ===`);
  console.log(`Fichier : ${FILE}  (sauvegarde du ${payload.date})\n`);
  for (const [col, docs] of Object.entries(payload.collections || {})) {
    process.stdout.write(`-> ${col} : ${docs.length} factures ... `);
    let written = 0, batch = db.batch(), n = 0;
    if (APPLY) {
      for (const { id, data } of docs) {
        batch.set(db.collection(col).doc(id), data);
        if (++n >= WRITE_BATCH) { await batch.commit(); written += n; batch = db.batch(); n = 0; }
      }
      if (n > 0) { await batch.commit(); written += n; }
    }
    console.log(APPLY ? `restaurées=${written}` : '(dry-run : rien écrit)');
  }
  console.log(`\n${APPLY ? '✅ Restauration terminée.' : 'ℹ️  DRY-RUN. Relancez avec APPLY=1 pour restaurer réellement.'}\n`);
  process.exit(0);
})().catch(e => { console.error('Erreur restauration :', e); process.exit(1); });
