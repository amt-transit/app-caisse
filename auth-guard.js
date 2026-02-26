firebase.auth().onAuthStateChanged(async (user) => {
    
    if (!user) {
        // Pas connecté, redirection normale vers login
        if (!window.location.pathname.includes('login.html')) {
            window.location.href = 'login.html';
        }
        return;
    }

    try {
        console.log("Utilisateur connecté :", user.uid); // DEBUG

        const userDocRef = firebase.firestore().collection('users').doc(user.uid);
        const userDoc = await userDocRef.get();

        // DIAGNOSTIC 1 : Le document existe-t-il ?
        if (!userDoc.exists) {
            alert("ERREUR CRITIQUE :\n\nVotre compte de connexion existe, mais votre 'Fiche Utilisateur' (Rôle) est introuvable dans la base de données.\n\nID cherché : " + user.uid);
            throw new Error("Profil utilisateur introuvable dans Firestore.");
        }

        const userData = userDoc.data();
        const userRole = userData.role; 
        
        // DIAGNOSTIC 2 : Le rôle est-il valide ?
        if (!userRole) {
            alert("ERREUR CRITIQUE :\n\nVotre fiche utilisateur existe, mais le champ 'role' est vide.");
            throw new Error("Champ 'role' manquant.");
        }

        console.log("Rôle trouvé :", userRole); // DEBUG

        // Stockage session
        let userName = userData.displayName;
        if (!userName && userData.email) {
            userName = userData.email.split('@')[0];
            userName = userName.charAt(0).toUpperCase() + userName.slice(1);
        }
        sessionStorage.setItem('userRole', userRole);
        sessionStorage.setItem('userName', userName || 'Utilisateur');

        // --- GESTION GLOBALE DU BADGE DE NOTIFICATION (Placé ici pour s'exécuter AVANT les return) ---
        // Vérification des sessions en attente sur toutes les pages
        firebase.firestore().collection("audit_logs")
            .where("action", "==", "VALIDATION_JOURNEE")
            .orderBy("date", "desc")
            .limit(20)
            .onSnapshot(snapshot => {
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
            // On ré-affiche l'onglet Admin spécifiquement pour le Super Admin
            const navAdmin = document.getElementById('nav-admin');
            if (navAdmin) navAdmin.style.display = 'block';
            document.body.style.display = 'block';
            return;
        }

        // Protection page Admin
        if (currentPage.includes('admin-panel.html')) {
            alert("Accès réservé au Super Admin.");
            window.location.href = 'index.html';
            return;
        }

        // Protection page Points
        if (currentPage.includes('points.html')) {
            if (userRole !== 'admin' && userRole !== 'super_admin') {
                alert("Accès refusé : Réservé aux Administrateurs.");
                window.location.href = 'index.html';
                return;
            }
        }

        // Protection page Audit
        if (currentPage.includes('audit.html')) {
            if (userRole !== 'admin' && userRole !== 'super_admin') {
                alert("Accès refusé : Réservé aux Administrateurs.");
                window.location.href = 'index.html';
                return;
            }
        }

        // ADMIN
        if (userRole === 'admin') {
            document.body.style.display = 'block';
            return;
        }

        // SAISIE FULL
        if (userRole === 'saisie_full') {
            if (currentPage.includes('bank.html') || 
                currentPage.includes('salaire.html')) {
                alert("Accès refusé : Votre rôle (Saisie Full) ne permet pas d'accéder à cette page.");
                window.location.href = 'index.html'; 
                return;
            }
        }

        // SAISIE LIMITED
        if (userRole === 'saisie_limited') {
            if (!currentPage.includes('index.html') && !currentPage.includes('history.html') && !currentPage.includes('magasinage.html')) {
                 alert("Accès refusé : Votre rôle (Saisie Limited) ne permet pas d'accéder à cette page.");
                 window.location.href = 'index.html'; 
                 return;
            }
        }

        // Protection page Confirmation
        if (currentPage.includes('confirmation.html') && userRole === 'saisie_limited') {
            alert("Accès refusé : Réservé aux Admins et Saisie Full.");
            window.location.href = 'index.html';
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

        if (navAdmin && userRole !== 'super_admin') navAdmin.style.display = 'none';
        if (navPoints && (userRole !== 'admin' && userRole !== 'super_admin')) navPoints.style.display = 'none';
        if (navAudit && (userRole !== 'admin' && userRole !== 'super_admin')) navAudit.style.display = 'none';

        if (userRole === 'saisie_full') {
            if (navMagasinage) navMagasinage.style.display = 'inline';
            if (navBank) navBank.style.display = 'none';
            if (navSalaire) navSalaire.style.display = 'none';
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
        }

        document.body.style.display = 'block';

    } catch (error) {
        console.error("Erreur auth :", error);
        // On ne déconnecte PAS tout de suite pour vous laisser lire l'alerte si c'est une erreur de permission
        if (error.code === 'permission-denied') {
             alert("ERREUR PERMISSION : Les règles de sécurité de Firestore bloquent la lecture de votre profil.\nVérifiez l'onglet 'Règles' dans la console Firebase.");
        }
        firebase.auth().signOut();
        window.location.href = 'login.html';
    }
});