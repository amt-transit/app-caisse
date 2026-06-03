// Traduction FR/EN — moteur léger. Les CLÉS sont les textes FRANÇAIS : on
// enrobe chaque texte avec t('texte fr'). Si une traduction anglaise manque,
// on retombe AUTOMATIQUEMENT sur le français (jamais d'écran cassé).
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LANG_KEY = 'amtc_lang';

// Dictionnaire ANGLAIS (clé = texte FR). Complété écran par écran.
export const EN = {
  // --- Navigation / commun ---
  'Accueil': 'Home', 'Suivi': 'Tracking', 'Chat': 'Chat', 'Profil': 'Profile',
  'Suivi des colis': 'Parcel tracking', 'Messagerie': 'Messaging',
  'Dépôt / Récupération': 'Drop-off / Pickup', 'Devis': 'Quote', 'Mes factures': 'My invoices',
  'Statistiques': 'Statistics', 'Notifications': 'Notifications', 'Prochains départs': 'Upcoming departures',
  'Carnet de destinataires': 'Address book', 'Carnet destinataires': 'Address book',
  'Dépôt / Récupération ': 'Drop-off / Pickup', 'Faire un devis': 'Get a quote',
  'Déposer un carton': 'Drop off a box', 'Demande de récup': 'Pickup request',
  'Discuter': 'Chat', 'Services': 'Services', 'Client AMT': 'AMT Client',
  'Annuler': 'Cancel', 'Enregistrer': 'Save', 'Valider': 'Confirm', 'Modifier': 'Edit',
  'Supprimer': 'Delete', 'Fermer': 'Close', 'Retour': 'Back', 'Voir': 'View',
  'Chargement…': 'Loading…', 'Erreur': 'Error', 'Réessayez': 'Try again',
  'Oui': 'Yes', 'Non': 'No', 'Rechercher': 'Search', 'Rafraîchir': 'Refresh',

  // --- Statuts ---
  'Payé': 'Paid', 'Payée': 'Paid', 'Payées': 'Paid', 'Acompte': 'Partial',
  'Impayé': 'Unpaid', 'Impayée': 'Unpaid', 'Impayées': 'Unpaid', 'Livré': 'Delivered',
  'Entrepôt': 'Warehouse', 'Conteneur': 'Container', 'Arrivé': 'Arrived',
  'Reste à payer': 'Balance due', 'Reste': 'Balance', 'Total': 'Total',

  // --- Accueil ---
  'Bonjour': 'Hello', 'Dernières factures': 'Latest invoices',
  'tout est à jour ✅': "you're all set ✅", 'facture': 'invoice', 'factures': 'invoices',
  'à régler': 'to pay',
  "récupérez vos colis pour éviter qu'ils n'augmentent.": 'pick up your parcels to avoid further charges.',
  'Aucune facture reliée à votre numéro pour le moment.': 'No invoice linked to your number yet.',
  'Frais de stockage en cours': 'Storage fees accruing',
  'Chargement de vos factures…': 'Loading your invoices…',

  // --- Profil ---
  'Mes agences AMT': 'My AMT agencies', 'Mon compte': 'My account', 'Langue': 'Language',
  'À propos': 'About', 'Fidélité 🎁': 'Loyalty 🎁',
  'Modifier nom / prénom / adresse': 'Edit name / address',
  'Nom non renseigné': 'Name not set', 'Prénom': 'First name', 'Nom': 'Last name',
  "Adresse (pour vos enlèvements / livraisons)": 'Address (for pickups / deliveries)',
  'Factures': 'Invoices', 'Envois': 'Shipments',
  '🔒 Se déconnecter': '🔒 Log out',
  'À la réouverture, votre code PIN suffira (pas de SMS).': 'On reopening, your PIN is enough (no SMS).',
  'Changer de compte (déconnexion totale)': 'Switch account (full logout)',
  'Photo de profil': 'Profile photo', '📷 Prendre une photo': '📷 Take a photo',
  '🖼️ Choisir dans la galerie': '🖼️ Choose from gallery',
  'Se déconnecter': 'Log out', 'Chargement du profil…': 'Loading profile…',

  // --- Suivi ---
  'Vos colis': 'Your parcels', 'Chargement de vos colis…': 'Loading your parcels…',
  'Aucun colis': 'No parcel', 'Tous': 'All',

  // --- Facture détail ---
  'Bilan': 'Summary', 'Informations': 'Details', 'Suivi des colis': 'Parcel tracking',
  'Expéditeur': 'Sender', 'Destinataire': 'Recipient', 'Date': 'Date',
  'Prix total': 'Total price', 'Montant payé': 'Amount paid', 'Frais de magasinage': 'Storage fee',
  'Arrivée estimée': 'Estimated arrival', 'Aucun colis rattaché.': 'No parcel attached.',
  '🔗 Partager le suivi du colis': '🔗 Share parcel tracking',
  'Chargement de la facture…': 'Loading invoice…', 'Facture introuvable.': 'Invoice not found.',
  '⚠️ Frais de magasinage en cours': '⚠️ Storage fees accruing',

  // --- Devis ---
  'Simulateur de devis': 'Quote simulator', 'Pays / route de départ': 'Departure country / route',
  "Mode d'expédition": 'Shipping mode', '🚢 Maritime': '🚢 Sea', '✈️ Aérien': '✈️ Air',
  'Articles': 'Items', 'Quantité': 'Quantity', 'Poids (kg)': 'Weight (kg)',
  '+ Ajouter un article': '+ Add an item', "Calculer l'estimation": 'Calculate estimate',
  'Estimation': 'Estimate', 'Changer de pays de départ ›': 'Change departure country ›',
  '💾 Enregistrer ce devis': '💾 Save this quote',
  '✈️ Tarification au poids facturé': '✈️ Billed-weight pricing',
  'Chargement du simulateur…': 'Loading simulator…',

  // --- Carnet ---
  '+ Ajouter un destinataire': '+ Add a recipient', 'Nouveau destinataire': 'New recipient',
  'Modifier le destinataire': 'Edit recipient', 'Nom complet *': 'Full name *',
  'Téléphone': 'Phone', 'Commune / ville': 'Town / city', 'Adresse de livraison': 'Delivery address',
  'Chargement du carnet…': 'Loading address book…',

  // --- Chat ---
  'Vos conversations': 'Your conversations', 'Votre message…': 'Your message…',
  'Vu ✓✓': 'Seen ✓✓', 'Message vocal': 'Voice message',

  // --- Login ---
  'Votre numéro de téléphone': 'Your phone number',
  'Recevoir le code par SMS': 'Get the code by SMS', 'Déverrouiller': 'Unlock',
  'Bon retour 👋': 'Welcome back 👋', 'Créez votre code PIN (4 chiffres)': 'Create your PIN (4 digits)',
  'Votre espace expéditeur & destinataire': 'Your shipper & recipient space',
  'Un code à 6 chiffres vous sera envoyé par SMS.': 'A 6-digit code will be sent to you by SMS.',
  '← Modifier le numéro': '← Change number', 'Code envoyé au': 'Code sent to',
  'Il remplacera le SMS aux prochaines connexions.': 'It will replace the SMS at next logins.',
  "J'ai oublié mon code (recevoir un SMS)": 'I forgot my code (get an SMS)',
  'Veuillez patienter…': 'Please wait…',

  // --- Factures (liste) ---
  'Toutes vos factures, à jour.': 'All your invoices, up to date.',
  'Aucune facture pour le moment.': 'No invoice yet.',
  'Rechercher (réf, nom, conteneur…)': 'Search (ref, name, container…)',

  // --- Demandes / Notifications / Stats / Départs ---
  'Demande de dépôt': 'Drop-off request', 'Demande de récupération': 'Pickup request',
  'Aucune demande': 'No request', 'Aucune notification': 'No notification',
  'Aucun départ programmé': 'No scheduled departure',
};

// État global (pour appels hors composant) + abonnés.
let _lang = 'fr';
const listeners = new Set();
export const getLang = () => _lang;
export const tr = (s) => (_lang === 'en' ? (EN[s] || s) : s);

const LangCtx = createContext({ lang: 'fr', t: (s) => s, setLang: () => {} });

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(_lang);
  useEffect(() => {
    (async () => { try { const l = await AsyncStorage.getItem(LANG_KEY); if (l === 'en' || l === 'fr') { _lang = l; setLangState(l); } } catch (e) {} })();
  }, []);
  const setLang = useCallback(async (l) => {
    _lang = (l === 'en') ? 'en' : 'fr';
    setLangState(_lang);
    try { await AsyncStorage.setItem(LANG_KEY, _lang); } catch (e) {}
    listeners.forEach((fn) => fn(_lang));
  }, []);
  const t = useCallback((s) => (lang === 'en' ? (EN[s] || s) : s), [lang]);
  return <LangCtx.Provider value={{ lang, t, setLang }}>{children}</LangCtx.Provider>;
}

export const useLang = () => useContext(LangCtx);
