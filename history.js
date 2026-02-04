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

    const modal = document.getElementById('paymentHistoryModal');
    const modalList = document.getElementById('paymentHistoryList');
    const modalTitle = document.getElementById('modalRefTitle');
    const closeModal = document.querySelector('.close-modal'); 

    let unsubscribeHistory = null; 
    let allTransactions = []; 
    let lastVisibleDoc = null; // Pour la pagination
    const PAGE_SIZE = 50;

    if (closeModal) closeModal.onclick = () => modal.style.display = "none";
    window.onclick = (e) => { if (e.target == modal) modal.style.display = "none"; };

    // --- GESTION CLICS TABLEAU ---
    tableBody.addEventListener('click', (event) => {
        const target = event.target;
        const row = target.closest('tr');

        if (target.classList.contains('deleteBtn')) {
            if (confirm("Supprimer ?")) {
                transactionsCollection.doc(target.dataset.id).update({ isDeleted: true })
                .then(() => {
                    row.remove(); // Mise à jour visuelle immédiate
                    logAudit("SUPPRESSION", `Transaction ${target.dataset.id} supprimée`, target.dataset.id);
                });
            }
            return;
        }
        if (target.classList.contains('editBtn')) {
            const oldPrice = parseFloat(target.dataset.prix);
            const newPriceStr = prompt("Nouveau PRIX :", oldPrice);
            if (newPriceStr === null) return;
            const newPrice = parseFloat(newPriceStr);
            if (isNaN(newPrice) || newPrice <= 0) return alert("Prix invalide.");
            
            const paris = parseFloat(target.dataset.paris);
            const abidjan = parseFloat(target.dataset.abidjan);
            const newReste = (paris + abidjan) - newPrice;

            transactionsCollection.doc(target.dataset.id).update({ prix: newPrice, reste: newReste })
                .then(() => {
                    alert("Modifié !");
                    // Mise à jour visuelle immédiate
                    target.dataset.prix = newPrice;
                    row.children[4].textContent = formatCFA(newPrice);
                    row.children[8].textContent = formatCFA(newReste);
                    row.children[8].className = newReste < 0 ? 'reste-negatif' : 'reste-positif';
                    logAudit("MODIFICATION", `Prix modifié de ${oldPrice} à ${newPrice}`, target.dataset.id);
                }).catch(() => alert("Erreur."));
            return;
        }
        if (row && row.dataset.id) {
            const transaction = allTransactions.find(t => t.id === row.dataset.id);
            if (transaction) openPaymentModal(transaction);
        }
    });

    function openPaymentModal(data) {
        modalTitle.textContent = `${data.reference} - ${data.nom || 'Client'}`;
        modalList.innerHTML = '';
        if (data.paymentHistory && data.paymentHistory.length > 0) {
            data.paymentHistory.forEach(pay => {
                let amounts = [];
                if(pay.montantParis > 0) amounts.push(`<span style="color:blue">Paris: ${formatCFA(pay.montantParis)}</span>`);
                if(pay.montantAbidjan > 0) amounts.push(`<span style="color:orange">Abidjan: ${formatCFA(pay.montantAbidjan)}</span>`);
                
                const modeBadge = pay.modePaiement ? `<span class="tag" style="background:#6c757d; font-size:10px; margin-right:5px;">${pay.modePaiement}</span>` : '';
                const li = document.createElement('li');
                li.innerHTML = `<span style="font-weight:bold; min-width:90px;">${pay.date}</span><span style="flex-grow:1; margin:0 10px;">${modeBadge} ${amounts.join(' + ')}</span><span style="font-size:0.85em; color:#666">${pay.agent || '-'}</span>`;
                modalList.appendChild(li);
            });
        } else {
            modalList.innerHTML = `<li style="color:gray; font-style:italic; justify-content:center;">Pas de détails.</li><li style="justify-content: space-around;"><span>Total P: ${formatCFA(data.montantParis)}</span><span>Total A: ${formatCFA(data.montantAbidjan)}</span></li>`;
        }
        modal.style.display = "block";
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

        const isFiltering = startDateInput.value || endDateInput.value || smartSearchInput.value || agentFilterInput.value;

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
                query = query.where("isDeleted", "!=", true).orderBy("isDeleted").orderBy("date", "desc");
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
                
                const isTerminaison = /^d\d+$/.test(searchTerm);
                if (isTerminaison) {
                    if (!ref.endsWith(searchTerm) && !conteneur.includes(searchTerm)) return false;
                } else {
                    if (!ref.includes(searchTerm) && !nom.includes(searchTerm) && !conteneur.includes(searchTerm)) return false;
                }
            }
            return true;
        });
        
        renderTable(filteredTransactions);
    }

    function renderTable(transactions) {
        // tableBody.innerHTML = ''; // On ne vide pas si on ajoute, mais ici applyFiltersAndRender redessine tout le tableau filtré
        tableBody.innerHTML = '';

        if (transactions.length === 0) {
            // Message différent selon le contexte
            const isFiltering = startDateInput.value || endDateInput.value || smartSearchInput.value || agentFilterInput.value;
            if (!isFiltering) {
                tableBody.innerHTML = '<tr><td colspan="12" style="text-align:center; padding: 20px;">Aucune donnée chargée.</td></tr>';
            } else {
                tableBody.innerHTML = '<tr><td colspan="12">Aucun résultat pour cette recherche.</td></tr>';
            }
            return;
        }
        
        // Tri JS pour être sûr (si le tri Firestore a sauté)
        transactions.sort((a, b) => {
            const dateA = a.lastPaymentDate || a.date;
            const dateB = b.lastPaymentDate || b.date;
            return new Date(dateB) - new Date(dateA);
        });

        let currentSubtotals = { prix: 0, montantParis: 0, montantAbidjan: 0, reste: 0 };
        let currentDate = transactions[0] ? (transactions[0].lastPaymentDate || transactions[0].date) : null; 
        
        transactions.forEach((data) => {
            const displayDate = data.lastPaymentDate || data.date;
            if (displayDate !== currentDate && displayDate) {
                insertSubtotalRow(currentDate, currentSubtotals);
                currentDate = displayDate;
                currentSubtotals = { prix: 0, montantParis: 0, montantAbidjan: 0, reste: 0 };
            }
            if (data.isDeleted !== true) {
                currentSubtotals.prix += (data.prix || 0);
                currentSubtotals.montantParis += (data.montantParis || 0);
                currentSubtotals.montantAbidjan += (data.montantAbidjan || 0);
                currentSubtotals.reste += (data.reste || 0);
            }
            insertDataRow(data);
        });
        insertSubtotalRow(currentDate, currentSubtotals);
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
        const isFiltering = startDateInput.value || endDateInput.value || smartSearchInput.value || agentFilterInput.value;
        
        if (isFiltering && !hasLoadedFullHistory) {
            // Premier filtre : on charge tout
            hasLoadedFullHistory = true;
            fetchHistory(); // Va charger tout et appliquer le filtre
        } else {
            // Déjà chargé, on filtre juste localement
            applyFiltersAndRender();
        }
    };

    showDeletedCheckbox.addEventListener('change', fetchHistory); // Lui il recharge forcément
    
    smartSearchInput.addEventListener('input', triggerFilter);
    agentFilterInput.addEventListener('change', triggerFilter);
    startDateInput.addEventListener('change', triggerFilter);
    endDateInput.addEventListener('change', triggerFilter);
    
    fetchHistory(); // Lancement initial (Aujourd'hui seulement)

    function insertDataRow(data) {
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

        newRow.innerHTML = `
            <td>${displayDate}</td>
            <td>${data.reference}</td>
            <td>${data.nom || ''}</td>
            <td>${data.conteneur || ''}</td>
            <td>${formatCFA(data.prix)}</td>
            <td>${formatCFA(data.montantParis)}</td>
            <td>${formatCFA(data.montantAbidjan)}</td>
            <td>${paymentDisplayHTML}</td>
            <td class="${reste_class}">${formatCFA(data.reste)}</td>
            <td><span class="tag ${textToClassName(data.commune)}">${data.commune || ''}</span></td>
            
            <td>${agentTagsHTML} ${auteurHTML}</td>
            
            <td style="min-width: 100px;">${btns}</td>`;
        tableBody.appendChild(newRow);
    }

    function insertSubtotalRow(date, totals) {
        const subtotalRow = document.createElement('tr'); 
        subtotalRow.className = 'subtotal-row';
        subtotalRow.innerHTML = `
            <td>${date || 'TOTAL'}</td>
            <td colspan="3" style="text-align: right;">TOTAL</td> 
            <td>${formatCFA(totals.prix)}</td>
            <td>${formatCFA(totals.montantParis)}</td>
            <td>${formatCFA(totals.montantAbidjan)}</td>
            <td></td>
            <td>${formatCFA(totals.reste)}</td>
            <td colspan="3"></td>`;
        tableBody.appendChild(subtotalRow);
    }
    function formatCFA(n) { return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(n || 0); }
    function textToClassName(t) { return t ? t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-') : ''; }
});