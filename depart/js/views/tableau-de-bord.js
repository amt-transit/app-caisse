import { CONSTANTS } from '../../../commun/constants.js';
import { db } from '../../../commun/firebase-config.js';
import { collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getCollectionName } from '../../../commun/agencies-config.js';
import { matchesShippingMode } from '../../../commun/shipping-mode.js';
import { isEurAgency } from '../../../commun/services/format.js';
import { createApp, ref, computed, onMounted, onUnmounted, nextTick } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";

export const DashboardView = {
    vueApp: null,

    render(app) {
        const globalApp = app;

        const html = `
            <style>
                [v-cloak] { display: none; }
                .dash-month-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
                .dash-month-select {
                    font-size: 13px; font-weight: 700; color: #1A3553;
                    background: #fff; border: 1.5px solid #e2e8f0; border-radius: 10px;
                    padding: 6px 30px 6px 12px; cursor: pointer; text-transform: capitalize;
                    box-shadow: 0 1px 2px rgba(11,37,64,0.06);
                    appearance: none; -webkit-appearance: none;
                    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%231A3553' stroke-width='3'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
                    background-repeat: no-repeat; background-position: right 10px center;
                }
                .dash-month-select:focus { outline: none; border-color: #1A3553; }
                @media (max-width: 640px) {
                    .dash-month-head { gap: 8px; }
                    .dash-month-select { font-size: 12px; padding: 5px 26px 5px 10px; }
                }
            </style>
            <div id="vue-dashboard" v-cloak>
                <div class="amt-section-label">🚀 Accès rapide</div>
                <div class="amt-quick-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(min(135px, 45%), 1fr)); gap: 12px; margin-bottom: 30px;">
                    <button v-if="checkAccess('invoice-new')" @click="renderPage('invoice-new')" class="amt-quick">
                        <div class="amt-quick-icon"><i class="fas fa-file-invoice"></i></div>
                        <span class="amt-quick-label">Nouvelle facture</span>
                    </button>
                    <button v-if="checkAccess('invoices-list')" @click="renderPage('invoices-list')" class="amt-quick">
                        <div class="amt-quick-icon"><i class="fas fa-list"></i></div>
                        <span class="amt-quick-label">Liste factures</span>
                    </button>
                    <button v-if="checkAccess('quote-new')" @click="renderPage('quote-new')" class="amt-quick">
                        <div class="amt-quick-icon"><i class="fas fa-file-signature"></i></div>
                        <span class="amt-quick-label">Nouveau devis</span>
                    </button>
                    <button v-if="checkAccess('appointments-pending')" @click="renderPage('appointments-pending')" class="amt-quick">
                        <div class="amt-quick-icon"><i class="fas fa-calendar-check"></i></div>
                        <span class="amt-quick-label">RDV à valider</span>
                    </button>
                    <button v-if="checkAccess('notifications')" @click="renderPage('notifications')" class="amt-quick">
                        <div class="amt-quick-icon"><i class="fas fa-bell"></i></div>
                        <span class="amt-quick-label">Notifications</span>
                    </button>
                </div>

                <div class="amt-section-label dash-month-head">
                    <span>📊 Indicateurs du mois</span>
                    <select v-model="selectedMonth" class="dash-month-select" title="Choisir le mois affiché">
                        <option v-for="m in availableMonths" :key="m.value" :value="m.value">{{ m.label }}</option>
                    </select>
                </div>
                <div class="amt-kpi-grid">
                    <div class="amt-kpi amt-kpi-deep" @click="renderPage('invoices-list')">
                        <div class="amt-kpi-title">Chiffre d'affaires facturé</div>
                        <div class="amt-kpi-value">{{ formatMoney(monthCA) }}</div>
                        <div class="amt-kpi-mark">💼</div>
                    </div>
                    <div class="amt-kpi amt-kpi-green" @click="renderPage('appointments-pending')">
                        <div class="amt-kpi-title">RDV en attente</div>
                        <div class="amt-kpi-value">{{ pendingAppointments }}</div>
                        <div class="amt-kpi-mark">📅</div>
                    </div>
                    <div class="amt-kpi amt-kpi-gold" @click="renderPage('program-history')">
                        <div class="amt-kpi-title">Chauffeurs en tournée</div>
                        <div class="amt-kpi-value">{{ activePrograms }}</div>
                        <div class="amt-kpi-mark">🚚</div>
                    </div>
                    <div class="amt-kpi amt-kpi-purple" @click="renderPage('loading-boats')">
                        <div class="amt-kpi-title">Conteneurs en mer</div>
                        <div class="amt-kpi-value">{{ activeContainers }}</div>
                        <div class="amt-kpi-mark">🚢</div>
                    </div>
                </div>

                <div class="dash-2col" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 25px; margin-bottom: 30px;">
                    <div style="background: white; border-radius: 16px; padding: 20px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                        <h3 style="margin: 0 0 20px; font-size: 16px;">📈 Évolution Facturation (Général)</h3>
                        <div class="dash-chart-box" style="position: relative; height: 250px; width: 100%;">
                            <canvas id="vueRevenueChart"></canvas>
                        </div>
                    </div>
                    
                    <div style="background: white; border-radius: 16px; padding: 20px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                        <h3 style="margin: 0 0 20px; font-size: 16px;">🧾 Dernières Factures</h3>
                        <div style="max-height: 250px; overflow-y: auto; padding-right: 5px;">
                            <div v-if="topInvoices.length === 0" style="color:#94a3b8; text-align:center; padding: 20px;">Aucune facture ce mois-ci.</div>
                            <div v-for="inv in topInvoices" :key="inv.id" style="display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f1f5f9; cursor: pointer;" @click="renderPage('invoices-list')">
                                <div><strong>{{ inv.reference }}</strong><br><span style="font-size:12px; color:#64748b;">{{ inv.nom }}</span></div>
                                <div style="text-align: right;"><strong>{{ formatMoney(inv.amountEur) }}</strong><br><span :class="['badge', inv.amountEur - inv.payeEur <= 0 ? 'badge-success' : 'badge-warning']">{{ inv.amountEur - inv.payeEur <= 0 ? 'Payée' : 'Impayée' }}</span></div>
                            </div>
                        </div>
                    </div>
                </div>

                <h3 style="margin: 0 0 20px 0; color: #0f172a; font-size: 20px; font-weight: 800;">🏆 Meilleurs agents (mois sélectionné)</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 15px; margin-bottom: 30px;">
                    <div v-if="topAgents.length === 0" style="grid-column: 1/-1; color:#94a3b8;">Pas de données pour le moment.</div>
                    <div v-for="(agent, i) in topAgents" :key="agent.name" style="background: white; padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0; display: flex; align-items: center; gap: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                        <div v-if="agent.photo" :style="{ backgroundImage: 'url(' + agent.photo + ')' }" style="width: 50px; height: 50px; border-radius: 50%; background-size: cover; background-position: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1); flex-shrink: 0;"></div>
                        <div v-else style="width: 50px; height: 50px; border-radius: 50%; background: #eff6ff; display: flex; justify-content: center; align-items: center; font-size: 20px; color: #3b82f6; flex-shrink: 0;"><i class="fas fa-user"></i></div>
                        <div style="flex: 1;">
                            <h4 style="margin: 0; color: #1e293b; font-size: 14px; text-transform: uppercase;">{{ agent.name }}</h4>
                            <p style="margin: 2px 0 0 0; color: #10b981; font-size: 12px; font-weight: bold;">{{ formatMoney(agent.amount) }}</p>
                        </div>
                        <div style="font-size: 20px;">
                            {{ i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉' }}
                        </div>
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
                // €/CFA route-aware : on ne divise par le taux QUE pour Paris
                // (seule zone €). Chine/Dakar... sont en CFA -> diviseur = 1.
                const TAUX = isEurAgency() ? CONSTANTS.TAUX_CONVERSION : 1;
                const now = new Date();
                const currentMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

                // Mois affiché par les indicateurs (modifiable via le sélecteur). Défaut = mois courant.
                const selectedMonth = ref(currentMonth);

                const allTx = ref([]);          // toutes les transactions du mode courant (avec date + montant)
                const usersPhotos = ref({});    // login/displayName -> photoURL (pour le top agents)
                const monthlyData = ref({});    // {AAAA-MM: CA} pour le graphique d'évolution
                const pendingAppointments = ref(0);
                const activePrograms = ref(0);
                const activeContainers = ref(0);

                // --- KPI recalculés pour le MOIS SÉLECTIONNÉ ---
                const txOfMonth = computed(() =>
                    allTx.value.filter(t => t.date && t.date.startsWith(selectedMonth.value))
                );
                const monthCA = computed(() =>
                    txOfMonth.value.reduce((s, t) => s + (t.amountEur || 0), 0)
                );
                const topInvoices = computed(() =>
                    txOfMonth.value.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5)
                );
                const topAgents = computed(() => {
                    const stats = {};
                    txOfMonth.value.forEach(t => {
                        if (t.saisiPar) stats[t.saisiPar] = (stats[t.saisiPar] || 0) + (t.amountEur || 0);
                    });
                    return Object.entries(stats)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 3)
                        .map(([name, amount]) => ({ name, amount, photo: usersPhotos.value[name] }));
                });

                // Liste du sélecteur : mois courant + tous ceux qui ont des données, récents d'abord
                const availableMonths = computed(() => {
                    const set = new Set(Object.keys(monthlyData.value));
                    set.add(currentMonth);
                    return Array.from(set).sort().reverse().map(m => ({
                        value: m,
                        label: new Date(m + '-01').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
                    }));
                });

                let unsubs = [];

                const checkAccess = (page) => globalApp.checkPageAccess(page);
                const renderPage = (page) => globalApp.renderPage(page);
                const formatMoney = (amount) => globalApp.formatMoney(amount);

                const initChart = () => {
                    nextTick(() => {
                        const ctx = document.getElementById('vueRevenueChart')?.getContext('2d');
                        if (ctx && typeof Chart !== 'undefined') {
                            const sortedLabels = Object.keys(monthlyData.value).sort();
                            const dataPoints = sortedLabels.map(l => monthlyData.value[l]);
                            
                            const displayLabels = sortedLabels.map(l => {
                                const d = new Date(l + '-01');
                                return d.toLocaleDateString('fr-FR', {month: 'short', year: '2-digit'}).replace('.', '');
                            });

                            new Chart(ctx, {
                                type: 'line',
                                data: {
                                    labels: displayLabels.length > 0 ? displayLabels : ['Aucune donnée'],
                                    datasets: [{
                                        label: 'CA Facturé (€)',
                                        data: dataPoints.length > 0 ? dataPoints : [0],
                                        borderColor: '#3b82f6',
                                        backgroundColor: 'rgba(59,130,246,0.1)',
                                        fill: true,
                                        tension: 0.4
                                    }]
                                },
                                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
                            });
                        }
                    });
                };

                onMounted(() => {
                    const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';

                    // 1. Transactions & Agents
                    const qTrans = query(collection(db, getCollectionName("transactions")), where("agency", "==", activeAgency), where("isDeleted", "==", false));
                    unsubs.push(onSnapshot(qTrans, async snapTrans => {
                        const list = [];
                        const mData = {};

                        snapTrans.forEach(doc => {
                            const t = doc.data();
                            if (!matchesShippingMode(t)) return; // dissocie maritime / aérien
                            const valEUR = (t.prix || 0) / TAUX;

                            if (t.date && t.date.length >= 7) {
                                const m = t.date.substring(0, 7);
                                mData[m] = (mData[m] || 0) + valEUR;
                            }

                            const payeEur = ((parseFloat(t.montantParis) || 0) + (parseFloat(t.montantAbidjan) || 0)) / TAUX;
                            list.push({ id: doc.id, ...t, amountEur: valEUR, payeEur });
                        });

                        allTx.value = list;
                        monthlyData.value = mData;

                        // Photos des agents (pour le classement "meilleurs agents")
                        const { getDocs } = await import("https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js");
                        const snapUsers = await getDocs(collection(db, "users"));
                        const photos = {};
                        snapUsers.forEach(doc => {
                            const u = doc.data();
                            if (u.displayName) photos[u.displayName] = u.photoURL;
                            if (u.email) photos[u.email.split('@')[0]] = u.photoURL;
                        });
                        usersPhotos.value = photos;

                        initChart();
                    }));

                    // 2. RDV en attente
                    const qAppt = query(collection(db, getCollectionName("appointments")), where("agency", "==", activeAgency), where("status", "==", "en_attente"));
                    unsubs.push(onSnapshot(qAppt, snap => pendingAppointments.value = snap.size));

                    // 3. Programmes
                    const qProg = query(collection(db, getCollectionName("appointments")), where("agency", "==", activeAgency), where("status", "==", "en_cours"));
                    unsubs.push(onSnapshot(qProg, snap => {
                        activePrograms.value = new Set(snap.docs.map(d => d.data().livreur)).size;
                    }));

                    // 4. Conteneurs
                    const qCont = query(collection(db, getCollectionName("containers")), where("status", "==", "EN_TRANSIT"));
                    unsubs.push(onSnapshot(qCont, snap => activeContainers.value = snap.size));
                });

                onUnmounted(() => {
                    unsubs.forEach(unsub => unsub());
                });

                return {
                    checkAccess, renderPage, formatMoney,
                    selectedMonth, availableMonths, monthCA, topInvoices, topAgents,
                    pendingAppointments, activePrograms, activeContainers
                };
            }
        });

        this.vueApp.mount('#vue-dashboard');
    }
};