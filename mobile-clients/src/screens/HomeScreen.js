// Onglet ACCUEIL : bannière d'accueil (solde) + dernières factures + services.
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Card, SectionTitle, Badge, Loading } from '../components/ui';
import { colors, gradients, tints, fcfa, fdate } from '../theme';

const TAUX = 655.957;
const toFcfa = (v, cur) => (cur === 'EUR' ? (v || 0) * TAUX : (v || 0));
const STATUS = { PAYE: ['Payé', 'paid'], PARTIEL: ['Acompte', 'wait'], IMPAYE: ['Impayé', 'bad'] };

// Raccourcis (libellés clairs + teinte de couleur). senderOnly = expéditeurs.
const SHORTCUTS = [
  { key: 'requests', icon: '📦', label: 'Déposer un carton', tint: tints.gold, senderOnly: true },
  { key: 'requests', icon: '🔄', label: 'Demande de récup', tint: tints.blue, senderOnly: true },
  { key: 'invoices', icon: '🧾', label: 'Mes factures', tint: tints.violet },
  { key: 'quotes', icon: '🧮', label: 'Faire un devis', tint: tints.green },
  { key: 'departures', icon: '🚢', label: 'Prochains départs', tint: tints.blue },
  { key: 'notifications', icon: '🔔', label: 'Notifications', tint: tints.red },
  { key: 'chat', icon: '💬', label: 'Discuter', tint: tints.gold },
];

