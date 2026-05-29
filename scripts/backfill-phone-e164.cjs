/**
 * ============================================================================
 *  BACKFILL  expPhoneE164 / destPhoneE164  —  socle « app AMT Clients »
 * ----------------------------------------------------------------------------
 *  But : ajouter aux factures (transactions) un numéro de téléphone NORMALISÉ
 *  au format international (+33…, +225…), identique à celui que Firebase Auth
 *  fournit après une connexion par SMS. C'est ce qui permet de relier
 *  automatiquement un client à SES factures (et de sécuriser l'accès par les
 *  règles Firestore basées sur request.auth.token.phone_number).
 *
 *  Champs ajoutés (UNIQUEMENT si absents — jamais écrasés) :
 *    - expPhoneE164  : depuis `tel`   (expéditeur)    — pays = exp de la route
 *    - destPhoneE164 : depuis `numero`(destinataire)  — pays = dest de la route
 *
 *  Règle du « 0 » selon le pays :
 *    - France (FR)        : 0 RETIRÉ  -> +33 6 12 34 56 78 = +33612345678
 *    - Côte d'Ivoire (CI) : 0 CONSERVÉ (10 chiffres) -> +2250701020304
 *
 *  SÛRETÉ :
 *    - DRY-RUN par défaut : n'écrit RIEN tant que APPLY=1 n'est pas fourni.
 *    - Idempotent : 2e passage = 0 à corriger.
 *    - Ne touche aucun autre champ. Ne devine PAS l'expéditeur d'une route
 *      inconnue (exp:null -> on ne pose pas expPhoneE164).
 *
 *  PRÉREQUIS : EXPORT Firestore AVANT APPLY ; GOOGLE_APPLICATION_CREDENTIALS
 *  = JSON du compte de service (projet caisse-amt-perso).
 *
 *  USAGE :
 *    # Dry-run :
 *    GOOGLE_APPLICATION_CREDENTIALS=/chemin/sa.json node scripts/backfill-phone-e164.cjs
 *    # Application réelle :
 *    GOOGLE_APPLICATION_CREDENTIALS=/chemin/sa.json APPLY=1 node scripts/backfill-phone-e164.cjs
 *
 *  (firebase-admin est dans ./functions ; au besoin :
 *   cd functions && node ..\\scripts\\backfill-phone-e164.cjs)
 * ============================================================================
 */

'use strict';

const admin = require('firebase-admin');

const PROJECT_ID = 'caisse-amt-perso';

// Collections de factures à traiter + pays POUR L'AFFICHAGE E.164 (exp =
// départ). Le LIEN client<->factures se fait par phoneTail (9 derniers
// chiffres, insensible au pays) -> toujours écrit, aucun risque de mauvais
// indicatif. dest = null : on ne devine pas (clients SN, ML, CI, …).
const COLLECTIONS = {
  transactions:        { exp: 'FR', dest: null },
  transactions_aerien: { exp: 'FR', dest: null },
  // Routes SaaS (à activer si présentes) :
  // transactions_chine:        { exp: 'CN', dest: null },
  // transactions_chine_aerien: { exp: 'CN', dest: null },
};

const PAGE_SIZE = 500;
const WRITE_BATCH = 400;
const APPLY = process.env.APPLY === '1';

// --- Normalisation (miroir de services/phone.js) ---
function firstPhoneChunk(raw) {
  const parts = String(raw || '').split(/[\/]+/);
  for (const p of parts) { if (p.replace(/\D/g, '').length >= 8) return p; }
  return parts[0] || '';
}
function toE164Intl(raw, country) {
  if (!country) return '';
  let d = firstPhoneChunk(raw).replace(/\D/g, '').replace(/^00/, '');
  if (!d) return '';
  if (country === 'FR') {
    if (d.startsWith('33')) d = d.slice(2);
    if (d.startsWith('0')) d = d.slice(1);
    return d.length >= 9 ? '+33' + d : '';
  }
  if (country === 'CI') {
    if (d.startsWith('225')) d = d.slice(3);
    return d.length >= 8 ? '+225' + d : '';
  }
  if (country === 'CN') {
    if (d.startsWith('86')) d = d.slice(2);
    return d.length >= 10 ? '+86' + d : '';
  }
  return '';
}
function toE164Detect(raw) {
  const chunk = firstPhoneChunk(raw).trim();
  if (!/^(\+|00)/.test(chunk)) return '';
  const d = chunk.replace(/\D/g, '').replace(/^00/, '');
  return d.length >= 8 ? '+' + d : '';
}
function phoneTail(raw) {
  const d = firstPhoneChunk(raw).replace(/\D/g, '');
  if (d.length >= 9) return d.slice(-9);
  return d.length >= 8 ? d.slice(-8) : '';
}
// Clé de rapprochement par NOM (insensible casse/accents/espaces).
function nameKey(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: PROJECT_ID,
});
const db = admin.firestore();

const isMissing = (v) => v === undefined || v === null || v === '';

