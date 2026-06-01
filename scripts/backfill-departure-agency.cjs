/**
 * ============================================================================
 *  BACKFILL  departureAgency  —  app AMT Clients (rattachement expéditeur)
 * ----------------------------------------------------------------------------
 *  CONTEXTE
 *  --------
 *  Les factures importées depuis la page Livraison (Abidjan) sont taguées
 *  `agency = 'abidjan'` (pour la devise FCFA + la page Toutes les factures).
 *  Mais l'EXPÉDITEUR doit être rattaché à son agence de DÉPART réelle. On a
 *  ajouté un champ `departureAgency` (cf. nouvellefacture/facture-aerien/import).
 *  Les factures CRÉÉES AVANT ce correctif n'ont pas ce champ : ce script le
 *  pose, déduit de la collection :
 *     transactions            -> departureAgency = 'paris'
 *     transactions_aerien     -> 'paris'
 *     transactions_chine      -> 'chine'
 *     transactions_chine_aerien -> 'chine'
 *     transactions_<route>[_aerien] -> '<route>'
 *
 *  SÛRETÉ
 *  ------
 *   - DRY-RUN par défaut (n'écrit RIEN). APPLY=1 pour écrire.
 *   - N'écrit QUE si `departureAgency` est absent (idempotent).
 *   - Ne touche AUCUN autre champ (ni argent, ni agency, ni statut).
 *
 *  USAGE (depuis functions/ pour trouver firebase-admin) :
 *    cd functions
 *    set GOOGLE_APPLICATION_CREDENTIALS=C:\Users\JEANAFFA\Desktop\sa-amt.json
 *    node ..\scripts\backfill-departure-agency.cjs           (essai à blanc)
 *    set APPLY=1 & node ..\scripts\backfill-departure-agency.cjs   (écriture)
 * ============================================================================
 */
'use strict';
const admin = require('firebase-admin');

const PROJECT_ID = 'caisse-amt-perso';
const PAGE = 500;
const WRITE_BATCH = 400;
const APPLY = process.env.APPLY === '1';

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT_ID });
const db = admin.firestore();

// Déduit l'agence de DÉPART depuis le nom de la collection transactions.
function departureFromCollection(colName) {
  // retire le préfixe 'transactions' et le suffixe '_aerien'
  let s = colName.replace(/^transactions/, '').replace(/_aerien$/, '');
  s = s.replace(/^_/, ''); // 'transactions_chine' -> 'chine' ; 'transactions' -> ''
  return s || 'paris'; // route historique = paris
}

(async () => {
  console.log(`\n=== Backfill departureAgency — mode: ${APPLY ? 'APPLY (écriture)' : 'DRY-RUN'} ===\n`);
  const cols = await db.listCollections();
  const txCols = cols.map((c) => c.id).filter((id) => /^transactions(_[a-z0-9_]+)?$/.test(id));

  let grandScanned = 0, grandFixed = 0, grandWritten = 0;
  for (const colName of txCols) {
    const dep = departureFromCollection(colName);
    let last = null, scanned = 0, fixed = 0, written = 0;
    while (true) {
      let q = db.collection(colName).orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE);
      if (last) q = q.startAfter(last);
      let snap;
      try { snap = await q.get(); } catch (e) { break; }
      if (snap.empty) break;

      let batch = db.batch(), n = 0;
      for (const doc of snap.docs) {
        scanned++;
        const d = doc.data() || {};
        if (d.departureAgency) continue; // déjà présent -> on saute
        fixed++;
        if (APPLY) {
          batch.update(doc.ref, { departureAgency: dep });
          if (++n >= WRITE_BATCH) { await batch.commit(); written += n; batch = db.batch(); n = 0; }
        }
      }
      if (APPLY && n > 0) { await batch.commit(); written += n; }
      last = snap.docs[snap.docs.length - 1];
      if (snap.size < PAGE) break;
    }
    console.log(`-> ${colName}  (départ=${dep})  scannées=${scanned}  à corriger=${fixed}  ${APPLY ? `écrites=${written}` : '(dry-run)'}`);
    grandScanned += scanned; grandFixed += fixed; grandWritten += written;
  }
  console.log(`\nTOTAL : scannées=${grandScanned}  à corriger=${grandFixed}  ${APPLY ? `écrites=${grandWritten}` : ''}`);
  console.log(`${APPLY ? '✅ Terminé.' : 'ℹ️  DRY-RUN : relancez avec APPLY=1 pour écrire.'}\n`);
  process.exit(0);
})().catch((e) => { console.error('Erreur backfill :', e); process.exit(1); });
