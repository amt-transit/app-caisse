import { db } from '../../../commun/firebase-config.js';
import { collection, query, where, onSnapshot, doc, setDoc, addDoc, updateDoc, arrayUnion, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getCollectionName } from '../../../commun/agencies-config.js';

export const ProspectingView = {
    unsub: null,
    prospects: [],
    filteredProspects: [],
    currentDetailId: null,

    render(app, container) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.prospecting = this;

        const html = `
            <style>
                .prospections-page { max-width: 1400px; margin: 0 auto; animation: fadeIn 0.3s ease; }
                
                /* Stats Row */
                .stats-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px; margin-bottom: 24px; }
                .stat-card { background: white; border-radius: 12px; padding: 20px; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.02); display: flex; flex-direction: column; justify-content: center; }
                .stat-card__value { font-size: 28px; font-weight: 900; line-height: 1; margin-bottom: 5px; }
                .stat-card__label { font-size: 12px; font-weight: 600; text-transform: uppercase; color: #64748b; }
                .stat-card--blue .stat-card__value { color: #3b82f6; }
                .stat-card--red .stat-card__value { color: #ef4444; }
                .stat-card--orange .stat-card__value { color: #f59e0b; }
                .stat-card--green .stat-card__value { color: #10b981; }
                .stat-card--purple .stat-card__value { color: #8b5cf6; }

                /* Toolbar */
                .toolbar { display: flex; justify-content: space-between; align-items: center; background: white; padding: 15px 20px; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 20px; flex-wrap: wrap; gap: 15px; }
                .toolbar__left { display: flex; gap: 10px; flex-wrap: wrap; flex: 1; }
                .toolbar__right { display: flex; gap: 10px; flex-wrap: wrap; }
                .toolbar__search { padding: 10px 15px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; min-width: 250px; outline: none; transition: 0.2s; }
                .toolbar__search:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
                .toolbar__select { padding: 10px 30px 10px 15px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; background: #f8fafc; outline: none; cursor: pointer; }
                
                /* Table */
                .table-wrap { background: white; border-radius: 12px; border: 1px solid #e2e8f0; overflow-x: auto; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
                .data-table { width: 100%; border-collapse: collapse; }
                .data-table th { text-align: left; padding: 15px 20px; background: #f8fafc; font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; white-space: nowrap; }
                .data-table td { padding: 15px 20px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #334155; vertical-align: middle; }
                .data-row { transition: background 0.2s; cursor: pointer; }
                .data-row:hover { background: #f8fafc; }
                .data-row--overdue { background: #fef2f2; }
                .data-row--overdue:hover { background: #fee2e2; }
                
                .client-cell strong { color: #0f172a; font-size: 14px; }
                .source-cell { font-weight: 600; color: #64748b; font-size: 12px; }
                .agent-cell { font-size: 12px; color: #475569; }
                .center { text-align: center; font-weight: bold; }
                .text-red { color: #ef4444; font-weight: bold; }
                .text-green { color: #10b981; font-weight: bold; }
                .text-orange { color: #f59e0b; font-weight: bold; }

                /* Badges */
                .badge { padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; display: inline-block; white-space: nowrap; }
                .badge--outline { background: transparent; border: 1px solid; }
                .badge--sm { padding: 2px 6px; font-size: 10px; }
                
                /* Status Colors */
                .status-NOUVEAU { background: #e0f2fe; color: #0284c7; }
                .status-EN_COURS { background: #fef3c7; color: #b45309; }
                .status-RELANCE { background: #fee2e2; color: #b91c1c; }
                .status-INTERESSE { background: #f3e8ff; color: #7e22ce; }
                .status-CONVERTI { background: #dcfce7; color: #166534; }
                .status-PERDU { background: #f1f5f9; color: #475569; }
                
                /* Priority Colors */
                .prio-BASSE { border-color: #94a3b8; color: #64748b; }
                .prio-NORMALE { border-color: #3b82f6; color: #3b82f6; }
                .prio-HAUTE { border-color: #ef4444; color: #ef4444; background: #fef2f2; }

                /* Modals & Forms */
                .modal { display: none; position: fixed; inset: 0; background: rgba(15,23,42,0.6); z-index: 1000; align-items: center; justify-content: center; backdrop-filter: blur(4px); }
                .modal.active { display: flex; animation: fadeIn 0.2s; }
                .modal__content { background: white; width: 90%; border-radius: 16px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); }
                .modal__content--md { max-width: 500px; }
                .modal__content--lg { max-width: 900px; height: 90vh; }
                
                .modal__header { padding: 20px 25px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; background: #f8fafc; }
                .modal__header h3 { margin: 0; font-size: 18px; font-weight: 800; color: #0f172a; display: flex; align-items: center; }
                .modal__close { background: none; border: none; font-size: 24px; cursor: pointer; color: #64748b; }
                .modal__body { padding: 25px; overflow-y: auto; flex: 1; }
                .modal__footer { padding: 15px 25px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 10px; background: #f8fafc; }

                .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
                @media (max-width: 640px) { .form-grid { grid-template-columns: 1fr; } }
                .form-group { display: flex; flex-direction: column; gap: 6px; }
                .form-group--full { grid-column: 1 / -1; }
                .form-group label { font-size: 12px; font-weight: 700; color: #475569; }
                .form-input { padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; outline: none; transition: 0.2s; font-family: inherit; }
                .form-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }

                /* Layout Detail Modal (Sidebar effect) */
                .detail-layout { display: flex; gap: 25px; align-items: flex-start; }
                @media (max-width: 768px) { .detail-layout { flex-direction: column; } }
                .detail-sidebar { width: 300px; flex-shrink: 0; background: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; }
                @media (max-width: 768px) { .detail-sidebar { width: 100%; box-sizing: border-box; } }
                .detail-main { flex: 1; min-width: 0; }

                /* Detail Grid */
                .detail-grid { display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px; }
                .detail-item { display: flex; flex-direction: column; gap: 4px; padding-bottom: 12px; border-bottom: 1px solid #e2e8f0; }
                .detail-item:last-child { border-bottom: none; padding-bottom: 0; }
                .detail-label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; }
                .detail-value { font-size: 14px; font-weight: 600; color: #0f172a; word-break: break-word; }
                
                .detail-note { background: #fffbeb; border-left: 3px solid #f59e0b; padding: 12px; border-radius: 0 8px 8px 0; font-size: 13px; color: #92400e; margin-bottom: 20px; }
                .detail-actions { display: flex; flex-direction: column; gap: 10px; margin-top: 20px; }

                /* Timeline */
                .section-title { font-size: 16px; font-weight: 800; margin: 0 0 20px 0; color: #0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom: 10px; }
                .timeline { display: flex; flex-direction: column; gap: 20px; position: relative; padding-left: 10px; }
                .timeline::before { content: ''; position: absolute; left: 14px; top: 8px; bottom: -20px; width: 2px; background: #e2e8f0; }
                .timeline__item { position: relative; padding-left: 30px; }
                .timeline__dot { position: absolute; left: 0; top: 4px; width: 10px; height: 10px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 0 1px #cbd5e1; z-index: 2; }
                .timeline__content { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 15px; box-shadow: 0 1px 2px rgba(0,0,0,0.02); }
                .timeline__header { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 8px; }
                .timeline__date { font-size: 12px; font-weight: 700; color: #0f172a; }
                .timeline__type { font-size: 12px; font-weight: 600; color: #475569; background: #f1f5f9; padding: 2px 8px; border-radius: 6px; }
                .timeline__resultat { font-size: 12px; font-weight: 600; color: #0f172a; }
                .timeline__duree { font-size: 11px; color: #64748b; margin-left: auto; }
                .timeline__comment { font-size: 13px; color: #334155; line-height: 1.5; margin-bottom: 8px; white-space: pre-wrap; }
                .timeline__footer { display: flex; justify-content: space-between; font-size: 11px; color: #64748b; border-top: 1px solid #f1f5f9; padding-top: 8px; }
                .timeline__agent { font-style: italic; }
            </style>

            <div class="page__header" style="margin-bottom: 20px;">
                <h1 class="page__title" style="margin: 0; font-size: 24px; font-weight: 800; color: #0f172a;">Prospections</h1>
            </div>
            
            <div class="prospections-page">
                <div class="stats-row">
                    <div class="stat-card stat-card--blue"><div class="stat-card__value" id="kpiTotal">0</div><div class="stat-card__label">Dossiers total</div></div>
                    <div class="stat-card stat-card--red"><div class="stat-card__value" id="kpiOverdue">0</div><div class="stat-card__label">Relances en retard</div></div>
                    <div class="stat-card stat-card--orange"><div class="stat-card__value" id="kpiToday">0</div><div class="stat-card__label">Relances du jour</div></div>
                    <div class="stat-card stat-card--green"><div class="stat-card__value" id="kpiCalls">0</div><div class="stat-card__label">Appels ce mois</div></div>
                    <div class="stat-card stat-card--purple"><div class="stat-card__value" id="kpiConverted">0</div><div class="stat-card__label">Convertis</div></div>
                </div>

                <div class="toolbar">
                    <div class="toolbar__left">
                        <input type="text" id="psSearch" class="toolbar__search" placeholder="Rechercher nom, prénom, tél…" oninput="window.app.views.prospecting.applyFilters()">
                        <select id="psStatus" class="toolbar__select" onchange="window.app.views.prospecting.applyFilters()">
                            <option value="">Tous statuts</option>
                            <option value="NOUVEAU">Nouveau</option>
                            <option value="EN_COURS">En cours</option>
                            <option value="RELANCE">Relance</option>
                            <option value="INTERESSE">Intéressé</option>
                            <option value="CONVERTI">Converti</option>
                            <option value="PERDU">Perdu</option>
                        </select>
                        <select id="psPriority" class="toolbar__select" onchange="window.app.views.prospecting.applyFilters()">
                            <option value="">Toutes priorités</option>
                            <option value="BASSE">BASSE</option>
                            <option value="NORMALE">NORMALE</option>
                            <option value="HAUTE">HAUTE</option>
                        </select>
                        <select id="psRelance" class="toolbar__select" onchange="window.app.views.prospecting.applyFilters()">
                            <option value="">Toutes relances</option>
                            <option value="today">Aujourd'hui</option>
                            <option value="overdue">En retard</option>
                            <option value="upcoming">7 prochains jours</option>
                        </select>
                    </div>
                    <div class="toolbar__right">
                        <button class="amt-btn amt-btn-outline" onclick="window.app.views.prospecting.importDormantClients()"> 👤 Clients dormants </button>
                        <button class="amt-btn amt-btn-primary" onclick="window.app.views.prospecting.openNewModal()"> + Nouveau dossier </button>
                    </div>
                </div>

                <div class="table-wrap">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Client</th>
                                <th>Téléphone</th>
                                <th>Statut</th>
                                <th>Priorité</th>
                                <th>Source</th>
                                <th class="center">Appels</th>
                                <th>Prochaine relance</th>
                                <th>Agent</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="psTableBody">
                            <tr><td colspan="9" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- MODAL NOUVEAU/EDITION DOSSIER -->
            <div id="newProspectModal" class="modal">
                <div class="modal__content modal__content--md">
                    <div class="modal__header">
                        <h3 id="npmTitle">Nouveau dossier de prospection</h3>
                        <button class="modal__close" onclick="window.app.views.prospecting.closeNewModal()">✕</button>
                    </div>
                    <div class="modal__body">
                        <input type="hidden" id="npmId">
                        <div class="form-grid">
                            <div class="form-group">
                                <label>Source</label>
                                <select id="npmSource" class="form-input">
                                    <option value="MANUEL">Manuel</option>
                                    <option value="DORMANT">Client dormant</option>
                                    <option value="CLIENT">Client existant</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Priorité</label>
                                <select id="npmPriority" class="form-input">
                                    <option value="BASSE">BASSE</option>
                                    <option value="NORMALE" selected>NORMALE</option>
                                    <option value="HAUTE">HAUTE</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Nom *</label>
                                <input type="text" id="npmNom" class="form-input" required>
                            </div>
                            <div class="form-group">
                                <label>Prénom</label>
                                <input type="text" id="npmPrenom" class="form-input">
                            </div>
                            <div class="form-group">
                                <label>Téléphone *</label>
                                <input type="text" id="npmTel" class="form-input" required>
                            </div>
                            <div class="form-group">
                                <label>Email</label>
                                <input type="email" id="npmEmail" class="form-input">
                            </div>
                            <div class="form-group form-group--full">
                                <label>Adresse</label>
                                <input type="text" id="npmAdresse" class="form-input">
                            </div>
                            <div class="form-group form-group--full" id="npmStatusGroup" style="display:none;">
                                <label>Statut</label>
                                <select id="npmStatus" class="form-input">
                                    <option value="NOUVEAU">Nouveau</option>
                                    <option value="EN_COURS">En cours</option>
                                    <option value="RELANCE">Relance</option>
                                    <option value="INTERESSE">Intéressé</option>
                                    <option value="CONVERTI">Converti</option>
                                    <option value="PERDU">Perdu</option>
                                </select>
                            </div>
                            <div class="form-group form-group--full">
                                <label>Prochaine relance</label>
                                <input type="date" id="npmRelance" class="form-input">
                            </div>
                            <div class="form-group form-group--full">
                                <label>Note initiale</label>
                                <textarea id="npmNote" class="form-input" rows="3" style="resize:vertical;"></textarea>
                            </div>
                        </div>
                    </div>
                    <div class="modal__footer">
                        <button class="amt-btn amt-btn-outline" onclick="window.app.views.prospecting.closeNewModal()">Annuler</button>
                        <button class="amt-btn amt-btn-primary" id="npmSaveBtn" onclick="window.app.views.prospecting.saveProspect()">Créer le dossier</button>
                    </div>
                </div>
            </div>

            <!-- MODAL DETAIL & TIMELINE -->
            <div id="detailProspectModal" class="modal">
                <div class="modal__content modal__content--lg" id="dpmContent">
                    <!-- Injecté via JS -->
                </div>
            </div>

            <!-- MODAL NOUVEAU CONTACT (APPEL/RELANCE) -->
            <div id="contactProspectModal" class="modal" style="z-index: 1050;">
                <div class="modal__content modal__content--md">
                    <div class="modal__header">
                        <h3>Enregistrer un contact</h3>
                        <button class="modal__close" onclick="document.getElementById('contactProspectModal').classList.remove('active')">✕</button>
                    </div>
                    <div class="modal__body">
                        <div class="form-grid">
                            <div class="form-group">
                                <label>Type de contact</label>
                                <select id="cpmType" class="form-input">
                                    <option value="Appel">Appel téléphonique</option>
                                    <option value="Email">Email</option>
                                    <option value="WhatsApp">WhatsApp / SMS</option>
                                    <option value="Rendez-vous">Rendez-vous physique</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Résultat</label>
                                <select id="cpmResultat" class="form-input">
                                    <option value="Joint - Échange positif">Joint - Échange positif</option>
                                    <option value="Joint - À rappeler">Joint - À rappeler</option>
                                    <option value="Pas répondu">Pas répondu</option>
                                    <option value="Faux numéro / Rejet">Faux numéro / Rejet</option>
                                    <option value="Message laissé">Message laissé</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Durée (min)</label>
                                <input type="number" id="cpmDuree" class="form-input" value="5" min="0">
                            </div>
                            <div class="form-group">
                                <label>Nouvel état du dossier</label>
                                <select id="cpmStatus" class="form-input">
                                    <option value="EN_COURS">En cours</option>
                                    <option value="RELANCE">Relance programmée</option>
                                    <option value="INTERESSE">Très intéressé</option>
                                    <option value="CONVERTI">Converti (Succès)</option>
                                    <option value="PERDU">Perdu / Pas intéressé</option>
                                </select>
                            </div>
                            <div class="form-group form-group--full">
                                <label>Programmer une nouvelle relance (Optionnel)</label>
                                <input type="date" id="cpmRelance" class="form-input">
                            </div>
                            <div class="form-group form-group--full">
                                <label>Compte-rendu *</label>
                                <textarea id="cpmNote" class="form-input" rows="4" required placeholder="Résumé de l'échange..."></textarea>
                            </div>
                        </div>
                    </div>
                    <div class="modal__footer">
                        <button class="amt-btn amt-btn-outline" onclick="document.getElementById('contactProspectModal').classList.remove('active')">Annuler</button>
                        <button class="amt-btn amt-btn-primary" onclick="window.app.views.prospecting.saveContact()">Enregistrer</button>
                    </div>
                </div>
            </div>
        `;
        
        if (container) container.innerHTML = html;
        else document.getElementById('contentContainer').innerHTML = html;
        
        this.loadData();
    },

    loadData() {
        if (this.unsub) this.unsub();
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'abidjan';
        const q = query(collection(db, "prospects"), where("agency", "==", activeAgency));
        
        const _mode = sessionStorage.getItem('shippingMode') || 'maritime';
        this.unsub = onSnapshot(q, (snapshot) => {
            // Isolation Maritime/Aérien : prospects du mode actif uniquement
            // (anciens sans modeExpedition = maritime).
            this.prospects = snapshot.docs.map(d => ({id: d.id, ...d.data()}))
                .filter(p => ((p.modeExpedition === 'aerien') ? 'aerien' : 'maritime') === _mode);
            this.prospects.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
            this.applyFilters();
            
            // Mise à jour de la vue détail en temps réel si elle est ouverte
            if (this.currentDetailId && document.getElementById('detailProspectModal').classList.contains('active')) {
                this.openDetailModal(this.currentDetailId);
            }
        });
    },

    applyFilters() {
        const term = document.getElementById('psSearch').value.toLowerCase().trim();
        const status = document.getElementById('psStatus').value;
        const priority = document.getElementById('psPriority').value;
        const relance = document.getElementById('psRelance').value;
        const today = new Date().toISOString().split('T')[0];
        
        const sevenDaysFromNow = new Date();
        sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
        const upcomingLimit = sevenDaysFromNow.toISOString().split('T')[0];

        this.filteredProspects = this.prospects.filter(p => {
            if (status && p.status !== status) return false;
            if (priority && p.priorite !== priority) return false;
            if (term) {
                const str = `${p.nom} ${p.prenom} ${p.tel} ${p.email} ${p.adresse}`.toLowerCase();
                if (!str.includes(term)) return false;
            }
            
            if (relance === 'today') {
                if (!p.nextRelance || p.nextRelance !== today) return false;
            } else if (relance === 'overdue') {
                if (!p.nextRelance || p.nextRelance >= today) return false;
            } else if (relance === 'upcoming') {
                if (!p.nextRelance || p.nextRelance < today || p.nextRelance > upcomingLimit) return false;
            }
            
            return true;
        });

        this.updateKPIs();
        this.renderTable();
    },

    updateKPIs() {
        const today = new Date().toISOString().split('T')[0];
        const currentMonth = today.substring(0, 7); // YYYY-MM

        let overdue = 0;
        let dueToday = 0;
        let callsThisMonth = 0;
        let converted = 0;

        this.prospects.forEach(p => {
            if (p.nextRelance && p.status !== 'CONVERTI' && p.status !== 'PERDU') {
                if (p.nextRelance < today) overdue++;
                if (p.nextRelance === today) dueToday++;
            }
            if (p.status === 'CONVERTI') converted++;
            
            if (p.history && Array.isArray(p.history)) {
                p.history.forEach(h => {
                    if (h.type === 'Appel' && h.date && h.date.startsWith(currentMonth)) {
                        callsThisMonth++;
                    }
                });
            }
        });

        document.getElementById('kpiTotal').textContent = this.prospects.length;
        document.getElementById('kpiOverdue').textContent = overdue;
        document.getElementById('kpiToday').textContent = dueToday;
        document.getElementById('kpiCalls').textContent = callsThisMonth;
        document.getElementById('kpiConverted').textContent = converted;
    },

    renderTable() {
        const tbody = document.getElementById('psTableBody');
        if (!tbody) return;
        
        if (this.filteredProspects.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 40px; color: #64748b;">Aucun dossier trouvé.</td></tr>';
            return;
        }

        const today = new Date().toISOString().split('T')[0];

        tbody.innerHTML = this.filteredProspects.map(p => {
            const callsCount = p.history ? p.history.filter(h => h.type === 'Appel').length : 0;
            
            let relanceClass = '';
            let rowClass = '';
            if (p.nextRelance) {
                if (p.nextRelance < today && p.status !== 'CONVERTI' && p.status !== 'PERDU') {
                    relanceClass = 'text-red';
                    rowClass = 'data-row--overdue';
                } else if (p.nextRelance === today) {
                    relanceClass = 'text-orange';
                } else {
                    relanceClass = 'text-green';
                }
            }

            const dateRelanceStr = p.nextRelance ? new Date(p.nextRelance).toLocaleDateString('fr-FR') : '-';
            
            return `
                <tr class="data-row ${rowClass}" onclick="window.app.views.prospecting.openDetailModal('${p.id}')">
                    <td class="client-cell"><strong>${p.nom} ${p.prenom || ''}</strong></td>
                    <td>${p.tel || '-'}</td>
                    <td><span class="badge status-${p.status || 'NOUVEAU'}">${(p.status || 'NOUVEAU').replace('_', ' ')}</span></td>
                    <td><span class="badge badge--outline prio-${p.priorite || 'NORMALE'}">${p.priorite || 'NORMALE'}</span></td>
                    <td class="source-cell">${p.source || 'MANUEL'}</td>
                    <td class="center">${callsCount}</td>
                    <td class="${relanceClass}">${dateRelanceStr}</td>
                    <td class="agent-cell">${p.agent || '-'}</td>
                    <td>
                        <button class="amt-btn amt-btn-outline amt-btn-sm" onclick="event.stopPropagation(); window.app.views.prospecting.openDetailModal('${p.id}')">Voir</button>
                    </td>
                </tr>
            `;
        }).join('');
    },

    openNewModal(editId = null) {
        const isEdit = !!editId;
        document.getElementById('npmId').value = editId || '';
        document.getElementById('npmTitle').textContent = isEdit ? 'Modifier le dossier' : 'Nouveau dossier de prospection';
        document.getElementById('npmSaveBtn').textContent = isEdit ? 'Enregistrer' : 'Créer le dossier';
        document.getElementById('npmStatusGroup').style.display = isEdit ? 'flex' : 'none';

        if (isEdit) {
            const p = this.prospects.find(x => x.id === editId);
            if (p) {
                document.getElementById('npmSource').value = p.source || 'MANUEL';
                document.getElementById('npmPriority').value = p.priorite || 'NORMALE';
                document.getElementById('npmNom').value = p.nom || '';
                document.getElementById('npmPrenom').value = p.prenom || '';
                document.getElementById('npmTel').value = p.tel || '';
                document.getElementById('npmEmail').value = p.email || '';
                document.getElementById('npmAdresse').value = p.adresse || '';
                document.getElementById('npmStatus').value = p.status || 'NOUVEAU';
                document.getElementById('npmRelance').value = p.nextRelance || '';
                document.getElementById('npmNote').value = p.note || '';
            }
        } else {
            document.getElementById('npmSource').value = 'MANUEL';
            document.getElementById('npmPriority').value = 'NORMALE';
            document.getElementById('npmNom').value = '';
            document.getElementById('npmPrenom').value = '';
            document.getElementById('npmTel').value = '';
            document.getElementById('npmEmail').value = '';
            document.getElementById('npmAdresse').value = '';
            document.getElementById('npmRelance').value = '';
            document.getElementById('npmNote').value = '';
        }

        document.getElementById('newProspectModal').classList.add('active');
    },

    closeNewModal() {
        document.getElementById('newProspectModal').classList.remove('active');
    },

    async saveProspect() {
        const id = document.getElementById('npmId').value;
        const nom = document.getElementById('npmNom').value.trim();
        const tel = document.getElementById('npmTel').value.trim();

        if (!nom || !tel) {
            this.app.showToast("Nom et Téléphone sont obligatoires", "error");
            return;
        }

        const data = {
            source: document.getElementById('npmSource').value,
            priorite: document.getElementById('npmPriority').value,
            nom: nom,
            prenom: document.getElementById('npmPrenom').value.trim(),
            tel: tel,
            email: document.getElementById('npmEmail').value.trim(),
            adresse: document.getElementById('npmAdresse').value.trim(),
            nextRelance: document.getElementById('npmRelance').value,
            note: document.getElementById('npmNote').value.trim(),
        };

        try {
            if (id) {
                data.status = document.getElementById('npmStatus').value;
                data.updatedAt = new Date().toISOString();
                await updateDoc(doc(db, "prospects", id), data);
                this.app.showToast("Dossier mis à jour", "success");
            } else {
                data.status = 'NOUVEAU';
                data.createdAt = new Date().toISOString();
                data.agency = sessionStorage.getItem('currentActiveAgency') || 'abidjan';
                data.agent = sessionStorage.getItem('userName') || 'Agent';
                data.history = [];
                data.modeExpedition = sessionStorage.getItem('shippingMode') || 'maritime';
                await addDoc(collection(db, "prospects"), data);
                this.app.showToast("Dossier créé", "success");
            }
            this.closeNewModal();
        } catch (e) {
            console.error(e);
            this.app.showToast("Erreur lors de l'enregistrement", "error");
        }
    },

    openDetailModal(id) {
        this.currentDetailId = id;
        const p = this.prospects.find(x => x.id === id);
        if (!p) return;

        const createdDate = p.createdAt ? new Date(p.createdAt).toLocaleString('fr-FR', {dateStyle: 'short', timeStyle: 'short'}) : '-';
        const relanceStr = p.nextRelance ? new Date(p.nextRelance).toLocaleDateString('fr-FR') : 'Non planifiée';
        const callsCount = p.history ? p.history.filter(h => h.type === 'Appel').length : 0;

        // Construction de la Timeline
        let timelineHtml = '<div style="color:#64748b; font-style:italic;">Aucun historique de contact.</div>';
        if (p.history && p.history.length > 0) {
            const sortedHistory = [...p.history].sort((a,b) => new Date(b.date) - new Date(a.date));
            
            timelineHtml = sortedHistory.map(h => {
                const dotColor = h.resultat.includes('positif') ? '#10b981' : (h.resultat.includes('Pas répondu') ? '#ef4444' : '#3b82f6');
                const hDate = new Date(h.date).toLocaleString('fr-FR', {dateStyle:'short', timeStyle:'short'});
                
                return `
                    <div class="timeline__item">
                        <div class="timeline__dot" style="background: ${dotColor};"></div>
                        <div class="timeline__content">
                            <div class="timeline__header">
                                <span class="timeline__date">${hDate}</span>
                                <span class="timeline__type">${h.type}</span>
                                <span class="timeline__resultat" style="color: ${dotColor};">${h.resultat}</span>
                                <span class="timeline__duree">${h.duree ? h.duree + ' min' : ''}</span>
                            </div>
                            <div class="timeline__comment">${h.comment || '-'}</div>
                            <div class="timeline__footer">
                                <span>${h.nextRelance ? 'Prochaine relance le ' + new Date(h.nextRelance).toLocaleDateString('fr-FR') : 'Pas de relance programmée'}</span>
                                <span class="timeline__agent">Saisi par ${h.agent}</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            timelineHtml = `<div class="timeline">${timelineHtml}</div>`;
        }

        const content = `
            <div class="modal__header">
                <h3>${p.nom} ${p.prenom || ''} <span class="badge status-${p.status}" style="margin-left: 10px;">${(p.status || 'NOUVEAU').replace('_', ' ')}</span></h3>
                <button class="modal__close" onclick="document.getElementById('detailProspectModal').classList.remove('active')">✕</button>
            </div>
            <div class="modal__body">
                <div class="detail-layout">
                    <div class="detail-sidebar">
                        <div class="detail-grid">
                            <div class="detail-item"><span class="detail-label">Téléphone</span><span class="detail-value">${p.tel || '-'}</span></div>
                            <div class="detail-item"><span class="detail-label">Email</span><span class="detail-value">${p.email || '-'}</span></div>
                            <div class="detail-item"><span class="detail-label">Adresse</span><span class="detail-value">${p.adresse || '-'}</span></div>
                            <div class="detail-item"><span class="detail-label">Source</span><span class="detail-value">${p.source || '-'}</span></div>
                            <div class="detail-item"><span class="detail-label">Priorité</span><span class="detail-value"><span class="badge badge--outline prio-${p.priorite}">${p.priorite}</span></span></div>
                            <div class="detail-item"><span class="detail-label">Agent</span><span class="detail-value">${p.agent || '-'}</span></div>
                            <div class="detail-item"><span class="detail-label">Prochaine relance</span><span class="detail-value" style="color:#ef4444; font-weight:bold;">${relanceStr}</span></div>
                            <div class="detail-item"><span class="detail-label">Nb appels</span><span class="detail-value">${callsCount}</span></div>
                            <div class="detail-item"><span class="detail-label">Créé le</span><span class="detail-value">${createdDate}</span></div>
                        </div>
                        ${p.note ? `<div class="detail-note"><strong>Note initiale :</strong><br>${p.note}</div>` : ''}
                        <div class="detail-actions">
                            <button class="amt-btn amt-btn-primary" onclick="window.app.views.prospecting.openContactModal('${p.id}')">+ Enregistrer un contact</button>
                            <button class="amt-btn amt-btn-outline" onclick="window.app.views.prospecting.openNewModal('${p.id}')">Modifier le dossier</button>
                            ${p.status !== 'CONVERTI' ? `<button class="amt-btn amt-btn-outline" style="border-color:#10b981; color:#10b981;" onclick="window.app.views.prospecting.convertClient('${p.id}')">✨ Convertir en Client</button>` : ''}
                        </div>
                    </div>
                    
                    <div class="detail-main">
                        <h4 class="section-title">Historique des contacts (${(p.history||[]).length})</h4>
                        ${timelineHtml}
                    </div>
                </div>
            </div>
        `;

        document.getElementById('dpmContent').innerHTML = content;
        document.getElementById('detailProspectModal').classList.add('active');
    },

    openContactModal(id) {
        const p = this.prospects.find(x => x.id === id);
        if(!p) return;
        
        document.getElementById('cpmType').value = 'Appel';
        document.getElementById('cpmResultat').value = 'Joint - Échange positif';
        document.getElementById('cpmDuree').value = '5';
        document.getElementById('cpmStatus').value = p.status === 'NOUVEAU' ? 'EN_COURS' : p.status;
        document.getElementById('cpmRelance').value = '';
        document.getElementById('cpmNote').value = '';
        
        document.getElementById('contactProspectModal').classList.add('active');
    },

    async saveContact() {
        const note = document.getElementById('cpmNote').value.trim();
        if (!note) return this.app.showToast("Le compte-rendu est obligatoire", "error");
        if (!this.currentDetailId) return;

        const contactData = {
            date: new Date().toISOString(),
            type: document.getElementById('cpmType').value,
            resultat: document.getElementById('cpmResultat').value,
            duree: document.getElementById('cpmDuree').value,
            nextRelance: document.getElementById('cpmRelance').value,
            comment: note,
            agent: sessionStorage.getItem('userName') || 'Agent'
        };

        const newStatus = document.getElementById('cpmStatus').value;

        try {
            const docRef = doc(db, "prospects", this.currentDetailId);
            await updateDoc(docRef, {
                status: newStatus,
                nextRelance: contactData.nextRelance || deleteField(),
                updatedAt: new Date().toISOString(),
                history: arrayUnion(contactData)
            });
            
            this.app.showToast("Contact enregistré", "success");
            document.getElementById('contactProspectModal').classList.remove('active');
        } catch(e) {
            console.error(e);
            this.app.showToast("Erreur d'enregistrement", "error");
        }
    },

    async importDormantClients() {
        if (window.AppModal) {
            if (!await window.AppModal.confirm("Voulez-vous analyser la base de données pour trouver les clients dormants (inactifs depuis longtemps) et les importer dans les prospects ?", "Clients dormants", true)) return;
        } else if (!confirm("Importer les clients dormants ?")) return;

        this.app.showToast("Analyse en cours...", "info");
        
        try {
            const snap = await getDocs(query(collection(db, getCollectionName("clients")), where("segment", "==", "dormant")));
            if (snap.empty) {
                this.app.showToast("Aucun client dormant trouvé.", "info");
                return;
            }

            let imported = 0;
            const batch = writeBatch(db);
            
            snap.forEach(docSnap => {
                const c = docSnap.data();
                // Eviter doublons simples par téléphone
                const exists = this.prospects.some(p => p.tel === c.tel);
                if (!exists && c.tel) {
                    const newRef = doc(collection(db, "prospects"));
                    batch.set(newRef, {
                        source: "DORMANT",
                        priorite: "NORMALE",
                        nom: c.nom || "Inconnu",
                        prenom: "",
                        tel: c.tel,
                        email: c.email || "",
                        adresse: c.adresse || "",
                        status: "NOUVEAU",
                        note: "Client inactif réimporté pour relance",
                        createdAt: new Date().toISOString(),
                        agency: sessionStorage.getItem('currentActiveAgency') || 'abidjan',
                        agent: sessionStorage.getItem('userName') || 'Système',
                        history: [],
                        modeExpedition: sessionStorage.getItem('shippingMode') || 'maritime'
                    });
                    imported++;
                }
            });

            if (imported > 0) {
                await batch.commit();
                this.app.showToast(`${imported} clients dormants ajoutés aux prospects !`, "success");
            } else {
                this.app.showToast("Tous les clients dormants sont déjà dans la liste des prospects.", "info");
            }
        } catch(e) {
            console.error(e);
            this.app.showToast("Erreur lors de l'import", "error");
        }
    },
    
    async convertClient(id) {
        const p = this.prospects.find(x => x.id === id);
        if(!p) return;
        
        if (window.AppModal) {
            if (!await window.AppModal.confirm(`Voulez-vous convertir ${p.nom} en Client officiel et archiver ce dossier de prospection ?`, "Convertir en Client", false)) return;
        } else if (!confirm("Convertir en Client ?")) return;

        try {
            // 1. Marquer prospect comme converti
            await updateDoc(doc(db, "prospects", id), { status: 'CONVERTI' });
            
            // 2. Créer le client dans la collection "clients" si le numéro n'existe pas
            const cSnap = await getDocs(query(collection(db, getCollectionName("clients")), where("tel", "==", p.tel)));
            if (cSnap.empty) {
                await addDoc(collection(db, getCollectionName("clients")), {
                    nom: `${p.nom} ${p.prenom || ''}`.trim(),
                    tel: p.tel,
                    email: p.email || '',
                    adresse: p.adresse || '',
                    dateAjout: new Date().toISOString(),
                    agency: p.agency || 'abidjan',
                    risque: 'low',
                    segment: 'nouveau',
                    taille: 'moyen',
                    ca: 0,
                    factures: 0
                });
                this.app.showToast(`Client ${p.nom} créé avec succès dans la base principale !`, "success");
            } else {
                this.app.showToast(`Ce client existe déjà dans la base principale.`, "info");
            }
            document.getElementById('detailProspectModal').classList.remove('active');
        } catch(e) {
            console.error(e);
            this.app.showToast("Erreur lors de la conversion", "error");
        }
    }
};