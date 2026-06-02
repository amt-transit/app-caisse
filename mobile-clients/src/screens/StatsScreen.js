// Écran STATISTIQUES : KPIs, répartition payé/impayé, activité 6 mois.
import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Card, SectionTitle, Empty } from '../components/ui';
import { colors, fcfa } from '../theme';

const TAUX = 655.957;
const toFcfa = (v, cur) => (cur === 'EUR' ? (v || 0) * TAUX : (v || 0));

export default function StatsScreen({ data }) {
  const invoices = (data && data.invoices) || [];
  const loyalty = (data && data.loyalty) || {};
  if (invoices.length === 0) return <Empty icon="📊" text="Pas encore de données à afficher." />;

  const nb = invoices.length;
  const paye = invoices.reduce((s, i) => s + toFcfa(i.paid, i.currency), 0);
  const total = invoices.reduce((s, i) => s + toFcfa(i.total, i.currency), 0);
  const impaye = Math.max(0, total - paye);
  const envois = loyalty.sentAsSender || 0;
  const paidPct = total > 0 ? Math.round(paye / total * 100) : 0;

  // Activité : nb de factures par mois (6 derniers mois).
  const now = new Date();
  const months = [];
  for (let k = 5; k >= 0; k--) {
    const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const l = d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '');
    const v = invoices.filter(i => String(i.date || '').slice(0, 7) === ym).length;
    months.push({ l, v });
  }
  const maxV = Math.max(1, ...months.map(m => m.v));

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <View style={s.kpis}>
        <Kpi v={nb} l="Factures" />
        <Kpi v={envois} l="Envois" />
      </View>
      <View style={s.kpis}>
        <Kpi v={fcfa(paye)} l="Total payé" color={colors.green} />
        <Kpi v={fcfa(impaye)} l="Total impayé" color={colors.red} />
      </View>

      <Card>
        <SectionTitle>Répartition des paiements</SectionTitle>
        <View style={s.barWrap}>
          <View style={[s.barPaid, { flex: Math.max(paidPct, 1) }]} />
          <View style={[s.barUnpaid, { flex: Math.max(100 - paidPct, 1) }]} />
        </View>
        <View style={s.legendRow}>
          <View style={s.legend}><View style={[s.dot, { backgroundColor: colors.green }]} /><Text style={s.legendT}>Payé {paidPct}%</Text></View>
          <View style={s.legend}><View style={[s.dot, { backgroundColor: colors.red }]} /><Text style={s.legendT}>Impayé {100 - paidPct}%</Text></View>
        </View>
      </Card>

      <Card>
        <SectionTitle>Activité — 6 derniers mois</SectionTitle>
        <View style={s.chart}>
          {months.map((m, i) => (
            <View key={i} style={s.col}>
              <Text style={s.colV}>{m.v}</Text>
              <View style={[s.bar, { height: Math.max(4, Math.round((m.v / maxV) * 90)) }]} />
              <Text style={s.colL}>{m.l}</Text>
            </View>
          ))}
        </View>
      </Card>
    </ScrollView>
  );
}

function Kpi({ v, l, color }) {
  return (
    <Card style={s.kpi}>
      <Text style={[s.kpiV, color && { color }]}>{v}</Text>
      <Text style={s.kpiL}>{l}</Text>
    </Card>
  );
}

const s = StyleSheet.create({
  kpis: { flexDirection: 'row', gap: 12, marginBottom: 2 },
  kpi: { flex: 1, alignItems: 'center', paddingVertical: 16 },
  kpiV: { fontSize: 19, fontWeight: '800', color: colors.blue },
  kpiL: { fontSize: 11, color: colors.muted, marginTop: 4, fontWeight: '600' },
  barWrap: { flexDirection: 'row', height: 16, borderRadius: 8, overflow: 'hidden', marginTop: 6 },
  barPaid: { backgroundColor: colors.green },
  barUnpaid: { backgroundColor: colors.red },
  legendRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendT: { fontSize: 13, color: colors.ink, fontWeight: '600' },
  chart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 130, marginTop: 8 },
  col: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  colV: { fontSize: 11, fontWeight: '800', color: colors.blue, marginBottom: 4 },
  bar: { width: '55%', backgroundColor: colors.blueLight, borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  colL: { fontSize: 11, color: colors.muted, marginTop: 6 },
});
