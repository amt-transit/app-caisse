document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: La connexion à la base de données a échoué."); return;
    }

    const userRole = sessionStorage.getItem('userRole');
    // CORRECTION : On récupère le nom de l'utilisateur
    const currentUserName = sessionStorage.getItem('userName') || 'Inconnu';

    const incomeCollection = db.collection("other_income"); 
    
    const addIncomeBtn = document.getElementById('addIncomeBtn');
    const incomeDate = document.getElementById('incomeDate');
    const incomeCategory = document.getElementById('incomeCategory');
    const incomeDesc = document.getElementById('incomeDesc');
    const incomeAmount = document.getElementById('incomeAmount');
    
    const incomeTableBody = document.getElementById('incomeTableBody');
    const showDeletedCheckbox = document.getElementById('showDeletedCheckbox');
    const incomeSearchInput = document.getElementById('incomeSearch');

    // Stats Elements
    const statsStartDate = document.getElementById('statsStartDate');
    const statsEndDate = document.getElementById('statsEndDate');
    const totalBeneficeAchatEl = document.getElementById('totalBeneficeAchat');
    const totalVenteMarchandiseEl = document.getElementById('totalVenteMarchandise');
    const totalAutreEl = document.getElementById('totalAutre');

    let unsubscribeIncome = null;
    let allIncome = [];

    // 1. AJOUT MANUEL (AVEC AUTEUR)
    addIncomeBtn.addEventListener('click', () => {
        let finalDesc = incomeDesc.value;
        if (incomeCategory && incomeCategory.value) {
            finalDesc = `${incomeCategory.value} - ${finalDesc}`;
        }

        const data = {
            date: incomeDate.value,
            // AJOUT DU NOM DE L'AUTEUR
            description: `${finalDesc} (${currentUserName})`,
            montant: parseFloat(incomeAmount.value) || 0,
            mode: document.getElementById('incomeMode').value, // <--- AJOUTER CETTE LIGNE
            isDeleted: false
        };
        
        if (!data.date || !incomeDesc.value || data.montant <= 0) {
            return alert("Veuillez remplir la date, la description et un montant valide.");
        }
        
        incomeCollection.add(data).then(() => {
            incomeDesc.value = '';
            if (incomeCategory) incomeCategory.value = '';
            incomeAmount.value = '';
        }).catch(err => console.error(err));
    });

    // 2. AFFICHAGE & RECHERCHE
    function fetchIncome() {
        if (unsubscribeIncome) unsubscribeIncome();
        let query = incomeCollection;
        
        if (showDeletedCheckbox.checked) {
            query = query.where("isDeleted", "==", true).orderBy("isDeleted");
        } else {
            query = query.where("isDeleted", "!=", true).orderBy("isDeleted");
        }
        query = query.orderBy("date", "desc");
        query = query.limit(200); // OPTIMISATION QUOTA

        unsubscribeIncome = query.onSnapshot(snapshot => {
            allIncome = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderIncomeTable();
            updateStats(); // Mettre à jour les stats à chaque changement
        }, error => console.error(error));
    }

    function renderIncomeTable() {
        const term = incomeSearchInput ? incomeSearchInput.value.toLowerCase().trim() : "";
        
        const filtered = allIncome.filter(item => {
            if (!term) return true;
            return (item.description || "").toLowerCase().includes(term);
        });

        // Calcul du total filtré
        const totalFiltered = filtered.reduce((sum, item) => sum + (item.montant || 0), 0);
        
        // Recherche du titre H2 pour afficher le total
        const headers = document.getElementsByTagName('h2');
        for (let h of headers) {
            if (h.textContent.includes("Historique")) {
                h.innerHTML = `Historique des Autres Entrées <span style="margin-left:15px; font-size:0.8em; font-weight:normal;"><span class="tag" style="background:#fff; border:1px solid #ccc; color:#333;">Total</span> : <b style="color:#2975d7;">${formatCFA(totalFiltered)}</b></span>`;
                break;
            }
        }

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
            if ((userRole === 'admin' || userRole === 'super_admin') && income.isDeleted !== true) {
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

    function updateStats() {
        const start = statsStartDate.value;
        const end = statsEndDate.value;

        let totalBen = 0;
        let totalVente = 0;
        let totalAutre = 0;

        allIncome.forEach(inc => {
            if (inc.isDeleted) return;
            if (start && inc.date < start) return;
            if (end && inc.date > end) return;

            const desc = (inc.description || '');
            const montant = inc.montant || 0;

            if (desc.startsWith('Bénéfice sur Achat')) totalBen += montant;
            else if (desc.startsWith('Vente Marchandises')) totalVente += montant;
            else totalAutre += montant;
        });

        if(totalBeneficeAchatEl) totalBeneficeAchatEl.textContent = formatCFA(totalBen);
        if(totalVenteMarchandiseEl) totalVenteMarchandiseEl.textContent = formatCFA(totalVente);
        if(totalAutreEl) totalAutreEl.textContent = formatCFA(totalAutre);
    }

    // Listeners pour les filtres de date
    if(statsStartDate) statsStartDate.addEventListener('change', updateStats);
    if(statsEndDate) statsEndDate.addEventListener('change', updateStats);
    
    showDeletedCheckbox.addEventListener('change', fetchIncome);
    if(incomeSearchInput) incomeSearchInput.addEventListener('input', renderIncomeTable);
    
    fetchIncome();

    // 3. SUPPRESSION
    incomeTableBody.addEventListener('click', (event) => {
        if (event.target.classList.contains('deleteBtn')) {
            const docId = event.target.getAttribute('data-id');
            if (confirm("Confirmer la suppression ? Elle sera archivée.")) {
                incomeCollection.doc(docId).update({ isDeleted: true });
            }
        }
    });

    initBackToTopButton();
});