document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        alert("Erreur: Connexion échouée."); return;
    }

    const userRole = sessionStorage.getItem('userRole');
    const currentUserName = sessionStorage.getItem('userName') || 'Utilisateur';
    const transactionsCollection = db.collection("transactions");
    const tableBody = document.getElementById('tableBody');
    
    const showDeletedCheckbox = document.getElementById('showDeletedCheckbox');
    const smartSearchInput = document.getElementById('smartSearch');
    const agentFilterInput = document.getElementById('agentFilter');
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');

    // --- AJOUT DYNAMIQUE : Bouton Correction Date en Masse ---
    const controlsContainer = document.querySelector('.history-controls') || smartSearchInput.parentNode;
    const batchDateBtn = document.createElement('button');
    batchDateBtn.innerHTML = '<i class="fa-solid fa-calendar-days"></i> Corriger Dates (Lot)';
    batchDateBtn.className = "btn";
    batchDateBtn.style.cssText = "background-color:#f59e0b; color:white; margin-left:10px; font-size:12px; padding: 6px 12px; display:none; border:none; border-radius:4px; cursor:pointer;";
    if (controlsContainer) controlsContainer.appendChild(batchDateBtn);

    let currentFilteredTransactions = []; // Pour stocker la liste affichée

    // --- AJOUT DYNAMIQUE : Checkbox Tri Conteneur ---
    let sortByContainerCheckbox = document.getElementById('sortByContainerCheckbox');
    if (!sortByContainerCheckbox && showDeletedCheckbox && showDeletedCheckbox.parentNode) {
        const span = document.createElement('span');
        span.style.marginLeft = "15px";
        span.innerHTML = `<input type="checkbox" id="sortByContainerCheckbox" style="width:auto; vertical-align:middle;"> <label for="sortByContainerCheckbox" style="cursor:pointer; font-size:12px;">Tri par Conteneur</label>`;
        showDeletedCheckbox.parentNode.appendChild(span);
        sortByContainerCheckbox = document.getElementById('sortByContainerCheckbox');
        sortByContainerCheckbox.addEventListener('change', () => applyFiltersAndRender());
    }

    // --- AJOUT DYNAMIQUE : Checkbox Filtre Réductions ---
    let showReductionsCheckbox = document.getElementById('showReductionsCheckbox');
    if (!showReductionsCheckbox && showDeletedCheckbox && showDeletedCheckbox.parentNode) {
        const spanReduc = document.createElement('span');
        spanReduc.style.marginLeft = "15px";
        spanReduc.innerHTML = `<input type="checkbox" id="showReductionsCheckbox" style="width:auto; vertical-align:middle;"> <label for="showReductionsCheckbox" style="cursor:pointer; font-size:12px; color:#10b981; font-weight:bold;">🎁 Réductions</label>`;
        showDeletedCheckbox.parentNode.appendChild(spanReduc);
        showReductionsCheckbox = document.getElementById('showReductionsCheckbox');
    }

    // --- MODAL DE VISUALISATION (EXISTANT) ---
    const viewModal = document.getElementById('paymentHistoryModal');
    const viewModalList = document.getElementById('paymentHistoryList');
    const viewModalTitle = document.getElementById('modalRefTitle');
    const closeViewModal = document.querySelector('.close-modal');

    // --- NOUVEAU : MODAL D'ÉDITION COMPLET ---
    const editModalHTML = `
    <div id="historyEditModal" class="modal">
        <div class="modal-content" style="max-width: 950px; border-radius: 12px;">
            <span class="close-modal" id="closeHistoryEditModal" style="float:right; cursor:pointer; font-size:24px;">&times;</span>
            <h2 id="historyEditModalTitle" style="margin-top:0;">Modifier Transaction</h2>
            
            <div class="form-grid" style="grid-template-columns: 1fr 1fr 1fr 1fr; gap:15px;">
                <div><label>Date Opération</label><input type="date" id="editHistMainDate"></div>
                <div><label>Référence</label><input type="text" id="editHistRef" readonly style="background:#eee;"></div>
                <div><label>Nom Client</label><input type="text" id="editHistNom"></div>
                <div><label>Conteneur</label><input type="text" id="editHistConteneur"></div>
                <div><label>Prix Total</label><input type="number" id="editHistPrix"></div>
            </div>

            <hr style="margin: 20px 0;">

            <h3 style="margin-bottom:10px;">Historique des paiements</h3>
            <div style="max-height: 200px; overflow-y: auto; border: 1px solid #eee; border-radius: 8px;">
                <table class="table">
                    <thead><tr><th>Date</th><th>Montant Paris</th><th>Montant Abidjan</th><th>Mode</th><th>Agent</th><th>Saisi par</th><th>Action</th></tr></thead>
                    <tbody id="editHistPaymentsBody"></tbody>
                </table>
            </div>

            <h3 style="margin-top:20px;">Ajouter / Modifier un paiement</h3>
            <div class="form-grid" style="grid-template-columns: 1fr 1fr 1fr; gap:15px; background: #f8f9fa; padding: 15px; border-radius: 8px;">
                <input type="hidden" id="editHistPaymentIndex">
                <div><label>Date</label><input type="date" id="editHistPayDate"></div>
                <div><label>Montant Paris</label><input type="number" id="editHistPayParis" placeholder="0"></div>
                <div><label>Montant Abidjan</label><input type="number" id="editHistPayAbidjan" placeholder="0"></div>
                <div><label>Mode Paiement</label>
                    <select id="editHistPayMode">
                        <option>Espèce</option><option>Wave</option><option>OM</option><option>Chèque</option><option>Virement</option>
                    </select>
                </div>
                <div><label>Banque / Agent MM</label><input type="text" id="editHistPayInfo" placeholder="Ex: BICICI, Wave..."></div>
                <div><label>Agent (Livreur)</label><select id="editHistPayAgent"></select></div>
            </div>
            <button id="addOrUpdatePaymentBtn" class="btn" style="margin-top:10px; background:#3b82f6;">Ajouter ce paiement</button>

            <div style="text-align:right; margin-top:30px; border-top: 1px solid #eee; padding-top: 15px;">
                <button id="cancelHistoryEditBtn" class="btn" style="background: #6c757d; margin-right:10px;">Annuler</button>
                <button id="saveHistoryChangesBtn" class="btn btn-success">Enregistrer les modifications</button>
            </div>
        </div>
    </div>
    `;
    document.body.insertAdjacentHTML('beforeend', editModalHTML);

    // Références du nouveau modal
    const editModal = document.getElementById('historyEditModal');
    const closeEditModalBtn = document.getElementById('closeHistoryEditModal');
    const cancelEditBtn = document.getElementById('cancelHistoryEditBtn');
    const saveChangesBtn = document.getElementById('saveHistoryChangesBtn');
    const addOrUpdatePaymentBtn = document.getElementById('addOrUpdatePaymentBtn');

    // Champs du modal
    const editHistMainDate = document.getElementById('editHistMainDate');
    const editHistRef = document.getElementById('editHistRef');
    const editHistNom = document.getElementById('editHistNom');
    const editHistConteneur = document.getElementById('editHistConteneur');
    const editHistPrix = document.getElementById('editHistPrix');
    const editHistPaymentsBody = document.getElementById('editHistPaymentsBody');
    const editHistPaymentIndex = document.getElementById('editHistPaymentIndex');
    const editHistPayDate = document.getElementById('editHistPayDate');
    const editHistPayParis = document.getElementById('editHistPayParis');
    const editHistPayAbidjan = document.getElementById('editHistPayAbidjan');
    const editHistPayMode = document.getElementById('editHistPayMode');
    const editHistPayInfo = document.getElementById('editHistPayInfo');
    const editHistPayAgent = document.getElementById('editHistPayAgent');

    let unsubscribeHistory = null; 
    let allTransactions = []; 
    let lastVisibleDoc = null; // Pour la pagination
    let unconfirmedSessions = new Set(); // Stocke les IDs de sessions non validées
    const PAGE_SIZE = 50;
    
    let currentEditingTransaction = null; // Pour stocker la transaction en cours d'édition
    let allAgents = []; // Cache pour la liste des agents

    // --- GESTION MODALS ---
    if (closeViewModal) closeViewModal.onclick = () => viewModal.style.display = "none";
    if (closeEditModalBtn) closeEditModalBtn.onclick = () => editModal.style.display = "none";
    if (cancelEditBtn) cancelEditBtn.onclick = () => editModal.style.display = "none";
    window.onclick = (e) => { 
        if (e.target == viewModal) viewModal.style.display = "none"; 
        if (e.target == editModal) editModal.style.display = "none"; 
    };

    // --- GESTION CLICS TABLEAU ---
    tableBody.addEventListener('click', async (event) => {
        const target = event.target;
        const row = target.closest('tr');

        if (target.classList.contains('deleteBtn')) {
            if (await AppModal.confirm("Voulez-vous vraiment supprimer cette transaction ?", "Suppression", true)) {
                transactionsCollection.doc(target.dataset.id).update({ isDeleted: true, deletedBy: currentUserName })
                .then(() => {
                    row.remove(); // Mise à jour visuelle immédiate
                    logAudit("SUPPRESSION", `Transaction ${target.dataset.id} supprimée`, target.dataset.id);
                });
            }
            return;
        }
        if (target.classList.contains('editBtn')) {
            openEditModal(target.dataset.id);
            return;
        }
        if (row && row.dataset.id) {
            const transaction = allTransactions.find(t => t.id === row.dataset.id);
            if (transaction) openViewHistoryModal(transaction);
        }
    });

    function openViewHistoryModal(data) {
        viewModalTitle.textContent = `${data.reference} - ${data.nom || 'Client'}`;
        viewModalList.innerHTML = '';
        if (data.paymentHistory && data.paymentHistory.length > 0) {
            data.paymentHistory.forEach(pay => {
                let amounts = [];
                if(pay.montantParis > 0) amounts.push(`<span style="color:blue">Paris: ${formatCFA(pay.montantParis)}</span>`);
                if(pay.montantAbidjan > 0) amounts.push(`<span style="color:orange">Abidjan: ${formatCFA(pay.montantAbidjan)}</span>`);
                
                const modeBadge = pay.modePaiement ? `<span class="tag" style="background:#6c757d; font-size:10px; margin-right:5px;">${pay.modePaiement}</span>` : '';
                const li = document.createElement('li');
                li.innerHTML = `<span style="font-weight:bold; min-width:90px;">${pay.date}</span><span style="flex-grow:1; margin:0 10px;">${modeBadge} ${amounts.join(' + ')}</span><span style="font-size:0.85em; color:#666">${pay.agent || '-'} (${pay.saisiPar || '?'})</span>`;
                viewModalList.appendChild(li);
            });
        } else {
            viewModalList.innerHTML = `<li style="color:gray; font-style:italic; justify-content:center;">Pas de détails.</li><li style="justify-content: space-around;"><span>Total P: ${formatCFA(data.montantParis)}</span><span>Total A: ${formatCFA(data.montantAbidjan)}</span></li>`;
        }
        viewModal.style.display = "block";
    }

    // --- FONCTION JOURNAL D'AUDIT (SÉCURITÉ) ---
    function logAudit(action, details, docId) {
        db.collection("audit_logs").add({
            date: new Date().toISOString(),
            user: currentUserName,
            action: action,
            details: details,
            targetId: docId || ''
        }).catch(e => console.error("Audit Error:", e));
    }

    // --- CHARGEMENT AGENTS (POUR MODAL) ---
    db.collection("agents").orderBy("name").get().then(snap => {
        allAgents = snap.docs.map(doc => doc.data().name);
        editHistPayAgent.innerHTML = '<option value="">- Aucun -</option>' + allAgents.map(a => `<option value="${a}">${a}</option>`).join('');
    });

    // --- LISTENER SESSIONS NON VALIDÉES ---
    db.collection("audit_logs")
        .where("action", "==", "VALIDATION_JOURNEE")
        .onSnapshot(snapshot => {
            unconfirmedSessions.clear();
            snapshot.forEach(doc => {
                if (doc.data().status !== "VALIDATED") unconfirmedSessions.add(doc.id);
            });
            // Si on a déjà chargé des données, on recharge tout pour avoir les derniers paiements à jour
            if (allTransactions.length > 0) fetchHistory();
        });

    // --- BOUTON CHARGER PLUS (PAGINATION) ---
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    if (loadMoreBtn) {
        loadMoreBtn.onclick = () => fetchHistory(true); // true = load more
    }

    // --- CHARGEMENT OPTIMISÉ ---
    function fetchHistory(isLoadMore = false) {
        // Si c'est un nouveau filtre, on reset tout
        if (!isLoadMore) {
            if (unsubscribeHistory) unsubscribeHistory(); // Stop l'écouteur précédent s'il y en a un
            allTransactions = [];
            lastVisibleDoc = null;
            tableBody.innerHTML = '';
        }
        
        let query = transactionsCollection;

        const isFiltering = startDateInput.value || endDateInput.value || smartSearchInput.value || agentFilterInput.value || showDeletedCheckbox.checked || (showReductionsCheckbox && showReductionsCheckbox.checked);

        if (showDeletedCheckbox.checked) {
             query = transactionsCollection.where("isDeleted", "==", true).orderBy("isDeleted").orderBy("date", "desc");
        } else {
             // Cas normal : Non supprimés
             if (!isFiltering) {
                // PAR DÉFAUT : SEMAINE EN COURS
                const curr = new Date();
                const day = curr.getDay();
                const diff = curr.getDate() - day + (day === 0 ? -6 : 1);
                const monday = new Date(curr.setDate(diff));
                const mondayStr = monday.toISOString().split('T')[0];

                // On filtre par date (Inegalité). On ne peut pas filtrer isDeleted (Inegalité) en même temps.
                // On filtrera les supprimés en JS dans le onSnapshot.
                // CORRECTION : On filtre sur lastPaymentDate pour voir les paiements récents même sur les vieux colis
                // query = query.where("lastPaymentDate", ">=", mondayStr).orderBy("lastPaymentDate", "desc");
                
                // PERFORMANCE & CORRECTION PAGINATION :
                // On filtre les supprimés DÈS LA REQUÊTE pour ne pas charger 50 docs vides si on a fait du nettoyage.
                query = query.where("isDeleted", "!=", true).orderBy("isDeleted").orderBy("date", "desc");
             } else {
                // Si on filtre, on charge tout le "non supprimé" et on filtre en JS
                // OPTIMISATION CRITIQUE : Limiter à 500 pour éviter de saturer Firebase à chaque frappe au clavier
                query = query.where("isDeleted", "!=", true).orderBy("isDeleted").orderBy("date", "desc").limit(500);
             }
        }
        
        // APPLICATION PAGINATION
        if (!isFiltering) {
            query = query.limit(PAGE_SIZE);
            if (isLoadMore && lastVisibleDoc) {
                query = query.startAfter(lastVisibleDoc);
            }
        }

        // Utilisation de .get() au lieu de onSnapshot pour la pagination (Performance)
        query.get().then(snapshot => {
            if (!snapshot.empty) {
                lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];
                if (loadMoreBtn) {
                    loadMoreBtn.style.display = isFiltering ? 'none' : 'block'; // Pas de "Charger plus" si on filtre déjà tout
                }
            } else {
                if (loadMoreBtn) {
                    loadMoreBtn.style.display = 'none';
                }
            }

            const newDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // FILTRAGE JS COMPLÉMENTAIRE (Pour le cas par défaut où on n'a pas pu filtrer isDeleted en base)
            if (!showDeletedCheckbox.checked && !isFiltering) {
                // newDocs = newDocs.filter(d => d.isDeleted !== true); // Déjà géré par la logique d'affichage
            }

            if (isLoadMore) {
                allTransactions = [...allTransactions, ...newDocs];
            } else {
                allTransactions = newDocs;
            }
            applyFiltersAndRender(); 
        }, error => {
            console.error("Erreur Firestore: ", error);
            // Fallback si erreur d'index : on charge tout
            // alert("Erreur d'index. Vérifiez la console.");
        });
    }

    // --- FILTRAGE CLIENT ---
    function applyFiltersAndRender() {
        const searchTerm = smartSearchInput.value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        const agentTerm = agentFilterInput.value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;

        // Si on est en mode "Défaut" (pas de filtres dans les inputs), allTransactions ne contient QUE aujourd'hui.
        // Si on a rempli un input, on relance fetchHistory pour tout charger, PUIS on filtre ici.
        
        const filteredTransactions = allTransactions.filter(data => {
            // 1. Vérification Date (Inclusivité : Création OU Paiement dans la plage)
            let inDateRange = false;
            
            // A. Date Création
            if ((!startDate || data.date >= startDate) && (!endDate || data.date <= endDate)) {
                inDateRange = true;
            }
            
            // B. Historique Paiements
            if (!inDateRange && data.paymentHistory && Array.isArray(data.paymentHistory)) {
                const hasPayment = data.paymentHistory.some(p => {
                    return (!startDate || p.date >= startDate) && (!endDate || p.date <= endDate);
                });
                if (hasPayment) inDateRange = true;
            }

            // C. Dernière Activité (Fallback)
            if (!inDateRange && data.lastPaymentDate) {
                 if ((!startDate || data.lastPaymentDate >= startDate) && (!endDate || data.lastPaymentDate <= endDate)) {
                    inDateRange = true;
                 }
            }

            if (!inDateRange) return false;
            
            if (agentTerm) {
                const agents = (data.agent || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                if (!agents.includes(agentTerm)) return false;
            }

            if (searchTerm) {
                const ref = (data.reference || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const nom = (data.nom || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const conteneur = (data.conteneur || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const description = (data.description || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                
                // Recherche dans les montants (convertis en texte)
                const prixStr = (data.prix || 0).toString();
                const payeAbjStr = (data.montantAbidjan || 0).toString();
                const payeParStr = (data.montantParis || 0).toString();
                
                const isTerminaison = /^d\d+$/.test(searchTerm);
                if (isTerminaison) {
                    if (!ref.endsWith(searchTerm) && !conteneur.includes(searchTerm)) return false;
                } else {
                    if (!ref.includes(searchTerm) && !nom.includes(searchTerm) && !conteneur.includes(searchTerm) && !description.includes(searchTerm) && !prixStr.includes(searchTerm) && !payeAbjStr.includes(searchTerm) && !payeParStr.includes(searchTerm)) return false;
                }
            }

            if (showReductionsCheckbox && showReductionsCheckbox.checked) {
                if (!data.adjustmentType || String(data.adjustmentType).toLowerCase() !== 'reduction') return false;
            }

            return true;
        });

        currentFilteredTransactions = filteredTransactions; // Sauvegarde pour l'action de masse
        
        // Afficher le bouton de correction si on filtre et qu'il y a des résultats
        if ((smartSearchInput.value || agentFilterInput.value) && filteredTransactions.length > 0 && (userRole === 'admin' || userRole === 'super_admin')) {
            batchDateBtn.style.display = "inline-block";
            batchDateBtn.textContent = `📅 Corriger Dates (${filteredTransactions.length})`;
        } else {
            batchDateBtn.style.display = "none";
        }
        
        // NETTOYAGE DES TRANSACTIONS NON CONFIRMÉES
        const cleanTransactions = filteredTransactions.reduce((acc, t) => {
            
            let effectivePrix = t.prix || 0;
            if (t.adjustmentType && String(t.adjustmentType).toLowerCase() === 'reduction') {
                effectivePrix -= (t.adjustmentVal || 0);
            }
            const tBase = { ...t, prix: effectivePrix };

            // FIX : Si on affiche les supprimés, on ne filtre pas (on veut tout voir)
            if (showDeletedCheckbox.checked) {
                if (tBase.deletedBy === currentUserName) {
                    acc.push({ ...tBase, reste: ((tBase.montantParis || 0) + (tBase.montantAbidjan || 0)) - effectivePrix });
                }
                return acc;
            }

            if (!tBase.paymentHistory || !Array.isArray(tBase.paymentHistory) || tBase.paymentHistory.length === 0) {
                // MODIFICATION : On ne garde que les transactions ayant un montant Abidjan > 0 (Legacy)
                // OU montantParis > 0 (Pour afficher aussi les paiements Paris seuls)
                // Les Arrivages non payés (qui ne sont pas dans Confirmation) sont masqués.
                // CAS 1 : PAS D'HISTORIQUE (Legacy ou Arrivages bruts)
                // Si 'saisiPar' existe, c'est une donnée récente (Arrivages) qui n'a pas encore été validée en Caisse -> ON MASQUE
                if (tBase.saisiPar && (tBase.montantParis || 0) === 0) return acc;

                // Si Legacy (pas de saisiPar), on affiche si montant > 0
                if ((tBase.montantAbidjan || 0) > 0 || (tBase.montantParis || 0) > 0) {
                    acc.push({ ...tBase, reste: ((tBase.montantParis || 0) + (tBase.montantAbidjan || 0)) - effectivePrix });
                }
                return acc;
            }
            // On garde seulement les paiements confirmés
            const validPayments = tBase.paymentHistory.filter(p => !p.sessionId || !unconfirmedSessions.has(p.sessionId));

            // Si tout est non confirmé (Nouvelle transaction en attente) -> On masque
            if (validPayments.length === 0 && tBase.paymentHistory.length > 0) return acc;

            // Si partiel (Update en attente) -> On recalcule pour l'affichage
            if (validPayments.length < tBase.paymentHistory.length) {
                const newParis = validPayments.reduce((sum, p) => sum + (p.montantParis || 0), 0);
                const newAbidjan = validPayments.reduce((sum, p) => sum + (p.montantAbidjan || 0), 0);
                const tClean = { ...tBase, paymentHistory: validPayments, montantParis: newParis, montantAbidjan: newAbidjan, reste: (newParis + newAbidjan) - effectivePrix };
                acc.push(tClean);
            } else {
                acc.push({ ...tBase, reste: ((tBase.montantParis || 0) + (tBase.montantAbidjan || 0)) - effectivePrix });
            }
            return acc;
        }, []);

        renderTable(cleanTransactions);
    }

    function getWeekNumber(d) {
        d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    }

    function renderTable(transactions) {
        tableBody.innerHTML = '';

        if (transactions.length === 0) {
            const isFiltering = startDateInput.value || endDateInput.value || smartSearchInput.value || agentFilterInput.value || (showReductionsCheckbox && showReductionsCheckbox.checked);
            tableBody.innerHTML = `<tr><td colspan="13" style="text-align:center; padding: 20px;">${isFiltering ? 'Aucun résultat pour cette recherche.' : 'Aucune donnée chargée.'}</td></tr>`;
            return;
        }

        // Tri principal par date pour le regroupement
        transactions.sort((a, b) => new Date(b.lastPaymentDate || b.date) - new Date(a.lastPaymentDate || a.date));

        const now = new Date();
        // Début de la semaine en cours (Lundi)
        const currentWeekStart = new Date(now);
        const day = currentWeekStart.getDay() || 7;
        if (day !== 1) currentWeekStart.setDate(currentWeekStart.getDate() - day + 1);
        currentWeekStart.setHours(0, 0, 0, 0);

        const currentWeekItems = [];
        const olderItems = [];

        transactions.forEach(t => {
            const tDate = new Date(t.lastPaymentDate || t.date);
            if (tDate >= currentWeekStart) {
                currentWeekItems.push(t);
            } else {
                olderItems.push(t);
            }
        });

        // 1. Affichage Semaine En Cours (Détails directs)
        if (currentWeekItems.length > 0) {
            currentWeekItems.forEach(data => insertDataRow(data));
        }

        // 2. Affichage Anciennes Transactions (Groupées)
        if (olderItems.length > 0) {
            const groups = {};
            
            olderItems.forEach(t => {
                const tDate = new Date(t.lastPaymentDate || t.date);
                const diffTime = now - tDate;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                let key, label;
                const year = tDate.getFullYear();

                // Si < 60 jours -> Par Semaine
                if (diffDays <= 60) {
                    const week = getWeekNumber(tDate);
                    key = `W-${year}-${week}`;
                    label = `Semaine ${week} - ${year}`;
                } else if (diffDays <= 365) {
                    // Sinon < 1 an -> Par Mois
                    const month = tDate.getMonth();
                    key = `M-${year}-${month}`;
                    label = tDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
                    label = label.charAt(0).toUpperCase() + label.slice(1);
                } else {
                    // Sinon -> Par Année
                    key = `Y-${year}`;
                    label = `Année ${year}`;
                }

                if (!groups[key]) {
                    groups[key] = { 
                        label: label, 
                        items: [], 
                        totals: { prix: 0, montantParis: 0, montantAbidjan: 0, reste: 0 },
                        sortDate: tDate // Pour le tri des groupes
                    };
                }
                groups[key].items.push(t);
                
                if (t.isDeleted !== true) {
                    groups[key].totals.prix += (t.prix || 0);
                    groups[key].totals.montantParis += (t.montantParis || 0);
                    groups[key].totals.montantAbidjan += (t.montantAbidjan || 0);
                    groups[key].totals.reste += (t.reste || 0);
                }
            });

            // Tri des groupes (plus récent en haut)
            const sortedGroups = Object.values(groups).sort((a, b) => b.sortDate - a.sortDate);

            sortedGroups.forEach(group => {
                const groupId = 'group-' + Math.random().toString(36).substr(2, 9);

                if (sortByContainerCheckbox && sortByContainerCheckbox.checked) {
                    group.items.sort((a, b) => {
                        const getNum = (str) => {
                            const matches = (str || "").match(/\d+/);
                            return matches ? parseInt(matches[0], 10) : 0;
                        };
                        const cA = getNum(a.conteneur);
                        const cB = getNum(b.conteneur);
                        if (cB !== cA) return cB - cA;
                        const rA = getNum(a.reference);
                        const rB = getNum(b.reference);
                        return rA - rB;
                    });
                }

                const headerRow = document.createElement('tr');
                headerRow.style.cssText = "background-color: #f1f5f9; cursor: pointer; font-weight: bold; border-top: 2px solid #e2e8f0;";
                headerRow.onclick = () => {
                    document.querySelectorAll('.' + groupId).forEach(el => {
                        el.style.display = el.style.display === 'none' ? 'table-row' : 'none';
                    });
                };
                headerRow.innerHTML = `
                    <td colspan="4">📂 <strong>${group.label}</strong> <span style="font-weight:normal; color:#64748b;">(${group.items.length} op.)</span></td>
                    <td></td>
                    <td>${formatCFA(group.totals.prix)}</td>
                    <td>${formatCFA(group.totals.montantParis)}</td>
                    <td>${formatCFA(group.totals.montantAbidjan)}</td>
                    <td></td>
                    <td>${formatCFA(group.totals.reste)}</td>
                    <td colspan="3" style="text-align:center; font-size:0.8em; color:#64748b;">▼ Détails</td>
                `;
                tableBody.appendChild(headerRow);

                group.items.forEach(data => {
                    const dataRow = insertDataRow(data, true);
                    dataRow.classList.add(groupId);
                    dataRow.style.display = 'none';
                    tableBody.appendChild(dataRow);
                });
            });
        }
    }

    // --- ÉVÉNEMENTS DE FILTRE ---
    // Quand on change un filtre, on doit peut-être RECHARGER les données (si on passe de "Aujourd'hui" à "Tout")
    
    function handleFilterChange() {
        // Est-ce qu'on a besoin de charger tout l'historique ?
        const needFullHistory = startDateInput.value || endDateInput.value || smartSearchInput.value || agentFilterInput.value || showDeletedCheckbox.checked;
        
        // Si on a besoin de tout l'historique ET qu'on ne l'a pas encore (allTransactions est petit ou vide, ou contient juste aujourd'hui)
        // Optimisation simple : On relance fetchHistory à chaque changement majeur de mode
        
        fetchHistory(); 
    }

    // On utilise 'change' pour date/select et 'input' avec debounce pour texte si on veut, 
    // mais ici 'change' sur fetchHistory est lourd.
    // Mieux : fetchHistory charge TOUT une fois qu'on commence à filtrer.
    
    let hasLoadedFullHistory = false;

    const triggerFilter = () => {
        const isFiltering = startDateInput.value || endDateInput.value || smartSearchInput.value || agentFilterInput.value || (showReductionsCheckbox && showReductionsCheckbox.checked);
        
        if (isFiltering && !hasLoadedFullHistory) {
            // Premier filtre : on charge tout
            hasLoadedFullHistory = true;
            fetchHistory(); // Va charger tout et appliquer le filtre
        } else {
            // Déjà chargé, on filtre juste localement
            applyFiltersAndRender();
        }
    };

    showDeletedCheckbox.addEventListener('change', () => fetchHistory(false)); // Lui il recharge forcément
    
    if (showReductionsCheckbox) {
        showReductionsCheckbox.addEventListener('change', triggerFilter);
    }

    smartSearchInput.addEventListener('input', triggerFilter);
    agentFilterInput.addEventListener('change', triggerFilter);
    startDateInput.addEventListener('change', triggerFilter);
    endDateInput.addEventListener('change', triggerFilter);
    
    fetchHistory(); // Lancement initial (Aujourd'hui seulement)

    function insertDataRow(data, returnElement = false) {
        const newRow = document.createElement('tr');
        newRow.dataset.id = data.id; 
        newRow.style.cursor = "pointer";
        if (data.isDeleted === true) newRow.classList.add('deleted-row');
        
        const reste_class = (data.reste || 0) < 0 ? 'reste-negatif' : 'reste-positif';
        const agentString = data.agent || "";
        const agents = agentString.split(',').map(a => a.trim()).filter(a => a.length > 0);
        const agentTagsHTML = agents.map(agent => `<span class="tag ${textToClassName(agent)}">${agent}</span>`).join(' '); 
        
        // ==== CORRECTION : CRÉATION DE L'AFFICHAGE AUTEUR ====
        const auteurHTML = data.saisiPar ? `<div class="saisi-par">✍️ ${data.saisiPar}</div>` : '';
        // ====================================================

        let btns = '';
        if ((userRole === 'admin' || userRole === 'super_admin') && data.isDeleted !== true) {
            btns += `<button class="editBtn" data-id="${data.id}" data-prix="${data.prix||0}" data-paris="${data.montantParis||0}" data-abidjan="${data.montantAbidjan||0}" style="background-color:#007bff; margin-right:5px;">Modif.</button>`;
        }
        if ((userRole === 'admin' || userRole === 'super_admin' || userRole === 'saisie_full') && data.isDeleted !== true) {
            btns += `<button class="deleteBtn" data-id="${data.id}">Suppr.</button>`;
        }
        
        const displayDate = data.lastPaymentDate || data.date || 'En attente';

        // LOGIQUE ICONE PAIEMENT (MULTI-MODES)
        let paymentDisplayHTML = '';
        
        const getModeIcon = (m) => {
            if (m === 'Espèce') return '💵';
            if (m === 'Chèque') return '✍️';
            if (m === 'OM') return '🟠';
            if (m === 'Wave') return '🔵';
            if (m === 'Virement') return '🏦';
            return '';
        };

        if (data.paymentHistory && data.paymentHistory.length > 0) {
            const seenModes = new Set();
            data.paymentHistory.forEach(pay => {
                const m = pay.modePaiement || 'Espèce';
                const i = pay.agentMobileMoney || '';
                const key = m + '|' + i;
                
                if (!seenModes.has(key)) {
                    seenModes.add(key);
                    let text = i;
                    if (!text && (m === 'Virement' || m === 'Chèque')) text = m;
                    
                    paymentDisplayHTML += `<div style="margin-bottom:2px; white-space:nowrap;">${getModeIcon(m)} <span class="tag mm-tag ${textToClassName(text)}">${text}</span></div>`;
                }
            });
        } else {
            // Fallback (Anciennes données)
            let mode = data.modePaiement || 'Espèce';
            let info = data.agentMobileMoney || '';
            if (!info && (mode === 'Virement' || mode === 'Chèque')) info = mode;
            
            paymentDisplayHTML = `<div title="${mode}">${getModeIcon(mode)} <span class="tag mm-tag ${textToClassName(info)}">${info}</span></div>`;
        }

        // LOGIQUE MAGASINAGE
        let magasinageDisplay = '-';
        if (data.storageFeeWaived) {
            magasinageDisplay = '<span class="tag" style="background:#10b981; color:white; font-size:0.8em;">Offert</span>';
        } else if (data.adjustmentType === 'augmentation' && data.adjustmentVal > 0) {
            magasinageDisplay = `<span style="color:#d97706; font-weight:bold;">${formatCFA(data.adjustmentVal)}</span>`;
        }

        newRow.innerHTML = `
            <td>${displayDate}</td>
            <td>${data.reference}</td>
            <td>${data.nom || ''}</td>
            <td>${data.conteneur || ''}</td>
            <td>${magasinageDisplay}</td>
            <td>
                ${formatCFA(data.prix)}
                ${data.adjustmentType && String(data.adjustmentType).toLowerCase() === 'reduction' ? `<br><span title="Réduction appliquée" style="color:#10b981; font-size:0.8em; font-weight:bold; background:#d1fae5; padding:2px 4px; border-radius:4px; display:inline-block; margin-top:2px;">⬇️ -${formatCFA(data.adjustmentVal)}</span>` : ''}
            </td>
            <td>${formatCFA(data.montantParis)}</td>
            <td>${formatCFA(data.montantAbidjan)}</td>
            <td>${paymentDisplayHTML}</td>
            <td class="${reste_class}">${formatCFA(data.reste)}</td>
            <td><span class="tag ${textToClassName(data.commune)}">${data.commune || ''}</span></td>
            
            <td>${agentTagsHTML} ${auteurHTML}</td>
            
            <td style="min-width: 100px;">${btns}</td>`;
        
        if (returnElement) {
            return newRow;
        }
        tableBody.appendChild(newRow);
    }

    // --- NOUVELLE LOGIQUE MODAL D'ÉDITION ---

    async function openEditModal(docId) {
        const transaction = allTransactions.find(t => t.id === docId);
        if (!transaction) return AppModal.error("Transaction introuvable.");

        // Copie profonde pour éviter de modifier l'original
        currentEditingTransaction = JSON.parse(JSON.stringify(transaction));

        // Remplir les champs principaux
        document.getElementById('historyEditModalTitle').textContent = `Modifier : ${transaction.reference}`;
        editHistMainDate.value = transaction.date;
        editHistRef.value = transaction.reference;
        editHistNom.value = transaction.nom || '';
        editHistConteneur.value = transaction.conteneur || '';
        editHistPrix.value = transaction.prix || 0;

        renderPaymentHistoryTable();
        resetPaymentForm();
        editModal.style.display = 'block';
    }

    function renderPaymentHistoryTable() {
        editHistPaymentsBody.innerHTML = '';
        if (!currentEditingTransaction || !currentEditingTransaction.paymentHistory) return;

        currentEditingTransaction.paymentHistory.forEach((p, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${p.date}</td>
                <td>${formatCFA(p.montantParis)}</td>
                <td>${formatCFA(p.montantAbidjan)}</td>
                <td>${p.modePaiement || 'Espèce'}</td>
                <td>${p.agent || '-'}</td>
                <td>${p.saisiPar || '?'}</td>
                <td>
                    <button class="btn-small" onclick="window.editHistoryPayment(${index})">✏️</button>
                    <button class="btn-small btn-danger" onclick="window.deleteHistoryPayment(${index})">🗑️</button>
                </td>
            `;
            editHistPaymentsBody.appendChild(tr);
        });
    }

    function resetPaymentForm() {
        editHistPaymentIndex.value = '';
        editHistPayDate.value = new Date().toISOString().split('T')[0];
        editHistPayParis.value = '';
        editHistPayAbidjan.value = '';
        editHistPayMode.value = 'Espèce';
        editHistPayInfo.value = '';
        editHistPayAgent.value = '';
        addOrUpdatePaymentBtn.textContent = "Ajouter ce paiement";
    }

    window.editHistoryPayment = (index) => {
        const payment = currentEditingTransaction.paymentHistory[index];
        editHistPaymentIndex.value = index;
        editHistPayDate.value = payment.date;
        editHistPayParis.value = payment.montantParis || 0;
        editHistPayAbidjan.value = payment.montantAbidjan || 0;
        editHistPayMode.value = payment.modePaiement || 'Espèce';
        editHistPayInfo.value = payment.agentMobileMoney || '';
        editHistPayAgent.value = payment.agent || '';
        addOrUpdatePaymentBtn.textContent = "Mettre à jour ce paiement";
    };

    window.deleteHistoryPayment = async (index) => {
        if (await AppModal.confirm("Supprimer ce paiement de l'historique ?", "Suppression", true)) {
            currentEditingTransaction.paymentHistory.splice(index, 1);
            renderPaymentHistoryTable();
        }
    };

    addOrUpdatePaymentBtn.addEventListener('click', () => {
        const paymentData = {
            date: editHistPayDate.value,
            montantParis: parseFloat(editHistPayParis.value) || 0,
            montantAbidjan: parseFloat(editHistPayAbidjan.value) || 0,
            modePaiement: editHistPayMode.value,
            agentMobileMoney: editHistPayInfo.value.trim(),
            agent: editHistPayAgent.value,
            saisiPar: currentUserName // L'éditeur est le "saisiPar"
        };

        if (!paymentData.date) return AppModal.error("La date du paiement est obligatoire.");

        const index = editHistPaymentIndex.value;
        if (index !== '') {
            // Mise à jour
            const originalPayment = currentEditingTransaction.paymentHistory[index];
            currentEditingTransaction.paymentHistory[index] = { ...originalPayment, ...paymentData };
        } else {
            // Ajout
            currentEditingTransaction.paymentHistory.push(paymentData);
        }
        renderPaymentHistoryTable();
        resetPaymentForm();
    });

    saveChangesBtn.addEventListener('click', async () => {
        if (!currentEditingTransaction) return;
        
        saveChangesBtn.disabled = true;
        saveChangesBtn.textContent = "Enregistrement...";

        try {
            const updates = {
                date: editHistMainDate.value,
                nom: editHistNom.value.trim(),
                conteneur: editHistConteneur.value.trim().toUpperCase(),
                prix: parseFloat(editHistPrix.value) || 0,
                paymentHistory: currentEditingTransaction.paymentHistory
            };

            // Recalculer les totaux et le reste
            updates.montantParis = updates.paymentHistory.reduce((sum, p) => sum + (p.montantParis || 0), 0);
            updates.montantAbidjan = updates.paymentHistory.reduce((sum, p) => sum + (p.montantAbidjan || 0), 0);
            updates.reste = (updates.montantParis + updates.montantAbidjan) - updates.prix;

            // Mettre à jour la date de dernier paiement
            if (updates.paymentHistory.length > 0) {
                updates.paymentHistory.sort((a, b) => new Date(b.date) - new Date(a.date));
                updates.lastPaymentDate = updates.paymentHistory[0].date;
            }

            // RECALCUL DES AGENTS (Mise à jour du champ principal pour l'affichage tableau)
            const uniqueAgents = new Set();
            if (updates.paymentHistory) {
                updates.paymentHistory.forEach(p => {
                    if (p.agent) {
                        p.agent.split(',').forEach(a => {
                            const trimmed = a.trim();
                            if (trimmed) uniqueAgents.add(trimmed);
                        });
                    }
                });
            }
            updates.agent = Array.from(uniqueAgents).join(', ');

            await transactionsCollection.doc(currentEditingTransaction.id).update(updates);

            // --- SYNCHRONISATION AVEC LIVRAISON ---
            try {
                const livQuery = await db.collection("livraisons").where("ref", "==", currentEditingTransaction.reference).limit(1).get();
                if (!livQuery.empty) {
                    await livQuery.docs[0].ref.update({
                        conteneur: updates.conteneur,
                        destinataire: updates.nom
                    });
                }
            } catch (e) { console.error("Erreur sync livraison:", e); }

            logAudit("MODIFICATION_COMPLÈTE", `Transaction ${currentEditingTransaction.reference} modifiée`, currentEditingTransaction.id);

            await AppModal.success("Transaction modifiée avec succès !");
            editModal.style.display = 'none';
            fetchHistory(); // Recharger la table principale

        } catch (error) {
            console.error("Erreur sauvegarde:", error);
            AppModal.error("Une erreur est survenue lors de la sauvegarde.");
        } finally {
            saveChangesBtn.disabled = false;
            saveChangesBtn.textContent = "Enregistrer les modifications";
        }
    });

    // --- LOGIQUE CORRECTION EN MASSE ---
    batchDateBtn.addEventListener('click', async () => {
        if (currentFilteredTransactions.length === 0) return;
        
        const newDate = await AppModal.prompt(`Voulez-vous changer la date de ces ${currentFilteredTransactions.length} transactions ?\n\nEntrez la nouvelle date (AAAA-MM-JJ) :`, "", "Correction Date");
        if (!newDate) return;
        
        // Validation format date simple
        if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) return AppModal.error("Format invalide. Utilisez AAAA-MM-JJ (ex: 2026-03-04)");

        if (!await AppModal.confirm(`⚠️ ATTENTION : Vous allez modifier la date de ${currentFilteredTransactions.length} opérations pour le ${newDate}.\n\nConfirmer ?`, "Action de Masse", true)) return;

        batchDateBtn.disabled = true;
        batchDateBtn.textContent = "Traitement...";

        const batch = db.batch();
        let count = 0;

        currentFilteredTransactions.forEach(t => {
            const ref = transactionsCollection.doc(t.id);
            batch.update(ref, { date: newDate, lastPaymentDate: newDate }); // On met à jour la date principale et le tri
            count++;
        });

        try {
            await batch.commit();
            AppModal.success(`Succès ! ${count} dates mises à jour.`);
            fetchHistory(); // Recharger
        } catch (e) {
            console.error(e);
            AppModal.error("Erreur lors de la mise à jour : " + e.message);
        } finally {
            batchDateBtn.disabled = false;
        }
    });

    initBackToTopButton();
});