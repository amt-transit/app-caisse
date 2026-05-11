import { db } from '../../../firebase-config.js';
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const DailyBilanView = {
    unsubTransactions: null,
    unsubLivraisons: null,
    todayData: {
        invoices: [],
        deliveries: [],
        totalCA: 0,
        totalColis: 0,
        totalClients: 0
    },

    render(app) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.dailyBilan = this;

        const today = new Date().toISOString().split('T')[0];
        const todayFormatted = new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        const html = `
            <div class="page">
                <!-- En-tête -->
                <div class="daily-header">
                    <div class="daily-header__content">
                        <div class="daily-header__icon">📊</div>
                        <div class="daily-header__info">
                            <h1 class="daily-header__title">Bilan du jour</h1>
                            <p class="daily-header__subtitle">${todayFormatted}</p>
                        </div>
                        <div class="daily-header__actions">
                            <button class="btn-refresh" onclick="window.app.views.dailyBilan.refresh()">
                                🔄 Actualiser
                            </button>
                        </div>
                    </div>
                </div>

                <!-- KPIs -->
                <div class="daily-kpi-grid">
                    <div class="daily-kpi-card daily-kpi-card--primary">
                        <div class="daily-kpi-card__icon">💰</div>
                        <div class="daily-kpi-card__content">
                            <div class="daily-kpi-card__value" id="kpiCA">0 €</div>
                            <div class="daily-kpi-card__label">Chiffre d'affaires</div>
                            <div class="daily-kpi-card__trend" id="trendCA">+0% vs hier</div>
                        </div>
                    </div>
                    <div class="daily-kpi-card daily-kpi-card--success">
                        <div class="daily-kpi-card__icon">📦</div>
                        <div class="daily-kpi-card__content">
                            <div class="daily-kpi-card__value" id="kpiColis">0</div>
                            <div class="daily-kpi-card__label">Colis expédiés</div>
                            <div class="daily-kpi-card__trend" id="trendColis">+0% vs hier</div>
                        </div>
                    </div>
                    <div class="daily-kpi-card daily-kpi-card--warning">
                        <div class="daily-kpi-card__icon">👥</div>
                        <div class="daily-kpi-card__content">
                            <div class="daily-kpi-card__value" id="kpiClients">0</div>
                            <div class="daily-kpi-card__label">Clients actifs</div>
                            <div class="daily-kpi-card__trend" id="trendClients">+0% vs hier</div>
                        </div>
                    </div>
                    <div class="daily-kpi-card daily-kpi-card--info">
                        <div class="daily-kpi-card__icon">💳</div>
                        <div class="daily-kpi-card__content">
                            <div class="daily-kpi-card__value" id="kpiImpayes">0 €</div>
                            <div class="daily-kpi-card__label">Impayés</div>
                            <div class="daily-kpi-card__trend" id="trendImpayes">+0% vs hier</div>
                        </div>
                    </div>
                </div>

                <!-- Graphiques et détails -->
                <div class="daily-two-columns">
                    <!-- Graphique CA par heure -->
                    <div class="daily-card">
                        <div class="daily-card__header">
                            <h3 class="daily-card__title">📈 Évolution horaire</h3>
                            <span class="daily-card__badge">Aujourd'hui</span>
                        </div>
                        <div class="daily-card__body">
                            <canvas id="hourlyChart" height="200"></canvas>
                        </div>
                    </div>

                    <!-- Top produits -->
                    <div class="daily-card">
                        <div class="daily-card__header">
                            <h3 class="daily-card__title">🏆 Top produits du jour</h3>
                            <button class="btn-link" onclick="window.app.views.dailyBilan.viewAllProducts()">Voir tout →</button>
                        </div>
                        <div class="daily-card__body">
                            <div id="topProductsList" class="top-products-list">
                                <div class="skeleton">Chargement...</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Liste des transactions du jour -->
                <div class="daily-card">
                    <div class="daily-card__header">
                        <h3 class="daily-card__title">📋 Transactions du jour</h3>
                        <div class="daily-card__filters">
                            <input type="text" id="searchTransaction" placeholder="🔍 Rechercher..." class="filter-input-small">
                            <select id="typeFilter" class="filter-select-small">
                                <option value="all">Tous les types</option>
                                <option value="facture">Factures</option>
                                <option value="paiement">Paiements</option>
                            </select>
                        </div>
                    </div>
                    <div class="daily-card__body">
                        <div class="table-wrap">
                            <table class="daily-table">
                                <thead>
                                    <tr>
                                        <th>Heure</th>
                                        <th>Référence</th>
                                        <th>Client</th>
                                        <th>Type</th>
                                        <th style="text-align: right;">Montant</th>
                                        <th style="text-align: center;">Statut</th>
                                    </tr>
                                </thead>
                                <tbody id="transactionsTableBody">
                                    <tr><td colspan="6" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- Récapitulatif par mode de paiement -->
                <div class="daily-card">
                    <div class="daily-card__header">
                        <h3 class="daily-card__title">💳 Répartition par mode de paiement</h3>
                    </div>
                    <div class="daily-card__body">
                        <div class="payment-stats-grid" id="paymentStats">
                            <div class="skeleton">Chargement...</div>
                        </div>
                    </div>
                </div>
            </div>

            <style>
                .daily-header { background: white; border-radius: var(--radius-lg); margin-bottom: 24px; border: 1px solid var(--gray-200); box-shadow: var(--shadow-md); }
                .daily-header__content { display: flex; align-items: center; gap: 20px; padding: 20px 24px; flex-wrap: wrap; }
                .daily-header__icon { font-size: 36px; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); width: 60px; height: 60px; display: flex; align-items: center; justify-content: center; border-radius: 16px; color: white; }
                .daily-header__info { flex: 1; }
                .daily-header__title { margin: 0; font-size: 24px; font-weight: 700; color: #0f172a; }
                .daily-header__subtitle { margin: 4px 0 0; font-size: 13px; color: #64748b; text-transform: capitalize; }
                .daily-header__actions { display: flex; gap: 10px; }
                .btn-refresh { background: var(--gray-100); border: 1px solid var(--gray-200); padding: 10px 18px; border-radius: 10px; cursor: pointer; transition: all 0.2s; }
                .btn-refresh:hover { background: var(--gray-200); transform: rotate(180deg); }
                .daily-kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px; margin-bottom: 24px; }
                .daily-kpi-card { background: white; border-radius: var(--radius-lg); padding: 20px; display: flex; align-items: center; gap: 16px; border: 1px solid var(--gray-200); transition: all 0.2s; }
                .daily-kpi-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
                .daily-kpi-card__icon { font-size: 36px; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 14px; }
                .daily-kpi-card--primary .daily-kpi-card__icon { background: #eff6ff; }
                .daily-kpi-card--success .daily-kpi-card__icon { background: #dcfce7; }
                .daily-kpi-card--warning .daily-kpi-card__icon { background: #fef3c7; }
                .daily-kpi-card--info .daily-kpi-card__icon { background: #e0f2fe; }
                .daily-kpi-card__content { flex: 1; }
                .daily-kpi-card__value { font-size: 28px; font-weight: 800; color: #0f172a; }
                .daily-kpi-card__label { font-size: 12px; color: #64748b; margin-top: 4px; }
                .daily-kpi-card__trend { font-size: 11px; margin-top: 6px; }
                .daily-two-columns { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 24px; margin-bottom: 24px; }
                .daily-card { background: white; border-radius: var(--radius-lg); border: 1px solid var(--gray-200); overflow: hidden; }
                .daily-card__header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--gray-200); background: var(--gray-50); flex-wrap: wrap; gap: 12px; }
                .daily-card__title { margin: 0; font-size: 16px; font-weight: 600; color: #1e293b; }
                .daily-card__badge { background: #e2e8f0; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 500; }
                .daily-card__body { padding: 20px; }
                .daily-card__filters { display: flex; gap: 10px; }
                .filter-input-small, .filter-select-small { padding: 6px 12px; border: 1px solid var(--gray-200); border-radius: 8px; font-size: 12px; }
                .btn-link { background: none; border: none; color: var(--primary); cursor: pointer; font-size: 13px; }
                .btn-link:hover { text-decoration: underline; }
                .daily-table { width: 100%; border-collapse: collapse; }
                .daily-table th { text-align: left; padding: 12px; background: var(--gray-50); font-size: 12px; font-weight: 600; color: #475569; border-bottom: 1px solid var(--gray-200); }
                .daily-table td { padding: 12px; border-bottom: 1px solid var(--gray-100); font-size: 13px; }
                .top-products-list { display: flex; flex-direction: column; gap: 12px; }
                .product-item { display: flex; align-items: center; gap: 12px; padding: 10px; background: var(--gray-50); border-radius: 10px; }
                .product-rank { width: 28px; height: 28px; background: white; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; color: var(--primary); }
                .product-info { flex: 1; }
                .product-name { font-weight: 600; font-size: 13px; }
                .product-stats { font-size: 11px; color: #64748b; }
                .product-quantity { font-weight: 700; color: var(--primary); }
                .payment-stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; }
                .payment-stat-item { text-align: center; padding: 16px; background: var(--gray-50); border-radius: 12px; }
                .payment-stat-icon { font-size: 28px; margin-bottom: 8px; }
                .payment-stat-amount { font-size: 18px; font-weight: 700; }
                .payment-stat-label { font-size: 11px; color: #64748b; margin-top: 4px; }
                .skeleton { background: linear-gradient(90deg, var(--gray-100) 25%, var(--gray-200) 50%, var(--gray-100) 75%); background-size: 200% 100%; animation: loading 1.5s infinite; border-radius: 8px; height: 60px; }
                @keyframes loading { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
                @media (max-width: 768px) { .daily-two-columns { grid-template-columns: 1fr; } .daily-kpi-grid { grid-template-columns: repeat(2, 1fr); } }
            </style>
        `;

        document.getElementById('contentContainer').innerHTML = html;
        
        this.loadTodayData();
        
        document.getElementById('searchTransaction')?.addEventListener('input', () => this.filterTransactions());
        document.getElementById('typeFilter')?.addEventListener('change', () => this.filterTransactions());
        
        setTimeout(() => this.initChart(), 100);
    },

    async loadTodayData() {
        const today = new Date().toISOString().split('T')[0];
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
        const TAUX = 656;

        const qTransactions = query(
            collection(db, "transactions"),
            where("agency", "==", activeAgency),
            where("date", "==", today),
            where("isDeleted", "==", false)
        );
        
        const transSnap = await getDocs(qTransactions);
        const transactions = transSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        
        const qLivraisons = query(
            collection(db, "livraisons"),
            where("agency", "==", activeAgency),
            where("dateAjout", ">=", today + "T00:00:00") // Correction : comparaison stricte ISO à minuit
        );
        
        const livSnap = await getDocs(qLivraisons);
        const deliveries = livSnap.docs.map(d => d.data());
        
        const totalCA = transactions.reduce((sum, t) => sum + ((parseFloat(t.prix) || 0) / TAUX), 0);
        const totalImpayes = transactions.reduce((sum, t) => sum + (Math.abs(parseFloat(t.reste) || 0) / TAUX), 0);
        const totalColis = deliveries.length;
        const uniqueClients = new Set(transactions.map(t => t.nom).filter(Boolean));
        
        this.todayData = { transactions, deliveries, totalCA, totalColis, totalClients: uniqueClients.size, totalImpayes };
        
        this.updateKPIs();
        this.renderTransactions();
        this.renderTopProducts();
        this.renderPaymentStats();
    },

    updateKPIs() {
        const elCA = document.getElementById('kpiCA');
        if (elCA) elCA.textContent = this.app.formatMoney(this.todayData.totalCA);
        
        const elColis = document.getElementById('kpiColis');
        if (elColis) elColis.textContent = this.todayData.totalColis;
        
        const elClients = document.getElementById('kpiClients');
        if (elClients) elClients.textContent = this.todayData.totalClients;
        
        const elImpayes = document.getElementById('kpiImpayes');
        if (elImpayes) elImpayes.textContent = this.app.formatMoney(this.todayData.totalImpayes);
    },

    renderTransactions(filtered = null) {
        const tbody = document.getElementById('transactionsTableBody');
        if (!tbody) return;
        
        const dataToRender = filtered || this.todayData.transactions;
        
        if (dataToRender.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #64748b;">Aucune transaction aujourd\'hui</td></tr>';
            return;
        }
        
        const TAUX = 656;
        const isMobile = window.innerWidth <= 768;
        
        if (isMobile) {
            tbody.innerHTML = dataToRender.map(t => {
                const montant = (parseFloat(t.prix) || 0) / TAUX;
                const reste = Math.abs(parseFloat(t.reste) || 0) / TAUX;
                const isPayee = reste <= 0;
                
                return `
                    <tr class="compact-row">
                        <td colspan="6">
                            <div class="compact-mob-card">
                                <div class="cmc-header">
                                    <div class="cmc-ref-group">
                                        <span class="cmc-ref">${t.reference || '-'}</span>
                                    </div>
                                    <span class="status-badge ${isPayee ? 'badge-success' : 'badge-danger'}" style="font-size:9px; padding:2px 6px;">
                                        ${isPayee ? 'Payée' : 'Impayée'}
                                    </span>
                                </div>
                                <div class="cmc-body">
                                    <div class="cmc-route">
                                        <strong>${t.nom || '-'}</strong>
                                    </div>
                                    <div class="cmc-meta" style="margin-top:4px;">
                                        <i class="fas fa-credit-card"></i> ${t.modePaiement || 'Facture'}
                                    </div>
                                </div>
                                <div class="cmc-footer" style="justify-content: space-between;">
                                    <div style="font-size:12px; color:#64748b;">${t.date || '-'}</div>
                                    <div class="cmc-finance">
                                        <div class="cmc-amount" style="color: #10b981;">${this.app.formatMoney(montant)}</div>
                                    </div>
                                </div>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        } else {
            tbody.innerHTML = dataToRender.map(t => {
                const montant = (parseFloat(t.prix) || 0) / TAUX;
                const reste = Math.abs(parseFloat(t.reste) || 0) / TAUX;
                const isPayee = reste <= 0;
                
                return `
                    <tr>
                        <td>${t.date || '-'}</td>
                        <td><strong>${t.reference || '-'}</strong></td>
                        <td>${t.nom || '-'}</td>
                        <td>${t.modePaiement || 'Facture'}</td>
                        <td style="text-align: right; font-weight: 600;">${this.app.formatMoney(montant)}</td>
                        <td style="text-align: center;">
                            <span class="badge ${isPayee ? 'badge-success' : 'badge-danger'}">
                                ${isPayee ? 'Payée' : 'Impayée'}
                            </span>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    },

    renderTopProducts() {
        const container = document.getElementById('topProductsList');
        if (!container) return;
        
        const productCount = new Map();
        this.todayData.deliveries.forEach(d => {
            if (d.description) {
                const desc = d.description;
                productCount.set(desc, (productCount.get(desc) || 0) + 1);
            }
        });
        
        const topProducts = Array.from(productCount.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
        
        if (topProducts.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 20px; color: #64748b;">Aucun produit expédié aujourd\'hui</div>';
            return;
        }
        
        container.innerHTML = topProducts.map(([name, count], index) => `
            <div class="product-item">
                <div class="product-rank">${index + 1}</div>
                <div class="product-info">
                    <div class="product-name">${name}</div>
                    <div class="product-stats">${count} colis expédiés</div>
                </div>
                <div class="product-quantity">${count}x</div>
            </div>
        `).join('');
    },

    renderPaymentStats() {
        const container = document.getElementById('paymentStats');
        if (!container) return;
        
        const paymentMethods = new Map();
        const TAUX = 656;
        
        this.todayData.transactions.forEach(t => {
            const mode = t.modePaiement || 'AUTRE';
            const montant = (parseFloat(t.prix) || 0) / TAUX;
            paymentMethods.set(mode, (paymentMethods.get(mode) || 0) + montant);
        });
        
        if (paymentMethods.size === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 20px; color: #64748b;">Aucune donnée de paiement</div>';
            return;
        }
        
        const icons = { 'ESPECES': '💵', 'CB': '💳', 'VIREMENT': '🏦', 'CHEQUE': '📝', 'AUTRE': '💰' };
        
        container.innerHTML = Array.from(paymentMethods.entries()).map(([method, amount]) => `
            <div class="payment-stat-item">
                <div class="payment-stat-icon">${icons[method] || '💰'}</div>
                <div class="payment-stat-amount">${this.app.formatMoney(amount)}</div>
                <div class="payment-stat-label">${method}</div>
            </div>
        `).join('');
    },

    filterTransactions() {
        const searchTerm = (document.getElementById('searchTransaction')?.value || '').toLowerCase();
        const typeFilter = document.getElementById('typeFilter')?.value || 'all';
        
        let filtered = [...this.todayData.transactions];
        if (searchTerm) filtered = filtered.filter(t => (t.reference || '').toLowerCase().includes(searchTerm) || (t.nom || '').toLowerCase().includes(searchTerm));
        
        if (typeFilter !== 'all') {
            if (typeFilter === 'facture') filtered = filtered.filter(t => !t.modePaiement);
            else if (typeFilter === 'paiement') filtered = filtered.filter(t => t.modePaiement);
        }
        this.renderTransactions(filtered);
    },

    initChart() {
        const canvas = document.getElementById('hourlyChart');
        if (!canvas || typeof Chart === 'undefined') return;
        const hours = Array.from({ length: 12 }, (_, i) => `${9 + i}h`);
        const data = [0, 0, 150, 280, 420, 350, 500, 680, 450, 320, 180, 0];
        new Chart(canvas, {
            type: 'line',
            data: { labels: hours, datasets: [{ label: 'CA (€)', data: data, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', fill: true, tension: 0.4, pointBackgroundColor: '#3b82f6', pointBorderColor: 'white', pointBorderWidth: 2, pointRadius: 4 }] },
            options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${this.app.formatMoney(ctx.raw)}` } } }, scales: { y: { ticks: { callback: (v) => this.app.formatMoney(v) }, beginAtZero: true } } }
        });
    },

    refresh() { this.loadTodayData(); this.app.showToast("Données actualisées", "success"); },
    viewAllProducts() { this.app.renderPage('products-list'); }
};