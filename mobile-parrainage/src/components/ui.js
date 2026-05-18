// Petits composants d'UI réutilisés par tous les onglets (style sombre
// premium AMT). Garde les écrans courts et cohérents.
import React from 'react';
import {
  View, Text, ScrollView, RefreshControl, StyleSheet, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../theme';

export function ScreenScroll({ refreshing, onRefresh, children, contentStyle }) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.scroll, contentStyle]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={!!refreshing}
          onRefresh={onRefresh}
          tintColor={colors.gold}
          colors={[colors.gold]}
        />
      }
    >
      {children}
    </ScrollView>
  );
}

export function ScreenTitle({ icon, title, subtitle }) {
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <View style={styles.titleRow}>
        {icon ? <Ionicons name={icon} size={20} color={colors.gold} /> : null}
        <Text style={styles.title}>{title}</Text>
      </View>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ icon, title, count }) {
  return (
    <View style={styles.section}>
      {icon ? <Ionicons name={icon} size={16} color={colors.gold} /> : null}
      <Text style={styles.sectionT}>{title}</Text>
      {count != null && (
        <View style={styles.pill}><Text style={styles.pillT}>{count}</Text></View>
      )}
    </View>
  );
}

export function Row({ avatar, icon, iconBg, iconColor, main, sub, right, last }) {
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      {avatar != null && (
        <View style={styles.avatar}><Text style={styles.avatarT}>{avatar || '?'}</Text></View>
      )}
      {icon && (
        <View style={[styles.rowIcon, { backgroundColor: iconBg || colors.bgChip }]}>
          <Ionicons name={icon} size={16} color={iconColor || colors.gold} />
        </View>
      )}
      <View style={{ flex: 1, marginLeft: spacing.md }}>
        <Text style={styles.rowMain} numberOfLines={1}>{main}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Badge({ text, tone = 'wait' }) {
  const map = {
    paid: { bg: 'rgba(52,211,153,0.14)', fg: colors.green },
    wait: { bg: 'rgba(251,191,36,0.14)', fg: colors.amber },
    info: { bg: 'rgba(242,163,18,0.14)', fg: colors.gold },
    bad: { bg: 'rgba(229,32,42,0.14)', fg: colors.redSoft },
  };
  const c = map[tone] || map.wait;
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeT, { color: c.fg }]}>{text}</Text>
    </View>
  );
}

export function Empty({ text }) {
  return <Text style={styles.empty}>{text}</Text>;
}

export function PrimaryButton({ label, icon, onPress, disabled, busy }) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={[styles.btn, (disabled || busy) && { opacity: 0.55 }]}
      onPress={onPress}
      disabled={disabled || busy}
    >
      {icon && !busy ? <Ionicons name={icon} size={18} color="#1A1206" /> : null}
      <Text style={styles.btnT}>{busy ? 'Veuillez patienter…' : label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.xl, paddingTop: spacing.lg, paddingBottom: 28 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { color: colors.text, fontSize: 21, fontWeight: '800' },
  subtitle: { color: colors.textDim, fontSize: 13, marginTop: 4 },

  card: {
    backgroundColor: colors.glass,
    borderWidth: 1, borderColor: colors.glassBorder,
    borderRadius: radius.md, padding: spacing.xs, marginBottom: spacing.lg,
  },
  section: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginBottom: spacing.md, marginTop: spacing.xs,
  },
  sectionT: { color: colors.text, fontSize: 15, fontWeight: '800', flex: 1 },
  pill: {
    backgroundColor: colors.glassStrong, borderWidth: 1, borderColor: colors.glassBorder,
    borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3,
  },
  pillT: { color: colors.gold, fontSize: 12, fontWeight: '800' },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline,
  },
  rowLast: { borderBottomWidth: 0 },
  avatar: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: colors.bgChip,
    borderWidth: 1, borderColor: colors.glassBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarT: { color: colors.gold, fontWeight: '800', fontSize: 14 },
  rowIcon: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
  rowMain: { color: colors.text, fontSize: 14.5, fontWeight: '700' },
  rowSub: { color: colors.textDim, fontSize: 12, marginTop: 2 },

  badge: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  badgeT: { fontSize: 10.5, fontWeight: '800' },
  empty: { color: colors.textFaint, fontSize: 13, padding: spacing.lg, textAlign: 'center' },

  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, backgroundColor: colors.gold,
    borderRadius: radius.md, height: 52, marginTop: spacing.sm,
  },
  btnT: { color: '#1A1206', fontWeight: '800', fontSize: 15 },
});
