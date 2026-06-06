import { db } from '../../../commun/firebase-config.js';
import { getCollectionName } from '../../../commun/agencies-config.js';
import { collection, query, where, onSnapshot, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { createApp, ref, computed, reactive, onMounted, onUnmounted, watch } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";

export const MonProgrammeView = {
    vueApp: null,

    render(app) {
        const globalApp = app;

        const html = `
            <style>
                [v-cloak] { display: none; }
                .my-programme-page { --amt-blue:#1A3553; --amt-blue-d:#13283f; --amt-red:#E51F21; --amt-gold:#F2A312; --ink:#0f172a; --muted:#566273; --line:#e6ebf1; --soft:#f3f6fa; font-family:'Jost','Comfortaa',system-ui,sans-serif; max-width: 1400px; margin: 0 auto; animation: fadeIn 0.3s ease; }

                .prog-header { background: white; border-radius: 16px; padding: 20px 25px; display: flex; justify-content: space-between; align-items: center; border: 1px solid var(--line); border-left: 5px solid var(--amt-blue); margin-bottom: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); flex-wrap: wrap; gap: 15px; }
                .prog-header__content { display: flex; align-items: center; gap: 15px; }
                .prog-header__icon { font-size: 28px; background: var(--amt-blue); color: #fff; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 14px; }
                .prog-header__title { margin: 0; font-size: 22px; font-weight: 800; color: var(--amt-blue); font-family: 'Comfortaa','Jost',sans-serif; }
                .prog-header__subtitle { margin: 4px 0 0 0; font-size: 13px; color: var(--muted); }
                
                .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 24px; }
                .kpi-card { background: white; border-radius: 16px; padding: 20px; display: flex; align-items: center; gap: 15px; border: 1px solid var(--line); box-shadow: 0 2px 4px rgba(0,0,0,0.02); transition: border-color 0.2s; }
                .kpi-card:hover { border-color: var(--amt-gold); }
                .kpi-card__icon { font-size: 28px; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; border-radius: 12px; }
                .kpi-card--purple .kpi-card__icon { background: #faf5ff; color: #9333ea; }
                .kpi-card--blue .kpi-card__icon { background: #eef2f7; color: var(--amt-blue); }
                .kpi-card--green .kpi-card__icon { background: #dcfce7; color: #10b981; }
                .kpi-card--teal .kpi-card__icon { background: #ccfbf1; color: #06b6d4; }
                .kpi-card__value { font-size: 24px; font-weight: 800; color: var(--amt-blue); font-family: 'Comfortaa','Jost',sans-serif; line-height: 1; margin-bottom: 4px; }
                .kpi-card__label { font-size: 12px; font-weight: 600; color: var(--muted); text-transform: uppercase; }
                
                .prog-filters { display: flex; flex-wrap: wrap; gap: 15px; background: white; padding: 20px; border-radius: 16px; border: 1px solid var(--line); margin-bottom: 24px; }
                .filter-group { flex: 1; min-width: 150px; display: flex; flex-direction: column; gap: 6px; }
                .filter-label { font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; }
                .filter-input, .filter-select { width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; outline: none; transition: 0.2s; box-sizing: border-box; }
                .filter-input:focus, .filter-select:focus { border-color: var(--amt-blue); box-shadow: 0 0 0 3px rgba(26,53,83,0.1); }
                
                .rdv-table-card { background: white; border-radius: 16px; border: 1px solid var(--line); overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.02); }
                .rdv-table-header { padding: 15px 20px; border-bottom: 2px solid var(--amt-gold); background: var(--amt-blue); display: flex; justify-content: space-between; align-items: center; }
                .rdv-table-title { margin: 0; font-size: 16px; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 10px; }
                .rdv-table-count { background: var(--amt-gold); color: var(--amt-blue); font-weight: 800; padding: 2px 8px; border-radius: 12px; font-size: 12px; }

                .table-wrap { overflow-x: auto; }
                .rdv-table { width: 100%; border-collapse: collapse; }
                .rdv-table th { text-align: left; padding: 12px 15px; background: #eef2f7; font-size: 11px; font-weight: 800; color: var(--amt-blue); text-transform: uppercase; border-bottom: 1px solid var(--line); }
                .rdv-table td { padding: 12px 15px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #334155; vertical-align: middle; }
                .rdv-table tr:hover td { background: var(--soft); }
                .rdv-table tr.validated td { opacity: 0.5; background: var(--soft); }
                
                .type-badge { padding: 4px 8px; border-radius: 6px; font-size: 10px; font-weight: 800; letter-spacing: 0.5px; display: inline-block; white-space: nowrap; }
                .badge--depot { background: #e9eef5; color: var(--amt-blue); border: 1px solid #d3dceb; }
                .badge--recup { background: #fff4e0; color: #b9790c; border: 1px solid #fbe3b8; }

                .client-cell__name { font-weight: 700; color: var(--ink); }
                .phone-cell { color: var(--muted); font-weight: 600; font-size: 12px; }
                .address-cell { font-weight: 600; color: #1e293b; max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .time-cell { color: var(--amt-blue); font-weight: 700; }

                .actions-cell { display: flex; gap: 4px; }
                .btn-action { width: 32px; height: 32px; border-radius: 8px; border: 1px solid var(--line); background: white; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 14px; transition: 0.2s; color: var(--muted); }
                .btn-action:hover:not(:disabled) { background: var(--soft); color: var(--amt-blue); border-color: var(--amt-blue); }
                .btn-action--validate { border-color: #bbf7d0; color: #16a34a; background: #f0fdf4; }
                .btn-action--validate:hover:not(:disabled) { background: #dcfce7; border-color: #86efac; }
                .btn-action:disabled { opacity: 0.5; cursor: not-allowed; }
            </style>
            <div id="vue-mon-programme-app" class="my-programme-page" v-cloak>
                <div class="prog-header">
                    <div class="prog-header__content">
                        <div class="prog-header__icon">📋</div>
                        <div class="prog-header__info">
                            <h1 class="prog-header__title">Mon programme</h1>
                            <p class="prog-header__subtitle">Date: {{ formattedDate }}</p>
                        </div>
                    </div>
                </div>

                <div class="kpi-grid">
                    <div class="kpi-card kpi-card--purple">
                        <div class="kpi-card__icon">📅</div>
                        <div class="kpi-card__content">
                            <div class="kpi-card__value">{{ filteredRdvs.length }}</div>
                            <div class="kpi-card__label">RDV Total</div>
                        </div>
                    </div>
                    <div class="kpi-card kpi-card--blue">
                        <div class="kpi-card__icon">📦</div>
                        <div class="kpi-card__content">
                            <div class="kpi-card__value">{{ kpis.depots }}</div>
                            <div class="kpi-card__label">Dépôts</div>
                        </div>
                    </div>
                    <div class="kpi-card kpi-card--green">
                        <div class="kpi-card__icon">🔄</div>
                        <div class="kpi-card__content">
                            <div class="kpi-card__value">{{ kpis.recups }}</div>
                            <div class="kpi-card__label">Récupérations</div>
                        </div>
                    </div>
                    <div class="kpi-card kpi-card--teal">
                        <div class="kpi-card__icon">✅</div>
                        <div class="kpi-card__content">
                            <div class="kpi-card__value">{{ kpis.valides }}</div>
                            <div class="kpi-card__label">Validés</div>
                        </div>
                    </div>
                </div>

                <div class="prog-filters">
                    <div class="filter-group">
                        <label class="filter-label"><span class="filter-icon">📅</span> Date</label>
                        <input class="filter-input" type="date" v-model="filters.date">
                    </div>
                    <div class="filter-group">
                        <label class="filter-label"><span class="filter-icon">👤</span> Chauffeur</label>
                        <select class="filter-select" v-model="filters.driver">
                            <option value="">Moi ({{ currentUser }})</option>
                            <option value="ALL">Tous les chauffeurs</option>
                            <option v-for="d in otherDrivers" :key="d" :value="d">{{ d }}</option>
                        </select>
                    </div>
                    <div class="filter-group" style="flex: 1.5;">
                        <label class="filter-label"><span class="filter-icon">🔍</span> Recherche</label>
                        <input class="filter-input" v-model="filters.search" placeholder="Adresse, nom, prénom, téléphone...">
                    </div>
                </div>

                <div class="rdv-table-card">
                    <div class="rdv-table-header">
                        <h2 class="rdv-table-title"><span class="rdv-table-icon">📋</span> Rendez-vous <span class="rdv-table-count">{{ filteredRdvs.length }}</span></h2>
                    </div>
                    <div class="table-wrap">
                        <table class="rdv-table">
                            <thead>
                                <tr>
                                    <th style="width: 100px;">Type</th>
                                    <th style="width: 200px;">Client</th>
                                    <th style="width: 140px;">Téléphone</th>
                                    <th style="width: 140px;">Heure</th>
                                    <th>Adresse</th>
                                    <th style="width: 180px;">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-if="loading"><td colspan="6" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</td></tr>
                                <tr v-else-if="filteredRdvs.length === 0"><td colspan="6" style="text-align: center; padding: 40px; color: #64748b;">Aucun rendez-vous trouvé pour ce programme.</td></tr>
                                <template v-else>
                                    <tr v-for="r in filteredRdvs" :key="r.id" :class="{'validated': r.status === 'réalisé'}">
                                        <td><span :class="['type-badge', r.rdvType === 'DEPOT' ? 'badge--depot' : 'badge--recup']">{{ r.rdvType === 'DEPOT' ? 'DEPOT' : 'RECUP' }}</span></td>
                                        <td>
                                            <div class="client-cell">
                                                <div class="client-cell__name">{{ r.client }}</div>
                                            </div>
                                        </td>
                                        <td><div class="phone-cell">📞 {{ r.tel || '--' }}</div></td>
                                        <td><div class="time-cell">🕐 {{ r.time || '10:00 - 12:00' }}</div></td>
                                        <td class="address-cell" :title="r.adresse">
                                            {{ r.adresse || '-' }}
                                            <div v-if="r.etage" style="font-size:11px; color:#64748b; margin-top:2px;">🏢 {{ r.etage }}</div>
                                            <div v-if="r.acces && r.acces !== 'Aucun'" style="font-size:11px; color:#64748b;">🔑 {{ r.acces }}<span v-if="r.codeAcces"> : {{ r.codeAcces }}</span></div>
                                        </td>
                                        <td class="actions-cell">
                                            <button class="btn-action btn-action--call" @click="callClient(r.tel)" title="Appeler">📞</button>
                                            <button class="btn-action btn-action--map" @click="openMap(r.adresse)" title="Itinéraire">🗺️</button>
                                            <button class="btn-action btn-action--invoice" @click="createInvoice(r)" title="Créer facture">📄</button>
                                            <button v-if="r.status === 'réalisé'" class="btn-action btn-action--validate" disabled title="Déjà validé">✅</button>
                                            <button v-else class="btn-action btn-action--validate" @click="validateRdv(r.id)" title="Valider RDV">✅</button>
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
                const currentUser = sessionStorage.getItem('userName') || '';
                const userRole = sessionStorage.getItem('userRole') || '';
                const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
                
                const rdvs = ref([]);
                const otherDrivers = ref([]);
                const loading = ref(true);
                
                const filters = reactive({
                    date: new Date().toISOString().split('T')[0],
                    driver: (userRole === 'chauf') ? '' : 'ALL', // Par défaut "Tous" pour les admins/managers, "Moi" pour les chauffeurs
                    search: ''
                });
                
                let unsub = null;

                const formattedDate = computed(() => {
                    return new Date(filters.date).toLocaleDateString('fr-FR');
                });

                const loadData = () => {
                    if (unsub) unsub();
                    loading.value = true;
                    
                    const q = query(
                        collection(db, getCollectionName("appointments")), 
                        where("agency", "==", activeAgency),
                        where("date", "==", filters.date)
                    );

                    unsub = onSnapshot(q, (snapshot) => {
                        const data = snapshot.docs
                            .map(d => ({id: d.id, ...d.data()}))
                            .filter(r => ['confirmé', 'en_cours', 'réalisé'].includes(r.status));
                            
                        data.sort((a, b) => (a.orderInRoute || 0) - (b.orderInRoute || 0));
                        rdvs.value = data;
                        loading.value = false;
                    });
                };

                const loadDrivers = async () => {
                    const usersSnap = await getDocs(collection(db, "users"));
                    const agentsSnap = await getDocs(collection(db, "agents"));
                    
                    const driverMap = new Map();
                    usersSnap.forEach(doc => {
                        const data = doc.data();
                        if ((data.role === 'chauf' || data.isChauffeur) && (data.agency === activeAgency || data.agency === 'all')) {
                            const name = data.displayName || data.email || 'Inconnu';
                            driverMap.set(name.toLowerCase().trim(), name);
                        }
                    });
                    agentsSnap.forEach(doc => {
                        const data = doc.data();
                        const name = data.name;
                        if (name && (data.agency === activeAgency || data.agency === 'all') && !driverMap.has(name.toLowerCase().trim())) {
                            driverMap.set(name.toLowerCase().trim(), name);
                        }
                    });
                    
                    otherDrivers.value = Array.from(driverMap.values()).filter(d => d !== currentUser).sort();
                };

                onMounted(() => {
                    loadDrivers();
                    loadData();
                });

                watch(() => filters.date, () => {
                    loadData();
                });

                onUnmounted(() => {
                    if (unsub) unsub();
                });

                const filteredRdvs = computed(() => {
                    const targetDriver = filters.driver === '' ? currentUser : (filters.driver === 'ALL' ? null : filters.driver);
                    const searchStr = filters.search.toLowerCase().trim();

                    return rdvs.value.filter(r => {
                        if (targetDriver && r.livreur !== targetDriver) return false;
                        if (searchStr) {
                            const combined = `${r.client} ${r.tel} ${r.adresse}`.toLowerCase();
                            if (!combined.includes(searchStr)) return false;
                        }
                        return true;
                    });
                });

                const kpis = computed(() => {
                    return {
                        depots: filteredRdvs.value.filter(r => r.rdvType === 'DEPOT').length,
                        recups: filteredRdvs.value.filter(r => r.rdvType === 'RECUPERATION').length,
                        valides: filteredRdvs.value.filter(r => r.status === 'réalisé').length
                    };
                });

                const validateRdv = async (id) => {
                    if (window.AppModal) {
                        if (!await window.AppModal.confirm("Confirmer la réalisation de ce rendez-vous ?", "Validation RDV", false)) return;
                    } else if (!confirm("Confirmer la réalisation ?")) {
                        return;
                    }

                    try {
                        await updateDoc(doc(db, getCollectionName("appointments"), id), { status: 'réalisé' });
                        globalApp.showToast("Rendez-vous validé !", "success");
                    } catch(e) {
                        globalApp.showToast("Erreur lors de la validation", "error");
                    }
                };

                const callClient = (phone) => {
                    const cleanPhone = (phone || '').replace(/[^\d+]/g, '');
                    window.location.href = `tel:${cleanPhone}`;
                };

                const openMap = (address) => {
                    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address || '')}`, '_blank');
                };

                const createInvoice = (rdv) => {
                    if (rdv && rdv.client) {
                        sessionStorage.setItem('reuseExpediteur', rdv.client);
                    }
                    globalApp.renderPage('invoice-new');
                };

                return {
                    rdvs, otherDrivers, currentUser, loading, filters, formattedDate,
                    filteredRdvs, kpis, validateRdv, callClient, openMap, createInvoice
                };
            }
        });

        this.vueApp.mount('#vue-mon-programme-app');
    }
};