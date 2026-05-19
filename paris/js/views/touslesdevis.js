import { db } from '../../../firebase-config.js';
import { getCollectionName } from '../../../agencies-config.js';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { createApp, ref, computed, reactive, onMounted, onUnmounted } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";

export const TousLesDevisView = {
    vueApp: null,

    render(app) {
        const globalApp = app;

        const html = `
            <style>[v-cloak] { display: none; }</style>
            <div id="vue-touslesdevis-app" class="page" v-cloak>
                <div class="factures-header" style="background: white; border-radius: 16px; margin-bottom: 24px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                    <div class="factures-header__content" style="display: flex; align-items: center; gap: 20px; padding: 20px 24px; flex-wrap: wrap;">
                        <div class="factures-header__icon" style="font-size: 32px; background: #ecfdf5; color: #10b981; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 14px;">📝</div>
                        <div class="factures-header__info" style="flex: 1;">
                            <h1 class="factures-header__title" style="margin: 0; font-size: 22px; font-weight: 700; color: #0f172a;">Tous les devis</h1>
                            <p class="factures-header__subtitle" style="margin: 4px 0 0 0; font-size: 13px; color: #64748b;">Gestion de vos propositions commerciales</p>
                        </div>
                        <button class="btn-create-invoice" @click="globalApp.renderPage('quote-new')" style="background: #3b82f6; color: white; border: none; padding: 12px 20px; border-radius: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px;">
                            ➕ Nouveau Devis
                        </button>
                    </div>
                </div>

                <div class="factures-filters" style="display: flex; flex-wrap: wrap; gap: 16px; background: white; padding: 20px 24px; border-radius: 16px; border: 1px solid #e2e8f0; margin-bottom: 24px;">
                    <div class="filter-group filter-group--wide" style="flex: 2; min-width: 200px;">
                        <label class="filter-label" style="display: block; font-size: 11px; font-weight: 600; color: #64748b; margin-bottom: 6px; text-transform: uppercase;">🔍 Recherche</label>
                        <input type="text" v-model="filters.search" class="filter-input" placeholder="N° Devis, Client..." style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 10px;">
                    </div>
                    <div class="filter-group" style="flex: 1; min-width: 150px;">
                        <label class="filter-label" style="display: block; font-size: 11px; font-weight: 600; color: #64748b; margin-bottom: 6px; text-transform: uppercase;">💳 Statut</label>
                        <select v-model="filters.status" class="filter-select" style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 10px;">
                            <option value="">Tous</option>
                            <option value="ENVOYÉ">Envoyé</option>
                            <option value="ACCEPTÉ">Accepté</option>
                            <option value="REFUSÉ">Refusé</option>
                        </select>
                    </div>
                </div>

                <div class="factures-table-card" style="background: white; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden;">
                    <div class="table-wrap" style="overflow-x: auto;">
                        <table class="factures-table table-as-cards" style="width: 100%; border-collapse: collapse;">
                            <thead style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                                <tr>
                                    <th style="padding: 16px 12px; text-align: left; font-size: 12px; color: #475569; text-transform: uppercase;">N° Devis</th>
                                    <th style="padding: 16px 12px; text-align: left; font-size: 12px; color: #475569; text-transform: uppercase;">Date</th>
                                    <th style="padding: 16px 12px; text-align: left; font-size: 12px; color: #475569; text-transform: uppercase;">Client</th>
                                    <th style="padding: 16px 12px; text-align: left; font-size: 12px; color: #475569; text-transform: uppercase;">Destinataire</th>
                                    <th style="padding: 16px 12px; text-align: right; font-size: 12px; color: #475569; text-transform: uppercase;">Montant Net</th>
                                    <th style="padding: 16px 12px; text-align: center; font-size: 12px; color: #475569; text-transform: uppercase;">Statut</th>
                                    <th style="padding: 16px 12px; text-align: right; font-size: 12px; color: #475569; text-transform: uppercase;">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-if="loading"><td colspan="7" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</td></tr>
                                <tr v-else-if="filteredQuotes.length === 0"><td colspan="7" style="text-align: center; padding: 40px; color: #64748b;">Aucun devis trouvé.</td></tr>
                                
                                <template v-else-if="isMobile">
                                    <tr v-for="q in filteredQuotes" :key="q.id" class="compact-row">
                                        <td colspan="7">
                                            <div class="compact-mob-card">
                                                <div class="cmc-header">
                                                    <div class="cmc-ref-group">
                                                        <span class="cmc-ref">{{ q.reference || '-' }}</span>
                                                        <span class="cmc-date">{{ formatDateShort(q.date) }}</span>
                                                    </div>
                                                    <span :class="['status-badge', getBadgeClass(q)]" style="font-size:9px; padding:2px 6px;">{{ q.status || 'ENVOYÉ' }}</span>
                                                </div>
                                                <div class="cmc-body">
                                                    <div class="cmc-route">
                                                        <strong>{{ q.client || '-' }}</strong> <i class="fas fa-arrow-right" style="color:#cbd5e1; font-size:10px; margin:0 4px;"></i> {{ q.destinataire || '-' }}
                                                    </div>
                                                </div>
                                                <div class="cmc-footer">
                                                    <div class="cmc-finance">
                                                        <div class="cmc-amount">{{ q.totalNet || 0 }} {{ getDevise(q) }}</div>
                                                    </div>
                                                    <div class="cmc-actions">
                                                        <button v-if="q.status !== 'ACCEPTÉ' && q.status !== 'REFUSÉ'" class="cmc-btn cmc-btn-pay" @click="changeStatus(q.id, 'ACCEPTÉ')" title="Marquer comme Accepté"><i class="fas fa-check"></i></button>
                                                        <button v-if="q.status !== 'ACCEPTÉ' && q.status !== 'REFUSÉ'" class="cmc-btn cmc-btn-del" @click="changeStatus(q.id, 'REFUSÉ')" title="Marquer comme Refusé"><i class="fas fa-times"></i></button>
                                                        <button class="cmc-btn cmc-btn-del" @click="deleteQuote(q.id)" title="Supprimer"><i class="fas fa-trash"></i></button>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                </template>
                                
                                <template v-else>
                                    <tr v-for="q in filteredQuotes" :key="q.id">
                                        <td data-label="N° Devis" style="padding: 14px 12px; font-weight: bold;">{{ q.reference || '-' }}</td>
                                        <td data-label="Date" style="padding: 14px 12px;">{{ formatDate(q.date) }}</td>
                                        <td data-label="Client" style="padding: 14px 12px; font-weight: 600; color: #0f172a;">{{ q.client || '-' }}</td>
                                        <td data-label="Destinataire" style="padding: 14px 12px;">{{ q.destinataire || '-' }}</td>
                                        <td data-label="Montant Net" style="padding: 14px 12px; text-align: right; font-weight: bold; color: #0f172a;">{{ q.totalNet || 0 }} {{ getDevise(q) }}</td>
                                        <td data-label="Statut" style="padding: 14px 12px; text-align: center;"><span :class="['badge', getBadgeClass(q)]" style="padding: 4px 10px; border-radius: 12px; font-size: 11px;">{{ q.status || 'ENVOYÉ' }}</span></td>
                                        <td data-label="Actions" style="padding: 14px 12px; text-align: right; display: flex; gap: 8px; justify-content: flex-end;">
                                            <button v-if="q.status !== 'ACCEPTÉ' && q.status !== 'REFUSÉ'" class="btn btn-success btn-small" @click="changeStatus(q.id, 'ACCEPTÉ')" title="Marquer comme Accepté" style="padding: 6px;"><i class="fas fa-check"></i></button>
                                            <button v-if="q.status !== 'ACCEPTÉ' && q.status !== 'REFUSÉ'" class="btn btn-danger btn-small" @click="changeStatus(q.id, 'REFUSÉ')" title="Marquer comme Refusé" style="padding: 6px;"><i class="fas fa-times"></i></button>
                                            <button class="btn btn-outline btn-small" @click="deleteQuote(q.id)" title="Supprimer" style="color: #ef4444; border-color: #ef4444; padding: 6px;"><i class="fas fa-trash"></i></button>
                                        </td>
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
                const quotes = ref([]);
                const loading = ref(true);
                
                const filters = reactive({
                    search: '',
                    status: ''
                });
                
                let unsub = null;
                
                onMounted(() => {
                    const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
                    const q = query(collection(db, getCollectionName("quotes")), where("agency", "==", activeAgency));
                    unsub = onSnapshot(q, (snapshot) => {
                        const data = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
                        data.sort((a, b) => new Date(b.date) - new Date(a.date));
                        quotes.value = data;
                        loading.value = false;
                    });
                });
                
                onUnmounted(() => {
                    if (unsub) unsub();
                });

                const filteredQuotes = computed(() => {
                    return quotes.value.filter(q => {
                        if (filters.search && !q.reference?.toLowerCase().includes(filters.search.toLowerCase()) && !q.client?.toLowerCase().includes(filters.search.toLowerCase())) return false;
                        if (filters.status && q.status !== filters.status) return false;
                        return true;
                    });
                });

                const getBadgeClass = (q) => {
                    if (q.status === 'ACCEPTÉ') return 'badge-success';
                    if (q.status === 'REFUSÉ') return 'badge-danger';
                    return 'badge-info';
                };
                
                const getDevise = (q) => q.devise === 'FCFA' ? 'CFA' : '€';
                const formatDate = (dateString) => dateString ? new Date(dateString).toLocaleDateString('fr-FR') : '-';
                const formatDateShort = (dateString) => dateString ? new Date(dateString).toLocaleDateString('fr-FR', {day: '2-digit', month: 'short'}) : '-';

                const changeStatus = async (id, newStatus) => {
                    try {
                        await updateDoc(doc(db, getCollectionName("quotes"), id), { status: newStatus });
                        globalApp.showToast(`Devis ${newStatus.toLowerCase()} !`, newStatus === 'ACCEPTÉ' ? 'success' : 'info');
                    } catch(e) { globalApp.showToast("Erreur de mise à jour", "error"); }
                };
                
                const deleteQuote = async (id) => {
                    if (window.AppModal) { if (!await window.AppModal.confirm("Supprimer ce devis de l'historique ?", "Supprimer Devis", true)) return; } 
                    else if (!confirm("Supprimer ce devis ?")) return;
                    try {
                        await deleteDoc(doc(db, getCollectionName("quotes"), id));
                        globalApp.showToast("Devis supprimé", "success");
                    } catch(e) { globalApp.showToast("Erreur de suppression", "error"); }
                };

                return {
                    quotes, loading, filters, filteredQuotes,
                    getBadgeClass, getDevise, formatDate, formatDateShort,
                    changeStatus, deleteQuote, globalApp,
                    isMobile: window.innerWidth <= 768
                };
            }
        });
        
        this.vueApp.mount('#vue-touslesdevis-app');
    }
};