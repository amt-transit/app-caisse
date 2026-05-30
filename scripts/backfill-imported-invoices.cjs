/**
 * ============================================================================
 *  BACKFILL  factures IMPORTÉES  —  app AMT Clients (Chemin B)
 * ----------------------------------------------------------------------------
 *  CONTEXTE
 *  --------
 *  Paris n'utilise pas encore le site : les factures sont IMPORTÉES (Excel/CSV)
 *  dans la fenêtre « Paris » de la page Livraison d'Abidjan. Cet import crée de
 *  VRAIES factures (collection `transactions`), mais INCOMPLÈTES :
 *    - PAS de téléphone caché (`expPhoneTail` / `destPhoneTail`) → l'app AMT
 *      Clients ne peut PAS relier ces factures au client. Elles sont invisibles.
 *    - L'expéditeur n'est PAS enregistré : l'import met le DESTINATAIRE dans le
 *      champ `nom` (et `nomDestinataire`), et laisse `tel` vide. Voir
 *      abidjan/js/views/livraison.js (confirmImport ~ ligne 1959-1980).
 *    - L'EXPÉDITEUR réel, lui, EST présent sur la LIVRAISON jumelle (même `ref`).
 *
 *  CE QUE FAIT CE SCRIPT (jamais d'écrasement, jamais l'argent)
 *  -----------------------------------------------------------
 *  Pour chaque facture « style import » (jointe à sa livraison par la référence) :
 *    1. DESTINATAIRE  : pose `destPhoneTail` (+ `destPhoneE164` si international)
 *       depuis `numero`, sinon depuis le n° collé dans `nomDestinataire`.
 *    2. EXPÉDITEUR    : restaure `nom` = expéditeur (depuis la livraison), et
 *       retrouve son `tel` via le fichier `clients` (par le nom, anti-homonyme),
 *       puis pose `expPhoneTail` (+ `expPhoneE164`).
 *    3. DESCRIPTION   : complète `description` depuis la livraison si vide.
 *
 *  SÛRETÉ
 *  ------
 *    - DRY-RUN par défaut : n'écrit RIEN tant que APPLY=1 n'est pas fourni.
 *    - N'écrit un champ que s'il est ABSENT/vide (idempotent : 2e passage = 0).
 *    - Ne RESTAURE `nom` que si la facture porte la SIGNATURE d'un import
 *      (nom == destinataire) ET que la livraison a un expéditeur DIFFÉRENT.
 *      → les factures normales (nom = expéditeur) ne sont JAMAIS modifiées.
 *    - Ne touche AUCUN champ d'argent (prix, montantParis/Abidjan, reste,
 *      paymentHistory). Le suivi des paiements (caisse Abidjan) reste intact.
 *    - Le LIEN client<->facture se fait par phoneTail (9 derniers chiffres,
 *      insensible au pays) → toujours posé, aucun risque de mauvais indicatif.
 *      L'E.164 (affichage) n'est posé que s'il est sûr (préfixe international).
 *
 *  PRÉREQUIS : EXPORT Firestore AVANT APPLY (sécurité) ;
 *              GOOGLE_APPLICATION_CREDENTIALS = JSON du compte de service.
 *              (firebase-admin est dans ./functions)
 *
 *  USAGE (depuis le dossier functions/ pour trouver firebase-admin) :
 *    cd functions
 *    # Essai à blanc (rien n'est écrit) :
 *    set GOOGLE_APPLICATION_CREDENTIALS=C:\Users\JEANAFFA\Desktop\sa-amt.json
 *    node ..\scripts\backfill-imported-invoices.cjs
 *    # Application réelle :
 *    set APPLY=1
 *    node ..\scripts\backfill-imported-invoices.cjs
 *
 *  Option : SAMPLES=20 pour afficher plus d'exemples en dry-run (défaut 12).
 * ============================================================================
 */

'use strict';

const admin = require('firebase-admin');

const PROJECT_ID = 'caisse-amt-perso';

