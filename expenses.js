document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: La connexion à la base de données a échoué."); return;
    }

    const userRole = sessionStorage.getItem('userRole');
    // Récupération du nom de l'utilisateur (stocké par auth-guard.js)
    const currentUserName = sessionStorage.getItem('userName') || 'Inconnu';

    const expensesCollection = db.collection("expenses");
    
    const addExpenseBtn = document.getElementById('addExpenseBtn');
    const expenseDate = document.getElementById('expenseDate');
    const expenseDesc = document.getElementById('expenseDesc');
    const expenseAmount = document.getElementById('expenseAmount');
    const expenseType = document.getElementById('expenseType');
    const expenseMode = document.getElementById('expenseMode'); 
    const expenseContainer = document.getElementById('expenseContainer');
    const actionType = document.getElementById('actionType');
    
    const expenseTableBody = document.getElementById('expenseTableBody');
    const showDeletedCheckbox = document.getElementById('showDeletedCheckbox');
    const expenseSearchInput = document.getElementById('expenseSearch');

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

    let unsubscribeExpenses = null; 
    let allExpenses = [];
    let unconfirmedSessions = new Set(); // Stocke les IDs de sessions non validées

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
                addExpenseBtn.className = 'deleteBtn'; addExpenseBtn.textContent = "Valider la Dépense";
            }
        });
    }

    expenseType.addEventListener('change', () => {
        if (expenseType.value === 'Conteneur' && (!actionType || actionType.value !== 'Allocation')) {
            expenseContainer.style.display = 'block';
        } else {
            expenseContainer.style.display = 'none';
        }
    });

    // 1. AJOUT (AVEC NOM DE L'UTILISATEUR)
    addExpenseBtn.addEventListener('click', async () => {
        const montant = parseFloat(expenseAmount.value) || 0;
        const action = actionType ? actionType.value : 'Depense'; 

        const data = {
            date: expenseDate.value,
            // CORRECTION : Ajout du nom de l'utilisateur dans la description
            description: `${expenseDesc.value} (${currentUserName})`, 
            montant: montant,
            action: action, 
            type: (action === 'Depense') ? expenseType.value : 'Budget',
            mode: (action === 'Depense') ? expenseMode.value : 'Virement',
            conteneur: (expenseType.value === 'Conteneur' && action === 'Depense') ? expenseContainer.value.trim().toUpperCase() : '',
            isDeleted: false 
        };

        if (!data.date || !expenseDesc.value || data.montant <= 0) return alert("Veuillez remplir les champs.");

        expensesCollection.add(data).then(() => {
            expenseDesc.value = ''; expenseAmount.value = ''; expenseContainer.value = '';
            expenseMode.value = 'Espèce';
            alert("Dépense enregistrée.");
        }).catch(err => console.error(err));
    });

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
        if (currentTab === 'totals') {
            renderTotals();
            return;
        }

        const term = expenseSearchInput ? expenseSearchInput.value.toLowerCase().trim() : "";
        
        // 1. Filtrer les dépenses non confirmées
        const confirmedExpenses = allExpenses.filter(e => !e.sessionId || !unconfirmedSessions.has(e.sessionId));

        // Filtre par Onglet
        const tabFiltered = confirmedExpenses.filter(item => {
            if (currentTab === 'monthly') return item.type !== 'Conteneur' && !item.conteneur;
            else return item.type === 'Conteneur' || (item.conteneur && item.conteneur.trim() !== '');
        });

        const filtered = tabFiltered.filter(item => {
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
            
            const colorClass = 'reste-negatif';
            const sign = '-';
            const mode = expense.mode || 'Espèce';

            let deleteButtonHTML = '';
            if ((userRole === 'admin' || userRole === 'super_admin') && expense.isDeleted !== true) deleteButtonHTML = `<button class="deleteBtn" data-id="${expense.id}">Suppr.</button>`;

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
        
        const months = {};
        const containers = {};

        allExpenses.forEach(e => {
            if (e.isDeleted) return;
            if (e.sessionId && unconfirmedSessions.has(e.sessionId)) return;

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
        });

        // Rendu Mois (Tri décroissant)
        totalsMonthBody.innerHTML = Object.entries(months).sort((a, b) => b[0].localeCompare(a[0])).map(([m, total]) => `
            <tr style="cursor:pointer;" onclick="window.showMonthDetails('${m}')"><td>${m}</td><td style="text-align:right; font-weight:bold; color:#ef4444;">${formatCFA(total)}</td></tr>
        `).join('');

        // Rendu Conteneurs (Tri alphabétique)
        totalsContainerBody.innerHTML = Object.entries(containers).sort((a, b) => a[0].localeCompare(b[0])).map(([c, total]) => `
            <tr style="cursor:pointer;" onclick="window.showContainerDetails('${c}')"><td>${c}</td><td style="text-align:right; font-weight:bold; color:#ef4444;">${formatCFA(total)}</td></tr>
        `).join('');
    }
    
    showDeletedCheckbox.addEventListener('change', fetchExpenses);
    if(expenseSearchInput) expenseSearchInput.addEventListener('input', renderExpensesTable); 
    fetchExpenses();

    expenseTableBody.addEventListener('click', (event) => {
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

    initBackToTopButton();
});