// Onglet CHAT : conversations par agence. Messages texte + PHOTO (base64) +
// VOCAL (uploadé sur Storage, URL stockée). Lecteur audio intégré.
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Image, Alert, Modal } from 'react-native';
import { Audio } from 'expo-av';
import { Card, Empty, Loading } from '../components/ui';
import ChatBackground from '../components/ChatBackground';
import { colors } from '../theme';
import { api } from '../api';
import { pickChatImage, takeChatPhoto, uploadChatAudio } from '../media';
import { useLang, tr } from '../i18n';

const fdt = (d) => { try { return new Date(d).toLocaleString('fr-FR'); } catch (e) { return ''; } };
const sameDay = (a, b) => { try { return new Date(a).toDateString() === new Date(b).toDateString(); } catch (e) { return false; } };
const dayLabel = (d) => { try { const dt = new Date(d), t = new Date(), y = new Date(); y.setDate(t.getDate() - 1); if (sameDay(dt, t)) return "Aujourd'hui"; if (sameDay(dt, y)) return 'Hier'; return dt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return ''; } };
const timeOnly = (d) => { try { return new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };

export default function ChatScreen({ selfName, active }) {
  const { t } = useLang();
  const [loading, setLoading] = useState(true);
  const [convs, setConvs] = useState([]);
  const [messages, setMessages] = useState([]);
  const [agency, setAgency] = useState(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(null);   // objet Audio.Recording en cours
  const [playingId, setPlayingId] = useState(null);
  const [viewerImg, setViewerImg] = useState(null); // photo en plein écran
  const scrollRef = useRef(null);
  const soundRef = useRef(null);

  const load = async () => {
    try {
      const r = await api.getMyChat();
      setConvs(r.conversations || []);
      setMessages(r.messages || []);
    } catch (e) { setConvs([]); setMessages([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  // Rafraîchit en silence quand on revient sur l'onglet Chat (keep-alive) :
  // pas de spinner, les messages déjà affichés restent, on récupère les nouveaux.
  useEffect(() => { if (active) load(); }, [active]);
  useEffect(() => { if (!agency && convs.length === 1) setAgency(convs[0].agency); }, [convs]);
  useEffect(() => () => { if (soundRef.current) soundRef.current.unloadAsync().catch(() => {}); }, []);

  const openAgency = (ag) => {
    setAgency(ag);
    const had = messages.some(m => m.agency === ag && m.sender === 'staff' && !m.readByClient);
    if (had) { api.markChatRead(ag).catch(() => {}); setMessages(ms => ms.map(m => m.agency === ag && m.sender === 'staff' ? { ...m, readByClient: true } : m)); }
  };

  // Envoi générique (texte / image / audio).
  const sendPayload = async (payload, optimistic) => {
    const now = new Date().toISOString();
    setMessages(ms => [...ms, { id: 'tmp' + now, agency, sender: 'client', senderName: 'Vous', createdAt: now, ...optimistic }]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    try { await api.sendClientMessage({ agency, fromName: selfName || '', ...payload }); await load(); }
    catch (e) { Alert.alert('Chat', tr("Envoi impossible.")); }
  };

  const sendText = async () => {
    const msg = text.trim();
    if (!msg || !agency) return;
    setText(''); setSending(true);
    await sendPayload({ text: msg }, { text: msg });
    setSending(false);
  };

  // Envoie une image obtenue via galerie ou appareil photo.
  const sendImageFrom = async (getter) => {
    if (!agency) return;
    try {
      const dataUrl = await getter();
      if (!dataUrl) return;
      setSending(true);
      await sendPayload({ imageUrl: dataUrl }, { imageUrl: dataUrl });
    } catch (e) { Alert.alert(tr('Photo'), e.message || tr('Impossible.')); }
    finally { setSending(false); }
  };
  // Propose le choix : appareil photo ou galerie.
  const sendPhoto = () => {
    if (!agency) return;
    Alert.alert(tr('Ajouter une photo'), null, [
      { text: tr('📷 Prendre une photo'), onPress: () => sendImageFrom(takeChatPhoto) },
      { text: tr('🖼️ Choisir dans la galerie'), onPress: () => sendImageFrom(pickChatImage) },
      { text: tr('Annuler'), style: 'cancel' },
    ]);
  };

  // --- Enregistrement vocal (expo-av) ---
  const startRec = async () => {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) { Alert.alert(tr('Micro'), tr('Autorisation micro refusée.')); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(recording);
    } catch (e) { Alert.alert(tr('Micro'), tr("Impossible de démarrer l'enregistrement.")); }
  };
  const cancelRec = async () => {
    if (!recording) return;
    try { await recording.stopAndUnloadAsync(); } catch (e) {}
    setRecording(null);
  };
  const stopAndSend = async () => {
    if (!recording) return;
    setSending(true);
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      const url = await uploadChatAudio(uri, 'audio/m4a');
      await sendPayload({ audioUrl: url }, { audioUrl: url });
    } catch (e) { Alert.alert(tr('Vocal'), tr("Envoi du vocal impossible.")); }
    finally { setSending(false); }
  };

  // --- Lecture d'un vocal ---
  const playAudio = async (id, url) => {
    try {
      if (soundRef.current) { await soundRef.current.unloadAsync(); soundRef.current = null; }
      if (playingId === id) { setPlayingId(null); return; } // re-tap = stop
      const { sound } = await Audio.Sound.createAsync({ uri: url }, { shouldPlay: true });
      soundRef.current = sound;
      setPlayingId(id);
      sound.setOnPlaybackStatusUpdate((st) => { if (st.didJustFinish) { setPlayingId(null); sound.unloadAsync().catch(() => {}); soundRef.current = null; } });
    } catch (e) { Alert.alert(tr('Lecture'), tr("Lecture impossible.")); setPlayingId(null); }
  };

  if (loading) return <Loading text={t('Chargement de votre messagerie…')} />;
  if (convs.length === 0) return <Empty icon="💬" text={t('Aucune agence rattachée à votre numéro. Vos conversations apparaîtront ici dès votre première facture.')} />;

  // Liste des conversations.
  if (!agency) {
    return (
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={s.title}>{t('Vos conversations')}</Text>
        <Card style={{ padding: 6 }}>
          {convs.map((c, i) => (
            <TouchableOpacity key={i} style={[s.conv, i > 0 && s.convBorder]} onPress={() => openAgency(c.agency)} activeOpacity={0.7}>
              <View style={{ flex: 1 }}>
                <Text style={s.convN}>{c.name}</Text>
                <Text style={s.convS}>{c.role === 'exp' ? t('vos envois') : c.role === 'dest' ? t('vos réceptions') : t('expéditions & réceptions')}</Text>
              </View>
              {c.unread > 0 && <Text style={s.badge}>{c.unread}</Text>}
              <Text style={s.chev}>›</Text>
            </TouchableOpacity>
          ))}
        </Card>
      </ScrollView>
    );
  }

  const conv = convs.find(c => c.agency === agency) || { name: agency };
  const msgs = messages.filter(m => m.agency === agency);
  // Index du DERNIER de mes messages lu par l'agence -> on affiche « Vu » dessous.
  let lastSeenIdx = -1;
  msgs.forEach((m, i) => { if (m.sender === 'client' && m.readByStaff) lastSeenIdx = i; });
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={90}>
      <View style={s.cHead}>
        {convs.length > 1 && <TouchableOpacity onPress={() => setAgency(null)}><Text style={s.back}>‹</Text></TouchableOpacity>}
        <Text style={s.cHeadT}>{conv.name}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <ChatBackground />
        <ScrollView ref={scrollRef} style={{ backgroundColor: 'transparent' }} contentContainerStyle={{ padding: 12 }} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}>
          {msgs.length === 0 ? <Text style={s.startTxt}>{t('Démarrez la conversation avec')} {conv.name}.</Text> :
            msgs.map((m, i) => {
              const mine = m.sender === 'client';
              const prev = msgs[i - 1];
              const dayChanged = !prev || !sameDay(prev.createdAt, m.createdAt);
              const tight = prev && prev.sender === m.sender && !dayChanged; // même expéditeur consécutif
              return (
                <View key={i}>
                  {dayChanged && <View style={s.daySep}><Text style={s.daySepTxt}>{dayLabel(m.createdAt)}</Text></View>}
                  <View style={[s.bubbleRow, { marginTop: tight ? 2 : 8, marginBottom: 0 }, mine && { justifyContent: 'flex-end' }]}>
                    <View style={[s.bubble, mine ? s.bubbleMe : s.bubbleOther]}>
                      {!tight && !mine && <Text style={s.bName}>{m.senderName || conv.name}</Text>}
                      {!!m.text && <Text style={[s.bTxt, mine && { color: '#fff' }]}>{m.text}</Text>}
                      {!!m.imageUrl && (
                        <TouchableOpacity activeOpacity={0.9} onPress={() => setViewerImg(m.imageUrl)}>
                          <Image source={{ uri: m.imageUrl }} style={s.img} resizeMode="cover" />
                        </TouchableOpacity>
                      )}
                      {!!m.audioUrl && (
                        <TouchableOpacity style={[s.audio, mine ? s.audioMe : s.audioOther]} onPress={() => playAudio(m.id || i, m.audioUrl)}>
                          <Text style={{ fontSize: 18 }}>{playingId === (m.id || i) ? '⏸️' : '▶️'}</Text>
                          <Text style={[s.audioTxt, mine && { color: '#fff' }]}>{t('Message vocal')}</Text>
                        </TouchableOpacity>
                      )}
                      <Text style={[s.bTime, mine && { color: 'rgba(255,255,255,0.7)' }]}>{timeOnly(m.createdAt)}</Text>
                    </View>
                  </View>
                  {i === lastSeenIdx && <Text style={s.seen}>{t('Vu ✓✓')}</Text>}
                </View>
              );
            })}
        </ScrollView>
      </View>

      {recording ? (
        <View style={s.recBar}>
          <View style={s.recDot} />
          <Text style={s.recTxt}>{t('Enregistrement…')}</Text>
          <TouchableOpacity style={s.recCancel} onPress={cancelRec}><Text style={s.recCancelTxt}>{t('Annuler')}</Text></TouchableOpacity>
          <TouchableOpacity style={[s.sendBtn, sending && { opacity: 0.6 }]} onPress={stopAndSend} disabled={sending}><Text style={s.sendTxt}>➤</Text></TouchableOpacity>
        </View>
      ) : (
        <View style={s.inputBar}>
          <TouchableOpacity style={s.iconBtn} onPress={sendPhoto} disabled={sending}><Text style={s.icon}>📷</Text></TouchableOpacity>
          <TouchableOpacity style={s.iconBtn} onPress={startRec} disabled={sending}><Text style={s.icon}>🎤</Text></TouchableOpacity>
          <TextInput style={s.input} value={text} onChangeText={setText} placeholder={t('Votre message…')} placeholderTextColor={colors.muted} multiline />
          <TouchableOpacity style={[s.sendBtn, sending && { opacity: 0.6 }]} onPress={sendText} disabled={sending}><Text style={s.sendTxt}>➤</Text></TouchableOpacity>
        </View>
      )}

      <Modal visible={!!viewerImg} transparent animationType="fade" onRequestClose={() => setViewerImg(null)}>
        <TouchableOpacity style={s.viewerBg} activeOpacity={1} onPress={() => setViewerImg(null)}>
          {!!viewerImg && <Image source={{ uri: viewerImg }} style={s.viewerImg} resizeMode="contain" />}
          <TouchableOpacity style={s.viewerClose} onPress={() => setViewerImg(null)}><Text style={s.viewerCloseTxt}>✕</Text></TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  title: { fontSize: 16, fontWeight: '800', color: colors.blue, marginBottom: 10 },
  conv: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
  convBorder: { borderTopWidth: 1, borderTopColor: colors.line },
  convN: { fontWeight: '700', color: colors.blue, fontSize: 14 },
  convS: { fontSize: 12, color: colors.muted, marginTop: 2 },
  badge: { backgroundColor: colors.red, color: '#fff', borderRadius: 10, fontSize: 11, fontWeight: '700', paddingHorizontal: 7, paddingVertical: 1, overflow: 'hidden' },
  chev: { color: '#c2cedd', fontWeight: '700', fontSize: 18 },
  cHead: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: colors.line, padding: 14, paddingTop: 16 },
  back: { fontSize: 26, color: colors.blue, fontWeight: '800', marginRight: 4 },
  cHeadT: { fontSize: 16, fontWeight: '800', color: colors.blue },
  startTxt: { textAlign: 'center', color: colors.muted, padding: 24 },
  bubbleRow: { flexDirection: 'row', marginBottom: 8 },
  bubble: { maxWidth: '82%', padding: 10, borderRadius: 14 },
  bubbleMe: { backgroundColor: colors.blue, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, borderBottomLeftRadius: 4 },
  bMeta: { fontSize: 10, color: colors.muted, marginBottom: 2 },
  seen: { fontSize: 10, color: colors.blue, fontWeight: '700', textAlign: 'right', marginTop: 2, marginRight: 4 },
  bTxt: { fontSize: 14, color: colors.ink, lineHeight: 19 },
  daySep: { alignSelf: 'center', backgroundColor: '#fff', borderRadius: 13, paddingHorizontal: 12, paddingVertical: 4, marginVertical: 8, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  daySepTxt: { fontSize: 11, fontWeight: '600', color: '#54656f' },
  bName: { fontSize: 11, fontWeight: '800', color: colors.blue, marginBottom: 2 },
  bTime: { fontSize: 10, color: colors.muted, alignSelf: 'flex-end', marginTop: 2 },
  viewerBg: { flex: 1, backgroundColor: 'rgba(8,15,26,0.95)', alignItems: 'center', justifyContent: 'center' },
  viewerImg: { width: '92%', height: '80%' },
  viewerClose: { position: 'absolute', top: 44, right: 20, width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  viewerCloseTxt: { color: '#fff', fontSize: 20, fontWeight: '700' },
  img: { width: 200, height: 200, borderRadius: 10, marginTop: 6 },
  audio: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 20 },
  audioMe: { backgroundColor: 'rgba(255,255,255,0.18)' },
  audioOther: { backgroundColor: '#eef4fb' },
  audioTxt: { fontSize: 13, color: colors.ink, fontWeight: '600' },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, padding: 10, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: colors.line },
  iconBtn: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 22 },
  input: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: colors.ink, maxHeight: 100 },
  sendBtn: { backgroundColor: colors.blue, width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sendTxt: { color: '#fff', fontSize: 18 },
  recBar: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: colors.line },
  recDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.red },
  recTxt: { flex: 1, color: colors.ink, fontWeight: '600' },
  recCancel: { paddingHorizontal: 10, paddingVertical: 8 },
  recCancelTxt: { color: colors.muted, fontWeight: '700' },
});
