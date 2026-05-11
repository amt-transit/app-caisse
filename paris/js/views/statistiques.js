import { db } from '../../../firebase-config.js';
import { collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const StatistiquesView = {
    unsubTrans: null,
    transactions: [],
    activeTab: 'monthly',
    charts: {},
    TAUX_CONVERSION: 656,

    render(app, subView = 'monthly') {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.statistiques = this;
        this.activeTab = subView;

        const html = `
            <div class="page">
                <div class="factures-header">
                    <div class="factures-header__content">
                        <div class="factures-header__icon" style="background: #f3e8ff; color: #7e22ce;">📊</div>
                        <div class="factures-header__info">
                            <h1 class="factures-header__title">Statistiques</h1>
                            <p class="factures-header__subtitle">Analyse de l'activité commerciale.</p>
                        </div>
                    </div>
                </div>

                <div class="sub-nav" style="margin-bottom: 20px;">
                    <a href="#" class="tab-btn ${this.activeTab === 'monthly' ? 'active' : ''}" onclick="window.app.views.statistiques.switchTab('monthly')">Stats Mensuelles</a>
                    <a href="#" class="tab-btn ${this.activeTab === 'yearly' ? 'active' : ''}" onclick="window.app.views.statistiques.switchTab('yearly')">Stats Annuelles</a>
                    <a href="#" class="tab-btn ${this.activeTab === 'boat' ? 'active' : ''}" onclick="window.app.views.statistiques.switchTab('boat')">Stats par Conteneur</a>
                </div>

                <div id="statsContent">
                    <div style="text-align: center; padding: 50px;"><i class="fas fa-spinner fa-spin fa-2x"></i></div>
                </div>
            </div>
        `;
        document.getElementById('contentContainer').innerHTML = html;
        this.loadData();
    },

    switchTab(tab) {
        this.activeTab = tab;
        document.querySelectorAll('.sub-nav .tab-btn').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.querySelector(`.sub-nav .tab-btn[onclick*="'${tab}'"]`);
        if (activeBtn) activeBtn.classList.add('active');
        this.renderContent();
    },

    loadData() {
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
        
        if (this.unsubTrans) this.unsubTrans();
        const qTrans = query(collection(db, "transactions"), where("agency", "==", activeAgency), where("isDeleted", "==", false));
        this.unsubTrans = onSnapshot(qTrans, snap => {
            this.transactions = snap.docs.map(d => d.data());
            this.renderContent();
        });
    },

    renderContent() {
        if (!this.transactions) return;
        this.renderGroupedView(this.activeTab);
    },

    renderGroupedView(groupBy) {
        const container = document.getElementById('statsContent');
        if (!container) return;

        const data = this.processData(groupBy);
        const labels = Object.keys(data).sort((a,b) => b.localeCompare(a));
        if (labels.length === 0) {
            container.innerHTML = '<div class="form-card" style="text-align:center; padding: 40px;">Aucune donnée à afficher.</div>';
            return;
        }

        const colisData = labels.map(l => data[l].colis);
        const clientsData = labels.map(l => data[l].clients);
        const avgPriceData = labels.map(l => data[l].avgPrice);

        let title = '';
        if (groupBy === 'monthly') title = 'Statistiques Mensuelles';
        else if (groupBy === 'yearly') title = 'Statistiques Annuelles';
        else if (groupBy === 'boat') title = 'Statistiques par Conteneur';

        let tableHtml = `
            <div class="table-wrap">
                <table class="factures-table">
                    <thead>
                        <tr>
                            <th>Période</th>
                            <th style="text-align: right;">Nombre de Colis</th>
                            <th style="text-align: right;">Clients Uniques</th>
                            <th style="text-align: right;">Prix Moyen / Colis</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${labels.map(l => `
                            <tr>
                                <td><strong>${l}</strong></td>
                                <td style="text-align: right;">${data[l].colis}</td>
                                <td style="text-align: right;">${data[l].clients}</td>
                                <td style="text-align: right; font-weight: bold;">${this.app.formatMoney(data[l].avgPrice)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = `
            <div class="factures-table-card">
                <div class="factures-table-header">
                    <h3 class="factures-table-title">${title}</h3>
                </div>
                <div style="padding: 20px;">
                    <canvas id="statsChart"></canvas>
                </div>
                ${tableHtml}
            </div>
        `;

        this.renderChart('statsChart', labels, colisData, clientsData, avgPriceData);
    },

    processData(groupBy) {
        const grouped = {};
        const getKey = (dateStr) => {
            if (!dateStr) return 'Inconnu';
            if (groupBy === 'monthly') return dateStr.substring(0, 7);
            if (groupBy === 'yearly') return dateStr.substring(0, 4);
            return 'Inconnu';
        };

        this.transactions.forEach(t => {
            const key = (groupBy === 'boat') ? (t.conteneur || 'SANS_CTN') : getKey(t.date);
            if (!grouped[key]) grouped[key] = { ca: 0, colis: 0, clientsSet: new Set() };
            
            grouped[key].ca += (parseFloat(t.prix) || 0) / this.TAUX_CONVERSION;
            grouped[key].colis += (t.quantite || 1);
            if (t.nom) grouped[key].clientsSet.add(t.nom);
        });

        for (const key in grouped) {
            grouped[key].clients = grouped[key].clientsSet.size;
            grouped[key].avgPrice = grouped[key].colis > 0 ? grouped[key].ca / grouped[key].colis : 0;
            delete grouped[key].clientsSet; // clean up
        }

        return grouped;
    },

    renderChart(canvasId, labels, colisData, clientsData, avgPriceData) {
        const ctx = document.getElementById(canvasId)?.getContext('2d');
        if (!ctx) return;

        if (this.charts[canvasId]) this.charts[canvasId].destroy();

        this.charts[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    { label: "Nombre de Colis", data: colisData, backgroundColor: 'rgba(59, 130, 246, 0.7)', yAxisID: 'y' },
                    { label: 'Clients Uniques', data: clientsData, backgroundColor: 'rgba(245, 158, 11, 0.7)', yAxisID: 'y' },
                    { label: 'Prix Moyen / Colis (€)', data: avgPriceData, type: 'line', borderColor: 'rgba(16, 185, 129, 1)', fill: false, yAxisID: 'y1', tension: 0.1 }
                ]
            },
            options: {
                responsive: true,
                scales: {
                    y: { type: 'linear', display: true, position: 'left', beginAtZero: true, title: { display: true, text: 'Nombre' } },
                    y1: { type: 'linear', display: true, position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, title: { display: true, text: 'Montant (€)' }, ticks: { callback: (value) => this.app.formatMoney(value) } }
                },
                plugins: { tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${context.dataset.yAxisID === 'y1' ? this.app.formatMoney(context.raw) : context.raw}` } } }
            }
        });
    }
};