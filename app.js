import { AGENCIES } from './agencies-config.js';
import { isAffiliationActive } from './affiliation-config.js';

// --- SHARED VIEWS ---
import { ClientsView } from './shared/views/clients.js';
import { ToutesLesFacturesView } from './shared/views/touteslesfactures.js';
import { DailyBilanView } from './shared/views/daily-bilan.js';
import { DailyUsersView } from './shared/views/daily-users.js';
import { StatistiquesView } from './shared/views/statistiques.js';
import { SettingsAgentsView } from './shared/views/settings-agents.js';
import { SettingsRolesMenusView } from './shared/views/settings-roles-menus.js';
import { ParrainageView } from './shared/views/parrainage.js';
import { ProfilView } from './profil-view.js';

// --- PARIS VIEWS (Départ) ---
import { DashboardView as ParisDashboardView } from './paris/js/views/dashboard.js';
import { NouvelleFactureView } from './paris/js/views/nouvellefacture.js';
import { FactureAerienView } from './paris/js/views/facture-aerien.js';
import { ProductsListView } from './paris/js/views/products-list.js';
import { NouveauDevisView } from './paris/js/views/nouveaudevis.js';
import { NouveauRdvView } from './paris/js/views/nouveaurdv.js';
import { TousLesRdvView } from './paris/js/views/touslesrdv.js';
import { CalendrierRdvView } from './paris/js/views/calendrierrdv.js';
import { NouveauProgrammeView } from './paris/js/views/nouveauprogramme.js';
import { MonProgrammeView } from './paris/js/views/monprogramme.js';
import { HistoriqueProgrammesView } from './paris/js/views/historique-programmes.js';
import { ChauffeursListView } from './paris/js/views/chauffeurs-list.js';
import { DeparturesCalendarView } from './paris/js/views/departures-calendar.js';
import { TousLesDevisView } from './paris/js/views/touslesdevis.js';
import { DemandesDevisView } from './paris/js/views/demandesdevis.js';
import { ConfectionConteneursView } from './paris/js/views/confection-conteneurs.js';
import { BateauxDepartView } from './paris/js/views/bateaux-depart.js';
import { AvionsDepartView } from './paris/js/views/avions-depart.js';
import { ArriveesView } from './abidjan/js/views/arrivees.js';
import { ScanHistoryView as ParisScanHistoryView } from './paris/js/views/scan-history.js';
import { FinanceCaisseView } from './paris/js/views/finance-caisse.js';
import { FinanceDepensesView } from './paris/js/views/finance-depenses.js';
import { FinanceChequesView } from './paris/js/views/finance-cheques.js';
import { SettingsAgencyView } from './paris/js/views/settings-agency.js';
import { SettingsAgenciesView } from './paris/js/views/settings-agencies.js';
import { SettingsCompanyView } from './paris/js/views/settings-company.js';
import { SettingsSoftwareView as ParisSettingsSoftwareView } from './paris/js/views/settings-software.js';
import { SettingsDesignView } from './paris/js/views/settings-design.js';
import { SettingsAppointmentsView } from './paris/js/views/settings-appointments.js';
import { ConfigInvoiceView } from './paris/js/views/config-invoice.js';
import { ConfigLabelView } from './paris/js/views/config-label.js';
import { ConfigContainerView } from './paris/js/views/config-container.js';
import { ScanWarehouseView } from './paris/js/views/scan-warehouse.js';
import { ScanContainerView } from './paris/js/views/scan-container.js';
import { ScanDepartVolView } from './paris/js/views/scan-depart-vol.js';
import { BilansFinanciersView } from './paris/js/views/bilans-financiers.js';
import { ChatView as ParisChatView } from './paris/js/views/chat.js';
import { AuditLogView as ParisAuditLogView } from './paris/js/views/audit-log.js';
import { ProspectingView as ParisProspectingView } from './paris/js/views/prospecting.js';
import { NotificationsView } from './paris/js/views/notifications.js';

// --- ABIDJAN VIEWS (Arrivée) ---
import { DashboardView as AbidjanDashboardView } from './abidjan/js/views/dashboard.js';
import { ExpensesView } from './abidjan/js/views/expenses.js';
import { MagasinageView } from './abidjan/js/views/magasinage.js';
import { LivraisonView } from './abidjan/js/views/livraison.js';
import { CaisseView } from './abidjan/js/views/caisse.js';
import { AuditView } from './abidjan/js/views/audit.js';
import { HistoryView } from './abidjan/js/views/history.js';
import { BankView } from './abidjan/js/views/bank.js';
import { OtherIncomeView } from './abidjan/js/views/other-income.js';
import { VoitureView } from './abidjan/js/views/voiture.js';
import { PointsView } from './abidjan/js/views/points.js';
import { ComptejbView } from './abidjan/js/views/comptejb.js';
import { SalaireView } from './abidjan/js/views/salaire.js';
import { ConfirmationView } from './abidjan/js/views/confirmation.js';
import { ScanDechargementView } from './abidjan/js/views/scan-dechargement.js';
import { ScanLivraisonView } from './abidjan/js/views/scan-livraison.js';
import { ScanLivrerView } from './abidjan/js/views/scan-livrer.js';
import { ScanHistoryView as AbidjanScanHistoryView } from './abidjan/js/views/scan-history.js';
import { SmsView } from './abidjan/js/views/sms.js';
import { ChatView as AbidjanChatView } from './abidjan/js/views/chat.js';
import { AuditLogView as AbidjanAuditLogView } from './abidjan/js/views/audit-log.js';
import { ProspectingView as AbidjanProspectingView } from './abidjan/js/views/prospecting.js';
import { SettingsSoftwareView as AbidjanSettingsSoftwareView } from './abidjan/js/views/settings-software.js';

