import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ScreenScroll, ScreenTitle, Card, Row, Empty,
} from '../components/ui';
import { colors, spacing, radius } from '../theme';

export default function ClientsScreen({ data }) {
  const { clients, refreshing, refresh } = data;
  const [q, setQ] = useState('');

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
        subtitle="Les clients pour lesquels vous percevez une commission"
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
            sub={c.phone || ''}
          />
        ))}
      </Card>
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.bgChip, borderWidth: 1, borderColor: colors.glassBorder,
    borderRadius: radius.md, paddingHorizontal: spacing.lg, height: 48,
    marginBottom: spacing.lg,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 14, height: '100%' },
});
