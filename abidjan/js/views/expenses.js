import { db } from '../../../firebase-config.js';
import { collection, doc, updateDoc, setDoc, query, where, orderBy, onSnapshot, writeBatch, limit, getDocs } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getCollectionName } from '../../../agencies-config.js';
import { createApp, ref, reactive, computed, onMounted, onUnmounted, watch } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";
import { getShippingMode, filterByShippingMode } from '../../../shipping-mode.js';

export const ExpensesView = {
    vueApp: null,

    render(app, container) {
        this.app = app;
        container.innerHTML = `
            <style>
                [v-cloak] { display: none; }
                .stat-box { cursor: pointer; transition: transform 0.2s, border 0.2s; border-radius: 8px; padding: 10px 15px; min-width: 140px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
                .stat-box.active { transform: scale(1.05); border: 2px solid #000 !important; }
                .stat-box:hover { opacity: 0.9; }
            </style>
            
            <div id="vue-expenses-app" v-cloak>
            <div id="caisseForm" v-show="!isViewer">
                <div class="form-grid">
                    <input type="date" v-model="form.date" required>
                    <select v-model="form.actionType" style="font-weight: bold; color: #1565c0;">
                        <option value="Depense">🔴 Enregistrer une Dépense</option>
                    </select>
                    <input type="text" v-model="form.desc" placeholder="Description (ex: Facture CIE...)" required>
                    <div class="prix-container">
                        <input type="number" v-model.number="form.amount" placeholder="Montant">
                        <span class="cfa-label">CFA</span>
                    </div>
                    <select v-model="form.mode">
                        <option value="Espèce">Espèce</option>
                        <option value="Chèque">Chèque</option>
                        <option value="OM">Orange Money</option>
                        <option value="Wave">Wave</option>
                        <option value="Virement">Virement</option>
                    </select>
                    <select v-model="form.type">
                        <option value="Mensuelle">Dépense Mensuelle</option>
                        <option value="Conteneur">Dépense de Conteneur</option>
                    </select>
                    
                    <!-- Champs Conditionnels -->
                    <select v-model="form.subtype" v-show="form.type === 'Mensuelle'">
                        <option value="">-- Catégorie (Optionnel) --</option>
                        <option value="Dépenses Livraison">Dépenses Livraison</option>
                        <option value="Dépenses Péage">Dépenses Péage</option>
                        <option value="Dépenses Carburant">Dépenses Carburant</option>
                        <option value="Dépenses Personnel">Dépenses Personnel</option>
                        <option value="Dépenses Entretien Véhicules">Dépenses Entretien Véhicules</option>
                    </select>
                    <select v-model="form.vehicleId" v-show="form.type === 'Mensuelle'">
                        <option value="">-- Véhicule (Optionnel) --</option>
                        <option v-for="v in dbVehicles" :key="v.id" :value="v.id">{{ v.name }} ({{ v.plate }})</option>
                    </select>
                    <input type="text" v-model="form.container" placeholder="Nom du Conteneur (ex: D35)" v-show="form.type === 'Conteneur'" list="containersList">
                    <datalist id="containersList">
                        <option v-for="c in dbContainers" :key="c" :value="c"></option>
                    </datalist>
                </div>

                <div class="card" v-show="pendingExpenses.length > 0" style="border-left: 4px solid #3b82f6; margin-top: 15px;">
                    <h3 style="color: #3b82f6;"><i class="fa-solid fa-clock-rotate-left"></i> Dépenses en attente d'enregistrement</h3>
                    <table class="table">
                        <thead>
                            <tr><th>Date</th><th>Description</th><th>Montant</th><th>Type</th><th>Action</th></tr>
                        </thead>
                        <tbody>
                            <tr v-for="(exp, idx) in pendingExpenses" :key="idx">
                                <td>{{ exp.date }}</td><td>{{ exp.description }}</td>
                                <td>{{ formatCFA(exp.montant) }}</td><td>{{ exp.type }}</td>
                                <td><button class="deleteBtn" @click="removePendingExpense(idx)">X</button></td>
                            </tr>
                        </tbody>
                    </table>
                    <button @click="commitPendingExpenses" class="btn btn-success" style="margin-top: 10px; width: 100%; padding: 10px; font-size: 1.1em;" :disabled="saving">
                        <i class="fa-solid fa-save"></i> Tout Enregistrer
                    </button>
                </div>

                <div class="form-buttons" v-if="canManageExp">
                    <button @click="addExpense" class="primary">Valider</button>
                </div>
            </div>

            <div class="sub-nav" style="justify-content: center; margin-top: 20px; margin-bottom: 10px;">
                <a href="#" :class="{ active: currentTab === 'monthly' }" @click.prevent="currentTab = 'monthly'">Dépenses Mensuelles</a>
                <a href="#" :class="{ active: currentTab === 'container' }" @click.prevent="currentTab = 'container'">Dépenses Conteneurs</a>
                <a href="#" :class="{ active: currentTab === 'totals' }" @click.prevent="currentTab = 'totals'">Totaux & Statistiques</a>
            </div>

            <div v-show="currentTab !== 'totals'">
                <div style="margin-bottom: 10px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                    <div style="display:flex; align-items:center; gap:5px; background:#fff; padding:5px 10px; border:1px solid #e2e8f0; border-radius:8px; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
                        <span style="font-size:0.9em; font-weight:600; color:#64748b;">📅 Période :</span>
                        <input type="month" v-model="filters.month" style="border:none; outline:none; font-family:inherit; color:#334155; background:transparent; cursor:pointer;">
                        <button @click="filters.month = ''" title="Tout voir" style="margin-left:5px; border:none; background:#f1f5f9; color:#64748b; border-radius:4px; padding:2px 6px; cursor:pointer; font-size:0.8em;">✖</button>
                    </div>
                </div>

                <!-- KPI Statistiques Dynamiques -->
                <div class="exp-stats-grid" style="display:flex; gap:15px; margin-bottom:15px; flex-wrap:wrap;">
                    <div @click="filters.category = null" class="stat-box" :class="{ active: filters.category === null }" style="background:#10b981; color:white; border: 1px solid #10b981;">
                        <div style="font-size:0.8em; text-transform:uppercase;">Total Mensuel</div>
                        <div style="font-size:1.4em; font-weight:bold;">{{ formatCFA(expenseStats.total) }}</div>
                    </div>
                    <div v-for="(stat, key) in expenseCategories" :key="key" @click="filters.category = key" class="stat-box" :class="{ active: filters.category === key }" :style="stat.style">
                        <div style="font-size:0.8em; text-transform:uppercase; color: inherit;">{{ key }}</div>
                        <div style="font-size:1.2em; font-weight:bold; color: inherit;">{{ formatCFA(expenseStats[key]) }}</div>
                    </div>
                </div>

                <div class="history-controls">
                    <div class="search-bar-container">
                        <input type="text" v-model="filters.search" placeholder="Rechercher dans les dépenses..." style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px;">
                    </div>
                    <div class="checkbox-container" style="margin-top: 10px;">
                        <input type="checkbox" v-model="filters.showDeleted" style="width: auto;">
                        <label>Afficher les éléments supprimés</label>
                        
                        <span style="margin-left: 15px;" v-show="currentTab === 'container'">
                            <input type="checkbox" v-model="filters.sortContainer" style="width:auto; vertical-align:middle;"> 
                            <label style="cursor:pointer; font-size:12px;">Tri par Conteneur</label>
                        </span>
                    </div>
                </div>
                <h2>Historique des Opérations</h2>
                <table class="table hide-on-mobile">
                    <thead>
                        <tr><th>Date</th><th>Description</th><th>Montant</th><th>Type</th><th>Mode</th><th>Conteneur</th><th>Action</th></tr>
                    </thead>
                    <tbody>
                        <tr v-for="exp in filteredExpenses" :key="exp.id" :class="{ 'deleted-row': exp.isDeleted }">
                            <td>{{ exp.date }}</td><td>{{ exp.description }}</td>
                            <td class="reste-negatif"><b>- {{ formatCFA(exp.montant) }}</b></td>
                            <td>{{ exp.type }}</td><td>{{ exp.mode || 'Espèce' }}</td><td>{{ exp.conteneur || '-' }}</td>
                            <td>
                                <div v-if="canDeleteExp && !exp.isDeleted && !isViewer">
                                    <button class="editBtn" @click="openEditModal(exp)">Modif.</button>
                                    <button class="deleteBtn" @click="deleteExpense(exp.id)">Suppr.</button>
                                </div>
                            </td>
                        </tr>
                        <tr v-if="filteredExpenses.length === 0"><td colspan="7">Aucun résultat.</td></tr>
                        <tr v-if="hasMore"><td colspan="7" style="text-align: center;"><button class="btn" @click="limitExp += 50">⬇️ Charger plus de résultats</button></td></tr>
                    </tbody>
                </table>
                <div class="show-on-mobile">
                    <div v-if="filteredExpenses.length === 0" style="text-align:center; padding:16px; color:#94a3b8;">Aucun résultat.</div>
                    <div v-for="exp in filteredExpenses" :key="'m'+exp.id" class="comm-mob-card" :style="exp.isDeleted ? 'opacity:.55;' : ''">
                        <div class="comm-mob-l1">
                            <strong>{{ exp.description }}</strong>
                            <span class="reste-negatif" style="font-weight:800; white-space:nowrap;">- {{ formatCFA(exp.montant) }}</span>
                        </div>
                        <div class="comm-mob-l2">
                            <span>{{ exp.date }}</span>
                            <span>{{ exp.type }}</span>
                            <span>{{ exp.mode || 'Espèce' }}</span>
                            <span v-if="exp.conteneur">📦 {{ exp.conteneur }}</span>
                        </div>
                        <div v-if="canDeleteExp && !exp.isDeleted && !isViewer" style="display:flex; justify-content:flex-end; gap:8px; border-top:1px solid #f1f5f9; padding-top:6px; margin-top:4px;">
                            <button class="editBtn" @click="openEditModal(exp)">Modif.</button>
                            <button class="deleteBtn" @click="deleteExpense(exp.id)">Suppr.</button>
                        </div>
                    </div>
                    <div v-if="hasMore" style="text-align:center; padding:10px;"><button class="btn" @click="limitExp += 50">⬇️ Charger plus</button></div>
                </div>
            </div>

            <!-- VUE TOTAUX -->
            <div v-show="currentTab === 'totals'" style="margin-top: 20px;">
                <div class="filter-container" style="margin-bottom: 20px; background: white; padding: 15px; border-radius: 12px; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);">
                    <h4 style="margin-top:0; margin-bottom:10px; color:#64748b;">Filtrer les statistiques par période</h4>
                    <div class="filter-fields">
                        <label>Du :</label> <input type="date" v-model="filters.totalStart">
                        <label>Au :</label> <input type="date" v-model="filters.totalEnd">
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
                    <div style="background: white; padding: 15px; border-radius: 12px; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);">
                        <h3 style="margin-top:0; border-bottom:1px solid #eee; padding-bottom:10px;">Dépenses par Mois</h3>
                        <table class="table">
                            <thead><tr><th>Mois</th><th style="text-align:right">Total</th></tr></thead>
                            <tbody>
                                <tr v-for="(total, m) in totalsData.months" :key="m" style="cursor:pointer;" @click="openMonthDetails(m)">
                                    <td>{{ m }}</td><td style="text-align:right; font-weight:bold; color:#ef4444;">{{ formatCFA(total) }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div style="background: white; padding: 15px; border-radius: 12px; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);">
                        <h3 style="margin-top:0; border-bottom:1px solid #eee; padding-bottom:10px;">Dépenses par Conteneur</h3>
                        <table class="table">
                            <thead><tr><th>Conteneur</th><th style="text-align:right">Total</th></tr></thead>
                            <tbody>
                                <tr v-for="(total, c) in totalsData.containers" :key="c" style="cursor:pointer;" @click="openContainerDetails(c)">
                                    <td>{{ c }}</td><td style="text-align:right; font-weight:bold; color:#ef4444;">{{ formatCFA(total) }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div style="background: white; padding: 15px; border-radius: 12px; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);">
                        <h3 style="margin-top:0; border-bottom:1px solid #eee; padding-bottom:10px;">Par Catégorie Spéciale</h3>
                        <table class="table">
                            <thead><tr><th>Catégorie</th><th style="text-align:right">Total</th></tr></thead>
                            <tbody>
                                <tr v-for="(total, c) in totalsData.categories" :key="c">
                                    <td>{{ c }}</td><td style="text-align:right; font-weight:bold; color:#ef4444;">{{ formatCFA(total) }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- MODALS -->
            <div class="modal" :class="{ active: showDetailsModal }">
                <div class="modal-content" style="max-width: 800px;">
                    <span class="close-modal" @click="showDetailsModal = false" style="float:right; cursor:pointer; font-size:24px;">&times;</span>
                    <h2 style="margin-top:0;">{{ detailsModalTitle }}</h2>
                    <div style="max-height: 60vh; overflow-y: auto;">
                        <table class="table">
                            <thead><tr><th>Date</th><th>Description</th><th>Type</th><th>Mode</th><th>Montant</th></tr></thead>
                            <tbody>
                                <tr v-for="e in detailsModalData" :key="e.id">
                                    <td>{{ e.date }}</td><td>{{ e.description }}</td><td>{{ e.type }}</td><td>{{ e.mode || '-' }}</td>
                                    <td style="font-weight:bold; color:#ef4444;">{{ formatCFA(e.montant) }}</td>
                                </tr>
                                <tr v-if="detailsModalData.length === 0"><td colspan="5">Aucune dépense.</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div class="modal" :class="{ active: showEditModal }">
                <div class="modal-content" style="background:#fff; padding:20px; width:90%; max-width:500px; border-radius:12px;">
                    <span class="close-modal" @click="showEditModal = false" style="float:right; cursor:pointer; font-size:24px;">&times;</span>
                    <h2 style="margin-top:0;">Modifier Dépense</h2>
                    <div style="margin-bottom:15px;"><label>Date</label><input type="date" v-model="editForm.date" style="width:100%; padding:8px;"></div>
                    <div style="margin-bottom:15px;"><label>Description</label><input type="text" v-model="editForm.desc" style="width:100%; padding:8px;"></div>
                    <div style="margin-bottom:15px;"><label>Montant</label><input type="number" v-model.number="editForm.amount" style="width:100%; padding:8px;"></div>
                    <div style="margin-bottom:15px;"><label>Type</label>
                        <select v-model="editForm.type" style="width:100%; padding:8px;">
                            <option value="Mensuelle">Mensuelle</option>
                            <option value="Conteneur">Conteneur</option>
                            <option value="Budget">Budget</option>
                        </select>
                    </div>
                    <div style="margin-bottom:15px;" v-show="editForm.type !== 'Conteneur'"><label>Catégorie</label>
                        <select v-model="editForm.subtype" style="width:100%; padding:8px;">
                            <option value="">-- Aucune --</option>
                            <option value="Dépenses Livraison">Dépenses Livraison</option>
                            <option value="Dépenses Péage">Dépenses Péage</option>
                            <option value="Dépenses Carburant">Dépenses Carburant</option>
                            <option value="Dépenses Personnel">Dépenses Personnel</option>
                            <option value="Dépenses Entretien Véhicules">Dépenses Entretien Véhicules</option>
                        </select>
                    </div>
                    <div style="margin-bottom:15px;" v-show="editForm.type !== 'Conteneur'"><label>Véhicule</label>
                        <select v-model="editForm.vehicleId" style="width:100%; padding:8px;">
                            <option value="">-- Aucun --</option>
                            <option v-for="v in dbVehicles" :key="v.id" :value="v.id">{{ v.name }}</option>
                        </select>
                    </div>
                    <div style="margin-bottom:15px;" v-show="editForm.type === 'Conteneur'"><label>Conteneur</label>
                        <input type="text" v-model="editForm.container" list="editContainersList" style="width:100%; padding:8px;">
                        <datalist id="editContainersList">
                            <option v-for="c in dbContainers" :key="c" :value="c"></option>
                        </datalist>
                    </div>
                    <div style="margin-bottom:15px;"><label>Mode</label>
                        <select v-model="editForm.mode" style="width:100%; padding:8px;">
                            <option value="Espèce">Espèce</option><option value="Wave">Wave</option><option value="OM">OM</option><option value="Chèque">Chèque</option><option value="Virement">Virement</option>
                        </select>
                    </div>
                    <div style="text-align:right;">
                        <button @click="showEditModal = false" class="btn">Annuler</button> 
                        <button @click="updateExpense" class="btn btn-success" :disabled="saving">Enregistrer</button>
                    </div>
                </div>
            </div>
            </div>
        `;
        this.initLogic();
    },

    initLogic() {
        if (this.vueApp) this.vueApp.unmount();

        this.vueApp = createApp({
            setup() {
                const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'abidjan';
                const userRole = sessionStorage.getItem('userRole') || 'Utilisateur';
                const currentUserName = sessionStorage.getItem('userName') || 'Inconnu';
                const isViewer = ref(userRole === 'spectateur');
                // Gérer les dépenses : rôles intégrés inchangés ; un rôle
                // personnalisé doit avoir la permission "manage_expenses".
                //  - canManageExp : droit d'AJOUTER (tous les intégrés le pouvaient).
                //  - canDeleteExp : droit de SUPPRIMER (réservé admin historiquement).
                const canManageExp = window.app.isBuiltinRole() || window.app.hasPermission('manage_expenses');
                const canDeleteExp = ['admin', 'super_admin'].includes(userRole) || window.app.hasPermission('manage_expenses');
                const canSaveDirectly = ['admin', 'super_admin'].includes(userRole) || window.app.hasPermission('manage_expenses');

                const currentTab = ref('monthly');
                const expenses = ref([]);
                const pendingExpenses = ref([]);
                const dbVehicles = ref([]);
                const dbContainers = ref([]);
                const unconfirmedSessions = ref(new Set());
                
                const limitExp = ref(50);
                const saving = ref(false);
                
                const showDetailsModal = ref(false);
                const detailsModalTitle = ref('');
                const detailsModalData = ref([]);
                const showEditModal = ref(false);
                
                let unsubs = [];

                const now = new Date();
                const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                const form = reactive({
                    date: new Date().toISOString().split('T')[0],
                    actionType: 'Depense',
                    desc: '', amount: null, mode: 'Espèce',
                    type: 'Mensuelle', subtype: '', vehicleId: '', container: ''
                });

                const editForm = reactive({
                    id: null, date: '', desc: '', amount: null, mode: '', type: '', subtype: '', vehicleId: '', container: ''
                });

                const filters = reactive({
                    month: defaultMonth, search: '', showDeleted: false, sortContainer: false, category: null, totalStart: '', totalEnd: ''
                });

                const expenseCategories = {
                    'Livraison': { style: 'background:#e0f2fe; color:#0369a1;' },
                    'Péage': { style: 'background:#fef3c7; color:#b45309;' },
                    'Carburant': { style: 'background:#fee2e2; color:#b91c1c;' },
                    'Personnel': { style: 'background:#e0e7ff; color:#3730a3;' },
                    'Entretien Véhicules': { style: 'background:#d1fae5; color:#065f46;' },
                    'Autres': { style: 'background:#e2e8f0; color:#475569;' }
                };

                const formatCFA = (n) => new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(n || 0).replace(/[\u202F\u00A0]/g, ' ').replace(/\s*\/\s*/g, ' ');

                const getExpenseCategory = (desc) => {
                    desc = (desc || '').toLowerCase();
                    if (['personnel'].some(k => desc.includes(k))) return 'Personnel';
                    if (['entretien', 'vidange', 'pneu', 'mecanicien', 'mécano', 'reparation', 'réparation', 'visite technique'].some(k => desc.includes(k))) return 'Entretien Véhicules';
                    if (['péage', 'peage'].some(k => desc.includes(k))) return 'Péage';
                    if (['carburant', 'essence', 'gasoil'].some(k => desc.includes(k))) return 'Carburant';
                    if (['livraison', 'police', 'douane', 'gendarmerie', 'gendarme', 'achat', 'lavage', 'aide', 'frais', 'transp', 'founi', 'stock'].some(k => desc.includes(k))) return 'Livraison';
                    return 'Autres';
                };

                // Écouteurs de données
                onMounted(() => {
                    unsubs.push(onSnapshot(query(collection(db, "fleet_vehicles"), where("isDeleted", "!=", true)), snap => {
                        dbVehicles.value = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    }));

                    const contCol = getCollectionName("containers");
                    const contConstraints = [];
                    if (contCol === "containers") contConstraints.unshift(where("agency", "==", activeAgency));
                    unsubs.push(getDocs(query(collection(db, contCol), ...contConstraints)).then(snap => {
                        dbContainers.value = snap.docs.map(doc => doc.data().number || doc.id);
                    }));

                    unsubs.push(onSnapshot(query(collection(db, "audit_logs"), where("action", "==", "VALIDATION_JOURNEE"), where("agency", "==", activeAgency)), snap => {
                        unconfirmedSessions.value.clear();
                        snap.forEach(doc => { if (doc.data().status !== "VALIDATED") unconfirmedSessions.value.add(doc.id); });
                    }));

                    fetchExpenses();
                });

                onUnmounted(() => {
                    unsubs.forEach(u => typeof u === 'function' ? u() : null);
                    if (expUnsub) expUnsub();
                });

                let expUnsub = null;
                const fetchExpenses = () => {
                    const expCol = getCollectionName("expenses");
                    let constraints = [orderBy("isDeleted"), orderBy("date", "desc"), limit(limitExp.value)];
                    if (expCol === "expenses") constraints.unshift(where("agency", "==", activeAgency));
                    if (filters.showDeleted) constraints.unshift(where("isDeleted", "==", true));
                    else constraints.unshift(where("isDeleted", "!=", true));

                    if (expUnsub) expUnsub(); // coupe l'écouteur précédent (évite fuite + doublons)
                    expUnsub = onSnapshot(query(collection(db, expCol), ...constraints), snap => {
                        expenses.value = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    });
                };
                // « Charger plus » (limitExp) et bascule Corbeille (showDeleted)
                // doivent RÉ-INTERROGER Firestore (sinon la limite de 50 reste figée).
                watch([limitExp, () => filters.showDeleted], fetchExpenses);

                // Computed
                // Isolation Maritime/Aerien gérée « par construction » : en mode
                // aérien getCollectionName('expenses') pointe sur expenses_aerien.
                // Donc pas de filtre par champ ici (sinon un doc non tagué serait
                // caché à tort).
                const validExpenses = computed(() => expenses.value.filter(e => !e.sessionId || !unconfirmedSessions.value.has(e.sessionId)));

                const filteredExpenses = computed(() => {
                    let filtered = validExpenses.value;
                    if (currentTab.value === 'monthly') filtered = filtered.filter(e => e.type !== 'Conteneur' && !e.conteneur);
                    if (currentTab.value === 'container') filtered = filtered.filter(e => e.type === 'Conteneur' || e.conteneur);

                    if (filters.month) filtered = filtered.filter(e => e.date.startsWith(filters.month));
                    if (filters.category) filtered = filtered.filter(e => getExpenseCategory(e.description) === filters.category);
                    if (filters.search) {
                        const q = filters.search.toLowerCase();
                        filtered = filtered.filter(e => (e.description || '').toLowerCase().includes(q) || (e.conteneur || '').toLowerCase().includes(q) || String(e.montant || 0).includes(q));
                    }

                    return [...filtered].sort((a, b) => {
                        if (currentTab.value === 'container' && filters.sortContainer) {
                            const cA = parseInt((a.conteneur || "").match(/\d+/) || 0, 10);
                            const cB = parseInt((b.conteneur || "").match(/\d+/) || 0, 10);
                            if (cB !== cA) return cB - cA;
                        }
                        return new Date(b.date) - new Date(a.date);
                    });
                });

                const hasMore = computed(() => filteredExpenses.value.length >= limitExp.value);

                const expenseStats = computed(() => {
                    const stats = { total: 0, 'Livraison': 0, 'Péage': 0, 'Carburant': 0, 'Personnel': 0, 'Entretien Véhicules': 0, 'Autres': 0 };
                    validExpenses.value.forEach(e => {
                        if (e.isDeleted) return;
                        if (filters.month && !e.date.startsWith(filters.month)) return;
                        if (currentTab.value === 'monthly' && (e.type === 'Conteneur' || e.conteneur)) return;
                        if (currentTab.value === 'container' && !(e.type === 'Conteneur' || e.conteneur)) return;
                        
                        const amt = e.montant || 0;
                        stats.total += amt;
                        const cat = getExpenseCategory(e.description);
                        if (stats[cat] !== undefined) stats[cat] += amt;
                    });
                    return stats;
                });

                const totalsData = computed(() => {
                    const res = { months: {}, containers: {}, categories: { 'Dépenses Livraison': 0, 'Dépenses Péage': 0, 'Dépenses Carburant': 0, 'Dépenses Personnel': 0, 'Dépenses Entretien Véhicules': 0, 'Autres': 0 } };
                    validExpenses.value.forEach(e => {
                        if (e.isDeleted) return;
                        if (filters.totalStart && e.date < filters.totalStart) return;
                        if (filters.totalEnd && e.date > filters.totalEnd) return;
                        
                        if (e.type === 'Mensuelle') { const m = e.date.substring(0, 7); res.months[m] = (res.months[m] || 0) + e.montant; }
                        if (e.type === 'Conteneur' || e.conteneur) { const c = (e.conteneur || 'Inconnu').trim().toUpperCase(); res.containers[c] = (res.containers[c] || 0) + e.montant; }
                        
                        if (e.type === 'Mensuelle') {
                            const cat = getExpenseCategory(e.description);
                            if (cat === 'Livraison') res.categories['Dépenses Livraison'] += e.montant;
                            else if (cat === 'Péage') res.categories['Dépenses Péage'] += e.montant;
                            else if (cat === 'Carburant') res.categories['Dépenses Carburant'] += e.montant;
                            else if (cat === 'Personnel') res.categories['Dépenses Personnel'] += e.montant;
                            else if (cat === 'Entretien Véhicules') res.categories['Dépenses Entretien Véhicules'] += e.montant;
                            else res.categories['Autres'] += e.montant;
                        }
                    });
                    // Tri des mois et conteneurs
                    res.months = Object.fromEntries(Object.entries(res.months).sort((a,b) => b[0].localeCompare(a[0])));
                    res.containers = Object.fromEntries(Object.entries(res.containers).sort((a,b) => a[0].localeCompare(b[0])));
                    return res;
                });

                // Actions
                const addExpense = async () => {
                if (!canManageExp) return window.app.showToast("Vous n'avez pas la permission de gérer les dépenses.", "error");
                const data = {
                        date: form.date,
                        description: `${form.type === 'Mensuelle' && form.subtype ? form.subtype + ' - ' : ''}${form.desc} (${currentUserName})`,
                        montant: parseFloat(form.amount) || 0,
                        action: form.actionType,
                        type: form.actionType === 'Depense' ? form.type : 'Budget',
                        mode: form.actionType === 'Depense' ? form.mode : 'Virement',
                        conteneur: form.type === 'Conteneur' && form.actionType === 'Depense' ? form.container.trim().toUpperCase() : '',
                        vehicleId: form.type === 'Mensuelle' ? form.vehicleId : '',
                    agency: activeAgency, isDeleted: false,
                    // Tag mode d'expedition (Maritime/Aerien). Anciennes
                    // depenses sans ce champ = maritime (legacy).
                    modeExpedition: getShippingMode()
                };
                    if (!data.date || !form.desc || data.montant <= 0) {
                        return window.AppModal ? window.AppModal.error("Veuillez remplir la description et un montant valide.") : alert("Erreur de saisie");
                    }
                    
                    if (canSaveDirectly) {
                        await setDoc(doc(collection(db, getCollectionName("expenses"))), data);
                        if (window.AppModal) window.AppModal.success("Dépense enregistrée.");
                        form.desc = ''; form.amount = null; form.subtype = ''; form.vehicleId = ''; form.container = '';
                    } else {
                        pendingExpenses.value.push(data);
                        form.desc = ''; form.amount = null; form.subtype = ''; form.vehicleId = ''; form.container = '';
                    }
                };

                const removePendingExpense = (idx) => pendingExpenses.value.splice(idx, 1);

                const commitPendingExpenses = async () => {
                    if (!canManageExp) return window.app.showToast("Vous n'avez pas la permission de gérer les dépenses.", "error");
                    if (pendingExpenses.value.length === 0) return;
                    saving.value = true;
                const batch = writeBatch(db);
                    pendingExpenses.value.forEach(exp => batch.set(doc(collection(db, getCollectionName("expenses"))), exp));
                await batch.commit();
                    pendingExpenses.value = [];
                    saving.value = false;
                    if (window.AppModal) window.AppModal.success("Enregistré avec succès !");
                };

                const deleteExpense = async (id) => {
                    if (!canDeleteExp) return window.app.showToast("Vous n'avez pas la permission de supprimer une dépense.", "error");
                    if (window.AppModal) { if (!await window.AppModal.confirm("Supprimer cette dépense ?", "Suppression", true)) return; }
                    else { if (!confirm("Supprimer ?")) return; }
                    await updateDoc(doc(db, getCollectionName("expenses"), id), { isDeleted: true });
                };

                const openEditModal = (exp) => {
                    editForm.id = exp.id; editForm.date = exp.date; editForm.desc = exp.description;
                    editForm.amount = exp.montant; editForm.type = exp.type; editForm.mode = exp.mode || 'Espèce';
                    editForm.subtype = ''; editForm.vehicleId = ''; editForm.container = '';
                    if (exp.type === 'Conteneur') editForm.container = exp.conteneur || '';
                    else editForm.vehicleId = exp.vehicleId || '';
                    showEditModal.value = true;
                };

                const updateExpense = async () => {
                    saving.value = true;
                    const data = { date: editForm.date, description: editForm.desc, montant: editForm.amount, type: editForm.type, mode: editForm.mode };
                    if (editForm.type === 'Conteneur') data.conteneur = editForm.container.trim().toUpperCase();
                    else { data.vehicleId = editForm.vehicleId; data.conteneur = ''; }
                    
                    await updateDoc(doc(db, getCollectionName("expenses"), editForm.id), data);
                    showEditModal.value = false; saving.value = false;
                    if (window.AppModal) window.AppModal.success("Modifié avec succès !");
                };

                const openMonthDetails = (month) => {
                    detailsModalTitle.value = `Détails Dépenses : ${month}`;
                    detailsModalData.value = validExpenses.value.filter(e => !e.isDeleted && e.type === 'Mensuelle' && e.date.startsWith(month)).sort((a,b)=>new Date(b.date)-new Date(a.date));
                    showDetailsModal.value = true;
                };

                const openContainerDetails = (container) => {
                    detailsModalTitle.value = `Détails Dépenses : ${container}`;
                    detailsModalData.value = validExpenses.value.filter(e => !e.isDeleted && (e.type === 'Conteneur' || e.conteneur) && (e.conteneur||'').trim().toUpperCase() === container).sort((a,b)=>new Date(b.date)-new Date(a.date));
                    showDetailsModal.value = true;
                };

                return {
                    isViewer, canSaveDirectly, canManageExp, canDeleteExp, currentTab, expenses, pendingExpenses, dbVehicles, dbContainers,
                    limitExp, saving, form, editForm, filters, expenseCategories,
                    filteredExpenses, hasMore, expenseStats, totalsData, showDetailsModal, detailsModalTitle, detailsModalData, showEditModal,
                    formatCFA, getExpenseCategory, addExpense, removePendingExpense, commitPendingExpenses, deleteExpense, openEditModal, updateExpense, openMonthDetails, openContainerDetails
                };
            }
        });
        
        this.vueApp.mount('#vue-expenses-app');
    }
};
