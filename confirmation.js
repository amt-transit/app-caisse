document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: Connexion BDD échouée."); return;
    }

    const sessionsListPendingEl = document.getElementById('sessionsListPending');
    const sessionsListValidatedEl = document.getElementById('sessionsListValidated');
    const sessionsListArchivesEl = document.getElementById('sessionsListArchives');
    const sessionDetailsEl = document.getElementById('sessionDetails');
    const noSelectionMsg = document.getElementById('noSelectionMsg');
    const filterDateSession = document.getElementById('filterDateSession');
    
    const detailDateUser = document.getElementById('detailDateUser');
    const detailStatus = document.getElementById('detailStatus');
    const validateSessionBtn = document.getElementById('validateSessionBtn');
    
    const detailsEncaissementsBody = document.getElementById('detailsEncaissementsBody');
    const detailsDepensesBody = document.getElementById('detailsDepensesBody');
    
    const countEncaissements = document.getElementById('countEncaissements');
    const countDepenses = document.getElementById('countDepenses');
    const totalEspEl = document.getElementById('totalEsp');
    const totalDepEl = document.getElementById('totalDep');
    const totalNetEl = document.getElementById('totalNet');

    const archiveMonthInput = document.getElementById('archiveMonth');
    const searchArchiveBtn = document.getElementById('searchArchiveBtn');

    let currentSessionId = null;

    // 1. Charger la liste des sessions (Basé sur les logs de validation)
    function loadSessions() {
        // OPTIMISATION : On ne charge que les 20 dernières sessions par défaut
        let query = db.collection("audit_logs")
            .where("action", "==", "VALIDATION_JOURNEE")
            .orderBy("date", "desc")
            .limit(20); 

        query.onSnapshot(snapshot => {
            sessionsListPendingEl.innerHTML = '';
            sessionsListValidatedEl.innerHTML = '';

            if (snapshot.empty) {
                sessionsListPendingEl.innerHTML = '<p style="padding:10px; color:#999;">Aucune session.</p>';
                return;
            }

            snapshot.forEach(doc => {
                const div = createSessionElement(doc);
                const data = doc.data();
                const isValidated = data.status === "VALIDATED";

                // Filtrage date local (seulement pour la liste chargée)
                if (filterDateSession.value && data.date.split('T')[0] !== filterDateSession.value) return;

                if (isValidated) {
                    sessionsListValidatedEl.appendChild(div);
                } else {
                    sessionsListPendingEl.appendChild(div);
                }
            });
        });
    }

    // Fonction utilitaire pour créer l'élément HTML d'une session
    function createSessionElement(doc) {
        const data = doc.data();
        const dateObj = new Date(data.date);
        const dateStr = dateObj.toLocaleDateString('fr-FR');
        const timeStr = dateObj.toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'});
        
        const div = document.createElement('div');
        div.className = 'session-item';
        div.style.padding = '10px';
        div.style.borderBottom = '1px solid #eee';
        div.style.cursor = 'pointer';
        div.style.transition = 'background 0.2s';
        
        const isValidated = data.status === "VALIDATED";
        const statusIcon = isValidated ? "✅" : "⏳";

        div.innerHTML = `
            <div style="font-weight:bold; color:#334155;">${statusIcon} ${dateStr} à ${timeStr}</div>
            <div style="font-size:0.9em; color:#64748b;">Par: ${data.user}</div>
        `;
        
        div.addEventListener('mouseover', () => div.style.background = '#f1f5f9');
        div.addEventListener('mouseout', () => div.style.background = 'transparent');
        div.addEventListener('click', () => loadSessionDetails(doc.id, data));
        return div;
    }

    // 1b. Charger les Archives (Sur demande)
    searchArchiveBtn.addEventListener('click', () => {
        const monthVal = archiveMonthInput.value; // YYYY-MM
        if (!monthVal) return alert("Veuillez sélectionner un mois.");

        sessionsListArchivesEl.innerHTML = '<p style="color:#666;">Recherche...</p>';

        // Calculer premier et dernier jour du mois
        const start = monthVal + "-01";
        const [year, month] = monthVal.split('-').map(Number);
        const lastDay = new Date(year, month, 0).getDate();
        const end = `${monthVal}-${lastDay}T23:59:59`;

        db.collection("audit_logs")
            .where("action", "==", "VALIDATION_JOURNEE")
            .where("date", ">=", start)
            .where("date", "<=", end)
            .orderBy("date", "desc")
            .get()
            .then(snapshot => {
                sessionsListArchivesEl.innerHTML = '';
                if (snapshot.empty) {
                    sessionsListArchivesEl.innerHTML = '<p>Aucune session trouvée.</p>';
                    return;
                }
                snapshot.forEach(doc => {
                    sessionsListArchivesEl.appendChild(createSessionElement(doc));
                });
            })
            .catch(err => {
                console.error(err);
                sessionsListArchivesEl.innerHTML = '<p style="color:red;">Erreur chargement.</p>';
            });
    });

    // 2. Charger les détails d'une session
    async function loadSessionDetails(logId, logData) {
        currentSessionId = logId;
        noSelectionMsg.style.display = 'none';
        sessionDetailsEl.style.display = 'block';
        
        const dateOnly = logData.date.split('T')[0];
        detailDateUser.textContent = `Saisie du ${dateOnly} par ${logData.user}`;
        
        // Vérifier si déjà validé
        if (logData.status === "VALIDATED") {
            detailStatus.textContent = "Validé par " + (logData.validatedBy || "Admin");
            detailStatus.style.background = "#10b981";
            detailStatus.style.color = "white";
            validateSessionBtn.style.display = 'none'; // Cacher le bouton si déjà validé
        } else {
            detailStatus.textContent = "En attente de revue";
            detailStatus.style.background = "#f59e0b";
            detailStatus.style.color = "white";
            validateSessionBtn.style.display = 'block';
        }

        // Charger Transactions
        const transSnap = await db.collection("transactions")
            .where("saisiPar", "==", logData.user)
            .where("lastPaymentDate", "==", dateOnly) // On utilise lastPaymentDate car c'est ce que script.js met à jour
            .get();

        // Charger Dépenses
        const expSnap = await db.collection("expenses")
            .where("description", ">=", "") // Hack pour filtrer par description qui contient le user
            .orderBy("description")
            .get();
            
        // Filtrage manuel des dépenses par date et user (car description contient "User")
        const expenses = expSnap.docs
            .map(d => d.data())
            .filter(e => e.date === dateOnly && e.description.includes(logData.user));

        // Rendu Transactions
        detailsEncaissementsBody.innerHTML = '';
        let sumEsp = 0;
        transSnap.forEach(doc => {
            const t = doc.data();
            // On doit filtrer l'historique pour ne prendre que ce qui a été payé CE JOUR LÀ par CET UTILISATEUR
            // C'est complexe car le document contient le cumul.
            // Simplification : On affiche le document tel quel s'il a été touché ce jour là.
            // Pour être précis, il faudrait regarder paymentHistory.
            
            let payeCeJour = 0;
            if (t.paymentHistory) {
                t.paymentHistory.forEach(p => {
                    if (p.date === dateOnly && p.saisiPar === logData.user) {
                        payeCeJour += (p.montantAbidjan || 0) + (p.montantParis || 0);
                        if (p.modePaiement === 'Espèce') sumEsp += (p.montantAbidjan || 0);
                    }
                });
            } else {
                // Fallback
                payeCeJour = (t.montantAbidjan || 0) + (t.montantParis || 0);
                if (t.modePaiement === 'Espèce') sumEsp += (t.montantAbidjan || 0);
            }

            if (payeCeJour > 0) {
                detailsEncaissementsBody.innerHTML += `
                    <tr><td>${t.reference}</td><td>${t.nom}</td><td>${t.conteneur}</td><td>${formatCFA(t.prix)}</td><td style="font-weight:bold;">${formatCFA(payeCeJour)}</td><td>${t.modePaiement}</td></tr>
                `;
            }
        });
        countEncaissements.textContent = detailsEncaissementsBody.children.length;

        // Rendu Dépenses
        detailsDepensesBody.innerHTML = '';
        let sumDep = 0;
        expenses.forEach(e => {
            sumDep += (e.montant || 0);
            detailsDepensesBody.innerHTML += `<tr><td>${e.description}</td><td>${e.type}</td><td>${formatCFA(e.montant)}</td></tr>`;
        });
        countDepenses.textContent = expenses.length;

        // Totaux
        totalEspEl.textContent = formatCFA(sumEsp);
        totalDepEl.textContent = formatCFA(sumDep);
        totalNetEl.textContent = formatCFA(sumEsp - sumDep);
    }

    validateSessionBtn.addEventListener('click', () => {
        if (!currentSessionId) return;
        if (confirm("Confirmer la validation de cette journée ?")) {
            // Ici on pourrait mettre à jour le document audit_log pour dire "Validé par Admin"
            db.collection("audit_logs").doc(currentSessionId).update({
                status: "VALIDATED",
                validatedBy: sessionStorage.getItem('userName'),
                validatedAt: new Date().toISOString()
            }).then(() => {
                alert("Journée validée avec succès !");
                detailStatus.textContent = "Validé";
                detailStatus.style.background = "#10b981";
                detailStatus.style.color = "white";
                validateSessionBtn.style.display = 'none';
            });
        }
    });

    filterDateSession.addEventListener('change', loadSessions);
    loadSessions();

    function formatCFA(n) { return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(n || 0); }
});