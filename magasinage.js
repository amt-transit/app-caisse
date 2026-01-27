document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: Connexion BDD échouée."); return;
    }

    const transactionsCollection = db.collection("transactions");
    const tableBody = document.getElementById('magasinageTableBody');
    const searchInput = document.getElementById('magasinageSearch');
    const totalFeesEl = document.getElementById('totalMagasinageFees');

    let allTransactions = [];

    // 1. Chargement des données
    transactionsCollection.where("isDeleted", "!=", true).orderBy("date", "desc").onSnapshot(snapshot => {
        allTransactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderTable();
    }, error => console.error(error));

    // 2. Fonction de calcul des frais (NOUVELLE LOGIQUE)
    function calculateStorageFee(dateString) {
        if (!dateString) return { days: 0, fee: 0 };

        const arrivalDate = new Date(dateString);
        const today = new Date();
        
        // Calcul de la différence en jours (arrondi au supérieur)
        const diffTime = today - arrivalDate;
        // Si la date est dans le futur (erreur de saisie), on met 0
        if (diffTime < 0) return { days: 0, fee: 0 };

        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= 7) {
            // Semaine 1 : Gratuit
            return { days: diffDays, fee: 0 };
        } else if (diffDays <= 14) {
            // Semaine 2 : Pénalité fixe de 10 000 F
            return { days: diffDays, fee: 10000 };
        } else {
            // Au-delà de 14 jours : 10 000 F + 1 000 F par jour supplémentaire
            const extraDays = diffDays - 14;
            const fee = 10000 + (extraDays * 1000);
            return { days: diffDays, fee: fee };
        }
    }

    // 3. Affichage du tableau
    function renderTable() {
        const term = searchInput ? searchInput.value.toLowerCase().trim() : "";
        
        // On filtre d'abord
        const filtered = allTransactions.filter(t => {
            if (!term) return true; 
            return (t.reference || "").toLowerCase().includes(term) ||
                   (t.nom || "").toLowerCase().includes(term) ||
                   (t.conteneur || "").toLowerCase().includes(term);
        });

        tableBody.innerHTML = '';
        let totalPotentialFees = 0;

        if (filtered.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6">Aucun colis trouvé.</td></tr>';
            if(totalFeesEl) totalFeesEl.textContent = formatCFA(0);
            return;
        }

        // On limite l'affichage aux 100 premiers pour la performance si pas de recherche précise
        const toShow = filtered.slice(0, 100);

        toShow.forEach(t => {
            const { days, fee } = calculateStorageFee(t.date);
            
            if (fee > 0) totalPotentialFees += fee;

            const row = document.createElement('tr');
            
            // Style pour les frais élevés
            const feeClass = fee > 0 ? 'fee-warning' : 'fee-ok';
            // Rouge si > 20000, Orange si > 0, Vert sinon
            let feeStyle = fee > 20000 ? 'font-weight:bold; color:#dc3545;' : (fee > 0 ? 'color:#d97706;' : 'color:#10b981;');
            let feeText = formatCFA(fee);

            // Règle REBUS : > 90 jours (3 mois)
            if (days > 90) {
                feeStyle = 'font-weight:bold; color:#fff; background-color:#ef4444; padding: 4px 8px; border-radius: 4px; display:inline-block;';
                feeText = "⚠️ REBUS (Abandonné)";
                row.style.backgroundColor = "#fff1f2";
            }

            row.innerHTML = `
                <td>${t.date}</td>
                <td>${t.reference}</td>
                <td>${t.nom}</td>
                <td>${t.conteneur}</td>
                <td><span class="tag" style="background:#e2e8f0; color:#334155;">${days} jours</span></td>
                <td style="${feeStyle}">${feeText}</td>
            `;
            tableBody.appendChild(row);
        });

        if(totalFeesEl) totalFeesEl.textContent = formatCFA(totalPotentialFees);
    }

    if(searchInput) searchInput.addEventListener('input', renderTable);

    function formatCFA(n) {
        return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(n || 0);
    }
});