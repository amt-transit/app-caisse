import { db } from '../../../firebase-config.js';
import { collection, query, onSnapshot, doc, setDoc, updateDoc, deleteDoc, writeBatch, getDocs, where, deleteField } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const BateauxDepartView = {
    unsubBoats: null,
    unsubContainers: null,
    unsubLivraisons: null,
    containers: [],
    boats: [],
    livraisons: [],
    selectedContainerIds: new Set(),
    editingBoatId: null,

    render(app) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.bateauxDepart = this;
        this.selectedContainerIds.clear();

        const html = `
            <style>
                .departs-page { max-width: 1400px; margin: 0 auto; animation: fadeIn 0.3s ease; }
                .departs-header { background: white; border-radius: 16px; padding: 20px 25px; margin-bottom: 20px; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
                .departs-header__content { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 15px; }
                .departs-header__left { display: flex; align-items: center; gap: 15px; }
                .departs-header__icon { font-size: 28px; background: #e0f2fe; color: #0284c7; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; border-radius: 12px; }
                .departs-header__title { margin: 0; font-size: 20px; font-weight: 800; color: #0f172a; }
                .departs-header__subtitle { margin: 2px 0 0 0; font-size: 13px; color: #64748b; }

                .departs-grid { display: grid; grid-template-columns: 1fr 1.2fr; gap: 20px; margin-bottom: 20px; }
                @media (max-width: 992px) { .departs-grid { grid-template-columns: 1fr; } }

                .panel { background: white; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 2px 4px rgba(0,0,0,0.02); height: 650px; }
                .panel--bottom { grid-column: 1 / -1; height: auto; min-height: 300px; }
                
                 .panel__header { padding: 15px 20px; display: flex; justify-content: space-between; align-items: center; color: white; }
                .panel__header--blue { background: #3b82f6; }
                .panel__header--navy { background: #1e293b; }
                .panel__header--green { background: #10b981; }
                .panel__title { margin: 0; font-size: 16px; font-weight: 700; display: flex; align-items: center; gap: 10px; }
                .badge { background: rgba(255,255,255,0.25); padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; }

                .panel__toolbar { padding: 15px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; display: flex; justify-content: space-between; align-items: center; gap: 15px; }
                .toolbar-actions { display: flex; gap: 8px; }
                .btn-sm { padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid transparent; transition: 0.2s; }
                .btn-sm--ghost { background: white; border-color: #cbd5e1; color: #475569; }
                .btn-sm--ghost:hover:not(:disabled) { background: #f1f5f9; color: #0f172a; }
                .btn-sm:disabled { opacity: 0.5; cursor: not-allowed; }
                
                .panel__body { flex: 1; overflow-y: auto; background: #f8fafc; padding: 15px; }

                /* Listes Conteneurs Dispos */
                .conteneur-list { display: flex; flex-direction: column; gap: 10px; }
                .conteneur-item { display: flex; align-items: center; padding: 12px 15px; background: white; border: 1px solid #e2e8f0; border-radius: 10px; gap: 12px; transition: 0.2s; cursor: pointer; }
                .conteneur-item:hover { border-color: #3b82f6; box-shadow: 0 2px 4px rgba(59,130,246,0.05); }
                .conteneur-item__check input { width: 18px; height: 18px; cursor: pointer; accent-color: #3b82f6; }
                .conteneur-item__info { flex: 1; }
                .conteneur-item__ref { margin-bottom: 6px; }
                .mono { font-family: monospace; font-weight: 800; color: #0f172a; font-size: 15px; }
                .conteneur-item__meta { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
                .meta-tag { font-size: 11px; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; color: #475569; font-weight: 600; }
                .meta-tag--date { color: #0369a1; background: #e0f2fe; }
                .conteneur-item__admin { font-size: 11px; color: #64748b; font-weight: 600; display: flex; align-items: center; gap: 4px; }

                /* Grille Bateaux */
                .bt-cards-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 15px; }
                .bt-card { background: white; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.02); display: flex; flex-direction: column; }
                .bt-card__header { padding: 12px 15px; background: #1e293b; color: white; border-radius: 12px 12px 0 0; display: flex; justify-content: space-between; align-items: center; }
                .bt-card__ref { font-size: 14px; color: white; }
                .bt-card__count { background: rgba(255,255,255,0.2); font-size: 11px; padding: 2px 8px; border-radius: 10px; font-weight: bold; }
                .bt-card__body { padding: 15px; flex: 1; }
                .bt-card__ctn-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 15px; max-height: 150px; overflow-y: auto; }
                .bt-card__ctn-item { display: flex; justify-content: space-between; align-items: center; background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 10px; border-radius: 8px; }
                .bt-card__ctn-ref { font-size: 13px; }
                .bt-card__ctn-meta { font-size: 11px; color: #64748b; margin-left: 10px; }
                .btn-remove--sm { width: 24px; height: 24px; font-size: 10px; border: 1px solid #fecaca; background: #fef2f2; color: #ef4444; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
                .btn-remove--sm:hover { background: #fee2e2; }
                .bt-card__info-row { display: flex; flex-wrap: wrap; gap: 6px; }
                .bt-card__info-tag { font-size: 10px; background: #f1f5f9; color: #475569; padding: 4px 8px; border-radius: 4px; font-weight: 600; border: 1px solid #e2e8f0; }
                
                .bt-card__footer { padding: 10px 15px; border-top: 1px solid #e2e8f0; display: flex; gap: 6px; background: #f8fafc; border-radius: 0 0 12px 12px; flex-wrap: wrap;}
                .btn-action { flex: 1; padding: 6px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; cursor: pointer; border: 1px solid transparent; display: flex; align-items: center; justify-content: center; transition: 0.2s; }
                .btn-action--add { background: #eff6ff; color: #2563eb; border-color: #bfdbfe; }
                .btn-action--add:hover:not(:disabled) { background: #dbeafe; }
                .btn-action--register { background: #10b981; color: white; }
                .btn-action--register:hover { background: #059669; }
                .btn-action--edit { flex: 0 0 32px; background: white; border-color: #cbd5e1; color: #475569; }
                .btn-action--edit:hover { background: #f1f5f9; color: #0f172a; }
                .btn-action--danger { flex: 0 0 32px; background: #fef2f2; color: #ef4444; border-color: #fecaca; }
                .btn-action--danger:hover { background: #fee2e2; }
                .btn-action:disabled { opacity: 0.5; cursor: not-allowed; }

                .new-bateau-form { background: white; border: 1px dashed #cbd5e1; border-radius: 12px; padding: 15px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center; }
                .form-title { font-weight: 700; color: #1e293b; font-size: 14px; }
                .form-hint { font-size: 11px; color: #64748b; margin-top: 2px; }
                .btn-create { background: #1e293b; color: white; border: none; padding: 8px 16px; border-radius: 8px; font-weight: 600; font-size: 12px; cursor: pointer; transition: 0.2s; }
                .btn-create:hover { background: #0f172a; }

                /* Tableau Bateaux Enregistrés */
                .table-wrap { overflow-x: auto; }
                .reg-table { width: 100%; border-collapse: collapse; }
                .reg-table th { text-align: left; padding: 12px 15px; background: white; font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; }
                .reg-table td { padding: 12px 15px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #334155; vertical-align: middle; }
                .reg-table tr:hover td { background: #f8fafc; }
                .status-badge { padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; }
                .status-badge--valid { background: #e0f2fe; color: #0284c7; border: 1px solid #bae6fd; }
                .status-badge--arrived { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
                
                /* Modals */
                .bd-modal { display:none; position:fixed; z-index:9999; left:0; top:0; width:100%; height:100%; background:rgba(15,23,42,0.6); backdrop-filter: blur(4px); align-items:center; justify-content:center; }
                .bd-modal.active { display:flex; animation: fadeIn 0.2s; }
                .bd-modal-box { background: white; border-radius: 16px; display: flex; flex-direction: column; width: 90%; max-width: 500px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); overflow: hidden; }
                .bd-modal-header { padding: 20px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; display: flex; justify-content: space-between; align-items: center; }
                .bd-modal-title { margin: 0; font-size: 18px; font-weight: 800; color: #0f172a; }
                .bd-modal-body { padding: 20px; }
                .bd-modal-footer { padding: 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 10px; background: #f8fafc; }
            </style>

            <div class="departs-page">
                <div class="departs-header">
                    <div class="departs-header__content">
                        <div class="departs-header__left">
                            <div class="departs-header__icon">🚢</div>
                            <div>
                                <h1 class="departs-header__title">Bateaux Départs</h1>
                                <p class="departs-header__subtitle"><span id="headBoatsCount">0</span> bateau(x) en confection — <span id="headCtnCount">0</span> conteneur(s) à embarquer</p>
                            </div>
                        </div>
                        <div class="departs-header__actions">
                            <button class="btn btn-outline" type="button" onclick="window.app.views.bateauxDepart.loadData()"><i class="fas fa-sync-alt"></i> Rafraîchir</button>
                        </div>
                    </div>
                </div>

                <div class="departs-grid">
                    <!-- GAUCHE : CONTENEURS DISPOS -->
                    <div class="panel panel--left">
                        <div class="panel__header panel__header--blue">
                            <h2 class="panel__title"><span>📦</span> Conteneurs disponibles <span class="badge" id="leftBadge">0</span></h2>
                        </div>
                        <div class="panel__toolbar">
                            <div class="toolbar-actions">
                                <button class="btn-sm btn-sm--ghost" type="button" onclick="window.app.views.bateauxDepart.selectAllLeft(true)">Tout cocher</button>
                                <button class="btn-sm btn-sm--ghost" type="button" onclick="window.app.views.bateauxDepart.selectAllLeft(false)">Décocher</button>
                            </div>
                        </div>
                        <div class="panel__body">
                            <div class="conteneur-list" id="availableContainersList">
                                <div style="text-align: center; padding: 40px; color: #64748b;"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>
                            </div>
                        </div>
                    </div>

                    <!-- DROITE : BATEAUX EN CONFECTION -->
                    <div class="panel panel--right">
                        <div class="panel__header panel__header--navy">
                            <h2 class="panel__title"><span>🚢</span> Bateaux en confection <span class="badge badge--navy" id="rightBadge">0</span></h2>
                        </div>
                        <div class="panel__body">
                            <div class="new-bateau-form">
                                <div>
                                    <div class="form-title">➕ Nouveau Bateau</div>
                                    <div class="form-hint">Cliquez sur Créer pour ouvrir le formulaire</div>
                                </div>
                                <button class="btn-create" type="button" onclick="window.app.views.bateauxDepart.openBoatModal()">➕ Créer</button>
                            </div>
                            
                            <div class="bt-cards-grid" id="confectionBoatsList">
                                <!-- Injecté via JS -->
                            </div>
                        </div>
                    </div>
                </div>

                <!-- BAS : BATEAUX ENREGISTRÉS -->
                <div class="panel panel--bottom">
                    <div class="panel__header panel__header--green">
                        <h2 class="panel__title"><span>✅</span> Bateaux enregistrés <span class="badge badge--green" id="bottomBadge">0</span></h2>
                    </div>
                    <div class="panel__body" style="padding: 0;">
                        <div class="table-wrap">
                            <table class="reg-table">
                                <thead>
                                    <tr>
                                        <th>Référence</th>
                                        <th>Date départ</th>
                                        <th>Date arrivée</th>
                                        <th>Compagnie</th>
                                        <th>Navire</th>
                                        <th>Conteneurs</th>
                                        <th>Enregistré le</th>
                                        <th style="text-align: center;">Statut</th>
                                        <th style="text-align: right;">Actions</th>
                                    </tr>
                                </thead>
                                <tbody id="registeredBoatsList">
                                    <tr><td colspan="9" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <!-- MODAL BATEAU -->
            <div id="boatModal" class="bd-modal">
                <div class="bd-modal-box">
                    <div class="bd-modal-header">
                        <h2 class="bd-modal-title" id="bmTitle">Nouveau Bateau</h2>
                        <button class="icon-btn" onclick="window.app.views.bateauxDepart.closeBoatModal()" style="background:none; border:none; font-size:24px; cursor:pointer; color:#64748b;">&times;</button>
                    </div>
                    <div class="bd-modal-body">
                        <div class="form-group" style="margin-bottom: 15px;">
                            <label style="font-size: 12px; font-weight: 600; color: #475569; display: block; margin-bottom: 6px;">Référence bateau *</label>
                            <input type="text" id="bmRef" class="filter-input" placeholder="Générée automatiquement si vide" style="width: 100%; box-sizing: border-box;">
                        </div>
                        <div class="form-group" style="margin-bottom: 15px;">
                            <label style="font-size: 12px; font-weight: 600; color: #475569; display: block; margin-bottom: 6px;">Compagnie maritime *</label>
                            <input type="text" id="bmCompany" class="filter-input" placeholder="Ex: MSC, CMA CGM..." style="width: 100%; box-sizing: border-box;">
                        </div>
                        <div class="form-group" style="margin-bottom: 15px;">
                            <label style="font-size: 12px; font-weight: 600; color: #475569; display: block; margin-bottom: 6px;">Nom du navire (ou N° Vol)</label>
                            <input type="text" id="bmName" class="filter-input" placeholder="Ex: MSC KATYAYNI" style="width: 100%; box-sizing: border-box;">
                        </div>
                        <div style="display: flex; gap: 15px; margin-bottom: 15px;">
                            <div class="form-group" style="flex: 1;">
                                <label style="font-size: 12px; font-weight: 600; color: #475569; display: block; margin-bottom: 6px;">Date Départ prévue</label>
                                <input type="date" id="bmDepDate" class="filter-input" style="width: 100%; box-sizing: border-box;">
                            </div>
                            <div class="form-group" style="flex: 1;">
                                <label style="font-size: 12px; font-weight: 600; color: #475569; display: block; margin-bottom: 6px;">Date Arrivée (ETA)</label>
                                <input type="date" id="bmArrDate" class="filter-input" style="width: 100%; box-sizing: border-box;">
                            </div>
                        </div>
                    </div>
                    <div class="bd-modal-footer">
                        <button class="btn btn-outline" onclick="window.app.views.bateauxDepart.closeBoatModal()">Annuler</button>
                        <button class="btn btn-primary" onclick="window.app.views.bateauxDepart.saveBoat()"><i class="fas fa-save"></i> Enregistrer</button>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('contentContainer').innerHTML = html;
        this.loadData();
    },

    loadData() {
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
        
        if (this.unsubContainers) this.unsubContainers();
        if (this.unsubBoats) this.unsubBoats();
        if (this.unsubLivraisons) this.unsubLivraisons();

        // Chargement des bateaux
        this.unsubBoats = onSnapshot(query(collection(db, "boats")), snap => {
            this.boats = snap.docs.map(d => ({id: d.id, ...d.data()}));
            this.renderAll();
        });
        
        // Chargement des conteneurs
        this.unsubContainers = onSnapshot(query(collection(db, "containers")), snap => {
            this.containers = snap.docs.map(d => ({id: d.id, ...d.data()}));
            this.renderAll();
        });

        // Chargement des livraisons (Pour compter les dossiers)
        this.unsubLivraisons = onSnapshot(query(collection(db, "livraisons"), where("agency", "==", activeAgency)), snap => {
            this.livraisons = snap.docs.map(d => ({id: d.id, ...d.data()}));
            this.renderAll();
        });
    },

    renderAll() {
        this.renderAvailableContainers();
        this.renderConfectionBoats();
        this.renderRegisteredBoats();
    },

    renderAvailableContainers() {
        const list = document.getElementById('availableContainersList');
        if (!list) return;

        // Conteneurs enregistrés (finis) MAIS pas encore assignés à un bateau
        const available = this.containers.filter(c => c.status === 'EN_ATTENTE_BATEAU' && !c.boatId);
        
        document.getElementById('leftBadge').textContent = available.length;
        document.getElementById('headCtnCount').textContent = available.length;

        if (available.length === 0) {
            list.innerHTML = '<div style="text-align: center; padding: 30px; color: #64748b;">Aucun conteneur en attente de départ.</div>';
            return;
        }

        list.innerHTML = available.map(c => {
            const isChecked = this.selectedContainerIds.has(c.id);
            // Compter les dossiers dans ce conteneur
            const ctnName = c.number || c.id;
            const dossiersCount = this.livraisons.filter(l => l.conteneur === ctnName).length;

            return `
                <div class="conteneur-item" onclick="window.app.views.bateauxDepart.toggleSelection('${c.id}')">
                    <div class="conteneur-item__check">
                        <input type="checkbox" value="${c.id}" ${isChecked ? 'checked' : ''} onclick="event.stopPropagation(); window.app.views.bateauxDepart.toggleSelection('${c.id}')">
                    </div>
                    <div class="conteneur-item__info">
                        <div class="conteneur-item__ref"><span class="mono">${ctnName}</span></div>
                        <div class="conteneur-item__meta">
                            <span class="meta-tag">📋 ${dossiersCount} dossier(s)</span>
                            <span class="meta-tag meta-tag--date">${c.registeredAt ? new Date(c.registeredAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Date inconnue'}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    toggleSelection(id) {
        if (this.selectedContainerIds.has(id)) {
            this.selectedContainerIds.delete(id);
        } else {
            this.selectedContainerIds.add(id);
        }
        this.renderAll();
    },

    selectAllLeft(select) {
        const available = this.containers.filter(c => c.status === 'EN_ATTENTE_BATEAU' && !c.boatId);
        if (select) {
            available.forEach(c => this.selectedContainerIds.add(c.id));
        } else {
            this.selectedContainerIds.clear();
        }
        this.renderAll();
    },

    renderConfectionBoats() {
        const grid = document.getElementById('confectionBoatsList');
        if (!grid) return;

        const confBoats = this.boats.filter(b => b.status === 'EN_CONFECTION').sort((a,b) => new Date(b.createdAt||0) - new Date(a.createdAt||0));
        
        document.getElementById('rightBadge').textContent = confBoats.length;
        document.getElementById('headBoatsCount').textContent = confBoats.length;

        if (confBoats.length === 0) {
            grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 30px; color: #64748b;">Aucun bateau en cours de confection.</div>';
            return;
        }

        const hasSelection = this.selectedContainerIds.size > 0;

        grid.innerHTML = confBoats.map(b => {
            const boatCtns = this.containers.filter(c => c.boatId === b.id);
            
            let ctnsHtml = boatCtns.length > 0 ? boatCtns.map(c => {
                const ctnName = c.number || c.id;
                const dossiersCount = this.livraisons.filter(l => l.conteneur === ctnName).length;
                return `
                    <div class="bt-card__ctn-item">
                        <div class="bt-card__ctn-info">
                            <span class="bt-card__ctn-ref mono">${ctnName}</span>
                            <span class="bt-card__ctn-meta">📋 ${dossiersCount} dos.</span>
                        </div>
                        <button class="btn-remove btn-remove--sm" type="button" title="Retirer du bateau" onclick="window.app.views.bateauxDepart.removeFromBoat('${c.id}')">✕</button>
                    </div>
                `;
            }).join('') : '<div style="font-size:12px; color:#94a3b8; font-style:italic; padding:5px 0;">Aucun conteneur</div>';
                
            return `
                <div class="bt-card">
                    <div class="bt-card__header">
                        <div class="bt-card__ref mono">${b.reference}</div>
                        <span class="bt-card__count">${boatCtns.length} ctn</span>
                    </div>
                    <div class="bt-card__body">
                        <div class="bt-card__ctn-list">
                            ${ctnsHtml}
                        </div>
                        <div class="bt-card__info-row">
                            <span class="bt-card__info-tag">📅 Dép. ${b.departureDate ? new Date(b.departureDate).toLocaleDateString('fr-FR') : '-'}</span>
                            <span class="bt-card__info-tag">📆 Arr. ${b.arrivalDate ? new Date(b.arrivalDate).toLocaleDateString('fr-FR') : '-'}</span>
                            <span class="bt-card__info-tag">⚓ ${b.company || '-'}</span>
                            <span class="bt-card__info-tag">👤 ${b.name || '-'}</span>
                        </div>
                    </div>
                    <div class="bt-card__footer">
                        <button class="btn-action btn-action--add" type="button" ${!hasSelection ? 'disabled' : ''} onclick="window.app.views.bateauxDepart.addToBoat('${b.id}')">➕ Ajouter (${this.selectedContainerIds.size})</button>
                        <button class="btn-action btn-action--register" type="button" onclick="window.app.views.bateauxDepart.registerBoat('${b.id}')">✅ Enregistrer</button>
                        <button class="btn-action btn-action--edit" type="button" title="Modifier infos bateau" onclick="window.app.views.bateauxDepart.openBoatModal('${b.id}')">✎</button>
                        <button class="btn-action btn-action--danger" type="button" title="Supprimer ce bateau" onclick="window.app.views.bateauxDepart.deleteBoat('${b.id}')">🗑</button>
                    </div>
                </div>
            `;
        }).join('');
    },

    renderRegisteredBoats() {
        const tbody = document.getElementById('registeredBoatsList');
        if (!tbody) return;

        const regBoats = this.boats.filter(b => b.status === 'ENREGISTRE' || b.status === 'ARRIVE').sort((a,b) => new Date(b.registeredAt||0) - new Date(a.registeredAt||0));
        
        document.getElementById('bottomBadge').textContent = regBoats.length;

        if (regBoats.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 40px; color: #64748b;">Aucun bateau en mer pour le moment.</td></tr>';
            return;
        }

        tbody.innerHTML = regBoats.map(b => {
            const isArrived = b.status === 'ARRIVE';
            const statusBadge = isArrived ? '<span class="status-badge status-badge--arrived">✅ À quai</span>' : '<span class="status-badge status-badge--valid">🌊 En mer</span>';
            
            // Noms des conteneurs
            const boatCtns = this.containers.filter(c => c.boatId === b.id);
            const ctnNames = boatCtns.map(c => c.number || c.id).join(' / ');

            let actionBtn = isArrived ? 
                `<span style="color:#94a3b8; font-size:12px; font-weight:600;">Terminé</span>` : 
                `<button class="btn-sm" style="background:#10b981; color:white; border:none;" onclick="window.app.views.bateauxDepart.marquerArrive('${b.id}')">⚓ Marquer arrivé</button>`;

            return `
                <tr>
                    <td class="mono" style="font-weight: 800;">${b.reference}</td>
                    <td class="mono">${b.departureDate ? new Date(b.departureDate).toLocaleDateString('fr-FR') : '-'}</td>
                    <td class="mono">${b.arrivalDate ? new Date(b.arrivalDate).toLocaleDateString('fr-FR') : '-'}</td>
                    <td>${b.company || '-'}</td>
                    <td class="mono">${b.name || '-'}</td>
                    <td class="mono" style="max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${ctnNames}">${ctnNames || '-'}</td>
                    <td class="mono">${b.registeredAt ? new Date(b.registeredAt).toLocaleDateString('fr-FR') : '-'}</td>
                    <td style="text-align: center;">${statusBadge}</td>
                    <td style="text-align: right;">
                        <div style="display:flex; gap:6px; justify-content:flex-end;">
                            ${!isArrived ? `<button class="btn-sm btn-sm--ghost" style="color:#ef4444;" onclick="window.app.views.bateauxDepart.unRegisterBoat('${b.id}')" title="Annuler le départ">↩</button>` : ''}
                            ${actionBtn}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    },

    openBoatModal(boatId = null) {
        this.editingBoatId = boatId;
        const modal = document.getElementById('boatModal');
        
        if (boatId) {
            const boat = this.boats.find(b => b.id === boatId);
            document.getElementById('bmTitle').textContent = 'Modifier Bateau';
            document.getElementById('bmRef').value = boat.reference || '';
            document.getElementById('bmCompany').value = boat.company || '';
            document.getElementById('bmName').value = boat.name || '';
            document.getElementById('bmDepDate').value = boat.departureDate || '';
            document.getElementById('bmArrDate').value = boat.arrivalDate || '';
        } else {
            document.getElementById('bmTitle').textContent = 'Nouveau Bateau';
            document.getElementById('bmRef').value = `BT-${Date.now().toString().slice(-6)}`;
            document.getElementById('bmCompany').value = '';
            document.getElementById('bmName').value = '';
            document.getElementById('bmDepDate').value = '';
            document.getElementById('bmArrDate').value = '';
        }
        
        modal.classList.add('active');
    },

    closeBoatModal() {
        document.getElementById('boatModal').classList.remove('active');
        this.editingBoatId = null;
    },

    async saveBoat() {
        const ref = document.getElementById('bmRef').value.trim();
        const company = document.getElementById('bmCompany').value.trim();
        
        if (!company) {
            this.app.showToast("La compagnie maritime est obligatoire.", "error");
            return;
        }

        const data = {
            reference: ref || `BT-${Date.now().toString().slice(-6)}`,
            company: company,
            name: document.getElementById('bmName').value.trim(),
            departureDate: document.getElementById('bmDepDate').value,
            arrivalDate: document.getElementById('bmArrDate').value,
        };

        try {
            if (this.editingBoatId) {
                await updateDoc(doc(db, "boats", this.editingBoatId), data);
                this.app.showToast("Bateau modifié avec succès.", "success");
            } else {
                data.status = 'EN_CONFECTION';
                data.createdAt = new Date().toISOString();
                await setDoc(doc(collection(db, "boats")), data);
                this.app.showToast("Nouveau bateau créé.", "success");
            }
            this.closeBoatModal();
        } catch(e) {
            this.app.showToast("Erreur lors de l'enregistrement.", "error");
        }
    },

    async deleteBoat(boatId) {
        if (window.AppModal) {
            if (!await window.AppModal.confirm("Voulez-vous vraiment supprimer ce bateau ? Les conteneurs à l'intérieur redeviendront disponibles.", "Supprimer bateau", true)) return;
        } else if (!confirm("Supprimer ce bateau ?")) return;

        try {
            const batch = writeBatch(db);
            
            // Libérer les conteneurs
            const ctns = this.containers.filter(c => c.boatId === boatId);
            ctns.forEach(c => {
                batch.update(doc(db, "containers", c.id), { boatId: deleteField() });
            });
            
            // Supprimer le bateau
            batch.delete(doc(db, "boats", boatId));
            
            await batch.commit();
            this.app.showToast("Bateau supprimé.", "success");
        } catch(e) {
            this.app.showToast("Erreur de suppression.", "error");
        }
    },

    async addToBoat(boatId) {
        if (this.selectedContainerIds.size === 0) return;
        
        try {
            const batch = writeBatch(db);
            this.selectedContainerIds.forEach(cid => {
                batch.update(doc(db, "containers", cid), { boatId: boatId });
            });
            await batch.commit();
            this.selectedContainerIds.clear();
            this.app.showToast("Conteneurs ajoutés au bateau.", "success");
        } catch(e) {
            this.app.showToast("Erreur d'ajout.", "error");
        }
    },

    async removeFromBoat(containerId) {
        try {
            await updateDoc(doc(db, "containers", containerId), { boatId: deleteField() });
            this.app.showToast("Conteneur retiré du bateau.", "info");
        } catch(e) {
            this.app.showToast("Erreur de retrait.", "error");
        }
    },

    async registerBoat(boatId) {
        const boat = this.boats.find(b => b.id === boatId);
        const ctns = this.containers.filter(c => c.boatId === boatId);

        if (ctns.length === 0) {
            this.app.showToast("Ce bateau est vide. Ajoutez d'abord des conteneurs.", "error");
            return;
        }

        if (window.AppModal) {
            if (!await window.AppModal.confirm(`Confirmer le départ du bateau ${boat.reference} ?\n\nSes ${ctns.length} conteneur(s) passeront en statut 'En mer' (Transit).`, "Enregistrer Départ")) return;
        } else if (!confirm("Enregistrer le départ ?")) return;

        try {
            const batch = writeBatch(db);
            
            // Bateau -> ENREGISTRE
            batch.update(doc(db, "boats", boatId), { 
                status: 'ENREGISTRE', 
                registeredAt: new Date().toISOString() 
            });
            
            // Conteneurs -> EN_TRANSIT
            ctns.forEach(c => {
                batch.update(doc(db, "containers", c.id), {
                    status: 'EN_TRANSIT',
                    boatName: boat.name || boat.company || boat.reference,
                    departureDate: boat.departureDate || null,
                    arrivalDate: boat.arrivalDate || null
                });
            });
            
            await batch.commit();
            this.app.showToast("Départ enregistré avec succès !", "success");
        } catch(e) {
            this.app.showToast("Erreur lors de l'enregistrement.", "error");
        }
    },

    async unRegisterBoat(boatId) {
        if (window.AppModal) {
            if (!await window.AppModal.confirm("Annuler le départ de ce bateau ? Il repassera en 'Confection'.", "Annuler Départ", true)) return;
        } else if (!confirm("Annuler le départ ?")) return;

        try {
            const batch = writeBatch(db);
            
            // Bateau -> EN_CONFECTION
            batch.update(doc(db, "boats", boatId), { 
                status: 'EN_CONFECTION', 
                registeredAt: deleteField() 
            });
            
            // Conteneurs -> EN_ATTENTE_BATEAU
            const ctns = this.containers.filter(c => c.boatId === boatId);
            ctns.forEach(c => {
                batch.update(doc(db, "containers", c.id), {
                    status: 'EN_ATTENTE_BATEAU',
                    boatName: deleteField(),
                    departureDate: deleteField(),
                    arrivalDate: deleteField()
                });
            });
            
            await batch.commit();
            this.app.showToast("Départ annulé.", "success");
        } catch(e) {
            this.app.showToast("Erreur d'annulation.", "error");
        }
    },

    async marquerArrive(boatId) {
        if (window.AppModal) {
            if (!await window.AppModal.confirm("Confirmer l'arrivée de ce bateau à destination (Abidjan) ?\n\nTous ses conteneurs et colis passeront au statut 'En Cours' (Réceptionnés).", "Arrivée Navire", false)) return;
        } else if (!confirm("Confirmer l'arrivée à destination ?")) return;

        const boat = this.boats.find(b => b.id === boatId);
        const ctns = this.containers.filter(c => c.boatId === boatId);

        try {
            const batch = writeBatch(db);
            
            // 1. Bateau -> ARRIVE
            batch.update(doc(db, "boats", boatId), {
                status: 'ARRIVE',
                realArrivalDate: new Date().toISOString()
            });

            // 2. Conteneurs -> ARRIVE
            const containerNumbers = [];
            ctns.forEach(c => {
                batch.update(doc(db, "containers", c.id), { status: 'ARRIVE' });
                containerNumbers.push(c.number || c.id);
            });

            // 3. Mettre à jour TOUS LES COLIS de ces conteneurs (Bascule automatique pour Abidjan)
            for (const cNum of containerNumbers) {
                // Requetes groupées (attention limite 500 par batch, mais ici on est confiant)
                const qLiv = query(collection(db, "livraisons"), where("conteneur", "==", cNum));
                const snap = await getDocs(qLiv);
                snap.forEach(d => {
                    batch.update(d.ref, {
                        containerStatus: 'EN_COURS', // Les colis débarquent à Abidjan
                        dateAjout: new Date().toISOString() // Le compteur de magasinage démarre
                    });
                });
            }

            await batch.commit();
            this.app.showToast("Bateau et colis réceptionnés à destination !", "success");
        } catch(e) {
            console.error(e);
            this.app.showToast("Erreur de mise à jour", "error");
        }
    }
};