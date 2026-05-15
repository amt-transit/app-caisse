import { CONSTANTS } from '../../../constants.js';
import { db } from '../../../firebase-config.js';
import { collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getCollectionName } from '../../../agencies-config.js';
import { createApp, ref, computed, onMounted, onUnmounted, nextTick } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";

export const DashboardView = {
    vueApp: null,

    render(app) {
        const globalApp = app;

        const html = `
            <style>
                [v-cloak] { display: none; }
                .quick-action-btn:hover { transform: translateY(-3px) !important; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1) !important; border-color: #cbd5e1 !important; }
            </style>
            <div id="vue-dashboard" v-cloak>
                <h3 style="margin: 0 0 20px 0; color: #0f172a; font-size: 20px; font-weight: 800;">🚀 Accès rapide</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(min(130px, 45%), 1fr)); gap: 12px; margin-bottom: 30px;">
                    <button v-if="checkAccess('invoice-new')" @click="renderPage('invoice-new')" class="quick-action-btn" style="display:flex; flex-direction:column; align-items:center; padding:15px; background:white; border:1px solid #e2e8f0; border-radius:12px; cursor:pointer; transition:all 0.2s; box-shadow:0 2px 4px rgba(0,0,0,0.02);">
                        <i class="fas fa-file-invoice" style="font-size:24px; color:#3b82f6; margin-bottom:10px;"></i><span style="font-weight:600; color:#334155; font-size:12px; text-align:center;">Nouvelle facture</span>
                    </button>
                    <button v-if="checkAccess('invoices-list')" @click="renderPage('invoices-list')" class="quick-action-btn" style="display:flex; flex-direction:column; align-items:center; padding:15px; background:white; border:1px solid #e2e8f0; border-radius:12px; cursor:pointer; transition:all 0.2s; box-shadow:0 2px 4px rgba(0,0,0,0.02);">
                        <i class="fas fa-list" style="font-size:24px; color:#64748b; margin-bottom:10px;"></i><span style="font-weight:600; color:#334155; font-size:12px; text-align:center;">Liste factures</span>
                    </button>
                    <button v-if="checkAccess('quote-new')" @click="renderPage('quote-new')" class="quick-action-btn" style="display:flex; flex-direction:column; align-items:center; padding:15px; background:white; border:1px solid #e2e8f0; border-radius:12px; cursor:pointer; transition:all 0.2s; box-shadow:0 2px 4px rgba(0,0,0,0.02);">
                        <i class="fas fa-file-signature" style="font-size:24px; color:#10b981; margin-bottom:10px;"></i><span style="font-weight:600; color:#334155; font-size:12px; text-align:center;">Nouveau devis</span>
                    </button>
                    <button v-if="checkAccess('quote-requests')" @click="renderPage('quote-requests')" class="quick-action-btn" style="display:flex; flex-direction:column; align-items:center; padding:15px; background:white; border:1px solid #e2e8f0; border-radius:12px; cursor:pointer; transition:all 0.2s; box-shadow:0 2px 4px rgba(0,0,0,0.02);">
                        <i class="fas fa-inbox" style="font-size:24px; color:#f59e0b; margin-bottom:10px;"></i><span style="font-weight:600; color:#334155; font-size:12px; text-align:center;">Demandes devis</span>
                    </button>
                    <button v-if="checkAccess('appointments-pending')" @click="renderPage('appointments-pending')" class="quick-action-btn" style="display:flex; flex-direction:column; align-items:center; padding:15px; background:white; border:1px solid #e2e8f0; border-radius:12px; cursor:pointer; transition:all 0.2s; box-shadow:0 2px 4px rgba(0,0,0,0.02);">
                        <i class="fas fa-calendar-check" style="font-size:24px; color:#ef4444; margin-bottom:10px;"></i><span style="font-weight:600; color:#334155; font-size:12px; text-align:center;">RDV à valider</span>
                    </button>
                    <button v-if="checkAccess('notifications')" @click="renderPage('notifications')" class="quick-action-btn" style="display:flex; flex-direction:column; align-items:center; padding:15px; background:white; border:1px solid #e2e8f0; border-radius:12px; cursor:pointer; transition:all 0.2s; box-shadow:0 2px 4px rgba(0,0,0,0.02);">
                        <i class="fas fa-bell" style="font-size:24px; color:#8b5cf6; margin-bottom:10px;"></i><span style="font-weight:600; color:#334155; font-size:12px; text-align:center;">Notifications</span>
                    </button>
                    <button v-if="checkAccess('sms-send')" @click="renderPage('sms-send')" class="quick-action-btn" style="display:flex; flex-direction:column; align-items:center; padding:15px; background:white; border:1px solid #e2e8f0; border-radius:12px; cursor:pointer; transition:all 0.2s; box-shadow:0 2px 4px rgba(0,0,0,0.02);">
                        <i class="fas fa-sms" style="font-size:24px; color:#ec4899; margin-bottom:10px;"></i><span style="font-weight:600; color:#334155; font-size:12px; text-align:center;">Envoi SMS</span>
                    </button>
                    <button v-if="checkAccess('loading-boats')" @click="renderPage('loading-boats')" class="quick-action-btn" style="display:flex; flex-direction:column; align-items:center; padding:15px; background:white; border:1px solid #e2e8f0; border-radius:12px; cursor:pointer; transition:all 0.2s; box-shadow:0 2px 4px rgba(0,0,0,0.02);">
                        <i class="fas fa-ship" style="font-size:24px; color:#0ea5e9; margin-bottom:10px;"></i><span style="font-weight:600; color:#334155; font-size:12px; text-align:center;">Bateaux & Départs</span>
                    </button>
                    <button v-if="checkAccess('clients-list')" @click="renderPage('clients-list')" class="quick-action-btn" style="display:flex; flex-direction:column; align-items:center; padding:15px; background:white; border:1px solid #e2e8f0; border-radius:12px; cursor:pointer; transition:all 0.2s; box-shadow:0 2px 4px rgba(0,0,0,0.02);">
                        <i class="fas fa-users" style="font-size:24px; color:#14b8a6; margin-bottom:10px;"></i><span style="font-weight:600; color:#334155; font-size:12px; text-align:center;">Clients</span>
                    </button>
                    <button v-if="checkAccess('balance-monthly')" @click="renderPage('balance-monthly')" class="quick-action-btn" style="display:flex; flex-direction:column; align-items:center; padding:15px; background:white; border:1px solid #e2e8f0; border-radius:12px; cursor:pointer; transition:all 0.2s; box-shadow:0 2px 4px rgba(0,0,0,0.02);">
                        <i class="fas fa-chart-line" style="font-size:24px; color:#f43f5e; margin-bottom:10px;"></i><span style="font-weight:600; color:#334155; font-size:12px; text-align:center;">Bilan Comparatif</span>
                    </button>
                    <button v-if="checkAccess('scan-warehouse')" @click="renderPage('scan-warehouse')" class="quick-action-btn" style="display:flex; flex-direction:column; align-items:center; padding:15px; background:white; border:1px solid #e2e8f0; border-radius:12px; cursor:pointer; transition:all 0.2s; box-shadow:0 2px 4px rgba(0,0,0,0.02);">
                        <i class="fas fa-barcode" style="font-size:24px; color:#6366f1; margin-bottom:10px;"></i><span style="font-weight:600; color:#334155; font-size:12px; text-align:center;">Numérisation</span>
                    </button>
                    <button v-if="checkAccess('finance-expenses')" @click="renderPage('finance-expenses')" class="quick-action-btn" style="display:flex; flex-direction:column; align-items:center; padding:15px; background:white; border:1px solid #e2e8f0; border-radius:12px; cursor:pointer; transition:all 0.2s; box-shadow:0 2px 4px rgba(0,0,0,0.02);">
                        <i class="fas fa-money-bill-wave" style="font-size:24px; color:#f97316; margin-bottom:10px;"></i><span style="font-weight:600; color:#334155; font-size:12px; text-align:center;">Dépenses</span>
                    </button>
                </div>

                <h3 style="margin: 0 0 20px 0; color: #0f172a; font-size: 20px; font-weight: 800;">📊 Indicateurs du mois ({{ currentMonthLabel }})</h3>
                <div class="stats-grid" style="margin-bottom: 30px;">
                    <div class="stat-card">
                        <div class="stat-icon" style="background:#dbeafe; color:#2563eb;"><i class="fas fa-file-invoice"></i></div>
                        <div class="stat-value">{{ formatMoney(monthCA) }}</div>
                        <div class="stat-label">Chiffre d'affaires facturé</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon" style="background:#d1fae5; color:#059669;"><i class="fas fa-calendar"></i></div>
                        <div class="stat-value">{{ pendingAppointments }}</div>
                        <div class="stat-label">RDV en attente</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon" style="background:#fef3c7; color:#d97706;"><i class="fas fa-tasks"></i></div>
                        <div class="stat-value">{{ activePrograms }}</div>
                        <div class="stat-label">Chauffeurs en tournée</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon" style="background:#ede9fe; color:#7c3aed;"><i class="fas fa-box"></i></div>
                        <div class="stat-value">{{ activeContainers }}</div>
                        <div class="stat-label">Conteneurs en mer</div>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 25px; margin-bottom: 30px;">
                    <div style="background: white; border-radius: 16px; padding: 20px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                        <h3 style="margin: 0 0 20px; font-size: 16px;">📈 Évolution Facturation (Général)</h3>
                        <div style="position: relative; height: 250px; width: 100%;">
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

                <h3 style="margin: 0 0 20px 0; color: #0f172a; font-size: 20px; font-weight: 800;">🏆 Meilleurs agents (Mois en cours)</h3>
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
                const TAUX = CONSTANTS.TAUX_CONVERSION;
                const now = new Date();
                const currentMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
                const currentMonthLabel = now.toLocaleDateString('fr-FR', {month:'long'});

                const monthCA = ref(0);
                const topInvoices = ref([]);
                const topAgents = ref([]);
                const pendingAppointments = ref(0);
                const activePrograms = ref(0);
                const activeContainers = ref(0);
                const monthlyData = ref({});

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
                        let mCA = 0;
                        const recent = [];
                        const agentStats = {};
                        const mData = {};

                        snapTrans.forEach(doc => {
                            const t = doc.data();
                            const valCFA = t.prix || 0;
                            const valEUR = valCFA / TAUX;

                            if (t.date && t.date.length >= 7) {
                                const m = t.date.substring(0, 7);
                                if (!mData[m]) mData[m] = 0;
                                mData[m] += valEUR;
                            }

                            if (t.date && t.date.startsWith(currentMonth)) {
                                mCA += valEUR;
                                const payeEur = ((parseFloat(t.montantParis) || 0) + (parseFloat(t.montantAbidjan) || 0)) / TAUX;
                                recent.push({ id: doc.id, ...t, amountEur: valEUR, payeEur: payeEur });
                                
                                if (t.saisiPar) {
                                    if (!agentStats[t.saisiPar]) agentStats[t.saisiPar] = 0;
                                    agentStats[t.saisiPar] += valEUR;
                                }
                            }
                        });

                        recent.sort((a, b) => new Date(b.date) - new Date(a.date));
                        topInvoices.value = recent.slice(0, 5);
                        monthCA.value = mCA;
                        monthlyData.value = mData;

                        // Load photos
                        const { getDocs } = await import("https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js");
                        const snapUsers = await getDocs(collection(db, "users"));
                        const usersPhotos = {};
                        snapUsers.forEach(doc => {
                            const u = doc.data();
                            if (u.displayName) usersPhotos[u.displayName] = u.photoURL;
                            if (u.email) usersPhotos[u.email.split('@')[0]] = u.photoURL;
                        });

                        topAgents.value = Object.entries(agentStats)
                            .sort((a, b) => b[1] - a[1])
                            .slice(0, 3)
                            .map(([name, amount]) => ({ name, amount, photo: usersPhotos[name] }));
                            
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
                    currentMonthLabel, monthCA, topInvoices, topAgents,
                    pendingAppointments, activePrograms, activeContainers
                };
            }
        });

        this.vueApp.mount('#vue-dashboard');
    }
};