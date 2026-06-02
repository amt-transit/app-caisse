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

const STATUS = {
  en_attente: ['En attente', 'wait'], modifiee: ['Nouvelle date proposée', 'info'],
  confirmee: ['Confirmée', 'paid'], traitee: ['RDV fixé', 'paid'], refusee: ['Refusée', 'bad'], annulee: ['Annulée', 'bad'],
};
const ACCES = ['Interphone', 'Code / Digicode', 'Aucun / Accès libre'];

export default function RequestsScreen({ selfName, selfAddress, selfPhone }) {
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
    if (!String(f.commune || '').trim() && !String(f.address || '').trim()) { Alert.alert('Adresse requise', 'Indiquez au moins une commune ou une adresse.'); return; }
    if (!String(f.contactTel || '').trim()) { Alert.alert('Téléphone requis', 'Indiquez un téléphone de contact.'); return; }
    if (!String(f.acces || '').trim()) { Alert.alert('Accès requis', "Précisez l'accès au bâtiment."); return; }
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
      Alert.alert('Erreur', e?.code === 'already-exists' ? "Vous avez déjà une demande de ce type en cours." : (e?.message || "Envoi impossible."));
    } finally { setSending(false); }
  };

  const respond = async (id, action) => {
    try { await api.respondClientRequest(id, action); await load(); } catch (e) { Alert.alert('Erreur', 'Action impossible.'); }
  };
  const cancel = (id) => Alert.alert('Annuler', 'Annuler cette demande ?', [
    { text: 'Non', style: 'cancel' },
    { text: 'Oui', style: 'destructive', onPress: async () => { try { await api.cancelClientRequest(id); await load(); } catch (e) {} } },
  ]);

  if (loading) return <Loading text="Chargement de vos demandes…" />;

  if (tab === 'form') {
    const isRecup = f.type === 'recup';
    return (
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => setTab('list')}><Text style={s.back}>← Mes demandes</Text></TouchableOpacity>
        <Card>
          <SectionTitle>{editId ? 'Modifier la demande' : 'Nouvelle demande'}</SectionTitle>
          <View style={s.chips}>
            <Pick active={f.type === 'depot'} label="📦 Dépôt" onPress={() => set('type', 'depot')} />
            <Pick active={f.type === 'recup'} label="🔄 Récupération" onPress={() => set('type', 'recup')} />
          </View>

          <L>Nom complet</L>
          <TextInput style={s.in} value={f.fullName} onChangeText={(v) => set('fullName', v)} placeholder="Votre nom" placeholderTextColor={colors.muted} />

          <L>Téléphone *</L>
          <TextInput style={s.in} value={f.contactTel} onChangeText={(v) => set('contactTel', v)} keyboardType="phone-pad" placeholder="Contact sur place" placeholderTextColor={colors.muted} />

          <L>Commune / Ville</L>
          <TextInput style={s.in} value={f.commune} onChangeText={(v) => set('commune', v)} placeholder="Ex : Cocody, Paris…" placeholderTextColor={colors.muted} />

          <L>{isRecup ? 'Adresse de livraison / récupération' : "Adresse d'enlèvement"}</L>
          <TextInput style={s.in} value={f.address} onChangeText={(v) => set('address', v)} placeholder="Quartier, rue, repère" placeholderTextColor={colors.muted} />

          <L>Étage / Bâtiment *</L>
          <TextInput style={s.in} value={f.etage} onChangeText={(v) => set('etage', v)} placeholder="Ex : Bât. B, 3e étage" placeholderTextColor={colors.muted} />

          <L>Accès au bâtiment *</L>
          <View style={s.chips}>
            {ACCES.map(a => <Pick key={a} active={f.acces === a} label={a} onPress={() => set('acces', a)} small />)}
          </View>
          {(f.acces === 'Interphone' || f.acces === 'Code / Digicode') && (
            <TextInput style={s.in} value={f.codeAcces} onChangeText={(v) => set('codeAcces', v)} placeholder={f.acces === 'Code / Digicode' ? 'Code / digicode' : "Nom à l'interphone"} placeholderTextColor={colors.muted} />
          )}

          <L>Date souhaitée</L>
          {f.date ? <Text style={s.dateSel}>📅 {fdate(f.date)}</Text> : <Text style={s.muted}>Choisissez un jour disponible ci-dessous.</Text>}
          <AvailabilityCalendar selected={f.date} onSelect={(v) => set('date', v)} />

          <L>Créneau souhaité</L>
          <View style={s.chips}>
            <Pick active={(f.slot || '').startsWith('Matin')} label="Matin (10H-12H)" onPress={() => set('slot', 'Matin (10H-12H)')} />
            <Pick active={(f.slot || '').startsWith('Après')} label="Après-midi (12H-18H)" onPress={() => set('slot', 'Après-midi (12H-18H)')} />
          </View>

          <L>Description du colis</L>
          <TextInput style={[s.in, { height: 70 }]} value={f.desc} onChangeText={(v) => set('desc', v)} placeholder="Ex : 2 cartons, 1 valise…" placeholderTextColor={colors.muted} multiline />

          <Btn label={editId ? 'Enregistrer les modifications' : 'Envoyer la demande'} onPress={submit} busy={sending} />
        </Card>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
        <Btn label="📦 Dépôt" onPress={() => openForm('depot')} style={{ flex: 1, marginTop: 0 }} />
        <Btn label="🔄 Récup" kind="gold" onPress={() => openForm('recup')} style={{ flex: 1, marginTop: 0 }} />
      </View>
      {requests.length === 0 ? (
        <Empty icon="📦" text="Aucune demande pour le moment." />
      ) : requests.map((r) => {
        const [lbl, kind] = STATUS[r.status] || STATUS.en_attente;
        const editable = r.status === 'en_attente' || r.status === 'modifiee';
        return (
          <Card key={r.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={s.type}>{r.type === 'recup' ? '🔄 Récupération' : '📦 Dépôt'}</Text>
              <Badge text={lbl} kind={kind} />
            </View>
            {!!(r.commune || r.address) && <Text style={s.det}>📍 {[r.commune, r.address].filter(Boolean).join(' · ')}{r.etage ? ' — 🏢 ' + r.etage : ''}</Text>}
            {!!r.contactTel && <Text style={s.det}>📞 {r.contactTel}</Text>}
            <Text style={s.det}>🗓️ Souhaité : {fdate(r.wantedDate)}{r.wantedTime ? ` (${r.wantedTime})` : ''}</Text>
            {r.status === 'modifiee' && (
              <View style={s.propose}>
                <Text style={s.proposeT}>L'agence propose : {fdate(r.staffDate)} {r.staffTime ? `(${r.staffTime})` : ''}</Text>
                {!!r.staffNote && <Text style={s.det}>📝 {r.staffNote}</Text>}
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                  <Btn label="✅ Accepter" onPress={() => respond(r.id, 'accept')} style={{ flex: 1, marginTop: 0 }} />
                  <Btn label="✕ Refuser" kind="ghost" onPress={() => respond(r.id, 'refuse')} style={{ flex: 1, marginTop: 0 }} />
                </View>
              </View>
            )}
            {editable && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
                <TouchableOpacity onPress={() => openForm(r.type, r)}><Text style={s.edit}>✏️ Modifier</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => cancel(r.id)}><Text style={s.cancel}>Annuler</Text></TouchableOpacity>
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
  pickTxt: { color: colors.muted, fontWeight: '700', fontSize: 13 },
  type: { fontWeight: '800', color: colors.blue, fontSize: 14 },
  det: { fontSize: 13, color: colors.muted, marginTop: 6 },
  propose: { backgroundColor: '#eff6ff', borderRadius: 10, padding: 10, marginTop: 10 },
  proposeT: { fontWeight: '700', color: colors.blue, fontSize: 13 },
  edit: { color: colors.blue, fontWeight: '700', fontSize: 13 },
  cancel: { color: colors.red, fontWeight: '600', fontSize: 13 },
});
