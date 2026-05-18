import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import {
  Comfortaa_400Regular,
  Comfortaa_500Medium,
  Comfortaa_700Bold,
} from '@expo-google-fonts/comfortaa';
import {
  Jost_600SemiBold,
  Jost_700Bold,
} from '@expo-google-fonts/jost';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import LoginScreen from './src/screens/LoginScreen';
import MainApp from './src/screens/MainApp';
import Background from './src/components/Background';
import LogoMark from './src/components/LogoMark';
import { colors, spacing, font } from './src/theme';

function Splash({ label }) {
  return (
    <Background>
      <View style={styles.splash}>
        <LogoMark size={108} />
        <Text style={styles.brand}>AMT Transit Cargo</Text>
        <Text style={styles.tag}>ESPACE PARTENAIRE</Text>
        <ActivityIndicator size="large" color={colors.gold} style={{ marginTop: spacing.xxl }} />
        {label ? <Text style={styles.label}>{label}</Text> : null}
      </View>
    </Background>
  );
}

function Gate() {
  const { user, loading } = useAuth();
  if (loading) return <Splash label="Connexion sécurisée…" />;
  return user ? <MainApp /> : <LoginScreen />;
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Comfortaa_400Regular,
    Comfortaa_500Medium,
    Comfortaa_700Bold,
    Jost_600SemiBold,
    Jost_700Bold,
  });

  // Filet de sécurité : l'app ne doit JAMAIS rester bloquée sur le splash.
  // Si les polices tardent (réseau lent) ou échouent, on démarre quand même
  // au bout de 4 s — le texte retombe sur la police par défaut, sans blocage.
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 4000);
    return () => clearTimeout(t);
  }, []);

  const ready = fontsLoaded || !!fontError || timedOut;

  return (
    <AuthProvider>
      <StatusBar style="light" />
      {ready ? <Gate /> : <SplashNoFont />}
    </AuthProvider>
  );
}

// Avant le chargement des polices : un splash sans fontFamily (sinon RN
// référencerait une police pas encore prête).
function SplashNoFont() {
  return (
    <Background>
      <View style={styles.splash}>
        <LogoMark size={108} />
        <ActivityIndicator size="large" color={colors.gold} style={{ marginTop: spacing.xxl }} />
      </View>
    </Background>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  brand: {
    color: colors.text,
    fontSize: 22,
    fontFamily: font.display,
    marginTop: spacing.xl,
    letterSpacing: 0.3,
  },
  tag: {
    color: colors.gold,
    fontSize: 11.5,
    fontFamily: font.bodyBold,
    letterSpacing: 3,
    marginTop: spacing.sm,
  },
  label: { color: colors.textDim, fontSize: 12.5, marginTop: spacing.lg, fontFamily: font.body },
});
