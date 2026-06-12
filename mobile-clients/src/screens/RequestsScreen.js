// Onglet DÉPÔT / RÉCUP (expéditeurs) : liste des demandes + formulaire (création
// ET modification tant que le RDV n'est pas fixé). Champs complets : étage/
// bâtiment, téléphone, accès au bâtiment, adresse, date (calendrier), créneau,
// description. Quand le staff propose une date (statut 'modifiee') : accepter/refuser.
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Card, SectionTitle, Btn, Empty, Loading, Badge } from '../components/ui';
import { colors, fdate } from '../theme';
import { api } from '../api';
import AvailabilityCalendar from '../components/AvailabilityCalendar';
import { useLang, tr } from '../i18n';

const STATUS = {
  en_attente: ['En attente', 'wait'], modifiee: ['Nouvelle date proposée', 'info'],
  confirmee: ['Confirmée', 'paid'], traitee: ['RDV fixé', 'paid'], refusee: ['Refusée', 'bad'], annulee: ['Annulée', 'bad'],
};
const ACCES = ['Interphone', 'Code / Digicode', 'Aucun / Accès libre'];

export default function RequestsScreen({ selfName, selfAddress, selfPhone }) {
  const { t } = useLang();
  const [tab, setTab] = useState('list'); // list | form
  const [editId, setEditId] = useState(null); // id si modification, sinon création
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState([]);
  const [sending, setSending] = useState(false);
  // champs du formulaire
  const [f, setF] = useState({});
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));

  const load = async () => {
    setLoading(true);
    try { const r = await api.getMyRequests(); setRequests(r.requests || []); }
    catch (e) { setRequests([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  // Ouvre le formulaire en CRÉATION (type donné) ou en MODIFICATION (req).
  const openForm = (type, req) => {
    if (req) {
      setEditId(req.id);
      setF({
        type: req.type || 'depot', fullName: req.fullName || selfName || '', commune: req.commune || '',
        address: req.address || '', date: req.wantedDate || '', slot: req.wantedTime || 'Matin (10H-12H)',
        desc: req.description || '', etage: req.etage || '', contactTel: req.contactTel || selfPhone || '',
        acces: req.acces || '', codeAcces: req.codeAcces || '',
      });
    } else {
      setEditId(null);
      setF({ type, fullName: selfName || '', commune: '', address: selfAddress || '', date: '', slot: 'Matin (10H-12H)', desc: '', etage: '', contactTel: selfPhone || '', acces: '', codeAcces: '' });
    }
    setTab('form');
  };

  const submit = async () => {
    if (!String(f.commune || '').trim() && !String(f.address || '').trim()) { Alert.alert(tr('Adresse requise'), tr('Indiquez au moins une commune ou une adresse.')); return; }
    if (!String(f.contactTel || '').trim()) { Alert.alert(tr('Téléphone requis'), tr('Indiquez un téléphone de contact.')); return; }
    if (!String(f.acces || '').trim()) { Alert.alert(tr('Accès requis'), tr("Précisez l'accès au bâtiment.")); return; }
    setSending(true);
    const payload = {
      type: f.type, fullName: (f.fullName || '').trim(), commune: (f.commune || '').trim(),
      address: (f.address || '').trim(), date: (f.date || '').trim(), time: f.slot,
      description: (f.desc || '').trim(), etage: (f.etage || '').trim(), contactTel: (f.contactTel || '').trim(),
      acces: f.acces, codeAcces: (f.codeAcces || '').trim(),
    };
    try {
      if (editId) await api.updateClientRequest({ id: editId, ...payload });
      else await api.createClientRequest(payload);
      setTab('list'); await load();
    } catch (e) {
      Alert.alert(tr('Erreur'), e?.code === 'already-exists' ? tr("Vous avez déjà une demande de ce type en cours.") : (e?.message || tr("Envoi impossible.")));
    } finally { setSending(false); }
  };

  const respond = async (id, action) => {
    try { await api.respondClientRequest(id, action); await load(); } catch (e) { Alert.alert(tr('Erreur'), tr('Action impossible.')); }
  };
  const cancel = (id) => Alert.alert(tr('Annuler'), tr('Annuler cette demande ?'), [
    { text: tr('Non'), style: 'cancel' },
    { text: tr('Oui'), style: 'destructive', onPress: async () => { try { await api.cancelClientRequest(id); await load(); } catch (e) {} } },
  ]);

  if (loading) return <Loading text={t('Chargement de vos demandes…')} />;

  if (tab === 'form') {
    const isRecup = f.type === 'recup';
    return (
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => setTab('list')}><Text style={s.back}>{t('← Mes demandes')}</Text></TouchableOpacity>
        <Card>
          <SectionTitle>{editId ? t('Modifier la demande') : (isRecup ? t('Nouvelle récupération') : t('Nouveau dépôt'))}</SectionTitle>
          <View style={[s.modeBanner, isRecup && s.modeBannerRecup]}>
            <Text style={[s.modeBannerTxt, isRecup && s.modeBannerTxtRecup]}>{isRecup ? t('🔄 Récupération') : t('📦 Dépôt')}</Text>
          </View>

          <L>{t('Nom complet')}</L>
          <TextInput style={s.in} value={f.fullName} onChangeText={(v) => set('fullName', v)} placeholder={t('Votre nom')} placeholderTextColor={colors.muted} />

          <L>{t('Téléphone *')}</L>
          <TextInput style={s.in} value={f.contactTel} onChangeText={(v) => set('contactTel', v)} keyboardType="phone-pad" placeholder={t('Contact sur place')} placeholderTextColor={colors.muted} />

          <L>{t('Commune / Ville')}</L>
          <TextInput style={s.in} value={f.commune} onChangeText={(v) => set('commune', v)} placeholder={t('Ex : Cocody, Paris…')} placeholderTextColor={colors.muted} />

          <L>{isRecup ? t('Adresse de livraison / récupération') : t("Adresse d'enlèvement")}</L>
          <TextInput style={s.in} value={f.address} onChangeText={(v) => set('address', v)} placeholder={t('Quartier, rue, repère')} placeholderTextColor={colors.muted} />

          <L>{t('Étage / Bâtiment *')}</L>
          <TextInput style={s.in} value={f.etage} onChangeText={(v) => set('etage', v)} placeholder={t('Ex : Bât. B, 3e étage')} placeholderTextColor={colors.muted} />

          <L>{t('Accès au bâtiment *')}</L>
          <View style={s.chips}>
            {ACCES.map(a => <Pick key={a} active={f.acces === a} label={t(a)} onPress={() => set('acces', a)} small />)}
          </View>
          {(f.acces === 'Interphone' || f.acces === 'Code / Digicode') && (
            <TextInput style={s.in} value={f.codeAcces} onChangeText={(v) => set('codeAcces', v)} placeholder={f.acces === 'Code / Digicode' ? t('Code / digicode') : t("Nom à l'interphone")} placeholderTextColor={colors.muted} />
          )}

          <L>{t('Date souhaitée')}</L>
          {f.date ? <Text style={s.dateSel}>📅 {fdate(f.date)}</Text> : <Text style={s.muted}>{t('Choisissez un jour disponible ci-dessous.')}</Text>}
          <AvailabilityCalendar selected={f.date} onSelect={(v) => set('date', v)} />

          <L>{t('Créneau souhaité')}</L>
          <View style={s.chips}>
            <Pick active={(f.slot || '').startsWith('Matin')} label={t('Matin (10H-12H)')} onPress={() => set('slot', 'Matin (10H-12H)')} />
            <Pick active={(f.slot || '').startsWith('Après')} label={t('Après-midi (12H-18H)')} onPress={() => set('slot', 'Après-midi (12H-18H)')} />
          </View>

          <L>{t('Description du colis')}</L>
          <TextInput style={[s.in, { height: 70 }]} value={f.desc} onChangeText={(v) => set('desc', v)} placeholder={t('Ex : 2 cartons, 1 valise…')} placeholderTextColor={colors.muted} multiline />

          <Btn label={editId ? t('Enregistrer les modifications') : t('Envoyer la demande')} onPress={submit} busy={sending} />
        </Card>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
        <Btn label={t('📦 Dépôt')} onPress={() => openForm('depot')} style={{ flex: 1, marginTop: 0 }} />
        <Btn label={t('🔄 Récup')} kind="gold" onPress={() => openForm('recup')} style={{ flex: 1, marginTop: 0 }} />
      </View>
      {requests.length === 0 ? (
        <Empty icon="📦" text={t('Aucune demande pour le moment.')} />
      ) : requests.map((r) => {
        const [lbl, kind] = STATUS[r.status] || STATUS.en_attente;
        const editable = r.status === 'en_attente' || r.status === 'modifiee';
        return (
          <Card key={r.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={s.type}>{r.type === 'recup' ? t('🔄 Récupération') : t('📦 Dépôt')}</Text>
              <Badge text={t(lbl)} kind={kind} />
            </View>
            {!!(r.commune || r.address) && <Text style={s.det}>📍 {[r.commune, r.address].filter(Boolean).join(' · ')}{r.etage ? ' — 🏢 ' + r.etage : ''}</Text>}
            {!!r.contactTel && <Text style={s.det}>📞 {r.contactTel}</Text>}
            <Text style={s.det}>🗓️ {t('Souhaité')} : {fdate(r.wantedDate)}{r.wantedTime ? ` (${r.wantedTime})` : ''}</Text>
            {r.status === 'modifiee' && (
              <View style={s.propose}>
                <Text style={s.proposeT}>{t("L'agence propose")} : {fdate(r.staffDate)} {r.staffTime ? `(${r.staffTime})` : ''}</Text>
                {!!r.staffNote && <Text style={s.det}>📝 {r.staffNote}</Text>}
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                  <Btn label={t('✅ Accepter')} onPress={() => respond(r.id, 'accept')} style={{ flex: 1, marginTop: 0 }} />
                  <Btn label={t('✕ Refuser')} kind="ghost" onPress={() => respond(r.id, 'refuse')} style={{ flex: 1, marginTop: 0 }} />
                </View>
              </View>
            )}
            {editable && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
                <TouchableOpacity onPress={() => openForm(r.type, r)}><Text style={s.edit}>{t('✏️ Modifier')}</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => cancel(r.id)}><Text style={s.cancel}>{t('Annuler')}</Text></TouchableOpacity>
              </View>
            )}
          </Card>
        );
      })}
    </ScrollView>
  );
}

function L({ children }) { return <Text style={s.lbl}>{children}</Text>; }
function Pick({ active, label, onPress, small }) {
  return (
    <TouchableOpacity style={[s.pick, active && s.pickOn, small && { flexBasis: '48%', flexGrow: 0 }]} onPress={onPress} activeOpacity={0.7}>
      <Text style={[s.pickTxt, active && { color: colors.blue }]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  back: { color: colors.muted, fontWeight: '600', marginBottom: 8 },
  lbl: { fontSize: 12, fontWeight: '700', color: colors.muted, marginTop: 10, marginBottom: 5 },
  in: { borderWidth: 1, borderColor: colors.line, borderRadius: 11, padding: 11, fontSize: 14, color: colors.ink, marginBottom: 2 },
  muted: { color: colors.muted, fontSize: 12.5, marginBottom: 4 },
  dateSel: { color: colors.blue, fontWeight: '700', fontSize: 14, marginBottom: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  pick: { flexGrow: 1, flexBasis: 0, paddingVertical: 11, paddingHorizontal: 8, borderRadius: 12, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', backgroundColor: '#fff' },
  pickOn: { borderColor: colors.blue, backgroundColor: '#eef4fb' },
  modeBanner: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#eef4fb', borderWidth: 1.5, borderColor: colors.blue, borderRadius: 12, paddingVertical: 12, marginTop: 2, marginBottom: 8 },
  modeBannerRecup: { backgroundColor: '#fff7e6', borderColor: colors.gold || '#FDC615' },
  modeBannerTxt: { color: colors.blue, fontWeight: '800', fontSize: 15 },
  modeBannerTxtRecup: { color: '#92600a' },
  pickTxt: { color: colors.muted, fontWeight: '700', fontSize: 13 },
  type: { fontWeight: '800', color: colors.blue, fontSize: 14 },
  det: { fontSize: 13, color: colors.muted, marginTop: 6 },
  propose: { backgroundColor: '#eff6ff', borderRadius: 10, padding: 10, marginTop: 10 },
  proposeT: { fontWeight: '700', color: colors.blue, fontSize: 13 },
  edit: { color: colors.blue, fontWeight: '700', fontSize: 13 },
  cancel: { color: colors.red, fontWeight: '600', fontSize: 13 },
});
