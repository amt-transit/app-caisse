import { db } from '../../../firebase-config.js';
import { AGENCIES } from '../../../agencies-config.js';
import { collection, doc, getDoc, setDoc, deleteDoc, onSnapshot, writeBatch } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { createApp, ref, reactive, computed, onMounted, onUnmounted } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";

// ============================================================================
//  GESTION DES AGENCES — UX "Route d'envoi" (modèle agencies_config inchangé)
// ----------------------------------------------------------------------------
//  Métier : une "route" = 1 agence de DÉPART + ≥1 agence d'ARRIVÉE.
//  Le technique (id système, interface, préfixe, routage des collections) est
//  AUTO-GÉNÉRÉ selon la convention de getCollectionName (agencies-config.js) :
//    - départ  : id = slug(nom)          -> collections "transactions_<id>"
//    - arrivée : id = slug(nom)_<départ> -> lit "transactions_<départ>"
//    - historique paris/abidjan : tables de base (intouchables)
// ============================================================================

export const SettingsAgenciesView = {
    vueApp: null,

    render(app) {
        const globalApp = app;
        window.app.views = window.app.views || {};
        window.app.views.settingsAgencies = this;

        const html = `
            <style>
                [v-cloak] { display: none; }
                .agx-page { max-width: 1100px; margin: 0 auto; animation: fadeIn 0.3s ease; }
                .agx-header { background: white; border-radius: 16px; padding: 20px 25px; margin-bottom: 24px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px; }
                .agx-title { margin: 0; font-size: 22px; font-weight: 800; color: #0f172a; }
                .agx-sub { margin: 4px 0 0 0; font-size: 13px; color: #64748b; }
                .agx-btn { padding: 10px 18px; border-radius: 10px; font-weight: 700; border: none; cursor: pointer; font-size: 14px; }
                .agx-btn--primary { background: #8b5cf6; color: white; }
                .agx-btn--ghost { background: #f1f5f9; color: #475569; }
                .agx-btn--danger { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
                .agx-btn--mini { padding: 6px 12px; font-size: 12px; border-radius: 8px; }

                .agx-route { background: white; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.02); margin-bottom: 18px; overflow: hidden; }
                .agx-route__dep { display: flex; align-items: center; gap: 14px; padding: 18px 22px; background: #f5f3ff; border-bottom: 1px solid #ede9fe; }
                .agx-flag { font-size: 28px; line-height: 1; }
                .agx-name { font-size: 17px; font-weight: 800; color: #0f172a; }
                .agx-id { font-family: monospace; font-size: 11px; background: #ffffff; border: 1px solid #e2e8f0; padding: 2px 6px; border-radius: 4px; color: #64748b; }
                .agx-badge { font-size: 11px; font-weight: 800; padding: 3px 9px; border-radius: 999px; }
                .agx-badge--dep { background: #e0f2fe; color: #0369a1; }
                .agx-badge--arr { background: #fce7f3; color: #be185d; }
                .agx-chip { font-size: 12px; font-weight: 700; padding: 5px 10px; border-radius: 999px; background: #f1f5f9; color: #334155; border: 1px solid #e2e8f0; cursor: pointer; transition: 0.2s; display: inline-flex; align-items: center; gap: 6px; }
                .agx-chip:hover { background: #ede9fe; border-color: #c4b5fd; color: #6d28d9; }
                .agx-chip--eur { background: #ecfdf5; color: #047857; border-color: #a7f3d0; }
                .agx-chip--xof { background: #fef3c7; color: #92400e; border-color: #fde68a; }
                .agx-arr-list { padding: 8px 22px 16px 22px; }
                .agx-arr { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px dashed #eef2f7; }
                .agx-arr:last-child { border-bottom: none; }
                .agx-arrow { color: #94a3b8; font-weight: 800; }
                .agx-spacer { flex: 1; }
                .agx-warn { color: #b45309; font-size: 13px; background: #fffbeb; border: 1px solid #fde68a; padding: 8px 12px; border-radius: 8px; margin: 10px 22px 16px; }

                .agx-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.6); backdrop-filter: blur(4px); z-index: 2000; display: flex; align-items: center; justify-content: center; padding: 16px; }
                .agx-modal { background: white; border-radius: 16px; width: 100%; max-width: 560px; max-height: 92vh; overflow-y: auto; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); }
                .agx-modal__h { padding: 20px 24px; border-bottom: 1px solid #e2e8f0; }
                .agx-modal__b { padding: 22px 24px; }
                .agx-modal__f { padding: 16px 24px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 10px; }
                .agx-field { margin-bottom: 16px; }
                .agx-lab { display: block; font-size: 13px; font-weight: 700; color: #334155; margin-bottom: 6px; }
                .agx-inp { width: 100%; padding: 11px 13px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; box-sizing: border-box; outline: none; }
                .agx-inp:focus { border-color: #8b5cf6; box-shadow: 0 0 0 3px rgba(139,92,246,0.12); }
                .agx-dest-row { display: flex; gap: 10px; align-items: flex-start; margin-bottom: 10px; }
                .agx-adv { font-size: 12px; color: #64748b; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 10px 12px; margin-top: 6px; }
                .agx-adv code { background: #eef2f7; padding: 1px 5px; border-radius: 4px; }
            </style>

            <div id="vue-agencies-app" class="agx-page" v-cloak>
                <div class="agx-header">
                    <div>
                        <h1 class="agx-title">🌍 Agences & Routes d'envoi</h1>
                        <p class="agx-sub">Une route = une agence de <b>départ</b> et au moins une agence d'<b>arrivée</b>.</p>
                    </div>
                    <button class="agx-btn agx-btn--primary" @click="openWizard()">➕ Nouvelle route d'envoi</button>
                </div>

                <div v-if="loading" style="text-align:center; padding:40px; color:#64748b;"><i class="fas fa-spinner fa-spin"></i> Chargement…</div>
                <div v-else-if="routes.length === 0" style="text-align:center; padding:40px; color:#64748b;">Aucune route. Cliquez « Nouvelle route d'envoi ».</div>

                <div v-for="r in routes" :key="r.departure.id" class="agx-route">
                    <div class="agx-route__dep">
                        <span class="agx-flag">{{ r.departure.flag || '🏳️' }}</span>
                        <div>
                            <div class="agx-name">{{ r.departure.name }} <span class="agx-badge agx-badge--dep">DÉPART</span></div>
                            <span class="agx-id">{{ r.departure.id }}</span>
                        </div>
                        <span class="agx-spacer"></span>
                        <span class="agx-chip" :class="(r.departure.currency === 'EUR') ? 'agx-chip--eur' : 'agx-chip--xof'"
                              @click="openCurrencyModel(r.departure)"
                              :title="'Modifier la devise et le modèle de facturation'">
                            💱 {{ (r.departure.currency === 'EUR') ? '€ EUR' : 'F CFA' }}
                        </span>
                        <button class="agx-btn agx-btn--ghost agx-btn--mini" @click="openEdit(r.departure)">✏️ Renommer</button>
                        <button class="agx-btn agx-btn--primary agx-btn--mini" @click="openAddDest(r.departure)">➕ Destination</button>
                        <button class="agx-btn agx-btn--danger agx-btn--mini" @click="removeDeparture(r)">🗑️</button>
                    </div>

                    <div v-if="r.arrivals.length === 0" class="agx-warn">
                        ⚠️ Aucune destination d'arrivée. Cette route est incomplète — ajoutez-en une.
                    </div>
                    <div v-else class="agx-arr-list">
                        <div v-for="a in r.arrivals" :key="a.id" class="agx-arr">
                            <span class="agx-arrow">↳</span>
                            <span class="agx-flag" style="font-size:22px;">{{ a.flag || '🏳️' }}</span>
                            <div>
                                <div class="agx-name" style="font-size:15px;">{{ a.name }} <span class="agx-badge agx-badge--arr">ARRIVÉE</span></div>
                                <span class="agx-id">{{ a.id }}</span>
                            </div>
                            <span class="agx-spacer"></span>
                            <button class="agx-btn agx-btn--ghost agx-btn--mini" @click="openEdit(a)">✏️</button>
                            <button class="agx-btn agx-btn--danger agx-btn--mini" @click="removeAgency(a)">🗑️</button>
                        </div>
                    </div>
                </div>

                <!-- WIZARD : nouvelle route -->
                <div class="agx-overlay" v-if="showWizard">
                    <div class="agx-modal">
                        <div class="agx-modal__h">
                            <h3 style="margin:0; color:#0f172a;">Nouvelle route d'envoi</h3>
                            <p style="margin:4px 0 0; font-size:13px; color:#64748b;">D'où partent les colis, et vers quelles destinations.</p>
                        </div>
                        <div class="agx-modal__b">
                            <div class="agx-field">
                                <label class="agx-lab">🛫 D'où partent les colis ? (pays/ville de départ)</label>
                                <input class="agx-inp" v-model="wiz.depName" placeholder="Ex : Chine">
                            </div>
                            <div class="agx-field" style="margin-bottom:20px;">
                                <label class="agx-lab">Drapeau du départ</label>
                                <input class="agx-inp" v-model="wiz.depFlag" placeholder="Ex : 🇨🇳" style="max-width:120px;">
                            </div>

                            <div class="agx-field" style="margin-bottom:20px;">
                                <label class="agx-lab">💱 Devise de facturation au DÉPART</label>
                                <select class="agx-inp" v-model="wiz.depCurrency" style="max-width:280px;">
                                    <option value="EUR">€ Euro (saisie en €, converti en FCFA)</option>
                                    <option value="XOF">FCFA (saisie directe en FCFA)</option>
                                </select>
                                <p style="margin:6px 0 0; font-size:12px; color:#64748b;">L'agence d'arrivée reste en FCFA (devise interne du système). Tout est stocké en FCFA.</p>
                            </div>

                            <label class="agx-lab">🛬 Vers quelles destinations ? (au moins une)</label>
                            <div v-for="(d, i) in wiz.arrivals" :key="i" class="agx-dest-row">
                                <input class="agx-inp" v-model="d.name" placeholder="Ex : Abidjan">
                                <input class="agx-inp" v-model="d.flag" placeholder="🇨🇮" style="max-width:90px;">
                                <button class="agx-btn agx-btn--danger agx-btn--mini" v-if="wiz.arrivals.length > 1" @click="wiz.arrivals.splice(i,1)" style="white-space:nowrap;">✕</button>
                            </div>
                            <button class="agx-btn agx-btn--ghost agx-btn--mini" @click="wiz.arrivals.push({name:'',flag:''})">➕ Ajouter une destination</button>

                            <div class="agx-adv" v-if="wizPreview.dep">
                                <b>Aperçu technique</b> (généré automatiquement) :<br>
                                Départ <code>{{ wizPreview.dep }}</code>
                                <span v-for="p in wizPreview.arr" :key="p"> · Arrivée <code>{{ p }}</code></span>
                            </div>
                        </div>
                        <div class="agx-modal__f">
                            <button class="agx-btn agx-btn--ghost" @click="showWizard=false">Annuler</button>
                            <button class="agx-btn agx-btn--primary" @click="saveRoute" :disabled="saving">
                                <span v-if="saving"><i class="fas fa-spinner fa-spin"></i> …</span>
                                <span v-else>💾 Créer la route</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- AJOUT DESTINATION à un départ existant -->
                <div class="agx-overlay" v-if="showAddDest">
                    <div class="agx-modal">
                        <div class="agx-modal__h">
                            <h3 style="margin:0; color:#0f172a;">Ajouter une destination</h3>
                            <p style="margin:4px 0 0; font-size:13px; color:#64748b;">Départ : <b>{{ addDest.depName }}</b></p>
                        </div>
                        <div class="agx-modal__b">
                            <div class="agx-field">
                                <label class="agx-lab">🛬 Nouvelle destination d'arrivée</label>
                                <input class="agx-inp" v-model="addDest.name" placeholder="Ex : Dakar">
                            </div>
                            <div class="agx-field">
                                <label class="agx-lab">Drapeau</label>
                                <input class="agx-inp" v-model="addDest.flag" placeholder="🇸🇳" style="max-width:120px;">
                            </div>
                            <div class="agx-adv" v-if="addDest.name.trim()">
                                Identifiant généré : <code>{{ slug(addDest.name) }}_{{ addDest.depId }}</code>
                            </div>
                        </div>
                        <div class="agx-modal__f">
                            <button class="agx-btn agx-btn--ghost" @click="showAddDest=false">Annuler</button>
                            <button class="agx-btn agx-btn--primary" @click="saveAddDest" :disabled="saving">
                                <span v-if="saving"><i class="fas fa-spinner fa-spin"></i> …</span>
                                <span v-else>💾 Ajouter</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- DEVISE & MODÈLE DE FACTURATION (par route de départ) -->
                <div class="agx-overlay" v-if="showCurrencyModel">
                    <div class="agx-modal">
                        <div class="agx-modal__h">
                            <h3 style="margin:0; color:#0f172a;">💱 Devise & modèle de facturation</h3>
                            <p style="margin:4px 0 0; font-size:13px; color:#64748b;">Route de départ : <b>{{ cm.depName }}</b></p>
                        </div>
                        <div class="agx-modal__b">
                            <div v-if="cm.loading" style="text-align:center; padding:30px; color:#64748b;">
                                <i class="fas fa-spinner fa-spin"></i> Chargement…
                            </div>
                            <template v-else>
                                <div class="agx-field">
                                    <label class="agx-lab">💱 Devise d'affichage et de saisie au DÉPART</label>
                                    <select class="agx-inp" v-model="cm.currency">
                                        <option value="EUR">€ Euro (saisie en €, converti automatiquement en FCFA)</option>
                                        <option value="XOF">F CFA (saisie directe en FCFA)</option>
                                    </select>
                                    <p style="margin:6px 0 0; font-size:12px; color:#64748b;">
                                        L'agence d'arrivée reste toujours en FCFA. Tout est stocké en FCFA en interne.
                                    </p>
                                </div>

                                <div class="agx-field">
                                    <label class="agx-lab">🧾 Modèle de facturation (mode de calcul)</label>
                                    <select class="agx-inp" v-model="cm.factureModel">
                                        <option value="paris">Modèle Paris — prix saisi manuellement</option>
                                        <option value="chine">Modèle Chine — Maritime calculé automatiquement (Volume × tarif CBM)</option>
                                    </select>
                                    <p style="margin:6px 0 0; font-size:12px; color:#64748b;">
                                        L'Aérien (Poids × tarif) est identique pour les deux modèles.
                                        Le modèle Chine est recommandé pour les routes en F CFA où l'on facture au volume.
                                    </p>
                                </div>

                                <div class="agx-adv">
                                    💡 Conseil : EUR ↔ « Modèle Paris » et FCFA ↔ « Modèle Chine » sont les combinaisons les plus courantes,
                                    mais vous pouvez les changer indépendamment selon vos besoins.
                                </div>
                            </template>
                        </div>
                        <div class="agx-modal__f">
                            <button class="agx-btn agx-btn--ghost" @click="showCurrencyModel=false">Annuler</button>
                            <button class="agx-btn agx-btn--primary" @click="saveCurrencyModel" :disabled="saving || cm.loading">
                                <span v-if="saving"><i class="fas fa-spinner fa-spin"></i> …</span>
                                <span v-else>💾 Enregistrer</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- RENOMMER (nom + drapeau) -->
                <div class="agx-overlay" v-if="showEdit">
                    <div class="agx-modal">
                        <div class="agx-modal__h"><h3 style="margin:0; color:#0f172a;">Renommer l'agence</h3></div>
                        <div class="agx-modal__b">
                            <div class="agx-field">
                                <label class="agx-lab">Nom affiché</label>
                                <input class="agx-inp" v-model="edit.name">
                            </div>
                            <div class="agx-field">
                                <label class="agx-lab">Drapeau</label>
                                <input class="agx-inp" v-model="edit.flag" style="max-width:120px;">
                            </div>
                            <div class="agx-adv">Identifiant <code>{{ edit.id }}</code> et type non modifiables (ils pilotent le routage des données).</div>
                        </div>
                        <div class="agx-modal__f">
                            <button class="agx-btn agx-btn--ghost" @click="showEdit=false">Annuler</button>
                            <button class="agx-btn agx-btn--primary" @click="saveEdit" :disabled="saving">💾 Enregistrer</button>
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
                const agencies = ref([]);
                const loading = ref(true);
                const saving = ref(false);
                const showWizard = ref(false);
                const showAddDest = ref(false);
                const showEdit = ref(false);
                const showCurrencyModel = ref(false);
                let unsub = null;

                const slug = (s) => (s || '')
                    .toString().normalize('NFD').replace(/[̀-ͯ]/g, '')
                    .toLowerCase().replace(/[^a-z0-9]/g, '');

                const wiz = reactive({ depName: '', depFlag: '', depCurrency: 'EUR', arrivals: [{ name: '', flag: '' }] });
                const addDest = reactive({ depId: '', depName: '', name: '', flag: '' });
                const edit = reactive({ id: '', name: '', flag: '' });
                const cm = reactive({ depId: '', depName: '', currency: 'EUR', factureModel: 'paris', loading: false });

                const wizPreview = computed(() => {
                    const dep = slug(wiz.depName);
                    return {
                        dep,
                        arr: dep ? wiz.arrivals.map(a => a.name.trim() ? `${slug(a.name)}_${dep}` : '').filter(Boolean) : []
                    };
                });

                // Regroupe les agences en routes (départ -> ses arrivées).
                // IMPORTANT : Paris/Abidjan sont des agences PAR DÉFAUT (config,
                // créées avant ce système) absentes de la collection Firestore.
                // On les fusionne ici pour qu'elles apparaissent (sinon pas de
                // carte Paris -> impossible d'y ajouter une destination).
                // L'écoute Firestore (agencies.value) reste la source LIVE et
                // remplace un défaut si un doc de même id existe.
                const routes = computed(() => {
                    const byId = {};
                    Object.values(AGENCIES || {}).forEach(a => { if (a && a.id) byId[a.id] = a; });
                    agencies.value.forEach(a => { byId[a.id] = a; });
                    const list = Object.values(byId);
                    const deps = list.filter(a => a.type === 'departure');
                    return deps.map(d => ({
                        departure: d,
                        arrivals: list.filter(a => a.type === 'arrival' &&
                            ((a.id.split('_')[1] === d.id) || (d.id === 'paris' && a.id === 'abidjan')))
                    }));
                });

                onMounted(() => {
                    unsub = onSnapshot(collection(db, "agencies_config"), (snap) => {
                        agencies.value = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                        loading.value = false;
                    });
                });
                onUnmounted(() => { if (unsub) unsub(); });

                const exists = (id) => agencies.value.some(a => a.id === id);

                const openWizard = () => {
                    wiz.depName = ''; wiz.depFlag = ''; wiz.depCurrency = 'EUR'; wiz.arrivals = [{ name: '', flag: '' }];
                    showWizard.value = true;
                };

                const saveRoute = async () => {
                    const depName = wiz.depName.trim();
                    const depId = slug(depName);
                    const valmidArr = wiz.arrivals.filter(a => a.name.trim());
                    if (!depName || !depId) return globalApp.showToast("Indiquez le départ.", "error");
                    if (valmidArr.length === 0) return globalApp.showToast("Ajoutez au moins une destination.", "error");
                    if (exists(depId)) return globalApp.showToast(`Le départ « ${depName} » existe déjà. Utilisez « ➕ Destination » sur sa route.`, "error");

                    const prefix = depId.slice(0, 3).toUpperCase() + '-';
                    saving.value = true;
                    try {
                        const batch = writeBatch(db);
                        batch.set(doc(db, "agencies_config", depId), {
                            name: depName, type: 'departure', appFolder: 'paris',
                            flag: wiz.depFlag || '🏳️', prefix, currency: wiz.depCurrency,
                            updatedAt: new Date().toISOString()
                        });
                        for (const a of valmidArr) {
                            const aid = `${slug(a.name)}_${depId}`;
                            batch.set(doc(db, "agencies_config", aid), {
                                name: a.name.trim(), type: 'arrival', appFolder: 'abidjan',
                                flag: a.flag || '🏳️', prefix: '', currency: 'XOF',
                                updatedAt: new Date().toISOString()
                            });
                        }
                        await batch.commit();
                        // La devise du départ pilote le modèle de facturation
                        // déjà lu par Nouvelle Facture (settings/invoice_config_<dep>) :
                        // € -> modèle 'paris' (saisie €, conversion ×655,957) ;
                        // FCFA -> modèle 'chine' (saisie directe FCFA).
                        // Aucun changement du calcul : on règle juste le modèle.
                        await setDoc(doc(db, "settings", `invoice_config_${depId}`), {
                            factureModel: wiz.depCurrency === 'EUR' ? 'paris' : 'chine',
                            updatedAt: new Date().toISOString()
                        }, { merge: true });
                        globalApp.showToast("Route créée avec succès !", "success");
                        showWizard.value = false;
                    } catch (e) {
                        console.error(e); globalApp.showToast("Erreur lors de la création.", "error");
                    } finally { saving.value = false; }
                };

                const openAddDest = (dep) => {
                    addDest.depId = dep.id; addDest.depName = dep.name; addDest.name = ''; addDest.flag = '';
                    showAddDest.value = true;
                };

                const saveAddDest = async () => {
                    const name = addDest.name.trim();
                    if (!name) return globalApp.showToast("Indiquez la destination.", "error");
                    const aid = `${slug(name)}_${addDest.depId}`;
                    if (exists(aid)) return globalApp.showToast("Cette destination existe déjà pour ce départ.", "error");
                    saving.value = true;
                    try {
                        await setDoc(doc(db, "agencies_config", aid), {
                            name, type: 'arrival', appFolder: 'abidjan',
                            flag: addDest.flag || '🏳️', prefix: '', updatedAt: new Date().toISOString()
                        });
                        globalApp.showToast("Destination ajoutée !", "success");
                        showAddDest.value = false;
                    } catch (e) {
                        console.error(e); globalApp.showToast("Erreur.", "error");
                    } finally { saving.value = false; }
                };

                const openEdit = (a) => {
                    edit.id = a.id; edit.name = a.name; edit.flag = a.flag || '🏳️';
                    showEdit.value = true;
                };

                const saveEdit = async () => {
                    if (!edit.name.trim()) return globalApp.showToast("Le nom est requis.", "error");
                    saving.value = true;
                    try {
                        await setDoc(doc(db, "agencies_config", edit.id),
                            { name: edit.name.trim(), flag: edit.flag || '🏳️', updatedAt: new Date().toISOString() },
                            { merge: true });
                        globalApp.showToast("Enregistré.", "success");
                        showEdit.value = false;
                    } catch (e) { globalApp.showToast("Erreur.", "error"); }
                    finally { saving.value = false; }
                };

                const removeAgency = async (a) => {
                    if (a.id === 'paris' || a.id === 'abidjan') return globalApp.showToast("Agence par défaut : suppression interdite.", "error");
                    if (!confirm(`Supprimer « ${a.name} » ? (les données déjà enregistrées ne sont pas effacées)`)) return;
                    try { await deleteDoc(doc(db, "agencies_config", a.id)); globalApp.showToast("Supprimé.", "success"); }
                    catch (e) { globalApp.showToast("Erreur de suppression.", "error"); }
                };

                // Ouvre la modale Devise & modèle. Charge le factureModel courant
                // depuis settings/invoice_config_<depId> (la devise vit déjà sur
                // agencies_config). Si le doc n'existe pas (cas Paris/Abidjan
                // par défaut, ou route créée avant), on tombe sur des valeurs
                // suggérées selon la devise.
                const openCurrencyModel = async (dep) => {
                    cm.depId = dep.id;
                    cm.depName = dep.name;
                    cm.currency = dep.currency || (dep.id === 'paris' ? 'EUR' : 'XOF');
                    cm.factureModel = cm.currency === 'EUR' ? 'paris' : 'chine';
                    cm.loading = true;
                    showCurrencyModel.value = true;
                    try {
                        const snap = await getDoc(doc(db, 'settings', `invoice_config_${dep.id}`));
                        if (snap.exists() && snap.data().factureModel) {
                            cm.factureModel = snap.data().factureModel;
                        }
                    } catch (e) { console.warn('Lecture invoice_config :', e && e.message); }
                    finally { cm.loading = false; }
                };

                const saveCurrencyModel = async () => {
                    if (!cm.depId) return;
                    saving.value = true;
                    try {
                        // 1) Devise -> agencies_config.<depId>.currency
                        //    Paris/Abidjan sont des agences par défaut hors Firestore :
                        //    on crée/merge le doc pour porter la devise.
                        await setDoc(doc(db, 'agencies_config', cm.depId),
                            { currency: cm.currency, updatedAt: new Date().toISOString() },
                            { merge: true });
                        // 2) Modèle de facturation -> settings/invoice_config_<depId>.factureModel
                        await setDoc(doc(db, 'settings', `invoice_config_${cm.depId}`),
                            { factureModel: cm.factureModel, updatedAt: new Date().toISOString() },
                            { merge: true });
                        // Met à jour le cache local pour que les écrans qui lisent
                        // AGENCIES (formatMoneyLocal, isEurAgency) voient le bon
                        // symbole sans recharger.
                        try {
                            const cache = JSON.parse(localStorage.getItem('amt_agencies_config') || '{}');
                            if (cache[cm.depId]) cache[cm.depId].currency = cm.currency;
                            localStorage.setItem('amt_agencies_config', JSON.stringify(cache));
                        } catch (e) { /* cache illisible : ok */ }
                        globalApp.showToast("Devise et modèle de facturation enregistrés ✔", "success");
                        showCurrencyModel.value = false;
                    } catch (e) {
                        console.error(e); globalApp.showToast("Erreur lors de l'enregistrement.", "error");
                    } finally { saving.value = false; }
                };

                const removeDeparture = async (r) => {
                    if (r.departure.id === 'paris') return globalApp.showToast("Agence par défaut : suppression interdite.", "error");
                    if (r.arrivals.length > 0) return globalApp.showToast("Supprimez d'abord les destinations de cette route.", "error");
                    await removeAgency(r.departure);
                };

                return {
                    agencies, loading, saving, routes, slug, wizPreview,
                    showWizard, wiz, openWizard, saveRoute,
                    showAddDest, addDest, openAddDest, saveAddDest,
                    showEdit, edit, openEdit, saveEdit,
                    showCurrencyModel, cm, openCurrencyModel, saveCurrencyModel,
                    removeAgency, removeDeparture
                };
            }
        });

        this.vueApp.mount('#vue-agencies-app');
    }
};
