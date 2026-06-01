// Onglet SUIVI : colis par étape (Entrepôt → Conteneur → Arrivé → Livré).
import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { Card, Empty, Loading } from '../components/ui';
import { colors, fdate } from '../theme';

const STAGES = [
  { l: 'Entrepôt', ic: '📥' },
  { l: 'Conteneur', ic: '📦' },
  { l: 'Arrivé', ic: '🛬' },
  { l: 'Livré', ic: '✅' },
];

export default function TrackingScreen({ data, loading, onRefresh }) {
  const [filter, setFilter] = useState(-1); // -1 = tous
  if (loading && !data) return <Loading text="Chargement de vos colis…" />;
  const parcels = (data && data.parcels) || [];
  const counts = STAGES.map((_, i) => parcels.filter(p => p.stage === i).length);
  const list = parcels.filter(p => filter < 0 || p.stage === filter);

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}
      refreshControl={<RefreshControl refreshing={!!loading} onRefresh={onRefresh} tintColor={colors.blue} />}>
      {/* Récap par étape (cliquable = filtre) */}
      <View style={s.pipe}>
        {STAGES.map((st, i) => (
          <TouchableOpacity key={i} style={[s.p, filter === i && s.pActive]} onPress={() => setFilter(filter === i ? -1 : i)} activeOpacity={0.7}>
            <Text style={{ fontSize: 20 }}>{st.ic}</Text>
            <Text style={s.pV}>{counts[i]}</Text>
            <Text style={s.pL}>{st.l}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {filter >= 0 && (
        <TouchableOpacity onPress={() => setFilter(-1)}><Text style={s.clear}>↺ Voir tous les colis</Text></TouchableOpacity>
      )}

      {list.length === 0 ? (
        <Empty icon="📦" text={parcels.length === 0 ? "Aucun colis rattaché à votre numéro." : "Aucun colis à cette étape."} />
      ) : list.map((p, idx) => (
        <Card key={idx}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text style={s.ref}>{p.label}</Text>
              <Text style={s.sub}>{p.ref}{p.desc ? ' · ' + p.desc : ''}</Text>
            </View>
            <Text style={s.date}>{p.date ? fdate(p.date) : ''}</Text>
          </View>
          <Stepper stage={p.stage} />
        </Card>
      ))}
    </ScrollView>
  );
}

function Stepper({ stage }) {
  return (
    <View style={s.stepper}>
      {STAGES.map((st, i) => {
        const done = i < stage, current = i === stage;
        return (
          <View key={i} style={s.step}>
            {i > 0 && <View style={[s.bar, (done || current) && { backgroundColor: colors.blue }]} />}
            <View style={[s.dot, done && s.dotDone, current && s.dotCurrent]}>
              <Text style={{ fontSize: 12 }}>{i <= stage ? st.ic : (i + 1)}</Text>
            </View>
            <Text style={[s.stepLb, (done || current) && { color: colors.blue, fontWeight: '700' }]}>{st.l}</Text>
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  pipe: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  p: { flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  pActive: { borderColor: colors.blue, backgroundColor: '#f4f8fd' },
  pV: { fontSize: 18, fontWeight: '800', color: colors.blue, marginTop: 2 },
  pL: { fontSize: 10, color: colors.muted, marginTop: 1 },
  clear: { color: colors.muted, fontWeight: '600', marginBottom: 10, fontSize: 13 },
  ref: { fontWeight: '800', color: colors.blue, fontSize: 14 },
  sub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  date: { fontSize: 11, color: colors.muted },
  stepper: { flexDirection: 'row', marginTop: 14 },
  step: { flex: 1, alignItems: 'center' },
  bar: { position: 'absolute', top: 13, right: '50%', width: '100%', height: 3, backgroundColor: colors.line },
  dot: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  dotDone: { backgroundColor: colors.blue, borderColor: colors.blue },
  dotCurrent: { backgroundColor: colors.gold, borderColor: colors.gold },
  stepLb: { fontSize: 10, color: colors.muted, marginTop: 4 },
});
