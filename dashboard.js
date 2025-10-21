document.addEventListener('DOMContentLoaded', async () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: La connexion à la base de données a échoué.");
        return;
    }
    // NOUVEAU BLOC : Charger le fichier conteneurs.json
    let conteneurDB = {};
    try {
        conteneurDB = await fetch('conteneurs.json').then(res => res.json());
    } catch (error) {
        console.error("Erreur critique: Impossible de charger conteneurs.json.", error);
        alert("Attention: Le fichier conteneurs.json est manquant ou invalide. Le récapitulatif par conteneur sera vide.");
    }
    
    const transactionsCollection = db.collection("transactions");
    const summaryTableBody = document.getElementById('summaryTableBody');
    const agentSummaryTableBody = document.getElementById('agentSummaryTableBody');
    const containerSummaryTableBody = document.getElementById('containerSummaryTableBody');
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
        generateContainerSummary(filteredTransactions, conteneurDB);
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

    // AJOUTER CETTE NOUVELLE FONCTION

  function generateContainerSummary(transactions, conteneurDB) {
    containerSummaryTableBody.innerHTML = '<tr><td colspan="5">Aucune donnée de conteneur.</td></tr>';
    const containerData = {};

    transactions.forEach(t => {
            // C'EST LA LIGNE MAGIQUE :
            // On cherche à quelle conteneur appartient la référence t.reference
      const containerName = conteneurDB[t.reference] || "Non spécifié";

      if (!containerData[containerName]) {
        containerData[containerName] = {
          totalPrix: 0, // CA
          totalParis: 0,
          totalAbidjan: 0,
          totalReste: 0
        };
      }
      const data = containerData[containerName];
      data.totalPrix += t.prix;
      data.totalParis += t.montantParis;
      data.totalAbidjan += t.montantAbidjan;
            // Le "Reste" est la somme de (Paris + Abidjan) - Prix
      data.totalReste += (t.montantParis + t.montantAbidjan - t.prix);
    });

    const sortedContainers = Object.keys(containerData).sort();
        
        if (sortedContainers.length === 0 || (sortedContainers.length === 1 && sortedContainers[0] === "Non spécifié")) {
             return; // On garde le message "Aucune donnée"
        }

    containerSummaryTableBody.innerHTML = ''; // On vide le tableau

    sortedContainers.forEach(container => {
            if (container === "Non spécifié") return; // On n'affiche pas les transactions "Non spécifié"

      const data = containerData[container];
      const ca = data.totalPrix; // Chiffre d'Affaires

            // Calcul des pourcentages
      const percParis = ca > 0 ? (data.totalParis / ca) * 100 : 0;
      const percAbidjan = ca > 0 ? (data.totalAbidjan / ca) * 100 : 0;
      const percReste = ca > 0 ? (data.totalReste / ca) * 100 : 0;
            
      const row = document.createElement('tr');
      row.innerHTML = `
        <td data-label="Conteneur">${container}</td>
        <td data-label="CA">${formatCFA(ca)}</td>
        <td data-label="Total Paris">${formatCFA(data.totalParis)} <span class="perc">(${percParis.toFixed(1)}%)</span></td>
        <td data-label="Total Abidjan">${formatCFA(data.totalAbidjan)} <span class="perc">(${percAbidjan.toFixed(1)}%)</span></td>
        <td data-label="Total Reste" class="${data.totalReste < 0 ? 'reste-negatif' : 'reste-positif'}">${formatCFA(data.totalReste)} <span class="perc">(${percReste.toFixed(1)}%)</span></td>
        `;
      containerSummaryTableBody.appendChild(row);
    });
  }
    function formatCFA(number) {
        return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(number);
    }
});