import { db, app as firebaseApp } from '../../../firebase-config.js';
import { collection, query, onSnapshot, doc, getDoc, setDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, deleteUser, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";

export const SettingsAgentsView = {
    unsub: null,
    agents: [],
    filteredAgents: [],
    tempPhotoFile: null,
    cropper: null,

    render(app) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.settingsAgents = this;

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
                    <button class="btn btn-primary" onclick="window.app.views.settingsAgents.openModal()" style="display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-plus"></i> Nouvel Agent
                    </button>
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
                <div class="modal-content" style="background:#fff; padding:25px; width:90%; max-width:500px; border-radius:16px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid #e2e8f0; padding-bottom: 15px;">
                        <h3 id="agentModalTitle" style="margin: 0; font-size: 18px; color: #0f172a; font-weight: 800;">Nouvel Agent</h3>
                        <span class="close-modal" onclick="window.app.views.settingsAgents.closeModal()" style="cursor:pointer; font-size:24px; color:#64748b;">&times;</span>
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
                                <button class="btn btn-outline" onclick="window.app.views.settingsAgents.closeCropModal()">Annuler</button>
                                <button class="btn btn-primary" onclick="window.app.views.settingsAgents.cropImage()">Recadrer et utiliser</button>
                            </div>
                        </div>
                    </div>

                    <div class="form-group" style="margin-bottom: 15px;">
                        <label style="font-weight: 600; color: #1e293b; margin-bottom: 6px; display: block;">Nom complet *</label>
                        <input type="text" id="agentName" style="width: 100%; padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px;" placeholder="Ex: Mouhamad Fofana">
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 15px;">
                        <label style="font-weight: 600; color: #1e293b; margin-bottom: 6px; display: block;">Identifiant de connexion *</label>
                        <input type="text" id="agentEmail" style="width: 100%; padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px;" placeholder="Ex: mouhamad">
                        <small style="color: #64748b; font-size: 11px; margin-top: 4px; display: block;">Le suffixe @amt.com sera ajouté automatiquement (tapez juste le nom).</small>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                        <div class="form-group">
                            <label style="font-weight: 600; color: #1e293b; margin-bottom: 6px; display: block;">Mot de passe *</label>
                            <input type="text" id="agentPassword" style="width: 100%; padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px;" placeholder="Mot de passe">
                        </div>
                        <div class="form-group">
                            <label style="font-weight: 600; color: #1e293b; margin-bottom: 6px; display: block;">Rôle *</label>
                            <select id="agentRole" style="width: 100%; padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px;">
                                <option value="agent">Agent Standard</option>
                                <option value="admin">Administrateur</option>
                                <option value="super_admin">Super Admin</option>
                                <option value="manager">Manager / Direction</option>
                                <option value="chauf">Chauffeur / Livreur</option>
                                <option value="saisie_full">Saisie Full</option>
                                <option value="saisie_limited">Saisie Limited</option>
                                <option value="spectateur">Spectateur</option>
                            </select>
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 25px;">
                        <div class="form-group">
                            <label style="font-weight: 600; color: #1e293b; margin-bottom: 6px; display: block;">Initiale</label>
                            <input type="text" id="agentInitials" style="width: 100%; padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px;" placeholder="Ex: FM" maxlength="4">
                        </div>
                        <div class="form-group">
                            <label style="font-weight: 600; color: #1e293b; margin-bottom: 6px; display: block;">Agence *</label>
                            <select id="agentAgency" style="width: 100%; padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px;">
                                <option value="paris">PARIS (AMT TRANSIT)</option>
                                <option value="abidjan">ABIDJAN (AMT CARGO)</option>
                                <option value="all">Global (Accès Total)</option>
                            </select>
                        </div>
                    </div>
                    
                    <div style="display: flex; justify-content: flex-end; gap: 10px;">
                        <button class="btn btn-outline" style="padding: 10px 15px;" onclick="window.app.views.settingsAgents.closeModal()">Annuler</button>
                        <button class="btn btn-primary" id="saveAgentBtn" style="padding: 10px 20px;" onclick="window.app.views.settingsAgents.saveAgent()"><i class="fas fa-save"></i> Enregistrer</button>
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

        const kpiContainer = document.getElementById('kpiContainer');
        if (!kpiContainer) return; // Sécurité : arrête la fonction si on a quitté la page

        // MAJ KPIs
        kpiContainer.innerHTML = `
            <div class="am__kpi am__kpi--blue"><div class="am__kpi-icon"><i class="fas fa-users"></i></div><div><div class="am__kpi-val">${this.agents.length}</div><div class="am__kpi-lbl">Total agents</div></div></div>
            <div class="am__kpi am__kpi--green"><div class="am__kpi-icon"><i class="fas fa-check-circle"></i></div><div><div class="am__kpi-val">${activeCount}</div><div class="am__kpi-lbl">Actifs</div></div></div>
            <div class="am__kpi am__kpi--red"><div class="am__kpi-icon"><i class="fas fa-ban"></i></div><div><div class="am__kpi-val">${inactiveCount}</div><div class="am__kpi-lbl">Inactifs</div></div></div>
            <div class="am__kpi am__kpi--teal"><div class="am__kpi-icon"><i class="fas fa-wifi"></i></div><div><div class="am__kpi-val">${onlineCount}</div><div class="am__kpi-lbl">En ligne</div></div></div>
        `;

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
                const agency = a.agency === 'paris' ? 'PARIS' : (a.agency === 'abidjan' ? 'ABIDJAN' : (a.agency === 'all' ? 'GLOBAL' : (a.agency || 'N/A')));
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
                            ${this.getRoleBadge(a.role)}
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
                const agency = a.agency === 'paris' ? 'PARIS AMT TRANSIT' : (a.agency === 'abidjan' ? 'ABIDJAN (AMT CARGO)' : (a.agency === 'all' ? 'GLOBAL' : (a.agency || 'Non définie')));
                
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
                                    <div class="am__agent-id">${a.email || 'Pas d\'email'} &middot; ${a.initials || this.getInitials(name)}</div>
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
        } else {
            preview.style.backgroundImage = '';
            placeholder.style.display = 'block';
            
            document.getElementById('agentName').value = '';
            document.getElementById('agentEmail').value = '';
            document.getElementById('agentPassword').value = '';
            document.getElementById('agentInitials').value = '';
            document.getElementById('agentRole').value = 'agent';
            document.getElementById('agentAgency').value = 'paris';
        }
        
        document.getElementById('agentModal').style.display = 'flex';
    },

    closeModal() {
        document.getElementById('agentModal').style.display = 'none';
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

        if (!name || !rawUsername || !password) {
            return this.app.showToast("Veuillez remplir le nom, l'identifiant et le mot de passe.", "error");
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
                updatedAt: new Date().toISOString()
            };

            if (uploadedPhotoURL) payload.photoURL = uploadedPhotoURL;

            if (id) {
                await updateDoc(doc(db, "users", id), payload);
                this.app.showToast("Agent modifié avec succès.", "success");
            } else {
                // CRÉATION COMPLÈTE : Firebase Auth + Firestore
                const firebaseConfig = {
                    apiKey: "AIzaSyA255n3XWDRKaYZ9kwOYkfovf5lRexoCA4",
                    authDomain: "caisse-amt-perso.firebaseapp.com",
                    projectId: "caisse-amt-perso",
                    storageBucket: "caisse-amt-perso.firebasestorage.app",
                    messagingSenderId: "682789156997",
                    appId: "1:682789156997:web:9ce3303120851d37be91ec"
                };

                // Initialisation d'une app secondaire pour créer l'utilisateur sans déconnecter l'admin
                const secondaryApp = initializeApp(firebaseConfig, `secondary-auth-${Date.now()}`);
                const secondaryAuth = getAuth(secondaryApp);

                const userCred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
                const uid = userCred.user.uid;

                // Ajout des infos pour la fiche Firestore
                payload.active = true;
                payload.createdAt = new Date().toISOString();

                // Création de la fiche dans Firestore avec le même ID que l'authentification
                await setDoc(doc(db, "users", uid), payload);

                // Déconnexion et nettoyage de l'app secondaire
                await signOut(secondaryAuth);
                await deleteApp(secondaryApp);

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
                
                // Si on a l'email et le mot de passe, on se connecte en sous-marin pour le supprimer
                if (agentData.email && agentData.password) {
                    const firebaseConfig = {
                        apiKey: "AIzaSyA255n3XWDRKaYZ9kwOYkfovf5lRexoCA4",
                        authDomain: "caisse-amt-perso.firebaseapp.com",
                        projectId: "caisse-amt-perso",
                        storageBucket: "caisse-amt-perso.firebasestorage.app",
                        messagingSenderId: "682789156997",
                        appId: "1:682789156997:web:9ce3303120851d37be91ec"
                    };

                    const secondaryApp = initializeApp(firebaseConfig, `secondary-auth-del-${Date.now()}`);
                    const secondaryAuth = getAuth(secondaryApp);

                    try {
                        const userCred = await signInWithEmailAndPassword(secondaryAuth, agentData.email, agentData.password);
                        await deleteUser(userCred.user); // Supprime l'authentification Firebase !
                    } catch (authErr) {
                        console.warn("Impossible de supprimer l'Auth (compte déjà supprimé ou MDP changé) :", authErr);
                    } finally {
                        await deleteApp(secondaryApp);
                    }
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