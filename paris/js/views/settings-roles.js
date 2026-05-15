import { db } from '../../../firebase-config.js';
import { collection, doc, setDoc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { createApp, ref, reactive, onMounted, onUnmounted, computed } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";

export const SettingsRolesView = {
    vueApp: null,

    render(app) {
        const globalApp = app;
        window.app.views = window.app.views || {};
        window.app.views.settingsRoles = this;

        const html = `
            <style>
                [v-cloak] { display: none; }
                .roles-page { max-width: 1200px; margin: 0 auto; animation: fadeIn 0.3s ease; }
                .roles-header { background: white; border-radius: 16px; padding: 20px 25px; margin-bottom: 24px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px; }
                .roles-header__left { display: flex; align-items: center; gap: 15px; }
                .roles-header__icon { background: #fef2f2; color: #ef4444; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 14px; font-size: 28px; }
                .roles-header__title { margin: 0; font-size: 22px; font-weight: 800; color: #0f172a; }
                .roles-header__subtitle { margin: 4px 0 0 0; font-size: 13px; color: #64748b; }
                
                .roles-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; margin-bottom: 30px; }
                .role-card { background: white; border-radius: 16px; border: 1px solid #e2e8f0; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); display: flex; flex-direction: column; gap: 15px; transition: transform 0.2s; }
                .role-card:hover { transform: translateY(-3px); box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); border-color: #cbd5e1; }
                .role-card__head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #f1f5f9; padding-bottom: 15px; }
                .role-card__title { font-size: 18px; font-weight: 800; color: #0f172a; margin-bottom: 4px; }
                .role-card__id { font-family: monospace; font-size: 11px; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; color: #64748b; }
                .role-card__desc { font-size: 13px; color: #475569; line-height: 1.4; }
                .role-card__perms { font-size: 12px; font-weight: 700; color: #3b82f6; background: #eff6ff; padding: 4px 10px; border-radius: 12px; display: inline-block; width: fit-content; }
                
                .role-form-card { background: white; border-radius: 16px; border: 1px solid #e2e8f0; padding: 25px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
                .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
                @media (max-width: 768px) { .form-grid { grid-template-columns: 1fr; } }
                .form-group { display: flex; flex-direction: column; gap: 6px; }
                .form-group--full { grid-column: 1 / -1; }
                .form-label { font-size: 12px; font-weight: 700; color: #475569; }
                .form-input { padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; outline: none; transition: 0.2s; background: #f8fafc; font-weight: 600; font-family: inherit; }
                .form-input:focus { border-color: #ef4444; background: white; box-shadow: 0 0 0 3px rgba(239,68,68,0.1); }

                /* Permissions Grid */
                .perms-container { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; background: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; }
                .perms-category { background: white; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
                .perms-category__title { background: #f1f5f9; padding: 10px 15px; font-size: 12px; font-weight: 800; color: #334155; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; }
                .perms-list { display: flex; flex-direction: column; }
                .perm-item { padding: 10px 15px; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid #f1f5f9; cursor: pointer; transition: 0.2s; }
                .perm-item:last-child { border-bottom: none; }
                .perm-item:hover { background: #f8fafc; }
                .perm-item input[type="checkbox"] { width: 16px; height: 16px; accent-color: #ef4444; cursor: pointer; }
                .perm-item__label { font-size: 13px; font-weight: 600; color: #1e293b; user-select: none; }
            </style>

            <div id="vue-roles-app" class="roles-page" v-cloak>
                <div class="roles-header">
                    <div class="roles-header__left">
                        <div class="roles-header__icon"><i class="fas fa-user-shield"></i></div>
                        <div>
                            <h1 class="roles-header__title">Rôles & Permissions</h1>
                            <p class="roles-header__subtitle">Définissez des rôles sur-mesure pour un contrôle d'accès granulaire.</p>
                        </div>
                    </div>
                    <button class="btn btn-primary" @click="resetForm(); showForm = true" style="background: #ef4444; border: none; padding: 10px 20px; border-radius: 10px; font-weight: bold; color: white;">
                        ➕ Nouveau Rôle
                    </button>
                </div>

                <!-- Liste des rôles existants -->
                <div class="roles-grid" v-if="!showForm">
                    <div v-if="loading" style="grid-column: 1/-1; text-align: center; padding: 40px; color: #64748b;"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>
                    <div v-else-if="roles.length === 0" style="grid-column: 1/-1; text-align: center; padding: 40px; color: #64748b;">Aucun rôle personnalisé.</div>
                    
                    <div v-for="role in roles" :key="role.id" class="role-card">
                        <div class="role-card__head">
                            <div>
                                <div class="role-card__title">{{ role.name }}</div>
                                <span class="role-card__id">{{ role.id }}</span>
                            </div>
                        </div>
                        <div class="role-card__desc">{{ role.description || 'Aucune description' }}</div>
                        <div class="role-card__perms">{{ (role.permissions || []).length }} permission(s)</div>
                        
                        <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: auto; padding-top: 15px; border-top: 1px solid #f1f5f9;">
                            <button class="btn btn-outline btn-small" @click="editRole(role)">✏️ Modifier</button>
                            <button class="btn btn-danger btn-small" @click="deleteRole(role.id)" :disabled="['admin', 'super_admin', 'agent'].includes(role.id)">🗑️</button>
                        </div>
                    </div>
                </div>

                <!-- Formulaire de création / modification -->
                <div class="role-form-card" v-if="showForm">
                    <h3 style="margin-top: 0; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 15px; margin-bottom: 20px;">
                        {{ isEditing ? 'Modifier le rôle' : 'Créer un nouveau rôle' }}
                    </h3>
                    
                    <div class="form-grid">
                        <div class="form-group">
                            <label class="form-label">Nom du Rôle *</label>
                            <input type="text" v-model="form.name" class="form-input" placeholder="Ex: Chef Caisse">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Identifiant système (Unique) *</label>
                            <input type="text" v-model="form.id" class="form-input" :disabled="isEditing" placeholder="Ex: chef_caisse" style="font-family: monospace; text-transform: lowercase;">
                        </div>
                        <div class="form-group form-group--full">
                            <label class="form-label">Description</label>
                            <textarea v-model="form.description" class="form-input" rows="2" placeholder="Que fait ce rôle ?"></textarea>
                        </div>
                    </div>

                    <h4 style="margin: 30px 0 15px 0; color: #0f172a;">🛡️ Définition des permissions</h4>
                    <div class="perms-container">
                        <div v-for="(perms, category) in groupedPermissions" :key="category" class="perms-category">
                            <div class="perms-category__title">{{ category }}</div>
                            <div class="perms-list">
                                <label v-for="perm in perms" :key="perm.id" class="perm-item">
                                    <input type="checkbox" :value="perm.id" v-model="form.permissions">
                                    <span class="perm-item__label">{{ perm.label }}</span>
                                </label>
                            </div>
                        </div>
                    </div>
                    
                    <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 25px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
                        <button class="btn btn-outline" @click="showForm = false">Annuler</button>
                        <button class="btn btn-primary" @click="saveRole" :disabled="saving" style="background: #ef4444; border: none;">
                            <span v-if="saving"><i class="fas fa-spinner fa-spin"></i> Enregistrement...</span>
                            <span v-else>💾 Enregistrer le rôle</span>
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('contentContainer').innerHTML = html;
        this.initVue(globalApp);
    },

    initVue(globalApp) {
        if (this.vueApp) this.vueApp.unmount();

        // Dictionnaire global de toutes les permissions disponibles dans le système
        const PERMISSIONS_DEF = [
            // Caisse & Finance
            { id: 'view_bank', label: 'Voir la Caisse et la Banque', category: 'Finance' },
            { id: 'manage_expenses', label: 'Créer / Gérer les dépenses', category: 'Finance' },
            { id: 'delete_transaction', label: 'Supprimer un encaissement', category: 'Finance' },
            // Facturation & Logistique
            { id: 'delete_invoice', label: 'Supprimer une facture', category: 'Logistique' },
            { id: 'manage_fleet', label: 'Gérer la flotte automobile', category: 'Logistique' },
            { id: 'archive_container', label: 'Enregistrer un départ conteneur', category: 'Logistique' },
            // RH & Admin
            { id: 'manage_salary', label: 'Gérer les salaires & Tontine', category: 'Ressources Humaines' },
            { id: 'view_audit', label: 'Consulter le journal d\'Audit', category: 'Sécurité & Admin' },
            { id: 'delete_history', label: 'Supprimer des historiques', category: 'Sécurité & Admin' },
            { id: 'manage_settings', label: 'Accéder aux paramètres globaux', category: 'Sécurité & Admin' },
        ];

        this.vueApp = createApp({
            setup() {
                const roles = ref([]);
                const loading = ref(true);
                const showForm = ref(false);
                const isEditing = ref(false);
                const saving = ref(false);
                let unsub = null;

                const form = reactive({
                    id: '',
                    name: '',
                    description: '',
                    permissions: []
                });

                const groupedPermissions = computed(() => {
                    return PERMISSIONS_DEF.reduce((acc, perm) => {
                        if (!acc[perm.category]) acc[perm.category] = [];
                        acc[perm.category].push(perm);
                        return acc;
                    }, {});
                });

                onMounted(() => {
                    unsub = onSnapshot(collection(db, "roles"), (snapshot) => {
                        roles.value = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                        loading.value = false;
                    });
                });

                onUnmounted(() => { if (unsub) unsub(); });

                const resetForm = () => {
                    form.id = ''; form.name = ''; form.description = ''; form.permissions = [];
                    isEditing.value = false;
                };

                const editRole = (role) => {
                    Object.assign(form, role);
                    if (!form.permissions) form.permissions = [];
                    isEditing.value = true;
                    showForm.value = true;
                };

                const saveRole = async () => {
                    if (!form.id || !form.name) {
                        globalApp.showToast("L'ID et le nom sont obligatoires.", "error");
                        return;
                    }
                    saving.value = true;
                    const cleanId = form.id.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_');

                    try {
                        await setDoc(doc(db, "roles", cleanId), {
                            name: form.name,
                            description: form.description,
                            permissions: Array.from(form.permissions),
                            updatedAt: new Date().toISOString()
                        });
                        globalApp.showToast("Rôle enregistré avec succès !", "success");
                        showForm.value = false;
                    } catch(e) {
                        console.error(e);
                        globalApp.showToast("Erreur lors de l'enregistrement", "error");
                    } finally {
                        saving.value = false;
                    }
                };

                const deleteRole = async (id) => {
                    if (['admin', 'super_admin', 'agent'].includes(id)) {
                        globalApp.showToast("Les rôles par défaut ne peuvent pas être supprimés.", "error");
                        return;
                    }
                    if (!confirm(`Voulez-vous vraiment supprimer le rôle ${id} ?`)) return;
                    try {
                        await deleteDoc(doc(db, "roles", id));
                        globalApp.showToast("Rôle supprimé.", "success");
                    } catch(e) { globalApp.showToast("Erreur de suppression", "error"); }
                };

                return {
                    roles, loading, showForm, isEditing, saving, form, groupedPermissions,
                    resetForm, editRole, saveRole, deleteRole
                };
            }
        });

        this.vueApp.mount('#vue-roles-app');
    }
};