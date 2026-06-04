// App AMT Clients (React Native / Expo).
// Navigation : barre du bas (Accueil/Suivi/Chat/Profil) + menu hamburger (☰)
// pour le reste (Dépôt, Devis, Stats, Factures, Notifications, Prochains
// départs). Cache persistant (affichage instantané + rafraîchissement silencieux).
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable, ScrollView, Image } from 'react-native';
import { useFonts } from 'expo-font';
import { APP_FONTS } from './src/fonts'; // charge + applique Comfortaa/Jost partout
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from './src/firebase';
import { api } from './src/api';
import { colors } from './src/theme';
import { registerPushToken } from './src/push';
import { getCache, setCache, clearCache } from './src/cache';
import { LangProvider, useLang } from './src/i18n';
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
import ContactsScreen from './src/screens/ContactsScreen';

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
  { key: 'contacts', icon: '📒', label: 'Carnet destinataires', senderOnly: true },
  { key: 'stats', icon: '📊', label: 'Statistiques' },
  { key: 'notifications', icon: '🔔', label: 'Notifications' },
  { key: 'departures', icon: '🚢', label: 'Prochains départs' },
];

const TITLES = {
  home: 'Accueil', tracking: 'Suivi des colis', requests: 'Dépôt / Récupération',
  quotes: 'Devis', chat: 'Messagerie', profile: 'Profil', invoices: 'Mes factures',
  stats: 'Statistiques', notifications: 'Notifications', departures: 'Prochains départs',
  contacts: 'Carnet de destinataires',
};

function AppInner() {
  const { t } = useLang();
  const [authed, setAuthed] = useState(!!auth.currentUser);
  const [tab, setTab] = useState('home');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [openInvoice, setOpenInvoice] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [visited, setVisited] = useState({ home: true }); // onglets déjà ouverts (keep-alive)
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

  // Garde en mémoire chaque onglet déjà ouvert (évite de tout recharger à
  // chaque clic). Un écran se monte une fois puis reste vivant en arrière-plan.
  useEffect(() => { if (!visited[tab]) setVisited((v) => ({ ...v, [tab]: true })); }, [tab]);

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

  // Le profil a été modifié (nom/adresse) -> on met à jour les données en
  // mémoire + le cache pour que l'en-tête, le menu et le formulaire de dépôt
  // reflètent le changement immédiatement (sans attendre un rechargement).
  const onProfileSaved = (upd) => {
    setData((d) => {
      if (!d) return d;
      const full = `${upd.prenom || ''} ${upd.nom || ''}`.trim();
      const merged = { ...d, profile: { ...(d.profile || {}), ...upd, name: full || (d.profile || {}).name } };
      setCache('home', merged);
      return merged;
    });
  };

  // VERROUILLER : garde la session Firebase + le PIN. Retour par code PIN (pas
  // de nouveau SMS). C'est l'action « normale » au quotidien.
  const lock = () => {
    cacheLoaded.current = false;
    setData(null); setTab('home'); setAuthed(false);
  };

  // SE DÉCONNECTER : ferme vraiment la session + oublie le PIN -> reconnexion
  // par SMS la prochaine fois. À réserver à « changer de compte ».
  const logout = async () => {
    try { await auth.signOut(); } catch (_) {}
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

  // Rend un écran seulement s'il a déjà été ouvert, puis le garde monté (on
  // bascule juste display none/flex) -> navigation instantanée, pas de rechargement.
  const pane = (key, node) => visited[key] ? (
    <View key={key} style={{ flex: 1, display: tab === key ? 'flex' : 'none' }}>{node}</View>
  ) : null;

  const menuItems = MENU.filter(m => !m.senderOnly || isSender);

  return (
    <View style={s.root}>
      <StatusBar style="light" />
      <LinearGradient colors={['#21426A', '#16293F']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.header}>
        <TouchableOpacity onPress={() => setMenuOpen(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.burger}>☰</Text>
        </TouchableOpacity>
        <Image source={require('./assets/logo.png')} style={s.hLogo} resizeMode="contain" />
        <View style={{ flex: 1 }}>
          <Text style={s.hTitle}>AMT TRANS'IT</Text>
          <Text style={s.hSub}>{t(TITLES[tab] || '')}</Text>
        </View>
      </LinearGradient>

      <View style={{ flex: 1 }}>
        {pane('home', <HomeScreen data={data} loading={loading} onRefresh={() => load(false)} onOpenInvoice={setOpenInvoice} onNavigate={go} isSender={isSender} />)}
        {pane('tracking', <TrackingScreen data={data} loading={loading} onRefresh={() => load(false)} active={tab === 'tracking'} />)}
        {pane('requests', <RequestsScreen selfName={selfName} selfAddress={profile.address || ''} selfPhone={phone} />)}
        {pane('quotes', <QuoteScreen agencies={(data && data.agencies) || []} />)}
        {pane('chat', <ChatScreen selfName={selfName} active={tab === 'chat'} />)}
        {pane('profile', <ProfileScreen data={data} phone={phone} onLock={lock} onLogout={logout} onProfileSaved={onProfileSaved} />)}
        {pane('invoices', <InvoicesScreen data={data} loading={loading} onRefresh={() => load(false)} onOpenInvoice={setOpenInvoice} />)}
        {pane('notifications', <NotificationsScreen />)}
        {pane('stats', <StatsScreen data={data} />)}
        {pane('departures', <DeparturesScreen />)}
        {pane('contacts', <ContactsScreen />)}
      </View>

      <View style={s.tabbar}>
        {BOTTOM_TABS.map(tt => (
          <TouchableOpacity key={tt.key} style={s.tab} onPress={() => setTab(tt.key)} activeOpacity={0.7}>
            <Text style={[s.tabIc, tab === tt.key && { opacity: 1 }]}>{tt.icon}</Text>
            <Text style={[s.tabLb, tab === tt.key && s.tabLbOn]}>{t(tt.label)}</Text>
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
                <Text style={s.dName}>{selfName || t('Client AMT')}</Text>
                <Text style={s.dPhone}>{phone}</Text>
              </View>
            </View>
            <ScrollView>
              {menuItems.map(m => (
                <TouchableOpacity key={m.key} style={s.dItem} onPress={() => go(m.key)} activeOpacity={0.7}>
                  <Text style={s.dIcon}>{m.icon}</Text>
                  <Text style={s.dLabel}>{t(m.label)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

export default function App() {
  // On attend que les polices de marque soient prêtes avant d'afficher (sinon
  // l'app démarrerait avec la police système puis basculerait visiblement).
  const [fontsLoaded] = useFonts(APP_FONTS);
  if (!fontsLoaded) return null; // l'écran de démarrage (splash) reste affiché
  return (
    <LangProvider>
      <AppInner />
    </LangProvider>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.blue, paddingTop: 50, paddingBottom: 14, paddingHorizontal: 18, borderBottomWidth: 2, borderBottomColor: colors.gold },
  burger: { color: '#fff', fontSize: 24, fontWeight: '800' },
  hLogo: { width: 38, height: 38 },
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
