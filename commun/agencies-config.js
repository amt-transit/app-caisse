import { db } from './firebase-config.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

const DEFAULT_AGENCIES = {
    'paris': {
        id: 'paris',
        name: 'PARIS (AMT TRANSIT)',
        type: 'departure',
        appFolder: 'paris',
        flag: '🇫🇷'
    },
    'abidjan': {
        id: 'abidjan',
        name: 'ABIDJAN (AMT)',
        type: 'arrival',
        appFolder: 'abidjan',
        flag: '🇨🇮_🇫🇷'
    }
};

// 1. Chargement instantané depuis le cache (Sécurité hors-ligne et rapidité)
const cachedAgencies = localStorage.getItem('amt_agencies_config');
export let AGENCIES = cachedAgencies ? JSON.parse(cachedAgencies) : { ...DEFAULT_AGENCIES };

// 2. Mise à jour dynamique depuis Firestore (Top-Level Await)
try {
    const snap = await getDocs(collection(db, "agencies_config"));
    if (!snap.empty) {
        const fetchedAgencies = { ...DEFAULT_AGENCIES };
        snap.forEach(doc => {
            const data = doc.data();
            // Route « en corbeille » (désactivée) : exclue de l'usage actif
            // (sélecteur d'agence, menus, routage). Le doc reste en base pour
            // pouvoir la restaurer depuis Gestion des agences.
            if (data && data.disabled) return;
            fetchedAgencies[doc.id] = { id: doc.id, ...data };
        });
        AGENCIES = fetchedAgencies;
        localStorage.setItem('amt_agencies_config', JSON.stringify(fetchedAgencies));
    }
} catch(e) {
    console.warn("Mode hors-ligne : utilisation du cache local pour la liste des agences.", e);
}

// Fonctions utilitaires prêtes à l'emploi pour les autres fichiers
export const getDepartureAgencies = () => Object.values(AGENCIES).filter(a => a.type === 'departure').map(a => a.id);
export const getArrivalAgencies = () => Object.values(AGENCIES).filter(a => a.type === 'arrival').map(a => a.id);
export const getAgencyFolder = (agencyId) => AGENCIES[agencyId] ? AGENCIES[agencyId].appFolder : 'abidjan';

// Collections « sensibles au mode d'expédition » : Maritime et Aérien sont
// des univers TOTALEMENT séparés (demande métier). Pour ces tables, l'Aérien
// écrit/lit dans une sous-table dédiée suffixée `_aerien`. Le Maritime reste
// sur la table de base (tout l'historique = maritime). Ainsi aucune page ne
// peut mélanger les deux : l'isolation est garantie « par construction »,
// sans avoir à filtrer chaque écran.
//
// NB : other_income, bank_movements et audit_logs ne sont PAS dans cette
// liste — ils restent en table de base et sont isolés par un filtre sur le
// champ `modeExpedition` (collections à usage mixte / non routées partout).
const MODE_SENSITIVE_COLLECTIONS = new Set([
    'transactions',
    'livraisons',
    'livraisons_archives',
    'expenses',
    'clients',
    'products',
    'containers',
    'appointments',
    'quotes',
    'quote_requests',
    'boats',
    'receptions'
]);

// OPTION 5 : Routage dynamique des collections (Data Mirroring)
export const getCollectionName = (baseName) => {
    const agency = sessionStorage.getItem('currentActiveAgency') || 'paris';

    let name;
    // Flux historique (Paris <-> Abidjan) : on garde les tables d'origine
    if (agency === 'paris' || agency === 'abidjan' || agency === 'all') {
        name = baseName;
    }
    // Flux SaaS Arrivée (ex: abidjan_chine -> pointe sur transactions_chine)
    else if (AGENCIES[agency] && AGENCIES[agency].type === 'arrival' && agency.includes('_')) {
        const parts = agency.split('_');
        name = `${baseName}_${parts[1]}`;
    }
    // Flux SaaS Départ (ex: chine, dakar -> transactions_chine, transactions_dakar)
    else {
        name = `${baseName}_${agency}`;
    }

    // Suffixe Aérien : sous-table dédiée pour la séparation totale Maritime/Aérien.
    const mode = sessionStorage.getItem('shippingMode') || 'maritime';
    if (mode === 'aerien' && MODE_SENSITIVE_COLLECTIONS.has(baseName)) {
        name = `${name}_aerien`;
    }

    return name;
};

// « Le DÉPART décide, l'arrivée suit ». Renvoie l'agence-SOURCE des réglages
// partagés d'une route (config conteneur, modèle de facture/BL/acte, etc.) :
// - Agence de DÉPART  -> elle-même (c'est la source).
// - Agence d'ARRIVÉE -> l'agence de départ de SA route :
//     abidjan        -> paris   (route historique)
//     abidjan_chine  -> chine   (routes SaaS : on retire le préfixe arrivée)
export const getConfigSourceAgency = () => {
    const agency = sessionStorage.getItem('currentActiveAgency') || 'paris';
    const a = AGENCIES[agency];
    if (a && a.type === 'arrival') {
        if (agency.includes('_')) return agency.split('_')[1]; // abidjan_chine -> chine
        return 'paris'; // abidjan -> paris
    }
    return agency; // agence de départ = source
};

// Alias historique (conteneur) : même règle « le départ décide, l'arrivée suit ».
export const getContainerConfigAgency = () => getConfigSourceAgency();
