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

// Demande EXPLICITEMENT la permission de notification et tente d'enregistrer
// le token. À appeler depuis un bouton UI quand l'utilisateur veut activer
// manuellement les notifications. Retourne un statut explicite (status +
// reason + hint) que l'écran peut afficher dans une Alert.
export async function requestPushPermissionManually({ demarcheurId, agency }) {
  try {
    if (!Device.isDevice) {
      return {
        status: 'not_supported',
        reason: 'emulator',
        hint: "Les notifications push ne fonctionnent que sur un téléphone réel (pas sur un émulateur).",
      };
    }
    // 1) Vérifier l'état actuel
    const current = await Notifications.getPermissionsAsync();
    let status = current.status;
    let canAskAgain = current.canAskAgain;

    // 2) Si non accordée, on demande explicitement (peu importe canAskAgain
    //    pour la 1re tentative ; Android décide d'afficher ou non la popup).
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
      canAskAgain = req.canAskAgain;
    }

    if (status !== 'granted') {
      // L'utilisateur a refusé OU Android ne demande plus (déjà refusé).
      return {
        status: 'denied',
        reason: canAskAgain ? 'user_declined' : 'blocked_in_settings',
        hint: canAskAgain
          ? "Vous avez refusé la demande. Cliquez à nouveau sur 'Activer' pour réessayer."
          : "Android refuse de redemander la permission. Allez dans : Paramètres Android > Applications > AMT Transit Cargo > Notifications, et activez le toggle. Puis redémarrez l'app.",
      };
    }

    // 3) Permission accordée — on enregistre le token
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'AMT Transit Cargo',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#F2A312',
      });
    }
    const projectId = (Constants?.expoConfig?.extra?.eas?.projectId)
      || (Constants?.easConfig?.projectId)
      || undefined;
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    const expoToken = tokenData?.data;
    if (!expoToken) {
      return {
        status: 'token_failed',
        reason: 'no_token_returned',
        hint: "Expo n'a pas retourné de token. Vérifiez votre connexion internet et réessayez.",
      };
    }

    if (demarcheurId) {
      try {
        await updateDoc(doc(db, collName('demarcheurs', agency), demarcheurId), {
          pushToken: expoToken,
          pushPlatform: Platform.OS,
          pushTokenUpdatedAt: serverTimestamp(),
        });
      } catch (e) {
        return {
          status: 'firestore_failed',
          reason: 'write_denied',
          hint: `Token obtenu mais impossible de l'enregistrer côté serveur (${e?.message || 'inconnu'}). Reconnectez-vous puis réessayez.`,
          tokenPreview: String(expoToken).slice(0, 20) + '…',
        };
      }
    }
    return {
      status: 'granted',
      reason: 'success',
      tokenPreview: String(expoToken).slice(0, 20) + '…',
      hint: "Notifications activées avec succès !",
    };
  } catch (e) {
    return {
      status: 'error',
      reason: 'exception',
      hint: e?.message || 'Erreur inconnue.',
    };
  }
}
