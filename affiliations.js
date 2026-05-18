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
    const snap = await getDoc(doc(db, 'client_affiliations', phone));
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
    const ref = doc(db, 'client_affiliations', key);
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
//  Lit les taux dans parametres/commissions et la fiche démarcheur, crée la
//  ou les commissions (directe + bonus parrain) et crédite le solde.
//  Idempotent : si une commission existe déjà pour (expeditionId,
//  demarcheurId), on ne recrée rien. Non bloquant pour la facture.
//  beneficeBrut attendu en CFA (cohérent avec demarcheurs.soldeDisponible).
// ============================================================================
export async function creerCommissionParrainage({ expeditionId, beneficeBrut, demarcheurId, agency, clientNom, clientPhone, description }) {
  try {
    if (!demarcheurId || !expeditionId || !(beneficeBrut > 0)) return false;

    // Anti-doublon : une seule commission directe par expédition/démarcheur.
    // (where unique sur expeditionId -> pas d'index composite requis)
    const dup = await getDocs(query(collection(db, 'commissions'), where('expeditionId', '==', expeditionId)));
    if (dup.docs.some(d => (d.data() || {}).demarcheurId === demarcheurId && (d.data() || {}).type === 'direct')) {
      return false; // déjà généré
    }

    // Taux (mêmes clés que la page Parrainage : fractions, ex. 0.5).
    let tAMT = 0.5, tDem = 0.5, tPar = 0.1, quiDefaut = 'demarcheur';
    try {
      const pSnap = await getDoc(doc(db, 'parametres', 'commissions'));
      if (pSnap.exists()) {
        const s = pSnap.data();
        if (typeof s.tauxAMT === 'number') tAMT = s.tauxAMT;
        if (typeof s.tauxDemarcheur === 'number') tDem = s.tauxDemarcheur;
        if (typeof s.tauxBonusParrainage === 'number') tPar = s.tauxBonusParrainage;
        if (s.quiPaieParrainDefaut) quiDefaut = s.quiPaieParrainDefaut;
      }
    } catch (e) { /* défauts conservés */ }

    // Fiche démarcheur (pour le parrain éventuel + qui paie le bonus).
    const demSnap = await getDoc(doc(db, 'demarcheurs', demarcheurId));
    if (!demSnap.exists()) return false;
    const dem = demSnap.data() || {};

    const pDemBrut = beneficeBrut * tDem;
    const pAMTBrut = beneficeBrut * tAMT;
    const bonus = dem.parrainId ? pDemBrut * tPar : 0;
    let pDemNet = pDemBrut, pAMTNet = pAMTBrut;
    const qui = dem.quiPaieParrain || quiDefaut;
    if (dem.parrainId && bonus > 0) {
      if (qui === 'amt') pAMTNet -= bonus; else pDemNet -= bonus;
    }

    // Infos client/envoi : purement descriptives (n'entrent dans AUCUN
    // calcul de montant) — permettent au partenaire de voir, dans l'app
    // mobile, quel client et quel envoi a généré chaque commission.
    const infoClient = {
      clientNom: clientNom || '',
      clientPhone: normalizePhone(clientPhone) || '',
      description: description || '',
    };

    const batch = writeBatch(db);
    batch.set(doc(collection(db, 'commissions')), {
      expeditionId, demarcheurId, type: 'direct',
      montantBrut: beneficeBrut, tauxDemarcheur: tDem, montantDemarcheur: pDemBrut,
      tauxAMT: tAMT, montantAMT: pAMTNet, bonusParrainage: bonus,
      quiPaieParrain: qui, montantNet: pDemNet,
      ...infoClient,
      agency: agency || (sessionStorage.getItem('currentActiveAgency') || ''),
      dateCreation: serverTimestamp(), statut: 'en_attente',
    });
    batch.update(doc(db, 'demarcheurs', demarcheurId), {
      totalGagne: increment(pDemNet), soldeDisponible: increment(pDemNet),
    });

    if (dem.parrainId && bonus > 0) {
      batch.set(doc(collection(db, 'commissions')), {
        expeditionId, demarcheurId: dem.parrainId, type: 'parrainage',
        filleulId: demarcheurId, montantBrut: beneficeBrut, bonusParrainage: bonus,
        montantNet: bonus,
        ...infoClient,
        agency: agency || (sessionStorage.getItem('currentActiveAgency') || ''),
        dateCreation: serverTimestamp(), statut: 'en_attente',
      });
      batch.update(doc(db, 'demarcheurs', dem.parrainId), {
        totalGagne: increment(bonus), soldeDisponible: increment(bonus),
      });
    }

    await batch.commit();
    return true;
  } catch (e) {
    console.warn('affiliations.creerCommissionParrainage:', e);
    return false; // non bloquant : la facture reste valide
  }
}
