import { createApp, ref, computed, onMounted, onBeforeUnmount, watch } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";
import { auth, db } from '../../../firebase-config.js';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { collection, addDoc, setDoc, deleteDoc, query, where, orderBy, onSnapshot, updateDoc, doc, Timestamp, runTransaction } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getCollectionName } from '../../../agencies-config.js';

export const SalaireView = {
    vueApp: null,

    render(app, container) {
        this.app = app;
        
        container.innerHTML = `
            <div id="app" v-cloak>
                <div class="dashboard-container" v-if="user && !authLoading">
                    <div class="sub-nav" style="margin-bottom: 20px;">
                        <a href="#" :class="{ active: currentSalaireView === 'dashboard' }" @click.prevent="currentSalaireView = 'dashboard'">Tableau de bord</a>
                        <a href="#" :class="{ active: currentSalaireView === 'employees' }" @click.prevent="currentSalaireView = 'employees'">Employés & RH</a>
                        <a href="#" :class="{ active: currentSalaireView === 'paie' }" @click.prevent="currentSalaireView = 'paie'">Validation Paie</a>
                        <a href="#" :class="{ active: currentSalaireView === 'tontine' }" @click.prevent="currentSalaireView = 'tontine'">Gestion Tontine</a>
                        <a href="#" :class="{ active: currentSalaireView === 'history' }" @click.prevent="currentSalaireView = 'history'">Historique & Export</a>
                    </div>
                    <div v-if="toast.show" :class="['toast', 'toast-' + toast.type]" style="position:fixed; top:20px; right:20px; z-index:9999;">{{ toast.message }}</div>

                    <div v-if="currentSalaireView === 'dashboard'">
                        <h2>📊 Tableau de Bord Salaires</h2>
                        <div class="totals-container" style="margin-bottom: 20px;">
                            <div class="total-card"><h3>Employés Actifs</h3><p style="color:#3b82f6;">{{ dashboardStats.employeesCount }}</p></div>
                            <div class="total-card"><h3>En Attente de Paie</h3><p style="color:#ef4444;">{{ dashboardStats.toPayCount }}</p></div>
                            <div class="total-card"><h3>Budget Dispo (Mois)</h3><p style="color:#10b981;">{{ formatMoney(dashboardStats.budgetBalance) }}</p></div>
                            <div class="total-card"><h3>Cagnotte Tontine</h3><p style="color:#f59e0b;">{{ formatMoney(dashboardStats.tontinePot) }}</p></div>
                        </div>
                        <div class="card">
                            <h3>Dernières Activités</h3>
                            <table class="table">
                                <thead><tr><th>Date</th><th>Employé</th><th>Type</th><th>Net Payé</th></tr></thead>
                                <tbody>
                                    <tr v-for="act in recentActivity" :key="act.id"><td>{{ formatDate(act.timestamp) }}</td><td>{{ act.employeeName }}</td><td><span class="tag" :style="typeBadge(act.type)">{{ act.type || 'Paiement' }}</span></td><td style="font-weight:bold;">{{ formatMoney(act.net) }}</td></tr>
                                    <tr v-if="recentActivity.length === 0"><td colspan="4">Aucune activité récente</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div v-if="currentSalaireView === 'employees'">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 15px;"><h2>👥 Gestion des Employés</h2><button v-if="isSuperAdmin" class="btn btn-success" @click="showAddEmployeeModal = true">+ Nouvel Employé</button></div>
                        <div style="margin-bottom: 15px;"><input type="text" v-model="searchQuery" placeholder="Rechercher un employé..." style="padding:8px; width:100%; max-width:300px; border-radius:6px; border:1px solid #ccc;"></div>
                        <table class="table">
                            <thead><tr><th>Nom</th><th>Salaire de base</th><th>Prêt en cours</th><th>Parts Tontine</th><th>Actions</th></tr></thead>
                            <tbody>
                                <tr v-for="emp in filteredEmployees" :key="emp.id">
                                    <td><b>{{ emp.name }}</b></td><td>{{ formatMoney(emp.salary) }}</td><td :style="{color: emp.loan > 0 ? '#ef4444' : '#10b981'}">{{ formatMoney(emp.loan) }}</td><td><span class="tag" style="background:#f59e0b; color:white;">{{ emp.tontineCount || 0 }}</span></td>
                                    <td><button class="btn btn-small" @click="openIndividualHistory(emp)">📜 Historique</button> <button class="btn btn-small" @click="openDebtModal(emp)" v-if="emp.loan > 0">💰 Prêts</button> <button class="btn btn-small" style="background:#3b82f6; color:white;" @click="openEditEmployee(emp)" v-if="isSuperAdmin">✏️ Modifier</button> <button class="btn btn-small btn-danger" @click="deleteEmployee(emp.id)" v-if="isSuperAdmin">🗑️ Suppr.</button></td>
                                </tr>
                                <tr v-if="filteredEmployees.length === 0"><td colspan="5">Aucun employé trouvé.</td></tr>
                            </tbody>
                            <tfoot v-if="filteredEmployees.length > 0">
                                <tr style="background:#f1f5f9; font-weight:bold;">
                                    <td>Total ({{ filteredEmployeesTotals.count }})</td>
                                    <td>{{ formatMoney(filteredEmployeesTotals.salary) }}</td>
                                    <td :style="{color: filteredEmployeesTotals.loan > 0 ? '#ef4444' : '#10b981'}">{{ formatMoney(filteredEmployeesTotals.loan) }}</td>
                                    <td><span class="tag" style="background:#f59e0b; color:white;">{{ filteredEmployeesTotals.parts }}</span></td>
                                    <td>—</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    <div v-if="currentSalaireView === 'paie'">
                        <h2>💰 Validation de la Paie</h2>
                        <div style="display:flex; gap:15px; margin-bottom:20px; align-items:center; background:#f8fafc; padding:15px; border-radius:8px;">
                            <div><label>Mois cible :</label><input type="month" v-model="selectedPaieMonth" style="padding:6px; border-radius:4px; border:1px solid #ccc;"></div>
                            <div><label>Période :</label><select v-model="paiePeriod" style="padding:6px; border-radius:4px; border:1px solid #ccc;"><option value="15">Acompte (15 du mois)</option><option value="30">Solde (Fin du mois)</option></select></div>
                        </div>
                        <table class="table">
                            <thead><tr><th>Employé</th><th>A Payer (Base)</th><th>Retenue Tontine</th><th>Retenue Prêt</th><th>Net Estimé</th><th>Action</th></tr></thead>
                            <tbody>
                                <tr v-for="emp in unpaidEmployees" :key="emp.id">
                                    <td><b>{{ emp.name }}</b></td><td>{{ formatMoney(calculateBase(emp)) }}</td><td style="color:#f59e0b;">- {{ formatMoney(calculateTontineDeduc(emp)) }}</td><td style="color:#ef4444;">- {{ formatMoney(calculateLoanDeduc(emp)) }}</td><td style="font-weight:bold; color:#10b981;">{{ formatMoney(calculateNet(emp)) }}</td>
                                    <td><button class="btn btn-success btn-small" @click="openPayModal(emp)" v-if="isSuperAdmin && calculateBase(emp) > 0">Payer</button></td>
                                </tr>
                                <tr v-if="unpaidEmployees.length === 0"><td colspan="6" style="text-align:center;">Tout le monde a été payé pour cette période.</td></tr>
                            </tbody>
                            <tfoot v-if="unpaidEmployees.length > 0">
                                <tr style="background:#f1f5f9; font-weight:bold;">
                                    <td>Total ({{ unpaidEmployees.length }})</td>
                                    <td>{{ formatMoney(paieTotals.base) }}</td>
                                    <td style="color:#f59e0b;">- {{ formatMoney(paieTotals.tontine) }}</td>
                                    <td style="color:#ef4444;">- {{ formatMoney(paieTotals.loan) }}</td>
                                    <td style="color:#10b981;">{{ formatMoney(paieTotals.net) }}</td>
                                    <td>—</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    <div v-if="currentSalaireView === 'tontine'">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;"><h2>🤝 Gestion de la Tontine</h2><div v-if="isSuperAdmin" style="display:flex; align-items:center; gap:10px;"><label>Montant par part (15aine):</label><input type="number" v-model="globalTontineAmount" style="padding:6px; width:100px;"><button class="amt-btn amt-btn-primary amt-btn-sm" @click="saveGlobalTontine">Enregistrer</button></div></div>
                        <div style="display:flex; gap:15px; margin-bottom:20px; align-items:center; background:#fffbeb; padding:15px; border-radius:8px; border:1px solid #fde68a; flex-wrap:wrap;">
                            <div><label>Mois :</label> <input type="month" v-model="selectedTontineMonth" style="padding:6px;"></div>
                            <div><label>Quinzaine :</label> <select v-model="selectedTontinePeriod" style="padding:6px;"><option value="15">Acompte (15)</option><option value="30">Solde (30)</option></select></div>
                            <div style="margin-left:auto; text-align:right;">
                                <div style="font-size:16px;">Cagnotte par quinzaine : <b style="color:#d97706;">{{ formatMoney(tontinePotPerPeriod) }}</b></div>
                                <div style="font-size:12px; color:#92400e;">2 tirages / mois (le 15 et le 30) — Total mois : <b>{{ formatMoney(tontinePot) }}</b></div>
                            </div>
                        </div>

                        <div v-if="isSuperAdmin" style="margin-bottom:15px; padding:12px 15px; background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
                            <div style="font-size:13px; color:#075985;">
                                <b>Cycle en cours :</b>
                                <span v-if="allTontineMembersWonCycle" style="color:#15803d; margin-left:6px;">✅ Tous les participants ont reçu leur dû. Vous pouvez démarrer un nouveau cycle.</span>
                                <span v-else style="margin-left:6px;">Cycle ouvert — certains participants n'ont pas encore récupéré toutes leurs parts.</span>
                            </div>
                            <button class="btn btn-success btn-small" :disabled="!allTontineMembersWonCycle" @click="resetTontineCycle" :style="{opacity: allTontineMembersWonCycle ? 1 : 0.5, cursor: allTontineMembersWonCycle ? 'pointer' : 'not-allowed'}">
                                🔄 Démarrer un nouveau cycle
                            </button>
                        </div>
                        <table class="table">
                            <thead><tr><th>Employé</th><th>Part N°</th><th>Statut Cotisation</th><th>Action Gain</th></tr></thead>
                            <tbody>
                                <tr v-for="emp in tontineMembers" :key="emp.uniqueId">
                                    <td><b>{{ emp.name }}</b></td><td>Part {{ emp.shareIndex }}</td>
                                    <td><span v-if="hasPaidTontine(emp.id, emp.shareIndex)" class="tag" style="background:#10b981; color:white;">Cotisé</span><span v-else class="tag" style="background:#ef4444; color:white;">Non Cotisé</span></td>
                                    <td><button class="btn btn-warning btn-small" @click="markTontineBeneficiary(emp)" v-if="isSuperAdmin && !hasReceivedTontine(emp)">🏆 Marquer Gagnant</button><span v-if="hasReceivedTontine(emp)" style="color:#10b981; font-weight:bold;">✅ Déjà gagné</span></td>
                                </tr>
                            </tbody>
                            <tfoot v-if="tontineMembers.length > 0">
                                <tr style="background:#f1f5f9; font-weight:bold;">
                                    <td colspan="2">Total parts : {{ tontineMembers.length }}</td>
                                    <td colspan="2" style="color:#d97706;">Cagnotte / quinzaine : {{ formatMoney(tontinePotPerPeriod) }} <span style="color:#94a3b8; font-weight:normal;">(× 2 = {{ formatMoney(tontinePot) }} sur le mois)</span></td>
                                </tr>
                            </tfoot>
                        </table>

                        <div class="card" style="margin-top:25px;">
                            <h3 style="margin-top:0;">📜 Historique des gains de tontine</h3>
                            <table class="table">
                                <thead><tr><th>Date</th><th>Employé</th><th>Mois</th><th>Période</th><th>Cycle</th><th>Montant</th><th v-if="isSuperAdmin">Action</th></tr></thead>
                                <tbody>
                                    <tr v-for="g in tontineGainHistory" :key="g.id">
                                        <td>{{ formatDate(g.timestamp) }}</td>
                                        <td><b>{{ g.employeeName }}</b></td>
                                        <td>{{ g.month }}</td>
                                        <td>{{ g.period === '15' ? 'Acompte (15)' : 'Solde (Fin)' }}</td>
                                        <td>
                                            <span v-if="isCurrentCycleGain(g)" class="tag" style="background:#10b981; color:white;">En cours</span>
                                            <span v-else class="tag" style="background:#94a3b8; color:white;">Terminé</span>
                                        </td>
                                        <td style="font-weight:bold; color:#d97706;">{{ formatMoney(g.tontineGain || 0) }}</td>
                                        <td v-if="isSuperAdmin"><button class="btn btn-small btn-danger" @click="deleteTontineBeneficiary(g)" title="Annuler ce gain">🗑️</button></td>
                                    </tr>
                                    <tr v-if="tontineGainHistory.length === 0"><td colspan="7" style="text-align:center;">Aucun gain enregistré pour le moment.</td></tr>
                                </tbody>
                                <tfoot v-if="tontineGainHistory.length > 0">
                                    <tr style="background:#f1f5f9; font-weight:bold;">
                                        <td colspan="5">Total ({{ tontineGainHistory.length }} gains, tous cycles confondus)</td>
                                        <td style="color:#d97706;">{{ formatMoney(tontineGainTotal) }}</td>
                                        <td v-if="isSuperAdmin">—</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>

                    <div v-if="currentSalaireView === 'history'">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;"><h2>📜 Historique & Export</h2><button class="btn btn-danger" @click="exportSalaryHistoryPDF">📄 Exporter PDF Global</button></div>
                        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap:15px;">
                            <div v-for="group in groupedSalaryHistory" :key="group.month" class="card" style="cursor:pointer;" @click="openMonthDetails(group)">
                                <h3>Mois : {{ group.month }}</h3>
                                <div style="display:flex; justify-content:space-between; margin-bottom:5px;"><span>Budget Alloué:</span><b>{{ formatMoney(group.totalFund) }}</b></div>
                                <div style="display:flex; justify-content:space-between; margin-bottom:5px;"><span>Total Payé:</span><b style="color:#ef4444;">{{ formatMoney(group.totalSpent) }}</b></div>
                                <div style="display:flex; justify-content:space-between; margin-top:10px; border-top:1px solid #eee; padding-top:10px;"><span>Solde Restant:</span><b :style="{color: group.balance >= 0 ? '#10b981' : '#ef4444'}">{{ formatMoney(group.balance) }}</b></div>
                            </div>
                        </div>
                    </div>

                    <!-- MODALS -->
                    <div v-if="showAddEmployeeModal" class="modal active" style="display:flex;"><div class="modal-content" style="max-width:400px;"><span class="close-modal" @click="showAddEmployeeModal = false">&times;</span><h2>Nouvel Employé</h2><div class="form-group"><label>Nom Complet</label><input type="text" v-model="newEmp.name"></div><div class="form-group"><label>Salaire Mensuel (CFA)</label><input type="number" v-model="newEmp.salary"></div><div class="form-group"><label>Prêt Initial (Optionnel)</label><input type="number" v-model="newEmp.loan"></div><div class="form-group"><label>Nombre de parts Tontine</label><input type="number" v-model="newEmp.tontineCount" min="0"></div><button class="btn btn-success" style="width:100%; margin-top:15px;" @click="saveNewEmployee" :disabled="actionLoading">Enregistrer</button></div></div>
                    <div v-if="showEditEmployeeModal" class="modal active" style="display:flex;"><div class="modal-content" style="max-width:400px;"><span class="close-modal" @click="showEditEmployeeModal = false">&times;</span><h2>Modifier Employé</h2><div class="form-group"><label>Nom Complet</label><input type="text" v-model="editingEmp.name"></div><div class="form-group"><label>Salaire Mensuel (CFA)</label><input type="number" v-model="editingEmp.salary"></div><div class="form-group"><label>Prêt Restant</label><input type="number" v-model="editingEmp.loan"></div><div class="form-group"><label>Nombre de parts Tontine</label><input type="number" v-model="editingEmp.tontineCount" min="0"></div><button class="amt-btn amt-btn-primary" style="width:100%; margin-top:15px;" @click="updateEmployee" :disabled="actionLoading">Mettre à jour</button></div></div>
                    <div v-if="showPayModal" class="modal active" style="display:flex;"><div class="modal-content" style="max-width:500px;"><span class="close-modal" @click="showPayModal = false">&times;</span><h2>Paiement : {{ payForm.name }}</h2><p style="color:#64748b; font-size:14px; margin-top:0;">Période : {{ payForm.month }} ({{ paiePeriod === '15' ? 'Acompte' : 'Solde' }})</p><div class="form-group"><label>Base à payer (CFA) — max : {{ formatMoney(payForm.maxBase) }}</label><input type="number" v-model.number="payForm.base" @input="recalcNet" :max="payForm.maxBase" min="0"><div style="font-size:11px; color:#64748b; margin-top:4px;">Vous pouvez saisir un montant inférieur si l'employé souhaite ne recevoir qu'une partie de sa quinzaine.</div></div><div class="form-group"><label>Retenue Prêt (CFA) - Max: {{ formatMoney(payForm.maxLoan) }}</label><input type="number" v-model="payForm.loan" @input="recalcNet" :max="payForm.maxLoan"></div><div class="form-group"><label>Retenue Tontine (CFA)</label><input type="number" v-model="payForm.tontine" @input="recalcNet"></div><div class="form-group"><label>Autre retenue (Absence, etc.)</label><input type="number" v-model="payForm.absence" @input="recalcNet"></div><div style="margin-top:20px; padding:15px; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; text-align:center;"><div style="font-size:12px; color:#166534; text-transform:uppercase;">Net à Verser</div><div style="font-size:24px; font-weight:bold; color:#15803d;">{{ formatMoney(payForm.net) }}</div></div><button class="btn btn-success" style="width:100%; margin-top:20px;" @click="confirmSalaryPayment" :disabled="actionLoading || payForm.net < 0">✅ Valider le Paiement</button></div></div>
                    <div v-if="selectedHistoryMonth" class="modal active" style="display:flex;"><div class="modal-content modal-lg" style="max-width:800px;"><span class="close-modal" @click="closeMonthDetails">&times;</span><h2>Détails : {{ selectedHistoryMonth.month }}</h2><table class="table"><thead><tr><th>Date</th><th>Employé</th><th>Type</th><th>Tontine</th><th>Prêt</th><th>Absence</th><th>Net Payé</th><th>Action</th></tr></thead><tbody><tr v-for="pay in selectedHistoryMonth.payments" :key="pay.id"><td>{{ formatDate(pay.timestamp) }}</td><td><b>{{ pay.employeeName }}</b></td><td><span class="tag" :style="typeBadge(pay.type)">{{ pay.type || 'Paiement' }}</span></td><td style="color:#f59e0b;">{{ pay.tontine > 0 ? formatMoney(pay.tontine) : '-' }}</td><td style="color:#ef4444;">{{ pay.loan > 0 ? formatMoney(pay.loan) : '-' }}</td><td style="color:#ef4444;">{{ pay.absence > 0 ? formatMoney(pay.absence) : '-' }}</td><td style="font-weight:bold; color:#10b981;">{{ formatMoney(pay.net) }}</td><td><button class="btn btn-small" @click="printPayslip(pay)">📄 Reçu</button> <button class="btn btn-small btn-danger" @click="deleteSalaryPayment(pay)" v-if="isSuperAdmin">🗑️</button></td></tr></tbody><tfoot v-if="selectedHistoryMonth.payments.length > 0"><tr style="background:#f1f5f9; font-weight:bold;"><td colspan="3">Total ({{ monthDetailsTotals.count }})</td><td style="color:#f59e0b;">{{ formatMoney(monthDetailsTotals.tontine) }}</td><td style="color:#ef4444;">{{ formatMoney(monthDetailsTotals.loan) }}</td><td style="color:#ef4444;">{{ formatMoney(monthDetailsTotals.absence) }}</td><td style="color:#10b981;">{{ formatMoney(monthDetailsTotals.net) }}</td><td>—</td></tr></tfoot></table></div></div>
                    <div v-if="showIndividualHistoryModal" class="modal active" style="display:flex;"><div class="modal-content" style="max-width:700px;"><span class="close-modal" @click="showIndividualHistoryModal = false">&times;</span><h2>Historique : {{ selectedEmployeeHistoryName }}</h2><table class="table"><thead><tr><th>Mois</th><th>Type</th><th>Base</th><th>Tontine</th><th>Prêt</th><th>Net</th></tr></thead><tbody><tr v-for="pay in individualHistory" :key="pay.id"><td>{{ pay.month }} <small>({{ pay.period === '15' ? 'Acompte' : 'Solde' }})</small></td><td><span class="tag" :style="typeBadge(pay.type)">{{ pay.type || 'Paiement' }}</span></td><td>{{ formatMoney(pay.base) }}</td><td style="color:#f59e0b;">{{ pay.tontine > 0 ? '-' + formatMoney(pay.tontine) : '-' }}</td><td style="color:#ef4444;">{{ pay.loan > 0 ? '-' + formatMoney(pay.loan) : '-' }}</td><td style="font-weight:bold; color:#10b981;">{{ formatMoney(pay.net) }}</td></tr><tr v-if="individualHistory.length === 0"><td colspan="6">Aucun historique.</td></tr></tbody><tfoot v-if="individualHistory.length > 0"><tr style="background:#f1f5f9; font-weight:bold;"><td colspan="2">Total ({{ individualHistoryTotals.count }})</td><td>{{ formatMoney(individualHistoryTotals.base) }}</td><td style="color:#f59e0b;">- {{ formatMoney(individualHistoryTotals.tontine) }}</td><td style="color:#ef4444;">- {{ formatMoney(individualHistoryTotals.loan) }}</td><td style="color:#10b981;">{{ formatMoney(individualHistoryTotals.net) }}</td></tr></tfoot></table></div></div>
                    <div v-if="showDebtModal" class="modal active" style="display:flex;"><div class="modal-content" style="max-width:600px;"><span class="close-modal" @click="showDebtModal = false">&times;</span><h2>Suivi Prêt : {{ selectedDebtEmployee?.name }}</h2><div style="display:flex; justify-content:space-around; background:#f8fafc; padding:15px; border-radius:8px; margin-bottom:20px;"><div style="text-align:center;"><div style="font-size:12px; color:#64748b;">Reste à payer</div><div style="font-size:20px; font-weight:bold; color:#ef4444;">{{ formatMoney(selectedDebtEmployee?.loan || 0) }}</div></div><div style="text-align:center;"><div style="font-size:12px; color:#64748b;">Déjà remboursé</div><div style="font-size:20px; font-weight:bold; color:#10b981;">{{ formatMoney(getEmployeeRepaidTotal(selectedDebtEmployee?.id)) }}</div></div></div><h3>Historique des remboursements</h3><table class="table"><thead><tr><th>Mois</th><th>Date</th><th>Montant Remboursé</th></tr></thead><tbody><tr v-for="rep in debtRepaymentHistory" :key="rep.id"><td>{{ rep.month }} <small>({{ rep.period === '15' ? 'Acompte' : 'Solde' }})</small></td><td>{{ formatDate(rep.timestamp) }}</td><td style="font-weight:bold; color:#10b981;">+ {{ formatMoney(rep.loan) }}</td></tr><tr v-if="debtRepaymentHistory.length === 0"><td colspan="3" style="text-align:center;">Aucun remboursement enregistré.</td></tr></tbody></table></div></div>
                </div>
                <div v-else-if="authLoading" style="padding: 50px; text-align: center;"><i class="fas fa-spinner fa-spin fa-2x"></i><br>Chargement...</div>
                <div v-else style="padding: 50px; text-align: center;"><h2>Authentification requise</h2></div>
            </div>
        `;
        
        setTimeout(() => this.initLogic(), 50);
    },

    initLogic() {
        console.log("✅ Mode Production (Salaire) : Connecté");

        // Demonter l'instance Vue precedente si on revient sur la page,
        // sinon les onSnapshot precedents fuitent (4 ecouteurs par visite).
        if (this.vueApp) { try { this.vueApp.unmount(); } catch (e) { /* deja demonte */ } this.vueApp = null; }

        this.vueApp = createApp({
            setup() {
                const user = ref(null);
                const authLoading = ref(true);
                const loginForm = ref({ email: '', password: '' });
                const loginError = ref('');
                const isAdmin = computed(() => {
                    const role = sessionStorage.getItem('userRole');
                    return role === 'admin' || role === 'super_admin';
                });
                const isSuperAdmin = computed(() => {
                    const role = sessionStorage.getItem('userRole');
                    return role === 'super_admin';
                });

                const currentSalaireView = ref('dashboard'); 
                const employeesList = ref([]);
                const salaryHistory = ref([]);
                const salaryFunds = ref([]); 
                const paiePeriod = ref("15"); 
                
                const showAddEmployeeModal = ref(false);
                const showEditEmployeeModal = ref(false); 
                const showIndividualHistoryModal = ref(false); 
                const showPayModal = ref(false);
                const showFundModal = ref(false);
                const showDebtModal = ref(false);

                const newEmp = ref({ name: '', salary: 0, loan: 0, tontineCount: 0 });
                const editingEmp = ref({}); 
                const selectedEmployeeHistoryId = ref(null);
                const selectedEmployeeHistoryName = ref('');
                const payForm = ref({});
                const newFund = ref({ amount: '', note: '' });
                
                const globalTontineAmount = ref(10000);
                // Date du dernier reset du cycle de tontine (par agence). Tous
                // les « Gain Tontine » anterieurs sont ignores pour le decompte
                // des dus. Initial : null = aucun reset (compte depuis l'origine).
                const tontineResetAt = ref(null);
                const selectedBudgetMonth = ref(new Date().toISOString().slice(0, 7));
                const selectedPaieMonth = ref(new Date().toISOString().slice(0, 7));
                const selectedTontineMonth = ref(new Date().toISOString().slice(0, 7));
                const selectedTontinePeriod = ref("15");
                const selectedHistoryMonth = ref(null);
                const searchQuery = ref('');
                const toast = ref({ show: false, message: '', type: 'success' });
                const actionLoading = ref(false);
                const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'abidjan';

                // Suivi des onSnapshot pour les arreter quand la page se demonte
                // (sinon : fuite memoire, ecouteurs cumules visite apres visite).
                const unsubs = [];

                // --- CHARGEMENT DES DONNÉES ---
                // getCollectionName('employees') : cloisonnement par route SaaS
                // (abidjan -> 'employees', abidjan_chine -> 'employees_chine').
                // Filtre isDeleted : on saute les suppressions logiques.
                const loadEmployees = () => {
                     const u = onSnapshot(collection(db, getCollectionName("employees")), (snap) => {
                        let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                        list = list.filter(d => (d.agency || 'abidjan') === activeAgency && !d.isDeleted);
                        list.sort((a, b) => a.name.localeCompare(b.name));
                        employeesList.value = list;
                    });
                    unsubs.push(u);
                };

                const loadSalaryHistory = () => {
                     const u = onSnapshot(query(collection(db, getCollectionName("salary_payments")), orderBy('timestamp', 'desc')), (snap) => {
                        let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                        list = list.filter(d => (d.agency || 'abidjan') === activeAgency && !d.isDeleted);
                        salaryHistory.value = list;
                    });
                    unsubs.push(u);
                };

                const loadSalaryFunds = () => {
                     const u = onSnapshot(query(collection(db, getCollectionName("salary_funds")), orderBy('timestamp', 'desc')), (snap) => {
                        let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                        list = list.filter(d => (d.agency || 'abidjan') === activeAgency && !d.isDeleted);
                        salaryFunds.value = list;
                    });
                    unsubs.push(u);
                };

                const getMonthlySummary = (emp, month) => {
                    const payments = salaryHistory.value.filter(p => p.employeeId === emp.id && p.month === month);
                    
                    const totalNetPaid = payments.reduce((sum, p) => sum + (p.net || 0), 0);
                    const totalLoanPaid = payments.reduce((sum, p) => sum + (p.loan || 0), 0);
                    const totalTontinePaid = payments.reduce((sum, p) => sum + (p.tontine || 0), 0);
                    
                    const totalGrossPaid = payments.reduce((sum, p) => sum + (p.base || 0), 0);

                    return { totalNetPaid, totalLoanPaid, totalTontinePaid, totalGrossPaid };
                };

                const calculateBase = (emp) => {
                    const summary = getMonthlySummary(emp, selectedPaieMonth.value);

                    if (paiePeriod.value === '15') {
                        const target = Math.round(emp.salary / 2);
                        const remaining = target - summary.totalGrossPaid;
                        return Math.max(0, remaining);
                    }
                    
                    if (paiePeriod.value === '30') {
                        const target = emp.salary;
                        const remaining = target - summary.totalGrossPaid;
                        return Math.max(0, remaining);
                    }
                    return 0;
                };

                const calculateTontineDeduc = (emp) => {
                    const count = parseInt(emp.tontineCount || (emp.isTontine ? 1 : 0));
                    if (count <= 0) return 0;
                    
                    const tontinePerPeriod = count * (parseFloat(globalTontineAmount.value) || 0);
                    const currentP = paiePeriod.value; 

                    if (currentP === '15') {
                        const paidThisPeriod = salaryHistory.value.filter(p => 
                            p.employeeId === emp.id && 
                            p.month === selectedPaieMonth.value && 
                            p.period === '15'
                        ).reduce((sum, p) => sum + (parseFloat(p.tontine) || 0), 0);

                        return Math.max(0, tontinePerPeriod - paidThisPeriod);
                    }

                    if (currentP === '30') {
                        const totalMonthlyTarget = tontinePerPeriod * 2;

                        const totalPaidThisMonth = salaryHistory.value.filter(p => 
                            p.employeeId === emp.id && 
                            p.month === selectedPaieMonth.value
                        ).reduce((sum, p) => sum + (parseFloat(p.tontine) || 0), 0);

                        return Math.max(0, totalMonthlyTarget - totalPaidThisMonth);
                    }

                    return 0; 
                };

                const calculateLoanDeduc = (emp) => {
                    if (!emp.loan || emp.loan <= 0) return 0;
                    const standardDeduc = Math.min(emp.loan, 10000);
                    const base = calculateBase(emp);
                    const tontine = calculateTontineDeduc(emp);
                    const available = Math.max(0, base - tontine);
                    return Math.min(standardDeduc, available);
                };

                const calculateNet = (emp) => {
                    const base = calculateBase(emp);
                    const loan = calculateLoanDeduc(emp);
                    const tontine = calculateTontineDeduc(emp);
                    return Math.max(0, base - loan - tontine);
                };

                const unpaidEmployees = computed(() => {
                    return employeesList.value.filter(emp => {
                        const remaining = calculateBase(emp);
                        return remaining > 0;
                    });
                });

                const paieTotals = computed(() => {
                    let t = { base: 0, loan: 0, tontine: 0, net: 0 };
                    unpaidEmployees.value.forEach(emp => {
                        t.base += calculateBase(emp);
                        t.loan += calculateLoanDeduc(emp);
                        t.tontine += calculateTontineDeduc(emp);
                        t.net += calculateNet(emp);
                    });
                    return t;
                });

                const employeesTotals = computed(() => {
                    return employeesList.value.reduce((acc, emp) => {
                        acc.salary += (parseFloat(emp.salary) || 0);
                        acc.loan += (parseFloat(emp.loan) || 0);
                        const count = parseInt(emp.tontineCount || (emp.isTontine ? 1 : 0));
                        acc.tontine += count * (parseFloat(globalTontineAmount.value) || 0) * 2;
                        return acc;
                    }, { salary: 0, loan: 0, tontine: 0 });
                });

                // Totaux pieds de tableau (basés sur la liste FILTRÉE par
                // la recherche : si l'utilisateur tape un nom, les totaux
                // s'ajustent au sous-ensemble visible).
                const filteredEmployeesTotals = computed(() => {
                    const list = filteredEmployees.value;
                    let salary = 0, loan = 0, parts = 0;
                    list.forEach(e => {
                        salary += parseFloat(e.salary) || 0;
                        loan += parseFloat(e.loan) || 0;
                        parts += parseInt(e.tontineCount || (e.isTontine ? 1 : 0));
                    });
                    return { count: list.length, salary, loan, parts };
                });

                // Total des paiements affiches dans le modal historique mensuel.
                const monthDetailsTotals = computed(() => {
                    const grp = selectedHistoryMonth.value;
                    if (!grp) return { tontine: 0, loan: 0, absence: 0, net: 0, count: 0 };
                    let t = { tontine: 0, loan: 0, absence: 0, net: 0, count: grp.payments.length };
                    grp.payments.forEach(p => {
                        t.tontine += parseFloat(p.tontine) || 0;
                        t.loan += parseFloat(p.loan) || 0;
                        t.absence += parseFloat(p.absence) || 0;
                        t.net += parseFloat(p.net) || 0;
                    });
                    return t;
                });

                // Total de l'historique individuel d'un employe.
                const individualHistoryTotals = computed(() => {
                    let t = { base: 0, tontine: 0, loan: 0, net: 0, count: individualHistory.value.length };
                    individualHistory.value.forEach(p => {
                        t.base += parseFloat(p.base) || 0;
                        t.tontine += parseFloat(p.tontine) || 0;
                        t.loan += parseFloat(p.loan) || 0;
                        t.net += parseFloat(p.net) || 0;
                    });
                    return t;
                });

                const filteredEmployees = computed(() => {
                    if (!searchQuery.value) return employeesList.value;
                    const q = searchQuery.value.toLowerCase();
                    return employeesList.value.filter(emp => 
                        emp.name.toLowerCase().includes(q)
                    );
                });

                const showToast = (msg, type = 'success') => {
                    toast.value = { show: true, message: msg, type };
                    setTimeout(() => toast.value.show = false, 3000);
                };

                const openPayModal = (emp) => {
                    const baseAmount = calculateBase(emp);
                    const suggestedLoan = calculateLoanDeduc(emp);
                    const tontineAmount = calculateTontineDeduc(emp);

                    const count = parseInt(emp.tontineCount || (emp.isTontine ? 1 : 0));
                    const tontineTotal = count * (parseFloat(globalTontineAmount.value) || 0);

                    payForm.value = {
                        id: emp.id,
                        name: emp.name,
                        month: selectedPaieMonth.value,
                        base: baseAmount,
                        maxBase: baseAmount,
                        loan: suggestedLoan,
                        maxLoan: emp.loan || 0,
                        tontine: tontineAmount,
                        tontineTotal: tontineTotal,
                        absence: 0,
                        net: baseAmount - suggestedLoan - tontineAmount
                    };
                    showPayModal.value = true;
                };

                const recalcNet = () => {
                    // La base ne peut pas depasser le solde restant pour la
                    // periode (maxBase calcule a l'ouverture). On laisse le
                    // pret/tontine modifiables par l'utilisateur, leur plafond
                    // s'applique normalement.
                    const b = parseFloat(payForm.value.base) || 0;
                    if (b < 0) payForm.value.base = 0;
                    else if (b > payForm.value.maxBase) payForm.value.base = payForm.value.maxBase;

                    if (payForm.value.loan > payForm.value.maxLoan) payForm.value.loan = payForm.value.maxLoan;
                    payForm.value.net = (parseFloat(payForm.value.base) || 0) - (parseFloat(payForm.value.loan) || 0) - (parseFloat(payForm.value.tontine) || 0) - (parseFloat(payForm.value.absence) || 0);
                };

                const updateBaseFromNet = () => {
                    payForm.value.base = (parseFloat(payForm.value.net) || 0) + (parseFloat(payForm.value.loan) || 0) + (parseFloat(payForm.value.tontine) || 0) + (parseFloat(payForm.value.absence) || 0);
                };

                const confirmSalaryPayment = async () => {
                    if(!isSuperAdmin.value) return;
                    const hasBudget = salaryFunds.value.some(f => f.targetMonth === payForm.value.month);
                    if (!hasBudget) {
                        window.AppModal.error(`Impossible d'effectuer un paiement pour ${payForm.value.month} : Aucun fonds n'a été alloué pour ce mois.`, "Absence de budget");
                        return;
                    }
                    actionLoading.value = true;

                    try {
                        // 1) Paiement salaire + ajustement pret en transaction atomique.
                        //    Pre-genere aussi la reference de depense caisse pour que
                        //    le paiement et l'ecriture caisse soient lies (expenseId).
                        const expenseRef = doc(collection(db, getCollectionName("expenses")));
                        let createdPaymentId = null;
                        await runTransaction(db, async (transaction) => {
                            const empRef = doc(db, getCollectionName("employees"), payForm.value.id);
                            const empDoc = await transaction.get(empRef);
                            if (!empDoc.exists()) throw "Employé introuvable !";

                            const currentLoan = empDoc.data().loan || 0;
                            const newLoan = Math.max(0, currentLoan - payForm.value.loan);

                            const newPaymentRef = doc(collection(db, getCollectionName("salary_payments")));
                            createdPaymentId = newPaymentRef.id;
                            transaction.set(newPaymentRef, {
                                employeeId: payForm.value.id,
                                employeeName: payForm.value.name,
                                month: payForm.value.month,
                                type: paiePeriod.value === '15' ? 'Acompte (15)' : 'Solde (Fin)',
                                base: payForm.value.base,
                                period: paiePeriod.value,
                                loan: payForm.value.loan,
                                tontine: payForm.value.tontine,
                                absence: payForm.value.absence || 0,
                                net: payForm.value.net,
                                timestamp: Timestamp.now(),
                                agency: activeAgency,
                                isDeleted: false,
                                expenseId: expenseRef.id
                            });

                            if (payForm.value.loan > 0) {
                                transaction.update(empRef, { loan: newLoan });
                            }
                        });

                        // 2) Ecriture caisse correspondante (sortie en Especes par
                        //    defaut). Si elle echoue, on log mais on n'annule pas
                        //    le paiement salaire (l'audit retrouve toujours la
                        //    trace via 'salary_payments').
                        try {
                            const today = new Date().toISOString().slice(0, 10);
                            await setDoc(expenseRef, {
                                date: today,
                                description: `Salaire ${payForm.value.name} — ${payForm.value.month} (${paiePeriod.value === '15' ? 'Acompte' : 'Solde'})`,
                                montant: parseFloat(payForm.value.net) || 0,
                                action: 'Depense',
                                type: 'Salaire',
                                mode: 'Espèce',
                                conteneur: '',
                                vehicleId: '',
                                agency: activeAgency,
                                isDeleted: false,
                                modeExpedition: sessionStorage.getItem('shippingMode') || 'maritime',
                                salaryPaymentId: createdPaymentId,
                                timestamp: Timestamp.now()
                            });
                        } catch (e) { console.warn('Ecriture caisse (salaire) :', e && e.message); }

                        showPayModal.value = false;
                        showToast("Paiement enregistré avec succès !", "success");
                    } catch(e) { showToast("Erreur: " + e.message, "error"); }
                    finally { actionLoading.value = false; }
                };

                const saveGlobalTontine = async () => {
                    if(!isSuperAdmin.value) return;
                    try {
                        await setDoc(doc(db, "settings", "salary"), { tontineAmount: globalTontineAmount.value }, { merge: true });
                        showToast("Nouveau montant de tontine enregistré !");
                    } catch(e) { showToast("Erreur : " + e.message, "error"); }
                };

                const saveNewEmployee = async () => {
                    if(!isSuperAdmin.value) return;
                    if(!newEmp.value.name) return;
                    actionLoading.value = true;
                    try {
                        const newEmpRef = doc(collection(db, getCollectionName("employees")));
                        await setDoc(newEmpRef, {
                            name: newEmp.value.name, salary: newEmp.value.salary || 0, loan: newEmp.value.loan || 0, tontineCount: newEmp.value.tontineCount || 0, isTontine: (newEmp.value.tontineCount || 0) > 0, agency: activeAgency, isDeleted: false
                        });
                        showAddEmployeeModal.value = false;
                        newEmp.value = { name: '', salary: 0, loan: 0, tontineCount: 0 };
                        showToast("Employé ajouté avec succès !");
                    } catch(e) { showToast("Erreur: " + e.message, "error"); }
                    finally { actionLoading.value = false; }
                };

                const openEditEmployee = (emp) => { editingEmp.value = { ...emp }; showEditEmployeeModal.value = true; };
                const updateEmployee = async () => {
                    if(!isSuperAdmin.value) return;
                    actionLoading.value = true;
                    try {
                        await updateDoc(doc(db, getCollectionName("employees"), editingEmp.value.id), { name: editingEmp.value.name, salary: editingEmp.value.salary, loan: editingEmp.value.loan, tontineCount: editingEmp.value.tontineCount || 0, isTontine: (editingEmp.value.tontineCount || 0) > 0 });
                        showEditEmployeeModal.value = false;
                        showToast("Modifications enregistrées !");
                    } catch(e) { showToast("Erreur: " + e.message, "error"); }
                    finally { actionLoading.value = false; }
                };
                // Soft-delete : conserve la trace (audit) et permet une
                // restauration manuelle plus tard. La liste filtre isDeleted.
                const deleteEmployee = async (id) => {
                    if(!isSuperAdmin.value) return;
                    if(await window.AppModal.confirm("Supprimer cet employé ?", "Suppression", true)) {
                        await updateDoc(doc(db, getCollectionName("employees"), id), { isDeleted: true, deletedAt: Timestamp.now() });
                    }
                };

                const cancelTontine = async (emp) => {
                    if(!isSuperAdmin.value) return;
                    if (!await window.AppModal.confirm(`Voulez-vous vraiment annuler toutes les parts de tontine pour ${emp.name} ?`, "Annulation", true)) return;
                    try {
                        await updateDoc(doc(db, getCollectionName("employees"), emp.id), { tontineCount: 0, isTontine: false });
                        showToast(`La tontine pour ${emp.name} a été annulée.`);
                    } catch (e) { showToast("Erreur : " + e.message, "error"); }
                };

                const deleteSalaryPayment = async (payment) => {
                     if(!isSuperAdmin.value) return;
                     if(!await window.AppModal.confirm("Annuler ce paiement ?", "Annulation", true)) return;
                     try {
                        if(payment.loan > 0) {
                            const emp = employeesList.value.find(e => e.id === payment.employeeId);
                            if(emp) await updateDoc(doc(db, getCollectionName("employees"), payment.employeeId), { loan: emp.loan + payment.loan });
                        }
                        // Soft-delete + annulation de l'ecriture caisse liee.
                        await updateDoc(doc(db, getCollectionName("salary_payments"), payment.id), { isDeleted: true, deletedAt: Timestamp.now() });
                        if (payment.expenseId) {
                            try {
                                await updateDoc(doc(db, getCollectionName("expenses"), payment.expenseId), { isDeleted: true, deletedAt: Timestamp.now() });
                            } catch (e) { console.warn('Annulation caisse (salaire) :', e && e.message); }
                        }
                        showToast("Paiement annulé.");
                     } catch(e) { showToast("Erreur: " + e.message, "error"); }
                };

                const openIndividualHistory = (emp) => { selectedEmployeeHistoryId.value = emp.id; selectedEmployeeHistoryName.value = emp.name; showIndividualHistoryModal.value = true; };
                
                const individualHistory = computed(() => {
                    if (!selectedEmployeeHistoryId.value) return [];
                    return salaryHistory.value
                        .filter(p => p.employeeId === selectedEmployeeHistoryId.value)
                        .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
                });

                const groupedSalaryHistory = computed(() => {
                    const groups = {};
                    salaryHistory.value.forEach(pay => {
                        if (!groups[pay.month]) groups[pay.month] = { 
                            month: pay.month, 
                            payments: [], 
                            totalNet: 0,
                            totalTontine: 0,
                            totalLoan: 0,
                            totalFund: 0
                        };
                        groups[pay.month].payments.push(pay);
                        groups[pay.month].totalNet += (pay.net || 0);
                        groups[pay.month].totalTontine += (pay.tontine || 0);
                        groups[pay.month].totalLoan += (pay.loan || 0);
                    });
                    salaryFunds.value.forEach(fund => {
                        const m = fund.targetMonth;
                        if (!groups[m]) groups[m] = { month: m, payments: [], totalNet: 0, totalTontine: 0, totalLoan: 0, totalFund: 0 };
                        groups[m].totalFund += fund.amount;
                    });
                    return Object.values(groups)
                        .sort((a, b) => b.month.localeCompare(a.month))
                        .map(group => ({ 
                            ...group, 
                            totalSpent: group.totalNet + group.totalTontine,
                            balance: group.totalFund - group.totalNet - group.totalTontine
                        }));
                });

                const openMonthDetails = (group) => { group.payments.sort((a, b) => b.timestamp.seconds - a.timestamp.seconds); selectedHistoryMonth.value = group; };
                const closeMonthDetails = () => { selectedHistoryMonth.value = null; };

                const saveSalaryFund = async () => {
                    if(!isSuperAdmin.value) return;
                    if(!newFund.value.amount) return;
                    actionLoading.value = true;
                    try {
                        const newFundRef = doc(collection(db, getCollectionName("salary_funds")));
                        await setDoc(newFundRef, { amount: newFund.value.amount, note: newFund.value.note || 'Dotation', targetMonth: newFund.value.targetMonth || selectedBudgetMonth.value, timestamp: Timestamp.now(), agency: activeAgency, isDeleted: false });
                        showFundModal.value = false; newFund.value = { amount: '', note: '', targetMonth: selectedBudgetMonth.value }; showToast("Fonds enregistrés !");
                    } catch(e) { showToast(e.message, "error"); }
                    finally { actionLoading.value = false; }
                };
                const deleteSalaryFund = async (id) => {
                    if(!isSuperAdmin.value) return;
                    if(await window.AppModal.confirm("Supprimer ce fonds ?", "Suppression", true)) {
                        await updateDoc(doc(db, getCollectionName("salary_funds"), id), { isDeleted: true, deletedAt: Timestamp.now() });
                    }
                };

                const salaryStats = computed(() => {
                    const target = selectedBudgetMonth.value;
                    const targetPayments = salaryHistory.value.filter(p => p.month === target);
                    const totalReceived = salaryFunds.value
                        .filter(f => (f.targetMonth || (f.timestamp?.toDate ? f.timestamp.toDate().toISOString().slice(0, 7) : '')) === target)
                        .reduce((acc, curr) => acc + (curr.amount || 0), 0);
                    const totalNet = targetPayments.reduce((acc, curr) => acc + (curr.net || 0), 0);
                    const totalTontine = targetPayments.reduce((acc, curr) => acc + (curr.tontine || 0), 0);
                    const totalPaid = totalNet + totalTontine;
                    const totalLoans = employeesList.value.reduce((acc, curr) => acc + (curr.loan || 0), 0);
                    return { totalReceived, totalNet, totalTontine, totalPaid, balance: totalReceived - totalPaid, totalLoans };
                });

                const tontineMembers = computed(() => {
                    let list = [];
                    employeesList.value.forEach(e => {
                        const count = parseInt(e.tontineCount || (e.isTontine ? 1 : 0));
                        for(let i=1; i<=count; i++) {
                            list.push({ ...e, shareIndex: i, uniqueId: e.id + '_' + i });
                        }
                    });
                    return list;
                });

                const hasPaidTontine = (empId, shareIndex = 1) => {
                    const currentMonth = selectedTontineMonth.value;
                    const currentPeriod = selectedTontinePeriod.value;
                    const totalPaid = salaryHistory.value
                        .filter(p => 
                            p.employeeId === empId && 
                            p.month === currentMonth && 
                            p.period === currentPeriod  
                        )
                        .reduce((sum, p) => sum + (parseFloat(p.tontine) || 0), 0);
                    return totalPaid >= (shareIndex * (parseFloat(globalTontineAmount.value) || 0));
                };

                const hasPaidTontineForPaie = (empId, shareIndex = 1) => {
                    const currentMonth = selectedPaieMonth.value;
                    const totalPaid = salaryHistory.value
                        .filter(p => p.employeeId === empId && p.month === currentMonth)
                        .reduce((sum, p) => sum + (parseFloat(p.tontine) || 0), 0);
                    const expectedPerMonth = shareIndex * (parseFloat(globalTontineAmount.value) || 0) * 2;
                    return totalPaid >= expectedPerMonth;
                };

                // Cagnotte TOTALE du mois (les deux quinzaines).
                const tontinePot = computed(() => {
                    const totalShares = employeesList.value.reduce((sum, e) => sum + (parseInt(e.tontineCount || (e.isTontine ? 1 : 0))), 0);
                    return totalShares * (parseFloat(globalTontineAmount.value) || 0) * 2;
                });
                // Cagnotte d'UNE quinzaine (15 ou 30) = ce qu'un gagnant
                // recupere reellement par tirage. Un mois compte 2 tirages.
                const tontinePotPerPeriod = computed(() => {
                    const totalShares = employeesList.value.reduce((sum, e) => sum + (parseInt(e.tontineCount || (e.isTontine ? 1 : 0))), 0);
                    return totalShares * (parseFloat(globalTontineAmount.value) || 0);
                });

                const getTontinePaidAmount = (empId) => {
                    const currentMonth = selectedTontineMonth.value;
                    const currentPeriod = selectedTontinePeriod.value;
                    return salaryHistory.value
                        .filter(p => p.employeeId === empId && p.month === currentMonth && p.period === currentPeriod)
                        .reduce((sum, p) => sum + (parseFloat(p.tontine) || 0), 0);
                };

                const markTontinePayment = async (emp) => {
                    if(!isSuperAdmin.value) return;
                    let amount = await window.AppModal.prompt("Montant de la cotisation pour " + emp.name + " ?", globalTontineAmount.value, "Cotisation Tontine");
                    if (amount === null) return;
                    amount = parseFloat(amount);
                    if (isNaN(amount) || amount <= 0) return window.AppModal.error("Montant invalide", "Erreur");

                    try {
                        const currentMonth = selectedTontineMonth.value;
                        const newPayRef = doc(collection(db, getCollectionName("salary_payments")));
                        await setDoc(newPayRef, {
                            employeeId: emp.id,
                            employeeName: emp.name,
                            month: currentMonth,
                            period: selectedTontinePeriod.value,
                            type: 'Cotisation Tontine',
                            base: 0,
                            loan: 0,
                            tontine: amount,
                            net: 0,
                            timestamp: Timestamp.now(),
                            agency: activeAgency,
                            isDeleted: false
                        });
                        showToast("Cotisation enregistrée !");
                    } catch(e) { showToast("Erreur: " + e.message, "error"); }
                };

                const tontineBeneficiaries = computed(() => {
                    return salaryHistory.value.filter(p =>
                        p.month === selectedTontineMonth.value &&
                        p.period === selectedTontinePeriod.value &&
                        p.type === 'Gain Tontine'
                    );
                });

                // Historique COMPLET des gains de tontine (tous mois, tous
                // cycles). Trie du plus recent au plus ancien.
                const tontineGainHistory = computed(() => {
                    return salaryHistory.value
                        .filter(p => p.type === 'Gain Tontine')
                        .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
                });

                // Total des gains affiches (tous cycles confondus).
                const tontineGainTotal = computed(() =>
                    tontineGainHistory.value.reduce((s, g) => s + (parseFloat(g.tontineGain) || 0), 0)
                );

                // Helper : ce gain appartient-il au cycle en cours ?
                const isCurrentCycleGain = (g) => {
                    if (!tontineResetAt.value) return true;
                    return (g.timestamp?.seconds || 0) > tontineResetAt.value;
                };

                // Compte SEULEMENT les gains du cycle en cours (apres reset).
                const winsThisCycle = (empId) => salaryHistory.value.filter(p =>
                    p.employeeId === empId &&
                    p.type === 'Gain Tontine' &&
                    (!tontineResetAt.value || (p.timestamp?.seconds || 0) > tontineResetAt.value)
                ).length;

                const hasReceivedTontine = (emp) => {
                    const allowed = parseInt(emp.tontineCount || (emp.isTontine ? 1 : 0));
                    return winsThisCycle(emp.id) >= allowed;
                };

                // Tous les participants ont-ils gagne leurs parts dans le
                // cycle en cours ? -> le bouton de reset s'active.
                const allTontineMembersWonCycle = computed(() => {
                    const members = employeesList.value.filter(e => (parseInt(e.tontineCount || (e.isTontine ? 1 : 0))) > 0);
                    if (members.length === 0) return false;
                    return members.every(emp => hasReceivedTontine(emp));
                });

                // Reset du cycle de tontine : tous les compteurs de gains
                // repartent a zero. L'historique reste consultable mais n'est
                // plus comptabilise pour les decomptes. Reservé super_admin.
                const resetTontineCycle = async () => {
                    if (!isSuperAdmin.value) return;
                    if (!allTontineMembersWonCycle.value) {
                        return window.AppModal.error("Tous les participants n'ont pas encore récupéré leurs parts dans le cycle en cours.", "Cycle incomplet");
                    }
                    if (!await window.AppModal.confirm("Démarrer un nouveau cycle de tontine ? Tous les compteurs de gains repartent à zéro pour ce nouveau cycle. L'historique des gains précédents reste consultable mais n'est plus pris en compte.", "Nouveau cycle")) return;
                    try {
                        const nowSec = Math.floor(Date.now() / 1000);
                        await setDoc(doc(db, "settings", "salary"), { resets: { [activeAgency]: nowSec } }, { merge: true });
                        showToast("Nouveau cycle de tontine démarré !");
                    } catch (e) { showToast("Erreur : " + e.message, "error"); }
                };

                const markTontineBeneficiary = async (emp) => {
                    if(!isSuperAdmin.value) return;
                    const wins = winsThisCycle(emp.id);
                    const allowed = parseInt(emp.tontineCount || (emp.isTontine ? 1 : 0));
                    if (wins >= allowed) {
                        return window.AppModal.error(`Impossible : Cet employé a déjà récupéré la tontine ${wins} fois dans le cycle en cours (Nombre de parts : ${allowed}). Démarrez un nouveau cycle si tout le monde a reçu son dû.`, "Limite Atteinte");
                    }
                    const periodLabel = selectedTontinePeriod.value === '15' ? 'Acompte (15)' : 'Solde (Fin du mois)';
                    if (!await window.AppModal.confirm(`Confirmer que ${emp.name} récupère la cagnotte de la quinzaine « ${periodLabel} » du mois ${selectedTontineMonth.value} ?`, "Confirmation de Gain")) return;
                    // Cagnotte d'UNE quinzaine (un tirage). Le mois en compte deux.
                    const defaultAmount = tontinePotPerPeriod.value;
                    let amount = await window.AppModal.prompt("Montant récupéré (cagnotte de la quinzaine) ?", defaultAmount, "Saisie du gain");
                    if (amount === null) return;
                    amount = parseFloat(amount);
                    if (isNaN(amount) || amount <= 0) return window.AppModal.error("Montant invalide", "Erreur");
                    try {
                        const newGainRef = doc(collection(db, getCollectionName("salary_payments")));
                        await setDoc(newGainRef, {
                            employeeId: emp.id, employeeName: emp.name, month: selectedTontineMonth.value, period: selectedTontinePeriod.value,
                            type: 'Gain Tontine', base: 0, loan: 0, tontine: 0, tontineGain: amount, net: 0, timestamp: Timestamp.now(), agency: activeAgency, isDeleted: false
                        });
                        showToast("Gain enregistré !");
                    } catch(e) { showToast("Erreur: " + e.message, "error"); }
                };

                const deleteTontineBeneficiary = async (payment) => {
                    if(!isSuperAdmin.value) return;
                    if(await window.AppModal.confirm("Supprimer ce gain ?", "Suppression", true)) {
                        await updateDoc(doc(db, getCollectionName("salary_payments"), payment.id), { isDeleted: true, deletedAt: Timestamp.now() });
                    }
                };

                const exportSalaryHistoryPDF = () => {
                    const doc = new jspdf.jsPDF();
                    doc.setFontSize(18);
                    doc.setTextColor(40);
                    doc.text("Rapport Détaillé des Salaires", 14, 20);
                    doc.setFontSize(10);
                    doc.setTextColor(100);
                    doc.text("Généré le : " + new Date().toLocaleString(), 14, 28);
                    let currentY = 35;

                    groupedSalaryHistory.value.forEach(group => {
                        if (currentY > 250) { doc.addPage(); currentY = 20; }

                        doc.setFillColor(245, 247, 250);
                        doc.setDrawColor(200, 200, 200);
                        doc.roundedRect(14, currentY, 182, 22, 2, 2, 'FD');
                        
                        doc.setFontSize(12);
                        doc.setTextColor(0);
                        doc.setFont("helvetica", "bold");
                        doc.text(`Période : ${group.month}`, 20, currentY + 8);
                        
                        doc.setFontSize(9);
                        doc.setFont("helvetica", "normal");
                        
                        const budgetTxt = `Budget: ${formatMoney(group.totalFund)}`;
                        const payeTxt = `Net versé: ${formatMoney(group.totalNet)}`;
                        const tontineTxt = `Tontine collectée: ${formatMoney(group.totalTontine)}`;
                        const soldeTxt = `Reste: ${formatMoney(group.balance)}`;
                        
                        doc.text(budgetTxt, 20, currentY + 15);
                        doc.setTextColor(75, 85, 99);
                        doc.text(payeTxt, 65, currentY + 15);
                        doc.setTextColor(234, 88, 12); 
                        doc.text(tontineTxt, 110, currentY + 15);
                        if (group.balance < 0) doc.setTextColor(220, 38, 38);
                        else doc.setTextColor(22, 163, 74);
                        doc.text(soldeTxt, 160, currentY + 15);

                        const sortedPayments = [...group.payments].sort((a, b) => b.timestamp.seconds - a.timestamp.seconds);
                        const tableBody = sortedPayments.map(p => [
                            formatDate(p.timestamp),
                            p.employeeName,
                            p.type,
                            p.tontine > 0 ? formatMoney(p.tontine) : '-',
                            p.loan > 0 ? formatMoney(p.loan) : '-',
                            p.absence > 0 ? formatMoney(p.absence) : '-',
                            formatMoney(p.net)
                        ]);

                        if (tableBody.length === 0) {
                            tableBody.push(['-', 'Aucun paiement enregistré', '-', '-', '-', '-', '-']);
                        }

                        doc.autoTable({
                            startY: currentY + 26,
                            head: [['Date', 'Employé', 'Type', 'Tontine', 'Prêt', 'Abs.', 'Net Payé']],
                            body: tableBody,
                            theme: 'grid',
                            headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
                            styles: { fontSize: 9, cellPadding: 3 },
                            columnStyles: {
                                0: { cellWidth: 22 },
                                3: { halign: 'right', cellWidth: 22, textColor: [234, 88, 12] },
                                4: { halign: 'right', cellWidth: 20 },
                                5: { halign: 'right', cellWidth: 16 },
                                6: { halign: 'right', fontStyle: 'bold', cellWidth: 28 }
                            },
                            margin: { left: 14, right: 14 },
                            didDrawPage: (data) => { currentY = data.cursor.y; }
                        });

                        currentY = doc.lastAutoTable.finalY + 15;
                    });

                    doc.save("Rapport_Salaires_Complet.pdf");
                };

                const printPayslip = (payment) => {
                    const doc = new jspdf.jsPDF();
                    doc.setFontSize(16);
                    doc.setTextColor(79, 70, 229);
                    doc.text("BULLETIN DE PAIE", 105, 20, null, null, "center");
                    doc.setFontSize(10);
                    doc.setTextColor(0);
                    doc.text(`Date : ${formatDate(payment.timestamp)}`, 14, 35);
                    doc.text(`Période : ${payment.month}`, 14, 40);
                    doc.text(`Type : ${payment.type}`, 14, 45);
                    doc.setFontSize(12);
                    doc.text(`Employé : ${payment.employeeName}`, 14, 55);
                    const body = [
                        ['Salaire de Base / Avance', formatMoney(payment.base)],
                        ['Remboursement Prêt', `-${formatMoney(payment.loan)}`],
                        ['Retenue Tontine', `-${formatMoney(payment.tontine)}`],
                        ['Absence / Autre', `-${formatMoney(payment.absence)}`],
                        [{content: 'NET À PAYER', styles: {fontStyle: 'bold', fillColor: [240, 240, 240]}}, {content: formatMoney(payment.net), styles: {fontStyle: 'bold', fillColor: [240, 240, 240], textColor: [79, 70, 229]}}]
                    ];
                    doc.autoTable({
                        startY: 65,
                        head: [['Désignation', 'Montant']],
                        body: body,
                        theme: 'grid',
                        columnStyles: { 1: { halign: 'right' } }
                    });
                    const finalY = doc.lastAutoTable.finalY + 20;
                    doc.setFontSize(10);
                    doc.text("Signature Employé :", 140, finalY);
                    doc.text("Signature Direction :", 14, finalY);
                    doc.save(`Bulletin_${payment.employeeName}_${payment.month}.pdf`);
                };

                // --- GESTION CRÉANCES ---
                const selectedDebtEmployee = ref(null);
                const openDebtModal = (emp) => { selectedDebtEmployee.value = emp; showDebtModal.value = true; };
                const debtRepaymentHistory = computed(() => {
                    if (!selectedDebtEmployee.value) return [];
                    return salaryHistory.value
                        .filter(p => p.employeeId === selectedDebtEmployee.value.id && (p.loan || 0) > 0)
                        .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
                });
                const getEmployeeRepaidTotal = (empId) => salaryHistory.value.filter(p => p.employeeId === empId).reduce((sum, p) => sum + (p.loan || 0), 0);

                // --- DASHBOARD DATA ---
                const dashboardStats = computed(() => {
                    return {
                        employeesCount: employeesList.value ? employeesList.value.length : 0,
                        toPayCount: unpaidEmployees.value ? unpaidEmployees.value.length : 0,
                        budgetBalance: salaryStats.value ? salaryStats.value.balance : 0,
                        tontinePot: tontinePot.value || 0
                    };
                });

                const recentActivity = computed(() => salaryHistory.value.slice(0, 8));

                const formatMoney = (m) => {
                    if (!m && m !== 0) return '0 F';
                    return new Intl.NumberFormat('fr-FR').format(m).replace(/[\u202F\u00A0\s]/g, ' ').replace(/\s*\/\s*/g, ' ') + ' F';
                };

                // Couleur de fond du badge selon le type (sinon texte blanc
                // sur fond transparent = illisible cf. .tag dans style.css).
                const typeBadge = (type) => {
                    const t = String(type || 'Paiement');
                    let bg = '#475569';
                    if (t.indexOf('Acompte') >= 0) bg = '#3b82f6';
                    else if (t.indexOf('Solde') >= 0) bg = '#10b981';
                    else if (t.indexOf('Gain') >= 0) bg = '#a855f7';
                    else if (t.indexOf('Tontine') >= 0) bg = '#f59e0b';
                    return `background:${bg}; color:#fff;`;
                };
                const formatDate = (ts) => { if (!ts) return '-'; const d = ts.toDate ? ts.toDate() : new Date(ts); const day = d.getDate().toString().padStart(2, '0'); let month = d.toLocaleString('fr-FR', { month: 'short' }).replace('.', ''); month = month.charAt(0).toUpperCase() + month.slice(1); const year = d.getFullYear(); return `${day}-${month}-${year}`; };
                
                const login = async () => { try { await signInWithEmailAndPassword(auth, loginForm.value.email, loginForm.value.password); } catch (e) { loginError.value = "Erreur de connexion"; } };
                const logout = async () => { await signOut(auth); window.location.href = 'login.html'; };

                const unsubAuth = onAuthStateChanged(auth, (u) => {
                    user.value = u; authLoading.value = false;
                    if (u) {
                        loadEmployees(); loadSalaryHistory(); loadSalaryFunds();
                        const u2 = onSnapshot(doc(db, "settings", "salary"), (docSnap) => {
                            if (!docSnap.exists()) return;
                            const d = docSnap.data();
                            globalTontineAmount.value = d.tontineAmount || 10000;
                            // Reset par agence : { resets: { abidjan: 1234, abidjan_chine: 5678 } }
                            tontineResetAt.value = (d.resets && d.resets[activeAgency]) || null;
                        });
                        unsubs.push(u2);
                        if (typeof initBackToTopButton === 'function') initBackToTopButton();
                    }
                });
                unsubs.push(unsubAuth);

                // Demontage : on coupe TOUS les ecouteurs Firestore + Auth.
                // Sinon, chaque visite de la page Salaire empile des
                // ecouteurs temps reel qui restent vivants en arriere-plan.
                onBeforeUnmount(() => {
                    unsubs.forEach(u => { try { u && u(); } catch (e) { /* ok */ } });
                    unsubs.length = 0;
                });

                return {
                    user, isAdmin, isSuperAdmin, authLoading, loginForm, login, logout, loginError,
                    formatMoney, formatDate, typeBadge,
                    currentSalaireView, employeesList, salaryHistory, salaryFunds, paiePeriod, selectedPaieMonth,
                    showAddEmployeeModal, showEditEmployeeModal, showIndividualHistoryModal, showPayModal, showFundModal,
                    newEmp, editingEmp, payForm, newFund, unpaidEmployees, selectedEmployeeHistoryName, individualHistory,
                    groupedSalaryHistory, selectedHistoryMonth, openMonthDetails, closeMonthDetails, searchQuery, filteredEmployees,
                    saveNewEmployee, updateEmployee, deleteEmployee, openEditEmployee, openIndividualHistory, selectedBudgetMonth, cancelTontine,
                    openPayModal, confirmSalaryPayment, deleteSalaryPayment, recalcNet, updateBaseFromNet, 
                    hasPaidTontine, hasPaidTontineForPaie, // AJOUT : nouvelle fonction pour l'onglet employés
                    getTontinePaidAmount, markTontinePayment, tontineMembers, globalTontineAmount, saveGlobalTontine, selectedTontineMonth, tontinePot, tontinePotPerPeriod,
                    calculateBase, calculateLoanDeduc, calculateTontineDeduc, calculateNet, exportSalaryHistoryPDF, printPayslip, paieTotals, employeesTotals,
                    filteredEmployeesTotals, monthDetailsTotals, individualHistoryTotals,
                    saveSalaryFund, deleteSalaryFund, salaryStats, selectedTontinePeriod,
                    tontineBeneficiaries, markTontineBeneficiary, deleteTontineBeneficiary, hasReceivedTontine,
                    tontineResetAt, allTontineMembersWonCycle, resetTontineCycle, winsThisCycle,
                    tontineGainHistory, tontineGainTotal, isCurrentCycleGain,
                    toast, actionLoading,
                    showDebtModal, selectedDebtEmployee, openDebtModal, debtRepaymentHistory, getEmployeeRepaidTotal,
                    dashboardStats, recentActivity
                };
            }
        });
        this.vueApp.mount('#app');
    }
};