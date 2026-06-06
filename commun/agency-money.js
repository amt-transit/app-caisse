// ============================================================================
//  ARGENT PAR AGENCE — route-aware (source unique).
// ----------------------------------------------------------------------------
//  Une transaction porte 2 montants encaissés :
//    - montantParis   = encaissé côté DÉPART  (Paris, Chine, Dakar, ...)
//    - montantAbidjan = encaissé côté ARRIVÉE (Abidjan, abidjan_chine, ...)
//
//  L'ANCIEN code liait le choix du champ à « agence === 'paris' », ce qui
//  cassait toute route SaaS (ex. Chine : agence de départ = 'chine' ≠ 'paris'
//  -> il lisait montantAbidjan = 0 -> Bilan/Stats vides).
//
//  Ici la sélection du champ dépend du TYPE d'agence (config), PAS du nom :
//    - agence de DÉPART  -> montantParis
//    - agence d'ARRIVÉE  -> montantAbidjan
//
//  La DEVISE reste gérée séparément (€ uniquement pour Paris, sinon CFA) :
//  ne change pas la logique TAUX existante de chaque écran.
// ============================================================================

import { AGENCIES } from './agencies-config.js';

export function activeAgencyId() {
  return sessionStorage.getItem('currentActiveAgency') || 'paris';
}

// 'all' / super_admin = vue globale : on agrège côté arrivée (encaissement
// final). Sinon, type d'agence depuis la config.
export function isArrivalAgency(id = activeAgencyId()) {
  return id === 'all' || (AGENCIES[id] && AGENCIES[id].type === 'arrival');
}

// Champ "argent encaissé" pertinent pour l'agence active.
export function paidField(id = activeAgencyId()) {
  return isArrivalAgency(id) ? 'montantAbidjan' : 'montantParis';
}

// Montant encaissé pertinent d'une transaction (route-aware), en CFA brut
// (la conversion d'affichage €/CFA reste gérée par TAUX dans chaque écran).
export function paidAmount(t, id = activeAgencyId()) {
  if (!t) return 0;
  return parseFloat(t[paidField(id)]) || 0;
}

// Devise d'affichage : € seulement pour Paris (seule zone EUR).
export function isEurAgency(id = activeAgencyId()) {
  return id === 'paris';
}
