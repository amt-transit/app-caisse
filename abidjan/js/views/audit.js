import { db } from '../../../firebase-config.js';
import { collection, doc, updateDoc, deleteDoc, getDoc, getDocs, query, where, orderBy, onSnapshot, writeBatch, arrayRemove, limit } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getCollectionName } from '../../../agencies-config.js';

export const AuditView = {
    render(app, container) {
        this.app = app;
        
        container.innerHTML = `
            <div class="dashboard-container">
                <div class="history-controls" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 10px;">
                    <h2 style="margin: 0; color: #1e293b;">📋 Audit des Saisies & Validations</h2>
                    <div style="display: flex; gap: 10px;">
                        <input type="text" id="auditSearch" placeholder="Rechercher (Utilisateur, Montant...)" style="padding: 8px; border-radius: 6px; border: 1px solid #ccc; min-width: 250px;">
                        <button id="exportAuditBtn" class="btn btn-success" style="background: #10b981; color: white; border: none; padding: 8px 15px; border-radius: 6px; cursor: pointer;">📊 Exporter Excel</button>
                    </div>
                </div>

                <div style="overflow-x: auto; background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                    <table class="table" style="margin-bottom: 0;">
                        <thead>
                            <tr>
                                <th>Date Valid.</th>
                                <th>Date Saisie</th>
                                <th>Utilisateur</th>
                                <th>Encaissements</th>
                                <th>Dépenses</th>
                                <th>Bilan Session</th>
                                <th>Solde Cumulé</th>
                                <th>Détails</th>
                            </tr>
                        </thead>
                        <tbody id="auditTableBody">
                            <tr><td colspan="8" style="text-align:center;">Chargement de l'audit...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <div id="auditDetailsModal" class="modal">
                <div class="modal-content modal-lg" style="max-width: 900px; border-radius: 12px;">
                    <span class="close-modal" onclick="document.getElementById('auditDetailsModal').style.display='none'" style="float: right; cursor: pointer; font-size: 24px;">&times;</span>
                    <h2 id="modalAuditTitle" style="margin-top: 0; color: #1e293b;">Détails Session</h2>
                    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 15px 0;">
                    <div id="modalAuditContent"></div>
                </div>
            </div>
        `;
        
        setTimeout(() => this.initLogic(), 50);
    },

    initLogic() {
        const tableBody = document.getElementById('auditTableBody');
        const searchInput = document.getElementById('auditSearch');
        const exportBtn = document.getElementById('exportAuditBtn');
        const modal = document.getElementById('auditDetailsModal');
        const modalTitle = document.getElementById('modalAuditTitle');
        const modalContent = document.getElementById('modalAuditContent');
    
        let allSessions = [];
    
        async function loadAuditData() {
            try {
                const logsQuery = query(collection(db, "audit_logs"), where("action", "==", "VALIDATION_JOURNEE"), where("status", "==", "VALIDATED"), orderBy("date", "asc"));
                const logsSnap = await getDocs(logsQuery);
    
                const [transSnap, expSnap] = await Promise.all([
                    getDocs(query(collection(db, getCollectionName("transactions")), where("isDeleted", "!=", true))),
                    getDocs(query(collection(db, getCollectionName("expenses")), where("isDeleted", "!=", true)))
                ]);
    
                const transactionsBySession = {};
                transSnap.forEach(doc => {
                    const t = doc.data();
                    if (t.paymentHistory) {
                        t.paymentHistory.forEach(p => {
                            if (p.sessionId) {
                                if (!transactionsBySession[p.sessionId]) transactionsBySession[p.sessionId] = [];
                                transactionsBySession[p.sessionId].push({
                                    ...t,
                                    montantSpecifique: (p.montantAbidjan || 0),
                                    modeSpecifique: p.modePaiement
                                });
                            }
                        });
                    }
                });
    
                const expensesBySession = {};
                expSnap.forEach(doc => {
                    const e = doc.data();
                    if (e.sessionId) {
                        if (!expensesBySession[e.sessionId]) expensesBySession[e.sessionId] = [];
                        expensesBySession[e.sessionId].push(e);
                    }
                });
    
                let runningBalance = 0;
                allSessions = logsSnap.docs.map(doc => {
                    const log = doc.data();
                    const sessionId = doc.id;
                    
                    const sessionTrans = transactionsBySession[sessionId] || [];
                    const sessionExps = expensesBySession[sessionId] || [];
    
                    const totalIn = sessionTrans.reduce((sum, t) => {
                        const m = t.modeSpecifique;
                        return (m === 'Espèce' || m === 'Wave' || m === 'OM' || m === 'Mobile Money') ? sum + t.montantSpecifique : sum;
                    }, 0);
    
                    const totalOut = sessionExps.reduce((sum, e) => sum + (e.montant || 0), 0);
                    
                    const result = totalIn - totalOut;
                    runningBalance += result;
    
                    return {
                        id: sessionId,
                        dateValidation: log.date,
                        dateSaisie: log.entryDate || log.date,
                        user: log.user,
                        totalIn: totalIn,
                        totalOut: totalOut,
                        result: result,
                        balance: runningBalance,
                        detailsTrans: sessionTrans,
                        detailsExps: sessionExps
                    };
                });
    
                renderTable(allSessions.slice().reverse());
    
            } catch (error) {
                console.error("Erreur chargement audit:", error);
                tableBody.innerHTML = `<tr><td colspan="8" style="color:red;">Erreur: ${error.message}</td></tr>`;
            }
        }
    
        function getWeekNumber(d) {
            d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
            d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
            var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
            return Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);
        }
    
        function formatCFA(n) { return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(n || 0).replace(/[\u202F\u00A0]/g, ' ').replace(/\s*\/\s*/g, ' '); }
    
        function renderTable(data) {
            tableBody.innerHTML = '';
            const term = searchInput.value.toLowerCase();
    
            const filtered = data.filter(s => 
                s.user.toLowerCase().includes(term) || 
                s.dateSaisie.includes(term) ||
                new Date(s.dateValidation).toLocaleDateString('fr-FR').includes(term) ||
                s.detailsTrans.some(t => (t.reference || '').toLowerCase().includes(term)) ||
                s.totalIn.toString().includes(term) ||
                s.detailsTrans.some(t => (t.montantSpecifique || 0).toString().includes(term))
            );
    
            if (filtered.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Aucune donnée trouvée.</td></tr>';
                return;
            }
    
            const now = new Date();
            const currentWeekStart = new Date(now);
            const day = currentWeekStart.getDay() || 7; 
            if (day !== 1) currentWeekStart.setHours(-24 * (day - 1));
            currentWeekStart.setHours(0,0,0,0);
    
            const currentWeekItems = [];
            const olderItems = [];
    
            filtered.forEach(s => {
                const d = new Date(s.dateValidation);
                if (d >= currentWeekStart) currentWeekItems.push(s);
                else olderItems.push(s);
            });
    
            currentWeekItems.forEach(s => renderSessionRow(s));
    
            if (olderItems.length > 0) {
                const groups = {};
                
                olderItems.forEach(s => {
                    const d = new Date(s.dateValidation);
                    const diffTime = now - d;
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    
                    let key, label;
                    
                    if (diffDays <= 60) {
                        const year = d.getFullYear();
                        const week = getWeekNumber(d);
                        key = `W-${year}-${week}`;
                        label = `Semaine ${week} - ${year}`;
                    } else {
                        const year = d.getFullYear();
                        const month = d.getMonth();
                        key = `M-${year}-${month}`;
                        label = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
                        label = label.charAt(0).toUpperCase() + label.slice(1);
                    }
    
                    if (!groups[key]) groups[key] = { label: label, items: [], totalIn: 0, totalOut: 0, result: 0 };
                    groups[key].items.push(s);
                    groups[key].totalIn += s.totalIn;
                    groups[key].totalOut += s.totalOut;
                    groups[key].result += s.result;
                });
    
                const sortedGroups = Object.values(groups).sort((a, b) => new Date(b.items[0].dateValidation) - new Date(a.items[0].dateValidation));
    
                sortedGroups.forEach(g => {
                    const groupId = 'group-' + Math.random().toString(36).substr(2, 9);
                    
                    const tr = document.createElement('tr');
                    tr.style.cssText = "background-color: #f1f5f9; cursor: pointer; font-weight: bold; border-top: 2px solid #e2e8f0;";
                    tr.onclick = () => {
                        document.querySelectorAll('.' + groupId).forEach(el => el.style.display = el.style.display === 'none' ? 'table-row' : 'none');
                    };
                    
                    tr.innerHTML = `
                        <td colspan="3">📂 ${g.label} <span style="font-weight:normal; font-size:0.9em; color:#666;">(${g.items.length} sessions)</span></td>
                        <td style="color:#10b981;">${formatCFA(g.totalIn)}</td>
                        <td style="color:#ef4444;">${formatCFA(g.totalOut)}</td>
                        <td>${formatCFA(g.result)}</td>
                        <td colspan="2" style="text-align:center; font-size:0.8em; color:#64748b;">▼ Détails</td>
                    `;
                    tableBody.appendChild(tr);
    
                    g.items.forEach(s => renderSessionRow(s, groupId, true));
                });
            }
        }
    
        function renderSessionRow(s, groupId = null, hidden = false) {
                const tr = document.createElement('tr');
                if (groupId) {
                    tr.classList.add(groupId);
                    if (hidden) tr.style.display = 'none';
                    tr.style.backgroundColor = '#fff'; 
                }
    
                const dateVal = new Date(s.dateValidation).toLocaleString('fr-FR');
                const dateSaisie = new Date(s.dateSaisie).toLocaleDateString('fr-FR');
    
                tr.style.cursor = 'pointer';
                tr.title = "Cliquez pour voir les détails";
                tr.onclick = () => window.openAuditDetails(s.id);
    
                tr.innerHTML = `
                    <td>${dateVal}</td>
                    <td>${dateSaisie}</td>
                    <td><b>${s.user}</b></td>
                    <td style="color:#10b981;">${formatCFA(s.totalIn)}</td>
                    <td style="color:#ef4444;">${formatCFA(s.totalOut)}</td>
                    <td style="font-weight:bold;">${formatCFA(s.result)}</td>
                    <td style="font-weight:bold; color:#2563eb; background-color:#eff6ff;">${formatCFA(s.balance)}</td>
                    <td><button class="btn btn-small">👁️ Voir</button></td>
                `;
                tableBody.appendChild(tr);
        }
    
        window.openAuditDetails = (sessionId) => {
            const session = allSessions.find(s => s.id === sessionId);
            if (!session) return;
    
            modalTitle.textContent = `Détails Session : ${session.user} (${new Date(session.dateSaisie).toLocaleDateString('fr-FR')})`;
            
            let html = `<div style="display:flex; gap:20px;">`;
            
            html += `<div style="flex:1;">
                <h3 style="color:#10b981; border-bottom:2px solid #10b981; padding-bottom:5px;">Encaissements (Espèces/Wave/OM) (${formatCFA(session.totalIn)})</h3>
                <table class="table" style="font-size:0.9em;">
                    <thead><tr><th>Ref</th><th>Client</th><th>Mode</th><th>Montant</th></tr></thead>
                    <tbody>`;
            
            const espTrans = session.detailsTrans.filter(t => ['Espèce', 'Wave', 'OM', 'Mobile Money'].includes(t.modeSpecifique));
            if (espTrans.length === 0) html += `<tr><td colspan="4">Aucun encaissement.</td></tr>`;
            else {
                espTrans.forEach(t => {
                    html += `<tr><td>${t.reference}</td><td>${t.nom}</td><td>${t.modeSpecifique}</td><td>${formatCFA(t.montantSpecifique)}</td></tr>`;
                });
            }
            html += `</tbody></table></div>`;
    
            html += `<div style="flex:1;">
                <h3 style="color:#ef4444; border-bottom:2px solid #ef4444; padding-bottom:5px;">Dépenses (${formatCFA(session.totalOut)})</h3>
                <table class="table" style="font-size:0.9em;">
                    <thead><tr><th>Description</th><th>Montant</th></tr></thead>
                    <tbody>`;
            
            if (session.detailsExps.length === 0) html += `<tr><td colspan="2">Aucune dépense.</td></tr>`;
            else {
                session.detailsExps.forEach(e => {
                    html += `<tr><td>${e.description}</td><td>${formatCFA(e.montant)}</td></tr>`;
                });
            }
            html += `</tbody></table></div></div>`;
            
            modalContent.innerHTML = html;
            modal.style.display = 'block';
        };
    
        exportBtn.addEventListener('click', () => {
            let exportData = [];
    
            allSessions.forEach(s => {
                const dateVal = new Date(s.dateValidation).toLocaleString('fr-FR');
                const dateSaisie = new Date(s.dateSaisie).toLocaleDateString('fr-FR');
                const user = s.user;
    
                const validTrans = s.detailsTrans.filter(t => ['Espèce', 'Wave', 'OM', 'Mobile Money'].includes(t.modeSpecifique));
                
                validTrans.forEach(t => {
                    exportData.push({
                        'Date Validation': dateVal,
                        'Date Saisie': dateSaisie,
                        'Utilisateur': user,
                        'Type': 'Encaissement',
                        'Référence': t.reference,
                        'Client / Description': t.nom,
                        'Mode': t.modeSpecifique,
                        'Entrée': t.montantSpecifique,
                        'Sortie': 0
                    });
                });
    
                s.detailsExps.forEach(e => {
                    exportData.push({
                        'Date Validation': dateVal,
                        'Date Saisie': dateSaisie,
                        'Utilisateur': user,
                        'Type': 'Dépense',
                        'Référence': '-',
                        'Client / Description': e.description,
                        'Mode': 'Espèce',
                        'Entrée': 0,
                        'Sortie': e.montant
                    });
                });
            });
    
            if (exportData.length === 0) {
                AppModal.alert("Aucune donnée à exporter.", "Export Excel");
                return;
            }
    
            const ws = XLSX.utils.json_to_sheet(exportData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Détail Audit");
            XLSX.writeFile(wb, "Audit_Detaille.xlsx");
        });
    
        searchInput.addEventListener('input', () => renderTable(allSessions.slice().reverse())); 
    
        window.onclick = (e) => { if (e.target == modal) modal.style.display = "none"; };
    
        loadAuditData();
    }
};