import { db } from '../../firebase-config.js';
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { CONSTANTS } from '../../constants.js';
import { getCollectionName, AGENCIES } from '../../agencies-config.js';
import { matchesShippingMode } from '../../shipping-mode.js';
import { paidAmount } from '../../agency-money.js';

export const StatistiquesView = {
    chartInstance: null,

    formatMoneyLocal(amount) {
        const isEur = (sessionStorage.getItem('currentActiveAgency') || 'abidjan') === 'paris';
        if (isEur) {
            return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount || 0).replace(/[\u202F\u00A0]/g, ' ').replace(/\s*\/\s*/g, ' ');
        } else {
            return new Intl.NumberFormat('fr-CI', { style: 'currency', currency: 'XOF' }).format(amount || 0).replace(/[\u202F\u00A0]/g, ' ').replace(/\s*\/\s*/g, ' ');
        }
    },

    render(app, container, mode = 'monthly') {
        // Si le 2ème argument est une chaîne, c'est qu'il s'agit du mode et non du conteneur
        if (typeof container === 'string') {
            mode = container;
            container = null;
        }
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.statistiques = this;

        const isEur = (sessionStorage.getItem('currentActiveAgency') || 'abidjan') === 'paris';
        const currSymbol = isEur ? '€' : 'CFA';
        const title = mode === 'monthly' ? 'Statistiques Mensuelles' : (mode === 'yearly' ? 'Statistiques Annuelles' : 'Statistiques par Bateau/Conteneur');

        const html = `
            <div style="max-width: 1200px; margin: 0 auto; animation: fadeIn 0.3s ease;">
                <div style="display: flex; justify-content: space-between; align-items: center; background: white; padding: 20px 25px; border-radius: 16px; margin-bottom: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; flex-wrap: wrap; gap: 15px;">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <div style="background: #fffbeb; color: #d97706; width: 50px; height: 50px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px;"><i class="fas fa-chart-bar"></i></div>
                        <div>
                            <h2 style="margin: 0; color: #0f172a; font-size: 22px;">${title}</h2>
                            <p style="margin: 4px 0 0 0; color: #64748b; font-size: 13px;">Analyse globale de l'agence</p>
                        </div>
                    </div>
                    <div>
                        <button class="btn btn-outline" onclick="window.app.renderPage('stats-monthly')" ${mode==='monthly'?'style="background:#f1f5f9;"':''}>Mois</button>
                        <button class="btn btn-outline" onclick="window.app.renderPage('stats-yearly')" ${mode==='yearly'?'style="background:#f1f5f9;"':''}>Année</button>
                        <button class="btn btn-outline" onclick="window.app.renderPage('stats-boat')" ${mode==='boat'?'style="background:#f1f5f9;"':''}>Conteneurs</button>
                    </div>
                </div>

                <div class="form-card" style="box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                    <h3 style="margin-top:0;">Évolution des Encaissements</h3>
                    <div style="position: relative; height: 400px; width: 100%;">
                        <canvas id="statsCanvas"></canvas>
                    </div>
                </div>
            </div>
        `;
        if (container) container.innerHTML = html;
        else document.getElementById('contentContainer').innerHTML = html;
        
        this.loadData(mode, currSymbol);
    },

    async loadData(mode, currSymbol) {
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'abidjan';
        const isEur = activeAgency === 'paris';
        const TAUX = isEur ? CONSTANTS.TAUX_CONVERSION : 1;
        
        // Route-aware (cohérent avec « Toutes les factures ») : une agence
        // d'arrivée voit TOUTES les transactions de la collection de sa route ;
        // une agence de départ ne voit que les siennes.
        const isArrival = activeAgency === 'all'
            || (AGENCIES[activeAgency] && AGENCIES[activeAgency].type === 'arrival');
        const qTrans = isArrival
            ? query(collection(db, getCollectionName("transactions")), where("isDeleted", "==", false))
            : query(collection(db, getCollectionName("transactions")), where("agency", "==", activeAgency), where("isDeleted", "==", false));
        
        try {
            const snap = await getDocs(qTrans);
            const dataMap = {};

            snap.forEach(doc => {
                const t = doc.data();
                if (!matchesShippingMode(t)) return; // dissocie maritime / aérien
                let mnt = paidAmount(t); // route-aware (départ=montantParis, arrivée=montantAbidjan)
                mnt = mnt / TAUX;
                
                let key = 'Inconnu';
                if (mode === 'monthly') {
                    if (t.date && t.date.length >= 7) key = t.date.substring(0, 7); // YYYY-MM
                } else if (mode === 'yearly') {
                    if (t.date && t.date.length >= 4) key = t.date.substring(0, 4); // YYYY
                } else if (mode === 'boat') {
                    key = t.conteneur || 'SANS CONTENEUR';
                }

                if (!dataMap[key]) dataMap[key] = 0;
                dataMap[key] += mnt;
            });

            const sortedKeys = Object.keys(dataMap).sort();
            const values = sortedKeys.map(k => dataMap[k]);

            this.renderChart(sortedKeys, values, mode, currSymbol);

        } catch(e) { console.error(e); }
    },

    renderChart(labels, data, mode, currSymbol) {
        const ctx = document.getElementById('statsCanvas');
        if (!ctx) return;
        
        if (this.chartInstance) this.chartInstance.destroy();

        const formatLabels = labels.map(l => {
            if (mode === 'monthly') return new Date(l+'-01').toLocaleDateString('fr-FR', {month:'short', year:'numeric'});
            return l;
        });

        this.chartInstance = new Chart(ctx, {
            type: mode === 'boat' ? 'bar' : 'line',
            data: {
                labels: formatLabels,
                datasets: [{
                    label: `Total Encaissé (${currSymbol})`,
                    data: data,
                    backgroundColor: 'rgba(16, 185, 129, 0.2)',
                    borderColor: '#10b981',
                    borderWidth: 2,
                    fill: true, tension: 0.3
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
};