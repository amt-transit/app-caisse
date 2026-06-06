import { auth, db } from './commun/firebase-config.js';
import { AGENCIES, getDepartureAgencies, getArrivalAgencies, getCollectionName } from './commun/agencies-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { doc, getDoc, updateDoc, collection, query, where, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// ── AGENCE ACTIVE AU BOOT (anti-flash) ──────────────────────────────────────
// app.js PEINT la page (menu, branding) AVANT qu'auth-guard ait lu la fiche
// utilisateur (asynchrone). Si la session est vide (reconnexion), app.js
// utilisait son agence par défaut -> "flash" de la mauvaise agence avant la
// vraie. Ici, SYNCHRONEMENT et au plus tôt, on réutilise la dernière agence
// mémorisée (localStorage, qui survit à la déconnexion) -> 1re peinture déjà
// sur la bonne agence, plus de flash ni de reload.
(function seedActiveAgencyAtBoot() {
    try {
        if (!sessionStorage.getItem('currentActiveAgency')) {
            const last = localStorage.getItem('amt_lastAgency');
            if (last) sessionStorage.setItem('currentActiveAgency', last);
        }
    } catch (_) {}
})();

// ── TRANSITION D'AGENCE (overlay persistant) ───────────────────────────────
// Quand l'utilisateur change d'agence, switchAgency() pose un flag dans
// sessionStorage et lance le reload. Au boot suivant, on RECRÉE immédiatement
// le même overlay (drapeau + nom) AVANT toute autre lecture, puis on le
// retire en fade-out une fois l'app prête.
(function showSwitchOverlayAtBoot() {
    try {
        const raw = sessionStorage.getItem('amt_switching_overlay');
        if (!raw) return;
        const { flag, name } = JSON.parse(raw);
        sessionStorage.removeItem('amt_switching_overlay');

        // Construit l'overlay au plus tôt (avant même DOMContentLoaded).
        const inject = () => {
            if (document.getElementById('agencySwitchOverlay')) return;
            const overlay = document.createElement('div');
            overlay.id = 'agencySwitchOverlay';
            overlay.innerHTML = `
                <style>
                    #agencySwitchOverlay { position:fixed; inset:0; z-index:999999;
                        background:linear-gradient(135deg,#0B2540 0%,#1A3553 50%,#0F2238 100%);
                        display:flex; flex-direction:column; align-items:center; justify-content:center;
                        color:white; transition: opacity 0.4s ease; }
                    @keyframes agpFlagBounce { 0%,100% { transform:scale(1); } 50% { transform:scale(1.1); } }
                    @keyframes agpNameSlide { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
                    @keyframes agpLoaderSpin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
                    @keyframes agpDotPulse { 0%,100% { opacity:0.3; } 50% { opacity:1; } }
                    #agencySwitchOverlay .f { font-size:110px; line-height:1; margin-bottom:28px;
                        filter:drop-shadow(0 10px 30px rgba(242,163,18,0.4));
                        animation: agpFlagBounce 1.6s ease-in-out infinite; }
                    #agencySwitchOverlay .k { font-family:'JetBrains Mono',monospace;
                        font-size:11px; color:#F2A312; letter-spacing:4px; text-transform:uppercase;
                        margin-bottom:14px; opacity:0.9; }
                    #agencySwitchOverlay .n { font-family:'Comfortaa','Jost',sans-serif;
                        font-size:36px; font-weight:700; letter-spacing:-1px; margin-bottom:40px;
                        animation: agpNameSlide 0.5s cubic-bezier(0.16,1,0.3,1) 0.1s backwards;
                        text-align:center; padding:0 20px; }
                    #agencySwitchOverlay .l { width:44px; height:44px;
                        border:3px solid rgba(242,163,18,0.18); border-top-color:#F2A312;
                        border-radius:50%; animation: agpLoaderSpin 0.9s linear infinite;
                        margin-bottom:20px; }
                    #agencySwitchOverlay .t { color:#A0AEC4; font-size:13px;
                        font-family:'Jost',sans-serif; letter-spacing:0.5px; }
                    #agencySwitchOverlay .t::after { content:'...'; display:inline-block;
                        animation: agpDotPulse 1.4s infinite; }
                </style>
                <div class="f">${flag || '🌍'}</div>
                <div class="k">Connexion en cours</div>
                <div class="n">${name || ''}</div>
                <div class="l"></div>
                <div class="t">Chargement de votre espace</div>
            `;
            (document.body || document.documentElement).appendChild(overlay);
        };
        if (document.body) inject();
        else document.addEventListener('DOMContentLoaded', inject, { once: true });
    } catch (_) { /* sessionStorage cassé : on ignore */ }
})();

