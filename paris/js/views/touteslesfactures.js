import { db } from '../../../firebase-config.js';
import { collection, query, where, onSnapshot, doc, writeBatch, getDocs, orderBy, limit } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const ToutesLesFacturesView = {
    unsub: null,
    invoices: [],
    filteredInvoices: [],
    currentSort: { field: 'date', direction: 'desc' },

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

            const address = inv.adresse || '-';
            const shortAddress = address.length > 30 ? address.substring(0, 27) + '...' : address;

            return `
                <tr data-invoice-id="${inv.id}">
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td style="font-weight: 900;">
                        <button class="amount-link" onclick="window.app.views.toutesLesFactures.viewInvoice('${inv.id}')">${inv.reference || '-'}</button>
                    </td>
                    <td>${inv.date ? new Date(inv.date).toLocaleDateString('fr-FR') : '-'}</td>
                    <td class="cell--client"><strong>${inv.nom || '-'}</strong></td>
                    <td class="cell--address"><span class="tooltip" data-tooltip="${address.replace(/"/g, '&quot;')}">${shortAddress}</span></td>
                    <td>${inv.tel || '-'}</td>
                    <td>${inv.nomDestinataire || '-'}</td>
                    <td class="cell--amount"><button class="amount-link" onclick="window.app.views.toutesLesFactures.viewInvoice('${inv.id}')">${this.app.formatMoney(totalEUR)}</button></td>
                    <td style="text-align: right;">${inv.nbColis || 1}</td>
                    <td style="text-align: right;">
                        <div class="row-actions">
                            <button class="icon-btn btn--view" onclick="window.app.views.toutesLesFactures.viewInvoice('${inv.id}')" title="Voir">👁️</button>
                            <button class="icon-btn btn--pay" onclick="window.app.views.toutesLesFactures.addPayment('${inv.id}')" title="Ajouter paiement">💰</button>
                            <button class="icon-btn btn--edit" onclick="window.app.views.toutesLesFactures.editInvoice('${inv.id}')" title="Modifier">✏️</button>
                            <button class="icon-btn btn--reuse" onclick="window.app.views.toutesLesFactures.reuseInvoice('${inv.id}')" title="Réutiliser">📋</button>
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
        
        // Afficher un modal ou rediriger vers la page de détail
        this.app.showToast(`Facture ${invoice.reference}: ${this.app.formatMoney((parseFloat(invoice.prix)||0)/656)}`, 'info');
    },

    async addPayment(id) {
        this.app.showToast("Fonctionnalité d'ajout de paiement à venir", "info");
    },

    async editInvoice(id) {
        this.app.showToast("Fonctionnalité de modification à venir", "info");
    },

    async reuseInvoice(id) {
        this.app.showToast("Fonctionnalité de réutilisation à venir", "info");
    },

    exportExcel() {
        this.app.showToast("Export Excel en cours de développement", "info");
    },

    exportPDF() {
        this.app.showToast("Export PDF en cours de développement", "info");
    }
};