// Paires facture -> livraison à traiter. (transactions <-> livraisons,
// transactions_aerien <-> livraisons_aerien). exp = pays POUR L'AFFICHAGE E.164
// uniquement ; le lien réel passe par phoneTail. On NE devine PAS le pays du
// destinataire (clients CI, SN, ML…) : E.164 dest par détection seule.
const PAIRS = [
  // `livCols` : livraisons actives + ARCHIVES (les colis livrés sont archivés,
  // mais leur facture demeure → il faut les archives pour retrouver l'expéditeur).
  { trans: 'transactions',        livCols: ['livraisons', 'livraisons_archives'], expCountry: 'FR' },
  { trans: 'transactions_aerien', livCols: ['livraisons_aerien', 'livraisons_aerien_archives'], expCountry: 'FR' },
  // Routes SaaS (à activer si présentes) :
  // { trans: 'transactions_chine', livCols: ['livraisons_chine', 'livraisons_chine_archives'], expCountry: 'CN' },
];

const PAGE_SIZE = 500;
const WRITE_BATCH = 400;
const APPLY = process.env.APPLY === '1';
const SAMPLES = parseInt(process.env.SAMPLES || '12', 10);

// --- Normalisation téléphone (miroir EXACT de services/phone.js) ---
const CI_PHONE_REGEX = /(?:(?:\+|00)225[\s.-]?)?(?:01|05|07|0)\d(?:[\s.-]?\d{2}){4}|(?:(?:\+|00)225[\s.-]?)?(?:01|05|07|0)\d{8,}/;
function extractPhone(str) {
  const m = String(str || '').match(CI_PHONE_REGEX);
  return m ? m[0] : '';
}
function stripPhoneFromName(str) {
  const s = String(str || '');
  const m = s.match(CI_PHONE_REGEX);
  if (!m) return s.trim();
  return s.replace(m[0], '').replace(/[-–,;:/\s]+$/, '').trim();
}
function firstPhoneChunk(raw) {
  const parts = String(raw || '').split(/[/]+/);
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
// E.164 « sûr » : pays si fourni, sinon détection ; rejette les résultats
// aberrants (> 13 chiffres) issus de faux numéros (ex. placeholder AMT).
function e164For(raw, country) {
  const e = country ? toE164Intl(raw, country) : toE164Detect(raw);
  if (!e) return '';
  return e.replace(/\D/g, '').length <= 13 ? e : '';
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

const isMissing = (v) => v === undefined || v === null || String(v).trim() === '';

// Fichier clients (nom -> tel) pour retrouver le numéro de l'EXPÉDITEUR.
// Anti-homonyme : un nom rattaché à PLUSIEURS numéros distincts est EXCLU.
async function loadClientsMap() {
  const telsByName = new Map(); // nameKey -> Set(tails)
  const rawByName = new Map();  // nameKey -> 1er tel brut
  let last = null;
  while (true) {
    let q = db.collection('clients').orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE_SIZE);
    if (last) q = q.startAfter(last);
    let snap;
    try { snap = await q.get(); } catch (e) { break; }
    if (snap.empty) break;
    for (const d of snap.docs) {
      const x = d.data() || {};
      const tel = x.tel || x.numero || x.telephone || x.phone || '';
      const k = nameKey(x.nom);
      const tail = phoneTail(tel);
      if (!k || !tail) continue;
      if (!telsByName.has(k)) { telsByName.set(k, new Set()); rawByName.set(k, tel); }
      telsByName.get(k).add(tail);
    }
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE_SIZE) break;
  }
  const map = new Map();
  let ambiguous = 0;
  for (const [k, set] of telsByName) {
    if (set.size === 1) map.set(k, rawByName.get(k));
    else ambiguous++;
  }
  return { map, ambiguous };
}

// Livraisons d'une route : ref (MAJ) -> { expediteur, destinataire, numero, description }.
// On garde la 1re occurrence non vide par référence. Fusionne dans `byRef`
// (permet de cumuler livraisons actives + archives).
async function loadLivraisonsMap(colName, byRef = new Map()) {
  let last = null;
  while (true) {
    let q = db.collection(colName).orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE_SIZE);
    if (last) q = q.startAfter(last);
    let snap;
    try { snap = await q.get(); }
    catch (e) { return byRef; }
    if (snap.empty) break;
    for (const d of snap.docs) {
      const x = d.data() || {};
      const ref = String(x.ref || '').toUpperCase().trim();
      if (!ref) continue;
      const cur = byRef.get(ref) || { expediteur: '', destinataire: '', numero: '', description: '' };
      if (isMissing(cur.expediteur) && !isMissing(x.expediteur)) cur.expediteur = x.expediteur;
      if (isMissing(cur.destinataire) && !isMissing(x.destinataire)) cur.destinataire = x.destinataire;
      if (isMissing(cur.numero) && !isMissing(x.numero)) cur.numero = x.numero;
      if (isMissing(cur.description) && !isMissing(x.description)) cur.description = x.description;
      byRef.set(ref, cur);
    }
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE_SIZE) break;
  }
  return byRef;
}

