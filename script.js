document.addEventListener('DOMContentLoaded', async () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: La connexion à la base de données a échoué.");
        return;
    }

    const transactionsCollection = db.collection("transactions");
    
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
    
    const referenceInput = document.getElementById('reference');
    const nomInput = document.getElementById('nom');
    const conteneurInput = document.getElementById('conteneur');
    const prixInput = document.getElementById('prix');
    const montantParisInput = document.getElementById('montantParis');
    const montantAbidjanInput = document.getElementById('montantAbidjan');
    const agentMobileMoneyInput = document.getElementById('agentMobileMoney');
    const resteInput = document.getElementById('reste');
    const communeInput = document.getElementById('commune');
    const referenceList = document.getElementById('referenceList');
    
    const dailyTotalPrixEl = document.getElementById('dailyTotalPrix');
    const dailyTotalAbidjanEspecesEl = document.getElementById('dailyTotalAbidjanEspeces');
    const dailyTotalParisEl = document.getElementById('dailyTotalParis');
    const dailyTotalMobileMoneyEl = document.getElementById('dailyTotalMobileMoney');
    const dailyTotalResteEl = document.getElementById('dailyTotalReste');

    let dailyTransactions = JSON.parse(localStorage.getItem('dailyTransactions')) || [];

    // --- CALCUL DES TOTAUX ---
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
                <td>${data.reference}</td>
                <td>${data.nom || '-'}</td>
                <td>${formatCFA(data.prix)}</td>
                <td class="${data.reste < 0 ? 'reste-negatif' : 'reste-positif'}">${formatCFA(data.reste)}</td>
                <td><button class="deleteBtn" data-index="${index}">X</button></td>
            `;
            dailyTableBody.appendChild(row);
        });
        document.getElementById('dailyCount').textContent = dailyTransactions.length;
        updateDailySummary();
    }

    // --- AJOUTER À LA LISTE ---
    addEntryBtn.addEventListener('click', () => {
        const selectedAgents = agentChoices.getValue(true); 
        const agentString = selectedAgents.join(', '); 

        // On récupère toutes les valeurs
        const newData = {
            date: document.getElementById('date').value,
            reference: referenceInput.value.trim(),
            nom: nomInput.value.trim(),         // Nouveau champ
            conteneur: conteneurInput.value.trim().toUpperCase(), // Nouveau champ
            prix: parseFloat(prixInput.value) || 0,
            montantParis: parseFloat(montantParisInput.value) || 0,
            montantAbidjan: parseFloat(montantAbidjanInput.value) || 0,
            agentMobileMoney: agentMobileMoneyInput.value,
            commune: communeInput.value, 
            agent: agentString,
            reste: 0
        };

        // Validation de base
        if (!newData.date || !newData.reference) {
            return alert("Veuillez remplir au moins la date et la référence.");
        }
        if (newData.prix <= 0) {
            return alert("Veuillez entrer un prix valide.");
        }

        // Calcul du reste
        newData.reste = (newData.montantParis + newData.montantAbidjan) - newData.prix;

        // === BLOQUER SI CAISSE NÉGATIVE (Trop perçu) ===
        // Note : Dans votre logique, 'reste' est (Payé - Prix). 
        // Donc si reste > 0, c'est que le client a payé PLUS que le prix.
        if (newData.reste > 0) {
             return alert(`Impossible d'ajouter : Le montant total payé (${formatCFA(newData.montantParis + newData.montantAbidjan)}) dépasse le prix du colis (${formatCFA(newData.prix)}).`);
        }

        // Gestion des doublons dans la liste du jour
        const existingIndex = dailyTransactions.findIndex(t => t.reference === newData.reference);
        if (existingIndex > -1) {
            const t = dailyTransactions[existingIndex];
            t.montantParis += newData.montantParis;
            t.montantAbidjan += newData.montantAbidjan;
            if (newData.agentMobileMoney) t.agentMobileMoney = newData.agentMobileMoney;
            t.reste = (t.montantParis + t.montantAbidjan) - t.prix;
            
            // Vérification à nouveau après cumul
            if (t.reste > 0) {
                // Annuler l'ajout si le cumul dépasse
                t.montantParis -= newData.montantParis;
                t.montantAbidjan -= newData.montantAbidjan;
                t.reste = (t.montantParis + t.montantAbidjan) - t.prix;
                return alert("Ajout annulé : Le cumul des paiements dépasserait le prix du colis.");
            }
        } else {
            dailyTransactions.push(newData);
        }
        
        saveDailyToLocalStorage();
        renderDailyTable();
        
        // Réinitialisation intelligente
        formContainer.querySelectorAll('input, select').forEach(el => {
            if (el.type !== 'date' && el.id !== 'agent' && el.id !== 'commune') { 
                el.value = '';
            }
        });
        agentChoices.setValue([]); 
        resteInput.className = '';
        referenceInput.focus();
    });

    // --- ENREGISTRER DANS FIREBASE ---
    saveDayBtn.addEventListener('click', async () => {
        if (dailyTransactions.length === 0) return alert("Aucune opération à enregistrer.");
        if (!confirm(`Voulez-vous vraiment enregistrer les ${dailyTransactions.length} opérations ?`)) return;

        const batch = db.batch();
        
        for (const transac of dailyTransactions) {
            const query = await transactionsCollection.where("reference", "==", transac.reference).get();
            
            if (!query.empty) {
                // --- CAS 1 : LE COLIS EXISTE DÉJÀ (Mise à jour) ---
                const docRef = query.docs[0].ref;
                const oldData = query.docs[0].data();
                
                const updatedData = {
                    montantParis: (oldData.montantParis || 0) + transac.montantParis,
                    montantAbidjan: (oldData.montantAbidjan || 0) + transac.montantAbidjan,
                    reste: (oldData.reste || 0) + transac.montantParis + transac.montantAbidjan,
                    
                    date: transac.date || oldData.date,
                    
                    // On met à jour les infos si fournies
                    agent: transac.agent || oldData.agent || '',
                    agentMobileMoney: transac.agentMobileMoney || oldData.agentMobileMoney || '',
                    commune: transac.commune || oldData.commune || '',
                    
                    // On ne touche PAS au nom/conteneur/prix d'origine s'ils existent déjà
                };
                batch.update(docRef, updatedData);
                
            } else {
                // --- CAS 2 : LE COLIS EST NOUVEAU (Création) ---
                const docRef = transactionsCollection.doc();
                const newData = {
                    date: transac.date,
                    reference: transac.reference,
                    nom: transac.nom,         // On enregistre le nom saisi
                    conteneur: transac.conteneur, // On enregistre le conteneur saisi
                    prix: transac.prix,       // On enregistre le prix saisi
                    
                    montantParis: transac.montantParis,
                    montantAbidjan: transac.montantAbidjan,
                    reste: transac.reste, // Le reste calculé est correct
                    
                    agent: transac.agent,
                    agentMobileMoney: transac.agentMobileMoney,
                    commune: transac.commune,
                    isDeleted: false
                };
                batch.set(docRef, newData);
            }
        }
        
        batch.commit().then(() => {
            alert(`Succès ! Tout a été enregistré.`);
            dailyTransactions = [];
            saveDailyToLocalStorage();
            renderDailyTable();
        }).catch(err => console.error("Erreur d'enregistrement : ", err));
    });

    dailyTableBody.addEventListener('click', (event) => {
        if (event.target.classList.contains('deleteBtn')) {
            const index = parseInt(event.target.getAttribute('data-index'), 10);
            dailyTransactions.splice(index, 1);
            saveDailyToLocalStorage();
            renderDailyTable();
        }
    });

    // --- RECHERCHE AUTOMATIQUE ---
    referenceInput.addEventListener('input', async () => {
        const refValue = referenceInput.value;
        // Reset visuel
        prixInput.value = '';
        nomInput.value = '';
        conteneurInput.value = '';
        resteInput.value = '';
        resteInput.className = '';
        montantParisInput.placeholder = 'Montant Paris';
        montantAbidjanInput.placeholder = 'Montant Abidjan';

        const query = await transactionsCollection.where("reference", "==", refValue).get();
        
        if (!query.empty) {
            // Colis TROUVÉ : On remplit les champs
            const data = query.docs[0].data();
            
            prixInput.value = data.prix;
            nomInput.value = data.nom || '';
            conteneurInput.value = data.conteneur || '';
            
            if (data.reste < 0) {
                // Il reste une dette
                resteInput.value = data.reste;
                resteInput.className = 'reste-negatif';
                montantParisInput.placeholder = `Solde: ${formatCFA(data.reste)}`;
                montantAbidjanInput.placeholder = `Solde: ${formatCFA(data.reste)}`;
            } else {
                // Tout est payé
                resteInput.value = 0;
                resteInput.className = 'reste-positif';
                montantParisInput.placeholder = "Soldé";
                montantAbidjanInput.placeholder = "Soldé";
            }
        } else {
            // Colis NON TROUVÉ : L'utilisateur doit saisir les infos
            // (Les champs restent vides pour la saisie manuelle)
        }
    });

    prixInput.addEventListener('input', calculateAndStyleReste);
    montantParisInput.addEventListener('input', calculateAndStyleReste);
    montantAbidjanInput.addEventListener('input', calculateAndStyleReste);

    function calculateAndStyleReste() {
        const prix = parseFloat(prixInput.value) || 0;
        const paris = parseFloat(montantParisInput.value) || 0;
        const abidjan = parseFloat(montantAbidjanInput.value) || 0;
        const reste = (paris + abidjan) - prix;
        
        resteInput.value = reste;
        resteInput.className = reste > 0 ? 'reste-positif' : 'reste-negatif'; // Note: Reste > 0 = Trop perçu dans ce contexte de saisie locale
    }

    function formatCFA(number) {
        return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(number || 0);
    }
    
    function textToClassName(text) {
        if (!text) return '';
        return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-');
    }

    function saveDailyToLocalStorage() {
        localStorage.setItem('dailyTransactions', JSON.stringify(dailyTransactions));
    }
    
    function populateDatalist() {
        transactionsCollection.where("isDeleted", "!=", true).limit(500).get().then(snapshot => {
            const references = new Set(); 
            snapshot.forEach(doc => {
                references.add(doc.data().reference);
            });
            referenceList.innerHTML = '';
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
    populateDatalist(); 
});
