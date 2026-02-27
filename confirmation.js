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

    // --- MODAL ÉDITION (Injection Dynamique) ---
    const editModalHTML = `
    <div id="editTransactionModal" class="modal">
        <div class="modal-content" style="max-width: 400px; border-radius: 12px; padding: 20px;">
            <span class="close-modal" id="closeEditModal" style="float:right; cursor:pointer; font-size:24px;">&times;</span>
            <h2 style="margin-top:0;">Modifier Transaction</h2>
            <div style="margin-bottom: 15px;">
                <label style="display:block; margin-bottom:5px; font-weight:bold; font-size:13px;">Prix Total Colis :</label>
                <input type="number" id="editPrix" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:6px; box-sizing:border-box;">
            </div>
            <div style="margin-bottom: 15px;">
                <label style="display:block; margin-bottom:5px; font-weight:bold; font-size:13px;">Montant Payé Abidjan (Ce jour) :</label>
                <input type="number" id="editMontantAbidjan" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:6px; box-sizing:border-box;">
            </div>
            <div style="margin-bottom: 15px;">
                <label style="display:block; margin-bottom:5px; font-weight:bold; font-size:13px;">Montant Payé Paris (Ce jour) :</label>
                <input type="number" id="editMontantParis" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:6px; box-sizing:border-box;">
            </div>
            <div style="text-align:right; margin-top:20px; display:flex; gap:10px; justify-content:flex-end;">
                <button id="cancelEditBtn" style="padding:8px 16px; border:1px solid #ccc; background:white; border-radius:6px; cursor:pointer;">Annuler</button>
                <button id="saveEditBtn" style="padding:8px 16px; border:none; background:#10b981; color:white; border-radius:6px; cursor:pointer; font-weight:bold;">Enregistrer</button>
            </div>
        </div>
    </div>
    `;
    document.body.insertAdjacentHTML('beforeend', editModalHTML);

    const editModal = document.getElementById('editTransactionModal');
    const closeEditModalBtn = document.getElementById('closeEditModal');
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    const saveEditBtn = document.getElementById('saveEditBtn');
    const editPrixInput = document.getElementById('editPrix');
    const editMontantAbidjanInput = document.getElementById('editMontantAbidjan');
    const editMontantParisInput = document.getElementById('editMontantParis');

    let currentEditDocId = null;
    let currentEditOriginalData = null;

    function closeEditModalFunc() {
        editModal.classList.remove('active');
        currentEditDocId = null;
        currentEditOriginalData = null;
    }

    if(closeEditModalBtn) closeEditModalBtn.onclick = closeEditModalFunc;
    if(cancelEditBtn) cancelEditBtn.onclick = closeEditModalFunc;
    
    // Fermeture au clic en dehors
    window.addEventListener('click', (e) => {
        if (e.target == editModal) closeEditModalFunc();
    });

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

                // FILTRE : Masquer les sessions explicitement vides (Nouveau système)
                if (data.transactionIds && Array.isArray(data.transactionIds) && data.transactionIds.length === 0) {
                    if (!data.expenseIds || (Array.isArray(data.expenseIds) && data.expenseIds.length === 0)) return;
                }

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
        
        // Date de saisie (Choisie par l'utilisateur)
        let entryDateDisplay = dateStr; // Par défaut = date validation (pour anciens logs)
        if (data.entryDate) {
            // Parsing manuel pour éviter les décalages de fuseau horaire (YYYY-MM-DD)
            const parts = data.entryDate.split('-');
            const d = new Date(parts[0], parts[1] - 1, parts[2]);
            entryDateDisplay = d.toLocaleDateString('fr-FR');
        }
        
        const div = document.createElement('div');
        div.className = 'session-item';
        div.style.padding = '10px';
        div.style.borderBottom = '1px solid #eee';
        div.style.cursor = 'pointer';
        div.style.transition = 'background 0.2s';
        
        const isValidated = data.status === "VALIDATED";
        const statusIcon = isValidated ? "✅" : "⏳";

        // AJOUT : Affichage des agents à côté de l'utilisateur
        let infoLine = `Par: ${data.user}`;
        if (data.agents) {
            infoLine += ` <span style="color:#059669; font-weight:bold;">(${data.agents})</span>`;
        }

        div.innerHTML = `
            <div style="font-weight:bold; color:#334155; font-size:1.05em;">${statusIcon} Saisie : ${entryDateDisplay}</div>
            <div style="font-size:0.9em; color:#64748b; margin-top:2px;">${infoLine}</div>
            <div style="font-size:0.8em; color:#94a3b8; margin-top:2px;">Validé le : ${dateStr} à ${timeStr}</div>
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
            .limit(500)
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

        // AJOUT : Bouton de suppression manuelle de la session (pour nettoyage)
        let deleteSessionBtn = document.getElementById('deleteSessionBtn');
        if (!deleteSessionBtn) {
            deleteSessionBtn = document.createElement('button');
            deleteSessionBtn.id = 'deleteSessionBtn';
            deleteSessionBtn.className = 'deleteBtn'; // Style rouge
            deleteSessionBtn.style.marginTop = '10px';
            deleteSessionBtn.style.float = 'right';
            deleteSessionBtn.textContent = "🗑️ Supprimer la Session";
            validateSessionBtn.parentNode.insertBefore(deleteSessionBtn, validateSessionBtn.nextSibling);
            
            deleteSessionBtn.addEventListener('click', async () => {
                if(confirm("Voulez-vous vraiment supprimer cette session et l'historique associé ?\n(Les transactions seront retirées de l'historique des paiements)")) {
                    await deleteEntireSession(currentSessionId, currentSessionData);
                }
            });
        }
        
        const dateOnly = logData.date.split('T')[0];
        detailDateUser.textContent = `Saisie du ${dateOnly} par ${logData.user}`;
        
        // Vérifier si déjà validé
        if (logData.status === "VALIDATED") {
            detailStatus.textContent = "Validé par " + (logData.validatedBy || "Admin");
            detailStatus.style.background = "#10b981";
            detailStatus.style.color = "white";
            validateSessionBtn.style.display = 'none'; // Cacher le bouton si déjà validé
            if(deleteSessionBtn) deleteSessionBtn.style.display = 'none';
        } else {
            detailStatus.textContent = "En attente de revue";
            detailStatus.style.background = "#f59e0b";
            detailStatus.style.color = "white";
            validateSessionBtn.style.display = 'block';
            if(deleteSessionBtn) deleteSessionBtn.style.display = 'block';
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
                .limit(500)
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
                .limit(500)
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
            let payeAbidjanCeJour = 0;
            let payeParisCeJour = 0;
            let sessionModes = []; // Stockage des modes de paiement de cette session

            if (t.paymentHistory) {
                t.paymentHistory.forEach(p => {
                    let isMatch = false;
                    // CAS 1 : Nouveau système (Match par ID de session)
                    if (isNewSystemSession) {
                        if (p.sessionId === logId) isMatch = true;
                    } 
                    // CAS 2 : Ancien système (Match par Date + User)
                    else {
                        if (p.date === dateOnly && p.saisiPar === logData.user) isMatch = true;
                    }

                    if (isMatch) {
                        const montantP = (p.montantAbidjan || 0) + (p.montantParis || 0);
                        payeCeJour += montantP;
                        payeAbidjanCeJour += (p.montantAbidjan || 0);
                        payeParisCeJour += (p.montantParis || 0);
                        if (p.modePaiement === 'Espèce') sumEsp += (p.montantAbidjan || 0);
                        
                        sessionModes.push({
                            mode: p.modePaiement || 'Espèce',
                            info: p.agentMobileMoney || '',
                            montant: montantP
                        });
                    }
                });
            } else {
                // Fallback
                payeCeJour = (t.montantAbidjan || 0) + (t.montantParis || 0);
                payeAbidjanCeJour = (t.montantAbidjan || 0);
                payeParisCeJour = (t.montantParis || 0);

                if (t.modePaiement === 'Espèce') sumEsp += (t.montantAbidjan || 0);
                // Fallback très anciennes données sans historique
                if (!isNewSystemSession) {
                    payeCeJour = (t.montantAbidjan || 0) + (t.montantParis || 0);
                    // Note: Pour le fallback ancien, on suppose que c'est réparti comme dans le doc principal
                    if (t.modePaiement === 'Espèce') sumEsp += (t.montantAbidjan || 0);
                    
                    sessionModes.push({
                        mode: t.modePaiement || 'Espèce',
                        info: t.agentMobileMoney || '',
                        montant: payeCeJour
                    });
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

                const resteClass = (t.reste || 0) < 0 ? 'reste-negatif' : 'reste-positif';

                // LOGIQUE MAGASINAGE
                let magasinageDisplay = '-';
                if (t.storageFeeWaived) {
                    magasinageDisplay = '<span class="tag" style="background:#10b981; color:white; font-size:0.8em;">Offert</span>';
                } else if (t.adjustmentType === 'augmentation' && t.adjustmentVal > 0) {
                    magasinageDisplay = `<span style="color:#d97706; font-weight:bold;">${formatCFA(t.adjustmentVal)}</span>`;
                }

                // AJOUT : Date de saisie à côté de l'agent
                const agentsDisplay = t.agent ? `<span style="font-size:0.85em; color:#64748b;">${t.agent}</span> <span style="font-size:0.75em; color:#94a3b8;">(${t.date})</span>` : '-';

                // CONSTRUCTION AFFICHAGE MODE (Gestion Fractionné)
                let modeDisplay = '';
                if (sessionModes.length > 0) {
                    modeDisplay = sessionModes.map(m => {
                        const infoStr = m.info ? ` <span style="font-size:0.85em; color:#666;">(${m.info})</span>` : '';
                        // Si plusieurs modes, on affiche le montant spécifique
                        const amountStr = sessionModes.length > 1 ? ` : <b>${formatCFA(m.montant)}</b>` : '';
                        return `<div style="white-space:nowrap;">${m.mode}${infoStr}${amountStr}</div>`;
                    }).join('');
                } else {
                    modeDisplay = t.modePaiement;
                }

                detailsEncaissementsBody.innerHTML += `
                    <tr data-id="${doc.id}">
                        <td>${t.reference}</td><td>${t.nom}</td><td>${t.conteneur}</td><td>${agentsDisplay}</td><td>${magasinageDisplay}</td><td>${formatCFA(t.prix)}</td><td style="font-weight:bold; color:#d97706;">${formatCFA(payeAbidjanCeJour)}</td><td style="font-weight:bold; color:#2563eb;">${formatCFA(payeParisCeJour)}</td><td>${modeDisplay}</td><td class="${resteClass}">${formatCFA(t.reste)}</td>
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
            
            // MISE À JOUR DU LOG D'AUDIT (Pour que la session sache qu'elle a perdu une transaction)
            if (currentSessionData.transactionIds) {
                const auditRef = db.collection("audit_logs").doc(currentSessionId);
                await auditRef.update({
                    transactionIds: firebase.firestore.FieldValue.arrayRemove(docId)
                });
                
                // Vérifier si la session est devenue vide
                const updatedLog = await auditRef.get();
                const d = updatedLog.data();
                const tEmpty = !d.transactionIds || d.transactionIds.length === 0;
                const eEmpty = !d.expenseIds || d.expenseIds.length === 0;
                
                if (tEmpty && eEmpty) {
                    await auditRef.delete();
                    sessionDetailsEl.style.display = 'none';
                    noSelectionMsg.style.display = 'block';
                    return; // Fin, plus rien à afficher
                }
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
            
            // Trouver le montant actuel payé ce jour-là pour pré-remplir
            let currentPaymentAbj = 0;
            let currentPaymentPar = 0;
            
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
                }
            }

            // Pré-remplir et afficher le modal
            currentEditDocId = docId;
            currentEditOriginalData = data;
            
            editPrixInput.value = data.prix || 0;
            editMontantAbidjanInput.value = currentPaymentAbj;
            editMontantParisInput.value = currentPaymentPar;
            
            editModal.classList.add('active');

        } catch (error) {
            console.error(error);
            alert("Erreur lors de l'ouverture de la modification.");
        }
    }

    // LOGIQUE ENREGISTREMENT MODAL
    saveEditBtn.onclick = async () => {
        if (!currentEditDocId || !currentEditOriginalData) return;
        
        const newPrix = parseFloat(editPrixInput.value) || 0;
        const newPaymentAbj = parseFloat(editMontantAbidjanInput.value) || 0;
        const newPaymentPar = parseFloat(editMontantParisInput.value) || 0;
        
        saveEditBtn.disabled = true;
        saveEditBtn.textContent = "Enregistrement...";

        try {
            const docRef = db.collection("transactions").doc(currentEditDocId);
            const data = currentEditOriginalData;
            const sessionDate = currentSessionData.date.split('T')[0];
            const sessionUser = currentSessionData.user;
            
            // 1. Retirer l'ancienne entrée
            let newHistory;
            let currentMode = 'Espèce';
            let currentAgent = '';
            let currentInfo = '';
            let currentSessionIdEntry = currentSessionId;

            let oldEntry;
            if (currentSessionData.transactionIds) {
                oldEntry = (data.paymentHistory || []).find(p => p.sessionId === currentSessionId);
                newHistory = (data.paymentHistory || []).filter(p => p.sessionId !== currentSessionId);
            } else {
                oldEntry = (data.paymentHistory || []).find(p => p.date === sessionDate && p.saisiPar === sessionUser);
                newHistory = (data.paymentHistory || []).filter(p => !(p.date === sessionDate && p.saisiPar === sessionUser));
            }

            if (oldEntry) {
                currentMode = oldEntry.modePaiement || 'Espèce';
                currentAgent = oldEntry.agent || '';
                currentInfo = oldEntry.agentMobileMoney || '';
                if(oldEntry.sessionId) currentSessionIdEntry = oldEntry.sessionId;
            } else {
                currentAgent = data.agent || '';
            }
            
            // 2. Ajouter la nouvelle entrée corrigée
            newHistory.push({
                date: sessionDate,
                saisiPar: sessionUser,
                montantAbidjan: newPaymentAbj,
                montantParis: newPaymentPar,
                modePaiement: currentMode,
                agent: currentAgent,
                agentMobileMoney: currentInfo,
                sessionId: currentSessionIdEntry
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

            closeEditModalFunc();
            loadSessionDetails(currentSessionId, currentSessionData);

        } catch (error) {
            console.error(error);
            alert("Erreur lors de l'enregistrement.");
        } finally {
            saveEditBtn.disabled = false;
            saveEditBtn.textContent = "Enregistrer";
        }
    };

    // NOUVELLE FONCTION : Supprimer toute la session
    async function deleteEntireSession(sessionId, sessionData) {
        try {
            // 1. Supprimer les transactions associées (Nettoyage historique)
            // On réutilise la logique de handleDelete pour chaque transaction visible
            const rows = Array.from(detailsEncaissementsBody.querySelectorAll('tr'));
            for (const row of rows) {
                const docId = row.dataset.id;
                // Copie simplifiée de la logique de suppression :
                const docRef = db.collection("transactions").doc(docId);
                const doc = await docRef.get();
                if (doc.exists) {
                    const data = doc.data();
                    if (data.paymentHistory) {
                        let newHistory;
                        if (sessionData.transactionIds) {
                            newHistory = data.paymentHistory.filter(p => p.sessionId !== sessionId);
                        } else {
                            const sDate = sessionData.date.split('T')[0];
                            newHistory = data.paymentHistory.filter(p => !(p.date === sDate && p.saisiPar === sessionData.user));
                        }
                        // Recalcul
                        let newAbj = 0, newPar = 0;
                        newHistory.forEach(p => { newAbj += (p.montantAbidjan||0); newPar += (p.montantParis||0); });
                        const newReste = (data.prix||0) - (newAbj + newPar);
                        await docRef.update({ paymentHistory: newHistory, montantAbidjan: newAbj, montantParis: newPar, reste: newReste });
                    }
                }
            }

            // 2. Supprimer les dépenses associées (Si IDs disponibles)
            if (sessionData.expenseIds && Array.isArray(sessionData.expenseIds)) {
                for (const expId of sessionData.expenseIds) {
                    await db.collection("expenses").doc(expId).update({ isDeleted: true });
                }
            }

            // 3. Supprimer le log
            await db.collection("audit_logs").doc(sessionId).delete();
            
            sessionDetailsEl.style.display = 'none';
            noSelectionMsg.style.display = 'block';
            alert("Session supprimée.");
        } catch (e) {
            console.error(e);
            alert("Erreur lors de la suppression de la session.");
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
    initBackToTopButton();
});