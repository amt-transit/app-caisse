// import { DashboardView } from './views/dashboard.js'; // Remplacé par la version dynamique
import { NouvelleFactureView } from './views/nouvellefacture.js';
import { ClientsListView } from './views/clients-list.js';
import { ProductsListView } from './views/products-list.js';
import { ToutesLesFacturesView } from './views/touteslesfactures.js';
import { NouveauDevisView } from './views/nouveaudevis.js';
import { DailyBilanView } from './views/daily-bilan.js';
import { DailyUsersView } from './views/daily-users.js';
import { NouveauRdvView } from './views/nouveaurdv.js';
import { TousLesRdvView } from './views/touslesrdv.js';
import { CalendrierRdvView } from './views/calendrierrdv.js';
import { NouveauProgrammeView } from './views/nouveauprogramme.js';
import { MonProgrammeView } from './views/monprogramme.js';
import { HistoriqueProgrammesView } from './views/historique-programmes.js';
import { ChauffeursListView } from './views/chauffeurs-list.js';
import { DeparturesCalendarView } from './views/departures-calendar.js';
import { TousLesDevisView } from './views/touslesdevis.js';
import { DemandesDevisView } from './views/demandesdevis.js';
import { ConfectionConteneursView } from './views/confection-conteneurs.js';
import { BateauxDepartView } from './views/bateaux-depart.js';
import { ScanHistoryView } from './views/scan-history.js';
import { FinanceCaisseView } from './views/finance-caisse.js';
import { FinanceDepensesView } from './views/finance-depenses.js';
import { FinanceChequesView } from './views/finance-cheques.js';
import { SettingsAgencyView } from './views/settings-agency.js';
import { SettingsAgentsView } from './views/settings-agents.js';
import { SettingsCompanyView } from './views/settings-company.js';
import { SettingsMenusView } from './views/settings-menus.js';
import { SettingsAppointmentsView } from './views/settings-appointments.js';
import { ConfigInvoiceView } from './views/config-invoice.js';
import { ConfigLabelView } from './views/config-label.js';
import { ConfigContainerView } from './views/config-container.js';
import { ScanWarehouseView } from './views/scan-warehouse.js';
import { ScanContainerView } from './views/scan-container.js';
import { BilansFinanciersView } from './views/bilans-financiers.js';
import { StatistiquesView } from './views/statistiques.js';
import { AppModal } from './utils/app-modal.js';
import { ChatView } from './views/chat.js';
import { NotificationsView } from './views/notifications.js';

