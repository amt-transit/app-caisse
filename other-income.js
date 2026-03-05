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

    // --- INJECTION FILTRE MOIS (Remplacement des dates) ---
    const tableContainer = document.querySelector('#incomeTableBody')?.closest('table');
    if (tableContainer && tableContainer.parentNode) {
        // Masquer les anciens filtres s'ils existent
        ['statsStartDate', 'statsEndDate'].forEach(id => {
            const el = document.getElementById(id);
            if (el && el.parentElement) el.parentElement.style.display = 'none';
        });

        let incomeStatsControls = document.getElementById('incomeStatsControls');
        if (!incomeStatsControls) {
            incomeStatsControls = document.createElement('div');
            incomeStatsControls.id = 'incomeStatsControls';
            incomeStatsControls.style.cssText = "margin-bottom: 10px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;";
            
            const now = new Date();
            const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

            incomeStatsControls.innerHTML = `
                <div style="display:flex; align-items:center; gap:5px; background:#fff; padding:5px 10px; border:1px solid #e2e8f0; border-radius:8px; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
                    <span style="font-size:0.9em; font-weight:600; color:#64748b;">📅 Période :</span>
                    <input type="month" id="incomeStatsMonthFilter" value="${defaultMonth}" style="border:none; outline:none; font-family:inherit; color:#334155; background:transparent; cursor:pointer;">
                    <button id="clearIncomeStatsFilter" title="Tout voir" style="margin-left:5px; border:none; background:#f1f5f9; color:#64748b; border-radius:4px; padding:2px 6px; cursor:pointer; font-size:0.8em;">✖</button>
                </div>
            `;
            tableContainer.parentNode.insertBefore(incomeStatsControls, tableContainer);

            setTimeout(() => {
                const monthInput = document.getElementById('incomeStatsMonthFilter');
                const clearBtn = document.getElementById('clearIncomeStatsFilter');
                if (monthInput) monthInput.addEventListener('change', () => { renderIncomeTable(); updateStats(); });
                if (clearBtn) clearBtn.addEventListener('click', () => {
                    if(monthInput) monthInput.value = '';
                    renderIncomeTable();
                    updateStats();
                });
            }, 0);
        }
    }

    // Stats Elements
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
        const monthFilter = document.getElementById('incomeStatsMonthFilter')?.value;
        
        const filtered = allIncome.filter(item => {
            if (monthFilter && !item.date.startsWith(monthFilter)) return false;
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
            
            // --- AJOUT : Couleur de fond selon la catégorie (Pastel très clair) ---
            if (income.isDeleted !== true) {
                const desc = (income.description || '').toLowerCase();
                if (desc.includes('bénéfice') || desc.includes('benefice')) row.style.backgroundColor = '#ecfdf5'; // Vert très clair
                else if (desc.includes('vente')) row.style.backgroundColor = '#eff6ff'; // Bleu très clair
                else row.style.backgroundColor = '#f8fafc'; // Gris très clair
            }
            
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
        const monthFilter = document.getElementById('incomeStatsMonthFilter')?.value;

        let totalBen = 0;
        let totalVente = 0;
        let totalAutre = 0;

        allIncome.forEach(inc => {
            if (inc.isDeleted) return;
            if (monthFilter && !inc.date.startsWith(monthFilter)) return;

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