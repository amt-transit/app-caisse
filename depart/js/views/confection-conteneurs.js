import { db } from '../../../commun/firebase-config.js';
import { collection, query, where, onSnapshot, doc, updateDoc, writeBatch, setDoc, arrayUnion, getDocs, addDoc, limit } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { createApp, ref, computed, onMounted, onUnmounted, watch } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";
import { getCollectionName } from '../../../commun/agencies-config.js';
import { matchesShippingMode } from '../../../commun/shipping-mode.js';
import { isEurAgency } from '../../../commun/agency-money.js';
import { containerStageBadgeHtml } from '../../../commun/container-stage.js';

export const ConfectionConteneursView = {
    vueApp: null,

    render(app) {
        const globalApp = app;
        window.app.views = window.app.views || {};
        window.app.views.confectionConteneurs = this;

        const html = `
            <style>
                [v-cloak] { display: none; }
                .confection-page { max-width: 1400px; margin: 0 auto; animation: fadeIn 0.3s ease; }
                .confection-header { background: white; border-radius: 16px; padding: 20px 25px; margin-bottom: 20px; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
                .confection-header__content { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 15px; }
                .confection-header__left { display: flex; align-items: center; gap: 15px; }
                .confection-header__icon { font-size: 28px; background: #fffbeb; color: #f59e0b; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; border-radius: 12px; }
                .confection-header__title { margin: 0; font-size: 20px; font-weight: 800; color: #0f172a; }
                .confection-header__subtitle { margin: 2px 0 0 0; font-size: 13px; color: #64748b; }

                .confection-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
                @media (max-width: 992px) { .confection-grid { grid-template-columns: 1fr; } }

                .panel { background: white; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 2px 4px rgba(0,0,0,0.02); height: 650px; }
                .panel--bottom { grid-column: 1 / -1; height: auto; min-height: 300px; }
                
                .panel__header { padding: 15px 20px; display: flex; justify-content: space-between; align-items: center; color: white; }
                .panel__header--blue { background: #3b82f6; }
                .panel__header--orange { background: #f59e0b; }
                .panel__header--green { background: #10b981; }
                .panel__title { margin: 0; font-size: 16px; font-weight: 700; display: flex; align-items: center; gap: 10px; }
                .badge { background: rgba(255,255,255,0.25); padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; }

                .panel__toolbar { padding: 15px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; display: flex; justify-content: space-between; align-items: center; gap: 15px; flex-wrap: wrap; }
                .search-group { display: flex; flex: 1; min-width: 200px; }
                .search-input { width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px 0 0 6px; font-size: 13px; outline: none; }
                .search-input:focus { border-color: #3b82f6; }
                .btn-search { background: #3b82f6; color: white; border: none; padding: 0 12px; border-radius: 0 6px 6px 0; cursor: pointer; }
                
                .toolbar-actions { display: flex; gap: 8px; }
                .btn-sm { padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid transparent; transition: 0.2s; }
                .btn-sm--ghost { background: white; border-color: #cbd5e1; color: #475569; }
                .btn-sm--ghost:hover:not(:disabled) { background: #f1f5f9; color: #0f172a; }
                .btn-sm:disabled { opacity: 0.5; cursor: not-allowed; }

                .panel__body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; background: #f8fafc; padding: 10px; }
                .dossier-list, .ctn-dossier-list { display: flex; flex-direction: column; gap: 8px; }
                
                .dossier-item, .ctn-dossier-item { display: flex; align-items: center; padding: 12px; background: white; border: 1px solid #e2e8f0; border-radius: 10px; gap: 12px; transition: 0.2s; }
                .dossier-item:hover { border-color: #3b82f6; box-shadow: 0 2px 4px rgba(59,130,246,0.05); }
                
                .dossier-item__check input[type="checkbox"] { width: 18px; height: 18px; cursor: pointer; accent-color: #3b82f6; }
                .dossier-item__info, .ctn-dossier-item__info { flex: 1; min-width: 0; }
                
                .dossier-item__ref { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
                .status-icon { font-size: 10px; }
                .mono { font-family: monospace; font-weight: 800; color: #0f172a; font-size: 14px; }
                
                .dossier-item__meta, .ctn-dossier-item__meta { display: flex; flex-wrap: wrap; gap: 6px; }
                .meta-tag { font-size: 11px; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; color: #475569; font-weight: 600; white-space: nowrap; }
                .meta-tag--client { color: #0369a1; background: #e0f2fe; }
                .meta-tag--money { color: #166534; background: #dcfce7; }

                /* Onglets conteneurs */
                .ctn-tabs { display: flex; overflow-x: auto; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
                .ctn-tab { padding: 12px 20px; background: none; border: none; border-bottom: 3px solid transparent; font-weight: 700; color: #64748b; cursor: pointer; font-size: 14px; display: flex; align-items: center; gap: 8px; white-space: nowrap; }
                .ctn-tab--active { color: #f59e0b; border-bottom-color: #f59e0b; background: white; }
                .ctn-tab__count { background: #e2e8f0; color: #475569; padding: 2px 6px; border-radius: 10px; font-size: 11px; }
                .ctn-tab--active .ctn-tab__count { background: #fef3c7; color: #d97706; }

                /* Stats conteneur */
                .ctn-stats { display: flex; gap: 10px; margin-bottom: 15px; }
                .ctn-stat { flex: 1; background: white; border: 1px solid #e2e8f0; padding: 10px; border-radius: 8px; text-align: center; }
                .ctn-stat__label { font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 600; margin-bottom: 4px; }
                .ctn-stat__value { font-size: 18px; font-weight: 800; color: #0f172a; }

                /* Boutons actions conteneur */
                .ctn-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 15px; }
                .btn-action { flex: 1; min-width: 120px; padding: 10px; border-radius: 8px; font-weight: 700; font-size: 13px; cursor: pointer; border: 1px solid transparent; transition: 0.2s; display: flex; align-items: center; justify-content: center; gap: 6px; }
                .btn-action--add { background: #eff6ff; color: #2563eb; border-color: #bfdbfe; }
                .btn-action--add:hover:not(:disabled) { background: #dbeafe; }
                .btn-action--scan { background: white; color: #475569; border-color: #cbd5e1; }
                .btn-action--scan:hover { background: #f1f5f9; }
                .btn-action--danger { background: #fef2f2; color: #dc2626; border-color: #fecaca; }
                .btn-action--danger:hover { background: #fee2e2; }
                .btn-action--register { background: #10b981; color: white; }
                .btn-action--register:hover { background: #059669; }
                .btn-action:disabled { opacity: 0.5; cursor: not-allowed; }

                .btn-remove { background: #fef2f2; color: #ef4444; border: 1px solid #fecaca; width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-weight: bold; transition: 0.2s; }
                .btn-remove:hover { background: #fee2e2; }

                .reg-table { width: 100%; border-collapse: collapse; background: white; }
                .reg-table th { text-align: left; padding: 12px 15px; font-size: 12px; color: #64748b; border-bottom: 1px solid #e2e8f0; }
                .reg-table td { padding: 12px 15px; font-size: 13px; color: #334155; border-bottom: 1px solid #f1f5f9; }
            </style>

            <div id="vue-confection-conteneurs-app" class="confection-page" v-cloak>
                <div class="confection-header">
                    <div class="confection-header__content">
                        <div class="confection-header__left">
                            <div class="confection-header__icon">📦</div>
                            <div>
                                <h1 class="confection-header__title">Confection Conteneurs</h1>
                                <p class="confection-header__subtitle">{{ activeContainers.length }} conteneur(s) en confection — {{ availableLivraisons.length }} dossier(s) disponible(s)</p>
                            </div>
                        </div>
                        <button class="btn btn-outline" type="button" @click="loadData">
                            <i class="fas fa-sync-alt"></i> Rafraîchir
                        </button>
                    </div>
                </div>

                <div class="confection-grid">
                    <!-- PANEL GAUCHE : DOSSIERS DISPONIBLES -->
                    <div class="panel panel--left">
                        <div class="panel__header panel__header--blue">
                            <h2 class="panel__title"><span>📋</span> Dossiers disponibles <span class="badge">{{ availableLivraisons.length }}</span></h2>
                        </div>
                        <div class="panel__toolbar">
                            <div class="search-group">
                                <input class="search-input" v-model="leftSearch" placeholder="Rechercher référence, client…">
                                <button class="btn-search" type="button">🔍</button>
                            </div>
                            <div class="toolbar-actions">
                                <button class="btn-sm btn-sm--ghost" type="button" @click="selectAllLeft(true)">Tout cocher</button>
                                <button class="btn-sm btn-sm--ghost" type="button" @click="selectAllLeft(false)">Décocher</button>
                            </div>
                        </div>
                        <div class="panel__body">
                            <div class="dossier-list">
                                <div v-if="loadingLivraisons" style="text-align: center; padding: 40px; color: #64748b;"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>
                                <div v-else-if="availableLivraisons.length === 0" style="text-align: center; padding: 40px; color: #64748b;">Aucun dossier disponible à assigner.</div>
                                <div v-else v-for="l in availableLivraisons" :key="l.id" class="dossier-item">
                                    <div class="dossier-item__check">
                                        <input type="checkbox" :value="l.id" v-model="selectedAvailableIds">
                                    </div>
                                    <div class="dossier-item__info" style="cursor:pointer;" @click="openLoadModal(l.id)" title="Choisir les sous-colis précis à charger">
                                        <div class="dossier-item__ref"><span class="status-icon">🔵</span><span class="mono">{{ l.ref }}</span></div>
                                        <div class="dossier-item__meta">
                                            <span class="meta-tag meta-tag--client">👤 {{ l.destinataire || l.expediteur || 'Client' }}</span>
                                            <span class="meta-tag" :style="{ background: loadedCount(l) ? '#fef9c3' : '' }">📦 {{ availableCount(l) }} dispo<span v-if="loadedCount(l)"> · {{ loadedCount(l) }} chargé(s)</span></span>
                                            <span class="meta-tag meta-tag--money">{{ l.prixOriginal || l.montant || '0 CFA' }}</span>
                                            <span class="meta-tag" style="background:#eef2ff; color:#4338ca;">👆 choisir les sous-colis</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- PANEL DROIT : CONTENEUR EN CONFECTION -->
                    <div class="panel panel--right">
                        <div class="panel__header panel__header--orange">
                            <h2 class="panel__title"><span>🏗️</span> Conteneurs en confection <span class="badge badge--orange">{{ activeContainers.length }}</span></h2>
                        </div>
                        <div class="ctn-tabs">
                            <div v-if="activeContainers.length === 0" style="padding: 12px 20px; color: #64748b;">Aucun conteneur en cours. Créez-en un dans "Gestion Conteneurs".</div>
                            <button v-else v-for="c in activeContainers" :key="c.id" :class="['ctn-tab', { 'ctn-tab--active': c.id === activeTabId }]" @click="activeTabId = c.id">
                                {{ c.number || c.id }} <span class="ctn-tab__count">{{ getContainerItemsCount(c) }}</span>
                            </button>
                        </div>
                        <div class="panel__body" style="background: white;">
                            <template v-if="currentContainer">
                                <div style="margin-bottom:10px;"><span v-html="stageBadge(currentContainer)"></span></div>
                                <div class="ctn-stats">
                                    <div class="ctn-stat"><div class="ctn-stat__label">Référence</div><div class="ctn-stat__value mono">{{ currentContainerName }}</div></div>
                                    <div class="ctn-stat"><div class="ctn-stat__label">Dossiers</div><div class="ctn-stat__value">{{ currentContainerItems.length }}</div></div>
                                    <div class="ctn-stat"><div class="ctn-stat__label">Total colis</div><div class="ctn-stat__value">{{ currentContainerTotalColis }}</div></div>
                                    <div class="ctn-stat"><div class="ctn-stat__label">CA total</div><div class="ctn-stat__value">{{ formatMoney(currentContainerCADisplay) }}</div></div>
                                </div>
                                <div style="margin:0 0 12px;">
                                    <div style="height:12px; background:#e2e8f0; border-radius:7px; overflow:hidden;">
                                        <div :style="{ width: Math.min(100, currentContainerCbm/68*100) + '%', height:'100%', background: (currentContainerCbm/68) > 0.98 ? '#ef4444' : ((currentContainerCbm/68) > 0.8 ? '#f59e0b' : '#16a34a'), transition:'width .3s' }"></div>
                                    </div>
                                    <div style="font-size:12px; color:#475569; margin-top:4px; font-weight:600;">📦 {{ currentContainerTotalColis }} sous-colis · {{ currentContainerCbm.toFixed(1) }} / 68 CBM · {{ Math.round(currentContainerCbm/68*100) }}% rempli<span v-if="currentContainerCbm > 68" style="color:#fff; background:#ef4444; padding:1px 8px; border-radius:10px; margin-left:8px;">⚠️ DÉPASSEMENT ({{ (currentContainerCbm - 68).toFixed(1) }} CBM de trop)</span></div>
                                </div>
                                <div class="ctn-actions">
                                    <button class="btn-action btn-action--add" type="button" @click="addSelectedToContainer" :disabled="selectedAvailableIds.length === 0">➕ Ajouter ({{ selectedAvailableIds.length }})</button>
                                    <button class="btn-action btn-action--scan" type="button" @click="globalApp.renderPage('scan-container')">📡 Scan d'ajout</button>
                                    <button class="btn-action btn-action--danger" type="button" @click="emptyActiveContainer">🗑️ Vider</button>
                                    <button class="btn-action btn-action--register" type="button" @click="registerContainer">✅ Enregistrer</button>
                                </div>
                                <div class="ctn-dossier-list">
                                    <div v-if="currentContainerItems.length === 0" style="text-align: center; padding: 30px; color: #94a3b8;">Conteneur vide. Ajoutez des dossiers depuis la liste de gauche.</div>
                                    <div v-else v-for="l in currentContainerItems" :key="l.id" class="ctn-dossier-item">
                                        <div class="ctn-dossier-item__info">
                                            <div class="ctn-dossier-item__ref mono">{{ l.ref }}</div>
                                            <div class="ctn-dossier-item__meta">
                                                <span class="meta-tag meta-tag--client">👤 {{ l.destinataire || l.expediteur || 'Client' }}</span>
                                                <span class="meta-tag">📦 {{ loadedInContainer(l, currentContainerName) }} / {{ pieceTotal(l) }} chargé(s)</span>
                                                <span class="meta-tag meta-tag--money">{{ l.prixOriginal || l.montant || '0 CFA' }}</span>
                                            </div>
                                        </div>
                                        <button class="btn-remove" type="button" title="Retirer ces sous-colis du conteneur" @click="removeFromContainer(l.id)">✕</button>
                                    </div>
                                </div>
                            </template>
                        </div>
                    </div>

                    <!-- PANEL BAS : CONTENEURS ENREGISTRÉS -->
                    <div class="panel panel--bottom">
                        <div class="panel__header panel__header--green">
                            <h2 class="panel__title"><span>✅</span> Conteneurs enregistrés (en attente de bateau) <span class="badge badge--green">{{ registeredContainers.length }}</span></h2>
                        </div>
                        <div class="panel__body" style="padding: 0; background: white;">
                            <div class="table-wrap" style="overflow-x: auto;">
                                <table class="reg-table">
                                    <thead>
                                        <tr>
                                            <th>Référence</th>
                                            <th>Date création</th>
                                            <th>Date enregistrement</th>
                                            <th>Agent</th>
                                            <th style="text-align: center;">Dossiers</th>
                                            <th style="text-align: center;">Colis</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr v-if="loadingContainers"><td colspan="6" style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</td></tr>
                                        <tr v-else-if="registeredContainers.length === 0"><td colspan="6" style="text-align: center; padding: 20px; color: #64748b;">Aucun conteneur en attente de bateau.</td></tr>
                                        <tr v-else v-for="c in registeredContainers" :key="c.id">
                                            <td class="mono" style="font-weight: 800; color: #0f172a;">{{ c.number || c.id }}</td>
                                            <td>{{ formatDate(c.createdAt) }}</td>
                                            <td style="color: #10b981; font-weight: 600;">{{ formatDate(c.registeredAt) }}</td>
                                            <td style="color: #475569;">{{ currentUserName }}</td>
                                            <td style="text-align: center; font-weight: bold;">{{ getContainerItemsCount(c) }}</td>
                                            <td style="text-align: center;"><span class="badge" style="background:#e0f2fe; color:#0369a1;">📦 {{ getContainerColisCount(c) }}</span></td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- MODALE : choisir les sous-colis PRÉCIS à charger -->
                <div v-if="loadModal.open && loadModalDossier" class="modal-overlay" style="position:fixed; inset:0; background:rgba(0,0,0,.5); display:flex; align-items:center; justify-content:center; z-index:9999; padding:16px;" @click.self="closeLoadModal">
                    <div class="modal-content" style="background:#fff; border-radius:12px; max-width:700px; width:100%; max-height:90vh; overflow:auto; padding:22px;">
                        <h3 style="margin:0 0 4px;">📦 Charger — <span class="mono">{{ loadModalDossier.ref }}</span></h3>
                        <p style="color:#64748b; margin:0 0 12px;">Conteneur en cours : <strong>{{ currentContainerName || '— aucun conteneur actif' }}</strong> · {{ modalAvailableLabels.length }} disponible(s) sur {{ (loadModalDossier.labels || []).length }}</p>
                        <div style="display:flex; gap:8px; margin-bottom:10px; flex-wrap:wrap;">
                            <button class="btn-sm btn-sm--ghost" type="button" @click="modalSelectAll(true)">Tout cocher dispo</button>
                            <button class="btn-sm btn-sm--ghost" type="button" @click="modalSelectAll(false)">Décocher</button>
                        </div>
                        <div style="border:1px solid #e2e8f0; border-radius:10px; overflow:hidden;">
                            <div v-for="lbl in loadModalDossier.labels" :key="lbl" style="display:flex; align-items:center; gap:10px; padding:9px 12px; border-bottom:1px solid #f1f5f9;">
                                <template v-if="modalLabelContainer(lbl)">
                                    <span style="flex:1;"><span class="mono" style="font-size:12px;">{{ lbl }}</span> — <strong>{{ modalLabelDesc(lbl) }}</strong> <span style="color:#0369a1;">· 📦 chargé dans {{ modalLabelContainer(lbl) }}</span></span>
                                    <button type="button" style="background:#fee2e2; color:#b91c1c; border:none; padding:4px 12px; border-radius:6px; cursor:pointer; font-weight:600;" @click="unloadModalLabel(lbl)">Décharger</button>
                                </template>
                                <template v-else>
                                    <input type="checkbox" :value="lbl" v-model="loadModal.selected">
                                    <span style="flex:1;"><span class="mono" style="font-size:12px;">{{ lbl }}</span> — <strong>{{ modalLabelDesc(lbl) }}</strong> <span style="color:#16a34a;">· 🟢 disponible</span></span>
                                </template>
                            </div>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-top:16px; flex-wrap:wrap;">
                            <button type="button" style="padding:9px 16px; border:1px solid #cbd5e1; border-radius:8px; background:#fff; color:#334155; font-weight:600; cursor:pointer;" @click="closeLoadModal">Fermer</button>
                            <button type="button" :disabled="!loadModal.selected.length || !currentContainerName" style="padding:9px 18px; border:none; border-radius:8px; background:#16a34a; color:#fff; font-weight:700; cursor:pointer;" :style="{ opacity: (!loadModal.selected.length || !currentContainerName) ? .5 : 1 }" @click="loadModalSelected">✅ Charger ({{ loadModal.selected.length }}){{ currentContainerName ? ' dans ' + currentContainerName : '' }}</button>
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
                const livraisons = ref([]);
                const containers = ref([]);
                const selectedAvailableIds = ref([]);
                const activeTabId = ref(null);
                const leftSearch = ref('');
                const loadModal = ref({ open: false, dossierId: null, selected: [] }); // modale "charger sous-colis"
                const loadModalItems = ref([]); // items de la TRANSACTION du dossier ouvert (produit par sous-colis)
                const loadingLivraisons = ref(true);
                const loadingContainers = ref(true);

                let unsubLivraisons = null;
                let unsubContainers = null;

                const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
                const currentUserName = sessionStorage.getItem('userName') || 'Agent';

                const loadData = () => {
                    loadingLivraisons.value = true;
                    loadingContainers.value = true;
                    if (unsubLivraisons) unsubLivraisons();
                    if (unsubContainers) unsubContainers();

                    const contCol = getCollectionName("containers");
                    const livCol = getCollectionName("livraisons");
                    // Route SaaS (ex. containers_chine) : la collection est DÉJÀ
                    // isolée par route -> on NE filtre PAS par agency (certains
                    // docs n'ont pas ce champ -> sinon ils disparaissent).
                    // Collection de base partagée (paris/abidjan) : on garde le
                    // filtre agency pour séparer les 2.
                    const isRouteCol = contCol !== "containers";

                    const qCont = isRouteCol
                        ? query(collection(db, contCol))
                        : query(collection(db, contCol), where("agency", "==", activeAgency));
                    const qLiv = isRouteCol
                        ? query(collection(db, livCol))
                        : query(collection(db, livCol), where("agency", "==", activeAgency));

                    unsubContainers = onSnapshot(qCont, snap => {
                        containers.value = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(matchesShippingMode);
                        loadingContainers.value = false;
                    });

                    unsubLivraisons = onSnapshot(qLiv, snap => {
                        livraisons.value = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(matchesShippingMode);
                        loadingLivraisons.value = false;
                    });
                };

                onMounted(() => {
                    loadData();
                });

                onUnmounted(() => {
                    if (unsubLivraisons) unsubLivraisons();
                    if (unsubContainers) unsubContainers();
                });

                const activeContainers = computed(() => containers.value.filter(c => c.status === 'EN_CHARGEMENT'));
                
                watch(activeContainers, (newVal) => {
                    if (newVal.length > 0 && (!activeTabId.value || !newVal.find(c => c.id === activeTabId.value))) {
                        activeTabId.value = newVal[0].id;
                    } else if (newVal.length === 0) {
                        activeTabId.value = null;
                    }
                });

                // === SUIVI PAR SOUS-COLIS (étape 1) ===
                // Étiquettes d'un dossier (null si données anciennes sans `labels`).
                const piecesOf = (l) => (l.labels && l.labels.length) ? l.labels : null;
                const pieceTotal = (l) => { const p = piecesOf(l); return p ? p.length : (parseInt(l.quantite) || 1); };
                // Sous-colis chargés (scan CONTENEUR_CHARGEMENT). Gère l'ancien ajout
                // "global" (scanRef = réf du dossier => dossier entier chargé).
                const loadedInfo = (l) => {
                    const p = piecesOf(l);
                    const loads = (Array.isArray(l.scanHistory) ? l.scanHistory : []).filter(h => h && h.type === 'CONTENEUR_CHARGEMENT');
                    if (!p) return { whole: loads.length > 0, byLabel: new Map() };
                    let whole = false; const byLabel = new Map();
                    for (const h of loads) {
                        if (h.scanRef === l.ref) whole = true;
                        else if (p.includes(h.scanRef)) byLabel.set(h.scanRef, h.container || l.conteneur || '');
                    }
                    return { whole, byLabel };
                };
                const loadedCount = (l) => { const i = loadedInfo(l); return i.whole ? pieceTotal(l) : i.byLabel.size; };
                const availableCount = (l) => Math.max(0, pieceTotal(l) - loadedCount(l));
                const loadedInContainer = (l, cont) => {
                    const i = loadedInfo(l);
                    if (i.whole) return (l.conteneur === cont) ? pieceTotal(l) : 0;
                    let n = 0; for (const c of i.byLabel.values()) if (c === cont) n++;
                    return n;
                };

                const availableLivraisons = computed(() => {
                    // Un dossier reste DISPONIBLE tant qu'il lui reste des sous-colis
                    // non chargés (il ne disparaît qu'à 0 disponible).
                    let avail = livraisons.value.filter(l => availableCount(l) > 0);
                    const search = leftSearch.value.toLowerCase().trim();
                    if (search) {
                        avail = avail.filter(l => 
                            (l.ref || '').toLowerCase().includes(search) || 
                            (l.destinataire || '').toLowerCase().includes(search) ||
                            (l.expediteur || '').toLowerCase().includes(search)
                        );
                    }
                    return avail;
                });

                const currentContainer = computed(() => activeContainers.value.find(c => c.id === activeTabId.value));
                const currentContainerName = computed(() => currentContainer.value ? (currentContainer.value.number || currentContainer.value.id) : '');
                
                const currentContainerItems = computed(() => {
                    if (!currentContainerName.value) return [];
                    // Dossiers ayant au moins un sous-colis chargé dans CE conteneur.
                    return livraisons.value.filter(l => loadedInContainer(l, currentContainerName.value) > 0);
                });

                const currentContainerTotalColis = computed(() => {
                    return currentContainerItems.value.reduce((sum, l) => sum + loadedInContainer(l, currentContainerName.value), 0);
                });
                // CBM chargé = volume du dossier (volumeCBM) au prorata des sous-colis
                // réellement chargés dans CE conteneur. Capacité standard = 68 CBM.
                const currentContainerCbm = computed(() => {
                    const code = currentContainerName.value;
                    if (!code) return 0;
                    return currentContainerItems.value.reduce((sum, l) => {
                        const vol = parseFloat(l.volumeCBM) || 0;
                        const tot = pieceTotal(l) || 1;
                        return sum + vol * (loadedInContainer(l, code) / tot);
                    }, 0);
                });

                const currentContainerTotalCA = computed(() => {
                    return currentContainerItems.value.reduce((sum, item) => {
                        return sum + (parseFloat(String(item.prixOriginal || item.montant || '0').replace(/[^\d]/g, '')) || 0);
                    }, 0);
                });
                // CA affiché : on ne convertit (÷656) QUE pour Paris (€).
                // Chine/Abidjan = CFA -> diviseur 1 (sinon montant ÷656 en CFA).
                const currentContainerCADisplay = computed(() =>
                    currentContainerTotalCA.value / (isEurAgency() ? 656 : 1));

                const registeredContainers = computed(() => containers.value.filter(c => c.status === 'EN_ATTENTE_BATEAU'));

                const formatMoney = (amount) => globalApp.formatMoney(amount);
                const formatDate = (dateString) => dateString ? new Date(dateString).toLocaleString('fr-FR') : '-';

                const getContainerItemsCount = (c) => livraisons.value.filter(l => loadedInContainer(l, c.number || c.id) > 0).length;
                const getContainerColisCount = (c) => livraisons.value.reduce((sum, l) => sum + loadedInContainer(l, c.number || c.id), 0);

                // === Modale "Choisir les sous-colis à charger" ===
                // Étiquette -> produit (depuis les lignes de la facture).
                // Étiquette -> produit, depuis les LIGNES (items) de la TRANSACTION
                // (chargées à l'ouverture de la modale). La livraison n'a que la
                // description GLOBALE -> ancien bug (toute la facture sur chaque colis).
                const modalDescMap = computed(() => {
                    const l = loadModalDossier.value;
                    if (!l) return {};
                    const items = (loadModalItems.value && loadModalItems.value.length) ? loadModalItems.value : (Array.isArray(l.items) ? l.items : []);
                    const labels = l.labels || [];
                    const map = {}; let idx = 0;
                    items.forEach(it => { const q = parseInt(it.qty) || 1; for (let k = 0; k < q && idx < labels.length; k++) { map[labels[idx]] = it.desc || 'Colis'; idx++; } });
                    return map;
                });
                const loadModalDossier = computed(() => livraisons.value.find(l => l.id === loadModal.value.dossierId) || null);
                const modalLabelContainer = (lbl) => {
                    const l = loadModalDossier.value; if (!l) return '';
                    const info = loadedInfo(l);
                    if (info.whole) return l.conteneur || '?';
                    return info.byLabel.get(lbl) || '';
                };
                const modalLabelDesc = (lbl) => modalDescMap.value[lbl] || 'Colis';
                const modalAvailableLabels = computed(() => {
                    const l = loadModalDossier.value; if (!l) return [];
                    return (l.labels || []).filter(lbl => !modalLabelContainer(lbl));
                });
                const openLoadModal = async (id) => {
                    loadModal.value = { open: true, dossierId: id, selected: [] };
                    loadModalItems.value = [];
                    const l = livraisons.value.find(x => x.id === id);
                    if (l && l.ref) {
                        try {
                            const sT = await getDocs(query(collection(db, getCollectionName("transactions")), where('reference', '==', l.ref), limit(1)));
                            if (!sT.empty) loadModalItems.value = sT.docs[0].data().items || [];
                        } catch (_) { /* items indisponibles -> 'Colis' */ }
                    }
                };
                const closeLoadModal = () => { loadModal.value.open = false; };
                const modalSelectAll = (sel) => { loadModal.value.selected = sel ? modalAvailableLabels.value.slice() : []; };
                const loadModalSelected = async () => {
                    const l = loadModalDossier.value;
                    if (!l || !currentContainerName.value || !loadModal.value.selected.length) return;
                    const cont = currentContainerName.value;
                    const nowIso = new Date().toISOString();
                    const entries = loadModal.value.selected.map(lbl => ({ scanRef: lbl, date: nowIso, type: 'CONTENEUR_CHARGEMENT', container: cont, manual: true }));
                    try {
                        await updateDoc(doc(db, getCollectionName("livraisons"), l.id), {
                            conteneur: l.conteneur || cont, containerStatus: 'A_VENIR', scanHistory: arrayUnion(...entries)
                        });
                        globalApp.showToast(`${entries.length} sous-colis chargé(s) dans ${cont}.`, "success");
                        loadModal.value.selected = [];
                    } catch (e) { globalApp.showToast("Erreur lors du chargement.", "error"); }
                };
                const unloadModalLabel = async (lbl) => {
                    const l = loadModalDossier.value; if (!l) return;
                    const hist = Array.isArray(l.scanHistory) ? l.scanHistory : [];
                    const newHist = hist.filter(h => !(h && h.type === 'CONTENEUR_CHARGEMENT' && (h.scanRef === lbl || h.scanRef === l.ref)));
                    const stillLoaded = newHist.some(h => h && h.type === 'CONTENEUR_CHARGEMENT');
                    const upd = { scanHistory: newHist };
                    if (!stillLoaded) { upd.containerStatus = 'PARIS'; upd.conteneur = ''; }
                    try { await updateDoc(doc(db, getCollectionName("livraisons"), l.id), upd); globalApp.showToast("Sous-colis déchargé.", "info"); }
                    catch (e) { globalApp.showToast("Erreur lors du déchargement.", "error"); }
                };

                const toggleItemSelection = (id) => {
                    const index = selectedAvailableIds.value.indexOf(id);
                    if (index > -1) selectedAvailableIds.value.splice(index, 1);
                    else selectedAvailableIds.value.push(id);
                };

                const selectAllLeft = (select) => {
                    if (select) {
                        selectedAvailableIds.value = availableLivraisons.value.map(l => l.id);
                    } else {
                        selectedAvailableIds.value = [];
                    }
                };

                const addSelectedToContainer = async () => {
                    if (selectedAvailableIds.value.length === 0 || !activeTabId.value || !currentContainerName.value) return;

                    const cont = currentContainerName.value;
                    const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
                    const agent = sessionStorage.getItem('userName') || 'Agent';
                    // Dossiers sélectionnés (objets) pour récupérer leur réf.
                    const selected = availableLivraisons.value.filter(l => selectedAvailableIds.value.includes(l.id));
                    const nowIso = new Date().toISOString();

                    const batch = writeBatch(db);
                    selected.forEach(l => {
                        const p = piecesOf(l);
                        if (!p) {
                            // Données anciennes sans étiquettes -> ajout global (1 entrée).
                            batch.update(doc(db, getCollectionName("livraisons"), l.id), {
                                conteneur: l.conteneur || cont, containerStatus: 'A_VENIR',
                                scanHistory: arrayUnion({ scanRef: l.ref || l.id, date: nowIso, type: 'CONTENEUR_CHARGEMENT', container: cont, manual: true })
                            });
                            return;
                        }
                        // Bouton "Ajouter" = charge TOUT le disponible (le précis se fait
                        // dans la modale "Choisir les sous-colis").
                        const info = loadedInfo(l);
                        if (info.whole) return; // déjà tout chargé (ancien ajout global)
                        const toLoad = p.filter(lbl => lbl !== l.ref && !info.byLabel.has(lbl));
                        if (!toLoad.length) return;
                        const entries = toLoad.map(lbl => ({ scanRef: lbl, date: nowIso, type: 'CONTENEUR_CHARGEMENT', container: cont, manual: true }));
                        batch.update(doc(db, getCollectionName("livraisons"), l.id), {
                            conteneur: l.conteneur || cont, containerStatus: 'A_VENIR',
                            scanHistory: arrayUnion(...entries)
                        });
                    });

                    try {
                        await batch.commit();
                        // Comme le scan : maj de la caisse (transaction) +
                        // entrée dans l'historique des scans (scan_logs), par dossier.
                        for (const l of selected) {
                            try {
                                if (l.ref) {
                                    const qT = query(collection(db, getCollectionName("transactions")), where('reference', '==', l.ref), limit(1));
                                    const sT = await getDocs(qT);
                                    if (!sT.empty) {
                                        await updateDoc(doc(db, getCollectionName("transactions"), sT.docs[0].id), { conteneur: cont });
                                    }
                                }
                            } catch (e) { /* non bloquant */ }
                            addDoc(collection(db, 'scan_logs'), {
                                scanRef: l.ref || l.id,
                                date: nowIso,
                                type: 'CONTENEUR_CHARGEMENT',
                                agent,
                                agency: activeAgency,
                                container: cont,
                                status: 'SUCCES',
                                manual: true,
                                modeExpedition: sessionStorage.getItem('shippingMode') || 'maritime'
                            }).catch(e => console.error("Log scan (ajout manuel):", e));
                        }
                        globalApp.showToast(`Sous-colis chargés dans le conteneur ${cont}.`, "success");
                        selectedAvailableIds.value = [];
                    } catch(e) {
                        globalApp.showToast("Erreur lors de l'ajout.", "error");
                    }
                };

                const removeFromContainer = async (id) => {
                    const l = livraisons.value.find(x => x.id === id);
                    if (!l) return;
                    const cont = currentContainerName.value;
                    // On retire les sous-colis chargés dans CE conteneur (+ ancien ajout global).
                    const newHist = (Array.isArray(l.scanHistory) ? l.scanHistory : []).filter(h =>
                        !(h && h.type === 'CONTENEUR_CHARGEMENT' && (h.container === cont || h.scanRef === l.ref)));
                    const stillLoaded = newHist.some(h => h && h.type === 'CONTENEUR_CHARGEMENT');
                    const upd = { scanHistory: newHist };
                    if (!stillLoaded) { upd.containerStatus = 'PARIS'; upd.conteneur = ''; }
                    try {
                        await updateDoc(doc(db, getCollectionName("livraisons"), id), upd);
                        globalApp.showToast("Sous-colis retirés du conteneur.", "info");
                    } catch(e) {
                        globalApp.showToast("Erreur lors du retrait.", "error");
                    }
                };

                const emptyActiveContainer = async () => {
                    if (!activeTabId.value || !currentContainerName.value) return;
                    if (window.AppModal) {
                        if (!await window.AppModal.confirm("Voulez-vous vraiment vider entièrement ce conteneur ?", "Vider le conteneur", true)) return;
                    } else if (!confirm("Vider le conteneur ?")) return;

                    const cont = currentContainerName.value;
                    const batch = writeBatch(db);
                    currentContainerItems.value.forEach(l => {
                        const newHist = (Array.isArray(l.scanHistory) ? l.scanHistory : []).filter(h =>
                            !(h && h.type === 'CONTENEUR_CHARGEMENT' && (h.container === cont || h.scanRef === l.ref)));
                        const stillLoaded = newHist.some(h => h && h.type === 'CONTENEUR_CHARGEMENT');
                        const upd = { scanHistory: newHist };
                        if (!stillLoaded) { upd.containerStatus = 'PARIS'; upd.conteneur = ''; }
                        batch.update(doc(db, getCollectionName("livraisons"), l.id), upd);
                    });

                    await batch.commit();
                    globalApp.showToast("Conteneur vidé.", "success");
                };

                const registerContainer = async () => {
                    if (!activeTabId.value || !currentContainerName.value) return;
                    
                    if (currentContainerItems.value.length === 0) {
                        globalApp.showToast("Le conteneur est vide.", "error");
                        return;
                    }

                    const ctnName = currentContainerName.value;

                    if (window.AppModal) {
                        if (!await window.AppModal.confirm(`Verrouiller et enregistrer le conteneur ${ctnName} avec ses ${currentContainerItems.value.length} dossiers ?\n\nIl passera en attente de départ (bateau) et un NOUVEAU conteneur sera automatiquement activé pour les prochaines factures.`, "Enregistrer le conteneur")) return;
                    } else if (!confirm(`Verrouiller et enregistrer le conteneur ${ctnName} avec ses ${currentContainerItems.value.length} dossiers ?`)) return;

                    try {
                        await updateDoc(doc(db, getCollectionName("containers"),activeTabId.value), {
                            status: 'EN_ATTENTE_BATEAU',
                            registeredAt: new Date().toISOString()
                        });

                        let nextCtnName = ctnName;
                        const match = ctnName.match(/^(.*?)(\d+)$/);
                        if (match) {
                            const prefix = match[1];
                            const numStr = match[2];
                            const nextNum = parseInt(numStr, 10) + 1;
                            nextCtnName = prefix + String(nextNum).padStart(numStr.length, '0');
                        } else {
                            nextCtnName = ctnName + "-SUIVANT";
                        }

                        const activeAgencyVal = sessionStorage.getItem('currentActiveAgency') || 'paris';
                        await setDoc(doc(db, "settings", `container_config_${activeAgencyVal}`), { activeContainer: nextCtnName }, { merge: true });

                        globalApp.showToast(`Conteneur ${ctnName} enregistré ! Le nouveau conteneur en cours est ${nextCtnName}.`, "success");
                        activeTabId.value = null;
                    } catch(e) {
                        console.error(e);
                        globalApp.showToast("Erreur lors de l'enregistrement.", "error");
                    }
                };

                return {
                    livraisons, containers, selectedAvailableIds, activeTabId, leftSearch,
                    loadingLivraisons, loadingContainers, availableLivraisons, activeContainers,
                    currentContainer, currentContainerName, currentContainerItems, currentContainerTotalColis, currentContainerCbm,
                    stageBadge: containerStageBadgeHtml,
                    currentContainerTotalCA, currentContainerCADisplay, registeredContainers, currentUserName,
                    formatDate, formatMoney, getContainerItemsCount, getContainerColisCount,
                    toggleItemSelection, selectAllLeft, addSelectedToContainer, removeFromContainer,
                    emptyActiveContainer, registerContainer, loadData, globalApp,
                    availableCount, loadedCount, loadedInContainer, pieceTotal,
                    loadModal, loadModalDossier, modalLabelContainer, modalLabelDesc, modalAvailableLabels,
                    openLoadModal, closeLoadModal, modalSelectAll, loadModalSelected, unloadModalLabel
                };
            }
        });

        this.vueApp.mount('#vue-confection-conteneurs-app');
    }
};