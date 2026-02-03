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
        grandTotalBeneficeEl.className = totalBenefice < 0 ? 'reste-negatif' : 'reste-positif';
        
        document.getElementById('grandTotalPercu').textContent = formatCFA(totalEntreesAbidjan);
        if(grandTotalParisHiddenEl) grandTotalParisHiddenEl.textContent = `Total Ventes Perçues (P): ${formatCFA(totalEntreesParis)}`;

        grandTotalRetraitsEl.textContent = formatCFA(totalRetraits);
        grandTotalDepotsEl.textContent = formatCFA(totalDepots);
        
        grandTotalCaisseEl.textContent = formatCFA(totalCaisse);
        grandTotalCaisseEl.className = totalCaisse < 0 ? 'reste-negatif' : 'reste-positif';

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
            if (e.action !== 'Allocation' && e.type === 'Conteneur' && e.conteneur) {
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

        if (sortedContainers.length === 0 || (sortedContainers.length === 1 && sortedContainers[0] === "Non spécifié")) return;
        
        tbody.innerHTML = '';
        
        sortedContainers.forEach(container => {
            if (container === "Non spécifié") return; 
            const data = containerData[container];
            const ca = data.totalPrix; 
            const totalDepenseConteneur = containerExpenses[container] || 0;
            const beneficeConteneur = ca - totalDepenseConteneur;
            const totalPercu = data.totalParis + data.totalAbidjan;

            const row = document.createElement('tr');
            
            // --- C'EST ICI QUE ÇA CHANGE ---
            // On ajoute l'événement onclick
            row.onclick = () => openContainerDetails(container);
            row.title = "Cliquez pour voir le détail des opérations";
            // -------------------------------

            row.innerHTML = `
                <td data-label="Conteneur"><b>${container}</b></td>
                <td data-label="CA">${formatCFA(ca)}</td>
                <td data-label="Total Paris">${formatCFA(data.totalParis)}</td>
                <td data-label="Total Abidjan">${formatCFA(data.totalAbidjan)}</td>
                <td data-label="Total Perçu">${formatCFA(totalPercu)}</td>
                <td data-label="Total Reste" class="${data.totalReste < 0 ? 'reste-negatif' : 'reste-positif'}">${formatCFA(data.totalReste)}</td>
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
            if (!clientData[clientName]) clientData[clientName] = { totalPrix: 0, count: 0, destinataire: '' };
            clientData[clientName].totalPrix += (t.prix || 0);
            clientData[clientName].count++;
            if (!clientData[clientName].destinataire && t.nomDestinataire) clientData[clientName].destinataire = t.nomDestinataire;
        });
        const sortedClients = Object.entries(clientData).map(([name, data]) => ({ name, ...data })).sort((a, b) => b.totalPrix - a.totalPrix); 
        if (sortedClients.length === 0) return;

        // Mise à jour dynamique de l'en-tête pour ajouter "Destinataire"
        const table = topClientsTableBody.closest('table');
        if (table) {
            const theadRow = table.querySelector('thead tr');
            if (theadRow && theadRow.children.length === 4) {
                const th = document.createElement('th');
                th.textContent = 'Destinataire';
                theadRow.insertBefore(th, theadRow.children[2]); // Insérer après Client
            }
        }

        const top100Clients = sortedClients.slice(0, 100);
        topClientsTableBody.innerHTML = ''; 
        top100Clients.forEach((client, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `<td data-label="Rang"><b>#${index + 1}</b></td><td data-label="Client">${client.name}</td><td data-label="Destinataire">${client.destinataire || '-'}</td><td data-label="Nb. Op.">${client.count}</td><td data-label="Chiffre d'Affaires">${formatCFA(client.totalPrix)}</td>`;
            topClientsTableBody.appendChild(row);
        });
    }

    // --- NOUVELLES ANALYSES STRATÉGIQUES ---
    function generateAdvancedAnalytics(filteredTransactions, fullHistory) {
        // 1. Création du conteneur si inexistant
        let container = document.getElementById('analyticsContainer');
        if (!container) {
            const dashboards = document.querySelectorAll('.dashboard-container');
            const lastDashboard = dashboards[dashboards.length - 1];
            
            container = document.createElement('div');
            container.id = 'analyticsContainer';
            container.className = 'dashboard-container';
            container.style.marginTop = '20px';
            container.innerHTML = `
                <h2 style="margin-top:0;">📊 Analyses Stratégiques</h2>
                <div class="charts-grid" style="grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
                    <!-- Balance Âgée -->
                    <div class="chart-card">
                        <h3>⏳ Balance Âgée (Dettes)</h3>
                        <table class="table">
                            <thead><tr><th>Ancienneté</th><th>Reste à Payer</th></tr></thead>
                            <tbody id="agedBalanceBody"></tbody>
                        </table>
                    </div>
                    
                    <!-- Performance Logistique -->
                    <div class="chart-card">
                        <h3>✈️ Performance Logistique</h3>
                        <div style="text-align:center; padding: 20px;">
                            <div style="font-size: 12px; color: #64748b;">Délai Moyen (Paris -> Abidjan)</div>
                            <div id="avgLeadTime" style="font-size: 32px; font-weight: bold; color: #4f46e5;">-</div>
                            <div style="font-size: 11px; color: #64748b; margin-top:5px;">Basé sur les dates réelles</div>
                        </div>
                    </div>

                    <!-- Clients Dormants -->
                    <div class="chart-card" style="grid-column: span 2;">
                        <h3>💤 Clients à Relancer (Inactifs > 3 mois)</h3>
                        <div style="max-height: 200px; overflow-y: auto;">
                            <table class="table">
                                <thead><tr><th>Client</th><th>Dernier Envoi</th><th>CA Perdu Potentiel</th></tr></thead>
                                <tbody id="dormantClientsBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
            if(lastDashboard && lastDashboard.parentNode) lastDashboard.parentNode.insertBefore(container, lastDashboard.nextSibling);
            else document.body.appendChild(container);
        }

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
        const details = allTransactions.filter(t => t.conteneur === containerName);
        
        // Trier par date (plus récent en haut)
        details.sort((a, b) => new Date(b.date) - new Date(a.date));

        tbody.innerHTML = '';
        
        let sumPrix = 0;
        let sumPaye = 0;
        let sumReste = 0;

        if (details.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6">Aucune opération trouvée pour ce conteneur.</td></tr>';
        } else {
            details.forEach(t => {
                const payeTotal = (t.montantAbidjan || 0) + (t.montantParis || 0);
                sumPrix += (t.prix || 0);
                sumPaye += payeTotal;
                sumReste += (t.reste || 0);

                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${t.date}</td>
                    <td>${t.nom || 'Inconnu'}</td>
                    <td>${t.article || ''}</td>
                    <td>${formatCFA(t.prix)}</td>
                    <td>${formatCFA(payeTotal)}</td>
                    <td class="${t.reste < 0 ? 'reste-negatif' : 'reste-positif'}">${formatCFA(t.reste)}</td>
                `;
                tbody.appendChild(row);
            });
        }

        // Mettre à jour le pied de page du tableau modal
        document.getElementById('modalTotalPrix').textContent = formatCFA(sumPrix);
        document.getElementById('modalTotalPaye').textContent = formatCFA(sumPaye);
        document.getElementById('modalTotalReste').textContent = formatCFA(sumReste);

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