import { db } from '../../../firebase-config.js';
import { collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const BilansFinanciersView = {
    unsubTrans: null,
    unsubExp: null,
    transactions: [],
    expenses: [],
    activeTab: 'monthly',
    charts: {},
    TAUX_CONVERSION: 656,

    render(app, subView = 'monthly') {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.bilansFinanciers = this;
        this.activeTab = subView;

        const html = `
            <div class="page">
                <div class="factures-header">
                    <div class="factures-header__content">
                        <div class="factures-header__icon" style="background: #f0fdf4; color: #16a34a;">📈</div>
                        <div class="factures-header__info">
                            <h1 class="factures-header__title">Bilans Financiers</h1>
                            <p class="factures-header__subtitle">Analyse du chiffre d'affaires, des dépenses et des bénéfices.</p>
                        </div>
                    </div>
                </div>

                <div class="sub-nav" style="margin-bottom: 20px;">
                    <a href="#" class="tab-btn ${this.activeTab === 'monthly' ? 'active' : ''}" onclick="window.app.views.bilansFinanciers.switchTab('monthly')">Bilan Mensuel</a>
                    <a href="#" class="tab-btn ${this.activeTab === 'yearly' ? 'active' : ''}" onclick="window.app.views.bilansFinanciers.switchTab('yearly')">Bilan Annuel</a>
                    <a href="#" class="tab-btn ${this.activeTab === 'boat' ? 'active' : ''}" onclick="window.app.views.bilansFinanciers.switchTab('boat')">Bilan par Conteneur</a>
                </div>

                <div id="bilanContent">
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

        if (this.unsubExp) this.unsubExp();
        const qExp = query(collection(db, "expenses"), where("agency", "==", activeAgency), where("isDeleted", "==", false));
        this.unsubExp = onSnapshot(qExp, snap => {
            this.expenses = snap.docs.map(d => d.data());
            this.renderContent();
        });
    },

    renderContent() {
        if (!this.transactions || !this.expenses) return;
        this.renderGroupedView(this.activeTab);
    },

    renderGroupedView(groupBy) {
        const container = document.getElementById('bilanContent');
        if (!container) return;

        const data = this.processData(groupBy);
        const labels = Object.keys(data).sort((a,b) => b.localeCompare(a)); // Tri du plus récent au plus ancien
        if (labels.length === 0) {
            container.innerHTML = '<div class="form-card" style="text-align:center; padding: 40px;">Aucune donnée à afficher pour cette période.</div>';
            return;
        }

        const caData = labels.map(l => data[l].ca);
        const depensesData = labels.map(l => data[l].depenses);
        const beneficeData = labels.map(l => data[l].benefice);

        let title = '';
        if (groupBy === 'monthly') title = 'Bilan Mensuel';
        else if (groupBy === 'yearly') title = 'Bilan Annuel';
        else if (groupBy === 'boat') title = 'Bilan par Conteneur';

        let tableHtml = `
            <div class="table-wrap">
                <table class="factures-table">
                    <thead>
                        <tr>
                            <th>Période</th>
                            <th style="text-align: right;">Chiffre d'Affaires</th>
                            <th style="text-align: right;">Dépenses</th>
                            <th style="text-align: right;">Bénéfice</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${labels.map(l => `
                            <tr>
                                <td><strong>${l}</strong></td>
                                <td style="text-align: right; color: #3b82f6;">${this.app.formatMoney(data[l].ca)}</td>
                                <td style="text-align: right; color: #ef4444;">${this.app.formatMoney(data[l].depenses)}</td>
                                <td style="text-align: right; font-weight: bold; color: ${data[l].benefice >= 0 ? '#10b981' : '#ef4444'};">
                                    ${this.app.formatMoney(data[l].benefice)}
                                </td>
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
                    <canvas id="bilanChart"></canvas>
                </div>
                ${tableHtml}
            </div>
        `;

        this.renderChart('bilanChart', labels, caData, depensesData, beneficeData);
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
            if (!grouped[key]) grouped[key] = { ca: 0, depenses: 0, benefice: 0 };
            grouped[key].ca += (parseFloat(t.prix) || 0) / this.TAUX_CONVERSION;
        });

        this.expenses.forEach(e => {
            const key = (groupBy === 'boat') ? (e.conteneur || 'SANS_CTN') : getKey(e.date);
            if (!grouped[key]) grouped[key] = { ca: 0, depenses: 0, benefice: 0 };
            grouped[key].depenses += parseFloat(e.montant) || 0;
        });

        for (const key in grouped) {
            grouped[key].benefice = grouped[key].ca - grouped[key].depenses;
        }

        return grouped;
    },

    renderChart(canvasId, labels, caData, depensesData, beneficeData) {
        const ctx = document.getElementById(canvasId)?.getContext('2d');
        if (!ctx) return;

        if (this.charts[canvasId]) this.charts[canvasId].destroy();

        this.charts[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    { label: "Chiffre d'Affaires", data: caData, backgroundColor: 'rgba(59, 130, 246, 0.7)' },
                    { label: 'Dépenses', data: depensesData, backgroundColor: 'rgba(239, 68, 68, 0.7)' },
                    { label: 'Bénéfice', data: beneficeData, backgroundColor: 'rgba(16, 185, 129, 0.7)' }
                ]
            },
            options: {
                responsive: true,
                scales: { y: { beginAtZero: true, ticks: { callback: (value) => this.app.formatMoney(value) } } },
                plugins: { tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${this.app.formatMoney(context.raw)}` } } }
            }
        });
    }
};