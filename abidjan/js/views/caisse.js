import { db } from '../../../firebase-config.js';
import { collection, doc, addDoc, updateDoc, getDocs, getDoc, query, where, orderBy, limit, onSnapshot, writeBatch, arrayUnion } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getCollectionName } from '../../../agencies-config.js';

export const CaisseView = {
    render(app, container) {
        this.app = app;
        
        container.innerHTML = `
            <div id="desktop-view">
                <!-- ONGLET 1 : SAISIE CAISSE -->
                <div id="saisie" class="tab-panel active">
                    <div id="caisseForm" class="mobile-step-1">
                        <h3 class="desktop-only-title" style="margin-top:0; color:#28a745;">Encaissement Colis</h3>
                        
                        <div class="mobile-progress-bar">
                            <div class="step-indicator active" id="ind-1">1. Colis</div>
                            <div class="step-indicator" id="ind-2">2. Finances</div>
                            <div class="step-indicator" id="ind-3">3. Validation</div>
                        </div>

                        <!-- ETAPE 1 -->
                        <div class="wizard-step step-1">
                            <div class="form-grid">
                            <input type="date" id="date" required>
                            <div style="width: 100%;">
                                <input type="text" id="reference" placeholder="Référence / Client (Recherche)" required list="referenceList">
                                <button type="button" class="btn-scan">📸 Scanner la Référence</button>
                            </div>
                            <datalist id="referenceList"></datalist>
                            
                            <input type="text" id="nom" placeholder="Nom du Client">
                            <input type="text" id="conteneur" placeholder="Conteneur (ex: D35)">
                            </div>
                            <div class="step-nav" style="justify-content: flex-end;">
                                <button type="button" class="btn btn-next" style="background:#28a745; color:white; border:none;" onclick="window.goToMobileStep(2)">Suivant ➔</button>
                            </div>
                        </div>

                        <!-- ETAPE 2 -->
                        <div class="wizard-step step-2">
                            <div class="form-grid">
                            <div class="prix-container">
                                <input type="number" id="prix" placeholder="Prix">
                                <span class="cfa-label">CFA</span>
                            </div>
                            <input type="number" id="montantParis" placeholder="Montant Paris">
                            <input type="number" id="montantAbidjan" placeholder="Montant Abidjan">

                            <select id="modePaiement" style="font-weight: bold; color: #0d47a1;">
                                <option value="Espèce" selected>Espèce</option>
                                <option value="Chèque">Chèque</option>
                                <option value="OM">Orange Money</option>
                                <option value="Wave">Wave</option>
                                <option value="Virement">Virement</option>
                            </select>

                            <input type="number" id="reste" placeholder="Reste" readonly>
                            </div>
                            <div class="step-nav" style="justify-content: space-between;">
                                <button type="button" class="btn btn-prev" style="background:#e2e8f0; color:#333; border:none;" onclick="window.goToMobileStep(1)">⬅ Retour</button>
                                <button type="button" class="btn btn-next" style="background:#28a745; color:white; border:none;" onclick="window.goToMobileStep(3)">Suivant ➔</button>
                            </div>
                        </div>

                        <!-- ETAPE 3 -->
                        <div class="wizard-step step-3">
                            <div id="mobileSummary" class="summary-card"></div>

                        <div style="text-align: center; margin: 5px 0;">
                            <span id="toggleAdvancedBtn" style="cursor:pointer; color:#4f46e5; font-size:12px; font-weight:bold; user-select: none;">▼ Plus d'options (Agents, Commune, Ajustements)</span>
                        </div>

                        <div id="advancedFields" class="form-grid" style="display:none; margin-top:5px; padding:10px; background:#f1f5f9; border-radius:8px;">
                            <input type="text" id="agentMobileMoney" placeholder="Info Paiement">
                            <select id="commune">
                                <option value="">-- Commune --</option>
                                <option value="Abobo">Abobo</option><option value="Anyama">Anyama</option><option value="Autres Communes">Autres Communes</option>
                                <option value="Cocody">Cocody</option><option value="Entrepôt">Entrepôt</option><option value="Yopougon">Yopougon</option>
                            </select>
                            
                            <div style="display: flex; gap: 5px; align-items: flex-start;">
                                <div style="flex-grow: 1;"><select id="agent" multiple></select></div>
                                <button id="addAgentBtn" style="background: #28a745; color: white; border: none; border-radius: 4px; width: 30px; height: 30px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center;" title="Ajouter un nouvel agent">+</button>
                            </div>
                            
                            <select id="adjustmentType">
                                <option value="">-- Ajustement (Aucun) --</option>
                                <option value="reduction">Réduction ⬇️</option>
                                <option value="augmentation">Augmentation ⬆️</option>
                            </select>
                            <input type="number" id="adjustmentVal" placeholder="Montant Ajustement">
                        </div>

                            <div class="step-nav" style="justify-content: space-between; margin-bottom:10px;">
                                <button type="button" class="btn btn-prev" style="background:#e2e8f0; color:#333; border:none;" onclick="window.goToMobileStep(2)">⬅ Retour</button>
                            </div>

                        <div class="form-buttons" id="finalSubmitWrapper">
                            <button id="addEntryBtn">✅ ENREGISTRER</button> 
                        </div>
                        </div>
                    </div>

                        <div id="caisseForm" style="background-color: #fff3e0; border: 1px solid #ffe0b2;">
                        <h3 style="margin-top:0; color:#d32f2f;">Dépenses du Livreur (Carburant, etc.)</h3>
                        <div class="form-grid" style="grid-template-columns: 2fr 1.5fr 1fr 1fr;">
                            <input type="text" id="quickExpenseDesc" placeholder="Motif (ex: Carburant, Réparation...)">
                            <select id="quickExpenseVehicle" style="border-color: #fca5a5;">
                                <option value="">-- Véhicule (Optionnel) --</option>
                            </select>
                            <input type="number" id="quickExpenseAmount" placeholder="Montant">
                            <button id="addQuickExpenseBtn" style="background-color: #d32f2f; color: white; border: none; border-radius: 6px; cursor: pointer;">Ajouter Dépense</button>
                        </div>
                    </div>

                        <div style="display: flex; gap: 20px; flex-wrap: wrap;">
                        <div style="flex: 2; min-width: 300px; overflow-x: auto;">
                            <h3>Encaissements (<span id="dailyCount">0</span>)</h3>
                            <table id="dailyTable">
                                <thead><tr><th>Réf</th><th>Nom</th><th>Prix</th><th>Mode</th><th>Reste</th><th>Action</th></tr></thead>
                                <tbody id="dailyTableBody"></tbody>
                            </table>
                        </div>

                        <div style="flex: 1; min-width: 300px; overflow-x: auto;">
                            <h3>Dépenses Saisies</h3>
                            <table id="dailyExpensesTable">
                                <thead><tr><th>Motif</th><th>Montant</th><th>Action</th></tr></thead>
                                <tbody id="dailyExpensesTableBody"></tbody>
                            </table>
                        </div>
                    </div>

                        <div class="daily-summary" style="flex-direction: column; align-items: center; background-color: #e8f5e9; border: 2px solid #4caf50;">
                        <div style="display: flex; justify-content: space-around; width: 100%; margin-bottom: 15px;">
                            <div class="summary-item"><h4>Total Encaissement (Espèces)</h4><span id="dailyTotalAbidjanEspeces" style="color: #28a745;">0 F CFA</span></div>
                            <div class="summary-item"><h4>- Total Dépenses</h4><span id="dailyTotalExpenses" style="color: #d32f2f;">0 F CFA</span></div>
                        </div>
                        
                        <div style="text-align: center; border-top: 2px solid #ccc; padding-top: 10px; width: 100%;">
                            <h2 style="margin:0; font-size: 16px; color: #555;">NET À VERSER (ESPECES)</h2>
                            <span id="netToPay" style="font-size: 32px; font-weight: bold; color: #000;">0 F CFA</span>
                        </div>

                        <div style="width: 100%; display: flex; justify-content: center; margin-top: 20px;">
                            <button id="saveDayBtn" class="primary" style="font-size: 18px; padding: 15px 40px;">✅ Valider et Enregistrer la Journée</button>
                        </div>
                    </div>

                        <div class="daily-summary" style="margin-top: 10px; padding: 10px; opacity: 0.8; flex-wrap: wrap;">
                        <div class="summary-item" style="font-size: 0.8em;"><h4>Total Paris</h4><span id="dailyTotalParis">0</span></div>
                        <div class="summary-item" style="font-size: 0.8em;"><h4>Reste Total</h4><span id="dailyTotalReste">0</span></div>
                        <div id="paymentBreakdown" style="width: 100%; display: flex; justify-content: space-around; margin-top: 10px; border-top: 1px solid #ccc; padding-top: 5px; flex-wrap: wrap; gap: 10px;"></div>
                    </div>
                </div> <!-- Fin du tab-panel saisie -->
            </div>
            
            <!-- VUE MOBILE (SPA Livreur) -->
            <div id="mobile-view">
                <div class="mob-header" style="display: flex; justify-content: center; align-items: center;">
                    <img src="../LOGOAMT.png" alt="Logo" class="app-logo" style="height: 25px; margin-right: 10px;">
                    <h2 style="margin:0;">Mode Livreur</h2>
                </div>

                <div class="mob-summary">
                    <div class="mob-stat"><span>Encaissements</span><b id="mob-totalIn" style="color:#10b981;">0 CFA</b></div>
                    <div class="mob-stat"><span>Dépenses</span><b id="mob-totalOut" style="color:#ef4444;">0 CFA</b></div>
                    <div class="mob-stat"><span>Net à verser</span><b id="mob-totalNet">0 CFA</b></div>
                </div>

                <div id="mob-saisieView" class="mob-card">
                    <h3>📦 Nouvel Encaissement</h3>
                    <input type="text" id="mob-refInput" placeholder="Référence du colis (ex: MD-123)" list="mob-referenceList">
                    <datalist id="mob-referenceList"></datalist>
                    
                    <input type="text" id="mob-nomInput" placeholder="Nom du Client" readonly style="background-color: #e2e8f0; color: #475569;">
                    <div style="display:flex; gap:10px; margin-bottom:12px;">
                        <input type="text" id="mob-conteneurInput" placeholder="Conteneur" readonly style="background-color: #e2e8f0; color: #475569; margin-bottom:0; flex:1;">
                        <input type="number" id="mob-prixInput" placeholder="Prix" readonly style="background-color: #e2e8f0; color: #475569; margin-bottom:0; flex:1;">
                    </div>

                    <input type="number" id="mob-montantInput" placeholder="Montant encaissé (CFA)">
                    
                    <div style="display:flex; gap:10px; margin-bottom:12px;">
                        <select id="mob-modeInput" style="margin-bottom:0; flex:1;">
                            <option value="Espèce">💵 Espèce</option>
                            <option value="Wave">🌊 Wave</option>
                            <option value="OM">🟠 Orange Money</option>
                        </select>
                        <input type="number" id="mob-resteInput" placeholder="Reste" readonly style="background-color: #e2e8f0; color: #475569; font-weight: bold; margin-bottom:0; flex:1;">
                    </div>

                    <select id="mob-agentInput" style="display:none; margin-bottom:12px; width:100%;">
                        <option value="">-- Agent ayant reçu le dépôt --</option>
                    </select>

                    <button id="mob-addBtn" class="mob-btn mob-btn-primary">Ajouter Encaissement</button>
                </div>

                <div id="mob-depensesView" class="mob-card" style="display:none;">
                    <h3>⛽ Nouvelle Dépense</h3>
                    <input type="text" id="mob-depenseDesc" placeholder="Motif (ex: Carburant, Péage...)">
                    <input type="number" id="mob-depenseAmount" placeholder="Montant (CFA)">
                    <button id="mob-addDepenseBtn" class="mob-btn mob-btn-danger">Ajouter Dépense</button>
                </div>

                <div id="mob-listContainer">
                    <h3 style="margin: 20px 0 10px 15px; font-size: 14px; color: #64748b; text-transform: uppercase;">Opérations du jour</h3>
                    <div id="mob-itemsList"></div>
                    <button id="mob-validateDayBtn" class="mob-btn mob-btn-success" style="margin: 15px; width: calc(100% - 30px); box-shadow: 0 4px 6px rgba(16,185,129,0.3);">✅ Valider la journée</button>
                </div>

                <div class="mob-bottom-nav">
                    <div class="mob-nav-item active" id="mob-nav-saisie" onclick="window.mobSwitchTab('saisie')">📦 Saisie</div>
                    <div class="mob-nav-item" id="mob-nav-depenses" onclick="window.mobSwitchTab('depenses')">⛽ Dépenses</div>
                </div>
            </div>
        `;
        
        setTimeout(() => this.initLogic(), 50);
    },

    initLogic() {
        window.goToMobileStep = (step) => {
            const formWrapper = document.getElementById('caisseForm');
            if (!formWrapper) return;
        
            if (step === 2) {
                const dateEl = document.getElementById('date');
                const refEl = document.getElementById('reference');
                if (dateEl && refEl) {
                    const date = dateEl.value;
                    const ref = refEl.value.trim();
                    if (!date || !ref) {
                        if (window.AppModal) window.AppModal.error("Veuillez saisir la Date et la Référence avant de continuer.");
                        else alert("Veuillez saisir la Date et la Référence avant de continuer.");
                        return;
                    }
                }
            }
        
            formWrapper.className = `mobile-step-${step}`;
        
            for (let i = 1; i <= 3; i++) {
                const ind = document.getElementById(`ind-${i}`);
                if (ind) {
                    if (i === step) ind.className = 'step-indicator active';
                    else if (i < step) ind.className = 'step-indicator completed';
                    else ind.className = 'step-indicator';
                }
            }
                
            if (step === 3 && window.updateMobileSummary) {
                window.updateMobileSummary();
            }
        };
        
        window.updateMobileSummary = () => {
            const summary = document.getElementById('mobileSummary');
            if (!summary) return;
            const ref = document.getElementById('reference').value || 'N/A';
            const resteVal = parseFloat(document.getElementById('reste').value) || 0;
            const formatCFA = (n) => new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(n).replace(/[\u202F\u00A0]/g, ' ').replace(/\s*\/\s*/g, ' ');
            
            let resteHTML = `<h2 style="color:${resteVal <= 0 ? '#10b981' : '#ef4444'}; margin: 10px 0; font-size: 22px;">RESTE À PAYER : ${formatCFA(Math.abs(resteVal))}</h2>`;
            if (resteVal <= 0) resteHTML = `<h2 style="color:#10b981; margin: 10px 0; font-size: 22px;">✅ COLIS SOLDÉ</h2>`;
            
            summary.innerHTML = `<h3 style="margin: 0 0 10px 0; color: #475569; font-size: 16px;">Référence : ${ref}</h3>${resteHTML}`;
        };
        
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'abidjan';
    
        const qPendingSessions = query(collection(db, "audit_logs"), where("action", "==", "VALIDATION_JOURNEE"), where("agency", "==", activeAgency));
        onSnapshot(qPendingSessions, (snapshot) => {
            let pendingCount = 0;
            snapshot.forEach(doc => {
                const status = doc.data().status;
                if (status !== "VALIDATED" && status !== "ARCHIVED") {
                    pendingCount++;
                }
            });
            
            const badgeHTML = `<span class="pending-count-badge" style="background-color: rgb(239, 68, 68); color: white; border-radius: 10px; padding: 1px 6px; font-size: 10px; font-weight: bold; margin-left: 5px; vertical-align: super; display: inline-block;">${pendingCount}</span>`;
    
            const navLinks = document.querySelectorAll('.nav-menu a, .sidebar-item');
            navLinks.forEach(link => {
                const text = Array.from(link.childNodes).filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent.trim()).join('');
                    
                if (text.includes('Entrée Caisse') || text.includes('Caisse') || text.includes('Confirmation') || text.includes('Saisie')) {
                    const existingBadge = link.querySelector('.pending-count-badge');
                    if (existingBadge) existingBadge.remove(); 
                    
                    if (pendingCount > 0) link.insertAdjacentHTML('beforeend', badgeHTML);
                }
            });
        });
    
        const agentSelectElement = document.getElementById('agent');
        const addAgentBtn = document.getElementById('addAgentBtn');
    
        let agentChoices = null;
        if (agentSelectElement) {
            agentChoices = new Choices(agentSelectElement, {
                removeItemButton: true, placeholder: true, searchPlaceholderValue: 'Rechercher un agent...',
                shouldSort: false, itemSelectText: '',
            });
        }
    
        const qAgents = query(collection(db, "agents"), orderBy("name"));
        onSnapshot(qAgents, snapshot => {
            if (snapshot.empty) {
                const defaults = ["Adboul Paris", "Ali Paris", "Autres Paris", "AZIZ", "Bakary Paris", "Cesar", "Cheick Paris", "Lauraine", "Coulibaly Traoré Mah", "Demba Paris", "Drissa Paris", "Fatim Paris", "Hamza", "JB", "Julien", "Kady Paris", "Maley", "Males", "Mohamed Paris", "Moussa Paris", "Salif", "Samba", "Touré", "Blanche"];
                const batch = writeBatch(db);
                defaults.forEach(name => {
                    const ref = doc(collection(db, "agents"));
                    batch.set(ref, { name: name });
                });
                batch.commit().then(() => console.log("Liste agents initialisée."));
                return;
            }
    
            if (agentChoices) {
                const agents = snapshot.docs.map(doc => ({ value: doc.data().name, label: doc.data().name, id: doc.id }));
                agentChoices.clearChoices();
                agentChoices.setChoices(agents, 'value', 'label', true);
            }
        });
    
        if (addAgentBtn) {
            addAgentBtn.addEventListener('click', async () => {
                const newName = await AppModal.prompt("Nom du nouvel agent :", "", "Nouvel Agent");
                if (newName && newName.trim()) {
                    addDoc(collection(db, "agents"), { name: newName.trim() }).then(() => AppModal.success("Agent ajouté !")).catch(e => AppModal.error(e.message));
                }
            });
        }
    
        const addEntryBtn = document.getElementById('addEntryBtn');
        const saveDayBtn = document.getElementById('saveDayBtn');
        const dailyTableBody = document.getElementById('dailyTableBody');
        const formContainer = document.getElementById('caisseForm');
        
        const referenceInput = document.getElementById('reference'); 
        const nomInput = document.getElementById('nom');
        const conteneurInput = document.getElementById('conteneur');
        const prixInput = document.getElementById('prix');
        const montantParisInput = document.getElementById('montantParis');
        const montantAbidjanInput = document.getElementById('montantAbidjan');
        const agentMobileMoneyInput = document.getElementById('agentMobileMoney');
        const modePaiementInput = document.getElementById('modePaiement');
    
        [
            { input: montantParisInput, label: "PARIS", color: "#1e40af" },
            { input: montantAbidjanInput, label: "ABIDJAN", color: "#9a3412" }
        ].forEach(item => {
            if (item.input && item.input.parentNode && !item.input.previousElementSibling?.textContent?.includes(item.label)) {
                const wrapper = document.createElement('div');
                wrapper.style.display = 'flex';
                wrapper.style.flexDirection = 'column';
                wrapper.style.width = '100%'; 
                
                const label = document.createElement('span');
                label.textContent = item.label;
                label.style.fontSize = '12px';
                label.style.fontWeight = 'bold';
                label.style.marginBottom = '4px';
                label.style.color = item.color;
                
                item.input.parentNode.insertBefore(wrapper, item.input);
                wrapper.appendChild(label);
                wrapper.appendChild(item.input);
            }
        });
    
        const resteInput = document.getElementById('reste');
        const communeInput = document.getElementById('commune');
        const adjustmentTypeInput = document.getElementById('adjustmentType');
        const adjustmentValInput = document.getElementById('adjustmentVal');
        const referenceList = document.getElementById('referenceList');
        
        const addQuickExpenseBtn = document.getElementById('addQuickExpenseBtn');
        const quickExpenseDesc = document.getElementById('quickExpenseDesc');
        const quickExpenseAmount = document.getElementById('quickExpenseAmount');
        const quickExpenseVehicle = document.getElementById('quickExpenseVehicle');
        const dailyExpensesTableBody = document.getElementById('dailyExpensesTableBody');
        const toggleAdvancedBtn = document.getElementById('toggleAdvancedBtn');
        const advancedFields = document.getElementById('advancedFields');
        if (toggleAdvancedBtn && advancedFields) {
            toggleAdvancedBtn.addEventListener('click', () => {
                const isHidden = advancedFields.style.display === 'none';
                advancedFields.style.display = isHidden ? 'grid' : 'none';
                toggleAdvancedBtn.textContent = isHidden ? '▲ Masquer les options' : '▼ Plus d\'options (Agents, Commune, Ajustements)';
            });
        }
    
        const dailyTotalAbidjanEspecesEl = document.getElementById('dailyTotalAbidjanEspeces');
        const dailyTotalExpensesEl = document.getElementById('dailyTotalExpenses');
        const netToPayEl = document.getElementById('netToPay');
        
        const dailyTotalParisEl = document.getElementById('dailyTotalParis');
        const dailyTotalMobileMoneyEl = document.getElementById('dailyTotalMobileMoney');
        const dailyTotalResteEl = document.getElementById('dailyTotalReste');
    
        let dailyTransactions = JSON.parse(localStorage.getItem('dailyTransactions')) || [];
        let dailyExpenses = JSON.parse(localStorage.getItem('dailyExpenses')) || [];
        let currentStorageFeeWaived = false; 
        let currentIsNewAdjustment = false; 
        let fleetVehicles = [];
    
        onSnapshot(query(collection(db, "fleet_vehicles"), where("isDeleted", "!=", true)), snap => {
            fleetVehicles = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (quickExpenseVehicle) {
                let options = '<option value="">-- Véhicule (Optionnel) --</option>';
                fleetVehicles.forEach(v => {
                    options += `<option value="${v.id}">${v.name} (${v.plate})</option>`;
                });
                const currentVal = quickExpenseVehicle.value;
                quickExpenseVehicle.innerHTML = options;
                quickExpenseVehicle.value = currentVal;
            }
        });
    
        let bankSelect = document.getElementById('banquePaiement');
        if (!bankSelect && modePaiementInput && modePaiementInput.parentNode) {
            bankSelect = document.createElement('select');
            bankSelect.id = 'banquePaiement';
            bankSelect.style.display = 'none'; 
            bankSelect.innerHTML = `
                <option value="" disabled selected>Choisir la Banque...</option>
                <option value="BICICI BANK">BICICI BANK</option>
                <option value="BRIDGE BANK">BRIDGE BANK</option>
                <option value="ORANGE BANK">ORANGE BANK</option>
            `;
            modePaiementInput.parentNode.insertBefore(bankSelect, modePaiementInput.nextSibling);
        }
    
        function updatePaymentUI() {
            if (!modePaiementInput) return;
            const mode = modePaiementInput.value;
            if (mode === 'Virement' || mode === 'Chèque') {
                if(bankSelect) bankSelect.style.display = 'block';
                if(agentMobileMoneyInput) agentMobileMoneyInput.style.display = 'none'; 
            } else {
                if(bankSelect) bankSelect.style.display = 'none';
                if(agentMobileMoneyInput) agentMobileMoneyInput.style.display = 'block'; 
            }
        }
        if (modePaiementInput) modePaiementInput.addEventListener('change', updatePaymentUI);
        updatePaymentUI(); 
    
        if (addEntryBtn) {
            addEntryBtn.addEventListener('click', () => {
                const selectedAgents = agentChoices ? agentChoices.getValue(true) : []; 
                const agentString = selectedAgents.join(', '); 
        
                let detailPaiement = agentMobileMoneyInput ? agentMobileMoneyInput.value : '';
                if (bankSelect && bankSelect.style.display !== 'none') {
                    detailPaiement = bankSelect.value;
                    if (!detailPaiement) return AppModal.error("Veuillez sélectionner une Banque.");
                }
        
                const newData = {
                    date: document.getElementById('date').value,
                    reference: referenceInput ? referenceInput.value.trim() : '',
                    nom: nomInput ? nomInput.value.trim() : '',
                    conteneur: conteneurInput ? conteneurInput.value.trim().toUpperCase() : '',
                    prix: prixInput ? parseFloat(prixInput.value) || 0 : 0,
                    montantParis: montantParisInput ? parseFloat(montantParisInput.value) || 0 : 0,
                    montantAbidjan: montantAbidjanInput ? parseFloat(montantAbidjanInput.value) || 0 : 0,
                    agentMobileMoney: detailPaiement, 
                    modePaiement: modePaiementInput ? modePaiementInput.value : 'Espèce',
                    commune: communeInput ? communeInput.value : '', 
                    agent: agentString,
                    reste: 0,
                    adjustmentType: adjustmentTypeInput ? adjustmentTypeInput.value : '',
                    adjustmentVal: adjustmentValInput ? (parseFloat(adjustmentValInput.value) || 0) : 0,
                    waiveStorageFee: currentStorageFeeWaived, 
                    isNewAdjustment: currentIsNewAdjustment 
                };
        
                if (!newData.date || !newData.reference) return AppModal.error("Veuillez remplir la date et la référence/nom.");
                if (newData.prix <= 0) return AppModal.error("Le prix saisi est invalide.");
        
                let effectivePrix = newData.prix;
                if (newData.adjustmentType === 'reduction' && newData.adjustmentVal > 0) {
                    effectivePrix -= newData.adjustmentVal;
                } else if (newData.adjustmentType === 'augmentation' && newData.adjustmentVal > 0) {
                    if (!newData.isNewAdjustment) {
                        newData.prix += newData.adjustmentVal;
                        effectivePrix = newData.prix;
                        newData.isNewAdjustment = true;
                    }
                }
        
                const totalPaye = newData.montantParis + newData.montantAbidjan;
                if (totalPaye > effectivePrix) return AppModal.error(`IMPOSSIBLE : Trop perçu (le paiement dépasse le prix après réduction).`);
                newData.reste = totalPaye - effectivePrix;
        
                const existingIndex = dailyTransactions.findIndex(t => t.reference === newData.reference && t.modePaiement === newData.modePaiement);
                if (existingIndex > -1) {
                    const t = dailyTransactions[existingIndex];
        
                    if (newData.adjustmentType) { 
                        t.adjustmentType = newData.adjustmentType; 
                        t.adjustmentVal = newData.adjustmentVal; 
                    }
                    if (newData.isNewAdjustment && !t.isNewAdjustment) { 
                        t.isNewAdjustment = true; 
                        if (newData.adjustmentType === 'augmentation') {
                            t.prix += newData.adjustmentVal;
                        }
                    }
        
                    let effectivePrixExistant = t.prix;
                    if (t.adjustmentType === 'reduction' && t.adjustmentVal > 0) {
                        effectivePrixExistant -= t.adjustmentVal;
                    }
        
                    const nouveauTotal = t.montantParis + t.montantAbidjan + newData.montantParis + newData.montantAbidjan;
                    if (nouveauTotal > effectivePrixExistant) return AppModal.error("IMPOSSIBLE : Cumul trop élevé (dépasse le prix après réduction).");
                    
                    t.montantParis += newData.montantParis;
                    t.montantAbidjan += newData.montantAbidjan;
                    if (newData.agentMobileMoney) t.agentMobileMoney = newData.agentMobileMoney;
                    t.modePaiement = newData.modePaiement; 
                    t.reste = (t.montantParis + t.montantAbidjan) - effectivePrixExistant;
        
                } else {
                    dailyTransactions.push(newData);
                }
                
                saveAllToLocalStorage();
                renderAllTables();
                
                if (prixInput) prixInput.value = ''; 
                if (montantParisInput) montantParisInput.value = ''; 
                if (montantAbidjanInput) montantAbidjanInput.value = '';
                if (agentMobileMoneyInput) agentMobileMoneyInput.value = ''; 
                if (resteInput) { resteInput.value = ''; resteInput.className = ''; }
                if (bankSelect) bankSelect.value = ''; 
                if (adjustmentTypeInput) adjustmentTypeInput.value = ''; 
                if (adjustmentValInput) adjustmentValInput.value = '';
                if (referenceInput) { referenceInput.value = ''; referenceInput.focus(); }
                if (nomInput) nomInput.value = ''; 
                if (conteneurInput) conteneurInput.value = '';
                if (agentChoices) agentChoices.setValue([]); 
                currentStorageFeeWaived = false; 
                currentIsNewAdjustment = false; 
                
                if (window.innerWidth <= 768) window.goToMobileStep(1);
            });
        }
    
        if (addQuickExpenseBtn) {
            addQuickExpenseBtn.addEventListener('click', () => {
                const date = document.getElementById('date').value;
                const desc = quickExpenseDesc.value.trim();
                const amount = parseFloat(quickExpenseAmount.value);
                
                if (!date) return AppModal.error("Veuillez sélectionner la date en haut.");
                if (!desc || isNaN(amount) || amount <= 0) return AppModal.error("Motif ou Montant invalide.");
    
                const vId = quickExpenseVehicle ? quickExpenseVehicle.value : '';
                const selectedV = fleetVehicles.find(v => v.id === vId);
    
                dailyExpenses.push({
                    date: date,
                    description: desc,
                    montant: amount,
                    conteneur: '',
                    vehicleId: vId,
                    vehicleName: selectedV ? `${selectedV.name} (${selectedV.plate})` : ''
                });
    
                saveAllToLocalStorage();
                renderAllTables();
    
                quickExpenseDesc.value = '';
                quickExpenseAmount.value = '';
                if (quickExpenseVehicle) quickExpenseVehicle.value = '';
                quickExpenseDesc.focus();
            });
        }
    
        function saveAllToLocalStorage() {
            localStorage.setItem('dailyTransactions', JSON.stringify(dailyTransactions));
            localStorage.setItem('dailyExpenses', JSON.stringify(dailyExpenses));
        }
    
        function renderAllTables() {
            if (dailyTableBody) {
                dailyTableBody.innerHTML = '';
                dailyTransactions.forEach((data, index) => {
                    let priceDisplay = formatCFA(data.prix);
                    if (data.adjustmentType === 'reduction') priceDisplay += ' ⬇️';
                    if (data.adjustmentType === 'augmentation') priceDisplay += ' ⬆️';
        
                    dailyTableBody.innerHTML += `
                        <tr>
                            <td>${data.reference}</td><td>${data.nom || '-'}</td><td>${priceDisplay}</td>
                            <td>${data.modePaiement}</td>
                            <td class="${data.reste < 0 ? 'reste-negatif' : 'reste-positif'}">${formatCFA(data.reste)}</td>
                            <td><button class="deleteBtn" onclick="window.removeTransaction(${index})">X</button></td>
                        </tr>`;
                });
            }
            
            const dCount = document.getElementById('dailyCount');
            if (dCount) dCount.textContent = dailyTransactions.length;
    
            if (dailyExpensesTableBody) {
                dailyExpensesTableBody.innerHTML = '';
                dailyExpenses.forEach((exp, index) => {
                    const vehicleInfo = exp.vehicleName ? `<span class="tag" style="background:#3b82f6; font-size:10px;">🚗 ${exp.vehicleName}</span>` : '';
                    dailyExpensesTableBody.innerHTML += `
                        <tr>
                            <td>${exp.description} ${exp.conteneur ? '<span class="tag" style="background:#64748b; font-size:10px;">'+exp.conteneur+'</span>' : ''} ${vehicleInfo}</td><td>${formatCFA(exp.montant)}</td>
                            <td><button class="deleteBtn" onclick="window.removeExpense(${index})">X</button></td>
                        </tr>`;
                });
            }
    
            updateGlobalSummary();
        }
    
        function updateGlobalSummary() {
            let totalAbidjanEsp = 0; 
            let totalParis = 0;
            let totalExpenses = 0;
            let totalReste = 0;
            const breakdown = {};
    
            dailyTransactions.forEach(t => {
                const mode = t.modePaiement || 'Espèce';
                const amount = (t.montantAbidjan || 0) + (t.montantParis || 0);
                
                if (!breakdown[mode]) breakdown[mode] = 0;
                breakdown[mode] += amount;
    
                if (t.modePaiement === 'Espèce') {
                    totalAbidjanEsp += (t.montantAbidjan || 0);
                }
                totalParis += (t.montantParis || 0);
                totalReste += (t.reste || 0);
            });
    
            dailyExpenses.forEach(e => totalExpenses += e.montant);
    
            const netToPay = totalAbidjanEsp - totalExpenses;
    
            if(dailyTotalAbidjanEspecesEl) dailyTotalAbidjanEspecesEl.textContent = formatCFA(totalAbidjanEsp);
            if(dailyTotalExpensesEl) dailyTotalExpensesEl.textContent = formatCFA(totalExpenses);
            
            if(netToPayEl) {
                netToPayEl.textContent = formatCFA(netToPay);
                netToPayEl.style.color = netToPay < 0 ? '#d32f2f' : '#000'; 
            }
    
            if(dailyTotalParisEl) dailyTotalParisEl.textContent = formatCFA(totalParis);
            if(dailyTotalResteEl) dailyTotalResteEl.textContent = formatCFA(totalReste);
    
            const breakdownContainer = document.getElementById('paymentBreakdown');
            if (breakdownContainer) {
                breakdownContainer.innerHTML = '';
                for (const [mode, amount] of Object.entries(breakdown)) {
                    if (amount > 0) {
                        const div = document.createElement('div');
                        div.className = 'summary-item';
                        div.style.fontSize = '0.8em';
                        div.innerHTML = `<h4>${mode}</h4><span style="color:#0d47a1; font-weight:bold;">${formatCFA(amount)}</span>`;
                        breakdownContainer.appendChild(div);
                    }
                }
            }
        }
    
        window.removeTransaction = (i) => { dailyTransactions.splice(i, 1); saveAllToLocalStorage(); renderAllTables(); };
        window.removeExpense = (i) => { dailyExpenses.splice(i, 1); saveAllToLocalStorage(); renderAllTables(); };
    
        if (saveDayBtn) {
            saveDayBtn.addEventListener('click', async () => {
                if (dailyTransactions.length === 0 && dailyExpenses.length === 0) return AppModal.error("Rien à enregistrer, la session est vide.");
                
                const currentUserName = sessionStorage.getItem('userName') || 'Utilisateur';
                
                let totalsByMode = {};
                let totalEspAbidjan = 0;
                let totalDep = 0;
        
                dailyTransactions.forEach(t => {
                    const mode = t.modePaiement || 'Espèce';
                    const amount = (t.montantAbidjan || 0) + (t.montantParis || 0);
                    if (amount > 0) totalsByMode[mode] = (totalsByMode[mode] || 0) + amount;
                    if (mode === 'Espèce') totalEspAbidjan += (t.montantAbidjan || 0);
                });
        
                dailyExpenses.forEach(e => totalDep += e.montant);
                
                let msg = "CONFIRMATION :\n\n";
                for (const [mode, amount] of Object.entries(totalsByMode)) { msg += `Encaissements ${mode} : ${formatCFA(amount)}\n`; }
                if (Object.keys(totalsByMode).length === 0) msg += "Aucun encaissement.\n";
                msg += `Dépenses Livreur : ${formatCFA(totalDep)}\n\nNET À VERSER (Espèces) : ${formatCFA(totalEspAbidjan - totalDep)}\n\nEnregistrer ?`;
        
                if (!await AppModal.confirm(msg, "Validation de la Journée")) return;
        
                const batch = writeBatch(db);
                const auditRef = doc(collection(db, "audit_logs"));
                const currentSessionId = auditRef.id;
        
                const touchedTransactionIds = [];
                const touchedExpenseIds = [];
        
                const transactionsByRef = {};
                dailyTransactions.forEach(t => {
                    if (!transactionsByRef[t.reference]) transactionsByRef[t.reference] = [];
                    transactionsByRef[t.reference].push(t);
                });
        
                for (const ref of Object.keys(transactionsByRef)) {
                    const group = transactionsByRef[ref];
                    const baseTransac = group.reduce((prev, current) => (prev.prix > current.prix) ? prev : current);
                    
                    const totalParis = group.reduce((sum, t) => sum + t.montantParis, 0);
                    const totalAbidjan = group.reduce((sum, t) => sum + t.montantAbidjan, 0);
                    
                    const newPaymentEntries = group.map(t => ({
                        date: t.date, montantParis: t.montantParis, montantAbidjan: t.montantAbidjan,
                        agent: t.agent, saisiPar: currentUserName, modePaiement: t.modePaiement,
                        agentMobileMoney: t.agentMobileMoney, sessionId: currentSessionId
                    }));
        
                    const qTrans = await getDocs(query(collection(db, getCollectionName("transactions")), where("reference", "==", ref)));
        
                    if (!qTrans.empty) {
                        const docRef = qTrans.docs[0].ref;
                        const oldData = qTrans.docs[0].data();
                        const dailyMetadata = group[group.length - 1];
        
                        let finalPrix = oldData.prix || 0;
                        let finalAdjustmentType = dailyMetadata.adjustmentType || oldData.adjustmentType;
                        let finalAdjustmentVal = dailyMetadata.adjustmentVal || oldData.adjustmentVal || 0;
        
                        const augmentationItem = group.find(t => t.isNewAdjustment === true && t.adjustmentType === 'augmentation');
                        if (augmentationItem) finalPrix += augmentationItem.adjustmentVal;
        
                        let effectivePrix = finalPrix;
                        if (finalAdjustmentType === 'reduction') effectivePrix -= finalAdjustmentVal;
        
                        const newTotalParis = (oldData.montantParis || 0) + totalParis;
                        const newTotalAbidjan = (oldData.montantAbidjan || 0) + totalAbidjan;
                        const newReste = newTotalParis + newTotalAbidjan - effectivePrix;
        
                        const updates = {
                            montantParis: newTotalParis, montantAbidjan: newTotalAbidjan, reste: newReste,
                            paymentHistory: arrayUnion(...newPaymentEntries), lastPaymentDate: baseTransac.date,
                            saisiPar: currentUserName, isDeleted: false, modePaiement: baseTransac.modePaiement 
                        };
        
                        const oldAgents = (oldData.agent || "").split(',').map(a => a.trim()).filter(Boolean);
                        const groupAgents = group.map(t => t.agent).join(', ').split(',').map(a => a.trim()).filter(Boolean);
                        const combinedAgents = [...new Set([...oldAgents, ...groupAgents])].join(', ');
                        
                        if (combinedAgents !== oldData.agent) updates.agent = combinedAgents;
                        if (group.some(t => t.waiveStorageFee)) updates.storageFeeWaived = true;
        
                        if (dailyMetadata.commune && dailyMetadata.commune !== oldData.commune) updates.commune = dailyMetadata.commune;
                        if (dailyMetadata.agentMobileMoney) updates.agentMobileMoney = dailyMetadata.agentMobileMoney;
                        
                        if (augmentationItem) {
                            updates.prix = finalPrix; updates.adjustmentType = 'augmentation'; updates.adjustmentVal = augmentationItem.adjustmentVal;
                        } else if (dailyMetadata.adjustmentType) {
                            updates.adjustmentType = finalAdjustmentType; updates.adjustmentVal = finalAdjustmentVal;
                        }
        
                        batch.update(docRef, updates);
                        touchedTransactionIds.push(docRef.id);
                    } else {
                        const docRef = doc(collection(db, getCollectionName("transactions")));
                        const groupAgents = group.map(t => t.agent).join(', ').split(',').map(a => a.trim()).filter(Boolean);
                        const combinedAgents = [...new Set(groupAgents)].join(', ');
        
                        let effectivePrix = baseTransac.prix;
                        if (baseTransac.adjustmentType === 'reduction' && baseTransac.adjustmentVal > 0) effectivePrix -= baseTransac.adjustmentVal;
        
                        batch.set(docRef, { 
                            ...baseTransac,
                            montantParis: totalParis, montantAbidjan: totalAbidjan,
                            reste: (totalParis + totalAbidjan) - effectivePrix,
                            agency: activeAgency, agent: combinedAgents, isDeleted: false, 
                            saisiPar: currentUserName, paymentHistory: newPaymentEntries,
                            lastPaymentDate: baseTransac.date, storageFeeWaived: group.some(t => t.waiveStorageFee)
                        });
                        touchedTransactionIds.push(docRef.id);
                    }
        
                    const livQuery = await getDocs(query(collection(db, getCollectionName("livraisons")), where("ref", "==", ref), limit(1)));
                    if (!livQuery.empty) {
                        const livDoc = livQuery.docs[0];
                        const livUpdates = {};
                        if (baseTransac.conteneur && baseTransac.conteneur !== livDoc.data().conteneur) livUpdates.conteneur = baseTransac.conteneur;
                        if (baseTransac.nom && baseTransac.nom !== livDoc.data().destinataire) livUpdates.destinataire = baseTransac.nom;
                        if (Object.keys(livUpdates).length > 0) batch.update(livDoc.ref, livUpdates);
                    } else {
                        const newLivRef = doc(collection(db, getCollectionName("livraisons")));
                        batch.set(newLivRef, {
                            ref: ref, agency: activeAgency, destinataire: baseTransac.nom || 'Client Caisse',
                            expediteur: '', conteneur: baseTransac.conteneur || '', containerStatus: 'EN_COURS',
                            status: 'EN_ATTENTE', dateAjout: baseTransac.date || new Date().toISOString().split('T')[0],
                            quantite: 1, montant: (baseTransac.prix || 0) + ' CFA', numero: baseTransac.numero || '',
                            description: 'Créé automatiquement depuis la Caisse'
                        });
                    }
                }
        
                dailyExpenses.forEach(exp => {
                    const docRef = doc(collection(db, getCollectionName("expenses")));
                    const typeDepense = exp.conteneur ? "Conteneur" : "Mensuelle";
                    batch.set(docRef, {
                        date: exp.date, description: `${exp.description} (${currentUserName})`, montant: exp.montant,
                        agency: activeAgency, type: typeDepense, isDeleted: false, conteneur: exp.conteneur || "",
                        sessionId: currentSessionId, vehicleId: exp.vehicleId || "", vehicleName: exp.vehicleName || ""
                    });
                    touchedExpenseIds.push(docRef.id);
                });
        
                const sessionAgentsSet = new Set();
                dailyTransactions.forEach(t => {
                    if (t.agent) t.agent.split(',').forEach(a => { const trimmed = a.trim(); if (trimmed) sessionAgentsSet.add(trimmed); });
                });
                const sessionAgentsStr = Array.from(sessionAgentsSet).join(', ');
        
                let realEntryDate = "";
                if (dailyTransactions.length > 0) realEntryDate = dailyTransactions[0].date;
                else if (dailyExpenses.length > 0) realEntryDate = dailyExpenses[0].date;
                else realEntryDate = document.getElementById('date') ? document.getElementById('date').value : '';
                if (!realEntryDate) realEntryDate = new Date().toISOString().split('T')[0];
        
                let detailsStr = `Encaissements: ${dailyTransactions.length}, Dépenses: ${dailyExpenses.length} | Espèces: ${totalEspAbidjan}`;
                for (const [m, a] of Object.entries(totalsByMode)) {
                    if (m !== 'Espèce') detailsStr += `, ${m}: ${a}`;
                }
        
                batch.set(auditRef, {
                    date: new Date().toISOString(), entryDate: realEntryDate, user: currentUserName, agency: activeAgency,
                    action: "VALIDATION_JOURNEE", details: detailsStr, targetId: "BATCH", status: "PENDING", 
                    transactionIds: touchedTransactionIds, expenseIds: touchedExpenseIds, agents: sessionAgentsStr, 
                    totalIn: totalEspAbidjan, totalGlobalIn: Object.values(totalsByMode).reduce((sum, val) => sum + val, 0), 
                    totalOut: totalDep, result: totalEspAbidjan - totalDep
                });
        
                try {
                    await batch.commit();
                } catch (error) {
                    console.error("Erreur Enregistrement:", error);
                    if (error.code === 'resource-exhausted') {
                        AppModal.error("⚠️ Vous avez dépassé la limite d'écriture quotidienne Firebase (20 000 opérations).\n\nVeuillez réessayer demain.", "QUOTA ATTEINT");
                    } else {
                        AppModal.error("Erreur lors de l'enregistrement : " + error.message);
                    }
                    return;
                }
                
                const rawDate = document.getElementById('date') ? document.getElementById('date').value : '';
                const dateStr = rawDate ? rawDate.split('-').reverse().join('/') : new Date().toLocaleDateString('fr-FR');
                
                let waMsg = `*BILAN JOURNÉE DU ${dateStr}*\n`;
                waMsg += `👤 *${currentUserName}*\n\n`;
                
                if (dailyTransactions.length > 0) {
                    waMsg += `📦 *DÉTAIL OPÉRATIONS :*\n`;
                    dailyTransactions.forEach(t => {
                        const mtAbj = t.montantAbidjan > 0 ? formatCFA(t.montantAbidjan) : "0 F";
                        const mtPar = t.montantParis > 0 ? ` (+ Paris: ${formatCFA(t.montantParis)})` : "";
                        const commune = t.commune ? `📍 ${t.commune}` : "";
                        const info = t.agentMobileMoney ? `ℹ️ ${t.agentMobileMoney}` : "";
                        
                        waMsg += `🔹 *${t.reference}* ${t.nom ? `(${t.nom})` : ''}\n`;
                        if (commune) waMsg += `   ${commune}\n`;
                        waMsg += `   💰 ${mtAbj} [${t.modePaiement}]${mtPar} ${info}\n`;
                    });
                    waMsg += `\n`;
                }
        
                waMsg += `💰 *TOTAL ESPÈCES :* ${formatCFA(totalEspAbidjan)}\n`;
                
                if (dailyExpenses.length > 0) {
                    waMsg += `\n📉 *DÉPENSES (${formatCFA(totalDep)}) :*\n`;
                    dailyExpenses.forEach(e => { waMsg += `- ${e.description} : ${formatCFA(e.montant)}\n`; });
                }
                
                const net = totalEspAbidjan - totalDep;
                waMsg += `\n💵 *NET À VERSER :* ${formatCFA(net)}`;
        
                await AppModal.success("Les opérations de la journée ont été validées avec succès.", "Journée enregistrée");
                if (await AppModal.confirm("Voulez-vous envoyer le bilan récapitulatif par WhatsApp ?", "Bilan WhatsApp")) {
                    window.open(`https://wa.me/?text=${encodeURIComponent(waMsg)}`, '_blank');
                }
                
                dailyTransactions = []; dailyExpenses = [];
                saveAllToLocalStorage(); renderAllTables();
            });
        }
    
        if (referenceInput) {
            referenceInput.addEventListener('change', async () => { 
                const searchValue = referenceInput.value.trim();
                currentStorageFeeWaived = false; currentIsNewAdjustment = false; 
                if (!searchValue) { clearDisplayFields(); if(nomInput) nomInput.value=''; return; }
        
                const dailyItems = dailyTransactions.filter(t => t.reference === searchValue);
                if (dailyItems.length > 0) {
                     const base = dailyItems.reduce((prev, current) => (prev.prix > current.prix) ? prev : current);
                     const totalPaidDaily = dailyItems.reduce((sum, t) => sum + t.montantParis + t.montantAbidjan, 0);
                     const currentRest = (totalPaidDaily) - base.prix;
                     
                     fillFormWithData({ reference: base.reference, nom: base.nom, conteneur: base.conteneur, prix: base.prix, reste: currentRest, isDaily: true });
                     return;
                }
        
                let qT = await getDocs(query(collection(db, getCollectionName("transactions")), where("reference", "==", searchValue)));
                if (qT.empty) qT = await getDocs(query(collection(db, getCollectionName("transactions")), where("nom", "==", searchValue)));
        
                if (!qT.empty) {
                    if (qT.size > 1) return AppModal.error("Plusieurs résultats correspondent à cette recherche. Soyez plus précis.");
                    const data = qT.docs[0].data();
        
                    let effectivePrixForDisplay = data.prix || 0;
                    if (data.adjustmentType && String(data.adjustmentType).toLowerCase() === 'reduction') {
                        effectivePrixForDisplay -= (data.adjustmentVal || 0);
                    }
                    const paye = (data.montantParis || 0) + (data.montantAbidjan || 0);
                    data.reste = paye - effectivePrixForDisplay;
        
                    if ((data.reste || 0) < 0 && !data.storageFeeWaived) {
                        const inputDateVal = document.getElementById('date') ? document.getElementById('date').value : '';
                        const compareDate = inputDateVal ? new Date(inputDateVal) : new Date();
                        
                        let calculateStorageFee = (dateString, quantityOrItem = 1, cDate = new Date()) => {
                            if (!dateString) return { days: 0, fee: 0 };
                            let qte = 1; let tarifJour = 1000;
                            if (typeof quantityOrItem === 'object' && quantityOrItem !== null) {
                                qte = quantityOrItem.quantiteRestante !== undefined ? parseInt(quantityOrItem.quantiteRestante) : (parseInt(quantityOrItem.quantite) || 1);
                                if ((quantityOrItem.description || '').toLowerCase().includes('palette')) tarifJour = 3000;
                            } else { qte = parseInt(quantityOrItem) || 1; }
                            const arrivalDate = new Date(dateString);
                            const diffTime = cDate - arrivalDate;
                            if (diffTime < 0) return { days: 0, fee: 0 };
                            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                            if (diffDays <= 7) return { days: diffDays, fee: 0 };
                            else if (diffDays <= 14) return { days: diffDays, fee: 10000 * qte };
                            else { const extraDays = diffDays - 14; const unitFee = 10000 + (extraDays * tarifJour); return { days: diffDays, fee: unitFee * qte }; }
                        };
        
                        const { fee } = calculateStorageFee(data.date, data, compareDate);
                        if (fee > 0) {
                            const userResponse = await AppModal.prompt(
                                `⚠️ FRAIS DE MAGASINAGE : ${formatCFA(fee)}\n\n` +
                                `Veuillez confirmer l'action :\n` +
                                `1. OUI (Payer) : Gardez le montant ${fee}\n` +
                                `2. NON (Offrir) : Mettez 0\n` +
                                `3. RÉDUIRE : Modifiez le montant\n` +
                                `4. ANNULER : Cliquez sur Annuler`, fee, "Action Requise"
                            );
        
                            if (userResponse === null) { referenceInput.value = ''; return; }
        
                            const amount = parseFloat(userResponse);
                            if (isNaN(amount)) { AppModal.error("Le montant saisi est invalide."); referenceInput.value = ''; return; }
        
                            if (amount === 0) {
                                currentStorageFeeWaived = true;
                                AppModal.success("Frais de magasinage OFFERTS.");
                            } else {
                                data.prix = (data.prix || 0) + amount;
                                data.reste = ((data.montantParis || 0) + (data.montantAbidjan || 0)) - data.prix;
                                data.adjustmentType = 'augmentation';
                                data.adjustmentVal = amount;
                                currentIsNewAdjustment = true;
                                AppModal.success(`Frais de magasinage de ${formatCFA(amount)} ajoutés au prix.`);
                            }
                        }
                    }
                    fillFormWithData(data);
                } else {
                    const livQuery = await getDocs(query(collection(db, getCollectionName("livraisons")), where("ref", "==", searchValue), limit(1)));
                    
                    if (!livQuery.empty) {
                        const livData = livQuery.docs[0].data();
                        if (nomInput && (livData.destinataire || livData.expediteur)) {
                            nomInput.value = livData.destinataire || livData.expediteur;
                            nomInput.style.backgroundColor = "#e0f7fa"; 
                        }
                        if (conteneurInput && livData.conteneur) conteneurInput.value = livData.conteneur;
                        if (communeInput && livData.commune) communeInput.value = livData.commune;
        
                        let price = 0;
                        if (livData.prixOriginal) price = parseFloat(String(livData.prixOriginal).replace(/[^\d]/g, '')) || 0;
                        if (price === 0 && livData.montant) price = parseFloat(String(livData.montant).replace(/[^\d]/g, '')) || 0;
                        
                        if (price > 0 && prixInput) {
                            prixInput.value = price;
                            calculateAndStyleReste();
                        }
                    }
                }
                
                if (window.innerWidth <= 768 && searchValue && document.getElementById('caisseForm') && document.getElementById('caisseForm').classList.contains('mobile-step-1')) {
                    setTimeout(() => window.goToMobileStep(2), 350);
                }
            });
        }
    
        function clearDisplayFields() {
            if (prixInput) prixInput.value = ''; 
            if (conteneurInput) conteneurInput.value = ''; 
            if (resteInput) { resteInput.value = ''; resteInput.className = ''; }
            if (montantParisInput) montantParisInput.placeholder = 'Montant Paris'; 
            if (montantAbidjanInput) montantAbidjanInput.placeholder = 'Montant Abidjan';
            if (bankSelect) bankSelect.value = '';
            if (adjustmentTypeInput) adjustmentTypeInput.value = '';
            if (adjustmentValInput) adjustmentValInput.value = '';
        }
    
        function fillFormWithData(data) {
            if(referenceInput) referenceInput.value = data.reference; 
            if(nomInput && !nomInput.value) nomInput.value = data.nomDestinataire || data.nom || '';
            if(conteneurInput) conteneurInput.value = data.conteneur || '';
            
            if (data.reste < 0) {
                if (prixInput) prixInput.value = Math.abs(data.reste);
                if (resteInput) { resteInput.value = data.reste; resteInput.className = 'reste-negatif'; }
                if (montantParisInput) montantParisInput.placeholder = `Reste: ${formatCFA(Math.abs(data.reste))}`;
                if (montantAbidjanInput) montantAbidjanInput.placeholder = `Reste: ${formatCFA(Math.abs(data.reste))}`;
            } else {
                if (prixInput) {
                    if (data.isDaily) prixInput.value = 0;
                    else prixInput.value = data.prix;
                }
                if (resteInput) { resteInput.value = 0; resteInput.className = 'reste-positif'; }
                if (montantParisInput) montantParisInput.placeholder = "Soldé Paris"; 
                if (montantAbidjanInput) montantAbidjanInput.placeholder = "Soldé Abidjan";
            }
    
            if (adjustmentTypeInput && data.adjustmentType) adjustmentTypeInput.value = data.adjustmentType;
            if (adjustmentValInput && data.adjustmentVal) adjustmentValInput.value = data.adjustmentVal;
    
            if (data.modePaiement && modePaiementInput) {
                modePaiementInput.value = data.modePaiement;
                updatePaymentUI();
                if ((data.modePaiement === 'Virement' || data.modePaiement === 'Chèque') && data.agentMobileMoney && bankSelect) {
                    bankSelect.value = data.agentMobileMoney;
                }
            }
        }
    
        function calculateAndStyleReste() {
            let prix = prixInput ? parseFloat(prixInput.value) || 0 : 0;
            const paris = montantParisInput ? parseFloat(montantParisInput.value) || 0 : 0;
            const abidjan = montantAbidjanInput ? parseFloat(montantAbidjanInput.value) || 0 : 0;
            
            const adjType = adjustmentTypeInput ? adjustmentTypeInput.value : '';
            const adjVal = adjustmentValInput ? (parseFloat(adjustmentValInput.value) || 0) : 0;
            
            if (adjType === 'reduction' && adjVal > 0) prix -= adjVal;
            else if (adjType === 'augmentation' && adjVal > 0) prix += adjVal;
            
            const reste = (paris + abidjan) - prix;
            if (resteInput) {
                resteInput.value = reste;
                resteInput.className = reste >= 0 ? 'reste-positif' : 'reste-negatif'; 
            }
        }
    
        if(prixInput) prixInput.addEventListener('input', calculateAndStyleReste);
        if(montantParisInput) montantParisInput.addEventListener('input', calculateAndStyleReste);
        if(montantAbidjanInput) montantAbidjanInput.addEventListener('input', calculateAndStyleReste);
        if (adjustmentTypeInput) adjustmentTypeInput.addEventListener('change', calculateAndStyleReste);
        if (adjustmentValInput) adjustmentValInput.addEventListener('input', calculateAndStyleReste);
        
        function populateDatalist() {
            const qDatalist = query(collection(db, getCollectionName("transactions")), where("isDeleted", "!=", true), orderBy("isDeleted"), orderBy("date", "desc"));
            getDocs(qDatalist).then(snapshot => {
                const references = new Set(); 
                snapshot.forEach(doc => {
                    const d = doc.data();
                    if (d.reference) references.add(d.reference);
                    if (d.nom) references.add(d.nom);
                });
                if(referenceList) {
                    referenceList.innerHTML = '';
                    references.forEach(ref => {
                        const opt = document.createElement('option'); opt.value = ref; referenceList.appendChild(opt);
                    });
                }
            });
        }
    
        window.initMobileApp = function() {
            if (window.innerWidth > 768) return; 
        
            const desktopView = document.getElementById('desktop-view');
            const mobileView = document.getElementById('mobile-view');
            const desktopHeader = document.querySelector('.top-bar');
            if (desktopHeader) desktopHeader.style.setProperty('display', 'none', 'important');
            if (desktopView) desktopView.style.setProperty('display', 'none', 'important');
            if (mobileView) mobileView.style.setProperty('display', 'block', 'important');
        
            const mobRefInput = document.getElementById('mob-refInput');
            const mobNomInput = document.getElementById('mob-nomInput');
            const mobConteneurInput = document.getElementById('mob-conteneurInput');
            const mobPrixInput = document.getElementById('mob-prixInput');
            const mobMontantInput = document.getElementById('mob-montantInput');
            const mobResteInput = document.getElementById('mob-resteInput');
            const mobModeInput = document.getElementById('mob-modeInput');
            const mobAgentInput = document.getElementById('mob-agentInput');
            const mobAddBtn = document.getElementById('mob-addBtn');
        
            const mobDepenseDesc = document.getElementById('mob-depenseDesc');
            const mobDepenseAmount = document.getElementById('mob-depenseAmount');
            const mobAddDepenseBtn = document.getElementById('mob-addDepenseBtn');
        
            const mobItemsList = document.getElementById('mob-itemsList');
            const mobTotalIn = document.getElementById('mob-totalIn');
            const mobTotalOut = document.getElementById('mob-totalOut');
            const mobTotalNet = document.getElementById('mob-totalNet');
            const mobValidateDayBtn = document.getElementById('mob-validateDayBtn');
        
            let mobile_dailyTransactions = JSON.parse(localStorage.getItem('mobile_dailyTransactions')) || [];
            let mobile_dailyDepenses = JSON.parse(localStorage.getItem('mobile_dailyDepenses')) || [];
        
            getDocs(query(collection(db, getCollectionName("transactions")), where("isDeleted", "!=", true), orderBy("isDeleted"), orderBy("date", "desc"))).then(snapshot => {
                const references = new Set(); 
                snapshot.forEach(doc => { if (doc.data().reference) references.add(doc.data().reference); });
                const mobRefList = document.getElementById('mob-referenceList');
                if(mobRefList) {
                    mobRefList.innerHTML = '';
                    references.forEach(ref => {
                        const opt = document.createElement('option'); opt.value = ref; mobRefList.appendChild(opt);
                    });
                }
            });
            
            getDocs(query(collection(db, "agents"), orderBy("name"))).then(snap => {
                if(mobAgentInput) {
                    snap.forEach(doc => {
                        const opt = document.createElement('option');
                        opt.value = doc.data().name;
                        opt.textContent = doc.data().name;
                        mobAgentInput.appendChild(opt);
                    });
                }
            });
        
            if (mobModeInput && mobAgentInput) {
                mobModeInput.addEventListener('change', () => {
                    if (mobModeInput.value !== 'Espèce') {
                        mobAgentInput.style.display = 'block';
                    } else {
                        mobAgentInput.style.display = 'none';
                        mobAgentInput.value = '';
                    }
                });
            }
        
            if(mobRefInput) {
                mobRefInput.addEventListener('change', async () => {
                    const searchValue = mobRefInput.value.trim().toUpperCase();
                    if(mobNomInput) mobNomInput.value = ''; 
                    if(mobConteneurInput) mobConteneurInput.value = ''; 
                    if(mobPrixInput) mobPrixInput.value = ''; 
                    if(mobResteInput) mobResteInput.value = ''; 
                    if(mobMontantInput) mobMontantInput.value = '';
                    if(mobResteInput) mobResteInput.dataset.baseReste = '0';
                    window.mobCurrentAdjustment = null;
                    if (!searchValue) return;
            
                    const dailyItems = mobile_dailyTransactions.filter(t => t.reference === searchValue);
                    if (dailyItems.length > 0) {
                         const base = dailyItems.reduce((prev, current) => (prev.prix > current.prix) ? prev : current);
                         const totalPaidDaily = dailyItems.reduce((sum, t) => sum + t.montant, 0);
                         const currentRest = base.baseReste + totalPaidDaily; 
                         
                         if(mobNomInput) mobNomInput.value = base.nom; 
                         if(mobConteneurInput) mobConteneurInput.value = base.conteneur;
                         if(mobPrixInput) mobPrixInput.value = base.prix; 
                         if(mobResteInput) { mobResteInput.value = currentRest; mobResteInput.dataset.baseReste = currentRest; }
                         if(mobMontantInput) mobMontantInput.value = Math.abs(currentRest);
                         return;
                    }
            
                    let qT = await getDocs(query(collection(db, "transactions"), where("reference", "==", searchValue)));
                    if (!qT.empty) {
                        const data = qT.docs[0].data();
                        let effectivePrix = data.prix || 0;
                        if (data.adjustmentType === 'reduction') effectivePrix -= (data.adjustmentVal || 0);
                        
                        let reste = ((data.montantParis || 0) + (data.montantAbidjan || 0)) - effectivePrix;
            
                        if (reste < 0 && !data.storageFeeWaived) {
                            const diffDays = Math.ceil((new Date() - new Date(data.date)) / (1000 * 60 * 60 * 24));
                            let fee = 0;
                            if (diffDays > 7 && diffDays <= 14) fee = 10000 * (data.quantite || 1);
                            else if (diffDays > 14) fee = (10000 + (diffDays - 14) * 1000) * (data.quantite || 1);
            
                            if (fee > 0) {
                                const userResponse = window.AppModal ? await AppModal.prompt(`⚠️ FRAIS MAGASINAGE : ${fee} CFA\n\nMontant à appliquer (0 pour offrir) :`, fee) : prompt(`Frais magasinage: ${fee}. Montant à appliquer ?`, fee);
                                if (userResponse !== null) {
                                    const amt = parseFloat(userResponse) || 0;
                                    if (amt > 0) {
                                        window.mobCurrentAdjustment = { type: 'augmentation', val: amt };
                                        effectivePrix += amt; reste -= amt;
                                    }
                                }
                            }
                        }
            
                        if(mobNomInput) mobNomInput.value = data.nomDestinataire || data.nom || '';
                        if(mobConteneurInput) mobConteneurInput.value = data.conteneur || ''; 
                        if(mobPrixInput) mobPrixInput.value = effectivePrix;
                        if(mobResteInput) { mobResteInput.value = reste; mobResteInput.dataset.baseReste = reste; }
                        if(mobMontantInput) mobMontantInput.value = Math.abs(reste);
                    } else {
                        const livQuery = await getDocs(query(collection(db, getCollectionName("livraisons")), where("ref", "==", searchValue), limit(1)));
                        if (!livQuery.empty) {
                            const livData = livQuery.docs[0].data();
                            if(mobNomInput) mobNomInput.value = livData.destinataire || livData.expediteur || '';
                            if(mobConteneurInput) mobConteneurInput.value = livData.conteneur || '';
                            let price = parseFloat(String(livData.prixOriginal || livData.montant || '0').replace(/[^\d]/g, '')) || 0;
                            if(mobPrixInput) mobPrixInput.value = price; 
                            if(mobResteInput) { mobResteInput.value = -price; mobResteInput.dataset.baseReste = -price; }
                            if(mobMontantInput) mobMontantInput.value = price;
                        }
                    }
                });
            }
        
            if(mobMontantInput && mobResteInput) {
                mobMontantInput.addEventListener('input', () => {
                    const baseReste = parseFloat(mobResteInput.dataset.baseReste) || 0;
                    mobResteInput.value = baseReste + (parseFloat(mobMontantInput.value) || 0);
                });
            }
        
            function renderMobileList() {
                let totalIn = 0;
                let totalOut = 0;
                if(mobItemsList) mobItemsList.innerHTML = '';
        
                if(mobile_dailyTransactions.length === 0 && mobile_dailyDepenses.length === 0) {
                    if(mobItemsList) mobItemsList.innerHTML = '<div style="text-align:center; padding:20px; color:#94a3b8; font-size:14px;">Aucune opération enregistrée.</div>';
                }
        
                mobile_dailyTransactions.forEach((t, i) => {
                    totalIn += t.montant;
                    const agentTag = t.agentRecepteur ? `<span class="tag" style="background:#dbeafe; color:#1e40af; font-size:10px; margin-left:5px;">👤 ${t.agentRecepteur}</span>` : '';
                    if(mobItemsList) mobItemsList.innerHTML += `
                        <div class="mob-list-item">
                            <div>
                                <strong>${t.reference}</strong> <span class="tag" style="background:#e2e8f0; color:#333; font-size:10px;">${t.mode}</span>${agentTag}<br>
                                <span style="color:#10b981; font-weight:bold;">+ ${formatCFA(t.montant)}</span>
                            </div>
                            <div class="mob-list-item-actions">
                                <button onclick="window.mobEditTransaction(${i})" title="Modifier">✏️</button>
                                <button onclick="window.mobDeleteTransaction(${i})" title="Supprimer">❌</button>
                            </div>
                        </div>
                    `;
                });
        
                mobile_dailyDepenses.forEach((d, i) => {
                    totalOut += d.montant;
                    if(mobItemsList) mobItemsList.innerHTML += `
                        <div class="mob-list-item">
                            <div>
                                <strong>${d.motif}</strong><br>
                                <span style="color:#ef4444; font-weight:bold;">- ${formatCFA(d.montant)}</span>
                            </div>
                            <div class="mob-list-item-actions">
                                <button onclick="window.mobDeleteDepense(${i})" title="Supprimer">❌</button>
                            </div>
                        </div>
                    `;
                });
        
                if(mobTotalIn) mobTotalIn.textContent = formatCFA(totalIn);
                if(mobTotalOut) mobTotalOut.textContent = formatCFA(totalOut);
                if(mobTotalNet) mobTotalNet.textContent = formatCFA(totalIn - totalOut);
        
                localStorage.setItem('mobile_dailyTransactions', JSON.stringify(mobile_dailyTransactions));
                localStorage.setItem('mobile_dailyDepenses', JSON.stringify(mobile_dailyDepenses));
            }
        
            window.mobSwitchTab = function(tab) {
                document.getElementById('mob-nav-saisie').classList.remove('active');
                document.getElementById('mob-nav-depenses').classList.remove('active');
                document.getElementById('mob-saisieView').style.display = 'none';
                document.getElementById('mob-depensesView').style.display = 'none';
        
                if(tab === 'saisie') {
                    document.getElementById('mob-nav-saisie').classList.add('active');
                    document.getElementById('mob-saisieView').style.display = 'block';
                } else {
                    document.getElementById('mob-nav-depenses').classList.add('active');
                    document.getElementById('mob-depensesView').style.display = 'block';
                }
            };
        
            window.mobDeleteTransaction = function(i) { 
                if(confirm("Supprimer cet encaissement ?")) { mobile_dailyTransactions.splice(i, 1); renderMobileList(); }
            };
            window.mobDeleteDepense = function(i) { 
                if(confirm("Supprimer cette dépense ?")) { mobile_dailyDepenses.splice(i, 1); renderMobileList(); }
            };
        
            window.mobEditTransaction = function(i) {
                const t = mobile_dailyTransactions[i];
                if(mobRefInput) mobRefInput.value = t.reference;
                if(mobMontantInput) mobMontantInput.value = t.montant;
                if(mobModeInput) mobModeInput.value = t.mode;
                if(mobNomInput) mobNomInput.value = t.nom;
                if(mobConteneurInput) mobConteneurInput.value = t.conteneur;
                if(mobPrixInput) mobPrixInput.value = t.prix;
                if(mobResteInput) { mobResteInput.value = t.baseReste + t.montant; mobResteInput.dataset.baseReste = t.baseReste; }
                
                if (mobAgentInput) {
                    mobAgentInput.value = t.agentRecepteur || '';
                    mobAgentInput.style.display = t.mode !== 'Espèce' ? 'block' : 'none';
                }
                window.mobCurrentAdjustment = t.isNewAdjustment ? { type: t.adjustmentType, val: t.adjustmentVal } : null;
        
                mobile_dailyTransactions.splice(i, 1);
                renderMobileList();
                window.mobSwitchTab('saisie');
                window.scrollTo({ top: 0, behavior: 'smooth' });
            };
        
            if(mobAddBtn) {
                mobAddBtn.addEventListener('click', () => {
                    const ref = mobRefInput.value.trim().toUpperCase();
                    const montant = parseFloat(mobMontantInput.value);
                    const mode = mobModeInput.value;
                    const nom = mobNomInput.value.trim() || 'Client';
                    const conteneur = mobConteneurInput.value.trim();
                    const prix = parseFloat(mobPrixInput.value) || montant;
                    const baseReste = parseFloat(mobResteInput.dataset.baseReste) || 0;
                    const adj = window.mobCurrentAdjustment || null;
                    const agentRecepteur = mobAgentInput ? mobAgentInput.value : '';
        
                    if(!ref || isNaN(montant) || montant < 0) return window.AppModal ? AppModal.error("Veuillez saisir une référence et un montant valide.") : alert("Veuillez saisir des données valides.");
                    if(mode !== 'Espèce' && !agentRecepteur) return window.AppModal ? AppModal.error("Veuillez sélectionner l'agent ayant reçu le dépôt sur son compte.") : alert("Veuillez sélectionner l'agent.");
        
                    mobile_dailyTransactions.push({ 
                        reference: ref, montant, mode, nom, conteneur, prix, baseReste, agentRecepteur,
                        adjustmentType: adj ? adj.type : '', adjustmentVal: adj ? adj.val : 0, isNewAdjustment: !!adj
                    });
                    
                    if(mobRefInput) mobRefInput.value = ''; 
                    if(mobMontantInput) mobMontantInput.value = ''; 
                    if(mobNomInput) mobNomInput.value = '';
                    if(mobConteneurInput) mobConteneurInput.value = ''; 
                    if(mobPrixInput) mobPrixInput.value = ''; 
                    if(mobResteInput) { mobResteInput.value = ''; mobResteInput.dataset.baseReste = '0'; }
                    window.mobCurrentAdjustment = null;
                    if(mobAgentInput) { mobAgentInput.value = ''; mobAgentInput.style.display = 'none'; }
        
                    renderMobileList();
                    const lCont = document.getElementById('mob-listContainer');
                    if(lCont) lCont.scrollIntoView({ behavior: 'smooth' });
                });
            }
        
            if(mobAddDepenseBtn) {
                mobAddDepenseBtn.addEventListener('click', () => {
                    const motif = mobDepenseDesc.value.trim();
                    const montant = parseFloat(mobDepenseAmount.value);
        
                    if(!motif || isNaN(montant) || montant <= 0) return AppModal ? AppModal.error("Veuillez saisir un motif et un montant valide.") : alert("Veuillez saisir des données valides.");
        
                    mobile_dailyDepenses.push({ motif, montant });
                    if(mobDepenseDesc) mobDepenseDesc.value = ''; 
                    if(mobDepenseAmount) mobDepenseAmount.value = '';
                    renderMobileList();
                    const lCont = document.getElementById('mob-listContainer');
                    if(lCont) lCont.scrollIntoView({ behavior: 'smooth' });
                });
            }
        
            if(mobValidateDayBtn) {
                mobValidateDayBtn.addEventListener('click', async () => {
                    if(mobile_dailyTransactions.length === 0 && mobile_dailyDepenses.length === 0) return AppModal ? AppModal.error("Rien à valider.") : alert("Rien à valider.");
        
                    const confirmation = AppModal ? await AppModal.confirm("Valider la journée et envoyer à la base de données ?") : confirm("Valider la journée ?");
                    if(!confirmation) return;
        
                    mobValidateDayBtn.disabled = true;
                    mobValidateDayBtn.textContent = "⏳ Validation en cours...";
        
                    const userName = sessionStorage.getItem('userName') || 'Livreur';
                    const dateStr = new Date().toISOString().split('T')[0];
        
                    try {
                        const batch = writeBatch(db);
                        const auditRef = doc(collection(db, "audit_logs"));
                        const sessionId = auditRef.id;
        
                        let totalIn = 0;
                        let totalOut = 0;
                        let detailsStr = `Saisie Mobile (${userName}) | `;
        
                        const touchedTransactionIds = [];
                        const touchedExpenseIds = [];
        
                        const transactionsByRef = {};
                        mobile_dailyTransactions.forEach(t => {
                            totalIn += t.montant;
                            if (!transactionsByRef[t.reference]) transactionsByRef[t.reference] = [];
                            transactionsByRef[t.reference].push(t);
                        });
        
                        for (const ref of Object.keys(transactionsByRef)) {
                            const group = transactionsByRef[ref];
                            const baseTransac = group.reduce((prev, current) => (prev.prix > current.prix) ? prev : current);
                            const totalAbidjan = group.reduce((sum, t) => sum + t.montant, 0);
        
                            const newPaymentEntries = group.map(t => ({
                                date: dateStr, montantParis: 0, montantAbidjan: t.montant, agent: userName,
                                saisiPar: userName, modePaiement: t.mode, agentMobileMoney: t.agentRecepteur || '', sessionId: sessionId
                            }));
        
                            const qTrans = await getDocs(query(collection(db, getCollectionName("transactions")), where("reference", "==", ref)));
        
                            if (!qTrans.empty) {
                                const docRef = qTrans.docs[0].ref;
                                const oldData = qTrans.docs[0].data();
                                const dailyMetadata = group[group.length - 1];
        
                                let finalPrix = oldData.prix || 0;
                                let finalAdjustmentType = dailyMetadata.adjustmentType || oldData.adjustmentType;
                                let finalAdjustmentVal = dailyMetadata.adjustmentVal || oldData.adjustmentVal || 0;
        
                                const augmentationItem = group.find(t => t.isNewAdjustment && t.adjustmentType === 'augmentation');
                                if (augmentationItem) finalPrix += augmentationItem.adjustmentVal;
                                let effectivePrix = finalPrix;
                                if (finalAdjustmentType === 'reduction') effectivePrix -= finalAdjustmentVal;
        
                                const newTotalParis = (oldData.montantParis || 0);
                                const newTotalAbidjan = (oldData.montantAbidjan || 0) + totalAbidjan;
                                const newReste = newTotalParis + newTotalAbidjan - effectivePrix;
        
                                const updates = { montantAbidjan: newTotalAbidjan, reste: newReste, paymentHistory: arrayUnion(...newPaymentEntries), lastPaymentDate: dateStr, saisiPar: userName, isDeleted: false, modePaiement: baseTransac.mode };
                                if (baseTransac.agentRecepteur) updates.agentMobileMoney = baseTransac.agentRecepteur;
        
                                if (augmentationItem) { updates.prix = finalPrix; updates.adjustmentType = 'augmentation'; updates.adjustmentVal = augmentationItem.adjustmentVal; } 
                                else if (dailyMetadata.adjustmentType) { updates.adjustmentType = finalAdjustmentType; updates.adjustmentVal = finalAdjustmentVal; }
        
                                batch.update(docRef, updates);
                                touchedTransactionIds.push(docRef.id);
                            } else {
                                const docRef = doc(collection(db, getCollectionName("transactions")));
                                let effectivePrix = baseTransac.prix;
                                if (baseTransac.adjustmentType === 'reduction') effectivePrix -= baseTransac.adjustmentVal;
        
                                batch.set(docRef, {
                                    date: dateStr, reference: ref, nom: baseTransac.nom || 'Client', conteneur: baseTransac.conteneur || '',
                                    prix: baseTransac.prix, montantParis: 0, montantAbidjan: totalAbidjan, reste: totalAbidjan - effectivePrix,
                                    agency: activeAgency,
                                    agent: userName, isDeleted: false, saisiPar: userName, modePaiement: baseTransac.mode, agentMobileMoney: baseTransac.agentRecepteur || '', paymentHistory: newPaymentEntries, lastPaymentDate: dateStr
                                });
                                touchedTransactionIds.push(docRef.id);
                            }
                            
                            const livQuery = await getDocs(query(collection(db, getCollectionName("livraisons")), where("ref", "==", ref), limit(1)));
                            if (!livQuery.empty) {
                                const livUpdates = {};
                                if (baseTransac.conteneur && baseTransac.conteneur !== livQuery.docs[0].data().conteneur) livUpdates.conteneur = baseTransac.conteneur;
                                if (baseTransac.nom && baseTransac.nom !== livQuery.docs[0].data().destinataire) livUpdates.destinataire = baseTransac.nom;
                                if (Object.keys(livUpdates).length > 0) batch.update(livQuery.docs[0].ref, livUpdates);
                            } else {
                                const newLivRef = doc(collection(db, getCollectionName("livraisons")));
                                batch.set(newLivRef, {
                                    ref: ref,
                                    agency: activeAgency,
                                    destinataire: baseTransac.nom || 'Client Caisse',
                                    expediteur: '',
                                    conteneur: baseTransac.conteneur || '',
                                    containerStatus: 'EN_COURS',
                                    status: 'EN_ATTENTE',
                                    dateAjout: baseTransac.date || new Date().toISOString().split('T')[0],
                                    quantite: 1,
                                    montant: (baseTransac.prix || 0) + ' CFA',
                                    numero: baseTransac.numero || '',
                                    description: 'Créé automatiquement depuis la Caisse'
                                });
                            }
                        }
        
                        mobile_dailyDepenses.forEach(d => {
                            const docRef = doc(collection(db, getCollectionName("expenses")));
                            totalOut += d.montant;
                            batch.set(docRef, {
                                date: dateStr,
                                description: d.motif + ` (${userName})`,
                                montant: d.montant,
                                agency: activeAgency,
                                type: 'Mensuelle',
                                mode: 'Espèce',
                                isDeleted: false,
                                sessionId: sessionId
                            });
                            touchedExpenseIds.push(docRef.id);
                        });
        
                        detailsStr += `Encaissements: ${mobile_dailyTransactions.length}, Dépenses: ${mobile_dailyDepenses.length}`;
        
                        batch.set(auditRef, {
                            date: new Date().toISOString(),
                            entryDate: dateStr,
                            user: userName,
                            agency: activeAgency,
                            action: "VALIDATION_JOURNEE",
                            details: detailsStr,
                            targetId: "BATCH_MOBILE",
                            status: "PENDING",
                            transactionIds: touchedTransactionIds,
                            expenseIds: touchedExpenseIds,
                            agents: userName,
                            totalIn: totalIn,
                            totalGlobalIn: totalIn,
                            totalOut: totalOut,
                            result: totalIn - totalOut
                        });
        
                        await batch.commit();
        
                        let waMsg = `*BILAN LIVREUR DU ${new Date().toLocaleDateString('fr-FR')}*\n`;
                        waMsg += `👤 *${userName}*\n\n`;
        
                        if(mobile_dailyTransactions.length > 0) {
                            waMsg += `📦 *ENCAISSEMENTS :*\n`;
                            mobile_dailyTransactions.forEach(t => {
                                const info = t.agentRecepteur ? ` (Reçu par: ${t.agentRecepteur})` : "";
                                waMsg += `- ${t.reference} : ${formatCFA(t.montant)} [${t.mode}]${info}\n`;
                            });
                        }
        
                        if(mobile_dailyDepenses.length > 0) {
                            waMsg += `\n📉 *DÉPENSES :*\n`;
                            mobile_dailyDepenses.forEach(d => {
                                waMsg += `- ${d.motif} : ${formatCFA(d.montant)}\n`;
                            });
                        }
        
                        const net = totalIn - totalOut;
                        waMsg += `\n💵 *NET À VERSER : ${formatCFA(net)}*`;
        
                        mobile_dailyTransactions = [];
                        mobile_dailyDepenses = [];
                        renderMobileList();
        
                        if(AppModal) await AppModal.success("Journée validée avec succès !");
                        else alert("Journée validée avec succès !");
                        
                        window.open(`https://wa.me/?text=${encodeURIComponent(waMsg)}`, '_blank');
        
                    } catch(e) {
                        console.error(e);
                        if(AppModal) AppModal.error("Erreur lors de l'enregistrement : " + e.message);
                        else alert("Erreur lors de l'enregistrement : " + e.message);
                    } finally {
                        mobValidateDayBtn.disabled = false;
                        mobValidateDayBtn.textContent = "✅ Valider la journée";
                    }
                });
            }
        
            renderMobileList();
        };
    
        window.reparerCalculsFinanciers = async function() {
            if (!confirm("Voulez-vous recalculer tous les montants et restes de la base de données pour corriger les doublons ?")) return;
            
            try {
                const transSnap = await getDocs(query(collection(db, getCollectionName("transactions")), where("isDeleted", "!=", true), where("agency", "==", sessionStorage.getItem('currentActiveAgency') || 'abidjan')));
                let batch = writeBatch(db);
                let count = 0;
                
                transSnap.forEach(docSnap => {
                    const t = docSnap.data();
                    if (t.paymentHistory && t.paymentHistory.length > 0) {
                        const vraiAbidjan = t.paymentHistory.reduce((sum, p) => sum + (p.montantAbidjan || 0), 0);
                        const vraiParis = t.paymentHistory.reduce((sum, p) => sum + (p.montantParis || 0), 0);
                        
                        let effectivePrix = t.prix || 0;
                        if (t.adjustmentType === 'reduction') effectivePrix -= (t.adjustmentVal || 0);
                        if (t.adjustmentType === 'augmentation') effectivePrix += (t.adjustmentVal || 0);
                        
                        const vraiReste = (vraiAbidjan + vraiParis) - effectivePrix;
                        
                        if (t.montantAbidjan !== vraiAbidjan || t.reste !== vraiReste) {
                            batch.update(docSnap.ref, {
                                montantAbidjan: vraiAbidjan,
                                montantParis: vraiParis,
                                reste: vraiReste
                            });
                            count++;
                        }
                    }
                });
                
                if (count > 0) {
                    await batch.commit();
                    alert(`✅ Réparation terminée : ${count} transactions ont été corrigées (Montants doublés effacés).`);
                } else {
                    alert("👍 Tout est déjà correct, aucune erreur trouvée.");
                }
            } catch (e) {
                console.error(e);
                alert("Erreur lors de la réparation : " + e.message);
            }
        };
    
        renderAllTables();
        populateDatalist(); 
        if (typeof initBackToTopButton === 'function') initBackToTopButton();
        window.initMobileApp();
    }
};