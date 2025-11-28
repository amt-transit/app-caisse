document.addEventListener('DOMContentLoaded', async () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: La connexion à la base de données a échoué."); return;
    }

    const transactionsCollection = db.collection("transactions");
    const expensesCollection = db.collection("expenses"); // Pour enregistrer les dépenses
    const bankCollection = db.collection("bank_movements"); // Pour les chèques

    // Choices JS
    const agentSelectElement = document.getElementById('agent');
    const agentChoices = new Choices(agentSelectElement, { removeItemButton: true, placeholder: true, searchPlaceholderValue: 'Rechercher un agent...' });

    // Éléments DOM
    const addEntryBtn = document.getElementById('addEntryBtn');
    const saveDayBtn = document.getElementById('saveDayBtn');
    const dailyTableBody = document.getElementById('dailyTableBody');
    const formContainer = document.getElementById('caisseForm'); // Le premier formulaire
    
    // Champs Saisie Colis
    const dateInput = document.getElementById('date');
    const referenceInput = document.getElementById('reference'); 
    const nomInput = document.getElementById('nom');
    const conteneurInput = document.getElementById('conteneur');
    const prixInput = document.getElementById('prix');
    const montantParisInput = document.getElementById('montantParis');
    const montantAbidjanInput = document.getElementById('montantAbidjan');
    const agentMobileMoneyInput = document.getElementById('agentMobileMoney');
    const modePaiementInput = document.getElementById('modePaiement');
    const resteInput = document.getElementById('reste');
    const communeInput = document.getElementById('commune');
    const referenceList = document.getElementById('referenceList');
    
    // Champs Saisie Dépenses (Nouveau)
    const addQuickExpenseBtn = document.getElementById('addQuickExpenseBtn');
    const quickExpenseDesc = document.getElementById('quickExpenseDesc');
    const quickExpenseAmount = document.getElementById('quickExpenseAmount');
    const dailyExpensesTableBody = document.getElementById('dailyExpensesTableBody');

    // Totaux
    const dailyTotalAbidjanEspecesEl = document.getElementById('dailyTotalAbidjanEspeces');
    const dailyTotalExpensesEl = document.getElementById('dailyTotalExpenses');
    const netToPayEl = document.getElementById('netToPay');
    
    const dailyTotalParisEl = document.getElementById('dailyTotalParis');
    const dailyTotalMobileMoneyEl = document.getElementById('dailyTotalMobileMoney');
    const dailyTotalResteEl = document.getElementById('dailyTotalReste');

    // Données Locales (Session en cours)
    let dailyTransactions = JSON.parse(localStorage.getItem('dailyTransactions')) || [];
    let dailyExpenses = JSON.parse(localStorage.getItem('dailyExpenses')) || [];

    // --- 1. GESTION DES TRANSACTIONS (COLIS) ---

    addEntryBtn.addEventListener('click', () => {
        const selectedAgents = agentChoices.getValue(true); 
        const agentString = selectedAgents.join(', '); 

        const newData = {
            date: dateInput.value,
            reference: referenceInput.value.trim(),
            nom: nomInput.value.trim(),
            conteneur: conteneurInput.value.trim().toUpperCase(),
            prix: parseFloat(prixInput.value) || 0,
            montantParis: parseFloat(montantParisInput.value) || 0,
            montantAbidjan: parseFloat(montantAbidjanInput.value) || 0,
            agentMobileMoney: agentMobileMoneyInput.value,
            modePaiement: modePaiementInput.value,
            commune: communeInput.value, 
            agent: agentString,
            reste: 0
        };

        if (!newData.date || !newData.reference) return alert("Remplissez la date et la référence/nom.");
        if (newData.prix <= 0) return alert("Prix invalide.");

        const totalPaye = newData.montantParis + newData.montantAbidjan;
        if (totalPaye > newData.prix) return alert(`IMPOSSIBLE : Trop perçu.`);
        newData.reste = totalPaye - newData.prix;

        const existingIndex = dailyTransactions.findIndex(t => t.reference === newData.reference);
        if (existingIndex > -1) {
            const t = dailyTransactions[existingIndex];
            const nouveauTotal = t.montantParis + t.montantAbidjan + newData.montantParis + newData.montantAbidjan;
            if (nouveauTotal > t.prix) return alert("IMPOSSIBLE : Cumul trop élevé.");
            
            t.montantParis += newData.montantParis;
            t.montantAbidjan += newData.montantAbidjan;
            if (newData.agentMobileMoney) t.agentMobileMoney = newData.agentMobileMoney;
            t.modePaiement = newData.modePaiement; 
            t.reste = (t.montantParis + t.montantAbidjan) - t.prix;
        } else {
            dailyTransactions.push(newData);
        }
        
        saveAllToLocalStorage();
        renderAllTables();
        
        // Reset partiel
        prixInput.value = ''; montantParisInput.value = ''; montantAbidjanInput.value = '';
        agentMobileMoneyInput.value = ''; resteInput.value = '';
        referenceInput.value = ''; nomInput.value = ''; conteneurInput.value = '';
        agentChoices.setValue([]); 
        resteInput.className = '';
        referenceInput.focus();
    });

    // --- 2. GESTION DES DÉPENSES (LIVREUR) ---

    addQuickExpenseBtn.addEventListener('click', () => {
        const date = dateInput.value;
        const desc = quickExpenseDesc.value.trim();
        const amount = parseFloat(quickExpenseAmount.value);

        if (!date) return alert("Veuillez sélectionner la date en haut.");
        if (!desc || isNaN(amount) || amount <= 0) return alert("Motif ou Montant invalide.");

        dailyExpenses.push({
            date: date,
            description: desc,
            montant: amount
        });

        saveAllToLocalStorage();
        renderAllTables();

        quickExpenseDesc.value = '';
        quickExpenseAmount.value = '';
        quickExpenseDesc.focus();
    });


    // --- 3. FONCTIONS D'AFFICHAGE & CALCUL ---

    function saveAllToLocalStorage() {
        localStorage.setItem('dailyTransactions', JSON.stringify(dailyTransactions));
        localStorage.setItem('dailyExpenses', JSON.stringify(dailyExpenses));
    }

    function renderAllTables() {
        // Table Transactions
        dailyTableBody.innerHTML = '';
        dailyTransactions.forEach((data, index) => {
            dailyTableBody.innerHTML += `
                <tr>
                    <td>${data.reference}</td>
                    <td>${data.nom || '-'}</td>
                    <td>${formatCFA(data.prix)}</td>
                    <td>${data.modePaiement}</td>
                    <td class="${data.reste < 0 ? 'reste-negatif' : 'reste-positif'}">${formatCFA(data.reste)}</td>
                    <td><button class="deleteBtn" onclick="removeTransaction(${index})">X</button></td>
                </tr>`;
        });
        document.getElementById('dailyCount').textContent = dailyTransactions.length;

        // Table Dépenses
        dailyExpensesTableBody.innerHTML = '';
        dailyExpenses.forEach((exp, index) => {
            dailyExpensesTableBody.innerHTML += `
                <tr>
                    <td>${exp.description}</td>
                    <td>${formatCFA(exp.montant)}</td>
                    <td><button class="deleteBtn" onclick="removeExpense(${index})">X</button></td>
                </tr>`;
        });

        updateGlobalSummary();
    }

    // --- LE COEUR DU SYSTÈME : CALCUL DU NET À VERSER ---
    function updateGlobalSummary() {
        let totalAbidjanEsp = 0; // Cash entrant
        let totalParis = 0;
        let totalMM = 0;
        let totalExpenses = 0; // Cash sortant

        // 1. Calcul Entrées (Uniquement Espèces Abidjan comptent pour la caisse physique)
        dailyTransactions.forEach(t => {
            if (t.modePaiement === 'Espèce') {
                totalAbidjanEsp += (t.montantAbidjan || 0);
            } else {
                totalMM += (t.montantAbidjan || 0) + (t.montantParis || 0); // OM, Wave, Chèque...
            }
            totalParis += (t.montantParis || 0);
        });

        // 2. Calcul Sorties (Dépenses)
        dailyExpenses.forEach(e => totalExpenses += e.montant);

        // 3. Calcul Net
        const netToPay = totalAbidjanEsp - totalExpenses;

        // 4. Affichage
        dailyTotalAbidjanEspecesEl.textContent = formatCFA(totalAbidjanEsp);
        dailyTotalExpensesEl.textContent = formatCFA(totalExpenses);
        
        netToPayEl.textContent = formatCFA(netToPay);
        // Couleur : Rouge si négatif (le livreur a plus dépensé qu'encaissé !!), Vert sinon
        netToPayEl.style.color = netToPay < 0 ? '#d32f2f' : '#000'; 

        // Infos secondaires
        dailyTotalParisEl.textContent = formatCFA(totalParis);
        dailyTotalMobileMoneyEl.textContent = formatCFA(totalMM);
    }

    // Fonctions globales pour les onclick dans le HTML généré
    window.removeTransaction = (index) => {
        dailyTransactions.splice(index, 1);
        saveAllToLocalStorage();
        renderAllTables();
    };
    window.removeExpense = (index) => {
        dailyExpenses.splice(index, 1);
        saveAllToLocalStorage();
        renderAllTables();
    };


    // --- 4. ENREGISTREMENT GLOBAL (FIN DE JOURNÉE) ---
    saveDayBtn.addEventListener('click', async () => {
        if (dailyTransactions.length === 0 && dailyExpenses.length === 0) return alert("Rien à enregistrer.");
        
        // Check ultime
        let totalEsp = 0, totalDep = 0;
        dailyTransactions.forEach(t => { if(t.modePaiement==='Espèce') totalEsp += t.montantAbidjan; });
        dailyExpenses.forEach(e => totalDep += e.montant);
        
        if (confirm(`CONFIRMATION JOURNÉE :\n\nEncaissements Espèces : ${formatCFA(totalEsp)}\nDépenses Livreur : ${formatCFA(totalDep)}\n\nNET À VERSER : ${formatCFA(totalEsp - totalDep)}\n\nConfirmer l'enregistrement ?`)) {
            
            const batch = db.batch();

            // A. Enregistrer les Transactions
            for (const transac of dailyTransactions) {
                const query = await transactionsCollection.where("reference", "==", transac.reference).get();
                
                const isCheck = (transac.modePaiement === 'Chèque');
                const paymentEntry = {
                    date: transac.date,
                    montantParis: transac.montantParis,
                    montantAbidjan: transac.montantAbidjan,
                    agent: transac.agent,
                    modePaiement: transac.modePaiement,
                    agentMobileMoney: transac.agentMobileMoney,
                    checkStatus: isCheck ? 'Pending' : 'Cleared'
                };

                if (!query.empty) {
                    const docRef = query.docs[0].ref;
                    const oldData = query.docs[0].data();
                    batch.update(docRef, {
                        montantParis: (oldData.montantParis||0) + transac.montantParis,
                        montantAbidjan: (oldData.montantAbidjan||0) + transac.montantAbidjan,
                        reste: (oldData.reste||0) + transac.montantParis + transac.montantAbidjan,
                        date: transac.date,
                        modePaiement: transac.modePaiement,
                        paymentHistory: firebase.firestore.FieldValue.arrayUnion(paymentEntry)
                    });
                } else {
                    const docRef = transactionsCollection.doc();
                    batch.set(docRef, { ...transac, isDeleted: false, paymentHistory: [paymentEntry] });
                }
            }

            // B. Enregistrer les Dépenses
            dailyExpenses.forEach(exp => {
                const docRef = expensesCollection.doc();
                batch.set(docRef, {
                    date: exp.date,
                    description: exp.description + " (Saisie Livreur)", // On marque la source
                    montant: exp.montant,
                    type: "Journalière", // Type spécifique
                    isDeleted: false,
                    action: "Depense",
                    conteneur: ""
                });
            });

            await batch.commit();
            alert("Journée enregistrée et clôturée !");
            
            dailyTransactions = [];
            dailyExpenses = [];
            saveAllToLocalStorage();
            renderAllTables();
        }
    });


    // --- RECHERCHE INTELLIGENTE ---
    referenceInput.addEventListener('change', async () => { 
        const searchValue = referenceInput.value.trim();
        if (!searchValue) return;

        // Reset visuel
        prixInput.value = ''; nomInput.value = ''; conteneurInput.value = '';
        resteInput.value = ''; resteInput.className = '';
        montantParisInput.placeholder = 'Montant Paris'; montantAbidjanInput.placeholder = 'Montant Abidjan';

        // 1. Essayer par Référence
        let query = await transactionsCollection.where("reference", "==", searchValue).get();
        
        // 2. Si vide, essayer par Nom
        if (query.empty) {
            query = await transactionsCollection.where("nom", "==", searchValue).get();
        }

        if (!query.empty) {
            if (query.size > 1) {
                alert("Plusieurs colis trouvés avec ce nom. Utilisez la référence.");
                return;
            }

            const data = query.docs[0].data();
            // Remplir les champs
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

    // --- AUTRES ---
    prixInput.addEventListener('input', calculateAndStyleReste);
    montantParisInput.addEventListener('input', calculateAndStyleReste);
    montantAbidjanInput.addEventListener('input', calculateAndStyleReste);
    
    function calculateAndStyleReste() {
        const prix = parseFloat(prixInput.value) || 0;
        const paris = parseFloat(montantParisInput.value) || 0;
        const abidjan = parseFloat(montantAbidjanInput.value) || 0;
        const reste = (paris + abidjan) - prix;
        resteInput.value = reste;
        resteInput.className = reste > 0 ? 'reste-positif' : 'reste-negatif';
    }
    function formatCFA(n) { return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(n || 0); }
    
    function populateDatalist() {
        transactionsCollection.where("isDeleted", "!=", true).limit(500).get().then(snapshot => {
            const references = new Set(); 
            snapshot.forEach(doc => {
                const d = doc.data();
                if (d.reference) {
                    let opt = document.createElement('option');
                    opt.value = d.reference;
                    referenceList.appendChild(opt);
                }
                if (d.nom) {
                    let opt = document.createElement('option');
                    opt.value = d.nom;
                    referenceList.appendChild(opt);
                }
            });
        });
    }

    renderAllTables();
    populateDatalist();
});