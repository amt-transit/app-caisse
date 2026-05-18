// Logo AMT Transit Cargo posé sur un anneau laqué + halo or, pour un rendu
// premium quel que soit le fond.
import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, shadow, grad } from '../theme';

const LOGO = require('../../assets/logo.png');

export default function Brand({ size = 96 }) {
  const ring = size + 20;
  const halo = ring + 26;
  return (
    <View style={[styles.halo, { width: halo, height: halo, borderRadius: halo / 2 }]}>
      <LinearGradient
        colors={grad.gold}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.ring,
          shadow.gold,
          { width: ring, height: ring, borderRadius: ring / 2 },
        ]}
      >
        <View style={styles.inner}>
          <Image
            source={LOGO}
            style={{ width: size, height: size, borderRadius: size / 2 }}
            resizeMode="cover"
          />
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  halo: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(242,163,18,0.12)',
  },
  ring: { alignItems: 'center', justifyContent: 'center', padding: 4 },
  inner: {
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.55)',
    overflow: 'hidden',
  },
});
