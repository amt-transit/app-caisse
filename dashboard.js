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
            const containerName = t.conteneur || "Non spécifié"; 
            if (!containerData[containerName]) containerData[containerName] = { totalPrix: 0, totalParis: 0, totalAbidjan: 0, totalReste: 0 };
            const data = containerData[containerName];
            data.totalPrix += (t.prix || 0);
            data.totalParis += (t.montantParis || 0);
            data.totalAbidjan += (t.montantAbidjan || 0);
            data.totalReste += (t.reste || 0);
        });

        const containerExpenses = {};
        expenses.forEach(e => {
            // On inclut la dépense si elle est liée à un conteneur (peu importe le type déclaré)
            if (e.action !== 'Allocation' && e.conteneur) {
                const cName = e.conteneur;
                if (!containerExpenses[cName]) containerExpenses[cName] = 0;
                containerExpenses[cName] += (e.montant || 0);
            }
        });

        // FUSION DES LISTES : On prend les conteneurs des Transactions ET des Dépenses
        const allContainers = new Set([...Object.keys(containerData), ...Object.keys(containerExpenses)]);

        const sortedContainers = Array.from(allContainers).sort((a, b) => {
            const numA = parseInt(a.replace(/[^0-9]/g, ''), 10) || 0;
            const numB = parseInt(b.replace(/[^0-9]/g, ''), 10) || 0;
            return numB - numA;
        });

        if (sortedContainers.length === 0 || (sortedContainers.length === 1 && sortedContainers[0] === "Non spécifié")) return;
        
        tbody.innerHTML = '';
        
        sortedContainers.forEach(container => {
            if (container === "Non spécifié") return; 
            
            // On récupère les données transactionnelles (ou des zéros si le conteneur n'existe que dans les dépenses)
            const data = containerData[container] || { totalPrix: 0, totalParis: 0, totalAbidjan: 0, totalReste: 0 };
            const ca = data.totalPrix; 
            const totalDepenseConteneur = containerExpenses[container] || 0;
            const beneficeConteneur = ca - totalDepenseConteneur;
            const totalPercu = data.totalParis + data.totalAbidjan;

            // Calcul des pourcentages par rapport au CA
            const percParis = ca > 0 ? ((data.totalParis / ca) * 100).toFixed(1) : "0.0";
            const percAbidjan = ca > 0 ? ((data.totalAbidjan / ca) * 100).toFixed(1) : "0.0";
            const percReste = ca > 0 ? ((data.totalReste / ca) * 100).toFixed(1) : "0.0";

            const row = document.createElement('tr');
            
            // --- C'EST ICI QUE ÇA CHANGE ---
            // On ajoute l'événement onclick
            row.onclick = () => openContainerDetails(container);
            row.title = "Cliquez pour voir le détail des opérations";
            // -------------------------------

            row.innerHTML = `
                <td data-label="Conteneur"><b>${container}</b></td>
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
        const transactions = allTransactions.filter(t => t.conteneur === containerName);
        
        // Filtrer les dépenses liées au conteneur
        const expenses = allExpenses.filter(e => e.conteneur === containerName);
        
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