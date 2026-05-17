// Thème de marque AMT Transit Cargo — dérivé des couleurs du logo :
//  - Or / ambre  = accent principal (le cercle du logo)
//  - Bleu nuit    = fond (le mot « amt »)
//  - Rouge        = alerte / mise en avant (le badge « cargo »)
// Style : sombre premium, cartes « verre dépoli ».

export const colors = {
  // Fonds
  bg: '#0A1124', // bleu nuit profond (base)
  bgElevated: '#0E1730',
  bgChip: '#16213C',

  // Verre dépoli (glassmorphism)
  glass: 'rgba(255,255,255,0.055)',
  glassStrong: 'rgba(255,255,255,0.085)',
  glassBorder: 'rgba(255,255,255,0.10)',
  glassBorderStrong: 'rgba(255,255,255,0.16)',

  // Marque
  gold: '#F2A312', // ambre du logo (accent principal)
  goldSoft: '#F8B83A',
  goldDeep: '#C9850A',
  navyBrand: '#1B2A4A', // bleu « amt »
  red: '#E5202A', // rouge « cargo »
  redSoft: '#FF5A60',

  // Sémantique
  green: '#34D399',
  greenDeep: '#0E3B30',
  amber: '#FBBF24',
  amberDeep: '#3A2C08',

  // Texte
  text: '#F4F6FB',
  textDim: '#9AA7C2',
  textFaint: '#65728F',

  // Divers
  hairline: 'rgba(255,255,255,0.07)',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  xxl: 30,
};

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  pill: 999,
};

// Ombres douces (premium) — iOS + Android.
export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  gold: {
    shadowColor: colors.gold,
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
};

// Formatage FCFA + date (repris de l'app, centralisé ici).
export const fcfa = (n) => `${Number(n || 0).toLocaleString('fr-FR')} FCFA`;
export const fdate = (v) => {
  if (!v) return '—';
  const d = v && typeof v.toDate === 'function' ? v.toDate() : new Date(v);
  return isNaN(d) ? '—' : d.toLocaleDateString('fr-FR');
};
