import { db } from '../../../firebase-config.js';
import { collection, doc, writeBatch, getDocs, query, where, limit } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { CONSTANTS } from '../../../constants.js';
import { createApp, ref, reactive, computed, onMounted } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";
import { getCollectionName } from '../../../agencies-config.js';
import { isAffiliationActive } from '../../../affiliation-config.js';
import { getAffiliation, ensureAffiliation } from '../../../affiliations.js';

export const NouvelleFactureView = {
    vueApp: null,

    render(app) {
        const globalApp = app;
        window.app.views = window.app.views || {};
        window.app.views.nouvelleFacture = this;

        const html = `
            <style>
                [v-cloak] { display: none; }
                .nf-item-grid {
                    display: grid;
                    grid-template-columns: 2fr 0.6fr 1fr 1fr auto;
                    gap: 10px;
                }
                @media (max-width: 768px) {
                    .nf-item-grid {
                        grid-template-columns: 1fr 1fr;
                        gap: 15px;
                    }
                    .nf-item-grid .nf-desc-col { grid-column: 1 / -1; }
                    .nf-item-grid .nf-total-col { grid-column: 1; }
                    .nf-item-grid .nf-action-col {
                        grid-column: 2;
                        display: flex;
                        align-items: flex-end;
                    }
                    .nf-item-grid input {
                        padding: 12px !important;
                        font-size: 15px !important;
                    }
                    .nf-item-grid .item-qty { font-size: 18px !important; font-weight: bold; }
                }
            </style>
            <div id="vue-nouvellefacture-app" style="max-width: 1000px; margin: 0 auto; animation: fadeIn 0.3s ease-in-out;" v-cloak>
                
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 15px; margin-bottom: 25px; background: white; padding: 20px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; flex-wrap: wrap;">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <div style="background: #eff6ff; color: #3b82f6; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; border-radius: 12px; font-size: 24px;">
                            <i class="fas fa-file-invoice"></i>
                        </div>
                        <div>
                            <h2 style="margin: 0; color: #0f172a; font-size: 22px;">Nouvelle Facture / Envoi</h2>
                            <p style="margin: 0; color: #64748b; font-size: 13px;">Créer une nouvelle expédition depuis Paris</p>
                        </div>
                    </div>
                    <div id="nfActiveContainerBadge" style="padding: 10px 20px; background: #e0f2fe; color: #0369a1; border: 2px solid #bae6fd; border-radius: 12px; font-weight: 900; font-size: 20px; box-shadow: 0 2px 4px rgba(3,105,161,0.1); display: flex; align-items: center; gap: 10px;" title="Conteneur Actif">
                        <i v-if="!currentContainer" class="fas fa-spinner fa-spin"></i>
                        <span v-else>📦 {{ currentContainer }}</span>
                    </div>
                </div>

                <!-- 1. INFO GÉNÉRALES -->
                <div class="form-card" style="box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                    <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 15px; display: flex; align-items: center; gap: 10px;"><i class="fas fa-calendar-alt text-blue-500"></i> Informations générales</h3>
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Date</label>
                            <input type="date" id="nfDate" value="${new Date().toISOString().split('T')[0]}">
                        </div>
                        <div class="form-group">
                            <label>Type</label>
                            <select id="nfType">
                                <option value="FACTURE">FACTURE</option>
                                <option value="DEVIS">DEVIS</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Agence destination *</label>
                            <select id="nfAgence" required>
                                <option value="ABIDJAN">ABIDJAN</option>
                                <option value="BAMAKO">BAMAKO</option>
                                <option value="CONAKRY">CONAKRY</option>
                                <option value="DAKAR">DAKAR</option>
                                <option value="LIBREVILLE">LIBREVILLE</option>
                            </select>
                        </div>
                    </div>
                </div>

                <!-- 2. CONTACTS -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 350px), 1fr)); gap: 20px;">
                    <div class="form-card" style="box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                        <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 15px; display: flex; align-items: center; gap: 10px;"><i class="fas fa-upload text-orange-500"></i> Expéditeur</h3>
                        <div class="form-group">
                            <div style="position: relative;">
                                <input type="text" id="nfExpediteur" placeholder="Nom, Prénom et Téléphone..." required autocomplete="off">
                                <ul id="nfExpediteurSuggestions" class="autocomplete-suggestions"></ul>
                            </div>
                        </div>
                        <div id="nfExpediteurFeedback" style="font-size: 12px; color: #64748b; margin-top: 5px;"></div>
                    </div>
                    
                    <div class="form-card" style="box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                        <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 15px; display: flex; align-items: center; gap: 10px;"><i class="fas fa-download text-emerald-500"></i> Destinataire</h3>
                        <div class="form-group">
                            <div style="position: relative;">
                                <input type="text" id="nfDestinataire" placeholder="Nom, Prénom et Téléphone..." required autocomplete="off">
                                <ul id="nfDestinataireSuggestions" class="autocomplete-suggestions"></ul>
                            </div>
                        </div>
                        <div id="nfDestinataireFeedback" style="font-size: 12px; color: #64748b; margin-top: 5px;"></div>
                        <div class="form-group" v-if="affiliationActive" style="margin-top: 15px;">
                            <label><i class="fas fa-user-friends" style="color:#d97706;"></i> Parrain (parrainage)</label>
                            <select v-model="form.parrainId" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box; outline:none; background:white;">
                                <option value="">— Aucun parrain —</option>
                                <option v-for="d in demarcheurs" :key="d.id" :value="d.id">{{ d.prenom }} {{ d.nom }}</option>
                            </select>
                            <div style="font-size:11px; color:#94a3b8; margin-top:4px;">Si ce destinataire est déjà affilié, son parrain d'origine est conservé (rattachement permanent).</div>
                        </div>
                        <div class="form-group" style="margin-top: 15px;">
                            <label>Lieu livraison / Adresse complète</label>
                            <div style="position: relative;">
                                <input type="text" id="nfLieu" placeholder="Ex: Cocody Angré 8ème tranche..." autocomplete="off">
                                <ul id="nfLieuSuggestions" class="autocomplete-suggestions"></ul>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 3. ARTICLES / COLIS -->
                <div class="form-card" style="box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 15px; flex-wrap: wrap; gap: 10px;">
                        <h3 style="margin: 0; display: flex; align-items: center; gap: 10px;"><i class="fas fa-box text-indigo-500"></i> Description colis</h3>
                        <button class="btn btn-outline btn-small" id="nfAddRowBtn"><i class="fas fa-plus"></i> Ajouter ligne</button>
                    </div>
                    
                    <div style="width: 100%;">
                        <div id="nfItemsContainer">
                            <!-- Les lignes seront générées ici par JS -->
                        </div>
                    </div>
                </div>

                <!-- 4. PAIEMENT & VALIDATION -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 350px), 1fr)); gap: 20px;">
                    
                    <div class="form-card" style="box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                        <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 15px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;"><i class="fas fa-credit-card text-purple-500"></i> Paiement</h3>
                        
                        <div class="form-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
                            <div class="form-group">
                                <label>Mode paiement *</label>
                                <select id="nfModePay">
                                    <option value="ESPECES">ESPÈCES</option>
                                    <option value="CB">CARTE BANCAIRE (CB)</option>
                                    <option value="VIREMENTS">VIREMENT</option>
                                    <option value="CHEQUES">CHÈQUE</option>
                                    <option value="BON D ENVOI">BON D'ENVOI</option>
                                    <option value="NON PAYE">NON PAYÉ (À régler à Abidjan)</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Valeur déclarée colis (€)</label>
                                <input type="number" id="nfValeur" placeholder="Optionnel">
                            </div>
                            <div class="form-group">
                                <label>Volume (CBM) <i class="fas fa-info-circle" style="color:#3b82f6;" title="Alimente la jauge globale de l'agence"></i></label>
                                <input type="number" step="0.01" id="nfVolume" placeholder="Ex: 0.5">
                            </div>
                        </div>

                        <div style="background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; margin-top: 15px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-size: 16px; flex-wrap: wrap; gap: 10px;">
                                <span>Total Fret :</span>
                                <strong id="nfTotalFret">0 €</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 10px;">
                                <span>Montant Payé (€) :</span>
                                <input type="number" id="nfMontantPaye" value="0" style="width: 120px; max-width: 100%; text-align: right; font-weight: bold; color: #10b981;">
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 18px; border-top: 1px dashed #cbd5e1; padding-top: 10px; flex-wrap: wrap; gap: 10px;">
                                <span>Reste à Payer :</span>
                                <strong id="nfReste" style="color: #ef4444;">0 €</strong>
                            </div>
                        </div>
                    </div>

                    <div class="form-card" style="display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                        <div>
                            <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 15px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;"><i class="fas fa-comment-dots text-slate-500"></i> Notes</h3>
                            <textarea id="nfComment" rows="4" placeholder="Instructions spéciales, contenu exact..." style="width: 100%; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; font-family: inherit; resize: none;"></textarea>
                        </div>
                        <button id="nfSubmitBtn" class="btn btn-primary" style="width: 100%; padding: 16px; font-size: 16px; margin-top: 15px; display: flex; justify-content: center; gap: 10px;">
                            <i class="fas fa-check-circle"></i> Enregistrer la facture
                        </button>
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
            const currentContainer = ref('');
            const saving = ref(false);
            
            const clientsData = ref(new Map());
            const destMap = ref(new Map());
            const destInfos = ref(new Map());
            const destExpMap = ref(new Map());
            const productsData = ref(new Map());
            const availableDests = ref([]);
            const availableCommunes = ref([]);
            
            const form = reactive({
                date: new Date().toISOString().split('T')[0],
                type: 'FACTURE',
                agence: 'ABIDJAN',
                expediteur: '',
                destinataire: '',
                lieu: '',
                modePay: 'ESPECES',
                valeur: '',
                volume: '',
                montantPaye: 0,
                comment: '',
                parrainId: ''
            });

            // Parrainage : actif selon le flag agence (source unique affiliation-config).
            const affiliationActive = isAffiliationActive(sessionStorage.getItem('currentActiveAgency') || 'paris');
            const demarcheurs = ref([]);
            if (affiliationActive) {
                getDocs(collection(db, 'demarcheurs')).then(s => {
                    demarcheurs.value = s.docs.map(d => ({ id: d.id, ...d.data() }));
                }).catch(e => console.warn('Chargement démarcheurs:', e));
            }
            
            const items = ref([{ id: Date.now(), desc: '', qty: 1, pu: 0, total: 0, vol: 0, showSugg: false }]);
            
            // Feedback states
            const expFeedback = ref('');
            const destFeedback = ref('');
            
            // UI states for suggestions
            const showExpSugg = ref(false);
            const showDestSugg = ref(false);
            const showLieuSugg = ref(false);

            // Loading Data
            const loadAutocompleteData = async () => {
                try {
                    const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
                    const clientsSnap = await getDocs(query(collection(db, getCollectionName("clients")), where("agency", "==", activeAgency)));
                    const cd = new Map();
                    clientsSnap.forEach(doc => {
                        const data = doc.data();
                        if (data.nom) cd.set(data.nom.trim(), data);
                    });
                    clientsData.value = cd;

                    const livSnap = await getDocs(query(collection(db, getCollectionName("livraisons")), where("agency", "==", activeAgency)));
                    const communesSet = new Set(['ABOBO', 'ADJAME', 'ATTECOUBE', 'BINGERVILLE', 'COCODY', 'KOUMASSI', 'MARCORY', 'PLATEAU', 'PORT-BOUET', 'YOPOUGON', 'PAS DE LIVRAISON (Retrait Entrepôt)']);
                    const destSet = new Set();
                    const dMap = new Map();
                    const dInfos = new Map();
                    const dExpMap = new Map();

                    livSnap.forEach(doc => {
                        const data = doc.data();
                        if (data.lieuLivraison && data.lieuLivraison.trim() !== '') {
                            communesSet.add(data.lieuLivraison.trim());
                        }
                        if (data.destinataire && data.destinataire.trim() !== '') {
                            const destName = data.destinataire.trim();
                            destSet.add(destName);
                            if (data.lieuLivraison && !dMap.has(destName)) dMap.set(destName, data.lieuLivraison.trim());
                            if (data.expediteur && !dExpMap.has(destName)) dExpMap.set(destName, data.expediteur.trim());
                        }
                    });

                    availableCommunes.value = Array.from(communesSet).sort();
                    availableDests.value = Array.from(destSet).sort();
                    destMap.value = dMap;
                    destInfos.value = dInfos;
                    destExpMap.value = dExpMap;

                    const prodSnap = await getDocs(collection(db, getCollectionName("products")));
                    const pd = new Map();
                    prodSnap.forEach(doc => {
                        const data = doc.data();
                        if (data.desc) pd.set(data.desc.trim(), data);
                    });
                    productsData.value = pd;
                    
                    const { getDoc, doc: fsDoc } = await import("https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js");
                    const configSnap = await getDoc(fsDoc(db, "settings", `container_config_${activeAgency}`));
                    if (configSnap.exists() && configSnap.data().activeContainer) {
                        currentContainer.value = configSnap.data().activeContainer.trim().toUpperCase();
                    } else {
                        currentContainer.value = 'ATT';
                    }
                } catch (e) {
                    console.error("Erreur de chargement :", e);
                }
            };

            onMounted(async () => {
                await loadAutocompleteData();
                const reuseExp = sessionStorage.getItem('reuseExpediteur');
                if (reuseExp) {
                    form.expediteur = reuseExp;
                    handleExpediteurChange();
                    sessionStorage.removeItem('reuseExpediteur');
                }
            });

            // Computed suggestions
            const expQuery = computed(() => form.expediteur.toLowerCase().trim());
            const filteredExpediteurs = computed(() => {
                if (expQuery.value.length < 2) return [];
                return Array.from(clientsData.value.values())
                    .filter(c => (c.nom && c.nom.toLowerCase().includes(expQuery.value)) || (c.tel && c.tel.includes(expQuery.value)))
                    .slice(0, 8);
            });

            const destQuery = computed(() => form.destinataire.toLowerCase().trim());
            const filteredDestinataires = computed(() => {
                if (destQuery.value.length < 2) return [];
                let matches = Array.from(destMap.value.keys()).filter(d => d.toLowerCase().includes(destQuery.value));
                if (matches.length < 5) {
                    const globalMatches = availableDests.value.filter(d => d.toLowerCase().includes(destQuery.value));
                    matches = [...new Set([...matches, ...globalMatches])];
                }
                return matches.slice(0, 8);
            });

            const lieuQuery = computed(() => form.lieu.toLowerCase().trim());
            const filteredLieux = computed(() => {
                if (lieuQuery.value.length < 2) return [];
                return availableCommunes.value.filter(c => c.toLowerCase().includes(lieuQuery.value)).slice(0, 8);
            });

            const getFilteredProducts = (queryText) => {
                if (!queryText || queryText.length < 2) return [];
                const q = queryText.toLowerCase();
                return Array.from(productsData.value.values()).filter(p => p.desc && p.desc.toLowerCase().includes(q)).slice(0, 8);
            };

            // Selection handlers
            const selectExp = (c) => { form.expediteur = c.nom; showExpSugg.value = false; handleExpediteurChange(); };
            const selectDest = (d) => { form.destinataire = d; showDestSugg.value = false; handleDestinataireChange(); };
            const selectLieu = (l) => { form.lieu = l; showLieuSugg.value = false; };
            const selectProduct = (item, p) => { item.desc = p.desc; item.showSugg = false; updateItem(item, 'desc'); };

            const hideSugg = (type, item = null) => {
                setTimeout(() => {
                    if (type === 'exp') showExpSugg.value = false;
                    if (type === 'dest') showDestSugg.value = false;
                    if (type === 'lieu') showLieuSugg.value = false;
                    if (type === 'prod' && item) item.showSugg = false;
                }, 200);
            };

            // Logic handlers
            const handleExpediteurChange = async () => {
                const exp = form.expediteur.trim();
                if (!exp) { expFeedback.value = ''; return; }
                
                if (clientsData.value.has(exp)) {
                    const info = clientsData.value.get(exp);
                    expFeedback.value = `<span style="color:#059669;"><i class="fas fa-check-circle"></i> <b>Tél:</b> ${info.tel || 'N/A'} | <b>Adresse:</b> ${info.adresse || 'N/A'}</span>`;
                } else {
                    expFeedback.value = `<span style="color:#f59e0b;"><i class="fas fa-exclamation-triangle"></i> Nouveau client expéditeur</span>`;
                }

                try {
                    const qLiv = query(collection(db, getCollectionName("livraisons")), where("expediteur", "==", exp));
                    const livSnap = await getDocs(qLiv);
                    
                    const localDestMap = new Map();
                    livSnap.forEach(doc => {
                        const data = doc.data();
                        if (data.destinataire && data.destinataire.trim()) {
                            const destName = data.destinataire.trim();
                            localDestMap.set(destName, data.lieuLivraison || '');
                            destMap.value.set(destName, data.lieuLivraison || '');
                            destInfos.value.set(destName, data.numero || '');
                        }
                    });

                    const uniqueDests = Array.from(localDestMap.keys());
                    if (uniqueDests.length > 0) {
                        if (uniqueDests.length === 1) {
                            if (!form.destinataire || form.destinataire !== uniqueDests[0]) {
                                form.destinataire = uniqueDests[0];
                                handleDestinataireChange();
                            }
                        } else {
                            expFeedback.value += `<br><span style="color:#3b82f6;"><i class="fas fa-info-circle"></i> ${uniqueDests.length} destinataires trouvés. Utilisez la flèche pour choisir.</span>`;
                        }
                    }
                } catch (error) {
                    console.error("Erreur de recherche des destinataires :", error);
                }
            };

            const handleDestinataireChange = async () => {
                const dest = form.destinataire.trim();
                if (!dest) {
                    destFeedback.value = '';
                    form.lieu = '';
                    return;
                }

                let lieu = '', num = '', exp = '', isFound = false;
                
                if (destMap.value.has(dest)) {
                    lieu = destMap.value.get(dest);
                    num = destInfos.value.get(dest);
                    isFound = true;
                } else {
                    const qLiv = query(collection(db, getCollectionName("livraisons")), where("destinataire", "==", dest), limit(1));
                    const snap = await getDocs(qLiv);
                    if (!snap.empty) {
                        const data = snap.docs[0].data();
                        lieu = data.lieuLivraison || data.commune || '';
                        num = data.numero || '';
                        exp = data.expediteur || '';
                        isFound = true;
                    }
                }
                
                if (!exp && destExpMap.value.has(dest)) exp = destExpMap.value.get(dest);

                if (isFound && exp && !form.expediteur) {
                    form.expediteur = exp;
                    handleExpediteurChange();
                }

                if (isFound && !form.lieu) form.lieu = lieu;

                if (isFound) destFeedback.value = `<span style="color:#059669;"><i class="fas fa-check-circle"></i> <b>Tél:</b> ${num || 'N/A'}</span>`;
                else destFeedback.value = `<span style="color:#f59e0b;"><i class="fas fa-exclamation-triangle"></i> Nouveau destinataire</span>`;
            };

            const addRow = () => items.value.push({ id: Date.now(), desc: '', qty: 1, pu: 0, total: 0, vol: 0, showSugg: false });
            const removeRow = (id) => { if (items.value.length > 1) items.value = items.value.filter(i => i.id !== id); };

            const updateItem = (item, field) => {
                if (field === 'desc' && productsData.value.has(item.desc)) {
                    const prod = productsData.value.get(item.desc);
                    item.pu = parseFloat(prod.price) || 0;
                    item.vol = parseFloat(prod.dim) || 0;
                }
                item.total = (parseFloat(item.qty) || 0) * (parseFloat(item.pu) || 0);
                const totalVol = items.value.reduce((sum, i) => sum + ((i.vol || 0) * i.qty), 0);
                if (totalVol > 0) form.volume = parseFloat(totalVol.toFixed(2));
            };

            const totalFret = computed(() => items.value.reduce((sum, item) => sum + item.total, 0));
            const resteAPayer = computed(() => totalFret.value - (parseFloat(form.montantPaye) || 0));

            const submitInvoice = async () => {
                if (!form.expediteur || !form.destinataire || items.value[0].desc === '') {
                    globalApp.showToast("Veuillez remplir l'Expéditeur, le Destinataire et au moins une Description d'article.", "error");
                    return;
                }

                saving.value = true;

                const TAUX = CONSTANTS.TAUX_CONVERSION;
                const totalEUR = totalFret.value;
                const payeEUR = parseFloat(form.montantPaye) || 0;
                const resteEUR = totalEUR - payeEUR;
                
                const totalCFA = Math.round(totalEUR * TAUX);
                const payeCFA = Math.round(payeEUR * TAUX);
                const resteCFA = Math.round(resteEUR * TAUX);

                const batch = writeBatch(db);
                const dateIso = form.date || new Date().toISOString().split('T')[0];
                const volumeCBM = parseFloat(form.volume) || 0;
                
                let expPhone = '', expAddr = '';
                const expMatch = form.expediteur.match(/(.*?)\s*((?:\+|00)?\d{8,})/);
                let finalExpName = form.expediteur;
                if (expMatch) { finalExpName = expMatch[1].trim(); expPhone = expMatch[2].trim(); }
                if (clientsData.value.has(finalExpName)) {
                    const cData = clientsData.value.get(finalExpName);
                    if (!expPhone) expPhone = cData.tel || '';
                    if (!expAddr) expAddr = cData.adresse || '';
                }

                let destPhone = '';
                const destMatch = form.destinataire.match(/(.*?)\s*((?:\+|00)?\d{8,})/);
                let finalDestName = form.destinataire;
                if (destMatch) { finalDestName = destMatch[1].trim(); destPhone = destMatch[2].trim(); }
                if (!destPhone && destInfos.value.has(finalDestName)) destPhone = destInfos.value.get(finalDestName) || '';

                const lieuLivraison = form.lieu.trim();
                const userName = sessionStorage.getItem('userName') || 'Agent Paris';
                let initials = sessionStorage.getItem('userInitials');

                if (!initials) {
                    const initialsMatch = userName.match(/\b\w/g) || ['A', 'P'];
                    initials = initialsMatch.join('').substring(0, 2).toUpperCase();
                }

                const conteneurCode = currentContainer.value || 'ATT';
                const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
                const qContainer = query(collection(db, getCollectionName("transactions")), where("conteneur", "==", conteneurCode), where("agency", "==", activeAgency));
                const containerSnap = await getDocs(qContainer);
                const orderNum = (containerSnap.size + 1).toString().padStart(3, '0');
                const ref = `${initials}-${orderNum}-${conteneurCode}`;

                // --- AFFILIATION (parrainage) : lien persistant destinataire ↔ démarcheur ---
                // Non bloquant : toute erreur ici ne doit pas empêcher la facture.
                let affiliationDemarcheurId = null;
                if (affiliationActive && destPhone) {
                    try {
                        const existing = await getAffiliation(destPhone);
                        if (existing && existing.demarcheurId) {
                            affiliationDemarcheurId = existing.demarcheurId; // rattachement permanent : 1er gagnant
                        } else if (form.parrainId) {
                            const dem = demarcheurs.value.find(d => d.id === form.parrainId);
                            await ensureAffiliation({
                                phone: destPhone,
                                clientName: finalDestName,
                                demarcheurId: form.parrainId,
                                demarcheurName: dem ? `${dem.prenom || ''} ${dem.nom || ''}`.trim() : '',
                                agency: activeAgency,
                                createdBy: userName
                            });
                            affiliationDemarcheurId = form.parrainId;
                        }
                    } catch (e) { console.warn('Affiliation (non bloquant):', e); }
                }

                const totalColis = items.value.reduce((sum, item) => sum + item.qty, 0);
                const generatedLabels = [];
                const printLabelsData = [];
                let labelIndex = 1;

                items.value.forEach(item => {
                    for (let i = 0; i < item.qty; i++) {
                        const uniqueId = Math.floor(10 + Math.random() * 90);
                        const sousRef = `${ref}_${labelIndex}_${uniqueId}`;
                        generatedLabels.push(sousRef);
                        printLabelsData.push({ sousRef: sousRef, desc: item.desc, index: labelIndex, total: totalColis });
                        labelIndex++;
                    }
                });

                const livRef = doc(collection(db, getCollectionName("livraisons")));
                batch.set(livRef, {
                    demarcheurId: affiliationDemarcheurId,
                    ref: ref, labels: generatedLabels, conteneur: conteneurCode, volumeCBM: volumeCBM,
                    expediteur: finalExpName, destinataire: finalDestName, numero: destPhone, lieuLivraison: lieuLivraison,
                    description: items.value.map(i => `${i.qty}x ${i.desc}`).join(', '),
                    quantite: totalColis, montant: resteCFA + " CFA", prixOriginal: totalCFA + " CFA",
                    status: "EN_ATTENTE", containerStatus: "PARIS", agency: activeAgency, dateAjout: new Date(dateIso).toISOString()
                });

                const transRef = doc(collection(db, getCollectionName("transactions")));
                batch.set(transRef, {
                    demarcheurId: affiliationDemarcheurId,
                    reference: ref, nom: finalExpName, nomDestinataire: finalDestName, numero: destPhone, tel: expPhone,
                    adresseDestinataire: lieuLivraison, conteneur: conteneurCode, volumeCBM: volumeCBM, date: dateIso,
                    prix: totalCFA, montantParis: payeCFA, montantAbidjan: 0, reste: -resteCFA,
                    modePaiement: form.modePay, description: items.value.map(i => `${i.qty}x ${i.desc}`).join(', '),
                    items: items.value, quantite: totalColis, agency: activeAgency, isDeleted: false,
                    saisiPar: userName,
                    paymentHistory: payeCFA > 0 ? [{ date: dateIso, montantParis: payeCFA, montantAbidjan: 0, modePaiement: form.modePay, saisiPar: userName }] : []
                });

                if (conteneurCode && conteneurCode !== 'ATT') {
                    const containerRef = doc(db, getCollectionName("containers"), conteneurCode);
                    batch.set(containerRef, { number: conteneurCode, status: 'EN_CHARGEMENT', destination: form.agence || 'ABIDJAN', createdAt: new Date(dateIso).toISOString() }, { merge: true });
                }

                try {
                    await batch.commit();
                    globalApp.showToast("Facture créée et synchronisée vers Abidjan !", "success");
                    
                    const now = new Date();
                    const formattedDate = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
                    
                    globalApp.printLabels({ ref: ref, date: formattedDate, destName: finalDestName, destPhone: destPhone, destAddress: lieuLivraison, expName: finalExpName, expAddress: expAddr, labels: printLabelsData });

                    globalApp.renderPage('dashboard');
                } catch(e) {
                    console.error(e);
                    globalApp.showToast("Erreur lors de l'enregistrement", "error");
                } finally {
                    saving.value = false;
                }
            };

            return {
                form, items, currentContainer, saving,
                expFeedback, destFeedback,
                showExpSugg, showDestSugg, showLieuSugg,
                filteredExpediteurs, filteredDestinataires, filteredLieux, getFilteredProducts,
                handleExpediteurChange, handleDestinataireChange,
                selectExp, selectDest, selectLieu, selectProduct, hideSugg,
                addRow, removeRow, updateItem, totalFret, resteAPayer, submitInvoice,
                affiliationActive, demarcheurs
            };
        }
    });

    this.vueApp.mount('#vue-nouvellefacture-app');
}
};