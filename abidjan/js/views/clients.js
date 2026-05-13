import { db } from '../../../firebase-config.js';
import { collection, getDocs, query, where, orderBy } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const ClientsView = {
    render(app, container) {
        this.app = app;
        
        // 1. INJECTION DU TEMPLATE HTML
        container.innerHTML = `
            <div class="sub-nav">
                <a href="#panel-list" class="active" id="tab-list">🏆 Top Clients</a>
                <a href="#panel-graphs" id="tab-graphs">📈 Analyses & Graphiques</a>
            </div>

            <div id="panel-list" class="tab-panel active">
                <div class="dashboard-container">
                    <h3>🔍 Rechercher un client</h3>
                    <div class="search-bar-container">
                        <input type="text" id="clientSearch" placeholder="Nom du client..." list="clientsList">
                        <datalist id="clientsList"></datalist>
                    </div>
                </div>
                
                <div id="topClientsContainer">
                    <div class="clients-filters">
                        <select id="yearFilter">
                            <option value="">📅 Toutes les années</option>
                            <option value="2024">2024</option>
                            <option value="2025">2025</option>
                            <option value="2026">2026</option>
                        </select>
                        <select id="periodFilter">
                            <option value="all">📆 Année complète</option>
                            <option value="S1">☀️ Semestre 1 (Jan - Juin)</option>
                            <option value="S2">🍂 Semestre 2 (Juil - Déc)</option>
                        </select>
                        <select id="sortFilter">
                            <option value="total">💰 Trier par CA</option>
                            <option value="count">📦 Trier par nombre d'envois</option>
                        </select>
                    </div>
                    <div class="export-buttons">
                        <button id="exportRecipientsBtn" class="btn-excel" style="background: #0ea5e9; display: none;">📞 Exporter Destinataires</button>
                        <button id="exportExcelBtn" class="btn-excel">📊 Exporter Excel</button>
                        <button id="exportPdfBtn" class="btn-pdf">📑 Exporter PDF</button>
                    </div>

                    <table id="topClientsTable">
                        <thead><tr><th>Rang</th><th>Client (Destinataire)</th><th>Dernier Expéditeur</th><th>Adresse</th><th>Envois</th><th>Total Encaissé</th></tr></thead>
                        <tbody id="topClientsTableBody"></tbody>
                    </table>
                </div>
            </div>

            <div id="panel-graphs" class="tab-panel">
                <div class="charts-grid">
                    <div class="chart-card">
                        <h3>🗺️ Carte des livraisons</h3>
                        <canvas id="geoChart"></canvas>
                    </div>
                    <div class="chart-card">
                        <h3>💰 Flux financiers Paris vs Abidjan</h3>
                        <canvas id="financeChart"></canvas>
                    </div>
                    <div class="chart-card">
                        <h3>💳 Modes de paiement</h3>
                        <canvas id="modeChart"></canvas>
                    </div>
                    <div class="chart-card">
                        <h3>🏆 Top 10 clients</h3>
                        <canvas id="topClientsChart"></canvas>
                    </div>
                    <div class="chart-card">
                        <h3>📍 Répartition des Colis Par Communes</h3>
                        <canvas id="communesChart"></canvas>
                    </div>
                    <div class="chart-card full-width">
                        <h3>📈 Évolution mensuelle</h3>
                        <canvas id="timeChart"></canvas>
                    </div>
                </div>
            </div>

            <div id="clientProfile" class="client-card">
                <div class="client-header">
                    <h2 id="profileName">Client</h2>
                    <button id="closeProfileBtn">✕ Fermer</button>
                </div>
                <div class="stats-grid">
                    <div class="stat-box"><h4>💰 Total dépensé</h4><span id="profileTotalSpent">0 CFA</span></div>
                    <div class="stat-box"><h4>📦 Nombre d'envois</h4><span id="profileShipmentCount">0</span></div>
                    <div class="stat-box"><h4>📅 Dernier envoi</h4><span id="profileLastDate">-</span></div>
                </div>
                <div class="info-tables">
                    <div>
                        <div class="section-title">📤 Expéditeurs fréquents</div>
                        <table id="recipientsTable"><thead><tr><th>Expéditeur</th><th></th><th>Fréquence</th></tr></thead><tbody id="recipientsTableBody"></tbody></table>
                    </div>
                    <div>
                        <div class="section-title">📋 Historique des colis</div>
                        <table id="shipmentsTable"><thead><tr><th>Date</th><th>Réf</th><th>Type</th><th>Expéditeur</th></tr></thead><tbody id="shipmentsTableBody"></tbody></table>
                    </div>
                </div>
            </div>
        `;

        // 2. INITIALISATION DE LA LOGIQUE
        this.initLogic();
    },

    async initLogic() {
        const clientSearchInput = document.getElementById('clientSearch');
        const clientsList = document.getElementById('clientsList');
        
        const clientProfile = document.getElementById('clientProfile');
        const topClientsContainer = document.getElementById('topClientsContainer');
        const topClientsTableBody = document.getElementById('topClientsTableBody');
        const closeProfileBtn = document.getElementById('closeProfileBtn');

        const yearFilter = document.getElementById('yearFilter');
        const periodFilter = document.getElementById('periodFilter');
        const sortFilter = document.getElementById('sortFilter');

        const exportExcelBtn = document.getElementById('exportExcelBtn');
        const exportPdfBtn = document.getElementById('exportPdfBtn');
        const exportRecipientsBtn = document.getElementById('exportRecipientsBtn');

        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'abidjan';
        if (activeAgency === 'abidjan' && exportRecipientsBtn) {
            exportRecipientsBtn.style.display = 'inline-block';
        }

        const profileName = document.getElementById('profileName');
        const profileTotalSpent = document.getElementById('profileTotalSpent');
        const profileShipmentCount = document.getElementById('profileShipmentCount');
        const profileLastDate = document.getElementById('profileLastDate');
        const recipientsTableBody = document.getElementById('recipientsTableBody'); 
        const shipmentsTableBody = document.getElementById('shipmentsTableBody');

        let allClientNames = new Set();
        let allTransactionsCache = [];
        let allLivraisonsCache = [];
        let validatedSessions = new Set();
        let topClientsChartInstance = null;

        // Gestion des onglets
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

        async function loadData() {
            topClientsTableBody.innerHTML = '<tr><td colspan="6">Chargement des données...</td></tr>';
            
            const auditSnap = await getDocs(query(collection(db, "audit_logs"), where("action", "==", "VALIDATION_JOURNEE"), where("status", "==", "VALIDATED")));
            validatedSessions.clear();
            auditSnap.forEach(doc => validatedSessions.add(doc.id));

            const livraisonsSnap = await getDocs(query(collection(db, "livraisons"), orderBy("dateAjout", "desc")));
            allLivraisonsCache = livraisonsSnap.docs.map(doc => doc.data());
            
            const transSnap = await getDocs(query(collection(db, "transactions"), where("isDeleted", "!=", true)));
            allTransactionsCache = transSnap.docs.map(doc => doc.data());

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

            calculateTop100();
        }

        function calculateTop100() {
            const selectedYear = yearFilter.value;
            const selectedPeriod = periodFilter.value;
            const selectedSort = sortFilter.value;

            const clientStats = {};

            function isDateInPeriod(dateStr) {
                if (!dateStr) return false;
                if (!selectedYear) return true;
                const year = dateStr.substring(0, 4);
                const month = parseInt(dateStr.substring(5, 7));
                if (year !== selectedYear) return false;
                if (selectedPeriod === 'S1') return month <= 6;
                if (selectedPeriod === 'S2') return month >= 7;
                return true;
            }

            allTransactionsCache.forEach(data => {
                if (!isDateInPeriod(data.date)) return;
                const name = (data.nomDestinataire || data.nom || "Client Inconnu").trim().toUpperCase();
                if (name === "CLIENT INCONNU" || name === "") return;
                if (!clientStats[name]) clientStats[name] = { count: 0, total: 0, nameStr: name, lastSender: '-', lastAddr: '-' }; 
                if (data.adresseDestinataire) clientStats[name].lastAddr = data.adresseDestinataire;
                
                let collected = 0;
                if (data.paymentHistory && data.paymentHistory.length > 0) {
                    data.paymentHistory.forEach(p => {
                        if (p.sessionId && !validatedSessions.has(p.sessionId)) return; 
                        collected += (p.montantParis || 0) + (p.montantAbidjan || 0);
                    });
                } else {
                    collected = (data.montantParis || 0) + (data.montantAbidjan || 0); 
                }
                
                clientStats[name].total += collected;
                clientStats[name].count++;
            });

            const sortedClients = Object.values(clientStats).sort((a, b) => {
                if (selectedSort === 'count') return b.count - a.count;
                return b.total - a.total;
            });

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
                    <td>${escapeHtml(client.nameStr)}</td>
                    <td style="font-size:0.9em; color:#555;">${escapeHtml(client.lastSender)}</td>
                    <td style="font-size:0.9em; color:#555;">${escapeHtml(client.lastAddr)}</td>
                    <td><span class="tag" style="background:#17a2b8;">${client.count} envois</span></td>
                    <td>${formatCFA(client.total)}</td>
                `;
                topClientsTableBody.appendChild(row);
            });

            updateTopClientsChart(top100.slice(0, 10));
        }

        function updateTopClientsChart(top10) {
            const canvas = document.getElementById('topClientsChart');
            if (!canvas || typeof Chart === 'undefined') return;
            if (topClientsChartInstance) topClientsChartInstance.destroy();
            const ctx = canvas.getContext('2d');
            topClientsChartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: top10.map(c => c.nameStr.length > 15 ? c.nameStr.substring(0, 12) + '...' : c.nameStr),
                    datasets: [{
                        label: 'Montant Encaissé (F CFA)',
                        data: top10.map(c => c.total),
                        backgroundColor: '#3b82f6',
                        borderRadius: 8
                    }]
                }
            });
        }

        yearFilter.addEventListener('change', calculateTop100);
        periodFilter.addEventListener('change', calculateTop100);
        sortFilter.addEventListener('change', calculateTop100);

        loadData();

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

        async function generateClientReport(clientName) {
            profileName.textContent = clientName;
            const livraisonsData = allLivraisonsCache.filter(d => (d.destinataire||"").trim().toUpperCase() === clientName.toUpperCase());
            const abidjanData = allTransactionsCache.filter(d => (d.nomDestinataire||d.nom||"").trim().toUpperCase() === clientName.toUpperCase());

            let totalSpent = 0;
            let shipments = [];
            let sendersMap = {};

            livraisonsData.forEach(item => {
                if (item.containerStatus === 'EN_COURS' || item.containerStatus === 'LIVRE') return;
                let amount = parseFloat(String(item.prixOriginal || item.montant || '0').replace(/[^\d]/g, '')) || 0;
                totalSpent += amount;
                const sender = item.expediteur || "Non spécifié";
                if (!sendersMap[sender]) sendersMap[sender] = { count: 0 };
                sendersMap[sender].count++;
                shipments.push({ date: (item.dateAjout || "").split('T')[0], ref: item.ref, type: item.description || "Colis", otherParty: sender });
            });

            abidjanData.forEach(item => {
                if (!shipments.find(s => s.ref === item.reference)) {
                    totalSpent += (item.prix || 0);
                    shipments.push({ date: item.date, ref: item.reference, type: "Colis", otherParty: "-" });
                }
            });

            shipments.sort((a, b) => new Date(b.date) - new Date(a.date));
            profileTotalSpent.textContent = formatCFA(totalSpent);
            profileShipmentCount.textContent = shipments.length;
            profileLastDate.textContent = shipments.length > 0 ? shipments[0].date : "-";

            const sortedSenders = Object.entries(sendersMap).map(([name, data]) => ({ name, ...data })).sort((a, b) => b.count - a.count);

            recipientsTableBody.innerHTML = '';
            sortedSenders.forEach(r => {
                if (r.name === "Non spécifié" && sortedSenders.length > 1) return;
                recipientsTableBody.innerHTML += `<tr><td><b>${escapeHtml(r.name)}</b></td><td>-</td><td><span class="tag" style="background:#28a745;">${r.count} fois</span></td></tr>`;
            });

            shipmentsTableBody.innerHTML = '';
            shipments.forEach(s => {
                shipmentsTableBody.innerHTML += `<tr><td>${s.date}</td><td>${s.ref}</td><td>${s.type}</td><td>${escapeHtml(s.otherParty)}</td></tr>`;
            });
        }
        
        // Exporter
        exportExcelBtn.addEventListener('click', () => {
            const table = document.getElementById('topClientsTable');
            const wb = XLSX.utils.table_to_book(table, {sheet: "Top Clients"});
            XLSX.writeFile(wb, 'Top_Clients_AMT.xlsx');
        });
    }
};

// Utilitaires partagés pour la vue
function formatCFA(n) {
    return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(n || 0).replace(/[\u202F\u00A0]/g, ' ').replace(/\s*\/\s*/g, ' ');
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}