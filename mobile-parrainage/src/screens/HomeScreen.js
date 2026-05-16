import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useAuth } from '../auth/AuthContext';

// Écran placeholder post-connexion (B1).
// Le contenu réel (solde, mes clients affiliés, mes filleuls) sera branché
// en B3/B4, APRÈS la Phase A back-end :
//   A1 lien client<->démarcheur · A2 provisioning auth · A3 règles Firestore.
export default function HomeScreen() {
  const { user, logout } = useAuth();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Bienvenue 👋</Text>
      <Text style={styles.email}>{user?.email}</Text>

      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>Espace en construction</Text>
        <Text style={styles.noticeText}>
          La connexion fonctionne. L'affichage de vos données — solde,
          historique des clients affiliés, vos filleuls et leur activité —
          sera activé une fois le socle back-end en place (modèle
          d'affiliation, comptes démarcheurs, règles de sécurité).
        </Text>
      </View>

      <TouchableOpacity style={styles.logout} onPress={logout}>
        <Text style={styles.logoutText}>Se déconnecter</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#f8fafc', padding: 24, paddingTop: 64 },
  title: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  email: { fontSize: 14, color: '#64748b', marginTop: 4 },
  notice: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 18,
    marginTop: 24,
  },
  noticeTitle: { fontWeight: '700', color: '#0f172a', marginBottom: 6 },
  noticeText: { color: '#475569', fontSize: 13, lineHeight: 19 },
  logout: {
    marginTop: 28,
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  logoutText: { color: '#ef4444', fontWeight: '700' },
});
