// Onglet SUIVI : colis par étape (Entrepôt → Conteneur → Arrivé → Livré).
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, RefreshControl, Linking } from 'react-native';
import { Card, Empty, Loading } from '../components/ui';
import { colors, fdate } from '../theme';
import { useLang, tr } from '../i18n';

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const STAGES = [
  { l: 'Entrepôt', ic: '📥' },
  { l: 'Conteneur', ic: '📦' },
  { l: 'Arrivé', ic: '🛬' },
  { l: 'Livré', ic: '✅' },
];

const SHIPSGO_STEPS = { PREPARATION: '🏗️ Préparation', CHARGE: '🔒 Scellé', EMBARQUE: '🚢 Embarqué', EN_TRANSIT: '🌊 En mer', TRANSBORDEMENT: '🔄 Transbord.', ARRIVE: '⚓ Arrivé', DEDOUANE: '🛃 Dédouané', LIVRAISON: '📦 Livré' };

export default function TrackingScreen({ data, loading, onRefresh, active }) {
  const { t } = useLang();
  const [filter, setFilter] = useState(-1); // -1 = tous
  const [q, setQ] = useState('');
  const [expanded, setExpanded] = useState({}); // réfs dépliées (détail des colis)
  // Suivi quasi temps réel : rafraîchit en arrivant sur l'onglet, puis toutes
  // les 60 s tant qu'on le regarde (silencieux). S'arrête quand on quitte.
  useEffect(() => {
    if (!active) return;
    onRefresh && onRefresh();
    const id = setInterval(() => { onRefresh && onRefresh(); }, 60000);
    return () => clearInterval(id);
  }, [active]);
  if (loading && !data) return <Loading text={t('Chargement de vos colis…')} />;
  const parcels = (data && data.parcels) || [];
  const counts = STAGES.map((_, i) => parcels.filter(p => p.stage === i).length);
  const term = norm(q.trim());
  const list = parcels.filter(p =>
    (filter < 0 || p.stage === filter) &&
    (!term || norm(`${p.label} ${p.ref} ${p.desc}`).includes(term)));
  // Regroupement PAR FACTURE + voyage du conteneur (depuis les invoices).
  const trackByRef = {};
  ((data && data.invoices) || []).forEach(inv => { if (inv.tracking && inv.tracking.status) trackByRef[inv.reference] = inv.tracking; });
  const groups = {};
  list.forEach(p => { (groups[p.ref] = groups[p.ref] || []).push(p); });
  const groupKeys = Object.keys(groups);

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}
      refreshControl={<RefreshControl refreshing={!!loading} onRefresh={onRefresh} tintColor={colors.blue} />}>
      {/* Barre de recherche */}
      <View style={s.searchBar}>
        <Text style={s.searchIc}>🔍</Text>
        <TextInput style={s.search} value={q} onChangeText={setQ} placeholder={t('Rechercher un colis (réf, description)…')} placeholderTextColor={colors.muted} />
        {!!q && <TouchableOpacity onPress={() => setQ('')}><Text style={s.clearX}>✕</Text></TouchableOpacity>}
      </View>
      {/* Récap par étape (cliquable = filtre) */}
      <View style={s.pipe}>
        {STAGES.map((st, i) => (
          <TouchableOpacity key={i} style={[s.p, filter === i && s.pActive]} onPress={() => setFilter(filter === i ? -1 : i)} activeOpacity={0.7}>
            <Text style={{ fontSize: 20 }}>{st.ic}</Text>
            <Text style={s.pV}>{counts[i]}</Text>
            <Text style={s.pL}>{tr(st.l)}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {filter >= 0 && (
        <TouchableOpacity onPress={() => setFilter(-1)}><Text style={s.clear}>{t('↺ Voir tous les colis')}</Text></TouchableOpacity>
      )}

      {list.length === 0 ? (
        <Empty icon="📦" text={parcels.length === 0 ? t('Aucun colis rattaché à votre numéro.') : t('Aucun colis à cette étape.')} />
      ) : groupKeys.map(ref => {
        const tk = trackByRef[ref];
        const ps = groups[ref];
        const gCounts = STAGES.map((_, i) => ps.filter(p => p.stage === i).length);
        const isOpen = !!expanded[ref];
        return (
          <Card key={ref}>
            {/* Ligne référence : compteurs par statut + clic pour déplier */}
            <TouchableOpacity activeOpacity={0.7} onPress={() => setExpanded(e => ({ ...e, [ref]: !e[ref] }))}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={s.factureRef}>📄 {ref}</Text>
                <Text style={s.chevron}>{ps.length} {tr('colis')} {isOpen ? '▲' : '▼'}</Text>
              </View>
              <View style={s.countRow}>
                {STAGES.map((st, i) => gCounts[i] > 0 ? (
                  <View key={i} style={s.countPill}><Text style={s.countPillTxt}>{st.ic} {gCounts[i]} {tr(st.l)}</Text></View>
                ) : null)}
              </View>
              {tk ? (
                <Text style={s.voyage}>🛰️ {SHIPSGO_STEPS[tk.status] || tk.status}{tk.vesselName ? ' · 🚢 ' + tk.vesselName : ''}</Text>
              ) : null}
            </TouchableOpacity>
            {isOpen && (
              <View style={{ marginTop: 6 }}>
                {ps.map((p, idx) => (
                  <View key={idx} style={s.colisRow}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.ref}>{p.label}</Text>
                        <Text style={s.sub}>{p.desc || ''}</Text>
                      </View>
                      <Text style={s.date}>{p.date ? fdate(p.date) : ''}</Text>
                    </View>
                    <Stepper stage={p.stage} />
                  </View>
                ))}
                {tk && tk.vesselImo ? (
                  <Text style={[s.carte, { marginTop: 10 }]} onPress={() => Linking.openURL('https://www.vesselfinder.com/?imo=' + encodeURIComponent(tk.vesselImo))}>🗺️ Voir la carte du navire</Text>
                ) : null}
              </View>
            )}
          </Card>
        );
      })}
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
            <Text style={[s.stepLb, (done || current) && { color: colors.blue, fontWeight: '700' }]}>{tr(st.l)}</Text>
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
  factureRef: { fontWeight: '800', color: colors.ink, fontSize: 15 },
  chevron: { fontSize: 12, color: colors.muted, fontWeight: '700' },
  countRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  countPill: { backgroundColor: '#f1f5f9', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  countPillTxt: { fontSize: 12, color: '#334155', fontWeight: '700' },
  voyage: { fontSize: 12, color: '#075985', backgroundColor: '#f0f9ff', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, marginTop: 6, overflow: 'hidden' },
  carte: { color: '#0e7490', fontWeight: '700' },
  colisRow: { marginTop: 10, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10 },
  stepper: { flexDirection: 'row', marginTop: 14 },
  step: { flex: 1, alignItems: 'center' },
  bar: { position: 'absolute', top: 13, right: '50%', width: '100%', height: 3, backgroundColor: colors.line },
  dot: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  dotDone: { backgroundColor: colors.blue, borderColor: colors.blue },
  dotCurrent: { backgroundColor: colors.gold, borderColor: colors.gold },
  stepLb: { fontSize: 10, color: colors.muted, marginTop: 4 },
});
