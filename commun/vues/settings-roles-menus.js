import { db } from '../firebase-config.js';
import { doc, setDoc, deleteDoc, onSnapshot, collection } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { createApp, ref, reactive, onMounted, onUnmounted, computed } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";
import { AGENCIES } from '../agencies-config.js';

// Catalogue des menus : reflète FIDÈLEMENT le menu (sidebar) de index.html.
// clé technique (utilisée par app.js) + libellé + icône + portée :
//   scope = 'both' (les deux), 'departure' (départ/Paris), 'arrival' (arrivée/Abidjan).
const MENU_META = [
    { key: 'main', label: 'Tableau de bord', icon: '🏠', scope: 'both' },
    { key: 'special-asie', label: 'Réseau Partenaires (Spécial Asie)', icon: '🤝', scope: 'both' },
    { key: 'bilan', label: 'Bilan journalier', icon: '📅', scope: 'both' },
    { key: 'factures', label: 'Factures', icon: '🧾', scope: 'both' },
    { key: 'rdv', label: 'Rendez-vous', icon: '📆', scope: 'departure' },
    { key: 'programmes', label: 'Les Programmes', icon: '🗺️', scope: 'departure' },
    { key: 'entrees-caisse', label: 'Entrées Caisse', icon: '💵', scope: 'arrival' },
    { key: 'logistique', label: 'Logistique', icon: '🚚', scope: 'arrival' },
    { key: 'devis', label: 'Devis', icon: '📄', scope: 'departure' },
    { key: 'chargement', label: 'Chargement', icon: '📦', scope: 'both' },
    { key: 'scan', label: 'Scan', icon: '🔳', scope: 'both' },
    { key: 'clients', label: 'Clients', icon: '👥', scope: 'departure' },
    { key: 'comms', label: 'Communication', icon: '💬', scope: 'both' },
    { key: 'produits', label: 'Produits', icon: '🏷️', scope: 'departure' },
    { key: 'finance', label: 'Finance & Tréso', icon: '💰', scope: 'both' },
    { key: 'stock', label: 'Stock', icon: '🗄️', scope: 'departure' },
    { key: 'bilans-financiers', label: 'Bilans & Stats', icon: '📊', scope: 'both' },
    { key: 'settings', label: 'Administration', icon: '⚙️', scope: 'both' },
    { key: 'configuration', label: 'Configuration', icon: '🛠️', scope: 'departure' },
    { key: 'prospecting', label: 'Prospection', icon: '🎯', scope: 'both' },
    { key: 'audit-log', label: "Journal d'activité", icon: '🕓', scope: 'both' },
];

