import { db } from '../../../firebase-config.js';
import { collection, doc, writeBatch, getDocs, query, where, limit } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { Autocomplete } from './autocomplete.js';

export const NouveauDevisView = {
    items: [{ id: Date.now(), desc: '', qty: 1, pu: 0, total: 0 }],
    clientsData: new Map(),
    destMap: new Map(),
    destTel: new Map(),
    destExpediteurMap: new Map(),
    productsData: new Map(),

    render(app) {
        this.app = app;
        this.items = [{ id: Date.now(), desc: '', qty: 1, pu: 0, total: 0 }];
        this.destMap.clear();
        this.destTel.clear();
        this.destExpediteurMap.clear();
        this.availableDests = [];
        this.availableCommunes = [];

        const html = `
            <div style="max-width: 1000px; margin: 0 auto; animation: fadeIn 0.3s ease-in-out;">
                
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
                            <input type="date" id="ndDate" value="${new Date().toISOString().split('T')[0]}">
                        </div>
                        <div class="form-group">
                            <label>Date de validité</label>
                            <input type="date" id="ndValidite">
                        </div>
                        <div class="form-group">
                            <label>Volume total</label>
                            <input type="number" id="ndVolume" step="0.01" placeholder="Ex: 12.50 (m³)">
                        </div>
                        <div class="form-group">
                            <label>Devise</label>
                            <select id="ndDevise">
                                <option value="EUR">Euro (EUR)</option>
                                <option value="FCFA">Franc CFA (FCFA)</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Agence destination *</label>
                            <select id="ndAgence" required>
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
                                <input type="text" id="ndLieu" placeholder="Optionnel..." autocomplete="off">
                                <ul id="ndLieuSuggestions" class="autocomplete-suggestions"></ul>
                            </div>
                        </div>
                    </div>
                    <div class="form-group" style="margin-top: 15px;">
                        <label>Conditions du devis</label>
                        <textarea id="ndConditions" rows="3" placeholder="Conditions spécifiques à ce devis (ex: Acompte de 50% requis à la validation...)" style="width: 100%; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; font-family: inherit; resize: none;"></textarea>
                    </div>
                </div>

                <!-- 2. CONTACTS -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 350px), 1fr)); gap: 20px;">
                    <div class="form-card" style="box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                        <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 15px; display: flex; align-items: center; gap: 10px;"><i class="fas fa-upload text-orange-500"></i> Expéditeur (Client)</h3>
                        <div class="form-group">
                            <div style="position: relative;">
                                <input type="text" id="ndExpediteur" placeholder="Rechercher nom ou téléphone..." required autocomplete="off">
                                <ul id="ndExpediteurSuggestions" class="autocomplete-suggestions"></ul>
                            </div>
                            <div id="ndExpediteurFeedback" style="font-size: 12px; color: #64748b; margin-top: 5px;"></div>
                        </div>
                    </div>
                    
                    <div class="form-card" style="box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                        <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 15px; display: flex; align-items: center; gap: 10px;"><i class="fas fa-download text-emerald-500"></i> Destinataire</h3>
                        <div class="form-group">
                            <div style="position: relative;">
                                <input type="text" id="ndDestinataire" placeholder="Nom ou téléphone (Optionnel pour un devis)..." autocomplete="off">
                                <ul id="ndDestinataireSuggestions" class="autocomplete-suggestions"></ul>
                            </div>
                            <div id="ndDestinataireFeedback" style="font-size: 12px; color: #64748b; margin-top: 5px;"></div>
                        </div>
                    </div>
                </div>

                <!-- 3. ARTICLES / COLIS -->
                <div class="form-card" style="box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 15px; flex-wrap: wrap; gap: 10px;">
                        <h3 style="margin: 0; display: flex; align-items: center; gap: 10px;"><i class="fas fa-box text-indigo-500"></i> Description des articles</h3>
                        <button class="btn btn-outline btn-small" id="ndAddRowBtn"><i class="fas fa-plus"></i> Ajouter ligne</button>
                    </div>
                    
                    <div style="width: 100%;">
                        <div id="ndItemsContainer"></div>
                    </div>
                </div>

                <!-- 4. TOTAL & VALIDATION -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 350px), 1fr)); gap: 20px;">
                    
                    <div class="form-card" style="box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                        <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 15px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;"><i class="fas fa-calculator text-purple-500"></i> Résumé financier</h3>
                        
                        <div style="background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-size: 16px;">
                                <span>Montant HT :</span>
                                <strong id="ndTotalHT">0</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-size: 16px;">
                                <span>Remise :</span>
                                <input type="number" id="ndRemise" value="0" style="width: 100px; text-align: right; padding: 4px;">
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 20px; border-top: 1px dashed #cbd5e1; padding-top: 10px; color: #0f172a;">
                                <span>Total Net :</span>
                                <strong id="ndTotalNet">0</strong>
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
        const destInput = document.getElementById('ndDestinataire');
        const lieuInput = document.getElementById('ndLieu');

        if (destInput && lieuInput) {
            destInput.addEventListener('input', (e) => {
                const selectedDest = e.target.value.trim();
                if (this.destMap.has(selectedDest) && lieuInput.value.trim() === '') {
                    lieuInput.value = this.destMap.get(selectedDest);
                    lieuInput.style.backgroundColor = '#e0f2fe'; 
                    setTimeout(() => lieuInput.style.backgroundColor = '', 1000);
                }
            });
        }
        
        let expTimeout;
        document.getElementById('ndExpediteur').addEventListener('input', () => {
            clearTimeout(expTimeout);
            expTimeout = setTimeout(() => this.handleExpediteurChange(), 300);
        });
        
        let destTimeout;
        document.getElementById('ndDestinataire').addEventListener('input', () => {
            clearTimeout(destTimeout);
            destTimeout = setTimeout(() => this.handleDestinataireChange(), 300);
        });

        this.renderItems();
        this.loadAutocompleteData();

        document.getElementById('ndAddRowBtn').addEventListener('click', () => this.addRow());
        document.getElementById('ndRemise').addEventListener('input', () => this.calculateTotals());
        document.getElementById('ndDevise').addEventListener('change', () => this.calculateTotals());
        document.getElementById('ndSubmitBtn').addEventListener('click', () => this.submitQuote());
        
        Autocomplete.initCustom('ndExpediteur', 'ndExpediteurSuggestions',
            (q) => {
                const query = q.toLowerCase();
                return Array.from(this.clientsData.values()).filter(c => (c.nom && c.nom.toLowerCase().includes(query)) || (c.tel && c.tel.includes(query))).slice(0, 8);
            },
            (c) => `<div style="font-weight: 600;">${c.nom}</div><div style="font-size: 11px; opacity: 0.7;">📞 ${c.tel || 'N/A'}</div>`,
            (c, input) => { input.value = c.nom; this.handleExpediteurChange(); }
        );
        document.getElementById('ndExpediteur').addEventListener('input', (e) => { if(e.target.value.trim().length < 2) this.handleExpediteurChange(); });

        Autocomplete.initCustom('ndDestinataire', 'ndDestinataireSuggestions',
            (q) => {
                const query = q.toLowerCase();
                let matches = Array.from(this.destMap.keys()).filter(d => d.toLowerCase().includes(query));
                if (matches.length < 5) {
                    const globalMatches = (this.availableDests || []).filter(d => d.toLowerCase().includes(query));
                    matches = [...new Set([...matches, ...globalMatches])];
                }
                return matches.slice(0, 8);
            },
            (d) => `<div style="font-weight: 600;">${d}</div>`,
            (d, input) => { input.value = d; this.handleDestinataireChange(); }
        );
        document.getElementById('ndDestinataire').addEventListener('input', (e) => { if(e.target.value.trim().length < 2) this.handleDestinataireChange(); });

        Autocomplete.initCustom('ndLieu', 'ndLieuSuggestions',
            (q) => {
                const query = q.toLowerCase();
                const matches = (this.availableCommunes || []).filter(c => c.toLowerCase().includes(query));
                return matches.slice(0, 8);
            },
            (c) => `<div style="font-weight: 600;">${c}</div>`,
            (c, input) => { input.value = c; }
        );
    },

    async loadAutocompleteData() {
        try {
            const clientsSnap = await getDocs(collection(db, "clients"));
            this.clientsData.clear();
            clientsSnap.forEach(doc => {
                const data = doc.data();
                if (data.nom) this.clientsData.set(data.nom.trim(), data);
            });
            

            // NOUVEAU : Charger l'historique des destinataires (depuis les livraisons)
            const livSnap = await getDocs(collection(db, "livraisons"));
            const communesSet = new Set(['ABOBO', 'ADJAME', 'ATTECOUBE', 'BINGERVILLE', 'COCODY', 'KOUMASSI', 'MARCORY', 'PLATEAU', 'PORT-BOUET', 'YOPOUGON']);
            const destSet = new Set();

            livSnap.forEach(doc => {
                const data = doc.data();
                if (data.lieuLivraison && data.lieuLivraison.trim() !== '') communesSet.add(data.lieuLivraison.trim());
                if (data.destinataire && data.destinataire.trim() !== '') {
                    const destName = data.destinataire.trim();
                    destSet.add(destName);
                    if (data.lieuLivraison && !this.destMap.has(destName)) this.destMap.set(destName, data.lieuLivraison.trim());
                    if (data.numero && !this.destTel.has(destName)) this.destTel.set(destName, data.numero.trim());
                    if (data.expediteur && !this.destExpediteurMap.has(destName)) this.destExpediteurMap.set(destName, data.expediteur.trim());
                }
            });

            this.availableCommunes = Array.from(communesSet).sort();
            this.availableDests = Array.from(destSet).sort();

            const prodSnap = await getDocs(collection(db, "products"));
            this.productsData.clear();
            prodSnap.forEach(doc => {
                const data = doc.data();
                if (data.desc) this.productsData.set(data.desc.trim(), data);
            });
            
        } catch (e) {
            console.error("Erreur chargement auto-complétion :", e);
        }
    },

    async handleExpediteurChange() {
        const expediteur = document.getElementById('ndExpediteur').value.trim();
        const destinataireInput = document.getElementById('ndDestinataire');
        const feedbackExp = document.getElementById('ndExpediteurFeedback');
        
        if (!expediteur) {
            if(feedbackExp) feedbackExp.innerHTML = '';
            return;
        }

        if (this.clientsData && this.clientsData.has(expediteur)) {
            const clientInfo = this.clientsData.get(expediteur);
            if (feedbackExp) feedbackExp.innerHTML = `<span style="color:#059669;"><i class="fas fa-check-circle"></i> <b>Tél:</b> ${clientInfo.tel || 'N/A'} | <b>Adresse:</b> ${clientInfo.adresse || 'N/A'}</span>`;
        } else {
            if (feedbackExp) feedbackExp.innerHTML = `<span style="color:#f59e0b;"><i class="fas fa-exclamation-triangle"></i> Nouveau client expéditeur</span>`;
        }

        try {
            const qLiv = query(collection(db, "livraisons"), where("expediteur", "==", expediteur));
            const livSnap = await getDocs(qLiv);
            const localDestMap = new Map();
            
            livSnap.forEach(doc => {
                const data = doc.data();
                if (data.destinataire && data.destinataire.trim()) {
                    const destName = data.destinataire.trim();
                    localDestMap.set(destName, data.lieuLivraison || '');
                    this.destMap.set(destName, data.lieuLivraison || '');
                    this.destTel.set(destName, data.numero || '');
                }
            });

            const uniqueDests = Array.from(localDestMap.keys());
            if (uniqueDests.length > 0) {
                if (uniqueDests.length === 1) {
                    if (!destinataireInput.value || destinataireInput.value !== uniqueDests[0]) {
                        destinataireInput.value = uniqueDests[0];
                        this.handleDestinataireChange();
                    }
                } else {
                    if (feedbackExp) feedbackExp.innerHTML += `<br><span style="color:#3b82f6;"><i class="fas fa-info-circle"></i> ${uniqueDests.length} destinataires trouvés. Utilisez la flèche pour choisir.</span>`;
                }
            }
        } catch (error) {
            console.error("Erreur de recherche des destinataires :", error);
        }
    },

    async handleDestinataireChange() {
        const destinataireInput = document.getElementById('ndDestinataire');
        const lieuInput = document.getElementById('ndLieu');
        const feedbackDest = document.getElementById('ndDestinataireFeedback');
        const expInput = document.getElementById('ndExpediteur');
        
        const selectedDest = destinataireInput ? destinataireInput.value.trim() : '';
        if (!selectedDest) {
            if (feedbackDest) feedbackDest.innerHTML = '';
            if (lieuInput) lieuInput.value = '';
            return;
        }

         let lieu = '', num = '', exp = '', isFound = false;

        if (this.destMap && this.destMap.has(selectedDest)) {
            lieu = this.destMap.get(selectedDest);
            num = this.destTel.get(selectedDest);
            exp = this.destExpediteurMap.get(selectedDest) || '';
            isFound = true;
        } else {
            try {
                const qLiv = query(collection(db, "livraisons"), where("destinataire", "==", selectedDest), limit(1));
                const snap = await getDocs(qLiv);
                if (!snap.empty) {
                    lieu = snap.docs[0].data().lieuLivraison || snap.docs[0].data().commune || '';
                    num = snap.docs[0].data().numero || '';
                    exp = snap.docs[0].data().expediteur || '';
                    isFound = true;
                }
            } catch (e) { console.error(e); }
        }

        if (lieuInput && isFound && lieuInput.value.trim() === '') lieuInput.value = lieu || '';
        if (expInput && isFound && exp && expInput.value.trim() === '') {
            expInput.value = exp;
            expInput.style.backgroundColor = '#e0f2fe';
            setTimeout(() => expInput.style.backgroundColor = '', 1000);
            this.handleExpediteurChange();
        }
        if (isFound && feedbackDest) feedbackDest.innerHTML = `<span style="color:#059669;"><i class="fas fa-check-circle"></i> <b>Tél:</b> ${num || 'N/A'}</span>`;
        else if (feedbackDest) feedbackDest.innerHTML = `<span style="color:#f59e0b;"><i class="fas fa-exclamation-triangle"></i> Nouveau destinataire</span>`;
    },

    renderItems() {
        const container = document.getElementById('ndItemsContainer');
        const devise = document.getElementById('ndDevise')?.value === 'CFA' ? 'FCFA' : '€';

        container.innerHTML = this.items.map((item) => `
            <div class="form-grid" style="grid-template-columns: 2fr 0.5fr 1fr 1fr auto; align-items: end; background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 10px; border: 1px solid #e2e8f0;">
                <div class="form-group" style="margin: 0;">
                    <label style="font-size: 11px;">Description *</label>
                    <div style="position: relative; width: 100%;">
                        <input type="text" class="item-desc" id="ndProduct_${item.id}" data-id="${item.id}" value="${item.desc}" placeholder="Article..." style="margin: 0; width: 100%;" autocomplete="off">
                        <ul id="ndProductSuggestions_${item.id}" class="autocomplete-suggestions"></ul>
                    </div>
                </div>
                <div class="form-group" style="margin: 0;">
                    <label style="font-size: 11px;">Qté *</label>
                    <input type="number" class="item-qty" data-id="${item.id}" value="${item.qty}" min="1" style="margin: 0; text-align: center; width: 100%;">
                </div>
                <div class="form-group" style="margin: 0;">
                    <label style="font-size: 11px;">P.U *</label>
                    <input type="number" class="item-pu" data-id="${item.id}" value="${item.pu}" min="0" style="margin: 0; text-align: right; width: 100%;">
                </div>
                <div class="form-group" style="margin: 0;">
                    <label style="font-size: 11px;">Total</label>
                    <input type="text" value="${item.total} ${devise}" readonly style="margin: 0; background: #e2e8f0; font-weight: bold; text-align: right; width: 100%;">
                </div>
                <button class="btn btn-danger btn-small" onclick="window.ndRemoveRow(${item.id})" style="height: 36px; display: flex; align-items: center; justify-content: center; width: 100%;" ${this.items.length === 1 ? 'disabled' : ''}><i class="fas fa-trash"></i></button>
            </div>
        `).join('');

        document.querySelectorAll('.item-desc').forEach(el => el.addEventListener('input', (e) => this.updateItem(e, 'desc')));
        document.querySelectorAll('.item-qty').forEach(el => el.addEventListener('input', (e) => this.updateItem(e, 'qty')));
        document.querySelectorAll('.item-pu').forEach(el => el.addEventListener('input', (e) => this.updateItem(e, 'pu')));

        this.items.forEach(item => {
            Autocomplete.initCustom(`ndProduct_${item.id}`, `ndProductSuggestions_${item.id}`,
                (q) => {
                    const query = q.toLowerCase();
                    return Array.from(this.productsData.values()).filter(p => p.desc && p.desc.toLowerCase().includes(query)).slice(0, 8);
                },
                (p) => `<div style="font-weight: 600;">${p.desc}</div><div style="font-size: 11px; opacity: 0.7;">Prix: ${p.price || 0} €</div>`,
                (p, input) => {
                    input.value = p.desc;
                    input.dispatchEvent(new Event('input')); // Déclenche le calcul automatique
                }
            );
        });

        window.ndRemoveRow = (id) => {
            if (this.items.length > 1) {
                this.items = this.items.filter(i => i.id !== id);
                this.renderItems();
                this.calculateTotals();
            }
        };
    },

    addRow() {
        this.items.push({ id: Date.now(), desc: '', qty: 1, pu: 0, total: 0 });
        this.renderItems();
    },

    updateItem(e, field) {
        const id = parseInt(e.target.dataset.id);
        const item = this.items.find(i => i.id === id);
        if (item) {
            if (field === 'desc') {
                item.desc = e.target.value;
                if (this.productsData && this.productsData.has(item.desc)) {
                    item.pu = parseFloat(this.productsData.get(item.desc).price) || 0;
                    const puInput = document.querySelector(`.item-pu[data-id="${id}"]`);
                    if (puInput) puInput.value = item.pu;
                }
            }
            if (field === 'qty') item.qty = parseInt(e.target.value) || 0;
            if (field === 'pu') item.pu = parseFloat(e.target.value) || 0;
            
            item.total = item.qty * item.pu;
            
            const row = e.target.closest('.form-grid');
            if (row) {
                const devise = document.getElementById('ndDevise')?.value === 'CFA' ? 'FCFA' : '€';
                const totalInput = row.querySelector('input[readonly]');
                if (totalInput) totalInput.value = `${item.total} ${devise}`;
            }
            
            this.calculateTotals();
        }
    },

    calculateTotals() {
        const devise = document.getElementById('ndDevise')?.value === 'CFA' ? 'FCFA' : '€';
        const totalHT = this.items.reduce((sum, item) => sum + item.total, 0);
        const remise = parseFloat(document.getElementById('ndRemise').value) || 0;
        const totalNet = totalHT - remise;

        document.getElementById('ndTotalHT').textContent = `${totalHT} ${devise}`;
        document.getElementById('ndTotalNet').textContent = `${totalNet} ${devise}`;
        
        // Rafraîchir les symboles des lignes si la devise change
        document.querySelectorAll('#ndItemsContainer input[readonly]').forEach(input => {
            input.value = input.value.replace(/€|FCFA/, devise);
        });
    },

    async submitQuote() {
        const expediteur = document.getElementById('ndExpediteur').value.trim();
        const totalHT = this.items.reduce((sum, item) => sum + item.total, 0);
        const devise = document.getElementById('ndDevise').value;

        if (!expediteur || this.items[0].desc === '') {
            this.app.showToast("Veuillez remplir l'Expéditeur et au moins un article.", "error");
            return;
        }

        const btn = document.getElementById('ndSubmitBtn');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
        btn.disabled = true;

        const ref = "DEV-" + Date.now().toString().slice(-6);
        
        const quoteData = {
            reference: ref,
            client: expediteur,
            destinataire: document.getElementById('ndDestinataire').value.trim(),
            date: document.getElementById('ndDate').value,
            dateValidite: document.getElementById('ndValidite').value,
            volume: parseFloat(document.getElementById('ndVolume').value) || 0,
            devise: devise,
            agence: document.getElementById('ndAgence').value,
            lieuLivraison: document.getElementById('ndLieu').value.trim(),
            conditions: document.getElementById('ndConditions').value.trim(),
            items: this.items,
            totalHT: totalHT,
            remise: parseFloat(document.getElementById('ndRemise').value) || 0,
            totalNet: totalHT - (parseFloat(document.getElementById('ndRemise').value) || 0),
            status: "ENVOYÉ",
            agency: sessionStorage.getItem('currentActiveAgency') || 'paris',
            saisiPar: sessionStorage.getItem('userName') || 'Agent'
        };

        try {
            const batch = writeBatch(db);
            batch.set(doc(collection(db, "quotes")), quoteData);
            await batch.commit();
            
            this.app.showToast(`Devis ${ref} généré avec succès !`, "success");
            this.app.renderPage('quotes-list');
        } catch(e) {
            console.error(e);
            this.app.showToast("Erreur lors de l'enregistrement", "error");
            btn.innerHTML = '<i class="fas fa-check-circle"></i> Enregistrer le devis';
            btn.disabled = false;
        }
    }
};