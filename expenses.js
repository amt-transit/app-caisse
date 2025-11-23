document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: La connexion à la base de données a échoué.");
        return;
    }

    const userRole = sessionStorage.getItem('userRole');
    const expensesCollection = db.collection("expenses");
    
    // Éléments UI
    const addExpenseBtn = document.getElementById('addExpenseBtn');
    const expenseDate = document.getElementById('expenseDate');
    const expenseDesc = document.getElementById('expenseDesc');
    const expenseAmount = document.getElementById('expenseAmount');
    const expenseType = document.getElementById('expenseType');
    const expenseContainer = document.getElementById('expenseContainer');
    const actionType = document.getElementById('actionType'); // Selecteur Action (si Admin)
    const budgetDisplay = document.getElementById('budgetDisplay');
    
    const expenseTableBody = document.getElementById('expenseTableBody');
    const showDeletedCheckbox = document.getElementById('showDeletedCheckbox');
    const expenseSearchInput = document.getElementById('expenseSearch');
    
    // Éléments Import CSV (Admin)
    const csvImportBlock = document.getElementById('csvImportBlock');
    const uploadCsvBtn = document.getElementById('uploadCsvBtn');
    const csvFile = document.getElementById('csvFile');
    // Note: pas de 'uploadLog' spécifique dans expenses.html, on utilise alert() pour simplifier

    let unsubscribeExpenses = null; 
    let allExpenses = [];

    // --- CONFIGURATION SELON LE RÔLE ---
    if (userRole === 'admin') {
        // L'admin peut ajouter du budget
        if (actionType) {
            const opt = document.createElement('option');
            opt.value = 'Allocation';
            opt.textContent = '🟢 Allouer du Budget (Ajout)';
            actionType.appendChild(opt);
        }
        
        // L'admin voit l'import CSV
        if(csvImportBlock) csvImportBlock.style.display = 'block';
    }

    // Gestion de l'affichage selon l'action choisie
    if (actionType) {
        actionType.addEventListener('change', () => {
            if (actionType.value === 'Allocation') {
                expenseType.style.display = 'none';
                expenseContainer.style.display = 'none';
                addExpenseBtn.className = 'primary'; // Vert
                addExpenseBtn.textContent = "Ajouter au Budget";
            } else {
                expenseType.style.display = 'inline-block';
                if(expenseType.value === 'Conteneur') expenseContainer.style.display = 'block';
                addExpenseBtn.className = 'deleteBtn'; // Rouge
                addExpenseBtn.style.width = "100%";
                addExpenseBtn.textContent = "Valider la Dépense";
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

    // --- 1. AJOUT (ALLOCATION OU DÉPENSE) ---
    addExpenseBtn.addEventListener('click', async () => {
        const montant = parseFloat(expenseAmount.value) || 0;
        const action = actionType ? actionType.value : 'Depense'; // Par défaut 'Depense'

        const data = {
            date: expenseDate.value,
            description: expenseDesc.value,
            montant: montant,
            action: action, 
            type: (action === 'Depense') ? expenseType.value : 'Budget',
            conteneur: (expenseType.value === 'Conteneur' && action === 'Depense') ? expenseContainer.value.toUpperCase() : '',
            isDeleted: false 
        };

        if (!data.date || !data.description || data.montant <= 0) {
            return alert("Veuillez remplir les champs correctement.");
        }

        // SÉCURITÉ BUDGET (Seulement pour les Dépenses)
        if (action === 'Depense') {
            const budgetActuel = calculateCurrentBudget(allExpenses);
            // On peut aussi vérifier le solde global de la caisse si besoin
            // const soldeGlobal = await calculateAvailableBalance(db); 
            
            if (data.montant > budgetActuel) {
                return alert(`BUDGET DÉPENSES INSUFFISANT !\n\nBudget disponible : ${formatCFA(budgetActuel)}\nMontant demandé : ${formatCFA(data.montant)}\n\nDemandez à l'administrateur de recharger le budget.`);
            }
        }

        expensesCollection.add(data).then(() => {
            expenseDesc.value = '';
            expenseAmount.value = '';
            expenseContainer.value = '';
            alert(action === 'Allocation' ? "Budget rechargé !" : "Dépense enregistrée.");
        }).catch(err => console.error(err));
    });

    // --- 2. IMPORT CSV (Admin) ---
    if (uploadCsvBtn) {
        uploadCsvBtn.addEventListener('click', () => {
            if (!csvFile.files.length) return alert("Sélectionnez un fichier.");
            
            Papa.parse(csvFile.files[0], {
                header: true, skipEmptyLines: true,
                complete: async (results) => {
                    const batch = db.batch();
                    let count = 0;
                    
                    results.data.forEach(row => {
                        const date = row.date?.trim();
                        const desc = row.description?.trim();
                        const montant = parseFloat(row.montant);
                        const type = row.type?.trim() || 'Mensuelle'; 
                        const conteneur = row.conteneur?.trim() || '';

                        if (date && desc && !isNaN(montant)) {
                            const docRef = expensesCollection.doc();
                            // Par défaut, un import CSV est considéré comme une Dépense (sortie)
                            batch.set(docRef, {
                                date, description: desc, montant, 
                                type, conteneur, action: 'Depense', 
                                isDeleted: false
                            });
                            count++;
                        }
                    });

                    if (count > 0) await batch.commit();
                    alert(`Succès : ${count} dépenses importées.`);
                    csvFile.value = '';
                }
            });
        });
    }

    // --- 3. CALCUL ET AFFICHAGE ---
    function fetchExpenses() {
        if (unsubscribeExpenses) unsubscribeExpenses();
        let query = expensesCollection;
        
        if (showDeletedCheckbox.checked) {
            query = query.where("isDeleted", "==", true).orderBy("isDeleted");
        } else {
            query = query.where("isDeleted", "!=", true).orderBy("isDeleted");
        }
        
        query = query.orderBy("date", "desc");

        unsubscribeExpenses = query.onSnapshot(snapshot => {
            allExpenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // Mettre à jour le Budget en Haut de page
            if (budgetDisplay) {
                const budget = calculateCurrentBudget(allExpenses);
                budgetDisplay.textContent = formatCFA(budget);
                budgetDisplay.style.color = budget < 0 ? 'red' : '#0d47a1';
            }

            renderExpensesTable();
        }, error => console.error(error));
    }

    function calculateCurrentBudget(expensesList) {
        // Budget = Somme des Allocations - Somme des Dépenses
        let total = 0;
        expensesList.forEach(e => {
            if (e.isDeleted) return;
            
            if (e.action === 'Allocation') {
                total += e.montant;
            } else {
                total -= e.montant;
            }
        });
        return total;
    }

    function renderExpensesTable() {
        const term = expenseSearchInput ? expenseSearchInput.value.toLowerCase().trim() : "";
        
        const filtered = allExpenses.filter(item => {
            if (!term) return true;
            return (item.description || "").toLowerCase().includes(term) ||
                   (item.type || "").toLowerCase().includes(term) ||
                   (item.conteneur || "").toLowerCase().includes(term) ||
                   (item.montant || "").toString().includes(term);
        });

        expenseTableBody.innerHTML = ''; 
        if (filtered.length === 0) {
            expenseTableBody.innerHTML = '<tr><td colspan="6">Aucun résultat.</td></tr>'; return;
        }

        filtered.forEach(expense => {
            const row = document.createElement('tr');
            if (expense.isDeleted === true) row.classList.add('deleted-row');
            
            const isAlloc = expense.action === 'Allocation';
            const colorClass = isAlloc ? 'reste-positif' : 'reste-negatif'; // Vert ou Rouge (défini dans style.css)
            const sign = isAlloc ? '+' : '-';

            let deleteButtonHTML = '';
            if (userRole === 'admin' && expense.isDeleted !== true) {
                deleteButtonHTML = `<button class="deleteBtn" data-id="${expense.id}">Suppr.</button>`;
            }

            row.innerHTML = `
                <td>${expense.date}</td>
                <td>${expense.description}</td>
                <td class="${colorClass}"><b>${sign} ${formatCFA(expense.montant)}</b></td>
                <td>${isAlloc ? 'BUDGET' : expense.type}</td>
                <td>${expense.conteneur || '-'}</td>
                <td>${deleteButtonHTML}</td>
            `;
            expenseTableBody.appendChild(row);
        });
    }
    
    // Listeners
    showDeletedCheckbox.addEventListener('change', fetchExpenses);
    if(expenseSearchInput) expenseSearchInput.addEventListener('input', renderExpensesTable);
    
    fetchExpenses();

    // Suppression
    expenseTableBody.addEventListener('click', (event) => {
        if (event.target.classList.contains('deleteBtn')) {
            if (confirm("Supprimer cette opération ?")) {
                expensesCollection.doc(event.target.getAttribute('data-id')).update({ isDeleted: true }); 
            }
        }
    });

    function formatCFA(n) { return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(n || 0); }
});