// Modules (sous-éléments) de chaque section. La clé = clé de section (cf. MENU_META) ;
// page = data-page réel (utilisé par app.js pour masquer via hiddenItems).
// scope facultatif par item (sinon hérite de la section).
const MENU_ITEMS = {
    main: [{ page: 'dashboard', label: 'Tableau de bord' }],
    'special-asie': [{ page: 'parrainage', label: 'Réseau Partenaires' }, { page: 'reception-colis', label: 'Réception Colis' }, { page: 'invoice-new', label: 'Nouvelle facture (Chine)' }],
    bilan: [{ page: 'daily-bilan', label: 'Bilan du jour' }, { page: 'daily-users', label: 'Bilan par utilisateurs' }],
    factures: [
        { page: 'invoices-list', label: 'Toutes les factures', scope: 'departure' },
        { page: 'invoice-new', label: 'Nouvelle facture', scope: 'departure' },
        { page: 'touteslesfactures', label: 'Factures (Ancien)', scope: 'arrival' },
    ],
    rdv: [{ page: 'appointment-new', label: 'Nouveau RDV' }, { page: 'appointments-list', label: 'Tous les RDV' }, { page: 'appointments-pending', label: 'À valider' }, { page: 'appointments-calendar', label: 'Calendrier RDV' }],
    programmes: [
        { page: 'program-new', label: 'Nouveau programme' }, { page: 'program-my', label: 'Mon programme' },
        { page: 'program-history', label: 'Historique programmes' }, { page: 'drivers', label: 'Chauffeurs' },
        { page: 'departures-calendar', label: 'Calendrier départs' },
    ],
    'entrees-caisse': [
        { page: 'index', label: 'Saisie' }, { page: 'confirmation', label: 'Confirmation' },
        { page: 'history', label: 'Historique' }, { page: 'other-income', label: 'Autres Entrées' },
    ],
    logistique: [
        { page: 'livraison', label: 'LIVRAISON' }, { page: 'voiture', label: 'Gestion Véhicules' },
        { page: 'magasinage', label: 'Magasinage' }, { page: 'points', label: 'Points' },
        { page: 'clients', label: 'Clients (Logistique)' },
    ],
    devis: [{ page: 'quotes-list', label: 'Tous les devis' }, { page: 'quote-new', label: 'Nouveau devis' }, { page: 'quote-requests', label: 'Demandes reçues' }],
    chargement: [
        { page: 'confection-containers', label: 'Confection', scope: 'departure' },
        { page: 'loading-boats', label: 'Bateaux / Avion départ', scope: 'departure' },
        { page: 'arrivals-boats', label: 'Bateau / Vol arrivée', scope: 'arrival' },
    ],
    scan: [
        { page: 'scan-warehouse', label: 'Mise en entrepôt', scope: 'departure' }, { page: 'scan-container', label: 'Charger conteneur', scope: 'departure' },
        { page: 'scan-depart-vol', label: 'Départ vol (aérien)', scope: 'departure' },
        { page: 'scan-classic', label: 'Scanner (classique)', scope: 'departure' }, { page: 'scan-dechargement', label: 'Déchargement', scope: 'arrival' },
        { page: 'scan-livraison', label: 'En livraison', scope: 'arrival' }, { page: 'scan-livrer', label: 'Remise Clients', scope: 'arrival' },
        { page: 'scan-history', label: 'Historique scans' },
    ],
    clients: [{ page: 'clients-list', label: 'Liste clients' }, { page: 'clients-app', label: 'Client application' }, { page: 'clients-analytics', label: 'Analytics' }],
    comms: [
        { page: 'chat', label: 'Chat' },
        { page: 'sms-send', label: 'Envoi SMS', scope: 'departure' }, { page: 'sms-history', label: 'Historique SMS', scope: 'departure' },
        { page: 'sms', label: 'Campagnes SMS', scope: 'arrival' },
        { page: 'notifications', label: 'Notifications' }, { page: 'notifications-history', label: 'Historique Notif' },
    ],
    produits: [{ page: 'products-list', label: 'Liste produits' }],
    finance: [
        { page: 'finance-cashier', label: 'Caisse globale', scope: 'departure' }, { page: 'finance-cheques', label: 'Liste des chèques', scope: 'departure' },
        { page: 'finance-expenses', label: 'Dépenses Finance', scope: 'departure' },
        { page: 'expenses', label: 'Dépenses Tréso', scope: 'arrival' }, { page: 'bank', label: 'Banque', scope: 'arrival' }, { page: 'audit', label: 'Audit', scope: 'arrival' },
    ],
    stock: [{ page: 'stock-list', label: 'Liste produit stocké' }],
    'bilans-financiers': [
        { page: 'balance-monthly', label: 'Bilan Comparatif', scope: 'departure' }, { page: 'balance-12m', label: 'Direction 12M', scope: 'departure' },
        { page: 'stats-boat', label: 'Stats bateau' }, { page: 'stats-monthly', label: 'Stats par mois' }, { page: 'stats-yearly', label: 'Stats par année' },
    ],
    settings: [
        { page: 'admin-panel', label: 'Gestion agents & accès' },
        { page: 'salaire', label: 'Salaire', scope: 'arrival' }, { page: 'comptejb', label: 'Compte JB', scope: 'arrival' },
        { page: 'settings-agency', label: 'Agence', scope: 'departure' }, { page: 'settings-company', label: 'Entreprise', scope: 'departure' },
        { page: 'settings-software', label: 'Paramètre logiciel' },
        { page: 'settings-design', label: 'Apparence & menus', scope: 'departure' }, { page: 'settings-agents', label: 'Gestion des agents', scope: 'departure' },
        { page: 'settings-agencies', label: 'Gestion des agences', scope: 'departure' }, { page: 'settings-roles', label: 'Rôles & Menus' },
        { page: 'settings-appointments', label: 'Paramètres RDV', scope: 'departure' }, { page: 'settings-profile', label: 'Mon profil' },
    ],
    configuration: [{ page: 'config-invoice', label: 'Choix facture' }, { page: 'config-label', label: 'Choix étiquette' }, { page: 'config-container', label: 'Conteneur Actif' }, { page: 'config-objectives', label: 'Objectifs' }, { page: 'config-charges', label: 'Charges' }],
    prospecting: [{ page: 'prospecting', label: 'Prospections' }],
    'audit-log': [{ page: 'audit-log', label: "Activités log" }],
};

// Badge de portée Départ / Arrivée (rien si 'both').
const SCOPE_BADGE = { departure: '🛫 Départ', arrival: '🛬 Arrivée' };

// Compatibilité ascendante : convertit les anciennes clés de section vers les
// nouvelles (mêmes règles que app.migrateMenuKeys), pour les agences déjà
// configurées avant la refonte. Filtre aussi toute clé inconnue.
const VALID_KEYS = new Set(MENU_META.map(m => m.key));
const migrateKeys = (arr) => {
    if (!Array.isArray(arr)) return [];
    const out = [];
    const push = (k) => { if (k && VALID_KEYS.has(k) && !out.includes(k)) out.push(k); };
    arr.forEach(k => {
        if (k === 'operations') { push('programmes'); push('logistique'); }
        else if (k === 'finance') { push('finance'); push('entrees-caisse'); }
        else if (k === 'statistique') { push('bilans-financiers'); }
        else if (k === 'parrainage') { push('special-asie'); }
        else if (k === 'colis-recus') { /* section supprimée */ }
        else push(k);
    });
    return out;
};

const ACTION_PERMS = [
    { id: 'view_bank', label: 'Voir la Caisse et la Banque', category: 'Finance' },
    { id: 'manage_expenses', label: 'Créer / Gérer les dépenses', category: 'Finance' },
    { id: 'delete_transaction', label: 'Supprimer un encaissement', category: 'Finance' },
    { id: 'delete_invoice', label: 'Supprimer une facture', category: 'Logistique' },
    { id: 'manage_fleet', label: 'Gérer la flotte automobile', category: 'Logistique' },
    { id: 'archive_container', label: 'Enregistrer un départ conteneur', category: 'Logistique' },
    { id: 'manage_salary', label: 'Gérer les salaires & Tontine', category: 'Ressources Humaines' },
    { id: 'view_audit', label: "Consulter le journal d'Audit", category: 'Sécurité & Admin' },
    { id: 'delete_history', label: 'Supprimer des historiques', category: 'Sécurité & Admin' },
    { id: 'manage_settings', label: 'Accéder aux paramètres globaux', category: 'Sécurité & Admin' },
];