// Calcule les champs à écrire pour UNE facture. Renvoie { upd, flags }.
function buildUpdate(t, liv, clientsMap, expCountry) {
  const upd = {};
  const flags = { restoreNom: false, expTail: false, destTail: false, tel: false, desc: false };

  const ref = String(t.reference || '').toUpperCase().trim();
  const nomKey = nameKey(t.nom);
  const destKey = nameKey(t.nomDestinataire);

  // ---- 1. DESTINATAIRE : tail + E.164 (détection seule) ----
  // Source du n° : champ `numero`, sinon n° collé dans le nom du destinataire.
  const destRaw = !isMissing(t.numero) ? t.numero
    : (extractPhone(t.nomDestinataire) || (liv ? (liv.numero || extractPhone(liv.destinataire)) : ''));
  if (isMissing(t.destPhoneTail)) { const tail = phoneTail(destRaw); if (tail) { upd.destPhoneTail = tail; flags.destTail = true; } }
  if (isMissing(t.destPhoneE164)) { const e = toE164Detect(destRaw); if (e) upd.destPhoneE164 = e; }
  // Pose `numero` s'il était vide mais récupérable (utile à l'affichage arrivée).
  if (isMissing(t.numero) && !isMissing(destRaw)) upd.numero = String(destRaw).trim();

  // ---- 2. EXPÉDITEUR : restauration depuis la livraison + fichier clients ----
  // SIGNATURE d'un import : `nom` vide OU `nom` == destinataire (l'import a mis
  // le destinataire à la place de l'expéditeur). L'import n'écrit JAMAIS `tel`
  // ni les tails expéditeur ; donc sur une facture importée, toute valeur
  // expéditeur déjà présente vient d'un ancien backfill FAUSSÉ (calculé sur le
  // nom du destinataire). → Pour une facture importée dont on connaît le vrai
  // expéditeur (livraison), on RECALCULE et on CORRIGE ces champs.
  const expFromLiv = liv ? stripPhoneFromName(liv.expediteur) : '';
  const expKey = nameKey(expFromLiv);
  const looksImported = isMissing(t.nom) || (destKey && nomKey === destKey);
  const expIsReal = expKey && expKey !== destKey;

  if (looksImported && expIsReal) {
    // Cas IMPORT : l'expéditeur réel = celui de la livraison (source de vérité).
    // L'import n'a JAMAIS écrit tel/expPhoneTail/expPhoneE164 → toute valeur
    // présente vient d'un ancien backfill fautif. On la RECALCULE donc toujours
    // (correction), en gardant un `tel` éventuellement saisi à la main.
    if (isMissing(t.nom) || nomKey === destKey) { upd.nom = expFromLiv; flags.restoreNom = true; }
    const expRaw = clientsMap.get(expKey) || '';   // n° expéditeur via fichier clients (Paris)
    if (!isMissing(expRaw)) {
      if (isMissing(t.tel)) { upd.tel = String(expRaw).trim(); flags.tel = true; }
      const tail = phoneTail(expRaw);
      if (tail && t.expPhoneTail !== tail) { upd.expPhoneTail = tail; flags.expTail = true; }
      const e = e164For(expRaw, expCountry);
      if (e && t.expPhoneE164 !== e) upd.expPhoneE164 = e;
    }
  } else {
    // Cas NORMAL : on complète seulement les tails expéditeur manquants depuis `tel`.
    const expRaw = t.tel;
    if (isMissing(t.expPhoneTail)) { const tail = phoneTail(expRaw); if (tail) { upd.expPhoneTail = tail; flags.expTail = true; } }
    if (isMissing(t.expPhoneE164)) { const e = e164For(expRaw, expCountry); if (e) upd.expPhoneE164 = e; }
  }

  // ---- 3. DESCRIPTION : complète depuis la livraison si vide ----
  if (isMissing(t.description) && liv && !isMissing(liv.description)) { upd.description = liv.description; flags.desc = true; }

  return { upd, flags, ref };
}

