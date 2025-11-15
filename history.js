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
    const containerSearchInput = document.getElementById('containerSearch'); 

    let unsubscribeHistory = null; 
    let allTransactions = []; 

    // --- LOGIQUE DE SUPPRESSION ET MODIFICATION ---
    tableBody.addEventListener('click', (event) => {
        const target = event.target; // Cible du clic

        // CAS 1 : Clic sur le bouton "Suppr." (Soft Delete)
        if (target.classList.contains('deleteBtn')) {
            const docId = target.dataset.id;
            if (confirm("Confirmer la suppression de cette entrée ? Elle sera archivée.")) {
                transactionsCollection.doc(docId).update({ isDeleted: true });
            }
        }

        // ==== NOUVEAU BLOC : Clic sur le bouton "Modif." ====
        if (target.classList.contains('editBtn')) {
            const docId = target.dataset.id;
            const oldPrice = parseFloat(target.dataset.prix);
            const paris = parseFloat(target.dataset.paris);
            const abidjan = parseFloat(target.dataset.abidjan);

            // 1. Demander le nouveau prix à l'admin
            const newPriceStr = prompt("Entrez le nouveau PRIX pour ce colis :", oldPrice);

            // 2. Vérifier si l'admin a annulé
            if (newPriceStr === null) {
                return; // L'utilisateur a cliqué sur "Annuler"
            }

            const newPrice = parseFloat(newPriceStr);

            // 3. Valider le nouveau prix
            if (isNaN(newPrice) || newPrice <= 0) {
                return alert("Le prix entré n'est pas valide.");
            }

            // 4. Recalculer le 'reste' en fonction du nouveau prix
            // Reste = (Total Payé) - (Nouveau Prix)
            const newReste = (paris + abidjan) - newPrice;

            // 5. Mettre à jour la base de données
            if (confirm(`Confirmez-vous le nouveau prix : ${formatCFA(newPrice)} ?\nLe nouveau reste sera de : ${formatCFA(newReste)}.`)) {
                transactionsCollection.doc(docId)
                    .update({
                        prix: newPrice,
                        reste: newReste
                    })
                    .then(() => {
                        alert("Modification enregistrée !");
                    })
                    .catch(err => {
                        console.error("Erreur de mise à jour : ", err);
                        alert("Une erreur est survenue.");
                    });
            }
        }
    });

    // --- ÉTAPE 1 : RÉCUPÉRER LES DONNÉES DE FIREBASE ---
    function fetchHistory() {
        if (unsubscribeHistory) {
            unsubscribeHistory(); 
        }
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
        }, error => console.error("Erreur Firestore (transactions): ", error));
    }

    // --- ÉTAPE 2 : FILTRER ET AFFICHER (CÔTÉ CLIENT) ---
    function applyFiltersAndRender() {
        const masterTerm = masterSearchInput.value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const containerTerm = containerSearchInput.value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const filteredTransactions = allTransactions.filter(data => {
            if (containerTerm) {
                const conteneur = (data.conteneur || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                if (conteneur !== containerTerm) return false;
            }
            if (masterTerm) {
                const ref = (data.reference || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const nom = (data.nom || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const agentMM = (data.agentMobileMoney || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const commune = (data.commune || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const agents = (data.agent || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                if (!ref.includes(masterTerm) && !nom.includes(masterTerm) && !agentMM.includes(masterTerm) && !commune.includes(masterTerm) && !agents.includes(masterTerm)) {
                    return false;
                }
            }
            return true;
        });
        renderTable(filteredTransactions);
    }

    // --- ÉTAPE 3 : RENDER TABLE ---
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
    containerSearchInput.addEventListener('input', applyFiltersAndRender); 
    fetchHistory(); // Lancement initial

    // --- Fonctions utilitaires ---
    function insertDataRow(data) {
        const newRow = document.createElement('tr');
        if (data.isDeleted === true) {
            newRow.classList.add('deleted-row');
        }
        const reste_class = (data.reste || 0) < 0 ? 'reste-negatif' : 'reste-positif';
        const agentString = data.agent || "";
        const agents = agentString.split(',').map(a => a.trim()).filter(a => a.length > 0);
        const agentTagsHTML = agents.map(agent => `<span class="tag ${textToClassName(agent)}">${agent}</span>`).join(' '); 
        
        let deleteButtonHTML = '';
        let editButtonHTML = ''; // NOUVEAU

        // Seul l'admin peut modifier le prix
        if (userRole === 'admin' && data.isDeleted !== true) {
            editButtonHTML = `<button class="editBtn" 
                                    data-id="${data.id}" 
                                    data-prix="${data.prix || 0}"
                                    data-paris="${data.montantParis || 0}"
                                    data-abidjan="${data.montantAbidjan || 0}"
                                    style="background-color:#007bff; margin-right:5px;">
                                Modif.
                                </button>`;
        }
        
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
            <td style="min-width: 100px;">${editButtonHTML}${deleteButtonHTML}</td>`; // Colonne Action mise à jour
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