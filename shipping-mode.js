// ============================================================================
//  MODE D'EXPÉDITION (Maritime / Aérien) — source unique de vérité.
// ----------------------------------------------------------------------------
//  Le mode actif est piloté par le bouton 🚢/✈️ (sessionStorage 'shippingMode',
//  posé par auth-guard.js). Maritime = défaut. Toute donnée colis/facture
//  porte `modeExpedition` ('maritime'|'aerien') depuis Nouvelle Facture.
//
//  RÈGLE LEGACY (unique, ici) : un document SANS `modeExpedition` est
//  considéré MARITIME (toutes les données historiques le sont). Ainsi
//  l'historique reste visible en mode Maritime et n'apparaît jamais en
//  Aérien. Maritime et Aérien sont totalement dissociés (listes + compta).
// ============================================================================

export function getShippingMode() {
  return sessionStorage.getItem('shippingMode') || 'maritime';
}

export function isAerienMode() {
  return getShippingMode() === 'aerien';
}

// true si le document correspond au mode d'expédition ACTIF.
export function matchesShippingMode(docData) {
  const m = (docData && docData.modeExpedition) === 'aerien' ? 'aerien' : 'maritime';
  return m === getShippingMode();
}

// Filtre un tableau de documents selon le mode actif (legacy = maritime).
export function filterByShippingMode(arr) {
  if (!Array.isArray(arr)) return arr;
  const aerien = isAerienMode();
  return arr.filter((d) => ((d && d.modeExpedition) === 'aerien') === aerien);
}
