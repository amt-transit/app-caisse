import { db } from '../../../firebase-config.js';
import { collection, query, where, onSnapshot, doc, addDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const FinanceDepensesView = {
    unsub: null,
    expenses: [],

    render(app) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.financeDepenses = this;

        const html = `
            <div class="page">
                <div class="quick-actions" style="margin-bottom: 20px;">
                    <button class="btn btn-primary" onclick="window.app.views.financeDepenses.openAddModal()" style="display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-plus"></i> Nouvelle Dépense
                    </button>
                </div>

                <div class="factures-table-card" style="background: white; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                    <div style="padding: 20px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; display: flex; justify-content: space-between; align-items: center;">
                        <h3 style="margin: 0; font-size: 16px; color: #1e293b;">📉 Historique des Dépenses</h3>
                    </div>
                    <div class="table-wrap" style="overflow-x: auto;">
                        <table class="factures-table table-as-cards" style="width: 100%; border-collapse: collapse;">
                            <thead style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                                <tr>
                                    <th style="padding: 16px 12px; text-align: left; font-size: 12px; color: #475569; text-transform: uppercase;">Date</th>
                                    <th style="padding: 16px 12px; text-align: left; font-size: 12px; color: #475569; text-transform: uppercase;">Libellé / Description</th>
                                    <th style="padding: 16px 12px; text-align: left; font-size: 12px; color: #475569; text-transform: uppercase;">Catégorie</th>
                                    <th style="padding: 16px 12px; text-align: right; font-size: 12px; color: #475569; text-transform: uppercase;">Montant</th>
                                    <th style="padding: 16px 12px; text-align: right; font-size: 12px; color: #475569; text-transform: uppercase;">Actions</th>
                                </tr>
                            </thead>
                            <tbody id="depTableBody">
                                <tr><td colspan="5" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            
            <!-- MODAL D'AJOUT -->
            <div id="expenseModal" class="modal" style="display:none; position:fixed; z-index:1000; left:0; top:0; width:100%; height:100%; background:rgba(0,0,0,0.8); align-items:center; justify-content:center;">
                <div class="modal-content" style="background:#fff; padding:25px; width:90%; max-width:450px; border-radius:16px;">
                    <span class="close-modal" onclick="document.getElementById('expenseModal').style.display='none'" style="float:right; cursor:pointer; font-size:24px; color:#64748b;">&times;</span>
                    <h2 style="margin-top:0; color:#0f172a;">Nouvelle Dépense</h2>
                    
                    <div class="form-group" style="margin-top:15px;">
                        <label style="font-weight:600; font-size:12px; color:#475569;">Date</label>
                        <input type="date" id="expDate" value="${new Date().toISOString().split('T')[0]}" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box;">
                    </div>
                    <div class="form-group" style="margin-top:15px;">
                        <label style="font-weight:600; font-size:12px; color:#475569;">Catégorie</label>
                        <select id="expCategory" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box;">
                            <option value="Fournitures">Fournitures</option>
                            <option value="Maintenance">Maintenance & Entretien</option>
                            <option value="Loyer / Charges">Loyer & Charges</option>
                            <option value="Logistique">Logistique & Transport</option>
                            <option value="Autre">Autre</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin-top:15px;">
                        <label style="font-weight:600; font-size:12px; color:#475569;">Description</label>
                        <input type="text" id="expDesc" placeholder="Achat de cartons..." style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box;">
                    </div>
                    <div class="form-group" style="margin-top:15px;">
                        <label style="font-weight:600; font-size:12px; color:#475569;">Montant (€)</label>
                        <input type="number" id="expAmount" placeholder="Ex: 50" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; box-sizing:border-box;">
                    </div>
                    
                    <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:25px;">
                        <button class="btn btn-outline" onclick="document.getElementById('expenseModal').style.display='none'">Annuler</button>
                        <button class="btn btn-primary" id="saveExpBtn" onclick="window.app.views.financeDepenses.saveExpense()">Enregistrer</button>
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
        const q = query(collection(db, "expenses"), where("agency", "==", activeAgency), where("isDeleted", "==", false));
        
        this.unsub = onSnapshot(q, snap => {
            this.expenses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            this.expenses.sort((a, b) => new Date(b.date) - new Date(a.date));
            this.renderTable();
        });
    },

    renderTable() {
        const tbody = document.getElementById('depTableBody');
        if (!tbody) return;
        if (this.expenses.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px; color: #64748b;">Aucune dépense enregistrée.</td></tr>';
            return;
        }
        tbody.innerHTML = this.expenses.map(e => `
            <tr style="border-bottom: 1px solid #f1f5f9; transition: background 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                <td data-label="Date" style="padding: 14px 12px;">${e.date ? new Date(e.date).toLocaleDateString('fr-FR') : '-'}</td>
                <td data-label="Description" style="padding: 14px 12px; font-weight: 600; color: #0f172a;">${e.description || '-'}</td>
                <td data-label="Catégorie" style="padding: 14px 12px;"><span class="badge" style="background:#f1f5f9; color:#475569;">${e.category || 'Mensuelle'}</span></td>
                <td data-label="Montant" style="padding: 14px 12px; text-align: right; font-weight: bold; color: #ef4444;">- ${this.app.formatMoney(e.montant)}</td>
                <td data-label="Actions" style="padding: 14px 12px; text-align: right;"><button class="btn btn-outline btn-small" onclick="window.app.views.financeDepenses.deleteExpense('${e.id}')" style="color: #ef4444; border-color: #ef4444; padding: 6px;"><i class="fas fa-trash"></i></button></td>
            </tr>
        `).join('');
    },

    openAddModal() { document.getElementById('expenseModal').style.display = 'flex'; },

    async saveExpense() {
        const date = document.getElementById('expDate').value;
        const category = document.getElementById('expCategory').value;
        const desc = document.getElementById('expDesc').value.trim();
        const amount = parseFloat(document.getElementById('expAmount').value) || 0;

        if (!desc || amount <= 0) return this.app.showToast("Remplissez la description et le montant", "error");

        const btn = document.getElementById('saveExpBtn');
        btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>...';
        
        try {
            await addDoc(collection(db, "expenses"), {
                date, category, description: desc, montant: amount,
                type: 'Mensuelle', mode: 'Espèce', agency: sessionStorage.getItem('currentActiveAgency') || 'paris', isDeleted: false
            });
            this.app.showToast("Dépense enregistrée", "success");
            document.getElementById('expenseModal').style.display = 'none';
            document.getElementById('expDesc').value = '';
            document.getElementById('expAmount').value = '';
        } catch(e) { this.app.showToast("Erreur", "error"); }
        finally { btn.disabled = false; btn.textContent = 'Enregistrer'; }
    },

    async deleteExpense(id) {
        if (!confirm("Supprimer cette dépense ?")) return;
        try { await updateDoc(doc(db, "expenses", id), { isDeleted: true }); this.app.showToast("Dépense supprimée", "success"); } 
        catch(e) { this.app.showToast("Erreur suppression", "error"); }
    }
};