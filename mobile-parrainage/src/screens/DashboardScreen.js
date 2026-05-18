import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ScreenScroll, Card, SectionTitle, Row, Badge, Empty,
} from '../components/ui';
import { colors, spacing, radius, shadow, fcfa, fdate } from '../theme';

export default function DashboardScreen({ data }) {
  const { me, commissions, clients, filleuls, refreshing, refresh } = data;
  const totalRetire = Number(me?.totalRetire || 0);

  return (
    <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
      <View style={[styles.hero, shadow.gold]}>
        <Text style={styles.heroLabel}>SOLDE À PERCEVOIR</Text>
        <Text style={styles.heroValue}>{fcfa(me?.soldeDisponible)}</Text>
        <Text style={styles.heroFoot}>Partenaire AMT Transit Cargo</Text>
      </View>

      <View style={styles.statRow}>
        <Stat icon="trending-up" bg={colors.greenDeep} color={colors.green}
          value={fcfa(me?.totalGagne)} label="Total généré" />
        <Stat icon="cash-outline" bg={colors.amberDeep} color={colors.amber}
          value={fcfa(totalRetire)} label="Déjà retiré" />
      </View>
      <View style={styles.statRow}>
        <Stat icon="people-outline" bg="rgba(242,163,18,0.15)" color={colors.gold}
          value={clients.length} label="Clients affiliés" />
        <Stat icon="git-network-outline" bg="rgba(242,163,18,0.15)" color={colors.gold}
          value={filleuls.length} label="Filleuls" />
      </View>

      <SectionTitle icon="wallet-outline" title="Dernières commissions" count={commissions.length} />
      <Card>
        {commissions.length === 0 && <Empty text="Aucune commission enregistrée." />}
        {commissions.slice(0, 6).map((c, i, arr) => {
          const paid = c.statut === 'paye' || c.statut === 'retire';
          return (
            <Row
              key={c.id}
              last={i === arr.length - 1}
              icon={c.type === 'parrainage' ? 'gift-outline' : 'cash-outline'}
              iconBg={paid ? colors.greenDeep : colors.amberDeep}
              iconColor={paid ? colors.green : colors.amber}
              main={fcfa(c.montantNet)}
              sub={`${c.type === 'parrainage' ? 'Bonus parrainage' : 'Commission directe'} · ${fdate(c.dateCreation)}`}
              right={<Badge text={paid ? 'Payée' : 'En attente'} tone={paid ? 'paid' : 'wait'} />}
            />
          );
        })}
      </Card>

      <Text style={styles.tip}>
        <Ionicons name="information-circle-outline" size={12} color={colors.textFaint} />
        {'  '}Onglet « Wallet » pour demander un transfert de vos gains.
      </Text>
    </ScreenScroll>
  );
}

function Stat({ icon, bg, color, value, label }) {
  return (
    <View style={styles.stat}>
      <View style={[styles.statIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.gold, borderRadius: radius.lg,
    padding: spacing.xl, marginBottom: spacing.md,
  },
  heroLabel: { color: '#5A3F05', fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  heroValue: { color: '#1A1206', fontSize: 30, fontWeight: '900', marginTop: spacing.sm },
  heroFoot: { color: '#5A3F05', fontSize: 12.5, fontWeight: '700', marginTop: spacing.md },

  statRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  stat: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder,
    borderRadius: radius.md, padding: spacing.lg,
  },
  statIcon: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
  statValue: { color: colors.text, fontSize: 15, fontWeight: '800' },
  statLabel: { color: colors.textDim, fontSize: 11.5, marginTop: 2 },

  tip: { color: colors.textFaint, fontSize: 12, textAlign: 'center', marginTop: spacing.xs },
});
