// Onglet CARNET DE DESTINATAIRES : le client enregistre ses destinataires
// habituels (nom, téléphone, adresse, commune) pour les réutiliser plus vite.
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Card, SectionTitle, Btn, Loading, Empty } from '../components/ui';
import { colors } from '../theme';
import { api } from '../api';

const blank = { id: '', nom: '', telephone: '', adresse: '', commune: '' };

export default function ContactsScreen() {
  const [contacts, setContacts] = useState(null);
  const [editing, setEditing] = useState(null); // objet en cours d'édition (ou null)
  const [saving, setSaving] = useState(false);

  const load = async () => { try { const r = await api.getMyContacts(); setContacts(r.contacts || []); } catch (e) { setContacts([]); } };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing.nom.trim()) { Alert.alert('Carnet', 'Le nom est obligatoire.'); return; }
    setSaving(true);
    try {
      await api.saveMyContact({
        id: editing.id || undefined,
        nom: editing.nom, telephone: editing.telephone, adresse: editing.adresse, commune: editing.commune,
      });
      setEditing(null);
      await load();
    } catch (e) { Alert.alert('Carnet', "Enregistrement impossible."); }
    finally { setSaving(false); }
  };

  const remove = (ct) => {
    Alert.alert('Supprimer ?', `Retirer ${ct.nom} du carnet ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => { try { await api.deleteMyContact(ct.id); await load(); } catch (e) {} } },
    ]);
  };

  if (contacts === null) return <Loading text="Chargement du carnet…" />;

  // Formulaire (ajout / édition)
  if (editing) {
    const set = (k, v) => setEditing(e => ({ ...e, [k]: v }));
    return (
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Card>
          <SectionTitle>{editing.id ? 'Modifier le destinataire' : 'Nouveau destinataire'}</SectionTitle>
          <Text style={s.lbl}>Nom complet *</Text>
          <TextInput style={s.input} value={editing.nom} onChangeText={(v) => set('nom', v)} placeholder="Nom et prénom" placeholderTextColor={colors.muted} />
          <Text style={s.lbl}>Téléphone</Text>
          <TextInput style={s.input} value={editing.telephone} onChangeText={(v) => set('telephone', v)} placeholder="Numéro du destinataire" placeholderTextColor={colors.muted} keyboardType="phone-pad" />
          <Text style={s.lbl}>Commune / ville</Text>
          <TextInput style={s.input} value={editing.commune} onChangeText={(v) => set('commune', v)} placeholder="Ex : Cocody" placeholderTextColor={colors.muted} />
          <Text style={s.lbl}>Adresse de livraison</Text>
          <TextInput style={[s.input, { height: 64, textAlignVertical: 'top' }]} value={editing.adresse} onChangeText={(v) => set('adresse', v)} placeholder="Quartier, rue, repère…" placeholderTextColor={colors.muted} multiline />
          <Btn label="Enregistrer" onPress={save} busy={saving} />
          <Btn label="Annuler" kind="ghost" onPress={() => setEditing(null)} />
        </Card>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Btn label="+ Ajouter un destinataire" onPress={() => setEditing({ ...blank })} />
      {contacts.length === 0 ? (
        <Empty icon="📒" text="Votre carnet est vide. Ajoutez vos destinataires habituels pour gagner du temps." />
      ) : (
        <Card style={{ padding: 6, marginTop: 14 }}>
          {contacts.map((ct, i) => (
            <View key={ct.id || i} style={[s.row, i > 0 && s.border]}>
              <View style={s.av}><Text style={s.avTxt}>{(ct.nom || '?').slice(0, 2).toUpperCase()}</Text></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.nom}>{ct.nom}</Text>
                <Text style={s.sub} numberOfLines={1}>
                  {[ct.telephone, ct.commune, ct.adresse].filter(Boolean).join(' · ') || '—'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setEditing({ id: ct.id, nom: ct.nom || '', telephone: ct.telephone || '', adresse: ct.adresse || '', commune: ct.commune || '' })} hitSlop={hit}><Text style={s.act}>✏️</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => remove(ct)} hitSlop={hit}><Text style={s.act}>🗑</Text></TouchableOpacity>
            </View>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}

const hit = { top: 8, bottom: 8, left: 8, right: 8 };
const s = StyleSheet.create({
  lbl: { fontSize: 12, fontWeight: '700', color: colors.muted, marginBottom: 6, marginTop: 8 },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 11, padding: 12, fontSize: 14, color: colors.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  border: { borderTopWidth: 1, borderTopColor: colors.line },
  av: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#eef4fb', alignItems: 'center', justifyContent: 'center' },
  avTxt: { color: colors.blue, fontWeight: '800', fontSize: 13 },
  nom: { fontWeight: '700', color: colors.ink, fontSize: 14 },
  sub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  act: { fontSize: 18, paddingHorizontal: 4 },
});
