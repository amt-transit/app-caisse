import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenScroll, ScreenTitle, Card } from '../components/ui';
import { RouteSwitcherButton } from '../components/RouteSwitcher';
import { colors, spacing, radius } from '../theme';

const LOGO = require('../../assets/logo.png');

export default function ProfilScreen({ data, onLogout, user }) {
  const { me, refreshing, refresh, links, activeLink, switchRoute } = data;
  const name = me ? `${me.prenom || ''} ${me.nom || ''}`.trim() : (user?.email || '');
  const initials = (name || '?')
    .split(' ').map((s) => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

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
