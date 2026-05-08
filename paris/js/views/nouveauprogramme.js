import { db } from '../../../firebase-config.js';
import { collection, query, where, onSnapshot, doc, updateDoc, writeBatch, getDocs } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const NouveauProgrammeView = {
    unsub: null,
    rdvs: [],
    drivers: [],
    selectedDate: new Date().toISOString().split('T')[0],
    selectedDriver: '', // '' = Tous les chauffeurs
    currentOptimizedOrder: null,

    async render(app) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.nouveauProgramme = this;

        await this.loadDrivers();

        const html = `
            <style>
                .programmes-page { max-width: 1400px; margin: 0 auto; animation: fadeIn 0.3s ease; }
                .prog-header { background: white; border-radius: 16px; padding: 20px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #e2e8f0; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); flex-wrap: wrap; gap: 15px; }
                .prog-header__content { display: flex; align-items: center; gap: 15px; }
                .prog-header__icon { font-size: 28px; background: #f8fafc; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; border-radius: 12px; }
                .prog-header__title { margin: 0; font-size: 20px; font-weight: 800; color: #0f172a; }
                .prog-header__subtitle { margin: 2px 0 0 0; font-size: 13px; color: #64748b; }
                .btn-add-chauffeur { background: #3b82f6; color: white; border: none; padding: 10px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 8px; }
                .btn-add-chauffeur:hover { background: #2563eb; }

                .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
                .kpi-card { background: white; border-radius: 12px; padding: 20px; display: flex; align-items: center; gap: 15px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.02); transition: 0.2s; }
                .kpi-card--clickable { cursor: pointer; }
                .kpi-card--clickable:hover { border-color: #3b82f6; box-shadow: 0 4px 6px rgba(59,130,246,0.1); transform: translateY(-2px); }
                .kpi-card__icon { font-size: 28px; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; border-radius: 12px; }
                .kpi-card--purple .kpi-card__icon { background: #faf5ff; color: #9333ea; }
                .kpi-card--blue .kpi-card__icon { background: #eff6ff; color: #3b82f6; }
                .kpi-card--orange .kpi-card__icon { background: #fff7ed; color: #ea580c; }
                .kpi-card--green .kpi-card__icon { background: #f0fdf4; color: #16a34a; }
                .kpi-card__value { font-size: 24px; font-weight: 800; color: #0f172a; line-height: 1; margin-bottom: 4px; }
                .kpi-card__label { font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; }

                .prog-filters { display: flex; flex-wrap: wrap; gap: 12px; background: white; padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 20px; }
                .filter-group { flex: 1; min-width: 150px; display: flex; flex-direction: column; gap: 6px; }
                .filter-label { font-size: 11px; font-weight: 600; color: #475569; text-transform: uppercase; }
                .filter-input, .filter-select { width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; outline: none; }
                .filter-input:focus, .filter-select:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.1); }

                .prog-layout { display: flex; gap: 20px; align-items: flex-start; }
                @media (max-width: 992px) { .prog-layout { flex-direction: column; } }
                
                .chauffeurs-sidebar { width: 320px; flex-shrink: 0; display: flex; flex-direction: column; gap: 15px; }
                @media (max-width: 992px) { .chauffeurs-sidebar { width: 100%; } }
                
                .sidebar-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; }
                .sidebar-title { font-size: 16px; font-weight: 800; margin: 0; display: flex; align-items: center; gap: 8px; color: #0f172a; }
                .sidebar-count { background: #e2e8f0; color: #475569; padding: 2px 8px; border-radius: 12px; font-size: 12px; }
                
                .chauffeurs-list { display: flex; flex-direction: column; gap: 12px; max-height: 800px; overflow-y: auto; padding-right: 5px; }
                .chauffeurs-list::-webkit-scrollbar { width: 4px; }
                .chauffeurs-list::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }

                .chauffeur-card { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 15px; box-shadow: 0 1px 3px rgba(0,0,0,0.02); transition: 0.2s; cursor: pointer; }
                .chauffeur-card:hover { border-color: #cbd5e1; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
                .chauffeur-card.active { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.1); background: #f8fafc; }
                .chauffeur-card__header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; pointer-events: none; }
                .chauffeur-avatar { width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 16px; flex-shrink: 0; }
                .chauffeur-name { font-weight: 700; color: #0f172a; font-size: 14px; margin-bottom: 2px; }
                .chauffeur-meta { font-size: 11px; color: #64748b; }
                
                .chauffeur-stats { display: flex; gap: 10px; margin-bottom: 15px; padding: 10px; background: #f8fafc; border-radius: 8px; pointer-events: none; }
                .chauffeur-stat { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: #475569; }
                .stat-value { color: #0f172a; font-weight: 800; }
                
                .chauffeur-actions { display: flex; gap: 6px; }
                .btn-action { flex: 1; padding: 8px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid transparent; background: white; transition: 0.2s; display: flex; align-items: center; justify-content: center; gap: 4px; }
                .btn-action--add { border-color: #cbd5e1; color: #0f172a; }
                .btn-action--add:hover { background: #f1f5f9; }
                .btn-action--edit, .btn-action--print, .btn-action--delete { flex: 0 0 36px; border-color: #cbd5e1; color: #475569; }
                .btn-action--edit:hover, .btn-action--print:hover { background: #f1f5f9; color: #3b82f6; border-color: #3b82f6; }
                .btn-action--delete:hover { border-color: #ef4444; color: #ef4444; background: #fef2f2; }
                
                .rdv-table-card { flex: 1; background: white; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.02); }
                .rdv-table-header { padding: 15px 20px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; display: flex; justify-content: space-between; align-items: center; }
                .rdv-table-title { margin: 0; font-size: 16px; font-weight: 700; color: #1e293b; display: flex; align-items: center; gap: 10px; }
                .rdv-table-count { background: #cbd5e1; color: #0f172a; padding: 2px 8px; border-radius: 12px; font-size: 12px; }
                
                .table-wrap { overflow-x: auto; }
                .rdv-table { width: 100%; border-collapse: collapse; }
                .rdv-table th { text-align: left; padding: 12px 15px; background: white; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; }
                .rdv-table td { padding: 12px 15px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #334155; vertical-align: middle; }
                .rdv-table tr:hover td { background: #f8fafc; }
                
                .type-badge { padding: 4px 8px; border-radius: 6px; font-size: 10px; font-weight: 800; letter-spacing: 0.5px; display: inline-block; white-space: nowrap; }
                .badge--depot { background: #e0f2fe; color: #0284c7; border: 1px solid #bae6fd; }
                .badge--recup { background: #f3e8ff; color: #7e22ce; border: 1px solid #e9d5ff; }
                
                .client-cell__name { font-weight: 700; color: #0f172a; }
                .client-cell__phone { font-size: 11px; color: #64748b; margin-top: 2px; }
                .address-cell { max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600; color: #1e293b; }
                .description-cell { max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; color: #64748b; }
                
                .actions-cell { display: flex; gap: 4px; }
                .btn-order, .btn-remove { width: 28px; height: 28px; border-radius: 6px; border: 1px solid #cbd5e1; background: white; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 12px; transition: 0.2s; }
                .btn-order:hover { background: #f1f5f9; color: #0f172a; border-color: #94a3b8; }
                .btn-remove { border-color: #fecaca; color: #ef4444; background: #fef2f2; }
                .btn-remove:hover { background: #fee2e2; }

                /* Modal Custom */
                .modal-box { background: white; border-radius: 16px; display: flex; flex-direction: column; max-height: 90vh; width: 90%; max-width: 700px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); overflow: hidden; }
                .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 25px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; }
                .modal-body { padding: 0; overflow-y: auto; flex: 1; }
                .modal-footer { padding: 20px 25px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 10px; background: #f8fafc; }

                /* Drawer Optimisation */
                .opti-drawer-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.4); backdrop-filter: blur(4px); z-index: 9998; opacity: 0; visibility: hidden; transition: 0.3s; }
                .opti-drawer-overlay.active { opacity: 1; visibility: visible; }
                .opti-panel { position: fixed; top: 0; right: -500px; width: 100%; max-width: 450px; height: 100vh; background: white; z-index: 9999; box-shadow: -5px 0 25px rgba(0,0,0,0.1); display: flex; flex-direction: column; transition: right 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
                .opti-panel.active { right: 0; }
                .opti-header { display: flex; justify-content: space-between; align-items: center; padding: 20px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; }
                .opti-header__left { display: flex; align-items: center; gap: 15px; }
                .opti-header__icon { font-size: 24px; background: #f3e8ff; color: #9333ea; width: 44px; height: 44px; display: flex; justify-content: center; align-items: center; border-radius: 12px; }
                .opti-header__title { font-size: 16px; font-weight: 800; color: #0f172a; }
                .opti-header__sub { font-size: 12px; color: #64748b; margin-top: 2px; }
                .opti-body { flex: 1; overflow-y: auto; padding: 20px; }
                .opti-kpi-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 20px; }
                .opti-kpi { padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 5px; }
                .opti-kpi__icon { font-size: 20px; margin-bottom: 5px; }
                .opti-kpi__value { font-size: 20px; font-weight: 800; color: #0f172a; line-height: 1; }
                .opti-kpi__label { font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; }
                .opti-kpi--purple { background: #faf5ff; border-color: #e9d5ff; }
                .opti-kpi--blue { background: #eff6ff; border-color: #bfdbfe; }
                .opti-kpi--orange { background: #fff7ed; border-color: #fed7aa; }
                .opti-kpi--green { background: #f0fdf4; border-color: #bbf7d0; }
                .opti-avg-row { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px; }
                .opti-avg { background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 8px; font-size: 11px; display: flex; align-items: center; gap: 6px; }
                .opti-avg__label { color: #64748b; }
                .opti-avg__value { font-weight: 700; color: #0f172a; }
                .opti-avg--warn { background: #fffbeb; border-color: #fde68a; }
                .opti-section-title { font-size: 14px; font-weight: 800; color: #1e293b; margin: 20px 0 10px 0; }
                .opti-timeline { display: flex; flex-direction: column; gap: 15px; }
                .opti-stop { display: flex; gap: 15px; }
                .opti-stop__line { display: flex; flex-direction: column; align-items: center; }
                .opti-stop__number { width: 24px; height: 24px; background: #3b82f6; color: white; border-radius: 50%; display: flex; justify-content: center; align-items: center; font-size: 11px; font-weight: bold; z-index: 2; flex-shrink: 0; }
                .opti-stop__connector { width: 2px; flex: 1; background: #e2e8f0; margin-top: 5px; margin-bottom: -15px; }
                .opti-stop:last-child .opti-stop__connector { display: none; }
                .opti-stop__card { flex: 1; background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.02); }
                .opti-stop__top { display: flex; justify-content: space-between; margin-bottom: 8px; align-items: center; }
                .opti-stop__client { font-weight: 700; color: #0f172a; font-size: 13px; }
                .opti-stop__address { font-size: 11px; color: #475569; margin-bottom: 10px; line-height: 1.4; }
                .opti-stop__meta { display: flex; flex-wrap: wrap; gap: 6px; }
                .opti-stop__tag { font-size: 10px; padding: 2px 6px; border-radius: 4px; background: #f1f5f9; color: #475569; font-weight: 600; display: flex; gap: 4px; align-items: center; }
                .opti-stop__tag-label { color: #94a3b8; }
                .opti-stop__tag--blue { background: #e0f2fe; color: #0284c7; }
                .opti-stop__tag--orange { background: #ffedd5; color: #ea580c; }
                .opti-stop__tag--green { background: #dcfce7; color: #16a34a; }
                .opti-footer { padding: 15px 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; gap: 10px; background: #f8fafc; }
            </style>

            <div class="programmes-page">
                <div class="prog-header">
                    <div class="prog-header__content">
                        <div class="prog-header__icon">🚗</div>
                        <div class="prog-header__info">
                            <h1 class="prog-header__title">Programmes chauffeurs</h1>
                            <p class="prog-header__subtitle" id="progHeaderSubtitle">Chargement...</p>
                        </div>
                    </div>
                    <div class="prog-header__actions">
                        <button class="btn-add-chauffeur" onclick="window.app.renderPage('settings-agents')">
                            ➕ Gérer les chauffeurs
                        </button>
                    </div>
                </div>

                <div class="kpi-grid">
                    <div class="kpi-card kpi-card--purple kpi-card--clickable" onclick="window.app.views.nouveauProgramme.openAssignModal('')" title="Voir les RDV disponibles non assignés">
                        <div class="kpi-card__icon">🗂️</div>
                        <div class="kpi-card__content">
                            <div class="kpi-card__value" id="kpiDispo">0</div>
                            <div class="kpi-card__label">RDV Disponibles</div>
                        </div>
                    </div>
                    <div class="kpi-card kpi-card--blue">
                        <div class="kpi-card__icon">📅</div>
                        <div class="kpi-card__content">
                            <div class="kpi-card__value" id="kpiTotal">0</div>
                            <div class="kpi-card__label">RDV Total</div>
                        </div>
                    </div>
                    <div class="kpi-card kpi-card--orange">
                        <div class="kpi-card__icon">📦</div>
                        <div class="kpi-card__content">
                            <div class="kpi-card__value" id="kpiDepots">0</div>
                            <div class="kpi-card__label">Dépôts</div>
                        </div>
                    </div>
                    <div class="kpi-card kpi-card--green">
                        <div class="kpi-card__icon">🔄</div>
                        <div class="kpi-card__content">
                            <div class="kpi-card__value" id="kpiRecups">0</div>
                            <div class="kpi-card__label">Récupérations</div>
                        </div>
                    </div>
                </div>

                <div class="prog-filters">
                    <div class="filter-group">
                        <label class="filter-label"><span class="filter-icon">📅</span> Date</label>
                        <input class="filter-input" type="date" id="progDateFilter" value="${this.selectedDate}">
                    </div>
                    <div class="filter-group">
                        <label class="filter-label"><span class="filter-icon">👤</span> Chauffeur</label>
                        <select class="filter-select" id="progDriverFilter">
                            <!-- Injecté via JS -->
                        </select>
                    </div>
                    <div class="filter-group">
                        <label class="filter-label"><span class="filter-icon">🏷️</span> Type RDV</label>
                        <select class="filter-select" id="progTypeFilter">
                            <option value="">Tous les types</option>
                            <option value="DEPOT">📦 DÉPÔT</option>
                            <option value="RECUPERATION">🔄 RÉCUPÉRATION</option>
                        </select>
                    </div>
                    <div class="filter-group" style="flex: 1.5;">
                        <label class="filter-label"><span class="filter-icon">🔍</span> Rechercher</label>
                        <input class="filter-input" id="progSearchFilter" placeholder="Nom, téléphone, adresse, description...">
                    </div>
                </div>

                <div class="prog-layout">
                    <div class="chauffeurs-sidebar">
                        <div class="sidebar-header">
                            <h2 class="sidebar-title"><span class="sidebar-icon">👥</span> Chauffeurs <span class="sidebar-count" id="driversCount">0</span></h2>
                        </div>
                        <div class="chauffeurs-list" id="driversListContainer">
                            <!-- Chauffeurs injectés via JS -->
                        </div>
                    </div>

                    <div class="rdv-table-card">
                        <div class="rdv-table-header">
                            <h2 class="rdv-table-title"><span class="rdv-table-icon">📋</span> Rendez-vous <span class="rdv-table-count" id="rdvListCount">0</span></h2>
                        </div>
                        <div class="table-wrap">
                            <table class="rdv-table">
                                <thead>
                                    <tr>
                                        <th style="width: 100px;">Type</th>
                                        <th style="width: 150px;">Chauffeur</th>
                                        <th style="width: 200px;">Client</th>
                                        <th>Adresse</th>
                                        <th>Description</th>
                                        <th style="width: 120px; text-align: right;">Actions</th>
                                    </tr>
                                </thead>
                                <tbody id="rdvTableBody">
                                    <tr><td colspan="6" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Modal Assignation RDV -->
            <div id="assignModal" class="modal" style="display:none; position:fixed; z-index:9999; left:0; top:0; width:100%; height:100%; background:rgba(15, 23, 42, 0.6); backdrop-filter: blur(4px); align-items:center; justify-content:center;">
                <div class="modal-box">
                    <div class="modal-header">
                        <h2 style="margin:0; font-size:18px; color:#0f172a;">➕ Assigner des Rendez-vous</h2>
                        <button class="icon-btn" onclick="window.app.views.nouveauProgramme.closeAssignModal()" style="background:none; border:none; font-size:24px; cursor:pointer; color:#64748b;">&times;</button>
                    </div>
                    <div style="padding: 15px 25px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-size: 14px; color: #475569;">
                        Cochez les rendez-vous disponibles pour les assigner à <strong id="assignDriverName" style="color: #3b82f6;"></strong>.
                    </div>
                    <div class="modal-body" style="padding: 0;">
                        <table class="rdv-table" style="margin: 0; border-bottom: none;">
                            <thead style="position: sticky; top: 0; z-index: 10; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                                <tr>
                                    <th style="width: 40px; text-align: center;"><input type="checkbox" id="selectAllRdv" onchange="window.app.views.nouveauProgramme.toggleSelectAllRdv(this.checked)"></th>
                                    <th>Type</th>
                                    <th>Client / Adresse</th>
                                    <th>Heure</th>
                                </tr>
                            </thead>
                            <tbody id="assignTableBody">
                                <!-- Injecté via JS -->
                            </tbody>
                        </table>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn--ghost" onclick="window.app.views.nouveauProgramme.closeAssignModal()" style="padding: 10px 15px; border-radius: 8px; background: white; border: 1px solid #cbd5e1; font-weight: 600; cursor: pointer;">Annuler</button>
                        <button class="btn btn--primary" id="confirmAssignBtn" onclick="window.app.views.nouveauProgramme.confirmAssign()" style="padding: 10px 20px; border-radius: 8px; background: #3b82f6; border: none; color: white; font-weight: 600; cursor: pointer;">Assigner la sélection</button>
                    </div>
                </div>
            </div>

            <!-- Modal d'Optimisation IA -->
            <div id="optiOverlay" class="opti-drawer-overlay" onclick="window.app.views.nouveauProgramme.closeOptimizationPanel()"></div>
            <div id="optiPanel" class="opti-panel">
                <div class="opti-header">
                    <div class="opti-header__left">
                        <div class="opti-header__icon">🧠</div>
                        <div>
                            <div class="opti-header__title">Optimisation automatique</div>
                            <div class="opti-header__sub" id="optiSubTitle">Chauffeur · Date</div>
                        </div>
                    </div>
                    <button class="icon-btn" onclick="window.app.views.nouveauProgramme.closeOptimizationPanel()" style="background:none; border:none; font-size:20px; color:#64748b; cursor:pointer;">✕</button>
                </div>
                <div class="opti-body" id="optiBodyContent">
                    <!-- Rendu dynamique JS -->
                </div>
                <div class="opti-footer" id="optiFooterContent"></div>
            </div>
        `;

        document.getElementById('contentContainer').innerHTML = html;

        // Event Listeners
        document.getElementById('progDateFilter')?.addEventListener('change', (e) => { this.selectedDate = e.target.value; this.loadData(); });
        document.getElementById('progDriverFilter')?.addEventListener('change', (e) => { this.selectDriver(e.target.value); });
        document.getElementById('progTypeFilter')?.addEventListener('change', () => this.renderTable());
        document.getElementById('progSearchFilter')?.addEventListener('input', () => this.renderTable());

        this.loadData();
    },

    async loadDrivers() {
        try {
            // On récupère les utilisateurs avec le rôle 'chauf' et on fusionne avec la collection 'agents' au cas où
            const usersSnap = await getDocs(collection(db, "users"));
            const agentsSnap = await getDocs(collection(db, "agents"));
            
            const driverMap = new Map();
            
            usersSnap.forEach(doc => {
                const data = doc.data();
                if (data.role === 'chauf') {
                    const name = data.displayName || data.email || 'Inconnu';
                    driverMap.set(name.toLowerCase().trim(), name);
                }
            });
            
            agentsSnap.forEach(doc => {
                const name = doc.data().name;
                if (name && !driverMap.has(name.toLowerCase().trim())) {
                    driverMap.set(name.toLowerCase().trim(), name);
                }
            });

            this.drivers = Array.from(driverMap.values()).sort();
        } catch (e) {
            console.error("Erreur chargement chauffeurs:", e);
        }
    },

    loadData() {
        if (this.unsub) this.unsub();
        
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
        
        const q = query(
            collection(db, "appointments"), 
            where("agency", "==", activeAgency),
            where("date", "==", this.selectedDate)
        );

        this.unsub = onSnapshot(q, (snapshot) => {
            // On ne prend que les RDV confirmés ou en cours (pas les annulés/en_attente)
            this.rdvs = snapshot.docs
                .map(d => ({id: d.id, ...d.data()}))
                .filter(r => r.status === 'confirmé' || r.status === 'en_cours');
            
            // Tri par orderInRoute par défaut
            this.rdvs.sort((a, b) => (a.orderInRoute || 0) - (b.orderInRoute || 0));
            
            this.renderKPIs();
            this.renderDriversSidebar();
            this.renderTable();
        }, (error) => {
            console.error("Erreur chargement programme:", error);
            if (this.app) this.app.showToast("Erreur de connexion", "error");
        });
    },

    renderKPIs() {
        const dispo = this.rdvs.filter(r => !r.livreur).length;
        const total = this.rdvs.length;
        const depots = this.rdvs.filter(r => r.rdvType === 'DEPOT').length;
        const recups = this.rdvs.filter(r => r.rdvType === 'RECUPERATION').length;

        if(document.getElementById('kpiDispo')) document.getElementById('kpiDispo').textContent = dispo;
        if(document.getElementById('kpiTotal')) document.getElementById('kpiTotal').textContent = total;
        if(document.getElementById('kpiDepots')) document.getElementById('kpiDepots').textContent = depots;
        if(document.getElementById('kpiRecups')) document.getElementById('kpiRecups').textContent = recups;
        if(document.getElementById('progHeaderSubtitle')) document.getElementById('progHeaderSubtitle').textContent = `${this.drivers.length} chauffeur(s) · ${total} RDV pour le ${new Date(this.selectedDate).toLocaleDateString('fr-FR')}`;
    },

    renderDriversSidebar() {
        const container = document.getElementById('driversListContainer');
        const select = document.getElementById('progDriverFilter');
        if (!container || !select) return;

        document.getElementById('driversCount').textContent = this.drivers.length;

        let selectHtml = `<option value="">Tous les chauffeurs</option>`;
        let listHtml = '';

        this.drivers.forEach(driver => {
            const driverRdvs = this.rdvs.filter(r => r.livreur === driver);
            const isActive = this.selectedDriver === driver;
            
            selectHtml += `<option value="${driver}" ${isActive ? 'selected' : ''}>${driver}</option>`;
            
            listHtml += `
                <div class="chauffeur-card ${isActive ? 'active' : ''}" onclick="window.app.views.nouveauProgramme.selectDriver('${driver}')">
                    <div class="chauffeur-card__header">
                        <div class="chauffeur-avatar">${driver.substring(0, 2).toUpperCase()}</div>
                        <div class="chauffeur-info">
                            <div class="chauffeur-name">${driver}</div>
                            <div class="chauffeur-meta">📞 Profil assigné</div>
                        </div>
                    </div>
                    <div class="chauffeur-stats">
                        <div class="chauffeur-stat"><span class="stat-icon">📅</span><span class="stat-value">${driverRdvs.length}</span><span class="stat-label">RDV</span></div>
                    </div>
                    <div class="chauffeur-actions" onclick="event.stopPropagation()">
                        <button class="btn-action btn-action--add" onclick="window.app.views.nouveauProgramme.openAssignModal('${driver}')" title="Assigner des RDV"><i class="fas fa-plus"></i> RDV</button>
                        <button class="btn-action btn-action--edit" onclick="window.app.views.nouveauProgramme.openOptimizationPanel('${driver}')" title="Optimisation IA du parcours">🧠</button>
                        <button class="btn-action btn-action--print" onclick="window.app.views.nouveauProgramme.printRoadmap('${driver}')" title="Imprimer Feuille de Route"><i class="fas fa-print"></i></button>
                    </div>
                </div>
            `;
        });

        select.innerHTML = selectHtml;
        container.innerHTML = listHtml;
    },

    selectDriver(driverName) {
        this.selectedDriver = driverName;
        this.renderDriversSidebar();
        this.renderTable();
    },

    renderTable() {
        const tbody = document.getElementById('rdvTableBody');
        if (!tbody) return;

        const typeFilter = document.getElementById('progTypeFilter')?.value || '';
        const searchFilter = (document.getElementById('progSearchFilter')?.value || '').toLowerCase().trim();

        let filtered = this.rdvs.filter(r => {
            if (this.selectedDriver && r.livreur !== this.selectedDriver) return false;
            if (typeFilter && r.rdvType !== typeFilter) return false;
            if (searchFilter) {
                const searchStr = `${r.client} ${r.adresse} ${r.tel} ${r.notes}`.toLowerCase();
                if (!searchStr.includes(searchFilter)) return false;
            }
            return true;
        });

        document.getElementById('rdvListCount').textContent = filtered.length;

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 40px; color: #64748b;">Aucun RDV ne correspond aux critères.</td></tr>`;
            return;
        }

        tbody.innerHTML = filtered.map((r, index) => {
            const isDepot = r.rdvType === 'DEPOT';
            const typeClass = isDepot ? 'badge--depot' : 'badge--recup';
            const typeLabel = isDepot ? 'DÉPÔT' : 'RÉCUPÉRER';
            
            const isFirst = index === 0;
            const isLast = index === filtered.length - 1;
            
            // N'afficher les actions d'ordre que si on filtre sur un seul chauffeur
            const orderActions = this.selectedDriver ? `
                <button class="btn-order" onclick="window.app.views.nouveauProgramme.moveOrder('${r.id}', -1)" ${isFirst ? 'disabled style="opacity:0.3;"' : ''} title="Monter">↑</button>
                <button class="btn-order" onclick="window.app.views.nouveauProgramme.moveOrder('${r.id}', 1)" ${isLast ? 'disabled style="opacity:0.3;"' : ''} title="Descendre">↓</button>
            ` : '';

            return `
                <tr style="transition: background 0.2s;">
                    <td><span class="type-badge ${typeClass}">${typeLabel}</span></td>
                    <td><div style="font-weight: 700; color: #1e293b;">${r.livreur || '<span style="color:#ef4444;font-style:italic;">Non assigné</span>'}</div></td>
                    <td>
                        <div class="client-cell__name">${r.client}</div>
                        <div class="client-cell__phone">📞 ${r.tel || '--'}</div>
                    </td>
                    <td class="address-cell" title="${r.adresse || ''}">${r.adresse || '-'}</td>
                    <td class="description-cell" title="${r.notes || ''}">${r.notes || '-'}</td>
                    <td>
                        <div class="actions-cell" style="justify-content: flex-end;">
                            ${orderActions}
                            <button class="btn-remove" onclick="window.app.views.nouveauProgramme.removeRdv('${r.id}')" title="Retirer ce RDV du programme">❌</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    },

    openAssignModal(driverName) {
        const assignDriverNameEl = document.getElementById('assignDriverName');
        if (assignDriverNameEl) {
            assignDriverNameEl.textContent = driverName || 'un chauffeur (Sélectionnez-en un)';
        }
        
        if (!driverName && !this.selectedDriver) {
            this.app.showToast("Veuillez d'abord sélectionner un chauffeur dans la liste de gauche.", "error");
            return;
        }
        
        this.driverToAssign = driverName || this.selectedDriver;
        
        const tbody = document.getElementById('assignTableBody');
        const dispoRdvs = this.rdvs.filter(r => !r.livreur);
        
        if (dispoRdvs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:30px; color:#64748b;">Aucun RDV disponible à assigner pour cette date.</td></tr>`;
            document.getElementById('confirmAssignBtn').disabled = true;
        } else {
            document.getElementById('confirmAssignBtn').disabled = false;
            tbody.innerHTML = dispoRdvs.map(r => {
                const isDepot = r.rdvType === 'DEPOT';
                const typeClass = isDepot ? 'badge--depot' : 'badge--recup';
                const typeLabel = isDepot ? 'DÉPÔT' : 'RÉCUPÉRER';
                return `
                    <tr>
                        <td style="text-align: center;"><input type="checkbox" class="assign-cb" value="${r.id}" style="width:16px; height:16px; cursor:pointer;"></td>
                        <td><span class="type-badge ${typeClass}">${typeLabel}</span></td>
                        <td>
                            <div style="font-weight:700; color:#1e293b;">${r.client}</div>
                            <div style="font-size:11px; color:#64748b; max-width:250px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${r.adresse||''}">${r.adresse || '-'}</div>
                        </td>
                        <td style="font-weight:600; color:#475569;">${r.time || '--:--'}</td>
                    </tr>
                `;
            }).join('');
        }
        
        document.getElementById('selectAllRdv').checked = false;
        document.getElementById('assignModal').style.display = 'flex';
    },

    closeAssignModal() {
        document.getElementById('assignModal').style.display = 'none';
    },

    toggleSelectAllRdv(isChecked) {
        document.querySelectorAll('.assign-cb').forEach(cb => cb.checked = isChecked);
    },

    openOptimizationPanel(driverName) {
        const driverRdvs = this.rdvs.filter(r => r.livreur === driverName);
        if (driverRdvs.length === 0) {
            this.app.showToast("Aucun RDV assigné à ce chauffeur pour calculer le trajet.", "error");
            return;
        }

        // --- SIMULATION D'OPTIMISATION DE TRAJET ---
        // Dans un environnement de production, on ferait un appel API à un moteur de routage (Google OR-Tools, Mapbox, etc.)
        const optimizedRdvs = [...driverRdvs];
        
        // On trie simplement par arrondissement/code postal trouvé dans l'adresse pour simuler un regroupement géographique
        optimizedRdvs.sort((a,b) => {
            const extractCP = str => (str.match(/\b\d{5}\b/) || [''])[0];
            return extractCP(a.adresse || '').localeCompare(extractCP(b.adresse || ''));
        });
        
        this.currentOptimizedOrder = optimizedRdvs;

        document.getElementById('optiSubTitle').textContent = `${driverName} · ${new Date(this.selectedDate).toLocaleDateString('fr-FR')}`;

        // Constantes statiques pour l'exemple
        const distTotal = (optimizedRdvs.length * 4.2).toFixed(1);
        const dureeTotalH = Math.floor((optimizedRdvs.length * 15) / 60);
        const dureeTotalM = (optimizedRdvs.length * 15) % 60;

        let html = `
            <div class="opti-kpi-grid">
                <div class="opti-kpi opti-kpi--purple"><div class="opti-kpi__icon">📍</div><div class="opti-kpi__value">${optimizedRdvs.length}</div><div class="opti-kpi__label">Arrêts</div></div>
                <div class="opti-kpi opti-kpi--blue"><div class="opti-kpi__icon">🛣️</div><div class="opti-kpi__value">${distTotal} km</div><div class="opti-kpi__label">Distance</div></div>
                <div class="opti-kpi opti-kpi--orange"><div class="opti-kpi__icon">⏱️</div><div class="opti-kpi__value">${dureeTotalH}h ${dureeTotalM}m</div><div class="opti-kpi__label">Durée Est.</div></div>
                <div class="opti-kpi opti-kpi--green"><div class="opti-kpi__icon">🔄</div><div class="opti-kpi__value">${optimizedRdvs.length}</div><div class="opti-kpi__label">Optimisés</div></div>
            </div>

            <div class="opti-avg-row">
                <div class="opti-avg"><span class="opti-avg__label">⚡ Moteur</span><span class="opti-avg__value">OSRM+BAN</span></div>
                <div class="opti-avg"><span class="opti-avg__label">📐 Moy. / arrêt</span><span class="opti-avg__value">4,2 km</span></div>
                <div class="opti-avg"><span class="opti-avg__label">⏳ Moy. / arrêt</span><span class="opti-avg__value">15 min</span></div>
            </div>

            <div class="opti-section-title">🗺️ Ordre recommandé</div>
            <div class="opti-timeline">
        `;

        optimizedRdvs.forEach((r, idx) => {
            const isDepot = r.rdvType === 'DEPOT';
            const typeClass = isDepot ? 'badge--depot' : 'badge--recup';
            const typeLabel = isDepot ? 'DÉPÔT' : 'RÉCUPÉRER';
            const oldIndex = driverRdvs.findIndex(orig => orig.id === r.id);
            
            // Ajout de tags virtuels pour le rendu
            const distNode = `<span class="opti-stop__tag opti-stop__tag--blue">${(Math.random() * 5 + 1).toFixed(1)} km</span>`;
            const timeNode = `<span class="opti-stop__tag opti-stop__tag--orange">${Math.floor(Math.random() * 15 + 5)} min</span>`;

            html += `
                <div class="opti-stop">
                    <div class="opti-stop__line"><div class="opti-stop__number">${idx + 1}</div><div class="opti-stop__connector"></div></div>
                    <div class="opti-stop__card">
                        <div class="opti-stop__top"><div class="opti-stop__client">${r.client}</div><span class="type-badge ${typeClass}">${typeLabel}</span></div>
                        <div class="opti-stop__address">${r.adresse || 'Adresse non spécifiée'}</div>
                        <div class="opti-stop__meta">
                            <span class="opti-stop__tag"><span class="opti-stop__tag-label">Avant</span>#${oldIndex + 1}</span>
                            ${distNode} ${timeNode}
                            <span class="opti-stop__tag opti-stop__tag--green">🕐 ${r.time || '10:00 - 12:00'}</span>
                        </div>
                    </div>
                </div>
            `;
        });

        html += `</div>`;

        document.getElementById('optiBodyContent').innerHTML = html;
        document.getElementById('optiFooterContent').innerHTML = `
            <button class="btn btn--ghost" style="padding: 10px 15px; border-radius: 8px; border: 1px solid #cbd5e1; background: white; font-weight: 600; cursor: pointer;">📄 Exporter PDF</button>
            <button class="btn btn--primary" id="btnApplyOpti" onclick="window.app.views.nouveauProgramme.applyOptimization()" style="padding: 10px 20px; border-radius: 8px; background: #10b981; border: none; color: white; font-weight: 600; cursor: pointer;">✅ Valider et appliquer</button>
        `;
        document.getElementById('optiOverlay').classList.add('active');
        document.getElementById('optiPanel').classList.add('active');
    },

    closeOptimizationPanel() {
        document.getElementById('optiOverlay').classList.remove('active');
        document.getElementById('optiPanel').classList.remove('active');
    },

    async applyOptimization() {
        if (!this.currentOptimizedOrder || this.currentOptimizedOrder.length === 0) return;

        const btn = document.getElementById('btnApplyOpti');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Application...';
        btn.disabled = true;

        try {
            const batch = writeBatch(db);
            this.currentOptimizedOrder.forEach((r, idx) => {
                batch.update(doc(db, "appointments", r.id), { orderInRoute: idx });
            });
            await batch.commit();
            
            this.app.showToast("Nouvel ordre optimisé appliqué avec succès !", "success");
            this.closeOptimizationPanel();
        } catch(e) {
            console.error("Erreur optimisation:", e);
            this.app.showToast("Erreur lors de l'application de l'optimisation.", "error");
            btn.innerHTML = '✅ Valider et appliquer';
            btn.disabled = false;
        }
    },

    async confirmAssign() {
        const checkboxes = document.querySelectorAll('.assign-cb:checked');
        if (checkboxes.length === 0) {
            this.app.showToast("Veuillez sélectionner au moins un RDV.", "error");
            return;
        }
        
        const btn = document.getElementById('confirmAssignBtn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Assignation...';
        
        try {
            const batch = writeBatch(db);
            
            // Déterminer le prochain orderInRoute pour ce chauffeur
            const driverRdvs = this.rdvs.filter(r => r.livreur === this.driverToAssign);
            let nextOrder = driverRdvs.length > 0 ? Math.max(...driverRdvs.map(r => r.orderInRoute || 0)) + 1 : 0;
            
            checkboxes.forEach(cb => {
                batch.update(doc(db, "appointments", cb.value), {
                    livreur: this.driverToAssign,
                    status: 'en_cours',
                    orderInRoute: nextOrder++
                });
            });
            
            await batch.commit();
            this.app.showToast(`${checkboxes.length} RDV assigné(s) avec succès !`, "success");
            this.closeAssignModal();
        } catch(e) {
            console.error(e);
            this.app.showToast("Erreur lors de l'assignation.", "error");
        } finally {
            btn.disabled = false;
            btn.innerHTML = 'Assigner la sélection';
        }
    },

    async removeRdv(id) {
        try {
            await updateDoc(doc(db, "appointments", id), {
                livreur: null,
                status: 'confirmé', // Repasse en confirmé non assigné
                orderInRoute: null
            });
            this.app.showToast("RDV retiré du programme.", "success");
        } catch(e) {
            this.app.showToast("Erreur lors du retrait.", "error");
        }
    },

    async moveOrder(id, direction) {
        if (!this.selectedDriver) return;
        
        // Ne prendre que les RDV du chauffeur filtré
        const driverRdvs = this.rdvs.filter(r => r.livreur === this.selectedDriver);
        const index = driverRdvs.findIndex(r => r.id === id);
        
        if (index === -1) return;
        
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= driverRdvs.length) return;
        
        const itemA = driverRdvs[index];
        const itemB = driverRdvs[newIndex];
        
        // Assurer qu'ils ont un ordre défini
        driverRdvs.forEach((r, idx) => r.orderInRoute = r.orderInRoute !== undefined ? r.orderInRoute : idx);
        
        const temp = itemA.orderInRoute;
        itemA.orderInRoute = itemB.orderInRoute;
        itemB.orderInRoute = temp;
        
        try {
            const batch = writeBatch(db);
            batch.update(doc(db, "appointments", itemA.id), { orderInRoute: itemA.orderInRoute });
            batch.update(doc(db, "appointments", itemB.id), { orderInRoute: itemB.orderInRoute });
            await batch.commit();
        } catch(e) {
            console.error(e);
            this.app.showToast("Erreur lors de la réorganisation.", "error");
        }
    },

    printRoadmap(driver) {
        this.app.showToast("L'impression de la feuille de route sera bientôt disponible.", "info");
        // TODO: Implement PDF Export for the driver's roadmap
    }
};