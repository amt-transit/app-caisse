// ============================================================================
//  AFFILIATION CLIENT ↔ DÉMARCHEUR  (persistante, clé = téléphone destinataire)
// ----------------------------------------------------------------------------
//  Le "client" d'un parrain est le DESTINATAIRE (celui qui reçoit). Une fois
//  un téléphone destinataire affilié à un démarcheur, ça ne change plus
//  (premier rattachement gagnant) : toutes ses futures expéditions comptent
//  pour ce parrain.
//
//  Collection : client_affiliations/{telephoneNormalise}
//    { phone, clientName, demarcheurId, demarcheurName, agency, createdBy, createdAt }
//
//  NB : ce module ne génère AUCUNE commission (creerCommissionParrainage reste
//  dormant) — il ne fait qu'établir/lire le lien. Non bloquant pour la facture.
// ============================================================================

import { db } from './firebase-config.js';
import { doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs, writeBatch, increment } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getCollectionName } from './agencies-config.js';

// Normalise un numéro en clé stable. Gère les formats courants CI / international.
// Retourne null si le numéro est inexploitable (trop court) -> pas d'affiliation.
export function normalizePhone(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  // ne garder que les chiffres (on ignore +, espaces, points, tirets, parenthèses)
  s = s.replace(/\D/g, '');
  // 00225XXXX -> 225XXXX
  if (s.startsWith('00')) s = s.slice(2);
  // indicatif Côte d'Ivoire en tête d'un numéro long -> on retire 225
  if (s.length > 10 && s.startsWith('225')) s = s.slice(3);
  if (s.length < 8) return null; // numéro inexploitable
  return s;
}