export const app = {
    currentPage: 'dashboard',
    allowedMenus: null,
    _pageRendered: false,

    pageToMenuMap: {
        'dashboard': 'main',
        'daily-bilan': 'bilan', 'daily-users': 'bilan',
        'invoices-list': 'factures', 'invoice-new': 'factures', 'touteslesfactures': 'factures',
        'appointment-new': 'rdv', 'appointments-list': 'rdv', 'appointments-pending': 'rdv', 'appointments-calendar': 'rdv',
        'program-new': 'programmes', 'program-my': 'programmes', 'program-history': 'programmes', 'drivers': 'programmes', 'departures-calendar': 'programmes',
        'quotes-list': 'devis', 'quote-new': 'devis', 'quote-requests': 'devis',
        'confection-containers': 'chargement', 'loading-boats': 'chargement', 'arrivals-boats': 'chargement',
        'scan-warehouse': 'scan', 'scan-container': 'scan', 'scan-depart-vol': 'scan', 'scan-classic': 'scan', 'scan-history': 'scan',
        'scan-dechargement': 'scan', 'scan-livraison': 'scan', 'scan-livrer': 'scan',
        'clients-list': 'clients', 'clients-app': 'clients', 'clients-analytics': 'clients', 'clients': 'logistique',
        'chat': 'comms', 'sms-send': 'comms', 'sms-history': 'comms', 'notifications': 'comms', 'notifications-history': 'comms', 'sms': 'comms',
        'products-list': 'produits',
        'parrainage': 'special-asie', 'chine-dashboard': 'special-asie',
        'finance-cashier': 'finance', 'finance-cheques': 'finance', 'finance-expenses': 'finance',
        'index': 'entrees-caisse', 'confirmation': 'entrees-caisse', 'history': 'entrees-caisse', 'other-income': 'entrees-caisse',
        'expenses': 'finance', 'bank': 'finance', 'audit': 'finance',
        'livraison': 'logistique', 'livreurscan': 'logistique', 'voiture': 'logistique', 'magasinage': 'logistique', 'points': 'logistique',
        'admin-panel': 'settings', 'salaire': 'settings', 'comptejb': 'settings', 'settings-agency': 'settings', 'settings-company': 'settings', 'settings-software': 'settings', 'settings-design': 'settings', 'settings-sms': 'settings', 'settings-notifications': 'settings', 'settings-menus': 'settings', 'settings-agents': 'settings', 'settings-agencies': 'settings', 'settings-roles': 'settings', 'settings-appointments': 'settings', 'settings-profile': 'settings',
        'stock-list': 'stock',
        'balance-monthly': 'bilans-financiers', 'balance-12m': 'bilans-financiers',
        'stats-boat': 'bilans-financiers', 'stats-monthly': 'bilans-financiers', 'stats-yearly': 'bilans-financiers',
        'config-invoice': 'configuration', 'config-label': 'configuration', 'config-container': 'configuration', 'config-objectives': 'configuration', 'config-charges': 'configuration',
        'prospecting': 'prospecting',
        'audit-log': 'audit-log'
    },

    init() {
        window.app = this;
        
        if (window.AppModal && window.AppModal.init) {
            window.AppModal.init();
        }

        this.initContainerGauge();
        this.initSidebarEvents();
        this.initMobileToggle();
        this.initGlobalEvents();

        // On rend la page initiale UNIQUEMENT après le chargement de la config
        // (menus + permissions). Sinon la page se rend avant que les droits
        // soient connus : un écran interdit (ex. tableau de bord) s'affiche puis
        // est remplacé, laissant des écouteurs Firestore orphelins (erreurs
        // console "Cannot read properties of null").
        this.loadMenuConfig().then(() => {
            let savedPage = sessionStorage.getItem('globalCurrentPage') || sessionStorage.getItem('parisCurrentPage') || sessionStorage.getItem('abidjanCurrentPage');
            if (!savedPage || savedPage === 'null' || savedPage === 'undefined') savedPage = 'dashboard';
            this.renderPage(savedPage);
        });
        this.updateBadges();
        this.initPendingSessionsBadge();
    },

    async loadMenuConfig() {
        try {
            const { db } = await import('./firebase-config.js');
            const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js');
            const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
            
            const menusSnap = await getDoc(doc(db, "settings", `menus_${activeAgency}`));
            let menuConfig = menusSnap.exists() ? menusSnap.data() : null;

            this.applyMenuConfig(this.migrateMenuConfig(menuConfig));
        } catch(e) { console.error("Erreur chargement configuration des menus:", e); }
    },

    // Compatibilité ascendante : les configs enregistrées avant la refonte
    // utilisent d'anciennes clés de section. On les convertit à la volée vers
    // les nouvelles clés pour ne casser aucune agence déjà configurée.
    //   operations   -> programmes + logistique
    //   finance      -> finance + entrees-caisse (l'ancien 'finance' incluait
    //                   la Saisie/Confirmation/Historique/Autres Entrées)
    //   statistique  -> bilans-financiers
    //   parrainage   -> special-asie
    //   colis-recus  -> supprimée
    migrateMenuKeys(arr) {
        if (!Array.isArray(arr)) return arr;
        const out = [];
        const push = (k) => { if (k && !out.includes(k)) out.push(k); };
        arr.forEach(k => {
            if (k === 'operations') { push('programmes'); push('logistique'); }
            else if (k === 'finance') { push('finance'); push('entrees-caisse'); }
            else if (k === 'statistique') { push('bilans-financiers'); }
            else if (k === 'parrainage') { push('special-asie'); }
            else if (k === 'colis-recus') { /* section supprimée : on ignore */ }
            else push(k);
        });
        return out;
    },

    migrateMenuConfig(config) {
        if (!config) return config;
        const c = { ...config };
        if (Array.isArray(c.order)) c.order = this.migrateMenuKeys(c.order);
        if (Array.isArray(c.visibleMenus)) c.visibleMenus = this.migrateMenuKeys(c.visibleMenus);
        if (c.roles && typeof c.roles === 'object') {
            const r = {};
            Object.keys(c.roles).forEach(role => { r[role] = this.migrateMenuKeys(c.roles[role]); });
            c.roles = r;
        }
        return c;
    },

    applyMenuConfig(config) {
        const userRole = sessionStorage.getItem('userRole') || 'agent';
        // Robustesse à la casse : un rôle peut être stocké « LIVREUR » alors que
        // sa config menu est rangée sous « livreur » (les id sont en minuscules).
        // On compare en minuscules partout pour éviter un repli involontaire sur
        // les menus « agent ».
        const ur = userRole.toLowerCase();
        let baseRole = 'agent';
        if (ur.includes('chauf') || ur.includes('livreur')) baseRole = 'chauf';
        if (ur.includes('manager') || ur.includes('direction')) baseRole = 'manager';

        const isSuperUser = ur === 'super_admin' || ur === 'admin';
        const defaultOrder = ['main', 'special-asie', 'bilan', 'factures', 'rdv', 'programmes', 'entrees-caisse', 'logistique', 'devis', 'chargement', 'scan', 'clients', 'comms', 'produits', 'finance', 'stock', 'bilans-financiers', 'settings', 'configuration', 'prospecting', 'audit-log'];
        let baseOrder = config && config.order ? config.order : [...defaultOrder];
        
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
        const isArrival = AGENCIES[activeAgency] && AGENCIES[activeAgency].type === 'arrival';

        defaultOrder.forEach(key => { if (!baseOrder.includes(key)) baseOrder.push(key); });

        const defaultRoles = {
            agent: ['main', 'bilan', 'factures', 'rdv', 'programmes', 'entrees-caisse', 'logistique', 'devis', 'chargement', 'scan', 'clients', 'comms', 'produits'],
            chauf: ['main', 'chargement', 'scan', 'programmes', 'logistique'],
            manager: ['main', 'bilan', 'factures', 'entrees-caisse', 'finance', 'bilans-financiers', 'clients', 'stock']
        };

        let allowedMenus;
        if (isSuperUser) {
            allowedMenus = baseOrder;
        } else if (config && config.roles) {
            // Un rôle personnalisé utilise SES propres menus (clé = id exact du rôle).
            // On ne retombe sur le groupe de base (agent/chauf/manager) que si le
            // rôle n'a aucune configuration enregistrée.
            allowedMenus = config.roles[userRole] || config.roles[ur] || config.roles[baseRole] || defaultRoles[baseRole] || [];
            if (!config.roles[userRole] && !config.roles[ur] && !['agent', 'chauf', 'manager', 'spectateur'].includes(ur)) {
                console.warn(`[Menus] Aucune config de menu pour le rôle « ${userRole} » sur l'agence « ${activeAgency} » → repli sur « ${baseRole} ». Configurez ce rôle dans Rôles & Menus pour CETTE agence.`);
            }
        } else {
            allowedMenus = defaultRoles[baseRole] || [];
        }

        // Application du filtre des menus physiquement disponibles pour l'agence (défini dans Apparence & Menus)
        if (config && config.visibleMenus) {
            const _filteredBase = baseOrder.filter(k => config.visibleMenus.includes(k));
            const _filteredAllowed = allowedMenus.filter(k => config.visibleMenus.includes(k));
            // GARDE-FOU anti-verrouillage : une config qui ne laisse AUCUN menu
            // accessible est forcément une erreur (ex. « tout masqué puis
            // enregistré »). On l'ignore pour ne pas enfermer l'utilisateur hors
            // de l'application — il retrouve les menus par défaut et peut aller
            // corriger la configuration dans « Rôles & Menus ».
            if (_filteredAllowed.length > 0) {
                baseOrder = _filteredBase;
                allowedMenus = _filteredAllowed;
            } else {
                console.warn('[Menus] visibleMenus ne laisse aucun menu accessible — configuration ignorée (garde-fou anti-verrouillage).');
            }
        }

        // Section "Spécial Asie" / "Réseau Partenaires" : compatibilité
        // descendante. Sur Paris / Abidjan historiques SANS visibleMenus
        // configuré, on masque ces sections par défaut (comportement
        // d'avant l'apparition de Rôles & Menus). Pour TOUTES les autres
        // routes (chine, SaaS, etc.), c'est désormais la config visibleMenus
        // de Rôles & Menus qui décide — il suffit d'y cocher 'special-asie'
        // pour la faire apparaître. Remplace l'ancien hard-code
        // CSS .menu-chine-only.
        const hasVisibleMenusCfg = !!(config && Array.isArray(config.visibleMenus) && config.visibleMenus.length > 0);
        if (!hasVisibleMenusCfg && (activeAgency === 'paris' || activeAgency === 'abidjan')) {
            baseOrder = baseOrder.filter(k => k !== 'special-asie' && k !== 'parrainage');
            allowedMenus = allowedMenus.filter(k => k !== 'special-asie' && k !== 'parrainage');
        }
        
        // Sécurité finale : si après tous les filtres aucun menu n'est
        // accessible (config de rôle vidée, etc.), on rétablit un menu de base
        // pour ne jamais bloquer totalement l'utilisateur.
        if (!allowedMenus || allowedMenus.length === 0) {
            console.warn('[Menus] Aucun menu accessible après filtrage — repli sur les menus par défaut.');
            allowedMenus = isSuperUser ? [...baseOrder] : ['main'];
            if (!allowedMenus.includes('main')) allowedMenus.unshift('main');
        }

        // GARANTIE ADMINISTRATION : pour un admin/super_admin, la section
        // « Administration » (réglages) ne peut JAMAIS être masquée. C'est
        // l'accès de secours qui permet de corriger toute configuration de menu
        // erronée (ex. « tout masqué puis enregistré ») sans rester enfermé.
        if (isSuperUser) {
            if (!baseOrder.includes('settings')) baseOrder.push('settings');
            if (!allowedMenus.includes('settings')) allowedMenus.push('settings');
        }

        this.allowedMenus = allowedMenus;

        const navContainer = document.querySelector('.sidebar-nav');
        if (!navContainer) return;
        const sections = Array.from(navContainer.querySelectorAll('.sidebar-category'));
        
        const titleToKey = {
            'Dashboard': 'main', 'Bilan journalier': 'bilan', "Factures": 'factures', 'Entrées Caisse': 'entrees-caisse',
            'Rendez-vous': 'rdv', 'Les Programmes': 'programmes', 'Logistique': 'logistique', 'Devis': 'devis',
            'Chargement': 'chargement', 'Scan': 'scan', 'Clients': 'clients', 'Communication': 'comms',
            'PRODUITS': 'produits', 'Finance & Tréso': 'finance', 'Stock': 'stock',
            'Bilans & Stats': 'bilans-financiers', 'Administration': 'settings', 'Configuration': 'configuration',
            'Prospect': 'prospecting', 'Audit Log': 'audit-log', 'Spécial Asie': 'special-asie'
        };

        sections.forEach(sec => sec.remove());

        // "La config agence fait foi" : si l'agence a un visibleMenus explicitement
        // configuré (via Rôles & Menus), c'est LUI qui décide quels menus s'affichent
        // et le découpage départ/arrivée codé en dur (classes arrival-only/
        // departure-only) est IGNORÉ. Sinon : comportement historique conservé
        // (aucune régression pour les agences non encore configurées).
        const configAuthoritative = !!(config && Array.isArray(config.visibleMenus) && config.visibleMenus.length > 0);
        // Modules (sous-éléments) explicitement masqués pour cette agence
        // (liste noire par data-page, gérée dans Rôles & Menus). S'applique
        // dans les 2 modes ; défaut = visible (non régressif).
        const hiddenItems = new Set(config && Array.isArray(config.hiddenItems) ? config.hiddenItems : []);
        // Pages masquées spécifiquement pour le RÔLE de l'utilisateur courant
        // (liste noire par data-page, gérée dans Rôles & Menus > Menus du rôle).
        // Permet ex. : un livreur voit "Entrées Caisse > Saisie" mais pas
        // "Confirmation / Historique / Autres entrées". super_admin/admin = aucun
        // masquage. Conservée sur l'instance pour checkPageAccess (accès direct).
        const roleHiddenList = (config && config.roleHiddenItems)
            ? (config.roleHiddenItems[userRole] || config.roleHiddenItems[ur]) : null;
        const roleHidden = new Set(
            (!isSuperUser && Array.isArray(roleHiddenList)) ? roleHiddenList : []
        );
        this.roleHiddenPages = roleHidden;

        // Mode d'expédition courant : certains items n'existent que dans un mode
        // (ex. « Facture Aérien (Paris) » en aérien remplace « Nouvelle facture »).
        const _shipMode = sessionStorage.getItem('shippingMode') || 'maritime';

        baseOrder.forEach(key => {
            if (!this.allowedMenus.includes(key)) return;
            // Toutes les catégories partageant cette clé (corrige le bug du doublon :
            // ex. 'Entrées Caisse' ET 'Finance & Tréso' -> clé 'finance'. L'ancien
            // sections.find() n'en gardait qu'une et la 2e disparaissait).
            const matching = sections.filter(sec => {
                const titleEl = sec.querySelector('.sidebar-category-title');
                return titleEl && titleToKey[titleEl.textContent.trim()] === key;
            });

            // Administration toujours accessible pour un admin/super_admin :
            // on ne lui applique AUCUN masquage sur cette section.
            const _adminGuard = isSuperUser && key === 'settings';

            matching.forEach(section => {
                if (!configAuthoritative && !_adminGuard) {
                    // Mode historique : filtrage départ/arrivée au niveau section.
                    const isSecDep = section.classList.contains('departure-only');
                    const isSecArr = section.classList.contains('arrival-only');
                    if ((isArrival && isSecDep) || (!isArrival && isSecArr)) return; // section masquée
                }

                section.style.display = '';
                section.querySelectorAll('.sidebar-item').forEach(item => {
                    // 0) Garantie Administration : un admin/super_admin voit
                    // TOUJOURS tous les outils d'administration (non masquables).
                    if (_adminGuard) { item.style.display = ''; return; }
                    // 1) Module explicitement masqué pour cette agence (prioritaire).
                    if (hiddenItems.has(item.dataset.page)) { item.style.display = 'none'; return; }
                    // 1-bis) Module masqué pour CE rôle (par-rôle, prioritaire).
                    if (roleHidden.has(item.dataset.page)) { item.style.display = 'none'; return; }
                    // 1-ter) Visibilité selon le mode d'expédition (Maritime/Aérien),
                    // appliquée dans les 2 modes (config autoritaire ou non).
                    if (item.classList.contains('mode-aerien-only') && _shipMode !== 'aerien') { item.style.display = 'none'; return; }
                    if (item.classList.contains('mode-maritime-only') && _shipMode !== 'maritime') { item.style.display = 'none'; return; }
                    // 1-quater) Portée Maritime/Aérien configurée par module dans
                    // « Rôles & Menus » (itemModes : 'maritime' | 'aerien' | 'both').
                    const _im = (config && config.itemModes) ? config.itemModes[item.dataset.page] : null;
                    if (_im && _im !== 'both' && _im !== _shipMode) { item.style.display = 'none'; return; }
                    if (configAuthoritative) {
                        // La config fait foi : on affiche tous les items de la catégorie.
                        item.style.display = '';
                        return;
                    }
                    const isItemDep = item.classList.contains('departure-only');
                    const isItemArr = item.classList.contains('arrival-only');
                    item.style.display = ((isArrival && isItemDep) || (!isArrival && isItemArr)) ? 'none' : '';
                });
                navContainer.appendChild(section);
            });
        });

        // Renommage mode-aware du menu : « Bateaux départ » (🚢) devient
        // « Avion départ » (✈️) en aérien — même item, vue différente.
        const _boatsItem = document.querySelector('.sidebar-item[data-page="loading-boats"]');
        if (_boatsItem) {
            const _span = _boatsItem.querySelector('span');
            const _icon = _boatsItem.querySelector('i');
            if (_shipMode === 'aerien') {
                if (_span) _span.textContent = 'Avion départ';
                if (_icon) _icon.className = 'fas fa-plane-departure';
            } else {
                if (_span) _span.textContent = 'Bateaux départ';
                if (_icon) _icon.className = 'fas fa-ship';
            }
        }
        const _arrivalItem = document.querySelector('.sidebar-item[data-page="arrivals-boats"]');
        if (_arrivalItem) {
            const _span = _arrivalItem.querySelector('span');
            const _icon = _arrivalItem.querySelector('i');
            if (_shipMode === 'aerien') {
                if (_span) _span.textContent = 'Vol arrivée';
                if (_icon) _icon.className = 'fas fa-plane-arrival';
            } else {
                if (_span) _span.textContent = 'Bateau arrivée';
                if (_icon) _icon.className = 'fas fa-anchor';
            }
        }

        // Accès AÉRIEN par rôle : si ce rôle n'a pas l'aérien, on masque le
        // bouton « ✈️ Aérien » (bascule de mode). super_admin = toujours autorisé.
        let _ra;
        if (config && config.roleAerien) {
            _ra = (config.roleAerien[userRole] !== undefined) ? config.roleAerien[userRole] : config.roleAerien[ur];
        }
        // Restriction supplémentaire PAR AGENT : 'both' (défaut) | 'maritime' | 'aerien'.
        // Permet de limiter un agent à un seul mode dans sa route, indépendamment du rôle.
        const _userAllowedMode = sessionStorage.getItem('userAllowedMode') || 'both';
        // Restriction PAR AGENCE / ROUTE (réglée dans Gestion des agences) :
        // si la route est marquée « Maritime seul » ou « Aérien seul », le bouton
        // de l'autre mode disparaît pour TOUS les agents de cette route.
        const _agencyModes = (AGENCIES[activeAgency] && AGENCIES[activeAgency].modesSupported) || 'both';
        // Intersection : un mode est autorisé seulement si TOUS les paliers le permettent
        // (rôle ✓, agent ✓, agence ✓).
        const _aerienAllowed = (isSuperUser || _ra !== false) && _userAllowedMode !== 'maritime' && _agencyModes !== 'maritime';
        const _maritimeAllowed = _userAllowedMode !== 'aerien' && _agencyModes !== 'aerien';
        const _aerienBtn = document.querySelector('.shipping-mode-toggle [data-mode="aerien"]');
        if (_aerienBtn) _aerienBtn.style.display = _aerienAllowed ? '' : 'none';
        const _maritimeBtn = document.querySelector('.shipping-mode-toggle [data-mode="maritime"]');
        if (_maritimeBtn) _maritimeBtn.style.display = _maritimeAllowed ? '' : 'none';
        // Bascule forcée si l'agent est sur un mode interdit.
        if (!_aerienAllowed && _shipMode === 'aerien') {
            sessionStorage.setItem('shippingMode', 'maritime');
            location.reload();
            return;
        }
        if (!_maritimeAllowed && _shipMode === 'maritime') {
            sessionStorage.setItem('shippingMode', 'aerien');
            location.reload();
            return;
        }

        // La page courante n'est pas accessible (ex. tableau de bord masqué pour
        // ce rôle) : on bascule vers la PREMIÈRE page réellement accessible.
        // Uniquement si une page est DÉJÀ affichée (re-application du menu) :
        // au tout 1er chargement, c'est renderPage(savedPage) qui gère l'accès,
        // pour éviter un double rendu.
        if (this._pageRendered && this.currentPage && !this.checkPageAccess(this.currentPage)) {
            const fallback = this.getFirstAccessiblePage();
            if (fallback) this.renderPage(fallback);
            else this.showNoAccessMessage();
        }

        // Le menu vient d'être reconstruit : on repose le badge "sessions non confirmées"
        if (typeof this._pendingSessionsCount === 'number') {
            this.applyPendingSessionsBadge(this._pendingSessionsCount);
        }
    },

    checkPageAccess(page) {
        // Page masquée spécifiquement pour le rôle de l'utilisateur : accès refusé
        // même par navigation directe.
        if (this.roleHiddenPages && this.roleHiddenPages.has(page)) return false;
        if (!this.allowedMenus) return true;
        const requiredMenu = this.pageToMenuMap[page];
        return !(requiredMenu && !this.allowedMenus.includes(requiredMenu));
    },

    // Première page réellement accessible dans le menu reconstruit (ordre du
    // menu). Sert de page d'atterrissage quand la page demandée est interdite
    // pour le rôle (ex. tableau de bord masqué). Renvoie null si aucune.
    getFirstAccessiblePage() {
        const items = document.querySelectorAll('.sidebar-nav .sidebar-item');
        for (const item of items) {
            const page = item.dataset.page;
            if (!page) continue;
            if (item.style.display === 'none') continue;          // item masqué
            const section = item.closest('.sidebar-category');
            if (section && section.style.display === 'none') continue; // section masquée
            if (this.checkPageAccess(page)) return page;
        }
        return null;
    },

    showNoAccessMessage() {
        const c = document.getElementById('contentContainer');
        if (c) c.innerHTML = '<div style="padding:48px 20px; text-align:center; color:#64748b;"><i class="fas fa-lock" style="font-size:32px; display:block; margin-bottom:12px; color:#cbd5e1;"></i>Aucune page accessible avec votre rôle.<br>Contactez un administrateur.</div>';
    },

    async initContainerGauge() {
        try {
            // La jauge mesure le remplissage d'un CONTENEUR maritime (CBM / 68).
            // En AÉRIEN cette notion n'existe pas (mesure au poids/kg) : on
            // masque la jauge et on n'ouvre aucun écouteur.
            const gaugeEl = document.getElementById('topBarGauge');
            const mode = sessionStorage.getItem('shippingMode') || 'maritime';

            // Nettoyage des écouteurs précédents (changement de mode / d'agence).
            if (this.unsubContainerGauge1) this.unsubContainerGauge1();
            if (this.unsubContainerGauge2) this.unsubContainerGauge2();
            if (this.unsubAerienGauge) this.unsubAerienGauge();
            if (gaugeEl) gaugeEl.style.display = '';

            const { db } = await import('./firebase-config.js');
            const { doc, onSnapshot, collection, query, where } = await import('https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js');
            const { getCollectionName, getContainerConfigAgency } = await import('./agencies-config.js');

            // AÉRIEN : jauge en Kg, SANS maximum. Affiche le poids total des colis
            // « en magasin » = livraisons aériennes au statut PARIS (reçues, pas
            // encore expédiées). getCollectionName route déjà vers livraisons_..._aerien.
            if (mode === 'aerien') {
                // Jauge = colis PHYSIQUEMENT en magasin, comptés PAR SOUS-COLIS.
                // Règle IDENTIQUE à « Voir facture » : une pièce est « en magasin »
                // si son DERNIER scan est « Mise en entrepôt » (ENTREPOT_PARIS) ou
                // « Retour entrepôt » (DEPART_VOL_RETOUR). On NE filtre PAS sur
                // containerStatus (sinon un dossier au statut inattendu serait exclu
                // de la jauge alors que ses colis sont visibles en entrepôt -> jauge
                // à zéro à tort). Poids réparti au prorata des pièces (indicateur).
                this.unsubAerienGauge = onSnapshot(
                    query(collection(db, getCollectionName("livraisons"))),
                    (snap) => {
                        let totalKg = 0, pieces = 0;
                        snap.forEach(d => {
                            const liv = d.data();
                            if (liv.isDeleted) return;
                            const labels = (liv.labels && liv.labels.length) ? liv.labels : [liv.ref];
                            const totalPieces = labels.length || 1;
                            const perPiece = (parseFloat(liv.poids) || 0) / totalPieces;
                            const hist = Array.isArray(liv.scanHistory) ? liv.scanHistory : [];
                            labels.forEach(lbl => {
                                const scans = hist.filter(s => s.scanRef === lbl).sort((a, b) => new Date(b.date) - new Date(a.date));
                                const inWarehouse = scans.length > 0 && (scans[0].type === 'ENTREPOT_PARIS' || scans[0].type === 'DEPART_VOL_RETOUR');
                                if (inWarehouse) { totalKg += perPiece; pieces++; }
                            });
                        });
                        this.updateAerienGaugeUI(totalKg, pieces);
                    },
                    (err) => console.warn("Jauge aérien :", err && err.message)
                );
                return;
            }
            // Conteneur actif : le départ décide, l'arrivée suit -> on lit la
            // config de l'agence de départ de la route (cf. getContainerConfigAgency).
            const configAgency = getContainerConfigAgency();

            onSnapshot(doc(db, "settings", `container_config_${configAgency}`), (configSnap) => {
                let activeContainer = configSnap.exists() && configSnap.data().activeContainer ? configSnap.data().activeContainer.trim().toUpperCase() : 'ATT';
                const nameEl = document.getElementById('globalActiveContainerName');
                if (nameEl) nameEl.textContent = activeContainer;

                if (activeContainer === 'ATT') return this.updateGaugeUI(0);
                
                if (this.unsubContainerGauge1) this.unsubContainerGauge1();
                if (this.unsubContainerGauge2) this.unsubContainerGauge2();
                
                let snapTransDocs = [], snapLivDocs = [];
                const updateVolume = () => {
                    let totalCBM = 0;
                    snapTransDocs.forEach(d => { totalCBM += parseFloat(d.data().volumeCBM) || 0; });
                    snapLivDocs.forEach(d => { if (d.data().conteneur !== activeContainer) totalCBM += parseFloat(d.data().volumeCBM) || 0; });
                    this.updateGaugeUI(totalCBM);
                };

                this.unsubContainerGauge1 = onSnapshot(query(collection(db, getCollectionName("transactions")), where("conteneur", "==", activeContainer), where("isDeleted", "==", false)), snap => { snapTransDocs = snap.docs; updateVolume(); });
                this.unsubContainerGauge2 = onSnapshot(query(collection(db, getCollectionName("livraisons")), where("containerStatus", "==", "PARIS")), snap => { snapLivDocs = snap.docs; updateVolume(); });
            });
        } catch (e) { console.error("Erreur initContainerGauge:", e); }
    },

    updateGaugeUI(currentCBM) {
        const maxCBM = 68;
        const percentage = Math.min(100, Math.max(0, (currentCBM / maxCBM) * 100));
        const volEl = document.getElementById('globalContainerVolume');
        const barEl = document.getElementById('globalContainerGaugeBar');
        if (volEl) volEl.textContent = `${currentCBM.toFixed(2)} / ${maxCBM} CBM`;
        if (barEl) { barEl.style.width = `${percentage}%`; barEl.style.backgroundColor = percentage < 50 ? '#10b981' : (percentage < 85 ? '#f59e0b' : '#ef4444'); }
    },

    // Jauge AÉRIEN : poids total en magasin, en Kg, sans maximum.
    updateAerienGaugeUI(totalKg, count) {
        const nameEl = document.getElementById('globalActiveContainerName');
        const volEl = document.getElementById('globalContainerVolume');
        const barEl = document.getElementById('globalContainerGaugeBar');
        if (nameEl) nameEl.textContent = `✈️ ${count} colis`;
        if (volEl) volEl.textContent = `${totalKg.toFixed(1)} kg`;
        // Pas de maximum en aérien : barre pleine en or AMT (simple indicateur visuel).
        if (barEl) { barEl.style.width = '100%'; barEl.style.backgroundColor = '#F2A312'; }
    },

    initSidebarEvents() {
        document.querySelectorAll('.sidebar-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.dataset.page;
                if (page) this.renderPage(page);
            });
        });

        document.querySelectorAll('.sidebar-category').forEach(category => {
            if (!category.querySelector('.sidebar-item.active')) category.classList.add('collapsed');
            // L'événement de clic ('toggle') sur le titre est déjà géré par utils.js (initHamburgerMenu)
            // pour éviter un conflit qui annulerait l'action instantanément (double toggle).
        });
    },

    initMobileToggle() {
        const toggle  = document.getElementById('mobileToggle');
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        const bnavMore = document.getElementById('bnav-more');

        // --- PRÉPARATION POUR LE MENU RÉDUIT (DESKTOP) ---
        // Wrappe le texte libre des liens dans un <span> pour que le CSS puisse le masquer (display:none)
        document.querySelectorAll('.sidebar-item').forEach(item => {
            let textToTooltip = '';
            Array.from(item.childNodes).forEach(node => {
                if (node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0) {
                    textToTooltip = node.textContent.trim();
                    const span = document.createElement('span');
                    span.textContent = node.textContent;
                    item.replaceChild(span, node);
                }
            });
            // Ajoute un tooltip pour identifier l'icône quand le menu est réduit
            if (textToTooltip && !item.hasAttribute('title')) {
                item.setAttribute('title', textToTooltip);
            }
        });

        const openSidebar = (e) => {
            if (e) e.stopPropagation();
            if (window.innerWidth <= 1024) {
                sidebar?.classList.add('open');
                overlay?.classList.add('show');
                document.body.style.overflow = 'hidden';
            } else {
                document.body.classList.toggle('sidebar-collapsed');
            }
        };

        const closeSidebar = () => {
            sidebar?.classList.remove('open');
            overlay?.classList.remove('show');
            document.body.style.overflow = '';
        };

        document.querySelectorAll('#mobileToggle, .mobile-toggle, .hamburger-btn').forEach(t => {
            t.addEventListener('click', openSidebar);
        });
        if (bnavMore) bnavMore.addEventListener('click', openSidebar);
        if (overlay) overlay.addEventListener('click', closeSidebar);

        document.querySelectorAll('.sidebar-item').forEach(item => {
            item.addEventListener('click', () => { if (window.innerWidth <= 1024) closeSidebar(); });
        });
    },

    initGlobalEvents() {
        // Gestion du menu déroulant utilisateur (injecté dynamiquement)
        document.addEventListener('click', (e) => {
            const userAvatar = e.target.closest('.user-avatar');
            const dropdownMenu = document.querySelector('.user-dropdown-menu');
            
            if (userAvatar) {
                e.stopPropagation();
                if (dropdownMenu) dropdownMenu.classList.toggle('active');
            } else if (dropdownMenu && !dropdownMenu.contains(e.target)) {
                dropdownMenu.classList.remove('active');
            }
        });
    },

    updateBadges() {
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
        import('./firebase-config.js').then(async cfg => {
            const { collection, query, where, getDocs } = await import('https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js');
            const { getCollectionName } = await import('./agencies-config.js');
            // Devis
            const qQuotes = query(collection(cfg.db, getCollectionName("quote_requests")), where("agency", "==", activeAgency), where("status", "==", "NOUVEAU"));
            const snapQuotes = await getDocs(qQuotes);
            const quoteBadge = document.getElementById('quoteRequestsBadge');
            if (quoteBadge) quoteBadge.textContent = snapQuotes.size;

            // RDV
            const qRdv = query(collection(cfg.db, getCollectionName("appointments")), where("agency", "==", activeAgency), where("status", "==", "en_attente"));
            const snapRdv = await getDocs(qRdv);
            const pendingBadge = document.getElementById('pendingAppointmentsBadge');
            if (pendingBadge) pendingBadge.textContent = snapRdv.size;
        });
    },

    // Badge GLOBAL "sessions non confirmées" : écouteur temps réel indépendant de
    // la page ouverte (le module Saisie/caisse.js n'est pas toujours monté).
    // S'affiche sur l'élément de menu « Confirmation » + le titre « Entrées Caisse ».
    initPendingSessionsBadge() {
        // audit_logs n'est lisible que par les admins (cf. firestore.rules).
        // Inutile d'ouvrir l'écouteur pour les autres rôles : cela générait un
        // permission-denied dans la console sans aucune utilité (ces rôles ne
        // confirment pas les sessions).
        const role = sessionStorage.getItem('userRole') || '';
        if (role !== 'admin' && role !== 'super_admin') return;
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
        import('./firebase-config.js').then(async cfg => {
            const { collection, query, where, onSnapshot } = await import('https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js');
            if (this.unsubPendingSessions) { try { this.unsubPendingSessions(); } catch (e) {} }
            // audit_logs reste une collection globale (confirmation.js l'écrit en brut, sans suffixe de route)
            const qSess = query(collection(cfg.db, "audit_logs"), where("action", "==", "VALIDATION_JOURNEE"), where("agency", "==", activeAgency));
            this.unsubPendingSessions = onSnapshot(qSess, snap => {
                // Isolation Maritime/Aérien : on ne compte que les sessions du
                // mode actif. Anciennes sessions sans modeExpedition = maritime.
                const mode = sessionStorage.getItem('shippingMode') || 'maritime';
                const count = snap.docs.filter(d => {
                    const data = d.data();
                    const sMode = (data.modeExpedition === 'aerien') ? 'aerien' : 'maritime';
                    if (sMode !== mode) return false;
                    const s = data.status;
                    return s !== "VALIDATED" && s !== "ARCHIVED";
                }).length;
                this.applyPendingSessionsBadge(count);
            }, err => console.error("Badge sessions non confirmées:", err));
        }).catch(e => console.error("initPendingSessionsBadge:", e));
    },

    applyPendingSessionsBadge(count) {
        this._pendingSessionsCount = count;
        // 1. Pastille sur l'élément de menu « Confirmation » (span statique de index.html)
        const b = document.getElementById('pendingSessionsBadge');
        if (b) { b.textContent = count; b.setAttribute('data-count', count); }
        // 2. Alerte sur le titre de section « Entrées Caisse » : attribut data-pending
        //    rendu via ::before (CSS). Un pseudo-élément n'altère PAS title.textContent,
        //    donc applyMenuConfig continue de mapper correctement la catégorie.
        document.querySelectorAll('.sidebar-category-title').forEach(title => {
            if (title.textContent.includes('Entrées Caisse')) {
                if (count > 0) title.setAttribute('data-pending', count);
                else title.removeAttribute('data-pending');
            }
        });
    },

    renderPage(page) {
        if (!this.checkPageAccess(page)) {
            // Page interdite pour ce rôle : on bascule silencieusement vers la
            // première page accessible (pas de repli forcé vers le tableau de
            // bord, qui peut lui-même être masqué pour ce rôle).
            const fallback = this.getFirstAccessiblePage();
            if (fallback && fallback !== page) { this.renderPage(fallback); return; }
            this.showNoAccessMessage();
            return;
        }

        this.currentPage = page;
        this._pageRendered = true;
        sessionStorage.setItem('globalCurrentPage', page);
        
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
        const isArrival = AGENCIES[activeAgency] && AGENCIES[activeAgency].type === 'arrival';

        const titleMap = {
            'dashboard': 'Tableau de bord', 'daily-bilan': 'Bilan du jour', 'daily-users': 'Bilan par utilisateurs',
            'invoices-list': 'Toutes les factures', 'invoice-new': 'Nouvelle facture', 'touteslesfactures': 'Factures (Ancien)',
            'appointment-new': 'Nouveau RDV', 'appointments-list': 'Tous les RDV', 'appointments-pending': 'RDV à valider', 'appointments-calendar': 'Calendrier RDV',
            'program-new': 'Nouveau programme', 'program-my': 'Mon programme', 'program-history': 'Historique programmes', 'drivers': 'Chauffeurs', 'departures-calendar': 'Calendrier départs',
            'quotes-list': 'Tous les devis', 'quote-new': 'Nouveau devis', 'quote-requests': 'Demandes reçues',
            'confection-containers': 'Confection Conteneurs', 'loading-boats': 'Bateaux départ', 'arrivals-boats': 'Bateau arrivée',
            'scan-warehouse': 'Mise en entrepôt', 'scan-container': 'Charger conteneur', 'scan-depart-vol': 'Départ vol', 'scan-classic': 'Scanner classique', 'scan-history': 'Historique scans',
            'scan-dechargement': 'Scan Déchargement', 'scan-livraison': 'Scan Mise en Livraison', 'scan-livrer': 'Scan Remise Client',
            'clients-list': 'Liste clients', 'clients-app': 'Client application', 'clients-analytics': 'Analytics clients', 'clients': 'Fichier Clients',
            'chat': 'Chat Interne', 'sms-send': 'Envoi SMS', 'sms-history': 'Historique SMS', 'notifications': 'Notifications', 'notifications-history': 'Historique notifications', 'sms': 'Campagnes SMS',
            'products-list': 'Liste produits',
            'parrainage': 'Réseau Partenaires', 'chine-dashboard': 'Tableau de Bord Asie',
            'finance-cashier': 'Caisse globale', 'finance-cheques': 'Liste des chèques', 'finance-expenses': 'Dépenses',
            'index': 'Saisie de Caisse', 'confirmation': 'Confirmation Saisies', 'history': 'Historique Opérations', 'other-income': 'Autres Entrées', 'expenses': 'Dépenses Caisse', 'bank': 'Mouvements Banque', 'audit': 'Audit Saisies',
            'livraison': 'LIVRAISON', 'livreurscan': 'Mode Livreur', 'voiture': 'Gestion Véhicules', 'magasinage': 'Magasinage', 'points': 'Points Utilisateurs',
            'admin-panel': 'Gestion des agents', 'salaire': 'Salaire & RH', 'comptejb': 'Livre de Caisse JB', 
            'settings-agency': 'Paramètres Agence', 'settings-company': 'Paramètres Entreprise', 'settings-software': 'Paramètres logiciel', 'settings-design': 'Apparence & Menus', 'settings-sms': 'Configuration SMS', 'settings-notifications': 'Configuration notifications', 'settings-menus': 'Gestion menus', 'settings-agents': 'Gestion des agents', 'settings-agencies': 'Gestion des agences', 'settings-roles': 'Rôles & Permissions', 'settings-appointments': 'Paramètres RDV', 'settings-profile': 'Mon profil',
            'stock-list': 'Stock produits',
            'balance-monthly': 'Bilan Comparatif', 'balance-12m': 'Direction 12 mois',
            'stats-boat': 'Stats bateau', 'stats-monthly': 'Stats par mois', 'stats-yearly': 'Stats par année',
            'config-invoice': 'Choix facture', 'config-label': 'Choix étiquette', 'config-container': 'Conteneur Actif', 'config-objectives': 'Objectifs', 'config-charges': 'Charges',
            'prospecting': 'Prospections', 'audit-log': 'Journal d\'activités'
        };

        // « Bateaux départ » devient « Avion départ » en mode aérien.
        if (page === 'loading-boats' && sessionStorage.getItem('shippingMode') === 'aerien') {
            titleMap['loading-boats'] = 'Avion départ';
        }
        // « Bateau arrivée » devient « Vol arrivée » en mode aérien.
        if (page === 'arrivals-boats' && sessionStorage.getItem('shippingMode') === 'aerien') {
            titleMap['arrivals-boats'] = 'Vol arrivée';
        }

        const titleEl = document.getElementById('pageTitle') || document.querySelector('.page-title');
        if (titleEl) titleEl.textContent = titleMap[page] || page;

        document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
        const activeSidebar = document.querySelector(`.sidebar-item[data-page="${page}"]`);
        if (activeSidebar) activeSidebar.classList.add('active');
        
        document.querySelectorAll('.bottom-nav-item').forEach(b => b.classList.remove('active'));
        const activeBnav = document.querySelector(`.bottom-nav-item[data-target="${page}"]`);
        if (activeBnav) activeBnav.classList.add('active');

        const container = document.getElementById('contentContainer');
        if (!container) return;
        container.innerHTML = '<div class="loading" style="padding: 50px; text-align: center;"><i class="fas fa-spinner fa-spin fa-2x"></i><br><br>Chargement de l\'interface...</div>';

        // Table de routage dynamique Unifiée
        const renderers = {
            // --- Shared ---
            'clients': () => ClientsView.render(this),
            'clients-list': () => ClientsView.render(this),
            'daily-bilan': () => DailyBilanView.render(this, container),
            'daily-users': () => DailyUsersView.render(this, container),
            'invoices-list': () => ToutesLesFacturesView.render(this, container),
            'touteslesfactures': () => ToutesLesFacturesView.render(this, container),
            'stats-boat': () => StatistiquesView.render(this, container, 'boat'),
            'stats-monthly': () => StatistiquesView.render(this, container, 'monthly'),
            'stats-yearly': () => StatistiquesView.render(this, container, 'yearly'),
            'settings-agents': () => SettingsAgentsView.render(this, container),
            'admin-panel': () => SettingsAgentsView.render(this, container),
            'settings-menus': () => SettingsRolesMenusView.render(this, container),
            'settings-roles': () => SettingsRolesMenusView.render(this, container),
            'parrainage': () => ParrainageView.render(this, container),
            'settings-profile': () => ProfilView.render(this, container),
            
            // --- Conditional / Dual (Selon l'agence) ---
            'dashboard': () => isArrival ? AbidjanDashboardView.render(this, container) : ParisDashboardView.render(this),
            'settings-software': () => isArrival ? AbidjanSettingsSoftwareView.render(this, container) : ParisSettingsSoftwareView.render(this),
            'scan-history': () => isArrival ? AbidjanScanHistoryView.render(this, container) : ParisScanHistoryView.render(this),
            'chat': () => isArrival ? AbidjanChatView.render(this, container) : ParisChatView.render(this),
            'audit-log': () => isArrival ? AbidjanAuditLogView.render(this, container) : ParisAuditLogView.render(this),
            'prospecting': () => isArrival ? AbidjanProspectingView.render(this, container) : ParisProspectingView.render(this),

            // --- Paris Spécifiques (Départ) ---
            'invoice-new': () => NouvelleFactureView.render(this),
            'invoice-aerien': () => FactureAerienView.render(this),
            'products-list': () => ProductsListView.render(this),
            'quote-new': () => NouveauDevisView.render(this),
            'appointment-new': () => NouveauRdvView.render(this),
            'appointments-list': () => TousLesRdvView.render(this, 'all'),
            'appointments-pending': () => TousLesRdvView.render(this, 'pending'),
            'appointments-calendar': () => CalendrierRdvView.render(this),
            'program-new': () => NouveauProgrammeView.render(this),
            'program-my': () => MonProgrammeView.render(this),
            'program-history': () => HistoriqueProgrammesView.render(this),
            'drivers': () => ChauffeursListView.render(this),
            'departures-calendar': () => DeparturesCalendarView.render(this),
            'quotes-list': () => TousLesDevisView.render(this),
            'quote-requests': () => DemandesDevisView.render(this),
            'confection-containers': () => ConfectionConteneursView.render(this),
            'loading-boats': () => (sessionStorage.getItem('shippingMode') === 'aerien') ? AvionsDepartView.render(this) : BateauxDepartView.render(this),
            'arrivals-boats': () => ArriveesView.render(this, container),
            'finance-caisse': () => FinanceCaisseView.render(this),
            'finance-cashier': () => FinanceCaisseView.render(this), // alias menu "Caisse globale"
            'finance-depenses': () => FinanceDepensesView.render(this),
            'finance-expenses': () => FinanceDepensesView.render(this), // alias menu "Dépenses Finance"
            'finance-cheques': () => FinanceChequesView.render(this),
            'settings-agency': () => SettingsAgencyView.render(this),
            'settings-agencies': () => SettingsAgenciesView.render(this),
            'settings-company': () => SettingsCompanyView.render(this),
            'settings-design': () => SettingsDesignView.render(this),
            'settings-appointments': () => SettingsAppointmentsView.render(this),
            'config-invoice': () => ConfigInvoiceView.render(this),
            'config-label': () => ConfigLabelView.render(this),
            'config-container': () => ConfigContainerView.render(this),
            'scan-warehouse': () => ScanWarehouseView.render(this),
            'scan-container': () => ScanContainerView.render(this),
            'scan-depart-vol': () => ScanDepartVolView.render(this),
            'scan-classic': () => ScanWarehouseView.render(this),
            'bilans-financiers': () => BilansFinanciersView.render(this),
            'balance-monthly': () => BilansFinanciersView.render(this),
            'balance-12m': () => BilansFinanciersView.render(this, '12m'),
            'notifications': () => NotificationsView.render(this),
            'notifications-history': () => NotificationsView.render(this),
            
            // Inline renderers de Paris conservés
            'clients-app': () => this.renderClientsApp(),
            'clients-analytics': () => this.renderClientsAnalytics(),
            'stock-list': () => ProductsListView.render(this), // vrai catalogue produits (base)
            'config-objectives': () => this.renderConfigObjectives(),
            'config-charges': () => this.renderConfigCharges(),
            'settings-sms': () => this.renderSettingsSms(),
            'settings-notifications': () => this.renderSettingsNotifications(),
            
            // --- Abidjan Spécifiques (Arrivée) ---
            'index': () => CaisseView.render(this, container),
            'expenses': () => ExpensesView.render(this, container),
            'magasinage': () => MagasinageView.render(this, container),
            'livraison': () => LivraisonView.render(this, container),
            'audit': () => AuditView.render(this, container),
            'history': () => HistoryView.render(this, container),
            'bank': () => BankView.render(this, container),
            'other-income': () => OtherIncomeView.render(this, container),
            'voiture': () => VoitureView.render(this, container),
            'points': () => PointsView.render(this, container),
            'comptejb': () => ComptejbView.render(this, container),
            'salaire': () => SalaireView.render(this, container),
            'confirmation': () => ConfirmationView.render(this, container),
            'scan-dechargement': () => ScanDechargementView.render(this, container),
            'scan-livraison': () => ScanLivraisonView.render(this, container),
            'scan-livrer': () => ScanLivrerView.render(this, container),
            'sms': () => SmsView.render(this, container),
            'sms-send': () => SmsView.render(this, container), // Map vers le vrai module SMS Abidjan
            'sms-history': () => SmsView.render(this, container)
        };

        if (page === 'livreurscan') {
            window.location.href = 'livreurscan.html';
            return;
        }

        const renderer = renderers[page];
        if (renderer) {
            try {
                renderer();
            } catch (err) {
                console.error("Erreur d'affichage de la page :", err);
                container.innerHTML = `<div class="loading" style="color:#ef4444;">Erreur lors du chargement du module: ${err.message}</div>`;
            }
        } else {
            container.innerHTML = `
                <div style="padding: 50px; text-align: center; color: #64748b; background: white; border-radius: 12px;">
                    <i class="fas fa-tools fa-3x" style="color: #3b82f6; margin-bottom: 20px;"></i>
                    <h2>Module en cours d'intégration</h2>
                    <p>Le module <b>${page}</b> est en cours de développement sur cette architecture.</p>
                </div>
            `;
        }
    },
    
    // --- UTILITAIRES GLOBAUX ---
    showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.style.cssText = `position: fixed; bottom: 20px; right: 20px; background: ${type === 'success' ? '#10b981' : (type==='info' ? '#3b82f6' : '#ef4444')}; color: white; padding: 12px 20px; border-radius: 8px; z-index: 9999; box-shadow: 0 4px 6px rgba(0,0,0,0.1); transition: opacity 0.3s ease;`;
        toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : (type==='info' ? 'info-circle' : 'exclamation-triangle')}"></i> ${message}`;
        document.body.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
    },
    
    formatMoneyLocal(amount, forceCfa = false) {
        const ag = sessionStorage.getItem('currentActiveAgency') || 'abidjan';
        // EUR si : agence historique 'paris' OU agence (route SaaS) dont la
        // devise configur\u00E9e est EUR (lu dans le cache config, synchrone, sans
        // d\u00E9pendance). Sinon FCFA. Le stockage interne reste FCFA partout.
        let isEur = (ag === 'paris');
        if (!isEur) {
            try {
                const cfg = JSON.parse(localStorage.getItem('amt_agencies_config') || '{}');
                if (cfg[ag] && cfg[ag].currency === 'EUR') isEur = true;
            } catch (e) { /* cache illisible : on reste en FCFA */ }
        }
        if (isEur && !forceCfa) return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount || 0).replace(/[\u202F\u00A0]/g, ' ').replace(/\s*\/\s*/g, ' ');
        return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(amount || 0).replace(/[\u202F\u00A0]/g, ' ').replace(/\s*\/\s*/g, ' ');
    },

    // Rétrocompatibilité : alias pour les modules utilisant encore l'ancienne nomenclature
    formatMoney(amount, forceCfa = false) {
        return this.formatMoneyLocal(amount, forceCfa);
    },

    // Vérifie si l'utilisateur courant a une permission "Action".
    // Modèle "Ajout de pouvoirs" (choix maintainer) :
    //  - super_admin / admin : accès total.
    //  - TOUS les autres rôles (intégrés OU personnalisés) : la permission est
    //    accordée si elle est cochée pour leur rôle dans Rôles & Menus.
    // Les contrôles historiques de chaque page restent en place comme PLANCHER :
    // on les combine en `ancienneConditionRole || app.hasPermission('id')`, donc
    // cocher une action ne fait qu'AJOUTER un pouvoir, sans jamais en retirer.
    hasPermission(permId) {
        const userRole = sessionStorage.getItem('userRole') || '';
        if (userRole === 'super_admin' || userRole === 'admin') return true;
        try {
            const perms = JSON.parse(sessionStorage.getItem('userPermissions') || '[]');
            return Array.isArray(perms) && perms.includes(permId);
        } catch (e) { return false; }
    },

    // Rôle intégré (livré avec l'app) vs rôle personnalisé créé par l'admin.
    // Sert aux actions SANS restriction historique : on garde l'accès complet
    // pour les rôles intégrés et on n'exige une permission que pour les rôles
    // personnalisés -> `app.isBuiltinRole() || app.hasPermission('id')`.
    isBuiltinRole() {
        const r = sessionStorage.getItem('userRole') || '';
        return ['super_admin', 'admin', 'agent', 'chauf', 'manager', 'spectateur', 'saisie_full'].includes(r);
    },

    // --- INLINE RENDERERS (Provenant de Paris) ---
    // Page "Application client" / "Demande client".
    // CONTRAT pour la future app AMT Client : écrire un document par compte
    // dans la collection Firestore `client_app_accounts` avec les champs :
    //   nom, telephone, statut ('Actif'|'Inactif'), derniereConnexion (date),
    //   clientLieNom (string|null), facturesAgence (number),
    //   derniereFacture (date|null), agency.
    // Dès que l'app écrira ici, cette page se remplit AUTOMATIQUEMENT.
    async renderClientsApp() {
        const c = document.getElementById('contentContainer');
        c.innerHTML = `<div class="loading"><i class="fas fa-spinner fa-spin"></i> Chargement des comptes clients…</div>`;
        try {
            const { db } = await import('./firebase-config.js');
            const { collection, getDocs } = await import('https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js');

            let rows = [];
            try {
                const snap = await getDocs(collection(db, 'client_app_accounts'));
                rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            } catch (_) { rows = []; } // collection absente tant que l'app n'existe pas

            this._clientAppRows = rows;
            const fmtD = (v) => {
                if (!v) return '—';
                const d = v && typeof v.toDate === 'function' ? v.toDate() : new Date(v);
                return isNaN(d) ? String(v) : d.toLocaleString('fr-FR');
            };

            const total = rows.length;
            const actifs = rows.filter(r => r.statut === 'Actif').length;
            const lies = rows.filter(r => r.clientLieNom).length;
            const avecFactures = rows.filter(r => Number(r.facturesAgence) > 0).length;

            const renderTable = (list) => {
                if (!list.length) {
                    return `<tr><td colspan="8" style="text-align:center;color:#94a3b8;padding:34px;">
                        ${total === 0
                            ? "📱 L'application client AMT n'est pas encore déployée.<br><span style='font-size:12px;'>Cette page se remplira automatiquement dès que des clients utiliseront l'app.</span>"
                            : "Aucun résultat pour cette recherche."}
                    </td></tr>`;
                }
                return list.map(r => `
                    <tr>
                        <td><b>${r.nom || '—'}</b></td>
                        <td>${r.telephone || '—'}</td>
                        <td><span class="badge" style="background:${r.statut === 'Actif' ? '#dcfce7' : '#fee2e2'};color:${r.statut === 'Actif' ? '#166534' : '#991b1b'};padding:3px 9px;border-radius:999px;font-size:11px;font-weight:700;">${r.statut || 'Inconnu'}</span></td>
                        <td>${fmtD(r.derniereConnexion)}</td>
                        <td>${r.clientLieNom ? r.clientLieNom : '<span style="color:#94a3b8;">Non lié</span>'}</td>
                        <td>${Number(r.facturesAgence) || 0}</td>
                        <td>${fmtD(r.derniereFacture)}</td>
                        <td><button class="btn btn-secondary btn-sm" data-go-clients style="font-size:12px;">Voir le client</button></td>
                    </tr>`).join('');
            };

            c.innerHTML = `
            <div class="form-card">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
                    <div>
                        <h3 style="margin:0;">📱 Demande client</h3>
                        <p style="margin:4px 0 0;color:#64748b;font-size:13px;">Clients ayant téléchargé l'application AMT Client</p>
                    </div>
                    <button class="btn btn-secondary" id="caRefresh"><i class="fas fa-sync"></i></button>
                </div>

                <div class="stats-grid" style="margin:18px 0;">
                    <div class="stat-card"><div class="stat-value">${total}</div><div class="stat-label">Comptes au total</div></div>
                    <div class="stat-card"><div class="stat-value">${actifs}</div><div class="stat-label">Comptes actifs</div></div>
                    <div class="stat-card"><div class="stat-value">${lies}</div><div class="stat-label">Liés à un client</div></div>
                    <div class="stat-card"><div class="stat-value">${avecFactures}</div><div class="stat-label">Avec factures</div></div>
                </div>

                <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
                    <input id="caSearch" class="form-input" placeholder="🔍 Nom, téléphone, expéditeur…" style="max-width:340px;flex:1;">
                    <button class="btn btn-secondary" id="caExport"><i class="fas fa-file-excel"></i> Exporter vers Excel</button>
                </div>

                <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead><tr>
                        <th>Compte client</th><th>Téléphone</th><th>Statut</th>
                        <th>Dernière connexion</th><th>Client lié</th><th>Factures agence</th>
                        <th>Dernière facture</th><th>Action</th>
                    </tr></thead>
                    <tbody id="caBody">${renderTable(rows)}</tbody>
                </table>
                </div>
            </div>`;

            document.getElementById('caRefresh').onclick = () => this.renderClientsApp();
            document.getElementById('caSearch').oninput = (e) => {
                const q = e.target.value.toLowerCase().trim();
                const f = !q ? rows : rows.filter(r =>
                    `${r.nom || ''} ${r.telephone || ''} ${r.clientLieNom || ''}`.toLowerCase().includes(q));
                document.getElementById('caBody').innerHTML = renderTable(f);
                c.querySelectorAll('[data-go-clients]').forEach(b => b.onclick = goClients);
            };
            const goClients = () => { document.querySelector('[data-page="clients-list"]')?.click(); };
            c.querySelectorAll('[data-go-clients]').forEach(b => b.onclick = goClients);
            document.getElementById('caExport').onclick = () => {
                if (!rows.length) { this.showToast("Aucune donnée à exporter pour l'instant.", "info"); return; }
                const head = ['Compte', 'Téléphone', 'Statut', 'Dernière connexion', 'Client lié', 'Factures', 'Dernière facture'];
                const lines = rows.map(r => [r.nom, r.telephone, r.statut, fmtD(r.derniereConnexion), r.clientLieNom || 'Non lié', Number(r.facturesAgence) || 0, fmtD(r.derniereFacture)]
                    .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';'));
                const blob = new Blob(['﻿' + [head.join(';'), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `clients-app-${new Date().toISOString().slice(0, 10)}.csv`;
                a.click();
            };
        } catch (e) {
            c.innerHTML = `<div style="padding:40px;text-align:center;color:#ef4444;background:white;border-radius:12px;">
                <i class="fas fa-exclamation-triangle fa-2x" style="margin-bottom:12px;"></i>
                <p>Erreur de chargement : ${e.message}</p></div>`;
        }
    },
    async renderClientsAnalytics() {
        const c = document.getElementById('contentContainer');
        c.innerHTML = `<div class="loading"><i class="fas fa-spinner fa-spin"></i> Calcul des analyses clients…</div>`;
        try {
            const { db } = await import('./firebase-config.js');
            const { collection, query, where, getDocs } = await import('https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js');
            const { getCollectionName } = await import('./agencies-config.js');
            const agency = sessionStorage.getItem('currentActiveAgency') || 'abidjan';

            // Mêmes collections / filtrage que le module Clients (source unique).
            const [csnap, lsnap] = await Promise.all([
                getDocs(query(collection(db, getCollectionName('clients')), where('agency', '==', agency))),
                getDocs(query(collection(db, getCollectionName('livraisons')), where('agency', '==', agency))),
            ]);

            const nbClients = csnap.size;
            const livs = lsnap.docs.map(d => d.data()).filter(l => l && l.isDeleted !== true);
            const nbColis = livs.length;
            const caTotal = livs.reduce((s, liv) =>
                s + (parseFloat(String(liv.prixOriginal || liv.montant || '0').replace(/[^\d]/g, '')) || 0), 0);

            c.innerHTML = `
            <div class="form-card">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                    <h3 style="margin:0;">Analytique clients <span style="font-size:12px;color:#64748b;font-weight:600;">· agence ${agency}</span></h3>
                    <button class="btn btn-secondary" id="btnReloadAnalytics"><i class="fas fa-sync"></i> Actualiser</button>
                </div>
                <div class="stats-grid" style="margin-top:18px;">
                    <div class="stat-card"><div class="stat-value">${this.formatMoneyLocal(caTotal)}</div><div class="stat-label">Chiffre d'affaires (colis)</div></div>
                    <div class="stat-card"><div class="stat-value">${nbClients.toLocaleString('fr-FR')}</div><div class="stat-label">Clients enregistrés</div></div>
                    <div class="stat-card"><div class="stat-value">${nbColis.toLocaleString('fr-FR')}</div><div class="stat-label">Colis traités</div></div>
                </div>
                <p style="margin-top:14px;color:#94a3b8;font-size:12px;">Chiffres calculés en direct depuis la base (collections clients & livraisons).</p>
            </div>`;
            const btn = document.getElementById('btnReloadAnalytics');
            if (btn) btn.onclick = () => this.renderClientsAnalytics();
        } catch (e) {
            c.innerHTML = `<div style="padding:40px;text-align:center;color:#ef4444;background:white;border-radius:12px;">
                <i class="fas fa-exclamation-triangle fa-2x" style="margin-bottom:12px;"></i>
                <p>Impossible de charger les analyses : ${e.message}</p></div>`;
        }
    },
    renderStockList() {
        document.getElementById('contentContainer').innerHTML = `
            <div class="form-card">
                <h3>État du stock</h3>
                <table class="data-table">
                    <thead><tr><th>Produit</th><th>Catégorie</th><th>Stock actuel</th><th>Prix unitaire</th></tr></thead>
                    <tbody>
                        <tr><td>Carton standard</td><td>Emballage</td><td>150</td><td>15.00</td></tr>
                        <tr><td>Malle</td><td>Contenant</td><td>25</td><td>45.00</td></tr>
                    </tbody>
                </table>
            </div>
        `;
    },
    renderSettingsSms() { this.renderSettingsForm('Configuration SMS', { provider: 'API SMS', apiKey: '••••••••', sender: 'AMT' }); },
    renderSettingsNotifications() { this.renderSettingsForm('Notifications', { emailAlerts: true, smsAlerts: true, pushEnabled: true }); },
    renderConfigObjectives() { this.renderSettingsForm('Objectifs', { monthlyTarget: 50000, quarterlyTarget: 150000, yearlyTarget: 600000 }); },
    renderConfigCharges() { this.renderSettingsForm('Charges', { rent: 1500, utilities: 250, salaries: 8000, other: 500 }); },
    renderSettingsForm(title, fields) {
        document.getElementById('contentContainer').innerHTML = `
            <div class="form-card">
                <h3>${title}</h3>
                <div class="form-grid">
                    ${Object.entries(fields).map(([key, val]) => `<div class="form-group"><label>${key}</label><input type="text" value="${val}"></div>`).join('')}
                </div>
                <div style="margin-top: 20px;"><button class="btn btn-primary" onclick="window.app.showToast('Enregistré')">Enregistrer</button></div>
            </div>
        `;
    },

    // --- IMPRESSION D'ÉTIQUETTES GLOBAUX ---
    async printLabels(data) {
        const format = localStorage.getItem('amt_label_format') || 'A5';
        const model = localStorage.getItem('amt_label_model') || 'classic';
        const colorScheme = localStorage.getItem('amt_label_color') || 'default';
        const headerColor = localStorage.getItem('amt_label_header_color') || '#000000';
        // Étiquette aérienne : couleur de bande propre (Choix Étiquette, mode Aérien).
        // data.headerColor permet l'aperçu en direct avant enregistrement.
        const aerienHeaderColor = data.headerColor || localStorage.getItem('amt_label_aerien_header_color') || '#1A3553';
        
        const dimensions = { A5: { width: 210, height: 148 }, A6: { width: 148, height: 105 } };
        const dim = dimensions[format] || dimensions.A5;
        const widthMm = dim.width;
        const heightMm = dim.height;
        const pageSizeCss = `${widthMm}mm ${heightMm}mm`;
        
        const colors = {
            default: { border: '#000', text: '#000' },
            blue: { border: '#1e40af', text: '#1e3a8a' },
            green: { border: '#065f46', text: '#064e3b' }
        };
        const theme = colors[colorScheme] || colors.default;
        
        const loadingToast = document.createElement('div');
        loadingToast.style.cssText = 'position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #3b82f6; color: white; padding: 12px 20px; border-radius: 8px; z-index: 9999; box-shadow: 0 4px 6px rgba(0,0,0,0.1); font-weight: bold;';
        loadingToast.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Génération des étiquettes en cours...';
        document.body.appendChild(loadingToast);

        const generateQR = (text) => {
            return new Promise(resolve => {
                const div = document.createElement('div');
                new QRCode(div, { text: text, width: 300, height: 300, correctLevel: QRCode.CorrectLevel.H });
                setTimeout(() => {
                    const canvas = div.querySelector('canvas');
                    if (canvas) resolve(canvas.toDataURL('image/png'));
                    else {
                        const img = div.querySelector('img');
                        resolve(img ? img.src : '');
                    }
                }, 150);
            });
        };
        
        let labelsHtml = '';
        for (const label of data.labels) {
            const qrDataUrl = await generateQR(label.sousRef);
            if (data.isAerien) labelsHtml += this.renderAerienLabel(widthMm, heightMm, qrDataUrl, data, label, aerienHeaderColor);
            else if (model === 'compact') labelsHtml += this.renderCompactLabel(widthMm, heightMm, qrDataUrl, data, label, theme, headerColor);
            else if (model === 'premium') labelsHtml += this.renderPremiumLabel(widthMm, heightMm, qrDataUrl, data, label, theme, headerColor);
            else labelsHtml += this.renderClassicLabel(widthMm, heightMm, qrDataUrl, data, label, theme, headerColor);
        }
        
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '-10000px';
        iframe.style.bottom = '-10000px';
        document.body.appendChild(iframe);
        
        const doc = iframe.contentWindow.document;
        doc.open();
        doc.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    @page { size: ${pageSizeCss} landscape; margin: 0; }
                    body { margin: 0; padding: 0; font-family: 'Arial', sans-serif; background: #fff; }
                    .label { box-sizing: border-box; page-break-after: always; display: flex; flex-direction: column; overflow: hidden; }
                    .label:last-child { page-break-after: auto; }
                </style>
            </head>
            <body>${labelsHtml}</body>
            </html>
        `);
        doc.close();
        
        loadingToast.remove();
        iframe.onload = () => { setTimeout(() => { iframe.contentWindow.focus(); iframe.contentWindow.print(); setTimeout(() => document.body.removeChild(iframe), 2000); }, 500); };
    },
    
    renderClassicLabel(widthMm, heightMm, qrDataUrl, data, label, theme, headerColor) {
        const isA5 = widthMm === 210;
        const fontSize = isA5 ? '11pt' : '9pt';
        const titleFont = isA5 ? '14pt' : '11pt';
        const refFont = isA5 ? '28pt' : '22pt';
        
        return `
            <div class="label" style="width: ${widthMm}mm; height: ${heightMm}mm;">
                <div style="height: 100%; display: flex; flex-direction: column; padding: 6mm;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid ${theme.border}; padding-bottom: 3mm; margin-bottom: 4mm;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="background: ${headerColor}; padding: 2px 4px; border-radius: 6px; display: flex; align-items: center; justify-content: center;">
                                <img src="LOGOAMT.png" style="height: ${isA5 ? '8mm' : '6mm'}; object-fit: contain;" alt="Logo" onerror="this.style.display='none'"/>
                            </div>
                            <div>
                                <div style="font-size: ${fontSize}; font-weight: bold;">AMT TRANSIT CI FRET</div>
                                <div style="font-size: ${isA5 ? '9pt' : '7pt'};">81 AV. ARISTIDE BRIAND - 0180893370</div>
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: ${fontSize};"><strong>DATE</strong> ${new Date().toLocaleDateString()}</div>
                            <div style="font-size: ${fontSize};"><strong>HEURE</strong> ${new Date().toLocaleTimeString()}</div>
                        </div>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5mm;">
                        <div style="font-size: ${titleFont}; font-weight: bold;">${label.sousRef}</div>
                        <img src="${qrDataUrl}" style="width: ${isA5 ? '45mm' : '35mm'}; height: ${isA5 ? '45mm' : '35mm'};" />
                    </div>
                    <div style="margin-bottom: 5mm;">
                        <div style="font-size: ${titleFont}; font-weight: bold; margin-bottom: 2mm;">DESTINATAIRE</div>
                        <div style="font-size: ${titleFont}; font-weight: bold;">${data.destName}</div>
                        <div style="font-size: ${fontSize};">${data.destPhone || ''}</div>
                    </div>
                    <div style="margin-bottom: 5mm;">
                        <div style="font-size: ${titleFont}; font-weight: bold; margin-bottom: 2mm;">EXPEDITEUR</div>
                        <div style="font-size: ${titleFont}; font-weight: bold;">${data.expName}</div>
                        <div style="font-size: ${fontSize};">${data.expAddress?.replace(/\n/g, '<br>') || ''}</div>
                    </div>
                    <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; width: 100%;">
                        <div style="font-size: ${refFont}; font-weight: 900; letter-spacing: 2px; word-break: break-all;">${data.ref}</div>
                        <div style="font-size: ${fontSize}; font-weight: bold; margin-top: 2mm; text-transform: uppercase;">${label.desc}</div>
                    </div>
                </div>
            </div>
        `;
    },
    
    renderCompactLabel(widthMm, heightMm, qrDataUrl, data, label, theme, headerColor) {
        const isA5 = widthMm === 210;
        return `
            <div class="label" style="width: ${widthMm}mm; height: ${heightMm}mm;">
                <div style="height: 100%; display: flex; flex-direction: column; padding: 5mm;">
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid ${theme.border}; padding-bottom: 2mm; margin-bottom: 3mm;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="background: ${headerColor}; padding: 2px 4px; border-radius: 4px; display: flex; align-items: center; justify-content: center;">
                                <img src="LOGOAMT.png" style="height: ${isA5 ? '6mm' : '4mm'}; object-fit: contain;" alt="Logo" onerror="this.style.display='none'"/>
                            </div>
                            <div style="font-size: ${isA5 ? '9pt' : '7pt'}; font-weight: bold;">AMT TRANSIT CI FRET<br><span style="font-weight: normal; font-size: ${isA5 ? '8pt' : '6pt'};">81 AV. ARISTIDE BRIAND - 0180893370</span></div>
                        </div>
                        <div style="font-size: ${isA5 ? '8pt' : '7pt'}; text-align: right;">${new Date().toLocaleDateString()}<br>${new Date().toLocaleTimeString()}</div>
                    </div>
                    <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                        <div style="font-size: ${isA5 ? '12pt' : '10pt'}; font-weight: bold; margin-bottom: 3mm;">${label.sousRef}</div>
                        <img src="${qrDataUrl}" style="width: ${isA5 ? '65mm' : '50mm'}; height: ${isA5 ? '65mm' : '50mm'};" />
                        <div style="margin-top: 4mm; font-size: ${isA5 ? '16pt' : '14pt'}; font-weight: 900; text-align: center; word-break: break-all; width: 100%;">${data.ref}</div>
                        <div style="font-size: ${isA5 ? '10pt' : '8pt'}; font-weight: bold; margin-top: 1.5mm; text-transform: uppercase; color: #475569;">${label.desc}</div>
                    </div>
                    <div style="display: flex; justify-content: space-between; border-top: 2px solid ${theme.border}; padding-top: 2mm; margin-top: 3mm; font-size: ${isA5 ? '9pt' : '7pt'};">
                        <div><strong>Exp:</strong> ${data.expName?.split(' ')[0] || ''}</div>
                        <div><strong>Dest:</strong> ${data.destName?.split(' ')[0] || ''}</div>
                    </div>
                </div>
            </div>
        `;
    },
    
    renderPremiumLabel(widthMm, heightMm, qrDataUrl, data, label, theme, headerColor) {
        const isA5 = widthMm === 210;
        return `
            <div class="label" style="width: ${widthMm}mm; height: ${heightMm}mm;">
                <div style="height: 100%; display: flex; flex-direction: column;">
                    <div style="background: ${headerColor}; color: white; padding: 3mm 4mm; display: flex; justify-content: center; align-items: center; gap: 10px;">
                        <div style="background: ${headerColor}; padding: 2px 4px; border-radius: 6px; display: flex; align-items: center; justify-content: center;">
                            <img src="LOGOAMT.png" style="height: ${isA5 ? '8mm' : '6mm'}; object-fit: contain;" alt="Logo" onerror="this.style.display='none'"/>
                        </div>
                        <span style="font-size: ${isA5 ? '12pt' : '10pt'}; font-weight: bold; margin: 0;">AMT TRANSIT CI FRET INTERNATIONAL</span>
                    </div>
                    <div style="padding: 5mm; flex: 1; display: flex; flex-direction: column;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 5mm;">
                            <div>
                                <div style="font-size: ${isA5 ? '9pt' : '8pt'};">81 AVENUE ARISTIDE BRIAND, 93240 STAINS</div>
                                <div style="font-size: ${isA5 ? '9pt' : '8pt'};">TEL: 01 80 89 33 70</div>
                            </div>
                            <div style="text-align: right; font-size: ${isA5 ? '8pt' : '7pt'};">${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}</div>
                        </div>
                        <div style="display: flex; gap: 5mm; flex: 1;">
                            <div style="flex: 1; display: flex; flex-direction: column; justify-content: center;">
                                <div style="margin-bottom: 3mm;">
                                    <div style="font-size: ${isA5 ? '10pt' : '9pt'}; font-weight: bold;">📤 EXPÉDITEUR</div>
                                    <div style="font-size: ${isA5 ? '12pt' : '10pt'}; font-weight: bold;">${data.expName}</div>
                                    <div style="font-size: ${isA5 ? '9pt' : '8pt'};">${data.expAddress?.replace(/\n/g, '<br>') || ''}</div>
                                </div>
                                <div>
                                    <div style="font-size: ${isA5 ? '10pt' : '9pt'}; font-weight: bold;">📥 DESTINATAIRE</div>
                                    <div style="font-size: ${isA5 ? '12pt' : '10pt'}; font-weight: bold;">${data.destName}</div>
                                    <div style="font-size: ${isA5 ? '9pt' : '8pt'};">TEL: ${data.destPhone || ''}</div>
                                    <div style="font-size: ${isA5 ? '9pt' : '8pt'};">${data.destAddress || ''}</div>
                                </div>
                            </div>
                            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center;">
                                <img src="${qrDataUrl}" style="width: ${isA5 ? '50mm' : '40mm'}; height: ${isA5 ? '50mm' : '40mm'};" />
                                <span style="font-size: ${isA5 ? '8pt' : '7pt'}; font-weight: bold; margin-top: 2mm;">${label.sousRef}</span>
                            </div>
                        </div>
                        <div style="text-align: center; margin-top: 4mm; padding-top: 3mm; border-top: 2px solid ${theme.border}; width: 100%;">
                            <div style="font-size: ${isA5 ? '24pt' : '16pt'}; font-weight: 900; letter-spacing: 1px; word-break: break-all;">${data.ref}</div>
                            <div style="font-size: ${isA5 ? '10pt' : '8pt'}; font-weight: bold; margin-top: 1.5mm; text-transform: uppercase; color: #475569;">${label.desc}</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    renderAerienLabel(widthMm, heightMm, qrDataUrl, data, label, headerColor = '#1A3553') {
        const isA5 = widthMm === 210;
        const fontSize = isA5 ? '11pt' : '9pt';
        const titleFont = isA5 ? '14pt' : '11pt';
        const refFont = isA5 ? '26pt' : '20pt';
        const stripe = `repeating-linear-gradient(45deg, #E51F21 0, #E51F21 8px, #ffffff 8px, #ffffff 16px, ${headerColor} 16px, ${headerColor} 24px, #ffffff 24px, #ffffff 32px)`;
        const poidsTxt = (label.poids && label.poids > 0) ? (Number(label.poids).toFixed(1) + ' kg') : '—';
        return `
            <div class="label" style="width: ${widthMm}mm; height: ${heightMm}mm; background: ${stripe}; padding: 3mm;">
                <div style="background: #fff; height: 100%; display: flex; flex-direction: column; padding: 4mm; box-sizing: border-box;">
                    <div style="display: flex; justify-content: space-between; align-items: center; background: ${headerColor}; color: #fff; border-radius: 8px; padding: 2mm 3mm; margin-bottom: 3mm;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <img src="LOGOAMT.png" style="height: ${isA5 ? '9mm' : '6mm'}; object-fit: contain; background: #fff; border-radius: 4px; padding: 2px;" alt="Logo" onerror="this.style.display='none'"/>
                            <div>
                                <div style="font-size: ${fontSize}; font-weight: bold;">AMT TRANSIT CI FRET</div>
                                <div style="font-size: ${isA5 ? '8pt' : '6pt'};">81 AV. ARISTIDE BRIAND - 0180893370</div>
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <div style="background: #F2A312; color: #1A3553; font-weight: 900; font-size: ${isA5 ? '13pt' : '10pt'}; padding: 2px 10px; border-radius: 20px; letter-spacing: 1px;">✈ PAR AVION</div>
                            <div style="font-size: ${isA5 ? '7pt' : '6pt'}; margin-top: 1mm; letter-spacing: 1px;">BY AIR · AÉRIEN</div>
                        </div>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 3mm;">
                        <div style="flex: 1;">
                            <div style="font-size: ${titleFont}; font-weight: bold; color: #1A3553;">${label.sousRef}</div>
                            <div style="margin-top: 3mm;">
                                <div style="font-size: ${isA5 ? '9pt' : '7pt'}; font-weight: bold; color: #94a3b8; letter-spacing: 1px;">DESTINATAIRE</div>
                                <div style="font-size: ${titleFont}; font-weight: bold;">${data.destName}</div>
                                <div style="font-size: ${fontSize};">${data.destPhone || ''}</div>
                            </div>
                            <div style="margin-top: 2mm;">
                                <div style="font-size: ${isA5 ? '9pt' : '7pt'}; font-weight: bold; color: #94a3b8; letter-spacing: 1px;">EXPÉDITEUR</div>
                                <div style="font-size: ${fontSize}; font-weight: bold;">${data.expName}</div>
                            </div>
                        </div>
                        <div style="text-align: center;">
                            <img src="${qrDataUrl}" style="width: ${isA5 ? '42mm' : '33mm'}; height: ${isA5 ? '42mm' : '33mm'};" />
                            <div style="margin-top: 1.5mm; background: #E51F21; color: #fff; font-weight: 900; font-size: ${isA5 ? '14pt' : '11pt'}; padding: 2px 6px; border-radius: 8px;">⚖ ${poidsTxt}</div>
                        </div>
                    </div>
                    <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; width: 100%;">
                        <div style="font-size: ${refFont}; font-weight: 900; letter-spacing: 2px; word-break: break-all; color: #1A3553;">${data.ref}</div>
                        <div style="font-size: ${fontSize}; font-weight: bold; margin-top: 1mm; text-transform: uppercase; color: #475569;">${label.desc}</div>
                    </div>
                </div>
            </div>
        `;
    }
};

// Démarrage sécurisé : si le DOM est déjà chargé
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => app.init());
} else {
    app.init();
}