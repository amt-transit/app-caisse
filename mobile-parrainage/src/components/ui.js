// Briques d'UI partagées par tous les onglets — thème « Soleil d'Abidjan ».
// L'API publique est INCHANGÉE (ScreenScroll, ScreenTitle, Card, SectionTitle,
// Row, Badge, Empty, PrimaryButton) : tous les écrans héritent du nouveau look
// sans aucune modification de leur côté.
//
// Changement clé : les Card sont en BLANC FRANC opaque (et non plus en verre
// translucide). Une surface pleine + une ombre douce = une vraie hiérarchie
// visuelle. Le reflet « verre » en sommet de card a été retiré (inutile sur
// une surface opaque).
import React from 'react';
import {
  View, Text, ScrollView, RefreshControl, StyleSheet, TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from './Icon';
import { colors, spacing, radius, font, grad, shadow } from '../theme';

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
          progressBackgroundColor={colors.bgChip}
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
        {icon ? (
          <View style={styles.titleIcon}>
            <Ionicons name={icon} size={16} color={colors.gold} />
          </View>
        ) : null}
        <Text style={styles.title}>{title}</Text>
      </View>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function Card({ children, style }) {
  // Card en blanc franc + ombre douce. C'est la surface qui « gagne » l'œil.
  return <View style={[styles.card, shadow.card, style]}>{children}</View>;
}

export function SectionTitle({ icon, title, count }) {
  return (
    <View style={styles.section}>
      <View style={styles.tick} />
      {icon ? <Ionicons name={icon} size={15} color={colors.gold} /> : null}
      <Text style={styles.sectionT}>{title}</Text>
      {count != null && (
        <View style={styles.pill}><Text style={styles.pillT}>{count}</Text></View>
      )}
    </View>
  );
}

export function Row({ avatar, icon, iconBg, iconColor, main, sub, right, last, onPress }) {
  const inner = (
    <>
      {avatar != null && (
        <View style={styles.avatar}>
          <Text style={styles.avatarT}>{avatar || '?'}</Text>
        </View>
      )}
      {icon && (
        <View style={[styles.rowIcon, { backgroundColor: iconBg || colors.goldWarm }]}>
          <Ionicons name={icon} size={16} color={iconColor || colors.gold} />
        </View>
      )}
      <View style={{ flex: 1, marginLeft: spacing.md }}>
        <Text style={styles.rowMain} numberOfLines={1}>{main}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      {right}
      {onPress ? (
        <Ionicons
          name="chevron-forward"
          size={16}
          color={colors.textFaint}
          style={{ marginLeft: 6 }}
        />
      ) : null}
    </>
  );
  if (onPress) {
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onPress}
        style={[styles.row, last && styles.rowLast]}
      >
        {inner}
      </TouchableOpacity>
    );
  }
  return <View style={[styles.row, last && styles.rowLast]}>{inner}</View>;
}

// Badges — fonds chauds OPAQUES (et non plus rgba translucides). Plus francs,
// plus lisibles, cohérents avec l'ambiance chaleureuse.
export function Badge({ text, tone = 'wait' }) {
  const map = {
    paid: { bg: colors.greenWarm, fg: colors.green,   bd: 'rgba(4,120,87,0.25)' },
    wait: { bg: colors.amberWarm, fg: colors.amber,   bd: 'rgba(180,83,9,0.25)' },
    info: { bg: colors.goldWarm,  fg: colors.goldDeep, bd: 'rgba(184,120,10,0.28)' },
    bad:  { bg: colors.redWarm,   fg: colors.redSoft, bd: 'rgba(200,30,30,0.25)' },
  };
  const c = map[tone] || map.wait;
  return (
    <View style={[styles.badge, { backgroundColor: c.bg, borderColor: c.bd }]}>
      <Text style={[styles.badgeT, { color: c.fg }]}>{String(text).toUpperCase()}</Text>
    </View>
  );
}

export function Empty({ text }) {
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIcon}>
        <Ionicons name="sparkles-outline" size={20} color={colors.gold} />
      </View>
      <Text style={styles.empty}>{text}</Text>
    </View>
  );
}

export function PrimaryButton({ label, icon, onPress, disabled, busy }) {
  const off = disabled || busy;
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={[styles.btnWrap, off && { opacity: 0.55 }, !off && shadow.gold]}
      onPress={onPress}
      disabled={off}
    >
      <LinearGradient
        colors={grad.gold}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.btn}
      >
        {icon && !busy ? <Ionicons name={icon} size={18} color={colors.onGold} /> : null}
        <Text style={styles.btnT}>{busy ? 'Veuillez patienter…' : label}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.xl, paddingTop: spacing.lg, paddingBottom: 36 },

  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  titleIcon: {
    width: 30, height: 30, borderRadius: 11,
    backgroundColor: colors.goldWarm,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { color: colors.text, fontSize: 22, fontFamily: font.display, letterSpacing: 0.2 },
  subtitle: {
    color: colors.textDim, fontSize: 13, marginTop: 5,
    fontFamily: font.body, lineHeight: 18,
  },

  // Card : blanc franc opaque + bordure visible + ombre douce.
  card: {
    backgroundColor: colors.glass, // = #FFFFFF
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    padding: spacing.xs,
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },

  section: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginBottom: spacing.md, marginTop: spacing.xs,
  },
  tick: {
    width: 4, height: 16, borderRadius: 2, backgroundColor: colors.gold,
    marginRight: 2,
  },
  sectionT: {
    color: colors.text, fontSize: 14.5, fontFamily: font.heading, flex: 1,
    letterSpacing: 0.2,
  },
  pill: {
    backgroundColor: colors.goldWarm,
    borderWidth: 1, borderColor: 'rgba(184,120,10,0.25)',
    borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 3,
  },
  pillT: { color: colors.goldDeep, fontSize: 12, fontFamily: font.bodyBold },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 13, paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline,
  },
  rowLast: { borderBottomWidth: 0 },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.goldWarm,
    borderWidth: 1, borderColor: 'rgba(242,163,18,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarT: { color: colors.goldDeep, fontFamily: font.bodyBold, fontSize: 14 },
  rowIcon: {
    width: 40, height: 40, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  rowMain: { color: colors.text, fontSize: 14.5, fontFamily: font.bodyMed },
  rowSub: { color: colors.textDim, fontSize: 12, marginTop: 3, fontFamily: font.body },

  badge: {
    borderRadius: 9, paddingHorizontal: 9, paddingVertical: 5,
    borderWidth: 1,
  },
  badgeT: { fontSize: 9.5, fontFamily: font.bodyBold, letterSpacing: 1 },

  emptyWrap: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.md },
  emptyIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.goldWarm,
    alignItems: 'center', justifyContent: 'center',
  },
  empty: { color: colors.textFaint, fontSize: 13, textAlign: 'center', fontFamily: font.body },

  btnWrap: { borderRadius: radius.md, marginTop: spacing.sm, overflow: 'hidden' },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, height: 54,
  },
  btnT: { color: colors.onGold, fontFamily: font.bodyBold, fontSize: 15.5, letterSpacing: 0.2 },
});