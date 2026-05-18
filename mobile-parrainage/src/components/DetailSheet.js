// Fiche détaillée (modale type « bottom sheet », thème laque & or).
// Réutilisée par Clients et Filleuls : montre, sans aucun quiproquo, chaque
// envoi — date, référence, description, montant facturé, votre part, statut.
import React from 'react';
import {
  Modal, View, Text, ScrollView, TouchableOpacity, StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Badge } from './ui';
import { colors, spacing, radius, font, grad, shadow, fcfa, fdate } from '../theme';

function commTone(statut) {
  if (statut === 'paye' || statut === 'retire') return ['paid', 'Payée'];
  if (statut === 'annule' || statut === 'rejete') return ['bad', 'Annulée'];
  return ['wait', 'En attente'];
}

export default function DetailSheet({
  visible, onClose, title, subtitle, avatar, stats = [], envois = [],
  emptyText = 'Aucun envoi pour l\'instant.', gainLabel = 'Votre commission',
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.dismiss} activeOpacity={1} onPress={onClose} />
        <LinearGradient
          colors={grad.bg}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.sheet, shadow.card]}
        >
          <View style={styles.grip} />

          <View style={styles.head}>
            <View style={styles.avatar}>
              <Text style={styles.avatarT}>{(avatar || '?').toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={styles.title} numberOfLines={1}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={22} color={colors.textDim} />
            </TouchableOpacity>
          </View>

          {stats.length > 0 && (
            <View style={styles.statRow}>
              {stats.map((s, i) => (
                <View key={i} style={[styles.stat, i < stats.length - 1 && styles.statDiv]}>
                  <Text style={[styles.statV, s.tint && { color: s.tint }]} numberOfLines={1} adjustsFontSizeToFit>
                    {s.value}
                  </Text>
                  <Text style={styles.statL}>{s.label}</Text>
                </View>
              ))}
            </View>
          )}

          <Text style={styles.section}>
            Détail des envois{envois.length ? ` · ${envois.length}` : ''}
          </Text>

          <ScrollView
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingBottom: spacing.xl }}
            showsVerticalScrollIndicator={false}
          >
            {envois.length === 0 && (
              <View style={styles.empty}>
                <Ionicons name="cube-outline" size={22} color={colors.textFaint} />
                <Text style={styles.emptyT}>{emptyText}</Text>
              </View>
            )}

            {envois.map((c) => {
              const [tone, txt] = commTone(c.statut);
              const isBonus = c.type === 'parrainage';
              return (
                <View key={c.id} style={styles.env}>
                  <View style={styles.envTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.envRef} numberOfLines={1}>
                        {isBonus ? '🎁 ' : '📦 '}{c.expeditionId || c.id}
                      </Text>
                      <Text style={styles.envDate}>{fdate(c.dateCreation)}</Text>
                    </View>
                    <Badge text={txt} tone={tone} />
                  </View>

                  {c.description ? (
                    <Text style={styles.envDesc} numberOfLines={2}>{c.description}</Text>
                  ) : null}

                  <View style={styles.line}>
                    <Text style={styles.lineL}>Montant facturé</Text>
                    <Text style={styles.lineV}>{fcfa(c.montantBrut)}</Text>
                  </View>
                  <View style={styles.line}>
                    <Text style={styles.lineL}>
                      {isBonus ? 'Bonus parrainage' : gainLabel}
                    </Text>
                    <Text style={[styles.lineV, styles.gain]}>{fcfa(c.montantNet)}</Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </LinearGradient>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(4,10,18,0.68)', justifyContent: 'flex-end' },
  dismiss: { flex: 1 },
  sheet: {
    maxHeight: '86%',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.glassBorderStrong,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  grip: {
    alignSelf: 'center', width: 44, height: 4, borderRadius: 2,
    backgroundColor: colors.glassBorderStrong, marginBottom: spacing.lg,
  },

  head: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  avatar: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: colors.bgChip,
    borderWidth: 1, borderColor: colors.glassBorderStrong,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarT: { color: colors.gold, fontFamily: font.bodyBold, fontSize: 16 },
  title: { color: colors.text, fontSize: 19, fontFamily: font.displaySemi },
  subtitle: { color: colors.textDim, fontSize: 13, marginTop: 3, fontFamily: font.body },

  statRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderWidth: 1, borderColor: colors.glassBorder,
    borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.lg,
  },
  stat: { flex: 1, alignItems: 'center' },
  statDiv: { borderRightWidth: 1, borderRightColor: colors.hairline },
  statV: { color: colors.goldLight, fontSize: 16, fontFamily: font.num },
  statL: { color: colors.textDim, fontSize: 11, marginTop: 4, fontFamily: font.body, textAlign: 'center' },

  section: {
    color: colors.text, fontSize: 14, fontFamily: font.heading,
    marginBottom: spacing.md,
  },

  empty: { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyT: { color: colors.textFaint, fontSize: 13, fontFamily: font.body, textAlign: 'center' },

  env: {
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderWidth: 1, borderColor: colors.glassBorder,
    borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.md,
  },
  envTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  envRef: { color: colors.text, fontSize: 14, fontFamily: font.bodyBold },
  envDate: { color: colors.textDim, fontSize: 12, marginTop: 3, fontFamily: font.body },
  envDesc: {
    color: colors.textDim, fontSize: 12.5, marginTop: spacing.md,
    lineHeight: 18, fontFamily: font.body,
  },
  line: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: spacing.md,
  },
  lineL: { color: colors.textDim, fontSize: 13, fontFamily: font.body },
  lineV: { color: colors.text, fontSize: 14, fontFamily: font.bodyBold },
  gain: { color: colors.goldLight },
});
