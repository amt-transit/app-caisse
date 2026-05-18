import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ScreenScroll, ScreenTitle, Card, Row, Empty,
} from '../components/ui';
import DetailSheet from '../components/DetailSheet';
import { colors, spacing, radius, font, fcfa, fdate } from '../theme';

export default function ClientsScreen({ data }) {
  const { clients, unmatched = [], refreshing, refresh } = data;
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);

  const list = useMemo(() => {
    const s = q.toLowerCase().trim();
    if (!s) return clients;
    return clients.filter((c) =>
      `${c.clientName || ''} ${c.phone || ''}`.toLowerCase().includes(s));
  }, [clients, q]);

  return (
    <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
      <ScreenTitle
        icon="people"
        title="Mes clients affiliés"
        subtitle="Touchez un client pour voir tous ses envois et le détail de vos commissions"
      />

      <View style={styles.search}>
        <Ionicons name="search" size={16} color={colors.textDim} />
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher un client…"
          placeholderTextColor={colors.textFaint}
          value={q}
          onChangeText={setQ}
        />
      </View>

      <Card>
        {list.length === 0 && (
          <Empty text={clients.length === 0
            ? "Aucun client affilié pour l'instant."
            : 'Aucun client ne correspond à votre recherche.'} />
        )}
        {list.map((c, i) => (
          <Row
            key={c.id}
            last={i === list.length - 1}
            avatar={(c.clientName || c.phone || '?')[0]?.toUpperCase()}
            main={c.clientName || c.phone || c.id}
            sub={`${c.phone || '—'} · ${c.nbEnvois} envoi${c.nbEnvois > 1 ? 's' : ''}`}
            right={
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.amt}>{fcfa(c.totalDisponible)}</Text>
                <Text style={styles.amtL}>
                  {c.totalPotentiel > 0 ? `+ ${fcfa(c.totalPotentiel)} en attente` : 'disponible'}
                </Text>
              </View>
            }
            onPress={() => setSel(c)}
          />
        ))}
      </Card>

      {unmatched.length > 0 && (
        <View style={styles.note}>
          <Ionicons name="information-circle-outline" size={14} color={colors.textFaint} />
          <Text style={styles.noteT}>
            {unmatched.length} ancienne{unmatched.length > 1 ? 's' : ''} commission
            {unmatched.length > 1 ? 's' : ''} créée{unmatched.length > 1 ? 's' : ''} avant
            cette mise à jour n'{unmatched.length > 1 ? 'ont' : 'a'} pas le détail client.
            Visible{unmatched.length > 1 ? 's' : ''} dans Wallet › Mes commissions.
          </Text>
        </View>
      )}

      <DetailSheet
        visible={!!sel}
        onClose={() => setSel(null)}
        avatar={(sel?.clientName || sel?.phone || '?')[0]}
        title={sel?.clientName || sel?.phone || ''}
        subtitle={[
          sel?.phone,
          sel?.agency ? `Route ${sel.agency}` : null,
          sel?.createdAt ? `Affilié depuis le ${fdate(sel.createdAt)}` : null,
        ].filter(Boolean).join(' · ')}
        stats={sel ? [
          { label: 'Disponible', value: fcfa(sel.totalDisponible), tint: colors.green },
          { label: 'En attente', value: fcfa(sel.totalPotentiel), tint: colors.amber },
          { label: 'Total facturé', value: fcfa(sel.totalFacture) },
        ] : []}
        envois={sel?.envois || []}
        gainLabel="Votre commission"
        emptyText="Aucun envoi facturé pour ce client pour l'instant."
      />
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.bgChip, borderWidth: 1, borderColor: colors.glassBorder,
    borderRadius: radius.md, paddingHorizontal: spacing.lg, height: 50,
    marginBottom: spacing.lg,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 14, height: '100%', fontFamily: font.body },
  amt: { color: colors.goldLight, fontSize: 14, fontFamily: font.num },
  amtL: { color: colors.textFaint, fontSize: 10.5, marginTop: 2, fontFamily: font.body },
  note: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start',
    paddingHorizontal: spacing.sm, marginTop: spacing.xs,
  },
  noteT: { color: colors.textFaint, fontSize: 12, flex: 1, lineHeight: 17, fontFamily: font.body },
});
