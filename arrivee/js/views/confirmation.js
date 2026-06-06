import { db } from '../../../commun/firebase-config.js';
import { collection, doc, updateDoc, deleteDoc, getDoc, getDocs, query, where, orderBy, onSnapshot, writeBatch, arrayRemove, limit } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getCollectionName } from '../../../commun/agencies-config.js';
import { getShippingMode } from '../../../commun/shipping-mode.js';
// Helper : une session de validation appartient au mode actif si son
// champ modeExpedition correspond. Anciennes sessions sans ce champ
// = maritime (regle legacy unique).
const sessionMatchesMode = (logData) => {
    const m = (logData && logData.modeExpedition) === 'aerien' ? 'aerien' : 'maritime';
    return m === getShippingMode();
};

// Isolation par ROUTE : une session n'appartient qu'à son agence. audit_logs est
// une collection de base partagée ; sans ce filtre, la page Confirmation d'une
// route SaaS (ex. abidjan_chine) affichait par erreur les sessions d'Abidjan.
// Les sessions héritées SANS champ `agency` = historique : visibles uniquement
// sur les routes historiques (paris/abidjan), jamais sur une route SaaS.
const sessionMatchesAgency = (logData, activeAgency) => {
    const a = logData && logData.agency;
    if (a === activeAgency) return true;
    if (!a && (activeAgency === 'paris' || activeAgency === 'abidjan')) return true;
    return false;
};

import { formatMoney } from '../../../commun/services/format.js';

