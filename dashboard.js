document.addEventListener('DOMContentLoaded', async () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: Connexion BDD échouée."); return;
    }
    // ==== NOUVEAU BLOC POUR GÉRER LES ONGLETS ====
    const tabs = document.querySelectorAll('.sub-nav a');
    const panels = document.querySelectorAll('.tab-panel');

    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault(); // Empêche le saut de page
            
            // 1. Récupère la cible (ex: "#panel-conteneurs")
            const targetId = tab.getAttribute('href');
            const targetPanel = document.querySelector(targetId);

            // 2. Retire 'active' de tous les onglets et panneaux
            tabs.forEach(t => t.classList.remove('active'));
            panels.forEach(p => p.classList.remove('active'));

            // 3. Ajoute 'active' à l'onglet cliqué et au panneau cible
            tab.classList.add('active');
            if (targetPanel) {
                targetPanel.classList.add('active');
            }
        });
    });
    
    // SUPPRIMÉ : Le bloc 'fetch("conteneurs.json")' a été retiré.
    
    // ÉCOUTER LES 4 COLLECTIONS
    const transactionsCollection = db.collection("transactions");
    const expensesCollection = db.collection("expenses"); 
    const otherIncomeCollection = db.collection("other_income"); 
    const bankCollection = db.collection("bank_movements"); 

    // Références aux éléments
    const summaryTableBody = document.getElementById('summaryTableBody');
    const agentSummaryTableBody = document.getElementById('agentSummaryTableBody');
    const containerSummaryTableBody = document.getElementById('containerSummaryTableBody');
    const monthlyExpensesTableBody = document.getElementById('monthlyExpensesTableBody');
    const bankMovementsTableBody = document.getElementById('bankMovementsTableBody');
    const topClientsTableBody = document.getElementById('topClientsTableBody'); // Ajout du Top Clients

    // Cartes des Totaux
    const grandTotalPrixEl = document.getElementById('grandTotalPrix');
    const grandTotalCountEl = document.getElementById('grandTotalCount');
    const grandTotalDepensesEl = document.getElementById('grandTotalDepenses');
    const grandTotalBeneficeEl = document.getElementById('grandTotalBenefice');
    const grandTotalResteEl = document.getElementById('grandTotalReste');
    const grandTotalOtherIncomeEl = document.getElementById('grandTotalOtherIncome');
    const grandTotalPercuEl = document.getElementById('grandTotalPercu');
    const grandTotalRetraitsEl = document.getElementById('grandTotalRetraits');
    const grandTotalDepotsEl = document.getElementById('grandTotalDepots');
    const grandTotalCaisseEl = document.getElementById('grandTotalCaisse');
    
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    const clearFilterBtn = document.getElementById('clearFilterBtn');

    // Stockage local des données
    let allTransactions = [];
    let allExpenses = []; 
    let allOtherIncome = []; 
    let allBankMovements = []; 

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
        generateMonthlySummary(filteredTransactions); // Corrigé (utilise Monthly au lieu de Daily)
        generateAgentSummary(filteredTransactions);
        generateContainerSummary(filteredTransactions, filteredExpenses); // MODIFIÉ : ne passe plus conteneurDB
        generateMonthlyExpenseSummary(filteredExpenses); 
        generateBankMovementSummary(filteredBankMovements);
        generateTopClientsSummary(filteredTransactions); // Ajout du Top Clients
    }

    // ... (La fonction updateGrandTotals est correcte) ...
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

    // ... (La fonction generateMonthlySummary est correcte) ...
    function generateMonthlySummary(transactions) {
        summaryTableBody.innerHTML = '<tr><td colspan="3">Aucune donnée pour cette période.</td></tr>';
        if (transactions.length === 0) return;
        const monthlyData = {};
        transactions.forEach(t => {
            if (!t.date) return; 
            const monthYear = t.date.substring(0, 7); 
            if (!monthlyData[monthYear]) {
                monthlyData[monthYear] = { count: 0, totalPrix: 0 };
            }
            monthlyData[monthYear].count++;
            monthlyData[monthYear].totalPrix += (t.prix || 0);
        });
        const sortedMonths = Object.keys(monthlyData).sort((a, b) => b.localeCompare(a));
        summaryTableBody.innerHTML = '';
        sortedMonths.forEach(month => {
            const data = monthlyData[month];
            summaryTableBody.innerHTML += `<tr><td data-label="Mois">${month}</td><td data-label="Nb Op.">${data.count}</td><td data-label="Total Prix">${formatCFA(data.totalPrix)}</td></tr>`;
        });
    }

    // ... (La fonction generateAgentSummary est correcte) ...
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

    // ==== FONCTION generateContainerSummary MODIFIÉE ====
    function generateContainerSummary(transactions, expenses) {
        containerSummaryTableBody.innerHTML = '<tr><td colspan="8">Aucune donnée de conteneur.</td></tr>';
        
        const containerData = {};
        transactions.forEach(t => {
            // MODIFIÉ : Utilise uniquement 't.conteneur'
            const containerName = t.conteneur || "Non spécifié"; 
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

    // ... (La fonction generateMonthlyExpenseSummary est correcte) ...
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

    // ... (La fonction generateBankMovementSummary est correcte) ...
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

    // ... (La fonction generateTopClientsSummary est correcte) ...
    function generateTopClientsSummary(transactions) {
        topClientsTableBody.innerHTML = '<tr><td colspan="4">Aucune donnée client.</td></tr>';
        const clientData = {};
        transactions.forEach(t => {
            const clientName = t.nom || "Client non spécifié";
            if (clientName === "Client non spécifié" || !clientName.trim()) {
                return; 
            }
            if (!clientData[clientName]) {
                clientData[clientName] = { totalPrix: 0, count: 0 };
            }
            clientData[clientName].totalPrix += (t.prix || 0);
            clientData[clientName].count++;
        });
        const sortedClients = Object.entries(clientData)
            .map(([name, data]) => ({ name, ...data }))
            .sort((a, b) => b.totalPrix - a.totalPrix); 
        if (sortedClients.length === 0) return;
        const top100Clients = sortedClients.slice(0, 100);
        topClientsTableBody.innerHTML = ''; 
        top100Clients.forEach((client, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td data-label="Rang"><b>#${index + 1}</b></td>
                <td data-label="Client">${client.name}</td>
                <td data-label="Nb. Op.">${client.count}</td>
                <td data-label="Chiffre d'Affaires">${formatCFA(client.totalPrix)}</td>
            `;
            topClientsTableBody.appendChild(row);
        });
    }


    // --- Écouteurs Firestore ---
    transactionsCollection.where("isDeleted", "!=", true).orderBy("isDeleted").orderBy("date", "desc").onSnapshot(snapshot => {
        allTransactions = snapshot.docs.map(doc => doc.data());
        updateDashboard();
    }, error => console.error("Erreur Firestore (transactions): ", error));

    expensesCollection.where("isDeleted", "!=", true).orderBy("isDeleted").orderBy("date", "desc").onSnapshot(snapshot => {
        allExpenses = snapshot.docs.map(doc => doc.data());
        updateDashboard(); 
    }, error => console.error("Erreur Firestore (expenses): ", error));

    otherIncomeCollection.where("isDeleted", "!=", true).orderBy("isDeleted").orderBy("date", "desc").onSnapshot(snapshot => {
        allOtherIncome = snapshot.docs.map(doc => doc.data());
        updateDashboard(); 
    }, error => console.error("Erreur Firestore (other_income): ", error));

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