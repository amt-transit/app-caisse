// ============================================================================
//  AFFILIATION / PARRAINAGE — Flag d'activation PAR AGENCE (source unique)
// ----------------------------------------------------------------------------
//  Remplace le hardcode `['chine','abidjan_chine']` éparpillé dans le code.
//  Le programme de parrainage (module parrainage.js + sélecteur "Parrain" de
//  Nouvelle Facture) est actif pour une agence ssi ce flag est vrai.
//
//  Stockage : settings/menus_<agency>.features.affiliation  (true|false)
//  — réutilise le doc déjà lu par app.js, éditable via "Rôles & Menus".
//
//  DÉFAUT SÛR : si le flag n'est pas configuré pour l'agence, on retombe sur
//  le comportement HISTORIQUE (actif uniquement pour chine / abidjan_chine).
//  => aucun changement de comportement tant que personne ne touche au flag.
//
//  Même pattern que routes-config.js / agencies-config.js : cache localStorage
//  instantané + rafraîchissement Firestore non bloquant.
// ============================================================================

import { db } from './firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

const CACHE_KEY = 'amt_affiliation_flags';
const LEGACY_ACTIVE_AGENCIES = ['chine', 'abidjan_chine'];

const activeAgency = () => sessionStorage.getItem('currentActiveAgency') || 'abidjan';

// { "<agency>": true|false } — uniquement les agences explicitement configurées
let FLAGS = {};
try {
  const raw = localStorage.getItem(CACHE_KEY);
  if (raw) FLAGS = JSON.parse(raw) || {};
} catch (e) {
  /* cache illisible */
}

function legacyDefault(agencyId) {
  return LEGACY_ACTIVE_AGENCIES.includes(agencyId);
}

// Vrai si le parrainage est actif pour l'agence (param explicite ou défaut sûr).
export function isAffiliationActive(agencyId) {
  const ag = agencyId || activeAgency();
  if (Object.prototype.hasOwnProperty.call(FLAGS, ag)) return !!FLAGS[ag];
  return legacyDefault(ag);
}

// Rafraîchit le flag de l'agence depuis Firestore (non bloquant).
// Signaux d'activation considérés (par ordre de priorité) :
//   1. features.affiliation explicite (true/false)
//   2. la section "Spécial Asie" est dans visibleMenus (= l'admin a coché
//      la section dans Rôles & Menus -> on active automatiquement le module)
//   3. fallback historique : agences chine / abidjan_chine
export async function refreshAffiliationFlag(agencyId) {
  const ag = agencyId || activeAgency();
  try {
    const snap = await getDoc(doc(db, 'settings', `menus_${ag}`));
    if (snap.exists()) {
      const data = snap.data() || {};
      const f = data.features;
      const vm = Array.isArray(data.visibleMenus) ? data.visibleMenus : [];
      if (f && typeof f.affiliation === 'boolean') {
        FLAGS[ag] = f.affiliation; // flag explicite -> il fait foi
      } else if (vm.includes('special-asie') || vm.includes('parrainage')) {
        FLAGS[ag] = true; // section cochée dans Rôles & Menus -> on active
      } else {
        delete FLAGS[ag]; // pas configuré -> on laissera le défaut légataire
      }
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(FLAGS));
      } catch (e) {
        /* quota / non critique */
      }
    }
  } catch (e) {
    console.warn('affiliation-config: lecture Firestore impossible, cache/défaut utilisé.', e);
  }
  return isAffiliationActive(ag);
}

// Pré-charge le flag de l'agence courante au démarrage.
refreshAffiliationFlag();
