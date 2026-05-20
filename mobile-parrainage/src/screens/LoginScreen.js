import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../auth/AuthContext';
import Background from '../components/Background';
import LogoMark from '../components/LogoMark';
import { colors, spacing, radius, font, grad, shadow } from '../theme';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [focus, setFocus] = useState('');

  const onSubmit = async () => {
    if (!email.trim() || !password) {
      setError('Renseignez votre email et votre mot de passe.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await login(email, password);
    } catch (e) {
      const code = e && e.code ? e.code : '';
      setError(
        code.includes('invalid-credential') ||
          code.includes('wrong-password') ||
          code.includes('user-not-found')
          ? 'Email ou mot de passe incorrect.'
          : 'Connexion impossible. Réessayez plus tard.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Background>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brandWrap}>
            <LogoMark size={104} />
            <Text style={styles.brandName}>AMT Transit Cargo</Text>
            <View style={styles.tagWrap}>
              <View style={styles.tagLine} />
              <Text style={styles.brandTag}>ESPACE PARTENAIRE</Text>
              <View style={styles.tagLine} />
            </View>
          </View>

          <LinearGradient
            colors={grad.lacquer}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.card, shadow.card]}
          >
            <View style={styles.cardSheen} pointerEvents="none" />
            <Text style={styles.cardTitle}>Connexion</Text>
            <Text style={styles.cardSub}>Accédez à vos commissions et à vos filleuls</Text>

            <View style={[styles.field, focus === 'email' && styles.fieldActive]}>
              <Ionicons name="mail-outline" size={18} color={focus === 'email' ? colors.gold : colors.textDim} />
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                onFocus={() => setFocus('email')}
                onBlur={() => setFocus('')}
                editable={!busy}
              />
            </View>

            <View style={[styles.field, focus === 'pwd' && styles.fieldActive]}>
              <Ionicons name="lock-closed-outline" size={18} color={focus === 'pwd' ? colors.gold : colors.textDim} />
              <TextInput
                style={styles.input}
                placeholder="Mot de passe"
                placeholderTextColor={colors.textFaint}
                secureTextEntry={!show}
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocus('pwd')}
                onBlur={() => setFocus('')}
                editable={!busy}
              />
              <TouchableOpacity
                onPress={() => setShow((s) => !s)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name={show ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color={colors.textDim}
                />
              </TouchableOpacity>
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={16} color={colors.redSoft} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              activeOpacity={0.85}
              style={[styles.buttonWrap, !busy && shadow.gold, busy && { opacity: 0.6 }]}
              onPress={onSubmit}
              disabled={busy}
            >
              <LinearGradient
                colors={grad.gold}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.button}
              >
                {busy ? (
                  <ActivityIndicator color={colors.onGold} />
                ) : (
                  <>
                    <Text style={styles.buttonText}>Se connecter</Text>
                    <Ionicons name="arrow-forward" size={18} color={colors.onGold} />
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </LinearGradient>

          <Text style={styles.help}>
            Compte fourni par l'administration AMT.{'\n'}
            En cas de problème, contactez votre agence.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Background>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    paddingVertical: 44,
  },
  brandWrap: { alignItems: 'center', marginBottom: spacing.xxl },
  brandName: {
    color: colors.text,
    fontSize: 25,
    fontFamily: font.display,
    marginTop: spacing.xl,
    letterSpacing: 0.3,
  },
  tagWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  tagLine: { width: 26, height: 1, backgroundColor: colors.glassBorderStrong },
  brandTag: {
    color: colors.gold,
    fontSize: 12,
    fontFamily: font.bodyBold,
    letterSpacing: 3,
  },

  card: {
    borderWidth: 1,
    borderColor: colors.glassBorderStrong,
    borderRadius: radius.lg,
    padding: spacing.xl,
    overflow: 'hidden',
  },
  cardSheen: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  cardTitle: { color: colors.text, fontSize: 21, fontFamily: font.displaySemi },
  cardSub: {
    color: colors.textDim,
    fontSize: 13,
    marginTop: 5,
    marginBottom: spacing.xl,
    fontFamily: font.body,
  },

  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    height: 56,
    marginBottom: spacing.md,
  },
  fieldActive: {
    borderColor: colors.gold,
    backgroundColor: colors.goldWarm,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    height: '100%',
    fontFamily: font.body,
  },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(229,31,33,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(229,31,33,0.45)',
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  errorText: { color: colors.redSoft, fontSize: 13, flex: 1, fontFamily: font.bodyMed },

  buttonWrap: {
    borderRadius: radius.md,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 56,
  },
  buttonText: { color: colors.onGold, fontFamily: font.bodyBold, fontSize: 16, letterSpacing: 0.2 },

  help: {
    color: colors.textFaint,
    fontSize: 12,
    marginTop: spacing.xxl,
    textAlign: 'center',
    lineHeight: 19,
    fontFamily: font.body,
  },
});