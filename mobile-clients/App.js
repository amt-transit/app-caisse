// App AMT Clients (React Native / Expo) — navigation par onglets.
// Données chargées via getMyInvoices (factures, colis, profil, agences,
// fidélité). Le Dépôt n'est visible que pour les expéditeurs (comme la PWA).
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { signOut } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from './src/firebase';
import { api } from './src/api';
import { colors } from './src/theme';
import { registerPushToken } from './src/push';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import TrackingScreen from './src/screens/TrackingScreen';
import RequestsScreen from './src/screens/RequestsScreen';
import QuoteScreen from './src/screens/QuoteScreen';
import ChatScreen from './src/screens/ChatScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import InvoiceDetailScreen from './src/screens/InvoiceDetailScreen';

const TABS = [
  { key: 'home', icon: '🏠', label: 'Accueil' },
  { key: 'tracking', icon: '🚚', label: 'Suivi' },
  { key: 'requests', icon: '📦', label: 'Dépôt', senderOnly: true },
  { key: 'quotes', icon: '🧾', label: 'Devis' },
  { key: 'chat', icon: '💬', label: 'Chat' },
  { key: 'profile', icon: '👤', label: 'Profil' },
];

export default function App() {
  const [authed, setAuthed] = useState(!!auth.currentUser);
  const [tab, setTab] = useState('home');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [openInvoice, setOpenInvoice] = useState(null); // référence facture ouverte (détail)

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await api.getMyInvoices()); }
    catch (e) { console.warn('getMyInvoices:', e?.code, e?.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (authed) { load(); registerPushToken(); } }, [authed, load]);

  const logout = async () => {
    try { await signOut(auth); } catch (_) {}
    await AsyncStorage.multiRemove(['amtc_registered', 'amtc_pin']);
    setData(null); setTab('home'); setAuthed(false);
  };

  if (!authed) {
    return (<><StatusBar style="light" /><LoginScreen onAuthed={() => setAuthed(true)} /></>);
  }

  // Détail facture (par-dessus les onglets) si une référence est ouverte.
  if (openInvoice) {
    return (<><StatusBar style="light" /><InvoiceDetailScreen reference={openInvoice} onBack={() => setOpenInvoice(null)} /></>);
  }

  const phone = auth.currentUser?.phoneNumber || '';
  const profile = (data && data.profile) || {};
  const selfName = `${profile.prenom || ''} ${profile.nom || ''}`.trim() || profile.name || '';
  // Expéditeur si au moins une facture en envoi, ou numéro français (+33).
  const isSender = (data?.invoices || []).some(i => i.role === 'exp' || i.role === 'both')
    || phone.replace(/\D/g, '').startsWith('33')
    || ((data?.loyalty?.sentAsSender || 0) > 0);

  const visibleTabs = TABS.filter(t => !t.senderOnly || isSender);
  const activeTab = visibleTabs.find(t => t.key === tab) ? tab : 'home';

  const TITLES = { home: 'Tableau de bord', tracking: 'Suivi des colis', requests: 'Dépôt / Récupération', quotes: 'Devis', chat: 'Messagerie', profile: 'Profil' };

  return (
    <View style={s.root}>
      <StatusBar style="light" />
      <View style={s.header}>
        <Text style={s.hTitle}>AMT TRANS'IT</Text>
        <Text style={s.hSub}>{TITLES[activeTab]}</Text>
      </View>

      <View style={{ flex: 1 }}>
        {activeTab === 'home' && <HomeScreen data={data} loading={loading} onRefresh={load} onOpenInvoice={(ref) => setOpenInvoice(ref)} />}
        {activeTab === 'tracking' && <TrackingScreen data={data} loading={loading} onRefresh={load} />}
        {activeTab === 'requests' && <RequestsScreen selfName={selfName} selfAddress={profile.address || ''} />}
        {activeTab === 'quotes' && <QuoteScreen />}
        {activeTab === 'chat' && <ChatScreen selfName={selfName} />}
        {activeTab === 'profile' && <ProfileScreen data={data} phone={phone} onLogout={logout} />}
      </View>

      <View style={s.tabbar}>
        {visibleTabs.map(t => (
          <TouchableOpacity key={t.key} style={s.tab} onPress={() => setTab(t.key)} activeOpacity={0.7}>
            <Text style={[s.tabIc, activeTab === t.key && { opacity: 1 }]}>{t.icon}</Text>
            <Text style={[s.tabLb, activeTab === t.key && s.tabLbOn]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { backgroundColor: colors.blue, paddingTop: 50, paddingBottom: 14, paddingHorizontal: 18, borderBottomWidth: 2, borderBottomColor: colors.gold },
  hTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  hSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 2 },
  tabbar: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: colors.line, paddingBottom: 22, paddingTop: 8 },
  tab: { flex: 1, alignItems: 'center' },
  tabIc: { fontSize: 20, opacity: 0.5 },
  tabLb: { fontSize: 10, color: colors.muted, marginTop: 2, fontWeight: '600' },
  tabLbOn: { color: colors.blue, fontWeight: '800' },
});
