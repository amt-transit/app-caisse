import { db } from '../../../firebase-config.js';
import { collection, query, onSnapshot, doc, writeBatch, where } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { createApp, ref, reactive, computed, onMounted, onUnmounted } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";
import { getCollectionName } from '../../../agencies-config.js';

// ARRIVÉES (agence d'arrivée) — « Bateau arrivée » (maritime) / « Vol arrivée »
// (aérien). Liste les bateaux/vols partis (statut ENREGISTRE) et permet de
// VALIDER leur arrivée à destination : le transport passe en ARRIVE et ses
// colis passent en « En cours » (containerStatus = EN_COURS, réceptionnés).
// Côté arrivée on lit les collections SANS filtre `agency` : getCollectionName
// route déjà vers la bonne table (boats / boats_aerien / boats_<route>...).
export const ArriveesView = {
    vueApp: null,

    render(app) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.arrivees = this;
        const isAerien = sessionStorage.getItem('shippingMode') === 'aerien';

        const html = `
            <style>
                .al__btn { padding: 10px 16px; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer; transition: 0.2s; border: 1px solid transparent; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
                .al__btn--primary { background: #3b82f6; color: white; box-shadow: 0 2px 4px rgba(59,130,246,0.2); }
                .al__btn--primary:hover { background: #2563eb; }
                .al__btn--ghost { background: white; border-color: #cbd5e1; color: #475569; }
                .al__btn--ghost:hover { background: #f1f5f9; color: #0f172a; }
                .al__btn--sm { padding: 6px 12px; font-size: 12px; }
                .al__btn:disabled { opacity: 0.55; cursor: not-allowed; }
                .arr-page { max-width: 1400px; margin: 0 auto; animation: fadeIn 0.3s ease; }
                .arr-header { background: white; border-radius: 16px; padding: 18px 24px; margin-bottom: 18px; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
                .arr-header__content { display: flex; align-items: center; gap: 15px; flex-wrap: wrap; justify-content: space-between; }
                .arr-header__left { display: flex; align-items: center; gap: 14px; }
                .arr-header__icon { font-size: 26px; background: linear-gradient(135deg, #1A3553, #E51F21); color: #fff; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; border-radius: 12px; }
                .arr-header__title { margin: 0; font-size: 20px; font-weight: 800; color: #0f172a; }
                .arr-header__subtitle { margin: 2px 0 0 0; font-size: 13px; color: #64748b; }
                .arr-header__actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
                .tab-switcher { display: inline-flex; background: #f1f5f9; border-radius: 10px; padding: 4px; gap: 4px; }
                .tab-btn { border: none; background: transparent; padding: 8px 16px; border-radius: 8px; font-weight: 700; font-size: 13px; cursor: pointer; color: #475569; }
                .tab-btn--active { background: #1A3553; color: #fff; }
                .btn-refresh { background: white; border: 1px solid #cbd5e1; color: #475569; padding: 8px 14px; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer; }

                .arr-filters { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 18px; margin-bottom: 18px; display: flex; gap: 14px; align-items: flex-end; flex-wrap: wrap; }
                .filter-group { flex: 1; min-width: 220px; }
                .filter-label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 6px; }
                .filter-input { width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; }

                .section-header { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
                .section-title { margin: 0; font-size: 16px; font-weight: 800; color: #0f172a; display: flex; align-items: center; gap: 8px; }
                .section-count { background: #1A3553; color: #fff; font-size: 12px; font-weight: 800; padding: 2px 10px; border-radius: 12px; }

                .cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
                .boat-card { background: white; border-radius: 14px; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.03); overflow: hidden; display: flex; flex-direction: column; }
                .boat-card__header { padding: 13px 16px; display: flex; justify-content: space-between; align-items: center; background: #1A3553; color: #fff; }
                .boat-card__ref { font-weight: 800; font-family: monospace; font-size: 14px; }
                .boat-card__badge { font-size: 11px; font-weight: 800; padding: 3px 10px; border-radius: 12px; }
                .boat-card__badge--pending { background: #fef3c7; color: #b45309; }
                .boat-card__badge--validated { background: #dcfce7; color: #166534; }
                .boat-card__body { padding: 16px; flex: 1; }
                .boat-card__info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
                .boat-card__info-item { display: flex; flex-direction: column; }
                .boat-card__label { font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; }
                .boat-card__value { font-size: 14px; font-weight: 700; color: #1e293b; }
                .mono { font-family: monospace; }
                .boat-card__containers { border-top: 1px dashed #e2e8f0; padding-top: 12px; }
                .boat-card__ctn-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
                .boat-card__ctn-badge { background: #f1f5f9; border: 1px solid #e2e8f0; color: #334155; font-weight: 700; font-size: 12px; padding: 4px 10px; border-radius: 8px; }
                .boat-card__ctn-badge small { color: #64748b; font-weight: 600; }
                .boat-card__footer { display: flex; gap: 8px; padding: 12px 16px; background: #f8fafc; border-top: 1px solid #e2e8f0; }
                .btn-card { flex: 1; padding: 9px 12px; border-radius: 8px; font-weight: 700; font-size: 13px; cursor: pointer; border: 1px solid transparent; }
                .btn-card--view { background: white; border-color: #cbd5e1; color: #475569; }
                .btn-card--validate { background: #10b981; color: #fff; }
                .btn-card:disabled { opacity: 0.55; cursor: not-allowed; }

                .arr-empty { text-align: center; padding: 50px 20px; color: #64748b; background: white; border: 1px dashed #cbd5e1; border-radius: 14px; }

                .arr-modal { display:none; position:fixed; z-index:9999; inset:0; background:rgba(15,23,42,0.6); backdrop-filter: blur(4px); align-items:center; justify-content:center; }
                .arr-modal.active { display:flex; }
                .arr-modal-box { background:#fff; border-radius:16px; width:90%; max-width:560px; max-height:85vh; overflow:hidden; display:flex; flex-direction:column; }
                .arr-modal-header { padding:16px 20px; background:#1A3553; color:#fff; display:flex; justify-content:space-between; align-items:center; }
                .arr-modal-title { margin:0; font-size:16px; font-weight:800; }
                .arr-modal-body { padding:18px 20px; overflow-y:auto; }
                .arr-detail-row { display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #f1f5f9; font-size:14px; }
                .arr-detail-row .k { color:#64748b; font-weight:600; }
                .arr-detail-row .v { font-weight:700; color:#1e293b; }
                .arr-modal-footer { padding:14px 20px; border-top:1px solid #e2e8f0; display:flex; justify-content:flex-end; gap:10px; background:#f8fafc; }
            </style>

            <div id="vue-arrivees" class="arr-page" v-cloak>
                <div class="arr-header">
                    <div class="arr-header__content">
                        <div class="arr-header__left">
                            <div class="arr-header__icon">{{ isAerien ? '✈️' : '🚢' }}</div>
                            <div>
                                <h1 class="arr-header__title">{{ isAerien ? 'Vols arrivés' : 'Bateaux arrivés' }}</h1>
                                <p class="arr-header__subtitle">{{ pending.length }} à valider — {{ validated.length }} validé(s)</p>
                            </div>
                        </div>
                        <div class="arr-header__actions">
                            <div class="tab-switcher">
                                <button class="tab-btn" :class="{ 'tab-btn--active': tab === 'pending' }" type="button" @click="tab = 'pending'">🕒 À valider</button>
                                <button class="tab-btn" :class="{ 'tab-btn--active': tab === 'validated' }" type="button" @click="tab = 'validated'">✅ Validés</button>
                            </div>
                            <button class="btn-refresh" type="button" @click="loadData">🔄 Rafraîchir</button>
                        </div>
                    </div>
                </div>

                <div class="arr-filters">
                    <div class="filter-group">
                        <label class="filter-label">🔍 Recherche</label>
                        <input class="filter-input" v-model="search" :placeholder="isAerien ? 'N° de vol, compagnie...' : 'Référence bateau, compagnie...'">
                    </div>
                </div>

                <div class="section-header">
                    <h2 class="section-title">
                        <span>{{ tab === 'pending' ? '🕒' : '✅' }}</span>
                        {{ tab === 'pending' ? (isAerien ? 'Vols à valider' : 'Bateaux à valider') : (isAerien ? 'Vols validés' : 'Bateaux validés') }}
                        <span class="section-count">{{ visibleList.length }}</span>
                    </h2>
                </div>

                <div v-if="loading" class="arr-empty"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>
                <div v-else-if="visibleList.length === 0" class="arr-empty">
                    {{ tab === 'pending' ? (isAerien ? 'Aucun vol en attente de validation.' : 'Aucun bateau en attente de validation.') : 'Aucun élément validé.' }}
                </div>

                <div v-else class="cards-grid">
                    <div v-for="b in visibleList" :key="b.id" class="boat-card">
                        <div class="boat-card__header">
                            <div class="boat-card__ref">{{ isAerien ? '✈️ ' : '🚢 ' }}{{ isAerien ? (b.flightNumber || b.reference) : b.reference }}</div>
                            <div class="boat-card__badge" :class="b.status === 'ARRIVE' ? 'boat-card__badge--validated' : 'boat-card__badge--pending'">
                                {{ b.status === 'ARRIVE' ? 'Arrivé' : 'À valider' }}
                            </div>
                        </div>
                        <div class="boat-card__body">
                            <div class="boat-card__info-grid">
                                <div class="boat-card__info-item">
                                    <span class="boat-card__label">{{ isAerien ? 'Date départ' : 'Date départ' }}</span>
                                    <span class="boat-card__value mono">{{ formatDate(b.departureDate) }}</span>
                                </div>
                                <div class="boat-card__info-item">
                                    <span class="boat-card__label">{{ isAerien ? 'Arrivée prévue' : 'Arrivée prévue' }}</span>
                                    <span class="boat-card__value mono">{{ formatDate(b.arrivalDate) }}</span>
                                </div>
                                <div class="boat-card__info-item">
                                    <span class="boat-card__label">Compagnie</span>
                                    <span class="boat-card__value">{{ (isAerien ? b.airline : b.company) || '-' }}</span>
                                </div>
                                <div class="boat-card__info-item">
                                    <span class="boat-card__label">{{ isAerien ? 'N° LTA (AWB)' : 'Navire' }}</span>
                                    <span class="boat-card__value mono">{{ (isAerien ? b.awb : b.name) || '-' }}</span>
                                </div>
                            </div>
                            <div class="boat-card__containers">
                                <span class="boat-card__label" v-if="isAerien">Colis ({{ b.pieceCount || 0 }})</span>
                                <span class="boat-card__label" v-else>Conteneurs ({{ boatContainers(b.id).length }})</span>
                                <div class="boat-card__ctn-list">
                                    <template v-if="isAerien">
                                        <span class="boat-card__ctn-badge">📦 {{ b.pieceCount || 0 }} colis <small>({{ (b.totalWeight || 0).toFixed(1) }} kg)</small></span>
                                    </template>
                                    <template v-else>
                                        <span v-for="c in boatContainers(b.id)" :key="c.id" class="boat-card__ctn-badge">{{ c.number || c.id }} <small>({{ containerWeight(c).toFixed(0) }} kg)</small></span>
                                        <span v-if="boatContainers(b.id).length === 0" style="font-size:12px; color:#94a3b8; font-style:italic;">Aucun conteneur</span>
                                    </template>
                                </div>
                            </div>
                        </div>
                        <div class="boat-card__footer">
                            <button class="btn-card btn-card--view" type="button" @click="openDetail(b)">👁️ Voir</button>
                            <button v-if="b.status !== 'ARRIVE'" class="btn-card btn-card--validate" type="button" :disabled="validating" @click="validate(b)">✅ Valider l'arrivée</button>
                        </div>
                    </div>
                </div>

                <!-- MODAL DÉTAIL -->
                <div class="arr-modal" :class="{ active: !!detail }">
                    <div class="arr-modal-box" v-if="detail">
                        <div class="arr-modal-header">
                            <h2 class="arr-modal-title">{{ isAerien ? '✈️ Vol ' : '🚢 Bateau ' }}{{ isAerien ? (detail.flightNumber || detail.reference) : detail.reference }}</h2>
                            <button @click="detail = null" style="background:none; border:none; font-size:24px; cursor:pointer; color:#fff;">&times;</button>
                        </div>
                        <div class="arr-modal-body">
                            <div class="arr-detail-row"><span class="k">Compagnie</span><span class="v">{{ (isAerien ? detail.airline : detail.company) || '-' }}</span></div>
                            <div class="arr-detail-row"><span class="k">{{ isAerien ? 'N° de vol' : 'Navire' }}</span><span class="v">{{ (isAerien ? detail.flightNumber : detail.name) || '-' }}</span></div>
                            <div class="arr-detail-row" v-if="isAerien"><span class="k">N° LTA (AWB)</span><span class="v">{{ detail.awb || '-' }}</span></div>
                            <div class="arr-detail-row"><span class="k">Date départ</span><span class="v mono">{{ formatDate(detail.departureDate) }}</span></div>
                            <div class="arr-detail-row"><span class="k">Arrivée prévue</span><span class="v mono">{{ formatDate(detail.arrivalDate) }}</span></div>
                            <div class="arr-detail-row" v-if="detail.status === 'ARRIVE'"><span class="k">Arrivée réelle</span><span class="v mono">{{ formatDate(detail.realArrivalDate) }}</span></div>
                            <div style="margin-top:14px;">
                                <div class="boat-card__label" style="margin-bottom:8px;">{{ isAerien ? 'Colis embarqués sur le vol' : 'Conteneurs & dossiers' }}</div>
                                <template v-if="isAerien">
                                    <div v-for="p in flightPieces(detail)" :key="p.sousRef" class="arr-detail-row">
                                        <span class="k mono">{{ p.sousRef }}</span><span class="v">{{ p.desc || '-' }} · {{ p.destinataire || '-' }} · {{ (parseFloat(p.poids)||0).toFixed(1) }} kg</span>
                                    </div>
                                    <div v-if="flightPieces(detail).length === 0" style="color:#94a3b8; font-style:italic;">Aucun colis embarqué.</div>
                                </template>
                                <template v-else>
                                    <div v-for="c in boatContainers(detail.id)" :key="c.id" class="arr-detail-row">
                                        <span class="k mono">{{ c.number || c.id }}</span><span class="v">{{ containerDossiers(c).length }} dossier(s) · {{ containerWeight(c).toFixed(0) }} kg</span>
                                    </div>
                                    <div v-if="boatContainers(detail.id).length === 0" style="color:#94a3b8; font-style:italic;">Aucun conteneur.</div>
                                </template>
                            </div>
                        </div>
                        <div class="arr-modal-footer">
                            <button class="al__btn al__btn--ghost" @click="detail = null">Fermer</button>
                            <button v-if="detail.status !== 'ARRIVE'" class="al__btn al__btn--primary" :disabled="validating" @click="validate(detail)">✅ Valider l'arrivée</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('contentContainer').innerHTML = html;
        this.initVue(isAerien);
    },

    initVue(isAerien) {
        if (this.vueApp) this.vueApp.unmount();
        const globalApp = this.app;

        this.vueApp = createApp({
            setup() {
                const boats = ref([]);
                const containers = ref([]);
                const livraisons = ref([]);
                const loading = ref(true);
                const validating = ref(false);
                const tab = ref('pending');
                const search = ref('');
                const detail = ref(null);

                let unsubBoats = null, unsubContainers = null, unsubLiv = null;

                const formatDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '-';

                const boatContainers = (boatId) => containers.value.filter(c => c.boatId === boatId);
                const containerDossiers = (c) => livraisons.value.filter(l => l.conteneur === (c.number || c.id));
                const containerWeight = (c) => containerDossiers(c).reduce((s, l) => s + (parseFloat(l.poids) || 0), 0);
                const flightParcels = (flightId) => livraisons.value.filter(l => l.flightId === flightId);
                // Sous-colis réellement embarqués du vol : snapshot figé au départ.
                const flightPieces = (f) => (f && Array.isArray(f.pieces)) ? f.pieces : [];

                const matchSearch = (b) => {
                    const q = search.value.trim().toLowerCase();
                    if (!q) return true;
                    const hay = [b.reference, b.flightNumber, b.company, b.airline, b.name, b.awb].filter(Boolean).join(' ').toLowerCase();
                    return hay.includes(q);
                };

                const pending = computed(() => boats.value.filter(b => b.status === 'ENREGISTRE'));
                const validated = computed(() => boats.value.filter(b => b.status === 'ARRIVE'));

                const visibleList = computed(() => {
                    const base = (tab.value === 'pending' ? pending.value : validated.value).filter(matchSearch);
                    return base.sort((a, b) => new Date(b.registeredAt || 0) - new Date(a.registeredAt || 0));
                });

                const openDetail = (b) => { detail.value = b; };

                const validate = async (b) => {
                    if (!b || b.status === 'ARRIVE') return;
                    const word = isAerien ? 'vol' : 'bateau';
                    const label = isAerien ? `vol ${b.flightNumber || b.reference}` : `bateau ${b.reference}`;
                    const ok = await window.AppModal.confirm(
                        `Confirmer l'arrivée du ${label} à destination ?\n\nCela signale seulement que le ${word} est arrivé. Les colis ne sont PAS encore reçus : ils le seront un par un via le scan Déchargement.`,
                        "Valider l'arrivée");
                    if (!ok) return;

                    validating.value = true;
                    const realArrivalDate = new Date().toISOString();
                    try {
                        const batch = writeBatch(db);
                        // On marque UNIQUEMENT le transport comme arrivé. Les colis
                        // restent « en transit / en vol » : seul le scan
                        // Déchargement confirme chaque colis reçu (EN_COURS +
                        // déclenchement du magasinage).
                        batch.update(doc(db, getCollectionName("boats"), b.id), { status: 'ARRIVE', realArrivalDate });

                        if (!isAerien) {
                            // Maritime : les conteneurs du bateau passent « Arrivé ».
                            boatContainers(b.id).forEach(c => batch.update(doc(db, getCollectionName("containers"), c.id), { status: 'ARRIVE' }));
                        }

                        await batch.commit();
                        detail.value = null;
                        globalApp.showToast(`Arrivée du ${label} validée. Réceptionnez les colis via le scan Déchargement.`, "success");
                    } catch (e) {
                        console.error('[arrivees] validate échec —', e);
                        const det = (e && (e.code || e.message)) ? ` (${e.code || e.message})` : '';
                        globalApp.showToast(`Erreur lors de la validation.${det}`, "error");
                    } finally {
                        validating.value = false;
                    }
                };

                const loadData = () => {
                    if (unsubBoats) unsubBoats();
                    if (unsubContainers) unsubContainers();
                    if (unsubLiv) unsubLiv();
                    loading.value = true;

                    // Côté arrivée : pas de filtre `agency` — getCollectionName
                    // route déjà vers la bonne table de la route.
                    const boatCol = getCollectionName("boats");
                    const livCol = getCollectionName("livraisons");

                    unsubBoats = onSnapshot(query(collection(db, boatCol)), snap => {
                        boats.value = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                        loading.value = false;
                    }, err => { console.error('[arrivees] boats —', err); loading.value = false; });

                    unsubLiv = onSnapshot(query(collection(db, livCol)), snap => {
                        livraisons.value = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                    }, err => console.error('[arrivees] livraisons —', err));

                    // Conteneurs : utiles seulement en maritime.
                    if (!isAerien) {
                        const contCol = getCollectionName("containers");
                        unsubContainers = onSnapshot(query(collection(db, contCol)), snap => {
                            containers.value = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                        }, err => console.error('[arrivees] containers —', err));
                    }
                };

                onMounted(loadData);
                onUnmounted(() => {
                    if (unsubBoats) unsubBoats();
                    if (unsubContainers) unsubContainers();
                    if (unsubLiv) unsubLiv();
                });

                return {
                    isAerien, boats, containers, livraisons, loading, validating, tab, search, detail,
                    formatDate, boatContainers, containerDossiers, containerWeight, flightParcels, flightPieces,
                    pending, validated, visibleList, openDetail, validate, loadData
                };
            }
        });

        const style = document.createElement('style');
        style.textContent = '[v-cloak] { display: none; }';
        document.head.appendChild(style);

        this.vueApp.mount('#vue-arrivees');
    }
};
