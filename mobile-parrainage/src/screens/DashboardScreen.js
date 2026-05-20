import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, LinearGradient as SvgGrad, Stop, Path, Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import {
  ScreenScroll, Card, SectionTitle, Row, Badge, Empty,
} from '../components/ui';
import LogoMark from '../components/LogoMark';
import { colors, spacing, radius, font, grad, shadow, fcfa, fdate } from '../theme';

// Compteur animé : le montant grimpe (l'« ascension »).
function useCountUp(target, duration = 1100) {
  const v = useRef(new Animated.Value(0)).current;
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = v.addListener(({ value }) => setN(Math.round(value)));
    v.setValue(0);
    Animated.timing(v, {
      toValue: Number(target) || 0,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => v.removeListener(id);
  }, [target]);
  return n;
}

export default function DashboardScreen({ data }) {
  const { me, commissions, clients, filleuls, refreshing, refresh } = data;
  const solde = Number(me?.soldeDisponible || 0);
  const potentiel = Number(me?.soldePotentiel || 0);
  const totalRetire = Number(me?.totalRetire || 0);
  const animated = useCountUp(solde);

  return (
    <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
      {/* ── Carte du solde : laque rouge de Chine + trajectoire d'or ── */}
      <LinearGradient
        colors={grad.lacquerRed}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, shadow.lacquer]}
      >
        {/* La courbe d'or qui grimpe en fond de carte */}
        <Svg
          width="100%"
          height="100%"
          viewBox="0 0 320 150"
          preserveAspectRatio="none"
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        >
          <Defs>
            <SvgGrad id="traj" x1="0" y1="1" x2="1" y2="0">
              <Stop offset="0" stopColor={colors.gold} stopOpacity="0.08" />
              <Stop offset="0.7" stopColor={colors.goldSoft} stopOpacity="0.5" />
              <Stop offset="1" stopColor={colors.goldSoft} stopOpacity="0.9" />
            </SvgGrad>
          </Defs>
          <Path
            d="M-4 142 C 70 138, 120 120, 175 88 S 270 30, 330 8"
            stroke="url(#traj)"
            strokeWidth="3.5"
            fill="none"
            strokeLinecap="round"
          />
          <Circle cx="305" cy="16" r="11" fill={colors.gold} opacity="0.18" />
          <Circle cx="305" cy="16" r="4.5" fill={colors.goldSoft} />
        </Svg>

        <View style={styles.heroTop}>
          <View style={styles.brandTag}>
            <View style={styles.dot} />
            <Text style={styles.brandTagT}>AMT · PARTENAIRE</Text>
          </View>
          <LogoMark size={42} glow={false} />
        </View>

        <Text style={styles.heroLabel}>VOTRE SOLDE DISPONIBLE</Text>
        <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit>
          {fcfa(animated)}
        </Text>

        {potentiel > 0 && (
          <View style={styles.potRow}>
            <Ionicons name="hourglass-outline" size={13} color="#FFE4C2" />
            <Text style={styles.potT}>
              + {fcfa(potentiel)} en attente (factures non soldées)
            </Text>
          </View>
        )}

        <View style={styles.heroFootRow}>
          <Ionicons name="information-circle-outline" size={13} color={colors.goldSoft} />
          <Text style={styles.heroFoot}>
            Vous percevez les commissions des factures déjà payées
          </Text>
        </View>
      </LinearGradient>

      {/* ── Statistiques ── */}
      <View style={styles.statRow}>
        <Stat icon="trending-up" tint={colors.green} bg={colors.greenWarm}
          value={fcfa(me?.totalGagne)} label="Total généré" />
        <Stat icon="cash-outline" tint={colors.amber} bg={colors.amberWarm}
          value={fcfa(totalRetire)} label="Déjà retiré" />
      </View>
      <View style={styles.statRow}>
        <Stat icon="people" tint={colors.gold} bg={colors.goldWarm}
          value={String(clients.length)} label="Clients affiliés" />
        <Stat icon="git-network" tint={colors.redSoft} bg={colors.redWarm}
          value={String(filleuls.length)} label="Filleuls" />
      </View>

      {/* ── Dernières commissions ── */}
      <SectionTitle icon="receipt-outline" title="Dernières commissions" count={commissions.length} />
      <Card>
        {commissions.length === 0 && <Empty text="Aucune commission pour l'instant — vos premiers gains s'afficheront ici." />}
        {commissions.slice(0, 6).map((c, i, arr) => {
          const paid = c.statut === 'paye' || c.statut === 'retire';
          return (
            <Row
              key={c.id}
              last={i === arr.length - 1}
              icon={c.type === 'parrainage' ? 'gift' : 'cash'}
              iconBg={paid ? colors.greenWarm : colors.amberWarm}
              iconColor={paid ? colors.green : colors.amber}
              main={fcfa(c.montantNet)}
              sub={`${c.type === 'parrainage' ? 'Bonus parrainage' : 'Commission directe'} · ${fdate(c.dateCreation)}`}
              right={<Badge text={paid ? 'Payée' : 'En attente'} tone={paid ? 'paid' : 'wait'} />}
            />
          );
        })}
      </Card>

      <View style={styles.tip}>
        <Ionicons name="information-circle-outline" size={13} color={colors.textFaint} />
        <Text style={styles.tipT}>Onglet « Wallet » pour demander un transfert de vos gains.</Text>
      </View>
    </ScreenScroll>
  );
}

function Stat({ icon, bg, tint, value, label }) {
  return (
    <View style={[styles.stat, shadow.soft]}>
      <View style={[styles.statIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={17} color={tint} />
      </View>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,198,142,0.22)',
    overflow: 'hidden',
    minHeight: 188,
  },
  heroTop: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  brandTag: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderWidth: 1, borderColor: 'rgba(255,210,170,0.22)',
    borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.goldSoft },
  brandTagT: { color: '#FFE4C2', fontSize: 10.5, fontFamily: font.bodyBold, letterSpacing: 1.5 },

  heroLabel: { color: '#FFD9B8', fontSize: 11, fontFamily: font.bodyBold, letterSpacing: 2 },
  heroValue: {
    color: '#FFFFFF', fontSize: 38, fontFamily: font.display,
    marginTop: spacing.sm, letterSpacing: 0.3,
  },
  potRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderWidth: 1, borderColor: 'rgba(255,210,170,0.22)',
    borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 6,
  },
  potT: { color: '#FFE4C2', fontSize: 12, fontFamily: font.bodyMed },
  heroFootRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md },
  heroFoot: { color: '#FFCDB0', fontSize: 12.5, fontFamily: font.bodyMed, flex: 1 },

  statRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  // Stat : carte BLANC FRANC opaque (et non plus dégradé translucide).
  stat: {
    flex: 1,
    backgroundColor: colors.bgElevated,
    borderWidth: 1, borderColor: colors.glassBorder,
    borderRadius: radius.md, padding: spacing.lg,
  },
  statIcon: {
    width: 38, height: 38, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md,
  },
  statValue: { color: colors.text, fontSize: 17, fontFamily: font.num },
  statLabel: { color: colors.textDim, fontSize: 11.5, marginTop: 4, fontFamily: font.body },

  tip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginTop: spacing.xs, paddingHorizontal: spacing.lg,
  },
  tipT: { color: colors.textFaint, fontSize: 12, textAlign: 'center', fontFamily: font.body },
});