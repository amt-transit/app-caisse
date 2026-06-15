import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, Image, TouchableOpacity, ActivityIndicator, StyleSheet, Alert, Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '../components/Icon';
import { useAuth } from '../auth/AuthContext';
import { useDemarcheur } from '../data/useDemarcheur';
import { requestPushPermissionManually } from '../notifications';
import Background from '../components/Background';
import LogoMark from '../components/LogoMark';
import TabBar from '../components/TabBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RouteChip } from '../components/RouteSwitcher';
import { colors, spacing, radius, font, grad, shadow } from '../theme';

import DashboardScreen from './DashboardScreen';
import FacturesScreen from './FacturesScreen';
import WalletScreen from './WalletScreen';
import FilleulsScreen from './FilleulsScreen';
import ProfilScreen from './ProfilScreen';

const LOGO = require('../../assets/logo.png');

export default function MainApp() {
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets(); // marges système (bord à bord Android 15)
  const data = useDemarcheur();
  // À la connexion : on arrive sur « Accueil » (1er onglet).
  const [tab, setTab] = useState('dashboard');

  // Filet de sécurité : si le chargement dépasse 8s (= cold start Cloud
  // Functions, réseau lent…), on propose de réessayer ou de se reconnecter.
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  useEffect(() => {
    if (!data.loading) { setLoadTimedOut(false); return; }
    const t = setTimeout(() => setLoadTimedOut(true), 8000);
    return () => clearTimeout(t);
  }, [data.loading]);

  // ── Onboarding notifications. IMPORTANT : ce hook doit être déclaré AVANT
  // tout return conditionnel (loading/error) — sinon le nombre de hooks change
  // entre deux rendus et React plante ("Rendered more hooks than during the
  // previous render"), ce qui fait fermer l'app en version release.
  // À la première ouverture, on propose d'activer les notifs si la fiche n'a
  // pas encore de pushToken.
  const promptShownRef = useRef(false);
  useEffect(() => {
    const me = data.me;
    if (!me) return; // attendre que la fiche soit chargée
    if (promptShownRef.current) return; // un seul prompt par session
    if (me.pushToken) return; // déjà activé, rien à faire
    promptShownRef.current = true;
    // Petit délai pour laisser l'écran d'accueil s'afficher avant l'alerte
    const t = setTimeout(() => {
      Alert.alert(
        '🔔 Activer les notifications',
        "Pour recevoir vos commissions et paiements en direct, activez les notifications. Vous pourrez le changer à tout moment depuis l'onglet Profil.",
        [
          { text: 'Plus tard', style: 'cancel' },
          {
            text: 'Activer',
            onPress: async () => {
              const res = await requestPushPermissionManually({
                demarcheurId: data.activeLink?.demarcheurId || me?.id,
                agency: data.activeLink?.agency || me?.agency,
              });
              if (res.status === 'granted') {
                Alert.alert('Notifications activées ✔', res.hint);
              } else if (res.status === 'denied' && res.reason === 'blocked_in_settings') {
                Alert.alert(
                  'Permission bloquée',
                  res.hint,
                  [
                    { text: 'Annuler', style: 'cancel' },
                    { text: 'Ouvrir les paramètres', onPress: () => Linking.openSettings() },
                  ],
                );
              } else if (res.status !== 'granted') {
                Alert.alert('Activation impossible', res.hint || "Vous pouvez réessayer depuis Profil.");
              }
            },
          },
        ],
      );
    }, 1200);
    return () => clearTimeout(t);
  }, [data.me?.id, data.me?.pushToken]);

  if (data.loading) {
    return (
      <Background>
        <View style={styles.center}>
          <LogoMark size={96} />
          <ActivityIndicator size="large" color={colors.gold} style={{ marginTop: spacing.xxl }} />
          <Text style={styles.muted}>Chargement de votre espace…</Text>
          {loadTimedOut && (
            <View style={{ marginTop: spacing.xl, alignItems: 'center', gap: spacing.md }}>
              <Text style={[styles.muted, { color: colors.amber, textAlign: 'center', paddingHorizontal: 30 }]}>
                Le chargement est plus long que prévu. Vous pouvez réessayer ou vous reconnecter.
              </Text>
              <TouchableOpacity
                style={[styles.retryWrap, shadow.gold]}
                onPress={() => { setLoadTimedOut(false); data.reload(); }}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={grad.gold}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.retry}
                >
                  <Ionicons name="refresh" size={18} color={colors.onGold} />
                  <Text style={styles.retryT}>Réessayer</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity style={styles.logoutGhost} onPress={logout}>
                <Text style={styles.logoutGhostT}>Se déconnecter</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Background>
    );
  }

  if (data.error) {
    return (
      <Background>
        <View style={styles.center}>
          <View style={styles.errIcon}>
            <Ionicons name="warning-outline" size={30} color={colors.redSoft} />
          </View>
          <Text style={styles.errText}>{data.error}</Text>
          <TouchableOpacity
            style={[styles.retryWrap, shadow.gold]}
            onPress={data.reload}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={grad.gold}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.retry}
            >
              <Ionicons name="refresh" size={18} color={colors.onGold} />
              <Text style={styles.retryT}>Réessayer</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutGhost} onPress={logout}>
            <Text style={styles.logoutGhostT}>Se déconnecter</Text>
          </TouchableOpacity>
        </View>
      </Background>
    );
  }

  const me = data.me;
  const prenom = me?.prenom || (user?.email ? user.email.split('@')[0] : 'Partenaire');

  const screens = {
    factures: <FacturesScreen data={data} />,
    dashboard: <DashboardScreen data={data} />,
    wallet: <WalletScreen data={data} />,
    filleuls: <FilleulsScreen data={data} />,
    profil: <ProfilScreen data={data} user={user} onLogout={logout} />,
  };

  return (
    <Background>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <View style={styles.logoRing}>
          <Image source={LOGO} style={styles.headerLogo} />
        </View>
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={styles.hello}>Bonjour 👋</Text>
          <Text style={styles.name} numberOfLines={1}>{prenom}</Text>
          {/* Sélecteur d'agence — visible UNIQUEMENT si le compte est rattaché
              à plusieurs routes. Le composant retourne null sinon. */}
          <View style={{ marginTop: 6 }}>
            <RouteChip
              links={data.links}
              activeLink={data.activeLink}
              onSwitch={data.switchRoute}
            />
          </View>
        </View>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setTab('wallet')}
          style={[styles.walletWrap, shadow.gold]}
        >
          <LinearGradient
            colors={grad.gold}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.walletChip}
          >
            <Ionicons name="wallet" size={14} color={colors.onGold} />
            <Text style={styles.walletChipT}>
              {Number(me?.soldeDisponible || 0).toLocaleString('fr-FR')} F
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1 }}>{screens[tab]}</View>

      <TabBar active={tab} onChange={setTab} />
    </Background>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  muted: { color: colors.textDim, marginTop: spacing.lg, fontSize: 13, fontFamily: font.body },

  errIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(229,31,33,0.14)',
    borderWidth: 1, borderColor: 'rgba(229,31,33,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  errText: {
    color: colors.textDim, textAlign: 'center', marginTop: spacing.lg,
    lineHeight: 21, fontSize: 14, fontFamily: font.body,
  },
  retryWrap: { borderRadius: 14, marginTop: spacing.xl, overflow: 'hidden' },
  retry: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 14, paddingHorizontal: 28,
  },
  retryT: { color: colors.onGold, fontFamily: font.bodyBold, fontSize: 14.5 },
  logoutGhost: { marginTop: spacing.lg, padding: spacing.md },
  logoutGhostT: { color: colors.textDim, fontFamily: font.bodyMed },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 58, paddingHorizontal: spacing.xl, paddingBottom: spacing.md,
  },
  logoRing: {
    width: 46, height: 46, borderRadius: 23, padding: 2,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: 'rgba(255,255,255,0.65)', // verre clair
    shadowColor: '#0B2540', shadowOpacity: 0.08,
    shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  headerLogo: { width: '100%', height: '100%', borderRadius: 21 },
  hello: { color: colors.textDim, fontSize: 12.5, fontFamily: font.body },
  name: { color: colors.text, fontSize: 18, fontFamily: font.displaySemi, marginTop: 1 },

  walletWrap: { borderRadius: radius.pill, overflow: 'hidden' },
  walletChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  walletChipT: { color: colors.onGold, fontFamily: font.bodyBold, fontSize: 12.5 },
});