// Fonction globale exposée pour retirer l'overlay (avec fade-out) à la fin
// du boot une fois que l'app est prête à afficher l'écran principal.
//
// IMPORTANT : on retire D'ABORD la règle CSS injectée par le script inline
// dans index.html (qui force body en visibility:hidden), pour que le
// contenu de la nouvelle agence devienne visible PENDANT que l'overlay
// fait son fondu. Sans cela, le user verrait l'overlay se dissoudre sur
// un fond invisible (= flash blanc/sombre).
window.hideAgencySwitchOverlay = () => {
    const o = document.getElementById('agencySwitchOverlay');
    if (!o) return;
    const styleEl = document.getElementById('__amtSwitchOverlayStyle');
    if (styleEl) styleEl.remove();
    // Force un reflow pour que visibility:hidden soit effectivement levé
    // avant que le fade ne commence.
    void document.body.offsetWidth;
    o.style.opacity = '0';
    setTimeout(() => o.remove(), 420);
};

// ── FILET DE SÉCURITÉ ──────────────────────────────────────────────────────
// Si pour une raison X l'init échoue (erreur Firebase, redirection, etc.)
// et que personne n'appelle hideAgencySwitchOverlay(), on retire l'overlay
// au bout de 6s pour ne pas figer l'utilisateur. Ce hard timeout couvre
// tous les chemins de sortie (admin, manager, spectateur, erreur, etc.).
// Il est armé seulement s'il y avait un switch en cours.
if (sessionStorage.getItem('amt_switching_overlay') !== null
    || document.getElementById('agencySwitchOverlay')) {
    setTimeout(() => window.hideAgencySwitchOverlay(), 6000);
}

