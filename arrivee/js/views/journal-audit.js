import { db } from '../../../firebase-config.js';
import { collection, query, orderBy, onSnapshot, limit, where } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const AuditLogView = {
    unsub: null,
    logs: [],
    filteredLogs: [],
    autoRefresh: true,
    currentPage: 1,
    itemsPerPage: 50,
    usersList: new Set(),

    render(app, container) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.auditLog = this;

        const html = `
            <style>
                .al-page { max-width: 1400px; margin: 0 auto; animation: fadeIn 0.3s ease; color: #1e293b; }
                
                /* Header */
                .al__header { display: flex; justify-content: space-between; align-items: center; background: white; padding: 20px 25px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; margin-bottom: 24px; flex-wrap: wrap; gap: 15px; }
                .al__title { margin: 0; font-size: 22px; font-weight: 800; color: #0f172a; display: flex; align-items: center; gap: 10px; }
                .al__subtitle { margin: 4px 0 0 0; font-size: 13px; color: #64748b; }
                .al__header-actions { display: flex; align-items: center; gap: 15px; }
                .al__auto-refresh { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: #475569; cursor: pointer; }
                .al__btn { padding: 10px 16px; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer; transition: 0.2s; border: 1px solid transparent; display: flex; align-items: center; justify-content: center; gap: 6px; }
                .al__btn--primary { background: #3b82f6; color: white; box-shadow: 0 2px 4px rgba(59,130,246,0.2); }
                .al__btn--primary:hover { background: #2563eb; }
                .al__btn--ghost { background: white; border-color: #cbd5e1; color: #475569; }
                .al__btn--ghost:hover { background: #f1f5f9; color: #0f172a; }
                .al__btn--sm { padding: 6px 12px; font-size: 12px; }

                /* KPIs */
                .al__kpi-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px; margin-bottom: 24px; }
                .al__kpi { background: white; padding: 20px; border-radius: 16px; border: 1px solid #e2e8f0; display: flex; align-items: center; gap: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); transition: 0.2s; }
                .al__kpi:hover { transform: translateY(-2px); box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
                .al__kpi-icon { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px; flex-shrink: 0; }
                .al__kpi-val { font-size: 24px; font-weight: 900; color: #0f172a; line-height: 1; margin-bottom: 4px; }
                .al__kpi-val--sm { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px; }
                .al__kpi-lbl { font-size: 12px; color: #64748b; font-weight: 600; }
                
                .al__kpi--indigo .al__kpi-icon { background: #e0e7ff; color: #4f46e5; }
                .al__kpi--green .al__kpi-icon { background: #dcfce7; color: #16a34a; }
                .al__kpi--blue .al__kpi-icon { background: #dbeafe; color: #2563eb; }
                .al__kpi--red .al__kpi-icon { background: #fee2e2; color: #ef4444; }
                .al__kpi--purple .al__kpi-icon { background: #f3e8ff; color: #9333ea; }
                .al__kpi--amber .al__kpi-icon { background: #fef3c7; color: #d97706; }

                /* Charts Section */
                .al__charts-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 20px; margin-bottom: 24px; }
                .al__chart-card { background: white; border-radius: 16px; padding: 20px; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.02); display: flex; flex-direction: column; }
                .al__chart-title { margin: 0 0 20px 0; font-size: 15px; font-weight: 800; color: #1e293b; }
                
                /* Custom CSS Bar Charts */
                .al__bar-chart, .al__hour-chart { display: flex; align-items: flex-end; gap: 8px; height: 160px; padding-bottom: 20px; flex: 1; }
                .al__hour-chart { gap: 2px; }
                .al__bar-col, .al__hour-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; position: relative; height: 100%; }
                .al__bar { width: 100%; max-width: 30px; background: linear-gradient(180deg, #3b82f6 0%, #60a5fa 100%); border-radius: 4px 4px 0 0; transition: height 0.5s ease; min-height: 2px; }
                .al__hour-bar { width: 100%; background: #8b5cf6; border-radius: 2px 2px 0 0; transition: height 0.5s ease; min-height: 1px; }
                .al__hour-bar:hover, .al__bar:hover { filter: brightness(1.1); cursor: pointer; }
                .al__bar-label { position: absolute; bottom: -20px; font-size: 10px; color: #64748b; font-weight: 600; white-space: nowrap; }
                .al__hour-label { position: absolute; bottom: -20px; font-size: 9px; color: #94a3b8; }
                .al__bar-value { font-size: 10px; font-weight: 800; color: #0f172a; margin-bottom: 4px; }

                /* Entity List */
                .al__entity-list { display: flex; flex-direction: column; gap: 12px; overflow-y: auto; max-height: 160px; padding-right: 5px; }
                .al__entity-row { display: flex; align-items: center; gap: 10px; }
                .al__entity-name { width: 80px; font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; }
                .al__entity-bar-bg { flex: 1; height: 8px; background: #f1f5f9; border-radius: 4px; overflow: hidden; }
                .al__entity-bar-fill { height: 100%; background: #10b981; border-radius: 4px; }
                .al__entity-count { width: 40px; text-align: right; font-size: 12px; font-weight: 800; color: #0f172a; }

                /* Section Headers & Tables */
                .al__section-title { font-size: 18px; font-weight: 800; color: #0f172a; margin: 0 0 15px 0; }
                .al__perf-wrap, .al__table-wrap { background: white; border-radius: 16px; border: 1px solid #e2e8f0; overflow-x: auto; box-shadow: 0 2px 4px rgba(0,0,0,0.02); margin-bottom: 24px; }
                .al__table, .al__perf-table { width: 100%; border-collapse: collapse; }
                .al__table th, .al__perf-table th { background: #f8fafc; padding: 12px 15px; text-align: left; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; white-space: nowrap; }
                .al__table td, .al__perf-table td { padding: 12px 15px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #334155; }
                .al__table tr:hover td, .al__perf-table tr:hover td { background: #f8fafc; }

                .al__rank { width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; background: #f1f5f9; border-radius: 50%; font-size: 11px; font-weight: bold; color: #64748b; }
                .al__rank--gold { background: #fef3c7; color: #d97706; }
                .al__rank--silver { background: #f1f5f9; color: #475569; }
                .al__rank--bronze { background: #ffedd5; color: #9a3412; }
                .al__perf-name { font-weight: 700; color: #0f172a; }
                .al__mini-badge { padding: 2px 6px; border-radius: 10px; font-size: 11px; font-weight: 700; min-width: 24px; display: inline-block; text-align: center; }
                .al__mini-badge--green { background: #dcfce7; color: #166534; }
                .al__mini-badge--blue { background: #e0f2fe; color: #0369a1; }
                .al__mini-badge--red { background: #fee2e2; color: #991b1b; }
                .al__mini-badge--purple { background: #f3e8ff; color: #7e22ce; }

                /* Filters */
                .al__filters { background: white; padding: 20px; border-radius: 16px; border: 1px solid #e2e8f0; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
                .al__filter-row { display: flex; flex-wrap: wrap; gap: 12px; }
                .al__input, .al__select { padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; outline: none; transition: 0.2s; background: white; flex: 1; min-width: 140px; }
                .al__input:focus, .al__select:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
                
                /* Log Table specific */
                .al__td-date { font-weight: 600; color: #475569; font-size: 12px; white-space: nowrap; }
                .al__action-badge { padding: 4px 8px; border-radius: 6px; font-size: 10px; font-weight: 800; white-space: nowrap; }
                .al__td-desc { font-weight: 600; color: #1e293b; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                .al__user-cell { display: flex; flex-direction: column; }
                .al__user-name { font-weight: 700; color: #0f172a; font-size: 12px; }
                .al__user-id { font-size: 10px; color: #94a3b8; font-family: monospace; }
                .al__entity-tag { background: #f1f5f9; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; }
                .al__td-id, .al__td-ref { font-family: monospace; font-size: 12px; color: #64748b; }
                .al__td-ip { font-family: monospace; font-size: 11px; color: #94a3b8; }
                .al__status-dot { padding: 2px 6px; border-radius: 10px; font-size: 10px; font-weight: 800; }
                .al__status-dot--ok { background: #dcfce7; color: #166534; }
                .al__status-dot--err { background: #fee2e2; color: #991b1b; }
                .al__status-dot--warn { background: #ffedd5; color: #9a3412; }

                /* Pagination */
                .al__pagination { display: flex; justify-content: space-between; align-items: center; padding: 15px 20px; background: white; border-top: 1px solid #e2e8f0; }
                .al__page-btn { padding: 8px 16px; border: 1px solid #cbd5e1; border-radius: 8px; background: white; cursor: pointer; font-weight: 600; color: #475569; transition: 0.2s; }
                .al__page-btn:hover:not(:disabled) { background: #f1f5f9; color: #0f172a; }
                .al__page-btn:disabled { opacity: 0.5; cursor: not-allowed; }
                .al__page-info { font-size: 13px; color: #64748b; font-weight: 500; }
            </style>

            <div class="al-page">
                <div class="al__header">
                    <div>
                        <h1 class="al__title">📋 Activités Log</h1>
                        <p class="al__subtitle">Suivi en temps réel des actions de tous les agents</p>
                    </div>
                    <div class="al__header-actions">
                        <label class="al__auto-refresh">
                            <input type="checkbox" id="alAutoRefresh" checked onchange="window.app.views.auditLog.toggleAutoRefresh(this.checked)">
                            <span>Auto-refresh (Temps réel)</span>
                        </label>
                        <button class="al__btn al__btn--primary" type="button" onclick="window.app.views.auditLog.loadData()">🔄 Actualiser</button>
                    </div>
                </div>

                <!-- Conteneur KPIs injecté via JS -->
                <div id="alKpiContainer"></div>

                <!-- Conteneur Charts injecté via JS -->
                <div id="alChartsContainer"></div>

                <div class="al__section">
                    <h3 class="al__section-title">🏅 Performance des agents (7 derniers jours)</h3>
                    <div class="al__perf-wrap">
                        <table class="al__perf-table">
                            <thead>
                                <tr>
                                    <th>#</th><th>Agent</th><th>Total</th><th>Créations</th><th>Modifications</th><th>Suppressions</th><th>Connexions</th><th>Dernière action</th>
                                </tr>
                            </thead>
                            <tbody id="alPerfTableBody">
                                <tr><td colspan="8" style="text-align: center; padding: 20px;">Chargement...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="al__filters">
                    <h3 class="al__section-title">🔍 Journal détaillé</h3>
                    <div class="al__filter-row">
                        <input type="text" id="alSearch" class="al__input" placeholder="Rechercher IP, Réf, Description..." oninput="window.app.views.auditLog.applyFilters()">
                        <select id="alActionFilter" class="al__select" onchange="window.app.views.auditLog.applyFilters()">
                            <option value="">Toutes les actions</option>
                            <option value="CREATE">Création (CREATE)</option>
                            <option value="UPDATE">Modification (UPDATE)</option>
                            <option value="DELETE">Suppression (DELETE)</option>
                            <option value="LOGIN">Connexion (LOGIN)</option>
                            <option value="SCAN">Scan (SCAN)</option>
                            <option value="EXPORT">Export (EXPORT)</option>
                        </select>
                        <select id="alUserFilter" class="al__select" onchange="window.app.views.auditLog.applyFilters()">
                            <option value="">Tous les agents</option>
                            <!-- Injecté via JS -->
                        </select>
                        <input type="text" id="alEntityFilter" class="al__input" placeholder="Entité (ex: rdv, factures)..." oninput="window.app.views.auditLog.applyFilters()">
                        <button class="al__btn al__btn--ghost" type="button" onclick="window.app.views.auditLog.resetFilters()">Reset</button>
                    </div>
                </div>

                <div class="al__table-wrap">
                    <table class="al__table">
                        <thead>
                            <tr>
                                <th>Date / Heure</th><th>Action</th><th>Description</th><th>Utilisateur</th><th>Entité</th><th>ID</th><th>Référence</th><th>IP</th><th>Status</th>
                            </tr>
                        </thead>
                        <tbody id="alLogTableBody">
                            <tr><td colspan="9" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</td></tr>
                        </tbody>
                    </table>
                    <div class="al__pagination">
                        <button class="al__page-btn" id="alPrevPage" onclick="window.app.views.auditLog.changePage(-1)">← Précédent</button>
                        <span class="al__page-info" id="alPageInfo">Page 1 / 1</span>
                        <button class="al__page-btn" id="alNextPage" onclick="window.app.views.auditLog.changePage(1)">Suivant →</button>
                    </div>
                </div>
            </div>
        `;
        
        if (container) container.innerHTML = html;
        else document.getElementById('contentContainer').innerHTML = html;
        
        this.loadData();
    },

    toggleAutoRefresh(checked) {
        this.autoRefresh = checked;
        if (checked) {
            this.loadData();
        } else if (this.unsub) {
            this.unsub();
            this.unsub = null;
        }
    },

    loadData() {
        if (this.unsub) this.unsub();
        
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'abidjan';
        const q = query(
            collection(db, "audit_logs"), 
            where("agency", "==", activeAgency),
            orderBy("date", "desc"),
            limit(2000)
        );

        this.unsub = onSnapshot(q, (snapshot) => {
            if (!this.autoRefresh && this.logs.length > 0) return; 
            
            this.logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            this.processData();
            this.applyFilters(); 
        }, (error) => {
            console.error("Erreur chargement logs:", error);
            if(this.logs.length === 0) {
                const tbody = document.getElementById('alLogTableBody');
                if (tbody) tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:#ef4444;">Erreur d'accès aux logs.</td></tr>`;
            }
        });
    },

    processData() {
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(now.getDate() - 7);
        
        // Variables pour KPIs Aujourd'hui
        let actionsToday = 0, creates = 0, updates = 0, deletes = 0, logins = 0;
        const agentActivityToday = {};

        // Variables pour Charts
        const last7DaysCount = {};
        for(let i=6; i>=0; i--) {
            const d = new Date(now); d.setDate(d.getDate() - i);
            last7DaysCount[d.toISOString().split('T')[0]] = 0;
        }
        const hourlyToday = new Array(24).fill(0);
        const entities30d = {};
        const perfAgents = {};

        this.usersList.clear();

        this.logs.forEach(log => {
            if (!log.date) return;
            const logDateObj = new Date(log.date);
            const logDateStr = log.date.split('T')[0];
            const user = log.user || 'Système';
            const action = (log.action || '').toUpperCase();
            const entity = (log.entity || 'inconnu').toLowerCase();

            this.usersList.add(user);

            // Stat Aujourd'hui
            if (logDateStr === todayStr) {
                actionsToday++;
                if (action === 'CREATE') creates++;
                if (action === 'UPDATE') updates++;
                if (action === 'DELETE') deletes++;
                if (action === 'LOGIN') logins++;

                agentActivityToday[user] = (agentActivityToday[user] || 0) + 1;
                hourlyToday[logDateObj.getHours()]++;
            }

            // Stats 7 jours
            if (logDateObj >= sevenDaysAgo) {
                if (last7DaysCount[logDateStr] !== undefined) {
                    last7DaysCount[logDateStr]++;
                }
                
                // Perf Agent
                if (!perfAgents[user]) {
                    perfAgents[user] = { total: 0, creates: 0, updates: 0, deletes: 0, logins: 0, lastAction: log.date };
                }
                perfAgents[user].total++;
                if (action === 'CREATE') perfAgents[user].creates++;
                if (action === 'UPDATE') perfAgents[user].updates++;
                if (action === 'DELETE') perfAgents[user].deletes++;
                if (action === 'LOGIN') perfAgents[user].logins++;
                if (log.date > perfAgents[user].lastAction) perfAgents[user].lastAction = log.date;
            }

            // Stats entités globales (sur l'échantillon chargé)
            entities30d[entity] = (entities30d[entity] || 0) + 1;
        });

        // Calcul Top Agent Aujourd'hui
        let topAgentName = '-', topAgentCount = 0;
        for (const [agent, count] of Object.entries(agentActivityToday)) {
            if (count > topAgentCount && agent !== 'Système') {
                topAgentName = agent;
                topAgentCount = count;
            }
        }

        this.renderKPIs(actionsToday, creates, updates, deletes, logins, topAgentName, topAgentCount);
        this.renderCharts(last7DaysCount, hourlyToday, entities30d);
        this.renderPerfTable(perfAgents);
        this.updateUserSelect();
    },

    renderKPIs(total, c, u, d, l, topName, topCount) {
        const container = document.getElementById('alKpiContainer');
        if (!container) return;
        container.innerHTML = `
            <div class="al__kpi-row">
                <div class="al__kpi al__kpi--indigo"><div class="al__kpi-icon">📊</div><div><div class="al__kpi-val">${total}</div><div class="al__kpi-lbl">Actions aujourd'hui</div></div></div>
                <div class="al__kpi al__kpi--green"><div class="al__kpi-icon">➕</div><div><div class="al__kpi-val">${c}</div><div class="al__kpi-lbl">Créations</div></div></div>
                <div class="al__kpi al__kpi--blue"><div class="al__kpi-icon">✏️</div><div><div class="al__kpi-val">${u}</div><div class="al__kpi-lbl">Modifications</div></div></div>
                <div class="al__kpi al__kpi--red"><div class="al__kpi-icon">🗑️</div><div><div class="al__kpi-val">${d}</div><div class="al__kpi-lbl">Suppressions</div></div></div>
                <div class="al__kpi al__kpi--purple"><div class="al__kpi-icon">🔑</div><div><div class="al__kpi-val">${l}</div><div class="al__kpi-lbl">Connexions</div></div></div>
                <div class="al__kpi al__kpi--amber"><div class="al__kpi-icon">🏆</div><div><div class="al__kpi-val al__kpi-val--sm" title="${topName}">${topName}</div><div class="al__kpi-lbl">Le + actif (${topCount})</div></div></div>
            </div>
        `;
    },

    renderCharts(last7DaysCount, hourlyToday, entities30d) {
        const container = document.getElementById('alChartsContainer');
        if (!container) return;

        // Bar Chart 7 Days
        const max7 = Math.max(...Object.values(last7DaysCount), 1);
        let bars7Html = '';
        for (const [dateStr, count] of Object.entries(last7DaysCount)) {
            const d = new Date(dateStr);
            const lbl = d.toLocaleDateString('fr-FR', {weekday: 'short', day: '2-digit', month: '2-digit'}).replace('.', '');
            const height = (count / max7) * 120; 
            bars7Html += `<div class="al__bar-col"><div class="al__bar-value">${count}</div><div class="al__bar" style="height: ${height}px;"></div><div class="al__bar-label">${lbl}</div></div>`;
        }

        // Hourly Chart
        const maxHr = Math.max(...hourlyToday, 1);
        let hoursHtml = '';
        hourlyToday.forEach((count, hr) => {
            const height = (count / maxHr) * 80; 
            const lbl = (hr % 3 === 0) ? `<div class="al__hour-label">${String(hr).padStart(2,'0')}h</div>` : '';
            hoursHtml += `<div class="al__hour-col"><div class="al__hour-bar" title="${count} actions" style="height: ${height}px;"></div>${lbl}</div>`;
        });

        // Entities List
        const sortedEntities = Object.entries(entities30d).sort((a,b) => b[1] - a[1]).slice(0, 10);
        const maxEnt = sortedEntities.length > 0 ? sortedEntities[0][1] : 1;
        let entitiesHtml = sortedEntities.map(([ent, count]) => {
            const pct = (count / maxEnt) * 100;
            return `<div class="al__entity-row"><span class="al__entity-name">${ent}</span><div class="al__entity-bar-bg"><div class="al__entity-bar-fill" style="width: ${pct}%;"></div></div><span class="al__entity-count">${count}</span></div>`;
        }).join('');

        container.innerHTML = `
            <div class="al__charts-row">
                <div class="al__chart-card">
                    <h3 class="al__chart-title">📈 Actions 7 derniers jours</h3>
                    <div class="al__bar-chart">${bars7Html}</div>
                </div>
                <div class="al__chart-card">
                    <h3 class="al__chart-title">⏰ Activité par heure (aujourd'hui)</h3>
                    <div class="al__hour-chart">${hoursHtml}</div>
                </div>
                <div class="al__chart-card">
                    <h3 class="al__chart-title">🏷️ Entités les plus sollicitées</h3>
                    <div class="al__entity-list">${entitiesHtml}</div>
                </div>
            </div>
        `;
    },

    renderPerfTable(perfAgents) {
        const tbody = document.getElementById('alPerfTableBody');
        if (!tbody) return;

        const sortedAgents = Object.entries(perfAgents).sort((a, b) => b[1].total - a[1].total);
        
        if (sortedAgents.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #64748b;">Aucune activité récente.</td></tr>';
            return;
        }

        tbody.innerHTML = sortedAgents.map(([agent, stats], idx) => {
            let rankClass = '';
            if (idx === 0) rankClass = 'al__rank--gold';
            else if (idx === 1) rankClass = 'al__rank--silver';
            else if (idx === 2) rankClass = 'al__rank--bronze';
            
            const lastDate = stats.lastAction ? new Date(stats.lastAction).toLocaleString('fr-FR') : '-';

            return `
                <tr>
                    <td><span class="al__rank ${rankClass}">${idx + 1}</span></td>
                    <td class="al__perf-name">${agent}</td>
                    <td><strong>${stats.total}</strong></td>
                    <td><span class="al__mini-badge al__mini-badge--green">${stats.creates}</span></td>
                    <td><span class="al__mini-badge al__mini-badge--blue">${stats.updates}</span></td>
                    <td><span class="al__mini-badge al__mini-badge--red">${stats.deletes}</span></td>
                    <td><span class="al__mini-badge al__mini-badge--purple">${stats.logins}</span></td>
                    <td class="al__td-date">${lastDate}</td>
                </tr>
            `;
        }).join('');
    },

    updateUserSelect() {
        const select = document.getElementById('alUserFilter');
        if (!select) return;
        const currentVal = select.value;
        
        let html = '<option value="">Tous les agents</option>';
        const sortedUsers = Array.from(this.usersList).sort();
        sortedUsers.forEach(u => {
            html += `<option value="${u}" ${u === currentVal ? 'selected' : ''}>${u}</option>`;
        });
        select.innerHTML = html;
    },

    applyFilters() {
        const search = (document.getElementById('alSearch')?.value || '').toLowerCase().trim();
        const action = document.getElementById('alActionFilter')?.value || '';
        const user = document.getElementById('alUserFilter')?.value || '';
        const entity = (document.getElementById('alEntityFilter')?.value || '').toLowerCase().trim();

        this.filteredLogs = this.logs.filter(log => {
            if (action && log.action !== action) return false;
            if (user && log.user !== user) return false;
            if (entity && (log.entity || '').toLowerCase() !== entity) return false;
            if (search) {
                const str = `${log.ip || ''} ${log.refId || ''} ${log.details || ''}`.toLowerCase();
                if (!str.includes(search)) return false;
            }
            return true;
        });

        this.currentPage = 1;
        this.renderLogTable();
    },

    resetFilters() {
        if (document.getElementById('alSearch')) document.getElementById('alSearch').value = '';
        if (document.getElementById('alActionFilter')) document.getElementById('alActionFilter').value = '';
        if (document.getElementById('alUserFilter')) document.getElementById('alUserFilter').value = '';
        if (document.getElementById('alEntityFilter')) document.getElementById('alEntityFilter').value = '';
        this.applyFilters();
    },

    changePage(delta) {
        const maxPage = Math.ceil(this.filteredLogs.length / this.itemsPerPage) || 1;
        this.currentPage += delta;
        if (this.currentPage < 1) this.currentPage = 1;
        if (this.currentPage > maxPage) this.currentPage = maxPage;
        this.renderLogTable();
    },

    renderLogTable() {
        const tbody = document.getElementById('alLogTableBody');
        if (!tbody) return;

        const maxPage = Math.ceil(this.filteredLogs.length / this.itemsPerPage) || 1;
        
        const pageInfo = document.getElementById('alPageInfo');
        if (pageInfo) pageInfo.textContent = `Page ${this.currentPage} / ${maxPage} · ${this.filteredLogs.length} résultat(s)`;
        
        const prevBtn = document.getElementById('alPrevPage');
        if (prevBtn) prevBtn.disabled = this.currentPage === 1;
        
        const nextBtn = document.getElementById('alNextPage');
        if (nextBtn) nextBtn.disabled = this.currentPage === maxPage;

        if (this.filteredLogs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 40px; color: #64748b;">Aucun log trouvé pour ces filtres.</td></tr>';
            return;
        }

        const start = (this.currentPage - 1) * this.itemsPerPage;
        const paginated = this.filteredLogs.slice(start, start + this.itemsPerPage);

        const getActionStyle = (action) => {
            switch(action) {
                case 'CREATE': return 'background: rgba(22, 163, 74, 0.1); color: rgb(22, 163, 74);';
                case 'UPDATE': return 'background: rgba(59, 130, 246, 0.1); color: rgb(59, 130, 246);';
                case 'DELETE': return 'background: rgba(239, 68, 68, 0.1); color: rgb(239, 68, 68);';
                case 'LOGIN': return 'background: rgba(168, 85, 247, 0.1); color: rgb(168, 85, 247);';
                case 'SCAN': return 'background: rgba(99, 102, 241, 0.1); color: rgb(99, 102, 241);';
                default: return 'background: rgba(100, 116, 139, 0.1); color: rgb(100, 116, 139);';
            }
        };

        const getActionIcon = (action) => {
            switch(action) {
                case 'CREATE': return '➕';
                case 'UPDATE': return '✏️';
                case 'DELETE': return '🗑️';
                case 'LOGIN': return '🔑';
                case 'SCAN': return '📷';
                case 'EXPORT': return '📄';
                default: return '⚡';
            }
        };

        const getStatusClass = (code) => {
            const c = parseInt(code);
            if (c >= 200 && c < 300) return 'al__status-dot--ok';
            if (c >= 400) return 'al__status-dot--err';
            return 'al__status-dot--warn';
        };

        tbody.innerHTML = paginated.map(log => {
            const dateStr = log.date ? new Date(log.date).toLocaleString('fr-FR') : '-';
            const actStr = log.action || 'UNKNOWN';
            const style = getActionStyle(actStr);
            const icon = getActionIcon(actStr);
            
            return `
                <tr>
                    <td class="al__td-date">${dateStr}</td>
                    <td><span class="al__action-badge" style="${style}">${icon} ${actStr}</span></td>
                    <td class="al__td-desc" title="${log.details || ''}">${log.details || `${actStr} — ${log.entity || 'inconnu'}`}</td>
                    <td>
                        <div class="al__user-cell">
                            <span class="al__user-name">${log.user || '-'}</span>
                            ${log.userId ? `<span class="al__user-id">#${log.userId.substring(0,4).toUpperCase()}</span>` : ''}
                        </div>
                    </td>
                    <td><span class="al__entity-tag">${log.entity || '-'}</span></td>
                    <td class="al__td-id">${log.refId || '—'}</td>
                    <td class="al__td-ref">${log.docRef || '—'}</td>
                    <td class="al__td-ip">${log.ip || '—'}</td>
                    <td><span class="al__status-dot ${getStatusClass(log.status)}">${log.status || '200'}</span></td>
                </tr>
            `;
        }).join('');
    }
};