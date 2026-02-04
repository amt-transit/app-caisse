document.addEventListener('DOMContentLoaded', async () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: Connexion BDD échouée."); return;
    }

    const transactionsCollection = db.collection("transactions");
    const expensesCollection = db.collection("expenses"); 
    const otherIncomeCollection = db.collection("other_income"); 
    const bankCollection = db.collection("bank_movements"); 

    const summaryTableBody = document.getElementById('summaryTableBody');
    const agentSummaryTableBody = document.getElementById('agentSummaryTableBody');
    const containerSummaryTableBody = document.getElementById('containerSummaryTableBody');
    const monthlyExpensesTableBody = document.getElementById('monthlyExpensesTableBody');
    const bankMovementsTableBody = document.getElementById('bankMovementsTableBody');
    const topClientsTableBody = document.getElementById('topClientsTableBody'); 

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
    const grandTotalParisHiddenEl = document.getElementById('grandTotalParisHidden');
    
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    const clearFilterBtn = document.getElementById('clearFilterBtn');

    const tabs = document.querySelectorAll('.sub-nav a');
    const panels = document.querySelectorAll('.tab-panel');
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = tab.getAttribute('href');
            const targetPanel = document.querySelector(targetId);
            tabs.forEach(t => t.classList.remove('active'));
            panels.forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            if (targetPanel) targetPanel.classList.add('active');
        });
    });

    let expenseChartInstance = null;
    let containerChartInstance = null;
    let paymentChartInstance = null;
    let profitChartInstance = null;
    let debtChartInstance = null;
    let agentChartInstance = null;

    let allTransactions = [], allExpenses = [], allOtherIncome = [], allBankMovements = []; 

    function filterByDate(items, startDate, endDate) {
        return items.filter(item => {
            // 1. Vérifier la date principale (Création/Arrivée)
            if ((!startDate || item.date >= startDate) && (!endDate || item.date <= endDate)) return true;

            // 2. Vérifier l'historique des paiements (Si un paiement a eu lieu dans la période)
            if (item.paymentHistory && Array.isArray(item.paymentHistory)) {
                const hasPayment = item.paymentHistory.some(p => {
                    return (!startDate || p.date >= startDate) && (!endDate || p.date <= endDate);
                });
                if (hasPayment) return true;
            }

            // 3. Vérifier la date de dernière activité (Fallback)
            if (item.lastPaymentDate) {
                if ((!startDate || item.lastPaymentDate >= startDate) && (!endDate || item.lastPaymentDate <= endDate)) return true;
            }

            return false;
        });
    }

    function updateDashboard() {
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;

        // Filtrer les 4 listes par date
        const filteredTransactions = filterByDate(allTransactions, startDate, endDate);
        const filteredExpenses = filterByDate(allExpenses, startDate, endDate);
        const filteredOtherIncome = filterByDate(allOtherIncome, startDate, endDate);
        const filteredBankMovements = filterByDate(allBankMovements, startDate, endDate);

        updateGrandTotals(filteredTransactions, filteredExpenses, filteredOtherIncome, filteredBankMovements);
        generateMonthlySummary(filteredTransactions); 
        generateAgentSummary(filteredTransactions);
        generateContainerSummary(filteredTransactions, filteredExpenses); 
        generateMonthlyExpenseSummary(filteredExpenses); 
        generateBankMovementSummary(filteredBankMovements);
        generateTopClientsSummary(filteredTransactions); 
        generateAdvancedAnalytics(filteredTransactions, allTransactions); // Nouvelles analyses
        generateVisualCharts(allTransactions, allExpenses); // Graphiques (sur toutes les données pour voir l'évolution)
    }

    function updateGrandTotals(transactions, expenses, otherIncomes, bankMovements) {
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;
        const isInRange = (d) => (!startDate || d >= startDate) && (!endDate || d <= endDate);

        // --- 1. VENTES & BÉNÉFICE ---
        // Calcul précis basé sur les paiements effectifs dans la période
        const totalEntreesAbidjan = transactions.reduce((sum, t) => {
            if (t.paymentHistory && Array.isArray(t.paymentHistory)) {
                const sub = t.paymentHistory.reduce((s, p) => isInRange(p.date) ? s + (p.montantAbidjan || 0) : s, 0);
                return sum + sub;
            }
            return isInRange(t.date) ? sum + (t.montantAbidjan || 0) : sum;
        }, 0);

        const totalEntreesParis = transactions.reduce((sum, t) => {
            if (t.paymentHistory && Array.isArray(t.paymentHistory)) {
                const sub = t.paymentHistory.reduce((s, p) => isInRange(p.date) ? s + (p.montantParis || 0) : s, 0);
                return sum + sub;
            }
            return isInRange(t.date) ? sum + (t.montantParis || 0) : sum;
        }, 0);

        const totalOtherIncome = otherIncomes.reduce((sum, i) => sum + (i.montant || 0), 0);
        // On exclut les allocations du calcul des dépenses
        const realExpenses = expenses.filter(e => e.action !== 'Allocation');
        const totalDepenses = realExpenses.reduce((sum, e) => sum + (e.montant || 0), 0);
        const totalBenefice = (totalEntreesAbidjan + totalOtherIncome) - totalDepenses; 

        // --- 2. ANALYSE FINE DE LA TRÉSORERIE ---
        
        // A. Calcul des Chèques en Coffre (Non déposés)
        // On doit parcourir l'historique des paiements de chaque transaction
        let totalChequesEnCoffre = 0;
        let totalVentesCash = 0; // Espèces, OM, Wave...

        transactions.forEach(t => {
            if (t.paymentHistory) {
                t.paymentHistory.forEach(pay => {
                    // On ne prend en compte que ce qui est dans la plage de dates sélectionnée
                    if (!isInRange(pay.date)) return;

                    // Si c'est un chèque ET qu'il est 'Pending'
                    if (pay.modePaiement === 'Chèque' && pay.checkStatus === 'Pending') {
                        totalChequesEnCoffre += (pay.montantAbidjan || 0);
                    } else if (pay.modePaiement !== 'Chèque') {
                        // Si ce n'est pas un chèque, c'est du cash dispo
                        totalVentesCash += (pay.montantAbidjan || 0);
                    }
                });
            } else {
                // Anciennes données : on vérifie la date principale
                if (isInRange(t.date)) {
                    totalVentesCash += (t.montantAbidjan || 0);
                }
            }
        });

        // B. Calcul de la Caisse Disponible (Cash)
        // Caisse = (Ventes Cash + Autres) - (Dépenses Cash)
        // Note : On suppose que les dépenses sortent de la caisse espèces.
        // Note 2 : Les mouvements banques (Retraits) ajoutent du cash. Les Dépôts enlèvent du cash.
        
        const totalRetraits = bankMovements.filter(m => m.type === 'Retrait').reduce((sum, m) => sum + (m.montant || 0), 0);
        const totalDepots = bankMovements.filter(m => m.type === 'Depot').reduce((sum, m) => sum + (m.montant || 0), 0);
        
        const totalCaisse = (totalVentesCash + totalOtherIncome + totalRetraits) - (totalDepenses + totalDepots);


        // --- AFFICHAGE ---
        grandTotalPrixEl.textContent = formatCFA(totalEntreesAbidjan);
        grandTotalOtherIncomeEl.textContent = formatCFA(totalOtherIncome);
        grandTotalDepensesEl.textContent = formatCFA(totalDepenses);
        grandTotalBeneficeEl.textContent = formatCFA(totalBenefice);
        grandTotalBeneficeEl.closest('.total-card').className = 'total-card ' + (totalBenefice < 0 ? 'card-negatif' : 'card-positif');
        
        document.getElementById('grandTotalPercu').textContent = formatCFA(totalEntreesAbidjan);
        if(grandTotalParisHiddenEl) grandTotalParisHiddenEl.textContent = `Total Ventes Perçues (P): ${formatCFA(totalEntreesParis)}`;

        grandTotalRetraitsEl.textContent = formatCFA(totalRetraits);
        grandTotalDepotsEl.textContent = formatCFA(totalDepots);
        
        grandTotalCaisseEl.textContent = formatCFA(totalCaisse);
        grandTotalCaisseEl.closest('.total-card').className = 'total-card ' + (totalCaisse < 0 ? 'card-negatif' : 'card-positif');

        // NOUVEAU : Affichage Chèques
        const chequeEl = document.getElementById('grandTotalCheques');
        if(chequeEl) chequeEl.textContent = formatCFA(totalChequesEnCoffre);

        grandTotalCountEl.textContent = transactions.length;
        grandTotalResteEl.textContent = formatCFA(transactions.reduce((sum, t) => sum + (t.reste || 0), 0));
    }
    
    function generateMonthlySummary(transactions) {
        summaryTableBody.innerHTML = '<tr><td colspan="3">Aucune donnée pour cette période.</td></tr>';
        if (transactions.length === 0) return;
        const monthlyData = {};
        transactions.forEach(t => {
            if (!t.date) return; 
            const monthYear = t.date.substring(0, 7); 
            if (!monthlyData[monthYear]) monthlyData[monthYear] = { count: 0, totalPrix: 0 };
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

    function generateAgentSummary(transactions) {
        agentSummaryTableBody.innerHTML = '<tr><td colspan="3">Aucune donnée pour cette période.</td></tr>';
        const agentData = {};
        transactions.forEach(t => {
            const agentString = t.agent || "";
            if (!agentString) return; 
            const agents = agentString.split(',').map(a => a.trim()).filter(a => a.length > 0); 
            if (agents.length === 0) return;
            agents.forEach(agentName => {
                if (!agentData[agentName]) agentData[agentName] = { count: 0, totalPrix: 0 };
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

    // Remplacez votre fonction generateContainerSummary actuelle par celle-ci
    function generateContainerSummary(transactions, expenses) {
        const tbody = document.getElementById('containerSummaryTableBody');
        tbody.innerHTML = '<tr><td colspan="8">Aucune donnée de conteneur.</td></tr>';
        
        // ... (Votre logique de calcul existante reste identique ici) ...
        // Je reprends juste la partie calcul pour le contexte, ne changez pas votre logique de calcul
        const containerData = {};
        transactions.forEach(t => {
            const containerName = (t.conteneur && t.conteneur.trim().toUpperCase()) || "Non spécifié"; 
            if (!containerData[containerName]) containerData[containerName] = { totalPrix: 0, totalParis: 0, totalAbidjan: 0, totalReste: 0, date: t.date };
            const data = containerData[containerName];
            data.totalPrix += (t.prix || 0);
            data.totalParis += (t.montantParis || 0);
            data.totalAbidjan += (t.montantAbidjan || 0);
            data.totalReste += (t.reste || 0);
            if (t.date && t.date < data.date) data.date = t.date;
        });

        const containerExpenses = {};
        expenses.forEach(e => {
            if (e.action !== 'Allocation' && e.conteneur) {
                const cName = e.conteneur.trim().toUpperCase();
                if (!cName) return;
                if (!containerExpenses[cName]) containerExpenses[cName] = 0;
                containerExpenses[cName] += (e.montant || 0);
            }
        });

        const allContainers = new Set([...Object.keys(containerData), ...Object.keys(containerExpenses)]);

        // GROUPAGE PAR MOIS
        const containersByMonth = {};
        allContainers.forEach(container => {
            if (container === "Non spécifié") return;
            let dateStr = containerData[container]?.date;
            if (!dateStr) dateStr = "9999-99-99"; 
            const monthKey = dateStr.substring(0, 7); // YYYY-MM
            if (!containersByMonth[monthKey]) containersByMonth[monthKey] = [];
            containersByMonth[monthKey].push(container);
        });

        const sortedMonths = Object.keys(containersByMonth).sort().reverse();

        if (sortedMonths.length === 0) return;
        
        tbody.innerHTML = '';
        
        sortedMonths.forEach(monthKey => {
            const containers = containersByMonth[monthKey];
            
            // Calcul Totaux Mois
            let mCA = 0, mParis = 0, mAbj = 0, mReste = 0, mDep = 0;
            containers.forEach(c => {
                const d = containerData[c] || { totalPrix: 0, totalParis: 0, totalAbidjan: 0, totalReste: 0 };
                mCA += d.totalPrix; mParis += d.totalParis; mAbj += d.totalAbidjan; mReste += d.totalReste;
                mDep += (containerExpenses[c] || 0);
            });
            const mBenef = mCA - mDep;
            const mPercu = mParis + mAbj;

            // Ligne Mois
            const monthRow = document.createElement('tr');
            monthRow.style.backgroundColor = '#cbd5e1';
            monthRow.style.fontWeight = 'bold';
            monthRow.style.cursor = 'pointer';
            
            let monthLabel = "Date Inconnue";
            if (monthKey !== "9999-99") {
                const [y, m] = monthKey.split('-');
                const dateObj = new Date(parseInt(y), parseInt(m)-1, 1);
                monthLabel = dateObj.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }).toUpperCase();
            }

            monthRow.innerHTML = `
                <td data-label="Mois"><span style="display:inline-block; width:15px;">▶</span> ${monthLabel} (${containers.length})</td>
                <td data-label="CA">${formatCFA(mCA)}</td>
                <td data-label="Total Paris">${formatCFA(mParis)}</td>
                <td data-label="Total Abidjan">${formatCFA(mAbj)}</td>
                <td data-label="Total Perçu">${formatCFA(mPercu)}</td>
                <td data-label="Total Reste" class="${mReste < 0 ? 'reste-negatif' : 'reste-positif'}">${formatCFA(mReste)}</td>
                <td data-label="Dépenses">${formatCFA(mDep)}</td>
                <td data-label="Bénéfice" class="${mBenef < 0 ? 'reste-negatif' : 'reste-positif'}">${formatCFA(mBenef)}</td>
            `;
            
            monthRow.onclick = () => {
                const rows = document.querySelectorAll(`.month-${monthKey}`);
                const icon = monthRow.querySelector('span');
                let isHidden = true;
                rows.forEach(r => {
                    if (r.style.display === 'none') { r.style.display = 'table-row'; isHidden = false; }
                    else { r.style.display = 'none'; isHidden = true; }
                });
                icon.textContent = isHidden ? '▶' : '▼';
            };
            tbody.appendChild(monthRow);

            // Tri des conteneurs
            containers.sort((a, b) => {
                const numA = parseInt(a.replace(/[^0-9]/g, ''), 10) || 0;
                const numB = parseInt(b.replace(/[^0-9]/g, ''), 10) || 0;
                return numB - numA;
            });

            containers.forEach(container => {
                const data = containerData[container] || { totalPrix: 0, totalParis: 0, totalAbidjan: 0, totalReste: 0 };
                const ca = data.totalPrix; 
                const totalDepenseConteneur = containerExpenses[container] || 0;
                const beneficeConteneur = ca - totalDepenseConteneur;
                const totalPercu = data.totalParis + data.totalAbidjan;

                const percParis = ca > 0 ? ((data.totalParis / ca) * 100).toFixed(1) : "0.0";
                const percAbidjan = ca > 0 ? ((data.totalAbidjan / ca) * 100).toFixed(1) : "0.0";
                const percReste = ca > 0 ? ((data.totalReste / ca) * 100).toFixed(1) : "0.0";

                const row = document.createElement('tr');
                row.className = `month-${monthKey}`;
                row.style.display = 'none';
                row.style.backgroundColor = '#f8fafc';
                row.onclick = () => openContainerDetails(container);
                row.title = "Cliquez pour voir le détail des opérations";

                row.innerHTML = `
                    <td data-label="Conteneur" style="padding-left: 30px;">↳ <b>${container}</b></td>
                    <td data-label="CA">${formatCFA(ca)}</td>
                    <td data-label="Total Paris">${formatCFA(data.totalParis)} <br><small style="color:#666; font-size:0.8em;">(${percParis}%)</small></td>
                    <td data-label="Total Abidjan">${formatCFA(data.totalAbidjan)} <br><small style="color:#666; font-size:0.8em;">(${percAbidjan}%)</small></td>
                    <td data-label="Total Perçu">${formatCFA(totalPercu)}</td>
                    <td data-label="Total Reste" class="${data.totalReste < 0 ? 'reste-negatif' : 'reste-positif'}">${formatCFA(data.totalReste)} <br><small style="color:#dc3545; font-size:0.8em; font-weight: bold;">(${percReste}%)</small></td>
                    <td data-label="Dépenses">${formatCFA(totalDepenseConteneur)}</td>
                    <td data-label="Bénéfice" class="${beneficeConteneur < 0 ? 'reste-negatif' : 'reste-positif'}">${formatCFA(beneficeConteneur)}</td>
                `;
                tbody.appendChild(row);
            });
        });
    }

    function generateMonthlyExpenseSummary(expenses) {
        monthlyExpensesTableBody.innerHTML = '';
        let hasMonthly = false;
        const sortedExpenses = expenses.sort((a, b) => new Date(b.date) - new Date(a.date));
        sortedExpenses.forEach(e => {
            // On n'affiche que les Dépenses Mensuelles (pas les allocations)
            if (e.action !== 'Allocation' && e.type === 'Mensuelle') {
                hasMonthly = true;
                monthlyExpensesTableBody.innerHTML += `<tr><td>${e.date}</td><td>${e.description}</td><td>${formatCFA(e.montant)}</td></tr>`;
            }
        });
        if (!hasMonthly) monthlyExpensesTableBody.innerHTML = '<tr><td colspan="3">Aucune dépense mensuelle pour cette période.</td></tr>';
    }

    function generateBankMovementSummary(bankMovements) {
        bankMovementsTableBody.innerHTML = '';
        if (bankMovements.length === 0) {
            bankMovementsTableBody.innerHTML = '<tr><td colspan="4">Aucun mouvement bancaire pour cette période.</td></tr>';
            return;
        }
        const sortedMovements = bankMovements.sort((a, b) => new Date(b.date) - new Date(a.date));
        sortedMovements.forEach(m => {
            bankMovementsTableBody.innerHTML += `<tr><td>${m.date}</td><td>${m.description}</td><td>${m.type}</td><td class="${m.type === 'Depot' ? 'reste-negatif' : 'reste-positif'}">${m.type === 'Depot' ? '-' : '+'} ${formatCFA(m.montant)}</td></tr>`;
        });
    }

    function generateTopClientsSummary(transactions) {
        topClientsTableBody.innerHTML = '<tr><td colspan="5">Aucune donnée client.</td></tr>';
        const clientData = {};
        transactions.forEach(t => {
            const clientName = t.nom || "Client non spécifié";
            if (clientName === "Client non spécifié" || !clientName.trim()) return; 
            if (!clientData[clientName]) clientData[clientName] = { totalPrix: 0, count: 0, destinataire: '', totalReste: 0 };
            clientData[clientName].totalPrix += (t.prix || 0);
            clientData[clientName].totalReste += (t.reste || 0);
            clientData[clientName].count++;
            if (!clientData[clientName].destinataire && t.nomDestinataire) clientData[clientName].destinataire = t.nomDestinataire;
        });
        const sortedClients = Object.entries(clientData).map(([name, data]) => ({ name, ...data })).sort((a, b) => b.totalPrix - a.totalPrix); 
        if (sortedClients.length === 0) return;

        const top100Clients = sortedClients.slice(0, 100);
        topClientsTableBody.innerHTML = ''; 
        top100Clients.forEach((client, index) => {
            // Logique WhatsApp
            const message = `Bonjour ${client.destinataire || client.name}, sauf erreur de notre part, le solde restant à payer pour vos envois est de ${formatCFA(client.totalReste)}. Merci.`;
            const waLink = `https://wa.me/?text=${encodeURIComponent(message)}`;
            const waBtn = client.totalReste > 0 
                ? `<a href="${waLink}" target="_blank" style="text-decoration:none; font-size:16px;" title="Relancer sur WhatsApp">📱</a>` 
                : '<span style="color:#ccc">✔️</span>';

            const row = document.createElement('tr');
            row.innerHTML = `<td data-label="Rang"><b>#${index + 1}</b></td><td data-label="Client">${client.name} ${waBtn}</td><td data-label="Destinataire">${client.destinataire || '-'}</td><td data-label="Nb. Op.">${client.count}</td><td data-label="Chiffre d'Affaires">${formatCFA(client.totalPrix)}</td>`;
            topClientsTableBody.appendChild(row);
        });
    }

    // --- GÉNÉRATION DES GRAPHIQUES ---
    function generateVisualCharts(transactions, expenses) {
        const ctxExpense = document.getElementById('expenseEvolutionChart');
        const ctxContainer = document.getElementById('containerEvolutionChart');
        const ctxPayment = document.getElementById('paymentModeChart');
        const ctxProfit = document.getElementById('topContainerProfitChart');
        const ctxDebt = document.getElementById('debtVsCollectedChart');
        const ctxAgent = document.getElementById('agentPerformanceChart');
        
        if (!ctxExpense || !ctxContainer || !ctxPayment || !ctxProfit || !ctxDebt || !ctxAgent) return;

        // 1. GRAPHIQUE DÉPENSES (Mensuelles vs Conteneurs)
        const expenseStats = {};
        expenses.forEach(e => {
            if (!e.date) return;
            const month = e.date.substring(0, 7); // YYYY-MM
            if (!expenseStats[month]) expenseStats[month] = { monthly: 0, container: 0 };
            
            if (e.type === 'Conteneur' || (e.conteneur && e.conteneur.trim() !== '')) {
                expenseStats[month].container += (e.montant || 0);
            } else if (e.action !== 'Allocation') {
                 expenseStats[month].monthly += (e.montant || 0);
            }
        });

        const sortedMonths = Object.keys(expenseStats).sort();
        
        if (expenseChartInstance) expenseChartInstance.destroy();
        expenseChartInstance = new Chart(ctxExpense, {
            type: 'line',
            data: {
                labels: sortedMonths,
                datasets: [
                    {
                        label: 'Dépenses Mensuelles',
                        data: sortedMonths.map(m => expenseStats[m].monthly),
                        borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        fill: true, tension: 0.4
                    },
                    {
                        label: 'Dépenses Conteneurs',
                        data: sortedMonths.map(m => expenseStats[m].container),
                        borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        fill: true, tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                interaction: { mode: 'index', intersect: false },
                scales: { y: { beginAtZero: true } },
                plugins: { tooltip: { callbacks: { label: (c) => (c.dataset.label || '') + ': ' + formatCFA(c.parsed.y) } } }
            }
        });

        // 2. GRAPHIQUE CONTENEURS (Nombre et CA par mois)
        const containerGroups = {};
        transactions.forEach(t => {
            const cName = (t.conteneur && t.conteneur.trim().toUpperCase()) || "Non spécifié";
            if (cName === "Non spécifié") return;
            
            if (!containerGroups[cName]) containerGroups[cName] = { date: t.date, totalCA: 0 };
            // On prend la date la plus ancienne du conteneur pour déterminer son mois d'arrivée
            if (t.date && t.date < containerGroups[cName].date) containerGroups[cName].date = t.date;
            containerGroups[cName].totalCA += (t.prix || 0);
        });

        const containerStats = {};
        Object.values(containerGroups).forEach(c => {
            if (!c.date) return;
            const month = c.date.substring(0, 7);
            if (!containerStats[month]) containerStats[month] = { count: 0, ca: 0 };
            containerStats[month].count++;
            containerStats[month].ca += c.totalCA;
        });

        const sortedContainerMonths = Object.keys(containerStats).sort();

        if (containerChartInstance) containerChartInstance.destroy();
        containerChartInstance = new Chart(ctxContainer, {
            type: 'bar',
            data: {
                labels: sortedContainerMonths,
                datasets: [
                    {
                        label: 'Nombre de Conteneurs',
                        data: sortedContainerMonths.map(m => containerStats[m].count),
                        backgroundColor: '#10b981',
                        yAxisID: 'y',
                    },
                    {
                        label: "Chiffre d'Affaires",
                        data: sortedContainerMonths.map(m => containerStats[m].ca),
                        borderColor: '#f59e0b', type: 'line',
                        yAxisID: 'y1', tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                scales: {
                    y: { type: 'linear', display: true, position: 'left', beginAtZero: true, title: {display: true, text: 'Nombre'} },
                    y1: { type: 'linear', display: true, position: 'right', grid: {drawOnChartArea: false}, title: {display: true, text: 'Montant (CFA)'} }
                },
                plugins: { tooltip: { callbacks: { label: (c) => (c.dataset.label || '') + ': ' + (c.dataset.yAxisID === 'y1' ? formatCFA(c.parsed.y) : c.parsed.y) } } }
            }
        });

        // 3. GRAPHIQUE MODES DE PAIEMENT (Doughnut)
        const paymentStats = {};
        transactions.forEach(t => {
            // On privilégie l'historique des paiements s'il existe pour plus de précision
            if (t.paymentHistory && Array.isArray(t.paymentHistory) && t.paymentHistory.length > 0) {
                t.paymentHistory.forEach(p => {
                    const mode = p.modePaiement || 'Inconnu';
                    if (!paymentStats[mode]) paymentStats[mode] = 0;
                    paymentStats[mode] += (p.montantAbidjan || 0) + (p.montantParis || 0);
                });
            } else {
                // Fallback sur le mode principal
                const mode = t.modePaiement || 'Espèce';
                if (!paymentStats[mode]) paymentStats[mode] = 0;
                paymentStats[mode] += (t.montantAbidjan || 0) + (t.montantParis || 0);
            }
        });

        const sortedModes = Object.entries(paymentStats).sort((a, b) => b[1] - a[1]);

        if (paymentChartInstance) paymentChartInstance.destroy();
        paymentChartInstance = new Chart(ctxPayment, {
            type: 'doughnut',
            data: {
                labels: sortedModes.map(m => m[0]),
                datasets: [{
                    data: sortedModes.map(m => m[1]),
                    backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#64748b'],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'right' },
                    tooltip: { callbacks: { label: (c) => ' ' + c.label + ': ' + formatCFA(c.parsed) } }
                }
            }
        });

        // 4. GRAPHIQUE TOP 10 RENTABILITÉ CONTENEURS (Barres Horizontales)
        const contData = {};
        // Calcul CA
        transactions.forEach(t => {
            const cName = (t.conteneur && t.conteneur.trim().toUpperCase()) || "Non spécifié";
            if (cName === "Non spécifié") return;
            if (!contData[cName]) contData[cName] = { ca: 0, dep: 0 };
            contData[cName].ca += (t.prix || 0);
        });
        // Calcul Dépenses
        expenses.forEach(e => {
            if (e.action !== 'Allocation' && e.conteneur) {
                const cName = e.conteneur.trim().toUpperCase();
                if (contData[cName]) contData[cName].dep += (e.montant || 0);
            }
        });

        // Calcul Bénéfice et Tri
        const sortedContainers = Object.entries(contData)
            .map(([name, d]) => ({ name, benefice: d.ca - d.dep }))
            .sort((a, b) => b.benefice - a.benefice)
            .slice(0, 10); // Top 10

        if (profitChartInstance) profitChartInstance.destroy();
        profitChartInstance = new Chart(ctxProfit, {
            type: 'bar',
            data: {
                labels: sortedContainers.map(c => c.name),
                datasets: [{
                    label: 'Bénéfice Net',
                    data: sortedContainers.map(c => c.benefice),
                    backgroundColor: sortedContainers.map(c => c.benefice >= 0 ? '#10b981' : '#ef4444'),
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y', // Barres horizontales
                responsive: true,
                scales: { x: { beginAtZero: true } },
                plugins: {
                    tooltip: { callbacks: { label: (c) => ' Bénéfice: ' + formatCFA(c.parsed.x) } }
                }
            }
        });

        // 5. GRAPHIQUE DETTES VS ENCAISSÉ (Doughnut)
        let totalEncaisse = 0;
        let totalDette = 0;

        transactions.forEach(t => {
            totalEncaisse += (t.montantParis || 0) + (t.montantAbidjan || 0);
            if ((t.reste || 0) > 0) totalDette += t.reste;
        });

        if (debtChartInstance) debtChartInstance.destroy();
        debtChartInstance = new Chart(ctxDebt, {
            type: 'doughnut',
            data: {
                labels: ['Encaissé', 'Dettes Clients'],
                datasets: [{
                    data: [totalEncaisse, totalDette],
                    backgroundColor: ['#10b981', '#ef4444'],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'right' },
                    tooltip: { callbacks: { label: (c) => ' ' + c.label + ': ' + formatCFA(c.parsed) } }
                }
            }
        });

        // 6. GRAPHIQUE PERFORMANCE AGENT (Barres Verticales)
        const agentPerf = {};
        transactions.forEach(t => {
            const agentString = t.agent || "Non assigné";
            const agents = agentString.split(',').map(a => a.trim()).filter(a => a.length > 0);
            
            agents.forEach(a => {
                if (!agentPerf[a]) agentPerf[a] = 0;
                agentPerf[a] += (t.prix || 0);
            });
        });

        const sortedAgents = Object.entries(agentPerf).sort((a, b) => b[1] - a[1]).slice(0, 10); // Top 10

        if (agentChartInstance) agentChartInstance.destroy();
        agentChartInstance = new Chart(ctxAgent, {
            type: 'bar',
            data: {
                labels: sortedAgents.map(a => a[0]),
                datasets: [{
                    label: "Chiffre d'Affaires Généré",
                    data: sortedAgents.map(a => a[1]),
                    backgroundColor: '#6366f1',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                scales: { y: { beginAtZero: true } },
                plugins: {
                    tooltip: { callbacks: { label: (c) => ' CA: ' + formatCFA(c.parsed.y) } }
                }
            }
        });
    }

    // --- NOUVELLES ANALYSES STRATÉGIQUES ---
    function generateAdvancedAnalytics(filteredTransactions, fullHistory) {
        // 2. CALCUL BALANCE ÂGÉE (Sur TOUT l'historique, pas juste le filtré)
        const now = new Date();
        const buckets = { '0-30 jours': 0, '31-60 jours': 0, '61-90 jours': 0, '+90 jours': 0 };
        
        fullHistory.forEach(t => {
            if ((t.reste || 0) > 0 && t.date) {
                const d = new Date(t.date);
                const diffDays = Math.ceil(Math.abs(now - d) / (1000 * 60 * 60 * 24));
                if (diffDays <= 30) buckets['0-30 jours'] += t.reste;
                else if (diffDays <= 60) buckets['31-60 jours'] += t.reste;
                else if (diffDays <= 90) buckets['61-90 jours'] += t.reste;
                else buckets['+90 jours'] += t.reste;
            }
        });
        const agedBody = document.getElementById('agedBalanceBody');
        if(agedBody) {
            agedBody.innerHTML = '';
            Object.entries(buckets).forEach(([label, amount]) => {
                const color = label.includes('+90') ? '#ef4444' : (label.includes('61') ? '#f59e0b' : '#10b981');
                agedBody.innerHTML += `<tr><td>${label}</td><td style="font-weight:bold; color:${color}">${formatCFA(amount)}</td></tr>`;
            });
        }

        // 3. CALCUL DÉLAI MOYEN (Sur la sélection filtrée)
        let totalDays = 0, countLead = 0;
        filteredTransactions.forEach(t => {
            if (t.date && t.dateParis) {
                const diff = (new Date(t.date) - new Date(t.dateParis)) / (1000 * 60 * 60 * 24);
                if (diff > 0 && diff < 365) { totalDays += diff; countLead++; }
            }
        });
        const leadEl = document.getElementById('avgLeadTime');
        if(leadEl) leadEl.textContent = countLead > 0 ? `${Math.round(totalDays / countLead)} Jours` : '-';

        // 4. CLIENTS DORMANTS (Sur tout l'historique)
        const clientLast = {}, clientTotal = {};
        fullHistory.forEach(t => {
            const n = (t.nom||"").trim(); if(!n) return;
            if(!clientLast[n] || t.date > clientLast[n]) clientLast[n] = t.date;
            clientTotal[n] = (clientTotal[n]||0) + (t.prix||0);
        });
        const threshold = new Date(); threshold.setMonth(threshold.getMonth() - 3);
        const thresholdStr = threshold.toISOString().split('T')[0];
        
        const dormants = Object.entries(clientLast)
            .filter(([_, date]) => date < thresholdStr)
            .map(([name, date]) => ({ name, date, total: clientTotal[name] }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 20); // Top 20
            
        const dormantBody = document.getElementById('dormantClientsBody');
        if(dormantBody) {
            dormantBody.innerHTML = '';
            if(dormants.length === 0) dormantBody.innerHTML = '<tr><td colspan="3">Aucun client dormant.</td></tr>';
            else dormants.forEach(c => dormantBody.innerHTML += `<tr><td>${c.name}</td><td>${c.date}</td><td>${formatCFA(c.total)}</td></tr>`);
        }
    }

    // Listeners Firestore (avec filtres de suppression)
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

    startDateInput.addEventListener('change', updateDashboard);
    endDateInput.addEventListener('change', updateDashboard);
    clearFilterBtn.addEventListener('click', () => {
        startDateInput.value = ''; endDateInput.value = '';
        updateDashboard();
    });

    function formatCFA(number) {
        return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(number || 0);
    }
    // --- FONCTION POUR OUVRIR LE MODAL DÉTAILS CONTENEUR --- 
    function openContainerDetails(containerName) {
        const modal = document.getElementById('containerDetailsModal');
        const title = document.getElementById('modalContainerTitle');
        const tbody = document.getElementById('containerDetailsTableBody');
        
        // Titre du Modal
        title.textContent = `Détails Opérations : ${containerName}`;
        
        // Filtrer les transactions globales (allTransactions est déjà chargé en mémoire)
        // On filtre uniquement celles qui appartiennent au conteneur cliqué
        const transactions = allTransactions.filter(t => (t.conteneur && t.conteneur.trim().toUpperCase()) === containerName);
        
        // Filtrer les dépenses liées au conteneur
        const expenses = allExpenses.filter(e => (e.conteneur && e.conteneur.trim().toUpperCase()) === containerName);
        
        // Trier les transactions par date
        const sortedTransactions = transactions.map(t => ({...t, _type: 'transaction'})).sort((a, b) => new Date(b.date) - new Date(a.date));
        // Trier les dépenses par date
        const sortedExpenses = expenses.map(e => ({...e, _type: 'expense'})).sort((a, b) => new Date(b.date) - new Date(a.date));
        // Combiner : Transactions d'abord, Dépenses ensuite (en bas)
        const combined = [...sortedTransactions, ...sortedExpenses];

        tbody.innerHTML = '';
        
        let sumPrix = 0;
        let sumPayeAbj = 0;
        let sumPayePar = 0;
        let sumReste = 0;
        let sumDepenses = 0;

        if (combined.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7">Aucune opération trouvée pour ce conteneur.</td></tr>';
        } else {
            combined.forEach(item => {
                const row = document.createElement('tr');
                
                if (item._type === 'transaction') {
                    sumPrix += (item.prix || 0);
                    sumPayeAbj += (item.montantAbidjan || 0);
                    sumPayePar += (item.montantParis || 0);
                    sumReste += (item.reste || 0);

                    row.innerHTML = `
                        <td>${item.date}</td>
                        <td>${item.nomDestinataire || '-'}</td>
                        <td>${item.reference || ''}</td>
                        <td>${formatCFA(item.prix)}</td>
                        <td>${formatCFA(item.montantAbidjan)}</td>
                        <td>${formatCFA(item.montantParis)}</td>
                        <td class="${item.reste < 0 ? 'reste-negatif' : 'reste-positif'}">${formatCFA(item.reste)}</td>
                    `;
                } else {
                    sumDepenses += (item.montant || 0);
                    row.style.backgroundColor = '#fff1f2';
                    row.style.color = '#991b1b';
                    row.innerHTML = `
                        <td>${item.date}</td>
                        <td colspan="2">DÉPENSE : ${item.description}</td>
                        <td>-</td>
                        <td>-</td>
                        <td>-</td>
                        <td>-${formatCFA(item.montant)}</td>
                    `;
                }
                tbody.appendChild(row);
            });
        }

        // Mettre à jour le pied de page du tableau modal
        const elTotalPrix = document.getElementById('modalTotalPrix');
        const elTotalPayeAbj = document.getElementById('modalTotalPayeAbj');
        const elTotalPayePar = document.getElementById('modalTotalPayePar');
        const elTotalReste = document.getElementById('modalTotalReste');

        if(elTotalPrix) elTotalPrix.textContent = formatCFA(sumPrix);
        if(elTotalPayeAbj) elTotalPayeAbj.textContent = formatCFA(sumPayeAbj);
        if(elTotalPayePar) elTotalPayePar.textContent = formatCFA(sumPayePar);
        if(elTotalReste) elTotalReste.textContent = formatCFA(sumReste);

        if (sumDepenses > 0) {
            title.innerHTML = `Détails Opérations : ${containerName} <span style="font-size:0.6em; color:#dc3545; margin-left:10px;">(Dépenses: ${formatCFA(sumDepenses)})</span>`;
        }

        // Afficher le modal
        modal.style.display = 'block';
    }

    // --- GESTION FERMETURE MODAL ---
    const modalContainer = document.getElementById('containerDetailsModal');
    const closeBtn = document.getElementById('closeContainerModal');

    if(closeBtn) {
        closeBtn.addEventListener('click', () => {
            modalContainer.style.display = 'none';
        });
    }

    // Fermer si on clique en dehors du contenu du modal
    window.addEventListener('click', (event) => {
        if (event.target == modalContainer) {
            modalContainer.style.display = 'none';
        }
    });
    
});