/**
 * ============================================================================
 *  CORRECTION montants € -> FCFA — colis « Stock Paris » importés par erreur en €
 * ----------------------------------------------------------------------------
 *  Contexte : un import a chargé les montants en EUROS au lieu de FCFA. Les
 *  colis concernés sont en `containerStatus = 'PARIS'` et datés du jour d'import.
 *  Ce script multiplie `montant` et `prixOriginal` par 655.957 (€ -> FCFA),
 *  UNIQUEMENT pour ces colis-là.
 *
 *  SÛRETÉ :
 *   - DRY-RUN par défaut (n'écrit rien). APPLY=1 pour écrire.
 *   - Périmètre STRICT : containerStatus='PARIS' ET dateAjout du jour cible
 *     (DATE=2026-05-29 par défaut). Les anciens colis FCFA (autres dates) sont
 *     EXCLUS. Garde-fou : on signale (et on PEUT exclure) les montants déjà
 *     « grands » (>= SEUIL) qui seraient peut-être déjà en FCFA.
 *   - Écrit un fichier de RESTAURATION (anciennes valeurs) avant d'appliquer.
 *   - Admin SDK -> pas de cache hors-ligne -> pas d'erreur « primary lease ».
 *
 *  USAGE (depuis functions/) :
 *    set GOOGLE_APPLICATION_CREDENTIALS=C:\Users\JEANAFFA\Desktop\sa-amt.json
 *    node ../scripts/fix-paris-eur-to-fcfa.cjs            (essai à blanc)
 *    set APPLY=1 & node ../scripts/fix-paris-eur-to-fcfa.cjs   (écriture réelle)
 *  Options : DATE=2026-05-29 (jour ciblé) · SEUIL=5000 (au-delà = suspect, exclu).
 * ============================================================================
 */
'use strict';
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'caisse-amt-perso' });
const db = admin.firestore();

const TAUX = 655.957;
const PAGE = 500;
const WRITE_BATCH = 400;
const APPLY = process.env.APPLY === '1';
const DATE = process.env.DATE || '2026-05-29';
// Garde-fou de montant DÉSACTIVÉ par défaut : le périmètre date+PARIS suffit
// (tous les colis Stock Paris du jour viennent du mauvais import en €). Mettre
// SEUIL=5000 si un jour on veut exclure les gros montants déjà en FCFA.
const SEUIL = process.env.SEUIL ? parseFloat(process.env.SEUIL) : Infinity;
const COLLECTION = 'livraisons';

const num = (v) => parseFloat(String(v == null ? '' : v).replace(/[^\d.,-]/g, '').replace(',', '.')) || 0;

(async () => {
  console.log(`\n=== Correction € -> FCFA (Stock Paris, jour ${DATE}) — mode: ${APPLY ? 'APPLY' : 'DRY-RUN'} ===\n`);
  let last = null;
  let scanned = 0, cibles = 0, exclusGrands = 0, exclusZero = 0;
  const updates = [];      // { id, montant_old, montant_new, prix_old, prix_new }
  const samples = [];
  const grandsSamples = [];

  while (true) {
    let q = db.collection(COLLECTION).orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const d of snap.docs) {
      const x = d.data() || {};
      scanned++;
      if ((x.containerStatus || '') !== 'PARIS') continue;
      if (!String(x.dateAjout || '').startsWith(DATE)) continue;

      const m = num(x.montant);
      if (m <= 0) { exclusZero++; continue; }
      if (m >= SEUIL) { // suspect : peut-être déjà FCFA -> on n'y touche pas
        exclusGrands++;
        if (grandsSamples.length < 8) grandsSamples.push({ ref: x.ref, montant: x.montant, date: (x.dateAjout || '').slice(0, 10) });
        continue;
      }

      const upd = { id: d.id, ref: x.ref };
      upd.montant_old = x.montant;
      upd.montant_new = String(Math.round(m * TAUX));
      const p = num(x.prixOriginal);
      if (p > 0 && p < SEUIL) { upd.prix_old = x.prixOriginal; upd.prix_new = String(Math.round(p * TAUX)); }
      updates.push(upd);
      cibles++;
      if (samples.length < 12) samples.push(upd);
    }
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE) break;
  }

  console.log(`Livraisons scannées : ${scanned}`);
  console.log(`Colis Stock Paris du ${DATE} À CONVERTIR : ${cibles}`);
  console.log(`  exclus (montant=0) : ${exclusZero}`);
  console.log(`  exclus (montant >= ${SEUIL}, déjà FCFA ?) : ${exclusGrands}`);
  if (grandsSamples.length) {
    console.log('  ⚠️  Exemples de gros montants EXCLUS (à vérifier manuellement si besoin) :');
    grandsSamples.forEach(s => console.log(`     ${s.ref} montant="${s.montant}" (${s.date})`));
  }
  console.log('\nExemples de conversions (€ -> FCFA) :');
  samples.forEach(s => console.log(`  ${s.ref} : montant ${s.montant_old} -> ${s.montant_new}` + (s.prix_new ? ` | prixOriginal ${s.prix_old} -> ${s.prix_new}` : '')));

  if (!APPLY) {
    console.log(`\nℹ️  DRY-RUN : ${cibles} colis seraient corrigés. Relancez avec APPLY=1 pour écrire.\n`);
    process.exit(0);
  }

  // Sauvegarde de restauration AVANT écriture.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const rollbackFile = path.join(require('os').homedir(), 'Desktop', `restauration-montants-${stamp}.json`);
  fs.writeFileSync(rollbackFile, JSON.stringify({ date: new Date().toISOString(), collection: COLLECTION, updates }), 'utf8');
  console.log(`\n💾 Restauration écrite : ${rollbackFile}`);

  let written = 0, batch = db.batch(), n = 0;
  for (const u of updates) {
    const data = { montant: u.montant_new };
    if (u.prix_new) data.prixOriginal = u.prix_new;
    batch.update(db.collection(COLLECTION).doc(u.id), data);
    if (++n >= WRITE_BATCH) { await batch.commit(); written += n; batch = db.batch(); n = 0; }
  }
  if (n > 0) { await batch.commit(); written += n; }
  console.log(`✅ Terminé : ${written} colis corrigés (€ -> FCFA).\n`);
  process.exit(0);
})().catch(e => { console.error('Erreur correction :', e); process.exit(1); });
