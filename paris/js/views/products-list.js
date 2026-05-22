import { db } from '../../../firebase-config.js';
import { collection, query, where, onSnapshot, doc, addDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getCollectionName } from '../../../agencies-config.js';
import { createApp, ref, computed, reactive, onMounted, onUnmounted } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";
import { getShippingMode, filterByShippingMode } from '../../../shipping-mode.js';

export const ProductsListView = {
    vueApp: null,

    render(app) {
        const html = `
            <style>[v-cloak] { display: none; }</style>
            <div id="vue-products-app" style="max-width: 1200px; margin: 0 auto; animation: fadeIn 0.3s ease-in-out;" v-cloak>
                
                <!-- EN-TÊTE -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; background: white; padding: 20px 25px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; flex-wrap: wrap; gap: 15px;">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <div style="background: #eff6ff; color: #3b82f6; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; border-radius: 12px; font-size: 24px;">
                            📦
                        </div>
                        <div>
                            <h2 style="margin: 0; color: #0f172a; font-size: 22px; font-weight: 800;">Produits</h2>
                            <p style="margin: 4px 0 0 0; color: #64748b; font-size: 13px;">Gestion du catalogue de produits et services</p>
                        </div>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button class="amt-btn amt-btn-primary" @click="openAddModal" style="display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-plus"></i> Nouveau produit
                        </button>
                    </div>
                </div>

                <!-- KPI GRID -->
                <div class="stats-grid" style="margin-bottom: 25px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));">
                    <div class="stat-card" style="display: flex; align-items: center; gap: 15px; text-align: left; padding: 20px;">
                        <div style="font-size: 24px; background: #f8fafc; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: 12px;">📋</div>
                        <div>
                            <div style="color: #64748b; font-size: 11px; font-weight: 600; text-transform: uppercase;">Total produits</div>
                            <div style="font-size: 22px; font-weight: 800; color: #0f172a;">{{ kpis.total }}</div>
                        </div>
                    </div>
                    <div class="stat-card" style="display: flex; align-items: center; gap: 15px; text-align: left; padding: 20px;">
                        <div style="font-size: 24px; background: #e0f2fe; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: 12px;">📦</div>
                        <div>
                            <div style="color: #64748b; font-size: 11px; font-weight: 600; text-transform: uppercase;">Colis</div>
                            <div style="font-size: 22px; font-weight: 800; color: #0f172a;">{{ kpis.colis }}</div>
                        </div>
                    </div>
                    <div class="stat-card" style="display: flex; align-items: center; gap: 15px; text-align: left; padding: 20px;">
                        <div style="font-size: 24px; background: #fef3c7; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: 12px;">🔧</div>
                        <div>
                            <div style="color: #64748b; font-size: 11px; font-weight: 600; text-transform: uppercase;">Services</div>
                            <div style="font-size: 22px; font-weight: 800; color: #0f172a;">{{ kpis.services }}</div>
                        </div>
                    </div>
                    <div class="stat-card" style="display: flex; align-items: center; gap: 15px; text-align: left; padding: 20px;">
                        <div style="font-size: 24px; background: #dcfce7; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: 12px;">📊</div>
                        <div>
                            <div style="color: #64748b; font-size: 11px; font-weight: 600; text-transform: uppercase;">Stock</div>
                            <div style="font-size: 22px; font-weight: 800; color: #0f172a;">{{ kpis.stock }}</div>
                        </div>
                    </div>
                    <div class="stat-card" style="display: flex; align-items: center; gap: 15px; text-align: left; padding: 20px;">
                        <div style="font-size: 24px; background: #f3e8ff; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: 12px;">🏷️</div>
                        <div>
                            <div style="color: #64748b; font-size: 11px; font-weight: 600; text-transform: uppercase;">Remises</div>
                            <div style="font-size: 22px; font-weight: 800; color: #0f172a;">{{ kpis.remises }}</div>
                        </div>
                    </div>
                </div>

                <!-- FILTRES -->
                <div class="form-card" style="margin-bottom: 25px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                    <div class="form-grid" style="grid-template-columns: 2fr 1fr auto; align-items: end; margin: 0;">
                        <div class="form-group" style="margin: 0;">
                            <label>🔍 Recherche</label>
                            <input type="text" v-model="filters.search" placeholder="Référence, catégorie, description...">
                        </div>
                        <div class="form-group" style="margin: 0;">
                            <label>📊 Catégorie</label>
                            <select v-model="filters.category">
                                <option value="">Toutes les catégories</option>
                                <option value="COLIS">📦 COLIS</option>
                                <option value="SERVICES">🔧 SERVICES</option>
                                <option value="STOCK">📊 STOCK</option>
                                <option value="REMISES">🏷️ REMISES</option>
                            </select>
                        </div>
                    </div>
                </div>

                <!-- TABLEAU -->
                <div class="form-card" style="box-shadow: 0 2px 4px rgba(0,0,0,0.02); padding: 0; overflow: hidden;">
                    <div style="padding: 20px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; background: #f8fafc;">
                        <h3 style="margin: 0; font-size: 16px; color: #1e293b;">📋 Liste des produits</h3>
                        <span class="badge" style="background: #e2e8f0; color: #475569;">{{ filteredProducts.length }} produit(s)</span>
                    </div>
                    <div style="overflow-x: auto;">
                        <table class="data-table" style="width: 100%; margin: 0;">
                            <thead style="background: white;">
                                <tr><th style="padding: 15px; width: 120px;">📊 Catégorie</th><th>📝 Description</th><th style="text-align: right; width: 150px;">💰 Prix</th><th style="text-align: center; width: 100px;">⚙️ Actions</th></tr>
                            </thead>
                            <tbody>
                                <tr v-if="loading"><td colspan="4" style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</td></tr>
                                <tr v-else-if="filteredProducts.length === 0"><td colspan="4" style="text-align: center; padding: 20px; color: #64748b;">Aucun produit trouvé.</td></tr>
                                
                                <template v-else-if="isMobile">
                                    <tr v-for="p in filteredProducts" :key="p.id" class="compact-row">
                                        <td colspan="4">
                                            <div class="compact-mob-card">
                                                <div class="cmc-header">
                                                    <div class="cmc-ref-group">
                                                        <span class="cmc-ref" style="font-family: 'Inter', sans-serif;">{{ p.desc }}</span>
                                                    </div>
                                                    <span class="status-badge" :style="getCatStyle(p.category) + ' font-size:9px; padding:2px 6px;'">{{ p.category }}</span>
                                                </div>
                                                <div class="cmc-body">
                                                    <div class="cmc-route">
                                                        {{ p.dim ? '📏 ' + p.dim : 'Pas de dimension' }}
                                                    </div>
                                                </div>
                                                <div class="cmc-footer">
                                                    <div class="cmc-finance">
                                                        <div class="cmc-amount" :style="p.price < 0 ? 'color: #ef4444;' : ''">{{ formatMoney(p.price) }}</div>
                                                    </div>
                                                    <div class="cmc-actions">
                                                        <button class="cmc-btn cmc-btn-edit" @click="openEditModal(p)" title="Modifier"><i class="fas fa-edit"></i></button>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                </template>
                                
                                <template v-else>
                                    <tr v-for="p in filteredProducts" :key="p.id">
                                        <td data-label="Catégorie" style="padding: 15px;"><span class="badge" :style="getCatStyle(p.category) + ' padding: 4px 10px; border-radius: 12px; font-weight: 600; font-size: 11px;'">{{ p.category }}</span></td>
                                        <td data-label="Description" style="font-weight: 600; color: #1e293b;">{{ p.desc }} <br v-if="p.dim"><span v-if="p.dim" style="font-size: 11px; color: #64748b; font-weight: normal;">📏 {{ p.dim }}</span></td>
                                        <td data-label="Prix" :style="'text-align: right; font-weight: 700; font-family: monospace; font-size: 14px; ' + (p.price < 0 ? 'color: #ef4444;' : 'color: #0f172a;')">{{ formatMoney(p.price) }}</td>
                                        <td data-label="Actions" style="text-align: center;"><button class="btn-small" @click="openEditModal(p)" style="background: transparent; border: none; font-size: 16px; cursor: pointer; opacity: 0.7; transition: 0.2s;" title="Modifier" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.7">✏️</button></td>
                                    </tr>
                                </template>
                            </tbody>
                        </table>
                    </div>
                </div>

            <!-- MODAL AJOUT / MODIFICATION PRODUIT -->
            <div v-if="showModal" class="modal active" style="display:flex; position:fixed; z-index:1000; left:0; top:0; width:100%; height:100%; background-color:rgba(0,0,0,0.8); align-items:center; justify-content:center;">
                <div class="modal-content" style="background:#fff; padding:20px; width:90%; max-width:450px; border-radius:12px;">
                    <span class="close-modal" @click="closeModal" style="float:right; cursor:pointer; font-size:24px;">&times;</span>
                    <h2 style="margin-top:0;">{{ form.id ? 'Modifier Produit' : 'Nouveau Produit' }}</h2>
                    
                    <div style="margin-bottom:15px;">
                        <label style="display:block; margin-bottom:5px; font-weight:bold;">Catégorie</label>
                        <select v-model="form.category" style="width:100%; padding:10px; box-sizing:border-box; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 14px;">
                            <option value="COLIS">📦 COLIS</option>
                            <option value="SERVICES">🔧 SERVICES</option>
                            <option value="STOCK">📊 STOCK</option>
                            <option value="REMISES">🏷️ REMISES</option>
                        </select>
                    </div>
                    <div style="margin-bottom:15px;">
                        <label style="display:block; margin-bottom:5px; font-weight:bold;">Description</label>
                        <input type="text" v-model="form.desc" style="width:100%; padding:10px; box-sizing:border-box; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 14px;" placeholder="Ex: Grand Carton">
                    </div>
                    <div style="margin-bottom:15px;">
                        <label style="display:block; margin-bottom:5px; font-weight:bold;">Prix par défaut (€)</label>
                        <input type="number" v-model="form.price" style="width:100%; padding:10px; box-sizing:border-box; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 14px;" placeholder="Ex: 50">
                    </div>
                    <div style="margin-bottom:15px;">
                        <label style="display:block; margin-bottom:5px; font-weight:bold;">Dimension / Volume</label>
                        <input type="text" v-model="form.dim" style="width:100%; padding:10px; box-sizing:border-box; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 14px;" placeholder="Ex: 0.5 m³, 60x40x40 cm...">
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:25px;">
                        <button v-if="form.id" class="btn" @click="deleteProduct" style="background: #ef4444; color:white; border:none; padding:10px 15px; border-radius:8px; cursor:pointer; font-weight:bold;">🗑️ Supprimer</button>
                        <div style="margin-left:auto; display: flex; gap: 10px;">
                            <button class="btn" @click="closeModal" style="background: #6c757d; color:white; border:none; padding:10px 15px; border-radius:8px; cursor:pointer;">Annuler</button>
                            <button class="btn btn-success" @click="saveProduct" :disabled="saving" style="background: #10b981; color:white; border:none; padding:10px 15px; border-radius:8px; cursor:pointer; font-weight:bold;">
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
                const products = ref([]);
                const loading = ref(true);
                
                const filters = reactive({
                    search: '',
                    category: ''
                });

                const showModal = ref(false);
                const saving = ref(false);
                const form = reactive({ id: '', category: 'COLIS', desc: '', price: '', dim: '' });

                let unsub = null;

                const formatMoney = (amount) => globalApp.formatMoney(amount);

                const getCatStyle = (cat) => {
                    switch(cat) {
                        case 'COLIS': return 'background: #e0f2fe; color: #0369a1;';
                        case 'SERVICES': return 'background: #fef3c7; color: #b45309;';
                        case 'STOCK': return 'background: #dcfce7; color: #166534;';
                        case 'REMISES': return 'background: #f3e8ff; color: #7e22ce;';
                        default: return 'background: #f1f5f9; color: #475569;';
                    }
                };

                onMounted(() => {
                    const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
                    unsub = onSnapshot(query(collection(db, getCollectionName("products")), where("agency", "==", activeAgency)), (snapshot) => {
                        // Isolation Maritime/Aerien « par construction » :
                        // getCollectionName('products') -> products_aerien en aérien.
                        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                        data.sort((a, b) => (a.desc || '').localeCompare(b.desc || ''));
                        products.value = data;
                        loading.value = false;
                    });
                });

                onUnmounted(() => {
                    if (unsub) unsub();
                });

                const filteredProducts = computed(() => {
                    return products.value.filter(p => {
                        if (filters.search && !p.desc.toLowerCase().includes(filters.search.toLowerCase()) && !p.category.toLowerCase().includes(filters.search.toLowerCase())) return false;
                        if (filters.category && p.category !== filters.category) return false;
                        return true;
                    });
                });

                const kpis = computed(() => {
                    return {
                        total: filteredProducts.value.length,
                        colis: filteredProducts.value.filter(p => p.category === 'COLIS').length,
                        services: filteredProducts.value.filter(p => p.category === 'SERVICES').length,
                        stock: filteredProducts.value.filter(p => p.category === 'STOCK').length,
                        remises: filteredProducts.value.filter(p => p.category === 'REMISES').length
                    };
                });

                const openAddModal = () => {
                    form.id = '';
                    form.category = 'COLIS';
                    form.desc = '';
                    form.price = '';
                    form.dim = '';
                    showModal.value = true;
                };

                const openEditModal = (p) => {
                    form.id = p.id;
                    form.category = p.category || 'COLIS';
                    form.desc = p.desc || '';
                    form.price = p.price !== undefined ? p.price : '';
                    form.dim = p.dim || '';
                    showModal.value = true;
                };

                const closeModal = () => {
                    showModal.value = false;
                };

                const saveProduct = async () => {
                    if (!form.desc.trim()) {
                        globalApp.showToast("La description est obligatoire.", "error");
                        return;
                    }

                    saving.value = true;
                    const data = {
                        category: form.category,
                        desc: form.desc.trim(),
                        price: parseFloat(form.price) || 0,
                        dim: form.dim.trim()
                    };

                    try {
                        if (form.id) {
                            await updateDoc(doc(db, getCollectionName("products"), form.id), data);
                            globalApp.showToast("Produit modifié avec succès !", "success");
                        } else {
                            const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
                            await addDoc(collection(db, getCollectionName("products")), { ...data, agency: activeAgency, createdAt: new Date().toISOString(), modeExpedition: getShippingMode() });
                            globalApp.showToast("Produit ajouté avec succès !", "success");
                        }
                        closeModal();
                    } catch (e) {
                        globalApp.showToast("Erreur lors de l'enregistrement.", "error");
                    } finally {
                        saving.value = false;
                    }
                };

                const deleteProduct = async () => {
                    if (!form.id) return;
                    if (!await window.AppModal.confirm("Voulez-vous vraiment supprimer ce produit ?", "Supprimer", true)) return;
                    try {
                        await deleteDoc(doc(db, getCollectionName("products"), form.id));
                        globalApp.showToast("Produit supprimé.", "success");
                        closeModal();
                    } catch (e) {
                        globalApp.showToast("Erreur de suppression.", "error");
                    }
                };

                return {
                    products, loading, filters, filteredProducts, kpis, form, showModal, saving,
                    formatMoney, getCatStyle, openAddModal, openEditModal, closeModal, saveProduct, deleteProduct,
                    isMobile: window.innerWidth <= 768
                };
            }
        });

        this.vueApp.mount('#vue-products-app');
    }
};