export const ConfirmationView = {
    render(app, container) {
        this.app = app;
        
        container.innerHTML = `
            <div class="dashboard-container">
                <div class="history-controls" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h2 style="margin: 0; color: #1e293b;">📋 Confirmation des Saisies</h2>
                    <div style="display: flex; gap: 10px;">
                        <input type="date" id="filterDateSession" class="search-filter" title="Filtrer par date de saisie">
                        <div class="search-bar-container" style="flex: 1; max-width: 300px;">
                            <input type="text" id="globalSessionSearch" placeholder="Rechercher Session (Réf Colis)..." style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #ccc;">
                        </div>
                    </div>
                </div>

                <div style="display: flex; gap: 20px; flex-wrap: wrap;">
                    <!-- COLONNE GAUCHE : LISTE DES SESSIONS -->
                    <div class="confirm-col" style="flex: 1; min-width: 300px; max-width: 350px;">
                        <div class="card" style="margin-bottom: 20px;">
                            <h3 style="color: #ef4444; border-bottom: 2px solid #fecaca; padding-bottom: 10px;">⏳ En attente de validation</h3>
                            <div id="sessionsListPending" style="max-height: 300px; overflow-y: auto;">
                                <p style="padding: 10px; color: #666;">Chargement...</p>
                            </div>
                        </div>

                        <div class="card">
                            <h3 style="color: #10b981; border-bottom: 2px solid #a7f3d0; padding-bottom: 10px;">✅ Déjà validées</h3>
                            <div id="sessionsListValidated" style="max-height: 250px; overflow-y: auto;"></div>
                        </div>
                    </div>

                    <!-- COLONNE DROITE : DÉTAILS DE LA SESSION -->
                    <div class="confirm-col" style="flex: 2; min-width: 400px;">
                        <div class="card" id="noSelectionMsg" style="text-align: center; padding: 50px; color: #94a3b8;">
                            <i class="fas fa-hand-pointer fa-3x" style="margin-bottom: 15px;"></i>
                            <h2>Sélectionnez une session</h2>
                            <p>Cliquez sur une session dans la liste de gauche pour afficher ses détails et la valider.</p>
                        </div>

                        <div id="sessionDetails" style="display: none;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; flex-wrap: wrap; gap: 10px;">
                                <div>
                                    <h2 id="detailDateUser" style="margin: 0 0 5px 0; color: #0f172a;"></h2>
                                    <span id="detailStatus" class="tag" style="font-size: 14px;"></span>
                                </div>
                                <div style="display: flex; gap: 10px;">
                                    <button id="validateSessionBtn" class="btn btn-success" style="padding: 10px 20px; font-size: 16px;">✅ Valider la Journée</button>
                                    <button id="archiveSessionBtn" class="btn btn-warning" style="padding: 10px 20px; font-size: 14px; display: none;">📦 Archiver</button>
                                </div>
                            </div>

                            <!-- GRILLES DE DÉTAILS -->
                            <div class="card" style="margin-bottom: 20px;">
                                <h3 style="color: #3b82f6;">📥 Encaissements (Total: <span id="totalEsp">0</span>)</h3>
                                <div class="hide-on-mobile" style="overflow-x: auto;">
                                    <table class="table">
                                        <thead>
                                            <tr><th>Réf</th><th>Client</th><th>Conteneur</th><th>Livreur</th><th>Obs.</th><th>Prix</th><th>A. Abidjan</th><th>A. Paris</th><th>Mode</th><th>Reste</th><th>Action</th></tr>
                                        </thead>
                                        <tbody id="detailsEncaissementsBody"></tbody>
                                    </table>
                                </div>
                                <div class="show-on-mobile" id="detailsEncaissementsCards"></div>
                                <p style="text-align: right; color: #64748b; font-size: 12px; margin-top: 5px;">Total transactions modifiées : <span id="countEncaissements">0</span></p>
                            </div>

                            <div class="card">
                                <h3 style="color: #ef4444;">📤 Dépenses Livreur (Total: <span id="totalDep">0</span>)</h3>
                                <div class="hide-on-mobile" style="overflow-x: auto;">
                                    <table class="table">
                                        <thead>
                                            <tr><th>Motif</th><th>Type</th><th>Montant</th><th>Action</th></tr>
                                        </thead>
                                        <tbody id="detailsDepensesBody"></tbody>
                                    </table>
                                </div>
                                <div class="show-on-mobile" id="detailsDepensesCards"></div>
                                <p style="text-align: right; color: #64748b; font-size: 12px; margin-top: 5px;">Total dépenses : <span id="countDepenses">0</span></p>
                            </div>
                            
                            <div style="text-align: center; margin-top: 20px; font-size: 24px;">
                                Bilan Net Espèces : <strong id="totalNet" style="color: #0f172a;">0</strong>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- SECTION ARCHIVES MENSUELLES -->
                <div class="dashboard-container" style="margin-top: 30px;">
                    <h2 style="color: #1e293b;">🗄️ Recherche dans les Archives (Mois Précédents)</h2>
                    <div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                        <div style="display: flex; gap: 15px; align-items: center; margin-bottom: 20px; flex-wrap: wrap;">
                            <label>Sélectionnez un mois :</label>
                            <input type="month" id="archiveMonth" class="search-filter" style="flex: 1 1 140px; min-width: 0; width: auto;">
                            <button id="searchArchiveBtn" class="btn primary">Rechercher</button>
                        </div>
                        <div id="sessionsListArchives" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 15px;">
                            <p style="color: #64748b; font-style: italic;">Sélectionnez un mois pour afficher les sessions archivées.</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
        setTimeout(() => this.initLogic(), 50);
    },

    initLogic() {
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
        let currentSessionData = null;
        let currentSessionAllTransactions = [];
        let confirmationSearchInput = null;
        const userRole = sessionStorage.getItem('userRole');
        const isViewer = userRole === 'spectateur';
        let allAgents = [];
    
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
        
        window.addEventListener('click', (e) => {
            if (e.target == editModal) closeEditModalFunc();
            if (e.target == editExpenseModal) closeExpenseModalFunc();
        });
    
        const encaissementsCard = document.getElementById('detailsEncaissementsBody')?.closest('.card');
        if (encaissementsCard) {
            const h3 = encaissementsCard.querySelector('h3');
            confirmationSearchInput = document.createElement('input');
            confirmationSearchInput.type = 'text';
            confirmationSearchInput.id = 'confirmationSearchInput';
            confirmationSearchInput.placeholder = 'Rechercher un colis (Réf, Nom, Conteneur)...';
            confirmationSearchInput.style.cssText = "width: 100%; padding: 8px; margin: 10px 0; border: 1px solid #ccc; border-radius: 6px; box-sizing: border-box;";
            
            if (h3) h3.parentNode.insertBefore(confirmationSearchInput, h3.nextSibling);
            confirmationSearchInput.addEventListener('input', filterAndRenderTransactions);
        }
    
        getDocs(query(collection(db, "agents"), orderBy("name"))).then(snap => {
            allAgents = snap.docs.map(doc => doc.data().name);
            if(editPayAgent) editPayAgent.innerHTML = '<option value="">- Aucun -</option>' + allAgents.map(a => `<option value="${a}">${a}</option>`).join('');
        });
    
        function formatCFA(n) { return formatMoney(n, true); }
    
        function loadSessions() {
            const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'abidjan';
            const qLogs = query(collection(db, "audit_logs"), where("action", "==", "VALIDATION_JOURNEE"), orderBy("date", "desc"));
            onSnapshot(qLogs, snapshot => {
                sessionsListPendingEl.innerHTML = '';
                sessionsListValidatedEl.innerHTML = '';

                if (snapshot.empty) sessionsListPendingEl.innerHTML = '<p style="padding:10px; color:#999;">Aucune session.</p>';

                snapshot.forEach(doc => {
                    const data = doc.data();
                    // Isolation par ROUTE : ne montrer que les sessions de l'agence active.
                    if (!sessionMatchesAgency(data, activeAgency)) return;
                    // Isolation Maritime <-> Aerien : on ignore les sessions
                    // qui ne correspondent pas au mode d'expedition actif.
                    if (!sessionMatchesMode(data)) return;

                    const div = createSessionElement(doc);

                    if (data.transactionIds && Array.isArray(data.transactionIds) && data.transactionIds.length === 0) {
                        if (!data.expenseIds || (Array.isArray(data.expenseIds) && data.expenseIds.length === 0)) return;
                    }
                    if (data.status === "ARCHIVED") return;
                    if (filterDateSession.value && data.date.split('T')[0] !== filterDateSession.value) return;

                    if (data.status === "VALIDATED") sessionsListValidatedEl.appendChild(div);
                    else sessionsListPendingEl.appendChild(div);
                });
            });
        }
    
        function createSessionElement(doc) {
            const data = doc.data();
            const dateObj = new Date(data.date);
            const dateStr = dateObj.toLocaleDateString('fr-FR');
            const timeStr = dateObj.toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'});
            
            let entryDateDisplay = dateStr;
            if (data.entryDate) {
                const parts = data.entryDate.split('-');
                const d = new Date(parts[0], parts[1] - 1, parts[2]);
                entryDateDisplay = d.toLocaleDateString('fr-FR');
            }
            
            const div = document.createElement('div');
            div.className = 'session-item';
            div.style.padding = '10px';
            div.style.borderBottom = '1px solid #eee';
            div.style.cursor = 'pointer';
            
            const isValidated = data.status === "VALIDATED";
            const statusIcon = isValidated ? "✅" : "⏳";
    
            let infoLine = `Par: ${data.user}`;
            if (data.agents) infoLine += ` <span style="color:#059669; font-weight:bold;">(${data.agents})</span>`;
    
            div.innerHTML = `<div style="font-weight:bold; color:#334155; font-size:1.05em;">${statusIcon} Saisie : ${entryDateDisplay}</div><div style="font-size:0.9em; color:#64748b; margin-top:2px;">${infoLine}</div><div style="font-size:0.8em; color:#94a3b8; margin-top:2px;">Validé le : ${dateStr} à ${timeStr}</div>`;
            
            div.addEventListener('mouseover', () => { if (!div.classList.contains('selected-session')) div.style.background = '#f1f5f9'; });
            div.addEventListener('mouseout', () => { if (!div.classList.contains('selected-session')) div.style.background = 'transparent'; });
            div.addEventListener('click', () => {
                document.querySelectorAll('.session-item').forEach(el => { el.classList.remove('selected-session'); el.style.background = 'transparent'; });
                div.classList.add('selected-session'); div.style.background = '#e0f2fe';
                loadSessionDetails(doc.id, data);
            });
            return div;
        }
    
        searchArchiveBtn.addEventListener('click', () => {
            const monthVal = archiveMonthInput.value;
            if (!monthVal) return AppModal.error("Veuillez sélectionner un mois.", "Erreur");
            sessionsListArchivesEl.innerHTML = '<p style="color:#666;">Recherche...</p>';
            const start = monthVal + "-01";
            const [year, month] = monthVal.split('-').map(Number);
            const lastDay = new Date(year, month, 0).getDate();
            const end = `${monthVal}-${lastDay}T23:59:59`;
            const qArchives = query(collection(db, "audit_logs"), where("action", "==", "VALIDATION_JOURNEE"), where("date", ">=", start), where("date", "<=", end), orderBy("date", "desc"));
            getDocs(qArchives).then(snapshot => {
                sessionsListArchivesEl.innerHTML = '';
                const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'abidjan';
                // Isolation par ROUTE + Maritime/Aerien sur les archives aussi.
                const filtered = snapshot.docs.filter(d => sessionMatchesAgency(d.data(), activeAgency) && sessionMatchesMode(d.data()));
                if (filtered.length === 0) { sessionsListArchivesEl.innerHTML = '<p>Aucune session trouvée.</p>'; return; }
                filtered.forEach(doc => sessionsListArchivesEl.appendChild(createSessionElement(doc)));
            }).catch(err => { console.error(err); sessionsListArchivesEl.innerHTML = '<p style="color:red;">Erreur chargement.</p>'; });
        });
    
        async function loadSessionDetails(logId, logData) {
            currentSessionId = logId; currentSessionData = logData;
            noSelectionMsg.style.display = 'none'; sessionDetailsEl.style.display = 'block';
    
            let deleteSessionBtn = document.getElementById('deleteSessionBtn');
            if (!deleteSessionBtn) {
                deleteSessionBtn = document.createElement('button');
                deleteSessionBtn.id = 'deleteSessionBtn';
                deleteSessionBtn.className = 'deleteBtn';
                deleteSessionBtn.style.marginTop = '10px'; deleteSessionBtn.style.float = 'right';
                deleteSessionBtn.textContent = "🗑️ Supprimer la Session";
                validateSessionBtn.parentNode.insertBefore(deleteSessionBtn, validateSessionBtn.nextSibling);
                deleteSessionBtn.addEventListener('click', async () => {
                    if(await AppModal.confirm("Voulez-vous vraiment supprimer cette session et l'historique associé ?\n\n(Les transactions seront retirées de l'historique des paiements)", "Suppression de Session", true)) await deleteEntireSession(currentSessionId, currentSessionData);
                });
            }
            
            const dateOnly = logData.date.split('T')[0];
            detailDateUser.textContent = `Saisie du ${dateOnly} par ${logData.user}`;
            
            if (logData.status === "VALIDATED") {
                detailStatus.textContent = "Validé par " + (logData.validatedBy || "Admin");
                detailStatus.style.background = "#10b981"; detailStatus.style.color = "white";
                validateSessionBtn.style.display = 'none';
                if(archiveSessionBtn) archiveSessionBtn.style.display = 'inline-block';
                if(deleteSessionBtn) deleteSessionBtn.style.display = 'none';
            } else {
                detailStatus.textContent = "En attente de revue";
                detailStatus.style.background = isViewer ? "#6c757d" : "#f59e0b";
                detailStatus.style.color = "white";
                validateSessionBtn.style.display = 'block';
                if(archiveSessionBtn) archiveSessionBtn.style.display = 'none';
                if(deleteSessionBtn) deleteSessionBtn.style.display = 'block';
            }
    
            let transactionsDocs = []; let expensesDocs = [];
            if (logData.transactionIds && Array.isArray(logData.transactionIds)) {
                const tPromises = logData.transactionIds.map(id => getDoc(doc(db, getCollectionName("transactions"), id)));
                const tSnapshots = await Promise.all(tPromises);
                transactionsDocs = tSnapshots.filter(doc => doc.exists());
            } else {
                const qTransFallback = query(collection(db, getCollectionName("transactions")), where("saisiPar", "==", logData.user), where("lastPaymentDate", "==", dateOnly));
                const transSnap = await getDocs(qTransFallback);
                transactionsDocs = transSnap.docs;
            }
    
            if (logData.expenseIds && Array.isArray(logData.expenseIds)) {
                const ePromises = logData.expenseIds.map(id => getDoc(doc(db, getCollectionName("expenses"), id)));
                const eSnapshots = await Promise.all(ePromises);
                expensesDocs = eSnapshots.filter(doc => doc.exists()).map(d => ({ id: d.id, ...d.data() }));
            } else {
                const qExpFallback = query(collection(db, getCollectionName("expenses")), where("description", ">=", ""), orderBy("description"));
                const expSnap = await getDocs(qExpFallback);
                expensesDocs = expSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => e.date === dateOnly && e.description.includes(logData.user));
            }
    
            detailsEncaissementsBody.innerHTML = '';
            currentSessionAllTransactions = [];
            let sumEsp = 0; let totalsByMode = {};
            const isNewSystemSession = !!(logData.transactionIds && Array.isArray(logData.transactionIds));
            
            transactionsDocs.forEach(doc => {
                const t = doc.data();
                let payeCeJour = 0, payeAbidjanCeJour = 0, payeParisCeJour = 0, sessionModes = [];
    
                if (t.paymentHistory) {
                    t.paymentHistory.forEach(p => {
                        let isMatch = false;
                        if (isNewSystemSession) { if (p.sessionId === logId) isMatch = true; } 
                        else { if (p.date === dateOnly && p.saisiPar === logData.user) isMatch = true; }
    
                        if (isMatch) {
                            const montantP = (p.montantAbidjan || 0) + (p.montantParis || 0);
                            payeCeJour += montantP; payeAbidjanCeJour += (p.montantAbidjan || 0); payeParisCeJour += (p.montantParis || 0);
                            if (p.modePaiement === 'Espèce') sumEsp += (p.montantAbidjan || 0);
    
                            let modeKey = p.modePaiement || 'Espèce';
                            if (p.agentMobileMoney) modeKey += ` (${p.agentMobileMoney})`;
                            if (!totalsByMode[modeKey]) totalsByMode[modeKey] = 0;
                            totalsByMode[modeKey] += (p.montantAbidjan || 0);
                            sessionModes.push({ mode: p.modePaiement || 'Espèce', info: p.agentMobileMoney || '', montant: montantP });
                        }
                    });
                } else {
                    payeCeJour = (t.montantAbidjan || 0) + (t.montantParis || 0); payeAbidjanCeJour = (t.montantAbidjan || 0); payeParisCeJour = (t.montantParis || 0);
                    if (t.modePaiement === 'Espèce') sumEsp += (t.montantAbidjan || 0);
                    if (!isNewSystemSession) {
                        payeCeJour = (t.montantAbidjan || 0) + (t.montantParis || 0);
                        if (t.modePaiement === 'Espèce') sumEsp += (t.montantAbidjan || 0);
                        let modeKey = t.modePaiement || 'Espèce';
                        if (t.agentMobileMoney) modeKey += ` (${t.agentMobileMoney})`;
                        if (!totalsByMode[modeKey]) totalsByMode[modeKey] = 0;
                        totalsByMode[modeKey] += (t.montantAbidjan || 0);
                        sessionModes.push({ mode: t.modePaiement || 'Espèce', info: t.agentMobileMoney || '', montant: payeCeJour });
                    }
                }
                if (payeCeJour > 0) currentSessionAllTransactions.push({ docId: doc.id, data: t, payeAbidjanCeJour, payeParisCeJour, sessionModes });
            });
    
            filterAndRenderTransactions();
    
            const tableContainer = detailsEncaissementsBody.closest('table');
            let breakdownDiv = document.getElementById('breakdownModesDiv');
            if (!breakdownDiv && tableContainer) {
                breakdownDiv = document.createElement('div'); breakdownDiv.id = 'breakdownModesDiv';
                breakdownDiv.style.cssText = "margin: 10px 0; padding: 10px; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 6px;";
                tableContainer.parentNode.insertBefore(breakdownDiv, tableContainer.nextSibling);
            }
            if (breakdownDiv) {
                let html = '<strong>Répartition des Encaissements :</strong><div style="display:flex; gap:15px; flex-wrap:wrap; margin-top:5px;">';
                for (const [m, amount] of Object.entries(totalsByMode)) {
                    if (amount > 0) {
                        let bg = '#fff', color = '#333', border = '#ccc'; const lowerM = m.toLowerCase();
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
    
            detailsDepensesBody.innerHTML = ''; let sumDep = 0;
            const depCards = [];
            expensesDocs.forEach((e) => {
                sumDep += (e.montant || 0);
                let actions = '';
                if (!isViewer && logData.status !== "VALIDATED") {
                    actions = `<button class="btn-edit-exp" data-id="${e.id}" style="background:#3b82f6; color:white; border:none; padding:2px 6px; border-radius:4px; cursor:pointer; margin-right:5px;">✏️</button><button class="btn-delete-exp" data-id="${e.id}" style="background:#ef4444; color:white; border:none; padding:2px 6px; border-radius:4px; cursor:pointer;">🗑️</button>`;
                }
                detailsDepensesBody.innerHTML += `<tr><td>${e.description}</td><td>${e.type}</td><td>${formatCFA(e.montant)}</td><td>${actions}</td></tr>`;
                depCards.push(`<div class="comm-mob-card">
                    <div class="comm-mob-l1"><strong>${e.description || '-'}</strong><span style="color:#ef4444; font-weight:800; white-space:nowrap;">${formatCFA(e.montant)}</span></div>
                    <div class="comm-mob-l2"><span>${e.type || '-'}</span></div>
                    ${actions ? `<div style="display:flex; justify-content:flex-end; gap:8px; border-top:1px solid #f1f5f9; padding-top:6px; margin-top:4px;">${actions}</div>` : ''}
                </div>`);
            });
            const depCardsEl = document.getElementById('detailsDepensesCards');
            if (depCardsEl) depCardsEl.innerHTML = depCards.length ? depCards.join('') : '<div style="text-align:center; padding:12px; color:#94a3b8;">Aucune dépense.</div>';
            countDepenses.textContent = expensesDocs.length;
    
            totalEspEl.textContent = formatCFA(sumEsp); totalDepEl.textContent = formatCFA(sumDep); totalNetEl.textContent = formatCFA(sumEsp - sumDep);
        }
    
        function filterAndRenderTransactions() {
            const searchTerm = confirmationSearchInput ? confirmationSearchInput.value.toLowerCase().trim() : '';
            let filteredTransactions = currentSessionAllTransactions;
            if (searchTerm) {
                filteredTransactions = currentSessionAllTransactions.filter(trans => {
                    const t = trans.data;
                    return (t.reference || '').toLowerCase().includes(searchTerm) || (t.nom || '').toLowerCase().includes(searchTerm) || (t.conteneur || '').toLowerCase().includes(searchTerm);
                });
            }
            renderTransactionsTable(filteredTransactions);
        }
    
        function renderTransactionsTable(transactionsToRender) {
            detailsEncaissementsBody.innerHTML = '';
            const encCardsEl = document.getElementById('detailsEncaissementsCards');
            if (encCardsEl) encCardsEl.innerHTML = '';
            if (transactionsToRender.length === 0) {
                detailsEncaissementsBody.innerHTML = '<tr><td colspan="11" style="text-align:center; padding:15px;">Aucun encaissement trouvé pour cette recherche.</td></tr>';
                if (encCardsEl) encCardsEl.innerHTML = '<div style="text-align:center; padding:12px; color:#94a3b8;">Aucun encaissement trouvé.</div>';
                countEncaissements.textContent = 0; return;
            }

            const encCards = [];
            transactionsToRender.forEach(trans => {
                const { docId, data: t, payeAbidjanCeJour, payeParisCeJour, sessionModes } = trans;
                let actionButtons = '';
                if (!isViewer && currentSessionData.status !== "VALIDATED") actionButtons = `<button class="btn-edit" style="background:#3b82f6; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; margin-right:5px;">✏️</button><button class="btn-delete" style="background:#ef4444; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">🗑️</button>`;
                else actionButtons = `<span style="color:#94a3b8; font-size:0.8em;">🔒 Validé</span>`;
    
                const resteClass = (t.reste || 0) < 0 ? 'reste-negatif' : 'reste-positif';
                let magasinageDisplay = '-';
                if (t.storageFeeWaived) magasinageDisplay = '<span class="tag" style="background:#10b981; color:white; font-size:0.8em;">Offert</span>';
                else if (t.adjustmentType === 'augmentation' && t.adjustmentVal > 0) magasinageDisplay = `<span style="color:#d97706; font-weight:bold;">${formatCFA(t.adjustmentVal)}</span>`;
    
                const agentsDisplay = t.agent ? `<span style="font-size:0.85em; color:#64748b;">${t.agent}</span> <span style="font-size:0.75em; color:#94a3b8;">(${t.date})</span>` : '-';
                let modeDisplay = '';
                if (sessionModes.length > 0) {
                    modeDisplay = sessionModes.map(m => `<div style="white-space:nowrap;">${m.mode}${m.info ? ` <span style="font-size:0.85em; color:#666;">(${m.info})</span>` : ''}${sessionModes.length > 1 ? ` : <b>${formatCFA(m.montant)}</b>` : ''}</div>`).join('');
                } else { modeDisplay = t.modePaiement; }
    
                const row = document.createElement('tr'); row.dataset.id = docId;
                row.innerHTML = `<td>${t.reference}</td><td>${t.nom}</td><td>${t.conteneur}</td><td>${agentsDisplay}</td><td>${magasinageDisplay}</td><td>${formatCFA(t.prix)}</td><td style="font-weight:bold; color:#d97706;">${formatCFA(payeAbidjanCeJour)}</td><td style="font-weight:bold; color:#2563eb;">${formatCFA(payeParisCeJour)}</td><td>${modeDisplay}</td><td class="${resteClass}">${formatCFA(t.reste)}</td><td>${actionButtons}</td>`;
                detailsEncaissementsBody.appendChild(row);

                encCards.push(`<div class="comm-mob-card" data-id="${docId}">
                    <div class="comm-mob-l1"><strong>${t.reference || '-'}</strong><span class="${resteClass}" style="font-weight:800; white-space:nowrap;">${formatCFA(t.reste)}</span></div>
                    <div class="comm-mob-l1"><span>${t.nom || '-'}</span>${t.conteneur ? `<span style="white-space:nowrap;">📦 ${t.conteneur}</span>` : ''}</div>
                    <div class="comm-mob-l2"><span style="color:#d97706; font-weight:700;">Abj ${formatCFA(payeAbidjanCeJour)}</span><span style="color:#2563eb; font-weight:700;">Paris ${formatCFA(payeParisCeJour)}</span></div>
                    <div style="display:flex; justify-content:flex-end; gap:8px; border-top:1px solid #f1f5f9; padding-top:6px; margin-top:4px;">${actionButtons}</div>
                </div>`);
            });
            if (encCardsEl) encCardsEl.innerHTML = encCards.join('');
            countEncaissements.textContent = transactionsToRender.length;
        }
    
        if (globalSessionSearch) {
            globalSessionSearch.addEventListener('change', async () => {
                const term = globalSessionSearch.value.trim().toUpperCase();
                if (!term) { loadSessions(); return; }
                sessionsListPendingEl.innerHTML = '<p style="padding:10px; color:#666;">Recherche de la session...</p>';
                sessionsListValidatedEl.innerHTML = '';
    
                let matchingDocs = [];
                let tSnaps = await getDocs(query(collection(db, getCollectionName("transactions")), where("reference", "==", term)));
                if (!tSnaps.empty) matchingDocs = tSnaps.docs;
                if (matchingDocs.length === 0) {
                    tSnaps = await getDocs(query(collection(db, getCollectionName("transactions")), where("nom", "==", term)));
                    if (!tSnaps.empty) matchingDocs = tSnaps.docs;
                }
                if (matchingDocs.length === 0) {
                    sessionsListPendingEl.innerHTML = '<p style="padding:10px; color:#666;">Recherche approfondie...</p>';
                    const snapshot = await getDocs(query(collection(db, getCollectionName("transactions")), orderBy("date", "desc")));
                    matchingDocs = snapshot.docs.filter(doc => {
                        const d = doc.data(); return (d.reference || '').toUpperCase().includes(term) || (d.nom || '').toUpperCase().includes(term);
                    });
                }
                if (matchingDocs.length === 0) {
                    sessionsListPendingEl.innerHTML = '<p style="padding:10px; color:#ef4444;">Aucune transaction trouvée (sur les 2000 dernières).</p>';
                    return;
                }
    
                const foundSessions = new Map();
                const transIds = matchingDocs.map(d => d.id);
                const chunks = [];
                for (let i=0; i<transIds.length; i+=10) chunks.push(transIds.slice(i, i+10));
    
                for (const chunk of chunks) {
                    const q = await getDocs(query(collection(db, "audit_logs"), where("action", "==", "VALIDATION_JOURNEE"), where("transactionIds", "array-contains-any", chunk)));
                    q.forEach(doc => foundSessions.set(doc.id, doc));
                }
                if (foundSessions.size === 0) {
                    const docsToCheck = matchingDocs.filter(d => transIds.includes(d.id));
                    for (const docT of docsToCheck) {
                        const tData = docT.data();
                        const qFallback = query(collection(db, "audit_logs"), where("action", "==", "VALIDATION_JOURNEE"), where("user", "==", tData.saisiPar), where("entryDate", "==", tData.date), limit(1));
                        const q = await getDocs(qFallback);
                        q.forEach(doc => foundSessions.set(doc.id, doc));
                    }
                }
    
                sessionsListPendingEl.innerHTML = '';
                if (foundSessions.size === 0) {
                    sessionsListPendingEl.innerHTML = '<p style="padding:10px;">Transaction trouvée, mais aucune session de validation associée.</p>';
                } else {
                    sessionsListPendingEl.innerHTML = `<div style="padding:5px 10px; background:#e0f2fe; color:#0284c7; font-size:0.9em; font-weight:bold;">Résultats pour "${term}" :</div>`;
                    const sortedSessions = Array.from(foundSessions.values()).sort((a, b) => new Date(b.data().date) - new Date(a.data().date));
                    sortedSessions.forEach(doc => sessionsListPendingEl.appendChild(createSessionElement(doc)));
                }
            });
        }
    
        if (archiveSessionBtn) {
            archiveSessionBtn.addEventListener('click', async () => { 
                if (isViewer || !currentSessionId) return;
                if (await AppModal.confirm("Voulez-vous archiver cette session ?\n\nElle disparaîtra de la liste principale mais restera accessible via la recherche d'archives par mois.", "Archivage")) {
                    try {
                        await updateDoc(doc(db, "audit_logs", currentSessionId), { status: "ARCHIVED" });
                        AppModal.success("Session archivée avec succès.");
                        sessionDetailsEl.style.display = 'none'; noSelectionMsg.style.display = 'block';
                        loadSessions();
                    } catch (error) { console.error(error); AppModal.error("Erreur lors de l'archivage."); }
                }
            });
        }
    
        // Encaissements : marche pour le tableau (tr[data-id]) ET les fiches
        // (.comm-mob-card[data-id]) -> on remonte au plus proche [data-id].
        const handleEncaisseClick = async (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            const holder = btn.closest('[data-id]');
            if (!holder) return;
            const docId = holder.dataset.id;
            if (detailStatus.textContent.includes("Validé")) { AppModal.error("Impossible de modifier une session déjà validée."); return; }
            if (btn.classList.contains('btn-delete')) await handleDelete(docId);
            else if (btn.classList.contains('btn-edit')) await handleEdit(docId);
        };
        detailsEncaissementsBody.addEventListener('click', handleEncaisseClick);
        document.getElementById('detailsEncaissementsCards')?.addEventListener('click', handleEncaisseClick);

        const handleDepenseClick = async (e) => {
            const btn = e.target.closest('button');
            if (!btn || isViewer) return;
            const docId = btn.dataset.id;
            if (btn.classList.contains('btn-delete-exp')) await handleDeleteExpense(docId);
            else if (btn.classList.contains('btn-edit-exp')) await handleEditExpense(docId);
        };
        detailsDepensesBody.addEventListener('click', handleDepenseClick);
        document.getElementById('detailsDepensesCards')?.addEventListener('click', handleDepenseClick);
    
        async function handleDelete(docId) {
            if (!await AppModal.confirm("Voulez-vous vraiment supprimer cet encaissement de la journée ?", "Suppression", true)) return;
            try {
                const docRef = doc(db, getCollectionName("transactions"), docId);
                const docSnap = await getDoc(docRef);
                if (!docSnap.exists()) return;
                const data = docSnap.data();
                const sessionDate = currentSessionData.date.split('T')[0];
                const sessionUser = currentSessionData.user;
    
                if (data.paymentHistory) {
                    let newHistory;
                    if (currentSessionData.transactionIds) newHistory = data.paymentHistory.filter(p => p.sessionId !== currentSessionId);
                    else newHistory = data.paymentHistory.filter(p => !(p.date === sessionDate && p.saisiPar === sessionUser));
                    
                    let newAbj = 0, newPar = 0;
                    newHistory.forEach(p => { newAbj += (p.montantAbidjan || 0); newPar += (p.montantParis || 0); });
                    const newReste = (data.prix || 0) - (newAbj + newPar);
                    await updateDoc(docRef, { paymentHistory: newHistory, montantAbidjan: newAbj, montantParis: newPar, reste: newReste });
                } else {
                    await updateDoc(docRef, { isDeleted: true });
                }
                
                if (currentSessionData.transactionIds) {
                    const auditRef = doc(db, "audit_logs", currentSessionId);
                    await updateDoc(auditRef, { transactionIds: arrayRemove(docId) });
                    const updatedLog = await getDoc(auditRef);
                    const d = updatedLog.data();
                    const tEmpty = !d.transactionIds || d.transactionIds.length === 0;
                    const eEmpty = !d.expenseIds || d.expenseIds.length === 0;
                    if (tEmpty && eEmpty) {
                        await deleteDoc(auditRef);
                        sessionDetailsEl.style.display = 'none'; noSelectionMsg.style.display = 'block';
                        return;
                    }
                }
                loadSessionDetails(currentSessionId, currentSessionData);
            } catch (error) { console.error(error); AppModal.error("Erreur lors de la suppression."); }
        }
    
        async function handleDeleteExpense(docId) {
            if (!await AppModal.confirm("Supprimer cette dépense ?", "Suppression", true)) return;
            try {
                await updateDoc(doc(db, getCollectionName("expenses"), docId), { isDeleted: true });
                if (currentSessionData.expenseIds) {
                    const auditRef = doc(db, "audit_logs", currentSessionId);
                    await updateDoc(auditRef, { expenseIds: arrayRemove(docId) });
                }
                loadSessionDetails(currentSessionId, currentSessionData);
            } catch (e) { console.error(e); AppModal.error("Erreur suppression dépense."); }
        }
    
        async function handleEditExpense(docId) {
            try {
                const docSnap = await getDoc(doc(db, getCollectionName("expenses"), docId));
                if (!docSnap.exists()) return;
                const data = docSnap.data();
                currentEditingExpenseId = docId;
                editExpDate.value = data.date; editExpDesc.value = data.description;
                editExpAmount.value = data.montant; editExpType.value = data.type || 'Mensuelle';
                editExpenseModal.classList.add('active');
            } catch (e) { console.error(e); }
        }
    
        saveExpenseBtn.onclick = async () => {
            if (!currentEditingExpenseId) return;
            try {
                await updateDoc(doc(db, getCollectionName("expenses"), currentEditingExpenseId), { date: editExpDate.value, description: editExpDesc.value, montant: parseFloat(editExpAmount.value) || 0, type: editExpType.value });
                closeExpenseModalFunc(); loadSessionDetails(currentSessionId, currentSessionData);
            } catch (e) { AppModal.error("Erreur lors de l'enregistrement de la dépense."); }
        };
    
        async function handleEdit(docId) {
            try {
                const docRef = doc(db, getCollectionName("transactions"), docId);
                const docSnap = await getDoc(docRef);
                if (!docSnap.exists()) return;
                const data = docSnap.data();
                currentEditingTransaction = JSON.parse(JSON.stringify({ id: doc.id, ...data }));
                document.getElementById('editModalTitle').textContent = `Modifier : ${data.reference}`;
                editMainDate.value = data.date; editRef.value = data.reference;
                editNom.value = data.nom || ''; editConteneur.value = data.conteneur || '';
                editPrixTotal.value = data.prix || 0;
                renderPaymentHistoryTable(); resetPaymentForm(); editModal.classList.add('active');
            } catch (error) { console.error(error); AppModal.error("Erreur technique lors de l'ouverture de la modification."); }
        }
    
        function renderPaymentHistoryTable() {
            editPaymentsBody.innerHTML = '';
            if (!currentEditingTransaction || !currentEditingTransaction.paymentHistory) return;
            currentEditingTransaction.paymentHistory.forEach((p, index) => {
                const tr = document.createElement('tr');
                const isCurrentSession = p.sessionId === currentSessionId;
                if (isCurrentSession) tr.style.backgroundColor = "#e0f2fe";
                tr.innerHTML = `<td>${p.date}</td><td>${formatCFA(p.montantParis)}</td><td>${formatCFA(p.montantAbidjan)}</td><td>${p.modePaiement || 'Espèce'}</td><td>${p.agent || '-'}</td><td>${p.saisiPar || '?'}</td><td><button class="btn-small" onclick="window.editConfPayment(${index})">✏️</button><button class="btn-small btn-danger" onclick="window.deleteConfPayment(${index})">🗑️</button></td>`;
                editPaymentsBody.appendChild(tr);
            });
        }
    
        function resetPaymentForm() {
            editPaymentIndex.value = ''; editPayDate.value = new Date().toISOString().split('T')[0];
            editPayParis.value = ''; editPayAbidjan.value = ''; editPayMode.value = 'Espèce';
            editPayInfo.value = ''; editPayAgent.value = ''; addOrUpdatePaymentBtn.textContent = "Ajouter ce paiement";
        }
    
        window.editConfPayment = (index) => {
            const payment = currentEditingTransaction.paymentHistory[index];
            editPaymentIndex.value = index; editPayDate.value = payment.date; editPayParis.value = payment.montantParis || 0;
            editPayAbidjan.value = payment.montantAbidjan || 0; editPayMode.value = payment.modePaiement || 'Espèce';
            editPayInfo.value = payment.agentMobileMoney || ''; editPayAgent.value = payment.agent || '';
            addOrUpdatePaymentBtn.textContent = "Mettre à jour ce paiement";
        };
    
        window.deleteConfPayment = async (index) => {
            if (await AppModal.confirm("Supprimer ce paiement de l'historique ?", "Suppression", true)) { currentEditingTransaction.paymentHistory.splice(index, 1); renderPaymentHistoryTable(); }
        };
    
        addOrUpdatePaymentBtn.addEventListener('click', () => {
            const paymentData = {
                date: editPayDate.value, montantParis: parseFloat(editPayParis.value) || 0,
                montantAbidjan: parseFloat(editPayAbidjan.value) || 0, modePaiement: editPayMode.value,
                agentMobileMoney: editPayInfo.value.trim(), agent: editPayAgent.value,
                saisiPar: sessionStorage.getItem('userName') || 'Admin',
                sessionId: (editPayDate.value === currentSessionData.date.split('T')[0]) ? currentSessionId : null
            };
            if (!paymentData.date) return AppModal.error("La date est obligatoire.");
            const index = editPaymentIndex.value;
            if (index !== '') {
                const original = currentEditingTransaction.paymentHistory[index];
                if (original.sessionId) paymentData.sessionId = original.sessionId;
                currentEditingTransaction.paymentHistory[index] = { ...original, ...paymentData };
            } else { currentEditingTransaction.paymentHistory.push(paymentData); }
            renderPaymentHistoryTable(); resetPaymentForm();
        });
    
        saveEditBtn.onclick = async () => {
            if (!currentEditingTransaction) return;
            saveEditBtn.disabled = true; saveEditBtn.textContent = "Enregistrement...";
            try {
                const updates = { date: editMainDate.value, nom: editNom.value.trim(), conteneur: editConteneur.value.trim().toUpperCase(), prix: parseFloat(editPrixTotal.value) || 0, paymentHistory: currentEditingTransaction.paymentHistory };
                updates.montantParis = updates.paymentHistory.reduce((sum, p) => sum + (p.montantParis || 0), 0);
                updates.montantAbidjan = updates.paymentHistory.reduce((sum, p) => sum + (p.montantAbidjan || 0), 0);
                updates.reste = (updates.montantParis + updates.montantAbidjan) - updates.prix;
                const uniqueAgents = new Set();
                if (updates.paymentHistory) { updates.paymentHistory.forEach(p => { if (p.agent) { p.agent.split(',').forEach(a => { const trimmed = a.trim(); if (trimmed) uniqueAgents.add(trimmed); }); } }); }
                updates.agent = Array.from(uniqueAgents).join(', ');
                await updateDoc(doc(db, getCollectionName("transactions"), currentEditingTransaction.id), updates);
                try {
                    const livQuery = await getDocs(query(collection(db, getCollectionName("livraisons")), where("ref", "==", currentEditingTransaction.reference), limit(1)));
                    if (!livQuery.empty) await updateDoc(livQuery.docs[0].ref, { conteneur: updates.conteneur, destinataire: updates.nom });
                } catch (e) { console.error("Erreur sync livraison:", e); }
                closeEditModalFunc(); loadSessionDetails(currentSessionId, currentSessionData);
            } catch (error) { console.error(error); AppModal.error("Une erreur s'est produite lors de l'enregistrement."); } finally { saveEditBtn.disabled = false; saveEditBtn.textContent = "Enregistrer"; }
        };
    
        async function deleteEntireSession(sessionId, sessionData) {
            try {
                let transactionIds = [];
                if (sessionData.transactionIds && Array.isArray(sessionData.transactionIds) && sessionData.transactionIds.length > 0) transactionIds = sessionData.transactionIds;
                else { const rows = Array.from(detailsEncaissementsBody.querySelectorAll('tr')); transactionIds = rows.map(r => r.dataset.id).filter(id => id); }
    
                for (const docId of transactionIds) {
                    const docRef = doc(db, getCollectionName("transactions"), docId);
                    const docSnap = await getDoc(docRef);
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        if (data.paymentHistory) {
                            let newHistory;
                            if (sessionData.transactionIds) newHistory = data.paymentHistory.filter(p => p.sessionId !== sessionId);
                            else { const sDate = sessionData.date.split('T')[0]; newHistory = data.paymentHistory.filter(p => !(p.date === sDate && p.saisiPar === sessionData.user)); }
                            let newAbj = 0, newPar = 0;
                            newHistory.forEach(p => { newAbj += (p.montantAbidjan||0); newPar += (p.montantParis||0); });
                            const newReste = (data.prix||0) - (newAbj + newPar);
                            await updateDoc(docRef, { paymentHistory: newHistory, montantAbidjan: newAbj, montantParis: newPar, reste: newReste });
                        }
                    }
                }
    
                if (sessionData.expenseIds && Array.isArray(sessionData.expenseIds)) {
                    for (const expId of sessionData.expenseIds) { await updateDoc(doc(db, getCollectionName("expenses"), expId), { isDeleted: true }); }
                }
                await deleteDoc(doc(db, "audit_logs", sessionId));
                sessionDetailsEl.style.display = 'none'; noSelectionMsg.style.display = 'block';
                AppModal.success("La session a été supprimée et les montants rétablis.");
                loadSessions();
            } catch (e) { console.error(e); AppModal.error("Erreur technique lors de la suppression de la session."); }
        }
    
        validateSessionBtn.addEventListener('click', async () => {
            if (!currentSessionId || isViewer) return;
            if (await AppModal.confirm("Confirmer la validation et la clôture de cette journée ?", "Validation Globale")) {
                const batch = writeBatch(db);
                const auditLogRef = doc(db, "audit_logs", currentSessionId);
                batch.update(auditLogRef, { status: "VALIDATED", validatedBy: sessionStorage.getItem('userName'), validatedAt: new Date().toISOString() });
                try {
                    await batch.commit();
                    AppModal.success("Journée validée avec succès !", "Succès");
                    detailStatus.textContent = "Validé"; detailStatus.style.background = "#10b981"; detailStatus.style.color = "white";
                    validateSessionBtn.style.display = 'none';
                } catch (error) { console.error("Erreur lors de la validation :", error); AppModal.error("Une erreur est survenue lors de la validation finale."); }
            }
        });
    
        if (isViewer) {
            if (validateSessionBtn) validateSessionBtn.style.display = 'none';
            if (archiveSessionBtn) archiveSessionBtn.style.display = 'none';
        }
    
        filterDateSession.addEventListener('change', loadSessions);
        loadSessions();
        if (typeof initBackToTopButton === 'function') initBackToTopButton();
    }
};