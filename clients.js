import { db } from './firebase-config.js';
import { collection, getDocs, query, where, orderBy } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async () => {

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
    let geoChartInstance = null;
    let financeChartInstance = null;
    let timeChartInstance = null;
    let modeChartInstance = null;
    let topClientsChartInstance = null;

    // Mise à jour des en-têtes
    const topClientsTable = document.getElementById('topClientsTableBody')?.closest('table');
    if (topClientsTable) {
        const thead = topClientsTable.querySelector('thead tr');
        if (thead) {
            thead.innerHTML = `
                <th>Rang</th>
                <th>Client (Destinataire)</th>
                <th>Dernier Expéditeur</th>
                <th>Adresse</th>
                <th>Envois</th>
                <th>Total Encaissé</th>
            `;
        }
    }

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
            
            if (targetId === '#panel-graphs') {
                setTimeout(() => generateCharts(), 100);
            }
        });
    });

    async function loadData() {
        topClientsTableBody.innerHTML = '<tr><td colspan="6">Chargement des données...</td></tr>';
        
        // 1. Récupération des sessions validées (AUDIT) pour certifier les paiements
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
            
            // NOUVEAU : On calcule uniquement l'argent RÉELLEMENT encaissé (Historique des paiements validés)
            let collected = 0;
            if (data.paymentHistory && data.paymentHistory.length > 0) {
                data.paymentHistory.forEach(p => {
                    if (p.sessionId && !validatedSessions.has(p.sessionId)) return; // Exclut les paiements non validés
                    collected += (p.montantParis || 0) + (p.montantAbidjan || 0);
                });
            } else {
                collected = (data.montantParis || 0) + (data.montantAbidjan || 0); // Fallback anciennes données
            }
            
            clientStats[name].total += collected;
            clientStats[name].count++;
        });

        allLivraisonsCache.forEach(data => {
            if (data.containerStatus === 'EN_COURS' || data.containerStatus === 'LIVRE') return;
            if (!isDateInPeriod(data.dateAjout)) return;

            const name = (data.destinataire || "Client Inconnu").trim().toUpperCase();
            if (name === "CLIENT INCONNU" || name === "") return;

            if (!clientStats[name]) clientStats[name] = { count: 0, total: 0, nameStr: name, lastSender: '-', lastAddr: '-' };

            if (data.expediteur) clientStats[name].lastSender = data.expediteur;
            if (data.lieuLivraison) clientStats[name].lastAddr = data.lieuLivraison;

            // NOUVEAU : Les colis en transit ne rapportent pas encore d'argent, donc CA = 0
            clientStats[name].total += 0; 
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

        // Mettre à jour le graphique des tops clients
        updateTopClientsChart(top100.slice(0, 10));
    }

    function updateTopClientsChart(top10) {
        const canvas = document.getElementById('topClientsChart');
        if (!canvas) return;

        if (topClientsChartInstance) topClientsChartInstance.destroy();

        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, '#3b82f6');
        gradient.addColorStop(1, '#1d4ed8');

        topClientsChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: top10.map(c => c.nameStr.length > 15 ? c.nameStr.substring(0, 12) + '...' : c.nameStr),
                datasets: [{
                    label: 'Montant Encaissé (F CFA)',
                    data: top10.map(c => c.total),
                    backgroundColor: gradient,
                    borderColor: '#1e40af',
                    borderWidth: 1,
                    borderRadius: 8,
                    barPercentage: 0.7,
                    categoryPercentage: 0.8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `Encaissé: ${formatCFA(context.raw)}`;
                            }
                        },
                        backgroundColor: '#1e293b',
                        titleColor: '#f1f5f9',
                        bodyColor: '#cbd5e1'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return formatCFA(value);
                            },
                            stepSize: 500000
                        },
                        grid: { color: '#e2e8f0', dash: [5, 5] },
                        title: { display: true, text: 'Montant (F CFA)', font: { weight: 'bold' } }
                    },
                    x: {
                        ticks: { rotate: 45, maxRotation: 45, minRotation: 45 },
                        grid: { display: false }
                    }
                }
            }
        });
    }

    yearFilter.addEventListener('change', () => { calculateTop100(); generateCharts(); });
    periodFilter.addEventListener('change', () => { calculateTop100(); generateCharts(); });
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
        profileName.textContent = "Chargement de " + clientName + "...";

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
            
            shipments.push({ date: (item.dateAjout || "").split('T')[0], ref: item.ref, type: item.description || "Colis", otherParty: sender, source: `En route (${item.containerStatus})` });
        });

        abidjanData.forEach(item => {
            if (!shipments.find(s => s.ref === item.reference)) {
                totalSpent += (item.prix || 0);
                shipments.push({ date: item.date, ref: item.reference, type: "Colis", otherParty: "-", source: "Reçu (Abidjan)" });
            }
        });

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
        if (sortedSenders.length === 0) recipientsTableBody.innerHTML = '<tr><td colspan="3">Aucun expéditeur identifié</td></tr>';
        sortedSenders.forEach(r => {
            if (r.name === "Non spécifié" && sortedSenders.length > 1) return;
            recipientsTableBody.innerHTML += `<tr><td><b>${escapeHtml(r.name)}</b></td><td>-</td><td><span class="tag" style="background:#28a745;">${r.count} fois</span></td></tr>`;
        });

        shipmentsTableBody.innerHTML = '';
        shipments.forEach(s => {
            shipmentsTableBody.innerHTML += `<tr><td>${s.date}</td><td>${s.ref}</td><td>${s.type}</td><td>${escapeHtml(s.otherParty)}</td></tr>`;
        });
    }

    // AMÉLIORATION DES GRAPHIQUES
    function generateCharts() {
        const geoCanvas = document.getElementById('geoChart');
        const financeCanvas = document.getElementById('financeChart');
        const timeCanvas = document.getElementById('timeChart');
        const modeCanvas = document.getElementById('modeChart');
        const communesCanvas = document.getElementById('communesChart');
        
        if (!financeCanvas || !timeCanvas) return;

        const transactions = allTransactionsCache;
        const livraisons = allLivraisonsCache;

        // 1. CARTE GÉOGRAPHIQUE avec Leaflet et heatmap améliorée
        if (geoCanvas) {
            const parent = geoCanvas.parentNode;
            const existingMap = document.getElementById('realGeoMap');
            if (!existingMap) {
                const realGeoMap = document.createElement('div');
                realGeoMap.id = 'realGeoMap';
                realGeoMap.style.cssText = "height: 450px; width: 100%; border-radius: 12px; z-index: 1; border: 1px solid #e2e8f0;";
                parent.replaceChild(realGeoMap, geoCanvas);
            }
        }

        const buildInteractiveMap = () => {
            const mapContainer = document.getElementById('realGeoMap');
            if (!mapContainer) return;
            
            if (window.geoMapInstance) window.geoMapInstance.remove();
            
            window.geoMapInstance = L.map('realGeoMap', { scrollWheelZoom: false }).setView([5.3599, -4.0083], 11);
            
            const planLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; OpenStreetMap'
            });
            
            const satelliteLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
                attribution: '&copy; Google Maps',
                maxZoom: 20
            });

            planLayer.addTo(window.geoMapInstance);

            L.control.layers({
                "🗺️ Plan": planLayer,
                "🌍 Satellite": satelliteLayer
            }).addTo(window.geoMapInstance);

            // Bouton plein écran personnalisé en haut à gauche
            const FullscreenControl = L.Control.extend({
                options: { position: 'topleft' },
                onAdd: function() {
                    const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
                    const btn = L.DomUtil.create('a', '', container);
                    btn.innerHTML = '⛶';
                    btn.title = 'Agrandir / Plein écran';
                    btn.style.fontSize = '18px';
                    btn.style.lineHeight = '30px';
                    btn.style.textAlign = 'center';
                    btn.style.textDecoration = 'none';
                    btn.style.cursor = 'pointer';
                    btn.style.backgroundColor = '#fff';
                    btn.style.color = '#333';
                    btn.style.display = 'block';
                    
                    L.DomEvent.on(btn, 'click', function(e) {
                        L.DomEvent.stop(e);
                        const mapEl = document.getElementById('realGeoMap');
                        if (!document.fullscreenElement) {
                            mapEl.requestFullscreen().catch(err => console.warn(err));
                        } else {
                            document.exitFullscreen();
                        }
                    });
                    return container;
                }
            });
            window.geoMapInstance.addControl(new FullscreenControl());

            // S'assurer que la carte recalcule sa taille en entrant/sortant du plein écran
            if (!window.geoFullscreenListenerAdded) {
                document.addEventListener('fullscreenchange', () => {
                    setTimeout(() => { if (window.geoMapInstance) window.geoMapInstance.invalidateSize(); }, 200);
                });
                window.geoFullscreenListenerAdded = true;
            }

            const coordsMap = {
                'COCODY': [5.356, -3.985], 'YOPOUGON': [5.334, -4.067], 'ABOBO': [5.416, -4.016],
                'MARCORY': [5.300, -3.970], 'KOUMASSI': [5.283, -3.945], 'TREICHVILLE': [5.305, -4.004],
                'PORT-BOUET': [5.250, -3.950], 'ADJAME': [5.350, -4.020], 'ATTECOUBE': [5.330, -4.030],
                'BINGERVILLE': [5.350, -3.883], 'ANYAMA': [5.483, -4.050], 'PLATEAU': [5.320, -4.020],
                'SONGON': [5.316, -4.250]
            };

            const locStats = {};

            livraisons.forEach(d => {
                let lat = null, lng = null;
                const lieu = d.lieuLivraison || '';
                const commune = d.commune || '';

                const gpsMatch = lieu.match(/\[\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*\]/);
                if (gpsMatch) {
                    lat = parseFloat(gpsMatch[1]);
                    lng = parseFloat(gpsMatch[2]);
                } else if (commune && coordsMap[commune.toUpperCase()]) {
                    lat = coordsMap[commune.toUpperCase()][0] + ((Math.random() - 0.5) * 0.02);
                    lng = coordsMap[commune.toUpperCase()][1] + ((Math.random() - 0.5) * 0.02);
                }

                if (lat && lng) {
                    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
                    if (!locStats[key]) locStats[key] = { lat, lng, count: 0, ca: 0, dests: new Set() };
                    
                    locStats[key].count += (parseInt(d.quantite) || 1);
                    locStats[key].ca += parseFloat(String(d.prixOriginal || d.montant || '0').replace(/[^\d]/g, '')) || 0;
                    if (d.destinataire) locStats[key].dests.add(d.destinataire.split(' ')[0]);
                }
            });

            Object.values(locStats).forEach(stat => {
                const radius = Math.min(Math.max(stat.count * 3, 10), 40);
                let color;
                if (stat.ca > 200000) color = '#ef4444';
                else if (stat.ca > 100000) color = '#f59e0b';
                else if (stat.ca > 50000) color = '#eab308';
                else color = '#3b82f6';
                
                const destList = Array.from(stat.dests).slice(0, 3).join(', ') + (stat.dests.size > 3 ? '...' : '');

                L.circleMarker([stat.lat, stat.lng], {
                    radius: radius,
                    fillColor: color,
                    color: '#ffffff',
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.75
                }).bindPopup(`
                    <div style="text-align: center; min-width: 160px;">
                        <div style="font-size: 22px; margin-bottom: 5px;">📍</div>
                        <strong style="color:#1e293b;">${stat.count} Colis</strong><br>
                        <span style="color:#10b981; font-weight:bold;">CA: ${formatCFA(stat.ca)}</span><br>
                        <div style="font-size: 11px; color:#64748b; margin-top: 5px; border-top: 1px solid #eee; padding-top: 5px;">
                            👤 ${destList || 'Non spécifié'}
                        </div>
                    </div>
                `).addTo(window.geoMapInstance);
            });
        };

        if (!window.L) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            document.head.appendChild(link);

            const script = document.createElement('script');
            script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
            script.onload = () => buildInteractiveMap();
            document.head.appendChild(script);
        } else {
            buildInteractiveMap();
        }

        // 1.5 GRAPHIQUE DES COMMUNES (NOUVEAU)
        if (communesCanvas) {
            if (window.communesChartInstance) window.communesChartInstance.destroy();
            
            const communeStats = {};
            livraisons.forEach(d => {
                if (d.containerStatus !== 'EN_COURS') return; // Ne compte que les colis arrivés à Abidjan
                let c = (d.commune || 'Autre').trim().toUpperCase();
                if (c === '') c = 'AUTRE';
                if (!communeStats[c]) communeStats[c] = 0;
                communeStats[c] += (parseInt(d.quantite) || 1);
            });
            
            const sortedCommunes = Object.entries(communeStats).sort((a, b) => b[1] - a[1]).slice(0, 10);
            
            window.communesChartInstance = new Chart(communesCanvas, {
                type: 'doughnut',
                data: {
                    labels: sortedCommunes.map(i => i[0]),
                    datasets: [{
                        data: sortedCommunes.map(i => i[1]),
                        backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316', '#14b8a6', '#64748b'],
                        borderWidth: 0,
                        hoverOffset: 10
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } },
                        tooltip: {
                            callbacks: {
                                label: function(ctx) {
                                    const total = ctx.dataset.data.reduce((a,b)=>a+b, 0);
                                    const pct = ((ctx.raw / total)*100).toFixed(1);
                                    return `${ctx.label}: ${ctx.raw} colis (${pct}%)`;
                                }
                            }
                        }
                    }
                }
            });
        }

        // 2. GRAPHIQUE FINANCIER AVEC DONUT + BARRES
        let totalParis = 0;
        let totalAbidjan = 0;

        transactions.forEach(t => {
            if (t.paymentHistory && t.paymentHistory.length > 0) {
                t.paymentHistory.forEach(p => {
                    if (p.sessionId && !validatedSessions.has(p.sessionId)) return;
                    totalParis += (p.montantParis || 0);
                    totalAbidjan += (p.montantAbidjan || 0);
                });
            } else {
                totalParis += (t.montantParis || 0);
                totalAbidjan += (t.montantAbidjan || 0);
            }
        });
        const totalGlobal = totalParis + totalAbidjan;

        if (financeChartInstance) financeChartInstance.destroy();
        
        const financeCtx = financeCanvas.getContext('2d');
        const gradientParis = financeCtx.createLinearGradient(0, 0, 0, 400);
        gradientParis.addColorStop(0, '#00d2ff');
        gradientParis.addColorStop(1, '#0099cc');
        
        const gradientAbidjan = financeCtx.createLinearGradient(0, 0, 0, 400);
        gradientAbidjan.addColorStop(0, '#ff9f43');
        gradientAbidjan.addColorStop(1, '#e67e22');

        financeChartInstance = new Chart(financeCanvas, {
            type: 'bar',
            data: {
                labels: ['Paris (Départ)', 'Abidjan (Arrivée)'],
                datasets: [{
                    label: 'Montants (F CFA)',
                    data: [totalParis, totalAbidjan],
                    backgroundColor: [gradientParis, gradientAbidjan],
                    borderColor: ['#0099cc', '#e67e22'],
                    borderWidth: 1,
                    borderRadius: 10,
                    barPercentage: 0.6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const value = context.raw;
                                const percentage = totalGlobal > 0 ? ((value / totalGlobal) * 100).toFixed(1) : 0;
                                return `${formatCFA(value)} (${percentage}%)`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { callback: (val) => formatCFA(val) },
                        grid: { color: '#e2e8f0', dash: [5, 5] }
                    }
                }
            }
        });

        // 3. GRAPHIQUE DES MODES DE PAIEMENT (NOUVEAU)
        const modeStats = {};
        transactions.forEach(t => {
            if (t.paymentHistory && t.paymentHistory.length > 0) {
                t.paymentHistory.forEach(p => {
                    if (p.sessionId && !validatedSessions.has(p.sessionId)) return;
                    const mode = p.modePaiement || 'Espèce';
                    const amount = (p.montantAbidjan || 0) + (p.montantParis || 0);
                    if (amount > 0) modeStats[mode] = (modeStats[mode] || 0) + amount;
                });
            } else {
                const mode = t.modePaiement || 'Espèce';
                const amount = (t.montantAbidjan || 0) + (t.montantParis || 0);
                if (amount > 0) modeStats[mode] = (modeStats[mode] || 0) + amount;
            }
        });

        if (modeCanvas && modeChartInstance) modeChartInstance.destroy();
        
        if (modeCanvas) {
            const modeCtx = modeCanvas.getContext('2d');
            const modeColors = {
                'Espèce': '#22c55e',
                'OM': '#f59e0b',
                'Wave': '#06b6d4',
                'Virement': '#8b5cf6',
                'Chèque': '#ef4444'
            };
            
            modeChartInstance = new Chart(modeCanvas, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(modeStats),
                    datasets: [{
                        data: Object.values(modeStats),
                        backgroundColor: Object.keys(modeStats).map(m => modeColors[m] || '#94a3b8'),
                        borderWidth: 0,
                        hoverOffset: 15
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { position: 'bottom', labels: { font: { size: 12 } } },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const value = context.raw;
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = ((value / total) * 100).toFixed(1);
                                    return `${context.label}: ${formatCFA(value)} (${percentage}%)`;
                                }
                            }
                        }
                    }
                }
            });
        }

        // 4. GRAPHIQUE TEMPOREL AVEC LISSAGE ET ZONE
        const timeStats = {};
        transactions.forEach(t => {
            if (t.paymentHistory && t.paymentHistory.length > 0) {
                t.paymentHistory.forEach(p => {
                    if (p.sessionId && !validatedSessions.has(p.sessionId)) return;
                    const dateStr = String(p.date || '');
                    if (dateStr.length < 7) return;
                    const month = dateStr.substring(0, 7);
                    if (!timeStats[month]) timeStats[month] = { paris: 0, abidjan: 0 };
                    timeStats[month].paris += (p.montantParis || 0);
                    timeStats[month].abidjan += (p.montantAbidjan || 0);
                });
            } else {
                const dateStr = String(t.date || '');
                if (dateStr.length < 7) return;
                const month = dateStr.substring(0, 7);
                if (!timeStats[month]) timeStats[month] = { paris: 0, abidjan: 0 };
                timeStats[month].paris += (t.montantParis || 0);
                timeStats[month].abidjan += (t.montantAbidjan || 0);
            }
        });

        const sortedMonths = Object.keys(timeStats).sort();
        
        // Créer un tableau continu des 12 derniers mois si possible
        let monthsToShow = sortedMonths;
        if (sortedMonths.length > 12) {
            monthsToShow = sortedMonths.slice(-12);
        }

        if (timeChartInstance) timeChartInstance.destroy();
        
        const timeCtx = timeCanvas.getContext('2d');
        const gradientParisTime = timeCtx.createLinearGradient(0, 0, 0, 400);
        gradientParisTime.addColorStop(0, 'rgba(0, 210, 255, 0.4)');
        gradientParisTime.addColorStop(1, 'rgba(0, 210, 255, 0.02)');
        
        const gradientAbidjanTime = timeCtx.createLinearGradient(0, 0, 0, 400);
        gradientAbidjanTime.addColorStop(0, 'rgba(255, 159, 67, 0.4)');
        gradientAbidjanTime.addColorStop(1, 'rgba(255, 159, 67, 0.02)');

        timeChartInstance = new Chart(timeCanvas, {
            type: 'line',
            data: {
                labels: monthsToShow.map(m => {
                    const [year, month] = m.split('-');
                    return `${month}/${year.slice(2)}`;
                }),
                datasets: [
                    {
                        label: 'Paris (Départ)',
                        data: monthsToShow.map(m => timeStats[m]?.paris || 0),
                        borderColor: '#00d2ff',
                        backgroundColor: gradientParisTime,
                        borderWidth: 3,
                        tension: 0.4,
                        pointRadius: 5,
                        pointHoverRadius: 8,
                        pointBackgroundColor: '#00d2ff',
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 2,
                        fill: true
                    },
                    {
                        label: 'Abidjan (Arrivée)',
                        data: monthsToShow.map(m => timeStats[m]?.abidjan || 0),
                        borderColor: '#ff9f43',
                        backgroundColor: gradientAbidjanTime,
                        borderWidth: 3,
                        tension: 0.4,
                        pointRadius: 5,
                        pointHoverRadius: 8,
                        pointBackgroundColor: '#ff9f43',
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 2,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 10 } },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: ${formatCFA(context.raw)}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { callback: (val) => formatCFA(val) },
                        grid: { color: '#e2e8f0', dash: [5, 5] }
                    },
                    x: {
                        grid: { display: false }
                    }
                }
            }
        });
    }

    // Export
    exportExcelBtn.addEventListener('click', () => {
        const table = document.getElementById('topClientsTable');
        const wb = XLSX.utils.table_to_book(table, {sheet: "Top Clients"});
        XLSX.writeFile(wb, 'Top_Clients_AMT.xlsx');
    });

    exportPdfBtn.addEventListener('click', () => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape' });
        doc.text("Top Clients - AMT Caisse", 14, 15);
        doc.autoTable({ 
            html: '#topClientsTable', 
            startY: 25,
            styles: { fontSize: 8 },
            columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 60 } }
        });
        doc.save('Top_Clients_AMT.pdf');
    });

    initBackToTopButton();
});

function formatCFA(n) {
    return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(n || 0);
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