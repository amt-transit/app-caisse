// Écran de connexion — Phone Auth Firebase (SMS) via expo-firebase-recaptcha.
// MÊME logique que la PWA /clients/ : SMS la 1re fois, puis code PIN local
// (verrou d'ouverture ; la vraie sécurité = jeton Firebase persistant).
// Étape 1 du portage RN : on valide CE circuit avant de porter le reste.
import React, { useRef, useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { PhoneAuthProvider, signInWithCredential, signOut, onAuthStateChanged } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '../firebase';
import { colors } from '../theme';
import { api } from '../api';
import { useLang, tr } from '../i18n';
import RecaptchaModal from '../components/RecaptchaModal';

const LS = { registered: 'amtc_registered', phone: 'amtc_phone', pin: 'amtc_pin' };
// Obfuscation locale du PIN (verrou d'ouverture, NON cryptographique).
const pinHash = (s) => 'amtc:' + s;

export default function LoginScreen({ onAuthed }) {
  const { t } = useLang();
  const recaptchaRef = useRef(null);
  const [step, setStep] = useState('loading'); // loading|phone|code|setpin|pin
  const [dial, setDial] = useState('+225');
  const [num, setNum] = useState('');
  const [code, setCode] = useState('');
  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');
  const [pinIn, setPinIn] = useState('');
  const [verifId, setVerifId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [savedPhone, setSavedPhone] = useState('');

  useEffect(() => {
    // IMPORTANT : la session Firebase (persistée dans AsyncStorage) se restaure
    // de façon ASYNCHRONE au démarrage. On ATTEND donc onAuthStateChanged (qui
    // se déclenche une fois l'état connu, session restaurée incluse) AVANT de
    // décider PIN vs SMS. Sinon, à froid (ex. après une mise à jour),
    // auth.currentUser est encore null -> on retombait à tort sur le SMS.
    let done = false;
    const decide = async (user) => {
      if (done) return; done = true;
      const reg = await AsyncStorage.getItem(LS.registered);
      const ph = await AsyncStorage.getItem(LS.phone);
      const hasPin = await AsyncStorage.getItem(LS.pin);
      setSavedPhone(ph || '');
      // Déjà enregistré + session restaurée + PIN défini -> déverrouillage PIN.
      if (reg === '1' && user && hasPin) setStep('pin');
      else setStep('phone');
    };
    const unsub = onAuthStateChanged(auth, (user) => { decide(user); });
    // Filet de sécurité : si onAuthStateChanged tarde (>4s), on décide quand même.
    const t = setTimeout(() => decide(auth.currentUser), 4000);
    return () => { clearTimeout(t); unsub(); };
  }, []);

  const fail = (m) => { setErr(m); setBusy(false); };

  // Étape 1 : envoi du code SMS.
  const sendCode = async () => {
    setErr('');
    const digits = (num || '').replace(/[^0-9]/g, '');
    if (digits.length < 6) return fail('Numéro invalide.');
    const e164 = dial + digits;
    setBusy(true);
    try {
      const provider = new PhoneAuthProvider(auth);
      const verifier = recaptchaRef.current.makeVerifier();
      const id = await provider.verifyPhoneNumber(e164, verifier);
      setVerifId(id);
      await AsyncStorage.setItem(LS.phone, e164);
      setSavedPhone(e164);
      setBusy(false);
      setStep('code');
    } catch (e) {
      console.warn('verifyPhoneNumber:', e?.code, e?.message);
      // [DIAGNOSTIC TEMPORAIRE] On affiche le code/détail exact de l'erreur pour
      // savoir POURQUOI le SMS échoue (reCAPTCHA, quota, région, facturation…).
      // À retirer une fois le problème identifié.
      const detail = e?.code || e?.message || 'inconnu';
      fail(e?.code === 'auth/invalid-phone-number' ? 'Numéro invalide.' : ("Envoi du SMS impossible. [" + detail + "]"));
    }
  };

  // Étape 2 : vérification du code reçu.
  const verifyCode = async () => {
    setErr('');
    const c = (code || '').replace(/[^0-9]/g, '');
    if (c.length < 6) return fail('Entrez le code reçu (6 chiffres).');
    setBusy(true);
    try {
      const credential = PhoneAuthProvider.credential(verifId, c);
      await signInWithCredential(auth, credential);
      setBusy(false);
      const reg = await AsyncStorage.getItem(LS.registered);
      if (reg === '1') finish();
      else setStep('setpin');
    } catch (e) {
      console.warn('signInWithCredential:', e?.code, e?.message);
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
    try { await signOut(auth); } catch (_) {}
    setPinIn(''); setStep('phone');
  };

  const finish = () => { onAuthed && onAuthed(); };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
        <RecaptchaModal ref={recaptchaRef} />

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
                  <TouchableOpacity onPress={() => setDial(dial === '+225' ? '+33' : '+225')}>
                    <Text style={st.ccTxt}>{dial === '+225' ? '🇨🇮 +225' : '🇫🇷 +33'}</Text>
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
