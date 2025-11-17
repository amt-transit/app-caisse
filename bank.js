document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: Connexion BDD échouée."); return;
    }

    const bankCollection = db.collection("bank_movements");
    
    const addBankMovementBtn = document.getElementById('addBankMovementBtn');
    const bankDate = document.getElementById('bankDate');
    const bankDesc = document.getElementById('bankDesc');
    const bankAmount = document.getElementById('bankAmount');
    const bankType = document.getElementById('bankType');
    
    const bankTableBody = document.getElementById('bankTableBody');
    const showDeletedCheckbox = document.getElementById('showDeletedCheckbox');
    let unsubscribeBank = null;

    addBankMovementBtn.addEventListener('click', async () => {
        const montant = parseFloat(bankAmount.value) || 0;
        const type = bankType.value; // Depot ou Retrait

        const data = {
            date: bankDate.value,
            description: bankDesc.value,
            montant: montant,
            type: type,
            isDeleted: false
        };

        if (!data.date || !data.description || data.montant <= 0) {
            return alert("Veuillez remplir tous les champs avec un montant valide.");
        }

        // === SÉCURITÉ : SI C'EST UN DÉPÔT (Sortie de caisse), VÉRIFIER LE SOLDE ===
        if (type === 'Depot') {
            addBankMovementBtn.disabled = true;
            addBankMovementBtn.textContent = "Vérification...";

            try {
                const soldeCaisse = await calculateAvailableBalance(db);
                
                if (data.montant > soldeCaisse) {
                    alert(`ERREUR : Solde de caisse insuffisant pour ce dépôt !\n\nVotre caisse actuelle est de : ${formatCFA(soldeCaisse)}\nVous essayez de déposer : ${formatCFA(data.montant)}\n\nVeuillez vérifier vos saisies.`);
                    addBankMovementBtn.disabled = false;
                    addBankMovementBtn.textContent = "Enregistrer le Mouvement";
                    return;
                }
            } catch (error) {
                console.error("Erreur : ", error);
                alert("Erreur lors de la vérification du solde.");
                addBankMovementBtn.disabled = false;
                addBankMovementBtn.textContent = "Enregistrer le Mouvement";
                return;
            }
        }

        // Enregistrement
        bankCollection.add(data).then(() => {
            bankDesc.value = '';
            bankAmount.value = '';
            addBankMovementBtn.disabled = false;
            addBankMovementBtn.textContent = "Enregistrer le Mouvement";
        }).catch(err => console.error(err));
    });

    // --- Fonction utilitaire (Même fonction que dans expenses.js) ---
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

    // --- Affichage (inchangé) ---
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
    fetchBankMovements();

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
