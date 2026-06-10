// Écran de connexion — Phone Auth Firebase NATIF (@react-native-firebase).
// SMS la 1re fois (vérification native Play Integrity / reCAPTCHA, SANS WebView),
// puis code PIN local (verrou d'ouverture ; la vraie sécurité = session Firebase
// native persistante).
import React, { useRef, useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '../firebase';
import { colors } from '../theme';
import { api } from '../api';
import { useLang, tr } from '../i18n';

const LS = { registered: 'amtc_registered', phone: 'amtc_phone', pin: 'amtc_pin' };
// Obfuscation locale du PIN (verrou d'ouverture, NON cryptographique).
const pinHash = (s) => 'amtc:' + s;
// Indicatifs proposés : on cycle dessus en tapant sur le drapeau.
const DIALS = [
  { code: '+225', label: '🇨🇮 +225' },
  { code: '+33', label: '🇫🇷 +33' },
  { code: '+86', label: '🇨🇳 +86' },
];

export default function LoginScreen({ onAuthed }) {
  const { t } = useLang();
  const [step, setStep] = useState('loading'); // loading|phone|code|setpin|pin
  const [dial, setDial] = useState('+225');
  const [num, setNum] = useState('');
  const [code, setCode] = useState('');
  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');
  const [pinIn, setPinIn] = useState('');
  const confirmRef = useRef(null); // objet de confirmation SMS (RNFirebase)
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [savedPhone, setSavedPhone] = useState('');
  const [resendIn, setResendIn] = useState(0); // compte à rebours avant de pouvoir renvoyer le SMS
  // Refs à jour pour le listener auth (évite les captures obsolètes).
  const onAuthedRef = useRef(onAuthed); onAuthedRef.current = onAuthed;
  const stepRef = useRef(step); stepRef.current = step;

  useEffect(() => {
    // 1re décision au démarrage (la session Firebase native se restaure de façon
    // ASYNCHRONE) PUIS on reste à l'écoute : si l'utilisateur devient connecté
    // PENDANT le flux SMS (validation manuelle OU auto-lecture du SMS par Android),
    // on AVANCE au lieu de rester bloqué sur l'écran "code" avec une fausse erreur.
    let initial = true;
    const handle = async (user) => {
      const reg = await AsyncStorage.getItem(LS.registered);
      const ph = await AsyncStorage.getItem(LS.phone);
      const hasPin = await AsyncStorage.getItem(LS.pin);
      if (ph) setSavedPhone(ph);
      if (initial) {
        // Décision initiale : session restaurée -> PIN (ou création) ; sinon SMS.
        initial = false;
        setStep(user ? (reg === '1' && hasPin ? 'pin' : 'setpin') : 'phone');
      } else if (user && (stepRef.current === 'code' || stepRef.current === 'phone')) {
        // Connexion survenue pendant le flux SMS -> on enchaîne (pas de fausse erreur).
        setErr('');
        if (reg === '1') onAuthedRef.current && onAuthedRef.current();
        else setStep('setpin');
      }
    };
    const unsub = auth.onAuthStateChanged((user) => { handle(user); });
    // Filet de sécurité : si onAuthStateChanged tarde (>4s), on décide quand même.
    const safety = setTimeout(() => { if (initial) { initial = false; setStep(auth.currentUser ? 'setpin' : 'phone'); } }, 4000);
    return () => { clearTimeout(safety); unsub(); };
  }, []);

  // Décrémente le compte à rebours « renvoyer le code » chaque seconde.
  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  // Passe à l'indicatif suivant (CI -> FR -> Chine -> CI…).
  const cycleDial = () => {
    const i = DIALS.findIndex((d) => d.code === dial);
    setDial(DIALS[(i + 1) % DIALS.length].code);
  };
  const dialLabel = (DIALS.find((d) => d.code === dial) || DIALS[0]).label;

  const fail = (m) => { setErr(m); setBusy(false); };

  // Étape 1 : envoi du code SMS.
  const sendCode = async () => {
    setErr('');
    const digits = (num || '').replace(/[^0-9]/g, '');
    if (digits.length < 6) return fail('Numéro invalide.');
    const e164 = dial + digits;
    setBusy(true);
    try {
      // Connexion par téléphone NATIVE : envoie le SMS et renvoie un objet de
      // confirmation. Timeout 30 s pour ne JAMAIS rester bloqué sur « patienter »
      // si la vérification (Play Integrity) traîne ou si le réseau coince.
      const confirmation = await Promise.race([
        auth.signInWithPhoneNumber(e164),
        new Promise((_, rej) => setTimeout(() => rej({ code: 'timeout' }), 30000)),
      ]);
      confirmRef.current = confirmation;
      await AsyncStorage.setItem(LS.phone, e164);
      setSavedPhone(e164);
      setBusy(false);
      setStep('code');
      setResendIn(30); // anti-abus : 30 s avant de pouvoir renvoyer
    } catch (e) {
      console.warn('signInWithPhoneNumber:', e?.code, e?.message);
      const msg = e?.code === 'auth/invalid-phone-number' ? 'Numéro invalide.'
        : e?.code === 'auth/too-many-requests' ? 'Trop de tentatives sur ce numéro. Réessaie dans quelques heures, ou utilise un numéro de test.'
        : e?.code === 'timeout' ? "L'envoi du SMS traîne. Vérifie ta connexion et réessaie."
        : "Envoi du SMS impossible. Réessayez.";
      fail(msg);
    }
  };

  // Étape 2 : vérification du code reçu.
  const verifyCode = async () => {
    setErr('');
    // Déjà connecté (Android a lu le SMS automatiquement) -> le listener enchaîne.
    if (auth.currentUser) { setBusy(false); return; }
    const c = (code || '').replace(/[^0-9]/g, '');
    if (c.length < 6) return fail('Entrez le code reçu (6 chiffres).');
    setBusy(true);
    const advance = async () => {
      const reg = await AsyncStorage.getItem(LS.registered);
      if (reg === '1') finish(); else setStep('setpin');
    };
    try {
      if (!confirmRef.current) { setBusy(false); return fail('Session expirée, renvoyez le code.'); }
      // confirm() vérifie le code ET connecte l'utilisateur (session native).
      await confirmRef.current.confirm(c);
      setBusy(false);
      await advance();
    } catch (e) {
      setBusy(false);
      // Course avec l'auto-lecture du SMS : si on est malgré tout connecté, c'est bon.
      if (auth.currentUser) { await advance(); return; }
      console.warn('confirm:', e?.code, e?.message);
      fail('Code incorrect.');
    }
  };

  // Étape 3 : création du PIN.
  const savePin = async () => {
    setErr('');
    const a = (pin1 || '').replace(/\D/g, ''), b = (pin2 || '').replace(/\D/g, '');
    if (a.length !== 4) return fail('Le code PIN doit faire 4 chiffres.');
    if (a !== b) return fail('Les deux codes ne correspondent pas.');
    await AsyncStorage.setItem(LS.pin, pinHash(a));
    await AsyncStorage.setItem(LS.registered, '1');
    // 1re création de compte : enregistre le client comme "client potentiel"
    // côté staff + déclenche le message de bienvenue (non bloquant, best-effort).
    try { api.registerClientLead(); } catch (_) {}
    finish();
  };

  // Étape 4 : déverrouillage par PIN (session Firebase déjà active).
  const unlock = async () => {
    setErr('');
    const p = (pinIn || '').replace(/\D/g, '');
    const stored = await AsyncStorage.getItem(LS.pin);
    if (pinHash(p) !== stored) return fail('Code PIN incorrect.');
    finish();
  };

  const forgotPin = async () => {
    await AsyncStorage.removeItem(LS.registered);
    await AsyncStorage.removeItem(LS.pin);
    try { await auth.signOut(); } catch (_) {}
    setPinIn(''); setStep('phone');
  };

  const finish = () => { onAuthed && onAuthed(); };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
        {/* Logo (jaune/blanc) posé sur le FOND BLEU, où il est visible. */}
        <Image source={require('../../assets/logo.png')} style={st.logo} resizeMode="contain" />

        <View style={st.card}>
          <Text style={st.brand}>AMT <Text style={{ color: colors.gold }}>TRANS'IT</Text></Text>
          <Text style={st.tag}>{t('Votre espace expéditeur & destinataire')}</Text>

          {step === 'loading' && <Text style={st.hint}>{t('Chargement…')}</Text>}

          {step === 'phone' && (
            <>
              <Text style={st.label}>{t('Votre numéro de téléphone')}</Text>
              <View style={st.phoneRow}>
                <View style={st.cc}>
                  <TouchableOpacity onPress={cycleDial}>
                    <Text style={st.ccTxt}>{dialLabel}</Text>
                  </TouchableOpacity>
                </View>
                <TextInput style={st.numInput} keyboardType="number-pad" placeholder="07 48 52 88 24"
                  value={num} onChangeText={setNum} placeholderTextColor={colors.muted} />
              </View>
              <Btn label={t('Recevoir le code par SMS')} onPress={sendCode} busy={busy} />
              <Text style={st.hint}>{t('Un code à 6 chiffres vous sera envoyé par SMS.')}</Text>
            </>
          )}

          {step === 'code' && (
            <>
              <TouchableOpacity onPress={() => setStep('phone')}><Text style={st.back}>{t('← Modifier le numéro')}</Text></TouchableOpacity>
              <Text style={st.sentTo}>{t('Code envoyé au')} {savedPhone}</Text>
              <TextInput style={st.pinField} keyboardType="number-pad" maxLength={6} placeholder="••••••"
                value={code} onChangeText={setCode} placeholderTextColor={colors.muted} />
              <Btn label={t('Valider')} onPress={verifyCode} busy={busy} />
              {resendIn > 0
                ? <Text style={st.hint}>{t('Renvoyer le code dans')} {resendIn}s</Text>
                : <TouchableOpacity onPress={sendCode} disabled={busy}><Text style={st.ghost}>{t('Renvoyer le code par SMS')}</Text></TouchableOpacity>}
            </>
          )}

          {step === 'setpin' && (
            <>
              <Text style={st.label}>{t('Créez votre code PIN (4 chiffres)')}</Text>
              <Text style={st.hint}>{t('Il remplacera le SMS aux prochaines connexions.')}</Text>
              <TextInput style={st.pinField} keyboardType="number-pad" maxLength={4} placeholder="••••"
                value={pin1} onChangeText={setPin1} placeholderTextColor={colors.muted} secureTextEntry />
              <TextInput style={st.pinField} keyboardType="number-pad" maxLength={4} placeholder="••••"
                value={pin2} onChangeText={setPin2} placeholderTextColor={colors.muted} secureTextEntry />
              <Btn label={t('Enregistrer')} onPress={savePin} busy={busy} />
            </>
          )}

          {step === 'pin' && (
            <>
              <Text style={st.welcome}>{t('Bon retour 👋')}</Text>
              {!!savedPhone && <Text style={st.sentTo}>{savedPhone}</Text>}
              <TextInput style={st.pinField} keyboardType="number-pad" maxLength={4} placeholder="••••"
                value={pinIn} onChangeText={setPinIn} placeholderTextColor={colors.muted} secureTextEntry />
              <Btn label={t('Déverrouiller')} onPress={unlock} busy={busy} />
              <TouchableOpacity onPress={forgotPin}><Text style={st.ghost}>{t("J'ai oublié mon code (recevoir un SMS)")}</Text></TouchableOpacity>
            </>
          )}

          {!!err && <Text style={st.err}>{err}</Text>}
        </View>
        <Text style={st.foot}>AMT Trans'it</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Btn({ label, onPress, busy }) {
  return (
    <TouchableOpacity style={[st.btn, busy && { opacity: 0.6 }]} onPress={onPress} disabled={busy} activeOpacity={0.85}>
      <Text style={st.btnTxt}>{busy ? tr('Veuillez patienter…') : label}</Text>
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 22, backgroundColor: colors.blue },
  card: { width: '100%', maxWidth: 420, backgroundColor: colors.card, borderRadius: 24, padding: 24 },
  logo: { width: 150, height: 80, alignSelf: 'center', marginBottom: 18 },
  brand: { fontSize: 26, fontWeight: '800', color: colors.blue, textAlign: 'center' },
  tag: { fontSize: 12.5, color: colors.muted, textAlign: 'center', marginTop: 4, marginBottom: 18 },
  label: { fontSize: 13, fontWeight: '600', color: colors.blue, marginBottom: 8, marginTop: 8 },
  phoneRow: { flexDirection: 'row', gap: 8 },
  cc: { justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: '#f8fafc' },
  ccTxt: { fontSize: 15, fontWeight: '700', color: colors.blue },
  numInput: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 13, fontSize: 16, color: colors.ink },
  pinField: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 14, fontSize: 22, letterSpacing: 8, textAlign: 'center', color: colors.blue, marginTop: 10, fontWeight: '700' },
  btn: { backgroundColor: colors.blue, borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 12 },
  btnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  hint: { fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: 10, lineHeight: 18 },
  back: { color: colors.muted, fontSize: 13, fontWeight: '600', marginBottom: 6 },
  sentTo: { fontSize: 14, fontWeight: '700', color: colors.blue, marginBottom: 6, textAlign: 'center' },
  welcome: { fontSize: 18, fontWeight: '700', color: colors.blue, textAlign: 'center', marginBottom: 6 },
  ghost: { color: colors.muted, fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: 12 },
  err: { marginTop: 14, backgroundColor: '#fdecec', color: colors.red, borderRadius: 10, padding: 10, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  foot: { marginTop: 18, color: 'rgba(255,255,255,0.7)', fontSize: 12 },
});
