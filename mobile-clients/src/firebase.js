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
