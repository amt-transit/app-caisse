// Écran STATISTIQUES : KPIs (factures, CA total, payé, impayé), répartition par
// statut (Payé/Acompte/Impayé), activité 6 mois, courbe Envois/Impayés.
import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import Svg, { Polyline, Circle, Line as SvgLine } from 'react-native-svg';
import { Card, SectionTitle, Empty } from '../components/ui';
import { colors, fcfa } from '../theme';
import { useLang } from '../i18n';

const TAUX = 655.957;
const toFcfa = (v, cur) => (cur === 'EUR' ? (v || 0) * TAUX : (v || 0));

export default function StatsScreen({ data }) {
  const { t } = useLang();
  const invoices = (data && data.invoices) || [];
  const loyalty = (data && data.loyalty) || {};
  if (invoices.length === 0) return <Empty icon="📊" text={t('Pas encore de données à afficher.')} />;

  const nb = invoices.length;
  const paye = invoices.reduce((s, i) => s + toFcfa(i.paid, i.currency), 0);
  const ca = invoices.reduce((s, i) => s + toFcfa(i.total, i.currency), 0);     // CA total facturé
  const impayeMontant = Math.max(0, ca - paye);
  const envois = loyalty.sentAsSender || 0;

  // Répartition par STATUT (nombre de factures).
  const byStatus = { PAYE: 0, PARTIEL: 0, IMPAYE: 0 };
  invoices.forEach(i => { byStatus[i.status] = (byStatus[i.status] || 0) + 1; });
  const statusRows = [
    { k: 'PAYE', l: 'Payées', c: colors.green, n: byStatus.PAYE },
    { k: 'PARTIEL', l: 'Acompte', c: colors.gold, n: byStatus.PARTIEL },
    { k: 'IMPAYE', l: 'Impayées', c: colors.red, n: byStatus.IMPAYE },
  ];

  // Séries mensuelles (6 mois) : nb d'envois (factures) et nb d'impayées.
  const now = new Date();
  const months = [];
  for (let k = 5; k >= 0; k--) {
    const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const mInv = invoices.filter(i => String(i.date || '').slice(0, 7) === ym);
    months.push({
      l: d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''),
      envois: mInv.length,
      impayes: mInv.filter(i => i.status !== 'PAYE').length,
    });
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <View style={st.kpis}>
        <Kpi v={nb} l={t('Factures')} />
        <Kpi v={envois} l={t('Envois')} />
      </View>
      <View style={st.kpis}>
        <Kpi v={fcfa(ca)} l={t('CA total')} color={colors.blue} />
        <Kpi v={fcfa(impayeMontant)} l={t('Impayé')} color={colors.red} />
      </View>

      <Card>
        <SectionTitle>{t('Répartition par statut')}</SectionTitle>
        {statusRows.map(r => {
          const pct = nb > 0 ? Math.round(r.n / nb * 100) : 0;
          return (
            <View key={r.k} style={st.srow}>
              <View style={st.sline}>
                <Text style={st.slabel}>{t(r.l)}</Text>
                <Text style={st.svalue}>{r.n} · {pct}%</Text>
              </View>
              <View style={st.track}><View style={[st.fill, { width: `${pct}%`, backgroundColor: r.c }]} /></View>
            </View>
          );
        })}
      </Card>

      <Card>
        <SectionTitle>{t('Envois / Impayés (6 mois)')}</SectionTitle>
        <LineChart months={months} />
        <View style={st.legendRow}>
          <View style={st.legend}><View style={[st.dot, { backgroundColor: colors.blue }]} /><Text style={st.legendT}>{t('Envois')}</Text></View>
          <View style={st.legend}><View style={[st.dot, { backgroundColor: colors.red }]} /><Text style={st.legendT}>{t('Impayés')}</Text></View>
        </View>
      </Card>
    </ScrollView>
  );
}

// Courbe simple en SVG (2 séries) avec axes implicites.
function LineChart({ months }) {
  const W = 300, H = 140, padL = 24, padB = 22, padT = 10, padR = 8;
  const maxV = Math.max(1, ...months.map(m => Math.max(m.envois, m.impayes)));
  const n = months.length;
  const x = (i) => padL + (i * (W - padL - padR)) / Math.max(1, n - 1);
  const y = (v) => padT + (H - padT - padB) * (1 - v / maxV);
  const pts = (key) => months.map((m, i) => `${x(i)},${y(m[key])}`).join(' ');

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        {/* lignes horizontales repères */}
        {[0, 0.5, 1].map((f, k) => (
          <SvgLine key={k} x1={padL} y1={padT + (H - padT - padB) * f} x2={W - padR} y2={padT + (H - padT - padB) * f} stroke="#e6ebf1" strokeWidth="1" />
        ))}
        <Polyline points={pts('envois')} fill="none" stroke={colors.blue} strokeWidth="2.5" />
        <Polyline points={pts('impayes')} fill="none" stroke={colors.red} strokeWidth="2.5" />
        {months.map((m, i) => (<Circle key={'e' + i} cx={x(i)} cy={y(m.envois)} r="3" fill={colors.blue} />))}
        {months.map((m, i) => (<Circle key={'i' + i} cx={x(i)} cy={y(m.impayes)} r="3" fill={colors.red} />))}
      </Svg>
      <View style={st.xaxis}>
        {months.map((m, i) => <Text key={i} style={st.xlabel}>{m.l}</Text>)}
      </View>
    </View>
  );
}

function Kpi({ v, l, color }) {
  return (
    <Card style={st.kpi}>
      <Text style={[st.kpiV, color && { color }]}>{v}</Text>
      <Text style={st.kpiL}>{l}</Text>
    </Card>
  );
}

const st = StyleSheet.create({
  kpis: { flexDirection: 'row', gap: 12, marginBottom: 2 },
  kpi: { flex: 1, alignItems: 'center', paddingVertical: 16 },
  kpiV: { fontSize: 18, fontWeight: '800', color: colors.blue },
  kpiL: { fontSize: 11, color: colors.muted, marginTop: 4, fontWeight: '600' },
  srow: { marginTop: 10 },
  sline: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  slabel: { fontSize: 13, color: colors.ink, fontWeight: '600' },
  svalue: { fontSize: 13, color: colors.muted, fontWeight: '700' },
  track: { height: 12, backgroundColor: '#eef2f7', borderRadius: 6, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 6 },
  legendRow: { flexDirection: 'row', justifyContent: 'center', gap: 22, marginTop: 8 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendT: { fontSize: 13, color: colors.ink, fontWeight: '600' },
  xaxis: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingHorizontal: 8, marginTop: 2 },
  xlabel: { fontSize: 10, color: colors.muted, flex: 1, textAlign: 'center' },
});