async function processPair(pair, clientsMap) {
  let livMap = new Map();
  for (const livCol of pair.livCols) livMap = await loadLivraisonsMap(livCol, livMap);
  const col = db.collection(pair.trans);
  let last = null;
  const stat = { scanned: 0, toFix: 0, restoreNom: 0, expTail: 0, destTail: 0, tel: 0, desc: 0, written: 0, noLiv: 0 };
  const samples = [];

  while (true) {
    let q = col.orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE_SIZE);
    if (last) q = q.startAfter(last);
    let snap;
    try { snap = await q.get(); }
    catch (e) { console.log(`   (collection ${pair.trans} introuvable/vide : ${e.code || e.message})`); break; }
    if (snap.empty) break;

    let batch = db.batch(), batchCount = 0;
    for (const docSnap of snap.docs) {
      stat.scanned++;
      const t = docSnap.data() || {};
      if (t.isDeleted) continue;
      const ref = String(t.reference || '').toUpperCase().trim();
      const liv = ref ? livMap.get(ref) : null;
      const { upd, flags } = buildUpdate(t, liv, clientsMap, pair.expCountry);
      if (!Object.keys(upd).length) continue;

      stat.toFix++;
      if (flags.restoreNom) stat.restoreNom++;
      if (flags.expTail) stat.expTail++;
      if (flags.destTail) stat.destTail++;
      if (flags.tel) stat.tel++;
      if (flags.desc) stat.desc++;
      if (!liv) stat.noLiv++;

      if (samples.length < SAMPLES) {
        samples.push({ ref: t.reference || '(sans réf)', avant: { nom: t.nom, tel: t.tel || '—', numero: t.numero || '—' }, apres: upd });
      }

      if (APPLY) {
        batch.update(docSnap.ref, upd);
        if (++batchCount >= WRITE_BATCH) { await batch.commit(); stat.written += batchCount; batch = db.batch(); batchCount = 0; }
      }
    }
    if (APPLY && batchCount > 0) { await batch.commit(); stat.written += batchCount; }
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE_SIZE) break;
  }
  return { stat, samples, livCount: livMap.size };
}

(async () => {
  console.log(`\n=== Backfill factures IMPORTÉES — mode: ${APPLY ? 'APPLY (écriture réelle)' : 'DRY-RUN (aucune écriture)'} ===\n`);
  process.stdout.write('Chargement du fichier clients (noms -> tél) ... ');
  const { map: clientsMap, ambiguous } = await loadClientsMap();
  console.log(`${clientsMap.size} noms UNIQUES ; ${ambiguous} homonymes EXCLUS (sécurité).\n`);

  for (const pair of PAIRS) {
    process.stdout.write(`-> ${pair.trans}  (livraisons: ${pair.livCols.join(' + ')}) ... `);
    const { stat, samples, livCount } = await processPair(pair, clientsMap);
    console.log(`${livCount} livraisons indexées.`);
    console.log(`   scannées=${stat.scanned}  à compléter=${stat.toFix}`);
    console.log(`     • nom expéditeur restauré : ${stat.restoreNom}`);
    console.log(`     • tél expéditeur retrouvé : ${stat.tel}`);
    console.log(`     • tail expéditeur posé    : ${stat.expTail}`);
    console.log(`     • tail destinataire posé  : ${stat.destTail}`);
    console.log(`     • description complétée    : ${stat.desc}`);
    if (stat.noLiv) console.log(`     • (dont ${stat.noLiv} sans livraison jumelle trouvée)`);
    console.log(`   ${APPLY ? `✅ écrites=${stat.written}` : '(dry-run : rien écrit)'}`);

    if (!APPLY && samples.length) {
      console.log(`\n   ── Exemples (${samples.length}) de ce qui serait écrit ──`);
      for (const s of samples) {
        console.log(`   • ${s.ref}`);
        console.log(`       avant : nom="${s.avant.nom}"  tel="${s.avant.tel}"  numero="${s.avant.numero}"`);
        console.log(`       après : ${JSON.stringify(s.apres)}`);
      }
    }
    console.log('');
  }
  console.log(`${APPLY ? '✅ Terminé (écriture réelle).' : 'ℹ️  DRY-RUN terminé. Vérifiez les exemples, puis relancez avec APPLY=1 pour écrire.'}\n`);
  process.exit(0);
})().catch((e) => { console.error('Erreur backfill :', e); process.exit(1); });
