import { db } from '../../firebase-config.js';
import { collection, query, where, onSnapshot, doc, writeBatch, getDocs, orderBy, limit } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { Autocomplete } from '../../paris/js/views/autocomplete.js';
import { CONSTANTS } from '../../constants.js';
import { createApp, ref, computed, reactive, onMounted, onUnmounted } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";
import { getCollectionName, AGENCIES } from '../../agencies-config.js';
import { filterByShippingMode } from '../../shipping-mode.js';
import { normalizePhone } from '../../affiliations.js';

// EUR si agence historique 'paris' OU route SaaS dont la devise configurée
// est EUR. (Même règle que app.formatMoneyLocal — cohérence d'affichage.)
const isEurAgency = () => {
    const ag = sessionStorage.getItem('currentActiveAgency') || 'abidjan';
    if (ag === 'paris') return true;
    const a = AGENCIES && AGENCIES[ag];
    return !!(a && a.currency === 'EUR');
};

export const ToutesLesFacturesView = {
    unsub: null,
    invoices: [],
    editItems: [],
    currentEditInvoice: null,
    currentPaymentInvoice: null,
    filteredInvoices: [],
    currentSort: { field: 'date', direction: 'desc' },
    clientsData: new Map(),
    destMap: new Map(),
    destInfos: new Map(),
    destExpMap: new Map(),
    productsData: new Map(),
    availableDests: [],
    availableCommunes: [],
    cachedAgentsOptions: '',

    // Helper centralisé pour le formatage des devises selon l'agence active
    formatMoneyLocal(amount, forceCfa = false) {
        const isEur = isEurAgency();
        if (isEur && !forceCfa) {
            return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount || 0).replace(/[\u202F\u00A0]/g, ' ').replace(/\s*\/\s*/g, ' ');
        } else {
            return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(amount || 0).replace(/[\u202F\u00A0]/g, ' ').replace(/\s*\/\s*/g, ' ');
        }
    },

    render(app, container) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.toutesLesFactures = this;

        const isEur = isEurAgency();

        const html = `
            <style>
                .factures-header { background: white; border-radius: 16px; margin-bottom: 24px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
                .factures-header__content { display: flex; align-items: center; gap: 20px; padding: 20px 24px; flex-wrap: wrap; }
                .factures-header__icon { font-size: 32px; background: #fef3c7; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 14px; }
                .factures-header__info { flex: 1; }
                .factures-header__title { margin: 0; font-size: 22px; font-weight: 700; color: #0f172a; }
                .factures-header__subtitle { margin: 4px 0 0; font-size: 13px; color: #64748b; }
                .btn-create-invoice { background: #3b82f6; color: white; border: none; padding: 12px 20px; border-radius: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 8px; }
                .btn-create-invoice:hover { background: #2563eb; transform: translateY(-2px); }
                .factures-filters { display: flex; flex-wrap: wrap; gap: 16px; background: white; padding: 20px 24px; border-radius: 16px; border: 1px solid #e2e8f0; margin-bottom: 24px; }
                .filter-group { flex: 1; min-width: 150px; }
                .filter-group--wide { flex: 2; }
                .filter-label { display: block; font-size: 11px; font-weight: 600; text-transform: uppercase; color: #64748b; margin-bottom: 6px; }
                .filter-input, .filter-select { width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 14px; transition: all 0.2s; box-sizing: border-box; }
                .filter-input:focus, .filter-select:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
                .factures-table-card { background: white; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; }
                .factures-table-header { padding: 16px 24px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; }
                .factures-table-title { font-size: 14px; font-weight: 500; color: #475569; }
                .factures-count-badge { background: #e2e8f0; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-right: 8px; }
                .table-wrap { overflow-x: auto; }
                .factures-table { width: 100%; border-collapse: collapse; }
                .factures-table th { text-align: left; padding: 16px 12px; background: #f8fafc; font-size: 12px; font-weight: 600; color: #475569; border-bottom: 1px solid #e2e8f0; cursor: pointer; user-select: none; white-space: nowrap; }
                .factures-table td { padding: 14px 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #334155; }
                .factures-table tr:hover td { background: #f8fafc; }
                .col--amount { text-align: right; }
                .cell--amount { text-align: right; font-weight: 700; }
                .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 600; }
                .badge--paid { background: #dcfce7; color: #166534; }
                .badge--unpaid { background: #fee2e2; color: #991b1b; }
                .badge--deposit { background: #fef3c7; color: #92400e; }
                .row-actions { display: flex; gap: 8px; justify-content: flex-end; }
                .icon-btn { width: 32px; height: 32px; border-radius: 8px; border: 1px solid #e2e8f0; background: white; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
                .icon-btn:hover { background: #f1f5f9; transform: scale(1.05); }
                .btn--edit:hover { color: #f59e0b; border-color: #f59e0b; }
                .btn--reuse:hover { color: #8b5cf6; border-color: #8b5cf6; }
                .btn--del:hover { color: #ef4444; border-color: #ef4444; background: #fef2f2; }
                .amount-link { background: none; border: none; font-weight: 700; color: #3b82f6; cursor: pointer; font-size: 13px; }
                .amount-link:hover { text-decoration: underline; }
                
                /* Modale Vue Détaillée Facture */
                .modal--detail .modal-content { max-width: 900px; width: 95%; padding: 0; background: #f8fafc; overflow: hidden; border-radius: 16px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); display: flex; flex-direction: column; max-height: 90vh; }
                .modal__header--detail { background: white; padding: 25px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: flex-start; flex-shrink: 0; }
                .modal__kicker { font-size: 12px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
                .modal__ref { font-size: 28px; font-weight: 900; color: #0f172a; margin-bottom: 8px; line-height: 1; }
                .modal__detail-subline { font-size: 13px; color: #475569; font-weight: 500; display: flex; gap: 8px; align-items: center; }
                .modal__detail-head-actions { display: flex; gap: 15px; align-items: center; }
                .modal__body--scroll { padding: 25px; overflow-y: auto; flex: 1; min-height: 0; }
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
                .btn--doc { padding: 8px 12px; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: 0.2s; border: 1px solid transparent; background: white; color: #1e293b; }
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
                .colis-paris { background: #e0f2fe; color: #0284c7; }
                .colis-transit { background: #fef3c7; color: #b45309; }
                .colis-abidjan { background: #f3e8ff; color: #7e22ce; }
                .colis-delivered { background: #dcfce7; color: #166534; }
                .colis-pending { background: #f1f5f9; color: #475569; }
                .muted { color: #64748b; font-size: 13px; padding: 20px; font-style: italic; text-align: center; }
            </style>
            <div class="page" style="max-width: 1400px; margin: 0 auto; animation: fadeIn 0.3s ease;">
                <!-- En-tête -->
                <div class="factures-header">
                    <div class="factures-header__content">
                        <div class="factures-header__icon">📄</div>
                        <div class="factures-header__info">
                            <h1 class="factures-header__title">Toutes les factures</h1>
                            <p class="factures-header__subtitle">Gestion des factures et colis envoyés</p>
                        </div>
                        <button class="amt-btn amt-btn-primary" onclick="app.renderPage('invoice-new')">
                            <i class="fas fa-plus"></i> Nouvelle facture
                        </button>
                    </div>
                </div>

                <!-- Filtres -->
                <div class="factures-filters">
                    <div class="filter-group filter-group--wide">
                        <label class="filter-label">🔍 Recherche</label>
                        <input type="text" id="searchInput" class="filter-input" placeholder="Référence, client, téléphone, date…">
                    </div>
                    <div class="filter-group">
                        <label class="filter-label">💳 Statut</label>
                        <select id="statusFilter" class="filter-select">
                            <option value="">Tous</option>
                            <option value="payee">Payée</option>
                            <option value="acompte">Acompte</option>
                            <option value="impayee">Impayée</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label class="filter-label">📦 Conteneur</label>
                        <select id="containerFilter" class="filter-select">
                            <option value="">Tous</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label class="filter-label">📅 Du</label>
                        <input type="date" id="dateFrom" class="filter-input">
                    </div>
                    <div class="filter-group">
                        <label class="filter-label">📅 Au</label>
                        <input type="date" id="dateTo" class="filter-input">
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
                    <div class="table-wrap hide-on-mobile">
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
                    <div class="show-on-mobile" id="invoicesCards"></div>
                </div>

                <!-- Conteneur pour les fenêtres modales -->
                <div id="tlfModalsContainer"></div>
            </div>
        `;

        if(container) container.innerHTML = html;
        else document.getElementById('contentContainer').innerHTML = html;

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
            const clientsSnap = await getDocs(collection(db, getCollectionName("clients")));
            this.clientsData.clear();
            clientsSnap.forEach(doc => {
                const data = doc.data();
                if (data.nom) this.clientsData.set(data.nom.trim(), data);
            });

            const livSnap = await getDocs(collection(db, getCollectionName("livraisons")));
            const communesSet = new Set(['ABOBO', 'ADJAME', 'ATTECOUBE', 'BINGERVILLE', 'COCODY', 'KOUMASSI', 'MARCORY', 'PLATEAU', 'PORT-BOUET', 'YOPOUGON']);
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

            const prodSnap = await getDocs(collection(db, getCollectionName("products")));
            this.productsData.clear();
            prodSnap.forEach(doc => {
                const data = doc.data();
                if (data.desc) this.productsData.set(data.desc.trim(), data);
            });
        } catch (e) {
            console.error("Erreur auto-complétion:", e);
        }
    },

    async loadContainers() {
        try {
            const containersSnap = await getDocs(collection(db, getCollectionName("containers")));
            const select = document.getElementById('containerFilter');
            if (select) {
                const options = containersSnap.docs.map(doc => `<option value="${doc.id}">${doc.data().number || doc.id}</option>`);
                select.innerHTML = '<option value="">Tous</option>' + options.join('');
            }
        } catch(e) {}
    },

    loadData() {
        if (this.unsub) this.unsub();
        
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
        // Détection ARRIVÉE pilotée par la config (source unique), pas en dur :
        // toute agence d'arrivée (abidjan, abidjan_chine, abidjan_dakar...)
        // voit TOUTES les factures de la collection de sa route (même
        // collection que le départ via getCollectionName). Sans ça, les
        // routes SaaS (Chine...) n'affichaient rien côté destination.
        const isArrival = activeAgency === 'all'
            || (AGENCIES[activeAgency] && AGENCIES[activeAgency].type === 'arrival');
        
        let q;
        if (isArrival) {
            q = query(collection(db, getCollectionName("transactions")), where("isDeleted", "==", false));
        } else {
            q = query(collection(db, getCollectionName("transactions")), where("agency", "==", activeAgency), where("isDeleted", "==", false));
        }
        
        this.unsub = onSnapshot(q, (snapshot) => {
            this.invoices = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            this.invoices.sort((a, b) => new Date(b.date) - new Date(a.date));
            this.applyFilters();
        });

        // Pré-chargement des affiliations clients + démarcheurs pour afficher
        // un badge « Parrain » sur la ligne du tableau (lookup par téléphone
        // destinataire). Lecture ponctuelle, route-aware via getCollectionName.
        this.affByPhone = new Map();
        this.demById = new Map();
        getDocs(collection(db, getCollectionName("client_affiliations"))).then(snap => {
            this.affByPhone.clear();
            snap.docs.forEach(d => {
                const a = d.data() || {};
                const k = String(a.phone || d.id || '').replace(/\D/g, '');
                if (k.length >= 8) this.affByPhone.set(k, a);
            });
            this.applyFilters();
        }).catch(e => console.warn('affiliations factures:', e));
        getDocs(collection(db, getCollectionName("demarcheurs"))).then(snap => {
            this.demById.clear();
            snap.docs.forEach(d => { this.demById.set(d.id, d.data() || {}); });
            this.applyFilters();
        }).catch(e => console.warn('demarcheurs factures:', e));
    },

    // Cherche un parrain rattaché au téléphone passé. Retourne le nom complet
    // ou null. Tolérant aux formats (indicatifs, espaces, points, tirets).
    getParrainNameForPhone(rawPhone) {
        if (!rawPhone || !this.affByPhone || !this.demById) return null;
        let k = String(rawPhone).replace(/\D/g, '');
        if (k.startsWith('00')) k = k.slice(2);
        if (k.length > 10 && k.startsWith('225')) k = k.slice(3);
        if (k.length < 8) return null;
        const aff = this.affByPhone.get(k);
        if (!aff || !aff.demarcheurId) return null;
        const d = this.demById.get(aff.demarcheurId);
        if (d) return `${d.prenom || ''} ${d.nom || ''}`.trim();
        return aff.demarcheurName || null;
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

        // Filtre MODE D'EXPÉDITION (source unique : shipping-mode.js).
        // La liste suit le bouton 🚢/✈️ actif ; ancien sans champ = maritime.
        filtered = filterByShippingMode(filtered);

        if (searchTerm) {
            filtered = filtered.filter(inv => 
                (inv.reference || '').toLowerCase().includes(searchTerm) ||
                (inv.nom || '').toLowerCase().includes(searchTerm) ||
                (inv.tel || '').includes(searchTerm)
            );
        }

        if (status) {
            filtered = filtered.filter(inv => {
                const isEur = isEurAgency();
                const TAUX = isEur ? CONSTANTS.TAUX_CONVERSION : 1;
                
                const reste = Math.abs(parseFloat(inv.reste) || 0) / TAUX;
                const total = (parseFloat(inv.prix) || 0) / TAUX;
                if (status === 'payee') return reste <= 0;
                if (status === 'impayee') return reste >= total;
                if (status === 'acompte') return reste > 0 && reste < total;
                return true;
            });
        }

        if (container) filtered = filtered.filter(inv => inv.conteneur === container || inv.containerId === container);
        if (dateFrom) filtered = filtered.filter(inv => inv.date >= dateFrom);
        if (dateTo) filtered = filtered.filter(inv => inv.date <= dateTo);

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
            const emptyCards = document.getElementById('invoicesCards');
            if (emptyCards) emptyCards.innerHTML = '<div style="text-align:center; padding:30px; color:#64748b;">Aucune facture trouvée</div>';
            return;
        }

        const isEur = isEurAgency();
        const TAUX = isEur ? CONSTANTS.TAUX_CONVERSION : 1;

        // On construit en un seul passage les lignes du tableau (ordinateur)
        // ET les fiches compactes (mobile, modèle validé : 3 lignes + actions).
        const rows = [];
        const cards = [];
        this.filteredInvoices.forEach(inv => {
            const totalDisplay = (parseFloat(inv.prix) || 0) / TAUX;
            const resteDisplay = Math.abs(parseFloat(inv.reste) || 0) / TAUX;
            const isPayee = resteDisplay <= 0;
            const isDeposit = resteDisplay > 0 && resteDisplay < totalDisplay;

            let statusClass = 'badge--unpaid';
            let statusText = 'Impayée';
            if (isPayee) { statusClass = 'badge--paid'; statusText = 'Payée'; }
            else if (isDeposit) { statusClass = 'badge--deposit'; statusText = 'Acompte'; }

            const address = inv.adresseDestinataire || inv.adresse || '-';
            const shortAddress = address.length > 30 ? address.substring(0, 27) + '...' : address;

            let nbColis = 1;
            if (inv.items && Array.isArray(inv.items)) {
                nbColis = inv.items.reduce((sum, item) => sum + (parseInt(item.qty) || 1), 0);
            } else if (inv.quantite) {
                nbColis = inv.quantite;
            }

            // Téléphone destinataire : utilisé pour lookup de l'affiliation parrain.
            // Source 1 : champ explicite (numero/tel) ; sinon on tente d'extraire
            // un numéro de la chaîne nomDestinataire.
            let destPhone = inv.numero || '';
            if (!destPhone) {
                const m = String(inv.nomDestinataire || '').match(/(?:(?:\+|00)225[\s.-]?)?(?:01|05|07|0)\d(?:[\s.-]?\d{2}){4}|(?:(?:\+|00)225[\s.-]?)?(?:01|05|07|0)\d{8,}/);
                if (m) destPhone = m[0];
            }
            const parrainName = this.getParrainNameForPhone(destPhone);
            const parrainBadge = parrainName
                ? `<div style="margin-top:4px; display:inline-flex; align-items:center; gap:5px; background:#fff7ed; color:#9a3412; padding:2px 8px; border-radius:10px; font-size:11px; font-weight:600;"><i class="fas fa-handshake" style="font-size:10px;"></i> Parrain : ${parrainName}</div>`
                : '';
            const frBadge = inv.agency === 'paris' && !isEur ? '<span title="Créé à Paris" style="font-size:10px; background:#e0f2fe; padding:2px 5px; border-radius:4px; margin-left:4px; color:#0369a1; font-weight:800;">FR</span>' : '';
            const dateStr = inv.date ? new Date(inv.date).toLocaleDateString('fr-FR') : '-';

            rows.push(`
                <tr data-invoice-id="${inv.id}">
                    <td data-label="Statut"><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td data-label="Référence" style="font-weight: 900;">
                        <button class="amount-link" onclick="window.app.views.toutesLesFactures.viewInvoice('${inv.id}')">${inv.reference || '-'}</button>
                        ${frBadge}
                    </td>
                    <td data-label="Date">${dateStr}</td>
                    <td data-label="Client"><strong>${inv.nom || '-'}</strong></td>
                    <td data-label="Adresse"><span class="tooltip" title="${address.replace(/"/g, '&quot;')}">${shortAddress}</span></td>
                    <td data-label="Téléphone">${inv.tel || '-'}</td>
                    <td data-label="Destinataire">${inv.nomDestinataire || '-'}${parrainBadge}</td>
                    <td data-label="Nb colis" style="text-align: right; font-weight: bold;">${nbColis}</td>
                    <td data-label="Montant" class="cell--amount"><button class="amount-link" onclick="window.app.views.toutesLesFactures.addPayment('${inv.id}')">${this.formatMoneyLocal(totalDisplay)}</button></td>
                    <td data-label="Actions" style="text-align: right;">
                        <div class="row-actions">
                            <button class="icon-btn btn--edit" onclick="window.app.views.toutesLesFactures.editInvoice('${inv.id}')" title="Modifier">✏️</button>
                            <button class="icon-btn btn--reuse" onclick="window.app.views.toutesLesFactures.reuseInvoice('${inv.id}')" title="Réutiliser">📋</button>
                            <button class="icon-btn btn--del" onclick="window.app.views.toutesLesFactures.deleteInvoice('${inv.id}')" title="Supprimer">🗑️</button>
                        </div>
                    </td>
                </tr>
            `);

            cards.push(`
                <div class="comm-mob-card" data-invoice-id="${inv.id}">
                    <div class="comm-mob-l1">
                        <button class="amount-link" style="font-weight:900;" onclick="window.app.views.toutesLesFactures.viewInvoice('${inv.id}')">${inv.reference || '-'}</button>${frBadge}
                        <span class="status-badge ${statusClass}">${statusText}</span>
                    </div>
                    <div class="comm-mob-l1">
                        <strong>${inv.nom || '-'}</strong>
                        <button class="amount-link" style="font-weight:800;" onclick="window.app.views.toutesLesFactures.addPayment('${inv.id}')">${this.formatMoneyLocal(totalDisplay)}</button>
                    </div>
                    <div class="comm-mob-l2">
                        <span>${dateStr}</span>
                        ${inv.nomDestinataire ? `<span>➜ ${inv.nomDestinataire}</span>` : ''}
                        <span>${nbColis} colis</span>
                    </div>
                    ${parrainBadge}
                    <div style="display:flex; justify-content:flex-end; gap:10px; border-top:1px solid #f1f5f9; padding-top:6px; margin-top:4px;">
                        <button class="icon-btn btn--edit" onclick="window.app.views.toutesLesFactures.editInvoice('${inv.id}')" title="Modifier">✏️</button>
                        <button class="icon-btn btn--reuse" onclick="window.app.views.toutesLesFactures.reuseInvoice('${inv.id}')" title="Réutiliser">📋</button>
                        <button class="icon-btn btn--del" onclick="window.app.views.toutesLesFactures.deleteInvoice('${inv.id}')" title="Supprimer">🗑️</button>
                    </div>
                </div>
            `);
        });

        tbody.innerHTML = rows.join('');
        const cardsEl = document.getElementById('invoicesCards');
        if (cardsEl) cardsEl.innerHTML = cards.join('');
    },

    async viewInvoice(id) {
        const invoice = this.invoices.find(i => i.id === id);
        if (!invoice) return;
        
        document.getElementById('tlfModalsContainer').innerHTML = `
            <div class="modal active" style="z-index: 10000; position: fixed; inset: 0; background: rgba(15,23,42,0.6); display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px);">
                <div style="background: white; padding: 30px; border-radius: 16px; text-align: center; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);">
                    <i class="fas fa-spinner fa-spin fa-2x" style="color: #3b82f6; margin-bottom: 15px;"></i>
                    <div style="font-weight: 700; color: #1e293b;">Chargement des informations...</div>
                </div>
            </div>
        `;

        const { getCollectionName } = await import('../../agencies-config.js');
        const livQ = await getDocs(query(collection(db, getCollectionName("livraisons")), where("ref", "==", invoice.reference)));
        const livraisons = livQ.docs.map(d => ({id: d.id, ...d.data()}));

        let expPhone = 'Non renseigné';
        let expAddress = 'Non renseignée';
        const clientQ = await getDocs(query(collection(db, getCollectionName("clients")), where("nom", "==", invoice.nom)));
        if (!clientQ.empty) {
            const cData = clientQ.docs[0].data();
            if (cData.tel) expPhone = cData.tel;
            if (cData.adresse) expAddress = cData.adresse;
        }

        const isEur = isEurAgency();
        const TAUX = isEur ? CONSTANTS.TAUX_CONVERSION : 1;

        const total = (parseFloat(invoice.prix) || 0) / TAUX;
        const paye = ((parseFloat(invoice.montantParis) || 0) + (parseFloat(invoice.montantAbidjan) || 0)) / TAUX;
        const reste = Math.abs(parseFloat(invoice.reste) || 0) / TAUX;
        
        let statusText = reste <= 0 ? 'Payée' : (paye > 0 ? 'Acompte' : 'Impayée');
        let statusBg = reste <= 0 ? '#dcfce7' : (paye > 0 ? '#fef3c7' : '#fee2e2');
        let statusColor = reste <= 0 ? '#166534' : (paye > 0 ? '#92400e' : '#991b1b');

        let destName = invoice.nomDestinataire || '';
        let destPhone = invoice.numero || invoice.tel || 'Non renseigné';
        const phoneMatch = destName.match(/(?:(?:\+|00)225[\s.-]?)?(?:01|05|07|0)\d(?:[\s.-]?\d{2}){4}|(?:(?:\+|00)225[\s.-]?)?(?:01|05|07|0)\d{8,}/);
        if (phoneMatch) {
            destName = destName.replace(phoneMatch[0], '').replace(/[-–,;:\/\s]+$/, '').trim();
            if (destPhone === 'Non renseigné') destPhone = phoneMatch[0];
        }

        // Lookup parrain (démarcheur affilié au téléphone destinataire). Lecture
        // ponctuelle non bloquante : si la collection est vide ou inaccessible,
        // on n'affiche simplement pas l'info.
        let parrainName = '';
        try {
            const key = normalizePhone(destPhone);
            if (key) {
                const affSnap = await getDocs(query(collection(db, getCollectionName("client_affiliations")), where("phone", "==", key), limit(1)));
                if (!affSnap.empty) {
                    const aff = affSnap.docs[0].data() || {};
                    if (aff.demarcheurId) {
                        const demSnap = await getDocs(query(collection(db, getCollectionName("demarcheurs")), where("__name__", "==", aff.demarcheurId), limit(1)));
                        if (!demSnap.empty) {
                            const d = demSnap.docs[0].data() || {};
                            parrainName = `${d.prenom || ''} ${d.nom || ''}`.trim() || (aff.demarcheurName || '');
                        } else if (aff.demarcheurName) {
                            parrainName = aff.demarcheurName;
                        }
                    }
                }
            }
        } catch (e) { /* non bloquant */ }

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
                        <td style="font-weight: 900; font-family: monospace;"><a href="#" onclick="event.preventDefault(); window.app.views.toutesLesFactures.showSubPackageHistory('${liv.id}', '${lbl}');" style="color: #3b82f6; text-decoration: underline;" title="Voir l'historique des scans">${lbl}</a></td>
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
                        <td style="text-align: right; font-weight: 900; color: #0f172a;">${this.formatMoneyLocal(mTotal)}</td>
                        <td style="text-align: right; font-weight: 600; color: #10b981;">${this.formatMoneyLocal(mTotal)}</td>
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
                    <td style="text-align: right;">${this.formatMoneyLocal((item.pu || 0) / (isEur ? 1 : TAUX))}</td>
                    <td style="text-align: right; font-weight: 900; color:#0f172a;">${this.formatMoneyLocal((item.total || 0) / (isEur ? 1 : TAUX))}</td>
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
                                    <div class="bilan-pill__value">${this.formatMoneyLocal(total)}</div>
                                </div>
                                <div class="bilan-pill bilan-pill--paid">
                                    <div class="bilan-pill__label">MONTANT PAYÉ</div>
                                    <div class="bilan-pill__value">${this.formatMoneyLocal(paye)}</div>
                                </div>
                                <div class="bilan-pill bilan-pill--remaining">
                                    <div class="bilan-pill__label">RESTE À PAYER</div>
                                    <div class="bilan-pill__value">${this.formatMoneyLocal(reste)}</div>
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
                                        ${parrainName ? `<div class="info-row" style="background:#fff7ed; border-radius:8px; padding:6px 10px; margin-top:6px;"><span class="info-row__icon" style="color:#9a3412;"><i class="fas fa-handshake"></i></span><span class="info-row__value" style="color:#9a3412; font-weight:700;">Parrain : ${parrainName}</span></div>` : ''}
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
                                    <button class="amt-btn amt-btn-primary" onclick="window.app.views.toutesLesFactures.addPayment('${invoice.id}'); this.closest('.modal').remove();"><i class="fas fa-money-bill-wave"></i> Ajouter un paiement</button>
                                    <button class="amt-btn amt-btn-outline" onclick="window.app.views.toutesLesFactures.editInvoice('${invoice.id}'); this.closest('.modal').remove();"><i class="fas fa-edit"></i> Modifier</button>
                                    <button class="amt-btn amt-btn-danger" onclick="window.app.views.toutesLesFactures.deleteInvoice('${invoice.id}')"><i class="fas fa-trash"></i> Supprimer</button>
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

    async showSubPackageHistory(livId, label) {
        const { getDoc, doc } = await import("https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js");
        const { getCollectionName } = await import('../../agencies-config.js');
        const docSnap = await getDoc(doc(db, getCollectionName("livraisons"), livId));
        if (!docSnap.exists()) return;
        const liv = docSnap.data();

        let scansHtml = '';
        if (liv.scanHistory && Array.isArray(liv.scanHistory)) {
            const myScans = liv.scanHistory.filter(s => s.scanRef === label);
            myScans.sort((a, b) => new Date(b.date) - new Date(a.date)); // Du plus récent au plus ancien

            if (myScans.length > 0) {
                scansHtml = myScans.map(s => {
                    let typeLabel = s.type === 'ENTREPOT_PARIS' ? '🏭 Mise en entrepôt' : (s.type === 'CONTENEUR_CHARGEMENT' ? '🚢 Chargement Conteneur' : s.type);
                    const containerInfo = s.container && s.container !== '-' ? ` <span style="font-size:11px; background:#f1f5f9; padding:2px 6px; border-radius:4px; margin-left:8px; color:#475569;">Conteneur: <b>${s.container}</b></span>` : '';
                    return `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 15px 25px; border-bottom: 1px solid #f1f5f9;">
                            <div>
                                <div style="font-weight: 700; color: #0f172a; font-size: 14px;">${typeLabel}${containerInfo}</div>
                                <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Par : <span style="font-weight: 600;">${s.agent || 'Système'}</span></div>
                            </div>
                            <div style="font-size: 13px; color: #334155; font-weight: 600; background: #f8fafc; padding: 6px 12px; border-radius: 8px; border: 1px solid #e2e8f0;">
                                ${new Date(s.date).toLocaleString('fr-FR')}
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }

        if (!scansHtml) {
            scansHtml = '<div style="padding: 40px; text-align: center; color: #64748b;">Aucun historique de scan enregistré pour ce colis précis.</div>';
        }

        const html = `
            <div class="modal active" id="subPackageHistoryModal" style="z-index: 10005; position: fixed; inset: 0; background: rgba(15,23,42,0.6); display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px);">
                <div style="background: white; border-radius: 16px; width: 500px; max-width: 90%; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);">
                    <div style="padding: 20px 25px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; background: #f8fafc;">
                        <div>
                            <h3 style="margin: 0; font-size: 16px; font-weight: 800; color: #0f172a;">Historique des scans</h3>
                            <div style="font-size: 13px; color: #3b82f6; font-weight: bold; margin-top: 4px; font-family: monospace; letter-spacing: 0.5px;">${label}</div>
                        </div>
                        <button onclick="document.getElementById('subPackageHistoryModal').remove()" style="background: white; border: 1px solid #cbd5e1; width: 32px; height: 32px; border-radius: 8px; font-size: 18px; cursor: pointer; color: #64748b; display: flex; justify-content: center; align-items: center; transition: 0.2s;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='white'">✕</button>
                    </div>
                    <div style="padding: 0; max-height: 400px; overflow-y: auto;">${scansHtml}</div>
                </div>
            </div>
        `;
        document.getElementById('tlfModalsContainer').insertAdjacentHTML('beforeend', html);
    },

    async addPayment(id) {
        const inv = this.invoices.find(i => i.id === id);
        if (!inv) return;
        
        this.currentPaymentInvoice = JSON.parse(JSON.stringify(inv));
        if (!this.currentPaymentInvoice.paymentHistory) this.currentPaymentInvoice.paymentHistory = [];

        const isEur = isEurAgency();
        const TAUX = isEur ? CONSTANTS.TAUX_CONVERSION : 1;

        // Chargement des agents pour la liste déroulante
        let agentsOptions = '<option value="">-- Sélectionnez --</option>';
        try {
            const { collection, getDocs, query, orderBy } = await import("https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js");
            const snap = await getDocs(query(collection(db, "agents"), orderBy("name")));
            snap.forEach(doc => {
                agentsOptions += `<option value="${doc.data().name}">${doc.data().name}</option>`;
            });
        } catch (e) {}
        this.cachedAgentsOptions = agentsOptions;

        const html = `
        <div class="modal active" style="z-index: 10000; position: fixed; inset: 0; background: rgba(15,23,42,0.6); display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px);">
            <div style="background: white; border-radius: 16px; width: 600px; max-width: 95%; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);">
                <div style="padding: 20px 25px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; background: #f8fafc;">
                    <div>
                        <div style="font-size: 12px; color: #64748b; font-weight: 800; text-transform: uppercase;">Facture ${inv.reference}</div>
                        <div style="font-size: 18px; font-weight: 900; color: #0f172a;">Gérer les paiements</div>
                    </div>
                    <button onclick="this.closest('.modal').remove()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #64748b;">✕</button>
                </div>
                
                <div style="padding: 20px 25px; background: white; max-height: 70vh; overflow-y: auto;">
                    <!-- Ajustement global -->
                    <div class="form-group" style="margin-bottom:15px; border-bottom:1px solid #e2e8f0; padding-bottom:15px;">
                        <label style="font-size: 12px; font-weight: 800; color: #475569; margin-bottom: 6px; display: block;">Ajustement global de la facture</label>
                        <div style="display:flex; gap:10px;">
                            <select id="tlfPayGlobalAdjType" style="flex:1; padding: 10px; border-radius: 8px; border: 1px solid #cbd5e1; outline: none;" onchange="window.app.views.toutesLesFactures.renderLocalPaymentsTable()">
                                <option value="">-- Aucun --</option>
                                <option value="reduction" ${inv.adjustmentType === 'reduction' ? 'selected' : ''}>Réduction ⬇️</option>
                                <option value="augmentation" ${inv.adjustmentType === 'augmentation' ? 'selected' : ''}>Augmentation ⬆️</option>
                            </select>
                            <input type="number" id="tlfPayGlobalAdjVal" step="${isEur ? '0.01' : '1'}" value="${inv.adjustmentVal ? (isEur ? (inv.adjustmentVal / TAUX).toFixed(2) : inv.adjustmentVal) : ''}" placeholder="Valeur (${isEur ? '€' : 'CFA'})" style="flex:1; padding: 10px; border-radius: 8px; border: 1px solid #cbd5e1; font-weight: 900; outline: none;" oninput="window.app.views.toutesLesFactures.renderLocalPaymentsTable()">
                        </div>
                    </div>

                    <div id="tlfPaymentRecap" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 15px; margin-bottom: 20px;">
                        <!-- Rempli dynamiquement -->
                    </div>

                    <h3 style="margin-top:0; font-size:15px; color: #1e293b;">Historique des paiements</h3>
                    <div style="max-height: 200px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 20px;">
                        <table class="modal-table" style="margin: 0; width: 100%;">
                            <thead style="position: sticky; top: 0; z-index: 1;"><tr><th>Date</th><th>Paris (${isEur ? '€' : 'CFA'})</th><th>Abidjan (CFA)</th><th>Mode</th><th style="text-align:right;">Action</th></tr></thead>
                            <tbody id="tlfPaymentsBody"></tbody>
                        </table>
                    </div>

                    <h3 id="tlfPaymentFormTitle" style="margin-top:0; font-size:15px; color: #1e293b;">Ajouter un paiement</h3>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <input type="hidden" id="tlfPayIndex" value="">
                        <div class="form-group">
                            <label style="font-size: 12px; font-weight: 800; color: #475569; margin-bottom: 6px; display: block;">Date *</label>
                            <input type="date" id="tlfPayDate" value="${new Date().toISOString().split('T')[0]}" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #cbd5e1; outline: none; box-sizing: border-box;">
                        </div>
                        <div class="form-group">
                            <label style="font-size: 12px; font-weight: 800; color: #475569; margin-bottom: 6px; display: block;">Mode de paiement *</label>
                            <select id="tlfPayMode" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #cbd5e1; font-weight: 600; outline: none; box-sizing: border-box;">
                                <option value="ESPECES">ESPÈCES</option>
                                ${isEur ? '<option value="CB">CARTE BANCAIRE</option><option value="BON D ENVOI">BON D\'ENVOI</option>' : '<option value="WAVE">WAVE</option><option value="ORANGE MONEY">ORANGE MONEY</option>'}
                                <option value="CHEQUES">CHÈQUE</option>
                                <option value="VIREMENTS">VIREMENT</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label style="font-size: 12px; font-weight: 800; color: #475569; margin-bottom: 6px; display: block;">Montant Paris (${isEur ? '€' : 'CFA'})</label>
                            <input type="number" id="tlfPayAmountParis" step="${isEur ? '0.01' : '1'}" placeholder="0" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #cbd5e1; font-weight: 900; outline: none; color: #3b82f6; box-sizing: border-box;">
                        </div>
                        <div class="form-group">
                            <label style="font-size: 12px; font-weight: 800; color: #475569; margin-bottom: 6px; display: block;">Montant Abidjan (CFA)</label>
                            <input type="number" id="tlfPayAmountAbidjan" step="1" placeholder="0" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #cbd5e1; font-weight: 900; outline: none; color: #3b82f6; box-sizing: border-box;">
                        </div>
                        
                        <div class="form-group" style="grid-column: span 2;">
                            <label style="font-size: 12px; font-weight: 800; color: #475569; margin-bottom: 6px; display: block;">Info (Banque / Transfert)</label>
                            <input type="text" id="tlfPayInfo" placeholder="Ex: Virement SG, Chèque N°..." style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #cbd5e1; outline: none; box-sizing: border-box;">
                        </div>
                        <div class="form-group" style="grid-column: span 2;">
                            <label style="font-size: 12px; font-weight: 800; color: #475569; margin-bottom: 6px; display: block;">Agent (Optionnel)</label>
                            <select id="tlfPayAgent" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #cbd5e1; outline: none; box-sizing: border-box;">
                                ${this.cachedAgentsOptions}
                            </select>
                        </div>
                    </div>
                    <button id="tlfAddOrUpdateBtn" class="btn btn-outline" onclick="window.app.views.toutesLesFactures.addOrUpdateLocalPayment()" style="margin-top:10px; width: 100%; border-color: #3b82f6; color: #3b82f6; font-weight: bold;">Ajouter ce paiement à la liste</button>
                </div>
                
                <div style="padding: 20px 25px; border-top: 1px solid #e2e8f0; background: #f8fafc; display: flex; justify-content: flex-end; gap: 10px;">
                    <button class="btn btn-outline" onclick="this.closest('.modal').remove()" style="padding: 10px 15px; font-weight: 600; background: white; border: 1px solid #cbd5e1; border-radius: 8px;">Annuler</button>
                    <button class="btn btn-primary" onclick="window.app.views.toutesLesFactures.savePaymentsToFirestore('${inv.id}')" style="padding: 10px 20px; font-weight: 600; background: #10b981; color: white; border: none; border-radius: 8px;">
                        <i class="fas fa-save"></i> Enregistrer les modifications
                    </button>
                </div>
            </div>
        </div>
        `;
        document.getElementById('tlfModalsContainer').innerHTML = html;
        
        this.renderLocalPaymentsTable();
    },

    renderLocalPaymentsTable() {
        const tbody = document.getElementById('tlfPaymentsBody');
        if (!tbody) return;

        const isEur = isEurAgency();
        const TAUX = isEur ? CONSTANTS.TAUX_CONVERSION : 1;

        let totalAbidjanCfa = 0;
        let totalParisCfa = 0;

        tbody.innerHTML = this.currentPaymentInvoice.paymentHistory.map((p, index) => {
            totalAbidjanCfa += (parseFloat(p.montantAbidjan) || 0);
            totalParisCfa += (parseFloat(p.montantParis) || 0);
            
            const displayParis = isEur ? (p.montantParis || 0) / TAUX : (p.montantParis || 0);
            
            return `
                <tr>
                    <td>${p.date}</td>
                    <td>${this.formatMoneyLocal(displayParis, !isEur)}</td>
                    <td>${this.formatMoneyLocal(p.montantAbidjan || 0, true)}</td>
                    <td><span class="badge" style="background:#f1f5f9; color:#475569;">${p.modePaiement || 'Espèces'}</span></td>
                    <td style="text-align:right; white-space:nowrap;">
                        <button class="btn btn-outline btn-small" onclick="window.app.views.toutesLesFactures.editLocalPayment(${index})" title="Modifier" style="padding:4px 8px; margin-right:4px;">✏️</button>
                        <button class="btn btn-outline btn-small" onclick="window.app.views.toutesLesFactures.deleteLocalPayment(${index})" title="Supprimer" style="color: #ef4444; border-color: #fecaca; padding:4px 8px;">🗑️</button>
                    </td>
                </tr>
            `;
        }).join('');

        if (this.currentPaymentInvoice.paymentHistory.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #64748b; padding: 15px;">Aucun paiement enregistré.</td></tr>';
        }

        let effectivePrixCfa = parseFloat(this.currentPaymentInvoice.prix) || 0;
        const adjType = document.getElementById('tlfPayGlobalAdjType')?.value;
        const adjValInput = parseFloat(document.getElementById('tlfPayGlobalAdjVal')?.value) || 0;
        const adjValCfa = isEur ? Math.round(adjValInput * TAUX) : adjValInput;
        
        if (adjType === 'reduction' && adjValCfa > 0) effectivePrixCfa -= adjValCfa;
        else if (adjType === 'augmentation' && adjValCfa > 0) effectivePrixCfa += adjValCfa;

        const payeCfa = totalAbidjanCfa + totalParisCfa;
        const resteCfa = effectivePrixCfa - payeCfa;

        const recapEl = document.getElementById('tlfPaymentRecap');
        if (recapEl) {
            recapEl.innerHTML = `
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                    <span style="color: #64748b; font-size: 13px; font-weight: 600;">Prix total (ajusté)</span>
                    <span style="font-weight: 800; color: #1e293b;">${this.formatMoneyLocal(effectivePrixCfa / TAUX)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                    <span style="color: #64748b; font-size: 13px; font-weight: 600;">Total payé</span>
                    <span style="font-weight: 800; color: #10b981;">${this.formatMoneyLocal(payeCfa / TAUX)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding-top: 10px; border-top: 1px dashed #cbd5e1;">
                    <span style="color: #0f172a; font-size: 13px; font-weight: 800;">Reste à payer</span>
                    <span style="font-weight: 900; color: ${resteCfa > 0 ? '#ef4444' : '#10b981'}; font-size: 16px;">${this.formatMoneyLocal(resteCfa / TAUX)}</span>
                </div>
            `;
        }

        const amountParisEl = document.getElementById('tlfPayAmountParis');
        if (amountParisEl && document.getElementById('tlfPayIndex').value === '') {
            const displayReste = resteCfa > 0 ? (resteCfa / TAUX) : '';
            amountParisEl.value = isEur ? (displayReste ? displayReste.toFixed(2) : '') : displayReste;
        }
    },

    editLocalPayment(index) {
        const p = this.currentPaymentInvoice.paymentHistory[index];
        if (!p) return;
        
        const isEur = isEurAgency();
        const TAUX = isEur ? CONSTANTS.TAUX_CONVERSION : 1;
        
        document.getElementById('tlfPayIndex').value = index;
        document.getElementById('tlfPayDate').value = p.date;
        document.getElementById('tlfPayAmountAbidjan').value = p.montantAbidjan || '';
        document.getElementById('tlfPayAmountParis').value = p.montantParis ? (isEur ? (p.montantParis / TAUX).toFixed(2) : p.montantParis) : '';
        document.getElementById('tlfPayMode').value = p.modePaiement || 'ESPECES';
        document.getElementById('tlfPayInfo').value = p.agentMobileMoney || '';
        document.getElementById('tlfPayAgent').value = p.agent || '';
        
        document.getElementById('tlfPaymentFormTitle').textContent = "Modifier le paiement";
        document.getElementById('tlfAddOrUpdateBtn').textContent = "Mettre à jour ce paiement";
    },

    deleteLocalPayment(index) {
        if (confirm("Supprimer ce paiement de la liste ?")) {
            this.currentPaymentInvoice.paymentHistory.splice(index, 1);
            this.renderLocalPaymentsTable();
            
            // Reset form
            document.getElementById('tlfPayIndex').value = '';
            document.getElementById('tlfPayDate').value = new Date().toISOString().split('T')[0];
            document.getElementById('tlfPayAmountAbidjan').value = '';
            document.getElementById('tlfPayAmountParis').value = '';
            document.getElementById('tlfPayMode').value = 'ESPECES';
            document.getElementById('tlfPayInfo').value = '';
            document.getElementById('tlfPayAgent').value = '';
            document.getElementById('tlfPaymentFormTitle').textContent = "Ajouter un paiement";
            document.getElementById('tlfAddOrUpdateBtn').textContent = "Ajouter ce paiement à la liste";
        }
    },

    addOrUpdateLocalPayment() {
        const isEur = isEurAgency();
        const TAUX = isEur ? CONSTANTS.TAUX_CONVERSION : 1;
        
        const date = document.getElementById('tlfPayDate').value;
        const amountAbidjanCfa = parseFloat(document.getElementById('tlfPayAmountAbidjan').value) || 0;
        const amountParisInput = parseFloat(document.getElementById('tlfPayAmountParis').value) || 0;
        const amountParisCfa = isEur ? Math.round(amountParisInput * TAUX) : amountParisInput;
        
        const mode = document.getElementById('tlfPayMode').value;
        const info = document.getElementById('tlfPayInfo').value.trim();
        const agent = document.getElementById('tlfPayAgent').value;
        const indexStr = document.getElementById('tlfPayIndex').value;

        if (!date) {
            this.app.showToast("Veuillez saisir une date.", "error");
            return;
        }

        if (amountAbidjanCfa <= 0 && amountParisCfa <= 0) {
            this.app.showToast("Veuillez saisir un montant.", "error");
            return;
        }

        const paymentData = {
            date: date,
            montantParis: amountParisCfa,
            montantAbidjan: amountAbidjanCfa,
            modePaiement: mode,
            agentMobileMoney: info,
            agent: agent,
            saisiPar: sessionStorage.getItem('userName') || 'Agent'
        };

        if (indexStr !== '') {
            const index = parseInt(indexStr);
            const existing = this.currentPaymentInvoice.paymentHistory[index];
            if (existing.sessionId) paymentData.sessionId = existing.sessionId;
            this.currentPaymentInvoice.paymentHistory[index] = paymentData;
        } else {
            paymentData.isNew = true;
            this.currentPaymentInvoice.paymentHistory.push(paymentData);
        }

        this.renderLocalPaymentsTable();

        // Reset form
        document.getElementById('tlfPayIndex').value = '';
        document.getElementById('tlfPayDate').value = new Date().toISOString().split('T')[0];
        document.getElementById('tlfPayAmountAbidjan').value = '';
        document.getElementById('tlfPayAmountParis').value = '';
        document.getElementById('tlfPayMode').value = 'ESPECES';
        document.getElementById('tlfPayInfo').value = '';
        document.getElementById('tlfPayAgent').value = '';
        document.getElementById('tlfPaymentFormTitle').textContent = "Ajouter un paiement";
        document.getElementById('tlfAddOrUpdateBtn').textContent = "Ajouter ce paiement à la liste";
    },

    async savePaymentsToFirestore(id) {
        const inv = this.invoices.find(i => i.id === id);
        if (!inv) return;

        const isEur = isEurAgency();
        const TAUX = isEur ? CONSTANTS.TAUX_CONVERSION : 1;

        try {
            const btn = document.querySelector('#tlfModalsContainer .btn-primary');
            if(btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Traitement...'; btn.disabled = true; }

            const { updateDoc, doc, writeBatch, collection } = await import("https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js");
            const { getCollectionName } = await import('../../agencies-config.js');
            const batch = writeBatch(db);

            let totalAbidjanCfa = 0;
            let totalParisCfa = 0;
            const uniqueAgents = new Set();
            
            const adjType = document.getElementById('tlfPayGlobalAdjType').value;
            const adjValInput = parseFloat(document.getElementById('tlfPayGlobalAdjVal').value) || 0;
            const adjValCfa = isEur ? Math.round(adjValInput * TAUX) : adjValInput;

            let effectivePrixCfa = parseFloat(inv.prix) || 0;
            if (adjType === 'reduction' && adjValCfa > 0) effectivePrixCfa -= adjValCfa;
            else if (adjType === 'augmentation' && adjValCfa > 0) effectivePrixCfa += adjValCfa;

            this.currentPaymentInvoice.paymentHistory.forEach(p => {
                totalAbidjanCfa += (p.montantAbidjan || 0);
                totalParisCfa += (p.montantParis || 0);
                if (p.agent) p.agent.split(',').forEach(a => { if (a.trim()) uniqueAgents.add(a.trim()); });
                
                if (p.isNew) {
                    const auditRef = doc(collection(db, getCollectionName("audit_logs")));
                    p.sessionId = auditRef.id;
                    
                    const isCash = ['Espèces', 'Espèce', 'ESPECES', 'CB', 'CARTE BANCAIRE', 'Wave', 'OM', 'ORANGE MONEY'].includes(p.modePaiement);
                    const totalIn = isCash ? (isEur ? p.montantParis : p.montantAbidjan) : 0;
                    
                    batch.set(auditRef, {
                        date: new Date().toISOString(),
                        entryDate: p.date,
                        user: p.saisiPar,
                        action: "VALIDATION_JOURNEE",
                        details: `Encaissement factures | Réf: ${inv.reference} | ${p.modePaiement}: Par: ${p.montantParis || 0}, Abj: ${p.montantAbidjan || 0}`,
                        targetId: "BATCH",
                        status: "PENDING",
                        transactionIds: [id],
                        expenseIds: [],
                        agents: p.agent || '',
                        totalIn: totalIn || 0,
                        totalGlobalIn: (p.montantParis || 0) + (p.montantAbidjan || 0),
                        totalOut: 0,
                        result: totalIn || 0,
                        agency: sessionStorage.getItem('currentActiveAgency') || 'paris'
                    });
                    delete p.isNew;
                }
            });

            const newResteCfa = (totalAbidjanCfa + totalParisCfa) - effectivePrixCfa;

            this.currentPaymentInvoice.paymentHistory.sort((a, b) => new Date(b.date) - new Date(a.date));
            const lastPaymentDate = this.currentPaymentInvoice.paymentHistory.length > 0 ? this.currentPaymentInvoice.paymentHistory[0].date : null;

            const updates = {
                montantAbidjan: totalAbidjanCfa,
                montantParis: totalParisCfa,
                reste: newResteCfa,
                paymentHistory: this.currentPaymentInvoice.paymentHistory,
                agent: Array.from(uniqueAgents).join(', '),
                adjustmentType: adjType,
                adjustmentVal: adjValCfa
            };
            if (lastPaymentDate) updates.lastPaymentDate = lastPaymentDate;
            
            batch.update(doc(db, getCollectionName("transactions"), id), updates);
            await batch.commit();

            this.app.showToast("Paiements mis à jour avec succès !", "success");
            document.getElementById('tlfModalsContainer').innerHTML = ''; // Fermer modal
        } catch(e) {
            console.error(e);
            this.app.showToast("Erreur lors de l'enregistrement", "error");
        }
    },

    async editInvoice(id) {
        const inv = this.invoices.find(i => i.id === id);
        if (!inv) return;
        
        const isEur = isEurAgency();
        const TAUX = isEur ? CONSTANTS.TAUX_CONVERSION : 1;
        
        const total = (parseFloat(inv.prix) || 0) / TAUX;
        const paye = ((parseFloat(inv.montantParis) || 0) + (parseFloat(inv.montantAbidjan) || 0)) / TAUX;
        const reste = total - paye;

        this.currentEditInvoice = inv;
        this.editItems = inv.items && Array.isArray(inv.items) && inv.items.length > 0 
            ? JSON.parse(JSON.stringify(inv.items)) 
            : [{ id: Date.now(), desc: inv.description || '', qty: 1, pu: total * (isEur ? 1 : TAUX), total: total * (isEur ? 1 : TAUX), vol: inv.volumeCBM || 0 }];

        // Note : On gère l'affichage en CFA si on est à Abidjan pour le Edit, donc this.editItems est en CFA pour abidjan, EUR pour Paris

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

                    <div style="background: white; border-radius: 12px; border: 1px solid #e2e8f0; overflow: visible;">
                        <div style="padding: 12px 15px; background: #f8fafc; border-radius: 12px 12px 0 0; border-bottom: 1px solid #e2e8f0; font-weight: 800; color: #1e293b; display: flex; justify-content: space-between; align-items: center;">
                            <div style="display: flex; align-items: center; gap: 8px;"><i class="fas fa-box" style="color: #8b5cf6;"></i> Tarification & description colis</div>
                            <button class="btn btn-outline btn-small" onclick="window.app.views.toutesLesFactures.addEditItemRow()" style="padding: 6px 12px; font-size: 12px; border-radius: 6px; background: white; border: 1px solid #cbd5e1; cursor: pointer;"><i class="fas fa-plus"></i> Ajouter ligne</button>
                        </div>
                        <div style="padding: 15px;">
                            <div id="tlfEditItemsContainer"></div>

                            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-top: 15px; padding-top: 15px; border-top: 1px solid #e2e8f0;">
                                <div style="background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0;">
                                    <div style="font-size: 11px; color: #64748b; font-weight: 700; text-transform: uppercase;">Prix total</div>
                                    <div style="font-size: 18px; font-weight: 900; color: #0f172a;" id="tlfEditTotal">${this.formatMoneyLocal(total)}</div>
                                </div>
                                <div style="background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0;">
                                    <div style="font-size: 11px; color: #64748b; font-weight: 700; text-transform: uppercase;">Déjà payé</div>
                                    <div style="font-size: 18px; font-weight: 900; color: #10b981;" id="tlfEditPaye">${this.formatMoneyLocal(paye)}</div>
                                </div>
                                <div id="tlfEditResteCard" style="background: ${reste <= 0 ? '#dcfce7' : '#fffbeb'}; padding: 12px; border-radius: 8px; border: 1px solid ${reste <= 0 ? '#bbf7d0' : '#fde68a'};">
                                    <div style="font-size: 11px; color: ${reste <= 0 ? '#166534' : '#b45309'}; font-weight: 700; text-transform: uppercase;">Restant</div>
                                    <div style="font-size: 18px; font-weight: 900; color: ${reste <= 0 ? '#166534' : '#d97706'};" id="tlfEditReste">${this.formatMoneyLocal(reste)}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style="background: white; border-radius: 12px; border: 1px solid #e2e8f0; overflow: visible;">
                        <div style="padding: 12px 15px; background: #f8fafc; border-radius: 12px 12px 0 0; border-bottom: 1px solid #e2e8f0; font-weight: 800; color: #1e293b; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-comment-dots" style="color: #f59e0b;"></i> Notes
                        </div>
                        <div style="padding: 15px;">
                            <textarea id="tlfEditNotes" rows="3" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; outline: none; box-sizing: border-box; resize: vertical; font-family: inherit;">${inv.notes || ''}</textarea>
                        </div>
                    </div>
                </div>
                
                <div style="padding: 20px 25px; border-top: 1px solid #e2e8f0; background: white; display: flex; justify-content: flex-end; gap: 10px;">
                    <button class="btn btn-outline" onclick="this.closest('.modal').remove()" style="padding: 10px 20px; font-weight: 600; border-radius: 8px; background: white; border: 1px solid #cbd5e1;">Annuler</button>
                    <button class="btn btn-primary" onclick="window.app.views.toutesLesFactures.saveEdit('${inv.id}')" style="padding: 10px 20px; font-weight: 600; border-radius: 8px; background: #3b82f6; color: white; border: none;">
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
        
        const isEur = isEurAgency();
        const deviseStr = isEur ? '€' : 'CFA';
        const stepStr = isEur ? '0.01' : '1';

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
                    <label style="font-size: 11px; font-weight: 600; color: #475569; display: block; margin-bottom: 4px;">P.U (${deviseStr})</label>
                    <input type="number" class="edit-item-pu" data-id="${item.id}" value="${item.pu}" min="0" step="${stepStr}" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box; text-align: right; outline: none;">
                </div>
                <div>
                    <label style="font-size: 11px; font-weight: 600; color: #475569; display: block; margin-bottom: 4px;">Total</label>
                    <input type="text" value="${this.formatMoneyLocal(item.total)}" readonly style="width: 100%; padding: 8px; border: 1px solid #e2e8f0; border-radius: 6px; box-sizing: border-box; text-align: right; background: #e2e8f0; font-weight: bold; outline: none; color: #0f172a;">
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
                (p) => `<div style="font-weight: 600;">${p.desc}</div><div style="font-size: 11px; opacity: 0.7;">Prix: ${this.formatMoneyLocal(p.price || 0)}</div>`,
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
                if (totalInput) totalInput.value = this.formatMoneyLocal(item.total);
            }
            
            this.calculateEditTotals();
        }
    },

    calculateEditTotals() {
        const isEur = isEurAgency();
        const TAUX = isEur ? CONSTANTS.TAUX_CONVERSION : 1;

        const totalDisplay = this.editItems.reduce((sum, item) => sum + item.total, 0);
        const payeDisplay = ((parseFloat(this.currentEditInvoice.montantParis) || 0) + (parseFloat(this.currentEditInvoice.montantAbidjan) || 0)) / TAUX;
        const resteDisplay = totalDisplay - payeDisplay;

        const totalEl = document.getElementById('tlfEditTotal');
        const resteEl = document.getElementById('tlfEditReste');
        const resteCard = document.getElementById('tlfEditResteCard');

        if (totalEl) totalEl.textContent = this.formatMoneyLocal(totalDisplay);
        if (resteEl) resteEl.textContent = this.formatMoneyLocal(resteDisplay);
        
        if (resteCard) {
            if (resteDisplay <= 0) {
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
        
        const isEur = isEurAgency();
        const TAUX = isEur ? CONSTANTS.TAUX_CONVERSION : 1;

        const newPrixCfa = this.editItems.reduce((sum, item) => sum + (isEur ? Math.round(item.total * TAUX) : item.total), 0);
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
            items: this.editItems, // Enregistré en EUR si isEur, sinon CFA
            quantite: newTotalQty,
            volumeCBM: newVolumeCBM,
            notes: document.getElementById('tlfEditNotes').value.trim()
        };

        const payeCfa = (parseFloat(inv.montantParis) || 0) + (parseFloat(inv.montantAbidjan) || 0);
        updates.reste = payeCfa - newPrixCfa;

        try {
            const btn = document.querySelector('#tlfModalsContainer .btn-primary');
            if(btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Application...'; btn.disabled = true; }

            const { updateDoc, doc, writeBatch, getDocs, query, collection, where, limit } = await import("https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js");
            const { getCollectionName } = await import('../../agencies-config.js');
            
            const batch = writeBatch(db);
            
            batch.update(doc(db, getCollectionName("transactions"), id), updates);

            const livQ = await getDocs(query(collection(db, getCollectionName("livraisons")), where("ref", "==", inv.reference), limit(1)));
            if (!livQ.empty) {
                const livDoc = livQ.docs[0];
                const livData = livDoc.data();
                
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
                    montant: Math.abs(updates.reste) + " CFA"
                });
            }

            if (newConteneur !== 'ATT') {
                const containerRef = doc(db, getCollectionName("containers"), newConteneur);
                batch.set(containerRef, { number: newConteneur, status: 'EN_CHARGEMENT', destination: 'ABIDJAN', createdAt: new Date().toISOString() }, { merge: true });
            }

            await batch.commit();

            this.app.showToast("Facture modifiée avec succès !", "success");
            document.getElementById('tlfModalsContainer').innerHTML = '';
        } catch(e) {
            console.error(e);
            this.app.showToast("Erreur lors de la modification", "error");
        }
    },

    async deleteInvoice(id) {
        const inv = this.invoices.find(i => i.id === id);
        if (!inv) return;
        
        if (!await window.AppModal.confirm(`Voulez-vous vraiment supprimer la facture ${inv.reference} ?\n\nCela supprimera également les données logistiques associées. Cette action est irréversible.`, "Supprimer la facture", true)) return;

        try {
            const { updateDoc, doc, writeBatch, getDocs, query, collection, where } = await import("https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js");
            const { getCollectionName } = await import('../../agencies-config.js');
            
            const batch = writeBatch(db);
            
            batch.update(doc(db, getCollectionName("transactions"), id), { isDeleted: true, deletedAt: new Date().toISOString() });

            const livQ = await getDocs(query(collection(db, getCollectionName("livraisons")), where("ref", "==", inv.reference)));
            livQ.forEach(d => {
                batch.delete(d.ref);
            });

            await batch.commit();

            this.app.showToast("Facture supprimée avec succès !", "success");
            document.getElementById('tlfModalsContainer').innerHTML = '';
        } catch (e) {
            this.app.showToast("Erreur lors de la suppression", "error");
        }
    },

    async reuseInvoice(id) {
        const inv = this.invoices.find(i => i.id === id);
        if (!inv) return;
        
        sessionStorage.setItem('reuseExpediteur', inv.nom || '');
        
        this.app.renderPage('invoice-new');
        this.app.showToast(`Pré-remplissage avec les informations de ${inv.nom}...`, "info");
    },

    exportExcel() {
        this.app.showToast("Export Excel en cours de développement", "info");
    },

    exportPDF() {
        this.app.showToast("Export PDF en cours de développement", "info");
    },

    async printEtiquettes(id, format) {
        if (!this.app.printLabels) {
            this.app.showToast("L'impression d'étiquettes sera bientôt disponible dans cette vue.", "info");
            return;
        }
        
        const invoice = this.invoices.find(i => i.id === id);
        if(!invoice) return;
        
        const originalFormat = localStorage.getItem('amt_label_format');
        localStorage.setItem('amt_label_format', format);
        
        const { getDocs, query, collection, where, limit } = await import("https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js");
        const { getCollectionName } = await import('../../agencies-config.js');
        
        const livQ = await getDocs(query(collection(db, getCollectionName("livraisons")), where("ref", "==", invoice.reference), limit(1)));
        
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
        
        if (labelsList.length === 0) {
            const defaultDesc = invoice.items && invoice.items.length > 0 ? invoice.items[0].desc : invoice.description;
            labelsList = [{ sousRef: invoice.reference, desc: defaultDesc || 'COLIS', index: 1, total: 1 }];
        }
        
        let expAddress = '';
        const clientQ = await getDocs(query(collection(db, getCollectionName("clients")), where("nom", "==", invoice.nom), limit(1)));
        if (!clientQ.empty) expAddress = clientQ.docs[0].data().adresse || '';

        let dName = invoice.nomDestinataire || '';
        let dPhone = invoice.numero || invoice.tel || '';
        const phoneMatch = dName.match(/(?:(?:\+|00)225[\s.-]?)?(?:01|05|07|0)\d(?:[\s.-]?\d{2}){4}|(?:(?:\+|00)225[\s.-]?)?(?:01|05|07|0)\d{8,}/);
        if (phoneMatch) {
            dName = dName.replace(phoneMatch[0], '').replace(/[-–,;:\/\s]+$/, '').trim();
            if (!dPhone) dPhone = phoneMatch[0];
        }

        const data = {
            ref: invoice.reference,
            date: invoice.date + ' 12:00:00', 
            destName: dName,
            destPhone: dPhone,
            destAddress: invoice.adresseDestinataire || invoice.lieuLivraison || '',
            expName: invoice.nom,
            expAddress: expAddress,
            labels: labelsList
        };
        
        await this.app.printLabels(data);
        
        if (originalFormat) localStorage.setItem('amt_label_format', originalFormat);
    },

    async printDocument(id, docType) {
        const invoice = this.invoices.find(i => i.id === id);
        if(!invoice) return;

        this.app.showToast(`Génération de ${docType}...`, "info");

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
        const { getDoc, doc: fsDoc } = await import("https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js");

        let logoBase64 = null;
        let companyName = "AMT TRANS'IT";
        let invoiceConfig = null;
        try {
            const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris'; // Fallback to paris settings if needed
            const compSnap = await getDoc(fsDoc(db, "settings", `company_${activeAgency}`));
            if (compSnap.exists()) {
                if (compSnap.data().logoBase64) logoBase64 = compSnap.data().logoBase64;
                if (compSnap.data().name) companyName = compSnap.data().name;
            }
            const invConfigSnap = await getDoc(fsDoc(db, "settings", `invoice_config_${activeAgency}`));
            if (invConfigSnap.exists()) {
                invoiceConfig = invConfigSnap.data();
                if (invoiceConfig.companyName) companyName = invoiceConfig.companyName;
                if (invoiceConfig.logoUrl) logoBase64 = invoiceConfig.logoUrl;
            }
        } catch(e) { console.error(e); }

        let defaultColor = invoiceConfig?.primaryColor ? JSON.parse(invoiceConfig.primaryColor) : [59, 130, 246];
        let accentColor = defaultColor;
        if (docType === 'BL' || docType === 'ATTESTATION') accentColor = [16, 185, 129];

        doc.setFillColor(30, 41, 59);
        doc.rect(0, 0, pageWidth, 35, 'F');
        doc.setFillColor(...accentColor);
        doc.rect(0, 35, pageWidth, 2, 'F');

        if (logoBase64 && logoBase64.startsWith('http')) {
            try {
                const response = await fetch(logoBase64);
                const blob = await response.blob();
                logoBase64 = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
            } catch(e) { logoBase64 = null; }
        }
        let textX = 15;
        let textY = 22;
        if (logoBase64) {
            try {
                const props = doc.getImageProperties(logoBase64);
                const ratio = props.width / props.height;
                let imgH = 16;
                let imgW = imgH * ratio;
                if (imgW > 40) { imgW = 40; imgH = imgW / ratio; }
                doc.addImage(logoBase64, 'PNG', 15, 10, imgW, imgH);
                textX = 15 + imgW + 5;
                textY = 22;
            } catch(e) {}
        } else {
            try {
                const logoElement = document.querySelector('.app-logo');
                if (logoElement && logoElement.complete && logoElement.naturalWidth > 0) {
                    const ratio = logoElement.naturalWidth / logoElement.naturalHeight;
                    let imgH = 16;
                    let imgW = imgH * ratio;
                    if (imgW > 40) { imgW = 40; imgH = imgW / ratio; }
                    doc.addImage(logoElement, 'PNG', 15, 10, imgW, imgH);
                    textX = 15 + imgW + 5;
                    textY = 22;
                }
            } catch(e) {}
        }

        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(18);
        doc.text(companyName, textX, textY);

        let titleText = "FACTURE";
        if (docType === 'BL') titleText = "BON DE LIVRAISON";
        if (docType === 'ATTESTATION') titleText = "ATTESTATION";
        if (docType === 'RECU') titleText = "REÇU";
        
        doc.text(titleText, pageWidth - 15, 22, { align: 'right' });

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
        doc.text(docType === 'BL' || docType === 'ATTESTATION' ? "LIVRÉ À :" : "FACTURÉ À :", 120, 52);
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

        const isBL = docType === 'BL' || docType === 'ATTESTATION';
        const tableColumn = isBL 
            ? ["Description / Nature du Colis", "Qté", "Statut", "Observations"]
            : ["Description / Nature du Colis", "Qté", "P.U", "Total"];
        const tableRows = [];
        
        const isEur = isEurAgency();
        const TAUX = isEur ? CONSTANTS.TAUX_CONVERSION : 1;

        if (invoice.items && Array.isArray(invoice.items)) {
            invoice.items.forEach(item => {
                if (isBL) {
                    tableRows.push([item.desc, item.qty.toString(), "À LIVRER", "-"]);
                } else {
                    tableRows.push([
                        item.desc,
                        item.qty.toString(),
                        this.formatMoneyLocal((item.pu || 0) / (isEur ? 1 : TAUX)),
                        this.formatMoneyLocal((item.total || 0) / (isEur ? 1 : TAUX))
                    ]);
                }
            });
        } else {
            (invoice.description || '').split(',').forEach(d => {
                const match = d.trim().match(/^(\d+)x\s+(.+)$/);
                const desc = match ? match[2] : d.trim();
                const qty = match ? match[1] : '1';
                if (isBL) tableRows.push([desc, qty, "À LIVRER", "-"]);
                else tableRows.push([desc, qty, "-", "-"]);
            });
        }

        const columnStyles = isBL 
            ? { 1: { halign: 'center' }, 2: { halign: 'center' } }
            : { 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' } };

        doc.autoTable({
            startY: 90,
            head: [tableColumn],
            body: tableRows,
            theme: 'grid',
            headStyles: { fillColor: accentColor },
            columnStyles: columnStyles
        });

        const finalY = doc.lastAutoTable.finalY + 15;
        const prixFret = (parseFloat(invoice.prix) || 0) / TAUX;
        const paye = ((parseFloat(invoice.montantParis) || 0) + (parseFloat(invoice.montantAbidjan) || 0)) / TAUX;
        const reste = Math.abs(parseFloat(invoice.reste) || 0) / TAUX;

        if (docType === 'FACTURE' || docType === 'RECU') {
            doc.setFont("helvetica", "bold");
            doc.text("RÉCAPITULATIF FINANCIER", 115, finalY);
            doc.setFont("helvetica", "normal");
            
            let currentLineY = finalY + 8;
            doc.text("Total Fret :", 115, currentLineY);
            doc.text(`${this.formatMoneyLocal(prixFret)}`, 195, currentLineY, { align: 'right' });
            currentLineY += 6;
            
            doc.text("Montant Payé :", 115, currentLineY);
            doc.text(`${this.formatMoneyLocal(paye)}`, 195, currentLineY, { align: 'right' });
            currentLineY += 6;
            
            doc.setFillColor(reste > 0 ? 254 : 240, reste > 0 ? 242 : 253, reste > 0 ? 242 : 244);
            doc.rect(115, currentLineY + 2, 80, 10, 'F');
            doc.setFont("helvetica", "bold");
            doc.text("RESTE À PAYER :", 118, currentLineY + 9);
            doc.setTextColor(reste > 0 ? 220 : 22, reste > 0 ? 38 : 163, reste > 0 ? 38 : 74);
            doc.text(`${this.formatMoneyLocal(reste)}`, 192, currentLineY + 9, { align: 'right' });
            doc.setTextColor(0, 0, 0);

            doc.text("La Direction AMT TRANS'IT", 15, currentLineY + 9);
        } else {
            let sigY = finalY + 15;
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
            const cgvLines = cgvText.replace(/\\n/g, '\n').split('\n');
            
            cgvLines.forEach(line => {
                const splitLine = doc.splitTextToSize(line, pageWidth - 30);
                doc.text(splitLine, 15, cgvY);
                cgvY += (splitLine.length * 3.5);
            });
        }

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        const footerText = invoiceConfig?.footer || "AMT TRANS'IT | 81 AVENUE ARISTIDE BRIAND 93240 STAINS | Tel. 0186900380 | amt.transit@gmail.com";
        doc.text(footerText, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });

        doc.save(`${titleText.replace(/ /g, '_')}_${invoice.reference}.pdf`);
    }
};
