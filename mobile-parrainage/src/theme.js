// ============================================================================
//  Thème « SOLEIL D'ABIDJAN »  ·  CHARTE AMT — version CLAIRE CONTRASTÉE + CHALEUR
// ----------------------------------------------------------------------------
//  Évolution du thème « Ciel d'Orient ». Même triade officielle :
//    • BASE      Bleu de Prusse #1A3553   → textes profonds, accent foncé
//    • ACCENT    Rouge #E51F21            → point focal (alertes, statuts)
//    • VALEUR    Or #F2A312 (logo)        → montants, gains, boutons clés
//
//  Ce qui change par rapport à « Ciel d'Orient » :
//
//  1. FIN DU VERRE UNIFORME. Avant, 100 % des surfaces étaient translucides
//     (rgba blanc 0.55) — résultat : aucune hiérarchie, tout se ressemblait.
//     Désormais les cards sont en BLANC FRANC opaque (#FFFFFF). Le « verre »
//     n'est gardé que là où il a du sens (la tab bar, qui flotte au-dessus
//     du contenu). Une surface pleine = une surface qui « gagne » l'œil.
//
//  2. PLUS DE CONTRASTE. Bordures plus lisibles (#E1E9F1 au lieu d'un blanc
//     translucide quasi invisible), ombres un peu plus présentes, fond de
//     page très légèrement plus typé pour que le blanc des cards ressorte.
//
//  3. CHALEUR. L'or devient une couleur AMICALE, pas seulement « premium » :
//     fonds dorés un peu plus présents (warm), coins plus ronds, l'accueil
//     est traité comme un message humain. Le rouge reste réservé au focal.
//
//  ⚠ Les CLÉS sont conservées (gold, glass, bgChip, greenDeep…) pour ne
//  casser AUCUN écran qui les importe — seules les VALEURS changent.
// ============================================================================

export const colors = {
  // ── Fonds ────────────────────────────────────────────────────────────
  // Fond de page : bleu ciel très doux. Légèrement plus typé qu'avant pour
  // que le BLANC FRANC des cards ressorte par contraste (hiérarchie).
  bg: '#EAF1F8',
  bgElevated: '#FFFFFF',
  // bgChip — utilisé pour les champs / petites pastilles. Désormais OPAQUE
  // (et non plus translucide) : un blanc cassé chaud, lisible et net.
  bgChip: '#FFFFFF',

  // ── Surfaces ─────────────────────────────────────────────────────────
  // « glass » garde son nom (clé conservée) mais vaut maintenant un BLANC
  // PLEIN. C'est ce qui crée la hiérarchie : les cards sont solides, pas
  // diaphanes. glassStrong = blanc pur également (cards mises en avant).
  glass: '#FFFFFF',
  glassStrong: '#FFFFFF',
  // Bordures réellement visibles sur fond clair (l'ancien blanc translucide
  // était quasi invisible → cards « flottantes » sans contour).
  glassBorder: '#E1E9F1',
  glassBorderStrong: '#D2DEEA',

  // ── Or du logo — VALEUR (montants, gains, accent chaud, amical) ──────
  gold: '#F2A312',      // or marigold officiel (boutons / accents)
  goldSoft: '#FFC24A',
  goldDeep: '#B8780A',  // texte or sur fond clair — un poil plus foncé
                        // qu'avant pour un contraste AA franc sur blanc.
  goldLight: '#B8780A', // sur fond clair = goldDeep (lisibilité garantie)
  goldWarm: '#FDF1DA',  // NOUVEAU — fond doré chaud, opaque (chips/halos
                        // d'icônes). Remplace les rgba(242,163,18,0.1x).
  star: '#F2A312',
  navyBrand: '#1A3553',

  // ── Rouge officiel — ACCENT focal ────────────────────────────────────
  red: '#E51F21',
  redSoft: '#C81E1E',   // texte d'alerte sur fond clair (contraste franc)
  redDeep: '#7F1112',
  redWarm: '#FCEAEA',   // NOUVEAU — fond rouge très pâle opaque (badges bad)

  // ── Sémantique calée pour fond clair ─────────────────────────────────
  green: '#047857',     // texte vert lisible sur clair
  greenDeep: '#064E3B',
  greenWarm: '#E4F4EE', // NOUVEAU — fond vert pâle opaque (badges paid)
  amber: '#B45309',     // texte ambre lisible sur clair
  amberDeep: '#78350F',
  amberWarm: '#FBF0DC', // NOUVEAU — fond ambre pâle opaque (badges wait)

  // ── Texte — bleu de Prusse profond sur ciel clair ───────────────────
  text: '#0B2540',      // titres / valeurs principales
  textDim: '#3D5C78',   // textes secondaires (un cran plus contrasté)
  textFaint: '#8198B0', // textes tertiaires / placeholders

  // Texte foncé posé sur l'or (boutons or).
  onGold: '#11243A',

  // ── Divers ────────────────────────────────────────────────────────────
  hairline: 'rgba(11,37,64,0.07)', // fines lignes intérieures
};

// ── Dégradés ──────────────────────────────────────────────────────────
export const grad = {
  // Fond de page : dégradé doux, parent du Bleu de Prusse.
  bg: ['#F2F7FB', '#EAF1F8', '#E3EDF6'],
  // « lacquer » garde son nom mais ne sert plus de fond de card translucide.
  // Sur le thème clair, une card = blanc plein ; on garde ici un dégradé
  // blanc subtil pour les rares surfaces qui veulent un léger relief.
  lacquer: ['#FFFFFF', '#F7FAFD'],
  lacquerRed: ['#E8332A', '#971517'], // ROUGE officiel — carte solde / alertes
  gold: ['#FFD98A', '#F2A312', '#D88E0A'], // or métallisé (boutons or)
  goldSheen: ['rgba(255,255,255,0.55)', 'rgba(255,255,255,0)'], // reflet
  ink: ['#1A3553', '#0E1E32'], // rares zones foncées intentionnelles
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 22, xxl: 30 };

// Coins un peu plus ronds → ambiance chaleureuse / accessible.
export const radius = { sm: 14, md: 20, lg: 28, pill: 999 };

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

// ── Ombres ── tintées bleu de Prusse (jamais noir pur) pour rester douces.
// Un cran plus présentes qu'avant : c'est l'ombre qui « décolle » la card
// blanche du fond et crée la hiérarchie sur un thème clair.
export const shadow = {
  card: {
    shadowColor: '#1A3553',
    shadowOpacity: 0.10,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  gold: {
    shadowColor: '#F2A312',
    shadowOpacity: 0.32,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 9,
  },
  lacquer: {
    shadowColor: '#E51F21',
    shadowOpacity: 0.28,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  soft: {
    shadowColor: '#1A3553',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
};

// Formatage FCFA + date (centralisé) — inchangé.
export const fcfa = (n) => `${Number(n || 0).toLocaleString('fr-FR')} FCFA`;
export const fdate = (v) => {
  if (!v) return '—';
  const d = v && typeof v.toDate === 'function' ? v.toDate() : new Date(v);
  return isNaN(d) ? '—' : d.toLocaleDateString('fr-FR');
};