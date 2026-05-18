// Barre d'onglets bas de l'écran (sans dépendance de navigation native).
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '../theme';

export const TABS = [
  { key: 'clients', label: 'Clients', icon: 'people' },
  { key: 'dashboard', label: 'Accueil', icon: 'grid' },
  { key: 'wallet', label: 'Wallet', icon: 'wallet' },
  { key: 'filleuls', label: 'Filleuls', icon: 'git-network' },
  { key: 'profil', label: 'Profil', icon: 'person-circle' },
];

export default function TabBar({ active, onChange }) {
  return (
    <View style={styles.bar}>
      {TABS.map((t) => {
        const on = active === t.key;
        return (
          <TouchableOpacity
            key={t.key}
            style={styles.item}
            activeOpacity={0.8}
            onPress={() => onChange(t.key)}
          >
            <Ionicons
              name={on ? t.icon : `${t.icon}-outline`}
              size={22}
              color={on ? colors.gold : colors.textFaint}
            />
            <Text style={[styles.label, { color: on ? colors.gold : colors.textFaint }]}>
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
    backgroundColor: 'rgba(8,13,28,0.92)',
    borderTopWidth: 1,
    borderTopColor: colors.glassBorder,
    paddingTop: spacing.sm,
    paddingBottom: 22,
    paddingHorizontal: spacing.sm,
  },
  item: { flex: 1, alignItems: 'center', gap: 3 },
  label: { fontSize: 10.5, fontWeight: '700' },
});
