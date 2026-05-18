// Marque AMT — on utilise le VRAI logo (assets/logo.png), qui respecte la
// forme officielle du cercle + flèche de la charte. Aucune reproduction
// approximative. Halo or doux optionnel pour le détacher du fond.
import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { shadow } from '../theme';

const LOGO = require('../../assets/logo.png');

export default function LogoMark({ size = 96, glow = true, style }) {
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
        },
        glow && styles.halo,
        glow && shadow.gold,
        style,
      ]}
    >
      <Image
        source={LOGO}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        resizeMode="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  halo: { backgroundColor: 'rgba(242,163,18,0.12)' },
});
