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

        // --- GESTION DES INTERDICTIONS ---
        
        // 1. SI C'EST UN "SAISIE_FULL"
        if (userRole === 'saisie_full') {
            // Il n'a PAS le droit au Dashboard, ni à la Banque, ni aux Arrivages
            if (currentPage.includes('dashboard.html') || 
                currentPage.includes('bank.html') || 
                currentPage.includes('arrivages.html')) {
                alert("Accès refusé.");
                window.location.href = 'index.html'; 
                return;
            }
            // Il a le droit à : index.html, expenses.html, other-income.html, history.html
        }

        // 2. SI C'EST UN "SAISIE_LIMITED" (Si vous l'utilisez encore)
        if (userRole === 'saisie_limited') {
            // Droit uniquement à Saisie et Historique
            if (!currentPage.includes('index.html') && !currentPage.includes('history.html')) {
                 alert("Accès refusé.");
                 window.location.href = 'index.html';
                 return;
            }
        }

        // --- GESTION DE L'INTERFACE (CACHER LES LIENS) ---
        const navDashboard = document.getElementById('nav-dashboard');
        const navExpenses = document.getElementById('nav-expenses');
        const navOtherIncome = document.getElementById('nav-other-income'); 
        const navBank = document.getElementById('nav-bank'); 
        const navArrivages = document.getElementById('nav-arrivages');

        // Admin voit tout.
        
        // Saisie Full ne voit pas Dashboard, Banque, Arrivages
        if (userRole === 'saisie_full') {
            if (navDashboard) navDashboard.style.display = 'none';
            if (navBank) navBank.style.display = 'none';
            if (navArrivages) navArrivages.style.display = 'none';
            // Il VOIT Expenses et Other Income
        }

        // Saisie Limited ne voit que Saisie et Historique
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