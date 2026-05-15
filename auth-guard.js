import { auth, db } from './firebase-config.js';
import { AGENCIES, getDepartureAgencies, getArrivalAgencies, getCollectionName } from './agencies-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { doc, getDoc, updateDoc, collection, query, where, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// --- MISE À JOUR VISUELLE INSTANTANÉE (Pré-chargement) ---
const applyCachedProfile = () => {
    const cachedName = sessionStorage.getItem('userName');
    const cachedPhoto = localStorage.getItem('userProfilePhoto');
    const headers = document.querySelectorAll('.app-header, .mob-header, .top-bar');
    headers.forEach(header => {
        if (cachedName) {
            const userNameEl = header.querySelector('.user-name-display, #userName');
            if (userNameEl) userNameEl.textContent = cachedName;
        }
        if (cachedPhoto) {
            const userAvatarEl = header.querySelector('.user-avatar');
            if (userAvatarEl) {
                userAvatarEl.style.backgroundImage = `url('${cachedPhoto}')`;
                userAvatarEl.style.backgroundSize = 'cover';
                userAvatarEl.style.backgroundPosition = 'center';
                userAvatarEl.style.color = 'transparent';
                userAvatarEl.innerHTML = '';
            }
        }
    });
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyCachedProfile);
else applyCachedProfile();

// --- FONCTION GLOBALE DE DÉCONNEXION ---
window.appHandleLogout = async () => {
    const confirmLogout = window.AppModal ? 
        await window.AppModal.confirm("Voulez-vous vous déconnecter ?", "Déconnexion", true) : 
        confirm("Voulez-vous vous déconnecter ?");
        
    if (confirmLogout) {
        try {
            // Marquer l'utilisateur comme déconnecté dans Firestore
            if (auth.currentUser) {
                await updateDoc(doc(db, 'users', auth.currentUser.uid), { isOnline: false }).catch(e => console.error(e));
            }
            await signOut(auth);
            sessionStorage.clear();
            const isSubFolder = window.location.pathname.includes('/paris/') || window.location.pathname.includes('/abidjan/');
            window.location.href = isSubFolder ? '../login.html' : 'login.html';
        } catch (error) {
            console.error("Erreur lors de la déconnexion:", error);
        }
    }
};

