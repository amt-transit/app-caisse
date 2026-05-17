import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, RefreshControl, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  doc, getDoc, collection, query, where, getDocs,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useAuth } from '../auth/AuthContext';
import Background from '../components/Background';
import { colors, spacing, radius, shadow, fcfa, fdate } from '../theme';

const LOGO = require('../../assets/logo.png');

export default function HomeScreen() {
  const { user, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [me, setMe] = useState(null);
  const [commissions, setCommissions] = useState([]);
  const [filleuls, setFilleuls] = useState([]);
  const [clients, setClients] = useState([]);

  const load = useCallback(async () => {
    setError('');
    try {
      // Claims posés par provisionDemarcheurAuth (forcer le rafraîchissement
      // du jeton pour récupérer les claims les plus récents).
      const tok = await auth.currentUser.getIdTokenResult(true);
      const demId = tok.claims && tok.claims.demarcheurId;
      const role = tok.claims && tok.claims.role;

      if (role !== 'demarcheur' || !demId) {
        setError("Ce compte n'est pas un compte partenaire. Contactez votre agence.");
        setLoading(false);
        return;
      }

      const meSnap = await getDoc(doc(db, 'demarcheurs', demId));
      setMe(meSnap.exists() ? { id: meSnap.id, ...meSnap.data() } : null);

      const [cSnap, fSnap, aSnap] = await Promise.all([
        getDocs(query(collection(db, 'commissions'), where('demarcheurId', '==', demId))),
        getDocs(query(collection(db, 'demarcheurs'), where('parrainId', '==', demId))),
        getDocs(query(collection(db, 'client_affiliations'), where('demarcheurId', '==', demId))),
      ]);

      const cList = cSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      cList.sort((a, b) => {
        const da = a.dateCreation && a.dateCreation.toDate ? a.dateCreation.toDate() : new Date(a.dateCreation || 0);
        const dbb = b.dateCreation && b.dateCreation.toDate ? b.dateCreation.toDate() : new Date(b.dateCreation || 0);
        return dbb - da;
      });
      setCommissions(cList);
      setFilleuls(fSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setClients(aSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      setError("Impossible de charger vos données. Vérifiez votre connexion et réessayez.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (loading) {
    return (
      <Background>
        <View style={styles.center}>
          <Image source={LOGO} style={styles.loadLogo} />
          <ActivityIndicator size="large" color={colors.gold} style={{ marginTop: spacing.xl }} />
          <Text style={styles.muted}>Chargement de votre espace…</Text>
        </View>
      </Background>
    );
  }

  if (error) {
    return (
      <Background>
        <View style={styles.center}>
          <View style={styles.errIconWrap}>
            <Ionicons name="warning-outline" size={32} color={colors.redSoft} />
          </View>
          <Text style={styles.errText}>{error}</Text>
          <TouchableOpacity style={styles.retry} onPress={load} activeOpacity={0.85}>
            <Ionicons name="refresh" size={18} color="#1A1206" />
            <Text style={styles.retryT}>Réessayer</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutGhost} onPress={logout}>
            <Text style={styles.logoutGhostT}>Se déconnecter</Text>
          </TouchableOpacity>
        </View>
      </Background>
    );
  }

  const name = me ? `${me.prenom || ''} ${me.nom || ''}`.trim() || user?.email : user?.email;
  const initials = (name || '?')
    .split(' ')
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <Background>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.gold}
            colors={[colors.gold]}
          />
        }
      >
        {/* En-tête */}
        <View style={styles.header}>
          <Image source={LOGO} style={styles.headerLogo} />
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text style={styles.hello}>Bonjour 👋</Text>
            <Text style={styles.name} numberOfLines={1}>{name}</Text>
          </View>
          <TouchableOpacity style={styles.iconBtn} onPress={logout} hitSlop={8}>
            <Ionicons name="log-out-outline" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Carte solde (hero) */}
        <View style={[styles.hero, shadow.gold]}>
          <Text style={styles.heroLabel}>SOLDE À PERCEVOIR</Text>
          <Text style={styles.heroValue}>{fcfa(me?.soldeDisponible)}</Text>
          <View style={styles.heroFootRow}>
            <View style={styles.heroAvatar}>
              <Text style={styles.heroAvatarT}>{initials}</Text>
            </View>
            <Text style={styles.heroFoot}>Partenaire AMT Transit Cargo</Text>
          </View>
        </View>

        {/* Stat secondaire */}
        <View style={styles.statRow}>
          <View style={styles.stat}>
            <View style={[styles.statIcon, { backgroundColor: colors.greenDeep }]}>
              <Ionicons name="trending-up" size={18} color={colors.green} />
            </View>
            <View>
              <Text style={styles.statValue}>{fcfa(me?.totalGagne)}</Text>
              <Text style={styles.statLabel}>Total généré</Text>
            </View>
          </View>
          <View style={styles.stat}>
            <View style={[styles.statIcon, { backgroundColor: 'rgba(242,163,18,0.15)' }]}>
              <Ionicons name="cash-outline" size={18} color={colors.gold} />
            </View>
            <View>
              <Text style={styles.statValue}>{commissions.length}</Text>
              <Text style={styles.statLabel}>Commissions</Text>
            </View>
          </View>
        </View>

        {/* Clients affiliés */}
        <Section icon="people-outline" title="Mes clients affiliés" count={clients.length} />
        <View style={styles.card}>
          {clients.length === 0 && <Empty text="Aucun client affilié pour l'instant." />}
          {clients.map((c, i) => (
            <Row
              key={c.id}
              last={i === clients.length - 1}
              avatar={(c.clientName || c.phone || '?')[0]?.toUpperCase()}
              main={c.clientName || c.phone || c.id}
              sub={c.phone || ''}
            />
          ))}
        </View>

        {/* Filleuls */}
        <Section icon="git-network-outline" title="Mes filleuls" count={filleuls.length} />
        <View style={styles.card}>
          {filleuls.length === 0 && <Empty text="Aucun filleul." />}
          {filleuls.map((f, i) => {
            const fn = `${f.prenom || ''} ${f.nom || ''}`.trim() || f.id;
            return (
              <Row
                key={f.id}
                last={i === filleuls.length - 1}
                avatar={fn[0]?.toUpperCase()}
                main={fn}
                sub={f.telephone || ''}
              />
            );
          })}
        </View>

        {/* Commissions */}
        <Section icon="wallet-outline" title="Mes commissions" count={commissions.length} />
        <View style={styles.card}>
          {commissions.length === 0 && <Empty text="Aucune commission enregistrée." />}
          {commissions.slice(0, 50).map((c, i, arr) => {
            const paid = c.statut === 'paye';
            return (
              <View
                key={c.id}
                style={[styles.row, i === arr.length - 1 && styles.rowLast]}
              >
                <View style={[styles.comIcon, { backgroundColor: paid ? colors.greenDeep : colors.amberDeep }]}>
                  <Ionicons
                    name={c.type === 'parrainage' ? 'gift-outline' : 'cash-outline'}
                    size={16}
                    color={paid ? colors.green : colors.amber}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Text style={styles.rowMain}>{fcfa(c.montantNet)}</Text>
                  <Text style={styles.rowSub}>
                    {c.type === 'parrainage' ? 'Bonus parrainage' : 'Commission directe'} · {fdate(c.dateCreation)}
                  </Text>
                </View>
                <View
                  style={[
                    styles.badge,
                    { backgroundColor: paid ? 'rgba(52,211,153,0.14)' : 'rgba(251,191,36,0.14)' },
                  ]}
                >
                  <Text style={[styles.badgeT, { color: paid ? colors.green : colors.amber }]}>
                    {paid ? 'Payée' : 'En attente'}
                  </Text>
                </View>
              </View>
            );
          })}
          {commissions.length > 50 && (
            <Empty text={`… et ${commissions.length - 50} de plus`} />
          )}
        </View>

        <Text style={styles.foot}>
          Tirez vers le bas pour rafraîchir · Lecture seule
        </Text>
      </ScrollView>
    </Background>
  );
}

/* ---- Sous-composants ---- */

function Section({ icon, title, count }) {
  return (
    <View style={styles.section}>
      <Ionicons name={icon} size={17} color={colors.gold} />
      <Text style={styles.sectionT}>{title}</Text>
      <View style={styles.countPill}>
        <Text style={styles.countPillT}>{count}</Text>
      </View>
    </View>
  );
}

function Row({ avatar, main, sub, last }) {
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <View style={styles.avatar}>
        <Text style={styles.avatarT}>{avatar || '?'}</Text>
      </View>
      <View style={{ flex: 1, marginLeft: spacing.md }}>
        <Text style={styles.rowMain} numberOfLines={1}>{main}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
    </View>
  );
}

