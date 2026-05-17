import { db } from '../../firebase-config.js';
import { doc, setDoc, deleteDoc, onSnapshot, collection } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { createApp, ref, reactive, onMounted, onUnmounted, computed } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";
import { AGENCIES } from '../../agencies-config.js';

// Catalogue des menus : clé technique (utilisée par app.js) + libellé clair + icône.
const MENU_META = [
    { key: 'main', label: 'Tableau de bord', icon: '🏠' },
    { key: 'special-asie', label: 'Spécial Asie', icon: '🌏' },
    { key: 'parrainage', label: 'Réseau Partenaires', icon: '🤝' },
    { key: 'bilan', label: 'Bilan journalier', icon: '📅' },
    { key: 'factures', label: 'Factures', icon: '🧾' },
    { key: 'rdv', label: 'Rendez-vous', icon: '📆' },
    { key: 'operations', label: 'Programmes / Logistique', icon: '🚚' },
    { key: 'devis', label: 'Devis', icon: '📄' },
    { key: 'chargement', label: 'Chargement', icon: '📦' },
    { key: 'scan', label: 'Scan', icon: '🔳' },
    { key: 'clients', label: 'Clients', icon: '👥' },
    { key: 'comms', label: 'Communication', icon: '💬' },
    { key: 'produits', label: 'Produits', icon: '🏷️' },
    { key: 'finance', label: 'Finance & Tréso', icon: '💰' },
    { key: 'colis-recus', label: 'Colis reçus', icon: '📥' },
    { key: 'stock', label: 'Stock', icon: '🗄️' },
    { key: 'bilans-financiers', label: 'Bilans & Stats', icon: '📊' },
    { key: 'statistique', label: 'Statistiques', icon: '📈' },
    { key: 'settings', label: 'Administration', icon: '⚙️' },
    { key: 'configuration', label: 'Configuration', icon: '🛠️' },
    { key: 'prospecting', label: 'Prospection', icon: '🎯' },
    { key: 'audit-log', label: "Journal d'activité", icon: '🕓' },
];

