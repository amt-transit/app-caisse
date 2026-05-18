// Initialisation Firebase — MÊME projet que l'app web (caisse-amt-perso).
// Les clés ci-dessous sont des identifiants client publics (déjà présents
// dans firebase-config.js du web) : aucun secret ici.
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeAuth,
  getReactNativePersistence,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: 'AIzaSyA255n3XWDRKaYZ9kwOYkfovf5lRexoCA4',
  authDomain: 'caisse-amt-perso.firebaseapp.com',
  projectId: 'caisse-amt-perso',
  storageBucket: 'caisse-amt-perso.firebasestorage.app',
  messagingSenderId: '682789156997',
  appId: '1:682789156997:web:9ce3303120851d37be91ec',
};

// getApps() évite la double initialisation au hot-reload Expo.
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Persistance de session via AsyncStorage (sinon l'utilisateur est
// déconnecté à chaque ouverture de l'app).
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export const db = getFirestore(app);

// Région alignée sur les Cloud Functions (us-central1, cf. functions/index.js).
export const functions = getFunctions(app, 'us-central1');

export default app;
