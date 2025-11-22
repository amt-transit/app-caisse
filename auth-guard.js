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

        // --- GESTION DES ACCÈS ---
        const currentPage = window.location.pathname;

        // Si ce n'est PAS un admin
        if (userRole !== 'admin') {
            const isRestrictedPage = currentPage.includes('dashboard.html') || 
                                     currentPage.includes('expenses.html') ||
                                     currentPage.includes('other-income.html') ||
                                     currentPage.includes('bank.html') ||
                                     currentPage.includes('arrivages.html'); // PAGE PROTÉGÉE
                                     currentPage.includes('clients.html'); // AJOUTER ICI

            if (isRestrictedPage) {
                alert("Accès refusé. Vous n'avez pas les droits pour cette page.");
                window.location.href = 'index.html'; 
                return;
            }
        }

        // --- GESTION DE L'INTERFACE (Cacher les liens) ---
        const navDashboard = document.getElementById('nav-dashboard');
        const navExpenses = document.getElementById('nav-expenses');
        const navOtherIncome = document.getElementById('nav-other-income'); 
        const navBank = document.getElementById('nav-bank'); 
        const navArrivages = document.getElementById('nav-arrivages'); // LIEN À CACHER

        if (userRole !== 'admin') {
            if (navDashboard) navDashboard.style.display = 'none';
            if (navExpenses) navExpenses.style.display = 'none';
            if (navOtherIncome) navOtherIncome.style.display = 'none';
            if (navBank) navBank.style.display = 'none';
            if (navArrivages) navArrivages.style.display = 'none'; // CACHER LE LIEN
            const navClients = document.getElementById('nav-clients'); // AJOUTER ICI
            if (navClients) navClients.style.display = 'none'; // AJOUTER ICI
        }

        document.body.style.display = 'block';

    } catch (error) {
        console.error("Erreur d'authentification ou de rôle :", error);
        alert(error.message);
        firebase.auth().signOut();
        window.location.href = 'login.html';
    }
});