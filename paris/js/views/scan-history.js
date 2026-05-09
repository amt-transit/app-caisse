import { db } from '../../../firebase-config.js';
import { collection, query, where, onSnapshot, limit, orderBy, writeBatch, doc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const ScanHistoryView = {
    unsub: null,
    scans: [],
    filteredScans: [],
    selectedIds: new Set(),
    currentLimit: 50,

    render(app) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.scanHistory = this;
        this.selectedIds.clear();

        const html = `
            <style>
                .scan-history-page { max-width: 1400px; margin: 0 auto; animation: fadeIn 0.3s ease; }
                .scan-history-header { background: white; border-radius: 16px; padding: 20px 25px; margin-bottom: 20px; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
                .scan-history-header__content { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 15px; }
                .scan-history-header__title { margin: 0; font-size: 20px; font-weight: 800; color: #0f172a; }
                .scan-history-header__subtitle { margin: 4px 0 0 0; font-size: 13px; color: #64748b; }
                .scan-history-header__actions { display: flex; gap: 10px; }
                
                .btn-export { padding: 8px 16px; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer; border: 1px solid transparent; transition: 0.2s; }
                .btn-export--excel { background: #f0fdf4; color: #16a34a; border-color: #bbf7d0; }
                .btn-export--excel:hover { background: #dcfce7; }
                .btn-export--pdf { background: #fef2f2; color: #dc2626; border-color: #fecaca; }
                .btn-export--pdf:hover { background: #fee2e2; }

                .filters-section { background: white; border-radius: 16px; padding: 20px; border: 1px solid #e2e8f0; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
                .filters-title { margin: 0 0 15px 0; font-size: 15px; font-weight: 700; color: #1e293b; }
                .filters-grid { display: flex; flex-wrap: wrap; gap: 15px; align-items: flex-end; }
                .filter-field { flex: 1; min-width: 150px; display: flex; flex-direction: column; gap: 6px; }
                .filter-field--action { flex: 0 0 auto; }
                .filter-label { font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; }
                .filter-input, .filter-select { width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; outline: none; background: #f8fafc; transition: 0.2s; }
                .filter-input:focus, .filter-select:focus { border-color: #3b82f6; background: white; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
                .btn-refresh { background: #3b82f6; color: white; border: none; padding: 10px 16px; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer; transition: 0.2s; height: 39px; display: flex; align-items: center; gap: 6px; }
                .btn-refresh:hover { background: #2563eb; }

                .bulk-actions-section { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 15px 20px; margin-bottom: 20px; }
                .bulk-actions-card { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px; }
                .bulk-count { font-size: 14px; color: #475569; font-weight: 600; display: flex; align-items: center; gap: 8px; }
                .bulk-count__number { background: #3b82f6; color: white; padding: 2px 10px; border-radius: 12px; font-weight: 800; }
                .bulk-actions-buttons { display: flex; gap: 10px; }
                .btn-bulk { padding: 8px 16px; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer; border: 1px solid transparent; transition: 0.2s; }
                .btn-bulk--select { background: white; border-color: #cbd5e1; color: #475569; }
                .btn-bulk--select:hover { background: #f1f5f9; color: #0f172a; }
                .btn-bulk--clear { background: white; border-color: #cbd5e1; color: #64748b; }
                .btn-bulk--clear:hover:not(:disabled) { background: #f1f5f9; color: #0f172a; }
                .btn-bulk--update { background: #fef2f2; border-color: #fecaca; color: #ef4444; }
                .btn-bulk--update:hover:not(:disabled) { background: #fee2e2; }
                .btn-bulk:disabled { opacity: 0.5; cursor: not-allowed; }

                .table-section { background: white; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.02); overflow: hidden; }
                .table-wrapper { overflow-x: auto; }
                .data-table { width: 100%; border-collapse: collapse; }
                .data-table th { text-align: left; padding: 15px 20px; background: #f8fafc; font-size: 12px; font-weight: 700; color: #64748b; border-bottom: 1px solid #e2e8f0; text-transform: uppercase; white-space: nowrap; }
                .data-table td { padding: 15px 20px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #334155; vertical-align: middle; }
                .table-row { transition: background 0.2s; cursor: pointer; }
                .table-row:hover { background: #f8fafc; }
                .table-row.selected { background: #eff6ff; }
                
                .col-checkbox { width: 40px; text-align: center; }
                .table-checkbox { width: 16px; height: 16px; cursor: pointer; accent-color: #3b82f6; }
                
                .col-time { font-weight: 600; color: #475569; }
                .col-qr code { font-family: monospace; font-size: 14px; font-weight: 800; color: #0f172a; background: #f1f5f9; padding: 4px 8px; border-radius: 6px; }
                .col-container { font-weight: 700; color: #3b82f6; }
                .col-agent { font-weight: 700; color: #1e293b; }
                
                .status-badge { padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 800; display: inline-flex; align-items: center; gap: 4px; letter-spacing: 0.5px; }
                .status-badge--success { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
                .status-badge--warning { background: #ffedd5; color: #c2410c; border: 1px solid #fed7aa; }
                .status-badge--error { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
            </style>

            <div class="scan-history-page">
                <div class="scan-history-header">
                    <div class="scan-history-header__content">
                        <div class="scan-history-header__info">
                            <h1 class="scan-history-header__title">📊 Scan — Historique</h1>
                            <p class="scan-history-header__subtitle" id="shSubtitle">Journal d'audit — 0 résultat(s)</p>
                        </div>
                        <div class="scan-history-header__actions">
                            <button class="btn-export btn-export--excel" type="button" onclick="window.app.views.scanHistory.exportExcel()"> 📄 Excel </button>
                            <button class="btn-export btn-export--pdf" type="button" onclick="window.app.views.scanHistory.exportPDF()"> 📝 PDF </button>
                        </div>
                    </div>
                </div>

                <div class="filters-section">
                    <h3 class="filters-title">🔍 Filtres</h3>
                    <div class="filters-grid">
                        <div class="filter-field">
                            <label class="filter-label">🏷️ Type</label>
                            <select id="shTypeFilter" class="filter-select" onchange="window.app.views.scanHistory.applyFilters()">
                                <option value="">Tous les types</option>
                                <option value="ENTREPOT_PARIS">Mise en entrepôt</option>
                                <option value="CONTENEUR_CHARGEMENT">Chargement Conteneur</option>
                            </select>
                        </div>
                        <div class="filter-field">
                            <label class="filter-label">📊 Statut</label>
                            <select id="shStatusFilter" class="filter-select" onchange="window.app.views.scanHistory.applyFilters()">
                                <option value="">Tous les statuts</option>
                                <option value="SUCCES">✅ Succès</option>
                                <option value="DOUBLON">⚠️ Doublon</option>
                                <option value="ERREUR">❌ Erreur</option>
                            </select>
                        </div>
                        <div class="filter-field">
                            <label class="filter-label">📅 Date</label>
                            <input id="shDateFilter" class="filter-input" type="date" onchange="window.app.views.scanHistory.applyFilters()">
                        </div>
                        <div class="filter-field" style="flex: 1.5;">
                            <label class="filter-label">🔍 Recherche QR</label>
                            <input id="shSearchFilter" class="filter-input" placeholder="Ex: MD-125…" oninput="window.app.views.scanHistory.applyFilters()">
                        </div>
                        <div class="filter-field">
                            <label class="filter-label">⚙️ Limite</label>
                            <select id="shLimitFilter" class="filter-select" onchange="window.app.views.scanHistory.changeLimit(this.value)">
                                <option value="50">50 derniers</option>
                                <option value="100">100 derniers</option>
                                <option value="200">200 derniers</option>
                                <option value="500">500 derniers</option>
                            </select>
                        </div>
                        <div class="filter-field filter-field--action">
                            <button class="btn-refresh" type="button" onclick="window.app.views.scanHistory.loadData()"> 🔄 Actualiser </button>
                        </div>
                    </div>
                </div>

                <div class="bulk-actions-section">
                    <div class="bulk-actions-card">
                        <div class="bulk-actions-info">
                            <span class="bulk-count">
                                <span class="bulk-count__number" id="shSelectedCount">0</span>
                                <span class="bulk-count__label">sélectionné(s)</span>
                            </span>
                        </div>
                        <div class="bulk-actions-buttons">
                            <button class="btn-bulk btn-bulk--select" type="button" onclick="window.app.views.scanHistory.selectAll()"> ✓ Tout sélectionner </button>
                            <button class="btn-bulk btn-bulk--clear" type="button" id="shBtnClear" disabled onclick="window.app.views.scanHistory.clearSelection()"> ✕ Vider </button>
                            <button class="btn-bulk btn-bulk--update" type="button" id="shBtnDelete" disabled onclick="window.app.views.scanHistory.deleteSelected()"> 🗑️ Supprimer les logs </button>
                        </div>
                    </div>
                </div>

                <div class="table-section">
                    <div class="table-wrapper">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th class="col-checkbox">
                                        <input type="checkbox" id="shSelectAllCb" class="table-checkbox" onchange="window.app.views.scanHistory.toggleSelectAll(this.checked)">
                                    </th>
                                    <th>⏰ Heure</th>
                                    <th>📱 QR Code</th>
                                    <th>📦 Conteneur</th>
                                    <th>📊 Statut</th>
                                    <th>🏷️ Type</th>
                                    <th>👤 Agent</th>
                                </tr>
                            </thead>
                            <tbody id="shTableBody">
                                <tr><td colspan="7" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Chargement du journal...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('contentContainer').innerHTML = html;
        this.loadData();
    },

    changeLimit(val) {
        this.currentLimit = parseInt(val) || 50;
        this.loadData();
    },

    loadData() {
        if (this.unsub) this.unsub();
        
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
        
        try {
            // NOUVEAU : On écoute la collection dédiée 'scan_logs'
            const q = query(
                collection(db, "scan_logs"), 
                where("agency", "==", activeAgency), 
                orderBy("date", "desc"), 
                limit(this.currentLimit)
            );

            this.unsub = onSnapshot(q, (snapshot) => {
                this.scans = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                this.applyFilters();
            });
        } catch(e) { 
            console.error(e); 
            this.app.showToast("Erreur de chargement", "error");
        }
    },

    applyFilters() {
        const typeFilter = document.getElementById('shTypeFilter')?.value || '';
        const statusFilter = document.getElementById('shStatusFilter')?.value || '';
        const dateFilter = document.getElementById('shDateFilter')?.value || '';
        const searchFilter = (document.getElementById('shSearchFilter')?.value || '').toLowerCase().trim();

        this.filteredScans = this.scans.filter(s => {
            if (typeFilter && s.type !== typeFilter) return false;
            if (statusFilter && s.status !== statusFilter) return false;
            if (dateFilter && (!s.date || !s.date.startsWith(dateFilter))) return false;
            if (searchFilter) {
                const str = `${s.scanRef} ${s.container} ${s.agent}`.toLowerCase();
                if (!str.includes(searchFilter)) return false;
            }
            return true;
        });

        document.getElementById('shSubtitle').textContent = `Journal d'audit — ${this.filteredScans.length} résultat(s)`;
        
        // Si des lignes filtrées ne sont plus dans la sélection, on nettoie (optionnel, mais propre)
        const validIds = new Set(this.filteredScans.map(s => s.id));
        for (let id of this.selectedIds) {
            if (!validIds.has(id)) this.selectedIds.delete(id);
        }
        this.updateBulkUI();

        this.renderTable();
    },

    renderTable() {
        const tbody = document.getElementById('shTableBody');
        if (!tbody) return;

        if (this.filteredScans.length === 0) { 
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color:#64748b;">Aucun log ne correspond à vos filtres.</td></tr>'; 
            return; 
        }

        tbody.innerHTML = this.filteredScans.map(s => {
            const isChecked = this.selectedIds.has(s.id);
            
            let statusBadge = '<span class="status-badge status-badge--error">❌ INCONNU</span>';
            if (s.status === 'SUCCES') statusBadge = '<span class="status-badge status-badge--success">✅ SUCCÈS</span>';
            else if (s.status === 'DOUBLON') statusBadge = '<span class="status-badge status-badge--warning">⚠️ DÉJÀ TRAITÉ</span>';
            else if (s.status === 'ERREUR') statusBadge = '<span class="status-badge status-badge--error">❌ ERREUR</span>';

            const typeLabel = s.type === 'ENTREPOT_PARIS' ? '🏭 Mise en entrepôt' : '🚢 Chargement';
            const dateStr = s.date ? new Date(s.date).toLocaleString('fr-FR') : '-';

            return `
                <tr class="table-row ${isChecked ? 'selected' : ''}" onclick="window.app.views.scanHistory.toggleRow('${s.id}')">
                    <td class="col-checkbox">
                        <input type="checkbox" class="table-checkbox" value="${s.id}" ${isChecked ? 'checked' : ''} onclick="event.stopPropagation(); window.app.views.scanHistory.toggleRow('${s.id}')">
                    </td>
                    <td class="col-time">${dateStr}</td>
                    <td class="col-qr"><code>${s.scanRef || '-'}</code></td>
                    <td class="col-container">${s.container === '-' || !s.container ? '<span style="color:#94a3b8;">-</span>' : s.container}</td>
                    <td>${statusBadge}</td>
                    <td><span style="font-size:11px; font-weight:600; color:#64748b;">${typeLabel}</span></td>
                    <td class="col-agent">${s.agent || '-'}</td>
                </tr>
            `;
        }).join('');

        document.getElementById('shSelectAllCb').checked = this.filteredScans.length > 0 && this.selectedIds.size === this.filteredScans.length;
    },

    toggleRow(id) {
        if (this.selectedIds.has(id)) {
            this.selectedIds.delete(id);
        } else {
            this.selectedIds.add(id);
        }
        this.updateBulkUI();
        this.renderTable();
    },

    toggleSelectAll(isChecked) {
        if (isChecked) {
            this.filteredScans.forEach(s => this.selectedIds.add(s.id));
        } else {
            this.selectedIds.clear();
        }
        this.updateBulkUI();
        this.renderTable();
    },

    selectAll() {
        this.toggleSelectAll(true);
    },

    clearSelection() {
        this.selectedIds.clear();
        this.updateBulkUI();
        this.renderTable();
    },

    updateBulkUI() {
        const count = this.selectedIds.size;
        document.getElementById('shSelectedCount').textContent = count;
        
        const btnClear = document.getElementById('shBtnClear');
        const btnDelete = document.getElementById('shBtnDelete');
        
        if (btnClear) btnClear.disabled = count === 0;
        if (btnDelete) btnDelete.disabled = count === 0;
    },

    async deleteSelected() {
        if (this.selectedIds.size === 0) return;
        
        const msg = `Voulez-vous vraiment supprimer définitivement ces ${this.selectedIds.size} logs d'audit ?`;
        if (window.AppModal) {
            if (!await window.AppModal.confirm(msg, "Suppression de Logs", true)) return;
        } else if (!confirm(msg)) return;

        try {
            const batch = writeBatch(db);
            this.selectedIds.forEach(id => {
                batch.delete(doc(db, "scan_logs", id));
            });
            await batch.commit();
            
            this.app.showToast("Logs supprimés avec succès.", "success");
            this.selectedIds.clear();
            this.updateBulkUI();
            // La vue se mettra à jour toute seule grâce au onSnapshot
        } catch(e) {
            console.error(e);
            this.app.showToast("Erreur lors de la suppression.", "error");
        }
    },

    exportExcel() {
        this.app.showToast("L'export Excel sera bientôt disponible pour cet onglet.", "info");
    },

    exportPDF() {
        this.app.showToast("L'export PDF sera bientôt disponible pour cet onglet.", "info");
    }
};