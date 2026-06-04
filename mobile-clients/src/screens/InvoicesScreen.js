// Écran MES FACTURES : liste complète + recherche (référence, contrepartie).
import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { Card, Badge, Loading, Empty } from '../components/ui';
import { colors, fcfa, fdate } from '../theme';
import { useLang } from '../i18n';

const TAUX = 655.957;
const toFcfa = (v, cur) => (cur === 'EUR' ? (v || 0) * TAUX : (v || 0));
const STATUS = { PAYE: ['Payé', 'paid'], PARTIEL: ['Acompte', 'wait'], IMPAYE: ['Impayé', 'bad'] };
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export default function InvoicesScreen({ data, loading, onRefresh, onOpenInvoice }) {
  const { t } = useLang();
  const [q, setQ] = useState('');
  if (loading && !data) return <Loading text={t('Chargement…')} />;
  const invoices = (data && data.invoices) || [];
  const term = norm(q.trim());
  const list = !term ? invoices : invoices.filter(i =>
    norm(`${i.reference} ${i.counterpart}`).includes(term));

  return (
    <View style={{ flex: 1 }}>
      <View style={s.searchBar}>
        <Text style={s.searchIc}>🔍</Text>
        <TextInput style={s.search} value={q} onChangeText={setQ} placeholder={t('Rechercher une facture…')} placeholderTextColor={colors.muted} />
        {!!q && <TouchableOpacity onPress={() => setQ('')}><Text style={s.clear}>✕</Text></TouchableOpacity>}
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={!!loading} onRefresh={onRefresh} tintColor={colors.blue} />}>
        {list.length === 0 ? (
          <Empty icon="🧾" text={q ? t('Aucune facture ne correspond.') : t('Aucune facture pour le moment.')} />
        ) : (
          <Card style={{ padding: 6 }}>
            {list.map((i, idx) => {
              const [lbl, kind] = STATUS[i.status] || STATUS.IMPAYE;
              return (
                <TouchableOpacity key={idx} style={[s.row, idx > 0 && s.rowBorder]} onPress={() => onOpenInvoice(i.reference)} activeOpacity={0.7}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={s.ref}>{i.reference || '—'}</Text>
                      <Badge text={t(lbl)} kind={kind} />
                    </View>
                    <Text style={s.sub} numberOfLines={1}>
                      {(i.role === 'dest' ? t('Exp.') : t('Dest.'))} : {i.counterpart || '—'} · {fdate(i.date)}
                    </Text>
                  </View>
                  <Text style={s.amt}>{fcfa(toFcfa(i.total, i.currency))}</Text>
                </TouchableOpacity>
              );
            })}
          </Card>
        )}
        <Text style={s.count}>{list.length} {t('facture(s)')}</Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: colors.line, paddingHorizontal: 16, paddingVertical: 10 },
  searchIc: { fontSize: 15 },
  search: { flex: 1, fontSize: 15, color: colors.ink, paddingVertical: 4 },
  clear: { color: colors.muted, fontSize: 16, paddingHorizontal: 4 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.line },
  ref: { fontWeight: '800', color: colors.blue, fontSize: 14 },
  sub: { fontSize: 12, color: colors.muted, marginTop: 3 },
  amt: { fontWeight: '700', color: colors.ink },
  count: { textAlign: 'center', color: colors.muted, fontSize: 12, marginTop: 10 },
});
