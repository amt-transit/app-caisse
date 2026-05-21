import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '../components/Icon';
import {
  ScreenScroll, ScreenTitle, Card, Row, Empty,
} from '../components/ui';
import DetailSheet from '../components/DetailSheet';
import { colors, spacing, font, fcfa } from '../theme';

export default function FilleulsScreen({ data }) {
  const { filleuls, refreshing, refresh } = data;
  const [sel, setSel] = useState(null);

  const totalBonus = filleuls.reduce((t, f) => t + (Number(f.totalBonus) || 0), 0);
  const totalDispo = filleuls.reduce((t, f) => t + (Number(f.totalBonusDisponible) || 0), 0);
  const totalPot = filleuls.reduce((t, f) => t + (Number(f.totalBonusPotentiel) || 0), 0);

  return (
    <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
      <ScreenTitle
        icon="git-network"
        title="Mes filleuls"
        subtitle="Les partenaires que vous avez parrainés — touchez pour voir le bonus qu'ils vous rapportent"
      />

      {filleuls.length > 0 && (
        <View style={styles.banner}>
          <Ionicons name="gift" size={18} color={colors.goldLight} />
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text style={styles.bannerL}>Bonus disponible (retirable)</Text>
            <Text style={styles.bannerV}>{fcfa(totalDispo)}</Text>
            {totalPot > 0 && (
              <Text style={styles.bannerSub}>+ {fcfa(totalPot)} en attente de solde</Text>
            )}
          </View>
          <View style={styles.count}>
            <Text style={styles.countV}>{filleuls.length}</Text>
            <Text style={styles.countL}>filleul{filleuls.length > 1 ? 's' : ''}</Text>
          </View>
        </View>
      )}

      <Card>
        {filleuls.length === 0 && (
          <Empty text="Aucun filleul pour l'instant. Parlez d'AMT autour de vous : chaque partenaire que vous parrainez vous rapporte un bonus." />
        )}
        {filleuls.map((f, i) => {
          const name = `${f.prenom || ''} ${f.nom || ''}`.trim() || f.id;
          return (
            <Row
              key={f.id}
              last={i === filleuls.length - 1}
              avatar={name[0]?.toUpperCase()}
              main={name}
              sub={`${f.telephone || '—'} · ${f.nbEnvois} envoi${f.nbEnvois > 1 ? 's' : ''} avec bonus`}
              right={
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.amt}>{fcfa(f.totalBonusDisponible)}</Text>
                  <Text style={styles.amtL}>
                    {f.totalBonusPotentiel > 0
                      ? `+ ${fcfa(f.totalBonusPotentiel)} en attente`
                      : 'disponible'}
                  </Text>
                </View>
              }
              onPress={() => setSel(f)}
            />
          );
        })}
      </Card>

      <DetailSheet
        visible={!!sel}
        onClose={() => setSel(null)}
        avatar={`${sel?.prenom || ''} ${sel?.nom || ''}`.trim()[0] || '?'}
        title={`${sel?.prenom || ''} ${sel?.nom || ''}`.trim() || sel?.id || ''}
        subtitle={[
          sel?.telephone,
          'Filleul que vous avez parrainé',
        ].filter(Boolean).join(' · ')}
        stats={sel ? [
          { label: 'Disponible', value: fcfa(sel.totalBonusDisponible), tint: colors.green },
          { label: 'En attente', value: fcfa(sel.totalBonusPotentiel), tint: colors.amber },
          { label: 'Envois', value: String(sel.nbEnvois) },
        ] : []}
        envois={sel?.envois || []}
        gainLabel="Votre bonus"
        emptyText="Ce filleul n'a pas encore généré de bonus. Dès qu'il facture un client, vous toucherez un pourcentage."
      />
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(242,163,18,0.10)',
    borderWidth: 1, borderColor: colors.glassBorderStrong,
    borderRadius: 18, padding: spacing.lg, marginBottom: spacing.lg,
  },
  bannerL: { color: colors.textDim, fontSize: 12, fontFamily: font.body },
  bannerV: { color: colors.goldLight, fontSize: 19, fontFamily: font.num, marginTop: 3 },
  bannerSub: { color: colors.amber, fontSize: 11.5, fontFamily: font.body, marginTop: 3 },
  count: { alignItems: 'center', paddingLeft: spacing.md },
  countV: { color: colors.text, fontSize: 18, fontFamily: font.display },
  countL: { color: colors.textDim, fontSize: 11, fontFamily: font.body },
  amt: { color: colors.goldLight, fontSize: 14, fontFamily: font.num },
  amtL: { color: colors.textFaint, fontSize: 10.5, marginTop: 2, fontFamily: font.body },
});
