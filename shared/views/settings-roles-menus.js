import { db } from '../../firebase-config.js';
import { doc, getDoc, setDoc, deleteDoc, onSnapshot, collection } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { createApp, ref, reactive, onMounted, onUnmounted, computed } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";

export const SettingsRolesMenusView = {
    vueApp: null,

    render(app, container) {
        const globalApp = app;
        window.app.views = window.app.views || {};
        window.app.views.settingsRolesMenus = this;

        const html = `
            <style>
                [v-cloak] { display: none; }
                .rm-page { max-width: 1400px; margin: 0 auto; animation: fadeIn 0.3s ease; }
                
                /* Header */
                .rm-header { background: white; border-radius: 16px; padding: 20px 25px; margin-bottom: 24px; border: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); flex-wrap: wrap; gap: 15px; }
                .rm-header__left { display: flex; align-items: center; gap: 15px; }
                .rm-header__icon { background: #fef2f2; color: #ef4444; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 14px; font-size: 28px; }
                .rm-header__title { margin: 0; font-size: 22px; font-weight: 800; color: #0f172a; }
                .rm-header__subtitle { margin: 4px 0 0 0; font-size: 13px; color: #64748b; }

                /* Layout */
                .rm-layout { display: grid; grid-template-columns: 350px 1fr; gap: 24px; align-items: start; }
                @media (max-width: 900px) { .rm-layout { grid-template-columns: 1fr; } }

                /* Menus Sidebar (Drag & Drop) */
                .rm-card { background: white; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.02); overflow: hidden; }
                .rm-card-header { padding: 15px 20px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; display: flex; justify-content: space-between; align-items: center; }
                .rm-card-header h3 { margin: 0; font-size: 16px; font-weight: 800; color: #1e293b; }
                .rm-order-list { padding: 10px; max-height: 70vh; overflow-y: auto; }
                .rm-order-item { display: flex; align-items: center; gap: 12px; padding: 10px 15px; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 8px; background: white; transition: 0.2s; cursor: grab; }
                .rm-order-item:active { cursor: grabbing; }
                .rm-order-item.dragging { opacity: 0.5; border-color: #3b82f6; background: #eff6ff; }
                .rm-grab { color: #94a3b8; font-weight: bold; letter-spacing: 2px; }
                .rm-rank { background: #f1f5f9; color: #475569; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; border-radius: 50%; font-size: 11px; font-weight: bold; flex-shrink: 0; }
                .rm-label { font-weight: 600; color: #334155; font-size: 13px; }

                /* Roles Grid */
                .rm-roles-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 20px; }
                .rm-role-card { background: white; border-radius: 16px; border: 1px solid #e2e8f0; padding: 20px; display: flex; flex-direction: column; gap: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); transition: transform 0.2s, box-shadow 0.2s; }
                .rm-role-card:hover { transform: translateY(-3px); box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); border-color: #cbd5e1; }
                .rm-role-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
                .rm-role-title { font-size: 18px; font-weight: 800; color: #0f172a; margin-bottom: 4px; }
                .rm-role-id { font-family: monospace; font-size: 11px; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; color: #64748b; }
                .rm-role-badge { background: #eff6ff; color: #3b82f6; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 700; white-space: nowrap; }
                .rm-role-desc { font-size: 13px; color: #475569; line-height: 1.4; }
                .rm-role-perms { margin-top: auto; display: flex; gap: 8px; flex-wrap: wrap; }
                .perm-pill { background: #f8fafc; border: 1px solid #e2e8f0; color: #475569; padding: 4px 10px; border-radius: 8px; font-size: 11px; font-weight: 600; display: flex; align-items: center; gap: 4px; }
                .rm-role-footer { display: flex; justify-content: flex-end; gap: 8px; padding-top: 15px; border-top: 1px solid #f1f5f9; }

                /* Modal Scoped pour éviter les conflits CSS entre Paris et Abidjan */
                .rm-modal { display: none; position: fixed; z-index: 2000; left: 0; top: 0; width: 100%; height: 100%; background-color: rgba(15, 23, 42, 0.6); backdrop-filter: blur(4px); align-items: center; justify-content: center; }
                .rm-modal.active { display: flex; animation: fadeIn 0.2s ease-out; }
                .rm-modal-content { background: #ffffff; border-radius: 16px; width: 95%; max-width: 800px; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); }

                /* Modal Custom */
                .rm-tabs { display: flex; background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 0 20px; overflow-x: auto; }
                .rm-tab-btn { padding: 15px 20px; border: none; background: none; font-size: 13px; font-weight: 700; color: #64748b; cursor: pointer; border-bottom: 2px solid transparent; transition: 0.2s; white-space: nowrap; }
                .rm-tab-btn:hover { color: #0f172a; }
                .rm-tab-btn.active { color: #ef4444; border-bottom-color: #ef4444; }

                .rm-grid-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
                .rm-check-item { display: flex; align-items: center; gap: 10px; padding: 10px 15px; border: 1px solid #e2e8f0; border-radius: 8px; cursor: pointer; transition: 0.2s; background: white; }
                .rm-check-item:hover { border-color: #cbd5e1; background: #f8fafc; }
                .rm-check-item input[type="checkbox"] { width: 16px; height: 16px; accent-color: #ef4444; cursor: pointer; }
                .rm-check-text { font-size: 13px; font-weight: 600; color: #1e293b; user-select: none; }
            </style>

            <div id="vue-roles-menus-app" class="rm-page" v-cloak>
                <div class="rm-header">
                    <div class="rm-header__left">
                        <div class="rm-header__icon"><i class="fas fa-user-shield"></i></div>
                        <div>
                            <h1 class="rm-header__title">Rôles, Permissions & Menus</h1>
                            <p class="rm-header__subtitle">Gérez de manière centralisée les accès, l'interface et la sécurité.</p>
                        </div>
                    </div>
                    <button class="btn btn-primary" @click="openRoleForm()" style="background: #ef4444; border: none; padding: 12px 20px; border-radius: 10px; font-weight: bold; display: flex; align-items: center; gap: 8px;">
                        ➕ Nouveau Rôle
                    </button>
                </div>
                
                <div class="rm-layout">
                    <!-- COLONNE GAUCHE : DRAG & DROP MENUS -->
                    <div class="rm-sidebar">
                        <div class="rm-card">
                            <div class="rm-card-header">
                                <h3>🧭 Ordre des Menus (Global)</h3>
                                <button class="btn btn-outline btn-small" @click="saveMenuOrder" :disabled="savingOrder" style="padding: 6px 12px;">
                                    <span v-if="savingOrder"><i class="fas fa-spinner fa-spin"></i></span>
                                    <span v-else>💾 Enregistrer</span>
                                </button>
                            </div>
                            <div class="rm-order-list">
                                <div v-if="loadingMenus" style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin"></i></div>
                                <div v-for="(menuKey, index) in menuConfig.order" :key="menuKey"
                                     class="rm-order-item" :class="{ 'dragging': draggedIndex === index }"
                                     draggable="true" 
                                     @dragstart="onDragStart(index, $event)" 
                                     @dragover.prevent 
                                     @dragenter.prevent
                                     @drop="onDrop(index)"
                                     @dragend="onDragEnd">
                                    <span class="rm-grab">⋮⋮</span>
                                    <span class="rm-rank">{{ index + 1 }}</span>
                                    <span class="rm-label">{{ getMenuLabel(menuKey) }}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- COLONNE DROITE : ROLES GRID -->
                    <div class="rm-main">
                        <div v-if="loadingRoles" style="text-align: center; padding: 40px; color: #64748b;"><i class="fas fa-spinner fa-spin"></i> Chargement des rôles...</div>
                        <div class="rm-roles-grid" v-else>
                            <div v-for="role in roles" :key="role.id" class="rm-role-card">
                                <div class="rm-role-head">
                                    <div>
                                        <div class="rm-role-title">{{ role.name }}</div>
                                        <span class="rm-role-id">{{ role.id }}</span>
                                    </div>
                                    <div class="rm-role-badge">
                                        <i class="fas fa-list"></i> {{ role.id === 'super_admin' ? 'ALL' : (menuConfig.roles[role.id]?.length || 0) }} Menus
                                    </div>
                                </div>
                                <div class="rm-role-desc">{{ role.description || 'Aucune description fournie.' }}</div>
                                <div class="rm-role-perms">
                                    <span class="perm-pill" v-if="role.id === 'super_admin'"><i class="fas fa-bolt" style="color: #f59e0b;"></i> Accès total Système</span>
                                    <span class="perm-pill" v-else><i class="fas fa-check-square" style="color: #10b981;"></i> {{ (role.permissions || []).length }} actions permises</span>
                                </div>
                                <div class="rm-role-footer">
                                    <button class="btn btn-outline btn-small" @click="editRole(role)">⚙️ Configurer</button>
                                    <button class="btn btn-danger btn-small" @click="deleteRole(role.id)" :disabled="isProtectedRole(role.id)">🗑️</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- MODAL CONFIGURATION ROLE -->
                <div class="rm-modal" :class="{active: showRoleForm}">
                    <div class="rm-modal-content">
                        <div style="padding: 20px; background: white; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
                            <h3 style="margin: 0; color: #0f172a;">{{ isEditing ? 'Configurer le rôle : ' + roleForm.name : 'Créer un Nouveau Rôle' }}</h3>
                            <button @click="showRoleForm = false" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #64748b;">✕</button>
                        </div>
                        
                        <div class="rm-tabs">
                            <button class="rm-tab-btn" :class="{active: activeTab === 'info'}" @click="activeTab = 'info'">📝 Informations</button>
                            <button class="rm-tab-btn" :class="{active: activeTab === 'menus'}" @click="activeTab = 'menus'">👁️ Menus Visibles</button>
                            <button class="rm-tab-btn" :class="{active: activeTab === 'actions'}" @click="activeTab = 'actions'">⚡ Actions Permises</button>
                        </div>
                        
                        <div style="padding: 25px; max-height: 60vh; overflow-y: auto; background: #f8fafc;">
                            
                            <!-- TAB INFO -->
                            <div v-show="activeTab === 'info'" class="form-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                                <div class="form-group">
                                    <label style="font-size: 12px; font-weight: 700; color: #475569; margin-bottom: 6px; display: block;">Nom du Rôle *</label>
                                    <input type="text" v-model="roleForm.name" @input="autoFillId" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box;" placeholder="Ex: Comptable">
                                </div>
                                <div class="form-group">
                                    <label style="font-size: 12px; font-weight: 700; color: #475569; margin-bottom: 6px; display: block;">Identifiant système *</label>
                                    <input type="text" v-model="roleForm.id" :disabled="isEditing" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box; font-family: monospace;" placeholder="ex: comptable">
                                </div>
                                <div class="form-group" style="grid-column: 1 / -1;">
                                    <label style="font-size: 12px; font-weight: 700; color: #475569; margin-bottom: 6px; display: block;">Description</label>
                                    <textarea v-model="roleForm.description" rows="3" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; box-sizing: border-box; resize: vertical;" placeholder="Que fait ce rôle dans l'agence ?"></textarea>
                                </div>
                            </div>
                            
                            <!-- TAB MENUS -->
                            <div v-show="activeTab === 'menus'">
                                <div style="margin-bottom: 20px; font-size: 13px; color: #475569; background: white; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0;">
                                    <i class="fas fa-info-circle" style="color: #3b82f6;"></i> Cochez les menus qui apparaîtront dans la barre latérale pour les agents ayant ce rôle.
                                </div>
                                <div class="rm-grid-list">
                                    <label v-for="menu in ALL_MENUS" :key="menu.key" class="rm-check-item">
                                        <input type="checkbox" :value="menu.key" v-model="roleForm.menus">
                                        <span class="rm-check-text">{{ menu.label }}</span>
                                    </label>
                                </div>
                            </div>
                            
                            <!-- TAB ACTIONS -->
                            <div v-show="activeTab === 'actions'">
                                <div style="margin-bottom: 20px; font-size: 13px; color: #475569; background: white; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0;">
                                    <i class="fas fa-shield-alt" style="color: #ef4444;"></i> Définissez précisément les actions autorisées (Créer, Modifier, Supprimer) à l'intérieur des menus.
                                </div>
                                <div v-for="(perms, category) in groupedPermissions" :key="category" style="margin-bottom: 25px;">
                                    <h4 style="margin: 0 0 10px 0; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">{{ category }}</h4>
                                    <div class="rm-grid-list">
                                        <label v-for="perm in perms" :key="perm.id" class="rm-check-item">
                                            <input type="checkbox" :value="perm.id" v-model="roleForm.permissions">
                                            <span class="rm-check-text">{{ perm.label }}</span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div style="padding: 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 10px; background: white;">
                            <button class="btn btn-outline" @click="showRoleForm = false" style="padding: 10px 20px; border-radius: 8px;">Annuler</button>
                            <button class="btn btn-primary" @click="saveRole" :disabled="savingRole" style="background: #ef4444; border: none; padding: 10px 20px; border-radius: 8px;">
                                <span v-if="savingRole"><i class="fas fa-spinner fa-spin"></i> Enregistrement...</span>
                                <span v-else>💾 Enregistrer la configuration</span>
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

        const ALL_MENUS = [
            { key: 'main', label: 'Menu: Accueil' },
            { key: 'special-asie', label: 'Menu: Spécial Asie (Chine)' },
            { key: 'parrainage', label: 'Menu: Réseau Partenaires' },
            { key: 'bilan', label: 'Menu: Bilan journalier' },
            { key: 'factures', label: 'Menu: Factures d\'envoi' },
            { key: 'rdv', label: 'Menu: Rendez-vous' },
            { key: 'operations', label: 'Menu: Les Programmes' },
            { key: 'devis', label: 'Menu: Devis' },
            { key: 'chargement', label: 'Menu: Chargement' },
            { key: 'scan', label: 'Menu: Scan' },
            { key: 'clients', label: 'Menu: Clients' },
            { key: 'comms', label: 'Menu: Communication' },
            { key: 'produits', label: 'Menu: Produits' },
            { key: 'finance', label: 'Menu: Finance' },
            { key: 'colis-recus', label: 'Menu: Colis reçus' },
            { key: 'stock', label: 'Menu: Stock' },
            { key: 'bilans-financiers', label: 'Menu: Bilans financiers' },
            { key: 'statistique', label: 'Menu: Statistiques' },
            { key: 'settings', label: 'Menu: Paramètres' },
            { key: 'configuration', label: 'Menu: Configuration' },
            { key: 'prospecting', label: 'Menu: Prospects' },
            { key: 'audit-log', label: 'Menu: Audit Log' }
        ];

        const ACTION_PERMS = [
            { id: 'view_bank', label: 'Voir la Caisse et la Banque', category: 'Finance' },
            { id: 'manage_expenses', label: 'Créer / Gérer les dépenses', category: 'Finance' },
            { id: 'delete_transaction', label: 'Supprimer un encaissement', category: 'Finance' },
            { id: 'delete_invoice', label: 'Supprimer une facture', category: 'Logistique' },
            { id: 'manage_fleet', label: 'Gérer la flotte automobile', category: 'Logistique' },
            { id: 'archive_container', label: 'Enregistrer un départ conteneur', category: 'Logistique' },
            { id: 'manage_salary', label: 'Gérer les salaires & Tontine', category: 'Ressources Humaines' },
            { id: 'view_audit', label: 'Consulter le journal d\'Audit', category: 'Sécurité & Admin' },
            { id: 'delete_history', label: 'Supprimer des historiques', category: 'Sécurité & Admin' },
            { id: 'manage_settings', label: 'Accéder aux paramètres globaux', category: 'Sécurité & Admin' }
        ];

        this.vueApp = createApp({
            setup() {
                const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
                const menuDocRef = doc(db, "settings", `menus_${activeAgency}`);
                
                const roles = ref([]);
                const menuConfig = reactive({ order: [], roles: {} });
                const loadingRoles = ref(true);
                const loadingMenus = ref(true);
                
                const showRoleForm = ref(false);
                const isEditing = ref(false);
                const savingRole = ref(false);
                const savingOrder = ref(false);
                const activeTab = ref('info');
                
                const roleForm = reactive({
                    id: '', name: '', description: '', menus: [], permissions: []
                });

                let unsubs = [];

                // Drag and Drop State
                const draggedIndex = ref(null);

                onMounted(() => {
                    // Chargement Rôles (Global)
                    unsubs.push(onSnapshot(collection(db, "roles"), (snapshot) => {
                        roles.value = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                        loadingRoles.value = false;
                    }));

                    // Chargement Menus Order (Local Agence)
                    unsubs.push(onSnapshot(menuDocRef, (docSnap) => {
                        if (docSnap.exists()) {
                            const data = docSnap.data();
                            menuConfig.order = data.order || [];
                            menuConfig.roles = data.roles || {};
                        }
                        
                        // Vérifier que tous les menus existent dans l'ordre (au cas où on ajoute de nouveaux menus dans le code)
                        const existingKeys = new Set(menuConfig.order);
                        ALL_MENUS.forEach(m => {
                            if (!existingKeys.has(m.key)) menuConfig.order.push(m.key);
                        });
                        
                        loadingMenus.value = false;
                    }));
                });

                onUnmounted(() => { unsubs.forEach(u => u()); });

                const groupedPermissions = computed(() => {
                    return ACTION_PERMS.reduce((acc, perm) => {
                        if (!acc[perm.category]) acc[perm.category] = [];
                        acc[perm.category].push(perm);
                        return acc;
                    }, {});
                });

                const getMenuLabel = (key) => {
                    const m = ALL_MENUS.find(x => x.key === key);
                    return m ? m.label : key;
                };

                const isProtectedRole = (id) => ['super_admin', 'admin', 'agent', 'chauf', 'manager', 'spectateur'].includes(id);

                // Drag & Drop Methods
                const onDragStart = (index, event) => {
                    draggedIndex.value = index;
                    event.dataTransfer.effectAllowed = 'move';
                };
                const onDrop = (index) => {
                    if (draggedIndex.value !== null && draggedIndex.value !== index) {
                        const temp = menuConfig.order[draggedIndex.value];
                        menuConfig.order.splice(draggedIndex.value, 1);
                        menuConfig.order.splice(index, 0, temp);
                    }
                };
                const onDragEnd = () => { draggedIndex.value = null; };

                const saveMenuOrder = async () => {
                    savingOrder.value = true;
                    try {
                        await setDoc(menuDocRef, { order: Array.from(menuConfig.order) }, { merge: true });
                        globalApp.showToast("Ordre des menus enregistré", "success");
                        if (globalApp.applyMenuConfig) globalApp.applyMenuConfig(menuConfig);
                    } catch(e) { globalApp.showToast("Erreur", "error"); }
                    savingOrder.value = false;
                };

                const autoFillId = () => {
                    if (!isEditing.value && roleForm.name) {
                        roleForm.id = roleForm.name.toLowerCase().trim()
                            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                            .replace(/[^a-z0-9_]+/g, '_');
                    }
                };

                const openRoleForm = () => {
                    roleForm.id = ''; roleForm.name = ''; roleForm.description = ''; 
                    roleForm.menus = []; roleForm.permissions = [];
                    isEditing.value = false;
                    activeTab.value = 'info';
                    showRoleForm.value = true;
                };

                const editRole = (role) => {
                    Object.assign(roleForm, role);
                    roleForm.menus = menuConfig.roles[role.id] ? [...menuConfig.roles[role.id]] : [];
                    if (!roleForm.permissions) roleForm.permissions = [];
                    isEditing.value = true;
                    activeTab.value = 'info';
                    showRoleForm.value = true;
                };

                const saveRole = async () => {
                    if (!roleForm.id || !roleForm.name) return globalApp.showToast("L'ID et le nom sont requis.", "error");
                    savingRole.value = true;
                    
                    const cleanId = roleForm.id.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_');

                    try {
                        // 1. Sauvegarde des Actions dans 'roles' (Global)
                        await setDoc(doc(db, "roles", cleanId), {
                            name: roleForm.name,
                            description: roleForm.description,
                            permissions: Array.from(roleForm.permissions),
                            updatedAt: new Date().toISOString()
                        });

                        // 2. Sauvegarde des Menus dans 'settings/menus_agence' (Local)
                        menuConfig.roles[cleanId] = Array.from(roleForm.menus);
                        await setDoc(menuDocRef, { roles: menuConfig.roles }, { merge: true });

                        globalApp.showToast("Configuration du rôle enregistrée !", "success");
                        if (globalApp.applyMenuConfig) globalApp.applyMenuConfig(menuConfig);
                        showRoleForm.value = false;
                    } catch(e) {
                        globalApp.showToast("Erreur d'enregistrement", "error");
                    } finally {
                        savingRole.value = false;
                    }
                };

                const deleteRole = async (id) => {
                    if (isProtectedRole(id)) return;
                    if (!confirm(`Supprimer définitivement le rôle ${id} ?`)) return;
                    try {
                        await deleteDoc(doc(db, "roles", id));
                        delete menuConfig.roles[id];
                        await setDoc(menuDocRef, { roles: menuConfig.roles }, { merge: true });
                        globalApp.showToast("Rôle supprimé.", "success");
                    } catch(e) { globalApp.showToast("Erreur", "error"); }
                };

                return {
                    roles, menuConfig, loadingRoles, loadingMenus, ALL_MENUS, groupedPermissions,
                    showRoleForm, isEditing, savingRole, savingOrder, activeTab, roleForm, draggedIndex,
                    getMenuLabel, isProtectedRole, onDragStart, onDrop, onDragEnd, saveMenuOrder,
                    autoFillId, openRoleForm, editRole, saveRole, deleteRole
                };
            }
        });

        this.vueApp.mount('#vue-roles-menus-app');
    }
};