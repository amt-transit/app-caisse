// Onglet DÉPÔT / RÉCUP (expéditeurs) : liste des demandes + formulaire.
// Quand le staff propose une nouvelle date (statut 'modifiee'), le client
// accepte/refuse. (Le calendrier de places dispo viendra dans une étape suivante.)
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Card, SectionTitle, Btn, Empty, Loading, Badge } from '../components/ui';
import { colors, fdate } from '../theme';
import { api } from '../api';

const STATUS = {
  en_attente: ['En attente', 'wait'], modifiee: ['Nouvelle date proposée', 'info'],
  confirmee: ['Confirmée', 'paid'], traitee: ['RDV fixé', 'paid'], refusee: ['Refusée', 'bad'],
};

export default function RequestsScreen({ selfName, selfAddress }) {
  const [tab, setTab] = useState('list'); // list | form
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState([]);
  // formulaire
  const [type, setType] = useState('depot');
  const [fullName, setFullName] = useState(selfName || '');
  const [commune, setCommune] = useState('');
  const [address, setAddress] = useState(selfAddress || '');
  const [date, setDate] = useState('');
  const [slot, setSlot] = useState('Matin (10H-12H)');
  const [desc, setDesc] = useState('');
  const [sending, setSending] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const r = await api.getMyRequests(); setRequests(r.requests || []); }
    catch (e) { setRequests([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!commune.trim() && !address.trim()) { Alert.alert('Adresse requise', 'Indiquez au moins une commune ou une adresse.'); return; }
    setSending(true);
    try {
      await api.createClientRequest({ type, fullName: fullName.trim(), commune: commune.trim(), address: address.trim(), date: date.trim(), time: slot, description: desc.trim() });
      setDesc(''); setDate(''); setTab('list'); await load();
    } catch (e) {
      Alert.alert('Erreur', e?.code === 'already-exists' ? "Vous avez déjà une demande de ce type en cours." : "Envoi impossible.");
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
    return (
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <TouchableOpacity onPress={() => setTab('list')}><Text style={s.back}>← Mes demandes</Text></TouchableOpacity>
        <Card>
          <SectionTitle>Nouvelle demande</SectionTitle>
          <View style={s.chips}>
            <Pick active={type === 'depot'} label="📦 Dépôt" onPress={() => setType('depot')} />
            <Pick active={type === 'recup'} label="🔄 Récupération" onPress={() => setType('recup')} />
          </View>
          <L>Nom complet</L>
          <TextInput style={s.in} value={fullName} onChangeText={setFullName} placeholder="Votre nom" placeholderTextColor={colors.muted} />
          <L>Commune / Ville</L>
          <TextInput style={s.in} value={commune} onChangeText={setCommune} placeholder="Ex : Cocody, Paris…" placeholderTextColor={colors.muted} />
          <L>{type === 'recup' ? 'Adresse de livraison / récupération' : "Adresse d'enlèvement"}</L>
          <TextInput style={s.in} value={address} onChangeText={setAddress} placeholder="Quartier, rue, repère" placeholderTextColor={colors.muted} />
          <L>Date souhaitée (JJ/MM/AAAA)</L>
          <TextInput style={s.in} value={date} onChangeText={setDate} placeholder="ex : 2026-06-15" placeholderTextColor={colors.muted} />
          <L>Créneau souhaité</L>
          <View style={s.chips}>
            <Pick active={slot.startsWith('Matin')} label="Matin (10H-12H)" onPress={() => setSlot('Matin (10H-12H)')} />
            <Pick active={slot.startsWith('Après')} label="Après-midi (12H-18H)" onPress={() => setSlot('Après-midi (12H-18H)')} />
          </View>
          <L>Description du colis</L>
          <TextInput style={[s.in, { height: 70 }]} value={desc} onChangeText={setDesc} placeholder="Ex : 2 cartons, 1 valise…" placeholderTextColor={colors.muted} multiline />
          <Btn label="Envoyer la demande" onPress={submit} busy={sending} />
        </Card>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
        <Btn label="📦 Dépôt" onPress={() => { setType('depot'); setTab('form'); }} style={{ flex: 1, marginTop: 0 }} />
        <Btn label="🔄 Récup" kind="gold" onPress={() => { setType('recup'); setTab('form'); }} style={{ flex: 1, marginTop: 0 }} />
      </View>
      {requests.length === 0 ? (
        <Empty icon="📦" text="Aucune demande pour le moment." />
      ) : requests.map((r) => {
        const [lbl, kind] = STATUS[r.status] || STATUS.en_attente;
        return (
          <Card key={r.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={s.type}>{r.type === 'recup' ? '🔄 Récupération' : '📦 Dépôt'}</Text>
              <Badge text={lbl} kind={kind} />
            </View>
            {!!(r.commune || r.address) && <Text style={s.det}>📍 {[r.commune, r.address].filter(Boolean).join(' · ')}</Text>}
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
            {(r.status === 'en_attente' || r.status === 'modifiee') && (
              <TouchableOpacity onPress={() => cancel(r.id)}><Text style={s.cancel}>Annuler ma demande</Text></TouchableOpacity>
            )}
          </Card>
        );
      })}
    </ScrollView>
  );
}

function L({ children }) { return <Text style={s.lbl}>{children}</Text>; }
function Pick({ active, label, onPress }) {
  return (
    <TouchableOpacity style={[s.pick, active && s.pickOn]} onPress={onPress} activeOpacity={0.7}>
      <Text style={[s.pickTxt, active && { color: colors.blue }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  back: { color: colors.muted, fontWeight: '600', marginBottom: 8 },
  lbl: { fontSize: 12, fontWeight: '700', color: colors.muted, marginTop: 10, marginBottom: 5 },
  in: { borderWidth: 1, borderColor: colors.line, borderRadius: 11, padding: 11, fontSize: 14, color: colors.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  pick: { flex: 1, paddingVertical: 11, borderRadius: 12, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', backgroundColor: '#fff' },
  pickOn: { borderColor: colors.blue, backgroundColor: '#eef4fb' },
  pickTxt: { color: colors.muted, fontWeight: '700', fontSize: 13 },
  type: { fontWeight: '800', color: colors.blue, fontSize: 14 },
  det: { fontSize: 13, color: colors.muted, marginTop: 6 },
  propose: { backgroundColor: '#eff6ff', borderRadius: 10, padding: 10, marginTop: 10 },
  proposeT: { fontWeight: '700', color: colors.blue, fontSize: 13 },
  cancel: { color: colors.red, fontWeight: '600', marginTop: 10, fontSize: 13 },
});
