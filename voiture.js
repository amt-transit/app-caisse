document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: La connexion à la base de données a échoué."); return;
    }

    const currentUserName = sessionStorage.getItem('userName') || 'Inconnu';
    const userRole = sessionStorage.getItem('userRole');
    const isViewer = userRole === 'spectateur';

    // Nouvelles collections indépendantes
    const fleetTransactionsCollection = db.collection("fleet_transactions");
    const fleetVehiclesCollection = db.collection("fleet_vehicles");

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

    // --- INITIALISATION FILTRE MOIS ---
    if (monthFilter) {
        const now = new Date();
        monthFilter.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    // --- 1. GESTION DES VÉHICULES ---
    fleetVehiclesCollection.where("isDeleted", "!=", true).onSnapshot(snap => {
        allVehicles = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateVehicleSelects();
    });

    function updateVehicleSelects() {
        let options = '<option value="">-- Sélectionner un véhicule --</option>';
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
                if (!isViewer && (userRole === 'admin' || userRole === 'super_admin')) {
                    delBtn = `<button class="deleteVehicleBtn" data-id="${v.id}" style="background: #ef4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px;" title="Supprimer">🗑️</button>`;
                }
                
                li.innerHTML = `<span><strong>${v.name}</strong> <span style="color:#64748b;">(${v.plate})</span></span> ${delBtn}`;
                vehiclesList.appendChild(li);
            });
        }
    }

    if (addVehicleBtn && !isViewer) {
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
                await fleetVehiclesCollection.add({
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
                if (confirm("Voulez-vous vraiment supprimer ce véhicule ?\n(Ses opérations resteront dans l'historique mais il n'apparaîtra plus dans les choix)")) {
                    try {
                        await fleetVehiclesCollection.doc(id).update({ isDeleted: true });
                    } catch (error) {
                        alert("Erreur lors de la suppression : " + error.message);
                    }
                }
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
    if (addTransBtn && !isViewer) {
        addTransBtn.addEventListener('click', async () => {
            const date = transDate.value;
            const vehicleId = vehicleSelect.value;
            const type = transType.value;
            const category = transCategory.value;
            const amount = parseFloat(transAmount.value) || 0;
            const desc = transDesc.value.trim();

            if (!date || !vehicleId || !type || !category || amount <= 0) {
                return alert("Veuillez remplir correctement tous les champs obligatoires.");
            }

            const selectedVehicle = allVehicles.find(v => v.id === vehicleId);

            const data = {
                date: date,
                vehicleId: vehicleId,
                vehicleName: `${selectedVehicle.name} (${selectedVehicle.plate})`,
                type: type,
                category: category,
                amount: amount,
                description: `${desc} (${currentUserName})`,
                author: currentUserName,
                timestamp: new Date().toISOString(),
                isDeleted: false
            };

            try {
                await fleetTransactionsCollection.add(data);
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
    fleetTransactionsCollection.where("isDeleted", "!=", true).orderBy("isDeleted").orderBy("date", "desc").onSnapshot(snap => {
        allTransactions = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderTableAndStats();
    });

    if (monthFilter) monthFilter.addEventListener('change', renderTableAndStats);
    if (filterVehicleSelect) filterVehicleSelect.addEventListener('change', renderTableAndStats);

    function renderTableAndStats() {
        const month = monthFilter ? monthFilter.value : '';
        const vehicleFilter = filterVehicleSelect ? filterVehicleSelect.value : '';

        let totalIncome = 0;
        let totalExpense = 0;

        const filtered = allTransactions.filter(t => {
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
                if (!isViewer && (userRole === 'admin' || userRole === 'super_admin')) {
                    delBtn = `<button class="deleteBtn" data-id="${t.id}" style="padding: 4px 8px; font-size:12px;">Suppr.</button>`;
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
                if (confirm("Supprimer cette opération ?")) {
                    await fleetTransactionsCollection.doc(id).update({ isDeleted: true });
                }
            }
        });
    }

    if (typeof initBackToTopButton === 'function') initBackToTopButton();
    if (typeof formatCFA !== 'function') {
        window.formatCFA = (n) => new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(n || 0);
    }
});