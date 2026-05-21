// ============================================================================
//  RouteSwitcher — sélecteur d'agence pour les comptes mobile multi-route.
// ----------------------------------------------------------------------------
//  Affiché UNIQUEMENT si le compte est rattaché à plusieurs routes (= plusieurs
//  entrées dans le claim `links`). Sinon le composant ne s'affiche pas. Permet
//  au démarcheur de basculer entre ses différentes affiliations sans se
//  reconnecter ; le choix est persisté en AsyncStorage côté useDemarcheur.
//
//  Style : pastille dorée chaude cohérente avec le thème « Soleil d'Abidjan »,
//  bottom-sheet pour la sélection (UX native, accessible au pouce).
// ============================================================================

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, StyleSheet, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from './Icon';
import { colors, spacing, radius, font, grad, shadow } from '../theme';

// Convertit l'ID de route en libellé lisible. On essaie de jolir les routes
// connues sans bloquer les routes futures (fallback : ID en majuscule).
function prettyRoute(id) {
  const map = {
    chine: 'Chine 🇨🇳',
    abidjan_chine: 'Abidjan ↔ Chine',
    paris: 'Paris 🇫🇷',
    abidjan: 'Abidjan 🇨🇮',
    all: 'Toutes routes',
  };
  if (map[id]) return map[id];
  return String(id || '').toUpperCase();
}

// Variante COMPACTE (chip cliquable) — à poser dans un header ou ScreenTitle.
export function RouteChip({ links, activeLink, onSwitch }) {
  const [open, setOpen] = useState(false);
  if (!Array.isArray(links) || links.length <= 1) return null; // 1 seule route → pas de sélecteur
  return (
    <>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setOpen(true)}
        style={[styles.chip, shadow.soft]}
      >
        <Ionicons name="swap-horizontal" size={14} color={colors.goldDeep} />
        <Text style={styles.chipT} numberOfLines={1}>
          {prettyRoute(activeLink?.agency)}
        </Text>
        <Ionicons name="chevron-down" size={14} color={colors.goldDeep} />
      </TouchableOpacity>
      <RouteSheet
        visible={open}
        onClose={() => setOpen(false)}
        links={links}
        activeLink={activeLink}
        onPick={(l) => { setOpen(false); onSwitch && onSwitch(l); }}
      />
    </>
  );
}

// Variante BOUTON PLEINE LARGEUR — pour l'écran Profil.
export function RouteSwitcherButton({ links, activeLink, onSwitch }) {
  const [open, setOpen] = useState(false);
  if (!Array.isArray(links) || links.length <= 1) return null;
  return (
    <>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setOpen(true)}
        style={[styles.btn, shadow.soft]}
      >
        <View style={styles.btnIcon}>
          <Ionicons name="swap-horizontal" size={18} color={colors.goldDeep} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.btnL}>Agence active</Text>
          <Text style={styles.btnV}>{prettyRoute(activeLink?.agency)}</Text>
        </View>
        <View style={styles.btnBadge}>
          <Text style={styles.btnBadgeT}>{links.length}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
      </TouchableOpacity>
      <RouteSheet
        visible={open}
        onClose={() => setOpen(false)}
        links={links}
        activeLink={activeLink}
        onPick={(l) => { setOpen(false); onSwitch && onSwitch(l); }}
      />
    </>
  );
}

