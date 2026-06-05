import { db } from '../../../firebase-config.js';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { createApp, ref, computed, onMounted, onUnmounted } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";
import { getCollectionName } from '../../../agencies-config.js';

export const GestionConteneursView = {
    vueApp: null,

    render(app) {
        const globalApp = app;

        const html = `
            <style>[v-cloak] { display: none; }</style>
            <div id="vue-gestion-conteneurs-app" class="page" v-cloak>
                <div class="factures-header" style="background: white; border-radius: 16px; margin-bottom: 24px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                    <div class="factures-header__content" style="display: flex; align-items: center; gap: 20px; padding: 20px 24px; flex-wrap: wrap;">
                        <div class="factures-header__icon" style="font-size: 32px; background: #e0e7ff; color: #4f46e5; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 14px;">📦</div>
                        <div class="factures-header__info" style="flex: 1;">
                            <h1 class="factures-header__title" style="margin: 0; font-size: 22px; font-weight: 700; color: #0f172a;">Gestion des Conteneurs</h1>
                            <p class="factures-header__subtitle" style="margin: 4px 0 0 0; font-size: 13px; color: #64748b;">Suivi des listes de chargement (Boîtes)</p>
                        </div>
                        <button class="btn-create-invoice" @click="openAddModal" style="background: #3b82f6; color: white; border: none; padding: 12px 20px; border-radius: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px;">
                            ➕ Nouveau Conteneur
                        </button>
                    </div>
                </div>

                <div class="factures-table-card" style="background: white; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden;">
                    <div class="table-wrap" style="overflow-x: auto;">
                        <table class="factures-table table-as-cards" style="width: 100%; border-collapse: collapse;">
                            <thead style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                                <tr>
                                    <th style="padding: 16px 12px; text-align: left; font-size: 12px; color: #475569; text-transform: uppercase;">N° Conteneur</th>
                                    <th style="padding: 16px 12px; text-align: left; font-size: 12px; color: #475569; text-transform: uppercase;">Date Création</th>
                                    <th style="padding: 16px 12px; text-align: left; font-size: 12px; color: #475569; text-transform: uppercase;">Destination</th>
                                    <th style="padding: 16px 12px; text-align: center; font-size: 12px; color: #475569; text-transform: uppercase;">Statut</th>
                                    <th style="padding: 16px 12px; text-align: right; font-size: 12px; color: #475569; text-transform: uppercase;">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-if="loading"><td colspan="5" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</td></tr>
                                <tr v-else-if="sortedContainers.length === 0"><td colspan="5" style="text-align: center; padding: 40px; color: #64748b;">Aucun conteneur. Cliquez sur Nouveau Conteneur pour commencer.</td></tr>
                                
                                <template v-else-if="isMobile">
                                    <tr v-for="c in sortedContainers" :key="c.id" class="compact-row">
                                        <td colspan="5">
                                            <div class="compact-mob-card">
                                                <div class="cmc-header">
                                                    <div class="cmc-ref-group">
                                                        <span class="cmc-ref">{{ c.number || c.id }}</span>
                                                        <span class="cmc-date">{{ formatDate(c.createdAt) }}</span>
                                                    </div>
                                                    <span :class="['status-badge', getStatusClass(c.status)]" style="font-size:9px; padding:2px 6px;">{{ getStatusText(c.status) }}</span>
                                                </div>
                                                <div class="cmc-body">
                                                    <div class="cmc-route">
                                                        Destination: <strong>{{ c.destination || 'Abidjan' }}</strong>
                                                    </div>
                                                </div>
                                                <div class="cmc-footer" style="justify-content: flex-end;">
                                                    <div class="cmc-actions">
                                                        <button class="cmc-btn cmc-btn-del" @click="deleteContainer(c.id)" title="Supprimer"><i class="fas fa-trash"></i></button>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                </template>
                                
                                <template v-else>
                                    <tr v-for="c in sortedContainers" :key="c.id">
                                        <td data-label="N° Conteneur" style="padding: 14px 12px; font-weight: bold; color: #0f172a; font-size: 15px;">{{ c.number || c.id }}</td>
                                        <td data-label="Création" style="padding: 14px 12px;">{{ formatDate(c.createdAt) }}</td>
                                        <td data-label="Destination" style="padding: 14px 12px; font-weight: 600;">{{ c.destination || 'Abidjan' }}</td>
                                        <td data-label="Statut" style="padding: 14px 12px; text-align: center;"><span :class="['badge', getStatusClass(c.status)]" style="padding: 4px 10px; border-radius: 12px; font-size: 11px;">{{ getStatusText(c.status) }}</span></td>
                                        <td data-label="Actions" style="padding: 14px 12px; text-align: right;"><button class="btn btn-outline btn-small" @click="deleteContainer(c.id)" title="Supprimer" style="color: #ef4444; border-color: #ef4444; padding: 6px;"><i class="fas fa-trash"></i></button></td>
                                    </tr>
                                </template>
                            </tbody>
                        </table>
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
                const containers = ref([]);
                const loading = ref(true);
                let unsub = null;
                const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';

                onMounted(() => {
                    unsub = onSnapshot(query(collection(db, getCollectionName("containers")), where("agency", "==", activeAgency)), (snapshot) => {
                        containers.value = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
                        loading.value = false;
                    });
                });

                onUnmounted(() => {
                    if (unsub) unsub();
                });

                const sortedContainers = computed(() => {
                    return [...containers.value].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
                });

                const getStatusClass = (status) => {
                    if (status === 'EN_TRANSIT') return 'badge-warning';
                    if (status === 'ARRIVE') return 'badge-success';
                    return 'badge-info';
                };

                const getStatusText = (status) => {
                    if (status === 'EN_TRANSIT') return 'En mer';
                    if (status === 'ARRIVE') return 'Arrivé';
                    return 'En chargement';
                };
                
                const formatDate = (dateString) => dateString ? new Date(dateString).toLocaleDateString('fr-FR', {day: '2-digit', month: 'short', year: 'numeric'}) : '-';

                const openAddModal = async () => {
                    const num = await window.AppModal.prompt("Identifiant / Numéro du nouveau conteneur :", "", "Nouveau Conteneur");
                    if (!num || !num.trim()) return;
                    try {
                        const id = num.trim().toUpperCase();
                        await setDoc(doc(db, getCollectionName("containers"), id), { number: id, status: 'EN_CHARGEMENT', destination: 'Abidjan', agency: activeAgency, createdAt: new Date().toISOString() });
                        globalApp.showToast("Conteneur créé !", "success");
                    } catch(e) { globalApp.showToast("Erreur création", "error"); }
                };

                const deleteContainer = async (id) => {
                    if (!await window.AppModal.confirm(`Supprimer le conteneur ${id} ?`, "Supprimer", true)) return;
                    try { 
                        await deleteDoc(doc(db, getCollectionName("containers"), id));
                        globalApp.showToast("Supprimé !", "success"); 
                    } catch(e) { 
                        globalApp.showToast("Erreur", "error"); 
                    }
                };

                return {
                    sortedContainers, loading,
                    getStatusClass, getStatusText, formatDate,
                    openAddModal, deleteContainer,
                    isMobile: window.innerWidth <= 768
                };
            }
        });

        this.vueApp.mount('#vue-gestion-conteneurs-app');
    }
};