export default function HomeScreen({ data, loading, onRefresh, onOpenInvoice, onNavigate, isSender }) {
  if (loading && !data) return <Loading text="Chargement de vos factures…" />;
  const invoices = (data && data.invoices) || [];
  const profile = (data && data.profile) || {};
  const prenom = (profile.prenom || (profile.name || '').split(' ')[0] || '').trim();
  const totalDu = invoices.reduce((s, i) => s + toFcfa(i.remaining != null ? i.remaining : (i.total - i.paid), i.currency), 0);
  const nbImpayees = invoices.filter(i => i.status !== 'PAYE').length;
  // Alerte magasinage : factures avec des frais de stockage en cours.
  const magInvoices = invoices.filter(i => Number(i.magasinage) > 0);
  const totalMag = magInvoices.reduce((s, i) => s + toFcfa(i.magasinage, i.currency), 0);
  const shortcuts = SHORTCUTS.filter(sc => !sc.senderOnly || isSender);

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 22 }}
      refreshControl={<RefreshControl refreshing={!!loading} onRefresh={onRefresh} tintColor={colors.blue} />}>

      {/* Bannière d'accueil */}
      <LinearGradient colors={gradients.blue} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
        {/* accents décoratifs jaunes */}
        <View style={s.blob1} />
        <View style={s.blob2} />
        <Text style={s.greet}>Bonjour{prenom ? ',' : ' 👋'}</Text>
        {!!prenom && <Text style={s.name}>{prenom} 👋</Text>}

        <View style={s.balanceCard}>
          <View style={{ flex: 1 }}>
            <Text style={s.balLabel}>Reste à payer</Text>
            <Text style={[s.balValue, { color: totalDu > 0 ? '#fff' : '#8EF0B5' }]}>{fcfa(totalDu)}</Text>
            <Text style={s.balSub}>
              {invoices.length} facture{invoices.length > 1 ? 's' : ''}
              {nbImpayees > 0 ? ` · ${nbImpayees} à régler` : ' · tout est à jour ✅'}
            </Text>
          </View>
          <TouchableOpacity style={s.balBtn} activeOpacity={0.85} onPress={() => onNavigate && onNavigate('invoices')}>
            <Text style={s.balBtnTxt}>Voir</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
        {/* Alerte magasinage (frais de stockage qui augmentent) */}
        {magInvoices.length > 0 && (
          <TouchableOpacity style={s.magBanner} activeOpacity={0.85} onPress={() => onNavigate && onNavigate('invoices')}>
            <Text style={s.magBannerIc}>⚠️</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.magBannerT}>Frais de stockage en cours</Text>
              <Text style={s.magBannerS}>{magInvoices.length} facture{magInvoices.length > 1 ? 's' : ''} · {fcfa(totalMag)} — récupérez vos colis pour éviter qu'ils n'augmentent.</Text>
            </View>
            <Text style={s.magBannerChev}>›</Text>
          </TouchableOpacity>
        )}

        {/* Services (raccourcis colorés) */}
        <SectionTitle>Services</SectionTitle>
        <View style={s.grid}>
          {shortcuts.map((sc, i) => (
            <TouchableOpacity key={i} style={s.shortcut} onPress={() => onNavigate && onNavigate(sc.key)} activeOpacity={0.75}>
              <View style={[s.scIcWrap, { backgroundColor: sc.tint }]}><Text style={s.scIc}>{sc.icon}</Text></View>
              <Text style={s.scLb}>{sc.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Dernières factures */}
        <View style={{ height: 6 }} />
        <SectionTitle>Dernières factures</SectionTitle>
        <Card style={{ padding: 6 }}>
          {invoices.length === 0 ? (
            <Text style={s.none}>Aucune facture reliée à votre numéro pour le moment.</Text>
          ) : invoices.slice(0, 8).map((i, idx) => {
            const [lbl, kind] = STATUS[i.status] || STATUS.IMPAYE;
            const other = i.counterpart || '';
            return (
              <TouchableOpacity key={idx} style={[s.row, idx > 0 && s.rowBorder]} onPress={() => onOpenInvoice && onOpenInvoice(i.reference)} activeOpacity={0.7}>
                <View style={[s.rowDot, { backgroundColor: kind === 'paid' ? colors.green : kind === 'wait' ? colors.gold : colors.red }]} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={s.ref}>{i.reference || '—'}</Text>
                    <Badge text={lbl} kind={kind} />
                  </View>
                  <Text style={s.sub} numberOfLines={1}>
                    {(i.role === 'dest' ? 'Expéditeur' : 'Destinataire')} : {other || '—'} · {fdate(i.date)}
                  </Text>
                </View>
                <Text style={s.amt}>{fcfa(toFcfa(i.total, i.currency))}</Text>
              </TouchableOpacity>
            );
          })}
        </Card>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  hero: { paddingTop: 22, paddingBottom: 22, paddingHorizontal: 20, borderBottomLeftRadius: 26, borderBottomRightRadius: 26, overflow: 'hidden' },
  blob1: { position: 'absolute', top: -40, right: -30, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(253,198,21,0.16)' },
  blob2: { position: 'absolute', bottom: -50, left: -40, width: 130, height: 130, borderRadius: 65, backgroundColor: 'rgba(255,255,255,0.05)' },
  greet: { color: 'rgba(255,255,255,0.85)', fontSize: 15, fontWeight: '600' },
  name: { color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 1 },
  balanceCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', borderRadius: 18, padding: 16, marginTop: 16 },
  balLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '600' },
  balValue: { fontSize: 26, fontWeight: '800', marginTop: 3 },
  balSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 4 },
  balBtn: { backgroundColor: colors.gold, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 },
  balBtnTxt: { color: colors.blue, fontWeight: '800', fontSize: 14 },

  magBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA', borderRadius: 14, padding: 14, marginBottom: 14 },
  magBannerIc: { fontSize: 22 },
  magBannerT: { color: '#C2410C', fontWeight: '800', fontSize: 14 },
  magBannerS: { color: '#9A3412', fontSize: 12, marginTop: 2, lineHeight: 16 },
  magBannerChev: { color: '#C2410C', fontWeight: '800', fontSize: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  shortcut: { width: '31%', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 18, alignItems: 'center', justifyContent: 'center', paddingVertical: 14 },
  scIcWrap: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  scIc: { fontSize: 24 },
  scLb: { fontSize: 11.5, fontWeight: '700', color: colors.blue, textAlign: 'center', lineHeight: 14, paddingHorizontal: 4 },

  row: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.line },
  rowDot: { width: 8, height: 8, borderRadius: 4 },
  ref: { fontWeight: '800', color: colors.blue, fontSize: 14 },
  sub: { fontSize: 12, color: colors.muted, marginTop: 3 },
  amt: { fontWeight: '700', color: colors.ink },
  none: { padding: 18, color: colors.muted, textAlign: 'center' },
});
