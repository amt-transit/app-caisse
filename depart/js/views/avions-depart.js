import { db } from '../../../firebase-config.js';
import { collection, query, onSnapshot, doc, setDoc, updateDoc, writeBatch, deleteDoc, deleteField, where } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { createApp, ref, reactive, computed, onMounted, onUnmounted } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";
import { getCollectionName } from '../../../agencies-config.js';

// AVION DÉPART (mode Aérien) — remplace « Bateaux départ ».
// Flux : le scan « Départ vol » (scan inversé) marque les colis restés à
// embarquer en statut « En vol » (containerStatus = A_VENIR). Cette page liste
// TOUS les colis « En vol » non encore affectés à un vol, et permet de
// VALIDER LE DÉPART d'un vol en enregistrant ses informations (N° de vol,
// compagnie, dates, N° LTA) + le poids total embarqué (calculé). L'arrivée à
// destination n'est PAS gérée ici (elle se fait au scan de réception Abidjan).
export const AvionsDepartView = {
    vueApp: null,

    render(app) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.avionsDepart = this;

        const html = `
            <style>
                .al__btn { padding: 10px 16px; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer; transition: 0.2s; border: 1px solid transparent; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
                .al__btn--primary { background: #3b82f6; color: white; box-shadow: 0 2px 4px rgba(59,130,246,0.2); }
                .al__btn--primary:hover { background: #2563eb; }
                .al__btn--ghost { background: white; border-color: #cbd5e1; color: #475569; }
                .al__btn--ghost:hover { background: #f1f5f9; color: #0f172a; }
                .al__btn--sm { padding: 6px 12px; font-size: 12px; }
                .al__btn:disabled { opacity: 0.55; cursor: not-allowed; }
                .departs-page { max-width: 1400px; margin: 0 auto; animation: fadeIn 0.3s ease; }
                .departs-header { background: white; border-radius: 16px; padding: 20px 25px; margin-bottom: 20px; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
                .departs-header__content { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 15px; }
                .departs-header__left { display: flex; align-items: center; gap: 15px; }
                .departs-header__icon { font-size: 28px; background: linear-gradient(135deg, #1A3553, #E51F21); color: #fff; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; border-radius: 12px; }
                .departs-header__title { margin: 0; font-size: 20px; font-weight: 800; color: #0f172a; }
                .departs-header__subtitle { margin: 2px 0 0 0; font-size: 13px; color: #64748b; }

                .panel { background: white; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 2px 4px rgba(0,0,0,0.02); margin-bottom: 20px; }
                .panel__header { padding: 15px 20px; display: flex; justify-content: space-between; align-items: center; color: white; }
                .panel__header--navy { background: #1A3553; }
                .panel__header--green { background: #10b981; }
                .panel__title { margin: 0; font-size: 16px; font-weight: 700; display: flex; align-items: center; gap: 10px; }
                .badge { background: rgba(255,255,255,0.25); padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; }
                .panel__body { background: #f8fafc; padding: 15px; max-height: 520px; overflow-y: auto; }

                .colis-list { display: flex; flex-direction: column; gap: 10px; }
                .colis-item { display: flex; align-items: center; padding: 12px 15px; background: white; border: 1px solid #e2e8f0; border-radius: 10px; gap: 12px; }
                .colis-item__info { flex: 1; }
                .colis-item__ref { margin-bottom: 6px; }
                .mono { font-family: monospace; font-weight: 800; color: #0f172a; font-size: 15px; }
                .colis-item__meta { display: flex; gap: 8px; flex-wrap: wrap; }
                .meta-tag { font-size: 11px; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; color: #475569; font-weight: 600; }
                .meta-tag--date { color: #0369a1; background: #e0f2fe; }
                .meta-tag--kg { color: #b91c1c; background: #fee2e2; }
                .colis-item__dest { font-size: 12px; color: #475569; font-weight: 600; margin-top: 4px; }

                .validate-bar { display: flex; align-items: center; justify-content: space-between; gap: 15px; flex-wrap: wrap; background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 15px 20px; margin-bottom: 20px; }
                .validate-bar__totals { display: flex; gap: 25px; flex-wrap: wrap; }
                .validate-bar__stat { display: flex; flex-direction: column; }
                .validate-bar__stat .label { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; }
                .validate-bar__stat .value { font-size: 20px; font-weight: 900; color: #1A3553; }
                .btn-validate { background: linear-gradient(135deg, #1A3553, #E51F21); color: white; border: none; padding: 12px 22px; border-radius: 10px; font-weight: 800; font-size: 14px; cursor: pointer; display: flex; align-items: center; gap: 8px; }
                .btn-validate:disabled { opacity: 0.5; cursor: not-allowed; }

                .table-wrap { overflow-x: auto; }
                .reg-table { width: 100%; border-collapse: collapse; }
                .reg-table th { text-align: left; padding: 12px 15px; background: white; font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; }
                .reg-table td { padding: 12px 15px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #334155; vertical-align: middle; }
                .status-badge { padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; background: #e0f2fe; color: #0284c7; }

                .bd-modal { display:none; position:fixed; z-index:9999; left:0; top:0; width:100%; height:100%; background:rgba(15,23,42,0.6); backdrop-filter: blur(4px); align-items:center; justify-content:center; }
                .bd-modal.active { display:flex; }
                .bd-modal-box { background: white; border-radius: 16px; width: 90%; max-width: 520px; overflow: hidden; }
                .bd-modal-header { padding: 18px 20px; border-bottom: 1px solid #e2e8f0; background: #1A3553; color: white; display: flex; justify-content: space-between; align-items: center; }
                .bd-modal-title { margin: 0; font-size: 17px; font-weight: 800; }
                .bd-modal-body { padding: 20px; }
                .bd-modal-footer { padding: 18px 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 10px; background: #f8fafc; }
                .vol-summary { background: #f1f5f9; border-radius: 10px; padding: 12px 15px; margin-bottom: 18px; display: flex; gap: 25px; }
                .vol-summary .label { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; }
                .vol-summary .value { font-size: 18px; font-weight: 900; color: #1A3553; }
                .form-label { font-size: 12px; font-weight: 600; color: #475569; display: block; margin-bottom: 6px; }
                .form-input { width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; }
            </style>

            <div id="vue-avions-depart" class="departs-page" v-cloak>
                <div class="departs-header">
                    <div class="departs-header__content">
                        <div class="departs-header__left">
                            <div class="departs-header__icon">✈️</div>
                            <div>
                                <h1 class="departs-header__title">Avions Départs</h1>
                                <p class="departs-header__subtitle">{{ totalPieces }} colis en vol ({{ enVol.length }} dossier(s)) à valider — {{ regFlights.length }} vol(s) enregistré(s)</p>
                            </div>
                        </div>
                        <div class="departs-header__actions">
                            <button class="al__btn al__btn--ghost" type="button" @click="loadData"><i class="fas fa-sync-alt"></i> Rafraîchir</button>
                        </div>
                    </div>
                </div>

                <!-- BARRE DE VALIDATION -->
                <div class="validate-bar">
                    <div class="validate-bar__totals">
                        <div class="validate-bar__stat">
                            <span class="label">Dossiers en vol</span>
                            <span class="value">{{ enVol.length }}</span>
                        </div>
                        <div class="validate-bar__stat">
                            <span class="label">Colis (pièces)</span>
                            <span class="value">{{ totalPieces }}</span>
                        </div>
                        <div class="validate-bar__stat">
                            <span class="label">Poids total</span>
                            <span class="value">{{ totalWeight.toFixed(1) }} kg</span>
                        </div>
                    </div>
                    <button class="btn-validate" type="button" :disabled="totalPieces === 0" @click="openFlightModal()">✈️ Valider le vol</button>
                </div>

                <!-- COLIS EMBARQUÉS (par sous-colis) -->
                <div class="panel">
                    <div class="panel__header panel__header--navy">
                        <h2 class="panel__title"><span>🧳</span> Colis embarqués (à valider) <span class="badge">{{ totalPieces }}</span></h2>
                    </div>
                    <div class="panel__body">
                        <div class="colis-list">
                            <div v-if="loading" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>
                            <div v-else-if="enVolPieces.length === 0" style="text-align: center; padding: 30px; color: #64748b;">Aucun colis embarqué à valider. Utilisez d'abord le scan « Départ vol ».</div>
                            <div v-else v-for="p in enVolPieces" :key="p.sousRef" class="colis-item">
                                <div class="colis-item__info">
                                    <div class="colis-item__ref"><span class="mono">{{ p.sousRef }}</span></div>
                                    <div class="colis-item__meta">
                                        <span class="meta-tag">🏷️ {{ p.desc }}</span>
                                        <span class="meta-tag meta-tag--kg">⚖ {{ (parseFloat(p.poids) || 0).toFixed(1) }} kg</span>
                                        <span class="meta-tag">📄 {{ p.livRef }}</span>
                                    </div>
                                    <div class="colis-item__dest">👤 {{ p.destinataire || '-' }}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- VOLS ENREGISTRÉS -->
                <div class="panel">
                    <div class="panel__header panel__header--green">
                        <h2 class="panel__title"><span>✅</span> Vols enregistrés <span class="badge">{{ regFlights.length }}</span></h2>
                    </div>
                    <div class="panel__body" style="padding: 0; background: white;">
                        <div class="table-wrap">
                            <table class="reg-table">
                                <thead>
                                    <tr><th>N° de vol</th><th>Compagnie</th><th>Départ</th><th>Arrivée prévue</th><th>N° LTA</th><th style="text-align:center;">Colis</th><th style="text-align:right;">Poids</th><th>Enregistré le</th><th style="text-align:center;">Statut</th><th style="text-align:right;">Action</th></tr>
                                </thead>
                                <tbody>
                                    <tr v-if="loading"><td colspan="10" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</td></tr>
                                    <tr v-else-if="regFlights.length === 0"><td colspan="10" style="text-align: center; padding: 40px; color: #64748b;">Aucun vol enregistré pour le moment.</td></tr>
                                    <tr v-else v-for="f in regFlights" :key="f.id">
                                        <td class="mono" style="font-weight: 800;">{{ f.flightNumber || f.reference }}</td>
                                        <td>{{ f.airline || '-' }}</td>
                                        <td class="mono">{{ formatDate(f.departureDate) }}</td>
                                        <td class="mono">{{ formatDate(f.arrivalDate) }}</td>
                                        <td class="mono">{{ f.awb || '-' }}</td>
                                        <td style="text-align:center;">{{ f.parcelCount || 0 }}</td>
                                        <td style="text-align:right; font-weight:700;">{{ (f.totalWeight || 0).toFixed(1) }} kg</td>
                                        <td class="mono">{{ formatDate(f.registeredAt) }}</td>
                                        <td style="text-align:center;"><span class="status-badge" :style="f.status === 'ARRIVE' ? 'background:#dcfce7; color:#166534;' : ''">{{ f.status === 'ARRIVE' ? '✅ Arrivé' : '🛫 Parti' }}</span></td>
                                        <td style="text-align:right;">
                                            <div style="display:flex; gap:6px; justify-content:flex-end;">
                                                <button class="al__btn al__btn--ghost" @click="openDetail(f)" title="Voir les colis de ce vol">👁️ Voir les colis</button>
                                                <button v-if="f.status !== 'ARRIVE'" class="al__btn al__btn--ghost" style="color:#ef4444;" @click="cancelFlight(f.id)" title="Annuler le vol (les colis redeviennent à valider)">↩ Annuler</button>
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- MODAL DÉTAIL COLIS D'UN VOL -->
                <div class="bd-modal" :class="{ active: !!detail }">
                    <div class="bd-modal-box" v-if="detail" style="max-width: 640px;">
                        <div class="bd-modal-header">
                            <h2 class="bd-modal-title">✈️ Colis du vol {{ detail.flightNumber || detail.reference }}</h2>
                            <button @click="detail = null" style="background:none; border:none; font-size:24px; cursor:pointer; color:#fff;">&times;</button>
                        </div>
                        <div class="bd-modal-body" style="max-height:70vh; overflow-y:auto;">
                            <div class="vol-summary" style="margin-bottom:14px;">
                                <div><div class="label">Compagnie</div><div class="value" style="font-size:14px;">{{ detail.airline || '-' }}</div></div>
                                <div><div class="label">Colis</div><div class="value">{{ detail.pieceCount || 0 }}</div></div>
                                <div><div class="label">Poids total</div><div class="value">{{ (detail.totalWeight || 0).toFixed(1) }} kg</div></div>
                            </div>
                            <table class="reg-table">
                                <thead><tr><th>Sous-colis</th><th>Nature</th><th>Dossier</th><th>Destinataire</th><th style="text-align:right;">Poids</th><th style="text-align:center;">Statut</th></tr></thead>
                                <tbody>
                                    <tr v-for="p in flightPieces(detail)" :key="p.sousRef">
                                        <td class="mono" style="font-weight:700;">{{ p.sousRef }}</td>
                                        <td>{{ p.desc || '-' }}</td>
                                        <td class="mono">{{ p.livRef }}</td>
                                        <td>{{ p.destinataire || '-' }}</td>
                                        <td style="text-align:right;">{{ (parseFloat(p.poids)||0).toFixed(1) }} kg</td>
                                        <td style="text-align:center;"><span class="status-badge" :style="pieceStatusStyle(p)">{{ pieceStatus(p) }}</span></td>
                                    </tr>
                                    <tr v-if="flightPieces(detail).length === 0"><td colspan="6" style="text-align:center; color:#94a3b8; padding:20px;">Aucun colis embarqué sur ce vol.</td></tr>
                                </tbody>
                            </table>
                        </div>
                        <div class="bd-modal-footer">
                            <button class="al__btn al__btn--ghost" @click="detail = null">Fermer</button>
                        </div>
                    </div>
                </div>

                <!-- MODAL VALIDATION VOL -->
                <div class="bd-modal" :class="{ active: showModal }">
                    <div class="bd-modal-box">
                        <div class="bd-modal-header">
                            <h2 class="bd-modal-title">✈️ Valider le vol</h2>
                            <button @click="closeFlightModal" style="background:none; border:none; font-size:24px; cursor:pointer; color:#fff;">&times;</button>
                        </div>
                        <div class="bd-modal-body">
                            <div class="vol-summary">
                                <div>
                                    <div class="label">Colis embarqués</div>
                                    <div class="value">{{ totalPieces }}</div>
                                </div>
                                <div>
                                    <div class="label">Poids total</div>
                                    <div class="value">{{ totalWeight.toFixed(1) }} kg</div>
                                </div>
                            </div>
                            <div class="form-group" style="margin-bottom: 15px;">
                                <label class="form-label">N° de vol *</label>
                                <input type="text" v-model="flightForm.flightNumber" class="form-input" placeholder="Ex: AF703">
                            </div>
                            <div class="form-group" style="margin-bottom: 15px;">
                                <label class="form-label">Compagnie aérienne *</label>
                                <input type="text" v-model="flightForm.airline" class="form-input" placeholder="Ex: Air France">
                            </div>
                            <div style="display: flex; gap: 15px; margin-bottom: 15px;">
                                <div class="form-group" style="flex: 1;">
                                    <label class="form-label">Date de départ</label>
                                    <input type="date" v-model="flightForm.departureDate" class="form-input">
                                </div>
                                <div class="form-group" style="flex: 1;">
                                    <label class="form-label">Date d'arrivée prévue</label>
                                    <input type="date" v-model="flightForm.arrivalDate" class="form-input">
                                </div>
                            </div>
                            <div class="form-group">
                                <label class="form-label">N° LTA (AWB)</label>
                                <input type="text" v-model="flightForm.awb" class="form-input" placeholder="Ex: 057-12345678">
                            </div>
                        </div>
                        <div class="bd-modal-footer">
                            <button class="al__btn al__btn--ghost" @click="closeFlightModal">Annuler</button>
                            <button class="al__btn al__btn--primary" @click="validateFlight" :disabled="saving"><i class="fas fa-plane-departure"></i> Valider le départ</button>
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
                const livraisons = ref([]);
                const flights = ref([]);
                const transactions = ref([]);
                const loading = ref(true);
                const saving = ref(false);
                const showModal = ref(false);

                const flightForm = reactive({
                    flightNumber: '',
                    airline: '',
                    departureDate: '',
                    arrivalDate: '',
                    awb: ''
                });

                let unsubLiv = null;
                let unsubFlights = null;
                let unsubTrans = null;

                // Helpers
                const formatDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '-';
                const pieceCount = (l) => (l.labels && l.labels.length) ? l.labels.length : (parseInt(l.quantite) || 1);

                // Poids facturé d'un colis = max(poids réel, poids volume) si mode
                // « poids/volume », sinon poids réel saisi (même logique que la facture).
                const aBilledKg = (it) => {
                    const real = parseFloat(it.poids) || 0;
                    const vol = ((parseFloat(it.lng) || 0) * (parseFloat(it.lrg) || 0) * (parseFloat(it.haut) || 0)) / 5000;
                    return (it.mode === 'poids') ? Math.max(real, vol) : real;
                };
                // Cartes label -> description / poids, reconstruites depuis les
                // lignes (items) de la transaction du dossier (1 ligne × qté = N
                // sous-colis), comme pour l'impression des étiquettes.
                const pieceMapsOf = (livRef) => {
                    const t = transactions.value.find(x => x.reference === livRef && !x.isDeleted);
                    const descMap = {}, kgMap = {};
                    if (t && Array.isArray(t.items)) {
                        let idx = 1;
                        t.items.forEach(it => {
                            const q = parseInt(it.qty) || 1;
                            const kg = aBilledKg(it);
                            for (let i = 0; i < q; i++) { descMap[idx] = it.desc; kgMap[idx] = kg; idx++; }
                        });
                    }
                    return { descMap, kgMap };
                };
                // Sous-colis RÉELLEMENT embarqués d'un dossier : ceux dont le
                // dernier scan est « Départ vol » (DEPART_VOL). Chacun porte son
                // propre poids — on ne compte plus le poids total du dossier.
                const embarkedPiecesOf = (liv) => {
                    const labels = (liv.labels && liv.labels.length) ? liv.labels : [liv.ref];
                    const { descMap, kgMap } = pieceMapsOf(liv.ref);
                    const hist = Array.isArray(liv.scanHistory) ? liv.scanHistory : [];
                    const totalDossier = labels.length;
                    const out = [];
                    labels.forEach((lbl, idx) => {
                        const myScans = hist.filter(s => s.scanRef === lbl).sort((a, b) => new Date(b.date) - new Date(a.date));
                        let embarked;
                        if (myScans.length > 0) embarked = myScans[0].type === 'DEPART_VOL';
                        else embarked = liv.containerStatus === 'A_VENIR'; // pas de suivi par pièce -> repli dossier
                        if (!embarked) return;
                        const m = lbl.match(/_(\d+)_/);
                        const li = m ? parseInt(m[1]) : (idx + 1);
                        let poids = kgMap[li];
                        if (poids === undefined || poids === null) poids = (parseFloat(liv.poids) || 0) / (totalDossier || 1);
                        out.push({
                            sousRef: lbl,
                            desc: descMap[li] || liv.description || 'Colis',
                            poids: poids,
                            livId: liv.id,
                            livRef: liv.ref,
                            destinataire: liv.destinataire || ''
                        });
                    });
                    return out;
                };

                // Dossiers « en vol » non encore affectés à un vol validé.
                const enVol = computed(() => livraisons.value
                    .filter(l => l.containerStatus === 'A_VENIR' && !l.flightId && !l.isDeleted)
                    .sort((a, b) => new Date(b.dateAjout || 0) - new Date(a.dateAjout || 0)));

                // Liste à plat des SOUS-COLIS embarqués (ce sont eux qui partent).
                const enVolPieces = computed(() => {
                    const arr = [];
                    enVol.value.forEach(l => embarkedPiecesOf(l).forEach(p => arr.push(p)));
                    return arr;
                });

                const totalPieces = computed(() => enVolPieces.value.length);
                const totalWeight = computed(() => enVolPieces.value.reduce((s, p) => s + (parseFloat(p.poids) || 0), 0));

                // Tous les vols (partis + arrivés) : la liste reste l'archive
                // complète des envois de l'agence de départ.
                const regFlights = computed(() => flights.value
                    .filter(f => f.status === 'ENREGISTRE' || f.status === 'ARRIVE')
                    .sort((a, b) => new Date(b.registeredAt || 0) - new Date(a.registeredAt || 0)));

                const detail = ref(null);
                const openDetail = (f) => { detail.value = f; };
                // Sous-colis du vol : on lit le « snapshot » figé à la validation
                // (immunisé contre les scans ultérieurs). Repli pour les anciens
                // vols sans snapshot : recalcul depuis les dossiers rattachés.
                const flightPieces = (f) => {
                    if (f && Array.isArray(f.pieces) && f.pieces.length) return f.pieces;
                    const arr = [];
                    livraisons.value.filter(l => l.flightId === f.id).forEach(l => embarkedPiecesOf(l).forEach(p => arr.push(p)));
                    return arr;
                };
                // Statut PAR PIÈCE : reçu si scan Déchargement de ce sous-colis.
                const pieceStatus = (p) => {
                    const liv = livraisons.value.find(l => l.id === p.livId || l.ref === p.livRef);
                    if (liv) {
                        if (liv.status === 'LIVRE') return 'Livré';
                        const hist = Array.isArray(liv.scanHistory) ? liv.scanHistory : [];
                        if (hist.some(h => h.scanRef === p.sousRef && h.type === 'DECHARGEMENT_ABIDJAN')) return 'Reçu (Abidjan)';
                    }
                    return 'En vol';
                };
                const pieceStatusStyle = (p) => {
                    const st = pieceStatus(p);
                    if (st === 'Livré') return 'background:#dcfce7; color:#166534;';
                    if (st === 'Reçu (Abidjan)') return 'background:#dbeafe; color:#1e40af;';
                    return 'background:#fef3c7; color:#b45309;';
                };

                const openFlightModal = () => {
                    if (enVol.value.length === 0) {
                        globalApp.showToast("Aucun colis en vol à valider.", "error");
                        return;
                    }
                    flightForm.flightNumber = '';
                    flightForm.airline = '';
                    flightForm.departureDate = '';
                    flightForm.arrivalDate = '';
                    flightForm.awb = '';
                    showModal.value = true;
                };

                const closeFlightModal = () => { showModal.value = false; };

                const validateFlight = async () => {
                    if (!flightForm.flightNumber.trim()) {
                        globalApp.showToast("Le N° de vol est obligatoire.", "error");
                        return;
                    }
                    if (!flightForm.airline.trim()) {
                        globalApp.showToast("La compagnie aérienne est obligatoire.", "error");
                        return;
                    }
                    const dossiers = enVol.value;          // dossiers à rattacher
                    const pieces = enVolPieces.value;      // sous-colis réellement embarqués
                    if (pieces.length === 0) {
                        globalApp.showToast("Aucun colis embarqué à valider.", "error");
                        return;
                    }

                    saving.value = true;
                    const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
                    try {
                        const batch = writeBatch(db);
                        const flightRef = doc(collection(db, getCollectionName("boats")));
                        const flightInfo = {
                            flightId: flightRef.id,
                            flightNumber: flightForm.flightNumber.trim(),
                            airline: flightForm.airline.trim(),
                            departureDate: flightForm.departureDate || null,
                            arrivalDate: flightForm.arrivalDate || null,
                            awb: flightForm.awb.trim() || null
                        };

                        const embarkedWeight = pieces.reduce((s, p) => s + (parseFloat(p.poids) || 0), 0);

                        batch.set(flightRef, {
                            ...flightInfo,
                            reference: flightForm.flightNumber.trim() || `VOL-${Date.now().toString().slice(-6)}`,
                            status: 'ENREGISTRE',
                            registeredAt: new Date().toISOString(),
                            totalWeight: embarkedWeight,             // poids des colis EMBARQUÉS
                            parcelCount: dossiers.length,            // nb de dossiers
                            pieceCount: pieces.length,               // nb de sous-colis embarqués
                            parcelRefs: dossiers.map(d => d.ref),
                            // Snapshot des sous-colis embarqués (réf, nature, poids)
                            // figé au moment du départ -> détail fiable plus tard.
                            pieces: pieces.map(p => ({ sousRef: p.sousRef, desc: p.desc, poids: p.poids, livRef: p.livRef, destinataire: p.destinataire })),
                            agency: activeAgency,
                            modeExpedition: 'aerien'
                        });

                        // On rattache chaque dossier au vol (il reste « En vol » /
                        // A_VENIR jusqu'à la réception à Abidjan).
                        dossiers.forEach(p => {
                            batch.update(doc(db, getCollectionName("livraisons"), p.id), { ...flightInfo });
                        });

                        await batch.commit();
                        showModal.value = false;
                        globalApp.showToast(`Vol ${flightInfo.flightNumber} validé : ${pieces.length} colis embarqué(s) (${embarkedWeight.toFixed(1)} kg).`, "success");
                    } catch (e) {
                        console.error('[avions-depart] validateFlight échec —', e);
                        const detail = (e && (e.code || e.message)) ? ` (${e.code || e.message})` : '';
                        globalApp.showToast(`Erreur lors de la validation du vol.${detail}`, "error");
                    } finally {
                        saving.value = false;
                    }
                };

                const cancelFlight = async (flightDocId) => {
                    const ok = await window.AppModal.confirm(
                        "Annuler ce vol ? Les colis redeviendront « à valider » et le vol sera supprimé.",
                        "Annuler le vol", true);
                    if (!ok) return;

                    try {
                        const batch = writeBatch(db);
                        const attached = livraisons.value.filter(l => l.flightId === flightDocId);
                        attached.forEach(l => {
                            batch.update(doc(db, getCollectionName("livraisons"), l.id), {
                                flightId: deleteField(),
                                flightNumber: deleteField(),
                                airline: deleteField(),
                                departureDate: deleteField(),
                                arrivalDate: deleteField(),
                                awb: deleteField()
                            });
                        });
                        batch.delete(doc(db, getCollectionName("boats"), flightDocId));
                        await batch.commit();
                        globalApp.showToast("Vol annulé. Les colis sont de nouveau à valider.", "info");
                    } catch (e) {
                        console.error('[avions-depart] cancelFlight échec —', e);
                        globalApp.showToast("Erreur lors de l'annulation du vol.", "error");
                    }
                };

                const loadData = () => {
                    if (unsubLiv) unsubLiv();
                    if (unsubFlights) unsubFlights();
                    loading.value = true;

                    const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
                    // Routes historiques (paris/abidjan) : la table _aerien est
                    // partagée -> on filtre par agence. Routes SaaS : table déjà
                    // isolée -> pas de filtre (sinon les docs sans `agency`
                    // disparaîtraient). 'all'/super_admin : pas de filtre.
                    const useAgencyFilter = (activeAgency === 'paris' || activeAgency === 'abidjan');
                    const livCol = getCollectionName("livraisons");
                    const boatCol = getCollectionName("boats");
                    const transCol = getCollectionName("transactions");
                    const qL = useAgencyFilter ? query(collection(db, livCol), where("agency", "==", activeAgency)) : query(collection(db, livCol));
                    const qF = useAgencyFilter ? query(collection(db, boatCol), where("agency", "==", activeAgency)) : query(collection(db, boatCol));
                    const qT = useAgencyFilter ? query(collection(db, transCol), where("agency", "==", activeAgency)) : query(collection(db, transCol));

                    unsubLiv = onSnapshot(qL, snap => {
                        livraisons.value = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                        loading.value = false;
                    }, err => { console.error('[avions-depart] livraisons —', err); loading.value = false; });

                    unsubFlights = onSnapshot(qF, snap => {
                        flights.value = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                    }, err => console.error('[avions-depart] vols —', err));

                    // Transactions : pour connaître le poids/nature PAR sous-colis.
                    unsubTrans = onSnapshot(qT, snap => {
                        transactions.value = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                    }, err => console.error('[avions-depart] transactions —', err));
                };

                onMounted(loadData);
                onUnmounted(() => {
                    if (unsubLiv) unsubLiv();
                    if (unsubFlights) unsubFlights();
                    if (unsubTrans) unsubTrans();
                });

                return {
                    livraisons, flights, transactions, loading, saving, showModal, flightForm,
                    enVol, enVolPieces, totalPieces, totalWeight, regFlights,
                    formatDate, pieceCount, embarkedPiecesOf,
                    detail, openDetail, flightPieces, pieceStatus, pieceStatusStyle,
                    openFlightModal, closeFlightModal, validateFlight, cancelFlight, loadData
                };
            }
        });

        const style = document.createElement('style');
        style.textContent = '[v-cloak] { display: none; }';
        document.head.appendChild(style);

        this.vueApp.mount('#vue-avions-depart');
    }
};