// Rôles INTÉGRÉS livrés avec l'application. On les affiche TOUJOURS dans la
// liste (même sans fiche Firestore) pour que l'admin puisse leur cocher des
// permissions "Actions" (modèle additif) et configurer leurs menus.
const BUILTIN_ROLES = [
    { id: 'super_admin', name: 'Super Admin', description: 'Accès total à tout (non limité).' },
    { id: 'admin', name: 'Administrateur', description: 'Accès complet à la gestion.' },
    { id: 'manager', name: 'Manager', description: 'Supervision : bilans, finance, factures.' },
    { id: 'agent', name: 'Agent Standard', description: 'Saisie quotidienne (caisse, livraisons, factures).' },
    { id: 'chauf', name: 'Chauffeur / Livreur', description: 'Chargement, scan, livraisons.' },
    { id: 'spectateur', name: 'Spectateur', description: 'Lecture seule.' },
];
const BUILTIN_IDS = BUILTIN_ROLES.map(r => r.id);

// Menus par défaut des rôles intégrés (DOIT rester aligné sur defaultRoles
// dans app.js). null = tous les menus (super_admin / admin). Sert à pré-cocher
// l'onglet "Menus du rôle" quand le rôle n'a pas encore de config enregistrée,
// pour éviter d'enregistrer une liste vide (= plus aucun menu).
const DEFAULT_ROLE_MENUS = {
    super_admin: null,
    admin: null,
    manager: ['main', 'bilan', 'factures', 'entrees-caisse', 'finance', 'bilans-financiers', 'clients', 'stock'],
    agent: ['main', 'bilan', 'factures', 'rdv', 'programmes', 'entrees-caisse', 'logistique', 'devis', 'chargement', 'scan', 'clients', 'comms', 'produits'],
    chauf: ['main', 'chargement', 'scan', 'programmes', 'logistique'],
    spectateur: ['main', 'bilan', 'factures', 'rdv', 'programmes', 'entrees-caisse', 'logistique', 'devis', 'chargement', 'scan', 'clients', 'comms', 'produits'],
};

