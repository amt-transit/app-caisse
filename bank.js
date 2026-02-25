document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: La connexion à la base de données a échoué."); return;
    }

    // CORRECTION : On récupère le nom de l'utilisateur connecté
    const currentUserName = sessionStorage.getItem('userName') || 'Inconnu';

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

    // ÉLÉMENTS REMISE CHÈQUE
    const openCheckDepositBtn = document.getElementById('openCheckDepositBtn');
    const checkModal = document.getElementById('checkDepositModal');
    const pendingChecksBody = document.getElementById('pendingChecksBody');
    const totalDepositAmountEl = document.getElementById('totalDepositAmount');
    const confirmDepositBtn = document.getElementById('confirmDepositBtn');
    let selectedChecks = [];

    let unsubscribeBank = null;
    let unsubscribeVirements = null;
    let allBankMovements = [];
    let allVirements = [];
    let allCombinedMovements = [];
    let unconfirmedSessions = new Set(); // Pour filtrer virements et chèques

    // 1. AJOUT MANUEL
    addBankMovementBtn.addEventListener('click', async () => {
        const montant = parseFloat(bankAmount.value) || 0;
        const type = bankType.value; 

        const data = {
            date: bankDate.value,
            bank: bankName.value,
            // AJOUT DU NOM DE L'AUTEUR
            description: `${bankDesc.value} (${currentUserName})`,
            montant: montant,
            type: type,
            isDeleted: false
        };

        if (!data.date || !data.bank || !bankDesc.value || data.montant <= 0) {
            return alert("Veuillez remplir tous les champs (Banque incluse) avec un montant valide.");
        }

        // Sécurité solde
        if (type === 'Depot') {
            addBankMovementBtn.disabled = true;
            addBankMovementBtn.textContent = "Vérification...";
            try {
                const soldeCaisse = await calculateAvailableBalance(db);
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

        bankCollection.add(data).then(() => {
            bankDesc.value = '';
            bankAmount.value = '';
            bankName.value = '';
        }).catch(err => {
            console.error(err);
            if (err.code === 'resource-exhausted') alert("⚠️ QUOTA ATTEINT : Impossible d'ajouter le mouvement.");
            else alert("Erreur : " + err.message);
        });
    });

    // 2. IMPORT CSV
    if (uploadCsvBtn) {
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
             transQuery = transQuery.where("isDeleted", "!=", true);
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

                        if (pay.modePaiement === 'Virement') {
                            extracted.push({
                                id: `${doc.id}_${idx}`,
                                date: pay.date,
                                description: `VIREMENT REÇU: ${t.reference} - ${t.nom} (${pay.agentMobileMoney || 'N/A'})`,
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
                    if (t.modePaiement === 'Virement') {
                        extracted.push({
                            id: doc.id,
                            date: t.date,
                            description: `VIREMENT REÇU: ${t.reference} - ${t.nom} (${t.agentMobileMoney || 'N/A'})`,
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
            } else if (m.type === 'Retrait') {
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
            if (move.isDeleted !== true) {
                if (move._source === 'transaction') {
                    deleteButtonHTML = `<span style="font-size:0.8em; color:#666;">Via Historique</span>`;
                } else {
                    deleteButtonHTML = `<button class="deleteBtn" data-id="${move.id}">Suppr.</button>`;
                }
            }

            row.innerHTML = `
                <td>${move.date}</td>
                <td><span class="tag" style="background-color:#e2e8f0; color:#334155;">${move.bank || '-'}</span></td>
                <td>${move.description}</td>
                <td>${move.type}</td>
                <td class="${move.type === 'Depot' ? 'reste-negatif' : 'reste-positif'}">
                    ${move.type === 'Depot' ? '-' : '+'} ${formatCFA(move.montant)}
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
        if (event.target.classList.contains('deleteBtn')) {
            const docId = event.target.getAttribute('data-id');
            if (!confirm("Confirmer la suppression ? Elle sera archivée.")) return;

            // LOGIQUE D'ANNULATION DE REMISE DE CHÈQUE
            const move = allBankMovements.find(m => m.id === docId);
            
            if (move && move.source === 'Remise Chèques' && move.checks && move.checks.length > 0) {
                try {
                    const batch = db.batch();
                    // 1. Supprimer le mouvement banque
                    batch.update(bankCollection.doc(docId), { isDeleted: true });

                    // 2. Rétablir les chèques en "Pending" (En attente)
                    const updates = {};
                    move.checks.forEach(c => {
                        if(!updates[c.docId]) updates[c.docId] = [];
                        updates[c.docId].push(c.index);
                    });

                    for (const [tid, indices] of Object.entries(updates)) {
                        const tRef = db.collection("transactions").doc(tid);
                        const tDoc = await tRef.get();
                        if(tDoc.exists) {
                            const h = tDoc.data().paymentHistory;
                            indices.forEach(idx => { if(h[idx]) h[idx].checkStatus = 'Pending'; });
                            batch.update(tRef, { paymentHistory: h });
                        }
                    }
                    await batch.commit();
                    alert("Mouvement supprimé et chèques rétablis en 'En attente'.");
                } catch(e) { console.error(e); alert("Erreur lors de l'annulation."); }
            } else {
                bankCollection.doc(docId).update({ isDeleted: true });
            }
        }
    });

    // 5. GESTION REMISE CHÈQUES
    if (openCheckDepositBtn) {
        openCheckDepositBtn.addEventListener('click', async () => {
            const snapshot = await db.collection("transactions").where("isDeleted", "!=", true).get();
            
            let pendingChecks = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                
                if (data.paymentHistory) {
                    data.paymentHistory.forEach((pay, index) => {
                        // FILTRE SÉCURITÉ
                        if (pay.sessionId && unconfirmedSessions.has(pay.sessionId)) return;

                        if (pay.modePaiement === 'Chèque' && pay.checkStatus === 'Pending') {
                            pendingChecks.push({
                                docId: doc.id,
                                index: index,
                                date: pay.date,
                                client: data.nom || "Non spécifié",
                                reference: data.reference || "",
                                destinataire: data.nomDestinataire || "Non spécifié",
                                montant: pay.montantAbidjan || pay.montantParis || 0, // Montant du chèque (Abidjan par défaut)
                                info: pay.agentMobileMoney
                            });
                        }
                    });
                }
            });

            pendingChecksBody.innerHTML = '';
            selectedChecks = [];
            updateTotalDeposit();

            if (pendingChecks.length === 0) {
                pendingChecksBody.innerHTML = '<tr><td colspan="4">Aucun chèque en attente.</td></tr>';
            } else {
                pendingChecks.forEach(chk => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td><input type="checkbox" class="check-select" data-amount="${chk.montant}" data-docid="${chk.docId}" data-index="${chk.index}" data-bank="${chk.info || ''}"></td>
                        <td>${chk.date}</td>
                        <td>
                            <strong>${chk.reference}</strong><br>
                            Exp: ${chk.client}<br>
                            Dest: ${chk.destinataire}
                            ${chk.info ? `<br><small>${chk.info}</small>` : ''}
                        </td>
                        <td>${formatCFA(chk.montant)}</td>
                    `;
                    pendingChecksBody.appendChild(tr);
                });
            }
            checkModal.style.display = 'block';

            document.querySelectorAll('.check-select').forEach(box => {
                box.addEventListener('change', updateTotalDeposit);
            });
        });
    }

    function updateTotalDeposit() {
        let total = 0;
        selectedChecks = [];
        document.querySelectorAll('.check-select:checked').forEach(box => {
            const amt = parseFloat(box.dataset.amount);
            total += amt;
            selectedChecks.push({
                docId: box.dataset.docid,
                index: parseInt(box.dataset.index),
                amount: amt,
                bank: box.dataset.bank
            });
        });
        totalDepositAmountEl.textContent = formatCFA(total);
    }

    if (confirmDepositBtn) {
        confirmDepositBtn.addEventListener('click', async () => {
            if (selectedChecks.length === 0) return alert("Sélectionnez au moins un chèque.");
            if (!confirm(`Déposer ces ${selectedChecks.length} chèques pour un total de ${totalDepositAmountEl.textContent} ?`)) return;

            confirmDepositBtn.disabled = true;
            confirmDepositBtn.textContent = "Traitement...";

            const batch = db.batch();

            // A. Créer l'entrée "Dépôt Banque"
            const bankRef = bankCollection.doc();
            let totalAmount = 0;
            
            // Détermination de la banque (Si tous les chèques sont de la même banque, on l'affiche)
            const uniqueBanks = [...new Set(selectedChecks.map(c => c.bank).filter(b => b))];
            const depositBank = uniqueBanks.length === 1 ? uniqueBanks[0] : (uniqueBanks.length > 1 ? "Multi-Banques" : "");

            selectedChecks.forEach(c => totalAmount += c.amount);
            
            batch.set(bankRef, {
                date: new Date().toISOString().split('T')[0],
                description: `Remise de ${selectedChecks.length} chèques (${currentUserName})`, // Auteur ajouté ici aussi
                montant: totalAmount,
                type: 'Depot',
                bank: depositBank,
                isDeleted: false,
                source: 'Remise Chèques',
                checks: selectedChecks // Sauvegarde des chèques pour pouvoir annuler plus tard
            });

            // B. Mettre à jour les transactions
            const docsToUpdate = {};
            selectedChecks.forEach(chk => {
                if (!docsToUpdate[chk.docId]) docsToUpdate[chk.docId] = [];
                docsToUpdate[chk.docId].push(chk.index);
            });

            try {
                for (const [docId, indices] of Object.entries(docsToUpdate)) {
                    const docRef = db.collection("transactions").doc(docId);
                    const docSnap = await docRef.get();
                    const data = docSnap.data();
                    const history = data.paymentHistory;

                    indices.forEach(idx => {
                        if (history[idx]) history[idx].checkStatus = 'Deposited';
                    });

                    batch.update(docRef, { paymentHistory: history });
                }

                await batch.commit();
                alert("Remise effectuée avec succès !");
                checkModal.style.display = 'none';
                fetchBankMovements(); 

            } catch (err) {
                console.error(err);
                alert("Erreur lors de la remise.");
            } finally {
                confirmDepositBtn.disabled = false;
                confirmDepositBtn.textContent = "Valider le Dépôt"; 
            }
        });
    }

    // Fonction utilitaire copiée pour bank.js (pour éviter dépendances)
    async function calculateAvailableBalance(db) {
        const transSnap = await db.collection("transactions").where("isDeleted", "!=", true).get();
        let totalVentes = 0;
        transSnap.forEach(doc => {
            const d = doc.data();
            
            // CORRECTION : On aligne la logique sur le Dashboard.
            // On ne compte que le CASH disponible (pas les chèques).
            if (d.paymentHistory && d.paymentHistory.length > 0) {
                d.paymentHistory.forEach(pay => {
                    // FILTRE SÉCURITÉ
                    if (pay.sessionId && unconfirmedSessions.has(pay.sessionId)) return;

                    if (pay.modePaiement !== 'Chèque' && pay.modePaiement !== 'Virement') {
                        totalVentes += (pay.montantAbidjan || 0);
                    }
                });
            } else {
                // Fallback pour anciennes données (considérées comme cash par défaut)
                if (d.modePaiement !== 'Chèque' && d.modePaiement !== 'Virement') {
                    totalVentes += (d.montantAbidjan || 0); 
                }
            }
        });

        const incSnap = await db.collection("other_income").where("isDeleted", "!=", true).get();
        let totalAutres = 0;
        // CORRECTION : On exclut les Autres Entrées qui ne sont pas du cash (Chèque/Virement)
        incSnap.forEach(doc => {
            const d = doc.data();
            if (d.mode !== 'Virement' && d.mode !== 'Chèque') {
                totalAutres += (d.montant || 0);
            }
        });

        const expSnap = await db.collection("expenses").where("isDeleted", "!=", true).get();
        let totalDepenses = 0;
        expSnap.forEach(doc => {
            const d = doc.data();
            
            // FILTRE SÉCURITÉ DÉPENSES
            // On vérifie si la dépense appartient à une session non validée (via sessionId)
            if (d.sessionId && unconfirmedSessions.has(d.sessionId)) return;

            if (d.mode !== 'Virement' && d.mode !== 'Chèque') {
                totalDepenses += (d.montant || 0);
            }
        });

        const bankSnap = await db.collection("bank_movements").where("isDeleted", "!=", true).get();
        let totalRetraits = 0;
        let totalDepots = 0;
        bankSnap.forEach(doc => {
            const d = doc.data();
            if (d.type === 'Retrait') totalRetraits += (d.montant || 0);
            // CORRECTION : On exclut les remises de chèques car elles ne sortent pas de la caisse espèces
            if (d.type === 'Depot' && d.source !== 'Remise Chèques') totalDepots += (d.montant || 0);
        });

        return (totalVentes + totalAutres + totalRetraits) - (totalDepenses + totalDepots);
    }

    function formatCFA(number) {
        return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(number || 0);
    }

    initBackToTopButton();
});

// --- GESTION DU BOUTON "RETOUR EN HAUT" (GLOBAL & MODALS) ---
function initBackToTopButton() {
    // 1. Bouton Global (Window)
    let backToTopBtn = document.getElementById('backToTopBtn');
    if (!backToTopBtn) {
        backToTopBtn = document.createElement('button');
        backToTopBtn.id = 'backToTopBtn';
        backToTopBtn.title = 'Retour en haut';
        backToTopBtn.innerHTML = '&#8593;';
        document.body.appendChild(backToTopBtn);
        backToTopBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    }

    const toggleGlobalBtn = () => {
        if ((window.pageYOffset || document.documentElement.scrollTop) > 300) backToTopBtn.classList.add('show');
        else backToTopBtn.classList.remove('show');
    };
    window.addEventListener('scroll', toggleGlobalBtn, { passive: true });

    // 2. Boutons Modals (.modal-content)
    const attachModalButtons = () => {
        document.querySelectorAll('.modal-content').forEach(modalContent => {
            if (modalContent.dataset.hasBackToTop) return;
            
            const modalBtn = document.createElement('button');
            modalBtn.className = 'modal-back-to-top';
            modalBtn.innerHTML = '&#8593;';
            modalBtn.title = 'Haut de page';
            modalContent.appendChild(modalBtn);
            modalContent.dataset.hasBackToTop = "true";

            modalBtn.addEventListener('click', () => modalContent.scrollTo({ top: 0, behavior: 'smooth' }));

            modalContent.addEventListener('scroll', () => {
                if (modalContent.scrollTop > 200) modalBtn.classList.add('show');
                else modalBtn.classList.remove('show');
            }, { passive: true });
        });
    };

    attachModalButtons();
    const observer = new MutationObserver(attachModalButtons);
    observer.observe(document.body, { childList: true, subtree: true });
}