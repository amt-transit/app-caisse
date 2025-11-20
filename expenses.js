document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: La connexion à la base de données a échoué.");
        return;
    }

    const expensesCollection = db.collection("expenses");
    
    const addExpenseBtn = document.getElementById('addExpenseBtn');
    const expenseDate = document.getElementById('expenseDate');
    const expenseDesc = document.getElementById('expenseDesc');
    const expenseAmount = document.getElementById('expenseAmount');
    const expenseType = document.getElementById('expenseType');
    const expenseContainer = document.getElementById('expenseContainer');
    
    const expenseTableBody = document.getElementById('expenseTableBody');
    const showDeletedCheckbox = document.getElementById('showDeletedCheckbox');
    const expenseSearchInput = document.getElementById('expenseSearch');
    
    const uploadCsvBtn = document.getElementById('uploadCsvBtn');
    const csvFile = document.getElementById('csvFile');
    const uploadLog = document.getElementById('uploadLog');

    let unsubscribeExpenses = null; 
    let allExpenses = [];

    expenseType.addEventListener('change', () => {
        if (expenseType.value === 'Conteneur') {
            expenseContainer.style.display = 'block';
        } else {
            expenseContainer.style.display = 'none';
        }
    });

    // 1. AJOUT MANUEL (AVEC SÉCURITÉ CAISSE)
    addExpenseBtn.addEventListener('click', async () => {
        const montant = parseFloat(expenseAmount.value) || 0;
        const data = {
            date: expenseDate.value,
            description: expenseDesc.value,
            montant: montant,
            type: expenseType.value,
            conteneur: (expenseType.value === 'Conteneur') ? expenseContainer.value.toUpperCase() : '',
            isDeleted: false 
        };

        if (!data.date || !data.description || data.montant <= 0) {
            return alert("Veuillez remplir la date, la description et un montant valide.");
        }

        addExpenseBtn.disabled = true;
        addExpenseBtn.textContent = "Vérification...";

        try {
            const soldeCaisse = await calculateAvailableBalance(db);
            
            if (data.montant > soldeCaisse) {
                alert(`ERREUR : Solde de caisse insuffisant !\n\nVotre caisse actuelle est de : ${formatCFA(soldeCaisse)}\nVous essayez de sortir : ${formatCFA(data.montant)}\n\nVeuillez d'abord faire un 'Apport' dans 'Autres Entrées'.`);
                return;
            }

            await expensesCollection.add(data);
            
            expenseDesc.value = '';
            expenseAmount.value = '';
            expenseContainer.value = '';
            
        } catch (error) {
            console.error("Erreur : ", error);
            alert("Une erreur est survenue lors de la vérification du solde.");
        } finally {
            addExpenseBtn.disabled = false;
            addExpenseBtn.textContent = "Enregistrer la Dépense";
        }
    });

    // 2. IMPORT CSV
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
                            batch.set(docRef, {
                                date, description: desc, montant, type, conteneur, isDeleted: false
                            });
                            count++;
                        }
                    });

                    if (count > 0) await batch.commit();
                    uploadLog.style.display = 'block';
                    uploadLog.textContent = `Succès : ${count} dépenses importées.`;
                    csvFile.value = '';
                }
            });
        });
    }

    // 3. AFFICHAGE & RECHERCHE (C'EST ICI LA CORRECTION)
    function fetchExpenses() {
        if (unsubscribeExpenses) {
            unsubscribeExpenses();
        }
        let query = expensesCollection;
        
        if (showDeletedCheckbox.checked) {
            // Case cochée : AFFICHER UNIQUEMENT LES SUPPRIMÉS
            // On ajoute orderBy("isDeleted") pour satisfaire Firebase
            query = query.where("isDeleted", "==", true).orderBy("isDeleted");
        } else {
            // Case décochée (défaut) : AFFICHER UNIQUEMENT LES NON-SUPPRIMÉS
            // On ajoute orderBy("isDeleted") pour satisfaire Firebase
            query = query.where("isDeleted", "!=", true).orderBy("isDeleted");
        }
        
        // Tri secondaire par date
        query = query.orderBy("date", "desc"); 

        unsubscribeExpenses = query.onSnapshot(snapshot => {
            // On stocke tout dans la variable locale pour le filtre de recherche
            allExpenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderExpensesTable();
        }, error => console.error("Erreur lecture dépenses: ", error));
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
            expenseTableBody.innerHTML = '<tr><td colspan="6">Aucun résultat.</td></tr>';
            return;
        }

        filtered.forEach(expense => {
            const row = document.createElement('tr');
            
            if (expense.isDeleted === true) {
                row.classList.add('deleted-row');
            }
            
            let deleteButtonHTML = '';
            if (expense.isDeleted !== true) {
                deleteButtonHTML = `<button class="deleteBtn" data-id="${expense.id}">Suppr.</button>`;
            }

            row.innerHTML = `
                <td>${expense.date}</td>
                <td>${expense.description}</td>
                <td>${formatCFA(expense.montant)}</td>
                <td>${expense.type}</td>
                <td>${expense.conteneur || 'N/A'}</td>
                <td>${deleteButtonHTML}</td>
            `;
            expenseTableBody.appendChild(row);
        });
    }
    
    // Listeners
    showDeletedCheckbox.addEventListener('change', fetchExpenses);
    if(expenseSearchInput) expenseSearchInput.addEventListener('input', renderExpensesTable);
    
    // Premier chargement
    fetchExpenses();

    // Suppression
    expenseTableBody.addEventListener('click', (event) => {
        if (event.target.classList.contains('deleteBtn')) {
            const docId = event.target.getAttribute('data-id');
            if (confirm("Confirmer la suppression de cette dépense ? Elle sera archivée.")) {
                expensesCollection.doc(docId).update({ isDeleted: true }); 
            }
        }
    });

    // Fonction utilitaire pour le solde (Copiée pour être autonome)
    async function calculateAvailableBalance(db) {
        const transSnap = await db.collection("transactions").where("isDeleted", "!=", true).get();
        let totalVentes = 0;
        transSnap.forEach(doc => {
            const d = doc.data();
            totalVentes += (d.montantParis || 0) + (d.montantAbidjan || 0);
        });

        const incSnap = await db.collection("other_income").where("isDeleted", "!=", true).get();
        let totalAutres = 0;
        incSnap.forEach(doc => totalAutres += (doc.data().montant || 0));

        const expSnap = await db.collection("expenses").where("isDeleted", "!=", true).get();
        let totalDepenses = 0;
        expSnap.forEach(doc => totalDepenses += (doc.data().montant || 0));

        const bankSnap = await db.collection("bank_movements").where("isDeleted", "!=", true).get();
        let totalRetraits = 0;
        let totalDepots = 0;
        bankSnap.forEach(doc => {
            const d = doc.data();
            if (d.type === 'Retrait') totalRetraits += (d.montant || 0);
            if (d.type === 'Depot') totalDepots += (d.montant || 0);
        });

        return (totalVentes + totalAutres + totalRetraits) - (totalDepenses + totalDepots);
    }

    function formatCFA(number) {
        return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(number || 0);
    }
});