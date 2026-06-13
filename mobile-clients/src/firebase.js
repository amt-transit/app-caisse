// Firebase NATIF (@react-native-firebase) — UNIQUEMENT l'authentification
// (connexion par SMS native + jeton d'identité). MÊME projet (caisse-amt-perso) ;
// la config vient de google-services.json (Android), pas du JS.
//
// On n'utilise PLUS les modules natifs `functions` et `storage` (retirés) :
//   - les Cloud Functions sont appelées en HTTPS direct (src/api.js),
//   - le stockage (vocaux du chat) passe par l'API REST (src/media.js),
// tous deux avec le jeton fourni par `auth`. Ces 2 modules natifs étaient
// fragiles sur ce build (non liés à l'exécution) -> on s'en passe.
import authModule from '@react-native-firebase/auth';

export const auth = authModule();

// Promesse résolue à la 1re émission de onAuthStateChanged = session native
// RESTAURÉE (ou confirmée absente). À attendre AVANT tout appel API, pour ne pas
// envoyer de requête sans jeton pendant la restauration asynchrone (sinon
// « unauthenticated » les 2-4 s suivant l'ouverture).
export const authReady = new Promise((resolve) => {
  const unsub = auth.onAuthStateChanged((u) => { unsub(); resolve(u || null); });
});
