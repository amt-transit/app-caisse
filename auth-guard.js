import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { doc, getDoc, updateDoc, collection, query, where, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// --- FONCTION GLOBALE PROFIL (ABIDJAN / MOBILE) ---
window.openAbidjanProfileModal = async () => {
    let modal = document.getElementById('abidjanProfileModal');
    if (!modal) {
        const userName = sessionStorage.getItem('userName') || 'Utilisateur';
        const userRole = sessionStorage.getItem('userRole') || 'Non défini';
        const userAgency = sessionStorage.getItem('userAgency') || 'abidjan';
        
        let agencyDisplay = userAgency === 'paris' ? '🇫🇷 Paris' : (userAgency === 'abidjan' ? '🇨🇮 Abidjan' : '🌍 Global');
        const roleDisplay = userRole.replace(/_/g, ' ').toUpperCase();
        const savedPhoto = localStorage.getItem('userProfilePhoto') || '';

        const html = `
            <div id="abidjanProfileModal" style="display:flex; position:fixed; z-index:99999; left:0; top:0; width:100%; height:100%; background:rgba(15,23,42,0.8); align-items:center; justify-content:center; backdrop-filter: blur(4px);">
                <div style="background:white; border-radius:16px; width:90%; max-width:400px; padding:25px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.25); position:relative;">
                    <button onclick="document.getElementById('abidjanProfileModal').style.display='none'" style="position:absolute; right:15px; top:15px; background:none; border:none; font-size:24px; color:#64748b; cursor:pointer;">&times;</button>
                    
                    <h2 style="margin:0 0 20px 0; color:#0f172a; font-size:20px; text-align:center;">Mon Profil</h2>
                    
                    <div style="display:flex; flex-direction:column; align-items:center; margin-bottom:20px;">
                        <div class="user-avatar avatar" id="abjProfileAvatar" style="width:100px; height:100px; border-radius:50%; font-size:40px; background-color:#eff6ff; color:#3b82f6; display:flex; align-items:center; justify-content:center; margin-bottom:15px; cursor:pointer; border:3px solid #e2e8f0; background-image:url('${savedPhoto}'); background-size:cover; background-position:center;" onclick="document.getElementById('abjProfilePhotoInput').click()">
                            ${savedPhoto ? '' : '<i class="fas fa-user"></i>'}
                        </div>
                        <input type="file" id="abjProfilePhotoInput" accept="image/*" style="display:none;" onchange="window.handleAbjProfilePhoto(event)">
                        <button style="background:white; border:1px solid #cbd5e1; color:#475569; font-weight:bold; font-size:12px; padding:6px 12px; border-radius:20px; cursor:pointer; transition:0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='white'" onclick="document.getElementById('abjProfilePhotoInput').click()"><i class="fas fa-camera"></i> Changer la photo</button>
                    </div>
                    
                    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:15px; margin-bottom:20px;">
                        <div style="margin-bottom:10px;"><label style="font-size:11px; color:#64748b; font-weight:bold; text-transform:uppercase;">Nom d'utilisateur</label><div style="font-weight:bold; color:#0f172a; font-size:15px;">${userName}</div></div>
                        <div style="margin-bottom:10px;"><label style="font-size:11px; color:#64748b; font-weight:bold; text-transform:uppercase;">Rôle</label><div style="font-weight:bold; color:#3b82f6; font-size:14px;">${roleDisplay}</div></div>
                        <div><label style="font-size:11px; color:#64748b; font-weight:bold; text-transform:uppercase;">Agence</label><div style="font-weight:bold; color:#0f172a; font-size:14px;">${agencyDisplay}</div></div>
                    </div>
                    
                    <div style="margin-bottom:20px;">
                        <label style="font-size:12px; font-weight:bold; color:#475569; display:block; margin-bottom:5px;">Nouveau mot de passe</label>
                        <input type="password" id="abjProfileNewPwd" placeholder="••••••••" style="width:100%; padding:12px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box; outline:none; transition:0.2s;" onfocus="this.style.borderColor='#3b82f6'" onblur="this.style.borderColor='#cbd5e1'">
                    </div>
                    
                    <button id="abjSaveProfileBtn" style="width:100%; padding:14px; border-radius:8px; font-weight:bold; background:#3b82f6; color:white; border:none; cursor:pointer; font-size:14px; transition:0.2s;" onmouseover="this.style.background='#2563eb'" onmouseout="this.style.background='#3b82f6'" onclick="window.saveAbjProfile()"><i class="fas fa-save"></i> Enregistrer les modifications</button>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);

        window.tempAbjPhotoFile = null;
        window.handleAbjProfilePhoto = (event) => {
            const file = event.target.files[0];
            if (file) {
                window.tempAbjPhotoFile = file;
                const reader = new FileReader();
                reader.onload = (e) => {
                    const avatar = document.getElementById('abjProfileAvatar');
                    avatar.style.backgroundImage = `url('${e.target.result}')`;
                    avatar.innerHTML = '';
                    avatar.style.color = 'transparent';
                };
                reader.readAsDataURL(file);
            }
        };

        window.saveAbjProfile = async () => {
            const pwd = document.getElementById('abjProfileNewPwd').value;
            const btn = document.getElementById('abjSaveProfileBtn');
            btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
            
            try {
                const { updateProfile, updatePassword } = await import('https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js');
                const { getStorage, ref: storageRef, uploadBytes, getDownloadURL } = await import('https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js');
                const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js');
                
                const u = auth.currentUser;
                if(!u) throw new Error("Utilisateur non connecté");

                const updates = {};
                
                // Enregistrement Photo
                if (window.tempAbjPhotoFile) {
                    const storage = getStorage();
                    const ext = window.tempAbjPhotoFile.name.split('.').pop();
                    const sRef = storageRef(storage, `profile_photos/${u.uid}_${Date.now()}.${ext}`);
                    await uploadBytes(sRef, window.tempAbjPhotoFile);
                    const url = await getDownloadURL(sRef);
                    await updateProfile(u, { photoURL: url });
                    updates.photoURL = url;
                    localStorage.setItem('userProfilePhoto', url);
                    
                    document.querySelectorAll('.user-avatar, .avatar, #abjProfileAvatar').forEach(el => {
                        el.style.backgroundImage = `url('${url}')`;
                        el.style.backgroundSize = 'cover';
                        el.style.backgroundPosition = 'center';
                        el.innerHTML = '';
                        el.style.color = 'transparent';
                    });
                    window.tempAbjPhotoFile = null;
                }
                
                // Enregistrement Mot de passe
                if (pwd) {
                    if (pwd.length < 6) throw new Error("Le mot de passe doit faire au moins 6 caractères.");
                    await updatePassword(u, pwd);
                    updates.password = pwd;
                }
                
                if (Object.keys(updates).length > 0) {
                    await updateDoc(doc(db, 'users', u.uid), updates);
                }
                
                if (window.AppModal) await window.AppModal.success("Profil mis à jour avec succès !");
                else alert("Profil mis à jour avec succès !");
                
                document.getElementById('abjProfileNewPwd').value = '';
                document.getElementById('abidjanProfileModal').style.display = 'none';
                
            } catch (e) {
                console.error(e);
                let msg = e.message;
                if(e.code === 'auth/requires-recent-login') msg = "Veuillez vous déconnecter et vous reconnecter pour modifier votre mot de passe.";
                if (window.AppModal) window.AppModal.error(msg);
                else alert("Erreur : " + msg);
            } finally {
                btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Enregistrer les modifications';
            }
        };
    }
    document.getElementById('abidjanProfileModal').style.display = 'flex';
};

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
            window.location.href = window.location.pathname.includes('/paris/') ? '../login.html' : 'login.html';
        } catch (error) {
            console.error("Erreur lors de la déconnexion:", error);
        }
    }
};

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

        // --- NOUVEAU : SYSTÈME DE PRÉSENCE (En Ligne) ---
        // Marquer l'utilisateur comme en ligne avec la date d'activité
        updateDoc(userDocRef, { lastActive: new Date().toISOString(), isOnline: true }).catch(e => console.error(e));
        // Mettre à jour l'activité toutes les 3 minutes pendant qu'il navigue
        window.presenceInterval = setInterval(() => {
            updateDoc(userDocRef, { lastActive: new Date().toISOString() }).catch(e => console.error(e));
        }, 3 * 60 * 1000);

        // Stockage session
        let userName = userData.displayName;
        if (!userName && userData.email) {
            userName = userData.email.split('@')[0];
            userName = userName.charAt(0).toUpperCase() + userName.slice(1);
        }
        sessionStorage.setItem('userRole', userRole);
        sessionStorage.setItem('userName', userName || 'Utilisateur');
        sessionStorage.setItem('userAgency', userData.agency || 'abidjan');

        // --- INJECTION DYNAMIQUE DU MENU PROFIL (POUR TOUTES LES PAGES ABIDJAN) ---
        const header = document.querySelector('.app-header');
        if (header) {
            // 1. Supprimer l'ancien bouton déconnexion isolé s'il existe (pour le Tableau de bord, Historique, etc.)
            const oldLogoutBtn = Array.from(header.children).find(el => el.id === 'logoutBtn' && el.tagName === 'BUTTON');
            if (oldLogoutBtn) oldLogoutBtn.remove();

            // 2. Injecter le nouveau bloc utilisateur s'il n'existe pas encore
            if (!header.querySelector('.user-info')) {
            const avatarStyle = userData.photoURL 
                ? `background-image: url('${userData.photoURL}'); background-size: cover; background-position: center; color: transparent;`
                : '';
            const avatarInner = userData.photoURL ? '' : '<i class="fas fa-user"></i>';

                const userInfoHtml = `
                    <div class="user-info" style="position: absolute; right: 20px; display: flex; align-items: center; gap: 10px;">
                        <span id="userName" style="font-weight: bold; font-size: 14px;">${userName || 'Utilisateur'}</span>
                        <div class="user-dropdown-container">
                        <div class="user-avatar avatar" id="userAvatar" title="Menu Utilisateur" style="${avatarStyle}">
                            ${avatarInner}
                            </div>
                            <div class="user-dropdown-menu" id="userDropdownMenu">
                            <a href="#" id="menuProfile" onclick="if(window.app && window.app.renderPage) { window.app.renderPage('settings-profile'); } else { if(window.openAbidjanProfileModal) window.openAbidjanProfileModal(); } const menu = document.getElementById('userDropdownMenu'); if(menu) menu.classList.remove('active'); return false;"><i class="fas fa-user-circle"></i> Profil</a>
                                <a href="#" id="menuAgencySwitch" style="display: none;"><i class="fas fa-globe"></i> Vue Paris</a>
                                <hr style="margin: 5px 0; border: none; border-top: 1px solid #e2e8f0;">
                                <a href="#" id="logoutBtn" class="logout-btn logout" onclick="window.appHandleLogout(); return false;"><i class="fas fa-sign-out-alt"></i> Déconnexion</a>
                            </div>
                        </div>
                    </div>
                `;
                header.insertAdjacentHTML('beforeend', userInfoHtml);
            if (userData.photoURL) {
                localStorage.setItem('userProfilePhoto', userData.photoURL);
            }
            } else {
                const userNameEl = document.getElementById('userName');
                if (userNameEl) userNameEl.textContent = userName || 'Utilisateur';
            
            const userAvatarEl = document.getElementById('userAvatar');
            if (userAvatarEl && userData.photoURL) {
                userAvatarEl.style.backgroundImage = `url('${userData.photoURL}')`;
                userAvatarEl.style.backgroundSize = 'cover';
                userAvatarEl.style.backgroundPosition = 'center';
                userAvatarEl.style.color = 'transparent';
                userAvatarEl.innerHTML = '';
                localStorage.setItem('userProfilePhoto', userData.photoURL);
            }
            }
        }

        // Détermination de l'agence actuellement "Active"
        let currentActiveAgency = sessionStorage.getItem('currentActiveAgency');
        if (!currentActiveAgency || (userData.agency !== 'all' && currentActiveAgency !== userData.agency)) {
            currentActiveAgency = userData.agency === 'all' ? 'abidjan' : (userData.agency || 'abidjan');
            sessionStorage.setItem('currentActiveAgency', currentActiveAgency);
        }

        // --- REDIRECTION AUTOMATIQUE VERS LA BONNE INTERFACE ---
        const pathUrl = window.location.pathname;
        const inParisFolder = pathUrl.includes('/paris/');
        const isLogin = pathUrl.includes('login.html');

        if (currentActiveAgency === 'paris' && !inParisFolder) {
            window.location.href = 'paris/index.html';
            return;
        } else if (currentActiveAgency === 'abidjan' && inParisFolder) {
            window.location.href = '../index.html';
            return;
        } else if (isLogin) {
            window.location.href = 'index.html';
            return;
        }

        document.body.classList.add('role-' + userRole);
        document.body.classList.add('agency-' + currentActiveAgency);

        // --- INJECTION DU SÉLECTEUR D'AGENCE (Pour les comptes Globaux) ---
        if (userData.agency === 'all' || userRole === 'super_admin') {

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