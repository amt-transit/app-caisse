// Onglet ACCUEIL : KPIs (nb factures, reste à payer) + 5 dernières factures.
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { Card, SectionTitle, Badge, Loading } from '../components/ui';
import { colors, fcfa, fdate } from '../theme';

const TAUX = 655.957;
const toFcfa = (v, cur) => (cur === 'EUR' ? (v || 0) * TAUX : (v || 0));
const STATUS = { PAYE: ['Payé', 'paid'], PARTIEL: ['Acompte', 'wait'], IMPAYE: ['Impayé', 'bad'] };

export default function HomeScreen({ data, loading, onRefresh, onOpenInvoice }) {
  if (loading && !data) return <Loading text="Chargement de vos factures…" />;
  const invoices = (data && data.invoices) || [];
  const totalDu = invoices.reduce((s, i) => s + toFcfa(i.remaining != null ? i.remaining : (i.total - i.paid), i.currency), 0);

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}
      refreshControl={<RefreshControl refreshing={!!loading} onRefresh={onRefresh} tintColor={colors.blue} />}>
      <View style={s.kpis}>
        <Card style={s.kpi}><Text style={s.kpiV}>{invoices.length}</Text><Text style={s.kpiL}>Mes factures</Text></Card>
        <Card style={s.kpi}><Text style={[s.kpiV, { color: totalDu > 0 ? colors.red : colors.green }]}>{fcfa(totalDu)}</Text><Text style={s.kpiL}>Reste à payer</Text></Card>
      </View>

      <SectionTitle>Dernières factures</SectionTitle>
      <Card style={{ padding: 6 }}>
        {invoices.length === 0 ? (
          <Text style={s.none}>Aucune facture reliée à votre numéro pour le moment.</Text>
        ) : invoices.slice(0, 8).map((i, idx) => {
          const [lbl, kind] = STATUS[i.status] || STATUS.IMPAYE;
          const other = i.role === 'dest' ? (i.counterpart || '') : (i.counterpart || '');
          return (
            <TouchableOpacity key={idx} style={[s.row, idx > 0 && s.rowBorder]} onPress={() => onOpenInvoice && onOpenInvoice(i.reference)} activeOpacity={0.7}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={s.ref}>{i.reference || '—'}</Text>
                  <Badge text={lbl} kind={kind} />
                </View>
                <Text style={s.sub} numberOfLines={1}>
                  {(i.role === 'dest' ? 'Expéditeur' : 'Destinataire')} : {other || '—'} · {fdate(i.date)}
                </Text>
              </View>
              <Text style={s.amt}>{fcfa(toFcfa(i.total, i.currency))}</Text>
            </TouchableOpacity>
          );
        })}
      </Card>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  kpis: { flexDirection: 'row', gap: 12, marginBottom: 6 },
  kpi: { flex: 1, alignItems: 'center', paddingVertical: 18 },
  kpiV: { fontSize: 22, fontWeight: '800', color: colors.blue },
  kpiL: { fontSize: 12, color: colors.muted, marginTop: 4, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.line },
  ref: { fontWeight: '800', color: colors.blue, fontSize: 14 },
  sub: { fontSize: 12, color: colors.muted, marginTop: 3 },
  amt: { fontWeight: '700', color: colors.ink },
  none: { padding: 18, color: colors.muted, textAlign: 'center' },
});