// Lit l'affiliation existante pour ce téléphone (ou null).
export async function getAffiliation(phoneRaw) {
  const phone = normalizePhone(phoneRaw);
  if (!phone) return null;
  try {
    const snap = await getDoc(doc(db, getCollectionName('client_affiliations'), phone));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (e) {
    console.warn('affiliations.getAffiliation:', e);
    return null;
  }
}

// Crée l'affiliation SI elle n'existe pas encore (persistante, 1er gagnant).
// Si elle existe déjà, renvoie l'existante sans l'écraser.
export async function ensureAffiliation({ phone, clientName, demarcheurId, demarcheurName, agency, createdBy }) {
  const key = normalizePhone(phone);
  if (!key || !demarcheurId) return null;
  try {
    const ref = doc(db, getCollectionName('client_affiliations'), key);
    const snap = await getDoc(ref);
    if (snap.exists()) return { id: snap.id, ...snap.data() };
    const data = {
      phone: key,
      clientName: clientName || '',
      demarcheurId,
      demarcheurName: demarcheurName || '',
      agency: agency || (sessionStorage.getItem('currentActiveAgency') || ''),
      createdBy: createdBy || '',
      createdAt: serverTimestamp(),
    };
    await setDoc(ref, data);
    return { id: key, ...data };
  } catch (e) {
    console.warn('affiliations.ensureAffiliation:', e);
    return null; // non bloquant : la facture continue
  }
}

// ============================================================================
//  GÉNÉRATION DE COMMISSION (autonome — ne dépend PAS de la page Parrainage).
//  Règle métier (mai 2026) :
//
//     Bénéfice = Montant facturé − Charges fixes   (TOUJOURS)
//         où Charges = (chargesFixesCbm × volumeCbm)    en MARITIME
//                  ou (chargesFixesKgAerien × poidsKg) en AÉRIEN
//         (les charges fixes sont configurées par ROUTE de départ, sur
//          la page Réseau Partenaires → Settings)
//
//     Cas A — Démarcheur PARRAIN seul (pas de filleul au-dessus de lui)
//         Démarcheur : 50 % du bénéfice
//         AMT        : 50 % du bénéfice
//
//     Cas B — Démarcheur FILLEUL (a un parrainId au-dessus)
//         Filleul    : 50 % du bénéfice
//         Parrain    : 10 % du bénéfice (versé par AMT)
//         AMT        : 40 % du bénéfice
//
//  Principe : on ne partage JAMAIS le chiffre d'affaires brut — on partage
//  toujours le bénéfice (montant facturé − charges opérationnelles fixes).
//
//  Si bénéfice ≤ 0 (charges supérieures au montant) : aucune commission.
//  Idempotent : une seule commission directe par (expeditionId, demarcheurId).
//  Non bloquant : la facture reste valide même en cas d'erreur ici.
//  Tous les montants sont en CFA (cohérent avec demarcheurs.soldeDisponible).
// ============================================================================
export async function creerCommissionParrainage({
  expeditionId, demarcheurId, agency,
  montantFacture, volumeCbm = 0, poidsKg = 0, shippingMode = 'maritime',
  // beneficeBrut : alias rétrocompatible (ancien appelant). Si fourni et que
  // montantFacture est absent, on l'utilise comme montant facturé.
  beneficeBrut,
  clientNom, clientPhone, description
}) {
  try {
    const montant = Number(montantFacture != null ? montantFacture : beneficeBrut) || 0;
    if (!demarcheurId || !expeditionId || !(montant > 0)) return false;

    // Anti-doublon : une seule commission directe par expédition/démarcheur.
    const dup = await getDocs(query(collection(db, getCollectionName('commissions')), where('expeditionId', '==', expeditionId)));
    if (dup.docs.some(d => (d.data() || {}).demarcheurId === demarcheurId && (d.data() || {}).type === 'direct')) {
      return false; // déjà généré
    }

    // Taux (lus dans parametres/commissions, défauts métier officiels).
    //   tDem = part du démarcheur sur le bénéfice (50 %)
    //   tPar = bonus parrain sur le bénéfice (10 %)
    //   AMT  = reste (= 50 % seul, ou 40 % si filleul)
    let tDem = 0.5, tPar = 0.1;
    try {
      const pSnap = await getDoc(doc(db, 'parametres', 'commissions'));
      if (pSnap.exists()) {
        const s = pSnap.data();
        if (typeof s.tauxDemarcheur === 'number') tDem = s.tauxDemarcheur;
        if (typeof s.tauxBonusParrainage === 'number') tPar = s.tauxBonusParrainage;
      }
    } catch (e) { /* défauts conservés */ }

    const agencyId = agency || (sessionStorage.getItem('currentActiveAgency') || '');
    const mode = String(shippingMode || 'maritime').toLowerCase();

    // Fiche démarcheur (pour savoir s'il a un parrain au-dessus).
    const demSnap = await getDoc(doc(db, getCollectionName('demarcheurs'), demarcheurId));
    if (!demSnap.exists()) return false;
    const dem = demSnap.data() || {};

    // Charges fixes : TOUJOURS appliquées (Parrain seul OU Filleul). On ne
    // partage jamais le chiffre d'affaires brut — uniquement le bénéfice.
    let chargesParCbm = 0, chargesParKg = 0;
    try {
      const aSnap = await getDoc(doc(db, 'agencies_config', agencyId));
      if (aSnap.exists()) {
        const a = aSnap.data();
        chargesParCbm = Number(a.chargesFixesCbm) || 0;
        chargesParKg = Number(a.chargesFixesKgAerien) || 0;
      }
    } catch (e) { /* hors-ligne ou doc absent : charges 0 */ }
    const charges = (mode === 'aerien' || mode === 'aérien')
      ? chargesParKg * (Number(poidsKg) || 0)
      : chargesParCbm * (Number(volumeCbm) || 0);
    const benefice = Math.max(0, montant - charges);
    if (benefice <= 0) return false; // pas de marge -> pas de commission

    // Répartition (AMT paie toujours le bonus parrain).
    const pDem = benefice * tDem;
    const bonus = dem.parrainId ? benefice * tPar : 0;
    const pAMT = benefice - pDem - bonus; // 50 % (seul) ou 40 % (avec parrain)

    // Infos descriptives (n'entrent dans aucun calcul, visibles dans le mobile).
    const infoClient = {
      clientNom: clientNom || '',
      clientPhone: normalizePhone(clientPhone) || '',
      description: description || '',
    };

    const batch = writeBatch(db);
    batch.set(doc(collection(db, getCollectionName('commissions'))), {
      expeditionId, demarcheurId, type: 'direct',
      // Économie de l'expédition (traçabilité complète) :
      montantFacture: montant,
      chargesFixes: charges,
      beneficeNet: benefice,
      volumeCbm: Number(volumeCbm) || 0,
      poidsKg: Number(poidsKg) || 0,
      shippingMode: mode,
      // Répartition :
      tauxDemarcheur: tDem,
      montantDemarcheur: pDem,
      bonusParrainage: bonus,
      montantAMT: pAMT,
      montantNet: pDem,
      // Champs hérités (pour les écrans / Cloud Functions existants) :
      montantBrut: benefice,
      // Solde : 100 % en POTENTIEL à la création. reconcile recalcule au prorata
      // dès qu'un paiement est enregistré sur la facture.
      montantDisponible: 0, montantPotentiel: pDem, partPayee: 0,
      etatSolde: 'en_attente',
      ...infoClient,
      agency: agencyId,
      dateCreation: serverTimestamp(), statut: 'en_attente',
    });
    batch.update(doc(db, getCollectionName('demarcheurs'), demarcheurId), {
      totalGagne: increment(pDem), soldePotentiel: increment(pDem),
    });

    if (dem.parrainId && bonus > 0) {
      batch.set(doc(collection(db, getCollectionName('commissions'))), {
        expeditionId, demarcheurId: dem.parrainId, type: 'parrainage',
        filleulId: demarcheurId,
        montantFacture: montant, chargesFixes: charges, beneficeNet: benefice,
        bonusParrainage: bonus, montantNet: bonus,
        montantBrut: benefice,
        montantDisponible: 0, montantPotentiel: bonus, partPayee: 0,
        etatSolde: 'en_attente',
        ...infoClient,
        agency: agencyId,
        dateCreation: serverTimestamp(), statut: 'en_attente',
      });
      batch.update(doc(db, getCollectionName('demarcheurs'), dem.parrainId), {
        totalGagne: increment(bonus), soldePotentiel: increment(bonus),
      });
    }

    await batch.commit();
    return true;
  } catch (e) {
    console.warn('affiliations.creerCommissionParrainage:', e);
    return false; // non bloquant : la facture reste valide
  }
}
