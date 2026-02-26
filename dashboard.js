document.addEventListener('DOMContentLoaded', async () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: Connexion BDD échouée."); return;
    }

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

    /**
     * Cette fonction est le COEUR du système.
     * Elle prend les transactions brutes et recalcule tout en ne gardant QUE les paiements validés.
     */
    function getCleanTransactions(transactions) {
        return transactions.reduce((acc, t) => {
            // Si pas d'historique (Legacy ou Arrivage brut), on garde tel quel (sauf si Arrivage non payé)
            if (!t.paymentHistory || !Array.isArray(t.paymentHistory) || t.paymentHistory.length === 0) {
                // Si c'est un arrivage récent (avec auteur) mais sans paiement, c'est une dette pure, on garde.
                // Si c'est une vieille donnée, on garde.
                acc.push(t); 
                return acc;
            }

            // FILTRE STRICT : On ne garde que les paiements liés à une session VALIDÉE (ou sans session = Legacy)
            const validPayments = t.paymentHistory.filter(p => !p.sessionId || validatedSessions.has(p.sessionId));

            // RECALCUL SYSTÉMATIQUE DES TOTAUX
            // On ignore les montants stockés à la racine du document pour éviter les incohérences (Ghost Payments)
            const newParis = validPayments.reduce((sum, p) => sum + (p.montantParis || 0), 0);
            const newAbidjan = validPayments.reduce((sum, p) => sum + (p.montantAbidjan || 0), 0);
            
            // On recrée l'objet transaction avec les valeurs justes
            const tClean = { 
                ...t, 
                paymentHistory: validPayments, 
                montantParis: newParis, 
                montantAbidjan: newAbidjan, 
                // Reste = (Paris + Abidjan) - Prix. (Négatif = Dette)
                reste: (newParis + newAbidjan) - (t.prix || 0) 
            };
            
            acc.push(tClean);
            return acc;
        }, []);
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
        containerSummaryBody.innerHTML = '<tr><td colspan="10">Calcul en cours...</td></tr>';

        const data = {};
        
        // 1. Agréger Transactions
        transactions.forEach(t => {
            const c = (t.conteneur || "Non spécifié").trim().toUpperCase();
            if (!data[c]) data[c] = { ca: 0, paris: 0, abidjan: 0, reste: 0, count: 0, unpaid: 0, date: t.date };
            
            data[c].ca += (t.prix || 0);
            data[c].paris += (t.montantParis || 0);
            data[c].abidjan += (t.montantAbidjan || 0);
            data[c].reste += (t.reste || 0);
            data[c].count++;
            if ((t.reste || 0) < -1) data[c].unpaid++;
            if (t.date < data[c].date) data[c].date = t.date; // Garder la date la plus ancienne
        });

        // 2. Agréger Dépenses
        expenses.forEach(e => {
            if (e.conteneur) {
                const c = e.conteneur.trim().toUpperCase();
                if (!data[c]) data[c] = { ca: 0, paris: 0, abidjan: 0, reste: 0, count: 0, unpaid: 0, date: e.date };
                if (!data[c].dep) data[c].dep = 0;
                data[c].dep += (e.montant || 0);
            }
        });

        // 3. Affichage
        const rows = Object.entries(data).sort((a, b) => b[1].date.localeCompare(a[1].date)); // Tri par date récente
        
        containerSummaryBody.innerHTML = '';
        if (rows.length === 0) { containerSummaryBody.innerHTML = '<tr><td colspan="10">Aucune donnée.</td></tr>'; return; }

        rows.forEach(([name, d]) => {
            if (name === "NON SPÉCIFIÉ") return;
            const benef = d.ca - (d.dep || 0);
            const percu = d.paris + d.abidjan;
            
            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';
            tr.onclick = () => openContainerDetails(name);
            tr.innerHTML = `
                <td><b>${name}</b></td>
                <td>${d.count}</td>
                <td style="color:${d.unpaid > 0 ? 'red' : 'green'}">${d.unpaid}</td>
                <td>${formatCFA(d.ca)}</td>
                <td>${formatCFA(d.paris)}</td>
                <td>${formatCFA(d.abidjan)}</td>
                <td style="font-weight:bold">${formatCFA(percu)}</td>
                <td class="${d.reste < 0 ? 'reste-negatif' : 'reste-positif'}">${formatCFA(d.reste)}</td>
                <td>${formatCFA(d.dep || 0)}</td>
                <td class="${benef < 0 ? 'reste-negatif' : 'reste-positif'}"><b>${formatCFA(benef)}</b></td>
            `;
            containerSummaryBody.appendChild(tr);
        });
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

            tbody.innerHTML += `
                <tr>
                    <td>${t.date}</td>
                    <td>${t.nom} <small>(${t.reference})</small></td>
                    <td>${t.reference}</td>
                    <td>${formatCFA(t.prix)}</td>
                    <td>${formatCFA(t.montantAbidjan)}</td>
                    <td>${formatCFA(t.montantParis)}</td>
                    <td class="${t.reste < 0 ? 'reste-negatif' : 'reste-positif'}">${formatCFA(t.reste)}</td>
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

        // Totaux Footer Modal
        document.getElementById('modalTotalPrix').textContent = formatCFA(totalPrix);
        document.getElementById('modalTotalPayeAbj').textContent = formatCFA(totalAbj);
        document.getElementById('modalTotalPayePar').textContent = formatCFA(totalPar);
        document.getElementById('modalTotalReste').textContent = formatCFA(totalReste);

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

    // Fonction utilitaire
    function formatCFA(n) { return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(n || 0); }
});