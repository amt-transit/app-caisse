import React, { useState } from 'react';
import {
  View, Text, Image, TouchableOpacity, ActivityIndicator, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../auth/AuthContext';
import { useDemarcheur } from '../data/useDemarcheur';
import Background from '../components/Background';
import TabBar from '../components/TabBar';
import { colors, spacing } from '../theme';

import DashboardScreen from './DashboardScreen';
import ClientsScreen from './ClientsScreen';
import WalletScreen from './WalletScreen';
import FilleulsScreen from './FilleulsScreen';
import ProfilScreen from './ProfilScreen';

const LOGO = require('../../assets/logo.png');

export default function MainApp() {
  const { user, logout } = useAuth();
  const data = useDemarcheur();
  // À la connexion : on arrive directement sur « Clients » (demande client).
  const [tab, setTab] = useState('clients');

  if (data.loading) {
    return (
      <Background>
        <View style={styles.center}>
          <Image source={LOGO} style={styles.bigLogo} />
          <ActivityIndicator size="large" color={colors.gold} style={{ marginTop: spacing.xl }} />
          <Text style={styles.muted}>Chargement de votre espace…</Text>
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
          <TouchableOpacity style={styles.retry} onPress={data.reload} activeOpacity={0.85}>
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

  const me = data.me;
  const prenom = me?.prenom || (user?.email ? user.email.split('@')[0] : 'Partenaire');

  const screens = {
    clients: <ClientsScreen data={data} />,
    dashboard: <DashboardScreen data={data} />,
    wallet: <WalletScreen data={data} />,
    filleuls: <FilleulsScreen data={data} />,
    profil: <ProfilScreen data={data} user={user} onLogout={logout} />,
  };

  return (
    <Background>
      <View style={styles.header}>
        <Image source={LOGO} style={styles.headerLogo} />
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={styles.hello}>Bonjour 👋</Text>
          <Text style={styles.name} numberOfLines={1}>{prenom}</Text>
        </View>
        <TouchableOpacity
          style={styles.walletChip}
          activeOpacity={0.85}
          onPress={() => setTab('wallet')}
        >
          <Ionicons name="wallet" size={14} color="#1A1206" />
          <Text style={styles.walletChipT}>
            {Number(me?.soldeDisponible || 0).toLocaleString('fr-FR')} F
          </Text>
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1 }}>{screens[tab]}</View>

      <TabBar active={tab} onChange={setTab} />
    </Background>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  bigLogo: { width: 96, height: 96, borderRadius: 48 },
  muted: { color: colors.textDim, marginTop: spacing.md, fontSize: 13 },
  errIcon: {
    width: 62, height: 62, borderRadius: 31,
    backgroundColor: 'rgba(229,32,42,0.12)',
    borderWidth: 1, borderColor: 'rgba(229,32,42,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  errText: { color: colors.textDim, textAlign: 'center', marginTop: spacing.lg, lineHeight: 21, fontSize: 14 },
  retry: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginTop: spacing.xl, backgroundColor: colors.gold,
    paddingVertical: 13, paddingHorizontal: 26, borderRadius: 12,
  },
  retryT: { color: '#1A1206', fontWeight: '800' },
  logoutGhost: { marginTop: spacing.lg, padding: spacing.md },
  logoutGhostT: { color: colors.textDim, fontWeight: '600' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 56, paddingHorizontal: spacing.xl, paddingBottom: spacing.md,
  },
  headerLogo: { width: 42, height: 42, borderRadius: 21 },
  hello: { color: colors.textDim, fontSize: 12.5 },
  name: { color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 1 },
  walletChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.gold, borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  walletChipT: { color: '#1A1206', fontWeight: '800', fontSize: 12.5 },
});
