// Onglet SUIVI : colis par étape (Entrepôt → Conteneur → Arrivé → Livré).
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { Card, Empty, Loading } from '../components/ui';
import { colors, fdate } from '../theme';

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const STAGES = [
  { l: 'Entrepôt', ic: '📥' },
  { l: 'Conteneur', ic: '📦' },
  { l: 'Arrivé', ic: '🛬' },
  { l: 'Livré', ic: '✅' },
];

export default function TrackingScreen({ data, loading, onRefresh, active }) {
  const [filter, setFilter] = useState(-1); // -1 = tous
  const [q, setQ] = useState('');
  // Suivi quasi temps réel : rafraîchit en arrivant sur l'onglet, puis toutes
  // les 60 s tant qu'on le regarde (silencieux). S'arrête quand on quitte.
  useEffect(() => {
    if (!active) return;
    onRefresh && onRefresh();
    const id = setInterval(() => { onRefresh && onRefresh(); }, 60000);
    return () => clearInterval(id);
  }, [active]);
  if (loading && !data) return <Loading text="Chargement de vos colis…" />;
  const parcels = (data && data.parcels) || [];
  const counts = STAGES.map((_, i) => parcels.filter(p => p.stage === i).length);
  const term = norm(q.trim());
  const list = parcels.filter(p =>
    (filter < 0 || p.stage === filter) &&
    (!term || norm(`${p.label} ${p.ref} ${p.desc}`).includes(term)));

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}
      refreshControl={<RefreshControl refreshing={!!loading} onRefresh={onRefresh} tintColor={colors.blue} />}>
      {/* Barre de recherche */}
      <View style={s.searchBar}>
        <Text style={s.searchIc}>🔍</Text>
        <TextInput style={s.search} value={q} onChangeText={setQ} placeholder="Rechercher un colis (réf, description)…" placeholderTextColor={colors.muted} />
        {!!q && <TouchableOpacity onPress={() => setQ('')}><Text style={s.clearX}>✕</Text></TouchableOpacity>}
      </View>
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
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 12 },
  searchIc: { fontSize: 15 },
  search: { flex: 1, fontSize: 14, color: colors.ink, paddingVertical: 2 },
  clearX: { color: colors.muted, fontSize: 15, paddingHorizontal: 4 },
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
