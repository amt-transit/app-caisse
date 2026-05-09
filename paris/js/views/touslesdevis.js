import { db } from '../../../firebase-config.js';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const TousLesDevisView = {
    unsub: null,
    quotes: [],

    render(app) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.tousLesDevis = this;

        const html = `
            <div class="page">
                <div class="factures-header" style="background: white; border-radius: 16px; margin-bottom: 24px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                    <div class="factures-header__content" style="display: flex; align-items: center; gap: 20px; padding: 20px 24px; flex-wrap: wrap;">
                        <div class="factures-header__icon" style="font-size: 32px; background: #ecfdf5; color: #10b981; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 14px;">📝</div>
                        <div class="factures-header__info" style="flex: 1;">
                            <h1 class="factures-header__title" style="margin: 0; font-size: 22px; font-weight: 700; color: #0f172a;">Tous les devis</h1>
                            <p class="factures-header__subtitle" style="margin: 4px 0 0 0; font-size: 13px; color: #64748b;">Gestion de vos propositions commerciales</p>
                        </div>
                        <button class="btn-create-invoice" onclick="app.renderPage('quote-new')" style="background: #3b82f6; color: white; border: none; padding: 12px 20px; border-radius: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px;">
                            ➕ Nouveau Devis
                        </button>
                    </div>
                </div>

                <div class="factures-filters" style="display: flex; flex-wrap: wrap; gap: 16px; background: white; padding: 20px 24px; border-radius: 16px; border: 1px solid #e2e8f0; margin-bottom: 24px;">
                    <div class="filter-group filter-group--wide" style="flex: 2; min-width: 200px;">
                        <label class="filter-label" style="display: block; font-size: 11px; font-weight: 600; color: #64748b; margin-bottom: 6px; text-transform: uppercase;">🔍 Recherche</label>
                        <input type="text" id="tdSearchInput" class="filter-input" placeholder="N° Devis, Client..." style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 10px;">
                    </div>
                    <div class="filter-group" style="flex: 1; min-width: 150px;">
                        <label class="filter-label" style="display: block; font-size: 11px; font-weight: 600; color: #64748b; margin-bottom: 6px; text-transform: uppercase;">💳 Statut</label>
                        <select id="tdStatusFilter" class="filter-select" style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 10px;">
                            <option value="">Tous</option>
                            <option value="ENVOYÉ">Envoyé</option>
                            <option value="ACCEPTÉ">Accepté</option>
                            <option value="REFUSÉ">Refusé</option>
                        </select>
                    </div>
                </div>

                <div class="factures-table-card" style="background: white; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden;">
                    <div class="table-wrap" style="overflow-x: auto;">
                        <table class="factures-table table-as-cards" style="width: 100%; border-collapse: collapse;">
                            <thead style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                                <tr>
                                    <th style="padding: 16px 12px; text-align: left; font-size: 12px; color: #475569; text-transform: uppercase;">N° Devis</th>
                                    <th style="padding: 16px 12px; text-align: left; font-size: 12px; color: #475569; text-transform: uppercase;">Date</th>
                                    <th style="padding: 16px 12px; text-align: left; font-size: 12px; color: #475569; text-transform: uppercase;">Client</th>
                                    <th style="padding: 16px 12px; text-align: left; font-size: 12px; color: #475569; text-transform: uppercase;">Destinataire</th>
                                    <th style="padding: 16px 12px; text-align: right; font-size: 12px; color: #475569; text-transform: uppercase;">Montant Net</th>
                                    <th style="padding: 16px 12px; text-align: center; font-size: 12px; color: #475569; text-transform: uppercase;">Statut</th>
                                    <th style="padding: 16px 12px; text-align: right; font-size: 12px; color: #475569; text-transform: uppercase;">Actions</th>
                                </tr>
                            </thead>
                            <tbody id="tdTableBody">
                                <tr><td colspan="7" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('contentContainer').innerHTML = html;
        
        document.getElementById('tdSearchInput')?.addEventListener('input', () => this.renderTable());
        document.getElementById('tdStatusFilter')?.addEventListener('change', () => this.renderTable());

        this.loadData();
    },

    loadData() {
        if (this.unsub) this.unsub();
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
        const q = query(collection(db, "quotes"), where("agency", "==", activeAgency));
        this.unsub = onSnapshot(q, (snapshot) => {
            this.quotes = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
            this.quotes.sort((a, b) => new Date(b.date) - new Date(a.date));
            this.renderTable();
        });
    },

    renderTable() {
        const tbody = document.getElementById('tdTableBody');
        if (!tbody) return;
        const term = (document.getElementById('tdSearchInput')?.value || '').toLowerCase().trim();
        const status = document.getElementById('tdStatusFilter')?.value || '';
        const filtered = this.quotes.filter(q => {
            if (term && !q.reference?.toLowerCase().includes(term) && !q.client?.toLowerCase().includes(term)) return false;
            if (status && q.status !== status) return false;
            return true;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: #64748b;">Aucun devis trouvé.</td></tr>';
            return;
        }
        tbody.innerHTML = filtered.map(q => {
            const isAccepted = q.status === 'ACCEPTÉ';
            const isRefused = q.status === 'REFUSÉ';
            const badgeClass = isAccepted ? 'badge-success' : (isRefused ? 'badge-danger' : 'badge-info');
            const devise = q.devise === 'FCFA' ? 'CFA' : '€';
            let actions = `<button class="btn btn-outline btn-small" onclick="window.app.views.tousLesDevis.deleteQuote('${q.id}')" title="Supprimer" style="color: #ef4444; border-color: #ef4444; padding: 6px;"><i class="fas fa-trash"></i></button>`;

            if (!isAccepted && !isRefused) {
                actions = `
                    <button class="btn btn-success btn-small" onclick="window.app.views.tousLesDevis.changeStatus('${q.id}', 'ACCEPTÉ')" title="Marquer comme Accepté" style="padding: 6px;"><i class="fas fa-check"></i></button>
                    <button class="btn btn-danger btn-small" onclick="window.app.views.tousLesDevis.changeStatus('${q.id}', 'REFUSÉ')" title="Marquer comme Refusé" style="padding: 6px;"><i class="fas fa-times"></i></button>
                    ${actions}
                `;
            }
            return `
                <tr>
                    <td data-label="N° Devis" style="padding: 14px 12px; font-weight: bold;">${q.reference || '-'}</td>
                    <td data-label="Date" style="padding: 14px 12px;">${q.date ? new Date(q.date).toLocaleDateString('fr-FR') : '-'}</td>
                    <td data-label="Client" style="padding: 14px 12px; font-weight: 600; color: #0f172a;">${q.client || '-'}</td>
                    <td data-label="Destinataire" style="padding: 14px 12px;">${q.destinataire || '-'}</td>
                    <td data-label="Montant Net" style="padding: 14px 12px; text-align: right; font-weight: bold; color: #0f172a;">${q.totalNet || 0} ${devise}</td>
                    <td data-label="Statut" style="padding: 14px 12px; text-align: center;"><span class="badge ${badgeClass}" style="padding: 4px 10px; border-radius: 12px; font-size: 11px;">${q.status || 'ENVOYÉ'}</span></td>
                    <td data-label="Actions" style="padding: 14px 12px; text-align: right; display: flex; gap: 8px; justify-content: flex-end;">${actions}</td>
                </tr>
            `;
        }).join('');
    },
    async changeStatus(id, newStatus) {
        try {
            await updateDoc(doc(db, "quotes", id), { status: newStatus });
            this.app.showToast(`Devis ${newStatus.toLowerCase()} !`, newStatus === 'ACCEPTÉ' ? 'success' : 'info');
        } catch(e) { this.app.showToast("Erreur de mise à jour", "error"); }
    },
    async deleteQuote(id) {
        if (window.AppModal) { if (!await window.AppModal.confirm("Supprimer ce devis de l'historique ?", "Supprimer Devis", true)) return; } 
        else if (!confirm("Supprimer ce devis ?")) return;
        try {
            await deleteDoc(doc(db, "quotes", id));
            this.app.showToast("Devis supprimé", "success");
        } catch(e) { this.app.showToast("Erreur de suppression", "error"); }
    }
};