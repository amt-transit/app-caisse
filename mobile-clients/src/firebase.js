// Firebase NATIF (@react-native-firebase) — MÊME projet que le site et l'app
// parrainage (caisse-amt-perso). La configuration vient de google-services.json
// (Android), pas du JS — d'où l'absence de firebaseConfig ici.
//
// Pourquoi le natif ? L'authentification par téléphone (SMS) se fait désormais
// NATIVEMENT (Play Integrity / reCAPTCHA natif), sans la WebView fragile. La
// session est persistée par le SDK natif. L'app Client ne touche PAS Firestore
// directement : tout passe par les Cloud Functions (getMyInvoices, getMyChat…).
import authModule from '@react-native-firebase/auth';
import functionsModule from '@react-native-firebase/functions';
import storageModule from '@react-native-firebase/storage';

// Instances exportées. On garde les MÊMES noms/propriétés que le reste de l'app
// utilise déjà (auth.currentUser, auth.onAuthStateChanged, auth.signOut,
// auth.signInWithPhoneNumber, functions.httpsCallable, storage.ref…), pour ne
// rien casser ailleurs.
export const auth = authModule();
// Région des Cloud Functions = us-central1 (valeur par défaut de RNFirebase,
// alignée sur functions/index.js).
export const functions = functionsModule();
export const storage = storageModule();
