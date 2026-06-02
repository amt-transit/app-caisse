// Thème AMT (charte officielle) — version légère pour l'app Client RN.
// Triade : Bleu de Prusse #1A3553 · Rouge #E51F21 · JAUNE #FDC615.
export const colors = {
  blue: '#1A3553',
  blueDark: '#13283F',
  blueLight: '#2D567F',
  red: '#E51F21',
  gold: '#FDC615',        // jaune officiel AMT (remplace l'orange)
  goldDark: '#C99700',    // variante foncée (texte jaune sur fond clair)
  goldSoft: '#FFF6D6',    // teinte douce (fonds de puces/accents)
  green: '#16A34A',
  ink: '#0F172A',
  muted: '#5B6B7F',
  line: '#E6EBF1',
  bg: '#EEF2F7',
  card: '#FFFFFF',
  white: '#FFFFFF',
};

// Dégradés réutilisables (expo-linear-gradient).
export const gradients = {
  blue: ['#21426A', '#16293F'],     // bannières / en-têtes
  gold: ['#FFD740', '#FDC615'],     // accents jaunes
};

// Teintes douces par catégorie (fonds d'icônes de raccourcis).
export const tints = {
  blue: '#E7EEF7', red: '#FDE7E7', gold: '#FFF3CC', green: '#E3F6EC', violet: '#ECE9FB',
};

export const radius = { sm: 12, md: 16, lg: 22, pill: 999 };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 22 };

export const fcfa = (n) => `${Math.round(Number(n) || 0).toLocaleString('fr-FR')} FCFA`;
export const fdate = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d) ? '—' : d.toLocaleDateString('fr-FR');
};
