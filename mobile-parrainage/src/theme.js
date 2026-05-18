// ============================================================================
//  Thème « ASCENSION »  ·  CHARTE OFFICIELLE AMT
// ----------------------------------------------------------------------------
//  Triade officielle, hiérarchie 60-30-10 :
//    • BASE (60%)  Bleu de Prusse #1A3553  → fonds : calme, confiance
//    • ACCENT (15%) Rouge #E51F21          → carte du solde (point focal),
//                                            boutons clés, statuts
//    • VALEUR (15%) Or #F2A312 (du logo)   → montants, courbe ascendante,
//                                            tout ce qui « rapporte »
//    • NEUTRE (10%) Ivoire                 → textes
//  Le rouge n'est JAMAIS un fond général (psychologie : alerte) — uniquement
//  un point focal. Le bleu domine, l'or marque l'argent.
//
//  ⚠ Les CLÉS sont conservées (gold, glass, bgChip, greenDeep…) pour ne pas
//  casser les écrans Clients / Filleuls / Wallet / Profil : seules les VALEURS
//  changent. Les nouveautés (grad, font, star…) sont additives.
// ============================================================================

export const colors = {
  // Fonds — Bleu de Prusse (couleur secondaire officielle), assombri pour
  // la profondeur et le contraste du texte.
  bg: '#0C1B2C', // bleu de prusse profond (base dominante)
  bgElevated: '#13263D',
  bgChip: '#1A3553', // BLEU DE PRUSSE officiel exact (champs / chips)

  // Surfaces « verre » teintées bleu froid (cohérent avec la base)
  glass: 'rgba(255,255,255,0.05)',
  glassStrong: 'rgba(255,255,255,0.09)',
  glassBorder: 'rgba(120,170,225,0.17)',
  glassBorderStrong: 'rgba(140,185,235,0.32)',

  // Or du logo — la VALEUR (montants, gains, accent chaud)
  gold: '#F2A312', // or marigold du logo
  goldSoft: '#FFC24A',
  goldDeep: '#C9850A',
  goldLight: '#FFD98A', // or clair lisible (gros chiffres)
  star: '#FFD24A', // jaune-or pour la célébration
  navyBrand: '#1A3553', // bleu de prusse officiel

  // Rouge officiel — ACCENT FOCAL (jamais un fond général)
  red: '#E51F21', // ROUGE officiel AMT
  redSoft: '#FF6A5A', // rouge clair (texte d'alerte sur fond sombre)
  redDeep: '#8E1416', // laque rouge profonde (bas de la carte du solde)

  // Sémantique (calées pour bien ressortir sur le bleu)
  green: '#34D9A6',
  greenDeep: '#0E3A2E',
  amber: '#FBBF24',
  amberDeep: '#3A2C08',

  // Texte — ivoire frais sur bleu profond
  text: '#F3F6FB',
  textDim: '#9FB3CE',
  textFaint: '#5F7791',

  // Texte foncé posé sur l'or (boutons or) : bleu de prusse très sombre
  onGold: '#11243A',

  // Divers
  hairline: 'rgba(150,190,235,0.10)',
};

// Dégradés (expo-linear-gradient) — start/end par défaut diagonal.
export const grad = {
  bg: ['#102740', '#0A1626', '#0C1B2C'], // base bleu de prusse (dominante)
  lacquer: ['#163050', '#0F2338'], // panneau laqué bleu (cartes)
  lacquerRed: ['#E8332A', '#971517'], // ROUGE officiel glossy (point focal)
  gold: ['#FFD98A', '#F2A312', '#C9850A'], // or métallisé (montants / boutons)
  goldSheen: ['rgba(255,255,255,0.35)', 'rgba(255,255,255,0)'], // reflet
  ink: ['#1A3553', '#0E1E32'], // bleu de prusse → encre (variété ponctuelle)
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 22, xxl: 30 };

export const radius = { sm: 12, md: 18, lg: 26, pill: 999 };

// Typographie — CHARTE OFFICIELLE AMT :
//  Principale : Comfortaa (rondeur exacte du logotype « amt »)
//  Secondaire : Futura → rendue ici par Jost, l'équivalent libre fidèle
//  (Futura est une police commerciale non intégrable librement ; remplacer
//  par les vrais fichiers Futura si une licence est fournie).
export const font = {
  display: 'Jost_700Bold', // accents géométriques / gros montants (Futura)
  displaySemi: 'Jost_600SemiBold',
  heading: 'Comfortaa_700Bold', // titres (principale)
  body: 'Comfortaa_400Regular',
  bodyMed: 'Comfortaa_500Medium',
  bodyBold: 'Comfortaa_700Bold',
  num: 'Jost_600SemiBold', // chiffres (Futura : net et géométrique)
};

// Ombres (premium) — iOS + Android.
export const shadow = {
  card: {
    shadowColor: '#03101E',
    shadowOpacity: 0.5,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
  },
  gold: {
    shadowColor: colors.gold,
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  lacquer: {
    shadowColor: colors.red,
    shadowOpacity: 0.45,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 16 },
    elevation: 14,
  },
  soft: {
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
};

// Formatage FCFA + date (centralisé).
export const fcfa = (n) => `${Number(n || 0).toLocaleString('fr-FR')} FCFA`;
export const fdate = (v) => {
  if (!v) return '—';
  const d = v && typeof v.toDate === 'function' ? v.toDate() : new Date(v);
  return isNaN(d) ? '—' : d.toLocaleDateString('fr-FR');
};
