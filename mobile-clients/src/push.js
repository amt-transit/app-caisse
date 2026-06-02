// Notifications push Expo. registerPushToken() demande la permission, récupère
// le token Expo et l'envoie au serveur (saveMyPushToken -> fiche client_profiles).
// ⚠️ Ne fonctionne PAS dans Expo Go (SDK 53+) : nécessite un development/EAS
// build. En Expo Go, on échoue silencieusement (best-effort).
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { api } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false,
  }),
});

export async function registerPushToken() {
  try {
    if (!Device.isDevice) return; // pas de push sur émulateur
    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Notifications AMT',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    // On passe l'EAS projectId (requis pour récupérer le token dans un build
    // standalone). Sans lui, getExpoPushTokenAsync peut échouer silencieusement.
    const projectId = 'c0fb29ce-f8eb-4c3e-9ffb-f97d4329dee5';
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData && tokenData.data;
    if (token) { try { await api.saveMyPushToken(token); } catch (_) {} }
  } catch (e) {
    // Expo Go ou autre : silencieux (le push viendra avec un vrai build).
    console.log('[push] non disponible :', e && e.message);
  }
}
