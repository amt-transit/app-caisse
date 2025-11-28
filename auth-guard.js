firebase.auth().onAuthStateChanged(async (user) => {
    
    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    try {
        const userDocRef = firebase.firestore().collection('users').doc(user.uid);
        const userDoc = await userDocRef.get();

        if (!userDoc.exists) {
            throw new Error("Rôle non défini pour cet utilisateur.");
        }

        const userRole = userDoc.data().role; 
        sessionStorage.setItem('userRole', userRole);

        const currentPage = window.location.pathname;

        // --- GESTION DES ACCÈS ---
        
        // SUPER ADMIN : Accès TOTAL + Page Admin
        if (userRole === 'super_admin') {
            document.body.style.display = 'block';
            return; // Il a le droit à tout, on arrête les vérifs
        }

        // Si quelqu'un d'autre essaie d'aller sur le panel admin
        if (currentPage.includes('admin-panel.html')) {
            alert("Accès réservé au Super Admin.");
            window.location.href = 'index.html';
            return;
        }

        // ADMIN CLASSIQUE : Tout sauf Admin Panel
        if (userRole === 'admin') {
            document.body.style.display = 'block';
            return;
        }

        // SAISIE FULL
        if (userRole === 'saisie_full') {
            if (currentPage.includes('dashboard.html') || 
                currentPage.includes('bank.html') || 
                currentPage.includes('arrivages.html')) {
                alert("Accès refusé.");
                window.location.href = 'index.html'; return;
            }
        }

        // SAISIE LIMITED
        if (userRole === 'saisie_limited') {
            if (!currentPage.includes('index.html') && !currentPage.includes('history.html')) {
                 alert("Accès refusé.");
                 window.location.href = 'index.html'; return;
            }
        }

        // --- GESTION DE L'INTERFACE (CACHER LES LIENS) ---
        const navDashboard = document.getElementById('nav-dashboard');
        const navExpenses = document.getElementById('nav-expenses');
        const navOtherIncome = document.getElementById('nav-other-income'); 
        const navBank = document.getElementById('nav-bank'); 
        const navArrivages = document.getElementById('nav-arrivages');
        const navAdmin = document.getElementById('nav-admin'); // Nouveau lien

        // Cacher le lien Admin Panel pour tout le monde sauf Super Admin
        if (navAdmin && userRole !== 'super_admin') navAdmin.style.display = 'none';

        if (userRole === 'saisie_full') {
            if (navDashboard) navDashboard.style.display = 'none';
            if (navBank) navBank.style.display = 'none';
            if (navArrivages) navArrivages.style.display = 'none';
        }

        if (userRole === 'saisie_limited') {
            if (navDashboard) navDashboard.style.display = 'none';
            if (navExpenses) navExpenses.style.display = 'none';
            if (navOtherIncome) navOtherIncome.style.display = 'none';
            if (navBank) navBank.style.display = 'none';
            if (navArrivages) navArrivages.style.display = 'none';
        }

        document.body.style.display = 'block';

    } catch (error) {
        console.error("Erreur auth :", error);
        firebase.auth().signOut();
        window.location.href = 'login.html';
    }
});