import { db } from '../../../firebase-config.js';
import { collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { CONSTANTS } from '../../../constants.js';
import { isEurAgency } from '../../../agency-money.js';
import { createApp, ref, computed, onMounted, onUnmounted } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";

export const FinanceCaisseView = {
    vueApp: null,

    render(app) {
        const globalApp = app;

        const html = `
            <style>[v-cloak] { display: none; }</style>
            <div id="vue-caisse-app" class="page" v-cloak>
                <div class="factures-header" style="background: white; border-radius: 16px; margin-bottom: 24px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                    <div class="factures-header__content" style="display: flex; align-items: center; gap: 20px; padding: 20px 24px; flex-wrap: wrap;">
                        <div class="factures-header__icon" style="font-size: 32px; background: #ecfccb; color: #d97706; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 14px;">💶</div>
                        <div class="factures-header__info" style="flex: 1;">
                            <h1 class="factures-header__title" style="margin: 0; font-size: 22px; font-weight: 700; color: #0f172a;">Caisse Globale (Paris)</h1>
                            <p class="factures-header__subtitle" style="margin: 4px 0 0 0; font-size: 13px; color: #64748b;">Vue d'ensemble des encaissements et décaissements en Euros</p>
                        </div>
                    </div>
                </div>

                <div class="stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); margin-bottom: 24px;">
                    <div class="stat-card" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; border: none;">
                        <div class="stat-label" style="color: rgba(255,255,255,0.8); font-size: 13px;">Total Encaissements</div>
                        <div class="stat-value" style="color: white; font-size: 32px;">{{ formatMoney(totalIn) }}</div>
                    </div>
                    <div class="stat-card" style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; border: none;">
                        <div class="stat-label" style="color: rgba(255,255,255,0.8); font-size: 13px;">Total Dépenses</div>
                        <div class="stat-value" style="color: white; font-size: 32px;">{{ formatMoney(totalOut) }}</div>
                    </div>
                    <div class="stat-card" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; border: none;">
                        <div class="stat-label" style="color: rgba(255,255,255,0.8); font-size: 13px;">Solde Caisse</div>
                        <div class="stat-value" style="color: white; font-size: 32px;">{{ formatMoney(balance) }}</div>
                    </div>
                </div>

                <div class="factures-table-card" style="background: white; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden;">
                    <div style="padding: 20px; border-bottom: 1px solid #e2e8f0; background: #f8fafc;">
                        <h3 style="margin: 0; font-size: 16px; color: #1e293b;">📋 Historique des dernières opérations</h3>
                    </div>
                    <div class="table-wrap" style="overflow-x: auto;">
                        <table class="factures-table table-as-cards" style="width: 100%; border-collapse: collapse;">
                            <thead style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                                <tr>
                                    <th style="padding: 16px 12px; text-align: left; font-size: 12px; color: #475569; text-transform: uppercase;">Date</th>
                                    <th style="padding: 16px 12px; text-align: left; font-size: 12px; color: #475569; text-transform: uppercase;">Libellé</th>
                                    <th style="padding: 16px 12px; text-align: center; font-size: 12px; color: #475569; text-transform: uppercase;">Type</th>
                                    <th style="padding: 16px 12px; text-align: right; font-size: 12px; color: #475569; text-transform: uppercase;">Montant</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-if="loading"><td colspan="4" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</td></tr>
                                <tr v-else-if="operations.length === 0"><td colspan="4" style="text-align: center; padding: 40px; color: #64748b;">Aucune opération trouvée.</td></tr>
                                <tr v-else v-for="op in operations.slice(0, 100)" :key="op.id">
                                    <td data-label="Date" style="padding: 14px 12px;">{{ formatDate(op.date) }}</td>
                                    <td data-label="Libellé" style="padding: 14px 12px; font-weight: 600; color: #0f172a;">{{ op.label }}</td>
                                    <td data-label="Type" style="padding: 14px 12px; text-align: center;">
                                        <span class="badge" :style="op.type === 'Entrée' ? 'background:#dcfce7; color:#10b981;' : 'background:#fee2e2; color:#ef4444;'">{{ op.type }}</span>
                                    </td>
                                    <td data-label="Montant" style="padding: 14px 12px; text-align: right; font-weight: bold;" :style="op.type === 'Entrée' ? 'color:#10b981;' : 'color:#ef4444;'">
                                        {{ op.type === 'Entrée' ? '+' : '-' }} {{ formatMoney(op.amount) }}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('contentContainer').innerHTML = html;
        this.initVue(globalApp);
    },

    initVue(globalApp) {
        if (this.vueApp) this.vueApp.unmount();

        this.vueApp = createApp({
            setup() {
                const operations = ref([]);
                const loading = ref(true);
                
                const totalIn = ref(0);
                const totalOut = ref(0);
                
                let unsubTrans = null;
                let unsubExp = null;
                
                const formatMoney = (amount) => globalApp.formatMoney(amount);
                const formatDate = (dateString) => dateString ? new Date(dateString).toLocaleDateString('fr-FR') : '-';

                const balance = computed(() => totalIn.value - totalOut.value);

                onMounted(() => {
                    const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
                    const TAUX = isEurAgency() ? CONSTANTS.TAUX_CONVERSION : 1; // route-aware : ÷ taux uniquement pour Paris (€)
                    
                    let transList = [];
                    let expList = [];
                    
                    const mergeData = () => {
                        let inSum = 0;
                        let outSum = 0;
                        let ops = [];
                        
                        transList.forEach(t => {
                            const amountEUR = (parseFloat(t.montantParis) || 0) / TAUX; 
                            if (amountEUR > 0) {
                                inSum += amountEUR;
                                ops.push({ id: `t_${t.id}`, date: t.date, label: `Encaissement ${t.reference} - ${t.nom || ''}`, type: 'Entrée', amount: amountEUR, ts: new Date(t.date).getTime() });
                            }
                        });
                        
                        expList.forEach(e => {
                            const amountEUR = parseFloat(e.montant) || 0;
                            if (amountEUR > 0) {
                                outSum += amountEUR;
                                ops.push({ id: `e_${e.id}`, date: e.date, label: e.description || 'Dépense', type: 'Sortie', amount: amountEUR, ts: new Date(e.date).getTime() });
                            }
                        });
                        
                        ops.sort((a, b) => b.ts - a.ts);
                        operations.value = ops;
                        totalIn.value = inSum;
                        totalOut.value = outSum;
                        loading.value = false;
                    };

                    unsubTrans = onSnapshot(query(collection(db, "transactions"), where("agency", "==", activeAgency), where("isDeleted", "==", false)), snap => {
                        transList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                        if (!loading.value || expList.length > 0) mergeData();
                    });

                    unsubExp = onSnapshot(query(collection(db, "expenses"), where("agency", "==", activeAgency), where("isDeleted", "==", false)), snap => {
                        expList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                        mergeData(); // Toujours appeler mergeData car on a besoin des deux pour enlever le loading complet
                    });
                });

                onUnmounted(() => {
                    if (unsubTrans) unsubTrans();
                    if (unsubExp) unsubExp();
                });

                return { operations, loading, totalIn, totalOut, balance, formatMoney, formatDate };
            }
        });

        this.vueApp.mount('#vue-caisse-app');
    }
};