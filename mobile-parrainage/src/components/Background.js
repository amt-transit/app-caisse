// Fond « sombre premium » sans dépendance native : bleu nuit profond +
// halos lumineux (or & rouge) flous simulés par des cercles très
// translucides. Donne un effet dégradé/glow haut de gamme.
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from '../theme';

export default function Background({ children }) {
  return (
    <View style={styles.root}>
      {/* Halo or, en haut */}
      <View style={[styles.blob, styles.gold]} />
      {/* Halo or secondaire (plus diffus) */}
      <View style={[styles.blob, styles.goldFar]} />
      {/* Halo rouge, en bas */}
      <View style={[styles.blob, styles.red]} />
      {/* Voile sombre pour homogénéiser */}
      <View style={styles.veil} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, overflow: 'hidden' },
  blob: { position: 'absolute', borderRadius: 9999 },
  gold: {
    width: 460,
    height: 460,
    top: -210,
    right: -150,
    backgroundColor: colors.gold,
    opacity: 0.16,
  },
  goldFar: {
    width: 320,
    height: 320,
    top: 120,
    left: -170,
    backgroundColor: colors.goldSoft,
    opacity: 0.07,
  },
  red: {
    width: 420,
    height: 420,
    bottom: -230,
    left: -120,
    backgroundColor: colors.red,
    opacity: 0.1,
  },
  veil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,17,36,0.55)',
  },
});
