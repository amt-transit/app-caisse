// App AMT Clients (React Native / Expo).
// Navigation : barre du bas (Accueil/Suivi/Chat/Profil) + menu hamburger (☰)
// pour le reste (Dépôt, Devis, Stats, Factures, Notifications, Prochains
// départs). Cache persistant (affichage instantané + rafraîchissement silencieux).
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable, ScrollView, Image } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { signOut } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from './src/firebase';
import { api } from './src/api';
import { colors } from './src/theme';
import { registerPushToken } from './src/push';
import { getCache, setCache, clearCache } from './src/cache';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import TrackingScreen from './src/screens/TrackingScreen';
import RequestsScreen from './src/screens/RequestsScreen';
import QuoteScreen from './src/screens/QuoteScreen';
import ChatScreen from './src/screens/ChatScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import InvoiceDetailScreen from './src/screens/InvoiceDetailScreen';
import InvoicesScreen from './src/screens/InvoicesScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import StatsScreen from './src/screens/StatsScreen';
import DeparturesScreen from './src/screens/DeparturesScreen';

// Onglets de la barre du bas (le quotidien).
const BOTTOM_TABS = [
  { key: 'home', icon: '🏠', label: 'Accueil' },
  { key: 'tracking', icon: '🚚', label: 'Suivi' },
  { key: 'chat', icon: '💬', label: 'Chat' },
  { key: 'profile', icon: '👤', label: 'Profil' },
];
// Entrées du menu hamburger (accès moins fréquents). senderOnly = expéditeurs.
const MENU = [
  { key: 'requests', icon: '📦', label: 'Dépôt / Récupération', senderOnly: true },
  { key: 'invoices', icon: '🧾', label: 'Mes factures' },
  { key: 'quotes', icon: '🧮', label: 'Faire un devis' },
  { key: 'stats', icon: '📊', label: 'Statistiques' },
  { key: 'notifications', icon: '🔔', label: 'Notifications' },
  { key: 'departures', icon: '🚢', label: 'Prochains départs' },
];

const TITLES = {
  home: 'Accueil', tracking: 'Suivi des colis', requests: 'Dépôt / Récupération',
  quotes: 'Devis', chat: 'Messagerie', profile: 'Profil', invoices: 'Mes factures',
  stats: 'Statistiques', notifications: 'Notifications', departures: 'Prochains départs',
};

