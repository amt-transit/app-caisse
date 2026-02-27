document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: Connexion BDD échouée."); return;
    }

    // SERVICE TRANSACTION (Injecté localement car non chargé via HTML)
    const transactionService = {
        getCleanTransactions(transactions, validatedSessions) {
            return transactions.reduce((acc, t) => {
                if (!t.paymentHistory || !Array.isArray(t.paymentHistory) || t.paymentHistory.length === 0) {
                    acc.push(t);
                    return acc;
                }
                const validPayments = t.paymentHistory.filter(p => !p.sessionId || validatedSessions.has(p.sessionId));
                const newParis = validPayments.reduce((sum, p) => sum + (p.montantParis || 0), 0);
                const newAbidjan = validPayments.reduce((sum, p) => sum + (p.montantAbidjan || 0), 0);
                const tClean = {
                    ...t,
                    paymentHistory: validPayments,
                    montantParis: newParis,
                    montantAbidjan: newAbidjan,
                    reste: (newParis + newAbidjan) - (t.prix || 0)
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
                if (d.type === 'Depot' && d.source !== 'Remise Chèques') totalDepots += (d.montant || 0);
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
    const tableBody = document.getElementById('magasinageTableBody');
    const searchInput = document.getElementById('magasinageSearch');
    const totalFeesEl = document.getElementById('totalMagasinageFees');

    let allTransactions = [];

    // 1. Chargement des données
    transactionsCollection.where("isDeleted", "!=", true).orderBy("isDeleted").orderBy("date", "desc").onSnapshot(snapshot => {
        allTransactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderTable();
    }, error => console.error(error));

    // 3. Affichage du tableau
    function renderTable() {
        const term = searchInput ? searchInput.value.toLowerCase().trim() : "";
        
        // On filtre d'abord
        const filtered = allTransactions.filter(t => {
            // 1. Si le colis est payé (Reste >= 0), on suppose qu'il est sorti -> Pas de magasinage
            if ((t.reste || 0) >= 0) return false;

            // 2. Si les frais ont été annulés manuellement lors de la saisie
            if (t.storageFeeWaived === true) return false;

            // 3. On ne montre que ceux qui ont des frais (période gratuite dépassée)
            const { fee } = transactionService.calculateStorageFee(t.date, t.quantite);
            if (fee <= 0) return false;

            if (!term) return true; 
            return (t.reference || "").toLowerCase().includes(term) ||
                   (t.nom || "").toLowerCase().includes(term) ||
                   (t.conteneur || "").toLowerCase().includes(term);
        });

        tableBody.innerHTML = '';
        let totalPotentialFees = 0;

        if (filtered.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6">Aucun colis trouvé.</td></tr>';
            if(totalFeesEl) totalFeesEl.textContent = formatCFA(0);
            return;
        }

        // On limite l'affichage aux 100 premiers pour la performance si pas de recherche précise
        const toShow = filtered.slice(0, 100);

        toShow.forEach(t => {
            const { days, fee } = transactionService.calculateStorageFee(t.date, t.quantite);
            
            if (fee > 0) totalPotentialFees += fee;

            const row = document.createElement('tr');
            
            // Style pour les frais élevés
            const feeClass = fee > 0 ? 'fee-warning' : 'fee-ok';
            // Rouge si > 20000, Orange si > 0, Vert sinon
            let feeStyle = fee > 20000 ? 'font-weight:bold; color:#dc3545;' : (fee > 0 ? 'color:#d97706;' : 'color:#10b981;');
            let feeText = formatCFA(fee);

            // Règle REBUS : > 90 jours (3 mois)
            if (days > 90) {
                feeStyle = 'font-weight:bold; color:#fff; background-color:#ef4444; padding: 4px 8px; border-radius: 4px; display:inline-block;';
                feeText = "⚠️ REBUS (Abandonné)";
                row.style.backgroundColor = "#fff1f2"; 
            }

            row.innerHTML = `
                <td>${t.date}</td>
                <td>${t.reference} <span style="font-size:0.8em; color:#666;">(x${t.quantite || 1})</span></td>
                <td>${t.nom}</td>
                <td>${t.conteneur}</td>
                <td><span class="tag" style="background:#e2e8f0; color:#334155;">${days} jours</span></td>
                <td style="${feeStyle}">${feeText}</td>
            `;
            tableBody.appendChild(row);
        });

        if(totalFeesEl) totalFeesEl.textContent = formatCFA(totalPotentialFees);
    }

    if(searchInput) searchInput.addEventListener('input', renderTable);

    initBackToTopButton();
});