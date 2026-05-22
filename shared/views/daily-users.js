import { db } from '../../firebase-config.js';
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { CONSTANTS } from '../../constants.js';
import { getCollectionName, AGENCIES } from '../../agencies-config.js';
import { matchesShippingMode } from '../../shipping-mode.js';
import { paidAmount } from '../../agency-money.js';

// EUR si agence historique 'paris' OU route SaaS dont la devise configurée
// est EUR. (Même règle que app.formatMoneyLocal — cohérence d'affichage.)
const isEurAgency = () => {
    const ag = sessionStorage.getItem('currentActiveAgency') || 'abidjan';
    if (ag === 'paris') return true;
    const a = AGENCIES && AGENCIES[ag];
    return !!(a && a.currency === 'EUR');
};

export const DailyUsersView = {
    formatMoneyLocal(amount) {
        const isEur = isEurAgency();
        if (isEur) {
            return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount || 0).replace(/[\u202F\u00A0]/g, ' ').replace(/\s*\/\s*/g, ' ');
        } else {
            return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(amount || 0).replace(/[\u202F\u00A0]/g, ' ').replace(/\s*\/\s*/g, ' ');
        }
    },

    render(app, container) {
        this.app = app;
        const today = new Date().toISOString().split('T')[0];
        const isEur = isEurAgency();
        const currSymbol = isEur ? '€' : 'CFA';

        const html = `
            <div style="max-width: 1200px; margin: 0 auto; animation: fadeIn 0.3s ease;">
                <div style="display: flex; justify-content: space-between; align-items: center; background: white; padding: 20px 25px; border-radius: 16px; margin-bottom: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; flex-wrap: wrap; gap: 15px;">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <div style="background: #f5f3ff; color: #8b5cf6; width: 50px; height: 50px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px;"><i class="fas fa-users"></i></div>
                        <div>
                            <h2 style="margin: 0; color: #0f172a; font-size: 22px;">Bilan par Utilisateurs</h2>
                            <p style="margin: 4px 0 0 0; color: #64748b; font-size: 13px;">Activité et encaissements par agent</p>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <input type="date" id="uDate" value="${today}" style="padding: 10px 15px; border: 1px solid #cbd5e1; border-radius: 8px; font-weight: 600;" onchange="window.app.views.dailyUsers.loadData(this.value)">
                        <button class="btn btn-primary" onclick="window.app.views.dailyUsers.loadData(document.getElementById('uDate').value)"><i class="fas fa-sync"></i></button>
                    </div>
                </div>

                <div class="form-card" style="padding: 0; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                    <table class="data-table hide-on-mobile">
                        <thead>
                            <tr>
                                <th>Utilisateur</th>
                                <th>Rôle estimé</th>
                                <th style="text-align:right;">Nb Transactions</th>
                                <th style="text-align:right;">Total Encaissé (${currSymbol})</th>
                                <th style="text-align:right;">Colis Traités</th>
                            </tr>
                        </thead>
                        <tbody id="u-tableBody">
                            <tr><td colspan="5" style="text-align:center; padding: 40px;">Chargement...</td></tr>
                        </tbody>
                    </table>
                    <div class="show-on-mobile" id="u-cards" style="padding: 10px;"></div>
                </div>
            </div>
        `;
        if (container) container.innerHTML = html;
        else document.getElementById('contentContainer').innerHTML = html;

        window.app.views = window.app.views || {};
        window.app.views.dailyUsers = this;
        this.loadData(today);
    },

    async loadData(date) {
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'abidjan';
        const isEur = isEurAgency();
        // Route-aware (cohérent avec « Toutes les factures »).
        const isArrival = activeAgency === 'all'
            || (AGENCIES[activeAgency] && AGENCIES[activeAgency].type === 'arrival');
        const TAUX = isEur ? CONSTANTS.TAUX_CONVERSION : 1;

        try {
            const usersMap = new Map();
            const getUser = (name) => {
                const n = name || 'Système';
                if (!usersMap.has(n)) usersMap.set(n, { transCount: 0, collected: 0, deliveries: 0 });
                return usersMap.get(n);
            };

            // Transactions
            const qTrans = isArrival
                ? query(collection(db, getCollectionName("transactions")), where("date", "==", date), where("isDeleted", "==", false))
                : query(collection(db, getCollectionName("transactions")), where("date", "==", date), where("agency", "==", activeAgency), where("isDeleted", "==", false));
            const snapTrans = await getDocs(qTrans);
            snapTrans.forEach(doc => {
                const t = doc.data();
                if (!matchesShippingMode(t)) return; // dissocie maritime / aérien
                const agent = t.saisiPar || 'Inconnu';
                let mnt = paidAmount(t); // route-aware (départ=montantParis, arrivée=montantAbidjan)
                mnt = mnt / TAUX;

                if (mnt > 0 || t.reste !== undefined) {
                    const u = getUser(agent);
                    u.transCount++;
                    u.collected += mnt;
                }
            });

            // Livraisons
            const qLiv = isArrival
                ? query(collection(db, getCollectionName("livraisons")))
                : query(collection(db, getCollectionName("livraisons")), where("agency", "==", activeAgency));
            const qArchive = isArrival
                ? query(collection(db, getCollectionName("livraisons_archives")))
                : query(collection(db, getCollectionName("livraisons_archives")), where("agency", "==", activeAgency));
            
            const [snapLiv, snapArchive] = await Promise.all([getDocs(qLiv), getDocs(qArchive)]);
            
            const processDeliveries = (snap) => {
                snap.forEach(doc => {
                    const l = doc.data();
                    if (!matchesShippingMode(l)) return; // dissocie maritime / aérien
                    if (isEur) {
                        if ((l.dateAjout || '').startsWith(date)) {
                            const livreur = l.saisiPar || l.agent || 'Inconnu';
                            getUser(livreur).deliveries++;
                        }
                    } else {
                        if (l.status === 'LIVRE' && l.dateLivraison && l.dateLivraison.startsWith(date)) {
                            const livreur = l.livreur || 'Inconnu';
                            getUser(livreur).deliveries++;
                        }
                    }
                });
            };
            
            processDeliveries(snapLiv);
            processDeliveries(snapArchive);

            const tbody = document.getElementById('u-tableBody');
            if (!tbody) return; 
            if (usersMap.size === 0) { tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Aucune activité ce jour.</td></tr>`; return; }

            const sortedUsers = Array.from(usersMap.entries()).sort((a,b) => b[1].collected - a[1].collected);
            tbody.innerHTML = sortedUsers.map(([name, stats]) => `
                <tr>
                    <td><b>${name}</b></td>
                    <td><span class="badge" style="background:#f1f5f9; color:#475569;">${stats.deliveries > 0 ? (isEur ? 'Agent' : 'Livreur') : 'Agent de Saisie'}</span></td>
                    <td style="text-align:right;">${stats.transCount}</td>
                    <td style="text-align:right; font-weight:bold; color:#10b981;">${this.formatMoneyLocal(stats.collected)}</td>
                    <td style="text-align:right; font-weight:bold; color:#3b82f6;">${stats.deliveries}</td>
                </tr>
            `).join('');

            // Fiches compactes (mobile) : 2 lignes par utilisateur.
            const uCards = document.getElementById('u-cards');
            if (uCards) uCards.innerHTML = sortedUsers.map(([name, stats]) => `
                <div class="comm-mob-card">
                    <div class="comm-mob-l1">
                        <strong>${name}</strong>
                        <span style="color:#10b981; font-weight:800;">${this.formatMoneyLocal(stats.collected)}</span>
                    </div>
                    <div class="comm-mob-l2">
                        <span class="badge" style="background:#f1f5f9; color:#475569;">${stats.deliveries > 0 ? (isEur ? 'Agent' : 'Livreur') : 'Agent de Saisie'}</span>
                        <span><i class="fas fa-receipt"></i> ${stats.transCount} trans.</span>
                        <span style="color:#3b82f6;"><i class="fas fa-box"></i> ${stats.deliveries} colis</span>
                    </div>
                </div>
            `).join('');
        } catch(e) { console.error(e); this.app.showToast("Erreur", "error"); }
    }
};