function Empty({ text }) {
  return <Text style={styles.empty}>{text}</Text>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  loadLogo: { width: 88, height: 88, borderRadius: 44 },
  muted: { color: colors.textDim, marginTop: spacing.md, fontSize: 13 },

  errIconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(229,32,42,0.12)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(229,32,42,0.3)',
  },
  errText: { color: colors.textDim, textAlign: 'center', marginTop: spacing.lg, lineHeight: 21, fontSize: 14 },
  retry: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginTop: spacing.xl, backgroundColor: colors.gold,
    paddingVertical: 13, paddingHorizontal: 26, borderRadius: radius.md,
  },
  retryT: { color: '#1A1206', fontWeight: '800' },
  logoutGhost: { marginTop: spacing.lg, padding: spacing.md },
  logoutGhostT: { color: colors.textDim, fontWeight: '600' },

  container: { padding: spacing.xl, paddingTop: 60, paddingBottom: 44 },

  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl },
  headerLogo: { width: 46, height: 46, borderRadius: 23 },
  hello: { color: colors.textDim, fontSize: 13 },
  name: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 1 },
  iconBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: colors.glass,
    borderWidth: 1, borderColor: colors.glassBorder,
    alignItems: 'center', justifyContent: 'center',
  },

  hero: {
    backgroundColor: colors.gold,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginBottom: spacing.md,
  },
  heroLabel: { color: '#5A3F05', fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  heroValue: { color: '#1A1206', fontSize: 30, fontWeight: '900', marginTop: spacing.sm },
  heroFootRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg },
  heroAvatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(26,18,6,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroAvatarT: { color: '#1A1206', fontWeight: '800', fontSize: 12 },
  heroFoot: { color: '#5A3F05', fontSize: 12.5, fontWeight: '700', marginLeft: spacing.sm },

  statRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xl },
  stat: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.glass,
    borderWidth: 1, borderColor: colors.glassBorder,
    borderRadius: radius.md, padding: spacing.lg,
  },
  statIcon: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
  statValue: { color: colors.text, fontSize: 15, fontWeight: '800' },
  statLabel: { color: colors.textDim, fontSize: 11.5, marginTop: 2 },

  section: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginBottom: spacing.md, marginTop: spacing.sm,
  },
  sectionT: { color: colors.text, fontSize: 15.5, fontWeight: '800', flex: 1 },
  countPill: {
    backgroundColor: colors.glassStrong,
    borderWidth: 1, borderColor: colors.glassBorder,
    borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3,
  },
  countPillT: { color: colors.gold, fontSize: 12, fontWeight: '800' },

  card: {
    backgroundColor: colors.glass,
    borderWidth: 1, borderColor: colors.glassBorder,
    borderRadius: radius.md, padding: spacing.xs,
    marginBottom: spacing.xl,
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline,
  },
  rowLast: { borderBottomWidth: 0 },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: colors.bgChip,
    borderWidth: 1, borderColor: colors.glassBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarT: { color: colors.gold, fontWeight: '800', fontSize: 14 },
  comIcon: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
  rowMain: { color: colors.text, fontSize: 14.5, fontWeight: '700' },
  rowSub: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  badge: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  badgeT: { fontSize: 10.5, fontWeight: '800' },
  empty: { color: colors.textFaint, fontSize: 13, padding: spacing.lg, textAlign: 'center' },

  foot: { textAlign: 'center', color: colors.textFaint, fontSize: 11.5, marginTop: spacing.sm },
});
