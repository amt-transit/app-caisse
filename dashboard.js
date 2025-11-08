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
    const expensesCollection = db.collection("expenses"); // NOUVELLE COLLECTION
    const summaryTableBody = document.getElementById('summaryTableBody');
    const agentSummaryTableBody = document.getElementById('agentSummaryTableBody');
    const containerSummaryTableBody = document.getElementById('containerSummaryTableBody');
    const monthlyExpensesTableBody = document.getElementById('monthlyExpensesTableBody');
    const grandTotalPrixEl = document.getElementById('grandTotalPrix');
    const grandTotalCountEl = document.getElementById('grandTotalCount');
    const grandTotalDepensesEl = document.getElementById('grandTotalDepenses');
    const grandTotalBeneficeEl = document.getElementById('grandTotalBenefice');
    const grandTotalResteEl = document.getElementById('grandTotalReste');
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    const clearFilterBtn = document.getElementById('clearFilterBtn');

    let allTransactions = [];
    let allExpenses = []; // NOUVEAU

    // MISE À JOUR : 'updateDashboard' filtre maintenant les 2 listes
    function updateDashboard() {
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;

        const filteredTransactions = allTransactions.filter(transac => {
            if (startDate && transac.date < startDate) return false;
            if (endDate && transac.date > endDate) return false;
            return true;
        });
        
        // NOUVEAU : Filtrer les dépenses
        const filteredExpenses = allExpenses.filter(expense => {
            if (startDate && expense.date < startDate) return false;
            if (endDate && expense.date > endDate) return false;
            return true;
        });

        // MISE À JOUR : Passer les dépenses aux fonctions
        updateGrandTotals(filteredTransactions, filteredExpenses);
        generateDailySummary(filteredTransactions);
        generateAgentSummary(filteredTransactions);
        generateContainerSummary(filteredTransactions, filteredExpenses, conteneurDB);
        generateMonthlyExpenseSummary(filteredExpenses); // NOUVEAU
    }

    // MISE À JOUR : Accepte 'transactions' ET 'expenses'
    function updateGrandTotals(transactions, expenses) {
        const totalPrix = transactions.reduce((sum, t) => sum + (t.prix || 0), 0);
        const totalCount = transactions.length;
        
        // NOUVEAU : Calcul des dépenses
        const totalDepenses = expenses.reduce((sum, e) => sum + (e.montant || 0), 0);
        // NOUVEAU : Calcul du bénéfice
        const totalBenefice = totalPrix - totalDepenses; 

        grandTotalPrixEl.textContent = formatCFA(totalPrix);
        grandTotalCountEl.textContent = totalCount;
        grandTotalDepensesEl.textContent = formatCFA(totalDepenses);
        grandTotalBeneficeEl.textContent = formatCFA(totalBenefice);
        grandTotalBeneficeEl.className = totalBenefice < 0 ? 'reste-negatif' : 'reste-positif';

        // Note: Le "Reste" (dettes clients) est séparé du bénéfice
        const totalReste = transactions.reduce((sum, t) => sum + (t.reste || 0), 0);
        grandTotalResteEl.textContent = formatCFA(totalReste);
        grandTotalResteEl.className = totalReste < 0 ? 'reste-negatif' : 'reste-positif';
    }

    function generateDailySummary(transactions) {
        // CORRECTION : Colspan est 3 pour ce tableau
        summaryTableBody.innerHTML = '<tr><td colspan="3">Aucune donnée pour cette période.</td></tr>';
        if (transactions.length === 0) return;
        const dailyData = {};
        transactions.forEach(t => {
            if (!dailyData[t.date]) dailyData[t.date] = { count: 0, totalPrix: 0 };
            dailyData[t.date].count++;
            dailyData[t.date].totalPrix += (t.prix || 0);
        });
        const sortedDates = Object.keys(dailyData).sort((a, b) => new Date(b) - new Date(a));
        summaryTableBody.innerHTML = '';
        sortedDates.forEach(date => {
            if (!date) return; // Ignore le groupe des dates vides
            const data = dailyData[date];
            summaryTableBody.innerHTML += `<tr><td data-label="Date">${date}</td><td data-label="Nb Op.">${data.count}</td><td data-label="Total Prix">${formatCFA(data.totalPrix)}</td></tr>`;
        });
    }

    function generateAgentSummary(transactions) {
        agentSummaryTableBody.innerHTML = '<tr><td colspan="3">Aucune donnée pour cette période.</td></tr>';
        
        const agentData = {};

        transactions.forEach(t => {
            const agentString = t.agent || "";
            if (!agentString) return; 

            const agents = agentString.split(',')
                                    .map(a => a.trim()) 
                                    .filter(a => a.length > 0); 
            
            if (agents.length === 0) return;

            agents.forEach(agentName => {
                if (!agentData[agentName]) {
                    agentData[agentName] = { count: 0, totalPrix: 0 };
                }
                
                agentData[agentName].count++;

                if (agentName.endsWith('Paris')) {
                    agentData[agentName].totalPrix += (t.montantParis || 0);
                } else {
                    agentData[agentName].totalPrix += (t.montantAbidjan || 0);
                }
            });
        });

        const sortedAgents = Object.keys(agentData).sort((a, b) => agentData[b].totalPrix - agentData[a].totalPrix);
        
        if (Object.keys(agentData).length === 0) {
             return; 
        }

        agentSummaryTableBody.innerHTML = '';
        sortedAgents.forEach(agent => {
            const data = agentData[agent];
            agentSummaryTableBody.innerHTML += `<tr><td data-label="Agent">${agent}</td><td data-label="Nb Op.">${data.count}</td><td data-label="Chiffre d'Affaires">${formatCFA(data.totalPrix)}</td></tr>`;
        });
    }

    // MISE À JOUR : Accepte 'transactions' ET 'expenses'
    function generateContainerSummary(transactions, expenses, conteneurDB) {
        // MISE À JOUR : Colspan est 8 (6 + 2 nouvelles colonnes)
        containerSummaryTableBody.innerHTML = '<tr><td colspan="8">Aucune donnée de conteneur.</td></tr>';
        
        // Étape 1 : Agréger les revenus par conteneur
        const containerData = {};
        transactions.forEach(t => {
            const containerName = t.conteneur || conteneurDB[t.reference] || "Non spécifié";
            if (!containerData[containerName]) {
                containerData[containerName] = { totalPrix: 0, totalParis: 0, totalAbidjan: 0, totalReste: 0 };
            }
            const data = containerData[containerName];
            data.totalPrix += (t.prix || 0);
            data.totalParis += (t.montantParis || 0);
            data.totalAbidjan += (t.montantAbidjan || 0);
            data.totalReste += (t.reste || 0); // Utiliser le reste calculé
        });

        // NOUVEAU : Étape 2 : Agréger les dépenses par conteneur
        const containerExpenses = {};
        expenses.forEach(e => {
            if (e.type === 'Conteneur' && e.conteneur) {
                const cName = e.conteneur;
                if (!containerExpenses[cName]) containerExpenses[cName] = 0;
                containerExpenses[cName] += (e.montant || 0);
            }
        });

        // Tri (ne change pas)
        const sortedContainers = Object.keys(containerData).sort((a, b) => {
             const numA = parseInt(a.replace(/[^0-9]/g, ''), 10) || 0;
             const numB = parseInt(b.replace(/[^0-9]/g, ''), 10) || 0;
             return numB - numA;
        });

        if (sortedContainers.length === 0 || (sortedContainers.length === 1 && sortedContainers[0] === "Non spécifié")) {
             return;
        }
        containerSummaryTableBody.innerHTML = '';

        // Étape 3 : Afficher les résultats
        sortedContainers.forEach(container => {
            if (container === "Non spécifié") return; 

            const data = containerData[container];
            const ca = data.totalPrix; 
            
            // NOUVEAU : Calculs des dépenses et bénéfice
            const totalDepenseConteneur = containerExpenses[container] || 0;
            const beneficeConteneur = ca - totalDepenseConteneur;

            const percParis = ca > 0 ? (data.totalParis / ca) * 100 : 0;
            const percAbidjan = ca > 0 ? (data.totalAbidjan / ca) * 100 : 0;
            const percReste = ca > 0 ? (data.totalReste / ca) * 100 : 0;
            const totalPercu = data.totalParis + data.totalAbidjan;
            const percPercu = ca > 0 ? (totalPercu / ca) * 100 : 0;

            const row = document.createElement('tr');
            row.innerHTML = `
                <td data-label="Conteneur">${container}</td>
                <td data-label="CA">${formatCFA(ca)}</td>
                <td data-label="Total Paris">${formatCFA(data.totalParis)} <span class="perc">(${percParis.toFixed(1)}%)</span></td>
                <td data-label="Total Abidjan">${formatCFA(data.totalAbidjan)} <span class="perc">(${percAbidjan.toFixed(1)}%)</span></td>
                <td data-label="Total Perçu">${formatCFA(totalPercu)} <span class="perc">(${percPercu.toFixed(1)}%)</span></td>
                <td data-label="Total Reste" class="${data.totalReste < 0 ? 'reste-negatif' : 'reste-positif'}">${formatCFA(data.totalReste)} <span class="perc">(${percReste.toFixed(1)}%)</span></td>
                
                <td data-label="Dépenses">${formatCFA(totalDepenseConteneur)}</td>
                <td data-label="Bénéfice" class="${beneficeConteneur < 0 ? 'reste-negatif' : 'reste-positif'}">${formatCFA(beneficeConteneur)}</td>
            `;
            containerSummaryTableBody.appendChild(row);
        });
    }

    // NOUVELLE FONCTION : Pour la table des dépenses mensuelles
    function generateMonthlyExpenseSummary(expenses) {
        monthlyExpensesTableBody.innerHTML = '';
        let hasMonthly = false;

        // On trie par date la plus récente en premier
        const sortedExpenses = expenses.sort((a, b) => new Date(b.date) - new Date(a.date));

        sortedExpenses.forEach(e => {
            if (e.type === 'Mensuelle') {
                hasMonthly = true;
                monthlyExpensesTableBody.innerHTML += `
                    <tr>
                        <td>${e.date}</td>
                        <td>${e.description}</td>
                        <td>${formatCFA(e.montant)}</td>
                    </tr>
                `;
            }
        });

        if (!hasMonthly) {
            monthlyExpensesTableBody.innerHTML = '<tr><td colspan="3">Aucune dépense mensuelle pour cette période.</td></tr>';
        }
    }

    // MISE À JOUR : Écouter les deux collections
    transactionsCollection.onSnapshot(snapshot => {
        allTransactions = snapshot.docs.map(doc => doc.data());
        updateDashboard(); // Mettre à jour
    }, error => console.error("Erreur Firestore (transactions): ", error));

    // NOUVEAU : Écouter la collection des dépenses
    expensesCollection.onSnapshot(snapshot => {
        allExpenses = snapshot.docs.map(doc => doc.data());
        updateDashboard(); // Mettre à jour
    }, error => console.error("Erreur Firestore (expenses): ", error));

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