// Modules (sous-éléments) de chaque section. La clé = clé de section (cf. MENU_META) ;
// page = data-page réel (utilisé par app.js pour masquer via hiddenItems).
const MENU_ITEMS = {
    main: [{ page: 'dashboard', label: 'Tableau de bord' }],
    'special-asie': [{ page: 'parrainage', label: 'Réseau Partenaires' }],
    parrainage: [{ page: 'parrainage', label: 'Réseau Partenaires' }],
    bilan: [{ page: 'daily-bilan', label: 'Bilan du jour' }, { page: 'daily-users', label: 'Bilan par utilisateurs' }],
    factures: [{ page: 'invoices-list', label: 'Toutes les factures' }, { page: 'invoice-new', label: 'Nouvelle facture' }, { page: 'touteslesfactures', label: 'Factures (Ancien)' }],
    finance: [
        { page: 'index', label: 'Saisie (caisse)' }, { page: 'confirmation', label: 'Confirmation' },
        { page: 'history', label: 'Historique' }, { page: 'other-income', label: 'Autres Entrées' },
        { page: 'finance-cashier', label: 'Caisse globale' }, { page: 'finance-cheques', label: 'Liste des chèques' },
        { page: 'finance-expenses', label: 'Dépenses Finance' }, { page: 'expenses', label: 'Dépenses Tréso' },
        { page: 'bank', label: 'Banque' }, { page: 'audit', label: 'Audit' },
    ],
    operations: [
        { page: 'livraison', label: 'LIVRAISON' }, { page: 'livreurscan', label: 'MODE LIVREUR' },
        { page: 'voiture', label: 'Gestion Véhicules' }, { page: 'magasinage', label: 'Magasinage' },
        { page: 'points', label: 'Points' }, { page: 'clients', label: 'Clients (Logistique)' },
        { page: 'program-new', label: 'Nouveau programme' }, { page: 'program-my', label: 'Mon programme' },
        { page: 'program-history', label: 'Historique programmes' }, { page: 'drivers', label: 'Chauffeurs' },
        { page: 'departures-calendar', label: 'Calendrier départs' },
    ],
    rdv: [{ page: 'appointment-new', label: 'Nouveau RDV' }, { page: 'appointments-list', label: 'Tous les RDV' }, { page: 'appointments-pending', label: 'À valider' }, { page: 'appointments-calendar', label: 'Calendrier RDV' }],
    devis: [{ page: 'quotes-list', label: 'Tous les devis' }, { page: 'quote-new', label: 'Nouveau devis' }, { page: 'quote-requests', label: 'Demandes reçues' }],
    chargement: [{ page: 'confection-containers', label: 'Confection' }, { page: 'loading-boats', label: 'Bateaux départ' }],
    scan: [
        { page: 'scan-warehouse', label: 'Mise en entrepôt' }, { page: 'scan-container', label: 'Charger conteneur' },
        { page: 'scan-classic', label: 'Scanner (classique)' }, { page: 'scan-dechargement', label: 'Déchargement' },
        { page: 'scan-livraison', label: 'En livraison' }, { page: 'scan-livrer', label: 'Remise Clients' },
        { page: 'scan-history', label: 'Historique scans' },
    ],
    clients: [{ page: 'clients-list', label: 'Liste clients' }, { page: 'clients-app', label: 'Client application' }, { page: 'clients-analytics', label: 'Analytics' }],
    comms: [{ page: 'chat', label: 'Chat' }, { page: 'sms-send', label: 'Envoi SMS' }, { page: 'sms-history', label: 'Historique SMS' }, { page: 'sms', label: 'Campagnes SMS' }, { page: 'notifications', label: 'Notifications' }, { page: 'notifications-history', label: 'Historique Notif' }],
    produits: [{ page: 'products-list', label: 'Liste produits' }],
    stock: [{ page: 'stock-list', label: 'Liste produit stocké' }],
    'bilans-financiers': [{ page: 'balance-monthly', label: 'Bilan Comparatif' }, { page: 'balance-12m', label: 'Direction 12M' }, { page: 'stats-boat', label: 'Stats bateau' }, { page: 'stats-monthly', label: 'Stats par mois' }, { page: 'stats-yearly', label: 'Stats par année' }],
    settings: [
        { page: 'admin-panel', label: 'Gestion agents & accès' }, { page: 'salaire', label: 'Salaire' },
        { page: 'comptejb', label: 'Compte JB' }, { page: 'settings-agency', label: 'Agence' },
        { page: 'settings-company', label: 'Entreprise' }, { page: 'settings-software', label: 'Paramètre logiciel' },
        { page: 'settings-design', label: 'Apparence & menus' }, { page: 'settings-agents', label: 'Gestion des agents' },
        { page: 'settings-agencies', label: 'Gestion des agences' }, { page: 'settings-roles', label: 'Rôles & Menus' },
        { page: 'settings-appointments', label: 'Paramètres RDV' }, { page: 'settings-profile', label: 'Mon profil' },
    ],
    configuration: [{ page: 'config-invoice', label: 'Choix facture' }, { page: 'config-label', label: 'Choix étiquette' }, { page: 'config-container', label: 'Conteneur Actif' }, { page: 'config-objectives', label: 'Objectifs' }, { page: 'config-charges', label: 'Charges' }],
    prospecting: [{ page: 'prospecting', label: 'Prospections' }],
    'audit-log': [{ page: 'audit-log', label: "Activités log" }],
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
                .mn-row { display:flex; align-items:center; gap:14px; background:white; border:1px solid #e2e8f0; border-radius:14px; padding:14px 16px; transition:.18s; }
                .mn-row.on { border-color:#c7d2fe; box-shadow:0 2px 8px -3px rgba(79,70,229,.25); }
                .mn-row.off { opacity:.62; background:#f8fafc; }
                .mn-row.drag { outline:2px dashed #6366f1; outline-offset:2px; }
                .mn-grab { color:#cbd5e1; font-size:18px; cursor:grab; user-select:none; }
                .mn-grab:active { cursor:grabbing; }
                .mn-rank { width:26px; height:26px; flex-shrink:0; border-radius:50%; background:#eef2ff; color:#4f46e5; font-size:11px; font-weight:800; display:flex; align-items:center; justify-content:center; }
                .mn-ic { font-size:22px; width:30px; text-align:center; }
                .mn-name { flex:1; font-weight:700; color:#0f172a; font-size:15px; }
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
                                <span class="mn-sub-s">{{ isItemVisible(it.page) ? 'affiché' : 'masqué' }}</span>
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
                            </div>
                            <div v-show="activeTab==='menus'">
                                <p style="font-size:13px;color:#475569;background:white;padding:12px;border-radius:8px;border:1px solid #e2e8f0;">Menus visibles pour les utilisateurs de ce rôle.</p>
                                <div class="mn-grid">
                                    <label v-for="m in MENU_META" :key="m.key" class="mn-chk">
                                        <input type="checkbox" :value="m.key" v-model="roleForm.menus"><span>{{ m.icon }} {{ m.label }}</span>
                                    </label>
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
                const menuConfig = reactive({ order: [], roles: {}, visibleMenus: [], hiddenItems: [] });
                const expanded = reactive({});
                const loadingRoles = ref(true);
                const loadingMenus = ref(true);
                const savingMenus = ref(false);
                const showRoleForm = ref(false);
                const isEditing = ref(false);
                const savingRole = ref(false);
                const activeTab = ref('info');
                const roleForm = reactive({ id: '', name: '', description: '', menus: [], permissions: [] });
                const draggedIndex = ref(null);
                let unsubs = [];

                const metaByKey = MENU_META.reduce((a, m) => (a[m.key] = m, a), {});
                const metaOf = (key) => metaByKey[key] || { key, label: key, icon: '▫️' };

                onMounted(() => {
                    unsubs.push(onSnapshot(collection(db, "roles"), (snap) => {
                        roles.value = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                        loadingRoles.value = false;
                    }, () => { loadingRoles.value = false; }));

                    unsubs.push(onSnapshot(menuDocRef, (snap) => {
                        if (snap.exists()) {
                            const data = snap.data();
                            menuConfig.order = data.order || [];
                            menuConfig.roles = data.roles || {};
                            menuConfig.visibleMenus = data.visibleMenus || [];
                            menuConfig.hiddenItems = data.hiddenItems || [];
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
                    roleForm.menus = []; roleForm.permissions = [];
                    isEditing.value = false; activeTab.value = 'info'; showRoleForm.value = true;
                };
                const editRole = (role) => {
                    Object.assign(roleForm, role);
                    roleForm.menus = menuConfig.roles[role.id] ? [...menuConfig.roles[role.id]] : [];
                    if (!roleForm.permissions) roleForm.permissions = [];
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
                        await setDoc(menuDocRef, { roles: menuConfig.roles }, { merge: true });
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
                        await setDoc(menuDocRef, { roles: menuConfig.roles }, { merge: true });
                        globalApp.showToast("Rôle supprimé.", "success");
                    } catch (e) { globalApp.showToast("Erreur", "error"); }
                };

                return {
                    MENU_META, agencyName, roles, menuConfig, loadingRoles, loadingMenus,
                    expanded, itemsOf, toggleExpand, isItemVisible, toggleItem,
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
