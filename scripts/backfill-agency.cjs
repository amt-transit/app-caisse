/**
 * ============================================================================
 *  BACKFILL  agency  +  isDeleted   —  Réparation données historiques
 * ----------------------------------------------------------------------------
 *  Problème : d'anciens documents n'ont pas le champ `agency` (et parfois pas
 *  `isDeleted`). Or les écrans filtrent where("agency","==",X) et
 *  where("isDeleted","!="|"=="...) / orderBy("isDeleted") → un document SANS
 *  ces champs n'est JAMAIS renvoyé par Firestore (l'égalité/tri exclut les
 *  champs absents). Résultat : données présentes mais invisibles.
 *
 *  Ce script, PAR COLLECTION :
 *   - agency, mode 'fill'  : pose `agency=value` UNIQUEMENT si absent/vide
 *   - agency, mode 'force' : pose `agency=value` partout où agency !== value
 *                            (corrige aussi les docs ayant une autre valeur)
 *   - fixIsDeleted: true   : pose `isDeleted=false` UNIQUEMENT si le champ est
 *                            absent (ne touche JAMAIS un isDeleted déjà défini
 *                            → ne "ressuscite" aucun document supprimé)
 *
 *  Réglages confirmés avec le métier :
 *   - transactions / livraisons : corridor créé côté Paris (agency absent)
 *       -> agency 'paris' en mode 'fill'
 *   - expenses / bank_movements / other_income : TOUTE la trésorerie
 *     historique a été saisie côté Abidjan (Paris n'a fait que des tests :
 *     factures/programmes/RDV/bateau, AUCUNE dépense)
 *       -> agency 'abidjan' en mode 'force'
 *   - livraisons / expenses / bank_movements / other_income : aussi
 *     isDeleted=false là où absent (les écrans les excluent sinon).
 *
 *  SÛRETÉ :
 *   - DRY-RUN par défaut : n'écrit RIEN tant que APPLY=1 n'est pas fourni.
 *   - Idempotent : ne modifie que ce qui doit l'être ; relançable
 *     (2e passage = 0 à corriger).
 *   - Lots de 400 écritures (limite Firestore = 500).
 *   - Ne modifie aucun autre champ.
 *
 *  PRÉREQUIS :
 *   - EXPORT Firestore (sauvegarde) AVANT tout APPLY.
 *   - GOOGLE_APPLICATION_CREDENTIALS = JSON du compte de service
 *     (projet caisse-amt-perso).
 *
 *  USAGE :
 *   # Dry-run (défaut, n'écrit rien) :
 *   GOOGLE_APPLICATION_CREDENTIALS=/chemin/sa.json node scripts/backfill-agency.cjs
 *
 *   # Application réelle (APRÈS sauvegarde + revue du dry-run) :
 *   GOOGLE_APPLICATION_CREDENTIALS=/chemin/sa.json APPLY=1 node scripts/backfill-agency.cjs
 *
 *  (firebase-admin est installé dans ./functions ; si Node ne le trouve pas :
 *   cd functions && node ..\\scripts\\backfill-agency.cjs)
 * ============================================================================
 */

'use strict';

const admin = require('firebase-admin');

// ---- Paramètres ------------------------------------------------------------
const PROJECT_ID = 'caisse-amt-perso';

// Par collection : { agency, mode: 'fill'|'force', fixIsDeleted?: true }
const TARGETS = {
  transactions: { agency: 'paris', mode: 'fill' },
  livraisons: { agency: 'paris', mode: 'fill', fixIsDeleted: true },
  expenses: { agency: 'abidjan', mode: 'force', fixIsDeleted: true },
  bank_movements: { agency: 'abidjan', mode: 'force', fixIsDeleted: true },
  other_income: { agency: 'abidjan', mode: 'force', fixIsDeleted: true },
};

const PAGE_SIZE = 500; // lecture paginée
const WRITE_BATCH = 400; // < 500 (limite Firestore)
const APPLY = process.env.APPLY === '1'; // sinon dry-run

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: PROJECT_ID,
});
const db = admin.firestore();

const isMissing = (v) => v === undefined || v === null || v === '';

// Construit l'objet de mise à jour minimal pour un document (vide = rien à faire).
function buildUpdate(data, cfg) {
  const upd = {};

  // --- agency ---
  const agencyNeeds =
    cfg.mode === 'force' ? data.agency !== cfg.agency : isMissing(data.agency);
  if (agencyNeeds) upd.agency = cfg.agency;

  // --- isDeleted : seulement si ABSENT (jamais écraser true/false existant) ---
  if (cfg.fixIsDeleted && (data.isDeleted === undefined || data.isDeleted === null)) {
    upd.isDeleted = false;
  }

  return upd;
}

async function processCollection(name, cfg) {
  const col = db.collection(name);
  let last = null;
  let scanned = 0;
  let toFix = 0;
  let fixedAgency = 0;
  let fixedIsDeleted = 0;
  let written = 0;

  // Pagination stable par documentId (robuste quelle que soit la taille).
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let q = col.orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE_SIZE);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;

    let batch = db.batch();
    let batchCount = 0;

    for (const doc of snap.docs) {
      scanned++;
      const upd = buildUpdate(doc.data(), cfg);
      const keys = Object.keys(upd);
      if (keys.length) {
        toFix++;
        if ('agency' in upd) fixedAgency++;
        if ('isDeleted' in upd) fixedIsDeleted++;
        if (APPLY) {
          batch.update(doc.ref, upd);
          batchCount++;
          if (batchCount >= WRITE_BATCH) {
            await batch.commit();
            written += batchCount;
            batch = db.batch();
            batchCount = 0;
          }
        }
      }
    }
    if (APPLY && batchCount > 0) {
      await batch.commit();
      written += batchCount;
    }

    last = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE_SIZE) break;
  }

  return { name, cfg, scanned, toFix, fixedAgency, fixedIsDeleted, written };
}

(async () => {
  console.log(
    `\n=== Backfill agency+isDeleted — mode: ${APPLY ? 'APPLY (écriture réelle)' : 'DRY-RUN (aucune écriture)'} ===`
  );
  console.log('Cibles :', JSON.stringify(TARGETS), '\n');

  const results = [];
  for (const [name, cfg] of Object.entries(TARGETS)) {
    const tag = `agency ${cfg.mode}→'${cfg.agency}'${cfg.fixIsDeleted ? ' + isDeleted(si absent)' : ''}`;
    process.stdout.write(`-> ${name} (${tag}) ... `);
    const r = await processCollection(name, cfg);
    results.push(r);
    console.log(
      `scannés=${r.scanned}  à corriger=${r.toFix} (agency=${r.fixedAgency}, isDeleted=${r.fixedIsDeleted})  ${APPLY ? `écrits=${r.written}` : '(dry-run)'}`
    );
  }

  console.log('\n--- Résumé ---');
  results.forEach((r) =>
    console.log(
      `${r.name}: ${r.toFix} doc(s) à corriger — agency:${r.fixedAgency}, isDeleted:${r.fixedIsDeleted} ${APPLY ? `→ ${r.written} écrit(s)` : '(seraient corrigés)'}`
    )
  );
  if (!APPLY) {
    console.log(
      '\nDRY-RUN terminé. Rien n’a été modifié. Relancer avec APPLY=1 après sauvegarde Firestore.'
    );
  } else {
    console.log('\nAPPLY terminé. Re-lancer en dry-run doit afficher 0 à corriger (idempotent).');
  }
  process.exit(0);
})().catch((e) => {
  console.error('ERREUR backfill:', e);
  process.exit(1);
});
