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
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../auth/AuthContext';
import Background from '../components/Background';
import Brand from '../components/Brand';
import { colors, spacing, radius, shadow } from '../theme';

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
            <Brand size={92} />
            <Text style={styles.brandName}>AMT Transit Cargo</Text>
            <Text style={styles.brandTag}>Espace Partenaire</Text>
          </View>

          <View style={[styles.card, shadow.card]}>
            <Text style={styles.cardTitle}>Connexion</Text>
            <Text style={styles.cardSub}>Accédez à vos commissions et filleuls</Text>

            <View
              style={[
                styles.field,
                focus === 'email' && styles.fieldActive,
              ]}
            >
              <Ionicons name="mail-outline" size={18} color={colors.textDim} />
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

            <View
              style={[
                styles.field,
                focus === 'pwd' && styles.fieldActive,
              ]}
            >
              <Ionicons name="lock-closed-outline" size={18} color={colors.textDim} />
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
              style={[styles.button, shadow.gold, busy && styles.buttonDisabled]}
              onPress={onSubmit}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#1A1206" />
              ) : (
                <>
                  <Text style={styles.buttonText}>Se connecter</Text>
                  <Ionicons name="arrow-forward" size={18} color="#1A1206" />
                </>
              )}
            </TouchableOpacity>
          </View>

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
    paddingVertical: 40,
  },
  brandWrap: { alignItems: 'center', marginBottom: spacing.xxl },
  brandName: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    marginTop: spacing.lg,
    letterSpacing: 0.3,
  },
  brandTag: {
    color: colors.gold,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  card: {
    backgroundColor: colors.glassStrong,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.lg,
    padding: spacing.xl,
  },
  cardTitle: { color: colors.text, fontSize: 20, fontWeight: '800' },
  cardSub: {
    color: colors.textDim,
    fontSize: 13,
    marginTop: 4,
    marginBottom: spacing.xl,
  },

  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.bgChip,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    height: 54,
    marginBottom: spacing.md,
  },
  fieldActive: {
    borderColor: colors.gold,
    backgroundColor: '#1A2540',
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    height: '100%',
  },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(229,32,42,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(229,32,42,0.35)',
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  errorText: { color: colors.redSoft, fontSize: 13, flex: 1, fontWeight: '600' },

  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.gold,
    borderRadius: radius.md,
    height: 54,
    marginTop: spacing.sm,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#1A1206', fontWeight: '800', fontSize: 15.5 },

  help: {
    color: colors.textFaint,
    fontSize: 12,
    marginTop: spacing.xxl,
    textAlign: 'center',
    lineHeight: 18,
  },
});
