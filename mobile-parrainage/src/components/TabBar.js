// Barre d'onglets bas — laque sombre, onglet actif en or avec un repère
// « ascendant » au-dessus de l'icône.
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, font, grad } from '../theme';

export const TABS = [
  { key: 'factures', label: 'Factures', icon: 'receipt' },
  { key: 'dashboard', label: 'Accueil', icon: 'grid' },
  { key: 'wallet', label: 'Wallet', icon: 'wallet' },
  { key: 'filleuls', label: 'Filleuls', icon: 'git-network' },
  { key: 'profil', label: 'Profil', icon: 'person-circle' },
];

export default function TabBar({ active, onChange }) {
  return (
    <View style={styles.bar}>
      <View style={styles.hair} />
      {TABS.map((t) => {
        const on = active === t.key;
        return (
          <TouchableOpacity
            key={t.key}
            style={styles.item}
            activeOpacity={0.8}
            onPress={() => onChange(t.key)}
          >
            {on ? (
              <LinearGradient
                colors={grad.gold}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.dash}
              />
            ) : (
              <View style={styles.dashOff} />
            )}
            <Ionicons
              name={on ? t.icon : `${t.icon}-outline`}
              size={22}
              color={on ? colors.gold : colors.textFaint}
            />
            <Text
              style={[
                styles.label,
                { color: on ? colors.gold : colors.textFaint,
                  fontFamily: on ? font.bodyBold : font.body },
              ]}
            >
              {t.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(22,9,12,0.96)',
    paddingTop: spacing.md,
    paddingBottom: 26,
    paddingHorizontal: spacing.sm,
  },
  hair: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 1,
    backgroundColor: colors.glassBorder,
  },
  item: { flex: 1, alignItems: 'center', gap: 4 },
  dash: { width: 22, height: 3, borderRadius: 2, marginBottom: 3 },
  dashOff: { width: 22, height: 3, borderRadius: 2, marginBottom: 3, backgroundColor: 'transparent' },
  label: { fontSize: 10.5, letterSpacing: 0.2 },
});
