import { db } from '../../firebase-config.js';
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { CONSTANTS } from '../../constants.js';
import { getCollectionName, AGENCIES } from '../../agencies-config.js';
import { matchesShippingMode } from '../../shipping-mode.js';
import { paidAmount } from '../../agency-money.js';

import { formatMoney, isEurAgency } from '../services/format.js';

export const DailyBilanView = {
    formatMoneyLocal(amount) { return formatMoney(amount); },

    render(app, container) {
        this.app = app;
        const today = new Date().toISOString().split('T')[0];
        const isEur = isEurAgency();
        const currSymbol = isEur ? '€' : 'CFA';

        const html = `
            <div style="max-width: 1200px; margin: 0 auto; animation: fadeIn 0.3s ease;">
                <div style="display: flex; justify-content: space-between; align-items: center; background: white; padding: 20px 25px; border-radius: 16px; margin-bottom: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; flex-wrap: wrap; gap: 15px;">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <div style="background: #eff6ff; color: #3b82f6; width: 50px; height: 50px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px;"><i class="fas fa-calendar-day"></i></div>
                        <div>
                            <h2 style="margin: 0; color: #0f172a; font-size: 22px;">Bilan du Jour</h2>
                            <p style="margin: 4px 0 0 0; color: #64748b; font-size: 13px;">Récapitulatif financier et logistique de la journée</p>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <input type="date" id="bilanDate" value="${today}" style="padding: 10px 15px; border: 1px solid #cbd5e1; border-radius: 8px; font-weight: 600;" onchange="window.app.views.dailyBilan.loadData(this.value)">
                        <button class="btn btn-primary" onclick="window.app.views.dailyBilan.loadData(document.getElementById('bilanDate').value)"><i class="fas fa-sync"></i> Actualiser</button>
                    </div>
                </div>

                <div class="amt-kpi-grid" style="margin-bottom: 24px;">
                    <div class="amt-kpi amt-kpi-green">
                        <div class="amt-kpi-title">Total Encaissé</div>
                        <div class="amt-kpi-value" id="b-encaisse">0 ${currSymbol}</div>
                        <div class="amt-kpi-mark">💰</div>
                    </div>
                    <div class="amt-kpi amt-kpi-red">
                        <div class="amt-kpi-title">Total Dépenses</div>
                        <div class="amt-kpi-value" id="b-depenses">0 ${currSymbol}</div>
                        <div class="amt-kpi-mark">📉</div>
                    </div>
                    <div class="amt-kpi amt-kpi-deep">
                        <div class="amt-kpi-title">Solde Net du jour</div>
                        <div class="amt-kpi-value" id="b-solde">0 ${currSymbol}</div>
                        <div class="amt-kpi-mark">🏆</div>
                    </div>
                    <div class="amt-kpi amt-kpi-purple">
                        <div class="amt-kpi-title">Colis Traités</div>
                        <div class="amt-kpi-value" id="b-colis">0</div>
                        <div class="amt-kpi-mark">📦</div>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px;">
                    <div class="form-card" style="padding: 0; overflow: hidden;">
                        <h3 style="padding: 20px; margin: 0; border-bottom: 1px solid #e2e8f0; background: #f8fafc; display: flex; align-items: center; gap: 8px;"><i class="fas fa-money-bill-wave" style="color: #10b981;"></i> Encaissements</h3>
                        <table class="data-table hide-on-mobile">
                            <thead><tr><th>Réf</th><th>Client</th><th style="text-align:right;">Montant</th></tr></thead>
                            <tbody id="b-encaisse-table"><tr><td colspan="3" style="text-align:center;">Chargement...</td></tr></tbody>
                        </table>
                        <div class="show-on-mobile" id="b-encaisse-cards" style="padding: 10px;"></div>
                    </div>
                    <div class="form-card" style="padding: 0; overflow: hidden;">
                        <h3 style="padding: 20px; margin: 0; border-bottom: 1px solid #e2e8f0; background: #f8fafc; display: flex; align-items: center; gap: 8px;"><i class="fas fa-receipt" style="color: #ef4444;"></i> Dépenses</h3>
                        <table class="data-table hide-on-mobile">
                            <thead><tr><th>Catégorie</th><th>Motif</th><th style="text-align:right;">Montant</th></tr></thead>
                            <tbody id="b-depense-table"><tr><td colspan="3" style="text-align:center;">Chargement...</td></tr></tbody>
                        </table>
                        <div class="show-on-mobile" id="b-depense-cards" style="padding: 10px;"></div>
                    </div>
                </div>
            </div>
        `;
        if (container) container.innerHTML = html;
        else document.getElementById('contentContainer').innerHTML = html;
        
        window.app.views = window.app.views || {};
        window.app.views.dailyBilan = this;
        this.loadData(today);
    },

    async loadData(date) {
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'abidjan';
        const isEur = isEurAgency();
        const TAUX = isEur ? CONSTANTS.TAUX_CONVERSION : 1;
        // Route-aware (cohérent avec « Toutes les factures ») : agence
        // d'arrivée -> toute la collection de la route ; départ -> les siennes.
        const isArrival = activeAgency === 'all'
            || (AGENCIES[activeAgency] && AGENCIES[activeAgency].type === 'arrival');

        try {
            // 1. Transactions (Encaissements)
            const qTrans = isArrival
                ? query(collection(db, getCollectionName("transactions")), where("date", "==", date), where("isDeleted", "==", false))
                : query(collection(db, getCollectionName("transactions")), where("date", "==", date), where("agency", "==", activeAgency), where("isDeleted", "==", false));
            const snapTrans = await getDocs(qTrans);
            let encaissements = [];
            let totalEncaisse = 0;
            
            snapTrans.forEach(doc => {
                const t = doc.data();
                if (!matchesShippingMode(t)) return; // dissocie maritime / aérien
                let mnt = paidAmount(t); // route-aware (départ=montantParis, arrivée=montantAbidjan)
                mnt = mnt / TAUX;
                if (mnt > 0) { totalEncaisse += mnt; encaissements.push({ ref: t.reference, nom: t.nom, mnt }); }
            });
            
            // 2. Dépenses
            const qDep = query(collection(db, getCollectionName("expenses")), where("date", "==", date), where("agency", "==", activeAgency));
            const snapDep = await getDocs(qDep);
            let depenses = [];
            let totalDepense = 0;
            snapDep.forEach(doc => {
                const d = doc.data();
                if (d.isDeleted) return; 
                let mnt = parseFloat(d.amount || d.montant) || 0;
                mnt = mnt / TAUX;
                totalDepense += mnt; depenses.push({ cat: d.category || d.type, desc: d.description, mnt });
            });

            // 3. Livraisons (Colis livrés/scannés ce jour là)
            const qLiv = isArrival
                ? query(collection(db, getCollectionName("livraisons")))
                : query(collection(db, getCollectionName("livraisons")), where("agency", "==", activeAgency));
            const qArchive = isArrival
                ? query(collection(db, getCollectionName("livraisons_archives")))
                : query(collection(db, getCollectionName("livraisons_archives")), where("agency", "==", activeAgency));
            
            const [snapLiv, snapArchive] = await Promise.all([getDocs(qLiv), getDocs(qArchive)]);
            
            let totalLivres = 0;
            if (isEur) {
                totalLivres = snapLiv.docs.filter(d => matchesShippingMode(d.data()) && (d.data().dateAjout || '').startsWith(date)).length;
            } else {
                totalLivres = snapLiv.docs.filter(d => matchesShippingMode(d.data()) && d.data().status === 'LIVRE' && (d.data().dateLivraison || '').startsWith(date)).length;
                totalLivres += snapArchive.docs.filter(d => matchesShippingMode(d.data()) && d.data().status === 'LIVRE' && (d.data().dateLivraison || '').startsWith(date)).length;
            }

            const encaisseEl = document.getElementById('b-encaisse');
            if (!encaisseEl) return; 

            encaisseEl.textContent = this.formatMoneyLocal(totalEncaisse);
            document.getElementById('b-depenses').textContent = this.formatMoneyLocal(totalDepense);
            document.getElementById('b-solde').textContent = this.formatMoneyLocal(totalEncaisse - totalDepense);
            document.getElementById('b-colis').textContent = totalLivres;

            document.getElementById('b-encaisse-table').innerHTML = encaissements.length ? encaissements.map(e => `<tr><td><b>${e.ref}</b></td><td>${e.nom}</td><td style="text-align:right; font-weight:bold; color:#10b981;">${this.formatMoneyLocal(e.mnt)}</td></tr>`).join('') : `<tr><td colspan="3" style="text-align:center;">Aucun encaissement</td></tr>`;
            document.getElementById('b-depense-table').innerHTML = depenses.length ? depenses.map(e => `<tr><td><span class="badge" style="background:#f1f5f9; color:#475569;">${e.cat || 'Dépense'}</span></td><td>${e.desc}</td><td style="text-align:right; font-weight:bold; color:#ef4444;">${this.formatMoneyLocal(e.mnt)}</td></tr>`).join('') : `<tr><td colspan="3" style="text-align:center;">Aucune dépense</td></tr>`;

            // Fiches compactes (mobile) : 2 lignes par entrée.
            const encCards = document.getElementById('b-encaisse-cards');
            if (encCards) encCards.innerHTML = encaissements.length ? encaissements.map(e => `<div class="comm-mob-card"><div class="comm-mob-l1"><strong>${e.ref}</strong><span style="color:#10b981; font-weight:800;">${this.formatMoneyLocal(e.mnt)}</span></div><div class="comm-mob-l2"><span>${e.nom || '-'}</span></div></div>`).join('') : `<div style="text-align:center; padding:16px; color:#94a3b8;">Aucun encaissement</div>`;
            const depCards = document.getElementById('b-depense-cards');
            if (depCards) depCards.innerHTML = depenses.length ? depenses.map(e => `<div class="comm-mob-card"><div class="comm-mob-l1"><span class="badge" style="background:#f1f5f9; color:#475569;">${e.cat || 'Dépense'}</span><span style="color:#ef4444; font-weight:800;">${this.formatMoneyLocal(e.mnt)}</span></div><div class="comm-mob-l2"><span>${e.desc || '-'}</span></div></div>`).join('') : `<div style="text-align:center; padding:16px; color:#94a3b8;">Aucune dépense</div>`;

        } catch(e) { console.error("Erreur Bilan:", e); this.app.showToast("Erreur de chargement", "error"); }
    }
};