import { db } from '../../../commun/firebase-config.js';
import { collection, doc, addDoc, setDoc, updateDoc, query, where, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getCollectionName } from '../../../commun/agencies-config.js';

import { formatMoney } from '../../../commun/services/format.js';

export const VoitureView = {
    render(app, container) {
        this.app = app;
        
        container.innerHTML = `
            <style>
                /* Fiches (tablette + pliable + mobile ≤1024px) : le tableau Flotte
                   (7 colonnes) coupe sur petit écran -> fiches sans libellés. */
                @media (max-width: 1024px) {
                    .vt-scope .table thead { display: none; }
                    .vt-scope .table, .vt-scope .table tbody, .vt-scope .table tr { display: block; width: 100%; }
                    .vt-scope .table td { box-sizing: border-box; }
                    .vt-scope .table tbody tr { box-sizing: border-box; border: 1px solid #e8edf3; border-radius: 11px; margin-bottom: 10px; padding: 9px 13px; background: #fff; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; box-shadow: 0 1px 2px rgba(15,23,42,.04); }
                    .vt-scope .table tbody td { border: none !important; padding: 0 !important; width: auto; max-width: 100%; font-size: 12.5px; color: #475569; white-space: normal !important; overflow-wrap: anywhere; word-break: break-word; }
                    .vt-scope .table tbody td:nth-child(1) { width: 100%; color: #94a3b8; font-size: 11px; }
                    .vt-scope .table tbody td:nth-child(5) { width: 100%; color: #334155; }
                    .vt-scope .table tbody td:last-child { margin-left: auto; }
                }
            </style>
            <div class="dashboard-container vt-scope">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 10px;"><h2 style="margin: 0; color: #1e293b;">🚗 Gestion de la Flotte & Véhicules</h2></div>
                <div class="totals-container" style="margin-bottom: 20px;">
                    <div class="total-card"><h3>Revenus (Location)</h3><p id="statIncome" style="color:#10b981;">0 CFA</p></div>
                    <div class="total-card"><h3>Dépenses Véhicules</h3><p id="statExpense" style="color:#ef4444;">0 CFA</p></div>
                    <div class="total-card" id="card-profit"><h3>Bénéfice Net</h3><p id="statProfit">0 CFA</p></div>
                </div>
                <div style="display: flex; gap: 20px; flex-wrap: wrap; margin-bottom: 20px;">
                    <div class="card" style="flex: 2; min-width: 300px;">
                        <h3 style="margin-top: 0;">Saisir une opération</h3>
                        <div class="form-grid">
                            <input type="date" id="transDate"><select id="vehicleSelect"><option value="">-- Véhicule --</option></select>
                            <select id="transType"><option value="Dépense">Dépense (Sortie)</option><option value="Entrée">Entrée (Location)</option></select>
                            <select id="transCategory"><option value="Carburant">Carburant</option><option value="Entretien / Réparation">Entretien / Réparation</option><option value="Pièces de rechange">Pièces de rechange</option><option value="Assurance / Visite technique">Assurance / Visite technique</option><option value="Contravention / Amende">Contravention / Amende</option><option value="Autre Dépense">Autre Dépense</option></select>
                            <input type="number" id="transAmount" placeholder="Montant CFA"><input type="text" id="transDesc" placeholder="Description (ex: Plein de gasoil)">
                            <button id="addTransBtn" class="btn btn-success">Enregistrer</button>
                        </div>
                    </div>
                    <div class="card" style="flex: 1; min-width: 250px;">
                        <h3 style="margin-top: 0;">Flotte Automobile</h3>
                        <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 15px;"><input type="text" id="newVehicleName" placeholder="Nom / Marque (ex: Peugeot Boxer)" style="padding: 8px; border: 1px solid #ccc; border-radius: 4px;"><input type="text" id="newVehiclePlate" placeholder="Immatriculation" style="padding: 8px; border: 1px solid #ccc; border-radius: 4px;"><button id="addVehicleBtn" class="amt-btn amt-btn-primary">Ajouter Véhicule</button></div>
                        <ul id="vehiclesList" style="margin: 0; padding: 0; list-style: none;"></ul>
                    </div>
                </div>
                <div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                    <div class="history-controls" style="display: flex; gap: 10px; margin-bottom: 15px;"><input type="month" id="monthFilter" style="padding: 8px; border-radius: 4px; border: 1px solid #ccc;"><select id="filterVehicleSelect" style="padding: 8px; border-radius: 4px; border: 1px solid #ccc;"><option value="">Tous les véhicules</option></select></div>
                    <div style="overflow-x: auto;"><table class="table" style="margin-bottom: 0;"><thead><tr><th>Date</th><th>Véhicule</th><th>Type</th><th>Catégorie</th><th>Description</th><th>Montant</th><th>Actions</th></tr></thead><tbody id="fleetTableBody"><tr><td colspan="7" style="text-align:center;">Chargement...</td></tr></tbody></table></div>
                </div>
            </div>
        `;
        
        setTimeout(() => this.initLogic(), 50);
    },

    initLogic() {
        const currentUserName = sessionStorage.getItem('userName') || 'Inconnu';
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'abidjan';
        const userRole = sessionStorage.getItem('userRole');
        const isViewer = userRole === 'spectateur';
        const userPerms = JSON.parse(sessionStorage.getItem('userPermissions') || '[]');
        const canManageFleet = userRole === 'super_admin' || userRole === 'admin' || userRole === 'saisie_full' || userPerms.includes('manage_fleet');

        // DOM Elements - Formulaire Transaction
        const transDate = document.getElementById('transDate');
        const vehicleSelect = document.getElementById('vehicleSelect');
        const transType = document.getElementById('transType');
        const transCategory = document.getElementById('transCategory');
        const transAmount = document.getElementById('transAmount');
        const transDesc = document.getElementById('transDesc');
        const addTransBtn = document.getElementById('addTransBtn');

        // DOM Elements - Formulaire Véhicule
        const newVehicleName = document.getElementById('newVehicleName');
        const newVehiclePlate = document.getElementById('newVehiclePlate');
        const addVehicleBtn = document.getElementById('addVehicleBtn');
        const vehiclesList = document.getElementById('vehiclesList');

        // DOM Elements - Filtres & Table
        const monthFilter = document.getElementById('monthFilter');
        const filterVehicleSelect = document.getElementById('filterVehicleSelect');
        const fleetTableBody = document.getElementById('fleetTableBody');

        // DOM Elements - Stats
        const statIncome = document.getElementById('statIncome');
        const statExpense = document.getElementById('statExpense');
        const statProfit = document.getElementById('statProfit');

        let allVehicles = [];
        let allTransactions = [];
        let allExpenses = [];
        let combinedTransactions = [];

        // --- INJECTION DYNAMIQUE DE LA MODALE DE SUPPRESSION ---
        const deleteModalHTML = `
        <div id="vehicleDeleteModal" class="modal">
            <div class="modal-content" style="max-width: 400px; text-align: center; border-radius: 12px; padding: 25px;">
                <h3 style="margin-top: 0; color: #ef4444;">⚠️ Confirmation de suppression</h3>
                <p id="vehicleDeleteMessage" style="color: #475569; margin: 20px 0; font-size: 14px;"></p>
                <div style="display: flex; justify-content: center; gap: 15px; margin-top: 25px;">
                    <button id="cancelVehicleDeleteBtn" class="btn" style="background: #e2e8f0; color: #334155; border: none; padding: 8px 20px; border-radius: 6px; cursor: pointer; font-weight: bold;">Annuler</button>
                    <button id="confirmVehicleDeleteBtn" class="btn" style="background: #ef4444; color: white; border: none; padding: 8px 20px; border-radius: 6px; cursor: pointer; font-weight: bold;">Confirmer</button>
                </div>
            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', deleteModalHTML);

        const deleteModal = document.getElementById('vehicleDeleteModal');
        const deleteMessage = document.getElementById('vehicleDeleteMessage');
        const confirmDeleteBtn = document.getElementById('confirmVehicleDeleteBtn');
        const cancelDeleteBtn = document.getElementById('cancelVehicleDeleteBtn');

        let pendingDeleteId = null;
        let pendingDeleteType = null; // 'vehicle' ou 'transaction'

        function closeDeleteModal() {
            deleteModal.classList.remove('active');
            pendingDeleteId = null;
            pendingDeleteType = null;
        }

        cancelDeleteBtn.addEventListener('click', closeDeleteModal);
        window.addEventListener('click', (e) => {
            if (e.target == deleteModal) closeDeleteModal();
        });

        confirmDeleteBtn.addEventListener('click', async () => {
            if (!pendingDeleteId || !pendingDeleteType) return;
            
            try {
                if (pendingDeleteType === 'vehicle') {
                    await updateDoc(doc(db, "fleet_vehicles", pendingDeleteId), { isDeleted: true });
                } else if (pendingDeleteType === 'transaction') {
                    await updateDoc(doc(db, "fleet_transactions", pendingDeleteId), { isDeleted: true });
                } else if (pendingDeleteType === 'expense') {
                    await updateDoc(doc(db, getCollectionName("expenses"), pendingDeleteId), { isDeleted: true });
                }
            } catch (error) {
                AppModal.error("Erreur lors de la suppression : " + error.message);
            } finally {
                closeDeleteModal();
            }
        });

        // --- INITIALISATION FILTRE MOIS ---
        if (monthFilter) {
            const now = new Date();
            monthFilter.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        }

        // --- 1. GESTION DES VÉHICULES ---
        const qVehicles = query(collection(db, "fleet_vehicles"), where("isDeleted", "!=", true));
        onSnapshot(qVehicles, snap => {
            let list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            allVehicles = list.filter(d => (d.agency || 'abidjan') === activeAgency);
            updateVehicleSelects();
        });

        function updateVehicleSelects() {
            let options = '<option value="">-- Véhicule (Optionnel) --</option>';
            let filterOptions = '<option value="">Tous les véhicules</option>';
            
            allVehicles.forEach(v => {
                const label = `${v.name} (${v.plate})`;
                options += `<option value="${v.id}">${label}</option>`;
                filterOptions += `<option value="${v.id}">${label}</option>`;
            });

            if (vehicleSelect) vehicleSelect.innerHTML = options;
            if (filterVehicleSelect) filterVehicleSelect.innerHTML = filterOptions;
            
            // MAJ de la liste visible des véhicules
            if (vehiclesList) {
                vehiclesList.innerHTML = '';
                allVehicles.forEach(v => {
                    const li = document.createElement('li');
                    li.style.display = 'flex';
                    li.style.justifyContent = 'space-between';
                    li.style.alignItems = 'center';
                    li.style.padding = '8px 0';
                    li.style.borderBottom = '1px solid #e2e8f0';

                    let delBtn = '';
                    if (!isViewer && canManageFleet) {
                        delBtn = `<button class="deleteVehicleBtn" data-id="${v.id}" style="background: #ef4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px;" title="Supprimer">🗑️</button>`;
                    }
                    
                    li.innerHTML = `<span><strong>${v.name}</strong> <span style="color:#64748b;">(${v.plate})</span></span> ${delBtn}`;
                    vehiclesList.appendChild(li);
                });
            }
        }

        if (addVehicleBtn && canManageFleet) {
            addVehicleBtn.addEventListener('click', async () => {
                const name = newVehicleName.value.trim();
                const plate = newVehiclePlate.value.trim();
                if (!name || !plate) return AppModal.error("Veuillez saisir un nom et une immatriculation.");
                
                // Vérification des doublons (basé sur l'immatriculation, en ignorant les espaces et la casse)
                const normalizedPlate = plate.toLowerCase().replace(/\s+/g, '');
                const isDuplicate = allVehicles.some(v => v.plate.toLowerCase().replace(/\s+/g, '') === normalizedPlate);
                if (isDuplicate) {
                    return AppModal.error("Un véhicule avec cette immatriculation est déjà enregistré dans la flotte.", "Doublon");
                }

                try {
                    const newVehRef = doc(collection(db, "fleet_vehicles"));
                    await setDoc(newVehRef, {
                        name: name,
                        plate: plate,
                        createdAt: new Date().toISOString(),
                        createdBy: currentUserName,
                        isDeleted: false,
                        agency: activeAgency
                    });
                    newVehicleName.value = '';
                    newVehiclePlate.value = '';
                    AppModal.success("Véhicule ajouté !");
                } catch (error) {
                    AppModal.error("Erreur lors de l'ajout : " + error.message);
                }
            });
        } else if (addVehicleBtn) {
            addVehicleBtn.style.display = 'none';
        }

        // --- SUPPRESSION VÉHICULE ---
        if (vehiclesList) {
            vehiclesList.addEventListener('click', async (e) => {
                if (isViewer) return;
                const btn = e.target.closest('.deleteVehicleBtn');
                if (btn) {
                    const id = btn.getAttribute('data-id');
                    pendingDeleteId = id;
                    pendingDeleteType = 'vehicle';
                    deleteMessage.innerHTML = "Voulez-vous vraiment supprimer ce véhicule ?<br><br><small style='color:#64748b;'>(Ses opérations resteront dans l'historique mais il n'apparaîtra plus dans les choix)</small>";
                    deleteModal.classList.add('active');
                }
            });
        }

        // --- CHANGEMENT DE TYPE (Entrée vs Dépense) ---
        if (transType) {
            transType.addEventListener('change', () => {
                if (!transCategory) return;
                if (transType.value === 'Entrée') {
                    transCategory.innerHTML = `<option value="Location Fictive">Location Fictive (Facturation Trajet)</option>`;
                } else {
                    transCategory.innerHTML = `
                        <option value="Carburant">Carburant</option>
                        <option value="Entretien / Réparation">Entretien / Réparation</option>
                        <option value="Pièces de rechange">Pièces de rechange</option>
                        <option value="Assurance / Visite technique">Assurance / Visite technique</option>
                        <option value="Contravention / Amende">Contravention / Amende</option>
                        <option value="Autre Dépense">Autre Dépense</option>
                    `;
                }
            });
        }

        // --- 2. GESTION DES TRANSACTIONS ---
        if (addTransBtn && canManageFleet) {
            addTransBtn.addEventListener('click', async () => {
                const date = transDate.value;
                const vehicleId = vehicleSelect.value;
                const type = transType.value;
                const category = transCategory.value;
                const amount = parseFloat(transAmount.value) || 0;
                const desc = transDesc.value.trim();

                if (!date || !type || !category || amount <= 0) {
                    return AppModal.error("Veuillez remplir correctement la date, le type, la catégorie et le montant.");
                }

                const selectedVehicle = allVehicles.find(v => v.id === vehicleId);

                const data = {
                    date: date,
                    vehicleId: vehicleId,
                    vehicleName: selectedVehicle ? `${selectedVehicle.name} (${selectedVehicle.plate})` : 'Véhicule non spécifié',
                    type: type,
                    category: category,
                    amount: amount,
                    description: `${desc} (${currentUserName})`,
                    author: currentUserName,
                    timestamp: new Date().toISOString(),
                    isDeleted: false,
                    agency: activeAgency,
                    // Tag mode d'expedition : opération véhicule isolée Maritime/Aérien.
                    modeExpedition: sessionStorage.getItem('shippingMode') || 'maritime'
                };

                try {
                    const newTransRef = doc(collection(db, "fleet_transactions"));
                    await setDoc(newTransRef, data);
                    transAmount.value = '';
                    transDesc.value = '';
                    AppModal.success("Opération enregistrée !");
                } catch (error) {
                    AppModal.error("Erreur lors de l'ajout : " + error.message);
                }
            });
        } else if (addTransBtn) {
            addTransBtn.style.display = 'none';
        }

        // --- 3. AFFICHAGE ET ANALYSE ---
        const qTrans = query(collection(db, "fleet_transactions"), where("isDeleted", "!=", true), orderBy("isDeleted"), orderBy("date", "desc"));
        onSnapshot(qTrans, snap => {
            // Isolation Maritime/Aérien : les opérations véhicules suivent le
            // mode actif. Anciennes sans modeExpedition = maritime (legacy).
            const _mode = sessionStorage.getItem('shippingMode') || 'maritime';
            let list = snap.docs.map(doc => ({ id: doc.id, ...doc.data(), _source: 'fleet' }));
            allTransactions = list.filter(d => (d.agency || 'abidjan') === activeAgency
                && ((d.modeExpedition === 'aerien') ? 'aerien' : 'maritime') === _mode);
            mergeAndRenderTransactions();
        });

        // Écoute des Dépenses générales (Caisse)
        const qExp = query(collection(db, getCollectionName("expenses")), where("isDeleted", "!=", true));
        onSnapshot(qExp, snap => {
            allExpenses = [];
            snap.docs.forEach(docSnap => {
                const exp = docSnap.data();
                if ((exp.agency || 'abidjan') !== activeAgency) return;
                const desc = (exp.description || '');
                const lowerDesc = desc.toLowerCase();
                
                // Détection large : vehicleId présent OU mot-clé dans la description
                const isVehicleExp = exp.vehicleId || lowerDesc.includes('péage') || lowerDesc.includes('peage') || lowerDesc.includes('carburant') || lowerDesc.includes('essence') || lowerDesc.includes('gasoil') || lowerDesc.includes('entretien') || lowerDesc.includes('vidange') || lowerDesc.includes('réparation') || lowerDesc.includes('reparation');
                
                if (isVehicleExp) {
                    let cat = 'Autre Dépense';
                    if (lowerDesc.includes('carburant') || lowerDesc.includes('essence') || lowerDesc.includes('gasoil')) cat = 'Carburant';
                    else if (lowerDesc.includes('péage') || lowerDesc.includes('peage')) cat = 'Péage'; 
                    else if (lowerDesc.includes('entretien') || lowerDesc.includes('réparation') || lowerDesc.includes('reparation') || lowerDesc.includes('vidange')) cat = 'Entretien / Réparation';

                    allExpenses.push({
                        id: docSnap.id,
                        date: exp.date,
                        vehicleId: exp.vehicleId || '',
                        vehicleName: exp.vehicleName || 'Véhicule non spécifié',
                        type: 'Dépense',
                        category: cat,
                        amount: exp.montant,
                        description: desc + ' (Via Caisse)',
                        author: '',
                        isDeleted: exp.isDeleted,
                        _source: 'expenses'
                    });
                }
            });
            mergeAndRenderTransactions();
        });

        if (monthFilter) monthFilter.addEventListener('change', renderTableAndStats);
        if (filterVehicleSelect) filterVehicleSelect.addEventListener('change', renderTableAndStats);

        function mergeAndRenderTransactions() {
            combinedTransactions = [...allTransactions, ...allExpenses];
            combinedTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));
            renderTableAndStats();
        }

        function renderTableAndStats() {
            const month = monthFilter ? monthFilter.value : '';
            const vehicleFilter = filterVehicleSelect ? filterVehicleSelect.value : '';

            let totalIncome = 0;
            let totalExpense = 0;

            const filtered = combinedTransactions.filter(t => {
                if (month && !t.date.startsWith(month)) return false;
                if (vehicleFilter && t.vehicleId !== vehicleFilter) return false;
                return true;
            });

            if (fleetTableBody) fleetTableBody.innerHTML = '';

            if (filtered.length === 0) {
                if (fleetTableBody) fleetTableBody.innerHTML = '<tr><td colspan="7">Aucune opération trouvée.</td></tr>';
            } else {
                filtered.forEach(t => {
                    if (t.type === 'Entrée') totalIncome += t.amount;
                    else totalExpense += t.amount;

                    const row = document.createElement('tr');
                    const typeClass = t.type === 'Entrée' ? 'reste-positif' : 'reste-negatif';
                    const sign = t.type === 'Entrée' ? '+' : '-';

                    let delBtn = '';
                    if (!isViewer) {
                        if (t._source === 'expenses') {
                            if (userRole === 'admin' || userRole === 'super_admin') {
                                delBtn = `<button class="deleteBtn" data-id="${t.id}" data-source="expenses" style="padding: 4px 8px; font-size:12px; background:#f59e0b; border:none; color:white; border-radius:4px; cursor:pointer;" title="Supprimer de la Caisse">🗑️ Caisse</button>`;
                            }
                        } else {
                            if (canManageFleet) {
                                delBtn = `<button class="deleteBtn" data-id="${t.id}" data-source="fleet" style="padding: 4px 8px; font-size:12px;">Suppr.</button>`;
                            }
                        }
                    }

                    row.innerHTML = `
                        <td>${t.date}</td>
                        <td><b>${t.vehicleName}</b></td>
                        <td><span class="tag" style="background:${t.type === 'Entrée' ? '#d1fae5' : '#fee2e2'}; color:${t.type === 'Entrée' ? '#065f46' : '#991b1b'}">${t.type}</span></td>
                        <td>${t.category}</td>
                        <td>${t.description}</td>
                        <td class="${typeClass}"><b>${sign} ${formatCFA(t.amount)}</b></td>
                        <td>${delBtn}</td>
                    `;
                    if (fleetTableBody) fleetTableBody.appendChild(row);
                });
            }

            // MAJ Stats
            const profit = totalIncome - totalExpense;
            if (statIncome) statIncome.textContent = formatCFA(totalIncome);
            if (statExpense) statExpense.textContent = formatCFA(totalExpense);
            if (statProfit) {
                statProfit.textContent = formatCFA(profit);
                const card = statProfit.closest('.total-card');
                if (card) {
                    if (profit > 0) card.className = "total-card card-positif";
                    else if (profit < 0) card.className = "total-card card-negatif";
                    else card.className = "total-card";
                }
            }
        }

        // Suppression Transaction
        if (fleetTableBody) {
            fleetTableBody.addEventListener('click', async (e) => {
                if (isViewer) return;
                if (e.target.classList.contains('deleteBtn')) {
                    const id = e.target.getAttribute('data-id');
                    const source = e.target.getAttribute('data-source');
                    
                    if (source === 'expenses' && userRole !== 'admin' && userRole !== 'super_admin') {
                        AppModal.error("Accès refusé : Seuls les administrateurs peuvent supprimer cette opération provenant de la Caisse.", "Action non autorisée");
                        return;
                    }
                    
                    pendingDeleteId = id;
                    pendingDeleteType = source === 'expenses' ? 'expense' : 'transaction';
                    deleteMessage.innerHTML = source === 'expenses' ? "Voulez-vous vraiment supprimer cette dépense ? (Elle sera aussi supprimée de la Caisse Générale)" : "Voulez-vous vraiment supprimer cette opération de l'historique ?";
                    deleteModal.classList.add('active');
                }
            });
        }

        if (typeof initBackToTopButton === 'function') initBackToTopButton();
        if (typeof formatCFA !== 'function') {
            window.formatCFA = (n) => formatMoney(n, true);
        }
    }
};