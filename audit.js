// c:\Users\JEANAFFA\Desktop\MonAppli Gemini\audit.js
document.addEventListener('DOMContentLoaded', async () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: Connexion BDD échouée."); return;
    }

    const tableBody = document.getElementById('auditTableBody');
    const searchInput = document.getElementById('auditSearch');
    const exportBtn = document.getElementById('exportAuditBtn');
    const modal = document.getElementById('auditDetailsModal');
    const modalTitle = document.getElementById('modalAuditTitle');
    const modalContent = document.getElementById('modalAuditContent');

    let allSessions = [];

    // Chargement des données
    async function loadAuditData() {
        try {
            // 1. Récupérer toutes les sessions VALIDÉES
            const logsSnap = await db.collection("audit_logs")
                .where("action", "==", "VALIDATION_JOURNEE")
                .where("status", "==", "VALIDATED")
                .orderBy("date", "asc") // Tri chronologique pour le cumul
                .get();

            // 2. Récupérer TOUTES les transactions et dépenses (pour calculer les montants réels)
            // C'est lourd mais nécessaire pour un audit précis si les montants ne sont pas stockés dans le log
            const [transSnap, expSnap] = await Promise.all([
                db.collection("transactions").where("isDeleted", "!=", true).get(),
                db.collection("expenses").where("isDeleted", "!=", true).get()
            ]);

            // Indexation par SessionID pour rapidité
            const transactionsBySession = {};
            transSnap.forEach(doc => {
                const t = doc.data();
                if (t.paymentHistory) {
                    t.paymentHistory.forEach(p => {
                        if (p.sessionId) {
                            if (!transactionsBySession[p.sessionId]) transactionsBySession[p.sessionId] = [];
                            // On ajoute une copie de la transaction avec le montant spécifique de ce paiement
                            transactionsBySession[p.sessionId].push({
                                ...t,
                                montantSpecifique: (p.montantAbidjan || 0), // On ne compte que l'espèce Abidjan pour le solde caisse
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

            // 3. Construction des données consolidées
            let runningBalance = 0;
            allSessions = logsSnap.docs.map(doc => {
                const log = doc.data();
                const sessionId = doc.id;
                
                // Calcul des totaux pour cette session
                const sessionTrans = transactionsBySession[sessionId] || [];
                const sessionExps = expensesBySession[sessionId] || [];

                // Total Espèces (Uniquement Espèce Abidjan)
                const totalIn = sessionTrans.reduce((sum, t) => {
                    return t.modeSpecifique === 'Espèce' ? sum + t.montantSpecifique : sum;
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

            // On inverse l'ordre pour l'affichage (Le plus récent en haut), mais le solde a été calculé chronologiquement
            renderTable(allSessions.slice().reverse());

        } catch (error) {
            console.error("Erreur chargement audit:", error);
            tableBody.innerHTML = `<tr><td colspan="8" style="color:red;">Erreur: ${error.message}</td></tr>`;
        }
    }

    function renderTable(data) {
        tableBody.innerHTML = '';
        const term = searchInput.value.toLowerCase();

        const filtered = data.filter(s => 
            s.user.toLowerCase().includes(term) || 
            s.dateSaisie.includes(term) ||
            new Date(s.dateValidation).toLocaleDateString('fr-FR').includes(term)
        );

        if (filtered.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Aucune donnée trouvée.</td></tr>';
            return;
        }

        filtered.forEach(s => {
            const tr = document.createElement('tr');
            const dateVal = new Date(s.dateValidation).toLocaleString('fr-FR');
            const dateSaisie = new Date(s.dateSaisie).toLocaleDateString('fr-FR');

            tr.innerHTML = `
                <td>${dateVal}</td>
                <td>${dateSaisie}</td>
                <td><b>${s.user}</b></td>
                <td style="color:#10b981;">${formatCFA(s.totalIn)}</td>
                <td style="color:#ef4444;">${formatCFA(s.totalOut)}</td>
                <td style="font-weight:bold;">${formatCFA(s.result)}</td>
                <td style="font-weight:bold; color:#2563eb; background-color:#eff6ff;">${formatCFA(s.balance)}</td>
                <td><button class="btn btn-small" onclick="openAuditDetails('${s.id}')">👁️ Voir</button></td>
            `;
            tableBody.appendChild(tr);
        });
    }

    // Fonction globale pour le onclick
    window.openAuditDetails = (sessionId) => {
        const session = allSessions.find(s => s.id === sessionId);
        if (!session) return;

        modalTitle.textContent = `Détails Session : ${session.user} (${new Date(session.dateSaisie).toLocaleDateString('fr-FR')})`;
        
        let html = `<div style="display:flex; gap:20px;">`;
        
        // Colonne Encaissements
        html += `<div style="flex:1;">
            <h3 style="color:#10b981; border-bottom:2px solid #10b981; padding-bottom:5px;">Encaissements Espèces (${formatCFA(session.totalIn)})</h3>
            <table class="table" style="font-size:0.9em;">
                <thead><tr><th>Ref</th><th>Client</th><th>Montant</th></tr></thead>
                <tbody>`;
        
        const espTrans = session.detailsTrans.filter(t => t.modeSpecifique === 'Espèce');
        if (espTrans.length === 0) html += `<tr><td colspan="3">Aucun encaissement espèce.</td></tr>`;
        else {
            espTrans.forEach(t => {
                html += `<tr><td>${t.reference}</td><td>${t.nom}</td><td>${formatCFA(t.montantSpecifique)}</td></tr>`;
            });
        }
        html += `</tbody></table></div>`;

        // Colonne Dépenses
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
        html += `</tbody></table></div>`;
        
        html += `</div>`;
        modalContent.innerHTML = html;
        modal.style.display = 'block';
    };

    // Export Excel
    exportBtn.addEventListener('click', () => {
        const data = allSessions.map(s => ({
            'Date Validation': new Date(s.dateValidation).toLocaleString('fr-FR'),
            'Date Saisie': new Date(s.dateSaisie).toLocaleDateString('fr-FR'),
            'Utilisateur': s.user,
            'Encaissements (Esp)': s.totalIn,
            'Dépenses': s.totalOut,
            'Résultat Session': s.result,
            'Solde Cumulé': s.balance
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Audit");
        XLSX.writeFile(wb, "Audit_Saisies.xlsx");
    });

    searchInput.addEventListener('input', () => renderTable(allSessions.slice().reverse())); // On re-filtre sur la liste inversée

    // Fermeture modal au clic dehors
    window.onclick = (e) => { if (e.target == modal) modal.style.display = "none"; };

    function formatCFA(n) { return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(n || 0); }

    loadAuditData();
});
