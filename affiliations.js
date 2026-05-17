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
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

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
