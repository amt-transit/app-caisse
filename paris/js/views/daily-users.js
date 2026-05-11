import { db } from '../../../firebase-config.js';
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const DailyUsersView = {
    usersData: [],
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],

    render(app) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.dailyUsers = this;

        // Période par défaut : Mois en cours
        const now = new Date();
        this.startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        this.endDate = now.toISOString().split('T')[0];

        const html = `
            <style>
                .users-bilan-page { max-width: 1200px; margin: 0 auto; animation: fadeIn 0.3s ease; }
                .users-header { background: white; border-radius: 16px; padding: 20px 25px; margin-bottom: 24px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
                .users-header__content { display: flex; align-items: center; gap: 15px; }
                .users-header__icon { background: #f8fafc; font-size: 28px; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 14px; }
                .users-header__title { margin: 0; font-size: 22px; font-weight: 800; color: #0f172a; }
                .users-header__subtitle { margin: 4px 0 0 0; font-size: 13px; color: #64748b; }
                
                .users-filters { display: flex; flex-wrap: wrap; gap: 15px; background: white; padding: 20px; border-radius: 16px; border: 1px solid #e2e8f0; margin-bottom: 24px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
                .filter-group { flex: 1; min-width: 150px; display: flex; flex-direction: column; gap: 6px; }
                .filter-group--wide { flex: 2; min-width: 250px; }
                .filter-label { font-size: 11px; font-weight: 600; color: #475569; text-transform: uppercase; display: flex; align-items: center; gap: 6px; }
                .filter-input { width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; outline: none; transition: 0.2s; background: #f8fafc; box-sizing: border-box; }
                .filter-input:focus { border-color: #3b82f6; background: white; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
                .filter-actions-group { display: flex; align-items: flex-end; }
                .btn-filter-action { background: #3b82f6; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s; height: 40px; display: flex; align-items: center; gap: 8px; }
                .btn-filter-action:hover { background: #2563eb; }

                .kpi-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 24px; }
                .kpi-summary-card { display: flex; align-items: center; gap: 15px; padding: 20px; background: white; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
                .kpi-summary-card__icon { font-size: 24px; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: 12px; }
                .kpi-summary-card--blue .kpi-summary-card__icon { background: #eff6ff; color: #3b82f6; }
                .kpi-summary-card--green .kpi-summary-card__icon { background: #dcfce7; color: #16a34a; }
                .kpi-summary-card--red .kpi-summary-card__icon { background: #fee2e2; color: #ef4444; }
                .kpi-summary-card--purple .kpi-summary-card__icon { background: #f3e8ff; color: #9333ea; }
                .kpi-summary-card__value { font-size: 20px; font-weight: 800; color: #0f172a; line-height: 1; margin-top: 4px; }
                .kpi-summary-card__label { font-size: 12px; color: #64748b; font-weight: 600; text-transform: uppercase; }

                .users-table-card { background: white; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.02); }
                .users-table-header { padding: 15px 20px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; display: flex; justify-content: space-between; align-items: center; }
                .users-table-title { margin: 0; font-size: 16px; font-weight: 700; color: #1e293b; display: flex; align-items: center; gap: 10px; }
                .users-table-count { background: #e2e8f0; color: #475569; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; }
                
                .table-wrap { overflow-x: auto; }
                .users-table { width: 100%; border-collapse: collapse; }
                .users-table th { text-align: left; padding: 12px 15px; background: white; font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; }
                .users-table td { padding: 15px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #334155; vertical-align: middle; }
                .users-table tr:hover td { background: #f8fafc; }
                
                .btn { padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid transparent; transition: 0.2s; }
                .btn--teal { background: #f0fdfa; color: #0d9488; border-color: #ccfbf1; }
                .btn--teal:hover { background: #ccfbf1; }
                .btn--danger { background: #fef2f2; color: #ef4444; border-color: #fecaca; }
                .btn--danger:hover { background: #fee2e2; }
                .actions-cell { display: flex; justify-content: flex-end; gap: 8px; }

                .detail-section { display: none; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 10px 15px 20px 15px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02); }
                .detail-table { width: 100%; border-collapse: collapse; background: white; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 15px;}
                .detail-table th { background: #f1f5f9; padding: 10px; font-size: 11px; text-transform: uppercase; color: #475569; text-align: left; }
                .detail-table td { padding: 10px; border-top: 1px solid #f1f5f9; font-size: 12px; }

                /* --- MODALE DÉTAIL UTILISATEUR --- */
                .modal-overlay-custom { position: fixed; inset: 0; background: rgba(15,23,42,0.6); display: flex; align-items: center; justify-content: center; z-index: 10000; backdrop-filter: blur(4px); }
                .details-modal { background: white; border-radius: 16px; width: 95%; max-width: 1100px; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); animation: fadeIn 0.2s; }
                .details-modal__header { padding: 20px 25px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: flex-start; background: #f8fafc; }
                .details-modal__title { margin: 0 0 4px 0; font-size: 20px; font-weight: 800; color: #0f172a; }
                .details-modal__subtitle { margin: 0; font-size: 13px; color: #64748b; font-weight: 600; }
                .details-modal__close { background: none; border: none; font-size: 24px; color: #64748b; cursor: pointer; transition: 0.2s; padding: 0 5px; }
                .details-modal__close:hover { color: #ef4444; }
                .details-modal__body { padding: 25px; overflow-y: auto; flex: 1; background: #f1f5f9; }
                
                .details-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 15px; margin-bottom: 25px; }
                .details-kpi-card { background: white; padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 1px 2px rgba(0,0,0,0.02); }
                .details-kpi-card__label { font-size: 11px; color: #64748b; font-weight: 700; text-transform: uppercase; margin-bottom: 4px; }
                .details-kpi-card__value { font-size: 18px; font-weight: 900; color: #0f172a; }
                
                .details-table-wrap { background: white; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.02); }
                .details-table { width: 100%; border-collapse: collapse; }
                .details-table th { background: #f8fafc; padding: 12px 15px; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; text-align: left; border-bottom: 1px solid #e2e8f0; }
                .details-table td { padding: 12px 15px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #334155; }
                .details-table tr:hover td { background: #f8fafc; }
                .details-table td.amount { font-weight: 700; text-align: right; }
            </style>
            
            <div class="users-bilan-page">
                <div class="users-header">
                    <div class="users-header__content">
                        <div class="users-header__icon">👥</div>
                        <div class="users-header__info">
                            <h1 class="users-header__title">Bilan Utilisateurs</h1>
                            <p class="users-header__subtitle">Performance par agent</p>
                        </div>
                    </div>
                </div>

                <div class="users-filters">
                    <div class="filter-group filter-group--wide">
                        <label class="filter-label"><span class="filter-icon">👤</span> Utilisateur</label>
                        <select id="userFilter" class="filter-input" onchange="window.app.views.dailyUsers.renderUsersTable()">
                            <option value="">Tous les utilisateurs</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label class="filter-label"><span class="filter-icon">📅</span> Date début</label>
                        <input id="startDateFilter" class="filter-input" type="date" value="${this.startDate}">
                    </div>
                    <div class="filter-group">
                        <label class="filter-label"><span class="filter-icon">📅</span> Date fin</label>
                        <input id="endDateFilter" class="filter-input" type="date" value="${this.endDate}">
                    </div>
                    <div class="filter-actions-group">
                        <button class="btn-filter-action" type="button" onclick="window.app.views.dailyUsers.loadData()">
                            <span>🔄 Rafraîchir</span>
                        </button>
                    </div>
                </div>

                <div class="kpi-summary">
                    <div class="kpi-summary-card kpi-summary-card--blue">
                        <div class="kpi-summary-card__icon">👤</div>
                        <div class="kpi-summary-card__content">
                            <div class="kpi-summary-card__label">Agents Actifs</div>
                            <div class="kpi-summary-card__value" id="kpiAgents">0</div>
                        </div>
                    </div>
                    <div class="kpi-summary-card kpi-summary-card--green">
                        <div class="kpi-summary-card__icon">💰</div>
                        <div class="kpi-summary-card__content">
                            <div class="kpi-summary-card__label">Total CA</div>
                            <div class="kpi-summary-card__value" id="kpiTotalCA">0,00 €</div>
                        </div>
                    </div>
                    <div class="kpi-summary-card kpi-summary-card--red">
                        <div class="kpi-summary-card__icon">💸</div>
                        <div class="kpi-summary-card__content">
                            <div class="kpi-summary-card__label">Total Dépenses</div>
                            <div class="kpi-summary-card__value" id="kpiTotalDepenses">0,00 €</div>
                        </div>
                    </div>
                    <div class="kpi-summary-card kpi-summary-card--purple">
                        <div class="kpi-summary-card__icon">💼</div>
                        <div class="kpi-summary-card__content">
                            <div class="kpi-summary-card__label">Total Restant</div>
                            <div class="kpi-summary-card__value" id="kpiTotalRestant" title="CA facturé - Argent encaissé (Dettes clients)">0,00 €</div>
                        </div>
                    </div>
                </div>

                <div class="users-table-card">
                    <div class="users-table-header">
                        <h2 class="users-table-title"><span class="users-table-icon">📊</span> Détail par Agent <span class="users-table-count" id="tableCountBadge">0</span></h2>
                    </div>
                    <div class="table-wrap">
                        <table class="users-table">
                            <thead>
                                <tr>
                                    <th>Utilisateur</th>
                                    <th style="width: 180px;">Période</th>
                                    <th style="text-align: right; width: 150px;">CA</th>
                                    <th style="text-align: right; width: 150px;">Encaissé</th>
                                    <th style="text-align: right; width: 150px;">Dépense</th>
                                    <th style="text-align: right; width: 150px;">Restant</th>
                                    <th style="text-align: right; width: 180px;">Actions</th>
                                </tr>
                            </thead>
                            <tbody id="usersTableBody">
                                <tr><td colspan="7" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Chargement des données...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- MODALE DÉTAIL UTILISATEUR -->
            <div id="userBilanModal" class="modal-overlay-custom" style="display: none;">
                <div class="details-modal">
                    <div class="details-modal__header">
                        <div>
                            <h3 class="details-modal__title">Détail bilan utilisateur</h3>
                            <p class="details-modal__subtitle" id="ubmSubtitle">NOM • Période</p>
                        </div>
                        <button class="details-modal__close" type="button" onclick="document.getElementById('userBilanModal').style.display='none'">✕</button>
                    </div>
                    <div class="details-modal__body">
                        <div class="details-kpis" id="ubmKpis">
                            <!-- Injecté via JS -->
                        </div>
                        <div class="table-wrap details-table-wrap">
                            <table class="details-table">
                                <thead>
                                    <tr>
                                        <th>Réf</th><th>Date</th><th>Expéditeur</th><th>Destinataire</th><th>Mode paiement</th>
                                        <th style="text-align: right;">Montant</th><th style="text-align: right;">Payé</th><th style="text-align: right;">Restant</th>
                                    </tr>
                                </thead>
                                <tbody id="ubmTableBody">
                                    <!-- Injecté via JS -->
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('contentContainer').innerHTML = html;
        this.loadData();
    },

    async loadData() {
        this.startDate = document.getElementById('startDateFilter')?.value || this.startDate;
        this.endDate = document.getElementById('endDateFilter')?.value || this.endDate;
        
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
        const TAUX = 656;
        
        // Fetch transactions
        const qTransactions = query(collection(db, "transactions"), where("agency", "==", activeAgency), where("isDeleted", "==", false));
        const transSnap = await getDocs(qTransactions);
        
        // Fetch expenses
        const qExpenses = query(collection(db, "expenses"), where("agency", "==", activeAgency), where("isDeleted", "==", false));
        const expSnap = await getDocs(qExpenses);
        
        const usersMap = new Map();
        
        transSnap.forEach(doc => {
            const t = doc.data();
            if (t.date < this.startDate || t.date > this.endDate) return;
            
            const userName = (t.saisiPar || 'Agent inconnu').trim().toUpperCase();
            if (!usersMap.has(userName)) usersMap.set(userName, { ca: 0, encaisse: 0, depense: 0, transactions: [], expenses: [] });
            const user = usersMap.get(userName);
            
            const ca = (parseFloat(t.prix) || 0) / TAUX;
            const encaisse = ((parseFloat(t.montantParis) || 0) + (parseFloat(t.montantAbidjan) || 0)) / TAUX;
            
            user.ca += ca;
            user.encaisse += encaisse;
            user.transactions.push(t);
        });
        
        expSnap.forEach(doc => {
            const e = doc.data();
            if (e.date < this.startDate || e.date > this.endDate) return;
            
            let userName = 'Agent inconnu';
            const desc = e.description || '';
            const match = desc.match(/\(([^)]+)\)$/); 
            if (match && match[1]) userName = match[1].trim().toUpperCase();
            else if (e.saisiPar) userName = e.saisiPar.trim().toUpperCase();
            
            if (!usersMap.has(userName)) usersMap.set(userName, { ca: 0, encaisse: 0, depense: 0, transactions: [], expenses: [] });
            const user = usersMap.get(userName);
            
            user.depense += (parseFloat(e.montant) || 0); // Dépenses Paris déjà en euros
            user.expenses.push(e);
        });
        
        this.usersData = Array.from(usersMap.entries()).map(([name, data]) => ({ name, ...data }));
        
        // Remplir le dropdown
        const userSelect = document.getElementById('userFilter');
        if (userSelect && userSelect.options.length <= 1 && this.usersData.length > 0) {
            userSelect.innerHTML = '<option value="">Tous les utilisateurs</option>';
            this.usersData.sort((a,b) => a.name.localeCompare(b.name)).forEach(u => {
                const opt = document.createElement('option');
                opt.value = u.name;
                opt.textContent = u.name;
                userSelect.appendChild(opt);
            });
        }

        this.renderUsersTable();
    },

    renderUsersTable() {
        const tbody = document.getElementById('usersTableBody');
        if (!tbody) return;
        
        let sorted = [...this.usersData];
        sorted.sort((a, b) => b.ca - a.ca);

        const userFilter = document.getElementById('userFilter')?.value;
        if (userFilter) {
            sorted = sorted.filter(u => u.name === userFilter);
        }
        
        // Mise à jour des KPIs globaux
        const totalAgents = sorted.length;
        const totalCA = sorted.reduce((sum, u) => sum + u.ca, 0);
        const totalDepense = sorted.reduce((sum, u) => sum + u.depense, 0);
        const totalRestant = sorted.reduce((sum, u) => sum + (u.ca - u.encaisse), 0); // Dette client

        document.getElementById('kpiAgents').textContent = totalAgents;
        document.getElementById('kpiTotalCA').textContent = this.app.formatMoney(totalCA);
        document.getElementById('kpiTotalDepenses').textContent = this.app.formatMoney(totalDepense);
        document.getElementById('kpiTotalRestant').textContent = this.app.formatMoney(totalRestant);
        document.getElementById('tableCountBadge').textContent = totalAgents;
        
        if (sorted.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: #64748b;">Aucune donnée trouvée pour cette période.</td></tr>';
            return;
        }
        
        const periodeTxt = (this.startDate === this.endDate) ? this.startDate : `Du ${this.startDate} au ${this.endDate}`;
        const isMobile = window.innerWidth <= 768;

        if (isMobile) {
            tbody.innerHTML = sorted.map(user => {
                const restant = user.ca - user.encaisse;
                const safeId = user.name.replace(/[^a-zA-Z0-9]/g, '_');
                
                return `
                    <tr class="compact-row">
                        <td colspan="7">
                            <div class="compact-mob-card">
                                <div class="cmc-header">
                                    <div class="cmc-ref-group">
                                        <span class="cmc-ref" style="font-size: 15px;">${user.name}</span>
                                    </div>
                                    <span class="status-badge" style="background: ${restant <= 0 ? '#dcfce7' : '#fef3c7'}; color: ${restant <= 0 ? '#166534' : '#b45309'}; font-size:9px; padding:2px 6px;">
                                        ${restant <= 0 ? 'À jour' : 'Dette'}
                                    </span>
                                </div>
                                <div class="cmc-body">
                                    <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:12px;">
                                        <span style="color:#64748b;">Période:</span> <strong>${periodeTxt}</strong>
                                    </div>
                                    <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:12px;">
                                        <span style="color:#64748b;">CA facturé:</span> <strong style="color:#3b82f6;">${this.app.formatMoney(user.ca)}</strong>
                                    </div>
                                    <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:12px;">
                                        <span style="color:#64748b;">Encaissé:</span> <strong style="color:#10b981;">${this.app.formatMoney(user.encaisse)}</strong>
                                    </div>
                                    <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:12px;">
                                        <span style="color:#64748b;">Dépense:</span> <strong style="color:#ef4444;">${this.app.formatMoney(user.depense)}</strong>
                                    </div>
                                    <div style="display:flex; justify-content:space-between; border-top:1px dashed #e2e8f0; padding-top:6px; margin-top:6px; font-size:13px;">
                                        <span style="color:#0f172a; font-weight:bold;">Restant:</span> <strong style="color:${restant <= 0 ? '#10b981' : '#f59e0b'};">${this.app.formatMoney(restant)}</strong>
                                    </div>
                                </div>
                                <div class="cmc-footer" style="justify-content: flex-end;">
                                    <div class="cmc-actions">
                                        <button class="btn btn--teal" type="button" title="Voir le détail" onclick="window.app.views.dailyUsers.openUserModal('${safeId}')" style="padding:6px 12px; font-size:12px; display:flex; align-items:center; gap:4px;"><i class="fas fa-eye"></i> Voir</button>
                                        <button class="btn btn--danger" type="button" title="Exporter PDF" onclick="window.app.views.dailyUsers.exportUserPDF('${safeId}')" style="padding:6px 12px; font-size:12px; display:flex; align-items:center; gap:4px;"><i class="fas fa-file-pdf"></i> PDF</button>
                                    </div>
                                </div>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        } else {
            tbody.innerHTML = sorted.map(user => {
                const restant = user.ca - user.encaisse;
                const safeId = user.name.replace(/[^a-zA-Z0-9]/g, '_');
                
                return `
                    <tr>
                        <td style="font-weight: 900;">${user.name}</td>
                        <td>${periodeTxt}</td>
                        <td style="text-align: right; font-weight: 900; color: #3b82f6;">${this.app.formatMoney(user.ca)}</td>
                        <td style="text-align: right; font-weight: 900; color: #10b981;">${this.app.formatMoney(user.encaisse)}</td>
                        <td style="text-align: right; color: #ef4444;">${this.app.formatMoney(user.depense)}</td>
                        <td style="text-align: right; font-weight: 900; color: ${restant <= 0 ? '#10b981' : '#f59e0b'};">${this.app.formatMoney(restant)}</td>
                        <td class="actions-cell">
                            <button class="btn btn--teal" type="button" title="Voir le détail" onclick="window.app.views.dailyUsers.openUserModal('${safeId}')"> Voir </button>
                            <button class="btn btn--danger" type="button" title="Exporter PDF" onclick="window.app.views.dailyUsers.exportUserPDF('${safeId}')"><span>PDF</span></button>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    },

    openUserModal(safeId) {
        const user = this.usersData.find(u => u.name.replace(/[^a-zA-Z0-9]/g, '_') === safeId);
        if (!user) return;

        const periodeTxt = (this.startDate === this.endDate) ? this.startDate : `Du ${this.startDate} au ${this.endDate}`;
        document.getElementById('ubmSubtitle').textContent = `${user.name} • ${periodeTxt}`;

        let totalCa = 0;
        let totalPaye = 0;
        let totalEspeces = 0;
        let totalAutres = 0;
        const TAUX = 656;

        const tbodyHtml = (user.transactions || []).map(t => {
            const montant = (parseFloat(t.prix) || 0) / TAUX;
            const encaisse = ((parseFloat(t.montantParis) || 0) + (parseFloat(t.montantAbidjan) || 0)) / TAUX;
            const reste = montant - encaisse;
            
            totalCa += montant;
            totalPaye += encaisse;

            // Résolution des modes de paiement (Fractionnés ou Simples)
            let modeDisplay = t.modePaiement || '—';
            if (t.paymentHistory && t.paymentHistory.length > 0) {
                const modes = [...new Set(t.paymentHistory.map(p => p.modePaiement))];
                modeDisplay = modes.join(', ');
                
                t.paymentHistory.forEach(p => {
                    const amt = ((parseFloat(p.montantAbidjan) || 0) + (parseFloat(p.montantParis) || 0)) / TAUX;
                    const md = (p.modePaiement || '').toLowerCase();
                    if (md.includes('esp') || md.includes('espèce') || md.includes('espece')) totalEspeces += amt;
                    else totalAutres += amt;
                });
            } else {
                const md = (t.modePaiement || '').toLowerCase();
                if (md.includes('esp') || md.includes('espèce') || md.includes('espece')) totalEspeces += encaisse;
                else totalAutres += encaisse;
            }

            return `
                <tr>
                    <td style="font-weight: 700; color: #0f172a;">${t.reference || '—'}</td>
                    <td>${t.date || '—'}</td>
                    <td>${t.nom || '—'}</td>
                    <td>${t.nomDestinataire || '—'}</td>
                    <td><span style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600;">${modeDisplay}</span></td>
                    <td class="amount">${this.app.formatMoney(montant)}</td>
                    <td class="amount" style="color: #10b981;">${this.app.formatMoney(encaisse)}</td>
                    <td class="amount" style="color: ${reste <= 0 ? '#10b981' : '#ef4444'};">${this.app.formatMoney(reste)}</td>
                </tr>
            `;
        }).join('');

        document.getElementById('ubmTableBody').innerHTML = tbodyHtml || '<tr><td colspan="8" style="text-align:center; padding: 20px;">Aucune transaction trouvée.</td></tr>';

        const restant = totalCa - totalPaye;

        document.getElementById('ubmKpis').innerHTML = `
            <div class="details-kpi-card"><div class="details-kpi-card__label">CA</div><div class="details-kpi-card__value" style="color: #3b82f6;">${this.app.formatMoney(totalCa)}</div></div>
            <div class="details-kpi-card"><div class="details-kpi-card__label">Paiements</div><div class="details-kpi-card__value" style="color: #10b981;">${this.app.formatMoney(totalPaye)}</div></div>
            <div class="details-kpi-card"><div class="details-kpi-card__label">Restant</div><div class="details-kpi-card__value" style="color: ${restant <= 0 ? '#10b981' : '#ef4444'};">${this.app.formatMoney(restant)}</div></div>
            <div class="details-kpi-card"><div class="details-kpi-card__label">Nb factures</div><div class="details-kpi-card__value">${(user.transactions || []).length}</div></div>
            <div class="details-kpi-card"><div class="details-kpi-card__label">Espèces</div><div class="details-kpi-card__value">${this.app.formatMoney(totalEspeces)}</div></div>
            <div class="details-kpi-card"><div class="details-kpi-card__label">Autres</div><div class="details-kpi-card__value">${this.app.formatMoney(totalAutres)}</div></div>
        `;

        document.getElementById('userBilanModal').style.display = 'flex';
    },

    async exportUserPDF(safeId) {
        const user = this.usersData.find(u => u.name.replace(/[^a-zA-Z0-9]/g, '_') === safeId);
        if (!user) return;
        
        this.app.showToast(`Génération du PDF pour ${user.name}...`, "info");
        
        if (typeof window.jspdf === 'undefined') {
            await new Promise((resolve) => {
                const script1 = document.createElement('script');
                script1.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
                script1.onload = () => {
                    const script2 = document.createElement('script');
                    script2.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.28/jspdf.plugin.autotable.min.js";
                    script2.onload = resolve;
                    document.head.appendChild(script2);
                };
                document.head.appendChild(script1);
            });
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        
        doc.setFontSize(18);
        doc.setTextColor(15, 23, 42);
        doc.text(`Bilan d'Activité : ${user.name}`, 14, 20);
        
        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139);
        const periodeTxt = (this.startDate === this.endDate) ? `Date : ${this.startDate}` : `Période : Du ${this.startDate} au ${this.endDate}`;
        doc.text(periodeTxt, 14, 28);
        
        // Résumé financier
        doc.setFontSize(12);
        doc.setTextColor(15, 23, 42);
        doc.text(`Chiffre d'Affaires généré : ${this.app.formatMoney(user.ca)}`, 14, 40);
        doc.setTextColor(16, 185, 129);
        doc.text(`Montant Encaissé : ${this.app.formatMoney(user.encaisse)}`, 14, 46);
        doc.setTextColor(239, 68, 68);
        doc.text(`Dépenses saisies : ${this.app.formatMoney(user.depense)}`, 14, 52);
        doc.setTextColor(245, 158, 11);
        doc.text(`Reste à recouvrer : ${this.app.formatMoney(user.ca - user.encaisse)}`, 14, 58);

        // Table Transactions
        const transRows = user.transactions.map(t => [
            t.date, 
            t.reference, 
            t.nom, 
            this.app.formatMoney((parseFloat(t.prix) || 0) / 656), 
            this.app.formatMoney(((parseFloat(t.montantParis) || 0) + (parseFloat(t.montantAbidjan) || 0)) / 656)
        ]);

        doc.autoTable({
            startY: 65,
            head: [['Date', 'Réf', 'Client', 'CA (€)', 'Encaissé (€)']],
            body: transRows,
            theme: 'grid',
            headStyles: { fillColor: [59, 130, 246] }
        });

        doc.save(`Bilan_${user.name.replace(/\s+/g, '_')}_${this.startDate}.pdf`);
    }
};