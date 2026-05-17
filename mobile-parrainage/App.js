import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';

function Gate() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }
  return user ? <HomeScreen /> : <LoginScreen />;
}

export default function App() {
  return (
    <AuthProvider>
      <StatusBar style="auto" />
      <Gate />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
