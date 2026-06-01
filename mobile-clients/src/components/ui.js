// Petits composants UI réutilisables (charte AMT).
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, radius } from '../theme';

export function Card({ children, style }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function SectionTitle({ children, right }) {
  return (
    <View style={s.secRow}>
      <Text style={s.sec}>{children}</Text>
      {right ? <View>{right}</View> : null}
    </View>
  );
}

export function Btn({ label, onPress, busy, kind = 'primary', style }) {
  const bg = kind === 'primary' ? colors.blue : kind === 'gold' ? colors.gold : 'transparent';
  const fg = kind === 'ghost' ? colors.muted : (kind === 'gold' ? colors.blue : '#fff');
  return (
    <TouchableOpacity style={[s.btn, { backgroundColor: bg }, kind === 'ghost' && s.btnGhost, busy && { opacity: 0.6 }, style]}
      onPress={onPress} disabled={busy} activeOpacity={0.85}>
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[s.btnTxt, { color: fg }]}>{label}</Text>}
    </TouchableOpacity>
  );
}

export function Empty({ icon = '📭', text }) {
  return (
    <View style={s.empty}>
      <Text style={{ fontSize: 38, marginBottom: 8, opacity: 0.6 }}>{icon}</Text>
      <Text style={s.emptyTxt}>{text}</Text>
    </View>
  );
}

export function Loading({ text = 'Chargement…' }) {
  return (
    <View style={s.empty}>
      <ActivityIndicator color={colors.blue} size="large" />
      <Text style={[s.emptyTxt, { marginTop: 10 }]}>{text}</Text>
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
  card: { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 16, marginBottom: 14 },
  secRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, marginTop: 2 },
  sec: { fontSize: 16, fontWeight: '800', color: colors.blue },
  btn: { borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 10 },
  btnGhost: { padding: 10 },
  btnTxt: { fontWeight: '700', fontSize: 15 },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 36 },
  emptyTxt: { color: colors.muted, textAlign: 'center', fontSize: 14, lineHeight: 20 },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, fontSize: 11, fontWeight: '700', overflow: 'hidden' },
});
