// Appels aux Cloud Functions (mêmes que la PWA /clients/). Aucun accès
// Firestore direct côté client. On rafraîchit le jeton avant chaque appel
// pour éviter les "unauthenticated" après une longue inactivité.
import { auth } from './firebase';

// On appelle les Cloud Functions (onCall v2) directement en HTTPS, avec le jeton
// d'identité de l'utilisateur (fourni par @react-native-firebase/auth, qui marche).
// On n'utilise PLUS le module natif @react-native-firebase/functions : il est
// fragile sur ce montage Android (new arch) et faisait échouer TOUS les appels.
// Même protocole onCall que le site (cf. parrainage.js) : POST {data} + Bearer.
const FUNCTIONS_BASE = 'https://us-central1-caisse-amt-perso.cloudfunctions.net';

async function call(name, payload) {
  const u = auth.currentUser;
  let token = null;
  if (u) { try { token = await u.getIdToken(); } catch (_) {} }
  const res = await fetch(`${FUNCTIONS_BASE}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ data: payload || {} }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || (json && json.error)) {
    const err = (json && json.error) || {};
    const e = new Error(err.message || `Erreur serveur (HTTP ${res.status}).`);
    e.code = err.status || ('http-' + res.status);
    throw e;
  }
  return (json && json.result) || {};
}

export const api = {
  getMyInvoices: () => call('getMyInvoices'),
  getMyInvoiceDetail: (reference) => call('getMyInvoiceDetail', { reference }),
  getMyProfile: () => call('getMyProfile'),
  saveMyProfile: (data) => call('saveMyProfile', data),
  saveMyPushToken: (token) => call('saveMyPushToken', { token }),
  registerClientLead: () => call('registerClientLead'),
  // Dépôt / récup
  getMyRequests: () => call('getMyRequests'),
  createClientRequest: (data) => call('createClientRequest', data),
  respondClientRequest: (id, action) => call('respondClientRequest', { id, action }),
  cancelClientRequest: (id) => call('cancelClientRequest', { id }),
  updateClientRequest: (data) => call('updateClientRequest', data),
  getRdvAvailability: (year, month, agency) => call('getRdvAvailability', { year, month, agency }),
  // Devis
  getQuoteConfig: () => call('getQuoteConfig'),
  computeQuote: (data) => call('computeQuote', data),
  saveMyQuote: (data) => call('saveMyQuote', data),
  getMyQuotes: () => call('getMyQuotes'),
  deleteMyQuote: (id) => call('deleteMyQuote', { id }),
  // Carnet de destinataires
  getMyContacts: () => call('getMyContacts'),
  saveMyContact: (data) => call('saveMyContact', data),
  deleteMyContact: (id) => call('deleteMyContact', { id }),
  // Chat
  getMyChat: () => call('getMyChat'),
  sendClientMessage: (data) => call('sendClientMessage', data),
  markChatRead: (agency) => call('markChatRead', { agency }),
  // Notifications
  getMyNotifications: () => call('getMyNotifications'),
  markNotificationsRead: (ids) => call('markNotificationsRead', { ids }),
  // Prochains départs
  getNextDepartures: () => call('getNextDepartures'),
};
