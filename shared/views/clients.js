import { db } from '../../firebase-config.js';
import { collection, query, where, onSnapshot, doc, writeBatch, getDocs, orderBy, limit, updateDoc, addDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { Autocomplete } from '../../paris/js/views/autocomplete.js';
import { CONSTANTS } from '../../constants.js';
import { getCollectionName, AGENCIES } from '../../agencies-config.js';

export const ClientsView = {
    unsubClients: null,
    unsubLivraisons: null,
    clients: [],
    filteredClients: [],
    rawClients: null,
    rawLivraisons: null,

    // Correcteur automatique pour les accents cassés
    fixEncoding(str) {
        if (!str) return '';
        return str
            .replace(/Ã©/g, 'é').replace(/ã©/g, 'é').replace(/Ã¨/g, 'è').replace(/ã¨/g, 'è')
            .replace(/Ã /g, 'à').replace(/ã /g, 'à').replace(/Ã¢/g, 'â').replace(/ã¢/g, 'â')
            .replace(/Ãª/g, 'ê').replace(/ãª/g, 'ê').replace(/Ã®/g, 'î').replace(/ã®/g, 'î')
            .replace(/Ã´/g, 'ô').replace(/ã´/g, 'ô').replace(/Ã»/g, 'û').replace(/ã»/g, 'û')
            .replace(/Ã§/g, 'ç').replace(/ã§/g, 'ç').replace(/Ã¯/g, 'ï').replace(/ã¯/g, 'ï')
            .replace(/Ã«/g, 'ë').replace(/ã«/g, 'ë').replace(/Ã‰/g, 'É').replace(/Ãˆ/g, 'È')
            .replace(/Ã€/g, 'À');
    },

    formatMoneyLocal(amount) {
        const isEur = (sessionStorage.getItem('currentActiveAgency') || 'abidjan') === 'paris';
        if (isEur) {
            return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount || 0).replace(/[\u202F\u00A0]/g, ' ').replace(/\s*\/\s*/g, ' ');
        } else {
            return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(amount || 0).replace(/[\u202F\u00A0]/g, ' ').replace(/\s*\/\s*/g, ' ');
        }
    },

    render(app) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.clients = this;

        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
        const userRole = sessionStorage.getItem('userRole') || 'agent';
        const isAdmin = userRole === 'admin' || userRole === 'super_admin';
        
        const importBtnHtml = isAdmin ? `
            <input type="file" id="importClientInput" accept=".csv, .xlsx, .xls" style="display: none;">
            <button class="btn btn-outline" onclick="document.getElementById('importClientInput').click()" style="display: flex; align-items: center; gap: 8px;"><i class="fas fa-file-import"></i> Importer clients</button>
        ` : '';
        
        const html = `
            <style>
                /* Shared Client List & Detail Styles */
                .cl-page { max-width: 1200px; margin: 0 auto; animation: fadeIn 0.3s ease-in-out; }
                .cl-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; background: white; padding: 20px 25px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; flex-wrap: wrap; gap: 15px; }
                .cl-header__left { display: flex; align-items: center; gap: 15px; }
                .cl-header__icon { font-size: 28px; background: #eff6ff; color: #3b82f6; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 14px; }
                .cl-header__title { margin: 0; font-size: 22px; font-weight: 800; color: #0f172a; }
                .cl-header__subtitle { margin: 4px 0 0 0; font-size: 13px; color: #64748b; }
                .cl-header__actions { display: flex; gap: 10px; align-items: center; }

                .cl-kpi-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 24px; }
                .cl-kpi { display: flex; align-items: center; gap: 15px; padding: 20px; border-radius: 16px; background: white; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
                .cl-kpi__icon { font-size: 28px; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; border-radius: 12px; background: #f8fafc; color: #64748b; }
                .cl-kpi--blue .cl-kpi__icon { background: #eff6ff; color: #3b82f6; }
                .cl-kpi--green .cl-kpi__icon { background: #dcfce7; color: #10b981; }
                .cl-kpi__lbl { color: #64748b; font-size: 12px; font-weight: 600; text-transform: uppercase; }
                .cl-kpi__val { font-size: 24px; font-weight: 800; color: #0f172a; line-height: 1; margin-bottom: 4px; }

                .cl-filters-card { display: flex; flex-wrap: wrap; gap: 16px; background: white; padding: 20px 24px; border-radius: 16px; border: 1px solid #e2e8f0; margin-bottom: 24px; }
                .filter-group { flex: 1; min-width: 150px; }
                .filter-group--wide { flex: 2; }
                .filter-label { display: block; font-size: 11px; font-weight: 600; text-transform: uppercase; color: #64748b; margin-bottom: 6px; }
                .filter-input, .filter-select { width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 14px; transition: all 0.2s; box-sizing: border-box; outline: none; }
                .filter-input:focus, .filter-select:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }

                .cl-table-card { background: white; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
                .cl-table-header { padding: 16px 24px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; display: flex; justify-content: space-between; align-items: center; }
                .cl-table-title { font-size: 16px; font-weight: 800; color: #1e293b; margin: 0; display: flex; align-items: center; gap: 8px; }
                .cl-count-badge { background: #e2e8f0; color: #475569; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; }
                
                .cl-table-wrap { overflow-x: auto; }
                .cl-table { width: 100%; border-collapse: collapse; }
                .cl-table th { text-align: left; padding: 16px 20px; background: #f8fafc; font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; white-space: nowrap; }
                .cl-table td { padding: 16px 20px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #334155; vertical-align: middle; }
                .cl-table tr { transition: background 0.2s; cursor: pointer; }
                .cl-table tr:hover td { background: #f8fafc; }

                /* Detail View Styles (keeping CD prefixes for detail specific styling) */
                .cd-header { display: flex; justify-content: space-between; align-items: center; background: white; padding: 20px 25px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); margin-bottom: 24px; border: 1px solid #e2e8f0; flex-wrap: wrap; gap: 15px;}
                .cd-header__icon { font-size: 32px; background: #eff6ff; color: #3b82f6; width: 60px; height: 60px; display: flex; align-items: center; justify-content: center; border-radius: 14px; margin-right: 15px; }
                .cd-header__content { display: flex; align-items: center; }
                .cd-header__title { font-size: 24px; font-weight: 800; margin: 0; color: #0f172a; }
                .cd-header__subtitle { color: #64748b; margin: 5px 0 0 0; font-size: 13px; }
                
                .cd-kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 24px; }
                .cd-kpi { display: flex; align-items: center; gap: 15px; padding: 20px; border-radius: 16px; background: white; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
                .cd-kpi__icon { font-size: 24px; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: 12px; }
                .cd-kpi__label { font-size: 12px; color: #64748b; font-weight: 600; text-transform: uppercase; }
                .cd-kpi__value { font-size: 20px; font-weight: 800; color: #0f172a; margin: 4px 0; }
                .cd-kpi__hint { font-size: 11px; color: #94a3b8; }
                
                .cd-tables-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
                @media(max-width: 768px){ .cd-tables-row { grid-template-columns: 1fr; } }
                .cd-table-card { background: white; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.02); padding: 20px; overflow: hidden;}
                .cd-table-card__title { font-size: 16px; font-weight: 800; color: #1e293b; margin: 0 0 15px 0; display: flex; align-items: center; gap: 8px;}
            </style>

            <!-- VUE LISTE -->
            <div id="clientsListView" class="cl-page">
                <div class="cl-header">
                    <div class="cl-header__left">
                        <div class="cl-header__icon"><i class="fas fa-users"></i></div>
                        <div class="cl-header__info">
                            <h2 class="cl-header__title">Clients</h2>
                            <p class="cl-header__subtitle">Gestion de la base clients et analyse</p>
                        </div>
                    </div>
                    <div class="cl-header__actions">
                        ${importBtnHtml}
                        <button class="btn btn-primary" onclick="window.app.views.clients.openNewClientModal()" style="display: flex; align-items: center; gap: 8px; border-radius: 10px; font-weight: 600; padding: 10px 16px;">
                            <i class="fas fa-plus"></i> Nouveau client
                        </button>
                    </div>
                </div>

                <div class="cl-kpi-row">
                    <div class="cl-kpi cl-kpi--blue">
                        <div class="cl-kpi__icon">👥</div>
                        <div>
                            <div class="cl-kpi__lbl">Total clients</div>
                            <div class="cl-kpi__val" id="kpiTotal">-</div>
                        </div>
                    </div>
                    <div class="cl-kpi cl-kpi--green">
                        <div class="cl-kpi__icon">⭐</div>
                        <div>
                            <div class="cl-kpi__lbl">Actifs</div>
                            <div class="cl-kpi__val" id="kpiActifs">-</div>
                        </div>
                    </div>
                </div>

                <div class="cl-filters-card">
                    <div class="filter-group filter-group--wide">
                        <label class="filter-label">🔍 Recherche</label>
                        <input type="text" id="clSearchInput" class="filter-input" placeholder="Nom, prénom, téléphone...">
                    </div>
                    <div class="filter-group">
                        <label class="filter-label">⚠️ Risque</label>
                        <select id="clRiskFilter" class="filter-select">
                            <option value="">Tous</option>
                            <option value="low">🟢 Faible</option>
                            <option value="medium">🟡 Moyen</option>
                            <option value="high">🔴 Élevé</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label class="filter-label">📊 Segment</label>
                        <select id="clSegmentFilter" class="filter-select">
                            <option value="">Tous</option>
                            <option value="dormant">😴 Dormant</option>
                            <option value="habituel">👤 Habituel</option>
                            <option value="regulier">⭐ Régulier</option>
                        </select>
                    </div>
                    <div class="filter-group" style="display: flex; align-items: flex-end;">
                        <button class="btn btn-outline" style="height: 38px; width: 100%; border-radius: 10px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px;">
                            <i class="fas fa-file-excel"></i> Exporter
                        </button>
                    </div>
                </div>

                <div class="cl-table-card">
                    <div class="cl-table-header">
                        <h3 class="cl-table-title">📋 Top 100 des Meilleurs Clients</h3>
                        <span class="cl-count-badge" id="clListCount">Chargement...</span>
                    </div>
                    <div class="cl-table-wrap">
                        <table class="cl-table">
                            <thead>
                                <tr>
                                    <th>👤 Client</th>
                                    <th>📞 Tél</th>
                                    <th>📅 Dernière exp.</th>
                                    <th>⚠️ Risque</th>
                                    <th>📊 Segment</th>
                                    <th style="text-align: right;">💰 CA Total</th>
                                    <th style="text-align: right;">📄 Expéditions</th>
                                    <th style="text-align: center;">⚙️ Détail</th>
                                </tr>
                            </thead>
                            <tbody id="clTableBody">
                                <tr><td colspan="8" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Chargement des données...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- VUE DÉTAIL CLIENT (Masquée par défaut) -->
            <div id="clientDetailView" class="cl-page" style="display: none;"></div>

            <!-- MODAL ÉDITION CLIENT -->
            <div id="editClientModal" class="modal" style="display:none; position:fixed; z-index:1000; left:0; top:0; width:100%; height:100%; background-color:rgba(0,0,0,0.8); align-items:center; justify-content:center;">
                <div class="modal-content" style="background:#fff; padding:20px; width:90%; max-width:500px; border-radius:12px;">
                    <span class="close-modal" onclick="document.getElementById('editClientModal').style.display='none'" style="float:right; cursor:pointer; font-size:24px;">&times;</span>
                    <h2 style="margin-top:0;">Modifier Client</h2>
                    <input type="hidden" id="editClientId">
                    <div style="margin-bottom:15px;">
                        <label style="display:block; margin-bottom:5px; font-weight:bold;">Nom complet</label>
                        <input type="text" id="editClientNom" style="width:100%; padding:8px; box-sizing:border-box;">
                    </div>
                    <div style="margin-bottom:15px;">
                        <label style="display:block; margin-bottom:5px; font-weight:bold;">Téléphone</label>
                        <input type="text" id="editClientTel" style="width:100%; padding:8px; box-sizing:border-box;">
                    </div>
                    <div style="margin-bottom:15px;">
                        <label style="display:block; margin-bottom:5px; font-weight:bold;">Adresse complète</label>
                        <div style="position: relative;">
                            <input type="text" id="editClientAdresse" autocomplete="off" style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:6px; box-sizing:border-box;">
                            <ul id="editClientAdresseSuggestions" class="autocomplete-suggestions autocomplete-up"></ul>
                        </div>
                    </div>
                    <div style="text-align:right; margin-top:20px;">
                        <button class="btn" onclick="document.getElementById('editClientModal').style.display='none'" style="background: #6c757d; color:white; margin-right:10px; border:none; padding:8px 15px; border-radius:6px; cursor:pointer;">Annuler</button>
                        <button class="btn btn-success" onclick="window.app.views.clients.saveClientEdit()" style="background: #10b981; color:white; border:none; padding:8px 15px; border-radius:6px; cursor:pointer;">Enregistrer</button>
                    </div>
                </div>
            </div>
            
            <!-- MODAL NOUVEAU CLIENT -->
            <div id="newClientModal" class="modal" style="display:none; position:fixed; z-index:1000; left:0; top:0; width:100%; height:100%; background-color:rgba(15, 23, 42, 0.6); align-items:center; justify-content:center; backdrop-filter: blur(4px);">
                <div class="modal-content" style="background:#fff; padding:0; width:90%; max-width:450px; border-radius:16px; overflow:hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); display:flex; flex-direction:column; max-height:90vh;">
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:20px; border-bottom:1px solid #e2e8f0; background:#f8fafc;">
                        <h2 style="margin:0; font-size:18px; color:#0f172a;">➕ Nouveau client</h2>
                        <button onclick="document.getElementById('newClientModal').style.display='none'" style="background:none; border:none; font-size:24px; cursor:pointer; color:#64748b;">✕</button>
                    </div>
                    <div style="padding:20px; overflow-y:auto; flex:1; min-height:0;">
                        <div style="font-size:13px; color:#64748b; margin-bottom:20px;">Créer un nouvel expéditeur dans le système</div>
                        
                        <div style="margin-bottom:15px;">
                            <label style="display:block; margin-bottom:5px; font-weight:600; font-size:13px; color:#1e293b;">👤 Nom *</label>
                            <input type="text" id="newClientNom" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box; font-size:14px;" placeholder="Nom du client">
                        </div>
                        <div style="margin-bottom:15px;">
                            <label style="display:block; margin-bottom:5px; font-weight:600; font-size:13px; color:#1e293b;">👤 Prénom</label>
                            <input type="text" id="newClientPrenom" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box; font-size:14px;" placeholder="Prénom du client">
                        </div>
                        <div style="margin-bottom:15px;">
                            <label style="display:block; margin-bottom:5px; font-weight:600; font-size:13px; color:#1e293b;">📞 Téléphone *</label>
                            <input type="text" id="newClientTel" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box; font-size:14px;" placeholder="Numéro de téléphone">
                        </div>
                        <div style="margin-bottom:15px;">
                            <label style="display:block; margin-bottom:5px; font-weight:600; font-size:13px; color:#1e293b;">📧 Email</label>
                            <input type="email" id="newClientEmail" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box; font-size:14px;" placeholder="Adresse email">
                        </div>
                        <div style="margin-bottom:20px;">
                            <label style="display:block; margin-bottom:5px; font-weight:600; font-size:13px; color:#1e293b;">📍 Adresse</label>
                            <div style="position: relative;">
                                <input type="text" id="newClientAdresse" autocomplete="off" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box; font-size:14px;" placeholder="Adresse complète">
                                <ul id="newClientAdresseSuggestions" class="autocomplete-suggestions autocomplete-up"></ul>
                            </div>
                        </div>
                        <div style="display:flex; justify-content:flex-end; gap:10px; padding-top:15px; border-top:1px solid #e2e8f0;">
                            <button class="btn btn-outline" onclick="document.getElementById('newClientModal').style.display='none'" style="padding:10px 15px; border-radius:8px; font-weight:600;">Annuler</button>
                            <button id="saveNewClientBtn" class="btn btn-primary" onclick="window.app.views.clients.saveNewClient()" style="padding:10px 15px; border-radius:8px; font-weight:600; display:flex; align-items:center; gap:6px;">✓ Créer le client</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        const contentContainer = document.getElementById('contentContainer');
        if (contentContainer) contentContainer.innerHTML = html;

        // Écouteurs de filtres
        document.getElementById('clSearchInput')?.addEventListener('input', () => this.applyFilters());
        document.getElementById('clRiskFilter')?.addEventListener('change', () => this.applyFilters());
        document.getElementById('clSegmentFilter')?.addEventListener('change', () => this.applyFilters());

        // Auto-complétion des adresses DÉSACTIVÉE ici : initAddress() remplace
        // la case par un composant Vue à instance UNIQUE (this.vueApp).
        // L'appeler 2 fois (newClient + editClient) démonte le 1er widget →
        // la case Adresse de « Nouveau client » disparaissait. On garde des
        // champs Adresse simples et fiables (saisie clavier).
        
        this.loadData();
    },

    loadData() {
        if (this.unsubClients) this.unsubClients();
        if (this.unsubLivraisons) this.unsubLivraisons();
        
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';

        // 1. Clients
        const qClients = query(collection(db, getCollectionName("clients")), where("agency", "==", activeAgency));
        this.unsubClients = onSnapshot(qClients, (snapshot) => {
            this.rawClients = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
            this.computeClientStats();
        }, (error) => {
            console.error("Erreur Firestore :", error);
        });

        // 2. Livraisons (Calcul CA)
        const qLiv = query(collection(db, getCollectionName("livraisons")), where("agency", "==", activeAgency));
        this.unsubLivraisons = onSnapshot(qLiv, (snapshot) => {
            this.rawLivraisons = snapshot.docs.map(d => d.data());
            this.computeClientStats();
        }, (error) => {
            console.error("Erreur Livraisons :", error);
        });
    },

    computeClientStats() {
        if (!this.rawClients || !this.rawLivraisons) return; 
        
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
        const isArrival = AGENCIES[activeAgency] && AGENCIES[activeAgency].type === 'arrival';

        const statsMap = new Map();
        const clientProfiles = new Map();

        // Initialiser les clients existants
        this.rawClients.forEach(data => {
            // Séparation expéditeur / destinataire : on ignore un client dont
            // le rôle EXPLICITE ne correspond pas au contexte (agence de
            // départ = expéditeurs ; agence d'arrivée = destinataires).
            // Les anciens clients SANS champ `type` ne sont PAS filtrés
            // (aucune perte de l'existant — repli sur l'ancien comportement).
            if (data.type) {
                const expected = isArrival ? 'destinataire' : 'expediteur';
                if (data.type !== expected) return;
            }
            const nom = this.fixEncoding(data.nom || 'Inconnu');
            clientProfiles.set(nom.toUpperCase(), {
                id: data.id, nom: nom, tel: data.tel || '-', adresse: this.fixEncoding(data.adresse || '-'),
                date: data.dateAjout ? new Date(data.dateAjout).toLocaleDateString('fr-FR') : '-',
                risque: data.risque || 'low', segment: data.segment || 'dormant', isExplicit: true
            });
        });

        // Agréger depuis les livraisons
        this.rawLivraisons.forEach(liv => {
            // DIFFÉRENCE CLÉ : 
            // Si c'est l'arrivée (Abidjan), le client est le Destinataire en priorité.
            // Si c'est le départ (Paris), le client est toujours l'Expéditeur.
            const rawName = isArrival ? (liv.destinataire || liv.expediteur) : liv.expediteur;
            
            if (rawName && rawName.trim() !== '') {
                const nomFixed = this.fixEncoding(rawName.trim());
                const nomUpper = nomFixed.toUpperCase();

                if (!statsMap.has(nomUpper)) statsMap.set(nomUpper, { ca: 0, factures: 0, lastDate: null });
                const st = statsMap.get(nomUpper);
                st.factures += 1;
                
                let amountCFA = parseFloat(String(liv.prixOriginal || liv.montant || '0').replace(/[^\d]/g, '')) || 0;
                // Si l'agence est en EUR (Paris), on convertit le CA de CFA vers EUR en arrière plan pour le calcul interne
                const isEur = (sessionStorage.getItem('currentActiveAgency') || 'abidjan') === 'paris';
                if (isEur) amountCFA = amountCFA / CONSTANTS.TAUX_CONVERSION;
                st.ca += amountCFA; 

                if (liv.dateAjout) {
                    const lDate = new Date(liv.dateAjout);
                    if (!st.lastDate || lDate > st.lastDate) st.lastDate = lDate;
                }

                // Créer profil dynamique (surtout utilisé à Abidjan pour les destinataires)
                if (!clientProfiles.has(nomUpper) && isArrival) {
                    let tel = liv.numero || '-';
                    const phoneRegex = /(?:(?:\+|00)225[\s.-]?)?(?:01|05|07|0)\d(?:[\s.-]?\d{2}){4}|(?:(?:\+|00)225[\s.-]?)?(?:01|05|07|0)\d{8,}/;
                    if (tel === '-' || !tel) {
                        const match = rawName.match(phoneRegex);
                        if (match) tel = match[0];
                    }
                    const cleanName = nomFixed.replace(phoneRegex, '').replace(/[-–,;:\/\s]+$/, '').trim();
                    clientProfiles.set(nomUpper, {
                        id: 'dyn_' + nomUpper.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 15),
                        nom: cleanName || nomFixed, tel: tel, adresse: this.fixEncoding(liv.lieuLivraison || liv.commune || '-'),
                        date: st.lastDate ? st.lastDate.toLocaleDateString('fr-FR') : '-',
                        risque: 'low', segment: 'nouveau', isExplicit: false
                    });
                }
            }
        });

        // Consolider la liste
        const clientsList = [];
        for (const [nomUpper, profile] of clientProfiles.entries()) {
            const stats = statsMap.get(nomUpper) || { ca: 0, factures: 0 };
            let tel = profile.tel;
            let cleanTel = tel.replace(/[\s.-]/g, '');
            if (cleanTel.length === 9 && /^[1-9]/.test(cleanTel)) tel = '0' + cleanTel;

            let segment = profile.segment;
            if (stats.factures >= 10) segment = 'regulier';
            else if (stats.factures >= 3) segment = 'habituel';
            else if (stats.factures > 0) segment = 'nouveau';
            
            clientsList.push({ 
                ...profile, tel: tel, segment: segment, ca: stats.ca, factures: stats.factures 
            });
        }
        
        clientsList.sort((a, b) => b.ca - a.ca);
        this.clients = clientsList;
        this.applyFilters();
    },

    applyFilters() {
        const term = (document.getElementById('clSearchInput')?.value || '').toLowerCase().trim();
        const risk = document.getElementById('clRiskFilter')?.value || '';
        const segment = document.getElementById('clSegmentFilter')?.value || '';

        this.filteredClients = this.clients.filter(c => {
            if (term && !c.nom.toLowerCase().includes(term) && !c.tel.includes(term)) return false;
            if (risk && c.risque !== risk) return false;
            if (segment && c.segment !== segment) return false;
            return true;
        });
        this.renderTable();
    },

    renderTable() {
        const tbody = document.getElementById('clTableBody');
        if (!tbody) return;
        const kpiTotal = document.getElementById('kpiTotal');
        const kpiActifs = document.getElementById('kpiActifs');
        const listCount = document.getElementById('clListCount');
        
        if (kpiTotal) kpiTotal.textContent = this.clients.length;
        if (kpiActifs) kpiActifs.textContent = this.clients.filter(c => c.ca > 0).length;
        
        const top100 = this.filteredClients.slice(0, 100);
        if (listCount) listCount.textContent = `${top100.length} affichés sur ${this.filteredClients.length}`;

        if (top100.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px; color: #64748b;">Aucun client trouvé.</td></tr>';
            return;
        }

        tbody.innerHTML = top100.map(c => `
            <tr onclick="window.app.views.clients.showDetail('${c.id}')">
                <td style="padding: 15px; font-weight: 700; color: #0f172a;">${c.nom}</td>
                <td style="color: #64748b;">${c.tel}</td>
                <td style="color: #64748b;">${c.date}</td>
                <td><span class="badge" style="background: #dcfce7; color: #166534; padding: 4px 10px; border-radius: 12px; font-weight: 600;">${c.risque}</span></td>
                <td><span class="badge" style="background: ${c.segment === 'regulier' ? '#e0f2fe' : '#f3e8ff'}; color: ${c.segment === 'regulier' ? '#0369a1' : '#7e22ce'}; padding: 4px 10px; border-radius: 12px; font-weight: 600;">${c.segment}</span></td>
                <td style="text-align: right; font-weight: 700; font-family: monospace; font-size: 14px;">${this.formatMoneyLocal(c.ca)}</td>
                <td style="text-align: right; font-weight: 600; color: #475569;">${c.factures}</td>
                <td style="text-align: center;"><button class="btn-small" style="background: transparent; border: none; font-size: 16px; cursor: pointer;">👉</button></td>
            </tr>
        `).join('');
    },

    async showDetail(clientId) {
        const client = this.clients.find(c => c.id === clientId);
        if (!client) return;
        
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
        const isArrival = AGENCIES[activeAgency] && AGENCIES[activeAgency].type === 'arrival';

        document.getElementById('clientsListView').style.display = 'none';
        const detailView = document.getElementById('clientDetailView');
        detailView.style.display = 'block';
        detailView.innerHTML = '<div style="text-align:center; padding:50px;"><i class="fas fa-spinner fa-spin fa-2x"></i> Collecte des données...</div>';

        // DIFFÉRENCE CLÉ DANS LES REQUÊTES SELON L'AGENCE
        let qTrans, qLiv;
        if (isArrival) {
            qTrans = query(collection(db, getCollectionName("transactions")), where("nomDestinataire", "==", client.nom), orderBy("date", "desc"), limit(5));
            qLiv = query(collection(db, getCollectionName("livraisons")), where("destinataire", "==", client.nom), orderBy("dateAjout", "desc"));
        } else {
            qTrans = query(collection(db, getCollectionName("transactions")), where("nom", "==", client.nom), orderBy("date", "desc"), limit(5));
            qLiv = query(collection(db, getCollectionName("livraisons")), where("expediteur", "==", client.nom), orderBy("dateAjout", "desc"));
        }
        
        let transSnap = await getDocs(qTrans);
        if (transSnap.empty && isArrival) {
            // Fallback (Abidjan)
            qTrans = query(collection(db, getCollectionName("transactions")), where("nom", "==", client.nom), orderBy("date", "desc"), limit(5));
            transSnap = await getDocs(qTrans);
        }
        const factures = transSnap.docs.map(d => d.data());

        let livSnap = await getDocs(qLiv);
        let colisTous = livSnap.docs.map(d => d.data());
        if (colisTous.length === 0 && isArrival) {
            // Fallback (Abidjan)
            qLiv = query(collection(db, getCollectionName("livraisons")), where("expediteur", "==", client.nom), orderBy("dateAjout", "desc"));
            livSnap = await getDocs(qLiv);
            colisTous = livSnap.docs.map(d => d.data());
        }
        const colis = colisTous.slice(0, 5); 

        // Carnet d'adresses (Contacts)
        const contactsMap = new Map();
        colisTous.forEach(c => {
            const otherParty = isArrival ? 
                ((c.destinataire && c.destinataire.toUpperCase() === client.nom.toUpperCase()) ? c.expediteur : c.destinataire) :
                c.destinataire; // À Paris, on cherche les destinataires fréquents de cet expéditeur
                
            if (otherParty && otherParty.trim() !== '') {
                const nomContact = this.fixEncoding(otherParty.trim());
                if (!contactsMap.has(nomContact)) contactsMap.set(nomContact, 0);
                contactsMap.set(nomContact, contactsMap.get(nomContact) + 1);
            }
        });
        const carnetAdresses = Array.from(contactsMap.entries()).sort((a, b) => b[1] - a[1]); 

        const panierMoyen = client.factures > 0 ? (client.ca / client.factures) : 0;
        const isEur = activeAgency === 'paris';
        const TAUX = isEur ? CONSTANTS.TAUX_CONVERSION : 1;

        const html = `
            <div style="display:flex; justify-content:space-between; margin-bottom:20px;">
                <button onclick="document.getElementById('clientDetailView').style.display='none'; document.getElementById('clientsListView').style.display='block';" class="btn btn-outline"><i class="fas fa-arrow-left"></i> Retour à la liste</button>
                <h1 style="margin:0; font-size:24px;">Détail client</h1>
            </div>
            
            <div class="cd-header">
                <div class="cd-header__content">
                    <div class="cd-header__icon">👤</div>
                    <div>
                        <h1 class="cd-header__title">${client.nom}</h1>
                        <p class="cd-header__subtitle">${client.tel} — ${client.adresse}</p>
                    </div>
                </div>
                <button class="btn btn-outline" onclick="window.app.views.clients.openEditClientModal('${client.id}')">
                    <i class="fas fa-edit"></i> Modifier
                </button>
            </div>
            <div class="cd-kpi-grid">
                <div class="cd-kpi cd-kpi--blue"><div class="cd-kpi__icon" style="background:#eff6ff; color:#3b82f6;">💰</div><div><div class="cd-kpi__label">CA Total</div><div class="cd-kpi__value">${this.formatMoneyLocal(client.ca)}</div><div class="cd-kpi__hint">Total généré</div></div></div>
                <div class="cd-kpi cd-kpi--purple"><div class="cd-kpi__icon" style="background:#f5f3ff; color:#8b5cf6;">📄</div><div><div class="cd-kpi__label">Expéditions</div><div class="cd-kpi__value">${client.factures}</div><div class="cd-kpi__hint">Volume d'activité</div></div></div>
                <div class="cd-kpi cd-kpi--orange"><div class="cd-kpi__icon" style="background:#fff7ed; color:#f97316;">🧮</div><div><div class="cd-kpi__label">Panier moyen</div><div class="cd-kpi__value">${this.formatMoneyLocal(panierMoyen)}</div><div class="cd-kpi__hint">Moyenne par envoi</div></div></div>
                <div class="cd-kpi cd-kpi--slate"><div class="cd-kpi__icon" style="background:#f8fafc; color:#64748b;">📅</div><div><div class="cd-kpi__label">Dernière activité</div><div class="cd-kpi__value">${client.date}</div><div class="cd-kpi__hint">Date d'ajout / modif</div></div></div>
            </div>

            <div class="cd-tables-row">
                <div class="cd-table-card">
                    <h2 class="cd-table-card__title">🧾 Dernières Transactions (Caisse)</h2>
                    <table class="data-table" style="width:100%;">
                        <thead><tr><th>Réf</th><th>Date</th><th style="text-align:right;">Montant</th></tr></thead>
                        <tbody>${factures.length === 0 ? '<tr><td colspan="3">Aucune facture</td></tr>' : factures.map(f => `<tr><td><b>${f.reference}</b></td><td>${f.date}</td><td style="text-align:right; font-weight:bold;">${this.formatMoneyLocal((f.prix || 0) / TAUX)}</td></tr>`).join('')}</tbody>
                    </table>
                </div>
                <div class="cd-table-card">
                    <h2 class="cd-table-card__title">📦 Derniers Colis</h2>
                    <table class="data-table" style="width:100%;">
                        <thead><tr><th>Réf</th><th>Date</th><th>Statut</th></tr></thead>
                        <tbody>${colis.length === 0 ? '<tr><td colspan="3">Aucun colis</td></tr>' : colis.map(c => `<tr><td><b>${c.ref}</b></td><td>${c.dateAjout ? new Date(c.dateAjout).toLocaleDateString('fr-FR') : '-'}</td><td><span class="badge" style="background:#f1f5f9; color:#475569;">${c.containerStatus}</span></td></tr>`).join('')}</tbody>
                    </table>
                </div>
            </div>

            <div class="cd-table-card" style="margin-top: 20px;">
                <h2 class="cd-table-card__title" style="margin-bottom: 15px;"><i class="fas fa-address-book" style="color: #f59e0b;"></i> Carnet d'adresses (${isArrival ? 'Expéditeurs' : 'Destinataires'}) fréquents</h2>
                <div style="display: flex; gap: 15px; flex-wrap: wrap;">
                    ${carnetAdresses.length === 0 ? '<p style="color:#64748b; font-style: italic;">Aucun contact enregistré pour le moment.</p>' : carnetAdresses.map(([nom, count]) => `
                        <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 15px; border-radius: 12px; display: flex; align-items: center; gap: 12px; min-width: 200px; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
                            <div style="background: #ffedd5; color: #ea580c; width: 36px; height: 36px; border-radius: 50%; display: flex; justify-content: center; align-items: center; font-weight: 800; font-size: 16px;">
                                ${nom.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <div style="font-weight: 700; color: #0f172a; font-size: 14px;">${nom}</div>
                                <div style="font-size: 11px; color: #64748b; font-weight: 600;">${count} colis liés</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        detailView.innerHTML = html;
    },

    openEditClientModal(clientId) {
        const client = this.clients.find(c => c.id === clientId);
        if (!client) return;
        document.getElementById('editClientId').value = client.id;
        document.getElementById('editClientNom').value = client.nom;
        document.getElementById('editClientTel').value = client.tel;
        document.getElementById('editClientAdresse').value = client.adresse;
        document.getElementById('editClientModal').style.display = 'flex';
    },

    async saveClientEdit() {
        const id = document.getElementById('editClientId').value;
        const newNom = document.getElementById('editClientNom').value.trim();
        const newTel = document.getElementById('editClientTel').value.trim();
        const newAdresse = document.getElementById('editClientAdresse').value.trim();

        if (!id || !newNom) return this.app.showToast("Le nom est obligatoire.", "error");
        
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
        const isArrival = AGENCIES[activeAgency] && AGENCIES[activeAgency].type === 'arrival';

        try {
            const client = this.clients.find(c => c.id === id);
            const oldNom = client ? client.nom : '';

            if (id.startsWith('dyn_')) {
                await addDoc(collection(db, getCollectionName("clients")), {
                    nom: newNom, tel: newTel, adresse: newAdresse,
                    type: isArrival ? 'destinataire' : 'expediteur',
                    dateAjout: new Date().toISOString(), agency: activeAgency, risque: 'low', segment: 'nouveau', taille: 'petit', ca: 0, factures: 0
                });
            } else {
                await updateDoc(doc(db, getCollectionName("clients"), id), { nom: newNom, tel: newTel, adresse: newAdresse });
            }

            if (oldNom && oldNom.toLowerCase() !== newNom.toLowerCase()) {
                const batch = writeBatch(db);
                
                // DIFFÉRENCE CLÉ DANS LA PROPAGATION DES NOMS SELON L'AGENCE
                if (isArrival) {
                    const snapLivDest = await getDocs(query(collection(db, getCollectionName("livraisons")), where("destinataire", "==", oldNom)));
                    snapLivDest.forEach(d => { batch.update(d.ref, { destinataire: newNom }); });

                    const snapTransDest = await getDocs(query(collection(db, getCollectionName("transactions")), where("nomDestinataire", "==", oldNom)));
                    snapTransDest.forEach(d => { batch.update(d.ref, { nomDestinataire: newNom }); });
                } else {
                    const snapLivExp = await getDocs(query(collection(db, getCollectionName("livraisons")), where("expediteur", "==", oldNom)));
                    snapLivExp.forEach(d => { batch.update(d.ref, { expediteur: newNom }); });

                    const snapTransExp = await getDocs(query(collection(db, getCollectionName("transactions")), where("nom", "==", oldNom)));
                    snapTransExp.forEach(d => { batch.update(d.ref, { nom: newNom }); });
                }
                
                await batch.commit();
            }

            document.getElementById('editClientModal').style.display = 'none';
            this.app.showToast("Client mis à jour !", "success");
            this.showDetail(id);
        } catch (e) {
            console.error(e);
            this.app.showToast("Erreur lors de la modification", "error");
        }
    },
    
    openNewClientModal() {
        let modal = document.getElementById('newClientModal');
        
        // Injection du modal à la volée s'il est appelé depuis une autre vue
        if (!modal) {
            const modalHtml = `
                <div id="newClientModal" class="modal" style="display:none; position:fixed; z-index:1000; left:0; top:0; width:100%; height:100%; background-color:rgba(15, 23, 42, 0.6); align-items:center; justify-content:center; backdrop-filter: blur(4px);">
                    <div class="modal-content" style="background:#fff; padding:0; width:90%; max-width:450px; border-radius:16px; display:flex; flex-direction:column; max-height:90vh; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);">
                        <div style="display:flex; justify-content:space-between; align-items:center; padding:20px; border-bottom:1px solid #e2e8f0; background:#f8fafc; flex-shrink:0;">
                            <h2 style="margin:0; font-size:18px; color:#0f172a;">➕ Nouveau client</h2>
                            <button onclick="document.getElementById('newClientModal').style.display='none'" style="background:none; border:none; font-size:24px; cursor:pointer; color:#64748b;">✕</button>
                        </div>
                        <div style="padding:20px; overflow-y:auto; flex-grow:1;">
                            <div style="font-size:13px; color:#64748b; margin-bottom:20px;">Créer un nouvel expéditeur dans le système</div>
                            
                            <div style="margin-bottom:15px;">
                                <label style="display:block; margin-bottom:5px; font-weight:600; font-size:13px; color:#1e293b;">👤 Nom *</label>
                                <input type="text" id="newClientNom" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box; font-size:14px;" placeholder="Nom du client">
                            </div>
                            <div style="margin-bottom:15px;">
                                <label style="display:block; margin-bottom:5px; font-weight:600; font-size:13px; color:#1e293b;">👤 Prénom</label>
                                <input type="text" id="newClientPrenom" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box; font-size:14px;" placeholder="Prénom du client">
                            </div>
                            <div style="margin-bottom:15px;">
                                <label style="display:block; margin-bottom:5px; font-weight:600; font-size:13px; color:#1e293b;">📞 Téléphone *</label>
                                <input type="text" id="newClientTel" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box; font-size:14px;" placeholder="Numéro de téléphone">
                            </div>
                            <div style="margin-bottom:15px;">
                                <label style="display:block; margin-bottom:5px; font-weight:600; font-size:13px; color:#1e293b;">📧 Email</label>
                                <input type="email" id="newClientEmail" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box; font-size:14px;" placeholder="Adresse email">
                            </div>
                            <div style="margin-bottom:20px;">
                                <label style="display:block; margin-bottom:5px; font-weight:600; font-size:13px; color:#1e293b;">📍 Adresse</label>
                                <div style="position: relative;">
                                    <input type="text" id="newClientAdresse" autocomplete="off" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box; font-size:14px;" placeholder="Adresse complète">
                                    <ul id="newClientAdresseSuggestions" class="autocomplete-suggestions autocomplete-up"></ul>
                                </div>
                            </div>
                            <div style="display:flex; justify-content:flex-end; gap:10px; padding-top:15px; border-top:1px solid #e2e8f0;">
                                <button class="btn btn-outline" onclick="document.getElementById('newClientModal').style.display='none'" style="padding:10px 15px; border-radius:8px; font-weight:600;">Annuler</button>
                                <button id="saveNewClientBtn" class="btn btn-primary" onclick="window.app.views.clients.saveNewClient()" style="padding:10px 15px; border-radius:8px; font-weight:600; display:flex; align-items:center; gap:6px;">✓ Créer le client</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            modal = document.getElementById('newClientModal');
            
            // Pas d'initAddress() ici (cf. note plus haut) : champ Adresse simple et fiable.
        }

        // Sécurisation du nettoyage du formulaire
        if (document.getElementById('newClientNom')) document.getElementById('newClientNom').value = '';
        if (document.getElementById('newClientPrenom')) document.getElementById('newClientPrenom').value = '';
        if (document.getElementById('newClientTel')) document.getElementById('newClientTel').value = '';
        if (document.getElementById('newClientEmail')) document.getElementById('newClientEmail').value = '';
        if (document.getElementById('newClientAdresse')) document.getElementById('newClientAdresse').value = '';
        
        if (modal) {
            modal.style.display = 'flex';
        }
    },

    async saveNewClient() {
        const nomEl = document.getElementById('newClientNom');
        const prenomEl = document.getElementById('newClientPrenom');
        const telEl = document.getElementById('newClientTel');
        const emailEl = document.getElementById('newClientEmail');
        const adresseEl = document.getElementById('newClientAdresse');

        const nom = nomEl ? nomEl.value.trim() : '';
        const prenom = prenomEl ? prenomEl.value.trim() : '';
        const tel = telEl ? telEl.value.trim() : '';
        const email = emailEl ? emailEl.value.trim() : '';
        const adresse = adresseEl ? adresseEl.value.trim() : '';
        
        const appInstance = this.app || window.app;

        if (!nom || !tel) {
            return appInstance ? appInstance.showToast("Veuillez remplir le nom et le téléphone.", "error") : alert("Veuillez remplir le nom et le téléphone.");
        }
        
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
        const isArrival = AGENCIES[activeAgency] && AGENCIES[activeAgency].type === 'arrival';

        try {
            await addDoc(collection(db, getCollectionName("clients")), {
                nom: `${nom} ${prenom}`.trim(),
                tel: tel,
                email: email,
                adresse: adresse,
                // Agence d'arrivée -> destinataire ; agence de départ -> expéditeur.
                type: isArrival ? 'destinataire' : 'expediteur',
                dateAjout: new Date().toISOString(),
                agency: activeAgency,
                risque: 'low', segment: 'nouveau', taille: 'petit', ca: 0, factures: 0
            });
            if (appInstance) appInstance.showToast("Client créé avec succès !", "success");
            if (document.getElementById('newClientModal')) document.getElementById('newClientModal').style.display = 'none';
        } catch (e) {
            console.error(e);
            if (appInstance) appInstance.showToast("Erreur création", "error");
        }
    }
};
