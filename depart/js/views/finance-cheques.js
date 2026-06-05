import { db } from '../../../firebase-config.js';
import { collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { CONSTANTS } from '../../../constants.js';
import { createApp, ref, onMounted, onUnmounted } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";
import { getCollectionName } from '../../../agencies-config.js';

export const FinanceChequesView = {
    vueApp: null,

    render(app) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.financeCheques = this;

        const html = `
            <style>[v-cloak] { display: none; }</style>
            <div id="vue-finance-cheques" class="page" v-cloak>
                <div class="factures-header" style="background: white; border-radius: 16px; margin-bottom: 24px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                    <div class="factures-header__content" style="display: flex; align-items: center; gap: 20px; padding: 20px 24px; flex-wrap: wrap;">
                        <div class="factures-header__icon" style="font-size: 32px; background: #f3f4f6; color: #475569; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 14px;">🧾</div>
                        <div class="factures-header__info" style="flex: 1;">
                            <h1 class="factures-header__title" style="margin: 0; font-size: 22px; font-weight: 700; color: #0f172a;">Liste des chèques</h1>
                            <p class="factures-header__subtitle" style="margin: 4px 0 0 0; font-size: 13px; color: #64748b;">Suivi des factures réglées par chèque</p>
                        </div>
                    </div>
                </div>

                <div class="factures-table-card" style="background: white; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                    <div class="table-wrap hide-on-mobile" style="overflow-x: auto;">
                        <table class="factures-table" style="width: 100%; border-collapse: collapse;">
                            <thead style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                                <tr>
                                    <th style="padding: 16px 12px; text-align: left; font-size: 12px; color: #475569; text-transform: uppercase;">Date</th>
                                    <th style="padding: 16px 12px; text-align: left; font-size: 12px; color: #475569; text-transform: uppercase;">Facture</th>
                                    <th style="padding: 16px 12px; text-align: left; font-size: 12px; color: #475569; text-transform: uppercase;">Client</th>
                                    <th style="padding: 16px 12px; text-align: right; font-size: 12px; color: #475569; text-transform: uppercase;">Montant Chèque</th>
                                    <th style="padding: 16px 12px; text-align: center; font-size: 12px; color: #475569; text-transform: uppercase;">Statut Enregistrement</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-if="loading"><td colspan="5" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</td></tr>
                                <tr v-else-if="cheques.length === 0"><td colspan="5" style="text-align: center; padding: 40px; color: #64748b;">Aucun chèque enregistré.</td></tr>
                                <tr v-else v-for="c in cheques" :key="c.id">
                                    <td style="padding: 14px 12px;">{{ formatDate(c.date) }}</td>
                                    <td style="padding: 14px 12px; font-weight: bold; color: #3b82f6;">{{ c.reference || '-' }}</td>
                                    <td style="padding: 14px 12px; font-weight: 600; color: #0f172a;">{{ c.nom || '-' }}</td>
                                    <td style="padding: 14px 12px; text-align: right; font-weight: bold; color: #0f172a;">{{ formatMoney(c.montantParis / TAUX) }}</td>
                                    <td style="padding: 14px 12px; text-align: center;"><span class="badge" style="background:#d1fae5; color:#065f46;">✔ Validé en Caisse</span></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div class="show-on-mobile">
                        <div v-if="loading" style="text-align:center; padding:30px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>
                        <div v-else-if="cheques.length === 0" style="text-align:center; padding:30px; color:#64748b;">Aucun chèque enregistré.</div>
                        <div v-else v-for="c in cheques" :key="'m'+c.id" class="comm-mob-card">
                            <div class="comm-mob-l1">
                                <strong style="color:#3b82f6;">{{ c.reference || '-' }}</strong>
                                <span style="font-weight:800; white-space:nowrap;">{{ formatMoney(c.montantParis / TAUX) }}</span>
                            </div>
                            <div class="comm-mob-l2">
                                <span>{{ c.nom || '-' }}</span>
                                <span>{{ formatDate(c.date) }}</span>
                                <span class="badge" style="background:#d1fae5; color:#065f46;">✔ Validé</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('contentContainer').innerHTML = html;
        this.initVue();
    },

    initVue() {
        if (this.vueApp) this.vueApp.unmount();
        const globalApp = this.app;

        this.vueApp = createApp({
            setup() {
                const cheques = ref([]);
                const loading = ref(true);
                let unsub = null;

                const formatMoney = (amount) => globalApp.formatMoney(amount);
                const formatDate = (dateString) => dateString ? new Date(dateString).toLocaleDateString('fr-FR') : '-';

                onMounted(() => {
                    const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
                    const q = query(collection(db, getCollectionName("transactions")), where("agency", "==", activeAgency), where("modePaiement", "==", "CHEQUES"), where("isDeleted", "==", false));
                    
                    unsub = onSnapshot(q, snap => {
                        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                        data.sort((a, b) => new Date(b.date) - new Date(a.date));
                        cheques.value = data;
                        loading.value = false;
                    });
                });

                onUnmounted(() => {
                    if (unsub) unsub();
                });

                return { cheques, loading, formatMoney, formatDate, TAUX: CONSTANTS.TAUX_CONVERSION };
            }
        });

        this.vueApp.mount('#vue-finance-cheques');
    }
};