import { db } from './firebase-config.js';
import {
    collection, addDoc, getDocs,
    query, orderBy, onSnapshot, where
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
        'OM':        { label: 'OM',        cls: 'om',       color: 'var(--gold)' },
        'WAVE':      { label: 'WAVE',      cls: 'wave',     color: '#3498db'     },
        'Espèce':    { label: 'Espèce',    cls: 'espece',   color: 'var(--green)'},
        'Virement':  { label: 'Virement',  cls: 'virement', color: '#7c5cbf'     },
    };

    // =========================================================
    // 2.5 SAISIE INTELLIGENTE (AUTO-COMPLÉTION & AUTO-FILL)
    // =========================================================
    let transactionsCache = [];
    let expensesCache = [];

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

        row.querySelector('.btn-del').addEventListener('click', () => { row.remove(); calcTotals(); });
        row.querySelectorAll('input, select').forEach(el => el.addEventListener('input', calcTotals));
        
        // Auto-fill Montant sur sélection de la Réf
        const descInput = row.querySelector('.c-desc');
        const montantInput = row.querySelector('.c-montant');
        descInput.addEventListener('change', (e) => {
            const val = e.target.value.trim().toUpperCase();
            const matched = transactionsCache.find(t => 
                (t.reference || '').toUpperCase() === val || (t.nom || '').toUpperCase() === val
            );
            if (matched && !montantInput.value) {
                montantInput.value = (matched.reste && matched.reste < 0) ? Math.abs(matched.reste) : (matched.prix || 0);
                calcTotals();
            }
        });

        creditsList.appendChild(row);
        calcTotals();
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
            <button class="btn-del" title="Supprimer">✕</button>`;

        row.querySelector('.btn-del').addEventListener('click', () => { row.remove(); calcTotals(); });
        row.querySelectorAll('input').forEach(el => el.addEventListener('input', calcTotals));
        
        // Auto-fill Montant sur sélection du motif
        const descInput = row.querySelector('.d-desc');
        const montantInput = row.querySelector('.d-montant');
        descInput.addEventListener('change', (e) => {
            const val = e.target.value.trim().toLowerCase();
            const matched = expensesCache.find(ex => (ex.description || '').toLowerCase() === val);
            if (matched && !montantInput.value) {
                montantInput.value = matched.montant || 0;
                calcTotals();
            }
        });

        debitsList.appendChild(row);
        calcTotals();
    }

    if (btnAddCredit) btnAddCredit.addEventListener('click', () => addCreditRow());
    if (btnAddDebit)  btnAddDebit.addEventListener('click',  () => addDebitRow());

    // Quand la date principale change, on la propage aux nouvelles lignes
    const mainDateInput = document.getElementById('f-date');
    if (mainDateInput) {
        mainDateInput.value = new Date().toISOString().split('T')[0];
    }

    // =========================================================
    // 4. BILLETAGE — calcul + rapprochement vs crédit espèce
    // =========================================================
    const billetGrid = document.getElementById('billet-grid');
    if (billetGrid) {
        billetGrid.querySelectorAll('input[data-val]').forEach(input => {
            input.addEventListener('input', calcTotals);
        });
    }

    // Initialisation avec une ligne vide de chaque (Déplacé ici pour éviter l'erreur TDZ)
    if (creditsList) addCreditRow();
    if (debitsList)  addDebitRow();

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
        let totDebit = 0;
        let nbCredits = 0, nbDebits = 0;

        // — Collecte des crédits par canal
        const ledgerRows = [];  // pour le mini-ledger

        if (creditsList) {
            creditsList.querySelectorAll('.entry-row').forEach(row => {
                const montant = parseNum(row.querySelector('.c-montant').value);
                const canal   = row.querySelector('.c-canal').value;
                const desc    = row.querySelector('.c-desc').value.trim();

                if (montant > 0 || desc) {
                    nbCredits++;
                    if (montant > 0) {
                        if (canal === 'OM')        totOM       += montant;
                        else if (canal === 'WAVE') totWave     += montant;
                        else if (canal === 'Espèce') totEspece += montant;
                        else                       totVirement += montant;
                    }
                    if (montant > 0) {
                        ledgerRows.push({ desc: desc || '—', canal, montant, type: 'credit' });
                    }
                }
            });
        }

        // — Collecte des débits
        if (debitsList) {
            debitsList.querySelectorAll('.entry-row').forEach(row => {
                const montant = parseNum(row.querySelector('.d-montant').value);
                const desc    = row.querySelector('.d-desc').value.trim();

                if (montant > 0 || desc) {
                    nbDebits++;
                    if (montant > 0) {
                        totDebit += montant;
                        ledgerRows.push({ desc: desc || '—', canal: 'Débit', montant, type: 'debit' });
                    }
                }
            });
        }

        const totalCredit = totOM + totWave + totEspece + totVirement;
        const solde       = totalCredit - totDebit;

        // — Mise à jour du récap
        const upd = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = fmt(val);
        };
        upd('r-om',           totOM);
        upd('r-wave',         totWave);
        upd('r-espece',       totEspece);
        upd('r-virement',     totVirement);
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
        updateBilletRapprochement(totEspece);
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

            // Détermine badge canal
            let badgeCls = 'debit';
            let canalLabel = 'Débit';
            if (r.type === 'credit') {
                const meta = CANAL_META[r.canal];
                badgeCls   = meta ? meta.cls : 'espece';
                canalLabel = meta ? meta.label : r.canal;
            }

            tr.innerHTML = `
                <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
                    title="${r.desc}">${r.desc}</td>
                <td style="text-align:center;">
                    <span class="canal-badge ${badgeCls}">${canalLabel}</span>
                </td>
                <td class="${r.type === 'credit' ? 'text-green' : 'text-red'}"
                    style="white-space:nowrap;">
                    ${r.type === 'credit' ? '+' : '−'} ${fmt(r.montant)}
                </td>`;
            tbody.appendChild(tr);
        });
    }

    // =========================================================
    // 7. ANNULER / RÉINITIALISER LE FORMULAIRE
    // =========================================================
    function resetForm() {
        if (creditsList) { creditsList.innerHTML = ''; addCreditRow(); }
        if (debitsList)  { debitsList.innerHTML  = ''; addDebitRow();  }
        billetGrid?.querySelectorAll('input').forEach(i => { i.value = ''; });
        if (mainDateInput) mainDateInput.value = new Date().toISOString().split('T')[0];
        calcTotals();
    }

    document.getElementById('btn-cancel-form')?.addEventListener('click', () => {
        resetForm();
        document.querySelector('.nav-btn[data-view="dashboard"]')?.click();
    });

    // =========================================================
    // 8. ENREGISTREMENT FIREBASE
    // =========================================================
    const btnSave = document.getElementById('btn-save-periode');
    if (btnSave) {
        btnSave.addEventListener('click', async () => {

            const periodeDate = document.getElementById('f-date')?.value;
            if (!periodeDate) {
                return alert('Veuillez sélectionner une date globale pour cette période.');
            }

            // — Collecte crédits
            const credits = [];
            let tOM = 0, tWave = 0, tEsp = 0, tVir = 0;

            document.querySelectorAll('#credits-list .entry-row').forEach(row => {
                const date    = row.querySelector('.c-date').value;
                const desc    = row.querySelector('.c-desc').value.trim();
                const montant = parseNum(row.querySelector('.c-montant').value);
                const canal   = row.querySelector('.c-canal').value;

                if (desc || montant > 0) {
                    credits.push({ date, desc, montant, canal });
                    if (canal === 'OM')          tOM  += montant;
                    else if (canal === 'WAVE')   tWave += montant;
                    else if (canal === 'Espèce') tEsp  += montant;
                    else                         tVir  += montant;
                }
            });

            // — Collecte débits
            const debits = [];
            let tDeb = 0;

            document.querySelectorAll('#debits-list .entry-row').forEach(row => {
                const date    = row.querySelector('.d-date').value;
                const desc    = row.querySelector('.d-desc').value.trim();
                const montant = parseNum(row.querySelector('.d-montant').value);

                if (desc || montant > 0) {
                    debits.push({ date, desc, montant });
                    tDeb += montant;
                }
            });

            if (!credits.length && !debits.length) {
                return alert("La liste est vide. Ajoutez au moins une ligne d'opération.");
            }

            // — Collecte billetage
            const billets = {};
            let billetTotal = 0;
            billetGrid?.querySelectorAll('input[data-val]').forEach(input => {
                const nb  = parseInt(input.value) || 0;
                const val = parseInt(input.dataset.val);
                if (nb > 0) {
                    billets[val] = nb;
                    billetTotal += nb * val;
                }
            });

            // — Construction de l'objet Firestore
            const data = {
                datePeriode:   periodeDate,
                dateCreation:  new Date().toISOString(),
                credits,
                debits,
                billets,
                totaux: {
                    om:           tOM,
                    wave:         tWave,
                    espece:       tEsp,
                    virement:     tVir,
                    totalCredit:  tOM + tWave + tEsp + tVir,
                    totalDebit:   tDeb,
                    solde:        (tOM + tWave + tEsp + tVir) - tDeb,
                    billetTotal,
                    ecartBillet:  billetTotal - tEsp,
                },
                auteur: sessionStorage.getItem('userName') || 'Utilisateur JB',
            };

            // — Sauvegarde
            btnSave.disabled     = true;
            btnSave.textContent  = 'Enregistrement…';

            try {
                await addDoc(collection(db, 'jb_periodes'), data);

                const toast = document.getElementById('toast');
                if (toast) {
                    toast.textContent = `✓ Période du ${periodeDate} enregistrée avec succès !`;
                    toast.className   = 'toast success';
                    setTimeout(() => toast.classList.add('hidden'), 3500);
                }

                resetForm();
                document.querySelector('.nav-btn[data-view="dashboard"]')?.click();

            } catch (err) {
                console.error('Erreur Firestore JB:', err);
                alert('Erreur lors de l\'enregistrement : ' + err.message);
            } finally {
                btnSave.disabled    = false;
                btnSave.innerHTML   = `
                    <svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:var(--navy);margin-right:4px;">
                        <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>
                    </svg>
                    Enregistrer la période`;
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

            if (snap.empty) {
                historiqueList.innerHTML = '<p class="empty-msg">Aucune période enregistrée pour le moment.</p>';
                return;
            }

            snap.forEach(doc => {
                const d = doc.data();
                const label = d.datePeriode
                    ? new Date(d.datePeriode).toLocaleDateString('fr-FR')
                    : '—';
                const t = d.totaux || {};

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
                historiqueList.appendChild(card);
            });
        });
    }

}); // End DOMContentLoaded