document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: La connexion à la base de données a échoué.");
        return;
    }

    // Nouvelle collection Firestore
    const expensesCollection = db.collection("expenses");
    
    // Éléments du formulaire
    const addExpenseBtn = document.getElementById('addExpenseBtn');
    const expenseDate = document.getElementById('expenseDate');
    const expenseDesc = document.getElementById('expenseDesc');
    const expenseAmount = document.getElementById('expenseAmount');
    const expenseType = document.getElementById('expenseType');
    const expenseContainer = document.getElementById('expenseContainer');
    
    // Éléments du tableau
    const expenseTableBody = document.getElementById('expenseTableBody');

    // Logique pour afficher/cacher le champ "Conteneur"
    expenseType.addEventListener('change', () => {
        if (expenseType.value === 'Conteneur') {
            expenseContainer.style.display = 'block';
        } else {
            expenseContainer.style.display = 'none';
        }
    });

    // AJOUTER UNE DÉPENSE
    addExpenseBtn.addEventListener('click', () => {
        const data = {
            date: expenseDate.value,
            description: expenseDesc.value,
            montant: parseFloat(expenseAmount.value) || 0,
            type: expenseType.value,
            conteneur: (expenseType.value === 'Conteneur') ? expenseContainer.value.toUpperCase() : ''
        };

        if (!data.date || !data.description || data.montant <= 0) {
            return alert("Veuillez remplir la date, la description et un montant valide.");
        }

        expensesCollection.add(data)
            .then(() => {
                // Réinitialiser le formulaire
                expenseDesc.value = '';
                expenseAmount.value = '';
                expenseContainer.value = '';
            })
            .catch(err => console.error("Erreur ajout dépense: ", err));
    });

    // AFFICHER LES DÉPENSES
    expensesCollection.orderBy("date", "desc").onSnapshot(snapshot => {
        expenseTableBody.innerHTML = ''; // Vider le tableau
        if (snapshot.empty) {
            expenseTableBody.innerHTML = '<tr><td colspan="6">Aucune dépense enregistrée.</td></tr>';
            return;
        }

        snapshot.forEach(doc => {
            const expense = doc.data();
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${expense.date}</td>
                <td>${expense.description}</td>
                <td>${formatCFA(expense.montant)}</td>
                <td>${expense.type}</td>
                <td>${expense.conteneur || 'N/A'}</td>
                <td><button class="deleteBtn" data-id="${doc.id}">Suppr.</button></td>
            `;
            expenseTableBody.appendChild(row);
        });
    }, error => console.error("Erreur lecture dépenses: ", error));

    // SUPPRIMER UNE DÉPENSE
    expenseTableBody.addEventListener('click', (event) => {
        if (event.target.classList.contains('deleteBtn')) {
            const docId = event.target.getAttribute('data-id');
            if (confirm("Confirmer la suppression de cette dépense ?")) {
                expensesCollection.doc(docId).delete();
            }
        }
    });

    // Fonction utilitaire
    function formatCFA(number) {
        return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(number);
    }
});