import { db } from './firebase-config.js';
import { collection, doc, addDoc, updateDoc, query, where, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {

    const currentUserName = sessionStorage.getItem('userName') || 'Inconnu';
    const userRole = sessionStorage.getItem('userRole');
    const isViewer = userRole === 'spectateur';

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
                await updateDoc(doc(db, "expenses", pendingDeleteId), { isDeleted: true });
            }
        } catch (error) {
            alert("Erreur lors de la suppression : " + error.message);
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
        allVehicles = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
                if (!isViewer && (userRole === 'admin' || userRole === 'super_admin' || userRole === 'saisie_full')) {
                    delBtn = `<button class="deleteVehicleBtn" data-id="${v.id}" style="background: #ef4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px;" title="Supprimer">🗑️</button>`;
                }
                
                li.innerHTML = `<span><strong>${v.name}</strong> <span style="color:#64748b;">(${v.plate})</span></span> ${delBtn}`;
                vehiclesList.appendChild(li);
            });
        }
    }

    if (addVehicleBtn && (userRole === 'admin' || userRole === 'super_admin')) {
        addVehicleBtn.addEventListener('click', async () => {
            const name = newVehicleName.value.trim();
            const plate = newVehiclePlate.value.trim();
            if (!name || !plate) return alert("Veuillez saisir un nom et une immatriculation.");
            
            // Vérification des doublons (basé sur l'immatriculation, en ignorant les espaces et la casse)
            const normalizedPlate = plate.toLowerCase().replace(/\s+/g, '');
            const isDuplicate = allVehicles.some(v => v.plate.toLowerCase().replace(/\s+/g, '') === normalizedPlate);
            if (isDuplicate) {
                return alert("⚠️ Un véhicule avec cette immatriculation est déjà enregistré dans la flotte.");
            }

            try {
                await addDoc(collection(db, "fleet_vehicles"), {
                    name: name,
                    plate: plate,
                    createdAt: new Date().toISOString(),
                    createdBy: currentUserName,
                    isDeleted: false
                });
                newVehicleName.value = '';
                newVehiclePlate.value = '';
                alert("Véhicule ajouté !");
            } catch (error) {
                alert("Erreur lors de l'ajout : " + error.message);
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
    if (addTransBtn && (userRole === 'admin' || userRole === 'super_admin' || userRole === 'saisie_full')) {
        addTransBtn.addEventListener('click', async () => {
            const date = transDate.value;
            const vehicleId = vehicleSelect.value;
            const type = transType.value;
            const category = transCategory.value;
            const amount = parseFloat(transAmount.value) || 0;
            const desc = transDesc.value.trim();

            if (!date || !type || !category || amount <= 0) {
                return alert("Veuillez remplir correctement la date, le type, la catégorie et le montant.");
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
                isDeleted: false
            };

            try {
                await addDoc(collection(db, "fleet_transactions"), data);
                transAmount.value = '';
                transDesc.value = '';
                alert("Opération enregistrée !");
            } catch (error) {
                alert("Erreur lors de l'ajout : " + error.message);
            }
        });
    } else if (addTransBtn) {
        addTransBtn.style.display = 'none';
    }

    // --- 3. AFFICHAGE ET ANALYSE ---
    const qTrans = query(collection(db, "fleet_transactions"), where("isDeleted", "!=", true), orderBy("isDeleted"), orderBy("date", "desc"));
    onSnapshot(qTrans, snap => {
        allTransactions = snap.docs.map(doc => ({ id: doc.id, ...doc.data(), _source: 'fleet' }));
        mergeAndRenderTransactions();
    });

    // Écoute des Dépenses générales (Caisse)
    const qExp = query(collection(db, "expenses"), where("isDeleted", "!=", true));
    onSnapshot(qExp, snap => {
        allExpenses = [];
        snap.docs.forEach(docSnap => {
            const exp = docSnap.data();
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
                if (!isViewer && (userRole === 'admin' || userRole === 'super_admin' || userRole === 'saisie_full')) {
                    if (t._source === 'expenses') {
                        delBtn = `<button class="deleteBtn" data-id="${t.id}" data-source="expenses" style="padding: 4px 8px; font-size:12px; background:#f59e0b; border:none; color:white; border-radius:4px; cursor:pointer;" title="Supprimer de la Caisse">🗑️ Caisse</button>`;
                    } else {
                        delBtn = `<button class="deleteBtn" data-id="${t.id}" data-source="fleet" style="padding: 4px 8px; font-size:12px;">Suppr.</button>`;
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
                pendingDeleteId = id;
                pendingDeleteType = source === 'expenses' ? 'expense' : 'transaction';
                deleteMessage.innerHTML = source === 'expenses' ? "Voulez-vous vraiment supprimer cette dépense ? (Elle sera aussi supprimée de la Caisse Générale)" : "Voulez-vous vraiment supprimer cette opération de l'historique ?";
                deleteModal.classList.add('active');
            }
        });
    }

    if (typeof initBackToTopButton === 'function') initBackToTopButton();
    if (typeof formatCFA !== 'function') {
        window.formatCFA = (n) => new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(n || 0);
    }
});