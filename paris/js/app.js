import { appData } from './data.js';
import { DashboardView } from './views/dashboard.js';
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
import { ConfigInvoiceView } from './views/config-invoice.js';
import { ConfigLabelView } from './views/config-label.js';
import { ConfigContainerView } from './views/config-container.js';
import { ScanWarehouseView } from './views/scan-warehouse.js';
import { ScanContainerView } from './views/scan-container.js';

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
        'balance-monthly': 'bilans-financiers', 'balance-yearly': 'bilans-financiers', 'balance-boat': 'bilans-financiers', 'balance-12m': 'bilans-financiers',
        'stats-boat': 'statistique', 'stats-monthly': 'statistique', 'stats-yearly': 'statistique',
        'settings-agency': 'settings', 'settings-company': 'settings', 'settings-software': 'settings', 'settings-sms': 'settings', 'settings-notifications': 'settings', 'settings-menus': 'settings', 'settings-agents': 'settings', 'settings-appointments': 'settings', 'settings-profile': 'settings',
        'config-invoice': 'configuration', 'config-label': 'configuration', 'config-container': 'configuration', 'config-objectives': 'configuration', 'config-charges': 'configuration',
        'prospecting': 'prospecting',
        'audit-log': 'audit-log'
    },

    // Données simulées externalisées
    data: appData,

    init() {
        // Expose l'objet app à l'objet global Window AVANT de rendre la page
        window.app = this;
        
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

                if (this.unsubContainerGauge) this.unsubContainerGauge();
                const q = query(collection(db, "transactions"), where("conteneur", "==", activeContainer), where("agency", "==", activeAgency), where("isDeleted", "==", false));
                
                this.unsubContainerGauge = onSnapshot(q, (transSnap) => {
                    let totalCBM = 0;
                    transSnap.forEach(doc => { totalCBM += parseFloat(doc.data().volumeCBM) || 0; });
                    this.updateGaugeUI(totalCBM);
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
        const pendingQuotes = this.data.quoteRequests.length;
        const unreadMessages = this.data.messages.filter(m => !m.read).length;
        const unreadNotifications = this.data.notifications.filter(n => !n.read).length;

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
        
        const quoteBadge = document.getElementById('quoteRequestsBadge');
        if (quoteBadge) quoteBadge.textContent = pendingQuotes;
        
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
            'balance-monthly': 'Bilan mensuel',
            'balance-yearly': 'Bilan annuel',
            'balance-boat': 'Bilan bateau',
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
            'dashboard': () => this.renderDashboard(),
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
            'departures-calendar': () => this.renderDeparturesCalendar(),
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
            'chat': () => this.renderChat(),
            'sms-send': () => this.renderSmsSend(),
            'sms-history': () => this.renderSmsHistory(),
            'notifications': () => this.renderNotifications(),
            'notifications-history': () => this.renderNotificationsHistory(),
            'products-list': () => ProductsListView.render(this),
            'finance-cashier': () => FinanceCaisseView.render(this),
            'finance-cheques': () => FinanceChequesView.render(this),
            'finance-expenses': () => FinanceDepensesView.render(this),
            'stock-list': () => this.renderStockList(),
            'balance-monthly': () => this.renderBalanceMonthly(),
            'balance-yearly': () => this.renderBalanceYearly(),
            'balance-boat': () => this.renderBalanceBoat(),
            'balance-12m': () => this.renderBalance12M(),
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
            'settings-appointments': () => this.renderSettingsAppointments(),
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

    renderDashboard() {
        DashboardView.render(this);
    },

    renderDailyBilan() {
        const today = new Date().toISOString().split('T')[0];
        const todayInvoices = this.data.invoices.filter(i => i.date === today);
        const total = todayInvoices.reduce((s, i) => s + i.amount, 0);
        
        const html = `
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${this.formatMoney(total)}</div>
                    <div class="stat-label">Encaissements du jour</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${todayInvoices.length}</div>
                    <div class="stat-label">Factures émises</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${this.data.appointments.filter(a => a.date === today).length}</div>
                    <div class="stat-label">RDV aujourd'hui</div>
                </div>
            </div>
            
            <div class="form-card">
                <h3>Résumé détaillé</h3>
                <table class="data-table">
                    <thead>
                        <tr><th>Client</th><th>Facture</th><th>Montant</th><th>Statut</th><th>Action</th></tr>
                    </thead>
                    <tbody>
                        ${todayInvoices.length === 0 ? '<tr><td colspan="5" style="text-align:center;">Aucune opération aujourd\'hui</td></tr>' : todayInvoices.map(inv => `
                            <tr>
                                <td>${inv.client}</td>
                                <td>${inv.number}</td>
                                <td>${this.formatMoney(inv.amount)}</td>
                                <td><span class="badge ${inv.status === 'payée' ? 'badge-success' : 'badge-warning'}">${inv.status}</span></td>
                                <td><button class="btn btn-outline btn-small" onclick="app.viewInvoice(${inv.id})">Détails</button></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
        document.getElementById('contentContainer').innerHTML = html;
    },

    renderDailyUsers() {
        const userStats = {
            'Jean Dupont': { invoices: 2, amount: 450.00 },
            'Marie Koné': { invoices: 1, amount: 180.00 },
            'Ibrahim Touré': { invoices: 1, amount: 320.00 }
        };
        
        const html = `
            <div class="form-card">
                <h3>Bilan par utilisateur</h3>
                <table class="data-table">
                    <thead><tr><th>Utilisateur</th><th>Nb factures</th><th>Montant total</th><th>Actions</th></tr></thead>
                    <tbody>
                        ${Object.entries(userStats).map(([user, stats]) => `
                            <tr>
                                <td><strong>${user}</strong></td>
                                <td>${stats.invoices}</td>
                                <td>${this.formatMoney(stats.amount)}</td>
                                <td><button class="btn btn-outline btn-small" onclick="app.showToast('Détails de ${user}')">Voir détail</button></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
        document.getElementById('contentContainer').innerHTML = html;
    },

    renderInvoiceNew() {
        const html = `
            <div class="form-card">
                <h3>Créer une nouvelle facture</h3>
                <div class="form-grid">
                    <div class="form-group">
                        <label>Client</label>
                        <input type="text" id="invoiceClient" placeholder="Nom du client">
                    </div>
                    <div class="form-group">
                        <label>Date</label>
                        <input type="date" id="invoiceDate" value="${new Date().toISOString().split('T')[0]}">
                    </div>
                    <div class="form-group">
                        <label>Montant (€)</label>
                        <input type="number" id="invoiceAmount" placeholder="Montant">
                    </div>
                    <div class="form-group">
                        <label>Description</label>
                        <textarea id="invoiceDesc" rows="3" placeholder="Détail de la prestation"></textarea>
                    </div>
                </div>
                <div style="margin-top: 20px; display: flex; gap: 10px;">
                    <button class="btn btn-primary" onclick="app.createInvoice()"><i class="fas fa-save"></i> Générer la facture</button>
                    <button class="btn btn-outline" onclick="app.renderPage('invoices-list')">Annuler</button>
                </div>
            </div>
            <div class="invoice-preview" id="invoicePreview" style="display:none;">
                <h4>Aperçu facture</h4>
                <div id="previewContent"></div>
            </div>
        `;
        document.getElementById('contentContainer').innerHTML = html;
    },

    renderDeparturesCalendar() {
        const html = `
            <div class="calendar-container">
                <div id="departureCalendar" style="height: 500px;"></div>
            </div>
        `;
        document.getElementById('contentContainer').innerHTML = html;
        
        setTimeout(() => {
            if (typeof Calendar !== 'undefined') {
                const calendarEl = document.getElementById('departureCalendar');
                new Calendar(calendarEl, {
                    initialView: 'dayGridMonth',
                    locale: 'fr',
                    events: [
                        { title: 'Départ CONT-001', start: '2024-12-20', color: '#3b82f6' },
                        { title: 'Arrivée CONT-002', start: '2024-12-25', color: '#10b981' }
                    ]
                }).render();
            }
        }, 100);
    },


    renderLoadingBoats() {
        const html = `
            <div class="form-card">
                <h3>Départs bateaux</h3>
                <div style="margin-bottom: 20px;">
                    <button class="btn btn-primary" onclick="app.addBoatDeparture()"><i class="fas fa-plus"></i> Planifier départ</button>
                </div>
                <table class="data-table">
                    <thead><tr><th>Bateau</th><th>Date départ</th><th>Date arrivée prévue</th><th>Statut</th></tr></thead>
                    <tbody>
                        <tr><td>CMA CGM</td><td>15/12/2024</td><td>20/12/2024</td><td><span class="badge badge-info">Planifié</span></td></tr>
                        <tr><td>MSC</td><td>18/12/2024</td><td>23/12/2024</td><td><span class="badge badge-info">Planifié</span></td></tr>
                    </tbody>
                </table>
            </div>
        `;
        document.getElementById('contentContainer').innerHTML = html;
    },

    renderScanClassic() {
        this.renderScanWarehouse();
    },

    renderScanHistory() {
        const html = `
            <div class="form-card">
                <h3>Historique des scans</h3>
                <table class="data-table">
                    <thead><tr><th>Date</th><th>Code-barres</th><th>Opération</th><th>Utilisateur</th></tr></thead>
                    <tbody>
                        <tr><td>2024-12-14 10:30</td><td><code>MD-127-E2</code></td><td>Mise en entrepôt</td><td>Agent Paris</td></tr>
                        <tr><td>2024-12-14 11:20</td><td><code>AB-031-E6</code></td><td>Chargement conteneur</td><td>Agent Paris</td></tr>
                    </tbody>
                </table>
            </div>
        `;
        document.getElementById('contentContainer').innerHTML = html;
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

    renderChat() {
        const html = `
            <div class="form-card" style="height: 70vh; display: flex; flex-direction: column;">
                <div style="flex: 1; overflow-y: auto; padding: 15px; background: #f8fafc; border-radius: 12px;">
                    ${this.data.messages.map(msg => `
                        <div style="margin-bottom: 15px; ${msg.from === 'Agent Paris' ? 'text-align: right;' : ''}">
                            <div style="display: inline-block; max-width: 70%; padding: 10px 15px; border-radius: 15px; ${msg.from === 'Agent Paris' ? 'background: #3b82f6; color: white;' : 'background: white; border: 1px solid #e2e8f0;'}">
                                <div style="font-size: 12px; font-weight: bold;">${msg.from}</div>
                                <div style="margin-top: 4px;">${msg.message}</div>
                                <div style="font-size: 10px; opacity: 0.7; margin-top: 4px;">${msg.time}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div style="display: flex; gap: 10px; margin-top: 15px;">
                    <input type="text" id="chatMessage" placeholder="Votre message..." style="flex: 1; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px;">
                    <button class="btn btn-primary" onclick="app.sendMessage()"><i class="fas fa-paper-plane"></i> Envoyer</button>
                </div>
            </div>
        `;
        document.getElementById('contentContainer').innerHTML = html;
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

    renderNotifications() {
        const unread = this.data.notifications.filter(n => !n.read);
        const html = `
            <div class="form-card">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3>Notifications (${unread.length} non lues)</h3>
                    <button class="btn btn-outline btn-small" onclick="app.markAllRead()">Tout marquer comme lu</button>
                </div>
                <div>
                    ${this.data.notifications.map(notif => `
                        <div style="padding: 15px; border-bottom: 1px solid #f1f5f9; ${!notif.read ? 'background: #eff6ff;' : ''}">
                            <div style="display: flex; justify-content: space-between;">
                                <strong>${notif.title}</strong>
                                <span style="font-size: 11px; color:#64748b;">${notif.time}</span>
                            </div>
                            <p style="margin-top: 5px; font-size: 13px;">${notif.message}</p>
                            <div style="margin-top: 8px;">
                                <button class="btn btn-outline btn-small" onclick="app.markRead(${notif.id})">Marquer lu</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        document.getElementById('contentContainer').innerHTML = html;
    },

    renderNotificationsHistory() {
        const html = `
            <div class="form-card">
                <h3>Historique des notifications</h3>
                <table class="data-table">
                    <thead><tr><th>Date</th><th>Titre</th><th>Message</th><th>Lu le</th></tr></thead>
                    <tbody>
                        <tr><td>2024-12-10</td><td>Nouvelle facture</td><td>Facture FAC-2024-001 émise</td><td>2024-12-10 14:30</td></tr>
                        <tr><td>2024-12-05</td><td>Rappel RDV</td><td>RDV avec Jean Dupont</td><td>2024-12-05 09:15</td></tr>
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

    renderBalanceMonthly() { this.renderChartPage('balance-monthly', 'monthly'); },
    renderBalanceYearly() { this.renderChartPage('balance-yearly', 'yearly'); },
    renderBalanceBoat() { this.renderChartPage('balance-boat', 'boat'); },
    renderBalance12M() { this.renderChartPage('balance-12m', 'yearly'); },
    renderStatsBoat() { this.renderChartPage('stats-boat', 'boat'); },
    renderStatsMonthly() { this.renderChartPage('stats-monthly', 'monthly'); },
    renderStatsYearly() { this.renderChartPage('stats-yearly', 'yearly'); },

    renderChartPage(pageId, type) {
        const html = `
            <div class="form-card">
                <h3>Graphiques et Statistiques</h3>
                <div style="position: relative; height: 300px; width: 100%;">
                    <canvas id="chart-${type}"></canvas>
                </div>
            </div>
        `;
        document.getElementById('contentContainer').innerHTML = html;
        setTimeout(() => {
            const ctx = document.getElementById(`chart-${type}`)?.getContext('2d');
            if (ctx) {
                let data, labels;
                if (type === 'monthly') {
                    labels = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun'];
                    data = [12500, 15000, 18000, 22000, 25000, 28000];
                } else if (type === 'yearly') {
                    labels = ['2020', '2021', '2022', '2023', '2024'];
                    data = [85000, 102000, 128000, 159000, 198000];
                } else if (type === 'boat') {
                    labels = ['CMA CGM', 'MSC', 'MAERSK', 'HAPAG'];
                    data = [24500, 21000, 17500, 19000];
                } else {
                    labels = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
                    data = [12500, 13200, 14800, 16500, 18500, 21000, 23500, 26000, 28500, 31000, 34000, 37000];
                }
                
                new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [{ label: 'Montant (€)', data: data, backgroundColor: '#3b82f6' }]
                    },
                    options: { responsive: true, scales: { y: { ticks: { callback: v => this.formatMoney(v) } } } }
                });
            }
        }, 100);
    },

    // Paramètres pages
    renderSettingsSoftware() { this.renderSettingsForm('Paramètres logiciel', { theme: 'Clair', language: 'Français', notifications: true, autoBackup: true }); },
    renderSettingsSms() { this.renderSettingsForm('Configuration SMS', { provider: 'API SMS', apiKey: '••••••••', sender: 'AMT PARIS' }); },
    renderSettingsNotifications() { this.renderSettingsForm('Notifications', { emailAlerts: true, smsAlerts: true, pushEnabled: true }); },
    
    renderSettingsAppointments() { this.renderSettingsForm('Paramètres RDV', { duration: 30, slotInterval: 15, workingHours: '09:00-18:00', reminderDelay: 24 }); },
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
            const headerAvatar = document.getElementById('userAvatar');
            if (headerAvatar) {
                headerAvatar.innerHTML = '';
                headerAvatar.style.backgroundImage = `url(${savedPhoto})`;
                headerAvatar.style.backgroundSize = 'cover';
                headerAvatar.style.backgroundPosition = 'center';
            }
        }
    },

    handleProfilePhotoChange(event) {
        const file = event.target.files[0];
        if (file) {
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
            const { auth, db } = await import('../../firebase-config.js');
            const { updateProfile, updatePassword } = await import('https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js');
            const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js');

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

            // 2. Mise à jour de la Photo
            if (this.tempProfilePhoto) {
                updates.photoURL = this.tempProfilePhoto;
                localStorage.setItem('userProfilePhoto', this.tempProfilePhoto);
                this.loadUserProfile();
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
        return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount || 0);
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
    sendMessage() { this.showToast('Message envoyé'); document.getElementById('chatMessage').value = ''; },
    sendSms() { this.showToast('SMS envoyé avec succès'); },
    markRead(id) { this.showToast('Notification marquée comme lue'); },
    markAllRead() { this.showToast('Toutes les notifications marquées comme lues'); },
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
    const refFont = isA5 ? '28pt' : '16pt';
    
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