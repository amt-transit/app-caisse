import { db } from '../../../firebase-config.js';
import { collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const FinanceChequesView = {
    unsub: null,
    cheques: [],

    render(app) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.financeCheques = this;

        const html = `
            <div class="page">
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
                    <div class="table-wrap" style="overflow-x: auto;">
                        <table class="factures-table table-as-cards" style="width: 100%; border-collapse: collapse;">
                            <thead style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                                <tr>
                                    <th style="padding: 16px 12px; text-align: left; font-size: 12px; color: #475569; text-transform: uppercase;">Date</th>
                                    <th style="padding: 16px 12px; text-align: left; font-size: 12px; color: #475569; text-transform: uppercase;">Facture</th>
                                    <th style="padding: 16px 12px; text-align: left; font-size: 12px; color: #475569; text-transform: uppercase;">Client</th>
                                    <th style="padding: 16px 12px; text-align: right; font-size: 12px; color: #475569; text-transform: uppercase;">Montant Chèque</th>
                                    <th style="padding: 16px 12px; text-align: center; font-size: 12px; color: #475569; text-transform: uppercase;">Statut Enregistrement</th>
                                </tr>
                            </thead>
                            <tbody id="chqTableBody">
                                <tr><td colspan="5" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</td></tr>
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
        if (this.unsub) this.unsub();
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
        // Requête ciblée : UNIQUEMENT le mode CHEQUES (tel que défini dans le dropdown de nouvelle facture)
        const q = query(collection(db, "transactions"), where("agency", "==", activeAgency), where("modePaiement", "==", "CHEQUES"), where("isDeleted", "==", false));
        
        this.unsub = onSnapshot(q, snap => {
            this.cheques = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            this.cheques.sort((a, b) => new Date(b.date) - new Date(a.date));
            this.renderTable();
        });
    },

    renderTable() {
        const tbody = document.getElementById('chqTableBody');
        if (!tbody) return;
        if (this.cheques.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px; color: #64748b;">Aucun chèque enregistré.</td></tr>';
            return;
        }
        tbody.innerHTML = this.cheques.map(c => {
            const amountEUR = (parseFloat(c.montantParis) || 0) / 656; // Le montant payé à Paris converti
            return `
            <tr style="border-bottom: 1px solid #f1f5f9; transition: background 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                <td data-label="Date" style="padding: 14px 12px;">${c.date ? new Date(c.date).toLocaleDateString('fr-FR') : '-'}</td>
                <td data-label="Facture" style="padding: 14px 12px; font-weight: bold; color: #3b82f6;">${c.reference || '-'}</td>
                <td data-label="Client" style="padding: 14px 12px; font-weight: 600; color: #0f172a;">${c.nom || '-'}</td>
                <td data-label="Montant Chèque" style="padding: 14px 12px; text-align: right; font-weight: bold; color: #0f172a;">${this.app.formatMoney(amountEUR)}</td>
                <td data-label="Statut" style="padding: 14px 12px; text-align: center;"><span class="badge" style="background:#d1fae5; color:#065f46;">✔ Validé en Caisse</span></td>
            </tr>
        `}).join('');
    }
};