import { db } from '../../../firebase-config.js';
import { collection, query, where, onSnapshot, limit, orderBy, writeBatch, doc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { createApp, ref, reactive, computed, onMounted, onUnmounted, watch } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";

export const ScanHistoryView = {
    vueApp: null,

    render(app) {
        const globalApp = app;
        window.app.views = window.app.views || {};
        window.app.views.scanHistory = this;

        const html = `
            <style>
                [v-cloak] { display: none; }
                .scan-history-page { max-width: 1400px; margin: 0 auto; animation: fadeIn 0.3s ease; }
                .scan-history-header { background: white; border-radius: 16px; padding: 20px 25px; margin-bottom: 20px; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
                .scan-history-header__content { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 15px; }
                .scan-history-header__title { margin: 0; font-size: 20px; font-weight: 800; color: #0f172a; }
                .scan-history-header__subtitle { margin: 4px 0 0 0; font-size: 13px; color: #64748b; }
                .scan-history-header__actions { display: flex; gap: 10px; }
                
                .btn-export { padding: 8px 16px; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer; border: 1px solid transparent; transition: 0.2s; }
                .btn-export--excel { background: #f0fdf4; color: #16a34a; border-color: #bbf7d0; }
                .btn-export--excel:hover { background: #dcfce7; }
                .btn-export--pdf { background: #fef2f2; color: #dc2626; border-color: #fecaca; }
                .btn-export--pdf:hover { background: #fee2e2; }

                .filters-section { background: white; border-radius: 16px; padding: 20px; border: 1px solid #e2e8f0; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
                .filters-title { margin: 0 0 15px 0; font-size: 15px; font-weight: 700; color: #1e293b; }
                .filters-grid { display: flex; flex-wrap: wrap; gap: 15px; align-items: flex-end; }
                .filter-field { flex: 1; min-width: 150px; display: flex; flex-direction: column; gap: 6px; }
                .filter-field--action { flex: 0 0 auto; }
                .filter-label { font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; }
                .filter-input, .filter-select { width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; outline: none; background: #f8fafc; transition: 0.2s; }
                .filter-input:focus, .filter-select:focus { border-color: #3b82f6; background: white; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
                .btn-refresh { background: #3b82f6; color: white; border: none; padding: 10px 16px; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer; transition: 0.2s; height: 39px; display: flex; align-items: center; gap: 6px; }
                .btn-refresh:hover { background: #2563eb; }

                .bulk-actions-section { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 15px 20px; margin-bottom: 20px; }
                .bulk-actions-card { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px; }
                .bulk-count { font-size: 14px; color: #475569; font-weight: 600; display: flex; align-items: center; gap: 8px; }
                .bulk-count__number { background: #3b82f6; color: white; padding: 2px 10px; border-radius: 12px; font-weight: 800; }
                .bulk-actions-buttons { display: flex; gap: 10px; }
                .btn-bulk { padding: 8px 16px; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer; border: 1px solid transparent; transition: 0.2s; }
                .btn-bulk--select { background: white; border-color: #cbd5e1; color: #475569; }
                .btn-bulk--select:hover { background: #f1f5f9; color: #0f172a; }
                .btn-bulk--clear { background: white; border-color: #cbd5e1; color: #64748b; }
                .btn-bulk--clear:hover:not(:disabled) { background: #f1f5f9; color: #0f172a; }
                .btn-bulk--update { background: #fef2f2; border-color: #fecaca; color: #ef4444; }
                .btn-bulk--update:hover:not(:disabled) { background: #fee2e2; }
                .btn-bulk:disabled { opacity: 0.5; cursor: not-allowed; }

                .table-section { background: white; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.02); overflow: hidden; }
                .table-wrapper { overflow-x: auto; }
                .data-table { width: 100%; border-collapse: collapse; }
                .data-table th { text-align: left; padding: 15px 20px; background: #f8fafc; font-size: 12px; font-weight: 700; color: #64748b; border-bottom: 1px solid #e2e8f0; text-transform: uppercase; white-space: nowrap; }
                .data-table td { padding: 15px 20px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #334155; vertical-align: middle; }
                .table-row { transition: background 0.2s; cursor: pointer; }
                .table-row:hover { background: #f8fafc; }
                .table-row.selected { background: #eff6ff; }
                
                .col-checkbox { width: 40px; text-align: center; }
                .table-checkbox { width: 16px; height: 16px; cursor: pointer; accent-color: #3b82f6; }
                
                .col-time { font-weight: 600; color: #475569; }
                .col-qr code { font-family: monospace; font-size: 14px; font-weight: 800; color: #0f172a; background: #f1f5f9; padding: 4px 8px; border-radius: 6px; }
                .col-container { font-weight: 700; color: #3b82f6; }
                .col-agent { font-weight: 700; color: #1e293b; }
                
                .status-badge { padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 800; display: inline-flex; align-items: center; gap: 4px; letter-spacing: 0.5px; }
                .status-badge--success { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
                .status-badge--warning { background: #ffedd5; color: #c2410c; border: 1px solid #fed7aa; }
                .status-badge--error { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
            </style>

            <div id="vue-scan-history-app" class="scan-history-page" v-cloak>
                <div class="scan-history-header">
                    <div class="scan-history-header__content">
                        <div class="scan-history-header__info">
                            <h1 class="scan-history-header__title">📊 Scan — Historique</h1>
                            <p class="scan-history-header__subtitle">Journal d'audit — {{ filteredScans.length }} résultat(s)</p>
                        </div>
                        <div class="scan-history-header__actions">
                            <button class="btn-export btn-export--excel" type="button" @click="exportExcel"> 📄 Excel </button>
                            <button class="btn-export btn-export--pdf" type="button" @click="exportPDF"> 📝 PDF </button>
                        </div>
                    </div>
                </div>

                <div class="filters-section">
                    <h3 class="filters-title">🔍 Filtres</h3>
                    <div class="filters-grid">
                        <div class="filter-field">
                            <label class="filter-label">🏷️ Type</label>
                            <select class="filter-select" v-model="filters.type">
                                <option value="">Tous les types</option>
                                <option value="ENTREPOT_PARIS">Mise en entrepôt (Paris)</option>
                                <option value="CONTENEUR_CHARGEMENT">Chargement Conteneur (Paris)</option>
                                <option value="DECHARGEMENT_ABIDJAN">Déchargement Conteneur (Abidjan)</option>
                                <option value="MISE_EN_LIVRAISON">Mise en Livraison (Abidjan)</option>
                                <option value="REMISE_CLIENT">Remise au Client (Abidjan)</option>
                            </select>
                        </div>
                        <div class="filter-field">
                            <label class="filter-label">📊 Statut</label>
                            <select class="filter-select" v-model="filters.status">
                                <option value="">Tous les statuts</option>
                                <option value="SUCCES">✅ Succès</option>
                                <option value="DOUBLON">⚠️ Doublon</option>
                                <option value="ERREUR">❌ Erreur</option>
                            </select>
                        </div>
                        <div class="filter-field">
                            <label class="filter-label">📅 Date</label>
                            <input class="filter-input" type="date" v-model="filters.date">
                        </div>
                        <div class="filter-field" style="flex: 1.5;">
                            <label class="filter-label">🔍 Recherche QR</label>
                            <input class="filter-input" placeholder="Ex: MD-125…" v-model="filters.search">
                        </div>
                        <div class="filter-field">
                            <label class="filter-label">⚙️ Limite</label>
                            <select class="filter-select" v-model="currentLimit">
                                <option value="50">50 derniers</option>
                                <option value="100">100 derniers</option>
                                <option value="200">200 derniers</option>
                                <option value="500">500 derniers</option>
                            </select>
                        </div>
                        <div class="filter-field filter-field--action">
                            <button class="btn-refresh" type="button" @click="loadData"> 🔄 Actualiser </button>
                        </div>
                    </div>
                </div>

                <div class="bulk-actions-section">
                    <div class="bulk-actions-card">
                        <div class="bulk-actions-info">
                            <span class="bulk-count">
                                <span class="bulk-count__number">{{ selectedIds.length }}</span>
                                <span class="bulk-count__label">sélectionné(s)</span>
                            </span>
                        </div>
                        <div class="bulk-actions-buttons">
                            <button class="btn-bulk btn-bulk--select" type="button" @click="selectAll"> ✓ Tout sélectionner </button>
                            <button class="btn-bulk btn-bulk--clear" type="button" :disabled="selectedIds.length === 0" @click="clearSelection"> ✕ Vider </button>
                            <button class="btn-bulk btn-bulk--update" type="button" :disabled="selectedIds.length === 0" @click="deleteSelected"> 🗑️ Supprimer les logs </button>
                        </div>
                    </div>
                </div>

                <div class="table-section">
                    <div class="table-wrapper">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th class="col-checkbox">
                                        <input type="checkbox" v-model="selectAllCb" class="table-checkbox">
                                    </th>
                                    <th>⏰ Heure</th>
                                    <th>📱 QR Code</th>
                                    <th>📦 Conteneur</th>
                                    <th>📊 Statut</th>
                                    <th>🏷️ Type</th>
                                    <th>👤 Agent</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-if="loading"><td colspan="7" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Chargement du journal...</td></tr>
                                <tr v-else-if="filteredScans.length === 0"><td colspan="7" style="text-align: center; padding: 40px; color:#64748b;">Aucun log ne correspond à vos filtres.</td></tr>
                                <tr v-else v-for="s in filteredScans" :key="s.id" :class="['table-row', selectedIds.includes(s.id) ? 'selected' : '']" @click="toggleRow(s.id)">
                                    <td data-label="Sélect." class="col-checkbox">
                                        <input type="checkbox" class="table-checkbox" :value="s.id" v-model="selectedIds" @click.stop>
                                    </td>
                                    <td data-label="Heure" class="col-time">{{ formatDateStr(s.date) }}</td>
                                    <td data-label="QR Code" class="col-qr"><code>{{ s.scanRef || '-' }}</code></td>
                                    <td data-label="Conteneur" class="col-container">
                                        <span v-if="!s.container || s.container === '-'" style="color:#94a3b8;">-</span>
                                        <span v-else>{{ s.container }}</span>
                                    </td>
                                    <td data-label="Statut">
                                        <span v-if="s.status === 'SUCCES'" class="status-badge status-badge--success">✅ SUCCÈS</span>
                                        <span v-else-if="s.status === 'DOUBLON'" class="status-badge status-badge--warning">⚠️ DÉJÀ TRAITÉ</span>
                                        <span v-else-if="s.status === 'ERREUR'" class="status-badge status-badge--error">❌ ERREUR</span>
                                        <span v-else class="status-badge status-badge--error">❌ INCONNU</span>
                                    </td>
                                    <td data-label="Type"><span style="font-size:11px; font-weight:600; color:#64748b;">{{ getTypeLabel(s.type) }}</span></td>
                                    <td data-label="Agent" class="col-agent">{{ s.agent || '-' }} <span style="font-size:10px; background:#e2e8f0; padding:2px 6px; border-radius:4px; margin-left:4px; color:#475569;">{{ getAgencyBadge(s.agency) }}</span></td>
                                </tr>
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
                const scans = ref([]);
                const loading = ref(true);
                const selectedIds = ref([]);
                const currentLimit = ref(50);
                
                const filters = reactive({
                    type: '',
                    status: '',
                    date: '',
                    search: ''
                });
                
                let unsub = null;

                const loadData = () => {
                    if (unsub) unsub();
                    loading.value = true;
                    
                    try {
                        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
                        const q = query(collection(db, "scan_logs"), where("agency", "==", activeAgency), orderBy("date", "desc"), limit(parseInt(currentLimit.value)));
                        
                        unsub = onSnapshot(q, (snapshot) => {
                            scans.value = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                            loading.value = false;
                            
                            // Clean orphaned selections
                            const validIds = new Set(scans.value.map(s => s.id));
                            selectedIds.value = selectedIds.value.filter(id => validIds.has(id));
                        }, (e) => {
                            console.error(e);
                            globalApp.showToast("Erreur de chargement", "error");
                        });
                    } catch(e) { 
                        console.error(e); 
                        globalApp.showToast("Erreur de chargement", "error");
                    }
                };

                onMounted(() => { loadData(); });
                onUnmounted(() => { if (unsub) unsub(); });
                watch(currentLimit, () => { loadData(); });

                const filteredScans = computed(() => {
                    return scans.value.filter(s => {
                        if (filters.type && s.type !== filters.type) return false;
                        if (filters.status && s.status !== filters.status) return false;
                        if (filters.date && (!s.date || !s.date.startsWith(filters.date))) return false;
                        if (filters.search) {
                            const str = `${s.scanRef || ''} ${s.container || ''} ${s.agent || ''}`.toLowerCase();
                            if (!str.includes(filters.search.toLowerCase().trim())) return false;
                        }
                        return true;
                    });
                });

                const selectAllCb = computed({
                    get: () => filteredScans.value.length > 0 && selectedIds.value.length === filteredScans.value.length,
                    set: (val) => {
                        if (val) selectedIds.value = filteredScans.value.map(s => s.id);
                        else selectedIds.value = [];
                    }
                });

                const toggleRow = (id) => {
                    const index = selectedIds.value.indexOf(id);
                    if (index > -1) selectedIds.value.splice(index, 1);
                    else selectedIds.value.push(id);
                };

                const selectAll = () => { selectAllCb.value = true; };
                const clearSelection = () => { selectedIds.value = []; };

                const deleteSelected = async () => {
                    if (selectedIds.value.length === 0) return;
                    
                    const msg = `Voulez-vous vraiment supprimer définitivement ces ${selectedIds.value.length} logs d'audit ?`;
                    if (window.AppModal) {
                        if (!await window.AppModal.confirm(msg, "Suppression de Logs", true)) return;
                    } else if (!confirm(msg)) return;

                    try {
                        const batch = writeBatch(db);
                        selectedIds.value.forEach(id => {
                            batch.delete(doc(db, "scan_logs", id));
                        });
                        await batch.commit();
                        
                        globalApp.showToast("Logs supprimés avec succès.", "success");
                        selectedIds.value = [];
                    } catch(e) {
                        console.error(e);
                        globalApp.showToast("Erreur lors de la suppression.", "error");
                    }
                };

                const exportExcel = () => { globalApp.showToast("L'export Excel sera bientôt disponible pour cet onglet.", "info"); };
                const exportPDF = () => { globalApp.showToast("L'export PDF sera bientôt disponible pour cet onglet.", "info"); };

                const formatDateStr = (dateStr) => dateStr ? new Date(dateStr).toLocaleString('fr-FR') : '-';

                const getTypeLabel = (type) => {
                    if (type === 'ENTREPOT_PARIS') return '🏭 Mise en entrepôt (Paris)';
                    if (type === 'CONTENEUR_CHARGEMENT') return '🚢 Chargement Conteneur (Paris)';
                    if (type === 'DECHARGEMENT_ABIDJAN') return '📦 Déchargement (Abidjan)';
                    if (type === 'MISE_EN_LIVRAISON') return '🚚 Mise en Livraison (Abidjan)';
                    if (type === 'REMISE_CLIENT') return '🤝 Remise Client (Abidjan)';
                    return type || 'INCONNU';
                };

                const getAgencyBadge = (agency) => {
                    return agency === 'paris' ? 'FR' : (agency === 'abidjan' ? 'CI' : 'N/A');
                };

                return {
                    scans, loading, selectedIds, currentLimit, filters, filteredScans, selectAllCb,
                    loadData, selectAll, clearSelection, toggleRow, deleteSelected, exportExcel, exportPDF,
                    formatDateStr, getTypeLabel, getAgencyBadge
                };
            }
        });

        this.vueApp.mount('#vue-scan-history-app');
    }
};