// c:\Users\JEANAFFA\Desktop\MonAppli Gemini\services\transactionService.js

const transactionService = {
    /**
     * Nettoie les transactions en ne gardant que les paiements validés.
     * @param {Array} transactions - Liste brute des transactions
     * @param {Set} validatedSessions - Set des IDs de sessions validées (Liste Blanche)
     */
    getCleanTransactions(transactions, validatedSessions) {
        return transactions.reduce((acc, t) => {
            // Si pas d'historique (Legacy ou Arrivage brut), on garde tel quel
            if (!t.paymentHistory || !Array.isArray(t.paymentHistory) || t.paymentHistory.length === 0) {
                acc.push(t);
                return acc;
            }

            // FILTRE STRICT : On ne garde que les paiements liés à une session VALIDÉE (ou sans session = Legacy)
            const validPayments = t.paymentHistory.filter(p => !p.sessionId || validatedSessions.has(p.sessionId));

            // RECALCUL SYSTÉMATIQUE DES TOTAUX
            const newParis = validPayments.reduce((sum, p) => sum + (p.montantParis || 0), 0);
            const newAbidjan = validPayments.reduce((sum, p) => sum + (p.montantAbidjan || 0), 0);

            // On recrée l'objet transaction avec les valeurs justes
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

    /**
     * Calcule le solde disponible en caisse (Espèces uniquement).
     * @param {Object} db - Instance Firestore
     * @param {Set} unconfirmedSessions - Set des IDs de sessions NON validées (Liste Noire)
     */
    async calculateAvailableBalance(db, unconfirmedSessions) {
        // 1. Transactions (Ventes)
        const transSnap = await db.collection("transactions").where("isDeleted", "!=", true).limit(2000).get();
        let totalVentes = 0;
        
        transSnap.forEach(doc => {
            const d = doc.data();
            if (d.paymentHistory && d.paymentHistory.length > 0) {
                d.paymentHistory.forEach(pay => {
                    // FILTRE SÉCURITÉ : Ignorer si session non validée
                    if (pay.sessionId && unconfirmedSessions.has(pay.sessionId)) return;

                    // On ne compte que le CASH (pas chèque, pas virement)
                    if (pay.modePaiement !== 'Chèque' && pay.modePaiement !== 'Virement') {
                        totalVentes += (pay.montantAbidjan || 0);
                    }
                });
            } else {
                // Fallback Legacy
                if (d.modePaiement !== 'Chèque' && d.modePaiement !== 'Virement') {
                    totalVentes += (d.montantAbidjan || 0);
                }
            }
        });

        // 2. Autres Entrées
        const incSnap = await db.collection("other_income").where("isDeleted", "!=", true).limit(1000).get();
        let totalAutres = 0;
        incSnap.forEach(doc => {
            const d = doc.data();
            if (d.mode !== 'Virement' && d.mode !== 'Chèque') {
                totalAutres += (d.montant || 0);
            }
        });

        // 3. Dépenses
        const expSnap = await db.collection("expenses").where("isDeleted", "!=", true).limit(1000).get();
        let totalDepenses = 0;
        expSnap.forEach(doc => {
            const d = doc.data();
            // FILTRE SÉCURITÉ : Ignorer si session non validée
            if (d.sessionId && unconfirmedSessions.has(d.sessionId)) return;

            if (d.mode !== 'Virement' && d.mode !== 'Chèque') {
                totalDepenses += (d.montant || 0);
            }
        });

        // 4. Mouvements Banque (Retraits = Entrée Caisse, Dépôts = Sortie Caisse)
        const bankSnap = await db.collection("bank_movements").where("isDeleted", "!=", true).limit(1000).get();
        let totalRetraits = 0; // Argent qui sort de la banque vers la caisse
        let totalDepots = 0;   // Argent qui sort de la caisse vers la banque
        
        bankSnap.forEach(doc => {
            const d = doc.data();
            if (d.type === 'Retrait') totalRetraits += (d.montant || 0);
            // On exclut les remises de chèques car elles ne sortent pas de la caisse espèces
            if (d.type === 'Depot' && d.source !== 'Remise Chèques') totalDepots += (d.montant || 0);
        });

        return (totalVentes + totalAutres + totalRetraits) - (totalDepenses + totalDepots);
    },

    /**
     * Calcule les frais de magasinage.
     * @param {string} dateString - Date d'arrivée
     * @param {number} quantity - Quantité (défaut 1)
     * @param {Date} compareDate - Date de référence (défaut aujourd'hui)
     */
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
