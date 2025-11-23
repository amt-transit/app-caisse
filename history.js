document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: La connexion à la base de données a échoué."); return;
    }

    const userRole = sessionStorage.getItem('userRole');
    const transactionsCollection = db.collection("transactions");
    const tableBody = document.getElementById('tableBody');
    
    // Éléments de filtre
    const showDeletedCheckbox = document.getElementById('showDeletedCheckbox');
    const smartSearchInput = document.getElementById('smartSearch'); // NOUVEAU CHAMP UNIQUE
    const agentFilterInput = document.getElementById('agentFilter');
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');

    // Modale
    const modal = document.getElementById('paymentHistoryModal');
    const modalList = document.getElementById('paymentHistoryList');
    const modalTitle = document.getElementById('modalRefTitle');
    const closeModal = document.querySelector('.close-modal'); 

    let unsubscribeHistory = null; 
    let allTransactions = []; 

    // --- GESTION MODALE ---
    if (closeModal) closeModal.onclick = () => modal.style.display = "none";
    window.onclick = (e) => { if (e.target == modal) modal.style.display = "none"; };

    // --- GESTION DES CLICS TABLEAU ---
    tableBody.addEventListener('click', (event) => {
        const target = event.target;
        const row = target.closest('tr');

        // Supprimer
        if (target.classList.contains('deleteBtn')) {
            if (confirm("Confirmer la suppression ?")) {
                transactionsCollection.doc(target.dataset.id).update({ isDeleted: true });
            }
            return;
        }
        // Modifier
        if (target.classList.contains('editBtn')) {
            const oldPrice = parseFloat(target.dataset.prix);
            const newPriceStr = prompt("Nouveau PRIX :", oldPrice);
            if (newPriceStr === null) return;
            const newPrice = parseFloat(newPriceStr);
            if (isNaN(newPrice) || newPrice <= 0) return alert("Prix invalide.");
            
            const paris = parseFloat(target.dataset.paris);
            const abidjan = parseFloat(target.dataset.abidjan);
            const newReste = (paris + abidjan) - newPrice;

            transactionsCollection.doc(target.dataset.id).update({ prix: newPrice, reste: newReste })
                .then(() => alert("Modifié !")).catch(() => alert("Erreur."));
            return;
        }
        // Ouvrir Modale
        if (row && row.dataset.id) {
            const transaction = allTransactions.find(t => t.id === row.dataset.id);
            if (transaction) openPaymentModal(transaction);
        }
    });

    function openPaymentModal(data) {
        modalTitle.textContent = `${data.reference} - ${data.nom || 'Client'}`;
        modalList.innerHTML = '';
        if (data.paymentHistory && data.paymentHistory.length > 0) {
            data.paymentHistory.forEach(pay => {
                let amounts = [];
                if(pay.montantParis > 0) amounts.push(`<span style="color:blue">Paris: ${formatCFA(pay.montantParis)}</span>`);
                if(pay.montantAbidjan > 0) amounts.push(`<span style="color:orange">Abidjan: ${formatCFA(pay.montantAbidjan)}</span>`);
                const li = document.createElement('li');
                // On prépare le badge du mode de paiement (s'il existe)
                const modeBadge = pay.modePaiement ? `<span class="tag" style="background:#6c757d; font-size:10px; margin-right:5px;">${pay.modePaiement}</span>` : '';

                // On l'ajoute dans la ligne HTML
                li.innerHTML = `
                    <span style="font-weight:bold; min-width: 90px;">${pay.date}</span>
                    <span style="flex-grow:1; margin: 0 10px;">
                        ${modeBadge} 
                        ${amounts.join(' + ')}
                    </span>
                    <span style="font-size:0.85em; color:#666">${pay.agent || '-'}</span>
                `;
                modalList.appendChild(li);
            });
        } else {
            modalList.innerHTML = `<li style="color:gray; font-style:italic; justify-content:center;">Pas de détails historiques.</li><li style="justify-content: space-around;"><span>Total Paris: <b style="color:blue">${formatCFA(data.montantParis)}</b></span><span>Total Abidjan: <b style="color:orange">${formatCFA(data.montantAbidjan)}</b></span></li>`;
        }
        modal.style.display = "block";
    }

    // --- RÉCUPÉRATION DONNÉES ---
    function fetchHistory() {
        if (unsubscribeHistory) unsubscribeHistory();
        let query = transactionsCollection;
        if (showDeletedCheckbox.checked) {
             query = query.where("isDeleted", "==", true).orderBy("isDeleted");
        } else {
             query = query.where("isDeleted", "!=", true).orderBy("isDeleted");
        }
        query = query.orderBy("date", "desc"); 

        unsubscribeHistory = query.onSnapshot(snapshot => {
            allTransactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            applyFiltersAndRender(); 
        }, error => console.error("Erreur Firestore: ", error));
    }

    // --- FILTRAGE INTELLIGENT (C'EST ICI QUE ÇA SE PASSE) ---
    function applyFiltersAndRender() {
        // 1. Nettoyage du terme de recherche
        const searchTerm = smartSearchInput.value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        const agentTerm = agentFilterInput.value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;

        const filteredTransactions = allTransactions.filter(data => {
            // Filtres Date & Agent (inchangés)
            if (startDate && data.date < startDate) return false;
            if (endDate && data.date > endDate) return false;
            if (agentTerm) {
                const agents = (data.agent || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                if (!agents.includes(agentTerm)) return false;
            }

            // === LOGIQUE DE RECHERCHE INTELLIGENTE ===
            if (searchTerm) {
                const ref = (data.reference || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const nom = (data.nom || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const conteneur = (data.conteneur || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                
                // Cas 1 : Recherche par "Terminaison" (ex: "D43")
                // Si le terme est court (ex: 3 lettres) et commence par "D" suivi de chiffres, on priorise la fin de la référence
                const isTerminaison = /^d\d+$/.test(searchTerm); // Regex: commence par d, suivi de chiffres
                
                if (isTerminaison) {
                    // Si ça ressemble à une terminaison, on cherche SI la réf finit par ça OU si le conteneur est ça
                    if (!ref.endsWith(searchTerm) && !conteneur.includes(searchTerm)) {
                        return false;
                    }
                } else {
                    // Cas 2 : Recherche Standard (Nom, Réf complète, Conteneur)
                    if (!ref.includes(searchTerm) && !nom.includes(searchTerm) && !conteneur.includes(searchTerm)) {
                        return false;
                    }
                }
            }
            return true;
        });
        
        renderTable(filteredTransactions);
    }

    function renderTable(transactions) {
        tableBody.innerHTML = ''; 
        if (transactions.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="12">Aucun résultat.</td></tr>';
            return;
        }
        let currentSubtotals = { prix: 0, montantParis: 0, montantAbidjan: 0, reste: 0 };
        let currentDate = transactions.find(t => t.date)?.date; 
        
        transactions.forEach((data) => {
            if (data.date !== currentDate && data.date) {
                insertSubtotalRow(currentDate, currentSubtotals);
                currentDate = data.date;
                currentSubtotals = { prix: 0, montantParis: 0, montantAbidjan: 0, reste: 0 };
            }
            if (data.isDeleted !== true) {
                currentSubtotals.prix += (data.prix || 0);
                currentSubtotals.montantParis += (data.montantParis || 0);
                currentSubtotals.montantAbidjan += (data.montantAbidjan || 0);
                currentSubtotals.reste += (data.reste || 0);
            }
            insertDataRow(data);
        });
        insertSubtotalRow(currentDate, currentSubtotals);
    }

    // Listeners
    showDeletedCheckbox.addEventListener('change', fetchHistory); 
    smartSearchInput.addEventListener('input', applyFiltersAndRender); // Écoute la frappe
    agentFilterInput.addEventListener('change', applyFiltersAndRender);
    startDateInput.addEventListener('change', applyFiltersAndRender);
    endDateInput.addEventListener('change', applyFiltersAndRender);
    
    fetchHistory(); 

    // Utilitaires
    function insertDataRow(data) {
        const newRow = document.createElement('tr');
        newRow.dataset.id = data.id; 
        newRow.style.cursor = "pointer";
        if (data.isDeleted === true) newRow.classList.add('deleted-row');
        
        const reste_class = (data.reste || 0) < 0 ? 'reste-negatif' : 'reste-positif';
        const agentString = data.agent || "";
        const agents = agentString.split(',').map(a => a.trim()).filter(a => a.length > 0);
        const agentTagsHTML = agents.map(agent => `<span class="tag ${textToClassName(agent)}">${agent}</span>`).join(' '); 
        
        let btns = '';
        if (userRole === 'admin' && data.isDeleted !== true) {
            btns += `<button class="editBtn" data-id="${data.id}" data-prix="${data.prix||0}" data-paris="${data.montantParis||0}" data-abidjan="${data.montantAbidjan||0}" style="background-color:#007bff; margin-right:5px;">Modif.</button>`;
        }
        if ((userRole === 'admin' || userRole === 'saisie_full') && data.isDeleted !== true) {
            btns += `<button class="deleteBtn" data-id="${data.id}">Suppr.</button>`;
        }
        
        newRow.innerHTML = `
            <td>${data.date || 'En attente'}</td><td>${data.reference}</td><td>${data.nom || ''}</td><td>${data.conteneur || ''}</td>
            <td>${formatCFA(data.prix)}</td><td>${formatCFA(data.montantParis)}</td><td>${formatCFA(data.montantAbidjan)}</td>
            <td><span class="tag ${textToClassName(data.agentMobileMoney)}">${data.agentMobileMoney || ''}</span></td>
            <td class="${reste_class}">${formatCFA(data.reste)}</td>
            <td><span class="tag ${textToClassName(data.commune)}">${data.commune || ''}</span></td>
            <td>${agentTagsHTML}</td><td style="min-width: 100px;">${btns}</td>`;
        tableBody.appendChild(newRow);
    }

    function insertSubtotalRow(date, totals) {
        const subtotalRow = document.createElement('tr');
        subtotalRow.className = 'subtotal-row';
        subtotalRow.innerHTML = `<td>${date || 'TOTAL'}</td><td colspan="3" style="text-align: right;">TOTAL</td><td>${formatCFA(totals.prix)}</td><td>${formatCFA(totals.montantParis)}</td><td>${formatCFA(totals.montantAbidjan)}</td><td></td><td>${formatCFA(totals.reste)}</td><td colspan="3"></td>`;
        tableBody.appendChild(subtotalRow);
    }
    
    function formatCFA(n) { return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(n || 0); }
    function textToClassName(t) { return t ? t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-') : ''; }
});