document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: La connexion à la base de données a échoué."); return;
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

    // CORRECTION : On récupère le nom de l'utilisateur connecté
    const currentUserName = sessionStorage.getItem('userName') || 'Inconnu';
    const userRole = sessionStorage.getItem('userRole');
    const isViewer = userRole === 'spectateur';

    const bankCollection = db.collection("bank_movements");

    const addBankMovementBtn = document.getElementById('addBankMovementBtn');
    const bankDate = document.getElementById('bankDate');
    const bankName = document.getElementById('bankName');
    const bankDesc = document.getElementById('bankDesc');
    const bankAmount = document.getElementById('bankAmount');
    const bankType = document.getElementById('bankType');
    
    const bankTableBody = document.getElementById('bankTableBody');
    const showDeletedCheckbox = document.getElementById('showDeletedCheckbox');
    
    // ÉLÉMENTS IMPORT CSV
    const uploadCsvBtn = document.getElementById('uploadCsvBtn');
    const csvFile = document.getElementById('csvFile');
    const uploadLog = document.getElementById('uploadLog');
    const bankSearchInput = document.getElementById('bankSearch');

    // ÉLÉMENTS TOTAUX
    const totalBankDepositsEl = document.getElementById('totalBankDeposits');
    const totalBankWithdrawalsEl = document.getElementById('totalBankWithdrawals');
    const totalBankBalanceEl = document.getElementById('totalBankBalance');
    const cardBankBalanceEl = document.getElementById('card-bank-balance');
    const totalBiciciEl = document.getElementById('totalBicici');
    const totalBridgeEl = document.getElementById('totalBridge');
    const totalOrangeEl = document.getElementById('totalOrange');

    let unsubscribeBank = null;
    let unsubscribeVirements = null;
    let allBankMovements = [];
    let allVirements = [];
    let allCombinedMovements = [];
    let unconfirmedSessions = new Set(); // Pour filtrer virements et chèques

    // 0. INJECTION DYNAMIQUE DE L'OPTION "PAIEMENT"
    if (bankType && !bankType.querySelector('option[value="Paiement"]')) {
        const opt = document.createElement('option');
        opt.value = "Paiement";
        opt.textContent = "Paiement / Virement (Sortie)";
        // On l'insère après Retrait
        bankType.appendChild(opt);
    }

    // 0b. INJECTION DYNAMIQUE DU CHAMP CONTENEUR (Pour les paiements liés)
    let bankConteneur = document.getElementById('bankConteneur');
    if (!bankConteneur && bankType && bankType.parentNode) {
        bankConteneur = document.createElement('input');
        bankConteneur.id = 'bankConteneur';
        bankConteneur.type = 'text';
        bankConteneur.placeholder = 'Conteneur concerné (Ex: E1)';
        bankConteneur.style.display = 'none'; // Caché par défaut
        bankConteneur.style.marginTop = '5px';
        bankConteneur.style.width = '100%';
        bankConteneur.style.padding = '8px';
        bankConteneur.style.border = '1px solid #ccc';
        bankConteneur.style.borderRadius = '4px';
        
        // Insertion après le sélecteur de type
        bankType.parentNode.insertBefore(bankConteneur, bankType.nextSibling);

        // Affichage conditionnel
        bankType.addEventListener('change', () => {
            bankConteneur.style.display = (bankType.value === 'Paiement') ? 'block' : 'none';
            if (bankType.value !== 'Paiement') bankConteneur.value = '';
        });
    }

    // 1. AJOUT MANUEL
    if (addBankMovementBtn && !isViewer) { addBankMovementBtn.addEventListener('click', async () => {
        const montant = parseFloat(bankAmount.value) || 0;
        const type = bankType.value; 
        const conteneur = bankConteneur ? bankConteneur.value.trim().toUpperCase() : '';

        // DÉTECTION DU SOLDE INITIAL
        const isInitial = bankDesc.value.toLowerCase().includes('initial');

        const data = {
            date: bankDate.value,
            bank: bankName.value,
            // AJOUT DU NOM DE L'AUTEUR
            description: `${bankDesc.value} (${currentUserName})`,
            montant: montant,
            type: type,
            source: isInitial ? 'Solde Initial' : 'Saisie Manuelle',
            isDeleted: false
        };

        if (!data.date || !data.bank || !bankDesc.value || data.montant <= 0) {
            return alert("Veuillez remplir tous les champs (Banque incluse) avec un montant valide.");
        }

        // Sécurité solde
        if (type === 'Depot' && !isInitial) {
            addBankMovementBtn.disabled = true;
            addBankMovementBtn.textContent = "Vérification...";
            try {
                const soldeCaisse = await transactionService.calculateAvailableBalance(db, unconfirmedSessions);
                if (data.montant > soldeCaisse) {
                    alert(`ERREUR : Solde de caisse insuffisant (${formatCFA(soldeCaisse)}) !`);
                    addBankMovementBtn.disabled = false;
                    addBankMovementBtn.textContent = "Enregistrer le Mouvement";
                    return;
                }
            } catch (error) {
                console.error(error);
            }
            addBankMovementBtn.disabled = false;
            addBankMovementBtn.textContent = "Enregistrer le Mouvement";
        }

        bankCollection.add(data).then((docRef) => {
            // AUTOMATISATION : Si c'est un Paiement lié à un Conteneur, on crée la dépense automatiquement
            if (type === 'Paiement' && conteneur) {
                db.collection("expenses").add({
                    date: data.date,
                    description: `${data.description} (Virement Bancaire)`,
                    montant: data.montant,
                    type: 'Conteneur',
                    conteneur: conteneur,
                    mode: 'Virement', // Important : Mode Virement pour ne pas impacter la caisse physique
                    action: 'Depense',
                    isDeleted: false,
                    linkedBankMovementId: docRef.id // Lien pour suppression en cascade
                });
            }

            bankDesc.value = '';
            bankAmount.value = '';
            bankName.value = '';
            if(bankConteneur) bankConteneur.value = '';
        }).catch(err => {
            console.error(err);
            if (err.code === 'resource-exhausted') alert("⚠️ QUOTA ATTEINT : Impossible d'ajouter le mouvement.");
            else alert("Erreur : " + err.message);
        });
    }); } else if (addBankMovementBtn) {
        // Masquer le formulaire pour le spectateur
        const form = document.getElementById('caisseForm');
        if (form) form.style.display = 'none';
    }

    // 2. IMPORT CSV
    if (uploadCsvBtn && !isViewer) {
        uploadCsvBtn.addEventListener('click', () => {
            if (!csvFile.files.length) return alert("Sélectionnez un fichier.");
            
            uploadLog.style.display = 'block';
            uploadLog.textContent = 'Lecture...';

            Papa.parse(csvFile.files[0], {
                header: true, skipEmptyLines: true,
                complete: async (results) => {
                    const batch = db.batch();
                    let count = 0;
                    
                    results.data.forEach(row => {
                        const date = row.date?.trim();
                        const desc = row.description?.trim();
                        const type = row.type?.trim(); // "Depot" ou "Retrait"
                        const montant = parseFloat(row.montant);

                        if (date && desc && type && !isNaN(montant)) {
                            const docRef = bankCollection.doc();
                            batch.set(docRef, {
                                date, description: desc, type, montant, isDeleted: false
                            });
                            count++;
                        }
                    });

                    if (count > 0) {
                        try {
                            await batch.commit();
                            uploadLog.textContent = `Succès : ${count} mouvements importés.`;
                        } catch (err) {
                            if (err.code === 'resource-exhausted') alert("⚠️ QUOTA ATTEINT.");
                            else alert("Erreur : " + err.message);
                        }
                    }
                    csvFile.value = '';
                }
            });
        });
    } else if (uploadCsvBtn) {
        const container = uploadCsvBtn.closest('.import-section') || uploadCsvBtn.parentElement;
        if (container) container.style.display = 'none';
    }

    // 3. AFFICHAGE & RECHERCHE
    function fetchBankMovements() {
        if (unsubscribeBank) unsubscribeBank();
        if (unsubscribeVirements) unsubscribeVirements();
        let query = bankCollection;
        
        if (showDeletedCheckbox.checked) {
            // Si on veut voir les supprimés
            query = query.where("isDeleted", "==", true).orderBy("isDeleted");
        } else {
            // Si on veut voir les actifs (défaut)
            query = query.where("isDeleted", "!=", true).orderBy("isDeleted");
        }
        
        // Ensuite on trie par date
        query = query.orderBy("date", "desc");
        query = query.limit(200); // OPTIMISATION QUOTA

        unsubscribeBank = query.onSnapshot(snapshot => {
            allBankMovements = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), _source: 'bank' }));
            mergeAndRender();
        }, error => console.error(error));

        // B. Virements depuis Transactions
        let transQuery = db.collection("transactions");
        if (showDeletedCheckbox.checked) {
             transQuery = transQuery.where("isDeleted", "==", true);
        } else {
             transQuery = transQuery.where("isDeleted", "!=", true).orderBy("isDeleted");
        }
        transQuery = transQuery.orderBy("date", "desc").limit(200); // OPTIMISATION QUOTA

        unsubscribeVirements = transQuery.onSnapshot(snapshot => {
            const extracted = [];
            snapshot.docs.forEach(doc => {
                const t = doc.data();
                
                // Logique identique au Dashboard pour extraire les paiements
                if (t.paymentHistory && t.paymentHistory.length > 0) {
                    t.paymentHistory.forEach((pay, idx) => {
                        // FILTRE SÉCURITÉ : Ignorer paiement si session non validée
                        if (pay.sessionId && unconfirmedSessions.has(pay.sessionId)) return;

                        if (pay.modePaiement === 'Virement' || pay.modePaiement === 'Chèque') {
                            extracted.push({
                                id: `${doc.id}_${idx}`,
                                date: pay.date,
                                description: `${pay.modePaiement.toUpperCase()} REÇU: ${t.reference} - ${t.nom} (${pay.agentMobileMoney || 'N/A'})`,
                                type: 'Depot',
                                montant: (pay.montantAbidjan || 0) + (pay.montantParis || 0),
                                isDeleted: t.isDeleted,
                                bank: pay.agentMobileMoney, // On récupère la banque ici
                                _source: 'transaction',
                                _docId: doc.id
                            });
                        }
                    });
                } else {
                    if (t.modePaiement === 'Virement' || t.modePaiement === 'Chèque') {
                        extracted.push({
                            id: doc.id,
                            date: t.date,
                            description: `${t.modePaiement.toUpperCase()} REÇU: ${t.reference} - ${t.nom} (${t.agentMobileMoney || 'N/A'})`,
                            type: 'Depot',
                            montant: (t.montantAbidjan || 0) + (t.montantParis || 0),
                            isDeleted: t.isDeleted,
                            bank: t.agentMobileMoney, // On récupère la banque ici
                            _source: 'transaction',
                            _docId: doc.id
                        });
                    }
                }
            });
            allVirements = extracted;
            mergeAndRender();
        }, error => console.error(error));
    }

    // LISTENER : Sessions non validées
    db.collection("audit_logs")
        .where("action", "==", "VALIDATION_JOURNEE")
        .onSnapshot(snapshot => {
            unconfirmedSessions.clear();
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.status !== "VALIDATED") {
                    unconfirmedSessions.add(doc.id); // Utilisation de l'ID de session
                }
            });
            fetchBankMovements(); // Recharger les virements/totaux
        });

    function mergeAndRender() {
        allCombinedMovements = [...allBankMovements, ...allVirements];
        allCombinedMovements.sort((a, b) => new Date(b.date) - new Date(a.date));
        updateBankTotals();
        renderBankTable();
    }

    function updateBankTotals() {
        let totalDepots = 0;
        let totalRetraits = 0;
        let soldeBicici = 0;
        let soldeBridge = 0;
        let soldeOrange = 0;

        allCombinedMovements.forEach(m => {
            const montant = m.montant || 0;
            const bankName = (m.bank || "").toUpperCase();
            let impact = 0;

            if (m.type === 'Depot') {
                totalDepots += montant;
                impact = montant;
            } else if (m.type === 'Retrait' || m.type === 'Paiement') {
                totalRetraits += montant;
                impact = -montant;
            }

            // Ventilation par banque
            if (bankName.includes("BICICI")) soldeBicici += impact;
            else if (bankName.includes("BRIDGE")) soldeBridge += impact;
            else if (bankName.includes("ORANGE")) soldeOrange += impact;
        });

        const balance = totalDepots - totalRetraits;

        if (totalBankDepositsEl) totalBankDepositsEl.textContent = formatCFA(totalDepots);
        if (totalBankWithdrawalsEl) totalBankWithdrawalsEl.textContent = formatCFA(totalRetraits);
        if (totalBankBalanceEl) {
            totalBankBalanceEl.textContent = formatCFA(balance);
            if (cardBankBalanceEl) {
                cardBankBalanceEl.className = 'total-card ' + (balance >= 0 ? 'card-positif' : 'card-negatif');
            }
        }

        if (totalBiciciEl) totalBiciciEl.textContent = formatCFA(soldeBicici);
        if (totalBridgeEl) totalBridgeEl.textContent = formatCFA(soldeBridge);
        if (totalOrangeEl) totalOrangeEl.textContent = formatCFA(soldeOrange);
    }

    function renderBankTable() {
        const term = bankSearchInput ? bankSearchInput.value.toLowerCase().trim() : "";
        const filtered = allCombinedMovements.filter(item => {
            if (!term) return true;
            return (item.description || "").toLowerCase().includes(term) ||
                   (item.type || "").toLowerCase().includes(term);
        });

        bankTableBody.innerHTML = ''; 
        if (filtered.length === 0) {
            bankTableBody.innerHTML = '<tr><td colspan="5">Aucun résultat.</td></tr>';
            return;
        }
        filtered.forEach(move => {
            const row = document.createElement('tr');
            if (move.isDeleted === true) row.classList.add('deleted-row');
            
            if (move._source === 'transaction') {
                row.style.backgroundColor = '#f3e8ff';
            }
            
            let deleteButtonHTML = '';
            if (move.isDeleted !== true && !isViewer) {
                if (move._source === 'transaction') {
                    deleteButtonHTML = `<span style="font-size:0.8em; color:#666;">Via Historique</span>`;
                } else {
                    deleteButtonHTML = `<button class="deleteBtn" data-id="${move.id}">Suppr.</button>`;
                }
            }

            // Logique d'affichage améliorée : un dépôt n'est "négatif" (sortie de caisse)
            // que s'il s'agit d'une saisie manuelle.
            // Un Paiement est aussi négatif (Sortie Banque)
            const isNegativeDisplay = (move.type === 'Depot' && move.source === 'Saisie Manuelle') || move.type === 'Paiement';
            const amountClass = isNegativeDisplay ? 'reste-negatif' : 'reste-positif';
            const sign = isNegativeDisplay ? '-' : '+';

            row.innerHTML = `
                <td>${move.date}</td>
                <td><span class="tag" style="background-color:#e2e8f0; color:#334155;">${move.bank || '-'}</span></td>
                <td>${move.description}</td>
                <td>${move.type}</td>
                <td class="${amountClass}">
                    ${sign} ${formatCFA(move.montant)}
                </td>
                <td>${deleteButtonHTML}</td>
            `;
            bankTableBody.appendChild(row);
        });
    }
    
    showDeletedCheckbox.addEventListener('change', fetchBankMovements);
    if(bankSearchInput) bankSearchInput.addEventListener('input', renderBankTable);
    fetchBankMovements();

    // 4. SUPPRESSION
    bankTableBody.addEventListener('click', async (event) => {
        if (isViewer) return;
        if (event.target.classList.contains('deleteBtn')) {
            const docId = event.target.getAttribute('data-id');
            if (!confirm("Confirmer la suppression ? Elle sera archivée.")) return;

            // SUPPRESSION EN CASCADE : Si une dépense est liée à ce mouvement, on la supprime aussi
            db.collection("expenses").where("linkedBankMovementId", "==", docId).get().then(snap => {
                snap.forEach(doc => doc.ref.update({ isDeleted: true }));
            });

                bankCollection.doc(docId).update({ isDeleted: true });
        }
    });

    initBackToTopButton();
});