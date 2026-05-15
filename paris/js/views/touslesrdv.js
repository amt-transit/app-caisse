import { db } from '../../../firebase-config.js';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { createApp, ref, computed, reactive, onMounted, onUnmounted, nextTick } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";

export const TousLesRdvView = {
    vueApp: null,

    render(app, mode = 'all') {
        const globalApp = app;
        const title = mode === 'pending' ? 'Rendez-vous à valider' : 'Tous les Rendez-vous';
        const subtitle = mode === 'pending' ? 'Confirmez ou refusez les demandes en attente' : 'Gestion complète de votre planning';
        const icon = mode === 'pending' ? '⏳' : '📅';

        const html = `
            <style>[v-cloak] { display: none; }</style>
            <div id="vue-rdv-app" class="rdv-page" v-cloak>
                <!-- Header Pending -->
                <template v-if="isPendingMode">
                    <div class="page__header" style="margin-bottom: 20px;">
                        <h1 class="page__title" style="margin: 0; font-size: 24px; font-weight: 800; color: #0f172a;">RDV à valider</h1>
                    </div>
                    <div class="rdv-header">
                        <div class="rdv-header__content" style="flex: 1; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
                            <div class="rdv-header__info">
                                <h1 class="rdv-header__title">✅ RDV à valider</h1>
                                <p class="rdv-header__subtitle">{{ filteredRdvs.length }} rendez-vous en attente de validation</p>
                            </div>
                            <div class="rdv-header__actions">
                                <button class="btn-filter-reset" @click="resetFilters" style="background: white; border: 1px solid #cbd5e1; display: flex; align-items: center; gap: 8px;">
                                    🔄 Rafraîchir
                                </button>
                            </div>
                        </div>
                    </div>
                </template>
                <!-- Header All -->
                <template v-else>
                    <div class="rdv-header">
                        <div class="rdv-header__content">
                            <div class="rdv-header__icon">${icon}</div>
                            <div>
                                <h1 class="rdv-header__title">${title}</h1>
                                <p class="rdv-header__subtitle">${subtitle}</p>
                            </div>
                        </div>
                        <button class="btn btn-primary" @click="globalApp.renderPage('appointment-new')" style="display: flex; align-items: center; gap: 8px; padding: 10px 16px; font-weight: bold; border-radius: 8px;">
                            <i class="fas fa-plus"></i> Nouveau RDV
                        </button>
                    </div>
                    <div class="kpi-grid">
                        <div class="kpi-card"><div class="kpi-card__icon" style="color: #475569;">📋</div><div><div class="kpi-card__value">{{ rdvs.length }}</div><div class="kpi-card__label">Total RDV</div></div></div>
                        <div class="kpi-card"><div class="kpi-card__icon" style="color: #0284c7; background: #e0f2fe;">📦</div><div><div class="kpi-card__value">{{ kpis.depots }}</div><div class="kpi-card__label">Dépôts</div></div></div>
                        <div class="kpi-card"><div class="kpi-card__icon" style="color: #7e22ce; background: #f3e8ff;">🚚</div><div><div class="kpi-card__value">{{ kpis.recups }}</div><div class="kpi-card__label">Récupérations</div></div></div>
                        <div class="kpi-card"><div class="kpi-card__icon" style="color: #166534; background: #dcfce7;">✅</div><div><div class="kpi-card__value">{{ kpis.executed }}</div><div class="kpi-card__label">Validés</div></div></div>
                        <div class="kpi-card"><div class="kpi-card__icon" style="color: #b45309; background: #fef3c7;">⏳</div><div><div class="kpi-card__value">{{ kpis.pending }}</div><div class="kpi-card__label">En attente</div></div></div>
                        <div class="kpi-card"><div class="kpi-card__icon" style="color: #4f46e5; background: #e0e7ff;">📊</div><div style="flex:1;"><div class="kpi-card__value"><span>{{ kpis.rate }}</span><span style="font-size:14px; color:#64748b;">%</span></div><div class="kpi-card__label">Taux validation</div><div class="kpi-card__bar"><div class="kpi-card__bar-fill" :style="'width: ' + kpis.rate + '%;'"></div></div></div></div>
                    </div>
                </template>

                <!-- Filters Pending -->
                <div v-if="isPendingMode" class="rdv-filters">
                    <div class="filter-group" style="flex: 2;">
                        <label class="filter-label"><span class="filter-icon">🔍</span> Rechercher</label>
                        <input type="text" v-model="filters.search" class="filter-input" placeholder="Nom, téléphone, adresse...">
                    </div>
                    <div class="filter-group">
                        <label class="filter-label"><span class="filter-icon">📋</span> Type</label>
                        <select v-model="filters.type" class="filter-select">
                            <option value="">Tous les types</option>
                            <option value="DEPOT">Dépôt</option>
                            <option value="RECUPERATION">Récupération</option>
                        </select>
                    </div>
                    <div class="filter-actions">
                        <button class="btn-filter-reset" type="button" @click="resetFilters">✕ Réinitialiser</button>
                    </div>
                </div>
                <!-- Filters All -->
                <div v-else class="rdv-filters">
                    <div class="filter-group" style="flex: 2;">
                        <label class="filter-label"><span class="filter-icon">🔍</span> Recherche client</label>
                        <input type="text" v-model="filters.search" class="filter-input" placeholder="Nom, téléphone, adresse...">
                    </div>
                    <div class="filter-group">
                        <label class="filter-label"><span class="filter-icon">📆</span> Date début</label>
                        <input type="date" v-model="filters.start" class="filter-input">
                    </div>
                    <div class="filter-group">
                        <label class="filter-label"><span class="filter-icon">📆</span> Date fin</label>
                        <input type="date" v-model="filters.end" class="filter-input">
                    </div>
                    <div class="filter-group">
                        <label class="filter-label"><span class="filter-icon">🏷️</span> Type</label>
                        <select v-model="filters.type" class="filter-select">
                            <option value="">Tous</option>
                            <option value="DEPOT">Dépôt</option>
                            <option value="RECUPERATION">Récupération</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label class="filter-label"><span class="filter-icon">✅</span> Statut</label>
                        <select v-model="filters.status" class="filter-select">
                            <option value="">Tous</option>
                            <option value="confirmé">Validé</option>
                            <option value="en_attente">En attente</option>
                            <option value="annulé">Annulé</option>
                        </select>
                    </div>
                    <div class="filter-actions">
                        <button class="btn-filter-reset" type="button" @click="resetFilters">↻ Réinitialiser</button>
                    </div>
                </div>

                <div class="rdv-table-card">
                    <div class="rdv-table-header">
                        <div class="rdv-table-title"><span class="rdv-count-badge">{{ filteredRdvs.length }}</span><span>Rendez-vous trouvés</span></div>
                    </div>
                    <table class="rdv-table">
                        <thead>
                            <tr>
                                <th>Type</th>
                                <th>Date & Heure</th>
                                <th>Client</th>
                                <th>Téléphone</th>
                                <th>Adresse / Notes</th>
                                <th>Statut</th>
                                <th style="text-align: right;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-if="loading"><td colspan="7" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</td></tr>
                            <tr v-else-if="filteredRdvs.length === 0">
                                <td colspan="7" style="text-align: center; padding: 60px;" v-if="isPendingMode">
                                    <div style="font-size: 48px; margin-bottom: 10px;">📭</div>
                                    <h3 style="margin: 0 0 5px 0; color: #1e293b; font-size: 18px;">Aucun RDV à valider</h3>
                                    <p style="margin: 0; color: #64748b; font-size: 14px;">Tous les RDV ont été validés</p>
                                </td>
                                <td colspan="7" style="text-align: center; padding: 40px; color: #64748b;" v-else>
                                    Aucun rendez-vous trouvé.
                                </td>
                            </tr>
                            <tr v-else v-for="rdv in filteredRdvs" :key="rdv.id" class="rdv-row">
                                <td><span :class="['type-badge', rdv.rdvType === 'DEPOT' ? 'badge-depot' : 'badge-recup']">{{ rdv.rdvType === 'DEPOT' ? '📦 DEPOT' : '🚚 RECUP' }}</span></td>
                                <td><strong>{{ formatDate(rdv.date) }}</strong><br><span style="color:#64748b; font-size:11px;">{{ rdv.time || 'Heure à définir' }}</span></td>
                                <td style="font-weight: 600; color: #0f172a;">{{ rdv.client }}</td>
                                <td style="font-weight: bold;">{{ rdv.tel || '-' }}</td>
                                <td><div style="max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" :title="rdv.adresse + '\n' + rdv.notes">{{ rdv.adresse || '-' }}<br><span style="color:#94a3b8; font-size:10px;">{{ rdv.notes || '' }}</span></div></td>
                                <td><span :class="['type-badge', getStatusClass(rdv.status)]">{{ getStatusText(rdv.status) }}</span></td>
                                <td class="td-actions">
                                    <template v-if="rdv.status === 'en_attente'">
                                        <button class="btn-edit" @click="changeStatus(rdv.id, 'confirmé')" title="Valider" style="background:#dcfce7; color:#166534; border-color:#166534;"><i class="fas fa-check"></i></button>
                                        <button class="btn-del" @click="changeStatus(rdv.id, 'annulé')" title="Refuser"><i class="fas fa-times"></i></button>
                                        <button class="btn-edit" @click="openEditModal(rdv)" title="Modifier">✏️</button>
                                    </template>
                                    <template v-else-if="rdv.status === 'confirmé'">
                                        <button class="btn-del" @click="changeStatus(rdv.id, 'annulé')" title="Annuler le RDV" style="background:#fee2e2; color:#b91c1c; border-color:#fecaca;"><i class="fas fa-ban"></i></button>
                                        <button class="btn-edit" @click="openEditModal(rdv)" title="Modifier">✏️</button>
                                        <button class="btn-del" @click="deleteRdv(rdv.id)" title="Supprimer">🗑️</button>
                                    </template>
                                    <template v-else>
                                        <button class="btn-edit" @click="changeStatus(rdv.id, 'confirmé')" title="Re-valider" style="background:#dcfce7; color:#166534; border-color:#166534;"><i class="fas fa-check"></i></button>
                                        <button class="btn-edit" @click="openEditModal(rdv)" title="Modifier">✏️</button>
                                        <button class="btn-del" @click="deleteRdv(rdv.id)" title="Supprimer">🗑️</button>
                                    </template>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- MODALE D'ÉDITION AVANCÉE -->
            <div v-if="showEditModal" class="em-modal active">
                <div class="em-content">
                    <div class="em-header">
                        <div class="em-header__left">
                            <div class="em-header__icon">📅</div>
                            <div>
                                <div class="em-header__title">Modifier le RDV <span style="color:#64748b;">#{{ editForm.id.substring(0,6).toUpperCase() }}</span></div>
                                <div class="em-header__sub">
                                    <span :class="['type-badge', getStatusClass(editForm.status)]">{{ getStatusText(editForm.status) }}</span>
                                </div>
                            </div>
                        </div>
                        <button class="em-close" type="button" @click="closeEditModal" title="Fermer"><i class="fas fa-times" style="font-size: 20px;"></i></button>
                    </div>
                    <div class="em-body">
                        <div class="em-client-strip">
                            <div class="em-client-strip__icon">👤</div>
                            <div>
                                <div class="em-client-strip__name">{{ editForm.client }}</div>
                                <div class="em-client-strip__details">
                                    <span>📞 {{ editForm.tel || 'Non renseigné' }}</span>
                                </div>
                            </div>
                        </div>
                        <div class="em-grid">
                            <div class="em-col-form">
                                <div class="em-card">
                                    <div class="em-card__head em-card__head--purple"><span class="em-card__icon">🏷️</span><span class="em-card__title">Type de rendez-vous</span></div>
                                    <div class="em-card__body">
                                        <div class="em-type-selector">
                                            <button type="button" :class="['em-type-option', editForm.rdvType === 'DEPOT' ? 'active' : '']" @click="editForm.rdvType = 'DEPOT'"><span>📦</span><span>DEPOT</span></button>
                                            <button type="button" :class="['em-type-option', editForm.rdvType === 'RECUPERATION' ? 'active' : '']" @click="editForm.rdvType = 'RECUPERATION'"><span>🚚</span><span>RECUP</span></button>
                                        </div>
                                    </div>
                                </div>
                                <div class="em-card">
                                    <div class="em-card__head em-card__head--blue"><span class="em-card__icon">🕐</span><span class="em-card__title">Planification</span></div>
                                    <div class="em-card__body">
                                        <label class="em-field">
                                            <span class="em-field__label">Date du rendez-vous</span>
                                            <input type="date" v-model="editForm.date" class="em-field__input">
                                        </label>
                                        <label class="em-field">
                                            <span class="em-field__label">Créneau horaire / Heure</span>
                                            <input type="text" v-model="editForm.time" class="em-field__input" placeholder="Ex: Matin, 10:00...">
                                        </label>
                                    </div>
                                </div>
                            </div>
                            <div class="em-col-cal">
                                <div class="em-card" style="height: 100%;">
                                    <div class="em-card__head em-card__head--green"><span class="em-card__icon">📋</span><span class="em-card__title">Détails d'intervention</span></div>
                                    <div class="em-card__body">
                                        <label class="em-field">
                                            <span class="em-field__label">Adresse exacte</span>
                                            <input type="text" v-model="editForm.adresse" class="em-field__input" placeholder="Adresse complète">
                                        </label>
                                        <label class="em-field">
                                            <span class="em-field__label">Téléphone de contact</span>
                                            <input type="text" v-model="editForm.tel" class="em-field__input" placeholder="Numéro à appeler">
                                        </label>
                                        <label class="em-field">
                                            <span class="em-field__label">Description / Instructions</span>
                                            <textarea v-model="editForm.notes" class="em-field__input" rows="4" style="resize:vertical;" placeholder="Instructions pour le chauffeur..."></textarea>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="em-footer">
                        <button class="em-btn em-btn--ghost" type="button" @click="closeEditModal">Annuler</button>
                        <button v-if="editForm.status === 'en_attente' || editForm.status === 'annulé'" class="em-btn" type="button" @click="validerEtFermer" style="background:#10b981; color:white; border:none; display:flex; align-items:center; gap:8px;"><i class="fas fa-check"></i> Valider ce RDV</button>
                        <button class="em-btn em-btn--save" type="button" @click="saveEditModal" :disabled="saving">
                            <span v-if="saving">💾 Enregistrement...</span>
                            <span v-else>💾 Enregistrer les modifications</span>
                        </button>
                    </div>
                </div>
            </div>
            </div>
        `;

        document.getElementById('contentContainer').innerHTML = html;
        this.initVue(globalApp, mode);
    },

    initVue(globalApp, mode) {
        if (this.vueApp) this.vueApp.unmount();

        this.vueApp = createApp({
            setup() {
                const rdvs = ref([]);
                const loading = ref(true);
                const isPendingMode = ref(mode === 'pending');
                
                const filters = reactive({
                    search: '',
                    type: '',
                    status: '',
                    start: '',
                    end: ''
                });
                
                const showEditModal = ref(false);
                const saving = ref(false);
                const editForm = reactive({});

                let unsub = null;
                
                onMounted(() => {
                    const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
                    const q = query(collection(db, "appointments"), where("agency", "==", activeAgency));
                    unsub = onSnapshot(q, (snapshot) => {
                        const data = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
                        data.sort((a, b) => new Date(b.date) - new Date(a.date));
                        rdvs.value = data;
                        loading.value = false;
                        globalApp.updateBadges(); // Mise à jour globale des badges (Bottom Nav / Sidebar)
                    });
                });
                
                onUnmounted(() => {
                    if (unsub) unsub();
                });

                const filteredRdvs = computed(() => {
                    let stat = filters.status;
                    if (isPendingMode.value) stat = 'en_attente';

                    return rdvs.value.filter(rdv => {
                        if (filters.search) {
                            const term = filters.search.toLowerCase().trim();
                            if (!rdv.client.toLowerCase().includes(term) && !(rdv.tel || '').includes(term)) return false;
                        }
                        if (stat && rdv.status !== stat) return false;
                        if (filters.type && rdv.rdvType !== filters.type) return false;
                        if (filters.start && rdv.date < filters.start) return false;
                        if (filters.end && rdv.date > filters.end) return false;
                        return true;
                    });
                });

                const kpis = computed(() => {
                    const total = rdvs.value.length;
                    const executed = rdvs.value.filter(a => a.status === 'confirmé').length;
                    return {
                        depots: rdvs.value.filter(a => a.rdvType === 'DEPOT').length,
                        recups: rdvs.value.filter(a => a.rdvType === 'RECUPERATION').length,
                        executed: executed,
                        pending: rdvs.value.filter(a => a.status === 'en_attente').length,
                        rate: total > 0 ? Math.round((executed / total) * 100) : 0
                    };
                });

                const getStatusClass = (status) => {
                    if (status === 'confirmé') return 'badge-executed';
                    if (status === 'en_attente') return 'badge-pending';
                    return 'badge-cancelled';
                };

                const getStatusText = (status) => {
                    if (status === 'confirmé') return '✅ Validé';
                    if (status === 'en_attente') return '⏳ En attente';
                    return '❌ Annulé';
                };

                const formatDate = (dateString) => dateString ? new Date(dateString).toLocaleDateString('fr-FR') : '-';

                const resetFilters = () => {
                    filters.search = '';
                    filters.type = '';
                    filters.start = '';
                    filters.end = '';
                    if (!isPendingMode.value) filters.status = '';
                };

                const changeStatus = async (id, newStatus) => {
                    try {
                        await updateDoc(doc(db, "appointments", id), { status: newStatus });
                        globalApp.showToast(`Rendez-vous ${newStatus} !`, newStatus === 'confirmé' ? 'success' : 'info');
                    } catch(e) { globalApp.showToast("Erreur de mise à jour", "error"); }
                };

                const deleteRdv = async (id) => {
                    if (window.AppModal) {
                        if (!await window.AppModal.confirm("Voulez-vous vraiment supprimer ce rendez-vous de l'historique ?", "Supprimer RDV", true)) return;
                    } else if (!confirm("Supprimer ce rendez-vous ?")) return;

                    try {
                        await deleteDoc(doc(db, "appointments", id));
                        globalApp.showToast("Rendez-vous supprimé", "success");
                    } catch(e) { globalApp.showToast("Erreur de suppression", "error"); }
                };

                const openEditModal = (rdv) => {
                    Object.assign(editForm, rdv);
                    showEditModal.value = true;
                };

                const closeEditModal = () => {
                    showEditModal.value = false;
                };

                const saveEditModal = async () => {
                    if (!editForm.id) return;
                    saving.value = true;

                    const updates = {
                        rdvType: editForm.rdvType,
                        date: editForm.date,
                        time: editForm.time,
                        adresse: editForm.adresse,
                        tel: editForm.tel,
                        notes: editForm.notes
                    };

                    try {
                        await updateDoc(doc(db, "appointments", editForm.id), updates);
                        globalApp.showToast("Rendez-vous mis à jour avec succès !", "success");
                        closeEditModal();
                    } catch(e) {
                        globalApp.showToast("Erreur lors de la sauvegarde.", "error");
                    } finally {
                        saving.value = false;
                    }
                };

                const validerEtFermer = async () => {
                    if (editForm.id) {
                        await changeStatus(editForm.id, 'confirmé');
                        closeEditModal();
                    }
                };

                return {
                    rdvs, loading, isPendingMode, filters, filteredRdvs, kpis,
                    showEditModal, editForm, saving,
                    globalApp, getStatusClass, getStatusText, formatDate, resetFilters,
                    changeStatus, deleteRdv, openEditModal, closeEditModal, saveEditModal, validerEtFermer
                };
            }
        });

        this.vueApp.mount('#vue-rdv-app');
    }
};