// ── Bottom-sheet de sélection ────────────────────────────────────────────
function RouteSheet({ visible, onClose, links, activeLink, onPick }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.dismiss} activeOpacity={1} onPress={onClose} />
        <LinearGradient
          colors={grad.lacquer}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.sheet, shadow.card]}
        >
          <View style={styles.grip} />
          <View style={styles.head}>
            <Text style={styles.title}>Choisir l'agence</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={22} color={colors.textDim} />
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>
            Ce compte est rattaché à plusieurs agences. Sélectionnez celle dont vous
            souhaitez consulter les données.
          </Text>
          <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
            {(links || []).map((l) => {
              const on = activeLink
                && activeLink.agency === l.agency
                && activeLink.demarcheurId === l.demarcheurId;
              return (
                <TouchableOpacity
                  key={`${l.agency}/${l.demarcheurId}`}
                  activeOpacity={0.8}
                  onPress={() => onPick(l)}
                  style={[styles.opt, on && styles.optOn]}
                >
                  <View style={[styles.optIcon, on && styles.optIconOn]}>
                    <Ionicons name={on ? 'checkmark' : 'business-outline'} size={18}
                      color={on ? colors.goldDeep : colors.textDim} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.optName}>{prettyRoute(l.agency)}</Text>
                    <Text style={styles.optSub}>{l.demarcheurId}</Text>
                  </View>
                  {on && <Text style={styles.optTag}>ACTIVE</Text>}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </LinearGradient>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Chip compact (header)
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.goldWarm,
    borderWidth: 1, borderColor: 'rgba(184,120,10,0.3)',
    borderRadius: radius.pill,
    paddingHorizontal: 12, paddingVertical: 6,
    maxWidth: 180,
  },
  chipT: { color: colors.goldDeep, fontFamily: font.bodyBold, fontSize: 12 },

  // Bouton pleine largeur (Profil)
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.glass,
    borderWidth: 1, borderColor: colors.glassBorder,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  btnIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: colors.goldWarm,
    alignItems: 'center', justifyContent: 'center',
  },
  btnL: { color: colors.textDim, fontSize: 11, fontFamily: font.body, letterSpacing: 0.5, textTransform: 'uppercase' },
  btnV: { color: colors.text, fontSize: 15, fontFamily: font.bodyBold, marginTop: 2 },
  btnBadge: {
    paddingHorizontal: 10, paddingVertical: 3,
    backgroundColor: colors.goldWarm, borderRadius: radius.pill,
    borderWidth: 1, borderColor: 'rgba(184,120,10,0.3)',
  },
  btnBadgeT: { color: colors.goldDeep, fontSize: 11, fontFamily: font.bodyBold },

  // Bottom-sheet
  backdrop: { flex: 1, backgroundColor: 'rgba(11,37,64,0.4)', justifyContent: 'flex-end' },
  dismiss: { ...StyleSheet.absoluteFillObject },
  sheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: spacing.lg, paddingTop: 14,
    borderTopWidth: 1, borderColor: colors.glassBorderStrong,
  },
  grip: { width: 44, height: 4, borderRadius: 2, backgroundColor: colors.glassBorder, alignSelf: 'center', marginBottom: 12 },
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  title: { flex: 1, color: colors.text, fontSize: 18, fontFamily: font.displaySemi },
  hint: { color: colors.textDim, fontSize: 12.5, fontFamily: font.body, lineHeight: 18, marginBottom: spacing.lg },

  opt: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: 14, paddingHorizontal: spacing.md,
    backgroundColor: colors.glass,
    borderWidth: 1, borderColor: colors.glassBorder,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  optOn: {
    backgroundColor: colors.goldWarm,
    borderColor: 'rgba(184,120,10,0.4)',
  },
  optIcon: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: colors.bgChip,
    alignItems: 'center', justifyContent: 'center',
  },
  optIconOn: { backgroundColor: 'rgba(242,163,18,0.28)' },
  optName: { color: colors.text, fontSize: 15, fontFamily: font.bodyBold },
  optSub: { color: colors.textFaint, fontSize: 11, fontFamily: font.body, marginTop: 2, letterSpacing: 0.3 },
  optTag: {
    color: colors.goldDeep, fontSize: 10, fontFamily: font.bodyBold,
    letterSpacing: 1, paddingHorizontal: 8, paddingVertical: 2,
    backgroundColor: 'rgba(242,163,18,0.18)', borderRadius: radius.pill,
  },
});
