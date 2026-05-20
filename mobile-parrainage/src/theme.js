// ============================================================================
//  Thème « CIEL D'ORIENT »  ·  CHARTE OFFICIELLE AMT — version CLAIRE + VERRE
// ----------------------------------------------------------------------------
//  Triade officielle (conservée) :
//    • BASE      Bleu de Prusse #1A3553   → accent foncé, textes profonds
//    • ACCENT    Rouge #E51F21            → point focal (alertes, statuts)
//    • VALEUR    Or #F2A312 (logo)        → montants, gains, boutons clés
//
//  Fond CLAIR : Bleu Ciel #EFF6FB → #DCEBF6, parent direct du Bleu de Prusse.
//  Cohérence chromatique maximale avec la charte ; l'or se lit en or foncé
//  (#C9850A) pour rester premium et lisible sur un fond pâle.
//
//  Surfaces « verre dépoli » : les cards, chips, filtres et tab bar utilisent
//  un blanc translucide (rgba 0.55) avec backdrop blur pour donner du matériau
//  au-dessus des halos colorés diffus du fond (or + rouge, très subtils).
//
//  ⚠ Les CLÉS sont conservées (gold, glass, bgChip, greenDeep…) pour ne pas
//  casser les écrans qui les importent — seules les VALEURS sont adaptées
//  au fond clair (contraste de lisibilité inversé).
// ============================================================================

export const colors = {
  // ── Fonds ────────────────────────────────────────────────────────────
  // Base claire (Bleu Ciel, parent du bleu de Prusse de la charte).
  bg: '#EFF6FB',
  bgElevated: '#FFFFFF',
  bgChip: 'rgba(255,255,255,0.55)', // glass : champs / chips translucides

  // ── Surfaces « verre dépoli » ────────────────────────────────────────
  // Translucides sur fond clair : le blur les fait ressortir au-dessus
  // des halos colorés du Background. Bord blanc subtil = biseau verre.
  glass: 'rgba(255,255,255,0.55)',
  glassStrong: 'rgba(255,255,255,0.72)',
  glassBorder: 'rgba(255,255,255,0.7)',
  glassBorderStrong: 'rgba(255,255,255,0.85)',

  // ── Or du logo — VALEUR (montants, gains, accent chaud) ──────────────
  // Sur fond clair, on lit l'or en version « foncée » pour rester premium.
  gold: '#F2A312', // or marigold officiel (boutons / accents)
  goldSoft: '#FFC24A',
  goldDeep: '#C9850A', // utilisé comme couleur de texte (chiffres / titres)
  goldLight: '#C9850A', // sur fond clair = goldDeep (lisibilité garantie)
  star: '#F2A312',
  navyBrand: '#1A3553',

  // ── Rouge officiel — ACCENT focal ────────────────────────────────────
  red: '#E51F21',
  redSoft: '#B91C1C', // texte d'alerte sur fond clair (était #FF6A5A en sombre)
  redDeep: '#7F1112',

  // ── Sémantique calée pour fond clair ─────────────────────────────────
  green: '#047857',     // texte vert lisible sur clair
  greenDeep: '#064E3B',
  amber: '#B45309',     // texte ambre lisible sur clair
  amberDeep: '#78350F',

  // ── Texte — bleu de Prusse profond sur ciel clair ───────────────────
  text: '#0B2540',      // titres / valeurs principales
  textDim: '#41617F',   // textes secondaires
  textFaint: '#7B97B3', // textes tertiaires / placeholders

  // Texte foncé posé sur l'or (boutons or) — inchangé, c'est le contraste
  // avec le jaune-orangé qui doit rester noir-bleuté pour la lisibilité.
  onGold: '#11243A',

  // ── Divers ────────────────────────────────────────────────────────────
  hairline: 'rgba(11,37,64,0.08)', // fines lignes (bleu de Prusse très dilué)
};

// ── Dégradés ──────────────────────────────────────────────────────────
// `bg` est utilisé par <Background /> : on superposera les halos colorés
// (or et rouge) en composants au-dessus (cf. Background.js).
export const grad = {
  bg: ['#EFF6FB', '#E2EDF6', '#DCEBF6'],
  lacquer: ['rgba(255,255,255,0.7)', 'rgba(255,255,255,0.45)'], // panneau verre
  lacquerRed: ['#E8332A', '#971517'], // ROUGE officiel (boutons d'alerte)
  gold: ['#FFD98A', '#F2A312', '#C9850A'], // or métallisé (boutons or)
  goldSheen: ['rgba(255,255,255,0.55)', 'rgba(255,255,255,0)'], // reflet
  ink: ['#1A3553', '#0E1E32'], // pour les rares zones foncées intentionnelles
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 22, xxl: 30 };

export const radius = { sm: 12, md: 18, lg: 26, pill: 999 };

// Typographie — charte officielle AMT (Comfortaa + Jost en proxy de Futura).
export const font = {
  display: 'Jost_700Bold',
  displaySemi: 'Jost_600SemiBold',
  heading: 'Comfortaa_700Bold',
  body: 'Comfortaa_400Regular',
  bodyMed: 'Comfortaa_500Medium',
  bodyBold: 'Comfortaa_700Bold',
  num: 'Jost_600SemiBold',
};

// ── Ombres ── adaptées au fond clair : on tinte avec le bleu de Prusse
// (au lieu du noir pur) pour des ombres « douces, élégantes ».
export const shadow = {
  card: {
    shadowColor: '#0B2540',
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  gold: {
    shadowColor: '#F2A312',
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  lacquer: {
    shadowColor: '#E51F21',
    shadowOpacity: 0.3,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  soft: {
    shadowColor: '#0B2540',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
};

// Formatage FCFA + date (centralisé).
export const fcfa = (n) => `${Number(n || 0).toLocaleString('fr-FR')} FCFA`;
export const fdate = (v) => {
  if (!v) return '—';
  const d = v && typeof v.toDate === 'function' ? v.toDate() : new Date(v);
  return isNaN(d) ? '—' : d.toLocaleDateString('fr-FR');
};
