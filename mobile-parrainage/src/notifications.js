// ============================================================================
//  Notifications push (Expo Push API + FCM en backend)
// ----------------------------------------------------------------------------
//  Démarche :
//    1. À chaque ouverture de l'app, on demande l'autorisation à l'utilisateur
//       (si pas encore donnée) puis on récupère un token Expo
//       (ExponentPushToken[xxx]).
//    2. On stocke ce token dans Firestore sur la fiche du démarcheur :
//       demarcheurs_<route>/<id>.pushToken (+ pushTokenUpdatedAt + pushPlatform).
//    3. Côté serveur (Cloud Functions, trigger Firestore), quand une commission
//       est créée ou un retrait validé, on lit le token et on envoie une notif
//       via l'API Expo Push (https://exp.host/--/api/v2/push/send).
//
//  IMPORTANT : `expo-notifications` ne fonctionne PAS en mode Expo Go ; il
//  faut un build natif (EAS Build). En Expo Go on n'a pas de token réel, on
//  log juste un message et on continue (l'app reste fonctionnelle).
// ============================================================================

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

// Affichage par défaut quand une notif arrive avec l'app au premier plan :
// on AFFICHE l'alerte (sinon iOS la masque silencieusement par défaut).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Réplique getCollectionName côté mobile (idem useDemarcheur.js).
function collName(base, agency) {
  const a = String(agency || 'chine').trim();
  if (!a || a === 'paris' || a === 'abidjan' || a === 'all') return base;
  if (a.includes('_')) return `${base}_${a.split('_')[1]}`;
  return `${base}_${a}`;
}

// Récupère (ou re-récupère) le token push de cet appareil. Retourne null si
// permission refusée, si on est sur web/simulateur, ou si une erreur survient.
// Idempotent : peut être appelé à chaque chargement de l'app sans souci.
export async function registerPushToken({ demarcheurId, agency }) {
  try {
    if (!Device.isDevice) {
      // Émulateur / web : pas de notifs push possibles.
      return null;
    }

    // 1) Permission. On NE demande l'autorisation que si le statut est
    //    « undetermined ». Si l'utilisateur a refusé, on respecte sa décision
    //    et on ne le rebloque pas à chaque ouverture.
    const settings = await Notifications.getPermissionsAsync();
    let status = settings.status;
    if (status !== 'granted' && settings.canAskAgain) {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return null;

    // 2) Canal Android (obligatoire pour les notifs visibles depuis Android 8).
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'AMT Transit Cargo',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#F2A312',
      });
    }

    // 3) Récupération du token Expo. On passe l'EAS projectId pour les builds
    //    standalone (sinon Expo retourne une erreur en build natif).
    const projectId = (Constants?.expoConfig?.extra?.eas?.projectId)
      || (Constants?.easConfig?.projectId)
      || undefined;
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    const expoToken = tokenData?.data;
    if (!expoToken) return null;

    // 4) Persistence sur la fiche démarcheur (route-aware).
    if (demarcheurId) {
      try {
        await updateDoc(doc(db, collName('demarcheurs', agency), demarcheurId), {
          pushToken: expoToken,
          pushPlatform: Platform.OS,
          pushTokenUpdatedAt: serverTimestamp(),
        });
      } catch (e) {
        // Non bloquant : si l'écriture échoue (ex: hors-ligne), on garde le
        // token en mémoire et on retentera au prochain refresh.
        console.warn('[push] Sauvegarde token échouée :', e?.message);
      }
    }
    return expoToken;
  } catch (e) {
    console.warn('[push] registerPushToken erreur :', e?.message);
    return null;
  }
}

// Listener facultatif si on veut réagir aux notifs reçues (deep-link). Pour
// l'instant on se contente d'afficher l'alerte par défaut. À étoffer plus tard.
export function addNotificationReceivedListener(cb) {
  return Notifications.addNotificationReceivedListener(cb);
}
export function addNotificationResponseListener(cb) {
  return Notifications.addNotificationResponseReceivedListener(cb);
}
