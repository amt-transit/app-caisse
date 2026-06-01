// Firebase — MÊME projet que l'app web et l'app parrainage (caisse-amt-perso).
// Clés client publiques (aucun secret). L'app Client ne touche PAS Firestore
// directement : tout passe par les Cloud Functions (getMyInvoices, getMyChat,
// getMyProfile, etc.), comme la PWA /clients/.
import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: 'AIzaSyA255n3XWDRKaYZ9kwOYkfovf5lRexoCA4',
  authDomain: 'caisse-amt-perso.firebaseapp.com',
  projectId: 'caisse-amt-perso',
  storageBucket: 'caisse-amt-perso.firebasestorage.app',
  messagingSenderId: '682789156997',
  appId: '1:682789156997:web:9ce3303120851d37be91ec',
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Persistance de session via AsyncStorage (sinon déconnexion à chaque ouverture).
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

// Région alignée sur les Cloud Functions (us-central1, cf. functions/index.js).
export const functions = getFunctions(app, 'us-central1');

// Storage : vocaux & pièces jointes du chat (dossier client_chat/).
export const storage = getStorage(app);

export { firebaseConfig };
export default app;
