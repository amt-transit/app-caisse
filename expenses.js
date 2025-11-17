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
    let unsubscribeExpenses = null; 

    expenseType.addEventListener('change', () => {
        if (expenseType.value === 'Conteneur') {
            expenseContainer.style.display = 'block';
        } else {
            expenseContainer.style.display = 'none';
        }
    });

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

        // === SÉCURITÉ : VÉRIFIER LE SOLDE DE CAISSE ===
        addExpenseBtn.disabled = true; // Désactiver le bouton pendant le calcul
        addExpenseBtn.textContent = "Vérification...";

        try {
            const soldeCaisse = await calculateAvailableBalance(db);
            
            if (data.montant > soldeCaisse) {
                alert(`ERREUR : Solde de caisse insuffisant !\n\nVotre caisse actuelle est de : ${formatCFA(soldeCaisse)}\nVous essayez de sortir : ${formatCFA(data.montant)}\n\nVeuillez d'abord faire un 'Apport' dans 'Autres Entrées'.`);
                addExpenseBtn.disabled = false;
                addExpenseBtn.textContent = "Enregistrer la Dépense";
                return;
            }

            // Si le solde est suffisant, on enregistre
            await expensesCollection.add(data);
            
            // Reset du formulaire
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

    // --- Fonction utilitaire pour calculer le solde en temps réel ---
    async function calculateAvailableBalance(db) {
        // 1. Ventes (Transactions)
        const transSnap = await db.collection("transactions").where("isDeleted", "!=", true).get();
        let totalVentes = 0;
        transSnap.forEach(doc => {
            const d = doc.data();
            totalVentes += (d.montantParis || 0) + (d.montantAbidjan || 0);
        });

        // 2. Autres Entrées
        const incSnap = await db.collection("other_income").where("isDeleted", "!=", true).get();
        let totalAutres = 0;
        incSnap.forEach(doc => totalAutres += (doc.data().montant || 0));

        // 3. Dépenses
        const expSnap = await db.collection("expenses").where("isDeleted", "!=", true).get();
        let totalDepenses = 0;
        expSnap.forEach(doc => totalDepenses += (doc.data().montant || 0));

        // 4. Banque
        const bankSnap = await db.collection("bank_movements").where("isDeleted", "!=", true).get();
        let totalRetraits = 0;
        let totalDepots = 0;
        bankSnap.forEach(doc => {
            const d = doc.data();
            if (d.type === 'Retrait') totalRetraits += (d.montant || 0);
            if (d.type === 'Depot') totalDepots += (d.montant || 0);
        });

        // Calcul : (Entrées) - (Sorties)
        return (totalVentes + totalAutres + totalRetraits) - (totalDepenses + totalDepots);
    }

    // --- Affichage (inchangé) ---
    function fetchExpenses() {
        if (unsubscribeExpenses) {
            unsubscribeExpenses();
        }
        let query = expensesCollection;
        
        if (showDeletedCheckbox.checked) {
            query = query.where("isDeleted", "==", true).orderBy("isDeleted");
        } else {
            query = query.where("isDeleted", "!=", true).orderBy("isDeleted");
        }
        
        query = query.orderBy("date", "desc"); 

        unsubscribeExpenses = query.onSnapshot(snapshot => {
            expenseTableBody.innerHTML = ''; 
            if (snapshot.empty) {
                expenseTableBody.innerHTML = '<tr><td colspan="6">Aucune dépense trouvée.</td></tr>';
                return;
            }

            snapshot.forEach(doc => {
                const expense = doc.data();
                const row = document.createElement('tr');
                
                if (expense.isDeleted === true) {
                    row.classList.add('deleted-row');
                }
                
                let deleteButtonHTML = '';
                if (expense.isDeleted !== true) {
                    deleteButtonHTML = `<button class="deleteBtn" data-id="${doc.id}">Suppr.</button>`;
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
        }, error => console.error("Erreur lecture dépenses: ", error));
    }
    
    showDeletedCheckbox.addEventListener('change', fetchExpenses);
    fetchExpenses();

    expenseTableBody.addEventListener('click', (event) => {
        if (event.target.classList.contains('deleteBtn')) {
            const docId = event.target.getAttribute('data-id');
            if (confirm("Confirmer la suppression de cette dépense ? Elle sera archivée.")) {
                expensesCollection.doc(docId).update({ isDeleted: true }); 
            }
        }
    });

    function formatCFA(number) {
        return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(number || 0);
    }
});
