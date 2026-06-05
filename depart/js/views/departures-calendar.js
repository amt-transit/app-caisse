import { db } from '../../../firebase-config.js';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc, orderBy } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { createApp, ref, reactive, computed, onMounted, onUnmounted } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";

export const DeparturesCalendarView = {
    vueApp: null,

    render(app) {
        const globalApp = app;
        window.app.views = window.app.views || {};
        window.app.views.departuresCalendar = this;

        const html = `
            <style>
                [v-cloak] { display: none; }
                .departures-page { --amt-blue:#1A3553; --amt-blue-d:#13283f; --amt-red:#E51F21; --amt-gold:#F2A312; --ink:#0f172a; --muted:#566273; --line:#e6ebf1; --soft:#f3f6fa; font-family:'Jost','Comfortaa',system-ui,sans-serif; max-width: 1200px; margin: 0 auto; animation: fadeIn 0.3s ease; }
                .departures-header { background: white; border-radius: 16px; padding: 20px 25px; margin-bottom: 24px; border: 1px solid var(--line); border-left: 5px solid var(--amt-blue); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
                .departures-header__content { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 15px; }
                .departures-header__left { display: flex; align-items: center; gap: 15px; }
                .departures-header__icon { background: var(--amt-blue); color: white; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 14px; font-size: 28px; box-shadow: 0 4px 10px rgba(26, 53, 83, 0.3); }
                .departures-header__title { margin: 0; font-size: 22px; font-weight: 800; color: var(--amt-blue); font-family: 'Comfortaa','Jost',sans-serif; }
                .departures-header__subtitle { margin: 4px 0 0 0; font-size: 13px; color: #64748b; }
                .departures-header__actions { display: flex; gap: 10px; }
                
                .btn-new { background: var(--amt-blue); color: #fff; border: none; padding: 10px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 8px; box-shadow: 0 2px 4px rgba(26, 53, 83, 0.3); }
                .btn-new:hover { background: var(--amt-blue-d); transform: translateY(-1px); box-shadow: 0 4px 8px rgba(26, 53, 83, 0.4); }
                .btn-refresh { background: white; border: 1px solid #cbd5e1; color: #475569; padding: 10px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 8px; }
                .btn-refresh:hover { background: #f1f5f9; color: #0f172a; }

                .departures-filters { display: flex; flex-wrap: wrap; gap: 15px; background: white; padding: 20px; border-radius: 16px; border: 1px solid #e2e8f0; margin-bottom: 24px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
                .filter-group { flex: 1; min-width: 150px; display: flex; flex-direction: column; gap: 6px; }
                .filter-label { font-size: 11px; font-weight: 600; color: #475569; text-transform: uppercase; }
                .filter-input, .filter-select { width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; outline: none; transition: 0.2s; background: #f8fafc; }
                .filter-input:focus, .filter-select:focus { border-color: var(--amt-blue); background: white; box-shadow: 0 0 0 3px rgba(26, 53, 83, 0.1); }
                
                .filter-actions { display: flex; align-items: flex-end; gap: 10px; }
                .btn-filter { background: #0f172a; color: white; border: none; padding: 10px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s; height: 40px; display: flex; align-items: center; gap: 8px;}
                .btn-filter:hover { background: #1e293b; }
                .btn-reset { background: #fff; color: var(--muted); border: 1px solid var(--line); padding: 10px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s; height: 40px; display: flex; align-items: center; gap: 8px;}
                .btn-reset:hover { background: var(--soft); color: var(--ink); }

                .departures-empty { background: white; border: 1px dashed #cbd5e1; border-radius: 16px; padding: 60px 20px; text-align: center; color: #64748b; }
                .empty-icon { font-size: 48px; margin-bottom: 15px; opacity: 0.5; }

                .departures-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
                .departure-card { background: white; border-radius: 16px; border: 1px solid var(--line); border-left: 4px solid var(--amt-gold); box-shadow: 0 2px 4px rgba(0,0,0,0.02); overflow: hidden; display: flex; flex-direction: column; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
                .departure-card:hover { transform: translateY(-5px); box-shadow: 0 15px 25px -5px rgba(0,0,0,0.1); border-color: var(--amt-blue); border-left-color: var(--amt-gold); }
                .dc-header { padding: 15px 20px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; background: #f8fafc; }
                .dc-date { font-size: 16px; font-weight: 800; color: var(--amt-blue); }
                .dc-badge { font-size: 11px; padding: 4px 8px; border-radius: 6px; font-weight: 700; text-transform: uppercase; }
                .dc-badge--active { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
                .dc-badge--past { background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; }
                .dc-body { padding: 20px; flex: 1; }
                .dc-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
                .dc-row:last-child { margin-bottom: 0; }
                .dc-icon { width: 24px; color: #94a3b8; text-align: center; }
                .dc-text { font-size: 14px; color: #334155; font-weight: 500; }
                .dc-text strong { color: #0f172a; font-weight: 700; }
                .dc-footer { padding: 15px 20px; border-top: 1px solid #f1f5f9; display: flex; justify-content: flex-end; gap: 10px; background: #f8fafc; }
                
                .btn-icon { width: 32px; height: 32px; border-radius: 8px; border: 1px solid #cbd5e1; background: white; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #475569; transition: 0.2s; }
                .btn-icon:hover { background: #f1f5f9; color: #0f172a; }
                .btn-icon--danger { border-color: #fecaca; color: #ef4444; background: #fef2f2; }
                .btn-icon--danger:hover { background: #fee2e2; }
                
                /* Modal */
                .dep-modal { display:none; position:fixed; z-index:9999; left:0; top:0; width:100%; height:100%; background:rgba(15, 23, 42, 0.6); backdrop-filter: blur(4px); align-items:center; justify-content:center; }
                .dep-modal.active { display:flex; animation: fadeIn 0.2s; }
                .dep-modal-box { background: white; border-radius: 16px; display: flex; flex-direction: column; width: 90%; max-width: 500px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); overflow: hidden; }
                .dep-modal-header { padding: 20px 25px; border-bottom: 1px solid var(--amt-blue-d); background: var(--amt-blue); display: flex; justify-content: space-between; align-items: center; }
                .dep-modal-title { margin: 0; font-size: 18px; font-weight: 800; color: #fff; font-family: 'Comfortaa','Jost',sans-serif; }
                .dep-modal-body { padding: 25px; }
                .dep-modal-footer { padding: 15px 25px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 10px; background: #f8fafc; }
            </style>

            <div id="vue-departures-calendar-app" class="page departures-page" v-cloak>
                <div class="departures-header">
                    <div class="departures-header__content">
                        <div class="departures-header__left">
                            <div class="departures-header__icon">✈️</div>
                            <div class="departures-header__info">
                                <h1 class="departures-header__title">Dates de départ</h1>
                                <p class="departures-header__subtitle">{{ filteredDepartures.length }} date(s) de départ</p>
                            </div>
                        </div>
                        <div class="departures-header__actions">
                            <button class="btn-new" type="button" @click="openModal()">➕ Nouvelle date</button>
                            <button class="btn-refresh" type="button" @click="loadData">🔄 Rafraîchir</button>
                        </div>
                    </div>
                </div>

                <div class="departures-filters">
                    <div class="filter-group" style="flex: 1.5 1 0%;">
                        <label class="filter-label"><span class="filter-icon">🌍</span> Destination</label>
                        <select class="filter-select" v-model="filters.destination">
                            <option value="">Toutes les destinations</option>
                            <option value="ABIDJAN">Abidjan</option>
                            <option value="CHINE">Chine</option>
                            <option value="BAMAKO">Bamako</option>
                            <option value="CONAKRY">Conakry</option>
                            <option value="DAKAR">Dakar</option>
                            <option value="LIBREVILLE">Libreville</option>
                            <option value="PARIS">Paris</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label class="filter-label"><span class="filter-icon">📅</span> Du</label>
                        <input class="filter-input" type="date" v-model="filters.dateStart">
                    </div>
                    <div class="filter-group">
                        <label class="filter-label"><span class="filter-icon">📅</span> Au</label>
                        <input class="filter-input" type="date" v-model="filters.dateEnd">
                    </div>
                    <div class="filter-actions">
                        <button class="btn-reset" type="button" @click="resetFilters">🔄 Reset</button>
                    </div>
                </div>

                <div>
                    <div v-if="loading" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>
                    <div v-else-if="filteredDepartures.length === 0" class="departures-empty">
                        <div class="empty-icon">📭</div>
                        <p>Aucune date de départ trouvée</p>
                    </div>
                    <div v-else class="departures-grid">
                        <div v-for="d in filteredDepartures" :key="d.id" class="departure-card">
                            <div class="dc-header">
                                <div class="dc-date">{{ formatDate(d.date) }}</div>
                                <div :class="['dc-badge', d.date < today ? 'dc-badge--past' : 'dc-badge--active']">{{ d.date < today ? 'PASSÉ' : 'À VENIR' }}</div>
                            </div>
                            <div class="dc-body">
                                <div class="dc-row"><div class="dc-icon">🌍</div><div class="dc-text">Destination : <strong>{{ d.destination || 'Non spécifiée' }}</strong></div></div>
                                <div class="dc-row"><div class="dc-icon">{{ getTypeIcon(d.type) }}</div><div class="dc-text">Type : <strong>{{ d.type || 'MARITIME' }}</strong></div></div>
                                <div v-if="d.note" class="dc-row"><div class="dc-icon">📝</div><div class="dc-text" style="color: #64748b;">{{ d.note }}</div></div>
                            </div>
                            <div class="dc-footer">
                                <button class="btn-icon" @click="openModal(d)" title="Modifier"><i class="fas fa-edit"></i></button>
                                <button class="btn-icon btn-icon--danger" @click="deleteDeparture(d.id)" title="Supprimer"><i class="fas fa-trash"></i></button>
                            </div>
                        </div>
                    </div>
                </div>

            <!-- Modal Nouvelle Date -->
            <div class="dep-modal" :class="{ active: showModal }">
                <div class="dep-modal-box">
                    <div class="dep-modal-header">
                        <h2 class="dep-modal-title">{{ form.id ? 'Modifier date de départ' : 'Nouvelle date de départ' }}</h2>
                        <button class="icon-btn" @click="closeModal" style="background:none; border:none; font-size:24px; cursor:pointer; color:#fff;">&times;</button>
                    </div>
                    <div class="dep-modal-body">
                        <div class="form-group" style="margin-bottom: 15px;">
                            <label style="font-size: 12px; font-weight: 600; color: #475569; display: block; margin-bottom: 6px;">Date de départ *</label>
                            <input type="date" v-model="form.date" class="filter-input" style="width: 100%; box-sizing: border-box;">
                        </div>
                        <div class="form-group" style="margin-bottom: 15px;">
                            <label style="font-size: 12px; font-weight: 600; color: #475569; display: block; margin-bottom: 6px;">Destination *</label>
                            <select v-model="form.destination" class="filter-select" style="width: 100%; box-sizing: border-box;">
                                <option value="ABIDJAN">Abidjan</option>
                                <option value="CHINE">Chine</option>
                                <option value="BAMAKO">Bamako</option>
                                <option value="CONAKRY">Conakry</option>
                                <option value="DAKAR">Dakar</option>
                                <option value="LIBREVILLE">Libreville</option>
                                <option value="PARIS">Paris</option>
                            </select>
                        </div>
                        <div class="form-group" style="margin-bottom: 15px;">
                            <label style="font-size: 12px; font-weight: 600; color: #475569; display: block; margin-bottom: 6px;">Type de transport</label>
                            <select v-model="form.type" class="filter-select" style="width: 100%; box-sizing: border-box;">
                                <option value="MARITIME">🚢 Maritime</option>
                                <option value="AERIEN">✈️ Aérien</option>
                                <option value="ROUTIER">🚛 Routier</option>
                            </select>
                        </div>
                        <div class="form-group" style="margin-bottom: 15px;">
                            <label style="font-size: 12px; font-weight: 600; color: #475569; display: block; margin-bottom: 6px;">Remarques (Navire, Vol, etc.)</label>
                            <input type="text" v-model="form.note" class="filter-input" placeholder="Ex: MSC KATYAYNI..." style="width: 100%; box-sizing: border-box;">
                        </div>
                    </div>
                    <div class="dep-modal-footer">
                        <button class="amt-btn amt-btn-outline" style="padding: 8px 16px; border-radius: 8px;" @click="closeModal">Annuler</button>
                        <button class="amt-btn amt-btn-primary" style="padding: 8px 16px; border-radius: 8px; background: var(--amt-blue); color: white; border: none;" :disabled="saving" @click="saveDeparture">
                            <span v-if="saving"><i class="fas fa-spinner fa-spin"></i></span>
                            <span v-else><i class="fas fa-save"></i> Enregistrer</span>
                        </button>
                    </div>
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
                const departures = ref([]);
                const loading = ref(true);
                const showModal = ref(false);
                const saving = ref(false);
                const today = new Date().toISOString().split('T')[0];
                
                const filters = reactive({
                    destination: '',
                    dateStart: '',
                    dateEnd: ''
                });
                
                const form = reactive({
                    id: '',
                    date: today,
                    destination: 'ABIDJAN',
                    type: 'MARITIME',
                    note: ''
                });
                
                let unsub = null;
                
                const loadData = () => {
                    loading.value = true;
                    if (unsub) unsub();
                    const q = query(collection(db, "departures"), orderBy("date", "desc"));
                    unsub = onSnapshot(q, (snapshot) => {
                        departures.value = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
                        loading.value = false;
                    });
                };
                
                onMounted(() => {
                    loadData();
                });
                
                onUnmounted(() => {
                    if (unsub) unsub();
                });

                const filteredDepartures = computed(() => {
                    return departures.value.filter(d => {
                        if (filters.destination && d.destination !== filters.destination) return false;
                        if (filters.dateStart && d.date < filters.dateStart) return false;
                        if (filters.dateEnd && d.date > filters.dateEnd) return false;
                        return true;
                    });
                });

                const resetFilters = () => {
                    filters.destination = '';
                    filters.dateStart = '';
                    filters.dateEnd = '';
                };
                
                const formatDate = (dateString) => {
                    if (!dateString) return '-';
                    const dateObj = new Date(dateString);
                    return dateObj.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' });
                };
                
                const getTypeIcon = (type) => {
                    if (type === 'AERIEN') return '✈️';
                    if (type === 'ROUTIER') return '🚛';
                    return '🚢';
                };
                
                const openModal = (d = null) => {
                    if (d) {
                        form.id = d.id;
                        form.date = d.date || '';
                        form.destination = d.destination || 'ABIDJAN';
                        form.type = d.type || 'MARITIME';
                        form.note = d.note || '';
                    } else {
                        form.id = '';
                        form.date = today;
                        form.destination = 'ABIDJAN';
                        form.type = 'MARITIME';
                        form.note = '';
                    }
                    showModal.value = true;
                };
                
                const closeModal = () => {
                    showModal.value = false;
                };
                
                const saveDeparture = async () => {
                    if (!form.date || !form.destination) {
                        globalApp.showToast("La date et la destination sont requises", "error");
                        return;
                    }
                    
                    saving.value = true;
                    const data = {
                        date: form.date,
                        destination: form.destination,
                        type: form.type,
                        note: form.note.trim(),
                        agency: sessionStorage.getItem('currentActiveAgency') || 'paris',
                        updatedAt: new Date().toISOString()
                    };
                    
                    try {
                        if (form.id) {
                            await setDoc(doc(db, "departures", form.id), data, { merge: true });
                            globalApp.showToast("Date de départ modifiée", "success");
                        } else {
                            data.createdAt = new Date().toISOString();
                            await setDoc(doc(collection(db, "departures")), data);
                            globalApp.showToast("Nouvelle date de départ ajoutée", "success");
                        }
                        closeModal();
                    } catch(e) {
                        console.error(e);
                        globalApp.showToast("Erreur lors de l'enregistrement", "error");
                    } finally {
                        saving.value = false;
                    }
                };
                
                const deleteDeparture = async (id) => {
                    if (window.AppModal) {
                        if (!await window.AppModal.confirm("Voulez-vous vraiment supprimer cette date de départ ?", "Supprimer", true)) return;
                    } else if (!confirm("Voulez-vous vraiment supprimer cette date de départ ?")) {
                        return;
                    }
                    
                    try {
                        await deleteDoc(doc(db, "departures", id));
                        globalApp.showToast("Date de départ supprimée", "success");
                    } catch(e) {
                        globalApp.showToast("Erreur lors de la suppression", "error");
                    }
                };
                
                return {
                    departures, loading, filters, form, showModal, saving, today,
                    filteredDepartures, loadData, resetFilters, formatDate, getTypeIcon,
                    openModal, closeModal, saveDeparture, deleteDeparture
                };
            }
        });
        
        this.vueApp.mount('#vue-departures-calendar-app');
    }
};