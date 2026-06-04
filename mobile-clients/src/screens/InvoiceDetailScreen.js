// Écran DÉTAIL FACTURE : bilan financier, infos client, suivi colis-par-colis,
// téléchargement/partage du PDF officiel.
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Share } from 'react-native';
import { Card, SectionTitle, Btn, Badge, Loading } from '../components/ui';
import { colors, fcfa, fdate } from '../theme';
import { api } from '../api';
import { shareInvoicePdf, saveInvoicePdf } from '../invoicePdf';
import { useLang, tr } from '../i18n';

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
  const { t: T } = useLang();
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try { setDetail(await api.getMyInvoiceDetail(reference)); }
      catch (e) { setError(e?.code === 'permission-denied' ? "Facture introuvable." : "Chargement impossible."); }
    })();
  }, [reference]);

  const runPdf = async (fn, okMsg) => {
    setPdfBusy(true);
    try { const r = await fn(detail); if (okMsg && r && r.saved) Alert.alert('PDF', okMsg); }
    catch (e) { Alert.alert('PDF', "Génération impossible pour le moment."); }
    finally { setPdfBusy(false); }
  };
  // Partage un LIEN de suivi public (page web sans compte) au destinataire.
  const shareTracking = async () => {
    if (!detail.collection || !detail.transDocId) { Alert.alert('Suivi', "Lien de suivi indisponible pour cette facture."); return; }
    const url = `https://app-caisse.vercel.app/suivi.html?c=${encodeURIComponent(detail.collection)}&id=${encodeURIComponent(detail.transDocId)}`;
    try {
      await Share.share({ message: `📦 Suivez le colis ${(detail.transaction && detail.transaction.reference) || ''} (AMT Trans'it) :\n${url}` });
    } catch (e) { /* partage annulé */ }
  };

  // Propose : enregistrer le PDF dans un dossier (Téléchargements…) ou le partager.
  const exportPdf = () => {
    Alert.alert('Facture PDF', 'Que souhaitez-vous faire ?', [
      { text: '💾 Enregistrer dans un dossier', onPress: () => runPdf(saveInvoicePdf, 'Facture enregistrée ✅') },
      { text: '📤 Partager (WhatsApp, mail…)', onPress: () => runPdf(shareInvoicePdf) },
      { text: 'Annuler', style: 'cancel' },
    ]);
  };

  if (error) return (
    <View style={s.wrap}><Header onBack={onBack} title={T('Facture')} /><Text style={s.err}>{T(error)}</Text></View>
  );
  if (!detail) return (<View style={s.wrap}><Header onBack={onBack} title={T('Facture')} /><Loading text={T('Chargement de la facture…')} /></View>);

  const t = detail.transaction || {};
  const prix = Number(t.prix) || 0;
  const paye = (Number(t.montantParis) || 0) + (Number(t.montantAbidjan) || 0);
  const mag = Number(detail.magasinageFee) || 0;
  let reste = prix - (Number(detail.reduction) || 0) + mag - paye;
  if (reste < 0) reste = 0;
  const statusKind = reste <= 0 ? 'paid' : (paye > 0 ? 'wait' : 'bad');
  const statusLbl = reste <= 0 ? T('Payée') : (paye > 0 ? T('Acompte') : T('Impayée'));

  // Date estimée d'arrivée : depuis la date de départ + délai selon le mode
  // (aérien ~8 j, maritime ~40 j). Si déjà arrivé/livré, on l'indique.
  const liv0 = (detail.livraisons || [])[0] || {};
  const etaMode = liv0.modeExpedition === 'aerien' ? 'aerien' : 'maritime';
  let etaText = '';
  if (liv0.status === 'LIVRE') etaText = T('Livré ✅');
  else if (liv0.arrivalDate) etaText = `${T('Arrivé le')} ${fdate(liv0.arrivalDate)}`;
  else if (liv0.departureDate) {
    const d = new Date(liv0.departureDate);
    if (!isNaN(d)) { d.setDate(d.getDate() + (etaMode === 'aerien' ? 8 : 40)); etaText = `~ ${fdate(d.toISOString())} ${T('(estimée)')}`; }
  } else etaText = T('À confirmer (pas encore parti)');

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
        {/* Alerte magasinage : frais de stockage qui augmentent tant que les
            colis ne sont pas récupérés / la facture pas réglée. */}
        {mag > 0 && (
          <View style={s.magAlert}>
            <Text style={s.magAlertTitle}>{T('⚠️ Frais de magasinage en cours')}</Text>
            <Text style={s.magAlertTxt}>
              {T('Des frais de stockage de')} {fcfa(mag)} {T("s'appliquent et")} <Text style={{ fontWeight: '800' }}>{T('augmentent chaque jour')}</Text> {T("tant que les colis ne sont pas récupérés. Récupérez-les ou réglez la facture au plus vite.")}
            </Text>
          </View>
        )}

        {/* Bilan */}
        <Card>
          <View style={s.bilanHead}>
            <SectionTitle>{T('Bilan')}</SectionTitle>
            <Badge text={statusLbl} kind={statusKind} />
          </View>
          <Row k={T('Prix total')} v={fcfa(prix)} />
          <Row k={T('Montant payé')} v={fcfa(paye)} color={colors.green} />
          {mag > 0 && <Row k={T('Frais de magasinage')} v={fcfa(mag)} color="#c2410c" />}
          <Row k={T('Reste à payer')} v={fcfa(reste)} color={reste > 0 ? colors.red : colors.green} bold />
        </Card>

        {/* Infos */}
        <Card>
          <SectionTitle>{T('Informations')}</SectionTitle>
          <Row k={T('Expéditeur')} v={String(t.nom || '—').replace(/(\+?\d[\d\s.\-]{6,}\d)/g, '').trim() || '—'} />
          <Row k={T('Destinataire')} v={t.nomDestinataire || '—'} />
          <Row k={T('Date')} v={fdate(t.date)} />
          {!!t.conteneur && <Row k={T('Conteneur')} v={t.conteneur} />}
          {!!etaText && <Row k={T('Arrivée estimée')} v={etaText} color={liv0.status === 'LIVRE' ? colors.green : colors.blue} />}
        </Card>

        {/* Suivi colis */}
        <Card>
          <SectionTitle>{T('Suivi des colis')}</SectionTitle>
          {colis.length === 0 ? <Text style={s.muted}>{T('Aucun colis rattaché.')}</Text> :
            colis.map((c, i) => (
              <View key={i} style={[s.colis, i > 0 && s.colisBorder]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.colisRef}>{c.label}</Text>
                  {!!c.desc && <Text style={s.muted}>{c.desc}</Text>}
                </View>
                <Text style={s.stage}>{tr(STAGES[c.stage])}</Text>
              </View>
            ))}
        </Card>

        <Btn label={T('🔗 Partager le suivi du colis')} kind="gold" onPress={shareTracking} />
        <Btn label={pdfBusy ? T('Génération…') : T('📄 Enregistrer / Partager le PDF')} onPress={exportPdf} busy={pdfBusy} />
        <Text style={s.note}>{T('« Enregistrer en PDF » place le fichier dans vos Téléchargements. Le PDF officiel inclut les conditions générales et le récapitulatif financier.')}</Text>
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
  magAlert: { backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA', borderRadius: 14, padding: 14, marginBottom: 14 },
  magAlertTitle: { color: '#C2410C', fontWeight: '800', fontSize: 14, marginBottom: 4 },
  magAlertTxt: { color: '#9A3412', fontSize: 12.5, lineHeight: 18 },
});
