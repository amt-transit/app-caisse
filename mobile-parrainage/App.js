import React from 'react';
import { View, Image, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import LoginScreen from './src/screens/LoginScreen';
import MainApp from './src/screens/MainApp';
import Background from './src/components/Background';
import { colors } from './src/theme';

const LOGO = require('./assets/logo.png');

function Gate() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <Background>
        <View style={styles.splash}>
          <Image source={LOGO} style={styles.logo} />
          <Text style={styles.brand}>AMT Transit Cargo</Text>
          <ActivityIndicator size="large" color={colors.gold} style={{ marginTop: 24 }} />
        </View>
      </Background>
    );
  }
  return user ? <MainApp /> : <LoginScreen />;
}

export default function App() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Gate />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 104, height: 104, borderRadius: 52 },
  brand: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    marginTop: 18,
    letterSpacing: 0.3,
  },
});
