import { db } from '../../../firebase-config.js';
import { collection, query, onSnapshot, doc, setDoc, updateDoc, deleteDoc, writeBatch, getDocs, where, deleteField } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { createApp, ref, reactive, computed, onMounted, onUnmounted } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";
import { getCollectionName } from '../../../agencies-config.js';

export const BateauxDepartView = {
    vueApp: null,

    render(app) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.bateauxDepart = this;

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
                .departs-header__icon { font-size: 28px; background: #e0f2fe; color: #0284c7; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; border-radius: 12px; }
                .departs-header__title { margin: 0; font-size: 20px; font-weight: 800; color: #0f172a; }
                .departs-header__subtitle { margin: 2px 0 0 0; font-size: 13px; color: #64748b; }

                .departs-grid { display: grid; grid-template-columns: 1fr 1.2fr; gap: 20px; margin-bottom: 20px; }
                @media (max-width: 992px) { .departs-grid { grid-template-columns: 1fr; } }

                .panel { background: white; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 2px 4px rgba(0,0,0,0.02); height: 650px; }
                .panel--bottom { grid-column: 1 / -1; height: auto; min-height: 300px; }
                
                .panel__header { padding: 15px 20px; display: flex; justify-content: space-between; align-items: center; color: white; }
                .panel__header--blue { background: #3b82f6; }
                .panel__header--navy { background: #1e293b; }
                .panel__header--green { background: #10b981; }
                .panel__title { margin: 0; font-size: 16px; font-weight: 700; display: flex; align-items: center; gap: 10px; }
                .badge { background: rgba(255,255,255,0.25); padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; }

                .panel__toolbar { padding: 15px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; display: flex; justify-content: space-between; align-items: center; gap: 15px; }
                .toolbar-actions { display: flex; gap: 8px; }
                .btn-sm { padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid transparent; transition: 0.2s; }
                .btn-sm--ghost { background: white; border-color: #cbd5e1; color: #475569; }
                .btn-sm--ghost:hover:not(:disabled) { background: #f1f5f9; color: #0f172a; }
                .btn-sm:disabled { opacity: 0.5; cursor: not-allowed; }
                
                .panel__body { flex: 1; overflow-y: auto; background: #f8fafc; padding: 15px; }

                .conteneur-list { display: flex; flex-direction: column; gap: 10px; }
                .conteneur-item { display: flex; align-items: center; padding: 12px 15px; background: white; border: 1px solid #e2e8f0; border-radius: 10px; gap: 12px; transition: 0.2s; cursor: pointer; }
                .conteneur-item:hover { border-color: #3b82f6; box-shadow: 0 2px 4px rgba(59,130,246,0.05); }
                .conteneur-item__check input { width: 18px; height: 18px; cursor: pointer; accent-color: #3b82f6; }
                .conteneur-item__info { flex: 1; }
                .conteneur-item__ref { margin-bottom: 6px; }
                .mono { font-family: monospace; font-weight: 800; color: #0f172a; font-size: 15px; }
                .conteneur-item__meta { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
                .meta-tag { font-size: 11px; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; color: #475569; font-weight: 600; }
                .meta-tag--date { color: #0369a1; background: #e0f2fe; }

                .bt-cards-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 15px; }
                .bt-card { background: white; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.02); display: flex; flex-direction: column; }
                .bt-card__header { padding: 12px 15px; background: #1e293b; color: white; border-radius: 12px 12px 0 0; display: flex; justify-content: space-between; align-items: center; }
                .bt-card__ref { font-size: 14px; color: white; }
                .bt-card__count { background: rgba(255,255,255,0.2); font-size: 11px; padding: 2px 8px; border-radius: 10px; font-weight: bold; }
                .bt-card__body { padding: 15px; flex: 1; }
                .bt-card__ctn-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 15px; max-height: 150px; overflow-y: auto; }
                .bt-card__ctn-item { display: flex; justify-content: space-between; align-items: center; background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 10px; border-radius: 8px; }
                .btn-remove--sm { width: 24px; height: 24px; font-size: 10px; border: 1px solid #fecaca; background: #fef2f2; color: #ef4444; border-radius: 6px; cursor: pointer; }
                .bt-card__info-row { display: flex; flex-wrap: wrap; gap: 6px; }
                .bt-card__info-tag { font-size: 10px; background: #f1f5f9; color: #475569; padding: 4px 8px; border-radius: 4px; font-weight: 600; }
                
                .bt-card__footer { padding: 10px 15px; border-top: 1px solid #e2e8f0; display: flex; gap: 6px; background: #f8fafc; border-radius: 0 0 12px 12px; flex-wrap: wrap;}
                .btn-action { flex: 1; padding: 6px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; cursor: pointer; border: 1px solid transparent; display: flex; align-items: center; justify-content: center; transition: 0.2s; }
                .btn-action--add { background: #eff6ff; color: #2563eb; border-color: #bfdbfe; }
                .btn-action--add:hover:not(:disabled) { background: #dbeafe; }
                .btn-action--register { background: #10b981; color: white; }
                .btn-action--edit { flex: 0 0 32px; background: white; border-color: #cbd5e1; color: #475569; }
                .btn-action--danger { flex: 0 0 32px; background: #fef2f2; color: #ef4444; border-color: #fecaca; }
                .btn-action:disabled { opacity: 0.5; cursor: not-allowed; }

                .new-bateau-form { background: white; border: 1px dashed #cbd5e1; border-radius: 12px; padding: 15px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center; }
                .btn-create { background: #1e293b; color: white; border: none; padding: 8px 16px; border-radius: 8px; font-weight: 600; font-size: 12px; cursor: pointer; }

                .table-wrap { overflow-x: auto; }
                .reg-table { width: 100%; border-collapse: collapse; }
                .reg-table th { text-align: left; padding: 12px 15px; background: white; font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; }
                .reg-table td { padding: 12px 15px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #334155; vertical-align: middle; }
                .status-badge { padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; }
                .status-badge--valid { background: #e0f2fe; color: #0284c7; }
                .status-badge--arrived { background: #dcfce7; color: #166534; }
                
                .bd-modal { display:none; position:fixed; z-index:9999; left:0; top:0; width:100%; height:100%; background:rgba(15,23,42,0.6); backdrop-filter: blur(4px); align-items:center; justify-content:center; }
                .bd-modal.active { display:flex; }
                .bd-modal-box { background: white; border-radius: 16px; width: 90%; max-width: 500px; overflow: hidden; }
                .bd-modal-header { padding: 20px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; display: flex; justify-content: space-between; align-items: center; }
                .bd-modal-title { margin: 0; font-size: 18px; font-weight: 800; color: #0f172a; }
                .bd-modal-body { padding: 20px; }
                .bd-modal-footer { padding: 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 10px; background: #f8fafc; }
            </style>

            <div id="vue-bateaux-depart" class="departs-page" v-cloak>
                <div class="departs-header">
                    <div class="departs-header__content">
                        <div class="departs-header__left">
                            <div class="departs-header__icon">🚢</div>
                            <div>
                                <h1 class="departs-header__title">Bateaux Départs</h1>
                                <p class="departs-header__subtitle">{{ confBoats.length }} bateau(x) en confection — {{ availableContainers.length }} conteneur(s) à embarquer</p>
                            </div>
                        </div>
                        <div class="departs-header__actions">
                            <button class="al__btn al__btn--ghost" type="button" @click="loadData"><i class="fas fa-sync-alt"></i> Rafraîchir</button>
                        </div>
                    </div>
                </div>

                <div class="departs-grid">
                    <!-- GAUCHE : CONTENEURS DISPOS -->
                    <div class="panel panel--left">
                        <div class="panel__header panel__header--blue">
                            <h2 class="panel__title"><span>📦</span> Conteneurs disponibles <span class="badge">{{ availableContainers.length }}</span></h2>
                        </div>
                        <div class="panel__toolbar">
                            <div class="toolbar-actions">
                                <button class="btn-sm btn-sm--ghost" type="button" @click="selectAllLeft(true)">Tout cocher</button>
                                <button class="btn-sm btn-sm--ghost" type="button" @click="selectAllLeft(false)">Décocher</button>
                            </div>
                        </div>
                        <div class="panel__body">
                            <div class="conteneur-list">
                                <div v-if="loadingContainers" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>
                                <div v-else-if="availableContainers.length === 0" style="text-align: center; padding: 30px; color: #64748b;">Aucun conteneur en attente de départ.</div>
                                <div v-else v-for="c in availableContainers" :key="c.id" class="conteneur-item" @click="toggleSelection(c.id)">
                                    <div class="conteneur-item__check">
                                        <input type="checkbox" :checked="selectedContainerIds.has(c.id)" @click.stop="toggleSelection(c.id)">
                                    </div>
                                    <div class="conteneur-item__info">
                                        <div class="conteneur-item__ref"><span class="mono">{{ c.number || c.id }}</span></div>
                                        <div class="conteneur-item__meta">
                                            <span class="meta-tag">📋 {{ getDossiersCount(c.number || c.id) }} dossier(s)</span>
                                            <span class="meta-tag meta-tag--date">{{ formatDate(c.registeredAt) }}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- DROITE : BATEAUX EN CONFECTION -->
                    <div class="panel panel--right">
                        <div class="panel__header panel__header--navy">
                            <h2 class="panel__title"><span>🚢</span> Bateaux en confection <span class="badge">{{ confBoats.length }}</span></h2>
                        </div>
                        <div class="panel__body">
                            <div class="new-bateau-form">
                                <div>
                                    <div class="form-title">➕ Nouveau Bateau</div>
                                    <div class="form-hint">Cliquez sur Créer pour ouvrir le formulaire</div>
                                </div>
                                <button class="btn-create" type="button" @click="openBoatModal()">➕ Créer</button>
                            </div>
                            
                            <div class="bt-cards-grid">
                                <div v-if="loadingBoats" style="grid-column: 1/-1; text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>
                                <div v-else-if="confBoats.length === 0" style="grid-column: 1/-1; text-align: center; padding: 30px; color: #64748b;">Aucun bateau en cours de confection.</div>
                                <div v-else v-for="b in confBoats" :key="b.id" class="bt-card">
                                    <div class="bt-card__header">
                                        <div class="bt-card__ref mono">{{ b.reference }}</div>
                                        <span class="bt-card__count">{{ getBoatContainers(b.id).length }} ctn</span>
                                    </div>
                                    <div class="bt-card__body">
                                        <div class="bt-card__ctn-list">
                                            <div v-for="c in getBoatContainers(b.id)" :key="c.id" class="bt-card__ctn-item">
                                                <div class="bt-card__ctn-info">
                                                    <span class="bt-card__ctn-ref mono">{{ c.number || c.id }}</span>
                                                    <span class="bt-card__ctn-meta">📋 {{ getDossiersCount(c.number || c.id) }} dos.</span>
                                                </div>
                                                <button class="btn-remove btn-remove--sm" type="button" title="Retirer du bateau" @click.stop="removeFromBoat(c.id)">✕</button>
                                            </div>
                                            <div v-if="getBoatContainers(b.id).length === 0" style="font-size:12px; color:#94a3b8; font-style:italic; padding:5px 0;">Aucun conteneur</div>
                                        </div>
                                        <div class="bt-card__info-row">
                                            <span class="bt-card__info-tag">📅 Dép. {{ formatDate(b.departureDate) || '-' }}</span>
                                            <span class="bt-card__info-tag">📆 Arr. {{ formatDate(b.arrivalDate) || '-' }}</span>
                                            <span class="bt-card__info-tag">⚓ {{ b.company || '-' }}</span>
                                            <span class="bt-card__info-tag">👤 {{ b.name || '-' }}</span>
                                        </div>
                                    </div>
                                    <div class="bt-card__footer">
                                        <button class="btn-action btn-action--add" type="button" :disabled="selectedContainerIds.size === 0" @click="addToBoat(b.id)">➕ Ajouter ({{ selectedContainerIds.size }})</button>
                                        <button class="btn-action btn-action--register" type="button" @click="registerBoat(b.id)">✅ Enregistrer</button>
                                        <button class="btn-action btn-action--edit" type="button" title="Modifier infos bateau" @click="openBoatModal(b.id)">✎</button>
                                        <button class="btn-action btn-action--danger" type="button" title="Supprimer ce bateau" @click="deleteBoat(b.id)">🗑</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- BAS : BATEAUX ENREGISTRÉS -->
                <div class="panel panel--bottom">
                    <div class="panel__header panel__header--green">
                        <h2 class="panel__title"><span>✅</span> Bateaux enregistrés <span class="badge">{{ regBoats.length }}</span></h2>
                    </div>
                    <div class="panel__body" style="padding: 0;">
                        <div class="table-wrap">
                            <table class="reg-table">
                                <thead>
                                    <tr><th>Référence</th><th>Date départ</th><th>Date arrivée</th><th>Compagnie</th><th>Navire</th><th>Conteneurs</th><th>Enregistré le</th><th style="text-align: center;">Statut</th><th style="text-align: right;">Actions</th></tr>
                                </thead>
                                <tbody>
                                    <tr v-if="loadingBoats"><td colspan="9" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</td></tr>
                                    <tr v-else-if="regBoats.length === 0"><td colspan="9" style="text-align: center; padding: 40px; color: #64748b;">Aucun bateau en mer pour le moment.</td></tr>
                                    <tr v-else v-for="b in regBoats" :key="b.id">
                                        <td class="mono" style="font-weight: 800;">{{ b.reference }}</td>
                                        <td class="mono">{{ formatDate(b.departureDate) || '-' }}</td>
                                        <td class="mono">{{ formatDate(b.arrivalDate) || '-' }}</td>
                                        <td>{{ b.company || '-' }}</td>
                                        <td class="mono">{{ b.name || '-' }}</td>
                                        <td class="mono" style="max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" :title="getBoatContainers(b.id).map(c => c.number || c.id).join(' / ')">{{ getBoatContainers(b.id).map(c => c.number || c.id).join(' / ') || '-' }}</td>
                                        <td class="mono">{{ formatDate(b.registeredAt) || '-' }}</td>
                                        <td style="text-align: center;"><span class="status-badge" :class="b.status === 'ARRIVE' ? 'status-badge--arrived' : 'status-badge--valid'">{{ b.status === 'ARRIVE' ? '✅ À quai' : '🌊 En mer' }}</span></td>
                                        <td style="text-align: right;">
                                            <div style="display:flex; gap:6px; justify-content:flex-end;">
                                                <button class="btn-sm btn-sm--ghost" @click="openColis(b.id)" title="Voir les colis de ce bateau">👁️ Voir les colis</button>
                                                <button v-if="b.status !== 'ARRIVE'" class="btn-sm btn-sm--ghost" style="color:#ef4444;" @click="unRegisterBoat(b.id)" title="Annuler le départ">↩ Annuler le départ</button>
                                                <span v-else style="color:#94a3b8; font-size:12px; font-weight:600;">Arrivé à destination</span>
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- MODAL BATEAU -->
                <div id="boatModal" class="bd-modal" :class="{ active: showModal }">
                    <div class="bd-modal-box">
                        <div class="bd-modal-header">
                            <h2 class="bd-modal-title">{{ editingBoatId ? 'Modifier Bateau' : 'Nouveau Bateau' }}</h2>
                            <button class="icon-btn" @click="closeBoatModal" style="background:none; border:none; font-size:24px; cursor:pointer; color:#64748b;">&times;</button>
                        </div>
                        <div class="bd-modal-body">
                            <div class="form-group" style="margin-bottom: 15px;">
                                <label style="font-size: 12px; font-weight: 600; color: #475569; display: block; margin-bottom: 6px;">Référence bateau *</label>
                                <input type="text" v-model="boatForm.reference" class="filter-input" placeholder="Générée automatiquement si vide" style="width: 100%; box-sizing: border-box;">
                            </div>
                            <div class="form-group" style="margin-bottom: 15px;">
                                <label style="font-size: 12px; font-weight: 600; color: #475569; display: block; margin-bottom: 6px;">Compagnie maritime *</label>
                                <input type="text" v-model="boatForm.company" class="filter-input" placeholder="Ex: MSC, CMA CGM..." style="width: 100%; box-sizing: border-box;">
                            </div>
                            <div class="form-group" style="margin-bottom: 15px;">
                                <label style="font-size: 12px; font-weight: 600; color: #475569; display: block; margin-bottom: 6px;">Nom du navire (ou N° Vol)</label>
                                <input type="text" v-model="boatForm.name" class="filter-input" placeholder="Ex: MSC KATYAYNI" style="width: 100%; box-sizing: border-box;">
                            </div>
                            <div style="display: flex; gap: 15px; margin-bottom: 15px;">
                                <div class="form-group" style="flex: 1;">
                                    <label style="font-size: 12px; font-weight: 600; color: #475569; display: block; margin-bottom: 6px;">Date Départ prévue</label>
                                    <input type="date" v-model="boatForm.departureDate" class="filter-input" style="width: 100%; box-sizing: border-box;">
                                </div>
                                <div class="form-group" style="flex: 1;">
                                    <label style="font-size: 12px; font-weight: 600; color: #475569; display: block; margin-bottom: 6px;">Date Arrivée (ETA)</label>
                                    <input type="date" v-model="boatForm.arrivalDate" class="filter-input" style="width: 100%; box-sizing: border-box;">
                                </div>
                            </div>
                        </div>
                        <div class="bd-modal-footer">
                            <button class="al__btn al__btn--ghost" @click="closeBoatModal">Annuler</button>
                            <button class="al__btn al__btn--primary" @click="saveBoat" :disabled="saving"><i class="fas fa-save"></i> Enregistrer</button>
                        </div>
                    </div>
                </div>

                <!-- MODAL DÉTAIL COLIS D'UN BATEAU -->
                <div class="bd-modal" :class="{ active: !!colisBoatId }">
                    <div class="bd-modal-box" v-if="colisBoatId" style="max-width: 680px;">
                        <div class="bd-modal-header">
                            <h2 class="bd-modal-title">📦 Colis du bateau {{ colisBoatRef }}</h2>
                            <button @click="colisBoatId = null" style="background:none; border:none; font-size:24px; cursor:pointer; color:#64748b;">&times;</button>
                        </div>
                        <div class="bd-modal-body" style="max-height:70vh; overflow-y:auto;">
                            <table class="reg-table">
                                <thead><tr><th>Sous-colis</th><th>Nature</th><th>Dossier</th><th>Conteneur</th><th>Destinataire</th><th style="text-align:center;">Statut</th></tr></thead>
                                <tbody>
                                    <tr v-for="p in getBoatPieces(colisBoatId)" :key="p.sousRef">
                                        <td class="mono" style="font-weight:700;">{{ p.sousRef }}</td>
                                        <td>{{ p.desc || '-' }}</td>
                                        <td class="mono">{{ p.livRef }}</td>
                                        <td class="mono">{{ p.conteneur || '-' }}</td>
                                        <td>{{ p.destinataire || '-' }}</td>
                                        <td style="text-align:center;"><span class="status-badge" :style="pieceStatusStyle(p)">{{ pieceStatus(p) }}</span></td>
                                    </tr>
                                    <tr v-if="getBoatPieces(colisBoatId).length === 0"><td colspan="6" style="text-align:center; color:#94a3b8; padding:20px;">Aucun colis chargé sur ce bateau.</td></tr>
                                </tbody>
                            </table>
                        </div>
                        <div class="bd-modal-footer">
                            <button class="al__btn al__btn--ghost" @click="colisBoatId = null">Fermer</button>
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
                // State
                const containers = ref([]);
                const boats = ref([]);
                const livraisons = ref([]);
                const transactions = ref([]);
                const selectedContainerIds = ref(new Set());
                const showModal = ref(false);
                const editingBoatId = ref(null);
                const saving = ref(false);
                const loadingContainers = ref(true);
                const loadingBoats = ref(true);
                
                const boatForm = reactive({
                    reference: '',
                    company: '',
                    name: '',
                    departureDate: '',
                    arrivalDate: ''
                });
                
                let unsubContainers = null;
                let unsubBoats = null;
                let unsubLivraisons = null;
                let unsubTransactions = null;
                
                // Computed
                const availableContainers = computed(() => {
                    return containers.value.filter(c => c.status === 'EN_ATTENTE_BATEAU' && !c.boatId);
                });
                
                const confBoats = computed(() => {
                    return boats.value.filter(b => b.status === 'EN_CONFECTION').sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
                });
                
                const regBoats = computed(() => {
                    return boats.value.filter(b => b.status === 'ENREGISTRE' || b.status === 'ARRIVE').sort((a,b) => new Date(b.registeredAt || 0) - new Date(a.registeredAt || 0));
                });
                
                // Helper functions
                const formatDate = (dateString) => {
                    return dateString ? new Date(dateString).toLocaleDateString('fr-FR') : '-';
                };
                
                const formatDateTime = (dateString) => {
                    return dateString ? new Date(dateString).toLocaleString('fr-FR') : '-';
                };
                
                const getDossiersCount = (conteneurNumber) => {
                    return livraisons.value.filter(l => l.conteneur === conteneurNumber).length;
                };
                
                const getBoatContainers = (boatId) => {
                    return containers.value.filter(c => c.boatId === boatId);
                };

                // Détail des colis d'un bateau (envoi) : on relie via le n° de
                // conteneur. Statut lisible par colis (entrepôt → transit → reçu
                // → livré). Lecture seule : c'est un suivi/archive.
                const colisBoatId = ref(null);
                const colisBoatRef = computed(() => {
                    const b = boats.value.find(x => x.id === colisBoatId.value);
                    return b ? b.reference : '';
                });
                const openColis = (boatId) => { colisBoatId.value = boatId; };
                const getBoatParcels = (boatId) => {
                    const nums = getBoatContainers(boatId).map(c => c.number || c.id);
                    return livraisons.value.filter(l => nums.includes(l.conteneur));
                };
                // Nature par sous-colis, reconstruite depuis les lignes (items) de
                // la transaction du dossier (1 ligne × qté = N sous-colis).
                const descMapOf = (livRef) => {
                    const t = transactions.value.find(x => x.reference === livRef && !x.isDeleted);
                    const descMap = {};
                    if (t && Array.isArray(t.items)) {
                        let idx = 1;
                        t.items.forEach(it => {
                            const q = parseInt(it.qty) || 1;
                            for (let i = 0; i < q; i++) { descMap[idx] = it.desc; idx++; }
                        });
                    }
                    return descMap;
                };
                // Sous-colis réellement CHARGÉS dans un conteneur (scan « Charger
                // conteneur » = CONTENEUR_CHARGEMENT dans l'historique de la pièce).
                const loadedPiecesOf = (liv) => {
                    const labels = (liv.labels && liv.labels.length) ? liv.labels : [liv.ref];
                    const descMap = descMapOf(liv.ref);
                    const hist = Array.isArray(liv.scanHistory) ? liv.scanHistory : [];
                    const out = [];
                    labels.forEach((lbl, idx) => {
                        const scansOfPiece = hist.filter(h => h.scanRef === lbl);
                        const loaded = scansOfPiece.some(h => h.type === 'CONTENEUR_CHARGEMENT')
                            || (scansOfPiece.length === 0 && liv.containerStatus === 'A_VENIR'); // repli (pas de suivi par pièce)
                        if (!loaded) return;
                        const m = lbl.match(/_(\d+)_/);
                        const li = m ? parseInt(m[1]) : (idx + 1);
                        out.push({
                            sousRef: lbl,
                            desc: descMap[li] || liv.description || 'Colis',
                            livId: liv.id,
                            livRef: liv.ref,
                            conteneur: liv.conteneur || '',
                            destinataire: liv.destinataire || ''
                        });
                    });
                    return out;
                };
                const getBoatPieces = (boatId) => {
                    const arr = [];
                    getBoatParcels(boatId).forEach(l => loadedPiecesOf(l).forEach(p => arr.push(p)));
                    return arr;
                };
                const pieceStatus = (p) => {
                    const liv = livraisons.value.find(l => l.id === p.livId);
                    if (liv) {
                        if (liv.status === 'LIVRE') return 'Livré';
                        const hist = Array.isArray(liv.scanHistory) ? liv.scanHistory : [];
                        if (hist.some(h => h.scanRef === p.sousRef && h.type === 'DECHARGEMENT_ABIDJAN')) return 'Reçu (Abidjan)';
                        if (liv.containerStatus === 'A_VENIR') return 'En transit';
                    }
                    return 'Chargé';
                };
                const pieceStatusStyle = (p) => {
                    const st = pieceStatus(p);
                    if (st === 'Livré') return 'background:#dcfce7; color:#166534;';
                    if (st === 'Reçu (Abidjan)') return 'background:#dbeafe; color:#1e40af;';
                    if (st === 'En transit') return 'background:#fef3c7; color:#b45309;';
                    return 'background:#e0f2fe; color:#0369a1;';
                };
                
                // Actions
                const toggleSelection = (id) => {
                    if (selectedContainerIds.value.has(id)) {
                        selectedContainerIds.value.delete(id);
                    } else {
                        selectedContainerIds.value.add(id);
                    }
                    // Trigger reactivity
                    selectedContainerIds.value = new Set(selectedContainerIds.value);
                };
                
                const selectAllLeft = (select) => {
                    if (select) {
                        const newSet = new Set(selectedContainerIds.value);
                        availableContainers.value.forEach(c => newSet.add(c.id));
                        selectedContainerIds.value = newSet;
                    } else {
                        selectedContainerIds.value = new Set();
                    }
                };
                
                const openBoatModal = (boatId = null) => {
                    editingBoatId.value = boatId;
                    
                    if (boatId) {
                        const boat = boats.value.find(b => b.id === boatId);
                        if (boat) {
                            boatForm.reference = boat.reference || '';
                            boatForm.company = boat.company || '';
                            boatForm.name = boat.name || '';
                            boatForm.departureDate = boat.departureDate || '';
                            boatForm.arrivalDate = boat.arrivalDate || '';
                        }
                    } else {
                        boatForm.reference = `BT-${Date.now().toString().slice(-6)}`;
                        boatForm.company = '';
                        boatForm.name = '';
                        boatForm.departureDate = '';
                        boatForm.arrivalDate = '';
                    }
                    
                    showModal.value = true;
                };
                
                const closeBoatModal = () => {
                    showModal.value = false;
                    editingBoatId.value = null;
                };
                
                const saveBoat = async () => {
                    if (!boatForm.company.trim()) {
                        globalApp.showToast("La compagnie maritime est obligatoire.", "error");
                        return;
                    }
                    
                    saving.value = true;
                    
                    const data = {
                        reference: boatForm.reference || `BT-${Date.now().toString().slice(-6)}`,
                        company: boatForm.company,
                        name: boatForm.name,
                        departureDate: boatForm.departureDate,
                        arrivalDate: boatForm.arrivalDate,
                    };
                    
                    try {
                        if (editingBoatId.value) {
                            await updateDoc(doc(db, getCollectionName("boats"),editingBoatId.value), data);
                            globalApp.showToast("Bateau modifié avec succès.", "success");
                        } else {
                            data.status = 'EN_CONFECTION';
                            data.createdAt = new Date().toISOString();
                            await setDoc(doc(collection(db, getCollectionName("boats"))), data);
                            globalApp.showToast("Nouveau bateau créé.", "success");
                        }
                        closeBoatModal();
                    } catch(e) {
                        // Diagnostic : on remonte la cause réelle (permission,
                        // doc introuvable, réseau…) au lieu d'un message muet.
                        console.error('[bateaux-depart] saveBoat échec —', e);
                        const detail = (e && (e.code || e.message)) ? ` (${e.code || e.message})` : '';
                        globalApp.showToast(`Erreur lors de l'enregistrement.${detail}`, "error");
                    } finally {
                        saving.value = false;
                    }
                };
                
                const deleteBoat = async (boatId) => {
                    if (!confirm("Voulez-vous vraiment supprimer ce bateau ? Les conteneurs à l'intérieur redeviendront disponibles.")) return;
                    
                    try {
                        const batch = writeBatch(db);
                        const ctns = containers.value.filter(c => c.boatId === boatId);
                        ctns.forEach(c => {
                            batch.update(doc(db, getCollectionName("containers"),c.id), { boatId: deleteField() });
                        });
                        batch.delete(doc(db, getCollectionName("boats"),boatId));
                        await batch.commit();
                        globalApp.showToast("Bateau supprimé.", "success");
                    } catch(e) {
                        globalApp.showToast("Erreur de suppression.", "error");
                    }
                };
                
                const addToBoat = async (boatId) => {
                    if (selectedContainerIds.value.size === 0) return;
                    
                    try {
                        const batch = writeBatch(db);
                        selectedContainerIds.value.forEach(cid => {
                            batch.update(doc(db, getCollectionName("containers"),cid), { boatId: boatId });
                        });
                        await batch.commit();
                        selectedContainerIds.value = new Set();
                        globalApp.showToast("Conteneurs ajoutés au bateau.", "success");
                    } catch(e) {
                        globalApp.showToast("Erreur d'ajout.", "error");
                    }
                };
                
                const removeFromBoat = async (containerId) => {
                    try {
                        await updateDoc(doc(db, getCollectionName("containers"),containerId), { boatId: deleteField() });
                        globalApp.showToast("Conteneur retiré du bateau.", "info");
                    } catch(e) {
                        globalApp.showToast("Erreur de retrait.", "error");
                    }
                };
                
                const registerBoat = async (boatId) => {
                    const boat = boats.value.find(b => b.id === boatId);
                    const ctns = containers.value.filter(c => c.boatId === boatId);
                    
                    if (ctns.length === 0) {
                        globalApp.showToast("Ce bateau est vide. Ajoutez d'abord des conteneurs.", "error");
                        return;
                    }
                    
                    if (!confirm(`Confirmer le départ du bateau ${boat.reference} ?\n\nSes ${ctns.length} conteneur(s) passeront en statut 'En mer' (Transit).`)) return;
                    
                    try {
                        const batch = writeBatch(db);
                        
                        batch.update(doc(db, getCollectionName("boats"),boatId), { 
                            status: 'ENREGISTRE', 
                            registeredAt: new Date().toISOString() 
                        });
                        
                        ctns.forEach(c => {
                            batch.update(doc(db, getCollectionName("containers"),c.id), {
                                status: 'EN_TRANSIT',
                                boatName: boat.name || boat.company || boat.reference,
                                departureDate: boat.departureDate || null,
                                arrivalDate: boat.arrivalDate || null
                            });
                        });
                        
                        await batch.commit();
                        globalApp.showToast("Départ enregistré avec succès !", "success");
                    } catch(e) {
                        globalApp.showToast("Erreur lors de l'enregistrement.", "error");
                    }
                };
                
                const unRegisterBoat = async (boatId) => {
                    if (!confirm("Annuler le départ de ce bateau ? Il repassera en 'Confection'.")) return;
                    
                    try {
                        const batch = writeBatch(db);
                        
                        batch.update(doc(db, getCollectionName("boats"),boatId), { 
                            status: 'EN_CONFECTION', 
                            registeredAt: deleteField() 
                        });
                        
                        const ctns = containers.value.filter(c => c.boatId === boatId);
                        ctns.forEach(c => {
                            batch.update(doc(db, getCollectionName("containers"),c.id), {
                                status: 'EN_ATTENTE_BATEAU',
                                boatName: deleteField(),
                                departureDate: deleteField(),
                                arrivalDate: deleteField()
                            });
                        });
                        
                        await batch.commit();
                        globalApp.showToast("Départ annulé.", "success");
                    } catch(e) {
                        globalApp.showToast("Erreur d'annulation.", "error");
                    }
                };
                // NB : la validation d'ARRIVÉE n'est plus faite ici (page de
                // départ). Elle se fait côté agence d'arrivée dans « Bateau / Vol
                // arrivée », et la réception réelle des colis se fait au scan
                // Déchargement. La page de départ ne gère que la confection et le
                // départ (et son annulation tant que le bateau n'est pas arrivé).
                
                const loadData = () => {
                    const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
                    
                    if (unsubContainers) unsubContainers();
                    if (unsubBoats) unsubBoats();
                    if (unsubLivraisons) unsubLivraisons();
                    if (unsubTransactions) unsubTransactions();

                    loadingContainers.value = true;
                    loadingBoats.value = true;

                    // Route SaaS : collections déjà isolées -> pas de filtre
                    // agency (sinon les docs sans ce champ disparaissent).
                    // Collection de base (paris/abidjan) : filtre conservé.
                    const contCol = getCollectionName("containers");
                    const boatCol = getCollectionName("boats");
                    const livCol = getCollectionName("livraisons");
                    const transCol = getCollectionName("transactions");
                    const qC = (contCol !== "containers") ? query(collection(db, contCol)) : query(collection(db, contCol), where("agency", "==", activeAgency));
                    const qB = (boatCol !== "boats") ? query(collection(db, boatCol)) : query(collection(db, boatCol), where("agency", "==", activeAgency));
                    const qL = (livCol !== "livraisons") ? query(collection(db, livCol)) : query(collection(db, livCol), where("agency", "==", activeAgency));
                    const qT = (transCol !== "transactions") ? query(collection(db, transCol)) : query(collection(db, transCol), where("agency", "==", activeAgency));

                    unsubContainers = onSnapshot(qC, snap => {
                        containers.value = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                        loadingContainers.value = false;
                    });

                    unsubBoats = onSnapshot(qB, snap => {
                        boats.value = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                        loadingBoats.value = false;
                    });

                    unsubLivraisons = onSnapshot(qL, snap => {
                        livraisons.value = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                    });

                    // Transactions : pour la nature (désignation) par sous-colis.
                    unsubTransactions = onSnapshot(qT, snap => {
                        transactions.value = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                    });
                };
                
                onMounted(() => {
                    loadData();
                });
                
                onUnmounted(() => {
                    if (unsubContainers) unsubContainers();
                    if (unsubBoats) unsubBoats();
                    if (unsubLivraisons) unsubLivraisons();
                    if (unsubTransactions) unsubTransactions();
                });

                return {
                    containers, boats, livraisons, transactions, selectedContainerIds, showModal, editingBoatId, saving,
                    loadingContainers, loadingBoats, boatForm,
                    availableContainers, confBoats, regBoats,
                    formatDate, formatDateTime, getDossiersCount, getBoatContainers,
                    toggleSelection, selectAllLeft, openBoatModal, closeBoatModal, saveBoat,
                    deleteBoat, addToBoat, removeFromBoat, registerBoat, unRegisterBoat, loadData,
                    colisBoatId, colisBoatRef, openColis, getBoatParcels, getBoatPieces, pieceStatus, pieceStatusStyle
                };
            }
        });
        
        // Add v-cloak style
        const style = document.createElement('style');
        style.textContent = '[v-cloak] { display: none; }';
        document.head.appendChild(style);
        
        this.vueApp.mount('#vue-bateaux-depart');
    }
};