import { db } from '../../../commun/firebase-config.js';
import { collection, doc, addDoc, setDoc, updateDoc, query, where, orderBy, onSnapshot, writeBatch, limit } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getShippingMode, filterByShippingMode } from '../../../commun/shipping-mode.js';

export const OtherIncomeView = {
    render(app, container) {
        this.app = app;
        
        container.innerHTML = `
            <div class="dashboard-container">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 10px;"><h2 style="margin: 0; color: #1e293b;">💰 Autres Entrées (Divers)</h2></div>
                <div class="totals-container" style="margin-bottom: 20px;">
                    <div class="total-card" style="cursor: pointer;"><h3>Bénéfice (Achat/Vente)</h3><p id="totalBeneficeAchat" style="color:#10b981;">0 CFA</p></div>
                    <div class="total-card" style="cursor: pointer;"><h3>Vente de Marchandise</h3><p id="totalVenteMarchandise" style="color:#3b82f6;">0 CFA</p></div>
                    <div class="total-card" style="cursor: pointer;"><h3>Autres Entrées</h3><p id="totalAutre" style="color:#f59e0b;">0 CFA</p></div>
                </div>
                <div id="caisseForm" style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 20px;">
                    <h3 style="margin-top: 0; color: #334155;">Ajouter une entrée</h3>
                    <div class="form-grid">
                        <input type="date" id="incomeDate" required>
                        <select id="incomeCategory" required><option value="">-- Catégorie --</option><option value="Bénéfice">Bénéfice</option><option value="Vente">Vente</option><option value="Prestation">Prestation</option><option value="Autre">Autre</option></select>
                        <input type="text" id="incomeDesc" placeholder="Description détaillée" required><input type="number" id="incomeAmount" placeholder="Montant CFA" required>
                        <select id="incomeMode"><option value="Espèce">Espèce</option><option value="Wave">Wave</option><option value="OM">OM</option><option value="Chèque">Chèque</option><option value="Virement">Virement</option></select>
                        <button id="addIncomeBtn" class="btn btn-success">Enregistrer</button>
                    </div>
                </div>
                <div id="pendingIncomeCard" class="card" style="display:none; margin-bottom: 20px; border-left: 4px solid #f59e0b;"><h3 style="margin-top: 0; color: #f59e0b;">Entrées en attente</h3><div style="overflow-x: auto;"><table class="table" style="margin-bottom: 10px;"><thead><tr><th>Date</th><th>Description</th><th>Montant</th><th>Mode</th><th>Action</th></tr></thead><tbody id="pendingIncomeBody"></tbody></table></div><button id="commitIncomeBtn" class="btn btn-success" style="width: 100%;">Tout Enregistrer</button></div>
                <div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                    <div class="history-controls" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <input type="text" id="incomeSearch" placeholder="Rechercher..." style="padding: 8px; border-radius: 4px; border: 1px solid #ccc; min-width: 250px;">
                        <div style="display: flex; align-items: center; gap: 5px;"><input type="checkbox" id="showDeletedCheckbox" style="width: auto; margin: 0;"><label for="showDeletedCheckbox" style="margin: 0; cursor: pointer; font-size: 13px;">Afficher supprimés</label></div>
                    </div>
                    <div class="hide-on-mobile" style="overflow-x: auto;"><table class="table" style="margin-bottom: 0;"><thead><tr><th>Date</th><th>Description</th><th>Montant</th><th>Actions</th></tr></thead><tbody id="incomeTableBody"><tr><td colspan="4" style="text-align:center;">Chargement...</td></tr></tbody></table></div>
                    <div class="show-on-mobile" id="incomeCards"></div>
                </div>
            </div>
        `;
        
        setTimeout(() => this.initLogic(), 50);
    },

    initLogic() {
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'abidjan';
        const userRole = sessionStorage.getItem('userRole');
        const isViewer = userRole === 'spectateur';
        
        const addIncomeBtn = document.getElementById('addIncomeBtn');
        const incomeDate = document.getElementById('incomeDate');
        const incomeCategory = document.getElementById('incomeCategory');
        const incomeDesc = document.getElementById('incomeDesc');
        const incomeAmount = document.getElementById('incomeAmount');
        
        const incomeTableBody = document.getElementById('incomeTableBody');
        const showDeletedCheckbox = document.getElementById('showDeletedCheckbox');
        const incomeSearchInput = document.getElementById('incomeSearch');

        // --- INJECTION FILTRE MOIS (Remplacement des dates) ---
        const tableContainer = document.querySelector('#incomeTableBody')?.closest('table');
        if (tableContainer && tableContainer.parentNode) {
            // Masquer les anciens filtres s'ils existent
            ['statsStartDate', 'statsEndDate'].forEach(id => {
                const el = document.getElementById(id);
                if (el && el.parentElement) el.parentElement.style.display = 'none';
            });

            let incomeStatsControls = document.getElementById('incomeStatsControls');
            if (!incomeStatsControls) {
                incomeStatsControls = document.createElement('div');
                incomeStatsControls.id = 'incomeStatsControls';
                incomeStatsControls.style.cssText = "margin-bottom: 10px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;";
                
                const now = new Date();
                const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

                incomeStatsControls.innerHTML = `
                    <div style="display:flex; align-items:center; gap:5px; background:#fff; padding:5px 10px; border:1px solid #e2e8f0; border-radius:8px; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
                        <span style="font-size:0.9em; font-weight:600; color:#64748b;">📅 Période :</span>
                        <input type="month" id="incomeStatsMonthFilter" value="${defaultMonth}" style="border:none; outline:none; font-family:inherit; color:#334155; background:transparent; cursor:pointer;">
                        <button id="clearIncomeStatsFilter" title="Tout voir" style="margin-left:5px; border:none; background:#f1f5f9; color:#64748b; border-radius:4px; padding:2px 6px; cursor:pointer; font-size:0.8em;">✖</button>
                    </div>
                `;
                tableContainer.parentNode.insertBefore(incomeStatsControls, tableContainer);

                setTimeout(() => {
                    const monthInput = document.getElementById('incomeStatsMonthFilter');
                    const clearBtn = document.getElementById('clearIncomeStatsFilter');
                    if (monthInput) monthInput.addEventListener('change', () => { renderIncomeTable(); updateStats(); });
                    if (clearBtn) clearBtn.addEventListener('click', () => {
                        if(monthInput) monthInput.value = '';
                        renderIncomeTable();
                        updateStats();
                    });
                }, 0);
            }
        }

        // Stats Elements
        const totalBeneficeAchatEl = document.getElementById('totalBeneficeAchat');
        const totalVenteMarchandiseEl = document.getElementById('totalVenteMarchandise');
        const totalAutreEl = document.getElementById('totalAutre');

        // --- NOUVEAU : Helper Catégorie & Filtre ---
        function getIncomeCategory(desc) {
            desc = (desc || '').toLowerCase();
            const kwBenefice = ['bénéfice', 'benefice', 'achat', 'gain', 'profit', 'marge'];
            const kwVente = ['vente', 'marchandise', 'vendue', 'vendu', 'article', 'produit'];

            if (kwBenefice.some(k => desc.includes(k))) return 'Bénéfice';
            if (kwVente.some(k => desc.includes(k))) return 'Vente';
            return 'Autre';
        }

        let currentIncomeCategoryFilter = null;

        // Configuration des clics sur les cartes de totaux
        [
            { el: totalBeneficeAchatEl, cat: 'Bénéfice' },
            { el: totalVenteMarchandiseEl, cat: 'Vente' },
            { el: totalAutreEl, cat: 'Autre' }
        ].forEach(item => {
            if (item.el) {
                const card = item.el.closest('.total-card') || item.el.parentElement;
                if (card) {
                    card.style.cursor = 'pointer';
                    card.onclick = () => {
                        // Bascule le filtre
                        currentIncomeCategoryFilter = currentIncomeCategoryFilter === item.cat ? null : item.cat;
                        renderIncomeTable();
                        
                        // Feedback visuel
                        // Reset tous
                        [totalBeneficeAchatEl, totalVenteMarchandiseEl, totalAutreEl].forEach(e => {
                            const c = e?.closest('.total-card') || e?.parentElement;
                            if(c) { c.style.border = ""; c.style.transform = ""; }
                        });
                        // Active le courant
                        if (currentIncomeCategoryFilter === item.cat) {
                            card.style.border = "2px solid #000";
                            card.style.transform = "scale(1.02)";
                        }
                    };
                }
            }
        });

        let unsubscribeIncome = null;
        let allIncome = [];
        let pendingIncome = []; // Pour les enregistrements multiples
        let currentLimit = 50; // Limite de pagination

        // 1. AJOUT MANUEL (AVEC AUTEUR)
        if (addIncomeBtn && !isViewer) { addIncomeBtn.addEventListener('click', () => {
            // Récupération DYNAMIQUE du nom de l'utilisateur au moment du clic
            const currentUserName = sessionStorage.getItem('userName') || 'Inconnu';

            let finalDesc = incomeDesc.value;
            if (incomeCategory && incomeCategory.value) {
                finalDesc = `${incomeCategory.value} - ${finalDesc}`;
            }

            const data = {
                date: incomeDate.value,
                // AJOUT DU NOM DE L'AUTEUR
                description: `${finalDesc} (${currentUserName})`,
                montant: parseFloat(incomeAmount.value) || 0,
                mode: document.getElementById('incomeMode').value,
                isDeleted: false,
                agency: activeAgency,
                // Tag mode d'expedition (Maritime/Aerien) pour isolation des
                // comptes selon le bouton actif. Anciens docs sans ce champ
                // = maritime (regle legacy de shipping-mode.js).
                modeExpedition: getShippingMode()
            };
            
            if (!data.date || !incomeDesc.value || data.montant <= 0) {
                return AppModal.error("Veuillez remplir la date, la description et un montant valide.");
            }
            
            // --- CONFIGURATION DE L'UTILISATEUR SANS CONFIRMATION ---
            const USER_NO_CONFIRM = "aziz"; // Remplacez par le nom exact de l'utilisateur

            if (currentUserName === USER_NO_CONFIRM) {
                // Enregistrement DIRECT
                const newIncRef = doc(collection(db, "other_income"));
                setDoc(newIncRef, data).then(() => {
                    AppModal.success("Entrée enregistrée (Mode Direct).");
                    resetIncomeForm();
                }).catch(err => AppModal.error("Erreur : " + err.message));
            } else {
                // Ajout à la LISTE D'ATTENTE
                addIncomeToPendingList(data);
            }
        }); } else if (addIncomeBtn) {
            // Masquer le formulaire
            const form = addIncomeBtn.closest('.form-grid') || document.getElementById('caisseForm');
            if (form) form.style.display = 'none';
        }

        // 2. AFFICHAGE & RECHERCHE
        function fetchIncome() {
            if (unsubscribeIncome) unsubscribeIncome();
            let constraints = [];
            
            if (showDeletedCheckbox.checked) {
                constraints.push(where("isDeleted", "==", true), where("agency", "==", activeAgency), orderBy("isDeleted"));
            } else {
                constraints.push(where("isDeleted", "!=", true), where("agency", "==", activeAgency), orderBy("isDeleted"));
            }
            constraints.push(orderBy("date", "desc"));
            constraints.push(limit(currentLimit));

            const q = query(collection(db, "other_income"), ...constraints);
            unsubscribeIncome = onSnapshot(q, snapshot => {
                allIncome = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                renderIncomeTable();
                updateStats(); // Mettre à jour les stats à chaque changement
            }, error => console.error(error));
        }

        function renderIncomeTable() {
            const term = incomeSearchInput ? incomeSearchInput.value.toLowerCase().trim() : "";
            const monthFilter = document.getElementById('incomeStatsMonthFilter')?.value;

            // Isolation Maritime <-> Aerien : on ne garde que les entrees du
            // mode actuellement actif (bouton 🚢/✈️). Anciennes entrees sans
            // modeExpedition = maritime (regle legacy).
            const incomeForMode = filterByShippingMode(allIncome);

            const filtered = incomeForMode.filter(item => {
                if (monthFilter && !item.date.startsWith(monthFilter)) return false;
                
                // Filtre Catégorie
                if (currentIncomeCategoryFilter) {
                    if (getIncomeCategory(item.description) !== currentIncomeCategoryFilter) return false;
                }

                if (!term) return true;
                return (item.description || "").toLowerCase().includes(term);
            });

            // Calcul du total filtré
            const totalFiltered = filtered.reduce((sum, item) => sum + (item.montant || 0), 0);
            
            // Recherche du titre H2 pour afficher le total
            const headers = document.getElementsByTagName('h2');
            for (let h of headers) {
                if (h.textContent.includes("Historique")) {
                    h.innerHTML = `Historique des Autres Entrées <span style="margin-left:15px; font-size:0.8em; font-weight:normal;"><span class="tag" style="background:#fff; border:1px solid #ccc; color:#333;">Total</span> : <b style="color:#2975d7;">${formatCFA(totalFiltered)}</b></span>`;
                    break;
                }
            }

            incomeTableBody.innerHTML = ''; 
            if (filtered.length === 0) {
                incomeTableBody.innerHTML = '<tr><td colspan="4">Aucun résultat.</td></tr>';
                return;
            }
            
            filtered.forEach(income => {
                const row = document.createElement('tr');
                if (income.isDeleted === true) row.classList.add('deleted-row');
                
                // --- AJOUT : Couleur de fond selon la catégorie (Pastel très clair) ---
                if (income.isDeleted !== true) {
                    const desc = (income.description || '').toLowerCase();
                    
                    const kwBenefice = ['bénéfice', 'benefice', 'achat', 'gain', 'profit', 'marge'];
                    const kwVente = ['vente', 'marchandise', 'vendue', 'vendu', 'article', 'produit'];

                    if (kwBenefice.some(k => desc.includes(k))) row.style.backgroundColor = '#ecfdf5'; // Vert très clair
                    else if (kwVente.some(k => desc.includes(k))) row.style.backgroundColor = '#eff6ff'; // Bleu très clair
                    else row.style.backgroundColor = '#f8fafc'; // Gris très clair
                }
                
                let deleteButtonHTML = '';
                // Seul l'admin peut supprimer
                if ((userRole === 'admin' || userRole === 'super_admin') && income.isDeleted !== true && !isViewer) {
                    deleteButtonHTML = `<button class="deleteBtn" data-id="${income.id}">Suppr.</button>`;
                }

                row.innerHTML = `
                    <td>${income.date}</td>
                    <td>${income.description}</td>
                    <td>${formatCFA(income.montant)}</td>
                    <td>${deleteButtonHTML}</td>
                `;
                incomeTableBody.appendChild(row);
            });

            // Fiches compactes (mobile) : Description + Montant / Date + suppr.
            const incomeCards = document.getElementById('incomeCards');
            if (incomeCards) {
                incomeCards.innerHTML = filtered.map(income => {
                    const delBtn = ((userRole === 'admin' || userRole === 'super_admin') && income.isDeleted !== true && !isViewer)
                        ? `<button class="deleteBtn" data-id="${income.id}">Suppr.</button>` : '';
                    return `<div class="comm-mob-card"${income.isDeleted ? ' style="opacity:.55;"' : ''}>
                        <div class="comm-mob-l1"><strong>${income.description || '-'}</strong><span style="font-weight:800; color:#10b981;">${formatCFA(income.montant)}</span></div>
                        <div class="comm-mob-l2"><span>${income.date || '-'}</span>${delBtn}</div>
                    </div>`;
                }).join('');
            }

            // Bouton Charger Plus
            if (filtered.length >= currentLimit || allIncome.length >= currentLimit) {
                const moreRow = document.createElement('tr');
                moreRow.innerHTML = `<td colspan="4" style="text-align: center; padding: 15px;"><button id="loadMoreIncBtn" class="btn" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1;">⬇️ Charger plus de résultats</button></td>`;
                incomeTableBody.appendChild(moreRow);
                document.getElementById('loadMoreIncBtn').addEventListener('click', () => { currentLimit += 50; fetchIncome(); });
            }
        }

        function updateStats() {
            const monthFilter = document.getElementById('incomeStatsMonthFilter')?.value;

            let totalBen = 0;
            let totalVente = 0;
            let totalAutre = 0;

            // Stats Maritime/Aerien aussi dissociees : on ne compte que le
            // mode actuellement actif.
            const incomeForMode = filterByShippingMode(allIncome);

            incomeForMode.forEach(inc => {
                if (inc.isDeleted) return;
                if (monthFilter && !inc.date.startsWith(monthFilter)) return;

                const desc = (inc.description || '').toLowerCase();
                const montant = inc.montant || 0;

                const cat = getIncomeCategory(desc);
                if (cat === 'Bénéfice') totalBen += montant;
                else if (cat === 'Vente') totalVente += montant;
                else totalAutre += montant;
            });

            if(totalBeneficeAchatEl) totalBeneficeAchatEl.textContent = formatCFA(totalBen);
            if(totalVenteMarchandiseEl) totalVenteMarchandiseEl.textContent = formatCFA(totalVente);
            if(totalAutreEl) totalAutreEl.textContent = formatCFA(totalAutre);
        }

        showDeletedCheckbox.addEventListener('change', fetchIncome);
        if(incomeSearchInput) incomeSearchInput.addEventListener('input', renderIncomeTable);
        
        fetchIncome();

        // 3. SUPPRESSION (tableau ordinateur + fiches mobile)
        const handleIncomeDelete = async (event) => {
            if (isViewer) return;
            if (event.target.classList.contains('deleteBtn')) {
                const docId = event.target.getAttribute('data-id');
                if (await AppModal.confirm("Confirmer la suppression ? Elle sera archivée.", "Suppression", true)) {
                    updateDoc(doc(db, "other_income", docId), { isDeleted: true });
                }
            }
        };
        incomeTableBody.addEventListener('click', handleIncomeDelete);
        document.getElementById('incomeCards')?.addEventListener('click', handleIncomeDelete);

        // --- GESTION DES ENREGISTREMENTS MULTIPLES ---

        function resetIncomeForm() {
            // Reset champs
            incomeDesc.value = '';
            if (incomeCategory) incomeCategory.value = '';
            incomeAmount.value = '';
            incomeDesc.focus();
        }

        function addIncomeToPendingList(data) {
            pendingIncome.push(data);
            renderPendingIncome();
            resetIncomeForm();
        }

        function renderPendingIncome() {
            const container = document.getElementById('pendingIncomeCard');
            const tbody = document.getElementById('pendingIncomeBody');
            if (!container || !tbody) return;

            if (pendingIncome.length === 0) {
                container.style.display = 'none';
                return;
            }

            container.style.display = 'block';
            tbody.innerHTML = pendingIncome.map((inc, index) => `
                <tr>
                    <td>${inc.date}</td>
                    <td>${inc.description}</td>
                    <td>${formatCFA(inc.montant)}</td>
                    <td>${inc.mode || '-'}</td>
                    <td><button class="deleteBtn" onclick="removePendingIncome(${index})">X</button></td>
                </tr>
            `).join('');
        }

        window.removePendingIncome = (index) => {
            pendingIncome.splice(index, 1);
            renderPendingIncome();
        };

        const commitBtn = document.getElementById('commitIncomeBtn');
        if (commitBtn) {
            commitBtn.addEventListener('click', async () => {
                if (pendingIncome.length === 0) return;
                if (!await AppModal.confirm(`Enregistrer ${pendingIncome.length} entrée(s) ?`, "Validation Multiple")) return;

                const batch = writeBatch(db);
                pendingIncome.forEach(inc => {
                    const docRef = doc(collection(db, "other_income"));
                    batch.set(docRef, { ...inc, agency: activeAgency });
                });

                try {
                    await batch.commit();
                    pendingIncome = [];
                    renderPendingIncome();
                    AppModal.success("Entrées enregistrées avec succès !");
                } catch (err) {
                    console.error(err);
                    AppModal.error("Erreur lors de l'enregistrement : " + err.message);
                }
            });
        }

        initBackToTopButton();
    }
};