export default function App() {
  const [authed, setAuthed] = useState(!!auth.currentUser);
  const [tab, setTab] = useState('home');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [openInvoice, setOpenInvoice] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const cacheLoaded = useRef(false);

  // Chargement : 1) cache (instantané) 2) réseau (silencieux) -> maj + cache.
  const load = useCallback(async (silent) => {
    if (!silent) setLoading(true);
    try {
      const fresh = await api.getMyInvoices();
      setData(fresh);
      setCache('home', fresh);
    } catch (e) { console.warn('getMyInvoices:', e?.code, e?.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!authed) return;
    (async () => {
      // Affiche le cache d'abord (pas d'écran blanc), puis rafraîchit en fond.
      if (!cacheLoaded.current) {
        cacheLoaded.current = true;
        const cached = await getCache('home');
        if (cached) setData(cached);
        load(!!cached);          // silencieux si on avait déjà du cache
      }
      registerPushToken();
    })();
  }, [authed, load]);

  const logout = async () => {
    try { await signOut(auth); } catch (_) {}
    await AsyncStorage.multiRemove(['amtc_registered', 'amtc_pin']);
    await clearCache();
    cacheLoaded.current = false;
    setData(null); setTab('home'); setAuthed(false);
  };

  if (!authed) {
    return (<><StatusBar style="light" /><LoginScreen onAuthed={() => setAuthed(true)} /></>);
  }
  if (openInvoice) {
    return (<><StatusBar style="light" /><InvoiceDetailScreen reference={openInvoice} onBack={() => setOpenInvoice(null)} /></>);
  }

  const phone = auth.currentUser?.phoneNumber || '';
  const profile = (data && data.profile) || {};
  const selfName = `${profile.prenom || ''} ${profile.nom || ''}`.trim() || profile.name || '';
  const isSender = (data?.invoices || []).some(i => i.role === 'exp' || i.role === 'both')
    || phone.replace(/\D/g, '').startsWith('33')
    || ((data?.loyalty?.sentAsSender || 0) > 0);

  const go = (key) => { setMenuOpen(false); setTab(key); };

  const menuItems = MENU.filter(m => !m.senderOnly || isSender);

  return (
    <View style={s.root}>
      <StatusBar style="light" />
      <View style={s.header}>
        <TouchableOpacity onPress={() => setMenuOpen(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.burger}>☰</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.hTitle}>AMT TRANS'IT</Text>
          <Text style={s.hSub}>{TITLES[tab] || ''}</Text>
        </View>
      </View>

      <View style={{ flex: 1 }}>
        {tab === 'home' && <HomeScreen data={data} loading={loading} onRefresh={() => load(false)} onOpenInvoice={setOpenInvoice} onNavigate={go} isSender={isSender} />}
        {tab === 'tracking' && <TrackingScreen data={data} loading={loading} onRefresh={() => load(false)} />}
        {tab === 'requests' && <RequestsScreen selfName={selfName} selfAddress={profile.address || ''} selfPhone={phone} />}
        {tab === 'quotes' && <QuoteScreen />}
        {tab === 'chat' && <ChatScreen selfName={selfName} />}
        {tab === 'profile' && <ProfileScreen data={data} phone={phone} onLogout={logout} />}
        {tab === 'invoices' && <InvoicesScreen data={data} loading={loading} onRefresh={() => load(false)} onOpenInvoice={setOpenInvoice} />}
        {tab === 'notifications' && <NotificationsScreen />}
        {tab === 'stats' && <StatsScreen data={data} />}
        {tab === 'departures' && <DeparturesScreen />}
      </View>

      <View style={s.tabbar}>
        {BOTTOM_TABS.map(t => (
          <TouchableOpacity key={t.key} style={s.tab} onPress={() => setTab(t.key)} activeOpacity={0.7}>
            <Text style={[s.tabIc, tab === t.key && { opacity: 1 }]}>{t.icon}</Text>
            <Text style={[s.tabLb, tab === t.key && s.tabLbOn]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Menu hamburger (tiroir latéral) */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={s.drawerBackdrop} onPress={() => setMenuOpen(false)}>
          <Pressable style={s.drawer} onPress={(e) => e.stopPropagation()}>
            <View style={s.drawerHead}>
              {profile.photoUrl ? <Image source={{ uri: profile.photoUrl }} style={s.dAv} /> :
                <View style={s.dAvInit}><Text style={s.dAvTxt}>{(selfName || phone).slice(0, 2).toUpperCase()}</Text></View>}
              <View style={{ flex: 1 }}>
                <Text style={s.dName}>{selfName || 'Client AMT'}</Text>
                <Text style={s.dPhone}>{phone}</Text>
              </View>
            </View>
            <ScrollView>
              {menuItems.map(m => (
                <TouchableOpacity key={m.key} style={s.dItem} onPress={() => go(m.key)} activeOpacity={0.7}>
                  <Text style={s.dIcon}>{m.icon}</Text>
                  <Text style={s.dLabel}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.blue, paddingTop: 50, paddingBottom: 14, paddingHorizontal: 18, borderBottomWidth: 2, borderBottomColor: colors.gold },
  burger: { color: '#fff', fontSize: 24, fontWeight: '800' },
  hTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  hSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 2 },
  tabbar: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: colors.line, paddingBottom: 22, paddingTop: 8 },
  tab: { flex: 1, alignItems: 'center' },
  tabIc: { fontSize: 20, opacity: 0.5 },
  tabLb: { fontSize: 10, color: colors.muted, marginTop: 2, fontWeight: '600' },
  tabLbOn: { color: colors.blue, fontWeight: '800' },
  drawerBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', flexDirection: 'row' },
  drawer: { width: '78%', maxWidth: 320, backgroundColor: '#fff', paddingTop: 50 },
  drawerHead: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 18, backgroundColor: colors.blue },
  dAv: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: colors.gold },
  dAvInit: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: colors.gold, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  dAvTxt: { color: '#fff', fontWeight: '800' },
  dName: { color: '#fff', fontWeight: '800', fontSize: 15 },
  dPhone: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 },
  dItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: colors.line },
  dIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  dLabel: { fontSize: 15, fontWeight: '600', color: colors.ink },
});
