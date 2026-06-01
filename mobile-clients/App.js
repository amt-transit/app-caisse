// App AMT Clients (React Native / Expo) — point d'entrée.
// ÉTAPE 1 du portage : valider la connexion SMS. Une fois connecté, on affiche
// un écran de confirmation minimal qui appelle getMyInvoices (preuve que le
// jeton fonctionne et que les Cloud Functions répondent). Les vrais onglets
// (Accueil, Suivi, Dépôt, Devis, Chat, Profil) seront portés ensuite.
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { httpsCallable } from 'firebase/functions';
import { signOut } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, functions } from './src/firebase';
import { colors, fcfa } from './src/theme';
import LoginScreen from './src/screens/LoginScreen';

export default function App() {
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const loadInvoices = async () => {
    setLoading(true); setError('');
    try {
      const u = auth.currentUser;
      if (u) { try { await u.getIdToken(true); } catch (_) {} }
      const res = await httpsCallable(functions, 'getMyInvoices')();
      setData(res?.data || {});
    } catch (e) {
      console.warn('getMyInvoices:', e?.code, e?.message);
      setError(e?.code === 'unauthenticated' ? 'Session expirée, reconnectez-vous.' : "Impossible de charger les factures.");
    } finally { setLoading(false); }
  };

  useEffect(() => { if (authed) loadInvoices(); }, [authed]);

  const logout = async () => {
    try { await signOut(auth); } catch (_) {}
    await AsyncStorage.multiRemove(['amtc_registered', 'amtc_pin']);
    setData(null); setAuthed(false);
  };

  if (!authed) {
    return (<><StatusBar style="light" /><LoginScreen onAuthed={() => setAuthed(true)} /></>);
  }

  const invoices = (data && data.invoices) || [];
  const profile = (data && data.profile) || {};
  const phone = auth.currentUser?.phoneNumber || '';

  return (
    <View style={st.root}>
      <StatusBar style="light" />
      <View style={st.header}>
        <Text style={st.hTitle}>AMT TRANS'IT</Text>
        <Text style={st.hSub}>Connexion réussie ✅</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 18 }}>
        <View style={st.card}>
          <Text style={st.k}>Téléphone vérifié</Text>
          <Text style={st.v}>{phone || '—'}</Text>
          {!!profile.prenom || !!profile.nom ? (
            <><Text style={[st.k, { marginTop: 10 }]}>Profil</Text><Text style={st.v}>{`${profile.prenom || ''} ${profile.nom || ''}`.trim()}</Text></>
          ) : null}
        </View>

        <View style={st.card}>
          <Text style={st.cardTitle}>Test des Cloud Functions</Text>
          {loading ? (
            <ActivityIndicator color={colors.blue} style={{ marginVertical: 14 }} />
          ) : error ? (
            <Text style={{ color: colors.red, fontWeight: '600' }}>{error}</Text>
          ) : (
            <>
              <Text style={st.big}>{invoices.length}</Text>
              <Text style={st.k}>facture(s) reliée(s) à votre numéro</Text>
              {invoices.slice(0, 3).map((i, idx) => (
                <View key={idx} style={st.row}>
                  <Text style={st.rowRef}>{i.reference || '—'}</Text>
                  <Text style={st.rowAmt}>{fcfa(i.remaining || (i.total - i.paid))}</Text>
                </View>
              ))}
            </>
          )}
          <TouchableOpacity style={st.btnGhost} onPress={loadInvoices}><Text style={st.btnGhostTxt}>↻ Recharger</Text></TouchableOpacity>
        </View>

        <Text style={st.note}>Étape 1 validée : connexion SMS + accès aux données. Les onglets complets (Accueil, Suivi, Dépôt, Devis, Chat, Profil) seront ajoutés ensuite.</Text>

        <TouchableOpacity style={st.logout} onPress={logout}><Text style={st.logoutTxt}>Se déconnecter</Text></TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { backgroundColor: colors.blue, paddingTop: 54, paddingBottom: 16, paddingHorizontal: 18, borderBottomWidth: 2, borderBottomColor: colors.gold },
  hTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  hSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 2 },
  card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 18, marginBottom: 14 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: colors.blue, marginBottom: 6 },
  k: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  v: { fontSize: 15, fontWeight: '700', color: colors.ink, marginTop: 2 },
  big: { fontSize: 34, fontWeight: '800', color: colors.blue },
  row: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: 10, marginTop: 6 },
  rowRef: { fontWeight: '700', color: colors.blue },
  rowAmt: { fontWeight: '700', color: colors.ink },
  btnGhost: { marginTop: 12, alignItems: 'center' },
  btnGhostTxt: { color: colors.muted, fontWeight: '700' },
  note: { fontSize: 12.5, color: colors.muted, lineHeight: 19, textAlign: 'center', marginVertical: 8 },
  logout: { marginTop: 6, alignItems: 'center', padding: 12 },
  logoutTxt: { color: colors.red, fontWeight: '700' },
});
