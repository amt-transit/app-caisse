document.addEventListener('DOMContentLoaded', async () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: Connexion BDD échouée."); return;
    }

    const transactionsCollection = db.collection("transactions");
    const livraisonsCollection = db.collection("livraisons"); // Remplacement de paris_manifest par livraisons

    const clientSearchInput = document.getElementById('clientSearch');
    const clientsList = document.getElementById('clientsList');
    
    // Conteneurs
    const clientProfile = document.getElementById('clientProfile');
    const topClientsContainer = document.getElementById('topClientsContainer');
    const topClientsTableBody = document.getElementById('topClientsTableBody');
    const closeProfileBtn = document.getElementById('closeProfileBtn');

    // Filtres Top 100
    const yearFilter = document.getElementById('yearFilter');
    const periodFilter = document.getElementById('periodFilter');
    const sortFilter = document.getElementById('sortFilter');

    // Boutons Export
    const exportExcelBtn = document.getElementById('exportExcelBtn');
    const exportPdfBtn = document.getElementById('exportPdfBtn');

    // Éléments du profil
    const profileName = document.getElementById('profileName');
    const profileTotalSpent = document.getElementById('profileTotalSpent');
    const profileShipmentCount = document.getElementById('profileShipmentCount');
    const profileLastDate = document.getElementById('profileLastDate');
    const recipientsTableBody = document.getElementById('recipientsTableBody'); 
    const shipmentsTableBody = document.getElementById('shipmentsTableBody');

    let allClientNames = new Set();
    let allTransactionsCache = [];
    let allLivraisonsCache = []; // Renommé pour clarté
    let geoChartInstance = null;
    let financeChartInstance = null;
    let timeChartInstance = null;

    // --- MISE À JOUR DYNAMIQUE DES EN-TÊTES (Top 100) ---
    const topClientsTable = document.getElementById('topClientsTableBody')?.closest('table');
    if (topClientsTable) {
        const thead = topClientsTable.querySelector('thead tr');
        if (thead) {
            // On ajoute Destinataire et Adresse
            thead.innerHTML = `
                <th>Rang</th><th>Client (Destinataire)</th><th>Dernier Expéditeur</th><th>Adresse</th><th>Envois</th><th>C.A. Total</th>
            `;
        }
    }

    // --- GESTION DES ONGLETS ---
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
            
            // Si on clique sur l'onglet graphiques, on les génère/met à jour
            if (targetId === '#panel-graphs') generateCharts();
        });
    });

    // 1. CHARGEMENT DES DONNÉES (Une seule fois pour optimiser)
    async function loadData() {
        topClientsTableBody.innerHTML = '<tr><td colspan="4">Chargement des données...</td></tr>';
        
        // Charger les noms pour l'autocomplete
        const livraisonsSnap = await livraisonsCollection.orderBy("dateAjout", "desc").limit(2000).get();
        allLivraisonsCache = livraisonsSnap.docs.map(doc => doc.data());
        
        const transSnap = await transactionsCollection.where("isDeleted", "!=", true).limit(2000).get();
        allTransactionsCache = transSnap.docs.map(doc => doc.data());

        // Remplir la liste des noms
        // MODIFICATION : On indexe les Destinataires en priorité
        allLivraisonsCache.forEach(d => { if(d.destinataire) allClientNames.add(d.destinataire.trim()); });
        allTransactionsCache.forEach(d => { 
            if(d.nomDestinataire) allClientNames.add(d.nomDestinataire.trim());
            else if(d.nom) allClientNames.add(d.nom.trim()); 
        });

        const sortedNames = Array.from(allClientNames).sort();
        clientsList.innerHTML = '';
        sortedNames.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            clientsList.appendChild(option);
        });

        // Lancer le calcul du Top 100
        calculateTop100();
        // Les graphiques seront générés au clic sur l'onglet pour ne pas ralentir le chargement initial
    }

    // 2. CALCUL ET AFFICHAGE DU TOP 100
    function calculateTop100() {
        const selectedYear = yearFilter.value;
        const selectedPeriod = periodFilter.value; // 'all', 'S1', 'S2'
        const selectedSort = sortFilter.value; // 'total' ou 'count'

        const clientStats = {};

        // Fonction utilitaire pour vérifier la date
        function isDateInPeriod(dateStr) {
            if (!dateStr) return false;
            if (!selectedYear) return true; // Si pas d'année sélectionnée, on prend tout
            
            // dateStr est "AAAA-MM-JJ"
            const year = dateStr.substring(0, 4);
            const month = parseInt(dateStr.substring(5, 7));

            if (year !== selectedYear) return false;

            if (selectedPeriod === 'S1') return month <= 6;
            if (selectedPeriod === 'S2') return month >= 7;
            
            return true; // 'all'
        }

        // A. Traitement Transactions (Reçus)
        allTransactionsCache.forEach(data => {
            if (!isDateInPeriod(data.date)) return;

            // MODIFICATION : Groupement par Destinataire (ou Nom si Destinataire manquant)
            const name = (data.nomDestinataire || data.nom || "Client Inconnu").trim().toUpperCase();
            if (name === "CLIENT INCONNU" || name === "") return;

            if (!clientStats[name]) clientStats[name] = { count: 0, total: 0, nameStr: name, lastSender: '-', lastAddr: '-' }; 
            
            // On récupère l'adresse si dispo dans la transaction (synchro)
            if (data.adresseDestinataire) clientStats[name].lastAddr = data.adresseDestinataire;
            // Pas d'info expéditeur fiable dans transactions (Abidjan), on laisse '-'
            
            clientStats[name].total += (data.prix || 0);
            clientStats[name].count++;
        });

        // B. Traitement Livraisons (En Route : Paris / À Venir)
        // On ne prend que ce qui n'est PAS encore en transaction (donc pas EN_COURS ni LIVRE)
        allLivraisonsCache.forEach(data => {
            if (data.containerStatus === 'EN_COURS' || data.containerStatus === 'LIVRE') return;

            if (!isDateInPeriod(data.dateAjout)) return;

            // MODIFICATION : Groupement par Destinataire
            const name = (data.destinataire || "Client Inconnu").trim().toUpperCase();
            if (name === "CLIENT INCONNU" || name === "") return;

            if (!clientStats[name]) clientStats[name] = { count: 0, total: 0, nameStr: name, lastSender: '-', lastAddr: '-' };

            // Livraisons est riche en infos destinataire
            if (data.expediteur) clientStats[name].lastSender = data.expediteur;
            if (data.lieuLivraison) clientStats[name].lastAddr = data.lieuLivraison;

            // Calcul Montant (Prix Original ou Montant/Reste)
            let amount = 0;
            // On essaie de récupérer le prix total (prixOriginal) sinon le montant (qui peut être le reste)
            if (data.prixOriginal) amount = parseFloat(String(data.prixOriginal).replace(/[^\d]/g, '')) || 0;
            if (amount === 0 && data.montant) amount = parseFloat(String(data.montant).replace(/[^\d]/g, '')) || 0;

            clientStats[name].total += amount;
            clientStats[name].count++;
        });

        // C. Tri
        const sortedClients = Object.values(clientStats).sort((a, b) => {
            if (selectedSort === 'count') {
                return b.count - a.count; // Tri par nombre
            }
            return b.total - a.total; // Tri par CA (défaut)
        });

        // D. Affichage (Top 100)
        const top100 = sortedClients.slice(0, 100);

        topClientsTableBody.innerHTML = '';
        if (top100.length === 0) {
            topClientsTableBody.innerHTML = '<tr><td colspan="6">Aucune donnée pour cette période.</td></tr>';
            return;
        }

        top100.forEach((client, index) => {
            let rank = `#${index + 1}`;
            if (index === 0) rank = "🥇"; if (index === 1) rank = "🥈"; if (index === 2) rank = "🥉";

            const row = document.createElement('tr');
            row.addEventListener('click', () => {
                clientSearchInput.value = client.nameStr;
                showProfileView(client.nameStr);
            });

            row.innerHTML = `
                <td><b>${rank}</b></td>
                <td>${client.nameStr}</td>
                <td style="font-size:0.9em; color:#555;">${client.lastSender}</td>
                <td style="font-size:0.9em; color:#555;">${client.lastAddr}</td>
                <td><span class="tag" style="background:#17a2b8;">${client.count} envois</span></td>
                <td>${formatCFA(client.total)}</td>
            `;
            topClientsTableBody.appendChild(row);
        });
    }

    // Listeners sur les filtres
    yearFilter.addEventListener('change', calculateTop100);
    periodFilter.addEventListener('change', calculateTop100);
    sortFilter.addEventListener('change', calculateTop100);

    // Lancement initial
    loadData();

    // 3. GESTION DE L'AFFICHAGE (Recherche)
    clientSearchInput.addEventListener('change', () => {
        const selectedClient = clientSearchInput.value.trim();
        if (selectedClient) showProfileView(selectedClient);
        else showTopView();
    });

    closeProfileBtn.addEventListener('click', () => {
        clientSearchInput.value = '';
        showTopView();
    });

    function showProfileView(clientName) {
        topClientsContainer.style.display = 'none';
        clientProfile.style.display = 'block';
        generateClientReport(clientName);
    }

    function showTopView() {
        clientProfile.style.display = 'none';
        topClientsContainer.style.display = 'block';
    }

    // 4. GÉNÉRATION DU RAPPORT INDIVIDUEL (inchangé, mais utilise les caches si possible ?)
    // Pour la fiche individuelle, on refait une requête spécifique pour être sûr d'avoir tout l'historique
    // (ou on pourrait filtrer les caches, mais une requête directe est plus sûre pour l'exhaustivité si on a limité les caches)
    async function generateClientReport(clientName) {
        profileName.textContent = "Chargement de " + clientName + "...";

        // On peut filtrer nos caches locaux c'est plus rapide !
        // MODIFICATION : Filtre sur le Destinataire
        const livraisonsData = allLivraisonsCache.filter(d => (d.destinataire||"").trim().toUpperCase() === clientName.toUpperCase());
        const abidjanData = allTransactionsCache.filter(d => (d.nomDestinataire||d.nom||"").trim().toUpperCase() === clientName.toUpperCase());

        let totalSpent = 0;
        let shipments = [];
        let sendersMap = {}; // On analyse les expéditeurs maintenant

        livraisonsData.forEach(item => {
            // On ne compte que ce qui est en route pour éviter les doublons avec transactions
            if (item.containerStatus === 'EN_COURS' || item.containerStatus === 'LIVRE') return;

            let amount = parseFloat(String(item.prixOriginal || item.montant || '0').replace(/[^\d]/g, '')) || 0;
            totalSpent += amount;
            
            const sender = item.expediteur || "Non spécifié";
            
            if (!sendersMap[sender]) sendersMap[sender] = { count: 0 };
            sendersMap[sender].count++;
            
            shipments.push({ date: (item.dateAjout || "").split('T')[0], ref: item.ref, type: item.description || "Colis", otherParty: sender, source: `En route (${item.containerStatus})` });
        });

        abidjanData.forEach(item => {
            if (!shipments.find(s => s.ref === item.reference)) {
                totalSpent += (item.prix || 0);
                shipments.push({ date: item.date, ref: item.reference, type: "Colis", otherParty: "-", source: "Reçu (Abidjan)" });
            }
        });

        // Mise à jour des titres de colonnes pour la fiche individuelle
        const recipientsTable = recipientsTableBody.closest('table');
        if(recipientsTable) recipientsTable.querySelector('thead tr').innerHTML = '<th>Expéditeur</th><th>-</th><th>Fréquence</th>';
        
        const shipmentsTable = shipmentsTableBody.closest('table');
        if(shipmentsTable) shipmentsTable.querySelector('thead tr').innerHTML = '<th>Date</th><th>Ref</th><th>Type</th><th>Expéditeur</th>';

        shipments.sort((a, b) => new Date(b.date) - new Date(a.date));

        profileName.textContent = clientName;
        profileTotalSpent.textContent = formatCFA(totalSpent);
        profileShipmentCount.textContent = shipments.length;
        profileLastDate.textContent = shipments.length > 0 ? shipments[0].date : "-";

        const sortedSenders = Object.entries(sendersMap).map(([name, data]) => ({ name, ...data })).sort((a, b) => b.count - a.count);

        recipientsTableBody.innerHTML = '';
        if (sortedSenders.length === 0) recipientsTableBody.innerHTML = '<tr><td colspan="3">Aucun expéditeur identifié (Données Paris uniquement).</td></tr>';
        sortedSenders.forEach(r => {
            if (r.name === "Non spécifié" && sortedSenders.length > 1) return;
            recipientsTableBody.innerHTML += `<tr><td><b>${r.name}</b></td><td>-</td><td><span class="tag" style="background:#28a745;">${r.count} fois</span></td></tr>`;
        });

        shipmentsTableBody.innerHTML = '';
        shipments.forEach(s => {
            shipmentsTableBody.innerHTML += `<tr><td>${s.date}</td><td>${s.ref}</td><td>${s.type}</td><td>${s.otherParty}</td></tr>`;
        });
    }

    // 6. GÉNÉRATION DES GRAPHIQUES (Déplacé depuis Dashboard)
    function generateCharts() {
        const geoCanvas = document.getElementById('geoChart');
        const financeCanvas = document.getElementById('financeChart');
        const timeCanvas = document.getElementById('timeChart');
        if (!geoCanvas || !financeCanvas || !timeCanvas) return;

        // Utilisation des données en cache (allTransactionsCache)
        const transactions = allTransactionsCache;

        // 1. PRÉPARATION DONNÉES GÉOGRAPHIQUES (Communes)
        const communeStats = {};
        transactions.forEach(t => {
            let loc = (t.commune || "").trim();
            if (!loc && t.adresseDestinataire) {
                const addr = t.adresseDestinataire.toLowerCase();
                if (addr.includes('abobo')) loc = 'Abobo';
                else if (addr.includes('cocody')) loc = 'Cocody';
                else if (addr.includes('yopougon')) loc = 'Yopougon';
                else if (addr.includes('koumassi')) loc = 'Koumassi';
                else if (addr.includes('marcory')) loc = 'Marcory';
                else if (addr.includes('port-bouet') || addr.includes('port bouet')) loc = 'Port-Bouet';
                else if (addr.includes('adjame')) loc = 'Adjame';
                else if (addr.includes('bingerville')) loc = 'Bingerville';
                else if (addr.includes('anyama')) loc = 'Anyama';
                else loc = 'Autre';
            } else if (!loc) {
                loc = 'Non spécifié';
            }
            loc = loc.charAt(0).toUpperCase() + loc.slice(1).toLowerCase();
            if (!communeStats[loc]) communeStats[loc] = 0;
            communeStats[loc]++;
        });

        const sortedCommunes = Object.entries(communeStats).sort((a, b) => b[1] - a[1]);
        
        // --- RENDU GRAPHIQUE GÉOGRAPHIQUE ---
        if (geoChartInstance) geoChartInstance.destroy();
        geoChartInstance = new Chart(geoCanvas, {
            type: 'doughnut',
            data: {
                labels: sortedCommunes.map(i => i[0]),
                datasets: [{
                    data: sortedCommunes.map(i => i[1]),
                    backgroundColor: ['#00d2ff', '#00e676', '#ff9f43', '#ff5252', '#5f27cd', '#2e86de', '#1dd1a1', '#f368e0'],
                    borderWidth: 0
                }]
            },
            options: { responsive: true, plugins: { legend: { position: 'right', labels: { color: '#333' } } } }
        });

        // 2. PRÉPARATION DONNÉES FINANCIÈRES
        const totalParis = transactions.reduce((sum, t) => sum + (t.montantParis || 0), 0);
        const totalAbidjan = transactions.reduce((sum, t) => sum + (t.montantAbidjan || 0), 0);

        // --- RENDU GRAPHIQUE FINANCIER ---
        if (financeChartInstance) financeChartInstance.destroy();
        financeChartInstance = new Chart(financeCanvas, {
            type: 'bar',
            data: {
                labels: ['Paris (Départ)', 'Abidjan (Arrivée)'],
                datasets: [{ label: 'Montants Payés (CFA)', data: [totalParis, totalAbidjan], backgroundColor: ['#00d2ff', '#ff9f43'], borderRadius: 5 }]
            },
            options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
        });

        // 3. PRÉPARATION DONNÉES TEMPORELLES (Flux Paris vs Abidjan par Mois)
        const timeStats = {};
        transactions.forEach(t => {
            if (!t.date) return;
            // On groupe par mois (YYYY-MM) pour une courbe lisible
            const month = t.date.substring(0, 7); 
            if (!timeStats[month]) timeStats[month] = { paris: 0, abidjan: 0 };
            timeStats[month].paris += (t.montantParis || 0);
            timeStats[month].abidjan += (t.montantAbidjan || 0);
        });

        const sortedMonths = Object.keys(timeStats).sort();

        // --- RENDU GRAPHIQUE TEMPOREL (Courbe Lissée) ---
        if (timeChartInstance) timeChartInstance.destroy();
        timeChartInstance = new Chart(timeCanvas, {
            type: 'line',
            data: {
                labels: sortedMonths,
                datasets: [
                    {
                        label: 'Paris (Départ)',
                        data: sortedMonths.map(m => timeStats[m].paris),
                        borderColor: '#00d2ff',
                        backgroundColor: 'rgba(0, 210, 255, 0.1)',
                        tension: 0.4, // Courbe lissée
                        pointRadius: 4, // Points visibles (Nuage)
                        fill: true
                    },
                    {
                        label: 'Abidjan (Arrivée)',
                        data: sortedMonths.map(m => timeStats[m].abidjan),
                        borderColor: '#ff9f43',
                        backgroundColor: 'rgba(255, 159, 67, 0.1)',
                        tension: 0.4, // Courbe lissée
                        pointRadius: 4, // Points visibles (Nuage)
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { position: 'top' },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) label += ': ';
                                if (context.parsed.y !== null) label += formatCFA(context.parsed.y);
                                return label;
                            }
                        }
                    }
                },
                scales: { y: { beginAtZero: true } }
            }
        });
    }

    // 5. EXPORTATION
    exportExcelBtn.addEventListener('click', () => {
        const table = document.getElementById('topClientsTable');
        const wb = XLSX.utils.table_to_book(table, {sheet: "Top Clients"});
        XLSX.writeFile(wb, 'Top_Clients_AMT.xlsx');
    });

    exportPdfBtn.addEventListener('click', () => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        doc.text("Top Clients - AMT Caisse", 14, 15);
        doc.autoTable({ html: '#topClientsTable', 
            startY: 25,
            styles: { fontSize: 7 },
            didParseCell: function(data) {
                if (data.cell.text) {
                    data.cell.text = data.cell.text.map(t => t.replace(/[\u00A0\u202F]/g, ' '));
                }
            }
        });
        doc.save('Top_Clients_AMT.pdf');
    });

    initBackToTopButton();
});