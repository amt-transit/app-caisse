// Écran PROCHAINS DÉPARTS : dates des prochains bateaux (agence de départ).
import React, { useState, useEffect } from 'react';
import { ScrollView, Text, StyleSheet, View, RefreshControl } from 'react-native';
import { Card, Loading, Empty } from '../components/ui';
import { colors, fdate } from '../theme';
import { api } from '../api';
import { useLang } from '../i18n';

export default function DeparturesScreen() {
  const { t } = useLang();
  const [list, setList] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try { const r = await api.getNextDepartures(); setList(r.departures || []); }
    catch (e) { setList([]); }
    finally { setRefreshing(false); }
  };
  useEffect(() => { load(); }, []);

  if (list === null) return <Loading text={t('Chargement des départs…')} />;
  if (list.length === 0) return <Empty icon="🚢" text={t('Aucun départ programmé pour le moment.')} />;

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.blue} />}>
      <Text style={s.intro}>{t('Prochains départs prévus. Les dates sont indicatives.')}</Text>
      {list.map((d, i) => (
        <Card key={i} style={s.card}>
          <View style={s.iconBox}><Text style={{ fontSize: 22 }}>🚢</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.name}>{d.name || t('Départ')}{d.destination ? ` → ${d.destination}` : ''}</Text>
            <Text style={s.date}>📅 {fdate(d.date)}</Text>
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  intro: { color: colors.muted, fontSize: 13, marginBottom: 12, lineHeight: 18 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  iconBox: { width: 46, height: 46, borderRadius: 12, backgroundColor: '#e0f2fe', alignItems: 'center', justifyContent: 'center' },
  name: { fontWeight: '800', color: colors.blue, fontSize: 15 },
  date: { color: colors.muted, fontSize: 13, marginTop: 3 },
});
