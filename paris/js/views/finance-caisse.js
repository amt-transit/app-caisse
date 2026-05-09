import { db } from '../../../firebase-config.js';
import { collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const FinanceCaisseView = {
    unsubTrans: null,
    unsubExp: null,
    transactions: [],
    expenses: [],

    render(app) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.financeCaisse = this;

        const html = `
            <div class="page">
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
                        <div class="stat-value" id="fcTotalIn" style="color: white; font-size: 32px;">0 €</div>
                    </div>
                    <div class="stat-card" style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; border: none;">
                        <div class="stat-label" style="color: rgba(255,255,255,0.8); font-size: 13px;">Total Dépenses</div>
                        <div class="stat-value" id="fcTotalOut" style="color: white; font-size: 32px;">0 €</div>
                    </div>
                    <div class="stat-card" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; border: none;">
                        <div class="stat-label" style="color: rgba(255,255,255,0.8); font-size: 13px;">Solde Caisse</div>
                        <div class="stat-value" id="fcBalance" style="color: white; font-size: 32px;">0 €</div>
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
                            <tbody id="fcTableBody">
                                <tr><td colspan="4" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('contentContainer').innerHTML = html;
        this.loadData();
    },

    loadData() {
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
        
        if (this.unsubTrans) this.unsubTrans();
        this.unsubTrans = onSnapshot(query(collection(db, "transactions"), where("agency", "==", activeAgency), where("isDeleted", "==", false)), snap => {
            this.transactions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            this.mergeAndRender();
        });

        if (this.unsubExp) this.unsubExp();
        this.unsubExp = onSnapshot(query(collection(db, "expenses"), where("agency", "==", activeAgency), where("isDeleted", "==", false)), snap => {
            this.expenses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            this.mergeAndRender();
        });
    },

    mergeAndRender() {
        const TAUX = 656;
        let totalIn = 0, totalOut = 0;
        let operations = [];

        // Encaissements (Conversion CFA enregistré -> Euros)
        this.transactions.forEach(t => {
            const amountEUR = (parseFloat(t.montantParis) || 0) / TAUX; 
            if (amountEUR > 0) {
                totalIn += amountEUR;
                operations.push({ date: t.date, label: `Encaissement ${t.reference} - ${t.nom || ''}`, type: 'Entrée', amount: amountEUR, ts: new Date(t.date).getTime() });
            }
        });

        // Dépenses (Déjà en Euros si saisies depuis Paris)
        this.expenses.forEach(e => {
            const amountEUR = parseFloat(e.montant) || 0;
            if (amountEUR > 0) {
                totalOut += amountEUR;
                operations.push({ date: e.date, label: e.description || 'Dépense', type: 'Sortie', amount: amountEUR, ts: new Date(e.date).getTime() });
            }
        });

        operations.sort((a, b) => b.ts - a.ts);

        document.getElementById('fcTotalIn').textContent = this.app.formatMoney(totalIn);
        document.getElementById('fcTotalOut').textContent = this.app.formatMoney(totalOut);
        document.getElementById('fcBalance').textContent = this.app.formatMoney(totalIn - totalOut);

        const tbody = document.getElementById('fcTableBody');
        if (operations.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 40px; color: #64748b;">Aucune opération trouvée.</td></tr>';
            return;
        }

        tbody.innerHTML = operations.slice(0, 100).map(op => {
            const color = op.type === 'Entrée' ? '#10b981' : '#ef4444';
            const sign = op.type === 'Entrée' ? '+' : '-';
            return `
                <tr>
                    <td data-label="Date" style="padding: 14px 12px;">${op.date ? new Date(op.date).toLocaleDateString('fr-FR') : '-'}</td>
                    <td data-label="Libellé" style="padding: 14px 12px; font-weight: 600; color: #0f172a;">${op.label}</td>
                    <td data-label="Type" style="padding: 14px 12px; text-align: center;"><span class="badge" style="background: ${op.type==='Entrée'?'#dcfce7':'#fee2e2'}; color: ${color};">${op.type}</span></td>
                    <td data-label="Montant" style="padding: 14px 12px; text-align: right; font-weight: bold; color: ${color};">${sign} ${this.app.formatMoney(op.amount)}</td>
                </tr>
            `;
        }).join('');
    }
};