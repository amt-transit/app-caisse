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
} from 'react-native';
import { useAuth } from '../auth/AuthContext';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.title}>AMT Parrainage</Text>
        <Text style={styles.subtitle}>Espace Parrain / Filleul</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          editable={!busy}
        />
        <TextInput
          style={styles.input}
          placeholder="Mot de passe"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          editable={!busy}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.button, busy && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Se connecter</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.help}>
          Compte fourni par l'administration AMT. En cas de problème,
          contactez votre agence.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
  },
  title: { fontSize: 24, fontWeight: '800', color: '#0f172a' },
  subtitle: { fontSize: 14, color: '#64748b', marginTop: 4, marginBottom: 24 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 14,
    fontSize: 15,
    marginBottom: 12,
  },
  error: { color: '#ef4444', fontSize: 13, marginBottom: 12 },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    padding: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  help: { color: '#94a3b8', fontSize: 12, marginTop: 18, textAlign: 'center' },
});
