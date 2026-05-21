import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Alert, Linking, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { ScreenScroll, ScreenTitle, Card } from '../components/ui';
import { RouteSwitcherButton } from '../components/RouteSwitcher';
import { requestPushPermissionManually } from '../notifications';
import { colors, spacing, radius, font } from '../theme';

const LOGO = require('../../assets/logo.png');

export default function ProfilScreen({ data, onLogout, user }) {
  const { me, refreshing, refresh, links, activeLink, switchRoute } = data;
  const name = me ? `${me.prenom || ''} ${me.nom || ''}`.trim() : (user?.email || '');
  const initials = (name || '?')
    .split(' ').map((s) => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

  // ── Statut des notifications push ──────────────────────────────────────
  // `me.pushToken` est posé par registerPushToken (notifications.js) à
  // chaque ouverture si l'utilisateur a accepté la permission.
  const hasPush = !!me?.pushToken;
  const [pushBusy, setPushBusy] = useState(false);

  // Activation manuelle des notifications. On force la demande de permission
  // et on affiche un message précis au user selon ce qui se passe.
  const onActivatePush = async () => {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      const res = await requestPushPermissionManually({
        demarcheurId: activeLink?.demarcheurId || me?.id,
        agency: activeLink?.agency || me?.agency,
      });
      if (res.status === 'granted') {
        Alert.alert('Notifications activées ✔', res.hint);
        // Le onSnapshot de `me` va voir le pushToken arriver et la carte
        // passera en vert automatiquement.
      } else if (res.status === 'denied' && res.reason === 'blocked_in_settings') {
        // On propose d'ouvrir directement les paramètres Android de l'app.
        Alert.alert(
          'Permission bloquée',
          res.hint,
          [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Ouvrir les paramètres', onPress: () => Linking.openSettings() },
          ],
        );
      } else {
        Alert.alert("Impossible d'activer", res.hint || 'Erreur inconnue.');
      }
    } catch (e) {
      Alert.alert('Erreur', (e && e.message) || 'Échec.');
    } finally {
      setPushBusy(false);
    }
  };

  const onTestPush = async () => {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      const fn = httpsCallable(functions, 'sendTestPush');
      const result = await fn({
        agency: activeLink?.agency || me?.agency,
        demarcheurId: activeLink?.demarcheurId || me?.id,
      });
      const r = result?.data || {};
      if (r.ok) {
        Alert.alert(
          'Notification envoyée ✔',
          "Vous devriez la recevoir dans quelques secondes. Si rien n'arrive : vérifiez que les notifications sont autorisées dans les réglages de votre téléphone.",
        );
      } else {
        const map = {
          pas_de_token: "Aucun token n'est enregistré pour ce compte. " + (r.hint || ''),
          fiche_introuvable: 'Fiche démarcheur introuvable sur cette route.',
        };
        Alert.alert('Impossible d\'envoyer la notification', map[r.reason] || (r.reason || 'Erreur inconnue.'));
      }
    } catch (e) {
      Alert.alert('Erreur', (e && e.message) || 'Échec du test de notification.');
    } finally {
      setPushBusy(false);
    }
  };

  const Line = ({ icon, label, value }) => (
    <View style={styles.line}>
      <Ionicons name={icon} size={17} color={colors.gold} style={{ width: 24 }} />
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={styles.lineValue} numberOfLines={1}>{value || '—'}</Text>
    </View>
  );

  return (
    <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
      <ScreenTitle icon="person-circle" title="Mon profil" />

      <View style={styles.head}>
        {me?.photoUrl ? (
          <Image source={{ uri: me.photoUrl }} style={styles.photo} />
        ) : (
          <View style={styles.avatar}><Text style={styles.avatarT}>{initials || '?'}</Text></View>
        )}
        <Text style={styles.name}>{name || '—'}</Text>
        <Text style={styles.role}>
          {me?.parrainId ? 'Filleul partenaire' : 'Leader partenaire'} · AMT Transit Cargo
        </Text>
      </View>

      <RouteSwitcherButton
        links={links}
        activeLink={activeLink}
        onSwitch={switchRoute}
      />

      <Card style={{ padding: spacing.xs }}>
        <Line icon="call-outline" label="Téléphone" value={me?.telephone} />
        <Line icon="mail-outline" label="Email" value={me?.email || user?.email} />
        <Line icon="pricetag-outline" label="Statut" value={me?.statut || 'actif'} />
        <Line icon="business-outline" label="Agence" value={activeLink?.agency || me?.agency} />
      </Card>

      {/* ── État des notifications push ────────────────────────────────── */}
      <View style={[
        styles.pushCard,
        hasPush ? styles.pushCardOn : styles.pushCardOff,
      ]}>
        <View style={[styles.pushIcon, hasPush ? styles.pushIconOn : styles.pushIconOff]}>
          <Ionicons
            name={hasPush ? 'notifications' : 'notifications-off'}
            size={20}
            color={hasPush ? colors.green : colors.amber}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.pushTitle}>
            {hasPush ? 'Notifications activées' : 'Notifications inactives'}
          </Text>
          <Text style={styles.pushSub}>
            {hasPush
              ? 'Vous recevrez les nouvelles commissions et paiements en direct.'
              : "Ouvrez l'app, acceptez la permission, ou utilisez un build natif (pas Expo Go)."}
          </Text>
        </View>
        {hasPush ? (
          <TouchableOpacity onPress={onTestPush} disabled={pushBusy} style={styles.pushBtn} activeOpacity={0.85}>
            <Text style={styles.pushBtnT}>{pushBusy ? '…' : 'Tester'}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={onActivatePush} disabled={pushBusy} style={styles.pushBtnActivate} activeOpacity={0.85}>
            <Text style={styles.pushBtnActivateT}>{pushBusy ? '…' : 'Activer'}</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.helpCard}>
        <Image source={LOGO} style={styles.helpLogo} />
        <Text style={styles.helpText}>
          Une question sur vos commissions ou un transfert ?{'\n'}Contactez votre agence AMT.
        </Text>
      </View>

      <TouchableOpacity style={styles.logout} activeOpacity={0.85} onPress={onLogout}>
        <Ionicons name="log-out-outline" size={18} color={colors.redSoft} />
        <Text style={styles.logoutT}>Se déconnecter</Text>
      </TouchableOpacity>

      <Text style={styles.foot}>AMT Transit Cargo · Espace Partenaire</Text>
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', marginBottom: spacing.xl },
  avatar: {
    width: 96, height: 96, borderRadius: 48, backgroundColor: colors.goldWarm || colors.gold,
    borderWidth: 2, borderColor: 'rgba(242,163,18,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarT: { color: colors.goldDeep, fontSize: 32, fontWeight: '900' },
  photo: {
    width: 96, height: 96, borderRadius: 48,
    borderWidth: 2, borderColor: 'rgba(242,163,18,0.4)',
  },
  name: { color: colors.text, fontSize: 19, fontWeight: '800', marginTop: spacing.md },
  role: { color: colors.textDim, fontSize: 12.5, marginTop: 4 },

  line: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline,
  },
  lineLabel: { color: colors.textDim, fontSize: 13, marginLeft: spacing.sm, flex: 1 },
  lineValue: { color: colors.text, fontSize: 14, fontWeight: '700', maxWidth: '55%' },

  // ── Carte « état des notifications push »
  pushCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    borderWidth: 1, borderRadius: radius.md,
    padding: spacing.lg, marginTop: spacing.md,
  },
  pushCardOn: { backgroundColor: colors.greenWarm || 'rgba(16,185,129,0.10)', borderColor: 'rgba(4,120,87,0.25)' },
  pushCardOff: { backgroundColor: colors.amberWarm || 'rgba(245,158,11,0.10)', borderColor: 'rgba(180,83,9,0.30)' },
  pushIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  pushIconOn: { backgroundColor: 'rgba(16,185,129,0.18)' },
  pushIconOff: { backgroundColor: 'rgba(245,158,11,0.20)' },
  pushTitle: { color: colors.text, fontSize: 14, fontFamily: font.bodyBold },
  pushSub: { color: colors.textDim, fontSize: 12, marginTop: 2, lineHeight: 17 },
  pushBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill,
    backgroundColor: 'rgba(16,185,129,0.18)', borderWidth: 1, borderColor: 'rgba(4,120,87,0.3)',
  },
  pushBtnT: { color: colors.green, fontSize: 12, fontFamily: font.bodyBold },
  pushBtnActivate: {
    paddingHorizontal: 16, paddingVertical: 9, borderRadius: radius.pill,
    backgroundColor: colors.gold,
    shadowColor: colors.gold, shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5,
  },
  pushBtnActivateT: { color: colors.onGold, fontSize: 12.5, fontFamily: font.bodyBold, letterSpacing: 0.3 },

  helpCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder,
    borderRadius: radius.md, padding: spacing.lg, marginVertical: spacing.lg,
  },
  helpLogo: { width: 40, height: 40, borderRadius: 20 },
  helpText: { color: colors.textDim, fontSize: 12.5, lineHeight: 18, flex: 1 },

  logout: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    borderWidth: 1, borderColor: 'rgba(229,32,42,0.4)', borderRadius: radius.md,
    height: 50, marginTop: spacing.sm,
  },
  logoutT: { color: colors.redSoft, fontWeight: '700', fontSize: 14.5 },
  foot: { textAlign: 'center', color: colors.textFaint, fontSize: 11, marginTop: spacing.xl },
});
