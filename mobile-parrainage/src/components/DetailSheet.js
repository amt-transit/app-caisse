// Fiche détaillée (modale « bottom sheet ») — thème « Soleil d'Abidjan ».
// Réutilisée par Clients et Filleuls : montre, sans aucun quiproquo, chaque
// envoi — date, référence, description, montant facturé, votre part, statut.
//
// Correction importante vs l'ancienne version : la feuille gardait des restes
// du thème SOMBRE (backdrop quasi noir, fonds rgba(0,0,0,0.2x) illisibles sur
// fond clair). Tout est repassé en surfaces claires opaques + voile bleuté.
import React from 'react';
import {
  Modal, View, Text, ScrollView, TouchableOpacity, StyleSheet,
} from 'react-native';
import { Ionicons } from './Icon';
import { Badge } from './ui';
import { colors, spacing, radius, font, shadow, fcfa, fdate } from '../theme';

// État du solde de la commission (calculé serveur, au prorata du paiement).
function soldeTone(c) {
  const e = c.etatSolde;
  if (e === 'disponible') return ['paid', 'Disponible'];
  if (e === 'partiel') return ['info', 'Partiel'];
  if (c.statut === 'annule' || c.statut === 'rejete') return ['bad', 'Annulée'];
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
        <View style={[styles.sheet, shadow.card]}>
          <View style={styles.grip} />

          <View style={styles.head}>
            <View style={styles.avatar}>
              <Text style={styles.avatarT}>{(avatar || '?').toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={styles.title} numberOfLines={1}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={20} color={colors.textDim} />
            </TouchableOpacity>
          </View>

          {stats.length > 0 && (
            <View style={styles.statRow}>
              {stats.map((s, i) => (
                <View key={i} style={[styles.stat, i < stats.length - 1 && styles.statDiv]}>
                  <Text
                    style={[styles.statV, s.tint && { color: s.tint }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
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
              const [tone, txt] = soldeTone(c);
              const isBonus = c.type === 'parrainage';
              const pct = Number(c.partPayee || 0);
              const dispo = Number(c.montantDisponible || 0);
              const pot = Number(
                c.montantPotentiel != null
                  ? c.montantPotentiel
                  : (Number(c.montantNet || 0) - dispo)
              );
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
                    <Text style={styles.lineL}>Facture payée par le client</Text>
                    <Text style={styles.lineV}>{pct}%</Text>
                  </View>
                  <View style={styles.line}>
                    <Text style={styles.lineL}>
                      {isBonus ? 'Bonus total' : gainLabel}
                    </Text>
                    <Text style={styles.lineV}>{fcfa(c.montantNet)}</Text>
                  </View>

                  <View style={styles.splitBox}>
                    <View style={styles.splitCol}>
                      <Text style={styles.splitL}>✅ Disponible</Text>
                      <Text style={[styles.splitV, { color: colors.green }]}>{fcfa(dispo)}</Text>
                    </View>
                    <View style={styles.splitDiv} />
                    <View style={styles.splitCol}>
                      <Text style={styles.splitL}>⏳ En attente</Text>
                      <Text style={[styles.splitV, { color: colors.amber }]}>{fcfa(pot)}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Voile bleuté (et non plus quasi noir) — cohérent avec un thème clair.
  backdrop: { flex: 1, backgroundColor: 'rgba(11,37,64,0.45)', justifyContent: 'flex-end' },
  dismiss: { flex: 1 },
  sheet: {
    maxHeight: '86%',
    backgroundColor: colors.bgElevated, // blanc franc
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  grip: {
    alignSelf: 'center', width: 44, height: 5, borderRadius: 3,
    backgroundColor: colors.glassBorderStrong, marginBottom: spacing.lg,
  },

  head: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  avatar: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: colors.goldWarm,
    borderWidth: 1, borderColor: 'rgba(242,163,18,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarT: { color: colors.goldDeep, fontFamily: font.bodyBold, fontSize: 16 },
  title: { color: colors.text, fontSize: 19, fontFamily: font.displaySemi },
  subtitle: { color: colors.textDim, fontSize: 13, marginTop: 3, fontFamily: font.body },
  closeBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: colors.bg,
    alignItems: 'center', justifyContent: 'center',
  },

  // Bandeau de stats : surface claire douce (et non plus fond noir).
  statRow: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
    borderWidth: 1, borderColor: colors.glassBorder,
    borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.lg,
  },
  stat: { flex: 1, alignItems: 'center' },
  statDiv: { borderRightWidth: 1, borderRightColor: colors.glassBorder },
  statV: { color: colors.goldDeep, fontSize: 16, fontFamily: font.num },
  statL: {
    color: colors.textDim, fontSize: 11, marginTop: 4,
    fontFamily: font.body, textAlign: 'center',
  },

  section: {
    color: colors.text, fontSize: 14, fontFamily: font.heading,
    marginBottom: spacing.md,
  },

  empty: { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyT: { color: colors.textFaint, fontSize: 13, fontFamily: font.body, textAlign: 'center' },

  // Carte d'envoi : surface claire douce, bordée — lisible sur fond blanc.
  env: {
    backgroundColor: colors.bg,
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

  splitBox: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: spacing.lg, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.glassBorder,
  },
  splitCol: { flex: 1, alignItems: 'center' },
  splitDiv: { width: 1, alignSelf: 'stretch', backgroundColor: colors.glassBorder },
  splitL: { color: colors.textDim, fontSize: 11.5, fontFamily: font.body },
  splitV: { fontSize: 15, fontFamily: font.num, marginTop: 4 },
});