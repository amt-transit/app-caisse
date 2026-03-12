document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: La connexion à la base de données a échoué."); return;
    }

    const userRole = sessionStorage.getItem('userRole');
    // Récupération du nom de l'utilisateur (stocké par auth-guard.js)
    const currentUserName = sessionStorage.getItem('userName') || 'Inconnu';
    const isViewer = userRole === 'spectateur';

    const expensesCollection = db.collection("expenses");
    
    const addExpenseBtn = document.getElementById('addExpenseBtn');
    const expenseDate = document.getElementById('expenseDate');
    const expenseDesc = document.getElementById('expenseDesc');
    const expenseAmount = document.getElementById('expenseAmount');
    const expenseType = document.getElementById('expenseType');
    const expenseSubtype = document.getElementById('expenseSubtype');
    const expenseMode = document.getElementById('expenseMode'); 
    const expenseContainer = document.getElementById('expenseContainer');
    const actionType = document.getElementById('actionType');
    
    const expenseTableBody = document.getElementById('expenseTableBody');
    const showDeletedCheckbox = document.getElementById('showDeletedCheckbox');
    const expenseSearchInput = document.getElementById('expenseSearch');

    // Filtres Totaux
    const totalStartDate = document.getElementById('totalStartDate');
    const totalEndDate = document.getElementById('totalEndDate');
    const filterTotalsBtn = document.getElementById('filterTotalsBtn');

    // --- AJOUT DYNAMIQUE : Checkbox Tri Conteneur ---
    let sortExpenseContainerCheckbox = document.getElementById('sortExpenseContainerCheckbox');
    if (!sortExpenseContainerCheckbox && showDeletedCheckbox && showDeletedCheckbox.parentNode) {
        const span = document.createElement('span');
        span.style.marginLeft = "15px";
        span.innerHTML = `<input type="checkbox" id="sortExpenseContainerCheckbox" style="width:auto; vertical-align:middle;"> <label for="sortExpenseContainerCheckbox" style="cursor:pointer; font-size:12px;">Tri par Conteneur</label>`;
        showDeletedCheckbox.parentNode.appendChild(span);
        sortExpenseContainerCheckbox = document.getElementById('sortExpenseContainerCheckbox');
        sortExpenseContainerCheckbox.addEventListener('change', () => renderExpensesTable());
    }

    // --- AJOUT DYNAMIQUE : Résumé Catégories (Inspiré de Autres Entrées) ---
    let expenseStatsContainer = document.getElementById('expenseStatsContainer');
    // On l'injecte avant le tableau si pas présent
    const tableContainer = document.querySelector('#listView table') || document.querySelector('#expenseTableBody')?.closest('table');
    if (tableContainer && tableContainer.parentNode) {
        // 1. Contrôles (Filtre Mois)
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

            // Listeners pour le filtre
            setTimeout(() => {
                const monthInput = document.getElementById('expenseStatsMonthFilter');
                const clearBtn = document.getElementById('clearExpenseStatsFilter');
                if (monthInput) monthInput.addEventListener('change', () => renderExpensesTable());
                if (clearBtn) clearBtn.addEventListener('click', () => {
                    if(monthInput) monthInput.value = '';
                    renderExpensesTable();
                });
            }, 0);
        }

        // 2. Conteneur Stats
        if (!expenseStatsContainer) {
            expenseStatsContainer = document.createElement('div');
            expenseStatsContainer.id = 'expenseStatsContainer';
            expenseStatsContainer.style.cssText = "display:flex; gap:15px; margin-bottom:15px; flex-wrap:wrap;";
            tableContainer.parentNode.insertBefore(expenseStatsContainer, tableContainer);
        }
    }

    // --- NOUVEAU : Helper de catégorisation centralisé ---
    function getExpenseCategory(desc) {
        desc = (desc || '').toLowerCase();
        const kwPeage = ['péage', 'peage'];
        const kwCarburant = ['carburant', 'essence', 'gasoil'];
        const kwLivraison = ['livraison', 'police', 'douane', 'gendarmerie', 'gendarme', 'achat', 'lavage', 'aide', 'frais', 'transp', 'founi', 'stock'];
        const kwPersonnel = ['personnel']; // Salaire, prime, avance sont gérés dans le module RH
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
        // Bascule le filtre (si on reclique sur le même, on annule)
        currentCategoryFilter = currentCategoryFilter === category ? null : category;
        renderExpensesTable();
    };

    function updateExpenseCategoryStats() {
        if (!expenseStatsContainer) return;
        // Masquer si on est sur l'onglet Totaux OU Conteneur (car logique mensuelle uniquement)
        if (currentTab === 'totals' || currentTab === 'container') {
            expenseStatsContainer.style.display = 'none';
            return;
        }
        expenseStatsContainer.style.display = 'flex';

        const stats = {
            'Livraison': 0,
            'Péage': 0,
            'Carburant': 0,
            'Personnel': 0,
            'Entretien Véhicules': 0,
            'Autres': 0
        };
        let totalView = 0;
        
        const monthFilter = document.getElementById('expenseStatsMonthFilter')?.value;

        allExpenses.forEach(e => {
            if (e.isDeleted) return;
            if (e.sessionId && unconfirmedSessions.has(e.sessionId)) return;

            // Filtre Mois
            if (monthFilter && !e.date.startsWith(monthFilter)) return;

            // Filtre selon l'onglet actif (Mensuelle vs Conteneur)
            if (currentTab === 'monthly' && (e.type === 'Conteneur' || e.conteneur)) return;
            if (currentTab === 'container' && !(e.type === 'Conteneur' || e.conteneur)) return;

            const desc = (e.description || '').toLowerCase();
            const amount = e.montant || 0;
            
            totalView += amount;

            const cat = getExpenseCategory(desc);
            if (stats[cat] !== undefined) stats[cat] += amount;
        });

        // Configuration des couleurs (Fond + Texte)
        const colors = { 
            'Livraison': { bg: '#e0f2fe', text: '#0369a1' }, // Bleu clair
            'Péage': { bg: '#fef3c7', text: '#b45309' }, // Orange clair
            'Carburant': { bg: '#fee2e2', text: '#b91c1c' }, // Rouge clair
            'Personnel': { bg: '#e0e7ff', text: '#3730a3' }, // Indigo
            'Entretien Véhicules': { bg: '#d1fae5', text: '#065f46' }, // Vert
            'Autres': { bg: '#e2e8f0', text: '#475569' } // Gris (Slate-200)
        };
        
        let html = '';
        
        // 1. Carte TOTAL (Vert)
        const opacityTotal = currentCategoryFilter ? '0.5' : '1';
        html += `
            <div onclick="window.filterExpensesByCategory(null)" style="cursor:pointer; opacity:${opacityTotal}; background:#10b981; color:white; border-radius:8px; padding:10px 15px; min-width:140px; box-shadow:0 4px 6px rgba(0,0,0,0.1); transition: opacity 0.2s;">
                <div style="font-size:0.8em; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px; opacity:0.9;">Total ${currentTab === 'monthly' ? 'Mensuel' : 'Conteneur'}</div>
                <div style="font-size:1.4em; font-weight:bold;">${formatCFA(totalView)}</div>
            </div>
        `;

        // 2. Cartes Catégories
        html += Object.entries(stats).map(([key, val]) => {
            const isActive = currentCategoryFilter === key;
            const borderStyle = isActive ? '2px solid #000' : `1px solid ${colors[key].bg}`;
            const transformStyle = isActive ? 'scale(1.05)' : 'scale(1)';
            return `
            <div onclick="window.filterExpensesByCategory('${key}')" style="cursor:pointer; transform:${transformStyle}; transition: all 0.2s; background:${colors[key].bg}; border:${borderStyle}; border-radius:8px; padding:10px 15px; min-width:140px; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
                <div style="font-size:0.8em; color:${colors[key].text}; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">${key}</div>
                <div style="font-size:1.2em; font-weight:bold; color:${colors[key].text};">${formatCFA(val)}</div>
            </div>
        `}).join('');
        
        expenseStatsContainer.innerHTML = html;
    }

    let unsubscribeExpenses = null; 
    let allExpenses = [];
    let unconfirmedSessions = new Set(); // Stocke les IDs de sessions non validées
    let pendingExpenses = []; // Pour les enregistrements multiples


    // --- GESTION DES SOUS-ONGLETS (Dépenses Mensuelles vs Conteneurs) ---
    let currentTab = 'monthly'; // 'monthly' | 'container'
    
    // Gestion des onglets statiques
    const tabMonthly = document.getElementById('tabMonthly');
    const tabContainer = document.getElementById('tabContainer');
    const tabTotals = document.getElementById('tabTotals');

    const listView = document.getElementById('listView');
    const totalsView = document.getElementById('totalsView');

    if (tabMonthly && tabContainer && tabTotals) {
        tabMonthly.addEventListener('click', (e) => {
            e.preventDefault();
            currentTab = 'monthly';
            tabMonthly.classList.add('active');
            tabContainer.classList.remove('active');
            tabTotals.classList.remove('active');
            if(listView) listView.style.display = 'block';
            if(totalsView) totalsView.style.display = 'none';
            renderExpensesTable();
        });
        tabContainer.addEventListener('click', (e) => {
            e.preventDefault();
            currentTab = 'container';
            tabContainer.classList.add('active');
            tabMonthly.classList.remove('active');
            tabTotals.classList.remove('active');
            if(listView) listView.style.display = 'block';
            if(totalsView) totalsView.style.display = 'none';
            renderExpensesTable();
        });
        tabTotals.addEventListener('click', (e) => {
            e.preventDefault();
            currentTab = 'totals';
            tabTotals.classList.add('active');
            tabMonthly.classList.remove('active');
            tabContainer.classList.remove('active');
            if(listView) listView.style.display = 'none';
            if(totalsView) totalsView.style.display = 'block';
            renderExpensesTable();
        });
    }

    if (userRole === 'admin' || userRole === 'super_admin') {
        if (actionType) {
            const opt = document.createElement('option');
            opt.value = 'Allocation'; opt.textContent = '🟢 Allouer du Budget (Ajout)';
            actionType.appendChild(opt);
        }
    }

    if (actionType) {
        actionType.addEventListener('change', () => {
            if (actionType.value === 'Allocation') {
                expenseType.style.display = 'none';
                expenseContainer.style.display = 'none';
                expenseMode.style.display = 'none';
                addExpenseBtn.className = 'primary'; addExpenseBtn.textContent = "Ajouter au Budget";
            } else {
                expenseType.style.display = 'inline-block';
                expenseMode.style.display = 'inline-block';
                if(expenseType.value === 'Conteneur') expenseContainer.style.display = 'block';
                if(expenseType.value === 'Mensuelle' && expenseSubtype) expenseSubtype.style.display = 'block';
                addExpenseBtn.className = 'deleteBtn'; addExpenseBtn.textContent = "Valider la Dépense";
            }
        });
    }
    if (expenseType.value === 'Mensuelle' && expenseSubtype) expenseSubtype.style.display = 'block';

    expenseType.addEventListener('change', () => {
        if (expenseType.value === 'Conteneur' && (!actionType || actionType.value !== 'Allocation')) {
            expenseContainer.style.display = 'block';
            if(expenseSubtype) expenseSubtype.style.display = 'none';
        } else {
            expenseContainer.style.display = 'none';
            if(expenseSubtype) expenseSubtype.style.display = 'block';
        }
    });

    // 1. AJOUT (AVEC NOM DE L'UTILISATEUR)
    if (addExpenseBtn && !isViewer) { addExpenseBtn.addEventListener('click', async () => {
        // --- CONFIGURATION DE L'UTILISATEUR SANS CONFIRMATION ---
        const USER_NO_CONFIRM = "aziz";

        // 1. Récupération des données
        const montant = parseFloat(expenseAmount.value) || 0;
        const action = actionType ? actionType.value : 'Depense';
        let finalDesc = expenseDesc.value;
        if (expenseType.value === 'Mensuelle' && expenseSubtype && expenseSubtype.value) {
            finalDesc = `${expenseSubtype.value} - ${finalDesc}`;
        }

        const data = {
            date: expenseDate.value,
            description: `${finalDesc} (${currentUserName})`,
            montant: montant,
            action: action,
            type: (action === 'Depense') ? expenseType.value : 'Budget',
            mode: (action === 'Depense') ? expenseMode.value : 'Virement',
            conteneur: (expenseType.value === 'Conteneur' && action === 'Depense') ? expenseContainer.value.trim().toUpperCase() : '',
            isDeleted: false
        };

        // 2. Validation
        if (!data.date || !expenseDesc.value || data.montant <= 0) return alert("Veuillez remplir les champs correctement.");

        // 3. Décision : Enregistrement Direct ou Liste D'attente
        if (currentUserName === USER_NO_CONFIRM) {
            // Enregistrement DIRECT
            expensesCollection.add(data).then(() => {
                alert("Dépense enregistrée (Mode Direct).");
                resetExpenseForm();
            }).catch(err => alert("Erreur : " + err.message));
        } else {
            // Ajout à la LISTE D'ATTENTE
            addExpenseToPendingList(data);
        }
    }); } else if (addExpenseBtn) {
        // Masquer le formulaire
        const form = addExpenseBtn.closest('.form-grid') || document.getElementById('caisseForm');
        if (form) form.style.display = 'none';
    }

    // 3. AFFICHAGE
    function fetchExpenses() {
        if (unsubscribeExpenses) unsubscribeExpenses();
        let query = expensesCollection;
        if (showDeletedCheckbox.checked) query = query.where("isDeleted", "==", true).orderBy("isDeleted");
        else query = query.where("isDeleted", "!=", true).orderBy("isDeleted");
        query = query.orderBy("date", "desc");
        query = query.limit(200); // OPTIMISATION QUOTA
        unsubscribeExpenses = query.onSnapshot(snapshot => {
            allExpenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderExpensesTable();
        }, error => console.error(error));
    }

    // --- LISTENER SESSIONS NON VALIDÉES ---
    db.collection("audit_logs")
        .where("action", "==", "VALIDATION_JOURNEE")
        .onSnapshot(snapshot => {
            unconfirmedSessions.clear();
            snapshot.forEach(doc => {
                if (doc.data().status !== "VALIDATED") unconfirmedSessions.add(doc.id);
            });
            // Rafraîchir l'affichage
            if (allExpenses.length > 0) renderExpensesTable();
        });

    function renderExpensesTable() {
        // Mise à jour des stats catégories (Visible sur Monthly et Container)
        updateExpenseCategoryStats();

        if (currentTab === 'totals') {
            renderTotals();
            return;
        }

        const term = expenseSearchInput ? expenseSearchInput.value.toLowerCase().trim() : "";
        const monthFilter = document.getElementById('expenseStatsMonthFilter')?.value;
        
        // 1. Filtrer les dépenses non confirmées
        const confirmedExpenses = allExpenses.filter(e => !e.sessionId || !unconfirmedSessions.has(e.sessionId));

        // Filtre par Onglet
        const tabFiltered = confirmedExpenses.filter(item => {
            if (currentTab === 'monthly') return item.type !== 'Conteneur' && !item.conteneur;
            else return item.type === 'Conteneur' || (item.conteneur && item.conteneur.trim() !== '');
        });

        const filtered = tabFiltered.filter(item => {
            // Filtre Mois
            if (monthFilter && !item.date.startsWith(monthFilter)) return false;

            // Filtre Catégorie (Clic sur carte)
            if (currentCategoryFilter) {
                if (getExpenseCategory(item.description) !== currentCategoryFilter) return false;
            }

            if (!term) return true;
            return (item.description || "").toLowerCase().includes(term) || 
                   (item.type || "").toLowerCase().includes(term) || 
                   (item.conteneur || "").toLowerCase().includes(term) ||
                   (item.montant || 0).toString().includes(term); // Recherche par montant
        });

        // Calcul du total filtré
        const totalFiltered = filtered.reduce((sum, item) => sum + (item.montant || 0), 0);
        const historyTitle = document.getElementById('expensesHistoryTitle');
        if (historyTitle) {
            historyTitle.innerHTML = `Historique des Opérations <span style="margin-left:15px; font-size:0.8em; font-weight:normal;"><span class="tag" style="background:#fff; border:1px solid #ccc; color:#333;">Total</span> : <b style="color:#2975d7;">${formatCFA(totalFiltered)}</b></span>`;
        }

        // TRI
        filtered.sort((a, b) => {
            // Si onglet Conteneur ET Checkbox cochée
            if (currentTab === 'container' && sortExpenseContainerCheckbox && sortExpenseContainerCheckbox.checked) {
                const getNum = (str) => {
                    const matches = (str || "").match(/\d+/); // Premier nombre trouvé
                    return matches ? parseInt(matches[0], 10) : 0;
                };
                const cA = getNum(a.conteneur);
                const cB = getNum(b.conteneur);
                if (cB !== cA) return cB - cA;
            }
            // Sinon Date décroissante (Défaut)
            return new Date(b.date) - new Date(a.date);
        });

        expenseTableBody.innerHTML = ''; 
        if (filtered.length === 0) { expenseTableBody.innerHTML = '<tr><td colspan="7">Aucun résultat.</td></tr>'; return; }

        filtered.forEach(expense => {
            const row = document.createElement('tr');
            if (expense.isDeleted === true) row.classList.add('deleted-row');
            
            // --- AJOUT : Couleur de fond selon la catégorie (Identique aux Totaux) ---
            if (expense.isDeleted !== true && expense.type === 'Mensuelle') {
                const desc = (expense.description || '').toLowerCase();
                
                const kwPeage = ['péage', 'peage'];
                const kwCarburant = ['carburant', 'essence', 'gasoil'];
                const kwLivraison = ['livraison', 'police', 'douane', 'gendarmerie', 'gendarme', 'achat', 'lavage', 'aide', 'frais', 'transp', 'founi', 'stock'];
                const kwPersonnel = ['salaire', 'prime', 'avance', 'personnel'];
                const kwEntretien = ['entretien', 'vidange', 'pneu', 'mecanicien', 'mécano', 'reparation', 'réparation', 'visite technique'];

                if (kwPersonnel.some(k => desc.includes(k))) row.style.backgroundColor = '#e0e7ff'; // Indigo
                else if (kwEntretien.some(k => desc.includes(k))) row.style.backgroundColor = '#d1fae5'; // Vert
                else if (kwPeage.some(k => desc.includes(k))) row.style.backgroundColor = '#fef3c7'; // Orange clair (Péage)
                else if (kwCarburant.some(k => desc.includes(k))) row.style.backgroundColor = '#fee2e2'; // Rouge clair (Carburant)
                else if (kwLivraison.some(k => desc.includes(k))) row.style.backgroundColor = '#e0f2fe'; // Bleu clair (Livraison)
                else row.style.backgroundColor = '#f1f5f9'; // Gris très clair (Autres)
            }
            
            const colorClass = 'reste-negatif';
            const sign = '-';
            const mode = expense.mode || 'Espèce';

            let deleteButtonHTML = '';
            if ((userRole === 'admin' || userRole === 'super_admin') && expense.isDeleted !== true && !isViewer) deleteButtonHTML = `<button class="deleteBtn" data-id="${expense.id}">Suppr.</button>`;

            row.innerHTML = `
                <td>${expense.date}</td><td>${expense.description}</td><td class="${colorClass}"><b>${sign} ${formatCFA(expense.montant)}</b></td>
                <td>${expense.type}</td><td>${mode}</td><td>${expense.conteneur || '-'}</td><td>${deleteButtonHTML}</td>
            `;
            expenseTableBody.appendChild(row);
        });
    }

    function renderTotals() {
        const totalsMonthBody = document.getElementById('totalsMonthBody');
        const totalsContainerBody = document.getElementById('totalsContainerBody');
        const totalsCategoryBody = document.getElementById('totalsCategoryBody');
        
        const months = {};
        const containers = {};
        const categories = {
            'Dépenses Livraison': 0,
            'Dépenses Péage': 0,
            'Dépenses Carburant': 0,
            'Dépenses Personnel': 0,
            'Dépenses Entretien Véhicules': 0,
            'Autres': 0
        };

        const start = totalStartDate ? totalStartDate.value : null;
        const end = totalEndDate ? totalEndDate.value : null;

        allExpenses.forEach(e => {
            if (e.isDeleted) return;
            if (e.sessionId && unconfirmedSessions.has(e.sessionId)) return;
            
            // Filtre Date pour les totaux
            if (start && e.date < start) return;
            if (end && e.date > end) return;

            // Par Mois
            if (e.type === 'Mensuelle') {
                const m = e.date.substring(0, 7); // YYYY-MM
                if (!months[m]) months[m] = 0;
                months[m] += (e.montant || 0);
            }

            // Par Conteneur
            if (e.type === 'Conteneur' || e.conteneur) {
                const c = (e.conteneur || 'Inconnu').trim().toUpperCase();
                if (!containers[c]) containers[c] = 0;
                containers[c] += (e.montant || 0);
            }

            // Par Catégorie (Basé sur la description)
            // UNIQUEMENT POUR LES DÉPENSES MENSUELLES
            if (e.type === 'Mensuelle') {
                let matchedCat = false;
                const desc = (e.description || '').toLowerCase();

                // 1. Vérification préfixe standard
                for (const cat of ['Dépenses Livraison', 'Dépenses Péage', 'Dépenses Carburant', 'Dépenses Personnel', 'Dépenses Entretien Véhicules']) {
                    if ((e.description || '').startsWith(cat)) {
                        categories[cat] += (e.montant || 0);
                        matchedCat = true;
                        break;
                    }
                }

                // 2. Vérification par mots-clés (si pas de préfixe)
                if (!matchedCat) {
                    const kwPeage = ['péage', 'peage'];
                    const kwCarburant = ['carburant', 'essence', 'gasoil'];
                    const kwLivraison = ['livraison', 'police', 'douane', 'gendarmerie', 'gendarme', 'achat', 'lavage', 'aide', 'frais', 'transp', 'founi', 'stock'];
                    const kwPersonnel = ['personnel'];
                    const kwEntretien = ['entretien', 'vidange', 'pneu', 'mecanicien', 'mécano', 'reparation', 'réparation', 'visite technique'];

                    if (kwPersonnel.some(k => desc.includes(k))) {
                        categories['Dépenses Personnel'] += (e.montant || 0);
                        matchedCat = true;
                    } else if (kwEntretien.some(k => desc.includes(k))) {
                        categories['Dépenses Entretien Véhicules'] += (e.montant || 0);
                        matchedCat = true;
                    } else if (kwPeage.some(k => desc.includes(k))) {
                        categories['Dépenses Péage'] += (e.montant || 0);
                        matchedCat = true;
                    } else if (kwCarburant.some(k => desc.includes(k))) {
                        categories['Dépenses Carburant'] += (e.montant || 0);
                        matchedCat = true;
                    } else if (kwLivraison.some(k => desc.includes(k))) {
                        categories['Dépenses Livraison'] += (e.montant || 0);
                        matchedCat = true;
                    }
                }

                if (!matchedCat) {
                    categories['Autres'] += (e.montant || 0);
                }
            }
        });

        // Rendu Mois (Tri décroissant)
        totalsMonthBody.innerHTML = Object.entries(months).sort((a, b) => b[0].localeCompare(a[0])).map(([m, total]) => `
            <tr style="cursor:pointer;" onclick="window.showMonthDetails('${m}')"><td>${m}</td><td style="text-align:right; font-weight:bold; color:#ef4444;">${formatCFA(total)}</td></tr>
        `).join('');

        // Rendu Conteneurs (Tri alphabétique)
        totalsContainerBody.innerHTML = Object.entries(containers).sort((a, b) => a[0].localeCompare(b[0])).map(([c, total]) => `
            <tr style="cursor:pointer;" onclick="window.showContainerDetails('${c}')"><td>${c}</td><td style="text-align:right; font-weight:bold; color:#ef4444;">${formatCFA(total)}</td></tr>
        `).join('');

        // Rendu Catégories
        if (totalsCategoryBody) {
            totalsCategoryBody.innerHTML = Object.entries(categories).map(([cat, total]) => `
                <tr><td>${cat}</td><td style="text-align:right; font-weight:bold; color:#ef4444;">${formatCFA(total)}</td></tr>
            `).join('');
        }
    }
    
    if(filterTotalsBtn) filterTotalsBtn.addEventListener('click', renderTotals);

    showDeletedCheckbox.addEventListener('change', fetchExpenses);
    if(expenseSearchInput) expenseSearchInput.addEventListener('input', renderExpensesTable); 
    fetchExpenses();

    expenseTableBody.addEventListener('click', (event) => {
        if (isViewer) return;
        if (event.target.classList.contains('deleteBtn')) {
            if (confirm("Supprimer cette opération ?")) expensesCollection.doc(event.target.getAttribute('data-id')).update({ isDeleted: true }); 
        }
    });

    // --- GESTION MODAL DÉTAILS ---
    const expenseDetailsModal = document.getElementById('expenseDetailsModal');
    const closeExpenseDetailsModal = document.getElementById('closeExpenseDetailsModal');
    
    if(closeExpenseDetailsModal) {
        closeExpenseDetailsModal.onclick = () => expenseDetailsModal.classList.remove('active');
    }
    
    window.addEventListener('click', (e) => {
        if (e.target == expenseDetailsModal) expenseDetailsModal.classList.remove('active');
    });

    window.showMonthDetails = (month) => {
        const details = allExpenses.filter(e => {
            if (e.isDeleted) return false;
            if (e.sessionId && unconfirmedSessions.has(e.sessionId)) return false;
            if (e.type !== 'Mensuelle') return false;
            return e.date.substring(0, 7) === month;
        });
        renderDetailsModal(`Détails Dépenses : ${month}`, details);
    };

    window.showContainerDetails = (container) => {
        const details = allExpenses.filter(e => {
            if (e.isDeleted) return false;
            if (e.sessionId && unconfirmedSessions.has(e.sessionId)) return false;
            if (e.type === 'Conteneur' || e.conteneur) {
                const c = (e.conteneur || 'Inconnu').trim().toUpperCase();
                return c === container;
            }
            return false;
        });
        renderDetailsModal(`Détails Dépenses : ${container}`, details);
    };

    function renderDetailsModal(title, list) {
        document.getElementById('expenseDetailsTitle').textContent = title;
        const tbody = document.getElementById('expenseDetailsBody');
        tbody.innerHTML = '';
        
        list.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        if(list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5">Aucune dépense.</td></tr>';
        } else {
            list.forEach(e => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${e.date}</td>
                    <td>${e.description}</td>
                    <td>${e.type}</td>
                    <td>${e.mode || '-'}</td>
                    <td style="font-weight:bold; color:#ef4444;">${formatCFA(e.montant)}</td>
                `;
                tbody.appendChild(tr);
            });
        }
        expenseDetailsModal.classList.add('active');
    }

    // --- GESTION DES ENREGISTREMENTS MULTIPLES ---

    function resetExpenseForm() {
        expenseDesc.value = '';
        expenseAmount.value = '';
        expenseContainer.value = '';
        if (expenseSubtype) expenseSubtype.value = '';
        expenseDesc.focus();
    }

    function addExpenseToPendingList(data) {
        pendingExpenses.push(data);
        renderPendingExpenses();
        resetExpenseForm();
    }

    function renderPendingExpenses() {
        const container = document.getElementById('pendingExpensesCard');
        const tbody = document.getElementById('pendingExpensesBody');
        if (!container || !tbody) return;

        if (pendingExpenses.length === 0) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';
        tbody.innerHTML = pendingExpenses.map((exp, index) => `
            <tr>
                <td>${exp.date}</td>
                <td>${exp.description}</td>
                <td>${formatCFA(exp.montant)}</td>
                <td>${exp.type} ${exp.conteneur ? `(${exp.conteneur})` : ''}</td>
                <td><button class="deleteBtn" onclick="removePendingExpense(${index})">X</button></td>
            </tr>
        `).join('');
    }

    window.removePendingExpense = (index) => {
        pendingExpenses.splice(index, 1);
        renderPendingExpenses();
    };

    const commitBtn = document.getElementById('commitExpensesBtn');
    if (commitBtn) {
        commitBtn.addEventListener('click', async () => {
            if (pendingExpenses.length === 0) return;
            if (!confirm(`Enregistrer ${pendingExpenses.length} dépense(s) ?`)) return;

            const batch = db.batch();
            pendingExpenses.forEach(exp => {
                const docRef = expensesCollection.doc();
                batch.set(docRef, exp);
            });

            try {
                await batch.commit();
                pendingExpenses = [];
                renderPendingExpenses();
                alert("Dépenses enregistrées avec succès !");
            } catch (err) {
                console.error(err);
                alert("Erreur lors de l'enregistrement : " + err.message);
            }
        });
    }

    initBackToTopButton();
});