import { db } from '../../../firebase-config.js';
import { collection, query, where, onSnapshot, doc, writeBatch, getDocs, orderBy, limit } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { Autocomplete } from './autocomplete.js';

export const ToutesLesFacturesView = {
    unsub: null,
    invoices: [],
    editItems: [],
    currentEditInvoice: null,
    filteredInvoices: [],
    currentSort: { field: 'date', direction: 'desc' },
    clientsData: new Map(),
    destMap: new Map(),
    destInfos: new Map(),
    destExpMap: new Map(),
    productsData: new Map(),
    availableDests: [],
    availableCommunes: [],

    render(app) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.toutesLesFactures = this;

        const html = `
            <div class="page">
                <!-- En-tête -->
                <div class="factures-header">
                    <div class="factures-header__content">
                        <div class="factures-header__icon">📄</div>
                        <div class="factures-header__info">
                            <h1 class="factures-header__title">Factures</h1>
                            <p class="factures-header__subtitle">Gestion des factures et colis envoyés</p>
                        </div>
                        <button class="btn-create-invoice" onclick="app.renderPage('invoice-new')">
                            ➕ Nouvelle facture
                        </button>
                    </div>
                </div>

                <!-- Filtres -->
                <div class="factures-filters">
                    <div class="filter-group filter-group--wide">
                        <label class="filter-label"><span class="filter-icon">🔍</span> Recherche</label>
                        <input type="text" id="searchInput" class="filter-input" placeholder="Référence, client, téléphone, date, montant…">
                    </div>
                    <div class="filter-group">
                        <label class="filter-label"><span class="filter-icon">💳</span> Statut</label>
                        <select id="statusFilter" class="filter-select">
                            <option value="">Tous</option>
                            <option value="payee">Payée</option>
                            <option value="acompte">Acompte</option>
                            <option value="impayee">Impayée</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label class="filter-label"><span class="filter-icon">📦</span> Conteneur</label>
                        <select id="containerFilter" class="filter-select">
                            <option value="">Tous</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label class="filter-label"><span class="filter-icon">📅</span> Du</label>
                        <input type="date" id="dateFrom" class="filter-input">
                    </div>
                    <div class="filter-group">
                        <label class="filter-label"><span class="filter-icon">📅</span> Au</label>
                        <input type="date" id="dateTo" class="filter-input">
                    </div>
                    <div class="filter-actions-group">
                        <button class="btn-export btn-export--excel" onclick="window.app.views.toutesLesFactures.exportExcel()">📊 Excel</button>
                        <button class="btn-export btn-export--pdf" onclick="window.app.views.toutesLesFactures.exportPDF()">📑 PDF</button>
                    </div>
                </div>

                <!-- Tableau -->
                <div class="factures-table-card">
                    <div class="factures-table-header">
                        <div class="factures-table-title">
                            <span class="factures-count-badge" id="invoiceCount">0</span>
                            <span>Factures trouvées</span>
                        </div>
                    </div>
                    <div class="table-wrap">
                        <table class="factures-table">
                            <thead>
                                <tr>
                                    <th class="th-sort" onclick="window.app.views.toutesLesFactures.sortBy('status')">Statut <span class="th-sort__icon"></span></th>
                                    <th class="th-sort" onclick="window.app.views.toutesLesFactures.sortBy('reference')">Référence <span class="th-sort__icon"></span></th>
                                    <th class="th-sort" onclick="window.app.views.toutesLesFactures.sortBy('date')">Date <span class="th-sort__icon"></span></th>
                                    <th class="col--client th-sort" onclick="window.app.views.toutesLesFactures.sortBy('client')">Client <span class="th-sort__icon"></span></th>
                                    <th>Adresse</th>
                                    <th>Téléphone</th>
                                    <th>Destinataire</th>
                                    <th class="col--amount th-sort" onclick="window.app.views.toutesLesFactures.sortBy('amount')" style="text-align: right;">Montant <span class="th-sort__icon"></span></th>
                                    <th style="text-align: right;">Nb colis</th>
                                    <th style="width: 240px;"></th>
                                </tr>
                            </thead>
                            <tbody id="invoicesTableBody">
                                <tr><td colspan="10" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <!-- Conteneur pour les fenêtres modales -->
                <div id="tlfModalsContainer"></div>
            </div>

            <style>
                .factures-header {
                    background: white;
                    border-radius: 16px;
                    margin-bottom: 24px;
                    border: 1px solid #e2e8f0;
                    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
                }
                .factures-header__content {
                    display: flex;
                    align-items: center;
                    gap: 20px;
                    padding: 20px 24px;
                    flex-wrap: wrap;
                }
                .factures-header__icon {
                    font-size: 32px;
                    background: #fef3c7;
                    width: 56px;
                    height: 56px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 14px;
                }
                .factures-header__info {
                    flex: 1;
                }
                .factures-header__title {
                    margin: 0;
                    font-size: 22px;
                    font-weight: 700;
                    color: #0f172a;
                }
                .factures-header__subtitle {
                    margin: 4px 0 0;
                    font-size: 13px;
                    color: #64748b;
                }
                .btn-create-invoice {
                    background: #3b82f6;
                    color: white;
                    border: none;
                    padding: 12px 20px;
                    border-radius: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .btn-create-invoice:hover {
                    background: #2563eb;
                    transform: translateY(-2px);
                }
                .factures-filters {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 16px;
                    background: white;
                    padding: 20px 24px;
                    border-radius: 16px;
                    border: 1px solid #e2e8f0;
                    margin-bottom: 24px;
                }
                .filter-group {
                    flex: 1;
                    min-width: 150px;
                }
                .filter-group--wide {
                    flex: 2;
                }
                .filter-label {
                    display: block;
                    font-size: 11px;
                    font-weight: 600;
                    text-transform: uppercase;
                    color: #64748b;
                    margin-bottom: 6px;
                }
                .filter-icon {
                    margin-right: 4px;
                }
                .filter-input, .filter-select {
                    width: 100%;
                    padding: 10px 12px;
                    border: 1px solid #e2e8f0;
                    border-radius: 10px;
                    font-size: 14px;
                    transition: all 0.2s;
                }
                .filter-input:focus, .filter-select:focus {
                    outline: none;
                    border-color: #3b82f6;
                    box-shadow: 0 0 0 3px rgba(59,130,246,0.1);
                }
                .filter-actions-group {
                    display: flex;
                    gap: 10px;
                    align-items: flex-end;
                }
                .btn-export {
                    padding: 10px 16px;
                    border-radius: 10px;
                    font-weight: 600;
                    font-size: 13px;
                    cursor: pointer;
                    transition: all 0.2s;
                    border: none;
                }
                .btn-export--excel {
                    background: #10b981;
                    color: white;
                }
                .btn-export--pdf {
                    background: #ef4444;
                    color: white;
                }
                .btn-export:hover {
                    transform: translateY(-2px);
                    filter: brightness(1.05);
                }
                .factures-table-card {
                    background: white;
                    border-radius: 16px;
                    border: 1px solid #e2e8f0;
                    overflow: hidden;
                }
                .factures-table-header {
                    padding: 16px 24px;
                    border-bottom: 1px solid #e2e8f0;
                    background: #f8fafc;
                }
                .factures-table-title {
                    font-size: 14px;
                    font-weight: 500;
                    color: #475569;
                }
                .factures-count-badge {
                    background: #e2e8f0;
                    padding: 4px 10px;
                    border-radius: 20px;
                    font-size: 12px;
                    font-weight: 600;
                    margin-right: 8px;
                }
                .table-wrap {
                    overflow-x: auto;
                }
                .factures-table {
                    width: 100%;
                    border-collapse: collapse;
                }
                .factures-table th {
                    text-align: left;
                    padding: 16px 12px;
                    background: #f8fafc;
                    font-size: 12px;
                    font-weight: 600;
                    color: #475569;
                    border-bottom: 1px solid #e2e8f0;
                    cursor: pointer;
                    user-select: none;
                }
                .factures-table th:hover {
                    background: #f1f5f9;
                }
                .factures-table td {
                    padding: 14px 12px;
                    border-bottom: 1px solid #f1f5f9;
                    font-size: 13px;
                    color: #334155;
                }
                .factures-table tr:hover {
                    background: #f8fafc;
                }
                .th-sort {
                    position: relative;
                }
                .th-sort__icon {
                    display: inline-block;
                    width: 0;
                    height: 0;
                    margin-left: 6px;
                    border-left: 4px solid transparent;
                    border-right: 4px solid transparent;
                }
                .th-sort--asc .th-sort__icon {
                    border-bottom: 5px solid #3b82f6;
                    border-top: none;
                }
                .th-sort--desc .th-sort__icon {
                    border-top: 5px solid #3b82f6;
                    border-bottom: none;
                }
                .col--amount {
                    text-align: right;
                }
                .cell--amount {
                    text-align: right;
                    font-weight: 700;
                }
                .status-badge {
                    display: inline-block;
                    padding: 4px 12px;
                    border-radius: 20px;
                    font-size: 11px;
                    font-weight: 600;
                }
                .badge--paid {
                    background: #dcfce7;
                    color: #166534;
                }
                .badge--unpaid {
                    background: #fee2e2;
                    color: #991b1b;
                }
                .badge--deposit {
                    background: #fef3c7;
                    color: #92400e;
                }
                .row-actions {
                    display: flex;
                    gap: 8px;
                    justify-content: flex-end;
                }
                .icon-btn {
                    width: 32px;
                    height: 32px;
                    border-radius: 8px;
                    border: 1px solid #e2e8f0;
                    background: white;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                }
                .icon-btn:hover {
                    background: #f1f5f9;
                    transform: scale(1.05);
                }
                .btn--view:hover { color: #3b82f6; border-color: #3b82f6; }
                .btn--pay:hover { color: #10b981; border-color: #10b981; }
                .btn--edit:hover { color: #f59e0b; border-color: #f59e0b; }
                .btn--reuse:hover { color: #8b5cf6; border-color: #8b5cf6; }
                .btn--del:hover { color: #ef4444; border-color: #ef4444; background: #fef2f2; }
                .amount-link {
                    background: none;
                    border: none;
                    font-weight: 700;
                    color: #3b82f6;
                    cursor: pointer;
                    font-size: 13px;
                }
                .amount-link:hover {
                    text-decoration: underline;
                }
                .tooltip {
                    position: relative;
                    cursor: help;
                }
                .tooltip[data-tooltip]:hover::after {
                    content: attr(data-tooltip);
                    position: absolute;
                    bottom: 100%;
                    left: 0;
                    background: #1e293b;
                    color: white;
                    padding: 4px 8px;
                    border-radius: 6px;
                    font-size: 11px;
                    white-space: nowrap;
                    z-index: 10;
                }
            </style>
        `;

        document.getElementById('contentContainer').innerHTML = html;

        // Attacher les événements
        document.getElementById('searchInput')?.addEventListener('input', () => this.applyFilters());
        document.getElementById('statusFilter')?.addEventListener('change', () => this.applyFilters());
        document.getElementById('containerFilter')?.addEventListener('change', () => this.applyFilters());
        document.getElementById('dateFrom')?.addEventListener('change', () => this.applyFilters());
        document.getElementById('dateTo')?.addEventListener('change', () => this.applyFilters());

        this.loadData();
        this.loadContainers();
        this.loadAutocompleteData();
    },

    async loadAutocompleteData() {
        try {
            const clientsSnap = await getDocs(collection(db, "clients"));
            this.clientsData.clear();
            clientsSnap.forEach(doc => {
                const data = doc.data();
                if (data.nom) {
                    this.clientsData.set(data.nom.trim(), data);
                }
            });

            const livSnap = await getDocs(collection(db, "livraisons"));
            const communesSet = new Set(['ABOBO', 'ADJAME', 'ATTECOUBE', 'BINGERVILLE', 'COCODY', 'KOUMASSI', 'MARCORY', 'PLATEAU', 'PORT-BOUET', 'YOPOUGON', 'PAS DE LIVRAISON (Retrait Entrepôt)']);
            const destSet = new Set();

            livSnap.forEach(doc => {
                const data = doc.data();
                if (data.lieuLivraison && data.lieuLivraison.trim() !== '') communesSet.add(data.lieuLivraison.trim());
                if (data.destinataire && data.destinataire.trim() !== '') {
                    const destName = data.destinataire.trim();
                    destSet.add(destName);
                    if (data.lieuLivraison && !this.destMap.has(destName)) this.destMap.set(destName, data.lieuLivraison.trim());
                    if (data.numero && !this.destInfos.has(destName)) this.destInfos.set(destName, data.numero.trim());
                    if (data.expediteur && !this.destExpMap.has(destName)) this.destExpMap.set(destName, data.expediteur.trim());
                }
            });

            this.availableCommunes = Array.from(communesSet).sort();
            this.availableDests = Array.from(destSet).sort();

            const prodSnap = await getDocs(collection(db, "products"));
            this.productsData.clear();
            prodSnap.forEach(doc => {
                const data = doc.data();
                if (data.desc) this.productsData.set(data.desc.trim(), data);
            });
        } catch (e) {
            console.error("Erreur de chargement de l'auto-complétion :", e);
        }
    },

    async loadContainers() {
        try {
            const containersSnap = await getDocs(collection(db, "containers"));
            const select = document.getElementById('containerFilter');
            if (select) {
                const options = containersSnap.docs.map(doc => `<option value="${doc.id}">${doc.data().number || doc.id}</option>`);
                select.innerHTML = '<option value="">Tous</option>' + options.join('');
            }
        } catch(e) {
            console.error("Erreur chargement conteneurs:", e);
        }
    },

    loadData() {
        if (this.unsub) this.unsub();
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
        
        const q = query(collection(db, "transactions"), where("agency", "==", activeAgency), where("isDeleted", "==", false));
        
        this.unsub = onSnapshot(q, (snapshot) => {
            this.invoices = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            this.invoices.sort((a, b) => new Date(b.date) - new Date(a.date));
            this.applyFilters();
        });
    },

    sortBy(field) {
        if (this.currentSort.field === field) {
            this.currentSort.direction = this.currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.currentSort.field = field;
            this.currentSort.direction = 'asc';
        }
        this.applyFilters();
    },

    applyFilters() {
        const searchTerm = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
        const status = document.getElementById('statusFilter')?.value || '';
        const container = document.getElementById('containerFilter')?.value || '';
        const dateFrom = document.getElementById('dateFrom')?.value;
        const dateTo = document.getElementById('dateTo')?.value;

        let filtered = [...this.invoices];

        // Filtre recherche
        if (searchTerm) {
            filtered = filtered.filter(inv => 
                (inv.reference || '').toLowerCase().includes(searchTerm) ||
                (inv.nom || '').toLowerCase().includes(searchTerm) ||
                (inv.tel || '').includes(searchTerm)
            );
        }

        // Filtre statut
        if (status) {
            const isPayee = status === 'payee';
            filtered = filtered.filter(inv => {
                const reste = Math.abs(parseFloat(inv.reste) || 0);
                if (status === 'payee') return reste <= 0;
                if (status === 'impayee') return reste > 0;
                if (status === 'acompte') return reste > 0 && reste < (parseFloat(inv.prix) || 0);
                return true;
            });
        }

        // Filtre conteneur
        if (container) {
            filtered = filtered.filter(inv => inv.containerId === container);
        }

        // Filtre dates
        if (dateFrom) {
            filtered = filtered.filter(inv => inv.date >= dateFrom);
        }
        if (dateTo) {
            filtered = filtered.filter(inv => inv.date <= dateTo);
        }

        // Tri
        filtered.sort((a, b) => {
            let aVal, bVal;
            switch(this.currentSort.field) {
                case 'reference': aVal = a.reference || ''; bVal = b.reference || ''; break;
                case 'client': aVal = a.nom || ''; bVal = b.nom || ''; break;
                case 'date': aVal = new Date(a.date); bVal = new Date(b.date); break;
                case 'amount': aVal = parseFloat(a.prix) || 0; bVal = parseFloat(b.prix) || 0; break;
                case 'status': aVal = Math.abs(parseFloat(a.reste) || 0) <= 0 ? 1 : 0; bVal = Math.abs(parseFloat(b.reste) || 0) <= 0 ? 1 : 0; break;
                default: aVal = new Date(a.date); bVal = new Date(b.date);
            }
            if (aVal < bVal) return this.currentSort.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return this.currentSort.direction === 'asc' ? 1 : -1;
            return 0;
        });

        this.filteredInvoices = filtered;
        this.renderTable();
    },

    renderTable() {
        const tbody = document.getElementById('invoicesTableBody');
        const countSpan = document.getElementById('invoiceCount');
        
        if (!tbody) return;
        
        if (countSpan) countSpan.textContent = this.filteredInvoices.length;

        if (this.filteredInvoices.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 40px; color: #64748b;">Aucune facture trouvée</td></tr>';
            return;
        }

        const TAUX = 656;
        
        tbody.innerHTML = this.filteredInvoices.map(inv => {
            const totalEUR = (parseFloat(inv.prix) || 0) / TAUX;
            const resteEUR = Math.abs(parseFloat(inv.reste) || 0) / TAUX;
            const isPayee = resteEUR <= 0;
            const isDeposit = resteEUR > 0 && resteEUR < totalEUR;
            
            let statusClass = 'badge--unpaid';
            let statusText = 'Impayée';
            if (isPayee) {
                statusClass = 'badge--paid';
                statusText = 'Payée';
            } else if (isDeposit) {
                statusClass = 'badge--deposit';
                statusText = 'Acompte';
            }

            const address = inv.adresseDestinataire || inv.adresse || '-';
            const shortAddress = address.length > 30 ? address.substring(0, 27) + '...' : address;

            // Calcul précis et rétroactif du nombre de colis
            let nbColis = 1;
            if (inv.items && Array.isArray(inv.items)) {
                nbColis = inv.items.reduce((sum, item) => sum + (parseInt(item.qty) || 1), 0);
            } else if (inv.quantite) {
                nbColis = inv.quantite;
            } else if (inv.description) {
                let parsedQty = 0;
                inv.description.split(',').forEach(part => {
                    const m = part.trim().match(/^(\d+)x/);
                    if (m) parsedQty += parseInt(m[1]);
                    else parsedQty += 1;
                });
                nbColis = parsedQty > 0 ? parsedQty : 1;
            }

            return `
                <tr data-invoice-id="${inv.id}">
                    <td data-label="Statut"><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td data-label="Référence" style="font-weight: 900;">
                        <button class="amount-link" onclick="window.app.views.toutesLesFactures.viewInvoice('${inv.id}')">${inv.reference || '-'}</button>
                    </td>
                    <td data-label="Date">${inv.date ? new Date(inv.date).toLocaleDateString('fr-FR') : '-'}</td>
                    <td data-label="Client" class="cell--client"><strong>${inv.nom || '-'}</strong></td>
                    <td data-label="Adresse" class="cell--address"><span class="tooltip" data-tooltip="${address.replace(/"/g, '&quot;')}">${shortAddress}</span></td>
                    <td data-label="Téléphone">${inv.tel || '-'}</td>
                    <td data-label="Destinataire">${inv.nomDestinataire || '-'}</td>
                    <td data-label="Montant" class="cell--amount"><button class="amount-link" onclick="window.app.views.toutesLesFactures.viewInvoice('${inv.id}')">${this.app.formatMoney(totalEUR)}</button></td>
                    <td data-label="Nb colis" style="text-align: right; font-weight: bold; color: #0f172a;">${nbColis}</td>
                    <td data-label="Actions" style="text-align: right;">
                        <div class="row-actions">
                            <button class="icon-btn btn--view" onclick="window.app.views.toutesLesFactures.viewInvoice('${inv.id}')" title="Voir">👁️</button>
                            <button class="icon-btn btn--pay" onclick="window.app.views.toutesLesFactures.addPayment('${inv.id}')" title="Ajouter paiement">💰</button>
                            <button class="icon-btn btn--edit" onclick="window.app.views.toutesLesFactures.editInvoice('${inv.id}')" title="Modifier">✏️</button>
                            <button class="icon-btn btn--reuse" onclick="window.app.views.toutesLesFactures.reuseInvoice('${inv.id}')" title="Réutiliser">📋</button>
                            <button class="icon-btn btn--del" onclick="window.app.views.toutesLesFactures.deleteInvoice('${inv.id}')" title="Supprimer">🗑️</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // Mettre à jour les indicateurs de tri
        document.querySelectorAll('.th-sort').forEach(th => {
            th.classList.remove('th-sort--asc', 'th-sort--desc');
        });
        const activeTh = document.querySelector(`.th-sort[onclick*="sortBy('${this.currentSort.field}')"]`);
        if (activeTh) {
            activeTh.classList.add(`th-sort--${this.currentSort.direction}`);
        }
    },

    async viewInvoice(id) {
        const invoice = this.invoices.find(i => i.id === id);
        if (!invoice) return;
        
        // Affiche un état de chargement en attendant les requêtes
        document.getElementById('tlfModalsContainer').innerHTML = `
            <div class="modal active" style="z-index: 10000; position: fixed; inset: 0; background: rgba(15,23,42,0.6); display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px);">
                <div style="background: white; padding: 30px; border-radius: 16px; text-align: center; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);">
                    <i class="fas fa-spinner fa-spin fa-2x" style="color: #3b82f6; margin-bottom: 15px;"></i>
                    <div style="font-weight: 700; color: #1e293b;">Chargement des informations...</div>
                </div>
            </div>
        `;

        const { getDocs, query, collection, where } = await import("https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js");
        
        // 1. Récupération des données logistiques (Pour la traçabilité)
        const livQ = await getDocs(query(collection(db, "livraisons"), where("ref", "==", invoice.reference)));
        const livraisons = livQ.docs.map(d => ({id: d.id, ...d.data()}));

        // 2. Récupération des données clients (Pour le téléphone de l'expéditeur)
        let expPhone = 'Non renseigné';
        let expAddress = 'Non renseignée';
        const clientQ = await getDocs(query(collection(db, "clients"), where("nom", "==", invoice.nom)));
        if (!clientQ.empty) {
            const cData = clientQ.docs[0].data();
            if (cData.tel) expPhone = cData.tel;
            if (cData.adresse) expAddress = cData.adresse;
        }

        const TAUX = 656;
        const total = (parseFloat(invoice.prix) || 0) / TAUX;
        const paye = ((parseFloat(invoice.montantParis) || 0) + (parseFloat(invoice.montantAbidjan) || 0)) / TAUX;
        const reste = Math.abs(parseFloat(invoice.reste) || 0) / TAUX;
        
        let statusText = reste <= 0 ? 'Payée' : (paye > 0 ? 'Acompte' : 'Impayée');
        let statusBg = reste <= 0 ? '#dcfce7' : (paye > 0 ? '#fef3c7' : '#fee2e2');
        let statusColor = reste <= 0 ? '#166534' : (paye > 0 ? '#92400e' : '#991b1b');

        // Nettoyage du Destinataire et extraction du téléphone
        let destName = invoice.nomDestinataire || '';
        let destPhone = invoice.numero || invoice.tel || 'Non renseigné';
        const phoneMatch = destName.match(/(?:(?:\+|00)225[\s.-]?)?(?:01|05|07|0)\d(?:[\s.-]?\d{2}){4}|(?:(?:\+|00)225[\s.-]?)?(?:01|05|07|0)\d{8,}/);
        if (phoneMatch) {
            destName = destName.replace(phoneMatch[0], '').replace(/[-–,;:\/\s]+$/, '').trim();
            if (destPhone === 'Non renseigné') destPhone = phoneMatch[0];
        }

        // Cartographie des descriptions spécifiques par sous-colis
        let descMap = {};
        let currentLabelIdx = 1;
        if (invoice.items && Array.isArray(invoice.items)) {
            invoice.items.forEach(item => {
                const qty = parseInt(item.qty) || 1;
                for (let i = 0; i < qty; i++) {
                    descMap[currentLabelIdx] = item.desc;
                    currentLabelIdx++;
                }
            });
        }

        // Construction de la Traçabilité
        let trackingRows = '';
        let totalSubColis = 0;
        
        livraisons.forEach(liv => {
            const labels = liv.labels && liv.labels.length > 0 ? liv.labels : [liv.ref];
            totalSubColis += labels.length;
            

            labels.forEach(lbl => {
                let specificDesc = liv.description || invoice.description || 'Colis';
                const match = lbl.match(/_(\d+)_/);
                if (match && descMap[parseInt(match[1])]) {
                    specificDesc = descMap[parseInt(match[1])];
                }

                // 1. Statut individuel par défaut (Non scanné)
                let lblStatusDisplay = 'À traiter (Non scanné)';
                let lblStatusClass = 'colis-pending';
                let lblContainer = liv.conteneur || '-';

                // 2. Vérification individuelle via l'historique des scans
                if (liv.scanHistory && Array.isArray(liv.scanHistory)) {
                    const myScans = liv.scanHistory.filter(s => s.scanRef === lbl);
                    myScans.sort((a, b) => new Date(b.date) - new Date(a.date)); // Du plus récent au plus ancien

                    if (myScans.length > 0) {
                        const lastScan = myScans[0];
                        if (lastScan.type === 'ENTREPOT_PARIS') {
                            lblStatusDisplay = 'Mise en Entrepôt';
                            lblStatusClass = 'colis-paris';
                        } else if (lastScan.type === 'CONTENEUR_CHARGEMENT') {
                            lblStatusDisplay = 'Chargé (Conteneur)';
                            lblStatusClass = 'colis-transit';
                            lblContainer = lastScan.container || liv.conteneur || '-';
                        }
                    }
                }

                // 3. Surcharges globales pour les étapes ultérieures
                if (liv.containerStatus === 'A_VENIR') {
                    if (lblStatusClass === 'colis-transit') {
                        lblStatusDisplay = 'En Transit (Mer)';
                    } else {
                        lblStatusDisplay = 'Assigné (Conteneur)';
                        lblStatusClass = 'colis-transit';
                    }
                    lblContainer = liv.conteneur || lblContainer;
                } else if (liv.containerStatus === 'EN_COURS') {
                    lblStatusDisplay = 'Arrivé à Abidjan';
                    lblStatusClass = 'colis-abidjan';
                    lblContainer = liv.conteneur || lblContainer;
                }
                if (liv.status === 'LIVRE') {
                    lblStatusDisplay = 'Livré au destinataire';
                    lblStatusClass = 'colis-delivered';
                    lblContainer = liv.conteneur || lblContainer;
                }

                trackingRows += `
                    <tr>
                        <td style="font-weight: 900; font-family: monospace;">${lbl}</td>
                        <td class="modal-table__desc">${specificDesc}</td>
                        <td><span class="status-badge ${lblStatusClass}">${lblStatusDisplay}</span></td>
                        <td><span style="background:#f1f5f9; padding:4px 8px; border-radius:6px; font-weight:600;">${lblContainer}</span></td>
                        <td>${liv.departureDate ? new Date(liv.departureDate).toLocaleDateString('fr-FR') : '-'}</td>
                        <td>${liv.arrivalDate ? new Date(liv.arrivalDate).toLocaleDateString('fr-FR') : '-'}</td>
                    </tr>
                `;
            });
        });
        if (trackingRows === '') trackingRows = '<tr><td colspan="6" class="muted">Aucun scan ou donnée logistique trouvée.</td></tr>';

        // Construction Historique Paiement
        let paymentsHtml = '';
        if (invoice.paymentHistory && invoice.paymentHistory.length > 0) {
            paymentsHtml = invoice.paymentHistory.map(p => {
                const mTotal = ((parseFloat(p.montantParis) || 0) + (parseFloat(p.montantAbidjan) || 0)) / TAUX;
                return `
                    <tr>
                        <td>${p.date ? new Date(p.date).toLocaleString('fr-FR') : '-'}</td>
                        <td style="text-align: right; font-weight: 900; color: #0f172a;">${this.app.formatMoney(mTotal)}</td>
                        <td style="text-align: right; font-weight: 600; color: #10b981;">${this.app.formatMoney(mTotal)}</td>
                        <td><span style="background:#f1f5f9; padding:4px 8px; border-radius:6px; font-weight:600;">${p.modePaiement || 'Espèce'}</span></td>
                        <td style="text-align: right; font-weight: bold; color: #ef4444;">-</td>
                        <td>${p.saisiPar || p.agent || '-'}</td>
                        <td style="text-align: right;"><button class="btn btn-outline btn-small" title="Reçu" onclick="window.app.views.toutesLesFactures.printDocument('${invoice.id}', 'RECU')">🧾</button></td>
                    </tr>
                `;
            }).join('');
        } else {
            paymentsHtml = '<tr><td colspan="7" class="muted">Aucun paiement enregistré.</td></tr>';
        }

        // Transformation de la description en lignes pour le tableau
        let itemsList = '';
        if (invoice.items && Array.isArray(invoice.items)) {
            itemsList = invoice.items.map(item => `
                <tr>
                    <td class="modal-table__desc">${item.desc}</td>
                    <td style="text-align: right; font-weight:bold;">${item.qty}</td>
                    <td style="text-align: right;">${this.app.formatMoney(item.pu)}</td>
                    <td style="text-align: right; font-weight: 900; color:#0f172a;">${this.app.formatMoney(item.total)}</td>
                </tr>
            `).join('');
        } else {
            itemsList = (invoice.description || '-').split(',').map(d => {
                const match = d.trim().match(/^(\d+)x\s+(.+)$/);
                if(match) return `<tr><td class="modal-table__desc">${match[2]}</td><td style="text-align: right; font-weight:bold;">${match[1]}</td><td style="text-align: right;">-</td><td style="text-align: right; font-weight: 900; color:#0f172a;">-</td></tr>`;
                return `<tr><td class="modal-table__desc">${d}</td><td style="text-align: right; font-weight:bold;">1</td><td style="text-align: right;">-</td><td style="text-align: right; font-weight: 900; color:#0f172a;">-</td></tr>`;
            }).join('');
        }

        const html = `
            <style>
                .modal--detail .modal-content { max-width: 900px; width: 95%; padding: 0; background: #f8fafc; overflow: hidden; border-radius: 16px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); }
                .modal__header--detail { background: white; padding: 25px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: flex-start; }
                .modal__kicker { font-size: 12px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
                .modal__ref { font-size: 28px; font-weight: 900; color: #0f172a; margin-bottom: 8px; line-height: 1; }
                .modal__detail-subline { font-size: 13px; color: #475569; font-weight: 500; display: flex; gap: 8px; align-items: center; }
                .modal__detail-head-actions { display: flex; gap: 15px; align-items: center; }
                .modal__body--scroll { padding: 25px; overflow-y: auto; max-height: 75vh; }
                .detail-card { background: white; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.02); margin-bottom: 20px; overflow: hidden; }
                .detail-card__header { padding: 15px 20px; border-bottom: 1px solid #e2e8f0; background: #fff; }
                .detail-card__title { font-size: 16px; font-weight: 800; color: #1e293b; margin: 0; }
                .bilan-row { display: flex; }
                .bilan-pill { flex: 1; padding: 20px; border-right: 1px solid #e2e8f0; }
                .bilan-pill:last-child { border-right: none; }
                .bilan-pill__label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 8px; }
                .bilan-pill__value { font-size: 20px; font-weight: 900; color: #0f172a; }
                .bilan-pill--price .bilan-pill__value { color: #3b82f6; }
                .bilan-pill--paid .bilan-pill__value { color: #10b981; }
                .bilan-pill--remaining .bilan-pill__value { color: #ef4444; }
                .bilan-pill--status .bilan-pill__value { font-size: 14px; }
                .modal__grid { display: grid; grid-template-columns: 1fr 1fr; }
                @media (max-width: 768px) { .modal__grid { grid-template-columns: 1fr; } .bilan-row { flex-wrap: wrap; } .bilan-pill { border-right: none; border-bottom: 1px solid #e2e8f0; min-width: 50%; } }
                .modal__block { padding: 20px; border-right: 1px solid #e2e8f0; }
                .modal__block:last-child { border-right: none; }
                .info-title { display: flex; align-items: center; gap: 8px; margin-bottom: 15px; }
                .info-title__icon { color: #3b82f6; background: #eff6ff; padding: 6px; border-radius: 8px; display: flex; }
                .info-title__pill { font-size: 14px; font-weight: 700; color: #1e293b; }
                .info-rows { display: flex; flex-direction: column; gap: 12px; }
                .info-row { display: flex; align-items: flex-start; gap: 10px; }
                .info-row__icon { color: #94a3b8; margin-top: 2px; }
                .info-row__value { font-size: 13px; font-weight: 600; color: #334155; line-height: 1.4; }
                .row.detail-card__headerRow { display: flex; justify-content: space-between; align-items: center; padding: 15px 20px; border-bottom: 1px solid #e2e8f0; flex-wrap: wrap; gap: 15px; }
                .btn--doc { padding: 8px 12px; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: 0.2s; }
                .btn--doc-facture { background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; }
                .btn--doc-facture:hover { background: #dbeafe; }
                .btn--doc-etiquette { background: #fdf4ff; color: #9333ea; border: 1px solid #e9d5ff; }
                .btn--doc-etiquette:hover { background: #f3e8ff; }
                .btn--doc-attestation { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
                .btn--doc-attestation:hover { background: #fee2e2; }
                .btn--doc-livraison { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }
                .btn--doc-livraison:hover { background: #dcfce7; }
                .modal-actionsRow { display: flex; gap: 10px; flex-wrap: wrap; }
                .modal-table-wrap { overflow-x: auto; }
                .modal-table { width: 100%; border-collapse: collapse; }
                .modal-table th { text-align: left; padding: 12px 20px; font-size: 11px; font-weight: 700; color: #64748b; background: #f8fafc; border-bottom: 1px solid #e2e8f0; text-transform: uppercase; white-space: nowrap; }
                .modal-table td { padding: 15px 20px; font-size: 13px; color: #334155; border-bottom: 1px solid #f1f5f9; }
                .modal-table__desc { font-weight: 700; color: #0f172a; }
                .modal-sectionPill { display: inline-flex; align-items: center; gap: 8px; background: #f1f5f9; padding: 6px 12px; border-radius: 8px; font-weight: 700; font-size: 14px; color: #1e293b; }
                .modal-sectionPill__count { background: #3b82f6; color: white; padding: 2px 8px; border-radius: 12px; font-size: 12px; }
                .photos-actions { display: flex; gap: 10px; }
                .photos-input { display: none; }
                .muted { color: #64748b; font-size: 13px; padding: 20px; font-style: italic; text-align: center; }
                
                .colis-paris { background: #e0f2fe; color: #0284c7; }
                .colis-transit { background: #fef3c7; color: #b45309; }
                .colis-abidjan { background: #f3e8ff; color: #7e22ce; }
                .colis-delivered { background: #dcfce7; color: #166534; }
                .colis-pending { background: #f1f5f9; color: #475569; }
            </style>

            <div class="modal active modal--detail" style="z-index: 10000; position: fixed; inset: 0; background: rgba(15,23,42,0.6); display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px);">
                <div class="modal-content">
                    <div class="modal__header--detail">
                        <div>
                            <div class="modal__kicker">Voir facture</div>
                            <div class="modal__ref">${invoice.reference || '-'}</div>
                            <div class="modal__detail-subline">
                                <span>${invoice.nom || '-'}</span>
                                <span>•</span>
                                <span>${invoice.date ? new Date(invoice.date).toLocaleDateString('fr-FR') : '-'}</span>
                                <span>•</span>
                                <span>Facturé par ${invoice.saisiPar || 'Agent'}</span>
                            </div>
                        </div>
                        <div class="modal__detail-head-actions">
                            <span class="badge" style="background: ${statusBg}; color: ${statusColor}; padding: 6px 12px; border-radius: 20px; font-weight: 800; font-size: 13px;">${statusText}</span>
                            <button onclick="this.closest('.modal').remove()" style="background: #f1f5f9; border: none; font-size: 20px; cursor: pointer; color: #64748b; width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center;">✕</button>
                        </div>
                    </div>
                    
                    <div class="modal__body--scroll">
                        <!-- BILAN -->
                        <div class="detail-card">
                            <div class="detail-card__header"><h3 class="detail-card__title">Bilan</h3></div>
                            <div class="bilan-row">
                                <div class="bilan-pill bilan-pill--status">
                                    <div class="bilan-pill__label">STATUT</div>
                                    <div class="bilan-pill__value"><span class="badge" style="background: ${statusBg}; color: ${statusColor}; padding: 4px 10px; border-radius: 12px; font-size: 13px;">${statusText}</span></div>
                                </div>
                                <div class="bilan-pill bilan-pill--price">
                                    <div class="bilan-pill__label">PRIX TOTAL</div>
                                    <div class="bilan-pill__value">${this.app.formatMoney(total)}</div>
                                </div>
                                <div class="bilan-pill bilan-pill--paid">
                                    <div class="bilan-pill__label">MONTANT PAYÉ</div>
                                    <div class="bilan-pill__value">${this.app.formatMoney(paye)}</div>
                                </div>
                                <div class="bilan-pill bilan-pill--remaining">
                                    <div class="bilan-pill__label">RESTE À PAYER</div>
                                    <div class="bilan-pill__value">${this.app.formatMoney(reste)}</div>
                                </div>
                            </div>
                        </div>

                        <!-- INFO CLIENT -->
                        <div class="detail-card">
                            <div class="detail-card__header"><h3 class="detail-card__title">Information client</h3></div>
                            <div class="modal__grid">
                                <div class="modal__block">
                                    <div class="info-title">
                                        <span class="info-title__icon"><i class="fas fa-upload"></i></span>
                                        <span class="info-title__pill">Expéditeur</span>
                                    </div>
                                    <div class="info-rows">
                                        <div class="info-row"><span class="info-row__icon"><i class="fas fa-user"></i></span><span class="info-row__value">${invoice.nom || '-'}</span></div>
                                        <div class="info-row"><span class="info-row__icon"><i class="fas fa-phone"></i></span><span class="info-row__value">${expPhone}</span></div>
                                        <div class="info-row"><span class="info-row__icon"><i class="fas fa-map-marker-alt"></i></span><span class="info-row__value">${expAddress}</span></div>
                                    </div>
                                </div>
                                <div class="modal__block">
                                    <div class="info-title">
                                        <span class="info-title__icon" style="color: #10b981; background: #dcfce7;"><i class="fas fa-download"></i></span>
                                        <span class="info-title__pill">Destinataire</span>
                                    </div>
                                    <div class="info-rows">
                                        <div class="info-row"><span class="info-row__icon"><i class="fas fa-user"></i></span><span class="info-row__value">${destName || '-'}</span></div>
                                        <div class="info-row"><span class="info-row__icon"><i class="fas fa-phone"></i></span><span class="info-row__value">${destPhone}</span></div>
                                        <div class="info-row"><span class="info-row__icon"><i class="fas fa-map-marker-alt"></i></span><span class="info-row__value">${invoice.adresseDestinataire || '-'}</span></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- BOUTONS D'IMPRESSION -->
                        <div class="detail-card">
                            <div class="row detail-card__headerRow">
                                <div class="detail-card__title">Imprimer les documents</div>
                                <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                                    <button class="btn--doc btn--doc-facture" onclick="window.app.views.toutesLesFactures.printDocument('${invoice.id}', 'FACTURE')">📄 Facture</button>
                                    <button class="btn--doc btn--doc-etiquette" onclick="window.app.views.toutesLesFactures.printEtiquettes('${invoice.id}', 'A6')">🏷️ Étiquette A6</button>
                                    <button class="btn--doc btn--doc-etiquette" onclick="window.app.views.toutesLesFactures.printEtiquettes('${invoice.id}', 'A5')">🏷️ Étiquette A5</button>
                                    <button class="btn--doc btn--doc-attestation" onclick="window.app.views.toutesLesFactures.printDocument('${invoice.id}', 'ATTESTATION')">📋 Attestation</button>
                                    <button class="btn--doc btn--doc-livraison" onclick="window.app.views.toutesLesFactures.printDocument('${invoice.id}', 'BL')">🚚 Bon de livraison</button>
                                </div>
                            </div>
                        </div>

                        <!-- ACTIONS SUR FACTURE -->
                        <div class="detail-card">
                            <div class="row detail-card__headerRow" style="align-items: center;">
                                <div class="detail-card__title">Actions sur facture</div>
                                <div class="modal-actionsRow">
                                    <button class="btn btn-outline" style="color: #10b981; border-color: #10b981;" onclick="window.app.views.toutesLesFactures.addPayment('${invoice.id}'); this.closest('.modal').remove();">💰 Ajouter un paiement</button>
                                    <button class="btn btn-outline" style="color: #f59e0b; border-color: #f59e0b;" onclick="window.app.views.toutesLesFactures.editInvoice('${invoice.id}'); this.closest('.modal').remove();">✏️ Modifier</button>
                                    <button class="btn btn-outline" style="color: #ef4444; border-color: #ef4444;" onclick="window.app.views.toutesLesFactures.deleteInvoice('${invoice.id}')">🗑️ Supprimer</button>
                                </div>
                            </div>
                        </div>

                        <!-- DESCRIPTION -->
                        <div class="detail-card">
                            <div class="detail-card__header"><h3 class="detail-card__title">Description facture</h3></div>
                            <div class="modal-table-wrap">
                                <table class="modal-table">
                                    <thead><tr><th>Description</th><th style="text-align: right;">Quantité</th><th style="text-align: right;">Prix unitaire</th><th style="text-align: right;">Prix total</th></tr></thead>
                                    <tbody>${itemsList}</tbody>
                                </table>
                            </div>
                        </div>

                        <!-- TRACABILITE -->
                        <div class="detail-card">
                            <div class="row detail-card__headerRow">
                                <div class="modal-sectionPill">Suivi de colis & traçabilité <span class="modal-sectionPill__count">${totalSubColis}</span></div>
                            </div>
                            <div class="modal-table-wrap">
                                <table class="modal-table">
                                    <thead><tr><th>RÉFÉRENCE</th><th>DESCRIPTION</th><th>STATUT</th><th>CONTENEUR</th><th>DATE DÉPART</th><th>DATE ARRIVÉE</th></tr></thead>
                                    <tbody>${trackingRows}</tbody>
                                </table>
                            </div>
                        </div>

                        <!-- PAIEMENTS -->
                        <div class="detail-card">
                            <div class="row detail-card__headerRow">
                                <div class="modal-sectionPill">Historique des paiements <span class="modal-sectionPill__count">${(invoice.paymentHistory || []).length}</span></div>
                            </div>
                            <div class="modal-table-wrap">
                                <table class="modal-table">
                                    <thead><tr><th>DATE</th><th style="text-align: right;">PRIX</th><th style="text-align: right;">PAYER</th><th>MODE PAIEMENT</th><th style="text-align: right;">RESTE</th><th>AGENT</th><th style="text-align: right;">ACTION</th></tr></thead>
                                    <tbody>${paymentsHtml}</tbody>
                                </table>
                            </div>
                        </div>

                        <!-- PHOTOS / PREUVES (Placeholders) -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                            <div class="detail-card">
                                <div class="row detail-card__headerRow">
                                    <div class="modal-sectionPill">Photos des colis <span class="modal-sectionPill__count">0</span></div>
                                </div>
                                <div class="muted">Aucune photo</div>
                            </div>
                            <div class="detail-card">
                                <div class="row detail-card__headerRow">
                                    <div class="modal-sectionPill">Preuve de livraison <span class="modal-sectionPill__count">0</span></div>
                                </div>
                                <div class="muted">Aucune preuve</div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        `;
        
        document.getElementById('tlfModalsContainer').innerHTML = html;
    },

    async addPayment(id) {
        const inv = this.invoices.find(i => i.id === id);
        if (!inv) return;
        const TAUX = 656;
        const total = (parseFloat(inv.prix) || 0) / TAUX;
        const paye = ((parseFloat(inv.montantParis) || 0) + (parseFloat(inv.montantAbidjan) || 0)) / TAUX;
        const reste = Math.abs(parseFloat(inv.reste) || 0) / TAUX;

        const html = `
        <div class="modal active" style="z-index: 10000; position: fixed; inset: 0; background: rgba(15,23,42,0.6); display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px);">
            <div style="background: white; border-radius: 16px; width: 450px; max-width: 90%; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);">
                <div style="padding: 20px 25px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; background: #f8fafc;">
                    <div>
                        <div style="font-size: 12px; color: #64748b; font-weight: 800; text-transform: uppercase;">Facture ${inv.reference}</div>
                        <div style="font-size: 18px; font-weight: 900; color: #0f172a;">Ajouter un paiement</div>
                    </div>
                    <button onclick="this.closest('.modal').remove()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #64748b;">✕</button>
                </div>
                
                <div style="padding: 25px; background: white;">
                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 15px; margin-bottom: 20px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                            <span style="color: #64748b; font-size: 13px; font-weight: 600;">Prix du colis</span>
                            <span style="font-weight: 800; color: #1e293b;">${this.app.formatMoney(total)}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                            <span style="color: #64748b; font-size: 13px; font-weight: 600;">Déjà payé</span>
                            <span style="font-weight: 800; color: #10b981;">${this.app.formatMoney(paye)}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding-top: 10px; border-top: 1px dashed #cbd5e1;">
                            <span style="color: #0f172a; font-size: 13px; font-weight: 800;">Reste à payer</span>
                            <span style="font-weight: 900; color: #ef4444; font-size: 16px;">${this.app.formatMoney(reste)}</span>
                        </div>
                    </div>

                    <div class="form-group" style="margin-bottom: 15px;">
                        <label style="font-size: 12px; font-weight: 800; color: #475569; margin-bottom: 6px; display: block;">Mode de paiement *</label>
                        <select id="tlfPayMode" style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #cbd5e1; font-weight: 600; outline: none;">
                            <option value="ESPECES">ESPÈCES</option>
                            <option value="CB">CARTE BANCAIRE</option>
                            <option value="CHEQUES">CHÈQUE</option>
                            <option value="VIREMENTS">VIREMENT</option>
                            <option value="BON D ENVOI">BON D'ENVOI</option>
                        </select>
                    </div>

                    <div class="form-group" style="margin-bottom: 5px;">
                        <label style="font-size: 12px; font-weight: 800; color: #475569; margin-bottom: 6px; display: block;">Montant encaissé (€) *</label>
                        <input type="number" id="tlfPayAmount" step="0.01" max="${reste}" value="${reste}" style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #cbd5e1; font-weight: 900; font-size: 18px; outline: none; color: #3b82f6;">
                    </div>
                </div>
                
                <div style="padding: 20px 25px; border-top: 1px solid #e2e8f0; background: #f8fafc; display: flex; justify-content: flex-end; gap: 10px;">
                    <button class="btn btn-outline" onclick="this.closest('.modal').remove()" style="padding: 10px 15px; font-weight: 600;">Annuler</button>
                    <button class="btn btn-primary" onclick="window.app.views.toutesLesFactures.savePayment('${inv.id}')" ${reste <= 0 ? 'disabled' : ''} style="padding: 10px 20px; font-weight: 600;">
                        <i class="fas fa-check"></i> Valider le paiement
                    </button>
                </div>
            </div>
        </div>
        `;
        document.getElementById('tlfModalsContainer').innerHTML = html;
    },

    async savePayment(id) {
        const inv = this.invoices.find(i => i.id === id);
        if (!inv) return;

        const TAUX = 656;
        const amountEur = parseFloat(document.getElementById('tlfPayAmount').value) || 0;
        const mode = document.getElementById('tlfPayMode').value;
        const amountCfa = Math.round(amountEur * TAUX);

        if (amountEur <= 0) {
            this.app.showToast("Le montant doit être supérieur à 0.", "error");
            return;
        }

        try {
            const btn = document.querySelector('#tlfModalsContainer .btn-primary');
            if(btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Traitement...'; btn.disabled = true; }

            const newMontantParis = (parseFloat(inv.montantParis) || 0) + amountCfa;
            const newReste = (parseFloat(inv.reste) || 0) + amountCfa; // Reste est négatif dans Firestore

            const historyItem = {
                date: new Date().toISOString().split('T')[0],
                montantParis: amountCfa,
                montantAbidjan: 0,
                modePaiement: mode,
                saisiPar: sessionStorage.getItem('userName') || 'Agent Paris'
            };

            const { updateDoc, doc, arrayUnion } = await import("https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js");
            
            await updateDoc(doc(db, "transactions", id), {
                montantParis: newMontantParis,
                reste: newReste,
                paymentHistory: arrayUnion(historyItem)
            });

            this.app.showToast("Paiement enregistré avec succès !", "success");
            document.getElementById('tlfModalsContainer').innerHTML = ''; // Fermer modal
        } catch(e) {
            console.error(e);
            this.app.showToast("Erreur lors de l'enregistrement", "error");
        }
    },

    async editInvoice(id) {
        const inv = this.invoices.find(i => i.id === id);
        if (!inv) return;
        
        const TAUX = 656;
        const total = (parseFloat(inv.prix) || 0) / TAUX;
        const paye = ((parseFloat(inv.montantParis) || 0) + (parseFloat(inv.montantAbidjan) || 0)) / TAUX;
        const reste = total - paye;

        this.currentEditInvoice = inv;
        this.editItems = inv.items && Array.isArray(inv.items) && inv.items.length > 0 
            ? JSON.parse(JSON.stringify(inv.items)) 
            : [{ id: Date.now(), desc: inv.description || '', qty: 1, pu: total, total: total, vol: inv.volumeCBM || 0 }];

        const html = `
        <div class="modal active" style="z-index: 10000; position: fixed; inset: 0; background: rgba(15,23,42,0.6); display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px);">
            <div style="background: white; border-radius: 16px; width: 900px; max-width: 95%; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);">
                <!-- Header -->
                <div style="padding: 20px 25px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; background: #f8fafc;">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <div style="font-size: 24px; background: #eff6ff; color: #3b82f6; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: 12px;">✏️</div>
                        <div>
                            <h2 style="margin: 0; font-size: 20px; font-weight: 800; color: #0f172a;">Modifier la facture</h2>
                            <div style="font-size: 13px; color: #64748b; font-weight: 600; margin-top: 4px;">Facture <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px; color: #1e293b;">${inv.reference}</code></div>
                        </div>
                    </div>
                    <button onclick="this.closest('.modal').remove()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #64748b;">✕</button>
                </div>
                
                <!-- Body -->
                <div style="padding: 25px; overflow-y: auto; flex: 1; background: #f1f5f9; display: flex; flex-direction: column; gap: 20px;">
                    <!-- Expéditeur & Destinataire -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                        <div style="background: white; border-radius: 12px; border: 1px solid #e2e8f0; overflow: visible;">
                            <div style="padding: 12px 15px; background: #f8fafc; border-radius: 12px 12px 0 0; border-bottom: 1px solid #e2e8f0; font-weight: 800; color: #1e293b; display: flex; align-items: center; gap: 8px;">
                                <i class="fas fa-upload" style="color: #3b82f6;"></i> Client (Expéditeur)
                            </div>
                            <div style="padding: 15px; display: flex; flex-direction: column; gap: 15px;">
                                <div>
                                    <label style="font-size: 12px; font-weight: 700; color: #475569; display: block; margin-bottom: 6px;">Nom complet</label>
                                    <div style="position: relative;">
                                        <input type="text" id="tlfEditExp" value="${inv.nom || ''}" autocomplete="off" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; outline: none; font-weight: 600; box-sizing: border-box;">
                                        <ul id="tlfEditExpSuggestions" class="autocomplete-suggestions"></ul>
                                    </div>
                                    <div id="tlfEditExpFeedback" style="font-size: 11px; color: #64748b; margin-top: 4px;"></div>
                                </div>
                                <div>
                                    <label style="font-size: 12px; font-weight: 700; color: #475569; display: block; margin-bottom: 6px;">Conteneur assigné</label>
                                    <input type="text" id="tlfEditConteneur" value="${inv.conteneur || 'ATT'}" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; outline: none; font-weight: 600; box-sizing: border-box; text-transform: uppercase;">
                                </div>
                            </div>
                        </div>

                        <div style="background: white; border-radius: 12px; border: 1px solid #e2e8f0; overflow: visible;">
                            <div style="padding: 12px 15px; background: #f8fafc; border-radius: 12px 12px 0 0; border-bottom: 1px solid #e2e8f0; font-weight: 800; color: #1e293b; display: flex; align-items: center; gap: 8px;">
                                <i class="fas fa-download" style="color: #10b981;"></i> Destinataire
                            </div>
                            <div style="padding: 15px; display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                                <div style="grid-column: 1 / -1;">
                                    <label style="font-size: 12px; font-weight: 700; color: #475569; display: block; margin-bottom: 6px;">Nom complet</label>
                                    <div style="position: relative;">
                                        <input type="text" id="tlfEditDest" value="${inv.nomDestinataire || ''}" autocomplete="off" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; outline: none; font-weight: 600; box-sizing: border-box;">
                                        <ul id="tlfEditDestSuggestions" class="autocomplete-suggestions"></ul>
                                    </div>
                                    <div id="tlfEditDestFeedback" style="font-size: 11px; color: #64748b; margin-top: 4px;"></div>
                                </div>
                                <div>
                                    <label style="font-size: 12px; font-weight: 700; color: #475569; display: block; margin-bottom: 6px;">Téléphone</label>
                                    <input type="text" id="tlfEditTel" value="${inv.numero || inv.tel || ''}" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; outline: none; font-weight: 600; box-sizing: border-box;">
                                </div>
                                <div>
                                    <label style="font-size: 12px; font-weight: 700; color: #475569; display: block; margin-bottom: 6px;">Lieu / Adresse</label>
                                    <div style="position: relative;">
                                        <input type="text" id="tlfEditLieu" value="${inv.adresseDestinataire || ''}" autocomplete="off" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; outline: none; font-weight: 600; box-sizing: border-box;">
                                        <ul id="tlfEditLieuSuggestions" class="autocomplete-suggestions"></ul>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Tarification & Items -->
                    <div style="background: white; border-radius: 12px; border: 1px solid #e2e8f0; overflow: visible;">
                        <div style="padding: 12px 15px; background: #f8fafc; border-radius: 12px 12px 0 0; border-bottom: 1px solid #e2e8f0; font-weight: 800; color: #1e293b; display: flex; justify-content: space-between; align-items: center;">
                            <div style="display: flex; align-items: center; gap: 8px;"><i class="fas fa-box" style="color: #8b5cf6;"></i> Tarification & description colis</div>
                            <button class="btn btn-outline btn-small" onclick="window.app.views.toutesLesFactures.addEditItemRow()" style="padding: 6px 12px; font-size: 12px; border-radius: 6px;"><i class="fas fa-plus"></i> Ajouter ligne</button>
                        </div>
                        <div style="padding: 15px;">
                            <div id="tlfEditItemsContainer">
                                <!-- Items dynamiques -->
                            </div>

                            <!-- Résumé des prix -->
                            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-top: 15px; padding-top: 15px; border-top: 1px solid #e2e8f0;">
                                <div style="background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0;">
                                    <div style="font-size: 11px; color: #64748b; font-weight: 700; text-transform: uppercase;">Prix total</div>
                                    <div style="font-size: 18px; font-weight: 900; color: #0f172a;" id="tlfEditTotal">${total} €</div>
                                </div>
                                <div style="background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0;">
                                    <div style="font-size: 11px; color: #64748b; font-weight: 700; text-transform: uppercase;">Déjà payé</div>
                                    <div style="font-size: 18px; font-weight: 900; color: #10b981;" id="tlfEditPaye">${paye} €</div>
                                </div>
                                <div id="tlfEditResteCard" style="background: ${reste <= 0 ? '#dcfce7' : '#fffbeb'}; padding: 12px; border-radius: 8px; border: 1px solid ${reste <= 0 ? '#bbf7d0' : '#fde68a'};">
                                    <div style="font-size: 11px; color: ${reste <= 0 ? '#166534' : '#b45309'}; font-weight: 700; text-transform: uppercase;">Restant</div>
                                    <div style="font-size: 18px; font-weight: 900; color: ${reste <= 0 ? '#166534' : '#d97706'};" id="tlfEditReste">${reste} €</div>
                                </div>
                            </div>
                            <div style="font-size: 11px; color: #64748b; margin-top: 10px;"><i class="fas fa-info-circle"></i> Les lignes mettent à jour le total automatiquement.</div>
                        </div>
                    </div>

                    <!-- Commentaire et Photos -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                        <div style="background: white; border-radius: 12px; border: 1px solid #e2e8f0; overflow: visible;">
                            <div style="padding: 12px 15px; background: #f8fafc; border-radius: 12px 12px 0 0; border-bottom: 1px solid #e2e8f0; font-weight: 800; color: #1e293b; display: flex; align-items: center; gap: 8px;">
                                <i class="fas fa-comment-dots" style="color: #f59e0b;"></i> Commentaire
                            </div>
                            <div style="padding: 15px;">
                                <label style="font-size: 12px; font-weight: 700; color: #475569; display: block; margin-bottom: 6px;">Notes globales</label>
                                <textarea id="tlfEditNotes" rows="4" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; outline: none; box-sizing: border-box; resize: vertical; font-family: inherit;">${inv.notes || ''}</textarea>
                            </div>
                        </div>
                        
                        <div style="background: white; border-radius: 12px; border: 1px solid #e2e8f0; overflow: visible;">
                            <div style="padding: 12px 15px; background: #f8fafc; border-radius: 12px 12px 0 0; border-bottom: 1px solid #e2e8f0; font-weight: 800; color: #1e293b; display: flex; align-items: center; gap: 8px;">
                                <i class="fas fa-camera" style="color: #ec4899;"></i> Photos
                            </div>
                            <div style="padding: 15px; text-align: center;">
                                <div style="border: 2px dashed #cbd5e1; border-radius: 8px; padding: 30px 20px; background: #f8fafc; cursor: pointer; transition: 0.2s;" onmouseover="this.style.borderColor='#3b82f6'; this.style.backgroundColor='#eff6ff'" onmouseout="this.style.borderColor='#cbd5e1'; this.style.backgroundColor='#f8fafc'">
                                    <i class="fas fa-cloud-upload-alt" style="font-size: 24px; color: #94a3b8; margin-bottom: 10px;"></i>
                                    <div style="font-size: 13px; font-weight: 600; color: #475569;">Cliquez ou glissez des photos ici</div>
                                    <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">JPG, PNG (Max 5MB)</div>
                                    <input type="file" multiple accept="image/*" style="display: none;">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Footer -->
                <div style="padding: 20px 25px; border-top: 1px solid #e2e8f0; background: white; display: flex; justify-content: flex-end; gap: 10px;">
                    <button class="btn btn-outline" onclick="this.closest('.modal').remove()" style="padding: 10px 20px; font-weight: 600; border-radius: 8px;">Annuler</button>
                    <button class="btn btn-primary" onclick="window.app.views.toutesLesFactures.saveEdit('${inv.id}')" style="padding: 10px 20px; font-weight: 600; border-radius: 8px;">
                        <i class="fas fa-save"></i> Enregistrer les modifications
                    </button>
                </div>
            </div>
        </div>
        `;
        document.getElementById('tlfModalsContainer').innerHTML = html;
        this.renderEditItems();
        this.initEditAutocomplete();
    },

    initEditAutocomplete() {
        Autocomplete.initCustom('tlfEditExp', 'tlfEditExpSuggestions',
            (q) => {
                const query = q.toLowerCase();
                return Array.from(this.clientsData.values()).filter(c => (c.nom && c.nom.toLowerCase().includes(query)) || (c.tel && c.tel.includes(query))).slice(0, 8);
            },
            (c) => `<div style="font-weight: 600;">${c.nom}</div><div style="font-size: 11px; opacity: 0.7;">📞 ${c.tel || 'N/A'}</div>`,
            (c, input) => { input.value = c.nom; this.handleEditExpChange(); }
        );

        const expInput = document.getElementById('tlfEditExp');
        let expTimeout;
        if (expInput) {
            expInput.addEventListener('input', () => {
                clearTimeout(expTimeout);
                expTimeout = setTimeout(() => this.handleEditExpChange(), 300);
            });
        }

        Autocomplete.initCustom('tlfEditDest', 'tlfEditDestSuggestions',
            (q) => {
                const query = q.toLowerCase();
                let matches = Array.from(this.destMap.keys()).filter(d => d.toLowerCase().includes(query));
                if (matches.length < 5) {
                    const globalMatches = (this.availableDests || []).filter(d => d.toLowerCase().includes(query));
                    matches = [...new Set([...matches, ...globalMatches])];
                }
                return matches.slice(0, 8);
            },
            (d) => `<div style="font-weight: 600;">${d}</div>`,
            (d, input) => { input.value = d; this.handleEditDestChange(); }
        );

        const destInput = document.getElementById('tlfEditDest');
        let destTimeout;
        if (destInput) {
            destInput.addEventListener('input', () => {
                clearTimeout(destTimeout);
                destTimeout = setTimeout(() => this.handleEditDestChange(), 300);
            });
        }

        Autocomplete.initCustom('tlfEditLieu', 'tlfEditLieuSuggestions',
            (q) => {
                const query = q.toLowerCase();
                const matches = (this.availableCommunes || []).filter(c => c.toLowerCase().includes(query));
                return matches.slice(0, 8);
            },
            (c) => `<div style="font-weight: 600;">${c}</div>`,
            (c, input) => { input.value = c; }
        );
        
        // Exécuter les handlers au démarrage pour afficher les retours visuels
        this.handleEditExpChange();
        this.handleEditDestChange();
    },

    handleEditExpChange() {
        const expediteur = document.getElementById('tlfEditExp')?.value.trim();
        const feedbackExp = document.getElementById('tlfEditExpFeedback');
        
        if (!expediteur) {
            if (feedbackExp) feedbackExp.innerHTML = '';
            return;
        }

        if (this.clientsData && this.clientsData.has(expediteur)) {
            const clientInfo = this.clientsData.get(expediteur);
            if (feedbackExp) feedbackExp.innerHTML = `<span style="color:#059669;"><i class="fas fa-check-circle"></i> <b>Tél:</b> ${clientInfo.tel || 'N/A'} | <b>Adresse:</b> ${clientInfo.adresse || 'N/A'}</span>`;
        } else {
            if (feedbackExp) feedbackExp.innerHTML = `<span style="color:#f59e0b;"><i class="fas fa-exclamation-triangle"></i> Nouveau client expéditeur</span>`;
        }
    },

    handleEditDestChange() {
        const selectedDest = document.getElementById('tlfEditDest')?.value.trim();
        const lieuInput = document.getElementById('tlfEditLieu');
        const telInput = document.getElementById('tlfEditTel');
        const feedbackDest = document.getElementById('tlfEditDestFeedback');
        
        if (!selectedDest) {
            if (feedbackDest) feedbackDest.innerHTML = '';
            return;
        }

        let lieu = '', num = '', isFound = false;

        if (this.destMap && this.destMap.has(selectedDest)) {
            lieu = this.destMap.get(selectedDest);
            num = this.destInfos.get(selectedDest);
            isFound = true;
        }

        if (lieuInput && isFound && lieuInput.value.trim() === '') lieuInput.value = lieu || '';
        if (telInput && isFound && telInput.value.trim() === '') telInput.value = num || '';

        if (isFound) {
            if (feedbackDest) feedbackDest.innerHTML = `<span style="color:#059669;"><i class="fas fa-check-circle"></i> Client reconnu dans l'historique</span>`;
        } else {
            if (feedbackDest) feedbackDest.innerHTML = `<span style="color:#f59e0b;"><i class="fas fa-exclamation-triangle"></i> Nouveau destinataire</span>`;
        }
    },

    renderEditItems() {
        const container = document.getElementById('tlfEditItemsContainer');
        if (!container) return;

        container.innerHTML = this.editItems.map((item, index) => `
            <div class="form-grid" style="display: grid; grid-template-columns: 2fr 0.5fr 1fr 1fr auto; gap: 10px; align-items: end; background: #f8fafc; padding: 12px; border-radius: 8px; margin-bottom: 10px; border: 1px solid #e2e8f0;">
                <div>
                    <label style="font-size: 11px; font-weight: 600; color: #475569; display: block; margin-bottom: 4px;">Description</label>
                    <div style="position: relative;">
                        <input type="text" class="edit-item-desc" id="tlfEditItem_${item.id}" data-id="${item.id}" value="${item.desc}" autocomplete="off" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box; outline: none;">
                        <ul id="tlfEditItemSuggestions_${item.id}" class="autocomplete-suggestions"></ul>
                    </div>
                </div>
                <div>
                    <label style="font-size: 11px; font-weight: 600; color: #475569; display: block; margin-bottom: 4px;">Qté</label>
                    <input type="number" class="edit-item-qty" data-id="${item.id}" value="${item.qty}" min="1" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box; text-align: center; outline: none;">
                </div>
                <div>
                    <label style="font-size: 11px; font-weight: 600; color: #475569; display: block; margin-bottom: 4px;">P.U (€)</label>
                    <input type="number" class="edit-item-pu" data-id="${item.id}" value="${item.pu}" min="0" step="0.01" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box; text-align: right; outline: none;">
                </div>
                <div>
                    <label style="font-size: 11px; font-weight: 600; color: #475569; display: block; margin-bottom: 4px;">Total</label>
                    <input type="text" value="${item.total} €" readonly style="width: 100%; padding: 8px; border: 1px solid #e2e8f0; border-radius: 6px; box-sizing: border-box; text-align: right; background: #e2e8f0; font-weight: bold; outline: none; color: #0f172a;">
                </div>
                <button class="btn btn-outline" onclick="window.app.views.toutesLesFactures.removeEditItemRow(${item.id})" style="padding: 8px 12px; border-color: #fecaca; color: #ef4444; background: white; border-radius: 6px; cursor: pointer;" title="Supprimer" ${this.editItems.length <= 1 ? 'disabled' : ''}>
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `).join('');

        document.querySelectorAll('.edit-item-desc').forEach(el => el.addEventListener('input', (e) => this.updateEditItem(e, 'desc')));
        document.querySelectorAll('.edit-item-qty').forEach(el => el.addEventListener('input', (e) => this.updateEditItem(e, 'qty')));
        document.querySelectorAll('.edit-item-pu').forEach(el => el.addEventListener('input', (e) => this.updateEditItem(e, 'pu')));
        
        this.editItems.forEach(item => {
            Autocomplete.initCustom(`tlfEditItem_${item.id}`, `tlfEditItemSuggestions_${item.id}`,
                (q) => {
                    const query = q.toLowerCase();
                    return Array.from(this.productsData.values()).filter(p => p.desc && p.desc.toLowerCase().includes(query)).slice(0, 8);
                },
                (p) => `<div style="font-weight: 600;">${p.desc}</div><div style="font-size: 11px; opacity: 0.7;">Prix: ${p.price || 0} €</div>`,
                (p, input) => {
                    input.value = p.desc;
                    input.dispatchEvent(new Event('input'));
                }
            );
        });
    },

    addEditItemRow() {
        this.editItems.push({ id: Date.now(), desc: '', qty: 1, pu: 0, total: 0, vol: 0 });
        this.renderEditItems();
    },

    removeEditItemRow(id) {
        if (this.editItems.length > 1) {
            this.editItems = this.editItems.filter(i => i.id !== id);
            this.renderEditItems();
            this.calculateEditTotals();
        }
    },

    updateEditItem(e, field) {
        const id = parseInt(e.target.dataset.id);
        const item = this.editItems.find(i => i.id === id);
        if (item) {
            if (field === 'desc') {
                item.desc = e.target.value;
                if (this.productsData && this.productsData.has(item.desc)) {
                    const prod = this.productsData.get(item.desc);
                    item.pu = parseFloat(prod.price) || 0;
                    
                    const row = e.target.closest('.form-grid');
                    if (row) {
                        const puInput = row.querySelector('.edit-item-pu');
                        if (puInput) puInput.value = item.pu;
                    }
                }
            }
            if (field === 'qty') item.qty = parseInt(e.target.value) || 0;
            if (field === 'pu') item.pu = parseFloat(e.target.value) || 0;
            
            item.total = item.qty * item.pu;
            
            const row = e.target.closest('.form-grid');
            if (row) {
                const totalInput = row.querySelector('input[readonly]');
                if (totalInput) totalInput.value = item.total + ' €';
            }
            
            this.calculateEditTotals();
        }
    },

    calculateEditTotals() {
        const TAUX = 656;
        const totalEUR = this.editItems.reduce((sum, item) => sum + item.total, 0);
        
        const payeCFA = (parseFloat(this.currentEditInvoice.montantParis) || 0) + (parseFloat(this.currentEditInvoice.montantAbidjan) || 0);
        const payeEUR = payeCFA / TAUX;
        
        const resteEUR = totalEUR - payeEUR;

        const totalEl = document.getElementById('tlfEditTotal');
        const resteEl = document.getElementById('tlfEditReste');
        const resteCard = document.getElementById('tlfEditResteCard');

        if (totalEl) totalEl.textContent = totalEUR + ' €';
        if (resteEl) resteEl.textContent = resteEUR + ' €';
        
        if (resteCard) {
            if (resteEUR <= 0) {
                resteCard.style.background = '#dcfce7';
                resteCard.style.borderColor = '#bbf7d0';
                resteCard.children[0].style.color = '#166534';
                resteCard.children[1].style.color = '#166534';
            } else {
                resteCard.style.background = '#fffbeb';
                resteCard.style.borderColor = '#fde68a';
                resteCard.children[0].style.color = '#b45309';
                resteCard.children[1].style.color = '#d97706';
            }
        }
    },

    async saveEdit(id) {
        const inv = this.invoices.find(i => i.id === id);
        if (!inv) return;

        const TAUX = 656;
        const newPrixEur = this.editItems.reduce((sum, item) => sum + item.total, 0);
        const newPrixCfa = Math.round(newPrixEur * TAUX);
        const newDescription = this.editItems.map(i => `${i.qty}x ${i.desc}`).join(', ');
        const newConteneur = document.getElementById('tlfEditConteneur').value.trim().toUpperCase() || 'ATT';
        const newTotalQty = this.editItems.reduce((sum, item) => sum + item.qty, 0);
        const newVolumeCBM = this.editItems.reduce((sum, item) => sum + ((item.vol || 0) * item.qty), 0);

        const updates = {
            nom: document.getElementById('tlfEditExp').value.trim(),
            nomDestinataire: document.getElementById('tlfEditDest').value.trim(),
            numero: document.getElementById('tlfEditTel').value.trim(),
            adresseDestinataire: document.getElementById('tlfEditLieu').value.trim(),
            description: newDescription,
            conteneur: newConteneur,
            prix: newPrixCfa,
            items: this.editItems,
            quantite: newTotalQty,
            volumeCBM: newVolumeCBM,
            notes: document.getElementById('tlfEditNotes').value.trim()
        };

        // Recalcul du reste si le prix total a été modifié
        const payeCfa = (parseFloat(inv.montantParis) || 0) + (parseFloat(inv.montantAbidjan) || 0);
        updates.reste = payeCfa - newPrixCfa; // Reste = payé - prix (négatif si dette dans Firestore)

        try {
            const btn = document.querySelector('#tlfModalsContainer .btn-primary');
            if(btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Application...'; btn.disabled = true; }

            const { updateDoc, doc, writeBatch, getDocs, query, collection, where, limit } = await import("https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js");
            
            const batch = writeBatch(db);
            
            // 1. Mettre à jour la transaction dans la caisse
            batch.update(doc(db, "transactions", id), updates);

            // 2. Chercher le colis correspondant dans Logistique et le mettre à jour
            const livQ = await getDocs(query(collection(db, "livraisons"), where("ref", "==", inv.reference), limit(1)));
            if (!livQ.empty) {
                const livDoc = livQ.docs[0];
                const livData = livDoc.data();
                
                // REGÉNÉRATION INTELLIGENTE DES SOUS-ÉTIQUETTES (TRAÇABILITÉ)
                let updatedLabels = livData.labels ? [...livData.labels] : [];
                if (newTotalQty > updatedLabels.length) {
                    let labelIndex = updatedLabels.length + 1;
                    for (let i = updatedLabels.length; i < newTotalQty; i++) {
                        const uniqueId = Math.floor(10 + Math.random() * 90);
                        updatedLabels.push(`${inv.reference}_${labelIndex}_${uniqueId}`);
                        labelIndex++;
                    }
                } else if (newTotalQty < updatedLabels.length) {
                    updatedLabels = updatedLabels.slice(0, newTotalQty);
                }

                batch.update(livDoc.ref, {
                    expediteur: updates.nom,
                    destinataire: updates.nomDestinataire,
                    numero: updates.numero,
                    lieuLivraison: updates.adresseDestinataire,
                    description: updates.description,
                    conteneur: updates.conteneur,
                    quantite: newTotalQty,
                    volumeCBM: newVolumeCBM,
                    labels: updatedLabels,
                    prixOriginal: newPrixCfa + " CFA",
                    montant: Math.abs(updates.reste) + " CFA" // Logistique stocke la dette en positif
                });
            }

            // 3. Création automatique du nouveau conteneur si nécessaire
            if (newConteneur !== 'ATT') {
                const containerRef = doc(db, "containers", newConteneur);
                batch.set(containerRef, { number: newConteneur, status: 'EN_CHARGEMENT', destination: 'ABIDJAN', createdAt: new Date().toISOString() }, { merge: true });
            }

            await batch.commit();

            this.app.showToast("Facture modifiée avec succès !", "success");
            document.getElementById('tlfModalsContainer').innerHTML = ''; // Fermer modal
        } catch(e) {
            console.error(e);
            this.app.showToast("Erreur lors de la modification", "error");
        }
    },

    async deleteInvoice(id) {
        const inv = this.invoices.find(i => i.id === id);
        if (!inv) return;
        
        if (window.AppModal) {
            if (!await window.AppModal.confirm(`Voulez-vous vraiment supprimer la facture ${inv.reference} ?\n\nCela supprimera également les données logistiques associées. Cette action est irréversible.`, "Supprimer la facture", true)) return;
        } else if (!confirm(`Voulez-vous vraiment supprimer la facture ${inv.reference} ?`)) return;

        try {
            const btn = document.querySelector('#tlfModalsContainer .btn-outline[onclick*="deleteInvoice"]');
            if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Suppression...'; btn.disabled = true; }

            const batch = writeBatch(db);
            
            // 1. Marquer la facture comme supprimée dans la Caisse (pour traçabilité d'audit)
            batch.update(doc(db, "transactions", id), { isDeleted: true, deletedAt: new Date().toISOString() });

            // 2. Supprimer physiquement le colis du module logistique
            const livQ = await getDocs(query(collection(db, "livraisons"), where("ref", "==", inv.reference)));
            livQ.forEach(d => {
                batch.delete(d.ref);
            });

            await batch.commit();

            this.app.showToast("Facture supprimée avec succès !", "success");
            document.getElementById('tlfModalsContainer').innerHTML = ''; // Fermer la modale
        } catch (e) {
            console.error("Erreur lors de la suppression:", e);
            this.app.showToast("Erreur lors de la suppression", "error");
        }
    },

    async reuseInvoice(id) {
        const inv = this.invoices.find(i => i.id === id);
        if (!inv) return;
        
        // Sauvegarder le nom de l'expéditeur en mémoire pour le prochain écran
        sessionStorage.setItem('reuseExpediteur', inv.nom || '');
        
        // Rediriger vers l'écran de création
        this.app.renderPage('invoice-new');
        this.app.showToast(`Pré-remplissage avec les informations de ${inv.nom}...`, "info");
    },

    exportExcel() {
        this.app.showToast("Export Excel en cours de développement", "info");
    },

    exportPDF() {
        this.app.showToast("Export PDF en cours de développement", "info");
    }
    ,
    // ==================== FONCTIONS D'IMPRESSION CENTRALISÉES ====================

    async printEtiquettes(id, format) {
        const invoice = this.invoices.find(i => i.id === id);
        if(!invoice) return;
        
        // Forcer temporairement le format souhaité dans le localStorage
        const originalFormat = localStorage.getItem('amt_label_format');
        localStorage.setItem('amt_label_format', format);
        
        // Récupérer les livraisons pour avoir les sous-références exactes générées à la création
        const { getDocs, query, collection, where, limit } = await import("https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js");
        const livQ = await getDocs(query(collection(db, "livraisons"), where("ref", "==", invoice.reference), limit(1)));
        
        let labelsList = [];
        if (!livQ.empty) {
            const liv = livQ.docs[0].data();
            
            let descMap = {};
            let currentLabelIdx = 1;
            if (invoice.items && Array.isArray(invoice.items)) {
                invoice.items.forEach(item => {
                    const qty = parseInt(item.qty) || 1;
                    for (let i = 0; i < qty; i++) {
                        descMap[currentLabelIdx] = item.desc;
                        currentLabelIdx++;
                    }
                });
            }

            if (liv.labels && liv.labels.length > 0) {
                labelsList = liv.labels.map((lbl, idx) => {
                    let specificDesc = invoice.description || 'COLIS';
                    const match = lbl.match(/_(\d+)_/);
                    if (match && descMap[parseInt(match[1])]) {
                        specificDesc = descMap[parseInt(match[1])];
                    } else if (descMap[idx + 1]) {
                        specificDesc = descMap[idx + 1];
                    }
                    
                    return {
                        sousRef: lbl,
                        desc: specificDesc,
                        index: idx + 1,
                        total: liv.labels.length
                    };
                });
            }
        }
        
        // Sécurité si aucune étiquette trouvée
        if (labelsList.length === 0) {
            const defaultDesc = invoice.items && invoice.items.length > 0 ? invoice.items[0].desc : invoice.description;
            labelsList = [{ sousRef: invoice.reference, desc: defaultDesc || 'COLIS', index: 1, total: 1 }];
        }
        
        // Récupérer l'adresse de l'expéditeur
        let expAddress = '';
        const clientQ = await getDocs(query(collection(db, "clients"), where("nom", "==", invoice.nom), limit(1)));
        if (!clientQ.empty) expAddress = clientQ.docs[0].data().adresse || '';

        // Nettoyage du Destinataire et extraction du téléphone
        let dName = invoice.nomDestinataire || '';
        let dPhone = invoice.numero || invoice.tel || '';
        const phoneMatch = dName.match(/(?:(?:\+|00)225[\s.-]?)?(?:01|05|07|0)\d(?:[\s.-]?\d{2}){4}|(?:(?:\+|00)225[\s.-]?)?(?:01|05|07|0)\d{8,}/);
        if (phoneMatch) {
            dName = dName.replace(phoneMatch[0], '').replace(/[-–,;:\/\s]+$/, '').trim();
            if (!dPhone) dPhone = phoneMatch[0];
        }

        const data = {
            ref: invoice.reference,
            date: invoice.date + ' 12:00:00', // Approximation si pas d'heure
            destName: dName,
            destPhone: dPhone,
            destAddress: invoice.adresseDestinataire || invoice.lieuLivraison || '',
            expName: invoice.nom,
            expAddress: expAddress,
            labels: labelsList
        };
        
        await this.app.printLabels(data);
        
        // Restaurer le paramètre initial de l'imprimante
        if (originalFormat) localStorage.setItem('amt_label_format', originalFormat);
    },

    async printDocument(id, docType) {
        const invoice = this.invoices.find(i => i.id === id);
        if(!invoice) return;

        this.app.showToast(`Génération de ${docType}...`, "info");

        // Vérifier si jsPDF est chargé, sinon l'importer dynamiquement
        if (typeof window.jspdf === 'undefined') {
            await new Promise((resolve) => {
                const script1 = document.createElement('script');
                script1.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
                script1.onload = () => {
                    const script2 = document.createElement('script');
                    script2.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.28/jspdf.plugin.autotable.min.js";
                    script2.onload = resolve;
                    document.head.appendChild(script2);
                };
                document.head.appendChild(script1);
            });
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        // Import Firestore for settings
        const { getDocs, getDoc, doc: fsDoc, query, collection, where, limit } = await import("https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js");

        let logoBase64 = null;
        let companyName = "AMT TRANS'IT";
        let invoiceConfig = null;
        try {
            const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
            const compSnap = await getDoc(fsDoc(db, "settings", `company_${activeAgency}`));
            if (compSnap.exists()) {
                if (compSnap.data().logoBase64) logoBase64 = compSnap.data().logoBase64;
                if (compSnap.data().name) companyName = compSnap.data().name;
            }
            const invConfigSnap = await getDoc(fsDoc(db, "settings", `invoice_config_${activeAgency}`));
            if (invConfigSnap.exists()) {
                invoiceConfig = invConfigSnap.data();
                if (invoiceConfig.companyName) companyName = invoiceConfig.companyName;
            }
        } catch(e) { console.error(e); }

        let accentColor = [59, 130, 246]; // Bleu standard
        if (docType === 'BL' || docType === 'ATTESTATION') accentColor = [16, 185, 129]; // Vert

        // Bandeau supérieur
        doc.setFillColor(30, 41, 59);
        doc.rect(0, 0, pageWidth, 35, 'F');
        doc.setFillColor(...accentColor);
        doc.rect(0, 35, pageWidth, 2, 'F');

        // Injection du Logo
        let textY = 22;
        if (logoBase64) {
            try {
                const props = doc.getImageProperties(logoBase64);
                const ratio = props.width / props.height;
                let imgH = 14;
                let imgW = imgH * ratio;
                if (imgW > 40) { imgW = 40; imgH = imgW / ratio; }
                doc.addImage(logoBase64, 'PNG', 15, 5, imgW, imgH);
                textY = 5 + imgH + 6;
            } catch(e) {}
        } else {
            try {
                const logoElement = document.querySelector('.app-logo');
                if (logoElement && logoElement.complete && logoElement.naturalWidth > 0) {
                    const ratio = logoElement.naturalWidth / logoElement.naturalHeight;
                    let imgH = 14;
                    let imgW = imgH * ratio;
                    if (imgW > 40) { imgW = 40; imgH = imgW / ratio; }
                    doc.addImage(logoElement, 'PNG', 15, 5, imgW, imgH);
                    textY = 5 + imgH + 6;
                }
            } catch(e) {}
        }

        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(18);
        if (logoBase64 || document.querySelector('.app-logo')) {
            doc.text(companyName, 15, textY);
        } else {
            doc.setFontSize(20);
            doc.text(companyName, 15, 22);
        }

        let titleText = "FACTURE";

        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("DÉTAILS DE L'EXPÉDITION :", 15, 50);
        doc.setFont("helvetica", "normal");
        doc.text(`Référence : ${invoice.reference}`, 15, 57);
        doc.text(`Date : ${new Date().toLocaleDateString('fr-FR')}`, 15, 64);
        doc.text(`Conteneur : ${invoice.conteneur || '-'}`, 15, 71);
        doc.text(`Expéditeur : ${invoice.nom || '-'}`, 15, 78);

        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(115, 45, 80, 35, 2, 2, 'FD');
        doc.setFont("helvetica", "bold");
        doc.text(docType === 'FACTURE' ? "FACTURÉ À :" : "LIVRÉ À :", 120, 52);
        doc.setFont("helvetica", "normal");
        
        let clientName = invoice.nomDestinataire || '';
        let clientPhone = invoice.numero || invoice.tel || '';
        const phoneMatch = clientName.match(/(?:(?:\+|00)225[\s.-]?)?(?:01|05|07|0)\d(?:[\s.-]?\d{2}){4}|(?:(?:\+|00)225[\s.-]?)?(?:01|05|07|0)\d{8,}/);
        if (phoneMatch) {
            clientName = clientName.replace(phoneMatch[0], '').replace(/[-–,;:\/\s]+$/, '').trim();
            if (!clientPhone) clientPhone = phoneMatch[0];
        }
        
        doc.text(`${clientName}`, 120, 59);
        doc.text(`${clientPhone}`, 120, 66);
        const addrStr = doc.splitTextToSize(`${invoice.adresseDestinataire || ''}`, 70);
        doc.text(addrStr, 120, 73);

        const tableColumn = ["Description / Nature du Colis", "Qté", "P.U", "Total"];
        const tableRows = [];
        if (invoice.items && Array.isArray(invoice.items)) {
            invoice.items.forEach(item => {
                tableRows.push([
                    item.desc,
                    item.qty.toString(),
                    this.app.formatMoney(item.pu),
                    this.app.formatMoney(item.total)
                ]);
            });
        } else {
            (invoice.description || '').split(',').forEach(d => {
                const match = d.trim().match(/^(\d+)x\s+(.+)$/);
                if(match) tableRows.push([match[2], match[1], "-", "-"]);
                else tableRows.push([d.trim(), '1', "-", "-"]);
            });
        }

        doc.autoTable({
            startY: 90,
            head: [tableColumn],
            body: tableRows,
            theme: 'grid',
            headStyles: { fillColor: accentColor },
            columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' } }
        });

        // --- RÉCAPITULATIF FINANCIER ---
        const finalY = doc.lastAutoTable.finalY + 15;
        const TAUX = 656;
        const prixFret = (parseFloat(invoice.prix) || 0) / TAUX;
        const paye = ((parseFloat(invoice.montantParis) || 0) + (parseFloat(invoice.montantAbidjan) || 0)) / TAUX;
        const reste = Math.abs(parseFloat(invoice.reste) || 0) / TAUX;

        if (docType === 'FACTURE' || docType === 'RECU') {
            doc.setFont("helvetica", "bold");
            doc.text("RÉCAPITULATIF FINANCIER", 115, finalY);
            doc.setFont("helvetica", "normal");
            
            let currentLineY = finalY + 8;
            doc.text("Total Fret :", 115, currentLineY);
            doc.text(`${this.app.formatMoney(prixFret)}`, 195, currentLineY, { align: 'right' });
            currentLineY += 6;
            
            doc.text("Montant Payé :", 115, currentLineY);
            doc.text(`${this.app.formatMoney(paye)}`, 195, currentLineY, { align: 'right' });
            currentLineY += 6;
            
            doc.setFillColor(reste > 0 ? 254 : 240, reste > 0 ? 242 : 253, reste > 0 ? 242 : 244);
            doc.rect(115, currentLineY + 2, 80, 10, 'F');
            doc.setFont("helvetica", "bold");
            doc.text("RESTE À PAYER :", 118, currentLineY + 9);
            doc.setTextColor(reste > 0 ? 220 : 22, reste > 0 ? 38 : 163, reste > 0 ? 38 : 74);
            doc.text(`${this.app.formatMoney(reste)}`, 192, currentLineY + 9, { align: 'right' });
            doc.setTextColor(0, 0, 0);

            doc.text("La Direction AMT TRANS'IT", 15, currentLineY + 9);
        } else {
            // BL / ATTESTATION
            if (reste > 0) {
                doc.setFillColor(254, 242, 242);
                doc.setDrawColor(220, 38, 38);
                doc.setLineWidth(0.5);
                doc.rect(95, finalY, 100, 14, 'FD');
                
                doc.setFont("helvetica", "bold");
                doc.setFontSize(10);
                doc.setTextColor(220, 38, 38);
                doc.text("À REMETTRE AU LIVREUR :", 100, finalY + 9);
                
                doc.setFontSize(14);
                doc.text(`${this.app.formatMoney(reste)}`, 190, finalY + 9.5, { align: 'right' });
            } else {
                doc.setFillColor(240, 253, 244);
                doc.setDrawColor(22, 163, 74);
                doc.setLineWidth(0.5);
                doc.rect(95, finalY, 100, 14, 'FD');
                
                doc.setFont("helvetica", "bold");
                doc.setFontSize(12);
                doc.setTextColor(22, 163, 74);
                doc.text("COLIS SOLDÉ (Rien à payer)", 145, finalY + 9, { align: 'center' });
            }
            doc.setTextColor(0, 0, 0);

            let sigY = finalY + 35;
            doc.setFontSize(10);
            doc.setFont("helvetica", "bold");
            doc.text("Livreur / Agent AMT :", 25, sigY);
            doc.text("Client (Destinataire) :", 125, sigY);
            
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.setTextColor(100, 116, 139);
            doc.text("Nom et Signature", 25, sigY + 5);
            doc.text("Précédé de la mention 'Lu et approuvé'", 125, sigY + 5);

            doc.setDrawColor(203, 213, 225);
            doc.rect(20, sigY + 8, 70, 25);
            doc.rect(120, sigY + 8, 70, 25);
        }

        // --- CGV DE LA FACTURE ---
        if (docType === 'FACTURE') {
            let cgvY = doc.lastAutoTable.finalY + 55;
            if (cgvY + 50 > doc.internal.pageSize.getHeight() - 15) {
                doc.addPage();
                cgvY = 20;
            }
            doc.setFont("helvetica", "bold");
            doc.setFontSize(8);
            doc.setTextColor(71, 85, 105);
            doc.text("CONDITIONS GÉNÉRALES DE VENTE", 15, cgvY);
            cgvY += 4;
            doc.text("A LIRE ATTENTIVEMENT:", 15, cgvY);
            cgvY += 4;
            
            doc.setFont("helvetica", "normal");
            doc.setFontSize(7);
            const defaultCgv = "1- Les temps et les délais de transports sont donnés à titre indicatifs par AMT TRANS'IT.\\n2- Les enlèvements à domicile sont gratuits dans la limite géographique.\\n3- Tous les colis et marchandises devront être intégralement payés avant la remise au destinataire.\\n4- En cas de litige, une solution amiable est privilégiée.";
            const cgvText = invoiceConfig?.cgv || defaultCgv;
            const cgvLines = cgvText.split('\\n');
            
            cgvLines.forEach(line => {
                const splitLine = doc.splitTextToSize(line, pageWidth - 30);
                doc.text(splitLine, 15, cgvY);
                cgvY += (splitLine.length * 3.5);
            });
        }

        // Pied de page
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        const footerText = invoiceConfig?.footer || "AMT TRANS'IT | 81 AVENUE ARISTIDE BRIAND 93240 STAINS | Tel. 0186900380 | amt.transit@gmail.com";
        doc.text(footerText, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });

        doc.save(`${titleText.replace(/ /g, '_')}_${invoice.reference}.pdf`);
    }
};