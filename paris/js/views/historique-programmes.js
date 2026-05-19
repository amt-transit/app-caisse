import { db } from '../../../firebase-config.js';
import { getCollectionName } from '../../../agencies-config.js';
import { collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const HistoriqueProgrammesView = {
    unsub: null,
    rdvs: [],
    programs: [],

    render(app) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.historiqueProgrammes = this;

        const html = `
            <style>
                .history-page { max-width: 1200px; margin: 0 auto; animation: fadeIn 0.3s ease; }
                .history-header { background: white; border-radius: 16px; padding: 20px 25px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #e2e8f0; margin-bottom: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
                .history-header__content { display: flex; align-items: center; gap: 15px; }
                .history-header__icon { background: #f8fafc; font-size: 28px; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 14px; }
                .history-header__title { margin: 0; font-size: 22px; font-weight: 800; color: #0f172a; }
                .history-header__subtitle { margin: 4px 0 0 0; font-size: 13px; color: #64748b; }
                
                .history-filters { display: flex; flex-wrap: wrap; gap: 15px; background: white; padding: 20px; border-radius: 16px; border: 1px solid #e2e8f0; margin-bottom: 24px; }
                .filter-group { flex: 1; min-width: 150px; display: flex; flex-direction: column; gap: 6px; }
                .filter-label { font-size: 11px; font-weight: 600; color: #475569; text-transform: uppercase; }
                .filter-input { width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; outline: none; transition: 0.2s; box-sizing:border-box; }
                .filter-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
                
                .history-table-card { background: white; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.02); }
                .history-table-header { padding: 15px 20px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; display: flex; justify-content: space-between; align-items: center; }
                .history-table-title { margin: 0; font-size: 16px; font-weight: 700; color: #1e293b; display: flex; align-items: center; gap: 10px; }
                .history-table-count { background: #e2e8f0; color: #475569; padding: 2px 8px; border-radius: 12px; font-size: 12px; }
                
                .table-wrap { overflow-x: auto; }
                .history-table { width: 100%; border-collapse: collapse; }
                .history-table th { text-align: left; padding: 12px 15px; background: white; font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; }
                .history-table td { padding: 15px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #334155; vertical-align: middle; }
                .history-table tr:hover td { background: #f8fafc; }
                
                .date-cell { font-weight: 600; color: #0f172a; }
                .chauffeur-cell { font-weight: 700; color: #1e293b; }
                .phone-cell { color: #64748b; font-weight: 600; }
                
                .stat-value { font-size: 16px; font-weight: 800; color: #0f172a; }
                .stat-badge { padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 700; }
                .stat-badge--depot { background: #e0f2fe; color: #0284c7; }
                .stat-badge--recup { background: #f3e8ff; color: #7e22ce; }
                
                .actions-cell { display: flex; gap: 8px; }
                .btn-voir { background: white; border: 1px solid #cbd5e1; padding: 6px 12px; border-radius: 8px; font-weight: 600; color: #475569; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 6px; }
                .btn-voir:hover { background: #f1f5f9; color: #0f172a; }
                .btn-print { background: white; border: 1px solid #cbd5e1; width: 32px; height: 32px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s; color: #475569; }
                .btn-print:hover { background: #f1f5f9; color: #0f172a; }

                /* Modal Details */
                .hp-modal { display:none; position:fixed; z-index:9999; left:0; top:0; width:100%; height:100%; background:rgba(15, 23, 42, 0.6); backdrop-filter: blur(4px); align-items:center; justify-content:center; }
                .hp-modal.active { display:flex; }
                .hp-modal-box { background: white; border-radius: 16px; display: flex; flex-direction: column; max-height: 90vh; width: 90%; max-width: 900px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); overflow: hidden; }
                .hp-modal-header { padding: 20px 25px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; display: flex; justify-content: space-between; align-items: center; }
                .hp-modal-body { padding: 0; overflow-y: auto; flex: 1; }
            </style>

            <div class="history-page">
                <div class="history-header">
                    <div class="history-header__content">
                        <div class="history-header__icon">📚</div>
                        <div class="history-header__info">
                            <h1 class="history-header__title">Historique des programmes</h1>
                            <p class="history-header__subtitle">Programmes passés et en cours (par date)</p>
                        </div>
                    </div>
                </div>

                <div class="history-filters">
                    <div class="filter-group">
                        <label class="filter-label"><span class="filter-icon">📅</span> Date</label>
                        <input class="filter-input" type="date" id="hpDateFilter">
                    </div>
                    <div class="filter-group" style="flex: 2;">
                        <label class="filter-label"><span class="filter-icon">🔍</span> Recherche</label>
                        <input class="filter-input" type="text" id="hpSearchFilter" placeholder="Chauffeur, téléphone, client, adresse...">
                    </div>
                </div>

                <div class="history-table-card">
                    <div class="history-table-header">
                        <h2 class="history-table-title"><span class="history-table-icon">📋</span> Programmes <span class="history-table-count" id="hpCount">0</span></h2>
                    </div>
                    <div class="table-wrap">
                        <table class="history-table">
                            <thead>
                                <tr>
                                    <th style="width: 140px;">Date</th>
                                    <th>Chauffeur</th>
                                    <th style="width: 100px; text-align: center;">RDV</th>
                                    <th style="width: 100px; text-align: center;">Dépôts</th>
                                    <th style="width: 100px; text-align: center;">Récup.</th>
                                    <th style="width: 140px;">Actions</th>
                                </tr>
                            </thead>
                            <tbody id="hpTableBody">
                                <tr><td colspan="6" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- MODAL DÉTAILS -->
            <div id="hpDetailsModal" class="hp-modal">
                <div class="hp-modal-box">
                    <div class="hp-modal-header">
                        <div>
                            <h2 style="margin:0; font-size:18px; color:#0f172a;" id="hpModalTitle">Détails du programme</h2>
                            <div style="font-size:13px; color:#64748b; margin-top:4px;" id="hpModalSubtitle"></div>
                        </div>
                        <button onclick="document.getElementById('hpDetailsModal').classList.remove('active')" style="background:none; border:none; font-size:24px; cursor:pointer; color:#64748b;">&times;</button>
                    </div>
                    <div class="hp-modal-body">
                        <table class="history-table" style="margin:0; border-bottom:none;">
                            <thead style="position:sticky; top:0; z-index:10; box-shadow:0 2px 4px rgba(0,0,0,0.05);">
                                <tr>
                                    <th>Ordre</th>
                                    <th>Type</th>
                                    <th>Client</th>
                                    <th>Adresse</th>
                                    <th>Heure</th>
                                    <th>Statut</th>
                                </tr>
                            </thead>
                            <tbody id="hpModalTableBody"></tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('contentContainer').innerHTML = html;

        document.getElementById('hpDateFilter').addEventListener('change', () => this.filterAndRender());
        document.getElementById('hpSearchFilter').addEventListener('input', () => this.filterAndRender());

        this.loadData();
    },

    loadData() {
        if (this.unsub) this.unsub();
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';

        const q = query(collection(db, getCollectionName("appointments")), where("agency", "==", activeAgency));
        
        this.unsub = onSnapshot(q, (snapshot) => {
            this.rdvs = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
            
            // Grouper par dateProgramme + livreur
            const groups = {};
            this.rdvs.forEach(rdv => {
                if (rdv.dateProgramme && rdv.livreur) {
                    const key = `${rdv.dateProgramme}__${rdv.livreur}`;
                    if (!groups[key]) {
                        groups[key] = {
                            date: rdv.dateProgramme,
                            livreur: rdv.livreur,
                            total: 0,
                            depots: 0,
                            recups: 0,
                            items: []
                        };
                    }
                    groups[key].items.push(rdv);
                    groups[key].total++;
                    if (rdv.rdvType === 'DEPOT') groups[key].depots++;
                    else groups[key].recups++;
                }
            });

            this.programs = Object.values(groups);
            // Tri par date décroissante puis par chauffeur
            this.programs.sort((a, b) => {
                if (a.date !== b.date) return new Date(b.date) - new Date(a.date);
                return a.livreur.localeCompare(b.livreur);
            });

            this.filterAndRender();
        });
    },

    filterAndRender() {
        const dateFilter = document.getElementById('hpDateFilter').value;
        const searchFilter = document.getElementById('hpSearchFilter').value.toLowerCase().trim();

        const filtered = this.programs.filter(p => {
            if (dateFilter && p.date !== dateFilter) return false;
            if (searchFilter) {
                const str = `${p.livreur} ${p.date}`.toLowerCase();
                // Chercher aussi si un des clients correspond
                const hasClient = p.items.some(i => (i.client||'').toLowerCase().includes(searchFilter) || (i.adresse||'').toLowerCase().includes(searchFilter) || (i.tel||'').includes(searchFilter));
                if (!str.includes(searchFilter) && !hasClient) return false;
            }
            return true;
        });

        document.getElementById('hpCount').textContent = filtered.length;
        const tbody = document.getElementById('hpTableBody');

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #64748b;">Aucun programme trouvé.</td></tr>';
            return;
        }

        tbody.innerHTML = filtered.map(p => `
            <tr>
                <td><div class="date-cell">📅 ${p.date ? new Date(p.date).toLocaleDateString('fr-FR') : ''}</div></td>
                <td><div class="chauffeur-cell">${p.livreur}</div></td>
                <td style="text-align: center;"><div class="stat-value">${p.total}</div></td>
                <td style="text-align: center;"><span class="stat-badge stat-badge--depot">${p.depots}</span></td>
                <td style="text-align: center;"><span class="stat-badge stat-badge--recup">${p.recups}</span></td>
                <td class="actions-cell">
                    <button class="btn-voir" type="button" title="Voir les RDV" onclick="window.app.views.historiqueProgrammes.viewDetails('${p.date}', '${p.livreur.replace(/'/g, "\\'")}')">
                        👁️ Voir
                    </button>
                    <button class="btn-print" type="button" title="Imprimer" onclick="window.app.views.historiqueProgrammes.printRoadmap('${p.date}', '${p.livreur.replace(/'/g, "\\'")}')">
                        🖨️
                    </button>
                </td>
            </tr>
        `).join('');
    },

    viewDetails(date, livreur) {
        const prog = this.programs.find(p => p.date === date && p.livreur === livreur);
        if (!prog) return;

        document.getElementById('hpModalTitle').textContent = `Programme de ${livreur}`;
        document.getElementById('hpModalSubtitle').textContent = `Date : ${new Date(date).toLocaleDateString('fr-FR')} - ${prog.total} RDV`;

        const items = [...prog.items].sort((a, b) => (a.orderInRoute || 0) - (b.orderInRoute || 0));
        const tbody = document.getElementById('hpModalTableBody');
        
        tbody.innerHTML = items.map((r, index) => {
            const isDepot = r.rdvType === 'DEPOT';
            const typeLabel = isDepot ? 'DÉPÔT' : 'RÉCUP.';
            
            let statusColor = '#64748b';
            let statusText = 'En attente';
            if (r.status === 'réalisé' || r.status === 'confirmé') { statusColor = '#10b981'; statusText = 'Confirmé/Réalisé'; }
            else if (r.status === 'en_cours') { statusColor = '#3b82f6'; statusText = 'En cours'; }
            else if (r.status === 'annulé') { statusColor = '#ef4444'; statusText = 'Annulé'; }

            return `
                <tr>
                    <td style="text-align:center; font-weight:bold; color:#94a3b8;">${index + 1}</td>
                    <td><span style="padding: 4px 8px; border-radius: 6px; font-size: 10px; font-weight: 800; border: 1px solid #e2e8f0; ${isDepot ? 'background:#e0f2fe;color:#0284c7;' : 'background:#f3e8ff;color:#7e22ce;'}">${typeLabel}</span></td>
                    <td>
                        <div style="font-weight:700; color:#1e293b;">${r.client}</div>
                        <div style="font-size:11px; color:#64748b;">📞 ${r.tel || '—'}</div>
                    </td>
                    <td>
                        <div style="font-size:12px; color:#475569; max-width:250px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${r.adresse || ''}">${r.adresse || '—'}</div>
                    </td>
                    <td style="font-weight:600; color:#475569;">${r.time || '—'}</td>
                    <td><span style="font-size:11px; font-weight:700; color:${statusColor}; padding:2px 8px; background:${statusColor}20; border-radius:12px;">${statusText}</span></td>
                </tr>
            `;
        }).join('');

        document.getElementById('hpDetailsModal').classList.add('active');
    },

    printRoadmap(date, livreur) {
        const prog = this.programs.find(p => p.date === date && p.livreur === livreur);
        if (!prog) return;

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF(); 
        
        doc.setFontSize(18);
        doc.text(`Feuille de route - ${livreur} - ${date}`, 14, 22);
        
        const items = [...prog.items].sort((a, b) => (a.orderInRoute || 0) - (b.orderInRoute || 0));
        const tableColumn = ["ORDRE", "TYPE", "CLIENT", "TELEPHONE", "ADRESSE", "HEURE"];
        const tableRows = items.map((r, i) => [
            (i + 1).toString(),
            r.rdvType === 'DEPOT' ? 'DEPOT' : 'RECUP',
            r.client || '',
            r.tel || '',
            r.adresse || '',
            r.time || ''
        ]);

        doc.autoTable({
            head: [tableColumn],
            body: tableRows,
            startY: 30,
            theme: 'grid',
            styles: { fontSize: 8 },
            headStyles: { fillColor: [59, 130, 246] }
        });

        doc.save(`Feuille_de_route_${livreur.replace(/\s+/g, '_')}_${date}.pdf`);
    }
};