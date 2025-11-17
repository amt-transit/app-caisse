document.addEventListener('DOMContentLoaded', async () => {
    // 1. Vérification de la connexion
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur critique : Impossible de se connecter à la base de données.");
        return;
    }

    const transactionsCollection = db.collection("transactions");
    
    // 2. Initialisation de Choices.js (Select multiple)
    const agentSelectElement = document.getElementById('agent');
    const agentChoices = new Choices(agentSelectElement, {
        removeItemButton: true, 
        placeholder: true,
        searchPlaceholderValue: 'Rechercher un agent...',
    });

    // 3. Récupération des éléments du DOM
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

    // --- FONCTIONS UTILITAIRES (Déclarées au début pour être accessibles) ---

    function saveDailyToLocalStorage() {
        localStorage.setItem('dailyTransactions', JSON.stringify(dailyTransactions));
    }

    function formatCFA(number) {
        return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(number || 0);
    }
    
    function textToClassName(text) {
        if (!text) return '';
        return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-');
    }

    function calculateAndStyleReste() {
        const prix = parseFloat(prixInput.value) || 0;
        const paris = parseFloat(montantParisInput.value) || 0;
        const abidjan = parseFloat(montantAbidjanInput.value) || 0;
        
        // Le reste est ce qu'il reste à payer.
        // Reste = Prix - (Paris + Abidjan)
        // Si le reste est POSITIF, le client doit de l'argent.
        // Si le reste est NÉGATIF, le client a trop payé.
        const totalPaye = paris + abidjan;
        const reste = (paris + abidjan) - prix; 
        
        // NOTE : Votre logique historique inverse le sens (Reste < 0 = Dette). 
        // Je garde votre logique visuelle :
        resteInput.value = reste;
        resteInput.className = reste > 0 ? 'reste-positif' : 'reste-negatif';
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
        
        if (dailyTotalPrixEl) dailyTotalPrixEl.textContent = formatCFA(totalPrix);
        if (dailyTotalAbidjanEspecesEl) dailyTotalAbidjanEspecesEl.textContent = formatCFA(totalAbidjanEspeces);
        if (dailyTotalParisEl) dailyTotalParisEl.textContent = formatCFA(totalParis);
        if (dailyTotalMobileMoneyEl) dailyTotalMobileMoneyEl.textContent = formatCFA(totalMobileMoney);
        if (dailyTotalResteEl) {
            dailyTotalResteEl.textContent = formatCFA(totalReste);
            dailyTotalResteEl.className = totalReste < 0 ? 'reste-negatif' : 'reste-positif';
        }
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
        const countEl = document.getElementById('dailyCount');
        if (countEl) countEl.textContent = dailyTransactions.length;
        updateDailySummary();
    }

    function populateDatalist() {
        transactionsCollection.where("isDeleted", "!=", true).limit(500).get().then(snapshot => {
            const references = new Set(); 
            snapshot.forEach(doc => {
                const d = doc.data();
                if (d.reference) references.add(d.reference);
            });
            
            if (referenceList) {
                referenceList.innerHTML = '';
                references.forEach(ref => {
                    if (ref) { 
                        const option = document.createElement('option');
                        option.value = ref;
                        referenceList.appendChild(option);
                    }
                });
            }
        });
    }

    // --- ÉVÉNEMENTS (LISTENERS) ---

    // 1. BOUTON AJOUTER
    addEntryBtn.addEventListener('click', () => {
        const selectedAgents = agentChoices.getValue(true); 
        const agentString = selectedAgents.join(', '); 

        const newData = {
            date: document.getElementById('date').value,
            reference: referenceInput.value.trim(),
            nom: nomInput.value.trim(),
            conteneur: conteneurInput.value.trim().toUpperCase(),
            prix: parseFloat(prixInput.value) || 0,
            montantParis: parseFloat(montantParisInput.value) || 0,
            montantAbidjan: parseFloat(montantAbidjanInput.value) || 0,
            agentMobileMoney: agentMobileMoneyInput.value,
            commune: communeInput.value, 
            agent: agentString,
            reste: 0
        };

        if (!newData.date || !newData.reference) return alert("Veuillez remplir au moins la date et la référence.");
        if (newData.prix <= 0) return alert("Veuillez entrer un prix valide.");

        // Calcul du reste et Sécurité Caisse
        const totalPaye = newData.montantParis + newData.montantAbidjan;
        if (totalPaye > newData.prix) {
             return alert(`IMPOSSIBLE : Le montant payé (${formatCFA(totalPaye)}) dépasse le prix du colis (${formatCFA(newData.prix)}).`);
        }
        newData.reste = totalPaye - newData.prix;

        // Gestion doublons (cumul)
        const existingIndex = dailyTransactions.findIndex(t => t.reference === newData.reference);
        if (existingIndex > -1) {
            const t = dailyTransactions[existingIndex];
            
            const nouveauTotal = t.montantParis + t.montantAbidjan + newData.montantParis + newData.montantAbidjan;
            if (nouveauTotal > t.prix) {
                return alert("IMPOSSIBLE : Le cumul des paiements dépasserait le prix du colis.");
            }

            t.montantParis += newData.montantParis;
            t.montantAbidjan += newData.montantAbidjan;
            if (newData.agentMobileMoney) t.agentMobileMoney = newData.agentMobileMoney;
            t.reste = (t.montantParis + t.montantAbidjan) - t.prix;
        } else {
            dailyTransactions.push(newData);
        }
        
        saveDailyToLocalStorage(); // <-- C'est ici que ça plantait
        renderDailyTable();
        
        // Reset formulaire
        formContainer.querySelectorAll('input, select').forEach(el => {
            if (el.type !== 'date' && el.id !== 'agent' && el.id !== 'commune') { 
                el.value = '';
            }
        });
        agentChoices.setValue([]); 
        resteInput.className = '';
        referenceInput.focus();
    });

    // 2. BOUTON ENREGISTRER (FIREBASE)
    saveDayBtn.addEventListener('click', async () => {
        if (dailyTransactions.length === 0) return alert("Rien à enregistrer.");
        if (!confirm(`Enregistrer les ${dailyTransactions.length} opérations ?`)) return;

        const batch = db.batch();
        
        for (const transac of dailyTransactions) {
            const query = await transactionsCollection.where("reference", "==", transac.reference).get();
            
            const paymentEntry = {
                date: transac.date,
                montantParis: transac.montantParis,
                montantAbidjan: transac.montantAbidjan,
                agent: transac.agent,
                agentMobileMoney: transac.agentMobileMoney
            };

            if (!query.empty) {
                // Mise à jour
                const docRef = query.docs[0].ref;
                const oldData = query.docs[0].data();
                
                const updatedData = {
                    montantParis: (oldData.montantParis || 0) + transac.montantParis,
                    montantAbidjan: (oldData.montantAbidjan || 0) + transac.montantAbidjan,
                    reste: (oldData.reste || 0) + transac.montantParis + transac.montantAbidjan,
                    date: transac.date || oldData.date,
                    agent: transac.agent || oldData.agent || '',
                    agentMobileMoney: transac.agentMobileMoney || oldData.agentMobileMoney || '',
                    commune: transac.commune || oldData.commune || '',
                    paymentHistory: firebase.firestore.FieldValue.arrayUnion(paymentEntry)
                };
                batch.update(docRef, updatedData);
            } else {
                // Création
                const docRef = transactionsCollection.doc();
                const newData = {
                    ...transac,
                    isDeleted: false,
                    paymentHistory: [paymentEntry]
                };
                batch.set(docRef, newData);
            }
        }
        
        batch.commit().then(() => {
            alert(`Succès ! Tout a été enregistré.`);
            dailyTransactions = [];
            saveDailyToLocalStorage();
            renderDailyTable();
        }).catch(err => console.error("Erreur : ", err));
    });

    // 3. BOUTON SUPPRIMER (LIGNE)
    dailyTableBody.addEventListener('click', (event) => {
        if (event.target.classList.contains('deleteBtn')) {
            const index = parseInt(event.target.getAttribute('data-index'), 10);
            dailyTransactions.splice(index, 1);
            saveDailyToLocalStorage();
            renderDailyTable();
        }
    });

    // 4. RECHERCHE INTELLIGENTE (Par REF ou NOM)
    referenceInput.addEventListener('change', async () => { 
        const searchValue = referenceInput.value.trim();
        if (!searchValue) return;

        // Reset visuel
        prixInput.value = ''; nomInput.value = ''; conteneurInput.value = '';
        resteInput.value = ''; resteInput.className = '';
        montantParisInput.placeholder = 'Montant Paris';
        montantAbidjanInput.placeholder = 'Montant Abidjan';

        // Essai par Référence
        let query = await transactionsCollection.where("reference", "==", searchValue).get();
        
        // Essai par Nom si vide
        if (query.empty) {
            query = await transactionsCollection.where("nom", "==", searchValue).get();
        }

        if (!query.empty) {
            if (query.size > 1) {
                alert("Plusieurs colis trouvés avec ce nom. Utilisez la référence.");
                return;
            }

            const data = query.docs[0].data();
            
            // Remplissage
            referenceInput.value = data.reference; 
            prixInput.value = data.prix;
            nomInput.value = data.nom || '';
            conteneurInput.value = data.conteneur || '';
            
            if (data.reste < 0) {
                resteInput.value = data.reste;
                resteInput.className = 'reste-negatif';
                montantParisInput.placeholder = `Reste: ${formatCFA(Math.abs(data.reste))}`;
                montantAbidjanInput.placeholder = `Reste: ${formatCFA(Math.abs(data.reste))}`;
            } else {
                resteInput.value = 0;
                resteInput.className = 'reste-positif';
                montantParisInput.placeholder = "Soldé";
                montantAbidjanInput.placeholder = "Soldé";
            }
        } 
    });

    // 5. CALCUL AUTOMATIQUE
    prixInput.addEventListener('input', calculateAndStyleReste);
    montantParisInput.addEventListener('input', calculateAndStyleReste);
    montantAbidjanInput.addEventListener('input', calculateAndStyleReste);

    // --- INITIALISATION ---
    renderDailyTable();
    populateDatalist(); 
});
