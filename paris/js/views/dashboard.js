export const DashboardView = {
    render(app) {
        const totalInvoices = app.data.invoices.reduce((s, i) => s + i.amount, 0);
        const pendingAppointments = app.data.appointments.filter(a => a.status === 'en_attente').length;
        const activePrograms = app.data.programs.filter(p => p.status === 'en_cours').length;
        
        // Helper pour afficher les boutons d'accès rapide conditionnellement
        const renderQuickActionButton = (page, icon, label, color) => {
            if (!app.checkPageAccess(page)) return ''; // Ne rien afficher si l'accès est refusé
            return `
                <button onclick="app.renderPage('${page}')" class="quick-action-btn" style="display:flex; flex-direction:column; align-items:center; padding:15px; background:white; border:1px solid #e2e8f0; border-radius:12px; cursor:pointer; transition:all 0.2s; box-shadow:0 2px 4px rgba(0,0,0,0.02);">
                    <i class="fas ${icon}" style="font-size:24px; color:${color}; margin-bottom:10px;"></i>
                    <span style="font-weight:600; color:#334155; font-size:12px; text-align:center;">${label}</span>
                </button>
            `;
        };
        
        const html = `
            <style>
                .quick-action-btn:hover { transform: translateY(-3px) !important; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1) !important; border-color: #cbd5e1 !important; }
            </style>
            
            <h3 style="margin: 0 0 20px 0; color: #0f172a; font-size: 20px; font-weight: 800;">🚀 Accès rapide</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(min(130px, 45%), 1fr)); gap: 12px; margin-bottom: 30px;">
                ${renderQuickActionButton('invoice-new', 'fa-file-invoice', 'Nouvelle facture', '#3b82f6')}
                ${renderQuickActionButton('invoices-list', 'fa-list', 'Liste factures', '#64748b')}
                ${renderQuickActionButton('quote-new', 'fa-file-signature', 'Nouveau devis', '#10b981')}
                ${renderQuickActionButton('quote-requests', 'fa-inbox', 'Demandes devis', '#f59e0b')}
                ${renderQuickActionButton('appointments-pending', 'fa-calendar-check', 'RDV à valider', '#ef4444')}
                ${renderQuickActionButton('notifications', 'fa-bell', 'Notifications', '#8b5cf6')}
                ${renderQuickActionButton('sms-send', 'fa-sms', 'Envoi SMS', '#ec4899')}
                ${renderQuickActionButton('departures-calendar', 'fa-ship', 'Dates départ', '#0ea5e9')}
                ${renderQuickActionButton('clients-list', 'fa-users', 'Clients', '#14b8a6')}
                ${renderQuickActionButton('balance-monthly', 'fa-chart-line', 'Bilan mois', '#f43f5e')}
                ${renderQuickActionButton('scan-warehouse', 'fa-barcode', 'Numérisation', '#6366f1')}
                ${renderQuickActionButton('finance-expenses', 'fa-money-bill-wave', 'Dépenses', '#f97316')}
            </div>

            <h3 style="margin: 0 0 20px 0; color: #0f172a; font-size: 20px; font-weight: 800;">📊 Indicateurs du mois</h3>
            <div class="stats-grid" style="margin-bottom: 30px;">
                <div class="stat-card">
                    <div class="stat-icon" style="background:#dbeafe; color:#2563eb;"><i class="fas fa-file-invoice"></i></div>
                    <div class="stat-value">${app.formatMoney(totalInvoices)}</div>
                    <div class="stat-label">Chiffre d'affaires</div>
                    <div class="stat-trend"><span style="color:#10b981;">↑ 12%</span> vs mois dernier</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon" style="background:#d1fae5; color:#059669;"><i class="fas fa-calendar"></i></div>
                    <div class="stat-value">${pendingAppointments}</div>
                    <div class="stat-label">RDV en attente</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon" style="background:#fef3c7; color:#d97706;"><i class="fas fa-tasks"></i></div>
                    <div class="stat-value">${activePrograms}</div>
                    <div class="stat-label">Programmes actifs</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon" style="background:#ede9fe; color:#7c3aed;"><i class="fas fa-box"></i></div>
                    <div class="stat-value">${app.data.containers.length}</div>
                    <div class="stat-label">Conteneurs en transit</div>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 25px; margin-bottom: 30px;">
                <div style="background: white; border-radius: 16px; padding: 20px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                    <h3 style="margin: 0 0 20px; font-size: 16px;">📈 Évolution Mensuelle</h3>
                    <div style="position: relative; height: 250px; width: 100%;">
                        <canvas id="revenueChart"></canvas>
                    </div>
                </div>
                
                <div style="background: white; border-radius: 16px; padding: 20px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                    <h3 style="margin: 0 0 20px; font-size: 16px;">🧾 Dernières Factures</h3>
                    <div style="max-height: 250px; overflow-y: auto;">
                        ${app.data.invoices.slice(0, 5).map(inv => `
                            <div style="display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f1f5f9;">
                                <div><strong>${inv.number}</strong><br><span style="font-size:12px; color:#64748b;">${inv.client}</span></div>
                                <div style="text-align: right;"><strong>${app.formatMoney(inv.amount)}</strong><br><span class="badge ${inv.status === 'payée' ? 'badge-success' : (inv.status === 'envoyée' ? 'badge-info' : 'badge-warning')}">${inv.status}</span></div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>

            <h3 style="margin: 0 0 20px 0; color: #0f172a; font-size: 20px; font-weight: 800;">🏆 Agents de premier plan</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 15px; margin-bottom: 30px;">
                ${app.data.agents.slice(0,3).map((agent, i) => `
                    <div style="background: white; padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0; display: flex; align-items: center; gap: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                        <div style="width: 50px; height: 50px; border-radius: 50%; background: #eff6ff; display: flex; justify-content: center; align-items: center; font-size: 20px; color: #3b82f6;">
                            <i class="fas fa-user"></i>
                        </div>
                        <div style="flex: 1;">
                            <h4 style="margin: 0; color: #1e293b; font-size: 14px;">${agent.name}</h4>
                            <p style="margin: 2px 0 0 0; color: #64748b; font-size: 11px;">${agent.role}</p>
                            <div style="margin-top: 5px; font-size: 11px; font-weight: bold; color: #10b981;">${95 - (i*5)}% Perf.</div>
                        </div>
                        <div style="font-size: 20px;">
                            ${i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        
        document.getElementById('contentContainer').innerHTML = html;
        
        // Initialiser le graphique
        setTimeout(() => {
            const ctx = document.getElementById('revenueChart')?.getContext('2d');
            if (ctx && typeof Chart !== 'undefined') {
                new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'],
                        datasets: [{
                            label: 'CA (€)',
                            data: [1200, 1500, 1800, 2200, 2500, 2800, 3100, 3400, 3700, 4000, 4300, 4600],
                            borderColor: '#3b82f6',
                            backgroundColor: 'rgba(59,130,246,0.1)',
                            fill: true,
                            tension: 0.4
                        }]
                    },
                    options: { responsive: true, maintainAspectRatio: false }
                });
            }
        }, 100);
    }
};