document.addEventListener('DOMContentLoaded', () => {
    // Il n'y a PAS de lignes "import" ici.
    
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: La connexion à la base de données a échoué. Vérifiez les balises script dans votre HTML.");
        return;
    }
    
    // --- SÉLECTIONS DU DOM ---
    const transactionsCollection = db.collection("transactions");
    const summaryTableBody = document.getElementById('summaryTableBody');
    const agentSummaryTableBody = document.getElementById('agentSummaryTableBody');
    const grandTotalPrixEl = document.getElementById('grandTotalPrix');
    const grandTotalCountEl = document.getElementById('grandTotalCount');
    const grandTotalResteEl = document.getElementById('grandTotalReste');
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    const clearFilterBtn = document.getElementById('clearFilterBtn');

    let allTransactions = [];

    // --- FONCTION PRINCIPALE DE MISE À JOUR ---
    function updateDashboard() {
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;

        const filteredTransactions = allTransactions.filter(transac => {
            if (startDate && transac.date < startDate) return false;
            if (endDate && transac.date > endDate) return false;
            return true;
        });

        updateGrandTotals(filteredTransactions);
        generateDailySummary(filteredTransactions);
        generateAgentSummary(filteredTransactions);
    }

    // --- FONCTIONS DE GÉNÉRATION ---
    function updateGrandTotals(transactions) {
        const totalPrix = transactions.reduce((sum, t) => sum + t.prix, 0);
        const totalCount = transactions.length;
        const totalReste = transactions.reduce((sum, t) => sum + t.reste, 0);

        grandTotalPrixEl.textContent = formatCFA(totalPrix);
        grandTotalCountEl.textContent = totalCount;
        grandTotalResteEl.textContent = formatCFA(totalReste);
        grandTotalResteEl.className = totalReste < 0 ? 'reste-negatif' : 'reste-positif';
    }

    function generateDailySummary(transactions) {
        summaryTableBody.innerHTML = '';
        if (transactions.length === 0) {
            summaryTableBody.innerHTML = '<tr><td colspan="3">Aucune donnée pour cette période.</td></tr>';
            return;
        }
        const dailyData = {};
        transactions.forEach(t => {
            if (!dailyData[t.date]) dailyData[t.date] = { count: 0, totalPrix: 0 };
            dailyData[t.date].count++;
            dailyData[t.date].totalPrix += t.prix;
        });
        const sortedDates = Object.keys(dailyData).sort((a, b) => new Date(b) - new Date(a));
        sortedDates.forEach(date => {
            const data = dailyData[date];
            const row = `<tr><td>${date}</td><td>${data.count}</td><td>${formatCFA(data.totalPrix)}</td></tr>`;
            summaryTableBody.innerHTML += row;
        });
    }

    function generateAgentSummary(transactions) {
        agentSummaryTableBody.innerHTML = '';
        if (transactions.length === 0) {
            agentSummaryTableBody.innerHTML = '<tr><td colspan="3">Aucune donnée pour cette période.</td></tr>';
            return;
        }
        const agentData = {};
        transactions.forEach(t => {
            const agentName = t.agent || "Non spécifié";
            if (!agentData[agentName]) agentData[agentName] = { count: 0, totalPrix: 0 };
            agentData[agentName].count++;
            agentData[agentName].totalPrix += t.prix;
        });
        const sortedAgents = Object.keys(agentData).sort((a, b) => agentData[b].totalPrix - agentData[a].totalPrix);
        sortedAgents.forEach(agent => {
            const data = agentData[agent];
            const row = `<tr><td>${agent}</td><td>${data.count}</td><td>${formatCFA(data.totalPrix)}</td></tr>`;
            agentSummaryTableBody.innerHTML += row;
        });
    }

    // --- ÉCOUTEURS D'ÉVÉNEMENTS ---
    transactionsCollection.onSnapshot(snapshot => {
        allTransactions = snapshot.docs.map(doc => doc.data());
        updateDashboard();
    }, error => {
        console.error("Erreur de l'écouteur Firestore: ", error);
    });

    startDateInput.addEventListener('change', updateDashboard);
    endDateInput.addEventListener('change', updateDashboard);
    clearFilterBtn.addEventListener('click', () => {
        startDateInput.value = '';
        endDateInput.value = '';
        updateDashboard();
    });

    // --- FONCTION UTILITAIRE ---
    function formatCFA(number) {
        return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(number);
    }
});