// Charge le fichier clients (nom -> tel) pour retrouver le numéro de
// l'EXPÉDITEUR (absent des factures, mais présent dans `clients`).
// SÛRETÉ HOMONYMES : si un même nom correspond à PLUSIEURS numéros
// différents, on l'EXCLUT (on ne devine pas) pour ne jamais attribuer un
// mauvais numéro. Renvoie { map (noms uniques -> tel), ambiguous (nb exclus) }.
async function loadClientsMap(colName) {
  const tailsByName = new Map(); // nameKey -> Set(tails distincts)
  const telByName = new Map();   // nameKey -> 1er tel rencontré
  let last = null;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let q = db.collection(colName).orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE_SIZE);
    if (last) q = q.startAfter(last);
    let snap;
    try { snap = await q.get(); }
    catch (e) { break; }
    if (snap.empty) break;
    for (const d of snap.docs) {
      const x = d.data() || {};
      const tel = x.tel || x.numero || x.telephone || x.phone || '';
      const k = nameKey(x.nom);
      const tail = phoneTail(tel);
      if (!k || !tail) continue;
      if (!tailsByName.has(k)) { tailsByName.set(k, new Set()); telByName.set(k, tel); }
      tailsByName.get(k).add(tail);
    }
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE_SIZE) break;
  }
  const map = new Map();
  let ambiguous = 0;
  for (const [k, set] of tailsByName) {
    if (set.size === 1) map.set(k, telByName.get(k)); // nom unique -> sûr
    else ambiguous++;                                  // homonymes -> on s'abstient
  }
  return { map, ambiguous };
}

function buildUpdate(data, cfg, clientsMap) {
  const upd = {};
  // Numéro expéditeur : sur la facture (`tel`) sinon via le fichier clients
  // (rapprochement par le nom de l'expéditeur).
  let expRaw = data.tel;
  if (isMissing(phoneTail(expRaw)) && clientsMap && data.nom) {
    const fromClient = clientsMap.get(nameKey(data.nom));
    if (fromClient) expRaw = fromClient;
  }
  // Tails (clé de liaison) : toujours, dès qu'absents et calculables.
  if (isMissing(data.expPhoneTail)) { const t = phoneTail(expRaw); if (t) upd.expPhoneTail = t; }
  if (isMissing(data.destPhoneTail)) { const t = phoneTail(data.numero); if (t) upd.destPhoneTail = t; }
  // E.164 (affichage) : exp via pays de route ou détection ; dest détection seule.
  if (isMissing(data.expPhoneE164)) {
    const v = cfg.exp ? toE164Intl(expRaw, cfg.exp) : toE164Detect(expRaw);
    if (v) upd.expPhoneE164 = v;
  }
  if (isMissing(data.destPhoneE164)) {
    const v = cfg.dest ? toE164Intl(data.numero, cfg.dest) : toE164Detect(data.numero);
    if (v) upd.destPhoneE164 = v;
  }
  return upd;
}

async function processCollection(name, cfg, clientsMap) {
  const col = db.collection(name);
  let last = null, scanned = 0, toFix = 0, exp = 0, dest = 0, written = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let q = col.orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE_SIZE);
    if (last) q = q.startAfter(last);
    let snap;
    try { snap = await q.get(); }
    catch (e) { console.log(`   (collection ${name} introuvable ou vide : ${e.code || e.message})`); break; }
    if (snap.empty) break;

    let batch = db.batch(), batchCount = 0;
    for (const doc of snap.docs) {
      scanned++;
      const upd = buildUpdate(doc.data(), cfg, clientsMap);
      if (Object.keys(upd).length) {
        toFix++;
        if ('expPhoneTail' in upd) exp++;
        if ('destPhoneTail' in upd) dest++;
        if (APPLY) {
          batch.update(doc.ref, upd);
          if (++batchCount >= WRITE_BATCH) { await batch.commit(); written += batchCount; batch = db.batch(); batchCount = 0; }
        }
      }
    }
    if (APPLY && batchCount > 0) { await batch.commit(); written += batchCount; }
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE_SIZE) break;
  }
  return { name, scanned, toFix, exp, dest, written };
}

(async () => {
  console.log(`\n=== Backfill téléphone E.164 — mode: ${APPLY ? 'APPLY (écriture réelle)' : 'DRY-RUN (aucune écriture)'} ===`);
  console.log('Collections :', JSON.stringify(COLLECTIONS), '\n');
  // Fichier clients (pour retrouver les numéros d'expéditeurs).
  process.stdout.write('Chargement du fichier clients ... ');
  const { map: clientsMap, ambiguous } = await loadClientsMap('clients');
  console.log(`${clientsMap.size} noms UNIQUES (nom->tel) ; ${ambiguous} noms homonymes EXCLUS (sécurité).\n`);
  for (const [name, cfg] of Object.entries(COLLECTIONS)) {
    process.stdout.write(`-> ${name} (exp=${cfg.exp || '—'}, dest=${cfg.dest || '—'}) ... `);
    const r = await processCollection(name, cfg, clientsMap);
    console.log(`scannés=${r.scanned}  à corriger=${r.toFix} (tails exp=${r.exp}, dest=${r.dest})  ${APPLY ? `écrits=${r.written}` : '(dry-run)'}`);
  }
  console.log(`\n${APPLY ? '✅ Terminé (écriture réelle).' : 'ℹ️  DRY-RUN : relancez avec APPLY=1 pour écrire.'}\n`);
  process.exit(0);
})().catch((e) => { console.error('Erreur backfill :', e); process.exit(1); });
