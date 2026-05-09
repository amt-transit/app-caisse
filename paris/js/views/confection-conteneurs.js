import { db } from '../../../firebase-config.js';
import { collection, query, where, onSnapshot, doc, updateDoc, writeBatch, setDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const ConfectionConteneursView = {
    unsubLivraisons: null,
    unsubContainers: null,
    livraisons: [],
    containers: [],
    selectedAvailableIds: new Set(),
    activeTabId: null,

    render(app) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.confectionConteneurs = this;
        this.selectedAvailableIds.clear();

        const html = `
            <style>
                .confection-page { max-width: 1400px; margin: 0 auto; animation: fadeIn 0.3s ease; }
                .confection-header { background: white; border-radius: 16px; padding: 20px 25px; margin-bottom: 20px; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
                .confection-header__content { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 15px; }
                .confection-header__left { display: flex; align-items: center; gap: 15px; }
                .confection-header__icon { font-size: 28px; background: #fffbeb; color: #f59e0b; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; border-radius: 12px; }
                .confection-header__title { margin: 0; font-size: 20px; font-weight: 800; color: #0f172a; }
                .confection-header__subtitle { margin: 2px 0 0 0; font-size: 13px; color: #64748b; }

                .confection-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
                @media (max-width: 992px) { .confection-grid { grid-template-columns: 1fr; } }

                .panel { background: white; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 2px 4px rgba(0,0,0,0.02); height: 650px; }
                .panel--bottom { grid-column: 1 / -1; height: auto; min-height: 300px; }
                
                .panel__header { padding: 15px 20px; display: flex; justify-content: space-between; align-items: center; color: white; }
                .panel__header--blue { background: #3b82f6; }
                .panel__header--orange { background: #f59e0b; }
                .panel__header--green { background: #10b981; }
                .panel__title { margin: 0; font-size: 16px; font-weight: 700; display: flex; align-items: center; gap: 10px; }
                .badge { background: rgba(255,255,255,0.25); padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; }

                .panel__toolbar { padding: 15px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; display: flex; justify-content: space-between; align-items: center; gap: 15px; flex-wrap: wrap; }
                .search-group { display: flex; flex: 1; min-width: 200px; }
                .search-input { width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px 0 0 6px; font-size: 13px; outline: none; }
                .search-input:focus { border-color: #3b82f6; }
                .btn-search { background: #3b82f6; color: white; border: none; padding: 0 12px; border-radius: 0 6px 6px 0; cursor: pointer; }
                
                .toolbar-actions { display: flex; gap: 8px; }
                .btn-sm { padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid transparent; transition: 0.2s; }
                .btn-sm--ghost { background: white; border-color: #cbd5e1; color: #475569; }
                .btn-sm--ghost:hover:not(:disabled) { background: #f1f5f9; color: #0f172a; }
                .btn-sm:disabled { opacity: 0.5; cursor: not-allowed; }

                .panel__body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; background: #f8fafc; padding: 10px; }
                .dossier-list, .ctn-dossier-list { display: flex; flex-direction: column; gap: 8px; }
                
                .dossier-item, .ctn-dossier-item { display: flex; align-items: center; padding: 12px; background: white; border: 1px solid #e2e8f0; border-radius: 10px; gap: 12px; transition: 0.2s; }
                .dossier-item:hover { border-color: #3b82f6; box-shadow: 0 2px 4px rgba(59,130,246,0.05); }
                
                .dossier-item__check input[type="checkbox"] { width: 18px; height: 18px; cursor: pointer; accent-color: #3b82f6; }
                .dossier-item__info, .ctn-dossier-item__info { flex: 1; min-width: 0; }
                
                .dossier-item__ref { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
                .status-icon { font-size: 10px; }
                .mono { font-family: monospace; font-weight: 800; color: #0f172a; font-size: 14px; }
                
                .dossier-item__meta, .ctn-dossier-item__meta { display: flex; flex-wrap: wrap; gap: 6px; }
                .meta-tag { font-size: 11px; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; color: #475569; font-weight: 600; white-space: nowrap; }
                .meta-tag--client { color: #0369a1; background: #e0f2fe; }
                .meta-tag--money { color: #166534; background: #dcfce7; }

                /* Onglets conteneurs */
                .ctn-tabs { display: flex; overflow-x: auto; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
                .ctn-tab { padding: 12px 20px; background: none; border: none; border-bottom: 3px solid transparent; font-weight: 700; color: #64748b; cursor: pointer; font-size: 14px; display: flex; align-items: center; gap: 8px; white-space: nowrap; }
                .ctn-tab--active { color: #f59e0b; border-bottom-color: #f59e0b; background: white; }
                .ctn-tab__count { background: #e2e8f0; color: #475569; padding: 2px 6px; border-radius: 10px; font-size: 11px; }
                .ctn-tab--active .ctn-tab__count { background: #fef3c7; color: #d97706; }

                /* Stats conteneur */
                .ctn-stats { display: flex; gap: 10px; margin-bottom: 15px; }
                .ctn-stat { flex: 1; background: white; border: 1px solid #e2e8f0; padding: 10px; border-radius: 8px; text-align: center; }
                .ctn-stat__label { font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 600; margin-bottom: 4px; }
                .ctn-stat__value { font-size: 18px; font-weight: 800; color: #0f172a; }

                /* Boutons actions conteneur */
                .ctn-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 15px; }
                .btn-action { flex: 1; min-width: 120px; padding: 10px; border-radius: 8px; font-weight: 700; font-size: 13px; cursor: pointer; border: 1px solid transparent; transition: 0.2s; display: flex; align-items: center; justify-content: center; gap: 6px; }
                .btn-action--add { background: #eff6ff; color: #2563eb; border-color: #bfdbfe; }
                .btn-action--add:hover:not(:disabled) { background: #dbeafe; }
                .btn-action--scan { background: white; color: #475569; border-color: #cbd5e1; }
                .btn-action--scan:hover { background: #f1f5f9; }
                .btn-action--danger { background: #fef2f2; color: #dc2626; border-color: #fecaca; }
                .btn-action--danger:hover { background: #fee2e2; }
                .btn-action--register { background: #10b981; color: white; }
                .btn-action--register:hover { background: #059669; }
                .btn-action:disabled { opacity: 0.5; cursor: not-allowed; }

                .btn-remove { background: #fef2f2; color: #ef4444; border: 1px solid #fecaca; width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-weight: bold; transition: 0.2s; }
                .btn-remove:hover { background: #fee2e2; }

                .reg-table { width: 100%; border-collapse: collapse; background: white; }
                .reg-table th { text-align: left; padding: 12px 15px; font-size: 12px; color: #64748b; border-bottom: 1px solid #e2e8f0; }
                .reg-table td { padding: 12px 15px; font-size: 13px; color: #334155; border-bottom: 1px solid #f1f5f9; }
            </style>

            <div class="confection-page">
                <div class="confection-header">
                    <div class="confection-header__content">
                        <div class="confection-header__left">
                            <div class="confection-header__icon">📦</div>
                            <div>
                                <h1 class="confection-header__title">Confection Conteneurs</h1>
                                <p class="confection-header__subtitle"><span id="headerCtnCount">0</span> conteneur(s) en confection — <span id="headerDossierCount">0</span> dossier(s) disponible(s)</p>
                            </div>
                        </div>
                        <button class="btn btn-outline" type="button" onclick="window.app.views.confectionConteneurs.loadData()">
                            <i class="fas fa-sync-alt"></i> Rafraîchir
                        </button>
                    </div>
                </div>

                <div class="confection-grid">
                    <!-- PANEL GAUCHE : DOSSIERS DISPONIBLES -->
                    <div class="panel panel--left">
                        <div class="panel__header panel__header--blue">
                            <h2 class="panel__title"><span>📋</span> Dossiers disponibles <span class="badge" id="leftBadge">0</span></h2>
                        </div>
                        <div class="panel__toolbar">
                            <div class="search-group">
                                <input class="search-input" id="leftSearch" placeholder="Rechercher référence, client…" oninput="window.app.views.confectionConteneurs.renderLeftPanel()">
                                <button class="btn-search" type="button">🔍</button>
                            </div>
                            <div class="toolbar-actions">
                                <button class="btn-sm btn-sm--ghost" type="button" onclick="window.app.views.confectionConteneurs.selectAllLeft(true)">Tout cocher</button>
                                <button class="btn-sm btn-sm--ghost" type="button" onclick="window.app.views.confectionConteneurs.selectAllLeft(false)">Décocher</button>
                            </div>
                        </div>
                        <div class="panel__body">
                            <div class="dossier-list" id="leftList">
                                <div style="text-align: center; padding: 40px; color: #64748b;"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>
                            </div>
                        </div>
                    </div>

                    <!-- PANEL DROIT : CONTENEUR EN CONFECTION -->
                    <div class="panel panel--right">
                        <div class="panel__header panel__header--orange">
                            <h2 class="panel__title"><span>🏗️</span> Conteneurs en confection <span class="badge badge--orange" id="rightBadge">0</span></h2>
                        </div>
                        <div class="ctn-tabs" id="rightTabs">
                            <!-- Tabs injectés ici -->
                        </div>
                        <div class="panel__body" style="background: white;">
                            <div class="ctn-stats" id="rightStats">
                                <div class="ctn-stat"><div class="ctn-stat__label">Référence</div><div class="ctn-stat__value mono">-</div></div>
                                <div class="ctn-stat"><div class="ctn-stat__label">Dossiers</div><div class="ctn-stat__value">0</div></div>
                                <div class="ctn-stat"><div class="ctn-stat__label">Total colis</div><div class="ctn-stat__value">0</div></div>
                                <div class="ctn-stat"><div class="ctn-stat__label">CA total</div><div class="ctn-stat__value">0</div></div>
                            </div>
                            <div class="ctn-actions">
                                <button class="btn-action btn-action--add" type="button" id="btnAddCtn" onclick="window.app.views.confectionConteneurs.addSelectedToContainer()" disabled>➕ Ajouter sélection</button>
                                <button class="btn-action btn-action--scan" type="button" onclick="window.app.renderPage('scan-container')">📡 Scan d'ajout</button>
                                <button class="btn-action btn-action--danger" type="button" onclick="window.app.views.confectionConteneurs.emptyActiveContainer()">🗑️ Vider</button>
                                <button class="btn-action btn-action--register" type="button" onclick="window.app.views.confectionConteneurs.registerContainer()">✅ Enregistrer</button>
                            </div>
                            <div class="ctn-dossier-list" id="rightList">
                                <!-- Liste injectée ici -->
                            </div>
                        </div>
                    </div>

                    <!-- PANEL BAS : CONTENEURS ENREGISTRÉS -->
                    <div class="panel panel--bottom">
                        <div class="panel__header panel__header--green">
                            <h2 class="panel__title"><span>✅</span> Conteneurs enregistrés (en attente de bateau) <span class="badge badge--green" id="bottomBadge">0</span></h2>
                        </div>
                        <div class="panel__body" style="padding: 0; background: white;">
                            <div class="table-wrap" style="overflow-x: auto;">
                                <table class="reg-table">
                                    <thead>
                                        <tr>
                                            <th>Référence</th>
                                            <th>Date création</th>
                                            <th>Date enregistrement</th>
                                            <th>Agent</th>
                                            <th style="text-align: center;">Dossiers</th>
                                            <th style="text-align: center;">Colis</th>
                                        </tr>
                                    </thead>
                                    <tbody id="bottomList">
                                        <tr><td colspan="6" style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</td></tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('contentContainer').innerHTML = html;
        this.loadData();
    },

    loadData() {
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';

        if (this.unsubLivraisons) this.unsubLivraisons();
        if (this.unsubContainers) this.unsubContainers();

        // Chargement des Conteneurs
        this.unsubContainers = onSnapshot(query(collection(db, "containers")), snap => {
            this.containers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            
            // Par défaut on sélectionne le premier "En chargement"
            const activeEnChargement = this.containers.filter(c => c.status === 'EN_CHARGEMENT');
            if (activeEnChargement.length > 0 && (!this.activeTabId || !activeEnChargement.find(c => c.id === this.activeTabId))) {
                this.activeTabId = activeEnChargement[0].id;
            } else if (activeEnChargement.length === 0) {
                this.activeTabId = null;
            }

            this.renderRightPanel();
            this.renderBottomPanel();
        });

        // Chargement des Livraisons
        this.unsubLivraisons = onSnapshot(query(collection(db, "livraisons"), where("agency", "==", activeAgency)), snap => {
            this.livraisons = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            this.renderLeftPanel();
            this.renderRightPanel(); // Car les stats dépendent des livraisons
        });
    },

    renderLeftPanel() {
        const search = (document.getElementById('leftSearch')?.value || '').toLowerCase().trim();
        
        // Filtre : Colis qui sont physiquement à Paris ET qui n'ont pas de conteneur assigné (ou container vide)
        let available = this.livraisons.filter(l => 
            (!l.conteneur || l.conteneur.trim() === '') && 
            (!l.containerStatus || l.containerStatus === 'PARIS' || l.containerStatus === 'EN_ATTENTE')
        );

        if (search) {
            available = available.filter(l => 
                (l.ref || '').toLowerCase().includes(search) || 
                (l.destinataire || '').toLowerCase().includes(search) ||
                (l.expediteur || '').toLowerCase().includes(search)
            );
        }

        document.getElementById('leftBadge').textContent = available.length;
        document.getElementById('headerDossierCount').textContent = available.length;

        const listEl = document.getElementById('leftList');
        if (available.length === 0) {
            listEl.innerHTML = `<div style="text-align: center; padding: 40px; color: #64748b;">Aucun dossier disponible à assigner.</div>`;
            return;
        }

        listEl.innerHTML = available.map(l => {
            const isChecked = this.selectedAvailableIds.has(l.id);
            return `
                <div class="dossier-item" onclick="window.app.views.confectionConteneurs.toggleItemSelection('${l.id}')">
                    <div class="dossier-item__check">
                        <input type="checkbox" value="${l.id}" ${isChecked ? 'checked' : ''} onclick="event.stopPropagation(); window.app.views.confectionConteneurs.toggleItemSelection('${l.id}')">
                    </div>
                    <div class="dossier-item__info">
                        <div class="dossier-item__ref"><span class="status-icon">🔵</span><span class="mono">${l.ref}</span></div>
                        <div class="dossier-item__meta">
                            <span class="meta-tag meta-tag--client">👤 ${l.destinataire || l.expediteur || 'Client'}</span>
                            <span class="meta-tag">📦 ${l.quantite || 1} colis</span>
                            <span class="meta-tag meta-tag--money">${l.prixOriginal || l.montant || '0 CFA'}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        this.updateAddButtonState();
    },

    toggleItemSelection(id) {
        if (this.selectedAvailableIds.has(id)) {
            this.selectedAvailableIds.delete(id);
        } else {
            this.selectedAvailableIds.add(id);
        }
        this.renderLeftPanel();
    },

    selectAllLeft(select) {
        const search = (document.getElementById('leftSearch')?.value || '').toLowerCase().trim();
        let available = this.livraisons.filter(l => (!l.conteneur || l.conteneur.trim() === '') && (!l.containerStatus || l.containerStatus === 'PARIS' || l.containerStatus === 'EN_ATTENTE'));
        if (search) available = available.filter(l => (l.ref || '').toLowerCase().includes(search) || (l.destinataire || '').toLowerCase().includes(search));

        if (select) {
            available.forEach(l => this.selectedAvailableIds.add(l.id));
        } else {
            this.selectedAvailableIds.clear();
        }
        this.renderLeftPanel();
    },

    updateAddButtonState() {
        const btn = document.getElementById('btnAddCtn');
        if (btn) {
            btn.disabled = this.selectedAvailableIds.size === 0 || !this.activeTabId;
            btn.textContent = `➕ Ajouter (${this.selectedAvailableIds.size})`;
        }
    },

    switchTab(containerId) {
        this.activeTabId = containerId;
        this.renderRightPanel();
        this.updateAddButtonState();
    },

    renderRightPanel() {
        const activeCtns = this.containers.filter(c => c.status === 'EN_CHARGEMENT');
        document.getElementById('rightBadge').textContent = activeCtns.length;
        document.getElementById('headerCtnCount').textContent = activeCtns.length;

        const tabsEl = document.getElementById('rightTabs');
        if (activeCtns.length === 0) {
            tabsEl.innerHTML = '<div style="padding: 12px 20px; color: #64748b;">Aucun conteneur en cours. Créez-en un dans "Gestion Conteneurs".</div>';
            document.getElementById('rightStats').innerHTML = '';
            document.getElementById('rightList').innerHTML = '';
            return;
        }

        tabsEl.innerHTML = activeCtns.map(c => {
            const isActive = c.id === this.activeTabId;
            const count = this.livraisons.filter(l => l.conteneur === c.id || l.conteneur === c.number).length;
            return `
                <button class="ctn-tab ${isActive ? 'ctn-tab--active' : ''}" onclick="window.app.views.confectionConteneurs.switchTab('${c.id}')">
                    ${c.number || c.id} <span class="ctn-tab__count">${count}</span>
                </button>
            `;
        }).join('');

        if (!this.activeTabId) return;
        
        const activeCtnObj = activeCtns.find(c => c.id === this.activeTabId);
        const ctnName = activeCtnObj ? (activeCtnObj.number || activeCtnObj.id) : '';

        // Colis dans ce conteneur
        const ctnItems = this.livraisons.filter(l => l.conteneur === ctnName);
        
        const totalColis = ctnItems.reduce((sum, item) => sum + (parseInt(item.quantite) || 1), 0);
        const totalCA = ctnItems.reduce((sum, item) => {
            return sum + (parseFloat(String(item.prixOriginal || item.montant || '0').replace(/[^\d]/g, '')) || 0);
        }, 0);

        document.getElementById('rightStats').innerHTML = `
            <div class="ctn-stat"><div class="ctn-stat__label">Référence</div><div class="ctn-stat__value mono">${ctnName}</div></div>
            <div class="ctn-stat"><div class="ctn-stat__label">Dossiers</div><div class="ctn-stat__value">${ctnItems.length}</div></div>
            <div class="ctn-stat"><div class="ctn-stat__label">Total colis</div><div class="ctn-stat__value">${totalColis}</div></div>
            <div class="ctn-stat"><div class="ctn-stat__label">CA total</div><div class="ctn-stat__value">${this.app.formatMoney(totalCA / 656)}</div></div>
        `;

        const listEl = document.getElementById('rightList');
        if (ctnItems.length === 0) {
            listEl.innerHTML = `<div style="text-align: center; padding: 30px; color: #94a3b8;">Conteneur vide. Ajoutez des dossiers depuis la liste de gauche.</div>`;
        } else {
            listEl.innerHTML = ctnItems.map(l => `
                <div class="ctn-dossier-item">
                    <div class="ctn-dossier-item__info">
                        <div class="ctn-dossier-item__ref mono">${l.ref}</div>
                        <div class="ctn-dossier-item__meta">
                            <span class="meta-tag meta-tag--client">👤 ${l.destinataire || l.expediteur || 'Client'}</span>
                            <span class="meta-tag">📦 ${l.quantite || 1} colis</span>
                            <span class="meta-tag meta-tag--money">${l.prixOriginal || l.montant || '0 CFA'}</span>
                        </div>
                    </div>
                    <button class="btn-remove" type="button" title="Retirer du conteneur" onclick="window.app.views.confectionConteneurs.removeFromContainer('${l.id}')">✕</button>
                </div>
            `).join('');
        }
    },

    renderBottomPanel() {
        const tbody = document.getElementById('bottomList');
        const regCtns = this.containers.filter(c => c.status === 'EN_ATTENTE_BATEAU');
        
        document.getElementById('bottomBadge').textContent = regCtns.length;

        if (regCtns.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px; color: #64748b;">Aucun conteneur en attente de bateau.</td></tr>';
            return;
        }

        tbody.innerHTML = regCtns.map(c => {
            const items = this.livraisons.filter(l => l.conteneur === (c.number || c.id));
            const totalColis = items.reduce((sum, item) => sum + (parseInt(item.quantite) || 1), 0);

            return `
                <tr>
                    <td class="mono" style="font-weight: 800; color: #0f172a;">${c.number || c.id}</td>
                    <td>${c.createdAt ? new Date(c.createdAt).toLocaleString('fr-FR') : '-'}</td>
                    <td style="color: #10b981; font-weight: 600;">${c.registeredAt ? new Date(c.registeredAt).toLocaleString('fr-FR') : '-'}</td>
                    <td style="color: #475569;">${sessionStorage.getItem('userName') || 'Agent'}</td>
                    <td style="text-align: center; font-weight: bold;">${items.length}</td>
                    <td style="text-align: center;"><span class="badge" style="background:#e0f2fe; color:#0369a1;">📦 ${totalColis}</span></td>
                </tr>
            `;
        }).join('');
    },

    async addSelectedToContainer() {
        if (this.selectedAvailableIds.size === 0 || !this.activeTabId) return;
        
        const activeCtnObj = this.containers.find(c => c.id === this.activeTabId);
        const ctnName = activeCtnObj ? (activeCtnObj.number || activeCtnObj.id) : '';

        const batch = writeBatch(db);
        this.selectedAvailableIds.forEach(id => {
            batch.update(doc(db, "livraisons", id), {
                conteneur: ctnName,
                containerStatus: 'A_VENIR' // Bascule en attente bateau/transit
            });
        });

        try {
            await batch.commit();
            this.app.showToast(`${this.selectedAvailableIds.size} dossier(s) ajouté(s) au conteneur ${ctnName}.`, "success");
            this.selectedAvailableIds.clear();
        } catch(e) {
            this.app.showToast("Erreur lors de l'ajout.", "error");
        }
    },

    async removeFromContainer(livraisonId) {
        try {
            await updateDoc(doc(db, "livraisons", livraisonId), {
                conteneur: '',
                containerStatus: 'PARIS' // Retour à la case départ
            });
            this.app.showToast("Dossier retiré du conteneur.", "info");
        } catch(e) {
            this.app.showToast("Erreur lors du retrait.", "error");
        }
    },

    async emptyActiveContainer() {
        if (!this.activeTabId) return;
        if (window.AppModal) {
            if (!await window.AppModal.confirm("Voulez-vous vraiment vider entièrement ce conteneur ?", "Vider le conteneur", true)) return;
        } else if (!confirm("Vider le conteneur ?")) return;

        const activeCtnObj = this.containers.find(c => c.id === this.activeTabId);
        const ctnName = activeCtnObj ? (activeCtnObj.number || activeCtnObj.id) : '';
        const items = this.livraisons.filter(l => l.conteneur === ctnName);

        const batch = writeBatch(db);
        items.forEach(l => {
            batch.update(doc(db, "livraisons", l.id), { conteneur: '', containerStatus: 'PARIS' });
        });

        await batch.commit();
        this.app.showToast("Conteneur vidé.", "success");
    },

    async registerContainer() {
        if (!this.activeTabId) return;
        
        const activeCtnObj = this.containers.find(c => c.id === this.activeTabId);
        const ctnName = activeCtnObj ? (activeCtnObj.number || activeCtnObj.id) : '';
        const items = this.livraisons.filter(l => l.conteneur === ctnName);

        if (items.length === 0) {
            this.app.showToast("Le conteneur est vide.", "error");
            return;
        }

        if (window.AppModal) {
            if (!await window.AppModal.confirm(`Verrouiller et enregistrer le conteneur ${ctnName} avec ses ${items.length} dossiers ?\n\nIl passera en attente de départ (bateau) et un NOUVEAU conteneur sera automatiquement activé pour les prochaines factures.`, "Enregistrer le conteneur")) return;
        } else if (!confirm(`Enregistrer le conteneur ${ctnName} et passer au suivant ?`)) return;

        try {
            // 1. Verrouiller le conteneur actuel
            await updateDoc(doc(db, "containers", this.activeTabId), {
                status: 'EN_ATTENTE_BATEAU',
                registeredAt: new Date().toISOString()
            });

            // 2. Calculer le nom du prochain conteneur (ex: E15 -> E16, D09 -> D10)
            let nextCtnName = ctnName;
            const match = ctnName.match(/^(.*?)(\d+)$/);
            if (match) {
                const prefix = match[1];
                const numStr = match[2];
                const nextNum = parseInt(numStr, 10) + 1;
                nextCtnName = prefix + String(nextNum).padStart(numStr.length, '0');
            } else {
                nextCtnName = ctnName + "-SUIVANT"; // Fallback de sécurité si le nom ne finit pas par un chiffre
            }

            // 3. Mettre à jour le Conteneur Actif globalement
            const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
            await setDoc(doc(db, "settings", `container_config_${activeAgency}`), { activeContainer: nextCtnName }, { merge: true });

            this.app.showToast(`Conteneur ${ctnName} enregistré ! Le nouveau conteneur en cours est ${nextCtnName}.`, "success");
            this.activeTabId = null; // Réinitialise la sélection
        } catch(e) {
            console.error(e);
            this.app.showToast("Erreur lors de l'enregistrement.", "error");
        }
    }
};