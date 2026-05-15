import { db } from '../../../firebase-config.js';
import { collection, doc, writeBatch, getDocs, query, where, limit } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { createApp, ref, reactive, computed, onMounted } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";

export const NouveauDevisView = {
    vueApp: null,

    render(app) {
        const globalApp = app;
        window.app.views = window.app.views || {};
        window.app.views.nouveauDevis = this;

        const html = `
            <style>[v-cloak] { display: none; }</style>
            <div id="vue-nouveaudevis-app" style="max-width: 1000px; margin: 0 auto; animation: fadeIn 0.3s ease-in-out;" v-cloak>
                
                <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 25px; background: white; padding: 20px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
                    <div style="background: #fef3c7; color: #f59e0b; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; border-radius: 12px; font-size: 24px;">
                        <i class="fas fa-file-signature"></i>
                    </div>
                    <div>
                        <h2 style="margin: 0; color: #0f172a; font-size: 22px;">Nouveau Devis</h2>
                        <p style="margin: 0; color: #64748b; font-size: 13px;">Créer une proposition commerciale détaillée</p>
                    </div>
                </div>

                <!-- 1. INFO GÉNÉRALES -->
                <div class="form-card" style="box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                    <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 15px; display: flex; align-items: center; gap: 10px;"><i class="fas fa-calendar-alt text-blue-500"></i> Informations générales</h3>
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Date</label>
                            <input type="date" v-model="form.date">
                        </div>
                        <div class="form-group">
                            <label>Date de validité</label>
                            <input type="date" v-model="form.validite">
                        </div>
                        <div class="form-group">
                            <label>Volume total</label>
                            <input type="number" step="0.01" v-model.number="form.volume" placeholder="Ex: 12.50 (m³)">
                        </div>
                        <div class="form-group">
                            <label>Devise</label>
                            <select v-model="form.devise">
                                <option value="EUR">Euro (EUR)</option>
                                <option value="FCFA">Franc CFA (FCFA)</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Agence destination *</label>
                            <select v-model="form.agence" required>
                                <option value="ABIDJAN">ABIDJAN</option>
                                <option value="BAMAKO">BAMAKO</option>
                                <option value="CONAKRY">CONAKRY</option>
                                <option value="DAKAR">DAKAR</option>
                                <option value="LIBREVILLE">LIBREVILLE</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Lieu de livraison prévu</label>
                            <div style="position: relative;">
                                <input type="text" v-model="form.lieu" @focus="showLieuSugg = true" @blur="hideSugg('lieu')" placeholder="Optionnel..." autocomplete="off">
                                <ul v-if="showLieuSugg && filteredLieux.length > 0" class="autocomplete-suggestions" style="display: block;">
                                    <li v-for="l in filteredLieux" :key="l" @mousedown.prevent="selectLieu(l)"><div style="font-weight: 600;">{{ l }}</div></li>
                                </ul>
                            </div>
                        </div>
                    </div>
                    <div class="form-group" style="margin-top: 15px;">
                        <label>Conditions du devis</label>
                        <textarea v-model="form.conditions" rows="3" placeholder="Conditions spécifiques à ce devis (ex: Acompte de 50% requis à la validation...)" style="width: 100%; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; font-family: inherit; resize: none;"></textarea>
                    </div>
                </div>

                <!-- 2. CONTACTS -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 350px), 1fr)); gap: 20px;">
                    <div class="form-card" style="box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                        <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 15px; display: flex; align-items: center; gap: 10px;"><i class="fas fa-upload text-orange-500"></i> Expéditeur (Client)</h3>
                        <div class="form-group">
                            <div style="position: relative;">
                                <input type="text" v-model="form.expediteur" @input="handleExpediteurChange(); showExpSugg = true" @focus="showExpSugg = true" @blur="hideSugg('exp')" placeholder="Rechercher nom ou téléphone..." required autocomplete="off">
                                <ul v-if="showExpSugg && filteredExpediteurs.length > 0" class="autocomplete-suggestions" style="display: block;">
                                    <li v-for="c in filteredExpediteurs" :key="c.nom" @mousedown.prevent="selectExp(c)">
                                        <div style="font-weight: 600;">{{ c.nom }}</div><div style="font-size: 11px; opacity: 0.7;">📞 {{ c.tel || 'N/A' }}</div>
                                    </li>
                                </ul>
                            </div>
                            <div style="font-size: 12px; color: #64748b; margin-top: 5px;" v-html="expFeedback"></div>
                        </div>
                    </div>
                    
                    <div class="form-card" style="box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                        <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 15px; display: flex; align-items: center; gap: 10px;"><i class="fas fa-download text-emerald-500"></i> Destinataire</h3>
                        <div class="form-group">
                            <div style="position: relative;">
                                <input type="text" v-model="form.destinataire" @input="handleDestinataireChange(); showDestSugg = true" @focus="showDestSugg = true" @blur="hideSugg('dest')" placeholder="Nom ou téléphone (Optionnel pour un devis)..." autocomplete="off">
                                <ul v-if="showDestSugg && filteredDestinataires.length > 0" class="autocomplete-suggestions" style="display: block;">
                                    <li v-for="d in filteredDestinataires" :key="d" @mousedown.prevent="selectDest(d)">
                                        <div style="font-weight: 600;">{{ d }}</div>
                                    </li>
                                </ul>
                            </div>
                            <div style="font-size: 12px; color: #64748b; margin-top: 5px;" v-html="destFeedback"></div>
                        </div>
                    </div>
                </div>

                <!-- 3. ARTICLES / COLIS -->
                <div class="form-card" style="box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 15px; flex-wrap: wrap; gap: 10px;">
                        <h3 style="margin: 0; display: flex; align-items: center; gap: 10px;"><i class="fas fa-box text-indigo-500"></i> Description des articles</h3>
                        <button class="btn btn-outline btn-small" @click="addRow"><i class="fas fa-plus"></i> Ajouter ligne</button>
                    </div>
                    
                    <div style="width: 100%;">
                        <div v-for="(item, index) in items" :key="item.id" class="form-grid" style="grid-template-columns: 2fr 0.5fr 1fr 1fr auto; align-items: end; background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 10px; border: 1px solid #e2e8f0;">
                            <div class="form-group" style="margin: 0;">
                                <label style="font-size: 11px;">Description *</label>
                                <div style="position: relative; width: 100%;">
                                    <input type="text" v-model="item.desc" @input="updateItem(item, 'desc')" @focus="item.showSugg = true" @blur="hideSugg('prod', item)" placeholder="Article..." style="margin: 0; width: 100%;" autocomplete="off">
                                    <ul v-if="item.showSugg && getFilteredProducts(item.desc).length > 0" class="autocomplete-suggestions" style="display: block;">
                                        <li v-for="p in getFilteredProducts(item.desc)" :key="p.desc" @mousedown.prevent="selectProduct(item, p)">
                                            <div style="font-weight: 600;">{{ p.desc }}</div><div style="font-size: 11px; opacity: 0.7;">Prix: {{ p.price || 0 }} €</div>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                            <div class="form-group" style="margin: 0;"><label style="font-size: 11px;">Qté *</label><input type="number" v-model.number="item.qty" @input="updateItem(item, 'qty')" min="1" style="margin: 0; text-align: center; width: 100%;"></div>
                            <div class="form-group" style="margin: 0;"><label style="font-size: 11px;">P.U *</label><input type="number" v-model.number="item.pu" @input="updateItem(item, 'pu')" min="0" style="margin: 0; text-align: right; width: 100%;"></div>
                            <div class="form-group" style="margin: 0;"><label style="font-size: 11px;">Total</label><input type="text" :value="item.total + ' ' + (form.devise === 'CFA' ? 'FCFA' : '€')" readonly style="margin: 0; background: #e2e8f0; font-weight: bold; text-align: right; width: 100%;"></div>
                            <button class="btn btn-danger btn-small" @click="removeRow(item.id)" style="height: 36px; display: flex; align-items: center; justify-content: center; width: 100%;" :disabled="items.length === 1"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                </div>

                <!-- 4. TOTAL & VALIDATION -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 350px), 1fr)); gap: 20px;">
                    
                    <div class="form-card" style="box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                        <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 15px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;"><i class="fas fa-calculator text-purple-500"></i> Résumé financier</h3>
                        
                        <div style="background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-size: 16px;">
                                <span>Montant HT :</span>
                                <strong>{{ totalHT }} {{ form.devise === 'CFA' ? 'FCFA' : '€' }}</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-size: 16px;">
                                <span>Remise :</span>
                                <input type="number" v-model.number="form.remise" style="width: 100px; text-align: right; padding: 4px;">
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 20px; border-top: 1px dashed #cbd5e1; padding-top: 10px; color: #0f172a;">
                                <span>Total Net :</span>
                                <strong>{{ totalNet }} {{ form.devise === 'CFA' ? 'FCFA' : '€' }}</strong>
                            </div>
                        </div>
                    </div>

                    <div class="form-card" style="display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                        <div>
                            <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 15px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;"><i class="fas fa-image text-slate-500"></i> Pièces jointes</h3>
                            <input type="file" multiple accept="image/*,.pdf" style="width: 100%; border: 1px dashed #cbd5e1; padding: 10px; border-radius: 8px; background: #f8fafc; cursor: pointer;">
                            <div style="font-size: 11px; color: #64748b; margin-top: 5px;">Photos ou documents (Optionnel)</div>
                        </div>
                        <button id="ndSubmitBtn" class="btn btn-primary" style="width: 100%; padding: 16px; font-size: 16px; margin-top: 20px; display: flex; justify-content: center; gap: 10px;">
                            <i class="fas fa-check-circle"></i> Enregistrer le devis
                        </button>
                    </div>

                </div>
            </div>
        `;

        document.getElementById('contentContainer').innerHTML = html;
        
        // --- Écouteurs pour la saisie intelligente ---
        document.getElementById('contentContainer').innerHTML = html;
        this.initVue(globalApp);
    },
    
    initVue(globalApp) {
        if (this.vueApp) this.vueApp.unmount();

        this.vueApp = createApp({
            setup() {
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
                    validite: '',
                    volume: '',
                    devise: 'EUR',
                    agence: 'ABIDJAN',
                    expediteur: '',
                    destinataire: '',
                    lieu: '',
                    conditions: '',
                    remise: 0
                });
                
                const items = ref([{ id: Date.now(), desc: '', qty: 1, pu: 0, total: 0, showSugg: false }]);
                
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
                        const clientsSnap = await getDocs(query(collection(db, "clients"), where("agency", "==", activeAgency)));
                        const cd = new Map();
                        clientsSnap.forEach(doc => {
                            const data = doc.data();
                            if (data.nom) cd.set(data.nom.trim(), data);
                        });
                        clientsData.value = cd;

                        const livSnap = await getDocs(query(collection(db, "livraisons"), where("agency", "==", activeAgency)));
                        const communesSet = new Set(['ABOBO', 'ADJAME', 'ATTECOUBE', 'BINGERVILLE', 'COCODY', 'KOUMASSI', 'MARCORY', 'PLATEAU', 'PORT-BOUET', 'YOPOUGON']);
                        const destSet = new Set();
                        const dMap = new Map();
                        const dInfos = new Map();
                        const dExpMap = new Map();

                        livSnap.forEach(doc => {
                            const data = doc.data();
                            if (data.lieuLivraison && data.lieuLivraison.trim() !== '') communesSet.add(data.lieuLivraison.trim());
                            if (data.destinataire && data.destinataire.trim() !== '') {
                                const destName = data.destinataire.trim();
                                destSet.add(destName);
                                if (data.lieuLivraison && !dMap.has(destName)) dMap.set(destName, data.lieuLivraison.trim());
                                if (data.numero && !dInfos.has(destName)) dInfos.set(destName, data.numero.trim());
                                if (data.expediteur && !dExpMap.has(destName)) dExpMap.set(destName, data.expediteur.trim());
                            }
                        });

                        availableCommunes.value = Array.from(communesSet).sort();
                        availableDests.value = Array.from(destSet).sort();
                        destMap.value = dMap;
                        destInfos.value = dInfos;
                        destExpMap.value = dExpMap;

                        const prodSnap = await getDocs(collection(db, "products"));
                        const pd = new Map();
                        prodSnap.forEach(doc => {
                            const data = doc.data();
                            if (data.desc) pd.set(data.desc.trim(), data);
                        });
                        productsData.value = pd;
                        
                    } catch (e) {
                        console.error("Erreur de chargement :", e);
                    }
                };

                onMounted(() => {
                    loadAutocompleteData();
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
                        const qLiv = query(collection(db, "livraisons"), where("expediteur", "==", exp));
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
                        const qLiv = query(collection(db, "livraisons"), where("destinataire", "==", dest), limit(1));
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

                const addRow = () => items.value.push({ id: Date.now(), desc: '', qty: 1, pu: 0, total: 0, showSugg: false });
                const removeRow = (id) => { if (items.value.length > 1) items.value = items.value.filter(i => i.id !== id); };

                const updateItem = (item, field) => {
                    if (field === 'desc' && productsData.value.has(item.desc)) {
                        item.pu = parseFloat(productsData.value.get(item.desc).price) || 0;
                    }
                    item.total = (parseFloat(item.qty) || 0) * (parseFloat(item.pu) || 0);
                };

                const totalHT = computed(() => items.value.reduce((sum, item) => sum + item.total, 0));
                const totalNet = computed(() => totalHT.value - (parseFloat(form.remise) || 0));

                const submitQuote = async () => {
                    if (!form.expediteur || items.value[0].desc === '') {
                        globalApp.showToast("Veuillez remplir l'Expéditeur et au moins un article.", "error");
                        return;
                    }

                    saving.value = true;
                    const ref = "DEV-" + Date.now().toString().slice(-6);
                    
                    const quoteData = {
                        reference: ref,
                        client: form.expediteur,
                        destinataire: form.destinataire,
                        date: form.date,
                        dateValidite: form.validite,
                        volume: parseFloat(form.volume) || 0,
                        devise: form.devise,
                        agence: form.agence,
                        lieuLivraison: form.lieu,
                        conditions: form.conditions,
                        items: items.value,
                        totalHT: totalHT.value,
                        remise: parseFloat(form.remise) || 0,
                        totalNet: totalNet.value,
                        status: "ENVOYÉ",
                        agency: sessionStorage.getItem('currentActiveAgency') || 'paris',
                        saisiPar: sessionStorage.getItem('userName') || 'Agent'
                    };

                    try {
                        const batch = writeBatch(db);
                        batch.set(doc(collection(db, "quotes")), quoteData);
                        await batch.commit();
                        
                        globalApp.showToast(`Devis ${ref} généré avec succès !`, "success");
                        globalApp.renderPage('quotes-list');
                    } catch(e) {
                        console.error(e);
                        globalApp.showToast("Erreur lors de l'enregistrement", "error");
                    } finally {
                        saving.value = false;
                    }
                };

                return {
                    form, items, saving,
                    expFeedback, destFeedback,
                    showExpSugg, showDestSugg, showLieuSugg,
                    filteredExpediteurs, filteredDestinataires, filteredLieux, getFilteredProducts,
                    handleExpediteurChange, handleDestinataireChange,
                    selectExp, selectDest, selectLieu, selectProduct, hideSugg,
                    addRow, removeRow, updateItem, totalHT, totalNet, submitQuote
                };
            }
        });

        this.vueApp.mount('#vue-nouveaudevis-app');
    }
};