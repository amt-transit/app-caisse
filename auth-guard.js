<<<<<<< HEAD
// auth-guard.js (Mis à jour)

firebase.auth().onAuthStateChanged(async (user) => {
    
    // CAS 1 : L'utilisateur n'est PAS connecté
    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    // CAS 2 : L'utilisateur EST connecté
    try {
        const userDocRef = firebase.firestore().collection('users').doc(user.uid);
        const userDoc = await userDocRef.get();

        if (!userDoc.exists) {
            throw new Error("Rôle non défini pour cet utilisateur.");
        }

        const userRole = userDoc.data().role; // 'admin', 'saisie_full' ou 'saisie_limited'
        
        // Stocker le rôle pour un accès facile par les autres scripts
        sessionStorage.setItem('userRole', userRole);

        // --- GESTION DES ACCÈS ---
        const currentPage = window.location.pathname;

        // Si un compte "saisie" (complet OU limité) essaie d'accéder au Tableau de Bord
        if ((userRole === 'saisie_full' || userRole === 'saisie_limited') && currentPage.includes('dashboard.html')) {
            alert("Accès refusé. Vous n'avez pas les droits pour cette page.");
            window.location.href = 'index.html'; // On le renvoie à la saisie
            return;
        }

        // --- GESTION DE L'INTERFACE ---
        
        // Cacher le lien "Tableau de Bord" si ce n'est pas un admin
        const navDashboard = document.getElementById('nav-dashboard');
        if (navDashboard && (userRole === 'saisie_full' || userRole === 'saisie_limited')) {
            navDashboard.style.display = 'none';
        }

        // Si tout est OK, on affiche enfin la page
        document.body.style.display = 'block';

    } catch (error) {
        console.error("Erreur d'authentification ou de rôle :", error);
        alert(error.message);
        firebase.auth().signOut();
        window.location.href = 'login.html';
    }
=======
// auth-guard.js (Mis à jour)

firebase.auth().onAuthStateChanged(async (user) => {
    
    // CAS 1 : L'utilisateur n'est PAS connecté
    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    // CAS 2 : L'utilisateur EST connecté
    try {
        const userDocRef = firebase.firestore().collection('users').doc(user.uid);
        const userDoc = await userDocRef.get();

        if (!userDoc.exists) {
            throw new Error("Rôle non défini pour cet utilisateur.");
        }

        const userRole = userDoc.data().role; // 'admin', 'saisie_full' ou 'saisie_limited'
        
        // Stocker le rôle pour un accès facile par les autres scripts
        sessionStorage.setItem('userRole', userRole);

        // --- GESTION DES ACCÈS ---
        const currentPage = window.location.pathname;

        // Si un compte "saisie" (complet OU limité) essaie d'accéder au Tableau de Bord
        if ((userRole === 'saisie_full' || userRole === 'saisie_limited') && currentPage.includes('dashboard.html')) {
            alert("Accès refusé. Vous n'avez pas les droits pour cette page.");
            window.location.href = 'index.html'; // On le renvoie à la saisie
            return;
        }

        // --- GESTION DE L'INTERFACE ---
        
        // Cacher le lien "Tableau de Bord" si ce n'est pas un admin
        const navDashboard = document.getElementById('nav-dashboard');
        if (navDashboard && (userRole === 'saisie_full' || userRole === 'saisie_limited')) {
            navDashboard.style.display = 'none';
        }

        // Si tout est OK, on affiche enfin la page
        document.body.style.display = 'block';

    } catch (error) {
        console.error("Erreur d'authentification ou de rôle :", error);
        alert(error.message);
        firebase.auth().signOut();
        window.location.href = 'login.html';
    }
>>>>>>> ae5236cb0be7515024518b58a37aa53c2e668ff3
});