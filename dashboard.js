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

   // REMPLACEZ VOTRE ANCIENNE FONCTION 'generateContainerSummary' PAR CELLE-CI :

    function generateContainerSummary(transactions, conteneurDB) {
        // MODIFICATION 1 : Augmentation du 'colspan' pour la nouvelle colonne
        containerSummaryTableBody.innerHTML = '<tr><td colspan="6">Aucune donnée de conteneur.</td></tr>';
        const containerData = {};

        transactions.forEach(t => {
            const containerName = t.conteneur || conteneurDB[t.reference] || "Non spécifié";

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
            data.totalReste += (t.montantParis + t.montantAbidjan - t.prix);
        });

        // MODIFICATION 2 : Tri numérique décroissant (ex: D20, D19, D18...)
        const sortedContainers = Object.keys(containerData).sort((a, b) => {
            // Extrait les nombres des noms de conteneurs (ex: "D35" -> 35)
            const numA = parseInt(a.replace(/[^0-9]/g, ''), 10) || 0;
            const numB = parseInt(b.replace(/[^0-9]/g, ''), 10) || 0;
            // Trie du plus grand au plus petit
            return numB - numA;
        });
        
        if (sortedContainers.length === 0 || (sortedContainers.length === 1 && sortedContainers[0] === "Non spécifié")) {
             return; // On garde le message "Aucune donnée"
        }

        containerSummaryTableBody.innerHTML = ''; // On vide le tableau

        sortedContainers.forEach(container => {
            if (container === "Non spécifié") return; 

            const data = containerData[container];
            const ca = data.totalPrix; 

            // Calcul des pourcentages
            const percParis = ca > 0 ? (data.totalParis / ca) * 100 : 0;
            const percAbidjan = ca > 0 ? (data.totalAbidjan / ca) * 100 : 0;
            const percReste = ca > 0 ? (data.totalReste / ca) * 100 : 0;
            
            // MODIFICATION 3 : Calcul de la nouvelle colonne "Total Perçu"
            const totalPercu = data.totalParis + data.totalAbidjan;
            const percPercu = ca > 0 ? (totalPercu / ca) * 100 : 0;
            
            const row = document.createElement('tr');
            
            // MODIFICATION 4 : Ajout de la nouvelle cellule (<td>) dans le HTML
            row.innerHTML = `
                <td data-label="Conteneur">${container}</td>
                <td data-label="CA">${formatCFA(ca)}</td>
                <td data-label="Total Paris">${formatCFA(data.totalParis)} <span class="perc">(${percParis.toFixed(1)}%)</span></td>
                <td data-label="Total Abidjan">${formatCFA(data.totalAbidjan)} <span class="perc">(${percAbidjan.toFixed(1)}%)</span></td>
                <td data-label="Total Perçu">${formatCFA(totalPercu)} <span class="perc">(${percPercu.toFixed(1)}%)</span></td>
                <td data-label="Total Reste" class="${data.totalReste < 0 ? 'reste-negatif' : 'reste-positif'}">${formatCFA(data.totalReste)} <span class="perc">(${percReste.toFixed(1)}%)</span></td>
            `;
            containerSummaryTableBody.appendChild(row);
        });
    }
    function formatCFA(number) {
        return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(number);
    }
});