document.addEventListener('DOMContentLoaded', async () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: Connexion BDD échouée."); return;
    }
    
    let conteneurDB = {};
    try {
        conteneurDB = await fetch('conteneurs.json').then(res => res.json());
    } catch (error) {
        console.error("Erreur chargement conteneurs.json.", error);
    }
    
    // ÉCOUTER LES 4 COLLECTIONS
    const transactionsCollection = db.collection("transactions");
    const expensesCollection = db.collection("expenses"); 
    const otherIncomeCollection = db.collection("other_income"); // NOUVEAU
    const bankCollection = db.collection("bank_movements"); // NOUVEAU

    // Références aux éléments
    const summaryTableBody = document.getElementById('summaryTableBody');
    const agentSummaryTableBody = document.getElementById('agentSummaryTableBody');
    const containerSummaryTableBody = document.getElementById('containerSummaryTableBody');
    const monthlyExpensesTableBody = document.getElementById('monthlyExpensesTableBody');
    const bankMovementsTableBody = document.getElementById('bankMovementsTableBody'); // NOUVEAU

    // Cartes des Totaux
    const grandTotalPrixEl = document.getElementById('grandTotalPrix');
    const grandTotalCountEl = document.getElementById('grandTotalCount');
    const grandTotalDepensesEl = document.getElementById('grandTotalDepenses');
    const grandTotalBeneficeEl = document.getElementById('grandTotalBenefice');
    const grandTotalResteEl = document.getElementById('grandTotalReste');
    const grandTotalOtherIncomeEl = document.getElementById('grandTotalOtherIncome'); // NOUVEAU
    const grandTotalPercuEl = document.getElementById('grandTotalPercu'); // NOUVEAU
    const grandTotalRetraitsEl = document.getElementById('grandTotalRetraits'); // NOUVEAU
    const grandTotalDepotsEl = document.getElementById('grandTotalDepots'); // NOUVEAU
    const grandTotalCaisseEl = document.getElementById('grandTotalCaisse'); // NOUVEAU
    
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    const clearFilterBtn = document.getElementById('clearFilterBtn');

    // Stockage local des données
    let allTransactions = [];
    let allExpenses = []; 
    let allOtherIncome = []; // NOUVEAU
    let allBankMovements = []; // NOUVEAU

    function filterByDate(items, startDate, endDate) {
        return items.filter(item => {
            if (startDate && item.date < startDate) return false;
            if (endDate && item.date > endDate) return false;
            return true;
        });
    }

    function updateDashboard() {
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;

        // Filtrer les 4 listes
        const filteredTransactions = filterByDate(allTransactions, startDate, endDate);
        const filteredExpenses = filterByDate(allExpenses, startDate, endDate);
        const filteredOtherIncome = filterByDate(allOtherIncome, startDate, endDate);
        const filteredBankMovements = filterByDate(allBankMovements, startDate, endDate);

        // Lancer tous les calculs
        updateGrandTotals(filteredTransactions, filteredExpenses, filteredOtherIncome, filteredBankMovements);
        generateDailySummary(filteredTransactions);
        generateAgentSummary(filteredTransactions);
        generateContainerSummary(filteredTransactions, filteredExpenses, conteneurDB);
        generateMonthlyExpenseSummary(filteredExpenses); 
        generateBankMovementSummary(filteredBankMovements); // NOUVEAU
    }

    function updateGrandTotals(transactions, expenses, otherIncomes, bankMovements) {
        // --- Calcul Bénéfice ---
        const totalPrix = transactions.reduce((sum, t) => sum + (t.prix || 0), 0);
        const totalOtherIncome = otherIncomes.reduce((sum, i) => sum + (i.montant || 0), 0);
        const totalDepenses = expenses.reduce((sum, e) => sum + (e.montant || 0), 0);
        const totalBenefice = (totalPrix + totalOtherIncome) - totalDepenses; 

        // --- Calcul Trésorerie (Cash) ---
        const totalPercu = transactions.reduce((sum, t) => sum + (t.montantParis || 0) + (t.montantAbidjan || 0), 0);
        const totalRetraits = bankMovements.filter(m => m.type === 'Retrait').reduce((sum, m) => sum + (m.montant || 0), 0);
        const totalDepots = bankMovements.filter(m => m.type === 'Depot').reduce((sum, m) => sum + (m.montant || 0), 0);
        // Caisse = (Ce qui est entré) - (Ce qui est sorti)
        const totalCaisse = (totalPercu + totalOtherIncome + totalRetraits) - (totalDepenses + totalDepots);

        // --- Dettes ---
        const totalCount = transactions.length;
        const totalReste = transactions.reduce((sum, t) => sum + (t.reste || 0), 0);
        
        // --- Affichage ---
        grandTotalPrixEl.textContent = formatCFA(totalPrix);
        grandTotalOtherIncomeEl.textContent = formatCFA(totalOtherIncome);
        grandTotalDepensesEl.textContent = formatCFA(totalDepenses);
        grandTotalBeneficeEl.textContent = formatCFA(totalBenefice);
        grandTotalBeneficeEl.className = totalBenefice < 0 ? 'reste-negatif' : 'reste-positif';
        
        grandTotalPercuEl.textContent = formatCFA(totalPercu);
        grandTotalRetraitsEl.textContent = formatCFA(totalRetraits);
        grandTotalDepotsEl.textContent = formatCFA(totalDepots);
        grandTotalCaisseEl.textContent = formatCFA(totalCaisse);
        grandTotalCaisseEl.className = totalCaisse < 0 ? 'reste-negatif' : 'reste-positif';

        grandTotalCountEl.textContent = totalCount;
        grandTotalResteEl.textContent = formatCFA(totalReste);
        grandTotalResteEl.className = totalReste < 0 ? 'reste-negatif' : 'reste-positif';
    }
    
    // ... (generateDailySummary et generateAgentSummary sont OK) ...
    function generateDailySummary(transactions) {
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
            if (!date) return; 
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
            const agents = agentString.split(',').map(a => a.trim()).filter(a => a.length > 0); 
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
        if (Object.keys(agentData).length === 0) return; 
        agentSummaryTableBody.innerHTML = '';
        sortedAgents.forEach(agent => {
            const data = agentData[agent];
            agentSummaryTableBody.innerHTML += `<tr><td data-label="Agent">${agent}</td><td data-label="Nb Op.">${data.count}</td><td data-label="Chiffre d'Affaires">${formatCFA(data.totalPrix)}</td></tr>`;
        });
    }

    // ... (generateContainerSummary est OK) ...
    function generateContainerSummary(transactions, expenses, conteneurDB) {
        containerSummaryTableBody.innerHTML = '<tr><td colspan="8">Aucune donnée de conteneur.</td></tr>';
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
            data.totalReste += (t.reste || 0);
        });

        const containerExpenses = {};
        expenses.forEach(e => {
            if (e.type === 'Conteneur' && e.conteneur) {
                const cName = e.conteneur;
                if (!containerExpenses[cName]) containerExpenses[cName] = 0;
                containerExpenses[cName] += (e.montant || 0);
            }
        });

        const sortedContainers = Object.keys(containerData).sort((a, b) => {
             const numA = parseInt(a.replace(/[^0-9]/g, ''), 10) || 0;
             const numB = parseInt(b.replace(/[^0-9]/g, ''), 10) || 0;
             return numB - numA;
        });

        if (sortedContainers.length === 0 || (sortedContainers.length === 1 && sortedContainers[0] === "Non spécifié")) {
             return;
        }
        containerSummaryTableBody.innerHTML = '';
        sortedContainers.forEach(container => {
            if (container === "Non spécifié") return; 
            const data = containerData[container];
            const ca = data.totalPrix; 
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

    // ... (generateMonthlyExpenseSummary est OK) ...
    function generateMonthlyExpenseSummary(expenses) {
        monthlyExpensesTableBody.innerHTML = '';
        let hasMonthly = false;
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

    // NOUVELLE FONCTION : Pour la table des mouvements bancaires
    function generateBankMovementSummary(bankMovements) {
        bankMovementsTableBody.innerHTML = '';
        if (bankMovements.length === 0) {
            bankMovementsTableBody.innerHTML = '<tr><td colspan="4">Aucun mouvement bancaire pour cette période.</td></tr>';
            return;
        }
        
        const sortedMovements = bankMovements.sort((a, b) => new Date(b.date) - new Date(a.date));
        sortedMovements.forEach(m => {
            bankMovementsTableBody.innerHTML += `
                <tr>
                    <td>${m.date}</td>
                    <td>${m.description}</td>
                    <td>${m.type}</td>
                    <td class="${m.type === 'Depot' ? 'reste-negatif' : 'reste-positif'}">
                         ${m.type === 'Depot' ? '-' : '+'} ${formatCFA(m.montant)}
                    </td>
                </tr>
            `;
        });
    }

    // MISE À JOUR : Écouter les 4 collections
    transactionsCollection.where("isDeleted", "!=", true).orderBy("isDeleted").orderBy("date", "desc").onSnapshot(snapshot => {
        allTransactions = snapshot.docs.map(doc => doc.data());
        updateDashboard();
    }, error => console.error("Erreur Firestore (transactions): ", error));

    expensesCollection.where("isDeleted", "!=", true).orderBy("isDeleted").orderBy("date", "desc").onSnapshot(snapshot => {
        allExpenses = snapshot.docs.map(doc => doc.data());
        updateDashboard(); 
    }, error => console.error("Erreur Firestore (expenses): ", error));

    // NOUVEAU : Écouter 'other_income'
    otherIncomeCollection.where("isDeleted", "!=", true).orderBy("isDeleted").orderBy("date", "desc").onSnapshot(snapshot => {
        allOtherIncome = snapshot.docs.map(doc => doc.data());
        updateDashboard(); 
    }, error => console.error("Erreur Firestore (other_income): ", error));

    // NOUVEAU : Écouter 'bank_movements'
    bankCollection.where("isDeleted", "!=", true).orderBy("isDeleted").orderBy("date", "desc").onSnapshot(snapshot => {
        allBankMovements = snapshot.docs.map(doc => doc.data());
        updateDashboard(); 
    }, error => console.error("Erreur Firestore (bank_movements): ", error));


    // Listeners des filtres de date
    startDateInput.addEventListener('change', updateDashboard);
    endDateInput.addEventListener('change', updateDashboard);
    clearFilterBtn.addEventListener('click', () => {
        startDateInput.value = ''; endDateInput.value = '';
        updateDashboard();
    });

    function formatCFA(number) {
        return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(number || 0);
    }
});