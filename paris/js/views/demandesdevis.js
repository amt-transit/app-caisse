import { db } from '../../../firebase-config.js';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const DemandesDevisView = {
    unsub: null,
    requests: [],

    render(app) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.demandesDevis = this;

        const html = `
            <div class="page">
                <div class="factures-header" style="background: white; border-radius: 16px; margin-bottom: 24px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                    <div class="factures-header__content" style="display: flex; align-items: center; gap: 20px; padding: 20px 24px; flex-wrap: wrap;">
                        <div class="factures-header__icon" style="font-size: 32px; background: #fffbeb; color: #f59e0b; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 14px;">📥</div>
                        <div class="factures-header__info" style="flex: 1;">
                            <h1 class="factures-header__title" style="margin: 0; font-size: 22px; font-weight: 700; color: #0f172a;">Demandes reçues</h1>
                            <p class="factures-header__subtitle" style="margin: 4px 0 0 0; font-size: 13px; color: #64748b;">Demandes de devis provenant de l'application client</p>
                        </div>
                    </div>
                </div>

                <div class="factures-table-card" style="background: white; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden;">
                    <div class="table-wrap" style="overflow-x: auto;">
                        <table class="factures-table table-as-cards" style="width: 100%; border-collapse: collapse;">
                            <thead style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                                <tr>
                                    <th style="padding: 16px 12px; text-align: left; font-size: 12px; color: #475569; text-transform: uppercase;">Date</th>
                                    <th style="padding: 16px 12px; text-align: left; font-size: 12px; color: #475569; text-transform: uppercase;">Client</th>
                                    <th style="padding: 16px 12px; text-align: left; font-size: 12px; color: #475569; text-transform: uppercase;">Contact</th>
                                    <th style="padding: 16px 12px; text-align: left; font-size: 12px; color: #475569; text-transform: uppercase;">Détails demande</th>
                                    <th style="padding: 16px 12px; text-align: center; font-size: 12px; color: #475569; text-transform: uppercase;">Statut</th>
                                    <th style="padding: 16px 12px; text-align: right; font-size: 12px; color: #475569; text-transform: uppercase;">Actions</th>
                                </tr>
                            </thead>
                            <tbody id="ddTableBody">
                                <tr><td colspan="6" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</td></tr>
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
        const q = query(collection(db, "quote_requests"), where("agency", "==", activeAgency));
        this.unsub = onSnapshot(q, (snapshot) => {
            this.requests = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
            this.requests.sort((a, b) => new Date(b.date) - new Date(a.date));
            this.renderTable();
        });
    },

    renderTable() {
        const tbody = document.getElementById('ddTableBody');
        if (!tbody) return;
        if (this.requests.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #64748b;">Aucune demande de devis en attente.</td></tr>';
            return;
        }
        tbody.innerHTML = this.requests.map(r => {
            const isTreated = r.status === 'TRAITÉ';
            let actions = `<button class="btn btn-outline btn-small" onclick="window.app.views.demandesDevis.deleteRequest('${r.id}')" title="Supprimer" style="color: #ef4444; border-color: #ef4444; padding: 6px;"><i class="fas fa-trash"></i></button>`;
            if (!isTreated) {
                actions = `<button class="btn btn-primary btn-small" onclick="window.app.views.demandesDevis.processRequest('${r.id}')" title="Marquer Traité" style="padding: 6px;"><i class="fas fa-file-signature"></i> Traiter</button> ${actions}`;
            }
            return `
                <tr style="border-bottom: 1px solid #f1f5f9; transition: background 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                    <td data-label="Date" style="padding: 14px 12px; font-weight: bold;">${r.date ? new Date(r.date).toLocaleDateString('fr-FR') : '-'}</td>
                    <td data-label="Client" style="padding: 14px 12px; font-weight: 600; color: #0f172a;">${r.client || '-'}</td>
                    <td data-label="Contact" style="padding: 14px 12px;">${r.phone || r.email || '-'}</td>
                    <td data-label="Détails" style="padding: 14px 12px; max-width: 300px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${r.details || ''}">${r.details || '-'}</td>
                    <td data-label="Statut" style="padding: 14px 12px; text-align: center;"><span class="badge ${isTreated ? 'badge-success' : 'badge-warning'}" style="padding: 4px 10px; border-radius: 12px; font-size: 11px;">${r.status || 'NOUVEAU'}</span></td>
                    <td data-label="Actions" style="padding: 14px 12px; text-align: right; display: flex; gap: 8px; justify-content: flex-end;">${actions}</td>
                </tr>
            `;
        }).join('');
    },
    async processRequest(id) {
        try {
            await updateDoc(doc(db, "quote_requests", id), { status: 'TRAITÉ' });
            this.app.showToast("Demande traitée. Redirection vers Nouveau Devis...", "success");
            setTimeout(() => this.app.renderPage('quote-new'), 1000);
        } catch(e) { this.app.showToast("Erreur", "error"); }
    },
    async deleteRequest(id) {
        if (window.AppModal) { if (!await window.AppModal.confirm("Supprimer cette demande ?", "Supprimer", true)) return; } else if (!confirm("Supprimer ?")) return;
        try { await deleteDoc(doc(db, "quote_requests", id)); this.app.showToast("Demande supprimée", "success"); } 
        catch(e) { this.app.showToast("Erreur suppression", "error"); }
    }
};