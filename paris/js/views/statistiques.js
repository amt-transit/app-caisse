import { db } from '../../../firebase-config.js';
import { collection, query, where, onSnapshot, getDocs } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const StatistiquesView = {
    unsubLivraisons: null,
    livraisons: [],
    activeTab: 'monthly',
    charts: {},

    render(app, subView = 'monthly') {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.statistiques = this;
        this.activeTab = subView;

        const html = `
            <style>
                .stats-page { max-width: 1400px; margin: 0 auto; animation: fadeIn 0.3s ease; }
                .stats-header { background: white; border-radius: 16px; padding: 20px 25px; margin-bottom: 24px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px; }
                .stats-header__left { display: flex; align-items: center; gap: 15px; }
                .stats-header__icon { background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); color: white; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 14px; font-size: 24px; box-shadow: 0 4px 10px rgba(139, 92, 246, 0.3); }
                .stats-header__title { margin: 0; font-size: 22px; font-weight: 800; color: #0f172a; }
                .stats-header__subtitle { margin: 4px 0 0 0; font-size: 13px; color: #64748b; }

                .stats-tabs { display: flex; gap: 10px; margin-bottom: 24px; background: white; padding: 10px; border-radius: 12px; border: 1px solid #e2e8f0; overflow-x: auto; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
                .stats-tab { padding: 10px 20px; font-weight: 700; font-size: 14px; color: #64748b; cursor: pointer; border-radius: 8px; transition: 0.2s; text-decoration: none; white-space: nowrap; border: 1px solid transparent; }
                .stats-tab:hover { background: #f8fafc; color: #0f172a; }
                .stats-tab.active { background: #f3e8ff; color: #7e22ce; border-color: #e9d5ff; }

                .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; margin-bottom: 24px; }
                .kpi-card { background: white; border-radius: 16px; padding: 20px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02); display: flex; align-items: center; gap: 15px; transition: transform 0.2s; }
                .kpi-card:hover { transform: translateY(-3px); box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05); }
                .kpi-card__icon { width: 50px; height: 50px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px; flex-shrink: 0; }
                .kpi-card__content { flex: 1; }
                .kpi-card__value { font-size: 24px; font-weight: 900; color: #0f172a; margin-bottom: 4px; line-height: 1; }
                .kpi-card__label { font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }

                .charts-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 20px; margin-bottom: 24px; }
                .charts-grid-eq { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
                @media (max-width: 992px) { .charts-grid, .charts-grid-eq { grid-template-columns: 1fr; } }

                .chart-card { background: white; border-radius: 16px; padding: 20px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02); display: flex; flex-direction: column; }
                .chart-header { margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; }
                .chart-title { margin: 0; font-size: 16px; font-weight: 800; color: #1e293b; }
                .chart-subtitle { margin: 4px 0 0 0; font-size: 12px; color: #64748b; }
                .chart-wrap { flex: 1; position: relative; min-height: 280px; width: 100%; }
                
                .table-card { background: white; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02); overflow: hidden; }
                .table-header { padding: 20px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; }
                .table-title { margin: 0; font-size: 16px; font-weight: 800; color: #1e293b; }
                .data-table { width: 100%; border-collapse: collapse; }
                .data-table th { background: white; padding: 15px 20px; text-align: left; font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; }
                .data-table td { padding: 15px 20px; border-bottom: 1px solid #f1f5f9; font-size: 14px; color: #334155; }
                .data-table tr:hover td { background: #f8fafc; }
                .mono { font-family: monospace; font-weight: 700; color: #0f172a; }
            </style>

            <div class="stats-page">
                <div class="stats-header">
                    <div class="stats-header__left">
                        <div class="stats-header__icon">📈</div>
                        <div>
                            <h1 class="stats-header__title">Statistiques Opérationnelles</h1>
                            <p class="stats-header__subtitle">Analyse détaillée de l'activité logistique, des flux et des expéditeurs</p>
                        </div>
                    </div>
                    <button class="btn btn-outline" onclick="window.app.views.statistiques.loadData()" style="background:white;">
                        <i class="fas fa-sync-alt"></i> Actualiser
                    </button>
                </div>

                <div class="stats-tabs">
                    <a href="#" class="stats-tab ${this.activeTab === 'monthly' ? 'active' : ''}" onclick="window.app.views.statistiques.switchTab('monthly')">📅 Tendances Mensuelles</a>
                    <a href="#" class="stats-tab ${this.activeTab === 'yearly' ? 'active' : ''}" onclick="window.app.views.statistiques.switchTab('yearly')">📆 Tendances Annuelles</a>
                    <a href="#" class="stats-tab ${this.activeTab === 'boat' ? 'active' : ''}" onclick="window.app.views.statistiques.switchTab('boat')">🚢 Performance par Conteneur</a>
                </div>

                <div id="statsContent">
                    <div style="text-align: center; padding: 60px; color: #64748b;">
                        <i class="fas fa-spinner fa-spin fa-3x" style="margin-bottom: 15px; color: #8b5cf6;"></i>
                        <h3 style="margin:0;">Analyse des données en cours...</h3>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('contentContainer').innerHTML = html;
        this.loadData();
    },

    switchTab(tab) {
        this.activeTab = tab;
        this.render(this.app, tab);
    },

    loadData() {
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
        
        // Pour l'analyse logistique, on se base sur les livraisons
        if (this.unsubLivraisons) this.unsubLivraisons();
        const qLiv = query(collection(db, "livraisons"), where("agency", "==", activeAgency));
        this.unsubLivraisons = onSnapshot(qLiv, snap => {
            this.livraisons = snap.docs.map(d => d.data());
            this.processAndRender();
        }, error => {
            console.error("Erreur stats:", error);
            this.app.showToast("Erreur de chargement", "error");
        });
    },

    processAndRender() {
        const container = document.getElementById('statsContent');
        if (!container) return;

        if (this.livraisons.length === 0) {
            container.innerHTML = `<div style="text-align:center; padding: 60px; background:white; border-radius:16px; border:1px solid #e2e8f0;">
                <div style="font-size:48px; margin-bottom:15px;">📭</div>
                <h3 style="color:#1e293b; margin:0 0 10px 0;">Aucune donnée logistique</h3>
                <p style="color:#64748b; margin:0;">Commencez par ajouter des expéditions pour voir les statistiques.</p>
            </div>`;
            return;
        }

        const groupBy = this.activeTab;
        const grouped = {};
        let globalTotalColis = 0;
        let globalLivres = 0;
        let expéditeursSet = new Set();
        let daysCount = { 1:0, 2:0, 3:0, 4:0, 5:0, 6:0, 0:0 }; // 0 = Dimanche, 1 = Lundi...
        let expéditeursVolumes = {};

        const getKey = (dateStr) => {
            if (!dateStr) return 'Inconnu';
            if (groupBy === 'monthly') return dateStr.substring(0, 7);
            if (groupBy === 'yearly') return dateStr.substring(0, 4);
            return 'Inconnu';
        };

        this.livraisons.forEach(l => {
            // Grouper par Date ou Conteneur
            const dateKey = l.dateAjout ? l.dateAjout.split('T')[0] : null;
            const key = (groupBy === 'boat') ? (l.conteneur || 'SANS_CTN').toUpperCase() : getKey(dateKey);
            
            if (!grouped[key]) {
                grouped[key] = { total: 0, livre: 0, attente: 0, enCours: 0, incident: 0, clientsSet: new Set() };
            }

            const qte = parseInt(l.quantite) || 1;
            const exp = (l.expediteur || 'Inconnu').trim().toUpperCase();

            // Agrégation temporelle / groupée
            grouped[key].total += qte;
            grouped[key].clientsSet.add(exp);

            if (l.status === 'LIVRE') grouped[key].livre += qte;
            else if (l.status === 'EN_ATTENTE') grouped[key].attente += qte;
            else if (l.status === 'EN_COURS' || l.status === 'PARTIEL' || l.status === 'LIVRAISON_PARTIELLE') grouped[key].enCours += qte;
            else grouped[key].incident += qte;

            // Agrégation Globale (pour les KPIs du haut)
            globalTotalColis += qte;
            if (l.status === 'LIVRE') globalLivres += qte;
            expéditeursSet.add(exp);

            // Top Expéditeurs
            if (exp !== 'INCONNU' && exp !== '') {
                if (!expéditeursVolumes[exp]) expéditeursVolumes[exp] = 0;
                expéditeursVolumes[exp] += qte;
            }

            // Jours d'affluence (Basé sur la date d'ajout / réception)
            if (dateKey) {
                const day = new Date(dateKey).getDay();
                daysCount[day] += qte;
            }
        });

        // Préparation des données pour les graphiques
        let labels = Object.keys(grouped);
        if (groupBy === 'boat') {
            labels.sort((a, b) => {
                const numA = parseInt((a.match(/\d+/) || [0])[0]);
                const numB = parseInt((b.match(/\d+/) || [0])[0]);
                if (numA !== numB) return numB - numA; // Tri numérique décroissant
                return b.localeCompare(a);
            });
        } else {
            labels.sort((a,b) => b.localeCompare(a)); // Tri alphabétique inverse pour les dates (plus récent en premier)
        }
        
        // Pour le Line Chart, on veut l'ordre chronologique (plus ancien à gauche, plus récent à droite)
        const chartLabels = [...labels].reverse();
        const chartDataTotal = chartLabels.map(l => grouped[l].total);
        const chartDataLivres = chartLabels.map(l => grouped[l].livre);

        // Préparation Données Top Clients
        const topClients = Object.entries(expéditeursVolumes)
            .sort((a,b) => b[1] - a[1])
            .slice(0, 5);

        // Construction de l'interface
        const tauxLivraison = globalTotalColis > 0 ? ((globalLivres / globalTotalColis) * 100).toFixed(1) : 0;
        const avgColisClient = expéditeursSet.size > 0 ? (globalTotalColis / expéditeursSet.size).toFixed(1) : 0;

        let html = `
            <div class="kpi-grid">
                <div class="kpi-card" style="border-left: 4px solid #3b82f6;">
                    <div class="kpi-card__icon" style="background: #eff6ff; color: #3b82f6;">📦</div>
                    <div class="kpi-card__content">
                        <div class="kpi-card__value">${globalTotalColis}</div>
                        <div class="kpi-card__label">Volume Total (Colis)</div>
                    </div>
                </div>
                <div class="kpi-card" style="border-left: 4px solid #10b981;">
                    <div class="kpi-card__icon" style="background: #dcfce7; color: #10b981;">✅</div>
                    <div class="kpi-card__content">
                        <div class="kpi-card__value">${tauxLivraison}%</div>
                        <div class="kpi-card__label">Taux de Livraison</div>
                    </div>
                </div>
                <div class="kpi-card" style="border-left: 4px solid #8b5cf6;">
                    <div class="kpi-card__icon" style="background: #f3e8ff; color: #8b5cf6;">👥</div>
                    <div class="kpi-card__content">
                        <div class="kpi-card__value">${expéditeursSet.size}</div>
                        <div class="kpi-card__label">Expéditeurs Actifs</div>
                    </div>
                </div>
                <div class="kpi-card" style="border-left: 4px solid #f59e0b;">
                    <div class="kpi-card__icon" style="background: #fffbeb; color: #f59e0b;">⚖️</div>
                    <div class="kpi-card__content">
                        <div class="kpi-card__value">${avgColisClient}</div>
                        <div class="kpi-card__label">Moy. Colis / Client</div>
                    </div>
                </div>
            </div>

            <div class="charts-grid">
                <div class="chart-card">
                    <div class="chart-header">
                        <div>
                            <h3 class="chart-title">Évolution des Flux Logistiques</h3>
                            <p class="chart-subtitle">Volume reçu vs Volume livré (${groupBy === 'boat' ? 'Par Conteneur' : 'Par Période'})</p>
                        </div>
                    </div>
                    <div class="chart-wrap"><canvas id="flowChart"></canvas></div>
                </div>
                
                <div class="chart-card">
                    <div class="chart-header">
                        <div>
                            <h3 class="chart-title">État Global du Stock</h3>
                            <p class="chart-subtitle">Répartition de tous les colis enregistrés</p>
                        </div>
                    </div>
                    <div class="chart-wrap" style="display:flex; justify-content:center; align-items:center;"><canvas id="statusChart"></canvas></div>
                </div>
            </div>

            <div class="charts-grid-eq">
                <div class="chart-card">
                    <div class="chart-header">
                        <div>
                            <h3 class="chart-title">Top 5 Expéditeurs</h3>
                            <p class="chart-subtitle">Clients générant le plus grand volume de colis</p>
                        </div>
                    </div>
                    <div class="chart-wrap"><canvas id="topClientsChart"></canvas></div>
                </div>
                
                <div class="chart-card">
                    <div class="chart-header">
                        <div>
                            <h3 class="chart-title">Affluence par Jour</h3>
                            <p class="chart-subtitle">Jours de la semaine avec le plus d'expéditions</p>
                        </div>
                    </div>
                    <div class="chart-wrap"><canvas id="heatmapChart"></canvas></div>
                </div>
            </div>

            <div class="table-card">
                <div class="table-header">
                    <h3 class="table-title">Détail des Opérations</h3>
                </div>
                <div style="overflow-x: auto;">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Période / Identifiant</th>
                                <th style="text-align:right;">Total Colis</th>
                                <th style="text-align:right; color:#10b981;">Livrés</th>
                                <th style="text-align:right; color:#f59e0b;">En Cours / Attente</th>
                                <th style="text-align:right;">Expéditeurs Différents</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${labels.map(l => `
                                <tr>
                                    <td class="mono">${l}</td>
                                    <td style="text-align:right; font-weight:800; color:#0f172a;">${grouped[l].total}</td>
                                    <td style="text-align:right; font-weight:700; color:#10b981;">${grouped[l].livre}</td>
                                    <td style="text-align:right; font-weight:700; color:#f59e0b;">${grouped[l].enCours + grouped[l].attente}</td>
                                    <td style="text-align:right;">${grouped[l].clientsSet.size}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        container.innerHTML = html;

        // Rendu des Graphiques
        setTimeout(() => {
            this.renderFlowChart('flowChart', chartLabels, chartDataTotal, chartDataLivres);
            
            // Préparer les données pour le Status Chart (Total sur la sélection)
            const stAttente = labels.reduce((sum, l) => sum + grouped[l].attente, 0);
            const stCours = labels.reduce((sum, l) => sum + grouped[l].enCours, 0);
            const stIncident = labels.reduce((sum, l) => sum + grouped[l].incident, 0);
            this.renderStatusChart('statusChart', [globalLivres, stCours, stAttente, stIncident]);
            
            this.renderTopClientsChart('topClientsChart', topClients.map(c => c[0]), topClients.map(c => c[1]));
            
            // Lundi(1) à Dimanche(0)
            const heatData = [daysCount[1], daysCount[2], daysCount[3], daysCount[4], daysCount[5], daysCount[6], daysCount[0]];
            this.renderHeatmapChart('heatmapChart', ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'], heatData);
        }, 50);
    },

    renderFlowChart(canvasId, labels, dataTotal, dataLivres) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        if (this.charts[canvasId]) this.charts[canvasId].destroy();

        this.charts[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    { label: 'Colis Reçus', data: dataTotal, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', fill: true, tension: 0.4, borderWidth: 3 },
                    { label: 'Colis Livrés', data: dataLivres, borderColor: '#10b981', backgroundColor: 'transparent', fill: false, tension: 0.4, borderWidth: 3, borderDash: [5, 5] }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } }, scales: { y: { beginAtZero: true } } }
        });
    },

    renderStatusChart(canvasId, dataValues) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        if (this.charts[canvasId]) this.charts[canvasId].destroy();

        this.charts[canvasId] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Livrés', 'En Cours (Camion/Transit)', 'En Attente (Entrepôt)', 'Incidents'],
                datasets: [{ data: dataValues, backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'], hoverOffset: 4, borderWidth: 0 }]
            },
            options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'bottom' } } }
        });
    },

    renderTopClientsChart(canvasId, labels, dataValues) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        if (this.charts[canvasId]) this.charts[canvasId].destroy();

        this.charts[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: { labels: labels, datasets: [{ label: 'Volume (Colis)', data: dataValues, backgroundColor: '#8b5cf6', borderRadius: 6 }] },
            options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } } }
        });
    },

    renderHeatmapChart(canvasId, labels, dataValues) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        if (this.charts[canvasId]) this.charts[canvasId].destroy();

        // Créer un gradient pour les barres d'affluence
        const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, 'rgba(245, 158, 11, 1)');
        gradient.addColorStop(1, 'rgba(245, 158, 11, 0.2)');

        this.charts[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: { labels: labels, datasets: [{ label: 'Colis expédiés', data: dataValues, backgroundColor: gradient, borderRadius: 6, borderWidth: 1, borderColor: '#f59e0b' }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
        });
    }
};