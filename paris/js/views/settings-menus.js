import { db } from '../../../firebase-config.js';
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const SettingsMenusView = {
    docRef: null,
    currentRoleTab: 'agent',
    
    // Définition globale de tous les menus disponibles
    allMenus: [
        { key: 'main', label: 'Accueil' },
        { key: 'bilan', label: 'Bilan journalier' },
        { key: 'factures', label: 'Factures d\'envoi' },
        { key: 'rdv', label: 'Rendez-vous' },
        { key: 'operations', label: 'Les Programmes' },
        { key: 'devis', label: 'Devis' },
        { key: 'chargement', label: 'Chargement' },
        { key: 'scan', label: 'Scan' },
        { key: 'clients', label: 'Clients' },
        { key: 'comms', label: 'Communication' },
        { key: 'produits', label: 'Produits' },
        { key: 'finance', label: 'Finance' },
        { key: 'colis-recus', label: 'Colis reçus' },
        { key: 'stock', label: 'Stock' },
        { key: 'bilans-financiers', label: 'Bilans financiers' },
        { key: 'statistique', label: 'Statistiques' },
        { key: 'settings', label: 'Paramètres' },
        { key: 'configuration', label: 'Configuration' },
        { key: 'prospecting', label: 'Prospects' },
        { key: 'audit-log', label: 'Audit Log' }
    ],

    // Configuration par défaut
    config: {
        order: [], // Sera rempli avec les clés de allMenus
        roles: {
            agent: ['main', 'bilan', 'factures', 'rdv', 'operations', 'devis', 'chargement', 'scan', 'clients', 'comms', 'produits'],
            chauf: ['main', 'chargement', 'scan', 'operations'],
            manager: ['main', 'bilan', 'factures', 'finance', 'statistique', 'bilans-financiers', 'clients', 'stock']
        }
    },

    render(app) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.settingsMenus = this;

        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
        this.docRef = doc(db, "settings", `menus_${activeAgency}`);

        const html = `
            <style>
                .ma-page { max-width: 1200px; margin: 0 auto; animation: fadeIn 0.3s ease-in-out; }
                .ma-header { display: flex; align-items: center; gap: 15px; margin-bottom: 25px; background: white; padding: 20px 25px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; }
                .ma-header__icon { background: #fef2f2; color: #ef4444; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; border-radius: 12px; font-size: 24px; }
                .ma-header__title { margin: 0; color: #0f172a; font-size: 22px; font-weight: 800; }
                .ma-header__subtitle { margin: 4px 0 0 0; color: #64748b; font-size: 13px; }

                .ma-card { background: white; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.02); margin-bottom: 24px; overflow: hidden; }
                .ma-card__header { padding: 15px 20px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; background: #f8fafc; }
                .ma-card__title { font-size: 15px; font-weight: 700; color: #1e293b; display: flex; align-items: center; gap: 10px; }
                .ma-card__footer { padding: 15px 20px; border-top: 1px solid #e2e8f0; background: #f8fafc; display: flex; justify-content: flex-end; }

                .ma-btn { padding: 8px 16px; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer; transition: 0.2s; border: none; display: flex; align-items: center; gap: 6px; }
                .ma-btn--primary { background: #3b82f6; color: white; }
                .ma-btn--primary:hover { background: #2563eb; }
                .ma-btn--outline { background: white; border: 1px solid #cbd5e1; color: #475569; }
                .ma-btn--outline:hover { background: #f1f5f9; color: #0f172a; }

                /* Ordre des menus */
                .ma-order-list { padding: 10px; }
                .ma-order-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 15px; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 8px; background: white; transition: 0.2s; }
                .ma-order-row:hover { background: #f8fafc; border-color: #cbd5e1; }
                .ma-order-left { display: flex; align-items: center; gap: 12px; }
                .ma-order-grab { color: #94a3b8; cursor: grab; font-weight: bold; letter-spacing: 2px; }
                .ma-order-rank { background: #e2e8f0; color: #475569; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; border-radius: 50%; font-size: 11px; font-weight: bold; }
                .ma-order-label { font-weight: 600; color: #334155; font-size: 14px; }
                .ma-order-key { font-size: 11px; color: #94a3b8; font-family: monospace; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; }
                .ma-order-actions { display: flex; gap: 4px; }
                .ma-order-btn { background: #f1f5f9; border: 1px solid #e2e8f0; color: #475569; width: 28px; height: 28px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-weight: bold; }
                .ma-order-btn:hover:not(:disabled) { background: #e2e8f0; color: #0f172a; }
                .ma-order-btn:disabled { opacity: 0.3; cursor: not-allowed; }

                /* Badges de Rôle */
                .role-badge { padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 800; display: inline-block; letter-spacing: 0.5px; }
                .role-badge--admin { background: #fee2e2; color: #dc2626; }
                .role-badge--agent { background: #e0f2fe; color: #0284c7; }
                .role-badge--chauf { background: #f3e8ff; color: #7e22ce; }
                .role-badge--manag { background: #ffedd5; color: #ea580c; }

                /* Onglets Rôles */
                .ma-tabs { display: flex; gap: 10px; margin-bottom: 20px; overflow-x: auto; padding-bottom: 5px; }
                .ma-tab { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px 20px; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: 0.2s; white-space: nowrap; }
                .ma-tab:hover { background: #f8fafc; }
                .ma-tab--active { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.1); background: #eff6ff; }
                .ma-tab__label { font-weight: 700; color: #334155; font-size: 14px; }

                /* Grille des menus (Toggle) */
                .ma-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 15px; padding: 20px; }
                .ma-menu-card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 15px; display: flex; align-items: center; gap: 12px; transition: 0.2s; background: white; cursor: pointer; }
                .ma-menu-card:hover { border-color: #cbd5e1; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
                .ma-menu-card--active { border-color: #3b82f6; background: #f8fafc; }
                .ma-menu-card__info { flex: 1; }
                .ma-menu-card__label { font-weight: 700; color: #1e293b; font-size: 13px; margin-bottom: 2px; }
                .ma-menu-card__key { font-size: 10px; color: #94a3b8; font-family: monospace; text-transform: uppercase; }
                
                /* Switch Toggle */
                .ma-toggle { width: 44px; height: 24px; border-radius: 12px; background: #cbd5e1; position: relative; transition: 0.3s; flex-shrink: 0; }
                .ma-toggle--on { background: #10b981; }
                .ma-toggle__dot { width: 18px; height: 18px; background: white; border-radius: 50%; position: absolute; top: 3px; left: 3px; transition: 0.3s; box-shadow: 0 1px 2px rgba(0,0,0,0.2); }
                .ma-toggle--on .ma-toggle__dot { left: 23px; }

                /* Tableau Vue d'ensemble */
                .ma-table-wrap { overflow-x: auto; }
                .ma-table { width: 100%; border-collapse: collapse; }
                .ma-table th, .ma-table td { padding: 12px 15px; border-bottom: 1px solid #e2e8f0; text-align: center; }
                .ma-table th { background: #f8fafc; font-size: 12px; }
                .ma-table__menu-td { text-align: left !important; font-size: 13px; color: #1e293b; }
                
                .ma-check { font-weight: bold; font-size: 16px; }
                .ma-check--on { color: #10b981; }
                .ma-check--off { color: #ef4444; }
                
                .ma-check-btn { border: none; background: transparent; font-weight: bold; font-size: 16px; cursor: pointer; color: #cbd5e1; padding: 5px; border-radius: 5px; transition: 0.2s; }
                .ma-check-btn:hover { background: #f1f5f9; }
                .ma-check-btn--on { color: #10b981; }
                .ma-check-btn--on:hover { color: #ef4444; } /* Indique l'action inverse */
                .ma-check-btn--off { color: #ef4444; }
                .ma-check-btn--off:hover { color: #10b981; }
            </style>

            <div class="ma-page">
                <div class="ma-header">
                    <div class="ma-header__icon"><i class="fas fa-lock"></i></div>
                    <div>
                        <h1 class="ma-header__title">Gestion des menus</h1>
                        <p class="ma-header__subtitle">Configurez la visibilité et l'ordre des menus selon le rôle utilisateur</p>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 24px;">
                    
                    <!-- 1. ORDRE DES MENUS -->
                    <div class="ma-card">
                        <div class="ma-card__header">
                            <div class="ma-card__title">🧭 Ordre des menus sidebar</div>
                            <button class="ma-btn ma-btn--outline" onclick="window.app.views.settingsMenus.saveSettings()"><i class="fas fa-save"></i> Enregistrer</button>
                        </div>
                        <div class="ma-order-list" id="menuOrderList">
                            <div style="padding: 40px; text-align: center; color: #64748b;"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>
                        </div>
                    </div>

                    <!-- 2. GESTION DES ACCÈS -->
                    <div>
                        <div class="ma-tabs">
                            <button type="button" class="ma-tab" style="opacity: 0.7; cursor: not-allowed;" title="L'Administrateur a accès à tout par défaut">
                                <span class="role-badge role-badge--admin">ADMIN</span>
                                <span class="ma-tab__label">Admin</span>
                            </button>
                            <button type="button" class="ma-tab ${this.currentRoleTab === 'agent' ? 'ma-tab--active' : ''}" onclick="window.app.views.settingsMenus.switchTab('agent')">
                                <span class="role-badge role-badge--agent">AGENT</span>
                                <span class="ma-tab__label">Agent</span>
                            </button>
                            <button type="button" class="ma-tab ${this.currentRoleTab === 'chauf' ? 'ma-tab--active' : ''}" onclick="window.app.views.settingsMenus.switchTab('chauf')">
                                <span class="role-badge role-badge--chauf">CHAUF</span>
                                <span class="ma-tab__label">Chauffeur</span>
                            </button>
                            <button type="button" class="ma-tab ${this.currentRoleTab === 'manager' ? 'ma-tab--active' : ''}" onclick="window.app.views.settingsMenus.switchTab('manager')">
                                <span class="role-badge role-badge--manag">MANAG</span>
                                <span class="ma-tab__label">Manager</span>
                            </button>
                        </div>

                        <div class="ma-card">
                            <div class="ma-card__header">
                                <div class="ma-card__title" id="roleTitle">
                                    <span class="role-badge role-badge--${this.currentRoleTab === 'manager' ? 'manag' : this.currentRoleTab}">${this.currentRoleTab.toUpperCase()}</span>
                                    <span>Menus accessibles</span>
                                </div>
                            </div>
                            <div class="ma-grid" id="menuAccessGrid">
                                <!-- Rendu dynamique -->
                            </div>
                            <div class="ma-card__footer">
                                <button class="ma-btn ma-btn--primary" onclick="window.app.views.settingsMenus.saveSettings()">
                                    <i class="fas fa-save"></i> Sauvegarder les accès
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 3. VUE D'ENSEMBLE -->
                <div class="ma-card">
                    <div class="ma-card__header">
                        <div class="ma-card__title">👁️ Vue d'ensemble des permissions</div>
                    </div>
                    <div class="ma-table-wrap">
                        <table class="ma-table">
                            <thead>
                                <tr>
                                    <th style="text-align: left;">Menu</th>
                                    <th><span class="role-badge role-badge--admin">ADMIN</span></th>
                                    <th><span class="role-badge role-badge--agent">AGENT</span></th>
                                    <th><span class="role-badge role-badge--chauf">CHAUF</span></th>
                                    <th><span class="role-badge role-badge--manag">MANAG</span></th>
                                </tr>
                            </thead>
                            <tbody id="overviewTableBody">
                                <!-- Rendu dynamique -->
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('contentContainer').innerHTML = html;
        this.loadData();
    },

    async loadData() {
        try {
            const docSnap = await getDoc(this.docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                this.config.order = data.order || [];
                this.config.roles = { ...this.config.roles, ...data.roles };
            }

            // S'assurer que config.order contient bien tous les menus (au cas où des nouveaux ont été ajoutés dans le code)
            const existingKeys = new Set(this.config.order);
            this.allMenus.forEach(menu => {
                if (!existingKeys.has(menu.key)) {
                    this.config.order.push(menu.key);
                }
            });

            this.renderAll();
        } catch (error) {
            console.error("Erreur chargement menus:", error);
            this.app.showToast("Erreur lors du chargement de la configuration.", "error");
        }
    },

    renderAll() {
        this.renderOrderList();
        this.renderAccessGrid();
        this.renderOverviewTable();
    },

    renderOrderList() {
        const list = document.getElementById('menuOrderList');
        if (!list) return;

        let html = '';
        this.config.order.forEach((key, index) => {
            const menu = this.allMenus.find(m => m.key === key) || { key, label: 'Menu Inconnu' };
            const isFirst = index === 0;
            const isLast = index === this.config.order.length - 1;

            html += `
                <div class="ma-order-row" draggable="true">
                    <div class="ma-order-left">
                        <span class="ma-order-grab">⋮⋮</span>
                        <span class="ma-order-rank">${index + 1}</span>
                        <span class="ma-order-label">${menu.label}</span>
                        <span class="ma-order-key">${menu.key}</span>
                    </div>
                    <div class="ma-order-actions">
                        <button type="button" class="ma-order-btn" ${isFirst ? 'disabled' : ''} onclick="window.app.views.settingsMenus.moveUp(${index})">↑</button>
                        <button type="button" class="ma-order-btn" ${isLast ? 'disabled' : ''} onclick="window.app.views.settingsMenus.moveDown(${index})">↓</button>
                    </div>
                </div>
            `;
        });
        list.innerHTML = html;

        // --- AJOUT : LOGIQUE DRAG & DROP HTML5 ---
        const rows = list.querySelectorAll('.ma-order-row');
        let draggedIndex = null;

        rows.forEach((row, index) => {
            row.addEventListener('dragstart', (e) => {
                draggedIndex = index;
                e.dataTransfer.effectAllowed = 'move';
                setTimeout(() => row.style.opacity = '0.5', 0);
            });

            row.addEventListener('dragend', () => {
                row.style.opacity = '1';
                draggedIndex = null;
                rows.forEach(r => r.style.borderTop = '1px solid #e2e8f0');
            });

            row.addEventListener('dragover', (e) => {
                e.preventDefault(); // Nécessaire pour autoriser le drop
                e.dataTransfer.dropEffect = 'move';
                row.style.borderTop = '2px solid #3b82f6';
            });

            row.addEventListener('dragleave', () => {
                row.style.borderTop = '1px solid #e2e8f0';
            });

            row.addEventListener('drop', (e) => {
                e.preventDefault();
                row.style.borderTop = '1px solid #e2e8f0';
                if (draggedIndex !== null && draggedIndex !== index) {
                    const temp = this.config.order[draggedIndex];
                    this.config.order.splice(draggedIndex, 1);
                    this.config.order.splice(index, 0, temp);
                    this.renderAll();
                }
            });
        });
    },

    moveUp(index) {
        if (index > 0) {
            const temp = this.config.order[index];
            this.config.order[index] = this.config.order[index - 1];
            this.config.order[index - 1] = temp;
            this.renderAll();
        }
    },

    moveDown(index) {
        if (index < this.config.order.length - 1) {
            const temp = this.config.order[index];
            this.config.order[index] = this.config.order[index + 1];
            this.config.order[index + 1] = temp;
            this.renderAll();
        }
    },

    switchTab(role) {
        this.currentRoleTab = role;
        // Met à jour l'UI des onglets
        document.querySelectorAll('.ma-tab').forEach(tab => {
            tab.classList.remove('ma-tab--active');
            if (tab.getAttribute('onclick') && tab.getAttribute('onclick').includes(role)) {
                tab.classList.add('ma-tab--active');
            }
        });
        
        // Met à jour le titre
        const titleEl = document.getElementById('roleTitle');
        if (titleEl) {
            const badgeCls = role === 'manager' ? 'manag' : role;
            titleEl.innerHTML = `<span class="role-badge role-badge--${badgeCls}">${role.toUpperCase()}</span><span>Menus accessibles</span>`;
        }

        this.renderAccessGrid();
    },

    renderAccessGrid() {
        const grid = document.getElementById('menuAccessGrid');
        if (!grid) return;

        const activeRoleMenus = this.config.roles[this.currentRoleTab] || [];

        let html = '';
        this.config.order.forEach(key => {
            const menu = this.allMenus.find(m => m.key === key);
            if (!menu) return;
            
            const isActive = activeRoleMenus.includes(key);
            
            html += `
                <div class="ma-menu-card ${isActive ? 'ma-menu-card--active' : ''}" onclick="window.app.views.settingsMenus.toggleAccess('${key}', '${this.currentRoleTab}')">
                    <div class="ma-menu-card__toggle">
                        <div class="ma-toggle ${isActive ? 'ma-toggle--on' : ''}"><div class="ma-toggle__dot"></div></div>
                    </div>
                    <div class="ma-menu-card__info">
                        <div class="ma-menu-card__label">${menu.label}</div>
                        <div class="ma-menu-card__key">${menu.key}</div>
                    </div>
                </div>
            `;
        });
        grid.innerHTML = html;
    },

    toggleAccess(menuKey, role) {
        if (!this.config.roles[role]) this.config.roles[role] = [];
        const index = this.config.roles[role].indexOf(menuKey);
        
        if (index > -1) {
            this.config.roles[role].splice(index, 1); // Remove
        } else {
            this.config.roles[role].push(menuKey); // Add
        }
        
        this.renderAccessGrid();
        this.renderOverviewTable();
    },

    renderOverviewTable() {
        const tbody = document.getElementById('overviewTableBody');
        if (!tbody) return;

        let html = '';
        this.config.order.forEach(key => {
            const menu = this.allMenus.find(m => m.key === key);
            if (!menu) return;

            const isAgent = (this.config.roles.agent || []).includes(key);
            const isChauf = (this.config.roles.chauf || []).includes(key);
            const isManager = (this.config.roles.manager || []).includes(key);

            const getBtnHtml = (isActive, role) => `
                <button type="button" class="ma-check-btn ${isActive ? 'ma-check-btn--on' : 'ma-check-btn--off'}" 
                        onclick="window.app.views.settingsMenus.toggleAccess('${key}', '${role}')" 
                        title="${isActive ? 'Désactiver' : 'Activer'}">
                    ${isActive ? '✓' : '✗'}
                </button>
            `;

            html += `
                <tr>
                    <td class="ma-table__menu-td"><strong>${menu.label}</strong></td>
                    <td><span class="ma-check ma-check--on" title="Toujours actif">✓</span></td>
                    <td>${getBtnHtml(isAgent, 'agent')}</td>
                    <td>${getBtnHtml(isChauf, 'chauf')}</td>
                    <td>${getBtnHtml(isManager, 'manager')}</td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    },

    async saveSettings() {
        const btn = document.querySelector('.ma-btn--primary');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
        btn.disabled = true;

        try {
            await setDoc(this.docRef, this.config);
            this.app.showToast("Configuration des menus enregistrée avec succès !", "success");
            // Appliquer immédiatement les changements à la barre de navigation globale
            if (this.app && typeof this.app.applyMenuConfig === 'function') {
                this.app.applyMenuConfig(this.config);
            }
        } catch (error) {
            console.error("Erreur sauvegarde menus:", error);
            this.app.showToast("Erreur lors de l'enregistrement.", "error");
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
};