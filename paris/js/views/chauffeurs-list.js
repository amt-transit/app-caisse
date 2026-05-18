import { db } from '../../../firebase-config.js';
import { collection, query, where, onSnapshot, getDocs } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { CONSTANTS } from '../../../constants.js';
import { isEurAgency } from '../../../agency-money.js';

export const ChauffeursListView = {
    unsubAppts: null,
    unsubTrans: null,
    driversData: [],
    appointments: [],
    transactions: [],

    render(app) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.chauffeursList = this;

        // Période par défaut : Mois en cours
        const today = new Date();
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
        const currentDate = today.toISOString().split('T')[0];

        const html = `
            <style>
                .chauffeurs-page { max-width: 1200px; margin: 0 auto; animation: fadeIn 0.3s ease-in-out; }
                .chauffeurs-header { background: white; border-radius: 16px; padding: 20px 25px; margin-bottom: 24px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
                .chauffeurs-header__content { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 15px; }
                .chauffeurs-header__left { display: flex; align-items: center; gap: 15px; }
                .chauffeurs-header__icon { background: #eff6ff; color: #3b82f6; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 14px; font-size: 28px; }
                .chauffeurs-header__title { margin: 0; font-size: 22px; font-weight: 800; color: #0f172a; }
                .chauffeurs-header__subtitle { margin: 4px 0 0 0; font-size: 13px; color: #64748b; }
                .status-badge span { background: #dcfce7; color: #166534; padding: 6px 12px; border-radius: 20px; font-size: 13px; font-weight: 700; border: 1px solid #bbf7d0; }

                .chauffeurs-filters { display: flex; flex-wrap: wrap; gap: 15px; background: white; padding: 20px; border-radius: 16px; border: 1px solid #e2e8f0; margin-bottom: 24px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
                .chauffeurs-table-card { background: white; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
                .chauffeurs-table-header { padding: 15px 20px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; display: flex; align-items: center; gap: 10px; }
                .chauffeurs-table-title { margin: 0; font-size: 16px; font-weight: 700; color: #1e293b; display: flex; align-items: center; gap: 8px; }
                .chauffeurs-table-count { background: #e2e8f0; color: #475569; padding: 2px 8px; border-radius: 12px; font-size: 12px; }

                .chauffeurs-table { width: 100%; border-collapse: collapse; }
                .chauffeurs-table th { text-align: left; padding: 16px 20px; background: white; font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; }
                .chauffeurs-table td { padding: 16px 20px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
                .chauffeurs-table tbody tr { cursor: pointer; transition: background 0.2s; }
                .chauffeurs-table tbody tr:hover td { background: #f1f5f9; }

                .driver-cell { display: flex; align-items: center; gap: 12px; }
                .driver-avatar { width: 44px; height: 44px; border-radius: 50%; background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 15px; }
                .driver-name { font-weight: 800; color: #0f172a; font-size: 14px; text-transform: uppercase; margin-bottom: 2px; }
                .driver-id { font-size: 11px; color: #64748b; font-family: monospace; }

                .rdv-cell { display: flex; flex-direction: column; gap: 4px; }
                .rdv-badge { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 6px; display: inline-block; width: max-content; }
                .rdv-badge--total { background: #f1f5f9; color: #475569; }
                .rdv-badge--executed { background: #dcfce7; color: #16a34a; }

                .perf-cell { display: flex; flex-direction: column; gap: 6px; width: 100%; max-width: 200px; }
                .perf-header { display: flex; justify-content: space-between; align-items: center; }
                .perf-badge { font-size: 12px; font-weight: 800; color: #0f172a; }
                .perf-bar { height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden; width: 100%; }
                .perf-bar__fill { height: 100%; border-radius: 4px; transition: width 0.5s ease-out; }

                .money-cell { display: flex; flex-direction: column; }
                .money-value { font-weight: 800; font-size: 15px; color: #0f172a; font-family: monospace; }
                .money-label { font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; }

                /* --- MODALE DÉTAIL CHAUFFEUR --- */
                .cd-modal { display: none; position: fixed; inset: 0; z-index: 9999; align-items: center; justify-content: center; }
                .cd-modal.active { display: flex; animation: fadeIn 0.2s; }
                .cd-modal__overlay { position: absolute; inset: 0; background: rgba(15,23,42,0.6); backdrop-filter: blur(4px); }
                .cd-modal__panel { position: relative; background: white; width: 95%; max-width: 800px; max-height: 90vh; border-radius: 16px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); z-index: 10000; }
                .modal__head { display: flex; justify-content: space-between; align-items: center; padding: 20px 25px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; }
                .modal__title { font-size: 20px; font-weight: 800; color: #0f172a; }
                .modal__sub { font-size: 12px; color: #64748b; margin-top: 4px; }
                .modal__actions { display: flex; gap: 10px; align-items: center; }
                .modal__body { padding: 25px; overflow-y: auto; flex: 1; }
                
                .detailTop { display: flex; gap: 15px; align-items: center; margin-bottom: 25px; }
                .avatar--lg { width: 56px; height: 56px; border-radius: 50%; font-size: 20px; background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; display: flex; align-items: center; justify-content: center; font-weight: 800; }
                .detailName { font-size: 18px; font-weight: 800; color: #1e293b; margin-bottom: 4px; }
                .mono { font-family: monospace; }

                .detailGrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 25px; }
                .dcard { background: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 12px; }
                .dcard__k { font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; margin-bottom: 6px; }
                .dcard__v { font-size: 20px; font-weight: 800; color: #0f172a; }

                .detailBlocks { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px; }
                @media (max-width: 768px) { .detailBlocks { grid-template-columns: 1fr; } }
                .dblock { border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; }
                .dblock__title { font-weight: 800; color: #1e293b; font-size: 15px; }

                .barRow { display: flex; align-items: center; gap: 12px; margin-top: 12px; }
                .barRow__date { width: 80px; font-size: 12px; color: #475569; }
                .barRow__bars { flex: 1; height: 10px; background: #f1f5f9; border-radius: 5px; position: relative; overflow: hidden; }
                .barFill { height: 100%; border-radius: 5px; position: absolute; left: 0; top: 0; }
                .barFill--slate { background: #cbd5e1; }
                .barFill--blue { background: #3b82f6; }
                .pill { padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: bold; }
                .pill--slate { background: #f1f5f9; color: #475569; }
                .pill--blue { background: #eff6ff; color: #1d4ed8; }
                .pill--amber { background: #fffbeb; color: #d97706; }
                .pill--green { background: #f0fdf4; color: #16a34a; }
            </style>
            <div class="chauffeurs-page">
                <div class="chauffeurs-header">
                    <div class="chauffeurs-header__content">
                        <div class="chauffeurs-header__left">
                            <div class="chauffeurs-header__icon">🚗</div>
                            <div class="chauffeurs-header__info">
                                <h1 class="chauffeurs-header__title">Liste chauffeurs</h1>
                                <p class="chauffeurs-header__subtitle">Statistiques et performances par chauffeur</p>
                            </div>
                        </div>
                        <div class="chauffeurs-header__status">
                            <div class="status-badge"><span>✅ En ligne</span></div>
                        </div>
                    </div>
                </div>

                <div class="chauffeurs-filters">
                    <div class="filter-group">
                        <label class="filter-label"><span class="filter-icon">📅</span> Du</label>
                        <input id="cfStartDate" class="filter-input" type="date" value="${firstDay}">
                    </div>
                    <div class="filter-group">
                        <label class="filter-label"><span class="filter-icon">📅</span> Au</label>
                        <input id="cfEndDate" class="filter-input" type="date" value="${currentDate}">
                    </div>
                    <div class="filter-group" style="flex: 1.5;">
                        <label class="filter-label"><span class="filter-icon">👤</span> Chauffeur</label>
                        <select id="cfDriverSelect" class="filter-select">
                            <option value="">Tous les chauffeurs</option>
                            <!-- Rempli en JS -->
                        </select>
                    </div>
                </div>

                <div class="chauffeurs-table-card">
                    <div class="chauffeurs-table-header">
                        <h2 class="chauffeurs-table-title"><span class="chauffeurs-table-icon">👥</span> Chauffeurs <span class="chauffeurs-table-count" id="cfCount">0</span></h2>
                    </div>
                    <div class="table-wrap">
                        <table class="chauffeurs-table">
                            <thead>
                                <tr>
                                    <th style="width: 280px;">Chauffeur</th>
                                    <th style="width: 150px;">RDV</th>
                                    <th style="width: 200px;">Performance</th>
                                    <th style="width: 140px; text-align: right;">CA Facturé</th>
                                    <th style="width: 160px; text-align: right;">Encaissé</th>
                                </tr>
                            </thead>
                            <tbody id="cfTableBody">
                                <tr><td colspan="5" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Collecte des données...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Modal Détail Chauffeur -->
            <div id="driverDetailModal" class="cd-modal">
                <div class="cd-modal__overlay" onclick="window.app.views.chauffeursList.closeDriverDetail()"></div>
                <div class="cd-modal__panel" id="driverDetailPanel">
                    <!-- Rempli en JS -->
                </div>
            </div>
        `;

        document.getElementById('contentContainer').innerHTML = html;

        // Écouteurs de filtres
        document.getElementById('cfStartDate').addEventListener('change', () => this.renderTable());
        document.getElementById('cfEndDate').addEventListener('change', () => this.renderTable());
        document.getElementById('cfDriverSelect').addEventListener('change', () => this.renderTable());

        this.loadData();
    },

    async loadData() {
        try {
            const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
            // 1. Charger la liste des chauffeurs uniques (users + agents)
            const usersSnap = await getDocs(collection(db, "users"));
            const agentsSnap = await getDocs(collection(db, "agents"));
            
            const driverMap = new Map();
            
            usersSnap.forEach(doc => {
                const data = doc.data();
                if ((data.role === 'chauf' || data.isChauffeur) && (data.agency === activeAgency || data.agency === 'all')) {
                    const name = data.displayName || data.email || 'Inconnu';
                    driverMap.set(name.toLowerCase().trim(), { id: doc.id, name, photoURL: data.photoURL });
                }
            });
            
            agentsSnap.forEach(doc => {
                const data = doc.data();
                const name = data.name;
                if (name && (data.agency === activeAgency || data.agency === 'all') && !driverMap.has(name.toLowerCase().trim())) {
                    driverMap.set(name.toLowerCase().trim(), { id: doc.id, name, photoURL: data.photoURL });
                }
            });

            this.driversData = Array.from(driverMap.values()).sort((a, b) => a.name.localeCompare(b.name));

            // Remplir le dropdown
            const select = document.getElementById('cfDriverSelect');
            if (select) {
                select.innerHTML = '<option value="">Tous les chauffeurs</option>' + 
                    this.driversData.map(d => `<option value="${d.name}">${d.name}</option>`).join('');
            }

            // 2. Charger les RDV et Transactions en temps réel pour l'agence
            // (activeAgency déjà défini plus haut)

            if (this.unsubAppts) this.unsubAppts();
            this.unsubAppts = onSnapshot(query(collection(db, "appointments"), where("agency", "==", activeAgency)), snap => {
                this.appointments = snap.docs.map(d => ({id: d.id, ...d.data()}));
                this.renderTable();
            });

            if (this.unsubTrans) this.unsubTrans();
            this.unsubTrans = onSnapshot(query(collection(db, "transactions"), where("agency", "==", activeAgency), where("isDeleted", "==", false)), snap => {
                this.transactions = snap.docs.map(d => ({id: d.id, ...d.data()}));
                this.renderTable();
            });

        } catch (error) {
            console.error("Erreur de chargement Chauffeurs:", error);
            this.app.showToast("Erreur lors du chargement des statistiques.", "error");
        }
    },

    renderTable() {
        const tbody = document.getElementById('cfTableBody');
        if (!tbody) return;

        const startDate = document.getElementById('cfStartDate').value;
        const endDate = document.getElementById('cfEndDate').value;
        const selectedDriver = document.getElementById('cfDriverSelect').value;

        const TAUX = isEurAgency() ? CONSTANTS.TAUX_CONVERSION : 1; // route-aware : ÷ taux uniquement pour Paris (€)

        // Filtrer les chauffeurs si un est sélectionné
        let driversToRender = this.driversData;
        if (selectedDriver) {
            driversToRender = driversToRender.filter(d => d.name === selectedDriver);
        }

        document.getElementById('cfCount').textContent = driversToRender.length;

        if (driversToRender.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 40px; color: #64748b;">Aucun chauffeur trouvé.</td></tr>`;
            return;
        }

        tbody.innerHTML = driversToRender.map(driver => {
            // Initiales pour l'avatar
            const initials = driver.name.substring(0, 2).toUpperCase();
            const avatarHtml = driver.photoURL 
                ? `<div class="driver-avatar" style="background-image: url('${driver.photoURL}'); background-size: cover; background-position: center; color: transparent;"></div>`
                : `<div class="driver-avatar">${initials}</div>`;

            // Filtrer les RDVs (Par date de création "dateAjout" ou "date" du RDV)
            const driverRdvs = this.appointments.filter(a => {
                if (a.livreur !== driver.name) return false;
                // Filtrage par date de programme ou date du RDV
                const rdvDate = a.dateProgramme || a.date;
                if (!rdvDate) return false;
                if (startDate && rdvDate < startDate) return false;
                if (endDate && rdvDate > endDate) return false;
                return true;
            });

            const totalRdv = driverRdvs.length;
            const executedRdv = driverRdvs.filter(a => a.status === 'réalisé' || a.status === 'confirmé').length; // Ajustez les statuts de réussite selon votre logique
            const perfPerc = totalRdv > 0 ? ((executedRdv / totalRdv) * 100).toFixed(1) : 0;

            // Couleur de la barre de perf
            let barColor = '#ef4444'; // Rouge
            if (perfPerc >= 50) barColor = '#f59e0b'; // Orange
            if (perfPerc >= 80) barColor = '#10b981'; // Vert

            // Filtrer les Transactions (CA & Encaissé)
            const driverTrans = this.transactions.filter(t => {
                // On vérifie si l'agent est assigné à la transaction (saisiPar ou agent)
                // Ou on peut se baser sur les RDVs liés. Par simplicité, on cherche le nom dans "agent" ou "saisiPar"
                const agents = t.agent || t.saisiPar || '';
                if (!agents.includes(driver.name)) return false;
                
                const tDate = t.date;
                if (startDate && tDate < startDate) return false;
                if (endDate && tDate > endDate) return false;
                return true;
            });

            let caFacture = 0;
            let encaisse = 0;

            driverTrans.forEach(t => {
                // Pour Paris, les montants sont en EUR (ou en CFA divisés par 656)
                caFacture += (parseFloat(t.prix) || 0) / TAUX;
                encaisse += (parseFloat(t.montantParis) || 0) / TAUX;
            });

            return `
                <tr onclick="window.app.views.chauffeursList.openDriverDetail('${driver.name.replace(/'/g, "\\'")}')">
                    <td>
                        <div class="driver-cell">
                            ${avatarHtml}
                            <div class="driver-info">
                                <div class="driver-name">${driver.name}</div>
                                <div class="driver-id">ID ${driver.id.substring(0, 4).toUpperCase()}</div>
                            </div>
                        </div>
                    </td>
                    <td>
                        <div class="rdv-cell">
                            <div class="rdv-badge rdv-badge--total">${totalRdv} total</div>
                            <div class="rdv-badge rdv-badge--executed">${executedRdv} validés</div>
                        </div>
                    </td>
                    <td>
                        <div class="perf-cell">
                            <div class="perf-header">
                                <span class="perf-badge" style="color: ${barColor};">${perfPerc}%</span>
                            </div>
                            <div class="perf-bar">
                                <div class="perf-bar__fill" style="width: ${perfPerc}%; background: ${barColor};"></div>
                            </div>
                        </div>
                    </td>
                    <td style="text-align: right;">
                        <div class="money-cell">
                            <div class="money-value">${this.app.formatMoney(caFacture)}</div>
                            <div class="money-label">Facturé</div>
                        </div>
                    </td>
                    <td style="text-align: right;">
                        <div class="money-cell">
                            <div class="money-value" style="color: #10b981;">${this.app.formatMoney(encaisse)}</div>
                            <div class="money-label">Encaissé (Paris)</div>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    },

    openDriverDetail(driverName) {
        const startDate = document.getElementById('cfStartDate').value;
        const endDate = document.getElementById('cfEndDate').value;
        const TAUX = isEurAgency() ? CONSTANTS.TAUX_CONVERSION : 1; // route-aware : ÷ taux uniquement pour Paris (€)

        // RDV du chauffeur
        const driverRdvs = this.appointments.filter(a => {
            if (a.livreur !== driverName) return false;
            const d = a.dateProgramme || a.date;
            if (!d || (startDate && d < startDate) || (endDate && d > endDate)) return false;
            return true;
        });

        // Transactions du chauffeur
        const driverTrans = this.transactions.filter(t => {
            const agents = t.agent || t.saisiPar || '';
            if (!agents.includes(driverName)) return false;
            const d = t.date;
            if (!d || (startDate && d < startDate) || (endDate && d > endDate)) return false;
            return true;
        });

        // Groupement par date
        const datesMap = {};
        driverRdvs.forEach(r => {
            const d = r.dateProgramme || r.date;
            if(!datesMap[d]) datesMap[d] = { date: d, rdv:0, valid:0, ca:0, encaisse:0 };
            datesMap[d].rdv++;
            if(['réalisé', 'confirmé', 'LIVRE'].includes(r.status)) datesMap[d].valid++;
        });
        driverTrans.forEach(t => {
            const d = t.date;
            if(!datesMap[d]) datesMap[d] = { date: d, rdv:0, valid:0, ca:0, encaisse:0 };
            datesMap[d].ca += (parseFloat(t.prix)||0) / TAUX;
            datesMap[d].encaisse += (parseFloat(t.montantParis)||0) / TAUX;
        });

        const sortedDates = Object.values(datesMap).sort((a,b) => a.date.localeCompare(b.date));

        // KPIs globaux
        const totalRdv = sortedDates.reduce((sum, d) => sum + d.rdv, 0);
        const totalValid = sortedDates.reduce((sum, d) => sum + d.valid, 0);
        const perf = totalRdv > 0 ? (totalValid / totalRdv * 100).toFixed(1) : 0;
        const totalCa = sortedDates.reduce((sum, d) => sum + d.ca, 0);
        const totalEnc = sortedDates.reduce((sum, d) => sum + d.encaisse, 0);
        const reste = totalCa - totalEnc;
        const tmTotal = totalRdv > 0 ? (totalCa / totalRdv) : 0;
        const tmValid = totalValid > 0 ? (totalCa / totalValid) : 0;

        // Rendu SVG (Courbe CA vs Encaissé)
        let pointsCa = [], pointsEnc = [];
        if(sortedDates.length > 0) {
            const maxVal = Math.max(...sortedDates.map(d => Math.max(d.ca, d.encaisse)), 1);
            const w = 560 - 24; const h = 160 - 24;
            const step = sortedDates.length > 1 ? w / (sortedDates.length - 1) : w;

            sortedDates.forEach((d, i) => {
                const x = 12 + (sortedDates.length > 1 ? i * step : w/2);
                const yCa = 12 + h - (d.ca / maxVal * h);
                const yEnc = 12 + h - (d.encaisse / maxVal * h);
                pointsCa.push(`${x},${yCa}`);
                pointsEnc.push(`${x},${yEnc}`);
            });
        }

        const driverId = this.driversData.find(d => d.name === driverName)?.id.substring(0,4).toUpperCase() || '----';
        const initials = driverName.substring(0, 2).toUpperCase();
        
        const driverObj = this.driversData.find(d => d.name === driverName);
        const avatarHtml = driverObj && driverObj.photoURL
            ? `<div class="avatar--lg" style="background-image: url('${driverObj.photoURL}'); background-size: cover; background-position: center; color: transparent;"></div>`
            : `<div class="avatar--lg">${initials}</div>`;

        const modalPanel = document.getElementById('driverDetailPanel');
        modalPanel.innerHTML = `
            <div class="modal__head">
                <div>
                    <div class="modal__title">${driverName}</div>
                    <div class="modal__sub">Période: ${startDate || '-'} → ${endDate || '-'}</div>
                </div>
                <div class="modal__actions">
                    <button class="btn btn--outline" type="button" style="background:white; border:1px solid #cbd5e1; padding:8px 12px; border-radius:8px; font-weight:600; cursor:pointer; font-size:12px;">📄 Exporter PDF</button>
                    <button class="btn" type="button" aria-label="Fermer" title="Fermer" onclick="window.app.views.chauffeursList.closeDriverDetail()" style="background:none; border:none; font-size:24px; cursor:pointer; color:#64748b;">&times;</button>
                </div>
            </div>
            <div class="modal__body">
                <div class="detailTop">
                    ${avatarHtml}
                    <div>
                        <div class="detailName">${driverName}</div>
                        <div class="muted"><span class="mono" style="background:#f1f5f9; padding:2px 6px; border-radius:4px;">ID ${driverId}</span></div>
                    </div>
                </div>
                <div class="detailGrid">
                    <div class="dcard"><div class="dcard__k">RDV total</div><div class="dcard__v mono">${totalRdv}</div></div>
                    <div class="dcard"><div class="dcard__k">RDV validés</div><div class="dcard__v mono">${totalValid}</div></div>
                    <div class="dcard"><div class="dcard__k">Performance</div><div class="dcard__v mono">${perf}%</div></div>
                    <div class="dcard"><div class="dcard__k">CA facturé</div><div class="dcard__v mono">${this.app.formatMoney(totalCa)}</div></div>
                    <div class="dcard"><div class="dcard__k">Encaissé</div><div class="dcard__v mono" style="color:#10b981;">${this.app.formatMoney(totalEnc)}</div></div>
                    <div class="dcard"><div class="dcard__k">Reste à encaisser</div><div class="dcard__v mono" style="color:#ef4444;">${this.app.formatMoney(reste)}</div></div>
                    <div class="dcard"><div class="dcard__k">Ticket moyen (CA / RDV)</div><div class="dcard__v mono">${this.app.formatMoney(tmTotal)}</div></div>
                    <div class="dcard"><div class="dcard__k">Ticket moyen (CA / Validés)</div><div class="dcard__v mono">${this.app.formatMoney(tmValid)}</div></div>
                </div>
                <div class="detailBlocks">
                    <div class="dblock">
                        <div style="margin-bottom:15px;"><div class="dblock__title">RDV par jour</div><div class="muted">Total vs validés</div></div>
                        <div class="bars">
                            ${sortedDates.map(d => {
                                const pct = d.rdv > 0 ? (d.valid / d.rdv * 100) : 0;
                                return `<div class="barRow">
                                    <div class="barRow__date mono">${d.date}</div>
                                    <div class="barRow__bars"><div class="barFill barFill--blue" style="width: ${pct}%;"></div></div>
                                    <div style="display:flex; gap:5px;"><span class="pill pill--slate mono">${d.rdv}</span><span class="pill pill--blue mono">${d.valid}</span></div>
                                </div>`;
                            }).join('') || '<div class="muted">Aucune donnée.</div>'}
                        </div>
                    </div>
                    <div class="dblock">
                        <div style="margin-bottom:15px;"><div class="dblock__title">Finance par jour</div><div class="muted">CA vs encaissé</div></div>
                        <div style="position:relative; height:160px; background:#f8fafc; border-radius:8px; padding:10px;">
                            <svg viewBox="0 0 560 160" preserveAspectRatio="none" style="width:100%; height:100%;">
                                <defs>
                                    <linearGradient id="gCa2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="rgba(245,158,11,.95)"></stop><stop offset="1" stop-color="rgba(99,102,241,.85)"></stop></linearGradient>
                                    <linearGradient id="gEnc2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="rgba(16,185,129,.95)"></stop><stop offset="1" stop-color="rgba(37,99,235,.85)"></stop></linearGradient>
                                </defs>
                                <polyline points="${pointsCa.join(' ')}" fill="none" stroke="url(#gCa2)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>
                                <polyline points="${pointsEnc.join(' ')}" fill="none" stroke="url(#gEnc2)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>
                            </svg>
                            <div style="position:absolute; bottom:10px; right:10px; display:flex; gap:8px;">
                                <span class="pill pill--amber mono">CA</span><span class="pill pill--green mono">Encaissé</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('driverDetailModal').classList.add('active');
    },

    closeDriverDetail() {
        document.getElementById('driverDetailModal').classList.remove('active');
    }
};