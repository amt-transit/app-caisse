document.addEventListener('DOMContentLoaded', async () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: Connexion BDD échouée."); return;
    }

    // SERVICE TRANSACTION (Injecté localement car non chargé via HTML)
    const transactionService = {
        getCleanTransactions(transactions, validatedSessions) {
            return transactions.reduce((acc, t) => {
                if (!t.paymentHistory || !Array.isArray(t.paymentHistory) || t.paymentHistory.length === 0) {
                    acc.push(t);
                    return acc;
                }
                const validPayments = t.paymentHistory.filter(p => !p.sessionId || validatedSessions.has(p.sessionId));
                const newParis = validPayments.reduce((sum, p) => sum + (p.montantParis || 0), 0);
                const newAbidjan = validPayments.reduce((sum, p) => sum + (p.montantAbidjan || 0), 0);
                const tClean = {
                    ...t,
                    paymentHistory: validPayments,
                    montantParis: newParis,
                    montantAbidjan: newAbidjan,
                    reste: (newParis + newAbidjan) - (t.prix || 0)
                };
                acc.push(tClean);
                return acc;
            }, []);
        },
        async calculateAvailableBalance(db, unconfirmedSessions) {
            const transSnap = await db.collection("transactions").where("isDeleted", "!=", true).limit(2000).get();
            let totalVentes = 0;
            transSnap.forEach(doc => {
                const d = doc.data();
                if (d.paymentHistory && d.paymentHistory.length > 0) {
                    d.paymentHistory.forEach(pay => {
                        if (pay.sessionId && unconfirmedSessions.has(pay.sessionId)) return;
                        if (pay.modePaiement !== 'Chèque' && pay.modePaiement !== 'Virement') {
                            totalVentes += (pay.montantAbidjan || 0);
                        }
                    });
                } else {
                    if (d.modePaiement !== 'Chèque' && d.modePaiement !== 'Virement') {
                        totalVentes += (d.montantAbidjan || 0);
                    }
                }
            });
            const incSnap = await db.collection("other_income").where("isDeleted", "!=", true).limit(1000).get();
            let totalAutres = 0;
            incSnap.forEach(doc => {
                const d = doc.data();
                if (d.mode !== 'Virement' && d.mode !== 'Chèque') {
                    totalAutres += (d.montant || 0);
                }
            });
            const expSnap = await db.collection("expenses").where("isDeleted", "!=", true).limit(1000).get();
            let totalDepenses = 0;
            expSnap.forEach(doc => {
                const d = doc.data();
                if (d.sessionId && unconfirmedSessions.has(d.sessionId)) return;
                if (d.mode !== 'Virement' && d.mode !== 'Chèque') {
                    totalDepenses += (d.montant || 0);
                }
            });
            const bankSnap = await db.collection("bank_movements").where("isDeleted", "!=", true).limit(1000).get();
            let totalRetraits = 0;
            let totalDepots = 0;
            bankSnap.forEach(doc => {
                const d = doc.data();
                if (d.type === 'Retrait') totalRetraits += (d.montant || 0);
                if (d.type === 'Depot' && d.source !== 'Remise Chèques') totalDepots += (d.montant || 0);
            });
            return (totalVentes + totalAutres + totalRetraits) - (totalDepenses + totalDepots);
        },
        calculateStorageFee(dateString, quantity = 1, compareDate = new Date()) {
            if (!dateString) return { days: 0, fee: 0 };
            const qte = parseInt(quantity) || 1;
            const arrivalDate = new Date(dateString);
            const diffTime = compareDate - arrivalDate;
            if (diffTime < 0) return { days: 0, fee: 0 };
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays <= 7) return { days: diffDays, fee: 0 };
            else if (diffDays <= 14) return { days: diffDays, fee: 10000 };
            else {
                const extraDays = diffDays - 14;
                const unitFee = 10000 + (extraDays * 1000);
                return { days: diffDays, fee: unitFee * qte };
            }
        }
    };

    // --- 1. DOM ELEMENTS & CONFIG ---
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    const clearFilterBtn = document.getElementById('clearFilterBtn');
    
    // Tableaux
    const containerSummaryBody = document.getElementById('containerSummaryTableBody');
    const topClientsBody = document.getElementById('topClientsTableBody');
    const agentSummaryBody = document.getElementById('agentSummaryTableBody');
    const monthlySummaryBody = document.getElementById('summaryTableBody');
    const monthlyExpensesBody = document.getElementById('monthlyExpensesTableBody');
    const bankMovementsBody = document.getElementById('bankMovementsTableBody');
    const unpaidBody = document.getElementById('unpaidTableBody');
    const adjustmentsBody = document.getElementById('adjustmentsTableBody');

    // Totaux Généraux (Cartes)
    const els = {
        percu: document.getElementById('grandTotalPercu'),
        parisHidden: document.getElementById('grandTotalParisHidden'),
        other: document.getElementById('grandTotalOtherIncome'),
        depenses: document.getElementById('grandTotalDepenses'),
        benefice: document.getElementById('grandTotalBenefice'),
        caisse: document.getElementById('grandTotalCaisse'),
        banque: document.getElementById('grandTotalSoldeBanque'),
        cheques: document.getElementById('grandTotalCheques'),
        virements: document.getElementById('grandTotalVirements'),
        count: document.getElementById('grandTotalCount'),
        reste: document.getElementById('grandTotalReste'),
        depContainer: document.getElementById('detailDepensesConteneur'),
        depMensuelle: document.getElementById('detailDepensesMensuelles')
    };

    // Gestion Rôle Saisie Full (Masquage)
    const userRole = sessionStorage.getItem('userRole');
    if (userRole === 'saisie_full') {
        document.querySelectorAll('.total-card, canvas, #summaryTableBody, #agentSummaryTableBody, #monthlyExpensesTableBody, #bankMovementsTableBody, #agedBalanceBody, #dormantClientsBody, #avgLeadTime').forEach(el => {
            const container = el.closest('.card') || el.closest('.chart-card') || el.closest('section') || el.parentElement;
            if (container) container.style.display = 'none';
        });
    }

    // --- 2. STATE MANAGEMENT ---
    let allTransactions = [];
    let allExpenses = [];
    let allOtherIncome = [];
    let allBankMovements = [];
    let validatedSessions = new Set(); // LISTE BLANCHE : IDs des sessions validées
    
    // Instances Graphiques
    let charts = {}; 

    // --- 3. CORE LOGIC : NETTOYAGE & SÉCURITÉ ---

    // Utilisation du service centralisé
    function getCleanTransactions(transactions) {
        return transactionService.getCleanTransactions(transactions, validatedSessions);
    }

    function updateDashboard() {
        // 1. Préparation des données "Propres" (Validées uniquement)
        const cleanTransactions = getCleanTransactions(allTransactions);
        const cleanExpenses = allExpenses.filter(e => !e.sessionId || validatedSessions.has(e.sessionId));

        // 2. Filtrage par Date (Interface)
        const start = startDateInput.value;
        const end = endDateInput.value;
        
        const filteredTrans = filterByDate(cleanTransactions, start, end);
        const filteredExp = filterByDate(cleanExpenses, start, end);
        const filteredInc = filterByDate(allOtherIncome, start, end);
        const filteredBank = filterByDate(allBankMovements, start, end);

        // 3. Exécution des calculs et affichages
        calculateTotals(filteredTrans, filteredExp, filteredInc, filteredBank);
        
        // Tableaux
        renderContainerSummary(filteredTrans, filteredExp);
        renderTopClients(filteredTrans);
        renderAgentSummary(filteredTrans);
        renderMonthlySales(filteredTrans);
        renderMonthlyExpenses(filteredExp);
        renderBankMovements(filteredBank);
        renderUnpaid(cleanTransactions); // Dettes (sur tout l'historique propre)
        renderAdjustments(filteredTrans);
        
        // Graphiques & Analyses
        renderCharts(cleanTransactions, cleanExpenses);
        renderAdvancedAnalytics(cleanTransactions);
    }

    function filterByDate(items, start, end) {
        if (!start && !end) return items;
        return items.filter(item => {
            // Date principale
            if ((!start || item.date >= start) && (!end || item.date <= end)) return true;
            // Date de paiement (pour les transactions)
            if (item.paymentHistory) {
                return item.paymentHistory.some(p => (!start || p.date >= start) && (!end || p.date <= end));
            }
            return false;
        });
    }

    // --- 4. CALCULS FINANCIERS ---

    function calculateTotals(transactions, expenses, incomes, bank) {
        // A. Recettes (Basées sur les paiements effectifs dans la période)
        let totalAbidjan = 0, totalParis = 0, totalCheques = 0, totalVirements = 0;
        let totalVentesCash = 0; // Pour la caisse physique

        transactions.forEach(t => {
            const payments = t.paymentHistory || [{ ...t, date: t.date }]; // Fallback legacy
            payments.forEach(p => {
                if (isInDateRange(p.date)) {
                    totalAbidjan += (p.montantAbidjan || 0);
                    totalParis += (p.montantParis || 0);

                    // Ventilation par mode
                    const mode = p.modePaiement || t.modePaiement || 'Espèce';
                    if (mode === 'Espèce') totalVentesCash += (p.montantAbidjan || 0);
                    if (mode === 'Chèque' && p.checkStatus === 'Pending') totalCheques += (p.montantAbidjan || 0);
                    if (mode === 'Virement') totalVirements += ((p.montantAbidjan || 0) + (p.montantParis || 0));
                }
            });
        });

        // B. Autres Entrées
        const totalOther = incomes.reduce((sum, i) => sum + (i.montant || 0), 0);
        const totalOtherCash = incomes.filter(i => i.mode !== 'Chèque' && i.mode !== 'Virement').reduce((sum, i) => sum + (i.montant || 0), 0);

        // C. Dépenses
        const realExpenses = expenses.filter(e => e.action !== 'Allocation'); // On exclut les recharges budget
        const totalDep = realExpenses.reduce((sum, e) => sum + (e.montant || 0), 0);
        const totalDepCash = realExpenses.filter(e => e.mode !== 'Chèque' && e.mode !== 'Virement').reduce((sum, e) => sum + (e.montant || 0), 0);

        // Détail Dépenses
        const depConteneur = realExpenses.filter(e => e.type === 'Conteneur' || e.conteneur).reduce((sum, e) => sum + e.montant, 0);
        const depMensuelle = totalDep - depConteneur;

        // D. Banque
        const retraits = bank.filter(m => m.type === 'Retrait').reduce((sum, m) => sum + m.montant, 0);
        const depots = bank.filter(m => m.type === 'Depot' && m.source !== 'Remise Chèques').reduce((sum, m) => sum + m.montant, 0); // On exclut remises chèques du flux caisse
        const depotsAll = bank.filter(m => m.type === 'Depot').reduce((sum, m) => sum + m.montant, 0);
        
        // E. Soldes
        const benefice = (totalAbidjan + totalOther) - totalDep;
        // Solde Caisse = (Ventes Cash + Autres Cash + Retraits Banque) - (Dépenses Cash + Dépôts Espèces Banque)
        const soldeCaisse = (totalVentesCash + totalOtherCash + retraits) - (totalDepCash + depots);
        // Solde Banque = (Dépôts Totaux + Virements Reçus) - Retraits
        const soldeBanque = (depotsAll + totalVirements) - retraits;
        
        const resteTotal = transactions.reduce((sum, t) => sum + (t.reste || 0), 0);

        // F. Affichage
        if(els.percu) els.percu.textContent = formatCFA(totalAbidjan);
        if(els.parisHidden) els.parisHidden.textContent = `Dont Paris: ${formatCFA(totalParis)}`;
        if(els.other) els.other.textContent = formatCFA(totalOther);
        if(els.depenses) els.depenses.textContent = formatCFA(totalDep);
        if(els.benefice) {
            els.benefice.textContent = formatCFA(benefice);
            els.benefice.parentElement.className = `total-card ${benefice >= 0 ? 'card-positif' : 'card-negatif'}`;
        }
        if(els.caisse) els.caisse.textContent = formatCFA(soldeCaisse);
        if(els.banque) els.banque.textContent = formatCFA(soldeBanque);
        if(els.cheques) els.cheques.textContent = formatCFA(totalCheques);
        if(els.virements) els.virements.textContent = formatCFA(totalVirements);
        if(els.count) els.count.textContent = transactions.length;
        if(els.reste) els.reste.textContent = formatCFA(resteTotal);
        if(els.depContainer) els.depContainer.textContent = `Conteneurs: ${formatCFA(depConteneur)}`;
        if(els.depMensuelle) els.depMensuelle.textContent = `Mensuelles: ${formatCFA(depMensuelle)}`;
    }

    function isInDateRange(dateStr) {
        const start = startDateInput.value;
        const end = endDateInput.value;
        return (!start || dateStr >= start) && (!end || dateStr <= end);
    }

    // --- 5. RENDUS TABLEAUX ---

    function renderContainerSummary(transactions, expenses) {
        if (!containerSummaryBody) return;
        containerSummaryBody.innerHTML = '<tr><td colspan="5">Calcul en cours...</td></tr>';

        const months = {};
        const getMonthKey = (dateStr) => dateStr ? dateStr.substring(0, 7) : '0000-00';
        const getMonthLabel = (dateStr) => {
            if(!dateStr) return 'Indéfini';
            const d = new Date(dateStr);
            return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase());
        };

        // 1. Agréger Transactions
        transactions.forEach(t => {
            const mKey = getMonthKey(t.date);
            const mLabel = getMonthLabel(t.date);
            const cName = (t.conteneur || "Non spécifié").trim().toUpperCase();

            if (!months[mKey]) months[mKey] = { key: mKey, label: mLabel, containers: {}, stats: { ca: 0, dep: 0, count: 0 } };
            if (!months[mKey].containers[cName]) {
                months[mKey].containers[cName] = { name: cName, ca: 0, paris: 0, abidjan: 0, reste: 0, count: 0, unpaid: 0, dep: 0 };
            }
            
            const c = months[mKey].containers[cName];
            c.ca += (t.prix || 0);
            c.paris += (t.montantParis || 0);
            c.abidjan += (t.montantAbidjan || 0);
            c.reste += (t.reste || 0);
            c.count++;
            if ((t.reste || 0) < -1) c.unpaid++;

            months[mKey].stats.ca += (t.prix || 0);
        });

        // 2. Agréger Dépenses
        expenses.forEach(e => {
            if (e.type === 'Conteneur' || e.conteneur) {
                const mKey = getMonthKey(e.date);
                const mLabel = getMonthLabel(e.date);
                const cName = (e.conteneur || "Non spécifié").trim().toUpperCase();

                if (!months[mKey]) months[mKey] = { key: mKey, label: mLabel, containers: {}, stats: { ca: 0, dep: 0, count: 0 } };
                if (!months[mKey].containers[cName]) {
                    months[mKey].containers[cName] = { name: cName, ca: 0, paris: 0, abidjan: 0, reste: 0, count: 0, unpaid: 0, dep: 0 };
                }
                
                months[mKey].containers[cName].dep += (e.montant || 0);
                months[mKey].stats.dep += (e.montant || 0);
            }
        });

        // 3. Affichage
        const sortedMonths = Object.values(months).sort((a, b) => b.key.localeCompare(a.key));
        
        containerSummaryBody.innerHTML = '';
        if (sortedMonths.length === 0) { containerSummaryBody.innerHTML = '<tr><td colspan="5">Aucune donnée.</td></tr>'; return; }

        sortedMonths.forEach(m => {
            const benef = m.stats.ca - m.stats.dep;
            const nbConteneurs = Object.keys(m.containers).length;
            
            // Calcul Pourcentages
            const pctDep = m.stats.ca ? Math.round((m.stats.dep / m.stats.ca) * 100) : 0;
            const pctBen = m.stats.ca ? Math.round((benef / m.stats.ca) * 100) : 0;

            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';
            tr.onclick = () => openMonthDetails(m.key);
            tr.title = "Cliquez pour voir les détails du mois";
            
            tr.innerHTML = `
                <td><b>${m.label}</b></td>
                <td><span class="tag" style="background:#64748b;">${nbConteneurs} Conteneurs</span></td>
                <td>${formatCFA(m.stats.ca)}</td>
                <td style="color:#ef4444;">${formatCFA(m.stats.dep)} <span style="font-size:0.8em">(${pctDep}%)</span></td>
                <td style="font-weight:bold; color:${benef >= 0 ? '#10b981' : '#ef4444'}">${formatCFA(benef)} <span style="font-size:0.8em">(${pctBen}%)</span></td>
            `;
            containerSummaryBody.appendChild(tr);
        });
        
        window.monthlyData = months;
    }

    // --- 7b. MODAL DÉTAILS MOIS ---
    window.openMonthDetails = function(monthKey) {
        const m = window.monthlyData && window.monthlyData[monthKey];
        if (!m) return;
        
        const modal = document.getElementById('monthDetailsModal');
        const title = document.getElementById('modalMonthTitle');
        const tbody = document.getElementById('modalMonthBody');
        
        title.textContent = `Détails du Mois : ${m.label}`;
        tbody.innerHTML = '';
        
        Object.values(m.containers).sort((a, b) => a.name.localeCompare(b.name)).forEach(c => {
            const benef = c.ca - c.dep;
            const percu = c.paris + c.abidjan;
            
            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';
            tr.onclick = () => openContainerDetails(c.name); // Ouvre le modal détails conteneur (existant)
            
            tr.innerHTML = `
                <td><b>${c.name}</b></td>
                <td>${c.count}</td>
                <td style="color:${c.unpaid > 0 ? 'red' : 'green'}">${c.unpaid}</td>
                <td>${formatCFA(c.ca)}</td>
                <td>${formatCFA(c.paris)}</td>
                <td>${formatCFA(c.abidjan)}</td>
                <td style="font-weight:bold">${formatCFA(percu)}</td>
                <td class="${c.reste < 0 ? 'reste-negatif' : 'reste-positif'}">${formatCFA(c.reste)}</td>
                <td>${formatCFA(c.dep)}</td>
                <td class="${benef < 0 ? 'reste-negatif' : 'reste-positif'}"><b>${formatCFA(benef)}</b></td>
            `;
            tbody.appendChild(tr);
        });
        
        modal.style.display = 'flex';
    }

    function renderTopClients(transactions) {
        if (!topClientsBody) return;
        const clients = {};
        transactions.forEach(t => {
            const name = t.nom || "Inconnu";
            if (!clients[name]) clients[name] = { count: 0, ca: 0, dest: t.nomDestinataire || '' };
            clients[name].count++;
            clients[name].ca += (t.prix || 0);
        });

        const sorted = Object.entries(clients).sort((a, b) => b[1].ca - a[1].ca).slice(0, 100);
        topClientsBody.innerHTML = sorted.map(([name, d], i) => `
            <tr><td>#${i+1}</td><td>${name}</td><td>${d.dest}</td><td>${d.count}</td><td>${formatCFA(d.ca)}</td></tr>
        `).join('');
    }

    function renderAgentSummary(transactions) {
        if (!agentSummaryBody) return;
        const agents = {};
        transactions.forEach(t => {
            if (!t.agent) return;
            t.agent.split(',').forEach(a => {
                const name = a.trim();
                if (!agents[name]) agents[name] = { count: 0, ca: 0 };
                agents[name].count++;
                // Attribution CA : Si agent Paris -> Montant Paris, sinon Abidjan
                if (name.toLowerCase().includes('paris')) agents[name].ca += (t.montantParis || 0);
                else agents[name].ca += (t.montantAbidjan || 0);
            });
        });
        const sorted = Object.entries(agents).sort((a, b) => b[1].ca - a[1].ca);
        agentSummaryBody.innerHTML = sorted.map(([n, d]) => `<tr><td>${n}</td><td>${d.count}</td><td>${formatCFA(d.ca)}</td></tr>`).join('');
    }

    function renderMonthlySales(transactions) {
        if (!monthlySummaryBody) return;
        const months = {};
        transactions.forEach(t => {
            const m = t.date.substring(0, 7);
            if (!months[m]) months[m] = { count: 0, ca: 0 };
            months[m].count++;
            months[m].ca += (t.prix || 0);
        });
        const sorted = Object.entries(months).sort((a, b) => b[0].localeCompare(a[0]));
        monthlySummaryBody.innerHTML = sorted.map(([m, d]) => `<tr><td>${m}</td><td>${d.count}</td><td>${formatCFA(d.ca)}</td></tr>`).join('');
    }

    function renderMonthlyExpenses(expenses) {
        if (!monthlyExpensesBody) return;
        const monthly = expenses.filter(e => e.type === 'Mensuelle' && e.action !== 'Allocation');
        monthly.sort((a, b) => new Date(b.date) - new Date(a.date));
        monthlyExpensesBody.innerHTML = monthly.map(e => `<tr><td>${e.date}</td><td>${e.description}</td><td>${formatCFA(e.montant)}</td></tr>`).join('');
    }

    function renderBankMovements(movements) {
        if (!bankMovementsBody) return;
        const sorted = movements.sort((a, b) => new Date(b.date) - new Date(a.date));
        bankMovementsBody.innerHTML = sorted.map(m => `
            <tr><td>${m.date}</td><td>${m.description}</td><td>${m.type}</td><td class="${m.type==='Depot'?'reste-negatif':'reste-positif'}">${formatCFA(m.montant)}</td></tr>
        `).join('');
    }

    function renderUnpaid(transactions) {
        if (!unpaidBody) return;
        // Filtre : Reste < -1 (Dette réelle)
        const unpaid = transactions.filter(t => (t.reste || 0) < -1);
        unpaid.sort((a, b) => a.reste - b.reste); // Plus grosse dette en premier (car négatif)

        unpaidBody.innerHTML = unpaid.map(t => {
            const paid = (t.montantParis || 0) + (t.montantAbidjan || 0);
            const waLink = `https://wa.me/?text=${encodeURIComponent(`Bonjour ${t.nom}, solde restant pour ${t.reference}: ${formatCFA(Math.abs(t.reste))}`)}`;
            return `
                <tr>
                    <td>${t.date}</td><td>${t.conteneur}</td><td><b>${t.reference}</b></td>
                    <td>${t.nom}<br><small>${t.nomDestinataire||''}</small></td>
                    <td>${formatCFA(t.prix)}</td><td>${formatCFA(paid)}</td>
                    <td class="reste-negatif"><b>${formatCFA(t.reste)}</b></td>
                    <td><a href="${waLink}" target="_blank" style="color:green;text-decoration:none;">📱 Relancer</a></td>
                </tr>
            `;
        }).join('');
    }

    function renderAdjustments(transactions) {
        if (!adjustmentsBody) return;
        const adj = transactions.filter(t => t.adjustmentVal > 0);
        adjustmentsBody.innerHTML = adj.map(t => `
            <tr>
                <td>${t.date}</td><td>${t.nom}</td><td>${t.reference}</td>
                <td><span class="tag" style="background:${t.adjustmentType==='reduction'?'#10b981':'#ef4444'}">${t.adjustmentType}</span></td>
                <td>${formatCFA(t.adjustmentVal)}</td>
            </tr>
        `).join('');
    }

    // --- 6. GRAPHIQUES & ANALYSES ---

    function renderCharts(transactions, expenses) {
        if (userRole === 'saisie_full') return;
        
        // Exemple : Graphique Dépenses vs Conteneurs
        const ctx = document.getElementById('expenseEvolutionChart');
        if (ctx) {
            if (charts.expense) charts.expense.destroy();
            
            const months = {};
            expenses.forEach(e => {
                const m = e.date.substring(0, 7);
                if (!months[m]) months[m] = { mens: 0, cont: 0 };
                if (e.type === 'Conteneur') months[m].cont += e.montant;
                else if (e.action !== 'Allocation') months[m].mens += e.montant;
            });
            const labels = Object.keys(months).sort();
            
            charts.expense = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        { label: 'Mensuelles', data: labels.map(l => months[l].mens), borderColor: '#ef4444', fill: false },
                        { label: 'Conteneurs', data: labels.map(l => months[l].cont), borderColor: '#3b82f6', fill: false }
                    ]
                }
            });
        }
        // ... (Ajouter les autres graphiques ici si nécessaire, même logique)
    }

    function renderAdvancedAnalytics(transactions) {
        // Balance Agée
        const now = new Date();
        const buckets = { '0-30j': 0, '31-60j': 0, '61-90j': 0, '+90j': 0 };
        transactions.forEach(t => {
            if ((t.reste || 0) < -1) {
                const days = (now - new Date(t.date)) / (1000 * 60 * 60 * 24);
                if (days <= 30) buckets['0-30j'] += t.reste;
                else if (days <= 60) buckets['31-60j'] += t.reste;
                else if (days <= 90) buckets['61-90j'] += t.reste;
                else buckets['+90j'] += t.reste;
            }
        });
        const agedBody = document.getElementById('agedBalanceBody');
        if (agedBody) {
            agedBody.innerHTML = Object.entries(buckets).map(([k, v]) => `<tr><td>${k}</td><td class="reste-negatif">${formatCFA(v)}</td></tr>`).join('');
        }
    }

    // --- 7. MODAL DÉTAILS CONTENEUR ---
    window.openContainerDetails = function(containerName) {
        const modal = document.getElementById('containerDetailsModal');
        const tbody = document.getElementById('containerDetailsTableBody');
        const title = document.getElementById('modalContainerTitle');
        
        title.textContent = `Détails : ${containerName}`;
        tbody.innerHTML = '';

        // Récupérer les données propres
        const cleanTrans = getCleanTransactions(allTransactions).filter(t => t.conteneur === containerName);
        const cleanExp = allExpenses.filter(e => e.conteneur === containerName && (!e.sessionId || validatedSessions.has(e.sessionId)));

        let totalPrix = 0, totalAbj = 0, totalPar = 0, totalReste = 0;

        cleanTrans.forEach(t => {
            totalPrix += (t.prix || 0);
            totalAbj += (t.montantAbidjan || 0);
            totalPar += (t.montantParis || 0);
            totalReste += (t.reste || 0);

            const pctAbj = t.prix ? Math.round((t.montantAbidjan / t.prix) * 100) : 0;
            const pctPar = t.prix ? Math.round((t.montantParis / t.prix) * 100) : 0;
            const pctReste = t.prix ? Math.round((t.reste / t.prix) * 100) : 0;

            tbody.innerHTML += `
                <tr>
                    <td>${t.date}</td>
                    <td>${t.nom} <small>(${t.reference})</small></td>
                    <td>${t.reference}</td>
                    <td>${formatCFA(t.prix)}</td>
                    <td>${formatCFA(t.montantAbidjan)} <span style="font-size:0.8em; color:#d97706;">(${pctAbj}%)</span></td>
                    <td>${formatCFA(t.montantParis)} <span style="font-size:0.8em; color:#2563eb;">(${pctPar}%)</span></td>
                    <td class="${t.reste < 0 ? 'reste-negatif' : 'reste-positif'}">${formatCFA(t.reste)} <span style="font-size:0.8em; color:#64748b;">(${pctReste}%)</span></td>
                </tr>
            `;
        });

        cleanExp.forEach(e => {
            tbody.innerHTML += `
                <tr style="background:#fff1f2; color:#991b1b;">
                    <td>${e.date}</td>
                    <td colspan="2">DÉPENSE : ${e.description}</td>
                    <td>-</td><td>-</td><td>-</td>
                    <td>-${formatCFA(e.montant)}</td>
                </tr>
            `;
        });

        // Totaux En-tête Modal
        const totalDep = cleanExp.reduce((sum, e) => sum + (e.montant || 0), 0);
        const benefice = totalPrix - totalDep;

        // Calcul Pourcentages Totaux
        const pctAbjTotal = totalPrix ? Math.round((totalAbj / totalPrix) * 100) : 0;
        const pctParTotal = totalPrix ? Math.round((totalPar / totalPrix) * 100) : 0;
        const pctResteTotal = totalPrix ? Math.round((totalReste / totalPrix) * 100) : 0;

        document.getElementById('topTotalPrix').textContent = formatCFA(totalPrix);
        document.getElementById('topTotalPayeAbj').innerHTML = `${formatCFA(totalAbj)} <span style="font-size:0.8em">(${pctAbjTotal}%)</span>`;
        document.getElementById('topTotalPayePar').innerHTML = `${formatCFA(totalPar)} <span style="font-size:0.8em">(${pctParTotal}%)</span>`;
        document.getElementById('topTotalReste').innerHTML = `${formatCFA(totalReste)} <span style="font-size:0.8em">(${pctResteTotal}%)</span>`;
        document.getElementById('topTotalDep').textContent = formatCFA(totalDep);
        document.getElementById('topTotalBen').textContent = formatCFA(benefice);
        document.getElementById('topTotalBen').style.color = benefice >= 0 ? '#10b981' : '#ef4444';

        // Gestion Export Excel Modal
        const btnExcel = document.getElementById('downloadContainerExcelBtn');
        if(btnExcel) {
            btnExcel.onclick = () => {
                const wb = XLSX.utils.table_to_book(document.getElementById('containerDetailsTable'));
                XLSX.writeFile(wb, `Details_${containerName}.xlsx`);
            };
        }

        modal.style.display = 'block';
        document.getElementById('closeContainerModal').onclick = () => modal.style.display = 'none';
        window.onclick = (e) => { if (e.target == modal) modal.style.display = 'none'; };
    };

    // --- 8. DATA LOADING (LISTENERS) ---
    
    // A. Sessions Validées (Liste Blanche)
    db.collection("audit_logs").where("action", "==", "VALIDATION_JOURNEE").onSnapshot(snap => {
        validatedSessions.clear();
        snap.forEach(doc => {
            if (doc.data().status === "VALIDATED") validatedSessions.add(doc.id);
        });
        if (allTransactions.length > 0) updateDashboard();
    });

    // B. Données
    db.collection("transactions").where("isDeleted", "!=", true).onSnapshot(snap => {
        allTransactions = snap.docs.map(d => d.data());
        updateDashboard();
    });
    db.collection("expenses").where("isDeleted", "!=", true).onSnapshot(snap => {
        allExpenses = snap.docs.map(d => d.data());
        updateDashboard();
    });
    db.collection("other_income").where("isDeleted", "!=", true).onSnapshot(snap => {
        allOtherIncome = snap.docs.map(d => d.data());
        updateDashboard();
    });
    db.collection("bank_movements").where("isDeleted", "!=", true).onSnapshot(snap => {
        allBankMovements = snap.docs.map(d => d.data());
        updateDashboard();
    });

    // Listeners Filtres
    startDateInput.addEventListener('change', updateDashboard);
    endDateInput.addEventListener('change', updateDashboard);
    clearFilterBtn.addEventListener('click', () => {
        startDateInput.value = ''; endDateInput.value = ''; updateDashboard();
    });

});