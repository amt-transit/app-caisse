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
  'Vous expédiez via cette agence': 'You ship via this agency',
  'Vous recevez via cette agence': 'You receive via this agency',
  'Expéditions & réceptions': 'Shipments & receptions',
  'Changer de compte ?': 'Switch account?', 'Déconnexion totale': 'Full logout',
  'Enregistrement impossible.': 'Could not save.', 'Impossible.': 'Not possible.',
  "N°, rue, code postal, ville…": 'No., street, postal code, city…',
  'Photo': 'Photo', 'Photo trop lourde, choisissez-en une plus petite.': 'Photo too large, pick a smaller one.',

  // --- Suivi ---
  'Vos colis': 'Your parcels', 'Chargement de vos colis…': 'Loading your parcels…',
  'Aucun colis': 'No parcel', 'Tous': 'All',
  'Rechercher un colis (réf, description)…': 'Search a parcel (ref, description)…',
  '↺ Voir tous les colis': '↺ See all parcels',
  'Aucun colis rattaché à votre numéro.': 'No parcel linked to your number.',
  'Aucun colis à cette étape.': 'No parcel at this stage.',

  // --- Facture détail ---
  'Bilan': 'Summary', 'Informations': 'Details', 'Suivi des colis': 'Parcel tracking',
  'Expéditeur': 'Sender', 'Destinataire': 'Recipient', 'Date': 'Date',
  'Prix total': 'Total price', 'Montant payé': 'Amount paid', 'Frais de magasinage': 'Storage fee',
  'Arrivée estimée': 'Estimated arrival', 'Aucun colis rattaché.': 'No parcel attached.',
  '🔗 Partager le suivi du colis': '🔗 Share parcel tracking',
  '« Enregistrer en PDF » place le fichier dans vos Téléchargements. Le PDF officiel inclut les conditions générales et le récapitulatif financier.': "'Save as PDF' places the file in your Downloads. The official PDF includes the terms and the financial summary.",
  'Génération impossible pour le moment.': 'Cannot generate right now.',
  'Chargement de la facture…': 'Loading invoice…', 'Facture introuvable.': 'Invoice not found.',
  '⚠️ Frais de magasinage en cours': '⚠️ Storage fees accruing',
  'Facture': 'Invoice', 'Chargement impossible.': 'Could not load.',
  'Livré ✅': 'Delivered ✅', 'Arrivé le': 'Arrived on', '(estimée)': '(estimated)',
  'À confirmer (pas encore parti)': 'To be confirmed (not shipped yet)',
  '📥 Entrepôt': '📥 Warehouse', '📦 Conteneur': '📦 Container', '🛬 Arrivé': '🛬 Arrived', '✅ Livré': '✅ Delivered',
  'Aucun colis rattaché.': 'No parcel attached.',
  '💾 Enregistrer dans un dossier': '💾 Save to a folder',
  '📤 Partager (WhatsApp, mail…)': '📤 Share (WhatsApp, email…)',
  '📄 Enregistrer / Partager le PDF': '📄 Save / Share the PDF', 'Génération…': 'Generating…',
  'Facture enregistrée ✅': 'Invoice saved ✅', 'Facture PDF': 'Invoice PDF',
  'Que souhaitez-vous faire ?': 'What would you like to do?',
  "Des frais de stockage de": 'Storage fees of',
  "s'appliquent et": 'apply and', 'augmentent chaque jour': 'increase every day',
  "tant que les colis ne sont pas récupérés. Récupérez-les ou réglez la facture au plus vite.": 'until the parcels are picked up. Pick them up or pay the invoice as soon as possible.',

  // --- Devis ---
  'Simulateur de devis': 'Quote simulator', 'Pays / route de départ': 'Departure country / route',
  "Mode d'expédition": 'Shipping mode', '🚢 Maritime': '🚢 Sea', '✈️ Aérien': '✈️ Air',
  'Articles': 'Items', 'Quantité': 'Quantity', 'Poids (kg)': 'Weight (kg)',
  '+ Ajouter un article': '+ Add an item', "Calculer l'estimation": 'Calculate estimate',
  'Estimation': 'Estimate', 'Changer de pays de départ ›': 'Change departure country ›',
  '💾 Enregistrer ce devis': '💾 Save this quote',
  '✈️ Tarification au poids facturé': '✈️ Billed-weight pricing',
  'Chargement du simulateur…': 'Loading simulator…',
  'Devis': 'Quote', 'Devis enregistré ✅. Retrouvez-le dans « Mes devis enregistrés ».': 'Quote saved ✅. Find it under "My saved quotes".',
  "Enregistrement impossible.": 'Could not save.', 'Supprimer ce devis ?': 'Delete this quote?',
  'Tarification indisponible pour le moment.': 'Pricing unavailable right now.',
  'Maritime': 'Sea', 'Aérien': 'Air', 'parfum': 'perfume', 'parfum/alcool': 'perfume/alcohol',
  'prix catalogue par article (€)': 'catalog price per item (€)',
  'Type aérien': 'Air type', 'Normal': 'Standard', 'Express': 'Express',
  'Le prix se base sur le': 'The price is based on the', 'poids facturé': 'billed weight',
  'le plus élevé entre le': 'the higher of the', 'poids réel': 'actual weight', 'et le': 'and the',
  'poids volumétrique': 'volumetric weight', 'Longueur × largeur × hauteur en cm ÷': 'Length × width × height in cm ÷',
  "⚠️ Ce mode de calcul est": '⚠️ This calculation method is', "imposé par l'aéroport": 'imposed by the airport',
  "(les compagnies aériennes), ce n'est pas un choix d'AMT. Renseignez le": "(the airlines), it is not AMT's choice. Enter the",
  'poids ET les dimensions': 'weight AND dimensions', 'pour une estimation juste.': 'for an accurate estimate.',
  'Aucun produit au catalogue de cette route pour ce mode.': 'No catalog product for this route in this mode.',
  'Produit': 'Product', ' (optionnel)': ' (optional)',
  'Long (cm)': 'Length (cm)', 'Larg (cm)': 'Width (cm)', 'Haut (cm)': 'Height (cm)',
  'Parfum / alcool (tarif majoré)': 'Perfume / alcohol (surcharge)', '🗑 Retirer': '🗑 Remove',
  'Article': 'Item', 'Estimation indicative, hors frais éventuels. Tarifs identiques à la facturation.': 'Indicative estimate, excluding possible fees. Same rates as billing.',
  'Mes devis enregistrés': 'My saved quotes',

  // --- Carnet ---
  '+ Ajouter un destinataire': '+ Add a recipient', 'Nouveau destinataire': 'New recipient',
  'Modifier le destinataire': 'Edit recipient', 'Nom complet *': 'Full name *',
  'Téléphone': 'Phone', 'Commune / ville': 'Town / city', 'Adresse de livraison': 'Delivery address',
  'Chargement du carnet…': 'Loading address book…',
  'Carnet': 'Address book', 'Le nom est obligatoire.': 'Name is required.',
  'Supprimer ?': 'Delete?', 'Retirer': 'Remove', 'du carnet ?': 'from the address book?',
  'Nom et prénom': 'First and last name', 'Numéro du destinataire': "Recipient's number",
  'Ex : Cocody': 'E.g. Cocody', 'Quartier, rue, repère…': 'District, street, landmark…',
  'Votre carnet est vide. Ajoutez vos destinataires habituels pour gagner du temps.': 'Your address book is empty. Add your usual recipients to save time.',

  // --- Chat ---
  'Vos conversations': 'Your conversations', 'Votre message…': 'Your message…',
  'Vu ✓✓': 'Seen ✓✓', 'Message vocal': 'Voice message',
  'Chargement de votre messagerie…': 'Loading your messages…',
  'Aucune agence rattachée à votre numéro. Vos conversations apparaîtront ici dès votre première facture.': 'No agency linked to your number. Your conversations will appear here after your first invoice.',
  'vos envois': 'your shipments', 'vos réceptions': 'your receptions', 'expéditions & réceptions': 'shipments & receptions',
  'Démarrez la conversation avec': 'Start the conversation with', 'Vous': 'You',
  'Enregistrement…': 'Recording…',
  'Ajouter une photo': 'Add a photo', 'Impossible.': 'Not possible.',
  'Micro': 'Microphone', 'Autorisation micro refusée.': 'Microphone permission denied.',
  "Impossible de démarrer l'enregistrement.": 'Could not start recording.',
  'Vocal': 'Voice', "Envoi du vocal impossible.": 'Could not send the voice message.',
  'Lecture': 'Playback', "Lecture impossible.": 'Playback not possible.',

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
  'Rechercher une facture…': 'Search an invoice…',
  'Aucune facture ne correspond.': 'No matching invoice.',
  'facture(s)': 'invoice(s)', 'Exp.': 'Sender', 'Dest.': 'Recipient',

  // --- Demandes ---
  'Demande de dépôt': 'Drop-off request', 'Demande de récupération': 'Pickup request',
  'Aucune demande': 'No request',
  'En attente': 'Pending', 'Nouvelle date proposée': 'New date proposed',
  'Confirmée': 'Confirmed', 'RDV fixé': 'Appointment set', 'Refusée': 'Declined', 'Annulée': 'Cancelled',
  'Interphone': 'Intercom', 'Code / Digicode': 'Code / Keypad', 'Aucun / Accès libre': 'None / Open access',
  'Adresse requise': 'Address required', 'Indiquez au moins une commune ou une adresse.': 'Enter at least a town or an address.',
  'Téléphone requis': 'Phone required', 'Indiquez un téléphone de contact.': 'Enter a contact phone number.',
  'Accès requis': 'Access required', "Précisez l'accès au bâtiment.": 'Specify the building access.',
  'Vous avez déjà une demande de ce type en cours.': 'You already have a pending request of this type.',
  'Envoi impossible.': 'Could not send.', 'Action impossible.': 'Action not possible.',
  'Annuler cette demande ?': 'Cancel this request?',
  'Chargement de vos demandes…': 'Loading your requests…',
  '← Mes demandes': '← My requests', 'Modifier la demande': 'Edit request', 'Nouvelle demande': 'New request',
  '📦 Dépôt': '📦 Drop-off', '🔄 Récupération': '🔄 Pickup', '🔄 Récup': '🔄 Pickup',
  'Nom complet': 'Full name', 'Votre nom': 'Your name', 'Téléphone *': 'Phone *',
  'Contact sur place': 'On-site contact', 'Commune / Ville': 'Town / City', 'Ex : Cocody, Paris…': 'E.g. Cocody, Paris…',
  'Adresse de livraison / récupération': 'Delivery / pickup address', "Adresse d'enlèvement": 'Pickup address',
  'Quartier, rue, repère': 'District, street, landmark', 'Étage / Bâtiment *': 'Floor / Building *',
  'Ex : Bât. B, 3e étage': 'E.g. Bldg B, 3rd floor', 'Accès au bâtiment *': 'Building access *',
  'Code / digicode': 'Code / keypad', "Nom à l'interphone": 'Name on intercom',
  'Date souhaitée': 'Preferred date', 'Choisissez un jour disponible ci-dessous.': 'Pick an available day below.',
  'Créneau souhaité': 'Preferred time slot', 'Matin (10H-12H)': 'Morning (10am-12pm)',
  'Après-midi (12H-18H)': 'Afternoon (12pm-6pm)', 'Description du colis': 'Parcel description',
  'Ex : 2 cartons, 1 valise…': 'E.g. 2 boxes, 1 suitcase…',
  'Enregistrer les modifications': 'Save changes', 'Envoyer la demande': 'Send request',
  'Aucune demande pour le moment.': 'No request yet.', 'Souhaité': 'Preferred',
  "L'agence propose": 'The agency proposes', '✅ Accepter': '✅ Accept', '✕ Refuser': '✕ Decline',
  '✏️ Modifier': '✏️ Edit',

  // --- Stats ---
  'Pas encore de données à afficher.': 'No data to show yet.',
  'CA total': 'Total revenue', 'Impayé': 'Unpaid', 'Impayés': 'Unpaid',
  'Répartition par statut': 'Breakdown by status',
  'Envois / Impayés (6 mois)': 'Shipments / Unpaid (6 months)',

  // --- Notifications / Départs ---
  'Aucune notification': 'No notification',
  'Aucune notification pour le moment.': 'No notification yet.',
  'Aucun départ programmé': 'No scheduled departure',
  'Chargement des départs…': 'Loading departures…',
  'Aucun départ programmé pour le moment.': 'No scheduled departure yet.',
  'Prochains départs prévus. Les dates sont indicatives.': 'Upcoming scheduled departures. Dates are indicative.',
  'Départ': 'Departure',
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
