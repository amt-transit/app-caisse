// Écran NOTIFICATIONS : liste des notifs du client + marquage « tout lu ».
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { Card, Loading, Empty } from '../components/ui';
import { colors, fdate } from '../theme';
import { api } from '../api';
import { useLang } from '../i18n';

export default function NotificationsScreen() {
  const { t } = useLang();
  const [notifs, setNotifs] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const r = await api.getMyNotifications();
      setNotifs(r.notifications || []);
      // Ouvrir l'écran = marquer tout lu (serveur).
      if ((r.notifications || []).some(n => !n.read)) api.markNotificationsRead(null).catch(() => {});
    } catch (e) { setNotifs([]); }
    finally { setRefreshing(false); }
  };
  useEffect(() => { load(); }, []);

  if (notifs === null) return <Loading text={t('Chargement…')} />;
  if (notifs.length === 0) return <Empty icon="🔔" text={t('Aucune notification pour le moment.')} />;

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.blue} />}>
      {notifs.map((n, i) => (
        <Card key={n.id || i} style={[s.card, !n.read && s.unread]}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Text style={{ fontSize: 22 }}>{n.icon || '🔔'}</Text>
            <View style={{ flex: 1 }}>
              {!!n.title && <Text style={s.title}>{n.title}</Text>}
              {!!n.body && <Text style={s.body}>{n.body}</Text>}
              <Text style={s.date}>{fdate(n.createdAt)}</Text>
            </View>
            {!n.read && <View style={s.dot} />}
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  card: { padding: 14 },
  unread: { backgroundColor: '#eff6ff' },
  title: { fontWeight: '800', color: colors.ink, fontSize: 14 },
  body: { color: colors.muted, fontSize: 13, marginTop: 2, lineHeight: 18 },
  date: { color: '#94a3b8', fontSize: 11, marginTop: 4 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.blue, alignSelf: 'center' },
});
