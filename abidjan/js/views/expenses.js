import { db } from '../../../firebase-config.js';
import { collection, doc, updateDoc, setDoc, query, where, orderBy, onSnapshot, writeBatch, limit, getDocs } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const ExpensesView = {
    render(app, container) {
        this.app = app;
        container.innerHTML = `
            <div id="caisseForm">
                <div class="form-grid">
                    <input type="date" id="expenseDate" required>
                    <select id="actionType" style="font-weight: bold; color: #1565c0;">
                        <option value="Depense">🔴 Enregistrer une Dépense</option>
                    </select>
                    <input type="text" id="expenseDesc" placeholder="Description (ex: Facture CIE...)" required>
                    <div class="prix-container">
                        <input type="number" id="expenseAmount" placeholder="Montant">
                        <span class="cfa-label">CFA</span>
                    </div>
                    <select id="expenseMode">
                        <option value="Espèce" selected>Espèce</option>
                        <option value="Chèque">Chèque</option>
                        <option value="OM">Orange Money</option>
                        <option value="Wave">Wave</option>
                        <option value="Virement">Virement</option>
                    </select>
                    <select id="expenseType">
                        <option value="Mensuelle">Dépense Mensuelle</option>
                        <option value="Conteneur">Dépense de Conteneur</option>
                    </select>
                    <select id="expenseSubtype" style="display:none;">
                        <option value="">-- Catégorie (Optionnel) --</option>
                        <option value="Dépenses Livraison">Dépenses Livraison</option>
                        <option value="Dépenses Péage">Dépenses Péage</option>
                        <option value="Dépenses Carburant">Dépenses Carburant</option>
                        <option value="Dépenses Personnel">Dépenses Personnel</option>
                        <option value="Dépenses Entretien Véhicules">Dépenses Entretien Véhicules</option>
                    </select>
                    <select id="expenseVehicle" style="display:none;">
                        <option value="">-- Véhicule (Optionnel) --</option>
                    </select>
                    <input type="text" id="expenseContainer" placeholder="Nom du Conteneur (ex: D35)" style="display:none;" list="containersList">
                    <datalist id="containersList"></datalist>
                </div>
                <div class="card" id="pendingExpensesCard" style="display: none; border-left: 4px solid #3b82f6;">
                    <h3 style="color: #3b82f6;"><i class="fa-solid fa-clock-rotate-left"></i> Dépenses en attente d'enregistrement</h3>
                    <table class="table">
                        <thead>
                            <tr><th>Date</th><th>Description</th><th>Montant</th><th>Type</th><th>Action</th></tr>
                        </thead>
                        <tbody id="pendingExpensesBody"></tbody>
                    </table>
                    <button id="commitExpensesBtn" class="btn btn-success" style="margin-top: 10px; width: 100%; padding: 10px; font-size: 1.1em;">
                        <i class="fa-solid fa-save"></i> Tout Enregistrer
                    </button>
                </div>
                <div class="form-buttons">
                    <button id="addExpenseBtn" class="primary">Valider</button>
                </div>
            </div>

            <div class="sub-nav" style="justify-content: center; margin-top: 20px; margin-bottom: 10px;">
                <a href="#" id="tabMonthly" class="active">Dépenses Mensuelles</a>
                <a href="#" id="tabContainer">Dépenses Conteneurs</a>
                <a href="#" id="tabTotals">Totaux & Statistiques</a>
            </div>

            <div id="listView">
                <div class="history-controls">
                    <div class="search-bar-container">
                        <input type="text" id="expenseSearch" placeholder="Rechercher dans les dépenses..." style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px;">
                    </div>
                    <div class="checkbox-container" style="margin-top: 10px;">
                        <input type="checkbox" id="showDeletedCheckbox" style="width: auto;">
                        <label for="showDeletedCheckbox">Afficher les éléments supprimés</label>
                    </div>
                </div>
                <h2 id="expensesHistoryTitle">Historique des Opérations</h2>
                <table id="expenseTable">
                    <thead>
                        <tr><th>Date</th><th>Description</th><th>Montant</th><th>Type</th><th>Mode</th><th>Conteneur</th><th>Action</th></tr>
                    </thead>
                    <tbody id="expenseTableBody"></tbody>
                </table>
            </div>

            <div id="totalsView" style="display:none; margin-top: 20px;">
                <div class="filter-container" style="margin-bottom: 20px; background: white; padding: 15px; border-radius: 12px; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);">
                    <h4 style="margin-top:0; margin-bottom:10px; color:#64748b;">Filtrer les statistiques par période</h4>
                    <div class="filter-fields">
                        <label>Du :</label> <input type="date" id="totalStartDate">
                        <label>Au :</label> <input type="date" id="totalEndDate">
                        <button id="filterTotalsBtn" class="primary" style="padding: 6px 12px; font-size: 12px;">Appliquer</button>
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
                    <div style="background: white; padding: 15px; border-radius: 12px; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);">
                        <h3 style="margin-top:0; border-bottom:1px solid #eee; padding-bottom:10px;">Dépenses par Mois</h3>
                        <table class="table">
                            <thead><tr><th>Mois</th><th style="text-align:right">Total</th></tr></thead>
                            <tbody id="totalsMonthBody"></tbody>
                        </table>
                    </div>
                    <div style="background: white; padding: 15px; border-radius: 12px; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);">
                        <h3 style="margin-top:0; border-bottom:1px solid #eee; padding-bottom:10px;">Dépenses par Conteneur</h3>
                        <table class="table">
                            <thead><tr><th>Conteneur</th><th style="text-align:right">Total</th></tr></thead>
                            <tbody id="totalsContainerBody"></tbody>
                        </table>
                    </div>
                    <div style="background: white; padding: 15px; border-radius: 12px; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);">
                        <h3 style="margin-top:0; border-bottom:1px solid #eee; padding-bottom:10px;">Par Catégorie Spéciale</h3>
                        <table class="table">
                            <thead><tr><th>Catégorie</th><th style="text-align:right">Total</th></tr></thead>
                            <tbody id="totalsCategoryBody"></tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div id="expenseDetailsModal" class="modal">
                <div class="modal-content" style="max-width: 800px;">
                    <span class="close-modal" id="closeExpenseDetailsModal" style="float:right; cursor:pointer; font-size:24px;">&times;</span>
                    <h2 id="expenseDetailsTitle" style="margin-top:0;">Détails</h2>
                    <div style="max-height: 60vh; overflow-y: auto;">
                        <table class="table">
                            <thead><tr><th>Date</th><th>Description</th><th>Type</th><th>Mode</th><th>Montant</th></tr></thead>
                            <tbody id="expenseDetailsBody"></tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
        this.initLogic();
    },

    initLogic() {
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'abidjan';
        const userRole = sessionStorage.getItem('userRole');
        const isViewer = userRole === 'spectateur';

        function formatCFA(n) { return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(n || 0).replace(/[\u202F\u00A0]/g, ' ').replace(/\s*\/\s*/g, ' '); }
        
        const addExpenseBtn = document.getElementById('addExpenseBtn');
        const expenseDate = document.getElementById('expenseDate');
        const expenseDesc = document.getElementById('expenseDesc');
        const expenseAmount = document.getElementById('expenseAmount');
        const expenseType = document.getElementById('expenseType');
        const expenseSubtype = document.getElementById('expenseSubtype');
        const expenseVehicle = document.getElementById('expenseVehicle');
        const expenseMode = document.getElementById('expenseMode'); 
        const expenseContainer = document.getElementById('expenseContainer');
        const actionType = document.getElementById('actionType');
        
        // --- TOGGLE AFFICHAGE SELON LE TYPE DE DÉPENSE ---
        if (expenseType) {
            expenseType.addEventListener('change', () => {
                if (expenseType.value === 'Conteneur') {
                    if (expenseContainer) expenseContainer.style.display = '';
                    if (expenseSubtype) expenseSubtype.style.display = 'none';
                    if (expenseVehicle) expenseVehicle.style.display = 'none';
                } else {
                    if (expenseContainer) expenseContainer.style.display = 'none';
                    if (expenseSubtype) expenseSubtype.style.display = '';
                    if (expenseVehicle) expenseVehicle.style.display = '';
                }
            });
            // Déclenchement initial
            expenseType.dispatchEvent(new Event('change'));
        }
        
        // --- CHARGEMENT INTELLIGENT DES CONTENEURS ---
        getDocs(query(collection(db, "containers"), where("agency", "==", activeAgency))).then(snap => {
            const containersList = document.getElementById('containersList');
            if (containersList) {
                containersList.innerHTML = '';
                snap.forEach(doc => {
                    const opt = document.createElement('option');
                    opt.value = doc.data().number || doc.id;
                    containersList.appendChild(opt);
                });
            }
        }).catch(e => console.error("Erreur chargement conteneurs:", e));

        const expenseTableBody = document.getElementById('expenseTableBody');
        const showDeletedCheckbox = document.getElementById('showDeletedCheckbox');
        const expenseSearchInput = document.getElementById('expenseSearch');

        let sortExpenseContainerCheckbox = document.getElementById('sortExpenseContainerCheckbox');
        if (!sortExpenseContainerCheckbox && showDeletedCheckbox && showDeletedCheckbox.parentNode) {
            const span = document.createElement('span');
            span.style.marginLeft = "15px";
            span.innerHTML = '<input type="checkbox" id="sortExpenseContainerCheckbox" style="width:auto; vertical-align:middle;"> <label for="sortExpenseContainerCheckbox" style="cursor:pointer; font-size:12px;">Tri par Conteneur</label>';
            showDeletedCheckbox.parentNode.appendChild(span);
            sortExpenseContainerCheckbox = document.getElementById('sortExpenseContainerCheckbox');
            sortExpenseContainerCheckbox.addEventListener('change', () => renderExpensesTable());
        }

        let expenseStatsContainer = document.getElementById('expenseStatsContainer');
        const tableContainer = document.querySelector('#listView table');
        if (tableContainer && tableContainer.parentNode) {
            let expenseStatsControls = document.getElementById('expenseStatsControls');
            if (!expenseStatsControls) {
                expenseStatsControls = document.createElement('div');
                expenseStatsControls.id = 'expenseStatsControls';
                expenseStatsControls.style.cssText = "margin-bottom: 10px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;";
                const now = new Date();
                const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                expenseStatsControls.innerHTML = `
                    <div style="display:flex; align-items:center; gap:5px; background:#fff; padding:5px 10px; border:1px solid #e2e8f0; border-radius:8px; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
                        <span style="font-size:0.9em; font-weight:600; color:#64748b;">📅 Période :</span>
                        <input type="month" id="expenseStatsMonthFilter" value="${defaultMonth}" style="border:none; outline:none; font-family:inherit; color:#334155; background:transparent; cursor:pointer;">
                        <button id="clearExpenseStatsFilter" title="Tout voir" style="margin-left:5px; border:none; background:#f1f5f9; color:#64748b; border-radius:4px; padding:2px 6px; cursor:pointer; font-size:0.8em;">✖</button>
                    </div>
                `;
                tableContainer.parentNode.insertBefore(expenseStatsControls, tableContainer);
                setTimeout(() => {
                    const monthInput = document.getElementById('expenseStatsMonthFilter');
                    const clearBtn = document.getElementById('clearExpenseStatsFilter');
                    if (monthInput) monthInput.addEventListener('change', () => renderExpensesTable());
                    if (clearBtn) clearBtn.addEventListener('click', () => { if(monthInput) monthInput.value = ''; renderExpensesTable(); });
                }, 0);
            }
            if (!expenseStatsContainer) {
                expenseStatsContainer = document.createElement('div');
                expenseStatsContainer.id = 'expenseStatsContainer';
                expenseStatsContainer.style.cssText = "display:flex; gap:15px; margin-bottom:15px; flex-wrap:wrap;";
                tableContainer.parentNode.insertBefore(expenseStatsContainer, tableContainer);
            }
        }

        function getExpenseCategory(desc) {
            desc = (desc || '').toLowerCase();
            const kwPeage = ['péage', 'peage'];
            const kwCarburant = ['carburant', 'essence', 'gasoil'];
            const kwLivraison = ['livraison', 'police', 'douane', 'gendarmerie', 'gendarme', 'achat', 'lavage', 'aide', 'frais', 'transp', 'founi', 'stock'];
            const kwPersonnel = ['personnel'];
            const kwEntretien = ['entretien', 'vidange', 'pneu', 'mecanicien', 'mécano', 'reparation', 'réparation', 'visite technique'];

            if (kwPersonnel.some(k => desc.includes(k))) return 'Personnel';
            if (kwEntretien.some(k => desc.includes(k))) return 'Entretien Véhicules';
            if (kwPeage.some(k => desc.includes(k))) return 'Péage';
            if (kwCarburant.some(k => desc.includes(k))) return 'Carburant';
            if (kwLivraison.some(k => desc.includes(k))) return 'Livraison';
            return 'Autres';
        }

        let currentCategoryFilter = null;
        window.filterExpensesByCategory = (category) => {
            currentCategoryFilter = currentCategoryFilter === category ? null : category;
            renderExpensesTable();
        };

        function updateExpenseCategoryStats() {
            if (!expenseStatsContainer) return;
            if (currentTab === 'totals' || currentTab === 'container') {
                expenseStatsContainer.style.display = 'none';
                return;
            }
            expenseStatsContainer.style.display = 'flex';

            const stats = { 'Livraison': 0, 'Péage': 0, 'Carburant': 0, 'Personnel': 0, 'Entretien Véhicules': 0, 'Autres': 0 };
            let totalView = 0;
            const monthFilter = document.getElementById('expenseStatsMonthFilter')?.value;

            allExpenses.forEach(e => {
                if (e.isDeleted) return;
                if (e.sessionId && unconfirmedSessions.has(e.sessionId)) return;
                if (monthFilter && !e.date.startsWith(monthFilter)) return;
                if (currentTab === 'monthly' && (e.type === 'Conteneur' || e.conteneur)) return;
                if (currentTab === 'container' && !(e.type === 'Conteneur' || e.conteneur)) return;
                
                const amount = e.montant || 0;
                totalView += amount;
                const cat = getExpenseCategory(e.description);
                if (stats[cat] !== undefined) stats[cat] += amount;
            });

            const colors = { 
                'Livraison': { bg: '#e0f2fe', text: '#0369a1' }, 'Péage': { bg: '#fef3c7', text: '#b45309' }, 
                'Carburant': { bg: '#fee2e2', text: '#b91c1c' }, 'Personnel': { bg: '#e0e7ff', text: '#3730a3' }, 
                'Entretien Véhicules': { bg: '#d1fae5', text: '#065f46' }, 'Autres': { bg: '#e2e8f0', text: '#475569' } 
            };
            
            let html = `<div onclick="window.filterExpensesByCategory(null)" style="cursor:pointer; opacity:${currentCategoryFilter ? '0.5' : '1'}; background:#10b981; color:white; border-radius:8px; padding:10px 15px; min-width:140px; box-shadow:0 4px 6px rgba(0,0,0,0.1);"><div style="font-size:0.8em; text-transform:uppercase;">Total Mensuel</div><div style="font-size:1.4em; font-weight:bold;">${formatCFA(totalView)}</div></div>`;
            html += Object.entries(stats).map(([key, val]) => {
                const isActive = currentCategoryFilter === key;
                return `<div onclick="window.filterExpensesByCategory('${key}')" style="cursor:pointer; transform:${isActive ? 'scale(1.05)' : 'scale(1)'}; background:${colors[key].bg}; border:${isActive ? '2px solid #000' : `1px solid ${colors[key].bg}`}; border-radius:8px; padding:10px 15px; min-width:140px; box-shadow:0 1px 2px rgba(0,0,0,0.05);"><div style="font-size:0.8em; color:${colors[key].text}; text-transform:uppercase;">${key}</div><div style="font-size:1.2em; font-weight:bold; color:${colors[key].text};">${formatCFA(val)}</div></div>`;
            }).join('');
            expenseStatsContainer.innerHTML = html;
        }

        let allExpenses = [];
        let unconfirmedSessions = new Set(); 
        let pendingExpenses = []; 
        let currentLimit = 50; 
        let fleetVehicles = [];
        let currentTab = 'monthly'; 

        const tabMonthly = document.getElementById('tabMonthly');
        const tabContainer = document.getElementById('tabContainer');
        const tabTotals = document.getElementById('tabTotals');
        const listView = document.getElementById('listView');
        const totalsView = document.getElementById('totalsView');

        [tabMonthly, tabContainer, tabTotals].forEach(tab => {
            if(tab) tab.addEventListener('click', (e) => {
                e.preventDefault();
                currentTab = tab.id === 'tabMonthly' ? 'monthly' : (tab.id === 'tabContainer' ? 'container' : 'totals');
                [tabMonthly, tabContainer, tabTotals].forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                if(listView) listView.style.display = currentTab === 'totals' ? 'none' : 'block';
                if(totalsView) totalsView.style.display = currentTab === 'totals' ? 'block' : 'none';
                renderExpensesTable();
            });
        });

        // Nettoyage des écouteurs précédents
        if (window.unsubExpVehicles) window.unsubExpVehicles();
        if (window.unsubExpAudit) window.unsubExpAudit();
        if (window.unsubExpMain) window.unsubExpMain();

        window.unsubExpVehicles = onSnapshot(query(collection(db, "fleet_vehicles"), where("isDeleted", "!=", true)), snap => {
            fleetVehicles = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            let options = '<option value="">-- Véhicule (Optionnel) --</option>' + fleetVehicles.map(v => `<option value="${v.id}">${v.name} (${v.plate})</option>`).join('');
            if (expenseVehicle) expenseVehicle.innerHTML = options;
            const eev = document.getElementById('expenseEditVehicle');
            if (eev) { const currentVal = eev.value; eev.innerHTML = options; eev.value = currentVal; }
        });

        window.unsubExpAudit = onSnapshot(query(collection(db, "audit_logs"), where("action", "==", "VALIDATION_JOURNEE"), where("agency", "==", activeAgency)), snapshot => {
            unconfirmedSessions.clear();
            snapshot.forEach(doc => { if (doc.data().status !== "VALIDATED") unconfirmedSessions.add(doc.id); });
            if (allExpenses.length > 0) renderExpensesTable();
        });

        function fetchExpenses() {
            let constraints = [];
            if (showDeletedCheckbox && showDeletedCheckbox.checked) constraints.push(where("isDeleted", "==", true));
            else constraints.push(where("isDeleted", "!=", true));
            constraints.push(where("agency", "==", activeAgency), orderBy("isDeleted"), orderBy("date", "desc"), limit(currentLimit));
            
            if (window.unsubExpMain) window.unsubExpMain();
            window.unsubExpMain = onSnapshot(query(collection(db, "expenses"), ...constraints), snapshot => {
                allExpenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                renderExpensesTable();
            });
        }

        function renderExpensesTable() {
            updateExpenseCategoryStats();
            if (currentTab === 'totals') return renderTotals();

            const term = expenseSearchInput ? expenseSearchInput.value.toLowerCase().trim() : "";
            const monthFilter = document.getElementById('expenseStatsMonthFilter')?.value;
            
            let filtered = allExpenses.filter(e => !e.sessionId || !unconfirmedSessions.has(e.sessionId));
            filtered = filtered.filter(item => currentTab === 'monthly' ? (item.type !== 'Conteneur' && !item.conteneur) : (item.type === 'Conteneur' || item.conteneur));
            
            filtered = filtered.filter(item => {
                if (monthFilter && !item.date.startsWith(monthFilter)) return false;
                if (currentCategoryFilter && getExpenseCategory(item.description) !== currentCategoryFilter) return false;
                if (!term) return true;
                return (item.description || "").toLowerCase().includes(term) || (item.conteneur || "").toLowerCase().includes(term) || (item.montant || 0).toString().includes(term);
            });

            filtered.sort((a, b) => {
                if (currentTab === 'container' && sortExpenseContainerCheckbox && sortExpenseContainerCheckbox.checked) {
                    const cA = parseInt((a.conteneur || "").match(/\d+/) || 0, 10);
                    const cB = parseInt((b.conteneur || "").match(/\d+/) || 0, 10);
                    if (cB !== cA) return cB - cA;
                }
                return new Date(b.date) - new Date(a.date);
            });

            expenseTableBody.innerHTML = filtered.length === 0 ? '<tr><td colspan="7">Aucun résultat.</td></tr>' : filtered.map(expense => `
                <tr class="${expense.isDeleted ? 'deleted-row' : ''}">
                    <td>${expense.date}</td><td>${expense.description}</td><td class="reste-negatif"><b>- ${formatCFA(expense.montant)}</b></td>
                    <td>${expense.type}</td><td>${expense.mode || 'Espèce'}</td><td>${expense.conteneur || '-'}</td>
                    <td>${(userRole === 'admin' || userRole === 'super_admin') && !expense.isDeleted && !isViewer ? `<button class="editBtn" data-id="${expense.id}">Modif.</button> <button class="deleteBtn" data-id="${expense.id}">Suppr.</button>` : ''}</td>
                </tr>
            `).join('');
            
            if (filtered.length >= currentLimit) {
                expenseTableBody.innerHTML += `<tr><td colspan="7" style="text-align: center;"><button id="loadMoreExpBtn" class="btn">⬇️ Charger plus de résultats</button></td></tr>`;
                document.getElementById('loadMoreExpBtn').addEventListener('click', () => { currentLimit += 50; fetchExpenses(); });
            }
        }

        function renderTotals() {
            // Logique de rendu de la vue "Totaux" identique (condensée pour l'espace)
            const totalsMonthBody = document.getElementById('totalsMonthBody');
            const totalsContainerBody = document.getElementById('totalsContainerBody');
            const totalsCategoryBody = document.getElementById('totalsCategoryBody');
            const months = {}, containers = {}, categories = { 'Dépenses Livraison': 0, 'Dépenses Péage': 0, 'Dépenses Carburant': 0, 'Dépenses Personnel': 0, 'Dépenses Entretien Véhicules': 0, 'Autres': 0 };
            const start = document.getElementById('totalStartDate')?.value, end = document.getElementById('totalEndDate')?.value;

            allExpenses.forEach(e => {
                if (e.isDeleted || (e.sessionId && unconfirmedSessions.has(e.sessionId))) return;
                if (start && e.date < start) return; if (end && e.date > end) return;
                
                if (e.type === 'Mensuelle') { const m = e.date.substring(0, 7); months[m] = (months[m] || 0) + e.montant; }
                if (e.type === 'Conteneur' || e.conteneur) { const c = (e.conteneur || 'Inconnu').trim().toUpperCase(); containers[c] = (containers[c] || 0) + e.montant; }
                
                if (e.type === 'Mensuelle') {
                    let matched = false; const desc = (e.description || '').toLowerCase();
                    ['Dépenses Livraison', 'Dépenses Péage', 'Dépenses Carburant', 'Dépenses Personnel', 'Dépenses Entretien Véhicules'].forEach(cat => {
                        if ((e.description || '').startsWith(cat)) { categories[cat] += e.montant; matched = true; }
                    });
                    if (!matched) {
                        if (['personnel'].some(k=>desc.includes(k))) { categories['Dépenses Personnel'] += e.montant; matched=true; }
                        else if (['entretien', 'vidange', 'pneu', 'mecanicien'].some(k=>desc.includes(k))) { categories['Dépenses Entretien Véhicules'] += e.montant; matched=true; }
                        else if (['péage', 'peage'].some(k=>desc.includes(k))) { categories['Dépenses Péage'] += e.montant; matched=true; }
                        else if (['carburant', 'essence'].some(k=>desc.includes(k))) { categories['Dépenses Carburant'] += e.montant; matched=true; }
                        else if (['livraison', 'douane', 'frais'].some(k=>desc.includes(k))) { categories['Dépenses Livraison'] += e.montant; matched=true; }
                    }
                    if (!matched) categories['Autres'] += e.montant;
                }
            });

            totalsMonthBody.innerHTML = Object.entries(months).sort((a,b)=>b[0].localeCompare(a[0])).map(([m, t])=>`<tr style="cursor:pointer;" onclick="window.showMonthDetails('${m}')"><td>${m}</td><td style="text-align:right; font-weight:bold; color:#ef4444;">${formatCFA(t)}</td></tr>`).join('');
            totalsContainerBody.innerHTML = Object.entries(containers).sort((a,b)=>a[0].localeCompare(b[0])).map(([c, t])=>`<tr style="cursor:pointer;" onclick="window.showContainerDetails('${c}')"><td>${c}</td><td style="text-align:right; font-weight:bold; color:#ef4444;">${formatCFA(t)}</td></tr>`).join('');
            if(totalsCategoryBody) totalsCategoryBody.innerHTML = Object.entries(categories).map(([c, t])=>`<tr><td>${c}</td><td style="text-align:right; font-weight:bold; color:#ef4444;">${formatCFA(t)}</td></tr>`).join('');
        }

        if (showDeletedCheckbox) showDeletedCheckbox.addEventListener('change', fetchExpenses);
        if (expenseSearchInput) expenseSearchInput.addEventListener('input', renderExpensesTable);
        const filterTotalsBtn = document.getElementById('filterTotalsBtn');
        if (filterTotalsBtn) filterTotalsBtn.addEventListener('click', renderTotals);
        
        fetchExpenses();

        // --- INJECTION DE LA MODALE EDIT ---
        if (!document.getElementById('expenseEditModal')) {
            document.body.insertAdjacentHTML('beforeend', `
            <div id="expenseEditModal" class="modal" style="display:none; position:fixed; z-index:1000; left:0; top:0; width:100%; height:100%; background-color:rgba(0,0,0,0.8); align-items:center; justify-content:center;">
                <div class="modal-content" style="background:#fff; padding:20px; width:90%; max-width:500px; border-radius:12px;">
                    <span class="close-modal" id="closeExpenseEditModal" style="float:right; cursor:pointer; font-size:24px;">&times;</span>
                    <h2 style="margin-top:0;">Modifier Dépense</h2>
                    <div style="margin-bottom:15px;"><label>Date</label><input type="date" id="expenseEditDate" style="width:100%; padding:8px;"></div>
                    <div style="margin-bottom:15px;"><label>Description</label><input type="text" id="expenseEditDesc" style="width:100%; padding:8px;"></div>
                    <div style="margin-bottom:15px;"><label>Montant</label><input type="number" id="expenseEditAmount" style="width:100%; padding:8px;"></div>
                    <div style="margin-bottom:15px;"><label>Type</label><select id="expenseEditType" style="width:100%; padding:8px;"><option value="Mensuelle">Mensuelle</option><option value="Conteneur">Conteneur</option><option value="Budget">Budget</option></select></div>
                    <div style="margin-bottom:15px;" id="expenseEditSubtypeGroup"><label>Catégorie</label><select id="expenseEditSubtype" style="width:100%; padding:8px;"><option value="">-- Aucune --</option><option value="Dépenses Livraison">Dépenses Livraison</option><option value="Dépenses Péage">Dépenses Péage</option><option value="Dépenses Carburant">Dépenses Carburant</option><option value="Dépenses Personnel">Dépenses Personnel</option><option value="Dépenses Entretien Véhicules">Dépenses Entretien Véhicules</option></select></div>
                    <div style="margin-bottom:15px;" id="expenseEditVehicleGroup" style="display:none;"><label>Véhicule</label><select id="expenseEditVehicle" style="width:100%; padding:8px;"><option value="">-- Aucun --</option></select></div>
                    <div style="margin-bottom:15px; display:none;" id="expenseEditContainerGroup"><label>Conteneur</label><input type="text" id="expenseEditContainer" style="width:100%; padding:8px;" list="containersList"></div>
                    <div style="margin-bottom:15px;"><label>Mode</label><select id="expenseEditMode" style="width:100%; padding:8px;"><option value="Espèce">Espèce</option><option value="Wave">Wave</option><option value="OM">OM</option><option value="Chèque">Chèque</option><option value="Virement">Virement</option></select></div>
                    <div style="text-align:right;"><button id="cancelExpenseEditBtn" class="btn">Annuler</button> <button id="saveExpenseEditBtn" class="btn btn-success">Enregistrer</button></div>
                </div>
            </div>`);
        }
        
        // Toggle affichage modale édition
        const editExpType = document.getElementById('expenseEditType');
        if (editExpType) {
            editExpType.addEventListener('change', () => {
                const subtypeGroup = document.getElementById('expenseEditSubtypeGroup');
                const vehicleGroup = document.getElementById('expenseEditVehicleGroup');
                const containerGroup = document.getElementById('expenseEditContainerGroup');
                if (editExpType.value === 'Conteneur') {
                    if (containerGroup) containerGroup.style.display = 'block';
                    if (subtypeGroup) subtypeGroup.style.display = 'none';
                    if (vehicleGroup) vehicleGroup.style.display = 'none';
                } else {
                    if (containerGroup) containerGroup.style.display = 'none';
                    if (subtypeGroup) subtypeGroup.style.display = 'block';
                    if (vehicleGroup) vehicleGroup.style.display = 'block';
                }
            });
        }

        window.showMonthDetails = (month) => {
            const details = allExpenses.filter(e => !e.isDeleted && (!e.sessionId || !unconfirmedSessions.has(e.sessionId)) && e.type === 'Mensuelle' && e.date.substring(0, 7) === month);
            renderDetailsModal(`Détails Dépenses : ${month}`, details);
        };
        window.showContainerDetails = (container) => {
            const details = allExpenses.filter(e => !e.isDeleted && (!e.sessionId || !unconfirmedSessions.has(e.sessionId)) && (e.type === 'Conteneur' || e.conteneur) && (e.conteneur||'').trim().toUpperCase() === container);
            renderDetailsModal(`Détails Dépenses : ${container}`, details);
        };
        
        function renderDetailsModal(title, list) {
            document.getElementById('expenseDetailsTitle').textContent = title;
            const tbody = document.getElementById('expenseDetailsBody');
            tbody.innerHTML = list.length === 0 ? '<tr><td colspan="5">Aucune dépense.</td></tr>' : list.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(e => `<tr><td>${e.date}</td><td>${e.description}</td><td>${e.type}</td><td>${e.mode||'-'}</td><td style="font-weight:bold; color:#ef4444;">${formatCFA(e.montant)}</td></tr>`).join('');
            document.getElementById('expenseDetailsModal').classList.add('active');
        }
        
        const closeDetailsModal = document.getElementById('closeExpenseDetailsModal');
        if (closeDetailsModal) closeDetailsModal.onclick = () => document.getElementById('expenseDetailsModal').classList.remove('active');
        
        // Ajout logique
        if (addExpenseBtn && !isViewer) {
            addExpenseBtn.addEventListener('click', () => {
                const currentUserName = sessionStorage.getItem('userName') || 'Inconnu';
                const data = {
                    date: expenseDate.value,
                    description: `${expenseType.value === 'Mensuelle' && expenseSubtype?.value ? expenseSubtype.value + ' - ' : ''}${expenseDesc.value} (${currentUserName})`,
                    montant: parseFloat(expenseAmount.value) || 0,
                    action: actionType?.value || 'Depense',
                    type: actionType?.value === 'Depense' ? expenseType.value : 'Budget',
                    mode: actionType?.value === 'Depense' ? expenseMode.value : 'Virement',
                    conteneur: expenseType.value === 'Conteneur' && actionType?.value === 'Depense' ? expenseContainer.value.trim().toUpperCase() : '',
                    vehicleId: expenseVehicle?.style.display !== 'none' ? expenseVehicle.value : '',
                    agency: activeAgency, isDeleted: false
                };
                if (!data.date || !expenseDesc.value || data.montant <= 0) return alert("Veuillez remplir les champs.");
                
                if (currentUserName.toLowerCase() === "aziz") {
                    setDoc(doc(collection(db, "expenses")), data).then(() => { alert("Dépense enregistrée."); expenseDesc.value=''; expenseAmount.value=''; });
                } else {
                    pendingExpenses.push(data);
                    const c = document.getElementById('pendingExpensesCard');
                    const b = document.getElementById('pendingExpensesBody');
                    c.style.display = 'block';
                    b.innerHTML = pendingExpenses.map((exp, i) => `<tr><td>${exp.date}</td><td>${exp.description}</td><td>${formatCFA(exp.montant)}</td><td>${exp.type}</td><td><button onclick="window.removePendingExpense(${i})">X</button></td></tr>`).join('');
                    expenseDesc.value=''; expenseAmount.value='';
                }
            });
        }
        
        window.removePendingExpense = (i) => {
            pendingExpenses.splice(i, 1);
            document.getElementById('pendingExpensesCard').style.display = pendingExpenses.length > 0 ? 'block' : 'none';
            if(pendingExpenses.length > 0) document.getElementById('pendingExpensesBody').innerHTML = pendingExpenses.map((exp, i) => `<tr><td>${exp.date}</td><td>${exp.description}</td><td>${formatCFA(exp.montant)}</td><td>${exp.type}</td><td><button onclick="window.removePendingExpense(${i})">X</button></td></tr>`).join('');
        };
        
        const commitBtn = document.getElementById('commitExpensesBtn');
        if (commitBtn) {
            commitBtn.addEventListener('click', async () => {
                if (pendingExpenses.length === 0) return;
                if (!confirm(`Enregistrer ces ${pendingExpenses.length} dépenses ?`)) return;
                const batch = writeBatch(db);
                pendingExpenses.forEach(exp => batch.set(doc(collection(db, "expenses")), exp));
                await batch.commit();
                pendingExpenses = [];
                document.getElementById('pendingExpensesCard').style.display = 'none';
                alert("Enregistré avec succès !");
            });
        }
    }
};