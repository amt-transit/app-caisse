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

    addExpenseBtn.addEventListener('click', () => {
        const data = {
            date: expenseDate.value,
            description: expenseDesc.value,
            montant: parseFloat(expenseAmount.value) || 0,
            type: expenseType.value,
            conteneur: (expenseType.value === 'Conteneur') ? expenseContainer.value.toUpperCase() : '',
            isDeleted: false 
        };

        if (!data.date || !data.description || data.montant <= 0) {
            return alert("Veuillez remplir la date, la description et un montant valide.");
        }

        expensesCollection.add(data)
            .then(() => {
                expenseDesc.value = '';
                expenseAmount.value = '';
                expenseContainer.value = '';
            })
            .catch(err => console.error("Erreur ajout dépense: ", err));
    });

    // NOUVELLE LOGIQUE DANS expenses.js
    function fetchExpenses() {
        if (unsubscribeExpenses) {
            unsubscribeExpenses();
        }
        let query = expensesCollection;
        
        if (showDeletedCheckbox.checked) {
            // Case cochée : AFFICHER UNIQUEMENT LES SUPPRIMÉS
            query = query.where("isDeleted", "==", true).orderBy("isDeleted");
        } else {
            // Case décochée (défaut) : AFFICHER UNIQUEMENT LES NON-SUPPRIMÉS
            query = query.where("isDeleted", "!=", true).orderBy("isDeleted");
        }
        
        query = query.orderBy("date", "desc"); // Tri secondaire

        // ... (le reste de la fonction onSnapshot est inchangé) ...
        unsubscribeExpenses = query.onSnapshot(snapshot => {
            // ... (le reste de votre code)
        }, error => console.error("Erreur lecture dépenses: ", error));
    }
    
    // On écoute la case à cocher
    showDeletedCheckbox.addEventListener('change', fetchExpenses);
    
    // Premier chargement
    fetchExpenses();


    // MODIFICATION : Le bouton met à jour 'isDeleted'
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