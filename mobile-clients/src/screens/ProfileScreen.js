// Onglet PROFIL : identité, agences rattachées, fidélité, édition nom/prénom,
// "À propos" (entreprise agence de départ), déconnexion.
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Image, Alert } from 'react-native';
import { Card, SectionTitle, Btn, Loading } from '../components/ui';
import { colors, fcfa } from '../theme';
import { api } from '../api';
import { pickChatImage } from '../media';

const TAUX = 655.957;
const toFcfa = (v, cur) => (cur === 'EUR' ? (v || 0) * TAUX : (v || 0));

export default function ProfileScreen({ data, phone, onLogout }) {
  const [profile, setProfile] = useState(null);
  const [about, setAbout] = useState(null);
  const [editing, setEditing] = useState(false);
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.getMyProfile();
        setProfile(r.profile || {});
        setAbout(r.about || null);
        setPrenom(r.profile?.prenom || '');
        setNom(r.profile?.nom || '');
      } catch (e) { setProfile({}); }
    })();
  }, []);

  if (!profile) return <Loading text="Chargement du profil…" />;

  const invoices = (data && data.invoices) || [];
  const agencies = (data && data.agencies) || [];
  const loyalty = (data && data.loyalty) || { sentAsSender: 0, freeCartons: 0, toNext: 10 };
  const totalDu = invoices.reduce((s, i) => s + toFcfa(i.remaining != null ? i.remaining : (i.total - i.paid), i.currency), 0);
  const fullName = `${profile.prenom || ''} ${profile.nom || ''}`.trim();
  const initials = fullName ? fullName.slice(0, 2).toUpperCase() : (phone || '').replace(/\D/g, '').slice(-2);

  const need = 10;
  const inCycle = (loyalty.sentAsSender || 0) % need;
  const pct = Math.min(100, Math.round(inCycle / need * 100));

  const save = async () => {
    setSaving(true);
    try {
      await api.saveMyProfile({ prenom: prenom.trim(), nom: nom.trim() });
      setProfile({ ...profile, prenom: prenom.trim(), nom: nom.trim() });
      setEditing(false);
    } catch (e) { Alert.alert('Erreur', "Enregistrement impossible."); }
    finally { setSaving(false); }
  };

  // Changer la photo de profil (galerie -> base64 compressé -> fiche).
  const changePhoto = async () => {
    try {
      const dataUrl = await pickChatImage();
      if (!dataUrl) return;
      if (dataUrl.length > 600000) { Alert.alert('Photo', 'Photo trop lourde, choisissez-en une plus petite.'); return; }
      setProfile({ ...profile, photoUrl: dataUrl }); // aperçu immédiat
      await api.saveMyProfile({ photoUrl: dataUrl });
    } catch (e) { Alert.alert('Photo', e.message || 'Impossible.'); }
  };

  // Changer la langue (préférence enregistrée ; l'app reste en FR pour l'instant).
  const changeLang = async (lang) => {
    setProfile({ ...profile, lang });
    try { await api.saveMyProfile({ lang }); } catch (e) {}
  };

  const confirmLogout = () => {
    Alert.alert('Se déconnecter', 'Vous devrez vous reconnecter par SMS.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Se déconnecter', style: 'destructive', onPress: onLogout },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      {/* Hero (toucher l'avatar = changer la photo) */}
      <View style={s.hero}>
        <TouchableOpacity onPress={changePhoto} activeOpacity={0.8}>
          {profile.photoUrl ? <Image source={{ uri: profile.photoUrl }} style={s.heroAv} /> :
            <View style={s.heroAvInit}><Text style={s.heroAvTxt}>{initials || '👤'}</Text></View>}
          <View style={s.camBadge}><Text style={{ fontSize: 11 }}>📷</Text></View>
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.heroName}>{fullName || 'Client AMT'}</Text>
          <Text style={s.heroSub}>📞 {phone || '—'}</Text>
        </View>
      </View>

      {/* Stats */}
      <View style={s.stats}>
        <Card style={s.stat}><Text style={s.statV}>{invoices.length}</Text><Text style={s.statL}>Factures</Text></Card>
        <Card style={s.stat}><Text style={s.statV}>{loyalty.sentAsSender || 0}</Text><Text style={s.statL}>Envois</Text></Card>
        <Card style={s.stat}><Text style={[s.statV, { color: totalDu > 0 ? colors.red : colors.green }]}>{fcfa(totalDu)}</Text><Text style={s.statL}>Reste</Text></Card>
      </View>

      {/* Agences rattachées */}
      {agencies.length > 0 && (
        <Card>
          <SectionTitle>Mes agences AMT</SectionTitle>
          {agencies.map((a, i) => (
            <View key={i} style={[s.line, i > 0 && s.lineBorder]}>
              <Text style={s.lineIc}>🏢</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.lineT}>{a.name}</Text>
                <Text style={s.lineS}>{a.role === 'exp' ? 'Vous expédiez via cette agence' : a.role === 'dest' ? 'Vous recevez via cette agence' : 'Expéditions & réceptions'}</Text>
              </View>
            </View>
          ))}
        </Card>
      )}

      {/* Fidélité */}
      <Card>
        <SectionTitle>Fidélité 🎁</SectionTitle>
        <Text style={s.muted}>À {need} envois, 1 carton moyen offert.{loyalty.freeCartons ? ` Déjà ${loyalty.freeCartons} gagné(s).` : ''}</Text>
        <View style={s.bar}><View style={[s.barFill, { width: `${pct}%` }]} /></View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
          <Text style={s.muted}>{inCycle} / {need}</Text>
          <Text style={{ fontWeight: '700', color: colors.blue }}>Plus que {loyalty.toNext != null ? loyalty.toNext : (need - inCycle)} 🎁</Text>
        </View>
      </Card>

      {/* Mon compte */}
      <Card>
        <SectionTitle>Mon compte</SectionTitle>
        {!editing ? (
          <TouchableOpacity style={s.line} onPress={() => setEditing(true)}>
            <Text style={s.lineIc}>✏️</Text>
            <View style={{ flex: 1 }}><Text style={s.lineT}>Modifier nom / prénom</Text><Text style={s.lineS}>{fullName || 'Non renseigné'}</Text></View>
            <Text style={s.chev}>›</Text>
          </TouchableOpacity>
        ) : (
          <View>
            <Text style={s.lbl}>Prénom</Text>
            <TextInput style={s.input} value={prenom} onChangeText={setPrenom} placeholder="Prénom" placeholderTextColor={colors.muted} />
            <Text style={s.lbl}>Nom</Text>
            <TextInput style={s.input} value={nom} onChangeText={setNom} placeholder="Nom" placeholderTextColor={colors.muted} />
            <Btn label="Enregistrer" onPress={save} busy={saving} />
            <Btn label="Annuler" kind="ghost" onPress={() => setEditing(false)} />
          </View>
        )}
      </Card>

      {/* Langue (préférence ; l'app reste en français pour l'instant) */}
      <Card>
        <SectionTitle>Langue</SectionTitle>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[['fr', '🇫🇷 Français'], ['en', '🇬🇧 English']].map(([code, lbl]) => (
            <TouchableOpacity key={code} onPress={() => changeLang(code)} activeOpacity={0.7}
              style={[s.langChip, (profile.lang || 'fr') === code && s.langChipOn]}>
              <Text style={[s.langTxt, (profile.lang || 'fr') === code && { color: colors.blue }]}>{lbl}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {(profile.lang || 'fr') === 'en' && <Text style={s.muted}>La traduction complète arrivera prochainement.</Text>}
      </Card>

      {/* À propos */}
      {about && (
        <Card>
          <SectionTitle>À propos</SectionTitle>
          <Text style={s.aboutName}>{about.name || "AMT TRANS'IT"}</Text>
          {!!about.address && <Text style={s.muted}>📍 {about.address}</Text>}
          {!!about.phone && <Text style={s.muted}>📞 {about.phone}</Text>}
          {!!about.email && <Text style={s.muted}>✉️ {about.email}</Text>}
          {!!about.website && <Text style={s.muted}>🌐 {about.website}</Text>}
        </Card>
      )}

      <Btn label="Se déconnecter" kind="ghost" onPress={confirmLogout} style={{ marginTop: 4 }} />
      <Text style={s.version}>AMT Clients · v1.0</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.blue, borderRadius: 18, padding: 18, marginBottom: 14 },
  heroAv: { width: 62, height: 62, borderRadius: 31, borderWidth: 2, borderColor: colors.gold },
  heroAvInit: { width: 62, height: 62, borderRadius: 31, borderWidth: 2, borderColor: colors.gold, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  camBadge: { position: 'absolute', right: -2, bottom: -2, backgroundColor: '#fff', borderRadius: 11, width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  langChip: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', backgroundColor: '#fff' },
  langChipOn: { borderColor: colors.blue, backgroundColor: '#eef4fb' },
  langTxt: { fontWeight: '700', color: colors.muted, fontSize: 14 },
  heroAvTxt: { color: '#fff', fontSize: 22, fontWeight: '800' },
  heroName: { color: '#fff', fontSize: 19, fontWeight: '800' },
  heroSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 3 },
  stats: { flexDirection: 'row', gap: 10, marginBottom: 0 },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  statV: { fontSize: 18, fontWeight: '800', color: colors.blue },
  statL: { fontSize: 11, color: colors.muted, marginTop: 4 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  lineBorder: { borderTopWidth: 1, borderTopColor: colors.line },
  lineIc: { fontSize: 18, width: 26, textAlign: 'center' },
  lineT: { fontWeight: '700', color: colors.ink, fontSize: 14 },
  lineS: { fontSize: 12, color: colors.muted, marginTop: 1 },
  chev: { color: '#c2cedd', fontWeight: '700', fontSize: 18 },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  bar: { height: 12, backgroundColor: '#eef2f7', borderRadius: 8, overflow: 'hidden', marginTop: 8 },
  barFill: { height: '100%', backgroundColor: colors.gold },
  lbl: { fontSize: 12, fontWeight: '700', color: colors.muted, marginTop: 8, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 11, padding: 12, fontSize: 14, color: colors.ink },
  aboutName: { fontWeight: '800', color: colors.blue, fontSize: 15, marginBottom: 6 },
  version: { textAlign: 'center', color: colors.muted, fontSize: 11, marginTop: 14 },
});