// Hook global : dès qu'on rend le body visible (quelque branche que ce soit
// dans auth-guard), on retire l'overlay. Évite d'avoir à ajouter
// hideAgencySwitchOverlay() à TOUS les endroits document.body.style.display.
// Pour ne pas laisser apparaître une page blanche pendant le fade-out,
// on attend que :
//   1. window.load soit déclenché (CSS, polices et images chargés)
//   2. Deux requestAnimationFrame consécutifs (paint réellement commit)
//   3. Un petit délai de stabilité (250 ms) pour les rendus asynchrones
// AVANT de commencer le fondu de l'overlay.
(function watchBodyDisplay() {
    let removed = false;
    const remove = () => {
        if (removed) return;
        removed = true;
        if (typeof window.hideAgencySwitchOverlay !== 'function') return;
        const startFade = () => {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    setTimeout(() => window.hideAgencySwitchOverlay(), 250);
                });
            });
        };
        if (document.readyState === 'complete') startFade();
        else window.addEventListener('load', startFade, { once: true });
    };
    const observer = new MutationObserver(() => {
        if (document.body && document.body.style.display === 'block') remove();
    });
    const start = () => {
        if (document.body && document.body.style.display === 'block') { remove(); return; }
        observer.observe(document.body || document.documentElement, {
            attributes: true, attributeFilter: ['style'], subtree: false,
        });
    };
    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start, { once: true });
})();

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

        // --- SYSTÈME DE PRÉSENCE (En Ligne) — DIFFÉRÉ ---
        // On REPOUSSE cette écriture après l'affichage de la page : lancée pendant
        // le boot, elle occupait la connexion Firestore et ralentissait la lecture
        // du rôle (~3 s mesurées). 4 s plus tard, la page est affichée depuis
        // longtemps ; la présence n'a aucune urgence.
        setTimeout(() => {
            updateDoc(userDocRef, { lastActive: new Date().toISOString(), isOnline: true }).catch(e => console.error(e));
            window.presenceInterval = setInterval(() => {
                updateDoc(userDocRef, { lastActive: new Date().toISOString() }).catch(e => console.error(e));
            }, 3 * 60 * 1000);
        }, 4000);

        // --- DÉCONNEXION AUTOMATIQUE APRÈS INACTIVITÉ (30 min) ---
        // Sécurité poste partagé : sans aucune action (souris/clavier/clic/scroll/
        // tactile) pendant 30 min, on déconnecte et on renvoie à l'écran de
        // connexion. Le minuteur se réarme à chaque action -> aucune gêne quand on
        // travaille. (Armé une seule fois par chargement de page.)
        if (!window.__amtIdleSetup) {
            window.__amtIdleSetup = true;
            const IDLE_MS = 30 * 60 * 1000;
            let idleTimer = null;
            // Un scan se fait par CAMÉRA (html5-qrcode) : ça ne génère ni clic ni
            // frappe. On considère donc qu'un scan caméra EN COURS = activité, pour
            // ne JAMAIS déconnecter en plein chargement/déchargement.
            const scanCameraActive = () => {
                const v = document.querySelector('video');
                return !!(v && v.srcObject && !v.paused && v.readyState > 0);
            };
            const resetIdle = () => { if (idleTimer) clearTimeout(idleTimer); idleTimer = setTimeout(doIdleLogout, IDLE_MS); };
            async function doIdleLogout() {
                // Caméra de scan active -> on REPORTE la déconnexion (on ne coupe
                // pas une session de scan).
                if (scanCameraActive()) { resetIdle(); return; }
                try { if (auth.currentUser) await updateDoc(doc(db, 'users', auth.currentUser.uid), { isOnline: false }); } catch (_) {}
                try { await signOut(auth); } catch (_) {}
                try { sessionStorage.clear(); } catch (_) {}
                const inSub = window.location.pathname.includes('/paris/') || window.location.pathname.includes('/abidjan/');
                window.location.href = inSub ? '../login.html' : 'login.html';
            }
            // Throttle : on ne réarme qu'au plus une fois toutes les 5 s.
            let lastReset = 0;
            const onActivity = () => { const now = Date.now(); if (now - lastReset > 5000) { lastReset = now; resetIdle(); } };
            ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'].forEach((ev) =>
                window.addEventListener(ev, onActivity, { passive: true }));
            // « Je suis actif » réutilisable : les écrans de scan peuvent l'appeler
            // à chaque scan réussi (window.amtKeepAlive()) pour réarmer le minuteur.
            window.amtKeepAlive = () => resetIdle();
            resetIdle();
        }

        // --- CHARGEMENT DES PERMISSIONS DYNAMIQUES (cache-first) ---
        // La lecture réseau de roles/<role> peut être lente (~3 s en 4G) et
        // BLOQUAIT l'affichage. On applique donc les permissions EN CACHE
        // (localStorage) instantanément, et on revalide en arrière-plan. Un
        // changement de rôle (rare, action admin) est pris en compte au
        // rafraîchissement suivant.
        let userPermissions = [];
        const permKey = 'amt_perm_' + userRole;
        const cachedPerm = localStorage.getItem(permKey);
        const fetchPerms = async () => {
            try {
                const snap = await getDoc(doc(db, 'roles', userRole));
                // On met en cache MÊME si le document n'existe pas (ex. super_admin
                // sans permissions listées) : permissions = []. Ainsi la lecture
                // réseau n'a lieu qu'UNE fois par appareil, puis tout est instantané.
                const fresh = (snap.exists() && snap.data().permissions) ? snap.data().permissions : [];
                localStorage.setItem(permKey, JSON.stringify(fresh));
                sessionStorage.setItem('userPermissions', JSON.stringify(fresh));
                return fresh;
            } catch (e) { console.warn("Permissions:", e); return null; } // échec réseau : on NE cache pas (on réessaiera)
        };
        if (cachedPerm) {
            try { userPermissions = JSON.parse(cachedPerm) || []; } catch (_) {}
            fetchPerms(); // revalidation en arrière-plan (non bloquant)
        } else {
            const fresh = await fetchPerms(); // 1re fois sur cet appareil : on attend une fois
            if (fresh) userPermissions = fresh;
        }

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
        // Initiale saisie manuellement dans la fiche agent (ex: "J", "FM").
        // Utilisée comme préfixe des références facture (ex: J-003-AER1).
        // Si absente, les vues facture retombent sur les premières lettres du nom.
        if (userData.initials) {
            sessionStorage.setItem('userInitials', String(userData.initials).toUpperCase());
        } else {
            sessionStorage.removeItem('userInitials');
        }
        // Mode d'expédition autorisé pour CET agent : 'both' (défaut) | 'maritime' | 'aerien'.
        // Restreint en plus du roleAerien (intersection).
        sessionStorage.setItem('userAllowedMode', userData.allowedMode || 'both');

        // Détermination de l'agence actuellement "Active".
        // app.js (au démarrage, DOMContentLoaded) construit le menu en lisant
        // currentActiveAgency, avec 'paris' par défaut si absente. Or auth-guard
        // ne connaît l'agence de l'utilisateur qu'APRÈS lecture asynchrone de sa
        // fiche : course possible où le menu est bâti sur la mauvaise agence
        //  - session vide -> défaut 'paris' alors que l'agent est à l'arrivée ;
        //  - session héritée d'un autre utilisateur.
        // On calcule l'agence DÉSIRÉE ; si elle diffère de celle qu'app.js a
        // probablement utilisée, on recharge UNE fois (après reload les valeurs
        // coïncident -> aucune boucle). APP_DEFAULT_AGENCY doit rester aligné
        // avec le défaut d'app.js (loadMenuConfig).
        const APP_DEFAULT_AGENCY = 'paris';
        let currentActiveAgency = sessionStorage.getItem('currentActiveAgency');
        const desiredAgency = userData.agency === 'all'
            ? (currentActiveAgency || localStorage.getItem('amt_lastAgency') || 'abidjan')
            : (userData.agency || 'abidjan');
        const renderedAgency = currentActiveAgency || APP_DEFAULT_AGENCY;
        sessionStorage.setItem('currentActiveAgency', desiredAgency);
        // Mémorise l'agence effective pour le PROCHAIN boot (anti-flash) + pour
        // qu'un utilisateur global retrouve sa dernière agence à la reconnexion.
        try { localStorage.setItem('amt_lastAgency', desiredAgency); } catch (_) {}
        if (renderedAgency !== desiredAgency) {
            location.reload();
            return;
        }
        currentActiveAgency = desiredAgency;

        // --- INJECTION DYNAMIQUE DU MENU PROFIL (POUR TOUTES LES PAGES ET MOBILES) ---
        // Mode d'expédition (Maritime par défaut / Aérien). Mémorisé pour la
        // session ; le changement recharge la page pour que les écrans
        // (ex. Nouvelle Facture) recalculent selon le mode.
        if (!window.setShippingMode) {
            window.setShippingMode = function (mode) {
                if (mode !== 'maritime' && mode !== 'aerien') return;
                sessionStorage.setItem('shippingMode', mode);
                location.reload();
            };
        }
        const shippingMode = sessionStorage.getItem('shippingMode') || 'maritime';
        const smBtn = (m, label) => {
            const on = shippingMode === m;
            const onCss = m === 'maritime' ? 'background:#0369a1;color:#fff;' : 'background:#7c3aed;color:#fff;';
            return `<button type="button" data-mode="${m}" onclick="window.setShippingMode('${m}')" title="Mode ${label}" style="border:none;cursor:pointer;font-size:12px;font-weight:700;padding:5px 9px;border-radius:6px;${on ? onCss : 'background:transparent;color:#475569;'}">${label}</button>`;
        };
        const shippingToggleHtml = `
            <div class="shipping-mode-toggle" title="Mode d'expédition" style="display:flex;gap:4px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;padding:3px;">
                ${smBtn('maritime', '🚢 Maritime')}
                ${smBtn('aerien', '✈️ Aérien')}
            </div>`;

        const headers = document.querySelectorAll('.app-header, .mob-header, .top-bar');
        headers.forEach((header) => {
            // 1. Nettoyage des anciens boutons
            const oldLogoutBtn = Array.from(header.children).find(el => el.id === 'logoutBtn' && el.tagName === 'BUTTON');
            if (oldLogoutBtn) oldLogoutBtn.remove();
            const mobProfileBtn = header.querySelector('#mob-profileBtn');
            if (mobProfileBtn) mobProfileBtn.remove();

            // Une seule entrée dans le dropdown : un bouton qui ouvre la modale
            // « Choisir une agence » avec onglets Départs / Arrivées / Tout
            // et cards visuelles. Scalable à 100+ routes.
            const activeAgencyData = AGENCIES[currentActiveAgency] || {};
            const activeFlag = activeAgencyData.flag || '🌍';
            const activeName = activeAgencyData.name || currentActiveAgency;
            const agencyLinksHtml = `<a href="#" onclick="window.openAgencyPicker(); return false;" style="display:flex; align-items:center; gap:10px;">
                <span style="font-size:18px;">${activeFlag}</span>
                <span style="flex:1;"><b>${activeName}</b><br><span style="font-size:11px; color:#8198B0;">Changer d'agence</span></span>
                <i class="fas fa-chevron-right" style="color:#8198B0;"></i>
            </a>`;

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
                        ${shippingToggleHtml}
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
                // Rafraîchit / ajoute le sélecteur Maritime/Aérien si déjà injecté.
                const ui = header.querySelector('.user-info');
                const existingToggle = ui && ui.querySelector('.shipping-mode-toggle');
                if (existingToggle) existingToggle.outerHTML = shippingToggleHtml;
                else if (ui) ui.insertAdjacentHTML('afterbegin', shippingToggleHtml);

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
                // Cache en localStorage (SURVIT à la déconnexion) : à la
                // reconnexion, les couleurs/logo de l'agence s'appliquent
                // SYNCHRONEMENT -> plus de "flash" du branding par défaut.
                const cached = localStorage.getItem(cacheKey);
                
                const applyBranding = (branding) => {
                    if (branding.color) document.documentElement.style.setProperty('--primary', branding.color);
                    
                    if (branding.secondary) document.documentElement.style.setProperty('--secondary', branding.secondary);
                    else if (branding.color) document.documentElement.style.setProperty('--secondary', branding.color); // Menu uni si pas de couleur secondaire
                    
                    if (branding.bg) document.documentElement.style.setProperty('--bg-body', branding.bg);
                    
                    if (branding.logo) document.querySelectorAll('.app-logo, .sidebar-logo img').forEach(img => img.src = branding.logo);
                    
                    if (branding.name) {
                        document.querySelectorAll('.sidebar-header h2, #sidebarAgencyName').forEach(h2 => h2.textContent = branding.name);
                        document.title = `${branding.name} - Espace Global`;
                    }
                    if (branding.slogan) {
                        document.querySelectorAll('.sidebar-header p, #sidebarAgencySlogan').forEach(p => p.textContent = branding.slogan);
                    }

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
                
                let branding = {
                    name: AGENCIES[agencyId] ? AGENCIES[agencyId].name : "AMT Trans'it",
                    slogan: "Espace de Gestion"
                };
                if (cfgSnap.exists()) { branding.color = cfgSnap.data().primaryColorHex; branding.logo = cfgSnap.data().logoUrl; }
                
                if (cfgSnap.exists() && cfgSnap.data().secondaryColorHex) branding.secondary = cfgSnap.data().secondaryColorHex;
                if (cfgSnap.exists() && cfgSnap.data().bgColorHex) branding.bg = cfgSnap.data().bgColorHex;
                
                if (compSnap.exists()) {
                    const compData = compSnap.data();
                    if (!branding.logo && compData.logoBase64) branding.logo = compData.logoBase64;
                    // On NE DOIT PAS écraser le nom de l'agence (UI) par le nom de l'entreprise (Facturation)
                    
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
                    
                    // Sécurité : Éviter que le nom par défaut 'AMT Paris' ne fuite sur les autres agences
                    if (d.agencyName) {
                        if (d.agencyName === 'AMT Paris' && agencyId !== 'paris') {
                            branding.name = AGENCIES[agencyId] ? AGENCIES[agencyId].name : "AMT Trans'it";
                        } else {
                            branding.name = d.agencyName;
                        }
                    }
                    if (d.agencySlogan) {
                        if (d.agencySlogan === 'Agent Dashboard' && agencyId !== 'paris') {
                            branding.slogan = "Espace de Gestion";
                        } else {
                            branding.slogan = d.agencySlogan;
                        }
                    }
                    if (d.fontFamily) branding.fontFamily = d.fontFamily;
                    if (d.baseFontSize) branding.baseFontSize = d.baseFontSize;
                }
                
                localStorage.setItem(cacheKey, JSON.stringify(branding));
                applyBranding(branding);
            } catch(e) { console.error("Branding error:", e); }
        };
        // NE PLUS BLOQUER l'affichage sur le branding : le cache (sessionStorage)
        // est déjà appliqué SYNCHRONEMENT dans loadAgencyBranding ; la mise à
        // jour réseau (3 lectures settings) se fait en arrière-plan, sans retarder
        // l'apparition de la page. Gain : ~plusieurs lectures Firestore en moins
        // avant le 1er affichage.
        loadAgencyBranding(currentActiveAgency);

        // --- REDIRECTION AUTOMATIQUE VERS LA BONNE INTERFACE ---
        const pathUrl = window.location.pathname;
        const inParisFolder = pathUrl.includes('/paris/');
        const inAbidjanFolder = pathUrl.includes('/abidjan/');
        const isLogin = pathUrl.includes('login.html');

        // Vérifie si l'utilisateur est sur la nouvelle architecture unifiée (à la racine)
        const isUnifiedRoot = pathUrl.endsWith('/index.html') && !inParisFolder && !inAbidjanFolder;

        // Séparation logique : Les agences de "Départ" vont dans le dossier /paris/, les agences "d'Arrivée" vont dans /abidjan/
        const departureAgencies = getDepartureAgencies();
        const arrivalAgencies = getArrivalAgencies();

        // Architecture unifiée : l'application vit à la racine. On rapatrie
        // tout utilisateur encore sur un ancien dossier /paris/ ou /abidjan/
        // vers l'app unique à la racine. Les pages racine légitimes (ex.
        // login.html) ne sont PAS touchées.
        if ((inParisFolder || inAbidjanFolder) && !isLogin) {
            window.location.href = '../index.html';
            return;
        }
        
        if (isLogin) {
            window.location.href = (inParisFolder || inAbidjanFolder) ? '../index.html' : 'index.html';
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
                // Mémorise la dernière agence choisie dans localStorage (qui SURVIT
                // à la déconnexion, contrairement à sessionStorage) : à la
                // reconnexion, l'utilisateur global retrouve SA dernière agence.
                try { localStorage.setItem('amt_lastAgency', targetAgency); } catch (_) {}
                // 1) Affiche un overlay « transition » avec le drapeau + nom de la
                //    nouvelle agence pendant le rechargement.
                // 2) Stocke ces infos dans sessionStorage pour que le NOUVEAU boot
                //    recrée immédiatement le même overlay (sinon il disparaîtrait
                //    avec le reload). Cf. (showSwitchOverlayAtBoot) en haut du fichier.
                const targetData = (AGENCIES && AGENCIES[targetAgency]) || {};
                const overlayInfo = { flag: targetData.flag || '🌍', name: targetData.name || targetAgency };
                try { sessionStorage.setItem('amt_switching_overlay', JSON.stringify(overlayInfo)); } catch (_) {}
                window.showAgencySwitchOverlay(overlayInfo.flag, overlayInfo.name);

                const isCurrentUnifiedRoot = window.location.pathname.endsWith('/index.html') && !window.location.pathname.includes('/paris/') && !window.location.pathname.includes('/abidjan/');
                // Force le browser à PEINDRE l'overlay (double rAF) AVANT de
                // lancer le reload qui gèle le rendu. Sinon l'utilisateur voit
                // une page blanche pendant 200-400ms avant que l'overlay du
                // boot suivant n'apparaisse.
                requestAnimationFrame(() => requestAnimationFrame(() => {
                    if (isCurrentUnifiedRoot) {
                        window.location.reload();
                    } else {
                        window.location.href = (inParisFolder || inAbidjanFolder) ? '../index.html' : 'index.html';
                    }
                }));
            };

            // Overlay de transition : drapeau + nom de l'agence cible + loader.
            // Réutilisé par switchAgency avant le reload ET par le boot quand
            // on revient d'un switch (cf. plus bas, le flag amt_switching_label).
            window.showAgencySwitchOverlay = (flag, name) => {
                // Évite de superposer plusieurs overlays
                const existing = document.getElementById('agencySwitchOverlay');
                if (existing) existing.remove();
                const overlay = document.createElement('div');
                overlay.id = 'agencySwitchOverlay';
                overlay.innerHTML = `
                    <style>
                        #agencySwitchOverlay {
                            position: fixed; inset: 0; z-index: 999999;
                            background: linear-gradient(135deg, #0B2540 0%, #1A3553 50%, #0F2238 100%);
                            display: flex; flex-direction: column;
                            align-items: center; justify-content: center;
                            color: white;
                            animation: agpOverlayIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                        }
                        @keyframes agpOverlayIn { from { opacity: 0; } to { opacity: 1; } }
                        @keyframes agpFlagBounce { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.1); } }
                        @keyframes agpNameSlide { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
                        @keyframes agpLoaderSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                        @keyframes agpDotPulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
                        .agp-overlay-flag {
                            font-size: 110px; line-height: 1; margin-bottom: 28px;
                            filter: drop-shadow(0 10px 30px rgba(242,163,18,0.4));
                            animation: agpFlagBounce 1.6s ease-in-out infinite;
                        }
                        .agp-overlay-kicker {
                            font-family: 'JetBrains Mono', monospace, sans-serif;
                            font-size: 11px; color: #F2A312; letter-spacing: 4px;
                            text-transform: uppercase; margin-bottom: 14px;
                            opacity: 0.9;
                        }
                        .agp-overlay-name {
                            font-family: 'Comfortaa', 'Jost', sans-serif;
                            font-size: 36px; font-weight: 700;
                            letter-spacing: -1px; margin-bottom: 40px;
                            animation: agpNameSlide 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.1s backwards;
                            text-align: center; padding: 0 20px;
                        }
                        .agp-overlay-loader {
                            width: 44px; height: 44px;
                            border: 3px solid rgba(242,163,18,0.18);
                            border-top-color: #F2A312;
                            border-radius: 50%;
                            animation: agpLoaderSpin 0.9s linear infinite;
                            margin-bottom: 20px;
                        }
                        .agp-overlay-text {
                            color: #A0AEC4; font-size: 13px;
                            font-family: 'Jost', sans-serif;
                            letter-spacing: 0.5px;
                        }
                        .agp-overlay-text::after {
                            content: '...';
                            display: inline-block;
                            animation: agpDotPulse 1.4s infinite;
                        }
                    </style>
                    <div class="agp-overlay-flag">${flag}</div>
                    <div class="agp-overlay-kicker">Connexion en cours</div>
                    <div class="agp-overlay-name">${name}</div>
                    <div class="agp-overlay-loader"></div>
                    <div class="agp-overlay-text">Chargement de votre espace</div>
                `;
                document.body.appendChild(overlay);
            };

            // ── MODALE « Choisir une agence » ────────────────────────────
            // Plein écran avec 3 onglets (Départs / Arrivées / Tout) +
            // recherche + cards visuelles. Scalable à 100+ routes SaaS.
            window.openAgencyPicker = () => {
                // Fermer le dropdown utilisateur ouvert
                document.querySelectorAll('.user-dropdown-menu').forEach((m) => m.classList.remove('active'));

                // Supprimer une modale existante avant d'en créer une nouvelle
                const existing = document.getElementById('agencyPickerModal');
                if (existing) existing.remove();

                const current = sessionStorage.getItem('currentActiveAgency') || 'abidjan';
                const all = Object.values(AGENCIES || {});
                const departures = all.filter((a) => a.type === 'departure');
                const arrivals = all.filter((a) => a.type === 'arrival');

                const renderCard = (a) => {
                    const isActive = a.id === current;
                    return `
                        <button class="agp-card${isActive ? ' on' : ''}" data-agency="${a.id}" data-name="${(a.name || '').toLowerCase()}">
                            <div class="agp-card-flag">${a.flag || '🌍'}</div>
                            <div class="agp-card-name">${a.name || a.id}</div>
                            <div class="agp-card-tag">${isActive ? a.id.toUpperCase() + ' · ACTIVE' : a.id.toUpperCase()}</div>
                        </button>
                    `;
                };

                const modal = document.createElement('div');
                modal.id = 'agencyPickerModal';
                modal.innerHTML = `
                    <style>
                        #agencyPickerModal { position: fixed; inset: 0; background: rgba(11,37,64,0.65); display: flex; align-items: center; justify-content: center; z-index: 100000; padding: 20px; backdrop-filter: blur(3px); animation: agpFadeIn 0.2s ease; }
                        @keyframes agpFadeIn { from { opacity: 0; } to { opacity: 1; } }
                        @keyframes agpSlideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
                        .agp-box { background: white; border-radius: 18px; max-width: 720px; width: 100%; max-height: 88vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 30px 80px -20px rgba(0,0,0,0.4); animation: agpSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
                        .agp-head { padding: 18px 22px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; }
                        .agp-title { font-family: 'Comfortaa', 'Jost', sans-serif; font-weight: 700; font-size: 18px; color: #1A3553; display: flex; align-items: center; gap: 10px; }
                        .agp-close { background: #f1f5f9; border: none; width: 36px; height: 36px; border-radius: 10px; cursor: pointer; font-size: 18px; color: #64748b; transition: background 0.15s; }
                        .agp-close:hover { background: #e2e8f0; }
                        .agp-search { padding: 12px 22px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; }
                        .agp-search input { width: 100%; border: 1px solid #cbd5e1; background: white; border-radius: 10px; padding: 10px 14px 10px 36px; font-size: 14px; outline: none; font-family: inherit; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='%238198B0' viewBox='0 0 16 16'%3E%3Cpath d='M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001q.044.06.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1 1 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: 12px center; background-size: 15px; }
                        .agp-search input:focus { border-color: #F2A312; box-shadow: 0 0 0 3px rgba(242,163,18,0.15); }
                        .agp-tabs { display: flex; padding: 0 14px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; }
                        .agp-tab { padding: 13px 16px; font-size: 13px; font-weight: 600; color: #4A6178; border-bottom: 2px solid transparent; margin-bottom: -1px; cursor: pointer; transition: all 0.15s; background: none; border-top: none; border-left: none; border-right: none; font-family: inherit; }
                        .agp-tab.on { color: #B8780A; border-bottom-color: #F2A312; }
                        .agp-tab:hover:not(.on) { color: #1A3553; }
                        .agp-tab-count { background: rgba(11,37,64,0.08); color: #4A6178; padding: 2px 8px; border-radius: 100px; font-size: 11px; margin-left: 6px; }
                        .agp-tab.on .agp-tab-count { background: rgba(242,163,18,0.18); color: #B8780A; }
                        .agp-grid { padding: 18px; display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; overflow-y: auto; flex: 1; }
                        .agp-card { background: white; border: 1.5px solid #e2e8f0; border-radius: 14px; padding: 16px 12px; cursor: pointer; text-align: center; transition: all 0.2s cubic-bezier(0.4,0,0.2,1); font-family: inherit; }
                        .agp-card:hover { border-color: #F2A312; transform: translateY(-2px); box-shadow: 0 8px 18px -6px rgba(242,163,18,0.25); }
                        .agp-card.on { background: linear-gradient(135deg, rgba(242,163,18,0.15) 0%, rgba(242,163,18,0.05) 100%); border-color: #F2A312; box-shadow: 0 4px 12px -2px rgba(242,163,18,0.2); }
                        .agp-card-flag { font-size: 32px; line-height: 1; margin-bottom: 8px; }
                        .agp-card-name { font-size: 13.5px; font-weight: 700; color: #1A3553; }
                        .agp-card-tag { font-size: 10px; color: #8198B0; margin-top: 4px; font-family: 'JetBrains Mono', monospace; letter-spacing: 0.5px; }
                        .agp-card.on .agp-card-tag { color: #B8780A; font-weight: 700; }
                        .agp-empty { grid-column: 1 / -1; text-align: center; padding: 40px 20px; color: #8198B0; font-size: 13px; }
                    </style>
                    <div class="agp-box">
                        <div class="agp-head">
                            <div class="agp-title"><i class="fas fa-globe-africa" style="color:#F2A312;"></i> Choisir une agence</div>
                            <button class="agp-close" onclick="document.getElementById('agencyPickerModal').remove()">✕</button>
                        </div>
                        <div class="agp-search">
                            <input id="agp-search-input" type="text" placeholder="Rechercher une route…" autocomplete="off">
                        </div>
                        <div class="agp-tabs">
                            <button class="agp-tab on" data-filter="departure">🛫 Départs <span class="agp-tab-count">${departures.length}</span></button>
                            <button class="agp-tab" data-filter="arrival">🛬 Arrivées <span class="agp-tab-count">${arrivals.length}</span></button>
                            <button class="agp-tab" data-filter="all">🌍 Tout <span class="agp-tab-count">${all.length}</span></button>
                        </div>
                        <div class="agp-grid" id="agp-grid">
                            ${departures.map(renderCard).join('')}
                        </div>
                    </div>
                `;
                // Click outside ferme la modale
                modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
                document.body.appendChild(modal);

                // Tabs
                let currentFilter = 'departure';
                const grid = document.getElementById('agp-grid');
                const refreshGrid = () => {
                    const q = (document.getElementById('agp-search-input').value || '').toLowerCase().trim();
                    let list;
                    if (currentFilter === 'departure') list = departures;
                    else if (currentFilter === 'arrival') list = arrivals;
                    else list = all;
                    if (q) list = list.filter((a) => (a.name || '').toLowerCase().includes(q) || (a.id || '').toLowerCase().includes(q));
                    grid.innerHTML = list.length === 0
                        ? `<div class="agp-empty">Aucune route ne correspond à « ${q} »</div>`
                        : list.map(renderCard).join('');
                };
                modal.querySelectorAll('.agp-tab').forEach((t) => {
                    t.addEventListener('click', () => {
                        modal.querySelectorAll('.agp-tab').forEach((x) => x.classList.remove('on'));
                        t.classList.add('on');
                        currentFilter = t.dataset.filter;
                        refreshGrid();
                    });
                });
                // Recherche live
                document.getElementById('agp-search-input').addEventListener('input', refreshGrid);
                // Click sur une card → switch
                modal.addEventListener('click', (e) => {
                    const card = e.target.closest('.agp-card');
                    if (card && card.dataset.agency) {
                        window.switchAgency(card.dataset.agency);
                    }
                });
                // Auto-focus search
                setTimeout(() => document.getElementById('agp-search-input').focus(), 100);
            };
        }

        // --- GESTION GLOBALE DU BADGE DE NOTIFICATION (Placé ici pour s'exécuter AVANT les return) ---
        // Vérification des sessions en attente sur toutes les pages.
        // audit_logs n'est lisible que par les admins (cf. firestore.rules) : on
        // n'ouvre donc l'écouteur que pour eux, sinon permission-denied inutile.
        if (userRole === 'admin' || userRole === 'super_admin') {
        const logsRef = collection(db, getCollectionName("audit_logs"));
        const badgeQuery = query(logsRef, where("action", "==", "VALIDATION_JOURNEE"), orderBy("date", "desc"));

        onSnapshot(badgeQuery, snapshot => {
                // Isolation Maritime/Aérien : on ne compte que les sessions du
                // mode actif. Anciennes sessions sans modeExpedition = maritime.
                const _badgeMode = sessionStorage.getItem('shippingMode') || 'maritime';
                let pendingCount = 0;
                snapshot.forEach(doc => {
                    const data = doc.data();
                    const sMode = (data.modeExpedition === 'aerien') ? 'aerien' : 'maritime';
                    if (sMode !== _badgeMode) return;
                    if (data.status !== "VALIDATED") {
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
        }

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

        // L'overlay de switch d'agence est retiré automatiquement par le
        // MutationObserver watchBodyDisplay (en haut du fichier), qui attend
        // window.load + 2 frames peintes pour éviter tout flash blanc.

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