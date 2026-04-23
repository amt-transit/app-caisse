import { db } from './firebase-config.js';
import { collection, doc, updateDoc, deleteDoc, getDoc, getDocs, query, where, orderBy, onSnapshot, writeBatch, arrayRemove, limit } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {

    const sessionsListPendingEl = document.getElementById('sessionsListPending');
    const sessionsListValidatedEl = document.getElementById('sessionsListValidated');
    const sessionsListArchivesEl = document.getElementById('sessionsListArchives');
    const sessionDetailsEl = document.getElementById('sessionDetails');
    const noSelectionMsg = document.getElementById('noSelectionMsg');
    const filterDateSession = document.getElementById('filterDateSession');
    
    const detailDateUser = document.getElementById('detailDateUser');
    const detailStatus = document.getElementById('detailStatus');
    const validateSessionBtn = document.getElementById('validateSessionBtn');
    const archiveSessionBtn = document.getElementById('archiveSessionBtn');
    
    const detailsEncaissementsBody = document.getElementById('detailsEncaissementsBody');
    const detailsDepensesBody = document.getElementById('detailsDepensesBody');
    
    const countEncaissements = document.getElementById('countEncaissements');
    const countDepenses = document.getElementById('countDepenses');
    const totalEspEl = document.getElementById('totalEsp');
    const totalDepEl = document.getElementById('totalDep');
    const totalNetEl = document.getElementById('totalNet');

    const archiveMonthInput = document.getElementById('archiveMonth');
    const searchArchiveBtn = document.getElementById('searchArchiveBtn');
    const globalSessionSearch = document.getElementById('globalSessionSearch');

    let currentSessionId = null;
    let currentSessionData = null; // Pour stocker les infos de la session en cours (date, user)
    let currentSessionAllTransactions = []; // Pour la recherche
    let confirmationSearchInput = null; // Pour la recherche
    const userRole = sessionStorage.getItem('userRole');
    const isViewer = userRole === 'spectateur';
    let allAgents = []; // Pour la liste déroulante des agents

    // --- MODAL ÉDITION (Injection Dynamique) ---
    const editModalHTML = `
    <div id="editTransactionModal" class="modal">
        <div class="modal-content" style="max-width: 950px; border-radius: 12px;">
            <span class="close-modal" id="closeEditModal" style="float:right; cursor:pointer; font-size:24px;">&times;</span>
            <h2 id="editModalTitle" style="margin-top:0;">Modifier Transaction</h2>
            
            <div class="form-grid" style="display:grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap:15px; margin-bottom:20px;">
                <div><label>Date Opération</label><input type="date" id="editMainDate" style="width:100%;"></div>
                <div><label>Référence</label><input type="text" id="editRef" readonly style="background:#eee; width:100%;"></div>
                <div><label>Nom Client</label><input type="text" id="editNom" style="width:100%;"></div>
                <div><label>Conteneur</label><input type="text" id="editConteneur" style="width:100%;"></div>
                <div><label>Prix Total</label><input type="number" id="editPrixTotal" style="width:100%;"></div>
            </div>

            <hr style="margin: 20px 0; border:0; border-top:1px solid #eee;">

            <h3 style="margin-bottom:10px;">Historique des paiements</h3>
            <div style="max-height: 200px; overflow-y: auto; border: 1px solid #eee; border-radius: 8px;">
                <table class="table" style="margin:0;">
                    <thead><tr><th>Date</th><th>Montant Paris</th><th>Montant Abidjan</th><th>Mode</th><th>Agent</th><th>Saisi par</th><th>Action</th></tr></thead>
                    <tbody id="editPaymentsBody"></tbody>
                </table>
            </div>

            <h3 style="margin-top:20px;">Ajouter / Modifier un paiement</h3>
            <div class="form-grid" style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:15px; background: #f8f9fa; padding: 15px; border-radius: 8px;">
                <input type="hidden" id="editPaymentIndex">
                <div><label>Date</label><input type="date" id="editPayDate" style="width:100%;"></div>
                <div><label>Montant Paris</label><input type="number" id="editPayParis" placeholder="0" style="width:100%;"></div>
                <div><label>Montant Abidjan</label><input type="number" id="editPayAbidjan" placeholder="0" style="width:100%;"></div>
                <div><label>Mode Paiement</label>
                    <select id="editPayMode" style="width:100%;"><option>Espèce</option><option>Wave</option><option>OM</option><option>Chèque</option><option>Virement</option></select>
                </div>
                <div><label>Banque / Agent MM</label><input type="text" id="editPayInfo" placeholder="Ex: BICICI, Wave..." style="width:100%;"></div>
                <div><label>Agent (Livreur)</label><select id="editPayAgent" style="width:100%;"></select></div>
            </div>
            <button id="addOrUpdatePaymentBtn" class="btn" style="margin-top:10px; background:#3b82f6; color:white; border:none; padding:8px 15px; border-radius:6px; cursor:pointer;">Ajouter ce paiement</button>

            <div style="text-align:right; margin-top:30px; border-top: 1px solid #eee; padding-top: 15px;">
                <button id="cancelEditBtn" class="btn" style="background: #6c757d; color:white; margin-right:10px; border:none; padding:8px 15px; border-radius:6px; cursor:pointer;">Annuler</button>
                <button id="saveEditBtn" class="btn btn-success" style="background: #10b981; color:white; border:none; padding:8px 15px; border-radius:6px; cursor:pointer;">Enregistrer les modifications</button>
            </div>
        </div>
    </div>

    <!-- MODAL ÉDITION DÉPENSE -->
    <div id="editExpenseModal" class="modal">
        <div class="modal-content" style="max-width: 500px; border-radius: 12px; padding:20px;">
            <span class="close-modal" id="closeExpenseModal" style="float:right; cursor:pointer; font-size:24px;">&times;</span>
            <h2 style="margin-top:0;">Modifier Dépense</h2>
            <div style="margin-bottom:15px;"><label style="display:block; margin-bottom:5px;">Date</label><input type="date" id="editExpDate" style="width:100%; padding:8px; box-sizing:border-box;"></div>
            <div style="margin-bottom:15px;"><label style="display:block; margin-bottom:5px;">Description</label><input type="text" id="editExpDesc" style="width:100%; padding:8px; box-sizing:border-box;"></div>
            <div style="margin-bottom:15px;"><label style="display:block; margin-bottom:5px;">Montant</label><input type="number" id="editExpAmount" style="width:100%; padding:8px; box-sizing:border-box;"></div>
            <div style="margin-bottom:15px;"><label style="display:block; margin-bottom:5px;">Type</label>
                <select id="editExpType" style="width:100%; padding:8px; box-sizing:border-box;">
                    <option value="Mensuelle">Mensuelle</option>
                    <option value="Conteneur">Conteneur</option>
                </select>
            </div>
            <div style="text-align:right; margin-top:20px;">
                <button id="saveExpenseBtn" class="btn btn-success" style="background: #10b981; color:white; border:none; padding:8px 15px; border-radius:6px; cursor:pointer;">Enregistrer</button>
            </div>
        </div>
    </div>
    `;
    document.body.insertAdjacentHTML('beforeend', editModalHTML);

    const editModal = document.getElementById('editTransactionModal');
    const editExpenseModal = document.getElementById('editExpenseModal');
    const closeEditModalBtn = document.getElementById('closeEditModal');
    const closeExpenseModalBtn = document.getElementById('closeExpenseModal');
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    const saveEditBtn = document.getElementById('saveEditBtn');
    const addOrUpdatePaymentBtn = document.getElementById('addOrUpdatePaymentBtn');
    const saveExpenseBtn = document.getElementById('saveExpenseBtn');

    // Champs Transaction
    const editMainDate = document.getElementById('editMainDate');
    const editRef = document.getElementById('editRef');
    const editNom = document.getElementById('editNom');
    const editConteneur = document.getElementById('editConteneur');
    const editPrixTotal = document.getElementById('editPrixTotal');
    const editPaymentsBody = document.getElementById('editPaymentsBody');
    const editPaymentIndex = document.getElementById('editPaymentIndex');
    const editPayDate = document.getElementById('editPayDate');
    const editPayParis = document.getElementById('editPayParis');
    const editPayAbidjan = document.getElementById('editPayAbidjan');
    const editPayMode = document.getElementById('editPayMode');
    const editPayInfo = document.getElementById('editPayInfo');
    const editPayAgent = document.getElementById('editPayAgent');

    // Champs Dépense
    const editExpDate = document.getElementById('editExpDate');
    const editExpDesc = document.getElementById('editExpDesc');
    const editExpAmount = document.getElementById('editExpAmount');
    const editExpType = document.getElementById('editExpType');

    let currentEditingTransaction = null;
    let currentEditingExpenseId = null;

    function closeEditModalFunc() {
        editModal.classList.remove('active');
        currentEditingTransaction = null;
    }

    function closeExpenseModalFunc() {
        editExpenseModal.classList.remove('active');
        currentEditingExpenseId = null;
    }

    if(closeEditModalBtn) closeEditModalBtn.onclick = closeEditModalFunc;
    if(cancelEditBtn) cancelEditBtn.onclick = closeEditModalFunc;
    if(closeExpenseModalBtn) closeExpenseModalBtn.onclick = closeExpenseModalFunc;
    
    // Fermeture au clic en dehors
    window.addEventListener('click', (e) => {
        if (e.target == editModal) closeEditModalFunc();
        if (e.target == editExpenseModal) closeExpenseModalFunc();
    });

    // --- INJECTION BARRE DE RECHERCHE ---
    const encaissementsCard = document.getElementById('detailsEncaissementsBody')?.closest('.card');
    if (encaissementsCard) {
        const h3 = encaissementsCard.querySelector('h3');
        confirmationSearchInput = document.createElement('input');
        confirmationSearchInput.type = 'text';
        confirmationSearchInput.id = 'confirmationSearchInput';
        confirmationSearchInput.placeholder = 'Rechercher un colis (Réf, Nom, Conteneur)...';
        confirmationSearchInput.style.cssText = "width: 100%; padding: 8px; margin: 10px 0; border: 1px solid #ccc; border-radius: 6px; box-sizing: border-box;";
        
        if (h3) {
            // On insère la barre de recherche après le titre "Encaissements"
            h3.parentNode.insertBefore(confirmationSearchInput, h3.nextSibling);
        }

        confirmationSearchInput.addEventListener('input', filterAndRenderTransactions);
    }

    // --- CHARGEMENT AGENTS ---
    getDocs(query(collection(db, "agents"), orderBy("name"))).then(snap => {
        allAgents = snap.docs.map(doc => doc.data().name);
        if(editPayAgent) editPayAgent.innerHTML = '<option value="">- Aucun -</option>' + allAgents.map(a => `<option value="${a}">${a}</option>`).join('');
    });


    // 1. Charger la liste des sessions (Basé sur les logs de validation)
    function loadSessions() {
        const qLogs = query(collection(db, "audit_logs"), where("action", "==", "VALIDATION_JOURNEE"), orderBy("date", "desc"));

        onSnapshot(qLogs, snapshot => {
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

                // FILTRE : Masquer les sessions archivées de la vue principale
                if (data.status === "ARCHIVED") return;

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
        
        div.addEventListener('mouseover', () => {
            if (!div.classList.contains('selected-session')) div.style.background = '#f1f5f9';
        });
        div.addEventListener('mouseout', () => {
            if (!div.classList.contains('selected-session')) div.style.background = 'transparent';
        });
        div.addEventListener('click', () => {
            document.querySelectorAll('.session-item').forEach(el => {
                el.classList.remove('selected-session');
                el.style.background = 'transparent';
            });
            div.classList.add('selected-session');
            div.style.background = '#e0f2fe'; // Bleu clair pour la sélection
            loadSessionDetails(doc.id, data);
        });
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

        const qArchives = query(collection(db, "audit_logs"), where("action", "==", "VALIDATION_JOURNEE"), where("date", ">=", start), where("date", "<=", end), orderBy("date", "desc"));

        getDocs(qArchives)
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
                if(await AppModal.confirm("Voulez-vous vraiment supprimer cette session et l'historique associé ?\n\n(Les transactions seront retirées de l'historique des paiements)", "Suppression de Session", true)) {
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
            if(archiveSessionBtn) archiveSessionBtn.style.display = 'inline-block'; // Afficher bouton archiver
            if(deleteSessionBtn) deleteSessionBtn.style.display = 'none';
        } else {
            detailStatus.textContent = "En attente de revue";
            detailStatus.style.background = isViewer ? "#6c757d" : "#f59e0b"; // Gris pour spectateur
            detailStatus.style.color = "white";
            validateSessionBtn.style.display = 'block';
            if(archiveSessionBtn) archiveSessionBtn.style.display = 'none';
            if(deleteSessionBtn) deleteSessionBtn.style.display = 'block';
        }

        // --- CHARGEMENT ROBUSTE (HYBRIDE) ---
        let transactionsDocs = [];
        let expensesDocs = [];

        // CAS 1 : NOUVEAU SYSTÈME (IDs stockés dans le log)
        if (logData.transactionIds && Array.isArray(logData.transactionIds)) {
            // On charge exactement les documents concernés par cette session
            const tPromises = logData.transactionIds.map(id => getDoc(doc(db, "transactions", id)));
            const tSnapshots = await Promise.all(tPromises);
            transactionsDocs = tSnapshots.filter(doc => doc.exists());
        } 
        // CAS 2 : ANCIEN SYSTÈME (Fallback sur la date/user)
        else {
            const qTransFallback = query(collection(db, "transactions"), where("saisiPar", "==", logData.user), where("lastPaymentDate", "==", dateOnly));
            const transSnap = await getDocs(qTransFallback);
            transactionsDocs = transSnap.docs;
        }

        // IDEM POUR LES DÉPENSES
        if (logData.expenseIds && Array.isArray(logData.expenseIds)) {
            const ePromises = logData.expenseIds.map(id => getDoc(doc(db, "expenses", id)));
            const eSnapshots = await Promise.all(ePromises);
            expensesDocs = eSnapshots.filter(doc => doc.exists()).map(d => ({ id: d.id, ...d.data() }));
        } else {
            // Fallback ancien système
            const qExpFallback = query(collection(db, "expenses"), where("description", ">=", ""), orderBy("description"));
            const expSnap = await getDocs(qExpFallback);
            expensesDocs = expSnap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(e => e.date === dateOnly && e.description.includes(logData.user));
        }

        // Rendu Transactions
        detailsEncaissementsBody.innerHTML = '';
        currentSessionAllTransactions = []; // Vider pour la nouvelle session
        let sumEsp = 0;
        let totalsByMode = {}; // Nouveau : Pour le détail Wave/Orange/etc.
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

                        // CALCUL DÉTAILLÉ PAR MODE (Wave, Orange, etc.)
                        let modeKey = p.modePaiement || 'Espèce';
                        if (p.agentMobileMoney) modeKey += ` (${p.agentMobileMoney})`; // Ex: "Mobile Money (Wave)"
                        if (!totalsByMode[modeKey]) totalsByMode[modeKey] = 0;
                        totalsByMode[modeKey] += (p.montantAbidjan || 0);
                        
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

                    // CALCUL DÉTAILLÉ FALLBACK
                    let modeKey = t.modePaiement || 'Espèce';
                    if (t.agentMobileMoney) modeKey += ` (${t.agentMobileMoney})`;
                    if (!totalsByMode[modeKey]) totalsByMode[modeKey] = 0;
                    totalsByMode[modeKey] += (t.montantAbidjan || 0);
                    
                    sessionModes.push({
                        mode: t.modePaiement || 'Espèce',
                        info: t.agentMobileMoney || '',
                        montant: payeCeJour
                    });
                }
            }

            if (payeCeJour > 0) { // On ne stocke que les transactions avec un paiement dans cette session
                currentSessionAllTransactions.push({
                    docId: doc.id,
                    data: t,
                    payeAbidjanCeJour,
                    payeParisCeJour,
                    sessionModes
                });
            }
        });

        // Appel à la nouvelle fonction de rendu/filtrage
        filterAndRenderTransactions();

        // --- AFFICHAGE DU DÉTAIL PAR MODE (Wave, Orange, etc.) ---
        const tableContainer = detailsEncaissementsBody.closest('table');
        let breakdownDiv = document.getElementById('breakdownModesDiv');
        if (!breakdownDiv && tableContainer) {
            breakdownDiv = document.createElement('div');
            breakdownDiv.id = 'breakdownModesDiv';
            breakdownDiv.style.cssText = "margin: 10px 0; padding: 10px; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 6px;";
            tableContainer.parentNode.insertBefore(breakdownDiv, tableContainer.nextSibling);
        }
        
        if (breakdownDiv) {
            let html = '<strong>Répartition des Encaissements :</strong><div style="display:flex; gap:15px; flex-wrap:wrap; margin-top:5px;">';
            for (const [m, amount] of Object.entries(totalsByMode)) {
                if (amount > 0) {
                    let bg = '#fff', color = '#333', border = '#ccc';
                    const lowerM = m.toLowerCase();
                    if (lowerM.includes('espèce') || lowerM.includes('espece')) { bg = '#d1fae5'; color = '#065f46'; border = '#34d399'; }
                    else if (lowerM.includes('wave')) { bg = '#e0f2fe'; color = '#0369a1'; border = '#7dd3fc'; }
                    else if (lowerM.includes('om') || lowerM.includes('orange')) { bg = '#ffedd5'; color = '#c2410c'; border = '#fdba74'; }
                    else if (lowerM.includes('chèque') || lowerM.includes('cheque')) { bg = '#f3f4f6'; color = '#374151'; border = '#d1d5db'; }
                    else if (lowerM.includes('virement')) { bg = '#ede9fe'; color = '#4f46e5'; border = '#c4b5fd'; }
                    html += `<div><span class="tag" style="background:${bg}; color:${color}; border:1px solid ${border};">${m}</span> : <b>${formatCFA(amount)}</b></div>`;
                }
            }
            breakdownDiv.innerHTML = html + '</div>';
        }

        // Rendu Dépenses
        detailsDepensesBody.innerHTML = '';
        let sumDep = 0;
        expensesDocs.forEach((e, idx) => {
            // On essaie de récupérer l'ID du document. 
            // Si expensesDocs vient de Promise.all(doc.get()), c'est un objet data() pur si on a fait .map(d=>d.data()).
            // Il faut récupérer l'ID.
            // Dans loadSessionDetails, on a fait: expensesDocs = eSnapshots.filter(doc => doc.exists).map(d => d.data());
            // On a perdu l'ID ! Corrigeons ça.
            
            sumDep += (e.montant || 0);
            
            let actions = '';
            if (!isViewer && logData.status !== "VALIDATED") {
                actions = `<button class="btn-edit-exp" data-id="${e.id}" style="background:#3b82f6; color:white; border:none; padding:2px 6px; border-radius:4px; cursor:pointer; margin-right:5px;">✏️</button>
                           <button class="btn-delete-exp" data-id="${e.id}" style="background:#ef4444; color:white; border:none; padding:2px 6px; border-radius:4px; cursor:pointer;">🗑️</button>`;
            }

            detailsDepensesBody.innerHTML += `<tr><td>${e.description}</td><td>${e.type}</td><td>${formatCFA(e.montant)}</td><td>${actions}</td></tr>`;
        });
        countDepenses.textContent = expensesDocs.length;

        // Totaux
        totalEspEl.textContent = formatCFA(sumEsp);
        totalDepEl.textContent = formatCFA(sumDep);
        totalNetEl.textContent = formatCFA(sumEsp - sumDep);
    }

    // --- NOUVELLES FONCTIONS POUR LA RECHERCHE ---

    function filterAndRenderTransactions() {
        const searchTerm = confirmationSearchInput ? confirmationSearchInput.value.toLowerCase().trim() : '';
        let filteredTransactions = currentSessionAllTransactions;

        if (searchTerm) {
            filteredTransactions = currentSessionAllTransactions.filter(trans => {
                const t = trans.data;
                return (t.reference || '').toLowerCase().includes(searchTerm) ||
                       (t.nom || '').toLowerCase().includes(searchTerm) ||
                       (t.conteneur || '').toLowerCase().includes(searchTerm);
            });
        }

        renderTransactionsTable(filteredTransactions);
    }

    function renderTransactionsTable(transactionsToRender) {
        detailsEncaissementsBody.innerHTML = '';

        if (transactionsToRender.length === 0) {
            detailsEncaissementsBody.innerHTML = '<tr><td colspan="11" style="text-align:center; padding:15px;">Aucun encaissement trouvé pour cette recherche.</td></tr>';
            countEncaissements.textContent = 0;
            return;
        }

        transactionsToRender.forEach(trans => {
            const { docId, data: t, payeAbidjanCeJour, payeParisCeJour, sessionModes } = trans;

            let actionButtons = '';
            if (!isViewer && currentSessionData.status !== "VALIDATED") {
                actionButtons = `
                    <button class="btn-edit" style="background:#3b82f6; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; margin-right:5px;">✏️</button>
                    <button class="btn-delete" style="background:#ef4444; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">🗑️</button>
                `;
            } else {
                actionButtons = `<span style="color:#94a3b8; font-size:0.8em;">🔒 Validé</span>`;
            }

            const resteClass = (t.reste || 0) < 0 ? 'reste-negatif' : 'reste-positif';

            let magasinageDisplay = '-';
            if (t.storageFeeWaived) {
                magasinageDisplay = '<span class="tag" style="background:#10b981; color:white; font-size:0.8em;">Offert</span>';
            } else if (t.adjustmentType === 'augmentation' && t.adjustmentVal > 0) {
                magasinageDisplay = `<span style="color:#d97706; font-weight:bold;">${formatCFA(t.adjustmentVal)}</span>`;
            }

            const agentsDisplay = t.agent ? `<span style="font-size:0.85em; color:#64748b;">${t.agent}</span> <span style="font-size:0.75em; color:#94a3b8;">(${t.date})</span>` : '-';

            let modeDisplay = '';
            if (sessionModes.length > 0) {
                modeDisplay = sessionModes.map(m => {
                    const infoStr = m.info ? ` <span style="font-size:0.85em; color:#666;">(${m.info})</span>` : '';
                    const amountStr = sessionModes.length > 1 ? ` : <b>${formatCFA(m.montant)}</b>` : '';
                    return `<div style="white-space:nowrap;">${m.mode}${infoStr}${amountStr}</div>`;
                }).join('');
            } else {
                modeDisplay = t.modePaiement;
            }

            const row = document.createElement('tr');
            row.dataset.id = docId;
            row.innerHTML = `
                <td>${t.reference}</td><td>${t.nom}</td><td>${t.conteneur}</td><td>${agentsDisplay}</td><td>${magasinageDisplay}</td><td>${formatCFA(t.prix)}</td><td style="font-weight:bold; color:#d97706;">${formatCFA(payeAbidjanCeJour)}</td><td style="font-weight:bold; color:#2563eb;">${formatCFA(payeParisCeJour)}</td><td>${modeDisplay}</td><td class="${resteClass}">${formatCFA(t.reste)}</td>
                <td>${actionButtons}</td>
            `;
            detailsEncaissementsBody.appendChild(row);
        });

        countEncaissements.textContent = transactionsToRender.length;
    }

    // --- RECHERCHE GLOBALE DE SESSION (Par Référence) ---
    if (globalSessionSearch) {
        globalSessionSearch.addEventListener('change', async () => {
            const term = globalSessionSearch.value.trim().toUpperCase();
            if (!term) {
                loadSessions(); // Recharger la vue par défaut
                return;
            }

            sessionsListPendingEl.innerHTML = '<p style="padding:10px; color:#666;">Recherche de la session...</p>';
            sessionsListValidatedEl.innerHTML = '';

            // 1. Trouver la transaction correspondante (Match Exact OU Partiel)
            let matchingDocs = [];

            // A. Match Exact (Rapide)
            let tSnaps = await db.collection("transactions").where("reference", "==", term).get();
            if (!tSnaps.empty) matchingDocs = tSnaps.docs;
            
            // B. Si pas trouvé, Match Nom Exact
            if (matchingDocs.length === 0) {
                tSnaps = await db.collection("transactions").where("nom", "==", term).get();
                if (!tSnaps.empty) matchingDocs = tSnaps.docs;
            }

            // C. Si toujours rien, Recherche Partielle (Scan des 2000 derniers éléments)
            // Permet de trouver "023" dans "ML-023-D53"
            if (matchingDocs.length === 0) {
                sessionsListPendingEl.innerHTML = '<p style="padding:10px; color:#666;">Recherche approfondie...</p>';
                const snapshot = await db.collection("transactions").orderBy("date", "desc").get();
                
                matchingDocs = snapshot.docs.filter(doc => {
                    const d = doc.data();
                    return (d.reference || '').toUpperCase().includes(term) || 
                           (d.nom || '').toUpperCase().includes(term);
                });
            }

            if (matchingDocs.length === 0) {
                sessionsListPendingEl.innerHTML = '<p style="padding:10px; color:#ef4444;">Aucune transaction trouvée (sur les 2000 dernières).</p>';
                return;
            }

            const foundSessions = new Map();
            const transIds = matchingDocs.map(d => d.id);

            // 2. Trouver les sessions contenant ces transactions
            // Stratégie A : Nouveau système (transactionIds contient l'ID)
            // Note : array-contains-any est limité à 10 valeurs
            const chunks = [];
            for (let i=0; i<transIds.length; i+=10) chunks.push(transIds.slice(i, i+10));

            for (const chunk of chunks) {
                const q = await getDocs(query(collection(db, "audit_logs"), where("action", "==", "VALIDATION_JOURNEE"), where("transactionIds", "array-contains-any", chunk)));
                q.forEach(doc => foundSessions.set(doc.id, doc));
            }

            // Stratégie B : Ancien système (Fallback Date/User)
            if (foundSessions.size === 0) {
                const docsToCheck = matchingDocs.filter(d => transIds.includes(d.id));
                for (const docT of docsToCheck) {
                    const tData = docT.data();
                    // On cherche une session validée par cet utilisateur à cette date (entryDate)
                    const qFallback = query(collection(db, "audit_logs"), where("action", "==", "VALIDATION_JOURNEE"), where("user", "==", tData.saisiPar), where("entryDate", "==", tData.date), limit(1));
                    const q = await getDocs(qFallback);
                    q.forEach(doc => foundSessions.set(doc.id, doc));
                }
            }

            sessionsListPendingEl.innerHTML = '';
            if (foundSessions.size === 0) {
                sessionsListPendingEl.innerHTML = '<p style="padding:10px;">Transaction trouvée, mais aucune session de validation associée (Peut-être une saisie directe ou ancienne).</p>';
            } else {
                sessionsListPendingEl.innerHTML = `<div style="padding:5px 10px; background:#e0f2fe; color:#0284c7; font-size:0.9em; font-weight:bold;">Résultats pour "${term}" :</div>`;
                // Tri par date décroissante
                const sortedSessions = Array.from(foundSessions.values()).sort((a, b) => {
                    return new Date(b.data().date) - new Date(a.data().date);
                });
                sortedSessions.forEach(doc => {
                    sessionsListPendingEl.appendChild(createSessionElement(doc));
                });
            }
        });
    }

    // --- ARCHIVAGE DE SESSION ---
    if (archiveSessionBtn) {
        archiveSessionBtn.addEventListener('click', async () => { if (isViewer) return;
            if (!currentSessionId) return;
            if (await AppModal.confirm("Voulez-vous archiver cette session ?\n\nElle disparaîtra de la liste principale mais restera accessible via la recherche d'archives par mois.", "Archivage")) {
                try {
                    await updateDoc(doc(db, "audit_logs", currentSessionId), { status: "ARCHIVED" });
                    AppModal.success("Session archivée avec succès.");
                    sessionDetailsEl.style.display = 'none';
                    noSelectionMsg.style.display = 'block';
                    // On recharge la liste pour faire disparaître la session
                    loadSessions();
                } catch (error) {
                    console.error(error);
                    AppModal.error("Erreur lors de l'archivage.");
                }
            }
        });
    }

    // --- GESTION DES ACTIONS (MODIFIER / SUPPRIMER) ---
    detailsEncaissementsBody.addEventListener('click', async (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        
        const tr = btn.closest('tr');
        const docId = tr.dataset.id;
        
        // Vérifier si la session est déjà validée ou si l'utilisateur est un spectateur
        if (detailStatus.textContent.includes("Validé")) {
            AppModal.error("Impossible de modifier une session déjà validée.");
            return;
        }

        if (btn.classList.contains('btn-delete')) {
            await handleDelete(docId);
        } else if (btn.classList.contains('btn-edit')) {
            await handleEdit(docId);
        }
    });

    // --- GESTION ACTIONS DÉPENSES ---
    detailsDepensesBody.addEventListener('click', async (e) => {
        const btn = e.target.closest('button');
        if (!btn || isViewer) return;
        if (!btn) return;
        const docId = btn.dataset.id;
        if (btn.classList.contains('btn-delete-exp')) {
            await handleDeleteExpense(docId);
        } else if (btn.classList.contains('btn-edit-exp')) {
            await handleEditExpense(docId);
        }
    });

    async function handleDelete(docId) {
        if (!await AppModal.confirm("Voulez-vous vraiment supprimer cet encaissement de la journée ?", "Suppression", true)) return;
        
        try {
            const docRef = doc(db, "transactions", docId);
            const docSnap = await getDoc(docRef);
            if (!docSnap.exists()) return;
            
            const data = docSnap.data();
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
                
                await updateDoc(docRef, {
                    paymentHistory: newHistory,
                    montantAbidjan: newAbj,
                    montantParis: newPar,
                    reste: newReste
                });
            } else {
                // Fallback (Anciennes données sans historique) : On marque supprimé
                await updateDoc(docRef, { isDeleted: true });
            }
            
            // MISE À JOUR DU LOG D'AUDIT (Pour que la session sache qu'elle a perdu une transaction)
            if (currentSessionData.transactionIds) {
                const auditRef = doc(db, "audit_logs", currentSessionId);
                await updateDoc(auditRef, {
                    transactionIds: arrayRemove(docId)
                });
                
                // Vérifier si la session est devenue vide
                const updatedLog = await getDoc(auditRef);
                const d = updatedLog.data();
                const tEmpty = !d.transactionIds || d.transactionIds.length === 0;
                const eEmpty = !d.expenseIds || d.expenseIds.length === 0;
                
                if (tEmpty && eEmpty) {
                    await deleteDoc(auditRef);
                    sessionDetailsEl.style.display = 'none';
                    noSelectionMsg.style.display = 'block';
                    return; // Fin, plus rien à afficher
                }
            }

            // Rafraîchir l'affichage
            loadSessionDetails(currentSessionId, currentSessionData);
        } catch (error) {
            console.error(error);
            AppModal.error("Erreur lors de la suppression.");
        }
    }

    async function handleDeleteExpense(docId) {
        if (!await AppModal.confirm("Supprimer cette dépense ?", "Suppression", true)) return;
        try {
            // 1. Marquer supprimé
            await updateDoc(doc(db, "expenses", docId), { isDeleted: true });
            
            // 2. Retirer du log de session
            if (currentSessionData.expenseIds) {
                const auditRef = doc(db, "audit_logs", currentSessionId);
                await updateDoc(auditRef, {
                    expenseIds: arrayRemove(docId)
                });
            }
            loadSessionDetails(currentSessionId, currentSessionData);
        } catch (e) {
            console.error(e);
            AppModal.error("Erreur suppression dépense.");
        }
    }

    async function handleEditExpense(docId) {
        try {
            const docSnap = await getDoc(doc(db, "expenses", docId));
            if (!docSnap.exists()) return;
            const data = docSnap.data();
            currentEditingExpenseId = docId;
            editExpDate.value = data.date;
            editExpDesc.value = data.description;
            editExpAmount.value = data.montant;
            editExpType.value = data.type || 'Mensuelle';
            editExpenseModal.classList.add('active');
        } catch (e) { console.error(e); }
    }

    saveExpenseBtn.onclick = async () => {
        if (!currentEditingExpenseId) return;
        try {
            await updateDoc(doc(db, "expenses", currentEditingExpenseId), {
                date: editExpDate.value,
                description: editExpDesc.value,
                montant: parseFloat(editExpAmount.value) || 0,
                type: editExpType.value
            });
            closeExpenseModalFunc();
            loadSessionDetails(currentSessionId, currentSessionData);
        } catch (e) { AppModal.error("Erreur lors de l'enregistrement de la dépense."); }
    };

    async function handleEdit(docId) {
        try {
            const docRef = doc(db, "transactions", docId);
            const docSnap = await getDoc(docRef);
            if (!docSnap.exists()) return;
            
            const data = docSnap.data();
            
            // Copie profonde
            currentEditingTransaction = JSON.parse(JSON.stringify({ id: doc.id, ...data }));

            // Remplir champs principaux
            document.getElementById('editModalTitle').textContent = `Modifier : ${data.reference}`;
            editMainDate.value = data.date;
            editRef.value = data.reference;
            editNom.value = data.nom || '';
            editConteneur.value = data.conteneur || '';
            editPrixTotal.value = data.prix || 0;

            renderPaymentHistoryTable();
            resetPaymentForm();
            editModal.classList.add('active');

        } catch (error) {
            console.error(error);
            AppModal.error("Erreur technique lors de l'ouverture de la modification.");
        }
    }

    // --- LOGIQUE MODAL TRANSACTION (COPIÉE DE HISTORY.JS) ---
    function renderPaymentHistoryTable() {
        editPaymentsBody.innerHTML = '';
        if (!currentEditingTransaction || !currentEditingTransaction.paymentHistory) return;

        currentEditingTransaction.paymentHistory.forEach((p, index) => {
            const tr = document.createElement('tr');
            // Surbrillance du paiement de la session actuelle
            const isCurrentSession = p.sessionId === currentSessionId;
            if (isCurrentSession) tr.style.backgroundColor = "#e0f2fe";

            tr.innerHTML = `
                <td>${p.date}</td>
                <td>${formatCFA(p.montantParis)}</td>
                <td>${formatCFA(p.montantAbidjan)}</td>
                <td>${p.modePaiement || 'Espèce'}</td>
                <td>${p.agent || '-'}</td>
                <td>${p.saisiPar || '?'}</td>
                <td>
                    <button class="btn-small" onclick="window.editConfPayment(${index})">✏️</button>
                    <button class="btn-small btn-danger" onclick="window.deleteConfPayment(${index})">🗑️</button>
                </td>
            `;
            editPaymentsBody.appendChild(tr);
        });
    }

    function resetPaymentForm() {
        editPaymentIndex.value = '';
        editPayDate.value = new Date().toISOString().split('T')[0];
        editPayParis.value = '';
        editPayAbidjan.value = '';
        editPayMode.value = 'Espèce';
        editPayInfo.value = '';
        editPayAgent.value = '';
        addOrUpdatePaymentBtn.textContent = "Ajouter ce paiement";
    }

    // Fonctions globales pour les boutons onclick dans le HTML généré
    window.editConfPayment = (index) => {
        const payment = currentEditingTransaction.paymentHistory[index];
        editPaymentIndex.value = index;
        editPayDate.value = payment.date;
        editPayParis.value = payment.montantParis || 0;
        editPayAbidjan.value = payment.montantAbidjan || 0;
        editPayMode.value = payment.modePaiement || 'Espèce';
        editPayInfo.value = payment.agentMobileMoney || '';
        editPayAgent.value = payment.agent || '';
        addOrUpdatePaymentBtn.textContent = "Mettre à jour ce paiement";
    };

    window.deleteConfPayment = async (index) => {
        if (await AppModal.confirm("Supprimer ce paiement de l'historique ?", "Suppression", true)) {
            currentEditingTransaction.paymentHistory.splice(index, 1);
            renderPaymentHistoryTable();
        }
    };

    addOrUpdatePaymentBtn.addEventListener('click', () => {
        const paymentData = {
            date: editPayDate.value,
            montantParis: parseFloat(editPayParis.value) || 0,
            montantAbidjan: parseFloat(editPayAbidjan.value) || 0,
            modePaiement: editPayMode.value,
            agentMobileMoney: editPayInfo.value.trim(),
            agent: editPayAgent.value,
            saisiPar: sessionStorage.getItem('userName') || 'Admin',
            // Si c'est un ajout, on peut lier à la session courante si la date correspond, 
            // mais par sécurité on laisse vide ou on met l'ID si c'est explicitement voulu.
            // Ici on ne force pas le sessionId pour les ajouts manuels sauf si on veut qu'il apparaisse dans cette session.
            // On va dire que si la date correspond à la session, on lie.
            sessionId: (editPayDate.value === currentSessionData.date.split('T')[0]) ? currentSessionId : null
        };

        if (!paymentData.date) return AppModal.error("La date est obligatoire.");

        const index = editPaymentIndex.value;
        if (index !== '') {
            const original = currentEditingTransaction.paymentHistory[index];
            // On garde le sessionId original s'il existe
            if (original.sessionId) paymentData.sessionId = original.sessionId;
            
            currentEditingTransaction.paymentHistory[index] = { ...original, ...paymentData };
        } else {
            currentEditingTransaction.paymentHistory.push(paymentData);
        }
        renderPaymentHistoryTable();
        resetPaymentForm();
    });

    // LOGIQUE ENREGISTREMENT MODAL
    saveEditBtn.onclick = async () => {
        if (!currentEditingTransaction) return;
        
        saveEditBtn.disabled = true;
        saveEditBtn.textContent = "Enregistrement...";

        try {
            const updates = {
                date: editMainDate.value,
                nom: editNom.value.trim(),
                conteneur: editConteneur.value.trim().toUpperCase(),
                prix: parseFloat(editPrixTotal.value) || 0,
                paymentHistory: currentEditingTransaction.paymentHistory
            };

            // Recalcul Totaux
            updates.montantParis = updates.paymentHistory.reduce((sum, p) => sum + (p.montantParis || 0), 0);
            updates.montantAbidjan = updates.paymentHistory.reduce((sum, p) => sum + (p.montantAbidjan || 0), 0);
            updates.reste = (updates.montantParis + updates.montantAbidjan) - updates.prix;

            // Recalcul Agents
            const uniqueAgents = new Set();
            if (updates.paymentHistory) {
                updates.paymentHistory.forEach(p => {
                    if (p.agent) {
                        p.agent.split(',').forEach(a => {
                            const trimmed = a.trim();
                            if (trimmed) uniqueAgents.add(trimmed);
                        });
                    }
                });
            }
            updates.agent = Array.from(uniqueAgents).join(', ');

            await updateDoc(doc(db, "transactions", currentEditingTransaction.id), updates);

            // --- SYNCHRONISATION AVEC LIVRAISON ---
            try {
                const livQuery = await getDocs(query(collection(db, "livraisons"), where("ref", "==", currentEditingTransaction.reference), limit(1)));
                if (!livQuery.empty) {
                    await updateDoc(livQuery.docs[0].ref, {
                        conteneur: updates.conteneur,
                        destinataire: updates.nom
                    });
                }
            } catch (e) { console.error("Erreur sync livraison:", e); }

            closeEditModalFunc();
            loadSessionDetails(currentSessionId, currentSessionData);

        } catch (error) {
            console.error(error);
            AppModal.error("Une erreur s'est produite lors de l'enregistrement.");
        } finally {
            saveEditBtn.disabled = false;
            saveEditBtn.textContent = "Enregistrer";
        }
    };

    // NOUVELLE FONCTION : Supprimer toute la session
    async function deleteEntireSession(sessionId, sessionData) {
        try {
            // 1. IDENTIFICATION DES TRANSACTIONS À NETTOYER
            let transactionIds = [];
            
            if (sessionData.transactionIds && Array.isArray(sessionData.transactionIds) && sessionData.transactionIds.length > 0) {
                // CAS 1 : Nouveau système (IDs stockés) - Plus fiable
                transactionIds = sessionData.transactionIds;
            } else {
                // CAS 2 : Ancien système (Fallback sur le DOM)
                const rows = Array.from(detailsEncaissementsBody.querySelectorAll('tr'));
                transactionIds = rows.map(r => r.dataset.id).filter(id => id);
            }

            // 2. TRAITEMENT DES TRANSACTIONS (Rétablissement des montants)
            for (const docId of transactionIds) {
                const docRef = doc(db, "transactions", docId);
                const docSnap = await getDoc(docRef);
                
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (data.paymentHistory) {
                        let newHistory;
                        
                        if (sessionData.transactionIds) {
                            // Filtrage par Session ID
                            newHistory = data.paymentHistory.filter(p => p.sessionId !== sessionId);
                        } else {
                            // Filtrage par Date/User (Legacy)
                            const sDate = sessionData.date.split('T')[0];
                            newHistory = data.paymentHistory.filter(p => !(p.date === sDate && p.saisiPar === sessionData.user));
                        }

                        // Recalcul des montants
                        let newAbj = 0, newPar = 0;
                        newHistory.forEach(p => { newAbj += (p.montantAbidjan||0); newPar += (p.montantParis||0); });
                        
                        const newReste = (data.prix||0) - (newAbj + newPar);
                        
                        await updateDoc(docRef, { paymentHistory: newHistory, montantAbidjan: newAbj, montantParis: newPar, reste: newReste });
                    }
                }
            }

            // 3. Supprimer les dépenses associées (Si IDs disponibles)
            if (sessionData.expenseIds && Array.isArray(sessionData.expenseIds)) {
                for (const expId of sessionData.expenseIds) {
                    await updateDoc(doc(db, "expenses", expId), { isDeleted: true });
                }
            }

            // 4. Supprimer le log
            await deleteDoc(doc(db, "audit_logs", sessionId));
            
            sessionDetailsEl.style.display = 'none';
            noSelectionMsg.style.display = 'block';
            AppModal.success("La session a été supprimée et les montants rétablis.");
            loadSessions(); // Rafraîchir la liste
        } catch (e) {
            console.error(e);
            AppModal.error("Erreur technique lors de la suppression de la session.");
        }
    }

    validateSessionBtn.addEventListener('click', async () => {
        if (!currentSessionId || isViewer) return;
        if (await AppModal.confirm("Confirmer la validation et la clôture de cette journée ?", "Validation Globale")) {
            
            // --- NOUVELLE LOGIQUE : Mise à jour du statut Livraison ---
            const batch = writeBatch(db);
            let deliveryUpdateCount = 0;

            // 1. On récupère les références ET les données de reste à payer
            const refsToUpdate = [];
            const refDataMap = {};

            currentSessionAllTransactions.forEach(t => {
                const ref = t.data.reference;
                if (ref) {
                    refsToUpdate.push(ref);
                    refDataMap[ref] = t.data.reste || 0;
                }
            });

            if (refsToUpdate.length > 0) {
                // 2. On cherche les livraisons correspondantes dans "EN_COURS"
                // Firestore "in" query is limited to 10 items. We chunk it to be safe.
                const chunks = [];
                for (let i = 0; i < refsToUpdate.length; i += 10) {
                    chunks.push(refsToUpdate.slice(i, i + 10));
                }

                for (const chunk of chunks) {
                    const deliveryQuery = query(collection(db, "livraisons"), where("ref", "in", chunk), where("containerStatus", "==", "EN_COURS"));
                    
                    const deliverySnapshot = await getDocs(deliveryQuery);

                    deliverySnapshot.forEach(doc => {
                        const deliveryData = doc.data();
                        const currentReste = refDataMap[deliveryData.ref];
                        const updates = {};

                        // LOGIQUE MODIFIÉE : On ne change QUE le montant (Le statut est géré par le Scan)
                        if (currentReste <= 0) {
                            // Payé en totalité -> Montant 0 (Vert dans l'UI)
                            updates.montant = '0 CFA';
                        } else {
                            // Paiement partiel -> Montant mis à jour (Orange dans l'UI)
                            updates.montant = currentReste + ' CFA';
                        }

                        // 3. On ajoute la mise à jour au batch
                        batch.update(doc.ref, updates);
                        deliveryUpdateCount++;
                    });
                }
            }

            // On met à jour le log d'audit (dans le même batch pour l'atomicité)
            const auditLogRef = doc(db, "audit_logs", currentSessionId);
            batch.update(auditLogRef, {
                status: "VALIDATED",
                validatedBy: sessionStorage.getItem('userName'),
                validatedAt: new Date().toISOString()
            });

            try {
                await batch.commit();
                let successMsg = "Journée validée avec succès !";
                if (deliveryUpdateCount > 0) successMsg += `\n\n✅ Montants mis à jour pour ${deliveryUpdateCount} colis dans l'onglet Livraison.`;
                AppModal.success(successMsg, "Succès");
                detailStatus.textContent = "Validé";
                detailStatus.style.background = "#10b981";
                detailStatus.style.color = "white";
                validateSessionBtn.style.display = 'none';
            } catch (error) {
                console.error("Erreur lors de la validation :", error);
                AppModal.error("Une erreur est survenue lors de la validation finale.");
            }
        }
    });

    if (isViewer) {
        if (validateSessionBtn) validateSessionBtn.style.display = 'none';
        if (archiveSessionBtn) archiveSessionBtn.style.display = 'none';
    }

    filterDateSession.addEventListener('change', loadSessions);
    loadSessions();
    initBackToTopButton();
});