// FacturesScreen — Liste détaillée des factures dont le démarcheur est le
// parrain direct. Lecture seule : il ne peut RIEN modifier. Conforme à la
// règle métier : il voit UNIQUEMENT ses propres factures (pas celles des
// clients de ses filleuls). Mais les commissions de ses filleuls restent
// visibles sur l'onglet Wallet (bonus de parrainage).
import React, { useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal, ScrollView, StyleSheet, Dimensions, Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '../components/Icon';
import { ScreenScroll, ScreenTitle, Empty } from '../components/ui';
import { colors, spacing, radius, font, grad, shadow, fcfa, fdate } from '../theme';

// ── Helpers d'affichage des statuts ──────────────────────────────────────
const PAY_STATUS = {
  payee:   { label: 'Payée',   bg: 'rgba(52,217,166,0.15)', fg: '#34D9A6' },
  acompte: { label: 'Acompte', bg: 'rgba(251,191,36,0.18)', fg: '#FBBF24' },
  impayee: { label: 'Impayée', bg: 'rgba(229,31,33,0.18)',  fg: '#FF6A5A' },
};
const COLIS_STATUS = {
  EN_ATTENTE: { label: 'En préparation', bg: 'rgba(148,163,184,0.18)', fg: '#94A3B8' },
  PARIS:      { label: 'Mise en entrepôt', bg: 'rgba(147,197,253,0.18)', fg: '#93C5FD' },
  A_VENIR:    { label: 'Chargé · à venir', bg: 'rgba(192,132,252,0.18)', fg: '#C084FC' },
  EN_COURS:   { label: 'En transit',     bg: 'rgba(56,189,248,0.18)',  fg: '#38BDF8' },
  LIVRE:      { label: 'Livré',          bg: 'rgba(52,217,166,0.18)',  fg: '#34D9A6' },
};

function StatusBadge({ map, value }) {
  const v = map[value] || map.EN_ATTENTE || map.impayee;
  return (
    <View style={[badgeS.badge, { backgroundColor: v.bg }]}>
      <Text style={[badgeS.t, { color: v.fg }]}>{v.label}</Text>
    </View>
  );
}

// ── Helper : pour un sous-colis (label), déduit son statut individuel
// depuis l'historique des scans + le statut global de la livraison.
function statusOfLabel(liv, label) {
  let status = 'EN_ATTENTE';
  let container = liv.conteneur || '-';
  if (liv.scanHistory && Array.isArray(liv.scanHistory)) {
    const myScans = liv.scanHistory
      .filter((s) => s.scanRef === label)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    if (myScans.length > 0) {
      const last = myScans[0];
      if (last.type === 'ENTREPOT_PARIS') { status = 'PARIS'; }
      else if (last.type === 'CONTENEUR_CHARGEMENT') {
        status = 'A_VENIR';
        container = last.container || container;
      }
    }
  }
  if (liv.containerStatus === 'A_VENIR') status = 'A_VENIR';
  else if (liv.containerStatus === 'EN_COURS') status = 'EN_COURS';
  if (liv.status === 'LIVRE') status = 'LIVRE';
  return { status, container };
}

// ─────────────────────────────────────────────────────────────────────────
export default function FacturesScreen({ data }) {
  const { factures = [], refreshing, refresh } = data;
  const [q, setQ] = useState('');
  const [pf, setPf] = useState('all'); // filtre statut paiement
  const [sel, setSel] = useState(null);

  const list = useMemo(() => {
    const s = q.toLowerCase().trim();
    return factures.filter((f) => {
      if (pf !== 'all' && f.statutPay !== pf) return false;
      if (!s) return true;
      return (
        `${f.reference || ''} ${f.nomDestinataire || ''} ${f.nom || ''}`.toLowerCase().includes(s)
      );
    });
  }, [factures, q, pf]);

  // Récap rapide en haut : nb factures + total commission disponible
  const summary = useMemo(() => {
    let n = factures.length;
    let dispo = 0, pot = 0;
    factures.forEach((f) => {
      if (f.commission) {
        dispo += Number(f.commission.montantDisponible) || 0;
        pot += Number(f.commission.montantPotentiel) || 0;
      }
    });
    return { n, dispo, pot };
  }, [factures]);

  return (
    <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
      <ScreenTitle
        icon="receipt"
        title="Mes factures"
        subtitle="Factures de vos clients directs. Touchez une ligne pour voir le détail."
      />

      {/* Récap commission */}
      <View style={styles.recap}>
        <View style={{ flex: 1 }}>
          <Text style={styles.recapLabel}>Total commission disponible</Text>
          <Text style={styles.recapValue}>{fcfa(summary.dispo)}</Text>
          {summary.pot > 0 && (
            <Text style={styles.recapHint}>+ {fcfa(summary.pot)} en attente</Text>
          )}
        </View>
        <View style={styles.recapBadge}>
          <Text style={styles.recapBadgeN}>{summary.n}</Text>
          <Text style={styles.recapBadgeL}>facture{summary.n > 1 ? 's' : ''}</Text>
        </View>
      </View>

      {/* Recherche */}
      <View style={styles.search}>
        <Ionicons name="search" size={16} color={colors.textDim} />
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher (référence, nom)…"
          placeholderTextColor={colors.textFaint}
          value={q}
          onChangeText={setQ}
        />
      </View>

      {/* Filtres rapides */}
      <View style={styles.filters}>
        {[
          { k: 'all', l: 'Toutes' },
          { k: 'impayee', l: 'Impayées' },
          { k: 'acompte', l: 'Acompte' },
          { k: 'payee', l: 'Payées' },
        ].map((f) => (
          <TouchableOpacity
            key={f.k}
            style={[styles.filter, pf === f.k && styles.filterOn]}
            onPress={() => setPf(f.k)}
            activeOpacity={0.8}
          >
            <Text style={[styles.filterT, pf === f.k && styles.filterTOn]}>{f.l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Liste */}
      {list.length === 0 ? (
        <Empty text={factures.length === 0
          ? "Aucune facture pour l'instant."
          : 'Aucune facture ne correspond.'} />
      ) : list.map((f) => (
        <TouchableOpacity
          key={f.id}
          style={[styles.card, shadow.card]}
          activeOpacity={0.85}
          onPress={() => setSel(f)}
        >
          <View style={styles.cardTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardRef}>{f.reference || '—'}</Text>
              <Text style={styles.cardDest} numberOfLines={1}>{f.nomDestinataire || '—'}</Text>
              <Text style={styles.cardDate}>{fdate(f.date)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.cardPrice}>{fcfa(f.prix)}</Text>
              {f.commission && (
                <Text style={styles.cardComm}>+ {fcfa(f.commission.montantNet)} commission</Text>
              )}
            </View>
          </View>
          <View style={styles.cardBadges}>
            <StatusBadge map={PAY_STATUS} value={f.statutPay} />
            <StatusBadge map={COLIS_STATUS} value={f.statutColis} />
          </View>
        </TouchableOpacity>
      ))}

      {/* Modale détail */}
      <FactureDetailModal facture={sel} onClose={() => setSel(null)} />
    </ScreenScroll>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Modale détail facture — équivalent mobile de la modale « Voir facture »
// du web, lecture seule, adapté au scroll mobile.
function FactureDetailModal({ facture, onClose }) {
  if (!facture) return null;
  const f = facture;
  const items = Array.isArray(f.items) ? f.items : [];

  // Liste plate de sous-colis (chaque label dans chaque livraison)
  const subColis = [];
  (f.livraisons || []).forEach((liv) => {
    const labels = liv.labels && liv.labels.length > 0 ? liv.labels : [liv.ref];
    labels.forEach((lbl) => {
      const { status, container } = statusOfLabel(liv, lbl);
      subColis.push({
        label: lbl,
        desc: liv.description || f.description || 'Colis',
        status,
        container,
        departureDate: liv.departureDate,
        arrivalDate: liv.arrivalDate,
      });
    });
  });

  // Voyage du conteneur (frise ShipsGo + navire + carte) recopié sur la livraison
  // par le serveur (champ tracking). On prend le suivi de la 1re livraison qui en a.
  const SHIPSGO_STEPS = { PREPARATION: '🏗️ Préparation', EMBARQUE: '🚢 Embarqué', EN_TRANSIT: '🌊 En mer', TRANSBORDEMENT: '🔄 Transbordement', ARRIVE: '⚓ Arrivé', DEDOUANE: '🛃 Dédouané', LIVRAISON: '📦 Livré' };
  const voyage = (f.livraisons || []).map((l) => l.tracking).find((t) => t && t.status) || null;

  // Paiements
  const payments = Array.isArray(f.paymentHistory) ? f.paymentHistory : [];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={ds.backdrop}>
        <TouchableOpacity style={ds.dismiss} activeOpacity={1} onPress={onClose} />
        <View style={[ds.sheet, shadow.card]}>
          <View style={ds.grip} />
          <View style={ds.head}>
            <View style={{ flex: 1 }}>
              <Text style={ds.kicker}>Facture</Text>
              <Text style={ds.ref}>{f.reference || '—'}</Text>
              <Text style={ds.sub}>{fdate(f.date)} · {f.nomDestinataire || '—'}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 8 }}>
              <StatusBadge map={PAY_STATUS} value={f.statutPay} />
              <StatusBadge map={COLIS_STATUS} value={f.statutColis} />
            </View>
            <TouchableOpacity onPress={onClose} style={{ marginLeft: 8 }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={22} color={colors.textDim} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
            {/* Bilan financier */}
            <Section title="Bilan financier">
              <View style={ds.bilanRow}>
                <Cell label="Total" value={fcfa(f.prix)} tone="muted" />
                <Cell label="Payé" value={fcfa(f.paye)} tone="green" />
                <Cell label="Reste" value={fcfa(f.reste)} tone="red" />
              </View>
            </Section>

            {/* Commission */}
            {f.commission && (
              <Section title="Votre commission">
                <View style={ds.bilanRow}>
                  <Cell label="Total" value={fcfa(f.commission.montantNet)} tone="gold" />
                  <Cell label="Disponible" value={fcfa(f.commission.montantDisponible)} tone="green" />
                  <Cell label="En attente" value={fcfa(f.commission.montantPotentiel)} tone="amber" />
                </View>
                {(f.commission.partPayee != null) && (
                  <Text style={ds.commHint}>
                    Facture payée à {f.commission.partPayee}% · la commission devient disponible au prorata.
                  </Text>
                )}
              </Section>
            )}

            {/* Expéditeur / Destinataire */}
            <Section title="Information client">
              <Row2 label="Expéditeur" value={f.nom || '—'} />
              <Row2 label="Destinataire" value={f.nomDestinataire || '—'} />
              <Row2 label="Téléphone" value={f.numero || f.tel || '—'} />
              <Row2 label="Adresse" value={f.adresseDestinataire || '—'} />
            </Section>

            {/* Items facturés */}
            {items.length > 0 && (
              <Section title={`Articles (${items.length})`}>
                {items.map((it, i) => (
                  <View key={i} style={ds.itemRow}>
                    <Text style={ds.itemDesc} numberOfLines={2}>{it.desc || '—'}</Text>
                    <Text style={ds.itemQty}>×{it.qty || 1}</Text>
                    <Text style={ds.itemTotal}>{fcfa(it.total || 0)}</Text>
                  </View>
                ))}
              </Section>
            )}

            {/* Suivi colis */}
            {subColis.length > 0 && (
              <Section title={`Suivi colis (${subColis.length})`}>
                {voyage && (
                  <View style={{ backgroundColor: '#f0f9ff', borderColor: '#bae6fd', borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 10 }}>
                    <Text style={{ fontWeight: '700', color: '#075985' }}>🛰️ Voyage : {SHIPSGO_STEPS[voyage.status] || voyage.status}</Text>
                    <Text style={{ color: '#075985', marginTop: 3, fontSize: 13 }}>🚢 {voyage.vesselName || 'Navire à confirmer'}{voyage.container ? ' · ' + voyage.container : ''}</Text>
                    <Text style={{ color: '#075985', marginTop: 3, fontSize: 13 }}>📅 Départ {voyage.departureDate ? fdate(voyage.departureDate) : '—'} → 📆 Arrivée prévue {(voyage.arrivalDate || voyage.eta) ? fdate(voyage.arrivalDate || voyage.eta) : '—'}</Text>
                    {voyage.vesselImo ? (
                      <TouchableOpacity onPress={() => Linking.openURL('https://www.vesselfinder.com/?imo=' + encodeURIComponent(voyage.vesselImo))}>
                        <Text style={{ color: '#0e7490', fontWeight: '700', marginTop: 5 }}>🗺️ Voir la carte du navire</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                )}
                {subColis.map((c, i) => (
                  <View key={i} style={ds.colisRow}>
                    <Text style={ds.colisLabel}>{c.label}</Text>
                    <Text style={ds.colisDesc} numberOfLines={1}>{c.desc}</Text>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      <StatusBadge map={COLIS_STATUS} value={c.status} />
                      <View style={ds.contBadge}><Text style={ds.contBadgeT}>📦 {c.container}</Text></View>
                    </View>
                    {(c.departureDate || c.arrivalDate) && (
                      <Text style={ds.colisDates}>
                        {c.departureDate ? `Départ : ${fdate(c.departureDate)}` : ''}
                        {c.departureDate && c.arrivalDate ? ' · ' : ''}
                        {c.arrivalDate ? `Arrivée : ${fdate(c.arrivalDate)}` : ''}
                      </Text>
                    )}
                  </View>
                ))}
              </Section>
            )}

            {/* Paiements */}
            {payments.length > 0 && (
              <Section title={`Historique paiements (${payments.length})`}>
                {payments.map((p, i) => (
                  <View key={i} style={ds.payRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={ds.payDate}>{fdate(p.date)}</Text>
                      <Text style={ds.payMode}>{p.modePaiement || 'Espèce'}</Text>
                    </View>
                    <Text style={ds.payAmount}>
                      {fcfa((Number(p.montantParis) || 0) + (Number(p.montantAbidjan) || 0))}
                    </Text>
                  </View>
                ))}
              </Section>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Petits composants de présentation
function Section({ title, children }) {
  return (
    <View style={ds.section}>
      <Text style={ds.sectionT}>{title}</Text>
      <View style={ds.sectionBox}>{children}</View>
    </View>
  );
}
function Cell({ label, value, tone }) {
  const map = {
    muted: colors.text,
    green: colors.green,
    red: colors.redSoft,
    gold: colors.goldLight,
    amber: colors.amber,
  };
  return (
    <View style={ds.cell}>
      <Text style={[ds.cellV, { color: map[tone] || colors.text }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={ds.cellL}>{label}</Text>
    </View>
  );
}
function Row2({ label, value }) {
  return (
    <View style={ds.row2}>
      <Text style={ds.row2L}>{label}</Text>
      <Text style={ds.row2V} numberOfLines={2}>{value}</Text>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────
const badgeS = StyleSheet.create({
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, alignSelf: 'flex-start' },
  t: { fontSize: 10.5, fontFamily: font.bodyBold, letterSpacing: 0.2 },
});

const styles = StyleSheet.create({
  recap: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.bgChip, borderWidth: 1, borderColor: colors.glassBorder,
    borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.lg,
  },
  recapLabel: { color: colors.textDim, fontSize: 11, fontFamily: font.body, marginBottom: 4 },
  recapValue: { color: colors.goldLight, fontSize: 22, fontFamily: font.num },
  recapHint: { color: colors.amber, fontSize: 11, fontFamily: font.body, marginTop: 2 },
  recapBadge: {
    width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(242,163,18,0.16)', borderWidth: 1, borderColor: 'rgba(242,163,18,0.3)',
  },
  recapBadgeN: { color: colors.gold, fontSize: 20, fontFamily: font.num },
  recapBadgeL: { color: colors.gold, fontSize: 9, fontFamily: font.body, marginTop: -2 },

  search: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.bgChip, borderWidth: 1, borderColor: colors.glassBorder,
    borderRadius: radius.md, paddingHorizontal: spacing.lg, height: 48,
    marginBottom: spacing.md,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 14, height: '100%', fontFamily: font.body },

  filters: { flexDirection: 'row', gap: 6, marginBottom: spacing.lg },
  filter: {
    flex: 1, paddingVertical: 8, alignItems: 'center',
    backgroundColor: colors.bgChip, borderWidth: 1, borderColor: colors.glassBorder,
    borderRadius: 8,
  },
  filterOn: { backgroundColor: 'rgba(242,163,18,0.12)', borderColor: 'rgba(242,163,18,0.4)' },
  filterT: { color: colors.textDim, fontSize: 12, fontFamily: font.body },
  filterTOn: { color: colors.gold, fontFamily: font.bodyBold },

  card: {
    backgroundColor: colors.bgChip, borderWidth: 1, borderColor: colors.glassBorder,
    borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.md,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  cardRef: { color: colors.text, fontSize: 15, fontFamily: font.displaySemi, letterSpacing: 0.5 },
  cardDest: { color: colors.textDim, fontSize: 13, fontFamily: font.body, marginTop: 2 },
  cardDate: { color: colors.textFaint, fontSize: 11, fontFamily: font.body, marginTop: 2 },
  cardPrice: { color: colors.text, fontSize: 16, fontFamily: font.num },
  cardComm: { color: colors.goldLight, fontSize: 11, fontFamily: font.body, marginTop: 2 },
  cardBadges: { flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' },
});

const ds = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(11,37,64,0.45)', justifyContent: 'flex-end' },
  dismiss: { ...StyleSheet.absoluteFillObject },
  sheet: {
    // Hauteur en pixels (et non en %). Sur Android, '92%' dans un parent
    // Modal n'est pas toujours bien calculé -> ScrollView intérieur à 0
    // de hauteur -> contenu non visible / non scrollable.
    height: Math.round(Dimensions.get('window').height * 0.92),
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: spacing.lg, paddingTop: 14,
    borderTopWidth: 1, borderColor: colors.glassBorder,
  },
  grip: { width: 44, height: 4, borderRadius: 2, backgroundColor: colors.glassBorder, alignSelf: 'center', marginBottom: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  kicker: { color: colors.textFaint, fontSize: 10, fontFamily: font.body, letterSpacing: 1, textTransform: 'uppercase' },
  ref: { color: colors.text, fontSize: 20, fontFamily: font.displaySemi, marginTop: 2 },
  sub: { color: colors.textDim, fontSize: 12, fontFamily: font.body, marginTop: 2 },

  section: { marginBottom: spacing.lg },
  sectionT: { color: colors.textDim, fontSize: 11, fontFamily: font.bodyBold, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  sectionBox: { backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radius.md, padding: spacing.md },

  bilanRow: { flexDirection: 'row', justifyContent: 'space-around' },
  cell: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  cellV: { fontSize: 15, fontFamily: font.num },
  cellL: { color: colors.textFaint, fontSize: 10, fontFamily: font.body, marginTop: 4 },

  commHint: { color: colors.textDim, fontSize: 11, fontFamily: font.body, marginTop: 10, fontStyle: 'italic' },

  row2: { flexDirection: 'row', paddingVertical: 6 },
  row2L: { width: 110, color: colors.textFaint, fontSize: 12, fontFamily: font.body },
  row2V: { flex: 1, color: colors.text, fontSize: 13, fontFamily: font.body },

  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 6, borderBottomWidth: 1, borderColor: colors.glassBorder },
  itemDesc: { flex: 1, color: colors.text, fontSize: 13, fontFamily: font.body },
  itemQty: { color: colors.textDim, fontSize: 12, fontFamily: font.bodyBold, minWidth: 30, textAlign: 'right' },
  itemTotal: { color: colors.text, fontSize: 12, fontFamily: font.num, minWidth: 80, textAlign: 'right' },

  colisRow: { paddingVertical: 8, borderBottomWidth: 1, borderColor: colors.glassBorder },
  colisLabel: { color: colors.text, fontSize: 13, fontFamily: font.num, letterSpacing: 0.5 },
  colisDesc: { color: colors.textDim, fontSize: 12, fontFamily: font.body, marginTop: 2 },
  colisDates: { color: colors.textFaint, fontSize: 11, fontFamily: font.body, marginTop: 4 },
  contBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: colors.bgChip, borderWidth: 1, borderColor: colors.glassBorder },
  contBadgeT: { color: colors.textDim, fontSize: 10, fontFamily: font.bodyBold },

  payRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderColor: colors.glassBorder },
  payDate: { color: colors.text, fontSize: 12, fontFamily: font.body },
  payMode: { color: colors.textFaint, fontSize: 11, fontFamily: font.body, marginTop: 2 },
  payAmount: { color: colors.green, fontSize: 13, fontFamily: font.num },
});