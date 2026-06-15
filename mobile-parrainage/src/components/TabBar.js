// Barre d'onglets bas — « Soleil d'Abidjan ».
// L'onglet actif est posé sur une pastille dorée chaude (ronde, amicale) :
// l'icône + le libellé passent en or foncé, le repère ascendant disparaît au
// profit d'une vraie zone tactile mise en valeur. Plus chaleureux, plus clair.
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from './Icon';
import { colors, spacing, radius, font } from '../theme';

export const TABS = [
  { key: 'dashboard', label: 'Accueil', icon: 'grid' },
  { key: 'factures', label: 'Factures', icon: 'receipt' },
  { key: 'wallet', label: 'Wallet', icon: 'wallet' },
  { key: 'filleuls', label: 'Filleuls', icon: 'git-network' },
  { key: 'profil', label: 'Profil', icon: 'person-circle' },
];

export default function TabBar({ active, onChange }) {
  const insets = useSafeAreaInsets(); // marge système basse (bord à bord Android 15)
  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom + 10 }]}>
      {TABS.map((t) => {
        const on = active === t.key;
        return (
          <TouchableOpacity
            key={t.key}
            style={styles.item}
            activeOpacity={0.8}
            onPress={() => onChange(t.key)}
          >
            <View style={[styles.iconWrap, on && styles.iconWrapOn]}>
              <Ionicons
                name={on ? t.icon : `${t.icon}-outline`}
                size={21}
                color={on ? colors.goldDeep : colors.textFaint}
              />
            </View>
            <Text
              style={[
                styles.label,
                { color: on ? colors.goldDeep : colors.textFaint,
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
    backgroundColor: '#FFFFFF', // blanc franc — cohérent avec les cards
    borderTopWidth: 1,
    borderColor: colors.glassBorder,
    paddingTop: spacing.sm,
    paddingBottom: 26,
    paddingHorizontal: spacing.sm,
    shadowColor: '#1A3553',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -4 },
    elevation: 10,
  },
  item: { flex: 1, alignItems: 'center', gap: 4 },
  iconWrap: {
    width: 46, height: 32, borderRadius: radius.pill,
    alignItems: 'center', justifyContent: 'center',
  },
  // Onglet actif : pastille dorée chaude (ronde = chaleureux / accessible).
  iconWrapOn: { backgroundColor: colors.goldWarm },
  label: { fontSize: 10.5, letterSpacing: 0.2 },
});