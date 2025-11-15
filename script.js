document.addEventListener('DOMContentLoaded', async () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: La connexion à la base de données a échoué.");
        return;
    }

    const transactionsCollection = db.collection("transactions");
    
    // N'ESSAIE PLUS DE CHARGER 'references.json'
    
    const agentSelectElement = document.getElementById('agent');
    const agentChoices = new Choices(agentSelectElement, {
        removeItemButton: true, 
        placeholder: true,
        searchPlaceholderValue: 'Rechercher un agent...',
    });

    const addEntryBtn = document.getElementById('addEntryBtn');
    const saveDayBtn = document.getElementById('saveDayBtn');
    const dailyTableBody = document.getElementById('dailyTableBody');
    const formContainer = document.getElementById('caisseForm');
    const prixInput = document.getElementById('prix');
    const montantParisInput = document.getElementById('montantParis');
    const montantAbidjanInput = document.getElementById('montantAbidjan');
    const resteInput = document.getElementById('reste');
    const referenceInput = document.getElementById('reference');
    const referenceList = document.getElementById('referenceList');
    
    const dailyTotalPrixEl = document.getElementById('dailyTotalPrix');
    const dailyTotalAbidjanEspecesEl = document.getElementById('dailyTotalAbidjanEspeces');
    const dailyTotalParisEl = document.getElementById('dailyTotalParis');
    const dailyTotalMobileMoneyEl = document.getElementById('dailyTotalMobileMoney');
    const dailyTotalResteEl = document.getElementById('dailyTotalReste');

    let dailyTransactions = JSON.parse(localStorage.getItem('dailyTransactions')) || [];

    // --- Fonctions restaurées ---
    function saveDailyToLocalStorage() {
        localStorage.setItem('dailyTransactions', JSON.stringify(dailyTransactions));
    }

    function updateDailySummary() {
        let totalPrix = 0, totalAbidjanEspeces = 0, totalParis = 0, totalMobileMoney = 0;
        dailyTransactions.forEach(t => {
            totalPrix += (t.prix || 0);
            if (t.agentMobileMoney && t.agentMobileMoney !== '') {
                totalMobileMoney += (t.montantParis || 0) + (t.montantAbidjan || 0);
            } else {
                totalAbidjanEspeces += (t.montantAbidjan || 0);
                totalParis += (t.montantParis || 0);
            }
        });
        const totalPercu = totalAbidjanEspeces + totalParis + totalMobileMoney;
        const totalReste = totalPercu - totalPrix;
        dailyTotalPrixEl.textContent = formatCFA(totalPrix);
        dailyTotalAbidjanEspecesEl.textContent = formatCFA(totalAbidjanEspeces);
        dailyTotalParisEl.textContent = formatCFA(totalParis);
        dailyTotalMobileMoneyEl.textContent = formatCFA(totalMobileMoney);
        dailyTotalResteEl.textContent = formatCFA(totalReste);
        dailyTotalResteEl.className = totalReste < 0 ? 'reste-negatif' : 'reste-positif';
    }

    function renderDailyTable() {
        dailyTableBody.innerHTML = '';
        dailyTransactions.forEach((data, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td data-label="Référence / Client">${data.reference}</td>
                <td data-label="Prix">${formatCFA(data.prix)}</td>
                <td data-label="Reste" class="${data.reste < 0 ? 'reste-negatif' : 'reste-positif'}">${formatCFA(data.reste)}</td>
                <td data-label="Action"><button class="deleteBtn" data-index="${index}">X</button></td>
            `;
            dailyTableBody.appendChild(row);
        });
        document.getElementById('dailyCount').textContent = dailyTransactions.length;
        updateDailySummary();
    }

    // --- Fonction 'addEntryBtn' restaurée ---
    addEntryBtn.addEventListener('click', () => {
        const selectedAgents = agentChoices.getValue(true); 
        const agentString = selectedAgents.join(', '); 

        const newData = {
            date: document.getElementById('date').value, reference: referenceInput.value,
            prix: parseFloat(prixInput.value) || 0, montantParis: parseFloat(montantParisInput.value) || 0,
            montantAbidjan: parseFloat(montantAbidjanInput.value) || 0, reste: 0,
            agentMobileMoney: document.getElementById('agentMobileMoney').value,
            commune: document.getElementById('commune').value, 
            agent: agentString 
        };
        if (!newData.date || !newData.reference) return alert("Veuillez remplir au moins la date et la référence.");

        // Calcul du 'reste' basé sur le prix dans le formulaire
        newData.reste = (newData.montantParis + newData.montantAbidjan) - newData.prix;

        const existingIndex = dailyTransactions.findIndex(t => t.reference === newData.reference);
        if (existingIndex > -1) {
            // Si la réf existe DÉJÀ dans la liste du jour, on cumule les paiements
            const t = dailyTransactions[existingIndex];
            t.montantParis += newData.montantParis;
            t.montantAbidjan += newData.montantAbidjan;
            if (newData.agentMobileMoney) t.agentMobileMoney = newData.agentMobileMoney;
            // On recalcule le reste basé sur le prix initial et le total des paiements
            t.reste = (t.montantParis + t.montantAbidjan) - t.prix;
        } else {
            // C'est un nouveau paiement pour cette journée
            dailyTransactions.push(newData);
        }
        
        saveDailyToLocalStorage();
        renderDailyTable();
        
        // Réinitialisation du formulaire
        formContainer.querySelectorAll('input, select').forEach(el => {
            if (el.type !== 'date' && el.id !== 'agent' && el.id !== 'commune') { 
                el.value = '';
            }
        });
        
        agentChoices.setValue([]); // Correction du bug de réinitialisation
        resteInput.className = '';
        referenceInput.focus();
    });

    // --- Fonction 'saveDayBtn' (mise à jour pour 'arrivages') ---
    saveDayBtn.addEventListener('click', async () => {
        if (dailyTransactions.length === 0) return alert("Aucune opération à enregistrer.");
        if (!confirm(`Voulez-vous vraiment enregistrer les ${dailyTransactions.length} opérations ?`)) return;

        const batch = db.batch();
        for (const transac of dailyTransactions) {
            const query = await transactionsCollection.where("reference", "==", transac.reference).get();
            
            if (!query.empty) {
                // Le colis existe (cas normal pour un paiement)
                const docRef = query.docs[0].ref;
                const oldData = query.docs[0].data();
                
                const updatedData = {
                    montantParis: (oldData.montantParis || 0) + transac.montantParis,
                    montantAbidjan: (oldData.montantAbidjan || 0) + transac.montantAbidjan,
                    reste: (oldData.reste || 0) + transac.montantParis + transac.montantAbidjan,
                    
                    date: transac.date || oldData.date, 
                    ...( (!oldData.date && transac.date) && {date: transac.date} ),
                    
                    agent: transac.agent || oldData.agent || '',
                    agentMobileMoney: transac.agentMobileMoney || oldData.agentMobileMoney || '',
                    commune: transac.commune || oldData.commune || '',
                    
                    // On préserve les données de l'arrivage
                    nom: oldData.nom || '', 
                    conteneur: oldData.conteneur || '', 
                    prix: oldData.prix || 0, // Garde l'ancien prix
                };

                batch.update(docRef, updatedData);
                
            } else {
                // Le colis n'existe pas
                console.warn(`La référence ${transac.reference} n'existe pas. Le paiement est ignoré.`);
            }
        }
        
        batch.commit().then(() => {
            alert(`Les opérations ont été enregistrées avec succès !`);
            dailyTransactions = [];
            saveDailyToLocalStorage();
            renderDailyTable();
        }).catch(err => console.error("Erreur d'enregistrement : ", err));
    });

    // --- (dailyTableBody click listener restauré) ---
    dailyTableBody.addEventListener('click', (event) => {
        if (event.target.classList.contains('deleteBtn')) {
            const index = parseInt(event.target.getAttribute('data-index'), 10);
            dailyTransactions.splice(index, 1);
            saveDailyToLocalStorage();
            renderDailyTable();
        }
    });

    // --- LOGIQUE DE RECHERCHE DE RÉFÉRENCE (mise à jour pour 'arrivages') ---
    referenceInput.addEventListener('input', async () => {
        const refValue = referenceInput.value;
        montantParisInput.placeholder = 'Montant Paris';
        montantAbidjanInput.placeholder = 'Montant Abidjan';
        
        prixInput.value = '';
        resteInput.value = '';
        resteInput.className = '';
        
        // La seule source de vérité est maintenant Firestore
        const query = await transactionsCollection.where("reference", "==", refValue).get();
        
        if (!query.empty) {
            const lastTransaction = query.docs[0].data();
            
            prixInput.value = lastTransaction.prix;
            
            if (lastTransaction.reste < 0) {
                resteInput.value = lastTransaction.reste;
                resteInput.className = 'reste-negatif';
                montantParisInput.placeholder = `Solde: ${formatCFA(lastTransaction.reste)}`;
                montantAbidjanInput.placeholder = `Solde: ${formatCFA(lastTransaction.reste)}`;
            } else {
                resteInput.value = lastTransaction.reste;
                resteInput.className = 'reste-positif';
            }
        }
    });

    // --- (calculateAndStyleReste et formatCFA restaurés) ---
    prixInput.addEventListener('input', calculateAndStyleReste);
    montantParisInput.addEventListener('input', calculateAndStyleReste);
    montantAbidjanInput.addEventListener('input', calculateAndStyleReste);

    function calculateAndStyleReste() {
        const prix = parseFloat(prixInput.value) || 0;
        const montantParis = parseFloat(montantParisInput.value) || 0;
        const montantAbidjan = parseFloat(montantAbidjanInput.value) || 0;
        const reste = (montantParis + montantAbidjan) - prix;
        resteInput.value = reste;
        resteInput.className = reste < 0 ? 'reste-negatif' : 'reste-positif';
    }

    function formatCFA(number) {
        return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(number || 0);
    }
    
    function textToClassName(text) {
        if (!text) return '';
        return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-');
    }
    
    // --- (populateDatalist mise à jour pour 'arrivages') ---
    function populateDatalist() {
        // On ne charge que les transactions qui ne sont pas supprimées
        transactionsCollection.where("isDeleted", "!=", true).get().then(snapshot => {
            const references = new Set(); // Evite les doublons
            snapshot.forEach(doc => {
                references.add(doc.data().reference);
            });
            
            referenceList.innerHTML = ''; // Vide l'ancienne liste
            references.forEach(ref => {
                if (ref) { 
                    const option = document.createElement('option');
                    option.value = ref;
                    referenceList.appendChild(option);
                }
            });
        });
    }

    renderDailyTable();
    populateDatalist(); // Lance la nouvelle fonction
});