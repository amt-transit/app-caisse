document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: Connexion échouée."); return;
    }

    const bankCollection = db.collection("bank_movements");
    
    const addBankMovementBtn = document.getElementById('addBankMovementBtn');
    const bankDate = document.getElementById('bankDate');
    const bankDesc = document.getElementById('bankDesc');
    const bankAmount = document.getElementById('bankAmount');
    const bankType = document.getElementById('bankType');
    const bankTableBody = document.getElementById('bankTableBody');
    const showDeletedCheckbox = document.getElementById('showDeletedCheckbox');
    const bankSearchInput = document.getElementById('bankSearch');
    const uploadCsvBtn = document.getElementById('uploadCsvBtn');
    const csvFile = document.getElementById('csvFile');

    let unsubscribeBank = null;
    let allBankMovements = [];

    // 1. AJOUT MANUEL (AVEC SÉCURITÉ)
    addBankMovementBtn.addEventListener('click', async () => {
        const montant = parseFloat(bankAmount.value) || 0;
        const type = bankType.value; 
        const data = {
            date: bankDate.value,
            description: bankDesc.value,
            montant: montant,
            type: type,
            isDeleted: false
        };
        if (!data.date || !data.description || data.montant <= 0) return alert("Champs invalides.");

        if (type === 'Depot') {
            addBankMovementBtn.disabled = true; addBankMovementBtn.textContent = "Vérification...";
            try {
                const soldeCaisse = await calculateAvailableBalance(db);
                if (data.montant > soldeCaisse) {
                    alert(`ERREUR : Solde insuffisant (${formatCFA(soldeCaisse)}).`);
                    addBankMovementBtn.disabled = false; addBankMovementBtn.textContent = "Enregistrer";
                    return;
                }
            } catch (e) { console.error(e); }
            addBankMovementBtn.disabled = false; addBankMovementBtn.textContent = "Enregistrer";
        }
        bankCollection.add(data).then(() => { bankDesc.value = ''; bankAmount.value = ''; });
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
                        const type = row.type?.trim();
                        const montant = parseFloat(row.montant);
                        if (date && desc && type && !isNaN(montant)) {
                            const docRef = bankCollection.doc();
                            batch.set(docRef, { date, description: desc, type, montant, isDeleted: false });
                            count++;
                        }
                    });
                    if (count > 0) await batch.commit();
                    alert(`Succès : ${count} mouvements importés.`);
                    csvFile.value = '';
                }
            });
        });
    }

    function fetchBankMovements() {
        if (unsubscribeBank) {
            unsubscribeBank();
        }
        let query = bankCollection;
        
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

        unsubscribeBank = query.onSnapshot(snapshot => {
            // On stocke tout dans la variable locale pour le filtre de recherche
            allBankMovements = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderBankTable();
        }, error => console.error("Erreur lecture dépenses: ", error));
    }

    function renderBankTable() {
        const term = bankSearchInput ? bankSearchInput.value.toLowerCase().trim() : "";
        const filtered = allBankMovements.filter(item => {
            if (!term) return true;
            return (item.description || "").toLowerCase().includes(term) || (item.type || "").toLowerCase().includes(term);
        });

        bankTableBody.innerHTML = '';
        if (filtered.length === 0) {
            bankTableBody.innerHTML = '<tr><td colspan="5">Aucun résultat.</td></tr>';
            return;
        }
        filtered.forEach(move => {
            const row = document.createElement('tr');
            if (move.isDeleted === true) row.classList.add('deleted-row');
            let btn = '';
            if (move.isDeleted !== true) btn = `<button class="deleteBtn" data-id="${move.id}">Suppr.</button>`;
            
            row.innerHTML = `<td>${move.date}</td><td>${move.description}</td><td>${move.type}</td>
                <td class="${move.type === 'Depot' ? 'reste-negatif' : 'reste-positif'}">${move.type === 'Depot' ? '-' : '+'} ${formatCFA(move.montant)}</td>
                <td>${btn}</td>`;
            bankTableBody.appendChild(row);
        });
    }
    
    showDeletedCheckbox.addEventListener('change', fetchBankMovements);
    if(bankSearchInput) bankSearchInput.addEventListener('input', renderBankTable);
    fetchBankMovements();

    bankTableBody.addEventListener('click', (event) => {
        if (event.target.classList.contains('deleteBtn')) {
            if (confirm("Confirmer la suppression ?")) bankCollection.doc(event.target.getAttribute('data-id')).update({ isDeleted: true });
        }
    });

    async function calculateAvailableBalance(db) {
        const trans = await db.collection("transactions").where("isDeleted", "!=", true).get();
        let sales = 0; trans.forEach(d => sales += (d.data().montantParis||0) + (d.data().montantAbidjan||0));
        const inc = await db.collection("other_income").where("isDeleted", "!=", true).get();
        let other = 0; inc.forEach(d => other += (d.data().montant||0));
        const exp = await db.collection("expenses").where("isDeleted", "!=", true).get();
        let out = 0; exp.forEach(d => out += (d.data().montant||0));
        const bank = await db.collection("bank_movements").where("isDeleted", "!=", true).get();
        let w = 0, d = 0; 
        bank.forEach(doc => {
            const da = doc.data();
            if(da.type === 'Retrait') w += da.montant;
            if(da.type === 'Depot') d += da.montant;
        });
        return (sales + other + w) - (out + d);
    }
    
    function formatCFA(n) { return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(n || 0); }
});