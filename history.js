document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: La connexion à la base de données a échoué.");
        return;
    }

    // Références aux éléments UI
    const userRole = sessionStorage.getItem('userRole');
    const transactionsCollection = db.collection("transactions");
    const tableBody = document.getElementById('tableBody');
    
    // Éléments de filtre
    const showDeletedCheckbox = document.getElementById('showDeletedCheckbox');
    const masterSearchInput = document.getElementById('masterSearch');
    const containerSearchInput = document.getElementById('containerSearch');
    const agentFilterInput = document.getElementById('agentFilter');
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');

    // Éléments de la MODALE
    const modal = document.getElementById('paymentHistoryModal');
    const modalList = document.getElementById('paymentHistoryList');
    const modalTitle = document.getElementById('modalRefTitle');
    const closeModal = document.querySelector('.close-modal'); // Assurez-vous d'avoir ce span dans history.html

    let unsubscribeHistory = null; 
    let allTransactions = []; 

    // --- GESTION DE LA MODALE ---
    // Fermer la modale
    if (closeModal) {
        closeModal.onclick = () => modal.style.display = "none";
    }
    window.onclick = (e) => { if (e.target == modal) modal.style.display = "none"; };

    // --- GESTION DES CLICS SUR LE TABLEAU ---
    tableBody.addEventListener('click', (event) => {
        const target = event.target;
        const row = target.closest('tr');

        // 1. Clic sur "Suppr."
        if (target.classList.contains('deleteBtn')) {
            const docId = target.dataset.id;
            if (confirm("Confirmer la suppression de cette entrée ? Elle sera archivée.")) {
                transactionsCollection.doc(docId).update({ isDeleted: true });
            }
            return; // Stop ici
        }

        // 2. Clic sur "Modif."
        if (target.classList.contains('editBtn')) {
            const docId = target.dataset.id;
            const oldPrice = parseFloat(target.dataset.prix);
            const paris = parseFloat(target.dataset.paris);
            const abidjan = parseFloat(target.dataset.abidjan);

            const newPriceStr = prompt("Entrez le nouveau PRIX pour ce colis :", oldPrice);
            if (newPriceStr === null) return; 

            const newPrice = parseFloat(newPriceStr);
            if (isNaN(newPrice) || newPrice <= 0) {
                return alert("Le prix entré n'est pas valide.");
            }

            const newReste = (paris + abidjan) - newPrice;

            if (confirm(`Confirmez-vous le nouveau prix : ${formatCFA(newPrice)} ?\nLe nouveau reste sera de : ${formatCFA(newReste)}.`)) {
                transactionsCollection.doc(docId)
                    .update({
                        prix: newPrice,
                        reste: newReste
                    })
                    .then(() => alert("Modification enregistrée !"))
                    .catch(err => alert("Une erreur est survenue."));
            }
            return; // Stop ici
        }

        // 3. Clic sur la LIGNE (pour voir les détails)
        // Si on n'a pas cliqué sur un bouton, et que la ligne a un ID
        if (row && row.dataset.id) {
            // Retrouver les données de la transaction dans notre liste locale
            const transaction = allTransactions.find(t => t.id === row.dataset.id);
            
            if (transaction) {
                openPaymentModal(transaction);
            }
        }
    });

    // Fonction pour ouvrir la modale avec les détails
    function openPaymentModal(data) {
        modalTitle.textContent = `${data.reference} - ${data.nom || 'Client'}`;
        modalList.innerHTML = '';

        if (data.paymentHistory && data.paymentHistory.length > 0) {
            // Afficher l'historique détaillé
            data.paymentHistory.forEach(pay => {
                // On ne montre que les montants > 0
                let amounts = [];
                if(pay.montantParis > 0) amounts.push(`<span style="color:blue">Paris: ${formatCFA(pay.montantParis)}</span>`);
                if(pay.montantAbidjan > 0) amounts.push(`<span style="color:orange">Abidjan: ${formatCFA(pay.montantAbidjan)}</span>`);
                
                const li = document.createElement('li');
                li.innerHTML = `
                    <span style="font-weight:bold; min-width: 90px;">${pay.date}</span>
                    <span style="flex-grow:1; margin: 0 10px;">${amounts.join(' + ')}</span>
                    <span style="font-size:0.85em; color:#666">${pay.agent || '-'}</span>
                `;
                modalList.appendChild(li);
            });
        } else {
            // Si pas d'historique (anciennes données), on montre le cumul actuel
            modalList.innerHTML = `<li style="color:gray; font-style:italic; justify-content:center;">Pas de détails historiques pour cet ancien colis.</li>
                                   <li style="justify-content: space-around;">
                                        <span>Total Paris: <b style="color:blue">${formatCFA(data.montantParis)}</b></span>
                                        <span>Total Abidjan: <b style="color:orange">${formatCFA(data.montantAbidjan)}</b></span>
                                   </li>`;
        }
        modal.style.display = "block";
    }

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
        const agentTerm = agentFilterInput.value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;

        const filteredTransactions = allTransactions.filter(data => {
            
            if (startDate && data.date < startDate) return false;
            if (endDate && data.date > endDate) return false;

            if (agentTerm) {
                const agents = (data.agent || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                if (!agents.includes(agentTerm)) return false;
            }

            if (containerTerm) {
                const conteneur = (data.conteneur || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                if (conteneur !== containerTerm) return false;
            }

            if (masterTerm) {
                const ref = (data.reference || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const nom = (data.nom || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const agentMM = (data.agentMobileMoney || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const commune = (data.commune || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

                if (!ref.includes(masterTerm) && !nom.includes(masterTerm) && !agentMM.includes(masterTerm) && !commune.includes(masterTerm)) {
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
            tableBody.innerHTML = '<tr><td colspan="12">Aucun historique trouvé.</td></tr>';
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
    agentFilterInput.addEventListener('change', applyFiltersAndRender);
    startDateInput.addEventListener('change', applyFiltersAndRender);
    endDateInput.addEventListener('change', applyFiltersAndRender);
    
    fetchHistory(); 

    // --- Fonctions utilitaires ---
    function insertDataRow(data) {
        const newRow = document.createElement('tr');
        // IMPORTANT : On stocke l'ID sur la ligne pour le clic
        newRow.dataset.id = data.id; 
        newRow.style.cursor = "pointer"; // Change le curseur pour indiquer que c'est cliquable

        if (data.isDeleted === true) {
            newRow.classList.add('deleted-row');
        }
        const reste_class = (data.reste || 0) < 0 ? 'reste-negatif' : 'reste-positif';
        const agentString = data.agent || "";
        const agents = agentString.split(',').map(a => a.trim()).filter(a => a.length > 0);
        const agentTagsHTML = agents.map(agent => `<span class="tag ${textToClassName(agent)}">${agent}</span>`).join(' '); 
        
        let deleteButtonHTML = '';
        let editButtonHTML = ''; 

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
            <td style="min-width: 100px;">${editButtonHTML}${deleteButtonHTML}</td>`;
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
