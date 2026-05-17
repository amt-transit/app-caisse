// Logo de marque AMT Transit Cargo, posé sur un disque ambre doux avec
// halo, pour un rendu premium quel que soit le fond.
import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { colors, shadow } from '../theme';

const LOGO = require('../../assets/logo.png');

export default function Brand({ size = 96 }) {
  const ring = size + 18;
  return (
    <View style={[styles.halo, { width: ring + 22, height: ring + 22, borderRadius: (ring + 22) / 2 }]}>
      <View
        style={[
          styles.ring,
          shadow.gold,
          { width: ring, height: ring, borderRadius: ring / 2 },
        ]}
      >
        <Image
          source={LOGO}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          resizeMode="cover"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  halo: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(242,163,18,0.10)',
  },
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.glassBorderStrong,
  },
});
