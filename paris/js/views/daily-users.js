import { db } from '../../../firebase-config.js';
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const DailyUsersView = {
    usersData: [],
    selectedDate: new Date().toISOString().split('T')[0],

    render(app) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.dailyUsers = this;

        const html = `
            <div class="page">
                <div class="daily-header">
                    <div class="daily-header__content">
                        <div class="daily-header__icon">👥</div>
                        <div class="daily-header__info">
                            <h1 class="daily-header__title">Bilan par utilisateurs</h1>
                            <p class="daily-header__subtitle">Performance des agents</p>
                        </div>
                        <div class="daily-header__actions">
                            <input type="date" id="dateSelect" class="filter-input" value="${this.selectedDate}">
                            <button class="btn-refresh" onclick="window.app.views.dailyUsers.loadData()">🔍 Appliquer</button>
                        </div>
                    </div>
                </div>

                <div class="daily-card">
                    <div class="daily-card__header">
                        <h3 class="daily-card__title">🏆 Classement des agents</h3>
                        <div class="daily-card__filters">
                            <select id="sortBy" class="filter-select-small" onchange="window.app.views.dailyUsers.renderUsersTable()">
                                <option value="ca">Trier par CA</option>
                                <option value="factures">Trier par factures</option>
                                <option value="colis">Trier par colis</option>
                            </select>
                        </div>
                    </div>
                    <div class="daily-card__body">
                        <div class="table-wrap">
                            <table class="daily-table">
                                <thead>
                                    <tr>
                                        <th style="width: 60px;">#</th>
                                        <th>Agent</th>
                                        <th style="text-align: right;">CA généré</th>
                                        <th style="text-align: center;">Factures</th>
                                        <th style="text-align: center;">Colis</th>
                                        <th style="text-align: center;">Performance</th>
                                    </tr>
                                </thead>
                                <tbody id="usersTableBody">
                                    <tr><td colspan="6" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div class="daily-two-columns">
                    <div class="daily-card">
                        <div class="daily-card__header">
                            <h3 class="daily-card__title">📊 Répartition CA</h3>
                        </div>
                        <div class="daily-card__body">
                            <canvas id="caChart" height="250"></canvas>
                        </div>
                    </div>
                    <div class="daily-card">
                        <div class="daily-card__header">
                            <h3 class="daily-card__title">📦 Activité par agent</h3>
                        </div>
                        <div class="daily-card__body">
                            <canvas id="activityChart" height="250"></canvas>
                        </div>
                    </div>
                </div>

                <div class="daily-card">
                    <div class="daily-card__header">
                        <h3 class="daily-card__title">📋 Détail des transactions par agent</h3>
                    </div>
                    <div class="daily-card__body">
                        <div id="agentDetailsContainer"></div>
                    </div>
                </div>
            </div>

            <style>
                .daily-header { background: white; border-radius: 16px; margin-bottom: 24px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
                .daily-header__content { display: flex; align-items: center; gap: 20px; padding: 20px 24px; flex-wrap: wrap; }
                .daily-header__icon { font-size: 32px; background: #eff6ff; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 14px; color: #3b82f6; }
                .daily-header__info { flex: 1; }
                .daily-header__title { margin: 0; font-size: 22px; font-weight: 700; color: #0f172a; }
                .daily-header__subtitle { margin: 4px 0 0; font-size: 13px; color: #64748b; }
                .daily-header__actions { display: flex; gap: 10px; align-items: center; }
                .filter-input { padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 14px; outline: none; }
                .btn-refresh { background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 18px; border-radius: 10px; cursor: pointer; transition: all 0.2s; font-weight: 600; color: #475569; }
                .btn-refresh:hover { background: #e2e8f0; color: #0f172a; }
                .daily-two-columns { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 24px; margin-bottom: 24px; }
                .daily-card { background: white; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
                .daily-card__header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; flex-wrap: wrap; gap: 12px; }
                .daily-card__title { margin: 0; font-size: 16px; font-weight: 600; color: #1e293b; }
                .daily-card__body { padding: 20px; }
                .daily-card__filters { display: flex; gap: 10px; }
                .filter-select-small { padding: 6px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 12px; outline: none; }
                .daily-table { width: 100%; border-collapse: collapse; }
                .daily-table th { text-align: left; padding: 14px 12px; background: #f8fafc; font-size: 12px; font-weight: 600; color: #475569; border-bottom: 1px solid #e2e8f0; text-transform: uppercase; }
                .daily-table td { padding: 14px 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #334155; }
                .daily-table tr:hover td { background: #f8fafc; }
                .table-wrap { overflow-x: auto; }
                @media (max-width: 768px) { .daily-two-columns { grid-template-columns: 1fr; } }
            </style>
        `;

        document.getElementById('contentContainer').innerHTML = html;
        this.loadData();
    },

    async loadData() {
        const date = document.getElementById('dateSelect')?.value || this.selectedDate;
        this.selectedDate = date;
        
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
        const TAUX = 656;
        
        const qTransactions = query(
            collection(db, "transactions"),
            where("agency", "==", activeAgency),
            where("date", "==", date),
            where("isDeleted", "==", false)
        );
        
        const transSnap = await getDocs(qTransactions);
        const transactions = transSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        
        const qLivraisons = query(
            collection(db, "livraisons"),
            where("agency", "==", activeAgency),
            where("dateAjout", ">=", date + "T00:00:00") // Correction : comparaison ISO
        );
        
        const livSnap = await getDocs(qLivraisons);
        const deliveries = livSnap.docs.map(d => d.data());
        
        const usersMap = new Map();
        
        transactions.forEach(t => {
            const userName = t.saisiPar || 'Agent inconnu';
            if (!usersMap.has(userName)) usersMap.set(userName, { ca: 0, factures: 0, colis: 0, transactions: [] });
            const user = usersMap.get(userName);
            user.ca += (parseFloat(t.prix) || 0) / TAUX;
            user.factures++;
            user.transactions.push(t);
        });
        
        deliveries.forEach(d => {
            const userName = d.saisiPar || 'Agent inconnu';
            if (!usersMap.has(userName)) usersMap.set(userName, { ca: 0, factures: 0, colis: 0, transactions: [] });
            usersMap.get(userName).colis++;
        });
        
        this.usersData = Array.from(usersMap.entries()).map(([name, data]) => ({ name, ...data }));
        this.renderUsersTable();
        this.initCharts();
        this.renderAgentDetails();
    },

    renderUsersTable() {
        const tbody = document.getElementById('usersTableBody');
        const sortBy = document.getElementById('sortBy')?.value || 'ca';
        if (!tbody) return;
        
        let sorted = [...this.usersData];
        sorted.sort((a, b) => b[sortBy] - a[sortBy]);
        
        if (sorted.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #64748b;">Aucune donnée pour cette date</td></tr>';
            return;
        }
        
        const maxCA = sorted[0]?.ca || 1;
        tbody.innerHTML = sorted.map((user, index) => {
            const performance = Math.round((user.ca / maxCA) * 100);
            let medal = '';
            if (index === 0) medal = '🥇'; else if (index === 1) medal = '🥈'; else if (index === 2) medal = '🥉';
            
            return `
                <tr onclick="window.app.views.dailyUsers.showAgentDetails('${user.name.replace(/'/g, "\\'")}')" style="cursor: pointer;">
                    <td style="font-size: 18px;">${medal || (index + 1)}</td>
                    <td><strong>${user.name}</strong></td>
                    <td style="text-align: right; font-weight: 700; color: #3b82f6;">${this.app.formatMoney(user.ca)}</td>
                    <td style="text-align: center;">${user.factures}</td>
                    <td style="text-align: center;">${user.colis}</td>
                    <td style="text-align: center;">
                        <div style="background: #e2e8f0; border-radius: 10px; height: 10px; width: 100%; position: relative;">
                            <div style="width: ${performance}%; background: #10b981; height: 100%; border-radius: 10px;"></div>
                        </div>
                        <span style="font-size: 10px; color: #64748b;">${performance}%</span>
                    </td>
                </tr>
            `;
        }).join('');
    },

    initCharts() {
        if (typeof Chart === 'undefined') return;
        const caCanvas = document.getElementById('caChart');
        if (caCanvas) {
            new Chart(caCanvas, {
                type: 'bar',
                data: { labels: this.usersData.map(u => u.name), datasets: [{ label: 'CA (€)', data: this.usersData.map(u => u.ca), backgroundColor: 'rgba(59,130,246,0.7)', borderRadius: 8 }] },
                options: { responsive: true, plugins: { tooltip: { callbacks: { label: (ctx) => this.app.formatMoney(ctx.raw) } } }, scales: { y: { ticks: { callback: (v) => this.app.formatMoney(v) } } } }
            });
        }
        const activityCanvas = document.getElementById('activityChart');
        if (activityCanvas) {
            new Chart(activityCanvas, {
                type: 'radar',
                data: { labels: this.usersData.map(u => u.name), datasets: [ { label: 'Factures', data: this.usersData.map(u => u.factures), borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)' }, { label: 'Colis', data: this.usersData.map(u => u.colis), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)' } ] },
                options: { responsive: true }
            });
        }
    },

    renderAgentDetails() {
        const container = document.getElementById('agentDetailsContainer');
        if (!container) return;
        if (this.usersData.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 20px;">Aucune donnée</div>';
            return;
        }
        container.innerHTML = this.usersData.map(user => `
            <div id="agent-${user.name.replace(/[^a-zA-Z0-9]/g, '_')}" style="display: none;">
                <div style="background: #f8fafc; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
                    <h4 style="margin: 0 0 12px 0;">📋 Transactions de ${user.name}</h4>
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead><tr style="text-align:left; border-bottom: 1px solid #cbd5e1;"><th>Référence</th><th>Client</th><th>Montant</th><th>Statut</th></tr></thead>
                        <tbody>
                            ${user.transactions.map(t => {
                                const montant = (parseFloat(t.prix) || 0) / 656;
                                const reste = Math.abs(parseFloat(t.reste) || 0) / 656;
                                return `<tr><td style="padding: 8px 0;">${t.reference || '-'}</td><td>${t.nom || '-'}</td><td style="font-weight: 600;">${this.app.formatMoney(montant)}</td><td>${reste <= 0 ? '✅ Payée' : '⏳ Impayée'}</td></tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `).join('');
    },

    showAgentDetails(agentName) {
        const sectionId = `agent-${agentName.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const section = document.getElementById(sectionId);
        if (section) section.style.display = section.style.display === 'none' ? 'block' : 'none';
    }
};