document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: Connexion BDD échouée."); return;
    }

    const sessionsListPendingEl = document.getElementById('sessionsListPending');
    const sessionsListValidatedEl = document.getElementById('sessionsListValidated');
    const sessionsListArchivesEl = document.getElementById('sessionsListArchives');
    const sessionDetailsEl = document.getElementById('sessionDetails');
    const noSelectionMsg = document.getElementById('noSelectionMsg');
    const filterDateSession = document.getElementById('filterDateSession');
    
    const detailDateUser = document.getElementById('detailDateUser');
    const detailStatus = document.getElementById('detailStatus');
    const validateSessionBtn = document.getElementById('validateSessionBtn');
    
    const detailsEncaissementsBody = document.getElementById('detailsEncaissementsBody');
    const detailsDepensesBody = document.getElementById('detailsDepensesBody');
    
    const countEncaissements = document.getElementById('countEncaissements');
    const countDepenses = document.getElementById('countDepenses');
    const totalEspEl = document.getElementById('totalEsp');
    const totalDepEl = document.getElementById('totalDep');
    const totalNetEl = document.getElementById('totalNet');

    const archiveMonthInput = document.getElementById('archiveMonth');
    const searchArchiveBtn = document.getElementById('searchArchiveBtn');

    let currentSessionId = null;
    let currentSessionData = null; // Pour stocker les infos de la session en cours (date, user)

    // 1. Charger la liste des sessions (Basé sur les logs de validation)
    function loadSessions() {
        // OPTIMISATION : On ne charge que les 20 dernières sessions par défaut
        let query = db.collection("audit_logs")
            .where("action", "==", "VALIDATION_JOURNEE")
            .orderBy("date", "desc")
            .limit(20); 

        query.onSnapshot(snapshot => {
            sessionsListPendingEl.innerHTML = '';
            sessionsListValidatedEl.innerHTML = '';
            
            let hasPending = false;

            if (snapshot.empty) {
                sessionsListPendingEl.innerHTML = '<p style="padding:10px; color:#999;">Aucune session.</p>';
            }

            snapshot.forEach(doc => {
                const div = createSessionElement(doc);
                const data = doc.data();
                const isValidated = data.status === "VALIDATED";

                if (!isValidated) hasPending = true;

                // Filtrage date local (seulement pour la liste chargée)
                if (filterDateSession.value && data.date.split('T')[0] !== filterDateSession.value) return;

                if (isValidated) {
                    sessionsListValidatedEl.appendChild(div);
                } else {
                    sessionsListPendingEl.appendChild(div);
                }
            });
        });
    }

    // Fonction utilitaire pour créer l'élément HTML d'une session
    function createSessionElement(doc) {
        const data = doc.data();
        const dateObj = new Date(data.date);
        const dateStr = dateObj.toLocaleDateString('fr-FR');
        const timeStr = dateObj.toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'});
        
        const div = document.createElement('div');
        div.className = 'session-item';
        div.style.padding = '10px';
        div.style.borderBottom = '1px solid #eee';
        div.style.cursor = 'pointer';
        div.style.transition = 'background 0.2s';
        
        const isValidated = data.status === "VALIDATED";
        const statusIcon = isValidated ? "✅" : "⏳";

        div.innerHTML = `
            <div style="font-weight:bold; color:#334155;">${statusIcon} ${dateStr} à ${timeStr}</div>
            <div style="font-size:0.9em; color:#64748b;">Par: ${data.user}</div>
        `;
        
        div.addEventListener('mouseover', () => div.style.background = '#f1f5f9');
        div.addEventListener('mouseout', () => div.style.background = 'transparent');
        div.addEventListener('click', () => loadSessionDetails(doc.id, data));
        return div;
    }

    // 1b. Charger les Archives (Sur demande)
    searchArchiveBtn.addEventListener('click', () => {
        const monthVal = archiveMonthInput.value; // YYYY-MM
        if (!monthVal) return alert("Veuillez sélectionner un mois.");

        sessionsListArchivesEl.innerHTML = '<p style="color:#666;">Recherche...</p>';

        // Calculer premier et dernier jour du mois
        const start = monthVal + "-01";
        const [year, month] = monthVal.split('-').map(Number);
        const lastDay = new Date(year, month, 0).getDate();
        const end = `${monthVal}-${lastDay}T23:59:59`;

        db.collection("audit_logs")
            .where("action", "==", "VALIDATION_JOURNEE")
            .where("date", ">=", start)
            .where("date", "<=", end)
            .orderBy("date", "desc")
            .get()
            .then(snapshot => {
                sessionsListArchivesEl.innerHTML = '';
                if (snapshot.empty) {
                    sessionsListArchivesEl.innerHTML = '<p>Aucune session trouvée.</p>';
                    return;
                }
                snapshot.forEach(doc => {
                    sessionsListArchivesEl.appendChild(createSessionElement(doc));
                });
            })
            .catch(err => {
                console.error(err);
                sessionsListArchivesEl.innerHTML = '<p style="color:red;">Erreur chargement.</p>';
            });
    });

    // 2. Charger les détails d'une session
    async function loadSessionDetails(logId, logData) {
        currentSessionId = logId;
        currentSessionData = logData; // Sauvegarde du contexte
        noSelectionMsg.style.display = 'none';
        sessionDetailsEl.style.display = 'block';
        
        const dateOnly = logData.date.split('T')[0];
        detailDateUser.textContent = `Saisie du ${dateOnly} par ${logData.user}`;
        
        // Vérifier si déjà validé
        if (logData.status === "VALIDATED") {
            detailStatus.textContent = "Validé par " + (logData.validatedBy || "Admin");
            detailStatus.style.background = "#10b981";
            detailStatus.style.color = "white";
            validateSessionBtn.style.display = 'none'; // Cacher le bouton si déjà validé
        } else {
            detailStatus.textContent = "En attente de revue";
            detailStatus.style.background = "#f59e0b";
            detailStatus.style.color = "white";
            validateSessionBtn.style.display = 'block';
        }

        // --- CHARGEMENT ROBUSTE (HYBRIDE) ---
        let transactionsDocs = [];
        let expensesDocs = [];

        // CAS 1 : NOUVEAU SYSTÈME (IDs stockés dans le log)
        if (logData.transactionIds && Array.isArray(logData.transactionIds)) {
            // On charge exactement les documents concernés par cette session
            // Promise.all permet de charger en parallèle, c'est rapide et sûr.
            const tPromises = logData.transactionIds.map(id => db.collection("transactions").doc(id).get());
            const tSnapshots = await Promise.all(tPromises);
            transactionsDocs = tSnapshots.filter(doc => doc.exists);
        } 
        // CAS 2 : ANCIEN SYSTÈME (Fallback sur la date/user)
        else {
            const transSnap = await db.collection("transactions")
                .where("saisiPar", "==", logData.user)
                .where("lastPaymentDate", "==", dateOnly)
                .get();
            transactionsDocs = transSnap.docs;
        }

        // IDEM POUR LES DÉPENSES
        if (logData.expenseIds && Array.isArray(logData.expenseIds)) {
            const ePromises = logData.expenseIds.map(id => db.collection("expenses").doc(id).get());
            const eSnapshots = await Promise.all(ePromises);
            expensesDocs = eSnapshots.filter(doc => doc.exists).map(d => d.data());
        } else {
            // Fallback ancien système
            const expSnap = await db.collection("expenses")
                .where("description", ">=", "")
                .orderBy("description")
                .get();
            expensesDocs = expSnap.docs
                .map(d => d.data())
                .filter(e => e.date === dateOnly && e.description.includes(logData.user));
        }

        // Rendu Transactions
        detailsEncaissementsBody.innerHTML = '';
        let sumEsp = 0;
        // Détection si c'est une session "Nouveau Système" (avec IDs précis)
        const isNewSystemSession = !!(logData.transactionIds && Array.isArray(logData.transactionIds));
        
        transactionsDocs.forEach(doc => {
            const t = doc.data();
            // On doit filtrer l'historique pour ne prendre que ce qui a été payé CE JOUR LÀ par CET UTILISATEUR
            // C'est complexe car le document contient le cumul.
            // Simplification : On affiche le document tel quel s'il a été touché ce jour là.
            // Pour être précis, il faudrait regarder paymentHistory.
            
            let payeCeJour = 0;
            if (t.paymentHistory) {
                t.paymentHistory.forEach(p => {
                    // CAS 1 : Nouveau système (Match par ID de session)
                    if (isNewSystemSession) {
                        if (p.sessionId === logId) {
                            payeCeJour += (p.montantAbidjan || 0) + (p.montantParis || 0);
                            if (p.modePaiement === 'Espèce') sumEsp += (p.montantAbidjan || 0);
                        }
                    } 
                    // CAS 2 : Ancien système (Match par Date + User)
                    else {
                        if (p.date === dateOnly && p.saisiPar === logData.user) {
                            payeCeJour += (p.montantAbidjan || 0) + (p.montantParis || 0);
                            if (p.modePaiement === 'Espèce') sumEsp += (p.montantAbidjan || 0);
                        }
                    }
                });
            } else {
                // Fallback
                payeCeJour = (t.montantAbidjan || 0) + (t.montantParis || 0);
                if (t.modePaiement === 'Espèce') sumEsp += (t.montantAbidjan || 0);
                // Fallback très anciennes données sans historique
                if (!isNewSystemSession) {
                    payeCeJour = (t.montantAbidjan || 0) + (t.montantParis || 0);
                    if (t.modePaiement === 'Espèce') sumEsp += (t.montantAbidjan || 0);
                }
            }

            if (payeCeJour > 0) {
                let actionButtons = '';
                // On affiche les boutons seulement si la session n'est PAS encore validée
                if (logData.status !== "VALIDATED") {
                    actionButtons = `
                        <button class="btn-edit" style="background:#3b82f6; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; margin-right:5px;">✏️</button>
                        <button class="btn-delete" style="background:#ef4444; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">🗑️</button>
                    `;
                } else {
                    actionButtons = `<span style="color:#94a3b8; font-size:0.8em;">🔒 Validé</span>`;
                }

                detailsEncaissementsBody.innerHTML += `
                    <tr data-id="${doc.id}">
                        <td>${t.reference}</td><td>${t.nom}</td><td>${t.conteneur}</td><td>${formatCFA(t.prix)}</td><td style="font-weight:bold;">${formatCFA(payeCeJour)}</td><td>${t.modePaiement}</td>
                        <td>${actionButtons}</td>
                    </tr>
                `;
            }
        });
        countEncaissements.textContent = detailsEncaissementsBody.children.length;

        // Rendu Dépenses
        detailsDepensesBody.innerHTML = '';
        let sumDep = 0;
        expensesDocs.forEach(e => {
            sumDep += (e.montant || 0);
            detailsDepensesBody.innerHTML += `<tr><td>${e.description}</td><td>${e.type}</td><td>${formatCFA(e.montant)}</td></tr>`;
        });
        countDepenses.textContent = expensesDocs.length;

        // Totaux
        totalEspEl.textContent = formatCFA(sumEsp);
        totalDepEl.textContent = formatCFA(sumDep);
        totalNetEl.textContent = formatCFA(sumEsp - sumDep);
    }

    // --- GESTION DES ACTIONS (MODIFIER / SUPPRIMER) ---
    detailsEncaissementsBody.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        
        const tr = btn.closest('tr');
        const docId = tr.dataset.id;
        
        // Vérifier si la session est déjà validée (optionnel : empêcher modif si validé)
        if (detailStatus.textContent.includes("Validé")) {
            alert("Impossible de modifier une session déjà validée.");
            return;
        }

        if (btn.classList.contains('btn-delete')) {
            handleDelete(docId);
        } else if (btn.classList.contains('btn-edit')) {
            handleEdit(docId);
        }
    });

    async function handleDelete(docId) {
        if (!confirm("Voulez-vous vraiment supprimer cet encaissement de la journée ?")) return;
        
        try {
            const docRef = db.collection("transactions").doc(docId);
            const doc = await docRef.get();
            if (!doc.exists) return;
            
            const data = doc.data();
            const sessionDate = currentSessionData.date.split('T')[0];
            const sessionUser = currentSessionData.user;

            if (data.paymentHistory) {
                // On retire les paiements faits par cet utilisateur à cette date
                let newHistory;
                // Si la session a des IDs (Nouveau système), on supprime par sessionId
                if (currentSessionData.transactionIds) {
                    newHistory = data.paymentHistory.filter(p => p.sessionId !== currentSessionId);
                } else {
                    // Sinon ancien système (Date/User)
                    newHistory = data.paymentHistory.filter(p => !(p.date === sessionDate && p.saisiPar === sessionUser));
                }
                
                // Recalcul des totaux
                let newAbj = 0, newPar = 0;
                newHistory.forEach(p => {
                    newAbj += (p.montantAbidjan || 0);
                    newPar += (p.montantParis || 0);
                });
                
                const newReste = (data.prix || 0) - (newAbj + newPar);
                
                await docRef.update({
                    paymentHistory: newHistory,
                    montantAbidjan: newAbj,
                    montantParis: newPar,
                    reste: newReste
                });
            } else {
                // Fallback (Anciennes données sans historique) : On marque supprimé
                await docRef.update({ isDeleted: true });
            }
            
            // Rafraîchir l'affichage
            loadSessionDetails(currentSessionId, currentSessionData);
        } catch (error) {
            console.error(error);
            alert("Erreur lors de la suppression.");
        }
    }

    async function handleEdit(docId) {
        try {
            const docRef = db.collection("transactions").doc(docId);
            const doc = await docRef.get();
            if (!doc.exists) return;
            
            const data = doc.data();
            const sessionDate = currentSessionData.date.split('T')[0];
            const sessionUser = currentSessionData.user;
            
            // Trouver le montant actuel payé ce jour-là pour pré-remplir le prompt
            let currentPaymentAbj = 0;
            let currentPaymentPar = 0;
            let currentMode = 'Espèce';
            
            if (data.paymentHistory) {
                let entry;
                // Recherche précise par SessionID si dispo
                if (currentSessionData.transactionIds) {
                    entry = data.paymentHistory.find(p => p.sessionId === currentSessionId);
                } else {
                    entry = data.paymentHistory.find(p => p.date === sessionDate && p.saisiPar === sessionUser);
                }

                if (entry) {
                    currentPaymentAbj = entry.montantAbidjan || 0;
                    currentPaymentPar = entry.montantParis || 0;
                    currentMode = entry.modePaiement || 'Espèce';
                }
            }

            // Demander les nouvelles valeurs
            const newPrixStr = prompt("Modifier le PRIX TOTAL du colis :", data.prix);
            if (newPrixStr === null) return;
            const newPrix = parseFloat(newPrixStr) || 0;

            const newAbjStr = prompt("Modifier le montant payé ABIDJAN (ce jour) :", currentPaymentAbj);
            if (newAbjStr === null) return;
            const newPaymentAbj = parseFloat(newAbjStr) || 0;

            // Mise à jour via une suppression + réinsertion propre dans l'historique
            // Note : Pour simplifier, on réutilise la logique de suppression puis d'ajout manuel, 
            // mais ici on va modifier directement l'array pour être atomique.
            
            // 1. Retirer l'ancienne entrée
            let newHistory;
            if (currentSessionData.transactionIds) {
                newHistory = (data.paymentHistory || []).filter(p => p.sessionId !== currentSessionId);
            } else {
                newHistory = (data.paymentHistory || []).filter(p => !(p.date === sessionDate && p.saisiPar === sessionUser));
            }
            
            // 2. Ajouter la nouvelle entrée corrigée
            newHistory.push({
                date: sessionDate,
                saisiPar: sessionUser,
                montantAbidjan: newPaymentAbj,
                montantParis: currentPaymentPar, // On garde Paris tel quel (ou on pourrait demander aussi)
                modePaiement: currentMode,
                agent: data.agent || '',
                sessionId: currentSessionId // On remet l'ID de session !
            });

            // 3. Recalculer les totaux globaux
            let totalAbj = 0, totalPar = 0;
            newHistory.forEach(p => {
                totalAbj += (p.montantAbidjan || 0);
                totalPar += (p.montantParis || 0);
            });
            const newReste = newPrix - (totalAbj + totalPar);

            await docRef.update({
                prix: newPrix,
                paymentHistory: newHistory,
                montantAbidjan: totalAbj,
                montantParis: totalPar,
                reste: newReste
            });

            loadSessionDetails(currentSessionId, currentSessionData);

        } catch (error) {
            console.error(error);
            alert("Erreur lors de la modification.");
        }
    }

    validateSessionBtn.addEventListener('click', () => {
        if (!currentSessionId) return;
        if (confirm("Confirmer la validation de cette journée ?")) {
            // Ici on pourrait mettre à jour le document audit_log pour dire "Validé par Admin"
            db.collection("audit_logs").doc(currentSessionId).update({
                status: "VALIDATED",
                validatedBy: sessionStorage.getItem('userName'),
                validatedAt: new Date().toISOString()
            }).then(() => {
                alert("Journée validée avec succès !");
                detailStatus.textContent = "Validé";
                detailStatus.style.background = "#10b981";
                detailStatus.style.color = "white";
                validateSessionBtn.style.display = 'none';
            });
        }
    });

    filterDateSession.addEventListener('change', loadSessions);
    loadSessions();

    function formatCFA(n) { return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(n || 0); }
});