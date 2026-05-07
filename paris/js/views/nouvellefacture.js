import { db } from '../../../firebase-config.js';
import { collection, doc, writeBatch, getDocs, query, where, limit } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const NouvelleFactureView = {
    items: [{ id: Date.now(), desc: '', qty: 1, pu: 0, total: 0 }],
    destMap: new Map(),
    destInfos: new Map(),
    clientsData: new Map(),
    productsData: new Map(),

    render(app) {
        this.app = app;
        this.items = [{ id: Date.now(), desc: '', qty: 1, pu: 0, total: 0 }]; // Reset des lignes
        this.destMap.clear();
        this.destInfos.clear();

        const html = `
            <div style="max-width: 1000px; margin: 0 auto; animation: fadeIn 0.3s ease-in-out;">
                
                <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 25px; background: white; padding: 20px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
                    <div style="background: #eff6ff; color: #3b82f6; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; border-radius: 12px; font-size: 24px;">
                        <i class="fas fa-file-invoice"></i>
                    </div>
                    <div>
                        <h2 style="margin: 0; color: #0f172a; font-size: 22px;">Nouvelle Facture / Envoi</h2>
                        <p style="margin: 0; color: #64748b; font-size: 13px;">Créer une nouvelle expédition depuis Paris</p>
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
                            <input type="text" id="nfExpediteur" placeholder="Nom, Prénom et Téléphone..." required list="nfExpediteursList">
                            <datalist id="nfExpediteursList"></datalist>
                        </div>
                        <div id="nfExpediteurFeedback" style="font-size: 12px; color: #64748b; margin-top: 5px;"></div>
                    </div>
                    
                    <div class="form-card" style="box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                        <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 15px; display: flex; align-items: center; gap: 10px;"><i class="fas fa-download text-emerald-500"></i> Destinataire</h3>
                        <div class="form-group">
                            <input type="text" id="nfDestinataire" placeholder="Nom, Prénom et Téléphone..." required list="nfDestinatairesList">
                            <datalist id="nfDestinatairesList"></datalist>
                        </div>
                        <div id="nfDestinataireFeedback" style="font-size: 12px; color: #64748b; margin-top: 5px;"></div>
                        <div class="form-group" style="margin-top: 15px;">
                            <label>Lieu livraison / Adresse complète</label>
                            <input type="text" id="nfLieu" placeholder="Ex: Cocody Angré 8ème tranche..." list="nfCommunesList">
                            <datalist id="nfCommunesList">
                                <option value="ABOBO"></option>
                                <option value="ADJAME"></option>
                                <option value="ATTECOUBE"></option>
                                <option value="BINGERVILLE"></option>
                                <option value="COCODY"></option>
                                <option value="KOUMASSI"></option>
                                <option value="MARCORY"></option>
                                <option value="PLATEAU"></option>
                                <option value="PORT-BOUET"></option>
                                <option value="YOPOUGON"></option>
                                <option value="PAS DE LIVRAISON (Retrait Entrepôt)"></option>
                            </datalist>
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
        // --- Écouteur pour l'auto-remplissage du lieu de livraison ---
        const destInput = document.getElementById('nfDestinataire');
        const lieuInput = document.getElementById('nfLieu'); // Assurez-vous que l'ID correspond bien à votre champ "Lieu livraison"

        if (destInput && lieuInput) {
            destInput.addEventListener('input', (e) => {
                const selectedDest = e.target.value.trim();
                
                // Si le destinataire tapé existe dans notre historique, on remplit l'adresse
                if (this.destInfos.has(selectedDest)) {
                    // On ne remplace la valeur que si le champ lieu est actuellement vide 
                    // (pour éviter d'effacer une adresse que l'agent aurait commencé à taper)
                    if (lieuInput.value.trim() === '') {
                        lieuInput.value = this.destInfos.get(selectedDest);
                        
                        // Optionnel : Petit effet visuel pour montrer que ça a été auto-rempli
                        lieuInput.style.backgroundColor = '#e0f2fe'; 
                        setTimeout(() => lieuInput.style.backgroundColor = '', 1000);
                    }
                }
            });
        }

        document.getElementById('contentContainer').innerHTML = html;
        
        // Attacher les événements après le rendu
        this.renderItems();
        document.getElementById('nfAddRowBtn').addEventListener('click', () => this.addRow());
        document.getElementById('nfMontantPaye').addEventListener('input', () => this.calculateTotals());
        document.getElementById('nfSubmitBtn').addEventListener('click', () => this.submitInvoice());
        
        // Auto-complétion instantanée avec léger délai (debounce) pour ne pas surcharger la base de données
        let expTimeout;
        document.getElementById('nfExpediteur').addEventListener('input', () => {
            clearTimeout(expTimeout);
            expTimeout = setTimeout(() => this.handleExpediteurChange(), 300);
        });
        
        let destTimeout;
        document.getElementById('nfDestinataire').addEventListener('input', () => {
            clearTimeout(destTimeout);
            destTimeout = setTimeout(() => this.handleDestinataireChange(), 300);
        });
        
        this.loadAutocompleteData();
    },

    async loadAutocompleteData() {
        try {
            // Charger tous les clients existants pour garnir la liste des expéditeurs
            const clientsSnap = await getDocs(collection(db, "clients"));
            this.clientsData.clear();
            
            clientsSnap.forEach(doc => {
                const data = doc.data();
                if (data.nom) {
                    this.clientsData.set(data.nom.trim(), data);
                }
            });
            
            const datalistExp = document.getElementById('nfExpediteursList');
            if (datalistExp) {
                datalistExp.innerHTML = Array.from(this.clientsData.keys()).sort().map(nom => `<option value="${nom}"></option>`).join('');
            }

            // NOUVEAU: Charger TOUTES les adresses et destinataires pour auto-complétion globale
            const livSnap = await getDocs(collection(db, "livraisons"));
            const communesSet = new Set(['ABOBO', 'ADJAME', 'ATTECOUBE', 'BINGERVILLE', 'COCODY', 'KOUMASSI', 'MARCORY', 'PLATEAU', 'PORT-BOUET', 'YOPOUGON', 'PAS DE LIVRAISON (Retrait Entrepôt)']);
            const destSet = new Set();

            livSnap.forEach(doc => {
                const data = doc.data();
                if (data.lieuLivraison && data.lieuLivraison.trim() !== '') {
                    communesSet.add(data.lieuLivraison.trim());
                }
                if (data.destinataire && data.destinataire.trim() !== '') {
                    const destName = data.destinataire.trim();
                    destSet.add(destName);
                    
                    // NOUVEAU : Sauvegarder le lieu de livraison associé à ce destinataire
                    if (data.lieuLivraison && !this.destInfos.has(destName)) {
                        this.destInfos.set(destName, data.lieuLivraison.trim());
                    }
                }
            });

            const communesList = document.getElementById('nfCommunesList');
            if (communesList) {
                communesList.innerHTML = Array.from(communesSet).sort().map(l => `<option value="${l}"></option>`).join('');
            }
            
            const destList = document.getElementById('nfDestinatairesList');
            if (destList && destList.options.length === 0) { // Si pas encore rempli
                destList.innerHTML = Array.from(destSet).sort().map(d => `<option value="${d}"></option>`).join('');
            }
        } catch (e) {
            console.error("Erreur de chargement de l'auto-complétion :", e);
        }
    },

    async handleExpediteurChange() {
        const expediteur = document.getElementById('nfExpediteur').value.trim();
        const destinatairesDatalist = document.getElementById('nfDestinatairesList');
        const destinataireInput = document.getElementById('nfDestinataire');
        const feedbackExp = document.getElementById('nfExpediteurFeedback');
        
        if (!expediteur) {
            if(destinatairesDatalist) destinatairesDatalist.innerHTML = '';
            if(feedbackExp) feedbackExp.innerHTML = '';
            return;
        }

        // Affichage des informations de l'expéditeur (Tél & Adresse)
        if (this.clientsData && this.clientsData.has(expediteur)) {
            const clientInfo = this.clientsData.get(expediteur);
            if (feedbackExp) {
                feedbackExp.innerHTML = `<span style="color:#059669;"><i class="fas fa-check-circle"></i> <b>Tél:</b> ${clientInfo.tel || 'N/A'} | <b>Adresse:</b> ${clientInfo.adresse || 'N/A'}</span>`;
            }
        } else {
            if (feedbackExp) {
                feedbackExp.innerHTML = `<span style="color:#f59e0b;"><i class="fas fa-exclamation-triangle"></i> Nouveau client expéditeur</span>`;
            }
        }

        try {
            // Recherche des colis précédents envoyés par ce client
            const qLiv = query(collection(db, "livraisons"), where("expediteur", "==", expediteur));
            const livSnap = await getDocs(qLiv);
            
            this.destMap.clear();
            this.destInfos.clear();
            
            livSnap.forEach(doc => {
                const data = doc.data();
                if (data.destinataire && data.destinataire.trim()) {
                    const destName = data.destinataire.trim();
                    this.destMap.set(destName, data.lieuLivraison || '');
                    this.destInfos.set(destName, data.numero || '');
                }
            });

            const uniqueDests = Array.from(this.destMap.keys());
            
            if (uniqueDests.length > 0) {
                if(destinatairesDatalist) {
                    destinatairesDatalist.innerHTML = uniqueDests.map(dest => `<option value="${dest}"></option>`).join('');
                }
                
                if (uniqueDests.length === 1) {
                    // Pré-remplissage automatique si le champ Destinataire est vide ou différent
                    if (!destinataireInput.value || destinataireInput.value !== uniqueDests[0]) {
                        destinataireInput.value = uniqueDests[0];
                        // Déclencher manuellement le chargement du lieu associé
                        this.handleDestinataireChange();
                    }
                } else {
                    if (feedbackExp) {
                        feedbackExp.innerHTML += `<br><span style="color:#3b82f6;"><i class="fas fa-info-circle"></i> ${uniqueDests.length} destinataires trouvés. Utilisez la flèche pour choisir.</span>`;
                    }
                }
            } else {
                if(destinatairesDatalist) destinatairesDatalist.innerHTML = '';
            }
        } catch (error) {
            console.error("Erreur de recherche des destinataires :", error);
        }
    },

    async handleDestinataireChange() {
        const destinataireInput = document.getElementById('nfDestinataire');
        const lieuInput = document.getElementById('nfLieu');
        const feedbackDest = document.getElementById('nfDestinataireFeedback');
        
        const selectedDest = destinataireInput ? destinataireInput.value.trim() : '';

        if (!selectedDest) {
            if (feedbackDest) feedbackDest.innerHTML = '';
            if (lieuInput) lieuInput.value = ''; // IMPORTANT : Vider le lieu si on efface le destinataire
            return;
        }

        let lieu = '';
        let num = '';
        let isFound = false;

        // 1. Chercher dans l'historique lié à l'expéditeur actuel
        if (this.destMap && this.destMap.has(selectedDest)) {
            lieu = this.destMap.get(selectedDest);
            num = this.destInfos.get(selectedDest);
            isFound = true;
        } else {
            // 2. Sinon, chercher globalement dans la base de données
            try {
                const qLiv = query(collection(db, "livraisons"), where("destinataire", "==", selectedDest), limit(1));
                const snap = await getDocs(qLiv);
                if (!snap.empty) {
                    const data = snap.docs[0].data();
                    lieu = data.lieuLivraison || data.commune || '';
                    num = data.numero || '';
                    isFound = true;
                }
            } catch (e) {
                console.error(e);
            }
        }

        // Appliquer l'adresse complète directement (Même si vide, on l'applique pour écraser)
        if (lieuInput && isFound) {
            lieuInput.value = lieu || '';
        }

        // Afficher le feedback
        if (isFound) {
            if (feedbackDest) feedbackDest.innerHTML = `<span style="color:#059669;"><i class="fas fa-check-circle"></i> <b>Tél:</b> ${num || 'N/A'}</span>`;
        } else {
            if (feedbackDest) feedbackDest.innerHTML = `<span style="color:#f59e0b;"><i class="fas fa-exclamation-triangle"></i> Nouveau destinataire</span>`;
        }
    },

    renderItems() {
        const container = document.getElementById('nfItemsContainer');
        container.innerHTML = this.items.map((item, index) => `
            <div class="form-grid" style="grid-template-columns: 2fr 0.5fr 1fr 1fr auto; align-items: end; background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 10px; border: 1px solid #e2e8f0;">
                <div class="form-group" style="margin: 0;">
                    <label style="font-size: 11px;">Description *</label>
                    <input type="text" class="item-desc" data-id="${item.id}" value="${item.desc}" list="nfProductsList" placeholder="Ex: TV 55 pouces" style="margin: 0; width: 100%;">
                </div>
                <div class="form-group" style="margin: 0;">
                    <label style="font-size: 11px;">Qté *</label>
                    <input type="number" class="item-qty" data-id="${item.id}" value="${item.qty}" min="1" style="margin: 0; text-align: center; width: 100%;">
                </div>
                <div class="form-group" style="margin: 0;">
                    <label style="font-size: 11px;">P.U (€) *</label>
                    <input type="number" class="item-pu" data-id="${item.id}" value="${item.pu}" min="0" style="margin: 0; text-align: right; width: 100%;">
                </div>
                <div class="form-group" style="margin: 0;">
                    <label style="font-size: 11px;">Total</label>
                    <input type="text" value="${item.total} €" readonly style="margin: 0; background: #e2e8f0; font-weight: bold; text-align: right; width: 100%;">
                </div>
                <button class="btn btn-danger btn-small" onclick="window.nfRemoveRow(${item.id})" style="height: 36px; display: flex; align-items: center; justify-content: center; width: 100%;" ${this.items.length === 1 ? 'disabled' : ''}><i class="fas fa-trash"></i></button>
            </div>
        `).join('') + '<datalist id="nfProductsList"></datalist>'; // AJOUT DE LA BALISE DATALIST À LA FIN

        // Attacher les écouteurs sur les inputs
        document.querySelectorAll('.item-desc').forEach(el => el.addEventListener('input', (e) => this.updateItem(e, 'desc')));
        document.querySelectorAll('.item-qty').forEach(el => el.addEventListener('input', (e) => this.updateItem(e, 'qty')));
        document.querySelectorAll('.item-pu').forEach(el => el.addEventListener('input', (e) => this.updateItem(e, 'pu')));

        window.nfRemoveRow = (id) => {
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
                
                // NOUVEAU : Auto-remplissage du prix si le produit est reconnu
                if (this.productsData && this.productsData.has(item.desc)) {
                    const prod = this.productsData.get(item.desc);
                    item.pu = parseFloat(prod.price) || 0;
                    // Mise à jour visuelle du champ P.U
                    const puInput = document.querySelector(`.item-pu[data-id="${id}"]`);
                    if (puInput) puInput.value = item.pu;
                }
            }
            if (field === 'qty') item.qty = parseInt(e.target.value) || 0;
            if (field === 'pu') item.pu = parseFloat(e.target.value) || 0;
            
            item.total = item.qty * item.pu;
            
            // Mise à jour visuelle du total de cette ligne SANS tout re-rendre (Évite la perte de focus !)
            const row = e.target.closest('.form-grid');
            if (row) {
                const totalInput = row.querySelector('input[readonly]');
                if (totalInput) totalInput.value = item.total + ' €';
            }
            
            this.calculateTotals();
            // ATTENTION : Ne PLUS appeler this.renderItems() ici !
        }
    },
    async loadAutocompleteData() {
        try {
            // (Gardez votre code existant pour clientsSnap et livSnap ici...)
            const clientsSnap = await getDocs(collection(db, "clients"));
            this.clientsData.clear();
            
            clientsSnap.forEach(doc => {
                const data = doc.data();
                if (data.nom) {
                    this.clientsData.set(data.nom.trim(), data);
                }
            });
            
            const datalistExp = document.getElementById('nfExpediteursList');
            if (datalistExp) {
                datalistExp.innerHTML = Array.from(this.clientsData.keys()).sort().map(nom => `<option value="${nom}"></option>`).join('');
            }

            const livSnap = await getDocs(collection(db, "livraisons"));
            const communesSet = new Set(['ABOBO', 'ADJAME', 'ATTECOUBE', 'BINGERVILLE', 'COCODY', 'KOUMASSI', 'MARCORY', 'PLATEAU', 'PORT-BOUET', 'YOPOUGON', 'PAS DE LIVRAISON (Retrait Entrepôt)']);
            const destSet = new Set();

            livSnap.forEach(doc => {
                const data = doc.data();
                if (data.lieuLivraison && data.lieuLivraison.trim() !== '') communesSet.add(data.lieuLivraison.trim());
                if (data.destinataire && data.destinataire.trim() !== '') destSet.add(data.destinataire.trim());
            });

            const communesList = document.getElementById('nfCommunesList');
            if (communesList) {
                communesList.innerHTML = Array.from(communesSet).sort().map(l => `<option value="${l}"></option>`).join('');
            }
            
            const destList = document.getElementById('nfDestinatairesList');
            if (destList && destList.options.length === 0) {
                destList.innerHTML = Array.from(destSet).sort().map(d => `<option value="${d}"></option>`).join('');
            }

            // --- NOUVEAU : CHARGEMENT DES PRODUITS ---
            const prodSnap = await getDocs(collection(db, "products"));
            this.productsData.clear();
            prodSnap.forEach(doc => {
                const data = doc.data();
                if (data.desc) {
                    this.productsData.set(data.desc.trim(), data);
                }
            });
            const prodList = document.getElementById('nfProductsList');
            if (prodList) {
                prodList.innerHTML = Array.from(this.productsData.keys()).sort().map(desc => `<option value="${desc}"></option>`).join('');
            }

        } catch (e) {
            console.error("Erreur de chargement de l'auto-complétion :", e);
        }
    },

    calculateTotals() {
        const totalFret = this.items.reduce((sum, item) => sum + item.total, 0);
        const paye = parseFloat(document.getElementById('nfMontantPaye').value) || 0;
        const reste = totalFret - paye;

        document.getElementById('nfTotalFret').textContent = totalFret + ' €';
        document.getElementById('nfReste').textContent = reste + ' €';
    },

    async submitInvoice() {
        const expediteur = document.getElementById('nfExpediteur').value.trim();
        const destinataire = document.getElementById('nfDestinataire').value.trim();
        const total = this.items.reduce((sum, item) => sum + item.total, 0);

        if (!expediteur || !destinataire || this.items[0].desc === '') {
            this.app.showToast("Veuillez remplir l'Expéditeur, le Destinataire et au moins une Description d'article.", "error");
            return;
        }

        const btn = document.getElementById('nfSubmitBtn');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
        btn.disabled = true;

        // CONVERSION : Euro -> CFA pour sauvegarde uniforme dans la base Abidjan
        const TAUX = 656;
        const totalEUR = total;
        const payeEUR = parseFloat(document.getElementById('nfMontantPaye').value) || 0;
        const resteEUR = totalEUR - payeEUR;
        
        const totalCFA = Math.round(totalEUR * TAUX);
        const payeCFA = Math.round(payeEUR * TAUX);
        const resteCFA = Math.round(resteEUR * TAUX);

        const batch = writeBatch(db);
        const dateIso = document.getElementById('nfDate').value || new Date().toISOString().split('T')[0];
        const ref = "PAR-" + Date.now().toString().slice(-6); // Génération d'une Réf unique

        // 1. Logistique (Livraisons)
        const livRef = doc(collection(db, "livraisons"));
        batch.set(livRef, {
            ref: ref,
            expediteur: expediteur,
            destinataire: destinataire,
            lieuLivraison: document.getElementById('nfLieu').value,
            description: this.items.map(i => `${i.qty}x ${i.desc}`).join(', '),
            quantite: this.items.reduce((sum, item) => sum + item.qty, 0),
            montant: resteCFA + " CFA",
            prixOriginal: totalCFA + " CFA",
            status: "EN_ATTENTE",
            containerStatus: "PARIS",
            agency: "paris",
            dateAjout: new Date(dateIso).toISOString()
        });

        // 2. Finance (Transactions Caisse)
        const transRef = doc(collection(db, "transactions"));
        batch.set(transRef, {
            reference: ref,
            nom: expediteur,
            nomDestinataire: destinataire,
            date: dateIso,
            prix: totalCFA,
            montantParis: payeCFA,
            montantAbidjan: 0,
            reste: -resteCFA, // Négatif car c'est une dette
            modePaiement: document.getElementById('nfModePay').value,
            description: this.items.map(i => `${i.qty}x ${i.desc}`).join(', '),
            agency: "paris",
            isDeleted: false,
            saisiPar: sessionStorage.getItem('userName') || 'Agent Paris',
            paymentHistory: payeCFA > 0 ? [{
                date: dateIso,
                montantParis: payeCFA,
                montantAbidjan: 0,
                modePaiement: document.getElementById('nfModePay').value,
                saisiPar: sessionStorage.getItem('userName') || 'Agent Paris'
            }] : []
        });

        try {
            await batch.commit();
            this.app.showToast("Facture créée et synchronisée vers Abidjan !", "success");
            
            // Réinitialisation du formulaire
            this.items = [{ id: Date.now(), desc: '', qty: 1, pu: 0, total: 0 }];
            document.getElementById('nfExpediteur').value = '';
            document.getElementById('nfDestinataire').value = '';
            document.getElementById('nfMontantPaye').value = '0';
            this.renderItems();
            this.calculateTotals();
            
            this.app.renderPage('dashboard');
        } catch(e) {
            console.error(e);
            this.app.showToast("Erreur lors de l'enregistrement", "error");
        } finally {
            btn.innerHTML = '<i class="fas fa-check-circle"></i> Enregistrer la facture';
            btn.disabled = false;
        }
    }
    
    
};