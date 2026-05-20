// Fond « Ciel d'Orient » — bleu pâle dégradé (parent du Bleu de Prusse) +
// deux halos colorés DIFFUS (or en haut-droite, rouge en bas-gauche) qui
// donnent du « matériau » à voir à travers le verre dépoli des cards.
// Pas de voile sombre — on reste sur une atmosphère lumineuse et premium.
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
      {/* Halo or — diffus, en haut à droite (rappel du soleil du logo) */}
      <View style={[styles.blob, styles.gold]} />
      <View style={[styles.blob, styles.goldFar]} />

      {/* Halo rouge — diffus, en bas à gauche */}
      <View style={[styles.blob, styles.red]} />

      {/* Halo bleu profond — donne de la profondeur au coin supérieur gauche */}
      <View style={[styles.blob, styles.blueDeep]} />

      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, overflow: 'hidden' },
  blob: { position: 'absolute', borderRadius: 9999 },

  // Halos très diffus (opacité basse) — visibles à travers le blur des
  // cards, invisibles sur le reste. C'est ce qui fait « vivre » le verre.
  gold: {
    width: 520,
    height: 520,
    top: -260,
    right: -180,
    backgroundColor: colors.gold,
    opacity: 0.14,
  },
  goldFar: {
    width: 320,
    height: 320,
    bottom: 220,
    right: -160,
    backgroundColor: colors.goldSoft,
    opacity: 0.08,
  },
  red: {
    width: 480,
    height: 480,
    bottom: -260,
    left: -160,
    backgroundColor: colors.red,
    opacity: 0.10,
  },
  blueDeep: {
    width: 360,
    height: 360,
    top: 140,
    left: -180,
    backgroundColor: '#1A3553',
    opacity: 0.07,
  },
});
