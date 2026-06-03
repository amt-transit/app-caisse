// Appels aux Cloud Functions (mêmes que la PWA /clients/). Aucun accès
// Firestore direct côté client. On rafraîchit le jeton avant chaque appel
// pour éviter les "unauthenticated" après une longue inactivité.
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from './firebase';

async function call(name, payload) {
  const u = auth.currentUser;
  if (u) { try { await u.getIdToken(true); } catch (_) {} }
  const res = await httpsCallable(functions, name)(payload || {});
  return (res && res.data) || {};
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
