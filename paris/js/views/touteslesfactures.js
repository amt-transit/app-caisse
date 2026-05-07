import { db } from '../../../firebase-config.js';
import { collection, query, where, onSnapshot, doc, writeBatch, getDocs } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const ToutesLesFacturesView = {
    unsub: null,
    invoices: [],

    render(app) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.toutesLesFactures = this;

        const html = `
            <div class="quick-actions">
                <button class="btn btn-primary" onclick="app.renderPage('invoice-new')"><i class="fas fa-plus"></i> Nouvelle facture</button>
            </div>
            <div class="form-card" style="box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; flex-wrap: wrap; gap: 10px;">
                    <h3 style="margin: 0; font-size: 18px; color: #1e293b;"><i class="fas fa-file-invoice" style="color: #3b82f6;"></i> Historique des factures</h3>
                    <div class="form-group" style="margin: 0;">
                        <input type="text" id="tfSearchInput" placeholder="Rechercher (N°, Client)..." style="padding: 8px 12px; border-radius: 8px; border: 1px solid #cbd5e1; width: 250px; max-width: 100%;">
                    </div>
                </div>
                
                <div style="overflow-x: auto;">
                    <table class="data-table table-as-cards" style="width: 100%;">
                        <thead style="background: #f8fafc;">
                            <tr>
                                <th style="padding: 12px;">N° Facture</th>
                                <th>Client</th>
                                <th>Date</th>
                                <th style="text-align: right;">Montant Total</th>
                                <th style="text-align: right;">Reste à Payer</th>
                                <th style="text-align: center;">Statut</th>
                                <th style="text-align: center;">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="tfTableBody">
                            <tr><td colspan="7" style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Chargement des données...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        
        document.getElementById('contentContainer').innerHTML = html;
        document.getElementById('tfSearchInput').addEventListener('input', () => this.renderTable());

        this.loadData();
    },

    loadData() {
        if (this.unsub) this.unsub();
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
        
        // Requête pour récupérer les factures (transactions) de cette agence
        const q = query(collection(db, "transactions"), where("agency", "==", activeAgency), where("isDeleted", "==", false));
        
        this.unsub = onSnapshot(q, (snapshot) => {
            this.invoices = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
            // Tri par date décroissante (plus récent en haut)
            this.invoices.sort((a, b) => new Date(b.date) - new Date(a.date));
            this.renderTable();
        });
    },

    renderTable() {
        const tbody = document.getElementById('tfTableBody');
        if (!tbody) return;

        const term = (document.getElementById('tfSearchInput')?.value || '').toLowerCase().trim();
        const filtered = this.invoices.filter(inv => {
            if (!term) return true;
            return (inv.reference || '').toLowerCase().includes(term) || (inv.nom || '').toLowerCase().includes(term);
        });

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px; color: #64748b;">Aucune facture ne correspond à la recherche.</td></tr>';
            return;
        }

        tbody.innerHTML = filtered.map(inv => {
            // Conversion des CFA enregistrés vers l'Euro pour l'affichage Paris
            const TAUX = 656;
            const totalEUR = (parseFloat(inv.prix) || 0) / TAUX;
            const resteEUR = Math.abs(parseFloat(inv.reste) || 0) / TAUX;

            const isPayee = Math.abs(parseFloat(inv.reste) || 0) <= 0;
            const badgeClass = isPayee ? 'badge-success' : 'badge-warning';
            const statusText = isPayee ? 'Payée' : 'Impayée';

            return `
                <tr style="transition: background 0.2s;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='transparent'">
                    <td data-label="N° Facture" style="padding: 12px;"><strong>${inv.reference || '-'}</strong></td>
                    <td data-label="Client">${inv.nom || '-'}</td>
                    <td data-label="Date">${inv.date ? new Date(inv.date).toLocaleDateString('fr-FR') : '-'}</td>
                    <td data-label="Montant Total" style="text-align: right; font-weight: bold; color: #0f172a;">${this.app.formatMoney(totalEUR)}</td>
                    <td data-label="Reste à Payer" style="text-align: right; font-weight: bold; color: ${resteEUR > 0 ? '#ef4444' : '#10b981'};">${this.app.formatMoney(resteEUR)}</td>
                    <td data-label="Statut" style="text-align: center;"><span class="badge ${badgeClass}" style="padding: 4px 10px; border-radius: 12px; font-size: 11px;">${statusText}</span></td>
                    <td data-label="Actions" style="text-align: center;">
                        <button class="btn btn-danger btn-small" onclick="window.app.views.toutesLesFactures.deleteInvoice('${inv.id}', '${inv.reference}')" title="Supprimer la facture"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `;
        }).join('');
    },

    async deleteInvoice(id, ref) {
        if (window.AppModal) {
            if (!await window.AppModal.confirm("Voulez-vous vraiment supprimer cette facture ?\n\nCela supprimera également les expéditions associées (colis).", "Supprimer Facture", true)) return;
        } else {
            if (!confirm("Voulez-vous vraiment supprimer cette facture ?")) return;
        }

        try {
            const batch = writeBatch(db);
            
            // Supprimer la transaction
            batch.update(doc(db, "transactions", id), { isDeleted: true });
            
            // Supprimer la livraison / les colis associés à cette référence
            if (ref) {
                const livSnap = await getDocs(query(collection(db, "livraisons"), where("ref", "==", ref)));
                livSnap.forEach(docSnap => batch.delete(docSnap.ref));
            }

            await batch.commit();
            this.app.showToast("Facture supprimée avec succès !", "success");
        } catch (error) {
            console.error("Erreur suppression:", error);
            this.app.showToast("Erreur lors de la suppression.", "error");
        }
    }
};