import { db } from '../../../commun/firebase-config.js';
import { collection, doc, setDoc, updateDoc, getDocs, query, where, orderBy, onSnapshot, writeBatch } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getCollectionName } from '../../../commun/agencies-config.js';
import { getShippingMode, filterByShippingMode } from '../../../commun/shipping-mode.js';
import { calculateStorageFee } from '../../../commun/services/storageFee.js';

export const BankView = {
    render(app, container) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.banque = this;

        container.innerHTML = `
            <style>
                .bk-page .total-card { background:#fff; border:1px solid #e7ebf0; border-radius:14px; box-shadow:0 1px 3px rgba(15,23,42,.05); transition:transform .08s, box-shadow .15s; }
                .bk-page .total-card:hover { transform:translateY(-2px); box-shadow:0 6px 16px rgba(15,23,42,.12); }
                .bk-page .total-card h3 { font-size:12px; text-transform:uppercase; letter-spacing:.03em; color:#64748b; font-weight:700; }
                .bk-page .total-card p { font-size:23px; font-weight:800; margin:4px 0 0; }
                .bk-page .bk-sec { background:#fff; border:1px solid #e7ebf0; border-radius:14px; box-shadow:0 1px 3px rgba(15,23,42,.05); padding:20px; margin-bottom:20px; }
                .bk-page .bk-sec h3 { margin-top:0; color:#334155; }
                .bk-page .form-grid input, .bk-page .form-grid select { padding:10px 12px; border:1px solid #d4dbe4; border-radius:9px; font-size:14px; }
                .bk-page .form-grid input:focus, .bk-page .form-grid select:focus { outline:none; border-color:var(--primary-color,#1A3553); box-shadow:0 0 0 3px rgba(26,53,83,.10); }
                .bk-page .table thead th { background:#f8fafc; color:#475569; text-transform:uppercase; font-size:11px; letter-spacing:.04em; font-weight:700; }
                .bk-page .table tbody tr:hover { background:#f8fbff; }
                .bk-head { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:22px; }
                .bk-head h2 { margin:0; color:#0f172a; font-size:22px; font-weight:800; display:flex; align-items:center; gap:12px; }
                .bk-head .bk-ico { width:40px; height:40px; border-radius:11px; background:var(--primary-color,#1A3553); color:#fff; display:inline-flex; align-items:center; justify-content:center; font-size:19px; box-shadow:0 4px 12px rgba(15,23,42,.18); }

                /* Fiches (tablette + pliable + mobile ≤1024px) : les tableaux (5-6
                   colonnes) coupent sur petit écran -> fiches sans libellés. */
                @media (max-width: 1024px) {
                    .bk-page .table thead { display:none; }
                    .bk-page .table, .bk-page .table tbody, .bk-page .table tr { display:block; width:100%; }
                    .bk-page .table tbody tr { box-sizing:border-box; border:1px solid #e8edf3; border-radius:11px; margin-bottom:10px; padding:9px 13px; background:#fff; display:flex; flex-wrap:wrap; align-items:center; gap:6px 12px; box-shadow:0 1px 2px rgba(15,23,42,.04); }
                    .bk-page .table tbody td { box-sizing:border-box; border:none !important; padding:0 !important; width:auto; max-width:100%; font-size:12.5px; color:#475569; white-space:normal !important; overflow-wrap:anywhere; }
                    .bk-page .table tbody td:first-child { width:100%; color:#94a3b8; font-size:11px; }
                }
            </style>
            <div class="dashboard-container bk-page">
                <div class="bk-head"><h2><span class="bk-ico">🏦</span> Gestion de la Banque</h2></div>
                <div class="totals-container" style="margin-bottom: 20px;">
                    <div class="total-card"><h3>Dépôts</h3><p id="totalBankDeposits" style="color:#10b981;">0 CFA</p></div>
                    <div class="total-card"><h3>Retraits / Paiements</h3><p id="totalBankWithdrawals" style="color:#ef4444;">0 CFA</p></div>
                    <div class="total-card" id="card-bank-balance"><h3>Solde Banque Actuel</h3><p id="totalBankBalance">0 CFA</p></div>
                </div>
                <div class="totals-container" style="margin-bottom: 20px;">
                    <div class="total-card" style="cursor: pointer;" onclick="window.filterByBank('BICICI')"><h3>Solde BICICI</h3><p id="totalBicici" style="color:#3b82f6;">0 CFA</p></div>
                    <div class="total-card" style="cursor: pointer;" onclick="window.filterByBank('BRIDGE')"><h3>Solde BRIDGE</h3><p id="totalBridge" style="color:#8b5cf6;">0 CFA</p></div>
                    <div class="total-card" style="cursor: pointer;" onclick="window.filterByBank('ORANGE')"><h3>Solde ORANGE BANK</h3><p id="totalOrange" style="color:#f59e0b;">0 CFA</p></div>
                </div>
                <div id="caisseForm" class="bk-sec">
                    <h3 style="margin-top: 0; color: #334155;">Ajouter un mouvement</h3>
                    <div class="form-grid">
                        <input type="date" id="bankDate" required>
                        <select id="bankName"><option value="BICICI BANK">BICICI BANK</option><option value="BRIDGE BANK">BRIDGE BANK</option><option value="ORANGE BANK">ORANGE BANK</option></select>
                        <input type="text" id="bankDesc" placeholder="Description du mouvement" required><input type="number" id="bankAmount" placeholder="Montant CFA" required>
                        <select id="bankType"><option value="Depot">Dépôt (Entrée)</option><option value="Retrait">Retrait (Sortie)</option></select>
                        <button id="addBankMovementBtn" class="btn btn-success">Enregistrer le Mouvement</button>
                    </div>
                </div>
                <div class="bk-sec" style="border-left: 5px solid #2563eb;">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:14px;">
                        <h3 style="margin:0; color:#334155;">💶 Caisse Euros <span style="font-size:12px; font-weight:600; color:#64748b;">(espèces en €, séparées de la caisse CFA)</span></h3>
                        <div style="text-align:right;">
                            <div style="font-size:12px; color:#64748b;">Solde en caisse €</div>
                            <div id="eurBalance" style="font-size:22px; font-weight:800; color:#2563eb; line-height:1;">0,00 €</div>
                            <div id="eurBalanceCfa" style="font-size:12px; color:#64748b;">≈ 0 CFA</div>
                        </div>
                    </div>
                    <div class="form-grid">
                        <input type="date" id="eurDate">
                        <input type="text" id="eurDesc" placeholder="Description (client, collègue Paris…)">
                        <input type="number" id="eurAmount" step="1" min="0" placeholder="Montant retiré (CFA)">
                        <select id="eurType"><option value="Entree">Entrée (€ reçu)</option><option value="Sortie">Sortie (€ remis / dépensé)</option></select>
                        <button id="addEurMovementBtn" class="btn btn-success">Enregistrer</button>
                    </div>
                    <div style="overflow-x:auto; margin-top:14px;">
                        <table class="table" style="margin-bottom:0;">
                            <thead><tr><th>Date</th><th>Description</th><th>Type</th><th style="text-align:right;">Montant (CFA → €)</th><th style="text-align:center;">Actions</th></tr></thead>
                            <tbody id="eurTableBody"><tr><td colspan="5" style="text-align:center;">Chargement…</td></tr></tbody>
                        </table>
                    </div>
                </div>
                <div class="bk-sec" style="margin-bottom:0;">
                    <div class="history-controls" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <input type="text" id="bankSearch" placeholder="Rechercher (Desc, Banque...)" style="padding: 8px; border-radius: 4px; border: 1px solid #ccc; min-width: 250px;">
                        <div style="display: flex; align-items: center; gap: 5px;"><input type="checkbox" id="showDeletedCheckbox" style="width: auto; margin: 0;"><label for="showDeletedCheckbox" style="margin: 0; cursor: pointer; font-size: 13px;">Afficher supprimés</label></div>
                    </div>
                    <div class="hide-on-mobile" style="overflow-x: auto;">
                        <table class="table" id="bankTable" style="margin-bottom: 0;">
                            <thead><tr><th>Date</th><th>Banque</th><th>Description</th><th>Type</th><th>Montant</th><th>Actions</th></tr></thead>
                            <tbody id="bankTableBody"><tr><td colspan="6" style="text-align:center;">Chargement...</td></tr></tbody>
                        </table>
                    </div>
                    <div class="show-on-mobile" id="bankCards"></div>
                </div>
            </div>
        `;
        
        setTimeout(() => { this.initLogic(); this.initEurCash(); }, 50);
    },

    // --- Caisse Euros : espèces en € (séparées de la caisse CFA). Saisie en €,
    // converti en CFA sur le tableau de bord. Collection isolée 'caisse_euros'
    // filtrée par agence ; n'entre dans AUCUN total CFA. ---
    initEurCash() {
        const agency = sessionStorage.getItem('currentActiveAgency') || 'abidjan';
        const TAUX = 656; // taux maison : 656 CFA = 1 € (saisie en CFA, équivalent € calculé)
        const fmtEur = v => (Number(v) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
        const fmtCfa = v => Math.round(Number(v) || 0).toLocaleString('fr-FR') + ' CFA';

        const dEl = document.getElementById('eurDate');
        if (dEl && !dEl.value) dEl.value = new Date().toISOString().slice(0, 10);

        const addBtn = document.getElementById('addEurMovementBtn');
        if (addBtn) addBtn.onclick = async () => {
            const date = (document.getElementById('eurDate').value || '').trim();
            const description = (document.getElementById('eurDesc').value || '').trim();
            const montantCfa = parseFloat(document.getElementById('eurAmount').value) || 0;
            const montant = montantCfa / TAUX; // équivalent en € (656 CFA = 1 €)
            const type = document.getElementById('eurType').value || 'Entree';
            if (!date || !description || montantCfa <= 0) {
                window.AppModal ? window.AppModal.error('Renseignez la date, la description et un montant CFA valide.') : alert('Champs incomplets.');
                return;
            }
            try {
                await setDoc(doc(collection(db, 'caisse_euros')), {
                    date, description, montantCfa, montant, type, devise: 'EUR',
                    agency, isDeleted: false,
                    createdAt: new Date().toISOString(),
                    saisiPar: sessionStorage.getItem('userName') || ''
                });
                document.getElementById('eurDesc').value = '';
                document.getElementById('eurAmount').value = '';
                window.app.showToast && window.app.showToast('Mouvement € enregistré ✅');
            } catch (e) {
                console.error('Caisse € — ajout:', e);
                window.AppModal ? window.AppModal.error("Enregistrement impossible.") : alert("Enregistrement impossible.");
            }
        };

        if (this._unsubEur) this._unsubEur();
        this._unsubEur = onSnapshot(query(collection(db, 'caisse_euros'), where('agency', '==', agency)), snap => {
            const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }))
                .filter(m => !m.isDeleted)
                .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
            let soldeCfa = 0;
            rows.forEach(m => { const cfa = Number(m.montantCfa) || (Number(m.montant) || 0) * TAUX; soldeCfa += (m.type === 'Sortie' ? -1 : 1) * cfa; });
            const soldeEur = soldeCfa / TAUX;
            const balEl = document.getElementById('eurBalance');
            if (balEl) balEl.textContent = fmtEur(soldeEur);
            const balCfaEl = document.getElementById('eurBalanceCfa');
            if (balCfaEl) balCfaEl.textContent = '≈ ' + fmtCfa(soldeCfa);
            const tb = document.getElementById('eurTableBody');
            if (tb) tb.innerHTML = rows.length ? rows.map(m => {
                const isOut = m.type === 'Sortie';
                const col = isOut ? '#ef4444' : '#10b981';
                const cfa = Number(m.montantCfa) || (Number(m.montant) || 0) * TAUX;
                return `<tr>
                    <td>${m.date || '-'}</td>
                    <td>${m.description || '-'}</td>
                    <td><span style="color:${col}; font-weight:700;">${isOut ? 'Sortie' : 'Entrée'}</span></td>
                    <td style="text-align:right; font-weight:700; color:${col};">${isOut ? '-' : '+'} ${fmtCfa(cfa)} <span style="color:#64748b; font-weight:500; font-size:11px;">(${fmtEur(cfa / TAUX)})</span></td>
                    <td style="text-align:center;"><button title="Supprimer" onclick="window.app.views.banque.deleteEur('${m.id}')" style="background:#fee2e2; color:#b91c1c; border:none; padding:4px 8px; border-radius:5px; cursor:pointer;">🗑️</button></td>
                </tr>`;
            }).join('') : '<tr><td colspan="5" style="text-align:center; color:#94a3b8;">Aucun mouvement € pour le moment.</td></tr>';
        });
    },

    async deleteEur(id) {
        const ok = window.AppModal ? await window.AppModal.confirm('Supprimer ce mouvement € ?', 'Confirmation', true) : confirm('Supprimer ?');
        if (!ok) return;
        try { await updateDoc(doc(db, 'caisse_euros', id), { isDeleted: true }); }
        catch (e) { console.error('Caisse € — suppression:', e); }
    },

    initLogic() {
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'abidjan';

        // SERVICE TRANSACTION (Injecté localement car non chargé via HTML)
        const transactionService = {
            getCleanTransactions(transactions, validatedSessions) {
                return transactions.reduce((acc, t) => {
                    let effectivePrix = t.prix || 0;
                    if (t.adjustmentType && String(t.adjustmentType).toLowerCase() === 'reduction') {
                        effectivePrix -= (t.adjustmentVal || 0);
                    }

                    if (!t.paymentHistory || !Array.isArray(t.paymentHistory) || t.paymentHistory.length === 0) {
                        acc.push({
                            ...t,
                            prix: effectivePrix,
                            reste: ((t.montantParis || 0) + (t.montantAbidjan || 0)) - effectivePrix
                        });
                        return acc;
                    }
                    const validPayments = t.paymentHistory.filter(p => !p.sessionId || validatedSessions.has(p.sessionId));
                    const newParis = validPayments.reduce((sum, p) => sum + (p.montantParis || 0), 0);
                    const newAbidjan = validPayments.reduce((sum, p) => sum + (p.montantAbidjan || 0), 0);
                    const tClean = {
                        ...t,
                        prix: effectivePrix,
                        paymentHistory: validPayments,
                        montantParis: newParis,
                        montantAbidjan: newAbidjan,
                        reste: (newParis + newAbidjan) - effectivePrix
                    };
                    acc.push(tClean);
                    return acc;
                }, []);
            },
            async calculateAvailableBalance(db, unconfirmedSessions) {
                const transSnap = await getDocs(query(collection(db, getCollectionName("transactions")), where("isDeleted", "!=", true)));
                let totalVentes = 0;
                transSnap.forEach(doc => {
                    const d = doc.data();
                    if (d.paymentHistory && d.paymentHistory.length > 0) {
                        d.paymentHistory.forEach(pay => {
                            if (pay.sessionId && unconfirmedSessions.has(pay.sessionId)) return;
                            if (pay.modePaiement !== 'Chèque' && pay.modePaiement !== 'Virement') {
                                totalVentes += (pay.montantAbidjan || 0);
                            }
                        });
                    } else {
                        if (d.modePaiement !== 'Chèque' && d.modePaiement !== 'Virement') {
                            totalVentes += (d.montantAbidjan || 0);
                        }
                    }
                });
                // other_income / bank_movements restent en table de base : on
                // isole Maritime/Aérien par le champ modeExpedition (legacy=maritime).
                const _mode = sessionStorage.getItem('shippingMode') || 'maritime';
                const _matchMode = (d) => ((d && d.modeExpedition === 'aerien') ? 'aerien' : 'maritime') === _mode;
                const incSnap = await getDocs(query(collection(db, "other_income"), where("isDeleted", "!=", true), where("agency", "==", activeAgency)));
                let totalAutres = 0;
                incSnap.forEach(doc => {
                    const d = doc.data();
                    if (!_matchMode(d)) return;
                    if (d.mode !== 'Virement' && d.mode !== 'Chèque') {
                        totalAutres += (d.montant || 0);
                    }
                });
                const expBalCol = getCollectionName("expenses");
                const expBalConstraints = [where("isDeleted", "!=", true)];
                if (expBalCol === "expenses") expBalConstraints.push(where("agency", "==", activeAgency));
                const expSnap = await getDocs(query(collection(db, expBalCol), ...expBalConstraints));
                let totalDepenses = 0;
                expSnap.forEach(doc => {
                    const d = doc.data();
                    if (d.sessionId && unconfirmedSessions.has(d.sessionId)) return;
                    if (d.mode !== 'Virement' && d.mode !== 'Chèque') {
                        totalDepenses += (d.montant || 0);
                    }
                });
                const bankSnap = await getDocs(query(collection(db, "bank_movements"), where("isDeleted", "!=", true), where("agency", "==", activeAgency)));
                let totalRetraits = 0;
                let totalDepots = 0;
                bankSnap.forEach(doc => {
                    const d = doc.data();
                    if (!_matchMode(d)) return;
                    if (d.type === 'Retrait') totalRetraits += (d.montant || 0);
                    if (d.type === 'Depot' && d.source !== 'Remise Chèques' && d.source !== 'Solde Initial') totalDepots += (d.montant || 0);
                });
                return (totalVentes + totalAutres + totalRetraits) - (totalDepenses + totalDepots);
            },
            // Calcul centralisé (source unique : services/storageFee.js).
            calculateStorageFee
        };

        // CORRECTION : On récupère le nom de l'utilisateur connecté
        const currentUserName = sessionStorage.getItem('userName') || 'Inconnu';
        const userRole = sessionStorage.getItem('userRole');
        const isViewer = userRole === 'spectateur';

        const addBankMovementBtn = document.getElementById('addBankMovementBtn');
        const bankDate = document.getElementById('bankDate');
        const bankName = document.getElementById('bankName');
        const bankDesc = document.getElementById('bankDesc');
        const bankAmount = document.getElementById('bankAmount');
        const bankType = document.getElementById('bankType');
        
        const bankTableBody = document.getElementById('bankTableBody');
        const showDeletedCheckbox = document.getElementById('showDeletedCheckbox');
        
        // ÉLÉMENTS IMPORT CSV
        const uploadCsvBtn = document.getElementById('uploadCsvBtn');
        const csvFile = document.getElementById('csvFile');
        const uploadLog = document.getElementById('uploadLog');
        const bankSearchInput = document.getElementById('bankSearch');

        // ÉLÉMENTS TOTAUX
        const totalBankDepositsEl = document.getElementById('totalBankDeposits');
        const totalBankWithdrawalsEl = document.getElementById('totalBankWithdrawals');
        const totalBankBalanceEl = document.getElementById('totalBankBalance');
        const cardBankBalanceEl = document.getElementById('card-bank-balance');
        const totalBiciciEl = document.getElementById('totalBicici');
        const totalBridgeEl = document.getElementById('totalBridge');
        const totalOrangeEl = document.getElementById('totalOrange');

        let unsubscribeBank = null;
        let unsubscribeVirements = null;
        let allBankMovements = [];
        let allVirements = [];
        let allCombinedMovements = [];
        let unconfirmedSessions = new Set(); // Pour filtrer virements et chèques
        let currentLimit = 50;

        // 0. INJECTION DYNAMIQUE DE L'OPTION "PAIEMENT"
        if (bankType && !bankType.querySelector('option[value="Paiement"]')) {
            const opt = document.createElement('option');
            opt.value = "Paiement";
            opt.textContent = "Paiement / Virement (Sortie)";
            // On l'insère après Retrait
            bankType.appendChild(opt);
        }

        // 0b. INJECTION DYNAMIQUE DU CHAMP CONTENEUR (Pour les paiements liés)
        let bankConteneur = document.getElementById('bankConteneur');
        if (!bankConteneur && bankType && bankType.parentNode) {
            bankConteneur = document.createElement('input');
            bankConteneur.id = 'bankConteneur';
            bankConteneur.type = 'text';
            bankConteneur.placeholder = 'Conteneur concerné (Ex: E1)';
            bankConteneur.style.display = 'none'; // Caché par défaut
            bankConteneur.style.marginTop = '5px';
            bankConteneur.style.width = '100%';
            bankConteneur.style.padding = '8px';
            bankConteneur.style.border = '1px solid #ccc';
            bankConteneur.style.borderRadius = '4px';
            
            // Insertion après le sélecteur de type
            bankType.parentNode.insertBefore(bankConteneur, bankType.nextSibling);

            // Affichage conditionnel
            bankType.addEventListener('change', () => {
                bankConteneur.style.display = (bankType.value === 'Paiement') ? 'block' : 'none';
                if (bankType.value !== 'Paiement') bankConteneur.value = '';
            });
        }

        // 1. AJOUT MANUEL
        if (addBankMovementBtn && !isViewer) { addBankMovementBtn.addEventListener('click', async () => {
            const montant = parseFloat(bankAmount.value) || 0;
            const type = bankType.value; 
            const conteneur = bankConteneur ? bankConteneur.value.trim().toUpperCase() : '';

            // DÉTECTION DU SOLDE INITIAL
            const isInitial = bankDesc.value.toLowerCase().includes('initial');

            const data = {
                date: bankDate.value,
                bank: bankName.value,
                // AJOUT DU NOM DE L'AUTEUR
                description: `${bankDesc.value} (${currentUserName})`,
                montant: montant,
                type: type,
                source: isInitial ? 'Solde Initial' : 'Saisie Manuelle',
                isDeleted: false,
                agency: activeAgency,
                // Tag mode d'expedition (Maritime/Aerien). Anciens
                // mouvements sans ce champ = maritime (legacy).
                modeExpedition: getShippingMode()
            };

            if (!data.date || !data.bank || !bankDesc.value || data.montant <= 0) {
                return AppModal.error("Veuillez remplir tous les champs (Banque incluse) avec un montant valide.");
            }

            // Sécurité solde
            if (type === 'Depot' && !isInitial) {
                addBankMovementBtn.disabled = true;
                addBankMovementBtn.textContent = "Vérification...";
                try {
                    const soldeCaisse = await transactionService.calculateAvailableBalance(db, unconfirmedSessions);
                    if (data.montant > soldeCaisse) {
                        AppModal.error(`ERREUR : Solde de caisse insuffisant (${formatCFA(soldeCaisse)}) !`);
                        addBankMovementBtn.disabled = false;
                        addBankMovementBtn.textContent = "Enregistrer le Mouvement";
                        return;
                    }
                } catch (error) {
                    console.error(error);
                }
                addBankMovementBtn.disabled = false;
                addBankMovementBtn.textContent = "Enregistrer le Mouvement";
            }

            const newDocRef = doc(collection(db, "bank_movements"));
            setDoc(newDocRef, data).then(() => {
                // AUTOMATISATION : Si c'est un Paiement lié à un Conteneur, on crée la dépense automatiquement
                if (type === 'Paiement' && conteneur) {
                    const newExpRef = doc(collection(db, getCollectionName("expenses")));
                    setDoc(newExpRef, {
                        date: data.date,
                        description: `${data.description} (Virement Bancaire)`,
                        montant: data.montant,
                        type: 'Conteneur',
                        conteneur: conteneur,
                        mode: 'Virement', // Important : Mode Virement pour ne pas impacter la caisse physique
                        action: 'Depense',
                        isDeleted: false,
                        linkedBankMovementId: newDocRef.id, // Lien pour suppression en cascade
                        agency: activeAgency,
                        // Tag mode d'expedition pour rester aligne avec le
                        // mouvement bancaire source.
                        modeExpedition: getShippingMode()
                    });
                }

                bankDesc.value = '';
                bankAmount.value = '';
                bankName.value = '';
                if(bankConteneur) bankConteneur.value = '';
            }).catch(err => {
                console.error(err);
                if (err.code === 'resource-exhausted') AppModal.error("⚠️ QUOTA ATTEINT : Impossible d'ajouter le mouvement.");
                else AppModal.error("Erreur : " + err.message);
            });
        }); } else if (addBankMovementBtn) {
            // Masquer le formulaire pour le spectateur
            const form = document.getElementById('caisseForm');
            if (form) form.style.display = 'none';
        }

        // 2. IMPORT CSV
        if (uploadCsvBtn && !isViewer) {
            uploadCsvBtn.addEventListener('click', async () => {
                if (!csvFile.files.length) return AppModal.error("Sélectionnez un fichier CSV.");
                
                uploadLog.style.display = 'block';
                uploadLog.textContent = 'Lecture...';

                Papa.parse(csvFile.files[0], {
                    header: true, skipEmptyLines: true,
                    complete: async (results) => {
                        const batch = writeBatch(db);
                        let count = 0;
                        
                        results.data.forEach(row => {
                            const date = row.date?.trim();
                            const desc = row.description?.trim();
                            const type = row.type?.trim(); // "Depot" ou "Retrait"
                            const montant = parseFloat(row.montant);

                            if (date && desc && type && !isNaN(montant)) {
                                const docRef = doc(collection(db, "bank_movements"));
                                batch.set(docRef, {
                                    date, description: desc, type, montant, isDeleted: false, agency: activeAgency
                                });
                                count++;
                            }
                        });

                        if (count > 0) {
                            try {
                                await batch.commit();
                                uploadLog.textContent = `Succès : ${count} mouvements importés.`;
                            } catch (err) {
                                if (err.code === 'resource-exhausted') AppModal.error("⚠️ QUOTA ATTEINT.");
                                else AppModal.error("Erreur : " + err.message);
                            }
                        }
                        csvFile.value = '';
                    }
                });
            });
        } else if (uploadCsvBtn) {
            const container = uploadCsvBtn.closest('.import-section') || uploadCsvBtn.parentElement;
            if (container) container.style.display = 'none';
        }

        // 3. AFFICHAGE & RECHERCHE
        function fetchBankMovements() {
            if (unsubscribeBank) unsubscribeBank();
            if (unsubscribeVirements) unsubscribeVirements();

            let bankConstraints = [];
            
            if (showDeletedCheckbox.checked) {
                bankConstraints.push(where("isDeleted", "==", true), where("agency", "==", activeAgency), orderBy("isDeleted"));
            } else {
                bankConstraints.push(where("isDeleted", "!=", true), where("agency", "==", activeAgency), orderBy("isDeleted"));
            }
            bankConstraints.push(orderBy("date", "desc"));

            const qBank = query(collection(db, "bank_movements"), ...bankConstraints);

            unsubscribeBank = onSnapshot(qBank, snapshot => {
                allBankMovements = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), _source: 'bank' }));
                mergeAndRender();
            }, error => console.error(error));

            // B. Virements depuis Transactions
            const transCol = getCollectionName("transactions");
            let transConstraints = [];
            if (showDeletedCheckbox.checked) {
                 transConstraints.push(where("isDeleted", "==", true));
                 if (transCol === "transactions") transConstraints.push(where("agency", "==", activeAgency));
            } else {
                 transConstraints.push(where("isDeleted", "!=", true));
                 if (transCol === "transactions") transConstraints.push(where("agency", "==", activeAgency));
                 transConstraints.push(orderBy("isDeleted"));
            }
            transConstraints.push(orderBy("date", "desc"));

            const qTrans = query(collection(db, transCol), ...transConstraints);

            unsubscribeVirements = onSnapshot(qTrans, snapshot => {
                const extracted = [];
                snapshot.docs.forEach(doc => {
                    const t = doc.data();
                    
                    if (t.paymentHistory && t.paymentHistory.length > 0) {
                        t.paymentHistory.forEach((pay, idx) => {
                            if (pay.sessionId && unconfirmedSessions.has(pay.sessionId)) return;

                            if (pay.modePaiement === 'Virement' || pay.modePaiement === 'Chèque') {
                                extracted.push({
                                    id: `${doc.id}_${idx}`,
                                    date: pay.date,
                                    description: `${pay.modePaiement.toUpperCase()} REÇU: ${t.reference} - ${t.nom} (${pay.agentMobileMoney || 'N/A'})`,
                                    type: 'Depot',
                                    montant: (pay.montantAbidjan || 0) + (pay.montantParis || 0),
                                    isDeleted: t.isDeleted,
                                    bank: pay.agentMobileMoney, // On récupère la banque ici
                                    _source: 'transaction',
                                    _docId: doc.id
                                });
                            }
                        });
                    } else {
                        if (t.modePaiement === 'Virement' || t.modePaiement === 'Chèque') {
                            extracted.push({
                                id: doc.id,
                                date: t.date,
                                description: `${t.modePaiement.toUpperCase()} REÇU: ${t.reference} - ${t.nom} (${t.agentMobileMoney || 'N/A'})`,
                                type: 'Depot',
                                montant: (t.montantAbidjan || 0) + (t.montantParis || 0),
                                isDeleted: t.isDeleted,
                                bank: t.agentMobileMoney, // On récupère la banque ici
                                _source: 'transaction',
                                _docId: doc.id
                            });
                        }
                    }
                });
                allVirements = extracted;
                mergeAndRender();
            }, error => console.error(error));
        }

        // LISTENER : Sessions non validées
        const qAudit = query(collection(db, "audit_logs"), where("action", "==", "VALIDATION_JOURNEE"), where("agency", "==", activeAgency));
        
        onSnapshot(qAudit, snapshot => {
                unconfirmedSessions.clear();
                snapshot.forEach(doc => {
                    const data = doc.data();
                    if (data.status !== "VALIDATED") {
                        unconfirmedSessions.add(doc.id); // Utilisation de l'ID de session
                    }
                });
                fetchBankMovements(); // Recharger les virements/totaux
            });

        function mergeAndRender() {
            allCombinedMovements = [...allBankMovements, ...allVirements];
            allCombinedMovements.sort((a, b) => new Date(b.date) - new Date(a.date));
            updateBankTotals();
            renderBankTable();
        }

        function updateBankTotals() {
            let totalDepots = 0;
            let totalRetraits = 0;
            let soldeBicici = 0;
            let soldeBridge = 0;
            let soldeOrange = 0;

            // Totaux Maritime/Aerien dissocies (regle legacy : sans champ
            // modeExpedition = maritime).
            const forMode = filterByShippingMode(allCombinedMovements);
            forMode.forEach(m => {
                const montant = m.montant || 0;
                const bankName = (m.bank || "").toUpperCase();
                let impact = 0;

                if (m.type === 'Depot') {
                    totalDepots += montant;
                    impact = montant;
                } else if (m.type === 'Retrait' || m.type === 'Paiement') {
                    totalRetraits += montant;
                    impact = -montant;
                }

                // Ventilation par banque
                if (bankName.includes("BICICI")) soldeBicici += impact;
                else if (bankName.includes("BRIDGE")) soldeBridge += impact;
                else if (bankName.includes("ORANGE")) soldeOrange += impact;
            });

            const balance = totalDepots - totalRetraits;

            if (totalBankDepositsEl) totalBankDepositsEl.textContent = formatCFA(totalDepots);
            if (totalBankWithdrawalsEl) totalBankWithdrawalsEl.textContent = formatCFA(totalRetraits);
            if (totalBankBalanceEl) {
                totalBankBalanceEl.textContent = formatCFA(balance);
                if (cardBankBalanceEl) {
                    cardBankBalanceEl.className = 'total-card ' + (balance >= 0 ? 'card-positif' : 'card-negatif');
                }
            }

            if (totalBiciciEl) totalBiciciEl.textContent = formatCFA(soldeBicici);
            if (totalBridgeEl) totalBridgeEl.textContent = formatCFA(soldeBridge);
            if (totalOrangeEl) totalOrangeEl.textContent = formatCFA(soldeOrange);
        }

        // Fonction globale pour filtrer au clic sur les cartes
        window.filterByBank = function(bankName) {
            if (bankSearchInput) {
                bankSearchInput.value = bankName;
                renderBankTable();
                // Défilement fluide jusqu'au tableau pour montrer le résultat
                document.getElementById('bankTable')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        };

        function renderBankTable() {
            const term = bankSearchInput ? bankSearchInput.value.toLowerCase().trim() : "";
            // Isolation Maritime <-> Aerien. Anciens mouvements sans
            // modeExpedition = maritime (regle legacy).
            const forMode = filterByShippingMode(allCombinedMovements);
            const filtered = forMode.filter(item => {
                if (!term) return true;
                return (item.description || "").toLowerCase().includes(term) ||
                       (item.type || "").toLowerCase().includes(term) ||
                       (item.bank || "").toLowerCase().includes(term);
            });

            bankTableBody.innerHTML = '';
            const bankCards = document.getElementById('bankCards');
            if (filtered.length === 0) {
                bankTableBody.innerHTML = '<tr><td colspan="5">Aucun résultat.</td></tr>';
                if (bankCards) bankCards.innerHTML = '<div style="text-align:center; padding:16px; color:#94a3b8;">Aucun résultat.</div>';
                return;
            }
            const toShow = filtered.slice(0, currentLimit);
            if (bankCards) {
                bankCards.innerHTML = toShow.map(move => {
                    const neg = (move.type === 'Depot' && move.source === 'Saisie Manuelle') || move.type === 'Paiement';
                    const cls = neg ? 'reste-negatif' : 'reste-positif';
                    const sgn = neg ? '-' : '+';
                    const del = (move.isDeleted !== true && !isViewer)
                        ? (move._source === 'transaction' ? '<span style="font-size:11px; color:#94a3b8;">Via Historique</span>' : `<button class="deleteBtn" data-id="${move.id}">Suppr.</button>`)
                        : '';
                    return `<div class="comm-mob-card"${move.isDeleted ? ' style="opacity:.55;"' : ''}>
                        <div class="comm-mob-l1"><strong>${move.description || '-'}</strong><span class="${cls}" style="font-weight:800; white-space:nowrap;">${sgn} ${formatCFA(move.montant)}</span></div>
                        <div class="comm-mob-l2"><span>${move.date || '-'}</span><span class="tag" style="background:#e2e8f0; color:#334155;">${move.bank || '-'}</span><span>${move.type}</span></div>
                        ${del ? `<div style="display:flex; justify-content:flex-end; border-top:1px solid #f1f5f9; padding-top:6px; margin-top:4px;">${del}</div>` : ''}
                    </div>`;
                }).join('');
            }
            toShow.forEach(move => {
                const row = document.createElement('tr');
                if (move.isDeleted === true) row.classList.add('deleted-row');
                
                if (move._source === 'transaction') {
                    row.style.backgroundColor = '#f3e8ff';
                }
                
                let deleteButtonHTML = '';
                if (move.isDeleted !== true && !isViewer) {
                    if (move._source === 'transaction') {
                        deleteButtonHTML = `<span style="font-size:0.8em; color:#666;">Via Historique</span>`;
                    } else {
                        deleteButtonHTML = `<button class="deleteBtn" data-id="${move.id}">Suppr.</button>`;
                    }
                }

                // Logique d'affichage améliorée : un dépôt n'est "négatif" (sortie de caisse)
                // que s'il s'agit d'une saisie manuelle.
                // Un Paiement est aussi négatif (Sortie Banque)
                const isNegativeDisplay = (move.type === 'Depot' && move.source === 'Saisie Manuelle') || move.type === 'Paiement';
                const amountClass = isNegativeDisplay ? 'reste-negatif' : 'reste-positif';
                const sign = isNegativeDisplay ? '-' : '+';

                row.innerHTML = `
                    <td>${move.date}</td>
                    <td><span class="tag" style="background-color:#e2e8f0; color:#334155;">${move.bank || '-'}</span></td>
                    <td>${move.description}</td>
                    <td>${move.type}</td>
                    <td class="${amountClass}">
                        ${sign} ${formatCFA(move.montant)}
                    </td>
                    <td>${deleteButtonHTML}</td>
                `;
                bankTableBody.appendChild(row);
            });

            // Bouton Charger Plus
            if (filtered.length > currentLimit) {
                const moreRow = document.createElement('tr');
                moreRow.innerHTML = `<td colspan="6" style="text-align: center; padding: 15px;"><button id="loadMoreBankBtn" class="btn" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1;">⬇️ Charger plus de résultats</button></td>`;
                bankTableBody.appendChild(moreRow);
                document.getElementById('loadMoreBankBtn').addEventListener('click', () => { currentLimit += 50; renderBankTable(); });
            }
        }
        
        showDeletedCheckbox.addEventListener('change', fetchBankMovements);
        if(bankSearchInput) bankSearchInput.addEventListener('input', renderBankTable);
        fetchBankMovements();

        // 4. SUPPRESSION (tableau ordinateur + fiches mobile)
        const handleBankDelete = async (event) => {
            if (isViewer) return;
            if (event.target.classList.contains('deleteBtn')) {
                const docId = event.target.getAttribute('data-id');
                if (!await AppModal.confirm("Confirmer la suppression ? Elle sera archivée.", "Suppression", true)) return;

                // SUPPRESSION EN CASCADE : Si une dépense est liée à ce mouvement, on la supprime aussi
                const expensesQ = query(collection(db, getCollectionName("expenses")), where("linkedBankMovementId", "==", docId));
                getDocs(expensesQ).then(snap => {
                    snap.forEach(d => updateDoc(d.ref, { isDeleted: true }));
                });

                updateDoc(doc(db, "bank_movements", docId), { isDeleted: true });
            }
        };
        bankTableBody.addEventListener('click', handleBankDelete);
        document.getElementById('bankCards')?.addEventListener('click', handleBankDelete);

        if(typeof initBackToTopButton === 'function') initBackToTopButton();
    }
};