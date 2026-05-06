import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { doc, getDoc, collection, query, where, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

onAuthStateChanged(auth, async (user) => {
    
    if (!user) {
        // Pas connecté, redirection normale vers login
        if (!window.location.pathname.includes('login.html')) {
            window.location.href = window.location.pathname.includes('/paris/') ? '../login.html' : 'login.html';
        }
        return;
    }

    try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);

        const showErrorAndRedirect = async (msg, title, url = 'index.html') => {
            if (window.AppModal) await window.AppModal.error(msg, title);
            else alert(title + "\n\n" + msg);
            const isParis = window.location.pathname.includes('/paris/');
            window.location.href = (isParis && !url.includes('/')) ? '../' + url : url;
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

        // Stockage session
        let userName = userData.displayName;
        if (!userName && userData.email) {
            userName = userData.email.split('@')[0];
            userName = userName.charAt(0).toUpperCase() + userName.slice(1);
        }
        sessionStorage.setItem('userRole', userRole);
        sessionStorage.setItem('userName', userName || 'Utilisateur');
        sessionStorage.setItem('userAgency', userData.agency || 'abidjan');

        // Affichage dynamique du nom dans l'en-tête (ex: Vue Paris)
        const userNameEl = document.getElementById('userName');
        if (userNameEl) userNameEl.textContent = userName || 'Utilisateur';

        // Détermination de l'agence actuellement "Active"
        let currentActiveAgency = sessionStorage.getItem('currentActiveAgency');
        if (!currentActiveAgency || (userData.agency !== 'all' && currentActiveAgency !== userData.agency)) {
            currentActiveAgency = userData.agency === 'all' ? 'abidjan' : (userData.agency || 'abidjan');
            sessionStorage.setItem('currentActiveAgency', currentActiveAgency);
        }

        document.body.classList.add('role-' + userRole);
        document.body.classList.add('agency-' + currentActiveAgency);

        // --- INJECTION DU SÉLECTEUR D'AGENCE (Pour les comptes Globaux) ---
        if (userData.agency === 'all' || userRole === 'super_admin') {
            const header = document.querySelector('.app-header');
            if (header && !document.getElementById('agencySwitcher')) {
                const switcher = document.createElement('select');
                switcher.id = 'agencySwitcher';
                switcher.innerHTML = `
                    <option value="abidjan" ${currentActiveAgency === 'abidjan' ? 'selected' : ''}>🇨🇮 Vue Abidjan</option>
                    <option value="paris" ${currentActiveAgency === 'paris' ? 'selected' : ''}>🇫🇷 Vue Paris</option>
                `;
                switcher.style.cssText = "position: absolute; right: 140px; padding: 6px 10px; border-radius: 8px; font-weight: bold; border: 1px solid rgba(255,255,255,0.3); background: rgba(255,255,255,0.1); color: white; cursor: pointer; font-size: 13px;";
                switcher.addEventListener('change', (e) => {
                    const selectedAgency = e.target.value;
                    sessionStorage.setItem('currentActiveAgency', selectedAgency);
                    
                    const isCurrentlyInParis = window.location.pathname.includes('/paris/');
                    
                    if (selectedAgency === 'paris' && !isCurrentlyInParis) {
                        window.location.href = 'paris/index.html';
                    } else if (selectedAgency === 'abidjan' && isCurrentlyInParis) {
                        window.location.href = '../index.html';
                    } else {
                        window.location.reload();
                    }
                });
                header.appendChild(switcher);
            }

            // --- INJECTION DU SÉLECTEUR D'AGENCE (Menu Utilisateur Paris/Abidjan) ---
            const menuAgencySwitch = document.getElementById('menuAgencySwitch');
            if (menuAgencySwitch) {
                menuAgencySwitch.style.display = 'block';
                const isCurrentlyInParis = window.location.pathname.includes('/paris/');
                menuAgencySwitch.innerHTML = isCurrentlyInParis ? '<i class="fas fa-globe"></i> Vue Abidjan' : '<i class="fas fa-globe"></i> Vue Paris';
                menuAgencySwitch.addEventListener('click', (e) => {
                    e.preventDefault();
                    const targetAgency = isCurrentlyInParis ? 'abidjan' : 'paris';
                    sessionStorage.setItem('currentActiveAgency', targetAgency);
                    window.location.href = isCurrentlyInParis ? '../index.html' : 'paris/index.html';
                });
            }
        }

        // --- GESTION GLOBALE DU BADGE DE NOTIFICATION (Placé ici pour s'exécuter AVANT les return) ---
        // Vérification des sessions en attente sur toutes les pages
        const logsRef = collection(db, "audit_logs");
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

        // SAISIE FULL
        if (userRole === 'saisie_full') {
            if (currentPage.includes('bank.html') || 
                currentPage.includes('salaire.html')) {
                await showErrorAndRedirect("Accès refusé : Votre rôle (Saisie Full) ne permet pas d'accéder à cette page.", "Accès Refusé");
                return;
            }
        }

        // SAISIE LIMITED
        if (userRole === 'saisie_limited') {
            if (!currentPage.includes('index.html') && !currentPage.includes('history.html') && !currentPage.includes('magasinage.html') && !currentPage.includes('livreurscan.html')) {
                 await showErrorAndRedirect("Accès refusé : Votre rôle (Saisie Limited) ne permet pas d'accéder à cette page.", "Accès Refusé");
                 return;
            }
        }

        // Protection page Confirmation
        if (currentPage.includes('confirmation.html') && userRole === 'saisie_limited') {
            await showErrorAndRedirect("Accès refusé : Réservé aux Admins et Saisie Full.", "Accès Refusé");
            return;
        }

        // --- MASQUER LES LIENS ---
        const navDashboard = document.getElementById('nav-dashboard');
        const navExpenses = document.getElementById('nav-expenses');
        const navOtherIncome = document.getElementById('nav-other-income'); 
        const navBank = document.getElementById('nav-bank'); 
        const navArrivages = document.getElementById('nav-arrivages');
        const navAdmin = document.getElementById('nav-admin');
        const navClients = document.getElementById('nav-clients');
        const navMagasinage = document.getElementById('nav-magasinage'); 
        const navConfirmation = document.getElementById('nav-confirmation');
        const navSalaire = document.getElementById('nav-salaire');
        const navPoints = document.getElementById('nav-points');
        const navLivraison = document.getElementById('nav-livraison');
        const navAudit = document.getElementById('nav-audit');
        const navVoiture = document.getElementById('nav-voiture');
        const navCompteJB = document.getElementById('nav-comptejb');
        const navParis = document.getElementById('nav-paris');

        if (navParis) {
            if (userRole === 'super_admin' || userRole === 'admin' || userRole === 'agent_paris' || userData.agency === 'all' || userData.agency === 'paris') {
                navParis.style.display = 'inline-flex';
            } else {
                navParis.style.display = 'none';
            }
        }

        if (navAdmin && userRole !== 'super_admin' && userRole !== 'admin') navAdmin.style.display = 'none';
        if (navCompteJB && userRole !== 'super_admin' && userRole !== 'admin') navCompteJB.style.display = 'none';
        if (navPoints && (userRole !== 'admin' && userRole !== 'super_admin' && userRole !== 'spectateur')) navPoints.style.display = 'none';
        if (navAudit && (userRole !== 'admin' && userRole !== 'super_admin' && userRole !== 'spectateur')) navAudit.style.display = 'none';

        if (userRole === 'saisie_full') {
            if (navMagasinage) navMagasinage.style.display = 'inline';
            if (navBank) navBank.style.display = 'none';
            if (navSalaire) navSalaire.style.display = 'none';
            if (navVoiture) navVoiture.style.display = 'inline';
        }

        if (userRole === 'saisie_limited') {
            if (navMagasinage) navMagasinage.style.display = 'inline';
            if (navDashboard) navDashboard.style.display = 'none';
            if (navExpenses) navExpenses.style.display = 'none';
            if (navOtherIncome) navOtherIncome.style.display = 'none';
            if (navBank) navBank.style.display = 'none';
            if (navArrivages) navArrivages.style.display = 'none';
            if (navClients) navClients.style.display = 'none';
            if (navConfirmation) navConfirmation.style.display = 'none';
            if (navSalaire) navSalaire.style.display = 'none';
            if (navLivraison) navLivraison.style.display = 'none';
            if (navVoiture) navVoiture.style.display = 'none';
        }

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
    const handleLogout = async () => {
        const confirmLogout = window.AppModal ? 
            await window.AppModal.confirm("Voulez-vous vous déconnecter ?", "Déconnexion", true) : 
            confirm("Voulez-vous vous déconnecter ?");
            
        if (confirmLogout) {
            try {
                await signOut(auth);
                sessionStorage.clear(); // Sécurité : on vide les données de session
                window.location.href = window.location.pathname.includes('/paris/') ? '../login.html' : 'login.html';
            } catch (error) {
                console.error("Erreur lors de la déconnexion:", error);
            }
        }
    };

    // Bouton de bureau classique
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

    // Boutons avec la classe .logout-btn (sécurité supplémentaire pour d'autres pages comme Salaire)
    const logoutBtns = document.querySelectorAll('.logout-btn');
    logoutBtns.forEach(btn => {
        if (btn.id !== 'logoutBtn') btn.addEventListener('click', handleLogout);
    });
};

// S'assurer que le DOM est chargé avant d'attacher les événements (Gère le délai des type="module")
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupLogout);
} else {
    setupLogout();
}