import { db } from '../../../firebase-config.js';
import { collection, doc, setDoc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { createApp, ref, reactive, onMounted, onUnmounted } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";

export const SettingsAgenciesView = {
    vueApp: null,

    render(app) {
        const globalApp = app;
        window.app.views = window.app.views || {};
        window.app.views.settingsAgencies = this;

        const html = `
            <style>
                [v-cloak] { display: none; }
                .agencies-page { max-width: 1200px; margin: 0 auto; animation: fadeIn 0.3s ease; }
                .ag-header { background: white; border-radius: 16px; padding: 20px 25px; margin-bottom: 24px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px; }
                .ag-header__left { display: flex; align-items: center; gap: 15px; }
                .ag-header__icon { background: #f5f3ff; color: #8b5cf6; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 14px; font-size: 28px; }
                .ag-header__title { margin: 0; font-size: 22px; font-weight: 800; color: #0f172a; }
                .ag-header__subtitle { margin: 4px 0 0 0; font-size: 13px; color: #64748b; }
                
                .ag-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; margin-bottom: 30px; }
                .ag-card { background: white; border-radius: 16px; border: 1px solid #e2e8f0; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); display: flex; flex-direction: column; gap: 15px; transition: transform 0.2s; }
                .ag-card:hover { transform: translateY(-3px); box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); border-color: #cbd5e1; }
                .ag-card__head { display: flex; justify-content: space-between; align-items: flex-start; }
                .ag-card__flag { font-size: 32px; line-height: 1; }
                .ag-card__title { font-size: 18px; font-weight: 800; color: #0f172a; margin-bottom: 4px; }
                .ag-card__id { font-family: monospace; font-size: 11px; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; color: #64748b; }
                .ag-card__body { display: flex; flex-direction: column; gap: 8px; flex: 1; }
                .ag-card__info { display: flex; justify-content: space-between; font-size: 13px; border-bottom: 1px dashed #e2e8f0; padding-bottom: 6px; }
                .ag-card__label { color: #64748b; font-weight: 600; }
                .ag-card__val { color: #1e293b; font-weight: 800; }
                
                .ag-form-card { background: white; border-radius: 16px; border: 1px solid #e2e8f0; padding: 25px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
                .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
                @media (max-width: 768px) { .form-grid { grid-template-columns: 1fr; } }
                .form-group { display: flex; flex-direction: column; gap: 6px; }
                .form-group--full { grid-column: 1 / -1; }
                .form-label { font-size: 12px; font-weight: 700; color: #475569; }
                .form-input { padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; outline: none; transition: 0.2s; background: #f8fafc; font-weight: 600; }
                .form-input:focus { border-color: #8b5cf6; background: white; box-shadow: 0 0 0 3px rgba(139,92,246,0.1); }
            </style>

            <div id="vue-agencies-app" class="agencies-page" v-cloak>
                <div class="ag-header">
                    <div class="ag-header__left">
                        <div class="ag-header__icon">🌍</div>
                        <div>
                            <h1 class="ag-header__title">Gestion des Agences & Routes</h1>
                            <p class="ag-header__subtitle">Créez et gérez les agences pour cloisonner les flux de données (SaaS)</p>
                        </div>
                    </div>
                    <button class="btn btn-primary" @click="resetForm(); showForm = true" style="background: #8b5cf6; border: none; padding: 10px 20px; border-radius: 10px; font-weight: bold; color: white;">
                        ➕ Nouvelle Agence
                    </button>
                </div>

                <!-- Liste des agences existantes -->
                <div class="ag-grid" v-if="!showForm">
                    <div v-if="loading" style="grid-column: 1/-1; text-align: center; padding: 40px; color: #64748b;"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>
                    <div v-else-if="agencies.length === 0" style="grid-column: 1/-1; text-align: center; padding: 40px; color: #64748b;">Aucune agence configurée.</div>
                    
                    <div v-for="agency in agencies" :key="agency.id" class="ag-card">
                        <div class="ag-card__head">
                            <div>
                                <div class="ag-card__title">{{ agency.name }}</div>
                                <span class="ag-card__id">{{ agency.id }}</span>
                            </div>
                            <div class="ag-card__flag">{{ agency.flag || '🏳️' }}</div>
                        </div>
                        <div class="ag-card__body">
                            <div class="ag-card__info"><span class="ag-card__label">Type :</span> <span class="ag-card__val"><span class="badge" :style="agency.type === 'departure' ? 'background:#e0f2fe; color:#0369a1;' : 'background:#fce7f3; color:#be185d;'">{{ agency.type === 'departure' ? '🛫 DÉPART (Export)' : '🛬 ARRIVÉE (Réception)' }}</span></span></div>
                            <div class="ag-card__info"><span class="ag-card__label">Interface (Dossier) :</span> <span class="ag-card__val">{{ agency.appFolder }}</span></div>
                            <div class="ag-card__info"><span class="ag-card__label">Préfixe Conteneur :</span> <span class="ag-card__val" style="color: #ea580c;">{{ agency.prefix || 'PAR-' }}</span></div>
                        </div>
                        <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px;">
                            <button class="btn btn-outline btn-small" @click="editAgency(agency)">✏️ Modifier</button>
                            <button class="btn btn-danger btn-small" @click="deleteAgency(agency.id)">🗑️</button>
                        </div>
                    </div>
                </div>

                <!-- Formulaire de création / modification -->
                <div class="ag-form-card" v-if="showForm">
                    <h3 style="margin-top: 0; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 15px; margin-bottom: 20px;">
                        {{ isEditing ? "Modifier l'agence" : "Créer une nouvelle agence" }}
                    </h3>
                    
                    <div class="form-grid">
                        <div class="form-group">
                            <label class="form-label">Nom d'affichage *</label>
                            <input type="text" v-model="form.name" class="form-input" placeholder="Ex: CHINE (Arrivage)">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Identifiant système (Unique) *</label>
                            <input type="text" v-model="form.id" class="form-input" :disabled="isEditing" placeholder="Ex: chine_abidjan" style="font-family: monospace; text-transform: lowercase;">
                            <small style="color: #ef4444; font-size: 11px;">⚠️ Cet ID créera le tiroir de données (ex: transactions_chine_abidjan).</small>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">Rôle de l'agence *</label>
                            <select v-model="form.type" class="form-input">
                                <option value="departure">🛫 Agence de DÉPART (Crée les factures)</option>
                                <option value="arrival">🛬 Agence d'ARRIVÉE (Reçoit et encaisse)</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Interface Logicielle (Dossier) *</label>
                            <select v-model="form.appFolder" class="form-input">
                                <option value="paris">Interface PARIS (Création / Logistique)</option>
                                <option value="abidjan">Interface ABIDJAN (Caisse / Livraison)</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label class="form-label">Drapeau (Emoji) *</label>
                            <input type="text" v-model="form.flag" class="form-input" placeholder="Ex: 🇨🇳">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Préfixe des conteneurs</label>
                            <input type="text" v-model="form.prefix" class="form-input" placeholder="Ex: CHN (Laissez vide pour Paris)">
                            <small style="color: #64748b; font-size: 11px;">Empêche le mélange des scans entre agences.</small>
                        </div>
                    </div>
                    
                    <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 25px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
                        <button class="btn btn-outline" @click="showForm = false">Annuler</button>
                        <button class="btn btn-primary" @click="saveAgency" :disabled="saving" style="background: #8b5cf6; border: none;">
                            <span v-if="saving"><i class="fas fa-spinner fa-spin"></i> Enregistrement...</span>
                            <span v-else>💾 Enregistrer l'agence</span>
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

        this.vueApp = createApp({
            setup() {
                const agencies = ref([]);
                const loading = ref(true);
                const showForm = ref(false);
                const isEditing = ref(false);
                const saving = ref(false);
                let unsub = null;

                const form = reactive({
                    id: '',
                    name: '',
                    type: 'departure',
                    appFolder: 'paris',
                    flag: '',
                    prefix: ''
                });

                onMounted(() => {
                    unsub = onSnapshot(collection(db, "agencies_config"), (snapshot) => {
                        agencies.value = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                        loading.value = false;
                    });
                });

                onUnmounted(() => { if (unsub) unsub(); });

                const resetForm = () => {
                    form.id = ''; form.name = ''; form.type = 'departure'; form.appFolder = 'paris'; form.flag = '🏳️'; form.prefix = '';
                    isEditing.value = false;
                };

                const editAgency = (agency) => {
                    Object.assign(form, agency);
                    isEditing.value = true;
                    showForm.value = true;
                };

                const saveAgency = async () => {
                    if (!form.id || !form.name) {
                        globalApp.showToast("L'ID et le nom sont obligatoires.", "error");
                        return;
                    }
                    saving.value = true;
                    const cleanId = form.id.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_');

                    try {
                        await setDoc(doc(db, "agencies_config", cleanId), {
                            name: form.name,
                            type: form.type,
                            appFolder: form.appFolder,
                            flag: form.flag,
                            prefix: form.prefix,
                            updatedAt: new Date().toISOString()
                        });
                        globalApp.showToast("Agence enregistrée avec succès !", "success");
                        showForm.value = false;
                    } catch(e) {
                        console.error(e);
                        globalApp.showToast("Erreur lors de l'enregistrement", "error");
                    } finally {
                        saving.value = false;
                    }
                };

                const deleteAgency = async (id) => {
                    if (id === 'paris' || id === 'abidjan') {
                        globalApp.showToast("Les agences par défaut ne peuvent pas être supprimées.", "error");
                        return;
                    }
                    if (!confirm(`Voulez-vous vraiment supprimer l'agence ${id} ?`)) return;
                    try {
                        await deleteDoc(doc(db, "agencies_config", id));
                        globalApp.showToast("Agence supprimée.", "success");
                    } catch(e) { globalApp.showToast("Erreur de suppression", "error"); }
                };

                return {
                    agencies, loading, showForm, isEditing, saving, form,
                    resetForm, editAgency, saveAgency, deleteAgency
                };
            }
        });

        this.vueApp.mount('#vue-agencies-app');
    }
};