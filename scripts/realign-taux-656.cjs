/**
 * ============================================================================
 *  RÉALIGNEMENT TAUX 655,957 -> 656 sur les factures NON PAYÉES
 * ----------------------------------------------------------------------------
 *  Contexte : on est passé au taux maison 656. Des factures créées AVANT ont
 *  des montants figés à l'ancien taux, parfois avec prix et reste à des taux
 *  DIFFÉRENTS (ex. prix=65596 mais reste=65600) -> incohérence visible.
 *
 *  RÈGLE DE SÛRETÉ (demandée) : on ne TOUCHE JAMAIS aux montants déjà VALIDÉS.
 *   -> on ne traite QUE les factures NON PAYÉES (montantParis + montantAbidjan = 0).
 *   -> les factures avec un encaissement validé sont EXCLUES, intactes.
 *
 *  Ce que fait l'APPLY : pour chaque facture non payée incohérente, on rend
 *  prix et reste COHÉRENTS en prenant la plus grande des deux valeurs (= la
 *  valeur au taux 656, ex. 65600), de sorte que prix = reste = valeur 656.
 *  (Conservateur : on ne réécrit que si prix != reste.)
 *
 *  SÛRETÉ :
 *   - DRY-RUN par défaut (n'écrit rien). APPLY=1 pour écrire.
 *   - Sauvegarde de restauration AVANT toute écriture.
 *   - Admin SDK (pas de cache hors-ligne).
 *
 *  USAGE (depuis functions/) :
 *    set GOOGLE_APPLICATION_CREDENTIALS=C:\Users\JEANAFFA\Desktop\sa-amt.json
 *    node ../scripts/realign-taux-656.cjs            (essai à blanc / diagnostic)
 *    set APPLY=1 & node ../scripts/realign-taux-656.cjs   (écriture réelle)
 * ============================================================================
 */
'use strict';
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'caisse-amt-perso' });
const db = admin.firestore();

const APPLY = process.env.APPLY === '1';
const num = (v) => parseFloat(String(v == null ? '' : v).replace(/[^\d.,-]/g, '').replace(',', '.')) || 0;

(async () => {
  console.log(`\n=== Réalignement taux 656 (factures NON PAYÉES) — mode: ${APPLY ? 'APPLY' : 'DRY-RUN'} ===\n`);

  // Toutes les collections de factures : transactions + transactions_<route>.
  const cols = await db.listCollections();
  const factCols = cols.filter((c) => c.id === 'transactions' || c.id.startsWith('transactions_')).map((c) => c.id);
  console.log('Collections factures :', factCols.join(', ') || '(aucune)');

  let scanned = 0, paid = 0, deleted = 0, coherent = 0;
  const targets = []; // factures non payées + incohérentes
  const samples = [];

  for (const col of factCols) {
    const snap = await db.collection(col).get();
    for (const d of snap.docs) {
      const x = d.data() || {};
      scanned++;
      if (x.isDeleted) { deleted++; continue; }
      const encaisse = num(x.montantParis) + num(x.montantAbidjan);
      if (encaisse > 0) { paid++; continue; } // montant déjà validé -> on ne touche pas
      const prix = num(x.prix);
      const reste = num(x.reste);
      const aPrix = Math.abs(prix), aReste = Math.abs(reste);
      if (aPrix === 0 && aReste === 0) { continue; }
      // Le reste est stocké en NÉGATIF (convention "dû"). On compare donc les
      // MAGNITUDES : si elles sont égales (au FCFA près), la facture est cohérente.
      if (Math.abs(aPrix - aReste) <= 1) { coherent++; continue; }
      // Vraie incohérence (prix au vieux taux, reste au nouveau) -> on retient la
      // plus grande magnitude (= la valeur au taux 656) et on garde le signe du reste.
      const val = Math.max(aPrix, aReste);
      const t = { col, id: d.id, ref: x.ref || x.reference || d.id, prix_old: x.prix, reste_old: x.reste, prix_new: val, reste_new: -val };
      targets.push(t);
      if (samples.length < 20) samples.push(t);
    }
  }

  console.log(`\nFactures scannées : ${scanned}`);
  console.log(`  supprimées (ignorées) : ${deleted}`);
  console.log(`  DÉJÀ PAYÉES (intactes, non touchées) : ${paid}`);
  console.log(`  non payées & déjà cohérentes : ${coherent}`);
  console.log(`  >>> NON PAYÉES & INCOHÉRENTES (prix != reste) À CORRIGER : ${targets.length}`);
  if (samples.length) {
    console.log('\nExemples (prix / reste -> valeur retenue) :');
    samples.forEach((s) => console.log(`  [${s.col}] ${s.ref} : prix=${s.prix_old} reste=${s.reste_old}  ->  prix=${s.prix_new} reste=${s.reste_new}`));
  }

  if (!APPLY) {
    console.log(`\nℹ️  DRY-RUN : ${targets.length} facture(s) seraient corrigée(s). Relancez avec APPLY=1 pour écrire.\n`);
    process.exit(0);
  }

  // Sauvegarde de restauration AVANT écriture.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const rollbackFile = path.join(require('os').homedir(), 'Desktop', `restauration-taux656-${stamp}.json`);
  fs.writeFileSync(rollbackFile, JSON.stringify({ date: new Date().toISOString(), targets }), 'utf8');
  console.log(`\n💾 Restauration écrite : ${rollbackFile}`);

  let written = 0, batch = db.batch(), n = 0;
  for (const t of targets) {
    batch.update(db.collection(t.col).doc(t.id), { prix: t.prix_new, reste: t.reste_new });
    if (++n >= 400) { await batch.commit(); written += n; batch = db.batch(); n = 0; }
  }
  if (n > 0) { await batch.commit(); written += n; }
  console.log(`✅ Terminé : ${written} facture(s) réalignée(s) au taux 656.\n`);
  process.exit(0);
})().catch((e) => { console.error('Erreur réalignement :', e); process.exit(1); });
