import { ClientsView } from './views/clients.js';
import { DashboardView } from './views/dashboard.js';
import { ExpensesView } from './views/expenses.js';
import { MagasinageView } from './views/magasinage.js';
import { LivraisonView } from './views/livraison.js';
import { CaisseView } from './views/caisse.js';
import { AuditView } from './views/audit.js';
import { AdminView } from './views/admin.js';
import { HistoryView } from './views/history.js';
import { BankView } from './views/bank.js';
import { OtherIncomeView } from './views/other-income.js';
import { VoitureView } from './views/voiture.js';
import { PointsView } from './views/points.js';
import { ComptejbView } from './views/comptejb.js';
import { SalaireView } from './views/salaire.js';
import { ConfirmationView } from './views/confirmation.js';
import { ProfilView } from '../../profil-view.js';
import { AuditLogView } from './views/audit-log.js';
import { ProspectingView } from './views/prospecting.js';
import { ScanDechargementView } from './views/scan-dechargement.js';
import { ScanLivraisonView } from './views/scan-livraison.js';

const app = {
    currentPage: 'clients',
    
    init() {
        window.app = this;
        this.initSidebarEvents();
        
        // Démarrage sur la dernière page visitée (ou 'clients' par défaut pour nos tests)
        const savedPage = sessionStorage.getItem('abidjanCurrentPage') || 'clients';
        this.renderPage(savedPage);
    },

    renderPage(page) {
        this.currentPage = page;
        sessionStorage.setItem('abidjanCurrentPage', page);
        
        // 1. Mettre à jour le titre de la page
        const titleMap = {
            'index': 'Saisie de Caisse',
            'dashboard': 'Tableau de Bord',
            'clients': 'Fichier Clients',
            'expenses': 'Dépenses',
            'magasinage': 'Frais de Magasinage',
            'history': 'Historique',
            'livraison': 'Gestion des Livraisons',
            'bank': 'Mouvements de Banque',
            'audit': 'Audit des Saisies',
            'admin-panel': 'Gestion des agents',
            'salaire': 'Gestion Salaires & RH',
            'comptejb': 'Livre de Caisse JB',
            'points': 'Points Utilisateurs',
            'voiture': 'Gestion Flotte & Véhicules',
            'other-income': 'Autres Entrées',
            'settings-profile': 'Mon Profil',
            'prospecting': 'Prospections',
            'audit-log': 'Activités log',
            'scan-dechargement': 'Scan Déchargement',
            'scan-livraison': 'Scan Mise en Livraison'
        };
        const titleEl = document.getElementById('pageTitle') || document.querySelector('.page-title');
        if (titleEl) titleEl.textContent = titleMap[page] || page;
        
        // 2. Mettre à jour le menu actif
        document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
        const activeLink = document.querySelector(`.sidebar-item[data-page="${page}"]`);
        if (activeLink) activeLink.classList.add('active');

        // 3. Charger la vue dans le conteneur
        const container = document.getElementById('contentContainer');
        if (!container) return;

        // Afficher le loader pendant la transition
        container.innerHTML = '<div class="loading" style="padding: 50px; text-align: center;"><i class="fas fa-spinner fa-spin fa-2x"></i><br><br>Chargement...</div>';

        // ROUTAGE : Si la vue JS existe, on la charge. Sinon, on affiche une transition.
        if (page === 'clients') {
            ClientsView.render(this, container);
        } else if (page === 'dashboard') {
            DashboardView.render(this, container);
        } else if (page === 'expenses') {
            ExpensesView.render(this, container);
        } else if (page === 'magasinage') {
            MagasinageView.render(this, container);
        } else if (page === 'livraison') {
            LivraisonView.render(this, container);
        } else if (page === 'index') {
            CaisseView.render(this, container);
        } else if (page === 'audit') {
            AuditView.render(this, container);
        } else if (page === 'admin-panel') {
            AdminView.render(this, container);
        } else if (page === 'history') {
            HistoryView.render(this, container);
        } else if (page === 'bank') {
            BankView.render(this, container);
        } else if (page === 'other-income') {
            OtherIncomeView.render(this, container);
        } else if (page === 'voiture') {
            VoitureView.render(this, container);
        } else if (page === 'points') {
            PointsView.render(this, container);
        } else if (page === 'comptejb') {
            ComptejbView.render(this, container);
        } else if (page === 'salaire') {
            SalaireView.render(this, container);
        } else if (page === 'confirmation') {
            ConfirmationView.render(this, container);
        } else if (page === 'livreurscan') {
            window.location.href = 'livreurscan.html';
        } else if (page === 'settings-profile') {
            ProfilView.render(this, container);
        } else if (page === 'prospecting') {
            ProspectingView.render(this, container);
        } else if (page === 'audit-log') {
            AuditLogView.render(this, container);
        } else if (page === 'scan-dechargement') {
            ScanDechargementView.render(this, container);
        } else if (page === 'scan-livraison') {
            ScanLivraisonView.render(this, container);
        } else {
            // Vue de transition pour les pages non encore migrées
            container.innerHTML = `
                <div style="padding: 50px; text-align: center; color: #64748b; background: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    <i class="fas fa-tools fa-3x" style="color: #FF8200; margin-bottom: 20px;"></i>
                    <h2>Module en cours de migration (SPA)</h2>
                    <p>Le module <b>${page}</b> fonctionne toujours sur son ancienne page HTML pour le moment.</p>
                <a href="../${page}.html" class="btn" style="margin-top: 15px; display: inline-block; text-decoration: none; background: #009A44; color: white; padding: 10px 20px; border-radius: 8px;">Ouvrir l'ancienne version</a>
                </div>
            `;
        }
    },

    initSidebarEvents() {
        const toggle = document.getElementById('mobileToggle');
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');

        if (toggle) {
            toggle.addEventListener('click', () => {
                sidebar?.classList.add('open');
                overlay?.classList.add('show');
            });
        }

        if (overlay) {
            overlay.addEventListener('click', () => {
                sidebar?.classList.remove('open');
                overlay?.classList.remove('show');
            });
        }
    }
};

document.addEventListener('DOMContentLoaded', () => app.init());