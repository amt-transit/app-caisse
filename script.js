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

        // CORRECTION : On vérifie la Référence ET le Mode de Paiement pour permettre le fractionnement
        const existingIndex = dailyTransactions.findIndex(t => t.reference === newData.reference && t.modePaiement === newData.modePaiement);
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

        // --- JOURNAL D'AUDIT ---
        db.collection("audit_logs").add({
            date: new Date().toISOString(),
            user: currentUserName,
            action: "VALIDATION_JOURNEE",
            details: `Encaissements: ${dailyTransactions.length}, Dépenses: ${dailyExpenses.length}, Total Esp: ${totalEsp}`,
            targetId: "BATCH"
        });
        // -----------------------

        const batch = db.batch();

        // A. Enregistrer Transactions (GROUPÉ PAR RÉFÉRENCE)
        // On regroupe d'abord les paiements fractionnés par référence
        const transactionsByRef = {};
        dailyTransactions.forEach(t => {
            if (!transactionsByRef[t.reference]) transactionsByRef[t.reference] = [];
            transactionsByRef[t.reference].push(t);
        });

        for (const ref of Object.keys(transactionsByRef)) {
            const group = transactionsByRef[ref];
            // FIX: On utilise la transaction avec le prix le plus élevé comme référence pour les métadonnées (évite les erreurs si ordre mélangé)
            const baseTransac = group.reduce((prev, current) => (prev.prix > current.prix) ? prev : current);
            
            // Calcul des totaux pour ce groupe (cette référence)
            const totalParis = group.reduce((sum, t) => sum + t.montantParis, 0);
            const totalAbidjan = group.reduce((sum, t) => sum + t.montantAbidjan, 0);
            
            // Préparation des entrées d'historique
            const newPaymentEntries = group.map(t => ({
                date: t.date,
                montantParis: t.montantParis,
                montantAbidjan: t.montantAbidjan,
                agent: t.agent,
                saisiPar: currentUserName,
                modePaiement: t.modePaiement,
                agentMobileMoney: t.agentMobileMoney,
                checkStatus: (t.modePaiement === 'Chèque') ? 'Pending' : 'Cleared'
            }));

            const query = await transactionsCollection.where("reference", "==", ref).get();

            if (!query.empty) {
                const docRef = query.docs[0].ref;
                const oldData = query.docs[0].data();

                const updates = {
                    montantParis: (oldData.montantParis || 0) + totalParis,
                    montantAbidjan: (oldData.montantAbidjan || 0) + totalAbidjan,
                    reste: (oldData.reste || 0) + totalParis + totalAbidjan,
                    paymentHistory: firebase.firestore.FieldValue.arrayUnion(...newPaymentEntries),
                    lastPaymentDate: baseTransac.date,
                    saisiPar: currentUserName,
                    isDeleted: false // Réactivation automatique si le dossier était supprimé
                };

                // Fusion des agents
                const oldAgents = (oldData.agent || "").split(',').map(a => a.trim()).filter(Boolean);
                const groupAgents = group.map(t => t.agent).join(', ').split(',').map(a => a.trim()).filter(Boolean);
                const combinedAgents = [...new Set([...oldAgents, ...groupAgents])].join(', ');
                
                if (combinedAgents !== oldData.agent) updates.agent = combinedAgents;

                // Mise à jour infos (Commune, etc.) depuis la dernière entrée du groupe
                const lastTransac = group[group.length - 1];
                if (lastTransac.commune && lastTransac.commune !== oldData.commune) updates.commune = lastTransac.commune;
                if (lastTransac.agentMobileMoney) updates.agentMobileMoney = lastTransac.agentMobileMoney;
                
                batch.update(docRef, updates);
            } else {
                const docRef = transactionsCollection.doc();
                
                // Pour un nouveau doc, on fusionne les agents du groupe
                const groupAgents = group.map(t => t.agent).join(', ').split(',').map(a => a.trim()).filter(Boolean);
                const combinedAgents = [...new Set(groupAgents)].join(', ');

                batch.set(docRef, { 
                    ...baseTransac, // Reprend date, ref, nom, conteneur, prix...
                    montantParis: totalParis,
                    montantAbidjan: totalAbidjan,
                    reste: (totalParis + totalAbidjan) - baseTransac.prix, // Reste calculé sur le total payé vs prix
                    agent: combinedAgents,
                    isDeleted: false, 
                    saisiPar: currentUserName, 
                    paymentHistory: newPaymentEntries,
                    lastPaymentDate: baseTransac.date
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

        // 1. Vérifier d'abord les transactions du jour (Pour le fractionnement immédiat)
        const dailyItems = dailyTransactions.filter(t => t.reference === searchValue);
        if (dailyItems.length > 0) {
             // FIX: On prend l'élément avec le prix le plus élevé comme base (le prix original)
             const base = dailyItems.reduce((prev, current) => (prev.prix > current.prix) ? prev : current);
             const totalPaidDaily = dailyItems.reduce((sum, t) => sum + t.montantParis + t.montantAbidjan, 0);
             // Le reste est calculé par rapport au PRIX ORIGINAL du premier élément saisi
             const currentRest = (totalPaidDaily) - base.prix;
             
             fillFormWithData({
                 reference: base.reference,
                 nom: base.nom,
                 conteneur: base.conteneur,
                 prix: base.prix, 
                 reste: currentRest,
                 isDaily: true
             });
             return;
        }

        // 2. Vérifier dans la Base de Données
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
        if(!nomInput.value) nomInput.value = data.nom || '';
        conteneurInput.value = data.conteneur || '';
        
        if (data.reste < 0) {
            // MODIFICATION : Si dette, le champ "Prix" affiche le montant de la dette à régler
            // Cela permet d'avoir : "200.000 Chèque" pour solder un reste de 200.000
            prixInput.value = Math.abs(data.reste);
            
            resteInput.value = data.reste; 
            resteInput.className = 'reste-negatif';
            montantParisInput.placeholder = `Reste: ${formatCFA(Math.abs(data.reste))}`;
            montantAbidjanInput.placeholder = `Reste: ${formatCFA(Math.abs(data.reste))}`;
        } else {
            // Si pas de dette, on garde le prix original (ou 0 si déjà soldé dans la journée)
            if (data.isDaily) prixInput.value = 0;
            else prixInput.value = data.prix;

            resteInput.value = 0; 
            resteInput.className = 'reste-positif';
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