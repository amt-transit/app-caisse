document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: La connexion à la base de données a échoué."); return;
    }

    const bankCollection = db.collection("bank_movements"); // Nouvelle collection
    
    // Formulaire
    const addBankMovementBtn = document.getElementById('addBankMovementBtn');
    const bankDate = document.getElementById('bankDate');
    const bankDesc = document.getElementById('bankDesc');
    const bankAmount = document.getElementById('bankAmount');
    const bankType = document.getElementById('bankType');
    
    // Tableau
    const bankTableBody = document.getElementById('bankTableBody');
    const showDeletedCheckbox = document.getElementById('showDeletedCheckbox');
    let unsubscribeBank = null;

    // Ajouter un mouvement
    addBankMovementBtn.addEventListener('click', () => {
        const data = {
            date: bankDate.value,
            description: bankDesc.value,
            montant: parseFloat(bankAmount.value) || 0,
            type: bankType.value, // Depot ou Retrait
            isDeleted: false
        };
        if (!data.date || !data.description || data.montant <= 0) {
            return alert("Veuillez remplir tous les champs avec un montant valide.");
        }
        bankCollection.add(data).then(() => {
            bankDesc.value = '';
            bankAmount.value = '';
        }).catch(err => console.error(err));
    });

    // Charger les données
    function fetchBankMovements() {
        if (unsubscribeBank) unsubscribeBank();
        let query = bankCollection;
        
        if (showDeletedCheckbox.checked) {
            query = query.where("isDeleted", "==", true).orderBy("isDeleted");
        } else {
            query = query.where("isDeleted", "!=", true).orderBy("isDeleted");
        }
        query = query.orderBy("date", "desc");

        unsubscribeBank = query.onSnapshot(snapshot => {
            bankTableBody.innerHTML = ''; 
            if (snapshot.empty) {
                bankTableBody.innerHTML = '<tr><td colspan="5">Aucun mouvement enregistré.</td></tr>';
                return;
            }
            snapshot.forEach(doc => {
                const move = doc.data();
                const row = document.createElement('tr');
                if (move.isDeleted === true) row.classList.add('deleted-row');
                
                let deleteButtonHTML = '';
                if (move.isDeleted !== true) {
                    deleteButtonHTML = `<button class="deleteBtn" data-id="${doc.id}">Suppr.</button>`;
                }

                row.innerHTML = `
                    <td>${move.date}</td>
                    <td>${move.description}</td>
                    <td>${move.type}</td>
                    <td class="${move.type === 'Depot' ? 'reste-negatif' : 'reste-positif'}">
                        ${move.type === 'Depot' ? '-' : '+'} ${formatCFA(move.montant)}
                    </td>
                    <td>${deleteButtonHTML}</td>
                `;
                bankTableBody.appendChild(row);
            });
        }, error => console.error(error));
    }
    
    showDeletedCheckbox.addEventListener('change', fetchBankMovements);
    fetchBankMovements(); // Premier chargement

    // Supprimer (soft delete)
    bankTableBody.addEventListener('click', (event) => {
        if (event.target.classList.contains('deleteBtn')) {
            const docId = event.target.getAttribute('data-id');
            if (confirm("Confirmer la suppression ? Elle sera archivée.")) {
                bankCollection.doc(docId).update({ isDeleted: true });
            }
        }
    });

    function formatCFA(number) {
        return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(number || 0);
    }
});