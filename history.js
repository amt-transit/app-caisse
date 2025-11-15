document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: La connexion à la base de données a échoué.");
        return;
    }

    // Références aux éléments UI
    const userRole = sessionStorage.getItem('userRole');
    const transactionsCollection = db.collection("transactions");
    const tableBody = document.getElementById('tableBody');
    const showDeletedCheckbox = document.getElementById('showDeletedCheckbox');
    const masterSearchInput = document.getElementById('masterSearch');
    
    // [CORRECTION 2] : Utilise le nouvel ID
    const containerSearchInput = document.getElementById('containerSearch'); 

    let unsubscribeHistory = null; 
    let allTransactions = []; 

    // --- LOGIQUE DE SUPPRESSION (SOFT DELETE) ---
    tableBody.addEventListener('click', (event) => {
        if (event.target.classList.contains('deleteBtn')) {
            const docId = event.target.getAttribute('data-id');
            if (confirm("Confirmer la suppression de cette entrée ? Elle sera archivée.")) {
                transactionsCollection.doc(docId).update({ isDeleted: true });
            }
        }
    });

    // --- ÉTAPE 1 : RÉCUPÉRER LES DONNÉES DE FIREBASE ---
    
    // [CORRECTION 1] : Logique de la checkbox mise à jour
    function fetchHistory() {
        if (unsubscribeHistory) {
            unsubscribeHistory(); 
        }

        let query = transactionsCollection;

        if (showDeletedCheckbox.checked) {
            // Case cochée : AFFICHER UNIQUEMENT LES SUPPRIMÉS
             query = query.where("isDeleted", "==", true).orderBy("isDeleted");
        } else {
            // Case décochée (défaut) : AFFICHER UNIQUEMENT LES NON-SUPPRIMÉS
             query = query.where("isDeleted", "!=", true).orderBy("isDeleted");
        }
        
        query = query.orderBy("date", "desc"); // Tri secondaire par date

        unsubscribeHistory = query.onSnapshot(snapshot => {
            allTransactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            applyFiltersAndRender();
        }, error => console.error("Erreur Firestore: ", error));
    }

    // --- ÉTAPE 2 : FILTRER ET AFFICHER (CÔTÉ CLIENT) ---
    function applyFiltersAndRender() {
        const masterTerm = masterSearchInput.value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        
        // [CORRECTION 2] : Logique de recherche mise à jour
        const containerTerm = containerSearchInput.value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        const filteredTransactions = allTransactions.filter(data => {
            
            // Filtre A : Conteneur (filtre exact)
            if (containerTerm) {
                const conteneur = (data.conteneur || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                // Doit être égal (D20 ne trouvera pas D2)
                if (conteneur !== containerTerm) {
                    return false;
                }
            }

            // Filtre B : Recherche générale
            if (masterTerm) {
                const ref = (data.reference || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const agentMM = (data.agentMobileMoney || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const commune = (data.commune || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const agents = (data.agent || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

                // (Note: J'ai enlevé la recherche 'conteneur' d'ici pour éviter les conflits)
                if (!ref.includes(masterTerm) &&
                    !agentMM.includes(masterTerm) &&
                    !commune.includes(masterTerm) &&
                    !agents.includes(masterTerm)) 
                {
                    return false;
                }
            }
            return true;
        });
        
        renderTable(filteredTransactions);
    }

    // --- ÉTAPE 3 : RENDER TABLE (inchangé) ---
    function renderTable(transactions) {
        tableBody.innerHTML = ''; 
        if (transactions.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="12">Aucun historique trouvé (ou correspondant aux filtres).</td></tr>';
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

    // --- ÉTAPE 4 : CONNECTER LES ÉVÉNEMENTS ---
    showDeletedCheckbox.addEventListener('change', fetchHistory); 
    masterSearchInput.addEventListener('input', applyFiltersAndRender); 
    
    // [CORRECTION 2] : Utilise le nouvel ID
    containerSearchInput.addEventListener('input', applyFiltersAndRender); 
    
    // Lancement initial
    fetchHistory();


    // --- Fonctions utilitaires (inchangées) ---
    function insertDataRow(data) {
        const newRow = document.createElement('tr');
        if (data.isDeleted === true) {
            newRow.classList.add('deleted-row');
        }
        const reste_class = (data.reste || 0) < 0 ? 'reste-negatif' : 'reste-positif';
        const agentString = data.agent || "";
        const agents = agentString.split(',').map(a => a.trim()).filter(a => a.length > 0);
        const agentTagsHTML = agents.map(agent => G    `<span class="tag ${textToClassName(agent)}">${agent}</span>`
        ).join(' '); 
        let deleteButtonHTML = '';
        if ((userRole === 'admin' || userRole === 'saisie_full') && data.isDeleted !== true) {
            deleteButtonHTML = `<button class="deleteBtn" data-id="${data.id}">Suppr.</button>`;
        }
        newRow.innerHTML = `
            <td>${data.date || 'En attente'}</td>
            <td>${data.reference}</td>
            <td>${data.nom || ''}</td>
            <td>${data.conteneur || ''}</td>
            <td>${formatCFA(data.prix)}</td>
            <td>${formatCFA(data.montantParis)}</td>
            <td>${formatCFA(data.montantAbidjan)}</td>
            <td><span class="tag ${textToClassName(data.agentMobileMoney)}">${data.agentMobileMoney || ''}</span></td>
            <td class="${reste_class}">${formatCFA(data.reste)}</td>
            <td><span class="tag ${textToClassName(data.commune)}">${data.commune || ''}</span></td>
            <td>${agentTagsHTML}</td>
            <td>${deleteButtonHTML}</td>`;
        tableBody.appendChild(newRow);
    }
    function insertSubtotalRow(date, totals) {
        const subtotalRow = document.createElement('tr');
        subtotalRow.className = 'subtotal-row';
        subtotalRow.innerHTML = `
            <td>${date || 'TOTAL EN ATTENTE'}</td>
            <td colspan="3" style="text-align: right;">TOTAL</td>
            <td>${formatCFA(totals.prix)}</td>
            <td>${formatCFA(totals.montantParis)}</td>
            <td>${formatCFA(totals.montantAbidjan)}</td>
            <td></td>
            <td>${formatCFA(totals.reste)}</td>
            <td colspan="3"></td>`;
        tableBody.appendChild(subtotalRow);
    }
    function formatCFA(number) {
        return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(number || 0);
    }
    function textToClassName(text) {
        if (!text) return '';
        return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-');
    }
});