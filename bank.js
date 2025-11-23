document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: La connexion à la base de données a échoué."); return;
    }

    const bankCollection = db.collection("bank_movements");
    
    const addBankMovementBtn = document.getElementById('addBankMovementBtn');
    const bankDate = document.getElementById('bankDate');
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

    // ÉLÉMENTS REMISE CHÈQUE
    const openCheckDepositBtn = document.getElementById('openCheckDepositBtn');
    const checkModal = document.getElementById('checkDepositModal');
    const pendingChecksBody = document.getElementById('pendingChecksBody');
    const totalDepositAmountEl = document.getElementById('totalDepositAmount');
    const confirmDepositBtn = document.getElementById('confirmDepositBtn');
    let selectedChecks = [];

    let unsubscribeBank = null;
    let allBankMovements = [];

    // 1. AJOUT MANUEL
    addBankMovementBtn.addEventListener('click', async () => {
        const montant = parseFloat(bankAmount.value) || 0;
        const type = bankType.value; 

        const data = {
            date: bankDate.value,
            description: bankDesc.value,
            montant: montant,
            type: type,
            isDeleted: false
        };

        if (!data.date || !data.description || data.montant <= 0) {
            return alert("Veuillez remplir tous les champs avec un montant valide.");
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
        }).catch(err => console.error(err));
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

                    if (count > 0) await batch.commit();
                    uploadLog.textContent = `Succès : ${count} mouvements importés.`;
                    csvFile.value = '';
                }
            });
        });
    }

    // 3. AFFICHAGE & RECHERCHE
    function fetchBankMovements() {
        if (unsubscribeBank) unsubscribeBank();
        let query = bankCollection;
        
        if (showDeletedCheckbox.checked) {
            query = query.where("isDeleted", "==", true).orderBy("isDeleted");
        } else {
            query = query.where("isDeleted", "!=", true).orderBy("isDeleted");
        }
        query = query.orderBy("date", "desc");

        unsubscribeBank = query.onSnapshot(snapshot => {
            allBankMovements = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderBankTable();
        }, error => console.error(error));
    }

    function renderBankTable() {
        const term = bankSearchInput ? bankSearchInput.value.toLowerCase().trim() : "";
        const filtered = allBankMovements.filter(item => {
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
            
            let deleteButtonHTML = '';
            if (move.isDeleted !== true) {
                deleteButtonHTML = `<button class="deleteBtn" data-id="${move.id}">Suppr.</button>`;
            }

            row.innerHTML = `
                <td>${move.date}</td>
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
    bankTableBody.addEventListener('click', (event) => {
        if (event.target.classList.contains('deleteBtn')) {
            const docId = event.target.getAttribute('data-id');
            if (confirm("Confirmer la suppression ? Elle sera archivée.")) {
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
                        if (pay.modePaiement === 'Chèque' && pay.checkStatus === 'Pending') {
                            pendingChecks.push({
                                docId: doc.id,
                                index: index,
                                date: pay.date,
                                client: data.nom || data.reference,
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
                        <td><input type="checkbox" class="check-select" data-amount="${chk.montant}" data-docid="${chk.docId}" data-index="${chk.index}"></td>
                        <td>${chk.date}</td>
                        <td>${chk.client}<br><small>${chk.info || ''}</small></td>
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
                amount: amt
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
            selectedChecks.forEach(c => totalAmount += c.amount);
            
            batch.set(bankRef, {
                date: new Date().toISOString().split('T')[0],
                description: `Remise de ${selectedChecks.length} chèques`,
                montant: totalAmount,
                type: 'Depot',
                isDeleted: false,
                source: 'Remise Chèques'
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
            totalVentes += (d.montantParis || 0) + (d.montantAbidjan || 0);
        });

        const incSnap = await db.collection("other_income").where("isDeleted", "!=", true).get();
        let totalAutres = 0;
        incSnap.forEach(doc => totalAutres += (doc.data().montant || 0));

        const expSnap = await db.collection("expenses").where("isDeleted", "!=", true).get();
        let totalDepenses = 0;
        expSnap.forEach(doc => totalDepenses += (doc.data().montant || 0));

        const bankSnap = await db.collection("bank_movements").where("isDeleted", "!=", true).get();
        let totalRetraits = 0;
        let totalDepots = 0;
        bankSnap.forEach(doc => {
            const d = doc.data();
            if (d.type === 'Retrait') totalRetraits += (d.montant || 0);
            if (d.type === 'Depot') totalDepots += (d.montant || 0);
        });

        return (totalVentes + totalAutres + totalRetraits) - (totalDepenses + totalDepots);
    }

    function formatCFA(number) {
        return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(number || 0);
    }
});