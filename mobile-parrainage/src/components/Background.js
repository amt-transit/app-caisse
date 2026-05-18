// Fond « laque & or » : dégradé oxblood profond + halo or (haut-droite, le
// disque du logo) + halo rouge (bas-gauche). Voile chaud pour la lisibilité.
// Pas de motif redessiné : on respecte la marque, le logo reste le seul signe.
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, grad } from '../theme';

export default function Background({ children }) {
  return (
    <LinearGradient
      colors={grad.bg}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={styles.root}
    >
      {/* Halo or — le « disque soleil » du logo, en haut à droite */}
      <View style={[styles.blob, styles.gold]} />
      <View style={[styles.blob, styles.goldFar]} />
      {/* Halo rouge — en bas à gauche */}
      <View style={[styles.blob, styles.red]} />

      {/* Voile chaud pour homogénéiser et garder le texte lisible */}
      <View style={styles.veil} />

      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, overflow: 'hidden' },
  blob: { position: 'absolute', borderRadius: 9999 },
  gold: {
    width: 480,
    height: 480,
    top: -240,
    right: -170,
    backgroundColor: colors.gold,
    opacity: 0.18,
  },
  goldFar: {
    width: 340,
    height: 340,
    top: 90,
    left: -190,
    backgroundColor: colors.goldSoft,
    opacity: 0.06,
  },
  red: {
    width: 460,
    height: 460,
    bottom: -260,
    left: -150,
    backgroundColor: colors.red,
    opacity: 0.16,
  },
  veil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7,15,26,0.46)',
  },
});
