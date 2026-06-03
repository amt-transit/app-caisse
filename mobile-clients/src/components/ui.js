// Petits composants UI réutilisables (charte AMT). Soignés : ombres douces,
// coins arrondis, accents jaunes — propage le style à TOUTES les fenêtres.
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, radius } from '../theme';

// Ombre douce multiplateforme (iOS + Android).
export const softShadow = {
  shadowColor: '#1A3553',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.07,
  shadowRadius: 10,
  elevation: 2,
};

export function Card({ children, style }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function SectionTitle({ children, right }) {
  return (
    <View style={s.secRow}>
      <View style={s.secLeft}>
        <View style={s.secBar} />
        <Text style={s.sec}>{children}</Text>
      </View>
      {right ? <View>{right}</View> : null}
    </View>
  );
}

export function Btn({ label, onPress, busy, kind = 'primary', style }) {
  const bg = kind === 'primary' ? colors.blue : kind === 'gold' ? colors.gold : 'transparent';
  const fg = kind === 'ghost' ? colors.muted : (kind === 'gold' ? colors.blue : '#fff');
  const elevated = kind === 'primary' || kind === 'gold';
  return (
    <TouchableOpacity
      style={[s.btn, { backgroundColor: bg }, elevated && s.btnElevated, kind === 'ghost' && s.btnGhost, busy && { opacity: 0.65 }, style]}
      onPress={onPress} disabled={busy} activeOpacity={0.85}>
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[s.btnTxt, { color: fg }]}>{label}</Text>}
    </TouchableOpacity>
  );
}

export function Empty({ icon = '📭', text }) {
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}><Text style={{ fontSize: 34 }}>{icon}</Text></View>
      <Text style={s.emptyTxt}>{text}</Text>
    </View>
  );
}

export function Loading({ text = 'Chargement…' }) {
  return (
    <View style={s.empty}>
      <ActivityIndicator color={colors.blue} size="large" />
      <Text style={[s.emptyTxt, { marginTop: 12 }]}>{text}</Text>
    </View>
  );
}

export function Badge({ text, kind = 'wait' }) {
  const map = {
    paid: ['#dcfce7', '#166534'], wait: ['#fef3c7', '#b45309'],
    bad: ['#fee2e2', '#991b1b'], info: ['#dbeafe', '#1e40af'],
  };
  const [bg, fg] = map[kind] || map.wait;
  return <Text style={[s.badge, { backgroundColor: bg, color: fg }]}>{text}</Text>;
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: '#EEF2F7', padding: 16, marginBottom: 14, ...softShadow },
  secRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, marginTop: 2 },
  secLeft: { flexDirection: 'row', alignItems: 'center', gap: 9, flexShrink: 1 },
  secBar: { width: 4, height: 17, borderRadius: 2, backgroundColor: colors.gold },
  sec: { fontSize: 16, fontWeight: '800', color: colors.blue },
  btn: { borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  btnElevated: { ...softShadow, shadowOpacity: 0.16 },
  btnGhost: { paddingVertical: 11, marginTop: 8 },
  btnTxt: { fontWeight: '800', fontSize: 15, letterSpacing: 0.2 },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIcon: { width: 74, height: 74, borderRadius: 37, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyTxt: { color: colors.muted, textAlign: 'center', fontSize: 14, lineHeight: 21, maxWidth: 300 },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, fontSize: 11, fontWeight: '800', overflow: 'hidden' },
});
