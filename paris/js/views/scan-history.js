import { db } from '../../../firebase-config.js';
import { collection, query, where, getDocs, limit, orderBy } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

export const ScanHistoryView = {
    scans: [],

    render(app) {
        this.app = app;
        window.app.views = window.app.views || {};
        window.app.views.scanHistory = this;

        const html = `
            <style>
                .sh-page { max-width: 1200px; margin: 0 auto; animation: fadeIn 0.3s ease; }
                .sh-header { background: white; border-radius: 16px; padding: 20px 25px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #e2e8f0; margin-bottom: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); flex-wrap: wrap; gap: 15px; }
                .sh-header__icon { background: #f3e8ff; color: #9333ea; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border-radius: 14px; font-size: 28px; }
                .sh-header__title { margin: 0; font-size: 22px; font-weight: 800; color: #0f172a; }
                .sh-header__subtitle { margin: 4px 0 0 0; font-size: 13px; color: #64748b; }
                
                .sh-filters { display: flex; gap: 15px; margin-bottom: 20px; }
                .sh-input { flex: 1; padding: 10px 15px; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 14px; outline: none; }
                .sh-input:focus { border-color: #9333ea; box-shadow: 0 0 0 2px rgba(147, 51, 234, 0.1); }
                
                .sh-card { background: white; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.02); }
                .sh-table { width: 100%; border-collapse: collapse; }
                .sh-table th { text-align: left; padding: 15px 20px; background: #f8fafc; font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; }
                .sh-table td { padding: 15px 20px; border-bottom: 1px solid #f1f5f9; font-size: 14px; color: #334155; vertical-align: middle; }
                .sh-table tr:hover td { background: #f8fafc; }
                
                .tag-type { padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; }
                .tag-type--ent { background: #e0f2fe; color: #0284c7; }
                .tag-type--ctn { background: #ffedd5; color: #ea580c; }
            </style>

            <div class="sh-page">
                <div class="sh-header">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <div class="sh-header__icon"><i class="fas fa-barcode"></i></div>
                        <div>
                            <h1 class="sh-header__title">Historique des Scans</h1>
                            <p class="sh-header__subtitle">Traçabilité des opérations de numérisation (100 derniers scans)</p>
                        </div>
                    </div>
                    <button class="btn btn-outline" onclick="window.app.views.scanHistory.loadData()"><i class="fas fa-sync-alt"></i> Rafraîchir</button>
                </div>

                <div class="sh-filters">
                    <input type="text" class="sh-input" id="shSearch" placeholder="Rechercher une référence de code barre..." oninput="window.app.views.scanHistory.renderTable()">
                </div>

                <div class="sh-card">
                    <div style="overflow-x: auto;">
                        <table class="sh-table">
                            <thead>
                                <tr>
                                    <th>Date du Scan</th>
                                    <th>Code-Barres</th>
                                    <th>Type d'Opération</th>
                                    <th>Client / Destinataire</th>
                                </tr>
                            </thead>
                            <tbody id="shTableBody">
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

    async loadData() {
        const activeAgency = sessionStorage.getItem('currentActiveAgency') || 'paris';
        
        try {
            // On récupère les livraisons récentes pour en extraire l'historique des scans
            const q = query(collection(db, "livraisons"), where("agency", "==", activeAgency), orderBy("dateAjout", "desc"), limit(300));
            const snap = await getDocs(q);
            
            let allScans = [];
            snap.forEach(doc => {
                const data = doc.data();
                if (data.scanHistory && Array.isArray(data.scanHistory)) {
                    data.scanHistory.forEach(s => {
                        allScans.push({ ...s, client: data.destinataire || data.expediteur || 'Inconnu' });
                    });
                }
            });

            // Tri chronologique des scans
            allScans.sort((a, b) => new Date(b.date) - new Date(a.date));
            this.scans = allScans.slice(0, 100); // On garde les 100 derniers
            this.renderTable();
        } catch(e) { console.error(e); }
    },

    renderTable() {
        const term = document.getElementById('shSearch')?.value.toLowerCase().trim() || '';
        const tbody = document.getElementById('shTableBody');
        const filtered = this.scans.filter(s => (s.scanRef||'').toLowerCase().includes(term));

        if (filtered.length === 0) { tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 40px; color:#64748b;">Aucun scan trouvé.</td></tr>'; return; }

        tbody.innerHTML = filtered.map(s => `
            <tr>
                <td>${new Date(s.date).toLocaleString('fr-FR')}</td>
                <td style="font-family: monospace; font-weight: 800;">${s.scanRef}</td>
                <td><span class="tag-type ${s.type === 'ENTREPOT_PARIS' ? 'tag-type--ent' : 'tag-type--ctn'}">${s.type === 'ENTREPOT_PARIS' ? '📦 Entrepôt' : '🚢 Chargement'}</span></td>
                <td>${s.client}</td>
            </tr>
        `).join('');
    }
};