// Fond « Soleil d'Abidjan » — bleu ciel doux dégradé + halos colorés.
//
// Changement vs « Ciel d'Orient » : les halos étaient si dilués (opacité
// 0.07–0.14) qu'on ne les voyait quasiment pas → fond plat. Ici on les
// remonte légèrement, en gardant l'or DOMINANT (chaleur) et le rouge discret
// en simple ponctuation. Le fond « vit » sans jamais gêner la lecture des
// cards blanches posées au-dessus.
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
      {/* Halo or — chaud, dominant, en haut à droite (le « soleil ») */}
      <View style={[styles.blob, styles.gold]} />
      <View style={[styles.blob, styles.goldFar]} />

      {/* Halo rouge — discret, simple ponctuation en bas à gauche */}
      <View style={[styles.blob, styles.red]} />

      {/* Halo bleu profond — un peu de profondeur en haut à gauche */}
      <View style={[styles.blob, styles.blueDeep]} />

      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, overflow: 'hidden' },
  blob: { position: 'absolute', borderRadius: 9999 },

  // Or — dominant et chaleureux : c'est lui qui donne l'ambiance « soleil ».
  gold: {
    width: 560,
    height: 560,
    top: -280,
    right: -190,
    backgroundColor: colors.gold,
    opacity: 0.20,
  },
  goldFar: {
    width: 340,
    height: 340,
    bottom: 200,
    right: -170,
    backgroundColor: colors.goldSoft,
    opacity: 0.13,
  },
  // Rouge — volontairement discret : il ponctue, il n'envahit pas.
  red: {
    width: 460,
    height: 460,
    bottom: -260,
    left: -170,
    backgroundColor: colors.red,
    opacity: 0.07,
  },
  // Bleu — profondeur légère.
  blueDeep: {
    width: 380,
    height: 380,
    top: 130,
    left: -190,
    backgroundColor: colors.navyBrand,
    opacity: 0.06,
  },
});