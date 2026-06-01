// Écran DÉTAIL FACTURE : bilan financier, infos client, suivi colis-par-colis,
// téléchargement/partage du PDF officiel.
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Card, SectionTitle, Btn, Badge, Loading } from '../components/ui';
import { colors, fcfa, fdate } from '../theme';
import { api } from '../api';
import { shareInvoicePdf } from '../invoicePdf';

const STAGES = ['📥 Entrepôt', '📦 Conteneur', '🛬 Arrivé', '✅ Livré'];

// Déduit l'étape (0-3) d'un colis depuis son dernier scan / statut.
function stageOf(liv, label) {
  const scans = (liv.scanHistory || []).filter(s => !label || s.scanRef === label)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  if (scans.length) {
    const tp = scans[0].type;
    if (tp === 'REMISE_CLIENT') return 3;
    if (tp === 'DECHARGEMENT_ABIDJAN') return 2;
    if (tp === 'CONTENEUR_CHARGEMENT' || tp === 'DEPART_VOL' || tp === 'DEPART_VOL_RETOUR') return 1;
    if (tp === 'ENTREPOT_PARIS') return 0;
  }
  if (liv.status === 'LIVRE') return 3;
  if (liv.containerStatus === 'EN_COURS') return 2;
  if (liv.containerStatus === 'A_VENIR') return 1;
  return 0;
}

export default function InvoiceDetailScreen({ reference, onBack }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try { setDetail(await api.getMyInvoiceDetail(reference)); }
      catch (e) { setError(e?.code === 'permission-denied' ? "Facture introuvable." : "Chargement impossible."); }
    })();
  }, [reference]);

  const exportPdf = async () => {
    setPdfBusy(true);
    try { await shareInvoicePdf(detail); }
    catch (e) { Alert.alert('PDF', "Génération impossible pour le moment."); }
    finally { setPdfBusy(false); }
  };

  if (error) return (
    <View style={s.wrap}><Header onBack={onBack} title="Facture" /><Text style={s.err}>{error}</Text></View>
  );
  if (!detail) return (<View style={s.wrap}><Header onBack={onBack} title="Facture" /><Loading text="Chargement de la facture…" /></View>);

  const t = detail.transaction || {};
  const prix = Number(t.prix) || 0;
  const paye = (Number(t.montantParis) || 0) + (Number(t.montantAbidjan) || 0);
  const mag = Number(detail.magasinageFee) || 0;
  let reste = prix - (Number(detail.reduction) || 0) + mag - paye;
  if (reste < 0) reste = 0;
  const statusKind = reste <= 0 ? 'paid' : (paye > 0 ? 'wait' : 'bad');
  const statusLbl = reste <= 0 ? 'Payée' : (paye > 0 ? 'Acompte' : 'Impayée');

  // Colis : un par label (sinon la livraison entière).
  const colis = [];
  (detail.livraisons || []).forEach(liv => {
    const labels = (liv.labels && liv.labels.length) ? liv.labels : [liv.ref];
    labels.forEach(lb => colis.push({ label: lb, desc: liv.description || '', stage: stageOf(liv, lb) }));
  });

  return (
    <View style={s.wrap}>
      <Header onBack={onBack} title={t.reference || 'Facture'} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {/* Bilan */}
        <Card>
          <View style={s.bilanHead}>
            <SectionTitle>Bilan</SectionTitle>
            <Badge text={statusLbl} kind={statusKind} />
          </View>
          <Row k="Prix total" v={fcfa(prix)} />
          <Row k="Montant payé" v={fcfa(paye)} color={colors.green} />
          {mag > 0 && <Row k="Frais de magasinage" v={fcfa(mag)} color="#c2410c" />}
          <Row k="Reste à payer" v={fcfa(reste)} color={reste > 0 ? colors.red : colors.green} bold />
        </Card>

        {/* Infos */}
        <Card>
          <SectionTitle>Informations</SectionTitle>
          <Row k="Expéditeur" v={String(t.nom || '—').replace(/(\+?\d[\d\s.\-]{6,}\d)/g, '').trim() || '—'} />
          <Row k="Destinataire" v={t.nomDestinataire || '—'} />
          <Row k="Date" v={fdate(t.date)} />
          {!!t.conteneur && <Row k="Conteneur" v={t.conteneur} />}
        </Card>

        {/* Suivi colis */}
        <Card>
          <SectionTitle>Suivi des colis</SectionTitle>
          {colis.length === 0 ? <Text style={s.muted}>Aucun colis rattaché.</Text> :
            colis.map((c, i) => (
              <View key={i} style={[s.colis, i > 0 && s.colisBorder]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.colisRef}>{c.label}</Text>
                  {!!c.desc && <Text style={s.muted}>{c.desc}</Text>}
                </View>
                <Text style={s.stage}>{STAGES[c.stage]}</Text>
              </View>
            ))}
        </Card>

        <Btn label={pdfBusy ? 'Génération…' : '📄 Télécharger le PDF'} onPress={exportPdf} busy={pdfBusy} />
        <Text style={s.note}>Le PDF officiel inclut les conditions générales et un récapitulatif financier.</Text>
      </ScrollView>
    </View>
  );
}

function Header({ onBack, title }) {
  return (
    <View style={s.header}>
      <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><Text style={s.back}>‹</Text></TouchableOpacity>
      <Text style={s.hTitle} numberOfLines={1}>{title}</Text>
      <View style={{ width: 24 }} />
    </View>
  );
}
function Row({ k, v, color, bold }) {
  return (
    <View style={s.row}>
      <Text style={s.rowK}>{k}</Text>
      <Text style={[s.rowV, color && { color }, bold && { fontWeight: '800' }]}>{v}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.blue, paddingTop: 50, paddingBottom: 14, paddingHorizontal: 14 },
  back: { color: '#fff', fontSize: 30, fontWeight: '800', width: 24 },
  hTitle: { color: '#fff', fontSize: 17, fontWeight: '800', flex: 1, textAlign: 'center' },
  bilanHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderTopWidth: 1, borderTopColor: colors.line },
  rowK: { color: colors.muted, fontSize: 13 },
  rowV: { color: colors.ink, fontWeight: '700', fontSize: 13 },
  colis: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  colisBorder: { borderTopWidth: 1, borderTopColor: colors.line },
  colisRef: { fontWeight: '700', color: colors.blue, fontSize: 13 },
  stage: { fontSize: 12, color: colors.ink },
  muted: { color: colors.muted, fontSize: 12 },
  note: { fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 8, lineHeight: 18 },
  err: { color: colors.red, textAlign: 'center', padding: 30, fontWeight: '600' },
});
