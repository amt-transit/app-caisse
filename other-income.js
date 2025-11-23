document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: La connexion à la base de données a échoué."); return;
    }

    const userRole = sessionStorage.getItem('userRole');
    const incomeCollection = db.collection("other_income"); 
    
    const addIncomeBtn = document.getElementById('addIncomeBtn');
    const incomeDate = document.getElementById('incomeDate');
    const incomeDesc = document.getElementById('incomeDesc');
    const incomeAmount = document.getElementById('incomeAmount');
    
    const incomeTableBody = document.getElementById('incomeTableBody');
    const showDeletedCheckbox = document.getElementById('showDeletedCheckbox');
    
    const incomeSearchInput = document.getElementById('incomeSearch');
    const uploadCsvBtn = document.getElementById('uploadCsvBtn');
    const csvFile = document.getElementById('csvFile');

    let unsubscribeIncome = null;
    let allIncome = [];

    // 1. AJOUT MANUEL
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

                        if (date && desc && !isNaN(montant)) {
                            const docRef = incomeCollection.doc();
                            batch.set(docRef, {
                                date, description: desc, montant, isDeleted: false
                            });
                            count++;
                        }
                    });

                    if (count > 0) await batch.commit();
                    alert(`Succès : ${count} entrées importées.`);
                    csvFile.value = '';
                }
            });
        });
    }

    // 3. AFFICHAGE & RECHERCHE
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
            allIncome = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderIncomeTable();
        }, error => console.error(error));
    }

    function renderIncomeTable() {
        const term = incomeSearchInput ? incomeSearchInput.value.toLowerCase().trim() : "";
        
        const filtered = allIncome.filter(item => {
            if (!term) return true;
            return (item.description || "").toLowerCase().includes(term);
        });

        incomeTableBody.innerHTML = ''; 
        if (filtered.length === 0) {
            incomeTableBody.innerHTML = '<tr><td colspan="4">Aucun résultat.</td></tr>';
            return;
        }
        
        filtered.forEach(income => {
            const row = document.createElement('tr');
            if (income.isDeleted === true) row.classList.add('deleted-row');
            
            let deleteButtonHTML = '';
            // Seul l'admin peut supprimer
            if (userRole === 'admin' && income.isDeleted !== true) {
                deleteButtonHTML = `<button class="deleteBtn" data-id="${income.id}">Suppr.</button>`;
            }

            row.innerHTML = `
                <td>${income.date}</td>
                <td>${income.description}</td>
                <td>${formatCFA(income.montant)}</td>
                <td>${deleteButtonHTML}</td>
            `;
            incomeTableBody.appendChild(row);
        });
    }
    
    showDeletedCheckbox.addEventListener('change', fetchIncome);
    if(incomeSearchInput) incomeSearchInput.addEventListener('input', renderIncomeTable);
    
    fetchIncome();

    // 4. SUPPRESSION
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