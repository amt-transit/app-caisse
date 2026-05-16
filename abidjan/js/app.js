import { ClientsView } from '../../shared/views/clients.js';
import { DashboardView } from './views/dashboard.js';
import { ExpensesView } from './views/expenses.js';
import { MagasinageView } from './views/magasinage.js';
import { LivraisonView } from './views/livraison.js';
import { CaisseView } from './views/caisse.js';
import { AuditView } from './views/audit.js';
import { SettingsAgentsView } from '../../shared/views/settings-agents.js';
import { HistoryView } from './views/history.js';
import { BankView } from './views/bank.js';
import { OtherIncomeView } from './views/other-income.js';
import { SettingsSoftwareView } from './views/settings-software.js';
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
import { ScanLivrerView } from './views/scan-livrer.js';
import { ScanHistoryView } from './views/scan-history.js';
import { SmsView } from './views/sms.js';
import { ChatView } from './views/chat.js';
import { DailyBilanView } from '../../shared/views/daily-bilan.js';
import { DailyUsersView } from '../../shared/views/daily-users.js';
import { StatistiquesView } from '../../shared/views/statistiques.js';
import { ToutesLesFacturesView } from '../../shared/views/touteslesfactures.js';

import { ParrainageView } from '../../shared/views/parrainage.js';
import { SettingsRolesMenusView } from '../../shared/views/settings-roles-menus.js';

