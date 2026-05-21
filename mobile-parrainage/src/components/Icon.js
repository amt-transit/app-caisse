// ============================================================================
//  Composant Icon — REMPLACEMENT d'Ionicons par des emojis natifs OS.
// ----------------------------------------------------------------------------
//  Pourquoi ? La police vectorielle d'@expo/vector-icons a un bug récurrent
//  sur Expo SDK 52 + EAS Build (carrés arrondis "tofu" à la place des
//  glyphs). Les emojis Unicode sont rendus directement par Android/iOS,
//  jamais en "tofu", aucune dépendance externe.
//
//  L'API est COMPATIBLE avec Ionicons :
//      <Ionicons name="receipt" size={18} color={colors.gold} />
//  →   <Icon name="receipt" size={18} color={colors.gold} />
//
//  L'export `Ionicons` permet de migrer les écrans en changeant UNIQUEMENT
//  l'import (1 ligne par fichier), sans toucher au JSX.
// ============================================================================

import React from 'react';
import { Text } from 'react-native';

// Mapping des noms Ionicons → emoji Unicode équivalent.
// Si un nom n'est pas listé, on tombe sur un point (•) pour ne pas casser le layout.
const EMOJI_MAP = {
  // Statut / alerte
  'alert-circle': '⚠️',
  'warning-outline': '⚠️',
  'information-circle-outline': 'ℹ️',
  'checkmark': '✓',
  'checkmark-circle': '✅',
  'close': '✕',
  'refresh': '⟳',
  'sparkles-outline': '✨',
  'gift': '🎁',

  // Navigation
  'arrow-forward': '➜',
  'chevron-down': '⌄',
  'chevron-forward': '›',
  'chevron-up': '⌃',
  'swap-horizontal': '⇄',
  'swap-horizontal-outline': '⇄',
  'log-out-outline': '⤴',

  // Contact / coordonnées
  'call-outline': '📞',
  'mail-outline': '✉',
  'paper-plane': '✈',

  // Identité / sécurité
  'person-circle': '👤',
  'people': '👥',
  'lock-closed-outline': '🔒',
  'pricetag-outline': '🏷',
  'business-outline': '🏢',

  // Argent / commerce
  'cash-outline': '💵',
  'wallet': '👛',
  'wallet-outline': '👛',
  'receipt': '🧾',
  'receipt-outline': '🧾',
  'grid': '▦',
  'trending-up': '📈',

  // Logistique / colis
  'cube-outline': '📦',
  'box': '📦',
  'box-open': '📦',
  'ship': '🚢',
  'git-network': '🤝',

  // Temps
  'time-outline': '⏱',
  'hourglass-outline': '⏳',

  // Recherche
  'search': '🔍',

  // Notifications
  'notifications': '🔔',
  'notifications-off': '🔕',
  'bell': '🔔',

  // Documents
  'list': '📋',
  'file-invoice': '📄',
  'calendar-check': '📅',
  'sms': '💬',
};

export function Icon({ name, size = 16, color, style, ...rest }) {
  const emoji = EMOJI_MAP[name] || '•';
  return (
    <Text
      allowFontScaling={false}
      style={[{ fontSize: size, color, lineHeight: Math.round(size * 1.15) }, style]}
      {...rest}
    >
      {emoji}
    </Text>
  );
}

// Alias pour migration en 1 ligne : il suffit de changer
//   import { Ionicons } from '@expo/vector-icons';
// en
//   import { Ionicons } from '<chemin>/Icon';
// Tout le JSX <Ionicons name="..." size={...} color={...} /> continue de fonctionner.
export const Ionicons = Icon;

export default Icon;
