document.addEventListener('DOMContentLoaded', async () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: Connexion BDD échouée."); return;
    }

    // --- SÉCURITÉ : VÉRIFICATION RÔLE (Admin OU Super Admin) ---
    const userRole = sessionStorage.getItem('userRole');
    if (userRole !== 'admin' && userRole !== 'super_admin') {
        document.body.innerHTML = '<h2 style="text-align:center; margin-top:50px; color:red;">⛔ Accès Refusé<br><small>Réservé aux Administrateurs</small></h2>';
        setTimeout(() => window.location.href = 'index.html', 2000);
        return;
    }

    // Force l'affichage de l'onglet si jamais auth-guard l'a masqué par erreur
    const navPoint = document.getElementById('nav-points');
    if(navPoint) navPoint.style.display = 'block';

    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    const tableBody = document.getElementById('pointsTableBody');

    // Initialisation Dates (Mois en cours)
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    startDateInput.value = firstDay.toISOString().split('T')[0];
    endDateInput.value = today.toISOString().split('T')[0];

    // Écouteurs
    startDateInput.addEventListener('change', loadPointsData);
    endDateInput.addEventListener('change', loadPointsData);

    // Chargement initial
    loadPointsData();

    async function loadPointsData() {
        tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Chargement des données...</td></tr>';

        const start = startDateInput.value;
        const end = endDateInput.value;

        if (!start || !end) return;

        try {
            // 1. Récupérer les Sessions (Audit Logs) pour mapper SessionID -> Utilisateur
            // C'est crucial pour attribuer les dépenses au bon utilisateur
            const sessionsSnap = await db.collection("audit_logs")
                .where("action", "==", "VALIDATION_JOURNEE")
                .where("date", ">=", start)
                .where("date", "<=", end + "T23:59:59")
                .get();

            const sessionUserMap = {};
            sessionsSnap.forEach(doc => {
                const data = doc.data();
                sessionUserMap[doc.id] = data.user;
            });

            // 2. Récupérer les Transactions (Encaissements)
            const transSnap = await db.collection("transactions")
                .where("date", ">=", start)
                .where("date", "<=", end)
                .get();

            // 3. Récupérer les Dépenses
            const expSnap = await db.collection("expenses")
                .where("date", ">=", start)
                .where("date", "<=", end)
                .get();

            // --- TRAITEMENT DES DONNÉES ---
            const userStats = {};

            // A. Traitement des Encaissements (Espèces uniquement pour le "Point")
            transSnap.forEach(doc => {
                const t = doc.data();
                if (t.isDeleted === true) return;
                
                // On ne compte que les espèces pour la caisse physique
                if (t.modePaiement !== 'Espèce') return;

                const user = t.saisiPar || "Inconnu";
                
                if (!userStats[user]) userStats[user] = { in: 0, out: 0 };
                
                // On prend le montant Abidjan (Caisse locale)
                userStats[user].in += (t.montantAbidjan || 0);
            });

            // B. Traitement des Dépenses
            expSnap.forEach(doc => {
                const e = doc.data();
                if (e.isDeleted === true) return;

                let user = "Inconnu";

                // Priorité 1 : Via l'ID de session (Lien fort)
                if (e.sessionId && sessionUserMap[e.sessionId]) {
                    user = sessionUserMap[e.sessionId];
                } 
                // Priorité 2 : Via la description (ex: "Carburant (Jean)")
                else if (e.description && e.description.includes('(')) {
                    const match = e.description.match(/\((.*?)\)/);
                    if (match && match[1]) user = match[1];
                }

                // Si l'utilisateur n'a pas d'encaissement mais a des dépenses, on l'initialise
                if (!userStats[user]) userStats[user] = { in: 0, out: 0 };

                userStats[user].out += (e.montant || 0);
            });

            // --- AFFICHAGE ---
            tableBody.innerHTML = '';
            const sortedUsers = Object.keys(userStats).sort();

            if (sortedUsers.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Aucune activité sur cette période.</td></tr>';
                return;
            }

            sortedUsers.forEach(user => {
                const stats = userStats[user];
                const solde = stats.in - stats.out;
                
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td style="font-weight:bold;">${user}</td>
                    <td style="color:#10b981;">${formatCFA(stats.in)}</td>
                    <td style="color:#ef4444;">${formatCFA(stats.out)}</td>
                    <td style="font-weight:bold; font-size:1.1em; color:${solde >= 0 ? '#000' : '#d32f2f'}">${formatCFA(solde)}</td>
                `;
                tableBody.appendChild(row);
            });

        } catch (e) { console.error(e); alert("Erreur chargement points."); }
    }

    function formatCFA(n) { return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(n || 0); }
    initBackToTopButton();
});

// --- GESTION DU BOUTON "RETOUR EN HAUT" (GLOBAL & MODALS) ---
function initBackToTopButton() {
    // 1. Bouton Global (Window)
    let backToTopBtn = document.getElementById('backToTopBtn');
    if (!backToTopBtn) {
        backToTopBtn = document.createElement('button');
        backToTopBtn.id = 'backToTopBtn';
        backToTopBtn.title = 'Retour en haut';
        backToTopBtn.innerHTML = '&#8593;';
        document.body.appendChild(backToTopBtn);
        backToTopBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    }

    const toggleGlobalBtn = () => {
        if ((window.pageYOffset || document.documentElement.scrollTop) > 300) backToTopBtn.classList.add('show');
        else backToTopBtn.classList.remove('show');
    };
    window.addEventListener('scroll', toggleGlobalBtn, { passive: true });

    // 2. Boutons Modals (.modal-content)
    const attachModalButtons = () => {
        document.querySelectorAll('.modal-content').forEach(modalContent => {
            if (modalContent.dataset.hasBackToTop) return;
            
            const modalBtn = document.createElement('button');
            modalBtn.className = 'modal-back-to-top';
            modalBtn.innerHTML = '&#8593;';
            modalBtn.title = 'Haut de page';
            modalContent.appendChild(modalBtn);
            modalContent.dataset.hasBackToTop = "true";

            modalBtn.addEventListener('click', () => modalContent.scrollTo({ top: 0, behavior: 'smooth' }));

            modalContent.addEventListener('scroll', () => {
                if (modalContent.scrollTop > 200) modalBtn.classList.add('show');
                else modalBtn.classList.remove('show');
            }, { passive: true });
        });
    };

    attachModalButtons();
    const observer = new MutationObserver(attachModalButtons);
    observer.observe(document.body, { childList: true, subtree: true });
}