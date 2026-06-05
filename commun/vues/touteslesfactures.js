import { db } from '../../firebase-config.js';
import { collection, query, where, onSnapshot, doc, writeBatch, getDocs, orderBy, limit } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { Autocomplete } from '../../depart/js/views/autocomplete.js';
import { CONSTANTS, DEFAULT_CGV, DEFAULT_COMPANY_FOOTER } from '../../constants.js';
import { createApp, ref, computed, reactive, onMounted, onUnmounted } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";
import { getCollectionName, AGENCIES, getConfigSourceAgency } from '../../agencies-config.js';
import { loadJsPdf } from '../services/pdf-common.js';
import { applyInvoiceSecurity } from '../services/invoice-security.js';
import { phoneTail, toE164Intl, toE164Detect, routePhoneCountries } from '../services/phone.js';
import { extractPhone, stripPhoneFromName } from '../services/phone.js';
import { filterByShippingMode } from '../../shipping-mode.js';
import { normalizePhone } from '../../affiliations.js';
import { calculateStorageFee } from '../services/storageFee.js';

import { formatMoney, isEurAgency } from '../services/format.js';

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
    formatMoneyLocal(amount, forceCfa = false) { return formatMoney(amount, forceCfa); },

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
                        <button class="amt-btn amt-btn-primary" onclick="app.renderPage(sessionStorage.getItem('shippingMode') === 'aerien' ? 'invoice-aerien' : 'invoice-new')">
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
                                    <th class="col--amount th-sort" onclick="window.app.views.toutesLesFactures.sortBy('amount')" style="text-align: right;">Reste à payer <span class="th-sort__icon"></span></th>
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
                    <div id="invoicesPagination" style="display:flex; justify-content:center; align-items:center; gap:12px; padding:14px 0; flex-wrap:wrap;"></div>
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
            // Index des livraisons par référence : sert à calculer le magasinage
            // (date d'entrepôt + quantité) côté facture, sans requête par ligne.
            this.livByRef = new Map();

            livSnap.forEach(doc => {
                const data = doc.data();
                if (data.ref) this.livByRef.set(String(data.ref).toUpperCase().trim(), {
                    dateAjout: data.dateAjout,
                    quantite: data.quantite,
                    quantiteRestante: data.quantiteRestante,
                    status: data.status,
                    containerStatus: data.containerStatus,
                    description: data.description
                });
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
            // Les livraisons sont chargées : on rafraîchit pour afficher les
            // badges « magasinage » sur les lignes concernées.
            this.applyFilters();
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
        const rawSearch = (document.getElementById('searchInput')?.value || '').trim();
        // Recherche TOLÉRANTE : insensible à la casse ET aux accents.
        const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        const searchTerm = norm(rawSearch);
        // Téléphone : on compare uniquement les chiffres (espaces/points/indicatifs ignorés).
        const searchDigits = rawSearch.replace(/\D/g, '');
        const status = document.getElementById('statusFilter')?.value || '';
        const container = document.getElementById('containerFilter')?.value || '';
        const dateFrom = document.getElementById('dateFrom')?.value;
        const dateTo = document.getElementById('dateTo')?.value;

        let filtered = [...this.invoices];

        // Filtre MODE D'EXPÉDITION (source unique : shipping-mode.js).
        // La liste suit le bouton 🚢/✈️ actif ; ancien sans champ = maritime.
        filtered = filterByShippingMode(filtered);

        if (searchTerm) {
            filtered = filtered.filter(inv => {
                // Texte : référence + nom expéditeur + nom destinataire (insensible casse/accents).
                const haystack = norm(`${inv.reference || ''} ${inv.nom || ''} ${inv.nomDestinataire || ''}`);
                if (haystack.includes(searchTerm)) return true;
                // Téléphone : chiffre-à-chiffre sur exp. ET destinataire.
                if (searchDigits.length >= 3) {
                    const phones = `${inv.tel || ''} ${inv.numero || ''}`.replace(/\D/g, '');
                    if (phones.includes(searchDigits)) return true;
                }
                return false;
            });
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
        this.currentPage = 1; // tout filtre/tri ramène à la 1re page
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
            const emptyPag = document.getElementById('invoicesPagination');
            if (emptyPag) emptyPag.innerHTML = '';
            return;
        }

        const isEur = isEurAgency();
        const TAUX = isEur ? CONSTANTS.TAUX_CONVERSION : 1;

        // Colonne Téléphone : au DÉPART on montre le numéro de l'expéditeur
        // (inv.tel), à l'ARRIVÉE celui du destinataire (inv.numero) car c'est
        // lui que l'agence d'arrivée contacte pour la livraison.
        const _activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
        const isArrivalView = _activeAgency === 'all'
            || (AGENCIES[_activeAgency] && AGENCIES[_activeAgency].type === 'arrival');

        // Droit de supprimer une facture : aucune restriction historique, donc
        // les rôles intégrés gardent l'accès ; un rôle personnalisé doit avoir
        // la permission "delete_invoice" cochée dans Rôles & Menus.
        const canDel = window.app.isBuiltinRole() || window.app.hasPermission('delete_invoice');
        const delBtnTable = canDel ? `<button class="icon-btn btn--del" onclick="window.app.views.toutesLesFactures.deleteInvoice('__ID__')" title="Supprimer">🗑️</button>` : '';

        // Pagination AFFICHAGE : on ne DESSINE que la page courante (50 lignes)
        // pour éviter la lenteur quand il y a des centaines/milliers de factures.
        // Les totaux et la recherche, eux, restent calculés sur TOUTE la liste.
        const PAGE_SIZE = 50;
        const totalPages = Math.max(1, Math.ceil(this.filteredInvoices.length / PAGE_SIZE));
        if (!this.currentPage || this.currentPage < 1) this.currentPage = 1;
        if (this.currentPage > totalPages) this.currentPage = totalPages;
        const _pStart = (this.currentPage - 1) * PAGE_SIZE;
        const _pageInvoices = this.filteredInvoices.slice(_pStart, _pStart + PAGE_SIZE);

        // On construit en un seul passage les lignes du tableau (ordinateur)
        // ET les fiches compactes (mobile, modèle validé : 3 lignes + actions).
        const rows = [];
        const cards = [];
        _pageInvoices.forEach(inv => {
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
            let destPhone = inv.numero || extractPhone(inv.nomDestinataire);
            const parrainName = this.getParrainNameForPhone(destPhone);
            const parrainBadge = parrainName
                ? `<div style="margin-top:4px; display:inline-flex; align-items:center; gap:5px; background:#fff7ed; color:#9a3412; padding:2px 8px; border-radius:10px; font-size:11px; font-weight:600;"><i class="fas fa-handshake" style="font-size:10px;"></i> Parrain : ${parrainName}</div>`
                : '';
            const frBadge = inv.agency === 'paris' && !isEur ? '<span title="Créé à Paris" style="font-size:10px; background:#e0f2fe; padding:2px 5px; border-radius:4px; margin-left:4px; color:#0369a1; font-weight:800;">FR</span>' : '';
            // Indice "magasinage à payer" : colis encore en entrepôt avec des frais
            // pas encore facturés (pas d'augmentation déjà appliquée).
            const livForMag = this.livByRef ? this.livByRef.get(String(inv.reference || '').toUpperCase().trim()) : null;
            const magForRow = this.calculateStorageFeeForInvoice(inv, livForMag);
            const magBadge = (magForRow.fee > 0 && inv.adjustmentType !== 'augmentation')
                ? `<span title="Frais de magasinage à payer (${magForRow.days} j)" style="display:inline-flex; align-items:center; gap:3px; background:#fff7ed; color:#c2410c; border:1px solid #fdba74; padding:1px 6px; border-radius:8px; font-size:10px; font-weight:800; margin-left:4px; white-space:nowrap;">📦 ${this.formatMoneyLocal(magForRow.fee / TAUX)}</span>`
                : '';
            const dateStr = inv.date ? new Date(inv.date).toLocaleDateString('fr-FR') : '-';

            rows.push(`
                <tr data-invoice-id="${inv.id}">
                    <td data-label="Statut"><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td data-label="Référence" style="font-weight: 900;">
                        <button class="amount-link" onclick="window.app.views.toutesLesFactures.viewInvoice('${inv.id}')">${inv.reference || '-'}</button>
                        ${frBadge}${magBadge}
                    </td>
                    <td data-label="Date">${dateStr}</td>
                    <td data-label="Client"><strong>${inv.nom || '-'}</strong></td>
                    <td data-label="Adresse"><span class="tooltip" title="${address.replace(/"/g, '&quot;')}">${shortAddress}</span></td>
                    <td data-label="Téléphone">${(isArrivalView ? (inv.numero || inv.tel) : (inv.tel || inv.numero)) || '-'}</td>
                    <td data-label="Destinataire">${inv.nomDestinataire || '-'}${parrainBadge}</td>
                    <td data-label="Reste à payer" class="cell--amount"><button class="amount-link" onclick="window.app.views.toutesLesFactures.quickPay('${inv.id}')">${this.formatMoneyLocal(resteDisplay)}</button></td>
                    <td data-label="Nb colis" style="text-align: right; font-weight: bold;">${nbColis}</td>
                    <td data-label="Actions" style="text-align: right;">
                        <div class="row-actions">
                            <button class="icon-btn btn--edit" onclick="window.app.views.toutesLesFactures.editInvoice('${inv.id}')" title="Modifier">✏️</button>
                            <button class="icon-btn btn--reuse" onclick="window.app.views.toutesLesFactures.reuseInvoice('${inv.id}')" title="Réutiliser">📋</button>
                            ${delBtnTable.replace('__ID__', inv.id)}
                        </div>
                    </td>
                </tr>
            `);

            cards.push(`
                <div class="comm-mob-card" data-invoice-id="${inv.id}">
                    <div class="comm-mob-l1">
                        <button class="amount-link" style="font-weight:900;" onclick="window.app.views.toutesLesFactures.viewInvoice('${inv.id}')">${inv.reference || '-'}</button>${frBadge}${magBadge}
                        <span class="status-badge ${statusClass}">${statusText}</span>
                    </div>
                    <div class="comm-mob-l1">
                        <strong>${inv.nom || '-'}</strong>
                        <button class="amount-link" style="font-weight:800;" onclick="window.app.views.toutesLesFactures.quickPay('${inv.id}')">${this.formatMoneyLocal(resteDisplay)}</button>
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
                        ${delBtnTable.replace('__ID__', inv.id)}
                    </div>
                </div>
            `);
        });

        tbody.innerHTML = rows.join('');
        const cardsEl = document.getElementById('invoicesCards');
        if (cardsEl) cardsEl.innerHTML = cards.join('');
        this.renderInvoicesPagination(totalPages);
    },

    // Boutons « Précédent / Suivant » + indicateur « Page X / Y ». Masqués s'il
    // n'y a qu'une seule page.
    renderInvoicesPagination(totalPages) {
        const el = document.getElementById('invoicesPagination');
        if (!el) return;
        if (!totalPages || totalPages <= 1) { el.innerHTML = ''; return; }
        const p = this.currentPage;
        const btn = (label, target, disabled) =>
            `<button onclick="window.app.views.toutesLesFactures.goToInvoicePage(${target})" ${disabled ? 'disabled' : ''} style="padding:8px 14px; border:1px solid #cbd5e1; border-radius:8px; background:${disabled ? '#f1f5f9' : '#fff'}; color:${disabled ? '#94a3b8' : '#1e293b'}; cursor:${disabled ? 'default' : 'pointer'}; font-weight:600;">${label}</button>`;
        el.innerHTML = `${btn('‹ Précédent', p - 1, p <= 1)}<span style="font-weight:600; color:#475569;">Page ${p} / ${totalPages}</span>${btn('Suivant ›', p + 1, p >= totalPages)}`;
    },

    goToInvoicePage(page) {
        this.currentPage = page;
        this.renderTable();
        const t = document.querySelector('.factures-table') || document.getElementById('invoicesCards');
        if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
        // Frais de magasinage (FCFA -> devise d'affichage) : affichés dans le
        // Bilan et inclus dans le reste à payer (cohérent avec la facture PDF).
        // Calcul basé sur la date d'entrepôt de la livraison liée (comme Livraison).
        const storage = this.calculateStorageFeeForInvoice(invoice, this.pickLivraisonForStorage(livraisons));
        const storageFeeDisplay = (storage.fee || 0) / TAUX;
        const resteTotal = reste + storageFeeDisplay;

        let statusText = reste <= 0 ? 'Payée' : (paye > 0 ? 'Acompte' : 'Impayée');
        let statusBg = reste <= 0 ? '#dcfce7' : (paye > 0 ? '#fef3c7' : '#fee2e2');
        let statusColor = reste <= 0 ? '#166534' : (paye > 0 ? '#92400e' : '#991b1b');

        let destName = stripPhoneFromName(invoice.nomDestinataire || '');
        let destPhone = invoice.numero || invoice.tel || extractPhone(invoice.nomDestinataire) || 'Non renseigné';

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

                // 2. Vérification individuelle via l'historique des scans.
                //    PRINCIPE : tout se suit PAR PIÈCE (sous-colis). Le dernier
                //    scan d'une pièce détermine son statut réel. Les étapes
                //    d'ARRIVÉE (déchargement, mise en livraison, remise) sont
                //    « résolues » par pièce et ne doivent pas être écrasées par le
                //    statut global du dossier.
                let pieceResolved = false;
                if (liv.scanHistory && Array.isArray(liv.scanHistory)) {
                    const myScans = liv.scanHistory.filter(s => s.scanRef === lbl);
                    myScans.sort((a, b) => new Date(b.date) - new Date(a.date)); // Du plus récent au plus ancien

                    if (myScans.length > 0) {
                        const lastScan = myScans[0];
                        if (lastScan.type === 'REMISE_CLIENT') {
                            lblStatusDisplay = 'Livré au destinataire';
                            lblStatusClass = 'colis-delivered';
                            pieceResolved = true;
                        } else if (lastScan.type === 'MISE_EN_LIVRAISON') {
                            lblStatusDisplay = 'En livraison';
                            lblStatusClass = 'colis-abidjan';
                            pieceResolved = true;
                        } else if (lastScan.type === 'DECHARGEMENT_ABIDJAN') {
                            lblStatusDisplay = 'Arrivé à Abidjan';
                            lblStatusClass = 'colis-abidjan';
                            lblContainer = lastScan.container || liv.conteneur || '-';
                            pieceResolved = true;
                        } else if (lastScan.type === 'ENTREPOT_PARIS' || lastScan.type === 'DEPART_VOL_RETOUR') {
                            lblStatusDisplay = 'Mise en Entrepôt';
                            lblStatusClass = 'colis-paris';
                            if (liv.modeExpedition === 'aerien') pieceResolved = true; // pièce restée
                        } else if (lastScan.type === 'DEPART_VOL') {
                            lblStatusDisplay = 'En vol (Aérien)';
                            lblStatusClass = 'colis-transit';
                            pieceResolved = true; // pièce partie
                        } else if (lastScan.type === 'CONTENEUR_CHARGEMENT') {
                            lblStatusDisplay = 'Chargé (Conteneur)';
                            lblStatusClass = 'colis-transit';
                            lblContainer = lastScan.container || liv.conteneur || '-';
                        }
                    }
                }

                // 3. Surcharges globales (statut du dossier) — appliquées
                //    UNIQUEMENT aux pièces non encore résolues par leur propre
                //    scan. Ainsi une pièce non déchargée n'est jamais marquée
                //    « Arrivé » à tort parce qu'une autre pièce du dossier l'est.
                if (liv.containerStatus === 'A_VENIR' && !pieceResolved) {
                    if (liv.modeExpedition === 'aerien') {
                        lblStatusDisplay = 'En vol (Aérien)';
                    } else if (lblStatusClass === 'colis-transit') {
                        lblStatusDisplay = 'En Transit (Mer)';
                    } else {
                        lblStatusDisplay = 'Assigné (Conteneur)';
                    }
                    lblStatusClass = 'colis-transit';
                    lblContainer = liv.conteneur || lblContainer;
                } else if (liv.containerStatus === 'EN_COURS' && !pieceResolved && lblStatusClass === 'colis-pending') {
                    // Repli : seules les pièces SANS aucun scan suivent le statut
                    // global « arrivé » (anciennes données / validation en masse).
                    lblStatusDisplay = 'Arrivé à Abidjan';
                    lblStatusClass = 'colis-abidjan';
                    lblContainer = liv.conteneur || lblContainer;
                }
                if (liv.status === 'LIVRE' && !pieceResolved) {
                    lblStatusDisplay = 'Livré au destinataire';
                    lblStatusClass = 'colis-delivered';
                    lblContainer = liv.conteneur || lblContainer;
                }

                // Dates départ/arrivée stockées au niveau du DOSSIER, mais le
                // suivi est PAR PIÈCE : une pièce restée en entrepôt (ou non
                // scannée) ne doit PAS afficher les dates du vol/bateau — seules
                // les pièces réellement parties / arrivées / livrées les portent.
                const lblShowDates = (lblStatusClass !== 'colis-paris' && lblStatusClass !== 'colis-pending');

                trackingRows += `
                    <tr>
                        <td style="font-weight: 900; font-family: monospace;"><a href="#" onclick="event.preventDefault(); window.app.views.toutesLesFactures.showSubPackageHistory('${liv.id}', '${lbl}');" style="color: #3b82f6; text-decoration: underline;" title="Voir l'historique des scans">${lbl}</a></td>
                        <td class="modal-table__desc">${specificDesc}</td>
                        <td><span class="status-badge ${lblStatusClass}">${lblStatusDisplay}</span></td>
                        <td><span style="background:#f1f5f9; padding:4px 8px; border-radius:6px; font-weight:600;">${lblContainer}</span></td>
                        <td>${lblShowDates && liv.departureDate ? new Date(liv.departureDate).toLocaleDateString('fr-FR') : '-'}</td>
                        <td>${lblShowDates && liv.arrivalDate ? new Date(liv.arrivalDate).toLocaleDateString('fr-FR') : '-'}</td>
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

        // Transformation de la description en lignes pour le tableau.
        // AÉRIEN : modèle propre (mode par colis, poids/volume, parfum/alcool).
        const isAerienInv = invoice.modeExpedition === 'aerien';
        const A_STD = 13, A_PARFUM = 15; // €/kg
        const aBilledKg = (it) => {
            // Colis facture « A la valeur » : on masque le poids sur la facture
            // client (evite la confusion entre poids note et tarification).
            if (it.mode !== 'poids') return 0;
            const real = parseFloat(it.poids) || 0;
            const vol = ((parseFloat(it.lng) || 0) * (parseFloat(it.lrg) || 0) * (parseFloat(it.haut) || 0)) / 5000;
            return Math.max(real, vol);
        };
        const aLineEur = (it) => {
            const qty = parseFloat(it.qty) || 0;
            if (it.mode === 'poids') return aBilledKg(it) * qty * (it.parfum ? A_PARFUM : A_STD);
            return (parseFloat(it.pu) || 0) * qty;
        };
        const aMoney = (eur) => this.formatMoneyLocal(isEur ? eur : eur * TAUX);

        let itemsList = '';
        let descTableHead = '<tr><th>Description</th><th style="text-align:right;">Quantité</th><th style="text-align:right;">Prix unitaire</th><th style="text-align:right;">Prix total</th></tr>';

        if (isAerienInv && invoice.items && Array.isArray(invoice.items)) {
            descTableHead = '<tr><th>Description</th><th style="text-align:right;">Qté</th><th>Mode</th><th style="text-align:right;">Poids</th><th style="text-align:right;">Tarif / P.U</th><th style="text-align:right;">Total</th></tr>';
            let totalPoids = 0;
            itemsList = invoice.items.map(item => {
                const isPoids = item.mode === 'poids';
                const kg = aBilledKg(item);
                totalPoids += kg * (parseFloat(item.qty) || 0);
                const modeLbl = isPoids ? ('Poids/volume' + (item.parfum ? ' · parfum/alcool' : '')) : 'À la valeur';
                const tarifLbl = isPoids ? ((item.parfum ? A_PARFUM : A_STD) + ' €/kg') : aMoney(parseFloat(item.pu) || 0);
                return `<tr>
                    <td class="modal-table__desc">${item.desc || '-'}</td>
                    <td style="text-align:right; font-weight:bold;">${item.qty}</td>
                    <td>${modeLbl}</td>
                    <td style="text-align:right;">${kg ? kg.toFixed(1) + ' kg' : '-'}</td>
                    <td style="text-align:right;">${tarifLbl}</td>
                    <td style="text-align:right; font-weight:900; color:#0f172a;">${aMoney(aLineEur(item))}</td>
                </tr>`;
            }).join('');
            itemsList += `<tr style="background:#f8fafc; font-weight:800;"><td colspan="3" style="text-align:right;">Poids total facturé</td><td style="text-align:right; color:#1e40af;">${totalPoids.toFixed(1)} kg</td><td colspan="2"></td></tr>`;
        } else if (invoice.items && Array.isArray(invoice.items)) {
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
                                ${storageFeeDisplay > 0 ? `
                                <div class="bilan-pill" style="background:#fff7ed; border-color:#fdba74;">
                                    <div class="bilan-pill__label">FRAIS MAGASINAGE (${storage.days} j)</div>
                                    <div class="bilan-pill__value" style="color:#c2410c;">${this.formatMoneyLocal(storageFeeDisplay)}</div>
                                </div>` : ''}
                                <div class="bilan-pill bilan-pill--remaining">
                                    <div class="bilan-pill__label">RESTE À PAYER</div>
                                    <div class="bilan-pill__value">${this.formatMoneyLocal(resteTotal)}</div>
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
                                    ${(window.app.isBuiltinRole() || window.app.hasPermission('delete_invoice')) ? `<button class="amt-btn amt-btn-danger" onclick="window.app.views.toutesLesFactures.deleteInvoice('${invoice.id}')"><i class="fas fa-trash"></i> Supprimer</button>` : ''}
                                </div>
                            </div>
                        </div>

                        <!-- DESCRIPTION -->
                        <div class="detail-card">
                            <div class="detail-card__header"><h3 class="detail-card__title">Description facture</h3></div>
                            <div class="modal-table-wrap">
                                <table class="modal-table">
                                    <thead>${descTableHead}</thead>
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

    // Encaissement EXPRESS : petit formulaire pour le cas courant (le client
    // paie le reste, en espèces). Montant pré-rempli avec le reste à payer,
    // un seul mode, un bouton. Les cas complexes (split Paris/Abidjan,
    // ajustement, historique) passent par "Détails" -> addPayment().
    quickPay(id) {
        const inv = this.invoices.find(i => i.id === id);
        if (!inv) return;
        const isEur = isEurAgency();
        const TAUX = isEur ? CONSTANTS.TAUX_CONVERSION : 1;
        const resteDisplay = Math.max(0, Math.abs(parseFloat(inv.reste) || 0) / TAUX);
        // Magasinage du colis lié (date d'entrepôt + quantité). On ne l'ajoute
        // automatiquement que si la facture n'a PAS déjà un ajustement saisi à
        // la main (la facture n'a qu'un seul emplacement d'ajustement).
        const liv = this.livByRef ? this.livByRef.get(String(inv.reference || '').toUpperCase().trim()) : null;
        const mag = this.calculateStorageFeeForInvoice(inv, liv);
        const applyMag = mag.fee > 0 && !inv.adjustmentType;
        const magDisplay = mag.fee / TAUX;
        const totalDisplay = resteDisplay + (applyMag ? magDisplay : 0);
        const totalVal = isEur ? totalDisplay.toFixed(2) : Math.round(totalDisplay);
        // Champs cachés d'ajustement transmis à savePaymentsToFirestore :
        // si magasinage -> on le verrouille en "augmentation" ; sinon on
        // conserve l'ajustement existant de la facture.
        const adjTypeVal = applyMag ? 'augmentation' : (inv.adjustmentType || '');
        const adjValVal = applyMag
            ? (isEur ? magDisplay.toFixed(2) : Math.round(magDisplay))
            : (inv.adjustmentVal ? (isEur ? (inv.adjustmentVal / TAUX).toFixed(2) : inv.adjustmentVal) : '');
        const recapHtml = applyMag
            ? `<div style="font-size:13px; color:#64748b; margin-top:4px; line-height:1.7;">Reste fret : <strong style="color:#0f172a;">${this.formatMoneyLocal(resteDisplay)}</strong><br>Magasinage (${mag.days} j) : <strong style="color:#c2410c;">${this.formatMoneyLocal(magDisplay)}</strong><br>Total à encaisser : <strong style="color:#0f172a;">${this.formatMoneyLocal(totalDisplay)}</strong></div>`
            : `<div style="font-size:13px; color:#64748b; margin-top:2px;">Reste à payer : <strong style="color:#0f172a;">${this.formatMoneyLocal(resteDisplay)}</strong></div>`;
        const cur = isEur ? '€' : 'CFA';
        const modeOptions = `
            <option value="ESPECES">ESPÈCES</option>
            ${isEur ? '<option value="CB">CARTE BANCAIRE</option><option value="BON D ENVOI">BON D\'ENVOI</option>' : '<option value="WAVE">WAVE</option><option value="ORANGE MONEY">ORANGE MONEY</option>'}
            <option value="CHEQUES">CHÈQUE</option>
            <option value="VIREMENTS">VIREMENT</option>`;

        const html = `
        <div class="modal active" style="z-index: 10000; position: fixed; inset: 0; background: rgba(15,23,42,0.6); display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px);">
            <div style="background:#fff; border-radius:16px; width:380px; max-width:94%; overflow:hidden; box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);">
                <div style="padding:18px 22px; border-bottom:1px solid #e2e8f0; background:#f8fafc;">
                    <div style="font-size:12px; color:#64748b; font-weight:800; text-transform:uppercase;">Facture ${inv.reference}</div>
                    <div style="font-size:17px; font-weight:900; color:#0f172a;">Encaisser</div>
                    ${recapHtml}
                </div>
                <div style="padding:20px 22px;">
                    <!-- Champs cachés transmis à l'enregistrement (ajustement) -->
                    <input type="hidden" id="tlfPayGlobalAdjType" value="${adjTypeVal}">
                    <input type="hidden" id="tlfPayGlobalAdjVal" value="${adjValVal}">
                    <div class="form-group" style="margin-bottom:14px;">
                        <label style="font-size:12px; font-weight:800; color:#475569; margin-bottom:6px; display:block;">Montant (${cur})</label>
                        <input type="number" id="tlfQuickAmount" step="${isEur ? '0.01' : '1'}" value="${totalVal}" style="width:100%; padding:12px; border-radius:8px; border:1px solid #cbd5e1; font-weight:900; font-size:18px; outline:none; box-sizing:border-box;">
                    </div>
                    <div class="form-group">
                        <label style="font-size:12px; font-weight:800; color:#475569; margin-bottom:6px; display:block;">Mode de paiement</label>
                        <select id="tlfQuickMode" style="width:100%; padding:12px; border-radius:8px; border:1px solid #cbd5e1; font-weight:600; outline:none; box-sizing:border-box;">${modeOptions}</select>
                    </div>
                </div>
                <div style="padding:16px 22px; border-top:1px solid #e2e8f0; background:#f8fafc; display:flex; align-items:center; justify-content:space-between; gap:10px;">
                    <button onclick="window.app.views.toutesLesFactures.addPayment('${inv.id}')" style="background:none; border:none; color:#3b82f6; font-weight:700; cursor:pointer; font-size:13px;">Détails…</button>
                    <div style="display:flex; gap:8px;">
                        <button class="btn btn-outline" onclick="this.closest('.modal').remove()" style="padding:10px 14px; background:#fff; color:#334155; border:1px solid #cbd5e1; border-radius:8px; font-weight:600;">Annuler</button>
                        <button class="btn btn-primary" onclick="window.app.views.toutesLesFactures.confirmQuickPay('${inv.id}')" style="padding:10px 18px; background:#10b981; color:#fff; border:none; border-radius:8px; font-weight:700;"><i class="fas fa-check"></i> Encaisser</button>
                    </div>
                </div>
            </div>
        </div>`;
        document.getElementById('tlfModalsContainer').innerHTML = html;
        setTimeout(() => { const f = document.getElementById('tlfQuickAmount'); if (f) { f.focus(); f.select(); } }, 50);
    },

    async confirmQuickPay(id) {
        const inv = this.invoices.find(i => i.id === id);
        if (!inv) return;
        const isEur = isEurAgency();
        const TAUX = isEur ? CONSTANTS.TAUX_CONVERSION : 1;
        const amountInput = parseFloat(document.getElementById('tlfQuickAmount').value) || 0;
        if (amountInput <= 0) { this.app.showToast("Veuillez saisir un montant.", "error"); return; }
        const mode = document.getElementById('tlfQuickMode').value;
        const amountCfa = isEur ? Math.round(amountInput * TAUX) : amountInput;
        // Le "panier" (caisse) dépend du TYPE d'agence active, pas de la devise :
        // agence d'arrivée -> caisse Abidjan ; agence de départ -> caisse Paris.
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
        const isArrival = !!(AGENCIES[activeAgency] && AGENCIES[activeAgency].type === 'arrival');

        this.currentPaymentInvoice = JSON.parse(JSON.stringify(inv));
        if (!this.currentPaymentInvoice.paymentHistory) this.currentPaymentInvoice.paymentHistory = [];
        this.currentPaymentInvoice.paymentHistory.push({
            date: new Date().toISOString().split('T')[0],
            montantParis: isArrival ? 0 : amountCfa,
            montantAbidjan: isArrival ? amountCfa : 0,
            modePaiement: mode,
            agentMobileMoney: '',
            agent: '',
            saisiPar: sessionStorage.getItem('userName') || 'Agent',
            isNew: true
        });
        await this.savePaymentsToFirestore(id);
    },

    async addPayment(id) {
        const inv = this.invoices.find(i => i.id === id);
        if (!inv) return;

        this.currentPaymentInvoice = JSON.parse(JSON.stringify(inv));
        if (!this.currentPaymentInvoice.paymentHistory) this.currentPaymentInvoice.paymentHistory = [];

        const isEur = isEurAgency();
        const TAUX = isEur ? CONSTANTS.TAUX_CONVERSION : 1;

        // Magasinage en attente : si la facture n'a pas déjà un ajustement, on
        // pré-remplit l'ajustement global avec le magasinage (comme l'encaissement
        // express), pour qu'il reste VISIBLE et facturé aussi dans ce détail.
        const _liv = this.livByRef ? this.livByRef.get(String(inv.reference || '').toUpperCase().trim()) : null;
        const _mag = this.calculateStorageFeeForInvoice(inv, _liv);
        const _applyMag = _mag.fee > 0 && !inv.adjustmentType;
        const adjTypeSel = _applyMag ? 'augmentation' : (inv.adjustmentType || '');
        const adjValDisplay = _applyMag
            ? (isEur ? (_mag.fee / TAUX).toFixed(2) : Math.round(_mag.fee))
            : (inv.adjustmentVal ? (isEur ? (inv.adjustmentVal / TAUX).toFixed(2) : inv.adjustmentVal) : '');

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
                                <option value="reduction" ${adjTypeSel === 'reduction' ? 'selected' : ''}>Réduction ⬇️</option>
                                <option value="augmentation" ${adjTypeSel === 'augmentation' ? 'selected' : ''}>Augmentation ⬆️ ${_applyMag ? '(magasinage)' : ''}</option>
                            </select>
                            <input type="number" id="tlfPayGlobalAdjVal" step="${isEur ? '0.01' : '1'}" value="${adjValDisplay}" placeholder="Valeur (${isEur ? '€' : 'CFA'})" style="flex:1; padding: 10px; border-radius: 8px; border: 1px solid #cbd5e1; font-weight: 900; outline: none;" oninput="window.app.views.toutesLesFactures.renderLocalPaymentsTable()">
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
                    <p style="margin-top:8px; font-size:11.5px; color:#64748b;">Remplissez le montant ci-dessus puis cliquez sur <b>Enregistrer</b> en bas : le paiement est pris en compte automatiquement.</p>
                </div>

                <div style="padding: 20px 25px; border-top: 1px solid #e2e8f0; background: #f8fafc; display: flex; justify-content: flex-end; gap: 10px;">
                    <button class="btn btn-outline" onclick="this.closest('.modal').remove()" style="padding: 10px 15px; font-weight: 600; background: white; color:#334155; border: 1px solid #cbd5e1; border-radius: 8px;">Annuler</button>
                    <button class="btn btn-primary" onclick="window.app.views.toutesLesFactures.savePaymentsToFirestore('${inv.id}')" style="padding: 10px 20px; font-weight: 600; background: #10b981; color: white; border: none; border-radius: 8px;">
                        <i class="fas fa-save"></i> Enregistrer le paiement
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

        // Pré-remplissage du reste dans le BON champ selon le TYPE d'agence
        // active : agence d'arrivée -> Montant Abidjan ; agence de départ ->
        // Montant Paris. (Avant : toujours dans Montant Paris, même à l'arrivée.)
        if (document.getElementById('tlfPayIndex')?.value === '') {
            const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
            const isArrival = !!(AGENCIES[activeAgency] && AGENCIES[activeAgency].type === 'arrival');
            const parisEl = document.getElementById('tlfPayAmountParis');
            const abidjanEl = document.getElementById('tlfPayAmountAbidjan');
            if (isArrival) {
                if (abidjanEl) abidjanEl.value = resteCfa > 0 ? Math.round(resteCfa) : '';
                if (parisEl) parisEl.value = '';
            } else {
                const dr = resteCfa > 0 ? (resteCfa / TAUX) : '';
                if (parisEl) parisEl.value = isEur ? (dr ? dr.toFixed(2) : '') : (dr === '' ? '' : Math.round(dr));
                if (abidjanEl) abidjanEl.value = '';
            }
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
        
        document.getElementById('tlfPaymentFormTitle').textContent = "Modifier le paiement (puis cliquez Enregistrer)";
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
    },

    async savePaymentsToFirestore(id) {
        const inv = this.invoices.find(i => i.id === id);
        if (!inv) return;

        // Plus de bouton « Ajouter à la liste » : si un montant est saisi dans le
        // formulaire mais pas encore ajouté, on le prend en compte ICI
        // automatiquement (remplir le formulaire + Enregistrer suffit).
        const pendingParis = parseFloat(document.getElementById('tlfPayAmountParis')?.value) || 0;
        const pendingAbidjan = parseFloat(document.getElementById('tlfPayAmountAbidjan')?.value) || 0;
        if (pendingParis > 0 || pendingAbidjan > 0) {
            this.addOrUpdateLocalPayment();
        }

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
        // Detection facture aerien : si oui, on bascule la grille des articles
        // sur la meme grille que « Facture Aerien - Paris » (mode valeur/poids,
        // dimensions, parfum/alcool, poids volume).
        this.isEditAerien = (inv.modeExpedition === 'aerien');
        this.editItems = inv.items && Array.isArray(inv.items) && inv.items.length > 0
            ? JSON.parse(JSON.stringify(inv.items))
            : [{ id: Date.now(), desc: inv.description || '', qty: 1, pu: total * (isEur ? 1 : TAUX), total: total * (isEur ? 1 : TAUX), vol: inv.volumeCBM || 0 }];

        // Pour les factures aerien : on garantit la presence des champs
        // (mode, poids, dimensions, parfum) pour les anciennes factures qui
        // n'avaient que { desc, qty, pu, total }.
        if (this.isEditAerien) {
            this.editItems.forEach(it => {
                if (typeof it.mode !== 'string') it.mode = (it.pu ? 'valeur' : 'poids');
                if (it.poids == null) it.poids = '';
                if (it.lng == null) it.lng = '';
                if (it.lrg == null) it.lrg = '';
                if (it.haut == null) it.haut = '';
                if (typeof it.parfum !== 'boolean') it.parfum = false;
                if (it.pu == null) it.pu = '';
            });
        }

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
                                    <label style="font-size: 12px; font-weight: 700; color: #475569; display: block; margin-bottom: 6px;">Téléphone</label>
                                    <input type="text" id="tlfEditExpTel" value="${inv.tel || ''}" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; outline: none; font-weight: 600; box-sizing: border-box;">
                                </div>
                                <div>
                                    <label style="font-size: 12px; font-weight: 700; color: #475569; display: block; margin-bottom: 6px;">Lieu / Adresse</label>
                                    <input type="text" id="tlfEditExpAdresse" value="${inv.adresseExpediteur || ''}" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; outline: none; font-weight: 600; box-sizing: border-box;">
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
            // Même logique que le destinataire : numéro inchangé = correction de nom.
            const enteredTail = phoneTail(document.getElementById('tlfEditExpTel')?.value || '');
            const origTail = this.currentEditInvoice ? (phoneTail(this.currentEditInvoice.tel || '') || this.currentEditInvoice.expPhoneTail || '') : '';
            if (enteredTail && enteredTail === origTail) {
                if (feedbackExp) feedbackExp.innerHTML = `<span style="color:#059669;"><i class="fas fa-pen"></i> Correction de nom (même numéro) — sera mise à jour partout</span>`;
            } else if (feedbackExp) {
                feedbackExp.innerHTML = `<span style="color:#f59e0b;"><i class="fas fa-exclamation-triangle"></i> Nouveau client expéditeur</span>`;
            }
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
            // Reconnaissance par TÉLÉPHONE (ancre stable) : si le numéro saisi est
            // celui du destinataire D'ORIGINE de cette facture, c'est une simple
            // CORRECTION DE NOM (même personne) -> sera répercutée partout, pas un
            // nouveau destinataire.
            const enteredTail = phoneTail(document.getElementById('tlfEditTel')?.value || '');
            const origTail = this.currentEditInvoice ? (phoneTail(this.currentEditInvoice.numero || '') || this.currentEditInvoice.destPhoneTail || '') : '';
            if (enteredTail && enteredTail === origTail) {
                if (feedbackDest) feedbackDest.innerHTML = `<span style="color:#059669;"><i class="fas fa-pen"></i> Correction de nom (même numéro) — sera mise à jour partout</span>`;
            } else if (feedbackDest) {
                feedbackDest.innerHTML = `<span style="color:#f59e0b;"><i class="fas fa-exclamation-triangle"></i> Nouveau destinataire</span>`;
            }
        }
    },

    renderEditItems() {
        const container = document.getElementById('tlfEditItemsContainer');
        if (!container) return;

        const isEur = isEurAgency();
        const deviseStr = isEur ? '€' : 'CFA';
        const stepStr = isEur ? '0.01' : '1';

        if (this.isEditAerien) {
            container.innerHTML = this.editItems.map((item) => {
                const billedKg = this._lineBilledKgEdit(item);
                const showVolHint = item.mode === 'poids' && billedKg > (parseFloat(item.poids) || 0);
                return `
                <div class="form-grid" style="display: grid; grid-template-columns: 2fr 0.5fr 1.6fr 1fr auto; gap: 10px; align-items: start; background: #f8fafc; padding: 12px; border-radius: 8px; margin-bottom: 10px; border: 1px solid #e2e8f0;">
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
                        <label style="font-size: 11px; font-weight: 600; color: #475569; display: block; margin-bottom: 4px;">Mode / Tarif *</label>
                        <select class="edit-item-mode" data-id="${item.id}" style="width: 100%; padding: 7px; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box; font-size: 12px; background: #fff; margin-bottom: 4px;">
                            <option value="valeur" ${item.mode === 'valeur' ? 'selected' : ''}>À la valeur</option>
                            <option value="poids" ${item.mode === 'poids' ? 'selected' : ''}>Poids / volume</option>
                        </select>
                        ${item.mode === 'valeur' ? `
                        <input type="number" class="edit-item-pu" data-id="${item.id}" value="${item.pu}" min="0" step="0.01" placeholder="Prix € (P.U)" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box; text-align: right; outline: none; margin-bottom: 4px;">
                        ` : ''}
                        <input type="number" class="edit-item-poids" data-id="${item.id}" value="${item.poids}" min="0" step="0.1" placeholder="Poids (kg)" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box; text-align: right; outline: none;">
                        ${item.mode === 'poids' ? `
                        <div style="display:flex; gap:4px; margin-top:4px;">
                            <input type="number" class="edit-item-lng" data-id="${item.id}" value="${item.lng}" min="0" placeholder="L" title="Longueur (cm)" style="width:33%; padding:6px; border:1px solid #cbd5e1; border-radius:6px; box-sizing:border-box; text-align:center; font-size:12px;">
                            <input type="number" class="edit-item-lrg" data-id="${item.id}" value="${item.lrg}" min="0" placeholder="l" title="Largeur (cm)" style="width:33%; padding:6px; border:1px solid #cbd5e1; border-radius:6px; box-sizing:border-box; text-align:center; font-size:12px;">
                            <input type="number" class="edit-item-haut" data-id="${item.id}" value="${item.haut}" min="0" placeholder="H" title="Hauteur (cm)" style="width:33%; padding:6px; border:1px solid #cbd5e1; border-radius:6px; box-sizing:border-box; text-align:center; font-size:12px;">
                        </div>
                        <label style="display:flex; align-items:center; gap:5px; margin-top:4px; font-size:11px; color:#475569; cursor:pointer;">
                            <input type="checkbox" class="edit-item-parfum" data-id="${item.id}" ${item.parfum ? 'checked' : ''} style="width:auto; margin:0;"> Parfum / Alcool (15 €/kg)
                        </label>
                        ${showVolHint ? `<div style="font-size:10px; color:#c2410c; margin-top:2px; text-align:right;">poids volume : ${billedKg.toFixed(1)} kg</div>` : ''}
                        ` : ''}
                    </div>
                    <div>
                        <label style="font-size: 11px; font-weight: 600; color: #475569; display: block; margin-bottom: 4px;">Total (€)</label>
                        <input type="text" value="${(item.total || 0).toFixed(2)} €" readonly style="width: 100%; padding: 8px; border: 1px solid #e2e8f0; border-radius: 6px; box-sizing: border-box; text-align: right; background: #e2e8f0; font-weight: bold; outline: none; color: #0f172a;">
                    </div>
                    <button class="btn btn-outline" onclick="window.app.views.toutesLesFactures.removeEditItemRow(${item.id})" style="padding: 8px 12px; border-color: #fecaca; color: #ef4444; background: white; border-radius: 6px; cursor: pointer; align-self: start; margin-top: 22px;" title="Supprimer" ${this.editItems.length <= 1 ? 'disabled' : ''}>
                        <i class="fas fa-trash"></i>
                    </button>
                </div>`;
            }).join('');

            document.querySelectorAll('.edit-item-desc').forEach(el => el.addEventListener('input', (e) => this.updateEditItem(e, 'desc')));
            document.querySelectorAll('.edit-item-qty').forEach(el => el.addEventListener('input', (e) => this.updateEditItem(e, 'qty')));
            document.querySelectorAll('.edit-item-mode').forEach(el => el.addEventListener('change', (e) => this.updateEditItem(e, 'mode')));
            document.querySelectorAll('.edit-item-pu').forEach(el => el.addEventListener('input', (e) => this.updateEditItem(e, 'pu')));
            document.querySelectorAll('.edit-item-poids').forEach(el => el.addEventListener('input', (e) => this.updateEditItem(e, 'poids')));
            document.querySelectorAll('.edit-item-lng').forEach(el => el.addEventListener('input', (e) => this.updateEditItem(e, 'lng')));
            document.querySelectorAll('.edit-item-lrg').forEach(el => el.addEventListener('input', (e) => this.updateEditItem(e, 'lrg')));
            document.querySelectorAll('.edit-item-haut').forEach(el => el.addEventListener('input', (e) => this.updateEditItem(e, 'haut')));
            document.querySelectorAll('.edit-item-parfum').forEach(el => el.addEventListener('change', (e) => this.updateEditItem(e, 'parfum')));
        } else {
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
        }
        
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

    // Helpers facture aerien (memes formules que depart/js/views/facture-aerien.js).
    _lineBilledKgEdit(item) {
        let kg = parseFloat(item.poids) || 0;
        const vol = ((parseFloat(item.lng) || 0) * (parseFloat(item.lrg) || 0) * (parseFloat(item.haut) || 0)) / 5000;
        if (vol > kg) kg = vol;
        return kg;
    },
    _lineTotalEurEdit(item) {
        const qty = parseFloat(item.qty) || 0;
        if (item.mode === 'poids') {
            const rate = item.parfum ? 15 : 13;
            return this._lineBilledKgEdit(item) * qty * rate;
        }
        return (parseFloat(item.pu) || 0) * qty;
    },

    addEditItemRow() {
        if (this.isEditAerien) {
            this.editItems.push({ id: Date.now(), desc: '', qty: 1, pu: '', total: 0, vol: 0, poids: '', mode: 'valeur', lng: '', lrg: '', haut: '', parfum: false });
        } else {
            this.editItems.push({ id: Date.now(), desc: '', qty: 1, pu: 0, total: 0, vol: 0 });
        }
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
        if (!item) return;

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

        // Aerien : champs supplementaires + ajout/retrait dynamique des inputs
        // (P.U apparait en mode 'valeur', dimensions en mode 'poids').
        if (this.isEditAerien) {
            if (field === 'mode') {
                item.mode = e.target.value;
                this.renderEditItems();
                this.calculateEditTotals();
                return;
            }
            if (field === 'poids') item.poids = parseFloat(e.target.value) || 0;
            if (field === 'lng') item.lng = parseFloat(e.target.value) || 0;
            if (field === 'lrg') item.lrg = parseFloat(e.target.value) || 0;
            if (field === 'haut') item.haut = parseFloat(e.target.value) || 0;
            if (field === 'parfum') item.parfum = !!e.target.checked;

            item.total = this._lineTotalEurEdit(item);

            const row = e.target.closest('.form-grid');
            if (row) {
                const totalInput = row.querySelector('input[readonly]');
                if (totalInput) totalInput.value = (item.total || 0).toFixed(2) + ' €';
                // Indicateur poids volume.
                const billed = this._lineBilledKgEdit(item);
                const showHint = item.mode === 'poids' && billed > (parseFloat(item.poids) || 0);
                let hintEl = row.querySelector('.tlf-aer-volhint');
                if (showHint) {
                    if (!hintEl) {
                        hintEl = document.createElement('div');
                        hintEl.className = 'tlf-aer-volhint';
                        hintEl.style.cssText = 'font-size:10px; color:#c2410c; margin-top:2px; text-align:right;';
                        const parfumLabel = row.querySelector('.edit-item-parfum')?.closest('label');
                        if (parfumLabel) parfumLabel.parentNode.insertBefore(hintEl, parfumLabel.nextSibling);
                    }
                    hintEl.textContent = `poids volume : ${billed.toFixed(1)} kg`;
                } else if (hintEl) {
                    hintEl.remove();
                }
            }
            this.calculateEditTotals();
            return;
        }

        item.total = item.qty * item.pu;

        const row = e.target.closest('.form-grid');
        if (row) {
            const totalInput = row.querySelector('input[readonly]');
            if (totalInput) totalInput.value = this.formatMoneyLocal(item.total);
        }

        this.calculateEditTotals();
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
            tel: document.getElementById('tlfEditExpTel').value.trim(),
            adresseExpediteur: document.getElementById('tlfEditExpAdresse').value.trim(),
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

        // App Clients : on RECALCULE le lien client<->facture (phoneTail = 9
        // derniers chiffres) à CHAQUE modif de numéro. Sinon le colis resterait
        // rattaché à l'ANCIEN numéro et le client ne le retrouverait plus sous
        // son nouveau numéro. (E.164 = affichage, recalculé aussi par cohérence.)
        const _agTail = inv.departureAgency || sessionStorage.getItem('currentActiveAgency') || 'paris';
        const _pcTail = routePhoneCountries(_agTail);
        updates.expPhoneTail = phoneTail(updates.tel);
        updates.destPhoneTail = phoneTail(updates.numero);
        updates.expPhoneE164 = _pcTail.exp ? toE164Intl(updates.tel, _pcTail.exp) : toE164Detect(updates.tel);
        updates.destPhoneE164 = _pcTail.dest ? toE164Intl(updates.numero, _pcTail.dest) : toE164Detect(updates.numero);

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
                    // SÉCURITÉ : ne JAMAIS supprimer un label DÉJÀ SCANNÉ (sinon
                    // l'historique de scan devient orphelin et le suivi colis
                    // incohérent). On retire en priorité les labels NON scannés ;
                    // si la nouvelle quantité passe sous le nombre de colis déjà
                    // scannés, on BLOQUE la modification avec un message clair.
                    const scannedSet = new Set((livData.scanHistory || []).map(s => s.scanRef));
                    const scannedCount = updatedLabels.filter(l => scannedSet.has(l)).length;
                    if (newTotalQty < scannedCount) {
                        if (btn) { btn.innerHTML = '<i class="fas fa-save"></i> Enregistrer'; btn.disabled = false; }
                        const msg = `Impossible de réduire à ${newTotalQty} colis : ${scannedCount} colis ont déjà été scannés. Gardez au moins ${scannedCount} colis (ou corrigez d'abord les scans).`;
                        if (window.AppModal) await window.AppModal.error(msg, "Réduction bloquée");
                        else alert(msg);
                        return;
                    }
                    // Retire uniquement des labels NON scannés (depuis la fin).
                    const removable = updatedLabels.filter(l => !scannedSet.has(l));
                    const removeSet = new Set(removable.slice(-(updatedLabels.length - newTotalQty)));
                    updatedLabels = updatedLabels.filter(l => !removeSet.has(l));
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

            // ===== Correction de nom « partout » (anti-doublon destinataire/expéditeur) =====
            // Si le NOM change mais que le NUMÉRO reste le même => même personne,
            // simple correction => on répercute le nouveau nom sur TOUTES ses
            // factures + livraisons (ancre = phoneTail). Si le numéro change aussi
            // => autre personne => on ne touche QUE cette facture (déjà fait).
            try {
                const propagateRename = async (oldName, newName, oldTail, newTail, tailField, txNameField, livField) => {
                    const o = String(oldName || '').trim(), n = String(newName || '').trim();
                    if (!o || !n || o.toUpperCase() === n.toUpperCase()) return; // nom inchangé
                    if (!oldTail || oldTail !== newTail) return; // numéro changé/absent => autre personne
                    const b2 = writeBatch(db);
                    let cnt = 0;
                    const txSnap = await getDocs(query(collection(db, getCollectionName('transactions')), where(tailField, '==', oldTail)));
                    txSnap.forEach(d => { if (d.id !== id) { b2.update(d.ref, { [txNameField]: n }); cnt++; } });
                    const livSnap = await getDocs(query(collection(db, getCollectionName('livraisons')), where(livField, '==', o)));
                    livSnap.forEach(d => { b2.update(d.ref, { [livField]: n }); cnt++; });
                    if (cnt > 0) await b2.commit();
                };
                const oldDestTail = inv.destPhoneTail || phoneTail(inv.numero || '');
                const oldExpTail = inv.expPhoneTail || phoneTail(inv.tel || '');
                await propagateRename(inv.nomDestinataire, updates.nomDestinataire, oldDestTail, updates.destPhoneTail, 'destPhoneTail', 'nomDestinataire', 'destinataire');
                await propagateRename(inv.nom, updates.nom, oldExpTail, updates.expPhoneTail, 'expPhoneTail', 'nom', 'expediteur');
            } catch (eProp) { console.warn('Propagation renommage :', eProp); }

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

        if (!window.app.isBuiltinRole() && !window.app.hasPermission('delete_invoice')) {
            return window.app.showToast("Vous n'avez pas la permission de supprimer une facture.", "error");
        }

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

        const target = sessionStorage.getItem('shippingMode') === 'aerien' ? 'invoice-aerien' : 'invoice-new';
        this.app.renderPage(target);
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
            let kgMap = {};
            let currentLabelIdx = 1;
            const _aBilledKg = (it) => {
                const real = parseFloat(it.poids) || 0;
                const vol = ((parseFloat(it.lng) || 0) * (parseFloat(it.lrg) || 0) * (parseFloat(it.haut) || 0)) / 5000;
                return (it.mode === 'poids') ? Math.max(real, vol) : real;
            };
            if (invoice.items && Array.isArray(invoice.items)) {
                invoice.items.forEach(item => {
                    const qty = parseInt(item.qty) || 1;
                    const _kg = _aBilledKg(item);
                    for (let i = 0; i < qty; i++) {
                        descMap[currentLabelIdx] = item.desc;
                        kgMap[currentLabelIdx] = _kg;
                        currentLabelIdx++;
                    }
                });
            }

            if (liv.labels && liv.labels.length > 0) {
                labelsList = liv.labels.map((lbl, idx) => {
                    let specificDesc = invoice.description || 'COLIS';
                    let specificKg = 0;
                    const match = lbl.match(/_(\d+)_/);
                    if (match && descMap[parseInt(match[1])]) {
                        specificDesc = descMap[parseInt(match[1])];
                        specificKg = kgMap[parseInt(match[1])] || 0;
                    } else if (descMap[idx + 1]) {
                        specificDesc = descMap[idx + 1];
                        specificKg = kgMap[idx + 1] || 0;
                    }

                    return {
                        sousRef: lbl,
                        desc: specificDesc,
                        poids: specificKg,
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

        let dName = stripPhoneFromName(invoice.nomDestinataire || '');
        let dPhone = invoice.numero || invoice.tel || extractPhone(invoice.nomDestinataire) || '';

        const data = {
            ref: invoice.reference,
            date: invoice.date + ' 12:00:00',
            destName: dName,
            destPhone: dPhone,
            destAddress: invoice.adresseDestinataire || invoice.lieuLivraison || '',
            expName: invoice.nom,
            expAddress: expAddress,
            isAerien: invoice.modeExpedition === 'aerien',
            labels: labelsList
        };
        
        await this.app.printLabels(data);
        
        if (originalFormat) localStorage.setItem('amt_label_format', originalFormat);
    },

    // Livraison "représentative" d'une facture pour le magasinage : on prend en
    // priorité un colis encore EN ENTREPÔT (EN_COURS, non livré) avec une date
    // d'entrée (dateAjout) ; sinon la première ayant une dateAjout.
    pickLivraisonForStorage(livraisons) {
        if (!Array.isArray(livraisons) || !livraisons.length) return null;
        return livraisons.find(l => l && l.dateAjout && l.containerStatus === 'EN_COURS' && l.status !== 'LIVRE' && l.status !== 'ABANDONNE')
            || livraisons.find(l => l && l.dateAjout)
            || null;
    },

    // Frais de magasinage d'une facture (source unique : services/storageFee.js).
    // IMPORTANT : on calcule à partir de la date d'entrée en ENTREPÔT (dateAjout
    // de la LIVRAISON liée), exactement comme la page Livraison — et NON la date
    // de la facture. La quantité vient aussi de la livraison (restante/quantité).
    // Pas de frais si "offerts" (storageFeeWaived sur la transaction) ou colis
    // déjà livré/abandonné.
    calculateStorageFeeForInvoice(invoice, livraison, compareDate = new Date()) {
        if (!invoice || invoice.storageFeeWaived === true) return { days: 0, fee: 0 };
        if (!livraison || !livraison.dateAjout) return { days: 0, fee: 0 };
        // Magasinage uniquement pour un colis ENCORE EN ENTREPÔT (comme Livraison
        // et la page Magasinage) : ni livré, ni abandonné, ni encore au départ.
        if (livraison.containerStatus !== 'EN_COURS') return { days: 0, fee: 0 };
        if (livraison.status === 'LIVRE' || livraison.status === 'ABANDONNE') return { days: 0, fee: 0 };
        return calculateStorageFee(livraison.dateAjout, livraison, compareDate);
    },

    async printDocument(id, docType) {
        const invoice = this.invoices.find(i => i.id === id);
        if(!invoice) return;

        this.app.showToast(`Génération de ${docType}...`, "info");

        // Chargement jsPDF + autotable (versions figées, source unique).
        await loadJsPdf();
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const { getDoc, doc: fsDoc } = await import("https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js");

        let logoBase64 = null;
        let companyName = "AMT TRANS'IT";
        let invoiceConfig = null;
        try {
            // « Le départ décide, l'arrivée suit » : modèle de document = config
            // du DÉPART de la route (logo/couleur/CGV/pied) → rendu identique
            // entre les deux agences d'une même route.
            const configAgency = getConfigSourceAgency();
            const compSnap = await getDoc(fsDoc(db, "settings", `company_${configAgency}`));
            if (compSnap.exists()) {
                if (compSnap.data().logoBase64) logoBase64 = compSnap.data().logoBase64;
                if (compSnap.data().name) companyName = compSnap.data().name;
            }
            // Thème du MODE actif : en aérien, un doc dédié `_aerien` SURCHARGE le
            // maritime (les champs non définis en aérien héritent du maritime).
            const _mode = sessionStorage.getItem('shippingMode') || 'maritime';
            const baseSnap = await getDoc(fsDoc(db, "settings", `invoice_config_${configAgency}`));
            invoiceConfig = baseSnap.exists() ? baseSnap.data() : {};
            if (_mode === 'aerien') {
                const aSnap = await getDoc(fsDoc(db, "settings", `invoice_config_${configAgency}_aerien`));
                if (aSnap.exists()) invoiceConfig = { ...invoiceConfig, ...aSnap.data() };
            }
            if (invoiceConfig.companyName) companyName = invoiceConfig.companyName;
            if (invoiceConfig.logoUrl) logoBase64 = invoiceConfig.logoUrl;
        } catch(e) { console.error(e); }

        let defaultColor = invoiceConfig?.primaryColor ? JSON.parse(invoiceConfig.primaryColor) : [59, 130, 246];
        let accentColor = defaultColor;
        if (docType === 'BL' || docType === 'ATTESTATION') accentColor = [16, 185, 129];

        // Bande d'en-tête : couleur configurée (Choix Facture) ou bleu nuit par défaut.
        const _hm = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(invoiceConfig?.headerColorHex || ''));
        const _headerRgb = _hm ? [parseInt(_hm[1], 16), parseInt(_hm[2], 16), parseInt(_hm[3], 16)] : [30, 41, 59];
        doc.setFillColor(..._headerRgb);
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
        
        let clientName = stripPhoneFromName(invoice.nomDestinataire || '');
        let clientPhone = invoice.numero || invoice.tel || extractPhone(invoice.nomDestinataire) || '';
        
        doc.text(`${clientName}`, 120, 59);
        doc.text(`${clientPhone}`, 120, 66);
        const addrStr = doc.splitTextToSize(`${invoice.adresseDestinataire || ''}`, 70);
        doc.text(addrStr, 120, 73);

        const isBL = docType === 'BL' || docType === 'ATTESTATION';
        const isEur = isEurAgency();
        const TAUX = isEur ? CONSTANTS.TAUX_CONVERSION : 1;
        const isAerienDoc = invoice.modeExpedition === 'aerien';
        // Colis « A la valeur » : poids masque sur la facture/BL client.
        const _aBilledKg = (it) => { if (it.mode !== 'poids') return 0; const real = parseFloat(it.poids) || 0; const vol = ((parseFloat(it.lng)||0)*(parseFloat(it.lrg)||0)*(parseFloat(it.haut)||0))/5000; return Math.max(real, vol); };
        const _aMoney = (eur) => this.formatMoneyLocal(isEur ? eur : eur * TAUX);
        const _aLineEur = (it) => { const q = parseFloat(it.qty)||0; return (it.mode === 'poids') ? _aBilledKg(it)*q*(it.parfum?15:13) : (parseFloat(it.pu)||0)*q; };

        let tableColumn, columnStyles;
        const tableRows = [];

        if (isAerienDoc && !isBL && invoice.items && Array.isArray(invoice.items)) {
            tableColumn = ["Description / Nature", "Qté", "Mode", "Poids", "Tarif / P.U", "Total"];
            let _tk = 0;
            invoice.items.forEach(item => {
                const isP = item.mode === 'poids'; const kg = _aBilledKg(item); _tk += kg * (parseFloat(item.qty)||0);
                tableRows.push([ item.desc, item.qty.toString(), isP ? ('Poids'+(item.parfum?' (parfum/alcool)':'')) : 'Valeur', kg?kg.toFixed(1)+' kg':'-', isP ? ((item.parfum?15:13)+' €/kg') : _aMoney(parseFloat(item.pu)||0), _aMoney(_aLineEur(item)) ]);
            });
            tableRows.push(['Poids total facturé', '', '', _tk.toFixed(1)+' kg', '', '']);
            columnStyles = { 1: { halign: 'center' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } };
        } else if (isAerienDoc && isBL && invoice.items && Array.isArray(invoice.items)) {
            tableColumn = ["Description / Nature", "Qté", "Poids", "Statut", "Observations"];
            let _tk = 0;
            invoice.items.forEach(item => { const kg = _aBilledKg(item); _tk += kg * (parseFloat(item.qty)||0); tableRows.push([item.desc, item.qty.toString(), kg?kg.toFixed(1)+' kg':'-', "À LIVRER", "-"]); });
            tableRows.push(['Poids total', '', _tk.toFixed(1)+' kg', '', '']);
            columnStyles = { 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'center' } };
        } else {
            tableColumn = isBL
                ? ["Description / Nature du Colis", "Qté", "Statut", "Observations"]
                : ["Description / Nature du Colis", "Qté", "P.U", "Total"];
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
            columnStyles = isBL
                ? { 1: { halign: 'center' }, 2: { halign: 'center' } }
                : { 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' } };
        }

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
            // Frais de magasinage : calcul basé sur la date d'entrepôt (dateAjout)
            // de la livraison liée, comme la page Livraison. Converti en devise
            // d'affichage (÷ TAUX, comme le fret) puis AJOUTÉ au reste à payer.
            let livForFee = null;
            try {
                const { collection, query, where, getDocs } = await import("https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js");
                const lq = await getDocs(query(collection(db, getCollectionName("livraisons")), where("ref", "==", invoice.reference)));
                livForFee = this.pickLivraisonForStorage(lq.docs.map(d => ({ id: d.id, ...d.data() })));
            } catch (e) { console.warn('magasinage facture (livraison):', e); }
            const storage = this.calculateStorageFeeForInvoice(invoice, livForFee);
            const storageFeeDisplay = (storage.fee || 0) / TAUX;
            const totalDue = reste + storageFeeDisplay;

            doc.setFont("helvetica", "bold");
            doc.text("RÉCAPITULATIF FINANCIER", 115, finalY);
            doc.setFont("helvetica", "normal");

            let currentLineY = finalY + 8;
            doc.text("Total Fret :", 115, currentLineY);
            doc.text(`${this.formatMoneyLocal(prixFret)}`, 195, currentLineY, { align: 'right' });
            currentLineY += 6;

            if (storageFeeDisplay > 0) {
                doc.text(`Frais magasinage (${storage.days} j) :`, 115, currentLineY);
                doc.text(`${this.formatMoneyLocal(storageFeeDisplay)}`, 195, currentLineY, { align: 'right' });
                currentLineY += 6;
            }

            doc.text("Montant Payé :", 115, currentLineY);
            doc.text(`${this.formatMoneyLocal(paye)}`, 195, currentLineY, { align: 'right' });
            currentLineY += 6;

            doc.setFillColor(totalDue > 0 ? 254 : 240, totalDue > 0 ? 242 : 253, totalDue > 0 ? 242 : 244);
            doc.rect(115, currentLineY + 2, 80, 10, 'F');
            doc.setFont("helvetica", "bold");
            doc.text("RESTE À PAYER :", 118, currentLineY + 9);
            doc.setTextColor(totalDue > 0 ? 220 : 22, totalDue > 0 ? 38 : 163, totalDue > 0 ? 38 : 74);
            doc.text(`${this.formatMoneyLocal(totalDue)}`, 192, currentLineY + 9, { align: 'right' });
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
            const cgvText = invoiceConfig?.cgv || DEFAULT_CGV;
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
        const footerText = invoiceConfig?.footer || DEFAULT_COMPANY_FOOTER;
        doc.text(footerText, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });

        // Sécurité anti-falsification (FACTURE / REÇU) : tampon de statut +
        // filigrane reste dû + QR de vérification en ligne (statut réel).
        if (docType === 'FACTURE' || docType === 'RECU') {
            try {
                await applyInvoiceSecurity(doc, {
                    trans: invoice,
                    collectionName: getCollectionName('transactions'),
                    docId: invoice.id,
                    // computeInvoiceStatus renvoie le reste en CFA brut ; on
                    // convertit en devise d'affichage de la route (÷ TAUX).
                    formatMoney: (v) => this.formatMoneyLocal(v / TAUX)
                });
            } catch (e) { console.warn('Sécurité facture :', e && e.message); }
        }

        doc.save(`${titleText.replace(/ /g, '_')}_${invoice.reference}.pdf`);
    }
};
