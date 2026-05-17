import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import {
  doc, getDoc, collection, query, where, getDocs,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useAuth } from '../auth/AuthContext';

const fcfa = (n) => `${Number(n || 0).toLocaleString('fr-FR')} FCFA`;
const fdate = (v) => {
  if (!v) return '-';
  const d = v && typeof v.toDate === 'function' ? v.toDate() : new Date(v);
  return isNaN(d) ? '-' : d.toLocaleDateString('fr-FR');
};

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
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.muted}>Chargement de votre espace…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errIcon}>⚠️</Text>
        <Text style={styles.errText}>{error}</Text>
        <TouchableOpacity style={styles.retry} onPress={load}><Text style={styles.retryT}>Réessayer</Text></TouchableOpacity>
        <TouchableOpacity style={styles.logout} onPress={logout}><Text style={styles.logoutText}>Se déconnecter</Text></TouchableOpacity>
      </View>
    );
  }

  const name = me ? `${me.prenom || ''} ${me.nom || ''}`.trim() || user?.email : user?.email;

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.hello}>Bonjour 👋</Text>
      <Text style={styles.name}>{name}</Text>

      <View style={styles.kpis}>
        <View style={[styles.kpi, { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' }]}>
          <Text style={[styles.kpiV, { color: '#065f46' }]}>{fcfa(me?.soldeDisponible)}</Text>
          <Text style={styles.kpiL}>Solde à percevoir</Text>
        </View>
        <View style={[styles.kpi, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }]}>
          <Text style={[styles.kpiV, { color: '#1e40af' }]}>{fcfa(me?.totalGagne)}</Text>
          <Text style={styles.kpiL}>Total généré</Text>
        </View>
      </View>

      <Text style={styles.section}>👥 Mes clients affiliés ({clients.length})</Text>
      <View style={styles.card}>
        {clients.length === 0 && <Text style={styles.empty}>Aucun client affilié pour l'instant.</Text>}
        {clients.map((c) => (
          <View key={c.id} style={styles.row}>
            <Text style={styles.rowMain}>{c.clientName || c.phone || c.id}</Text>
            <Text style={styles.rowSub}>{c.phone || ''}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.section}>🤝 Mes filleuls ({filleuls.length})</Text>
      <View style={styles.card}>
        {filleuls.length === 0 && <Text style={styles.empty}>Aucun filleul.</Text>}
        {filleuls.map((f) => (
          <View key={f.id} style={styles.row}>
            <Text style={styles.rowMain}>{`${f.prenom || ''} ${f.nom || ''}`.trim() || f.id}</Text>
            <Text style={styles.rowSub}>{f.telephone || ''}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.section}>💰 Mes commissions ({commissions.length})</Text>
      <View style={styles.card}>
        {commissions.length === 0 && <Text style={styles.empty}>Aucune commission enregistrée.</Text>}
        {commissions.slice(0, 50).map((c) => (
          <View key={c.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowMain}>{fcfa(c.montantNet)}</Text>
              <Text style={styles.rowSub}>
                {c.type === 'parrainage' ? 'Bonus parrainage' : 'Commission directe'} · {fdate(c.dateCreation)}
              </Text>
            </View>
            <Text style={[styles.badge, c.statut === 'paye' ? styles.bPaid : styles.bWait]}>
              {c.statut === 'paye' ? 'Payée' : 'En attente'}
            </Text>
          </View>
        ))}
        {commissions.length > 50 && <Text style={styles.empty}>… et {commissions.length - 50} de plus</Text>}
      </View>

      <TouchableOpacity style={styles.logout} onPress={logout}>
        <Text style={styles.logoutText}>Se déconnecter</Text>
      </TouchableOpacity>
      <Text style={styles.foot}>Tire vers le bas pour rafraîchir · Lecture seule</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center', padding: 28 },
  muted: { color: '#64748b', marginTop: 12 },
  errIcon: { fontSize: 34 },
  errText: { color: '#475569', textAlign: 'center', marginTop: 10, lineHeight: 20 },
  retry: { marginTop: 18, backgroundColor: '#2563eb', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
  retryT: { color: '#fff', fontWeight: '700' },

  container: { backgroundColor: '#f8fafc', padding: 20, paddingTop: 56, paddingBottom: 40 },
  hello: { fontSize: 15, color: '#64748b' },
  name: { fontSize: 22, fontWeight: '800', color: '#0f172a', marginTop: 2, marginBottom: 18 },
  kpis: { flexDirection: 'row', gap: 12, marginBottom: 22 },
  kpi: { flex: 1, borderWidth: 1, borderRadius: 16, padding: 16 },
  kpiV: { fontSize: 18, fontWeight: '800' },
  kpiL: { fontSize: 12, color: '#64748b', marginTop: 4 },
  section: { fontSize: 15, fontWeight: '800', color: '#0f172a', marginBottom: 8, marginTop: 6 },
  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 6, marginBottom: 20 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eef2f7' },
  rowMain: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  rowSub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  empty: { color: '#94a3b8', fontSize: 13, padding: 14, textAlign: 'center' },
  badge: { fontSize: 10, fontWeight: '800', paddingVertical: 4, paddingHorizontal: 9, borderRadius: 999, overflow: 'hidden' },
  bPaid: { backgroundColor: '#dcfce7', color: '#166534' },
  bWait: { backgroundColor: '#fef3c7', color: '#92400e' },
  logout: { marginTop: 8, borderWidth: 1, borderColor: '#ef4444', borderRadius: 8, padding: 14, alignItems: 'center' },
  logoutText: { color: '#ef4444', fontWeight: '700' },
  foot: { textAlign: 'center', color: '#94a3b8', fontSize: 11, marginTop: 14 },
});
