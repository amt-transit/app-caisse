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
            fetchedAgencies[doc.id] = { id: doc.id, ...doc.data() };
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

// OPTION 5 : Routage dynamique des collections (Data Mirroring)
export const getCollectionName = (baseName) => {
    const agency = sessionStorage.getItem('currentActiveAgency') || 'paris';
    
    // Flux historique (Paris <-> Abidjan) : on garde les tables d'origine
    if (agency === 'paris' || agency === 'abidjan' || agency === 'all') {
        return baseName;
    }
    
    // Flux SaaS Arrivée (ex: abidjan_chine -> pointe sur transactions_chine)
    if (AGENCIES[agency] && AGENCIES[agency].type === 'arrival' && agency.includes('_')) {
        const parts = agency.split('_');
        return `${baseName}_${parts[1]}`;
    }
    
    // Flux SaaS Départ (ex: chine, dakar -> pointe sur transactions_chine, transactions_dakar)
    return `${baseName}_${agency}`;
};
