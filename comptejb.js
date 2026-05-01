import { db } from './firebase-config.js'; 
import {
    collection, addDoc, getDocs, serverTimestamp,
    query, orderBy, onSnapshot, where,
    doc, setDoc, getDoc
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {

    // =========================================================
    // 1. NAVIGATION ENTRE LES ONGLETS
    // =========================================================
    const navBtns = document.querySelectorAll('.nav-btn');
    const views   = document.querySelectorAll('.view');

    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (!btn.dataset.view) return;
            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            views.forEach(v => v.classList.remove('active'));
            const target = document.getElementById(`view-${btn.dataset.view}`);
            if (target) target.classList.add('active');
        });
    });

    // =========================================================
    // 2. UTILITAIRES
    // =========================================================
    const fmt = (val) =>
        new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(val || 0);

    const parseNum = (s) =>
        parseFloat(String(s).replace(/\s/g, '').replace(',', '.')) || 0;

    /** Map canal → couleur CSS variable */
    const CANAL_META = {
        'OM':        { label: 'OM',        cls: 'om',       color: '#f59e0b' },
        'WAVE':      { label: 'WAVE',      cls: 'wave',     color: '#3498db'     },
        'Espèce':    { label: 'Espèce',    cls: 'espece',   color: 'var(--green)'},
        'Virement':  { label: 'Virement',  cls: 'virement', color: '#7c5cbf'     },
    };

    // =========================================================
    // 2.5 SAISIE INTELLIGENTE (AUTO-COMPLÉTION & AUTO-FILL)
    // =========================================================
    let transactionsCache = [];
    let expensesCache = [];
    
    // Stockage en mémoire des opérations saisies
    let periodCredits = [];
    let periodDebits = [];

    // --- SOLDES INITIAUX DANS FIRESTORE ---
    let initBalances = { OM: 0, WAVE: 0, Espèce: 0, Virement: 0 };

    async function loadInitBalances() {
        try {
            const snap = await getDoc(doc(db, "jb_settings", "balances"));
            if (snap.exists()) {
                const data = snap.data();
                initBalances.OM = data.OM || 0;
                initBalances.WAVE = data.WAVE || 0;
                initBalances.Espèce = data.Espèce || 0;
                initBalances.Virement = data.Virement || 0;
                
                const elOM = document.getElementById('init-om'); if (elOM) elOM.value = initBalances.OM;
                const elWave = document.getElementById('init-wave'); if (elWave) elWave.value = initBalances.WAVE;
                const elEsp = document.getElementById('init-espece'); if (elEsp) elEsp.value = initBalances.Espèce;
                const elVir = document.getElementById('init-virement'); if (elVir) elVir.value = initBalances.Virement;
                
                calcTotals();
            }
        } catch(e) { console.error("Erreur load init balances:", e); }
    }

    // --- BROUILLON DANS FIRESTORE ---
    let draftDocRef = null;
    let draftTimeout = null;

    function initDraftRef() {
        const userName = sessionStorage.getItem('userName') || 'default';
        draftDocRef = doc(db, 'jb_drafts', 'draft_' + userName.replace(/\s+/g, '_'));
    }

    async function loadDraft() {
        if (!draftDocRef) initDraftRef();
        try {
            const snap = await getDoc(draftDocRef);
            if (snap.exists()) {
                const data = snap.data();
                if (data.periodCredits && data.periodCredits.length > 0) periodCredits = data.periodCredits;
                if (data.periodDebits && data.periodDebits.length > 0) periodDebits = data.periodDebits;
                
                if (data.date) {
                    const dInput = document.getElementById('f-date');
                    if (dInput) dInput.value = data.date;
                }
                
                if (data.billetValues) {
                    const bGrid = document.getElementById('billet-grid');
                    if (bGrid) {
                        bGrid.querySelectorAll('input[data-val]').forEach(input => {
                            if (data.billetValues[input.dataset.val]) {
                                input.value = data.billetValues[input.dataset.val];
                            }
                        });
                    }
                }
                calcTotals();
            }
        } catch(e) { console.error("Erreur chargement brouillon:", e); }
    }

    function saveDraft() {
        clearTimeout(draftTimeout);
        draftTimeout = setTimeout(async () => {
            if (!draftDocRef) initDraftRef();
            try {
                const billetValues = {};
                const bGrid = document.getElementById('billet-grid');
                if (bGrid) {
                    bGrid.querySelectorAll('input[data-val]').forEach(input => {
                        if (input.value) billetValues[input.dataset.val] = input.value;
                    });
                }
                await setDoc(draftDocRef, {
                    periodCredits,
                    periodDebits,
                    date: document.getElementById('f-date')?.value || new Date().toISOString().split('T')[0],
                    billetValues,
                    updatedAt: serverTimestamp()
                });
            } catch(e) { console.error("Erreur sauvegarde brouillon:", e); }
        }, 1000);
    }

    async function clearDraft() {
        if (!draftDocRef) initDraftRef();
        try {
            await setDoc(draftDocRef, { periodCredits: [], periodDebits: [], date: '', billetValues: {} });
        } catch(e) {}
    }

    function populateDatalists() {
        // Liste des Crédits (Transactions Caisse)
        const qTrans = query(collection(db, "transactions"), where("isDeleted", "!=", true));
        onSnapshot(qTrans, (snap) => {
            const creditList = document.getElementById('jb-credit-list');
            transactionsCache = [];
            const uniqueRefs = new Set();
            snap.forEach(doc => {
                const data = doc.data();
                transactionsCache.push(data);
                if (data.reference) uniqueRefs.add(data.reference);
                if (data.nom) uniqueRefs.add(data.nom);
            });
            if (creditList) {
                creditList.innerHTML = '';
                uniqueRefs.forEach(ref => { creditList.appendChild(new Option(ref)); });
            }
        });

        // Liste des Débits (Dépenses Caisse)
        const qExp = query(collection(db, "expenses"), where("isDeleted", "!=", true));
        onSnapshot(qExp, (snap) => {
            const debitList = document.getElementById('jb-debit-list');
            expensesCache = [];
            const uniqueDesc = new Set();
            snap.forEach(doc => {
                const data = doc.data();
                expensesCache.push(data);
                if (data.description) uniqueDesc.add(data.description);
            });
            if (debitList) {
                debitList.innerHTML = '';
                uniqueDesc.forEach(desc => { debitList.appendChild(new Option(desc)); });
            }
        });
    }
    populateDatalists();

    // =========================================================
    // 3. LIGNES DYNAMIQUES — CRÉDIT
    //    Architecture inspirée de index.html :
    //    1 montant + 1 sélecteur canal (OM/WAVE/Espèce/Virement)
    // =========================================================
    const creditsList = document.getElementById('credits-list');
    const debitsList  = document.getElementById('debits-list');
    const btnAddCredit = document.getElementById('btn-add-credit');
    const btnAddDebit  = document.getElementById('btn-add-debit');

    /**
     * Crée une ligne de crédit : date | libellé | montant | canal
     */
    function addCreditRow(data = {}) {
        if (!creditsList) return;
        const defaultDate = document.getElementById('f-date')?.value
                         || new Date().toISOString().split('T')[0];
        const row = document.createElement('div');
        row.className = 'entry-row';
        row.innerHTML = `
            <input  type="date"   class="c-date"    value="${data.date    || defaultDate}"    style="flex:0.75;" />
            <input  type="text"   class="c-desc"    placeholder="Réf / Libellé" list="jb-credit-list"
                    value="${data.desc || ''}"       style="flex:1.8;" />
            <input  type="number" class="c-montant" placeholder="Montant"
                    value="${data.montant || ''}"    style="flex:1;" min="0" />
            <select class="c-canal" style="flex:0.8;">
                <option value="Espèce"   ${(data.canal||'Espèce') ==='Espèce'   ?'selected':''}>Espèce</option>
                <option value="OM"       ${data.canal==='OM'       ?'selected':''}>Orange Money</option>
                <option value="WAVE"     ${data.canal==='WAVE'     ?'selected':''}>Wave</option>
                <option value="Virement" ${data.canal==='Virement' ?'selected':''}>Virement / Chèque</option>
            </select>
            <button class="btn-del" title="Supprimer">✕</button>`;

        row.querySelector('.btn-del').addEventListener('click', () => { row.remove(); });
        
        // Auto-fill Montant sur sélection de la Réf
        const descInput = row.querySelector('.c-desc');
        const montantInput = row.querySelector('.c-montant');
        descInput.addEventListener('input', (e) => {
            const val = e.target.value.trim().toUpperCase();
            const matched = transactionsCache.find(t => 
                (t.reference || '').toUpperCase() === val || (t.nom || '').toUpperCase() === val
            );
            if (matched && !montantInput.value) {
                montantInput.value = (matched.reste && matched.reste < 0) ? Math.abs(matched.reste) : (matched.prix || 0);
            }
        });

        creditsList.appendChild(row);
    }

    /**
     * Crée une ligne de débit : date | libellé | montant
     */
    function addDebitRow(data = {}) {
        if (!debitsList) return;
        const defaultDate = document.getElementById('f-date')?.value
                         || new Date().toISOString().split('T')[0];
        const row = document.createElement('div');
        row.className = 'entry-row';
        row.innerHTML = `
            <input  type="date"   class="d-date"    value="${data.date    || defaultDate}"    style="flex:0.75;" />
            <input  type="text"   class="d-desc"    placeholder="Motif de la dépense" list="jb-debit-list"
                    value="${data.desc || ''}"       style="flex:1.8;" />
            <input  type="number" class="d-montant" placeholder="Montant"
                    value="${data.montant || ''}"    style="flex:1;" min="0" />
            <select class="d-canal" style="flex:0.8;">
                <option value="Espèce"   ${(data.canal||'Espèce') ==='Espèce'   ?'selected':''}>Espèce</option>
                <option value="OM"       ${data.canal==='OM'       ?'selected':''}>Orange Money</option>
                <option value="WAVE"     ${data.canal==='WAVE'     ?'selected':''}>Wave</option>
                <option value="Virement" ${data.canal==='Virement' ?'selected':''}>Virement / Chèque</option>
            </select>
            <button class="btn-del" title="Supprimer">✕</button>`;

        row.querySelector('.btn-del').addEventListener('click', () => { row.remove(); });
        
        // Auto-fill Montant sur sélection du motif
        const descInput = row.querySelector('.d-desc');
        const montantInput = row.querySelector('.d-montant');
        descInput.addEventListener('input', (e) => {
            const val = e.target.value.trim().toLowerCase();
            const matched = expensesCache.find(ex => (ex.description || '').toLowerCase() === val);
            if (matched && !montantInput.value) {
                montantInput.value = matched.montant || 0;
            }
        });

        debitsList.appendChild(row);
    }

    if (btnAddCredit) btnAddCredit.addEventListener('click', () => addCreditRow());
    if (btnAddDebit)  btnAddDebit.addEventListener('click',  () => addDebitRow());

    // Quand la date principale change, on la propage aux nouvelles lignes
    const mainDateInput = document.getElementById('f-date');
    if (mainDateInput) {
        mainDateInput.value = new Date().toISOString().split('T')[0];
        mainDateInput.addEventListener('change', saveDraft);
    }

    // =========================================================
    // 4. BILLETAGE — calcul + rapprochement vs crédit espèce
    // =========================================================
    const billetGrid = document.getElementById('billet-grid');
    if (billetGrid) {
        billetGrid.querySelectorAll('input[data-val]').forEach(input => {
            input.addEventListener('input', () => {
                calcTotals();
                saveDraft();
            });
        });
    }

    // Vider et réinitialiser la modale de saisie
    function resetModalForm() {
        if (creditsList) {
            creditsList.innerHTML = '';
            for (let i = 0; i < 5; i++) addCreditRow();
        }
        if (debitsList) {
            debitsList.innerHTML = '';
            addDebitRow();
        }
    }
    resetModalForm();

    // Traitement lors de la fermeture de la modale via le bouton "Terminer"
    const btnTerminerSaisie = document.getElementById('btn-terminer-saisie');
    if (btnTerminerSaisie) {
        btnTerminerSaisie.addEventListener('click', () => {
            if (creditsList) {
                creditsList.querySelectorAll('.entry-row').forEach(row => {
                    const date = row.querySelector('.c-date').value;
                    const desc = row.querySelector('.c-desc').value.trim();
                    const montant = parseNum(row.querySelector('.c-montant').value);
                    const canal = row.querySelector('.c-canal').value;
                    if (desc || montant > 0) periodCredits.push({ id: Date.now() + Math.random(), date, desc, montant, canal });
                });
            }
            if (debitsList) {
                debitsList.querySelectorAll('.entry-row').forEach(row => {
                    const date = row.querySelector('.d-date').value;
                    const desc = row.querySelector('.d-desc').value.trim();
                    const montant = parseNum(row.querySelector('.d-montant').value);
                    const canal = row.querySelector('.d-canal').value;
                    if (desc || montant > 0) periodDebits.push({ id: Date.now() + Math.random(), date, desc, montant, canal });
                });
            }
            resetModalForm();
            calcTotals();
            saveDraft();
            document.getElementById('modal-saisie-operations').classList.add('hidden');
        });
    }

    function getBilletTotal() {
        let total = 0;
        billetGrid?.querySelectorAll('input[data-val]').forEach(input => {
            total += (parseNum(input.value)) * parseInt(input.dataset.val);
        });
        return total;
    }

    function updateBilletRapprochement(creditEspece) {
        const billetTotal = getBilletTotal();
        const diff = billetTotal - creditEspece;

        const elBilletTotal      = document.getElementById('billet-total');
        const elBilletTotalRight = document.getElementById('billet-total-right');
        const elCreditEspece     = document.getElementById('billet-credit-espece');
        const elDiffLabel        = document.getElementById('billet-diff-label');
        const elDiffIcon         = document.getElementById('billet-diff-icon');

        if (elBilletTotal)      elBilletTotal.textContent      = fmt(billetTotal);
        if (elBilletTotalRight) elBilletTotalRight.textContent = fmt(billetTotal);
        if (elCreditEspece)     elCreditEspece.textContent     = fmt(creditEspece);

        if (!elDiffLabel || !elDiffIcon) return;

        if (billetTotal === 0 && creditEspece === 0) {
            elDiffLabel.textContent = '—';
            elDiffLabel.style.background = 'var(--navy)';
            elDiffLabel.style.color = 'var(--text-muted)';
            elDiffIcon.textContent = '⚖️';
        } else if (diff === 0) {
            elDiffLabel.textContent = '✓ Équilibré';
            elDiffLabel.style.background = 'var(--green-bg)';
            elDiffLabel.style.color = 'var(--green)';
            elDiffIcon.textContent = '✅';
        } else if (diff > 0) {
            elDiffLabel.textContent = `+${fmt(diff)} excédent`;
            elDiffLabel.style.background = 'rgba(212,168,67,.15)';
            elDiffLabel.style.color = 'var(--gold)';
            elDiffIcon.textContent = '⬆️';
        } else {
            elDiffLabel.textContent = `${fmt(diff)} manquant`;
            elDiffLabel.style.background = 'var(--red-bg)';
            elDiffLabel.style.color = 'var(--red)';
            elDiffIcon.textContent = '⚠️';
        }
    }

    // =========================================================
    // 5. CALCULS EN TEMPS RÉEL + MINI-LEDGER
    // =========================================================
    function calcTotals() {
        let totOM = 0, totWave = 0, totEspece = 0, totVirement = 0;
        let debitOM = 0, debitWave = 0, debitEspece = 0, debitVirement = 0;
        let totDebit = 0;
        let nbCredits = periodCredits.length;
        let nbDebits = periodDebits.length;
        const ledgerRows = [];  // pour le mini-ledger

        periodCredits.forEach(c => {
            if (c.montant > 0) {
                if (c.canal === 'OM')        totOM       += c.montant;
                else if (c.canal === 'WAVE') totWave     += c.montant;
                else if (c.canal === 'Espèce') totEspece += c.montant;
                else                       totVirement += c.montant;
            }
            ledgerRows.push({ id: c.id, desc: c.desc || '—', canal: c.canal, montant: c.montant, type: 'credit' });
        });

        periodDebits.forEach(d => {
            const dCanal = d.canal || 'Espèce';
            if (d.montant > 0) {
                totDebit += d.montant;
                if (dCanal === 'OM')        debitOM       += d.montant;
                else if (dCanal === 'WAVE') debitWave     += d.montant;
                else if (dCanal === 'Espèce') debitEspece += d.montant;
                else                        debitVirement += d.montant;
            }
            ledgerRows.push({ id: d.id, desc: d.desc || '—', canal: dCanal, montant: d.montant, type: 'debit' });
        });

        const finalOM = initBalances.OM + totOM - debitOM;
        const finalWave = initBalances.WAVE + totWave - debitWave;
        const finalEspece = initBalances.Espèce + totEspece - debitEspece;
        const finalVirement = initBalances.Virement + totVirement - debitVirement;

        const totalCredit = totOM + totWave + totEspece + totVirement;
        const solde = (initBalances.OM + initBalances.WAVE + initBalances.Espèce + initBalances.Virement) + totalCredit - totDebit;

        // — Mise à jour du récap
        const upd = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = fmt(val);
        };
        upd('r-om',           finalOM);
        upd('r-wave',         finalWave);
        upd('r-espece',       finalEspece);
        upd('r-virement',     finalVirement);
        upd('r-total-credit', totalCredit);
        upd('r-total-debit',  totDebit);
        upd('r-solde',        solde);

        const nbCEl = document.getElementById('r-nb-credits');
        const nbDEl = document.getElementById('r-nb-debits');
        if (nbCEl) nbCEl.textContent = `${nbCredits} entrée(s) crédit`;
        if (nbDEl) nbDEl.textContent = `${nbDebits} dépense(s)`;

        // Couleur du solde
        const soldeWrap = document.getElementById('recap-solde-wrap');
        if (soldeWrap) {
            soldeWrap.className = 'recap-item solde-recap ' + (solde >= 0 ? 'positif' : 'negatif');
        }

        // — Mini-ledger
        updateMiniLedger(ledgerRows);

        // — Rapprochement billetage
        updateBilletRapprochement(finalEspece);
    }

    // =========================================================
    // 6. MINI-LEDGER en temps réel
    // =========================================================
    function updateMiniLedger(rows) {
        const tbody = document.getElementById('mini-ledger-body');
        const emptyRow = document.getElementById('mini-ledger-empty');
        if (!tbody) return;

        // Supprimer les lignes dynamiques existantes
        tbody.querySelectorAll('tr.ledger-row').forEach(r => r.remove());

        if (!rows.length) {
            if (emptyRow) emptyRow.style.display = '';
            return;
        }
        if (emptyRow) emptyRow.style.display = 'none';

        rows.forEach(r => {
            const tr = document.createElement('tr');
            tr.className = 'ledger-row';

            // Détermine badge canal et couleur du montant
            let badgeCls = 'debit';
            let canalLabel = 'Débit';
            
            if (r.type === 'credit') {
                const meta = CANAL_META[r.canal];
                badgeCls   = meta ? meta.cls : 'espece';
                canalLabel = meta ? meta.label : r.canal;
            } else if (r.type === 'debit') {
                const meta = CANAL_META[r.canal];
                badgeCls   = 'debit';
                canalLabel = meta ? meta.label : (r.canal || 'Débit');
            }

            const valCredit = r.type === 'credit' ? `+ ${fmt(r.montant)}` : '—';
            const valDebit  = r.type === 'debit'  ? `− ${fmt(r.montant)}` : '—';
            
            const colorCredit = r.type === 'credit' ? (CANAL_META[r.canal]?.color || 'var(--green)') : 'var(--text-muted)';
            const colorDebit  = r.type === 'debit'  ? 'var(--red)' : 'var(--text-muted)';

            tr.innerHTML = `
                <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
                    title="${r.desc}">${r.desc}</td>
                <td style="text-align:center;">
                    <span class="canal-badge ${badgeCls}">${canalLabel}</span>
                </td>
                <td style="color:${colorCredit}; font-weight:600; white-space:nowrap; text-align:right;">
                    ${valCredit}
                </td>
                <td style="color:${colorDebit}; font-weight:600; white-space:nowrap; text-align:right;">
                    ${valDebit}
                </td>
                <td style="text-align:right; width:32px;">
                    <button class="btn-del-ledger" data-id="${r.id}" data-type="${r.type}" style="background:transparent;border:none;color:var(--red);cursor:pointer;font-size:14px;" title="Supprimer">✕</button>
                </td>`;
            tbody.appendChild(tr);
        });
        
        tbody.querySelectorAll('.btn-del-ledger').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.dataset.id;
                const type = e.target.dataset.type;
                if (type === 'credit') periodCredits = periodCredits.filter(c => String(c.id) !== id);
                else periodDebits = periodDebits.filter(d => String(d.id) !== id);
                calcTotals();
                saveDraft();
            });
        });
    }

    // =========================================================
    // 7. ANNULER / RÉINITIALISER LE FORMULAIRE
    // =========================================================
    function resetForm() {
        periodCredits = [];
        periodDebits = [];
        resetModalForm();
        if (billetGrid) billetGrid.querySelectorAll('input').forEach(i => { i.value = ''; });
        const mainDateInput = document.getElementById('f-date');
        if (mainDateInput) mainDateInput.value = new Date().toISOString().split('T')[0];
        calcTotals();
    }

    document.getElementById('btn-cancel-form')?.addEventListener('click', async () => {
        resetForm();
        await clearDraft();
        document.querySelector('.nav-btn[data-view="dashboard"]')?.click();
    });

    // =========================================================
    // --- GESTION DE LA SAUVEGARDE SUR FIREBASE ---
    const btnSavePeriode = document.getElementById('btn-save-periode');
    if (btnSavePeriode) {
        btnSavePeriode.addEventListener('click', async () => {
            const texteOriginal = btnSavePeriode.innerHTML;
            
            // 1. Désactiver le bouton pendant le chargement
            btnSavePeriode.disabled = true;
            btnSavePeriode.innerHTML = "⏳ Enregistrement en cours...";
            btnSavePeriode.style.opacity = "0.7";

            try {
                // 2. Récupérer toutes les lignes d'Entrées
                const entrees = periodCredits.map(c => ({
                    date: c.date,
                    libelle: c.desc,
                    montant: c.montant,
                    canal: c.canal
                }));
                
                // 3. Récupérer toutes les lignes de Dépenses
                const depenses = periodDebits.map(d => ({
                    date: d.date,
                    libelle: d.desc,
                    montant: d.montant,
                    canal: d.canal || 'Espèce'
                }));

                // 4. Récupérer le Bilan
                const parseNumber = (id) => parseNum(document.getElementById(id)?.textContent || '0');
            
                const bilan = {
                    totOM: parseNumber("r-om"),
                    totWave: parseNumber("r-wave"),
                    totEspeces: parseNumber("r-espece"),
                    totVirement: parseNumber("r-virement"),
                    totalCredit: parseNumber("r-total-credit"),
                    totalDebit: parseNumber("r-total-debit"),
                    solde: parseNumber("r-solde"),
                    billetTotal: getBilletTotal()
                };
                
                const datePeriode = document.getElementById('f-date')?.value || new Date().toISOString().split('T')[0];
                const ecart = bilan.billetTotal - bilan.totEspeces;

                // 5. Envoyer le tout sur Firebase (Collection 'jb_periodes')
                await addDoc(collection(db, "jb_periodes"), {
                    dateCreation: serverTimestamp(),
                    datePeriode: datePeriode,
                    entrees: entrees,
                    depenses: depenses,
                    totaux: {
                        soldeInitialOM: initBalances.OM,
                        soldeInitialWave: initBalances.WAVE,
                        soldeInitialEspece: initBalances.Espèce,
                        soldeInitialVirement: initBalances.Virement,
                        totalCredit: bilan.totalCredit,
                        totalDebit: bilan.totalDebit,
                        solde: bilan.solde,
                        ecartBillet: ecart
                    },
                    bilan: bilan,
                    auteur: sessionStorage.getItem('userName') || 'Utilisateur'
                });
            
                // Mettre à jour les soldes initiaux pour la prochaine période (qui correspondent aux soldes finaux)
                try {
                    await setDoc(doc(db, "jb_settings", "balances"), {
                        OM: bilan.totOM,
                        WAVE: bilan.totWave,
                        Espèce: bilan.totEspeces,
                        Virement: bilan.totVirement
                    });
                    await loadInitBalances(); // Recharger les soldes
                } catch(e) { console.error("Erreur update balances", e); }

                // 6. Succès
                if (window.AppModal) {
                    await AppModal.success(`Journée enregistrée avec succès !\n\nSolde final: ${fmt(bilan.solde)}\nÉcart billet: ${fmt(ecart)}`);
                } else {
                    alert(`✅ Journée enregistrée avec succès !\n\nSolde final: ${fmt(bilan.solde)}\nÉcart billet: ${fmt(ecart)}`);
                }
                
                resetForm();
                await clearDraft();
                document.querySelector('.nav-btn[data-view="dashboard"]')?.click();

            } catch (error) {
                console.error("Erreur lors de l'enregistrement Firebase :", error);
                if (window.AppModal) {
                    AppModal.error("❌ Une erreur s'est produite lors de l'enregistrement. Vérifiez votre connexion internet.");
                } else {
                    alert("❌ Une erreur s'est produite lors de l'enregistrement. Vérifiez votre connexion internet.");
                }
            } finally {
                btnSavePeriode.disabled = false;
                btnSavePeriode.innerHTML = texteOriginal;
                btnSavePeriode.style.opacity = "1";
            }
        });
    }

    // =========================================================
    // 9. HISTORIQUE — écoute temps réel Firestore
    // =========================================================
    const historiqueList = document.getElementById('historique-list');
    if (historiqueList) {
        const q = query(collection(db, 'jb_periodes'), orderBy('dateCreation', 'desc'));

        onSnapshot(q, (snap) => {
            historiqueList.innerHTML = '';
            
            let totalCreditGlobal = 0;
            let totalDebitGlobal = 0;
            let totalOM = 0, totalWave = 0, totalEspece = 0, totalVirement = 0;
            let latestPeriod = null;
            const periodsData = [];

            if (snap.empty) {
                historiqueList.innerHTML = '<p class="empty-msg">Aucune période enregistrée pour le moment.</p>';
                // Réinitialiser le tableau de bord
                const updateKPI = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
                updateKPI('kpi-credit', '0 FCFA'); updateKPI('kpi-debit', '0 FCFA');
                updateKPI('kpi-solde', '0 FCFA'); updateKPI('kpi-periodes', '0');
                const dPeriod = document.getElementById('derniere-periode'); if (dPeriod) dPeriod.innerHTML = '<p class="empty-msg">Aucune période enregistrée.</p>';
                const cBars = document.getElementById('credit-bars'); if (cBars) cBars.innerHTML = '<p class="empty-msg">Aucune donnée.</p>';
                renderStatistiques([]);
                return;
            }

            snap.forEach(doc => {
                const d = doc.data();
                periodsData.push(d);
                const label = d.datePeriode
                    ? new Date(d.datePeriode).toLocaleDateString('fr-FR')
                    : '—';
                const t = d.totaux || {};

                // --- CALCULS POUR LE TABLEAU DE BORD ---
                totalCreditGlobal += (t.totalCredit || 0);
                totalDebitGlobal += (t.totalDebit || 0);
                
                // Somme de la répartition par canal
                if (d.entrees) {
                    d.entrees.forEach(ent => {
                        if (ent.canal === 'OM') totalOM += (ent.montant || 0);
                        else if (ent.canal === 'WAVE') totalWave += (ent.montant || 0);
                        else if (ent.canal === 'Espèce') totalEspece += (ent.montant || 0);
                        else if (ent.canal === 'Virement') totalVirement += (ent.montant || 0);
                    });
                }

                if (!latestPeriod) latestPeriod = d; // Le plus récent (car orderBy desc)

                const card = document.createElement('div');
                card.className = 'periode-card';
                card.innerHTML = `
                    <div class="pc-date">${label}</div>
                    <div class="pc-metrics">
                        <div class="pc-metric">
                            <span class="pc-metric-label">Crédit</span>
                            <span class="pc-metric-val credit">+ ${fmt(t.totalCredit)}</span>
                        </div>
                        <div class="pc-metric">
                            <span class="pc-metric-label">Débit</span>
                            <span class="pc-metric-val debit">− ${fmt(t.totalDebit)}</span>
                        </div>
                        <div class="pc-metric">
                            <span class="pc-metric-label">Solde</span>
                            <span class="pc-metric-val ${(t.solde ?? 0) >= 0 ? 'pos' : 'neg'}">${fmt(t.solde)}</span>
                        </div>
                        ${t.ecartBillet !== undefined && t.ecartBillet !== 0 ? `
                        <div class="pc-metric">
                            <span class="pc-metric-label">Écart billet</span>
                            <span class="pc-metric-val ${t.ecartBillet > 0 ? 'pos' : 'neg'}">${fmt(t.ecartBillet)}</span>
                        </div>` : ''}
                    </div>
                    <div class="pc-actions">
                        <span style="font-size:11px;color:var(--text-muted);">${d.auteur || ''}</span>
                    </div>`;
                
                // Clic pour afficher les détails de la période
                card.addEventListener('click', () => showPeriodDetails(d));
                
                historiqueList.appendChild(card);
            });

            // --- MISE À JOUR VISUELLE DU TABLEAU DE BORD ---
            const updateKPI = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
            updateKPI('kpi-credit', fmt(totalCreditGlobal));
            updateKPI('kpi-debit', fmt(totalDebitGlobal));
            updateKPI('kpi-solde', fmt(totalCreditGlobal - totalDebitGlobal));
            updateKPI('kpi-periodes', snap.size);

            if (latestPeriod) {
                const dDate = latestPeriod.datePeriode ? new Date(latestPeriod.datePeriode).toLocaleDateString('fr-FR') : '—';
                const t = latestPeriod.totaux || {};
                const elDer = document.getElementById('derniere-periode');
                if (elDer) {
                    elDer.innerHTML = `
                        <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                            <strong style="color:var(--text-main);">Période du ${dDate}</strong>
                            <span class="tag" style="background:var(--navy-light); color:var(--text-muted); border:1px solid var(--border);">${latestPeriod.auteur || 'Système'}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; font-size:14px; font-weight:600;">
                            <span style="color:var(--green);">+ ${fmt(t.totalCredit)}</span>
                            <span style="color:var(--red);">− ${fmt(t.totalDebit)}</span>
                            <span style="color:var(--gold);">${fmt(t.solde)}</span>
                        </div>
                    `;
                }
            }

            const totalBars = totalOM + totalWave + totalEspece + totalVirement;
            const elBars = document.getElementById('credit-bars');
            if (elBars) {
                if (totalBars > 0) {
                    const pctOM = (totalOM / totalBars) * 100;
                    const pctWave = (totalWave / totalBars) * 100;
                    const pctEspece = (totalEspece / totalBars) * 100;
                    const pctVirement = (totalVirement / totalBars) * 100;

                    elBars.innerHTML = `
                        <div class="bar-row"><span class="bar-label">Espèce</span><div class="bar-track"><div class="bar-fill espece" style="width:${pctEspece}%"></div></div><span class="bar-value">${fmt(totalEspece)}</span></div>
                        <div class="bar-row"><span class="bar-label">OM</span><div class="bar-track"><div class="bar-fill om" style="width:${pctOM}%"></div></div><span class="bar-value">${fmt(totalOM)}</span></div>
                        <div class="bar-row"><span class="bar-label">Wave</span><div class="bar-track"><div class="bar-fill wave" style="width:${pctWave}%"></div></div><span class="bar-value">${fmt(totalWave)}</span></div>
                        <div class="bar-row"><span class="bar-label">Virement</span><div class="bar-track"><div class="bar-fill" style="background:#7c5cbf; width:${pctVirement}%"></div></div><span class="bar-value">${fmt(totalVirement)}</span></div>
                    `;
                } else {
                    elBars.innerHTML = '<p class="empty-msg">Aucune répartition disponible.</p>';
                }
            }
            
            // Rendu des graphiques de l'onglet Statistiques
            renderStatistiques(periodsData);
        });
        
        // --- GESTION DE L'AFFICHAGE DES DÉTAILS DANS LA MODALE ---
        function showPeriodDetails(data) {
            const modalOverlay = document.getElementById('modal-overlay');
            const modalTitle = document.getElementById('modal-title');
            const modalBody = document.getElementById('modal-body');
            if (!modalOverlay || !modalBody || !modalTitle) return;

            const dateLabel = data.datePeriode ? new Date(data.datePeriode).toLocaleDateString('fr-FR') : '—';
            modalTitle.textContent = `Détails Période du ${dateLabel}`;

            let html = `
                <div class="modal-kpis" style="display:flex; gap:12px; margin-bottom:20px;">
                    <div class="modal-kpi" style="flex:1;"><div class="modal-kpi-label">Crédit Total</div><div class="modal-kpi-val" style="color:var(--green)">+ ${fmt(data.totaux?.totalCredit)}</div></div>
                    <div class="modal-kpi" style="flex:1;"><div class="modal-kpi-label">Débit Total</div><div class="modal-kpi-val" style="color:var(--red)">− ${fmt(data.totaux?.totalDebit)}</div></div>
                    <div class="modal-kpi" style="flex:1;"><div class="modal-kpi-label">Solde Final</div><div class="modal-kpi-val" style="color:var(--gold)">${fmt(data.totaux?.solde)}</div></div>
                </div>
            `;

            // Entrées
            html += `<h4 style="margin-bottom:10px; color:var(--text-main); font-weight:700; text-transform:uppercase; font-size:12px; letter-spacing:1px;">Entrées (Crédit)</h4>`;
            if (data.entrees && data.entrees.length > 0) {
                html += `<table class="modal-table" style="margin-bottom:24px;">
                    <thead><tr><th>Date</th><th>Libellé / Réf</th><th style="text-align:center;">Canal</th><th style="text-align:right;">Montant</th></tr></thead>
                    <tbody>`;
                data.entrees.forEach(e => {
                    const meta = CANAL_META[e.canal] || { cls: 'espece' };
                    html += `<tr>
                        <td>${e.date}</td>
                        <td>${e.libelle || '—'}</td>
                        <td style="text-align:center;"><span class="canal-badge ${meta.cls}">${e.canal}</span></td>
                        <td class="amount-pos" style="text-align:right;">+ ${fmt(e.montant)}</td>
                    </tr>`;
                });
                html += `</tbody></table>`;
            } else {
                html += `<p class="empty-msg" style="margin-bottom:24px;">Aucune entrée saisie.</p>`;
            }

            // Dépenses
            html += `<h4 style="margin-bottom:10px; color:var(--text-main); font-weight:700; text-transform:uppercase; font-size:12px; letter-spacing:1px;">Dépenses (Débit)</h4>`;
            if (data.depenses && data.depenses.length > 0) {
                html += `<table class="modal-table" style="margin-bottom:24px;">
                    <thead><tr><th>Date</th><th>Motif</th><th style="text-align:center;">Canal</th><th style="text-align:right;">Montant</th></tr></thead>
                    <tbody>`;
                data.depenses.forEach(d => {
                    const meta = CANAL_META[d.canal] || { cls: 'debit' };
                    html += `<tr>
                        <td>${d.date}</td>
                        <td>${d.libelle || '—'}</td>
                        <td style="text-align:center;"><span class="canal-badge ${meta.cls}">${d.canal || 'Espèce'}</span></td>
                        <td class="amount-neg" style="text-align:right;">− ${fmt(d.montant)}</td>
                    </tr>`;
                });
                html += `</tbody></table>`;
            } else {
                html += `<p class="empty-msg" style="margin-bottom:24px;">Aucune dépense saisie.</p>`;
            }

            // Écart Billetage
            if (data.totaux?.ecartBillet !== undefined && data.totaux.ecartBillet !== 0) {
                html += `<div style="margin-top:10px; padding:12px; background:var(--navy-light); border-radius:8px; font-size:13px; border:1px solid var(--border);">
                    <strong>Écart Billetage :</strong> <span style="color:${data.totaux.ecartBillet >= 0 ? 'var(--green)' : 'var(--red)'}; font-weight:bold; margin-left:6px;">${fmt(data.totaux.ecartBillet)}</span>
                </div>`;
            }

            modalBody.innerHTML = html;
            modalOverlay.classList.remove('hidden');
        }

        // Fermeture de la modale des détails
        document.getElementById('modal-close')?.addEventListener('click', () => {
            document.getElementById('modal-overlay').classList.add('hidden');
        });

        document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
            if (e.target.id === 'modal-overlay') e.target.classList.add('hidden');
        });
    }

    // --- ÉCOUTEURS POUR LES SOLDES INITIAUX (Modification manuelle) ---
    ['init-om', 'init-wave', 'init-espece', 'init-virement'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', () => {
            initBalances = {
                OM: parseNum(document.getElementById('init-om')?.value),
                WAVE: parseNum(document.getElementById('init-wave')?.value),
                Espèce: parseNum(document.getElementById('init-espece')?.value),
                Virement: parseNum(document.getElementById('init-virement')?.value)
            };
            calcTotals();
        });
    });

    const btnSaveInit = document.getElementById('btn-save-init-balances');
    if (btnSaveInit) {
        btnSaveInit.addEventListener('click', async () => {
            btnSaveInit.textContent = "⏳...";
            btnSaveInit.disabled = true;
            try {
                await setDoc(doc(db, "jb_settings", "balances"), initBalances);
                if (window.AppModal) await AppModal.success("Soldes initiaux enregistrés avec succès !");
            } catch(e) {
                console.error(e);
                if (window.AppModal) AppModal.error("Erreur lors de l'enregistrement.");
            } finally {
                btnSaveInit.textContent = "Enregistrer";
                btnSaveInit.disabled = false;
            }
        });
    }

    // Démarrage : Initialisation et chargement du brouillon
    initDraftRef();
    loadDraft();
    loadInitBalances();

    // =========================================================
    // 10. GRAPHIQUES (CHART.JS)
    // =========================================================
    let soldeChartInstance = null;
    let canalChartInstance = null;
    let cvdChartInstance = null;

    function renderStatistiques(periods) {
        const sortedPeriods = [...periods].reverse(); // Inverser pour l'ordre chronologique
        const labels = sortedPeriods.map(p => p.datePeriode ? new Date(p.datePeriode).toLocaleDateString('fr-FR', {day: '2-digit', month:'2-digit'}) : '—');
        
        // 1. Evolution Solde (Ligne)
        const soldeData = sortedPeriods.map(p => p.totaux?.solde || 0);
        const ctxSolde = document.getElementById('chart-solde');
        if (ctxSolde) {
            if (soldeChartInstance) soldeChartInstance.destroy();
            soldeChartInstance = new Chart(ctxSolde, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Solde Net',
                        data: soldeData,
                        borderColor: '#4f46e5',
                        backgroundColor: 'rgba(79, 70, 229, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.3,
                        pointBackgroundColor: '#4f46e5'
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true } }
                }
            });
        }

        // 2. Crédit par Canal (Camembert / Donut)
        let canals = { 'OM':0, 'WAVE':0, 'Espèce':0, 'Virement':0 };
        sortedPeriods.forEach(p => {
            if (p.entrees) {
                p.entrees.forEach(e => {
                    const c = e.canal || 'Espèce';
                    if(canals[c] !== undefined) canals[c] += (e.montant || 0);
                    else canals['Espèce'] += (e.montant || 0);
                });
            }
        });

        const ctxCanal = document.getElementById('chart-canal');
        if (ctxCanal) {
            if (canalChartInstance) canalChartInstance.destroy();
            canalChartInstance = new Chart(ctxCanal, {
                type: 'doughnut',
                data: {
                    labels: ['OM', 'WAVE', 'Espèce', 'Virement'],
                    datasets: [{
                        data: [canals['OM'], canals['WAVE'], canals['Espèce'], canals['Virement']],
                        backgroundColor: ['#f59e0b', '#3498db', '#10b981', '#7c5cbf'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
                    cutout: '65%'
                }
            });
        }

        // 3. Crédit vs Débit (Barres)
        const creditData = sortedPeriods.map(p => p.totaux?.totalCredit || 0);
        const debitData = sortedPeriods.map(p => p.totaux?.totalDebit || 0);

        const ctxCvd = document.getElementById('chart-cv-d');
        if (ctxCvd) {
            if (cvdChartInstance) cvdChartInstance.destroy();
            cvdChartInstance = new Chart(ctxCvd, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        { label: 'Crédit', data: creditData, backgroundColor: '#10b981', borderRadius: 4 },
                        { label: 'Débit', data: debitData, backgroundColor: '#ef4444', borderRadius: 4 }
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { position: 'top' } },
                    scales: { y: { beginAtZero: true } }
                }
            });
        }
    }

}); // End DOMContentLoaded