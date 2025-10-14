document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: La connexion à la base de données a échoué.");
        return;
    }
    
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
        summaryTableBody.innerHTML = '<tr><td colspan="3">Aucune donnée pour cette période.</td></tr>';
        if (transactions.length === 0) return;
        const dailyData = {};
        transactions.forEach(t => {
            if (!dailyData[t.date]) dailyData[t.date] = { count: 0, totalPrix: 0 };
            dailyData[t.date].count++;
            dailyData[t.date].totalPrix += t.prix;
        });
        const sortedDates = Object.keys(dailyData).sort((a, b) => new Date(b) - new Date(a));
        summaryTableBody.innerHTML = '';
        sortedDates.forEach(date => {
            const data = dailyData[date];
            summaryTableBody.innerHTML += `<tr><td data-label="Date">${date}</td><td data-label="Nb Op.">${data.count}</td><td data-label="Total Prix">${formatCFA(data.totalPrix)}</td></tr>`;
        });
    }

    function generateAgentSummary(transactions) {
        agentSummaryTableBody.innerHTML = '<tr><td colspan="3">Aucune donnée pour cette période.</td></tr>';
        if (transactions.length === 0) return;
        const agentData = {};
        transactions.forEach(t => {
            const agentName = t.agent || "Non spécifié";
            if (!agentData[agentName]) agentData[agentName] = { count: 0, totalPrix: 0 };
            agentData[agentName].count++;
            const totalPaiement = t.montantParis + t.montantAbidjan; // On se base sur le paiement
            agentData[agentName].totalPrix += totalPaiement;
        });
        const sortedAgents = Object.keys(agentData).sort((a, b) => agentData[b].totalPrix - agentData[a].totalPrix);
        agentSummaryTableBody.innerHTML = '';
        sortedAgents.forEach(agent => {
            const data = agentData[agent];
            agentSummaryTableBody.innerHTML += `<tr><td data-label="Agent">${agent}</td><td data-label="Nb Op.">${data.count}</td><td data-label="Chiffre d'Affaires">${formatCFA(data.totalPrix)}</td></tr>`;
        });
    }

    transactionsCollection.onSnapshot(snapshot => {
        allTransactions = snapshot.docs.map(doc => doc.data());
        updateDashboard();
    }, error => console.error("Erreur Firestore: ", error));

    startDateInput.addEventListener('change', updateDashboard);
    endDateInput.addEventListener('change', updateDashboard);
    clearFilterBtn.addEventListener('click', () => {
        startDateInput.value = ''; endDateInput.value = '';
        updateDashboard();
    });

    function formatCFA(number) {
        return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(number);
    }
});