onAuthStateChanged(auth, async (user) => {
    
    if (!user) {
        // Pas connecté, redirection normale vers login
        if (!window.location.pathname.includes('login.html')) {
            const isSubFolder = window.location.pathname.includes('/paris/') || window.location.pathname.includes('/abidjan/');
            window.location.href = isSubFolder ? '../login.html' : 'login.html';
        }
        return;
    }

    try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);

        const showErrorAndRedirect = async (msg, title, url = 'index.html') => {
            if (window.AppModal) await window.AppModal.error(msg, title);
            else alert(title + "\n\n" + msg);
            const inSubFolder = window.location.pathname.includes('/paris/') || window.location.pathname.includes('/abidjan/');
            window.location.href = (inSubFolder && url === 'login.html') ? '../login.html' : url;
        };

        // DIAGNOSTIC 1 : Le document existe-t-il ?
        if (!userDocSnap.exists()) {
            if (window.AppModal) await window.AppModal.error("ERREUR CRITIQUE :\n\nVotre compte de connexion existe, mais votre 'Fiche Utilisateur' (Rôle) est introuvable dans la base de données.\n\nID cherché : " + user.uid, "Profil introuvable");
            else alert("ERREUR CRITIQUE :\n\nVotre compte de connexion existe, mais votre 'Fiche Utilisateur' (Rôle) est introuvable dans la base de données.\n\nID cherché : " + user.uid);
            throw new Error("Profil utilisateur introuvable dans Firestore.");
        }

        const userData = userDocSnap.data();
        const userRole = userData.role; 
        
        // DIAGNOSTIC 2 : Le rôle est-il valide ?
        if (!userRole) {
            if (window.AppModal) await window.AppModal.error("ERREUR CRITIQUE :\n\nVotre fiche utilisateur existe, mais le champ 'role' est vide.", "Rôle manquant");
            else alert("ERREUR CRITIQUE :\n\nVotre fiche utilisateur existe, mais le champ 'role' est vide.");
            throw new Error("Champ 'role' manquant.");
        }

        // --- NOUVEAU : SYSTÈME DE PRÉSENCE (En Ligne) ---
        // Marquer l'utilisateur comme en ligne avec la date d'activité
        updateDoc(userDocRef, { lastActive: new Date().toISOString(), isOnline: true }).catch(e => console.error(e));
        // Mettre à jour l'activité toutes les 3 minutes pendant qu'il navigue
        window.presenceInterval = setInterval(() => {
            updateDoc(userDocRef, { lastActive: new Date().toISOString() }).catch(e => console.error(e));
        }, 3 * 60 * 1000);

        // --- CHARGEMENT DES PERMISSIONS DYNAMIQUES ---
        let userPermissions = [];
        try {
            const roleDocSnap = await getDoc(doc(db, 'roles', userRole));
            if (roleDocSnap.exists()) {
                userPermissions = roleDocSnap.data().permissions || [];
            }
        } catch (e) { console.warn("Impossible de charger les permissions:", e); }

        // Stockage session
        let userName = userData.displayName;
        if (!userName && userData.email) {
            userName = userData.email.split('@')[0];
            userName = userName.charAt(0).toUpperCase() + userName.slice(1);
        }
        sessionStorage.setItem('userRole', userRole);
        sessionStorage.setItem('userPermissions', JSON.stringify(userPermissions));
        sessionStorage.setItem('userName', userName || 'Utilisateur');
        sessionStorage.setItem('userAgency', userData.agency || 'abidjan');

        // Détermination de l'agence actuellement "Active"
        let currentActiveAgency = sessionStorage.getItem('currentActiveAgency');
        if (!currentActiveAgency || (userData.agency !== 'all' && currentActiveAgency !== userData.agency)) {
            currentActiveAgency = userData.agency === 'all' ? 'abidjan' : (userData.agency || 'abidjan');
            sessionStorage.setItem('currentActiveAgency', currentActiveAgency);
        }

        // --- INJECTION DYNAMIQUE DU MENU PROFIL (POUR TOUTES LES PAGES ET MOBILES) ---
        const headers = document.querySelectorAll('.app-header, .mob-header, .top-bar');
        headers.forEach((header) => {
            // 1. Nettoyage des anciens boutons
            const oldLogoutBtn = Array.from(header.children).find(el => el.id === 'logoutBtn' && el.tagName === 'BUTTON');
            if (oldLogoutBtn) oldLogoutBtn.remove();
            const mobProfileBtn = header.querySelector('#mob-profileBtn');
            if (mobProfileBtn) mobProfileBtn.remove();

            const agencyLinksHtml = Object.values(AGENCIES).map(a => {
                const isActive = a.id === currentActiveAgency;
                const style = isActive ? 'background-color: #eff6ff; color: #3b82f6; font-weight: bold; border-left: 3px solid #3b82f6;' : '';
                const checkIcon = isActive ? '<i class="fas fa-check" style="margin-left: auto;"></i>' : '';
                
                return `<a href="#" onclick="window.switchAgency('${a.id}'); return false;" style="${style}"><i class="fas fa-plane-${a.type === 'departure' ? 'departure' : 'arrival'}"></i> ${a.name} ${a.flag} ${checkIcon}</a>`;
            }).join('');

            // 2. Injecter le nouveau bloc utilisateur s'il n'existe pas encore
            if (!header.querySelector('.user-info')) {
                const avatarStyle = userData.photoURL 
                    ? `background-image: url('${userData.photoURL}'); background-size: cover; background-position: center; color: transparent;`
                    : '';
                const avatarInner = userData.photoURL ? '' : '<i class="fas fa-user"></i>';
                
                // On masque le texte du nom sur la version mobile pour gagner de la place
                const hideName = header.classList.contains('mob-header') ? 'display: none;' : '';
            
                const userInfoHtml = `
                    <div class="user-info" style="position: absolute; right: 20px; display: flex; align-items: center; gap: 10px;">
                        <span class="user-name-display" style="font-weight: bold; font-size: 14px; ${hideName}">${userName || 'Utilisateur'}</span>
                        <div class="user-dropdown-container">
                            <div class="user-avatar avatar" title="Menu Utilisateur" style="${avatarStyle}">
                                ${avatarInner}
                            </div>
                            <div class="user-dropdown-menu">
                                <a href="#" onclick="if(window.app && window.app.renderPage) { window.app.renderPage('settings-profile'); } else { window.location.href = 'profil.html'; } const menu = this.closest('.user-dropdown-menu'); if(menu) menu.classList.remove('active'); return false;"><i class="fas fa-user-circle"></i> Profil</a>
                                <div id="agencySwitcherContainer" style="display: none;">
                                    <div style="padding: 5px 20px; font-size: 11px; font-weight: 800; color: #94a3b8; text-transform: uppercase; margin-top: 5px;">Changer d'agence</div>
                                    ${agencyLinksHtml}
                                </div>
                                <hr style="margin: 5px 0; border: none; border-top: 1px solid #e2e8f0;">
                                <a href="#" class="logout-btn logout" onclick="window.appHandleLogout(); return false;"><i class="fas fa-sign-out-alt"></i> Déconnexion</a>
                            </div>
                        </div>
                    </div>
                `;
                header.insertAdjacentHTML('beforeend', userInfoHtml);
                if (userData.photoURL) {
                    localStorage.setItem('userProfilePhoto', userData.photoURL);
                }
            } else {
            const userNameEl = header.querySelector('.user-name-display, #userName');
                if (userNameEl) userNameEl.textContent = userName || 'Utilisateur';
                
                const userAvatarEl = header.querySelector('.user-avatar');
                if (userAvatarEl && userData.photoURL) {
                    userAvatarEl.style.backgroundImage = `url('${userData.photoURL}')`;
                    userAvatarEl.style.backgroundSize = 'cover';
                    userAvatarEl.style.backgroundPosition = 'center';
                    userAvatarEl.style.color = 'transparent';
                    userAvatarEl.innerHTML = '';
                    localStorage.setItem('userProfilePhoto', userData.photoURL);
                }
                
                // Mettre à jour le menu des agences s'il existe déjà en dur dans le fichier HTML
                const agencyContainer = header.querySelector('#agencySwitcherContainer');
                if (agencyContainer) {
                    agencyContainer.innerHTML = `
                        <div style="padding: 5px 20px; font-size: 11px; font-weight: 800; color: #94a3b8; text-transform: uppercase; margin-top: 5px;">Changer d'agence</div>
                        ${agencyLinksHtml}
                    `;
                }
            }
        });

        // --- CHARGEMENT DU BRANDING DE L'AGENCE (Couleurs, Logo, Nom) ---
        const loadAgencyBranding = async (agencyId) => {
            try {
                const cacheKey = `branding_${agencyId}`;
                const cached = sessionStorage.getItem(cacheKey);
                
                const applyBranding = (branding) => {
                    if (branding.color) document.documentElement.style.setProperty('--primary', branding.color);
                    
                    if (branding.secondary) document.documentElement.style.setProperty('--secondary', branding.secondary);
                    else if (branding.color) document.documentElement.style.setProperty('--secondary', branding.color); // Menu uni si pas de couleur secondaire
                    
                    if (branding.bg) document.documentElement.style.setProperty('--bg-body', branding.bg);
                    
                    if (branding.logo) document.querySelectorAll('.app-logo, .sidebar-logo img').forEach(img => img.src = branding.logo);
                    if (branding.name) document.querySelectorAll('.sidebar-header h2').forEach(h2 => h2.textContent = branding.name);

                    if (branding.fontFamily) {
                        const fontName = branding.fontFamily.split(',')[0].replace(/'/g, '').trim();
                        if (fontName !== 'Inter') {
                            let link = document.getElementById('dynamic-google-font');
                            if (!link) {
                                link = document.createElement('link');
                                link.id = 'dynamic-google-font';
                                link.rel = 'stylesheet';
                                document.head.appendChild(link);
                            }
                            link.href = `https://fonts.googleapis.com/css2?family=${fontName.replace(/\\s+/g, '+')}:wght@300;400;500;600;700;800&display=swap`;
                        }
                        document.body.style.setProperty('font-family', branding.fontFamily, 'important');
                    }
                    if (branding.baseFontSize) {
                        document.body.style.setProperty('font-size', branding.baseFontSize, 'important');
                    }
                    
                    let styleEl = document.getElementById('dynamic-global-design');
                    if (!styleEl) {
                        styleEl = document.createElement('style');
                        styleEl.id = 'dynamic-global-design';
                        document.head.appendChild(styleEl);
                    }
                    styleEl.textContent = `
                        body { background: var(--bg-body) !important; }
                        .sidebar { background: var(--secondary) !important; }
                        .btn-primary, .btn-primary:hover { background: var(--primary) !important; border-color: var(--primary) !important; }
                        .stat-card .stat-icon { background: var(--primary) !important; color: white !important; }
                    `;
                };

                if (cached) applyBranding(JSON.parse(cached));

                // Résolution de l'agence "Mère" (Départ) pour charger les bons paramètres (Logo, Couleurs)
                let settingAgencyId = agencyId;
                if (AGENCIES[agencyId] && AGENCIES[agencyId].type === 'arrival') {
                    if (agencyId === 'abidjan') settingAgencyId = 'paris'; // Mapping par défaut
                    else if (agencyId.includes('_')) settingAgencyId = agencyId.split('_')[1]; // ex: abidjan_chine -> chine
                }

                const [cfgSnap, compSnap, designSnap] = await Promise.all([
                    getDoc(doc(db, 'settings', `invoice_config_${settingAgencyId}`)),
                    getDoc(doc(db, 'settings', `company_${settingAgencyId}`)),
                    getDoc(doc(db, 'settings', `design_${agencyId}`))
                ]);
                
                let branding = {};
                if (cfgSnap.exists()) { branding.color = cfgSnap.data().primaryColorHex; branding.logo = cfgSnap.data().logoUrl; }
                
                if (cfgSnap.exists() && cfgSnap.data().secondaryColorHex) branding.secondary = cfgSnap.data().secondaryColorHex;
                if (cfgSnap.exists() && cfgSnap.data().bgColorHex) branding.bg = cfgSnap.data().bgColorHex;
                
                if (compSnap.exists()) {
                    const compData = compSnap.data();
                    if (!branding.logo && compSnap.data().logoBase64) branding.logo = compSnap.data().logoBase64;
                    if (compSnap.data().name) branding.name = compSnap.data().name;
                    
                    // Priorité aux couleurs définies globalement dans "Paramètres Entreprise"
                    if (compData.appPrimaryColor) branding.color = compData.appPrimaryColor;
                    if (compData.appSecondaryColor) branding.secondary = compData.appSecondaryColor;
                    if (compData.appBgColor) branding.bg = compData.appBgColor;
                }

                if (designSnap.exists()) {
                    const d = designSnap.data();
                    if (d.primaryColor) branding.color = d.primaryColor;
                    if (d.secondaryColor) branding.secondary = d.secondaryColor;
                    if (d.bgColor) branding.bg = d.bgColor;
                    if (d.logoBase64) branding.logo = d.logoBase64;
                    if (d.agencyName) branding.name = d.agencyName;
                    if (d.fontFamily) branding.fontFamily = d.fontFamily;
                    if (d.baseFontSize) branding.baseFontSize = d.baseFontSize;
                }
                
                sessionStorage.setItem(cacheKey, JSON.stringify(branding));
                applyBranding(branding);
            } catch(e) { console.error("Branding error:", e); }
        };
        await loadAgencyBranding(currentActiveAgency);

        // --- REDIRECTION AUTOMATIQUE VERS LA BONNE INTERFACE ---
        const pathUrl = window.location.pathname;
        const inParisFolder = pathUrl.includes('/paris/');
        const inAbidjanFolder = pathUrl.includes('/abidjan/');
        const isLogin = pathUrl.includes('login.html');

        // Séparation logique : Les agences de "Départ" vont dans le dossier /paris/, les agences "d'Arrivée" vont dans /abidjan/
        const departureAgencies = getDepartureAgencies();
        const arrivalAgencies = getArrivalAgencies();

        if (departureAgencies.includes(currentActiveAgency) && !inParisFolder) {
            window.location.href = inAbidjanFolder ? '../paris/index.html' : 'paris/index.html';
            return;
        } else if (arrivalAgencies.includes(currentActiveAgency) && inParisFolder) {
            window.location.href = '../abidjan/index.html';
            return;
        } else if (isLogin) {
            window.location.href = 'index.html';
            return;
        }

        document.body.classList.add('role-' + userRole);
        document.body.classList.add('agency-' + currentActiveAgency);

        // --- INJECTION DU SÉLECTEUR D'AGENCE (Pour les comptes Globaux) ---
        if (userData.agency === 'all' || userRole === 'super_admin') {
            document.querySelectorAll('#agencySwitcherContainer').forEach(container => {
                container.style.display = 'block';
            });
            
            window.switchAgency = (targetAgency) => {
                sessionStorage.setItem('currentActiveAgency', targetAgency);
                const needsDepartureApp = departureAgencies.includes(targetAgency);

                if (needsDepartureApp && !inParisFolder) {
                    window.location.href = inAbidjanFolder ? '../paris/index.html' : 'paris/index.html';
                } else if (!needsDepartureApp && inParisFolder) {
                    window.location.href = '../abidjan/index.html';
                } else {
                    window.location.reload();
                }
            };
        }

        // --- GESTION GLOBALE DU BADGE DE NOTIFICATION (Placé ici pour s'exécuter AVANT les return) ---
        // Vérification des sessions en attente sur toutes les pages
        const logsRef = collection(db, getCollectionName("audit_logs"));
        const badgeQuery = query(logsRef, where("action", "==", "VALIDATION_JOURNEE"), orderBy("date", "desc"));
        
        onSnapshot(badgeQuery, snapshot => {
                let pendingCount = 0;
                snapshot.forEach(doc => {
                    if (doc.data().status !== "VALIDATED") {
                        pendingCount++;
                    }
                });
                const navItem = document.getElementById('nav-confirmation');
                if (navItem) {
                    // On retire l'ancienne classe qui mettait le "!"
                    navItem.classList.remove('has-pending');

                    // On cherche ou on crée le badge pour le compteur
                    let badge = navItem.querySelector('.pending-count-badge');
                    if (!badge) {
                        badge = document.createElement('span');
                        badge.className = 'pending-count-badge';
                        // Style du badge
                        badge.style.cssText = "background-color:#ef4444; color:white; border-radius:10px; padding:1px 6px; font-size:10px; font-weight:bold; margin-left:5px; vertical-align:super;";
                        
                        // On essaie de l'insérer dans le lien <a> pour un meilleur alignement
                        const link = navItem.querySelector('a');
                        if (link) link.appendChild(badge);
                        else navItem.appendChild(badge);
                    }

                    // On met à jour le compteur et la visibilité
                    if (pendingCount > 0) {
                        badge.textContent = pendingCount;
                        badge.style.display = 'inline-block';
                    } else {
                        badge.style.display = 'none';
                    }
                }
            }, error => console.log("Badge check info:", error.message));

        // --- GESTION DES ACCÈS ---
        const currentPage = window.location.pathname;

        // SUPER ADMIN
        if (userRole === 'super_admin') {
            // On ré-affiche l'onglet Admin
            const navAdmin = document.getElementById('nav-admin');
            const navCompteJB = document.getElementById('nav-comptejb');
            if (navAdmin) navAdmin.style.display = 'block';
            if (navCompteJB) navCompteJB.style.display = 'block';
            document.body.style.display = 'block';
            return;
        }

        // Protection page Admin et Compte JB
        if (currentPage.includes('admin-panel.html') || currentPage.includes('comptejb.html')) {
            if (userRole !== 'admin') {
                await showErrorAndRedirect("Accès réservé aux Administrateurs.", "Accès Refusé");
                return;
            }
        }

        // Protection page Points
        if (currentPage.includes('points.html')) {
            if (userRole !== 'admin' && userRole !== 'super_admin' && userRole !== 'spectateur') {
                await showErrorAndRedirect("Accès refusé : Réservé aux Administrateurs.", "Accès Refusé");
                return;
            }
        }

        // Protection page Audit
        if (currentPage.includes('audit.html')) {
            if (userRole !== 'admin' && userRole !== 'super_admin' && userRole !== 'spectateur') {
                await showErrorAndRedirect("Accès refusé : Réservé aux Administrateurs.", "Accès Refusé");
                return;
            }
        }

        // ADMIN
        if (userRole === 'admin') {
            document.body.style.display = 'block';
            return;
        }

        // SPECTATEUR
        if (userRole === 'spectateur') {
            document.body.style.display = 'block';
            // On continue pour masquer les liens de navigation si nécessaire
        }

        const navAdmin = document.getElementById('nav-admin');
        const navAudit = document.getElementById('nav-audit');
        const navCompteJB = document.getElementById('nav-comptejb');
        const navParis = document.getElementById('nav-paris');

        if (navParis) {
            if (userRole === 'super_admin' || userRole === 'admin' || userData.agency === 'all' || userData.agency === 'paris') {
                navParis.style.display = 'inline-flex';
            } else {
                navParis.style.display = 'none';
            }
        }

        if (navAdmin && userRole !== 'super_admin' && userRole !== 'admin') navAdmin.style.display = 'none';
        if (navCompteJB && userRole !== 'super_admin' && userRole !== 'admin') navCompteJB.style.display = 'none';
        if (navAudit && (userRole !== 'admin' && userRole !== 'super_admin' && userRole !== 'spectateur')) navAudit.style.display = 'none';

        // Note : Le reste du masquage des menus est désormais géré dynamiquement par app.js via la configuration Firebase (settings-menus.js)
        document.body.style.display = 'block';

    } catch (error) {
        console.error("Erreur auth :", error);
        // On ne déconnecte PAS tout de suite pour vous laisser lire l'alerte si c'est une erreur de permission
        if (error.code === 'permission-denied') {
             if (window.AppModal) await window.AppModal.error("Les règles de sécurité de Firestore bloquent la lecture de votre profil.\nVérifiez l'onglet 'Règles' dans la console Firebase.", "ERREUR PERMISSION");
             else alert("ERREUR PERMISSION : Les règles de sécurité de Firestore bloquent la lecture de votre profil.\nVérifiez l'onglet 'Règles' dans la console Firebase.");
        }
        signOut(auth);
        window.location.href = window.location.pathname.includes('/paris/') ? '../login.html' : 'login.html';
    }
});

// --- GESTION GLOBALE DE LA DÉCONNEXION ---
const setupLogout = () => {
    // Bouton de bureau classique
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', window.appHandleLogout);

    // Boutons avec la classe .logout-btn (sécurité supplémentaire pour d'autres pages comme Salaire)
    const logoutBtns = document.querySelectorAll('.logout-btn');
    logoutBtns.forEach(btn => {
        if (btn.id !== 'logoutBtn') btn.addEventListener('click', window.appHandleLogout);
    });
};

// S'assurer que le DOM est chargé avant d'attacher les événements (Gère le délai des type="module")
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupLogout);
} else {
    setupLogout();
}