// Page « Produits stockés » — catalogue des CONTENANTS à proposer et déposer
// chez le client (carton, barrique, valise…) avec leur PRIX de vente.
// VOLONTAIREMENT SÉPARÉ de « Liste produits » (qui, lui, sert au fret/factures).
// Collection dédiée : stored_products (routée par agence via getCollectionName).
// Champs : desc (Nom) · price (Prix €) · dim (Dimension).
import { db } from '../../../commun/firebase-config.js';
import { collection, query, where, onSnapshot, doc, addDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getCollectionName } from '../../../commun/agencies-config.js';
import { createApp, ref, computed, reactive, onMounted, onUnmounted } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";

const COLL = 'stored_products';

export const StoredProductsView = {
    vueApp: null,

    render(app) {
        const html = `
            <style>[v-cloak] { display: none; }</style>
            <div id="vue-stored-app" style="max-width: 1100px; margin: 0 auto; animation: fadeIn 0.3s ease-in-out;" v-cloak>

                <!-- EN-TÊTE -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; background: white; padding: 20px 25px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; flex-wrap: wrap; gap: 15px;">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <div style="background: #ecfdf5; color: #059669; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; border-radius: 12px; font-size: 24px;">🗄️</div>
                        <div>
                            <h2 style="margin: 0; color: #0f172a; font-size: 22px; font-weight: 800;">Produits stockés</h2>
                            <p style="margin: 4px 0 0 0; color: #64748b; font-size: 13px;">Contenants à proposer et déposer chez le client (carton, barrique…) et leur prix</p>
                        </div>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button class="amt-btn amt-btn-primary" @click="openAddModal" style="display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-plus"></i> Nouvel article
                        </button>
                    </div>
                </div>

                <!-- KPI -->
                <div class="stats-grid" style="margin-bottom: 25px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));">
                    <div class="stat-card" style="display: flex; align-items: center; gap: 15px; text-align: left; padding: 20px;">
                        <div style="font-size: 24px; background: #ecfdf5; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: 12px;">🗄️</div>
                        <div>
                            <div style="color: #64748b; font-size: 11px; font-weight: 600; text-transform: uppercase;">Articles</div>
                            <div style="font-size: 22px; font-weight: 800; color: #0f172a;">{{ kpis.total }}</div>
                        </div>
                    </div>
                    <div class="stat-card" style="display: flex; align-items: center; gap: 15px; text-align: left; padding: 20px;">
                        <div style="font-size: 24px; background: #eff6ff; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: 12px;">💰</div>
                        <div>
                            <div style="color: #64748b; font-size: 11px; font-weight: 600; text-transform: uppercase;">Prix moyen</div>
                            <div style="font-size: 22px; font-weight: 800; color: #0f172a;">{{ formatMoney(kpis.avg) }}</div>
                        </div>
                    </div>
                </div>

                <!-- FILTRE -->
                <div class="form-card" style="margin-bottom: 25px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                    <div class="form-group" style="margin: 0;">
                        <label>🔍 Recherche</label>
                        <input type="text" v-model="search" placeholder="Nom de l'article (carton, barrique…)">
                    </div>
                </div>

                <!-- TABLEAU -->
                <div class="form-card" style="box-shadow: 0 2px 4px rgba(0,0,0,0.02); padding: 0; overflow: hidden;">
                    <div style="padding: 20px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; background: #f8fafc;">
                        <h3 style="margin: 0; font-size: 16px; color: #1e293b;">🗄️ Articles à déposer</h3>
                        <span class="badge" style="background: #e2e8f0; color: #475569;">{{ filtered.length }} article(s)</span>
                    </div>
                    <div style="overflow-x: auto;">
                        <table class="data-table" style="width: 100%; margin: 0;">
                            <thead style="background: white;">
                                <tr><th>📝 Nom de l'article</th><th style="width: 200px;">📏 Dimension</th><th style="text-align: right; width: 150px;">💰 Prix</th><th style="text-align: center; width: 100px;">⚙️ Actions</th></tr>
                            </thead>
                            <tbody>
                                <tr v-if="loading"><td colspan="4" style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</td></tr>
                                <tr v-else-if="filtered.length === 0"><td colspan="4" style="text-align: center; padding: 20px; color: #64748b;">Aucun article. Cliquez « Nouvel article » pour en ajouter.</td></tr>

                                <template v-else-if="isMobile">
                                    <tr v-for="p in filtered" :key="p.id" class="compact-row">
                                        <td colspan="4">
                                            <div class="compact-mob-card">
                                                <div class="cmc-header">
                                                    <div class="cmc-ref-group"><span class="cmc-ref">{{ p.desc }}</span></div>
                                                </div>
                                                <div class="cmc-body">
                                                    <div class="cmc-route">{{ p.dim ? '📏 ' + p.dim : '—' }}</div>
                                                </div>
                                                <div class="cmc-footer">
                                                    <div class="cmc-finance"><div class="cmc-amount">{{ formatMoney(p.price) }}</div></div>
                                                    <div class="cmc-actions">
                                                        <button class="cmc-btn cmc-btn-edit" @click="openEditModal(p)" title="Modifier"><i class="fas fa-edit"></i></button>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                </template>

                                <template v-else>
                                    <tr v-for="p in filtered" :key="p.id">
                                        <td data-label="Nom" style="font-weight: 600; color: #1e293b;">{{ p.desc }}</td>
                                        <td data-label="Dimension" style="color: #64748b; font-size: 13px;">{{ p.dim || '—' }}</td>
                                        <td data-label="Prix" style="text-align: right; font-weight: 700; font-family: monospace; font-size: 14px; color: #0f172a;">{{ formatMoney(p.price) }}</td>
                                        <td data-label="Actions" style="text-align: center;"><button class="btn-small" @click="openEditModal(p)" style="background: transparent; border: none; font-size: 16px; cursor: pointer; opacity: 0.7;" title="Modifier">✏️</button></td>
                                    </tr>
                                </template>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- MODAL -->
                <div v-if="showModal" class="modal active" style="display:flex; position:fixed; z-index:1000; left:0; top:0; width:100%; height:100%; background-color:rgba(0,0,0,0.8); align-items:center; justify-content:center;">
                    <div class="modal-content" style="background:#fff; padding:20px; width:90%; max-width:450px; border-radius:12px;">
                        <span class="close-modal" @click="closeModal" style="float:right; cursor:pointer; font-size:24px;">&times;</span>
                        <h2 style="margin-top:0;">{{ form.id ? "Modifier l'article" : 'Nouvel article' }}</h2>

                        <div style="margin-bottom:15px;">
                            <label style="display:block; margin-bottom:5px; font-weight:bold;">Nom de l'article</label>
                            <input type="text" v-model="form.desc" style="width:100%; padding:10px; box-sizing:border-box; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 14px;" placeholder="Ex : Grand carton, Barrique 220L…">
                        </div>
                        <div style="margin-bottom:15px;">
                            <label style="display:block; margin-bottom:5px; font-weight:bold;">Prix (€)</label>
                            <input type="number" v-model="form.price" style="width:100%; padding:10px; box-sizing:border-box; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 14px;" placeholder="Ex : 5">
                        </div>
                        <div style="margin-bottom:15px;">
                            <label style="display:block; margin-bottom:5px; font-weight:bold;">Dimension / Volume</label>
                            <input type="text" v-model="form.dim" style="width:100%; padding:10px; box-sizing:border-box; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 14px;" placeholder="Ex : 60x40x40 cm, 220 L…">
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:25px;">
                            <button v-if="form.id" class="btn" @click="deleteItem" style="background: #ef4444; color:white; border:none; padding:10px 15px; border-radius:8px; cursor:pointer; font-weight:bold;">🗑️ Supprimer</button>
                            <div style="margin-left:auto; display: flex; gap: 10px;">
                                <button class="btn" @click="closeModal" style="background: #6c757d; color:white; border:none; padding:10px 15px; border-radius:8px; cursor:pointer;">Annuler</button>
                                <button class="btn btn-success" @click="saveItem" :disabled="saving" style="background: #10b981; color:white; border:none; padding:10px 15px; border-radius:8px; cursor:pointer; font-weight:bold;">
                                    <span v-if="saving"><i class="fas fa-spinner fa-spin"></i></span>
                                    <span v-else>Enregistrer</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('contentContainer').innerHTML = html;
        this.initVue(app);
    },

    initVue(app) {
        if (this.vueApp) this.vueApp.unmount();
        const globalApp = app;

        this.vueApp = createApp({
            setup() {
                const items = ref([]);
                const loading = ref(true);
                const search = ref('');
                const showModal = ref(false);
                const saving = ref(false);
                const form = reactive({ id: '', desc: '', price: '', dim: '' });
                let unsub = null;

                const formatMoney = (amount) => globalApp.formatMoneyLocal ? globalApp.formatMoneyLocal(amount) : globalApp.formatMoney(amount);

                onMounted(() => {
                    const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
                    unsub = onSnapshot(query(collection(db, getCollectionName(COLL)), where("agency", "==", activeAgency)), (snapshot) => {
                        const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                        data.sort((a, b) => (a.desc || '').localeCompare(b.desc || ''));
                        items.value = data;
                        loading.value = false;
                    }, () => { loading.value = false; });
                });
                onUnmounted(() => { if (unsub) unsub(); });

                const filtered = computed(() => {
                    const s = search.value.trim().toLowerCase();
                    if (!s) return items.value;
                    return items.value.filter(p => (p.desc || '').toLowerCase().includes(s));
                });

                const kpis = computed(() => {
                    const list = filtered.value;
                    const sum = list.reduce((acc, p) => acc + (parseFloat(p.price) || 0), 0);
                    return { total: list.length, avg: list.length ? sum / list.length : 0 };
                });

                const openAddModal = () => { form.id = ''; form.desc = ''; form.price = ''; form.dim = ''; showModal.value = true; };
                const openEditModal = (p) => { form.id = p.id; form.desc = p.desc || ''; form.price = p.price !== undefined ? p.price : ''; form.dim = p.dim || ''; showModal.value = true; };
                const closeModal = () => { showModal.value = false; };

                const saveItem = async () => {
                    if (!form.desc.trim()) { globalApp.showToast("Le nom de l'article est obligatoire.", "error"); return; }
                    saving.value = true;
                    const data = { desc: form.desc.trim(), price: parseFloat(form.price) || 0, dim: form.dim.trim() };
                    try {
                        if (form.id) {
                            await updateDoc(doc(db, getCollectionName(COLL), form.id), data);
                            globalApp.showToast("Article modifié.", "success");
                        } else {
                            const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
                            await addDoc(collection(db, getCollectionName(COLL)), { ...data, agency: activeAgency, createdAt: new Date().toISOString() });
                            globalApp.showToast("Article ajouté.", "success");
                        }
                        closeModal();
                    } catch (e) {
                        globalApp.showToast("Erreur lors de l'enregistrement.", "error");
                    } finally { saving.value = false; }
                };

                const deleteItem = async () => {
                    if (!form.id) return;
                    if (!await window.AppModal.confirm("Supprimer cet article ?", "Supprimer", true)) return;
                    try {
                        await deleteDoc(doc(db, getCollectionName(COLL), form.id));
                        globalApp.showToast("Article supprimé.", "success");
                        closeModal();
                    } catch (e) { globalApp.showToast("Erreur de suppression.", "error"); }
                };

                return {
                    items, loading, search, filtered, kpis, form, showModal, saving,
                    formatMoney, openAddModal, openEditModal, closeModal, saveItem, deleteItem,
                    isMobile: window.innerWidth <= 768
                };
            }
        });

        this.vueApp.mount('#vue-stored-app');
    }
};
