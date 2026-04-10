document.addEventListener('DOMContentLoaded', async () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: Connexion BDD échouée."); return;
    }

    // SERVICE TRANSACTION (Injecté localement car non chargé via HTML)
    const transactionService = {
        getCleanTransactions(transactions, validatedSessions) {
            return transactions.reduce((acc, t) => {
                let effectivePrix = t.prix || 0;
                if (t.adjustmentType && String(t.adjustmentType).toLowerCase() === 'reduction') {
                    effectivePrix -= (t.adjustmentVal || 0);
                }

                if (!t.paymentHistory || !Array.isArray(t.paymentHistory) || t.paymentHistory.length === 0) {
                    acc.push({
                        ...t,
                        prix: effectivePrix,
                        reste: ((t.montantParis || 0) + (t.montantAbidjan || 0)) - effectivePrix
                    });
                    return acc;
                }
                const validPayments = t.paymentHistory.filter(p => !p.sessionId || validatedSessions.has(p.sessionId));
                const newParis = validPayments.reduce((sum, p) => sum + (p.montantParis || 0), 0);
                const newAbidjan = validPayments.reduce((sum, p) => sum + (p.montantAbidjan || 0), 0);
                const tClean = {
                    ...t,
                    prix: effectivePrix,
                    paymentHistory: validPayments,
                    montantParis: newParis,
                    montantAbidjan: newAbidjan,
                    reste: (newParis + newAbidjan) - effectivePrix
                };
                acc.push(tClean);
                return acc;
            }, []);
        },
        async calculateAvailableBalance(db, unconfirmedSessions) {
            const transSnap = await db.collection("transactions").where("isDeleted", "!=", true).limit(2000).get();
            let totalVentes = 0;
            transSnap.forEach(doc => {
                const d = doc.data();
                if (d.paymentHistory && d.paymentHistory.length > 0) {
                    d.paymentHistory.forEach(pay => {
                        if (pay.sessionId && unconfirmedSessions.has(pay.sessionId)) return;
                        if (pay.modePaiement !== 'Chèque' && pay.modePaiement !== 'Virement') {
                            totalVentes += (pay.montantAbidjan || 0);
                        }
                    });
                } else {
                    if (d.modePaiement !== 'Chèque' && d.modePaiement !== 'Virement') {
                        totalVentes += (d.montantAbidjan || 0);
                    }
                }
            });
            const incSnap = await db.collection("other_income").where("isDeleted", "!=", true).limit(1000).get();
            let totalAutres = 0;
            incSnap.forEach(doc => {
                const d = doc.data();
                if (d.mode !== 'Virement' && d.mode !== 'Chèque') {
                    totalAutres += (d.montant || 0);
                }
            });
            const expSnap = await db.collection("expenses").where("isDeleted", "!=", true).limit(1000).get();
            let totalDepenses = 0;
            expSnap.forEach(doc => {
                const d = doc.data();
                if (d.sessionId && unconfirmedSessions.has(d.sessionId)) return;
                if (d.mode !== 'Virement' && d.mode !== 'Chèque') {
                    totalDepenses += (d.montant || 0);
                }
            });
            const bankSnap = await db.collection("bank_movements").where("isDeleted", "!=", true).limit(1000).get();
            let totalRetraits = 0;
            let totalDepots = 0;
            bankSnap.forEach(doc => {
                const d = doc.data();
                if (d.type === 'Retrait') totalRetraits += (d.montant || 0);
                if (d.type === 'Depot' && d.source !== 'Remise Chèques' && d.source !== 'Solde Initial') totalDepots += (d.montant || 0);
            });
            return (totalVentes + totalAutres + totalRetraits) - (totalDepenses + totalDepots);
        },
        calculateStorageFee(dateString, quantity = 1, compareDate = new Date()) {
            if (!dateString) return { days: 0, fee: 0 };
            const qte = parseInt(quantity) || 1;
            const arrivalDate = new Date(dateString);
            const diffTime = compareDate - arrivalDate;
            if (diffTime < 0) return { days: 0, fee: 0 };
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays <= 7) return { days: diffDays, fee: 0 };
            else if (diffDays <= 14) return { days: diffDays, fee: 10000 };
            else {
                const extraDays = diffDays - 14;
                const unitFee = 10000 + (extraDays * 1000);
                return { days: diffDays, fee: unitFee * qte };
            }
        }
    };

    const transactionsCollection = db.collection("transactions");
    const expensesCollection = db.collection("expenses");
    const bankCollection = db.collection("bank_movements");
    const livraisonsCollection = db.collection("livraisons");

    // Récupération du nom de l'utilisateur connecté
    const currentUserName = sessionStorage.getItem('userName') || 'Utilisateur';

    const agentSelectElement = document.getElementById('agent');
    const addAgentBtn = document.getElementById('addAgentBtn');

    const agentChoices = new Choices(agentSelectElement, {
        removeItemButton: true, placeholder: true, searchPlaceholderValue: 'Rechercher un agent...',
        shouldSort: false, itemSelectText: '',
    });

    // --- GESTION DYNAMIQUE DES AGENTS (Firestore) ---
    db.collection("agents").orderBy("name").onSnapshot(snapshot => {
        if (snapshot.empty) {
            // MIGRATION AUTOMATIQUE : Si la liste est vide, on ajoute les agents par défaut
            const defaults = ["Adboul Paris", "Ali Paris", "Autres Paris", "AZIZ", "Bakary Paris", "Cesar", "Cheick Paris", "Lauraine", "Coulibaly Traoré Mah", "Demba Paris", "Drissa Paris", "Fatim Paris", "Hamza", "JB", "Julien", "Kady Paris", "Maley", "Males", "Mohamed Paris", "Moussa Paris", "Salif", "Samba", "Touré", "Blanche"];
            const batch = db.batch();
            defaults.forEach(name => {
                const ref = db.collection("agents").doc();
                batch.set(ref, { name: name });
            });
            batch.commit().then(() => console.log("Liste agents initialisée."));
            return;
        }

        const agents = snapshot.docs.map(doc => ({ value: doc.data().name, label: doc.data().name, id: doc.id }));
        agentChoices.clearChoices();
        agentChoices.setChoices(agents, 'value', 'label', true);
    });

    if (addAgentBtn) {
        addAgentBtn.addEventListener('click', async () => {
            const newName = await AppModal.prompt("Nom du nouvel agent :", "", "Nouvel Agent");
            if (newName && newName.trim()) {
                db.collection("agents").add({ name: newName.trim() }).then(() => AppModal.success("Agent ajouté !")).catch(e => AppModal.error(e.message));
            }
        });
    }

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

    // --- AJOUT LABELS VISUELS (Paris/Abidjan) ---
    [
        { input: montantParisInput, label: "PARIS", color: "#1e40af" },
        { input: montantAbidjanInput, label: "ABIDJAN", color: "#9a3412" }
    ].forEach(item => {
        if (item.input && item.input.parentNode) {
            const wrapper = document.createElement('div');
            wrapper.style.display = 'flex';
            wrapper.style.flexDirection = 'column';
            wrapper.style.width = '100%'; // Force la largeur pour l'alignement
            
            const label = document.createElement('span');
            label.textContent = item.label;
            label.style.fontSize = '12px';
            label.style.fontWeight = 'bold';
            label.style.marginBottom = '4px';
            label.style.color = item.color;
            
            item.input.parentNode.insertBefore(wrapper, item.input);
            wrapper.appendChild(label);
            wrapper.appendChild(item.input);
        }
    });

    const resteInput = document.getElementById('reste');
    const communeInput = document.getElementById('commune');
    // NOUVEAU : Inputs Ajustement (Réduction / Augmentation)
    const adjustmentTypeInput = document.getElementById('adjustmentType');
    const adjustmentValInput = document.getElementById('adjustmentVal');
    const referenceList = document.getElementById('referenceList');
    
    // NOUVEAU : ÉLÉMENTS DÉPENSES LIVREUR
    const addQuickExpenseBtn = document.getElementById('addQuickExpenseBtn');
    const quickExpenseDesc = document.getElementById('quickExpenseDesc');
    const quickExpenseAmount = document.getElementById('quickExpenseAmount');
    const dailyExpensesTableBody = document.getElementById('dailyExpensesTableBody');
    // GESTION AFFICHAGE AVANCÉ
    const toggleAdvancedBtn = document.getElementById('toggleAdvancedBtn');
    const advancedFields = document.getElementById('advancedFields');
    if (toggleAdvancedBtn && advancedFields) {
        toggleAdvancedBtn.addEventListener('click', () => {
            const isHidden = advancedFields.style.display === 'none';
            advancedFields.style.display = isHidden ? 'grid' : 'none';
            toggleAdvancedBtn.textContent = isHidden ? '▲ Masquer les options' : '▼ Plus d\'options (Agents, Commune, Ajustements)';
        });
    }

    // TOTAUX
    const dailyTotalAbidjanEspecesEl = document.getElementById('dailyTotalAbidjanEspeces');
    const dailyTotalExpensesEl = document.getElementById('dailyTotalExpenses');
    const netToPayEl = document.getElementById('netToPay');
    
    const dailyTotalParisEl = document.getElementById('dailyTotalParis');
    const dailyTotalMobileMoneyEl = document.getElementById('dailyTotalMobileMoney');
    const dailyTotalResteEl = document.getElementById('dailyTotalReste');

    let dailyTransactions = JSON.parse(localStorage.getItem('dailyTransactions')) || [];
    let dailyExpenses = JSON.parse(localStorage.getItem('dailyExpenses')) || [];
    let currentStorageFeeWaived = false; // État pour savoir si le magasinage est annulé pour la saisie en cours
    let currentIsNewAdjustment = false; // État pour savoir si un frais a été ajouté

    // --- GESTION DYNAMIQUE BANQUE (VIREMENT/CHÈQUE) ---
    // On crée le sélecteur de banque dynamiquement pour ne pas toucher au HTML
    const bankSelect = document.createElement('select');
    bankSelect.id = 'banquePaiement';
    bankSelect.style.display = 'none'; // Masqué par défaut
    bankSelect.innerHTML = `
        <option value="" disabled selected>Choisir la Banque...</option>
        <option value="BICICI BANK">BICICI BANK</option>
        <option value="BRIDGE BANK">BRIDGE BANK</option>
        <option value="ORANGE BANK">ORANGE BANK</option>
    `;
    // Insertion après le champ Mode de Paiement
    if(modePaiementInput && modePaiementInput.parentNode) {
        modePaiementInput.parentNode.insertBefore(bankSelect, modePaiementInput.nextSibling);
    }

    function updatePaymentUI() {
        const mode = modePaiementInput.value;
        if (mode === 'Virement' || mode === 'Chèque') {
            bankSelect.style.display = 'block';
            agentMobileMoneyInput.style.display = 'none'; // On cache le champ texte libre
        } else {
            bankSelect.style.display = 'none';
            agentMobileMoneyInput.style.display = 'block'; // On réaffiche le champ texte (pour OM/Wave/Autre)
        }
    }
    modePaiementInput.addEventListener('change', updatePaymentUI);
    updatePaymentUI(); // Init

    // --- 1. GESTION ENCAISSEMENTS (COLIS) ---
    addEntryBtn.addEventListener('click', () => {
        const selectedAgents = agentChoices.getValue(true); 
        const agentString = selectedAgents.join(', '); 

        // Logique pour récupérer le détail (Banque OU Agent MM)
        let detailPaiement = agentMobileMoneyInput.value;
        if (bankSelect.style.display !== 'none') {
            detailPaiement = bankSelect.value;
            if (!detailPaiement) return AppModal.error("Veuillez sélectionner une Banque.");
        }

        const newData = {
            date: document.getElementById('date').value,
            reference: referenceInput.value.trim(),
            nom: nomInput.value.trim(),
            conteneur: conteneurInput.value.trim().toUpperCase(),
            prix: parseFloat(prixInput.value) || 0,
            montantParis: parseFloat(montantParisInput.value) || 0,
            montantAbidjan: parseFloat(montantAbidjanInput.value) || 0,
            agentMobileMoney: detailPaiement, // On stocke la banque ici
            modePaiement: modePaiementInput.value,
            commune: communeInput.value, 
            agent: agentString,
            reste: 0,
            adjustmentType: adjustmentTypeInput ? adjustmentTypeInput.value : '',
            adjustmentVal: adjustmentValInput ? (parseFloat(adjustmentValInput.value) || 0) : 0,
            waiveStorageFee: currentStorageFeeWaived, // On stocke la décision d'annulation
            isNewAdjustment: currentIsNewAdjustment // On stocke si c'est un nouveau frais
        };

        if (!newData.date || !newData.reference) return AppModal.error("Veuillez remplir la date et la référence/nom.");
        if (newData.prix <= 0) return AppModal.error("Le prix saisi est invalide.");

        let effectivePrix = newData.prix;
        if (newData.adjustmentType === 'reduction' && newData.adjustmentVal > 0) {
            effectivePrix -= newData.adjustmentVal;
        } else if (newData.adjustmentType === 'augmentation' && newData.adjustmentVal > 0) {
            // Si c'est une augmentation manuelle, on l'incorpore au prix pour la validation et l'enregistrement
            if (!newData.isNewAdjustment) {
                newData.prix += newData.adjustmentVal;
                effectivePrix = newData.prix;
                newData.isNewAdjustment = true;
            }
        }

        const totalPaye = newData.montantParis + newData.montantAbidjan;
        if (totalPaye > effectivePrix) return AppModal.error(`IMPOSSIBLE : Trop perçu (le paiement dépasse le prix après réduction).`);
        newData.reste = totalPaye - effectivePrix;

        // CORRECTION : On vérifie la Référence ET le Mode de Paiement pour permettre le fractionnement
        const existingIndex = dailyTransactions.findIndex(t => t.reference === newData.reference && t.modePaiement === newData.modePaiement);
        if (existingIndex > -1) {
            const t = dailyTransactions[existingIndex];

            // On met à jour l'ajustement si présent dans la nouvelle saisie
            if (newData.adjustmentType) { 
                t.adjustmentType = newData.adjustmentType; 
                t.adjustmentVal = newData.adjustmentVal; 
            }
            if (newData.isNewAdjustment && !t.isNewAdjustment) { 
                t.isNewAdjustment = true; 
                if (newData.adjustmentType === 'augmentation') {
                    t.prix += newData.adjustmentVal;
                }
            }

            let effectivePrixExistant = t.prix;
            if (t.adjustmentType === 'reduction' && t.adjustmentVal > 0) {
                effectivePrixExistant -= t.adjustmentVal;
            }

            const nouveauTotal = t.montantParis + t.montantAbidjan + newData.montantParis + newData.montantAbidjan;
            if (nouveauTotal > effectivePrixExistant) return AppModal.error("IMPOSSIBLE : Cumul trop élevé (dépasse le prix après réduction).");
            
            t.montantParis += newData.montantParis;
            t.montantAbidjan += newData.montantAbidjan;
            if (newData.agentMobileMoney) t.agentMobileMoney = newData.agentMobileMoney;
            t.modePaiement = newData.modePaiement; 
            t.reste = (t.montantParis + t.montantAbidjan) - effectivePrixExistant;

        } else {
            dailyTransactions.push(newData);
        }
        
        saveAllToLocalStorage();
        renderAllTables();
        
        // Reset partiel
        prixInput.value = ''; montantParisInput.value = ''; montantAbidjanInput.value = '';
        agentMobileMoneyInput.value = ''; resteInput.value = '';
        bankSelect.value = ''; // Reset banque
        if(adjustmentTypeInput) adjustmentTypeInput.value = ''; if(adjustmentValInput) adjustmentValInput.value = '';
        referenceInput.value = ''; nomInput.value = ''; conteneurInput.value = '';
        agentChoices.setValue([]); 
        resteInput.className = '';
        referenceInput.focus();
        currentStorageFeeWaived = false; // Reset après ajout
        currentIsNewAdjustment = false; // Reset après ajout
    });

    // --- 2. GESTION DÉPENSES (LIVREUR) ---
    if (addQuickExpenseBtn) {
        addQuickExpenseBtn.addEventListener('click', () => {
            const date = document.getElementById('date').value;
            const desc = quickExpenseDesc.value.trim();
            const amount = parseFloat(quickExpenseAmount.value);
            
            // Dépenses livreur = Mensuelles (Pas de conteneur)
            
            if (!date) return AppModal.error("Veuillez sélectionner la date en haut.");
            if (!desc || isNaN(amount) || amount <= 0) return AppModal.error("Motif ou Montant invalide.");

            dailyExpenses.push({
                date: date,
                description: desc,
                montant: amount,
                conteneur: ''
            });

            saveAllToLocalStorage();
            renderAllTables();

            quickExpenseDesc.value = '';
            quickExpenseAmount.value = '';
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
            let priceDisplay = formatCFA(data.prix);
            if (data.adjustmentType === 'reduction') priceDisplay += ' ⬇️';
            if (data.adjustmentType === 'augmentation') priceDisplay += ' ⬆️';

            dailyTableBody.innerHTML += `
                <tr>
                    <td>${data.reference}</td><td>${data.nom || '-'}</td><td>${priceDisplay}</td>
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
        let totalExpenses = 0;
        let totalReste = 0;
        const breakdown = {};

        // Calcul Entrées
        dailyTransactions.forEach(t => {
            const mode = t.modePaiement || 'Espèce';
            const amount = (t.montantAbidjan || 0) + (t.montantParis || 0);
            
            if (!breakdown[mode]) breakdown[mode] = 0;
            breakdown[mode] += amount;

            if (t.modePaiement === 'Espèce') {
                totalAbidjanEsp += (t.montantAbidjan || 0);
            }
            totalParis += (t.montantParis || 0);
            totalReste += (t.reste || 0);
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
        if(dailyTotalResteEl) dailyTotalResteEl.textContent = formatCFA(totalReste);

        // Affichage Breakdown (Détail par mode)
        const breakdownContainer = document.getElementById('paymentBreakdown');
        if (breakdownContainer) {
            breakdownContainer.innerHTML = '';
            for (const [mode, amount] of Object.entries(breakdown)) {
                if (amount > 0) {
                    const div = document.createElement('div');
                    div.className = 'summary-item';
                    div.style.fontSize = '0.8em';
                    div.innerHTML = `<h4>${mode}</h4><span style="color:#0d47a1; font-weight:bold;">${formatCFA(amount)}</span>`;
                    breakdownContainer.appendChild(div);
                }
            }
        }
    }

    // Fonctions globales pour onclick
    window.removeTransaction = (i) => { dailyTransactions.splice(i, 1); saveAllToLocalStorage(); renderAllTables(); };
    window.removeExpense = (i) => { dailyExpenses.splice(i, 1); saveAllToLocalStorage(); renderAllTables(); };

    // --- 4. ENREGISTREMENT FINAL ---
    saveDayBtn.addEventListener('click', async () => {
        if (dailyTransactions.length === 0 && dailyExpenses.length === 0) return AppModal.error("Rien à enregistrer, la session est vide.");
        
        let totalsByMode = {};
        let totalEspAbidjan = 0;
        let totalDep = 0;

        dailyTransactions.forEach(t => {
            const mode = t.modePaiement || 'Espèce';
            const amount = (t.montantAbidjan || 0) + (t.montantParis || 0);
            if (amount > 0) totalsByMode[mode] = (totalsByMode[mode] || 0) + amount;
            if (mode === 'Espèce') totalEspAbidjan += (t.montantAbidjan || 0);
        });

        dailyExpenses.forEach(e => totalDep += e.montant);
        
        let msg = "CONFIRMATION :\n\n";
        for (const [mode, amount] of Object.entries(totalsByMode)) { msg += `Encaissements ${mode} : ${formatCFA(amount)}\n`; }
        if (Object.keys(totalsByMode).length === 0) msg += "Aucun encaissement.\n";
        msg += `Dépenses Livreur : ${formatCFA(totalDep)}\n\nNET À VERSER (Espèces) : ${formatCFA(totalEspAbidjan - totalDep)}\n\nEnregistrer ?`;

        if (!await AppModal.confirm(msg, "Validation de la Journée")) return;

        const batch = db.batch();
        // CRÉATION ID SESSION UNIQUE (Pour distinguer les sessions du même jour)
        const auditRef = db.collection("audit_logs").doc();
        const currentSessionId = auditRef.id;

        // TABLEAUX POUR STOCKER LES IDs FIXES (Pour la confirmation robuste)
        const touchedTransactionIds = [];
        const touchedExpenseIds = [];

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
                sessionId: currentSessionId // <-- AJOUT CLÉ : On lie le paiement à cette session précise
            }));

            const query = await transactionsCollection.where("reference", "==", ref).get();

            if (!query.empty) {
                const docRef = query.docs[0].ref;
                const oldData = query.docs[0].data();
                const dailyMetadata = group[group.length - 1];

                let finalPrix = oldData.prix || 0;
                let finalAdjustmentType = dailyMetadata.adjustmentType || oldData.adjustmentType;
                let finalAdjustmentVal = dailyMetadata.adjustmentVal || oldData.adjustmentVal || 0;

                // GESTION AUGMENTATION PRIX (MAGASINAGE)
                const augmentationItem = group.find(t => t.isNewAdjustment === true && t.adjustmentType === 'augmentation');
                if (augmentationItem) {
                    finalPrix += augmentationItem.adjustmentVal;
                }

                let effectivePrix = finalPrix;
                if (finalAdjustmentType === 'reduction') {
                    effectivePrix -= finalAdjustmentVal;
                }

                const newTotalParis = (oldData.montantParis || 0) + totalParis;
                const newTotalAbidjan = (oldData.montantAbidjan || 0) + totalAbidjan;
                const newReste = newTotalParis + newTotalAbidjan - effectivePrix;

                const updates = {
                    montantParis: newTotalParis,
                    montantAbidjan: newTotalAbidjan,
                    reste: newReste,
                    paymentHistory: firebase.firestore.FieldValue.arrayUnion(...newPaymentEntries),
                    lastPaymentDate: baseTransac.date,
                    saisiPar: currentUserName,
                    isDeleted: false, // Réactivation automatique si le dossier était supprimé
                    modePaiement: baseTransac.modePaiement // CORRECTION : On met à jour le mode de paiement principal
                };

                // Fusion des agents
                const oldAgents = (oldData.agent || "").split(',').map(a => a.trim()).filter(Boolean);
                const groupAgents = group.map(t => t.agent).join(', ').split(',').map(a => a.trim()).filter(Boolean);
                const combinedAgents = [...new Set([...oldAgents, ...groupAgents])].join(', ');
                
                if (combinedAgents !== oldData.agent) updates.agent = combinedAgents;

                // Mise à jour Magasinage (Si annulé dans l'une des saisies du groupe)
                if (group.some(t => t.waiveStorageFee)) {
                    updates.storageFeeWaived = true;
                }

                // Mise à jour infos (Commune, etc.) depuis la dernière entrée du groupe
                if (dailyMetadata.commune && dailyMetadata.commune !== oldData.commune) updates.commune = dailyMetadata.commune;
                if (dailyMetadata.agentMobileMoney) updates.agentMobileMoney = dailyMetadata.agentMobileMoney;
                
                // GESTION AUGMENTATION PRIX (MAGASINAGE)
                // On cherche si une des transactions du groupe contient une augmentation de prix NOUVELLE
                if (augmentationItem) {
                    updates.prix = finalPrix;
                    updates.adjustmentType = 'augmentation';
                    updates.adjustmentVal = augmentationItem.adjustmentVal;
                } else if (dailyMetadata.adjustmentType) {
                    updates.adjustmentType = finalAdjustmentType;
                    updates.adjustmentVal = finalAdjustmentVal;
                }

                batch.update(docRef, updates);
                touchedTransactionIds.push(docRef.id); // Sauvegarde ID existant
            } else {
                const docRef = transactionsCollection.doc();
                
                const groupAgents = group.map(t => t.agent).join(', ').split(',').map(a => a.trim()).filter(Boolean);
                const combinedAgents = [...new Set(groupAgents)].join(', ');

                let effectivePrix = baseTransac.prix;
                if (baseTransac.adjustmentType === 'reduction' && baseTransac.adjustmentVal > 0) {
                    effectivePrix -= baseTransac.adjustmentVal;
                }

                batch.set(docRef, { 
                    ...baseTransac, // Reprend date, ref, nom, conteneur, prix...
                    montantParis: totalParis,
                    montantAbidjan: totalAbidjan,
                    reste: (totalParis + totalAbidjan) - effectivePrix,
                    agent: combinedAgents,
                    isDeleted: false, 
                    saisiPar: currentUserName, 
                    paymentHistory: newPaymentEntries,
                    lastPaymentDate: baseTransac.date,
                    storageFeeWaived: group.some(t => t.waiveStorageFee) // Pour nouveau doc aussi
                });
                touchedTransactionIds.push(docRef.id); // Sauvegarde nouvel ID
            }

            // --- SYNCHRONISATION AVEC LIVRAISON ---
            // Si on modifie/crée une transaction, on met à jour le colis correspondant dans Livraison
            const livQuery = await livraisonsCollection.where("ref", "==", ref).limit(1).get();
            if (!livQuery.empty) {
                const livDoc = livQuery.docs[0];
                const livUpdates = {};
                
                // Mise à jour Conteneur
                if (baseTransac.conteneur && baseTransac.conteneur !== livDoc.data().conteneur) {
                    livUpdates.conteneur = baseTransac.conteneur;
                }
                // Mise à jour Nom (Destinataire)
                if (baseTransac.nom && baseTransac.nom !== livDoc.data().destinataire) {
                    livUpdates.destinataire = baseTransac.nom;
                }

                if (Object.keys(livUpdates).length > 0) {
                    batch.update(livDoc.ref, livUpdates);
                }
            }
        }

        // B. Enregistrer Dépenses
        dailyExpenses.forEach(exp => {
            const docRef = expensesCollection.doc();
            // Si un conteneur est renseigné, on définit le type sur "Conteneur"
            const typeDepense = exp.conteneur ? "Conteneur" : "Mensuelle";

            batch.set(docRef, {
                date: exp.date,
                description: `${exp.description} (${currentUserName})`, // Ajout de l'auteur
                montant: exp.montant,
                type: typeDepense,
                isDeleted: false,
                conteneur: exp.conteneur || "",
                sessionId: currentSessionId // <-- AJOUT CLÉ
            });
            touchedExpenseIds.push(docRef.id); // Sauvegarde ID dépense
        });

        // --- MISE À JOUR DU LOG D'AUDIT AVEC LES IDs ---
        // On ajoute les IDs au document audit_log créé plus haut (nécessite de récupérer sa ref)
        // Comme on a fait un add() simple plus haut sans garder la ref, on va refaire un add() propre ici ou modifier l'approche.
        // Mieux : On remplace le add() du début par celui-ci qui contient tout.
        
        // NOTE : J'ai supprimé le premier db.collection("audit_logs").add(...) du début de la fonction pour le mettre ici
        // afin d'inclure les IDs.
        
        // --- AJOUT : Collecte des agents pour le résumé de session ---
        const sessionAgentsSet = new Set();
        dailyTransactions.forEach(t => {
            if (t.agent) {
                t.agent.split(',').forEach(a => {
                    const trimmed = a.trim();
                    if (trimmed) sessionAgentsSet.add(trimmed);
                });
            }
        });
        const sessionAgentsStr = Array.from(sessionAgentsSet).join(', ');

        // DÉTERMINATION INTELLIGENTE DE LA DATE DE SAISIE
        // On privilégie la date des transactions saisies, sinon la date du champ, sinon aujourd'hui
        let realEntryDate = "";
        if (dailyTransactions.length > 0) {
            realEntryDate = dailyTransactions[0].date;
        } else if (dailyExpenses.length > 0) {
            realEntryDate = dailyExpenses[0].date;
        } else {
            realEntryDate = document.getElementById('date').value;
        }
        if (!realEntryDate) realEntryDate = new Date().toISOString().split('T')[0];

        let detailsStr = `Encaissements: ${dailyTransactions.length}, Dépenses: ${dailyExpenses.length} | Espèces: ${totalEspAbidjan}`;
        for (const [m, a] of Object.entries(totalsByMode)) {
            if (m !== 'Espèce') detailsStr += `, ${m}: ${a}`;
        }

        batch.set(auditRef, {
            date: new Date().toISOString(),
            entryDate: realEntryDate, // Utilisation de la date réelle des opérations
            user: currentUserName,
            action: "VALIDATION_JOURNEE",
            details: detailsStr, // Affiche tous les modes de paiement pour rassurer l'administrateur
            targetId: "BATCH",
            status: "PENDING", // Statut initial
            transactionIds: touchedTransactionIds, // LA CLÉ DE LA ROBUSTESSE
            expenseIds: touchedExpenseIds,
            agents: sessionAgentsStr, // <-- AJOUT DU CHAMP AGENTS
            totalIn: totalEspAbidjan, // OPTIMISATION AUDIT : Stockage direct des totaux
            totalGlobalIn: Object.values(totalsByMode).reduce((sum, val) => sum + val, 0), // Total tous modes confondus
            totalOut: totalDep,
            result: totalEspAbidjan - totalDep
        });

        try {
            await batch.commit();
        } catch (error) {
            console.error("Erreur Enregistrement:", error);
            if (error.code === 'resource-exhausted') {
                AppModal.error("⚠️ Vous avez dépassé la limite d'écriture quotidienne Firebase (20 000 opérations).\n\nVeuillez réessayer demain.", "QUOTA ATTEINT");
            } else {
                AppModal.error("Erreur lors de l'enregistrement : " + error.message);
            }
            return; // Arrêt si erreur
        }
        
        // --- WHATSAPP FEATURE ---
        const rawDate = document.getElementById('date').value;
        const dateStr = rawDate ? rawDate.split('-').reverse().join('/') : new Date().toLocaleDateString('fr-FR');
        
        let waMsg = `*BILAN JOURNÉE DU ${dateStr}*\n`;
        waMsg += `👤 *${currentUserName}*\n\n`;
        
        // AJOUT : Détails complets des opérations
        if (dailyTransactions.length > 0) {
            waMsg += `📦 *DÉTAIL OPÉRATIONS :*\n`;
            dailyTransactions.forEach(t => {
                const mtAbj = t.montantAbidjan > 0 ? formatCFA(t.montantAbidjan) : "0 F";
                const mtPar = t.montantParis > 0 ? ` (+ Paris: ${formatCFA(t.montantParis)})` : "";
                const commune = t.commune ? `📍 ${t.commune}` : "";
                const info = t.agentMobileMoney ? `ℹ️ ${t.agentMobileMoney}` : "";
                
                waMsg += `🔹 *${t.reference}* ${t.nom ? `(${t.nom})` : ''}\n`;
                if (commune) waMsg += `   ${commune}\n`;
                waMsg += `   💰 ${mtAbj} [${t.modePaiement}]${mtPar} ${info}\n`;
            });
            waMsg += `\n`;
        }

        waMsg += `💰 *TOTAL ESPÈCES :* ${formatCFA(totalEspAbidjan)}\n`;
        
        if (dailyExpenses.length > 0) {
            waMsg += `\n📉 *DÉPENSES (${formatCFA(totalDep)}) :*\n`;
            dailyExpenses.forEach(e => {
                waMsg += `- ${e.description} : ${formatCFA(e.montant)}\n`;
            });
        }
        
        const net = totalEspAbidjan - totalDep;
        waMsg += `\n💵 *NET À VERSER :* ${formatCFA(net)}`;

        await AppModal.success("Les opérations de la journée ont été validées avec succès.", "Journée enregistrée");
        if (await AppModal.confirm("Voulez-vous envoyer le bilan récapitulatif par WhatsApp ?", "Bilan WhatsApp")) {
            window.open(`https://wa.me/?text=${encodeURIComponent(waMsg)}`, '_blank');
        }
        
        dailyTransactions = [];
        dailyExpenses = [];
        saveAllToLocalStorage();
        renderAllTables();
    });

    // --- RECHERCHE ---
    referenceInput.addEventListener('change', async () => { 
        const searchValue = referenceInput.value.trim();
        currentStorageFeeWaived = false; // Reset par défaut
        currentIsNewAdjustment = false; // Reset par défaut
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
        let query = await transactionsCollection.where("reference", "==", searchValue).limit(10).get();
        if (query.empty) query = await transactionsCollection.where("nom", "==", searchValue).limit(10).get();

        if (!query.empty) {
            if (query.size > 1) return AppModal.error("Plusieurs résultats correspondent à cette recherche. Soyez plus précis.");
            const data = query.docs[0].data();

            // NOUVEAU: Appliquer dynamiquement la réduction pour l'affichage Caisse (Sécurité) - NE PAS MODIFIER data.prix
            let effectivePrixForDisplay = data.prix || 0;
            if (data.adjustmentType && String(data.adjustmentType).toLowerCase() === 'reduction') {
                effectivePrixForDisplay -= (data.adjustmentVal || 0);
            }
            const paye = (data.montantParis || 0) + (data.montantAbidjan || 0);
            data.reste = paye - effectivePrixForDisplay; // On met à jour le reste pour l'affichage, mais pas le prix.

            // LOGIQUE MAGASINAGE : Si dette (reste < 0) et pas encore annulé
            if ((data.reste || 0) < 0 && !data.storageFeeWaived) {
                const inputDateVal = document.getElementById('date').value;
                const compareDate = inputDateVal ? new Date(inputDateVal) : new Date();
                const { fee } = transactionService.calculateStorageFee(data.date, 1, compareDate);
                if (fee > 0) {
                    const userResponse = await AppModal.prompt(
                        `⚠️ FRAIS DE MAGASINAGE : ${formatCFA(fee)}\n\n` +
                        `Veuillez confirmer l'action :\n` +
                        `1. OUI (Payer) : Gardez le montant ${fee}\n` +
                        `2. NON (Offrir) : Mettez 0\n` +
                        `3. RÉDUIRE : Modifiez le montant\n` +
                        `4. ANNULER : Cliquez sur Annuler`, fee, "Action Requise"
                    );

                    if (userResponse === null) { referenceInput.value = ''; return; }

                    const amount = parseFloat(userResponse);
                    if (isNaN(amount)) { AppModal.error("Le montant saisi est invalide."); referenceInput.value = ''; return; }

                    if (amount === 0) {
                        currentStorageFeeWaived = true;
                        AppModal.success("Frais de magasinage OFFERTS.");
                    } else {
                        data.prix = (data.prix || 0) + amount;
                        data.reste = ((data.montantParis || 0) + (data.montantAbidjan || 0)) - data.prix;
                        data.adjustmentType = 'augmentation';
                        data.adjustmentVal = amount;
                        currentIsNewAdjustment = true;
                        AppModal.success(`Frais de magasinage de ${formatCFA(amount)} ajoutés au prix.`);
                    }
                }
            }
            fillFormWithData(data);
        } else {
            // Mode création
            
            // --- SAISIE INTELLIGENTE : Recherche dans Livraisons (Paris / À Venir) ---
            const livQuery = await livraisonsCollection.where("ref", "==", searchValue).limit(1).get();
            
            if (!livQuery.empty) {
                const livData = livQuery.docs[0].data();
                
                // Remplissage Nom
                if (livData.destinataire || livData.expediteur) {
                    nomInput.value = livData.destinataire || livData.expediteur;
                    nomInput.style.backgroundColor = "#e0f7fa"; // Feedback visuel (Bleu clair)
                }
                
                // Remplissage Conteneur
                if (livData.conteneur) {
                    conteneurInput.value = livData.conteneur;
                }
                
                // Remplissage Commune
                if (livData.commune && communeInput) {
                    communeInput.value = livData.commune;
                }

                // Remplissage Prix (Si disponible)
                let price = 0;
                if (livData.prixOriginal) {
                    price = parseFloat(String(livData.prixOriginal).replace(/[^\d]/g, '')) || 0;
                }
                if (price === 0 && livData.montant) {
                    price = parseFloat(String(livData.montant).replace(/[^\d]/g, '')) || 0;
                }
                
                if (price > 0) {
                    prixInput.value = price;
                    calculateAndStyleReste();
                }
            }
        }
    });

    function clearDisplayFields() {
        prixInput.value = ''; conteneurInput.value = ''; resteInput.value = ''; resteInput.className = '';
        montantParisInput.placeholder = 'Montant Paris'; montantAbidjanInput.placeholder = 'Montant Abidjan';
        bankSelect.value = '';
        if(adjustmentTypeInput) adjustmentTypeInput.value = '';
        if(adjustmentValInput) adjustmentValInput.value = '';
    }

    function fillFormWithData(data) {
        referenceInput.value = data.reference; 
        if(!nomInput.value) nomInput.value = data.nomDestinataire || data.nom || '';
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

        if (adjustmentTypeInput && data.adjustmentType) adjustmentTypeInput.value = data.adjustmentType;
        if (adjustmentValInput && data.adjustmentVal) adjustmentValInput.value = data.adjustmentVal;

        // Pré-remplissage Mode & Banque
        if (data.modePaiement) {
            modePaiementInput.value = data.modePaiement;
            updatePaymentUI();
            if ((data.modePaiement === 'Virement' || data.modePaiement === 'Chèque') && data.agentMobileMoney) {
                bankSelect.value = data.agentMobileMoney;
            }
        }
    }

    prixInput.addEventListener('input', calculateAndStyleReste);
    montantParisInput.addEventListener('input', calculateAndStyleReste);
    montantAbidjanInput.addEventListener('input', calculateAndStyleReste);
    if (adjustmentTypeInput) adjustmentTypeInput.addEventListener('change', calculateAndStyleReste);
    if (adjustmentValInput) adjustmentValInput.addEventListener('input', calculateAndStyleReste);

    function calculateAndStyleReste() {
        let prix = parseFloat(prixInput.value) || 0;
        const paris = parseFloat(montantParisInput.value) || 0;
        const abidjan = parseFloat(montantAbidjanInput.value) || 0;
        
        const adjType = adjustmentTypeInput ? adjustmentTypeInput.value : '';
        const adjVal = adjustmentValInput ? (parseFloat(adjustmentValInput.value) || 0) : 0;
        
        if (adjType === 'reduction' && adjVal > 0) {
            prix -= adjVal;
        } else if (adjType === 'augmentation' && adjVal > 0) {
            prix += adjVal;
        }
        
        const reste = (paris + abidjan) - prix;
        resteInput.value = reste;
        resteInput.className = reste >= 0 ? 'reste-positif' : 'reste-negatif'; // Utilisation de >= 0 pour que "0" soit en vert (Soldé)
    }

    function formatCFA(n) { return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(n || 0); }
    
    function populateDatalist() {
        // OPTIMISATION : On réduit la liste d'autocomplétion aux 200 derniers éléments
        transactionsCollection.where("isDeleted", "!=", true).orderBy("isDeleted").orderBy("date", "desc").limit(200).get().then(snapshot => {
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
    initBackToTopButton();
});