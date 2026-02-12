document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: Connexion BDD échouée."); return;
    }

    const tableBody = document.getElementById('pointsTableBody');
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');

    let allTransactions = [];
    let allExpenses = [];

    // Chargement des données
    const transactionsRef = db.collection("transactions").where("isDeleted", "!=", true);
    const expensesRef = db.collection("expenses").where("isDeleted", "!=", true);

    Promise.all([transactionsRef.get(), expensesRef.get()]).then(([transSnap, expSnap]) => {
        allTransactions = transSnap.docs.map(doc => doc.data());
        allExpenses = expSnap.docs.map(doc => doc.data());
        calculateAndRender();
    });

    function calculateAndRender() {
        const start = startDateInput.value;
        const end = endDateInput.value;
        const stats = {};

        // 1. Calcul des ENTRÉES (Basé sur paymentHistory pour la précision de l'auteur)
        allTransactions.forEach(t => {
            if (t.paymentHistory && Array.isArray(t.paymentHistory)) {
                t.paymentHistory.forEach(p => {
                    if (start && p.date < start) return;
                    if (end && p.date > end) return;

                    const user = p.saisiPar || 'Inconnu';
                    if (!stats[user]) stats[user] = { in: 0, out: 0 };
                    
                    // On compte ce qui est encaissé à Abidjan (Espèces/MM)
                    stats[user].in += (p.montantAbidjan || 0);
                });
            } else {
                // Fallback pour vieilles données sans historique
                if (start && t.date < start) return;
                if (end && t.date > end) return;
                
                const user = t.saisiPar || 'Inconnu';
                if (!stats[user]) stats[user] = { in: 0, out: 0 };
                stats[user].in += (t.montantAbidjan || 0);
            }
        });

        // 2. Calcul des SORTIES (Dépenses)
        // On cherche le nom de l'utilisateur dans la description : "Motif (NomUser)"
        allExpenses.forEach(e => {
            if (start && e.date < start) return;
            if (end && e.date > end) return;

            // Extraction du nom entre parenthèses à la fin
            const match = e.description.match(/\(([^)]+)\)$/);
            let user = 'Inconnu';
            
            if (match) {
                user = match[1];
            } else if (e.sessionId) {
                // Si pas de nom dans la description mais lié à une session, on pourrait chercher l'auteur de la session
                // (Complexe ici sans charger les logs, on reste sur le parsing description pour l'instant)
            }

            if (!stats[user]) stats[user] = { in: 0, out: 0 };
            stats[user].out += (e.montant || 0);
        });

        // 3. Affichage
        tableBody.innerHTML = '';
        const sortedUsers = Object.keys(stats).sort();

        if (sortedUsers.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4">Aucune donnée trouvée.</td></tr>';
            return;
        }

        sortedUsers.forEach(user => {
            const data = stats[user];
            const solde = data.in - data.out;
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><b>${user}</b></td>
                <td style="color:#10b981;">+ ${formatCFA(data.in)}</td>
                <td style="color:#ef4444;">- ${formatCFA(data.out)}</td>
                <td style="font-weight:bold; font-size:1.1em;">${formatCFA(solde)}</td>
            `;
            tableBody.appendChild(row);
        });
    }

    startDateInput.addEventListener('change', calculateAndRender);
    endDateInput.addEventListener('change', calculateAndRender);

    function formatCFA(n) { return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(n || 0); }
});