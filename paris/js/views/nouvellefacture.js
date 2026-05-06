export const NouvelleFactureView = {
    items: [{ id: Date.now(), desc: '', qty: 1, pu: 0, total: 0 }],

    render(app) {
        this.app = app;
        this.items = [{ id: Date.now(), desc: '', qty: 1, pu: 0, total: 0 }]; // Reset des lignes

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
                        <div class="form-group">
                            <label>Lieu livraison (Abidjan)</label>
                            <select id="nfLieu">
                                <option value="">-- Non spécifié --</option>
                                <option value="ABOBO">ABOBO</option>
                                <option value="ADJAME">ADJAME</option>
                                <option value="ATTECOUBE">ATTECOUBE</option>
                                <option value="BINGERVILLE">BINGERVILLE</option>
                                <option value="COCODY">COCODY</option>
                                <option value="KOUMASSI">KOUMASSI</option>
                                <option value="MARCORY">MARCORY</option>
                                <option value="PLATEAU">PLATEAU</option>
                                <option value="PORT-BOUET">PORT-BOUET</option>
                                <option value="YOPOUGON">YOPOUGON</option>
                                <option value="PAS DE LIVRAISON">PAS DE LIVRAISON (Retrait Entrepôt)</option>
                            </select>
                        </div>
                    </div>
                </div>

                <!-- 2. CONTACTS -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <div class="form-card" style="box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                        <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 15px; display: flex; align-items: center; gap: 10px;"><i class="fas fa-upload text-orange-500"></i> Expéditeur</h3>
                        <div class="form-group">
                            <input type="text" id="nfExpediteur" placeholder="Nom, Prénom et Téléphone..." required>
                        </div>
                    </div>
                    
                    <div class="form-card" style="box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                        <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 15px; display: flex; align-items: center; gap: 10px;"><i class="fas fa-download text-emerald-500"></i> Destinataire</h3>
                        <div class="form-group">
                            <input type="text" id="nfDestinataire" placeholder="Nom, Prénom et Téléphone..." required>
                        </div>
                    </div>
                </div>

                <!-- 3. ARTICLES / COLIS -->
                <div class="form-card" style="box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 15px;">
                        <h3 style="margin: 0; display: flex; align-items: center; gap: 10px;"><i class="fas fa-box text-indigo-500"></i> Description colis</h3>
                        <button class="btn btn-outline btn-small" id="nfAddRowBtn"><i class="fas fa-plus"></i> Ajouter ligne</button>
                    </div>
                    
                    <div id="nfItemsContainer">
                        <!-- Les lignes seront générées ici par JS -->
                    </div>
                </div>

                <!-- 4. PAIEMENT & VALIDATION -->
                <div style="display: grid; grid-template-columns: 1.5fr 1fr; gap: 20px;">
                    
                    <div class="form-card" style="box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                        <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 15px; display: flex; align-items: center; gap: 10px;"><i class="fas fa-credit-card text-purple-500"></i> Paiement</h3>
                        
                        <div class="form-grid" style="grid-template-columns: 1fr 1fr;">
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
                            <div style="display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 16px;">
                                <span>Total Fret :</span>
                                <strong id="nfTotalFret">0 €</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                <span>Montant Payé (€) :</span>
                                <input type="number" id="nfMontantPaye" value="0" style="width: 120px; text-align: right; font-weight: bold; color: #10b981;">
                            </div>
                            <div style="display: flex; justify-content: space-between; font-size: 18px; border-top: 1px dashed #cbd5e1; padding-top: 10px;">
                                <span>Reste à Payer :</span>
                                <strong id="nfReste" style="color: #ef4444;">0 €</strong>
                            </div>
                        </div>
                    </div>

                    <div class="form-card" style="display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                        <div>
                            <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 15px; display: flex; align-items: center; gap: 10px;"><i class="fas fa-comment-dots text-slate-500"></i> Notes</h3>
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
        
        // Attacher les événements après le rendu
        this.renderItems();
        document.getElementById('nfAddRowBtn').addEventListener('click', () => this.addRow());
        document.getElementById('nfMontantPaye').addEventListener('input', () => this.calculateTotals());
        document.getElementById('nfSubmitBtn').addEventListener('click', () => this.submitInvoice());
    },

    renderItems() {
        const container = document.getElementById('nfItemsContainer');
        container.innerHTML = this.items.map((item, index) => `
            <div class="form-grid" style="grid-template-columns: 2fr 0.5fr 1fr 1fr auto; align-items: end; background: #f8fafc; padding: 10px; border-radius: 8px; margin-bottom: 10px; border: 1px solid #e2e8f0;">
                <div class="form-group" style="margin: 0;">
                    <label style="font-size: 11px;">Description *</label>
                    <input type="text" class="item-desc" data-id="${item.id}" value="${item.desc}" placeholder="Ex: TV 55 pouces" style="margin: 0;">
                </div>
                <div class="form-group" style="margin: 0;">
                    <label style="font-size: 11px;">Qté *</label>
                    <input type="number" class="item-qty" data-id="${item.id}" value="${item.qty}" min="1" style="margin: 0; text-align: center;">
                </div>
                <div class="form-group" style="margin: 0;">
                    <label style="font-size: 11px;">P.U (€) *</label>
                    <input type="number" class="item-pu" data-id="${item.id}" value="${item.pu}" min="0" style="margin: 0; text-align: right;">
                </div>
                <div class="form-group" style="margin: 0;">
                    <label style="font-size: 11px;">Total</label>
                    <input type="text" value="${item.total} €" readonly style="margin: 0; background: #e2e8f0; font-weight: bold; text-align: right;">
                </div>
                <button class="btn btn-danger btn-small" onclick="window.nfRemoveRow(${item.id})" style="height: 36px; display: flex; align-items: center; justify-content: center;" ${this.items.length === 1 ? 'disabled' : ''}><i class="fas fa-trash"></i></button>
            </div>
        `).join('');

        // Attacher les écouteurs sur les inputs
        document.querySelectorAll('.item-desc').forEach(el => el.addEventListener('input', (e) => this.updateItem(e, 'desc')));
        document.querySelectorAll('.item-qty').forEach(el => el.addEventListener('input', (e) => this.updateItem(e, 'qty')));
        document.querySelectorAll('.item-pu').forEach(el => el.addEventListener('input', (e) => this.updateItem(e, 'pu')));

        // Exposer la fonction de suppression globalement
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
            if (field === 'desc') item.desc = e.target.value;
            if (field === 'qty') item.qty = parseInt(e.target.value) || 0;
            if (field === 'pu') item.pu = parseFloat(e.target.value) || 0;
            
            item.total = item.qty * item.pu;
            this.calculateTotals();
            this.renderItems(); // Re-render pour mettre à jour les totaux locaux
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

        // Simulation d'enregistrement (Ici tu pourras brancher ton addDoc vers Firestore)
        setTimeout(() => {
            this.app.showToast("Facture créée avec succès !", "success");
            this.app.renderPage('invoices-list');
        }, 1000);
    }
};