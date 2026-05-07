import { db } from '../../../firebase-config.js';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const TousLesRdvView = {
    unsub: null,
    appointments: [],
    filterMode: 'all', // 'all' ou 'pending'

    render(app, mode = 'all') {
        this.app = app;
        this.filterMode = mode;
        window.app.views = window.app.views || {};
        window.app.views.tousLesRdv = this;

        const title = mode === 'pending' ? 'Rendez-vous à valider' : 'Tous les Rendez-vous';
        const subtitle = mode === 'pending' ? 'Confirmez ou refusez les demandes en attente' : 'Gestion complète de votre planning';
        const icon = mode === 'pending' ? '⏳' : '📅';

        const html = `
            <div class="page">
                <!-- En-tête faon Yakri -->
                <div class="factures-header" style="background: white; border-radius: 16px; margin-bottom: 24px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                    <div class="factures-header__content" style="display: flex; align-items: center; gap: 20px; padding: 20px 24px; flex-wrap: wrap;">
                        <div class="factures-header__icon" style="font-size: 32px; background: #fef2f2; color: #ef4444; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 14px;">${icon}</div>
                        <div class="factures-header__info" style="flex: 1;">
                            <h1 class="factures-header__title" style="margin: 0; font-size: 22px; font-weight: 700; color: #0f172a;">${title}</h1>
                            <p class="factures-header__subtitle" style="margin: 4px 0 0 0; font-size: 13px; color: #64748b;">${subtitle}</p>
                        </div>
                        <button class="btn-create-invoice" onclick="app.renderPage('appointment-new')" style="background: #3b82f6; color: white; border: none; padding: 12px 20px; border-radius: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px;">
                            ➕ Nouveau RDV
                        </button>
                    </div>
                </div>

                <!-- Filtres -->
                <div class="factures-filters" style="display: flex; flex-wrap: wrap; gap: 16px; background: white; padding: 20px 24px; border-radius: 16px; border: 1px solid #e2e8f0; margin-bottom: 24px;">
                    <div class="filter-group filter-group--wide" style="flex: 2; min-width: 200px;">
                        <label class="filter-label" style="display: block; font-size: 11px; font-weight: 600; color: #64748b; margin-bottom: 6px; text-transform: uppercase;">🔍 Recherche client</label>
                        <input type="text" id="rdvSearchInput" class="filter-input" placeholder="Nom du client, téléphone..." style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 10px;">
                    </div>
                    <div class="filter-group" style="flex: 1; min-width: 150px; ${mode === 'pending' ? 'display:none;' : ''}">
                        <label class="filter-label" style="display: block; font-size: 11px; font-weight: 600; color: #64748b; margin-bottom: 6px; text-transform: uppercase;">💳 Statut</label>
                        <select id="rdvStatusFilter" class="filter-select" style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 10px;">
                            <option value="">Tous</option>
                            <option value="en_attente">En attente</option>
                            <option value="confirmé">Confirmé</option>
                            <option value="annulé">Annulé</option>
                        </select>
                    </div>
                    <div class="filter-group" style="flex: 1; min-width: 150px;">
                        <label class="filter-label" style="display: block; font-size: 11px; font-weight: 600; color: #64748b; margin-bottom: 6px; text-transform: uppercase;">📅 Date prévue</label>
                        <input type="date" id="rdvDateFilter" class="filter-input" style="width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 10px;">
                    </div>
                </div>

                <!-- Tableau -->
                <div class="factures-table-card" style="background: white; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden;">
                    <div class="table-wrap" style="overflow-x: auto;">
                        <table class="factures-table" style="width: 100%; border-collapse: collapse;">
                            <thead style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                                <tr>
                                    <th style="padding: 16px 12px; text-align: left; font-size: 12px; color: #475569; text-transform: uppercase;">Statut</th>
                                    <th style="padding: 16px 12px; text-align: left; font-size: 12px; color: #475569; text-transform: uppercase;">Date & Heure</th>
                                    <th style="padding: 16px 12px; text-align: left; font-size: 12px; color: #475569; text-transform: uppercase;">Client</th>
                                    <th style="padding: 16px 12px; text-align: left; font-size: 12px; color: #475569; text-transform: uppercase;">Contact / Adresse</th>
                                    <th style="padding: 16px 12px; text-align: left; font-size: 12px; color: #475569; text-transform: uppercase;">Notes</th>
                                    <th style="padding: 16px 12px; text-align: right; font-size: 12px; color: #475569; text-transform: uppercase;">Actions</th>
                                </tr>
                            </thead>
                            <tbody id="rdvTableBody">
                                <tr><td colspan="6" style="text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('contentContainer').innerHTML = html;
        
        document.getElementById('rdvSearchInput')?.addEventListener('input', () => this.renderTable());
        document.getElementById('rdvStatusFilter')?.addEventListener('change', () => this.renderTable());
        document.getElementById('rdvDateFilter')?.addEventListener('change', () => this.renderTable());

        this.loadData();
    },

    loadData() {
        if (this.unsub) this.unsub();
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
        
        const q = query(collection(db, "appointments"), where("agency", "==", activeAgency));
        
        this.unsub = onSnapshot(q, (snapshot) => {
            this.appointments = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
            this.appointments.sort((a, b) => new Date(a.date) - new Date(b.date)); // Tri chronologique
            this.renderTable();
            this.app.updateBadges(); // Mise à jour des badges dans la barre latérale
        });
    },

    renderTable() {
        const tbody = document.getElementById('rdvTableBody');
        if (!tbody) return;

        const term = (document.getElementById('rdvSearchInput')?.value || '').toLowerCase().trim();
        let status = document.getElementById('rdvStatusFilter')?.value || '';
        if (this.filterMode === 'pending') status = 'en_attente';
        const date = document.getElementById('rdvDateFilter')?.value;

        const filtered = this.appointments.filter(rdv => {
            if (term && !rdv.client.toLowerCase().includes(term) && !(rdv.tel || '').includes(term)) return false;
            if (status && rdv.status !== status) return false;
            if (date && rdv.date !== date) return false;
            return true;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 40px; color: #64748b;">Aucun rendez-vous ${this.filterMode === 'pending' ? 'en attente' : 'trouvé'}.</td></tr>`;
            return;
        }

        tbody.innerHTML = filtered.map(rdv => {
            const isPending = rdv.status === 'en_attente';
            const isConfirmed = rdv.status === 'confirmé';
            const badgeClass = isConfirmed ? 'badge-success' : (isPending ? 'badge-warning' : 'badge-danger');
            const statusText = isConfirmed ? 'Confirmé' : (isPending ? 'En attente' : 'Annulé');
            
            let actions = '';
            if (isPending) {
                actions = `
                    <button class="btn btn-success btn-small" onclick="window.app.views.tousLesRdv.changeStatus('${rdv.id}', 'confirmé')" title="Valider" style="padding: 6px; border-radius: 6px;"><i class="fas fa-check"></i></button>
                    <button class="btn btn-danger btn-small" onclick="window.app.views.tousLesRdv.changeStatus('${rdv.id}', 'annulé')" title="Refuser" style="padding: 6px; border-radius: 6px;"><i class="fas fa-times"></i></button>
                `;
            } else {
                actions = `<button class="btn btn-outline btn-small" onclick="window.app.views.tousLesRdv.deleteRdv('${rdv.id}')" title="Supprimer" style="padding: 6px; border-radius: 6px; color: #ef4444; border-color: #ef4444;"><i class="fas fa-trash"></i></button>`;
            }

            return `
                <tr style="border-bottom: 1px solid #f1f5f9; transition: background 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                    <td style="padding: 14px 12px;"><span class="badge ${badgeClass}" style="padding: 4px 10px; border-radius: 12px; font-size: 11px;">${statusText}</span></td>
                    <td style="padding: 14px 12px;"><strong>${rdv.date ? new Date(rdv.date).toLocaleDateString('fr-FR') : '-'}</strong><br><span style="color:#64748b; font-size:12px;">${rdv.time || 'Heure à définir'}</span></td>
                    <td style="padding: 14px 12px; font-weight: 600; color: #0f172a;">${rdv.client}</td>
                    <td style="padding: 14px 12px;">${rdv.tel || '-'}<br><span style="color:#64748b; font-size:11px;">${rdv.adresse || ''}</span></td>
                    <td style="padding: 14px 12px; font-size: 12px; color: #475569; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${rdv.notes || ''}">${rdv.notes || '-'}</td>
                    <td style="padding: 14px 12px; text-align: right; display: flex; gap: 8px; justify-content: flex-end;">${actions}</td>
                </tr>
            `;
        }).join('');
    },

    async changeStatus(id, newStatus) {
        try {
            await updateDoc(doc(db, "appointments", id), { status: newStatus });
            this.app.showToast(`Rendez-vous ${newStatus} !`, newStatus === 'confirmé' ? 'success' : 'info');
        } catch(e) { this.app.showToast("Erreur de mise à jour", "error"); }
    },

    async deleteRdv(id) {
        if (window.AppModal) {
            if (!await window.AppModal.confirm("Voulez-vous vraiment supprimer ce rendez-vous de l'historique ?", "Supprimer RDV", true)) return;
        } else if (!confirm("Supprimer ce rendez-vous ?")) return;

        try {
            await deleteDoc(doc(db, "appointments", id));
            this.app.showToast("Rendez-vous supprimé", "success");
        } catch(e) { this.app.showToast("Erreur de suppression", "error"); }
    }
};