// Configuration de l'application Paris
const app = {
    currentPage: 'dashboard',
    user: { name: 'Agent Paris', role: 'agent' },
    
    allowedMenus: null, // Permet de stocker les accès
    pageToMenuMap: {
        'dashboard': 'main',
        'daily-bilan': 'bilan', 'daily-users': 'bilan',
        'invoices-list': 'factures', 'invoice-new': 'factures',
        'appointment-new': 'rdv', 'appointments-list': 'rdv', 'appointments-pending': 'rdv', 'appointments-calendar': 'rdv',
        'program-new': 'operations', 'program-my': 'operations', 'program-history': 'operations', 'drivers': 'operations', 'departures-calendar': 'operations',
        'quotes-list': 'devis', 'quote-new': 'devis', 'quote-requests': 'devis',
        'confection-containers': 'chargement', 'loading-boats': 'chargement',
        'scan-warehouse': 'scan', 'scan-container': 'scan', 'scan-classic': 'scan', 'scan-history': 'scan',
        'clients-list': 'clients', 'clients-app': 'clients', 'clients-analytics': 'clients',
        'chat': 'comms', 'sms-send': 'comms', 'sms-history': 'comms', 'notifications': 'comms', 'notifications-history': 'comms',
        'products-list': 'produits',
        'finance-cashier': 'finance', 'finance-cheques': 'finance', 'finance-expenses': 'finance',
        'stock-list': 'stock',
        'balance-monthly': 'bilans-financiers', 'balance-12m': 'bilans-financiers',
        'stats-boat': 'statistique', 'stats-monthly': 'statistique', 'stats-yearly': 'statistique',
        'settings-agency': 'settings', 'settings-company': 'settings', 'settings-software': 'settings', 'settings-sms': 'settings', 'settings-notifications': 'settings', 'settings-menus': 'settings', 'settings-agents': 'settings', 'settings-appointments': 'settings', 'settings-profile': 'settings',
        'config-invoice': 'configuration', 'config-label': 'configuration', 'config-container': 'configuration', 'config-objectives': 'configuration', 'config-charges': 'configuration',
        'prospecting': 'prospecting',
        'audit-log': 'audit-log'
    },

    init() {
        // Expose l'objet app à l'objet global Window AVANT de rendre la page
        window.app = this;
        // Initialisation du système de modales custom
        window.AppModal = AppModal;
        window.AppModal.init();
        
        this.loadMenuConfig(); // Charge la configuration et applique les accès aux menus
        this.initContainerGauge(); // Initialise la jauge de chargement globale
        
        const savedPage = sessionStorage.getItem('parisCurrentPage') || 'dashboard';
        this.renderPage(savedPage);
        
        this.initSidebarEvents();
        this.initMobileToggle();
        this.initGlobalEvents();
        this.updateBadges();
        this.loadUserProfile();
    },

    async loadMenuConfig() {
        try {
            const { db } = await import('../../../firebase-config.js');
            const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js');
            const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
            const docSnap = await getDoc(doc(db, "settings", `menus_${activeAgency}`));
            
            if (docSnap.exists()) {
                this.applyMenuConfig(docSnap.data());
            }
        } catch(e) {
            console.error("Erreur chargement configuration des menus:", e);
        }
    },

    applyMenuConfig(config) {
        const userRole = sessionStorage.getItem('userRole') || 'agent';
        let baseRole = 'agent';
        if (userRole.includes('chauf')) baseRole = 'chauf';
        if (userRole.includes('manager') || userRole.includes('direction')) baseRole = 'manager';
        
        // Les Admins et Super Admins ont accès à tout, sinon on regarde la liste des accès
        const isSuperUser = userRole === 'super_admin' || userRole === 'admin';
        const allowedMenus = isSuperUser ? config.order : (config.roles[baseRole] || []);
        
        this.allowedMenus = allowedMenus; // On stocke la liste en mémoire pour sécuriser l'application

        const navContainer = document.querySelector('.sidebar-nav');
        if (!navContainer) return;

        const sections = Array.from(navContainer.querySelectorAll('.sidebar-category'));
        
        // Mapping entre les titres affichés en HTML et les clés en base de données
        const titleToKey = {
            'Dashboard': 'main',
            'Bilan journalier': 'bilan',
            "Factures d'envoi": 'factures',
            'Rendez-vous': 'rdv',
            'Les Programmes': 'operations',
            'Devis': 'devis',
            'Chargement': 'chargement',
            'Scan': 'scan',
            'Clients': 'clients',
            'Communication': 'comms',
            'PRODUITS': 'produits',
            'Finance': 'finance',
            'Colis reçus': 'colis-recus',
            'Stock': 'stock',
            'Bilans financiers': 'bilans-financiers',
            'Statistique': 'statistique',
            'Paramètres': 'settings',
            'Configuration': 'configuration',
            'Prospect': 'prospecting',
            'Audit Log': 'audit-log'
        };

        // Détacher les sections du DOM pour les trier
        sections.forEach(sec => sec.remove());

        // Réinsérer dans l'ordre défini par Firestore
        config.order.forEach(key => {
            const section = sections.find(sec => {
                const titleEl = sec.querySelector('.sidebar-category-title');
                return titleEl && titleToKey[titleEl.textContent.trim()] === key;
            });
            
            if (section) {
                if (allowedMenus.includes(key)) {
                    section.style.display = '';
                    navContainer.appendChild(section);
                } else {
                    section.style.display = 'none';
                    navContainer.appendChild(section);
                }
            }
        });
        
        // Assurer que les éventuelles sections orphelines sont gérées (par exemple un nouveau menu)
        sections.forEach(sec => {
            if (!sec.parentNode) {
                sec.style.display = isSuperUser ? '' : 'none';
                navContainer.appendChild(sec);
            }
        });

        // Si l'utilisateur se trouve sur une page qu'il n'a plus le droit de voir, on l'expulse
        if (this.currentPage && !this.checkPageAccess(this.currentPage)) {
            this.renderPage('dashboard');
        }
    },

    checkPageAccess(page) {
        // Si les droits ne sont pas encore chargés, on laisse passer (temporairement)
        if (!this.allowedMenus) return true;
        
        const requiredMenu = this.pageToMenuMap[page];
        
        // S'il y a un menu requis pour cette page et qu'il n'est pas dans la liste des menus autorisés
        if (requiredMenu && !this.allowedMenus.includes(requiredMenu)) {
            return false;
        }
        return true;
    },

    async initContainerGauge() {
        try {
            const { db } = await import('../../../firebase-config.js');
            const { doc, onSnapshot, collection, query, where } = await import('https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js');
            const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';

            onSnapshot(doc(db, "settings", `container_config_${activeAgency}`), (configSnap) => {
                let activeContainer = 'ATT';
                if (configSnap.exists() && configSnap.data().activeContainer) {
                    activeContainer = configSnap.data().activeContainer.trim().toUpperCase();
                }
                const nameEl = document.getElementById('globalActiveContainerName');
                if (nameEl) nameEl.textContent = activeContainer;

                if (activeContainer === 'ATT') return this.updateGaugeUI(0);

                if (this.unsubContainerGauge1) this.unsubContainerGauge1();
                if (this.unsubContainerGauge2) this.unsubContainerGauge2();
                
                let snapTransDocs = [];
                let snapLivDocs = [];

                const updateVolume = () => {
                    let totalCBM = 0;
                    
                    // 1. Volume basé sur les factures (transactions) du conteneur actif
                    snapTransDocs.forEach(d => { totalCBM += parseFloat(d.data().volumeCBM) || 0; });
                    
                    // 2. Ajout du volume des reliquats (colis toujours à Paris mais facturés sur d'anciens conteneurs)
                    snapLivDocs.forEach(d => {
                        if (d.data().conteneur !== activeContainer) {
                            totalCBM += parseFloat(d.data().volumeCBM) || 0;
                        }
                    });
                    
                    this.updateGaugeUI(totalCBM);
                };

                // Requête 1 : Factures du conteneur en cours
                const qTrans = query(collection(db, "transactions"), where("conteneur", "==", activeContainer), where("agency", "==", activeAgency), where("isDeleted", "==", false));
                this.unsubContainerGauge1 = onSnapshot(qTrans, (snap) => {
                    snapTransDocs = snap.docs;
                    updateVolume();
                });

                // Requête 2 : Tous les colis physiquement en attente à Paris
                const qLiv = query(collection(db, "livraisons"), where("containerStatus", "==", "PARIS"), where("agency", "==", activeAgency));
                this.unsubContainerGauge2 = onSnapshot(qLiv, (snap) => {
                    snapLivDocs = snap.docs;
                    updateVolume();
                });
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

    initSidebarEvents() {
        document.querySelectorAll('.sidebar-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const page = item.dataset.page;
                if (page) {
                    this.renderPage(page);
                    // La fermeture sidebar mobile est gérée dans initMobileToggle
                }
            });
        });

        // Initialisation de l'accordéon (listes déroulantes) pour la sidebar
        document.querySelectorAll('.sidebar-category').forEach(category => {
            const title = category.querySelector('.sidebar-category-title');
            
            // Réduire par défaut les catégories qui ne contiennent pas l'élément actif
            if (!category.querySelector('.sidebar-item.active')) {
                category.classList.add('collapsed');
            }

            if (title) {
                title.addEventListener('click', () => {
                    category.classList.toggle('collapsed');
                });
            }
        });
    },

    initMobileToggle() {
        const toggle  = document.getElementById('mobileToggle');
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');

        // Fonction utilitaire : ouvrir la sidebar
        const openSidebar = (e) => {
            if (e) e.stopPropagation();
            sidebar?.classList.add('open');
            overlay?.classList.add('show');
            document.body.style.overflow = 'hidden'; // Empêche le scroll du fond
        };

        // Fonction utilitaire : fermer la sidebar
        const closeSidebar = () => {
            sidebar?.classList.remove('open');
            overlay?.classList.remove('show');
            document.body.style.overflow = '';
        };

        // Bouton hamburger dans la topbar
        if (toggle) {
            toggle.addEventListener('click', openSidebar);
        }

        // Bouton "Menu" dans la bottom nav mobile
        const bnavMore = document.getElementById('bnav-more');
        if (bnavMore) {
            bnavMore.addEventListener('click', openSidebar);
        }

        // Clic sur l'overlay → fermer
        if (overlay) {
            overlay.addEventListener('click', closeSidebar);
        }

        // Clic sur un item sidebar sur mobile → fermer
        document.querySelectorAll('.sidebar-item').forEach(item => {
            item.addEventListener('click', () => {
                if (window.innerWidth <= 1024) {
                    closeSidebar();
                }
            });
        });

        // Touche Escape → fermer
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeSidebar();
        });
    },

    initGlobalEvents() {
        // Fermer le modal au clic en dehors
        const modal = document.getElementById('modalOverlay');
        if(modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeModal();
                }
            });
        }
    },

    updateBadges() {
        // Compteur réel des demandes de devis
        import('https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js').then(module => {
            const { collection, query, where, getDocs } = module;
            import('../../../firebase-config.js').then(async cfg => {
                const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
                const q = query(collection(cfg.db, "quote_requests"), where("agency", "==", activeAgency), where("status", "==", "NOUVEAU"));
                const snap = await getDocs(q);
                const quoteBadge = document.getElementById('quoteRequestsBadge');
                if (quoteBadge) quoteBadge.textContent = snap.size;
            });
        });

        // A FAIRE : Connecter les messages et notifications
        const unreadMessages = 0; 
        const unreadNotifications = 0;

        // Compteur réel depuis la vue "TousLesRdvView" si elle est chargée, 
        // sinon on fera une requête rapide (Pour l'instant, on utilise le cache si disponible)
        let pendingAppointments = 0;
        if (window.app?.views?.tousLesRdv?.appointments) {
            pendingAppointments = window.app.views.tousLesRdv.appointments.filter(a => a.status === 'en_attente').length;
        } else {
            import('https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js').then(module => {
                const { collection, query, where, getDocs } = module;
                import('../../../firebase-config.js').then(async cfg => {
                    const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
                    const q = query(collection(cfg.db, "appointments"), where("agency", "==", activeAgency), where("status", "==", "en_attente"));
                    const snap = await getDocs(q);
                    
                    pendingAppointments = snap.size;
                    
                    const pendingBadge = document.getElementById('pendingAppointmentsBadge');
                    if (pendingBadge) pendingBadge.textContent = pendingAppointments;
                    
                    const bnavBadgeRdv = document.getElementById('bnavBadgeRdv');
                    if (bnavBadgeRdv) {
                        bnavBadgeRdv.textContent = pendingAppointments;
                        bnavBadgeRdv.style.display = pendingAppointments > 0 ? 'block' : 'none';
                    }
                });
            });
        }

        const pendingBadge = document.getElementById('pendingAppointmentsBadge');
        if (pendingBadge) pendingBadge.textContent = pendingAppointments;
        
        const chatBadge = document.getElementById('chatBadge');
        if (chatBadge) chatBadge.textContent = unreadMessages;

        // Badge Bottom Nav Mobile (RDV)
        const bnavBadgeRdv = document.getElementById('bnavBadgeRdv');
        if (bnavBadgeRdv) {
            bnavBadgeRdv.textContent = pendingAppointments;
            bnavBadgeRdv.style.display = pendingAppointments > 0 ? 'block' : 'none';
        }
    },

    renderPage(page) {
        // VERROUILLAGE SÉCURITÉ : On bloque le rendu de la page si l'accès est refusé
        if (!this.checkPageAccess(page)) {
            this.showToast("Accès refusé. Vous n'avez pas les permissions pour cette page.", "error");
            if (page !== 'dashboard') {
                this.renderPage('dashboard');
            } else {
                document.getElementById('contentContainer').innerHTML = '<div style="padding: 50px; text-align: center; color: #ef4444;"><h2>⛔ Accès Restreint</h2><p>Vous n\'avez accès à aucun module. Contactez l\'administrateur.</p></div>';
                document.getElementById('pageTitle').textContent = "Accès Restreint";
            }
            return;
        }

        this.currentPage = page;
        // Sauvegarde de la page courante pour la conserver après actualisation
        sessionStorage.setItem('parisCurrentPage', page);
        
        const titleMap = {
            'dashboard': 'Tableau de bord',
            'daily-bilan': 'Bilan du jour',
            'daily-users': 'Bilan par utilisateurs',
            'invoices-list': 'Toutes les factures',
            'invoice-new': 'Nouvelle facture',
            'appointment-new': 'Nouveau RDV',
            'appointments-list': 'Tous les RDV',
            'appointments-pending': 'RDV à valider',
            'appointments-calendar': 'Calendrier RDV',
            'program-new': 'Nouveau programme',
            'program-my': 'Mon programme',
            'program-history': 'Historique programmes',
            'drivers': 'Chauffeurs',
            'departures-calendar': 'Calendrier départs',
            'quotes-list': 'Tous les devis',
            'quote-new': 'Nouveau devis',
            'quote-requests': 'Demandes reçues',
            'confection-containers': 'Confection Conteneurs',
            'loading-boats': 'Bateaux départ',
            'scan-warehouse': 'Mise en entrepôt',
            'scan-container': 'Charger conteneur',
            'scan-classic': 'Scanner classique',
            'scan-history': 'Historique scans',
            'clients-list': 'Liste clients',
            'clients-app': 'Client application',
            'clients-analytics': 'Analytics clients',
            'chat': 'Chat',
            'sms-send': 'Envoi SMS',
            'sms-history': 'Historique SMS',
            'notifications': 'Notifications',
            'notifications-history': 'Historique notifications',
            'products-list': 'Liste produits',
            'finance-cashier': 'Caisse globale',
            'finance-cheques': 'Liste des chèques',
            'finance-expenses': 'Dépenses',
            'stock-list': 'Stock produits',
            'balance-monthly': 'Bilan Comparatif',
            'balance-12m': 'Direction 12 mois',
            'stats-boat': 'Statistiques bateau',
            'stats-monthly': 'Statistiques mensuelles',
            'stats-yearly': 'Statistiques annuelles',
            'settings-agency': 'Paramètres Agence',
            'settings-company': 'Paramètres Entreprise',
            'settings-software': 'Paramètres logiciel',
            'settings-sms': 'Configuration SMS',
            'settings-notifications': 'Configuration notifications',
            'settings-menus': 'Gestion menus',
            'settings-agents': 'Gestion des agents',
            'settings-appointments': 'Paramètres RDV',
            'settings-profile': 'Mon profil',
            'config-invoice': 'Choix facture',
            'config-label': 'Choix étiquette',
            'config-container': 'Conteneur Actif',
            'config-objectives': 'Objectifs',
            'config-charges': 'Charges',
            'prospecting': 'Prospections',
            'audit-log': 'Journal d\'activités'
        };
        
        document.getElementById('pageTitle').textContent = titleMap[page] || page;
        
        // Mise à jour de l'état actif dans la Bottom Nav Mobile
        document.querySelectorAll('.bottom-nav-item').forEach(b => b.classList.remove('active'));
        const activeBnav = document.querySelector(`.bottom-nav-item[data-target="${page}"]`);
        if (activeBnav) activeBnav.classList.add('active');
        
        // Mise à jour de l'état actif dans la Sidebar (Desktop)
        document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
        const activeSidebar = document.querySelector(`.sidebar-item[data-page="${page}"]`);
        if (activeSidebar) activeSidebar.classList.add('active');

        const renderers = {
            'dashboard': () => this.renderDynamicDashboard(),
            'daily-bilan': () => DailyBilanView.render(this),
            'daily-users': () => DailyUsersView.render(this),
            'invoices-list': () => ToutesLesFacturesView.render(this),
            'invoice-new': () => NouvelleFactureView.render(this),
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
            'quote-new': () => NouveauDevisView.render(this),
            'quote-requests': () => DemandesDevisView.render(this),
            'confection-containers': () => ConfectionConteneursView.render(this),
            'loading-boats': () => BateauxDepartView.render(this),
            'scan-warehouse': () => ScanWarehouseView.render(this),
            'scan-container': () => ScanContainerView.render(this),
            'scan-classic': () => ScanWarehouseView.render(this),
            'scan-history': () => ScanHistoryView.render(this),
            'clients-list': () => ClientsListView.render(this),
            'clients-app': () => this.renderClientsApp(),
            'clients-analytics': () => this.renderClientsAnalytics(),
            'chat': () => ChatView.render(this),
            'sms-send': () => this.renderSmsSend(),
            'sms-history': () => this.renderSmsHistory(),
            'notifications': () => NotificationsView.render(this),
            'notifications-history': () => NotificationsView.render(this),
            'products-list': () => ProductsListView.render(this),
            'finance-cashier': () => FinanceCaisseView.render(this),
            'finance-cheques': () => FinanceChequesView.render(this),
            'finance-expenses': () => FinanceDepensesView.render(this),
            'stock-list': () => this.renderStockList(),
            'balance-monthly': () => BilansFinanciersView.render(this),
            'balance-12m': () => BilansFinanciersView.render(this, '12m'),
            'stats-boat': () => this.renderStatsBoat(),
            'stats-monthly': () => this.renderStatsMonthly(),
            'stats-yearly': () => this.renderStatsYearly(),
            'settings-agency': () => SettingsAgencyView.render(this),
            'settings-company': () => SettingsCompanyView.render(this),
            'settings-software': () => this.renderSettingsSoftware(),
            'settings-sms': () => this.renderSettingsSms(),
            'settings-notifications': () => this.renderSettingsNotifications(),
            'settings-menus': () => SettingsMenusView.render(this),
            'settings-agents': () => SettingsAgentsView.render(this),
            'settings-appointments': () => SettingsAppointmentsView.render(this),
            'settings-profile': () => this.renderSettingsProfile(),
            'config-invoice': () => ConfigInvoiceView.render(this),
            'config-label': () => ConfigLabelView.render(this),
            'config-container': () => ConfigContainerView.render(this),
            'config-objectives': () => this.renderConfigObjectives(),
            'config-charges': () => this.renderConfigCharges(),
            'prospecting': () => this.renderProspecting(),
            'audit-log': () => this.renderAuditLog()
        };
        
        const renderer = renderers[page];
        if (renderer) {
            renderer();
        } else {
            document.getElementById('contentContainer').innerHTML = '<div class="loading">Page en construction...</div>';
        }
    },

    // ==================== RENDU DES PAGES ====================

    async renderDynamicDashboard() {
        document.getElementById('contentContainer').innerHTML = '<div style="padding: 50px; text-align: center;"><i class="fas fa-spinner fa-spin fa-2x" style="color:#3b82f6;"></i><br><br><span style="color:#64748b;">Chargement de votre espace...</span></div>';
        
        try {
            const { db } = await import('../../../firebase-config.js');
            const { getDocs, query, collection, where } = await import("https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js");
            
            const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
            const now = new Date();
            const currentMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
            const TAUX = 656; // Taux de conversion pour Paris si la caisse est en CFA

            // 1. Chiffre d'Affaires du Mois & Dernières factures
            const qTrans = query(collection(db, "transactions"), where("agency", "==", activeAgency), where("isDeleted", "==", false));
            const snapTrans = await getDocs(qTrans);
            
            let monthCA = 0;
            const recentInvoices = [];
            const agentStats = {};
            const monthlyData = {}; // Pour le graphique
            
            snapTrans.forEach(doc => {
                const t = doc.data();
                const valCFA = t.prix || 0;
                const valEUR = valCFA / TAUX;

                // Graphique évolution
                if (t.date && t.date.length >= 7) {
                    const m = t.date.substring(0, 7);
                    if (!monthlyData[m]) monthlyData[m] = 0;
                    monthlyData[m] += valEUR;
                }

                // Stats du mois courant
                if (t.date && t.date.startsWith(currentMonth)) {
                    monthCA += valEUR;
                    recentInvoices.push({ ...t, amountEur: valEUR });
                    
                    if (t.saisiPar) {
                        if (!agentStats[t.saisiPar]) agentStats[t.saisiPar] = 0;
                        agentStats[t.saisiPar] += valEUR;
                    }
                }
            });

            // Tri et extraction
            recentInvoices.sort((a, b) => new Date(b.date) - new Date(a.date));
            const topInvoices = recentInvoices.slice(0, 5);
            const topAgents = Object.entries(agentStats).sort((a, b) => b[1] - a[1]).slice(0, 3);
            
            // Récupération des photos des agents pour le dashboard
            const snapUsers = await getDocs(collection(db, "users"));
            const usersPhotos = {};
            snapUsers.forEach(doc => {
                const u = doc.data();
                if (u.displayName) usersPhotos[u.displayName] = u.photoURL;
                if (u.email) usersPhotos[u.email.split('@')[0]] = u.photoURL;
            });
            
            // 2. RDV en attente
            const qAppt = query(collection(db, "appointments"), where("agency", "==", activeAgency), where("status", "==", "en_attente"));
            const snapAppt = await getDocs(qAppt);
            const pendingAppointments = snapAppt.size;

            // 3. Programmes Actifs
            const qProg = query(collection(db, "appointments"), where("agency", "==", activeAgency), where("status", "==", "en_cours"));
            const snapProg = await getDocs(qProg);
            const activePrograms = new Set(snapProg.docs.map(d => d.data().livreur)).size;

            // 4. Conteneurs en transit
            const qCont = query(collection(db, "containers"), where("status", "==", "EN_TRANSIT"));
            const snapCont = await getDocs(qCont);
            const activeContainers = snapCont.size;

            // 5. Génération du HTML Dynamique
            const renderQuickActionButton = (page, icon, label, color) => {
                if (!this.checkPageAccess(page)) return ''; 
                return `
                    <button onclick="app.renderPage('${page}')" class="quick-action-btn" style="display:flex; flex-direction:column; align-items:center; padding:15px; background:white; border:1px solid #e2e8f0; border-radius:12px; cursor:pointer; transition:all 0.2s; box-shadow:0 2px 4px rgba(0,0,0,0.02);">
                        <i class="fas ${icon}" style="font-size:24px; color:${color}; margin-bottom:10px;"></i>
                        <span style="font-weight:600; color:#334155; font-size:12px; text-align:center;">${label}</span>
                    </button>
                `;
            };

            const html = `
                <style>
                    .quick-action-btn:hover { transform: translateY(-3px) !important; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1) !important; border-color: #cbd5e1 !important; }
                </style>
                
                <h3 style="margin: 0 0 20px 0; color: #0f172a; font-size: 20px; font-weight: 800;">🚀 Accès rapide</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(min(130px, 45%), 1fr)); gap: 12px; margin-bottom: 30px;">
                    ${renderQuickActionButton('invoice-new', 'fa-file-invoice', 'Nouvelle facture', '#3b82f6')}
                    ${renderQuickActionButton('invoices-list', 'fa-list', 'Liste factures', '#64748b')}
                    ${renderQuickActionButton('quote-new', 'fa-file-signature', 'Nouveau devis', '#10b981')}
                    ${renderQuickActionButton('quote-requests', 'fa-inbox', 'Demandes devis', '#f59e0b')}
                    ${renderQuickActionButton('appointments-pending', 'fa-calendar-check', 'RDV à valider', '#ef4444')}
                    ${renderQuickActionButton('notifications', 'fa-bell', 'Notifications', '#8b5cf6')}
                    ${renderQuickActionButton('sms-send', 'fa-sms', 'Envoi SMS', '#ec4899')}
                    ${renderQuickActionButton('loading-boats', 'fa-ship', 'Bateaux & Départs', '#0ea5e9')}
                    ${renderQuickActionButton('clients-list', 'fa-users', 'Clients', '#14b8a6')}
                ${renderQuickActionButton('balance-monthly', 'fa-chart-line', 'Bilan Comparatif', '#f43f5e')}
                    ${renderQuickActionButton('scan-warehouse', 'fa-barcode', 'Numérisation', '#6366f1')}
                    ${renderQuickActionButton('finance-expenses', 'fa-money-bill-wave', 'Dépenses', '#f97316')}
                </div>

                <h3 style="margin: 0 0 20px 0; color: #0f172a; font-size: 20px; font-weight: 800;">📊 Indicateurs du mois (${new Date().toLocaleDateString('fr-FR', {month:'long'})})</h3>
                <div class="stats-grid" style="margin-bottom: 30px;">
                    <div class="stat-card">
                        <div class="stat-icon" style="background:#dbeafe; color:#2563eb;"><i class="fas fa-file-invoice"></i></div>
                        <div class="stat-value">${this.formatMoney(monthCA)}</div>
                        <div class="stat-label">Chiffre d'affaires facturé</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon" style="background:#d1fae5; color:#059669;"><i class="fas fa-calendar"></i></div>
                        <div class="stat-value">${pendingAppointments}</div>
                        <div class="stat-label">RDV en attente</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon" style="background:#fef3c7; color:#d97706;"><i class="fas fa-tasks"></i></div>
                        <div class="stat-value">${activePrograms}</div>
                        <div class="stat-label">Chauffeurs en tournée</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon" style="background:#ede9fe; color:#7c3aed;"><i class="fas fa-box"></i></div>
                        <div class="stat-value">${activeContainers}</div>
                        <div class="stat-label">Conteneurs en mer</div>
                    </div>
                </div>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 25px; margin-bottom: 30px;">
                    <div style="background: white; border-radius: 16px; padding: 20px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                        <h3 style="margin: 0 0 20px; font-size: 16px;">📈 Évolution Facturation (Général)</h3>
                        <div style="position: relative; height: 250px; width: 100%;">
                            <canvas id="revenueChart"></canvas>
                        </div>
                    </div>
                    
                    <div style="background: white; border-radius: 16px; padding: 20px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                        <h3 style="margin: 0 0 20px; font-size: 16px;">🧾 Dernières Factures</h3>
                        <div style="max-height: 250px; overflow-y: auto; padding-right: 5px;">
                            ${topInvoices.length === 0 ? '<div style="color:#94a3b8; text-align:center; padding: 20px;">Aucune facture ce mois-ci.</div>' : ''}
                            ${topInvoices.map(inv => {
                                const reste = Math.abs(parseFloat(inv.reste) || 0) / TAUX;
                                const statusTxt = reste <= 0 ? 'Payée' : 'Impayée';
                                const statusCls = reste <= 0 ? 'badge-success' : 'badge-warning';
                                return `
                                <div style="display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f1f5f9; cursor: pointer;" onclick="window.app.renderPage('invoices-list')">
                                    <div><strong>${inv.reference}</strong><br><span style="font-size:12px; color:#64748b;">${inv.nom}</span></div>
                                    <div style="text-align: right;"><strong>${this.formatMoney(inv.amountEur)}</strong><br><span class="badge ${statusCls}">${statusTxt}</span></div>
                                </div>
                            `}).join('')}
                        </div>
                    </div>
                </div>

                <h3 style="margin: 0 0 20px 0; color: #0f172a; font-size: 20px; font-weight: 800;">🏆 Meilleurs agents (Mois en cours)</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 15px; margin-bottom: 30px;">
                    ${topAgents.length === 0 ? '<div style="grid-column: 1/-1; color:#94a3b8;">Pas de données pour le moment.</div>' : ''}
                ${topAgents.map(([name, amount], i) => {
                    const photo = usersPhotos[name];
                    const avatarHtml = photo 
                        ? `<div style="width: 50px; height: 50px; border-radius: 50%; background-image: url('${photo}'); background-size: cover; background-position: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1); flex-shrink: 0;"></div>`
                        : `<div style="width: 50px; height: 50px; border-radius: 50%; background: #eff6ff; display: flex; justify-content: center; align-items: center; font-size: 20px; color: #3b82f6; flex-shrink: 0;"><i class="fas fa-user"></i></div>`;
                    return `
                        <div style="background: white; padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0; display: flex; align-items: center; gap: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                        ${avatarHtml}
                            <div style="flex: 1;">
                                <h4 style="margin: 0; color: #1e293b; font-size: 14px; text-transform: uppercase;">${name}</h4>
                                <p style="margin: 2px 0 0 0; color: #10b981; font-size: 12px; font-weight: bold;">${this.formatMoney(amount)}</p>
                            </div>
                            <div style="font-size: 20px;">
                                ${i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}
                            </div>
                        </div>
                `}).join('')}
                </div>
            `;
            
            document.getElementById('contentContainer').innerHTML = html;
            
            // Graphique d'évolution
            setTimeout(() => {
                const ctx = document.getElementById('revenueChart')?.getContext('2d');
                if (ctx && typeof Chart !== 'undefined') {
                    const sortedLabels = Object.keys(monthlyData).sort();
                    const dataPoints = sortedLabels.map(l => monthlyData[l]);
                    
                    // Format des labels (ex: 2024-12 -> Déc 24)
                    const displayLabels = sortedLabels.map(l => {
                        const d = new Date(l + '-01');
                        return d.toLocaleDateString('fr-FR', {month: 'short', year: '2-digit'}).replace('.', '');
                    });

                    new Chart(ctx, {
                        type: 'line',
                        data: {
                            labels: displayLabels.length > 0 ? displayLabels : ['Aucune donnée'],
                            datasets: [{
                                label: 'CA Facturé (€)',
                                data: dataPoints.length > 0 ? dataPoints : [0],
                                borderColor: '#3b82f6',
                                backgroundColor: 'rgba(59,130,246,0.1)',
                                fill: true,
                                tension: 0.4
                            }]
                        },
                        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
                    });
                }
            }, 100);

        } catch(e) {
            console.error("Dashboard Error:", e);
            document.getElementById('contentContainer').innerHTML = '<div style="padding: 50px; text-align: center; color: #ef4444;"><i class="fas fa-exclamation-triangle fa-2x"></i><br><br>Erreur lors du chargement des données.</div>';
        }
    },

    renderClientsApp() {
        const html = `
            <div class="form-card">
                <h3>Statistiques application client</h3>
                <div class="stats-grid">
                    <div class="stat-card"><div class="stat-value">156</div><div class="stat-label">Utilisateurs actifs</div></div>
                    <div class="stat-card"><div class="stat-value">42</div><div class="stat-label">Nouveaux ce mois</div></div>
                    <div class="stat-card"><div class="stat-value">89%</div><div class="stat-label">Taux satisfaction</div></div>
                </div>
                <div style="margin-top: 20px; position: relative; height: 200px; width: 100%;">
                    <canvas id="appUsageChart"></canvas>
                </div>
            </div>
        `;
        document.getElementById('contentContainer').innerHTML = html;
        
        setTimeout(() => {
            const ctx = document.getElementById('appUsageChart')?.getContext('2d');
            if (ctx) {
                new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4'],
                        datasets: [{ label: 'Connexions', data: [45, 67, 89, 102], borderColor: '#3b82f6' }]
                    }
                });
            }
        }, 100);
    },

    renderClientsAnalytics() {
        const html = `
            <div class="form-card">
                <h3>Analytique clients</h3>
                <div class="stats-grid">
                    <div class="stat-card"><div class="stat-value">25K</div><div class="stat-label">CA total clients (€)</div></div>
                    <div class="stat-card"><div class="stat-value">45</div><div class="stat-label">Clients actifs</div></div>
                    <div class="stat-card"><div class="stat-value">1250</div><div class="stat-label">Colis expédiés</div></div>
                </div>
                <div style="position: relative; height: 250px; width: 100%; margin-top: 20px;">
                    <canvas id="clientSegmentChart"></canvas>
                </div>
            </div>
        `;
        document.getElementById('contentContainer').innerHTML = html;
        
        setTimeout(() => {
            const ctx = document.getElementById('clientSegmentChart')?.getContext('2d');
            if (ctx) {
                new Chart(ctx, {
                    type: 'doughnut',
                    data: {
                        labels: ['Grands comptes', 'PME', 'Particuliers'],
                        datasets: [{ data: [45, 35, 20], backgroundColor: ['#3b82f6', '#10b981', '#f59e0b'] }]
                    }
                });
            }
        }, 100);
    },

    renderSmsSend() {
        const html = `
            <div class="form-card">
                <h3>Envoi de SMS</h3>
                <div class="form-grid">
                    <div class="form-group"><label>Numéro(s)</label><input type="text" id="smsNumbers" placeholder="Séparés par des virgules"></div>
                    <div class="form-group"><label>Sélectionner un groupe</label><select id="smsGroup"><option>Tous les clients</option><option>Clients actifs</option><option>Prospects</option></select></div>
                    <div class="form-group full-width"><label>Message</label><textarea id="smsMessage" rows="4" placeholder="Votre message..."></textarea></div>
                </div>
                <div style="margin-top: 20px;">
                    <button class="btn btn-primary" onclick="app.sendSms()"><i class="fas fa-paper-plane"></i> Envoyer</button>
                    <span id="smsCount" style="margin-left: 15px; color: #64748b;">0 SMS à envoyer</span>
                </div>
            </div>
        `;
        document.getElementById('contentContainer').innerHTML = html;
    },

    renderSmsHistory() {
        const html = `
            <div class="form-card">
                <h3>Historique des SMS</h3>
                <table class="data-table">
                    <thead><tr><th>Date</th><th>Destinataire</th><th>Message</th><th>Statut</th></tr></thead>
                    <tbody>
                        <tr><td>2024-12-14 09:30</td><td>07 12 34 56 78</td><td>Votre colis est disponible</td><td><span class="badge badge-success">Envoyé</span></td></tr>
                        <tr><td>2024-12-13 15:20</td><td>07 23 45 67 89</td><td>Rappel RDV demain 10h</td><td><span class="badge badge-success">Envoyé</span></td></tr>
                    </tbody>
                </table>
            </div>
        `;
        document.getElementById('contentContainer').innerHTML = html;
    },

    renderStockList() {
        const html = `
            <div class="form-card">
                <h3>État du stock</h3>
                <table class="data-table">
                    <thead><tr><th>Produit</th><th>Catégorie</th><th>Stock actuel</th><th>Prix unitaire</th></tr></thead>
                    <tbody>
                        <tr><td>Carton standard</td><td>Emballage</td><td>150</td><td>15.00 €</td></tr>
                        <tr><td>Malle</td><td>Contenant</td><td>25</td><td>45.00 €</td></tr>
                    </tbody>
                </table>
            </div>
        `;
        document.getElementById('contentContainer').innerHTML = html;
    },

    renderStatsBoat() { StatistiquesView.render(this, 'boat'); },
    renderStatsMonthly() { StatistiquesView.render(this, 'monthly'); },
    renderStatsYearly() { StatistiquesView.render(this, 'yearly'); },

    // Paramètres pages
    renderSettingsSoftware() { this.renderSettingsForm('Paramètres logiciel', { theme: 'Clair', language: 'Français', notifications: true, autoBackup: true }); },
    renderSettingsSms() { this.renderSettingsForm('Configuration SMS', { provider: 'API SMS', apiKey: '••••••••', sender: 'AMT PARIS' }); },
    renderSettingsNotifications() { this.renderSettingsForm('Notifications', { emailAlerts: true, smsAlerts: true, pushEnabled: true }); },
    renderSettingsProfile() { 
        const userName = sessionStorage.getItem('userName') || 'Utilisateur';
        const userAgency = sessionStorage.getItem('userAgency') || 'Non définie';
        const userRole = sessionStorage.getItem('userRole') || 'Non défini';
        
        let agencyDisplay = userAgency === 'paris' ? '🇫🇷 Paris' : (userAgency === 'abidjan' ? '🇨🇮 Abidjan' : '🌍 Global (Abidjan & Paris)');
        if (userAgency === 'Non définie') agencyDisplay = 'Non définie';

        const roleDisplay = userRole.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

        const html = `
            <div style="max-width: 1100px; margin: 0 auto; animation: fadeIn 0.3s ease-in-out;">
                <!-- En-tête du Profil -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; flex-wrap: wrap; gap: 15px; background: white; padding: 20px 25px; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <div style="width: 50px; height: 50px; background: #eff6ff; color: #3b82f6; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 22px;">
                            <i class="fas fa-user-cog"></i>
                        </div>
                        <div>
                            <h2 style="margin: 0; color: #0f172a; font-size: 22px; font-weight: 800;">Paramètres du Profil</h2>
                            <p style="margin: 4px 0 0 0; color: #64748b; font-size: 13px;">Gérez vos informations, votre sécurité et vos accréditations.</p>
                        </div>
                    </div>
                    <button class="btn btn-primary" onclick="app.saveProfile()" style="padding: 12px 24px; font-size: 14px; box-shadow: 0 4px 12px rgba(59,130,246,0.3);">
                        <i class="fas fa-save" style="margin-right: 6px;"></i> Enregistrer les modifications
                    </button>
                </div>

                <!-- Grille de cartes -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 25px;">
                    
                    <!-- Carte 1: Photo de profil -->
                    <div class="form-card" style="margin-bottom: 0; display: flex; flex-direction: column; align-items: center; text-align: center; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                        <h4 style="margin: 0 0 20px 0; color: #1e293b; font-size: 15px; align-self: flex-start; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; width: 100%; text-align: left; display: flex; align-items: center;">
                            <i class="fas fa-camera" style="color: #3b82f6; margin-right: 10px; font-size: 18px;"></i> Photo de profil
                        </h4>
                        
                        <div class="user-avatar" id="profileAvatarPreview" style="width: 130px; height: 130px; margin: 10px auto 15px; font-size: 50px; cursor: pointer; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.15); border: 4px solid white; transition: transform 0.2s;" onclick="document.getElementById('profilePhotoInput').click()" title="Changer la photo">
                            <i class="fas fa-user text-white"></i>
                        </div>
                        <input type="file" id="profilePhotoInput" accept="image/*" style="display: none;" onchange="app.handleProfilePhotoChange(event)">
                        
                        <h3 style="margin: 0 0 5px 0; color: #0f172a; font-size: 18px; font-weight: 700;">${userName}</h3>
                        <p style="margin: 0 0 20px 0; color: #64748b; font-size: 13px; background: #f1f5f9; padding: 4px 12px; border-radius: 20px; display: inline-block;">${roleDisplay}</p>
                        
                        <button class="btn btn-outline" onclick="document.getElementById('profilePhotoInput').click()" style="border-radius: 8px; width: 100%; justify-content: center;">
                            <i class="fas fa-image"></i> Modifier la photo
                        </button>
                    </div>

                    <!-- Carte 2: Infos Personnelles -->
                    <div class="form-card" style="margin-bottom: 0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                        <h4 style="margin: 0 0 20px 0; color: #1e293b; font-size: 15px; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; display: flex; align-items: center;">
                            <i class="fas fa-id-card" style="color: #10b981; margin-right: 10px; font-size: 18px;"></i> Identité
                        </h4>
                        <div class="form-group" style="margin-bottom: 20px;">
                            <label>Nom d'utilisateur complet</label>
                            <input type="text" id="profileName" value="${userName}" style="font-size: 14px; padding: 12px 15px; background: #f8fafc; border: 1px solid #cbd5e1;">
                        </div>
                        <div style="padding: 15px; background: #f0fdf4; border-radius: 10px; border: 1px solid #bbf7d0; display: flex; gap: 12px; align-items: flex-start;">
                            <i class="fas fa-info-circle" style="color: #16a34a; font-size: 18px; margin-top: 2px;"></i>
                            <p style="margin: 0; font-size: 13px; color: #166534; line-height: 1.5;">
                                Ce nom sera utilisé pour tracer vos actions dans le journal d'audit et apparaîtra sur vos documents (factures, reçus).
                            </p>
                        </div>
                    </div>

                    <!-- Carte 3: Sécurité -->
                    <div class="form-card" style="margin-bottom: 0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                        <h4 style="margin: 0 0 20px 0; color: #1e293b; font-size: 15px; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; display: flex; align-items: center;">
                            <i class="fas fa-shield-alt" style="color: #ef4444; margin-right: 10px; font-size: 18px;"></i> Sécurité
                        </h4>
                        <div class="form-group" style="margin-bottom: 10px;">
                            <label>Nouveau mot de passe</label>
                            <input type="password" id="profileNewPassword" placeholder="••••••••" style="font-size: 14px; padding: 12px 15px; background: #f8fafc; border: 1px solid #cbd5e1;">
                        </div>
                        <div style="padding: 15px; background: #fef2f2; border-radius: 10px; border: 1px solid #fecaca; display: flex; gap: 12px; align-items: flex-start; margin-top: 20px;">
                            <i class="fas fa-exclamation-triangle" style="color: #dc2626; font-size: 18px; margin-top: 2px;"></i>
                            <div style="margin: 0; font-size: 13px; color: #991b1b; line-height: 1.5;">
                                <strong>Attention :</strong> Laissez vide si vous ne souhaitez pas changer de mot de passe. Minimum 6 caractères requis.
                            </div>
                        </div>
                    </div>

                    <!-- Carte 4: Infos Pro -->
                    <div class="form-card" style="margin-bottom: 0; background: #f8fafc; border: 1px dashed #cbd5e1; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02);">
                        <h4 style="margin: 0 0 20px 0; color: #1e293b; font-size: 15px; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; display: flex; align-items: center;">
                            <i class="fas fa-building" style="color: #f59e0b; margin-right: 10px; font-size: 18px;"></i> Accréditations
                        </h4>
                        
                        <div class="form-group" style="margin-bottom: 20px;">
                            <label>Agence / Secteur rattaché</label>
                            <div style="padding: 12px 16px; background: white; border: 1px solid #e2e8f0; border-radius: 10px; color: #334155; font-weight: 600; font-size: 14px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);">
                                ${agencyDisplay}
                            </div>
                        </div>

                        <div class="form-group">
                            <label>Niveau d'accès (Rôle)</label>
                            <div style="padding: 12px 16px; background: white; border: 1px solid #e2e8f0; border-radius: 10px; color: #334155; font-weight: 600; font-size: 14px; display: flex; align-items: center; gap: 10px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);">
                                <i class="fas fa-user-shield" style="color: #94a3b8;"></i>
                                ${roleDisplay}
                            </div>
                        </div>
                        
                        <p style="font-size: 12px; color: #64748b; margin-top: 25px; padding-top: 15px; border-top: 1px solid #e2e8f0; font-style: italic; text-align: center;">
                            <i class="fas fa-lock" style="margin-right: 5px;"></i> Ces informations sont gérées par votre administrateur réseau.
                        </p>
                    </div>
                </div>
                </div>
            </div>
        `;
        document.getElementById('contentContainer').innerHTML = html;

        const savedPhoto = localStorage.getItem('userProfilePhoto');
        if (savedPhoto) {
            const avatar = document.getElementById('profileAvatarPreview');
            avatar.innerHTML = '';
            avatar.style.backgroundImage = `url(${savedPhoto})`;
            avatar.style.backgroundSize = 'cover';
            avatar.style.backgroundPosition = 'center';
        }
    },
    renderConfigInvoice() { this.renderSettingsForm('Choix facture', { template: 'Standard', logo: 'AMT', footer: 'Merci de votre confiance' }); },
    renderConfigLabel() { this.renderSettingsForm('Choix étiquette', { format: 'A6', template: 'Étiquette standard', barcode: true }); },
    renderConfigObjectives() { this.renderSettingsForm('Objectifs', { monthlyTarget: 50000, quarterlyTarget: 150000, yearlyTarget: 600000 }); },
    renderConfigCharges() { this.renderSettingsForm('Charges', { rent: 1500, utilities: 250, salaries: 8000, other: 500 }); },
    renderProspecting() { this.renderChartPage('prospections', 'monthly'); },
    
    renderAuditLog() {
        const html = `
            <div class="form-card">
                <h3>Journal d'activités</h3>
                <div style="margin-bottom: 15px;">
                    <input type="text" placeholder="Filtrer par utilisateur, action..." style="padding: 8px; width: 100%; border: 1px solid #e2e8f0; border-radius: 8px;">
                </div>
                <table class="data-table">
                    <thead><tr><th>Date/Heure</th><th>Utilisateur</th><th>Action</th><th>Détails</th></tr></thead>
                    <tbody>
                        <tr><td>2024-12-14 10:30</td><td>Agent Paris</td><td>Création facture</td><td>FAC-2024-003 créée pour Ibrahim Touré</td></tr>
                        <tr><td>2024-12-14 09:15</td><td>Agent Paris</td><td>Connexion</td><td>Connexion réussie</td></tr>
                    </tbody>
                </table>
            </div>
        `;
        document.getElementById('contentContainer').innerHTML = html;
    },

    renderSettingsForm(title, fields) {
        const html = `
            <div class="form-card">
                <h3>${title}</h3>
                <div class="form-grid">
                    ${Object.entries(fields).map(([key, val]) => `
                        <div class="form-group"><label>${key}</label><input type="text" value="${val}"></div>
                    `).join('')}
                </div>
                <div style="margin-top: 20px;"><button class="btn btn-primary" onclick="app.saveSettings()">Enregistrer</button></div>
            </div>
        `;
        document.getElementById('contentContainer').innerHTML = html;
    },

    // ==================== PROFIL & UTILISATEUR ====================

    loadUserProfile() {
        const savedPhoto = localStorage.getItem('userProfilePhoto');
        if (savedPhoto) {
            // Met à jour dynamiquement toutes les div ayant la classe 'avatar' ou 'user-avatar'
            document.querySelectorAll('.user-avatar, .avatar, #userAvatar, #profileAvatarPreview').forEach(el => {
                el.innerHTML = '';
                el.style.backgroundImage = `url('${savedPhoto}')`;
                el.style.backgroundSize = 'cover';
                el.style.backgroundPosition = 'center';
                el.style.color = 'transparent';
            });
        }
    },

    handleProfilePhotoChange(event) {
        const file = event.target.files[0];
        if (file) {
            this.tempProfileFile = file;
            const reader = new FileReader();
            reader.onload = (e) => {
                const avatar = document.getElementById('profileAvatarPreview');
                avatar.innerHTML = '';
                avatar.style.backgroundImage = `url(${e.target.result})`;
                avatar.style.backgroundSize = 'cover';
                avatar.style.backgroundPosition = 'center';
                this.tempProfilePhoto = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    },

    async saveProfile() {
        const newName = document.getElementById('profileName').value.trim();
        const newPassword = document.getElementById('profileNewPassword').value;
        
        if (!newName) {
            this.showToast("Le nom d'utilisateur ne peut pas être vide.", "error");
            return;
        }

        const btn = document.querySelector('#contentContainer .btn-primary');
        const oldText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
        btn.disabled = true;

        try {
            const { auth, db, app: firebaseApp } = await import('../../firebase-config.js');
            const { updateProfile, updatePassword } = await import('https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js');
            const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js');
            const { getStorage, ref: storageRef, uploadBytes, getDownloadURL } = await import('https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js');

            const user = auth.currentUser;
            if (!user) throw new Error("Utilisateur non connecté.");

            const updates = {};

            // 1. Mise à jour du Nom
            if (newName !== user.displayName) {
                await updateProfile(user, { displayName: newName });
                updates.displayName = newName;
                sessionStorage.setItem('userName', newName);
                const headerName = document.getElementById('userName');
                if (headerName) headerName.textContent = newName;
            }

            // 2. Mise à jour de la Photo via Storage
            if (this.tempProfileFile) {
                const storage = getStorage(firebaseApp);
                const fileExt = this.tempProfileFile.name.split('.').pop();
                const fileName = `profile_photos/${user.uid}_${Date.now()}.${fileExt}`;
                const sRef = storageRef(storage, fileName);
                
                await uploadBytes(sRef, this.tempProfileFile);
                const downloadUrl = await getDownloadURL(sRef);
                
                updates.photoURL = downloadUrl;
                await updateProfile(user, { photoURL: downloadUrl });
                localStorage.setItem('userProfilePhoto', downloadUrl);
                this.loadUserProfile();
                this.tempProfileFile = null;
            }

            // Mise à jour dans Firestore (Synchronisation)
            if (Object.keys(updates).length > 0) {
                await updateDoc(doc(db, 'users', user.uid), updates);
            }

            // 3. Mise à jour du Mot de passe
            if (newPassword) {
                if (newPassword.length < 6) {
                    this.showToast("Le mot de passe doit faire au moins 6 caractères.", "error");
                    btn.innerHTML = oldText;
                    btn.disabled = false;
                    return;
                }
                try {
                    await updatePassword(user, newPassword);
                    await updateDoc(doc(db, 'users', user.uid), { password: newPassword });
                } catch (pwError) {
                    if (pwError.code === 'auth/requires-recent-login') {
                        this.showToast("Par sécurité, veuillez vous déconnecter et vous reconnecter pour modifier le mot de passe.", "error");
                        btn.innerHTML = oldText;
                        btn.disabled = false;
                        return;
                    } else {
                        throw pwError;
                    }
                }
            }

            this.showToast("Profil mis à jour avec succès !", "success");
            document.getElementById('profileNewPassword').value = '';

        } catch (error) {
            console.error("Erreur lors de la mise à jour du profil :", error);
            this.showToast("Erreur : " + error.message, "error");
        } finally {
            btn.innerHTML = oldText;
            btn.disabled = false;
        }
    },

    // ==================== ACTIONS ====================
    
    // FORMATAGE EN EURO (€) 🇫🇷
    formatMoney(amount) {
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount || 0).replace(/[\u202F\u00A0]/g, ' ').replace(/\s*\/\s*/g, ' ');
    },

    showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.style.cssText = 'position: fixed; bottom: 20px; right: 20px; background: ' + (type === 'success' ? '#10b981' : '#ef4444') + '; color: white; padding: 12px 20px; border-radius: 8px; z-index: 2000; animation: slideIn 0.3s ease;';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    },

    renderConfigObjectives() { this.renderSettingsForm('Objectifs', { monthlyTarget: 50000, quarterlyTarget: 150000, yearlyTarget: 600000 }); },

    openModal(content) {
        const modal = document.getElementById('modalOverlay');
        const modalContent = document.getElementById('modalContent');
        modalContent.innerHTML = content;
        modal.classList.add('active');
    },

    closeModal() {
        document.getElementById('modalOverlay').classList.remove('active');
    },

    createInvoice() {
        const client = document.getElementById('invoiceClient')?.value;
        const amount = document.getElementById('invoiceAmount')?.value;
        if (client && amount) {
            this.showToast(`Facture créée pour ${client} de ${this.formatMoney(amount)}`);
            this.renderPage('invoices-list');
        } else {
            this.showToast('Veuillez remplir tous les champs', 'error');
        }
    },

    createAppointment() { this.showToast('RDV enregistré'); this.renderPage('appointments-list'); },
    createProgram() { this.showToast('Programme créé'); this.renderPage('program-my'); },
    createQuote() { this.showToast('Devis généré'); this.renderPage('quotes-list'); },
    sendSms() { this.showToast('SMS envoyé avec succès'); },
    confirmAppointment(id) { this.showToast('RDV confirmé'); },
    deleteAppointment(id) { this.showToast('RDV supprimé'); },
    validateAppointment(id) { this.showToast('RDV validé'); },
    rejectAppointment(id) { this.showToast('RDV refusé'); },
    viewInvoice(id) { this.showToast('Affichage facture'); },
    downloadInvoice(id) { this.showToast('Téléchargement facture'); },
    deleteInvoice(id) { this.showToast('Facture supprimée'); },
    convertQuoteToInvoice(id) { this.showToast('Devis converti en facture'); },
    processQuoteRequest(id) { this.showToast('Demande traitée'); },
    addDriver() { this.showToast('Fonctionnalité à venir'); },
    assignDriver(id) { this.showToast('Chauffeur assigné'); },
    viewContainer(id) { this.showToast('Détails conteneur'); },
    manualScan() { this.showToast('Scan enregistré'); },
    addToContainer() { this.showToast('Colis ajouté au conteneur'); },
    addClient() { this.showToast('Fonctionnalité à venir'); },
    exportClients() { this.showToast('Export Excel en cours'); },
    viewClient() { this.showToast('Détails client'); },
    addProduct() { this.showToast('Fonctionnalité à venir'); },
    editProduct(id) { this.showToast('Modification produit'); },
    addExpense() { this.showToast('Nouvelle dépense'); },
    addStock() { this.showToast('Nouveau stock'); },
    addAgent() { this.showToast('Ajout agent'); },
    editAgent(id) { this.showToast('Modification agent'); },
    saveSettings() { this.showToast('Paramètres enregistrés'); },
    
    // ==================== IMPRESSION ETIQUETTES ====================
