document.addEventListener('DOMContentLoaded', async () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: Connexion BDD échouée."); return;
    }

    // --- SÉCURITÉ : VÉRIFICATION RÔLE (Admin OU Super Admin) ---
    const userRole = sessionStorage.getItem('userRole');
    if (userRole !== 'admin' && userRole !== 'super_admin') {
        document.body.innerHTML = '<h2 style="text-align:center; margin-top:50px; color:red;">⛔ Accès Refusé<br><small>Réservé aux Administrateurs</small></h2>';
        setTimeout(() => window.location.href = 'index.html', 2000);
        return;
    }

    // Force l'affichage de l'onglet si jamais auth-guard l'a masqué par erreur
    const navPoint = document.getElementById('nav-points');
    if(navPoint) navPoint.style.display = 'block';

    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    const tableBody = document.getElementById('pointsTableBody');
    const agentSearchInput = document.getElementById('agentSearch');
    const sortByAgentCheckbox = document.getElementById('sortByAgent');

    let currentStats = {}; // Stockage local pour filtrage/tri sans rechargement

    // Initialisation Dates (Mois en cours)
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    startDateInput.value = firstDay.toISOString().split('T')[0];
    endDateInput.value = today.toISOString().split('T')[0];

    // Écouteurs
    startDateInput.addEventListener('change', loadPointsData);
    endDateInput.addEventListener('change', loadPointsData);
    if(agentSearchInput) agentSearchInput.addEventListener('input', renderPointsTable);
    if(sortByAgentCheckbox) sortByAgentCheckbox.addEventListener('change', renderPointsTable);

    // Chargement initial
    loadPointsData();

    async function loadPointsData() {
        tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Chargement des données...</td></tr>';

        const start = startDateInput.value;
        const end = endDateInput.value;

        if (!start || !end) return;

        try {
            // 1. Récupérer les Sessions (Audit Logs) pour mapper SessionID -> Utilisateur
            // C'est crucial pour attribuer les dépenses au bon utilisateur
            const sessionsSnap = await db.collection("audit_logs")
                .where("action", "==", "VALIDATION_JOURNEE")
                .where("date", ">=", start)
                .where("date", "<=", end + "T23:59:59")
                .limit(1000)
                .get();

            // 1b. Identifier les sessions NON VALIDÉES (En attente)
            const pendingSessions = new Set();
            sessionsSnap.docs.forEach(doc => {
                if (doc.data().status !== "VALIDATED") pendingSessions.add(doc.id);
            });

            const sessionUserMap = {};
            sessionsSnap.forEach(doc => {
                const data = doc.data();
                sessionUserMap[doc.id] = data.user;
            });

            // 2. Récupérer les Transactions (Encaissements)
            const transSnap = await db.collection("transactions")
                .where("date", ">=", start)
                .where("date", "<=", end)
                .limit(2000)
                .get();

            // 3. Récupérer les Dépenses
            const expSnap = await db.collection("expenses")
                .where("date", ">=", start)
                .where("date", "<=", end)
                .limit(2000)
                .get();

            // --- TRAITEMENT DES DONNÉES ---
            currentStats = {};

            // A. Traitement des Encaissements (Espèces uniquement pour le "Point")
            transSnap.forEach(doc => {
                const t = doc.data();
                if (t.isDeleted === true) return;

                // SÉCURITÉ : Si le paiement est lié à une session non validée, on l'ignore
                if (t.paymentHistory) {
                    // On ne garde que les paiements validés ou hors session (legacy)
                    const validPayments = t.paymentHistory.filter(p => !p.sessionId || !pendingSessions.has(p.sessionId));
                    
                    // Si aucun paiement valide, on ignore la transaction
                    if (validPayments.length === 0) return;

                    // On recalcule le montant Abidjan basé uniquement sur les paiements validés
                    const validAmount = validPayments.reduce((sum, p) => sum + (p.montantAbidjan || 0), 0);
                    
                    // Si le montant validé est 0, on passe
                    if (validAmount === 0) return;

                    // On utilise le montant recalculé
                    t.montantAbidjan = validAmount;
                } else {
                    // Fallback pour anciennes données sans historique : on affiche
                }
                
                // On ne compte que les espèces pour la caisse physique
                if (t.modePaiement !== 'Espèce') return;

                const user = t.saisiPar || "Inconnu";
                let agent = t.agent || "Aucun";
                if (agent.trim() === "") agent = "Aucun";
                
                // Clé unique : User + Agent
                const key = `${user}_${agent}`;
                
                if (!currentStats[key]) currentStats[key] = { user: user, agent: agent, in: 0, out: 0, details: [] };
                
                currentStats[key].in += (t.montantAbidjan || 0);
                // Ajout du détail
                currentStats[key].details.push({
                    date: t.date,
                    type: 'Encaissement',
                    desc: `${t.reference} - ${t.nom}`,
                    amount: (t.montantAbidjan || 0),
                    isExpense: false
                });
            });

            // B. Traitement des Dépenses
            expSnap.forEach(doc => {
                const e = doc.data();
                if (e.isDeleted === true) return;

                // SÉCURITÉ : Si la dépense est liée à une session non validée, on l'ignore
                if (e.sessionId && pendingSessions.has(e.sessionId)) return;

                let user = "Inconnu";

                // Priorité 1 : Via l'ID de session (Lien fort)
                if (e.sessionId && sessionUserMap[e.sessionId]) {
                    user = sessionUserMap[e.sessionId];
                } 
                // Priorité 2 : Via la description (ex: "Carburant (Jean)")
                else if (e.description && e.description.includes('(')) {
                    const match = e.description.match(/\((.*?)\)/);
                    if (match && match[1]) user = match[1];
                }

                // Les dépenses ne sont pas liées à un agent spécifique -> "Aucun"
                const agent = "Aucun";
                const key = `${user}_${agent}`;

                if (!currentStats[key]) currentStats[key] = { user: user, agent: agent, in: 0, out: 0, details: [] };

                currentStats[key].out += (e.montant || 0);
                // Ajout du détail
                currentStats[key].details.push({
                    date: e.date,
                    type: 'Dépense',
                    desc: e.description,
                    amount: (e.montant || 0),
                    isExpense: true
                });
            });

            renderPointsTable();

        } catch (e) { console.error(e); alert("Erreur chargement points."); }
    }

    function renderPointsTable() {
            tableBody.innerHTML = '';
            
            let rows = Object.values(currentStats);

            // 1. Filtrage
            const term = agentSearchInput ? agentSearchInput.value.toLowerCase().trim() : "";
            if (term) {
                rows = rows.filter(r => r.agent.toLowerCase().includes(term));
            }

            // 2. Tri
            rows.sort((a, b) => {
                if (sortByAgentCheckbox && sortByAgentCheckbox.checked) return a.agent.localeCompare(b.agent) || a.user.localeCompare(b.user);
                return a.user.localeCompare(b.user) || a.agent.localeCompare(b.agent);
            });

            if (rows.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Aucune activité sur cette période.</td></tr>';
                return;
            }

            let totalIn = 0;
            let totalOut = 0;

            rows.forEach(row => {
                // On n'affiche pas les lignes vides (0 in, 0 out)
                if (row.in === 0 && row.out === 0) return;

                const solde = row.in - row.out;
                totalIn += row.in;
                totalOut += row.out;
                
                const tr = document.createElement('tr');
                
                // Style pour mettre en valeur l'agent
                const agentStyle = row.agent !== "Aucun" ? "font-weight:bold; color:#4f46e5;" : "color:#9ca3af; font-style:italic;";

                // Rendre la ligne cliquable
                tr.style.cursor = 'pointer';
                tr.title = "Cliquez pour voir le détail des opérations";
                tr.onclick = () => openPointDetailsModal(row);

                tr.innerHTML = `
                    <td style="${agentStyle}">${row.agent}</td>
                    <td>${row.user}</td>
                    <td style="color:#10b981;">${formatCFA(row.in)}</td>
                    <td style="color:#ef4444;">${formatCFA(row.out)}</td>
                    <td style="font-weight:bold; font-size:1.1em; color:${solde >= 0 ? '#000' : '#d32f2f'}">${formatCFA(solde)}</td>
                `;
                tableBody.appendChild(tr);
            });

            // Ligne des Totaux Généraux
            const totalRow = document.createElement('tr');
            totalRow.style.backgroundColor = '#f3f4f6';
            totalRow.style.fontWeight = 'bold';
            totalRow.style.borderTop = '2px solid #e5e7eb';
            totalRow.innerHTML = `
                <td colspan="2" style="text-align:right; padding-right:15px;">TOTAUX GÉNÉRAUX :</td>
                <td style="color:#10b981;">${formatCFA(totalIn)}</td>
                <td style="color:#ef4444;">${formatCFA(totalOut)}</td>
                <td style="color:#000;">${formatCFA(totalIn - totalOut)}</td>
            `;
            tableBody.appendChild(totalRow);
    }

    // --- GESTION DU MODAL DE DÉTAILS ---
    window.openPointDetailsModal = function(data) {
        const modal = document.getElementById('pointDetailsModal');
        const title = document.getElementById('modalTitle');
        const tbody = document.getElementById('modalDetailsBody');
        const totalDiv = document.getElementById('modalTotal');

        title.textContent = `Détails : ${data.user} (Agent: ${data.agent})`;
        tbody.innerHTML = '';

        // Tri des détails par date (du plus récent au plus ancien)
        const sortedDetails = data.details.sort((a, b) => new Date(b.date) - new Date(a.date));

        sortedDetails.forEach(item => {
            const tr = document.createElement('tr');
            const color = item.isExpense ? '#ef4444' : '#10b981';
            const sign = item.isExpense ? '-' : '+';
            
            tr.innerHTML = `
                <td>${item.date}</td>
                <td><span class="tag" style="background-color:${item.isExpense ? '#fee2e2' : '#d1fae5'}; color:${color}">${item.type}</span></td>
                <td>${item.desc}</td>
                <td style="text-align:right; font-weight:bold; color:${color}">${sign} ${formatCFA(item.amount)}</td>
            `;
            tbody.appendChild(tr);
        });

        const solde = data.in - data.out;
        totalDiv.innerHTML = `Solde Théorique : <span style="color:${solde >= 0 ? '#000' : '#d32f2f'}">${formatCFA(solde)}</span>`;

        modal.style.display = 'block';
    };

    window.closePointDetailsModal = function() {
        document.getElementById('pointDetailsModal').style.display = 'none';
    };

    // Fermeture du modal si on clique en dehors
    window.onclick = function(event) {
        const modal = document.getElementById('pointDetailsModal');
        if (event.target == modal) {
            modal.style.display = "none";
        }
    };

    initBackToTopButton();
});