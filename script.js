document.addEventListener('DOMContentLoaded', async () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: Connexion BDD échouée."); return;
    }

    const transactionsCollection = db.collection("transactions");
    const expensesCollection = db.collection("expenses");
    const bankCollection = db.collection("bank_movements");

    // Récupération du nom de l'utilisateur connecté
    const currentUserName = sessionStorage.getItem('userName') || 'Utilisateur';

    const agentSelectElement = document.getElementById('agent');
    const agentChoices = new Choices(agentSelectElement, {
        removeItemButton: true, placeholder: true, searchPlaceholderValue: 'Rechercher un agent...',
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
    const modePaiementInput = document.getElementById('modePaiement');
    const resteInput = document.getElementById('reste');
    const communeInput = document.getElementById('commune');
    const referenceList = document.getElementById('referenceList');
    
    // NOUVEAU : ÉLÉMENTS DÉPENSES LIVREUR
    const addQuickExpenseBtn = document.getElementById('addQuickExpenseBtn');
    const quickExpenseDesc = document.getElementById('quickExpenseDesc');
    const quickExpenseAmount = document.getElementById('quickExpenseAmount');
    const quickExpenseContainer = document.getElementById('quickExpenseContainer'); // Nouveau champ
    const dailyExpensesTableBody = document.getElementById('dailyExpensesTableBody');

    // TOTAUX
    const dailyTotalAbidjanEspecesEl = document.getElementById('dailyTotalAbidjanEspeces');
    const dailyTotalExpensesEl = document.getElementById('dailyTotalExpenses');
    const netToPayEl = document.getElementById('netToPay');
    
    const dailyTotalParisEl = document.getElementById('dailyTotalParis');
    const dailyTotalMobileMoneyEl = document.getElementById('dailyTotalMobileMoney');
    const dailyTotalResteEl = document.getElementById('dailyTotalReste');

    let dailyTransactions = JSON.parse(localStorage.getItem('dailyTransactions')) || [];
    let dailyExpenses = JSON.parse(localStorage.getItem('dailyExpenses')) || [];

    // --- 1. GESTION ENCAISSEMENTS (COLIS) ---
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

    // --- 2. GESTION DÉPENSES (LIVREUR) ---
    if (addQuickExpenseBtn) {
        addQuickExpenseBtn.addEventListener('click', () => {
            const date = document.getElementById('date').value;
            const desc = quickExpenseDesc.value.trim();
            const amount = parseFloat(quickExpenseAmount.value);
            
            // CORRECTION : Priorité au champ spécifique, sinon on prend le conteneur principal
            let conteneur = '';
            if (quickExpenseContainer && quickExpenseContainer.value.trim()) {
                conteneur = quickExpenseContainer.value.trim().toUpperCase();
            } else if (conteneurInput && conteneurInput.value.trim()) {
                conteneur = conteneurInput.value.trim().toUpperCase();
            }

            if (!date) return alert("Veuillez sélectionner la date en haut.");
            if (!desc || isNaN(amount) || amount <= 0) return alert("Motif ou Montant invalide.");
 
            dailyExpenses.push({
                date: date,
                description: desc,
                montant: amount,
                conteneur: conteneur
            });

            saveAllToLocalStorage();
            renderAllTables();

            quickExpenseDesc.value = '';
            quickExpenseAmount.value = '';
            if(quickExpenseContainer) quickExpenseContainer.value = '';
            quickExpenseDesc.focus();
        });
    }

    // --- 3. AFFICHAGE & CALCUL ---
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
                    <td>${data.reference}</td><td>${data.nom || '-'}</td><td>${formatCFA(data.prix)}</td>
                    <td>${data.modePaiement}</td>
                    <td class="${data.reste < 0 ? 'reste-negatif' : 'reste-positif'}">${formatCFA(data.reste)}</td>
                    <td><button class="deleteBtn" onclick="removeTransaction(${index})">X</button></td>
                </tr>`;
        });
        document.getElementById('dailyCount').textContent = dailyTransactions.length;

        // Table Dépenses
        if (dailyExpensesTableBody) {
            dailyExpensesTableBody.innerHTML = '';
            dailyExpenses.forEach((exp, index) => {
                dailyExpensesTableBody.innerHTML += `
                    <tr>
                        <td>${exp.description} ${exp.conteneur ? '<span class="tag" style="background:#64748b; font-size:10px;">'+exp.conteneur+'</span>' : ''}</td><td>${formatCFA(exp.montant)}</td>
                        <td><button class="deleteBtn" onclick="removeExpense(${index})">X</button></td>
                    </tr>`;
            });
        }

        updateGlobalSummary();
    }

    function updateGlobalSummary() {
        let totalAbidjanEsp = 0; 
        let totalParis = 0;
        let totalMM = 0;
        let totalExpenses = 0;

        // Calcul Entrées
        dailyTransactions.forEach(t => {
            if (t.modePaiement === 'Espèce') {
                totalAbidjanEsp += (t.montantAbidjan || 0);
            } else {
                totalMM += (t.montantAbidjan || 0) + (t.montantParis || 0);
            }
            totalParis += (t.montantParis || 0);
        });

        // Calcul Sorties
        dailyExpenses.forEach(e => totalExpenses += e.montant);

        // Calcul Net
        const netToPay = totalAbidjanEsp - totalExpenses;

        // Affichage
        if(dailyTotalAbidjanEspecesEl) dailyTotalAbidjanEspecesEl.textContent = formatCFA(totalAbidjanEsp);
        if(dailyTotalExpensesEl) dailyTotalExpensesEl.textContent = formatCFA(totalExpenses);
        
        if(netToPayEl) {
            netToPayEl.textContent = formatCFA(netToPay);
            netToPayEl.style.color = netToPay < 0 ? '#d32f2f' : '#000'; 
        }

        if(dailyTotalParisEl) dailyTotalParisEl.textContent = formatCFA(totalParis);
        if(dailyTotalMobileMoneyEl) dailyTotalMobileMoneyEl.textContent = formatCFA(totalMM);
    }

    // Fonctions globales pour onclick
    window.removeTransaction = (i) => { dailyTransactions.splice(i, 1); saveAllToLocalStorage(); renderAllTables(); };
    window.removeExpense = (i) => { dailyExpenses.splice(i, 1); saveAllToLocalStorage(); renderAllTables(); };

    // --- 4. ENREGISTREMENT FINAL ---
    saveDayBtn.addEventListener('click', async () => {
        if (dailyTransactions.length === 0 && dailyExpenses.length === 0) return alert("Rien à enregistrer.");
        
        let totalEsp = 0, totalDep = 0;
        dailyTransactions.forEach(t => { if(t.modePaiement==='Espèce') totalEsp += t.montantAbidjan; });
        dailyExpenses.forEach(e => totalDep += e.montant);
        
        if (!confirm(`CONFIRMATION :\n\nEncaissements Espèces : ${formatCFA(totalEsp)}\nDépenses Livreur : ${formatCFA(totalDep)}\n\nNET À VERSER : ${formatCFA(totalEsp - totalDep)}\n\nEnregistrer ?`)) return;

        const batch = db.batch();

        // A. Enregistrer Transactions
        for (const transac of dailyTransactions) {
            const query = await transactionsCollection.where("reference", "==", transac.reference).get();
            
            const isCheck = (transac.modePaiement === 'Chèque');
            const paymentEntry = {
                date: transac.date,
                montantParis: transac.montantParis,
                montantAbidjan: transac.montantAbidjan,
                agent: transac.agent,
                saisiPar: currentUserName,
                modePaiement: transac.modePaiement,
                agentMobileMoney: transac.agentMobileMoney,
                checkStatus: isCheck ? 'Pending' : 'Cleared'
            };

            if (!query.empty) {
                const docRef = query.docs[0].ref;
                const oldData = query.docs[0].data();

                // Préparation des mises à jour pour plus de clarté
                const updates = {
                    montantParis: (oldData.montantParis || 0) + transac.montantParis,
                    montantAbidjan: (oldData.montantAbidjan || 0) + transac.montantAbidjan,
                    reste: (oldData.reste || 0) + transac.montantParis + transac.montantAbidjan,
                    paymentHistory: firebase.firestore.FieldValue.arrayUnion(paymentEntry),
                    lastPaymentDate: transac.date, // On met à jour la date d'activité pour l'historique
                    saisiPar: currentUserName // Mise à jour de l'auteur de la saisie
                };

                // Fusionner les agents sans doublons pour ne pas perdre d'historique
                const oldAgents = (oldData.agent || "").split(',').map(a => a.trim()).filter(Boolean);
                const newAgents = (transac.agent || "").split(',').map(a => a.trim()).filter(Boolean);
                const combinedAgents = [...new Set([...oldAgents, ...newAgents])].join(', ');
                if (combinedAgents !== oldData.agent) {
                    updates.agent = combinedAgents;
                }

                // Mettre à jour la commune et l'agent mobile money si une nouvelle valeur est fournie
                if (transac.commune && transac.commune !== oldData.commune) updates.commune = transac.commune;
                if (transac.agentMobileMoney) updates.agentMobileMoney = transac.agentMobileMoney;
                
                // IMPORTANT: On ne met PAS à jour la date principale de la transaction (date d'arrivée)
                batch.update(docRef, updates);
            } else {
                const docRef = transactionsCollection.doc();
                batch.set(docRef, { 
                    ...transac, 
                    isDeleted: false, 
                    saisiPar: currentUserName, 
                    paymentHistory: [paymentEntry],
                    lastPaymentDate: transac.date // Initialisation
                });
            }
        }

        // B. Enregistrer Dépenses
        dailyExpenses.forEach(exp => {
            const docRef = expensesCollection.doc();
            // Si un conteneur est renseigné, on définit le type sur "Conteneur"
            const typeDepense = exp.conteneur ? "Conteneur" : "Journalière";

            batch.set(docRef, {
                date: exp.date,
                description: `${exp.description} (${currentUserName})`, // Ajout de l'auteur
                montant: exp.montant,
                type: typeDepense,
                isDeleted: false,
                action: "Depense",
                conteneur: exp.conteneur || ""
            });
        });

        await batch.commit();
        alert("Journée enregistrée !");
        
        dailyTransactions = [];
        dailyExpenses = [];
        saveAllToLocalStorage();
        renderAllTables();
    });

    // --- RECHERCHE ---
    referenceInput.addEventListener('change', async () => { 
        const searchValue = referenceInput.value.trim();
        if (!searchValue) { clearDisplayFields(); nomInput.value=''; return; }

        let query = await transactionsCollection.where("reference", "==", searchValue).get();
        if (query.empty) query = await transactionsCollection.where("nom", "==", searchValue).get();

        if (!query.empty) {
            if (query.size > 1) return alert("Plusieurs résultats. Soyez plus précis.");
            fillFormWithData(query.docs[0].data());
        } else {
            // Mode création
        }
    });

    function clearDisplayFields() {
        prixInput.value = ''; conteneurInput.value = ''; resteInput.value = ''; resteInput.className = '';
        montantParisInput.placeholder = 'Montant Paris'; montantAbidjanInput.placeholder = 'Montant Abidjan';
    }

    function fillFormWithData(data) {
        referenceInput.value = data.reference; 
        prixInput.value = data.prix;
        if(!nomInput.value) nomInput.value = data.nom || '';
        conteneurInput.value = data.conteneur || '';
        
        if (data.reste < 0) {
            resteInput.value = data.reste; resteInput.className = 'reste-negatif';
            montantParisInput.placeholder = `Reste: ${formatCFA(Math.abs(data.reste))}`;
            montantAbidjanInput.placeholder = `Reste: ${formatCFA(Math.abs(data.reste))}`;
        } else {
            resteInput.value = 0; resteInput.className = 'reste-positif';
            montantParisInput.placeholder = "Soldé Paris"; montantAbidjanInput.placeholder = "Soldé Abidjan";
        }
    }

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
                if (d.reference) references.add(d.reference);
                if (d.nom) references.add(d.nom);
            });
            if(referenceList) {
                referenceList.innerHTML = '';
                references.forEach(ref => {
                    const opt = document.createElement('option'); opt.value = ref; referenceList.appendChild(opt);
                });
            }
        });
    }

    renderAllTables();
    populateDatalist(); 
});