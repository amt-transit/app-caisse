document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: La connexion à la base de données a échoué."); return;
    }

    const incomeCollection = db.collection("other_income"); // Nouvelle collection
    
    // Formulaire
    const addIncomeBtn = document.getElementById('addIncomeBtn');
    const incomeDate = document.getElementById('incomeDate');
    const incomeDesc = document.getElementById('incomeDesc');
    const incomeAmount = document.getElementById('incomeAmount');
    
    // Tableau
    const incomeTableBody = document.getElementById('incomeTableBody');
    const showDeletedCheckbox = document.getElementById('showDeletedCheckbox');
    let unsubscribeIncome = null;

    // Ajouter une entrée
    addIncomeBtn.addEventListener('click', () => {
        const data = {
            date: incomeDate.value,
            description: incomeDesc.value,
            montant: parseFloat(incomeAmount.value) || 0,
            isDeleted: false
        };
        if (!data.date || !data.description || data.montant <= 0) {
            return alert("Veuillez remplir la date, la description et un montant valide.");
        }
        incomeCollection.add(data).then(() => {
            incomeDesc.value = '';
            incomeAmount.value = '';
        }).catch(err => console.error(err));
    });

    // Charger les données
    function fetchIncome() {
        if (unsubscribeIncome) unsubscribeIncome();
        let query = incomeCollection;
        
        if (showDeletedCheckbox.checked) {
            query = query.where("isDeleted", "==", true).orderBy("isDeleted");
        } else {
            query = query.where("isDeleted", "!=", true).orderBy("isDeleted");
        }
        query = query.orderBy("date", "desc");

        unsubscribeIncome = query.onSnapshot(snapshot => {
            incomeTableBody.innerHTML = ''; 
            if (snapshot.empty) {
                incomeTableBody.innerHTML = '<tr><td colspan="4">Aucune entrée enregistrée.</td></tr>';
                return;
            }
            snapshot.forEach(doc => {
                const income = doc.data();
                const row = document.createElement('tr');
                if (income.isDeleted === true) row.classList.add('deleted-row');
                
                let deleteButtonHTML = '';
                if (income.isDeleted !== true) {
                    deleteButtonHTML = `<button class="deleteBtn" data-id="${doc.id}">Suppr.</button>`;
                }

                row.innerHTML = `
                    <td>${income.date}</td>
                    <td>${income.description}</td>
                    <td>${formatCFA(income.montant)}</td>
                    <td>${deleteButtonHTML}</td>
                `;
                incomeTableBody.appendChild(row);
            });
        }, error => console.error(error));
    }
    
    showDeletedCheckbox.addEventListener('change', fetchIncome);
    fetchIncome(); // Premier chargement

    // Supprimer (soft delete)
    incomeTableBody.addEventListener('click', (event) => {
        if (event.target.classList.contains('deleteBtn')) {
            const docId = event.target.getAttribute('data-id');
            if (confirm("Confirmer la suppression ? Elle sera archivée.")) {
                incomeCollection.doc(docId).update({ isDeleted: true });
            }
        }
    });

    function formatCFA(number) {
        return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(number || 0);
    }
});