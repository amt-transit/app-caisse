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
    const budgetDisplay = document.getElementById('budgetDisplay');
    
    const expenseTableBody = document.getElementById('expenseTableBody');
    const showDeletedCheckbox = document.getElementById('showDeletedCheckbox');
    const expenseSearchInput = document.getElementById('expenseSearch');

    let unsubscribeExpenses = null; 
    let allExpenses = [];

    // --- GESTION DES SOUS-ONGLETS (Dépenses Mensuelles vs Conteneurs) ---
    let currentTab = 'monthly'; // 'monthly' | 'container'
    
    // Gestion des onglets statiques
    const tabMonthly = document.getElementById('tabMonthly');
    const tabContainer = document.getElementById('tabContainer');

    if (tabMonthly && tabContainer) {
        tabMonthly.addEventListener('click', (e) => {
            e.preventDefault();
            currentTab = 'monthly';
            tabMonthly.classList.add('active');
            tabContainer.classList.remove('active');
            renderExpensesTable();
        });
        tabContainer.addEventListener('click', (e) => {
            e.preventDefault();
            currentTab = 'container';
            tabContainer.classList.add('active');
            tabMonthly.classList.remove('active');
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

        if (action === 'Depense') {
            const budgetActuel = calculateCurrentBudget(allExpenses);
            if (data.montant > budgetActuel) return alert(`BUDGET DÉPENSES INSUFFISANT !`);
        }

        expensesCollection.add(data).then(() => {
            expenseDesc.value = ''; expenseAmount.value = ''; expenseContainer.value = '';
            expenseMode.value = 'Espèce';
            alert(action === 'Allocation' ? "Budget rechargé !" : "Dépense enregistrée.");
        }).catch(err => console.error(err));
    });

    // 3. AFFICHAGE
    function fetchExpenses() {
        if (unsubscribeExpenses) unsubscribeExpenses();
        let query = expensesCollection;
        if (showDeletedCheckbox.checked) query = query.where("isDeleted", "==", true).orderBy("isDeleted");
        else query = query.where("isDeleted", "!=", true).orderBy("isDeleted");
        query = query.orderBy("date", "desc");

        unsubscribeExpenses = query.onSnapshot(snapshot => {
            allExpenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (budgetDisplay) {
                const budget = calculateCurrentBudget(allExpenses);
                budgetDisplay.textContent = formatCFA(budget);
                budgetDisplay.style.color = budget < 0 ? 'red' : '#0d47a1';
            }
            renderExpensesTable();
        }, error => console.error(error));
    }

    function calculateCurrentBudget(expensesList) {
        let total = 0;
        expensesList.forEach(e => {
            if (e.isDeleted) return;
            if (e.action === 'Allocation') total += e.montant; else total -= e.montant;
        });
        return total;
    }

    function renderExpensesTable() {
        const term = expenseSearchInput ? expenseSearchInput.value.toLowerCase().trim() : "";
        
        // Filtre par Onglet
        const tabFiltered = allExpenses.filter(item => {
            if (currentTab === 'monthly') return item.type !== 'Conteneur' && !item.conteneur;
            else return item.type === 'Conteneur' || (item.conteneur && item.conteneur.trim() !== '');
        });

        const filtered = tabFiltered.filter(item => {
            if (!term) return true;
            return (item.description || "").toLowerCase().includes(term) || (item.type || "").toLowerCase().includes(term) || (item.conteneur || "").toLowerCase().includes(term);
        });

        expenseTableBody.innerHTML = ''; 
        if (filtered.length === 0) { expenseTableBody.innerHTML = '<tr><td colspan="7">Aucun résultat.</td></tr>'; return; }

        filtered.forEach(expense => {
            const row = document.createElement('tr');
            if (expense.isDeleted === true) row.classList.add('deleted-row');
            
            const isAlloc = expense.action === 'Allocation';
            const colorClass = isAlloc ? 'reste-positif' : 'reste-negatif';
            const sign = isAlloc ? '+' : '-';
            const mode = isAlloc ? '' : (expense.mode || 'Espèce');

            let deleteButtonHTML = '';
            if ((userRole === 'admin' || userRole === 'super_admin') && expense.isDeleted !== true) deleteButtonHTML = `<button class="deleteBtn" data-id="${expense.id}">Suppr.</button>`;

            row.innerHTML = `
                <td>${expense.date}</td><td>${expense.description}</td><td class="${colorClass}"><b>${sign} ${formatCFA(expense.montant)}</b></td>
                <td>${isAlloc ? 'BUDGET' : expense.type}</td><td>${mode}</td><td>${expense.conteneur || '-'}</td><td>${deleteButtonHTML}</td>
            `;
            expenseTableBody.appendChild(row);
        });
    }
    
    showDeletedCheckbox.addEventListener('change', fetchExpenses);
    if(expenseSearchInput) expenseSearchInput.addEventListener('input', renderExpensesTable); 
    fetchExpenses();

    expenseTableBody.addEventListener('click', (event) => {
        if (event.target.classList.contains('deleteBtn')) {
            if (confirm("Supprimer cette opération ?")) expensesCollection.doc(event.target.getAttribute('data-id')).update({ isDeleted: true }); 
        }
    });

    function formatCFA(n) { return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(n || 0); }
});