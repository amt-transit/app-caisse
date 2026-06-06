import { db } from '../../../commun/firebase-config.js';
import { collection, query, where, onSnapshot, doc, addDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { createApp, ref, reactive, onMounted, onUnmounted } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";
import { getCollectionName } from '../../../commun/agencies-config.js';

export const FinanceDepensesView = {
    vueApp: null,

    render(app) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.financeDepenses = this;

        const html = `
            <style>[v-cloak] { display: none; }</style>
            <div id="vue-finance-depenses" class="page" v-cloak>
                <div class="quick-actions" style="margin-bottom: 20px;">
                    <button v-if="canManage" class="amt-btn amt-btn-primary" @click="openAddModal" style="display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-plus"></i> Nouvelle Dépense
                    </button>
                </div>

                <div class="factures-table-card" style="background: white; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                    <div style="padding: 20px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; display: flex; justify-content: space-between; align-items: center;">
                        <h3 style="margin: 0; font-size: 16px; color: #1e293b;">📉 Historique des Dépenses</h3>
                    </div>
                    <div class="table-wrap hide-on-mobile" style="overflow-x: auto;">
                        <table class="factures-table" style="width: 100%; border-collapse: collapse;">
                            <thead style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                                <tr>
                                    <th style="padding: 16px 12px; text-align: left; font-size: 12px; color: #475569; text-transform: uppercase;">Date</th>
                                    <th style="padding: 16px 12px; text-align: left; font-size: 12px; color: #475569; text-transform: uppercase;">Libellé / Description</th>
                                    <th style="padding: 16px 12px; text-align: left; font-size: 12px; color: #475569; text-transform: uppercase;">Catégorie</th>
                                    <th style="padding: 16px 12px; text-align: right; font-size: 12px; color: #475569; text-transform: uppercase;">Montant</th>
                                    <th style="padding: 16px 12px; text-align: right; font-size: 12px; color: #475569; text-transform: uppercase;">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-if="loading"><td colspan="5" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</td></tr>
                                <tr v-else-if="expenses.length === 0"><td colspan="5" style="text-align: center; padding: 40px; color: #64748b;">Aucune dépense enregistrée.</td></tr>
                                <tr v-else v-for="e in expenses" :key="e.id">
                                    <td style="padding: 14px 12px;">{{ formatDate(e.date) }}</td>
                                    <td style="padding: 14px 12px; font-weight: 600; color: #0f172a;">{{ e.description || '-' }}</td>
                                    <td style="padding: 14px 12px;"><span class="badge" style="background:#f1f5f9; color:#475569;">{{ e.category || 'Mensuelle' }}</span></td>
                                    <td style="padding: 14px 12px; text-align: right; font-weight: bold; color: #ef4444;">- {{ formatMoney(e.montant) }}</td>
                                    <td style="padding: 14px 12px; text-align: right;">
                                        <button v-if="canManage" class="amt-btn amt-btn-outline amt-btn-sm" @click="deleteExpense(e.id)" style="color: #ef4444; border-color: #ef4444; padding: 6px;" title="Supprimer">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div class="show-on-mobile">
                        <div v-if="loading" style="text-align:center; padding:30px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>
                        <div v-else-if="expenses.length === 0" style="text-align:center; padding:30px; color:#64748b;">Aucune dépense enregistrée.</div>
                        <div v-else v-for="e in expenses" :key="'m'+e.id" class="comm-mob-card">
                            <div class="comm-mob-l1">
                                <strong>{{ e.description || '-' }}</strong>
                                <span style="color:#ef4444; font-weight:800; white-space:nowrap;">- {{ formatMoney(e.montant) }}</span>
                            </div>
                            <div class="comm-mob-l2">
                                <span>{{ formatDate(e.date) }}</span>
                                <span class="badge" style="background:#f1f5f9; color:#475569;">{{ e.category || 'Mensuelle' }}</span>
                            </div>
                            <div v-if="canManage" style="display:flex; justify-content:flex-end; border-top:1px solid #f1f5f9; padding-top:6px; margin-top:4px;">
                                <button class="amt-btn amt-btn-outline amt-btn-sm" @click="deleteExpense(e.id)" style="color:#ef4444; border-color:#ef4444; padding:6px 12px;" title="Supprimer"><i class="fas fa-trash"></i> Supprimer</button>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- MODAL D'AJOUT -->
                <div v-if="showModal" class="modal active" style="display:flex; position:fixed; z-index:1000; left:0; top:0; width:100%; height:100%; background:rgba(0,0,0,0.8); align-items:center; justify-content:center;">
                    <div class="modal-content" style="background:#fff; padding:25px; width:90%; max-width:450px; border-radius:16px;">
                        <span class="close-modal" @click="closeModal" style="float:right; cursor:pointer; font-size:24px; color:#64748b;">&times;</span>
                        <h2 style="margin-top:0; color:#0f172a;">Nouvelle Dépense</h2>
                        
                        <div class="form-group" style="margin-top:15px;">
                            <label style="font-weight:600; font-size:12px; color:#475569;">Date</label>
                            <input type="date" v-model="form.date" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box;">
                        </div>
                        <div class="form-group" style="margin-top:15px;">
                            <label style="font-weight:600; font-size:12px; color:#475569;">Catégorie</label>
                            <select v-model="form.category" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box;">
                                <option value="Fournitures">Fournitures</option>
                                <option value="Maintenance">Maintenance & Entretien</option>
                                <option value="Loyer / Charges">Loyer & Charges</option>
                                <option value="Logistique">Logistique & Transport</option>
                                <option value="Autre">Autre</option>
                            </select>
                        </div>
                        <div class="form-group" style="margin-top:15px;">
                            <label style="font-weight:600; font-size:12px; color:#475569;">Description</label>
                            <input type="text" v-model="form.desc" placeholder="Achat de cartons..." style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box;">
                        </div>
                        <div class="form-group" style="margin-top:15px;">
                            <label style="font-weight:600; font-size:12px; color:#475569;">Montant (€)</label>
                            <input type="number" v-model="form.amount" placeholder="Ex: 50" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box;">
                        </div>
                        
                        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:25px;">
                            <button class="amt-btn amt-btn-outline" @click="closeModal">Annuler</button>
                            <button class="amt-btn amt-btn-primary" @click="saveExpense" :disabled="saving">
                                <span v-if="saving"><i class="fas fa-spinner fa-spin"></i> Enregistrement...</span>
                                <span v-else>Enregistrer</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('contentContainer').innerHTML = html;
        this.initVue();
    },

    initVue() {
        if (this.vueApp) this.vueApp.unmount();
        const globalApp = this.app;

        this.vueApp = createApp({
            setup() {
                const expenses = ref([]);
                const loading = ref(true);
                const showModal = ref(false);
                const saving = ref(false);
                // Gérer les dépenses : rôles intégrés inchangés ; un rôle
                // personnalisé doit avoir la permission "manage_expenses".
                const canManage = globalApp.isBuiltinRole() || globalApp.hasPermission('manage_expenses');
                
                const form = reactive({
                    date: new Date().toISOString().split('T')[0],
                    category: 'Fournitures',
                    desc: '',
                    amount: ''
                });

                let unsub = null;

                const formatMoney = (amount) => globalApp.formatMoney(amount);
                const formatDate = (dateString) => dateString ? new Date(dateString).toLocaleDateString('fr-FR') : '-';

                onMounted(() => {
                    const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
                    const q = query(collection(db, getCollectionName("expenses")), where("agency", "==", activeAgency), where("isDeleted", "==", false));
                    
                    unsub = onSnapshot(q, snap => {
                        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                        data.sort((a, b) => new Date(b.date) - new Date(a.date));
                        expenses.value = data;
                        loading.value = false;
                    });
                });

                onUnmounted(() => {
                    if (unsub) unsub();
                });

                const openAddModal = () => {
                    form.date = new Date().toISOString().split('T')[0];
                    form.category = 'Fournitures';
                    form.desc = '';
                    form.amount = '';
                    showModal.value = true;
                };

                const closeModal = () => {
                    showModal.value = false;
                };

                const saveExpense = async () => {
                    if (!canManage) return globalApp.showToast("Vous n'avez pas la permission de gérer les dépenses.", "error");
                    const amountParsed = parseFloat(form.amount) || 0;
                    if (!form.desc.trim() || amountParsed <= 0) {
                        globalApp.showToast("Remplissez la description et le montant", "error");
                        return;
                    }

                    saving.value = true;
                    
                    try {
                        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
                        await addDoc(collection(db, getCollectionName("expenses")), {
                            date: form.date,
                            category: form.category,
                            description: form.desc.trim(),
                            montant: amountParsed,
                            type: 'Mensuelle',
                            mode: 'Espèce',
                            agency: activeAgency,
                            isDeleted: false
                        });
                        globalApp.showToast("Dépense enregistrée", "success");
                        closeModal();
                    } catch(e) { 
                        globalApp.showToast("Erreur lors de l'enregistrement", "error");
                    } finally { 
                        saving.value = false; 
                    }
                };

                const deleteExpense = async (id) => {
                    if (!canManage) return globalApp.showToast("Vous n'avez pas la permission de gérer les dépenses.", "error");
                    if (!confirm("Supprimer cette dépense ?")) return;
                    try { 
                        await updateDoc(doc(db, getCollectionName("expenses"), id), { isDeleted: true });
                        globalApp.showToast("Dépense supprimée", "success"); 
                    } catch(e) { 
                        globalApp.showToast("Erreur suppression", "error"); 
                    }
                };

                return {
                    expenses, loading, showModal, saving, form, canManage,
                    formatMoney, formatDate, openAddModal, closeModal, saveExpense, deleteExpense
                };
            }
        });

        this.vueApp.mount('#vue-finance-depenses');
    }
};