const app = {
    currentPage: 'clients',
    
    init() {
        window.app = this;
        this.initSidebarEvents();
        this.injectScanLivrerMenu();
        
        // Démarrage sur la dernière page visitée (ou 'clients' par défaut pour nos tests)
        const savedPage = sessionStorage.getItem('abidjanCurrentPage') || 'clients';
        this.renderPage(savedPage);
    },

    injectScanLivrerMenu() {
        // Ajoute dynamiquement le lien "Scan Remise Client" sous "Scan Mise en Livraison" dans le menu de gauche
        const scanLivraisonLink = document.querySelector('.sidebar-item[data-page="scan-livraison"]');
        
        if (scanLivraisonLink && !document.querySelector('.sidebar-item[data-page="scan-livrer"]')) {
            const newLink = document.createElement('a');
            newLink.href = "#";
            newLink.className = "sidebar-item";
            newLink.dataset.page = "scan-livrer";
            newLink.innerHTML = '<i class="fas fa-handshake" style="width: 25px; text-align: center;"></i> Remise Client';
            
            newLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.renderPage('scan-livrer');
                
                // Fermer le menu sur mobile après le clic
                if (window.innerWidth <= 1024) {
                    document.getElementById('sidebar')?.classList.remove('open');
                    document.getElementById('sidebarOverlay')?.classList.remove('show');
                }
            });
            
            // Insère le nouveau lien juste après le lien "Mise en Livraison"
            scanLivraisonLink.parentNode.insertBefore(newLink, scanLivraisonLink.nextSibling);
        }
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
            'settings-software': 'Paramètres logiciel',
            'prospecting': 'Prospections',
            'audit-log': 'Activités log',
            'scan-dechargement': 'Scan Déchargement',
            'scan-livraison': 'Scan Mise en Livraison',
            'scan-livrer': 'Scan Remise Client',
            'scan-history': 'Historique des Scans',
            'sms': 'Communication & SMS',
            'chat': 'Chat Interne',
            'daily-bilan': 'Bilan du jour',
            'daily-users': 'Bilan par utilisateurs',
            'stats-monthly': 'Statistiques Mensuelles',
            'stats-yearly': 'Statistiques Annuelles',
            'stats-boat': 'Stats Conteneur',
            'touteslesfactures': 'Toutes les factures',
            'chine-dashboard': 'Tableau de Bord Asie',
            'parrainage': 'Réseau Partenaires'
        };
        const titleEl = document.getElementById('pageTitle') || document.querySelector('.page-title');
        if (titleEl) titleEl.textContent = titleMap[page] || page;
        
        // 1b. Restaurer la barre du haut si elle a été masquée par la vue Caisse sur mobile
        const topBar = document.querySelector('.top-bar');
        if (topBar) topBar.style.removeProperty('display');

        // 2. Mettre à jour le menu actif
        document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
        const activeLink = document.querySelector(`.sidebar-item[data-page="${page}"]`);
        if (activeLink) activeLink.classList.add('active');

        // Mettre à jour le menu actif sur la Bottom Nav Mobile
        document.querySelectorAll('.bottom-nav-item').forEach(el => el.classList.remove('active'));
        const activeBnav = document.querySelector(`.bottom-nav-item[data-target="${page}"]`);
        if (activeBnav) activeBnav.classList.add('active');

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
            SettingsAgentsView.render(this, container);
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
        } else if (page === 'settings-software') {
            SettingsSoftwareView.render(this, container);
        } else if (page === 'settings-roles' || page === 'settings-menus') {
            SettingsRolesMenusView.render(this, container);
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
        } else if (page === 'scan-livrer') {
            ScanLivrerView.render(this, container);
        } else if (page === 'scan-history') {
            ScanHistoryView.render(this, container);
        } else if (page === 'sms') {
            SmsView.render(this, container);
        } else if (page === 'chat') {
            ChatView.render(this, container);
        } else if (page === 'daily-bilan') {
            DailyBilanView.render(this, container);
        } else if (page === 'daily-users') {
            DailyUsersView.render(this, container);
        } else if (page.startsWith('stats-')) {
            StatistiquesView.render(this, container, page.replace('stats-', ''));
        } else if (page === 'touteslesfactures') {
            ToutesLesFacturesView.render(this, container);
        } else if (page === 'chine-dashboard') {
            ChineDashboardView.render(this, container);
        } else if (page === 'parrainage') {
            ParrainageView.render(this, container);
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
    
    showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.style.cssText = 'position: fixed; bottom: 20px; right: 20px; background: ' + (type === 'success' ? '#10b981' : '#ef4444') + '; color: white; padding: 12px 20px; border-radius: 8px; z-index: 9999; box-shadow: 0 4px 6px rgba(0,0,0,0.1); transition: opacity 0.3s ease;';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    formatMoney(amount) {
        return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(amount || 0).replace(/[\u202F\u00A0]/g, ' ').replace(/\s*\/\s*/g, ' ');
    },
    
    async printLabels(data) {
        const format = localStorage.getItem('amt_label_format') || 'A5';
        const model = localStorage.getItem('amt_label_model') || 'classic';
        const headerColor = localStorage.getItem('amt_label_header_color') || '#000000';
        
        const dimensions = {
            A5: { width: 210, height: 148 },
            A6: { width: 148, height: 105 }
        };
        const dim = dimensions[format] || dimensions.A5;
        const widthMm = dim.width;
        const heightMm = dim.height;
        const pageSizeCss = `${widthMm}mm ${heightMm}mm`;
        
        const theme = { border: '#000', text: '#000' };
        
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
            labelsHtml += this.renderClassicLabel(widthMm, heightMm, qrDataUrl, data, label, theme, headerColor);
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

    initSidebarEvents() {
        const toggle = document.getElementById('mobileToggle');
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        const bnavMore = document.getElementById('bnav-more');

        const openSidebar = (e) => {
            if (e) e.stopPropagation();
            sidebar?.classList.add('open');
            overlay?.classList.add('show');
        };

        if (toggle) toggle.addEventListener('click', openSidebar);
        if (bnavMore) bnavMore.addEventListener('click', openSidebar);

        if (overlay) {
            overlay.addEventListener('click', () => {
                sidebar?.classList.remove('open');
                overlay?.classList.remove('show');
            });
        }
    }
};

// Démarrage sécurisé : si le DOM est déjà chargé à cause de l'attente de la base de données (Top-Level Await), on lance directement.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => app.init());
} else {
    app.init();
}