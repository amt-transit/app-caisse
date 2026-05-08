import { db } from '../../../firebase-config.js';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const TousLesRdvView = {
    unsub: null,
    appointments: [],
    filterMode: 'all', // 'all' ou 'pending'
    currentEditingId: null,

    render(app, mode = 'all') {
        this.app = app;
        this.filterMode = mode;
        window.app.views = window.app.views || {};
        window.app.views.tousLesRdv = this;

        const title = mode === 'pending' ? 'Rendez-vous à valider' : 'Tous les Rendez-vous';
        const subtitle = mode === 'pending' ? 'Confirmez ou refusez les demandes en attente' : 'Gestion complète de votre planning';
        const icon = mode === 'pending' ? '⏳' : '📅';

        const isPendingMode = mode === 'pending';

        const headerHtml = isPendingMode ? `
            <div class="page__header" style="margin-bottom: 20px;">
                <h1 class="page__title" style="margin: 0; font-size: 24px; font-weight: 800; color: #0f172a;">RDV à valider</h1>
            </div>
            <div class="rdv-header">
                <div class="rdv-header__content" style="flex: 1; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
                    <div class="rdv-header__info">
                        <h1 class="rdv-header__title">✅ RDV à valider</h1>
                        <p class="rdv-header__subtitle" id="pendingSubtitle">0 rendez-vous en attente de validation</p>
                    </div>
                    <div class="rdv-header__actions">
                        <button class="btn-filter-reset" onclick="window.app.views.tousLesRdv.loadData()" style="background: white; border: 1px solid #cbd5e1; display: flex; align-items: center; gap: 8px;">
                            🔄 Rafraîchir
                        </button>
                    </div>
                </div>
            </div>
        ` : `
            <div class="rdv-header">
                <div class="rdv-header__content">
                    <div class="rdv-header__icon">${icon}</div>
                    <div>
                        <h1 class="rdv-header__title">${title}</h1>
                        <p class="rdv-header__subtitle">${subtitle}</p>
                    </div>
                </div>
                <button class="btn btn-primary" onclick="app.renderPage('appointment-new')" style="display: flex; align-items: center; gap: 8px; padding: 10px 16px; font-weight: bold; border-radius: 8px;">
                    <i class="fas fa-plus"></i> Nouveau RDV
                </button>
            </div>
        `;

        const kpiHtml = isPendingMode ? '' : `
            <div class="kpi-grid">
                <div class="kpi-card"><div class="kpi-card__icon" style="color: #475569;">📋</div><div><div class="kpi-card__value" id="kpiTotal">0</div><div class="kpi-card__label">Total RDV</div></div></div>
                <div class="kpi-card"><div class="kpi-card__icon" style="color: #0284c7; background: #e0f2fe;">📦</div><div><div class="kpi-card__value" id="kpiDepot">0</div><div class="kpi-card__label">Dépôts</div></div></div>
                <div class="kpi-card"><div class="kpi-card__icon" style="color: #7e22ce; background: #f3e8ff;">🚚</div><div><div class="kpi-card__value" id="kpiRecup">0</div><div class="kpi-card__label">Récupérations</div></div></div>
                <div class="kpi-card"><div class="kpi-card__icon" style="color: #166534; background: #dcfce7;">✅</div><div><div class="kpi-card__value" id="kpiExecuted">0</div><div class="kpi-card__label">Validés</div></div></div>
                <div class="kpi-card"><div class="kpi-card__icon" style="color: #b45309; background: #fef3c7;">⏳</div><div><div class="kpi-card__value" id="kpiPending">0</div><div class="kpi-card__label">En attente</div></div></div>
                <div class="kpi-card"><div class="kpi-card__icon" style="color: #4f46e5; background: #e0e7ff;">📊</div><div style="flex:1;"><div class="kpi-card__value"><span id="kpiRate">0</span><span style="font-size:14px; color:#64748b;">%</span></div><div class="kpi-card__label">Taux validation</div><div class="kpi-card__bar"><div class="kpi-card__bar-fill" id="kpiRateFill" style="width: 0%;"></div></div></div></div>
            </div>
        `;

        const filtersHtml = isPendingMode ? `
            <div class="rdv-filters">
                <div class="filter-group" style="flex: 2;">
                    <label class="filter-label"><span class="filter-icon">🔍</span> Rechercher</label>
                    <input type="text" id="filterSearch" class="filter-input" placeholder="Nom, téléphone, adresse...">
                </div>
                <div class="filter-group">
                    <label class="filter-label"><span class="filter-icon">📋</span> Type</label>
                    <select id="filterType" class="filter-select">
                        <option value="">Tous les types</option>
                        <option value="DEPOT">Dépôt</option>
                        <option value="RECUPERATION">Récupération</option>
                    </select>
                </div>
                <div class="filter-actions">
                    <button class="btn-filter-reset" type="button" onclick="window.app.views.tousLesRdv.resetFilters()">✕ Réinitialiser</button>
                </div>
            </div>
        ` : `
            <div class="rdv-filters">
                <div class="filter-group" style="flex: 2;">
                    <label class="filter-label"><span class="filter-icon">🔍</span> Recherche client</label>
                    <input type="text" id="filterSearch" class="filter-input" placeholder="Nom, téléphone, adresse...">
                </div>
                <div class="filter-group">
                    <label class="filter-label"><span class="filter-icon">📆</span> Date début</label>
                    <input type="date" id="filterStart" class="filter-input">
                </div>
                <div class="filter-group">
                    <label class="filter-label"><span class="filter-icon">📆</span> Date fin</label>
                    <input type="date" id="filterEnd" class="filter-input">
                </div>
                <div class="filter-group">
                    <label class="filter-label"><span class="filter-icon">🏷️</span> Type</label>
                    <select id="filterType" class="filter-select">
                        <option value="">Tous</option>
                        <option value="DEPOT">Dépôt</option>
                        <option value="RECUPERATION">Récupération</option>
                    </select>
                </div>
                <div class="filter-group">
                    <label class="filter-label"><span class="filter-icon">✅</span> Statut</label>
                    <select id="filterStatus" class="filter-select">
                        <option value="">Tous</option>
                        <option value="confirmé">Validé</option>
                        <option value="en_attente">En attente</option>
                        <option value="annulé">Annulé</option>
                    </select>
                </div>
                <div class="filter-actions">
                    <button class="btn-filter-reset" type="button" onclick="window.app.views.tousLesRdv.resetFilters()">↻ Réinitialiser</button>
                </div>
            </div>
        `;

        const html = `
            <style>
                /* --- STYLES DASHBOARD RDV --- */
                .rdv-page { max-width: 1200px; margin: 0 auto; animation: fadeIn 0.3s ease; }
                .rdv-header { background: white; border-radius: 16px; padding: 20px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #e2e8f0; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); flex-wrap: wrap; gap: 15px; }
                .rdv-header__content { display: flex; align-items: center; gap: 15px; }
                .rdv-header__icon { font-size: 28px; background: #f8fafc; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; border-radius: 12px; }
                .rdv-header__title { margin: 0; font-size: 20px; font-weight: 800; color: #0f172a; }
                .rdv-header__subtitle { margin: 2px 0 0 0; font-size: 13px; color: #64748b; }
                
                /* KPIs */
                .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 15px; margin-bottom: 20px; }
                .kpi-card { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 15px; display: flex; align-items: center; gap: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.02); }
                .kpi-card__icon { font-size: 24px; background: #f1f5f9; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; border-radius: 10px; }
                .kpi-card__value { font-size: 22px; font-weight: 800; color: #0f172a; line-height: 1; margin-bottom: 4px; }
                .kpi-card__label { font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; }
                .kpi-card__bar { height: 4px; background: #e2e8f0; border-radius: 2px; margin-top: 8px; overflow: hidden; }
                .kpi-card__bar-fill { height: 100%; background: #3b82f6; }

                /* Filtres */
                .rdv-filters { display: flex; flex-wrap: wrap; gap: 12px; background: white; padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 20px; }
                .filter-group { flex: 1; min-width: 140px; display: flex; flex-direction: column; gap: 6px; }
                .filter-label { font-size: 11px; font-weight: 600; color: #475569; text-transform: uppercase; }
                .filter-input, .filter-select { width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; outline: none; }
                .filter-input:focus, .filter-select:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.1); }
                .filter-actions { display: flex; align-items: flex-end; gap: 8px; }
                .btn-filter, .btn-filter-reset { padding: 8px 16px; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer; border: none; }
                .btn-filter { background: #3b82f6; color: white; }
                .btn-filter-reset { background: #f1f5f9; color: #475569; }

                /* Tableau */
                .rdv-table-card { background: white; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; }
                .rdv-table-header { padding: 15px 20px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; display: flex; justify-content: space-between; align-items: center; }
                .rdv-table-title { font-size: 14px; font-weight: 600; color: #1e293b; display: flex; align-items: center; gap: 10px; }
                .rdv-count-badge { background: #cbd5e1; color: #0f172a; padding: 2px 8px; border-radius: 12px; font-size: 12px; }
                .rdv-table { width: 100%; border-collapse: collapse; }
                .rdv-table th { text-align: left; padding: 12px 15px; background: white; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; }
                .rdv-table td { padding: 12px 15px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #334155; vertical-align: middle; }
                .rdv-row:hover td { background: #f8fafc; }

                /* Badges */
                .type-badge { padding: 4px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; letter-spacing: 0.5px; display: inline-flex; align-items: center; gap: 4px; }
                .badge-depot { background: #e0f2fe; color: #0284c7; border: 1px solid #bae6fd; }
                .badge-recup { background: #f3e8ff; color: #7e22ce; border: 1px solid #e9d5ff; }
                .badge-pending { background: #fef3c7; color: #b45309; }
                .badge-executed { background: #dcfce7; color: #166534; }
                .badge-cancelled { background: #fee2e2; color: #b91c1c; }

                /* Boutons Actions */
                .td-actions { display: flex; gap: 6px; justify-content: flex-end; }
                .btn-view, .btn-edit, .btn-del { padding: 6px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid transparent; background: white; }
                .btn-view { border-color: #cbd5e1; color: #475569; }
                .btn-edit { border-color: #3b82f6; color: #3b82f6; background: #eff6ff; }
                .btn-del { border-color: #ef4444; color: #ef4444; background: #fef2f2; }
                .btn-view:hover { background: #f1f5f9; }
                .btn-edit:hover { background: #3b82f6; color: white; }
                .btn-del:hover { background: #ef4444; color: white; }

                /* --- STYLES MODALE --- */
                .em-modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(4px); z-index: 2000; align-items: center; justify-content: center; }
                .em-modal.active { display: flex; animation: fadeIn 0.2s ease; }
                .em-content { background: #f8fafc; border-radius: 16px; width: 95%; max-width: 900px; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); }
                .em-header { padding: 20px 25px; background: white; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; }
                .em-header__left { display: flex; align-items: center; gap: 15px; }
                .em-header__icon { font-size: 24px; background: #f1f5f9; width: 44px; height: 44px; display: flex; justify-content: center; align-items: center; border-radius: 10px; }
                .em-header__title { font-size: 18px; font-weight: 800; color: #0f172a; margin-bottom: 4px; }
                .em-header__sub { display: flex; gap: 10px; }
                .em-close { background: none; border: none; cursor: pointer; color: #64748b; padding: 5px; border-radius: 5px; }
                .em-close:hover { background: #f1f5f9; color: #0f172a; }
                
                .em-body { padding: 25px; overflow-y: auto; flex: 1; }
                .em-client-strip { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 15px; display: flex; gap: 15px; align-items: center; margin-bottom: 20px; }
                .em-client-strip__icon { font-size: 24px; background: #eff6ff; width: 48px; height: 48px; display: flex; justify-content: center; align-items: center; border-radius: 50%; color: #3b82f6; }
                .em-client-strip__name { font-size: 16px; font-weight: 700; color: #1e293b; margin-bottom: 4px; }
                .em-client-strip__details { display: flex; gap: 15px; font-size: 13px; color: #64748b; }
                
                .em-grid { display: grid; grid-template-columns: 1fr 350px; gap: 20px; }
                @media (max-width: 768px) { .em-grid { grid-template-columns: 1fr; } }
                .em-col-form { display: flex; flex-direction: column; gap: 20px; }
                .em-card { background: white; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
                .em-card__head { padding: 12px 15px; font-size: 14px; font-weight: 700; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; gap: 8px; }
                .em-card__head--purple { background: #faf5ff; color: #9333ea; }
                .em-card__head--blue { background: #eff6ff; color: #2563eb; }
                .em-card__head--green { background: #f0fdf4; color: #16a34a; }
                .em-card__head--amber { background: #fffbeb; color: #d97706; }
                .em-card__body { padding: 15px; }
                
                .em-type-selector { display: flex; gap: 10px; }
                .em-type-option { flex: 1; padding: 12px; border: 2px solid #e2e8f0; border-radius: 8px; background: white; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; font-weight: 700; color: #64748b; transition: 0.2s; }
                .em-type-option.active { border-color: #3b82f6; background: #eff6ff; color: #1d4ed8; }
                
                .em-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 15px; }
                .em-field:last-child { margin-bottom: 0; }
                .em-field__label { font-size: 12px; font-weight: 600; color: #475569; }
                .em-field__input { width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; outline: none; box-sizing: border-box; }
                .em-field__input:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.1); }
                .em-field-row { display: flex; gap: 15px; }
                .em-field-row > * { flex: 1; }

                .em-footer { padding: 20px 25px; background: white; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 10px; border-radius: 0 0 16px 16px; }
                .em-btn { padding: 10px 20px; border-radius: 8px; font-weight: 600; font-size: 14px; cursor: pointer; border: none; }
                .em-btn--ghost { background: transparent; color: #64748b; border: 1px solid #cbd5e1; }
                .em-btn--save { background: #3b82f6; color: white; display: flex; align-items: center; gap: 8px; }
                .em-btn--save:hover { background: #2563eb; }
            </style>

            <div class="rdv-page">
                ${headerHtml}
                ${kpiHtml}
                ${filtersHtml}

                <div class="rdv-table-card">
                    <div class="rdv-table-header">
                        <div class="rdv-table-title"><span class="rdv-count-badge" id="rdvListCount">0</span><span>Rendez-vous trouvés</span></div>
                    </div>
                    <table class="rdv-table">
                        <thead>
                            <tr>
                                <th>Type</th>
                                <th>Date & Heure</th>
                                <th>Client</th>
                                <th>Téléphone</th>
                                <th>Adresse / Notes</th>
                                <th>Statut</th>
                                <th style="text-align: right;">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="rdvTableBody">
                            <tr><td colspan="7" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- MODALE D'ÉDITION AVANCÉE -->
            <div id="rdvEditModal" class="em-modal">
                <div class="em-content">
                    <div class="em-header">
                        <div class="em-header__left">
                            <div class="em-header__icon">📅</div>
                            <div>
                                <div class="em-header__title">Modifier le RDV <span id="emRefId" style="color:#64748b;"></span></div>
                                <div class="em-header__sub">
                                    <span class="type-badge badge-pending" id="emStatusBadge">Statut</span>
                                </div>
                            </div>
                        </div>
                        <button class="em-close" type="button" onclick="window.app.views.tousLesRdv.closeEditModal()" title="Fermer"><i class="fas fa-times" style="font-size: 20px;"></i></button>
                    </div>
                    <div class="em-body">
                        <div class="em-client-strip">
                            <div class="em-client-strip__icon">👤</div>
                            <div>
                                <div class="em-client-strip__name" id="emClientName">Nom du client</div>
                                <div class="em-client-strip__details">
                                    <span id="emClientTel">📞 --</span>
                                </div>
                            </div>
                        </div>
                        <div class="em-grid">
                            <div class="em-col-form">
                                <div class="em-card">
                                    <div class="em-card__head em-card__head--purple"><span class="em-card__icon">🏷️</span><span class="em-card__title">Type de rendez-vous</span></div>
                                    <div class="em-card__body">
                                        <div class="em-type-selector">
                                            <button type="button" id="emBtnDepot" class="em-type-option" onclick="window.app.views.tousLesRdv.setEditType('DEPOT')"><span>📦</span><span>DEPOT</span></button>
                                            <button type="button" id="emBtnRecup" class="em-type-option" onclick="window.app.views.tousLesRdv.setEditType('RECUPERATION')"><span>🚚</span><span>RECUP</span></button>
                                            <input type="hidden" id="emTypeVal">
                                        </div>
                                    </div>
                                </div>
                                <div class="em-card">
                                    <div class="em-card__head em-card__head--blue"><span class="em-card__icon">🕐</span><span class="em-card__title">Planification</span></div>
                                    <div class="em-card__body">
                                        <label class="em-field">
                                            <span class="em-field__label">Date du rendez-vous</span>
                                            <input type="date" id="emDate" class="em-field__input">
                                        </label>
                                        <label class="em-field">
                                            <span class="em-field__label">Créneau horaire / Heure</span>
                                            <input type="text" id="emTime" class="em-field__input" placeholder="Ex: Matin, 10:00...">
                                        </label>
                                    </div>
                                </div>
                            </div>
                            <div class="em-col-cal">
                                <div class="em-card" style="height: 100%;">
                                    <div class="em-card__head em-card__head--green"><span class="em-card__icon">📋</span><span class="em-card__title">Détails d'intervention</span></div>
                                    <div class="em-card__body">
                                        <label class="em-field">
                                            <span class="em-field__label">Adresse exacte</span>
                                            <input type="text" id="emAddress" class="em-field__input" placeholder="Adresse complète">
                                        </label>
                                        <label class="em-field">
                                            <span class="em-field__label">Téléphone de contact</span>
                                            <input type="text" id="emTelInput" class="em-field__input" placeholder="Numéro à appeler">
                                        </label>
                                        <label class="em-field">
                                            <span class="em-field__label">Description / Instructions</span>
                                            <textarea id="emNotes" class="em-field__input" rows="4" style="resize:vertical;" placeholder="Instructions pour le chauffeur..."></textarea>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="em-footer">
                        <button class="em-btn em-btn--ghost" type="button" onclick="window.app.views.tousLesRdv.closeEditModal()">Annuler</button>
                        <button class="em-btn em-btn--save" type="button" onclick="window.app.views.tousLesRdv.saveEditModal()">💾 Enregistrer les modifications</button>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('contentContainer').innerHTML = html;
        
        // Écouteurs de filtres
        document.getElementById('filterSearch')?.addEventListener('input', () => this.renderTable());
        document.getElementById('filterStart')?.addEventListener('change', () => this.renderTable());
        document.getElementById('filterEnd')?.addEventListener('change', () => this.renderTable());
        document.getElementById('filterType')?.addEventListener('change', () => this.renderTable());
        document.getElementById('filterStatus')?.addEventListener('change', () => this.renderTable());

        this.loadData();
    },

    loadData() {
        if (this.unsub) this.unsub();
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
        
        const q = query(collection(db, "appointments"), where("agency", "==", activeAgency));
        
        this.unsub = onSnapshot(q, (snapshot) => {
            this.appointments = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
            this.appointments.sort((a, b) => new Date(a.date) - new Date(b.date)); // Tri chronologique
            this.renderTable();
            this.app.updateBadges(); // Mise à jour des badges dans la barre latérale
        });
    },

    renderTable() {
        this.updateKPIs();
        const tbody = document.getElementById('rdvTableBody');
        const countBadge = document.getElementById('rdvListCount');
        if (!tbody) return;

        const term = (document.getElementById('filterSearch')?.value || '').toLowerCase().trim();
        const start = document.getElementById('filterStart')?.value;
        const end = document.getElementById('filterEnd')?.value;
        const type = document.getElementById('filterType')?.value;
        let status = document.getElementById('filterStatus')?.value || '';
        if (this.filterMode === 'pending') status = 'en_attente';

        const filtered = this.appointments.filter(rdv => {
            if (term && !rdv.client.toLowerCase().includes(term) && !(rdv.tel || '').includes(term)) return false;
            if (status && rdv.status !== status) return false;
            if (type && rdv.rdvType !== type) return false;
            if (start && rdv.date < start) return false;
            if (end && rdv.date > end) return false;
            return true;
        });

        if (countBadge) countBadge.textContent = filtered.length;

        if (filtered.length === 0) {
            if (this.filterMode === 'pending') {
                tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 60px;">
                    <div style="font-size: 48px; margin-bottom: 10px;">📭</div>
                    <h3 style="margin: 0 0 5px 0; color: #1e293b; font-size: 18px;">Aucun RDV à valider</h3>
                    <p style="margin: 0; color: #64748b; font-size: 14px;">Tous les RDV ont été validés</p>
                </td></tr>`;
                const pendingSubtitle = document.getElementById('pendingSubtitle');
                if (pendingSubtitle) pendingSubtitle.textContent = `0 rendez-vous en attente de validation`;
            } else {
                tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px; color: #64748b;">Aucun rendez-vous trouvé.</td></tr>`;
            }
            return;
        }

        if (this.filterMode === 'pending') {
            const pendingSubtitle = document.getElementById('pendingSubtitle');
            if (pendingSubtitle) pendingSubtitle.textContent = `${filtered.length} rendez-vous en attente de validation`;
        }

        tbody.innerHTML = filtered.map(rdv => {
            const isPending = rdv.status === 'en_attente';
            const isConfirmed = rdv.status === 'confirmé';
            
            // Statut
            const statusClass = isConfirmed ? 'badge-executed' : (isPending ? 'badge-pending' : 'badge-cancelled');
            const statusText = isConfirmed ? '✅ Validé' : (isPending ? '⏳ En attente' : '❌ Annulé');
            
            // Type
            const isDepot = rdv.rdvType === 'DEPOT';
            const typeClass = isDepot ? 'badge-depot' : 'badge-recup';
            const typeText = isDepot ? '📦 DEPOT' : '🚚 RECUP';
            
            let actions = '';
            if (isPending) {
                actions = `
                    <button class="btn-edit" onclick="window.app.views.tousLesRdv.changeStatus('${rdv.id}', 'confirmé')" title="Valider" style="background:#dcfce7; color:#166534; border-color:#166534;"><i class="fas fa-check"></i></button>
                    <button class="btn-del" onclick="window.app.views.tousLesRdv.changeStatus('${rdv.id}', 'annulé')" title="Refuser"><i class="fas fa-times"></i></button>
                    <button class="btn-edit" onclick="window.app.views.tousLesRdv.openEditModal('${rdv.id}')" title="Modifier">✏️</button>
                `;
            } else {
                actions = `
                    <button class="btn-edit" onclick="window.app.views.tousLesRdv.openEditModal('${rdv.id}')" title="Modifier">✏️</button>
                    <button class="btn-del" onclick="window.app.views.tousLesRdv.deleteRdv('${rdv.id}')" title="Supprimer">🗑️</button>
                `;
            }

            return `
                <tr class="rdv-row">
                    <td><span class="type-badge ${typeClass}">${typeText}</span></td>
                    <td><strong>${rdv.date ? new Date(rdv.date).toLocaleDateString('fr-FR') : '-'}</strong><br><span style="color:#64748b; font-size:11px;">${rdv.time || 'Heure à définir'}</span></td>
                    <td style="font-weight: 600; color: #0f172a;">${rdv.client}</td>
                    <td style="font-weight: bold;">${rdv.tel || '-'}</td>
                    <td><div style="max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${rdv.adresse || ''}\n${rdv.notes || ''}">${rdv.adresse || '-'}<br><span style="color:#94a3b8; font-size:10px;">${rdv.notes || ''}</span></div></td>
                    <td><span class="type-badge ${statusClass}">${statusText}</span></td>
                    <td class="td-actions">${actions}</td>
                </tr>
            `;
        }).join('');
    },

    updateKPIs() {
        const total = this.appointments.length;
        const depots = this.appointments.filter(a => a.rdvType === 'DEPOT').length;
        const recups = this.appointments.filter(a => a.rdvType === 'RECUPERATION').length;
        const executed = this.appointments.filter(a => a.status === 'confirmé').length;
        const pending = this.appointments.filter(a => a.status === 'en_attente').length;
        const rate = total > 0 ? Math.round((executed / total) * 100) : 0;

        if(document.getElementById('kpiTotal')) document.getElementById('kpiTotal').textContent = total;
        if(document.getElementById('kpiDepot')) document.getElementById('kpiDepot').textContent = depots;
        if(document.getElementById('kpiRecup')) document.getElementById('kpiRecup').textContent = recups;
        if(document.getElementById('kpiExecuted')) document.getElementById('kpiExecuted').textContent = executed;
        if(document.getElementById('kpiPending')) document.getElementById('kpiPending').textContent = pending;
        if(document.getElementById('kpiRate')) document.getElementById('kpiRate').textContent = rate;
        if(document.getElementById('kpiRateFill')) document.getElementById('kpiRateFill').style.width = `${rate}%`;
    },

    resetFilters() {
        document.getElementById('filterSearch').value = '';
        document.getElementById('filterStart').value = '';
        document.getElementById('filterEnd').value = '';
        document.getElementById('filterType').value = '';
        if (this.filterMode !== 'pending') document.getElementById('filterStatus').value = '';
        this.renderTable();
    },

    // --- LOGIQUE MODALE ---
    openEditModal(id) {
        const rdv = this.appointments.find(a => a.id === id);
        if (!rdv) return;
        this.currentEditingId = id;

        document.getElementById('emRefId').textContent = `#${id.substring(0,6).toUpperCase()}`;
        
        const isConfirmed = rdv.status === 'confirmé';
        const isPending = rdv.status === 'en_attente';
        const statusBadge = document.getElementById('emStatusBadge');
        statusBadge.className = `type-badge ${isConfirmed ? 'badge-executed' : (isPending ? 'badge-pending' : 'badge-cancelled')}`;
        statusBadge.textContent = isConfirmed ? '🟢 Validé' : (isPending ? '⏳ En attente' : '🔴 Annulé');

        document.getElementById('emClientName').textContent = rdv.client;
        document.getElementById('emClientTel').textContent = `📞 ${rdv.tel || 'Non renseigné'}`;
        
        this.setEditType(rdv.rdvType || 'RECUPERATION');
        document.getElementById('emDate').value = rdv.date || '';
        document.getElementById('emTime').value = rdv.time || '';
        document.getElementById('emAddress').value = rdv.adresse || '';
        document.getElementById('emTelInput').value = rdv.tel || '';
        document.getElementById('emNotes').value = rdv.notes || '';

        document.getElementById('rdvEditModal').classList.add('active');
    },

    closeEditModal() {
        document.getElementById('rdvEditModal').classList.remove('active');
        this.currentEditingId = null;
    },

    setEditType(type) {
        document.getElementById('emTypeVal').value = type;
        document.getElementById('emBtnDepot').classList.remove('active');
        document.getElementById('emBtnRecup').classList.remove('active');
        if (type === 'DEPOT') document.getElementById('emBtnDepot').classList.add('active');
        else document.getElementById('emBtnRecup').classList.add('active');
    },

    async saveEditModal() {
        if (!this.currentEditingId) return;
        const btn = document.querySelector('.em-btn--save');
        btn.innerHTML = '💾 Enregistrement...';
        btn.disabled = true;

        const updates = {
            rdvType: document.getElementById('emTypeVal').value,
            date: document.getElementById('emDate').value,
            time: document.getElementById('emTime').value.trim(),
            adresse: document.getElementById('emAddress').value.trim(),
            tel: document.getElementById('emTelInput').value.trim(),
            notes: document.getElementById('emNotes').value.trim()
        };

        try {
            await updateDoc(doc(db, "appointments", this.currentEditingId), updates);
            this.app.showToast("Rendez-vous mis à jour avec succès !", "success");
            this.closeEditModal();
        } catch(e) {
            this.app.showToast("Erreur lors de la sauvegarde.", "error");
        } finally {
            btn.innerHTML = '💾 Enregistrer les modifications';
            btn.disabled = false;
        }
    },

    async changeStatus(id, newStatus) {
        try {
            await updateDoc(doc(db, "appointments", id), { status: newStatus });
            this.app.showToast(`Rendez-vous ${newStatus} !`, newStatus === 'confirmé' ? 'success' : 'info');
        } catch(e) { this.app.showToast("Erreur de mise à jour", "error"); }
    },

    async deleteRdv(id) {
        if (window.AppModal) {
            if (!await window.AppModal.confirm("Voulez-vous vraiment supprimer ce rendez-vous de l'historique ?", "Supprimer RDV", true)) return;
        } else if (!confirm("Supprimer ce rendez-vous ?")) return;

        try {
            await deleteDoc(doc(db, "appointments", id));
            this.app.showToast("Rendez-vous supprimé", "success");
        } catch(e) { this.app.showToast("Erreur de suppression", "error"); }
    }
};