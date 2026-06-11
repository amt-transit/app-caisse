import { db } from '../../../commun/firebase-config.js';
import { collection, query, orderBy, onSnapshot, limit, where } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { createApp, ref, reactive, computed, onMounted, onUnmounted } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";

export const AuditLogView = {
    vueApp: null,

    render(app) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.auditLog = this;

        const html = `
            <style>
                .al-page { max-width: 1400px; margin: 0 auto; animation: fadeIn 0.3s ease; color: #1e293b; }
                
                /* Header */
                .al__header { display: flex; justify-content: space-between; align-items: center; background: white; padding: 20px 25px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; margin-bottom: 24px; flex-wrap: wrap; gap: 15px; }
                .al__title { margin: 0; font-size: 22px; font-weight: 800; color: #0f172a; display: flex; align-items: center; gap: 10px; }
                .al__subtitle { margin: 4px 0 0 0; font-size: 13px; color: #64748b; }
                .al__header-actions { display: flex; align-items: center; gap: 15px; }
                .al__auto-refresh { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: #475569; cursor: pointer; }
                .al__btn { padding: 10px 16px; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer; transition: 0.2s; border: 1px solid transparent; display: flex; align-items: center; justify-content: center; gap: 6px; }
                .al__btn--primary { background: #3b82f6; color: white; box-shadow: 0 2px 4px rgba(59,130,246,0.2); }
                .al__btn--primary:hover { background: #2563eb; }
                .al__btn--ghost { background: white; border-color: #cbd5e1; color: #475569; }
                .al__btn--ghost:hover { background: #f1f5f9; color: #0f172a; }
                .al__btn--sm { padding: 6px 12px; font-size: 12px; }

                /* KPIs */
                .al__kpi-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px; margin-bottom: 24px; }
                .al__kpi { background: white; padding: 20px; border-radius: 16px; border: 1px solid #e2e8f0; display: flex; align-items: center; gap: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); transition: 0.2s; }
                .al__kpi:hover { transform: translateY(-2px); box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
                .al__kpi-icon { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px; flex-shrink: 0; }
                .al__kpi-val { font-size: 24px; font-weight: 900; color: #0f172a; line-height: 1; margin-bottom: 4px; }
                .al__kpi-val--sm { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px; }
                .al__kpi-lbl { font-size: 12px; color: #64748b; font-weight: 600; }
                
                .al__kpi--indigo .al__kpi-icon { background: #e0e7ff; color: #4f46e5; }
                .al__kpi--green .al__kpi-icon { background: #dcfce7; color: #16a34a; }
                .al__kpi--blue .al__kpi-icon { background: #dbeafe; color: #2563eb; }
                .al__kpi--red .al__kpi-icon { background: #fee2e2; color: #ef4444; }
                .al__kpi--purple .al__kpi-icon { background: #f3e8ff; color: #9333ea; }
                .al__kpi--amber .al__kpi-icon { background: #fef3c7; color: #d97706; }

                /* Charts Section */
                .al__charts-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 20px; margin-bottom: 24px; }
                .al__chart-card { background: white; border-radius: 16px; padding: 20px; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.02); display: flex; flex-direction: column; }
                .al__chart-title { margin: 0 0 20px 0; font-size: 15px; font-weight: 800; color: #1e293b; }
                
                /* Custom CSS Bar Charts */
                .al__bar-chart, .al__hour-chart { display: flex; align-items: flex-end; gap: 8px; height: 160px; padding-bottom: 20px; flex: 1; }
                .al__hour-chart { gap: 2px; }
                .al__bar-col, .al__hour-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; position: relative; height: 100%; }
                .al__bar { width: 100%; max-width: 30px; background: linear-gradient(180deg, #3b82f6 0%, #60a5fa 100%); border-radius: 4px 4px 0 0; transition: height 0.5s ease; min-height: 2px; }
                .al__hour-bar { width: 100%; background: #8b5cf6; border-radius: 2px 2px 0 0; transition: height 0.5s ease; min-height: 1px; }
                .al__hour-bar:hover, .al__bar:hover { filter: brightness(1.1); cursor: pointer; }
                .al__bar-label { position: absolute; bottom: -20px; font-size: 10px; color: #64748b; font-weight: 600; white-space: nowrap; }
                .al__hour-label { position: absolute; bottom: -20px; font-size: 9px; color: #94a3b8; }
                .al__bar-value { font-size: 10px; font-weight: 800; color: #0f172a; margin-bottom: 4px; }

                /* Entity List */
                .al__entity-list { display: flex; flex-direction: column; gap: 12px; overflow-y: auto; max-height: 160px; padding-right: 5px; }
                .al__entity-row { display: flex; align-items: center; gap: 10px; }
                .al__entity-name { width: 80px; font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; }
                .al__entity-bar-bg { flex: 1; height: 8px; background: #f1f5f9; border-radius: 4px; overflow: hidden; }
                .al__entity-bar-fill { height: 100%; background: #10b981; border-radius: 4px; }
                .al__entity-count { width: 40px; text-align: right; font-size: 12px; font-weight: 800; color: #0f172a; }

                /* Section Headers & Tables */
                .al__section-title { font-size: 18px; font-weight: 800; color: #0f172a; margin: 0 0 15px 0; }
                .al__perf-wrap, .al__table-wrap { background: white; border-radius: 16px; border: 1px solid #e2e8f0; overflow-x: auto; box-shadow: 0 2px 4px rgba(0,0,0,0.02); margin-bottom: 24px; }
                .al__table, .al__perf-table { width: 100%; border-collapse: collapse; }
                .al__table th, .al__perf-table th { background: #f8fafc; padding: 12px 15px; text-align: left; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; white-space: nowrap; }
                .al__table td, .al__perf-table td { padding: 12px 15px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #334155; }
                .al__table tr:hover td, .al__perf-table tr:hover td { background: #f8fafc; }

                /* Tablette + pliable + mobile (≤1024px) : ces deux tableaux sont
                   tres larges (9 colonnes techniques) -> fiches AVEC libelles
                   (plus lisible qu'un tableau coupe pour un journal d'audit). */
                @media (max-width: 1024px) {
                    .al__perf-wrap, .al__table-wrap { overflow-x: visible; border: none; background: transparent; box-shadow: none; }
                    .al__table thead, .al__perf-table thead { display: none; }
                    .al__table tr, .al__perf-table tr { display: block; border: 1px solid #e8edf3; border-radius: 11px; margin-bottom: 10px; padding: 5px 12px; background: #fff; box-shadow: 0 1px 2px rgba(15,23,42,.04); }
                    .al__table td, .al__perf-table td { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 4px 12px; text-align: right; border: none; border-bottom: 1px solid #f4f6f9; padding: 8px 2px; min-width: 0; }
                    .al__table td:last-child, .al__perf-table td:last-child { border-bottom: none; }
                    .al__table td::before, .al__perf-table td::before { content: attr(data-label); font-weight: 700; color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: .03em; text-align: left; flex-shrink: 0; }
                    .al__table td > *, .al__perf-table td > * { min-width: 0; overflow-wrap: anywhere; }
                    .al__td-desc, .al__td-id, .al__td-ref, .al__td-ip { white-space: normal !important; text-align: right; overflow-wrap: anywhere; word-break: break-word; }
                    .al__pagination { flex-wrap: wrap; justify-content: center; gap: 8px; padding: 12px; }
                }

                .al__rank { width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; background: #f1f5f9; border-radius: 50%; font-size: 11px; font-weight: bold; color: #64748b; }
                .al__rank--gold { background: #fef3c7; color: #d97706; }
                .al__rank--silver { background: #f1f5f9; color: #475569; }
                .al__rank--bronze { background: #ffedd5; color: #9a3412; }
                .al__perf-name { font-weight: 700; color: #0f172a; }
                .al__mini-badge { padding: 2px 6px; border-radius: 10px; font-size: 11px; font-weight: 700; min-width: 24px; display: inline-block; text-align: center; }
                .al__mini-badge--green { background: #dcfce7; color: #166534; }
                .al__mini-badge--blue { background: #e0f2fe; color: #0369a1; }
                .al__mini-badge--red { background: #fee2e2; color: #991b1b; }
                .al__mini-badge--purple { background: #f3e8ff; color: #7e22ce; }

                /* Filters */
                .al__filters { background: white; padding: 20px; border-radius: 16px; border: 1px solid #e2e8f0; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
                .al__filter-row { display: flex; flex-wrap: wrap; gap: 12px; }
                .al__input, .al__select { padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; outline: none; transition: 0.2s; background: white; flex: 1; min-width: 140px; }
                .al__input:focus, .al__select:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
                
                /* Log Table specific */
                .al__td-date { font-weight: 600; color: #475569; font-size: 12px; white-space: nowrap; }
                .al__action-badge { padding: 4px 8px; border-radius: 6px; font-size: 10px; font-weight: 800; white-space: nowrap; }
                .al__td-desc { font-weight: 600; color: #1e293b; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                .al__user-cell { display: flex; flex-direction: column; }
                .al__user-name { font-weight: 700; color: #0f172a; font-size: 12px; }
                .al__user-id { font-size: 10px; color: #94a3b8; font-family: monospace; }
                .al__entity-tag { background: #f1f5f9; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; }
                .al__td-id, .al__td-ref { font-family: monospace; font-size: 12px; color: #64748b; }
                .al__td-ip { font-family: monospace; font-size: 11px; color: #94a3b8; }
                .al__status-dot { padding: 2px 6px; border-radius: 10px; font-size: 10px; font-weight: 800; }
                .al__status-dot--ok { background: #dcfce7; color: #166534; }
                .al__status-dot--err { background: #fee2e2; color: #991b1b; }
                .al__status-dot--warn { background: #ffedd5; color: #9a3412; }

                /* Pagination */
                .al__pagination { display: flex; justify-content: space-between; align-items: center; padding: 15px 20px; background: white; border-top: 1px solid #e2e8f0; }
                .al__page-btn { padding: 8px 16px; border: 1px solid #cbd5e1; border-radius: 8px; background: white; cursor: pointer; font-weight: 600; color: #475569; transition: 0.2s; }
                .al__page-btn:hover:not(:disabled) { background: #f1f5f9; color: #0f172a; }
                .al__page-btn:disabled { opacity: 0.5; cursor: not-allowed; }
                .al__page-info { font-size: 13px; color: #64748b; font-weight: 500; }
            </style>

            <div id="vue-audit-log" class="al-page" v-cloak>
                <div class="al__header">
                    <div>
                        <h1 class="al__title">📋 Activités Log</h1>
                        <p class="al__subtitle">Suivi en temps réel des actions de tous les agents</p>
                    </div>
                    <div class="al__header-actions">
                        <label class="al__auto-refresh">
                            <input type="checkbox" v-model="autoRefresh" @change="toggleAutoRefresh">
                            <span>Auto-refresh (Temps réel)</span>
                        </label>
                        <button class="al__btn al__btn--primary" type="button" @click="loadData">🔄 Actualiser</button>
                    </div>
                </div>

                <!-- KPIs -->
                <div class="al__kpi-row">
                    <div class="al__kpi al__kpi--indigo"><div class="al__kpi-icon">📊</div><div><div class="al__kpi-val">{{ kpiTotal }}</div><div class="al__kpi-lbl">Actions aujourd'hui</div></div></div>
                    <div class="al__kpi al__kpi--green"><div class="al__kpi-icon">➕</div><div><div class="al__kpi-val">{{ kpiCreates }}</div><div class="al__kpi-lbl">Créations</div></div></div>
                    <div class="al__kpi al__kpi--blue"><div class="al__kpi-icon">✏️</div><div><div class="al__kpi-val">{{ kpiUpdates }}</div><div class="al__kpi-lbl">Modifications</div></div></div>
                    <div class="al__kpi al__kpi--red"><div class="al__kpi-icon">🗑️</div><div><div class="al__kpi-val">{{ kpiDeletes }}</div><div class="al__kpi-lbl">Suppressions</div></div></div>
                    <div class="al__kpi al__kpi--purple"><div class="al__kpi-icon">🔑</div><div><div class="al__kpi-val">{{ kpiLogins }}</div><div class="al__kpi-lbl">Connexions</div></div></div>
                    <div class="al__kpi al__kpi--amber"><div class="al__kpi-icon">🏆</div><div><div class="al__kpi-val al__kpi-val--sm" :title="topAgentName">{{ topAgentName || '-' }}</div><div class="al__kpi-lbl">Le + actif ({{ topAgentCount }})</div></div></div>
                </div>

                <!-- Charts -->
                <div class="al__charts-row">
                    <div class="al__chart-card">
                        <h3 class="al__chart-title">📈 Actions 7 derniers jours</h3>
                        <div class="al__bar-chart">
                            <div v-for="(count, day) in last7DaysData" :key="day" class="al__bar-col">
                                <div class="al__bar-value">{{ count }}</div>
                                <div class="al__bar" :style="{ height: getBarHeight7(count) + 'px' }"></div>
                                <div class="al__bar-label">{{ formatShortDay(day) }}</div>
                            </div>
                        </div>
                    </div>
                    <div class="al__chart-card">
                        <h3 class="al__chart-title">⏰ Activité par heure (aujourd'hui)</h3>
                        <div class="al__hour-chart">
                            <div v-for="(count, hour) in hourlyData" :key="hour" class="al__hour-col">
                                <div class="al__hour-bar" :style="{ height: getBarHeightHour(count) + 'px' }" :title="count + ' actions'"></div>
                                <div v-if="hour % 3 === 0" class="al__hour-label">{{ String(hour).padStart(2,'0') }}h</div>
                            </div>
                        </div>
                    </div>
                    <div class="al__chart-card">
                        <h3 class="al__chart-title">🏷️ Entités les plus sollicitées</h3>
                        <div class="al__entity-list">
                            <div v-for="(item, idx) in topEntities" :key="idx" class="al__entity-row">
                                <span class="al__entity-name">{{ item.entity }}</span>
                                <div class="al__entity-bar-bg"><div class="al__entity-bar-fill" :style="{ width: (item.count / maxEntityCount * 100) + '%' }"></div></div>
                                <span class="al__entity-count">{{ item.count }}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="al__section">
                    <h3 class="al__section-title">🏅 Performance des agents (7 derniers jours)</h3>
                    <div class="al__perf-wrap">
                        <table class="al__perf-table">
                            <thead>
                                <tr><th>#</th><th>Agent</th><th>Total</th><th>Créations</th><th>Modifications</th><th>Suppressions</th><th>Connexions</th><th>Dernière action</th></tr>
                            </thead>
                            <tbody>
                                <tr v-if="loading"><td colspan="8" style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</td></tr>
                                <tr v-else-if="agentPerformance.length === 0"><td colspan="8" style="text-align: center; padding: 20px; color: #64748b;">Aucune activité récente.</td></tr>
                                <tr v-else v-for="(agent, idx) in agentPerformance" :key="agent.name">
                                    <td data-label="#"><span class="al__rank" :class="getRankClass(idx)">{{ idx + 1 }}</span></td>
                                    <td data-label="Agent" class="al__perf-name">{{ agent.name }}</td>
                                    <td data-label="Total"><strong>{{ agent.total }}</strong></td>
                                    <td data-label="Créations"><span class="al__mini-badge al__mini-badge--green">{{ agent.creates }}</span></td>
                                    <td data-label="Modifications"><span class="al__mini-badge al__mini-badge--blue">{{ agent.updates }}</span></td>
                                    <td data-label="Suppressions"><span class="al__mini-badge al__mini-badge--red">{{ agent.deletes }}</span></td>
                                    <td data-label="Connexions"><span class="al__mini-badge al__mini-badge--purple">{{ agent.logins }}</span></td>
                                    <td data-label="Dernière action" class="al__td-date">{{ formatDate(agent.lastAction) }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="al__filters">
                    <h3 class="al__section-title">🔍 Journal détaillé</h3>
                    <div class="al__filter-row">
                        <input type="text" v-model="filters.search" class="al__input" placeholder="Rechercher IP, Réf, Description..." @input="applyFilters">
                        <select v-model="filters.action" class="al__select" @change="applyFilters">
                            <option value="">Toutes les actions</option>
                            <option value="CREATE">Création (CREATE)</option>
                            <option value="UPDATE">Modification (UPDATE)</option>
                            <option value="DELETE">Suppression (DELETE)</option>
                            <option value="LOGIN">Connexion (LOGIN)</option>
                            <option value="SCAN">Scan (SCAN)</option>
                            <option value="EXPORT">Export (EXPORT)</option>
                        </select>
                        <select v-model="filters.user" class="al__select" @change="applyFilters">
                            <option value="">Tous les agents</option>
                            <option v-for="u in usersList" :key="u" :value="u">{{ u }}</option>
                        </select>
                        <input type="text" v-model="filters.entity" class="al__input" placeholder="Entité (ex: rdv, factures)..." @input="applyFilters">
                        <button class="al__btn al__btn--ghost" type="button" @click="resetFilters">Reset</button>
                    </div>
                </div>

                <div class="al__table-wrap">
                    <table class="al__table">
                        <thead>
                            <tr><th>Date / Heure</th><th>Action</th><th>Description</th><th>Utilisateur</th><th>Entité</th><th>ID</th><th>Référence</th><th>IP</th><th>Status</th></tr>
                        </thead>
                        <tbody>
                            <tr v-if="loadingLogs"><td colspan="9" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</td></tr>
                            <tr v-else-if="paginatedLogs.length === 0"><td colspan="9" style="text-align: center; padding: 40px; color: #64748b;">Aucun log trouvé pour ces filtres.</td></tr>
                            <tr v-else v-for="log in paginatedLogs" :key="log.id">
                                <td data-label="Date / Heure" class="al__td-date">{{ formatDateTime(log.date) }}</td>
                                <td data-label="Action"><span class="al__action-badge" :style="getActionStyle(log.action)">{{ getActionIcon(log.action) }} {{ log.action || 'UNKNOWN' }}</span></td>
                                <td data-label="Description" class="al__td-desc" :title="log.details">{{ log.details || log.action + ' — ' + (log.entity || 'inconnu') }}</td>
                                <td data-label="Utilisateur"><div class="al__user-cell"><span class="al__user-name">{{ log.user || '-' }}</span><span v-if="log.userId" class="al__user-id">#{{ log.userId.substring(0,4).toUpperCase() }}</span></div></td>
                                <td data-label="Entité"><span class="al__entity-tag">{{ log.entity || '-' }}</span></td>
                                <td data-label="ID" class="al__td-id">{{ log.refId || '—' }}</td>
                                <td data-label="Référence" class="al__td-ref">{{ log.docRef || '—' }}</td>
                                <td data-label="IP" class="al__td-ip">{{ log.ip || '—' }}</td>
                                <td data-label="Status"><span class="al__status-dot" :class="getStatusClass(log.status)">{{ log.status || '200' }}</span></td>
                            </tr>
                        </tbody>
                    </table>
                    <div class="al__pagination">
                        <button class="al__page-btn" @click="changePage(-1)" :disabled="currentPage === 1">← Précédent</button>
                        <span class="al__page-info">Page {{ currentPage }} / {{ totalPages }} · {{ filteredLogs.length }} résultat(s)</span>
                        <button class="al__page-btn" @click="changePage(1)" :disabled="currentPage === totalPages">Suivant →</button>
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
                // State
                const logs = ref([]);
                const filteredLogs = ref([]);
                const loading = ref(true);
                const loadingLogs = ref(true);
                const autoRefresh = ref(true);
                const currentPage = ref(1);
                const itemsPerPage = 50;
                
                // Filters
                const filters = reactive({
                    search: '',
                    action: '',
                    user: '',
                    entity: ''
                });
                
                // Computed data
                const usersList = ref([]);
                
                // KPIs
                const kpiTotal = ref(0);
                const kpiCreates = ref(0);
                const kpiUpdates = ref(0);
                const kpiDeletes = ref(0);
                const kpiLogins = ref(0);
                const topAgentName = ref('');
                const topAgentCount = ref(0);
                
                // Charts data
                const last7DaysData = ref({});
                const hourlyData = ref(Array(24).fill(0));
                const topEntities = ref([]);
                const maxEntityCount = ref(1);
                const agentPerformance = ref([]);
                
                let unsub = null;

                // Helper functions
                const formatMoney = (amount) => globalApp.formatMoney(amount);
                const formatDate = (dateString) => dateString ? new Date(dateString).toLocaleDateString('fr-FR') : '-';
                const formatDateTime = (dateString) => dateString ? new Date(dateString).toLocaleString('fr-FR') : '-';
                const formatShortDay = (dateStr) => new Date(dateStr).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '');
                
                const getBarHeight7 = (count) => {
                    const max = Math.max(...Object.values(last7DaysData.value), 1);
                    return (count / max) * 120;
                };
                
                const getBarHeightHour = (count) => {
                    const max = Math.max(...hourlyData.value, 1);
                    return (count / max) * 80;
                };
                
                const getRankClass = (idx) => {
                    if (idx === 0) return 'al__rank--gold';
                    if (idx === 1) return 'al__rank--silver';
                    if (idx === 2) return 'al__rank--bronze';
                    return '';
                };
                
                const getActionStyle = (action) => {
                    switch(action) {
                        case 'CREATE': return 'background: rgba(22, 163, 74, 0.1); color: rgb(22, 163, 74);';
                        case 'UPDATE': return 'background: rgba(59, 130, 246, 0.1); color: rgb(59, 130, 246);';
                        case 'DELETE': return 'background: rgba(239, 68, 68, 0.1); color: rgb(239, 68, 68);';
                        case 'LOGIN': return 'background: rgba(168, 85, 247, 0.1); color: rgb(168, 85, 247);';
                        case 'SCAN': return 'background: rgba(99, 102, 241, 0.1); color: rgb(99, 102, 241);';
                        default: return 'background: rgba(100, 116, 139, 0.1); color: rgb(100, 116, 139);';
                    }
                };
                
                const getActionIcon = (action) => {
                    switch(action) {
                        case 'CREATE': return '➕';
                        case 'UPDATE': return '✏️';
                        case 'DELETE': return '🗑️';
                        case 'LOGIN': return '🔑';
                        case 'SCAN': return '📷';
                        case 'EXPORT': return '📄';
                        default: return '⚡';
                    }
                };
                
                const getStatusClass = (code) => {
                    const c = parseInt(code);
                    if (c >= 200 && c < 300) return 'al__status-dot--ok';
                    if (c >= 400) return 'al__status-dot--err';
                    return 'al__status-dot--warn';
                };
                
                const totalPages = computed(() => Math.ceil(filteredLogs.value.length / itemsPerPage) || 1);
                const paginatedLogs = computed(() => {
                    const start = (currentPage.value - 1) * itemsPerPage;
                    return filteredLogs.value.slice(start, start + itemsPerPage);
                });
                
                const processData = () => {
                    const now = new Date();
                    const todayStr = now.toISOString().split('T')[0];
                    const sevenDaysAgo = new Date(now);
                    sevenDaysAgo.setDate(now.getDate() - 7);
                    
                    // Initialize last7Days
                    const last7Days = {};
                    for(let i = 6; i >= 0; i--) {
                        const d = new Date(now);
                        d.setDate(d.getDate() - i);
                        last7Days[d.toISOString().split('T')[0]] = 0;
                    }
                    
                    const hourly = new Array(24).fill(0);
                    const entities = {};
                    const perfAgents = {};
                    const usersSet = new Set();
                    
                    let actionsToday = 0, creates = 0, updates = 0, deletes = 0, logins = 0;
                    const agentActivityToday = {};
                    
                    logs.value.forEach(log => {
                        if (!log.date) return;
                        const logDateObj = new Date(log.date);
                        const logDateStr = log.date.split('T')[0];
                        const user = log.user || 'Système';
                        const action = (log.action || '').toUpperCase();
                        const entity = (log.entity || 'inconnu').toLowerCase();
                        
                        usersSet.add(user);
                        
                        // Today stats
                        if (logDateStr === todayStr) {
                            actionsToday++;
                            if (action === 'CREATE') creates++;
                            if (action === 'UPDATE') updates++;
                            if (action === 'DELETE') deletes++;
                            if (action === 'LOGIN') logins++;
                            agentActivityToday[user] = (agentActivityToday[user] || 0) + 1;
                            hourly[logDateObj.getHours()]++;
                        }
                        
                        // Last 7 days stats
                        if (logDateObj >= sevenDaysAgo) {
                            if (last7Days[logDateStr] !== undefined) last7Days[logDateStr]++;
                            
                            if (!perfAgents[user]) {
                                perfAgents[user] = { total: 0, creates: 0, updates: 0, deletes: 0, logins: 0, lastAction: log.date };
                            }
                            perfAgents[user].total++;
                            if (action === 'CREATE') perfAgents[user].creates++;
                            if (action === 'UPDATE') perfAgents[user].updates++;
                            if (action === 'DELETE') perfAgents[user].deletes++;
                            if (action === 'LOGIN') perfAgents[user].logins++;
                            if (log.date > perfAgents[user].lastAction) perfAgents[user].lastAction = log.date;
                        }
                        
                        // Global entities
                        entities[entity] = (entities[entity] || 0) + 1;
                    });
                    
                    // Top agent today
                    let topName = '-', topCount = 0;
                    for (const [agent, count] of Object.entries(agentActivityToday)) {
                        if (count > topCount && agent !== 'Système') {
                            topName = agent;
                            topCount = count;
                        }
                    }
                    
                    // Update reactive state
                    kpiTotal.value = actionsToday;
                    kpiCreates.value = creates;
                    kpiUpdates.value = updates;
                    kpiDeletes.value = deletes;
                    kpiLogins.value = logins;
                    topAgentName.value = topName;
                    topAgentCount.value = topCount;
                    
                    last7DaysData.value = last7Days;
                    hourlyData.value = hourly;
                    
                    // Top entities
                    const sortedEntities = Object.entries(entities).sort((a,b) => b[1] - a[1]).slice(0, 10);
                    topEntities.value = sortedEntities.map(([entity, count]) => ({ entity, count }));
                    maxEntityCount.value = sortedEntities.length > 0 ? sortedEntities[0][1] : 1;
                    
                    // Agent performance
                    const sortedAgents = Object.entries(perfAgents).sort((a,b) => b[1].total - a[1].total);
                    agentPerformance.value = sortedAgents.map(([name, stats]) => ({ name, ...stats }));
                    
                    usersList.value = Array.from(usersSet).sort();
                };
                
                const applyFilters = () => {
                    let filtered = [...logs.value];
                    
                    if (filters.action) {
                        filtered = filtered.filter(log => log.action === filters.action);
                    }
                    if (filters.user) {
                        filtered = filtered.filter(log => log.user === filters.user);
                    }
                    if (filters.entity) {
                        filtered = filtered.filter(log => (log.entity || '').toLowerCase() === filters.entity.toLowerCase());
                    }
                    if (filters.search) {
                        const searchLower = filters.search.toLowerCase();
                        filtered = filtered.filter(log => {
                            const str = `${log.ip || ''} ${log.refId || ''} ${log.details || ''}`.toLowerCase();
                            return str.includes(searchLower);
                        });
                    }
                    
                    filteredLogs.value = filtered;
                    currentPage.value = 1;
                    loadingLogs.value = false;
                };
                
                const resetFilters = () => {
                    filters.search = '';
                    filters.action = '';
                    filters.user = '';
                    filters.entity = '';
                    applyFilters();
                };
                
                const changePage = (delta) => {
                    const newPage = currentPage.value + delta;
                    if (newPage >= 1 && newPage <= totalPages.value) {
                        currentPage.value = newPage;
                    }
                };
                
                const loadData = () => {
                    if (unsub) {
                        unsub();
                        unsub = null;
                    }
                    
                    const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
                    const q = query(
                        collection(db, "audit_logs"), 
                        where("agency", "==", activeAgency),
                        orderBy("date", "desc"),
                        limit(300)
                    );

                    loading.value = true;
                    loadingLogs.value = true;
                    
                    unsub = onSnapshot(q, (snapshot) => {
                        if (!autoRefresh.value && logs.value.length > 0) return;
                        
                        logs.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                        processData();
                        applyFilters();
                        loading.value = false;
                    }, (error) => {
                        console.error("Erreur chargement logs:", error);
                        loading.value = false;
                        loadingLogs.value = false;
                        if(logs.value.length === 0) {
                            filteredLogs.value = [];
                        }
                    });
                };
                
                const toggleAutoRefresh = () => {
                    if (autoRefresh.value) {
                        loadData();
                    } else if (unsub) {
                        unsub();
                        unsub = null;
                    }
                };
                
                onMounted(() => {
                    loadData();
                });
                
                onUnmounted(() => {
                    if (unsub) unsub();
                });
                
                return {
                    logs, filteredLogs, loading, loadingLogs, autoRefresh, currentPage,
                    filters, usersList,
                    kpiTotal, kpiCreates, kpiUpdates, kpiDeletes, kpiLogins, topAgentName, topAgentCount,
                    last7DaysData, hourlyData, topEntities, maxEntityCount, agentPerformance,
                    totalPages, paginatedLogs,
                    formatMoney, formatDate, formatDateTime, formatShortDay,
                    getBarHeight7, getBarHeightHour, getRankClass, getActionStyle, getActionIcon, getStatusClass,
                    applyFilters, resetFilters, changePage, loadData, toggleAutoRefresh
                };
            }
        });
        
        // Add v-cloak style
        const style = document.createElement('style');
        style.textContent = '[v-cloak] { display: none; }';
        document.head.appendChild(style);
        
        this.vueApp.mount('#vue-audit-log');
    }
};