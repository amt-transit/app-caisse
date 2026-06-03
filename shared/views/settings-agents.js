import { db, app as firebaseApp, functions } from '../../firebase-config.js';
import { collection, query, onSnapshot, doc, getDoc, setDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-functions.js";
import { AGENCIES } from '../../agencies-config.js';

export const SettingsAgentsView = {
    unsub: null,
    unsubRoles: null,
    agents: [],
    systemRoles: [],
    filteredAgents: [],
    tempPhotoFile: null,
    cropper: null,

    render(app) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.settingsAgents = this;

        const agencyOptionsHtml = Object.values(AGENCIES).map(a => 
            `<option value="${a.id}">${a.name} ${a.flag}</option>`
        ).join('') + '<option value="all">Global (Accès Total) 🌍</option>';

        const html = `
            <style>
                .am { max-width: 1200px; margin: 0 auto; animation: fadeIn 0.3s ease-in-out; }
                .am__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; background: white; padding: 20px 25px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; flex-wrap: wrap; gap: 15px; }
                .am__header-left { display: flex; align-items: center; gap: 15px; }
                .am__icon-wrap { background: #eff6ff; color: #3b82f6; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; border-radius: 12px; font-size: 24px; }
                .am__title { margin: 0; color: #0f172a; font-size: 22px; font-weight: 800; }
                .am__subtitle { margin: 4px 0 0 0; color: #64748b; font-size: 13px; }
                
                .am__kpi-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 25px; }
                .am__kpi { display: flex; align-items: center; gap: 15px; padding: 20px; border-radius: 16px; background: white; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
                .am__kpi-icon { font-size: 28px; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; border-radius: 12px; }
                .am__kpi--blue .am__kpi-icon { background: #eff6ff; color: #3b82f6; }
                .am__kpi--green .am__kpi-icon { background: #dcfce7; color: #10b981; }
                .am__kpi--red .am__kpi-icon { background: #fee2e2; color: #ef4444; }
                .am__kpi--teal .am__kpi-icon { background: #ccfbf1; color: #06b6d4; }
                .am__kpi-lbl { color: #64748b; font-size: 12px; font-weight: 600; text-transform: uppercase; }
                .am__kpi-val { font-size: 24px; font-weight: 800; color: #0f172a; line-height: 1; margin-bottom: 4px; }
                
                .am__toolbar { margin-bottom: 20px; }
                .am__search { width: 100%; max-width: 400px; padding: 12px 16px; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 14px; background: white; }
                .am__search:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
                
                .am__table-wrap { background: white; border-radius: 16px; border: 1px solid #e2e8f0; overflow-x: auto; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
                .am__table { width: 100%; border-collapse: collapse; }
                .am__table th { text-align: left; padding: 16px 20px; background: #f8fafc; font-size: 12px; font-weight: 600; color: #475569; border-bottom: 1px solid #e2e8f0; text-transform: uppercase; }
                .am__table td { padding: 16px 20px; border-bottom: 1px solid #f1f5f9; font-size: 13px; vertical-align: middle; }
                .am__table tr:hover td { background: #f8fafc; }
                
                .am__agent-cell { display: flex; align-items: center; gap: 12px; }
                .am__avatar { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; color: white; font-size: 14px; background: linear-gradient(135deg, #3b82f6, #1d4ed8); }
                .am__agent-name { font-weight: 700; color: #0f172a; font-size: 14px; }
                .am__agent-id { font-size: 11px; color: #64748b; margin-top: 2px; }
                
                .am__badge { padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; display: inline-block; }
                .am__badge--admin { background: #fee2e2; color: #991b1b; }
                .am__badge--manager { background: #fef3c7; color: #b45309; }
                .am__badge--agent { background: #e0f2fe; color: #0369a1; }
                .am__badge--chauf { background: #f3e8ff; color: #7e22ce; }
                
                .am__toggle { width: 44px; height: 24px; border-radius: 12px; border: none; cursor: pointer; position: relative; transition: 0.3s; }
                .am__toggle--on { background: #10b981; }
                .am__toggle--off { background: #cbd5e1; }
                .am__toggle-knob { width: 18px; height: 18px; background: white; border-radius: 50%; position: absolute; top: 3px; transition: 0.3s; box-shadow: 0 1px 2px rgba(0,0,0,0.2); }
                .am__toggle--on .am__toggle-knob { left: 23px; }
                .am__toggle--off .am__toggle-knob { left: 3px; }
                
                .am__online-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
                .am__online-dot--on { background: #10b981; box-shadow: 0 0 0 3px rgba(16,185,129,0.2); }
                .am__online-dot--off { background: #cbd5e1; }
                
                .am__actions { display: flex; gap: 8px; }
                .am__btn-sm { width: 32px; height: 32px; border-radius: 8px; border: 1px solid #e2e8f0; background: white; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s; }
                .am__btn-sm:hover { background: #f1f5f9; transform: scale(1.05); }
                
                .am__cards { display: none; }
                @media (max-width: 768px) {
                    .am__table-wrap { display: none; }
                    .am__cards { display: grid; grid-template-columns: 1fr; gap: 15px; }
                    .am__card { background: white; border-radius: 16px; padding: 15px; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
                    .am__card-top { display: flex; align-items: center; gap: 15px; margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #f1f5f9; position: relative; }
                    .am__card-info { flex: 1; }
                    .am__card-details { font-size: 13px; color: #475569; margin-bottom: 15px; line-height: 1.6; }
                    .am__card-bottom { display: flex; justify-content: space-between; align-items: center; }
                    .am__online-dot--card { position: absolute; top: 0; right: 0; }
                    
                    .compact-mob-card { background: white; border-radius: 12px; padding: 15px; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.02); display: flex; flex-direction: column; gap: 10px; }
                    .cmc-header { display: flex; justify-content: space-between; align-items: flex-start; }
                    .cmc-ref-group { display: flex; align-items: center; gap: 10px; }
                    .cmc-ref { font-weight: 700; color: #0f172a; font-size: 14px; }
                    .cmc-body { font-size: 13px; color: #475569; }
                    .cmc-meta { font-size: 11px; color: #64748b; margin-top: 4px; display: flex; align-items: center; gap: 6px; }
                    .cmc-footer { display: flex; justify-content: space-between; align-items: center; padding-top: 10px; border-top: 1px solid #f1f5f9; }
                    .cmc-actions { display: flex; gap: 8px; }
                    .cmc-btn { width: 32px; height: 32px; border-radius: 8px; border: 1px solid #e2e8f0; background: white; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: 0.2s; }
                    .cmc-btn:hover { background: #f1f5f9; }
                    .cmc-btn-del { color: #ef4444; border-color: #fecaca; background: #fef2f2; }
                    .cmc-btn-del:hover { background: #fee2e2; }
                }
            </style>
            <div class="am">
                <div class="am__header">
                    <div class="am__header-left">
                        <div class="am__icon-wrap"><i class="fas fa-users-cog"></i></div>
                        <div>
                            <h1 class="am__title">Gestion des Agents</h1>
                            <p class="am__subtitle">Gérez les comptes, rôles et accès de votre équipe</p>
                        </div>
                    </div>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <button class="amt-btn amt-btn-outline" onclick="window.app.renderPage('settings-roles')" style="display: flex; align-items: center; gap: 8px; background: white; border: 1px solid #cbd5e1; color: #475569; padding: 10px 16px; border-radius: 8px; font-weight: bold; cursor: pointer;">
                            <i class="fas fa-user-shield"></i> Rôles & Permissions
                        </button>
                        <button class="amt-btn amt-btn-primary" onclick="window.app.views.settingsAgents.openModal()" style="display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-plus"></i> Nouvel Agent
                        </button>
                    </div>
                </div>

                <div class="am__kpi-row" id="kpiContainer">
                    <!-- Rendu dynamique -->
                </div>

                <div class="am__toolbar">
                    <input type="text" class="am__search" id="agentSearch" placeholder="🔍 Rechercher par nom, email ou rôle...">
                </div>

                <div class="am__table-wrap">
                    <table class="am__table">
                        <thead>
                            <tr>
                                <th>Agent</th>
                                <th>Rôle</th>
                                <th>Agence</th>
                                <th style="text-align: center;">Accès Actif</th>
                                <th>En ligne</th>
                                <th style="text-align: right;">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="agentTableBody">
                            <tr><td colspan="6" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</td></tr>
                        </tbody>
                    </table>
                </div>

                <div class="am__cards" id="agentCardsContainer"></div>
            </div>

            <!-- MODAL D'ÉDITION -->
            <div id="agentModal" class="modal" style="display:none; position:fixed; z-index:2000; left:0; top:0; width:100%; height:100%; background:rgba(15,23,42,0.6); align-items:center; justify-content:center; backdrop-filter: blur(4px);">
                <style>
                    .ag-section-title { display:flex; align-items:center; gap:8px; margin: 18px 0 10px 0; font-size:12px; font-weight:800; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; }
                    .ag-section-title::after { content:''; flex:1; height:1px; background:#e2e8f0; }
                    /* Selects : taille fixe + ligne aérée -> le libellé n'est plus rogné. */
                    #agentModal select { height: 44px; padding: 0 12px; font-size: 14px; line-height: 1.4; box-sizing: border-box; background: #fff; }
                    #agentModal input[type="text"], #agentModal input[type="number"], #agentModal input[type="email"], #agentModal input[type="password"] { box-sizing: border-box; height: 44px; padding: 0 12px; font-size: 14px; }
                    .ag-mode-toggle { display:flex; gap:6px; background:#f1f5f9; padding:4px; border-radius:10px; }
                    .ag-mode-btn { flex:1; border:none; cursor:pointer; padding:10px 8px; border-radius:8px; font-weight:700; font-size:12px; background:transparent; color:#475569; transition:0.2s; }
                    .ag-mode-btn:hover { background:#e2e8f0; }
                    .ag-mode-btn.active { background:#1e293b; color:#fff; box-shadow:0 2px 6px rgba(15,23,42,0.15); }
                </style>
                <div class="modal-content" style="background:#fff; padding:25px; width:92%; max-width:560px; border-radius:16px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); max-height:92vh; overflow-y:auto;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; border-bottom: 1px solid #e2e8f0; padding-bottom: 14px;">
                        <h3 id="agentModalTitle" style="margin: 0; font-size: 18px; color: #0f172a; font-weight: 800; display:flex; align-items:center; gap:10px;"><span style="display:inline-flex; width:34px; height:34px; align-items:center; justify-content:center; background:linear-gradient(135deg,#1e293b,#3b82f6); color:#fff; border-radius:10px; font-size:16px;">👤</span>Nouvel Agent</h3>
                        <span class="close-modal" onclick="window.app.views.settingsAgents.closeModal()" style="cursor:pointer; font-size:24px; color:#64748b; line-height:1;">&times;</span>
                    </div>
                    
                    <input type="hidden" id="agentId">
                    
                    <div style="display: flex; flex-direction: column; align-items: center; margin-bottom: 20px;">
                        <div id="agentPhotoPreview" style="width: 80px; height: 80px; border-radius: 50%; background: #f1f5f9; border: 2px dashed #cbd5e1; display: flex; align-items: center; justify-content: center; cursor: pointer; overflow: hidden; position: relative; transition: all 0.2s;" onclick="document.getElementById('agentPhotoInput').click()" title="Cliquez pour ajouter une photo">
                            <i class="fas fa-camera" style="color: #94a3b8; font-size: 24px;" id="agentPhotoPlaceholder"></i>
                        </div>
                        <span style="font-size: 11px; color: #64748b; margin-top: 8px;">Photo de profil</span>
                        <input type="file" id="agentPhotoInput" accept="image/*" style="display:none;" onchange="window.app.views.settingsAgents.handlePhotoSelect(event)">
                    </div>

                    <!-- MODAL DE RECADRAGE PHOTO -->
                    <div id="photoCropModal" class="modal" style="display:none; z-index: 2001;">
                        <div class="modal-content" style="max-width: 500px; padding: 20px;">
                            <h3 style="margin-top:0; color: #0f172a;">Recadrer la photo</h3>
                            <div style="width: 100%; max-height: 40vh; margin: 20px 0; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                                <img id="imageToCrop" src="" style="max-width: 100%; display: block;">
                            </div>
                            <div style="display: flex; justify-content: flex-end; gap: 10px;">
                                <button class="amt-btn amt-btn-outline" onclick="window.app.views.settingsAgents.closeCropModal()">Annuler</button>
                                <button class="amt-btn amt-btn-primary" onclick="window.app.views.settingsAgents.cropImage()">Recadrer et utiliser</button>
                            </div>
                        </div>
                    </div>

                    <div class="ag-section-title"><span>🧑</span> Identité</div>

                    <div class="form-group" style="margin-bottom: 15px;">
                        <label style="font-weight: 600; color: #1e293b; margin-bottom: 6px; display: block;">Nom complet *</label>
                        <input type="text" id="agentName" style="width: 100%; padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px;" placeholder="Ex: Mouhamad Fofana">
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 15px;">
                        <label style="font-weight: 600; color: #1e293b; margin-bottom: 6px; display: block;">Initiale <span style="color:#ef4444;">*</span> <span style="font-weight:400; color:#64748b; font-size:12px;">(2 lettres, unique par agence — préfixe des références)</span></label>
                        <input type="text" id="agentInitials" style="width: 100%; padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px; text-transform: uppercase;" placeholder="Ex: FM" maxlength="2" oninput="this.value=this.value.replace(/[^a-zA-Z]/g,'').toUpperCase();">
                    </div>

                    <div class="ag-section-title"><span>🔐</span> Connexion</div>

                    <div class="form-group" style="margin-bottom: 15px;">
                        <label style="font-weight: 600; color: #1e293b; margin-bottom: 6px; display: block;">Identifiant de connexion *</label>
                        <input type="text" id="agentEmail" style="width: 100%; padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px;" placeholder="Ex: mouhamad">
                        <small style="color: #64748b; font-size: 11px; margin-top: 4px; display: block;">Le suffixe @amt.com sera ajouté automatiquement (tapez juste le nom).</small>
                    </div>

                    <div class="form-group" style="margin-bottom: 15px;">
                        <label style="font-weight: 600; color: #1e293b; margin-bottom: 6px; display: block;">Mot de passe *</label>
                        <input type="text" id="agentPassword" style="width: 100%; padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px;" placeholder="Mot de passe">
                    </div>

                    <div class="ag-section-title"><span>📍</span> Affectation</div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                        <div class="form-group">
                            <label style="font-weight: 600; color: #1e293b; margin-bottom: 6px; display: block;">Rôle *</label>
                            <select id="agentRole" style="width: 100%; padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px;">
                            <!-- Les rôles sont chargés dynamiquement depuis Firebase -->
                            </select>
                        </div>
                        <div class="form-group">
                            <label style="font-weight: 600; color: #1e293b; margin-bottom: 6px; display: block;">Agence / Route *</label>
                            <select id="agentAgency" style="width: 100%; padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px;">
                            ${agencyOptionsHtml}
                            </select>
                        </div>
                    </div>

                    <div class="form-group" style="margin-bottom: 25px;">
                        <label style="font-weight: 600; color: #1e293b; margin-bottom: 6px; display: block;">Mode d'expédition autorisé *</label>
                        <div class="ag-mode-toggle">
                            <button type="button" class="ag-mode-btn active" data-mode-val="both" onclick="window.app.views.settingsAgents.setAllowedMode('both')">🚢 + ✈️ Les deux</button>
                            <button type="button" class="ag-mode-btn" data-mode-val="maritime" onclick="window.app.views.settingsAgents.setAllowedMode('maritime')">🚢 Maritime seul</button>
                            <button type="button" class="ag-mode-btn" data-mode-val="aerien" onclick="window.app.views.settingsAgents.setAllowedMode('aerien')">✈️ Aérien seul</button>
                        </div>
                        <input type="hidden" id="agentAllowedMode" value="both">
                        <small style="color:#64748b; font-size:11px; margin-top:6px; display:block;">Limite l'accès de l'agent à un mode dans sa route. « Les deux » par défaut.</small>
                    </div>

                    <div style="display: flex; justify-content: flex-end; gap: 10px;">
                        <button class="amt-btn amt-btn-outline" style="padding: 10px 15px;" onclick="window.app.views.settingsAgents.closeModal()">Annuler</button>
                        <button class="amt-btn amt-btn-primary" id="saveAgentBtn" style="padding: 10px 20px;" onclick="window.app.views.settingsAgents.saveAgent()"><i class="fas fa-save"></i> Enregistrer</button>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('contentContainer').innerHTML = html;
        document.getElementById('agentSearch')?.addEventListener('input', () => this.applyFilters());
        
        this.loadData();
    },

    loadData() {
        if (this.unsub) this.unsub();
        if (this.unsubRoles) this.unsubRoles();
        
        this.unsubRoles = onSnapshot(collection(db, "roles"), (snapshot) => {
            this.systemRoles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            this.updateRolesDropdown();
        });
        
        this.unsub = onSnapshot(query(collection(db, "users")), (snapshot) => {
            this.agents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // Tri alphabétique
            this.agents.sort((a, b) => {
                const nameA = a.displayName || a.email || '';
                const nameB = b.displayName || b.email || '';
                return nameA.localeCompare(nameB);
            });

            this.applyFilters();
        }, (error) => {
            console.error("Erreur chargement agents:", error);
            this.app.showToast("Erreur de connexion à la base de données.", "error");
        });
    },

    updateRolesDropdown() {
        const select = document.getElementById('agentRole');
        if (!select) return;
        const currentVal = select.value;
        
        const baseRoles = [
            { id: 'agent', name: 'Agent Standard' },
            { id: 'admin', name: 'Administrateur' },
            { id: 'super_admin', name: 'Super Admin' },
            { id: 'manager', name: 'Manager / Direction' },
            { id: 'chauf', name: 'Chauffeur / Livreur' },
            { id: 'spectateur', name: 'Spectateur' }
        ];

        const baseIds = baseRoles.map(r => r.id);
        const dynamicRoles = (this.systemRoles || []).filter(r => !baseIds.includes(r.id));

        let html = '';
        
        if (dynamicRoles.length > 0) {
            html += `<optgroup label="Rôles Personnalisés">`;
            dynamicRoles.forEach(r => { html += `<option value="${r.id}">${r.name}</option>`; });
            html += `</optgroup>`;
        }

        html += `<optgroup label="Rôles Système (Défaut)">`;
        baseRoles.forEach(r => { html += `<option value="${r.id}">${r.name}</option>`; });
        html += `</optgroup>`;

        select.innerHTML = html;
        if (currentVal && select.querySelector(`option[value="${currentVal}"]`)) { select.value = currentVal; } else { select.value = 'agent'; }
    },

    applyFilters() {
        const term = (document.getElementById('agentSearch')?.value || '').toLowerCase().trim();
        
        this.filteredAgents = this.agents.filter(a => {
            const name = (a.displayName || '').toLowerCase();
            const email = (a.email || '').toLowerCase();
            const role = (a.role || '').toLowerCase();
            if (term && !name.includes(term) && !email.includes(term) && !role.includes(term)) return false;
            return true;
        });

        this.renderView();
    },

    getRoleBadge(role) {
        const r = role?.toLowerCase() || '';
        if (r.includes('admin')) return `<span class="am__badge am__badge--admin">${r.toUpperCase().replace('_', ' ')}</span>`;
        if (r.includes('manager')) return `<span class="am__badge am__badge--manager">MANAG</span>`;
        if (r.includes('chauf')) return `<span class="am__badge am__badge--chauf">CHAUF</span>`;
        return `<span class="am__badge am__badge--agent">${r.toUpperCase().replace('_', ' ') || 'AGENT'}</span>`;
    },

    getInitials(name, explicitInitials) {
        if (explicitInitials) return explicitInitials.toUpperCase();
        if (!name) return '??';
        const parts = name.trim().split(' ');
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        return name.substring(0, 2).toUpperCase();
    },

    renderView() {
        const activeCount = this.agents.filter(a => a.active !== false).length;
        const inactiveCount = this.agents.filter(a => a.active === false).length;

        // Un agent est considéré en ligne si isOnline est true, ou si lastActive date de moins de 5 minutes
        const isUserOnline = (a) => a.isOnline === true || (a.lastActive && (new Date() - new Date(a.lastActive)) < 5 * 60 * 1000);
        const onlineCount = this.agents.filter(isUserOnline).length;

        // REPÉRAGE DES DOUBLONS D'INITIALE par agence (préfixe de la référence
        // colis : un doublon = risque de références identiques).
        const _iniCount = {};
        this.agents.forEach(a => {
            const ini = String(a.initials || '').trim().toUpperCase();
            if (!ini) return;
            const k = (a.agency || '') + '|' + ini;
            _iniCount[k] = (_iniCount[k] || 0) + 1;
        });
        const dupInitKeys = new Set(Object.keys(_iniCount).filter(k => _iniCount[k] > 1));
        const hasDupInitials = (a) => {
            const ini = String(a.initials || '').trim().toUpperCase();
            return !!ini && dupInitKeys.has((a.agency || '') + '|' + ini);
        };

        const kpiContainer = document.getElementById('kpiContainer');
        if (!kpiContainer) return; // Sécurité : arrête la fonction si on a quitté la page

        // MAJ KPIs
        kpiContainer.innerHTML = `
            <div class="am__kpi am__kpi--blue"><div class="am__kpi-icon"><i class="fas fa-users"></i></div><div><div class="am__kpi-val">${this.agents.length}</div><div class="am__kpi-lbl">Total agents</div></div></div>
            <div class="am__kpi am__kpi--green"><div class="am__kpi-icon"><i class="fas fa-check-circle"></i></div><div><div class="am__kpi-val">${activeCount}</div><div class="am__kpi-lbl">Actifs</div></div></div>
            <div class="am__kpi am__kpi--red"><div class="am__kpi-icon"><i class="fas fa-ban"></i></div><div><div class="am__kpi-val">${inactiveCount}</div><div class="am__kpi-lbl">Inactifs</div></div></div>
            <div class="am__kpi am__kpi--teal"><div class="am__kpi-icon"><i class="fas fa-wifi"></i></div><div><div class="am__kpi-val">${onlineCount}</div><div class="am__kpi-lbl">En ligne</div></div></div>
        `;
        if (dupInitKeys.size > 0) {
            kpiContainer.innerHTML += `<div style="grid-column:1/-1; flex-basis:100%; width:100%; background:#fef2f2; border:1px solid #fecaca; border-radius:12px; padding:12px 16px; margin-top:4px; display:flex; align-items:center; gap:10px; color:#991b1b; font-size:13px; font-weight:600;"><i class="fas fa-triangle-exclamation" style="color:#ef4444;"></i> ${dupInitKeys.size} initiale(s) en DOUBLON sur une même agence — à corriger (risque de références de colis en conflit). Les agents concernés sont signalés ci-dessous.</div>`;
        }

        const tbody = document.getElementById('agentTableBody');
        const cards = document.getElementById('agentCardsContainer');
        const isMobile = window.innerWidth <= 768;

        if (this.filteredAgents.length === 0) {
            const emptyHtml = `<tr><td colspan="6" style="text-align: center; padding: 40px; color: #64748b;">Aucun agent trouvé.</td></tr>`;
            tbody.innerHTML = emptyHtml;
            cards.innerHTML = `<div style="text-align: center; padding: 40px; color: #64748b;">Aucun agent trouvé.</div>`;
            return;
        }

        if (isMobile) {
            cards.innerHTML = this.filteredAgents.map(a => {
                const isActive = a.active !== false;
                const name = a.displayName || a.email || 'Sans nom';
            const agency = AGENCIES[a.agency] ? AGENCIES[a.agency].name : (a.agency === 'all' ? 'GLOBAL' : (a.agency || 'N/A'));
                const isOnline = isUserOnline(a);
                
                // Affichage direct si c'est l'utilisateur connecté (évite le délai serveur)
                const auth = getAuth();
                const displayPhoto = (auth.currentUser && a.id === auth.currentUser.uid && localStorage.getItem('userProfilePhoto')) ? localStorage.getItem('userProfilePhoto') : a.photoURL;

                return `
                    <div class="compact-mob-card" style="margin-bottom: 12px; opacity: ${isActive ? '1' : '0.6'};">
                        <div class="cmc-header">
                            <div class="cmc-ref-group" style="display: flex; align-items: center; gap: 10px;">
                                ${displayPhoto 
                                    ? `<div style="width: 28px; height: 28px; border-radius: 50%; background-image: url('${displayPhoto}'); background-size: cover; background-position: center; flex-shrink: 0;"></div>` 
                                    : `<div style="width: 28px; height: 28px; border-radius: 50%; background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 10px; flex-shrink: 0;">${this.getInitials(name, a.initials)}</div>`
                                }
                                <span class="cmc-ref" style="font-family: 'Inter', sans-serif; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${name}</span>
                            </div>
                            ${this.getRoleBadge(a.role)}${hasDupInitials(a) ? `<span title="Initiale en doublon sur cette agence" style="margin-left:6px; background:#fee2e2; color:#991b1b; font-size:10px; font-weight:700; padding:2px 7px; border-radius:8px;">⚠ ${String(a.initials||'').toUpperCase()} DOUBLON</span>` : ''}
                        </div>
                        <div class="cmc-body">
                            <div class="cmc-route" style="font-size: 11px;">
                                ${a.email || 'Pas d\'email'}
                            </div>
                            <div class="cmc-meta">
                                <span class="am__online-dot ${isOnline ? 'am__online-dot--on' : 'am__online-dot--off'}"></span> ${agency}
                            </div>
                        </div>
                        <div class="cmc-footer">
                            <button class="am__toggle ${isActive ? 'am__toggle--on' : 'am__toggle--off'}" onclick="window.app.views.settingsAgents.toggleStatus('${a.id}', ${isActive})">
                                <span class="am__toggle-knob"></span>
                            </button>
                            <div class="cmc-actions">
                                <button class="cmc-btn cmc-btn-edit" onclick="window.app.views.settingsAgents.openModal('${a.id}')" title="Modifier"><i class="fas fa-edit"></i></button>
                                <button class="cmc-btn cmc-btn-del" onclick="window.app.views.settingsAgents.deleteAgent('${a.id}')" title="Supprimer"><i class="fas fa-trash"></i></button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            tbody.innerHTML = ''; // Clear desktop table
        } else {
            tbody.innerHTML = this.filteredAgents.map(a => {
                const isActive = a.active !== false; // Actif par défaut
                const name = a.displayName || a.email || 'Sans nom';
            const agency = AGENCIES[a.agency] ? AGENCIES[a.agency].name : (a.agency === 'all' ? 'GLOBAL' : (a.agency || 'N/A'));
                
                // Affichage direct si c'est l'utilisateur connecté
                const auth = getAuth();
                const displayPhoto = (auth.currentUser && a.id === auth.currentUser.uid && localStorage.getItem('userProfilePhoto')) ? localStorage.getItem('userProfilePhoto') : a.photoURL;
                
                return `
                    <tr style="opacity: ${isActive ? '1' : '0.6'};">
                        <td>
                            <div class="am__agent-cell">
                                ${displayPhoto 
                                    ? `<div class="am__avatar" style="background-image: url('${displayPhoto}'); background-size: cover; background-position: center; color: transparent;"></div>`
                                    : `<div class="am__avatar">${this.getInitials(name, a.initials)}</div>`
                                }
                                <div>
                                    <div class="am__agent-name">${name}</div>
                                    <div class="am__agent-id">${a.email || 'Pas d\'email'} &middot; ${a.initials || this.getInitials(name)}${hasDupInitials(a) ? ` <span title="Initiale en doublon sur cette agence" style="background:#fee2e2; color:#991b1b; font-size:10px; font-weight:700; padding:1px 6px; border-radius:7px; margin-left:4px;">⚠ DOUBLON</span>` : ''}</div>
                                </div>
                            </div>
                        </td>
                        <td>${this.getRoleBadge(a.role)}</td>
                        <td><span style="font-size: 11px; font-weight: 600; color: #475569;">${agency}</span></td>
                        <td style="text-align: center;">
                            <button class="am__toggle ${isActive ? 'am__toggle--on' : 'am__toggle--off'}" onclick="window.app.views.settingsAgents.toggleStatus('${a.id}', ${isActive})">
                                <span class="am__toggle-knob"></span>
                            </button>
                        </td>
                        <td><span class="am__online-dot ${isUserOnline(a) ? 'am__online-dot--on' : 'am__online-dot--off'}"></span> <span style="font-size:11px; color:${isUserOnline(a) ? '#10b981' : '#64748b'};">${isUserOnline(a) ? 'En ligne' : 'Hors ligne'}</span></td>
                        <td style="text-align: right;">
                            <div class="am__actions" style="justify-content: flex-end;">
                                <button class="am__btn-sm" onclick="window.app.views.settingsAgents.openModal('${a.id}')" title="Modifier">✏️</button>
                                <button class="am__btn-sm" onclick="window.app.views.settingsAgents.deleteAgent('${a.id}')" title="Supprimer" style="color: #ef4444;">🗑️</button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
            cards.innerHTML = ''; // Clear mobile cards
        }
    },

    openModal(id = null) {
        const isEdit = !!id;
        document.getElementById('agentModalTitle').textContent = isEdit ? 'Modifier l\'Agent' : 'Nouvel Agent';
        document.getElementById('agentId').value = id || '';
        
        this.tempPhotoFile = null;
        const preview = document.getElementById('agentPhotoPreview');
        const placeholder = document.getElementById('agentPhotoPlaceholder');
        document.getElementById('agentPhotoInput').value = '';

        if (isEdit) {
            const agent = this.agents.find(a => a.id === id);
            
            if (agent.photoURL) {
                preview.style.backgroundImage = `url('${agent.photoURL}')`;
                preview.style.backgroundSize = 'cover';
                preview.style.backgroundPosition = 'center';
                placeholder.style.display = 'none';
            } else {
                preview.style.backgroundImage = '';
                placeholder.style.display = 'block';
            }
            
            document.getElementById('agentName').value = agent.displayName || '';
            // On masque le @amt.com dans le formulaire pour la modification
            document.getElementById('agentEmail').value = (agent.email || '').replace('@amt.com', '');
            document.getElementById('agentPassword').value = agent.password || '';
            document.getElementById('agentInitials').value = agent.initials || '';
            document.getElementById('agentRole').value = agent.role || 'agent';
            document.getElementById('agentAgency').value = agent.agency || 'paris';
            this.setAllowedMode(agent.allowedMode || 'both');
        } else {
            preview.style.backgroundImage = '';
            placeholder.style.display = 'block';

            document.getElementById('agentName').value = '';
            document.getElementById('agentEmail').value = '';
            document.getElementById('agentPassword').value = '';
            document.getElementById('agentInitials').value = '';
            document.getElementById('agentRole').value = 'agent';
            document.getElementById('agentAgency').value = 'paris';
            this.setAllowedMode('both');
        }
        
        document.getElementById('agentModal').style.display = 'flex';
    },

    closeModal() {
        document.getElementById('agentModal').style.display = 'none';
    },

    // Mode d'expédition autorisé pour CET agent (en plus du roleAerien) :
    // 'both' (défaut) | 'maritime' | 'aerien'. Limite la bascule de mode + le menu.
    setAllowedMode(mode) {
        const valid = ['both', 'maritime', 'aerien'].includes(mode) ? mode : 'both';
        const hidden = document.getElementById('agentAllowedMode');
        if (hidden) hidden.value = valid;
        document.querySelectorAll('#agentModal .ag-mode-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.modeVal === valid);
        });
    },

    handlePhotoSelect(event) {
        const file = event.target.files[0];
        if (!file || !file.type.startsWith('image/')) return;

        // Utilisation de FileReader pour obtenir une URL de données pour Cropper.js
        const reader = new FileReader();
        reader.onload = (e) => {
            const modal = document.getElementById('photoCropModal');
            const image = document.getElementById('imageToCrop');
            
            image.src = e.target.result;
            modal.style.display = 'flex';

            if (this.cropper) {
                this.cropper.destroy();
            }

            this.cropper = new Cropper(image, {
                aspectRatio: 1,
                viewMode: 1,
                background: false,
                autoCropArea: 0.8,
            });
        };
        reader.readAsDataURL(file);
    },

    closeCropModal() {
        if (this.cropper) {
            this.cropper.destroy();
            this.cropper = null;
        }
        document.getElementById('photoCropModal').style.display = 'none';
        document.getElementById('agentPhotoInput').value = ''; // Réinitialise l'input
    },

    cropImage() {
        if (!this.cropper) return;

        const canvas = this.cropper.getCroppedCanvas({
            width: 256, height: 256, imageSmoothingQuality: 'high',
        });

        const croppedImageUrl = canvas.toDataURL('image/jpeg');
        
        const preview = document.getElementById('agentPhotoPreview');
        preview.style.backgroundImage = `url('${croppedImageUrl}')`;
        preview.style.backgroundSize = 'cover';
        preview.style.backgroundPosition = 'center';
        document.getElementById('agentPhotoPlaceholder').style.display = 'none';

        canvas.toBlob((blob) => { this.tempPhotoFile = blob; }, 'image/jpeg');
        this.closeCropModal();
    },

    async saveAgent() {
        const id = document.getElementById('agentId').value;
        const name = document.getElementById('agentName').value.trim();
        const rawUsername = document.getElementById('agentEmail').value.trim().toLowerCase().replace(/\s+/g, '');
        const password = document.getElementById('agentPassword').value.trim();
        const initials = document.getElementById('agentInitials').value.trim().toUpperCase();
        const role = document.getElementById('agentRole').value;
        const agency = document.getElementById('agentAgency').value;
        const allowedMode = document.getElementById('agentAllowedMode')?.value || 'both';

        if (!name || !rawUsername || !password) {
            return this.app.showToast("Veuillez remplir le nom, l'identifiant et le mot de passe.", "error");
        }

        // INITIALE OBLIGATOIRE — exactement 2 LETTRES (préfixe de la référence
        // colis, ex. « JB-003-AER1 »).
        if (!/^[A-Z]{2}$/.test(initials)) {
            return this.app.showToast("L'initiale est obligatoire et doit faire exactement 2 lettres (ex. JB).", "error");
        }

        // UNICITÉ DE L'INITIALE PAR ROUTE/AGENCE.
        // L'initiale est un PRÉFIXE de la RÉFÉRENCE des colis (ex. « J-003-AER1 »).
        // Deux agents de la MÊME agence avec la même initiale peuvent produire des
        // références identiques (collision, surtout en saisie simultanée). On bloque.
        if (initials) {
            const clash = (this.agents || []).find(a =>
                a.id !== id &&
                String(a.agency || '') === String(agency) &&
                String(a.initials || '').trim().toUpperCase() === initials
            );
            if (clash) {
                return this.app.showToast(
                    `L'initiale « ${initials} » est déjà utilisée par ${clash.displayName || clash.email || 'un autre agent'} sur cette agence. Choisissez-en une autre — sinon les références de colis entreraient en conflit.`,
                    "error"
                );
            }
        }

        // Auto-complétion de l'email comme sur le login
        let email = rawUsername;
        if (!email.includes('@')) email += '@amt.com';

        const btn = document.getElementById('saveAgentBtn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>...';

        try {
            let uploadedPhotoURL = null;
            
            if (this.tempPhotoFile) {
                const storage = getStorage(firebaseApp);
                // Les Blobs n'ont pas de nom, on force l'extension .jpg
                const fileName = `profile_photos/agent_${Date.now()}_${Math.floor(Math.random()*1000)}.jpg`;
                const sRef = storageRef(storage, fileName);
                await uploadBytes(sRef, this.tempPhotoFile);
                uploadedPhotoURL = await getDownloadURL(sRef);
            }

            const payload = {
                displayName: name,
                email: email,
                password: password,
                initials: initials,
                role: role,
                agency: agency,
                allowedMode: allowedMode,
                updatedAt: new Date().toISOString()
            };

            if (uploadedPhotoURL) payload.photoURL = uploadedPhotoURL;

            if (id) {
                await updateDoc(doc(db, "users", id), payload);
                this.app.showToast("Agent modifié avec succès.", "success");
            } else {
                // CRÉATION SÉCURISÉE VIA CLOUD FUNCTION
                const createAgentFunc = httpsCallable(functions, 'createAgent');
                const result = await createAgentFunc({ email: email, password: password, displayName: name });
                const uid = result.data.uid;

                // Ajout des infos pour la fiche Firestore
                payload.active = true;
                payload.createdAt = new Date().toISOString();

                // Création de la fiche dans Firestore avec le même ID que l'authentification
                await setDoc(doc(db, "users", uid), payload);

                this.app.showToast(`Compte créé avec succès pour ${name} !`, "success");
            }
            this.closeModal();
        } catch (error) {
            console.error("Erreur sauvegarde agent:", error);
            this.app.showToast("Erreur lors de la sauvegarde.", "error");
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> Enregistrer';
        }
    },

    async toggleStatus(id, currentStatus) {
        try {
            await updateDoc(doc(db, "users", id), { active: !currentStatus });
            this.app.showToast(`L'accès de l'agent a été ${!currentStatus ? 'activé' : 'désactivé'}.`, "success");
        } catch (error) {
            this.app.showToast("Erreur lors de la modification du statut.", "error");
        }
    },

    async deleteAgent(id) {
        if (!await window.AppModal.confirm("Voulez-vous vraiment supprimer cet agent ?\n\nCette action supprimera définitivement sa fiche dans la base de données ET son accès de connexion Firebase.", "Supprimer l'agent", true)) return;
        
        try {
            // 1. Récupérer les informations de l'agent pour obtenir son mot de passe
            const agentDoc = await getDoc(doc(db, "users", id));
            
            if (agentDoc.exists()) {
                const agentData = agentDoc.data();
                
                // SUPPRESSION SÉCURISÉE VIA CLOUD FUNCTION
                try {
                    const deleteAgentFunc = httpsCallable(functions, 'deleteAgent');
                    await deleteAgentFunc({ uid: id });
                } catch (funcErr) {
                    console.warn("Impossible de supprimer l'Auth (Cloud Function) :", funcErr);
                }
            }

            // 2. Supprimer la fiche dans Firestore
            await deleteDoc(doc(db, "users", id));
            this.app.showToast("Agent et compte de connexion supprimés avec succès.", "success");
        } catch (error) {
            console.error("Erreur suppression:", error);
            this.app.showToast("Erreur de suppression.", "error");
        }
    }
};