export const SettingsRolesMenusView = {
    vueApp: null,

    render(app, container) {
        const globalApp = app;
        window.app.views = window.app.views || {};
        window.app.views.settingsRolesMenus = this;

        const html = `
            <style>
                [v-cloak] { display: none; }
                .mn-page { max-width: 1100px; margin: 0 auto; animation: fadeIn 0.3s ease; padding-bottom: 40px; }

                .mn-hero { background: linear-gradient(135deg, #6d28d9, #4f46e5); color: white; border-radius: 20px; padding: 26px 28px; margin-bottom: 22px; box-shadow: 0 12px 24px -10px rgba(79,70,229,0.5); }
                .mn-hero h1 { margin: 0; font-size: 23px; font-weight: 800; }
                .mn-hero p { margin: 6px 0 0; font-size: 13px; opacity: .9; }
                .mn-hero .mn-agency { display:inline-flex; align-items:center; gap:8px; margin-top:14px; background: rgba(255,255,255,0.18); padding: 6px 14px; border-radius: 999px; font-weight: 700; font-size: 13px; }

                .mn-bar { display:flex; flex-wrap:wrap; gap:10px; align-items:center; justify-content:space-between; background:white; border:1px solid #e2e8f0; border-radius:14px; padding:14px 18px; margin-bottom:16px; box-shadow:0 2px 4px rgba(0,0,0,0.03); }
                .mn-bar__info { font-size:13px; color:#64748b; max-width:560px; }
                .mn-bar__info b { color:#4f46e5; }
                .mn-actions { display:flex; gap:8px; flex-wrap:wrap; }
                .mn-btn { border:none; cursor:pointer; font-weight:700; font-size:13px; padding:9px 16px; border-radius:10px; display:inline-flex; align-items:center; gap:6px; }
                .mn-btn--save { background:#4f46e5; color:white; box-shadow:0 4px 10px -2px rgba(79,70,229,.5); }
                .mn-btn--ghost { background:#f1f5f9; color:#475569; }
                .mn-btn:disabled { opacity:.55; cursor:not-allowed; }

                .mn-list { display:flex; flex-direction:column; gap:10px; }
                .mn-group { display:flex; flex-direction:column; }
                .mn-exp { margin-left:10px; border:1px solid #c7d2fe; background:#eef2ff; color:#4f46e5; font-size:11px; font-weight:700; padding:2px 9px; border-radius:999px; cursor:pointer; }
                .mn-subs { display:grid; grid-template-columns:repeat(auto-fill,minmax(230px,1fr)); gap:8px; margin:6px 0 4px 46px; padding:12px; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:12px; }
                .mn-sub { display:flex; align-items:center; gap:9px; padding:8px 12px; background:white; border:1px solid #e2e8f0; border-radius:10px; cursor:pointer; font-size:13px; }
                .mn-sub.soff { opacity:.6; }
                .mn-sub input { width:15px; height:15px; accent-color:#4f46e5; }
                .mn-sub-n { flex:1; font-weight:600; color:#0f172a; }
                .mn-sub-s { font-size:10px; font-weight:800; color:#94a3b8; text-transform:uppercase; }
                .mn-modes { display:inline-flex; gap:2px; }
                .mn-modes button { border:1px solid #e2e8f0; background:#fff; border-radius:6px; font-size:11px; padding:2px 5px; cursor:pointer; line-height:1; }
                .mn-modes button.on { background:#eef2ff; border-color:#6366f1; box-shadow:0 0 0 1px #6366f1 inset; }
                .mn-modes button:not(.on) { opacity:.45; }
                .mn-aerien-flag { display:flex; align-items:center; gap:10px; padding:12px 14px; background:#eef2ff; border:1px solid #c7d2fe; border-radius:10px; font-size:13px; font-weight:600; color:#3730a3; grid-column:1/-1; }
                .mn-aerien-flag input { width:18px; height:18px; accent-color:#4f46e5; }
                .mn-role-grp { margin-bottom:8px; }
                .mn-role-menus .mn-subs { margin-left:22px; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); }
                .mn-row { display:flex; align-items:center; gap:14px; background:white; border:1px solid #e2e8f0; border-radius:14px; padding:14px 16px; transition:.18s; }
                .mn-row.on { border-color:#c7d2fe; box-shadow:0 2px 8px -3px rgba(79,70,229,.25); }
                .mn-row.off { opacity:.62; background:#f8fafc; }
                .mn-row.drag { outline:2px dashed #6366f1; outline-offset:2px; }
                .mn-grab { color:#cbd5e1; font-size:18px; cursor:grab; user-select:none; }
                .mn-grab:active { cursor:grabbing; }
                .mn-rank { width:26px; height:26px; flex-shrink:0; border-radius:50%; background:#eef2ff; color:#4f46e5; font-size:11px; font-weight:800; display:flex; align-items:center; justify-content:center; }
                .mn-ic { font-size:22px; width:30px; text-align:center; }
                .mn-name { flex:1; font-weight:700; color:#0f172a; font-size:15px; }
                .mn-scope { font-size:10px; font-weight:800; padding:2px 8px; border-radius:8px; margin-left:8px; white-space:nowrap; vertical-align:middle; }
                .mn-scope.sc-departure { background:#dbeafe; color:#1e40af; }
                .mn-scope.sc-arrival { background:#dcfce7; color:#166534; }
                .mn-state { font-size:11px; font-weight:800; padding:3px 9px; border-radius:999px; }
                .mn-state.s-on { background:#dcfce7; color:#166534; }
                .mn-state.s-off { background:#fee2e2; color:#991b1b; }

                .mn-switch { position:relative; width:46px; height:26px; flex-shrink:0; }
                .mn-switch input { opacity:0; width:0; height:0; }
                .mn-slider { position:absolute; inset:0; background:#cbd5e1; border-radius:999px; transition:.2s; cursor:pointer; }
                .mn-slider:before { content:""; position:absolute; height:20px; width:20px; left:3px; top:3px; background:white; border-radius:50%; transition:.2s; box-shadow:0 1px 3px rgba(0,0,0,.3); }
                .mn-switch input:checked + .mn-slider { background:#4f46e5; }
                .mn-switch input:checked + .mn-slider:before { transform:translateX(20px); }

                .mn-section { margin-top:30px; }
                .mn-section > summary { cursor:pointer; list-style:none; font-size:16px; font-weight:800; color:#1e293b; background:white; border:1px solid #e2e8f0; border-radius:14px; padding:16px 20px; display:flex; align-items:center; gap:10px; }
                .mn-section > summary::-webkit-details-marker { display:none; }
                .mn-section[open] > summary { border-bottom-left-radius:0; border-bottom-right-radius:0; }

                .mn-roles { background:white; border:1px solid #e2e8f0; border-top:none; border-radius:0 0 14px 14px; padding:20px; }
                .mn-roles-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(280px,1fr)); gap:16px; }
                .mn-role { border:1px solid #e2e8f0; border-radius:14px; padding:18px; display:flex; flex-direction:column; gap:12px; }
                .mn-role-t { font-size:16px; font-weight:800; color:#0f172a; }
                .mn-role-id { font-family:monospace; font-size:11px; background:#f1f5f9; color:#64748b; padding:2px 6px; border-radius:4px; }
                .mn-role-d { font-size:13px; color:#64748b; flex:1; }
                .mn-role-f { display:flex; gap:8px; justify-content:flex-end; }

                .mn-modal { display:none; position:fixed; inset:0; z-index:2000; background:rgba(15,23,42,.6); backdrop-filter:blur(4px); align-items:center; justify-content:center; padding:16px; }
                .mn-modal.active { display:flex; }
                .mn-modal-c { background:white; border-radius:16px; width:100%; max-width:760px; max-height:92vh; display:flex; flex-direction:column; overflow:hidden; }
                .mn-tabs { display:flex; background:#f8fafc; border-bottom:1px solid #e2e8f0; }
                .mn-tab { padding:14px 18px; border:none; background:none; font-weight:700; font-size:13px; color:#64748b; cursor:pointer; border-bottom:2px solid transparent; }
                .mn-tab.active { color:#4f46e5; border-bottom-color:#4f46e5; }
                .mn-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(210px,1fr)); gap:10px; }
                .mn-chk { display:flex; align-items:center; gap:10px; padding:10px 14px; border:1px solid #e2e8f0; border-radius:10px; cursor:pointer; font-size:13px; font-weight:600; color:#1e293b; }
                .mn-chk:hover { background:#f8fafc; }
                .mn-chk input { width:16px; height:16px; accent-color:#4f46e5; }
                .mn-fld label { font-size:12px; font-weight:700; color:#475569; display:block; margin-bottom:6px; }
                .mn-fld input, .mn-fld textarea { width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box; }
            </style>

            <div id="vue-roles-menus-app" class="mn-page" v-cloak>
                <div class="mn-hero">
                    <h1>🎨 Personnalise ton menu</h1>
                    <p>Choisis les sections affichées dans la barre latérale et leur ordre. Ces réglages sont <b>propres à chaque agence</b>.</p>
                    <span class="mn-agency">🏢 Agence : {{ agencyName }}</span>
                </div>

                <div class="mn-bar">
                    <div class="mn-bar__info">
                        Active/désactive chaque section avec l'interrupteur, et <b>glisse</b> pour réordonner.
                        Tant que rien n'est activé, le menu reste en mode <b>automatique</b> (selon le type d'agence).
                    </div>
                    <div class="mn-actions">
                        <button class="mn-btn mn-btn--ghost" @click="showAll">Tout afficher</button>
                        <button class="mn-btn mn-btn--ghost" @click="resetAuto">Mode automatique</button>
                        <button class="mn-btn mn-btn--save" :disabled="savingMenus" @click="saveMenus">
                            <span v-if="savingMenus">⏳ Enregistrement…</span>
                            <span v-else>💾 Enregistrer le menu</span>
                        </button>
                    </div>
                </div>

                <div v-if="loadingMenus" style="text-align:center;padding:40px;color:#64748b;">⏳ Chargement…</div>
                <div v-else class="mn-list">
                    <div v-for="(key, index) in menuConfig.order" :key="key" class="mn-group">
                        <div class="mn-row" :class="[ isMenuVisible(key) ? 'on' : 'off', draggedIndex === index ? 'drag' : '' ]"
                             draggable="true"
                             @dragstart="onDragStart(index, $event)" @dragover.prevent @dragenter.prevent
                             @drop="onDrop(index)" @dragend="onDragEnd">
                            <span class="mn-grab" title="Glisser pour réordonner">⠿</span>
                            <span class="mn-rank">{{ index + 1 }}</span>
                            <span class="mn-ic">{{ metaOf(key).icon }}</span>
                            <span class="mn-name">
                                {{ metaOf(key).label }}
                                <span v-if="scopeBadge(metaOf(key).scope)" class="mn-scope" :class="'sc-' + metaOf(key).scope">{{ scopeBadge(metaOf(key).scope) }}</span>
                                <button v-if="itemsOf(key).length" class="mn-exp" @click.stop="toggleExpand(key)">
                                    {{ expanded[key] ? '▾' : '▸' }} {{ itemsOf(key).length }} module(s)
                                </button>
                            </span>
                            <span class="mn-state" :class="isMenuVisible(key) ? 's-on' : 's-off'">{{ isMenuVisible(key) ? 'AFFICHÉ' : 'MASQUÉ' }}</span>
                            <label class="mn-switch" @click.stop>
                                <input type="checkbox" :checked="isMenuVisible(key)" @change="toggleVisibleMenu(key)">
                                <span class="mn-slider"></span>
                            </label>
                        </div>
                        <div v-if="expanded[key] && itemsOf(key).length" class="mn-subs">
                            <label v-for="it in itemsOf(key)" :key="it.page" class="mn-sub" :class="isItemVisible(it.page) ? '' : 'soff'">
                                <input type="checkbox" :checked="isItemVisible(it.page)" @change="toggleItem(it.page)">
                                <span class="mn-sub-n">{{ it.label }}</span>
                                <span v-if="scopeBadge(it.scope)" class="mn-scope" :class="'sc-' + it.scope">{{ scopeBadge(it.scope) }}</span>
                                <span class="mn-modes" @click.stop>
                                    <button type="button" :class="{on: itemModeOf(it.page)==='both'}" @click.prevent="setItemMode(it.page,'both')" title="Maritime et Aérien">⇄</button>
                                    <button type="button" :class="{on: itemModeOf(it.page)==='maritime'}" @click.prevent="setItemMode(it.page,'maritime')" title="Maritime seulement">🚢</button>
                                    <button type="button" :class="{on: itemModeOf(it.page)==='aerien'}" @click.prevent="setItemMode(it.page,'aerien')" title="Aérien seulement">✈️</button>
                                </span>
                            </label>
                        </div>
                    </div>
                </div>

                <!-- ROLES (secondaire / avancé) -->
                <details class="mn-section">
                    <summary>🔐 Rôles & permissions (avancé)
                        <span style="flex:1"></span>
                        <span style="font-size:12px;font-weight:600;color:#94a3b8;">qui peut faire quoi</span>
                    </summary>
                    <div class="mn-roles">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px;">
                            <p style="margin:0;font-size:13px;color:#64748b;">Définis des rôles et les actions autorisées. Les <b>menus par rôle</b> affinent l'affichage par utilisateur.</p>
                            <button class="mn-btn mn-btn--save" @click="openRoleForm()">➕ Nouveau rôle</button>
                        </div>
                        <div v-if="loadingRoles" style="text-align:center;padding:30px;color:#64748b;">⏳ Chargement des rôles…</div>
                        <div v-else-if="roles.length === 0" style="text-align:center;padding:30px;color:#64748b;">Aucun rôle personnalisé. Les rôles par défaut (admin, agent…) restent actifs.</div>
                        <div v-else class="mn-roles-grid">
                            <div v-for="role in roles" :key="role.id" class="mn-role">
                                <div>
                                    <div class="mn-role-t">{{ role.name }}</div>
                                    <span class="mn-role-id">{{ role.id }}</span>
                                </div>
                                <div class="mn-role-d">{{ role.description || 'Aucune description.' }}</div>
                                <div style="font-size:12px;color:#475569;">
                                    <i class="fas fa-list"></i> {{ role.id === 'super_admin' ? 'Tous les menus' : ((menuConfig.roles[role.id] || []).length + ' menu(s)') }}
                                    · {{ (role.permissions || []).length }} action(s)
                                </div>
                                <div class="mn-role-f">
                                    <button class="mn-btn mn-btn--ghost" @click="editRole(role)">⚙️ Configurer</button>
                                    <button class="mn-btn mn-btn--ghost" style="color:#dc2626;" @click="deleteRole(role.id)" :disabled="isProtectedRole(role.id)">🗑️</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </details>

                <!-- MODAL ROLE -->
                <div class="mn-modal" :class="{active: showRoleForm}">
                    <div class="mn-modal-c">
                        <div style="padding:18px 22px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
                            <h3 style="margin:0;color:#0f172a;">{{ isEditing ? 'Configurer : ' + roleForm.name : 'Nouveau rôle' }}</h3>
                            <button @click="showRoleForm=false" style="border:none;background:none;font-size:20px;cursor:pointer;color:#64748b;">✕</button>
                        </div>
                        <div class="mn-tabs">
                            <button class="mn-tab" :class="{active:activeTab==='info'}" @click="activeTab='info'">📝 Infos</button>
                            <button class="mn-tab" :class="{active:activeTab==='menus'}" @click="activeTab='menus'">👁️ Menus du rôle</button>
                            <button class="mn-tab" :class="{active:activeTab==='actions'}" @click="activeTab='actions'">⚡ Actions</button>
                        </div>
                        <div style="padding:22px;max-height:60vh;overflow-y:auto;background:#f8fafc;">
                            <div v-show="activeTab==='info'" style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
                                <div class="mn-fld"><label>Nom du rôle *</label><input type="text" v-model="roleForm.name" @input="autoFillId" placeholder="Ex: Comptable"></div>
                                <div class="mn-fld"><label>Identifiant *</label><input type="text" v-model="roleForm.id" :disabled="isEditing" style="font-family:monospace;" placeholder="comptable"></div>
                                <div class="mn-fld" style="grid-column:1/-1;"><label>Description</label><textarea v-model="roleForm.description" rows="3" placeholder="Rôle de cet utilisateur ?"></textarea></div>
                                <label class="mn-aerien-flag" style="grid-column:1/-1;">
                                    <input type="checkbox" v-model="roleForm.aerien">
                                    <span>✈️ Ce rôle peut utiliser l'<b>aérien</b> (sinon le bouton ✈️ Aérien lui est masqué)</span>
                                </label>
                            </div>
                            <div v-show="activeTab==='menus'">
                                <p style="font-size:13px;color:#475569;background:white;padding:12px;border-radius:8px;border:1px solid #e2e8f0;">Cochez les <b>sections</b> visibles pour ce rôle. Une section cochée se déplie : <b>décochez les pages</b> que ce rôle ne doit pas voir (tout est visible par défaut).</p>
                                <div class="mn-role-menus">
                                    <div v-for="m in MENU_META" :key="m.key" class="mn-role-grp">
                                        <label class="mn-chk">
                                            <input type="checkbox" :value="m.key" v-model="roleForm.menus"><span>{{ m.icon }} {{ m.label }}</span><span v-if="scopeBadge(m.scope)" class="mn-scope" :class="'sc-' + m.scope">{{ scopeBadge(m.scope) }}</span>
                                        </label>
                                        <div v-if="roleForm.menus.includes(m.key) && itemsOf(m.key).length" class="mn-subs">
                                            <label v-for="it in itemsOf(m.key)" :key="it.page" class="mn-sub" :class="rolePageOn(it.page) ? '' : 'soff'">
                                                <input type="checkbox" :checked="rolePageOn(it.page)" @change="toggleRolePage(it.page)">
                                                <span class="mn-sub-n">{{ it.label }}</span>
                                                <span v-if="scopeBadge(it.scope)" class="mn-scope" :class="'sc-' + it.scope">{{ scopeBadge(it.scope) }}</span>
                                                <span class="mn-sub-s">{{ rolePageOn(it.page) ? 'affiché' : 'masqué' }}</span>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div v-show="activeTab==='actions'">
                                <div v-for="(perms,cat) in groupedPermissions" :key="cat" style="margin-bottom:22px;">
                                    <h4 style="margin:0 0 10px;color:#1e293b;border-bottom:2px solid #e2e8f0;padding-bottom:8px;">{{ cat }}</h4>
                                    <div class="mn-grid">
                                        <label v-for="p in perms" :key="p.id" class="mn-chk">
                                            <input type="checkbox" :value="p.id" v-model="roleForm.permissions"><span>{{ p.label }}</span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div style="padding:18px 22px;border-top:1px solid #e2e8f0;display:flex;justify-content:flex-end;gap:10px;">
                            <button class="mn-btn mn-btn--ghost" @click="showRoleForm=false">Annuler</button>
                            <button class="mn-btn mn-btn--save" :disabled="savingRole" @click="saveRole">
                                <span v-if="savingRole">⏳ …</span><span v-else>💾 Enregistrer</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const targetContainer = container || document.getElementById('contentContainer');
        targetContainer.innerHTML = html;
        this.initVue(globalApp);
    },

    initVue(globalApp) {
        if (this.vueApp) this.vueApp.unmount();

        this.vueApp = createApp({
            setup() {
                const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
                const menuDocRef = doc(db, "settings", `menus_${activeAgency}`);
                const agencyName = (AGENCIES[activeAgency] && AGENCIES[activeAgency].name) || activeAgency;

                const roles = ref([]);
                const menuConfig = reactive({ order: [], roles: {}, visibleMenus: [], hiddenItems: [], roleHiddenItems: {}, itemModes: {}, roleAerien: {} });
                const expanded = reactive({});
                const loadingRoles = ref(true);
                const loadingMenus = ref(true);
                const savingMenus = ref(false);
                const showRoleForm = ref(false);
                const isEditing = ref(false);
                const savingRole = ref(false);
                const activeTab = ref('info');
                const roleForm = reactive({ id: '', name: '', description: '', menus: [], permissions: [], hiddenPages: [], aerien: true });
                const draggedIndex = ref(null);
                let unsubs = [];

                const metaByKey = MENU_META.reduce((a, m) => (a[m.key] = m, a), {});
                const metaOf = (key) => metaByKey[key] || { key, label: key, icon: '▫️' };

                onMounted(() => {
                    unsubs.push(onSnapshot(collection(db, "roles"), (snap) => {
                        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                        const byId = {};
                        docs.forEach(d => { byId[d.id] = d; });
                        // 1) Rôles intégrés (toujours présents) enrichis de leur fiche
                        //    Firestore si elle existe (permissions déjà cochées).
                        const merged = BUILTIN_ROLES.map(b => {
                            const saved = byId[b.id];
                            return saved ? { ...b, ...saved, builtin: true } : { ...b, permissions: [], builtin: true };
                        });
                        // 2) Rôles personnalisés (fiches non intégrées).
                        docs.filter(d => !BUILTIN_IDS.includes(d.id)).forEach(d => merged.push({ ...d, builtin: false }));
                        roles.value = merged;
                        loadingRoles.value = false;
                    }, () => { loadingRoles.value = false; }));

                    unsubs.push(onSnapshot(menuDocRef, (snap) => {
                        if (snap.exists()) {
                            const data = snap.data();
                            // Migration des anciennes clés (operations/finance/statistique...).
                            menuConfig.order = migrateKeys(data.order || []);
                            menuConfig.visibleMenus = migrateKeys(data.visibleMenus || []);
                            const rolesRaw = data.roles || {};
                            const rolesMig = {};
                            Object.keys(rolesRaw).forEach(r => { rolesMig[r] = migrateKeys(rolesRaw[r]); });
                            menuConfig.roles = rolesMig;
                            menuConfig.hiddenItems = data.hiddenItems || [];
                            menuConfig.roleHiddenItems = data.roleHiddenItems || {};
                            menuConfig.itemModes = data.itemModes || {};
                            menuConfig.roleAerien = data.roleAerien || {};
                        }
                        // Garantir que tous les menus connus sont présents dans l'ordre.
                        const seen = new Set(menuConfig.order);
                        MENU_META.forEach(m => { if (!seen.has(m.key)) menuConfig.order.push(m.key); });
                        loadingMenus.value = false;
                    }, () => { loadingMenus.value = false; }));
                });
                onUnmounted(() => unsubs.forEach(u => u()));

                const groupedPermissions = computed(() => ACTION_PERMS.reduce((acc, p) => {
                    (acc[p.category] = acc[p.category] || []).push(p); return acc;
                }, {}));

                const isProtectedRole = (id) => ['super_admin', 'admin', 'agent', 'chauf', 'manager', 'spectateur'].includes(id);
                // Badge de portée Départ/Arrivée (vide si 'both' ou non défini).
                const scopeBadge = (scope) => SCOPE_BADGE[scope] || '';
                // --- Modules (sous-éléments) par section ---
                const itemsOf = (key) => MENU_ITEMS[key] || [];
                const toggleExpand = (key) => { expanded[key] = !expanded[key]; };
                // Un module est visible s'il N'EST PAS dans la liste noire hiddenItems.
                const isItemVisible = (page) => !menuConfig.hiddenItems.includes(page);
                const toggleItem = (page) => {
                    const i = menuConfig.hiddenItems.indexOf(page);
                    if (i > -1) menuConfig.hiddenItems.splice(i, 1); // ré-affiche
                    else menuConfig.hiddenItems.push(page);          // masque
                };

                // --- Portée Maritime / Aérien par module ('both' par défaut) ---
                const itemModeOf = (page) => menuConfig.itemModes[page] || 'both';
                const setItemMode = (page, mode) => {
                    if (mode === 'both') delete menuConfig.itemModes[page];
                    else menuConfig.itemModes[page] = mode;
                };

                // --- Pages masquées par RÔLE (dans le formulaire de rôle) ---
                // roleForm.hiddenPages = liste noire des pages cachées pour ce rôle.
                // Une page est affichée si elle N'EST PAS dans cette liste.
                const rolePageOn = (page) => !roleForm.hiddenPages.includes(page);
                const toggleRolePage = (page) => {
                    const i = roleForm.hiddenPages.indexOf(page);
                    if (i > -1) roleForm.hiddenPages.splice(i, 1); // ré-affiche
                    else roleForm.hiddenPages.push(page);          // masque
                };

                const isMenuVisible = (key) => menuConfig.visibleMenus.includes(key);
                const toggleVisibleMenu = (key) => {
                    const i = menuConfig.visibleMenus.indexOf(key);
                    if (i > -1) menuConfig.visibleMenus.splice(i, 1);
                    else menuConfig.visibleMenus.push(key);
                };
                const showAll = () => { menuConfig.visibleMenus = MENU_META.map(m => m.key); };
                const resetAuto = () => { menuConfig.visibleMenus.splice(0); };

                const onDragStart = (i, e) => { draggedIndex.value = i; e.dataTransfer.effectAllowed = 'move'; };
                const onDrop = (i) => {
                    const d = draggedIndex.value;
                    if (d !== null && d !== i) {
                        const t = menuConfig.order[d];
                        menuConfig.order.splice(d, 1);
                        menuConfig.order.splice(i, 0, t);
                    }
                };
                const onDragEnd = () => { draggedIndex.value = null; };

                // Un seul bouton : enregistre ordre + visibilité ensemble.
                const saveMenus = async () => {
                    savingMenus.value = true;
                    try {
                        await setDoc(menuDocRef, {
                            order: Array.from(menuConfig.order),
                            visibleMenus: Array.from(menuConfig.visibleMenus),
                            hiddenItems: Array.from(menuConfig.hiddenItems),
                            itemModes: { ...menuConfig.itemModes },
                        }, { merge: true });
                        globalApp.showToast(
                            menuConfig.visibleMenus.length
                                ? "Menu de l'agence enregistré ✔"
                                : "Menu remis en mode automatique ✔",
                            "success"
                        );
                        if (globalApp.applyMenuConfig) globalApp.applyMenuConfig(menuConfig);
                    } catch (e) { globalApp.showToast("Erreur lors de l'enregistrement", "error"); }
                    savingMenus.value = false;
                };

                const autoFillId = () => {
                    if (!isEditing.value && roleForm.name) {
                        roleForm.id = roleForm.name.toLowerCase().trim()
                            .normalize("NFD").replace(/[̀-ͯ]/g, "")
                            .replace(/[^a-z0-9_]+/g, '_');
                    }
                };
                const openRoleForm = () => {
                    roleForm.id = ''; roleForm.name = ''; roleForm.description = '';
                    roleForm.menus = []; roleForm.permissions = []; roleForm.hiddenPages = [];
                    roleForm.aerien = true;
                    isEditing.value = false; activeTab.value = 'info'; showRoleForm.value = true;
                };
                const editRole = (role) => {
                    Object.assign(roleForm, role);
                    // Menus : config enregistrée si elle existe, sinon menus par
                    // défaut du rôle intégré (évite d'écrire une liste vide qui
                    // masquerait tous les menus). Rôle perso sans config = vide.
                    if (menuConfig.roles[role.id]) {
                        roleForm.menus = [...menuConfig.roles[role.id]];
                    } else if (Object.prototype.hasOwnProperty.call(DEFAULT_ROLE_MENUS, role.id)) {
                        const def = DEFAULT_ROLE_MENUS[role.id];
                        roleForm.menus = def === null ? MENU_META.map(m => m.key) : [...def];
                    } else {
                        roleForm.menus = [];
                    }
                    if (!roleForm.permissions) roleForm.permissions = [];
                    // Pages masquées pour ce rôle (liste noire) chargées depuis la config.
                    roleForm.hiddenPages = (menuConfig.roleHiddenItems && menuConfig.roleHiddenItems[role.id])
                        ? [...menuConfig.roleHiddenItems[role.id]] : [];
                    // Accès aérien : autorisé par défaut (sauf si explicitement à false).
                    roleForm.aerien = !(menuConfig.roleAerien && menuConfig.roleAerien[role.id] === false);
                    isEditing.value = true; activeTab.value = 'info'; showRoleForm.value = true;
                };
                const saveRole = async () => {
                    if (!roleForm.id || !roleForm.name) return globalApp.showToast("L'ID et le nom sont requis.", "error");
                    savingRole.value = true;
                    const cleanId = roleForm.id.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_');
                    try {
                        await setDoc(doc(db, "roles", cleanId), {
                            name: roleForm.name,
                            description: roleForm.description,
                            permissions: Array.from(roleForm.permissions),
                            updatedAt: new Date().toISOString(),
                        });
                        menuConfig.roles[cleanId] = Array.from(roleForm.menus);
                        if (!menuConfig.roleHiddenItems) menuConfig.roleHiddenItems = {};
                        menuConfig.roleHiddenItems[cleanId] = Array.from(roleForm.hiddenPages);
                        if (!menuConfig.roleAerien) menuConfig.roleAerien = {};
                        menuConfig.roleAerien[cleanId] = !!roleForm.aerien;
                        await setDoc(menuDocRef, {
                            roles: menuConfig.roles,
                            roleHiddenItems: menuConfig.roleHiddenItems,
                            roleAerien: menuConfig.roleAerien,
                        }, { merge: true });
                        globalApp.showToast("Rôle enregistré ✔", "success");
                        if (globalApp.applyMenuConfig) globalApp.applyMenuConfig(menuConfig);
                        showRoleForm.value = false;
                    } catch (e) { globalApp.showToast("Erreur d'enregistrement", "error"); }
                    finally { savingRole.value = false; }
                };
                const deleteRole = async (id) => {
                    if (isProtectedRole(id)) return;
                    if (!confirm(`Supprimer le rôle ${id} ?`)) return;
                    try {
                        await deleteDoc(doc(db, "roles", id));
                        delete menuConfig.roles[id];
                        if (menuConfig.roleHiddenItems) delete menuConfig.roleHiddenItems[id];
                        if (menuConfig.roleAerien) delete menuConfig.roleAerien[id];
                        await setDoc(menuDocRef, {
                            roles: menuConfig.roles,
                            roleHiddenItems: menuConfig.roleHiddenItems || {},
                            roleAerien: menuConfig.roleAerien || {},
                        }, { merge: true });
                        globalApp.showToast("Rôle supprimé.", "success");
                    } catch (e) { globalApp.showToast("Erreur", "error"); }
                };

                return {
                    MENU_META, agencyName, roles, menuConfig, loadingRoles, loadingMenus,
                    expanded, itemsOf, toggleExpand, isItemVisible, toggleItem, scopeBadge,
                    rolePageOn, toggleRolePage, itemModeOf, setItemMode,
                    savingMenus, showRoleForm, isEditing, savingRole, activeTab, roleForm, draggedIndex,
                    groupedPermissions, metaOf, isProtectedRole, isMenuVisible, toggleVisibleMenu,
                    showAll, resetAuto, onDragStart, onDrop, onDragEnd, saveMenus,
                    autoFillId, openRoleForm, editRole, saveRole, deleteRole,
                };
            }
        });

        this.vueApp.mount('#vue-roles-menus-app');
    }
};
