document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: La connexion à la base de données a échoué.");
        return;
    }

    const userRole = sessionStorage.getItem('userRole');
    const transactionsCollection = db.collection("transactions");
    const tableBody = document.getElementById('tableBody');
    const showDeletedCheckbox = document.getElementById('showDeletedCheckbox');
    let unsubscribeHistory = null; 

    // MODIFICATION : Le bouton met à jour 'isDeleted' au lieu de supprimer
    tableBody.addEventListener('click', (event) => {
        if (event.target.classList.contains('deleteBtn')) {
            const docId = event.target.getAttribute('data-id');
            if (confirm("Confirmer la suppression de cette entrée ? Elle sera archivée.")) {
                transactionsCollection.doc(docId).update({ isDeleted: true }); 
            }
        }
    });

    // FONCTION 'fetchHistory' (qui manquait dans votre fichier)
    function fetchHistory() {
        if (unsubscribeHistory) {
            unsubscribeHistory();
        }

        let query = transactionsCollection; // Commence par la collection de base

        // Si la case n'est PAS cochée, on filtre
        if (!showDeletedCheckbox.checked) {
            query = query.where("isDeleted", "!=", true)
                         .orderBy("isDeleted"); // 1. Tri obligatoire
        }
        
        // 2. On ajoute le tri par date
        query = query.orderBy("date", "desc"); 

        unsubscribeHistory = query.onSnapshot(snapshot => {
            const transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderTable(transactions);
        }, error => console.error("Erreur Firestore: ", error));
    }

    // On écoute les changements sur la case à cocher
    showDeletedCheckbox.addEventListener('change', fetchHistory);
    
    // On lance le premier chargement
    fetchHistory();


    // ... (La fonction renderTable) ...
    function renderTable(transactions) {
        tableBody.innerHTML = ''; 
        if (transactions.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="11">Aucun historique trouvé.</td></tr>'; // Colspan 11
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

    function insertDataRow(data) {
        const newRow = document.createElement('tr');
        if (data.isDeleted === true) {
            newRow.classList.add('deleted-row');
        }
        
        const reste_class = data.reste < 0 ? 'reste-negatif' : 'reste-positif';
        const agentString = data.agent || "";
        const agents = agentString.split(',')
                                .map(a => a.trim())
                                .filter(a => a.length > 0);
        
        const agentTagsHTML = agents.map(agent => 
            `<span class="tag ${textToClassName(agent)}">${agent}</span>`
        ).join(' '); 

        let deleteButtonHTML = '';
        if ((userRole === 'admin' || userRole === 'saisie_full') && data.isDeleted !== true) {
            deleteButtonHTML = `<button class="deleteBtn" data-id="${data.id}">Suppr.</button>`;
        }

        newRow.innerHTML = `
            <td>${data.date || 'En attente'}</td>
            <td>${data.reference}</td>
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
            <td colspan="2" style="text-align: right;">TOTAL</td>
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