// ==================== IMPRESSION ETIQUETTES ====================
async printLabels(data) {
    const format = localStorage.getItem('amt_label_format') || 'A5';
    const model = localStorage.getItem('amt_label_model') || 'classic';
    const colorScheme = localStorage.getItem('amt_label_color') || 'default';
    
    const dimensions = {
        A5: { width: 210, height: 148 },
        A6: { width: 148, height: 105 }
    };
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
        
        if (model === 'compact') {
            labelsHtml += this.renderCompactLabel(widthMm, heightMm, qrDataUrl, data, label, theme);
        } else if (model === 'premium') {
            labelsHtml += this.renderPremiumLabel(widthMm, heightMm, qrDataUrl, data, label, theme);
        } else {
            labelsHtml += this.renderClassicLabel(widthMm, heightMm, qrDataUrl, data, label, theme);
        }
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
                .label { 
                    box-sizing: border-box; 
                    page-break-after: always;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                }
                .label:last-child { page-break-after: auto; }
            </style>
        </head>
        <body>
            ${labelsHtml}
        </body>
        </html>
    `);
    doc.close();
    
    loadingToast.remove();
    
    iframe.onload = () => {
        setTimeout(() => {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            setTimeout(() => document.body.removeChild(iframe), 2000);
        }, 500);
    };
},

renderClassicLabel(widthMm, heightMm, qrDataUrl, data, label, theme) {
    const isA5 = widthMm === 210;
    const fontSize = isA5 ? '11pt' : '9pt';
    const titleFont = isA5 ? '14pt' : '11pt';
    const refFont = isA5 ? '28pt' : '22pt';
    
    return `
        <div class="label" style="width: ${widthMm}mm; height: ${heightMm}mm;">
            <div style="height: 100%; display: flex; flex-direction: column; padding: 6mm;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid ${theme.border}; padding-bottom: 3mm; margin-bottom: 4mm;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="background: black; padding: 2px 4px; border-radius: 6px; display: flex; align-items: center; justify-content: center;">
                            <img src="../LOGOAMT.png" style="height: ${isA5 ? '8mm' : '6mm'}; object-fit: contain;" alt="Logo" />
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

renderCompactLabel(widthMm, heightMm, qrDataUrl, data, label, theme) {
    const isA5 = widthMm === 210;
    
    return `
        <div class="label" style="width: ${widthMm}mm; height: ${heightMm}mm;">
            <div style="height: 100%; display: flex; flex-direction: column; padding: 5mm;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid ${theme.border}; padding-bottom: 2mm; margin-bottom: 3mm;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="background: black; padding: 2px 4px; border-radius: 4px; display: flex; align-items: center; justify-content: center;">
                            <img src="../LOGOAMT.png" style="height: ${isA5 ? '6mm' : '4mm'}; object-fit: contain;" alt="Logo" />
                        </div>
                        <div style="font-size: ${isA5 ? '9pt' : '7pt'}; font-weight: bold;">AMT TRANSIT CI FRET<br><span style="font-weight: normal; font-size: ${isA5 ? '8pt' : '6pt'};">81 AV. ARISTIDE BRIAND - 0180893370</span></div>
                    </div>
                    <div style="font-size: ${isA5 ? '8pt' : '7pt'}; text-align: right;">
                        ${new Date().toLocaleDateString()}<br>${new Date().toLocaleTimeString()}
                    </div>
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

renderPremiumLabel(widthMm, heightMm, qrDataUrl, data, label, theme) {
    const isA5 = widthMm === 210;
    
    return `
        <div class="label" style="width: ${widthMm}mm; height: ${heightMm}mm;">
            <div style="height: 100%; display: flex; flex-direction: column;">
                    <div style="background: ${theme.border}; color: white; padding: 3mm 4mm; display: flex; justify-content: center; align-items: center; gap: 10px;">
                        <div style="background: black; padding: 2px 4px; border-radius: 6px; display: flex; align-items: center; justify-content: center;">
                            <img src="../LOGOAMT.png" style="height: ${isA5 ? '8mm' : '6mm'}; object-fit: contain;" alt="Logo" />
                        </div>
                        <span style="font-size: ${isA5 ? '12pt' : '10pt'}; font-weight: bold; margin: 0;">AMT TRANSIT CI FRET INTERNATIONAL</span>
                </div>
                <div style="padding: 5mm; flex: 1; display: flex; flex-direction: column;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5mm;">
                        <div>
                            <div style="font-size: ${isA5 ? '9pt' : '8pt'};">81 AVENUE ARISTIDE BRIAND, 93240 STAINS</div>
                            <div style="font-size: ${isA5 ? '9pt' : '8pt'};">TEL: 01 80 89 33 70</div>
                        </div>
                        <div style="text-align: right; font-size: ${isA5 ? '8pt' : '7pt'};">
                            ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}
                        </div>
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
}
};

// Démarrage une fois le DOM chargé
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});