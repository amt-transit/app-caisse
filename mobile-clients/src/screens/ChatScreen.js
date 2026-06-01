// Onglet CHAT : conversations par agence (1 seule → ouverte direct ; plusieurs
// → liste). Messages + envoi texte. (Photos : ajoutées dans une étape suivante.)
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { Card, Empty, Loading } from '../components/ui';
import { colors } from '../theme';
import { api } from '../api';

const fdt = (d) => { try { return new Date(d).toLocaleString('fr-FR'); } catch (e) { return ''; } };

export default function ChatScreen({ selfName }) {
  const [loading, setLoading] = useState(true);
  const [convs, setConvs] = useState([]);
  const [messages, setMessages] = useState([]);
  const [agency, setAgency] = useState(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  const load = async () => {
    try {
      const r = await api.getMyChat();
      setConvs(r.conversations || []);
      setMessages(r.messages || []);
    } catch (e) { setConvs([]); setMessages([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  // Si une seule conversation : on l'ouvre directement.
  useEffect(() => { if (!agency && convs.length === 1) setAgency(convs[0].agency); }, [convs]);

  const openAgency = (ag) => {
    setAgency(ag);
    const had = messages.some(m => m.agency === ag && m.sender === 'staff' && !m.readByClient);
    if (had) { api.markChatRead(ag).catch(() => {}); setMessages(ms => ms.map(m => m.agency === ag && m.sender === 'staff' ? { ...m, readByClient: true } : m)); }
  };

  const send = async () => {
    const t = text.trim();
    if (!t || !agency) return;
    const now = new Date().toISOString();
    setMessages(ms => [...ms, { id: 'tmp' + now, agency, text: t, sender: 'client', senderName: 'Vous', createdAt: now }]);
    setText(''); setSending(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    try {
      await api.sendClientMessage({ text: t, agency, fromName: selfName || '' });
      await load();
    } catch (e) { /* le message optimiste reste affiché */ }
    finally { setSending(false); }
  };

  if (loading) return <Loading text="Chargement de votre messagerie…" />;
  if (convs.length === 0) return <Empty icon="💬" text="Aucune agence rattachée à votre numéro. Vos conversations apparaîtront ici dès votre première facture." />;

  // Liste des conversations (plusieurs agences, aucune ouverte).
  if (!agency) {
    return (
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={s.title}>Vos conversations</Text>
        <Card style={{ padding: 6 }}>
          {convs.map((c, i) => (
            <TouchableOpacity key={i} style={[s.conv, i > 0 && s.convBorder]} onPress={() => openAgency(c.agency)} activeOpacity={0.7}>
              <View style={{ flex: 1 }}>
                <Text style={s.convN}>{c.name}</Text>
                <Text style={s.convS}>{c.role === 'exp' ? 'vos envois' : c.role === 'dest' ? 'vos réceptions' : 'expéditions & réceptions'}</Text>
              </View>
              {c.unread > 0 && <Text style={s.badge}>{c.unread}</Text>}
              <Text style={s.chev}>›</Text>
            </TouchableOpacity>
          ))}
        </Card>
      </ScrollView>
    );
  }

  // Conversation ouverte.
  const conv = convs.find(c => c.agency === agency) || { name: agency };
  const msgs = messages.filter(m => m.agency === agency);
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={90}>
      <View style={s.cHead}>
        {convs.length > 1 && <TouchableOpacity onPress={() => setAgency(null)}><Text style={s.back}>‹</Text></TouchableOpacity>}
        <Text style={s.cHeadT}>{conv.name}</Text>
      </View>
      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 14 }} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}>
        {msgs.length === 0 ? <Text style={s.startTxt}>Démarrez la conversation avec {conv.name}.</Text> :
          msgs.map((m, i) => (
            <View key={i} style={[s.bubbleRow, m.sender === 'client' && { justifyContent: 'flex-end' }]}>
              <View style={[s.bubble, m.sender === 'client' ? s.bubbleMe : s.bubbleOther]}>
                <Text style={[s.bMeta, m.sender === 'client' && { color: 'rgba(255,255,255,0.7)' }]}>{m.sender === 'client' ? 'Vous' : (m.senderName || conv.name)} · {fdt(m.createdAt)}</Text>
                {!!m.text && <Text style={[s.bTxt, m.sender === 'client' && { color: '#fff' }]}>{m.text}</Text>}
              </View>
            </View>
          ))}
      </ScrollView>
      <View style={s.inputBar}>
        <TextInput style={s.input} value={text} onChangeText={setText} placeholder="Votre message…" placeholderTextColor={colors.muted} multiline />
        <TouchableOpacity style={[s.sendBtn, sending && { opacity: 0.6 }]} onPress={send} disabled={sending}><Text style={s.sendTxt}>➤</Text></TouchableOpacity>
      </View>
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
  bubble: { maxWidth: '80%', padding: 10, borderRadius: 14 },
  bubbleMe: { backgroundColor: colors.blue, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, borderBottomLeftRadius: 4 },
  bMeta: { fontSize: 10, color: colors.muted, marginBottom: 2 },
  bTxt: { fontSize: 14, color: colors.ink, lineHeight: 19 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: colors.line },
  input: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: colors.ink, maxHeight: 100 },
  sendBtn: { backgroundColor: colors.blue, width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sendTxt: { color: '#fff', fontSize: 18 },
});
